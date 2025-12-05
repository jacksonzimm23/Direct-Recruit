// My Profile JavaScript - Dynamic Version

let currentProfile = null;
let currentUserId = null;
let viewingUserId = null;
let isOwnProfile = true;
let isCollegeCoach = false;
let currentProfileType = 'player'; // Track whether viewing a player or coach profile
let loggedInUserFolder = null; // Track the logged-in user's folder for navigation
let editSelectedPositions = []; // Track selected positions in edit modal

// Format phone number as (XXX) XXX-XXXX
function formatPhoneNumber(phone) {
    if (!phone) return '';
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.substring(0, 3) + ') ' + digits.substring(3);
    return '(' + digits.substring(0, 3) + ') ' + digits.substring(3, 6) + '-' + digits.substring(6, 10);
}

// Helper function to format height
function formatHeight(height) {
    if (!height) return null;

    // If it's already a string with ' or ", return as-is
    if (typeof height === 'string' && (height.includes("'") || height.includes('"'))) {
        return height;
    }

    // If it's a number (total inches), convert to feet'inches" format
    if (typeof height === 'number') {
        const feet = Math.floor(height / 12);
        const inches = height % 12;
        return `${feet}'${inches}"`;
    }

    return height;
}

document.addEventListener('DOMContentLoaded', async function() {
    // Hide sidebar footer initially to prevent flash of old content
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
        sidebarFooter.style.opacity = '0';
    }

    // Get username from URL if viewing someone else's profile
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');

    // Load current user first
    await loadCurrentUser();

    // Load profile data
    if (username) {
        await loadProfileByUsername(username);
    } else {
        await loadOwnProfile();
    }

    setupUI();
});

async function loadCurrentUser() {
    try {
        const response = await API.get('/auth/me');
        if (response.user) {
            currentUserId = response.user.id;
            isCollegeCoach = response.user.is_college_coach || false;

            // Update navbar links to match logged-in user's folder (not the viewed profile's folder)
            updateNavbarForLoggedInUser(response.user.role, response.profile);
        }
    } catch (error) {
        console.error('Failed to load current user:', error);
    }
}

// Rebuild the entire navbar to match the logged-in user's profile type
// This ensures the navbar stays consistent when viewing other profiles
function updateNavbarForLoggedInUser(role, profile) {
    // Determine the correct folder for the logged-in user
    let userFolder;
    let isCollege = false;

    if (role === 'player') {
        isCollege = profile && profile.college_division && profile.college_division.trim() !== '';
        userFolder = isCollege ? 'collegeplayer' : 'hsplayer';
    } else if (role === 'coach') {
        isCollege = profile && profile.college_division && profile.college_division.trim() !== '';
        userFolder = isCollege ? 'collegecoach' : 'hscoach';
    } else {
        return; // Unknown role, don't modify
    }

    // Save to global for use in setupUI navigation handlers
    loggedInUserFolder = userFolder;

    const mainPage = role === 'player' ? 'mainpage-player.html' : 'mainpage-coach.html';

    // Rebuild the sidebar nav with the correct items for the logged-in user
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
        let navHTML = '';

        if (role === 'player') {
            // Player nav items (same for HS and college players)
            navHTML = `
                <a href="/frontend/${userFolder}/${mainPage}" class="nav-item active" id="feedNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span>Feed</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/discover-players.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span>Discover</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/my-profile.html" class="nav-item" id="profileNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/messages.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Messages</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/notifications.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/settings.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                </a>
            `;
        } else if (role === 'coach') {
            // Coach nav items - different for HS vs college coaches
            navHTML = `
                <a href="/frontend/${userFolder}/${mainPage}" class="nav-item active" id="feedNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span>Feed</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/discover-players.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span>Discover</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/my-profile.html" class="nav-item" id="profileNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/messages.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Messages</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/notifications.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                </a>
                ${isCollege ? `
                <a href="/frontend/${userFolder}/tabs/recruiting-board.html" class="nav-item" id="recruitingBoardNav">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                        <line x1="15" y1="3" x2="15" y2="21"></line>
                        <line x1="3" y1="9" x2="21" y2="9"></line>
                        <line x1="3" y1="15" x2="21" y2="15"></line>
                    </svg>
                    <span>Recruiting Board</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/transfer-portal.html" class="nav-item" id="transferPortalNav">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 12h8"></path>
                        <path d="M12 8v8"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>Transfer Portal</span>
                </a>
                ` : ''}
                <a href="/frontend/${userFolder}/tabs/settings.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                </a>
            `;
        }

        sidebarNav.innerHTML = navHTML;
    }

    // Update sidebar footer with logged-in user's info (just update text content, preserve structure)
    // Apply inline styles to ensure consistent appearance regardless of which page's CSS is loaded
    if (profile) {
        // Define color based on logged-in user's role (players = cerulean/blue, coaches = orange)
        const userRoleColor = role === 'player' ? '#1282a2' : '#e07a5f';

        // Update name
        const userName = document.querySelector('.sidebar-footer .user-name');
        if (userName) {
            userName.textContent = `${profile.first_name} ${profile.last_name}`;
        }

        // Update role/info based on logged-in user's specific profile type (userFolder)
        const userRole = document.querySelector('.sidebar-footer .user-role');
        if (userRole) {
            // Apply inline color style to override any page CSS
            userRole.style.color = userRoleColor;

            const parts = [];
            if (userFolder === 'hsplayer') {
                // HS Player: position • height • weight lbs • state
                if (profile.position) parts.push(profile.position);
                if (profile.height) parts.push(profile.height);
                if (profile.weight) parts.push(`${profile.weight} lbs`);
                if (profile.state) parts.push(profile.state);
                userRole.textContent = parts.join(' • ') || 'Player';
            } else if (userFolder === 'collegeplayer') {
                // College Player: position • high_school
                if (profile.position) parts.push(profile.position);
                if (profile.high_school) parts.push(profile.high_school);
                userRole.textContent = parts.join(' • ') || 'Player';
            } else if (userFolder === 'hscoach') {
                // HS Coach: college_name, state (comma separator)
                if (profile.college_name) parts.push(profile.college_name);
                if (profile.state) parts.push(profile.state);
                userRole.textContent = parts.join(', ') || 'HS Coach';
            } else if (userFolder === 'collegecoach') {
                // College Coach: college_name • division
                if (profile.college_name) parts.push(profile.college_name);
                if (profile.college_division) parts.push(profile.college_division);
                userRole.textContent = parts.join(' • ') || 'College Coach';
            }
        }

        // Update avatar if available
        if (profile.profile_image_url) {
            const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
            if (avatarElement) {
                avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
        }

        // Show sidebar footer now that content is loaded
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter) {
            sidebarFooter.style.opacity = '1';
            sidebarFooter.style.transition = 'opacity 0.2s ease';
        }
    }

    // Setup user menu dropdown functionality
    setupUserMenuDropdown(userFolder);
}

// Setup the user menu dropdown with proper event listeners
function setupUserMenuDropdown(userFolder) {
    const userMenu = document.querySelector('.user-menu');
    if (!userMenu) return;

    // Remove existing listener by cloning and replacing (to avoid duplicate listeners)
    const newUserMenu = userMenu.cloneNode(true);
    userMenu.parentNode.replaceChild(newUserMenu, userMenu);

    // Mark as initialized so mainpage JS doesn't override
    newUserMenu.setAttribute('data-dropdown-initialized', 'true');

    newUserMenu.addEventListener('click', function(e) {
        e.stopPropagation();

        // Remove existing menu if any
        const existingMenu = document.querySelector('.user-dropdown-menu');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }

        // Create dropdown menu with inline styles for consistency across all pages
        const dropdown = document.createElement('div');
        dropdown.className = 'user-dropdown-menu';

        // Apply inline styles to ensure consistent appearance
        dropdown.style.cssText = `
            background: rgba(10, 17, 40, 0.98);
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
            z-index: 1001;
            backdrop-filter: blur(10px);
        `;

        dropdown.innerHTML = `
            <div class="dropdown-item" data-action="profile" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; color: white; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2" style="width: 20px; height: 20px; flex-shrink: 0;">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                <span>My Profile</span>
            </div>
            <div class="dropdown-item" data-action="settings" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; color: white; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2" style="width: 20px; height: 20px; flex-shrink: 0;">
                    <circle cx="12" cy="12" r="3"></circle>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                <span>Settings</span>
            </div>
            <div style="height: 1px; background: rgba(18, 130, 162, 0.2); margin: 0.25rem 0;"></div>
            <div class="dropdown-item" data-action="logout" style="display: flex; align-items: center; gap: 0.75rem; padding: 0.85rem 1rem; color: #ff6b6b; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2" style="width: 20px; height: 20px; flex-shrink: 0;">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                    <polyline points="16 17 21 12 16 7"></polyline>
                    <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                <span>Logout</span>
            </div>
        `;

        // Position dropdown
        const rect = newUserMenu.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';

        document.body.appendChild(dropdown);

        // Add hover effects via JS since inline styles can't handle :hover
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('mouseenter', function() {
                if (this.dataset.action === 'logout') {
                    this.style.background = 'rgba(255, 107, 107, 0.1)';
                } else {
                    this.style.background = 'rgba(18, 130, 162, 0.15)';
                }
            });
            item.addEventListener('mouseleave', function() {
                this.style.background = 'transparent';
            });
        });

        // Handle dropdown item clicks
        dropdown.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                const action = this.dataset.action;

                if (action === 'logout') {
                    dropdown.remove();
                    showLogoutModal(userFolder);
                } else if (action === 'profile') {
                    window.location.href = `/frontend/${userFolder}/tabs/my-profile.html`;
                } else if (action === 'settings') {
                    window.location.href = `/frontend/${userFolder}/tabs/settings.html`;
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

// Logout modal function
function showLogoutModal(userFolder) {
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
        // Redirect to landing page
        window.location.href = '/frontend/landingpage/index.html';
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

async function loadOwnProfile() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            currentProfile = response.profile;
            viewingUserId = response.user.id;
            isOwnProfile = true;
            displayProfile(response.profile, response.user.role);
        } else {
            showIncompleteProfile();
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile');
    }
}

async function loadProfileByUsername(username) {
    try {
        const response = await API.get(`/profile/username/${username}`);
        if (response.profile) {
            currentProfile = response.profile;
            viewingUserId = response.profile.user_id;
            isOwnProfile = currentUserId === viewingUserId;
            displayProfile(response.profile, response.type);
        } else {
            showError('Profile not found');
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile');
    }
}

function displayProfile(profile, type) {
    // Store the profile type globally
    currentProfileType = type;

    // Update profile name
    const nameElement = document.querySelector('.profile-name');
    if (nameElement) {
        nameElement.textContent = `${profile.first_name} ${profile.last_name}`;
    }

    // NOTE: Don't update sidebar footer here - it should always show the logged-in user's info
    // which is set by updateNavbarForLoggedInUser()

    // Add color-coded class to profile header
    const profileHeader = document.querySelector('.profile-header-simple');
    if (profileHeader) {
        profileHeader.classList.remove('player-profile', 'coach-profile', 'portal-profile');
        if (type === 'player') {
            // Check if portal player (you can add logic here to determine portal status)
            profileHeader.classList.add('player-profile');
        } else if (type === 'coach') {
            profileHeader.classList.add('coach-profile');
        }
    }

    if (type === 'player') {
        displayPlayerProfile(profile);
    } else {
        displayCoachProfile(profile);
    }

    // Update profile actions based on ownership
    updateProfileActions();

    // Update active nav item
    updateActiveNavItem();

    // Update bio in the About section between header and tabs
    const bioText = document.querySelector('.profile-info-row .bio-text');
    if (bioText) {
        bioText.textContent = profile.bio || 'No bio provided yet.';
    }

    // Update Contact Info section between header and tabs
    updateContactInfoSection(profile);

    // Update profile image if available
    if (profile.profile_image_url) {
        const avatarElement = document.querySelector('.profile-avatar-large');
        if (avatarElement) {
            avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    }

    // Show profile content now that data is loaded
    document.querySelector('.profile-content').classList.add('profile-loaded');

    // Also add to dashboard container so sidebar content shows
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer) {
        dashboardContainer.classList.add('profile-loaded');
    }

    // Load offers from database (for player profiles)
    if (type === 'player') {
        loadOffers();
    }

    // Load follower/following counts from database
    loadFollowCounts(profile.user_id);
}

// Load and display follower/following counts from the database
async function loadFollowCounts(userId) {
    try {
        const response = await followAPI.getCounts(userId);
        if (response) {
            const followersCountEl = document.getElementById('followersCount');
            const followingCountEl = document.getElementById('followingCount');

            if (followersCountEl) {
                followersCountEl.textContent = response.followers_count || 0;
            }
            if (followingCountEl) {
                followingCountEl.textContent = response.following_count || 0;
            }
        }
    } catch (error) {
        console.error('Error loading follow counts:', error);
        // Keep showing 0 as fallback
    }
}

function displayPlayerProfile(profile) {
    // Row 1: Position, Height, Weight (all in blue)
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        const parts = [];

        // Handle position - can be a single position or array of positions
        if (profile.position) {
            // If position is an array, join with slashes; otherwise use as-is
            const positionDisplay = Array.isArray(profile.position)
                ? profile.position.join('/')
                : profile.position;
            parts.push(positionDisplay);
        }

        // Add height
        if (profile.height) {
            const formattedHeight = formatHeight(profile.height);
            if (formattedHeight) parts.push(formattedHeight);
        }

        // Add weight
        if (profile.weight) {
            const weightStr = String(profile.weight);
            parts.push(weightStr.includes('lbs') ? weightStr : `${profile.weight} lbs`);
        }

        positionElement.textContent = parts.length > 0 ? parts.join(' • ') : 'Position not specified';
    }

    // Row 2 & 3: Class, GPA, School info
    const metaElement = document.querySelector('.profile-meta');
    if (metaElement) {
        const lines = [];

        // Row 2: Class of YYYY • GPA (if entered)
        const row2Parts = [];
        if (profile.graduation_year) row2Parts.push(`Class of ${profile.graduation_year}`);
        if (profile.gpa) row2Parts.push(`GPA: ${profile.gpa}`);
        if (row2Parts.length > 0) {
            lines.push(row2Parts.join(' <span>•</span> '));
        }

        // Row 3: High School Name, State OR College Name, Division
        const row3Parts = [];
        if (profile.high_school) {
            row3Parts.push(profile.high_school);
            if (profile.state) row3Parts.push(profile.state);
        } else if (profile.college_name) {
            row3Parts.push(profile.college_name);
            if (profile.college_division) row3Parts.push(profile.college_division);
        }
        if (row3Parts.length > 0) {
            lines.push(row3Parts.join(', '));
        }

        metaElement.innerHTML = lines.join('<br>') || 'Information not provided';
    }

    // Update username display
    const usernameElement = document.querySelector('.profile-username');
    if (usernameElement) {
        usernameElement.textContent = profile.username ? `@${profile.username}` : '';
    }

    // NOTE: Don't update sidebar footer here - it should always show the logged-in user's info
    // which is set by updateNavbarForLoggedInUser()

    // Update athletic information
    updateInfoItem('Position', profile.position);
    updateInfoItem('Height', formatHeight(profile.height));
    updateInfoItem('Weight', profile.weight ? (String(profile.weight).includes('lbs') ? profile.weight : `${profile.weight} lbs`) : null);

    // Update contact info in sidebar
    updateContactInfo(profile);

    // Update school info
    updateSchoolInfo(profile);
}

function displayCoachProfile(profile) {
    // Update position/title line
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        const parts = [];
        if (profile.position_title) parts.push(profile.position_title);
        if (profile.college_name) parts.push(profile.college_name);
        positionElement.textContent = parts.join(' • ') || 'Position not specified';
    }

    // Update meta info
    const metaElement = document.querySelector('.profile-meta');
    if (metaElement) {
        const parts = [];
        if (profile.college_division) parts.push(profile.college_division);
        if (profile.city && profile.state) parts.push(`${profile.city}, ${profile.state}`);
        if (profile.verified) parts.push('Verified ✓');

        metaElement.innerHTML = parts.join(' <span>•</span> ') || 'Information not provided';
    }

    // NOTE: Don't update sidebar footer here - it should always show the logged-in user's info
    // which is set by updateNavbarForLoggedInUser()

    // Update info items for coach
    updateInfoItem('Title', profile.position_title);
    updateInfoItem('College', profile.college_name);
    updateInfoItem('Division', profile.college_division);

    // Update contact info
    updateContactInfo(profile);
}

function updateInfoItem(label, value) {
    const infoItems = document.querySelectorAll('.info-item');
    infoItems.forEach(item => {
        const labelElement = item.querySelector('.info-label');
        const valueElement = item.querySelector('.info-value');
        if (labelElement && labelElement.textContent === label) {
            if (value) {
                valueElement.textContent = value;
                item.style.display = 'block';
            } else {
                item.style.display = 'none';
            }
        }
    });
}

