const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PendingEmailChange = require('../models/PendingEmailChange');
const PendingPasswordReset = require('../models/PendingPasswordReset');
const { authMiddleware } = require('../middleware/auth');
const cognito = require('../utils/cognito');
const email = require('../utils/email');

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
    console.error('Get account settings error:', error);
    res.status(500).json({ error: 'Failed to fetch account settings' });
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
    console.error('Check email availability error:', error);
    res.status(500).json({ error: 'Failed to check email availability' });
  }
});

// Initiate email change - verifies password and sends verification email via SES
// IMPORTANT: This does NOT change Cognito until verification is complete
router.post('/email/request-change', authMiddleware, async (req, res) => {
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
      console.log('[Settings] Verifying password for email:', currentUser.email);
      await cognito.signIn(currentUser.email, password);
      console.log('[Settings] Password verified successfully');
    } catch (cognitoError) {
      console.error('[Settings] Password verification error:', cognitoError.name, cognitoError.message);
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
    console.log('[Settings] Pending email change stored for user:', req.userId);

    // Send verification email via SES
    try {
      await email.sendEmailChangeVerification(newEmail, verificationCode);
      console.log('[Settings] Verification email sent to:', newEmail);
    } catch (emailError) {
      console.error('[Settings] Failed to send verification email:', emailError);
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
    console.error('Email change request error:', error);
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
      console.log('[Settings] Updating Cognito email from', pendingChange.current_email, 'to', pendingChange.new_email);
      await cognito.adminUpdateUserEmail(pendingChange.current_email, pendingChange.new_email);
      console.log('[Settings] Cognito email updated successfully');
    } catch (cognitoError) {
      console.error('[Settings] Cognito email update error:', cognitoError);
      return res.status(500).json({ error: 'Failed to update email in authentication system' });
    }

    // Update email in PostgreSQL
    const updatedUser = await User.updateEmail(req.userId, pendingChange.new_email);
    console.log('[Settings] PostgreSQL email updated to:', pendingChange.new_email);

    // Delete the pending change record
    await PendingEmailChange.delete(req.userId);

    // Send confirmation email to the new address (non-blocking)
    email.sendEmailChangeConfirmation(pendingChange.new_email)
      .then(() => console.log('[Settings] Confirmation email sent to:', pendingChange.new_email))
      .catch(err => console.error('[Settings] Failed to send confirmation email:', err));

    res.json({
      message: 'Email changed successfully',
      email: updatedUser.email
    });
  } catch (error) {
    console.error('Email verification error:', error);
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
      console.log('[Settings] Resent verification email to:', pendingChange.new_email, 'Resend count:', currentResendCount + 1);
    } catch (emailError) {
      console.error('[Settings] Failed to resend verification email:', emailError);
      throw emailError;
    }

    const resendsRemaining = MAX_RESENDS - (currentResendCount + 1);
    res.json({
      message: 'Verification code resent',
      resendsRemaining
    });
  } catch (error) {
    console.error('Resend code error:', error);
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
});

