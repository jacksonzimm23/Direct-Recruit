const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const logger = require('../utils/logger');
const { coachRequestLimiter, authLimiter } = require('../middleware/rateLimit');
const { optionalAuthMiddleware } = require('../middleware/auth');
const { sendCoachRequestNotification } = require('../utils/email');

const ADMIN_NOTIFY_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'jackson@directrecruit.net';
const RESUBMIT_COOLDOWN_HOURS = 24;
const VALID_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA'];

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isEduEmail(email) {
  return typeof email === 'string' && /\.edu(?:\.[a-z]{2})?$/i.test(email.trim());
}

// POST /api/coach-signup/request — public contact form submission.
// Soft-auth: anonymous (new signup) OR authenticated (profile-type switch).
router.post('/request', coachRequestLimiter, optionalAuthMiddleware, async (req, res) => {
  try {
    const {
      first_name,
      last_name,
      school,
      division,
      position,
      phone,
      edu_email,
      personal_email,
      notes,
      is_switch: clientIsSwitch
    } = req.body || {};

    // Determine if this is a switch request. ONLY trust is_switch when the user
    // is actually authenticated — otherwise force false to prevent spoofing.
    const isSwitch = !!(req.user && clientIsSwitch);
    const existingUserId = isSwitch ? req.user.id : null;
    // For switches, server-trust the personal_email — must equal the authenticated user's email
    const effectivePersonalEmail = isSwitch ? req.user.email : personal_email;

    // Server-side validation
    if (!first_name || !last_name || !school || !division || !position || !edu_email || !effectivePersonalEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    // Division is free-text on the public form (admin canonicalizes via the lock step) —
    // just guard against an absurdly long string.
    if (typeof division !== 'string' || division.length > 50) {
      return res.status(400).json({ error: 'Invalid division' });
    }
    if (!isEduEmail(edu_email)) {
      return res.status(400).json({ error: 'A valid .edu email address is required' });
    }
    if (!isValidEmail(effectivePersonalEmail)) {
      return res.status(400).json({ error: 'Personal email is invalid' });
    }
    if (notes && typeof notes === 'string' && notes.length > 150) {
      return res.status(400).json({ error: 'Notes must be 150 characters or less' });
    }
    // Switch requests can't already be on collegecoach
    if (isSwitch && req.user.role === 'coach') {
      // We need to check the subtype — fetch the coach profile
      const CoachProfile = require('../models/CoachProfile');
      const existing = await CoachProfile.findByUserId(req.user.id);
      if (existing && existing.college_division) {
        return res.status(400).json({ error: 'You are already a College Coach' });
      }
    }

    const normalizedEdu = edu_email.trim().toLowerCase();
    const ip = (req.ip || req.connection?.remoteAddress || '').slice(0, 45);

    // Check if a request for this edu_email already exists
    const existing = await pool.query(
      `SELECT id, status, created_at FROM coach_signup_requests WHERE edu_email = $1`,
      [normalizedEdu]
    );

    let shouldSendEmail = false;
    let requestId;

    if (!existing.rows[0]) {
      // Brand new request
      const ins = await pool.query(
        `INSERT INTO coach_signup_requests
          (first_name, last_name, school, division, position, phone, edu_email, personal_email, notes, ip_address, is_switch, existing_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
          RETURNING id`,
        [first_name.trim(), last_name.trim(), school.trim(), division.trim(),
         position.trim(), phone ? phone.trim() : null, normalizedEdu,
         effectivePersonalEmail.trim(), notes ? notes.trim() : null, ip,
         isSwitch, existingUserId]
      );
      requestId = ins.rows[0].id;
      shouldSendEmail = true;
    } else {
      const row = existing.rows[0];
      requestId = row.id;
      if (row.status === 'pending') {
        // Check 24h cooldown
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        const hours = ageMs / (1000 * 60 * 60);
        if (hours > RESUBMIT_COOLDOWN_HOURS) {
          // Refresh request with new submission and re-notify
          await pool.query(
            `UPDATE coach_signup_requests
               SET first_name=$1, last_name=$2, school=$3, division=$4, position=$5, phone=$6,
                   personal_email=$7, notes=$8, ip_address=$9, created_at=CURRENT_TIMESTAMP,
                   is_switch=$10, existing_user_id=$11
             WHERE id=$12`,
            [first_name.trim(), last_name.trim(), school.trim(), division.trim(),
             position.trim(), phone ? phone.trim() : null, effectivePersonalEmail.trim(),
             notes ? notes.trim() : null, ip, isSwitch, existingUserId, requestId]
          );
          shouldSendEmail = true;
        }
        // else: silent — within cooldown window, don't spam Jackson
      }
      // status === 'approved' or 'rejected' → silent, return success without email
    }

    if (shouldSendEmail) {
      try {
        await sendCoachRequestNotification(ADMIN_NOTIFY_EMAIL, {
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          school: school.trim(),
          division: division.trim(),
          position: position.trim(),
          phone: phone ? phone.trim() : '',
          edu_email: normalizedEdu,
          personal_email: effectivePersonalEmail.trim(),
          notes: notes ? notes.trim() : '',
          is_switch: isSwitch
        });
      } catch (emailErr) {
        // Don't fail the request if email sending fails — request is saved
        logger.error('[coach-signup] failed to send notification email:', emailErr);
      }
    }

    return res.json({
      success: true,
      message: "Thanks — we'll review your request and be in touch within 48 hours."
    });
  } catch (err) {
    logger.error('[coach-signup] request error:', err);
    return res.status(500).json({ error: 'Failed to submit request' });
  }
});

// GET /api/coach-signup/validate-token?token=... — used by create-profile page on load
router.get('/validate-token', authLimiter, async (req, res) => {
  try {
    const token = req.query.token;
    if (!token || typeof token !== 'string') {
      return res.status(404).json({ valid: false, reason: 'invalid' });
    }

    // One lookup without filters to classify reason (expired vs used vs revoked vs invalid)
    const r = await pool.query(
      `SELECT id, first_name, last_name, school, division, edu_email, position,
              expires_at, used_at, revoked_at, is_switch
         FROM coach_invites WHERE token = $1`,
      [token]
    );
    if (!r.rows[0]) {
      return res.status(404).json({ valid: false, reason: 'invalid' });
    }
    const row = r.rows[0];
    if (row.used_at) return res.status(404).json({ valid: false, reason: 'used' });
    if (row.revoked_at) return res.status(404).json({ valid: false, reason: 'revoked' });
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return res.status(404).json({ valid: false, reason: 'expired' });
    }

    return res.json({
      valid: true,
      first_name: row.first_name,
      last_name: row.last_name,
      school: row.school,
      division: row.division,
      edu_email: row.edu_email,
      position: row.position,
      is_switch: !!row.is_switch
    });
  } catch (err) {
    logger.error('[coach-signup] validate-token error:', err);
    return res.status(500).json({ valid: false, reason: 'error' });
  }
});

module.exports = router;
