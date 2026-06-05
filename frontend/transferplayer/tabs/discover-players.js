// Discover Players JavaScript

document.addEventListener('DOMContentLoaded', function() {

    // ========== PLAYERS SECTION ==========

    // Pagination state for players
    let playerOffset = 0;
    const playerLimit = window.innerWidth <= 768 ? 5 : 10;
    let hasMorePlayers = true;
    let isLoadingPlayers = false;

    // Load players from database (both HS and college players)
    async function loadPlayers(append = false) {
        const playersGrid = document.getElementById('playersGrid');
        const loadMoreBtn = document.getElementById('loadMorePlayersBtn');

        if (isLoadingPlayers) return;

        // Ensure school logos are loaded before rendering
        if (typeof ensureSchoolLogosLoaded === 'function') {
            await ensureSchoolLogosLoaded('../../assets');
        }
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
            // Fetch both HS and college players (fetch enough per source to fill playerLimit combined)
            const perSourceLimit = Math.ceil(playerLimit / 2);
            const [hsResponse, collegeResponse] = await Promise.all([
                API.get(`/profile/discover/hsplayers?limit=${perSourceLimit}&offset=${playerOffset}`),
                API.get(`/profile/discover/collegeplayers?limit=${perSourceLimit}&offset=${playerOffset}`)
            ]);

            const hsPlayers = (hsResponse && hsResponse.players) ? hsResponse.players : [];
            const collegePlayers = (collegeResponse && collegeResponse.players) ? collegeResponse.players : [];

            // Combine and interleave the players, cap to playerLimit
            const allPlayers = [];
            const maxLen = Math.max(hsPlayers.length, collegePlayers.length);
            for (let i = 0; i < maxLen; i++) {
                if (i < hsPlayers.length) allPlayers.push({ ...hsPlayers[i], playerType: 'hs' });
                if (i < collegePlayers.length) allPlayers.push({ ...collegePlayers[i], playerType: 'college' });
            }
            const displayPlayers = allPlayers.slice(0, playerLimit);

            if (displayPlayers.length > 0) {
                const playerCards = displayPlayers.map(player => {
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
                playerOffset += perSourceLimit;
                hasMorePlayers = (hsResponse && hsResponse.hasMore) || (collegeResponse && collegeResponse.hasMore);

                // Add click handlers to new cards
                attachPlayerCardListeners();
            } else if (!append) {
                playersGrid.innerHTML = '<p class="no-results-message">No players found.</p>';
            }

            // Update load more button visibility
            if (loadMoreBtn) {
                if (hasMorePlayers) {
                    loadMoreBtn.textContent = 'See More';
                    loadMoreBtn.disabled = false;
                    loadMoreBtn.style.display = 'inline-block';
                } else {
                    loadMoreBtn.style.display = 'none';
                }
            }
        } catch (error) {
            if (!append) {
                playersGrid.innerHTML = '<p class="no-results-message">Unable to load players.</p>';
            }
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'See More';
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

    function isMobile() { return window.innerWidth <= 768; }

    // ============ MOBILE ROW TEMPLATES ============

    function createMobileHSPlayerRow(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : '';
        const school = player.team_name || '';
        const state = player.state || '';
        const gradYear = player.graduation_year || '';
        const offerCount = countOffers(player.offers);
        const profileImage = player.profile_image_url;
        const position = formatAllPositions(player.position);
        const line2Parts = [position, height, weight, gradYear].filter(p => p);
        const schoolState = school + (state ? `, ${state}` : '');
        const offersHtml = `<span class="discover-row-offers">Offers: ${offerCount}</span>`;
        return `
            <div class="discover-row" data-username="${player.username || ''}" data-player-type="hs">
                <div class="discover-row-avatar player-border" style="color: ${getRoleBorderColor('player', false, null)}; background: ${getRoleAvatarBg('player', false, null)}; border: 2px solid ${getRoleBorderColor('player', false, null)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details player-details-color">${line2Parts.join(' &bull; ')}</div>
                    <div class="discover-row-details discover-row-line3">${schoolState}${schoolState ? ' &bull; ' : ''}${offersHtml}</div>
                </div>
            </div>`;
    }

    function createMobileCollegePlayerRow(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const school = player.team_name || '';
        const division = player.college_division || '';
        const shortDiv = getShortDivision(division);
        const profileImage = player.profile_image_url;
        const position = formatAllPositions(player.position);
        const logoHtml = (typeof getSchoolLogoHTML === 'function') ? getSchoolLogoHTML(school, '../../assets', 14) : '';
        const line2Parts = [position, school, shortDiv].filter(p => p);
        return `
            <div class="discover-row" data-username="${player.username || ''}" data-player-type="college">
                <div class="discover-row-avatar player-border" style="color: ${getRoleBorderColor('player', false, player.college_division)}; background: ${getRoleAvatarBg('player', false, player.college_division)}; border: 2px solid ${getRoleBorderColor('player', false, player.college_division)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}${logoHtml ? ' ' + logoHtml : ''}</div>
                    <div class="discover-row-details player-details-color">${line2Parts.join(' &bull; ')}</div>
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
        const logoHtml = (typeof getSchoolLogoHTML === 'function') ? getSchoolLogoHTML(school, '../../assets', 14) : '';
        const schoolState = school + (state ? `, ${state}` : '');
        const line2Parts = [schoolState, shortDiv].filter(p => p);
        const isCollegeCoach = division ? 'true' : 'false';
        return `
            <div class="discover-row" data-username="${coach.username || ''}" data-user-type="coach" data-is-college="${isCollegeCoach}">
                <div class="discover-row-avatar coach-border" style="color: ${getRoleBorderColor('coach', false, coach.college_division)}; background: ${getRoleAvatarBg('coach', false, coach.college_division)}; border: 2px solid ${getRoleBorderColor('coach', false, coach.college_division)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}${logoHtml ? ' ' + logoHtml : ''}</div>
                    <div class="discover-row-details coach-details-color">${line2Parts.join(' &bull; ')}</div>
                </div>
            </div>`;
    }

    // SVG fallback for missing profile images
    const avatarSvg = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;

    // Format all positions separated by /
    function formatAllPositions(posStr) {
        if (!posStr) return '';
        return posStr.split(/[,\/]/).map(p => p.trim()).filter(p => p).join('/');
    }

    function createHSPlayerCard(player) {
        if (isMobile()) return createMobileHSPlayerRow(player);
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : '';
        const gradYear = player.graduation_year || '';
        const school = player.team_name || '';
        const state = player.state || '';
        const offerCount = countOffers(player.offers);
        const profileImage = player.profile_image_url;
        const position = formatAllPositions(player.position);
        const line2Parts = [position, height, weight, gradYear].filter(p => p);
        const schoolState = school + (state ? `, ${state}` : '');
        const offersHtml = `<span class="discover-desktop-offers">Offers: ${offerCount}</span>`;

        return `
            <div class="discover-desktop-row" data-username="${player.username || ''}" data-player-type="hs">
                <div class="discover-desktop-avatar player-border">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : avatarSvg}
                </div>
                <div class="discover-desktop-info">
                    <div class="discover-desktop-name">${displayName}</div>
                    <div class="discover-desktop-line2 color-cerulean">${line2Parts.join(' &bull; ')}</div>
                    <div class="discover-desktop-line3">${schoolState}${schoolState ? ' &bull; ' : ''}${offersHtml}</div>
                </div>
            </div>`;
    }

    // Get short division for badge (converts full text to acronym)
    function getShortDivision(division) {
        if (!division) return '';
        const div = division.trim().toLowerCase();
        // Preserve the FBS/FCS subdivision (was collapsed to bare "D1").
        if (div.includes('fbs')) return 'D1 FBS';
        if (div.includes('fcs')) return 'D1 FCS';
        // Handle acronyms (case-insensitive)
        if (div.startsWith('d1')) return 'D1';
        if (div === 'd2') return 'D2';
        if (div === 'd3') return 'D3';
        if (div === 'naia') return 'NAIA';
        if (div === 'juco') return 'JUCO';
        // Handle full text "Division X" format
        if (div.includes('division')) {
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
            'D1 FBS': 'D1 FBS',
            'D1 FCS': 'D1 FCS',
            'D1': 'Division I',
            'D2': 'Division II',
            'D3': 'Division III',
            'NAIA': 'NAIA',
            'JUCO': 'Junior College'
        };
        return divisionMap[div] || div;
    }

    function createCollegePlayerCard(player) {
        if (isMobile()) return createMobileCollegePlayerRow(player);
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const school = player.team_name || '';
        const division = player.college_division || '';
        const shortDiv = getShortDivision(division);
        const profileImage = player.profile_image_url;
        const position = formatAllPositions(player.position);
        const logoHtml = (typeof getSchoolLogoHTML === 'function') ? getSchoolLogoHTML(school, '../../assets', 18) : '';
        const line2Parts = [position, school, shortDiv].filter(p => p);

        return `
            <div class="discover-desktop-row" data-username="${player.username || ''}" data-player-type="college">
                <div class="discover-desktop-avatar player-border">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : avatarSvg}
                </div>
                <div class="discover-desktop-info">
                    <div class="discover-desktop-name">${displayName}${logoHtml ? ' ' + logoHtml : ''}</div>
                    <div class="discover-desktop-line2 color-cerulean">${line2Parts.join(' &bull; ')}</div>
                </div>
            </div>`;
    }

    // Attach click listeners to player cards (exclude coach rows)
    function attachPlayerCardListeners() {
        const playerCards = document.querySelectorAll('.player-card, .discover-row[data-player-type], .discover-desktop-row[data-player-type]');
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
                        // Resolve relative target to absolute so it navigates in the iOS WKWebView
                        window.location.href = new URL(`../../${folder}/tabs/my-profile.html?username=${username}&from=discover`, window.location.href).href;
                    } else {
                        showToast('Profile not available. User has not set up their profile yet.', 'warning');
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
                    window.location.href = new URL(`../../${folder}/tabs/my-profile.html?username=${username}&from=discover`, window.location.href).href;
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
    const coachLimit = window.innerWidth <= 768 ? 5 : 10;
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
                        loadMoreBtn.textContent = 'See More';
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
            if (!append) {
                coachesGrid.innerHTML = '<p class="no-results-message">Unable to load coaches.</p>';
            }
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'See More';
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

    // Attach click listeners to coach cards (desktop and mobile)
    function attachCoachCardListeners() {
        // Desktop coach cards and desktop rows
        const coachCards = document.querySelectorAll('.coach-card, .discover-desktop-row[data-user-type="coach"]');
        coachCards.forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                const username = this.dataset.username;
                if (username) {
                    const isCollegeCoach = this.dataset.isCollege === 'true' || this.querySelector('.coach-badge')?.textContent?.includes('🎓');
                    const folder = isCollegeCoach ? 'collegecoach' : 'hscoach';
                    window.location.href = new URL(`../../${folder}/tabs/my-profile.html?username=${username}&from=discover`, window.location.href).href;
                } else {
                    showToast('Profile not available. Coach has not set up their profile yet.', 'warning');
                }
            });
        });

        // Mobile coach rows
        const mobileCoachRows = document.querySelectorAll('.discover-row[data-user-type="coach"]');
        mobileCoachRows.forEach(row => {
            row.style.cursor = 'pointer';
            row.addEventListener('click', function() {
                const username = this.dataset.username;
                if (username) {
                    const isCollegeCoach = this.dataset.isCollege === 'true';
                    const folder = isCollegeCoach ? 'collegecoach' : 'hscoach';
                    window.location.href = new URL(`../../${folder}/tabs/my-profile.html?username=${username}&from=discover`, window.location.href).href;
                } else {
                    showToast('Profile not available. Coach has not set up their profile yet.', 'warning');
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


    // Create coach card HTML
    function createCoachCard(coach) {
        if (isMobile()) return createMobileCoachRow(coach);
        const displayName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim() || 'Unknown Coach';
        const school = coach.team_name || '';
        const state = coach.state || '';
        const division = coach.college_division || '';
        const shortDiv = getShortDivision(division);
        const profileImage = coach.profile_image_url;
        const logoHtml = (typeof getSchoolLogoHTML === 'function') ? getSchoolLogoHTML(school, '../../assets', 18) : '';
        const schoolState = school + (state ? `, ${state}` : '');
        const line2Parts = [schoolState, shortDiv].filter(p => p);

        return `
            <div class="discover-desktop-row" data-username="${coach.username || ''}" data-user-type="coach" data-is-college="true">
                <div class="discover-desktop-avatar coach-border">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : avatarSvg}
                </div>
                <div class="discover-desktop-info">
                    <div class="discover-desktop-name">${displayName}${logoHtml ? ' ' + logoHtml : ''}</div>
                    <div class="discover-desktop-line2 color-orange">${line2Parts.join(' &bull; ')}</div>
                </div>
            </div>`;
    }

    // ========== MOBILE FILTER MODAL ==========
    const mobileFilterBtn = document.getElementById('mobileFilterBtn');
    const mobileFilterOverlay = document.getElementById('mobileFilterOverlay');
    const mobileFilterModal = document.getElementById('mobileFilterModal');
    const mobileFilterClose = document.getElementById('mobileFilterClose');
    const mobileFilterReset = document.getElementById('mobileFilterReset');
    const mobileFilterApply = document.getElementById('mobileFilterApply');
    const filterCountBadge = document.getElementById('filterCountBadge');

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
        if (!filterCountBadge) return;
        let count = 0;
        if (coachStateFilter && coachStateFilter.value) count++;
        if (divisionFilter && divisionFilter.value) count++;
        if (count > 0) {
            filterCountBadge.textContent = count;
            filterCountBadge.style.display = 'inline-flex';
        } else {
            filterCountBadge.style.display = 'none';
        }
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
    if (mobileFilterBtn) {
        mobileFilterBtn.addEventListener('click', openMobileFilterModal);
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
