// Coach Profile Form JavaScript - High School Coach Version

document.addEventListener('DOMContentLoaded', async function() {
    // Load existing profile data if user is logged in
    await loadExistingProfile();
    const form = document.getElementById('coachProfileForm');
    const coachingPositionCheckboxes = document.querySelectorAll('input[name="coachingPosition"]');
    const selectedCoachingPositionsContainer = document.getElementById('selectedCoachingPositions');
    const schoolTypeInput = document.getElementById('schoolType');

    // Username availability validation
    const usernameInput = document.getElementById('username');
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
            if (usernameHint) usernameHint.style.display = 'block';
            usernameInput.style.borderColor = '';
            isUsernameAvailable = false;

            // Check for max length
            if (username.length >= 20) {
                if (usernameLengthError) {
                    usernameLengthError.style.display = 'block';
                    if (usernameHint) usernameHint.style.display = 'none';
                }
                usernameInput.style.borderColor = '#ff6b6b';
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
                            if (usernameHint) usernameHint.style.display = 'none';
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

    // Password checklist validation
    const passwordInput = document.getElementById('password');
    const checkLength = document.getElementById('checkLength');
    const checkUppercase = document.getElementById('checkUppercase');
    const checkLowercase = document.getElementById('checkLowercase');
    const checkNumber = document.getElementById('checkNumber');
    const checkSpecial = document.getElementById('checkSpecial');

    if (passwordInput && checkLength) {
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
        });
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

    // Handle checkbox changes for multi-select
    coachingPositionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            updateSelectedCoachingPositions();
        });
    });

    function updateSelectedCoachingPositions() {
        const selectedPositions = Array.from(coachingPositionCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => ({ value: cb.value, label: cb.parentElement.querySelector('span').textContent }));

        // Clear container
        selectedCoachingPositionsContainer.innerHTML = '';

        // Add pills for each selected position
        selectedPositions.forEach(position => {
            const pill = document.createElement('div');
            pill.className = 'selected-pill';
            pill.innerHTML = `
                ${position.label}
                <button type="button" onclick="removeCoachingPosition('${position.value}')">×</button>
            `;
            selectedCoachingPositionsContainer.appendChild(pill);
        });
    }

    // Remove position function (global scope)
    window.removeCoachingPosition = function(value) {
        const checkbox = document.querySelector(`input[name="coachingPosition"][value="${value}"]`);
        if (checkbox) {
            checkbox.checked = false;
            updateSelectedCoachingPositions();
        }
    };

    // Form submission handler
    form.addEventListener('submit', async function(e) {
        e.preventDefault();

        const selectedPositions = Array.from(coachingPositionCheckboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        if (selectedPositions.length === 0) {
            alert('Please select at least one coaching position');
            return false;
        }

        // Validate form
        if (!validateForm()) {
            return false;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        const isUpdating = originalText === 'Update Profile';

        // Validate username is available (only for new profiles, not updates)
        if (!isUpdating && !isUsernameAvailable) {
            usernameInput.focus();
            return false;
        }

        // Validate email is available (only for new profiles, not updates)
        if (!isUpdating && !isEmailAvailable) {
            emailInput.focus();
            return false;
        }

        // Validate password meets requirements (only for new profiles)
        if (!isUpdating && passwordInput && passwordInput.dataset.valid !== 'true') {
            alert('Please make sure your password meets all the requirements.');
            passwordInput.focus();
            return false;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = isUpdating ? 'Updating Profile...' : 'Creating Account...';

        let userCreated = false;
        try {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Only register new user if not updating
            if (!isUpdating) {
                // Validate passwords match
                if (password !== confirmPassword) {
                    alert('Passwords do not match!');
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                    return;
                }

                // Store email for verification page
                localStorage.setItem('pendingVerificationEmail', email);

                // Step 1: Register user
                await authAPI.register(email, password, 'coach');
                userCreated = true;
            }

            submitBtn.textContent = isUpdating ? 'Updating Profile...' : 'Creating Profile...';

            // Step 2: Build profile data from form
            const profileData = {
                first_name: document.getElementById('firstName').value,
                last_name: document.getElementById('lastName').value,
                username: document.getElementById('username').value,
                position_title: selectedPositions.length > 0 ? selectedPositions.join(', ') : null,
                bio: document.getElementById('teamBioLink').value || null
            };

            // High school specific data
            profileData.school_type = 'high_school';
            profileData.college_name = document.getElementById('highSchoolName').value;
            profileData.high_school = document.getElementById('highSchoolName').value;
            profileData.state = document.getElementById('hsState').value;
            profileData.college_division = 'High School';
            profileData.conference = document.getElementById('conference').value;

            // Step 3: Create or Update profile
            await profileAPI.createCoachProfile(profileData);

            // Show success message
            showSuccessMessage(isUpdating);
        } catch (error) {
            console.error('Profile error:', error);

            // If user was created but profile creation failed, show helpful error
            if (userCreated) {
                alert('Account was created but profile setup failed: ' + error.message + '\n\nPlease contact support or try logging in and completing your profile.');
            } else {
                alert(`Failed to ${isUpdating ? 'update' : 'create'} profile: ` + error.message);
            }

            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });

    // Real-time validation
    const inputs = form.querySelectorAll('input[required], select[required]');
    inputs.forEach(input => {
        input.addEventListener('blur', function() {
            validateField(this);
        });

        input.addEventListener('input', function() {
            if (this.classList.contains('error')) {
                validateField(this);
            }
        });
    });
});

// Validate individual field
function validateField(field) {
    const value = field.value.trim();
    let isValid = true;
    let errorMessage = '';

    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = 'This field is required';
    }

    if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = 'Please enter a valid email address';
        }
    }

    if (field.id === 'teamBioLink' && value) {
        try {
            new URL(value);
        } catch {
            isValid = false;
            errorMessage = 'Please enter a valid URL';
        }
    }

    if (isValid) {
        field.classList.remove('error');
        removeErrorMessage(field);
    } else {
        field.classList.add('error');
        showErrorMessage(field, errorMessage);
    }

    return isValid;
}

