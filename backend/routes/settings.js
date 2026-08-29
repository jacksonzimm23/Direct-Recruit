const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const PendingEmailChange = require('../models/PendingEmailChange');
const PendingPasswordReset = require('../models/PendingPasswordReset');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const cognito = require('../utils/cognito');
const email = require('../utils/email');
const { deleteFromS3, getSignedS3Url } = require('../utils/s3');
const { generateToken } = require('../utils/jwt');
const { bumpRevokeCutoff } = require('../utils/tokenRevocation');
const pool = require('../config/database');
const logger = require('../utils/logger');
const stripe = require('../utils/stripe');
const { normalizeEmail } = require('../middleware/validation');
const MATCH = require('../utils/match-constants'); // AI Fit-Matching allowlist Sets (Plan 4)

// Cookie configuration (mirrored from auth.js — keep sameSite AND maxAge in sync
// with auth.js). These routes reissue the auth cookie after an email change, a
// password change, and a profile-type switch; a shorter maxAge here would quietly
// downgrade a 1-year session to a short one the moment a user edits their account.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 365 * 24 * 60 * 60 * 1000 // 1 year
};

const SWITCH_COOLDOWN_HOURS = 72;

const PROFILE_TYPE_LABELS = {
  hsplayer: 'High School Player',
  collegeplayer: 'College Player',
  transferplayer: 'Transfer Player',
  hscoach: 'High School Coach',
  collegecoach: 'College Coach',
  other: 'Other'
};

const VALID_SUBTYPES = Object.keys(PROFILE_TYPE_LABELS);

// Get current account settings (email from database)
router.get('/account', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      email: user.email,
      emailVerified: user.email_verified
    });
  } catch (error) {
    logger.error('Get account settings error:', error);
    res.status(500).json({ error: 'Failed to fetch account settings' });
  }
});

// Update privacy settings (profile visibility, message permissions)
router.put('/privacy', authMiddleware, async (req, res) => {
  try {
    const { profile_visibility, message_permissions } = req.body;

    // Get current user to determine their role
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Validate profile_visibility
    const validVisibilities = ['everyone', 'private'];
    if (profile_visibility && !validVisibilities.includes(profile_visibility)) {
      return res.status(400).json({ error: 'Invalid profile visibility value' });
    }

    // Validate message_permissions (accept multiple formats for compatibility)
    const validPermissions = ['everyone', 'followers', 'connections', 'verified', 'none'];
    if (message_permissions && !validPermissions.includes(message_permissions)) {
      return res.status(400).json({ error: 'Invalid message permissions value' });
    }

    // Update the appropriate profile based on user role
    let updatedProfile = null;
    const updateData = {};

    if (profile_visibility) {
      updateData.profile_visibility = profile_visibility;
    }
    // Only include message_permissions if it's provided and not empty
    if (message_permissions && message_permissions.trim() !== '') {
      updateData.message_permissions = message_permissions;
    }

    // Only update if there's something to update
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid settings to update' });
    }

    if (user.role === 'player') {
      updatedProfile = await PlayerProfile.updatePrivacySettings(req.userId, updateData);
    } else if (user.role === 'coach') {
      updatedProfile = await CoachProfile.updatePrivacySettings(req.userId, updateData);
    } else if (user.role === 'other') {
      updatedProfile = await OtherProfile.updatePrivacySettings(req.userId, updateData);
    } else {
      return res.status(400).json({ error: 'Unknown user role' });
    }

    if (!updatedProfile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      message: 'Privacy settings updated successfully',
      profile_visibility: updatedProfile.profile_visibility,
      message_permissions: updatedProfile.message_permissions
    });
  } catch (error) {
    logger.error('Update privacy settings error:', error);
    res.status(500).json({ error: 'Failed to update privacy settings' });
  }
});

// Check if email is available (not already in use)
router.get('/email/check-availability', authMiddleware, async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email is already in use in our database
    const existingUser = await User.findByEmail(email);

    res.json({
      available: !existingUser,
      message: existingUser ? 'This email is already in use' : 'Email is available'
    });
  } catch (error) {
    logger.error('Check email availability error:', error);
    res.status(500).json({ error: 'Failed to check email availability' });
  }
});

// Initiate email change - verifies password and sends verification email via SES
// IMPORTANT: This does NOT change Cognito until verification is complete
router.post('/email/request-change', authMiddleware, authLimiter, async (req, res) => {
  try {
    const { password } = req.body;
    // Normalize so the stored email matches what login will look up later
    // (same normalization as registration/login). Validate format on the RAW
    // input first so a malformed entry is rejected before normalization.
    const rawEmail = req.body.newEmail;

    if (!rawEmail) {
      return res.status(400).json({ error: 'New email is required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required to change email' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const newEmail = normalizeEmail(rawEmail);

    // Check if email is already in use in our database
    const existingUser = await User.findByEmail(newEmail);
    if (existingUser) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Get current user's email
    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password by signing in with Cognito
    // This ONLY validates the password - does NOT change anything
    try {
      await cognito.signIn(currentUser.email, password);
    } catch (cognitoError) {
      if (cognitoError.name === 'NotAuthorizedException') {
        return res.status(401).json({ error: 'Invalid password' });
      }
      if (cognitoError.name === 'UserNotFoundException') {
        return res.status(401).json({ error: 'User not found in authentication system' });
      }
      if (cognitoError.name === 'UserNotConfirmedException') {
        return res.status(401).json({ error: 'Please verify your email first' });
      }
      throw cognitoError;
    }

    // Generate our own verification code
    const verificationCode = cognito.generateVerificationCode();

    // Store the pending email change in the database
    await PendingEmailChange.create(req.userId, currentUser.email, newEmail, verificationCode);

    // Send verification email via SES
    try {
      await email.sendEmailChangeVerification(newEmail, verificationCode);
    } catch (emailError) {
      logger.error('[Settings] Failed to send verification email:', emailError);
      // Clean up the pending change
      await PendingEmailChange.delete(req.userId);

      // Check if it's a SES sandbox restriction
      if (emailError.name === 'MessageRejected') {
        return res.status(400).json({
          error: 'Unable to send verification email. The email address may not be verified in SES sandbox.'
        });
      }
      throw emailError;
    }

    res.json({
      message: 'Verification code sent to new email',
      newEmail: newEmail
    });
  } catch (error) {
    logger.error('Email change request error:', error);
    res.status(500).json({ error: 'Failed to initiate email change' });
  }
});

// Verify email change with code
// ONLY after verification do we update Cognito and PostgreSQL
router.post('/email/verify-change', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    // Get current user
    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify the code against the pending change in our database
    const pendingChange = await PendingEmailChange.verifyCode(req.userId, code);
    if (!pendingChange) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // NOW update the email in Cognito using admin API
    // This happens ONLY after successful verification
    try {
      await cognito.adminUpdateUserEmail(pendingChange.current_email, pendingChange.new_email);
    } catch (cognitoError) {
      logger.error('Cognito email update error:', cognitoError.name);
      return res.status(500).json({ error: 'Failed to update email in authentication system' });
    }

    // Update email in PostgreSQL
    const updatedUser = await User.updateEmail(req.userId, pendingChange.new_email);

    // Delete the pending change record
    await PendingEmailChange.delete(req.userId);

    // Send confirmation email to the new address (non-blocking)
    email.sendEmailChangeConfirmation(pendingChange.new_email)
      .catch(err => logger.error('Failed to send confirmation email:', err.name));

    res.json({
      message: 'Email changed successfully',
      email: updatedUser.email
    });
  } catch (error) {
    logger.error('Email verification error:', error);
    res.status(500).json({ error: 'Failed to verify email change' });
  }
});

// Resend email change verification code
// Rate limited: 3 resends max, then 15-minute cooldown
router.post('/email/resend-code', authMiddleware, async (req, res) => {
  try {
    const MAX_RESENDS = 3;
    const COOLDOWN_MINUTES = 15;

    // Get the pending change for this user
    const pendingChange = await PendingEmailChange.findByUserId(req.userId);
    if (!pendingChange) {
      return res.status(400).json({ error: 'No pending email change found. Please start the process again.' });
    }

    // Check if user is in cooldown
    const cooldownStatus = await PendingEmailChange.isInCooldown(req.userId);
    if (cooldownStatus.inCooldown) {
      const cooldownEnd = new Date(cooldownStatus.cooldownUntil);
      const minutesRemaining = Math.ceil((cooldownEnd - new Date()) / (1000 * 60));
      return res.status(429).json({
        error: `Too many resend attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
        cooldownUntil: cooldownStatus.cooldownUntil,
        minutesRemaining
      });
    }

    // Check resend count
    const currentResendCount = pendingChange.resend_count || 0;
    if (currentResendCount >= MAX_RESENDS) {
      // Set cooldown
      await PendingEmailChange.setCooldown(req.userId, COOLDOWN_MINUTES);
      return res.status(429).json({
        error: `You've reached the maximum number of resend attempts. Please try again in ${COOLDOWN_MINUTES} minutes.`,
        cooldownUntil: new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000),
        minutesRemaining: COOLDOWN_MINUTES
      });
    }

    // Generate a new verification code
    const verificationCode = cognito.generateVerificationCode();

    // Update the pending change with new code and increment resend count
    await PendingEmailChange.updateCodeAndIncrementResend(req.userId, verificationCode);

    // Send new verification email via SES
    try {
      await email.sendEmailChangeVerification(pendingChange.new_email, verificationCode);
    } catch (emailError) {
      logger.error('Failed to resend verification email:', emailError.name);
      throw emailError;
    }

    const resendsRemaining = MAX_RESENDS - (currentResendCount + 1);
    res.json({
      message: 'Verification code resent',
      resendsRemaining
    });
  } catch (error) {
    logger.error('Resend code error:', error);
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
});

// Cancel pending email change
router.post('/email/cancel-change', authMiddleware, async (req, res) => {
  try {
    await PendingEmailChange.delete(req.userId);
    res.json({ message: 'Email change cancelled' });
  } catch (error) {
    logger.error('Cancel email change error:', error);
    res.status(500).json({ error: 'Failed to cancel email change' });
  }
});

// Change password (requires current password)
router.post('/password/change', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    // Validate password requirements
    const hasLength = newPassword.length >= 8;
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*]/.test(newPassword);

    if (!hasLength || !hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%^&*)'
      });
    }

    // Check if new password is the same as current password
    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'New password must be different from your current password' });
    }

    // Get current user's email
    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // First, verify current password by signing in with Cognito
    // This also gives us the access token needed for changePassword
    let cognitoTokens;
    try {
      cognitoTokens = await cognito.signIn(currentUser.email, currentPassword);
    } catch (cognitoError) {
      if (cognitoError.name === 'NotAuthorizedException') {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      if (cognitoError.name === 'UserNotFoundException') {
        return res.status(401).json({ error: 'User not found in authentication system' });
      }
      if (cognitoError.name === 'UserNotConfirmedException') {
        return res.status(401).json({ error: 'Please verify your email first' });
      }
      throw cognitoError;
    }

    // Now change the password using the access token
    try {
      await cognito.changePassword(cognitoTokens.accessToken, currentPassword, newPassword);
    } catch (cognitoError) {
      if (cognitoError.name === 'InvalidPasswordException') {
        return res.status(400).json({ error: 'New password does not meet requirements' });
      }
      if (cognitoError.name === 'LimitExceededException') {
        return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      }
      throw cognitoError;
    }

    // Revoke every existing session for this user (other devices, stolen
    // tokens, etc.), then re-issue a fresh cookie so the CURRENT tab keeps
    // working. The new token's iat is strictly after the cutoff we just wrote,
    // so it survives. Security #24.
    await bumpRevokeCutoff(req.userId);
    const newToken = generateToken(req.userId, currentUser.role);
    res.cookie('token', newToken, COOKIE_OPTIONS);

    // Send confirmation email (non-blocking)
    email.sendPasswordChangeConfirmation(currentUser.email)
      .catch(err => logger.error('Failed to send password change confirmation email:', err.name));

    // Return the rotated token so iOS (Bearer fallback) updates its stored token —
    // otherwise the password change would log iOS users out (their old token is
    // invalidated). Web ignores this and uses the refreshed cookie.
    res.json({ message: 'Password changed successfully', token: newToken });
  } catch (error) {
    logger.error('Password change error:', error.name);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// ==================== FORGOT PASSWORD (from settings page) ====================

// Initiate forgot password flow - sends verification email via SES
router.post('/password/forgot/request', authMiddleware, async (req, res) => {
  try {
    // Get current user's email
    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate verification code
    const verificationCode = cognito.generateVerificationCode();

    // Store the pending password reset in the database
    await PendingPasswordReset.create(req.userId, currentUser.email, verificationCode);

    // Send verification email via SES
    try {
      await email.sendPasswordResetVerification(currentUser.email, verificationCode);
    } catch (emailError) {
      logger.error('Failed to send password reset email:', emailError.name);
      // Clean up the pending reset
      await PendingPasswordReset.delete(req.userId);

      // Check if it's a SES sandbox restriction
      if (emailError.name === 'MessageRejected') {
        return res.status(400).json({
          error: 'Unable to send verification email. The email address may not be verified in SES sandbox.'
        });
      }
      throw emailError;
    }

    res.json({
      message: 'Verification code sent to your email',
      email: currentUser.email
    });
  } catch (error) {
    logger.error('Password reset request error:', error);
    res.status(500).json({ error: 'Failed to initiate password reset' });
  }
});

// Verify the password reset code
router.post('/password/forgot/verify', authMiddleware, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' });
    }

    // Verify the code against the pending reset in our database
    const pendingReset = await PendingPasswordReset.verifyCode(req.userId, code);
    if (!pendingReset) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    // Mark the code as verified so user can proceed to set new password
    await PendingPasswordReset.markVerified(req.userId);

    res.json({
      message: 'Code verified successfully',
      email: pendingReset.email
    });
  } catch (error) {
    logger.error('Password reset verify error:', error);
    res.status(500).json({ error: 'Failed to verify code' });
  }
});

