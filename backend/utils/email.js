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
  const isTeamSwitch = !!data.is_team_switch;
  const isSwitch = !!data.is_switch;
  const requestKind = isTeamSwitch ? 'Team Switch' : isSwitch ? 'Profile-Type Switch' : 'New Signup';
  const typeBadge = isTeamSwitch
    ? `🏫 Team switch (from ${data.old_team_name || 'unknown'}${data.old_division ? ` — ${data.old_division}` : ''})`
    : isSwitch ? '🔄 Switch from existing account' : '🆕 New signup';
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
              <h2 style="color:#1282a2;">New College Coach ${requestKind} Request</h2>
              <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
              <p><strong>Type:</strong> ${typeBadge}</p>
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
New College Coach ${requestKind} Request
Submitted: ${new Date().toISOString()}
Type: ${typeBadge}

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
  // Four audiences (checked in priority order):
  //   is_team_switch: existing collegecoach changing schools (X → Y)
  //   is_switch:      existing user becoming a collegecoach for the first time
  //   is_free:        brand-new collegecoach signup with complimentary access (no Stripe)
  //   default:        brand-new collegecoach signup, paid path
  const isTeamSwitch = !!data.is_team_switch;
  const isSwitch = !!data.is_switch;
  const isFree = !!data.is_free;
  let subjectLine, headline, bodyLead, ctaText;
  if (isTeamSwitch) {
    subjectLine = `Confirm your school change — ${data.school}`;
    headline = 'Confirm Your School Change';
    const fromHtml = data.old_team_name ? `<strong>${data.old_team_name}</strong>` : 'your current school';
    bodyLead = `Your switch from ${fromHtml} to <strong>${data.school}</strong> has been approved. Sign in and confirm to update your team — your account, recruits, and connections all stay intact.`;
    ctaText = 'Confirm School Change';
  } else if (isSwitch) {
    subjectLine = `Verify your College Coach account — ${data.school}`;
    headline = 'Verify Your College Coach Switch';
    bodyLead = `Your switch to a College Coach account at <strong>${data.school}</strong> has been approved. Click the button below to finish the switch — your existing account, posts, and connections will be preserved.`;
    ctaText = 'Complete Your Switch';
  } else if (isFree) {
    subjectLine = `You're invited to join Direct Recruit — ${data.school} (Complimentary Access)`;
    headline = "Welcome Aboard — Complimentary Access";
    bodyLead = `Welcome! Your account at <strong>${data.school}</strong> has been approved with <strong>complimentary access</strong> — no payment required. Click the button below to finish setting up your profile.`;
    ctaText = 'Complete Your Signup';
  } else {
    subjectLine = `You're invited to join Direct Recruit — ${data.school}`;
    headline = "You're Invited";
    bodyLead = `Your account at <strong>${data.school}</strong> has been approved. Click the button below to finish setting up your Direct Recruit profile.`;
    ctaText = 'Complete Your Signup';
  }
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

