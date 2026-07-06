// ==================== Mobile Web → App Store Redirect (Phase 1) ====================
// Mobile browsers are redirected to platform-specific "Get the app" pages.
// iOS app (Capacitor WebView) is exempted via window.Capacitor check.
// Landing pages stay accessible on mobile web for SEO/signup flows.
(function mobileWebRedirect() {
    try {
        if (window.Capacitor) return;  // Inside the iOS app — never redirect

        const ua = navigator.userAgent || '';
        const isIOSMobile = /iPhone|iPad|iPod/i.test(ua);
        const isAndroidMobile = /Android/i.test(ua);
        if (!isIOSMobile && !isAndroidMobile) return;  // Desktop — no redirect

        // Exempt: all landing pages + the redirect targets themselves.
        // Admin is NOT exempt per Phase 0 Decision 2.
        const path = window.location.pathname;
        if (path.includes('/landingpage/')) return;
        if (path.endsWith('/get-the-app.html')) return;
        if (path.endsWith('/coming-soon-android.html')) return;
        // Drill Lab (PROTOTYPE): a standalone sandbox, viewable on desktop for
        // inspection. Exempt so it's never bounced to "Get the app". Mirror in
        // shared/mobile-web-redirect.js — keep the two in sync.
        if (path.includes('/drill-lab/')) return;

        // Email-driven flows (Cognito codes, coach invites, password resets) must work
        // on mobile web. Mirror of shared/mobile-web-redirect.js — keep the two in sync.
        const qs = window.location.search || '';
        if (/[?&](token|code|reset|invite)=/i.test(qs)) return;

        // College Coach invite onboarding completes on mobile web (account creation +
        // email verification) before the coach is sent to the app to subscribe via IAP.
        if (path.includes('create-coach-profile.html') ||
            path.includes('confirm-team-switch.html') ||
            path.includes('verify-email.html')) return;

        // Resolve redirect target relative to whether we're served from EC2
        // (paths like /hsplayer/mainpage-hsplayer.html) or Live Server
        // (paths like /frontend/hsplayer/mainpage-hsplayer.html).
        const prefix = path.startsWith('/frontend/') ? '/frontend' : '';
        const target = isIOSMobile
            ? `${prefix}/landingpage/get-the-app.html`
            : `${prefix}/landingpage/coming-soon-android.html`;

        window.location.replace(target);
    } catch (e) {
        console.error('[mobileWebRedirect]', e);
    }
})();

// ==================== Global Error Handlers & Toast System ====================

