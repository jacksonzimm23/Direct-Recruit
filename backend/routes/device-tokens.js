const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const logger = require('../utils/logger');

// POST /api/device-tokens
// iOS app calls this after @capacitor/push-notifications fires the
// 'registration' event with an APNs device token. Future Android flow
// will use the same endpoint with platform='android'.
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { token, platform, app_version, os_version } = req.body || {};

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'token is required (string)' });
        }
        if (!platform || !['ios', 'android'].includes(platform)) {
            return res.status(400).json({ error: 'platform must be ios or android' });
        }

        const row = await DeviceToken.upsert({
            userId: req.userId,
            token: token.trim(),
            platform,
            appVersion: app_version,
            osVersion: os_version
        });

        logger.info(`[device-tokens] upserted for user ${req.userId}, platform=${platform}`);
        res.status(201).json(row);
    } catch (e) {
        logger.error('[device-tokens] upsert error:', e);
        res.status(500).json({ error: 'Failed to register device token' });
    }
});

// PUT /api/device-tokens/preference
// Account-wide push on/off toggle (driven by the iOS settings toggle). Sets the
// authoritative users.push_enabled flag AND keeps all the user's device rows in
// sync. notifyUser() reads users.push_enabled before any APNs fan-out, so this
// one switch silences/enables every notification type for the user.
router.put('/preference', authMiddleware, async (req, res) => {
    try {
        const { enabled } = req.body || {};
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ error: 'enabled is required (boolean)' });
        }

        await User.setPushEnabled(req.userId, enabled);
        await DeviceToken.setEnabledForUser(req.userId, enabled);

        logger.info(`[device-tokens] push preference for user ${req.userId} set to ${enabled}`);
        res.json({ push_enabled: enabled });
    } catch (e) {
        logger.error('[device-tokens] preference update error:', e);
        res.status(500).json({ error: 'Failed to update push preference' });
    }
});

module.exports = router;
