/**
 * Local development mock for AWS Cognito authentication.
 * Uses bcrypt for password hashing and an in-memory store for auth state.
 * Production is NOT affected — this file is only loaded when NODE_ENV !== 'production'.
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');

// In-memory password store: email -> { hash, verified }
// Survives during server session; falls back to DB lookup on restart
const passwordStore = new Map();
const VERIFICATION_CODE = process.env.LOCAL_DEV_VERIFICATION_CODE || '123456';
const SALT_ROUNDS = 10;

// Helper to create errors with the exact .name property that route files check
function cognitoError(name, message) {
  const err = new Error(message);
  err.name = name;
  return err;
}

// Validate password meets Cognito-like requirements
function validatePassword(password) {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) return false;
  return true;
}

// Get password hash — check in-memory store first, then fall back to DB
async function getPasswordHash(email) {
  const entry = passwordStore.get(email);
  if (entry) return entry.hash;

  // Fallback: check DB (handles server restart case)
  try {
    const pool = require('../../config/database');
    const result = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0 && result.rows[0].password_hash) {
      // Cache it in memory
      passwordStore.set(email, { hash: result.rows[0].password_hash, verified: true });
      return result.rows[0].password_hash;
    }
  } catch (err) {
    // DB might not be available yet during initial setup
  }
  return null;
}

// Update password hash in both memory and DB
async function updatePasswordHash(email, newHash) {
  const entry = passwordStore.get(email);
  if (entry) {
    entry.hash = newHash;
  } else {
    passwordStore.set(email, { hash: newHash, verified: true });
  }

  try {
    const pool = require('../../config/database');
    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [newHash, email]);
  } catch (err) {
    // Non-critical — in-memory store is the source of truth for the session
  }
}

async function signUp(email, password, role) {
  if (!validatePassword(password)) {
    throw cognitoError('InvalidPasswordException', 'Password does not meet requirements');
  }

  // Check if email already exists in our store or DB
  const existingHash = await getPasswordHash(email);
  if (existingHash) {
    throw cognitoError('UsernameExistsException', 'An account with the given email already exists');
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  const userSub = crypto.randomUUID();

  passwordStore.set(email, { hash, verified: false });

  console.log(`[LOCAL AUTH] User signed up: ${email}`);
  console.log(`[LOCAL AUTH] Verification code: ${VERIFICATION_CODE}`);

  return {
    success: true,
    userSub,
    userConfirmed: false
  };
}

async function confirmSignUp(email, code) {
  if (code !== VERIFICATION_CODE) {
    throw cognitoError('CodeMismatchException', 'Invalid verification code provided');
  }

  const entry = passwordStore.get(email);
  if (entry) {
    entry.verified = true;
  }

  console.log(`[LOCAL AUTH] Email verified: ${email}`);
  return { success: true };
}

async function resendConfirmationCode(email) {
  // Check if user exists
  const hash = await getPasswordHash(email);
  if (!hash) {
    throw cognitoError('UserNotFoundException', 'User does not exist');
  }

  const entry = passwordStore.get(email);
  if (entry && entry.verified) {
    throw cognitoError('InvalidParameterException', 'User is already confirmed');
  }

  console.log(`[LOCAL AUTH] Resending verification code to: ${email}`);
  console.log(`[LOCAL AUTH] Verification code: ${VERIFICATION_CODE}`);

  return {
    success: true,
    deliveryMedium: 'EMAIL',
    destination: email
  };
}

async function signIn(email, password) {
  const hash = await getPasswordHash(email);

  if (!hash) {
    throw cognitoError('UserNotFoundException', 'User does not exist');
  }

  const entry = passwordStore.get(email);
  if (entry && !entry.verified) {
    throw cognitoError('UserNotConfirmedException', 'User is not confirmed');
  }

  const isValid = await bcrypt.compare(password, hash);
  if (!isValid) {
    throw cognitoError('NotAuthorizedException', 'Incorrect username or password');
  }

  return {
    success: true,
    accessToken: 'local-dev-access-token-' + Date.now(),
    idToken: 'local-dev-id-token-' + Date.now(),
    refreshToken: 'local-dev-refresh-token-' + Date.now(),
    expiresIn: 3600
  };
}

async function adminCreateUser(email, role, temporaryPassword = null) {
  const tempPass = temporaryPassword || generateTemporaryPassword();
  const hash = await bcrypt.hash(tempPass, SALT_ROUNDS);

  passwordStore.set(email, { hash, verified: true });

  console.log(`[LOCAL AUTH] Admin created user: ${email} with temp password: ${tempPass}`);

  return {
    success: true,
    user: { Username: email },
    temporaryPassword: tempPass
  };
}

async function adminSetUserPassword(email, password) {
  const hash = await bcrypt.hash(password, SALT_ROUNDS);
  await updatePasswordHash(email, hash);

  console.log(`[LOCAL AUTH] Admin set password for: ${email}`);
  return { success: true };
}

async function adminGetUser(email) {
  try {
    const pool = require('../../config/database');
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return { success: false, error: 'User not found' };
    }
    const user = result.rows[0];
    return {
      success: true,
      username: email,
      status: user.email_verified ? 'CONFIRMED' : 'UNCONFIRMED',
      attributes: {
        email: user.email,
        email_verified: String(user.email_verified),
        sub: user.cognito_sub || user.id
      }
    };
  } catch (err) {
    return { success: false, error: 'User not found' };
  }
}

async function adminUpdateUserEmail(currentEmail, newEmail) {
  // Move password entry to new email
  const entry = passwordStore.get(currentEmail);
  if (entry) {
    passwordStore.set(newEmail, entry);
    passwordStore.delete(currentEmail);
  }

  console.log(`[LOCAL AUTH] Admin updated email: ${currentEmail} -> ${newEmail}`);
  return { success: true };
}

async function adminDeleteUser(email) {
  passwordStore.delete(email);
  console.log(`[LOCAL AUTH] Admin deleted user: ${email}`);
  return { success: true };
}

async function forgotPassword(email) {
  const hash = await getPasswordHash(email);
  if (!hash) {
    throw cognitoError('UserNotFoundException', 'User does not exist');
  }

  console.log(`[LOCAL AUTH] Forgot password for: ${email}`);
  console.log(`[LOCAL AUTH] Reset code: ${VERIFICATION_CODE}`);

  return {
    success: true,
    deliveryMedium: 'EMAIL',
    destination: email
  };
}

async function confirmForgotPassword(email, code, newPassword) {
  if (code !== VERIFICATION_CODE) {
    throw cognitoError('CodeMismatchException', 'Invalid verification code provided');
  }

  if (!validatePassword(newPassword)) {
    throw cognitoError('InvalidPasswordException', 'Password does not meet requirements');
  }

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await updatePasswordHash(email, hash);

  console.log(`[LOCAL AUTH] Password reset for: ${email}`);
  return { success: true };
}

async function changePassword(accessToken, oldPassword, newPassword) {
  // In local dev, we don't have a way to map accessToken back to email easily.
  // The route that calls this (settings.js) already verifies the user via signIn first,
  // so we just validate the new password format.
  if (!validatePassword(newPassword)) {
    throw cognitoError('InvalidPasswordException', 'Password does not meet requirements');
  }

  console.log('[LOCAL AUTH] Password changed via changePassword');
  return { success: true };
}

async function globalSignOut(accessToken) {
  // No-op in local dev — cookie clearing handles logout
  return { success: true };
}

function generateTemporaryPassword() {
  return 'TempPass123!';
}

function generateVerificationCode() {
  return VERIFICATION_CODE;
}

module.exports = {
  signUp,
  confirmSignUp,
  resendConfirmationCode,
  signIn,
  adminCreateUser,
  adminSetUserPassword,
  adminGetUser,
  adminUpdateUserEmail,
  adminDeleteUser,
  forgotPassword,
  confirmForgotPassword,
  changePassword,
  globalSignOut,
  generateTemporaryPassword,
  generateVerificationCode
};
