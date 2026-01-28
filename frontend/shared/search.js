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

            // Handle new unified results format
            this.searchResults = response.results || [];

            console.log('Search results:', this.searchResults);
            console.log('Total results found:', this.searchResults.length);

            this.displayResults();
        } catch (error) {
            console.error('Search error:', error);
            console.error('Error details:', error.response || error.message);
            this.displayError('Failed to search. Please try again.');
        }
    }

    displayResults() {
        const resultsContainer = document.getElementById('searchResults');
        const results = this.searchResults;

        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-no-results">
                    <p>No results found</p>
                </div>
            `;
            this.showResults();
            return;
        }

        let html = '';

        results.forEach(result => {
            html += this.renderResult(result);
        });

        resultsContainer.innerHTML = html;
        this.showResults();

        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const username = item.dataset.username;
                const role = item.dataset.role;
                const isCollege = item.dataset.isCollege === 'true';
                const isTransfer = item.dataset.isTransfer === 'true';

                // Determine the correct folder based on role and level
                let folder = 'hsplayer';
                if (role === 'coach') {
                    folder = isCollege ? 'collegecoach' : 'hscoach';
                } else if (role === 'player') {
                    if (isTransfer) {
                        folder = 'transferplayer';
                    } else {
                        folder = isCollege ? 'collegeplayer' : 'hsplayer';
                    }
                } else if (role === 'other') {
                    folder = 'other';
                }

                // Navigate to the profile type's folder with cross-folder navigation
                const currentPath = window.location.pathname;
                const isInTabsFolder = currentPath.includes('/tabs/');
                const prefix = isInTabsFolder ? '../../' : '../';

                window.location.href = `${prefix}${folder}/tabs/my-profile.html?username=${username}&from=search`;
            });
        });
    }

    renderResult(result) {
        const imageUrl = result.profile_image_url || result.profile_picture_url || this.getDefaultAvatar(result.first_name);
        const subtitle = [];
        const role = result.role;

        // Determine if this is a college player/coach or transfer
        const isCollege = result.college_division && result.college_division.trim() !== '';
        const isTransfer = result.transfer === 'y';

        // Determine username color based on profile type
        let usernameColor = '#1282A2'; // Default blue for HS players
        if (role === 'player') {
            if (isTransfer) {
                usernameColor = '#b91c1c'; // Transfer player red
            } else {
                usernameColor = '#1282A2'; // Regular player blue
            }
        } else if (role === 'coach') {
            usernameColor = '#E07C24'; // Coach orange
        } else if (role === 'other') {
            usernameColor = '#d4a017'; // Other gold
        }

        // Build subtitle based on profile type (matching sidebar-footer format)
        if (role === 'player') {
            if (isTransfer) {
                // Transfer Player: Position • Height • Weight • YOE
                if (result.position) subtitle.push(result.position);
                if (result.height) {
                    if (typeof result.height === 'string' && (result.height.includes("'") || result.height.includes('"'))) {
                        subtitle.push(result.height);
                    } else {
                        const totalInches = parseInt(result.height);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        subtitle.push(`${feet}'${inches}"`);
                    }
                }
                if (result.weight) subtitle.push(`${result.weight} lbs`);
                if (result.eligibility) {
                    const yearText = result.eligibility === 1 ? 'year' : 'years';
                    subtitle.push(`YOE: ${result.eligibility} ${yearText}`);
                }
            } else if (isCollege) {
                // College Player: Position • School Name • Division
                if (result.position) subtitle.push(result.position);
                if (result.team_name) subtitle.push(result.team_name);
                if (result.college_division) {
                    const div = result.college_division;
                    if (div === 'FBS' || div === 'FCS') {
                        subtitle.push(`D1 ${div}`);
                    } else {
                        subtitle.push(div);
                    }
                }
            } else {
                // HS Player: Position • Height • Weight • Graduation Year
                if (result.position) subtitle.push(result.position);
                if (result.height) {
                    if (typeof result.height === 'string' && (result.height.includes("'") || result.height.includes('"'))) {
                        subtitle.push(result.height);
                    } else {
                        const totalInches = parseInt(result.height);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        subtitle.push(`${feet}'${inches}"`);
                    }
                }
                if (result.weight) subtitle.push(`${result.weight} lbs`);
                if (result.graduation_year) subtitle.push(result.graduation_year);
            }
        } else if (role === 'coach') {
            if (isCollege) {
                // College Coach: Team Name, State • Division
                if (result.team_name && result.state) {
                    subtitle.push(`${result.team_name}, ${result.state}`);
                } else if (result.team_name) {
                    subtitle.push(result.team_name);
                } else if (result.state) {
                    subtitle.push(result.state);
                }
                if (result.college_division) {
                    const div = result.college_division;
                    if (div === 'FBS' || div === 'FCS') {
                        subtitle.push(`D1 ${div}`);
                    } else {
                        subtitle.push(div);
                    }
                }
            } else {
                // HS Coach: Position Title • Team Name • State
                if (result.position_title) subtitle.push(result.position_title);
                if (result.team_name) subtitle.push(result.team_name);
                if (result.state) subtitle.push(result.state);
            }
        } else if (role === 'other') {
            // Other: Subheader only
            if (result.subheader) subtitle.push(result.subheader);
        }

        return `
            <div class="search-result-item" data-username="${result.username || ''}" data-role="${role}" data-is-college="${isCollege}" data-is-transfer="${isTransfer}">
                <img src="${imageUrl}" alt="${result.first_name} ${result.last_name}" class="result-avatar" onerror="this.src='${this.getDefaultAvatar(result.first_name)}'">
                <div class="result-info">
                    <div class="result-name-row">
                        <span class="result-name">${result.first_name} ${result.last_name}</span>
                        <span class="result-username" style="color: ${usernameColor};">@${result.username || 'no-username'}</span>
                    </div>
                    ${subtitle.length > 0 ? `<div class="result-subtitle">${subtitle.join(' • ')}</div>` : ''}
                </div>
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
