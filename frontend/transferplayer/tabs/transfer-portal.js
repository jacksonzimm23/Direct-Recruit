// Transfer Portal JavaScript - Transfer Player Welcome Page

// Module-level storage for current player data (used by card preview and stats modal)
let currentPlayerData = null;

document.addEventListener('DOMContentLoaded', async function() {
    // Check if coming from portal entry (show welcome animation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('welcome') === 'true' || document.referrer.includes('collegeplayer')) {
        showWelcomeAnimation();
    }

    // Initialize leave portal button
    initLeavePortalButton();

    // Initialize edit card stats button
    const editStatsBtn = document.getElementById('editCardStatsBtn');
    if (editStatsBtn) {
        editStatsBtn.addEventListener('click', function() {
            showEditCardStatsModal();
        });
    }

    // Load and display the player's portal card preview
    await loadPlayerCardPreview();
});

function initLeavePortalButton() {
    const leaveBtn = document.getElementById('leavePortalBtn');

    if (leaveBtn) {
        leaveBtn.addEventListener('click', function() {
            showLeavePortalModal();
        });
    }
}

function showLeavePortalModal() {
    // Create modal overlay (matching collegeplayer portal-modal style)
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
                You will be redirected to Settings to switch your profile type and leave the Transfer Portal.
            </p>

            <div class="modal-warning">
                <p><strong>This will change your profile type.</strong> You can switch your profile type in Settings.</p>
            </div>

            <div class="modal-actions">
                <button class="btn-modal-cancel" id="modalCancelBtn">Cancel</button>
                <button class="btn-modal-confirm" id="modalConfirmBtn">Yes, Leave Portal</button>
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

    // Confirm button handler — redirect to Settings Profile Type section
    const confirmBtn = document.getElementById('modalConfirmBtn');
    confirmBtn.addEventListener('click', () => {
        modalOverlay.remove();
        window.location.href = 'settings.html#profile-type';
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

// All football positions for the stats modal dropdown
const allPositions = [
    'QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C',
    'DE', 'DT', 'NT', 'OLB', 'MLB', 'ILB',
    'CB', 'FS', 'SS', 'K', 'P', 'LS', 'ATH'
];

function showEditCardStatsModal() {
    if (!currentPlayerData) return;

    // Determine current primary position
    const currentPosition = currentPlayerData.position
        ? currentPlayerData.position.split(/[,\/]/)[0].trim().toUpperCase()
        : '';

    // Build position options
    const positionOptions = allPositions.map(pos => {
        const selected = pos === currentPosition ? 'selected' : '';
        const fullName = positionNames[pos] || pos;
        return `<option value="${pos}" ${selected}>${fullName}</option>`;
    }).join('');

    // Get initial stat labels
    const initialLabels = getStatLabelsForPosition(currentPosition);

    // Build stat inputs HTML
    function buildStatsInputsHTML(labels) {
        if (!labels) {
            return `<div class="stats-modal-no-stats">No stats available for this position.</div>`;
        }
        return `
            <div class="stats-modal-group">
                <h5 class="stats-modal-subtitle">Last Season Stats</h5>
                <div class="stats-form-row">
                    <div class="stats-form-field">
                        <label class="stats-label" id="modalLabelLS1">${labels[0]}</label>
                        <input type="text" id="modalLastSeason1" placeholder="0" value="${currentPlayerData.lastseasonstat1 || ''}">
                    </div>
                    <div class="stats-form-field">
                        <label class="stats-label" id="modalLabelLS2">${labels[1]}</label>
                        <input type="text" id="modalLastSeason2" placeholder="0" value="${currentPlayerData.lastseasonstat2 || ''}">
                    </div>
                    <div class="stats-form-field">
                        <label class="stats-label" id="modalLabelLS3">${labels[2]}</label>
                        <input type="text" id="modalLastSeason3" placeholder="0" value="${currentPlayerData.lastseasonstat3 || ''}">
                    </div>
                </div>
            </div>
            <div class="stats-modal-group">
                <h5 class="stats-modal-subtitle">Career Stats</h5>
                <div class="stats-form-row">
                    <div class="stats-form-field">
                        <label class="stats-label" id="modalLabelC1">${labels[0]}</label>
                        <input type="text" id="modalCareer1" placeholder="0" value="${currentPlayerData.careerstat1 || ''}">
                    </div>
                    <div class="stats-form-field">
                        <label class="stats-label" id="modalLabelC2">${labels[1]}</label>
                        <input type="text" id="modalCareer2" placeholder="0" value="${currentPlayerData.careerstat2 || ''}">
                    </div>
                    <div class="stats-form-field">
                        <label class="stats-label" id="modalLabelC3">${labels[2]}</label>
                        <input type="text" id="modalCareer3" placeholder="0" value="${currentPlayerData.careerstat3 || ''}">
                    </div>
                </div>
            </div>
        `;
    }

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'portal-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="portal-modal stats-modal">
            <button class="portal-modal-close" id="statsModalClose">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <div class="portal-modal-icon stats-modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    <line x1="9" y1="10" x2="15" y2="10"></line>
                    <line x1="9" y1="14" x2="15" y2="14"></line>
                    <line x1="9" y1="18" x2="13" y2="18"></line>
                </svg>
            </div>
            <h3 class="portal-modal-title">Edit Player Card Stats</h3>
            <p class="portal-modal-text">These stats appear on your transfer portal player card visible to college coaches.</p>

            <div class="stats-modal-position">
                <label class="stats-label">Position (determines stat labels)</label>
                <select id="statsModalPosition">
                    <option value="">Select Position</option>
                    ${positionOptions}
                </select>
            </div>

            <div id="statsModalInputs">
                ${buildStatsInputsHTML(initialLabels)}
            </div>

            <div class="stats-modal-actions">
                <button class="stats-modal-cancel" id="statsModalCancel">Cancel</button>
                <button class="stats-modal-save" id="statsModalSave">Save Stats</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    // Animate in
    requestAnimationFrame(() => {
        modalOverlay.classList.add('active');
    });

    // Position change handler — update stat labels
    const positionSelect = document.getElementById('statsModalPosition');
    positionSelect.addEventListener('change', () => {
        const inputsContainer = document.getElementById('statsModalInputs');
        const newLabels = getStatLabelsForPosition(positionSelect.value);
        inputsContainer.innerHTML = buildStatsInputsHTML(newLabels);
    });

    // Close handlers
    function closeModal() {
        modalOverlay.classList.remove('active');
        setTimeout(() => modalOverlay.remove(), 200);
        document.removeEventListener('keydown', handleEscape);
    }

    document.getElementById('statsModalClose').addEventListener('click', closeModal);
    document.getElementById('statsModalCancel').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    const handleEscape = (e) => {
        if (e.key === 'Escape') closeModal();
    };
    document.addEventListener('keydown', handleEscape);

    // Save handler
    document.getElementById('statsModalSave').addEventListener('click', async () => {
        const saveBtn = document.getElementById('statsModalSave');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const formData = {
                lastseasonstat1: document.getElementById('modalLastSeason1')?.value || null,
                lastseasonstat2: document.getElementById('modalLastSeason2')?.value || null,
                lastseasonstat3: document.getElementById('modalLastSeason3')?.value || null,
                careerstat1: document.getElementById('modalCareer1')?.value || null,
                careerstat2: document.getElementById('modalCareer2')?.value || null,
                careerstat3: document.getElementById('modalCareer3')?.value || null
            };

            await API.put('/profile', formData);

            // Update local data and refresh card preview
            Object.assign(currentPlayerData, formData);
            const cardWrapper = document.getElementById('playerCardWrapper');
            if (cardWrapper) {
                cardWrapper.innerHTML = createPreviewPlayerCard(currentPlayerData);
            }

            closeModal();
        } catch (error) {
            console.error('Error saving card stats:', error);
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Stats';
        }
    });
}

function showWelcomeAnimation() {
    // Add entrance animation class
    const welcomeSection = document.querySelector('.portal-welcome-section');
    if (welcomeSection) {
        welcomeSection.style.animation = 'welcomeFadeIn 1s ease forwards';
    }

    // Add styles for welcome animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes welcomeFadeIn {
            0% {
                opacity: 0;
                transform: translateY(20px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .portal-info-card {
            opacity: 0;
            animation: cardSlideIn 0.6s ease forwards;
        }

        .portal-info-card:nth-child(1) { animation-delay: 0.3s; }
        .portal-info-card:nth-child(2) { animation-delay: 0.5s; }
        .portal-info-card:nth-child(3) { animation-delay: 0.7s; }

        @keyframes cardSlideIn {
            0% {
                opacity: 0;
                transform: translateY(30px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .portal-action-btn {
            opacity: 0;
            animation: actionFadeIn 0.5s ease forwards;
            animation-delay: 1s;
        }

        @keyframes actionFadeIn {
            0% {
                opacity: 0;
            }
            100% {
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// Load and display the player's portal card preview
async function loadPlayerCardPreview() {
    const cardWrapper = document.getElementById('playerCardWrapper');
    if (!cardWrapper) return;

    try {
        if (typeof ensureSchoolLogosLoaded === 'function') {
            await ensureSchoolLogosLoaded('../../assets');
        }
        const response = await API.get('/auth/me');
        if (response.profile) {
            currentPlayerData = response.profile;
            const cardHTML = createPreviewPlayerCard(currentPlayerData);
            cardWrapper.innerHTML = cardHTML;
        }
    } catch (error) {
        console.error('Error loading player card preview:', error);
        cardWrapper.innerHTML = `
            <div class="loading-card">
                <p>Unable to load your card preview</p>
            </div>
        `;
    }
}

// Helper function to format height
function formatHeight(height) {
    if (!height) return 'N/A';
    if (typeof height === 'string' && (height.includes("'") || height.includes('"'))) {
        return height;
    }
    if (typeof height === 'number' || !isNaN(parseInt(height))) {
        const totalInches = parseInt(height);
        const feet = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        return `${feet}'${inches}"`;
    }
    return height;
}

// Helper function to format division
function formatDivision(division) {
    if (!division) return '';
    const div = division.toUpperCase();
    if (div === 'D1 FBS' || div === 'FBS' || div === 'DIVISION I FBS') return 'D1 FBS';
    if (div === 'D1 FCS' || div === 'FCS' || div === 'DIVISION I FCS') return 'D1 FCS';
    if (div === 'D2' || div === 'DIVISION II') return 'D2';
    if (div === 'D3' || div === 'DIVISION III') return 'D3';
    if (div === 'NAIA') return 'NAIA';
    if (div === 'NJCAA' || div === 'JUCO') return 'JUCO';
    return division;
}

// Position name mapping for full display names
const positionNames = {
    'QB': 'Quarterback (QB)',
    'RB': 'Running Back (RB)',
    'FB': 'Fullback (FB)',
    'WR': 'Wide Receiver (WR)',
    'TE': 'Tight End (TE)',
    'OT': 'Offensive Tackle (OT)',
    'OG': 'Offensive Guard (OG)',
    'C': 'Center (C)',
    'DE': 'Defensive End (DE)',
    'DT': 'Defensive Tackle (DT)',
    'NT': 'Nose Tackle (NT)',
    'OLB': 'Outside Linebacker (OLB)',
    'MLB': 'Middle Linebacker (MLB)',
    'ILB': 'Inside Linebacker (ILB)',
    'CB': 'Cornerback (CB)',
    'FS': 'Free Safety (FS)',
    'SS': 'Strong Safety (SS)',
    'K': 'Kicker (K)',
    'P': 'Punter (P)',
    'LS': 'Long Snapper (LS)',
    'ATH': 'Athlete (ATH)'
};

// Helper function to format positions
function formatPositions(positionStr) {
    if (!positionStr) return '';
    const positions = positionStr.split('/').map(p => p.trim()).filter(p => p);
    return positions.map(pos => {
        const fullName = positionNames[pos.toUpperCase()] || pos;
        return `<span class="position-badge">${fullName}</span>`;
    }).join('');
}

// Get stat labels based on position
// Matches the stats shown in collegecoach transfer-portal.js
function getStatLabelsForPosition(position) {
    if (!position) return null;
    const pos = position.toUpperCase();

    if (pos.includes('QB')) {
        return ['Total Yards', 'Total TDs', 'INT'];
    } else if (pos.includes('RB') || pos.includes('FB')) {
        return ['Total Yards', 'Rec', 'Total TDs'];
    } else if (pos.includes('WR') || pos.includes('TE')) {
        return ['Rec', 'Rec Yards', 'Total TDs'];
    } else if (pos.includes('OL') || pos.includes('OT') || pos.includes('OG') || pos.includes('C') || pos.includes('LS')) {
        return null; // No stats for OL and LS positions
    } else if (pos.includes('DL') || pos.includes('DE') || pos.includes('DT') || pos.includes('NT')) {
        return ['Tackles', 'TFLs', 'Sacks'];
    } else if (pos.includes('LB') || pos.includes('ILB') || pos.includes('OLB') || pos.includes('MLB')) {
        return ['Tackles', 'TFLs', 'Sacks'];
    } else if (pos.includes('CB') || pos.includes('S') || pos.includes('DB') || pos.includes('FS') || pos.includes('SS')) {
        return ['Tackles', 'PBUs', 'INTs'];
    } else if (pos.includes('K')) {
        return ['Made', 'Att', 'Long'];
    } else if (pos.includes('P')) {
        return ['Att', 'Avg', 'I20'];
    }

    return null;
}

// Create the preview player card HTML (row format matching collegecoach transfer portal)
function createPreviewPlayerCard(player) {
    const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
    const height = formatHeight(player.height);
    const weight = player.weight ? `${player.weight} lbs` : '';
    const eligibility = player.eligibility ? `YOE: ${player.eligibility} year${player.eligibility > 1 ? 's' : ''}` : '';
    const position = player.position ? player.position.split(/[,\/]/).map(p => p.trim()).filter(p => p).join('/') : '';
    const previousSchool = player.team_name || '';
    const division = formatDivision(player.college_division);
    const profileImage = player.profile_image_url;
    const logoHtml = (typeof getSchoolLogoHTML === 'function') ? getSchoolLogoHTML(previousSchool, '../../assets', 16) : '';

    // Line 2: Position • Height • Weight • YOE
    const line2Parts = [position, height, weight, eligibility].filter(p => p);
    // Line 3: Previously: School (Division)
    const line3 = previousSchool ? `<span class="stats-line-label">Previously:</span> ${previousSchool}${division ? ` (${division})` : ''}` : '';

    // Stat lines
    const statLabels = getStatLabelsForPosition(player.position);
    let lastSeasonHtml = '';
    let careerHtml = '';
    if (statLabels) {
        const ls1 = player.lastseasonstat1 != null ? player.lastseasonstat1 : '-';
        const ls2 = player.lastseasonstat2 != null ? player.lastseasonstat2 : '-';
        const ls3 = player.lastseasonstat3 != null ? player.lastseasonstat3 : '-';
        lastSeasonHtml = `<div class="preview-row-stats-line"><span class="preview-row-stats-label">Last Season:</span> ${statLabels[0]}: ${ls1} • ${statLabels[1]}: ${ls2} • ${statLabels[2]}: ${ls3}</div>`;

        const cs1 = player.careerstat1 != null ? player.careerstat1 : '-';
        const cs2 = player.careerstat2 != null ? player.careerstat2 : '-';
        const cs3 = player.careerstat3 != null ? player.careerstat3 : '-';
        careerHtml = `<div class="preview-row-stats-line"><span class="preview-row-stats-label">Career:</span> ${statLabels[0]}: ${cs1} • ${statLabels[1]}: ${cs2} • ${statLabels[2]}: ${cs3}</div>`;
    }

    return `
        <div class="preview-player-row">
            <div class="preview-row-avatar">
                ${profileImage
                    ? `<img src="${profileImage}" alt="${displayName}">`
                    : `<svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>`
                }
            </div>
            <div class="preview-row-info">
                <div class="preview-row-name">${displayName} ${logoHtml}</div>
                <div class="preview-row-line2">${line2Parts.join(' • ')}</div>
                <div class="preview-row-line3">${line3}</div>
                ${lastSeasonHtml}
                ${careerHtml}
            </div>
        </div>
    `;
}
