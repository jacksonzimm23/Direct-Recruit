// Discover Players JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    // Show/hide recruiting-specific nav items for college coaches only
    await setupCollegeCoachNav();

    // Filter Elements
    const positionFilter = document.getElementById('positionFilter');
    const stateFilter = document.getElementById('stateFilter');
    const heightSlider = document.getElementById('heightSlider');
    const weightSlider = document.getElementById('weightSlider');
    const gpaSlider = document.getElementById('gpaSlider');
    const gradYearFilter = document.getElementById('gradYearFilter');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const resetFiltersBtn = document.getElementById('resetFilters');
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

    // Count offers from the offers string (pipe-separated)
    function countOffers(offersString) {
        if (!offersString || offersString.trim() === '') return 0;
        return offersString.split('|').filter(o => o.trim() !== '').length;
    }

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

    // Format positions as badges (handle multiple positions)
    function formatPositions(positionString) {
        if (!positionString) return '';

        // Split by comma, slash, or both and create badges for each
        const positions = positionString.split(/[,\/]/).map(p => p.trim()).filter(p => p !== '');

        return positions.map(pos => {
            const upperPos = pos.toUpperCase();
            const fullName = positionNames[upperPos] || pos;
            return `<span class="position-badge">${fullName}</span>`;
        }).join('');
    }

    // Format height from database (stored as text like "5'11" or total inches)
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

    // Create player card HTML
    function createPlayerCard(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : 'N/A';
        // GPA comes as string from database, parse it first
        const gpaVal = player.gpa ? parseFloat(player.gpa) : null;
        const gpa = gpaVal ? gpaVal.toFixed(1) : 'N/A';
        const school = player.high_school || 'Unknown School';
        const state = player.state || '';
        const gradYear = player.graduation_year || 'N/A';
        const offerCount = countOffers(player.offers);
        const profileImage = player.profile_image_url;

        return `
            <div class="player-card" data-username="${player.username || ''}">
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
                </div>
                <h3 class="player-name">${displayName}</h3>
                <div class="player-positions">
                    ${formatPositions(player.position)}
                </div>
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
                        <div class="stat-label">GPA</div>
                        <div class="stat-value">${gpa}</div>
                    </div>
                </div>
                <div class="player-details">
                    <div class="detail-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <path d="M9 22V12h6v10"></path>
                        </svg>
                        ${school}${state ? `, ${state}` : ''}
                    </div>
                    <div class="detail-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        Class of ${gradYear}
                    </div>
                    <div class="detail-item offers-detail">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                        Offers: ${offerCount}
                    </div>
                </div>
                <button class="btn-view-profile">View Profile</button>
            </div>
        `;
    }

    // Fetch and render players
    async function fetchPlayers(filters = {}, append = false) {
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
            if (filters.graduation_year) params.append('graduation_year', filters.graduation_year);
            if (filters.state) params.append('state', filters.state);
            if (filters.min_height) params.append('min_height', filters.min_height);
            if (filters.min_weight) params.append('min_weight', filters.min_weight);
            if (filters.min_gpa) params.append('min_gpa', filters.min_gpa);
            params.append('limit', playerLimit);
            params.append('offset', playerOffset);

            const queryString = params.toString();
            const url = `/profile/discover/hsplayers?${queryString}`;

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
                const cardHTML = createPlayerCard(player);
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
            console.error('Error fetching players:', error);
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

    // Setup view profile button handlers
    function setupViewProfileButtons() {
        const viewProfileBtns = playersGrid.querySelectorAll('.btn-view-profile');
        viewProfileBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const playerCard = this.closest('.player-card');
                const username = playerCard.dataset.username;
                if (username) {
                    // Link to hsplayer profile folder with from=discover to keep nav highlighted
                    window.location.href = `../../hsplayer/tabs/my-profile.html?username=${username}&from=discover`;
                } else {
                    alert('Profile not available. User has not set up their profile yet.');
                }
            });
        });
    }

    // Get current filter values
    function getCurrentFilters() {
        const filters = {};

        if (positionFilter.value) filters.position = positionFilter.value;
        if (gradYearFilter.value) filters.graduation_year = gradYearFilter.value;
        if (stateFilter.value) filters.state = stateFilter.value;

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
                fetchPlayers(filters, true);
            }
        });
    }

    // Apply Filters Button
    applyFiltersBtn.addEventListener('click', function() {
        const filters = getCurrentFilters();
        fetchPlayers(filters, false);
    });

    // Reset Filters Button
    resetFiltersBtn.addEventListener('click', function() {
        // Reset all inputs
        positionFilter.value = '';
        stateFilter.value = '';
        heightSlider.value = 60;
        weightSlider.value = 150;
        gpaSlider.value = 0;
        gradYearFilter.value = '';

        // Update slider displays
        heightValue.textContent = inchesToDisplay(60);
        weightValue.textContent = '150';
        gpaValue.textContent = '0.0';

        // Fetch all players (no filters)
        fetchPlayers({}, false);
    });

    // Auto-apply filters on dropdown change
    positionFilter.addEventListener('change', function() {
        const filters = getCurrentFilters();
        fetchPlayers(filters, false);
    });
    stateFilter.addEventListener('change', function() {
        const filters = getCurrentFilters();
        fetchPlayers(filters, false);
    });
    gradYearFilter.addEventListener('change', function() {
        const filters = getCurrentFilters();
        fetchPlayers(filters, false);
    });

    // Initial load - fetch first 9 HS players
    fetchPlayers({}, false);

    console.log('Discover Players Page Loaded');
});

// Function to show/hide college-specific navigation based on user role
async function setupCollegeCoachNav() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            // Check for college_division to determine if user is a college coach
            // High school coaches won't have a division (FBS, FCS, D2, D3, NAIA, JUCO)
            const isCollegeCoach = profile.college_division && profile.college_division.trim() !== '';

            const recruitingBoardNav = document.getElementById('recruitingBoardNav');
            const transferPortalNav = document.getElementById('transferPortalNav');

            // Only show Recruiting Board and Transfer Portal for college coaches
            if (isCollegeCoach) {
                if (recruitingBoardNav) recruitingBoardNav.style.display = '';
                if (transferPortalNav) transferPortalNav.style.display = '';
            } else {
                // Explicitly hide for high school coaches
                if (recruitingBoardNav) recruitingBoardNav.style.display = 'none';
                if (transferPortalNav) transferPortalNav.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error setting up college coach navigation:', error);
    }
}
