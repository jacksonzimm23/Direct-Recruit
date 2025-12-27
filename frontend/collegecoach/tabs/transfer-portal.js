document.addEventListener('DOMContentLoaded', async function() {
    // Show/hide recruiting-specific nav items for college coaches only
    await setupCollegeCoachNav();

    // Filter Elements
    const positionFilter = document.getElementById('positionFilter');
    const eligibilityFilter = document.getElementById('eligibilityFilter');
    const levelFilter = document.getElementById('levelFilter');
    const heightSlider = document.getElementById('heightSlider');
    const weightSlider = document.getElementById('weightSlider');
    const gpaSlider = document.getElementById('gpaSlider');
    const resetFiltersBtn = document.getElementById('resetFilters');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const resultsCount = document.getElementById('resultsCount');

    // Slider Value Display Elements
    const heightValue = document.getElementById('heightValue');
    const weightValue = document.getElementById('weightValue');
    const gpaValue = document.getElementById('gpaValue');

    // Players Grid
    const playersGrid = document.getElementById('playersGrid');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    // Pagination elements and state
    const loadMoreContainer = document.getElementById('loadMoreContainer');
    const loadMoreBtn = document.getElementById('loadMorePlayersBtn');
    let playerOffset = 0;
    const playerLimit = 9;
    let hasMorePlayers = true;
    let isLoadingPlayers = false;
    let totalPlayersLoaded = 0;

    // Convert inches to feet/inches display
    function inchesToDisplay(inches) {
        const feet = Math.floor(inches / 12);
        const remainingInches = inches % 12;
        return `${feet}'${remainingInches}"`;
    }

    // Convert GPA slider value to actual GPA
    function sliderToGPA(value) {
        return (value / 10).toFixed(1);
    }

    // Update slider displays
    heightSlider.addEventListener('input', function() {
        heightValue.textContent = inchesToDisplay(this.value);
    });

    weightSlider.addEventListener('input', function() {
        weightValue.textContent = this.value;
    });

    gpaSlider.addEventListener('input', function() {
        gpaValue.textContent = sliderToGPA(this.value);
    });

    // Position acronym to full name mapping
    const positionNames = {
        'QB': 'Quarterback (QB)',
        'RB': 'Running Back (RB)',
        'FB': 'Fullback (FB)',
        'WR': 'Wide Receiver (WR)',
        'TE': 'Tight End (TE)',
        'OT': 'Offensive Tackle (OT)',
        'OG': 'Offensive Guard (OG)',
        'C': 'Center (C)',
        'OL': 'Offensive Line (OL)',
        'DE': 'Defensive End (DE)',
        'DT': 'Defensive Tackle (DT)',
        'NT': 'Nose Tackle (NT)',
        'OLB': 'Outside Linebacker (OLB)',
        'MLB': 'Middle Linebacker (MLB)',
        'ILB': 'Inside Linebacker (ILB)',
        'LB': 'Linebacker (LB)',
        'CB': 'Cornerback (CB)',
        'FS': 'Free Safety (FS)',
        'SS': 'Strong Safety (SS)',
        'S': 'Safety (S)',
        'DB': 'Defensive Back (DB)',
        'K': 'Kicker (K)',
        'P': 'Punter (P)',
        'LS': 'Long Snapper (LS)',
        'ATH': 'Athlete (ATH)'
    };

    // Position stats mapping (same as collegeplayer transfer-portal.js)
    const positionStatsMap = {
        'QB': ['Total Yards', 'Total TDs', 'INT'],
        'RB': ['Total Yards', 'Rec', 'Total TDs'],
        'FB': ['Total Yards', 'Rec', 'Total TDs'],
        'WR': ['Rec', 'Rec Yards', 'Total TDs'],
        'TE': ['Rec', 'Rec Yards', 'Total TDs'],
        'OT': null,
        'OG': null,
        'C': null,
        'LS': null,
        'DE': ['Tackles', 'TFLs', 'Sacks'],
        'DT': ['Tackles', 'TFLs', 'Sacks'],
        'NT': ['Tackles', 'TFLs', 'Sacks'],
        'ILB': ['Tackles', 'TFLs', 'Sacks'],
        'OLB': ['Tackles', 'TFLs', 'Sacks'],
        'MLB': ['Tackles', 'TFLs', 'Sacks'],
        'LB': ['Tackles', 'TFLs', 'Sacks'],
        'CB': ['Tackles', 'PBUs', 'INTs'],
        'S': ['Tackles', 'PBUs', 'INTs'],
        'FS': ['Tackles', 'PBUs', 'INTs'],
        'SS': ['Tackles', 'PBUs', 'INTs'],
        'K': ['Made', 'Att', 'Long'],
        'P': ['Att', 'Avg', 'I20']
    };

    // Get stat labels for a position
    function getStatLabelsForPosition(positionString) {
        if (!positionString) return null;

        // Split by comma or slash and get the first position
        const positions = positionString.split(/[,\/]/).map(p => p.trim().toUpperCase()).filter(p => p !== '');

        for (const pos of positions) {
            if (positionStatsMap[pos]) {
                return positionStatsMap[pos];
            }
        }
        return null;
    }

    // Format positions as badges (handle multiple positions)
    function formatPositions(positionString) {
        if (!positionString) return '';

        // Split by comma or slash and create badges for each
        const positions = positionString.split(/[,\/]/).map(p => p.trim()).filter(p => p !== '');

        return positions.map(pos => {
            const upperPos = pos.toUpperCase();
            const fullName = positionNames[upperPos] || pos;
            return `<span class="position-badge transfer-portal-text">${fullName}</span>`;
        }).join('');
    }

    // Format height from database (stored as text like "6' 2\"" or total inches)
    function formatHeight(heightVal) {
        if (!heightVal) return 'N/A';

        // If it's already in feet'inches format, return as-is
        if (typeof heightVal === 'string' && heightVal.includes("'")) {
            return heightVal;
        }

        // Otherwise convert from total inches
        const totalInches = parseInt(heightVal);
        if (isNaN(totalInches) || totalInches <= 0) return 'N/A';

        const feet = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        return `${feet}'${inches}"`;
    }

    // Format division display (FBS/FCS get D1 prefix)
    function formatDivision(division) {
        if (!division) return '';
        const div = division.trim().toUpperCase();

        if (div === 'FBS') return 'D1 FBS';
        if (div === 'FCS') return 'D1 FCS';
        if (div === 'D2' || div === 'DIVISION II') return 'D2';
        if (div === 'D3' || div === 'DIVISION III') return 'D3';
        if (div === 'NAIA') return 'NAIA';
        if (div === 'NJCAA' || div === 'JUCO') return 'JUCO';

        return division;
    }

    // Create transfer player card HTML
    function createTransferPlayerCard(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : 'N/A';
        const eligibility = player.eligibility ? `${player.eligibility} Year${player.eligibility > 1 ? 's' : ''}` : 'N/A';
        const gpa = player.gpa ? parseFloat(player.gpa).toFixed(2) : 'N/A';
        const previousSchool = player.high_school || 'Unknown School';
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
            <div class="player-card transfer-portal" data-username="${player.username || ''}">
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
                <button class="btn-view-profile">View Profile</button>
            </div>
        `;
    }

    // Fetch and render transfer players
    async function fetchTransferPlayers(filters = {}, append = false) {
        if (isLoadingPlayers) return;
        isLoadingPlayers = true;

        // Show loading state only on initial load
        if (!append) {
            loadingState.style.display = 'flex';
            emptyState.style.display = 'none';
            loadMoreContainer.style.display = 'none';

            // Clear existing player cards (but keep loading/empty states)
            const existingCards = playersGrid.querySelectorAll('.player-card');
            existingCards.forEach(card => card.remove());

            // Reset pagination state
            playerOffset = 0;
            totalPlayersLoaded = 0;
            hasMorePlayers = true;
        }

        // Update button state
        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.disabled = true;
        }

        try {
            // Build query params
            const params = new URLSearchParams();
            if (filters.position) params.append('position', filters.position);
            if (filters.eligibility) params.append('eligibility', filters.eligibility);
            if (filters.level) params.append('college_division', filters.level);
            if (filters.min_height) params.append('min_height', filters.min_height);
            if (filters.min_weight) params.append('min_weight', filters.min_weight);
            if (filters.min_gpa) params.append('min_gpa', filters.min_gpa);
            params.append('limit', playerLimit);
            params.append('offset', playerOffset);

            const queryString = params.toString();
            const url = `/profile/discover/transferplayers?${queryString}`;

            const response = await API.get(url);
            const players = response.players || [];
            hasMorePlayers = response.hasMore || false;

            // Hide loading state
            loadingState.style.display = 'none';

            if (players.length === 0 && !append) {
                emptyState.style.display = 'flex';
                resultsCount.textContent = '0';
                loadMoreContainer.style.display = 'none';
                isLoadingPlayers = false;
                return;
            }

            // Render player cards
            players.forEach(player => {
                const cardHTML = createTransferPlayerCard(player);
                playersGrid.insertAdjacentHTML('beforeend', cardHTML);
            });

            // Update pagination state
            playerOffset += players.length;
            totalPlayersLoaded += players.length;

            // Update results count
            resultsCount.textContent = totalPlayersLoaded;

            // Add click handlers to view profile buttons
            setupViewProfileButtons();

            // Show/hide load more button
            if (hasMorePlayers) {
                loadMoreContainer.style.display = 'flex';
                loadMoreBtn.textContent = 'See More Players';
                loadMoreBtn.disabled = false;
            } else {
                loadMoreContainer.style.display = 'none';
            }

        } catch (error) {
            console.error('Error fetching transfer players:', error);
            loadingState.style.display = 'none';
            if (!append) {
                emptyState.style.display = 'flex';
                emptyState.querySelector('h3').textContent = 'Error loading players';
                emptyState.querySelector('p').textContent = 'Please try again later.';
                resultsCount.textContent = '0';
            }
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'See More Players';
                loadMoreBtn.disabled = false;
            }
        }

        isLoadingPlayers = false;
    }

    // Setup view profile button handlers and make cards clickable
    function setupViewProfileButtons() {
        const playerCards = playersGrid.querySelectorAll('.player-card');
        playerCards.forEach(card => {
            const username = card.dataset.username;

            // Make entire card clickable
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                if (username) {
                    window.location.href = `../../transferplayer/tabs/my-profile.html?username=${username}&from=transfer-portal`;
                } else {
                    alert('Profile not available. User has not set up their profile yet.');
                }
            });

            // Also handle button click (stop propagation to avoid double navigation)
            const viewBtn = card.querySelector('.btn-view-profile');
            if (viewBtn) {
                viewBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (username) {
                        window.location.href = `../../transferplayer/tabs/my-profile.html?username=${username}&from=transfer-portal`;
                    } else {
                        alert('Profile not available. User has not set up their profile yet.');
                    }
                });
            }
        });
    }

    // Get current filter values
    function getCurrentFilters() {
        const filters = {};

        if (positionFilter.value) filters.position = positionFilter.value;
        if (eligibilityFilter.value) filters.eligibility = eligibilityFilter.value;
        if (levelFilter.value) filters.level = levelFilter.value;

        // Only apply slider filters if they're above minimum
        const minHeight = parseInt(heightSlider.value);
        if (minHeight > 60) filters.min_height = minHeight;

        const minWeight = parseInt(weightSlider.value);
        if (minWeight > 150) filters.min_weight = minWeight;

        const minGPA = parseFloat(sliderToGPA(gpaSlider.value));
        if (minGPA > 0) filters.min_gpa = minGPA;

        return filters;
    }

    // Load More Button Handler
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            if (hasMorePlayers && !isLoadingPlayers) {
                const filters = getCurrentFilters();
                fetchTransferPlayers(filters, true);
            }
        });
    }

    // Apply Filters Button
    applyFiltersBtn.addEventListener('click', function() {
        const filters = getCurrentFilters();
        fetchTransferPlayers(filters, false);
    });

    // Reset Filters Button
    resetFiltersBtn.addEventListener('click', function() {
        // Reset all inputs
        positionFilter.value = '';
        eligibilityFilter.value = '';
        levelFilter.value = '';
        heightSlider.value = 60;
        weightSlider.value = 150;
        gpaSlider.value = 0;

        // Update slider displays
        heightValue.textContent = inchesToDisplay(60);
        weightValue.textContent = '150';
        gpaValue.textContent = '0.0';

        // Fetch all players (no filters)
        fetchTransferPlayers({}, false);
    });

    // Auto-apply filters on dropdown change
    positionFilter.addEventListener('change', function() {
        const filters = getCurrentFilters();
        fetchTransferPlayers(filters, false);
    });
    eligibilityFilter.addEventListener('change', function() {
        const filters = getCurrentFilters();
        fetchTransferPlayers(filters, false);
    });
    levelFilter.addEventListener('change', function() {
        const filters = getCurrentFilters();
        fetchTransferPlayers(filters, false);
    });

    // Initial load - fetch first 9 transfer players
    fetchTransferPlayers({}, false);

    console.log('Transfer Portal Page Loaded');
});

// Function to show/hide college-specific navigation based on user role
async function setupCollegeCoachNav() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            // Check for college_division to determine if user is a college coach
            const isCollegeCoach = profile.college_division && profile.college_division.trim() !== '';

            const recruitingBoardNav = document.getElementById('recruitingBoardNav');
            const transferPortalNav = document.getElementById('transferPortalNav');

            // Only show Recruiting Board and Transfer Portal for college coaches
            if (isCollegeCoach) {
                if (recruitingBoardNav) recruitingBoardNav.style.display = '';
                if (transferPortalNav) transferPortalNav.style.display = '';
            } else {
                if (recruitingBoardNav) recruitingBoardNav.style.display = 'none';
                if (transferPortalNav) transferPortalNav.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error setting up college coach navigation:', error);
    }
}
