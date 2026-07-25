// Local dev mock for APNs. Prints what would be sent. No network calls.
// Mirrors the pattern in backend/utils/local/stripe-local.js.
//
// Loaded by backend/utils/apns.js when APNs env vars aren't configured,
// so dev machines don't need an Apple .p8 key to run the backend.

const logger = require('../logger');

async function sendPush(token, payload) {
    const tokenPreview = token
        ? token.slice(0, 10) + '...' + token.slice(-4)
        : '(no token)';

    // Badge-sync pushes carry no alert/sound — log them distinctly so it's obvious
    // in the dev console that no banner would have appeared on the device.
    if (payload.badgeOnly) {
        logger.info('[apns-local] (mock) would send BADGE-ONLY sync push:');
        logger.info(`  token:    ${tokenPreview}`);
        logger.info(`  badge:    ${payload.badge == null ? '(unset)' : payload.badge}`);
        return { sent: true, mocked: true, token };
    }

    logger.info('[apns-local] (mock) would send push:');
    logger.info(`  token:    ${tokenPreview}`);
    logger.info(`  title:    ${payload.title || '(no title)'}`);
    logger.info(`  body:     ${payload.body || '(no body)'}`);
    logger.info(`  deepLink: ${payload.deepLinkPath || '(none)'}`);
    logger.info(`  badge:    ${payload.badge == null ? '(unset)' : payload.badge}`);
    return { sent: true, mocked: true, token };
}

async function shutdown() {
    // no-op in dev
}

module.exports = { sendPush, shutdown };
