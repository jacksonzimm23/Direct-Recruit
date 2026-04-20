const pool = require('../config/database');

class User {
  // Create user (now without password - Cognito handles auth)
  static async create({ email, role, cognitoSub }) {
    const result = await pool.query(
      'INSERT INTO users (email, role, cognito_sub) VALUES ($1, $2, $3) RETURNING id, email, role, created_at',
      [email, role, cognitoSub]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT id, email, username, role, created_at, email_verified, profile_completed, is_active, last_profile_switch_at, subscription_status, subscription_tier FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findByCognitoSub(cognitoSub) {
    const result = await pool.query('SELECT * FROM users WHERE cognito_sub = $1', [cognitoSub]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0];
  }

  static async updateUsername(userId, username) {
    const result = await pool.query(
      'UPDATE users SET username = $1 WHERE id = $2 RETURNING *',
      [username, userId]
    );
    return result.rows[0];
  }

  static async updateCognitoSub(userId, cognitoSub) {
    await pool.query('UPDATE users SET cognito_sub = $1 WHERE id = $2', [cognitoSub, userId]);
  }

  static async updateLastLogin(userId) {
    await pool.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [userId]);
  }

  static async markProfileCompleted(userId) {
    await pool.query('UPDATE users SET profile_completed = true WHERE id = $1', [userId]);
  }

  static async markEmailVerified(userId) {
    await pool.query('UPDATE users SET email_verified = true WHERE id = $1', [userId]);
  }

  static async updateEmail(userId, newEmail) {
    const result = await pool.query(
      'UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, role',
      [newEmail, userId]
    );
    return result.rows[0];
  }

  static COLLEGE_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'];

  static PAID_TYPES = ['collegecoach', 'hsplayer', 'transferplayer'];

  static getSubtypeFromProfile(role, profile) {
    if (role === 'coach') {
      return (profile.college_division && User.COLLEGE_DIVISIONS.includes(profile.college_division)) ? 'collegecoach' : 'hscoach';
    } else if (role === 'other') {
      return 'other';
    } else {
      if (profile.transfer === 'y' || profile.is_transfer_player) return 'transferplayer';
      if (profile.college_division && User.COLLEGE_DIVISIONS.includes(profile.college_division)) return 'collegeplayer';
      return 'hsplayer';
    }
  }

  static getBaseRole(subtype) {
    if (['hsplayer', 'collegeplayer', 'transferplayer'].includes(subtype)) return 'player';
    if (['hscoach', 'collegecoach'].includes(subtype)) return 'coach';
    return 'other';
  }

  // ─── Stripe Subscription Methods ──────────────────────────────────────────

  static async getStripeCustomerId(userId) {
    const result = await pool.query('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.stripe_customer_id || null;
  }

  static async updateStripeCustomerId(userId, customerId) {
    await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, userId]);
  }

  // NOTE: when source='apple_iap', the `subscriptionId` field stores
  // RevenueCat's original_transaction_id, NOT a Stripe sub id. The column
  // name is historical — it now holds "external payment processor sub id"
  // regardless of processor. Always pair with `source` to interpret correctly.
  static async updateSubscription(userId, { subscriptionId, status, tier, source }) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (subscriptionId !== undefined) {
      fields.push(`stripe_subscription_id = $${idx++}`);
      values.push(subscriptionId);
    }
    if (status !== undefined) {
      fields.push(`subscription_status = $${idx++}`);
      values.push(status);
    }
    if (tier !== undefined) {
      fields.push(`subscription_tier = $${idx++}`);
      values.push(tier);
    }
    if (source !== undefined) {
      fields.push(`subscription_source = $${idx++}`);
      values.push(source);
    }

    if (fields.length === 0) return;

    values.push(userId);
    await pool.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
      values
    );
  }

  static async getSubscriptionInfo(userId) {
    const result = await pool.query(
      'SELECT stripe_customer_id, stripe_subscription_id, subscription_status, subscription_tier, subscription_source FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  // Delete user and all associated data
  // PostgreSQL CASCADE constraints handle most related data automatically
  static async delete(userId) {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, email',
      [userId]
    );
    return result.rows[0];
  }
}

module.exports = User;