// Set new password after SES verification - uses Cognito's forgot password flow
router.post('/password/forgot/set', authMiddleware, async (req, res) => {
  try {
    const { newPassword, cognitoCode } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    // Validate password requirements
    const hasLength = newPassword.length >= 8;
    const hasUpperCase = /[A-Z]/.test(newPassword);
    const hasLowerCase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecialChar = /[!@#$%^&*]/.test(newPassword);

    if (!hasLength || !hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
      return res.status(400).json({
        error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%^&*)'
      });
    }

    // Check if user has a verified pending reset
    const pendingReset = await PendingPasswordReset.isVerified(req.userId);
    if (!pendingReset) {
      return res.status(400).json({ error: 'No verified password reset found. Please restart the process.' });
    }

    // Check if new password is the same as current password
    try {
      await cognito.signIn(pendingReset.email, newPassword);
      // If sign-in succeeds, the new password is the same as the current one
      return res.status(400).json({ error: 'New password must be different from your current password' });
    } catch (signInError) {
      // NotAuthorizedException means password is different (which is what we want)
      // Password is different, continue
    }

    // If no Cognito code provided, initiate Cognito's forgot password to send code
    if (!cognitoCode) {
      try {
        await cognito.forgotPassword(pendingReset.email);

        return res.json({
          message: 'A verification code has been sent to your email',
          requiresCognitoCode: true,
          email: pendingReset.email
        });
      } catch (cognitoError) {

        if (cognitoError.name === 'LimitExceededException') {
          return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        }

        // Don't echo Cognito's raw message — log it server-side and return a generic string.
        logger.error('Forgot-password initiate failed:', { name: cognitoError.name, message: cognitoError.message });
        return res.status(400).json({ error: 'Failed to initiate password reset' });
      }
    }

    // Cognito code provided - complete the password reset
    try {
      await cognito.confirmForgotPassword(pendingReset.email, cognitoCode, newPassword);
    } catch (cognitoError) {

      const errorName = cognitoError.name || '';
      const errorMessage = (cognitoError.message || '').toLowerCase();

      if (errorName === 'CodeMismatchException') {
        return res.status(400).json({ error: 'Invalid verification code' });
      }

      if (errorName === 'ExpiredCodeException') {
        return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
      }

      if (errorName === 'InvalidPasswordException') {
        if (errorMessage.includes('previous') || errorMessage.includes('same') || errorMessage.includes('reuse')) {
          return res.status(400).json({ error: 'New password must be different from your current password' });
        }
        return res.status(400).json({ error: 'New password does not meet requirements' });
      }

      if (errorName === 'LimitExceededException') {
        return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
      }

      // Don't echo Cognito's raw message — log it server-side and return a generic string.
      logger.error('Forgot-password confirm failed:', { name: cognitoError.name, message: cognitoError.message });
      return res.status(400).json({ error: 'Failed to reset password' });
    }

    // Delete the pending reset record
    await PendingPasswordReset.delete(req.userId);

    // Revoke every existing session for this user, then re-issue a fresh
    // cookie so the CURRENT tab keeps working. Security #24.
    await bumpRevokeCutoff(req.userId);
    const newToken = generateToken(req.userId, req.user.role);
    res.cookie('token', newToken, COOKIE_OPTIONS);

    // Send confirmation email (non-blocking)
    email.sendPasswordChangeConfirmation(pendingReset.email)
      .catch(err => logger.error('Failed to send password reset confirmation email:', err.name));

    // Return rotated token for iOS Bearer fallback (see password-change note).
    res.json({ message: 'Password reset successfully', token: newToken });
  } catch (error) {
    logger.error('Password reset set error:', error.name);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Resend password reset verification code
// Rate limited: 3 resends max, then 15-minute cooldown
router.post('/password/forgot/resend', authMiddleware, async (req, res) => {
  try {
    const MAX_RESENDS = 3;
    const COOLDOWN_MINUTES = 15;

    // Get the pending reset for this user
    const pendingReset = await PendingPasswordReset.findByUserId(req.userId);
    if (!pendingReset) {
      return res.status(400).json({ error: 'No pending password reset found. Please start the process again.' });
    }

    // Check if user is in cooldown
    const cooldownStatus = await PendingPasswordReset.isInCooldown(req.userId);
    if (cooldownStatus.inCooldown) {
      const cooldownEnd = new Date(cooldownStatus.cooldownUntil);
      const minutesRemaining = Math.ceil((cooldownEnd - new Date()) / (1000 * 60));
      return res.status(429).json({
        error: `Too many resend attempts. Please try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
        cooldownUntil: cooldownStatus.cooldownUntil,
        minutesRemaining
      });
    }

    // Check resend count
    const currentResendCount = pendingReset.resend_count || 0;
    if (currentResendCount >= MAX_RESENDS) {
      // Set cooldown
      await PendingPasswordReset.setCooldown(req.userId, COOLDOWN_MINUTES);
      return res.status(429).json({
        error: `You've reached the maximum number of resend attempts. Please try again in ${COOLDOWN_MINUTES} minutes.`,
        cooldownUntil: new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000),
        minutesRemaining: COOLDOWN_MINUTES
      });
    }

    // Generate a new verification code
    const verificationCode = cognito.generateVerificationCode();

    // Update the pending reset with new code and increment resend count
    await PendingPasswordReset.updateCodeAndIncrementResend(req.userId, verificationCode);

    // Send new verification email via SES
    try {
      await email.sendPasswordResetVerification(pendingReset.email, verificationCode);
    } catch (emailError) {
      logger.error('Failed to resend password reset email:', emailError.name);
      throw emailError;
    }

    const resendsRemaining = MAX_RESENDS - (currentResendCount + 1);
    res.json({
      message: 'Verification code resent',
      resendsRemaining
    });
  } catch (error) {
    logger.error('Resend password reset code error:', error);
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
});

// Cancel pending password reset
router.post('/password/forgot/cancel', authMiddleware, async (req, res) => {
  try {
    await PendingPasswordReset.delete(req.userId);
    res.json({ message: 'Password reset cancelled' });
  } catch (error) {
    logger.error('Cancel password reset error:', error);
    res.status(500).json({ error: 'Failed to cancel password reset' });
  }
});

// ==================== EXPORT DATA (data portability / right of access) ====================

// Download a copy of all personal data we hold for the authenticated user, as a
// single JSON file. Satisfies the right of access + data portability under
// CCPA / Colorado CPA / GDPR Art.15 & 20. Only ever returns the requester's OWN
// data (every query is scoped to req.userId, or to the account email for rows
// that pre-date the account link, e.g. questionnaire submissions). S3 keys are
// resolved to time-limited signed URLs so the export is self-contained; media
// bytes themselves are not inlined.
router.get('/account/export', authMiddleware, async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const userEmail = user.email;

    // Helper: run a scoped query and return rows, swallowing "table doesn't
    // exist yet" so an export never 500s on an environment missing a migration.
    const safeRows = async (text, params) => {
      try {
        const r = await pool.query(text, params);
        return r.rows;
      } catch (err) {
        logger.warn(`Export query skipped (${err.code || err.name}): ${err.message}`);
        return [];
      }
    };

    // Helper: turn any S3 key on a row into a signed URL the user can download.
    const signKeys = async (rows, fields) => {
      for (const row of rows) {
        for (const f of fields) {
          const key = row[f];
          if (typeof key === 'string' && key && !/^https?:\/\//i.test(key)) {
            try { row[f] = await getSignedS3Url(key); }
            catch { /* leave the raw key if signing fails */ }
          }
        }
      }
      return rows;
    };

    // ---- Account ----
    const account = {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      last_login: user.last_login,
      email_verified: user.email_verified,
      profile_completed: user.profile_completed,
    };

    // ---- Profiles (only one of these exists per account) ----
    const [playerProfile] = await safeRows('SELECT * FROM player_profiles WHERE user_id = $1', [userId]);
    const [coachProfile] = await safeRows('SELECT * FROM coach_profiles WHERE user_id = $1', [userId]);
    const [otherProfile] = await safeRows('SELECT * FROM other_profiles WHERE user_id = $1', [userId]);
    if (playerProfile) await signKeys([playerProfile], ['profile_image_url', 'highlight_video_url']);
    if (coachProfile) await signKeys([coachProfile], ['profile_image_url']);

    // ---- Content the user created ----
    const posts = await signKeys(
      await safeRows('SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at', [userId]),
      [] // media_urls is an array; handled below
    );
    for (const p of posts) {
      if (Array.isArray(p.media_urls)) {
        p.media_urls = await Promise.all(p.media_urls.map(async (k) => {
          if (typeof k === 'string' && k && !/^https?:\/\//i.test(k)) {
            try { return await getSignedS3Url(k); } catch { return k; }
          }
          return k;
        }));
      }
    }
    const comments = await safeRows('SELECT * FROM post_comments WHERE user_id = $1 ORDER BY created_at', [userId]);
    // Highlights here are Hudl links (hudl_link), not uploaded S3 videos, so no signing needed.
    const highlights = await safeRows('SELECT * FROM player_highlights WHERE user_id = $1 ORDER BY created_at', [userId]);
    // Offers live as a TEXT/JSON column on player_profiles (captured in `profile`
    // above), so no separate offers table. Game stats are keyed by
    // player_profile_id, not user_id — join through the profile.
    const stats = await safeRows(
      `SELECT ps.* FROM player_stats ps
         JOIN player_profiles pp ON pp.id = ps.player_id
        WHERE pp.user_id = $1
        ORDER BY ps.created_at`,
      [userId]
    );

    // ---- Social graph ----
    const following = await safeRows('SELECT following_id, created_at FROM follows WHERE follower_id = $1', [userId]);
    const followers = await safeRows('SELECT follower_id, created_at FROM follows WHERE following_id = $1', [userId]);

    // ---- Messages the user sent (other participants' messages are theirs, not ours to export) ----
    const messages = await safeRows(
      'SELECT id, conversation_id, content, created_at FROM messages WHERE sender_id = $1 ORDER BY created_at',
      [userId]
    );

    // ---- Questionnaire submissions tied to this person (by account link OR email) ----
    const questionnaireSubmissions = await safeRows(
      `SELECT id, questionnaire_id, email, submission_data, submitted_at
         FROM questionnaire_submissions
        WHERE linked_player_user_id = $1 OR LOWER(email) = LOWER($2)
        ORDER BY submitted_at`,
      [userId, userEmail]
    );

    const exportData = {
      export_generated_at: new Date().toISOString(),
      notice: 'This file contains the personal data Direct Recruit holds for your account. Media links are time-limited and expire after a few hours; re-export to refresh them.',
      account,
      profile: playerProfile || coachProfile || otherProfile || null,
      posts,
      comments,
      highlights,
      stats,
      following,
      followers,
      messages_sent: messages,
      questionnaire_submissions: questionnaireSubmissions,
    };

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="direct-recruit-data-${stamp}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    logger.error('Data export error:', error);
    res.status(500).json({ error: 'Failed to export account data' });
  }
});

// ==================== DELETE ACCOUNT ====================

// Delete user account permanently
router.delete('/account/delete', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete account' });
    }

    // Get current user
    const currentUser = await User.findById(req.userId);
    if (!currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify password by signing in with Cognito
    try {
      await cognito.signIn(currentUser.email, password);
    } catch (cognitoError) {
      if (cognitoError.name === 'NotAuthorizedException') {
        return res.status(401).json({ error: 'Incorrect password' });
      }
      if (cognitoError.name === 'UserNotFoundException') {
        return res.status(401).json({ error: 'User not found in authentication system' });
      }
      throw cognitoError;
    }

    // Store email before deletion for sending confirmation
    const userEmail = currentUser.email;

    // Delete from Cognito FIRST (so we can fail gracefully if it doesn't work)
    try {
      await cognito.adminDeleteUser(userEmail);
    } catch (cognitoError) {
      // Only fail if it's not a "user not found" error (already deleted)
      if (cognitoError.name !== 'UserNotFoundException') {
        logger.error('Cognito deletion error:', cognitoError.name);
        return res.status(500).json({ error: 'Failed to delete account from authentication system' });
      }
      // User not found in Cognito is fine - continue with PostgreSQL deletion
    }

    // Clean up S3 files before database cascade delete
    try {
      const s3Keys = [];

      // Profile images + highlight videos
      const playerProfile = await pool.query(
        'SELECT profile_image_url, highlight_video_url FROM player_profiles WHERE user_id = $1', [req.userId]
      );
      if (playerProfile.rows[0]) {
        if (playerProfile.rows[0].profile_image_url) s3Keys.push(playerProfile.rows[0].profile_image_url);
        if (playerProfile.rows[0].highlight_video_url) s3Keys.push(playerProfile.rows[0].highlight_video_url);
      }
      const coachProfile = await pool.query(
        'SELECT profile_image_url FROM coach_profiles WHERE user_id = $1', [req.userId]
      );
      if (coachProfile.rows[0]?.profile_image_url) s3Keys.push(coachProfile.rows[0].profile_image_url);

      // Post media
      const posts = await pool.query(
        'SELECT media_urls FROM posts WHERE user_id = $1 AND media_urls IS NOT NULL', [req.userId]
      );
      for (const post of posts.rows) {
        if (post.media_urls) s3Keys.push(...post.media_urls);
      }

      // Highlight videos (uploaded separately)
      const highlights = await pool.query(
        'SELECT video_url FROM player_highlights WHERE user_id = $1 AND video_url IS NOT NULL', [req.userId]
      );
      for (const h of highlights.rows) {
        if (h.video_url) s3Keys.push(h.video_url);
      }

      // Transcript PDFs uploaded via the recruiting questionnaire. These live in
      // questionnaire_submissions.submission_data.academic.transcript_s3_keys (JSONB)
      // and are NOT covered by the table cascade (the row may belong to a coach's
      // recruiting record). Match by linked profile OR by the submission email so a
      // recruit's transcripts don't outlive their account (Privacy Policy §10). Read
      // BEFORE the DB delete — linked_player_user_id is ON DELETE SET NULL.
      const transcriptSubs = await pool.query(
        `SELECT submission_data FROM questionnaire_submissions
         WHERE linked_player_user_id = $1 OR LOWER(email) = LOWER($2)`,
        [req.userId, userEmail]
      );
      for (const sub of transcriptSubs.rows) {
        const keys = sub.submission_data?.academic?.transcript_s3_keys;
        if (Array.isArray(keys)) s3Keys.push(...keys);
      }

      // Delete all S3 files (non-blocking — don't fail account deletion if S3 cleanup fails)
      await Promise.allSettled(
        s3Keys.filter(key => key && (
            key.startsWith('profiles/') ||
            key.startsWith('post-media/') ||
            key.startsWith('highlights/') ||
            key.startsWith('transcripts/')
          ))
          .map(key => deleteFromS3(key))
      );
      logger.info(`Cleaned up ${s3Keys.length} S3 files for deleted account ${req.userId}`);
    } catch (s3Error) {
      logger.error('S3 cleanup error during account deletion:', s3Error);
      // Continue with account deletion even if S3 cleanup fails
    }

    // Erase questionnaire/pool PII before the DB cascade. A recruit's
    // questionnaire_submissions / pool_entries rows are owned by a coach's
    // team_questionnaire, so the user-table cascade does NOT remove them — the
    // FK is ON DELETE SET NULL, which would only null linked_player_user_id and
    // leave submission_data JSONB (name, contact, home address, GPA, parent /
    // guardian contacts) sitting in coaches' recruiting pools indefinitely.
    // That is the user's own PII, so on account deletion we hard-delete it,
    // matched by the linked profile OR the submission email (a recruit may have
    // submitted before ever creating an account). Required for a genuine
    // right-to-erasure (Privacy Policy §10 / CCPA / Colorado CPA / GDPR Art.17).
    //
    // Deleting questionnaire_submissions cascades to pool_entries
    // (pool_entries.latest_submission_id REFERENCES ... ON DELETE CASCADE) and
    // NULLs any pipeline_recruits.pool_entry_id (... ON DELETE SET NULL). A
    // pipeline row that was pool-sourced and has no DR account link then has no
    // remaining name source, so we hard-delete those nameless orphans too;
    // DR-account-linked pipeline rows survive (their name resolves from the
    // public DR profile, no PII leak) and are removed by the user-table cascade.
    // Best-effort — never block account deletion on this cleanup.
    try {
      // 1. Drop pool-only pipeline rows that depend on THIS person's pool entries
      //    for their name (no DR account link). Done first, while the pool
      //    entries still exist to match on, so we don't strand nameless rows.
      const orphanedPipeline = await pool.query(
        `DELETE FROM pipeline_recruits pr
          WHERE pr.linked_player_user_id IS NULL
            AND pr.pool_entry_id IN (
              SELECT id FROM pool_entries
               WHERE linked_player_user_id = $1 OR LOWER(email) = LOWER($2)
            )
          RETURNING pr.id`,
        [req.userId, userEmail]
      );

      // 2. Hard-delete the submissions (cascades to pool_entries). This is the
      //    row that actually holds the recruit's PII.
      const erasedSubs = await pool.query(
        `DELETE FROM questionnaire_submissions
          WHERE linked_player_user_id = $1 OR LOWER(email) = LOWER($2)
          RETURNING id`,
        [req.userId, userEmail]
      );

      logger.info(
        `Erased questionnaire PII for deleted account ${req.userId}: ` +
        `${erasedSubs.rowCount} submission(s), ${orphanedPipeline.rowCount} orphaned pipeline row(s)`
      );
    } catch (questionnaireErr) {
      logger.error('Questionnaire PII erasure error during account deletion:', questionnaireErr);
      // Continue with account deletion even if this cleanup fails
    }

    // Phase 4a: cancel Stripe subscription for web users before DB deletion.
    // Apple IAP / RevenueCat subs are user-managed through iOS Settings — we
    // can't cancel those from our backend. For Stripe subs, cascade delete
    // alone leaves an orphaned subscription in Stripe's dashboard that won't
    // charge (webhook has no user to update) but is untidy technical debt.
    try {
      const subInfo = await User.getSubscriptionInfo(req.userId);
      if (subInfo?.subscription_source === 'stripe' && subInfo.stripe_subscription_id) {
        await stripe.cancelSubscription(subInfo.stripe_subscription_id);
        logger.info(`Cancelled Stripe subscription ${subInfo.stripe_subscription_id} before deleting user ${req.userId}`);
      } else if (subInfo?.subscription_source === 'apple_iap') {
        logger.info(`User ${req.userId} has Apple IAP sub — not cancelling (Apple-managed)`);
      }
    } catch (cancelErr) {
      // Best-effort — never block deletion over a cancel failure
      logger.warn(`Failed to cancel subscription during deletion of user ${req.userId}: ${cancelErr.message}`);
    }

    // Archive any coach_signup_requests tied to this user's personal email so
    // the admin dashboard hides them and the partial UNIQUE on edu_email
    // (deleted_at IS NULL) lets the same person request access again later
    // with a fresh row. Also revokes any unused coach_invites tied to those
    // requests. Match is case-insensitive on personal_email since the request
    // form does not normalize that column at insert time.
    try {
      const archived = await pool.query(
        `UPDATE coach_signup_requests
            SET deleted_at = NOW()
          WHERE LOWER(personal_email) = LOWER($1)
            AND deleted_at IS NULL
          RETURNING id`,
        [userEmail]
      );
      if (archived.rows.length > 0) {
        await pool.query(
          `UPDATE coach_invites
              SET revoked_at = NOW()
            WHERE request_id = ANY($1::uuid[])
              AND used_at IS NULL AND revoked_at IS NULL`,
          [archived.rows.map(r => r.id)]
        );
        logger.info(`Archived ${archived.rows.length} coach_signup_request(s) for deleted account ${req.userId}`);
      }
    } catch (archiveErr) {
      logger.warn(`Failed to archive coach_signup_requests during account deletion: ${archiveErr.message}`);
    }

    // Delete from PostgreSQL (cascades to all related tables)
    await User.delete(req.userId);

    // Send goodbye email (non-blocking)
    email.sendAccountDeletionConfirmation(userEmail)
      .catch(err => logger.error('Failed to send account deletion email:', err.name));

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    logger.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

// ==================== PROFILE TYPE SWITCHING ====================

// Get current profile type info and available switch targets
router.get('/switch-profile/info', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get current profile
    let profile = null;
    if (user.role === 'player') {
      profile = await PlayerProfile.findByUserId(req.userId);
    } else if (user.role === 'coach') {
      profile = await CoachProfile.findByUserId(req.userId);
    } else if (user.role === 'other') {
      profile = await OtherProfile.findByUserId(req.userId);
    }

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const currentSubtype = User.getSubtypeFromProfile(user.role, profile);

    // Check cooldown
    let canSwitch = true;
    let cooldownRemainingHours = 0;
    if (user.last_profile_switch_at) {
      const lastSwitch = new Date(user.last_profile_switch_at);
      const hoursSince = (Date.now() - lastSwitch.getTime()) / (1000 * 60 * 60);
      if (hoursSince < SWITCH_COOLDOWN_HOURS) {
        canSwitch = false;
        cooldownRemainingHours = Math.ceil(SWITCH_COOLDOWN_HOURS - hoursSince);
      }
    }

    // Build targets (exclude current)
    const targets = VALID_SUBTYPES
      .filter(t => t !== currentSubtype)
      .map(t => ({
        type: t,
        label: PROFILE_TYPE_LABELS[t],
        // Platform paywall only → drives the PAID/FREE badge. Players are FREE.
        is_paid: User.PAID_TYPES.includes(t),
        // Free type that offers an optional paid add-on (AI Rep).
        has_addon: User.ADDON_TYPES.includes(t),
        // Which subscription tiers stay valid on this target. Mirrors the switch
        // ladder's targetAllowedTiers so the frontend's iOS Apple-billing warning
        // can ask "does my current plan carry over?" without duplicating the map.
        allowed_tiers: User.ALLOWED_TIERS_BY_SUBTYPE[t] || []
      }));

    // Shared fields for pre-fill
    const sharedFields = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: user.email,
      username: profile.username || user.username
    };

    // Athletics prefill — only when current profile is hsplayer or transferplayer.
    // Lets the user carry other_sports/track times across an hsplayer<->transferplayer switch.
    let currentAthletics = null;
    if (user.role === 'player' && ['hsplayer', 'transferplayer'].includes(currentSubtype)) {
      currentAthletics = {
        other_sports: Array.isArray(profile.other_sports) ? profile.other_sports : null,
        track_100m: profile.track_100m != null ? Number(profile.track_100m) : null,
        track_200m: profile.track_200m != null ? Number(profile.track_200m) : null
      };
    }

    // PFF Grade prefill — only when current profile is collegeplayer or transferplayer.
    // hsplayer has no PFF grade so the column is always NULL for them; never prefill.
    let currentPffGrade = null;
    if (user.role === 'player' && ['collegeplayer', 'transferplayer'].includes(currentSubtype)) {
      currentPffGrade = profile.pff_grade != null ? Number(profile.pff_grade) : null;
    }

    // Is the user actually on a paid plan RIGHT NOW? A player is a free account
    // that can hold the $10/mo AI Rep add-on, so the profile-type badge has to
    // follow the subscription, not the type. 'trialing' counts — the plan is
    // live during the 7-day trial.
    const holdsPaidSubscription = User.ENTITLED_SUB_STATUSES.includes(user.subscription_status);

    res.json({
      current_type: currentSubtype,
      current_label: PROFILE_TYPE_LABELS[currentSubtype],
      // PAID badge for the CURRENT profile. True when either the type itself is
      // paywalled (collegecoach) OR the user holds a live subscription (a player
      // on the AI Rep add-on). Without the second half, a paying player reads
      // "FREE" while being billed.
      is_current_paid: User.PAID_TYPES.includes(currentSubtype) || holdsPaidSubscription,
      // Raw signal so the frontend can refine the badge with Stripe's
      // cancel-at-period-end (a cancelled trial is heading back to free).
      holds_paid_subscription: holdsPaidSubscription,
      can_switch: canSwitch,
      cooldown_remaining_hours: cooldownRemainingHours,
      targets,
      shared_fields: sharedFields,
      current_athletics: currentAthletics,
      current_pff_grade: currentPffGrade
    });
  } catch (error) {
    logger.error('Get switch profile info error:', error);
    res.status(500).json({ error: 'Failed to fetch profile type info' });
  }
});

