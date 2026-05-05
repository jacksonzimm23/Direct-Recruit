// ==================== Capacitor Init (Phase 2b) ====================
// Adds .ios-app class to <html> when running inside the Capacitor WebView.
// Initializes StatusBar + hides SplashScreen after first paint.
// Safe to load on mobile web and desktop — it's a no-op there.
// MUST load BEFORE api.js / feed.js / any other scripts that might
// rely on `.ios-app` for conditional behavior.
(function capacitorInit() {
    try {
        const cap = window.Capacitor;
        if (!cap || typeof cap.isNativePlatform !== 'function') return;
        if (!cap.isNativePlatform()) return;

        // Mark <html> for CSS scoping — as early as possible, before first paint
        document.documentElement.classList.add('ios-app');

        const plugins = cap.Plugins || {};
        const { StatusBar, SplashScreen } = plugins;

        // StatusBar: light text on our dark theme
        if (StatusBar) {
            StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
            // setBackgroundColor is Android-only per Capacitor docs; iOS ignores it safely
            StatusBar.setBackgroundColor?.({ color: '#0a1128' }).catch(() => {});
        }

        // SplashScreen: hide after DOM is ready + 300ms buffer for first render
        if (SplashScreen) {
            const hide = () => setTimeout(() => {
                SplashScreen.hide().catch(() => {});
            }, 300);
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', hide, { once: true });
            } else {
                hide();
            }
        }

        // --- RevenueCat init (Phase 3b) ---
        // Fetch RC config from backend, configure the SDK, log in user if
        // already authenticated. Runs on every iOS app page load.
        // No-op when user is logged out OR when REVENUECAT_IOS_API_KEY is unset.
        (async () => {
            try {
                const Purchases = plugins.Purchases;
                if (!Purchases) return;

                const res = await fetch('/api/payments/revenuecat-config', { credentials: 'include' });
                if (!res.ok) return;  // Not authenticated or backend error — skip
                const cfg = await res.json();
                if (!cfg.apiKey) return;  // Dev mode without RC keys — skip

                await Purchases.configure({ apiKey: cfg.apiKey });

                // If the user is already authenticated, tell RC who they are
                try {
                    const me = await fetch('/api/auth/me', { credentials: 'include' });
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

                        window.location.href = fullPath;
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
    } catch (e) {
        console.error('[capacitorInit]', e);
    }
})();
