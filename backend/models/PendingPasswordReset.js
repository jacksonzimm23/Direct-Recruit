const pool = require('../config/database');

class PendingPasswordReset {
  // Create a pending password reset record
  static async create(userId, email, verificationCode) {
    // Delete any existing pending resets for this user first
    await pool.query('DELETE FROM pending_password_resets WHERE user_id = $1', [userId]);

    // Create new pending reset with 15-minute expiration (shorter for security)
    const result = await pool.query(
      `INSERT INTO pending_password_resets (user_id, email, verification_code, expires_at, resend_count)
       VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes', 0)
       RETURNING *`,
      [userId, email, verificationCode]
    );
    return result.rows[0];
  }

  // Find pending reset by user ID
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT * FROM pending_password_resets
       WHERE user_id = $1 AND expires_at > NOW()`,
      [userId]
    );
    return result.rows[0];
  }

  // Verify code and get pending reset
  static async verifyCode(userId, code) {
    const result = await pool.query(
      `SELECT * FROM pending_password_resets
       WHERE user_id = $1 AND verification_code = $2 AND expires_at > NOW()`,
      [userId, code]
    );
    return result.rows[0];
  }

  // Mark code as verified (so it can't be used again but user can still set password)
  static async markVerified(userId) {
    const result = await pool.query(
      `UPDATE pending_password_resets
       SET verified = true
       WHERE user_id = $1 AND expires_at > NOW()
       RETURNING *`,
      [userId]
    );
    return result.rows[0];
  }

  // Check if reset is verified
  static async isVerified(userId) {
    const result = await pool.query(
      `SELECT * FROM pending_password_resets
       WHERE user_id = $1 AND verified = true AND expires_at > NOW()`,
      [userId]
    );
    return result.rows[0];
  }

  // Delete pending reset (after successful password change or cancellation)
  static async delete(userId) {
    await pool.query('DELETE FROM pending_password_resets WHERE user_id = $1', [userId]);
  }

  // Clean up expired records (can be run periodically)
  static async cleanupExpired() {
    await pool.query('DELETE FROM pending_password_resets WHERE expires_at <= NOW()');
  }

  // Update verification code and increment resend count
  static async updateCodeAndIncrementResend(userId, newCode) {
    const result = await pool.query(
      `UPDATE pending_password_resets
       SET verification_code = $2,
           resend_count = resend_count + 1,
           last_resend_at = NOW(),
           verified = false
       WHERE user_id = $1 AND expires_at > NOW()
       RETURNING *`,
      [userId, newCode]
    );
    return result.rows[0];
  }

  // Set cooldown until timestamp
  static async setCooldown(userId, minutes) {
    const result = await pool.query(
      `UPDATE pending_password_resets
       SET cooldown_until = NOW() + INTERVAL '${minutes} minutes'
       WHERE user_id = $1
       RETURNING *`,
      [userId]
    );
    return result.rows[0];
  }

  // Check if user is in cooldown
  static async isInCooldown(userId) {
    const result = await pool.query(
      `SELECT cooldown_until FROM pending_password_resets
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
      `UPDATE pending_password_resets
       SET resend_count = 0, cooldown_until = NULL
       WHERE user_id = $1`,
      [userId]
    );
  }
}

module.exports = PendingPasswordReset;
