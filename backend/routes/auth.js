const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const jwt = require('jsonwebtoken');
const { generateToken } = require('../utils/jwt');
const { validateRegistration, validatePlayerProfile, validateCoachProfile, handleValidationErrors, normalizeEmail } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimit');
const { getSignedS3Url } = require('../utils/s3');
const cognito = require('../utils/cognito');
const { bumpRevokeCutoff } = require('../utils/tokenRevocation');
const logger = require('../utils/logger');
const pool = require('../config/database');
const Notification = require('../models/Notification');
const PipelineRecruit = require('../models/PipelineRecruit');
const { notifyUser } = require('../utils/notifications');

// Current Terms of Service / Privacy Policy version recorded at signup. Keep in
// sync with the "Last Updated" date shown in frontend/landingpage/terms-of-service.html
// and privacy-policy.html. Bump this string whenever those documents materially
// change so terms_accepted records reflect which version each user agreed to.
const TERMS_VERSION = '2026-06-18';

// Cookie configuration
// sameSite 'none' in prod (was 'strict'): the iOS Capacitor WKWebView does not reliably
// store/send a sameSite=strict auth cookie, so sign-in succeeded but the next request read as
// logged-out (lessons.md #9). 'none' requires secure:true, which is already set in prod. The web
// app is unaffected since requests are same-origin. localhost dev stays 'lax'.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year — see SESSION LIFETIME below
};

// SESSION LIFETIME
// There is no "Remember me". Signing up or signing in keeps you signed in until you
// explicitly sign out, which is what users expect from a social app. Mechanically:
//   - the cookie and the JWT (utils/jwt.js) both last 1 year
//   - GET /me slides that window forward (RENEW_AFTER_MS below), so a session that
//     is actually being used never expires; the year is only a backstop for a device
//     that is abandoned entirely
//   - sign-out / password change still kill every session immediately via
//     bumpRevokeCutoff (utils/tokenRevocation.js — its Redis TTL is pinned to this
//     same 1 year, do not let the two drift apart)
// On iOS the cookie is unreliable (WebView origin https://localhost calling
// directrecruit.net cross-origin), so persistence there rides on the Bearer token
// the app stores in localStorage. Both are issued together everywhere.
function setAuthCookie(res, token) {
  res.cookie('token', token, { ...COOKIE_OPTIONS });
}

// Reissue the token once it is older than this, so an in-use session rolls forward.
// Deliberately much shorter than the token's own life: it only needs to be short
// enough that any active user refreshes comfortably inside the year.
const RENEW_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Helper function to convert S3 key to signed URL in profile
async function addSignedUrlToProfile(profile) {
  if (!profile) return profile;

  // Check if profile_image_url is an S3 key (starts with 'profiles/')
  if (profile.profile_image_url && profile.profile_image_url.startsWith('profiles/')) {
    try {
      profile.profile_image_url = await getSignedS3Url(profile.profile_image_url);
    } catch (error) {
      logger.error('Error generating signed URL:', error);
      profile.profile_image_url = null;
    }
  }

  // Also check profile_picture_url for other profiles
  if (profile.profile_picture_url && profile.profile_picture_url.startsWith('profiles/')) {
    try {
      profile.profile_picture_url = await getSignedS3Url(profile.profile_picture_url);
    } catch (error) {
      logger.error('Error generating signed URL for profile_picture_url:', error);
      profile.profile_picture_url = null;
    }
  }

  return profile;
}

