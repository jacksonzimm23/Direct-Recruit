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
  console.log('\n[LOCAL EMAIL] Coach Request Notification');
  console.log(`  To: ${toEmail}`);
  console.log(`  Type: ${data.is_switch ? '🔄 SWITCH from existing account' : '🆕 NEW SIGNUP'}`);
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
  console.log('\n[LOCAL EMAIL] Coach Invite');
  console.log(`  To: ${toEmail}`);
  console.log(`  Type: ${data.is_switch ? '🔄 SWITCH (existing user)' : '🆕 NEW SIGNUP'}`);
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

async function sendEnterpriseInquiryNotification(toEmail, data) {
  console.log('\n[LOCAL EMAIL] Enterprise Inquiry Notification');
  console.log(`  To: ${toEmail}`);
  console.log('  Type: 🏫 NEW ENTERPRISE INQUIRY');
  console.log(`  Name: ${data.first_name} ${data.last_name}`);
  console.log(`  School: ${data.school}`);
  console.log(`  Phone: ${data.phone}`);
  console.log(`  Personal Email: ${data.personal_email}`);
  console.log(`  Notes: ${data.notes || '(none)'}`);
  console.log('  (Review in admin dashboard at /frontend/admin/coach-verification.html → Enterprise Requests tab)\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendEnterpriseApproval(toEmail, data) {
  console.log('\n[LOCAL EMAIL] Enterprise Inquiry — APPROVED');
  console.log(`  To: ${toEmail}`);
  console.log(`  Name: ${data.first_name} ${data.last_name}`);
  console.log(`  School: ${data.school}`);
  console.log('  Status: ✅ APPROVED');
  console.log('  (Status update logged for Jackson; no outbound email to inquirer yet.)\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendEnterpriseRejection(toEmail, data) {
  console.log('\n[LOCAL EMAIL] Enterprise Inquiry — REJECTED');
  console.log(`  To: ${toEmail}`);
  console.log(`  Name: ${data.first_name} ${data.last_name}`);
  console.log(`  School: ${data.school}`);
  console.log('  Status: ❌ REJECTED');
  console.log(`  Reason (internal): ${data.reason || '(none)'}`);
  console.log('  (Status update logged for Jackson; no outbound email to inquirer yet.)\n');
  return { success: true, messageId: 'local-dev-' + Date.now() };
}

async function sendEnterpriseAdminActivation(toEmail, data, link) {
  console.log('\n[LOCAL EMAIL] 🏢 Enterprise Admin Activation');
  console.log(`  To: ${toEmail}`);
  console.log(`  Org: ${data.org_name}`);
  console.log(`  Admin name: ${data.first_name}`);
  console.log(`  Seats: ${data.player_seats_paid} player(s) + ${data.coach_seats_paid} coach(es)`);
  console.log(`  Expires: ${data.expires_at || '30 days from now'}`);
  console.log(`  ACTIVATION URL: ${link}`);
  console.log('  (Copy the URL above to test the enterprise activation flow)\n');
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
  sendEnterpriseInquiryNotification,
  sendEnterpriseApproval,
  sendEnterpriseRejection,
  sendEnterpriseAdminActivation
};
