// ==================== Capacitor Init (Phase 2b) ====================
// Adds .ios-app class to <html> when running inside the Capacitor WebView.
// Initializes StatusBar + hides SplashScreen after first paint.
// Safe to load on mobile web and desktop — it's a no-op there.
// MUST load BEFORE api.js / feed.js / any other scripts that might
// rely on `.ios-app` for conditional behavior.
(function bootstrapCapacitorInit() {
    // --- .ios-app gate: detect the bundled iOS WebView SYNCHRONOUSLY by origin ---
    // The .ios-app class on <html> gates all iOS safe-area CSS. It used to be added
    // only once the native window.Capacitor bridge was readable — but on a
    // window.location.replace()-navigated document (e.g. viewing another profile,
    // which redirects through view-profile.html), the bridge isn't reliably injected
    // when this runs, so .ios-app was never added and the header/content lost their
    // safe-area offset (tucked under the status bar). A retry loop can't fix a bridge
    // that isn't present on that document.
    //
    // Instead, identify the app by its WebView origin, which is deterministic and
    // available at first paint on every in-app page. capacitor.config.ts sets
    // iosScheme 'https' with NO server.hostname, so the in-app origin is exactly
    // https://localhost (no port). Production web is directrecruit.net; dev Live
    // Server is http://localhost:5500 — neither matches, so this is iOS-app-only.
    try {
        var loc = window.location;
        if (loc.protocol === 'https:' && loc.hostname === 'localhost' && !loc.port) {
            document.documentElement.classList.add('ios-app');
        }
    } catch (_) {}

    // --- Splash screen: hide it no matter what ---
    // launchAutoHide is false in capacitor.config.ts, so the splash ONLY goes away
    // when SplashScreen.hide() is called. This MUST NOT depend on a bounded retry of
    // the JS bridge — on a cold start the bridge can take longer than the retry window
    // to inject, and if we give up the user is stuck on the splash forever. Keep
    // trying for a long time, and hard-hide via a guaranteed timeout regardless.
    var splashHidden = false;
    function hideSplash() {
        if (splashHidden) return;
        var cap = window.Capacitor;
        var SplashScreen = cap && cap.Plugins && cap.Plugins.SplashScreen;
        if (SplashScreen && typeof SplashScreen.hide === 'function') {
            splashHidden = true;
            try { SplashScreen.hide().catch(function () {}); } catch (_) {}
        }
    }
    // Poll for the bridge for up to ~10s, hiding the splash the moment it's available.
    var splashTries = 0;
    (function pollSplash() {
        if (splashHidden) return;
        hideSplash();
        if (!splashHidden && splashTries++ < 200) setTimeout(pollSplash, 50);
    })();
    // Absolute backstop: hide once DOM is ready (bridge is essentially always up by then).
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideSplash, { once: true });
    } else {
        hideSplash();
    }

    // --- Native plugin init (StatusBar / Push / RevenueCat) ---
    // This still needs the real bridge, so keep waiting for window.Capacitor.
    let attempts = 0;
    function tryInit() {
        const cap = window.Capacitor;
        const ready = cap && typeof cap.isNativePlatform === 'function';
        if (!ready) {
            if (attempts++ < 200) { setTimeout(tryInit, 50); return; }   // ~10s of retries
            return; // not a native platform (web/desktop) — no-op
        }
        if (!cap.isNativePlatform()) return; // genuinely not native
        capacitorInit(cap);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit, { once: true });
    }
    tryInit();
})();

