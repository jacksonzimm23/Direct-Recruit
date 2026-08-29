// Sign In Form Handler
// Uses API_BASE_URL from shared/api.js

// Unpaid users on paid profile types must land on the paywall straight from signin.
// Routing them to the mainpage first set up a navigation race on iOS: the global
// paywall IIFE's redirect (shared/api.js) aborted the page's in-flight fetches and
// feed.js's error handler bounced the user back to signin. Mirrors PAID_FOLDERS +
// the status allowlist in that IIFE.
// 2026-07: players are free on the platform — their subscription only unlocks the
// AI Rep page, which is gated in-page — so they sign in straight to their mainpage.
// (Was: ['hsplayer','transferplayer','collegecoach'].)
const PAYWALL_PAID_FOLDERS = ['collegecoach'];
function needsPaywall(folder, user) {
    return PAYWALL_PAID_FOLDERS.includes(folder) &&
        !['active', 'past_due', 'comp', 'trialing'].includes(user && user.subscription_status);
}

// NOTE: The drill-lab prototype is a standalone testing tool and is intentionally
// NOT wired into the sign-in flow. It must never gate or redirect the production
// iOS app (its page isn't in the app bundle, so any redirect there dead-ends).
// A prior email-based drill-lab gate here broke sign-in on iOS and was removed.

// Auto-login: sessions persist until the user signs out (there is no "Remember me"),
// so anyone with a live session is sent straight to their dashboard.
(async function checkExistingSession() {
    // getUser() is truthy for anyone who has ever signed in or registered on this
    // device (setUser runs in authAPI.login and authAPI.register) and is cleared by
    // clearAuth() on sign-out. Using it as the gate keeps the fast path for a
    // first-time visitor — no /auth/me round trip, no iOS splash hold — while
    // everyone else gets auto-logged-in. This replaced the old dr_remember_me gate,
    // which never fired for a freshly created account because nothing set it, so a
    // new user who closed the app came back logged out despite a valid session.
    if (!getUser()) {
        // Release any held iOS splash (capacitor-init.js holds it on the app's
        // landing page until this decision) so the page is revealed promptly.
        if (window.__drReleaseSplash) window.__drReleaseSplash();
        return;
    }

    try {
        // getCurrentUser wraps apiRequest, which attaches the iOS Bearer token (a plain
        // fetch sends only the cookie, unreliable in the WKWebView), and stores the
        // renewed token when the server slides the session forward. Throws on 401.
        const meData = await authAPI.getCurrentUser();
        // Guard: a 200 with no user (e.g. cookie not sent in an iOS WebView) must not crash the
        // page on load — fall through to the catch and show the normal sign-in form.
        if (!meData || !meData.user || !meData.user.role) throw new Error('No valid session');

        // Valid session — redirect to their dashboard
        const folder = getProfileFolder({
            role: meData.user.role,
            is_transfer_player: meData.user.is_transfer_player,
            ...meData.profile
        });

        if (needsPaywall(folder, meData.user)) {
            window.location.href = new URL('../shared/subscription-required.html', window.location.href).href;
            return;
        }

        let pageName;
        if (meData.user.role === 'player') pageName = 'mainpage-player.html';
        else if (meData.user.role === 'coach') pageName = 'mainpage-coach.html';
        else pageName = 'mainpage-other.html';

        // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
        // (bare/relative targets silently no-op there). new URL(rel, location.href)
        // correctly preserves the /frontend prefix on web and its absence in-app.
        window.location.href = new URL(`../${folder}/${pageName}`, window.location.href).href;
    } catch (e) {
        // Session invalid (expired, revoked, or signed out elsewhere) — drop the
        // cached user, the legacy remember-me key, and the stale iOS Bearer token,
        // then show the landing/sign-in page.
        clearAuth();
        // Release the held iOS splash (if any) so the landing page is shown.
        if (window.__drReleaseSplash) window.__drReleaseSplash();
    }
})();