// Toast notification system
function showToast(message, type = 'error', duration = 4000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        // Bottom-centered, above the mobile bottom nav (76px) + iOS home indicator
        // (env(safe-area-inset-bottom); 0 on web/desktop). Keeps toasts clear of the
        // top status bar and the bottom nav on every page.
        container.style.cssText = 'position:fixed;bottom:calc(88px + env(safe-area-inset-bottom, 0px));left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    const bgColor = type === 'error' ? '#dc3545' : type === 'success' ? '#28a745' : '#ffc107';
    const textColor = type === 'warning' ? '#333' : '#fff';
    toast.style.cssText = `background:${bgColor};color:${textColor};padding:12px 20px;border-radius:8px;font-size:14px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;max-width:380px;word-wrap:break-word;opacity:0;transform:translateY(20px);transition:opacity 0.3s,transform 0.3s;`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Confirmation modal system — returns Promise<boolean>
function showConfirmModal({ title = 'Confirm', message, confirmText = 'Confirm', cancelText = 'Cancel', danger = true, icon = null } = {}) {
    return new Promise((resolve) => {
        // Inject CSS once
        if (!document.getElementById('dr-confirm-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'dr-confirm-modal-styles';
            style.textContent = `
                .dr-confirm-modal-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.7);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 99998;
                    backdrop-filter: blur(4px);
                    animation: confirmFadeIn 0.2s ease-out;
                }
                @keyframes confirmFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .dr-confirm-modal {
                    background: rgba(10, 17, 40, 0.98);
                    border: 1px solid rgba(18, 130, 162, 0.3);
                    border-radius: 16px;
                    padding: 2rem;
                    max-width: 400px;
                    width: 90%;
                    text-align: center;
                    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
                    animation: confirmSlideUp 0.3s ease-out;
                }
                @keyframes confirmSlideUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .dr-confirm-modal-icon {
                    width: 64px;
                    height: 64px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1.5rem;
                }
                .dr-confirm-modal-icon.danger {
                    background: rgba(255, 107, 107, 0.1);
                }
                .dr-confirm-modal-icon.info {
                    background: rgba(18, 130, 162, 0.1);
                }
                .dr-confirm-modal-icon svg {
                    width: 32px;
                    height: 32px;
                    stroke-width: 2;
                }
                .dr-confirm-modal-icon.danger svg {
                    color: #ff6b6b;
                }
                .dr-confirm-modal-icon.info svg {
                    color: #1282a2;
                }
                .dr-confirm-modal-title {
                    font-size: 1.5rem;
                    font-weight: 700;
                    color: #fff;
                    margin: 0 0 0.5rem 0;
                }
                .dr-confirm-modal-text {
                    font-size: 1rem;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0 0 2rem 0;
                    line-height: 1.5;
                }
                .dr-confirm-modal-actions {
                    display: flex;
                    gap: 1rem;
                    justify-content: center;
                }
                .dr-confirm-modal-btn {
                    padding: 0.75rem 2rem;
                    border-radius: 8px;
                    font-size: 1rem;
                    font-weight: 600;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: 'Inter', sans-serif;
                }
                .dr-confirm-modal-btn:hover {
                    transform: translateY(-1px);
                    filter: brightness(1.1);
                }
                .dr-confirm-modal-btn-cancel {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }
                .dr-confirm-modal-btn-cancel:hover {
                    background: rgba(255, 255, 255, 0.15);
                }
                .dr-confirm-modal-btn-confirm.danger {
                    background: #ff6b6b;
                    color: #fff;
                }
                .dr-confirm-modal-btn-confirm.danger:hover {
                    background: #ff5252;
                }
                .dr-confirm-modal-btn-confirm.info {
                    background: #1282a2;
                    color: #fff;
                }
                .dr-confirm-modal-btn-confirm.info:hover {
                    background: #0e6d8a;
                }
                /* Mobile: full-screen instead of centered popup (lesson 75). */
                @media (max-width: 768px) {
                    .dr-confirm-modal-overlay {
                        align-items: stretch;
                        justify-content: stretch;
                    }
                    .dr-confirm-modal {
                        width: 100vw;
                        height: 100vh;
                        max-width: 100vw;
                        max-height: 100vh;
                        border-radius: 0;
                        border: none;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        padding: 2rem 1.5rem;
                    }
                    .dr-confirm-modal-actions {
                        margin-top: 1rem;
                    }
                    .dr-confirm-modal-btn {
                        flex: 1;
                        padding: 0.85rem 1rem;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        const iconType = danger ? 'danger' : 'info';
        // Caller can override with a custom SVG via the `icon` param (preset
        // names or raw SVG markup). Falls back to the default triangle/info
        // markers based on `danger`.
        const presetIcons = {
            trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
            x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="8 12 11 15 16 9"></polyline></svg>'
        };
        const svgIcon = icon
            ? (presetIcons[icon] || icon)
            : (danger
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>');

        const overlay = document.createElement('div');
        overlay.className = 'dr-confirm-modal-overlay';
        overlay.innerHTML = `
            <div class="dr-confirm-modal">
                <div class="dr-confirm-modal-icon ${iconType}">${svgIcon}</div>
                <h2 class="dr-confirm-modal-title">${title}</h2>
                <p class="dr-confirm-modal-text">${message}</p>
                <div class="dr-confirm-modal-actions">
                    <button class="dr-confirm-modal-btn dr-confirm-modal-btn-cancel">${cancelText}</button>
                    <button class="dr-confirm-modal-btn dr-confirm-modal-btn-confirm ${iconType}">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        function close(result) {
            overlay.remove();
            resolve(result);
        }

        overlay.querySelector('.dr-confirm-modal-btn-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.dr-confirm-modal-btn-confirm').addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { document.removeEventListener('keydown', handler); close(false); }
        });
    });
}

// Logout confirmation modal — uses the logout door icon
function showLogoutConfirmModal() {
    return new Promise((resolve) => {
        if (!document.getElementById('dr-confirm-modal-styles')) {
            // Ensure confirm modal CSS is loaded
            showConfirmModal({ title: '', message: '' }).then(() => {});
            document.querySelector('.dr-confirm-modal-overlay')?.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'dr-confirm-modal-overlay';
        overlay.innerHTML = `
            <div class="dr-confirm-modal">
                <div class="dr-confirm-modal-icon danger">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </div>
                <h2 class="dr-confirm-modal-title">Log Out</h2>
                <p class="dr-confirm-modal-text">Are you sure you want to log out?</p>
                <div class="dr-confirm-modal-actions">
                    <button class="dr-confirm-modal-btn dr-confirm-modal-btn-cancel">Cancel</button>
                    <button class="dr-confirm-modal-btn dr-confirm-modal-btn-confirm danger">Log Out</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        function close(result) {
            overlay.remove();
            resolve(result);
        }

        overlay.querySelector('.dr-confirm-modal-btn-cancel').addEventListener('click', () => close(false));
        overlay.querySelector('.dr-confirm-modal-btn-confirm').addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
        document.addEventListener('keydown', function handler(e) {
            if (e.key === 'Escape') { document.removeEventListener('keydown', handler); close(false); }
        });
    });
}

// Global error handler — catches uncaught exceptions
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Uncaught error:', { message, source, lineno, colno, error });
    showToast('Something went wrong. Please try again.');
    return true;
};

// Global handler — catches unhandled promise rejections (async/await without try/catch)
window.addEventListener('unhandledrejection', function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    // Don't toast for network errors during polling (badge updates, new post checks, etc.)
    const msg = event.reason?.message || '';
    if (!msg.includes('Failed to fetch') && !msg.includes('NetworkError')) {
        showToast('Something went wrong. Please try again.');
    }
    event.preventDefault();
});

// ==================== XSS Defense Helpers ====================
// escapeHtml is for HTML body / attribute context: `<span>${name}</span>` or
// `data-x="${val}"`. The textContent->innerHTML round-trip neutralizes
// `<`, `>`, `&`, and `"`.
//
// escapeJsAttr is for JS string literals embedded inside HTML attribute
// handlers: `onclick="goToProfile('${username}')"`. escapeHtml does NOT
// neutralize the apostrophe that breaks out of the JS string literal there.
//
// They are NOT interchangeable. Pick the one that matches the sink context.
function escapeHtml(text) {
    if (text === null || text === undefined || text === '') return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function escapeJsAttr(text) {
    if (text === null || text === undefined || text === '') return '';
    return String(text)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/</g, '\\x3C')
        .replace(/>/g, '\\x3E')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

window.escapeHtml = escapeHtml;
window.escapeJsAttr = escapeJsAttr;

// ==================== API Configuration ====================

// In the iOS app the WebView origin is https://localhost (no server.hostname), so
// window.location.origin is NOT directrecruit.net — we must call the real host
// absolutely. The cross-origin call is then routed natively by CapacitorHttp.
// On web/localhost, keep deriving from the current origin as before.
// Native detection MUST be race-free. window.Capacitor is injected asynchronously by the
// WKWebView and is frequently undefined when this module parses on a cold/fast launch
// (especially the login page). A false reading here permanently disables token storage
// (setAuthToken) AND Bearer injection (apiRequest) for the whole document — so the JWT is
// silently dropped at login and every post-login request fails with the CapacitorHttp
// interceptor "Load failed" error (the intermittent login bug). Detect by WebView ORIGIN
// instead — deterministic at parse time, identical to the .ios-app gate in
// capacitor-init.js. The bundled iOS WebView serves from hostname "localhost" with NO port
// (scheme capacitor:/https:). This excludes dev Live Server (localhost:5500 — has a port)
// and prod (directrecruit.net — different hostname). The bridge call is kept as a
// belt-and-suspenders fallback for any platform that doesn't match the origin shape.
const _isNativeApp = (function () {
    try {
        const loc = window.location;
        const inAppScheme = (loc.protocol === 'capacitor:' || loc.protocol === 'https:');
        if (inAppScheme && loc.hostname === 'localhost' && !loc.port) return true;
    } catch (_) {}
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
})();
const API_BASE_URL = _isNativeApp
    ? 'https://directrecruit.net/api'
    : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? `http://${window.location.hostname}:5000/api`
        : `${window.location.origin}/api`);

// Storage keys
const USER_KEY = 'user_data';
// iOS Bearer-token fallback. The native WebView (origin https://localhost) cannot
// reliably re-attach the cross-origin HttpOnly auth cookie to CapacitorHttp requests
// to directrecruit.net, so on iOS we ALSO store the JWT here and send it as
// Authorization: Bearer. Web never stores/sends this (cookie-only) — gated by _isNativeApp.
const TOKEN_KEY = 'dr_auth_token';

// Get stored user data
function getUser() {
    const userData = localStorage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
}

// Store user data
function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// iOS Bearer token: store only inside the native app. No-op on web.
function setAuthToken(token) {
    if (_isNativeApp && token) {
        try { localStorage.setItem(TOKEN_KEY, token); } catch (_) {}
    }
}
function getAuthToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; }
}

// Clear auth data (user data from localStorage, cookie cleared by backend)
function clearAuth() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('dr_remember_me');
    // Drop the iOS Bearer token so a revoked token isn't re-sent after logout.
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {}
}

// Check if user is authenticated (based on cached user data)
// For actual validation, use authAPI.getCurrentUser()
function isAuthenticated() {
    return !!getUser();
}

// Phase 3b: true when running inside the Capacitor iOS WebView.
// Used to branch payment flows (Stripe on web vs RevenueCat IAP on iOS).
// .ios-app class is set by capacitor-init.js at page-head parse time.
function isIOSApp() {
    return document.documentElement.classList.contains('ios-app');
}

// Base URL for share/copy links (profile links, post links). These must point
// at the PUBLIC website: inside the iOS app the WebView origin is
// https://localhost (bundled files), so origin-derived links would be dead for
// anyone they're shared with. On web, keep the current origin (+ '/frontend'
// in local dev, mirroring the FE_BASE convention).
function getShareBaseUrl() {
    if (_isNativeApp) return 'https://directrecruit.net';
    return window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
}

// API Request wrapper
async function apiRequest(endpoint, options = {}) {
    const config = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    // iOS Bearer fallback: attach the stored JWT so authenticated requests work
    // even when the native WebView can't re-attach the cross-origin HttpOnly cookie.
    // Web (_isNativeApp false) never has a stored token, so this is a no-op there and
    // the cookie continues to be the sole credential. authMiddleware accepts either.
    if (_isNativeApp) {
        const _t = getAuthToken();
        if (_t && !config.headers.Authorization) {
            config.headers.Authorization = 'Bearer ' + _t;
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');

        let data;
        if (isJson) {
            data = await response.json();
        } else {
            // Handle plain text responses (like rate limit errors)
            const text = await response.text();
            // A 2xx that isn't JSON should fail loudly rather than resolve with no data
            // (otherwise callers like login() silently get an object lacking `user`).
            // Log details for debugging; show the user a generic message.
            if (response.ok) {
                console.error(
                    `[apiRequest] Unexpected non-JSON ${response.status} from ${endpoint} ` +
                    `[type: ${contentType || 'none'}]: ${(text || '').slice(0, 200)}`
                );
                const err = new Error('Something went wrong. Please try again.');
                err.status = response.status;
                throw err;
            }
            data = { error: text };
        }

        if (!response.ok) {
            // Handle validation errors array
            if (data.errors && Array.isArray(data.errors)) {
                const errorMessages = data.errors.map(e => e.msg).join(', ');
                console.error('Validation errors:', data.errors);
                const ve = new Error(errorMessages);
                ve.status = response.status;
                ve.data = data;
                throw ve;
            }
            const err = new Error(data.error || data.message || 'Request failed');
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Signup age gate (client side). Reads a YYYY-MM-DD DOB string, computes whole
// years, and if under 13 renders a persistent RED inline error directly under
// the #dateOfBirth field (creating it if needed) and returns false so the
// caller aborts the submit. The backend validator is the real gate; this is the
// UX layer so a child sees the "ages 13+" message immediately. Returns true when
// the DOB is present and the user is 13+.
const SIGNUP_MIN_AGE = 13;
function checkSignupAge(dobValue, fieldId = 'dateOfBirth') {
    const field = document.getElementById(fieldId);
    // Clear any prior inline error
    const priorErr = document.getElementById(fieldId + '-age-error');
    if (priorErr) priorErr.remove();
    if (field) field.style.borderColor = '';

    const showErr = (msg) => {
        if (field) field.style.borderColor = '#dc2626';
        const err = document.createElement('div');
        err.id = fieldId + '-age-error';
        err.textContent = msg;
        err.style.color = '#dc2626';
        err.style.fontSize = '0.85rem';
        err.style.marginTop = '6px';
        err.style.fontWeight = '600';
        if (field && field.parentNode) field.parentNode.appendChild(err);
        if (field) field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    if (!dobValue || !/^\d{4}-\d{2}-\d{2}$/.test(String(dobValue))) {
        showErr('Please enter your date of birth.');
        return false;
    }
    const d = new Date(dobValue + 'T00:00:00');
    if (isNaN(d.getTime()) || d.getTime() > Date.now()) {
        showErr('Please enter a valid date of birth.');
        return false;
    }
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    const m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    if (age < SIGNUP_MIN_AGE) {
        showErr('You must be at least 13 years old to use Direct Recruit.');
        return false;
    }
    return true;
}

// Auth API
const authAPI = {
    // dateOfBirth (YYYY-MM-DD) powers the backend 13+ age gate and is stored on
    // the account. termsAccepted records ToS/Privacy acceptance server-side.
    // Both are required by the backend validator; callers (the create-profile
    // forms) always pass them.
    register: async (email, password, role, dateOfBirth = null, termsAccepted = false) => {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, role, date_of_birth: dateOfBirth, terms_accepted: termsAccepted })
        });

        setUser(data.user);
        setAuthToken(data.token); // iOS Bearer fallback (no-op on web)
        return data;
    },

    login: async (email, password, rememberMe = false) => {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, rememberMe })
        });

        setUser(data.user);
        setAuthToken(data.token); // iOS Bearer fallback (no-op on web)
        if (rememberMe) {
            localStorage.setItem('dr_remember_me', 'true');
        } else {
            localStorage.removeItem('dr_remember_me');
        }

        // Phase 3b: keep RevenueCat identity in sync with our session on iOS.
        // Best-effort — errors are swallowed so they never block login.
        if (isIOSApp() && data && data.user && data.user.id) {
            try {
                const Purchases = window.Capacitor?.Plugins?.Purchases;
                if (Purchases) {
                    // If RC wasn't configured at page load (logged out at load time),
                    // configure it now before logIn.
                    const cfg = await fetch(`${API_BASE_URL}/payments/revenuecat-config`, { credentials: 'include' })
                        .then(r => r.ok ? r.json() : null)
                        .catch(() => null);
                    if (cfg && cfg.apiKey) {
                        try { await Purchases.configure({ apiKey: cfg.apiKey }); }
                        catch (_) { /* already configured — fine */ }
                        await Purchases.logIn({ appUserID: data.user.id });
                    }
                }
            } catch (e) {
                console.error('[authAPI.login][RevenueCat]', e);
            }
        }

        // Phase 4c-III: request iOS push notification permission + register for APNs.
        // Apple shows the dialog once per install; later logins return the prior answer.
        // Best-effort — errors are swallowed so they never block login.
        if (isIOSApp()) {
            try {
                const Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
                if (Push) {
                    const perm = await Push.requestPermissions();
                    if (perm && perm.receive === 'granted') {
                        await Push.register();
                        // Token arrives via the 'registration' listener in capacitor-init.js,
                        // which calls API.deviceTokens.register() on the authenticated session.
                    } else {
                        console.warn('[authAPI.login][Push] permission not granted:', perm && perm.receive);
                    }
                }
            } catch (e) {
                console.error('[authAPI.login][Push]', e);
            }
        }

        return data;
    },

    logout: async () => {
        // Never let a hung iOS plugin promise (RevenueCat / Push) or a stalled network
        // call block the logout redirect — race each against a short timeout, and ALWAYS
        // clear the session + redirect in finally. (Previously a hung Purchases.logOut()
        // on iOS could leave the logout button doing nothing.)
        const withTimeout = (p, ms) => Promise.race([
            Promise.resolve(p).catch(() => {}),
            new Promise((res) => setTimeout(res, ms))
        ]);

        try {
            if (isIOSApp()) {
                // Phase 3b: disassociate RC identity so the next user doesn't inherit it.
                const Purchases = window.Capacitor?.Plugins?.Purchases;
                if (Purchases) await withTimeout(Purchases.logOut(), 2000);

                // Phase 4c-III: clear delivered iOS notifications.
                const Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
                if (Push) await withTimeout(Push.removeAllDeliveredNotifications(), 2000);
            }

            await withTimeout(apiRequest('/auth/logout', { method: 'POST' }), 3000);
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // GUARANTEED to run — even if a plugin/network call hung or threw.
            // Full URL (origin + path), not a bare /frontend/... — iOS WKWebView (origin
            // https://localhost) won't navigate on a bare root-relative path, so the redirect
            // silently no-op'd before (session cleared but page didn't change).
            clearAuth();
            // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
            // path segment; on web there is. Mirror shared/api.js's prefix convention so
            // these URLs resolve in BOTH the WKWebView and the browser.
            const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
            window.location.href = FE_BASE + '/landingpage/index.html';
        }
    },

    getCurrentUser: async () => {
        return await apiRequest('/auth/me');
    }
};

