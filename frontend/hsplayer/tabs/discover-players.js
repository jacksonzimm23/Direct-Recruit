// Discover Players JavaScript

document.addEventListener('DOMContentLoaded', function() {

    // ========== PLAYERS SECTION ==========

    // Pagination state for players
    let playerOffset = 0;
    const playerLimit = 9;
    let hasMorePlayers = true;
    let isLoadingPlayers = false;

    // Load players from database (both HS and college players)
    async function loadPlayers(append = false) {
        const playersGrid = document.getElementById('playersGrid');
        const loadMoreBtn = document.getElementById('loadMorePlayersBtn');

        if (isLoadingPlayers) return;
        if (!append) {
            playerOffset = 0;
            hasMorePlayers = true;
        }
        isLoadingPlayers = true;

        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.disabled = true;
        }

        try {
            // Fetch both HS and college players
            const [hsResponse, collegeResponse] = await Promise.all([
                API.get(`/profile/discover/hsplayers?limit=${playerLimit}&offset=${playerOffset}`),
                API.get(`/profile/discover/collegeplayers?limit=${playerLimit}&offset=${playerOffset}`)
            ]);

            const hsPlayers = (hsResponse && hsResponse.players) ? hsResponse.players : [];
            const collegePlayers = (collegeResponse && collegeResponse.players) ? collegeResponse.players : [];

            // Combine and interleave the players
            const allPlayers = [];
            const maxLen = Math.max(hsPlayers.length, collegePlayers.length);
            for (let i = 0; i < maxLen; i++) {
                if (i < hsPlayers.length) allPlayers.push({ ...hsPlayers[i], playerType: 'hs' });
                if (i < collegePlayers.length) allPlayers.push({ ...collegePlayers[i], playerType: 'college' });
            }

            if (allPlayers.length > 0) {
                const playerCards = allPlayers.map(player => {
                    if (player.playerType === 'college') {
                        return createCollegePlayerCard(player);
                    } else {
                        return createHSPlayerCard(player);
                    }
                }).join('');

                if (append) {
                    playersGrid.insertAdjacentHTML('beforeend', playerCards);
                } else {
                    playersGrid.innerHTML = playerCards;
                }

                // Update pagination state
                playerOffset += playerLimit;
                hasMorePlayers = (hsResponse && hsResponse.hasMore) || (collegeResponse && collegeResponse.hasMore);

                // Add click handlers to new cards
                attachPlayerCardListeners();
            } else if (!append) {
                playersGrid.innerHTML = '<p class="no-results-message">No players found.</p>';
            }

            // Update load more button visibility
            if (loadMoreBtn) {
                if (hasMorePlayers) {
                    loadMoreBtn.textContent = 'Load More Players';
                    loadMoreBtn.disabled = false;
                    loadMoreBtn.style.display = 'inline-block';
                } else {
                    loadMoreBtn.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('Error loading players:', error);
            if (!append) {
                playersGrid.innerHTML = '<p class="no-results-message">Unable to load players.</p>';
            }
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'Load More Players';
                loadMoreBtn.disabled = false;
            }
        }

        isLoadingPlayers = false;
    }

    // Format height from database (stored as text like "5'11" or total inches)
    function formatHeight(heightVal) {
        if (!heightVal) return 'N/A';
        if (typeof heightVal === 'string' && heightVal.includes("'")) {
            return heightVal;
        }
        const totalInches = parseInt(heightVal);
        if (isNaN(totalInches) || totalInches <= 0) return 'N/A';
        const feet = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        return `${feet}'${inches}"`;
    }

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
        if (!positionString) return '<span class="position-badge">Athlete (ATH)</span>';
        const positions = positionString.split(/[,\/]/).map(p => p.trim()).filter(p => p !== '');
        return positions.map(pos => {
            const upperPos = pos.toUpperCase();
            const fullName = positionNames[upperPos] || pos;
            return `<span class="position-badge">${fullName}</span>`;
        }).join('');
    }

    // Create HS player card HTML (matching collegecoach discover format)
    function createHSPlayerCard(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : 'N/A';
        const gpaVal = player.gpa ? parseFloat(player.gpa) : null;
        const gpa = gpaVal ? gpaVal.toFixed(1) : 'N/A';
        const school = player.team_name || 'Unknown School';
        const state = player.state || '';
        const gradYear = player.graduation_year || 'N/A';
        const offerCount = countOffers(player.offers);
        const profileImage = player.profile_image_url;

        return `
            <div class="player-card" data-username="${player.username || ''}" data-player-type="hs">
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
                        ${gradYear}
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

    // Get short division for badge (converts full text to acronym)
    function getShortDivision(division) {
        if (!division) return '';
        const div = division.trim().toLowerCase();
        // Handle acronyms (case-insensitive)
        if (div === 'fbs' || div === 'fcs') return 'D1';
        if (div.startsWith('d1')) return 'D1';
        if (div === 'd2') return 'D2';
        if (div === 'd3') return 'D3';
        if (div === 'naia') return 'NAIA';
        if (div === 'juco') return 'JUCO';
        // Handle full text "Division X" format
        if (div.includes('division')) {
            if (div.includes('fbs') || div.includes('fcs')) return 'D1';
            if (div.includes('iii') || div.includes('3')) return 'D3';
            if (div.includes('ii') || div.includes('2')) return 'D2';
            // D1 check last since 'i' is in 'ii' and 'iii'
            return 'D1';
        }
        if (div.includes('junior college')) return 'JUCO';
        return division.trim();
    }

    // Format division for display (always returns full text)
    function formatDivisionDisplay(division) {
        if (!division) return '';
        const div = division.trim();
        // If it's already full text, return as-is
        if (div.toLowerCase().startsWith('division')) return div;
        if (div.toLowerCase() === 'junior college') return div;
        // Map acronyms to full text
        const divisionMap = {
            'FBS': 'Division I - FBS',
            'FCS': 'Division I - FCS',
            'D1': 'Division I',
            'D2': 'Division II',
            'D3': 'Division III',
            'NAIA': 'NAIA',
            'JUCO': 'Junior College'
        };
        return divisionMap[div] || div;
    }

    // Create college player card HTML (blue theme, matching coach card school/division format)
    function createCollegePlayerCard(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const school = player.team_name || 'Unknown School';
        const division = player.college_division || '';
        const state = player.state || '';
        const profileImage = player.profile_image_url;
        const shortDivision = getShortDivision(division);
        const divisionDisplay = formatDivisionDisplay(division);

        return `
            <div class="player-card" data-username="${player.username || ''}" data-player-type="college">
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
                    <div class="division-badge">🎓 ${shortDivision}</div>
                </div>
                <h3 class="player-name">${displayName}</h3>
                <div class="player-positions">
                    ${formatPositions(player.position)}
                </div>
                <div class="player-school-box">
                    <div class="school-name">${school}${state ? ', ' + state : ''}</div>
                    <div class="school-division">${divisionDisplay || 'N/A'}</div>
                </div>
                <button class="btn-view-profile">View Profile</button>
            </div>
        `;
    }

    // Attach click listeners to player cards
    function attachPlayerCardListeners() {
        const playerCards = document.querySelectorAll('.player-card');
        playerCards.forEach(card => {
            // Remove existing listeners by cloning
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);

            const viewBtn = newCard.querySelector('.btn-view-profile');
            const playerType = newCard.dataset.playerType;

            if (viewBtn) {
                viewBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const username = newCard.dataset.username;
                    if (username) {
                        // Navigate to appropriate player profile folder
                        const folder = playerType === 'college' ? 'collegeplayer' : 'hsplayer';
                        window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from=discover`;
                    } else {
                        alert('Profile not available. User has not set up their profile yet.');
                    }
                });
            }

            // Make entire card clickable
            newCard.style.cursor = 'pointer';
            newCard.addEventListener('click', function() {
                const username = this.dataset.username;
                if (username) {
                    // Navigate to appropriate player profile folder
                    const folder = playerType === 'college' ? 'collegeplayer' : 'hsplayer';
                    window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from=discover`;
                }
            });
        });
    }

    // Load More Players button
    const loadMorePlayersBtn = document.getElementById('loadMorePlayersBtn');
    if (loadMorePlayersBtn) {
        loadMorePlayersBtn.addEventListener('click', function() {
            if (hasMorePlayers && !isLoadingPlayers) {
                loadPlayers(true);
            }
        });
    }

    // Load initial players
    loadPlayers();

    // Pagination state for coaches
    let coachOffset = 0;
    const coachLimit = 9;
    let hasMoreCoaches = true;
    let isLoadingCoaches = false;

    // Get current coach filter values
    function getCoachFilters() {
        const stateFilter = document.getElementById('coachStateFilter');
        const divisionFilter = document.getElementById('divisionFilter');
        return {
            state: stateFilter ? stateFilter.value : '',
            college_division: divisionFilter ? divisionFilter.value : ''
        };
    }

    // Load college coaches from database
    async function loadCollegeCoaches(append = false) {
        const coachesGrid = document.getElementById('coachesGrid');
        const loadMoreBtn = document.getElementById('loadMoreCoachesBtn');

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
            // Build query string with filters
            const filters = getCoachFilters();
            let queryParams = `limit=${coachLimit}&offset=${coachOffset}`;
            if (filters.state) queryParams += `&state=${encodeURIComponent(filters.state)}`;
            if (filters.college_division) queryParams += `&college_division=${encodeURIComponent(filters.college_division)}`;

            // Fetch college coaches with filters and pagination
            const response = await API.get(`/coaches/college?${queryParams}`);

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
                    coachesGrid.innerHTML = '<p class="no-results-message">No college coaches found matching your filters.</p>';
                    hasMoreCoaches = false;
                }

                // Update load more button visibility
                if (loadMoreBtn) {
                    const loadMoreContainer = loadMoreBtn.parentElement;
                    if (hasMoreCoaches) {
                        loadMoreBtn.textContent = 'Load More Coaches';
                        loadMoreBtn.disabled = false;
                        loadMoreBtn.style.display = 'inline-block';
                        if (loadMoreContainer) loadMoreContainer.style.display = 'flex';
                    } else {
                        loadMoreBtn.style.display = 'none';
                        if (loadMoreContainer) loadMoreContainer.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('Error loading coaches:', error);
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

    // Setup Load More Coaches button
    const loadMoreCoachesBtnEl = document.getElementById('loadMoreCoachesBtn');
    if (loadMoreCoachesBtnEl) {
        loadMoreCoachesBtnEl.addEventListener('click', function() {
            if (hasMoreCoaches && !isLoadingCoaches) {
                loadCollegeCoaches(true);
            }
        });
    }

    // Load initial coaches on page load
    loadCollegeCoaches();

    // Setup coach filter event listeners
    const coachStateFilter = document.getElementById('coachStateFilter');
    const divisionFilter = document.getElementById('divisionFilter');
    const resetCoachFiltersBtn = document.getElementById('resetCoachFilters');

    if (coachStateFilter) {
        coachStateFilter.addEventListener('change', function() {
            loadCollegeCoaches(false); // Reload from beginning with new filters
        });
    }

    if (divisionFilter) {
        divisionFilter.addEventListener('change', function() {
            loadCollegeCoaches(false); // Reload from beginning with new filters
        });
    }

    if (resetCoachFiltersBtn) {
        resetCoachFiltersBtn.addEventListener('click', function() {
            if (coachStateFilter) coachStateFilter.value = '';
            if (divisionFilter) divisionFilter.value = '';
            loadCollegeCoaches(false); // Reload with no filters
        });
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
                    // College coaches have the graduation cap badge
                    const isCollegeCoach = this.querySelector('.coach-badge')?.textContent?.includes('🎓');
                    const folder = isCollegeCoach ? 'collegecoach' : 'hscoach';
                    window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from=discover`;
                } else {
                    const coachName = this.querySelector('.coach-name').textContent.trim();
                    console.log('No username for coach:', coachName);
                    alert('Profile not available. Coach has not set up their profile yet.');
                }
            });
        });
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

        // Handle multiple positions separated by commas or slashes
        const positions = positionTitle.split(/[,\/]/).map(p => p.trim());
        const acronyms = positions.map(pos => {
            const lowerPos = pos.toLowerCase();
            return acronymMap[lowerPos] || pos;
        });

        return acronyms.join('/');
    }

    // Format division for display
    function formatDivision(division) {
        if (!division) return '';

        const divisionMap = {
            'FBS': 'Division I - FBS',
            'FCS': 'Division I - FCS',
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


    // Create coach card HTML
    function createCoachCard(coach) {
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

    // ========== MOBILE FILTER MODAL ==========
    const mobileFilterFab = document.getElementById('mobileFilterFab');
    const mobileFilterOverlay = document.getElementById('mobileFilterOverlay');
    const mobileFilterModal = document.getElementById('mobileFilterModal');
    const mobileFilterClose = document.getElementById('mobileFilterClose');
    const mobileFilterReset = document.getElementById('mobileFilterReset');
    const mobileFilterApply = document.getElementById('mobileFilterApply');
    const filterBadge = document.getElementById('filterBadge');

    // Mobile filter elements
    const mobileCoachStateFilter = document.getElementById('mobileCoachStateFilter');
    const mobileDivisionFilter = document.getElementById('mobileDivisionFilter');

    // Open mobile filter modal
    function openMobileFilterModal() {
        if (mobileFilterModal && mobileFilterOverlay) {
            // Sync mobile filters with desktop filters
            if (mobileCoachStateFilter && coachStateFilter) {
                mobileCoachStateFilter.value = coachStateFilter.value;
            }
            if (mobileDivisionFilter && divisionFilter) {
                mobileDivisionFilter.value = divisionFilter.value;
            }
            mobileFilterOverlay.classList.add('active');
            mobileFilterModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    // Close mobile filter modal
    function closeMobileFilterModal() {
        if (mobileFilterModal && mobileFilterOverlay) {
            mobileFilterOverlay.classList.remove('active');
            mobileFilterModal.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    // Update filter badge count
    function updateFilterBadge() {
        if (!filterBadge) return;
        let count = 0;
        if (coachStateFilter && coachStateFilter.value) count++;
        if (divisionFilter && divisionFilter.value) count++;
        filterBadge.textContent = count > 0 ? count : '';
    }

    // Apply mobile filters
    function applyMobileFilters() {
        // Sync mobile filters to desktop filters
        if (mobileCoachStateFilter && coachStateFilter) {
            coachStateFilter.value = mobileCoachStateFilter.value;
        }
        if (mobileDivisionFilter && divisionFilter) {
            divisionFilter.value = mobileDivisionFilter.value;
        }
        // Reload coaches with new filters
        loadCollegeCoaches(false);
        updateFilterBadge();
        closeMobileFilterModal();
    }

    // Reset mobile filters
    function resetMobileFilters() {
        if (mobileCoachStateFilter) mobileCoachStateFilter.value = '';
        if (mobileDivisionFilter) mobileDivisionFilter.value = '';
        if (coachStateFilter) coachStateFilter.value = '';
        if (divisionFilter) divisionFilter.value = '';
        loadCollegeCoaches(false);
        updateFilterBadge();
        closeMobileFilterModal();
    }

    // Event listeners for mobile filter
    if (mobileFilterFab) {
        mobileFilterFab.addEventListener('click', openMobileFilterModal);
    }
    if (mobileFilterOverlay) {
        mobileFilterOverlay.addEventListener('click', closeMobileFilterModal);
    }
    if (mobileFilterClose) {
        mobileFilterClose.addEventListener('click', closeMobileFilterModal);
    }
    if (mobileFilterApply) {
        mobileFilterApply.addEventListener('click', applyMobileFilters);
    }
    if (mobileFilterReset) {
        mobileFilterReset.addEventListener('click', resetMobileFilters);
    }

    // Initialize filter badge
    updateFilterBadge();
});
