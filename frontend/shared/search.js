class SearchComponent {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.searchResults = [];
        this.currentUserRole = null;
        // Pagination state — security #34 plumbed `hasMore` through the API; UI consumes it here.
        this.PAGE_SIZE = 8;
        this.currentQuery = '';
        this.currentOffset = 0;
        this.hasMore = false;
        this.isLoadingMore = false;
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

        // New query → reset pagination state.
        this.currentQuery = query;
        this.currentOffset = 0;
        this.searchResults = [];
        this.hasMore = false;

        try {
            const response = await API.get(`/profile/search?q=${encodeURIComponent(query)}&limit=${this.PAGE_SIZE}&offset=0`);
            this.searchResults = response.results || [];
            this.hasMore = !!response.hasMore;
            this.currentOffset = this.searchResults.length;
            this.displayResults();
        } catch (error) {
            this.displayError('Failed to search. Please try again.');
        }
    }

    async loadMoreResults() {
        if (this.isLoadingMore || !this.hasMore || !this.currentQuery) return;
        this.isLoadingMore = true;

        // Mark the button as loading so a double-click can't fire two requests.
        const moreBtn = document.querySelector('.search-show-more');
        if (moreBtn) {
            moreBtn.disabled = true;
            moreBtn.textContent = 'Loading...';
        }

        try {
            const response = await API.get(`/profile/search?q=${encodeURIComponent(this.currentQuery)}&limit=${this.PAGE_SIZE}&offset=${this.currentOffset}`);
            const nextBatch = response.results || [];
            this.searchResults = this.searchResults.concat(nextBatch);
            this.hasMore = !!response.hasMore;
            this.currentOffset += nextBatch.length;
            this.displayResults();
        } catch (error) {
            this.displayError('Failed to load more results. Please try again.');
        } finally {
            this.isLoadingMore = false;
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

        // Append "Show more" button when the backend signals more results exist.
        if (this.hasMore) {
            html += `<button type="button" class="search-show-more">Show more</button>`;
        }

        resultsContainer.innerHTML = html;
        this.showResults();

        resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const username = item.dataset.username;
                const role = item.dataset.role;
                const isTransfer = item.dataset.isTransfer === 'true';
                const collegeDivision = item.dataset.collegeDivision || '';

                const folder = getProfileFolder({ role, is_transfer_player: isTransfer, college_division: collegeDivision });

                // Navigate to the profile type's folder with cross-folder navigation
                const currentPath = window.location.pathname;
                const isInTabsFolder = currentPath.includes('/tabs/');
                const prefix = isInTabsFolder ? '../../' : '../';

                window.location.href = `${prefix}${folder}/tabs/my-profile.html?username=${encodeURIComponent(username)}&from=search`;
            });
        });

        const showMoreBtn = resultsContainer.querySelector('.search-show-more');
        if (showMoreBtn) {
            showMoreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadMoreResults();
            });
        }
    }

    renderResult(result) {
        const imageUrl = result.profile_image_url || result.profile_picture_url;
        const subtitle = [];
        const role = result.role;

        // Determine if this is a college player/coach or transfer
        const isCollege = result.college_division && result.college_division.trim() !== '';
        const isTransfer = result.transfer === 'y';

        // Build subtitle based on profile type (matching sidebar-footer format)
        if (role === 'player') {
            if (isTransfer) {
                // Transfer Player: Position • Height • Weight • YOE
                if (result.position) subtitle.push(escapeHtml(result.position));
                if (result.height) {
                    if (typeof result.height === 'string' && (result.height.includes("'") || result.height.includes('"'))) {
                        subtitle.push(escapeHtml(result.height));
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
                if (result.position) subtitle.push(escapeHtml(result.position));
                if (result.team_name) subtitle.push(escapeHtml(result.team_name));
                if (result.college_division) {
                    subtitle.push(escapeHtml(formatDivisionDisplay(result.college_division)));
                }
            } else {
                // HS Player: Position • Height • Weight • Graduation Year
                if (result.position) subtitle.push(escapeHtml(result.position));
                if (result.height) {
                    if (typeof result.height === 'string' && (result.height.includes("'") || result.height.includes('"'))) {
                        subtitle.push(escapeHtml(result.height));
                    } else {
                        const totalInches = parseInt(result.height);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        subtitle.push(`${feet}'${inches}"`);
                    }
                }
                if (result.weight) subtitle.push(`${result.weight} lbs`);
                if (result.graduation_year) subtitle.push(escapeHtml(result.graduation_year));
            }
        } else if (role === 'coach') {
            if (isCollege) {
                // College Coach: Team Name, State • Division
                if (result.team_name && result.state) {
                    subtitle.push(`${escapeHtml(result.team_name)}, ${escapeHtml(result.state)}`);
                } else if (result.team_name) {
                    subtitle.push(escapeHtml(result.team_name));
                } else if (result.state) {
                    subtitle.push(escapeHtml(result.state));
                }
                if (result.college_division) {
                    subtitle.push(escapeHtml(formatDivisionDisplay(result.college_division)));
                }
            } else {
                // HS Coach: Team Name, State
                if (result.team_name && result.state) {
                    subtitle.push(`${escapeHtml(result.team_name)}, ${escapeHtml(result.state)}`);
                } else if (result.team_name) {
                    subtitle.push(escapeHtml(result.team_name));
                } else if (result.state) {
                    subtitle.push(escapeHtml(result.state));
                }
            }
        } else if (role === 'other') {
            // Other: Subheader only
            if (result.subheader) subtitle.push(escapeHtml(result.subheader));
        }

        // Role-specific meta class for colored, bold subheader (matches feed post pattern)
        const metaClass = role === 'coach' ? 'coach-meta' : (role === 'other' ? 'other-meta' : (isTransfer ? 'transfer-player-meta' : 'player-meta'));

        const hasImage = result.profile_image_url || result.profile_picture_url;

        const safeFirstName = escapeHtml(result.first_name || '');
        const safeLastName = escapeHtml(result.last_name || '');
        const safeUsername = escapeHtml(result.username || '');
        const safeCollegeDivision = escapeHtml(result.college_division || '');
        return `
            <div class="search-result-item" data-username="${safeUsername}" data-role="${escapeHtml(role)}" data-is-college="${isCollege}" data-is-transfer="${isTransfer}" data-college-division="${safeCollegeDivision}">
                <div class="result-avatar" style="border: 2px solid ${getRoleBorderColor(role, isTransfer, result.college_division)}; color: ${getRoleBorderColor(role, isTransfer, result.college_division)}; background: ${getRoleAvatarBg(role, isTransfer, result.college_division)}">
                    ${hasImage ?
                        `<img src="${imageUrl}" alt="${safeFirstName} ${safeLastName}">` :
                        `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>`
                    }
                </div>
                <div class="result-info">
                    <div class="result-name-row">
                        <span class="result-name">${safeFirstName} ${safeLastName}${typeof getSchoolLogoHTML === 'function' && result.college_division ? getSchoolLogoHTML(result.team_name, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 16) : ''}</span>
                        <span class="result-username">@${safeUsername || 'no-username'}</span>
                    </div>
                    ${subtitle.length > 0 ? `<div class="result-subtitle ${metaClass}">${subtitle.join(' • ')}</div>` : ''}
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
