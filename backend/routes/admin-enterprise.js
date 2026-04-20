const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const {
  sendEnterpriseApproval,
  sendEnterpriseRejection,
  sendEnterpriseAdminActivation
} = require('../utils/email');

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'jackson@directrecruit.net';
const INVITE_EXPIRY_DAYS = 30;

function buildEnterpriseActivationLink(token) {
  const isProd = process.env.NODE_ENV === 'production';
  const appUrl = process.env.APP_URL || (isProd ? 'https://directrecruit.net' : 'http://localhost:5000');
  const prefix = process.env.FRONTEND_PATH_PREFIX !== undefined
    ? process.env.FRONTEND_PATH_PREFIX
    : (isProd ? '' : '/frontend');
  return `${appUrl}${prefix}/enterprise/activate.html?token=${encodeURIComponent(token)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateApproveBody(body) {
  const errors = [];
  const b = body || {};

  const orgName = typeof b.org_name === 'string' ? b.org_name.trim() : '';
  if (!orgName || orgName.length > 255) errors.push('org_name required (1-255 chars)');

  const billingEmail = typeof b.billing_email === 'string' ? b.billing_email.trim() : '';
  if (!billingEmail || billingEmail.length > 255 || !EMAIL_RE.test(billingEmail)) {
    errors.push('billing_email must be a valid email (max 255)');
  }

  const playerSeats = Number.isInteger(b.player_seats_paid) ? b.player_seats_paid : NaN;
  const coachSeats  = Number.isInteger(b.coach_seats_paid)  ? b.coach_seats_paid  : NaN;
  if (!Number.isInteger(playerSeats) || playerSeats < 0 || playerSeats > 10000) {
    errors.push('player_seats_paid must be an integer 0-10000');
  }
  if (!Number.isInteger(coachSeats) || coachSeats < 0 || coachSeats > 10000) {
    errors.push('coach_seats_paid must be an integer 0-10000');
  }
  if (Number.isInteger(playerSeats) && Number.isInteger(coachSeats) && playerSeats + coachSeats === 0) {
    errors.push('at least one seat must be > 0');
  }

  let pricePlayer = null;
  if (b.monthly_price_per_player !== undefined && b.monthly_price_per_player !== null && b.monthly_price_per_player !== '') {
    pricePlayer = Number(b.monthly_price_per_player);
    if (!Number.isFinite(pricePlayer) || pricePlayer < 0) errors.push('monthly_price_per_player must be >= 0');
  }
  let priceCoach = null;
  if (b.monthly_price_per_coach !== undefined && b.monthly_price_per_coach !== null && b.monthly_price_per_coach !== '') {
    priceCoach = Number(b.monthly_price_per_coach);
    if (!Number.isFinite(priceCoach) || priceCoach < 0) errors.push('monthly_price_per_coach must be >= 0');
  }

  const customerId = typeof b.stripe_customer_id === 'string' ? b.stripe_customer_id.trim() : '';
  const subId      = typeof b.stripe_subscription_id === 'string' ? b.stripe_subscription_id.trim() : '';
  const invoiceId  = typeof b.stripe_invoice_id === 'string' ? b.stripe_invoice_id.trim() : '';
  if (!customerId || customerId.length > 255) errors.push('stripe_customer_id required (max 255)');
  if (!subId      || subId.length      > 255) errors.push('stripe_subscription_id required (max 255)');
  if (!invoiceId  || invoiceId.length  > 255) errors.push('stripe_invoice_id required (max 255)');

  const notes = typeof b.notes === 'string' ? b.notes.slice(0, 2000) : null;

  return {
    errors,
    cleaned: errors.length ? null : {
      orgName, billingEmail, playerSeats, coachSeats,
      pricePlayer, priceCoach, customerId, subId, invoiceId, notes
    }
  };
}

// Admin key auth — reuses ADMIN_ANALYTICS_KEY (same key as coach verification + AI analytics)
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_ANALYTICS_KEY) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(adminAuth);

// GET /api/admin/enterprise/inquiries?status=pending|approved|rejected|all
router.get('/inquiries', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const validStatuses = ['pending', 'approved', 'rejected', 'all'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }
    const whereClause = status === 'all' ? '' : 'WHERE status = $1';
    const params = status === 'all' ? [] : [status];

    const [inquiries, counts] = await Promise.all([
      pool.query(
        `SELECT id, first_name, last_name, school, phone, personal_email, notes,
                status, rejected_reason, ip_address, created_at, reviewed_at
           FROM enterprise_inquiries
           ${whereClause}
           ORDER BY created_at DESC
           LIMIT 500`,
        params
      ),
      pool.query(`SELECT status, COUNT(*) AS cnt FROM enterprise_inquiries GROUP BY status`)
    ]);

    const countsObj = { pending: 0, approved: 0, rejected: 0 };
    for (const row of counts.rows) {
      countsObj[row.status] = parseInt(row.cnt, 10);
    }

    res.json({ inquiries: inquiries.rows, counts: countsObj });
  } catch (err) {
    logger.error('[admin-enterprise] list error:', err);
    res.status(500).json({ error: 'Failed to load inquiries' });
  }
});

// POST /api/admin/enterprise/inquiries/:id/approve
//
// Body shape (all required except monthly_price_per_* and notes):
//   org_name, billing_email, player_seats_paid, coach_seats_paid,
//   monthly_price_per_player?, monthly_price_per_coach?,
//   stripe_customer_id, stripe_subscription_id, stripe_invoice_id, notes?
//
// Creates the enterprises row + admin-activation invite token inside a single
// transaction, then sends the buyer an activation email and Jackson an internal
// paper-trail email (both non-blocking).
router.post('/inquiries/:id/approve', async (req, res) => {
  const { id } = req.params;

  // 1. Fetch inquiry + validate status
  let inquiry;
  try {
    const r = await pool.query(
      `SELECT id, first_name, last_name, school, personal_email, status
         FROM enterprise_inquiries WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
    if (r.rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Inquiry is already ${r.rows[0].status}` });
    }
    inquiry = r.rows[0];
  } catch (err) {
    logger.error('[admin-enterprise] approve fetch error:', err);
    return res.status(500).json({ error: 'Failed to load inquiry' });
  }

  // 2. Validate body
  const { errors, cleaned } = validateApproveBody(req.body);
  if (errors.length) {
    return res.status(400).json({ error: 'Validation failed', details: errors });
  }

  // 3-9. Transactional: create enterprise + invite, update inquiry
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const client = await pool.connect();
  let enterpriseId;
  let inviteId;
  try {
    await client.query('BEGIN');

    const entIns = await client.query(
      `INSERT INTO enterprises (
         org_name, billing_email,
         stripe_customer_id, stripe_subscription_id, stripe_invoice_id,
         subscription_status,
         player_seats_paid, coach_seats_paid,
         monthly_price_per_player, monthly_price_per_coach,
         notes
       ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        cleaned.orgName, cleaned.billingEmail,
        cleaned.customerId, cleaned.subId, cleaned.invoiceId,
        cleaned.playerSeats, cleaned.coachSeats,
        cleaned.pricePlayer, cleaned.priceCoach,
        cleaned.notes
      ]
    );
    enterpriseId = entIns.rows[0].id;

    const invIns = await client.query(
      `INSERT INTO enterprise_invites (
         enterprise_id, seat_id, role, seat_type,
         token, invited_email, expires_at
       ) VALUES ($1, NULL, 'enterprise_admin', NULL, $2, $3, $4)
       RETURNING id`,
      [enterpriseId, token, cleaned.billingEmail, expiresAt]
    );
    inviteId = invIns.rows[0].id;

    await client.query(
      `UPDATE enterprise_inquiries
          SET status='approved', reviewed_at=NOW(), enterprise_id=$1
        WHERE id=$2`,
      [enterpriseId, id]
    );

    await client.query('COMMIT');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* noop */ }
    logger.error('[admin-enterprise] approve transaction error:', err);
    client.release();
    return res.status(500).json({ error: 'Failed to approve inquiry' });
  }
  client.release();

  // 10-12. Non-blocking emails
  const link = buildEnterpriseActivationLink(token);
  let emailSent = false;
  try {
    await sendEnterpriseAdminActivation(cleaned.billingEmail, {
      first_name: inquiry.first_name,
      org_name: cleaned.orgName,
      player_seats_paid: cleaned.playerSeats,
      coach_seats_paid: cleaned.coachSeats,
      expires_at: expiresAt
    }, link);
    emailSent = true;
  } catch (emailErr) {
    logger.error('[admin-enterprise] enterprise admin activation email failed:', emailErr);
  }

  try {
    await sendEnterpriseApproval(ADMIN_NOTIFY_EMAIL, {
      first_name: inquiry.first_name,
      last_name: inquiry.last_name,
      school: inquiry.school
    });
  } catch (emailErr) {
    logger.error('[admin-enterprise] internal approval notification failed:', emailErr);
  }

  // 13. Respond. Include token only in dev for debugging.
  const response = {
    success: true,
    enterprise_id: enterpriseId,
    invite_id: inviteId,
    email_sent: emailSent
  };
  if (process.env.NODE_ENV !== 'production') {
    response.token = token;
    response.activation_url = link;
  }
  res.json(response);
});

// POST /api/admin/enterprise/inquiries/:id/reject
router.post('/inquiries/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const reason = (req.body && req.body.reason)
      ? String(req.body.reason).slice(0, 1000)
      : null;

    const r = await pool.query(
      `SELECT id, first_name, last_name, school, personal_email, status
         FROM enterprise_inquiries WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });

    await pool.query(
      `UPDATE enterprise_inquiries
          SET status='rejected', rejected_reason=$1, reviewed_at=NOW()
          WHERE id=$2`,
      [reason, id]
    );

    try {
      await sendEnterpriseRejection(ADMIN_NOTIFY_EMAIL, {
        first_name: r.rows[0].first_name,
        last_name: r.rows[0].last_name,
        school: r.rows[0].school,
        reason
      });
    } catch (emailErr) {
      logger.error('[admin-enterprise] rejection notification failed:', emailErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[admin-enterprise] reject error:', err);
    res.status(500).json({ error: 'Failed to reject inquiry' });
  }
});

module.exports = router;