// Register new user
router.post('/register', authLimiter, validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, role, date_of_birth } = req.body;
    // validateRegistration has already enforced: DOB present + user is 13+,
    // and terms_accepted is truthy. Record acceptance metadata here.

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Register user in Cognito
    let cognitoResult;
    try {
      cognitoResult = await cognito.signUp(email, password, role);
    } catch (cognitoError) {
      if (cognitoError.name === 'UsernameExistsException') {
        return res.status(400).json({ error: 'Email already registered' });
      }
      if (cognitoError.name === 'InvalidPasswordException') {
        return res.status(400).json({ error: 'Password does not meet requirements. Must be at least 8 characters with uppercase, lowercase, numbers, and special characters.' });
      }
      throw cognitoError;
    }

    // Create user in local database (without password). Store the account-level
    // DOB (age gate) and the ToS/Privacy acceptance proof (timestamp, version, IP).
    const user = await User.create({
      email,
      role,
      cognitoSub: cognitoResult.userSub,
      dateOfBirth: date_of_birth,
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
      termsAcceptedIp: req.ip || null
    });

    // Backlink: if this email previously submitted via the public questionnaire,
    // tie all existing pool entries + submissions to this new account. Non-fatal —
    // registration still succeeds if the backlink UPDATE fails.
    try {
      await pool.query(
        `UPDATE pool_entries
            SET linked_player_user_id = $1
          WHERE LOWER(email) = LOWER($2) AND linked_player_user_id IS NULL`,
        [user.id, user.email]
      );
      await pool.query(
        `UPDATE questionnaire_submissions
            SET linked_player_user_id = $1
          WHERE LOWER(email) = LOWER($2) AND linked_player_user_id IS NULL`,
        [user.id, user.email]
      );
    } catch (linkErr) {
      logger.error('Questionnaire backlink failed during registration (non-fatal):', linkErr);
    }

    // Plan 8: fan out "DR Account Linked" notifications to every coach who
    // has this recruit in their active pipeline. Must run AFTER the
    // backlink UPDATEs above — the SELECT below depends on
    // pool_entries.linked_player_user_id being populated. Non-fatal: if
    // anything throws, registration still succeeds.
    try {
      const matched = await pool.query(
        `SELECT pe.id AS pool_entry_id,
                qs.submission_data->'personal'->>'first_name' AS first_name,
                qs.submission_data->'personal'->>'last_name'  AS last_name,
                qs.submitted_at
           FROM pool_entries pe
           LEFT JOIN questionnaire_submissions qs ON qs.id = pe.latest_submission_id
          WHERE pe.linked_player_user_id = $1
          ORDER BY qs.submitted_at DESC NULLS LAST`,
        [user.id]
      );
      if (matched.rows.length > 0) {
        const poolEntryIds = matched.rows.map(r => r.pool_entry_id);
        // Use most-recent submission's name; fall back to email local-part
        // if the name fields are missing or empty.
        const top = matched.rows[0];
        const fullName = `${(top.first_name || '').trim()} ${(top.last_name || '').trim()}`.trim() || user.email;
        const coachIds = await PipelineRecruit.findCoachesWithRecruit(poolEntryIds, user.id);
        for (const coachId of coachIds) {
          const notif = await Notification.create({
            userId: coachId,
            type: 'interaction',
            title: 'Recruit Joined Direct Recruit',
            message: `${fullName} just joined Direct Recruit — you can message them directly now.`,
            relatedUserId: user.id,
            relatedEntityId: user.id,
            relatedEntityType: 'dr_account_linked'
          });
          if (notif) notifyUser(req.app.get('io'), notif);
        }
      }
    } catch (notifyErr) {
      logger.error('DR account linked notification fan-out failed (non-fatal):', notifyErr);
    }

    const token = generateToken(user.id, user.role);

    setAuthCookie(res, token);

    res.status(201).json({
      message: 'User registered successfully. Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      requiresVerification: !cognitoResult.userConfirmed,
      // iOS Bearer fallback: the native WebView can't reliably re-attach the
      // cross-origin HttpOnly cookie (CapacitorHttp cookie-jar bug), so the app
      // stores this token and sends it as Authorization: Bearer. Web ignores it
      // and keeps using the cookie. authMiddleware accepts either (auth.js:25/86).
      token
    });
  } catch (error) {
    logger.error('Registration error:', error.name);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// Verify email with code from Cognito
router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!email || !code) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    await cognito.confirmSignUp(email, code);

    // Update local user record and auto-login
    const user = await User.findByEmail(email);
    if (user) {
      await User.markEmailVerified(user.id);

      // Generate token for auto-login
      const token = generateToken(user.id, user.role);

      setAuthCookie(res, token);

      res.json({
        message: 'Email verified successfully',
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          profile_completed: user.profile_completed
        },
        // iOS Bearer fallback (see /register note). Verify-then-pay auto-logs-in here.
        token
      });
    } else {
      res.json({ message: 'Email verified successfully' });
    }
  } catch (error) {
    logger.error('Verification error:', error);
    if (error.name === 'CodeMismatchException') {
      return res.status(400).json({ error: 'Invalid verification code' });
    }
    if (error.name === 'ExpiredCodeException') {
      return res.status(400).json({ error: 'Verification code has expired' });
    }
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Resend verification code
router.post('/resend-verification', authLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await cognito.resendConfirmationCode(email);

    res.json({
      message: 'Verification code resent successfully',
      destination: result.destination
    });
  } catch (error) {
    logger.error('Resend verification error:', error);
    if (error.name === 'UserNotFoundException') {
      return res.status(400).json({ error: 'User not found' });
    }
    if (error.name === 'InvalidParameterException') {
      return res.status(400).json({ error: 'User is already verified' });
    }
    if (error.name === 'LimitExceededException') {
      return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
    }
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
});