// Cancel pending email change
router.post('/email/cancel-change', authMiddleware, async (req, res) => {
  try {
    await PendingEmailChange.delete(req.userId);
    res.json({ message: 'Email change cancelled' });
  } catch (error) {
    console.error('Cancel email change error:', error);
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
      console.log('[Settings] Verifying current password for:', currentUser.email);
      cognitoTokens = await cognito.signIn(currentUser.email, currentPassword);
      console.log('[Settings] Current password verified successfully');
    } catch (cognitoError) {
      console.error('[Settings] Password verification error:', cognitoError.name, cognitoError.message);
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
      console.log('[Settings] Changing password for:', currentUser.email);
      await cognito.changePassword(cognitoTokens.accessToken, currentPassword, newPassword);
      console.log('[Settings] Password changed successfully in Cognito');
    } catch (cognitoError) {
      console.error('[Settings] Password change error:', cognitoError.name, cognitoError.message);
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
      .then(() => console.log('[Settings] Password change confirmation email sent to:', currentUser.email))
      .catch(err => console.error('[Settings] Failed to send password change confirmation email:', err));

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
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
    console.log('[Settings] Pending password reset stored for user:', req.userId);

    // Send verification email via SES
    try {
      await email.sendPasswordResetVerification(currentUser.email, verificationCode);
      console.log('[Settings] Password reset verification email sent to:', currentUser.email);
    } catch (emailError) {
      console.error('[Settings] Failed to send password reset email:', emailError);
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
    console.error('Password reset request error:', error);
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
    console.error('Password reset verify error:', error);
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
      console.log('[Settings] Checking if new password matches current password for:', pendingReset.email);
      await cognito.signIn(pendingReset.email, newPassword);
      // If sign-in succeeds, the new password is the same as the current one
      console.log('[Settings] Sign-in succeeded - user is trying to use same password');
      return res.status(400).json({ error: 'New password must be different from your current password' });
    } catch (signInError) {
      console.log('[Settings] Sign-in check result:', signInError.name);
      if (signInError.name !== 'NotAuthorizedException') {
        console.log('[Settings] Password check error (non-blocking):', signInError.name);
      }
      // Password is different, continue
    }

    // If no Cognito code provided, initiate Cognito's forgot password to send code
    if (!cognitoCode) {
      try {
        console.log('[Settings] Initiating Cognito forgot password for:', pendingReset.email);
        await cognito.forgotPassword(pendingReset.email);
        console.log('[Settings] Cognito forgot password initiated');

        return res.json({
          message: 'A verification code has been sent to your email',
          requiresCognitoCode: true,
          email: pendingReset.email
        });
      } catch (cognitoError) {
        console.error('[Settings] Cognito forgot password error:', cognitoError.name, cognitoError.message);

        if (cognitoError.name === 'LimitExceededException') {
          return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
        }

        return res.status(400).json({ error: cognitoError.message || 'Failed to initiate password reset' });
      }
    }

    // Cognito code provided - complete the password reset
    try {
      console.log('[Settings] Confirming forgot password with Cognito code for:', pendingReset.email);
      await cognito.confirmForgotPassword(pendingReset.email, cognitoCode, newPassword);
      console.log('[Settings] Password reset successfully via Cognito');
    } catch (cognitoError) {
      console.error('[Settings] Cognito confirm forgot password error:', cognitoError.name, cognitoError.message);

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
      .then(() => console.log('[Settings] Password reset confirmation email sent to:', pendingReset.email))
      .catch(err => console.error('[Settings] Failed to send password reset confirmation email:', err));

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Password reset set error:', error.name, error.message);
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
      console.log('[Settings] Resent password reset email to:', pendingReset.email, 'Resend count:', currentResendCount + 1);
    } catch (emailError) {
      console.error('[Settings] Failed to resend password reset email:', emailError);
      throw emailError;
    }

    const resendsRemaining = MAX_RESENDS - (currentResendCount + 1);
    res.json({
      message: 'Verification code resent',
      resendsRemaining
    });
  } catch (error) {
    console.error('Resend password reset code error:', error);
    res.status(500).json({ error: 'Failed to resend verification code' });
  }
});

// Cancel pending password reset
router.post('/password/forgot/cancel', authMiddleware, async (req, res) => {
  try {
    await PendingPasswordReset.delete(req.userId);
    res.json({ message: 'Password reset cancelled' });
  } catch (error) {
    console.error('Cancel password reset error:', error);
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
      console.log('[Settings] Verifying password for account deletion:', currentUser.email);
      await cognito.signIn(currentUser.email, password);
      console.log('[Settings] Password verified successfully');
    } catch (cognitoError) {
      console.error('[Settings] Password verification error:', cognitoError.name, cognitoError.message);
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
      console.log('[Settings] Deleting user from Cognito:', userEmail);
      await cognito.adminDeleteUser(userEmail);
      console.log('[Settings] User deleted from Cognito');
    } catch (cognitoError) {
      console.error('[Settings] Cognito deletion error:', cognitoError.name, cognitoError.message);
      // Only fail if it's not a "user not found" error (already deleted)
      if (cognitoError.name !== 'UserNotFoundException') {
        return res.status(500).json({ error: 'Failed to delete account from authentication system' });
      }
      // User not found in Cognito is fine - continue with PostgreSQL deletion
      console.log('[Settings] User not found in Cognito (may already be deleted), continuing...');
    }

    // Delete from PostgreSQL (cascades to all related tables)
    console.log('[Settings] Deleting user from PostgreSQL:', req.userId);
    await User.delete(req.userId);
    console.log('[Settings] User deleted from PostgreSQL');

    // Send goodbye email (non-blocking)
    email.sendAccountDeletionConfirmation(userEmail)
      .then(() => console.log('[Settings] Account deletion email sent to:', userEmail))
      .catch(err => console.error('[Settings] Failed to send account deletion email:', err));

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;
