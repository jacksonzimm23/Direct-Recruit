const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// ==================== iOS force-update gate ====================
// GET /api/app/version-check?platform=ios&version=1.0.8
//
// The iOS app ships its frontend BUNDLED inside the .ipa (capacitor.config.ts
// webDir: 'frontend'), so an installed build's JS can never be hot-fixed. The
// only lever for pushing users off a broken build is to make the app refuse to
// run until they install a newer one from the App Store.
//
// This endpoint answers "is the version on this device too old?". The live App
// Store version comes from Apple's public iTunes Lookup API, so a release
// automatically becomes the new floor with no deploy and no env change.
//
// PUBLIC (no authMiddleware) on purpose: the gate has to run on the landing /
// sign-in pages too, before anyone is authenticated. Covered by the global
// apiLimiter mounted on /api/ in server.js.

const APP_STORE_ID = process.env.IOS_APP_STORE_ID || '6774454639';
const BUNDLE_ID = process.env.IOS_BUNDLE_ID || 'net.directrecruit.app';
const STORE_COUNTRY = process.env.IOS_STORE_COUNTRY || 'us';

// 'force' = block anything behind the live App Store version (the default, and
//           what the popup is for).
// 'soft'  = only block below IOS_MIN_SUPPORTED_VERSION; anything else behind
//           latest gets the dismissible "Update Available" nag instead.
// 'off'   = kill switch. Never block, never nag. Use this if a release goes
//           wrong and the gate itself is the problem.
const ENFORCEMENT = (process.env.IOS_UPDATE_ENFORCEMENT || 'force').toLowerCase();

// Optional explicit floor. Independent of the store lookup, so a hard block can
// be raised without shipping anything, and so 'soft' mode still has teeth.
const MIN_SUPPORTED = process.env.IOS_MIN_SUPPORTED_VERSION || null;

const STORE_URL_SCHEME = `itms-apps://apps.apple.com/app/id${APP_STORE_ID}`;
const STORE_URL_HTTPS = `https://apps.apple.com/app/id${APP_STORE_ID}`;

// CFBundleShortVersionString is 1-3 dot-separated integers ("1.0", "1.0.8").
const VERSION_RE = /^\d{1,5}(\.\d{1,5}){0,3}$/;

// iTunes Lookup is rate limited (~20 req/min per IP) and its answer only changes
// on release day, so cache hard. On a lookup failure the last good value keeps
// being served rather than collapsing the gate to "no opinion".
const LOOKUP_TTL_MS = 30 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 5000;
let lookupCache = { version: null, fetchedAt: 0 };
let lookupInFlight = null;

/**
 * Numeric, segment-wise version compare. Returns 1 / 0 / -1.
 * String compare is wrong here ("1.0.10" < "1.0.9" lexically) and so is
 * parseFloat ("1.0.8" -> 1). Missing segments are treated as 0, which is what
 * makes "1.0" and "1.0.0" compare equal.
 */
function compareVersions(a, b) {
    const pa = String(a).split('.');
    const pb = String(b).split('.');
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
        const x = parseInt(pa[i], 10) || 0;
        const y = parseInt(pb[i], 10) || 0;
        if (x > y) return 1;
        if (x < y) return -1;
    }
    return 0;
}

async function fetchStoreVersion() {
    // Cache-buster: Apple serves this through a CDN that will happily hand back
    // a stale version for a long time after a release otherwise.
    const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(BUNDLE_ID)}`
        + `&country=${encodeURIComponent(STORE_COUNTRY)}&_=${Date.now()}`;

    const res = await fetch(url, {
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
        headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error(`iTunes lookup returned ${res.status}`);

    // Apple returns this as text/javascript; res.json() parses it regardless.
    const body = await res.json();
    const version = body && Array.isArray(body.results) && body.results[0]
        ? body.results[0].version
        : null;

    // An app that has never been approved returns resultCount: 0. Treat that as
    // a failure so we keep any cached value instead of caching a null.
    if (!version || !VERSION_RE.test(version)) {
        throw new Error(`iTunes lookup had no usable version (resultCount=${body && body.resultCount})`);
    }
    return version;
}

/**
 * Live App Store version, or null if it has never been fetched successfully.
 * Never throws. Concurrent callers share one in-flight request.
 */
async function getStoreVersion() {
    const now = Date.now();
    if (lookupCache.version && now - lookupCache.fetchedAt < LOOKUP_TTL_MS) {
        return lookupCache.version;
    }
    if (lookupInFlight) return lookupInFlight;

    lookupInFlight = (async () => {
        try {
            const version = await fetchStoreVersion();
            lookupCache = { version, fetchedAt: Date.now() };
            return version;
        } catch (e) {
            logger.error('[app-version] iTunes lookup failed:', e.message);
            // Serve the stale value if we have one. Only a cold cache yields null,
            // and null means the gate fails open below.
            return lookupCache.version;
        } finally {
            lookupInFlight = null;
        }
    })();

    return lookupInFlight;
}

router.get('/version-check', async (req, res) => {
    try {
        const platform = String(req.query.platform || 'ios').toLowerCase();
        const installed = String(req.query.version || '').trim();

        // Android has no build yet. Answer safely rather than 400ing, so a future
        // client that forgets to special-case it just sails through.
        if (platform !== 'ios') {
            return res.set('Cache-Control', 'no-store').json({
                action: 'none',
                reason: 'unsupported_platform'
            });
        }

        if (!VERSION_RE.test(installed)) {
            return res.status(400).json({ error: 'version must be 1-4 dot-separated integers' });
        }

        const latest = ENFORCEMENT === 'off' ? null : await getStoreVersion();

        // Highest of the applicable floors. In 'force' mode the live store version
        // is itself a floor; in 'soft' mode only the explicit env floor blocks.
        let blockBelow = null;
        if (ENFORCEMENT === 'force' && latest) blockBelow = latest;
        if (ENFORCEMENT !== 'off' && MIN_SUPPORTED && VERSION_RE.test(MIN_SUPPORTED)) {
            if (!blockBelow || compareVersions(MIN_SUPPORTED, blockBelow) > 0) {
                blockBelow = MIN_SUPPORTED;
            }
        }

        let action = 'none';
        if (blockBelow && compareVersions(installed, blockBelow) < 0) {
            action = 'block';
        } else if (latest && compareVersions(installed, latest) < 0) {
            action = 'nag';
        }

        const payload = {
            action,
            installed,
            latest,
            minSupported: blockBelow,
            enforcement: ENFORCEMENT,
            storeUrl: STORE_URL_SCHEME,
            storeUrlHttps: STORE_URL_HTTPS
        };

        if (action === 'block') {
            payload.title = 'Update Required';
            payload.message = 'A new version of Direct Recruit is available. Please update to keep using the app.';
            payload.confirmText = 'Update';
        } else if (action === 'nag') {
            payload.title = 'Update Available';
            payload.message = `Direct Recruit ${latest} is available on the App Store.`;
            payload.confirmText = 'Update';
            payload.cancelText = 'Not Now';
        }

        // Per-version verdict that can flip the moment a release goes live, so
        // never let a proxy or the WebView hold onto it.
        res.set('Cache-Control', 'no-store').json(payload);
    } catch (e) {
        logger.error('[app-version] version-check error:', e);
        // Fail OPEN. A backend problem must never brick every installed app.
        res.status(200).set('Cache-Control', 'no-store').json({
            action: 'none',
            reason: 'check_failed'
        });
    }
});

module.exports = router;
module.exports.compareVersions = compareVersions;
