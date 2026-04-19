const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { enterpriseRequestLimiter } = require('../middleware/rateLimit');
const { sendEnterpriseInquiryNotification } = require('../utils/email');

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'jackson@directrecruit.net';
const RESUBMIT_COOLDOWN_HOURS = 24;

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// POST /api/enterprise/request — public contact form for teams / athletic departments.
router.post('/request', enterpriseRequestLimiter, async (req, res) => {
  try {
    const { first_name, last_name, school, phone, personal_email, notes } = req.body || {};

    if (!first_name || !last_name || !school || !phone || !personal_email) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (!isValidEmail(personal_email)) {
      return res.status(400).json({ error: 'Personal email is invalid' });
    }
    if (notes && typeof notes === 'string' && notes.length > 150) {
      return res.status(400).json({ error: 'Notes must be 150 characters or less' });
    }

    const normalizedEmail = personal_email.trim().toLowerCase();
    const ip = (req.ip || req.connection?.remoteAddress || '').slice(0, 45);

    // Dedup on personal_email
    const existing = await pool.query(
      `SELECT id, status, created_at FROM enterprise_inquiries WHERE personal_email = $1`,
      [normalizedEmail]
    );

    let shouldSendEmail = false;
    let inquiryId;

    if (!existing.rows[0]) {
      const ins = await pool.query(
        `INSERT INTO enterprise_inquiries
          (first_name, last_name, school, phone, personal_email, notes, ip_address)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          RETURNING id`,
        [first_name.trim(), last_name.trim(), school.trim(), phone.trim(),
         normalizedEmail, notes ? notes.trim() : null, ip]
      );
      inquiryId = ins.rows[0].id;
      shouldSendEmail = true;
    } else {
      const row = existing.rows[0];
      inquiryId = row.id;
      if (row.status === 'pending') {
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        const hours = ageMs / (1000 * 60 * 60);
        if (hours > RESUBMIT_COOLDOWN_HOURS) {
          // Refresh the row and re-notify
          await pool.query(
            `UPDATE enterprise_inquiries
               SET first_name=$1, last_name=$2, school=$3, phone=$4, notes=$5,
                   ip_address=$6, created_at=CURRENT_TIMESTAMP
             WHERE id=$7`,
            [first_name.trim(), last_name.trim(), school.trim(), phone.trim(),
             notes ? notes.trim() : null, ip, inquiryId]
          );
          shouldSendEmail = true;
        }
        // else: silent — within cooldown
      }
      // status === 'approved' or 'rejected' → silent success (don't leak state)
    }

    if (shouldSendEmail) {
      try {
        await sendEnterpriseInquiryNotification(ADMIN_NOTIFY_EMAIL, {
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          school: school.trim(),
          phone: phone.trim(),
          personal_email: normalizedEmail,
          notes: notes ? notes.trim() : ''
        });
      } catch (emailErr) {
        logger.error('[enterprise] failed to send notification email:', emailErr);
      }
    }

    return res.json({
      success: true,
      message: "Thanks — we'll review your inquiry and be in touch within 48 hours."
    });
  } catch (err) {
    logger.error('[enterprise] request error:', err);
    return res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

module.exports = router;
