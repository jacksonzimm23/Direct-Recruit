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

        if (div === 'D1 FBS' || div === 'FBS') return 'D1 FBS';
        if (div === 'D1 FCS' || div === 'FCS') return 'D1 FCS';
        if (div === 'D2' || div === 'DIVISION II') return 'D2';
        if (div === 'D3' || div === 'DIVISION III') return 'D3';
        if (div === 'NAIA') return 'NAIA';
        if (div === 'NJCAA' || div === 'JUCO') return 'JUCO';

        return division;
    }

    // Mobile detection
    function isMobile() { return window.innerWidth <= 768; }

    // Build stat lines HTML for a player (shared between desktop and mobile)
    function buildStatLines(player, mobile) {
        const statLabels = getStatLabelsForPosition(player.position);
        let lastSeasonHtml = '';
        let careerHtml = '';
        if (statLabels) {
            const ls1 = player.lastseasonstat1 != null ? player.lastseasonstat1 : '-';
            const ls2 = player.lastseasonstat2 != null ? player.lastseasonstat2 : '-';
            const ls3 = player.lastseasonstat3 != null ? player.lastseasonstat3 : '-';
            const lastParts = `${statLabels[0]}: ${ls1} • ${statLabels[1]}: ${ls2} • ${statLabels[2]}: ${ls3}`;

            const cs1 = player.careerstat1 != null ? player.careerstat1 : '-';
            const cs2 = player.careerstat2 != null ? player.careerstat2 : '-';
            const cs3 = player.careerstat3 != null ? player.careerstat3 : '-';
            const careerParts = `${statLabels[0]}: ${cs1} • ${statLabels[1]}: ${cs2} • ${statLabels[2]}: ${cs3}`;

            if (mobile) {
                lastSeasonHtml = `<div class="discover-row-details discover-row-stats-line"><span class="stats-label">Last Season:</span> ${lastParts}</div>`;
                careerHtml = `<div class="discover-row-details discover-row-stats-line"><span class="stats-label">Career:</span> ${careerParts}</div>`;
            } else {
                lastSeasonHtml = `<div class="discover-desktop-stats-line"><span class="discover-desktop-stats-label">Last Season:</span> ${lastParts}</div>`;
                careerHtml = `<div class="discover-desktop-stats-line"><span class="discover-desktop-stats-label">Career:</span> ${careerParts}</div>`;
            }
        }
        return { lastSeasonHtml, careerHtml };
    }

    // Create transfer player row HTML (desktop or mobile)
    function createTransferPlayerCard(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : '';
        const eligibility = player.eligibility ? `YOE: ${player.eligibility} year${player.eligibility > 1 ? 's' : ''}` : '';
        const position = player.position ? player.position.split(/[,\/]/).map(p => p.trim()).filter(p => p).join('/') : '';
        const previousSchool = player.team_name || '';
        const division = formatDivision(player.college_division);
        const profileImage = player.profile_image_url;
        const logoHtml = (typeof getSchoolLogoHTML === 'function') ? getSchoolLogoHTML(previousSchool, '../../assets', isMobile() ? 14 : 16) : '';

        // Line 2: Position • Height • Weight • YOE
        const line2Parts = [position, height, weight, eligibility].filter(p => p);
        // Line 3: Previously: School (Division)
        const line3 = previousSchool ? `<span class="stats-line-label">Previously:</span> ${previousSchool}${division ? ` (${division})` : ''}` : '';

        if (isMobile()) {
            const { lastSeasonHtml, careerHtml } = buildStatLines(player, true);
            return `
            <div class="discover-row transfer-row" data-username="${player.username || ''}">
                <div class="discover-row-avatar transfer-border">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName} ${logoHtml}</div>
                    <div class="discover-row-details transfer-details-color">${line2Parts.join(' • ')}</div>
                    <div class="discover-row-details discover-row-line3">${line3}</div>
                    ${lastSeasonHtml}
                    ${careerHtml}
                </div>
            </div>`;
        }

        // Desktop row
        const { lastSeasonHtml, careerHtml } = buildStatLines(player, false);
        return `
        <div class="discover-desktop-row" data-username="${player.username || ''}">
            <div class="discover-desktop-avatar transfer-border">
                ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
            </div>
            <div class="discover-desktop-info">
                <div class="discover-desktop-name">${displayName} ${logoHtml}</div>
                <div class="discover-desktop-line2">${line2Parts.join(' • ')}</div>
                <div class="discover-desktop-line3">${line3}</div>
                ${lastSeasonHtml}
                ${careerHtml}
            </div>
        </div>`;
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

            // Clear existing player rows (but keep loading/empty states)
            const existingCards = playersGrid.querySelectorAll('.player-card, .discover-row, .discover-desktop-row');
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

            // Ensure school logos are loaded before rendering
            if (typeof ensureSchoolLogosLoaded === 'function') {
                await ensureSchoolLogosLoaded('../../assets');
            }

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
        const playerCards = playersGrid.querySelectorAll('.player-card, .discover-row, .discover-desktop-row');
        playerCards.forEach(card => {
            const username = card.dataset.username;

            // Make entire card clickable
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                if (username) {
                    // Navigate to transfer player profile (transfer portal shows transfer players)
                    window.location.href = `../../transferplayer/tabs/my-profile.html?username=${username}&from=transfer-portal`;
                } else {
                    showToast('Profile not available. User has not set up their profile yet.', 'warning');
                }
            });

            // Also handle button click (stop propagation to avoid double navigation)
            const viewBtn = card.querySelector('.btn-view-profile');
            if (viewBtn) {
                viewBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (username) {
                        // Navigate to transfer player profile (transfer portal shows transfer players)
                        window.location.href = `../../transferplayer/tabs/my-profile.html?username=${username}&from=transfer-portal`;
                    } else {
                        showToast('Profile not available. User has not set up their profile yet.', 'warning');
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

    // ========== MOBILE FILTER MODAL ==========
    function initMobileFilters() {
        if (!isMobile()) return;

        const mobileFilterBtn = document.getElementById('mobileFilterBtn');
        const mobileFilterModal = document.getElementById('mobileFilterModal');
        const mobileFilterOverlay = document.getElementById('mobileFilterOverlay');
        const mobileFilterCloseBtn = document.getElementById('mobileFilterCloseBtn');
        const mobileFilterApplyBtn = document.getElementById('mobileFilterApplyBtn');
        const mobileFilterResetBtn = document.getElementById('mobileFilterResetBtn');
        const mobileFilterModalBody = document.getElementById('mobileFilterModalBody');
        const filterCountBadge = document.getElementById('filterCountBadge');

        if (!mobileFilterBtn || !mobileFilterModal) return;

        // Show the mobile filter button
        mobileFilterBtn.style.display = '';

        // Move filter groups from desktop container into the modal body
        const filtersGrid = document.querySelector('.filters-grid');
        if (filtersGrid && mobileFilterModalBody) {
            const filterGroups = filtersGrid.querySelectorAll('.filter-group');
            filterGroups.forEach(group => {
                group.classList.add('mobile-filter-group');
                mobileFilterModalBody.appendChild(group);
            });
        }

        function openFilterModal() {
            mobileFilterModal.classList.add('active');
            mobileFilterOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeFilterModal() {
            mobileFilterModal.classList.remove('active');
            mobileFilterOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        function countActiveFilters() {
            let count = 0;
            if (positionFilter.value) count++;
            if (eligibilityFilter.value) count++;
            if (levelFilter.value) count++;
            if (parseInt(heightSlider.value) > 60) count++;
            if (parseInt(weightSlider.value) > 150) count++;
            if (parseFloat(sliderToGPA(gpaSlider.value)) > 0) count++;
            return count;
        }

        function updateFilterBadge() {
            const count = countActiveFilters();
            if (count > 0) {
                filterCountBadge.textContent = count;
                filterCountBadge.style.display = '';
            } else {
                filterCountBadge.style.display = 'none';
            }
        }

        mobileFilterBtn.addEventListener('click', openFilterModal);
        mobileFilterCloseBtn.addEventListener('click', closeFilterModal);
        mobileFilterOverlay.addEventListener('click', closeFilterModal);

        mobileFilterApplyBtn.addEventListener('click', function() {
            const filters = getCurrentFilters();
            fetchTransferPlayers(filters, false);
            updateFilterBadge();
            closeFilterModal();
        });

        mobileFilterResetBtn.addEventListener('click', function() {
            positionFilter.value = '';
            eligibilityFilter.value = '';
            levelFilter.value = '';
            heightSlider.value = 60;
            weightSlider.value = 150;
            gpaSlider.value = 0;
            heightValue.textContent = inchesToDisplay(60);
            weightValue.textContent = '150';
            gpaValue.textContent = '0.0';
            updateFilterBadge();
        });

        // Initial badge state
        updateFilterBadge();
    }

    initMobileFilters();

    // Pool/Pipeline collapsible filter look — clone of wireFilterPanelToggle
    // from recruiting-board.js. Persists collapsed state in localStorage so
    // a coach's preference survives reload.
    (function wireTransferPortalFiltersToggle() {
        const container = document.getElementById('transferPortalFilters');
        const toggleBtn = document.getElementById('transferPortalFiltersToggle');
        if (!container || !toggleBtn) return;
        const storageKey = 'transferPortalFiltersHidden';
        const hidden = localStorage.getItem(storageKey) === 'true';
        if (hidden) {
            container.classList.add('rb-pool-filters-collapsed');
            toggleBtn.setAttribute('aria-expanded', 'false');
        }
        toggleBtn.addEventListener('click', () => {
            const isCollapsed = container.classList.toggle('rb-pool-filters-collapsed');
            localStorage.setItem(storageKey, isCollapsed);
            toggleBtn.setAttribute('aria-expanded', !isCollapsed);
        });
    })();

    // Initial load - fetch first 9 transfer players
    fetchTransferPlayers({}, false);

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
    }
}
