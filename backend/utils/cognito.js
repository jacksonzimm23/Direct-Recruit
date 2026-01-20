const {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  InitiateAuthCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDeleteUserCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  ChangePasswordCommand,
  GlobalSignOutCommand
} = require('@aws-sdk/client-cognito-identity-provider');
const crypto = require('crypto');

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const USER_POOL_ID = process.env.AWS_COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.AWS_COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.AWS_COGNITO_CLIENT_SECRET;

// Compute SECRET_HASH for Cognito API calls (required when client has a secret)
function computeSecretHash(username) {
  if (!CLIENT_SECRET) return undefined;
  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(username + CLIENT_ID)
    .digest('base64');
}

// Sign up a new user
async function signUp(email, password, role) {
  const commandParams = {
    ClientId: CLIENT_ID,
    Username: email,
    Password: password,
    UserAttributes: [
      { Name: 'email', Value: email }
      // Note: role is stored in local database, not in Cognito
    ]
  };

  // Add SECRET_HASH if client secret is configured
  const secretHash = computeSecretHash(email);
  if (secretHash) {
    commandParams.SecretHash = secretHash;
  }

  const command = new SignUpCommand(commandParams);

  try {
    const response = await client.send(command);
    return {
      success: true,
      userSub: response.UserSub,
      userConfirmed: response.UserConfirmed
    };
  } catch (error) {
    console.error('Cognito signUp error:', error);
    throw error;
  }
}

// Confirm sign up with verification code
async function confirmSignUp(email, code) {
  const commandParams = {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code
  };

  const secretHash = computeSecretHash(email);
  if (secretHash) {
    commandParams.SecretHash = secretHash;
  }

  const command = new ConfirmSignUpCommand(commandParams);

  try {
    await client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Cognito confirmSignUp error:', error);
    throw error;
  }
}

// Resend confirmation code
async function resendConfirmationCode(email) {
  const commandParams = {
    ClientId: CLIENT_ID,
    Username: email
  };

  const secretHash = computeSecretHash(email);
  if (secretHash) {
    commandParams.SecretHash = secretHash;
  }

  const command = new ResendConfirmationCodeCommand(commandParams);

  try {
    const response = await client.send(command);
    return {
      success: true,
      deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
      destination: response.CodeDeliveryDetails?.Destination
    };
  } catch (error) {
    console.error('Cognito resendConfirmationCode error:', error);
    throw error;
  }
}

// Sign in user
async function signIn(email, password) {
  const authParams = {
    USERNAME: email,
    PASSWORD: password
  };

  const secretHash = computeSecretHash(email);
  if (secretHash) {
    authParams.SECRET_HASH = secretHash;
  }

  const command = new InitiateAuthCommand({
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: CLIENT_ID,
    AuthParameters: authParams
  });

  try {
    const response = await client.send(command);
    return {
      success: true,
      accessToken: response.AuthenticationResult.AccessToken,
      idToken: response.AuthenticationResult.IdToken,
      refreshToken: response.AuthenticationResult.RefreshToken,
      expiresIn: response.AuthenticationResult.ExpiresIn
    };
  } catch (error) {
    console.error('Cognito signIn error:', error);
    throw error;
  }
}

// Admin create user (for migration)
async function adminCreateUser(email, role, temporaryPassword = null) {
  const tempPass = temporaryPassword || generateTemporaryPassword();

  const command = new AdminCreateUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' }
      // Note: role is stored in local database, not in Cognito
    ],
    TemporaryPassword: tempPass,
    MessageAction: 'SUPPRESS' // Don't send welcome email during migration
  });

  try {
    const response = await client.send(command);
    return {
      success: true,
      user: response.User,
      temporaryPassword: tempPass
    };
  } catch (error) {
    if (error.name === 'UsernameExistsException') {
      return { success: false, error: 'User already exists in Cognito' };
    }
    console.error('Cognito adminCreateUser error:', error);
    throw error;
  }
}

// Admin set permanent password (for migration)
async function adminSetUserPassword(email, password) {
  const command = new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    Password: password,
    Permanent: true
  });

  try {
    await client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Cognito adminSetUserPassword error:', error);
    throw error;
  }
}

// Get user info from Cognito
async function adminGetUser(email) {
  const command = new AdminGetUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email
  });

  try {
    const response = await client.send(command);
    const attributes = {};
    response.UserAttributes.forEach(attr => {
      attributes[attr.Name] = attr.Value;
    });
    return {
      success: true,
      username: response.Username,
      status: response.UserStatus,
      attributes
    };
  } catch (error) {
    if (error.name === 'UserNotFoundException') {
      return { success: false, error: 'User not found' };
    }
    console.error('Cognito adminGetUser error:', error);
    throw error;
  }
}

// Initiate forgot password flow
async function forgotPassword(email) {
  const commandParams = {
    ClientId: CLIENT_ID,
    Username: email
  };

  const secretHash = computeSecretHash(email);
  if (secretHash) {
    commandParams.SecretHash = secretHash;
  }

  const command = new ForgotPasswordCommand(commandParams);

  try {
    const response = await client.send(command);
    return {
      success: true,
      deliveryMedium: response.CodeDeliveryDetails?.DeliveryMedium,
      destination: response.CodeDeliveryDetails?.Destination
    };
  } catch (error) {
    console.error('Cognito forgotPassword error:', error);
    throw error;
  }
}

// Confirm forgot password with code and new password
async function confirmForgotPassword(email, code, newPassword) {
  const commandParams = {
    ClientId: CLIENT_ID,
    Username: email,
    ConfirmationCode: code,
    Password: newPassword
  };

  const secretHash = computeSecretHash(email);
  if (secretHash) {
    commandParams.SecretHash = secretHash;
  }

  const command = new ConfirmForgotPasswordCommand(commandParams);

  try {
    await client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Cognito confirmForgotPassword error:', error);
    throw error;
  }
}

// Change password (requires current password)
async function changePassword(accessToken, oldPassword, newPassword) {
  const command = new ChangePasswordCommand({
    AccessToken: accessToken,
    PreviousPassword: oldPassword,
    ProposedPassword: newPassword
  });

  try {
    await client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Cognito changePassword error:', error);
    throw error;
  }
}

// Sign out user globally (invalidates all tokens)
async function globalSignOut(accessToken) {
  const command = new GlobalSignOutCommand({
    AccessToken: accessToken
  });

  try {
    await client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Cognito globalSignOut error:', error);
    throw error;
  }
}

// Generate a temporary password that meets Cognito requirements
function generateTemporaryPassword() {
  const length = 12;
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|';

  let password = '';
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += special[crypto.randomInt(special.length)];

  const allChars = uppercase + lowercase + numbers + special;
  for (let i = 4; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Shuffle the password
  return password.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

// Generate a 6-digit verification code
function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

// Admin update user email (used after verification is complete)
// This changes the email WITHOUT affecting the password
async function adminUpdateUserEmail(currentEmail, newEmail) {
  const command = new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username: currentEmail,
    UserAttributes: [
      { Name: 'email', Value: newEmail },
      { Name: 'email_verified', Value: 'true' }
    ]
  });

  try {
    await client.send(command);
    return { success: true };
  } catch (error) {
    console.error('Cognito adminUpdateUserEmail error:', error);
    throw error;
  }
}

// Admin delete user from Cognito User Pool
async function adminDeleteUser(email) {
  const command = new AdminDeleteUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email
  });

  try {
    await client.send(command);
    console.log('[Cognito] User deleted:', email);
    return { success: true };
  } catch (error) {
    console.error('Cognito adminDeleteUser error:', error);
    throw error;
  }
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
