/**
 * Local development mock for AWS SES email service.
 * Logs email content to console instead of sending real emails.
 * Production is NOT affected — this file is only loaded when NODE_ENV !== 'production'.
 */

async function sendEmailChangeVerification(toEmail, verificationCode) {
  console.log('\n[LOCAL EMAIL] Email Change Verification');
  console.log(`  To: ${toEmail}`);
  console.log(`  Verification Code: ${verificationCode}`);
  console.log('  (Copy this code to verify)\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendEmailChangeConfirmation(toEmail) {
  console.log('\n[LOCAL EMAIL] Email Change Confirmation');
  console.log(`  To: ${toEmail}`);
  console.log('  Email has been successfully changed.\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendPasswordChangeConfirmation(toEmail) {
  console.log('\n[LOCAL EMAIL] Password Change Confirmation');
  console.log(`  To: ${toEmail}`);
  console.log('  Password has been successfully changed.\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendPasswordResetVerification(toEmail, verificationCode) {
  console.log('\n[LOCAL EMAIL] Password Reset Verification');
  console.log(`  To: ${toEmail}`);
  console.log(`  Verification Code: ${verificationCode}`);
  console.log('  (Copy this code to reset password)\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendAccountDeletionConfirmation(toEmail) {
  console.log('\n[LOCAL EMAIL] Account Deletion Confirmation');
  console.log(`  To: ${toEmail}`);
  console.log('  Account has been deleted.\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

module.exports = {
  sendEmailChangeVerification,
  sendEmailChangeConfirmation,
  sendPasswordChangeConfirmation,
  sendPasswordResetVerification,
  sendAccountDeletionConfirmation
};