function updateContactInfo(profile) {
    const contactInfoCard = document.querySelector('.profile-sidebar .info-card');
    if (!contactInfoCard) return;

    let contactHTML = '';

    if (profile.email) {
        contactHTML += `
            <div class="contact-item">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>${profile.email}</span>
            </div>
        `;
    }

    if (profile.phone) {
        contactHTML += `
            <div class="contact-item">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                <span>${profile.phone}</span>
            </div>
        `;
    }

    if (contactHTML) {
        contactInfoCard.innerHTML = contactHTML;
    } else {
        contactInfoCard.innerHTML = '<p>No contact information provided.</p>';
    }
}

// Update the Contact Info section between header and tabs
function updateContactInfoSection(profile) {
    const contactInfoCard = document.getElementById('contactInfoCard');
    if (!contactInfoCard) return;

    let contactHTML = '';

    if (profile.email) {
        contactHTML += `
            <div class="contact-item">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>${profile.email}</span>
            </div>
        `;
    }

    if (profile.phone) {
        const formattedPhone = formatPhoneNumber(profile.phone);
        contactHTML += `
            <div class="contact-item">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                <span>${formattedPhone}</span>
            </div>
        `;
    }

    if (contactHTML) {
        contactInfoCard.innerHTML = contactHTML;
    } else {
        contactInfoCard.innerHTML = '<p>No contact information provided.</p>';
    }
}

function updateSchoolInfo(profile) {
    const schoolSection = document.querySelector('.school-card');
    if (!schoolSection) return;

    if (profile.high_school) {
        const schoolName = schoolSection.querySelector('.school-name');
        const schoolLocation = schoolSection.querySelector('.school-location');
        const schoolClass = schoolSection.querySelector('.school-class');

        if (schoolName) schoolName.textContent = profile.high_school;
        if (schoolLocation && profile.city && profile.state) {
            schoolLocation.textContent = `${profile.city}, ${profile.state}`;
        }
        if (schoolClass && profile.graduation_year) {
            schoolClass.textContent = `Class of ${profile.graduation_year}`;
        }
    }
}

function updateProfileActions() {
    const actionsContainer = document.querySelector('.profile-actions');
    if (!actionsContainer) return;

    if (isOwnProfile) {
        // Show edit and share buttons
        actionsContainer.innerHTML = `
            <button class="btn-edit-profile" id="editProfileBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Profile
            </button>
            <button class="btn-share-profile">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
        `;

        // Setup edit profile button
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', function() {
                showEditProfileModal();
            });
        }
    } else {
        // Show back button, follow and message buttons
        actionsContainer.innerHTML = `
            <button class="btn-back" id="backBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"></path>
                </svg>
                Back
            </button>
            <button class="btn-follow" id="followBtn">Follow</button>
            <button class="btn-message" id="messageBtn">Message</button>
        `;

        // Setup back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        // Setup follow button
        setupFollowButton();
    }
}

async function setupFollowButton() {
    const followBtn = document.getElementById('followBtn');
    if (!followBtn || !viewingUserId) return;

    // Check follow status
    try {
        const response = await API.get(`/follow/${viewingUserId}/check`);
        const isFollowing = response.isFollowing;

        followBtn.textContent = isFollowing ? 'Following' : 'Follow';
        followBtn.classList.toggle('following', isFollowing);

        followBtn.addEventListener('click', async () => {
            try {
                const currentlyFollowing = followBtn.classList.contains('following');

                if (currentlyFollowing) {
                    await API.delete(`/follow/${viewingUserId}`);
                    followBtn.textContent = 'Follow';
                    followBtn.classList.remove('following');
                } else {
                    await API.post(`/follow/${viewingUserId}`);
                    followBtn.textContent = 'Following';
                    followBtn.classList.add('following');
                }

                // Update the follower count display after follow/unfollow
                loadFollowCounts(viewingUserId);
            } catch (error) {
                console.error('Error toggling follow:', error);
                alert('Failed to update follow status');
            }
        });
    } catch (error) {
        console.error('Error checking follow status:', error);
    }
}

function updateActiveNavItem() {
    const feedNavItem = document.getElementById('feedNavItem');
    const profileNavItem = document.getElementById('profileNavItem');

    if (feedNavItem && profileNavItem) {
        if (isOwnProfile) {
            // Viewing own profile - highlight My Profile
            feedNavItem.classList.remove('active');
            profileNavItem.classList.add('active');
        } else {
            // Viewing someone else's profile - highlight Feed
            profileNavItem.classList.remove('active');
            feedNavItem.classList.add('active');
        }
    }
}

function setupUI() {
    // Sidebar toggle functionality - mainpage-player.js handles the toggle event
    // This function only manages the sidebar visibility state
    const dashboardContainer = document.getElementById('dashboardContainer');
    const rightSidebar = document.getElementById('rightSidebar');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');

    // Use setTimeout to ensure this runs after mainpage-player.js DOMContentLoaded
    setTimeout(() => {
        // Show or hide right sidebar based on profile ownership
        if (isOwnProfile) {
            // Show toggle button for own profile
            if (rightSidebarToggle) {
                rightSidebarToggle.classList.add('show-toggle');
                rightSidebarToggle.style.display = ''; // Ensure button is visible
            }

            // Restore right sidebar state from localStorage
            // Remove any hidden class first to ensure we start fresh
            dashboardContainer.classList.remove('right-sidebar-hidden');

            // Then check if it should be hidden based on saved preference
            const rightSidebarHidden = localStorage.getItem('playerRightSidebarHidden') === 'true';
            if (rightSidebarHidden) {
                dashboardContainer.classList.add('right-sidebar-hidden');
            }
        } else {
            // Keep right sidebar hidden for other profiles
            dashboardContainer.classList.add('right-sidebar-hidden');
            if (rightSidebarToggle) {
                rightSidebarToggle.style.display = 'none';
            }
        }
    }, 0);

    // Tab switching
    const tabs = document.querySelectorAll('.profile-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Control tab visibility based on profile type
    const statsTab = document.querySelector('.profile-tab[data-tab="stats"]');
    const highlightsTab = document.querySelector('.profile-tab[data-tab="highlights"]');
    const academicsTab = document.querySelector('.profile-tab[data-tab="academics"]');
    const statsPane = document.getElementById('stats');
    const highlightsPane = document.getElementById('highlights');
    const academicsPane = document.getElementById('academics');

    if (currentProfileType === 'coach') {
        // Hide ALL player-specific tabs when viewing a coach profile
        if (statsTab) statsTab.style.display = 'none';
        if (highlightsTab) highlightsTab.style.display = 'none';
        if (academicsTab) academicsTab.style.display = 'none';
        if (statsPane) statsPane.style.display = 'none';
        if (highlightsPane) highlightsPane.style.display = 'none';
        if (academicsPane) academicsPane.style.display = 'none';
    } else if (currentProfileType === 'player') {
        // For player profiles, show all tabs
        if (statsTab) statsTab.style.display = '';
        if (highlightsTab) highlightsTab.style.display = '';
        if (academicsTab) academicsTab.style.display = '';
        if (statsPane) statsPane.style.display = '';
        if (highlightsPane) highlightsPane.style.display = '';
        if (academicsPane) academicsPane.style.display = '';

        // But hide academics from non-college-coaches when viewing others' profiles
        if (!isOwnProfile && !isCollegeCoach) {
            if (academicsTab) academicsTab.style.display = 'none';
            if (academicsPane) academicsPane.style.display = 'none';
        }

        // Update academics display with profile data
        if (typeof updateAcademicsDisplay === 'function') {
            updateAcademicsDisplay(currentProfile);
        }
    }

    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Share profile button
    const shareProfileBtn = document.querySelector('.btn-share-profile');
    if (shareProfileBtn && isOwnProfile) {
        shareProfileBtn.classList.add('show-button');
        shareProfileBtn.addEventListener('click', function() {
            const profileUrl = `${window.location.origin}/frontend/player/tabs/my-profile.html?username=${currentProfile.username}`;
            navigator.clipboard.writeText(profileUrl).then(() => {
                alert('Profile link copied to clipboard!');
            });
        });
    }

    // Change photo button - only allow upload on own profile
    const changePhotoBtn = document.querySelector('.btn-change-photo');
    const photoUploadInput = document.getElementById('photoUploadInput');

    if (changePhotoBtn) {
        if (isOwnProfile) {
            changePhotoBtn.classList.add('show-button');
            changePhotoBtn.style.display = 'flex';
            changePhotoBtn.addEventListener('click', function() {
                photoUploadInput.click();
            });

            if (photoUploadInput) {
                photoUploadInput.addEventListener('change', handlePhotoUpload);
            }
        } else {
            // Hide the camera button when viewing someone else's profile
            changePhotoBtn.style.display = 'none';
        }
    }

    // Handle "My Profile" nav click to ensure it always loads own profile
    const profileNavItem = document.getElementById('profileNavItem');
    if (profileNavItem) {
        profileNavItem.addEventListener('click', function(e) {
            // If we're already on my-profile.html and there's a username parameter
            // or viewing someone else's profile, force reload to own profile
            const urlParams = new URLSearchParams(window.location.search);
            const currentUsername = urlParams.get('username');

            if (currentUsername || !isOwnProfile) {
                e.preventDefault();
                // Navigate to logged-in user's profile using absolute path
                if (loggedInUserFolder) {
                    window.location.href = `/frontend/${loggedInUserFolder}/tabs/my-profile.html`;
                } else {
                    // Fallback to relative path if folder not set
                    window.location.href = 'my-profile.html';
                }
            }
        });
    }

    // Show edit buttons only for own profile (offers, stats, highlights)
    if (isOwnProfile) {
        const addOfferBtn = document.getElementById('addOfferBtn');
        const addStatsBtn = document.getElementById('addStatsBtn');
        const addSeasonHighlightBtn = document.getElementById('addSeasonHighlightBtn');
        const addGameHighlightBtn = document.getElementById('addGameHighlightBtn');

        if (addOfferBtn) addOfferBtn.classList.add('show-button');
        if (addStatsBtn) addStatsBtn.classList.add('show-button');
        if (addSeasonHighlightBtn) addSeasonHighlightBtn.classList.add('show-button');
        if (addGameHighlightBtn) addGameHighlightBtn.classList.add('show-button');
    }
}

async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        alert('Please select a valid image file (JPG, JPEG, or PNG)');
        event.target.value = '';
        return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
        alert('File size must be less than 5MB');
        event.target.value = '';
        return;
    }

    // Clear file input immediately
    event.target.value = '';

    // Open cropper modal
    if (window.imageCropper) {
        window.imageCropper.open(file, async (croppedFile) => {
            await uploadCroppedImage(croppedFile);
        });
    } else {
        // Fallback if cropper not loaded
        await uploadCroppedImage(file);
    }
}

async function uploadCroppedImage(file) {
    console.log('uploadCroppedImage called with file:', file);

    // Show loading state
    const avatarElement = document.getElementById('profileAvatar');
    const changePhotoBtn = document.getElementById('changePhotoBtn');

    if (!avatarElement) {
        console.error('profileAvatar element not found!');
        return;
    }

    const originalAvatarHTML = avatarElement.innerHTML;
    avatarElement.innerHTML = `
        <div class="upload-spinner">
            <div class="spinner"></div>
        </div>
    `;
    changePhotoBtn.disabled = true;
    changePhotoBtn.style.opacity = '0.5';

    try {
        console.log('Calling uploadAPI.uploadProfileImage...');
        // Upload to server
        const response = await uploadAPI.uploadProfileImage(file);
        console.log('Upload response:', response);

        if (response.imageUrl || response.url) {
            const imageUrl = response.imageUrl || response.url;

            // Update profile with new image URL
            currentProfile.profile_image_url = imageUrl;

            // Update avatar with timestamp to force reload
            const imageUrlWithTimestamp = `${imageUrl}?t=${Date.now()}`;
            avatarElement.innerHTML = `<img src="${imageUrlWithTimestamp}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

            // Update avatar in sidebar
            const sidebarAvatar = document.querySelector('.sidebar-footer .user-avatar-circle');
            if (sidebarAvatar) {
                sidebarAvatar.innerHTML = `<img src="${imageUrlWithTimestamp}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }

            // Show success message
            showSuccessMessage('Profile photo updated successfully!');
        } else {
            throw new Error('No image URL returned from server');
        }

    } catch (error) {
        console.error('Error uploading photo:', error);

        // Restore original avatar on error
        avatarElement.innerHTML = originalAvatarHTML;

        // Show error message
        alert(`Failed to upload photo: ${error.message}`);
    } finally {
        // Re-enable button
        changePhotoBtn.disabled = false;
        changePhotoBtn.style.opacity = '1';
    }
}

function showSuccessMessage(message) {
    // Create success toast
    const toast = document.createElement('div');
    toast.className = 'success-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #10b981;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

function showIncompleteProfile() {
    const mainContent = document.querySelector('.profile-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div style="text-align: center; padding: 4rem 2rem; color: white;">
                <h2>Complete Your Profile</h2>
                <p style="margin: 1rem 0 2rem; color: rgba(255,255,255,0.7);">
                    You haven't set up your profile yet. Complete your profile to get discovered by coaches!
                </p>
                <button onclick="window.location.href='../create-profile.html'" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
                    Complete Profile
                </button>
            </div>
        `;
        // Show content since we're done loading
        mainContent.classList.add('profile-loaded');

        // Also add to dashboard container so sidebar content shows
        const dashboardContainer = document.getElementById('dashboardContainer');
        if (dashboardContainer) {
            dashboardContainer.classList.add('profile-loaded');
        }
    }
}

function showError(message) {
    const mainContent = document.querySelector('.profile-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div style="text-align: center; padding: 4rem 2rem; color: #ff6b6b;">
                <h2>Error</h2>
                <p>${message}</p>
                <button onclick="window.location.href='../mainpage-player.html'" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; margin-top: 1rem;">
                    Back to Feed
                </button>
            </div>
        `;
        // Show content since we're done loading
        mainContent.classList.add('profile-loaded');

        // Also add to dashboard container so sidebar content shows
        const dashboardContainer = document.getElementById('dashboardContainer');
        if (dashboardContainer) {
            dashboardContainer.classList.add('profile-loaded');
        }
    }
}

// Edit Profile Modal Functions
function showEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        // Populate form with current profile data
        populateEditForm();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}

function populateEditForm() {
    if (!currentProfile) return;

    // Populate text inputs
    document.getElementById('editFirstName').value = currentProfile.first_name || '';
    document.getElementById('editLastName').value = currentProfile.last_name || '';
    document.getElementById('editUsername').value = currentProfile.username || '';

    // Store original username for validation
    originalUsername = currentProfile.username || '';
    isEditUsernameAvailable = true; // Start as true since it's the current username

    // Parse height - either from string "6'1"" or from integer (total inches)
    if (currentProfile.height) {
        let feet, inches;
        if (typeof currentProfile.height === 'string' && currentProfile.height.includes("'")) {
            // Parse from string format "6'1""
            const parts = currentProfile.height.replace('"', '').split("'");
            feet = parseInt(parts[0]) || 0;
            inches = parseInt(parts[1]) || 0;
        } else if (typeof currentProfile.height === 'number') {
            // Convert from total inches
            feet = Math.floor(currentProfile.height / 12);
            inches = currentProfile.height % 12;
        }
        document.getElementById('editHeightFt').value = feet || '';
        document.getElementById('editHeightIn').value = inches || '';
    } else {
        document.getElementById('editHeightFt').value = '';
        document.getElementById('editHeightIn').value = '';
    }

    document.getElementById('editWeight').value = currentProfile.weight || '';
    document.getElementById('editGraduationYear').value = currentProfile.graduation_year || '';
    document.getElementById('editGPA').value = currentProfile.gpa || '';

    // Determine if this is a college or high school player based on college_division
    const isCollegePlayer = currentProfile.college_division && currentProfile.college_division.trim() !== '';

    const schoolTypeHS = document.getElementById('editSchoolTypeHS');
    const schoolTypeCollege = document.getElementById('editSchoolTypeCollege');
    const highschoolFields = document.getElementById('editHighschoolFields');
    const collegeFields = document.getElementById('editCollegeFields');

    if (isCollegePlayer) {
        // Show college fields and set active button
        if (schoolTypeCollege) schoolTypeCollege.classList.add('active');
        if (schoolTypeHS) schoolTypeHS.classList.remove('active');
        if (collegeFields) collegeFields.style.display = 'block';
        if (highschoolFields) highschoolFields.style.display = 'none';

        // Populate college fields
        const collegeName = document.getElementById('editCollegeName');
        const collegeState = document.getElementById('editCollegeState');
        const division = document.getElementById('editDivision');

        if (collegeName) collegeName.value = currentProfile.high_school || ''; // Using high_school field for college name
        if (collegeState) collegeState.value = currentProfile.state || '';
        if (division) division.value = currentProfile.college_division || '';
    } else {
        // Show high school fields and set active button
        if (schoolTypeHS) schoolTypeHS.classList.add('active');
        if (schoolTypeCollege) schoolTypeCollege.classList.remove('active');
        if (highschoolFields) highschoolFields.style.display = 'block';
        if (collegeFields) collegeFields.style.display = 'none';

        // Populate high school fields
        const highSchoolName = document.getElementById('editHighSchool');
        const hsState = document.getElementById('editHSState');

        if (highSchoolName) highSchoolName.value = currentProfile.high_school || '';
        if (hsState) hsState.value = currentProfile.state || '';
    }

    // Populate bio, email, and phone
    const bio = document.getElementById('editBio');
    const email = document.getElementById('editEmail');
    const phone = document.getElementById('editPhone');

    if (bio) {
        bio.value = currentProfile.bio || '';
        // Update character counter
        const charCounter = document.getElementById('bioCharCounter');
        if (charCounter) {
            const currentLength = bio.value.length;
            charCounter.textContent = `${currentLength}/150`;
            charCounter.classList.toggle('limit-reached', currentLength >= 150);
        }
    }
    if (email) email.value = currentProfile.email || '';
    if (phone) phone.value = formatPhoneNumber(currentProfile.phone) || '';

    // Clear all position checkboxes first
    const positionCheckboxes = document.querySelectorAll('#editPositionsContainer input[name="position"]');
    positionCheckboxes.forEach(checkbox => checkbox.checked = false);

    // Clear selected positions array
    editSelectedPositions = [];

    // Handle position - can be string "CB/WR" or array ["CB", "WR"]
    if (currentProfile.position) {
        let positions = [];
        if (Array.isArray(currentProfile.position)) {
            positions = currentProfile.position;
        } else if (typeof currentProfile.position === 'string') {
            // Split by "/" to handle "CB/WR" format
            positions = currentProfile.position.split('/').map(p => p.trim());
        }

        // Check the appropriate checkboxes
        positions.forEach(pos => {
            const checkbox = document.querySelector(`#editPositionsContainer input[name="position"][value="${pos}"]`);
            if (checkbox) {
                checkbox.checked = true;
                editSelectedPositions.push(pos);
            }
        });

        // Update display
        updateEditSelectedPositions();
    }

    // Add visual indicator for empty fields
    markEmptyFields();
}

