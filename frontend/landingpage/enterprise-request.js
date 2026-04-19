// Enterprise Inquiry — contact form for teams/athletic departments.
// Submits to POST /api/enterprise/request. In local dev, the backend logs the
// inquiry to the terminal (simulated "email" to jackson@directrecruit.net).

(function () {
    const form = document.getElementById('enterpriseRequestForm');
    const submitBtn = document.getElementById('submitBtn');
    const formWrap = document.getElementById('formWrap');
    const successState = document.getElementById('successState');

    if (!form) return;

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

    async function submitInquiry(payload) {
        const res = await fetch(getApiBase() + '/enterprise/request', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.error || 'Failed to submit inquiry. Please try again.');
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
        const phone = form.phone.value.trim();
        const personalEmail = form.personalEmail.value.trim();
        const notes = form.notes.value.trim();

        if (!firstName || !lastName || !school || !phone || !personalEmail) {
            showError('Please fill in all required fields.');
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personalEmail)) {
            showError('Please enter a valid personal email address.');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-label').textContent = 'Submitting...';

        try {
            await submitInquiry({
                first_name: firstName,
                last_name: lastName,
                school: school,
                phone: phone,
                personal_email: personalEmail,
                notes: notes
            });

            formWrap.style.display = 'none';
            successState.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (err) {
            showError(err.message || 'Failed to submit inquiry. Please try again.');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-label').textContent = 'Submit Inquiry';
        }
    });
})();
