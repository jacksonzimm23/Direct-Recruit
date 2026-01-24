const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const { generateToken } = require('../utils/jwt');
const { validateRegistration, validatePlayerProfile, validateCoachProfile, handleValidationErrors } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');
const { getSignedS3Url } = require('../utils/s3');
const cognito = require('../utils/cognito');

// Cookie configuration
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

// Helper to set auth cookie
function setAuthCookie(res, token) {
  res.cookie('token', token, COOKIE_OPTIONS);
}

// Helper function to convert S3 key to signed URL in profile
async function addSignedUrlToProfile(profile) {
  if (!profile) return profile;

  // Check if profile_image_url is an S3 key (starts with 'profiles/')
  if (profile.profile_image_url && profile.profile_image_url.startsWith('profiles/')) {
    try {
      profile.profile_image_url = await getSignedS3Url(profile.profile_image_url);
    } catch (error) {
      console.error('Error generating signed URL:', error);
      profile.profile_image_url = null;
    }
  }

  // Also check profile_picture_url for other profiles
  if (profile.profile_picture_url && profile.profile_picture_url.startsWith('profiles/')) {
    try {
      profile.profile_picture_url = await getSignedS3Url(profile.profile_picture_url);
    } catch (error) {
      console.error('Error generating signed URL for profile_picture_url:', error);
      profile.profile_picture_url = null;
    }
  }

  return profile;
}

// Register new user
router.post('/register', authLimiter, validateRegistration, handleValidationErrors, async (req, res) => {
  try {
    const { email, password, role } = req.body;

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

    // Create user in local database (without password)
    const user = await User.create({ email, role, cognitoSub: cognitoResult.userSub });
    const token = generateToken(user.id, user.role);

    setAuthCookie(res, token);

    res.status(201).json({
      message: 'User registered successfully. Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      },
      requiresVerification: !cognitoResult.userConfirmed
    });
  } catch (error) {
    console.error('Registration error:', error.name, error.message);
    console.error('Full error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  }
});

// Verify email with code from Cognito
router.post('/verify-email', authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;

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
        }
      });
    } else {
      res.json({ message: 'Email verified successfully' });
    }
  } catch (error) {
    console.error('Verification error:', error);
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
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await cognito.resendConfirmationCode(email);

    res.json({
      message: 'Verification code resent successfully',
      destination: result.destination
    });
  } catch (error) {
    console.error('Resend verification error:', error);
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
    const { email, password } = req.body;

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
        return res.status(401).json({ error: 'Please verify your email before logging in', requiresVerification: true });
      }
      if (cognitoError.name === 'UserNotFoundException') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      throw cognitoError;
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
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout - clear auth cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  });
  res.json({ message: 'Logged out successfully' });
});

// Forgot password - initiate reset
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await cognito.forgotPassword(email);

    res.json({
      message: 'Password reset code sent to your email',
      destination: result.destination
    });
  } catch (error) {
    console.error('Forgot password error:', error);
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
    const { email, code, newPassword } = req.body;

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
        console.log('Password check error (non-blocking):', signInError.name);
      }
    }

    await cognito.confirmForgotPassword(email, code, newPassword);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
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

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role,
        profile_completed: req.user.profile_completed,
        email_verified: req.user.email_verified,
        is_college_coach: isCollegeCoach,
        is_transfer_player: isTransferPlayer
      },
      profile
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user data' });
  }
});

module.exports = router;
