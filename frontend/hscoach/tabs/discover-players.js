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

    // ============ MOBILE DETECTION ============
    function isMobile() { return window.innerWidth <= 768; }

    // ============ MOBILE ROW TEMPLATES ============

    function createMobilePlayerRow(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : '';
        const gpaVal = player.gpa ? parseFloat(player.gpa) : null;
        const gpa = gpaVal ? `GPA: ${gpaVal.toFixed(1)}` : '';
        const school = player.team_name || '';
        const state = player.state || '';
        const gradYear = player.graduation_year ? `Class of ${player.graduation_year}` : '';
        const offerCount = countOffers(player.offers);
        const profileImage = player.profile_image_url;
        const position = player.position ? player.position.split(/[,\/]/)[0].trim() : '';
        const line2Parts = [position, height, weight, gpa].filter(p => p);
        const schoolState = school + (state ? `, ${state}` : '');
        const line3Parts = [schoolState, gradYear].filter(p => p);
        const offersHtml = ` • <span class="discover-row-offers">Offers: ${offerCount}</span>`;
        return `
            <div class="discover-row" data-username="${player.username || ''}">
                <div class="discover-row-avatar player-border">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details player-details-color">${line2Parts.join(' • ')}</div>
                    <div class="discover-row-details discover-row-line3">${line3Parts.join(' • ')}${offersHtml}</div>
                </div>
            </div>`;
    }

    function createMobileCoachRow(coach) {
        const displayName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim() || 'Unknown Coach';
        const school = coach.team_name || '';
        const state = coach.state || '';
        const division = coach.college_division || '';
        const shortDiv = getShortDivision(division);
        const profileImage = coach.profile_image_url;
        const positionAcronym = getPositionAcronym(coach.position_title);
        let recruiting = '';
        if (coach.cc_pos && coach.cc_pos.trim()) {
            recruiting = coach.cc_pos.split(',').map(p => p.trim()).filter(p => p).join(', ');
        }
        const line2Parts = [positionAcronym, school + (state ? `, ${state}` : ''), shortDiv, recruiting ? `Recruiting: ${recruiting}` : ''].filter(p => p);
        return `
            <div class="discover-row" data-username="${coach.username || ''}">
                <div class="discover-row-avatar coach-border">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details coach-details-color">${line2Parts.join(' • ')}</div>
                </div>
            </div>`;
    }

    // Create player card HTML
    function createPlayerCard(player) {
        if (isMobile()) return createMobilePlayerRow(player);
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : 'N/A';
        // GPA comes as string from database, parse it first
        const gpaVal = player.gpa ? parseFloat(player.gpa) : null;
        const gpa = gpaVal ? gpaVal.toFixed(1) : 'N/A';
        const school = player.team_name || 'Unknown School';
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
            const existingCards = playersGrid.querySelectorAll('.player-card, .discover-row');
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
        const playerCards = playersGrid.querySelectorAll('.player-card, .discover-row');
        playerCards.forEach(card => {
            const username = card.dataset.username;

            // Make entire card clickable
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                if (username) {
                    // Navigate to HS player profile folder (hscoach discover page shows HS players)
                    window.location.href = `../../hsplayer/tabs/my-profile.html?username=${username}&from=discover`;
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
                        // Navigate to HS player profile folder (hscoach discover page shows HS players)
                        window.location.href = `../../hsplayer/tabs/my-profile.html?username=${username}&from=discover`;
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
            if (gradYearFilter.value) count++;
            if (stateFilter.value) count++;
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
            fetchPlayers(filters, false);
            updateFilterBadge();
            closeFilterModal();
        });

        mobileFilterResetBtn.addEventListener('click', function() {
            positionFilter.value = '';
            stateFilter.value = '';
            heightSlider.value = 60;
            weightSlider.value = 150;
            gpaSlider.value = 0;
            gradYearFilter.value = '';
            heightValue.textContent = inchesToDisplay(60);
            weightValue.textContent = '150';
            gpaValue.textContent = '0.0';
            updateFilterBadge();
        });

        // Initial badge state
        updateFilterBadge();
    }

    initMobileFilters();

    // Initial load - fetch first 9 HS players
    fetchPlayers({}, false);

    // ========== COACHES SECTION ==========

    // Pagination state for coaches
    let coachOffset = 0;
    const coachLimit = 9;
    let hasMoreCoaches = true;
    let isLoadingCoaches = false;

    // Get short division for badge (converts full text to acronym)
    function getShortDivision(division) {
        if (!division) return '';
        const div = division.trim().toLowerCase();
        if (div === 'fbs' || div === 'fcs') return 'D1';
        if (div.startsWith('d1')) return 'D1';
        if (div === 'd2') return 'D2';
        if (div === 'd3') return 'D3';
        if (div === 'naia') return 'NAIA';
        if (div === 'juco') return 'JUCO';
        if (div.includes('division')) {
            if (div.includes('fbs') || div.includes('fcs')) return 'D1';
            if (div.includes('iii') || div.includes('3')) return 'D3';
            if (div.includes('ii') || div.includes('2')) return 'D2';
            return 'D1';
        }
        if (div.includes('junior college')) return 'JUCO';
        return division.trim();
    }

    // Format division for display (full text)
    function formatDivision(division) {
        if (!division) return '';
        const divisionMap = {
            'D1 FBS': 'D1 FBS',
            'D1 FCS': 'D1 FCS',
            'D1-FBS': 'Division I - FBS',
            'D1-FCS': 'Division I - FCS',
            'D1': 'Division I',
            'D2': 'Division II',
            'D3': 'Division III',
            'NAIA': 'NAIA',
            'JUCO': 'Junior College'
        };
        return divisionMap[division] || division;
    }

    // Convert position title to acronym
    function getPositionAcronym(positionTitle) {
        if (!positionTitle) return '';
        const acronymMap = {
            'head coach': 'HC',
            'offensive coordinator': 'OC',
            'defensive coordinator': 'DC',
            'quarterbacks coach': 'QB',
            'quarterback coach': 'QB',
            'running backs coach': 'RB',
            'running back coach': 'RB',
            'wide receivers coach': 'WR',
            'wide receiver coach': 'WR',
            'tight ends coach': 'TE',
            'tight end coach': 'TE',
            'offensive line coach': 'OL',
            'defensive line coach': 'DL',
            'linebackers coach': 'LB',
            'linebacker coach': 'LB',
            'secondary coach': 'DB',
            'defensive backs coach': 'DB',
            'defensive back coach': 'DB',
            'cornerbacks coach': 'CB',
            'cornerback coach': 'CB',
            'safeties coach': 'S',
            'safety coach': 'S',
            'special teams coordinator': 'STC',
            'recruiting coordinator': 'RC',
            'assistant head coach': 'AHC',
            'associate head coach': 'AHC',
            'passing game coordinator': 'PGC',
            'run game coordinator': 'RGC',
            'strength and conditioning': 'S&C',
            'strength coach': 'S&C',
            'graduate assistant': 'GA',
            'director of football operations': 'DFO',
            'director of player personnel': 'DPP'
        };
        const positions = positionTitle.split(/[,\/]/).map(p => p.trim());
        const acronyms = positions.map(pos => {
            const lowerPos = pos.toLowerCase();
            return acronymMap[lowerPos] || pos;
        });
        return acronyms.join('/');
    }

    // Create coach card HTML
    function createCoachCard(coach) {
        if (isMobile()) return createMobileCoachRow(coach);
        const positionAcronym = getPositionAcronym(coach.position_title);
        const divisionDisplay = formatDivision(coach.college_division);
        const shortDivision = getShortDivision(coach.college_division);

        // Parse cc_pos (recruiting positions) - assuming comma-separated
        let recruitingTags = '';
        if (coach.cc_pos && coach.cc_pos.trim()) {
            const positions = coach.cc_pos.split(',').map(p => p.trim()).filter(p => p);
            recruitingTags = positions.map(pos => `<span class="position-tag">${pos}</span>`).join('');
        }
        // Show "All Positions" if no specific positions specified
        if (!recruitingTags) {
            recruitingTags = '<span class="position-tag">All Positions</span>';
        }

        const profileImage = coach.profile_image_url;

        return `
            <div class="coach-card" data-username="${coach.username || ''}">
                <div class="coach-card-header">
                    <div class="coach-avatar-large">
                        ${profileImage
                            ? `<img src="${profileImage}" alt="${coach.first_name}" class="avatar-image">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                    <div class="coach-badge">🎓 ${shortDivision}</div>
                </div>
                <h3 class="coach-name">
                    ${coach.first_name} ${coach.last_name}
                    <svg class="verified-badge" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                    </svg>
                </h3>
                <div class="coach-position">Position: ${positionAcronym}</div>
                <div class="coach-school">
                    <div class="school-name">${coach.team_name || ''}${coach.state ? ', ' + coach.state : ''}</div>
                    <div class="school-division">${divisionDisplay}</div>
                </div>
                <div class="coach-recruiting">
                    <div class="recruiting-label">Recruiting:</div>
                    <div class="position-tags">
                        ${recruitingTags}
                    </div>
                </div>
                <button class="btn-view-profile-coach">View Profile</button>
            </div>
        `;
    }

    // Load college coaches from database
    async function loadCollegeCoaches(append = false) {
        const coachesGrid = document.getElementById('coachesGrid');
        const loadMoreBtn = document.getElementById('loadMoreCoachesBtn');
        const loadMoreContainer = document.getElementById('loadMoreCoachesContainer');

        if (isLoadingCoaches) return;
        if (!append) {
            coachOffset = 0;
            hasMoreCoaches = true;
        }
        isLoadingCoaches = true;

        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.disabled = true;
        }

        try {
            const response = await API.get(`/coaches/college?limit=${coachLimit}&offset=${coachOffset}`);

            if (response && response.coaches) {
                if (response.coaches.length > 0) {
                    const coachCards = response.coaches.map(coach => createCoachCard(coach)).join('');

                    if (append) {
                        coachesGrid.insertAdjacentHTML('beforeend', coachCards);
                    } else {
                        coachesGrid.innerHTML = coachCards;
                    }

                    // Update pagination state
                    coachOffset += response.coaches.length;
                    hasMoreCoaches = response.hasMore;

                    // Add click handlers to new cards
                    attachCoachCardListeners();
                } else if (!append) {
                    coachesGrid.innerHTML = '<p class="no-results-message">No college coaches found.</p>';
                    hasMoreCoaches = false;
                }

                // Update load more button visibility
                if (loadMoreBtn && loadMoreContainer) {
                    if (hasMoreCoaches) {
                        loadMoreBtn.textContent = 'Load More Coaches';
                        loadMoreBtn.disabled = false;
                        loadMoreContainer.style.display = 'flex';
                    } else {
                        loadMoreContainer.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            if (!append) {
                coachesGrid.innerHTML = '<p class="no-results-message">Unable to load coaches.</p>';
            }
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'Load More Coaches';
                loadMoreBtn.disabled = false;
            }
        }

        isLoadingCoaches = false;
    }

    // Attach click listeners to coach cards
    function attachCoachCardListeners() {
        const coachCards = document.querySelectorAll('.coach-card');
        coachCards.forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                const username = this.dataset.username;
                if (username) {
                    // Navigate to appropriate coach profile folder
                    const isCollegeCoach = this.dataset.isCollege === 'true' || this.querySelector('.coach-badge')?.textContent?.includes('🎓');
                    const folder = isCollegeCoach ? 'collegecoach' : 'hscoach';
                    window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from=discover`;
                } else {
                    alert('Profile not available. Coach has not set up their profile yet.');
                }
            });
        });
    }

    // Setup Load More Coaches button
    const loadMoreCoachesBtn = document.getElementById('loadMoreCoachesBtn');
    if (loadMoreCoachesBtn) {
        loadMoreCoachesBtn.addEventListener('click', function() {
            if (hasMoreCoaches && !isLoadingCoaches) {
                loadCollegeCoaches(true);
            }
        });
    }

    // Load initial coaches
    loadCollegeCoaches();

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
    }
}
