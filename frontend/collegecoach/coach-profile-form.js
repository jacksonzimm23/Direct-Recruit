// Coach Profile Form JavaScript - College Coach Version

document.addEventListener('DOMContentLoaded', async function() {
    // This is a CREATE profile page - do NOT load existing profile data
    // If user is logged in and tries to create a new profile, they should start fresh
    // The loadExistingProfile function is only for EDIT profile pages
    // await loadExistingProfile();
    const form = document.getElementById('coachProfileForm');

    // Initialize school search with logo + auto-division
    const schoolSearch = initSchoolSearch({
        nameInput: '#collegeName',
        divisionSelect: '#division',
        assetBasePath: '../assets'
    });

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
                if (username.length >= 12) {
                    usernameCharCount.style.color = username.length >= 15 ? '#ff6b6b' : '#ffa500';
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
            if (username.length >= 15) {
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
                        const response = await fetch(`${API_BASE_URL}/profile/check-username/${username}`);
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
                        const response = await fetch(`${API_BASE_URL}/profile/check-email/${encodeURIComponent(email)}`);
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

    // Password match validation
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordMatchDiv = document.getElementById('passwordMatch');
    if (confirmPasswordInput && passwordMatchDiv) {
        confirmPasswordInput.addEventListener('input', function() {
            const password = passwordInput.value;
            const confirmPassword = this.value;

            if (confirmPassword.length === 0) {
                passwordMatchDiv.style.display = 'none';
                confirmPasswordInput.classList.remove('match-success', 'match-error');
                return;
            }

            passwordMatchDiv.style.display = 'block';

            if (password === confirmPassword) {
                passwordMatchDiv.textContent = 'Passwords match!';
                passwordMatchDiv.className = 'password-match match';
                confirmPasswordInput.classList.add('match-success');
                confirmPasswordInput.classList.remove('match-error');
            } else {
                passwordMatchDiv.textContent = 'Passwords do not match';
                passwordMatchDiv.className = 'password-match no-match';
                confirmPasswordInput.classList.add('match-error');
                confirmPasswordInput.classList.remove('match-success');
            }
        });

        // Also check on password input change
        passwordInput.addEventListener('input', function() {
            if (confirmPasswordInput.value.length > 0) {
                confirmPasswordInput.dispatchEvent(new Event('input'));
            }
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
            showToast('Please select at least one coaching position', 'warning');
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
            showToast('Please make sure your password meets all the requirements.', 'warning');
            passwordInput.focus();
            return false;
        }

        // Validate passwords match (only for new profiles)
        if (!isUpdating) {
            const pw = document.getElementById('password').value;
            const cpw = document.getElementById('confirmPassword').value;
            if (pw !== cpw) {
                showToast('Passwords do not match!', 'warning');
                const confirmEl = document.getElementById('confirmPassword');
                if (confirmEl) {
                    confirmEl.focus();
                    confirmEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return false;
            }
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
                bio: document.getElementById('teamBioLink')?.value || null
            };

            // College specific data
            profileData.school_type = 'college';
            profileData.team_name = document.getElementById('collegeName').value;
            profileData.state = document.getElementById('collegeState').value;
            profileData.college_division = document.getElementById('division').value;
            profileData.conference = document.getElementById('conference').value;

            if (isUpdating) {
                // Updates: create/update profile directly, no payment
                await profileAPI.createCoachProfile(profileData);
                showSuccessMessage(isUpdating);
            } else {
                // New signups: store profile data and show tier selection
                localStorage.setItem('pendingProfileData', JSON.stringify(profileData));
                submitBtn.textContent = 'Choose your plan...';
                showTierSelectionModal();
            }
        } catch (error) {
            console.error('Profile error:', error);

            // If user was created but something failed, show helpful error
            if (userCreated) {
                showToast('Account was created but setup failed: ' + error.message + '. Please try logging in to complete your profile and payment.', 'error');
            } else {
                showToast(`Failed to ${isUpdating ? 'update' : 'create'} profile: ` + error.message, 'error');
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

// College name capitalization
const collegeNameInput = document.getElementById('collegeName');
if (collegeNameInput) {
    collegeNameInput.addEventListener('input', function(e) {
        this.value = this.value.replace(/\b\w/g, l => l.toUpperCase());
    });
}

// Load existing profile data for editing
async function loadExistingProfile() {
    try {
        if (!API.isAuthenticated()) {
            return; // Not authenticated, user is creating new profile
        }

        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: 'include'
        });

        // If unauthorized, clear auth data and continue with new profile creation
        if (response.status === 401) {
            API.clearAuth();
            return;
        }

        if (response.ok) {
            const data = await response.json();
            if (data.profile) {
                // Pre-fill form with existing data
                const profile = data.profile;

                document.getElementById('firstName').value = profile.first_name || '';
                document.getElementById('lastName').value = profile.last_name || '';
                document.getElementById('username').value = profile.username || '';
                document.getElementById('email').value = data.user.email || '';

                // Fill in college data
                if (profile.team_name) {
                    document.getElementById('collegeName').value = profile.team_name;
                    if (schoolSearch) schoolSearch.preselectSchool(profile.team_name);
                }
                if (profile.state) {
                    document.getElementById('collegeState').value = profile.state;
                }
                if (profile.college_division) {
                    document.getElementById('division').value = profile.college_division;
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

                if (profile.bio && document.getElementById('teamBioLink')) document.getElementById('teamBioLink').value = profile.bio;

                // Hide password fields when editing AND remove required attribute to prevent validation errors
                const passwordFields = document.querySelectorAll('.form-group:has(#password), .form-group:has(#confirmPassword)');
                passwordFields.forEach(field => {
                    field.style.display = 'none';
                    // Remove required from hidden inputs to prevent "not focusable" error
                    const input = field.querySelector('input');
                    if (input) {
                        input.removeAttribute('required');
                    }
                });

                // Change submit button text
                const submitBtn = document.querySelector('.btn-primary[type="submit"]');
                if (submitBtn) submitBtn.textContent = 'Update Profile';
            }
        }
    } catch (error) {
        // silently ignore
    }
}

// ─── Tier Selection Modal ────────────────────────────────────────────────────
function showTierSelectionModal() {
    const overlay = document.createElement('div');
    overlay.id = 'tierModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

    overlay.innerHTML = `
        <div style="background:#0a1128;border-radius:16px;max-width:900px;width:100%;padding:40px 32px;position:relative;max-height:90vh;overflow-y:auto;">
            <button id="tierModalClose" style="position:absolute;top:16px;right:16px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:24px;cursor:pointer;">&times;</button>
            <h2 style="color:#fff;text-align:center;font-size:24px;font-weight:700;margin:0 0 8px;">Choose Your Plan</h2>
            <p style="color:rgba(255,255,255,0.45);text-align:center;font-size:14px;margin:0 0 32px;">Select a subscription tier to get started.</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
                ${tierCard('Starter', '20', [
                    'AI Recruiting Assistant',
                    'Portal Intelligence',
                    'Recruiting Board',
                    '4M AI tokens/month',
                    'Direct messaging'
                ], false)}
                ${tierCard('Pro', '50', [
                    'Everything in Starter',
                    '10M AI tokens/month (2.5x)',
                    'Saved players & portal watchlist',
                    'Custom baseline metrics',
                    'Priority support'
                ], true)}
                ${tierCard('Elite', '100', [
                    'Everything in Pro',
                    '20M AI tokens/month (5x)',
                    'Team collaboration tools',
                    'Unlimited saved players',
                    'Dedicated support'
                ], false)}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close button
    document.getElementById('tierModalClose').addEventListener('click', () => {
        overlay.remove();
        const submitBtn = document.querySelector('.btn-primary[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Coach Profile';
        }
    });

    // Tier select buttons
    overlay.querySelectorAll('[data-tier]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tier = btn.dataset.tier;
            btn.textContent = 'Redirecting...';
            btn.disabled = true;

            try {
                const { url } = await API.payments.createCheckoutSession(
                    'collegecoach',
                    tier,
                    'signup',
                    window.location.origin + '/frontend/collegecoach/payment-success.html',
                    window.location.origin + '/frontend/collegecoach/create-coach-profile.html'
                );
                window.location.href = url;
            } catch (error) {
                console.error('Checkout error:', error);
                showToast('Failed to start checkout: ' + error.message, 'error');
                btn.textContent = 'Select';
                btn.disabled = false;
            }
        });
    });
}

function tierCard(name, price, features, isPopular) {
    const borderColor = isPopular ? '#ff6b35' : 'rgba(255,255,255,0.08)';
    const bgColor = isPopular ? 'rgba(255,107,53,0.04)' : 'rgba(255,255,255,0.03)';
    const badge = isPopular ? '<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#ff6b35;color:#fff;font-size:11px;font-weight:700;padding:4px 16px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Most Popular</div>' : '';

    const featureList = features.map(f =>
        `<li style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,0.7);font-size:13px;padding:6px 0;">
            <svg viewBox="0 0 20 20" fill="#ff6b35" width="16" height="16" style="flex-shrink:0;"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            ${f}
        </li>`
    ).join('');

    return `
        <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:16px;padding:28px 20px;text-align:center;position:relative;display:flex;flex-direction:column;">
            ${badge}
            <h3 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 12px;">${name}</h3>
            <div style="margin-bottom:12px;">
                <span style="font-size:32px;font-weight:800;color:#fff;">$${price}</span>
                <span style="font-size:14px;color:rgba(255,255,255,0.4);">/month</span>
            </div>
            <ul style="list-style:none;padding:0;margin:0 0 20px;text-align:left;flex:1;">${featureList}</ul>
            <button data-tier="${name.toLowerCase()}" style="background:#ff6b35;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;width:100%;font-family:'Inter',sans-serif;">Select</button>
        </div>
    `;
}
