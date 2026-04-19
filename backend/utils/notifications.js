// Phase 4c-II: notification dispatch helper.
// Fans out a just-created notification row to Socket.IO + APNs.
// Called AFTER Notification.create*() returns — DB row already exists.
// Fire-and-forget from route handlers: catches all errors internally.

const logger = require('./logger');

// Lazy-require so unit tests can mock without loading the real deps,
// and to avoid any circular-require pain at server boot.
function getDeps() {
    return {
        DeviceToken: require('../models/DeviceToken'),
        apns: require('./apns')
    };
}

/**
 * Build a relative deep-link path based on notification type/entity.
 * Returns null if no sensible deep link exists (iOS app will open to
 * the notifications tab as a fallback).
 */
function buildDeepLinkPath(notif) {
    if (!notif) return null;
    const rid = notif.related_entity_id;
    const rtype = notif.related_entity_type;

    // Conversation → messages tab
    if (rtype === 'conversation' && rid) {
        return `/messages?conversation_id=${rid}`;
    }
    // Post / share → single-post view
    if (rtype === 'post' && rid) {
        return `/post-view.html?post_id=${rid}`;
    }
    if (rtype === 'share' && rid) {
        return `/post-view.html?share_id=${rid}`;
    }
    // Board-related → recruiting board page
    if (rtype && typeof rtype === 'string' && rtype.indexOf('board') === 0 && rid) {
        return `/recruiting-board.html?board_id=${rid}`;
    }
    if (rtype === 'portal_watchlist') {
        return `/recruiting-board.html`;
    }
    if (rtype === 'ai_search') {
        return `/notifications`;
    }
    // Follow / follow-request types store the actor in related_user_id
    if (notif.type === 'follow' && notif.related_user_id) {
        return `/shared/view-profile.html?user_id=${notif.related_user_id}`;
    }
    return null;
}

/**
 * Dispatch a notification to Socket.IO + all registered APNs devices
 * for the recipient. Never throws — all errors logged and swallowed.
 *
 * @param {Object|null} io - Socket.IO instance (typically req.app.get('io'))
 * @param {Object} notif - Notification row (from Notification.create())
 * @param {Object} [opts]
 * @param {string} [opts.deepLinkPath] - Override automatic path derivation
 * @param {number} [opts.badge] - iOS badge count (defaults to undefined = no change)
 */
function notifyUser(io, notif, opts) {
    // Fire-and-forget wrapper — the outer function is synchronous so callers
    // don't need await; the inner async work is isolated.
    (async () => {
        if (!notif || !notif.user_id) {
            logger.warn('[notifyUser] missing notif or user_id; skipping');
            return;
        }

        const deepLinkPath = (opts && opts.deepLinkPath) || buildDeepLinkPath(notif);
        const badge = opts && typeof opts.badge === 'number' ? opts.badge : undefined;

        // ---- Socket.IO emit (fire-and-forget) ----
        try {
            if (io && typeof io.to === 'function') {
                io.to(notif.user_id).emit('new_notification', {
                    ...notif,
                    deep_link_path: deepLinkPath
                });
            }
        } catch (e) {
            logger.error('[notifyUser] socket emit error:', e.message);
        }

        // ---- APNs fan-out ----
        try {
            const { DeviceToken, apns } = getDeps();
            const tokens = await DeviceToken.findByUserId(notif.user_id);
            if (!tokens || tokens.length === 0) return;

            // Phase 5: include unread count so iOS app icon shows a number, not a dot.
            // Best-effort — if count fails, send without badge.
            let badgeCount = badge;
            if (badgeCount === undefined) {
                try {
                    const Notification = require('../models/Notification');
                    badgeCount = await Notification.getUnreadCount(notif.user_id);
                } catch (e) {
                    logger.warn('[notifyUser] badge count query failed, sending without badge:', e.message);
                }
            }

            const payload = {
                title: notif.title || 'Direct Recruit',
                body: notif.message || '',
                deepLinkPath,
                notificationId: notif.id,
                badge: badgeCount
            };

            // Send in parallel; collect failures for stale-token cleanup.
            const results = await Promise.all(tokens.map(async (row) => {
                try {
                    return await apns.sendPush(row.token, payload);
                } catch (err) {
                    logger.warn(`[notifyUser] apns send threw for token ${row.token.slice(0, 8)}...: ${err.message}`);
                    return { sent: false, token: row.token, reason: 'SendThrew' };
                }
            }));

            // Clean up tokens Apple told us are dead.
            const deadReasons = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);
            for (const r of results) {
                if (r && !r.sent && r.reason && deadReasons.has(r.reason)) {
                    try {
                        await DeviceToken.deleteByToken(r.token);
                        logger.info(`[notifyUser] removed stale token (reason=${r.reason})`);
                    } catch (delErr) {
                        logger.error(`[notifyUser] failed to delete stale token: ${delErr.message}`);
                    }
                }
            }

            const sent = results.filter(r => r && r.sent).length;
            logger.debug(`[notifyUser] user=${notif.user_id} sent=${sent}/${results.length} deepLink=${deepLinkPath || 'none'}`);
        } catch (e) {
            logger.error('[notifyUser] apns fan-out error:', e.message);
        }
    })();
}

module.exports = { notifyUser, buildDeepLinkPath };
