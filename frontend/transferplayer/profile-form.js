document.addEventListener('DOMContentLoaded', async function() {
    // This is a CREATE profile page - do NOT load existing profile data
    // If user is logged in and tries to create a new profile, they should start fresh
    // The loadExistingProfile function is only for EDIT profile pages
    // await loadExistingProfile();

    const schoolTypeInput = document.getElementById('schoolType');
    const profileForm = document.getElementById('playerProfileForm');

    // ── Parent / Guardian repeatable rows (optional, up to 4) ──
    const GUARDIAN_MAX = 4;
    const guardianRows = document.getElementById('guardianRows');
    const addGuardianBtn = document.getElementById('addGuardianBtn');

    function refreshGuardianUI() {
        const rows = guardianRows ? guardianRows.querySelectorAll('.guardian-row') : [];
        rows.forEach((row, i) => {
            const title = row.querySelector('.guardian-row-title');
            if (title) title.textContent = `Parent / Guardian ${i + 1}`;
        });
        if (addGuardianBtn) addGuardianBtn.disabled = rows.length >= GUARDIAN_MAX;
    }

    function addGuardianRow(data) {
        if (!guardianRows) return;
        if (guardianRows.querySelectorAll('.guardian-row').length >= GUARDIAN_MAX) return;
        const d = data || {};
        const row = document.createElement('div');
        row.className = 'guardian-row';
        row.innerHTML = `
            <div class="guardian-row-header">
                <span class="guardian-row-title">Parent / Guardian</span>
                <button type="button" class="btn-remove-guardian" title="Remove">&times;</button>
            </div>
            <div class="form-group">
                <label>Name</label>
                <input type="text" class="guardian-name" autocomplete="off" placeholder="Full name" value="${(d.name || '').replace(/"/g, '&quot;')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Email</label>
                    <input type="email" class="guardian-email" autocomplete="off" placeholder="email@example.com" value="${(d.email || '').replace(/"/g, '&quot;')}">
                </div>
                <div class="form-group">
                    <label>Phone</label>
                    <input type="tel" class="guardian-phone" autocomplete="off" placeholder="(555) 123-4567" value="${(d.phone || '').replace(/"/g, '&quot;')}">
                </div>
            </div>
        `;
        row.querySelector('.btn-remove-guardian').addEventListener('click', function() {
            row.remove();
            refreshGuardianUI();
        });
        guardianRows.appendChild(row);
        refreshGuardianUI();
    }

    if (addGuardianBtn) addGuardianBtn.addEventListener('click', () => addGuardianRow());

    // Collect non-empty guardians; each shown row is all-or-nothing (validated on submit).
    function collectGuardians() {
        if (!guardianRows) return [];
        const out = [];
        guardianRows.querySelectorAll('.guardian-row').forEach(row => {
            const name = (row.querySelector('.guardian-name').value || '').trim();
            const email = (row.querySelector('.guardian-email').value || '').trim();
            const phone = (row.querySelector('.guardian-phone').value || '').trim().replace(/\D/g, '');
            if (name || email || phone) out.push({ name, email, phone });
        });
        return out;
    }

    // Returns an error string if any partially-filled guardian row exists, else null.
    function validateGuardians(list) {
        for (const g of list) {
            if (!g.name || !g.email || !g.phone) {
                return 'Each parent/guardian needs a name, email, and phone (or remove the row).';
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)) {
                return 'Please enter a valid parent/guardian email.';
            }
        }
        return null;
    }

    // Verify-then-pay: the submit button reads "Create Profile" (static, set in HTML).
    // Pricing + the FTC auto-renewal disclosure live on the paywall now.

    // Initialize school search with logo + auto-division
    const schoolSearch = initSchoolSearch({
        nameInput: '#previousCollegeName',
        divisionSelect: '#previousDivision',
        assetBasePath: '../assets'
    });

    // Position checkboxes
    const positionCheckboxes = document.querySelectorAll('input[name="position"]');
    const selectedPositionsContainer = document.getElementById('selectedPositions');
    let selectedPositions = [];

    // Athletics — other sports
    const sportCheckboxes = document.querySelectorAll('.sport-checkbox');
    const selectedSportsContainer = document.getElementById('selectedSports');
    let selectedSports = [];

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

    // Email availability validation.
    //
    // Availability is tri-state ('available' | 'taken' | 'unknown'). 'unknown'
    // means the server could not answer (rate limited, offline) and MUST let the
    // user through — the server re-checks at save time. Treating 'unknown' as
    // 'taken' is the bug that told testers every input was already in use.
    const emailInput = document.getElementById('email');
    const emailError = document.getElementById('emailError');
    const emailHint = document.getElementById('emailHint');
    let emailCheckTimeout;
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

    // Username availability validation.
    // Tri-state, same contract as the email check above: 'unknown' never blocks.
    const usernameInput = document.getElementById('username');
    const usernameError = document.getElementById('usernameError');
    const usernameLengthError = document.getElementById('usernameLengthError');
    const usernameHint = document.getElementById('usernameHint');
    // First/last name character counters (same treatment as the username counter below).
    [['firstName', 'firstNameCharCount'], ['lastName', 'lastNameCharCount']].forEach(function(pair) {
        const nameInput = document.getElementById(pair[0]);
        const nameCount = document.getElementById(pair[1]);
        if (!nameInput || !nameCount) return;
        const updateNameCount = function() {
            const len = nameInput.value.length;
            nameCount.textContent = len;
            if (len >= 16) {
                nameCount.style.color = len >= 20 ? '#ff6b6b' : '#ffa500';
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

            // Warn only ABOVE the limit, not AT it. This used to fire at >= 15
            // and `return` before the availability check, so a transfer player
            // who used the full 15 characters the input allows was never checked
            // at all: the form silently refused to submit while showing "Username
            // cannot exceed 15 characters" on a name that was exactly at the cap.
            if (username.length > 15) {
                if (usernameLengthError) {
                    usernameLengthError.style.display = 'block';
                    usernameHint.style.display = 'none';
                    usernameInput.style.borderColor = '#ff6b6b';
                }
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

    // Athletics — Yes/No toggle reveals sports block
    document.querySelectorAll('input[name="plays_other_sports"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const show = this.value === 'yes';
            const block = document.getElementById('otherSportsBlock');
            if (block) block.style.display = show ? '' : 'none';
            if (!show) {
                selectedSports = [];
                document.querySelectorAll('.sport-checkbox:checked').forEach(c => { c.checked = false; });
                const otg = document.getElementById('otherSportTextGroup');
                const ttb = document.getElementById('trackTimesBlock');
                const ost = document.getElementById('otherSportText');
                const t1 = document.getElementById('track100m');
                const t2 = document.getElementById('track200m');
                if (otg) otg.style.display = 'none';
                if (ttb) ttb.style.display = 'none';
                if (ost) ost.value = '';
                if (t1) t1.value = '';
                if (t2) t2.value = '';
                updateSelectedSports();
            }
        });
    });

    // Athletics — sport checkbox changes
    sportCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            selectedSports = Array.from(document.querySelectorAll('.sport-checkbox:checked')).map(c => c.value);
            updateSelectedSports();
            const trackBlock = document.getElementById('trackTimesBlock');
            const otherGroup = document.getElementById('otherSportTextGroup');
            if (trackBlock) trackBlock.style.display = selectedSports.includes('Track and Field') ? '' : 'none';
            if (otherGroup) otherGroup.style.display = selectedSports.includes('Other') ? '' : 'none';
            if (!selectedSports.includes('Track and Field')) {
                const t1 = document.getElementById('track100m');
                const t2 = document.getElementById('track200m');
                if (t1) t1.value = '';
                if (t2) t2.value = '';
            }
            if (!selectedSports.includes('Other')) {
                const ost = document.getElementById('otherSportText');
                if (ost) ost.value = '';
            }
        });
    });

    function updateSelectedSports() {
        if (!selectedSportsContainer) return;
        selectedSportsContainer.innerHTML = '';
        selectedSports.forEach(sport => {
            const pill = document.createElement('div');
            pill.className = 'selected-item';
            pill.innerHTML = `
                ${sport}
                <button type="button" class="remove-sport-item" data-sport="${sport}">&times;</button>
            `;
            selectedSportsContainer.appendChild(pill);
        });
        document.querySelectorAll('.remove-sport-item').forEach(btn => {
            btn.addEventListener('click', function() {
                const sport = this.dataset.sport;
                selectedSports = selectedSports.filter(s => s !== sport);
                const cb = document.querySelector(`.sport-checkbox[value="${sport}"]`);
                if (cb) cb.checked = false;
                const trackBlock = document.getElementById('trackTimesBlock');
                const otherGroup = document.getElementById('otherSportTextGroup');
                if (trackBlock) trackBlock.style.display = selectedSports.includes('Track and Field') ? '' : 'none';
                if (otherGroup) otherGroup.style.display = selectedSports.includes('Other') ? '' : 'none';
                updateSelectedSports();
            });
        });
    }

    // Handle form submission
    profileForm.addEventListener('submit', async function(e) {
        e.preventDefault();

        // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
        // path segment; on web there is. Mirror shared/api.js's prefix convention so
        // these URLs resolve in BOTH the WKWebView and the browser.
        const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');

        // Validate at least one position is selected
        if (selectedPositions.length === 0) {
            showToast('Please select at least one position.', 'warning');
            return;
        }

        // Validate parent/guardian rows (each shown row is all-or-nothing).
        const guardianList = collectGuardians();
        const guardianErr = validateGuardians(guardianList);
        if (guardianErr) {
            showToast(guardianErr, 'warning');
            return;
        }

        const submitBtn = profileForm.querySelector('button[type="submit"]');
        const submitLabel = document.getElementById('submitBtnLabel');
        const originalText = submitLabel ? submitLabel.textContent : submitBtn.textContent;
        // Edit mode is flagged on the body by loadExistingProfile(); fall back to label text.
        const isUpdating = document.body.dataset.editMode === 'true' || originalText.trim() === 'Update Profile';

        // Write button text into the label span so the SVG icon is preserved.
        const setBtnText = (text) => {
            if (submitLabel) submitLabel.textContent = text;
            else submitBtn.textContent = text;
        };

        // Validate username is available (only for new profiles, not updates).
        //
        // Resolve the check NOW rather than reading a possibly-stale flag. If the
        // user clicked submit inside the 500ms debounce, the old code silently
        // focused the field and returned, so nothing appeared to happen.
        //
        // Only a definite 'taken' blocks. 'unknown' (rate limited, offline) goes
        // through — the server re-checks and returns 409 on a real collision.
        if (!isUpdating) {
            const usernameVerdict = usernameStatus === 'taken'
                ? 'taken'
                : await resolveUsernameNow();
            if (usernameVerdict === 'taken') {
                usernameInput.focus();
                showToast('That username is already taken. Please choose another.', 'error');
                return;
            }

            const emailVerdict = emailStatus === 'taken'
                ? 'taken'
                : await resolveEmailNow();
            if (emailVerdict === 'taken') {
                emailInput.focus();
                showToast('That email is already in use. Please sign in instead.', 'error');
                return;
            }
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
        setBtnText(isUpdating ? 'Updating Profile...' : 'Creating Account...');

        let userCreated = false;
        try {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;

            // Only register new user if not updating
            if (!isUpdating) {

                // Age gate: block under-13 before creating the account. Renders a
                // red "ages 13+" message under the DOB field and aborts on failure.
                const dob = document.getElementById('dateOfBirth')?.value || null;
                if (!checkSignupAge(dob)) {
                    submitBtn.disabled = false;
                    setBtnText('Create Profile');
                    return;
                }

                // Store email for verification page
                localStorage.setItem('pendingVerificationEmail', email);

                // Step 1: Register user (DOB + ToS acceptance recorded server-side)
                await authAPI.register(email, password, 'player', dob, true);
                userCreated = true;
            }

            setBtnText(isUpdating ? 'Updating Profile...' : 'Creating Profile...');

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
            };

            // Transfer player specific fields
            profileData.team_name = document.getElementById('previousCollegeName').value;
            profileData.state = document.getElementById('previousState').value;
            profileData.graduation_year = parseInt(document.getElementById('gradYear').value) || null;
            profileData.gpa = parseFloat(document.getElementById('gpa').value) || null;
            profileData.college_division = document.getElementById('previousDivision').value;
            profileData.conference = document.getElementById('previousConference').value || null;
            profileData.number = document.getElementById('jerseyNumber').value ? parseInt(document.getElementById('jerseyNumber').value) : null;
            profileData.eligibility = document.getElementById('eligibility').value ? parseInt(document.getElementById('eligibility').value) : null;
            // Mark as transfer player — this is what makes the system classify them as transferplayer
            profileData.transfer = 'y';

            // ── Recruiting contact fields (private; CSV export) ──
            profileData.date_of_birth = document.getElementById('dateOfBirth')?.value || null;
            profileData.gender = document.getElementById('gender')?.value || null;
            profileData.phone = (document.getElementById('phone')?.value || '').trim() || null;
            profileData.address = (document.getElementById('address')?.value || '').trim() || null;
            profileData.city = (document.getElementById('city')?.value || '').trim() || null;
            profileData.zip = (document.getElementById('zip')?.value || '').trim() || null;
            profileData.coach_name = (document.getElementById('coachName')?.value || '').trim() || null;
            profileData.coach_email = (document.getElementById('coachEmail')?.value || '').trim() || null;
            profileData.coach_phone = (document.getElementById('coachPhone')?.value || '').trim() || null;
            profileData.parent_guardians = guardianList;

            // PFF Grade — only included when user selected "Yes". NULL = no grade reported.
            const hasPffEl = document.querySelector('input[name="has_pff_grade"]:checked');
            const hasPff = hasPffEl && hasPffEl.value === 'yes';
            profileData.pff_grade = hasPff
                ? (parseFloat(document.getElementById('pffGrade').value) || null)
                : null;

            // Athletics
            const playsOtherEl = document.querySelector('input[name="plays_other_sports"]:checked');
            const playsOther = playsOtherEl && playsOtherEl.value === 'yes';
            let otherSportsPayload = null;
            if (playsOther && selectedSports.length) {
                otherSportsPayload = selectedSports.filter(s => s !== 'Other');
                if (selectedSports.includes('Other')) {
                    const otherText = (document.getElementById('otherSportText').value || '').trim();
                    if (otherText) otherSportsPayload.push(`other:${otherText}`);
                }
                if (otherSportsPayload.length === 0) otherSportsPayload = null;
            }
            profileData.other_sports = otherSportsPayload;
            profileData.track_100m = (playsOther && selectedSports.includes('Track and Field'))
                ? (parseFloat(document.getElementById('track100m').value) || null) : null;
            profileData.track_200m = (playsOther && selectedSports.includes('Track and Field'))
                ? (parseFloat(document.getElementById('track200m').value) || null) : null;

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

            if (isUpdating) {
                // Updates: create/update profile directly, no payment
                await profileAPI.createPlayerProfile(profileData);
                showSuccessMessage(isUpdating);
            } else {
                // New signups (verify-then-pay model): account was just created by
                // authAPI.register above. Create the profile NOW, server-side, so the
                // data is permanent/device-independent. Payment is NOT taken here —
                // after the user verifies their email they land on the paywall
                // (shared/subscription-required.html), which handles Stripe (web) /
                // Apple IAP (iOS). Unpaid = a normal verified account that sees the paywall.
                setBtnText('Creating Profile...');
                await profileAPI.createPlayerProfile(profileData);
                localStorage.removeItem('pendingProfileData');

                // Resolve relative nav to an absolute URL so it works in the iOS WKWebView.
                window.location.href = new URL('verify-email.html', window.location.href).href;
            }
        } catch (error) {
            console.error('Profile error:', error);

            // 409 = the server's authoritative uniqueness check rejected the
            // username. This is the backstop for the advisory client-side check,
            // which now lets 'unknown' through rather than guessing "taken".
            if (error.status === 409) {
                applyUsernameStatus('taken');
                usernameInput.focus();
                showToast(error.message || 'That username is already taken. Please choose another.', 'error');
                submitBtn.disabled = false;
                setBtnText(originalText);
                return;
            }

            // If user was created but something failed, show helpful error
            if (userCreated) {
                showToast('Account was created but setup failed: ' + error.message + '. Please try logging in to complete your profile and payment.', 'error');
            } else {
                showToast(`Failed to ${isUpdating ? 'update' : 'create'} profile: ` + error.message, 'error');
            }

            submitBtn.disabled = false;
            setBtnText(originalText);
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

                // Handle position - check the appropriate checkbox
                if (profile.position) {
                    const positionCheckbox = document.querySelector(`input[name="position"][value="${profile.position}"]`);
                    if (positionCheckbox) {
                        positionCheckbox.checked = true;
                        // Trigger change event to update selected positions display
                        positionCheckbox.dispatchEvent(new Event('change'));
                    }
                }

                // Fill in transfer player data
                if (profile.team_name) {
                    document.getElementById('previousCollegeName').value = profile.team_name;
                    if (schoolSearch) schoolSearch.preselectSchool(profile.team_name);
                }
                if (profile.state) {
                    document.getElementById('previousState').value = profile.state;
                }
                if (profile.college_division) {
                    document.getElementById('previousDivision').value = profile.college_division;
                }
                if (profile.conference) {
                    document.getElementById('previousConference').value = profile.conference;
                }
                if (profile.number) {
                    document.getElementById('jerseyNumber').value = profile.number;
                }
                if (profile.eligibility) {
                    document.getElementById('eligibility').value = profile.eligibility;
                }
                if (profile.graduation_year) {
                    document.getElementById('gradYear').value = profile.graduation_year;
                }
                if (profile.gpa) {
                    document.getElementById('gpa').value = profile.gpa;
                }

                // Recruiting contact fields prefill (edit mode)
                if (profile.date_of_birth) {
                    const dob = String(profile.date_of_birth).slice(0, 10);
                    if (document.getElementById('dateOfBirth')) document.getElementById('dateOfBirth').value = dob;
                }
                if (profile.gender && document.getElementById('gender')) document.getElementById('gender').value = profile.gender;
                if (profile.phone && document.getElementById('phone')) document.getElementById('phone').value = profile.phone;
                if (profile.address && document.getElementById('address')) document.getElementById('address').value = profile.address;
                if (profile.city && document.getElementById('city')) document.getElementById('city').value = profile.city;
                if (profile.zip && document.getElementById('zip')) document.getElementById('zip').value = profile.zip;
                if (profile.coach_name && document.getElementById('coachName')) document.getElementById('coachName').value = profile.coach_name;
                if (profile.coach_email && document.getElementById('coachEmail')) document.getElementById('coachEmail').value = profile.coach_email;
                if (profile.coach_phone && document.getElementById('coachPhone')) document.getElementById('coachPhone').value = profile.coach_phone;
                if (Array.isArray(profile.parent_guardians) && typeof addGuardianRow === 'function') {
                    profile.parent_guardians.slice(0, 4).forEach(g => addGuardianRow(g));
                }

                // PFF Grade prefill
                if (profile.pff_grade != null) {
                    const yesRadio = document.querySelector('input[name="has_pff_grade"][value="yes"]');
                    if (yesRadio) {
                        yesRadio.checked = true;
                        yesRadio.dispatchEvent(new Event('change'));
                    }
                    const pffInput = document.getElementById('pffGrade');
                    if (pffInput) pffInput.value = profile.pff_grade;
                }

                // Athletics prefill
                if (Array.isArray(profile.other_sports) && profile.other_sports.length) {
                    const yesRadio = document.querySelector('input[name="plays_other_sports"][value="yes"]');
                    if (yesRadio) {
                        yesRadio.checked = true;
                        yesRadio.dispatchEvent(new Event('change'));
                    }
                    const otherEntry = profile.other_sports.find(s => typeof s === 'string' && s.startsWith('other:'));
                    const standardSports = profile.other_sports.filter(s => typeof s === 'string' && !s.startsWith('other:'));
                    standardSports.forEach(sport => {
                        const cb = document.querySelector(`.sport-checkbox[value="${sport}"]`);
                        if (cb) {
                            cb.checked = true;
                            cb.dispatchEvent(new Event('change'));
                        }
                    });
                    if (otherEntry) {
                        const otherCb = document.querySelector('.sport-checkbox[value="Other"]');
                        if (otherCb) {
                            otherCb.checked = true;
                            otherCb.dispatchEvent(new Event('change'));
                        }
                        const ost = document.getElementById('otherSportText');
                        if (ost) ost.value = otherEntry.slice(6);
                    }
                    if (profile.track_100m != null && document.getElementById('track100m')) {
                        document.getElementById('track100m').value = profile.track_100m;
                    }
                    if (profile.track_200m != null && document.getElementById('track200m')) {
                        document.getElementById('track200m').value = profile.track_200m;
                    }
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

                // Edit mode: relabel the button and hide the subscription disclosure
                // (no purchase happens when editing an existing profile).
                document.body.dataset.editMode = 'true';
                const submitLabel = document.getElementById('submitBtnLabel');
                if (submitLabel) submitLabel.textContent = 'Update Profile';
                const disclosure = document.getElementById('subscribeDisclosure');
                if (disclosure) disclosure.style.display = 'none';
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
            window.location.href = new URL('verify-email.html', window.location.href).href;
        }
    }, 2000);
}
