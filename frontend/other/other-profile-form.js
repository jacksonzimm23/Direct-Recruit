// Other User Profile Form JavaScript

document.addEventListener('DOMContentLoaded', function() {
    console.log('[other-profile-form.js] DOMContentLoaded fired');
    console.log('[other-profile-form.js] auth_token in localStorage:', localStorage.getItem('auth_token') ? 'EXISTS' : 'NONE');
    const form = document.getElementById('otherProfileForm');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordMatch = document.getElementById('passwordMatch');
    const isNilBrandCheckbox = document.getElementById('isNilBrand');
    const companyNameGroup = document.getElementById('companyNameGroup');
    const companyNameInput = document.getElementById('companyName');

    // Password validation checklist elements
    const checkLength = document.getElementById('checkLength');
    const checkUppercase = document.getElementById('checkUppercase');
    const checkLowercase = document.getElementById('checkLowercase');
    const checkNumber = document.getElementById('checkNumber');
    const checkSpecial = document.getElementById('checkSpecial');

    // NIL Brand checkbox toggle
    if (isNilBrandCheckbox && companyNameGroup && companyNameInput) {
        isNilBrandCheckbox.addEventListener('change', function() {
            if (this.checked) {
                companyNameGroup.style.display = 'block';
                companyNameInput.required = true;
            } else {
                companyNameGroup.style.display = 'none';
                companyNameInput.required = false;
                companyNameInput.value = '';
            }
        });
    }

    // Email availability validation
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('emailError');
    const emailHint = document.getElementById('emailHint');
    let emailCheckTimeout;
    let isEmailAvailable = true;

    if (emailInput && emailError) {
        emailInput.addEventListener('input', function() {
            const email = this.value.trim();

            // Clear previous timeout
            clearTimeout(emailCheckTimeout);

            // Reset error state
            emailError.style.display = 'none';
            if (emailHint) emailHint.style.display = 'block';
            emailInput.classList.remove('input-error', 'input-success');
            isEmailAvailable = true;

            // Only check if email is valid format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email.length > 0 && emailRegex.test(email)) {
                // Debounce API call by 500ms
                emailCheckTimeout = setTimeout(async () => {
                    try {
                        const response = await fetch(`http://localhost:5000/api/profile/check-email/${encodeURIComponent(email)}`);
                        const data = await response.json();

                        if (!data.available) {
                            // Email is taken
                            emailError.style.display = 'block';
                            if (emailHint) emailHint.style.display = 'none';
                            emailInput.classList.add('input-error');
                            emailInput.classList.remove('input-success');
                            isEmailAvailable = false;
                        } else {
                            // Email is available
                            emailInput.classList.add('input-success');
                            emailInput.classList.remove('input-error');
                            isEmailAvailable = true;
                        }
                    } catch (error) {
                        console.error('Error checking email:', error);
                        // Assume available if check fails
                        isEmailAvailable = true;
                    }
                }, 500);
            }
        });
    }

    // Username availability validation
    const usernameError = document.getElementById('usernameError');
    const usernameLengthError = document.getElementById('usernameLengthError');
    const usernameHint = document.getElementById('usernameHint');
    const usernameCharCount = document.getElementById('usernameCharCount');
    let usernameCheckTimeout;
    let isUsernameAvailable = false;

    if (usernameInput && usernameError) {
        usernameInput.addEventListener('input', function() {
            // Convert to lowercase and remove invalid characters
            this.value = this.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
            const username = this.value.trim();

            // Update character count
            if (usernameCharCount) {
                usernameCharCount.textContent = username.length;
                // Show warning color when approaching limit
                if (username.length >= 18) {
                    usernameCharCount.style.color = username.length >= 20 ? '#ff6b6b' : '#ffa500';
                } else {
                    usernameCharCount.style.color = '';
                }
            }

            // Clear previous timeout
            clearTimeout(usernameCheckTimeout);

            // Reset error state
            usernameError.style.display = 'none';
            if (usernameLengthError) usernameLengthError.style.display = 'none';
            usernameHint.style.display = 'block';
            usernameInput.style.borderColor = '';
            isUsernameAvailable = false;

            // Check for max length
            if (username.length >= 20) {
                if (usernameLengthError) {
                    usernameLengthError.style.display = 'block';
                    usernameHint.style.display = 'none';
                }
                usernameInput.style.borderColor = '#ff6b6b';
                // Still allow if exactly 20, just show warning
                if (username.length === 20) {
                    isUsernameAvailable = false; // Will be set by availability check
                }
            }

            // Only check if username is not empty and matches pattern (lowercase only)
            if (username.length >= 3 && username.length <= 20 && /^[a-z0-9_]+$/.test(username)) {
                // Debounce API call by 500ms
                usernameCheckTimeout = setTimeout(async () => {
                    try {
                        const response = await fetch(`http://localhost:5000/api/profile/check-username/${username}`);
                        const data = await response.json();

                        if (!data.available) {
                            // Username is taken
                            usernameError.style.display = 'block';
                            usernameHint.style.display = 'none';
                            usernameInput.style.borderColor = '#ff6b6b';
                            isUsernameAvailable = false;
                        } else {
                            // Username is available
                            usernameInput.style.borderColor = '#4caf50';
                            isUsernameAvailable = true;
                        }
                    } catch (error) {
                        console.error('Error checking username:', error);
                        // On error, assume available to let user proceed
                        isUsernameAvailable = true;
                    }
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

            // Validate username is available
            if (!isUsernameAvailable) {
                usernameInput.focus();
                return;
            }

            // Validate email is available
            if (!isEmailAvailable) {
                emailInput.focus();
                return;
            }

            // Validate password meets requirements
            if (passwordInput.dataset.valid !== 'true') {
                alert('Please make sure your password meets all the requirements.');
                passwordInput.focus();
                return;
            }

            const password = passwordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            // Validate passwords match
            if (password !== confirmPassword) {
                alert('Passwords do not match!');
                return;
            }

            // Validate company name if NIL Brand is checked
            if (isNilBrandCheckbox.checked && !companyNameInput.value.trim()) {
                alert('Please enter your company name.');
                companyNameInput.focus();
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            let userCreated = false;
            try {
                const email = emailInput.value;

                // Store email for verification page
                localStorage.setItem('pendingVerificationEmail', email);

                // Step 1: Register user with Cognito
                await authAPI.register(email, password, 'other');
                userCreated = true;

                submitBtn.textContent = 'Creating Profile...';

                // Step 2: Build profile data from form
                const profileData = {
                    first_name: document.getElementById('firstName').value,
                    last_name: document.getElementById('lastName').value,
                    username: usernameInput.value,
                    is_nil_brand: isNilBrandCheckbox.checked,
                    company_name: isNilBrandCheckbox.checked ? companyNameInput.value : null
                };

                // Step 3: Create profile
                await profileAPI.createOtherProfile(profileData);

                // Show success message
                showSuccessMessage();
            } catch (error) {
                console.error('Profile error:', error);

                // If user was created but profile creation failed, show helpful error
                if (userCreated) {
                    alert('Account was created but profile setup failed: ' + error.message + '\n\nPlease contact support or try logging in and completing your profile.');
                } else {
                    alert('Failed to create profile: ' + error.message);
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
        window.location.href = 'verify-email.html';
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
