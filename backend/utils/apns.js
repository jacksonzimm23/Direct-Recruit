// Env-switcher for APNs — mirrors backend/utils/stripe.js pattern.
// If APNS_KEY_ID is set (along with the other required env vars), uses real
// @parse/node-apn client. Otherwise, loads the local mock so dev machines
// don't need Apple credentials to run the backend.
//
// Required env vars for real APNs:
//   APNS_KEY_ID       - 10-char key ID from Apple Developer portal
//   APNS_TEAM_ID      - 10-char team ID
//   APNS_P8_PATH      - filesystem path to the .p8 key, OR
//   APNS_P8_CONTENT   - base64-encoded .p8 content (env var friendly)
//   APNS_BUNDLE_ID    - e.g. net.directrecruit.app
//   APNS_ENVIRONMENT  - 'production' (default) or 'sandbox'
const hasRealKey = !!(process.env.APNS_KEY_ID
    && process.env.APNS_TEAM_ID
    && (process.env.APNS_P8_PATH || process.env.APNS_P8_CONTENT)
    && process.env.APNS_BUNDLE_ID);

const logger = require('./logger');

if (!hasRealKey) {
    logger.info('[apns] credentials not fully set — using local mock (no real pushes).');
    module.exports = require('./local/apns-local');
    return;
}

// Initialize the real client defensively. If the @parse/node-apn package is
// missing on this host, or the .p8 key can't be read, DON'T let the throw
// propagate into every require()/notifyUser() call (which previously surfaced
// as opaque "apns fan-out error" log spam). Log the precise reason and fall
// back to the mock so the rest of the app keeps working.
let provider;
try {
    const apn = require('@parse/node-apn');
    const fs = require('fs');

    const key = process.env.APNS_P8_CONTENT
        ? Buffer.from(process.env.APNS_P8_CONTENT, 'base64')
        : fs.readFileSync(process.env.APNS_P8_PATH);

    provider = new apn.Provider({
        token: {
            key,
            keyId: process.env.APNS_KEY_ID,
            teamId: process.env.APNS_TEAM_ID
        },
        production: process.env.APNS_ENVIRONMENT === 'production'
    });

    logger.info(`[apns] real client initialized (environment=${process.env.APNS_ENVIRONMENT || 'production'}, bundle=${process.env.APNS_BUNDLE_ID})`);
} catch (initErr) {
    logger.error(`[apns] FAILED to initialize real client — falling back to mock. Reason: ${initErr && initErr.message ? initErr.message : initErr}`);
    module.exports = require('./local/apns-local');
    return;
}

// payload: { title, body, badge?, deepLinkPath?, notificationId? }
// Returns { sent: boolean, token, status?, reason? }
async function sendPush(token, payload) {
    const note = new apn.Notification();
    note.expiry = Math.floor(Date.now() / 1000) + 3600; // 1h expiry
    if (typeof payload.badge === 'number') note.badge = payload.badge;
    note.sound = 'default';
    note.alert = { title: payload.title || '', body: payload.body || '' };
    note.topic = process.env.APNS_BUNDLE_ID;
    note.payload = {
        notification_id: payload.notificationId || null,
        deep_link_path: payload.deepLinkPath || null
    };

    const result = await provider.send(note, token);
    if (result.failed && result.failed.length) {
        const fail = result.failed[0];
        const reason = fail.response && fail.response.reason;
        logger.warn(`[apns] send failed for token ${token.slice(0, 8)}... status=${fail.status} reason=${reason}`);
        // Caller should check .reason: 'BadDeviceToken' or 'Unregistered' → delete token from DB
        return { sent: false, token, status: fail.status, reason };
    }
    return { sent: true, token };
}

async function shutdown() {
    if (provider && typeof provider.shutdown === 'function') await provider.shutdown();
}

module.exports = { sendPush, shutdown };