function markEmptyFields() {
    const inputs = document.querySelectorAll('#editProfileForm input, #editProfileForm select');
    inputs.forEach(input => {
        if (!input.value || input.value === '') {
            input.classList.add('empty-field');
        } else {
            input.classList.remove('empty-field');
        }

        // Update on input
        input.addEventListener('input', function() {
            if (this.value) {
                this.classList.remove('empty-field');
            } else {
                this.classList.add('empty-field');
            }
        });
    });
}

function hideEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
    }
}

// Update selected positions display in edit modal
function updateEditSelectedPositions() {
    const container = document.getElementById('editSelectedPositions');
    if (!container) return;

    container.innerHTML = '';

    editSelectedPositions.forEach(position => {
        const pill = document.createElement('div');
        pill.className = 'selected-item';
        pill.innerHTML = `
            ${position}
            <button type="button" class="remove-item" data-position="${position}">×</button>
        `;
        container.appendChild(pill);
    });

    // Add click handlers to remove buttons
    document.querySelectorAll('#editSelectedPositions .remove-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const position = this.dataset.position;
            editSelectedPositions = editSelectedPositions.filter(pos => pos !== position);

            // Uncheck the checkbox
            const checkbox = document.querySelector(`#editPositionsContainer input[name="position"][value="${position}"]`);
            if (checkbox) checkbox.checked = false;

            updateEditSelectedPositions();
        });
    });
}

async function saveProfileChanges() {
    try {
        // Validate at least one position is selected
        if (editSelectedPositions.length === 0) {
            alert('Please select at least one position.');
            return;
        }

        // Validate username is available (if it was changed)
        const newUsername = document.getElementById('editUsername').value.trim();
        if (newUsername !== originalUsername && !isEditUsernameAvailable) {
            // Just focus on the username field and keep modal open - don't show alert
            document.getElementById('editUsername').focus();
            return;
        }

        // Show loading state
        const saveBtn = document.getElementById('btnModalSave');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        // Format height as feet'inches" string
        const heightFt = parseInt(document.getElementById('editHeightFt').value) || 0;
        const heightIn = parseInt(document.getElementById('editHeightIn').value) || 0;
        const heightString = (heightFt > 0 || heightIn > 0) ? `${heightFt}'${heightIn}"` : null;

        // Get phone number and extract only digits for storage
        const phoneInput = document.getElementById('editPhone').value;
        const phoneDigits = phoneInput.replace(/\D/g, '');

        // Determine which school type is active
        const schoolTypeCollege = document.getElementById('editSchoolTypeCollege');
        const isCollegePlayer = schoolTypeCollege && schoolTypeCollege.classList.contains('active');

        // Get form data - save positions as slash-separated string
        const formData = {
            first_name: document.getElementById('editFirstName').value,
            last_name: document.getElementById('editLastName').value,
            username: document.getElementById('editUsername').value,
            position: editSelectedPositions.join('/'), // Join multiple positions with slash (e.g., "CB/WR")
            height: heightString, // Store as formatted string (e.g., "6'1"")
            weight: document.getElementById('editWeight').value ? parseInt(document.getElementById('editWeight').value) : null,
            graduation_year: document.getElementById('editGraduationYear').value ? parseInt(document.getElementById('editGraduationYear').value) : null,
            gpa: document.getElementById('editGPA').value ? parseFloat(document.getElementById('editGPA').value) : null,
            bio: document.getElementById('editBio').value,
            email: document.getElementById('editEmail').value,
            phone: phoneDigits
        };

        // Add school fields based on type
        if (isCollegePlayer) {
            formData.high_school = document.getElementById('editCollegeName').value;
            formData.state = document.getElementById('editCollegeState').value;
            formData.college_division = document.getElementById('editDivision').value;
        } else {
            formData.high_school = document.getElementById('editHighSchool').value;
            formData.state = document.getElementById('editHSState').value;
            formData.college_division = null; // Clear college division for HS players
        }

        // Send update request
        const response = await API.put('/profile', formData);

        if (response.success || response.profile) {
            // Update currentProfile - use response.profile which has the database formatted data
            if (response.profile) {
                currentProfile = response.profile;
            } else {
                // If response.profile not available, merge formData but keep database types
                currentProfile = { ...currentProfile, ...formData };
            }

            // Refresh the profile display
            displayProfile(currentProfile, 'player');

            // Update academics display if GPA was changed
            if (typeof updateAcademicsDisplay === 'function') {
                updateAcademicsDisplay(currentProfile);
            }

            // Show success message
            showSuccessMessage('Profile updated successfully!');

            // Close modal
            hideEditProfileModal();
        } else {
            throw new Error(response.message || 'Failed to update profile');
        }

        // Restore button
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;

    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Failed to save profile changes: ' + error.message);

        // Restore button
        const saveBtn = document.getElementById('btnModalSave');
        saveBtn.textContent = 'Save Changes';
        saveBtn.disabled = false;
    }
}

// Username validation for edit modal
let editUsernameCheckTimeout;
let isEditUsernameAvailable = false;
let originalUsername = '';

function setupUsernameValidation() {
    const editUsernameInput = document.getElementById('editUsername');
    const editUsernameError = document.getElementById('editUsernameError');
    const editUsernameHint = document.getElementById('editUsernameHint');

    if (editUsernameInput && editUsernameError) {
        editUsernameInput.addEventListener('input', function() {
            // Convert to lowercase automatically
            this.value = this.value.toLowerCase();
            const username = this.value.trim();

            // Clear previous timeout
            clearTimeout(editUsernameCheckTimeout);

            // Reset error state
            editUsernameError.style.display = 'none';
            editUsernameHint.style.display = 'block';
            editUsernameInput.style.borderColor = '';
            isEditUsernameAvailable = false;

            // If username hasn't changed from original, it's valid
            if (username === originalUsername) {
                editUsernameInput.style.borderColor = '#4caf50';
                isEditUsernameAvailable = true;
                return;
            }

            // Only check if username is not empty and matches pattern (lowercase letters, numbers, underscore)
            if (username.length >= 3 && /^[a-z0-9_]+$/.test(username)) {
                // Debounce API call by 500ms
                editUsernameCheckTimeout = setTimeout(async () => {
                    try {
                        const response = await API.get(`/profile/check-username/${username}`);

                        if (!response.available) {
                            // Username is taken
                            editUsernameError.style.display = 'block';
                            editUsernameHint.style.display = 'none';
                            editUsernameInput.style.borderColor = '#ff6b6b';
                            isEditUsernameAvailable = false;
                        } else {
                            // Username is available
                            editUsernameInput.style.borderColor = '#4caf50';
                            isEditUsernameAvailable = true;
                        }
                    } catch (error) {
                        console.error('Error checking username:', error);
                    }
                }, 500);
            }
        });
    }
}

function setupEditSchoolTypeToggle() {
    const schoolTypeButtons = document.querySelectorAll('.school-type-btn');
    const highschoolFields = document.getElementById('editHighschoolFields');
    const collegeFields = document.getElementById('editCollegeFields');

    schoolTypeButtons.forEach(button => {
        // Remove any existing listeners by cloning
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
    });

    // Re-query after cloning
    document.querySelectorAll('.school-type-btn').forEach(button => {
        button.addEventListener('click', function() {
            // Remove active class from all buttons
            document.querySelectorAll('.school-type-btn').forEach(btn => btn.classList.remove('active'));

            // Add active class to clicked button
            this.classList.add('active');

            // Show/hide appropriate fields
            if (this.dataset.type === 'highschool') {
                if (highschoolFields) highschoolFields.style.display = 'block';
                if (collegeFields) collegeFields.style.display = 'none';
            } else {
                if (highschoolFields) highschoolFields.style.display = 'none';
                if (collegeFields) collegeFields.style.display = 'block';
            }
        });
    });
}

// Set up modal event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Setup username validation
    setupUsernameValidation();

    // Setup school type toggle
    setupEditSchoolTypeToggle();

    // Close button
    const closeBtn = document.getElementById('editModalClose');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideEditProfileModal);
    }

    // Cancel button
    const cancelBtn = document.getElementById('btnModalCancel');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideEditProfileModal);
    }

    // Save button
    const saveBtn = document.getElementById('btnModalSave');
    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            await saveProfileChanges();
        });
    }

    // Close when clicking overlay
    const overlay = document.getElementById('editModalOverlay');
    if (overlay) {
        overlay.addEventListener('click', hideEditProfileModal);
    }

    // Close on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideEditProfileModal();
        }
    });

    // Handle position checkbox changes in edit modal
    const positionCheckboxes = document.querySelectorAll('#editPositionsContainer input[name="position"]');
    positionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                if (!editSelectedPositions.includes(this.value)) {
                    editSelectedPositions.push(this.value);
                }
            } else {
                editSelectedPositions = editSelectedPositions.filter(pos => pos !== this.value);
            }
            updateEditSelectedPositions();
        });
    });

    // Handle bio character counter
    const bioInput = document.getElementById('editBio');
    const charCounter = document.getElementById('bioCharCounter');
    if (bioInput && charCounter) {
        bioInput.addEventListener('input', function() {
            const currentLength = this.value.length;
            charCounter.textContent = `${currentLength}/150`;

            // Add/remove limit-reached class
            if (currentLength >= 150) {
                charCounter.classList.add('limit-reached');
            } else {
                charCounter.classList.remove('limit-reached');
            }
        });
    }

    // Handle "Show More" button for offers - navigate to Offers tab
    const showMoreOffersBtn = document.getElementById('showMoreOffers');
    if (showMoreOffersBtn) {
        showMoreOffersBtn.addEventListener('click', function() {
            // Find the Offers tab button and click it
            const offersTab = document.querySelector('.profile-tab[data-tab="offers"]');
            if (offersTab) {
                offersTab.click();
            }
        });
    }

    // Add Offer Modal handlers
    const addOfferBtn = document.getElementById('addOfferBtn');
    const addOfferModal = document.getElementById('addOfferModal');
    const addOfferModalClose = document.getElementById('addOfferModalClose');
    const addOfferModalOverlay = document.getElementById('addOfferModalOverlay');
    const btnAddOfferCancel = document.getElementById('btnAddOfferCancel');
    const btnAddOfferSave = document.getElementById('btnAddOfferSave');

    if (addOfferBtn) {
        addOfferBtn.addEventListener('click', function() {
            showAddOfferModal();
        });
    }

    if (addOfferModalClose) {
        addOfferModalClose.addEventListener('click', hideAddOfferModal);
    }

    if (addOfferModalOverlay) {
        addOfferModalOverlay.addEventListener('click', hideAddOfferModal);
    }

    if (btnAddOfferCancel) {
        btnAddOfferCancel.addEventListener('click', hideAddOfferModal);
    }

    if (btnAddOfferSave) {
        btnAddOfferSave.addEventListener('click', saveNewOffer);
    }

    // Handle phone number auto-formatting
    const phoneInput = document.getElementById('editPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            // Get cursor position before formatting
            const cursorPos = this.selectionStart;
            const oldLength = this.value.length;

            // Format the phone number
            const formatted = formatPhoneNumber(this.value);
            this.value = formatted;

            // Adjust cursor position after formatting
            const newLength = formatted.length;
            const diff = newLength - oldLength;

            // Set cursor position
            const newCursorPos = Math.max(0, cursorPos + diff);
            this.setSelectionRange(newCursorPos, newCursorPos);
        });

        // Prevent non-numeric input (except for formatting characters during paste)
        phoneInput.addEventListener('keypress', function(e) {
            // Allow control keys
            if (e.ctrlKey || e.metaKey) return;

            // Allow only digits
            if (!/\d/.test(e.key) && e.key !== 'Backspace' && e.key !== 'Delete' && e.key !== 'Tab') {
                e.preventDefault();
            }
        });
    }
});