${isTeamSwitch
  ? `Your switch from ${data.old_team_name || 'your current school'} to ${data.school} has been approved. Sign in and confirm to update your team — your account, recruits, and connections all stay intact.`
  : isSwitch
    ? `Your switch to a College Coach account at ${data.school} has been approved. Complete your switch using the link below — your existing account, posts, and connections will be preserved.`
    : isFree
      ? `Welcome! Your account at ${data.school} has been approved with complimentary access — no payment required. Complete your signup using the link below:`
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

async function sendQuestionnaireConfirmation(toEmail, { firstName, schoolName, signupUrl }) {
  const safeFirst = (firstName || 'there').toString();
  const safeSchool = (schoolName || 'the team').toString();
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Inter,Arial,sans-serif;background:#f5f5f5;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;border-top:4px solid #1282a2;">
    <h1 style="color:#0a1128;margin:0 0 16px;font-size:22px;">Thanks for submitting, ${safeFirst}!</h1>
    <p style="color:#333;line-height:1.5;">Your questionnaire has been received by <strong>${safeSchool}</strong>. The coaching staff will review your submission.</p>
    <hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0;">
    <p style="color:#333;line-height:1.5;margin-bottom:20px;"><strong>Sign up for Direct Recruit</strong> to further enhance your recruiting journey — see updates from coaches, message them directly, and reach more programs.</p>
    <p style="text-align:center;margin:24px 0;"><a href="${signupUrl}" style="display:inline-block;background:#1282a2;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Create Your Free Profile →</a></p>
    <p style="color:#888;font-size:12px;margin-top:24px;">If you didn't fill out this questionnaire, you can safely ignore this email.</p>
  </div>
</body></html>`;
  const text = `Hi ${safeFirst}, thanks for submitting your questionnaire to ${safeSchool}.\n\nSign up for Direct Recruit to further enhance your recruiting journey: ${signupUrl}`;
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: `Thanks for submitting to ${safeSchool}`, Charset: 'UTF-8' },
      Body: {
        Html: { Data: html, Charset: 'UTF-8' },
        Text: { Data: text, Charset: 'UTF-8' }
      }
    }
  };
  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Questionnaire confirmation sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send questionnaire confirmation:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send internal notification to admin when a user submits a content report.
 * Apple Guideline 1.2 reporting flow (Fix #2a). Mirrors the structure of
 * sendCoachRequestNotification — admin-facing email with the report details.
 */
async function sendReportNotification(toEmail, data) {
  const REASON_LABELS = {
    spam: 'Spam',
    harassment: 'Harassment',
    inappropriate: 'Inappropriate content',
    hate_speech: 'Hate speech',
    impersonation: 'Impersonation',
    other: 'Other'
  };
  const reasonLabel = REASON_LABELS[data.reason] || data.reason;
  const details = data.details && data.details.trim() ? data.details : '(none)';
  const excerpt = data.content_excerpt && data.content_excerpt.trim()
    ? data.content_excerpt.slice(0, 500)
    : '(no excerpt available)';
  const subjectLine = `[Report] ${reasonLabel} — ${data.content_type} reported by ${data.reporter_name || 'a user'}`;
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
              <h2 style="color:#ef4444;">New Content Report</h2>
              <p><strong>Submitted:</strong> ${new Date().toISOString()}</p>
              <table cellpadding="6" style="border-collapse:collapse;">
                <tr><td><strong>Reason:</strong></td><td>${reasonLabel}</td></tr>
                <tr><td><strong>Content type:</strong></td><td>${data.content_type}</td></tr>
                <tr><td><strong>Content ID:</strong></td><td>${data.content_id || '(profile report — no content id)'}</td></tr>
                <tr><td><strong>Reporter:</strong></td><td>${data.reporter_name || '(unknown)'} (${data.reporter_email || 'no email'}) &mdash; ${data.reporter_role || 'unknown role'}</td></tr>
                <tr><td><strong>Reported user:</strong></td><td>${data.reported_name || '(unknown)'} (${data.reported_email || 'no email'}) &mdash; ${data.reported_role || 'unknown role'}</td></tr>
                <tr><td valign="top"><strong>Excerpt:</strong></td><td><pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${excerpt}</pre></td></tr>
                <tr><td valign="top"><strong>Details:</strong></td><td><pre style="white-space:pre-wrap;font-family:inherit;margin:0;">${details}</pre></td></tr>
                <tr><td><strong>Report ID:</strong></td><td>${data.report_id || '(unknown)'}</td></tr>
              </table>
              <p style="margin-top:20px;color:#64748b;font-size:13px;">
                Admin moderation dashboard is deferred to a future release.
                Triage reports directly in Postgres: <code>SELECT * FROM content_reports WHERE status = 'pending' ORDER BY created_at DESC;</code>
              </p>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `
New Content Report
Submitted: ${new Date().toISOString()}

Reason: ${reasonLabel}
Content type: ${data.content_type}
Content ID: ${data.content_id || '(profile report)'}
Reporter: ${data.reporter_name || '(unknown)'} (${data.reporter_email || 'no email'}) — ${data.reporter_role || 'unknown role'}
Reported user: ${data.reported_name || '(unknown)'} (${data.reported_email || 'no email'}) — ${data.reported_role || 'unknown role'}

Excerpt:
${excerpt}

Details:
${details}

Report ID: ${data.report_id || '(unknown)'}

Triage: SELECT * FROM content_reports WHERE status = 'pending' ORDER BY created_at DESC;
          `,
          Charset: 'UTF-8'
        }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    logger.info('[Email] Report notification sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    logger.error('[Email] Failed to send report notification:', error);
    throw error;
  }
}

// Moderation: warning email sent when admin uses the "Warn" action (Fix #10).
// Notifies the reported user that their content was reported without taking
// further action. Tone is professional and references community guidelines.
async function sendModerationWarning(toEmail, { reason, contentType } = {}) {
  const reasonLabel = reason ? reason.replace(/_/g, ' ') : 'a community guidelines violation';
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'A note about your recent activity - Direct Recruit', Charset: 'UTF-8' },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
                <tr><td align="center" style="padding:40px 20px;">
                  <table role="presentation" style="max-width:480px;width:100%;border-collapse:collapse;">
                    <tr><td style="text-align:center;padding-bottom:30px;">
                      <h1 style="color:#1282a2;font-size:28px;margin:0;">Direct Recruit</h1>
                    </td></tr>
                    <tr><td style="background-color:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:40px 30px;">
                      <h2 style="color:#1a1a2e;font-size:22px;margin:0 0 20px 0;">A note about your recent activity</h2>
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        We received a report regarding ${contentType ? `a recent ${contentType}` : 'recent content'} you posted on Direct Recruit. The report cited <strong>${reasonLabel}</strong>.
                      </p>
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        We're sharing this as a one-time courtesy notice. Repeated violations of our community guidelines may result in content removal or account suspension.
                      </p>
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        If you believe this report was made in error, you don't need to take any action.
                      </p>
                      <p style="color:#888;font-size:13px;margin:24px 0 0 0;">— The Direct Recruit Team</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `A note about your recent activity\n\nWe received a report regarding ${contentType ? `a recent ${contentType}` : 'recent content'} you posted on Direct Recruit. The report cited ${reasonLabel}.\n\nThis is a one-time courtesy notice. Repeated violations of our community guidelines may result in content removal or account suspension.\n\nIf you believe this report was made in error, you don't need to take any action.\n\n— The Direct Recruit Team`,
          Charset: 'UTF-8'
        }
      }
    }
  };
  try {
    await sesClient.send(new SendEmailCommand(params));
  } catch (e) {
    logger.error('sendModerationWarning failed:', e.message);
  }
}

