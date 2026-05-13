const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { sendCoachInvite, sendCoachRejection } = require('../utils/email');

const INVITE_EXPIRY_DAYS = 7;
const VALID_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA'];

// Admin key auth (timing-safe) — reuses ADMIN_ANALYTICS_KEY so Jackson uses one key for all admin tools
function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_ANALYTICS_KEY;
  if (!key || !expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const keyBuf = Buffer.from(key, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (keyBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(keyBuf, expectedBuf)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.use(adminAuth);

function buildInviteLink(token /*, isSwitch — no longer needed at link-build time */) {
  const isProd = process.env.NODE_ENV === 'production';
  const appUrl = process.env.APP_URL || (isProd ? 'https://directrecruit.net' : 'http://localhost:5000');
  const prefix = process.env.FRONTEND_PATH_PREFIX !== undefined
    ? process.env.FRONTEND_PATH_PREFIX
    : (isProd ? '' : '/frontend');
  // Both new signups AND profile-type switches go to the same create-coach-profile page.
  // The page itself detects switch mode from the validate-token response (is_switch flag)
  // and adapts its UI/submit flow accordingly.
  return `${appUrl}${prefix}/collegecoach/create-coach-profile.html?token=${encodeURIComponent(token)}`;
}

// GET /api/admin/coach-verification/requests?status=pending|approved|rejected|all
router.get('/requests', async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const validStatuses = ['pending', 'approved', 'rejected', 'all'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    // Archived rows (deleted_at IS NOT NULL) are hidden from every tab — they
    // represent coaches who deleted their account or switched profile type
    // away from collegecoach, so the admin shouldn't see them in pending/
    // approved/rejected queues. They stay in the DB for audit purposes.
    const archivedFilter = 'r.deleted_at IS NULL';
    const whereClause = status === 'all'
      ? `WHERE ${archivedFilter}`
      : `WHERE r.status = $1 AND ${archivedFilter}`;
    const params = status === 'all' ? [] : [status];

    const requestsQuery = `
      SELECT
        r.id, r.first_name, r.last_name, r.school, r.division, r.position, r.phone,
        r.edu_email, r.personal_email, r.notes, r.status, r.rejected_reason,
        r.ip_address, r.created_at, r.reviewed_at,
        r.locked_school, r.locked_division, r.locked_at,
        r.is_switch, r.existing_user_id,
        eu.email AS existing_user_email,
        eu.role  AS existing_user_role,
        i.id         AS invite_id,
        i.token      AS invite_token,
        i.division   AS invite_division,
        i.expires_at AS invite_expires_at,
        i.used_at    AS invite_used_at,
        i.revoked_at AS invite_revoked_at,
        i.created_at AS invite_created_at
      FROM coach_signup_requests r
      LEFT JOIN users eu ON eu.id = r.existing_user_id
      LEFT JOIN LATERAL (
        SELECT * FROM coach_invites
        WHERE request_id = r.id
        ORDER BY created_at DESC
        LIMIT 1
      ) i ON true
      ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT 500
    `;
    const countsQuery = `
      SELECT status, COUNT(*) AS cnt
      FROM coach_signup_requests
      WHERE deleted_at IS NULL
      GROUP BY status
    `;

    const [requests, counts] = await Promise.all([
      pool.query(requestsQuery, params),
      pool.query(countsQuery)
    ]);

    const countsObj = { pending: 0, approved: 0, rejected: 0 };
    for (const row of counts.rows) {
      countsObj[row.status] = parseInt(row.cnt, 10);
    }

    res.json({
      requests: requests.rows,
      counts: countsObj
    });
  } catch (err) {
    logger.error('[admin-coach-verification] list requests error:', err);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

// POST /api/admin/coach-verification/requests/:id/approve
router.post('/requests/:id/approve', async (req, res) => {
  try {
    const requestId = req.params.id;

    // Fetch request and verify status + locked
    const r = await pool.query(
      `SELECT id, first_name, last_name, school, position, edu_email, personal_email, status,
              locked_school, locked_division, is_switch
         FROM coach_signup_requests WHERE id = $1`,
      [requestId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Request not found' });
    if (r.rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${r.rows[0].status}` });
    }
    if (!r.rows[0].locked_school || !r.rows[0].locked_division) {
      return res.status(400).json({ error: 'Request must be locked before approval' });
    }

    const request = r.rows[0];

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Use locked_school + locked_division (the admin-canonicalized values) for the invite.
    // Carry is_switch forward so the email link routes to the correct destination page.
    const inviteIns = await pool.query(
      `INSERT INTO coach_invites
        (request_id, token, edu_email, first_name, last_name, school, division, position, expires_at, is_switch)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, expires_at`,
      [requestId, token, request.edu_email, request.first_name, request.last_name,
       request.locked_school, request.locked_division, request.position, expiresAt,
       !!request.is_switch]
    );

    await pool.query(
      `UPDATE coach_signup_requests SET status='approved', reviewed_at=NOW() WHERE id=$1`,
      [requestId]
    );

    const link = buildInviteLink(token, !!request.is_switch);
    try {
      await sendCoachInvite(request.edu_email, {
        first_name: request.first_name,
        school: request.locked_school,
        expires_at: inviteIns.rows[0].expires_at,
        is_switch: !!request.is_switch
      }, link);
    } catch (emailErr) {
      logger.error('[admin-coach-verification] failed to send invite email:', emailErr);
    }

    res.json({
      success: true,
      token,
      expires_at: inviteIns.rows[0].expires_at,
      invite_id: inviteIns.rows[0].id
    });
  } catch (err) {
    logger.error('[admin-coach-verification] approve error:', err);
    res.status(500).json({ error: 'Failed to approve request' });
  }
});

// POST /api/admin/coach-verification/requests/:id/lock
router.post('/requests/:id/lock', async (req, res) => {
  try {
    const requestId = req.params.id;
    const { school, division } = req.body || {};

    if (!school || typeof school !== 'string' || !school.trim()) {
      return res.status(400).json({ error: 'School is required' });
    }
    if (!division || !VALID_DIVISIONS.includes(division)) {
      return res.status(400).json({ error: 'Invalid division' });
    }

    const r = await pool.query(
      `SELECT id, status FROM coach_signup_requests WHERE id = $1`,
      [requestId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Request not found' });
    if (r.rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${r.rows[0].status}` });
    }

    const upd = await pool.query(
      `UPDATE coach_signup_requests
         SET locked_school=$1, locked_division=$2, locked_at=NOW()
         WHERE id=$3
         RETURNING locked_school, locked_division, locked_at`,
      [school.trim(), division, requestId]
    );

    res.json({ success: true, ...upd.rows[0] });
  } catch (err) {
    logger.error('[admin-coach-verification] lock error:', err);
    res.status(500).json({ error: 'Failed to lock request' });
  }
});

// POST /api/admin/coach-verification/requests/:id/unlock
router.post('/requests/:id/unlock', async (req, res) => {
  try {
    const requestId = req.params.id;
    const r = await pool.query(
      `SELECT id, status FROM coach_signup_requests WHERE id = $1`,
      [requestId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Request not found' });
    if (r.rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${r.rows[0].status}` });
    }

    await pool.query(
      `UPDATE coach_signup_requests
         SET locked_school=NULL, locked_division=NULL, locked_at=NULL
         WHERE id=$1`,
      [requestId]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error('[admin-coach-verification] unlock error:', err);
    res.status(500).json({ error: 'Failed to unlock request' });
  }
});

// POST /api/admin/coach-verification/requests/:id/reject
router.post('/requests/:id/reject', async (req, res) => {
  try {
    const requestId = req.params.id;
    const reason = (req.body && req.body.reason) ? String(req.body.reason).slice(0, 1000) : null;

    const r = await pool.query(
      `SELECT id, first_name, personal_email, status
         FROM coach_signup_requests WHERE id = $1`,
      [requestId]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Request not found' });

    await pool.query(
      `UPDATE coach_signup_requests SET status='rejected', rejected_reason=$1, reviewed_at=NOW()
         WHERE id=$2`,
      [reason, requestId]
    );

    try {
      await sendCoachRejection(r.rows[0].personal_email, r.rows[0].first_name);
    } catch (emailErr) {
      logger.error('[admin-coach-verification] failed to send rejection email:', emailErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[admin-coach-verification] reject error:', err);
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// POST /api/admin/coach-verification/invites/:id/revoke
router.post('/invites/:id/revoke', async (req, res) => {
  try {
    const inviteId = req.params.id;
    const result = await pool.query(
      `UPDATE coach_invites SET revoked_at=NOW()
         WHERE id=$1 AND used_at IS NULL AND revoked_at IS NULL
         RETURNING id`,
      [inviteId]
    );
    if (!result.rows[0]) {
      return res.status(400).json({ error: 'Invite is already used or revoked' });
    }
    res.json({ success: true });
  } catch (err) {
    logger.error('[admin-coach-verification] revoke error:', err);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

// POST /api/admin/coach-verification/invites/:id/resend
router.post('/invites/:id/resend', async (req, res) => {
  try {
    const inviteId = req.params.id;

    // Fetch current invite
    const current = await pool.query(
      `SELECT request_id, edu_email, first_name, last_name, school, division, position, used_at, is_switch
         FROM coach_invites WHERE id = $1`,
      [inviteId]
    );
    if (!current.rows[0]) return res.status(404).json({ error: 'Invite not found' });
    if (current.rows[0].used_at) {
      return res.status(400).json({ error: 'Invite has already been used' });
    }

    const data = current.rows[0];

    // Revoke old, issue new
    await pool.query(`UPDATE coach_invites SET revoked_at=NOW() WHERE id=$1`, [inviteId]);

    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const ins = await pool.query(
      `INSERT INTO coach_invites
        (request_id, token, edu_email, first_name, last_name, school, division, position, expires_at, is_switch)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id, expires_at`,
      [data.request_id, newToken, data.edu_email, data.first_name, data.last_name,
       data.school, data.division, data.position, expiresAt, !!data.is_switch]
    );

    const link = buildInviteLink(newToken, !!data.is_switch);
    try {
      await sendCoachInvite(data.edu_email, {
        first_name: data.first_name,
        school: data.school,
        expires_at: ins.rows[0].expires_at,
        is_switch: !!data.is_switch
      }, link);
    } catch (emailErr) {
      logger.error('[admin-coach-verification] failed to re-send invite email:', emailErr);
    }

    res.json({
      success: true,
      token: newToken,
      invite_id: ins.rows[0].id,
      expires_at: ins.rows[0].expires_at
    });
  } catch (err) {
    logger.error('[admin-coach-verification] resend error:', err);
    res.status(500).json({ error: 'Failed to resend invite' });
  }
});

module.exports = router;