// Profile API
const profileAPI = {
    createPlayerProfile: async (profileData) => {
        return await apiRequest('/profile/player', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    },

    createCoachProfile: async (profileData) => {
        return await apiRequest('/profile/coach', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    },

    createOtherProfile: async (profileData) => {
        return await apiRequest('/profile/other', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    },

    getPlayerProfile: async (userId) => {
        return await apiRequest(`/profile/player/${userId}`);
    },

    getCoachProfile: async (userId) => {
        return await apiRequest(`/profile/coach/${userId}`);
    },

    getOtherProfile: async (userId) => {
        return await apiRequest(`/profile/other/${userId}`);
    },

    // AI Match fit for a player from the requesting coach's program (Plan 7). Coach-only.
    getFit: async (playerUserId) => {
        return await apiRequest(`/profile/fit/${playerUserId}`);
    },

    searchPlayers: async (filters) => {
        const params = new URLSearchParams(filters);
        return await apiRequest(`/profile/search/players?${params}`);
    },

    searchCoaches: async (filters) => {
        const params = new URLSearchParams(filters);
        return await apiRequest(`/profile/search/coaches?${params}`);
    }
};

// Follow API
const followAPI = {
    follow: async (userId) => {
        return await apiRequest(`/follow/${userId}`, { method: 'POST' });
    },

    unfollow: async (userId) => {
        return await apiRequest(`/follow/${userId}`, { method: 'DELETE' });
    },

    getFollowers: async (userId, limit = 50, offset = 0) => {
        return await apiRequest(`/follow/${userId}/followers?limit=${limit}&offset=${offset}`);
    },

    getFollowing: async (userId, limit = 50, offset = 0) => {
        return await apiRequest(`/follow/${userId}/following?limit=${limit}&offset=${offset}`);
    },

    getCounts: async (userId) => {
        return await apiRequest(`/follow/${userId}/counts`);
    },

    checkFollowing: async (userId) => {
        return await apiRequest(`/follow/${userId}/check`);
    }
};

// Posts API
const postsAPI = {
    createPost: async (postData) => {
        return await apiRequest('/posts', {
            method: 'POST',
            body: JSON.stringify(postData)
        });
    },

    getPost: async (postId) => {
        return await apiRequest(`/posts/${postId}`);
    },

    updatePost: async (postId, postData) => {
        return await apiRequest(`/posts/${postId}`, {
            method: 'PUT',
            body: JSON.stringify(postData)
        });
    },

    deletePost: async (postId) => {
        return await apiRequest(`/posts/${postId}`, { method: 'DELETE' });
    },

    // Feed endpoints (Option 4: Two-Section Feed)
    getFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed?limit=${limit}&offset=${offset}`);
    },

    getCombinedFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed/combined?limit=${limit}&offset=${offset}`);
    },

    getFollowingFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed/following?limit=${limit}&offset=${offset}`);
    },

    getDiscoverFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed/discover?limit=${limit}&offset=${offset}`);
    },

    getUserPosts: async (userId, limit = 20, offset = 0) => {
        return await apiRequest(`/posts/user/${userId}?limit=${limit}&offset=${offset}`);
    },

    // Likes
    likePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/like`, { method: 'POST' });
    },

    unlikePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/like`, { method: 'DELETE' });
    },

    getLikes: async (postId, limit = 50, offset = 0) => {
        return await apiRequest(`/posts/${postId}/likes?limit=${limit}&offset=${offset}`);
    },

    getShares: async (postId, limit = 50, offset = 0) => {
        return await apiRequest(`/posts/${postId}/shares?limit=${limit}&offset=${offset}`);
    },

    // Comments
    addComment: async (postId, content, parentCommentId = null) => {
        const body = { content };
        if (parentCommentId) {
            body.parent_comment_id = parentCommentId;
        }
        return await apiRequest(`/posts/${postId}/comments`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    getComments: async (postId, limit = 50, offset = 0) => {
        return await apiRequest(`/posts/${postId}/comments?limit=${limit}&offset=${offset}`);
    },

    getCommentReplies: async (commentId, limit = 20, offset = 0) => {
        return await apiRequest(`/posts/comments/${commentId}/replies?limit=${limit}&offset=${offset}`);
    },

    deleteComment: async (postId, commentId) => {
        return await apiRequest(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
    },

    // Comment likes
    likeComment: async (commentId) => {
        return await apiRequest(`/posts/comments/${commentId}/like`, { method: 'POST' });
    },

    unlikeComment: async (commentId) => {
        return await apiRequest(`/posts/comments/${commentId}/like`, { method: 'DELETE' });
    },

    // Saves (Bookmarks)
    savePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/save`, { method: 'POST' });
    },

    unsavePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/save`, { method: 'DELETE' });
    },

    getSavedPosts: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/saved/list?limit=${limit}&offset=${offset}`);
    },

    getMyReposts: async (limit = 10, offset = 0) => {
        return await apiRequest(`/posts/reposts/mine?limit=${limit}&offset=${offset}`);
    },

    // Shares
    sharePost: async (postId, shareType = 'repost', quoteContent = null, mediaUrls = null, mediaType = null) => {
        const body = { share_type: shareType, quote_content: quoteContent };
        if (mediaUrls && mediaUrls.length > 0) {
            body.media_urls = mediaUrls;
            body.media_type = mediaType;
        }
        return await apiRequest(`/posts/${postId}/share`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    unsharePost: async (shareId) => {
        return await apiRequest(`/posts/shares/${shareId}`, { method: 'DELETE' });
    },

    // Unrepost by post ID (for toggle behavior)
    unrepostPost: async (postId) => {
        return await apiRequest(`/posts/${postId}/repost`, { method: 'DELETE' });
    },

    // Pin
    pinPost: async (postId) => {
        return await apiRequest(`/posts/${postId}/pin`, { method: 'POST' });
    },

    unpinPost: async (postId) => {
        return await apiRequest(`/posts/${postId}/pin`, { method: 'DELETE' });
    }
};

// Messages API
const messagesAPI = {
    getConversations: async (limit = 20, offset = 0) => {
        return await apiRequest(`/messages/conversations?limit=${limit}&offset=${offset}`);
    },

    createConversation: async (otherUserId) => {
        return await apiRequest('/messages/conversations', {
            method: 'POST',
            body: JSON.stringify({ otherUserId })
        });
    },

    getMessages: async (conversationId, limit = 50, offset = 0) => {
        return await apiRequest(`/messages/conversations/${conversationId}?limit=${limit}&offset=${offset}`);
    },

    sendMessage: async (conversationId, content) => {
        return await apiRequest(`/messages/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    },

    markAsRead: async (conversationId) => {
        return await apiRequest(`/messages/conversations/${conversationId}/read`, {
            method: 'POST'
        });
    }
};

