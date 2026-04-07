// Discover Users JavaScript - College Player
// Shows all registered users: players, coaches, and other profiles

document.addEventListener('DOMContentLoaded', function() {

    // Pagination state - separate offsets for each user type
    const userLimit = 4; // Limit per user type per load
    let offsets = {
        hsplayer: 0,
        collegeplayer: 0,
        transferplayer: 0,
        hscoach: 0,
        collegecoach: 0,
        other: 0
    };
    let hasMore = {
        hsplayer: true,
        collegeplayer: true,
        transferplayer: true,
        hscoach: true,
        collegecoach: true,
        other: true
    };
    let isLoadingUsers = false;

    // Load all users from database
    async function loadUsers(append = false) {
        const usersGrid = document.getElementById('usersGrid');
        const loadMoreBtn = document.getElementById('loadMoreUsersBtn');

        if (isLoadingUsers) return;
        if (!append) {
            // Reset all offsets
            offsets = { hsplayer: 0, collegeplayer: 0, transferplayer: 0, hscoach: 0, collegecoach: 0, other: 0 };
            hasMore = { hsplayer: true, collegeplayer: true, transferplayer: true, hscoach: true, collegecoach: true, other: true };
        }
        isLoadingUsers = true;

        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.disabled = true;
        }

        try {
            // Only fetch user types that still have more data
            const fetchPromises = [];
            const fetchTypes = [];

            if (hasMore.hsplayer) {
                fetchPromises.push(API.get(`/profile/discover/hsplayers?limit=${userLimit}&offset=${offsets.hsplayer}`).catch(() => ({ players: [] })));
                fetchTypes.push('hsplayer');
            }
            if (hasMore.collegeplayer) {
                fetchPromises.push(API.get(`/profile/discover/collegeplayers?limit=${userLimit}&offset=${offsets.collegeplayer}`).catch(() => ({ players: [] })));
                fetchTypes.push('collegeplayer');
            }
            if (hasMore.transferplayer) {
                fetchPromises.push(API.get(`/profile/discover/transferplayers?limit=${userLimit}&offset=${offsets.transferplayer}`).catch(() => ({ players: [] })));
                fetchTypes.push('transferplayer');
            }
            if (hasMore.hscoach) {
                fetchPromises.push(API.get(`/coaches/hs?limit=${userLimit}&offset=${offsets.hscoach}`).catch(() => ({ coaches: [] })));
                fetchTypes.push('hscoach');
            }
            if (hasMore.collegecoach) {
                fetchPromises.push(API.get(`/coaches/college?limit=${userLimit}&offset=${offsets.collegecoach}`).catch(() => ({ coaches: [] })));
                fetchTypes.push('collegecoach');
            }
            if (hasMore.other) {
                fetchPromises.push(API.get(`/profile/discover/other?limit=${userLimit}&offset=${offsets.other}`).catch(() => ({ profiles: [] })));
                fetchTypes.push('other');
            }

            const responses = await Promise.all(fetchPromises);

            // Combine all users with their types
            const allUsers = [];

            responses.forEach((res, index) => {
                const type = fetchTypes[index];
                let items = [];
                let resHasMore = false;

                if (type === 'hsplayer' || type === 'collegeplayer' || type === 'transferplayer') {
                    items = (res && res.players) ? res.players : [];
                    resHasMore = res && res.hasMore;
                } else if (type === 'hscoach' || type === 'collegecoach') {
                    items = (res && res.coaches) ? res.coaches : [];
                    resHasMore = res && res.hasMore;
                } else if (type === 'other') {
                    items = (res && res.profiles) ? res.profiles : [];
                    resHasMore = res && res.hasMore;
                }

                items.forEach(item => allUsers.push({ ...item, userType: type }));

                // Update offset and hasMore for this type
                offsets[type] += items.length;
                hasMore[type] = resHasMore;
            });

            // Shuffle the array to mix user types
            shuffleArray(allUsers);

            if (allUsers.length > 0) {
                const userCards = allUsers.map(user => createUserCard(user)).join('');

                if (append) {
                    usersGrid.insertAdjacentHTML('beforeend', userCards);
                } else {
                    usersGrid.innerHTML = userCards;
                }

                // Add click handlers to new cards
                attachUserCardListeners();
            } else if (!append) {
                usersGrid.innerHTML = '<p class="no-results-message">No users found.</p>';
            }

            // Check if any type still has more
            const hasMoreUsers = Object.values(hasMore).some(v => v);

            // Update load more button visibility
            if (loadMoreBtn) {
                const loadMoreContainer = loadMoreBtn.parentElement;
                if (hasMoreUsers) {
                    loadMoreBtn.textContent = 'Load More';
                    loadMoreBtn.disabled = false;
                    loadMoreBtn.style.display = 'inline-block';
                    if (loadMoreContainer) loadMoreContainer.style.display = 'flex';
                } else {
                    loadMoreBtn.style.display = 'none';
                    if (loadMoreContainer) loadMoreContainer.style.display = 'none';
                }
            }
        } catch (error) {
            if (!append) {
                usersGrid.innerHTML = '<p class="no-results-message">Unable to load users.</p>';
            }
            if (loadMoreBtn) {
                loadMoreBtn.textContent = 'Load More';
                loadMoreBtn.disabled = false;
            }
        }

        isLoadingUsers = false;
    }

    // Shuffle array (Fisher-Yates algorithm)
    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    // Create user card based on type
    function createUserCard(user) {
        switch (user.userType) {
            case 'hsplayer':
                return createHSPlayerCard(user);
            case 'collegeplayer':
                return createCollegePlayerCard(user);
            case 'transferplayer':
                return createTransferPlayerCard(user);
            case 'hscoach':
                return createHSCoachCard(user);
            case 'collegecoach':
                return createCollegeCoachCard(user);
            case 'other':
                return createOtherCard(user);
            default:
                return '';
        }
    }

    // Format height from database
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

    // Count offers
    function countOffers(offersString) {
        if (!offersString || offersString.trim() === '') return 0;
        return offersString.split('|').filter(o => o.trim() !== '').length;
    }

    // Position names
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

    // Format positions as badges
    function formatPositions(positionString) {
        if (!positionString) return '<span class="position-badge">Athlete (ATH)</span>';
        const positions = positionString.split(/[,\/]/).map(p => p.trim()).filter(p => p !== '');
        return positions.map(pos => {
            const upperPos = pos.toUpperCase();
            const fullName = positionNames[upperPos] || pos;
            return `<span class="position-badge">${fullName}</span>`;
        }).join('');
    }

    // Get short division
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

    // Format division display
    function formatDivisionDisplay(division) {
        if (!division) return '';
        const div = division.trim();
        if (div.toLowerCase().startsWith('division')) return div;
        if (div.toLowerCase() === 'junior college') return div;
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

    // Get position acronym for coaches
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

    // ============ MOBILE DETECTION ============
    function isMobile() { return window.innerWidth <= 768; }

    // ============ MOBILE ROW TEMPLATES ============

    function createMobileHSPlayerRow(player) {
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
            <div class="discover-row" data-username="${player.username || ''}" data-user-type="hsplayer">
                <div class="discover-row-avatar player-border" style="color: ${getRoleBorderColor('player', false, null)}; background: ${getRoleAvatarBg('player', false, null)}; border: 2px solid ${getRoleBorderColor('player', false, null)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details player-details-color">${line2Parts.join(' • ')}</div>
                    <div class="discover-row-details discover-row-line3">${line3Parts.join(' • ')}${offersHtml}</div>
                </div>
            </div>`;
    }

    function createMobileCollegePlayerRow(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const school = player.team_name || '';
        const state = player.state || '';
        const division = player.college_division || '';
        const shortDiv = getShortDivision(division);
        const profileImage = player.profile_image_url;
        const position = player.position ? player.position.split(/[,\/]/)[0].trim() : '';
        const line2Parts = [position, school + (state ? `, ${state}` : ''), shortDiv].filter(p => p);
        return `
            <div class="discover-row" data-username="${player.username || ''}" data-user-type="collegeplayer">
                <div class="discover-row-avatar player-border" style="color: ${getRoleBorderColor('player', false, player.college_division)}; background: ${getRoleAvatarBg('player', false, player.college_division)}; border: 2px solid ${getRoleBorderColor('player', false, player.college_division)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details player-details-color">${line2Parts.join(' • ')}</div>
                </div>
            </div>`;
    }

    function createMobileTransferPlayerRow(player) {
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : '';
        const profileImage = player.profile_image_url;
        const position = player.position ? player.position.split(/[,\/]/)[0].trim() : '';
        const eligibility = player.eligibility ? `${player.eligibility} yr eligibility` : '';
        const line2Parts = [position, height, weight, eligibility].filter(p => p);
        return `
            <div class="discover-row" data-username="${player.username || ''}" data-user-type="transferplayer">
                <div class="discover-row-avatar transfer-border" style="color: ${getRoleBorderColor('player', true, player.college_division)}; background: ${getRoleAvatarBg('player', true, player.college_division)}; border: 2px solid ${getRoleBorderColor('player', true, player.college_division)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor" style="color:#dc3545;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details transfer-details-color">${line2Parts.join(' • ')}</div>
                </div>
            </div>`;
    }

    function createMobileHSCoachRow(coach) {
        const displayName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim() || 'Unknown Coach';
        const school = coach.high_school || coach.school_name || '';
        const state = coach.state || '';
        const profileImage = coach.profile_image_url;
        const positionAcronym = getPositionAcronym(coach.position_title);
        const line2Parts = [positionAcronym, school + (state ? `, ${state}` : '')].filter(p => p);
        return `
            <div class="discover-row" data-username="${coach.username || ''}" data-user-type="hscoach">
                <div class="discover-row-avatar coach-border" style="color: ${getRoleBorderColor('coach', false, null)}; background: ${getRoleAvatarBg('coach', false, null)}; border: 2px solid ${getRoleBorderColor('coach', false, null)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details coach-details-color">${line2Parts.join(' • ')}</div>
                </div>
            </div>`;
    }

    function createMobileCollegeCoachRow(coach) {
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
            <div class="discover-row" data-username="${coach.username || ''}" data-user-type="collegecoach">
                <div class="discover-row-avatar coach-border" style="color: ${getRoleBorderColor('coach', false, coach.college_division)}; background: ${getRoleAvatarBg('coach', false, coach.college_division)}; border: 2px solid ${getRoleBorderColor('coach', false, coach.college_division)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details coach-details-color">${line2Parts.join(' • ')}</div>
                </div>
            </div>`;
    }

    function createMobileOtherRow(profile) {
        const displayName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown User';
        const subheader = profile.subheader || 'Direct Recruit User';
        const profileImage = profile.profile_picture_url || profile.profile_image_url;
        return `
            <div class="discover-row" data-username="${profile.username || ''}" data-user-type="other">
                <div class="discover-row-avatar other-border" style="color: ${getRoleBorderColor('other', false, null)}; background: ${getRoleAvatarBg('other', false, null)}; border: 2px solid ${getRoleBorderColor('other', false, null)}">
                    ${profileImage ? `<img src="${profileImage}" alt="${displayName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
                </div>
                <div class="discover-row-info">
                    <div class="discover-row-name">${displayName}</div>
                    <div class="discover-row-details other-details-color">${subheader}</div>
                </div>
            </div>`;
    }

    // ============ CARD TEMPLATES ============

    // HS Player Card
    function createHSPlayerCard(player) {
        if (isMobile()) return createMobileHSPlayerRow(player);
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
            <div class="player-card" data-username="${player.username || ''}" data-user-type="hsplayer">
                <div class="player-card-header">
                    <div class="player-avatar-large" style="color: ${getRoleBorderColor('player', false, null)}; background: ${getRoleAvatarBg('player', false, null)}; border: 2px solid ${getRoleBorderColor('player', false, null)}">
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

    // College Player Card
    function createCollegePlayerCard(player) {
        if (isMobile()) return createMobileCollegePlayerRow(player);
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const school = player.team_name || 'Unknown School';
        const division = player.college_division || '';
        const state = player.state || '';
        const profileImage = player.profile_image_url;
        const shortDivision = getShortDivision(division);
        const divisionDisplay = formatDivisionDisplay(division);

        return `
            <div class="player-card" data-username="${player.username || ''}" data-user-type="collegeplayer">
                <div class="player-card-header">
                    <div class="player-avatar-large" style="color: ${getRoleBorderColor('player', false, player.college_division)}; background: ${getRoleAvatarBg('player', false, player.college_division)}; border: 2px solid ${getRoleBorderColor('player', false, player.college_division)}">
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

    // Transfer Player Card
    function createTransferPlayerCard(player) {
        if (isMobile()) return createMobileTransferPlayerRow(player);
        const displayName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown Player';
        const height = formatHeight(player.height);
        const weight = player.weight ? `${player.weight} lbs` : 'N/A';
        const profileImage = player.profile_image_url;
        const eligibility = player.eligibility || 'N/A';

        return `
            <div class="player-card transfer-card" data-username="${player.username || ''}" data-user-type="transferplayer" style="border-color: rgba(220, 53, 69, 0.3);">
                <div class="player-card-header">
                    <div class="player-avatar-large" style="color: ${getRoleBorderColor('player', true, null)}; background: ${getRoleAvatarBg('player', true, null)}; border: 2px solid ${getRoleBorderColor('player', true, null)}">
                        ${profileImage
                            ? `<img src="${profileImage}" alt="${displayName}" class="avatar-image">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor" style="color: #dc3545;">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                    <div class="division-badge" style="background: #dc3545;">🔄 Transfer</div>
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
                        <div class="stat-label">Eligibility</div>
                        <div class="stat-value">${eligibility} yr</div>
                    </div>
                </div>
                <button class="btn-view-profile" style="background: #dc3545;">View Profile</button>
            </div>
        `;
    }

    // HS Coach Card
    function createHSCoachCard(coach) {
        if (isMobile()) return createMobileHSCoachRow(coach);
        const displayName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim() || 'Unknown Coach';
        const school = coach.high_school || coach.school_name || 'Unknown School';
        const state = coach.state || '';
        const profileImage = coach.profile_image_url;
        const positionAcronym = getPositionAcronym(coach.position_title);

        return `
            <div class="coach-card" data-username="${coach.username || ''}" data-user-type="hscoach">
                <div class="coach-card-header">
                    <div class="coach-avatar-large" style="color: ${getRoleBorderColor('coach', false, null)}; background: ${getRoleAvatarBg('coach', false, null)}; border: 2px solid ${getRoleBorderColor('coach', false, null)}">
                        ${profileImage
                            ? `<img src="${profileImage}" alt="${displayName}" class="avatar-image">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                    <div class="coach-badge">🏈 HS</div>
                </div>
                <h3 class="coach-name">${displayName}</h3>
                ${positionAcronym ? `<div class="coach-position">Position: ${positionAcronym}</div>` : ''}
                <div class="coach-school">
                    <div class="school-name">${school}${state ? ', ' + state : ''}</div>
                    <div class="school-division">High School</div>
                </div>
                <button class="btn-view-profile-coach">View Profile</button>
            </div>
        `;
    }

    // College Coach Card
    function createCollegeCoachCard(coach) {
        if (isMobile()) return createMobileCollegeCoachRow(coach);
        const displayName = `${coach.first_name || ''} ${coach.last_name || ''}`.trim() || 'Unknown Coach';
        const school = coach.team_name || 'Unknown School';
        const division = coach.college_division || '';
        const state = coach.state || '';
        const profileImage = coach.profile_image_url;
        const positionAcronym = getPositionAcronym(coach.position_title);
        const shortDivision = getShortDivision(division);
        const divisionDisplay = formatDivisionDisplay(division);

        // Parse recruiting positions
        let recruitingTags = '';
        if (coach.cc_pos && coach.cc_pos.trim()) {
            const positions = coach.cc_pos.split(',').map(p => p.trim()).filter(p => p);
            recruitingTags = positions.map(pos => `<span class="position-tag">${pos}</span>`).join('');
        }
        if (!recruitingTags) {
            recruitingTags = '<span class="position-tag">All Positions</span>';
        }

        return `
            <div class="coach-card" data-username="${coach.username || ''}" data-user-type="collegecoach">
                <div class="coach-card-header">
                    <div class="coach-avatar-large" style="color: ${getRoleBorderColor('coach', false, coach.college_division)}; background: ${getRoleAvatarBg('coach', false, coach.college_division)}; border: 2px solid ${getRoleBorderColor('coach', false, coach.college_division)}">
                        ${profileImage
                            ? `<img src="${profileImage}" alt="${displayName}" class="avatar-image">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                    <div class="coach-badge">🎓 ${shortDivision}</div>
                </div>
                <h3 class="coach-name">
                    ${displayName}
                    <svg class="verified-badge" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                    </svg>
                </h3>
                <div class="coach-position">Position: ${positionAcronym || 'Coach'}</div>
                <div class="coach-school">
                    <div class="school-name">${school}${state ? ', ' + state : ''}</div>
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

    // Other Profile Card (Yellow Theme)
    function createOtherCard(profile) {
        if (isMobile()) return createMobileOtherRow(profile);
        const displayName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown User';
        const subheader = profile.subheader || '';
        const profileImage = profile.profile_picture_url || profile.profile_image_url;

        return `
            <div class="other-card" data-username="${profile.username || ''}" data-user-type="other">
                <div class="other-card-header">
                    <div class="other-avatar-large" style="color: ${getRoleBorderColor('other', false, null)}; background: ${getRoleAvatarBg('other', false, null)}; border: 2px solid ${getRoleBorderColor('other', false, null)}">
                        ${profileImage
                            ? `<img src="${profileImage}" alt="${displayName}" class="avatar-image">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </div>
                <h3 class="other-name">${displayName}</h3>
                <div class="other-subheader">${subheader || 'Direct Recruit User'}</div>
                <button class="btn-view-profile-other">View Profile</button>
            </div>
        `;
    }

    // Attach click listeners to user cards
    function attachUserCardListeners() {
        const userCards = document.querySelectorAll('.player-card, .coach-card, .other-card, .discover-row');
        userCards.forEach(card => {
            // Remove existing listeners by cloning
            const newCard = card.cloneNode(true);
            card.parentNode.replaceChild(newCard, card);

            const viewBtn = newCard.querySelector('.btn-view-profile, .btn-view-profile-coach, .btn-view-profile-other');
            const userType = newCard.dataset.userType;
            const username = newCard.dataset.username;

            const navigateToProfile = () => {
                if (!username) {
                    alert('Profile not available. User has not set up their profile yet.');
                    return;
                }

                // userType is already the folder name (hsplayer, collegeplayer, etc.)
                const folder = userType || 'other';
                window.location.href = `../../${folder}/tabs/my-profile.html?username=${username}&from=discover`;
            };

            if (viewBtn) {
                viewBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    navigateToProfile();
                });
            }

            // Make entire card clickable
            newCard.style.cursor = 'pointer';
            newCard.addEventListener('click', navigateToProfile);
        });
    }

    // Load More Users button
    const loadMoreUsersBtn = document.getElementById('loadMoreUsersBtn');
    if (loadMoreUsersBtn) {
        loadMoreUsersBtn.addEventListener('click', function() {
            const hasMoreUsers = Object.values(hasMore).some(v => v);
            if (hasMoreUsers && !isLoadingUsers) {
                loadUsers(true);
            }
        });
    }

    // Load initial users
    loadUsers();
});
