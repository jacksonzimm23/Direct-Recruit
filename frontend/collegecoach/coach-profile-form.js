// Coach Profile Form JavaScript - College Coach Version

// Token validated from the invite link — null means paywall shown or user not invited
let validatedInviteToken = null;
// True when the invite came from a profile-type switch (existing user) vs a brand-new signup.
// Switch mode hides registration fields + posts to /settings/switch-profile instead of /profile/coach.
let isSwitchMode = false;
// True when the admin approved this signup with complimentary access (no Stripe).
// Free mode skips the tier selection modal + Stripe Checkout step entirely; the
// createCoachProfile backend handler writes subscription_status='comp' for these
// invites (decision read from the DB row, not the frontend flag).
let isFreeMode = false;

document.addEventListener('DOMContentLoaded', async function() {
    // This is a CREATE profile page - do NOT load existing profile data
    // If user is logged in and tries to create a new profile, they should start fresh
    // The loadExistingProfile function is only for EDIT profile pages
    // await loadExistingProfile();

    // Invite-token gate: unless a valid ?token= is present, show paywall overlay.
    // This page is invite-only for College Coach signups.
    const urlToken = new URLSearchParams(window.location.search).get('token');
    if (!urlToken) {
        showInvitePaywall('invite-only');
        return;
    }
    try {
        // Use API_BASE_URL from shared/api.js so this works on both Live Server and node
        const apiBase = (typeof window.API_BASE_URL === 'string')
            ? window.API_BASE_URL
            : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? `http://${window.location.hostname}:5000/api`
                : `${window.location.origin}/api`);
        const validateRes = await fetch(apiBase + '/coach-signup/validate-token?token=' + encodeURIComponent(urlToken), {
            credentials: 'include'
        });
        const validateData = await validateRes.json();
        if (!validateData.valid) {
            showInvitePaywall(validateData.reason || 'invalid');
            return;
        }
        validatedInviteToken = urlToken;
        isSwitchMode = !!validateData.is_switch;
        isFreeMode = !!validateData.is_free;

        // Switch mode requires the user to be signed in (the switch endpoint needs to know
        // WHICH existing user to convert, and we verify they own the account by matching
        // req.user.email against coach_invites.personal_email server-side).
        // If they clicked the invite while logged out, bounce to signin with ?next= so they
        // come back here automatically after authenticating.
        if (isSwitchMode && typeof isAuthenticated === 'function' && !isAuthenticated()) {
            const nextUrl = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = '../landingpage/signin.html?next=' + nextUrl;
            return;
        }

        // Pre-fill name fields (still editable) and lock the school field
        if (validateData.first_name) {
            const fn = document.getElementById('firstName');
            if (fn) fn.value = validateData.first_name;
        }
        if (validateData.last_name) {
            const ln = document.getElementById('lastName');
            if (ln) ln.value = validateData.last_name;
        }
        // School + division are locked — set after schoolSearch init below so values stick
        window._inviteSchool = validateData.school;
        window._inviteDivision = validateData.division || null;
    } catch (e) {
        showInvitePaywall('error');
        return;
    }

    const form = document.getElementById('coachProfileForm');

    // Initialize school search with logo + auto-division
    const schoolSearch = initSchoolSearch({
        nameInput: '#collegeName',
        divisionSelect: '#division',
        assetBasePath: '../assets'
    });

    // Lock the school field to the verified invite school.
    // Use schoolSearch.preselectSchool() so the module renders its "picked" state:
    // logo + school name + division in a preview strip, with the search input hidden.
    // Then we hide the clear/change and manual-entry buttons so the admin's canonical
    // pick can't be overridden from the client.
    if (window._inviteSchool && schoolSearch && typeof schoolSearch.preselectSchool === 'function') {
        schoolSearch.preselectSchool(window._inviteSchool);

        const group = document.getElementById('collegeName').closest('.form-group');
        if (group) {
            // Hide the "Change school" clear button on the preview strip
            const previewClear = group.querySelector('.school-preview-clear');
            if (previewClear) previewClear.style.display = 'none';

            // Hide the "Can't find your school? Enter manually" + "Back to school search" buttons
            const cantFind = group.querySelector('.school-cant-find-btn');
            if (cantFind) cantFind.style.display = 'none';
            const backToSearch = group.querySelector('.school-back-to-search-btn');
            if (backToSearch) backToSearch.style.display = 'none';

            // Give the preview strip an orange border ring to indicate it's locked
            const preview = group.querySelector('.school-preview');
            if (preview) {
                preview.style.borderColor = '#ff6b35';
                preview.style.boxShadow = '0 0 0 1px rgba(255,107,53,0.3)';
            }

            // Add a lock hint below the preview
            if (!group.querySelector('.invite-lock-hint')) {
                const hint = document.createElement('small');
                hint.className = 'invite-lock-hint';
                hint.textContent = '🔒 Verified school — contact support to change';
                hint.style.cssText = 'display:block;color:#ff6b35;font-size:0.8rem;margin-top:0.25rem;font-weight:500;';
                group.appendChild(hint);
            }
        }
    }

    // FREE comp-access banner: tells the coach upfront they're not getting
    // billed. Inserted at the very top of the form so it can't be missed.
    if (isFreeMode) {
        const formEl = document.getElementById('coachProfileForm');
        if (formEl && !document.getElementById('compAccessBanner')) {
            const banner = document.createElement('div');
            banner.id = 'compAccessBanner';
            banner.style.cssText = 'margin:0 0 1.25rem 0;padding:0.875rem 1rem;background:rgba(255,107,53,0.12);border:1px solid #ff6b35;border-radius:8px;color:#ff6b35;font-weight:600;font-size:0.95rem;display:flex;align-items:center;gap:0.5rem;';
            banner.innerHTML = '🎁 <span>Your account has been approved with <strong>complimentary access</strong> — no payment required.</span>';
            formEl.insertBefore(banner, formEl.firstChild);
        }
    }

    // Lock the division select to the verified invite division.
    // `disabled` prevents submission of the <select> value, so we also add a hidden mirror input.
    if (window._inviteDivision) {
        const divisionSelect = document.getElementById('division');
        if (divisionSelect) {
            divisionSelect.value = window._inviteDivision;
            divisionSelect.setAttribute('disabled', 'disabled');
            divisionSelect.classList.add('invite-locked');
            // Hidden mirror input so disabled select's value is still submitted
            if (!document.getElementById('divisionLockedMirror')) {
                const hidden = document.createElement('input');
                hidden.type = 'hidden';
                hidden.name = 'division';
                hidden.id = 'divisionLockedMirror';
                hidden.value = window._inviteDivision;
                divisionSelect.parentNode.appendChild(hidden);
            }
        }
    }

    // ─── Switch mode: hide registration fields the user already has ──────────────
    // For switches, the user is already authenticated with email/password/username.
    // Hide those form sections + the page subtitle changes to reflect the switch context.
    if (isSwitchMode) {
        // Hide email, password, confirmPassword, and their parent .form-group containers.
        // Username stays visible only if the user doesn't already have one — fetch /auth/me to check.
        ['email', 'password', 'confirmPassword'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                const group = el.closest('.form-group');
                if (group) group.style.display = 'none';
                el.removeAttribute('required');
            }
        });
        // Page header copy — let user know they're switching, not creating
        const headerTitle = document.querySelector('.form-header h1');
        const headerSub = document.querySelector('.form-header p');
        if (headerTitle) headerTitle.textContent = 'Complete Your College Coach Switch';
        if (headerSub) headerSub.textContent = "Verified — fill in your remaining coaching info to switch your account. Your existing posts, connections, and email stay intact.";
        // Submit button copy
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
            // Find the text node and replace just the label, leaving the SVG icon intact
            for (const node of submitBtn.childNodes) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
                    node.textContent = ' Confirm Switch ';
                    break;
                }
            }
        }
        // Pre-fill + LOCK the username from the existing account so coaches can't accidentally
        // change it during the switch (and to prevent the username availability check from
        // firing on their own already-owned username). Username comes from the user's existing
        // profile (it's stored on profile rows + users.username — read whichever is populated).
        try {
            const apiBase = (typeof window.API_BASE_URL === 'string')
                ? window.API_BASE_URL
                : `http://${window.location.hostname}:5000/api`;
            const me = await fetch(apiBase + '/auth/me', { credentials: 'include' }).then(r => r.json());
            const existingUsername = (me?.profile?.username) || (me?.user?.username) || null;
            if (existingUsername) {
                const usernameEl = document.getElementById('username');
                if (usernameEl) {
                    usernameEl.value = existingUsername;
                    usernameEl.readOnly = true;
                    usernameEl.classList.add('invite-locked');
                    // Make sure submit doesn't try to validate "isUsernameAvailable" since user already owns it
                    window._inviteSwitchUsername = existingUsername;
                    // Replace the helper text + add a friendly note about changing it later
                    const group = usernameEl.closest('.form-group');
                    if (group) {
                        // Hide the existing hint + char counter (they don't apply when locked)
                        const hint = group.querySelector('#usernameHint');
                        if (hint) hint.style.display = 'none';
                        const lengthErr = group.querySelector('#usernameLengthError');
                        if (lengthErr) lengthErr.style.display = 'none';
                        // Add a lock note if not already added
                        if (!group.querySelector('.username-switch-lock-hint')) {
                            const note = document.createElement('small');
                            note.className = 'username-switch-lock-hint';
                            note.textContent = '🔒 Locked from your existing account — you can change your username later from My Profile.';
                            note.style.cssText = 'display:block;color:#ff6b35;font-size:0.8rem;margin-top:0.25rem;font-weight:500;';
                            group.appendChild(note);
                        }
                    }
                }
            }
        } catch (e) { /* non-fatal — user fills username manually */ }
    }
    // ──────────────────────────────────────────────────────────────────────────────

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

        // Skip new-account validation in switch mode — user already has username/email/password.
        const skipNewAccountChecks = isUpdating || isSwitchMode;

        // Validate username is available (only for new profiles, not updates or switches)
        if (!skipNewAccountChecks && !isUsernameAvailable) {
            usernameInput.focus();
            return false;
        }

        // Validate email is available (only for new profiles, not updates or switches)
        if (!skipNewAccountChecks && !isEmailAvailable) {
            emailInput.focus();
            return false;
        }

        // Validate password meets requirements (only for new profiles)
        if (!skipNewAccountChecks && passwordInput && passwordInput.dataset.valid !== 'true') {
            showToast('Please make sure your password meets all the requirements.', 'warning');
            passwordInput.focus();
            return false;
        }

        // Validate passwords match (only for new profiles)
        if (!skipNewAccountChecks) {
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
            // In switch mode the user is already authenticated — no email/password fields exist
            // and we skip the register call entirely. The DOM elements may be hidden so guard reads.
            const email = isSwitchMode ? '' : document.getElementById('email').value;
            const password = isSwitchMode ? '' : document.getElementById('password').value;
            const confirmPassword = isSwitchMode ? '' : document.getElementById('confirmPassword').value;

            // Only register a brand-new user if this is neither an update NOR a switch
            if (!isUpdating && !isSwitchMode) {

                // Store email for verification page
                localStorage.setItem('pendingVerificationEmail', email);

                // Step 1: Register user
                await authAPI.register(email, password, 'coach');
                userCreated = true;
            }

            submitBtn.textContent = isSwitchMode ? 'Switching profile...' : (isUpdating ? 'Updating Profile...' : 'Creating Profile...');

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

            // Invite token — required for new College Coach profiles (backend re-validates and overrides team_name)
            if (validatedInviteToken) {
                profileData.inviteToken = validatedInviteToken;
            }

            if (isUpdating) {
                // Updates: create/update profile directly, no payment
                await profileAPI.createCoachProfile(profileData);
                showSuccessMessage(isUpdating);
            } else if (isSwitchMode) {
                // Profile-type switch: POST to switch-profile endpoint with the invite token.
                // Backend validates token, overrides school+division from invite, runs the
                // switch transaction, marks the invite consumed.
                const result = await API.settings.switchProfile(
                    'collegecoach',
                    profileData,
                    /* confirm */ true,
                    /* inviteToken */ validatedInviteToken
                );
                if (result && result.requires_payment) {
                    // User is moving from a free type (or different paid tier) to collegecoach —
                    // need a Stripe checkout. The switch transaction has ALREADY run server-side,
                    // so flag the pending data as switch-origin so payment-success.js doesn't
                    // try to create the profile a second time.
                    const switchPending = { ...profileData, _isSwitch: true };
                    localStorage.setItem('pendingProfileData', JSON.stringify(switchPending));
                    submitBtn.textContent = 'Choose your plan...';
                    showTierSelectionModal();
                } else {
                    // Same-price transition (or already paid same tier) — switch is done. Go to mainpage.
                    showToast('Switched to College Coach!', 'success');
                    setTimeout(() => {
                        window.location.href = 'mainpage-coach.html';
                    }, 1200);
                }
            } else if (isFreeMode) {
                // FREE comp-access path: skip Stripe entirely. Create the profile
                // directly — backend writes subscription_status='comp' inside
                // createCoachProfile because the invite row has is_free=true.
                // (The DB row is the source of truth; this frontend flag is just
                // a hint to skip the tier modal.) Land on the coach mainpage.
                await profileAPI.createCoachProfile(profileData);
                showToast("Welcome aboard — your account is comped!", 'success');
                setTimeout(() => {
                    window.location.href = 'mainpage-coach.html';
                }, 1200);
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

            // Phase 3c: iOS branch — use IAP instead of Stripe
            if (API.isIOSApp()) {
                try {
                    const r = await window.IAP.purchaseTier('collegecoach', tier);
                    if (r.success) {
                        // Mirror payment-success.js logic inline (iOS never reaches that page via URL)
                        try {
                            const profileDataRaw = localStorage.getItem('pendingProfileData');
                            const profileData = profileDataRaw ? JSON.parse(profileDataRaw) : null;
                            if (profileData && !profileData._isSwitch) {
                                await API.profile.createCoachProfile(profileData);
                            }
                            localStorage.removeItem('pendingProfileData');

                            // Grace period for paywall IIFE on next page
                            const me = await API.auth.getCurrentUser().catch(() => null);
                            if (me && me.user && me.user.id) {
                                localStorage.setItem('iap_pending_activation', JSON.stringify({
                                    at: Date.now(), userId: me.user.id
                                }));
                            }

                            // Match web flow: switch -> mainpage, new signup -> verify-email
                            if (profileData && profileData._isSwitch) {
                                window.location.href = 'mainpage-coach.html';
                            } else {
                                window.location.href = 'verify-email.html';
                            }
                        } catch (innerErr) {
                            console.error('Post-IAP profile setup error:', innerErr);
                            showToast('Profile setup failed after purchase: ' + innerErr.message, 'error');
                            btn.textContent = 'Select';
                            btn.disabled = false;
                        }
                        return;
                    }
                    if (r.cancelled) {
                        btn.textContent = 'Select';
                        btn.disabled = false;
                        return;
                    }
                    showToast('Purchase failed: ' + (r.error || 'unknown'), 'error');
                    btn.textContent = 'Select';
                    btn.disabled = false;
                    return;
                } catch (iosErr) {
                    console.error('IAP error:', iosErr);
                    showToast('Purchase failed: ' + iosErr.message, 'error');
                    btn.textContent = 'Select';
                    btn.disabled = false;
                    return;
                }
            }

            // Web — existing Stripe flow
            try {
                // Preserve invite token across Stripe redirect so the cancel URL lets the user retry with the same invite
                const tokenQuery = validatedInviteToken ? ('?token=' + encodeURIComponent(validatedInviteToken)) : '';
                const { url } = await API.payments.createCheckoutSession(
                    'collegecoach',
                    tier,
                    'signup',
                    window.location.origin + '/frontend/collegecoach/payment-success.html' + tokenQuery,
                    window.location.origin + '/frontend/collegecoach/create-coach-profile.html' + tokenQuery
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

// Full-screen paywall overlay shown when a user hits create-profile without a valid invite token
function showInvitePaywall(reason) {
    const messages = {
        'invite-only': {
            title: "Invite-only signup",
            body: "College Coach accounts are invite-only. Request access below — we'll review and follow up within 48 hours."
        },
        'expired': {
            title: "This invite has expired",
            body: "Invites are valid for 7 days. Request a new one below and we'll get back in touch."
        },
        'used': {
            title: "Invite already used",
            body: "This invite link has already been redeemed. If your account already exists but you haven't verified your email, just sign in below — we'll send you a fresh verification code."
        },
        'revoked': {
            title: "Invite revoked",
            body: "This invite is no longer valid. If you think this is wrong, contact support."
        },
        'invalid': {
            title: "Invalid invite link",
            body: "We couldn't recognize this invite link. Please double-check the URL or request a new invite."
        },
        'error': {
            title: "Something went wrong",
            body: "We couldn't validate your invite. Please try again or request a new one."
        }
    };
    const msg = messages[reason] || messages['invalid'];

    // Hide original page content by adding a fixed overlay on top
    const overlay = document.createElement('div');
    overlay.id = 'invitePaywallOverlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: linear-gradient(135deg, #0a1128 0%, #1a2540 50%, #0a1128 100%);
        display: flex; align-items: center; justify-content: center;
        padding: 2rem; font-family: 'Inter', sans-serif;
    `;
    overlay.innerHTML = `
      <div style="max-width:520px; width:100%; background: rgba(254,252,251,0.04); backdrop-filter: blur(10px);
                  border: 2px solid rgba(18,130,162,0.3); border-radius:20px; padding:3rem 2.5rem; text-align:center;">
        <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,107,53,0.15);
                    border:2px solid #ff6b35;display:inline-flex;align-items:center;justify-content:center;
                    margin-bottom:1.5rem;color:#ff6b35;">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h1 style="font-size:1.8rem;font-weight:900;color:#fff;margin:0 0 0.75rem;background:linear-gradient(135deg,#1282a2,#ff6b35);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">
          ${msg.title}
        </h1>
        <p style="color:rgba(254,252,251,0.75);font-size:1rem;line-height:1.6;margin:0 0 2rem;">
          ${msg.body}
        </p>
        <div style="display:flex;gap:0.75rem;flex-direction:column;">
          <a href="../landingpage/coach-signup-request.html"
             style="display:inline-block;background:linear-gradient(135deg,#1282a2 0%,#ff6b35 140%);color:#fff;
                    text-decoration:none;font-weight:700;padding:0.9rem 1.5rem;border-radius:10px;">
            Request Access
          </a>
          <a href="../landingpage/signin.html"
             style="display:inline-block;background:rgba(18,130,162,0.15);border:1.5px solid #1282a2;color:#fff;
                    text-decoration:none;font-weight:600;padding:0.7rem 1.5rem;border-radius:10px;">
            Already approved? Sign in
          </a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    // Block the form from ever rendering behind this
    document.body.style.overflow = 'hidden';
}

// CSS for the locked school input
(function injectInviteLockedCSS() {
    if (document.getElementById('invite-locked-style')) return;
    const style = document.createElement('style');
    style.id = 'invite-locked-style';
    style.textContent = `
        .invite-locked {
            background-color: rgba(10, 17, 40, 0.6) !important;
            color: rgba(254, 252, 251, 0.75) !important;
            cursor: not-allowed !important;
            border-color: #ff6b35 !important;
            opacity: 0.95;
        }
        .invite-locked:focus {
            outline: none !important;
            box-shadow: 0 0 0 2px rgba(255, 107, 53, 0.25);
        }
    `;
    document.head.appendChild(style);
})();