// Login
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    // Normalize to match how registration stored the email (and the Cognito
    // username). Without this, "Jacksonzimm@..." won't match the stored
    // "jacksonzimm@..." and login fails on a case-only difference.
    const email = normalizeEmail(req.body.email);

    // First check if user exists in local database
    const user = await User.findByEmail(email);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Authenticate with Cognito
    try {
      await cognito.signIn(email, password);
    } catch (cognitoError) {
      if (cognitoError.name === 'NotAuthorizedException') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      if (cognitoError.name === 'UserNotConfirmedException') {
        // Resend verification code so user has a fresh code
        try { await cognito.resendConfirmationCode(email); } catch (e) { /* ignore resend errors */ }

        // Determine profile subtype so the frontend can route to the correct verify-email page.
        // Important when a coach has completed profile creation + paid but bailed on email verification.
        let subtype = null;
        try {
          if (user.role === 'coach') {
            const coachProfile = await CoachProfile.findByUserId(user.id);
            if (coachProfile && coachProfile.college_division) subtype = 'collegecoach';
            else if (coachProfile) subtype = 'hscoach';
          } else if (user.role === 'player') {
            const playerProfile = await PlayerProfile.findByUserId(user.id);
            if (playerProfile) {
              if (playerProfile.transfer === 'y' || playerProfile.is_transfer_player) subtype = 'transferplayer';
              else if (playerProfile.college_division) subtype = 'collegeplayer';
              else subtype = 'hsplayer';
            }
          }
        } catch (e) {
          logger.warn('[login] failed to resolve profile subtype for unverified user:', e.message);
        }

        return res.status(401).json({
          error: 'Please verify your email before logging in',
          requiresVerification: true,
          email,
          role: user.role,
          subtype  // collegecoach | hscoach | hsplayer | collegeplayer | transferplayer | null
        });
      }
      if (cognitoError.name === 'UserNotFoundException') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      throw cognitoError;
    }

    // Block suspended users from getting a JWT (Fix #10). Checked AFTER Cognito
    // sign-in so we don't reveal suspension to attackers without valid creds.
    if (user.is_suspended) {
      return res.status(403).json({
        error: 'Your account has been suspended for violating community guidelines.',
        suspended: true
      });
    }

    await User.updateLastLogin(user.id);
    const token = generateToken(user.id, user.role);

    setAuthCookie(res, token);

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile_completed: user.profile_completed
      },
      // iOS Bearer fallback (see /register note). This is the call that was failing
      // on iOS — login set the cookie but the WebView couldn't re-attach it on the
      // next request; the app now stores this token and sends it as a Bearer header.
      token
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout - clear auth cookie + revoke all sessions for this user (security #24).
// Uses jwt.decode (no signature check) so a stale/garbage cookie still gets a
// clean 200 response — bumping the cutoff is opportunistic, clearing the cookie
// is mandatory.
router.post('/logout', async (req, res) => {
  try {
    // Accept the Bearer header as well as the cookie. The iOS app is Bearer-only
    // (the cross-origin cookie does not survive in the WKWebView), so reading the
    // cookie alone meant an iOS sign-out never bumped the revoke cutoff and the
    // token stayed valid server-side. That was survivable with 7-day tokens; with
    // 1-year tokens it is not.
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.userId) {
        await bumpRevokeCutoff(decoded.userId);
      }
    }
  } catch (err) {
    logger.error('Logout cutoff bump failed', { error: err.message });
    // fall through and still clear the cookie
  }
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    // Must match the sameSite used when setting the cookie, or the browser won't clear it.
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });
  res.json({ message: 'Logged out successfully' });
});

// Forgot password - initiate reset
router.post('/forgot-password', authLimiter, passwordResetLimiter, async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await cognito.forgotPassword(email);

    res.json({
      message: 'Password reset code sent to your email',
      destination: result.destination
    });
  } catch (error) {
    logger.error('Forgot password error:', error);
    if (error.name === 'UserNotFoundException') {
      // Don't reveal if user exists
      return res.json({ message: 'If an account exists with this email, a password reset code has been sent.' });
    }
    if (error.name === 'LimitExceededException') {
      return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
    }
    res.status(500).json({ error: 'Failed to initiate password reset' });
  }
});

