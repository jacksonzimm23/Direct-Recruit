// Transfer Portal JavaScript - Transfer Player Welcome Page

document.addEventListener('DOMContentLoaded', async function() {
    // Check if coming from portal entry (show welcome animation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('welcome') === 'true' || document.referrer.includes('collegeplayer')) {
        showWelcomeAnimation();
    }

    // Leave Portal Popup functionality
    initLeavePortalPopup();

    // Initialize leave portal form
    initLeavePortalForm();

    // Populate state dropdown and pre-fill with current state
    await populateStateDropdown();

    // Load and display the player's portal card preview
    await loadPlayerCardPreview();
});

function initLeavePortalPopup() {
    const leaveBtn = document.getElementById('leavePortalBtn');
    const overlay = document.getElementById('leavePortalOverlay');
    const closeBtn = document.getElementById('leavePortalClose');

    if (leaveBtn && overlay) {
        // Open popup when button is clicked
        leaveBtn.addEventListener('click', function() {
            overlay.classList.add('active');
        });

        // Close popup when close button is clicked
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                overlay.classList.remove('active');
            });
        }

        // Close popup when clicking outside
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });

        // Close popup on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                overlay.classList.remove('active');
            }
        });
    }
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

// Store form data for confirmation
let pendingFormData = null;

function initLeavePortalForm() {
    const form = document.getElementById('leavePortalForm');
    const confirmOverlay = document.getElementById('confirmOverlay');
    const confirmCancel = document.getElementById('confirmCancel');
    const confirmYes = document.getElementById('confirmYes');

    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            // Store form data
            pendingFormData = {
                team_name: document.getElementById('newSchool').value,
                state: document.getElementById('newState').value,
                college_division: document.getElementById('newDivision').value
            };

            // Show confirmation popup
            if (confirmOverlay) {
                confirmOverlay.classList.add('active');
            }
        });
    }

    // Cancel button
    if (confirmCancel) {
        confirmCancel.addEventListener('click', function() {
            confirmOverlay.classList.remove('active');
            pendingFormData = null;
        });
    }

    // Confirm button
    if (confirmYes) {
        confirmYes.addEventListener('click', async function() {
            if (pendingFormData) {
                await submitLeavePortal(pendingFormData);
            }
        });
    }

    // Close confirmation on overlay click
    if (confirmOverlay) {
        confirmOverlay.addEventListener('click', function(e) {
            if (e.target === confirmOverlay) {
                confirmOverlay.classList.remove('active');
                pendingFormData = null;
            }
        });
    }
}

async function submitLeavePortal(data) {
    const confirmYes = document.getElementById('confirmYes');
    const originalText = confirmYes.textContent;

    try {
        confirmYes.textContent = 'Saving...';
        confirmYes.disabled = true;

        // Update profile with new school info and remove from portal
        // transfer column uses 'y' for in portal, null/empty to leave
        const response = await API.put('/profile', {
            team_name: data.team_name,
            state: data.state,
            college_division: data.college_division,
            transfer: null
        });

        // Close popups
        document.getElementById('confirmOverlay').classList.remove('active');
        document.getElementById('leavePortalOverlay').classList.remove('active');

        // Redirect to collegeplayer mainpage (since they now have a college_division)
        window.location.href = '../../collegeplayer/mainpage-player.html';

    } catch (error) {
        console.error('Error leaving portal:', error);
        alert('Failed to update profile. Please try again.');
        confirmYes.textContent = originalText;
        confirmYes.disabled = false;
    }
}

async function populateStateDropdown() {
    const stateSelect = document.getElementById('newState');
    if (!stateSelect) return;

    // Use abbreviations for values to match database format
    const states = [
        { abbr: 'AL', name: 'Alabama' },
        { abbr: 'AK', name: 'Alaska' },
        { abbr: 'AZ', name: 'Arizona' },
        { abbr: 'AR', name: 'Arkansas' },
        { abbr: 'CA', name: 'California' },
        { abbr: 'CO', name: 'Colorado' },
        { abbr: 'CT', name: 'Connecticut' },
        { abbr: 'DE', name: 'Delaware' },
        { abbr: 'FL', name: 'Florida' },
        { abbr: 'GA', name: 'Georgia' },
        { abbr: 'HI', name: 'Hawaii' },
        { abbr: 'ID', name: 'Idaho' },
        { abbr: 'IL', name: 'Illinois' },
        { abbr: 'IN', name: 'Indiana' },
        { abbr: 'IA', name: 'Iowa' },
        { abbr: 'KS', name: 'Kansas' },
        { abbr: 'KY', name: 'Kentucky' },
        { abbr: 'LA', name: 'Louisiana' },
        { abbr: 'ME', name: 'Maine' },
        { abbr: 'MD', name: 'Maryland' },
        { abbr: 'MA', name: 'Massachusetts' },
        { abbr: 'MI', name: 'Michigan' },
        { abbr: 'MN', name: 'Minnesota' },
        { abbr: 'MS', name: 'Mississippi' },
        { abbr: 'MO', name: 'Missouri' },
        { abbr: 'MT', name: 'Montana' },
        { abbr: 'NE', name: 'Nebraska' },
        { abbr: 'NV', name: 'Nevada' },
        { abbr: 'NH', name: 'New Hampshire' },
        { abbr: 'NJ', name: 'New Jersey' },
        { abbr: 'NM', name: 'New Mexico' },
        { abbr: 'NY', name: 'New York' },
        { abbr: 'NC', name: 'North Carolina' },
        { abbr: 'ND', name: 'North Dakota' },
        { abbr: 'OH', name: 'Ohio' },
        { abbr: 'OK', name: 'Oklahoma' },
        { abbr: 'OR', name: 'Oregon' },
        { abbr: 'PA', name: 'Pennsylvania' },
        { abbr: 'RI', name: 'Rhode Island' },
        { abbr: 'SC', name: 'South Carolina' },
        { abbr: 'SD', name: 'South Dakota' },
        { abbr: 'TN', name: 'Tennessee' },
        { abbr: 'TX', name: 'Texas' },
        { abbr: 'UT', name: 'Utah' },
        { abbr: 'VT', name: 'Vermont' },
        { abbr: 'VA', name: 'Virginia' },
        { abbr: 'WA', name: 'Washington' },
        { abbr: 'WV', name: 'West Virginia' },
        { abbr: 'WI', name: 'Wisconsin' },
        { abbr: 'WY', name: 'Wyoming' }
    ];

    states.forEach(state => {
        const option = document.createElement('option');
        option.value = state.abbr;
        option.textContent = state.name;
        stateSelect.appendChild(option);
    });

    // Pre-fill state from current profile if available
    try {
        const response = await API.get('/auth/me');
        if (response.profile && response.profile.state) {
            stateSelect.value = response.profile.state;
        }
    } catch (error) {
        console.error('Error fetching profile for state pre-fill:', error);
    }
}

