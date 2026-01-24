const pool = require('../config/database');

class PendingEmailChange {
  // Create a pending email change record
  static async create(userId, currentEmail, newEmail, verificationCode) {
    // Delete any existing pending changes for this user first
    await pool.query('DELETE FROM pending_email_changes WHERE user_id = $1', [userId]);

    // Create new pending change with 24-hour expiration
    const result = await pool.query(
      `INSERT INTO pending_email_changes (user_id, current_email, new_email, verification_code, expires_at, resend_count)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours', 0)
       RETURNING *`,
      [userId, currentEmail, newEmail, verificationCode]
    );
    return result.rows[0];
  }

  // Find pending change by user ID
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT * FROM pending_email_changes
       WHERE user_id = $1 AND expires_at > NOW()`,
      [userId]
    );
    return result.rows[0];
  }

  // Verify code and get pending change
  static async verifyCode(userId, code) {
    const result = await pool.query(
      `SELECT * FROM pending_email_changes
       WHERE user_id = $1 AND verification_code = $2 AND expires_at > NOW()`,
      [userId, code]
    );
    return result.rows[0];
  }

  // Delete pending change (after successful verification or cancellation)
  static async delete(userId) {
    await pool.query('DELETE FROM pending_email_changes WHERE user_id = $1', [userId]);
  }

  // Clean up expired records (can be run periodically)
  static async cleanupExpired() {
    await pool.query('DELETE FROM pending_email_changes WHERE expires_at <= NOW()');
  }

  // Update verification code and increment resend count
  static async updateCodeAndIncrementResend(userId, newCode) {
    const result = await pool.query(
      `UPDATE pending_email_changes
       SET verification_code = $2,
           resend_count = resend_count + 1,
           last_resend_at = NOW()
       WHERE user_id = $1 AND expires_at > NOW()
       RETURNING *`,
      [userId, newCode]
    );
    return result.rows[0];
  }

  // Set cooldown until timestamp
  static async setCooldown(userId, minutes) {
    const result = await pool.query(
      `UPDATE pending_email_changes
       SET cooldown_until = NOW() + ($2 * INTERVAL '1 minute')
       WHERE user_id = $1
       RETURNING *`,
      [userId, minutes]
    );
    return result.rows[0];
  }

  // Check if user is in cooldown
  static async isInCooldown(userId) {
    const result = await pool.query(
      `SELECT cooldown_until FROM pending_email_changes
       WHERE user_id = $1 AND cooldown_until > NOW()`,
      [userId]
    );
    if (result.rows[0]) {
      return {
        inCooldown: true,
        cooldownUntil: result.rows[0].cooldown_until
      };
    }
    return { inCooldown: false };
  }

  // Reset resend count (called when cooldown expires and user tries again)
  static async resetResendCount(userId) {
    await pool.query(
      `UPDATE pending_email_changes
       SET resend_count = 0, cooldown_until = NULL
       WHERE user_id = $1`,
      [userId]
    );
  }
}

module.exports = PendingEmailChange;
