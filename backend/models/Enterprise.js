const pool = require('../config/database');

class Enterprise {
  // ─── Create / Read ─────────────────────────────────────────────────────────

  static async create({
    orgName,
    billingEmail,
    adminUserId = null,
    stripeCustomerId = null,
    stripeSubscriptionId = null,
    stripeInvoiceId = null,
    subscriptionStatus = 'none',
    playerSeatsPaid = 0,
    coachSeatsPaid = 0,
    monthlyPricePerPlayer = null,
    monthlyPricePerCoach = null,
    prorateOnSeatChange = true,
    notes = null
  }) {
    const result = await pool.query(
      `INSERT INTO enterprises (
         org_name, billing_email, admin_user_id,
         stripe_customer_id, stripe_subscription_id, stripe_invoice_id,
         subscription_status,
         player_seats_paid, coach_seats_paid,
         monthly_price_per_player, monthly_price_per_coach,
         prorate_on_seat_change, notes
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        orgName, billingEmail, adminUserId,
        stripeCustomerId, stripeSubscriptionId, stripeInvoiceId,
        subscriptionStatus,
        playerSeatsPaid, coachSeatsPaid,
        monthlyPricePerPlayer, monthlyPricePerCoach,
        prorateOnSeatChange, notes
      ]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM enterprises WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  static async findByAdminUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM enterprises WHERE admin_user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  static async findByStripeCustomerId(customerId) {
    const result = await pool.query(
      'SELECT * FROM enterprises WHERE stripe_customer_id = $1',
      [customerId]
    );
    return result.rows[0] || null;
  }

  static async findByStripeSubscriptionId(subId) {
    const result = await pool.query(
      'SELECT * FROM enterprises WHERE stripe_subscription_id = $1',
      [subId]
    );
    return result.rows[0] || null;
  }

  // ─── Seat Usage ────────────────────────────────────────────────────────────

  // "used"    = seat claimed (user_id NOT NULL, revoked_at NULL)
  // "pending" = invite sent, seat row exists but not claimed (user_id NULL, revoked_at NULL)
  // "available" = paid − used − pending (floored at 0). Pending consumes availability
  // so admin cannot oversell — enforced by canAddSeat().
  static async getSeatUsage(enterpriseId) {
    const [entRow, counts] = await Promise.all([
      pool.query(
        'SELECT player_seats_paid, coach_seats_paid FROM enterprises WHERE id = $1',
        [enterpriseId]
      ),
      pool.query(
        `SELECT seat_type,
                COUNT(*) FILTER (WHERE user_id IS NOT NULL) AS used_count,
                COUNT(*) FILTER (WHERE user_id IS NULL)     AS pending_count
           FROM enterprise_seats
          WHERE enterprise_id = $1 AND revoked_at IS NULL
          GROUP BY seat_type`,
        [enterpriseId]
      )
    ]);
    if (!entRow.rows[0]) return null;

    const { player_seats_paid, coach_seats_paid } = entRow.rows[0];
    const byType = {
      hsplayer:     { used: 0, pending: 0 },
      collegecoach: { used: 0, pending: 0 }
    };
    for (const r of counts.rows) {
      byType[r.seat_type] = {
        used:    parseInt(r.used_count, 10),
        pending: parseInt(r.pending_count, 10)
      };
    }

    return {
      player_seats_paid,
      player_seats_used:      byType.hsplayer.used,
      player_seats_pending:   byType.hsplayer.pending,
      player_seats_available: Math.max(0, player_seats_paid - byType.hsplayer.used - byType.hsplayer.pending),
      coach_seats_paid,
      coach_seats_used:      byType.collegecoach.used,
      coach_seats_pending:   byType.collegecoach.pending,
      coach_seats_available: Math.max(0, coach_seats_paid - byType.collegecoach.used - byType.collegecoach.pending)
    };
  }

  static async canAddSeat(enterpriseId, seatType) {
    const usage = await Enterprise.getSeatUsage(enterpriseId);
    if (!usage) return false;
    if (seatType === 'hsplayer')     return usage.player_seats_available > 0;
    if (seatType === 'collegecoach') return usage.coach_seats_available  > 0;
    return false;
  }

  // ─── Mutations ─────────────────────────────────────────────────────────────

  static async updateSeatCounts(enterpriseId, { playerSeatsPaid, coachSeatsPaid }) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (playerSeatsPaid !== undefined) {
      fields.push(`player_seats_paid = $${idx++}`);
      values.push(playerSeatsPaid);
    }
    if (coachSeatsPaid !== undefined) {
      fields.push(`coach_seats_paid = $${idx++}`);
      values.push(coachSeatsPaid);
    }
    if (fields.length === 0) return null;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(enterpriseId);

    const result = await pool.query(
      `UPDATE enterprises SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  static async updateSubscriptionStatus(enterpriseId, status) {
    const result = await pool.query(
      `UPDATE enterprises
          SET subscription_status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *`,
      [status, enterpriseId]
    );
    return result.rows[0] || null;
  }

  static async updateStripeIds(enterpriseId, { stripeCustomerId, stripeSubscriptionId, stripeInvoiceId }) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (stripeCustomerId !== undefined) {
      fields.push(`stripe_customer_id = $${idx++}`);
      values.push(stripeCustomerId);
    }
    if (stripeSubscriptionId !== undefined) {
      fields.push(`stripe_subscription_id = $${idx++}`);
      values.push(stripeSubscriptionId);
    }
    if (stripeInvoiceId !== undefined) {
      fields.push(`stripe_invoice_id = $${idx++}`);
      values.push(stripeInvoiceId);
    }
    if (fields.length === 0) return null;

    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(enterpriseId);

    const result = await pool.query(
      `UPDATE enterprises SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  static async setAdminUserId(enterpriseId, adminUserId) {
    const result = await pool.query(
      `UPDATE enterprises
          SET admin_user_id = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *`,
      [adminUserId, enterpriseId]
    );
    return result.rows[0] || null;
  }

  static async markCancelled(enterpriseId) {
    const result = await pool.query(
      `UPDATE enterprises
          SET subscription_status = 'cancelled',
              cancelled_at = CURRENT_TIMESTAMP,
              updated_at   = CURRENT_TIMESTAMP
        WHERE id = $1 RETURNING *`,
      [enterpriseId]
    );
    return result.rows[0] || null;
  }
}

module.exports = Enterprise;
