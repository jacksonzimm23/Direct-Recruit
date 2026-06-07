document.addEventListener('DOMContentLoaded', async function() {
    // This is a CREATE profile page - do NOT load existing profile data
    // If user is logged in and tries to create a new profile, they should start fresh
    // The loadExistingProfile function is only for EDIT profile pages
    // await loadExistingProfile();

    const schoolTypeInput = document.getElementById('schoolType');
    const profileForm = document.getElementById('playerProfileForm');

    // Initialize school search with logo + auto-division
    const schoolSearch = initSchoolSearch({
        nameInput: '#collegeName',
        divisionSelect: '#division',
        assetBasePath: '../assets'
    });

    // Position checkboxes
    const positionCheckboxes = document.querySelectorAll('input[name="position"]');
    const selectedPositionsContainer = document.getElementById('selectedPositions');
    let selectedPositions = [];

    // Password validation elements
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const passwordStrengthDiv = document.getElementById('passwordStrength');
    const passwordMatchDiv = document.getElementById('passwordMatch');

    // Password checklist validation
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
            usernameHint.style.display = 'block';
            usernameInput.style.borderColor = '';
            isUsernameAvailable = false;

            // Check for max length
            if (username.length >= 15) {
                if (usernameLengthError) {
                    usernameLengthError.style.display = 'block';
                    usernameHint.style.display = 'none';
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

    // PFF Grade — yes/no toggle reveals the numeric input
    document.querySelectorAll('input[name="has_pff_grade"]').forEach(radio => {
        radio.addEventListener('change', function () {
            const show = this.value === 'yes';
            const block = document.getElementById('pffGradeBlock');
            if (block) block.style.display = show ? '' : 'none';
            if (!show) {
                const input = document.getElementById('pffGrade');
                if (input) input.value = '';
            }
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

    // ── Recruiting Fit (AI Fit-Matching, Plan 2) ──
    let majorPicker = null, levelsPicker = null, regionsPicker = null;
    if (typeof initMatchMultiSelect === 'function' && typeof MATCH_CONSTANTS !== 'undefined') {
        majorPicker = initMatchMultiSelect({
            container: '#majorContainer', chips: '#selectedMajors',
            groups: MATCH_CONSTANTS.MAJOR_GROUPS, max: 3,
            capHintEl: '#majorCapHint', name: 'major'
        });
        levelsPicker = initMatchMultiSelect({
            container: '#levelsContainer', chips: '#selectedLevels',
            options: MATCH_CONSTANTS.LEVELS, name: 'levels_open'
        });
        regionsPicker = initMatchMultiSelect({
            container: '#regionsContainer', chips: '#selectedRegions',
            options: MATCH_CONSTANTS.REGIONS, name: 'preferred_regions'
        });
    }

    // AP/IB count reveal
    document.querySelectorAll('input[name="has_ap_ib"]').forEach(radio => {
        radio.addEventListener('change', function () {
            const show = this.value === 'yes';
            const grp = document.getElementById('apIbCountGroup');
            if (grp) grp.style.display = show ? '' : 'none';
            if (!show) { const c = document.getElementById('apIbCount'); if (c) c.value = ''; }
        });
    });

    // Importance sliders — live value display
    [['impPlayingTime', 'impPlayingTimeVal'], ['impCloseToHome', 'impCloseToHomeVal'],
     ['impAcademics', 'impAcademicsVal'], ['impCompetition', 'impCompetitionVal']].forEach(([sid, vid]) => {
        const slider = document.getElementById(sid), out = document.getElementById(vid);
        if (slider && out) slider.addEventListener('input', () => { out.textContent = slider.value; });
    });

    // "What I'm looking for" char counter
    const lookingFor = document.getElementById('lookingFor');
    const lookingForCount = document.getElementById('lookingForCount');
    if (lookingFor && lookingForCount) {
        lookingFor.addEventListener('input', () => { lookingForCount.textContent = lookingFor.value.length; });
    }

    // Handle form submission
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // Validate at least one position is selected
        if (selectedPositions.length === 0) {
            showToast('Please select at least one position.', 'warning');
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

        // Validate email is available (only for new profiles, not updates)
        if (!isUpdating && !isEmailAvailable) {
            emailInput.focus();
            return;
        }

        // Validate password meets requirements (only for new profiles)
        if (!isUpdating && passwordInput.dataset.valid !== 'true') {
            showToast('Please make sure your password meets all the requirements.', 'warning');
            passwordInput.focus();
            return;
        }

        // Validate passwords match (only for new profiles)
        if (!isUpdating) {
            const pw = document.getElementById('password').value;
            const cpw = document.getElementById('confirmPassword').value;
            if (pw !== cpw) {
                showToast('Passwords do not match!', 'warning');
                if (confirmPasswordInput) {
                    confirmPasswordInput.dispatchEvent(new Event('input'));
                    confirmPasswordInput.focus();
                    confirmPasswordInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                return;
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
                position: selectedPositions.length > 0 ? selectedPositions.join('/') : null,
                height: height,
                weight: parseInt(document.getElementById('weight').value) || null,
                hudl_profile: document.getElementById('hudlProfile')?.value || null,
            };

            // College specific fields - save college name to team_name column
            profileData.team_name = document.getElementById('collegeName').value;
            profileData.state = document.getElementById('collegeState').value;
            profileData.graduation_year = parseInt(document.getElementById('collegeGradYear').value) || null;
            profileData.gpa = parseFloat(document.getElementById('gpa').value) || null;
            // College players have a division - this differentiates them from HS players
            profileData.college_division = document.getElementById('division').value;
            profileData.conference = document.getElementById('conference').value || null;
            profileData.number = document.getElementById('jerseyNumber').value ? parseInt(document.getElementById('jerseyNumber').value) : null;
            profileData.eligibility = document.getElementById('eligibility').value ? parseInt(document.getElementById('eligibility').value) : null;

            // PFF Grade — only included when user selected "Yes". NULL = no grade reported.
            const hasPffEl = document.querySelector('input[name="has_pff_grade"]:checked');
            const hasPff = hasPffEl && hasPffEl.value === 'yes';
            profileData.pff_grade = hasPff
                ? (parseFloat(document.getElementById('pffGrade').value) || null)
                : null;

            // ── Recruiting Fit fields (AI Fit-Matching, Plan 2) ──
            const radioVal = (name) => {
                const el = document.querySelector(`input[name="${name}"]:checked`);
                return el ? el.value : null;
            };
            const numOrNull = (id) => {
                const el = document.getElementById(id);
                if (!el || el.value === '') return null;
                const n = parseFloat(el.value);
                return Number.isNaN(n) ? null : n;
            };
            const intOrNull = (id) => {
                const el = document.getElementById(id);
                if (!el || el.value === '') return null;
                const n = parseInt(el.value, 10);
                return Number.isNaN(n) ? null : n;
            };
            const hasApIb = radioVal('has_ap_ib') === 'yes';
            const pellVal = radioVal('pell_or_first_gen');

            profileData.weighted_gpa = numOrNull('weightedGpa');
            profileData.sat_score = intOrNull('satScore');
            profileData.act_score = intOrNull('actScore');
            profileData.has_ap_ib = hasApIb;
            profileData.ap_ib_count = hasApIb ? intOrNull('apIbCount') : null;
            profileData.class_rank = (document.getElementById('classRank')?.value || '').trim() || null;
            const majors = majorPicker ? majorPicker.getSelected() : [];
            profileData.intended_major = majors.length ? majors : null;
            profileData.home_zip = (document.getElementById('homeZip')?.value || '').trim() || null;
            profileData.needs_financial_aid = radioVal('needs_financial_aid');
            profileData.needs_scholarship = radioVal('needs_scholarship');
            profileData.pell_or_first_gen = pellVal === null ? null : (pellVal === 'yes');
            const levels = levelsPicker ? levelsPicker.getSelected() : [];
            profileData.levels_open = levels.length ? levels : null;
            const regions = regionsPicker ? regionsPicker.getSelected() : [];
            profileData.preferred_regions = regions.length ? regions : null;
            profileData.preferred_campus_setting = document.getElementById('campusSetting')?.value || null;

            const lookingForVal = (document.getElementById('lookingFor')?.value || '').trim();
            profileData.fit_preferences = {
                importance_playing_time: intOrNull('impPlayingTime'),
                importance_close_to_home: intOrNull('impCloseToHome'),
                importance_academics_vs_football: intOrNull('impAcademics'),
                importance_competition_level: intOrNull('impCompetition'),
                looking_for_text: lookingForVal || null
            };

            // Step 3: Create or Update profile
            await profileAPI.createPlayerProfile(profileData);

            // Show success message
            showSuccessMessage(isUpdating);
        } catch (error) {
            console.error('Profile error:', error);

            // If user was created but profile creation failed, show helpful error
            if (userCreated) {
                showToast('Account was created but profile setup failed: ' + error.message + '. Please contact support or try logging in and completing your profile.', 'error');
            } else {
                showToast(`Failed to ${isUpdating ? 'update' : 'create'} profile: ` + error.message, 'error');
            }

            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
});

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

                // Handle height - convert from total inches to feet and inches
                if (profile.height) {
                    const totalInches = parseInt(profile.height);
                    const feet = Math.floor(totalInches / 12);
                    const inches = totalInches % 12;
                    document.getElementById('heightFt').value = feet;
                    document.getElementById('heightIn').value = inches;
                }

                if (profile.weight) document.getElementById('weight').value = profile.weight;
                if (profile.hudl_profile && document.getElementById('hudlProfile')) document.getElementById('hudlProfile').value = profile.hudl_profile;

                // Handle position - check the appropriate checkbox
                if (profile.position) {
                    const positionCheckbox = document.querySelector(`input[name="position"][value="${profile.position}"]`);
                    if (positionCheckbox) {
                        positionCheckbox.checked = true;
                        // Trigger change event to update selected positions display
                        positionCheckbox.dispatchEvent(new Event('change'));
                    }
                }

                // Fill in college data - college name is stored in team_name column
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
                if (profile.pff_grade != null) {
                    const yesRadio = document.querySelector('input[name="has_pff_grade"][value="yes"]');
                    if (yesRadio) {
                        yesRadio.checked = true;
                        yesRadio.dispatchEvent(new Event('change'));
                    }
                    const pffInput = document.getElementById('pffGrade');
                    if (pffInput) pffInput.value = profile.pff_grade;
                }

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

function showSuccessMessage(isUpdating) {
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';

    if (isUpdating) {
        successDiv.innerHTML = `
            <h3>✓ Player Profile Updated Successfully!</h3>
            <p>Your changes have been saved. Redirecting to your dashboard...</p>
        `;
    } else {
        successDiv.innerHTML = `
            <h3>✓ Account Created Successfully!</h3>
            <p>Please verify your email to complete registration...</p>
        `;
    }

    const form = document.getElementById('playerProfileForm');
    form.parentNode.appendChild(successDiv);

    setTimeout(() => {
        successDiv.classList.add('show');
    }, 100);

    form.style.opacity = '0.5';
    form.style.pointerEvents = 'none';

    setTimeout(() => {
        if (isUpdating) {
            // Updates redirect to mainpage
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('mainpage-player.html', window.location.href).href;
        } else {
            // New registrations redirect to email verification
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('verify-email.html', window.location.href).href;
        }
    }, 2000);
}
