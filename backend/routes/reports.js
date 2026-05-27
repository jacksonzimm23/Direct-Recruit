const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const pool = require('../config/database');
const ContentReport = require('../models/ContentReport');
const User = require('../models/User');
const PlayerProfile = require('../models/PlayerProfile');
const CoachProfile = require('../models/CoachProfile');
const OtherProfile = require('../models/OtherProfile');
const { authMiddleware } = require('../middleware/auth');
const { reportRateLimit } = require('../middleware/rateLimit');
const { sendReportNotification } = require('../utils/email');
const logger = require('../utils/logger');

// Best-effort name lookup across all 3 profile tables. Returns
// { name, email, role } for the admin notification email body.
async function getUserDisplay(userId) {
  if (!userId) return { name: null, email: null, role: null };
  try {
    const user = await User.findById(userId);
    if (!user) return { name: null, email: null, role: null };
    let first = null, last = null;
    if (user.role === 'player') {
      const p = await PlayerProfile.findByUserId(userId);
      if (p) { first = p.first_name; last = p.last_name; }
    } else if (user.role === 'coach') {
      const c = await CoachProfile.findByUserId(userId);
      if (c) { first = c.first_name; last = c.last_name; }
    } else if (user.role === 'other') {
      const o = await OtherProfile.findByUserId(userId);
      if (o) { first = o.first_name; last = o.last_name; }
    }
    const name = (first || last) ? `${first || ''} ${last || ''}`.trim() : null;
    return { name, email: user.email || null, role: user.role || null };
  } catch (e) {
    logger.warn('[reports] getUserDisplay failed for user', userId, e.message);
    return { name: null, email: null, role: null };
  }
}

// Best-effort content excerpt — fetches the reported content's text body
// (or a placeholder string) for inclusion in the admin email. Failure
// is non-fatal; the email still sends with '(no excerpt available)'.
async function getContentExcerpt(contentType, contentId) {
  if (!contentId) return null;
  try {
    if (contentType === 'post') {
      const r = await pool.query('SELECT content FROM posts WHERE id = $1', [contentId]);
      return r.rows[0]?.content || null;
    }
    if (contentType === 'comment') {
      const r = await pool.query('SELECT content FROM comments WHERE id = $1', [contentId]);
      return r.rows[0]?.content || null;
    }
    if (contentType === 'message') {
      const r = await pool.query('SELECT content FROM messages WHERE id = $1', [contentId]);
      return r.rows[0]?.content || null;
    }
  } catch (e) {
    logger.warn('[reports] getContentExcerpt failed', contentType, contentId, e.message);
  }
  return null;
}

// POST /api/reports — submit a new content report
router.post(
  '/',
  authMiddleware,
  reportRateLimit,
  [
    body('content_type').isIn(ContentReport.VALID_CONTENT_TYPES).withMessage('Invalid content_type'),
    body('reason').isIn(ContentReport.VALID_REASONS).withMessage('Invalid reason'),
    body('content_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('content_id must be a UUID'),
    body('reported_user_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('reported_user_id must be a UUID'),
    body('details').optional({ nullable: true, checkFalsy: true }).isString().isLength({ max: 1000 }).withMessage('details capped at 1000 chars')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { content_type, content_id, reported_user_id, reason, details } = req.body;

    // For non-profile reports, content_id is required
    if (content_type !== 'profile' && !content_id) {
      return res.status(400).json({ error: 'content_id is required for ' + content_type + ' reports' });
    }
    // For profile reports, reported_user_id is required
    if (content_type === 'profile' && !reported_user_id) {
      return res.status(400).json({ error: 'reported_user_id is required for profile reports' });
    }
    // Can't report yourself
    if (reported_user_id && reported_user_id === req.userId) {
      return res.status(400).json({ error: 'Cannot report your own content' });
    }

    try {
      const report = await ContentReport.create({
        reporterUserId: req.userId,
        reportedUserId: reported_user_id || null,
        contentType: content_type,
        contentId: content_id || null,
        reason,
        details: details || null
      });

      // Fire-and-forget admin email — never block the API response on email failures
      (async () => {
        try {
          const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || 'jackson@directrecruit.net';
          const [reporter, reported, excerpt] = await Promise.all([
            getUserDisplay(req.userId),
            getUserDisplay(reported_user_id),
            getContentExcerpt(content_type, content_id)
          ]);
          await sendReportNotification(adminEmail, {
            report_id: report.id,
            content_type,
            content_id,
            reason,
            details,
            content_excerpt: excerpt,
            reporter_name: reporter.name,
            reporter_email: reporter.email,
            reporter_role: reporter.role,
            reported_name: reported.name,
            reported_email: reported.email,
            reported_role: reported.role
          });
        } catch (emailErr) {
          logger.error('[reports] Admin notification email failed (non-fatal):', emailErr.message);
        }
      })();

      res.status(201).json({ success: true, report_id: report.id });
    } catch (error) {
      logger.error('Create report failed:', error);
      res.status(500).json({ error: 'Failed to submit report' });
    }
  }
);

module.exports = router;
