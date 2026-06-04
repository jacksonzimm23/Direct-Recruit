// Coach Signup Request — public contact form submission.
// Two modes:
//   - Default (no ?switch=1): anonymous brand-new signup. Coach fills all fields.
//   - Switch mode (?switch=1): authenticated existing user wants to switch their account
//     to collegecoach. Page is auth-gated, name/personalEmail are pre-filled + locked,
//     submit body includes is_switch:true so the admin sees a "Switch from X" badge.

(function () {
    const form = document.getElementById('coachRequestForm');
    const submitBtn = document.getElementById('submitBtn');
    const formWrap = document.getElementById('formWrap');
    const successState = document.getElementById('successState');

    if (!form) return;

    const EDU_PATTERN = /\.edu(?:\.[a-z]{2})?$/i;
    const isSwitch = new URLSearchParams(window.location.search).get('switch') === '1';

    // Live character count for notes (150 max)
    const notesInput = document.getElementById('notes');
    const notesCount = document.getElementById('notesCharCount');
    if (notesInput && notesCount) {
        notesInput.addEventListener('input', () => {
            notesCount.textContent = notesInput.value.length;
        });
    }

    // Live personal-email availability check — mirrors the pattern in the
    // create-profile forms (hsplayer/profile-form.js etc.). Skipped in switch
    // mode since the personal_email is server-trusted to be the authenticated
    // user's existing email, so it will always come back "taken".
    const personalEmailInput = document.getElementById('personalEmail');
    const personalEmailError = document.getElementById('personalEmailError');
    const personalEmailHint = document.getElementById('personalEmailHint');
    let personalEmailCheckTimeout;
    let isPersonalEmailAvailable = true;

    // API_BASE_URL is set by shared/api.js (loaded before this script in coach-signup-request.html)
    function getApiBase() {
        return window.API_BASE_URL;
    }

    // Wire the debounced availability check (only for new signups, not switches)
    if (!isSwitch && personalEmailInput && personalEmailError) {
        personalEmailInput.addEventListener('input', function () {
            const email = this.value.trim();
            clearTimeout(personalEmailCheckTimeout);

            personalEmailError.style.display = 'none';
            if (personalEmailHint) personalEmailHint.style.display = 'block';
            personalEmailInput.classList.remove('input-error', 'input-success');
            isPersonalEmailAvailable = true;

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email.length > 0 && emailRegex.test(email)) {
                personalEmailCheckTimeout = setTimeout(async () => {
                    try {
                        const response = await fetch(getApiBase() + '/profile/check-email/' + encodeURIComponent(email));
                        const data = await response.json();
                        if (!data.available) {
                            personalEmailError.style.display = 'block';
                            if (personalEmailHint) personalEmailHint.style.display = 'none';
                            personalEmailInput.classList.add('input-error');
                            personalEmailInput.classList.remove('input-success');
                            isPersonalEmailAvailable = false;
                        } else {
                            personalEmailInput.classList.add('input-success');
                            personalEmailInput.classList.remove('input-error');
                            isPersonalEmailAvailable = true;
                        }
                    } catch (err) {
                        // Network/rate-limit error — let the form submit proceed; the
                        // server-side guard at registration time will still catch dupes.
                        isPersonalEmailAvailable = true;
                    }
                }, 500);
            }
        });
    }

    // ─── Switch mode bootstrap ──────────────────────────────────────────────────
    if (isSwitch) {
        // Auth-gate: if user is logged out, send them to signin and bounce back here.
        const isAuthed = (typeof isAuthenticated === 'function') ? isAuthenticated() : false;
        if (!isAuthed) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('signin.html?next=' + next, window.location.href).href;
            return;
        }

        // Update header copy
        const headerTitle = document.querySelector('.request-header h1');
        const headerSub = document.querySelector('.request-header p');
        if (headerTitle) headerTitle.textContent = 'Verify Your College Coach Account';
        if (headerSub) headerSub.textContent = "We need to verify you're a real college coach before switching your account. We'll send a confirmation link to your .edu email after review — your existing account stays as-is until you click the link.";

        // Pre-fill + lock the fields the user can't change (their identity is already known)
        fetch(getApiBase() + '/auth/me', { credentials: 'include' })
            .then(r => r.json())
            .then(me => {
                if (!me) return;
                const profile = me.profile || {};
                const userObj = me.user || {};
                if (profile.first_name && form.firstName) {
                    form.firstName.value = profile.first_name;
                    form.firstName.readOnly = true;
                    form.firstName.classList.add('switch-locked');
                }
                if (profile.last_name && form.lastName) {
                    form.lastName.value = profile.last_name;
                    form.lastName.readOnly = true;
                    form.lastName.classList.add('switch-locked');
                }
                if (userObj.email && form.personalEmail) {
                    form.personalEmail.value = userObj.email;
                    form.personalEmail.readOnly = true;
                    form.personalEmail.classList.add('switch-locked');
                }
            })
            .catch(() => { /* silent — user can still fill manually */ });

        // Update submit button + success message wording
        const btnLabel = submitBtn?.querySelector('.btn-label');
        if (btnLabel) btnLabel.textContent = 'Submit Switch Request';
    }
    // ────────────────────────────────────────────────────────────────────────────

    async function submitRequest(payload) {
        const res = await fetch(getApiBase() + '/coach-signup/request', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'Failed to submit request. Please try again.');
        }
        return data;
    }

    function showError(msg) {
        if (typeof showToast === 'function') {
            showToast(msg, 'error');
        } else {
            alert(msg);
        }
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const firstName = form.firstName.value.trim();
        const lastName = form.lastName.value.trim();
        const school = form.school.value.trim();
        const division = form.division.value;
        const position = form.position.value.trim();
        const phone = form.phone.value.trim();
        const eduEmail = form.eduEmail.value.trim();
        const personalEmail = form.personalEmail.value.trim();
        const notes = form.notes.value.trim();

        // Client-side validation
        if (!firstName || !lastName || !school || !division || !position || !eduEmail || !personalEmail) {
            showError('Please fill in all required fields.');
            return;
        }
        if (!EDU_PATTERN.test(eduEmail)) {
            showError('A valid .edu email address is required.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
            showError('Please enter a valid personal email address.');
            return;
        }
        if (!isSwitch && !isPersonalEmailAvailable) {
            showError('An account with this personal email already exists. Please sign in instead, or use a different email.');
            personalEmailInput.focus();
            return;
        }

        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-label').textContent = 'Submitting...';

        try {
            await submitRequest({
                first_name: firstName,
                last_name: lastName,
                school: school,
                division: division,
                position: position,
                phone: phone,
                edu_email: eduEmail,
                personal_email: personalEmail,
                notes: notes,
                is_switch: isSwitch
            });

            // Show success state
            formWrap.style.display = 'none';
            successState.style.display = 'block';
            if (isSwitch) {
                // Customize wording for switches — they have an existing account so the
                // "we'll send a link" message has different stakes (their account stays as-is until they click)
                const detail = successState.querySelector('.success-detail');
                if (detail) {
                    detail.innerHTML = "Keep an eye on your <strong>.edu</strong> inbox — we'll send your verification link there once approved. Your existing account stays as-is until you click the link.";
                }
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showError(err.message || 'Failed to submit request. Please try again.');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Submit Request';
        }
    });
})();