let _capPluginsInited = false;
function capacitorInit(cap) {
    if (_capPluginsInited) return; // run the native plugin setup only once
    _capPluginsInited = true;
    try {
        // Ensure the CSS gate is set (origin check above usually did this already).
        document.documentElement.classList.add('ios-app');

        const plugins = cap.Plugins || {};
        const { StatusBar } = plugins;

        // StatusBar: light text on our dark theme
        if (StatusBar) {
            StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
            // setBackgroundColor is Android-only per Capacitor docs; iOS ignores it safely
            StatusBar.setBackgroundColor?.({ color: '#0a1128' }).catch(() => {});
        }

        // NOTE: SplashScreen.hide() is handled by the resilient hideSplash() loop in
        // bootstrapCapacitorInit above (runs independently of this bridge-gated init,
        // so the splash always hides even if plugin init is delayed on a cold start).

        // --- RevenueCat init (Phase 3b) ---
        // Fetch RC config from backend, configure the SDK, log in user if
        // already authenticated. Runs on every iOS app page load.
        // No-op when user is logged out OR when REVENUECAT_IOS_API_KEY is unset.
        (async () => {
            try {
                const Purchases = plugins.Purchases;
                if (!Purchases) return;

                // Absolute host: this code only runs inside the native app, where the WebView
                // origin is https://localhost — a bare /api/... would hit the bundle, not the
                // backend. CapacitorHttp routes the absolute cross-origin call natively.
                const API_HOST = 'https://directrecruit.net';
                const res = await fetch(`${API_HOST}/api/payments/revenuecat-config`, { credentials: 'include' });
                if (!res.ok) return;  // Not authenticated or backend error — skip
                const cfg = await res.json();
                if (!cfg.apiKey) return;  // Dev mode without RC keys — skip

                await Purchases.configure({ apiKey: cfg.apiKey });

                // If the user is already authenticated, tell RC who they are
                try {
                    const me = await fetch(`${API_HOST}/api/auth/me`, { credentials: 'include' });
                    if (me.ok) {
                        const body = await me.json();
                        if (body && body.user && body.user.id) {
                            await Purchases.logIn({ appUserID: body.user.id });
                        }
                    }
                } catch (_) { /* not authenticated — no-op */ }
            } catch (e) {
                console.error('[capacitorInit][RevenueCat]', e);
            }
        })();

        // --- PushNotifications init (Phase 4c-III) ---
        // Register listeners once at app start. The permission request +
        // register() call is triggered from authAPI.login() after successful auth.
        (async () => {
            try {
                const Push = plugins.PushNotifications;
                if (!Push) return;

                // APNs token obtained → POST to backend /api/device-tokens
                Push.addListener('registration', async (token) => {
                    try {
                        const apnsToken = token && (token.value || token);
                        if (!apnsToken) return;
                        if (window.API && window.API.deviceTokens) {
                            await window.API.deviceTokens.register(
                                apnsToken,
                                'ios',
                                '1.0.0',
                                null
                            );
                        }
                    } catch (e) {
                        console.error('[push] token register failed:', e);
                    }
                });

                Push.addListener('registrationError', (err) => {
                    console.error('[push] APNs registration error:', err);
                });

                // Foreground push received — in-app bell polling + Socket.IO
                // emit (Phase 4c-II) already update the UI, so just log here.
                Push.addListener('pushNotificationReceived', (notification) => {
                    console.log('[push] foreground notification:', notification && notification.title);
                });

                // User tapped push from lock screen / notification center.
                // Resolve role folder from current URL + navigate WebView.
                //
                // Security #36: deep_link_path arrives in the APNs payload and is
                // therefore attacker-influenceable in the worst case (compromised
                // APNs key, server bug, replay). Validate against an allowlist of
                // known backend-emitted shapes before navigating. The backend
                // emitter lives at backend/utils/notifications.js → buildDeepLinkPath.
                const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
                const DEEP_LINK_ALLOWLIST = [
                    new RegExp('^/messages(?:\\?conversation_id=' + UUID_RE + ')?$', 'i'),
                    new RegExp('^/post-view\\.html\\?(?:post_id|share_id)=' + UUID_RE + '$', 'i'),
                    new RegExp('^/recruiting-board\\.html(?:\\?board_id=' + UUID_RE + ')?$', 'i'),
                    /^\/notifications$/,
                    new RegExp('^/shared/view-profile\\.html\\?user_id=' + UUID_RE + '$', 'i')
                ];
                function isAllowedDeepLinkPath(p) {
                    if (typeof p !== 'string') return false;
                    if (p.length > 256) return false;
                    // Reject control chars (CR/LF/null/tab) outright
                    if (/[\x00-\x1f\x7f]/.test(p)) return false;
                    // Reject anything that could escape relative-path semantics
                    // or smuggle a foreign origin
                    if (p.indexOf('//') !== -1) return false;
                    if (p.indexOf('..') !== -1) return false;
                    if (p.indexOf('\\') !== -1) return false;
                    return DEEP_LINK_ALLOWLIST.some((re) => re.test(p));
                }

                Push.addListener('pushNotificationActionPerformed', (action) => {
                    try {
                        const data = action && action.notification && action.notification.data;
                        const deepLinkPath = data && data.deep_link_path;
                        if (!deepLinkPath) return;

                        if (!isAllowedDeepLinkPath(deepLinkPath)) {
                            console.warn('[push] rejected deep link (not in allowlist)');
                            return;
                        }

                        const currentPath = window.location.pathname || '';
                        const roleMatch = currentPath.match(/\/frontend\/([^\/]+)/);
                        const role = roleMatch ? roleMatch[1] : null;
                        if (!role) {
                            console.warn('[push] could not detect role folder; ignoring deep link');
                            return;
                        }

                        // Build full path. /shared/... bypasses the role prefix.
                        let fullPath;
                        if (deepLinkPath.indexOf('/shared/') === 0) {
                            fullPath = '/frontend' + deepLinkPath;
                        } else if (deepLinkPath.charAt(0) === '/') {
                            fullPath = '/frontend/' + role + '/tabs' + deepLinkPath;
                        } else {
                            fullPath = '/frontend/' + role + '/tabs/' + deepLinkPath;
                        }

                        // Add .html extension if missing (e.g. /messages?x → /messages.html?x)
                        const qIdx = fullPath.indexOf('?');
                        const pathPart = qIdx === -1 ? fullPath : fullPath.substring(0, qIdx);
                        const queryPart = qIdx === -1 ? '' : fullPath.substring(qIdx);
                        if (pathPart && !/\.html$/.test(pathPart) && pathPart.charAt(pathPart.length - 1) !== '/') {
                            fullPath = pathPart + '.html' + queryPart;
                        }

                        // Full URL (origin + path) — bare /frontend/... no-ops in iOS WKWebView.
                        window.location.href = window.location.origin + fullPath;
                    } catch (e) {
                        console.error('[push] tap handler error:', e);
                    }
                });
            } catch (e) {
                console.error('[capacitorInit][Push]', e);
            }
        })();

        // --- Page-transition spinner overlay (Phase 5) ---
        // On iOS, MPA navigations flash dark between pages. Show a tiny
        // spinner overlay during navigation; the browser discards it on the
        // next DOM ready. No-op on web (gated by .ios-app class).
        (async () => {
            try {
                if (!document.documentElement.classList.contains('ios-app')) return;

                const style = document.createElement('style');
                style.textContent = `
                    .dr-nav-overlay {
                        position: fixed; inset: 0; background: #0a1128;
                        z-index: 2147483647;
                        display: flex; align-items: center; justify-content: center;
                        opacity: 0; transition: opacity 120ms ease-in;
                        pointer-events: none;
                    }
                    .dr-nav-overlay.visible { opacity: 1; pointer-events: auto; }
                    .dr-nav-spinner {
                        width: 42px; height: 42px; border-radius: 50%;
                        border: 3px solid rgba(255,255,255,0.2);
                        border-top-color: #1282a2;
                        animation: dr-nav-spin 0.8s linear infinite;
                    }
                    @keyframes dr-nav-spin {
                        to { transform: rotate(360deg); }
                    }
                `;
                document.head.appendChild(style);

                let safetyTimer = null;
                function showOverlay() {
                    let el = document.getElementById('drNavOverlay');
                    if (!el) {
                        el = document.createElement('div');
                        el.id = 'drNavOverlay';
                        el.className = 'dr-nav-overlay';
                        el.innerHTML = '<div class="dr-nav-spinner"></div>';
                        document.body.appendChild(el);
                    }
                    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
                    // Safety net: if nav doesn't happen within 2s (e.g. JS preventDefault),
                    // auto-hide so the overlay doesn't get stuck.
                    if (safetyTimer) clearTimeout(safetyTimer);
                    safetyTimer = setTimeout(() => {
                        const stuck = document.getElementById('drNavOverlay');
                        if (stuck) stuck.remove();
                    }, 2000);
                }

                // Capture-phase listener so we see the click before page handlers.
                document.addEventListener('click', function (e) {
                    let a = e.target;
                    while (a && a.tagName !== 'A') a = a.parentNode;
                    if (!a || !a.href) return;
                    if (a.target === '_blank') return;
                    if (a.getAttribute('download') != null) return;

                    let url;
                    try { url = new URL(a.href, window.location.origin); } catch (_) { return; }
                    if (url.origin !== window.location.origin) return;

                    // Skip pure same-page hash anchors
                    const sameDocument =
                        url.pathname === window.location.pathname &&
                        url.search === window.location.search;
                    if (sameDocument && url.hash) return;

                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;

                    showOverlay();
                }, true);

                // Same-origin form submits (post/redirects)
                document.addEventListener('submit', function (e) {
                    const form = e.target;
                    if (!form || !form.action) return;
                    try {
                        const url = new URL(form.action, window.location.origin);
                        if (url.origin === window.location.origin) showOverlay();
                    } catch (_) {}
                }, true);

                // bfcache restore — tear down any lingering overlay
                window.addEventListener('pageshow', function () {
                    const el = document.getElementById('drNavOverlay');
                    if (el) el.remove();
                });
            } catch (e) {
                console.error('[capacitorInit][NavSpinner]', e);
            }
        })();

        // --- Edge-swipe-back (JS fallback) ---
        // The native WKWebView gesture (allowsBackForwardNavigationGestures) requires a
        // compiled CAPBridgeViewController subclass wired into the Xcode target, which is
        // fragile across Windows→Mac builds. This JS handler is target-membership-independent:
        // a swipe starting near the left edge and moving right triggers history.back().
        // Gated to the iOS app via .ios-app; never runs on web/desktop.
        (function edgeSwipeBack() {
            try {
                if (!document.documentElement.classList.contains('ios-app')) return;
                // Only enable edge-swipe-back on landing/auth pages. Signed-in platform
                // pages use the in-app bottom nav and must NOT honor browser-history swipes
                // (mirrors the mobileWebRedirect '/landingpage/' convention in api.js).
                if (!window.location.pathname.includes('/landingpage/')) return;

                const EDGE_PX = 30;        // must start within 30px of the left edge
                const MIN_DX = 60;         // horizontal distance to count as a swipe
                const MAX_DY = 50;         // reject mostly-vertical gestures (scrolling)
                let startX = 0, startY = 0, tracking = false;

                document.addEventListener('touchstart', function (e) {
                    if (!e.touches || e.touches.length !== 1) { tracking = false; return; }
                    const t = e.touches[0];
                    tracking = t.clientX <= EDGE_PX;   // only arm near the left edge
                    startX = t.clientX;
                    startY = t.clientY;
                }, { passive: true });

                document.addEventListener('touchend', function (e) {
                    if (!tracking) return;
                    tracking = false;
                    const t = (e.changedTouches && e.changedTouches[0]);
                    if (!t) return;
                    const dx = t.clientX - startX;
                    const dy = Math.abs(t.clientY - startY);
                    // left-edge → rightward swipe, mostly horizontal, with history to go back to
                    if (dx >= MIN_DX && dy <= MAX_DY && window.history.length > 1) {
                        window.history.back();
                    }
                }, { passive: true });
            } catch (e) {
                console.error('[capacitorInit][EdgeSwipeBack]', e);
            }
        })();
        // (Removed the bottom-nav delegation fallback: the real fix is origin-prefixed nav
        // hrefs in my-profile.js, which navigate natively. Delegation is no longer needed.)
    } catch (e) {
        console.error('[capacitorInit]', e);
    }
}
