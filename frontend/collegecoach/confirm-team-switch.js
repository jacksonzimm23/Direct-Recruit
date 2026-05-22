// Lands here from the invite email. Validates the token, checks auth, and on
// confirm calls POST /coach-signup/confirm-team-switch which flips the coach's
// team_name + college_division + state on their existing coach_profiles row.
//
// Auth flow: if the coach isn't signed in we punt to signin.html?next=...
// which auth.js (frontend/landingpage/auth.js:50-63) honors as a same-origin
// post-signin redirect. The page then re-runs the validate + confirm path.

(function () {
    const titleEl = document.getElementById('statusTitle');
    const msgEl = document.getElementById('statusMessage');
    const detailsEl = document.getElementById('switchDetails');
    const fromEl = document.getElementById('fromTeam');
    const toEl = document.getElementById('toTeam');
    const actionsEl = document.getElementById('actionButtons');
    const confirmBtn = document.getElementById('confirmBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const helpEl = document.getElementById('helpText');
    const iconEl = document.getElementById('statusIcon');

    function setError(message) {
        if (titleEl) titleEl.textContent = "We couldn't process this link";
        if (msgEl) msgEl.textContent = message;
        if (detailsEl) detailsEl.style.display = 'none';
        if (actionsEl) actionsEl.style.display = 'none';
        if (iconEl) iconEl.style.color = '#dc2626';
        if (helpEl) helpEl.textContent = 'Need help? Reach out to support@directrecruit.net.';
    }

    function setSuccess(message) {
        if (titleEl) titleEl.textContent = 'School change confirmed!';
        if (msgEl) msgEl.textContent = message;
        if (detailsEl) detailsEl.style.display = 'none';
        if (actionsEl) actionsEl.style.display = 'none';
        if (iconEl) iconEl.style.color = '#16a34a';
        if (helpEl) helpEl.textContent = "Redirecting to your profile...";
    }

    function getTokenFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('token');
    }

    // In dev the backend serves frontend files under /frontend/... (see
    // server.js:181). In prod they're served from the root. Detect from the
    // current URL so internal redirects don't 404.
    function frontendPrefix() {
        return window.location.pathname.startsWith('/frontend/') ? '/frontend' : '';
    }

    function buildSigninRedirect(token) {
        // The `next` param is decoded by auth.js (same-origin only, relative
        // path required). We URI-encode the current relative path including
        // the token query so the round-trip preserves it.
        const prefix = frontendPrefix();
        const path = `${prefix}/collegecoach/confirm-team-switch.html?token=${encodeURIComponent(token)}`;
        return `${prefix}/landingpage/signin.html?next=${encodeURIComponent(path)}`;
    }

    async function main() {
        const token = getTokenFromUrl();
        if (!token) {
            setError('This link is missing its verification token.');
            return;
        }

        // Step 1 — validate the token (works without auth).
        let info;
        try {
            info = await API.coachSignup.validateToken(token);
        } catch (err) {
            const reason = (err && err.data && err.data.reason) || 'invalid';
            const map = {
                used: "This link has already been used. If you didn't switch schools, contact support.",
                revoked: "This link was revoked. Contact support if you still need to switch schools.",
                expired: "This link has expired. You'll need to submit a new switch request.",
                invalid: 'This verification link is invalid.'
            };
            setError(map[reason] || map.invalid);
            return;
        }

        if (!info || !info.valid) {
            setError('This verification link is no longer valid.');
            return;
        }

        if (!info.is_team_switch) {
            setError('This link is for a different verification flow and cannot be used here.');
            return;
        }

        // Step 2 — must be signed in. If not, punt to signin with ?next= round-trip.
        let me;
        try {
            me = await API.auth.getCurrentUser();
        } catch (_) {
            window.location.href = buildSigninRedirect(token);
            return;
        }
        if (!me || !me.user) {
            window.location.href = buildSigninRedirect(token);
            return;
        }

        // Token must belong to this account.
        if (info.existing_user_id && info.existing_user_id !== me.user.id) {
            setError("This link is tied to a different account. Sign out and sign in with the account that requested this switch.");
            return;
        }

        // Step 3 — render the confirmation UI.
        if (titleEl) titleEl.textContent = 'Confirm your school change';
        if (msgEl) msgEl.textContent = 'Please review the change below and confirm.';
        if (fromEl) {
            const fromDiv = info.old_division ? ` · ${info.old_division}` : '';
            fromEl.textContent = (info.old_team_name || 'your current school') + fromDiv;
        }
        if (toEl) {
            const toDiv = info.division ? ` · ${info.division}` : '';
            toEl.textContent = (info.school || 'your new school') + toDiv;
        }
        if (detailsEl) detailsEl.style.display = '';
        if (actionsEl) actionsEl.style.display = 'flex';

        confirmBtn.addEventListener('click', async () => {
            confirmBtn.disabled = true;
            cancelBtn.disabled = true;
            confirmBtn.textContent = 'Confirming...';
            try {
                const resp = await API.coachSignup.confirmTeamSwitch(token);
                setSuccess(`You're now with ${resp.new_team_name}.`);
                setTimeout(() => {
                    window.location.href = `${frontendPrefix()}/collegecoach/tabs/my-profile.html`;
                }, 1800);
            } catch (err) {
                const m = (err && err.data && err.data.error) || err.message || 'Failed to confirm switch';
                setError(m);
            }
        });

        cancelBtn.addEventListener('click', () => {
            window.location.href = '/collegecoach/tabs/my-profile.html';
        });
    }

    document.addEventListener('DOMContentLoaded', main);
})();