if (document.getElementById('signinForm')) {
    const form = document.getElementById('signinForm');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Disable button and show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        try {
            const data = await authAPI.login(email, password);

            // Guard against a malformed/empty success body (e.g. the auth cookie failed to
            // persist in an iOS WebView, or a proxy returned a non-JSON 200). Reading
            // data.user.role on an undefined user is what produced the raw
            // "undefined is not an object (evaluating 'data.user.role')" crash.
            if (!data || !data.user || !data.user.role) {
                // Defensive: a malformed/empty success body should fail cleanly, not crash on
                // data.user.role. (The iOS HTML-instead-of-JSON cause is fixed via CapacitorHttp.)
                throw new Error('Sign-in did not complete. Please try again.');
            }

            // Honor ?next=<relative-path> on the signin URL so flows that bounce users
            // through signin (e.g., the invite-gated profile-type switch to collegecoach)
            // can return them to where they were after authentication.
            // SECURITY: only allow same-origin relative paths starting with "/" — never an
            // absolute URL or scheme — to avoid open-redirect to phishing sites.
            const nextRaw = new URLSearchParams(window.location.search).get('next');
            if (nextRaw) {
                let nextPath = null;
                try { nextPath = decodeURIComponent(nextRaw); } catch (e) { nextPath = null; }
                if (nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//')) {
                    window.location.href = nextPath;
                    return;
                }
            }

            // Redirect to correct role folder after login
            if (data.user.role === 'player' || data.user.role === 'coach') {
                try {
                    // apiRequest attaches the iOS Bearer token (plain fetch sends only the
                    // cookie, which is unreliable in the WKWebView). Throws on 401.
                    const meData = await apiRequest('/auth/me');
                    const folder = getProfileFolder({
                        role: meData.user.role,
                        is_transfer_player: meData.user.is_transfer_player,
                        ...meData.profile
                    });

                    if (needsPaywall(folder, meData.user)) {
                        window.location.href = new URL('../shared/subscription-required.html', window.location.href).href;
                        return;
                    }

                    const pageName = data.user.role === 'player' ? 'mainpage-player.html' : 'mainpage-coach.html';
                    // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
                    // (bare/relative targets silently no-op there). new URL(rel, location.href)
                    // correctly preserves the /frontend prefix on web and its absence in-app.
                    window.location.href = new URL(`../${folder}/${pageName}`, window.location.href).href;
                } catch (profileError) {
                    // If profile fetch fails, use safe defaults
                    const fallback = data.user.role === 'player' ? '../hsplayer/mainpage-player.html' : '../hscoach/mainpage-coach.html';
                    window.location.href = new URL(fallback, window.location.href).href;
                }
            } else if (data.user.role === 'other') {
                window.location.href = new URL('../other/mainpage-other.html', window.location.href).href;
            }
        } catch (error) {
            // If email not verified, redirect to verify-email page
            if (error.data && error.data.requiresVerification) {
                localStorage.setItem('pendingVerificationEmail', error.data.email);
                // Prefer the specific subtype (set by backend when the user has completed
                // profile creation but not email verification — e.g. coach bailed after paying).
                // Fall back to generic role routing for pre-profile registrations.
                let folder = null;
                if (error.data.subtype) {
                    folder = error.data.subtype;
                } else if (error.data.role === 'coach') {
                    folder = 'hscoach';
                } else if (error.data.role === 'other') {
                    folder = 'other';
                } else {
                    folder = 'hsplayer';
                }
                window.location.href = new URL(`../${folder}/verify-email.html`, window.location.href).href;
                return;
            }
            // Show inline error message instead of alert
            const errorEl = document.getElementById('loginError');
            if (errorEl) {
                errorEl.textContent = error.message || 'Invalid email or password';
                errorEl.style.display = 'block';
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Sign In<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
        }
    });
}

// Role Selection Handler
function selectRole(role) {
    // Redirect directly to create-profile page
    if (role === 'player') {
        // Show player type selection modal
        showPlayerTypeModal();
    } else if (role === 'coach') {
        // Show coach type selection modal
        showCoachTypeModal();
    } else if (role === 'hscoach') {
        window.location.href = new URL('../hscoach/create-coach-profile.html', window.location.href).href;
    } else if (role === 'collegecoach') {
        // College coach signup is invite-only — send to the contact form
        window.location.href = new URL('coach-signup-request.html', window.location.href).href;
    } else if (role === 'hsplayer') {
        window.location.href = new URL('../hsplayer/create-profile.html', window.location.href).href;
    } else if (role === 'collegeplayer') {
        window.location.href = new URL('../collegeplayer/create-profile.html', window.location.href).href;
    } else if (role === 'transferplayer') {
        window.location.href = new URL('../transferplayer/create-profile.html', window.location.href).href;
    } else if (role === 'other') {
        window.location.href = new URL('../other/create-profile.html', window.location.href).href;
    }
}

