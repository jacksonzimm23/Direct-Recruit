// Coach Signup Request — public contact form submission

(function () {
    const form = document.getElementById('coachRequestForm');
    const submitBtn = document.getElementById('submitBtn');
    const formWrap = document.getElementById('formWrap');
    const successState = document.getElementById('successState');

    if (!form) return;

    const EDU_PATTERN = /\.edu(?:\.[a-z]{2})?$/i;

    // Live character count for notes (150 max)
    const notesInput = document.getElementById('notes');
    const notesCount = document.getElementById('notesCharCount');
    if (notesInput && notesCount) {
        notesInput.addEventListener('input', () => {
            notesCount.textContent = notesInput.value.length;
        });
    }

    // Use the same API_BASE_URL pattern as shared/api.js — works on both
    // Live Server (:5500) and the node server (:5000) without CORS issues
    function getApiBase() {
        if (typeof window.API_BASE_URL === 'string') return window.API_BASE_URL;
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') return `http://${host}:5000/api`;
        return `${window.location.origin}/api`;
    }

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
                notes: notes
            });

            // Show success state
            formWrap.style.display = 'none';
            successState.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showError(err.message || 'Failed to submit request. Please try again.');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Submit Request';
        }
    });
})();
