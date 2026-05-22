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

async function sendCoachRequestNotification(toEmail, data) {
  const typeLabel = data.is_team_switch
    ? `🏫 TEAM SWITCH (from ${data.old_team_name || 'unknown'}${data.old_division ? ` — ${data.old_division}` : ''})`
    : data.is_switch ? '🔄 PROFILE-TYPE SWITCH' : '🆕 NEW SIGNUP';
  console.log('\n[LOCAL EMAIL] Coach Request Notification');
  console.log(`  To: ${toEmail}`);
  console.log(`  Type: ${typeLabel}`);
  console.log(`  Name: ${data.first_name} ${data.last_name}`);
  console.log(`  School: ${data.school}`);
  console.log(`  Division: ${data.division || '(not provided)'}`);
  console.log(`  Position: ${data.position}`);
  console.log(`  Phone: ${data.phone || '(not provided)'}`);
  console.log(`  .edu Email: ${data.edu_email}`);
  console.log(`  Personal Email: ${data.personal_email}`);
  console.log(`  Notes: ${data.notes || '(none)'}`);
  console.log('  (Review in admin dashboard at /frontend/admin/coach-verification.html)\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendCoachInvite(toEmail, data, link) {
  const typeLabel = data.is_team_switch
    ? `🏫 TEAM SWITCH (from ${data.old_team_name || 'unknown'} → ${data.school})`
    : data.is_switch ? '🔄 PROFILE-TYPE SWITCH (existing user)'
    : data.is_free ? '🎁 FREE / COMP ACCESS (no Stripe)'
    : '🆕 NEW SIGNUP';
  console.log('\n[LOCAL EMAIL] Coach Invite');
  console.log(`  To: ${toEmail}`);
  console.log(`  Type: ${typeLabel}`);
  console.log(`  Name: ${data.first_name}`);
  console.log(`  School: ${data.school}`);
  console.log(`  Expires: ${data.expires_at || '7 days from now'}`);
  console.log(`  INVITE URL: ${link}`);
  console.log('  (Copy the URL above to test the invite flow)\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendCoachRejection(toEmail, firstName) {
  console.log('\n[LOCAL EMAIL] Coach Rejection');
  console.log(`  To: ${toEmail}`);
  console.log(`  Name: ${firstName}`);
  console.log('  Polite rejection sent.\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendQuestionnaireConfirmation(toEmail, data) {
  console.log('\n[LOCAL EMAIL] Questionnaire Confirmation');
  console.log(`  To: ${toEmail}`);
  console.log(`  Name: ${data && data.firstName}`);
  console.log(`  School: ${data && data.schoolName}`);
  console.log(`  Signup CTA URL: ${data && data.signupUrl}\n`);
  return { success: true, messageId: 'local-dev-' + Date.now() };
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
  sendQuestionnaireConfirmation
};