// Coach Type Selection Modal
function showCoachTypeModal() {
    const modal = document.createElement('div');
    modal.className = 'coach-type-modal';
    modal.innerHTML = `
        <style>
        .coach-type-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .coach-type-modal .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
        }
        .coach-type-modal .modal-content {
            position: relative;
            background: #0a1128;
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
        }
        .coach-type-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }
        .coach-type-modal .modal-header h2 {
            margin: 0;
            font-size: 1.5rem;
            color: #fefcfb;
            font-weight: 700;
        }
        .coach-type-modal .modal-close {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: rgba(254, 252, 251, 0.6);
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
        }
        .coach-type-modal .modal-close:hover {
            color: #fefcfb;
        }
        .coach-type-options {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .coach-type-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 24px;
            background: rgba(18, 130, 162, 0.1);
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .coach-type-btn:hover {
            background: rgba(18, 130, 162, 0.2);
            border-color: #1282a2;
            transform: translateY(-2px);
        }
        .coach-type-btn svg {
            width: 48px;
            height: 48px;
            color: #1282a2;
        }
        .coach-type-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #fefcfb;
        }
        .coach-type-desc {
            font-size: 0.9rem;
            color: rgba(254, 252, 251, 0.6);
            text-align: center;
        }
        </style>
        <div class="modal-overlay" onclick="closeCoachTypeModal()"></div>
        <div class="modal-content coach-type-content">
            <div class="modal-header">
                <h2>What type of coach are you?</h2>
                <button class="modal-close" onclick="closeCoachTypeModal()">&times;</button>
            </div>
            <div class="coach-type-options">
                <button class="coach-type-btn" onclick="selectRole('hscoach')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span class="coach-type-title">High School Coach</span>
                    <span class="coach-type-desc">Connect with your high school players and network with other coaches</span>
                </button>
                <button class="coach-type-btn" onclick="selectRole('collegecoach')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                    </svg>
                    <span class="coach-type-title">College Coach</span>
                    <span class="coach-type-desc">Recruit players for your college program</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeCoachTypeModal() {
    const modal = document.querySelector('.coach-type-modal');
    if (modal) {
        modal.remove();
    }
}

// Player Type Selection Modal
function showPlayerTypeModal() {
    const modal = document.createElement('div');
    modal.className = 'player-type-modal';
    modal.innerHTML = `
        <style>
        .player-type-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .player-type-modal .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
        }
        .player-type-modal .modal-content {
            position: relative;
            background: #0a1128;
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
        }
        .player-type-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }
        .player-type-modal .modal-header h2 {
            margin: 0;
            font-size: 1.5rem;
            color: #fefcfb;
            font-weight: 700;
        }
        .player-type-modal .modal-close {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: rgba(254, 252, 251, 0.6);
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
        }
        .player-type-modal .modal-close:hover {
            color: #fefcfb;
        }
        .player-type-options {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .player-type-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 24px;
            background: rgba(18, 130, 162, 0.1);
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .player-type-btn:hover {
            background: rgba(18, 130, 162, 0.2);
            border-color: #1282a2;
            transform: translateY(-2px);
        }
        .player-type-btn svg {
            width: 48px;
            height: 48px;
            color: #1282a2;
        }
        .player-type-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #fefcfb;
        }
        .player-type-desc {
            font-size: 0.9rem;
            color: rgba(254, 252, 251, 0.6);
            text-align: center;
        }
        </style>
        <div class="modal-overlay" onclick="closePlayerTypeModal()"></div>
        <div class="modal-content player-type-content">
            <div class="modal-header">
                <h2>What type of player are you?</h2>
                <button class="modal-close" onclick="closePlayerTypeModal()">&times;</button>
            </div>
            <div class="player-type-options">
                <button class="player-type-btn" onclick="selectRole('hsplayer')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span class="player-type-title">High School Player</span>
                    <span class="player-type-desc">Get recruited by college programs</span>
                </button>
                <button class="player-type-btn" onclick="selectRole('collegeplayer')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                    </svg>
                    <span class="player-type-title">College Player</span>
                    <span class="player-type-desc">Connect with other athletes or enter the transfer portal database</span>
                </button>
                <button class="player-type-btn" onclick="selectRole('transferplayer')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span class="player-type-title">Transfer Player</span>
                    <span class="player-type-desc">Enter the transfer portal and connect with new programs</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closePlayerTypeModal() {
    const modal = document.querySelector('.player-type-modal');
    if (modal) {
        modal.remove();
    }
}

// No auto-redirect on signin page - always show the login form
