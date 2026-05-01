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
const { deleteFromS3 } = require('../utils/s3');
const { generateToken } = require('../utils/jwt');
const { bumpRevokeCutoff } = require('../utils/tokenRevocation');
const pool = require('../config/database');
const logger = require('../utils/logger');
const stripe = require('../utils/stripe');

// Cookie configuration (mirrored from auth.js)
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
    const { newEmail, password } = req.body;

    if (!newEmail) {
      return res.status(400).json({ error: 'New email is required' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Password is required to change email' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

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

    res.json({ message: 'Password changed successfully' });
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

        return res.status(400).json({ error: cognitoError.message || 'Failed to initiate password reset' });
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

      return res.status(400).json({ error: cognitoError.message || 'Failed to reset password' });
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

    res.json({ message: 'Password reset successfully' });
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

      // Delete all S3 files (non-blocking — don't fail account deletion if S3 cleanup fails)
      await Promise.allSettled(
        s3Keys.filter(key => key && key.startsWith('profiles/') || key.startsWith('post-media/') || key.startsWith('highlights/'))
          .map(key => deleteFromS3(key))
      );
      logger.info(`Cleaned up ${s3Keys.length} S3 files for deleted account ${req.userId}`);
    } catch (s3Error) {
      logger.error('S3 cleanup error during account deletion:', s3Error);
      // Continue with account deletion even if S3 cleanup fails
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
        is_paid: User.PAID_TYPES.includes(t)
      }));

    // Shared fields for pre-fill
    const sharedFields = {
      first_name: profile.first_name,
      last_name: profile.last_name,
      email: user.email,
      username: profile.username || user.username
    };

    res.json({
      current_type: currentSubtype,
      current_label: PROFILE_TYPE_LABELS[currentSubtype],
      is_current_paid: User.PAID_TYPES.includes(currentSubtype),
      can_switch: canSwitch,
      cooldown_remaining_hours: cooldownRemainingHours,
      targets,
      shared_fields: sharedFields
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
    // below for the response shape).
    const isCurrentPaid = User.PAID_TYPES.includes(currentSubtype);
    const isTargetPaid = User.PAID_TYPES.includes(target_type);
    const isSamePricePair = ['hsplayer', 'transferplayer'].includes(currentSubtype) &&
                            ['hsplayer', 'transferplayer'].includes(target_type);

    // Security #17: handle Stripe subscription transitions INSIDE the
    // transaction so a failed Stripe call rolls back the entire profile
    // switch instead of leaving the user with a free profile + an active
    // subscription. Apple IAP users (subscription_source='apple_iap') are
    // skipped because we cannot cancel via Stripe — the column stores a
    // RevenueCat transaction id. Apple users have to cancel via iOS Settings;
    // the RevenueCat webhook will reconcile.
    //
    // FOLLOW-UP (out of scope for #17): an Apple IAP user switching from a
    // paid coach profile to a free profile keeps paying for an unused sub.
    // Need a frontend "cancel via iOS Settings first" gate or a server-side
    // check that warns them.
    const isStripeSub = user.subscription_source === 'stripe' && user.stripe_subscription_id;

    // Stripe path: cancel sub and clear our DB columns. Both ops are inside
    // the transaction so a Stripe failure rolls back the whole switch.
    //
    // Apple IAP path: do nothing. We can't cancel via Stripe (the column
    // stores a RevenueCat txid). Leaving the DB row untouched means the user
    // keeps subscription_status='active' / source='apple_iap' until they
    // cancel via iOS Settings — at which point the RevenueCat webhook fires
    // CANCELLATION and reconciles. Trade-off: if they don't cancel via iOS,
    // they keep paying for an unused sub. Surfacing this to the user before
    // the switch is a frontend UX follow-up, out of scope for #17.
    if (isStripeSub && isCurrentPaid && !isTargetPaid) {
      // Paid → Free: cancel Stripe subscription + clear DB columns
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
        tier: null
      }, client);
    } else if (isStripeSub && isTargetPaid && isCurrentPaid && !isSamePricePair) {
      // Paid → different Paid: cancel old Stripe sub, frontend will start a new one
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
        status: 'none',
        tier: null
      }, client);
    }
    // hsplayer ↔ transferplayer (same $10 price): keep subscription, no action.
    // Free → Paid: no current sub to cancel; frontend redirects to checkout.
    // Apple IAP user switching anywhere: DB columns untouched, webhook reconciles.

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

    // Update users.username if provided in profile_data
    if (profile_data.username) {
      // Check username uniqueness
      const usernameCheck = await client.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [profile_data.username, req.userId]
      );
      if (usernameCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Username already taken' });
      }
      await client.query('UPDATE users SET username = $1 WHERE id = $2', [profile_data.username, req.userId]);
    }

    // Create new profile row
    if (targetRole === 'player') {
      const collegeDivision = ['collegeplayer', 'transferplayer'].includes(target_type)
        ? (profile_data.college_division || null) : null;
      const transfer = target_type === 'transferplayer' ? 'y' : null;

      await client.query(
        `INSERT INTO player_profiles
        (user_id, first_name, last_name, username, team_name, state, graduation_year,
         position, height, weight, gpa, college_division, conference, number, eligibility,
         transfer, bio, profile_image_url, followers_count, following_count,
         profile_visibility, message_permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)`,
        [
          req.userId,
          preservedData.first_name,
          preservedData.last_name,
          profile_data.username,
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
          preservedData.message_permissions
        ]
      );
    } else if (targetRole === 'coach') {
      const collegeDivision = target_type === 'collegecoach'
        ? (profile_data.college_division || null) : null;

      await client.query(
        `INSERT INTO coach_profiles
        (user_id, first_name, last_name, username, team_name, college_division,
         position_title, state, phone, bio, conference, profile_image_url,
         followers_count, following_count, profile_visibility, message_permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          req.userId,
          preservedData.first_name,
          preservedData.last_name,
          profile_data.username,
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
          preservedData.message_permissions
        ]
      );
    } else if (targetRole === 'other') {
      await client.query(
        `INSERT INTO other_profiles
        (user_id, first_name, last_name, username, bio, profile_image_url,
         followers_count, following_count, profile_visibility, message_permissions)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          req.userId,
          preservedData.first_name,
          preservedData.last_name,
          profile_data.username,
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
    // Stripe Checkout next. `isCurrentPaid`, `isTargetPaid`, `isSamePricePair`
    // were declared in the transaction block above and are still in scope.
    const requiresPayment = isTargetPaid && !isSamePricePair;

    res.json({
      success: true,
      new_type: target_type,
      new_role: targetRole,
      is_paid: isTargetPaid,
      requires_payment: requiresPayment,
      payment_profile_type: requiresPayment ? target_type : null,
      redirect_folder: folder,
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

// Validate required fields for a target profile type
function validateProfileDataForType(targetType, data) {
  const targetRole = User.getBaseRole(targetType);

  if (!data.username || data.username.trim().length === 0) {
    return 'Username is required';
  }
  if (!/^[a-z0-9_]{1,15}$/.test(data.username)) {
    return 'Username must be 1-15 characters, lowercase letters, numbers, and underscores only';
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
  } else if (targetRole === 'coach') {
    if (!data.team_name) return 'Team/school name is required';
    if (!data.state) return 'State is required';
    if (!data.position_title) return 'Coaching position is required';

    if (targetType === 'collegecoach') {
      if (!data.college_division) return 'College division is required';
    }
  }
  // 'other' has no required fields beyond username

  return null;
}

module.exports = router;
