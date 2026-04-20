// In development, use console logging instead of AWS SES
if (process.env.NODE_ENV !== 'production') { module.exports = require('./local/email-local'); return; }

const logger = require('./logger');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// The "from" email address - must be verified in SES
// In SES sandbox mode, both sender AND recipient must be verified
const FROM_EMAIL = process.env.SES_FROM_EMAIL || 'noreply@directrecruit.com';

/**
 * Send a verification code email for email change
 */
async function sendEmailChangeVerification(toEmail, verificationCode) {
  const params = {
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [toEmail]
    },
    Message: {
      Subject: {
        Data: 'Verify your new email address - Direct Recruit',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <!-- Header -->
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <!-- Content Box -->
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px 30px;">
                          <h2 style="color: #1a1a2e; font-size: 24px; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">Verify Your New Email</h2>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            You requested to change your email address. Use the verification code below to confirm this change.
                          </p>
                          <!-- Verification Code -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                            <tr>
                              <td style="background-color: #e8f4f8; border: 2px solid #1282a2; border-radius: 8px; padding: 20px; text-align: center;">
                                <p style="color: #666666; font-size: 14px; margin: 0 0 10px 0; font-family: Arial, Helvetica, sans-serif;">Your verification code:</p>
                                <p style="color: #1282a2; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; font-family: 'Courier New', Courier, monospace;">${verificationCode}</p>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #888888; font-size: 14px; line-height: 1.5; margin: 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            This code will expire in 24 hours.<br>
                            If you didn't request this change, you can safely ignore this email.
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: #999999; font-size: 12px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                            &copy; ${new Date().getFullYear()} Direct Recruit. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
Direct Recruit - Verify Your New Email

You requested to change your email address. Use the verification code below to confirm this change.

Your verification code: ${verificationCode}

This code will expire in 24 hours.

If you didn't request this change, you can safely ignore this email.

© ${new Date().getFullYear()} Direct Recruit. All rights reserved.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Verification email sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send verification email:', error);
    throw error;
  }
}

/**
 * Send confirmation email after email has been successfully changed
 */
async function sendEmailChangeConfirmation(toEmail) {
  const params = {
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [toEmail]
    },
    Message: {
      Subject: {
        Data: 'Your email has been changed - Direct Recruit',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <!-- Header -->
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <!-- Content Box -->
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px 30px;">
                          <!-- Success Icon -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr>
                              <td align="center">
                                <table role="presentation" style="border-collapse: collapse;">
                                  <tr>
                                    <td style="width: 60px; height: 60px; background-color: #dcfce7; border-radius: 30px; text-align: center; vertical-align: middle;">
                                      <span style="color: #22c55e; font-size: 32px; line-height: 60px;">&#10003;</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          <h2 style="color: #1a1a2e; font-size: 24px; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">Email Successfully Changed</h2>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            Your Direct Recruit account email has been successfully updated to this address.
                          </p>
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr>
                              <td style="background-color: #e8f4f8; border: 1px solid #1282a2; border-radius: 8px; padding: 15px; text-align: center;">
                                <p style="color: #666666; font-size: 14px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                                  <strong style="color: #1a1a2e;">New email:</strong> ${toEmail}
                                </p>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #888888; font-size: 14px; line-height: 1.5; margin: 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            If you did not make this change, please contact our support team immediately.
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: #999999; font-size: 12px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                            &copy; ${new Date().getFullYear()} Direct Recruit. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
Direct Recruit - Email Successfully Changed

Your Direct Recruit account email has been successfully updated to this address.

New email: ${toEmail}

If you did not make this change, please contact our support team immediately.

© ${new Date().getFullYear()} Direct Recruit. All rights reserved.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Email change confirmation sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send email change confirmation:', error);
    // Don't throw - this is a non-critical notification
    return { success: false, error: error.message };
  }
}

/**
 * Send confirmation email after password has been successfully changed
 */
async function sendPasswordChangeConfirmation(toEmail) {
  const params = {
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [toEmail]
    },
    Message: {
      Subject: {
        Data: 'Your password has been changed - Direct Recruit',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <!-- Header -->
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <!-- Content Box -->
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px 30px;">
                          <!-- Security Icon -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr>
                              <td align="center">
                                <table role="presentation" style="border-collapse: collapse;">
                                  <tr>
                                    <td style="width: 60px; height: 60px; background-color: #e8f4f8; border-radius: 30px; text-align: center; vertical-align: middle;">
                                      <span style="color: #1282a2; font-size: 28px; line-height: 60px;">&#128274;</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          <h2 style="color: #1a1a2e; font-size: 24px; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">Password Changed Successfully</h2>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            Your Direct Recruit account password was just changed.
                          </p>
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr>
                              <td style="background-color: #e8f4f8; border: 1px solid #1282a2; border-radius: 8px; padding: 15px; text-align: center;">
                                <p style="color: #666666; font-size: 14px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                                  <strong style="color: #1a1a2e;">When:</strong> ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}
                                </p>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #555555; font-size: 14px; line-height: 1.5; margin: 0 0 15px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            If you made this change, no further action is needed.
                          </p>
                          <table role="presentation" style="width: 100%; border-collapse: collapse;">
                            <tr>
                              <td style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 15px; text-align: center;">
                                <p style="color: #856404; font-size: 14px; font-weight: 600; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                                  &#9888; If you didn't make this change, please reset your password immediately and contact support.
                                </p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: #999999; font-size: 12px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                            &copy; ${new Date().getFullYear()} Direct Recruit. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
Direct Recruit - Password Changed Successfully

Your Direct Recruit account password was just changed.

When: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}

If you made this change, no further action is needed.

WARNING: If you didn't make this change, please reset your password immediately and contact support.

© ${new Date().getFullYear()} Direct Recruit. All rights reserved.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Password change confirmation sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send password change confirmation:', error);
    // Don't throw - this is a non-critical notification
    return { success: false, error: error.message };
  }
}

/**
 * Send a verification code email for password reset (from settings page)
 */
async function sendPasswordResetVerification(toEmail, verificationCode) {
  const params = {
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [toEmail]
    },
    Message: {
      Subject: {
        Data: 'Reset your password - Direct Recruit',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <!-- Header -->
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <!-- Content Box -->
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px 30px;">
                          <!-- Lock Icon -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                            <tr>
                              <td align="center">
                                <table role="presentation" style="border-collapse: collapse;">
                                  <tr>
                                    <td style="width: 60px; height: 60px; background-color: #e8f4f8; border-radius: 30px; text-align: center; vertical-align: middle;">
                                      <span style="color: #1282a2; font-size: 28px; line-height: 60px;">&#128274;</span>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>
                          </table>
                          <h2 style="color: #1a1a2e; font-size: 24px; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">Reset Your Password</h2>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            You requested to reset your password. Use the verification code below to proceed.
                          </p>
                          <!-- Verification Code -->
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                            <tr>
                              <td style="background-color: #e8f4f8; border: 2px solid #1282a2; border-radius: 8px; padding: 20px; text-align: center;">
                                <p style="color: #666666; font-size: 14px; margin: 0 0 10px 0; font-family: Arial, Helvetica, sans-serif;">Your verification code:</p>
                                <p style="color: #1282a2; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; font-family: 'Courier New', Courier, monospace;">${verificationCode}</p>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #888888; font-size: 14px; line-height: 1.5; margin: 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            This code will expire in 15 minutes.<br>
                            If you didn't request this reset, you can safely ignore this email.
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: #999999; font-size: 12px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                            &copy; ${new Date().getFullYear()} Direct Recruit. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
Direct Recruit - Reset Your Password

You requested to reset your password. Use the verification code below to proceed.

Your verification code: ${verificationCode}

This code will expire in 15 minutes.

If you didn't request this reset, you can safely ignore this email.

© ${new Date().getFullYear()} Direct Recruit. All rights reserved.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Password reset verification sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send password reset verification:', error);
    throw error;
  }
}

/**
 * Send account deletion confirmation email (sorry to see you go)
 */
async function sendAccountDeletionConfirmation(toEmail) {
  const params = {
    Source: FROM_EMAIL,
    Destination: {
      ToAddresses: [toEmail]
    },
    Message: {
      Subject: {
        Data: 'Your account has been deleted - Direct Recruit',
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <!-- Header -->
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0; font-family: Arial, Helvetica, sans-serif;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <!-- Content Box -->
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px 30px;">
                          <h2 style="color: #1a1a2e; font-size: 24px; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">We're Sorry to See You Go</h2>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            Your Direct Recruit account has been permanently deleted as requested.
                          </p>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            All your personal data, including your profile, messages, connections, and uploaded content has been removed from our systems.
                          </p>
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 25px 0;">
                            <tr>
                              <td style="background-color: #e8f4f8; border: 1px solid #1282a2; border-radius: 8px; padding: 15px; text-align: center;">
                                <p style="color: #666666; font-size: 14px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                                  If you ever want to come back, you're always welcome to create a new account using this email address.
                                </p>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #888888; font-size: 14px; line-height: 1.5; margin: 0; text-align: center; font-family: Arial, Helvetica, sans-serif;">
                            Thank you for being part of the Direct Recruit community. We wish you all the best in your athletic journey.
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: #999999; font-size: 12px; margin: 0; font-family: Arial, Helvetica, sans-serif;">
                            &copy; ${new Date().getFullYear()} Direct Recruit. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
Direct Recruit - We're Sorry to See You Go

Your Direct Recruit account has been permanently deleted as requested.

All your personal data, including your profile, messages, connections, and uploaded content has been removed from our systems.

If you ever want to come back, you're always welcome to create a new account using this email address.

Thank you for being part of the Direct Recruit community. We wish you all the best in your athletic journey.

© ${new Date().getFullYear()} Direct Recruit. All rights reserved.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Account deletion confirmation sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send account deletion confirmation:', error);
    // Don't throw - this is a non-critical notification
    return { success: false, error: error.message };
  }
}

/**
 * Send internal notification to admin when a college coach submits a signup request.
 * Plain admin-facing email listing all submitted fields + link to the admin dashboard.
 */
async function sendCoachRequestNotification(toEmail, data) {
  const notes = data.notes && data.notes.trim() ? data.notes : '(none)';
  const phone = data.phone && data.phone.trim() ? data.phone : '(not provided)';
  const division = data.division || '(not provided)';
  const isSwitch = !!data.is_switch;
  const requestKind = isSwitch ? 'Profile-Type Switch' : 'New Signup';
  const subjectLine = `[${requestKind}] ${data.first_name} ${data.last_name} — ${data.school}`;
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: {
        Data: subjectLine,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="font-family: Arial, sans-serif; color:#1a1a2e;">
              <h2 style="color:#1282a2;">New College Coach ${isSwitch ? 'Switch' : 'Signup'} Request</h2>
              <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
              <p><strong>Type:</strong> ${isSwitch ? '🔄 Switch from existing account' : '🆕 New signup'}</p>
              <table cellpadding="6" style="border-collapse:collapse;">
                <tr><td><strong>Name:</strong></td><td>${data.first_name} ${data.last_name}</td></tr>
                <tr><td><strong>School:</strong></td><td>${data.school}</td></tr>
                <tr><td><strong>Division:</strong></td><td>${division}</td></tr>
                <tr><td><strong>Position:</strong></td><td>${data.position}</td></tr>
                <tr><td><strong>Phone:</strong></td><td>${phone}</td></tr>
                <tr><td><strong>.edu Email:</strong></td><td><a href="mailto:${data.edu_email}">${data.edu_email}</a></td></tr>
                <tr><td><strong>Personal Email:</strong></td><td><a href="mailto:${data.personal_email}">${data.personal_email}</a></td></tr>
                <tr><td><strong>Notes:</strong></td><td>${notes}</td></tr>
              </table>
              <p style="margin-top:20px;">
                <a href="https://directrecruit.net/admin/coach-verification.html"
                   style="background:#1282a2;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
                  Review in Admin Dashboard
                </a>
              </p>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
New College Coach ${isSwitch ? 'Switch' : 'Signup'} Request
Submitted: ${new Date().toISOString()}
Type: ${isSwitch ? 'Switch from existing account' : 'New signup'}

Name: ${data.first_name} ${data.last_name}
School: ${data.school}
Division: ${division}
Position: ${data.position}
Phone: ${phone}
.edu Email: ${data.edu_email}
Personal Email: ${data.personal_email}
Notes: ${notes}

Review: https://directrecruit.net/admin/coach-verification.html
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Coach request notification sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send coach request notification:', error);
    throw error;
  }
}

/**
 * Send branded invite email to a verified coach's .edu address with single-use signup link.
 */
async function sendCoachInvite(toEmail, data, link) {
  const expiresText = data.expires_at
    ? new Date(data.expires_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '7 days from today';
  // Switches: user already has an account; signups: brand-new account
  const isSwitch = !!data.is_switch;
  const subjectLine = isSwitch
    ? `Verify your College Coach account — ${data.school}`
    : `You're invited to join Direct Recruit — ${data.school}`;
  const headline = isSwitch ? 'Verify Your College Coach Switch' : "You're Invited";
  const bodyLead = isSwitch
    ? `Your switch to a College Coach account at <strong>${data.school}</strong> has been approved. Click the button below to finish the switch — your existing account, posts, and connections will be preserved.`
    : `Your account at <strong>${data.school}</strong> has been approved. Click the button below to finish setting up your Direct Recruit profile.`;
  const ctaText = isSwitch ? 'Complete Your Switch' : 'Complete Your Signup';
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: {
        Data: subjectLine,
        Charset: 'UTF-8'
      },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f4f4f4;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px 30px;">
                          <h2 style="color: #1a1a2e; font-size: 24px; margin: 0 0 20px 0; text-align: center;">${headline}</h2>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; text-align: center;">
                            Hi ${data.first_name},
                          </p>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; text-align: center;">
                            ${bodyLead}
                          </p>
                          <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                            <tr>
                              <td align="center">
                                <a href="${link}" style="background-color: #ff6b35; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">
                                  ${ctaText}
                                </a>
                              </td>
                            </tr>
                          </table>
                          <p style="color: #888888; font-size: 14px; line-height: 1.5; margin: 0 0 10px 0; text-align: center;">
                            This link expires on ${expiresText} and can only be used once.
                          </p>
                          <p style="color: #888888; font-size: 12px; line-height: 1.5; margin: 0; text-align: center; word-break: break-all;">
                            If the button doesn't work, paste this URL into your browser:<br>
                            <span style="color: #1282a2;">${link}</span>
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: #999999; font-size: 12px; margin: 0;">
                            &copy; ${new Date().getFullYear()} Direct Recruit. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
Direct Recruit — ${headline}

Hi ${data.first_name},

${isSwitch
  ? `Your switch to a College Coach account at ${data.school} has been approved. Complete your switch using the link below — your existing account, posts, and connections will be preserved.`
  : `Your account at ${data.school} has been approved. Complete your signup using the link below:`}

${link}

This link expires on ${expiresText} and can only be used once.

© ${new Date().getFullYear()} Direct Recruit. All rights reserved.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Coach invite sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send coach invite:', error);
    throw error;
  }
}

/**
 * Send polite rejection email to a coach's personal address.
 */
async function sendCoachRejection(toEmail, firstName) {
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'Your Direct Recruit application', Charset: 'UTF-8' },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <tr>
                        <td style="background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 40px 30px;">
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Hi ${firstName},
                          </p>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            Thank you for your interest in Direct Recruit. After reviewing your signup request, we're unable to approve your account at this time.
                          </p>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                            If you believe this was a mistake or would like to provide additional verification, please reply to this email.
                          </p>
                          <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0;">
                            — The Direct Recruit Team
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: #999999; font-size: 12px; margin: 0;">
                            &copy; ${new Date().getFullYear()} Direct Recruit. All rights reserved.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
Hi ${firstName},

Thank you for your interest in Direct Recruit. After reviewing your signup request, we're unable to approve your account at this time.

If you believe this was a mistake or would like to provide additional verification, please reply to this email.

— The Direct Recruit Team

© ${new Date().getFullYear()} Direct Recruit. All rights reserved.
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Coach rejection sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send coach rejection:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send internal notification to Jackson when a new enterprise inquiry is submitted.
 */
async function sendEnterpriseInquiryNotification(toEmail, data) {
  const notes = data.notes && data.notes.trim() ? data.notes : '(none)';
  const subjectLine = `[Enterprise Inquiry] ${data.first_name} ${data.last_name} — ${data.school}`;
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subjectLine, Charset: 'UTF-8' },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="font-family: Arial, sans-serif; color:#1a1a2e;">
              <h2 style="color:#ff6b35;">🏫 New Enterprise Inquiry</h2>
              <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
              <table cellpadding="6" style="border-collapse:collapse;">
                <tr><td><strong>Name:</strong></td><td>${data.first_name} ${data.last_name}</td></tr>
                <tr><td><strong>School:</strong></td><td>${data.school}</td></tr>
                <tr><td><strong>Phone:</strong></td><td>${data.phone}</td></tr>
                <tr><td><strong>Personal Email:</strong></td><td><a href="mailto:${data.personal_email}">${data.personal_email}</a></td></tr>
                <tr><td><strong>Notes:</strong></td><td>${notes}</td></tr>
              </table>
              <p style="margin-top:20px;">
                <a href="https://directrecruit.net/admin/coach-verification.html"
                   style="background:#ff6b35;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">
                  Review in Admin Dashboard → Enterprise Requests
                </a>
              </p>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
New Enterprise Inquiry
Submitted: ${new Date().toISOString()}

Name: ${data.first_name} ${data.last_name}
School: ${data.school}
Phone: ${data.phone}
Personal Email: ${data.personal_email}
Notes: ${notes}

Review: https://directrecruit.net/admin/coach-verification.html (Enterprise Requests tab)
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Enterprise inquiry notification sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send enterprise inquiry notification:', error);
    throw error;
  }
}

/**
 * Internal paper-trail email to Jackson when he approves an enterprise inquiry.
 * (No outbound email is sent to the inquirer — onboarding flow is not built yet.)
 */
async function sendEnterpriseApproval(toEmail, data) {
  const subjectLine = `[Enterprise Inquiry — APPROVED] ${data.first_name} ${data.last_name} — ${data.school}`;
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subjectLine, Charset: 'UTF-8' },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="font-family: Arial, sans-serif; color:#1a1a2e;">
              <h2 style="color:#22c55e;">✅ Enterprise Inquiry Approved</h2>
              <p>${data.first_name} ${data.last_name} — ${data.school}</p>
              <p style="color:#666;font-size:13px;">Status updated. No outbound email to the inquirer yet — onboarding flow TBD.</p>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `Enterprise Inquiry Approved\n\n${data.first_name} ${data.last_name} — ${data.school}\n\nStatus updated. No outbound email to the inquirer yet.`,
          Charset: 'UTF-8'
        }
      }
    }
  };
  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Enterprise approval notification sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send enterprise approval notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Internal paper-trail email to Jackson when he rejects an enterprise inquiry.
 */