// Load and display the player's portal card preview
async function loadPlayerCardPreview() {
    const cardWrapper = document.getElementById('playerCardWrapper');
    if (!cardWrapper) return;

    try {
        const response = await API.get('/auth/me');
        if (response.profile) {
            const player = response.profile;
            const cardHTML = createPreviewPlayerCard(player);
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

// Create the preview player card HTML (matches collegecoach transfer portal card)
function createPreviewPlayerCard(player) {
    const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
    const height = formatHeight(player.height);
    const weight = player.weight ? `${player.weight} lbs` : 'N/A';
    const eligibility = player.eligibility ? `${player.eligibility} Year${player.eligibility > 1 ? 's' : ''}` : 'N/A';
    const gpa = player.gpa ? parseFloat(player.gpa).toFixed(2) : 'N/A';
    const previousSchool = player.team_name || 'Unknown School';
    const division = formatDivision(player.college_division);
    const profileImage = player.profile_image_url;

    // Get stat labels for this player's position
    const statLabels = getStatLabelsForPosition(player.position);

    // Format stats rows
    let lastSeasonStatsHTML = '';
    let careerStatsHTML = '';

    if (statLabels) {
        // Last Season Stats
        const lastStat1 = player.lastseasonstat1 !== null && player.lastseasonstat1 !== undefined ? player.lastseasonstat1 : '-';
        const lastStat2 = player.lastseasonstat2 !== null && player.lastseasonstat2 !== undefined ? player.lastseasonstat2 : '-';
        const lastStat3 = player.lastseasonstat3 !== null && player.lastseasonstat3 !== undefined ? player.lastseasonstat3 : '-';

        lastSeasonStatsHTML = `
            <div class="stats-section-card">
                <div class="stats-section-title">Last Season Stats</div>
                <div class="player-highlights">
                    <div class="highlight-item"><span class="stat-title">${statLabels[0]}:</span> ${lastStat1}</div>
                    <div class="highlight-item"><span class="stat-title">${statLabels[1]}:</span> ${lastStat2}</div>
                    <div class="highlight-item"><span class="stat-title">${statLabels[2]}:</span> ${lastStat3}</div>
                </div>
            </div>
        `;

        // Career Stats
        const careerStat1 = player.careerstat1 !== null && player.careerstat1 !== undefined ? player.careerstat1 : '-';
        const careerStat2 = player.careerstat2 !== null && player.careerstat2 !== undefined ? player.careerstat2 : '-';
        const careerStat3 = player.careerstat3 !== null && player.careerstat3 !== undefined ? player.careerstat3 : '-';

        careerStatsHTML = `
            <div class="stats-section-card">
                <div class="stats-section-title">Career Stats</div>
                <div class="player-highlights">
                    <div class="highlight-item"><span class="stat-title">${statLabels[0]}:</span> ${careerStat1}</div>
                    <div class="highlight-item"><span class="stat-title">${statLabels[1]}:</span> ${careerStat2}</div>
                    <div class="highlight-item"><span class="stat-title">${statLabels[2]}:</span> ${careerStat3}</div>
                </div>
            </div>
        `;
    }

    return `
        <div class="preview-player-card">
            <div class="player-card-header">
                <div class="player-avatar-large">
                    ${profileImage
                        ? `<img src="${profileImage}" alt="${displayName}" class="avatar-image">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>`
                    }
                </div>
                <div class="transfer-portal-badge">PORTAL</div>
            </div>
            <h3 class="player-name">
                ${displayName}
                <svg class="transfer-portal-icon" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="6" fill="var(--oxford-blue)"/>
                    <circle cx="12" cy="12" r="2"/>
                </svg>
            </h3>
            <div class="player-positions">
                ${formatPositions(player.position)}
            </div>
            <div class="player-stats-box">
                <div class="player-stats">
                    <div class="stat-item">
                        <div class="stat-label">Height</div>
                        <div class="stat-value">${height}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Weight</div>
                        <div class="stat-value">${weight}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-label">Eligibility</div>
                        <div class="stat-value">${eligibility}</div>
                    </div>
                </div>
                <div class="player-gpa-row">
                    <span class="gpa-label">GPA:</span>
                    <span class="gpa-value">${gpa}</span>
                </div>
            </div>
            <div class="player-details">
                <div class="detail-item portal-previous">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                        <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    Previously: ${previousSchool}${division ? ` (${division})` : ''}
                </div>
            </div>
            ${lastSeasonStatsHTML}
            ${careerStatsHTML}
        </div>
    `;
}
