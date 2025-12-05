// Discover Players JavaScript

document.addEventListener('DOMContentLoaded', function() {

    // Filter functionality
    const positionFilter = document.getElementById('positionFilter');
    const classFilter = document.getElementById('classFilter');
    const stateFilter = document.getElementById('stateFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const resetFiltersBtn = document.getElementById('resetFilters');

    // Quick filter buttons
    const quickFilterBtns = document.querySelectorAll('.quick-filter-btn');

    quickFilterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            quickFilterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const filterType = this.textContent.trim();
            console.log('Quick filter applied:', filterType);
            // Apply filter logic here
        });
    });

    // Filter change handlers
    if (positionFilter) {
        positionFilter.addEventListener('change', function() {
            console.log('Position filter:', this.value);
            applyFilters();
        });
    }

    if (classFilter) {
        classFilter.addEventListener('change', function() {
            console.log('Class filter:', this.value);
            applyFilters();
        });
    }

    if (stateFilter) {
        stateFilter.addEventListener('change', function() {
            console.log('State filter:', this.value);
            applyFilters();
        });
    }

    if (ratingFilter) {
        ratingFilter.addEventListener('change', function() {
            console.log('Rating filter:', this.value);
            applyFilters();
        });
    }

    // Reset filters
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            positionFilter.value = '';
            classFilter.value = '';
            stateFilter.value = '';
            ratingFilter.value = '';
            console.log('Filters reset');
            applyFilters();
        });
    }

    function applyFilters() {
        // This would connect to your backend to filter players
        console.log('Applying filters...');
        alert('Filter functionality will be connected to your backend.');
    }

    // View profile buttons
    const viewProfileBtns = document.querySelectorAll('.btn-view-profile');
    viewProfileBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const playerCard = this.closest('.player-card');
            const username = playerCard.dataset.username;
            if (username) {
                // Navigate to my-profile page with username parameter
                // Stay in the same folder so navigation continues to work
                window.location.href = `my-profile.html?username=${username}`;
            } else {
                const playerName = playerCard.querySelector('.player-name').textContent;
                console.log('No username for player:', playerName);
                alert('Profile not available. User has not set up their profile yet.');
            }
        });
    });

    // Load more button
    const loadMoreBtn = document.querySelector('.btn-load-more');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            console.log('Loading more players...');
            this.textContent = 'Loading...';

            // Simulate loading
            setTimeout(() => {
                this.textContent = 'Load More Players';
                alert('More players loaded! This will connect to your backend.');
            }, 1000);
        });
    }

    console.log('Discover Players page loaded');

    // Pagination state for coaches
    let coachOffset = 0;
    const coachLimit = 9;
    let hasMoreCoaches = true;
    let isLoadingCoaches = false;

    // Load college coaches from database
    async function loadCollegeCoaches(append = false) {
        const coachesGrid = document.getElementById('coachesGrid');
        const loadMoreBtn = document.getElementById('loadMoreCoachesBtn');

        if (isLoadingCoaches || (!append && coachOffset > 0)) return;
        isLoadingCoaches = true;

        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Loading...';
            loadMoreBtn.disabled = true;
        }

        try {
            // Fetch all college coaches with pagination
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
                    coachesGrid.innerHTML = '<p style="color: rgba(254,252,251,0.6); padding: 2rem;">No college coaches found.</p>';
                }

                // Update load more button visibility
                if (loadMoreBtn) {
                    if (hasMoreCoaches) {
                        loadMoreBtn.textContent = 'Load More Coaches';
                        loadMoreBtn.disabled = false;
                        loadMoreBtn.style.display = 'inline-block';
                    } else {
                        loadMoreBtn.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('Error loading coaches:', error);
            if (!append) {
                coachesGrid.innerHTML = '<p style="color: rgba(254,252,251,0.6); padding: 2rem;">Unable to load coaches.</p>';
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

    // Attach click listeners to coach cards
    function attachCoachCardListeners() {
        const coachCards = document.querySelectorAll('.coach-card');
        coachCards.forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', function() {
                const username = this.dataset.username;
                if (username) {
                    // Navigate to college coach profile page with username parameter and from=discover
                    window.location.href = `../../collegecoach/tabs/my-profile.html?username=${username}&from=discover`;
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
            'cornerbacks coach': 'CB',
            'cornerback coach': 'CB',
            'safeties coach': 'S',
            'safety coach': 'S',
            'special teams coordinator': 'STC',
            'recruiting coordinator': 'RC',
            'assistant head coach': 'AHC',
            'associate head coach': 'AHC',
            'passing game coordinator': 'PGC',
            'run game coordinator': 'RGC'
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

    // Get short division for badge
    function getShortDivision(division) {
        if (!division) return '';

        if (division === 'FBS' || division === 'FCS') return 'D1';
        if (division.startsWith('D1')) return 'D1';
        if (division === 'D2') return 'D2';
        if (division === 'D3') return 'D3';
        if (division === 'NAIA') return 'NAIA';
        if (division === 'JUCO') return 'JUCO';

        return division;
    }

    // Create coach card HTML
    function createCoachCard(coach) {
        const positionAcronym = getPositionAcronym(coach.position_title);
        const divisionDisplay = formatDivision(coach.college_division);
        const shortDivision = getShortDivision(coach.college_division);

        // Parse cc_pos (recruiting positions) - assuming comma-separated
        let recruitingTags = '';
        if (coach.cc_pos) {
            const positions = coach.cc_pos.split(',').map(p => p.trim());
            recruitingTags = positions.map(pos => `<span class="position-tag">${pos}</span>`).join('');
        }

        return `
            <div class="coach-card" data-username="${coach.username || ''}">
                <div class="coach-card-header">
                    <div class="coach-avatar-large">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
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
                    <div class="school-name">${coach.college_name || ''}${coach.state ? ', ' + coach.state : ''}</div>
                    <div class="school-division">${divisionDisplay}</div>
                </div>
                <div class="coach-recruiting">
                    <div class="recruiting-label">Recruiting:</div>
                    <div class="position-tags">
                        ${recruitingTags}
                    </div>
                </div>
            </div>
        `;
    }
});
