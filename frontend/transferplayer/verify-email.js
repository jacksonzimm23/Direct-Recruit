// Verify Email Page JavaScript
// Uses API_BASE_URL from shared/api.js

document.addEventListener('DOMContentLoaded', function() {
    const codeInputs = document.querySelectorAll('.code-input');
    const verifyForm = document.getElementById('verifyForm');
    const verifyBtn = document.getElementById('verifyBtn');
    const errorMessage = document.getElementById('errorMessage');
    const resendBtn = document.getElementById('resendBtn');
    const resendTimer = document.getElementById('resendTimer');
    const userEmailEl = document.getElementById('userEmail');

    // Get email from localStorage (set during registration)
    const pendingEmail = localStorage.getItem('pendingVerificationEmail');

    if (!pendingEmail) {
        // No pending verification, redirect to signup
        // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
        // (bare/relative targets silently no-op there). new URL(rel, location.href)
        // correctly preserves the /frontend prefix on web and its absence in-app.
        window.location.href = new URL('create-profile.html', window.location.href).href;
        return;
    }

    // Display masked email
    userEmailEl.textContent = maskEmail(pendingEmail);

    // Resend cooldown tracking
    let resendCooldown = parseInt(localStorage.getItem('resendCooldown') || '0');
    if (resendCooldown > Date.now()) {
        startResendTimer(Math.ceil((resendCooldown - Date.now()) / 1000));
    }

    // Handle code input
    codeInputs.forEach((input, index) => {
        // Focus first input on load
        if (index === 0) input.focus();

        input.addEventListener('input', function(e) {
            const value = e.target.value;

            // Only allow numbers
            if (!/^\d*$/.test(value)) {
                e.target.value = '';
                return;
            }

            // Mark as filled
            if (value) {
                input.classList.add('filled');
                // Move to next input
                if (index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                }
            } else {
                input.classList.remove('filled');
            }

            // Clear error state
            clearError();

            // Auto-submit when all filled
            if (isCodeComplete()) {
                verifyBtn.focus();
            }
        });

        input.addEventListener('keydown', function(e) {
            // Handle backspace
            if (e.key === 'Backspace' && !input.value && index > 0) {
                codeInputs[index - 1].focus();
                codeInputs[index - 1].value = '';
                codeInputs[index - 1].classList.remove('filled');
            }

            // Handle arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                e.preventDefault();
                codeInputs[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < codeInputs.length - 1) {
                e.preventDefault();
                codeInputs[index + 1].focus();
            }
        });

        // Handle paste
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

            if (pastedData.length === 6) {
                pastedData.split('').forEach((char, i) => {
                    if (codeInputs[i]) {
                        codeInputs[i].value = char;
                        codeInputs[i].classList.add('filled');
                    }
                });
                codeInputs[5].focus();
            }
        });
    });

    // Form submission
    verifyForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        if (!isCodeComplete()) {
            showError('Please enter the complete 6-digit code');
            return;
        }

        const code = getCode();

        verifyBtn.disabled = true;
        verifyBtn.classList.add('loading');
        verifyBtn.innerHTML = 'Verifying...';

        try {
            const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: pendingEmail,
                    code: code
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Success!
                showSuccess();

                // iOS Bearer fallback: verify-email auto-logs-in, so persist the token.
                if (window.API && API.setAuthToken) API.setAuthToken(data.token);

                // Clear pending verification
                localStorage.removeItem('pendingVerificationEmail');
                localStorage.removeItem('resendCooldown');

                // GTM 2026-06: transferplayer is FREE now — after verifying, go straight to
                // the player dashboard (no paywall). To re-enable the paywall, restore the
                // redirect to FE_BASE + '/shared/subscription-required.html'.
                setTimeout(() => {
                    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
                    window.location.href = FE_BASE + '/transferplayer/mainpage-player.html';
                }, 2000);
            } else {
                showError(data.error || 'Invalid verification code');
                resetCodeInputs();
            }
        } catch (error) {
            console.error('Verification error:', error);
            showError('Failed to verify. Please try again.');
            resetCodeInputs();
        }

        verifyBtn.disabled = false;
        verifyBtn.classList.remove('loading');
        verifyBtn.innerHTML = `
            Verify Email
            <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
        `;
    });

    // Resend code
    resendBtn.addEventListener('click', async function() {
        resendBtn.disabled = true;
        resendBtn.textContent = 'Sending...';

        try {
            const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: pendingEmail
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Start cooldown timer (60 seconds)
                const cooldownEnd = Date.now() + 60000;
                localStorage.setItem('resendCooldown', cooldownEnd.toString());
                startResendTimer(60);

                showError(''); // Clear any errors
                // Show success feedback
                resendBtn.textContent = 'Code Sent!';
                setTimeout(() => {
                    resendBtn.textContent = 'Resend Code';
                }, 2000);
            } else {
                showError(data.error || 'Failed to resend code');
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend Code';
            }
        } catch (error) {
            console.error('Resend error:', error);
            showError('Failed to resend code. Please try again.');
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Code';
        }
    });

    // Helper functions
    function isCodeComplete() {
        return Array.from(codeInputs).every(input => input.value.length === 1);
    }

    function getCode() {
        return Array.from(codeInputs).map(input => input.value).join('');
    }

    function showError(message) {
        errorMessage.textContent = message;
        if (message) {
            codeInputs.forEach(input => input.classList.add('error'));
            setTimeout(() => {
                codeInputs.forEach(input => input.classList.remove('error'));
            }, 500);
        }
    }

    function clearError() {
        errorMessage.textContent = '';
        codeInputs.forEach(input => input.classList.remove('error'));
    }

    function resetCodeInputs() {
        codeInputs.forEach(input => {
            input.value = '';
            input.classList.remove('filled', 'error', 'success');
        });
        codeInputs[0].focus();
    }

    function showSuccess() {
        codeInputs.forEach(input => {
            input.classList.remove('error', 'filled');
            input.classList.add('success');
        });

        document.querySelector('.verify-container').classList.add('success');
        document.querySelector('.verify-container h1').textContent = 'Email Verified!';
        document.querySelector('.verify-subtitle').textContent = 'Your account has been verified successfully.';
        document.querySelector('.verify-email').textContent = 'Redirecting to your dashboard...';

        // Hide form elements
        verifyForm.style.display = 'none';
        document.querySelector('.resend-section').style.display = 'none';
        document.querySelector('.help-text').style.display = 'none';

        // Update icon to checkmark
        document.querySelector('.verify-icon').innerHTML = `
            <svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
            </svg>
        `;
    }

    function startResendTimer(seconds) {
        resendBtn.disabled = true;

        const updateTimer = () => {
            if (seconds > 0) {
                resendTimer.textContent = `Resend available in ${seconds}s`;
                seconds--;
                setTimeout(updateTimer, 1000);
            } else {
                resendTimer.textContent = '';
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend Code';
                localStorage.removeItem('resendCooldown');
            }
        };

        updateTimer();
    }

    function maskEmail(email) {
        const [local, domain] = email.split('@');
        if (local.length <= 2) {
            return `${local[0]}***@${domain}`;
        }
        return `${local[0]}${local[1]}***@${domain}`;
    }
});