// Upload API
const uploadAPI = {
    uploadProfileImage: async (file) => {
        const formData = new FormData();
        formData.append('profile_image', file);

        const response = await fetch(`${API_BASE_URL}/upload/profile-image`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    },

    uploadPostMedia: async (files) => {
        const formData = new FormData();

        // Support both single file and array of files
        const fileArray = Array.isArray(files) ? files : [files];
        fileArray.forEach(file => {
            formData.append('media', file);
        });

        const response = await fetch(`${API_BASE_URL}/upload/post-media`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    },

    uploadMessageMedia: async (file) => {
        const formData = new FormData();
        formData.append('media', file);

        const response = await fetch(`${API_BASE_URL}/upload/message-media`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    }
};

// Notifications API
const notificationsAPI = {
    // Get all notifications with optional filtering
    getNotifications: async (type = null, limit = 50, offset = 0) => {
        let url = `/notifications?limit=${limit}&offset=${offset}`;
        if (type) url += `&type=${type}`;
        return await apiRequest(url);
    },

    // Get unread count
    getUnreadCount: async (type = null) => {
        let url = '/notifications/unread-count';
        if (type) url += `?type=${type}`;
        return await apiRequest(url);
    },

    // Get counts by type
    getCounts: async () => {
        return await apiRequest('/notifications/counts');
    },

    // Mark single notification as read
    markAsRead: async (notificationId) => {
        return await apiRequest(`/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
    },

    // Mark all notifications as read
    markAllAsRead: async (type = null) => {
        let url = '/notifications/read-all';
        if (type) url += `?type=${type}`;
        return await apiRequest(url, {
            method: 'PUT'
        });
    },

    // Delete single notification
    deleteNotification: async (notificationId) => {
        return await apiRequest(`/notifications/${notificationId}`, {
            method: 'DELETE'
        });
    },

    // Delete all notifications
    deleteAll: async (type = null) => {
        let url = '/notifications';
        if (type) url += `?type=${type}`;
        return await apiRequest(url, {
            method: 'DELETE'
        });
    }
};

// Role-based avatar border color utility
function getRoleBorderColor(role, isTransfer, collegeDivision) {
    if (role === 'player') {
        if (isTransfer === true || isTransfer === 'y') return '#ef4444';
        return '#1282a2';
    }
    if (role === 'coach') return '#ff6b35';
    if (role === 'other') return '#d4a017';
    return '#1282a2';
}
window.getRoleBorderColor = getRoleBorderColor;

function getRoleAvatarBg(role, isTransfer, collegeDivision) {
    if (role === 'player') {
        if (isTransfer === true || isTransfer === 'y') return 'rgba(239, 68, 68, 0.2)';
        return 'rgba(18, 130, 162, 0.2)';
    }
    if (role === 'coach') return 'rgba(255, 107, 53, 0.2)';
    if (role === 'other') return 'rgba(212, 160, 23, 0.2)';
    return 'rgba(18, 130, 162, 0.2)';
}
window.getRoleAvatarBg = getRoleAvatarBg;

function buildCommentSubheader(role, data) {
    const parts = [];
    if (role === 'player') {
        if (data.transfer === 'y') {
            if (data.position) parts.push(escapeHtml(data.position));
            if (data.height) {
                const h = String(data.height);
                if (h.includes("'")) { parts.push(escapeHtml(h)); } else { const t = parseInt(h); if (!isNaN(t) && t > 0) parts.push(`${Math.floor(t/12)}'${t%12}"`); }
            }
            if (data.weight) parts.push(`${data.weight} lbs`);
            if (data.eligibility) { const yt = data.eligibility === 1 ? 'year' : 'years'; parts.push(`YOE: ${data.eligibility} ${yt}`); }
            return parts.length ? `<span style="color:#ef4444;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        } else if (data.division) {
            if (data.position) parts.push(escapeHtml(data.position));
            if (data.school) parts.push(escapeHtml(data.school));
            if (data.division) parts.push(escapeHtml(formatDivisionDisplay(data.division)));
            return parts.length ? `<span style="color:#1282a2;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        } else {
            // HS Player: Position • Height • Weight • GradYear
            if (data.position) parts.push(escapeHtml(data.position));
            if (data.height) {
                const h = String(data.height);
                if (h.includes("'")) { parts.push(escapeHtml(h)); } else { const t = parseInt(h); if (!isNaN(t) && t > 0) parts.push(`${Math.floor(t/12)}'${t%12}"`); }
            }
            if (data.weight) parts.push(`${data.weight} lbs`);
            if (data.grad_year) parts.push(escapeHtml(data.grad_year));
            return parts.length ? `<span style="color:#1282a2;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        }
    } else if (role === 'coach') {
        if (data.division) {
            if (data.school && data.state) parts.push(`${escapeHtml(data.school)}, ${escapeHtml(data.state)}`);
            else if (data.school) parts.push(escapeHtml(data.school));
            else if (data.state) parts.push(escapeHtml(data.state));
            if (data.division) parts.push(escapeHtml(formatDivisionDisplay(data.division)));
            return parts.length ? `<span style="color:#ff6b35;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        } else {
            if (data.school) parts.push(escapeHtml(data.school));
            if (data.state) parts.push(escapeHtml(data.state));
            return parts.length ? `<span style="color:#ff6b35;font-size:11px;">${parts.join(', ')}</span>` : '';
        }
    } else if (role === 'other') {
        return data.subheader ? `<span style="color:#d4a017;font-size:11px;">${escapeHtml(data.subheader)}</span>` : '';
    }
    return '';
}
window.buildCommentSubheader = buildCommentSubheader;

// Shared college division list — the single source of truth
const COLLEGE_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'];

/**
 * Determines the correct role folder for a user based on their role, transfer status, and division.
 * Accepts an object with any combination of these fields (from /auth/me, profile endpoints, notifications, etc.)
 * @param {Object} user
 * @param {string} user.role - 'player', 'coach', or 'other'
 * @param {boolean|string} [user.is_transfer_player] - true/false from users table
 * @param {string} [user.transfer] - 'y'/'n' from player_profiles table
 * @param {string} [user.college_division] - division value from profile
 * @returns {string} folder name: 'hsplayer', 'collegeplayer', 'transferplayer', 'hscoach', 'collegecoach', or 'other'
 */
function getProfileFolder(user) {
    const role = user.role;
    const collegeDivision = user.college_division;
    const isCollege = collegeDivision && COLLEGE_DIVISIONS.includes(collegeDivision);
    const isTransfer = user.is_transfer_player || user.transfer === 'y';

    if (role === 'coach') {
        return isCollege ? 'collegecoach' : 'hscoach';
    } else if (role === 'other') {
        return 'other';
    } else {
        // player (default)
        if (isTransfer) return 'transferplayer';
        if (isCollege) return 'collegeplayer';
        return 'hsplayer';
    }
}
window.getProfileFolder = getProfileFolder;
window.COLLEGE_DIVISIONS = COLLEGE_DIVISIONS;

// Absolute URL to a role folder's mainpage, depth-aware (works from both the
// folder root and tabs/ pages). iOS WKWebView: bare-relative navs no-op, so
// resolve against location.href.
function getMainpageUrl(folder) {
    const map = {
        hsplayer: 'mainpage-player.html', collegeplayer: 'mainpage-player.html',
        transferplayer: 'mainpage-player.html', hscoach: 'mainpage-coach.html',
        collegecoach: 'mainpage-coach.html', other: 'mainpage-other.html'
    };
    const depth = window.location.pathname.includes('/tabs/') ? '../../' : '../';
    return new URL(`${depth}${folder}/${map[folder] || 'mainpage-player.html'}`, window.location.href).href;
}
window.getMainpageUrl = getMainpageUrl;

// Normalize legacy division values for display (e.g. 'FBS' → 'D1 FBS')
function formatDivisionDisplay(div) {
    if (!div) return div;
    if (div === 'FBS') return 'D1 FBS';
    if (div === 'FCS') return 'D1 FCS';
    return div;
}
window.formatDivisionDisplay = formatDivisionDisplay;

// AI chat API
const aiAPI = {
    getChats: async (type = 'recruit_assistant') =>
        apiRequest(`/ai/chats?type=${type}`),
    createChat: async (chatType = 'recruit_assistant', title = 'New Chat') =>
        apiRequest('/ai/chats', { method: 'POST', body: JSON.stringify({ chat_type: chatType, title }) }),
    getChat: async (chatId) =>
        apiRequest(`/ai/chats/${chatId}`),
    updateChatTitle: async (chatId, title) =>
        apiRequest(`/ai/chats/${chatId}/title`, { method: 'PUT', body: JSON.stringify({ title }) }),
    deleteChat: async (chatId) =>
        apiRequest(`/ai/chats/${chatId}`, { method: 'DELETE' }),
    sendMessage: async (chatId, message, baselines = null) =>
        apiRequest(`/ai/chats/${chatId}/message`, {
            method: 'POST',
            body: JSON.stringify({ message, baselines })
        }),
    reSearch: async (filters, offset = 0) =>
        apiRequest('/ai/search', {
            method: 'POST',
            body: JSON.stringify({ filters, offset })
        }),
    piReSearch: async (signalFilters, offset = 0) =>
        apiRequest('/ai/pi-search', {
            method: 'POST',
            body: JSON.stringify({ signal_filters: signalFilters, offset })
        }),
    showMore: async (chatId, aiType, filters, signalFilters, offset) =>
        apiRequest(`/ai/chats/${chatId}/show-more`, {
            method: 'POST',
            body: JSON.stringify({
                ai_type: aiType,
                filters: filters || null,
                signal_filters: signalFilters || null,
                offset
            })
        }),
    sendPiMessage: async (chatId, message) =>
        apiRequest(`/ai/chats/${chatId}/pi-message`, {
            method: 'POST',
            body: JSON.stringify({ message })
        }),
    getWatchlist: async () =>
        apiRequest('/ai/watchlist'),
    checkWatchlist: async (playerIds) =>
        apiRequest(`/ai/watchlist/check?playerIds=${playerIds.join(',')}`),
    addToWatchlist: async (playerUserId) =>
        apiRequest(`/ai/watchlist/${playerUserId}`, { method: 'POST' }),
    removeFromWatchlist: async (playerUserId) =>
        apiRequest(`/ai/watchlist/${playerUserId}`, { method: 'DELETE' }),
    clearWatchlist: async () =>
        apiRequest('/ai/watchlist', { method: 'DELETE' }),

    // RA Saved Players
    getSavedPlayers: async () =>
        apiRequest('/ai/saved'),
    checkSavedPlayers: async (playerIds) =>
        apiRequest(`/ai/saved/check?playerIds=${playerIds.join(',')}`),
    savePlayer: async (playerUserId) =>
        apiRequest(`/ai/saved/${playerUserId}`, { method: 'POST' }),
    unsavePlayer: async (playerUserId) =>
        apiRequest(`/ai/saved/${playerUserId}`, { method: 'DELETE' }),
    clearSavedPlayers: async () =>
        apiRequest('/ai/saved', { method: 'DELETE' }),

    // Usage tracking
    getUsage: async () =>
        apiRequest('/ai/usage'),
};

// AI Rep API (player-facing AI analytics)
const aiRepAPI = {
    getBestFitSchools: async (offset = 0, limit = 10) =>
        apiRequest(`/ai-rep/best-fit-schools?offset=${offset}&limit=${limit}`),
    getProfileCompletion: async () =>
        apiRequest('/ai-rep/profile-completion')
};

const paymentsAPI = {
    createCheckoutSession: async (profileType, tier, context, successUrl, cancelUrl) => {
        return await apiRequest('/payments/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ profileType, tier, context, successUrl, cancelUrl })
        });
    },
    getSubscriptionStatus: async () => {
        return await apiRequest('/payments/subscription-status');
    },
    cancelSubscription: async () => {
        return await apiRequest('/payments/cancel', { method: 'POST' });
    },
    reactivateSubscription: async () => {
        return await apiRequest('/payments/reactivate', { method: 'POST' });
    },
    // iOS only: after a successful IAP purchase/restore, ask the backend to re-check
    // RevenueCat (server-to-server, keyed off the trusted user UUID) and flip
    // subscription_status='active' — webhook-independent activation. The customerInfo
    // arg is informational; the server decides authoritatively from RevenueCat.
    reconcileIap: async (customerInfo) => {
        return await apiRequest('/payments/iap-reconcile', {
            method: 'POST',
            body: JSON.stringify({ customerInfo: customerInfo || null })
        });
    }
};

// Phase 4c-III: device-token registration for iOS push notifications.
// Called by the push 'registration' listener in capacitor-init.js.
const deviceTokensAPI = {
    register: async (token, platform, appVersion, osVersion) => {
        return await apiRequest('/device-tokens', {
            method: 'POST',
            body: JSON.stringify({
                token,
                platform,
                app_version: appVersion,
                os_version: osVersion
            })
        });
    },
    // Account-wide push on/off (the iOS settings toggle). Sets users.push_enabled
    // and syncs the user's device rows; notifyUser() honors it for all push types.
    setPushPreference: async (enabled) => {
        return await apiRequest('/device-tokens/preference', {
            method: 'PUT',
            body: JSON.stringify({ enabled })
        });
    }
};

// Unified API object for convenience
const settingsAPI = {
    getSwitchProfileInfo: async () => apiRequest('/settings/switch-profile/info'),
    switchProfile: async (targetType, profileData, confirm = true, inviteToken = null) => {
        const body = { target_type: targetType, profile_data: profileData, confirm };
        if (inviteToken) body.inviteToken = inviteToken;
        return apiRequest('/settings/switch-profile', {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }
};

// Public questionnaire API — NEVER sends auth cookie. The recruit submitting
// the form is not authenticated; even if a logged-in coach previews their own
// questionnaire URL we don't want to leak the auth cookie to a public route.
const questionnaireAPI = {
    get: async (slug) => {
        const res = await fetch(`${API_BASE_URL}/questionnaire/${encodeURIComponent(slug)}`, {
            credentials: 'omit'
        });
        if (!res.ok) {
            const err = new Error('Failed to load questionnaire');
            err.status = res.status;
            throw err;
        }
        return res.json();
    },
    submit: async (slug, data) => {
        const res = await fetch(`${API_BASE_URL}/questionnaire/${encodeURIComponent(slug)}/submit`, {
            method: 'POST',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const err = new Error(body.error || 'Submission failed');
            err.status = res.status;
            throw err;
        }
        return res.json();
    },
    // Upload a single PDF transcript for the recruit. Multipart form-data —
    // the email is sent as a form field (server uses it to shard the S3 key).
    // Returns { success, s3_key }; caller stashes s3_key for the eventual
    // submit() call's submission_data.academic.transcript_s3_keys.
    uploadTranscript: async (slug, file, email) => {
        const fd = new FormData();
        fd.append('transcript', file);
        fd.append('email', email);
        const res = await fetch(`${API_BASE_URL}/questionnaire/${encodeURIComponent(slug)}/transcript`, {
            method: 'POST',
            credentials: 'omit',
            body: fd
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const err = new Error(body.error || 'Upload failed');
            err.status = res.status;
            throw err;
        }
        return res.json();
    }
};

// Team Pool API — authenticated, per-school. Coach sees their school's pool.
const poolAPI = {
    list: async (filters) => {
        const params = new URLSearchParams();
        Object.entries(filters || {}).forEach(([k, v]) => {
            if (v == null || v === '') return;
            if (Array.isArray(v)) v.forEach(item => params.append(k, item));
            else params.append(k, v);
        });
        const qs = params.toString();
        return await apiRequest(`/recruiting-board/my-pool${qs ? '?' + qs : ''}`);
    },
    getEntry: async (entryId) => await apiRequest(`/recruiting-board/my-pool/${entryId}`)
};

// Pipeline API (Plan 4) — per-coach recruit evaluation rows. School_key is
// derived server-side from the coach's team_name; clients never send it.
const pipelineAPI = {
    getMy: async () => await apiRequest('/pipeline/my'),
    // Lightweight "is this DR player in my pipeline?" check. Used by the
    // player-profile "Add to Pipeline" button to render its initial state
    // correctly when a coach navigates back to a player they already added.
    contains: async (playerUserId) => await apiRequest(`/pipeline/contains?player_user_id=${encodeURIComponent(playerUserId)}`),
    addFromPool: async (poolEntryId) => await apiRequest('/pipeline/from-pool', {
        method: 'POST',
        body: JSON.stringify({ pool_entry_id: poolEntryId })
    }),
    addFromProfile: async (playerUserId) => await apiRequest('/pipeline/from-profile', {
        method: 'POST',
        body: JSON.stringify({ player_user_id: playerUserId })
    }),
    updateEvaluation: async (recruitId, { grade, color_tag, notes }) => await apiRequest(`/pipeline/${recruitId}`, {
        method: 'PUT',
        body: JSON.stringify({ grade, color_tag, notes })
    }),
    remove: async (recruitId) => await apiRequest(`/pipeline/${recruitId}`, {
        method: 'DELETE'
    }),

    // Plan 5A — Hand-off endpoints. DOM wiring lives in Plan 5B.
    sendHandoff: async (recruitId, { to_coach_ids, message }) => await apiRequest(`/pipeline/${recruitId}/handoff`, {
        method: 'POST',
        body: JSON.stringify({ to_coach_ids, message: message || null })
    }),
    getEvaluations: async ({ poolEntryId, linkedPlayerUserId }) => {
        const params = new URLSearchParams();
        if (poolEntryId) params.set('pool_entry_id', poolEntryId);
        if (linkedPlayerUserId) params.set('linked_player_user_id', linkedPlayerUserId);
        return await apiRequest(`/pipeline/evaluations?${params.toString()}`);
    },
    // Unified info modal — "Add to Pipeline" footer button when opened from a
    // football-field card. Accepts either pool_entry_id (questionnaire-only) or
    // linked_player_user_id (DR-linked).
    addFromBoard: async ({ poolEntryId, linkedPlayerUserId }) => await apiRequest('/pipeline/from-board', {
        method: 'POST',
        body: JSON.stringify({ pool_entry_id: poolEntryId || null, linked_player_user_id: linkedPlayerUserId || null })
    }),
    // Drives the Final Grade tab in the unified info modal. Returns every
    // shared board the coach belongs to that contains this recruit, with the
    // position + can_edit flag needed to render and save the final synthesis.
    getBoardPromotions: async ({ poolEntryId, linkedPlayerUserId }) => {
        const params = new URLSearchParams();
        if (poolEntryId) params.set('pool_entry_id', poolEntryId);
        if (linkedPlayerUserId) params.set('linked_player_user_id', linkedPlayerUserId);
        return await apiRequest(`/pipeline/board-promotions?${params.toString()}`);
    },
    getHandoffsIn: async () => await apiRequest('/pipeline/handoffs/in'),
    getHandoffsOut: async () => await apiRequest('/pipeline/handoffs/out'),
    getHandoffUnreadCount: async () => await apiRequest('/pipeline/handoffs/unread-count'),
    markHandoffsSeen: async () => await apiRequest('/pipeline/handoffs/mark-seen', { method: 'POST' }),
    acceptHandoff: async (handoffId) => await apiRequest(`/pipeline/handoff/${handoffId}/accept`, { method: 'POST' }),
    rejectHandoff: async (handoffId) => await apiRequest(`/pipeline/handoff/${handoffId}/reject`, { method: 'POST' }),
    clearResolvedOutboundHandoffs: async () => await apiRequest('/pipeline/handoffs/out/clear-resolved', { method: 'POST' })
};

// Plan 5A — coachesAPI surface. Currently just the recipient lookup for the
// Plan 5B Send Hand-Off modal. Other coach endpoints (search, discover) live
// on the API object directly via API.get('/coaches/...').
const coachesAPI = {
    getAtMySchool: async () => await apiRequest('/coaches/at-my-school')
};

// Team-switch flow + verify-token. The new-coach signup flow uses a public
// page that posts directly via fetch(); these helpers are for the
// authenticated team-switch entry points called from the collegecoach Edit
// Profile modal + the confirm-team-switch landing page.
const coachSignupAPI = {
    getTeamSwitchEligibility: async () => await apiRequest('/coach-signup/team-switch/eligibility'),
    requestTeamSwitch: async (payload) => await apiRequest('/coach-signup/request', {
        method: 'POST',
        body: JSON.stringify(Object.assign({ is_team_switch: true }, payload))
    }),
    validateToken: async (token) => await apiRequest(`/coach-signup/validate-token?token=${encodeURIComponent(token)}`),
    confirmTeamSwitch: async (token) => await apiRequest('/coach-signup/confirm-team-switch', {
        method: 'POST',
        body: JSON.stringify({ token })
    }),
    // DEV ONLY — backend is hard-gated on NODE_ENV==='development' and returns
    // 403 in prod. Bypasses the admin-verification team-switch flow.
    devTeamSwitch: async ({ new_team_name, new_division, new_state }) =>
        await apiRequest('/coach-signup/dev-team-switch', {
            method: 'POST',
            body: JSON.stringify({ new_team_name, new_division, new_state })
        })
};

// Tiny env discriminator (GET /api/config). Cached after first call so we
// don't refetch on every modal open. Returns { env: 'development' | 'production' }.
// Falls back to 'production' on any error so dev-only UI stays hidden when
// the backend is unreachable.
let _cachedConfig = null;
const configAPI = {
    getEnv: async () => {
        if (_cachedConfig) return _cachedConfig;
        try {
            // apiRequest prepends /api so we just pass /config.
            _cachedConfig = await apiRequest('/config');
        } catch (e) {
            _cachedConfig = { env: 'production' };
        }
        return _cachedConfig;
    }
};

const blocksAPI = {
    list:    ()       => apiRequest('/blocks'),
    check:   (userId) => apiRequest(`/blocks/check/${userId}`),
    block:   (userId) => apiRequest(`/blocks/${userId}`, { method: 'POST' }),
    unblock: (userId) => apiRequest(`/blocks/${userId}`, { method: 'DELETE' })
};

const reportsAPI = {
    create: ({ contentType, contentId, reportedUserId, reason, details }) =>
        apiRequest('/reports', {
            method: 'POST',
            body: JSON.stringify({
                content_type: contentType,
                content_id: contentId || null,
                reported_user_id: reportedUserId || null,
                reason,
                details: details || null
            })
        })
};

const API = {
    // Direct access to apiRequest for custom endpoints
    get: async (endpoint) => await apiRequest(endpoint),
    post: async (endpoint, data) => await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    put: async (endpoint, data) => await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    delete: async (endpoint) => await apiRequest(endpoint, {
        method: 'DELETE'
    }),

    // Sub-APIs
    auth: authAPI,
    profile: profileAPI,
    follow: followAPI,
    posts: postsAPI,
    messages: messagesAPI,
    upload: uploadAPI,
    notifications: notificationsAPI,
    ai: aiAPI,
    aiRep: aiRepAPI,
    settings: settingsAPI,
    payments: paymentsAPI,
    deviceTokens: deviceTokensAPI,
    questionnaire: questionnaireAPI,
    pool: poolAPI,
    pipeline: pipelineAPI,
    coaches: coachesAPI,
    coachSignup: coachSignupAPI,
    config: configAPI,
    blocks: blocksAPI,
    reports: reportsAPI,

    // Auth helpers
    getUser,
    setUser,
    clearAuth,
    isAuthenticated,
    isIOSApp,
    getShareBaseUrl,
    // iOS Bearer fallback — exposed so raw-fetch flows (verify-email, switch-profile)
    // can persist a freshly-issued/rotated token. No-op on web.
    setAuthToken,
    getAuthToken
};

// Make API available globally
window.API = API;
window.API_BASE_URL = API_BASE_URL;

// ─── Subscription Paywall Check ──────────────────────────────────────────────
// Runs on every protected page. Redirects unpaid users on paid profile types.
(function() {
    // Paid profile folders gated by the paywall. Players are paid again (7-day trial).
    const PAID_FOLDERS = ['hsplayer', 'transferplayer', 'collegecoach'];
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    const paywallPath = FE_BASE + '/shared/subscription-required.html';

    // Skip if already on paywall, landing pages, or payment pages
    const path = window.location.pathname;
    if (path.includes('subscription-required') ||
        path.includes('landingpage') ||
        path.includes('payment-success') ||
        path.includes('create-profile') ||
        path.includes('create-coach-profile') ||
        path.includes('verify-email') ||
        path.includes('get-started') ||
        path.includes('settings')) return;

    // Skip if not authenticated
    if (!isAuthenticated()) return;

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const me = await apiRequest('/auth/me');
            if (!me || !me.user) return;

            const folder = getProfileFolder({
                ...me.user,
                college_division: me.profile?.college_division
            });
            if (!PAID_FOLDERS.includes(folder)) return;

            const status = me.user.subscription_status;
            // Allow active, past_due (Stripe retries payment), comp (admin-approved
            // complimentary access — no Stripe subscription), and trialing (7-day
            // free trial period — full access until it converts or expires).
            if (status === 'active' || status === 'past_due' || status === 'comp' || status === 'trialing') {
                // Phase 3c: webhook has caught up — clear any stale grace key
                try { localStorage.removeItem('iap_pending_activation'); } catch (_) {}
                return;
            }

            // Phase 3c: iOS grace period — after IAP.purchaseTier() resolves
            // but before the RevenueCat webhook lands (typically 1-5s), we
            // honor a local flag set by purchaseTier-consumer code. Prevents
            // the paywall from flickering back in the user's face after a
            // successful IAP purchase. 60s is generous vs RC's P99 latency.
            if (isIOSApp()) {
                try {
                    const raw = localStorage.getItem('iap_pending_activation');
                    if (raw) {
                        const data = JSON.parse(raw);
                        const age = Date.now() - (data.at || 0);
                        if (age < 60000 && data.userId === me.user.id) {
                            return;  // Trust the IAP success
                        }
                        // Stale — clear and fall through to paywall redirect
                        localStorage.removeItem('iap_pending_activation');
                    }
                } catch (_) { /* ignore; fall through */ }
            }

            // Unpaid user on paid profile — redirect to paywall.
            // Flag the redirect so the mainpage's own init (which runs on the same
            // DOMContentLoaded) bails out instead of firing background calls that the
            // navigation will abort — those aborts show up as noisy "Load failed" /
            // "access control checks" console errors on iOS. Cosmetic, but this also
            // skips the redundant /auth/me + badge/feed round-trips.
            window.__paywallRedirecting = true;
            window.location.href = paywallPath;
        } catch (e) {
            // If /me fails, don't block — auth middleware handles unauthorized
        }
    });
})();
