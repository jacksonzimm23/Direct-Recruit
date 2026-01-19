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
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1b2a;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <!-- Header -->
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <!-- Content Box -->
                      <tr>
                        <td style="background: linear-gradient(145deg, rgba(26, 26, 46, 0.98), rgba(22, 22, 40, 0.98)); border: 1px solid rgba(18, 130, 162, 0.3); border-radius: 16px; padding: 40px 30px;">
                          <h2 style="color: #fefcfb; font-size: 24px; margin: 0 0 20px 0; text-align: center;">Verify Your New Email</h2>
                          <p style="color: rgba(254, 252, 251, 0.8); font-size: 16px; line-height: 1.6; margin: 0 0 30px 0; text-align: center;">
                            You requested to change your email address. Use the verification code below to confirm this change.
                          </p>
                          <!-- Verification Code -->
                          <div style="background: rgba(18, 130, 162, 0.15); border: 2px solid rgba(18, 130, 162, 0.3); border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 30px;">
                            <p style="color: rgba(254, 252, 251, 0.6); font-size: 14px; margin: 0 0 10px 0;">Your verification code:</p>
                            <p style="color: #1282a2; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; font-family: monospace;">${verificationCode}</p>
                          </div>
                          <p style="color: rgba(254, 252, 251, 0.6); font-size: 14px; line-height: 1.5; margin: 0; text-align: center;">
                            This code will expire in 24 hours.<br>
                            If you didn't request this change, you can safely ignore this email.
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: rgba(254, 252, 251, 0.4); font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} Direct Recruit. All rights reserved.
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
            <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #0d1b2a;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td align="center" style="padding: 40px 20px;">
                    <table role="presentation" style="max-width: 480px; width: 100%; border-collapse: collapse;">
                      <!-- Header -->
                      <tr>
                        <td style="text-align: center; padding-bottom: 30px;">
                          <h1 style="color: #1282a2; font-size: 28px; margin: 0;">Direct Recruit</h1>
                        </td>
                      </tr>
                      <!-- Content Box -->
                      <tr>
                        <td style="background: linear-gradient(145deg, rgba(26, 26, 46, 0.98), rgba(22, 22, 40, 0.98)); border: 1px solid rgba(18, 130, 162, 0.3); border-radius: 16px; padding: 40px 30px;">
                          <!-- Success Icon -->
                          <div style="text-align: center; margin-bottom: 20px;">
                            <div style="display: inline-block; width: 60px; height: 60px; background: rgba(34, 197, 94, 0.2); border-radius: 50%; line-height: 60px;">
                              <span style="color: #22c55e; font-size: 32px;">✓</span>
                            </div>
                          </div>
                          <h2 style="color: #fefcfb; font-size: 24px; margin: 0 0 20px 0; text-align: center;">Email Successfully Changed</h2>
                          <p style="color: rgba(254, 252, 251, 0.8); font-size: 16px; line-height: 1.6; margin: 0 0 20px 0; text-align: center;">
                            Your Direct Recruit account email has been successfully updated to this address.
                          </p>
                          <div style="background: rgba(18, 130, 162, 0.15); border: 1px solid rgba(18, 130, 162, 0.3); border-radius: 8px; padding: 15px; margin-bottom: 20px;">
                            <p style="color: rgba(254, 252, 251, 0.6); font-size: 14px; margin: 0; text-align: center;">
                              <strong style="color: #fefcfb;">New email:</strong> ${toEmail}
                            </p>
                          </div>
                          <p style="color: rgba(254, 252, 251, 0.6); font-size: 14px; line-height: 1.5; margin: 0; text-align: center;">
                            If you did not make this change, please contact our support team immediately.
                          </p>
                        </td>
                      </tr>
                      <!-- Footer -->
                      <tr>
                        <td style="text-align: center; padding-top: 30px;">
                          <p style="color: rgba(254, 252, 251, 0.4); font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} Direct Recruit. All rights reserved.
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

module.exports = {
  sendEmailChangeVerification,
  sendEmailChangeConfirmation
};