async function sendEnterpriseRejection(toEmail, data) {
  const reason = data.reason && data.reason.trim() ? data.reason : '(none)';
  const subjectLine = `[Enterprise Inquiry — REJECTED] ${data.first_name} ${data.last_name} — ${data.school}`;
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: subjectLine, Charset: 'UTF-8' },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="font-family: Arial, sans-serif; color:#1a1a2e;">
              <h2 style="color:#ef4444;">❌ Enterprise Inquiry Rejected</h2>
              <p>${data.first_name} ${data.last_name} — ${data.school}</p>
              <p><strong>Reason (internal):</strong> ${reason}</p>
              <p style="color:#666;font-size:13px;">Status updated. No outbound email to the inquirer.</p>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `Enterprise Inquiry Rejected\n\n${data.first_name} ${data.last_name} — ${data.school}\nReason (internal): ${reason}\n\nStatus updated. No outbound email to the inquirer.`,
          Charset: 'UTF-8'
        }
      }
    }
  };
  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Enterprise rejection notification sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send enterprise rejection notification:', error);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmailChangeVerification,
  sendEmailChangeConfirmation,
  sendPasswordChangeConfirmation,
  sendPasswordResetVerification,
  sendAccountDeletionConfirmation,
  sendCoachRequestNotification,
  sendCoachInvite,
  sendCoachRejection,
  sendEnterpriseInquiryNotification,
  sendEnterpriseApproval,
  sendEnterpriseRejection
};
