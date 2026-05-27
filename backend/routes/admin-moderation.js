// Admin moderation queue routes (Fix #10).
// Mounted at /api/admin/moderation. Mirrors admin-analytics.js auth pattern:
// timing-safe x-admin-key compare against ADMIN_ANALYTICS_KEY env var.
//
// All endpoints are dashboard-only — no user-facing routes here.

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const pool = require('../config/database');
const ContentReport = require('../models/ContentReport');
const User = require('../models/User');
const Post = require('../models/Post');
const { getSignedS3Url } = require('../utils/s3');
const {
    sendModerationWarning,
    sendSuspensionNotification,
    sendContentRemovalNotification
} = require('../utils/email');
const logger = require('../utils/logger');

// Admin key auth — identical to admin-analytics.js
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

// --- Sign profile images on inline rows ----------------------------------
// listForAdmin / getByIdWithUsers return reporter + reported profile image
// keys; sign them so the dashboard can render avatars. (Optional; v1
// dashboard doesn't render avatars but the API returns signed URLs anyway.)
async function signRowProfileImages(row) {
    // No avatar columns selected by the admin JOIN currently; placeholder
    // for future expansion. Returns row unchanged.
    return row;
}

// --- Content excerpt resolver (mirrors routes/reports.js getContentExcerpt)
async function getContentExcerpt(contentType, contentId) {
    if (!contentId) return null;
    try {
        if (contentType === 'post') {
            const r = await pool.query('SELECT content FROM posts WHERE id = $1', [contentId]);
            return r.rows[0]?.content || null;
        }
        if (contentType === 'comment') {
            const r = await pool.query('SELECT content FROM post_comments WHERE id = $1', [contentId]);
            return r.rows[0]?.content || null;
        }
        if (contentType === 'message') {
            const r = await pool.query('SELECT content FROM messages WHERE id = $1', [contentId]);
            return r.rows[0]?.content || null;
        }
        if (contentType === 'share') {
            const r = await pool.query('SELECT quote_content FROM post_shares WHERE id = $1', [contentId]);
            return r.rows[0]?.quote_content || null;
        }
    } catch (e) {
        logger.warn('[admin-moderation] getContentExcerpt failed:', e.message);
    }
    return null;
}

// --- Soft-delete content by type ----------------------------------------
async function softDeleteContent(contentType, contentId) {
    if (!contentId) return false;
    if (contentType === 'post') {
        const r = await pool.query(
            'UPDATE posts SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id',
            [contentId]
        );
        return r.rowCount > 0;
    }
    if (contentType === 'comment') {
        const r = await pool.query(
            "UPDATE post_comments SET is_deleted = TRUE, content = '[deleted]' WHERE id = $1 AND (is_deleted = FALSE OR is_deleted IS NULL) RETURNING id",
            [contentId]
        );
        return r.rowCount > 0;
    }
    if (contentType === 'share') {
        const r = await pool.query(
            'UPDATE post_shares SET is_deleted = TRUE, deleted_at = NOW() WHERE id = $1 AND is_deleted = FALSE RETURNING id',
            [contentId]
        );
        return r.rowCount > 0;
    }
    // 'message' + 'profile' are not soft-delete targets — admin should use
    // suspend-user instead. Routes guard against this.
    return false;
}

// =========================================================================
// GET /api/admin/moderation/overview — dashboard top stats
// =========================================================================
router.get('/overview', async (req, res) => {
    try {
        const [reportCounts, suspendedCount] = await Promise.all([
            ContentReport.getCounts(),
            pool.query('SELECT COUNT(*) AS count FROM users WHERE is_suspended = TRUE')
        ]);
        res.json({
            pending: parseInt(reportCounts.pending, 10) || 0,
            actioned_today: parseInt(reportCounts.actioned_today, 10) || 0,
            dismissed_today: parseInt(reportCounts.dismissed_today, 10) || 0,
            week_total: parseInt(reportCounts.week_total, 10) || 0,
            suspended_users: parseInt(suspendedCount.rows[0].count, 10) || 0
        });
    } catch (error) {
        logger.error('[admin-moderation] overview failed:', error);
        res.status(500).json({ error: 'Failed to load overview' });
    }
});

