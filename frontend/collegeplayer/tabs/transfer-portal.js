// Transfer Portal JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize checklist functionality
    initChecklist();

    // Initialize enter portal button
    initEnterPortalButton();
});

// Checklist state (persisted in localStorage)
const CHECKLIST_STORAGE_KEY = 'transferPortalChecklist';

function getChecklistState() {
    const stored = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (stored) {
        return JSON.parse(stored);
    }
    return {
        compliance: false,
        staff: false,
        window: false,
        module: false
    };
}

function saveChecklistState(state) {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state));
}

function initChecklist() {
    const checklistItems = document.querySelectorAll('.checklist-item');
    const state = getChecklistState();

    // Apply saved state
    checklistItems.forEach(item => {
        const itemKey = item.dataset.item;
        if (state[itemKey]) {
            item.classList.add('completed');
        }
    });

    // Update progress
    updateProgress();

    // Add click handlers
    checklistItems.forEach(item => {
        item.addEventListener('click', function() {
            const itemKey = this.dataset.item;
            const state = getChecklistState();

            // Toggle completion
            state[itemKey] = !state[itemKey];
            saveChecklistState(state);

            // Update UI
            if (state[itemKey]) {
                this.classList.add('completed');
            } else {
                this.classList.remove('completed');
            }

            updateProgress();
        });
    });
}

function updateProgress() {
    const state = getChecklistState();
    const completedCount = Object.values(state).filter(v => v).length;
    const totalCount = Object.keys(state).length;
    const percentage = (completedCount / totalCount) * 100;

    // Update count text
    const countElement = document.getElementById('completedCount');
    if (countElement) {
        countElement.textContent = completedCount;
    }

    // Update progress bar
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }

    // Enable/disable the enter portal button
    const enterPortalBtn = document.getElementById('enterPortalBtn');
    if (enterPortalBtn) {
        enterPortalBtn.disabled = completedCount < totalCount;
    }
}

function initEnterPortalButton() {
    const enterPortalBtn = document.getElementById('enterPortalBtn');

    if (enterPortalBtn) {
        enterPortalBtn.addEventListener('click', function() {
            showConfirmationModal();
        });
    }
}

function showConfirmationModal() {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'portal-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="portal-modal">
            <button class="modal-close-btn" id="modalCloseBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <div class="modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 12h8"></path>
                    <path d="M12 8v8"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </div>

            <h2 class="modal-title">Are You Sure?</h2>
            <p class="modal-message">
                You are about to enter the Transfer Portal Database.
            </p>

            <div class="modal-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <p><strong>This action cannot be undone.</strong> This will make your name visible to other programs.</p>
            </div>

            <div class="modal-actions">
                <button class="btn-modal-cancel" id="modalCancelBtn">Cancel</button>
                <button class="btn-modal-confirm" id="modalConfirmBtn">Yes, Enter Database</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    // Close button handler
    const closeBtn = document.getElementById('modalCloseBtn');
    closeBtn.addEventListener('click', () => {
        modalOverlay.remove();
    });

    // Cancel button handler
    const cancelBtn = document.getElementById('modalCancelBtn');
    cancelBtn.addEventListener('click', () => {
        modalOverlay.remove();
    });

    // Confirm button handler
    const confirmBtn = document.getElementById('modalConfirmBtn');
    confirmBtn.addEventListener('click', () => {
        // Show the info form modal instead of directly entering
        modalOverlay.remove();
        showInfoFormModal();
    });

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.remove();
        }
    });

    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modalOverlay.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

