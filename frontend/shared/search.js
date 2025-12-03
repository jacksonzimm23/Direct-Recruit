class SearchComponent {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.searchResults = [];
        this.currentUserRole = null;
        this.init();
    }

    async init() {
        // Load current user's role
        await this.loadCurrentUserRole();
        this.render();
        this.attachEventListeners();
    }

    async loadCurrentUserRole() {
        try {
            const response = await API.get('/auth/me');
            if (response.user) {
                this.currentUserRole = response.user.role;
            }
        } catch (error) {
            console.error('Error loading current user role:', error);
        }
    }

    render() {
        this.container.innerHTML = `
            <div class="search-container">
                <div class="search-box">
                    <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                    <input
                        type="text"
                        id="searchInput"
                        class="search-input"
                        placeholder="Search for users by name or username..."
                    >
                    <button id="clearSearch" class="clear-search" style="display: none;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div id="searchResultsContainer" class="search-results-container" style="display: none;">
                    <div id="searchResults" class="search-results"></div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');

        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();

            if (query.length > 0) {
                clearSearch.style.display = 'block';
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => this.performSearch(query), 300);
            } else {
                clearSearch.style.display = 'none';
                this.hideResults();
            }
        });

        clearSearch.addEventListener('click', () => {
            searchInput.value = '';
            clearSearch.style.display = 'none';
            this.hideResults();
            searchInput.focus();
        });

        searchInput.addEventListener('focus', () => {
            if (this.searchResults.length > 0) {
                this.showResults();
            }
        });

        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.hideResults();
            }
        });
    }

    async performSearch(query) {
        if (query.length < 2) {
            this.hideResults();
            return;
        }

        try {
            console.log('Performing search for:', query);
            const response = await API.get(`/profile/search?q=${encodeURIComponent(query)}`);
            console.log('Search response:', response);

            this.searchResults = {
                players: response.players || [],
                coaches: response.coaches || []
            };

            console.log('Search results:', this.searchResults);
            console.log('Players found:', this.searchResults.players.length);
            console.log('Coaches found:', this.searchResults.coaches.length);

            this.displayResults();
        } catch (error) {
            console.error('Search error:', error);
            console.error('Error details:', error.response || error.message);
            this.displayError('Failed to search. Please try again.');
        }
    }

    displayResults() {
        const resultsContainer = document.getElementById('searchResults');
        const { players, coaches } = this.searchResults;

        if (players.length === 0 && coaches.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-no-results">
                    <p>No results found</p>
                </div>
            `;
            this.showResults();
            return;
        }

        let html = '';

        if (players.length > 0) {
            html += '<div class="search-section"><h3>Players</h3></div>';
            players.forEach(player => {
                html += this.renderPlayerResult(player);
            });
        }

        if (coaches.length > 0) {
            html += '<div class="search-section"><h3>Coaches</h3></div>';
            coaches.forEach(coach => {
                html += this.renderCoachResult(coach);
            });
        }

        resultsContainer.innerHTML = html;
        this.showResults();

        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const username = item.dataset.username;

                // Navigate to the current user's my-profile page with the username parameter
                // The my-profile.js will handle displaying the correct profile data
                // This keeps the user in their own folder so navigation works correctly
                window.location.href = `tabs/my-profile.html?username=${username}`;
            });
        });
    }

    renderPlayerResult(player) {
        const imageUrl = player.profile_image_url || this.getDefaultAvatar(player.first_name);
        const subtitle = [];
        if (player.position) subtitle.push(player.position);
        if (player.high_school) subtitle.push(player.high_school);
        if (player.graduation_year) subtitle.push(`'${String(player.graduation_year).slice(-2)}`);

        return `
            <div class="search-result-item" data-username="${player.username || ''}" data-role="player">
                <img src="${imageUrl}" alt="${player.first_name} ${player.last_name}" class="result-avatar">
                <div class="result-info">
                    <div class="result-name">${player.first_name} ${player.last_name}</div>
                    <div class="result-username">@${player.username || 'no-username'}</div>
                    ${subtitle.length > 0 ? `<div class="result-subtitle">${subtitle.join(' • ')}</div>` : ''}
                </div>
                <span class="result-badge player-badge">Player</span>
            </div>
        `;
    }

    renderCoachResult(coach) {
        const imageUrl = coach.profile_image_url || this.getDefaultAvatar(coach.first_name);
        const subtitle = [];
        if (coach.position_title) subtitle.push(coach.position_title);
        if (coach.college_name) subtitle.push(coach.college_name);

        return `
            <div class="search-result-item" data-username="${coach.username || ''}" data-role="coach">
                <img src="${imageUrl}" alt="${coach.first_name} ${coach.last_name}" class="result-avatar">
                <div class="result-info">
                    <div class="result-name">${coach.first_name} ${coach.last_name}</div>
                    <div class="result-username">@${coach.username || 'no-username'}</div>
                    ${subtitle.length > 0 ? `<div class="result-subtitle">${subtitle.join(' • ')}</div>` : ''}
                </div>
                <span class="result-badge coach-badge">Coach</span>
            </div>
        `;
    }

    getDefaultAvatar(name) {
        const initial = name ? name.charAt(0).toUpperCase() : '?';
        return `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='50' height='50'%3E%3Crect fill='%231282A2' width='50' height='50'/%3E%3Ctext fill='white' font-size='24' font-family='Arial' x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle'%3E${initial}%3C/text%3E%3C/svg%3E`;
    }

    displayError(message) {
        const resultsContainer = document.getElementById('searchResults');
        resultsContainer.innerHTML = `
            <div class="search-error">
                <p>${message}</p>
            </div>
        `;
        this.showResults();
    }

    showResults() {
        document.getElementById('searchResultsContainer').style.display = 'block';
    }

    hideResults() {
        document.getElementById('searchResultsContainer').style.display = 'none';
    }
}

window.SearchComponent = SearchComponent;
