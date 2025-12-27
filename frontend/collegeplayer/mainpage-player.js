// Dashboard Main Page JavaScript - College Player Version

document.addEventListener('DOMContentLoaded', async function() {

    // Verify user is on the correct player page, redirect if needed
    await verifyPlayerType();

    // Update sidebar footer with user info
    await updateSidebarFooter();

    // Update unread messages badge
    await updateUnreadMessagesBadge();
    // Refresh unread count every 30 seconds
    setInterval(updateUnreadMessagesBadge, 30000);

    // Update unread notifications badge
    await updateUnreadNotificationsBadge();
    // Refresh notification count every 30 seconds
    setInterval(updateUnreadNotificationsBadge, 30000);

    // Sidebar Toggle Functionality
    const sidebarToggle = document.getElementById('sidebarToggle');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');
    const dashboardContainer = document.getElementById('dashboardContainer');

    // Check if sidebar states are saved in localStorage
    const sidebarHidden = localStorage.getItem('playerSidebarHidden') === 'true';
    const rightSidebarHidden = localStorage.getItem('playerRightSidebarHidden') === 'true';

    if (sidebarHidden) {
        dashboardContainer.classList.add('sidebar-hidden');
        document.body.classList.add('sidebar-hidden');
    }

    if (rightSidebarHidden) {
        dashboardContainer.classList.add('right-sidebar-hidden');
    }

    // Left sidebar toggle
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            const isHidden = dashboardContainer.classList.toggle('sidebar-hidden');
            document.body.classList.toggle('sidebar-hidden', isHidden);
            localStorage.setItem('playerSidebarHidden', isHidden);
        });
    }

    // Right sidebar toggle
    if (rightSidebarToggle) {
        rightSidebarToggle.addEventListener('click', function() {
            const isHidden = dashboardContainer.classList.toggle('right-sidebar-hidden');
            localStorage.setItem('playerRightSidebarHidden', isHidden);
        });
    }

    // Post creation functionality
    const postInput = document.querySelector('.post-input');
    // Post button handler removed - now handled by feed.js
    // const postSubmitBtn = document.querySelector('.btn-post-submit');
    // Event listener moved to shared/feed.js for dynamic feed functionality

    // Post action buttons - handled by shared/feed.js for dynamic posts

    // Follow buttons
    const followBtns = document.querySelectorAll('.btn-follow');
    followBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            if (this.textContent === 'Follow') {
                this.textContent = 'Following';
                this.style.background = 'rgba(18, 130, 162, 0.2)';
            } else {
                this.textContent = 'Follow';
                this.style.background = '';
            }
        });
    });

    // Search functionality
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const query = this.value.trim();
                if (query) {
                    console.log('Searching for:', query);
                    alert('Search functionality will be connected to your backend.');
                }
            }
        });
    }

    // Post options buttons
    const postOptionBtns = document.querySelectorAll('.post-option-btn');
    postOptionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const title = this.getAttribute('title');
            console.log('Post option clicked:', title);
            alert(`${title} functionality will be connected to your backend.`);
        });
    });

    // User menu
    const userMenu = document.querySelector('.user-menu');
    // Skip if already initialized by my-profile.js (which sets up proper navigation)
    if (userMenu && !userMenu.hasAttribute('data-dropdown-initialized')) {
        userMenu.addEventListener('click', function(e) {
            e.stopPropagation();

            // Remove existing menu if any
            const existingMenu = document.querySelector('.user-dropdown-menu');
            if (existingMenu) {
                existingMenu.remove();
                return;
            }

            // Create dropdown menu
            const dropdown = document.createElement('div');
            dropdown.className = 'user-dropdown-menu';
            dropdown.innerHTML = `
                <div class="dropdown-item" data-action="profile">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </div>
                <div class="dropdown-item" data-action="settings">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                </div>
                <div class="dropdown-divider"></div>
                <div class="dropdown-item dropdown-item-danger" data-action="logout">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    <span>Logout</span>
                </div>
            `;

            // Position dropdown
            const rect = userMenu.getBoundingClientRect();
            dropdown.style.position = 'fixed';
            dropdown.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
            dropdown.style.left = rect.left + 'px';
            dropdown.style.width = rect.width + 'px';

            document.body.appendChild(dropdown);

            // Handle dropdown item clicks
            dropdown.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const action = this.dataset.action;

                    if (action === 'logout') {
                        dropdown.remove();
                        showLogoutModal();
                    } else if (action === 'profile') {
                        // Check if we're in tabs folder or main folder
                        const isInTabsFolder = window.location.pathname.includes('/tabs/');
                        window.location.href = isInTabsFolder ? 'my-profile.html' : 'tabs/my-profile.html';
                    } else if (action === 'settings') {
                        // Check if we're in tabs folder or main folder
                        const isInTabsFolder = window.location.pathname.includes('/tabs/');
                        window.location.href = isInTabsFolder ? 'settings.html' : 'tabs/settings.html';
                    }

                    dropdown.remove();
                });
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', function(e) {
            const dropdown = document.querySelector('.user-dropdown-menu');
            const currentUserMenu = document.querySelector('.user-menu');
            if (dropdown && !dropdown.contains(e.target) && currentUserMenu && !currentUserMenu.contains(e.target)) {
                dropdown.remove();
            }
        });
    }

    // Trending items
    const trendingItems = document.querySelectorAll('.trending-item');
    trendingItems.forEach(item => {
        item.addEventListener('click', function() {
            const name = this.querySelector('.trending-name').textContent;
            console.log('Viewing profile:', name);
            alert(`Viewing ${name}'s profile...`);
        });
    });

    // Widget show more buttons
    const showMoreBtns = document.querySelectorAll('.widget-show-more');
    showMoreBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            console.log('Show more clicked');
            alert('Show more functionality will be implemented.');
        });
    });

    // Post more button
    const postMoreBtns = document.querySelectorAll('.post-more-btn');
    postMoreBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            console.log('Post options clicked');
            alert('Post options menu will be implemented.');
        });
    });

    // Auto-resize textarea
    if (postInput) {
        postInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }

    // Smooth scroll for feed
    const feedPosts = document.querySelector('.feed-posts');
    if (feedPosts) {
        // Infinite scroll placeholder
        window.addEventListener('scroll', function() {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                console.log('Near bottom - load more posts');
                // This is where you'd load more posts from your backend
            }
        });
    }

    // Logout modal function
    function showLogoutModal() {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'logout-modal-overlay';
        modal.innerHTML = `
            <div class="logout-modal">
                <div class="logout-modal-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </div>
                <h2 class="logout-modal-title">Logout</h2>
                <p class="logout-modal-text">Are you sure you want to logout?</p>
                <div class="logout-modal-actions">
                    <button class="logout-modal-btn logout-modal-btn-cancel" id="logoutCancel">Cancel</button>
                    <button class="logout-modal-btn logout-modal-btn-confirm" id="logoutConfirm">Logout</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Handle cancel
        document.getElementById('logoutCancel').addEventListener('click', () => {
            modal.remove();
        });

        // Handle confirm
        document.getElementById('logoutConfirm').addEventListener('click', () => {
            // Clear authentication
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // Redirect to landing page - check if we're in tabs folder or main folder
            const isInTabsFolder = window.location.pathname.includes('/tabs/');
            window.location.href = isInTabsFolder ? '../../landingpage/index.html' : '../landingpage/index.html';
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    console.log('Direct Recruit Player Dashboard Loaded');
});

// Update sidebar footer with current user info
async function updateSidebarFooter() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            const userRole = response.user.role;

            // Update name
            const userName = document.querySelector('.sidebar-footer .user-name');
            if (userName) {
                userName.textContent = `${profile.first_name} ${profile.last_name}`;
            }

            // Update role/info line
            const userRoleElement = document.querySelector('.sidebar-footer .user-role');
            if (userRoleElement) {
                const parts = [];

                if (userRole === 'player') {
                    // Player: Position(s), School Name, Division
                    if (profile.position) parts.push(profile.position);
                    if (profile.high_school) parts.push(profile.high_school);
                    if (profile.college_division) {
                        // Add "D1" prefix for FBS/FCS divisions
                        const div = profile.college_division;
                        if (div === 'FBS' || div === 'FCS') {
                            parts.push(`D1 ${div}`);
                        } else {
                            parts.push(div);
                        }
                    }
                } else if (userRole === 'coach') {
                    // Coach: Position Title, College, State
                    if (profile.position_title) parts.push(profile.position_title);
                    if (profile.college_name) parts.push(profile.college_name);
                    if (profile.state) parts.push(profile.state);
                }

                userRoleElement.textContent = parts.join(' • ') || (userRole === 'player' ? 'Player' : 'Coach');
            }

            // Update avatar and show it (was hidden initially to prevent flash)
            const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
            if (avatarElement) {
                if (profile.profile_image_url) {
                    avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
                avatarElement.style.visibility = 'visible';
            }
        }
    } catch (error) {
        console.error('Error updating sidebar footer:', error);
    }
}

// Verify user is on the correct player page (College player page)
// HS players should be redirected to hsplayer folder
// Transfer players should be redirected to transferplayer folder
// Skip redirect if viewing another user's profile (has username parameter)
async function verifyPlayerType() {
    try {
        // Skip verification if viewing another user's profile
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('username')) {
            return; // Don't redirect when viewing someone else's profile
        }

        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            // Check if user is a transfer player first - they should go to transferplayer folder
            const isTransferPlayer = response.user.is_transfer_player;
            if (isTransferPlayer) {
                console.log('Transfer player detected on college page, redirecting to transfer portal...');
                window.location.href = '../transferplayer/mainpage-player.html';
                return;
            }

            const collegeDivision = response.profile.college_division;
            const collegeDivisions = ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'D1 FBS', 'D1 FCS', 'JUCO', 'Division II', 'Division III'];

            // If user is NOT a college player (no division), redirect to hsplayer folder
            const isCollegePlayer = collegeDivision && collegeDivisions.includes(collegeDivision);

            if (!isCollegePlayer) {
                console.log('HS player detected on college page, redirecting...');
                window.location.href = '../hsplayer/mainpage-player.html';
                return;
            }
        }
    } catch (error) {
        console.error('Error verifying player type:', error);
    }
}

// Update unread messages badge in sidebar
async function updateUnreadMessagesBadge() {
    try {
        const response = await API.get('/messages/unread-count');
        const badge = document.querySelector('.nav-item[href*="messages"] .notification-badge');

        if (badge && response.unreadCount !== undefined) {
            if (response.unreadCount > 0) {
                badge.textContent = response.unreadCount > 99 ? '99+' : response.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error updating unread messages badge:', error);
    }
}

// Update unread notifications badge in sidebar
async function updateUnreadNotificationsBadge() {
    try {
        const response = await API.notifications.getUnreadCount();
        const badge = document.querySelector('.nav-item[href*="notifications"] .notification-badge');

        if (badge && response.unreadCount !== undefined) {
            if (response.unreadCount > 0) {
                badge.textContent = response.unreadCount > 99 ? '99+' : response.unreadCount;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error updating unread notifications badge:', error);
    }
}