// =========================================================================
// GET /api/admin/moderation/reports?status=pending|all|reviewed|actioned|dismissed
// =========================================================================
router.get('/reports', async (req, res) => {
    try {
        const statusParam = req.query.status === 'all' ? null : (req.query.status || 'pending');
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
        const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
        const reports = await ContentReport.listForAdmin({ status: statusParam, limit, offset });

        // Attach excerpts to each row (best-effort, fire-in-parallel)
        const enriched = await Promise.all(reports.map(async (r) => {
            const excerpt = await getContentExcerpt(r.content_type, r.content_id);
            return { ...r, content_excerpt: excerpt };
        }));

        res.json({ reports: enriched, count: enriched.length });
    } catch (error) {
        logger.error('[admin-moderation] list reports failed:', error);
        res.status(500).json({ error: 'Failed to load reports' });
    }
});

// =========================================================================
// GET /api/admin/moderation/reports/:id — single report + excerpt
// =========================================================================
router.get('/reports/:id', async (req, res) => {
    try {
        const report = await ContentReport.getByIdWithUsers(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        const excerpt = await getContentExcerpt(report.content_type, report.content_id);
        res.json({ report: { ...report, content_excerpt: excerpt } });
    } catch (error) {
        logger.error('[admin-moderation] get report failed:', error);
        res.status(500).json({ error: 'Failed to load report' });
    }
});

// =========================================================================
// POST /api/admin/moderation/reports/:id/dismiss
// =========================================================================
router.post('/reports/:id/dismiss', async (req, res) => {
    try {
        const updated = await ContentReport.updateStatus(req.params.id, 'dismissed', null);
        if (!updated) return res.status(404).json({ error: 'Report not found' });
        res.json({ success: true, report: updated });
    } catch (error) {
        logger.error('[admin-moderation] dismiss failed:', error);
        res.status(500).json({ error: 'Failed to dismiss report' });
    }
});

// =========================================================================
// POST /api/admin/moderation/reports/:id/warn — email-only courtesy notice
// =========================================================================
router.post('/reports/:id/warn', async (req, res) => {
    try {
        const report = await ContentReport.getByIdWithUsers(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        if (!report.reported_email) {
            return res.status(400).json({ error: 'No reported user email on file (cannot warn).' });
        }
        // Fire-and-forget email
        (async () => {
            try {
                await sendModerationWarning(report.reported_email, {
                    reason: report.reason,
                    contentType: report.content_type
                });
            } catch (e) {
                logger.error('[admin-moderation] warn email failed:', e.message);
            }
        })();
        const updated = await ContentReport.updateStatus(req.params.id, 'actioned', null);
        res.json({ success: true, report: updated, action: 'warned' });
    } catch (error) {
        logger.error('[admin-moderation] warn failed:', error);
        res.status(500).json({ error: 'Failed to warn user' });
    }
});

// =========================================================================
// POST /api/admin/moderation/reports/:id/delete-content
// =========================================================================
router.post('/reports/:id/delete-content', async (req, res) => {
    try {
        const report = await ContentReport.getByIdWithUsers(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        if (report.content_type === 'profile') {
            return res.status(400).json({ error: 'Use suspend-user for profile reports.' });
        }
        if (report.content_type === 'message') {
            return res.status(400).json({ error: 'Cannot delete message via admin queue; suspend the sender instead.' });
        }
        const deleted = await softDeleteContent(report.content_type, report.content_id);
        if (!deleted) {
            return res.status(400).json({ error: 'Content already deleted or not found.' });
        }
        // Fire-and-forget removal notice email
        if (report.reported_email) {
            (async () => {
                try {
                    await sendContentRemovalNotification(report.reported_email, {
                        contentType: report.content_type,
                        reason: report.reason
                    });
                } catch (e) {
                    logger.error('[admin-moderation] removal email failed:', e.message);
                }
            })();
        }
        const updated = await ContentReport.updateStatus(req.params.id, 'actioned', null);
        res.json({ success: true, report: updated, action: 'content-deleted' });
    } catch (error) {
        logger.error('[admin-moderation] delete-content failed:', error);
        res.status(500).json({ error: 'Failed to delete content' });
    }
});

// =========================================================================
// POST /api/admin/moderation/reports/:id/suspend-user
// Body (optional): { reason: "..." }
// =========================================================================
router.post('/reports/:id/suspend-user', async (req, res) => {
    try {
        const report = await ContentReport.getByIdWithUsers(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        if (!report.reported_user_id) {
            return res.status(400).json({ error: 'No reported_user_id on this report.' });
        }
        const reason = (req.body && req.body.reason) || report.reason || null;
        const suspended = await User.suspendUser(report.reported_user_id, { reason });
        if (!suspended) {
            return res.status(404).json({ error: 'Reported user not found.' });
        }
        if (report.reported_email) {
            (async () => {
                try {
                    await sendSuspensionNotification(report.reported_email, { reason });
                } catch (e) {
                    logger.error('[admin-moderation] suspension email failed:', e.message);
                }
            })();
        }
        const updated = await ContentReport.updateStatus(req.params.id, 'actioned', null);
        res.json({ success: true, report: updated, action: 'user-suspended' });
    } catch (error) {
        logger.error('[admin-moderation] suspend-user failed:', error);
        res.status(500).json({ error: 'Failed to suspend user' });
    }
});

// =========================================================================
// POST /api/admin/moderation/reports/:id/suspend-and-delete
// Combo: suspend user + delete reported content
// =========================================================================
router.post('/reports/:id/suspend-and-delete', async (req, res) => {
    try {
        const report = await ContentReport.getByIdWithUsers(req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        if (!report.reported_user_id) {
            return res.status(400).json({ error: 'No reported_user_id on this report.' });
        }
        const reason = (req.body && req.body.reason) || report.reason || null;

        // Suspend the user
        const suspended = await User.suspendUser(report.reported_user_id, { reason });
        if (!suspended) {
            return res.status(404).json({ error: 'Reported user not found.' });
        }

        // Delete content (skip if profile/message — suspend alone is sufficient there)
        let contentDeleted = false;
        if (report.content_type !== 'profile' && report.content_type !== 'message') {
            contentDeleted = await softDeleteContent(report.content_type, report.content_id);
        }

        // Single combined email (suspension notice is the strongest signal)
        if (report.reported_email) {
            (async () => {
                try {
                    await sendSuspensionNotification(report.reported_email, { reason });
                } catch (e) {
                    logger.error('[admin-moderation] suspension email failed:', e.message);
                }
            })();
        }
        const updated = await ContentReport.updateStatus(req.params.id, 'actioned', null);
        res.json({
            success: true,
            report: updated,
            action: contentDeleted ? 'suspend-and-delete' : 'user-suspended (content was already deleted or not deletable)'
        });
    } catch (error) {
        logger.error('[admin-moderation] suspend-and-delete failed:', error);
        res.status(500).json({ error: 'Failed to suspend and delete' });
    }
});

// =========================================================================
// GET /api/admin/moderation/suspended-users
// =========================================================================
router.get('/suspended-users', async (req, res) => {
    try {
        const users = await User.listSuspended(200);
        res.json({ users, count: users.length });
    } catch (error) {
        logger.error('[admin-moderation] list suspended users failed:', error);
        res.status(500).json({ error: 'Failed to load suspended users' });
    }
});

// =========================================================================
// POST /api/admin/moderation/users/:userId/unsuspend
// =========================================================================
router.post('/users/:userId/unsuspend', async (req, res) => {
    try {
        const updated = await User.unsuspendUser(req.params.userId);
        if (!updated) return res.status(404).json({ error: 'User not found' });
        res.json({ success: true, user: updated });
    } catch (error) {
        logger.error('[admin-moderation] unsuspend failed:', error);
        res.status(500).json({ error: 'Failed to unsuspend user' });
    }
});

module.exports = router;
