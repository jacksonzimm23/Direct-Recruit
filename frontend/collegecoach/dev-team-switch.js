// DEV-ONLY page: lets a signed-in college coach change their team_name /
// college_division / state instantly, bypassing the admin-verification
// team-switch flow (request -> admin lock+approve -> emailed invite ->
// confirm-team-switch). The backend endpoint is hard-gated on
// NODE_ENV==='development' and returns 403 in prod; this page additionally
// refuses to render the form unless /api/config reports the dev env.
//
// Reuses the shared initSchoolSearch widget (same one used by create-coach-
// profile + the admin lock modal) so the school is picked from the canonical
// school-logos.json list and the division auto-fills.

(function () {
    const titleEl = document.getElementById('statusTitle');
    const msgEl = document.getElementById('statusMessage');
    const formEl = document.getElementById('devForm');
    const currentTeamEl = document.getElementById('devCurrentTeam');
    const divisionSelect = document.getElementById('devDivision');
    const stateInput = document.getElementById('devState');
    const switchBtn = document.getElementById('devSwitchBtn');
    const cancelBtn = document.getElementById('devCancelBtn');
    const iconEl = document.getElementById('statusIcon');
    const helpEl = document.getElementById('helpText');

    let schoolSearch = null;

    function setError(message) {
        if (titleEl) titleEl.textContent = "Can't open the dev bypass";
        if (msgEl) msgEl.textContent = message;
        if (formEl) formEl.style.display = 'none';
        if (iconEl) iconEl.style.color = '#dc2626';
    }

    function setSuccess(message) {
        if (titleEl) titleEl.textContent = 'School changed';
        if (msgEl) msgEl.textContent = message;
        if (formEl) formEl.style.display = 'none';
        if (iconEl) iconEl.style.color = '#16a34a';
        if (helpEl) helpEl.textContent = 'Redirecting to your profile...';
    }

    // In dev the backend serves frontend files under /frontend/... (server.js).
    // Detect from the current URL so internal redirects don't 404.
    function frontendPrefix() {
        return window.location.pathname.startsWith('/frontend/') ? '/frontend' : '';
    }

    // Enable Apply only once a real school + division are present.
    function refreshButtonState() {
        const sel = schoolSearch && schoolSearch.getSelectedSchool();
        const manualName = (document.getElementById('devSchoolName').value || '').trim();
        const name = (sel && sel.name) || manualName;
        const division = divisionSelect.value;
        switchBtn.disabled = !(name && division);
    }

    async function main() {
        // Gate 1 — environment. Falls back to 'production' if /config errors,
        // so the form stays hidden when the backend is unreachable.
        let env = 'production';
        try {
            const cfg = await API.config.getEnv();
            env = (cfg && cfg.env) || 'production';
        } catch (_) { /* stays production */ }
        if (env !== 'development') {
            setError('This bypass is only available on a local development server.');
            return;
        }

        // Gate 2 — must be signed in.
        let me;
        try {
            me = await API.auth.getCurrentUser();
        } catch (_) {
            window.location.href = `${frontendPrefix()}/landingpage/signin.html`;
            return;
        }
        if (!me || !me.user) {
            window.location.href = `${frontendPrefix()}/landingpage/signin.html`;
            return;
        }

        // Gate 3 — must currently be a college coach. /auth/me returns
        // { user, profile }, so read the coach_profiles row off me.profile.
        const p = me.profile || {};
        if (!p.college_division) {
            setError('Only college coaches can switch teams. Your current profile is not a college coach.');
            return;
        }

        // Render the form.
        formEl.style.display = '';
        const curParts = [];
        if (p.college_division) curParts.push(p.college_division);
        if (p.state) curParts.push(p.state);
        currentTeamEl.textContent = (p.team_name || 'No team set') + (curParts.length ? ` · ${curParts.join(' · ')}` : '');

        // Wire the shared school-search widget. assetBasePath is relative to
        // this page (collegecoach/dev-team-switch.html) -> ../assets.
        schoolSearch = initSchoolSearch({
            nameInput: '#devSchoolName',
            divisionSelect: '#devDivision',
            assetBasePath: '../assets',
            onSelect: () => refreshButtonState(),
            onClear: () => refreshButtonState()
        });

        document.getElementById('devSchoolName').addEventListener('input', refreshButtonState);
        divisionSelect.addEventListener('change', refreshButtonState);

        switchBtn.addEventListener('click', onApply);
        cancelBtn.addEventListener('click', () => {
            window.location.href = `${frontendPrefix()}/collegecoach/tabs/my-profile.html`;
        });
    }

    async function onApply() {
        const sel = schoolSearch && schoolSearch.getSelectedSchool();
        const manualName = (document.getElementById('devSchoolName').value || '').trim();
        const newTeam = (sel && sel.name) || manualName;
        const newDiv = divisionSelect.value;
        const newState = (stateInput.value || '').trim();

        if (!newTeam || !newDiv) {
            setError('Pick a school and division first.');
            return;
        }

        switchBtn.disabled = true;
        cancelBtn.disabled = true;
        const original = switchBtn.textContent;
        switchBtn.textContent = 'Applying...';

        try {
            const resp = await API.coachSignup.devTeamSwitch({
                new_team_name: newTeam,
                new_division: newDiv,
                new_state: newState || undefined
            });
            setSuccess(`You're now with ${resp.new_team_name}.`);
            setTimeout(() => {
                window.location.href = `${frontendPrefix()}/collegecoach/tabs/my-profile.html`;
            }, 1500);
        } catch (err) {
            const m = (err && err.data && err.data.error) || err.message || 'Failed to switch team';
            setError(m);
            switchBtn.textContent = original;
            switchBtn.disabled = false;
            cancelBtn.disabled = false;
        }
    }

    document.addEventListener('DOMContentLoaded', main);
})();
