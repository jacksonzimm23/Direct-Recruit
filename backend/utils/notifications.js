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
        User: require('../models/User'),
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
    // Plan 8: a recruit who originally filled out a public questionnaire
    // just created a DR account — coaches with the recruit in their
    // pipeline get pinged. Land them on the recruiting board.
    if (rtype === 'dr_account_linked') {
        return `/recruiting-board.html`;
    }
    // ai_search = AI Recruit Assistant appearance, ai_search_portal = Portal
    // Intelligence. Split so PI's dedupe can scope itself (see
    // Notification.createAiSearchMatchNotification); both land on the same tab.
    if (rtype === 'ai_search' || rtype === 'ai_search_portal') {
        return `/notifications`;
    }
    // Follow / follow-request types store the actor in related_user_id
    if (notif.type === 'follow' && notif.related_user_id) {
        return `/shared/view-profile.html?user_id=${notif.related_user_id}`;
    }
    return null;
}

/**
 * Send one payload to every enabled device for a user. Honours the account-wide
 * users.push_enabled switch and the per-device enabled flag, then cleans up any
 * token Apple reports as dead. Returns the number successfully sent.
 *
 * Shared by notifyUser() (alert push) and syncBadge() (badge-only push) so the
 * gating + stale-token cleanup live in exactly one place.
 */
async function fanOutToDevices(userId, payload, label) {
    const { DeviceToken, User, apns } = getDeps();

    // Push on/off gate. users.push_enabled is the account-wide switch (the iOS
    // settings toggle). When off, skip APNs entirely.
    const recipient = await User.findById(userId);
    if (!recipient || recipient.push_enabled === false) return 0;

    // Only send to enabled devices (defense in depth alongside the flag above).
    const tokens = await DeviceToken.findEnabledByUserId(userId);
    if (!tokens || tokens.length === 0) return 0;

    // Send in parallel; collect failures for stale-token cleanup.
    const results = await Promise.all(tokens.map(async (row) => {
        try {
            return await apns.sendPush(row.token, payload);
        } catch (err) {
            logger.warn(`[${label}] apns send threw for token ${row.token.slice(0, 8)}...: ${err.message}`);
            return { sent: false, token: row.token, reason: 'SendThrew' };
        }
    }));

    // Clean up tokens Apple told us are dead.
    const deadReasons = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic']);
    for (const r of results) {
        if (r && !r.sent && r.reason && deadReasons.has(r.reason)) {
            try {
                await DeviceToken.deleteByToken(r.token);
                logger.info(`[${label}] removed stale token (reason=${r.reason})`);
            } catch (delErr) {
                logger.error(`[${label}] failed to delete stale token: ${delErr.message}`);
            }
        }
    }

    return results.filter(r => r && r.sent).length;
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

            const sent = await fanOutToDevices(notif.user_id, payload, 'notifyUser');
            logger.debug(`[notifyUser] user=${notif.user_id} sent=${sent} deepLink=${deepLinkPath || 'none'}`);
        } catch (e) {
            // Interpolate the detail into the message — winston drops a bare
            // string second arg from the prod JSON format, which previously hid
            // the real cause (e.g. missing @parse/node-apn, unreadable .p8).
            logger.error(`[notifyUser] apns fan-out error: ${e && e.message ? e.message : e}${e && e.stack ? '\n' + e.stack : ''}`);
        }
    })();
}

// ---------------------------------------------------------------------------
// Badge sync
//
// The iOS home-screen badge used to be written ONLY as a side effect of an
// incoming alert push, so it froze at whatever the count was when the last
// notification arrived. Reading or clearing notifications (in the app OR on
// desktop) left a stale red number on the icon.
//
// syncBadge() pushes the CURRENT unread count to the user's devices with a
// badge-only push (no alert, no sound — see apns.js). Because it is a normal
// alert-type push it works on already-shipped builds with no app update.
// ---------------------------------------------------------------------------

const BADGE_SYNC_DEBOUNCE_MS = 1200;
const pendingBadgeSyncs = new Map();

async function pushBadgeNow(userId) {
    const Notification = require('../models/Notification');
    const badge = await Notification.getUnreadCount(userId);
    const sent = await fanOutToDevices(userId, { badgeOnly: true, badge }, 'syncBadge');
    logger.debug(`[syncBadge] user=${userId} badge=${badge} sent=${sent}`);
}

/**
 * Fire-and-forget: push the user's true unread count to their iOS devices.
 * Call after ANY server-side change to the unread count that the user did not
 * arrive at via a new notification (mark read, mark all read, delete, clear).
 *
 * Debounced per user, so tapping through ten notifications in a row costs one
 * push instead of ten. Never throws.
 *
 * @param {string} userId - recipient whose badge should be corrected
 */
function syncBadge(userId) {
    if (!userId) return;

    const existing = pendingBadgeSyncs.get(userId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
        pendingBadgeSyncs.delete(userId);
        pushBadgeNow(userId).catch((e) => {
            logger.error(`[syncBadge] failed for user=${userId}: ${e && e.message ? e.message : e}`);
        });
    }, BADGE_SYNC_DEBOUNCE_MS);

    // Don't hold the event loop open on shutdown for a pending badge push.
    if (typeof timer.unref === 'function') timer.unref();
    pendingBadgeSyncs.set(userId, timer);
}

/**
 * Same as syncBadge() but for a set of recipients (e.g. deleting a post clears
 * the like/comment notifications it generated). Duplicates are collapsed.
 */
function syncBadgeForUsers(userIds) {
    if (!Array.isArray(userIds)) return;
    new Set(userIds.filter(Boolean)).forEach(syncBadge);
}

module.exports = { notifyUser, buildDeepLinkPath, syncBadge, syncBadgeForUsers };
