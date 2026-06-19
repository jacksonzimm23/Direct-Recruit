const pool = require('../config/database');

class User {
  // Create user (now without password - Cognito handles auth).
  // dateOfBirth is the account-level age signal captured at the 13+ age gate.
  // termsAcceptedAt/termsVersion/termsAcceptedIp record ToS/Privacy acceptance
  // server-side. All are optional so existing callers/back-compat paths don't
  // break, but the register route always supplies them.
  static async create({ email, role, cognitoSub, dateOfBirth = null, termsAcceptedAt = null, termsVersion = null, termsAcceptedIp = null }) {
    const result = await pool.query(
      `INSERT INTO users (email, role, cognito_sub, date_of_birth, terms_accepted_at, terms_version, terms_accepted_ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, role, created_at`,
      [email, role, cognitoSub, dateOfBirth, termsAcceptedAt, termsVersion, termsAcceptedIp]
    );
    return result.rows[0];
  }

  // Security #15: explicit projection. Excludes sensitive columns
  // (cognito_sub, password_hash, stripe_customer_id, stripe_subscription_id,
  // subscription_source) that callers may inadvertently spread into responses.
  // Matches findById() so user-lookup return shape is canonical.
  static async findByEmail(email) {
    const result = await pool.query(
      `SELECT id, email, username, role, profile_completed, is_active,
              email_verified, subscription_status, subscription_tier,
              last_profile_switch_at, is_suspended
       FROM users WHERE email = $1`,
      [email]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT id, email, username, role, created_at, email_verified, profile_completed, is_active, last_profile_switch_at, subscription_status, subscription_tier, is_suspended, push_enabled FROM users WHERE id = $1', [id]);
    return result.rows[0];
  }

  // Account-wide push-notification on/off. Source of truth for the iOS push
  // toggle; notifyUser() reads this before fanning out to APNs.
  static async setPushEnabled(userId, enabled) {
    const result = await pool.query(
      'UPDATE users SET push_enabled = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id, push_enabled',
      [userId, enabled]
    );
    return result.rows[0];
  }

  // Security #15: same canonical projection as findByEmail. Currently no
  // callers in the backend, but tightened preemptively so any future Cognito
  // flow wired up to this method doesn't leak sensitive columns.
  static async findByCognitoSub(cognitoSub) {
    const result = await pool.query(
      `SELECT id, email, username, role, profile_completed, is_active,
              email_verified, subscription_status, subscription_tier,
              last_profile_switch_at, is_suspended
       FROM users WHERE cognito_sub = $1`,
      [cognitoSub]
    );
    return result.rows[0];
  }

  // Suspend a user (Fix #10 — admin moderation action). Sets is_suspended
  // and records audit columns. Returns the updated row or null if not found.
  // suspendedByUserId is nullable (admins don't have user accounts).
  static async suspendUser(userId, { reason = null, suspendedByUserId = null } = {}) {
    const result = await pool.query(
      `UPDATE users
       SET is_suspended = TRUE,
           suspended_at = NOW(),
           suspended_by = $2,
           suspension_reason = $3
       WHERE id = $1
       RETURNING id, email, role, is_suspended, suspended_at, suspension_reason`,
      [userId, suspendedByUserId, reason]
    );
    return result.rows[0] || null;
  }

  // Reverse a suspension. Clears audit columns too so the row looks pristine.
  static async unsuspendUser(userId) {
    const result = await pool.query(
      `UPDATE users
       SET is_suspended = FALSE,
           suspended_at = NULL,
           suspended_by = NULL,
           suspension_reason = NULL
       WHERE id = $1
       RETURNING id, email, role, is_suspended`,
      [userId]
    );
    return result.rows[0] || null;
  }

  // List currently-suspended users for the admin panel.
  static async listSuspended(limit = 100) {
    const result = await pool.query(
      `SELECT u.id, u.email, u.role, u.suspended_at, u.suspension_reason,
              COALESCE(pp.first_name, cp.first_name, op.first_name) AS first_name,
              COALESCE(pp.last_name, cp.last_name, op.last_name) AS last_name,
              COALESCE(pp.username, cp.username, op.username) AS username
       FROM users u
       LEFT JOIN player_profiles pp ON pp.user_id = u.id
       LEFT JOIN coach_profiles cp ON cp.user_id = u.id
       LEFT JOIN other_profiles op ON op.user_id = u.id
       WHERE u.is_suspended = TRUE
       ORDER BY u.suspended_at DESC
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }

  // Security #15: only caller (username-availability check) needs existence
  // truthiness. Project to `id` only — any future caller that wants more
  // columns has to make a deliberate choice rather than implicitly inherit
  // SELECT *.
  static async findByUsername(username) {
    const result = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
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

  // Entitlement↔profile-type validation: which subscription tiers may activate
  // which profile subtype. A still-active product the user bought for a
  // DIFFERENT profile type (e.g. a $10 player IAP on a collegecoach account)
  // must never unlock the current one. Used by the RevenueCat webhook,
  // /iap-reconcile, the Stripe checkout/webhook paths, and profile switching.
  static ALLOWED_TIERS_BY_SUBTYPE = {
    hsplayer: ['player'],
    transferplayer: ['player'],            // same product as hsplayer — interchangeable
    collegecoach: ['starter', 'pro', 'elite']
    // collegeplayer / hscoach / other: absent → no paid tiers
  };

  // Role fallback: the coach signup flow purchases BEFORE the profile row is
  // created, so when subtype is null we validate against the account role.
  static allowedTiersFor({ subtype, role }) {
    if (subtype) return User.ALLOWED_TIERS_BY_SUBTYPE[subtype] || [];
    if (role === 'player') return ['player'];
    if (role === 'coach') return ['starter', 'pro', 'elite'];
    return [];
  }

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

  // Returns { role, subtype } for a user. subtype is null when the profile row
  // doesn't exist yet — the coach signup flow purchases the IAP BEFORE the
  // profile row is created, so subscription validation must fall back to a
  // role-based check in that window. Accepts a pg client so webhook/reconcile
  // callers can run it inside a row-locked transaction.
  static async getSubtypeAndRole(userId, client = pool) {
    const userRes = await client.query('SELECT role FROM users WHERE id = $1', [userId]);
    const role = userRes.rows[0]?.role || null;
    if (!role) return { role: null, subtype: null };

    let profile = null;
    if (role === 'player') {
      const r = await client.query(
        'SELECT transfer, college_division FROM player_profiles WHERE user_id = $1',
        [userId]
      );
      profile = r.rows[0] || null;
    } else if (role === 'coach') {
      const r = await client.query(
        'SELECT college_division FROM coach_profiles WHERE user_id = $1',
        [userId]
      );
      profile = r.rows[0] || null;
    } else {
      const r = await client.query('SELECT 1 FROM other_profiles WHERE user_id = $1', [userId]);
      profile = r.rows[0] || null;
    }

    return { role, subtype: profile ? User.getSubtypeFromProfile(role, profile) : null };
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
  //
  // Security #17: optional `client` parameter so callers inside a transaction
  // (e.g. profile-switch) can pass their pg.Client and have this UPDATE
  // participate in the same atomic unit. Defaults to the pool for autocommit
  // behavior — all existing callers (webhooks, etc.) work unchanged.
  static async updateSubscription(userId, { subscriptionId, status, tier, source }, client = pool) {
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
    await client.query(
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

  // Verify-then-pay (cross-type paid->paid switch): atomically read AND clear the
  // OLD Stripe subscription id that a profile switch stashed for later cancellation.
  // Returns the old sub id (or null). The payments webhook calls this once the NEW
  // subscription activates, then cancels that old sub via Stripe. Clearing it in the
  // same statement makes the webhook idempotent — a duplicate webhook reads null and
  // skips. A CTE captures the prior value (plain UPDATE...RETURNING gives the new row).
  static async takePendingCancelSubId(userId) {
    const result = await pool.query(
      `WITH prev AS (
         SELECT id, pending_cancel_stripe_sub_id AS old_sub_id
           FROM users
          WHERE id = $1 AND pending_cancel_stripe_sub_id IS NOT NULL
          FOR UPDATE
       ), cleared AS (
         UPDATE users SET pending_cancel_stripe_sub_id = NULL
          WHERE id IN (SELECT id FROM prev)
       )
       SELECT old_sub_id FROM prev`,
      [userId]
    );
    return result.rows[0] ? result.rows[0].old_sub_id : null;
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