function validateForm() {
    const requiredFields = document.querySelectorAll('input[required], select[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!validateField(field)) {
            isValid = false;
        }
    });

    return isValid;
}

function showErrorMessage(field, message) {
    removeErrorMessage(field);
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    field.parentNode.appendChild(errorDiv);
}

function removeErrorMessage(field) {
    const existingError = field.parentNode.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
}

function showSuccessMessage(isUpdating) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';

    if (isUpdating) {
        successDiv.innerHTML = `
            <h3>✓ Coach Profile Updated Successfully!</h3>
            <p>Your changes have been saved. Redirecting to your dashboard...</p>
        `;
    } else {
        successDiv.innerHTML = `
            <h3>✓ Account Created Successfully!</h3>
            <p>Please verify your email to complete registration...</p>
        `;
    }

    const form = document.getElementById('coachProfileForm');
    form.parentNode.appendChild(successDiv);

    setTimeout(() => {
        successDiv.classList.add('show');
    }, 100);

    form.style.opacity = '0.5';
    form.style.pointerEvents = 'none';

    setTimeout(() => {
        if (isUpdating) {
            // Updates redirect to mainpage
            window.location.href = 'mainpage-coach.html';
        } else {
            // New registrations redirect to email verification
            window.location.href = 'verify-email.html';
        }
    }, 2000);
}

document.getElementById('firstName').addEventListener('input', function(e) {
    this.value = this.value.replace(/\b\w/g, l => l.toUpperCase());
});

document.getElementById('lastName').addEventListener('input', function(e) {
    this.value = this.value.replace(/\b\w/g, l => l.toUpperCase());
});

// Username lowercase enforcement
document.getElementById('username').addEventListener('input', function(e) {
    this.value = this.value.toLowerCase();
});

// High school name capitalization
const highSchoolNameInput = document.getElementById('highSchoolName');
if (highSchoolNameInput) {
    highSchoolNameInput.addEventListener('input', function(e) {
        this.value = this.value.replace(/\b\w/g, l => l.toUpperCase());
    });
}

// Load existing profile data for editing
async function loadExistingProfile() {
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.profile) {
                // Pre-fill form with existing data
                const profile = data.profile;

                document.getElementById('firstName').value = profile.first_name || '';
                document.getElementById('lastName').value = profile.last_name || '';
                document.getElementById('username').value = profile.username || '';
                document.getElementById('email').value = data.user.email || '';

                // Fill in high school data
                if (profile.college_name) {
                    document.getElementById('highSchoolName').value = profile.college_name;
                }
                if (profile.state) {
                    document.getElementById('hsState').value = profile.state;
                }
                if (profile.conference) {
                    document.getElementById('conference').value = profile.conference;
                }

                // Pre-fill position checkboxes
                if (profile.position_title) {
                    const positions = profile.position_title.split(', ');
                    const checkboxes = document.querySelectorAll('input[name="coachingPosition"]');
                    checkboxes.forEach(checkbox => {
                        if (positions.includes(checkbox.value)) {
                            checkbox.checked = true;
                        }
                    });
                }

                if (profile.bio) document.getElementById('teamBioLink').value = profile.bio;

                // Hide password fields when editing
                const passwordFields = document.querySelectorAll('.form-group:has(#password), .form-group:has(#confirmPassword)');
                passwordFields.forEach(field => field.style.display = 'none');

                // Change submit button text
                const submitBtn = document.querySelector('.btn-primary[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Update Profile';
            }
        }
    } catch (error) {
        console.log('No existing profile to load (new user)');
    }
}