// Switch profile type
router.post('/switch-profile', authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const { target_type, profile_data, confirm } = req.body;

    // Validate request
    if (!confirm) {
      return res.status(400).json({ error: 'Confirmation required' });
    }
    if (!target_type || !VALID_SUBTYPES.includes(target_type)) {
      return res.status(400).json({ error: 'Invalid target profile type' });
    }
    if (!profile_data || typeof profile_data !== 'object') {
      return res.status(400).json({ error: 'Profile data is required' });
    }

    await client.query('BEGIN');

    // Lock the user row to prevent concurrent switches
    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1 FOR UPDATE',
      [req.userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    // Get current profile
    let oldProfile = null;
    if (user.role === 'player') {
      const r = await client.query('SELECT * FROM player_profiles WHERE user_id = $1', [req.userId]);
      oldProfile = r.rows[0];
    } else if (user.role === 'coach') {
      const r = await client.query('SELECT * FROM coach_profiles WHERE user_id = $1', [req.userId]);
      oldProfile = r.rows[0];
    } else if (user.role === 'other') {
      const r = await client.query('SELECT * FROM other_profiles WHERE user_id = $1', [req.userId]);
      oldProfile = r.rows[0];
    }

    if (!oldProfile) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Current profile not found' });
    }

    const currentSubtype = User.getSubtypeFromProfile(user.role, oldProfile);
    if (currentSubtype === target_type) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already on this profile type' });
    }

    // Check cooldown
    if (user.last_profile_switch_at) {
      const hoursSince = (Date.now() - new Date(user.last_profile_switch_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince < SWITCH_COOLDOWN_HOURS) {
        await client.query('ROLLBACK');
        return res.status(429).json({ error: `Profile switch cooldown active. Try again in ${Math.ceil(SWITCH_COOLDOWN_HOURS - hoursSince)} hours.` });
      }
    }

    const targetRole = User.getBaseRole(target_type);

    // ─── Invite gate for switches TO collegecoach ──────────────────────────────
    // Switching to College Coach requires a verified invite token (manual admin
    // approval based on a contact-form request). Switching FROM collegecoach to
    // any other type stays unrestricted.
    let inviteIdToConsume = null;
    let inviteToken = null;
    if (target_type === 'collegecoach') {
      inviteToken = req.body.inviteToken;
      if (!inviteToken) {
        await client.query('ROLLBACK');
        return res.status(403).json({
          error: 'Switching to College Coach requires verification. Request access from Settings → Profile Type.'
        });
      }
      const inv = await client.query(
        `SELECT i.id, i.school, i.division, r.personal_email
           FROM coach_invites i
           JOIN coach_signup_requests r ON r.id = i.request_id
           WHERE i.token = $1
             AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > NOW()
           FOR UPDATE OF i`,
        [inviteToken]
      );
      if (!inv.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'Invalid or expired invite' });
      }
      // SECURITY: invite must belong to THIS authenticated user (matches by email)
      if (inv.rows[0].personal_email && inv.rows[0].personal_email.toLowerCase() !== user.email.toLowerCase()) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'This invite is for a different account' });
      }
      // SECURITY: override school + division regardless of what frontend sent
      profile_data.team_name = inv.rows[0].school;
      profile_data.college_division = inv.rows[0].division;
      inviteIdToConsume = inv.rows[0].id;
    }
    // ────────────────────────────────────────────────────────────────────────────

    // Validate required fields for target type
    const validationError = validateProfileDataForType(target_type, profile_data);
    if (validationError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: validationError });
    }

    // Preserve data that carries over
    const preservedData = {
      first_name: profile_data.first_name || oldProfile.first_name,
      last_name: profile_data.last_name || oldProfile.last_name,
      profile_image_url: oldProfile.profile_image_url || oldProfile.profile_picture_url || null,
      followers_count: oldProfile.followers_count || 0,
      following_count: oldProfile.following_count || 0,
      profile_visibility: oldProfile.profile_visibility || 'everyone',
      message_permissions: oldProfile.message_permissions || 'everyone'
    };

    // Compute paid/free transition booleans (used here for Stripe ops AND
    // below for the response shape). Since 2026-07 only collegecoach is in
    // PAID_TYPES, so isTargetPaid is effectively `target_type === 'collegecoach'`.
    const isTargetPaid = User.PAID_TYPES.includes(target_type);
    const isSamePricePair = ['hsplayer', 'transferplayer'].includes(currentSubtype) &&
                            ['hsplayer', 'transferplayer'].includes(target_type);

    // Security #17: handle Stripe subscription transitions INSIDE the
    // transaction so a failed Stripe call rolls back the entire profile
    // switch instead of leaving the user with a free profile + an active
    // subscription.
    // Legacy and seeded rows can carry a stripe_subscription_id with a NULL
    // subscription_source (they predate the source column, and several seed
    // scripts write it that way). Treat those as Stripe — the same normalization
    // GET /subscription-status already does in payments.js. Without this they
    // satisfy neither isStripeSub nor isAppleOrCompSub and skip the ENTIRE
    // ladder, riding a stale entitlement into the new profile type.
    const isStripeSub = !!user.stripe_subscription_id &&
      (user.subscription_source === 'stripe' || !user.subscription_source);

    // Apple IAP and comp subscriptions can't be cancelled server-side (Apple:
    // only the user can, in iOS Settings; comp: nothing billed). If the current
    // tier isn't valid for the TARGET type, clear our entitlement columns so
    // the new profile is properly gated — otherwise the stale 'active' row
    // rides through the paywall on a type it never paid for. A still-billing
    // Apple sub can always re-activate later via the (product-validated)
    // restore/reconcile/webhook when the user returns to a matching type.
    // The frontend warns Apple users their billing continues until they cancel.
    const isAppleOrCompSub = user.subscription_source === 'apple_iap' || user.subscription_source === 'comp';
    const targetAllowedTiers = User.ALLOWED_TIERS_BY_SUBTYPE[target_type] || [];

    // Cancel an active Stripe sub the TARGET type can't use. We key this off the
    // subscription itself (status + whether the target allows the held tier), NOT
    // off whether the SOURCE type is in PAID_TYPES — hsplayer/transferplayer are
    // free types that can still hold an AI Rep subscription, so a source-type-based
    // guard would skip them and leave them billed forever. This mirrors the
    // Apple/comp branch below (subscription_status !== 'none' &&
    // !targetAllowedTiers.includes(subscription_tier)).
    const stripeSubUnusableOnTarget =
      isStripeSub &&
      user.subscription_status && user.subscription_status !== 'none' &&
      !targetAllowedTiers.includes(user.subscription_tier);

    if (stripeSubUnusableOnTarget && !isTargetPaid) {
      // → Free: cancel Stripe subscription + clear DB columns
      try {
        await stripe.cancelSubscription(user.stripe_subscription_id);
      } catch (stripeErr) {
        logger.error(`Stripe cancel failed during profile switch: ${stripeErr.message}`);
        const e = new Error('Subscription cancellation failed. Please try again or contact support.');
        e.code = 'STRIPE_CANCEL_FAILED';
        throw e;
      }
      await User.updateSubscription(req.userId, {
        subscriptionId: null,
        status: 'cancelled',
        tier: null,
        // Clear the source too, else the row keeps source='stripe' with a NULL
        // sub id — which makes isStripeSub read true again on the NEXT switch.
        source: null
      }, client);
    } else if (stripeSubUnusableOnTarget && isTargetPaid && !isSamePricePair) {
      // Held Stripe sub the target can't use, switching to a DIFFERENT paid product
      // (cross-type, e.g. an AI Rep $10 sub -> collegecoach $20+). Keyed off the
      // sub itself, not the source profile type, for the same reason as above.
      // Verify-then-pay: do NOT cancel the old Stripe sub at switch time — that
      // stripped access if the user abandoned the new payment. Instead:
      //   - set subscription_status='none' so the paywall makes them pay for the NEW product,
      //   - stash the OLD Stripe sub id in pending_cancel_stripe_sub_id, and
      //   - the payments webhook cancels that old sub once the NEW sub activates.
      // If they abandon, the old Stripe sub is still alive (no money lost) and the
      // stashed id lets support/a sweep reconcile it. No double-charge: they only
      // pay again once they actively subscribe to the new product on the paywall.
      await client.query(
        `UPDATE users
            SET subscription_status = 'none',
                subscription_tier = NULL,
                stripe_subscription_id = NULL,
                pending_cancel_stripe_sub_id = $1
          WHERE id = $2`,
        [user.stripe_subscription_id, req.userId]
      );
    } else if (
      isAppleOrCompSub &&
      user.subscription_status && user.subscription_status !== 'none' &&
      !targetAllowedTiers.includes(user.subscription_tier)
    ) {
      // Apple/comp entitlement that doesn't fit the target type (paid→free,
      // cross-type paid→paid, or a stale row from before validation existed):
      // clear it. hsplayer↔transferplayer naturally keeps theirs ('player' is
      // valid for both). Note: for Apple, this does NOT stop their billing —
      // only the user can cancel, in Settings > Apple ID > Subscriptions.
      await User.updateSubscription(req.userId, {
        subscriptionId: null,
        status: 'none',
        tier: null,
        source: null
      }, client);
    }
    // hsplayer ↔ transferplayer (same $10 price / same IAP product): keep
    // subscription, no action. Free → Paid: no current sub to cancel; frontend
    // redirects to checkout / the paywall.

    // Archive coach_signup_requests when switching AWAY from collegecoach so
    // the approval row is hidden from the admin dashboard and the user can
    // request collegecoach access again later via a fresh row. Match by
    // existing_user_id (switch-originated requests) OR by personal_email
    // (covers requests created before the user row existed, then later linked).
    if (currentSubtype === 'collegecoach' && target_type !== 'collegecoach') {
      const archived = await client.query(
        `UPDATE coach_signup_requests
            SET deleted_at = NOW()
          WHERE deleted_at IS NULL
            AND (existing_user_id = $1 OR LOWER(personal_email) = LOWER($2))
          RETURNING id`,
        [req.userId, user.email]
      );
      if (archived.rows.length > 0) {
        await client.query(
          `UPDATE coach_invites
              SET revoked_at = NOW()
            WHERE request_id = ANY($1::uuid[])
              AND used_at IS NULL AND revoked_at IS NULL`,
          [archived.rows.map(r => r.id)]
        );
        logger.info(`Archived ${archived.rows.length} coach_signup_request(s) during switch-away from collegecoach for user ${req.userId}`);
      }
    }

    // Plan 5A: capture old team_name BEFORE the DELETE so the auto-cancel
    // hook below (right before COMMIT) can compare normalized old vs new
    // school_key. Null if the switching user wasn't a coach.
    let preSwitchTeamName = null;
    if (user.role === 'coach') {
      const oldCp = await client.query(
        `SELECT team_name FROM coach_profiles WHERE user_id = $1`,
        [req.userId]
      );
      preSwitchTeamName = (oldCp.rows[0] && oldCp.rows[0].team_name) || null;
    }

    // Delete old profile row (CASCADE handles player_games/player_game_stats)
    if (user.role === 'player') {
      await client.query('DELETE FROM player_profiles WHERE user_id = $1', [req.userId]);
    } else if (user.role === 'coach') {
      await client.query('DELETE FROM coach_profiles WHERE user_id = $1', [req.userId]);
    } else if (user.role === 'other') {
      await client.query('DELETE FROM other_profiles WHERE user_id = $1', [req.userId]);
    }

    // Update users.role and cooldown timestamp
    await client.query(
      'UPDATE users SET role = $1, last_profile_switch_at = CURRENT_TIMESTAMP WHERE id = $2',
      [targetRole, req.userId]
    );

    // Update users.username if provided in profile_data.
    //
    // This path bypasses express-validator (it uses the hand-rolled check in
    // validateProfileData below), so it has to normalise for itself. Lowercase
    // to stay consistent with the lower(username) unique indexes (migration 054)
    // and with every other write path.
    if (profile_data.username) {
      const normalizedUsername = String(profile_data.username).trim().toLowerCase();
      // Check username uniqueness across all four tables that carry a UNIQUE
      // username constraint, excluding this user's own rows.
      const usernameCheck = await client.query(
        `SELECT 1 FROM users            WHERE lower(username) = $1 AND id      != $2
         UNION ALL
         SELECT 1 FROM player_profiles  WHERE lower(username) = $1 AND user_id != $2
         UNION ALL
         SELECT 1 FROM coach_profiles   WHERE lower(username) = $1 AND user_id != $2
         UNION ALL
         SELECT 1 FROM other_profiles   WHERE lower(username) = $1 AND user_id != $2
         LIMIT 1`,
        [normalizedUsername, req.userId]
      );
      if (usernameCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'That username is already taken. Please choose another.' });
      }
      profile_data.username = normalizedUsername;
      await client.query('UPDATE users SET username = $1 WHERE id = $2', [normalizedUsername, req.userId]);
    }

    // Create new profile row
    if (targetRole === 'player') {
      const collegeDivision = ['collegeplayer', 'transferplayer'].includes(target_type)
        ? (profile_data.college_division || null) : null;
      const transfer = target_type === 'transferplayer' ? 'y' : null;

      // Athletics — only persisted for hsplayer + transferplayer (collegeplayer
      // has no Athletics fields on its form). Inline-validate here since this
      // endpoint uses validateProfileDataForType() instead of express-validator.
      const isAthleticsTarget = ['hsplayer', 'transferplayer'].includes(target_type);
      const otherSports = (isAthleticsTarget
          && Array.isArray(profile_data.other_sports)
          && profile_data.other_sports.length)
        ? profile_data.other_sports
            .filter(s => typeof s === 'string' && s.length > 0 && s.length <= 100)
            .slice(0, 20)
        : null;
      const parseTrack = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n <= 0 || n >= 100) return null;
        return Math.round(n * 100) / 100;
      };
      const track100 = isAthleticsTarget ? parseTrack(profile_data.track_100m) : null;
      const track200 = isAthleticsTarget ? parseTrack(profile_data.track_200m) : null;

      // PFF Grade — collegeplayer + transferplayer only (hsplayer has no PFF).
      // NULL = not reported. Reject any value outside 0-100 or with > 1 decimal.
      const isPffTarget = ['collegeplayer', 'transferplayer'].includes(target_type);
      const parsePffGrade = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0 || n > 100) return null;
        return Math.round(n * 10) / 10;
      };
      const pffGrade = isPffTarget ? parsePffGrade(profile_data.pff_grade) : null;

      // AI Fit-Matching fields (Plan 4) — already allowlist/range-validated by
      // validateProfileDataForType above. TEXT[] arrays pass raw; fit_preferences
      // is JSONB → JSON.stringify (or '{}'). Mirrors PlayerProfile.create().
      const pd = profile_data;
      const fitPrefsPlayer = pd.fit_preferences != null ? JSON.stringify(pd.fit_preferences) : '{}';

      // Recruiting contact fields — hsplayer + transferplayer only (collegeplayer
      // has none on its form). DOB applies to all. parent_guardians JSONB → string.
      const isContactTarget = ['hsplayer', 'transferplayer'].includes(target_type);
      const guardians = (isContactTarget && Array.isArray(pd.parent_guardians))
        ? pd.parent_guardians.slice(0, 4)
        : [];

      await client.query(
        `INSERT INTO player_profiles
        (user_id, first_name, last_name, username, date_of_birth, team_name, state, graduation_year,
         position, height, weight, gpa, college_division, conference, number, eligibility,
         transfer, bio, profile_image_url, followers_count, following_count,
         profile_visibility, message_permissions,
         other_sports, track_100m, track_200m, pff_grade,
         sat_score, act_score, weighted_gpa, has_ap_ib, ap_ib_count, class_rank, intended_major,
         home_zip, needs_financial_aid, needs_scholarship, pell_or_first_gen, levels_open,
         preferred_regions, preferred_campus_setting, fit_preferences,
         phone, gender, address, city, zip, coach_name, coach_email, coach_phone, parent_guardians)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
         $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42,
         $43, $44, $45, $46, $47, $48, $49, $50, $51)`,
        [
          req.userId,
          preservedData.first_name,
          preservedData.last_name,
          profile_data.username,
          profile_data.date_of_birth,
          profile_data.team_name,
          profile_data.state,
          profile_data.graduation_year || null,
          profile_data.position,
          profile_data.height || null,
          profile_data.weight || null,
          profile_data.gpa || null,
          collegeDivision,
          profile_data.conference || null,
          profile_data.number || null,
          profile_data.eligibility || null,
          transfer,
          profile_data.bio || null,
          preservedData.profile_image_url,
          preservedData.followers_count,
          preservedData.following_count,
          preservedData.profile_visibility,
          preservedData.message_permissions,
          otherSports,
          track100,
          track200,
          pffGrade,
          pd.sat_score ?? null,
          pd.act_score ?? null,
          pd.weighted_gpa ?? null,
          pd.has_ap_ib ?? null,
          pd.ap_ib_count ?? null,
          pd.class_rank ?? null,
          pd.intended_major ?? null,
          pd.home_zip ?? null,
          pd.needs_financial_aid ?? null,
          pd.needs_scholarship ?? null,
          pd.pell_or_first_gen ?? null,
          pd.levels_open ?? null,
          pd.preferred_regions ?? null,
          pd.preferred_campus_setting ?? null,
          fitPrefsPlayer,
          isContactTarget ? (pd.phone || null) : null,
          isContactTarget ? (pd.gender || null) : null,
          isContactTarget ? (pd.address || null) : null,
          isContactTarget ? (pd.city || null) : null,
          isContactTarget ? (pd.zip || null) : null,
          isContactTarget ? (pd.coach_name || null) : null,
          isContactTarget ? (pd.coach_email || null) : null,
          isContactTarget ? (pd.coach_phone || null) : null,
          JSON.stringify(guardians)
        ]
      );
    } else if (targetRole === 'coach') {
      const collegeDivision = target_type === 'collegecoach'
        ? (profile_data.college_division || null) : null;

      // AI Fit-Matching "Program Profile" / "Program Fit" fields (Plan 4) — only
      // collegecoach has these; hscoach stores NULLs. Already validated above.
      // TEXT[] arrays pass raw; fit_preferences JSONB → JSON.stringify (or '{}').
      const isCollegeCoach = target_type === 'collegecoach';
      const cd = profile_data;
      const coachFit = (v) => isCollegeCoach ? (v ?? null) : null;
      const fitPrefsCoach = (isCollegeCoach && cd.fit_preferences != null)
        ? JSON.stringify(cd.fit_preferences) : '{}';

      await client.query(
        `INSERT INTO coach_profiles
        (user_id, first_name, last_name, username, date_of_birth, team_name, college_division,
         position_title, state, phone, bio, conference, profile_image_url,
         followers_count, following_count, profile_visibility, message_permissions,
         admitted_gpa_min, admitted_gpa_max, test_optional, sat_min, sat_max, act_min, act_max,
         top_programs, football_player_majors, affordability_band, offers_athletic_aid,
         aid_generosity, campus_setting, distance_profile, hs_tier_recruited, fit_preferences)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
         $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33)`,
        [
          req.userId,
          preservedData.first_name,
          preservedData.last_name,
          profile_data.username,
          profile_data.date_of_birth,
          profile_data.team_name,
          collegeDivision,
          profile_data.position_title,
          profile_data.state,
          profile_data.phone || null,
          profile_data.bio || null,
          profile_data.conference || null,
          preservedData.profile_image_url,
          preservedData.followers_count,
          preservedData.following_count,
          preservedData.profile_visibility,
          preservedData.message_permissions,
          coachFit(cd.admitted_gpa_min),
          coachFit(cd.admitted_gpa_max),
          coachFit(cd.test_optional),
          coachFit(cd.sat_min),
          coachFit(cd.sat_max),
          coachFit(cd.act_min),
          coachFit(cd.act_max),
          coachFit(cd.top_programs),
          coachFit(cd.football_player_majors),
          coachFit(cd.affordability_band),
          coachFit(cd.offers_athletic_aid),
          coachFit(cd.aid_generosity),
          coachFit(cd.campus_setting),
          coachFit(cd.distance_profile),
          coachFit(cd.hs_tier_recruited),
          fitPrefsCoach
        ]
      );
    } else if (targetRole === 'other') {
      await client.query(
        // "Other" profiles store the avatar in profile_picture_url, NOT
        // profile_image_url (see models/OtherProfile.js). Prod's other_profiles
        // has no profile_image_url column, so inserting into it 500s on EC2.
        `INSERT INTO other_profiles
        (user_id, first_name, last_name, username, date_of_birth, bio, profile_picture_url,
         followers_count, following_count, profile_visibility, message_permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          req.userId,
          preservedData.first_name,
          preservedData.last_name,
          profile_data.username,
          profile_data.date_of_birth,
          profile_data.bio || null,
          preservedData.profile_image_url,
          preservedData.followers_count,
          preservedData.following_count,
          preservedData.profile_visibility,
          preservedData.message_permissions
        ]
      );
    }

    // Log the switch in history with audit metadata
    await client.query(
      `INSERT INTO profile_switch_history
        (user_id, from_role, from_subtype, to_role, to_subtype, invite_token, source)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [req.userId, user.role, currentSubtype, targetRole, target_type, inviteToken, 'switch']
    );

    // Consume the invite ONLY after the switch transaction succeeds. Inside the same
    // transaction so the consumption rolls back if anything later fails.
    if (inviteIdToConsume) {
      await client.query('UPDATE coach_invites SET used_at = NOW() WHERE id = $1', [inviteIdToConsume]);
    }

    // Plan 5A + cross-school redaction. When a coach's normalized school_key
    // changes (including coach → non-coach where new key is null):
    //   1. Auto-cancel pending inbound hand-offs (Plan 5A).
    //   2. Redact pool-sourced pipeline rows — recruits the coach pulled from
    //      the old school's questionnaire pool. Coach's own grade + DR profile
    //      link survive; questionnaire data is stripped, pool_entry_id is
    //      nulled, and other coaches' evaluations are dropped from the chain.
    //   3. Redact pool-sourced personal-board entries — same data scrub.
    //      Orphan entries with no DR account fallback are removed entirely.
    //   4. Drop the coach from every shared group at the old school. Same-
    //      school invite rules already prevent NEW cross-school memberships;
    //      this enforces the rule on switch too. Ownership auto-transfers if
    //      the leaver was the owner.
    //
    // Wrapped in try/catch so a redaction failure doesn't roll back the whole
    // switch — but on success, every change above is in the same transaction
    // as the profile flip below.
    try {
      const TeamQuestionnaire = require('../models/TeamQuestionnaire');
      const PipelineHandoff = require('../models/PipelineHandoff');
      const PipelineRecruit = require('../models/PipelineRecruit');
      const RecruitingBoard = require('../models/RecruitingBoard');
      const BoardGroup = require('../models/BoardGroup');
      const newTeamName = (targetRole === 'coach') ? (profile_data.team_name || null) : null;
      const oldKey = TeamQuestionnaire.normalizeSchoolKey(preSwitchTeamName);
      const newKey = TeamQuestionnaire.normalizeSchoolKey(newTeamName);
      if (oldKey !== newKey) {
        // (1) Existing Plan 5A handoff cleanup.
        await PipelineHandoff.autoCancelForRecipient(client, req.userId, newKey);

        // (2) Pipeline redaction. Only meaningful when oldKey is non-null
        //     (the coach actually had a previous school). For a brand-new
        //     coach (oldKey null) there's nothing to redact.
        if (oldKey) {
          await PipelineRecruit.redactPoolSourcedAtOldSchool(client, req.userId, oldKey, newKey);

          // (3) Personal board redaction. Player JSONB entries on every
          //     personal board the coach owns are scrubbed in place.
          await RecruitingBoard.redactPoolSourcedFromPersonalBoards(client, req.userId);

          // (4) Shared-group cleanup. Find every group the coach is in that
          //     belongs to the old school, and drop the coach. The owner's
          //     coach_profiles.team_name is the proxy for the group's school
          //     (same-school invite enforcement guarantees every member
          //     shares one key, so the owner's school = the group's school).
          //
          //     Special case: when the switching coach IS the owner, their
          //     own coach_profiles row has ALREADY been replaced with the
          //     new school by this point in the transaction (DELETE at
          //     line ~1166, INSERT a few lines later). So a school_key
          //     filter on the owner row would miss groups they own. The
          //     `OR bg.owner_user_id = $1` clause catches those — the only
          //     groups a coach can own are at their old school anyway
          //     (they can't have created a group at the new school before
          //     arriving via this switch).
          const oldSchoolGroups = await client.query(
            `SELECT DISTINCT bg.id
               FROM board_groups bg
               JOIN board_group_members bgm ON bgm.group_id = bg.id AND bgm.user_id = $1
               LEFT JOIN coach_profiles ocp ON ocp.user_id = bg.owner_user_id
              WHERE bg.owner_user_id = $1
                 OR LOWER(TRIM(ocp.team_name)) = $2`,
            [req.userId, oldKey]
          );
          for (const g of oldSchoolGroups.rows) {
            await BoardGroup.removeMemberWithOwnerTransfer(client, g.id, req.userId);
          }
        }
      }
    } catch (e) {
      logger.error('Cross-school redaction hook failed (settings.switch-profile):', e);
    }

    await client.query('COMMIT');

    // Issue new JWT with updated role
    const newToken = generateToken(req.userId, targetRole);
    res.cookie('token', newToken, COOKIE_OPTIONS);

    // Determine redirect URL
    const folderMap = {
      hsplayer: 'hsplayer', collegeplayer: 'collegeplayer', transferplayer: 'transferplayer',
      hscoach: 'hscoach', collegecoach: 'collegecoach', other: 'other'
    };
    const folder = folderMap[target_type];
    const mainpage = target_type.includes('coach')
      ? `mainpage-${target_type.replace('hs', 'hs').replace('college', 'college')}.html`
      : `mainpage-${target_type === 'other' ? 'other' : target_type.replace('player', 'player')}.html`;

    // Subscription transitions already handled atomically inside the
    // transaction (security #17). All that's left is to compute the response
    // shape — `requires_payment` controls whether the frontend redirects to
    // Stripe Checkout next. `isTargetPaid` and `isSamePricePair` were declared
    // in the transaction block above and are still in scope.
    //
    // Since 2026-07 this reduces to `target_type === 'collegecoach'`: players are
    // free, so switching TO hsplayer/transferplayer never demands payment. The
    // AI Rep add-on is bought from the AI Rep paywall modal, not from a switch.
    // (!isSamePricePair is now redundant — a same-price player pair can never be
    // isTargetPaid — but it is kept as cheap insurance if players ever return to
    // PAID_TYPES. If you delete it, delete the isSamePricePair declaration too.)
    const requiresPayment = isTargetPaid && !isSamePricePair;

    res.json({
      success: true,
      new_type: target_type,
      new_role: targetRole,
      is_paid: isTargetPaid,
      requires_payment: requiresPayment,
      payment_profile_type: requiresPayment ? target_type : null,
      redirect_folder: folder,
      // Rotated token carries the NEW role — iOS (Bearer fallback) MUST update its
      // stored token here or it keeps sending the old-role token after a switch.
      // Web uses the refreshed cookie. (Also resolves the post-switch JWT staleness.)
      token: newToken,
      message: requiresPayment
        ? `Profile switched to ${PROFILE_TYPE_LABELS[target_type]}. Please complete payment to activate your account.`
        : `Profile switched to ${PROFILE_TYPE_LABELS[target_type]} successfully.`
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Switch profile error:', error);
    // Security #17: surface Stripe-cancel failures distinctly so the user
    // knows their subscription wasn't cancelled (rather than the generic
    // "switch failed" message).
    if (error.code === 'STRIPE_CANCEL_FAILED') {
      return res.status(502).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to switch profile type' });
  } finally {
    client.release();
  }
});

// --- AI Fit-Matching inline validators (Plan 4) ---
// The switch endpoint uses this custom validator instead of express-validator,
// so we re-check the fit fields here in the same inline style. All fit fields
// are OPTIONAL — validate ONLY when present. Mirrors backend/middleware/validation.js.
function _isBlank(v) { return v === null || v === undefined || v === ''; }
function _numInRange(v, lo, hi) {
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= lo && n <= hi;
}
function _intInRange(v, lo, hi) {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n >= lo && n <= hi;
}
// Returns an error string, or null if the fit fields are valid.
function validateFitFieldsForType(targetType, data) {
  const inAllowlist = (v, set, label) => {
    if (_isBlank(v)) return null;
    const items = Array.isArray(v) ? v : [v];
    for (const item of items) { if (!set.has(item)) return `Invalid ${label}: ${item}`; }
    return null;
  };
  const targetRole = User.getBaseRole(targetType);

  if (targetRole === 'player') {
    if (!_isBlank(data.weighted_gpa) && !_numInRange(data.weighted_gpa, 0, 6)) return 'Weighted GPA must be between 0 and 6';
    if (!_isBlank(data.sat_score) && !_intInRange(data.sat_score, 400, 1600)) return 'SAT score must be between 400 and 1600';
    if (!_isBlank(data.act_score) && !_intInRange(data.act_score, 1, 36)) return 'ACT score must be between 1 and 36';
    if (!_isBlank(data.ap_ib_count) && !_intInRange(data.ap_ib_count, 0, 40)) return 'AP/IB count must be between 0 and 40';
    if (!_isBlank(data.class_rank) && String(data.class_rank).length > 50) return 'Class rank must be 50 characters or less';
    if (!_isBlank(data.home_zip) && !/^\d{5}$/.test(String(data.home_zip))) return 'Home ZIP must be a 5-digit code';
    if (Array.isArray(data.intended_major) && data.intended_major.length > 3) return 'Select at most 3 majors';
    let err =
      inAllowlist(data.intended_major, MATCH.VALID_MAJORS, 'major') ||
      inAllowlist(data.needs_financial_aid, MATCH.VALID_YES_NO_UNSURE, 'financial aid option') ||
      inAllowlist(data.needs_scholarship, MATCH.VALID_YES_NO_UNSURE, 'scholarship option') ||
      inAllowlist(data.levels_open, MATCH.VALID_LEVELS, 'level') ||
      inAllowlist(data.preferred_regions, MATCH.VALID_REGIONS, 'region') ||
      // Player field: allows the explicit 'no-preference' answer too.
      inAllowlist(data.preferred_campus_setting, MATCH.VALID_PLAYER_CAMPUS_PREFERENCES, 'campus setting');
    if (err) return err;
    const fp = data.fit_preferences;
    if (fp != null) {
      if (typeof fp !== 'object' || Array.isArray(fp)) return 'fit_preferences must be an object';
      for (const k of ['importance_playing_time', 'importance_close_to_home', 'importance_academics_vs_football', 'importance_competition_level']) {
        if (!_isBlank(fp[k]) && !_intInRange(fp[k], 1, 5)) return 'Importance must be between 1 and 5';
      }
      if (fp.looking_for_text != null && String(fp.looking_for_text).length > 280) return 'looking_for_text must be 280 characters or less';
    }
  } else if (targetType === 'collegecoach') {
    if (!_isBlank(data.admitted_gpa_min) && !_numInRange(data.admitted_gpa_min, 0, 4)) return 'Admitted GPA must be between 0 and 4';
    if (!_isBlank(data.admitted_gpa_max) && !_numInRange(data.admitted_gpa_max, 0, 4)) return 'Admitted GPA must be between 0 and 4';
    for (const k of ['sat_min', 'sat_max']) { if (!_isBlank(data[k]) && !_intInRange(data[k], 400, 1600)) return 'SAT score must be between 400 and 1600'; }
    for (const k of ['act_min', 'act_max']) { if (!_isBlank(data[k]) && !_intInRange(data[k], 1, 36)) return 'ACT score must be between 1 and 36'; }
    let err =
      inAllowlist(data.top_programs, MATCH.VALID_MAJORS, 'major') ||
      inAllowlist(data.football_player_majors, MATCH.VALID_MAJORS, 'major') ||
      inAllowlist(data.affordability_band, MATCH.VALID_AFFORDABILITY_BANDS, 'affordability band') ||
      inAllowlist(data.offers_athletic_aid, MATCH.VALID_ATHLETIC_AID_OPTIONS, 'athletic aid option') ||
      inAllowlist(data.aid_generosity, MATCH.VALID_AID_GENEROSITY, 'aid generosity') ||
      inAllowlist(data.campus_setting, MATCH.VALID_CAMPUS_SETTINGS, 'campus setting') ||
      inAllowlist(data.distance_profile, MATCH.VALID_DISTANCE_PROFILES, 'distance profile') ||
      inAllowlist(data.hs_tier_recruited, MATCH.VALID_HS_TIERS, 'HS tier');
    if (err) return err;
    const fp = data.fit_preferences;
    if (fp != null) {
      if (typeof fp !== 'object' || Array.isArray(fp)) return 'fit_preferences must be an object';
      if (!_isBlank(fp.dev_vs_plug_and_play) && !_intInRange(fp.dev_vs_plug_and_play, 1, 5)) return 'Development vs plug-and-play must be between 1 and 5';
      err =
        inAllowlist(fp.roster_pct_on_aid, MATCH.VALID_ROSTER_PCT_ON_AID, 'roster % on aid') ||
        inAllowlist(fp.offensive_scheme, MATCH.VALID_SCHEMES_OFFENSE, 'offensive scheme') ||
        inAllowlist(fp.defensive_scheme, MATCH.VALID_SCHEMES_DEFENSE, 'defensive scheme') ||
        inAllowlist(fp.academic_support, MATCH.VALID_ACADEMIC_SUPPORT, 'academic support') ||
        inAllowlist(fp.affiliation, MATCH.VALID_AFFILIATIONS, 'affiliation');
      if (err) return err;
      if (fp.great_fit_text != null && String(fp.great_fit_text).length > 280) return 'great_fit_text must be 280 characters or less';
    }
  }
  return null;
}

// Validate required fields for a target profile type
function validateProfileDataForType(targetType, data) {
  const targetRole = User.getBaseRole(targetType);

  // Normalise in place BEFORE testing, so the emptiness check and the regex
  // agree. They previously disagreed: the first trimmed, the second did not, so
  // "bob " passed one and failed the other. Lowercasing here also keeps this
  // path consistent with usernameField() in middleware/validation.js.
  if (typeof data.username === 'string') {
    data.username = data.username.trim().toLowerCase();
  }
  if (!data.username || data.username.length === 0) {
    return 'Username is required';
  }
  if (!/^[a-z0-9_]{3,15}$/.test(data.username)) {
    return 'Username must be 3-15 characters, lowercase letters, numbers, and underscores only';
  }

  // DOB required for ALL target types (App Store age rating).
  if (!data.date_of_birth) return 'Date of birth is required';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date_of_birth))) return 'Date of birth must be a valid date';
  {
    const d = new Date(String(data.date_of_birth) + 'T00:00:00Z');
    if (isNaN(d.getTime()) || d.getUTCFullYear() < 1900 || d.getTime() > Date.now()) {
      return 'Date of birth must be a valid past date';
    }
  }

  if (targetRole === 'player') {
    if (!data.team_name) return 'Team/school name is required';
    if (!data.state) return 'State is required';
    if (!data.position) return 'Position is required';
    if (!data.height) return 'Height is required';
    if (!data.weight) return 'Weight is required';
    if (!data.graduation_year) return 'Graduation year is required';

    if (['collegeplayer', 'transferplayer'].includes(targetType)) {
      if (!data.college_division) return 'College division is required';
    }

    // Recruiting contact fields — required on hsplayer + transferplayer only.
    if (['hsplayer', 'transferplayer'].includes(targetType)) {
      if (!data.gender || !['Male', 'Female'].includes(data.gender)) return 'Gender is required';
      if (!data.address) return 'Mailing address is required';
      if (!data.city) return 'City is required';
      if (!data.zip || !/^\d{5}(-\d{4})?$/.test(String(data.zip))) return 'A valid ZIP code is required';
      if (!data.phone) return 'Phone number is required';
      if (!data.coach_name) return 'Coach name is required';
      if (!data.coach_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.coach_email))) return 'A valid coach email is required';
      if (!data.coach_phone) return 'Coach phone is required';
      // parent_guardians is optional (0-4); validate shape only when present.
      if (data.parent_guardians != null) {
        if (!Array.isArray(data.parent_guardians) || data.parent_guardians.length > 4) {
          return 'At most 4 parent/guardians allowed';
        }
      }
    }
  } else if (targetRole === 'coach') {
    if (!data.team_name) return 'Team/school name is required';
    if (!data.state) return 'State is required';
    if (!data.position_title) return 'Coaching position is required';

    if (targetType === 'collegecoach') {
      if (!data.college_division) return 'College division is required';
    }
  }
  // 'other' has no required fields beyond username

  // AI Fit-Matching fields (Plan 4) — all optional, validated only when present.
  const fitError = validateFitFieldsForType(targetType, data);
  if (fitError) return fitError;

  return null;
}

module.exports = router;
