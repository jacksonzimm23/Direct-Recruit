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
const logger = require('../utils/logger');

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

module.exports = router;
