document.addEventListener('DOMContentLoaded', async function() {
    // Load existing profile data if user is logged in
    await loadExistingProfile();

    const schoolTypeInput = document.getElementById('schoolType');
    const profileForm = document.getElementById('playerProfileForm');

    // Position checkboxes
    const positionCheckboxes = document.querySelectorAll('input[name="position"]');
    const selectedPositionsContainer = document.getElementById('selectedPositions');
    let selectedPositions = [];

    // Password validation elements
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordStrengthDiv = document.getElementById('passwordStrength');
    const passwordMatchDiv = document.getElementById('passwordMatch');

    // Password strength validation
    if (passwordInput && passwordStrengthDiv) {
        passwordInput.addEventListener('input', function() {
            const password = this.value;

            if (password.length === 0) {
                passwordStrengthDiv.style.display = 'none';
                return;
            }

            passwordStrengthDiv.style.display = 'block';

            // Check password strength criteria
            const hasUpperCase = /[A-Z]/.test(password);
            const hasLowerCase = /[a-z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSpecialChar = /[!@#$%^&*]/.test(password);
            const isLongEnough = password.length >= 8;

            const criteriaMet = [hasUpperCase, hasLowerCase, hasNumber, hasSpecialChar, isLongEnough].filter(Boolean).length;

            let strengthText = '';
            let strengthClass = '';

            if (criteriaMet <= 2) {
                strengthText = 'Weak password';
                strengthClass = 'weak';
            } else if (criteriaMet <= 4) {
                strengthText = 'Medium password';
                strengthClass = 'medium';
            } else {
                strengthText = 'Strong password';
                strengthClass = 'strong';
            }

            passwordStrengthDiv.textContent = strengthText;
            passwordStrengthDiv.className = 'password-strength ' + strengthClass;
        });
    }

    // Password match validation
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

    // Username availability validation
    const usernameInput = document.getElementById('username');
    const usernameError = document.getElementById('usernameError');
    const usernameHint = document.getElementById('usernameHint');
    let usernameCheckTimeout;
    let isUsernameAvailable = false;

    if (usernameInput && usernameError) {
        usernameInput.addEventListener('input', function() {
            // Convert to lowercase automatically
            this.value = this.value.toLowerCase();
            const username = this.value.trim();

            // Clear previous timeout
            clearTimeout(usernameCheckTimeout);

            // Reset error state
            usernameError.style.display = 'none';
            usernameHint.style.display = 'block';
            usernameInput.style.borderColor = '';
            isUsernameAvailable = false;

            // Only check if username is not empty and matches pattern (lowercase only)
            if (username.length >= 3 && /^[a-z0-9_]+$/.test(username)) {
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
                    }
                }, 500);
            }
        });
    }

    // Handle position checkbox changes
    positionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                selectedPositions.push(this.value);
            } else {
                selectedPositions = selectedPositions.filter(pos => pos !== this.value);
            }
            updateSelectedPositions();
        });
    });

    // Update selected positions display
    function updateSelectedPositions() {
        selectedPositionsContainer.innerHTML = '';

        selectedPositions.forEach(position => {
            const pill = document.createElement('div');
            pill.className = 'selected-item';
            pill.innerHTML = `
                ${position}
                <button type="button" class="remove-item" data-position="${position}">×</button>
            `;
            selectedPositionsContainer.appendChild(pill);
        });

        // Add click handlers to remove buttons
        document.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', function() {
                const position = this.dataset.position;
                selectedPositions = selectedPositions.filter(pos => pos !== position);

                // Uncheck the checkbox
                const checkbox = document.querySelector(`input[name="position"][value="${position}"]`);
                if (checkbox) checkbox.checked = false;

                updateSelectedPositions();
            });
        });
    }

    // Handle form submission
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate at least one position is selected
        if (selectedPositions.length === 0) {
            alert('Please select at least one position.');
            return;
        }

        const submitBtn = profileForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        const isUpdating = originalText === 'Update Profile';

        // Validate username is available (only for new profiles, not updates)
        if (!isUpdating && !isUsernameAvailable) {
            // Just focus on the username field - don't show alert, let user see the red border and error message
            usernameInput.focus();
            return;
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

                // Step 1: Register user
                await authAPI.register(email, password, 'player');
                userCreated = true;
            }

            submitBtn.textContent = isUpdating ? 'Updating Profile...' : 'Creating Profile...';

            // Step 2: Build profile data from form
            const heightFt = parseInt(document.getElementById('heightFt').value) || 0;
            const heightIn = parseInt(document.getElementById('heightIn').value) || 0;
            // Convert height to total inches for storage
            const height = heightFt > 0 ? (heightFt * 12) + heightIn : null;

            const profileData = {
                first_name: document.getElementById('firstName').value,
                last_name: document.getElementById('lastName').value,
                username: document.getElementById('username').value,
                position: selectedPositions.length > 0 ? selectedPositions[0] : null,
                height: height,
                weight: parseInt(document.getElementById('weight').value) || null,
                hudl_profile: document.getElementById('hudlProfile').value || null,
            };

            // College specific fields
            profileData.college_name = document.getElementById('collegeName').value;
            profileData.state = document.getElementById('collegeState').value;
            profileData.graduation_year = parseInt(document.getElementById('collegeGradYear').value) || null;
            profileData.gpa = parseFloat(document.getElementById('gpa').value) || null;
            // College players have a division - this differentiates them from HS players
            profileData.college_division = document.getElementById('division').value;
            profileData.conference = document.getElementById('conference').value || null;
            profileData.number = document.getElementById('jerseyNumber').value ? parseInt(document.getElementById('jerseyNumber').value) : null;
            profileData.eligibility = document.getElementById('eligibility').value ? parseInt(document.getElementById('eligibility').value) : null;

            // Step 3: Create or Update profile
            await profileAPI.createPlayerProfile(profileData);

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
});

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

                // Handle height - convert from total inches to feet and inches
                if (profile.height) {
                    const totalInches = parseInt(profile.height);
                    const feet = Math.floor(totalInches / 12);
                    const inches = totalInches % 12;
                    document.getElementById('heightFt').value = feet;
                    document.getElementById('heightIn').value = inches;
                }

                if (profile.weight) document.getElementById('weight').value = profile.weight;
                if (profile.hudl_profile) document.getElementById('hudlProfile').value = profile.hudl_profile;

                // Handle position - check the appropriate checkbox
                if (profile.position) {
                    const positionCheckbox = document.querySelector(`input[name="position"][value="${profile.position}"]`);
                    if (positionCheckbox) {
                        positionCheckbox.checked = true;
                        // Trigger change event to update selected positions display
                        positionCheckbox.dispatchEvent(new Event('change'));
                    }
                }

                // Fill in college data
                if (profile.college_name) {
                    document.getElementById('collegeName').value = profile.college_name;
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
                if (profile.number) {
                    document.getElementById('jerseyNumber').value = profile.number;
                }
                if (profile.eligibility) {
                    document.getElementById('eligibility').value = profile.eligibility;
                }
                if (profile.graduation_year) {
                    document.getElementById('collegeGradYear').value = profile.graduation_year;
                }
                if (profile.gpa) {
                    document.getElementById('gpa').value = profile.gpa;
                }

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

function showSuccessMessage(isUpdating) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.innerHTML = `
        <h3>✓ Player Profile ${isUpdating ? 'Updated' : 'Created'} Successfully!</h3>
        <p>${isUpdating ? 'Your changes have been saved.' : 'Welcome to Direct Recruit!'} Redirecting to your dashboard...</p>
    `;

    const form = document.getElementById('playerProfileForm');
    form.parentNode.appendChild(successDiv);

    setTimeout(() => {
        successDiv.classList.add('show');
    }, 100);

    form.style.opacity = '0.5';
    form.style.pointerEvents = 'none';

    // College players always redirect to collegeplayer mainpage
    setTimeout(() => {
        window.location.href = 'mainpage-player.html';
    }, 2000);
}
