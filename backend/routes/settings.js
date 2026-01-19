const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PendingEmailChange = require('../models/PendingEmailChange');
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

module.exports = router;
