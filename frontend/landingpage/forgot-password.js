// Forgot Password Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const step1 = document.getElementById('step1');
    const step2 = document.getElementById('step2');
    const step3 = document.getElementById('step3');

    const emailForm = document.getElementById('emailForm');
    const resetForm = document.getElementById('resetForm');
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('emailError');
    const sendCodeBtn = document.getElementById('sendCodeBtn');

    const codeInputs = document.querySelectorAll('.code-input');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const resetError = document.getElementById('resetError');
    const resetBtn = document.getElementById('resetBtn');
    const userEmailEl = document.getElementById('userEmail');

    const resendBtn = document.getElementById('resendBtn');
    const resendTimer = document.getElementById('resendTimer');
    const backToStep1 = document.getElementById('backToStep1');

    // Password checklist elements
    const checkLength = document.getElementById('checkLength');
    const checkUppercase = document.getElementById('checkUppercase');
    const checkLowercase = document.getElementById('checkLowercase');
    const checkNumber = document.getElementById('checkNumber');
    const checkSpecial = document.getElementById('checkSpecial');
    const passwordMatch = document.getElementById('passwordMatch');

    let userEmail = '';

    // Step 1: Send reset code
    emailForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        const email = emailInput.value.trim();
        if (!email) {
            showEmailError('Please enter your email address');
            return;
        }

        sendCodeBtn.disabled = true;
        sendCodeBtn.innerHTML = 'Sending...';

        try {
            const response = await fetch('http://localhost:5000/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            // Check for rate limit error
            if (response.status === 429) {
                showEmailError(data.error || 'Too many requests. Please wait before trying again.');
                sendCodeBtn.disabled = false;
                sendCodeBtn.innerHTML = `
                    Send Reset Code
                    <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                        <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
                    </svg>
                `;
                return;
            }

            // Always proceed to step 2 (we don't reveal if email exists)
            userEmail = email;
            userEmailEl.textContent = maskEmail(email);

            // Start resend cooldown
            startResendTimer(60);

            // Show step 2
            step1.style.display = 'none';
            step2.style.display = 'block';

            // Focus first code input
            setTimeout(() => codeInputs[0].focus(), 100);

        } catch (error) {
            console.error('Forgot password error:', error);
            showEmailError('Something went wrong. Please try again.');
        }

        sendCodeBtn.disabled = false;
        sendCodeBtn.innerHTML = `
            Send Reset Code
            <svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/>
            </svg>
        `;
    });

    // Code input handling
    codeInputs.forEach((input, index) => {
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
            clearResetError();
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

    // Password validation
    newPasswordInput.addEventListener('input', function() {
        const password = this.value;

        // Check each criteria
        const hasLength = password.length >= 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumber = /[0-9]/.test(password);
        const hasSpecialChar = /[!@#$%^&*]/.test(password);

        // Update checklist
        updateChecklistItem(checkLength, hasLength);
        updateChecklistItem(checkUppercase, hasUpperCase);
        updateChecklistItem(checkLowercase, hasLowerCase);
        updateChecklistItem(checkNumber, hasNumber);
        updateChecklistItem(checkSpecial, hasSpecialChar);

        // Store validity
        const allValid = hasLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
        newPasswordInput.dataset.valid = allValid;

        // Check password match if confirm has value
        if (confirmPasswordInput.value) {
            checkPasswordMatch();
        }
    });

    confirmPasswordInput.addEventListener('input', checkPasswordMatch);

    function checkPasswordMatch() {
        const password = newPasswordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (!confirmPassword) {
            passwordMatch.style.display = 'none';
            return;
        }

        passwordMatch.style.display = 'block';

        if (password === confirmPassword) {
            passwordMatch.textContent = 'Passwords match!';
            passwordMatch.className = 'password-match match';
        } else {
            passwordMatch.textContent = 'Passwords do not match';
            passwordMatch.className = 'password-match no-match';
        }
    }

    function updateChecklistItem(element, isValid) {
        if (!element) return;
        const icon = element.querySelector('.check-icon');
        if (isValid) {
            element.classList.add('valid');
            icon.innerHTML = '&#10003;'; // Checkmark
        } else {
            element.classList.remove('valid');
            icon.innerHTML = '&#10005;'; // X mark
        }
    }

    // Step 2: Reset password
    resetForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate code
        if (!isCodeComplete()) {
            showResetError('Please enter the complete 6-digit code');
            return;
        }

        // Validate password
        if (newPasswordInput.dataset.valid !== 'true') {
            showResetError('Please make sure your password meets all requirements');
            return;
        }

        // Validate password match
        if (newPasswordInput.value !== confirmPasswordInput.value) {
            showResetError('Passwords do not match');
            return;
        }

        const code = getCode();
        const newPassword = newPasswordInput.value;

        resetBtn.disabled = true;
        resetBtn.innerHTML = 'Resetting...';

        try {
            const response = await fetch('http://localhost:5000/api/auth/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    email: userEmail,
                    code: code,
                    newPassword: newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Success! Show step 3
                step2.style.display = 'none';
                step3.style.display = 'block';

                // Redirect to sign in after delay
                setTimeout(() => {
                    window.location.href = 'signin.html';
                }, 2500);
            } else {
                showResetError(data.error || 'Failed to reset password');
                // Only reset code inputs if the code was invalid, not for password errors
                if (data.error && (data.error.includes('Invalid reset code') || data.error.includes('expired'))) {
                    resetCodeInputs();
                }
            }
        } catch (error) {
            console.error('Reset password error:', error);
            showResetError('Something went wrong. Please try again.');
        }

        resetBtn.disabled = false;
        resetBtn.innerHTML = `
            Reset Password
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
            const response = await fetch('http://localhost:5000/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: userEmail })
            });

            const data = await response.json();

            // Check for rate limit error
            if (response.status === 429) {
                showResetError(data.error || 'Too many requests. Please wait before trying again.');
                resendBtn.disabled = false;
                resendBtn.textContent = 'Resend Code';
                return;
            }

            // Start cooldown timer (60 seconds)
            startResendTimer(60);

            // Show success feedback
            resendBtn.textContent = 'Code Sent!';
            setTimeout(() => {
                resendBtn.textContent = 'Resend Code';
            }, 2000);

        } catch (error) {
            console.error('Resend error:', error);
            showResetError('Failed to resend code. Please try again.');
            resendBtn.disabled = false;
            resendBtn.textContent = 'Resend Code';
        }
    });

    // Back to step 1
    backToStep1.addEventListener('click', function(e) {
        e.preventDefault();
        step2.style.display = 'none';
        step1.style.display = 'block';
        resetCodeInputs();
        newPasswordInput.value = '';
        confirmPasswordInput.value = '';
        passwordMatch.style.display = 'none';

        // Reset checklist
        [checkLength, checkUppercase, checkLowercase, checkNumber, checkSpecial].forEach(item => {
            if (item) {
                item.classList.remove('valid');
                item.querySelector('.check-icon').innerHTML = '&#10005;';
            }
        });
    });

    // Helper functions
    function isCodeComplete() {
        return Array.from(codeInputs).every(input => input.value.length === 1);
    }

    function getCode() {
        return Array.from(codeInputs).map(input => input.value).join('');
    }

    function resetCodeInputs() {
        codeInputs.forEach(input => {
            input.value = '';
            input.classList.remove('filled', 'error');
        });
        codeInputs[0].focus();
    }

    function showEmailError(message) {
        emailError.textContent = message;
    }

    function showResetError(message) {
        resetError.textContent = message;
        if (message) {
            codeInputs.forEach(input => input.classList.add('error'));
            setTimeout(() => {
                codeInputs.forEach(input => input.classList.remove('error'));
            }, 500);
        }
    }

    function clearResetError() {
        resetError.textContent = '';
        codeInputs.forEach(input => input.classList.remove('error'));
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
