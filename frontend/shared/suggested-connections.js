/**
 * Suggested Connections Widget
 * Loads random accounts and displays them in the right sidebar widget.
 * Shows 5 accounts initially with a "Show more" button that opens a modal.
 */

class SuggestedConnectionsWidget {
    constructor() {
        this.widgetContainer = document.getElementById('suggestedConnectionsList');
        this.showMoreBtn = document.getElementById('showMoreConnections');
        this.modalOverlay = document.getElementById('connectionsModalOverlay');
        this.modalList = document.getElementById('connectionsModalList');
        this.modalCloseBtn = document.getElementById('connectionsModalClose');

        this.connections = [];
        this.allConnections = [];
        this.hasMore = false;
        this.currentUser = null;

        this.init();
    }

    async init() {
        if (!this.widgetContainer) return;

        this.currentUser = API.getUser();

        // Load initial connections
        await this.loadConnections();

        // Setup event listeners
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Show more button
        if (this.showMoreBtn) {
            this.showMoreBtn.addEventListener('click', () => this.openModal());
        }

        // Modal close button
        if (this.modalCloseBtn) {
            this.modalCloseBtn.addEventListener('click', () => this.closeModal());
        }

        // Close modal on overlay click
        if (this.modalOverlay) {
            this.modalOverlay.addEventListener('click', (e) => {
                if (e.target === this.modalOverlay) {
                    this.closeModal();
                }
            });
        }

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modalOverlay?.classList.contains('active')) {
                this.closeModal();
            }
        });
    }

    async loadConnections() {
        this.widgetContainer.innerHTML = '<div class="connections-loading">Loading...</div>';

        try {
            const response = await API.get('/profile/suggested-connections?limit=5');
            this.connections = response.connections || [];
            this.hasMore = response.hasMore || false;

            this.renderWidget();
        } catch (error) {
            console.error('Failed to load suggested connections:', error);
            this.widgetContainer.innerHTML = '<div class="connections-empty">Unable to load suggestions</div>';
        }
    }

    renderWidget() {
        if (this.connections.length === 0) {
            this.widgetContainer.innerHTML = '<div class="connections-empty">No suggestions available</div>';
            if (this.showMoreBtn) this.showMoreBtn.style.display = 'none';
            return;
        }

        this.widgetContainer.innerHTML = this.connections.map(conn => this.createWidgetItemHTML(conn)).join('');

        // Show "Show more" button if there are more connections
        if (this.showMoreBtn) {
            this.showMoreBtn.style.display = this.hasMore ? 'block' : 'none';
        }

        // Add click handlers for follow buttons
        this.attachFollowHandlers(this.widgetContainer);

        // Add click handlers for profile navigation
        this.attachProfileClickHandlers(this.widgetContainer, '.follow-item');
    }

    getRoleColor(connection) {
        const role = connection.role;
        const isTransfer = connection.transfer === 'y';
        const collegeDivision = connection.college_division;
        return getRoleBorderColor(role, isTransfer, collegeDivision);
    }

    getRoleBg(connection) {
        const role = connection.role;
        const isTransfer = connection.transfer === 'y';
        const collegeDivision = connection.college_division;
        return getRoleAvatarBg(role, isTransfer, collegeDivision);
    }

    buildSubheader(connection) {
        const parts = [];
        const profileType = connection.profile_type || 'unknown';

        if (profileType === 'transfer') {
            if (connection.player_position) parts.push(connection.player_position);
            if (connection.player_height) {
                const h = parseInt(connection.player_height);
                parts.push(`${Math.floor(h / 12)}'${h % 12}"`);
            }
            if (connection.player_weight) parts.push(`${connection.player_weight} lbs`);
            if (connection.eligibility) {
                const yt = connection.eligibility === 1 ? 'year' : 'years';
                parts.push(`YOE: ${connection.eligibility} ${yt}`);
            }
            return { text: parts.join(' \u2022 ') || 'Transfer Player', color: '#b91c1c' };
        } else if (profileType === 'hs' && connection.role === 'player') {
            if (connection.player_position) parts.push(connection.player_position);
            if (connection.player_height) {
                const h = parseInt(connection.player_height);
                parts.push(`${Math.floor(h / 12)}'${h % 12}"`);
            }
            if (connection.player_weight) parts.push(`${connection.player_weight} lbs`);
            if (connection.graduation_year) parts.push(connection.graduation_year);
            return { text: parts.join(' \u2022 ') || 'Player', color: '#1282a2' };
        } else if (profileType === 'college' && connection.role === 'player') {
            if (connection.player_position) parts.push(connection.player_position);
            if (connection.team_name) parts.push(connection.team_name);
            if (connection.college_division) parts.push(connection.college_division);
            return { text: parts.join(' \u2022 ') || 'Player', color: '#1282a2' };
        } else if (profileType === 'hs' && connection.role === 'coach') {
            if (connection.team_name) parts.push(connection.team_name);
            if (connection.state) parts.push(connection.state);
            return { text: parts.join(', ') || 'HS Coach', color: '#ff6b35' };
        } else if (profileType === 'college' && connection.role === 'coach') {
            if (connection.team_name && connection.state) {
                parts.push(`${connection.team_name}, ${connection.state}`);
            } else if (connection.team_name) {
                parts.push(connection.team_name);
            }
            if (connection.college_division) parts.push(connection.college_division);
            return { text: parts.join(' \u2022 ') || 'College Coach', color: '#ff6b35' };
        } else if (connection.role === 'other') {
            return { text: connection.other_subheader || '', color: '#d4a017' };
        }
        return { text: '', color: '#1282a2' };
    }

    createWidgetItemHTML(connection) {
        const fullName = `${connection.first_name} ${connection.last_name}`.trim() || 'Unknown User';
        const profileType = connection.profile_type || 'unknown';
        const roleColor = this.getRoleColor(connection);
        const roleBg = this.getRoleBg(connection);
        const sub = this.buildSubheader(connection);

        const avatarHTML = connection.profile_image_url
            ? `<img src="${connection.profile_image_url}" alt="${fullName}" class="follow-avatar-img" style="border: 2px solid ${roleColor}; border-radius: 50%;">`
            : `<div class="follow-avatar-circle" style="border: 2px solid ${roleColor}; color: ${roleColor}; background: ${roleBg};">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
               </div>`;

        return `
            <div class="follow-item" data-user-id="${connection.user_id}" data-username="${connection.username || ''}" data-profile-type="${profileType}" data-role="${connection.role}">
                ${avatarHTML}
                <div class="follow-info">
                    <div class="follow-name">${this.escapeHTML(fullName)}</div>
                    ${sub.text ? `<div class="follow-subheader" style="color: ${sub.color};">${this.escapeHTML(sub.text)}</div>` : ''}
                </div>
            </div>
        `;
    }

    async openModal() {
        if (!this.modalOverlay || !this.modalList) return;

        this.modalOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Load all connections for the modal
        await this.loadAllConnectionsForModal();
    }

    closeModal() {
        if (this.modalOverlay) {
            this.modalOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    async loadAllConnectionsForModal() {
        this.modalList.innerHTML = '<div class="connections-loading">Loading...</div>';

        try {
            // Load more connections (up to 50)
            const response = await API.get('/profile/suggested-connections?limit=50');
            this.allConnections = response.connections || [];

            this.renderModalList();
        } catch (error) {
            console.error('Failed to load connections for modal:', error);
            this.modalList.innerHTML = '<div class="connections-empty">Unable to load suggestions</div>';
        }
    }

    renderModalList() {
        if (this.allConnections.length === 0) {
            this.modalList.innerHTML = '<div class="connections-empty">No suggestions available</div>';
            return;
        }

        this.modalList.innerHTML = this.allConnections.map(conn => this.createModalItemHTML(conn)).join('');

        // Add click handlers for follow buttons
        this.attachFollowHandlers(this.modalList);

        // Add click handlers for profile navigation
        this.attachProfileClickHandlers(this.modalList, '.connection-modal-item');
    }

    createModalItemHTML(connection) {
        const fullName = `${connection.first_name} ${connection.last_name}`.trim() || 'Unknown User';
        const profileType = connection.profile_type || 'unknown';
        const roleColor = this.getRoleColor(connection);
        const roleBg = this.getRoleBg(connection);
        const sub = this.buildSubheader(connection);

        const avatarHTML = connection.profile_image_url
            ? `<img src="${connection.profile_image_url}" alt="${fullName}" class="connection-modal-avatar" style="border: 2px solid ${roleColor}; border-radius: 50%;">`
            : `<div class="connection-modal-avatar-circle" style="border: 2px solid ${roleColor}; color: ${roleColor}; background: ${roleBg};">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
               </div>`;

        return `
            <div class="connection-modal-item" data-user-id="${connection.user_id}" data-username="${connection.username || ''}" data-profile-type="${profileType}" data-role="${connection.role}">
                ${avatarHTML}
                <div class="connection-modal-info">
                    <div class="connection-modal-name">${this.escapeHTML(fullName)}</div>
                    ${sub.text ? `<div class="connection-modal-subheader" style="color: ${sub.color};">${this.escapeHTML(sub.text)}</div>` : ''}
                </div>
                <button class="connection-modal-btn-follow" data-user-id="${connection.user_id}">Follow</button>
            </div>
        `;
    }

    attachFollowHandlers(container) {
        const followBtns = container.querySelectorAll('.btn-follow, .connection-modal-btn-follow');
        followBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.handleFollow(btn);
            });
        });
    }

    attachProfileClickHandlers(container, itemSelector) {
        const items = container.querySelectorAll(itemSelector);
        items.forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't navigate if clicking the follow button
                if (e.target.closest('.btn-follow, .connection-modal-btn-follow')) return;

                const username = item.dataset.username;
                const profileType = item.dataset.profileType;
                const role = item.dataset.role;

                if (username) {
                    this.navigateToProfile(username, profileType, role);
                }
            });
        });
    }

    async handleFollow(btn) {
        const userId = btn.dataset.userId;
        if (!userId) return;

        const isFollowing = btn.classList.contains('following');

        try {
            if (isFollowing) {
                await API.follow.unfollow(userId);
                btn.classList.remove('following');
                btn.textContent = 'Follow';
            } else {
                await API.follow.follow(userId);
                btn.classList.add('following');
                btn.textContent = 'Following';
            }

            // Update both widget and modal if both exist
            this.syncFollowState(userId, !isFollowing);
        } catch (error) {
            console.error('Failed to follow/unfollow:', error);
        }
    }

    syncFollowState(userId, isNowFollowing) {
        // Update all follow buttons for this user
        const allBtns = document.querySelectorAll(`[data-user-id="${userId}"].btn-follow, [data-user-id="${userId}"].connection-modal-btn-follow`);
        allBtns.forEach(btn => {
            if (isNowFollowing) {
                btn.classList.add('following');
                btn.textContent = 'Following';
            } else {
                btn.classList.remove('following');
                btn.textContent = 'Follow';
            }
        });
    }

    navigateToProfile(username, profileType, role) {
        // Close modal if open
        this.closeModal();

        // Map profileType to getProfileFolder fields
        const isTransfer = profileType === 'transfer';
        const collegeDivision = profileType === 'college' ? COLLEGE_DIVISIONS[0] : '';
        const folder = getProfileFolder({ role, is_transfer_player: isTransfer, college_division: collegeDivision });

        // Navigate using relative path (same pattern as feed.js)
        const currentPath = window.location.pathname;
        const isInTabsFolder = currentPath.includes('/tabs/');
        const prefix = isInTabsFolder ? '../../' : '../';

        window.location.href = `${prefix}${folder}/tabs/my-profile.html?username=${encodeURIComponent(username)}&from=feed`;
    }

    escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the widget exists on the page
    if (document.getElementById('suggestedConnectionsWidget')) {
        window.suggestedConnectionsWidget = new SuggestedConnectionsWidget();
    }
});
