const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { sendEnterpriseApproval, sendEnterpriseRejection } = require('../utils/email');

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'jackson@directrecruit.net';

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
router.post('/inquiries/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      `SELECT id, first_name, last_name, school, personal_email, status
         FROM enterprise_inquiries WHERE id = $1`,
      [id]
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'Inquiry not found' });
    if (r.rows[0].status !== 'pending') {
      return res.status(400).json({ error: `Inquiry is already ${r.rows[0].status}` });
    }

    await pool.query(
      `UPDATE enterprise_inquiries SET status='approved', reviewed_at=NOW() WHERE id=$1`,
      [id]
    );

    try {
      await sendEnterpriseApproval(ADMIN_NOTIFY_EMAIL, {
        first_name: r.rows[0].first_name,
        last_name: r.rows[0].last_name,
        school: r.rows[0].school
      });
    } catch (emailErr) {
      logger.error('[admin-enterprise] approval notification failed:', emailErr);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error('[admin-enterprise] approve error:', err);
    res.status(500).json({ error: 'Failed to approve inquiry' });
  }
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