// Moderation: suspension notice sent when admin suspends a user (Fix #10).
async function sendSuspensionNotification(toEmail, { reason } = {}) {
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'Your Direct Recruit account has been suspended', Charset: 'UTF-8' },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
                <tr><td align="center" style="padding:40px 20px;">
                  <table role="presentation" style="max-width:480px;width:100%;border-collapse:collapse;">
                    <tr><td style="text-align:center;padding-bottom:30px;">
                      <h1 style="color:#1282a2;font-size:28px;margin:0;">Direct Recruit</h1>
                    </td></tr>
                    <tr><td style="background-color:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:40px 30px;">
                      <h2 style="color:#b91c1c;font-size:22px;margin:0 0 20px 0;">Your account has been suspended</h2>
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        Your Direct Recruit account has been suspended for violating our community guidelines.
                      </p>
                      ${reason ? `<p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;"><strong>Reason:</strong> ${reason}</p>` : ''}
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        You will not be able to access your account or post on Direct Recruit while this suspension is active.
                      </p>
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        If you believe this suspension was applied in error, you may reply to this email to appeal.
                      </p>
                      <p style="color:#888;font-size:13px;margin:24px 0 0 0;">— The Direct Recruit Team</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `Your account has been suspended\n\nYour Direct Recruit account has been suspended for violating our community guidelines.\n\n${reason ? `Reason: ${reason}\n\n` : ''}You will not be able to access your account or post on Direct Recruit while this suspension is active.\n\nIf you believe this suspension was applied in error, you may reply to this email to appeal.\n\n— The Direct Recruit Team`,
          Charset: 'UTF-8'
        }
      }
    }
  };
  try {
    await sesClient.send(new SendEmailCommand(params));
  } catch (e) {
    logger.error('sendSuspensionNotification failed:', e.message);
  }
}

// Moderation: content-removal notice sent when admin deletes a user's content (Fix #10).
async function sendContentRemovalNotification(toEmail, { contentType, reason } = {}) {
  const reasonLabel = reason ? reason.replace(/_/g, ' ') : 'a community guidelines violation';
  const params = {
    Source: FROM_EMAIL,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: `Your ${contentType || 'content'} was removed - Direct Recruit`, Charset: 'UTF-8' },
      Body: {
        Html: {
          Data: `
            <!DOCTYPE html>
            <html><head><meta charset="UTF-8"></head>
            <body style="margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f4;">
              <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f4f4f4;">
                <tr><td align="center" style="padding:40px 20px;">
                  <table role="presentation" style="max-width:480px;width:100%;border-collapse:collapse;">
                    <tr><td style="text-align:center;padding-bottom:30px;">
                      <h1 style="color:#1282a2;font-size:28px;margin:0;">Direct Recruit</h1>
                    </td></tr>
                    <tr><td style="background-color:#ffffff;border:1px solid #e0e0e0;border-radius:8px;padding:40px 30px;">
                      <h2 style="color:#1a1a2e;font-size:22px;margin:0 0 20px 0;">Your ${contentType || 'content'} was removed</h2>
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        A ${contentType || 'piece of content'} you posted on Direct Recruit was removed after a report citing <strong>${reasonLabel}</strong>.
                      </p>
                      <p style="color:#555;font-size:16px;line-height:1.6;margin:0 0 16px 0;">
                        Continued violations may result in account suspension.
                      </p>
                      <p style="color:#888;font-size:13px;margin:24px 0 0 0;">— The Direct Recruit Team</p>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
          `,
          Charset: 'UTF-8'
        },
        Text: {
          Data: `Your ${contentType || 'content'} was removed\n\nA ${contentType || 'piece of content'} you posted on Direct Recruit was removed after a report citing ${reasonLabel}.\n\nContinued violations may result in account suspension.\n\n— The Direct Recruit Team`,
          Charset: 'UTF-8'
        }
      }
    }
  };
  try {
    await sesClient.send(new SendEmailCommand(params));
  } catch (e) {
    logger.error('sendContentRemovalNotification failed:', e.message);
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
  sendQuestionnaireConfirmation,
  sendReportNotification,
  sendModerationWarning,
  sendSuspensionNotification,
  sendContentRemovalNotification
};
