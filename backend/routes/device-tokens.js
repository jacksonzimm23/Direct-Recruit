const express = require('express');
const router = express.Router();
const DeviceToken = require('../models/DeviceToken');
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

module.exports = router;