async function showInfoFormModal() {
    // Fetch user's current profile data
    let profileData = {};
    try {
        const response = await API.get('/auth/me');
        if (response.profile) {
            profileData = response.profile;
        }
    } catch (error) {
        console.error('Error fetching profile:', error);
    }

    // Parse existing positions into an array (handles both comma and slash separators)
    const existingPositions = profileData.position ? profileData.position.split(/[,\/]/).map(p => p.trim()).filter(p => p) : [];

    // Parse height if exists (format: "6' 2\"")
    let heightFt = '';
    let heightIn = '';
    if (profileData.height) {
        const heightMatch = profileData.height.match(/(\d+)'\s*(\d+)/);
        if (heightMatch) {
            heightFt = heightMatch[1];
            heightIn = heightMatch[2];
        }
    }

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'portal-modal-overlay';
    modalOverlay.id = 'infoFormOverlay';
    modalOverlay.innerHTML = `
        <div class="portal-modal info-form-modal">
            <button class="modal-close-btn" id="infoFormCloseBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <div class="modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 12h8"></path>
                    <path d="M12 8v8"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </div>

            <h2 class="modal-title">Verify Your Information</h2>
            <!-- Please fill in all required information or make any necessary changes before continuing -->
            <p class="modal-message">
                Please verify and complete all required fields before entering the Transfer Portal Database.
            </p>

            <form id="transferInfoForm" class="transfer-info-form">
                <div class="form-row">
                    <div class="form-group">
                        <label for="transferFirstName">First Name <span class="required">*</span></label>
                        <input type="text" id="transferFirstName" name="firstName" required value="${profileData.first_name || ''}" placeholder="Enter first name">
                    </div>
                    <div class="form-group">
                        <label for="transferLastName">Last Name <span class="required">*</span></label>
                        <input type="text" id="transferLastName" name="lastName" required value="${profileData.last_name || ''}" placeholder="Enter last name">
                    </div>
                </div>

                <div class="form-group">
                    <label>Position(s) <span class="required">*</span></label>
                    <p class="form-hint">Select all positions you play</p>
                    <div class="multi-select-container" id="positionsContainer">
                        <div class="multi-select-group">
                            <h4 class="group-label">Offense - Skill Positions</h4>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="QB" ${existingPositions.includes('QB') ? 'checked' : ''}><span>Quarterback (QB)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="RB" ${existingPositions.includes('RB') ? 'checked' : ''}><span>Running Back (RB)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="FB" ${existingPositions.includes('FB') ? 'checked' : ''}><span>Fullback (FB)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="WR" ${existingPositions.includes('WR') ? 'checked' : ''}><span>Wide Receiver (WR)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="TE" ${existingPositions.includes('TE') ? 'checked' : ''}><span>Tight End (TE)</span></label>
                        </div>
                        <div class="multi-select-group">
                            <h4 class="group-label">Offense - Line</h4>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="OT" ${existingPositions.includes('OT') ? 'checked' : ''}><span>Offensive Tackle (OT)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="OG" ${existingPositions.includes('OG') ? 'checked' : ''}><span>Offensive Guard (OG)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="C" ${existingPositions.includes('C') ? 'checked' : ''}><span>Center (C)</span></label>
                        </div>
                        <div class="multi-select-group">
                            <h4 class="group-label">Defense - Line</h4>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="DE" ${existingPositions.includes('DE') ? 'checked' : ''}><span>Defensive End (DE)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="DT" ${existingPositions.includes('DT') ? 'checked' : ''}><span>Defensive Tackle (DT)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="NT" ${existingPositions.includes('NT') ? 'checked' : ''}><span>Nose Tackle (NT)</span></label>
                        </div>
                        <div class="multi-select-group">
                            <h4 class="group-label">Defense - Linebackers</h4>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="ILB" ${existingPositions.includes('ILB') ? 'checked' : ''}><span>Inside Linebacker (ILB)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="OLB" ${existingPositions.includes('OLB') ? 'checked' : ''}><span>Outside Linebacker (OLB)</span></label>
                        </div>
                        <div class="multi-select-group">
                            <h4 class="group-label">Defense - Secondary</h4>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="CB" ${existingPositions.includes('CB') ? 'checked' : ''}><span>Cornerback (CB)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="S" ${existingPositions.includes('S') ? 'checked' : ''}><span>Safety (S)</span></label>
                        </div>
                        <div class="multi-select-group">
                            <h4 class="group-label">Special Teams</h4>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="K" ${existingPositions.includes('K') ? 'checked' : ''}><span>Kicker (K)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="P" ${existingPositions.includes('P') ? 'checked' : ''}><span>Punter (P)</span></label>
                            <label class="checkbox-label"><input type="checkbox" name="position" value="LS" ${existingPositions.includes('LS') ? 'checked' : ''}><span>Long Snapper (LS)</span></label>
                        </div>
                    </div>
                    <div class="selected-items" id="selectedPositions"></div>
                    <p class="position-error" id="positionError" style="display: none;">Please select at least one position</p>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label>Height <span class="required">*</span></label>
                        <div class="height-inputs">
                            <input type="number" id="transferHeightFt" name="heightFt" min="4" max="7" required value="${heightFt}" placeholder="Ft">
                            <span class="height-separator">'</span>
                            <input type="number" id="transferHeightIn" name="heightIn" min="0" max="11" required value="${heightIn}" placeholder="In">
                            <span class="height-separator">"</span>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="transferWeight">Weight (lbs) <span class="required">*</span></label>
                        <input type="number" id="transferWeight" name="weight" min="100" max="400" required value="${profileData.weight || ''}" placeholder="Enter weight">
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="transferPrevSchool">Previous School <span class="required">*</span></label>
                        <input type="text" id="transferPrevSchool" name="prevSchool" required value="${profileData.high_school || ''}" placeholder="Enter previous school">
                    </div>
                    <div class="form-group">
                        <label for="transferPrevDivision">Previous Division <span class="required">*</span></label>
                        <select id="transferPrevDivision" name="prevDivision" required>
                            <option value="">Select Division</option>
                            <option value="D1 FBS" ${profileData.college_division === 'D1 FBS' ? 'selected' : ''}>D1 FBS</option>
                            <option value="D1 FCS" ${profileData.college_division === 'D1 FCS' ? 'selected' : ''}>D1 FCS</option>
                            <option value="D2" ${profileData.college_division === 'D2' ? 'selected' : ''}>D2</option>
                            <option value="D3" ${profileData.college_division === 'D3' ? 'selected' : ''}>D3</option>
                            <option value="NAIA" ${profileData.college_division === 'NAIA' ? 'selected' : ''}>NAIA</option>
                            <option value="JUCO" ${profileData.college_division === 'JUCO' ? 'selected' : ''}>JUCO</option>
                        </select>
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="transferGPA">GPA <span class="required">*</span></label>
                        <input type="number" id="transferGPA" name="gpa" step="0.01" min="0" max="4.0" required value="${profileData.gpa || ''}" placeholder="e.g. 3.50">
                    </div>
                    <div class="form-group">
                        <label for="transferEligibility">Years of Eligibility <span class="required">*</span></label>
                        <select id="transferEligibility" name="eligibility" required>
                            <option value="">Select Years</option>
                            <option value="1" ${profileData.eligibility == 1 ? 'selected' : ''}>1 Year</option>
                            <option value="2" ${profileData.eligibility == 2 ? 'selected' : ''}>2 Years</option>
                            <option value="3" ${profileData.eligibility == 3 ? 'selected' : ''}>3 Years</option>
                            <option value="4" ${profileData.eligibility == 4 ? 'selected' : ''}>4 Years</option>
                            <option value="5" ${profileData.eligibility == 5 ? 'selected' : ''}>5 Years</option>
                            <option value="6" ${profileData.eligibility == 6 ? 'selected' : ''}>6 Years</option>
                        </select>
                    </div>
                </div>
            </form>

            <div class="modal-actions">
                <button class="btn-modal-cancel" id="infoFormBackBtn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-right: 6px;">
                        <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back
                </button>
                <button class="btn-modal-confirm" id="infoFormContinueBtn">
                    Continue
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; margin-left: 6px;">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    // Setup validation and button states
    const form = document.getElementById('transferInfoForm');
    const continueBtn = document.getElementById('infoFormContinueBtn');
    const positionError = document.getElementById('positionError');

    function validateForm() {
        const firstName = document.getElementById('transferFirstName').value.trim();
        const lastName = document.getElementById('transferLastName').value.trim();
        const heightFt = document.getElementById('transferHeightFt').value;
        const heightIn = document.getElementById('transferHeightIn').value;
        const weight = document.getElementById('transferWeight').value;
        const prevSchool = document.getElementById('transferPrevSchool').value.trim();
        const prevDivision = document.getElementById('transferPrevDivision').value;
        const gpa = document.getElementById('transferGPA').value;
        const eligibility = document.getElementById('transferEligibility').value;
        const positions = document.querySelectorAll('input[name="position"]:checked');

        const isValid = firstName && lastName && heightFt && heightIn !== '' && weight && prevSchool && prevDivision && gpa && eligibility && positions.length > 0;

        continueBtn.disabled = !isValid;

        // Show/hide position error
        if (positions.length === 0) {
            positionError.style.display = 'block';
        } else {
            positionError.style.display = 'none';
        }

        return isValid;
    }

    // Function to update selected positions pills
    function updateSelectedPositions() {
        const container = document.getElementById('selectedPositions');
        if (!container) return;

        container.innerHTML = '';
        const checkedPositions = document.querySelectorAll('input[name="position"]:checked');

        checkedPositions.forEach(checkbox => {
            const pill = document.createElement('div');
            pill.className = 'selected-item';
            pill.innerHTML = `
                ${checkbox.value}
                <button type="button" class="remove-item" data-position="${checkbox.value}">×</button>
            `;
            container.appendChild(pill);
        });

        // Add click handlers to remove buttons
        container.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', function() {
                const position = this.dataset.position;
                const checkbox = document.querySelector(`input[name="position"][value="${position}"]`);
                if (checkbox) {
                    checkbox.checked = false;
                    updateSelectedPositions();
                    validateForm();
                }
            });
        });
    }

    // Add input listeners for validation
    form.addEventListener('input', validateForm);
    form.addEventListener('change', function() {
        validateForm();
        updateSelectedPositions();
    });

    // Initial validation and selected positions display
    validateForm();
    updateSelectedPositions();

    // Close button handler
    document.getElementById('infoFormCloseBtn').addEventListener('click', () => {
        modalOverlay.remove();
    });

    // Back button handler - go back to confirmation modal
    document.getElementById('infoFormBackBtn').addEventListener('click', () => {
        modalOverlay.remove();
        showConfirmationModal();
    });

    // Continue button handler
    continueBtn.addEventListener('click', async () => {
        if (!validateForm()) return;

        // Collect form data
        const firstName = document.getElementById('transferFirstName').value.trim();
        const lastName = document.getElementById('transferLastName').value.trim();
        const heightFt = document.getElementById('transferHeightFt').value;
        const heightIn = document.getElementById('transferHeightIn').value;
        const weight = document.getElementById('transferWeight').value;
        const prevSchool = document.getElementById('transferPrevSchool').value.trim();
        const prevDivision = document.getElementById('transferPrevDivision').value;
        const gpa = document.getElementById('transferGPA').value;
        const eligibility = document.getElementById('transferEligibility').value;
        const positions = Array.from(document.querySelectorAll('input[name="position"]:checked')).map(cb => cb.value);

        const formData = {
            first_name: firstName,
            last_name: lastName,
            position: positions.join('/'),
            height: `${heightFt}' ${heightIn}"`,
            weight: parseInt(weight),
            high_school: prevSchool,
            college_division: prevDivision,
            gpa: parseFloat(gpa),
            eligibility: parseInt(eligibility),
            transfer: 'y'
        };

        modalOverlay.remove();
        await handlePortalEntry(formData);
    });

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.remove();
        }
    });

    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modalOverlay.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

