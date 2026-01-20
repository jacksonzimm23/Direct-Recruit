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
    console.log('[Email] Verification email sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('[Email] Failed to send verification email:', error);
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
    console.log('[Email] Email change confirmation sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('[Email] Failed to send email change confirmation:', error);
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
    console.log('[Email] Password change confirmation sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('[Email] Failed to send password change confirmation:', error);
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
    console.log('[Email] Password reset verification sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('[Email] Failed to send password reset verification:', error);
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
    console.log('[Email] Account deletion confirmation sent to:', toEmail, 'MessageId:', response.MessageId);
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('[Email] Failed to send account deletion confirmation:', error);
    // Don't throw - this is a non-critical notification
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendEmailChangeVerification,
  sendEmailChangeConfirmation,
  sendPasswordChangeConfirmation,
  sendPasswordResetVerification,
  sendAccountDeletionConfirmation
};