// Add Offer Modal Functions
function showAddOfferModal() {
    const modal = document.getElementById('addOfferModal');
    if (modal) {
        // Clear form
        document.getElementById('offerCollegeName').value = '';
        document.getElementById('offerDivision').value = '';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideAddOfferModal() {
    const modal = document.getElementById('addOfferModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function saveNewOffer() {
    const collegeName = document.getElementById('offerCollegeName').value.trim();
    const division = document.getElementById('offerDivision').value;

    // Validate inputs
    if (!collegeName) {
        alert('Please enter a college or university name.');
        return;
    }

    if (!division) {
        alert('Please select a division.');
        return;
    }

    // Show loading state
    const saveBtn = document.getElementById('btnAddOfferSave');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Adding...';
    saveBtn.disabled = true;

    try {
        // Save to database
        const response = await API.post('/offers', { collegeName, division });

        if (response.success) {
            // Add the offer to the UI at the TOP of the list
            addOfferToGrid(collegeName, division, true);

            // Show success message
            showSuccessMessage('Offer added successfully!');

            // Close modal
            hideAddOfferModal();
        } else {
            throw new Error(response.error || 'Failed to add offer');
        }
    } catch (error) {
        console.error('Error saving offer:', error);
        alert('Failed to add offer: ' + error.message);
    } finally {
        // Restore button
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

function addOfferToGrid(collegeName, division, addToTop = false, offerIndex = null) {
    const offersGridFull = document.getElementById('offersGridFull');
    const offersGrid = document.getElementById('offersGrid');

    // Calculate the index if not provided
    if (offerIndex === null) {
        if (addToTop) {
            offerIndex = 0;
        } else {
            offerIndex = offersGridFull ? offersGridFull.querySelectorAll('.offer-item').length : 0;
        }
    }

    // Create new offer item HTML with data attributes and click handler (only for own profile in offers tab)
    const clickableClass = isOwnProfile ? 'offer-item-clickable' : '';
    const offerHTML = `
        <div class="offer-item ${clickableClass}" data-offer-index="${offerIndex}" data-college="${collegeName}" data-division="${division}">
            <div class="offer-logo">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                    <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                </svg>
            </div>
            <div class="offer-info">
                <div class="offer-details">${collegeName} • ${division}</div>
            </div>
        </div>
    `;

    // Add to full offers grid
    if (offersGridFull) {
        if (addToTop) {
            offersGridFull.insertAdjacentHTML('afterbegin', offerHTML);
            // Update indices of all existing offers when adding to top
            updateOfferIndices();
        } else {
            offersGridFull.insertAdjacentHTML('beforeend', offerHTML);
        }
    }

    // Update overview offers grid (show first 3) - not clickable
    const overviewOfferHTML = `
        <div class="offer-item" data-offer-index="${offerIndex}" data-college="${collegeName}" data-division="${division}">
            <div class="offer-logo">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                    <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                </svg>
            </div>
            <div class="offer-info">
                <div class="offer-details">${collegeName} • ${division}</div>
            </div>
        </div>
    `;

    if (offersGrid && addToTop) {
        // Insert at top
        offersGrid.insertAdjacentHTML('afterbegin', overviewOfferHTML);
        // Remove 4th item if exists (keep only 3)
        const existingOffers = offersGrid.querySelectorAll('.offer-item');
        if (existingOffers.length > 3) {
            existingOffers[3].remove();
        }
    } else if (offersGrid) {
        const existingOffers = offersGrid.querySelectorAll('.offer-item');
        if (existingOffers.length < 3) {
            offersGrid.insertAdjacentHTML('beforeend', overviewOfferHTML);
        }
    }

    // Update "Show More" button visibility based on total offers count
    const showMoreBtn = document.getElementById('showMoreOffers');
    if (showMoreBtn && offersGridFull) {
        const totalOffers = offersGridFull.querySelectorAll('.offer-item').length;
        showMoreBtn.style.display = totalOffers > 3 ? 'flex' : 'none';
    }
}

// Update all offer indices after adding/removing
function updateOfferIndices() {
    const offersGridFull = document.getElementById('offersGridFull');
    if (offersGridFull) {
        const offers = offersGridFull.querySelectorAll('.offer-item');
        offers.forEach((offer, index) => {
            offer.dataset.offerIndex = index;
        });
    }
}

// Load offers from database
async function loadOffers() {
    try {
        let response;
        if (isOwnProfile) {
            // Load own offers
            response = await API.get('/offers/my-offers');
        } else if (currentProfile && currentProfile.username) {
            // Load offers for the profile being viewed
            response = await API.get(`/offers/player/${currentProfile.username}`);
        } else {
            return;
        }

        // Clear existing placeholder offers
        const offersGridFull = document.getElementById('offersGridFull');
        const offersGrid = document.getElementById('offersGrid');
        const showMoreBtn = document.getElementById('showMoreOffers');

        if (offersGridFull) offersGridFull.innerHTML = '';
        if (offersGrid) offersGrid.innerHTML = '';

        if (response.offers && response.offers.length > 0) {
            // Add offers from database (already sorted by most recent)
            response.offers.forEach((offer, index) => {
                // Parse offer_data "School Name, Division"
                const parts = offer.offer_data.split(', ');
                const collegeName = parts[0] || '';
                const division = parts[1] || '';

                // Add to full grid with the correct index
                addOfferToGrid(collegeName, division, false, index);
            });

            // Update overview grid to show only first 3
            if (offersGrid) {
                const allOffers = offersGrid.querySelectorAll('.offer-item');
                allOffers.forEach((offer, index) => {
                    if (index >= 3) offer.remove();
                });
            }

            // Show/hide "Show More" button based on offer count
            if (showMoreBtn) {
                showMoreBtn.style.display = response.offers.length > 3 ? 'flex' : 'none';
            }
        } else {
            // No offers - hide the "Show More" button
            if (showMoreBtn) {
                showMoreBtn.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error loading offers:', error);
    }
}

// Edit Offer Modal Functions
function setupEditOfferModal() {
    const offersGridFull = document.getElementById('offersGridFull');
    const editOfferModal = document.getElementById('editOfferModal');
    const editOfferModalOverlay = document.getElementById('editOfferModalOverlay');
    const editOfferModalClose = document.getElementById('editOfferModalClose');
    const btnEditOfferCancel = document.getElementById('btnEditOfferCancel');
    const btnEditOfferSave = document.getElementById('btnEditOfferSave');
    const btnDeleteOffer = document.getElementById('btnDeleteOffer');

    // Delete confirmation modal elements
    const deleteConfirmOverlay = document.getElementById('deleteConfirmOverlay');
    const btnConfirmCancel = document.getElementById('btnConfirmCancel');
    const btnConfirmDelete = document.getElementById('btnConfirmDelete');

    // Click handler for offer items in the full grid (using event delegation)
    if (offersGridFull) {
        offersGridFull.addEventListener('click', (e) => {
            const offerItem = e.target.closest('.offer-item-clickable');
            if (offerItem && isOwnProfile) {
                const index = parseInt(offerItem.dataset.offerIndex);
                const college = offerItem.dataset.college;
                const division = offerItem.dataset.division;
                showEditOfferModal(index, college, division);
            }
        });
    }

    // Close modal handlers
    if (editOfferModalOverlay) {
        editOfferModalOverlay.addEventListener('click', hideEditOfferModal);
    }
    if (editOfferModalClose) {
        editOfferModalClose.addEventListener('click', hideEditOfferModal);
    }
    if (btnEditOfferCancel) {
        btnEditOfferCancel.addEventListener('click', hideEditOfferModal);
    }

    // Save changes handler
    if (btnEditOfferSave) {
        btnEditOfferSave.addEventListener('click', saveEditedOffer);
    }

    // Delete handler (shows confirmation modal)
    if (btnDeleteOffer) {
        btnDeleteOffer.addEventListener('click', deleteOffer);
    }

    // Delete confirmation modal handlers
    if (deleteConfirmOverlay) {
        deleteConfirmOverlay.addEventListener('click', hideDeleteConfirmModal);
    }
    if (btnConfirmCancel) {
        btnConfirmCancel.addEventListener('click', hideDeleteConfirmModal);
    }
    if (btnConfirmDelete) {
        btnConfirmDelete.addEventListener('click', confirmDeleteOffer);
    }
}

function showEditOfferModal(index, collegeName, division) {
    const modal = document.getElementById('editOfferModal');
    const indexInput = document.getElementById('editOfferIndex');
    const collegeInput = document.getElementById('editOfferCollegeName');
    const divisionSelect = document.getElementById('editOfferDivision');

    if (modal && indexInput && collegeInput && divisionSelect) {
        indexInput.value = index;
        collegeInput.value = collegeName;
        divisionSelect.value = division;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        collegeInput.focus();
    }
}

function hideEditOfferModal() {
    const modal = document.getElementById('editOfferModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function saveEditedOffer() {
    const indexInput = document.getElementById('editOfferIndex');
    const collegeInput = document.getElementById('editOfferCollegeName');
    const divisionSelect = document.getElementById('editOfferDivision');
    const saveBtn = document.getElementById('btnEditOfferSave');

    const offerIndex = parseInt(indexInput.value);
    const collegeName = collegeInput.value.trim();
    const division = divisionSelect.value;

    // Validate inputs
    if (!collegeName) {
        alert('Please enter a college or university name.');
        return;
    }
    if (!division) {
        alert('Please select a division.');
        return;
    }

    // Show loading state
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        const response = await API.put(`/offers/${offerIndex}`, { collegeName, division });

        if (response.success) {
            // Update the offer in the UI
            updateOfferInGrid(offerIndex, collegeName, division);

            showSuccessMessage('Offer updated successfully!');
            hideEditOfferModal();
        } else {
            throw new Error(response.error || 'Failed to update offer');
        }
    } catch (error) {
        console.error('Error updating offer:', error);
        alert('Failed to update offer: ' + error.message);
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

function deleteOffer() {
    // Show the custom confirmation modal
    showDeleteConfirmModal();
}

function showDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function hideDeleteConfirmModal() {
    const modal = document.getElementById('deleteConfirmModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function confirmDeleteOffer() {
    const indexInput = document.getElementById('editOfferIndex');
    const confirmBtn = document.getElementById('btnConfirmDelete');

    const offerIndex = parseInt(indexInput.value);

    // Show loading state
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = 'Deleting...';
    confirmBtn.disabled = true;

    try {
        const response = await API.delete(`/offers/${offerIndex}`);

        if (response.success) {
            // Remove the offer from the UI
            removeOfferFromGrid(offerIndex);

            showSuccessMessage('Offer deleted successfully!');
            hideDeleteConfirmModal();
            hideEditOfferModal();
        } else {
            throw new Error(response.error || 'Failed to delete offer');
        }
    } catch (error) {
        console.error('Error deleting offer:', error);
        alert('Failed to delete offer: ' + error.message);
    } finally {
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
    }
}

function updateOfferInGrid(index, collegeName, division) {
    const offersGridFull = document.getElementById('offersGridFull');
    const offersGrid = document.getElementById('offersGrid');

    // Update in full grid
    if (offersGridFull) {
        const offerItem = offersGridFull.querySelector(`.offer-item[data-offer-index="${index}"]`);
        if (offerItem) {
            offerItem.dataset.college = collegeName;
            offerItem.dataset.division = division;
            const detailsEl = offerItem.querySelector('.offer-details');
            if (detailsEl) {
                detailsEl.textContent = `${collegeName} • ${division}`;
            }
        }
    }

    // Update in overview grid if present
    if (offersGrid) {
        const offerItem = offersGrid.querySelector(`.offer-item[data-offer-index="${index}"]`);
        if (offerItem) {
            offerItem.dataset.college = collegeName;
            offerItem.dataset.division = division;
            const detailsEl = offerItem.querySelector('.offer-details');
            if (detailsEl) {
                detailsEl.textContent = `${collegeName} • ${division}`;
            }
        }
    }
}

function removeOfferFromGrid(index) {
    const offersGridFull = document.getElementById('offersGridFull');
    const offersGrid = document.getElementById('offersGrid');
    const showMoreBtn = document.getElementById('showMoreOffers');

    // Remove from full grid
    if (offersGridFull) {
        const offerItem = offersGridFull.querySelector(`.offer-item[data-offer-index="${index}"]`);
        if (offerItem) {
            offerItem.remove();
        }
        // Update all indices after removal
        updateOfferIndices();
    }

    // Reload the overview grid to reflect changes
    if (offersGrid) {
        offersGrid.innerHTML = '';
        if (offersGridFull) {
            const allOffers = offersGridFull.querySelectorAll('.offer-item');
            allOffers.forEach((offer, idx) => {
                if (idx < 3) {
                    const college = offer.dataset.college;
                    const division = offer.dataset.division;
                    const overviewOfferHTML = `
                        <div class="offer-item" data-offer-index="${idx}" data-college="${college}" data-division="${division}">
                            <div class="offer-logo">
                                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                                    <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                                </svg>
                            </div>
                            <div class="offer-info">
                                <div class="offer-details">${college} • ${division}</div>
                            </div>
                        </div>
                    `;
                    offersGrid.insertAdjacentHTML('beforeend', overviewOfferHTML);
                }
            });
        }
    }

    // Update "Show More" button visibility
    if (showMoreBtn && offersGridFull) {
        const totalOffers = offersGridFull.querySelectorAll('.offer-item').length;
        showMoreBtn.style.display = totalOffers > 3 ? 'flex' : 'none';
    }
}

// Initialize edit offer modal when DOM is ready
document.addEventListener('DOMContentLoaded', setupEditOfferModal);

// ============================================
// TOAST NOTIFICATION HELPER
// ============================================

function showToast(message, type = 'info') {
    // Remove any existing toasts
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;

    const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6';
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10001;
        animation: slideIn 0.3s ease-out;
        font-size: 0.95rem;
        font-weight: 500;
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out forwards';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// ============================================
// ADD STATS MODAL
// ============================================

let selectedStatsPositions = []; // Track multiple selected positions
let currentAddSeasonYear = null; // Track selected season year for adding stats
let allSeasonYears = []; // Track all seasons from database

function setupAddStatsModal() {
    const addStatsBtn = document.getElementById('addStatsBtn');
    const addStatsModal = document.getElementById('addStatsModal');
    const addStatsModalOverlay = document.getElementById('addStatsModalOverlay');
    const addStatsModalClose = document.getElementById('addStatsModalClose');
    const btnAddStatsCancel = document.getElementById('btnAddStatsCancel');
    const btnAddStatsSave = document.getElementById('btnAddStatsSave');
    const btnSelectPosition = document.getElementById('btnSelectPosition');
    const positionDropdown = document.getElementById('positionDropdown');
    const statsPositionInput = document.getElementById('statsPositionInput');

    // Season selection modal elements
    const seasonSelectModal = document.getElementById('seasonSelectModal');
    const seasonSelectModalOverlay = document.getElementById('seasonSelectModalOverlay');
    const seasonSelectModalClose = document.getElementById('seasonSelectModalClose');
    const btnNewSeason = document.getElementById('btnNewSeason');
    const btnPreviousSeason = document.getElementById('btnPreviousSeason');
    const newSeasonInputSection = document.getElementById('newSeasonInputSection');
    const previousSeasonSelectSection = document.getElementById('previousSeasonSelectSection');
    const newSeasonYearInput = document.getElementById('newSeasonYear');
    const previousSeasonSelect = document.getElementById('previousSeasonSelect');
    const btnContinueNewSeason = document.getElementById('btnContinueNewSeason');
    const btnContinuePreviousSeason = document.getElementById('btnContinuePreviousSeason');

    if (!addStatsBtn || !addStatsModal) return;

    // Open season selection modal first (instead of going directly to add stats modal)
    addStatsBtn.addEventListener('click', () => {
        // Check if there are existing seasons
        if (allSeasonYears.length === 0) {
            // No seasons exist - go directly to new season flow
            showNewSeasonInput();
            seasonSelectModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            // Show season selection options
            resetSeasonSelectModal();
            seasonSelectModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    });

    // Season selection modal close handlers
    function closeSeasonSelectModal() {
        seasonSelectModal.classList.remove('active');
        document.body.style.overflow = '';
        resetSeasonSelectModal();
    }

    function resetSeasonSelectModal() {
        // Hide both input sections
        if (newSeasonInputSection) newSeasonInputSection.style.display = 'none';
        if (previousSeasonSelectSection) previousSeasonSelectSection.style.display = 'none';
        // Remove active class from buttons
        if (btnNewSeason) btnNewSeason.classList.remove('active');
        if (btnPreviousSeason) btnPreviousSeason.classList.remove('active');
        // Clear inputs
        if (newSeasonYearInput) newSeasonYearInput.value = '';
    }

    function showNewSeasonInput() {
        if (newSeasonInputSection) newSeasonInputSection.style.display = 'block';
        if (previousSeasonSelectSection) previousSeasonSelectSection.style.display = 'none';
        if (btnNewSeason) btnNewSeason.classList.add('active');
        if (btnPreviousSeason) btnPreviousSeason.classList.remove('active');
        // Pre-fill with current year
        if (newSeasonYearInput && !newSeasonYearInput.value) {
            newSeasonYearInput.value = new Date().getFullYear();
        }
    }

    function showPreviousSeasonSelect() {
        if (newSeasonInputSection) newSeasonInputSection.style.display = 'none';
        if (previousSeasonSelectSection) previousSeasonSelectSection.style.display = 'block';
        if (btnNewSeason) btnNewSeason.classList.remove('active');
        if (btnPreviousSeason) btnPreviousSeason.classList.add('active');

        // Populate the previous season dropdown
        if (previousSeasonSelect) {
            previousSeasonSelect.innerHTML = '';
            allSeasonYears.forEach(year => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                previousSeasonSelect.appendChild(option);
            });
        }
    }

    if (seasonSelectModalOverlay) {
        seasonSelectModalOverlay.addEventListener('click', closeSeasonSelectModal);
    }

    if (seasonSelectModalClose) {
        seasonSelectModalClose.addEventListener('click', closeSeasonSelectModal);
    }

    if (btnNewSeason) {
        btnNewSeason.addEventListener('click', showNewSeasonInput);
    }

    if (btnPreviousSeason) {
        btnPreviousSeason.addEventListener('click', showPreviousSeasonSelect);
    }

    if (btnContinueNewSeason) {
        btnContinueNewSeason.addEventListener('click', () => {
            const year = parseInt(newSeasonYearInput.value);
            if (!year || year < 2000 || year > 2050) {
                showToast('Please enter a valid year (2000-2050)', 'error');
                return;
            }
            currentAddSeasonYear = year;
            closeSeasonSelectModal();
            openAddStatsModal();
        });
    }

    if (btnContinuePreviousSeason) {
        btnContinuePreviousSeason.addEventListener('click', () => {
            const year = parseInt(previousSeasonSelect.value);
            if (!year) {
                showToast('Please select a season', 'error');
                return;
            }
            currentAddSeasonYear = year;
            closeSeasonSelectModal();
            openAddStatsModal();
        });
    }

    // Open add stats modal (after season is selected)
    function openAddStatsModal() {
        resetStatsModal();
        // Display the selected season year
        const currentSeasonYearEl = document.getElementById('currentSeasonYear');
        if (currentSeasonYearEl) {
            currentSeasonYearEl.textContent = currentAddSeasonYear;
        }
        addStatsModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Close modal functions
    function closeAddStatsModal() {
        addStatsModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Reset modal to initial state
    function resetStatsModal() {
        selectedStatsPositions = [];
        if (statsPositionInput) statsPositionInput.value = '';
        if (positionDropdown) positionDropdown.classList.remove('active');

        // Reset game info fields
        const gameOpponent = document.getElementById('gameOpponent');
        if (gameOpponent) gameOpponent.value = '';

        // Show the initial position selector again
        const positionSelector = document.querySelector('.stats-position-selector');
        if (positionSelector) positionSelector.style.display = '';

        // Remove selected class from all position options
        document.querySelectorAll('.position-option').forEach(opt => {
            opt.classList.remove('selected');
            opt.classList.remove('added');
        });

        // Clear stats fields container
        const container = document.getElementById('statsFieldsContainer');
        if (container) container.innerHTML = '';
    }

    if (addStatsModalOverlay) {
        addStatsModalOverlay.addEventListener('click', closeAddStatsModal);
    }

    if (addStatsModalClose) {
        addStatsModalClose.addEventListener('click', closeAddStatsModal);
    }

    if (btnAddStatsCancel) {
        btnAddStatsCancel.addEventListener('click', closeAddStatsModal);
    }

    if (btnAddStatsSave) {
        btnAddStatsSave.addEventListener('click', async () => {
            await saveGameStats();
        });
    }

    // Save game stats to database
    async function saveGameStats() {
        const gameOpponent = document.getElementById('gameOpponent').value;

        // Validate required fields
        if (selectedStatsPositions.length === 0) {
            showToast('Please select at least one position', 'error');
            return;
        }

        // Collect stats for each position
        const positions = {};
        selectedStatsPositions.forEach(position => {
            const stats = POSITION_STATS[position] || [];
            const positionStats = {};

            stats.forEach(stat => {
                const fieldId = `stat_${position}_${stat.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
                const input = document.getElementById(fieldId);
                if (input && input.value) {
                    // Convert stat name to snake_case for storage
                    const statKey = stat.toLowerCase().replace(/[^a-z0-9]/g, '_');
                    positionStats[statKey] = parseFloat(input.value) || 0;
                }
            });

            // Only add position if it has stats or is a position without stats (OL, LS, etc.)
            if (Object.keys(positionStats).length > 0 || stats.length === 0) {
                positions[position] = positionStats;
            }
        });

        // Disable save button while saving
        const btnSave = document.getElementById('btnAddStatsSave');
        const originalText = btnSave.textContent;
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';

        try {
            const response = await API.post('/stats', {
                opponent: gameOpponent || null,
                positions: positions,
                season_year: currentAddSeasonYear
            });

            if (response.success) {
                showToast('Game stats added successfully!', 'success');
                closeAddStatsModal();
                // Set selected season to the one we just added to
                selectedSeasonYear = currentAddSeasonYear;
                // Reload the stats display
                loadGameStats();
            } else {
                showToast(response.error || 'Failed to save stats', 'error');
            }
        } catch (error) {
            console.error('Error saving game stats:', error);
            showToast('Failed to save game stats', 'error');
        } finally {
            btnSave.disabled = false;
            btnSave.textContent = originalText;
        }
    }

    // Toggle position dropdown (for first position selection)
    if (btnSelectPosition && positionDropdown) {
        btnSelectPosition.addEventListener('click', () => {
            positionDropdown.classList.toggle('active');
        });
    }

    // Handle position selection
    document.querySelectorAll('.position-option').forEach(option => {
        option.addEventListener('click', () => {
            const position = option.dataset.position;

            // Check if position is already added
            if (selectedStatsPositions.includes(position)) {
                return; // Don't add duplicate positions
            }

            // Add position to selected list
            selectedStatsPositions.push(position);

            // Mark as added
            option.classList.add('added');

            // Update input to show all selected positions
            if (statsPositionInput) {
                statsPositionInput.value = selectedStatsPositions.join(', ');
            }

            // Close dropdown
            if (positionDropdown) {
                positionDropdown.classList.remove('active');
            }

            // Hide the initial position selector after first selection
            const positionSelector = document.querySelector('.stats-position-selector');
            if (positionSelector && selectedStatsPositions.length === 1) {
                positionSelector.style.display = 'none';
            }

            // Add stat fields for the selected position
            addPositionStatsFields(position);

            // Add "Add Another Position" button after stats fields
            updateAddAnotherPositionButton();
        });
    });
}

// Show/hide the "Add Another Position" button
function updateAddAnotherPositionButton() {
    const container = document.getElementById('statsFieldsContainer');
    if (!container) return;

    // Remove existing button if present
    const existingBtn = container.querySelector('.btn-add-another-position');
    if (existingBtn) {
        existingBtn.remove();
    }

    // Add new button at the bottom
    const btnDiv = document.createElement('div');
    btnDiv.className = 'add-another-position-wrapper';
    btnDiv.innerHTML = `
        <button type="button" class="btn-add-another-position" id="btnAddAnotherPosition">
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Add Another Position
        </button>
        <div class="another-position-dropdown" id="anotherPositionDropdown">
            <div class="position-dropdown-section">
                <h4>Offense - Skill</h4>
                <div class="position-options">
                    <button type="button" class="another-position-option" data-position="QB">QB</button>
                    <button type="button" class="another-position-option" data-position="RB">RB</button>
                    <button type="button" class="another-position-option" data-position="FB">FB</button>
                    <button type="button" class="another-position-option" data-position="WR">WR</button>
                    <button type="button" class="another-position-option" data-position="TE">TE</button>
                </div>
            </div>
            <div class="position-dropdown-section">
                <h4>Offense - Line</h4>
                <div class="position-options">
                    <button type="button" class="another-position-option" data-position="OT">OT</button>
                    <button type="button" class="another-position-option" data-position="OG">OG</button>
                    <button type="button" class="another-position-option" data-position="C">C</button>
                </div>
            </div>
            <div class="position-dropdown-section">
                <h4>Defense - Line</h4>
                <div class="position-options">
                    <button type="button" class="another-position-option" data-position="DE">DE</button>
                    <button type="button" class="another-position-option" data-position="DT">DT</button>
                    <button type="button" class="another-position-option" data-position="NT">NT</button>
                </div>
            </div>
            <div class="position-dropdown-section">
                <h4>Defense - Linebackers</h4>
                <div class="position-options">
                    <button type="button" class="another-position-option" data-position="ILB">ILB</button>
                    <button type="button" class="another-position-option" data-position="OLB">OLB</button>
                </div>
            </div>
            <div class="position-dropdown-section">
                <h4>Defense - Secondary</h4>
                <div class="position-options">
                    <button type="button" class="another-position-option" data-position="CB">CB</button>
                    <button type="button" class="another-position-option" data-position="S">S</button>
                </div>
            </div>
            <div class="position-dropdown-section">
                <h4>Special Teams</h4>
                <div class="position-options">
                    <button type="button" class="another-position-option" data-position="K">K</button>
                    <button type="button" class="another-position-option" data-position="P">P</button>
                    <button type="button" class="another-position-option" data-position="LS">LS</button>
                </div>
            </div>
        </div>
    `;
    container.appendChild(btnDiv);

    // Mark already-added positions
    btnDiv.querySelectorAll('.another-position-option').forEach(opt => {
        if (selectedStatsPositions.includes(opt.dataset.position)) {
            opt.classList.add('added');
        }
    });

    // Toggle dropdown on button click
    const addAnotherBtn = btnDiv.querySelector('.btn-add-another-position');
    const anotherDropdown = btnDiv.querySelector('.another-position-dropdown');

    addAnotherBtn.addEventListener('click', () => {
        anotherDropdown.classList.toggle('active');
    });

    // Handle position selection from "Add Another" dropdown
    btnDiv.querySelectorAll('.another-position-option').forEach(option => {
        option.addEventListener('click', () => {
            const position = option.dataset.position;

            // Check if position is already added
            if (selectedStatsPositions.includes(position)) {
                return;
            }

            // Add position to selected list
            selectedStatsPositions.push(position);

            // Mark as added in both dropdowns
            option.classList.add('added');
            const originalOption = document.querySelector(`.position-option[data-position="${position}"]`);
            if (originalOption) {
                originalOption.classList.add('added');
            }

            // Update input
            const statsPositionInput = document.getElementById('statsPositionInput');
            if (statsPositionInput) {
                statsPositionInput.value = selectedStatsPositions.join(', ');
            }

            // Close dropdown
            anotherDropdown.classList.remove('active');

            // Remove the "Add Another" button wrapper before adding new stats
            btnDiv.remove();

            // Add stat fields for the selected position
            addPositionStatsFields(position);

            // Re-add the "Add Another Position" button
            updateAddAnotherPositionButton();
        });
    });
}

// Position-specific stats configuration
const POSITION_STATS = {
    'QB': ['RUSH YDS', 'RUSH TDS', 'PASS YDS', 'PASS TDS', 'INTS', 'COMP %'],
    'RB': ['RUSH YDS', 'RUSH TDS', 'REC', 'REC YDS', 'REC TDS'],
    'FB': ['RUSH YDS', 'RUSH TDS', 'REC', 'REC YDS', 'REC TDS'],
    'WR': ['REC', 'REC YDS', 'REC TDS'],
    'TE': ['REC', 'REC YDS', 'REC TDS'],
    'OT': [],
    'OG': [],
    'C': [],
    'DE': ['TACKLES', 'TFLS', 'SACKS', 'PBU', 'FF'],
    'DT': ['TACKLES', 'TFLS', 'SACKS', 'PBU', 'FF'],
    'NT': ['TACKLES', 'TFLS', 'SACKS', 'PBU', 'FF'],
    'ILB': ['TACKLES', 'TFLS', 'SACKS', 'FF', 'INT', 'PBU'],
    'OLB': ['TACKLES', 'TFLS', 'SACKS', 'FF', 'INT', 'PBU'],
    'CB': ['TACKLES', 'INT', 'PBU'],
    'S': ['TACKLES', 'INT', 'PBU'],
    'K': ['ATT', 'M', 'BLK', 'LONG', 'PATS'],
    'P': ['ATT', 'LONG', 'AVG', 'TB', 'FC', 'I20', '50+', 'BLK'],
    'LS': []
};

function addPositionStatsFields(position) {
    const container = document.getElementById('statsFieldsContainer');
    if (!container) return;

    const stats = POSITION_STATS[position] || [];

    // Create a section for this position
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'position-stats-section';
    sectionDiv.dataset.position = position;

    // Add position header with remove button
    let html = `
        <div class="position-stats-header">
            <h4>${position} Stats</h4>
            <button type="button" class="btn-remove-position" data-position="${position}">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
    `;

    // If no stats for this position, show a message
    if (stats.length === 0) {
        html += '<p class="no-stats-message">No stats to track for this position.</p>';
    } else {
        // Create the stats grid
        html += '<div class="stats-fields-grid">';
        stats.forEach(stat => {
            const fieldId = `stat_${position}_${stat.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
            html += `
                <div class="stat-field-group">
                    <label for="${fieldId}">${stat}</label>
                    <input type="number" id="${fieldId}" name="${fieldId}" placeholder="0" min="0" step="any">
                </div>
            `;
        });
        html += '</div>';
    }

    sectionDiv.innerHTML = html;
    container.appendChild(sectionDiv);

    // Add event listener for remove button
    const removeBtn = sectionDiv.querySelector('.btn-remove-position');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            removePositionStats(position);
        });
    }
}

function removePositionStats(position) {
    // Remove from selected positions array
    selectedStatsPositions = selectedStatsPositions.filter(p => p !== position);

    // Remove the section from DOM
    const container = document.getElementById('statsFieldsContainer');
    const section = container.querySelector(`.position-stats-section[data-position="${position}"]`);
    if (section) {
        section.remove();
    }

    // Remove added class from position option
    const option = document.querySelector(`.position-option[data-position="${position}"]`);
    if (option) {
        option.classList.remove('added');
    }

    // Update input field
    const statsPositionInput = document.getElementById('statsPositionInput');
    if (statsPositionInput) {
        statsPositionInput.value = selectedStatsPositions.join(', ');
    }
}

// Initialize add stats modal when DOM is ready
document.addEventListener('DOMContentLoaded', setupAddStatsModal);

// ============================================
// LOAD AND DISPLAY GAME STATS
// ============================================

let allGamesData = []; // Store all games for filtering
let selectedSeasonYear = null; // Currently selected season year

async function loadGameStats() {
    try {
        const response = await API.get('/stats/my-games');
        console.log('loadGameStats response:', response);
        if (response.games) {
            allGamesData = response.games;
            console.log('allGamesData before parsing:', JSON.stringify(allGamesData[0]));

            // Parse position_stats for all games first
            parseAllGamesData(allGamesData);
            console.log('allGamesData after parsing:', JSON.stringify(allGamesData[0]));

            // Extract unique season years and update dropdown
            updateSeasonDropdown(allGamesData);
            console.log('allSeasonYears:', allSeasonYears, 'selectedSeasonYear:', selectedSeasonYear);

            // Display games for selected season (or all if none selected)
            displayGameStats(allGamesData, selectedSeasonYear);

            // Display career statistics (all games aggregated by season)
            displayCareerStats(allGamesData);

            // Display overview tab stats (season and career totals)
            displayOverviewStats(allGamesData);
        }
    } catch (error) {
        console.error('Error loading game stats:', error);
    }
}

function parseAllGamesData(games) {
    games.forEach(game => {
        if (typeof game.position_stats === 'string') {
            try {
                game.position_stats = JSON.parse(game.position_stats);
            } catch (e) {
                console.error('Error parsing position_stats:', e);
                game.position_stats = [];
            }
        }
        // Ensure position_stats is an array
        if (!Array.isArray(game.position_stats)) {
            game.position_stats = [];
        }
        // Also parse individual stats objects if needed
        game.position_stats.forEach(ps => {
            if (ps && typeof ps.stats === 'string') {
                try {
                    ps.stats = JSON.parse(ps.stats);
                } catch (e) {
                    console.error('Error parsing stats:', e);
                    ps.stats = {};
                }
            }
        });
    });
}

function updateSeasonDropdown(games) {
    // Extract unique season years
    const seasonYears = new Set();
    games.forEach(game => {
        if (game.season_year) {
            seasonYears.add(game.season_year);
        }
    });

    // Convert to sorted array (descending order - latest year first)
    allSeasonYears = Array.from(seasonYears).sort((a, b) => b - a);

    const seasonDropdownWrapper = document.getElementById('seasonDropdownWrapper');
    const seasonYearDropdown = document.getElementById('seasonYearDropdown');

    if (allSeasonYears.length === 0) {
        // No seasons - hide dropdown
        if (seasonDropdownWrapper) seasonDropdownWrapper.style.display = 'none';
        return;
    }

    // Show dropdown
    if (seasonDropdownWrapper) seasonDropdownWrapper.style.display = 'flex';

    // Populate dropdown with season years only (no "All Seasons" option)
    if (seasonYearDropdown) {
        seasonYearDropdown.innerHTML = '';

        allSeasonYears.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            seasonYearDropdown.appendChild(option);
        });

        // Default to the latest season year (first in the sorted array)
        if (!selectedSeasonYear || !allSeasonYears.includes(selectedSeasonYear)) {
            selectedSeasonYear = allSeasonYears[0];
        }
        seasonYearDropdown.value = selectedSeasonYear;
    }
}

// Setup season dropdown change handler
document.addEventListener('DOMContentLoaded', () => {
    const seasonYearDropdown = document.getElementById('seasonYearDropdown');
    if (seasonYearDropdown) {
        seasonYearDropdown.addEventListener('change', (e) => {
            selectedSeasonYear = parseInt(e.target.value);
            displayGameStats(allGamesData, selectedSeasonYear);
        });
    }
});

function displayGameStats(games, filterYear = null) {
    const container = document.getElementById('gameStatsTablesContainer');
    if (!container) return;

    console.log('displayGameStats called with', games.length, 'games, filterYear:', filterYear);

    // Clear container
    container.innerHTML = '';

    if (!games || games.length === 0) {
        container.innerHTML = '<div class="no-stats-message">No games recorded yet. Click "Add Stats" to record your first game.</div>';
        return;
    }

    // Filter games by season year if specified
    let filteredGames = games;
    if (filterYear) {
        filteredGames = games.filter(game => parseInt(game.season_year) === parseInt(filterYear));
        console.log('After filtering by year', filterYear, ':', filteredGames.length, 'games');
    }

    if (filteredGames.length === 0) {
        container.innerHTML = '<div class="no-stats-message">No games recorded for this season. Click "Add Stats" to record a game.</div>';
        return;
    }

    // Debug: Log first game's position_stats
    console.log('First game position_stats:', filteredGames[0]?.position_stats);

    // Define position categories
    const offensivePositions = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'];
    const defensivePositions = ['DE', 'DT', 'NT', 'ILB', 'OLB', 'CB', 'S'];
    const specialPositions = ['K', 'P', 'LS'];

    // Define stats by category (keys must match how they're stored in DB via POSITION_STATS conversion)
    // POSITION_STATS uses uppercase labels that get converted: 'RUSH YDS' -> 'rush_yds', 'TACKLES' -> 'tackles', etc.
    const offensiveStats = ['rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp___', 'rec', 'rec_yds', 'rec_td', 'rec_tds', 'total_tds'];
    const defensiveStats = ['tackles', 'tfls', 'sacks', 'pbu', 'ff', 'int'];
    const specialStats = ['att', 'm', 'blk', 'long', 'pats', 'avg', 'tb', 'fc', 'i20', '50_'];

    // Map position to its stats (must match POSITION_STATS but with snake_case keys)
    const positionStatsMap = {
        'QB': ['rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp_%', 'total_tds'],
        'RB': ['rush_yds', 'rush_tds', 'rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'FB': ['rush_yds', 'rush_tds', 'rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'WR': ['rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'TE': ['rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'OT': [], 'OG': [], 'C': [],
        'DE': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'DT': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'NT': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'ILB': ['tackles', 'tfls', 'sacks', 'ff', 'int', 'pbu'],
        'OLB': ['tackles', 'tfls', 'sacks', 'ff', 'int', 'pbu'],
        'CB': ['tackles', 'int', 'pbu'],
        'S': ['tackles', 'int', 'pbu'],
        'K': ['att', 'm', 'blk', 'long', 'pats'],
        'P': ['att', 'long', 'avg', 'tb', 'fc', 'i20', '50+', 'blk'],
        'LS': []
    };

    // Collect stats and positions used in filtered games
    // Only show stats that are relevant to the positions actually played
    const usedStats = { offense: new Set(), defense: new Set(), special: new Set() };
    const usedCategories = { offense: false, defense: false, special: false };

    filteredGames.forEach(game => {
        if (game.position_stats && Array.isArray(game.position_stats)) {
            game.position_stats.forEach(ps => {
                if (ps && ps.position && ps.stats) {
                    const position = ps.position;
                    // Get the stats for this specific position
                    const posStats = positionStatsMap[position] || [];

                    if (offensivePositions.includes(position)) {
                        usedCategories.offense = true;
                        // Add only the stats for this specific position
                        posStats.forEach(stat => usedStats.offense.add(stat));
                    } else if (defensivePositions.includes(position)) {
                        usedCategories.defense = true;
                        // Add only the stats for this specific position
                        posStats.forEach(stat => usedStats.defense.add(stat));
                    } else if (specialPositions.includes(position)) {
                        usedCategories.special = true;
                        // Add only the stats for this specific position
                        posStats.forEach(stat => usedStats.special.add(stat));
                    }
                }
            });
        }
    });

    // Helper function to sort stats by category order
    const sortStatsByOrder = (stats, orderArray) => {
        return Array.from(stats).sort((a, b) => {
            const aIdx = orderArray.indexOf(a);
            const bIdx = orderArray.indexOf(b);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.localeCompare(b);
        });
    };

    // Helper function to create a stats table for a category
    const createCategoryTable = (title, categoryStats, categoryPositions, statOrderArray) => {
        if (categoryStats.size === 0) return '';

        const sortedStats = sortStatsByOrder(categoryStats, statOrderArray);

        // Build header
        let headerHtml = '<th>Opponent</th>';
        sortedStats.forEach(stat => {
            const label = stat.replace(/_/g, ' ').toUpperCase();
            headerHtml += `<th>${label}</th>`;
        });

        // Build body rows and track totals
        const totals = {};
        sortedStats.forEach(stat => { totals[stat] = 0; });

        let bodyHtml = '';
        filteredGames.forEach(game => {
            // Check if this game has any stats for this category
            let hasStatsForCategory = false;
            if (game.position_stats && Array.isArray(game.position_stats)) {
                hasStatsForCategory = game.position_stats.some(ps =>
                    ps && categoryPositions.includes(ps.position) && ps.stats && Object.keys(ps.stats).length > 0
                );
            }

            if (!hasStatsForCategory) return; // Skip games with no stats for this category

            const opponent = game.opponent || '-';
            const clickableClass = isOwnProfile ? 'clickable-row' : '';
            bodyHtml += `<tr class="${clickableClass}" data-game-id="${game.game_id}">`;
            bodyHtml += `<td>${opponent}</td>`;

            sortedStats.forEach(stat => {
                let value = null;
                if (game.position_stats && Array.isArray(game.position_stats)) {
                    for (const ps of game.position_stats) {
                        if (ps && categoryPositions.includes(ps.position) && ps.stats) {
                            // Calculate total_tds dynamically - sum of all available TD types
                            if (stat === 'total_tds') {
                                const passTds = parseFloat(ps.stats['pass_tds']) || 0;
                                const rushTds = parseFloat(ps.stats['rush_tds']) || 0;
                                const recTds = parseFloat(ps.stats['rec_tds']) || 0;
                                value = (value !== null ? value : 0) + passTds + rushTds + recTds;
                            } else if (ps.stats[stat] !== undefined && ps.stats[stat] !== null) {
                                if (value !== null) {
                                    value += parseFloat(ps.stats[stat]) || 0;
                                } else {
                                    value = parseFloat(ps.stats[stat]) || 0;
                                }
                            }
                        }
                    }
                }

                const displayValue = (value !== null && !isNaN(value)) ? value : 0;
                totals[stat] += displayValue;

                bodyHtml += `<td>${displayValue}</td>`;
            });

            bodyHtml += '</tr>';
        });

        // If no rows were added, don't create the table
        if (bodyHtml === '') return '';

        // Add totals row
        bodyHtml += '<tr class="totals-row">';
        bodyHtml += '<td><strong>TOTAL</strong></td>';
        sortedStats.forEach(stat => {
            const total = totals[stat];
            const displayTotal = Number.isInteger(total) ? total : total.toFixed(1);
            bodyHtml += `<td><strong>${displayTotal}</strong></td>`;
        });
        bodyHtml += '</tr>';

        return `
            <div class="stats-category-section">
                <h3 class="stats-category-title">${title}</h3>
                <div class="stats-table-container">
                    <table class="stats-table">
                        <thead>
                            <tr>${headerHtml}</tr>
                        </thead>
                        <tbody>${bodyHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    };

    // Create tables for each category that has data
    let html = '';

    if (usedCategories.offense) {
        html += createCategoryTable('Offensive Stats', usedStats.offense, offensivePositions, offensiveStats);
    }

    if (usedCategories.defense) {
        html += createCategoryTable('Defensive Stats', usedStats.defense, defensivePositions, defensiveStats);
    }

    if (usedCategories.special) {
        html += createCategoryTable('Special Teams Stats', usedStats.special, specialPositions, specialStats);
    }

    if (html === '') {
        container.innerHTML = '<div class="no-stats-message">No games recorded yet. Click "Add Stats" to record your first game.</div>';
    } else {
        container.innerHTML = html;
    }

    // Store all games data for editing (not just filtered)
    window.gamesData = allGamesData;

    // Add click handlers for editable rows (only on own profile)
    if (isOwnProfile) {
        container.querySelectorAll('tr.clickable-row').forEach(row => {
            row.addEventListener('click', () => {
                const gameId = row.dataset.gameId;
                const game = allGamesData.find(g => g.game_id == gameId);
                if (game) {
                    showEditStatsModal(game);
                }
            });
        });
    }

    console.log('Game stats displayed:', filteredGames.length, 'games (filtered)');
}

// ============================================
// CAREER STATISTICS DISPLAY
// ============================================

function displayCareerStats(games) {
    const container = document.getElementById('careerStatsTablesContainer');
    if (!container) return;

    // Clear container
    container.innerHTML = '';

    if (!games || games.length === 0) {
        container.innerHTML = '<div class="no-stats-message">No career statistics to display yet.</div>';
        return;
    }

    // Define position categories
    const offensivePositions = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'];
    const defensivePositions = ['DE', 'DT', 'NT', 'ILB', 'OLB', 'CB', 'S'];
    const specialPositions = ['K', 'P', 'LS'];

    // Define stats by category
    const offensiveStats = ['rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp___', 'rec', 'rec_yds', 'rec_td', 'rec_tds', 'total_tds'];
    const defensiveStats = ['tackles', 'tfls', 'sacks', 'pbu', 'ff', 'int'];
    const specialStats = ['att', 'm', 'blk', 'long', 'pats', 'avg', 'tb', 'fc', 'i20', '50_'];

    // Map position to its stats
    const positionStatsMap = {
        'QB': ['rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp_%', 'total_tds'],
        'RB': ['rush_yds', 'rush_tds', 'rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'FB': ['rush_yds', 'rush_tds', 'rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'WR': ['rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'TE': ['rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'OT': [], 'OG': [], 'C': [],
        'DE': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'DT': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'NT': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'ILB': ['tackles', 'tfls', 'sacks', 'ff', 'int', 'pbu'],
        'OLB': ['tackles', 'tfls', 'sacks', 'ff', 'int', 'pbu'],
        'CB': ['tackles', 'int', 'pbu'],
        'S': ['tackles', 'int', 'pbu'],
        'K': ['att', 'm', 'blk', 'long', 'pats'],
        'P': ['att', 'long', 'avg', 'tb', 'fc', 'i20', '50+', 'blk'],
        'LS': []
    };

    // Group games by season year
    const gamesBySeason = {};
    games.forEach(game => {
        const year = game.season_year || 'Unknown';
        if (!gamesBySeason[year]) {
            gamesBySeason[year] = [];
        }
        gamesBySeason[year].push(game);
    });

    // Get sorted season years (descending)
    const seasonYears = Object.keys(gamesBySeason).sort((a, b) => b - a);

    // Collect stats used across all seasons
    const usedStats = { offense: new Set(), defense: new Set(), special: new Set() };
    const usedCategories = { offense: false, defense: false, special: false };

    games.forEach(game => {
        if (game.position_stats && Array.isArray(game.position_stats)) {
            game.position_stats.forEach(ps => {
                if (ps && ps.position && ps.stats) {
                    const position = ps.position;
                    const posStats = positionStatsMap[position] || [];

                    if (offensivePositions.includes(position)) {
                        usedCategories.offense = true;
                        posStats.forEach(stat => usedStats.offense.add(stat));
                    } else if (defensivePositions.includes(position)) {
                        usedCategories.defense = true;
                        posStats.forEach(stat => usedStats.defense.add(stat));
                    } else if (specialPositions.includes(position)) {
                        usedCategories.special = true;
                        posStats.forEach(stat => usedStats.special.add(stat));
                    }
                }
            });
        }
    });

    // Helper function to sort stats by category order
    const sortStatsByOrder = (stats, orderArray) => {
        return Array.from(stats).sort((a, b) => {
            const aIdx = orderArray.indexOf(a);
            const bIdx = orderArray.indexOf(b);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.localeCompare(b);
        });
    };

    // Helper function to calculate season totals for a category
    const calculateSeasonTotals = (seasonGames, categoryPositions, categoryStats) => {
        const totals = {};
        categoryStats.forEach(stat => { totals[stat] = 0; });
        let gamesCount = 0;

        seasonGames.forEach(game => {
            let hasStatsForCategory = false;
            if (game.position_stats && Array.isArray(game.position_stats)) {
                game.position_stats.forEach(ps => {
                    if (ps && categoryPositions.includes(ps.position) && ps.stats) {
                        hasStatsForCategory = true;
                        categoryStats.forEach(stat => {
                            // Calculate total_tds dynamically - sum of all available TD types
                            if (stat === 'total_tds') {
                                const passTds = parseFloat(ps.stats['pass_tds']) || 0;
                                const rushTds = parseFloat(ps.stats['rush_tds']) || 0;
                                const recTds = parseFloat(ps.stats['rec_tds']) || 0;
                                totals[stat] += passTds + rushTds + recTds;
                            } else if (ps.stats[stat] !== undefined && ps.stats[stat] !== null) {
                                totals[stat] += parseFloat(ps.stats[stat]) || 0;
                            }
                        });
                    }
                });
            }
            if (hasStatsForCategory) gamesCount++;
        });

        return { totals, gamesCount };
    };

    // Helper function to create a career stats table for a category
    const createCareerCategoryTable = (title, categoryStats, categoryPositions, statOrderArray) => {
        if (categoryStats.size === 0) return '';

        const sortedStats = sortStatsByOrder(categoryStats, statOrderArray);

        // Check if any season has data for this category
        let hasAnyData = false;
        seasonYears.forEach(year => {
            const { gamesCount } = calculateSeasonTotals(gamesBySeason[year], categoryPositions, sortedStats);
            if (gamesCount > 0) hasAnyData = true;
        });

        if (!hasAnyData) return '';

        // Build header
        let headerHtml = '<th>Season</th><th>Games</th>';
        sortedStats.forEach(stat => {
            const label = stat.replace(/_/g, ' ').toUpperCase();
            headerHtml += `<th>${label}</th>`;
        });

        // Build body rows and track career totals
        const careerTotals = {};
        sortedStats.forEach(stat => { careerTotals[stat] = 0; });
        let careerGamesCount = 0;

        let bodyHtml = '';
        seasonYears.forEach(year => {
            const { totals, gamesCount } = calculateSeasonTotals(gamesBySeason[year], categoryPositions, sortedStats);

            if (gamesCount === 0) return; // Skip seasons with no games for this category

            careerGamesCount += gamesCount;

            bodyHtml += `<tr>`;
            bodyHtml += `<td>${year}</td>`;
            bodyHtml += `<td>${gamesCount}</td>`;

            sortedStats.forEach(stat => {
                const value = totals[stat];
                careerTotals[stat] += value;
                const displayValue = Number.isInteger(value) ? value : value.toFixed(1);
                bodyHtml += `<td>${displayValue}</td>`;
            });

            bodyHtml += '</tr>';
        });

        // If no rows were added, don't create the table
        if (bodyHtml === '') return '';

        // Add career totals row
        bodyHtml += '<tr class="totals-row">';
        bodyHtml += '<td><strong>CAREER</strong></td>';
        bodyHtml += `<td><strong>${careerGamesCount}</strong></td>`;
        sortedStats.forEach(stat => {
            const total = careerTotals[stat];
            const displayTotal = Number.isInteger(total) ? total : total.toFixed(1);
            bodyHtml += `<td><strong>${displayTotal}</strong></td>`;
        });
        bodyHtml += '</tr>';

        return `
            <div class="stats-category-section">
                <h3 class="stats-category-title">${title}</h3>
                <div class="stats-table-container">
                    <table class="stats-table">
                        <thead>
                            <tr>${headerHtml}</tr>
                        </thead>
                        <tbody>${bodyHtml}</tbody>
                    </table>
                </div>
            </div>
        `;
    };

    // Create tables for each category that has data
    let html = '';

    if (usedCategories.offense) {
        html += createCareerCategoryTable('Offensive Stats', usedStats.offense, offensivePositions, offensiveStats);
    }

    if (usedCategories.defense) {
        html += createCareerCategoryTable('Defensive Stats', usedStats.defense, defensivePositions, defensiveStats);
    }

    if (usedCategories.special) {
        html += createCareerCategoryTable('Special Teams Stats', usedStats.special, specialPositions, specialStats);
    }

    if (html === '') {
        container.innerHTML = '<div class="no-stats-message">No career statistics to display yet.</div>';
    } else {
        container.innerHTML = html;
    }

    console.log('Career stats displayed for', seasonYears.length, 'seasons');
}

// ============================================
// OVERVIEW TAB STATS DISPLAY
// ============================================

function displayOverviewStats(games) {
    const seasonContainer = document.getElementById('overviewSeasonStatsContainer');
    const careerContainer = document.getElementById('overviewCareerStatsContainer');

    if (!seasonContainer || !careerContainer) return;

    // Clear containers
    seasonContainer.innerHTML = '';
    careerContainer.innerHTML = '';

    if (!games || games.length === 0) {
        seasonContainer.innerHTML = `
            <div class="overview-section">
                <h2 class="section-title">Season Stats</h2>
                <div class="info-card">
                    <div class="no-stats-message">No season stats recorded yet.</div>
                </div>
            </div>
        `;
        careerContainer.innerHTML = `
            <div class="overview-section">
                <h2 class="section-title">Career Stats</h2>
                <div class="info-card">
                    <div class="no-stats-message">No career stats recorded yet.</div>
                </div>
            </div>
        `;
        return;
    }

    // Define position categories
    const offensivePositions = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'];
    const defensivePositions = ['DE', 'DT', 'NT', 'ILB', 'OLB', 'CB', 'S'];
    const specialPositions = ['K', 'P', 'LS'];

    // Map position to its stats
    const positionStatsMap = {
        'QB': ['rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp_%', 'total_tds'],
        'RB': ['rush_yds', 'rush_tds', 'rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'FB': ['rush_yds', 'rush_tds', 'rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'WR': ['rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'TE': ['rec', 'rec_yds', 'rec_tds', 'total_tds'],
        'OT': [], 'OG': [], 'C': [],
        'DE': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'DT': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'NT': ['tackles', 'tfls', 'sacks', 'pbu', 'ff'],
        'ILB': ['tackles', 'tfls', 'sacks', 'ff', 'int', 'pbu'],
        'OLB': ['tackles', 'tfls', 'sacks', 'ff', 'int', 'pbu'],
        'CB': ['tackles', 'int', 'pbu'],
        'S': ['tackles', 'int', 'pbu'],
        'K': ['att', 'm', 'blk', 'long', 'pats'],
        'P': ['att', 'long', 'avg', 'tb', 'fc', 'i20', '50+', 'blk'],
        'LS': []
    };

    // Stat labels for display
    const statLabels = {
        'rush_yds': 'Rush Yds',
        'rush_tds': 'Rush TDs',
        'pass_yds': 'Pass Yds',
        'pass_tds': 'Pass TDs',
        'ints': 'INTs',
        'comp_%': 'Comp %',
        'total_tds': 'Total TDs',
        'rec': 'Rec',
        'rec_yds': 'Rec Yds',
        'rec_td': 'Rec TDs',
        'rec_tds': 'Rec TDs',
        'tackles': 'Tackles',
        'tfls': 'TFLs',
        'sacks': 'Sacks',
        'pbu': 'PBU',
        'ff': 'FF',
        'int': 'INTs',
        'att': 'Att',
        'm': 'Made',
        'blk': 'Blk',
        'long': 'Long',
        'pats': 'PATs',
        'avg': 'Avg',
        'tb': 'TB',
        'fc': 'FC',
        'i20': 'I20',
        '50+': '50+'
    };

    // Group games by season year
    const gamesBySeason = {};
    games.forEach(game => {
        const year = game.season_year || 'Unknown';
        if (!gamesBySeason[year]) {
            gamesBySeason[year] = [];
        }
        gamesBySeason[year].push(game);
    });

    // Get most recent season year
    const seasonYears = Object.keys(gamesBySeason).sort((a, b) => b - a);
    const mostRecentSeason = seasonYears[0];

    // Collect stats used across all games
    const usedStats = { offense: new Set(), defense: new Set(), special: new Set() };
    const usedCategories = { offense: false, defense: false, special: false };

    games.forEach(game => {
        if (game.position_stats && Array.isArray(game.position_stats)) {
            game.position_stats.forEach(ps => {
                if (ps && ps.position && ps.stats) {
                    const position = ps.position;
                    const posStats = positionStatsMap[position] || [];

                    if (offensivePositions.includes(position)) {
                        usedCategories.offense = true;
                        posStats.forEach(stat => usedStats.offense.add(stat));
                    } else if (defensivePositions.includes(position)) {
                        usedCategories.defense = true;
                        posStats.forEach(stat => usedStats.defense.add(stat));
                    } else if (specialPositions.includes(position)) {
                        usedCategories.special = true;
                        posStats.forEach(stat => usedStats.special.add(stat));
                    }
                }
            });
        }
    });

    // Helper function to calculate totals for a set of games and category
    const calculateTotals = (gamesList, categoryPositions, categoryStatsSet) => {
        const totals = {};
        const statsArray = Array.from(categoryStatsSet);
        statsArray.forEach(stat => { totals[stat] = 0; });
        let gamesCount = 0;

        gamesList.forEach(game => {
            let hasStatsForCategory = false;
            if (game.position_stats && Array.isArray(game.position_stats)) {
                game.position_stats.forEach(ps => {
                    if (ps && categoryPositions.includes(ps.position) && ps.stats) {
                        hasStatsForCategory = true;
                        statsArray.forEach(stat => {
                            // Calculate total_tds dynamically - sum of all available TD types
                            if (stat === 'total_tds') {
                                const passTds = parseFloat(ps.stats['pass_tds']) || 0;
                                const rushTds = parseFloat(ps.stats['rush_tds']) || 0;
                                const recTds = parseFloat(ps.stats['rec_tds']) || 0;
                                totals[stat] += passTds + rushTds + recTds;
                            } else if (ps.stats[stat] !== undefined && ps.stats[stat] !== null) {
                                totals[stat] += parseFloat(ps.stats[stat]) || 0;
                            }
                        });
                    }
                });
            }
            if (hasStatsForCategory) gamesCount++;
        });

        return { totals, gamesCount };
    };

    // Helper function to create stat boxes HTML
    const createStatBoxesHtml = (totals, gamesCount, statsSet) => {
        let html = `
            <div class="stat-box">
                <div class="stat-value">${gamesCount}</div>
                <div class="stat-label">Games</div>
            </div>
        `;

        // Separate total_tds from other stats to display it prominently
        const regularStats = [];
        let hasTotalTds = false;
        let totalTdsValue = 0;

        Array.from(statsSet).forEach(stat => {
            if (stat === 'total_tds') {
                hasTotalTds = true;
                totalTdsValue = totals[stat];
            } else {
                regularStats.push(stat);
            }
        });

        // Add regular stats first
        regularStats.forEach(stat => {
            const value = totals[stat];
            const displayValue = Number.isInteger(value) ? value : value.toFixed(1);
            const label = statLabels[stat] || stat.replace(/_/g, ' ').toUpperCase();
            html += `
                <div class="stat-box">
                    <div class="stat-value">${displayValue}</div>
                    <div class="stat-label">${label}</div>
                </div>
            `;
        });

        // Add total_tds last (regular stat box)
        if (hasTotalTds) {
            const displayValue = Number.isInteger(totalTdsValue) ? totalTdsValue : totalTdsValue.toFixed(1);
            html += `
                <div class="stat-box">
                    <div class="stat-value">${displayValue}</div>
                    <div class="stat-label">Total TDs</div>
                </div>
            `;
        }

        return html;
    };

    // Helper function to create a category section
    const createCategorySection = (title, totals, gamesCount, statsSet) => {
        if (statsSet.size === 0 || gamesCount === 0) return '';

        return `
            <div class="overview-stats-category">
                <h3 class="overview-stats-category-title">${title}</h3>
                <div class="stats-horizontal">
                    ${createStatBoxesHtml(totals, gamesCount, statsSet)}
                </div>
            </div>
        `;
    };

    // ==================
    // SEASON STATS
    // ==================
    if (mostRecentSeason) {
        const seasonGames = gamesBySeason[mostRecentSeason];
        let seasonHtml = '';

        if (usedCategories.offense) {
            const { totals, gamesCount } = calculateTotals(seasonGames, offensivePositions, usedStats.offense);
            seasonHtml += createCategorySection('Offense', totals, gamesCount, usedStats.offense);
        }

        if (usedCategories.defense) {
            const { totals, gamesCount } = calculateTotals(seasonGames, defensivePositions, usedStats.defense);
            seasonHtml += createCategorySection('Defense', totals, gamesCount, usedStats.defense);
        }

        if (usedCategories.special) {
            const { totals, gamesCount } = calculateTotals(seasonGames, specialPositions, usedStats.special);
            seasonHtml += createCategorySection('Special Teams', totals, gamesCount, usedStats.special);
        }

        if (seasonHtml) {
            seasonContainer.innerHTML = `
                <div class="overview-section">
                    <h2 class="section-title">Season Stats (${mostRecentSeason})</h2>
                    <div class="info-card">
                        ${seasonHtml}
                    </div>
                </div>
            `;
        } else {
            seasonContainer.innerHTML = `
                <div class="overview-section">
                    <h2 class="section-title">Season Stats (${mostRecentSeason})</h2>
                    <div class="info-card">
                        <div class="no-stats-message">No season stats recorded yet.</div>
                    </div>
                </div>
            `;
        }
    }

    // ==================
    // CAREER STATS
    // ==================
    let careerHtml = '';

    if (usedCategories.offense) {
        const { totals, gamesCount } = calculateTotals(games, offensivePositions, usedStats.offense);
        careerHtml += createCategorySection('Offense', totals, gamesCount, usedStats.offense);
    }

    if (usedCategories.defense) {
        const { totals, gamesCount } = calculateTotals(games, defensivePositions, usedStats.defense);
        careerHtml += createCategorySection('Defense', totals, gamesCount, usedStats.defense);
    }

    if (usedCategories.special) {
        const { totals, gamesCount } = calculateTotals(games, specialPositions, usedStats.special);
        careerHtml += createCategorySection('Special Teams', totals, gamesCount, usedStats.special);
    }

    if (careerHtml) {
        careerContainer.innerHTML = `
            <div class="overview-section">
                <h2 class="section-title">Career Stats</h2>
                <div class="info-card">
                    ${careerHtml}
                </div>
            </div>
        `;
    } else {
        careerContainer.innerHTML = `
            <div class="overview-section">
                <h2 class="section-title">Career Stats</h2>
                <div class="info-card">
                    <div class="no-stats-message">No career stats recorded yet.</div>
                </div>
            </div>
        `;
    }

    console.log('Overview stats displayed for season:', mostRecentSeason);
}

// ============================================
// EDIT GAME STATS MODAL
// ============================================

let currentEditGameId = null;

function showEditStatsModal(game) {
    const modal = document.getElementById('editStatsModal');
    if (!modal) return;

    currentEditGameId = game.game_id;

    // Set opponent
    const opponentInput = document.getElementById('editGameOpponent');
    if (opponentInput) {
        opponentInput.value = game.opponent || '';
    }

    // Set game ID
    const gameIdInput = document.getElementById('editGameId');
    if (gameIdInput) {
        gameIdInput.value = game.game_id;
    }

    // Clear and populate stats fields
    const container = document.getElementById('editStatsFieldsContainer');
    container.innerHTML = '';
    editSelectedPositions = [];

    // Add stats sections for each position in the game
    if (game.position_stats && Array.isArray(game.position_stats)) {
        game.position_stats.forEach(ps => {
            if (ps.position) {
                editSelectedPositions.push(ps.position);
                addEditPositionStatsFields(ps.position, ps.stats || {});
            }
        });
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideEditStatsModal() {
    const modal = document.getElementById('editStatsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
    currentEditGameId = null;
}

function addEditPositionStatsFields(position, existingStats = {}) {
    const container = document.getElementById('editStatsFieldsContainer');
    if (!container) return;

    const stats = POSITION_STATS[position] || [];

    // Create a section for this position
    const sectionDiv = document.createElement('div');
    sectionDiv.className = 'position-stats-section';
    sectionDiv.dataset.position = position;

    // Add position header
    let html = `
        <div class="position-stats-header">
            <h4>${position} Stats</h4>
        </div>
    `;

    // If no stats for this position, show a message
    if (stats.length === 0) {
        html += '<p class="no-stats-message">No stats to track for this position.</p>';
    } else {
        // Create the stats grid
        html += '<div class="stats-fields-grid">';
        stats.forEach(stat => {
            const fieldId = `edit_stat_${position}_${stat.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
            const statKey = stat.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const existingValue = existingStats[statKey] ?? '';
            html += `
                <div class="stat-field-group">
                    <label for="${fieldId}">${stat}</label>
                    <input type="number" id="${fieldId}" name="${fieldId}" placeholder="0" min="0" step="any" value="${existingValue}">
                </div>
            `;
        });
        html += '</div>';
    }

    sectionDiv.innerHTML = html;
    container.appendChild(sectionDiv);
}

async function saveEditedGameStats() {
    const gameId = currentEditGameId;
    if (!gameId) return;

    const gameOpponent = document.getElementById('editGameOpponent').value;

    // Collect stats for each position
    const positions = {};
    editSelectedPositions.forEach(position => {
        const stats = POSITION_STATS[position] || [];
        const positionStats = {};

        stats.forEach(stat => {
            const fieldId = `edit_stat_${position}_${stat.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}`;
            const input = document.getElementById(fieldId);
            if (input && input.value) {
                const statKey = stat.toLowerCase().replace(/[^a-z0-9]/g, '_');
                positionStats[statKey] = parseFloat(input.value) || 0;
            }
        });

        if (Object.keys(positionStats).length > 0 || stats.length === 0) {
            positions[position] = positionStats;
        }
    });

    // Get current game data for date info
    const currentGame = window.gamesData?.find(g => g.game_id == gameId);
    const game_date = currentGame?.game_date || new Date().toISOString().split('T')[0];
    const season_year = currentGame?.season_year || new Date().getFullYear();

    // Disable save button while saving
    const btnSave = document.getElementById('btnEditStatsSave');
    const originalText = btnSave.textContent;
    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';

    try {
        const response = await API.put(`/stats/${gameId}`, {
            game_date,
            season_year,
            opponent: gameOpponent || null,
            result: null,
            positions: positions
        });

        if (response.success) {
            showToast('Game stats updated successfully!', 'success');
            hideEditStatsModal();
            loadGameStats();
        } else {
            showToast(response.error || 'Failed to update stats', 'error');
        }
    } catch (error) {
        console.error('Error updating game stats:', error);
        showToast('Failed to update game stats', 'error');
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = originalText;
    }
}

function showDeleteStatsConfirmModal() {
    const modal = document.getElementById('deleteStatsConfirmModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function hideDeleteStatsConfirmModal() {
    const modal = document.getElementById('deleteStatsConfirmModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function confirmDeleteGameStats() {
    const gameId = currentEditGameId;
    if (!gameId) return;

    const confirmBtn = document.getElementById('btnStatsConfirmDelete');
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = 'Deleting...';
    confirmBtn.disabled = true;

    try {
        const response = await API.delete(`/stats/${gameId}`);

        if (response.success) {
            showToast('Game stats deleted successfully!', 'success');
            hideDeleteStatsConfirmModal();
            hideEditStatsModal();
            loadGameStats();
        } else {
            showToast(response.error || 'Failed to delete stats', 'error');
        }
    } catch (error) {
        console.error('Error deleting game stats:', error);
        showToast('Failed to delete game stats', 'error');
    } finally {
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
    }
}

// Setup Edit Stats Modal event listeners
function setupEditStatsModal() {
    const editStatsModal = document.getElementById('editStatsModal');
    const editStatsModalOverlay = document.getElementById('editStatsModalOverlay');
    const editStatsModalClose = document.getElementById('editStatsModalClose');
    const btnEditStatsCancel = document.getElementById('btnEditStatsCancel');
    const btnEditStatsSave = document.getElementById('btnEditStatsSave');
    const btnDeleteGameStats = document.getElementById('btnDeleteGameStats');

    // Delete confirmation modal elements
    const deleteStatsConfirmOverlay = document.getElementById('deleteStatsConfirmOverlay');
    const btnStatsConfirmCancel = document.getElementById('btnStatsConfirmCancel');
    const btnStatsConfirmDelete = document.getElementById('btnStatsConfirmDelete');

    // Close modal handlers
    if (editStatsModalOverlay) {
        editStatsModalOverlay.addEventListener('click', hideEditStatsModal);
    }
    if (editStatsModalClose) {
        editStatsModalClose.addEventListener('click', hideEditStatsModal);
    }
    if (btnEditStatsCancel) {
        btnEditStatsCancel.addEventListener('click', hideEditStatsModal);
    }

    // Save changes handler
    if (btnEditStatsSave) {
        btnEditStatsSave.addEventListener('click', saveEditedGameStats);
    }

    // Delete handler (shows confirmation modal)
    if (btnDeleteGameStats) {
        btnDeleteGameStats.addEventListener('click', showDeleteStatsConfirmModal);
    }

    // Delete confirmation modal handlers
    if (deleteStatsConfirmOverlay) {
        deleteStatsConfirmOverlay.addEventListener('click', hideDeleteStatsConfirmModal);
    }
    if (btnStatsConfirmCancel) {
        btnStatsConfirmCancel.addEventListener('click', hideDeleteStatsConfirmModal);
    }
    if (btnStatsConfirmDelete) {
        btnStatsConfirmDelete.addEventListener('click', confirmDeleteGameStats);
    }
}

// Initialize edit stats modal when DOM is ready
document.addEventListener('DOMContentLoaded', setupEditStatsModal);

// Load game stats when profile is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Delay slightly to ensure API is available
    setTimeout(loadGameStats, 500);
});

// ============================================
// HIGHLIGHTS TAB
// ============================================

let playerHighlights = {
    season: [],
    game: []
};
let currentHighlightType = 'season'; // Track which type of highlight is being added

function setupHighlightsModal() {
    const addHighlightModal = document.getElementById('addHighlightModal');
    const addHighlightModalOverlay = document.getElementById('addHighlightModalOverlay');
    const addHighlightModalClose = document.getElementById('addHighlightModalClose');
    const addSeasonHighlightBtn = document.getElementById('addSeasonHighlightBtn');
    const addGameHighlightBtn = document.getElementById('addGameHighlightBtn');
    const btnSeasonHighlight = document.getElementById('btnSeasonHighlight');
    const btnGameHighlight = document.getElementById('btnGameHighlight');
    const highlightTypeSelection = document.getElementById('highlightTypeSelection');
    const highlightLinkInput = document.getElementById('highlightLinkInput');
    const addHighlightModalFooter = document.getElementById('addHighlightModalFooter');
    const highlightTypeValue = document.getElementById('highlightTypeValue');
    const btnHighlightBack = document.getElementById('btnHighlightBack');
    const btnHighlightSave = document.getElementById('btnHighlightSave');
    const highlightTitleInput = document.getElementById('highlightTitle');
    const highlightLinkInputField = document.getElementById('highlightLink');

    if (!addHighlightModal) return;

    // Open modal from Add Highlight buttons
    function openHighlightModal(type) {
        currentHighlightType = type;
        resetHighlightModal();

        // If type is specified, go directly to link input step
        if (type) {
            highlightTypeValue.textContent = type === 'season' ? 'Season Highlight Reel' : 'Single Game Highlight Reel';
            highlightTypeSelection.style.display = 'none';
            highlightLinkInput.style.display = 'block';
            addHighlightModalFooter.style.display = 'flex';
        }

        addHighlightModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    if (addSeasonHighlightBtn) {
        addSeasonHighlightBtn.addEventListener('click', () => openHighlightModal('season'));
    }

    if (addGameHighlightBtn) {
        addGameHighlightBtn.addEventListener('click', () => openHighlightModal('game'));
    }

    // Type selection buttons in modal
    if (btnSeasonHighlight) {
        btnSeasonHighlight.addEventListener('click', () => {
            currentHighlightType = 'season';
            highlightTypeValue.textContent = 'Season Highlight Reel';
            highlightTypeSelection.style.display = 'none';
            highlightLinkInput.style.display = 'block';
            addHighlightModalFooter.style.display = 'flex';
        });
    }

    if (btnGameHighlight) {
        btnGameHighlight.addEventListener('click', () => {
            currentHighlightType = 'game';
            highlightTypeValue.textContent = 'Single Game Highlight Reel';
            highlightTypeSelection.style.display = 'none';
            highlightLinkInput.style.display = 'block';
            addHighlightModalFooter.style.display = 'flex';
        });
    }

    // Back button
    if (btnHighlightBack) {
        btnHighlightBack.addEventListener('click', () => {
            highlightTypeSelection.style.display = 'block';
            highlightLinkInput.style.display = 'none';
            addHighlightModalFooter.style.display = 'none';
            if (highlightTitleInput) highlightTitleInput.value = '';
            if (highlightLinkInputField) highlightLinkInputField.value = '';
        });
    }

    // Save highlight
    if (btnHighlightSave) {
        btnHighlightSave.addEventListener('click', async () => {
            const title = highlightTitleInput?.value?.trim();
            const link = highlightLinkInputField?.value?.trim();

            if (!title) {
                alert('Please enter a title for your highlight');
                return;
            }

            if (!link) {
                alert('Please enter a Hudl link');
                return;
            }

            // Validate Hudl link
            if (!isValidHudlLink(link)) {
                alert('Please enter a valid Hudl link (e.g., https://www.hudl.com/video/...)');
                return;
            }

            try {
                btnHighlightSave.disabled = true;
                btnHighlightSave.textContent = 'Adding...';

                const response = await API.post('/highlights', {
                    highlight_type: currentHighlightType,
                    title: title,
                    hudl_link: link
                });

                if (response.success) {
                    closeHighlightModal();
                    loadHighlights(); // Reload highlights
                } else {
                    alert(response.message || 'Failed to add highlight');
                }
            } catch (error) {
                console.error('Error adding highlight:', error);
                alert('Failed to add highlight. Please try again.');
            } finally {
                btnHighlightSave.disabled = false;
                btnHighlightSave.textContent = 'Add Highlight';
            }
        });
    }

    // Close modal functions
    function closeHighlightModal() {
        addHighlightModal.classList.remove('active');
        document.body.style.overflow = '';
        resetHighlightModal();
    }

    function resetHighlightModal() {
        highlightTypeSelection.style.display = 'block';
        highlightLinkInput.style.display = 'none';
        addHighlightModalFooter.style.display = 'none';
        if (highlightTitleInput) highlightTitleInput.value = '';
        if (highlightLinkInputField) highlightLinkInputField.value = '';
    }

    if (addHighlightModalOverlay) {
        addHighlightModalOverlay.addEventListener('click', closeHighlightModal);
    }

    if (addHighlightModalClose) {
        addHighlightModalClose.addEventListener('click', closeHighlightModal);
    }
}

async function loadHighlights() {
    if (!viewingUserId) return;

    try {
        const response = await API.get(`/highlights/${viewingUserId}`);
        if (response.success && response.highlights) {
            playerHighlights = {
                season: response.highlights.filter(h => h.highlight_type === 'season'),
                game: response.highlights.filter(h => h.highlight_type === 'game')
            };
            renderHighlights();
        }
    } catch (error) {
        console.error('Error loading highlights:', error);
    }
}

function renderHighlights() {
    const seasonGrid = document.getElementById('seasonHighlightsGrid');
    const gameGrid = document.getElementById('gameHighlightsGrid');

    if (seasonGrid) {
        if (playerHighlights.season.length === 0) {
            seasonGrid.innerHTML = `
                <div class="no-highlights-message">
                    <p>No season highlight reels added yet.</p>
                </div>
            `;
        } else {
            seasonGrid.innerHTML = playerHighlights.season.map(highlight =>
                createHighlightCard(highlight)
            ).join('');
            attachHighlightCardEvents(seasonGrid);
        }
    }

    if (gameGrid) {
        if (playerHighlights.game.length === 0) {
            gameGrid.innerHTML = `
                <div class="no-highlights-message">
                    <p>No single game highlight reels added yet.</p>
                </div>
            `;
        } else {
            gameGrid.innerHTML = playerHighlights.game.map(highlight =>
                createHighlightCard(highlight)
            ).join('');
            attachHighlightCardEvents(gameGrid);
        }
    }
}

function createHighlightCard(highlight) {
    // Use the title from the database
    const title = highlight.title || (highlight.highlight_type === 'season' ? 'Season Highlight Reel' : 'Game Highlight Reel');
    const deleteButton = isOwnProfile
        ? `<button class="highlight-delete-btn show-button" data-id="${highlight.id}">
               <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <polyline points="3 6 5 6 21 6"></polyline>
                   <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
               </svg>
           </button>`
        : '';

    // Escape HTML in title to prevent XSS
    const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return `
        <div class="highlight-card" data-link="${highlight.hudl_link}">
            <div class="highlight-thumbnail">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                ${deleteButton}
            </div>
            <div class="highlight-info">
                <h3>${escapedTitle}</h3>
                <p>${truncateUrl(highlight.hudl_link)}</p>
            </div>
        </div>
    `;
}

function truncateUrl(url) {
    if (!url) return '';
    // Remove protocol and www
    let display = url.replace(/^https?:\/\/(www\.)?/, '');
    // Truncate if too long
    if (display.length > 40) {
        display = display.substring(0, 37) + '...';
    }
    return display;
}

function attachHighlightCardEvents(container) {
    // Click on card to open link
    container.querySelectorAll('.highlight-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't open link if clicking delete button
            if (e.target.closest('.highlight-delete-btn')) return;

            const link = card.dataset.link;
            if (link) {
                window.open(link, '_blank');
            }
        });
    });

    // Delete button - show confirmation modal
    container.querySelectorAll('.highlight-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const highlightId = btn.dataset.id;
            showDeleteHighlightConfirmModal(highlightId);
        });
    });
}

// Validate Hudl link
function isValidHudlLink(url) {
    if (!url) return false;

    // Check if it starts with http:// or https://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        return false;
    }

    // Check if it's a Hudl domain
    const hudlPatterns = [
        /^https?:\/\/(www\.)?hudl\.com\//,
        /^https?:\/\/hudl\.com\//
    ];

    return hudlPatterns.some(pattern => pattern.test(url));
}

// Delete highlight confirmation modal
let highlightToDelete = null;

function showDeleteHighlightConfirmModal(highlightId) {
    highlightToDelete = highlightId;
    const modal = document.getElementById('deleteHighlightConfirmModal');
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideDeleteHighlightConfirmModal() {
    highlightToDelete = null;
    const modal = document.getElementById('deleteHighlightConfirmModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function confirmDeleteHighlight() {
    if (!highlightToDelete) return;

    try {
        const response = await API.delete(`/highlights/${highlightToDelete}`);
        if (response.success) {
            hideDeleteHighlightConfirmModal();
            loadHighlights();
        } else {
            alert(response.message || 'Failed to delete highlight');
        }
    } catch (error) {
        console.error('Error deleting highlight:', error);
        alert('Failed to delete highlight. Please try again.');
    }
}

function setupDeleteHighlightConfirmModal() {
    const modal = document.getElementById('deleteHighlightConfirmModal');
    const overlay = document.getElementById('deleteHighlightConfirmOverlay');
    const cancelBtn = document.getElementById('btnHighlightConfirmCancel');
    const deleteBtn = document.getElementById('btnHighlightConfirmDelete');

    if (overlay) {
        overlay.addEventListener('click', hideDeleteHighlightConfirmModal);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideDeleteHighlightConfirmModal);
    }
    if (deleteBtn) {
        deleteBtn.addEventListener('click', confirmDeleteHighlight);
    }
}

// Initialize highlights
document.addEventListener('DOMContentLoaded', () => {
    setupHighlightsModal();
    setupDeleteHighlightConfirmModal();
    // Load highlights after a delay to ensure profile is loaded
    setTimeout(loadHighlights, 600);
});

// ============================================
// ACADEMICS TAB FUNCTIONALITY
// ============================================

function updateAcademicsDisplay(profile) {
    const gpaEl = document.getElementById('academicsGPA');
    const satEl = document.getElementById('academicsSAT');
    const actEl = document.getElementById('academicsACT');

    // Handle GPA - could be string or number from database
    if (gpaEl) {
        if (profile.gpa !== null && profile.gpa !== undefined && profile.gpa !== '') {
            const gpaNum = parseFloat(profile.gpa);
            gpaEl.textContent = isNaN(gpaNum) ? '--' : gpaNum.toFixed(2);
        } else {
            gpaEl.textContent = '--';
        }
    }
    if (satEl) satEl.textContent = profile.sat_score || '--';
    if (actEl) actEl.textContent = profile.act_score || '--';
}

function showEditAcademicsModal() {
    const modal = document.getElementById('editAcademicsModal');
    if (!modal || !currentProfile) return;

    // Populate form with current values
    document.getElementById('editAcademicsGPA').value = currentProfile.gpa || '';
    document.getElementById('editAcademicsSAT').value = currentProfile.sat_score || '';
    document.getElementById('editAcademicsACT').value = currentProfile.act_score || '';

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideEditAcademicsModal() {
    const modal = document.getElementById('editAcademicsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function saveAcademicsChanges() {
    const gpa = document.getElementById('editAcademicsGPA').value;
    const satScore = document.getElementById('editAcademicsSAT').value;
    const actScore = document.getElementById('editAcademicsACT').value;

    // Validate inputs
    if (gpa && (parseFloat(gpa) < 0 || parseFloat(gpa) > 5)) {
        alert('GPA must be between 0 and 5');
        return;
    }
    if (satScore && (parseInt(satScore) < 400 || parseInt(satScore) > 1600)) {
        alert('SAT score must be between 400 and 1600');
        return;
    }
    if (actScore && (parseInt(actScore) < 1 || parseInt(actScore) > 36)) {
        alert('ACT score must be between 1 and 36');
        return;
    }

    const academicsData = {
        gpa: gpa ? parseFloat(gpa) : null,
        sat_score: satScore ? parseInt(satScore) : null,
        act_score: actScore ? parseInt(actScore) : null
    };

    try {
        const response = await API.put('/profile', academicsData);
        if (response.success || response.profile) {
            // Update currentProfile with new values
            currentProfile.gpa = academicsData.gpa;
            currentProfile.sat_score = academicsData.sat_score;
            currentProfile.act_score = academicsData.act_score;

            // Update academics tab display
            updateAcademicsDisplay(currentProfile);

            // Update profile header display (shows GPA in meta info)
            displayProfile(currentProfile, 'player');

            // Close modal
            hideEditAcademicsModal();
        } else {
            alert(response.message || 'Failed to save academic information');
        }
    } catch (error) {
        console.error('Error saving academics:', error);
        alert('Failed to save academic information. Please try again.');
    }
}

function setupAcademicsModal() {
    const editAcademicsBtn = document.getElementById('editAcademicsBtn');
    const modal = document.getElementById('editAcademicsModal');
    const overlay = document.getElementById('editAcademicsModalOverlay');
    const closeBtn = document.getElementById('editAcademicsModalClose');
    const cancelBtn = document.getElementById('btnEditAcademicsCancel');
    const saveBtn = document.getElementById('btnEditAcademicsSave');

    // Show edit button only for own profile
    if (editAcademicsBtn && isOwnProfile) {
        editAcademicsBtn.classList.add('show-button');
        editAcademicsBtn.addEventListener('click', showEditAcademicsModal);
    }

    // Close modal handlers
    if (overlay) overlay.addEventListener('click', hideEditAcademicsModal);
    if (closeBtn) closeBtn.addEventListener('click', hideEditAcademicsModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideEditAcademicsModal);

    // Save button handler
    if (saveBtn) saveBtn.addEventListener('click', saveAcademicsChanges);
}

// Initialize academics when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Setup academics modal after a short delay to ensure profile is loaded
    setTimeout(() => {
        setupAcademicsModal();
        // Update academics display with current profile data
        if (currentProfile) {
            updateAcademicsDisplay(currentProfile);
        }
    }, 500);
});

console.log('My Profile page loaded (dynamic version)');

// Followers/Following Modal Functions
function setupFollowListModal() {
    const followersLink = document.getElementById('followersLink');
    const followingLink = document.getElementById('followingLink');
    const modal = document.getElementById('followListModal');
    const modalOverlay = document.getElementById('followListModalOverlay');
    const modalClose = document.getElementById('followListModalClose');

    if (followersLink) {
        followersLink.addEventListener('click', (e) => {
            e.preventDefault();
            openFollowListModal('followers');
        });
    }

    if (followingLink) {
        followingLink.addEventListener('click', (e) => {
            e.preventDefault();
            openFollowListModal('following');
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeFollowListModal);
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeFollowListModal);
    }
}

async function openFollowListModal(type) {
    const modal = document.getElementById('followListModal');
    const modalTitle = document.getElementById('followListModalTitle');
    const modalBody = document.getElementById('followListModalBody');

    if (!modal || !modalTitle || !modalBody) return;

    // Set title
    modalTitle.textContent = type === 'followers' ? 'Followers' : 'Following';

    // Show loading state
    modalBody.innerHTML = '<div class="follow-list-loading">Loading...</div>';

    // Show modal
    modal.classList.add('active');

    // Determine which user's followers/following to load
    const userId = viewingUserId || currentUserId;

    try {
        let users = [];
        if (type === 'followers') {
            const response = await followAPI.getFollowers(userId);
            users = response.followers || response || [];
        } else {
            const response = await followAPI.getFollowing(userId);
            users = response.following || response || [];
        }

        if (users.length === 0) {
            modalBody.innerHTML = `<div class="follow-list-empty">No ${type} yet</div>`;
            return;
        }

        // Render the list
        modalBody.innerHTML = users.map(user => `
            <div class="follow-list-item" data-user-id="${user.id}" data-role="${user.role}">
                <div class="follow-list-avatar">
                    ${user.profile_image_url
                        ? `<img src="${user.profile_image_url}" alt="${user.first_name}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                           </svg>`
                    }
                </div>
                <div class="follow-list-info">
                    <div class="follow-list-name">${user.first_name} ${user.last_name}</div>
                    <div class="follow-list-role">${user.role}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers to navigate to profiles
        modalBody.querySelectorAll('.follow-list-item').forEach(item => {
            item.addEventListener('click', async () => {
                const userId = item.dataset.userId;
                const role = item.dataset.role;

                // Fetch the user's username to navigate to their profile
                try {
                    let profileResponse;
                    if (role === 'player') {
                        profileResponse = await API.get(`/profile/player/${userId}`);
                    } else {
                        profileResponse = await API.get(`/profile/coach/${userId}`);
                    }

                    if (profileResponse.profile && profileResponse.profile.username) {
                        closeFollowListModal();
                        window.location.href = `my-profile.html?username=${profileResponse.profile.username}`;
                    }
                } catch (error) {
                    console.error('Error fetching profile:', error);
                }
            });
        });

    } catch (error) {
        console.error('Error loading follow list:', error);
        modalBody.innerHTML = '<div class="follow-list-empty">Failed to load</div>';
    }
}

function closeFollowListModal() {
    const modal = document.getElementById('followListModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Initialize the follow list modal when DOM is ready
document.addEventListener('DOMContentLoaded', setupFollowListModal);