async function handlePortalEntry(formData) {
    try {
        // Update player profile with the form data (includes transfer: 'y')
        const updateResponse = await API.put('/profile', formData);

        if (!updateResponse || updateResponse.error) {
            throw new Error(updateResponse?.error || 'Failed to update profile');
        }

        // Clear checklist state
        localStorage.removeItem(CHECKLIST_STORAGE_KEY);

        // Show the transfer portal transition animation
        showPortalTransition();

    } catch (error) {
        console.error('Error entering transfer portal:', error);
        showNotification('There was an error entering the Transfer Portal Database. Please try again.', 'error');
    }
}

function showPortalTransition() {
    // Create full-screen transition overlay with futuristic design
    const transitionOverlay = document.createElement('div');
    transitionOverlay.className = 'portal-transition-overlay';
    transitionOverlay.innerHTML = `
        <div class="portal-bg-effects">
            <div class="particle particle-1"></div>
            <div class="particle particle-2"></div>
            <div class="particle particle-3"></div>
            <div class="particle particle-4"></div>
            <div class="particle particle-5"></div>
            <div class="particle particle-6"></div>
            <div class="hex-grid"></div>
            <div class="scan-line"></div>
            <div class="energy-ring ring-1"></div>
            <div class="energy-ring ring-2"></div>
            <div class="energy-ring ring-3"></div>
        </div>
        <div class="portal-transition-content">
            <div class="portal-vortex">
                <div class="vortex-ring vortex-1"></div>
                <div class="vortex-ring vortex-2"></div>
                <div class="vortex-ring vortex-3"></div>
                <div class="portal-core">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 12h8"></path>
                        <path d="M12 8v8"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                </div>
            </div>
            <h1 class="portal-transition-title">
                <span class="title-line">INITIATING</span>
                <span class="title-main">TRANSFER PORTAL</span>
            </h1>
            <div class="portal-status-container">
                <div class="status-text"><span class="status-dot"></span>Syncing Profile Data</div>
                <div class="portal-transition-progress">
                    <div class="progress-glow"></div>
                    <div class="portal-transition-bar"></div>
                </div>
                <div class="percentage-text">0%</div>
            </div>
            <p class="portal-transition-text">Preparing your new chapter...</p>
        </div>
    `;

    // Add transition styles
    const style = document.createElement('style');
    style.textContent = `
        .portal-transition-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, #0a1628 0%, #0d2137 50%, #0a1628 100%);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            animation: portalFadeIn 0.8s ease;
            overflow: hidden;
        }

        @keyframes portalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        /* Background Effects */
        .portal-bg-effects {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
        }

        .hex-grid {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-image:
                linear-gradient(30deg, rgba(18, 130, 162, 0.03) 12%, transparent 12.5%, transparent 87%, rgba(18, 130, 162, 0.03) 87.5%, rgba(18, 130, 162, 0.03)),
                linear-gradient(150deg, rgba(18, 130, 162, 0.03) 12%, transparent 12.5%, transparent 87%, rgba(18, 130, 162, 0.03) 87.5%, rgba(18, 130, 162, 0.03)),
                linear-gradient(30deg, rgba(18, 130, 162, 0.03) 12%, transparent 12.5%, transparent 87%, rgba(18, 130, 162, 0.03) 87.5%, rgba(18, 130, 162, 0.03)),
                linear-gradient(150deg, rgba(18, 130, 162, 0.03) 12%, transparent 12.5%, transparent 87%, rgba(18, 130, 162, 0.03) 87.5%, rgba(18, 130, 162, 0.03));
            background-size: 80px 140px;
            background-position: 0 0, 0 0, 40px 70px, 40px 70px;
            animation: hexPulse 4s ease-in-out infinite;
        }

        @keyframes hexPulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
        }

        .scan-line {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, transparent, rgba(18, 130, 162, 0.8), transparent);
            animation: scanMove 2s linear infinite;
            box-shadow: 0 0 20px rgba(18, 130, 162, 0.5);
        }

        @keyframes scanMove {
            0% { top: 0; }
            100% { top: 100%; }
        }

        .particle {
            position: absolute;
            width: 4px;
            height: 4px;
            border-radius: 50%;
            background: #1282a2;
            box-shadow: 0 0 10px #1282a2, 0 0 20px #1282a2;
        }

        .particle-1 { top: 20%; left: 10%; animation: float 6s ease-in-out infinite, colorParticle 3s ease forwards 2s; }
        .particle-2 { top: 60%; left: 85%; animation: float 5s ease-in-out infinite 0.5s, colorParticle 3s ease forwards 2s; }
        .particle-3 { top: 80%; left: 20%; animation: float 7s ease-in-out infinite 1s, colorParticle 3s ease forwards 2s; }
        .particle-4 { top: 30%; left: 75%; animation: float 4s ease-in-out infinite 1.5s, colorParticle 3s ease forwards 2s; }
        .particle-5 { top: 70%; left: 50%; animation: float 6s ease-in-out infinite 2s, colorParticle 3s ease forwards 2s; }
        .particle-6 { top: 10%; left: 60%; animation: float 5s ease-in-out infinite 0.8s, colorParticle 3s ease forwards 2s; }

        @keyframes float {
            0%, 100% { transform: translateY(0) translateX(0); opacity: 0.6; }
            25% { transform: translateY(-30px) translateX(10px); opacity: 1; }
            50% { transform: translateY(-10px) translateX(-10px); opacity: 0.8; }
            75% { transform: translateY(-40px) translateX(5px); opacity: 1; }
        }

        @keyframes colorParticle {
            0% { background: #1282a2; box-shadow: 0 0 10px #1282a2, 0 0 20px #1282a2; }
            100% { background: #dc2626; box-shadow: 0 0 10px #dc2626, 0 0 20px #dc2626; }
        }

        .energy-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            border-radius: 50%;
            border: 1px solid rgba(18, 130, 162, 0.3);
            animation: ringExpand 3s ease-out infinite;
        }

        .ring-1 { width: 200px; height: 200px; animation-delay: 0s; }
        .ring-2 { width: 200px; height: 200px; animation-delay: 1s; }
        .ring-3 { width: 200px; height: 200px; animation-delay: 2s; }

        @keyframes ringExpand {
            0% { width: 200px; height: 200px; opacity: 0.8; border-color: rgba(18, 130, 162, 0.5); }
            100% { width: 800px; height: 800px; opacity: 0; border-color: rgba(220, 38, 38, 0.3); }
        }

        /* Main Content */
        .portal-transition-content {
            text-align: center;
            padding: 2rem;
            position: relative;
            z-index: 10;
        }

        /* Vortex Portal Effect */
        .portal-vortex {
            width: 180px;
            height: 180px;
            margin: 0 auto 2.5rem;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .vortex-ring {
            position: absolute;
            top: 50%;
            left: 50%;
            border-radius: 50%;
            border: 2px solid;
            animation: vortexSpin 3s linear infinite;
        }

        .vortex-1 {
            width: 180px;
            height: 180px;
            margin-top: -90px;
            margin-left: -90px;
            border-color: rgba(18, 130, 162, 0.6);
            animation-duration: 3s;
            box-shadow: 0 0 30px rgba(18, 130, 162, 0.3), inset 0 0 30px rgba(18, 130, 162, 0.1);
        }

        .vortex-2 {
            width: 140px;
            height: 140px;
            margin-top: -70px;
            margin-left: -70px;
            border-color: rgba(18, 130, 162, 0.8);
            animation-duration: 2.5s;
            animation-direction: reverse;
            box-shadow: 0 0 20px rgba(18, 130, 162, 0.4);
        }

        .vortex-3 {
            width: 100px;
            height: 100px;
            margin-top: -50px;
            margin-left: -50px;
            border-color: rgba(18, 130, 162, 1);
            animation-duration: 2s;
            box-shadow: 0 0 15px rgba(18, 130, 162, 0.5);
        }

        @keyframes vortexSpin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .portal-core {
            width: 70px;
            height: 70px;
            background: linear-gradient(135deg, rgba(18, 130, 162, 0.3), rgba(18, 130, 162, 0.1));
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #1282a2;
            box-shadow: 0 0 40px rgba(18, 130, 162, 0.5), inset 0 0 20px rgba(18, 130, 162, 0.3);
            animation: corePulse 1.5s ease-in-out infinite, coreColorShift 3s ease forwards 2s;
            position: relative;
            z-index: 5;
        }

        .portal-core svg {
            width: 40px;
            height: 40px;
            filter: drop-shadow(0 0 10px currentColor);
        }

        @keyframes corePulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.1); }
        }

        @keyframes coreColorShift {
            0% {
                background: linear-gradient(135deg, rgba(18, 130, 162, 0.3), rgba(18, 130, 162, 0.1));
                color: #1282a2;
                box-shadow: 0 0 40px rgba(18, 130, 162, 0.5), inset 0 0 20px rgba(18, 130, 162, 0.3);
            }
            100% {
                background: linear-gradient(135deg, rgba(220, 38, 38, 0.3), rgba(220, 38, 38, 0.1));
                color: #dc2626;
                box-shadow: 0 0 40px rgba(220, 38, 38, 0.5), inset 0 0 20px rgba(220, 38, 38, 0.3);
            }
        }

        /* Title */
        .portal-transition-title {
            margin-bottom: 2rem;
            font-family: 'Inter', sans-serif;
        }

        .title-line {
            display: block;
            font-size: 0.9rem;
            font-weight: 600;
            letter-spacing: 8px;
            color: #1282a2;
            margin-bottom: 0.5rem;
            animation: titleColorShift 3s ease forwards 2s;
        }

        .title-main {
            display: block;
            font-size: 2.5rem;
            font-weight: 900;
            letter-spacing: 4px;
            color: white;
            text-shadow: 0 0 30px rgba(18, 130, 162, 0.5);
            animation: titleGlow 3s ease forwards 2s;
        }

        @keyframes titleColorShift {
            0% { color: #1282a2; }
            100% { color: #dc2626; }
        }

        @keyframes titleGlow {
            0% { text-shadow: 0 0 30px rgba(18, 130, 162, 0.5); }
            100% { text-shadow: 0 0 30px rgba(220, 38, 38, 0.5); }
        }

        /* Status & Progress */
        .portal-status-container {
            margin-bottom: 1.5rem;
        }

        .status-text {
            font-size: 0.85rem;
            color: rgba(255, 255, 255, 0.7);
            font-family: 'Inter', sans-serif;
            margin-bottom: 0.75rem;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            background: #1282a2;
            border-radius: 50%;
            animation: dotPulse 1s ease-in-out infinite, dotColorShift 3s ease forwards 2s;
        }

        @keyframes dotPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
        }

        @keyframes dotColorShift {
            0% { background: #1282a2; box-shadow: 0 0 10px #1282a2; }
            100% { background: #dc2626; box-shadow: 0 0 10px #dc2626; }
        }

        .portal-transition-progress {
            width: 350px;
            height: 8px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 4px;
            margin: 0 auto 0.75rem;
            overflow: visible;
            position: relative;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .progress-glow {
            position: absolute;
            top: -5px;
            left: 0;
            width: 0%;
            height: 18px;
            background: linear-gradient(90deg, transparent, rgba(18, 130, 162, 0.3), transparent);
            border-radius: 4px;
            animation: progressGlow 3.5s ease forwards;
            filter: blur(8px);
        }

        .portal-transition-bar {
            height: 100%;
            width: 0%;
            border-radius: 4px;
            animation: portalProgress 3.5s ease forwards;
            position: relative;
            overflow: hidden;
        }

        .portal-transition-bar::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
            animation: shimmer 1.5s linear infinite;
        }

        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }

        @keyframes portalProgress {
            0% {
                width: 0%;
                background: linear-gradient(90deg, #1282a2, #14b8a6);
                box-shadow: 0 0 20px rgba(18, 130, 162, 0.5);
            }
            40% {
                width: 40%;
                background: linear-gradient(90deg, #1282a2, #8b5cf6);
                box-shadow: 0 0 20px rgba(139, 92, 246, 0.5);
            }
            70% {
                width: 70%;
                background: linear-gradient(90deg, #8b5cf6, #ec4899);
                box-shadow: 0 0 20px rgba(236, 72, 153, 0.5);
            }
            100% {
                width: 100%;
                background: linear-gradient(90deg, #ec4899, #dc2626);
                box-shadow: 0 0 20px rgba(220, 38, 38, 0.5);
            }
        }

        @keyframes progressGlow {
            0% { width: 0%; background: linear-gradient(90deg, transparent, rgba(18, 130, 162, 0.5), transparent); }
            100% { width: 100%; background: linear-gradient(90deg, transparent, rgba(220, 38, 38, 0.5), transparent); }
        }

        .percentage-text {
            font-size: 0.8rem;
            font-weight: 700;
            color: #1282a2;
            font-family: 'Inter', monospace;
            letter-spacing: 2px;
            animation: percentColorShift 3.5s ease forwards;
        }

        @keyframes percentColorShift {
            0% { color: #1282a2; }
            40% { color: #8b5cf6; }
            70% { color: #ec4899; }
            100% { color: #dc2626; }
        }

        .portal-transition-text {
            font-size: 1rem;
            color: rgba(255, 255, 255, 0.6);
            font-family: 'Inter', sans-serif;
            font-style: italic;
        }

        /* Completion State */
        .portal-transition-overlay.complete {
            animation: completeFlash 0.5s ease;
        }

        @keyframes completeFlash {
            0%, 100% { background: linear-gradient(135deg, #0a1628 0%, #1a0a0a 50%, #0a1628 100%); }
            50% { background: linear-gradient(135deg, #1a0a0a 0%, #2d0a0a 50%, #1a0a0a 100%); }
        }

        .portal-transition-overlay.complete .vortex-1,
        .portal-transition-overlay.complete .vortex-2,
        .portal-transition-overlay.complete .vortex-3 {
            border-color: rgba(220, 38, 38, 0.8);
            box-shadow: 0 0 30px rgba(220, 38, 38, 0.4);
        }

        .portal-transition-overlay.complete .hex-grid {
            background-image:
                linear-gradient(30deg, rgba(220, 38, 38, 0.05) 12%, transparent 12.5%, transparent 87%, rgba(220, 38, 38, 0.05) 87.5%, rgba(220, 38, 38, 0.05)),
                linear-gradient(150deg, rgba(220, 38, 38, 0.05) 12%, transparent 12.5%, transparent 87%, rgba(220, 38, 38, 0.05) 87.5%, rgba(220, 38, 38, 0.05)),
                linear-gradient(30deg, rgba(220, 38, 38, 0.05) 12%, transparent 12.5%, transparent 87%, rgba(220, 38, 38, 0.05) 87.5%, rgba(220, 38, 38, 0.05)),
                linear-gradient(150deg, rgba(220, 38, 38, 0.05) 12%, transparent 12.5%, transparent 87%, rgba(220, 38, 38, 0.05) 87.5%, rgba(220, 38, 38, 0.05));
        }

        .portal-transition-overlay.complete .scan-line {
            background: linear-gradient(90deg, transparent, rgba(220, 38, 38, 0.8), transparent);
            box-shadow: 0 0 20px rgba(220, 38, 38, 0.5);
        }

        .portal-transition-overlay.complete .title-line {
            color: #dc2626 !important;
        }

        .portal-transition-overlay.complete .title-main {
            text-shadow: 0 0 30px rgba(220, 38, 38, 0.5) !important;
            animation: completeTitlePulse 0.5s ease;
        }

        @keyframes completeTitlePulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
    `;
    document.head.appendChild(style);
    document.body.appendChild(transitionOverlay);

    // Animate percentage counter
    const percentText = transitionOverlay.querySelector('.percentage-text');
    const statusText = transitionOverlay.querySelector('.status-text');
    let progress = 0;
    const statusMessages = [
        { at: 0, text: 'Syncing Profile Data' },
        { at: 25, text: 'Connecting to Portal Network' },
        { at: 50, text: 'Transferring Credentials' },
        { at: 75, text: 'Finalizing Database Entry' },
        { at: 95, text: 'Almost There...' }
    ];

    const progressInterval = setInterval(() => {
        progress += 1;
        if (progress <= 100) {
            percentText.textContent = progress + '%';
            const statusMsg = statusMessages.filter(s => s.at <= progress).pop();
            if (statusMsg) {
                statusText.innerHTML = `<span class="status-dot"></span>${statusMsg.text}`;
            }
        }
        if (progress >= 100) {
            clearInterval(progressInterval);
        }
    }, 35);

    // After progress completes, show completion state (stays on red welcome screen longer)
    setTimeout(() => {
        transitionOverlay.classList.add('complete');
        transitionOverlay.querySelector('.title-line').textContent = 'WELCOME TO THE';
        transitionOverlay.querySelector('.title-main').textContent = 'TRANSFER PORTAL';
        transitionOverlay.querySelector('.portal-transition-text').textContent = 'Your new chapter begins now...';
        statusText.innerHTML = `<span class="status-dot"></span>Transfer Complete`;
    }, 3600);

    // Redirect after animation completes - longer delay for red welcome screen
    setTimeout(() => {
        window.location.href = '../../transferplayer/tabs/transfer-portal.html';
    }, 7000);
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 10px;
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        font-size: 0.95rem;
        z-index: 2000;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
    `;

    if (type === 'success') {
        notification.style.background = 'linear-gradient(135deg, #22c55e, #16a34a)';
        notification.style.color = 'white';
    } else if (type === 'error') {
        notification.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
        notification.style.color = 'white';
    } else {
        notification.style.background = 'linear-gradient(135deg, #1282a2, #0f6a85)';
        notification.style.color = 'white';
    }

    notification.textContent = message;
    document.body.appendChild(notification);

    // Add animation styles if not already present
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
        `;
        document.head.appendChild(style);
    }

    // Remove after 5 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        notification.style.transition = 'all 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 5000);
}