// Reset password with code
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { code, newPassword } = req.body;
    const email = normalizeEmail(req.body.email);

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }

    // Check if new password is the same as current password by attempting sign-in
    try {
      await cognito.signIn(email, newPassword);
      // If sign-in succeeds, the new password is the same as the current one
      return res.status(400).json({ error: 'New password must be different from your current password' });
    } catch (signInError) {
      // NotAuthorizedException means password is different (which is what we want)
      // UserNotFoundException means user doesn't exist (will be caught by confirmForgotPassword)
      // Any other error, we proceed and let confirmForgotPassword handle it
      if (signInError.name !== 'NotAuthorizedException' && signInError.name !== 'UserNotFoundException') {
        logger.info('Password check error (non-blocking):', signInError.name);
      }
    }

    await cognito.confirmForgotPassword(email, code, newPassword);

    // Revoke all existing sessions for this user — they reset because they
    // were locked out (or compromised). Belt-and-suspenders. Security #24.
    try {
      const user = await User.findByEmail(email);
      if (user?.id) await bumpRevokeCutoff(user.id);
    } catch (revokeErr) {
      logger.error('Reset-password cutoff bump failed', { error: revokeErr.message });
    }

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    logger.error('Reset password error:', error);
    if (error.name === 'CodeMismatchException') {
      return res.status(400).json({ error: 'Invalid reset code' });
    }
    if (error.name === 'ExpiredCodeException') {
      return res.status(400).json({ error: 'Reset code has expired' });
    }
    if (error.name === 'InvalidPasswordException') {
      // Check if it's a same-password error (Cognito includes this in the message)
      const errorMessage = error.message || '';
      if (errorMessage.toLowerCase().includes('previous') ||
          errorMessage.toLowerCase().includes('same') ||
          errorMessage.toLowerCase().includes('history')) {
        return res.status(400).json({ error: 'New password must be different from your current password' });
      }
      return res.status(400).json({ error: 'Password does not meet requirements. Must be at least 8 characters with uppercase, lowercase, numbers, and special characters.' });
    }
    if (error.name === 'LimitExceededException') {
      return res.status(429).json({ error: 'Too many attempts. Please wait before trying again.' });
    }
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// Get current user info
router.get('/me', authMiddleware, async (req, res) => {
  try {
    let profile = null;
    let isCollegeCoach = false;
    let isTransferPlayer = false;

    if (req.user.role === 'player') {
      profile = await PlayerProfile.findByUserId(req.userId);
      // Check if player is in transfer portal (transfer = 'y')
      isTransferPlayer = profile && profile.transfer === 'y';
    } else if (req.user.role === 'coach') {
      profile = await CoachProfile.findByUserId(req.userId);
      // A coach is considered a college coach if they have a college_division
      // High school coaches won't have a division (FBS, FCS, D2, D3, NAIA, JUCO)
      isCollegeCoach = profile && profile.college_division && profile.college_division.trim() !== '' ? true : false;
    } else if (req.user.role === 'other') {
      profile = await OtherProfile.findByUserId(req.userId);
    }

    // Convert S3 key to signed URL for profile image
    profile = await addSignedUrlToProfile(profile);

    // Get subscription info
    const subInfo = await User.getSubscriptionInfo(req.user.id);

    // Disable browser caching so profile image updates are reflected immediately
    res.set('Cache-Control', 'no-store');

    // Sliding session. Every page calls /me on load, so this is the natural place to
    // roll the window forward: once the current token is older than RENEW_AFTER_MS,
    // mint a fresh one. A session in regular use therefore never expires, while an
    // abandoned one still lapses a year after its last use.
    //
    // Safe against revocation: authMiddleware already rejected the token via
    // isTokenRevoked() before we got here, so a signed-out token can never be
    // renewed back to life.
    const body = {
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        profile_completed: req.user.profile_completed,
        email_verified: req.user.email_verified,
        is_college_coach: isCollegeCoach,
        is_transfer_player: isTransferPlayer,
        subscription_status: subInfo?.subscription_status || 'none',
        subscription_tier: subInfo?.subscription_tier || null,
        // Push on/off state for the iOS settings toggle. Defaults true if the
        // column predates this user (NOT NULL DEFAULT true makes this rare).
        push_enabled: req.user.push_enabled !== false
      },
      profile
    };

    // req.tokenIat is seconds since epoch (JWT `iat`), set by authMiddleware.
    if (req.tokenIat && (Date.now() - req.tokenIat * 1000) > RENEW_AFTER_MS) {
      const renewedToken = generateToken(req.user.id, req.user.role);
      setAuthCookie(res, renewedToken);
      // iOS Bearer fallback: the app replaces its stored token with this one.
      // Web ignores it and keeps using the refreshed cookie.
      body.token = renewedToken;
    }

    res.json(body);
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

module.exports = router;
