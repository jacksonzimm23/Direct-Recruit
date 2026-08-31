// Other User Profile Form JavaScript

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('otherProfileForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordMatch = document.getElementById('passwordMatch');

    // Password validation checklist elements
    const checkLength = document.getElementById('checkLength');
    const checkUppercase = document.getElementById('checkUppercase');
    const checkLowercase = document.getElementById('checkLowercase');
    const checkNumber = document.getElementById('checkNumber');
    const checkSpecial = document.getElementById('checkSpecial');

    // Email availability validation
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('emailError');
    const emailHint = document.getElementById('emailHint');
    let emailCheckTimeout;
    // Availability is tri-state ('available' | 'taken' | 'unknown'). 'unknown'
    // means the server could not answer (rate limited, offline) and MUST let the
    // user through — the server re-checks at save time. Treating 'unknown' as
    // 'taken' is the bug that told testers every input was already in use.
    let emailStatus = 'unknown';
    const emailSeq = createSequencer();

    function applyEmailStatus(status) {
        emailStatus = status;
        if (status === 'taken') {
            emailError.style.display = 'block';
            if (emailHint) emailHint.style.display = 'none';
            emailInput.classList.add('input-error');
            emailInput.classList.remove('input-success');
        } else if (status === 'available') {
            emailError.style.display = 'none';
            if (emailHint) emailHint.style.display = 'block';
            emailInput.classList.add('input-success');
            emailInput.classList.remove('input-error');
        } else {
            emailError.style.display = 'none';
            if (emailHint) emailHint.style.display = 'block';
            emailInput.classList.remove('input-error', 'input-success');
        }
    }

    // Runs the check immediately, bypassing the debounce. Used on submit so a
    // user who clicks before the 500ms timer fires still gets a real answer.
    async function resolveEmailNow() {
        clearTimeout(emailCheckTimeout);
        const email = emailInput ? emailInput.value.trim() : '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) return 'unknown';
        const token = emailSeq.next();
        const status = await checkAvailability('email', email);
        if (!emailSeq.isCurrent(token)) return emailStatus;
        applyEmailStatus(status);
        return status;
    }

    if (emailInput && emailError) {
        emailInput.addEventListener('input', function() {
            const email = this.value.trim();

            // Clear previous timeout
            clearTimeout(emailCheckTimeout);

            // Reset error state
            applyEmailStatus('unknown');

            // Only check if email is valid format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email.length > 0 && emailRegex.test(email)) {
                // Debounce API call by 500ms
                const token = emailSeq.next();
                emailCheckTimeout = setTimeout(async () => {
                    const status = await checkAvailability('email', email);
                    if (!emailSeq.isCurrent(token)) return;
                    if (emailInput.value.trim() !== email) return;
                    applyEmailStatus(status);
                }, 500);
            }
        });
    }

    // Username availability validation.
    // Tri-state, same contract as the email check above: 'unknown' never blocks.
    const usernameError = document.getElementById('usernameError');
    const usernameLengthError = document.getElementById('usernameLengthError');
    const usernameHint = document.getElementById('usernameHint');
    // First/last name + subheader character counters (same treatment as the username
    // counter below). Thresholds are derived from each input's own maxlength so fields
    // with different caps (20 for names, 30 for subheader) warn at the same proportion.
    [['firstName', 'firstNameCharCount'], ['lastName', 'lastNameCharCount'], ['subheader', 'subheaderCharCount']].forEach(function(pair) {
        const nameInput = document.getElementById(pair[0]);
        const nameCount = document.getElementById(pair[1]);
        if (!nameInput || !nameCount) return;
        const max = nameInput.maxLength > 0 ? nameInput.maxLength : 20;
        const warnAt = Math.ceil(max * 0.8);
        const updateNameCount = function() {
            const len = nameInput.value.length;
            nameCount.textContent = len;
            if (len >= warnAt) {
                nameCount.style.color = len >= max ? '#ff6b6b' : '#ffa500';
            } else {
                nameCount.style.color = '';
            }
        };
        nameInput.addEventListener('input', updateNameCount);
        updateNameCount();
    });

    const usernameCharCount = document.getElementById('usernameCharCount');
    let usernameCheckTimeout;
    let usernameStatus = 'unknown';
    const usernameSeq = createSequencer();

    function applyUsernameStatus(status) {
        usernameStatus = status;
        if (status === 'taken') {
            usernameError.style.display = 'block';
            usernameHint.style.display = 'none';
            usernameInput.style.borderColor = '#ff6b6b';
        } else if (status === 'available') {
            usernameError.style.display = 'none';
            usernameHint.style.display = 'block';
            usernameInput.style.borderColor = '#4caf50';
        } else {
            usernameError.style.display = 'none';
            usernameHint.style.display = 'block';
            usernameInput.style.borderColor = '';
        }
    }

    // Resolve the username immediately, bypassing the debounce, for use on submit.
    async function resolveUsernameNow() {
        clearTimeout(usernameCheckTimeout);
        const username = usernameInput ? usernameInput.value.trim() : '';
        if (!/^[a-z0-9_]{3,15}$/.test(username)) return 'unknown';
        const token = usernameSeq.next();
        const status = await checkAvailability('username', username);
        if (!usernameSeq.isCurrent(token)) return usernameStatus;
        applyUsernameStatus(status);
        return status;
    }

    if (usernameInput && usernameError) {
        usernameInput.addEventListener('input', function() {
            // Convert to lowercase and remove invalid characters
            this.value = this.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
            const username = this.value.trim();

            // Update character count
            if (usernameCharCount) {
                usernameCharCount.textContent = username.length;
                // Show warning color when approaching limit
                if (username.length >= 12) {
                    usernameCharCount.style.color = username.length >= 15 ? '#ff6b6b' : '#ffa500';
                } else {
                    usernameCharCount.style.color = '';
                }
            }

            // Clear previous timeout
            clearTimeout(usernameCheckTimeout);

            // Reset error state
            if (usernameLengthError) usernameLengthError.style.display = 'none';
            applyUsernameStatus('unknown');

            // Check for max length. (Dropped a dead `if (username.length === 20)`
            // branch here — unreachable, the input carries maxlength="15".)
            if (username.length >= 15) {
                if (usernameLengthError) {
                    usernameLengthError.style.display = 'block';
                    usernameHint.style.display = 'none';
                }
                usernameInput.style.borderColor = '#ff6b6b';
            }

            // Only check if username is not empty and matches pattern (lowercase only)
            if (username.length >= 3 && username.length <= 15 && /^[a-z0-9_]+$/.test(username)) {
                // Debounce API call by 500ms
                const token = usernameSeq.next();
                usernameCheckTimeout = setTimeout(async () => {
                    const status = await checkAvailability('username', username);
                    // Discard a stale response: clearTimeout cannot cancel an
                    // in-flight request, so an older prefix could otherwise
                    // overwrite the verdict for what is currently typed.
                    if (!usernameSeq.isCurrent(token)) return;
                    if (usernameInput.value.trim() !== username) return;
                    applyUsernameStatus(status);
                }, 500);
            }
        });
    }

    // Password validation with checklist
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            const password = this.value;

            // Check each criteria and update checklist
            const hasLength = password.length >= 8;
            const hasUpperCase = /[A-Z]/.test(password);
            const hasLowerCase = /[a-z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSpecialChar = /[!@#$%^&*]/.test(password);

            // Update checklist items
            updateChecklistItem(checkLength, hasLength);
            updateChecklistItem(checkUppercase, hasUpperCase);
            updateChecklistItem(checkLowercase, hasLowerCase);
            updateChecklistItem(checkNumber, hasNumber);
            updateChecklistItem(checkSpecial, hasSpecialChar);

            // Store password validity for form submission
            const allValid = hasLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
            passwordInput.dataset.valid = allValid;

            // Update confirm password match if it has a value
            if (confirmPasswordInput.value) {
                updatePasswordMatch();
            }
        });
    }

    // Confirm password validation
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', updatePasswordMatch);

        // Also check on password input change
        if (passwordInput) {
            passwordInput.addEventListener('input', function() {
                if (confirmPasswordInput.value.length > 0) {
                    updatePasswordMatch();
                }
            });
        }
    }

    function updateChecklistItem(element, isValid) {
        if (!element) return;

        const checkIcon = element.querySelector('.check-icon');
        if (isValid) {
            element.classList.add('valid');
            checkIcon.innerHTML = '&#10003;'; // Checkmark
        } else {
            element.classList.remove('valid');
            checkIcon.innerHTML = '&#10005;'; // X mark
        }
    }

    function updatePasswordMatch() {
        if (!passwordMatch || !passwordInput || !confirmPasswordInput) return;

        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (confirmPassword === '') {
            passwordMatch.style.display = 'none';
            confirmPasswordInput.classList.remove('match-success', 'match-error');
            return;
        }

        passwordMatch.style.display = 'block';

        if (password === confirmPassword) {
            passwordMatch.textContent = 'Passwords match!';
            passwordMatch.className = 'password-match match';
            confirmPasswordInput.classList.add('match-success');
            confirmPasswordInput.classList.remove('match-error');
            confirmPasswordInput.setCustomValidity('');
        } else {
            passwordMatch.textContent = 'Passwords do not match';
            passwordMatch.className = 'password-match no-match';
            confirmPasswordInput.classList.add('match-error');
            confirmPasswordInput.classList.remove('match-success');
            confirmPasswordInput.setCustomValidity('Passwords do not match');
        }
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', async function(e) {
            e.preventDefault();

            const submitBtn = form.querySelector('button[type="submit"]');
            const originalText = submitBtn.textContent;

            // Validate username is available.
            //
            // Resolve the check NOW rather than reading a possibly-stale flag. If
            // the user clicked submit inside the 500ms debounce, the old code
            // silently focused the field and returned, so nothing appeared to
            // happen.
            //
            // Only a definite 'taken' blocks. 'unknown' (rate limited, offline)
            // goes through — the server re-checks and returns 409 on a real
            // collision.
            const usernameVerdict = usernameStatus === 'taken'
                ? 'taken'
                : await resolveUsernameNow();
            if (usernameVerdict === 'taken') {
                usernameInput.focus();
                showToast('That username is already taken. Please choose another.', 'error');
                return;
            }

            // Validate email is available
            const emailVerdict = emailStatus === 'taken'
                ? 'taken'
                : await resolveEmailNow();
            if (emailVerdict === 'taken') {
                emailInput.focus();
                showToast('That email is already in use. Please sign in instead.', 'error');
                return;
            }

            // Validate password meets requirements
            if (passwordInput.dataset.valid !== 'true') {
                showToast('Please make sure your password meets all the requirements.', 'warning');
                passwordInput.focus();
                return;
            }

            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            // Validate passwords match
            if (password !== confirmPassword) {
                showToast('Passwords do not match!', 'warning');
                if (confirmPasswordInput) {
                    confirmPasswordInput.dispatchEvent(new Event('input'));
                    confirmPasswordInput.focus();
                    confirmPasswordInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            let userCreated = false;
            try {
                const email = emailInput.value;

                // Age gate: block under-13 before creating the account. Renders a
                // red "ages 13+" message under the DOB field and aborts on failure.
                const dob = document.getElementById('dateOfBirth')?.value || null;
                if (!checkSignupAge(dob)) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    return;
                }

                // Store email for verification page
                localStorage.setItem('pendingVerificationEmail', email);

                // Step 1: Register user with Cognito (DOB + ToS acceptance recorded server-side)
                await authAPI.register(email, password, 'other', dob, true);
                userCreated = true;

                submitBtn.textContent = 'Creating Profile...';

                // Step 2: Build profile data from form
                const profileData = {
                    first_name: document.getElementById('firstName').value,
                    last_name: document.getElementById('lastName').value,
                    username: usernameInput.value,
                    date_of_birth: document.getElementById('dateOfBirth')?.value || null,
                    // Optional. Sent as null rather than '' so the column stays NULL
                    // when it's left blank, matching what the edit modal writes.
                    subheader: document.getElementById('subheader')?.value.trim() || null
                };

                // Step 3: Create profile
                await profileAPI.createOtherProfile(profileData);

                // Show success message
                showSuccessMessage();
            } catch (error) {
                console.error('Profile error:', error);

                // 409 = the server's authoritative uniqueness check rejected the
                // username. This is the backstop for the advisory client-side
                // check, which now lets 'unknown' through rather than guessing
                // "taken".
                if (error.status === 409) {
                    applyUsernameStatus('taken');
                    usernameInput.focus();
                    showToast(error.message || 'That username is already taken. Please choose another.', 'error');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    return;
                }

                // If user was created but profile creation failed, show helpful error
                if (userCreated) {
                    showToast('Account was created but profile setup failed: ' + error.message + '. Please contact support or try logging in and completing your profile.', 'error');
                } else {
                    showToast('Failed to create profile: ' + error.message, 'error');
                }

                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }
        });
    }
});

function showSuccessMessage() {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <h3>Account Created Successfully!</h3>
        <p>Please verify your email to complete registration...</p>
    `;

    const form = document.getElementById('otherProfileForm');
    form.parentNode.appendChild(successDiv);

    setTimeout(() => {
        successDiv.classList.add('show');
    }, 100);

    form.style.opacity = '0.5';
    form.style.pointerEvents = 'none';

    setTimeout(() => {
        // Redirect to email verification page
        // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
        // (bare/relative targets silently no-op there). new URL(rel, location.href)
        // correctly preserves the /frontend prefix on web and its absence in-app.
        window.location.href = new URL('verify-email.html', window.location.href).href;
    }, 2000);
}

// Prevent form submission on Enter key except for textareas
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const form = document.getElementById('otherProfileForm');
        if (form && e.target.form === form) {
            e.preventDefault();
        }
    }
});
