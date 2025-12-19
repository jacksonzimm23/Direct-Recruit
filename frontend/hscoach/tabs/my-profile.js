// My Profile JavaScript - Dynamic Version

let currentProfile = null;
let currentUserId = null;
let viewingUserId = null;
let isOwnProfile = true;
let isCollegeCoach = false;
let loggedInUserFolder = null; // Track the logged-in user's folder for navigation

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

// Function to update sidebar footer with fresh data from API (for transfer player logged-in users)
async function updateSidebarFooterFromAPI() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            const user = response.user;

            // Only apply transfer player format if the logged-in user is a transfer player
            if (user.is_transfer_player) {
                // Update name
                const userName = document.querySelector('.sidebar-footer .user-name');
                if (userName) {
                    userName.textContent = `${profile.first_name} ${profile.last_name}`;
                }

                // Update role/info line for transfer player: position • height • weight • YOE
                const userRoleElement = document.querySelector('.sidebar-footer .user-role');
                if (userRoleElement) {
                    const parts = [];

                    if (profile.position) parts.push(profile.position);

                    if (profile.height) {
                        if (typeof profile.height === 'string' && (profile.height.includes("'") || profile.height.includes('"'))) {
                            parts.push(profile.height);
                        } else {
                            const totalInches = parseInt(profile.height);
                            const feet = Math.floor(totalInches / 12);
                            const inches = totalInches % 12;
                            parts.push(`${feet}'${inches}"`);
                        }
                    }

                    if (profile.weight) {
                        parts.push(`${profile.weight} lbs`);
                    }

                    if (profile.eligibility) {
                        const yearText = profile.eligibility === 1 ? 'year' : 'years';
                        parts.push(`YOE: ${profile.eligibility} ${yearText}`);
                    }

                    userRoleElement.textContent = parts.join(' • ') || 'Transfer Player';
                    userRoleElement.style.color = '#b91c1c';
                }

                // Update avatar if available
                if (profile.profile_image_url) {
                    const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
                    if (avatarElement) {
                        avatarElement.innerHTML = `<img src="${profile.profile_image_url}?t=${Date.now()}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error updating sidebar footer:', error);
    }
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
            updateNavbarForLoggedInUser(response.user, response.profile);
        }
    } catch (error) {
        console.error('Failed to load current user:', error);
    }
}

// Rebuild the entire navbar to match the logged-in user's profile type
// This ensures the navbar stays consistent when viewing other profiles
function updateNavbarForLoggedInUser(user, profile) {
    // Determine the correct folder for the logged-in user
    let userFolder;
    let isCollege = false;
    let isTransferPlayer = false;
    const role = user.role;

    if (role === 'player') {
        // Use user.is_transfer_player for consistent transfer player detection
        isTransferPlayer = user.is_transfer_player || false;
        if (isTransferPlayer) {
            userFolder = 'transferplayer';
            isCollege = true; // Transfer players are college-level
        } else {
            isCollege = profile && profile.college_division && profile.college_division.trim() !== '';
            userFolder = isCollege ? 'collegeplayer' : 'hsplayer';
        }
    } else if (role === 'coach') {
        isCollege = profile && profile.college_division && profile.college_division.trim() !== '';
        userFolder = isCollege ? 'collegecoach' : 'hscoach';
    } else {
        return; // Unknown role, don't modify
    }

    // Add body class for transfer player viewers to apply red theme
    if (isTransferPlayer) {
        document.body.classList.add('transfer-player-viewer');
    }

    // Save to global for use in setupUI navigation handlers
    loggedInUserFolder = userFolder;

    const mainPage = role === 'player' ? 'mainpage-player.html' : 'mainpage-coach.html';

    // Determine which nav item should be active based on context
    // Note: Don't use isOwnProfile here - it's not set yet when this function runs
    // The active state will be finalized by updateActiveNavItem() after profile loads
    const urlParams = new URLSearchParams(window.location.search);
    const fromPage = urlParams.get('from');
    const hasUsername = urlParams.get('username');

    // Determine active states - only one should be active
    // If viewing own profile (no username param), highlight My Profile
    // Otherwise, use the 'from' parameter to determine which tab came from
    let feedActive = '';
    let discoverActive = '';
    let profileActive = '';
    let messagesActive = '';

    if (!hasUsername) {
        // Viewing own profile
        profileActive = 'active';
    } else if (fromPage === 'messages') {
        messagesActive = 'active';
    } else if (fromPage === 'discover') {
        discoverActive = 'active';
    } else if (fromPage === 'profile') {
        profileActive = 'active';
    } else if (fromPage === 'feed') {
        feedActive = 'active';
    } else {
        // Default to feed for viewing someone else's profile
        feedActive = 'active';
    }

    // Rebuild the sidebar nav with the correct items for the logged-in user
    const sidebarNav = document.querySelector('.sidebar-nav');
    if (sidebarNav) {
        let navHTML = '';

        if (role === 'player') {
            // Player nav items (same for HS and college players)
            navHTML = `
                <a href="/frontend/${userFolder}/${mainPage}" class="nav-item ${feedActive}" id="feedNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span>Feed</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/discover-players.html" class="nav-item ${discoverActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span>Discover</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/my-profile.html" class="nav-item ${profileActive}" id="profileNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/messages.html" class="nav-item ${messagesActive}" id="messagesNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Messages</span>
                    <span class="notification-badge" style="display: none;"></span>
                </a>
                <a href="/frontend/${userFolder}/tabs/notifications.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                </a>
                ${isCollege ? `
                <a href="/frontend/${userFolder}/tabs/transfer-portal.html" class="nav-item${isTransferPlayer ? ' nav-item-portal' : ''}" id="transferPortalNav">
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
        } else if (role === 'coach') {
            // Coach nav items - different for HS vs college coaches
            navHTML = `
                <a href="/frontend/${userFolder}/${mainPage}" class="nav-item ${feedActive}" id="feedNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span>Feed</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/discover-players.html" class="nav-item ${discoverActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span>Discover</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/my-profile.html" class="nav-item ${profileActive}" id="profileNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </a>
                <a href="/frontend/${userFolder}/tabs/messages.html" class="nav-item ${messagesActive}" id="messagesNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Messages</span>
                    <span class="notification-badge" style="display: none;"></span>
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

        // Update unread messages badge after navbar is rebuilt
        if (typeof updateUnreadMessagesBadge === 'function') {
            updateUnreadMessagesBadge();
        }
    }

    // Update sidebar footer with logged-in user's info (just update text content, preserve structure)
    // Apply inline styles to ensure consistent appearance regardless of which page's CSS is loaded
    if (profile) {
        // Define color based on logged-in user's role (players = cerulean/blue, coaches = orange)
        const userRoleColor = role === 'player' ? '#1282a2' : '#ff6b35';

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
            if (userFolder === 'transferplayer') {
                // Transfer Player: position • height • weight • YOE
                if (profile.position) parts.push(profile.position);

                // Height (handle both string "6'2"" and number 74 formats)
                if (profile.height) {
                    if (typeof profile.height === 'string' && (profile.height.includes("'") || profile.height.includes('"'))) {
                        parts.push(profile.height);
                    } else {
                        const totalInches = parseInt(profile.height);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        parts.push(`${feet}'${inches}"`);
                    }
                }

                if (profile.weight) {
                    parts.push(`${profile.weight} lbs`);
                }

                if (profile.eligibility) {
                    const yearText = profile.eligibility === 1 ? 'year' : 'years';
                    parts.push(`YOE: ${profile.eligibility} ${yearText}`);
                }

                userRole.textContent = parts.join(' • ') || 'Transfer Player';
                userRole.style.color = '#b91c1c'; // Transfer player red
            } else if (userFolder === 'hsplayer') {
                // HS Player: position • high_school • Class of graduation_year
                if (profile.position) parts.push(profile.position);
                if (profile.high_school) parts.push(profile.high_school);
                if (profile.graduation_year) parts.push(`Class of ${profile.graduation_year}`);
                userRole.textContent = parts.join(' • ') || 'Player';
            } else if (userFolder === 'collegeplayer') {
                // College Player: position • high_school • division
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
    // Update profile name
    const nameElement = document.querySelector('.profile-name');
    if (nameElement) {
        nameElement.textContent = `${profile.first_name} ${profile.last_name}`;
    }


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
    // Update position/stats line
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        const parts = [];
        // Handle position - replace commas with slashes if it's a string with multiple positions
        if (profile.position) {
            const positionDisplay = typeof profile.position === 'string' && profile.position.includes(', ')
                ? profile.position.replace(/, /g, '/')
                : profile.position;
            parts.push(positionDisplay);
        }
        if (profile.height) parts.push(`${Math.floor(profile.height / 12)}'${profile.height % 12}"`);
        if (profile.weight) parts.push(`${profile.weight} lbs`);
        positionElement.textContent = parts.join(' • ') || 'Position not specified';
    }

    // Update meta info
    const metaElement = document.querySelector('.profile-meta');
    if (metaElement) {
        const parts = [];
        if (profile.graduation_year) parts.push(`Class of ${profile.graduation_year}`);
        if (profile.city && profile.state) parts.push(`${profile.city}, ${profile.state}`);
        if (profile.gpa) parts.push(`GPA: ${profile.gpa}`);

        metaElement.innerHTML = parts.join(' <span>•</span> ') || 'Information not provided';
    }


    // Update athletic information
    updateInfoItem('Position', profile.position);
    updateInfoItem('Height', profile.height ? `${Math.floor(profile.height / 12)}'${profile.height % 12}"` : null);
    updateInfoItem('Weight', profile.weight ? `${profile.weight} lbs` : null);

    // Update contact info in sidebar
    updateContactInfo(profile);

    // Update school info
    updateSchoolInfo(profile);
}

function displayCoachProfile(profile) {
    // Row 1: Position Title (leave empty for now, filled by meta)
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        positionElement.textContent = '';
    }

    // Reorganized display structure
    const metaElement = document.querySelector('.profile-meta');
    if (metaElement) {
        const lines = [];

        // Row 2: School name, State (in orange and bold)
        const row2Parts = [];
        if (profile.college_name) row2Parts.push(profile.college_name);
        if (profile.state) row2Parts.push(profile.state);
        if (row2Parts.length > 0) {
            lines.push(`<span style="color: var(--accent-orange); font-weight: 700;">${row2Parts.join(', ')}</span>`);
        }

        // Row 3: Coaching position(s) - replace commas with slashes
        if (profile.position_title) {
            const positionDisplay = profile.position_title.includes(', ')
                ? profile.position_title.replace(/, /g, '/')
                : profile.position_title;
            lines.push(positionDisplay);
        }

        metaElement.innerHTML = lines.join('<br>') || 'Information not provided';
    }

    // Row 4: Display username in gray
    const usernameElement = document.querySelector('.profile-username');
    if (usernameElement && profile.username) {
        usernameElement.textContent = `@${profile.username}`;
    }


    // Update info items for coach
    updateInfoItem('Title', profile.position_title);
    updateInfoItem('College', profile.college_name);
    updateInfoItem('Division', profile.college_division);

    // Update contact info
    updateContactInfo(profile);

    // Update overview data
    displayOverviewData(profile);
}

// Display overview tab data for coaches
function displayOverviewData(profile) {
    // Update School Information section
    const schoolNameValue = document.getElementById('schoolNameValue');
    const schoolStateValue = document.getElementById('schoolStateValue');
    const conferenceValue = document.getElementById('conferenceValue');
    const recordValue = document.getElementById('recordValue');

    if (schoolNameValue) schoolNameValue.textContent = profile.college_name || '-';
    if (schoolStateValue) schoolStateValue.textContent = profile.state || '-';
    if (conferenceValue) conferenceValue.textContent = profile.conference || '-';
    if (recordValue) recordValue.textContent = profile.record || '-';

    // Update Program Achievements
    const achievementsList = document.getElementById('achievementsList');
    if (achievementsList) {
        if (profile.achievements && profile.achievements.trim()) {
            achievementsList.innerHTML = `<p>${escapeHtml(profile.achievements)}</p>`;
        } else {
            achievementsList.innerHTML = '<p class="no-data-message">No achievements added yet.</p>';
        }
    }

    // Update Coaching Experience
    const experienceList = document.getElementById('experienceList');
    if (experienceList) {
        if (profile.experience && profile.experience.trim()) {
            experienceList.innerHTML = `<p>${escapeHtml(profile.experience)}</p>`;
        } else {
            experienceList.innerHTML = '<p class="no-data-message">No experience added yet.</p>';
        }
    }

    // Update Coaching Philosophy
    const philosophyContent = document.getElementById('philosophyContent');
    if (philosophyContent) {
        if (profile.philosophy && profile.philosophy.trim()) {
            philosophyContent.innerHTML = `<p>${escapeHtml(profile.philosophy)}</p>`;
        } else {
            philosophyContent.innerHTML = '<p class="no-data-message">No philosophy added yet.</p>';
        }
    }
}

// Helper function to escape HTML for XSS protection
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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

    // Check if navigated to this profile (has username in URL) - always show back button in this case
    const urlParams = new URLSearchParams(window.location.search);
    const hasUsernameParam = urlParams.get('username');

    if (isOwnProfile && !hasUsernameParam) {
        // Show edit and share buttons (only when directly on own profile, not navigated via URL)
        actionsContainer.innerHTML = `
            <button class="btn-edit-profile show-button" id="editProfileBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Profile
            </button>
            <button class="btn-share-profile show-button">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
        `;

        // Re-attach event listeners after updating DOM
        const editProfileBtn = document.getElementById('editProfileBtn');
        console.log('Edit button found:', editProfileBtn);
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', function() {
                console.log('Edit button clicked!');
                showEditProfileModal();
            });
        } else {
            console.error('Edit button not found!');
        }

        const shareProfileBtn = document.querySelector('.btn-share-profile');
        if (shareProfileBtn) {
            shareProfileBtn.addEventListener('click', function() {
                const profileUrl = `${window.location.origin}/frontend/hscoach/tabs/my-profile.html?username=${currentProfile.username}`;
                navigator.clipboard.writeText(profileUrl).then(() => {
                    alert('Profile link copied to clipboard!');
                });
            });
        }
    } else if (isOwnProfile && hasUsernameParam) {
        // Own profile but navigated via URL - show back button and edit/share
        actionsContainer.innerHTML = `
            <button class="btn-back" id="backBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"></path>
                </svg>
                Back
            </button>
            <button class="btn-edit-profile show-button" id="editProfileBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Profile
            </button>
            <button class="btn-share-profile show-button">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
        `;

        // Setup back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        // Re-attach event listeners after updating DOM
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', function() {
                showEditProfileModal();
            });
        }

        const shareProfileBtn = document.querySelector('.btn-share-profile');
        if (shareProfileBtn) {
            shareProfileBtn.addEventListener('click', function() {
                const profileUrl = `${window.location.origin}/frontend/hscoach/tabs/my-profile.html?username=${currentProfile.username}`;
                navigator.clipboard.writeText(profileUrl).then(() => {
                    alert('Profile link copied to clipboard!');
                });
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

        // Setup message button
        setupMessageButton();
    }
}

function setupMessageButton() {
    const messageBtn = document.getElementById('messageBtn');
    if (!messageBtn || !viewingUserId) return;

    messageBtn.addEventListener('click', () => {
        // Navigate to messages page with the userId to start/open conversation
        const folder = loggedInUserFolder || 'hscoach';
        window.location.href = `/frontend/${folder}/tabs/messages.html?userId=${viewingUserId}`;
    });
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
    const messagesNavItem = document.getElementById('messagesNavItem');
    const discoverNavItem = document.querySelector('.nav-item[href*="discover"]');

    // Check if we came from another page
    const urlParams = new URLSearchParams(window.location.search);
    const fromPage = urlParams.get('from');
    const hasUsername = urlParams.get('username');

    if (feedNavItem && profileNavItem) {
        // Remove active from all first
        feedNavItem.classList.remove('active');
        profileNavItem.classList.remove('active');
        if (messagesNavItem) messagesNavItem.classList.remove('active');
        if (discoverNavItem) discoverNavItem.classList.remove('active');

        if (!hasUsername || isOwnProfile) {
            // Viewing own profile - highlight My Profile
            profileNavItem.classList.add('active');
        } else if (fromPage === 'messages' && messagesNavItem) {
            // Came from messages page - highlight Messages
            messagesNavItem.classList.add('active');
        } else if (fromPage === 'discover' && discoverNavItem) {
            // Came from discover page - highlight Discover
            discoverNavItem.classList.add('active');
        } else if (fromPage === 'profile' && profileNavItem) {
            // Came from another profile (followers/following modal) - highlight My Profile
            profileNavItem.classList.add('active');
        } else if (fromPage === 'feed') {
            // Came from feed page - highlight Feed
            feedNavItem.classList.add('active');
        } else {
            // Default: Viewing someone else's profile (from feed) - highlight Feed
            feedNavItem.classList.add('active');
        }
    }
}

function setupUI() {
    // Sidebar toggle functionality - mainpage-coach.js handles the toggle event
    // This function only manages the sidebar visibility state
    const dashboardContainer = document.getElementById('dashboardContainer');
    const rightSidebar = document.getElementById('rightSidebar');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');

    // Use setTimeout to ensure this runs after mainpage-coach.js DOMContentLoaded
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
            const rightSidebarHidden = localStorage.getItem('coachRightSidebarHidden') === 'true';
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

    // Control recruiting tab visibility - only for college coaches
    const recruitingTab = document.getElementById('recruitingTab');
    const recruitingPane = document.getElementById('recruiting');

    // Debug logging
    console.log('Setting up recruiting tab visibility:');
    console.log('Current Profile:', currentProfile);
    console.log('College Division:', currentProfile?.college_division);

    // Show recruiting tab ONLY if viewing profile has a college_division (college coaches)
    // High school coaches won't have a college division (FBS, FCS, D2, D3, NAIA, JUCO)
    const isCollegeCoachProfile = currentProfile &&
                                   currentProfile.college_division &&
                                   currentProfile.college_division.trim() !== '';

    if (isCollegeCoachProfile) {
        console.log('Showing recruiting tab - this is a college coach with division:', currentProfile.college_division);
        if (recruitingTab) {
            recruitingTab.style.display = '';
        }
        if (recruitingPane) {
            recruitingPane.style.display = '';
            displayRecruitingInfo(currentProfile);
        }
    } else {
        console.log('Hiding recruiting tab - this is a high school coach (no college division)');
        // Explicitly hide for high school coaches
        if (recruitingTab) {
            recruitingTab.style.display = 'none';
        }
        if (recruitingPane) {
            recruitingPane.style.display = 'none';
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

    // Edit profile button (only for own profile)
    setTimeout(() => {
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn && isOwnProfile) {
            editProfileBtn.classList.add('show-button');
            editProfileBtn.addEventListener('click', function() {
                showEditProfileModal();
            });
        }
    }, 100);

    // Setup modal close handlers
    setupEditProfileModal();

    // Share profile button
    const shareProfileBtn = document.querySelector('.btn-share-profile');
    if (shareProfileBtn && isOwnProfile) {
        shareProfileBtn.classList.add('show-button');
        shareProfileBtn.addEventListener('click', function() {
            const profileUrl = `${window.location.origin}/frontend/hscoach/tabs/my-profile.html?username=${currentProfile.username}`;
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
    // Show loading state
    const avatarElement = document.getElementById('profileAvatar');
    const changePhotoBtn = document.getElementById('changePhotoBtn');

    const originalAvatarHTML = avatarElement.innerHTML;
    avatarElement.innerHTML = `
        <div class="upload-spinner">
            <div class="spinner"></div>
        </div>
    `;
    changePhotoBtn.disabled = true;
    changePhotoBtn.style.opacity = '0.5';

    try {
        // Upload to server
        const response = await uploadAPI.uploadProfileImage(file);

        if (response.imageUrl || response.url) {
            const imageUrl = response.imageUrl || response.url;

            // Update profile with new image URL
            currentProfile.profile_image_url = imageUrl;

            // Update avatar with timestamp to force reload
            const imageUrlWithTimestamp = `${imageUrl}?t=${Date.now()}`;
            avatarElement.innerHTML = `<img src="${imageUrlWithTimestamp}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

            // Update sidebar footer with new profile image
            if (typeof updateSidebarFooter === 'function') {
                await updateSidebarFooter();
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
                    You haven't set up your profile yet. Complete your profile to connect with players!
                </p>
                <button onclick="window.location.href='../create-coach-profile.html'" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
                    Complete Profile
                </button>
            </div>
        `;
        // Show content since we're done loading
        mainContent.classList.add('profile-loaded');
    }
}

function showError(message) {
    const mainContent = document.querySelector('.profile-content');
    if (mainContent) {
        mainContent.innerHTML = `
            <div style="text-align: center; padding: 4rem 2rem; color: #ff6b6b;">
                <h2>Error</h2>
                <p>${message}</p>
                <button onclick="window.location.href='../mainpage-coach.html'" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; margin-top: 1rem;">
                    Back to Feed
                </button>
            </div>
        `;
        // Show content since we're done loading
        mainContent.classList.add('profile-loaded');
    }
}

function displayRecruitingInfo(profile) {
    // Display recruiting positions
    const positionsContainer = document.getElementById('recruitingPositions');
    if (positionsContainer) {
        if (profile.recruiting_positions && profile.recruiting_positions.length > 0) {
            positionsContainer.innerHTML = profile.recruiting_positions
                .map(pos => `<span class="recruiting-tag">${pos}</span>`)
                .join('');
        } else {
            positionsContainer.innerHTML = '<span class="recruiting-tag">All Positions</span>';
        }
    }

    // Display recruiting states
    const statesContainer = document.getElementById('recruitingStates');
    if (statesContainer) {
        if (profile.recruiting_states && profile.recruiting_states.length > 0) {
            statesContainer.innerHTML = profile.recruiting_states
                .map(state => `<span class="recruiting-tag">${state}</span>`)
                .join('');
        } else {
            statesContainer.innerHTML = '<span class="recruiting-tag">Nationwide</span>';
        }
    }
}

// Edit Profile Modal Functions
let editSelectedCoachingPositions = []; // Track selected coaching positions in edit modal
let originalUsername = ''; // Store original username for validation
let usernameCheckTimeout = null;

// Helper function to update character counters
function updateCharCounter(fieldName, maxLength) {
    const field = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    const counter = document.getElementById(`${fieldName}CharCounter`);
    if (field && counter) {
        const currentLength = field.value.length;
        counter.textContent = `${currentLength}/${maxLength}`;
        counter.classList.toggle('limit-reached', currentLength >= maxLength);
    }
}

function showEditProfileModal() {
    console.log('showEditProfileModal called');
    const modal = document.getElementById('editProfileModal');
    if (!modal) {
        console.error('Edit profile modal not found');
        return;
    }

    // Populate form with current profile data
    populateEditForm();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
    console.log('Modal should now be visible');
}

function populateEditForm() {
    if (!currentProfile) {
        console.warn('No current profile data');
        return;
    }

    // Populate text inputs with null checks
    const firstName = document.getElementById('editFirstName');
    const lastName = document.getElementById('editLastName');
    const username = document.getElementById('editUsername');

    if (firstName) firstName.value = currentProfile.first_name || '';
    if (lastName) lastName.value = currentProfile.last_name || '';
    if (username) username.value = currentProfile.username || '';

    // Determine if this is a college or high school coach based on college_division
    const isCollegeCoach = currentProfile.college_division && currentProfile.college_division.trim() !== '';

    const schoolTypeHS = document.getElementById('editSchoolTypeHS');
    const schoolTypeCollege = document.getElementById('editSchoolTypeCollege');
    const highschoolFields = document.getElementById('editHighschoolFields');
    const collegeFields = document.getElementById('editCollegeFields');

    if (isCollegeCoach) {
        // Show college fields and set active button
        if (schoolTypeCollege) schoolTypeCollege.classList.add('active');
        if (schoolTypeHS) schoolTypeHS.classList.remove('active');
        if (collegeFields) collegeFields.style.display = 'block';
        if (highschoolFields) highschoolFields.style.display = 'none';

        // Populate college fields
        const collegeName = document.getElementById('editCollegeName');
        const collegeState = document.getElementById('editCollegeState');
        const division = document.getElementById('editDivision');

        if (collegeName) collegeName.value = currentProfile.college_name || '';
        if (collegeState) collegeState.value = currentProfile.state || '';
        if (division) division.value = currentProfile.college_division || '';
    } else {
        // Show high school fields and set active button
        if (schoolTypeHS) schoolTypeHS.classList.add('active');
        if (schoolTypeCollege) schoolTypeCollege.classList.remove('active');
        if (highschoolFields) highschoolFields.style.display = 'block';
        if (collegeFields) collegeFields.style.display = 'none';

        // Populate high school fields
        const highSchoolName = document.getElementById('editHighSchoolName');
        const hsState = document.getElementById('editHSState');

        if (highSchoolName) highSchoolName.value = currentProfile.college_name || '';
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

    // Populate overview fields
    const conferenceField = document.getElementById('editConference');
    const recordField = document.getElementById('editRecord');
    const achievementsField = document.getElementById('editAchievements');
    const experienceField = document.getElementById('editExperience');
    const philosophyField = document.getElementById('editPhilosophy');

    if (conferenceField) conferenceField.value = currentProfile.conference || '';
    if (recordField) recordField.value = currentProfile.record || '';
    if (achievementsField) {
        achievementsField.value = currentProfile.achievements || '';
        updateCharCounter('achievements', 1000);
    }
    if (experienceField) {
        experienceField.value = currentProfile.experience || '';
        updateCharCounter('experience', 1000);
    }
    if (philosophyField) {
        philosophyField.value = currentProfile.philosophy || '';
        updateCharCounter('philosophy', 1000);
    }

    // Store original username for validation
    originalUsername = currentProfile.username || '';

    // Handle coaching positions - split slash-separated string into array
    editSelectedCoachingPositions = [];
    if (currentProfile.position_title) {
        editSelectedCoachingPositions = currentProfile.position_title.includes('/')
            ? currentProfile.position_title.split('/')
            : [currentProfile.position_title];
    }

    // Check the appropriate checkboxes
    const positionCheckboxes = document.querySelectorAll('#editCoachingPositionsContainer input[name="coachingPosition"]');
    positionCheckboxes.forEach(checkbox => {
        checkbox.checked = editSelectedCoachingPositions.includes(checkbox.value);
    });

    // Update the selected positions display
    updateEditSelectedCoachingPositions();
}

function hideEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = ''; // Restore scrolling
    }
}

// Update selected coaching positions display in edit modal
function updateEditSelectedCoachingPositions() {
    const container = document.getElementById('editSelectedCoachingPositions');
    if (!container) return;

    container.innerHTML = '';

    editSelectedCoachingPositions.forEach(position => {
        const pill = document.createElement('div');
        pill.className = 'selected-item';
        pill.innerHTML = `
            ${position}
            <button type="button" class="remove-item" data-position="${position}">×</button>
        `;
        container.appendChild(pill);
    });

    // Add click handlers to remove buttons
    document.querySelectorAll('#editSelectedCoachingPositions .remove-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const position = this.dataset.position;
            editSelectedCoachingPositions = editSelectedCoachingPositions.filter(pos => pos !== position);

            // Uncheck the corresponding checkbox
            const checkbox = document.querySelector(`#editCoachingPositionsContainer input[value="${position}"]`);
            if (checkbox) checkbox.checked = false;

            updateEditSelectedCoachingPositions();
        });
    });
}

async function saveProfileChanges() {
    const saveBtn = document.getElementById('btnModalSave');
    const originalText = saveBtn.textContent;

    try {
        // Validate username if it was changed
        const newUsername = document.getElementById('editUsername').value.trim();
        if (newUsername !== originalUsername) {
            const isValid = await validateUsername(newUsername, true);
            if (!isValid) {
                return; // Don't save if username is invalid
            }
        }

        // Show loading state
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        // Get form data - save positions as slash-separated string
        // Get phone number and extract only digits for storage
        const phoneInput = document.getElementById('editPhone').value;
        const phoneDigits = phoneInput.replace(/\D/g, '');

        // Determine which school type is active
        const schoolTypeCollege = document.getElementById('editSchoolTypeCollege');
        const isCollegeCoach = schoolTypeCollege && schoolTypeCollege.classList.contains('active');

        const formData = {
            first_name: document.getElementById('editFirstName').value,
            last_name: document.getElementById('editLastName').value,
            username: newUsername,
            position_title: editSelectedCoachingPositions.join('/'), // Join multiple positions with slash
            bio: document.getElementById('editBio').value,
            email: document.getElementById('editEmail').value,
            phone: phoneDigits,
            conference: document.getElementById('editConference').value.trim(),
            record: document.getElementById('editRecord').value.trim(),
            achievements: document.getElementById('editAchievements').value.trim(),
            experience: document.getElementById('editExperience').value.trim(),
            philosophy: document.getElementById('editPhilosophy').value.trim()
        };

        // Add school fields based on type
        if (isCollegeCoach) {
            formData.college_name = document.getElementById('editCollegeName').value;
            formData.state = document.getElementById('editCollegeState').value;
            formData.college_division = document.getElementById('editDivision').value;
        } else {
            formData.college_name = document.getElementById('editHighSchoolName').value;
            formData.state = document.getElementById('editHSState').value;
            formData.college_division = null; // Clear college division for HS coaches
        }

        // Send update request
        const response = await API.put('/profile', formData);

        if (response.success || response.profile) {
            // Update currentProfile
            if (response.profile) {
                currentProfile = response.profile;
            } else {
                // Update with the data we sent
                Object.assign(currentProfile, formData);
            }

            // Check if coach type changed (HS to College) - redirect to appropriate folder
            const collegeDivisions = ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO', 'Division II', 'Division III'];
            const newCollegeDivision = formData.college_division;
            const isNowCollegeCoach = newCollegeDivision && collegeDivisions.includes(newCollegeDivision);

            if (isNowCollegeCoach) {
                // Coach changed from HS to College - redirect to collegecoach folder
                showSuccessMessage('Profile updated! Redirecting to college coach dashboard...');
                setTimeout(() => {
                    window.location.href = '../../collegecoach/mainpage-coach.html';
                }, 1000);
                return;
            }

            // Refresh the profile display
            displayProfile(currentProfile, 'coach');

            // Update sidebar footer with new profile data
            if (typeof updateSidebarFooter === 'function') {
                await updateSidebarFooter();
            }

            // Close modal
            hideEditProfileModal();

            // Show success message
            showSuccessMessage('Profile updated successfully!');
        } else {
            throw new Error(response.message || 'Failed to update profile');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        showSuccessMessage('Failed to save profile changes: ' + error.message);
    } finally {
        // Always restore button state
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
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

function setupEditProfileModal() {
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

    // Handle coaching position checkbox changes in edit modal
    const positionCheckboxes = document.querySelectorAll('#editCoachingPositionsContainer input[name="coachingPosition"]');
    positionCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            if (this.checked) {
                if (!editSelectedCoachingPositions.includes(this.value)) {
                    editSelectedCoachingPositions.push(this.value);
                }
            } else {
                editSelectedCoachingPositions = editSelectedCoachingPositions.filter(pos => pos !== this.value);
            }
            updateEditSelectedCoachingPositions();
        });
    });

    // Handle username input changes with debouncing
    const usernameInput = document.getElementById('editUsername');
    if (usernameInput) {
        usernameInput.addEventListener('input', function() {
            // Convert to lowercase automatically
            this.value = this.value.toLowerCase();
            const username = this.value.trim();

            // Clear previous timeout
            if (usernameCheckTimeout) {
                clearTimeout(usernameCheckTimeout);
            }

            // Debounce the validation check
            usernameCheckTimeout = setTimeout(() => {
                validateUsername(username, false);
            }, 500);
        });
    }

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

    // Handle character counters for overview fields
    const achievementsInput = document.getElementById('editAchievements');
    const achievementsCounter = document.getElementById('achievementsCharCounter');
    if (achievementsInput && achievementsCounter) {
        achievementsInput.addEventListener('input', function() {
            const currentLength = this.value.length;
            achievementsCounter.textContent = `${currentLength}/1000`;
            achievementsCounter.classList.toggle('limit-reached', currentLength >= 1000);
        });
    }

    const experienceInput = document.getElementById('editExperience');
    const experienceCounter = document.getElementById('experienceCharCounter');
    if (experienceInput && experienceCounter) {
        experienceInput.addEventListener('input', function() {
            const currentLength = this.value.length;
            experienceCounter.textContent = `${currentLength}/1000`;
            experienceCounter.classList.toggle('limit-reached', currentLength >= 1000);
        });
    }

    const philosophyInput = document.getElementById('editPhilosophy');
    const philosophyCounter = document.getElementById('philosophyCharCounter');
    if (philosophyInput && philosophyCounter) {
        philosophyInput.addEventListener('input', function() {
            const currentLength = this.value.length;
            philosophyCounter.textContent = `${currentLength}/1000`;
            philosophyCounter.classList.toggle('limit-reached', currentLength >= 1000);
        });
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
}

// Username validation function
async function validateUsername(username, isFinalCheck = false) {
    const validationMsg = document.getElementById('editUsernameValidation');

    // Clear previous timeout
    if (usernameCheckTimeout) {
        clearTimeout(usernameCheckTimeout);
    }

    // Check if username is empty
    if (!username || username.trim() === '') {
        validationMsg.textContent = 'Username is required';
        validationMsg.className = 'validation-message error';
        return false;
    }

    // Check username format (lowercase letters, numbers, and underscore only, 3-20 characters)
    const usernameRegex = /^[a-z0-9_]{3,20}$/;
    if (!usernameRegex.test(username)) {
        validationMsg.textContent = 'Username must be 3-20 characters (lowercase letters, numbers, underscore only)';
        validationMsg.className = 'validation-message error';
        return false;
    }

    // If username hasn't changed, it's valid
    if (username === originalUsername) {
        validationMsg.textContent = '';
        validationMsg.className = 'validation-message';
        return true;
    }

    // Show checking message for non-final checks
    if (!isFinalCheck) {
        validationMsg.textContent = 'Checking availability...';
        validationMsg.className = 'validation-message checking';
    }

    try {
        // Check if username is available (checks across both players and coaches)
        const response = await API.get(`/profile/check-username/${username}`);

        if (response.available) {
            validationMsg.textContent = '✓ Username is available';
            validationMsg.className = 'validation-message success';
            return true;
        } else {
            validationMsg.textContent = 'Username is already taken';
            validationMsg.className = 'validation-message error';
            return false;
        }
    } catch (error) {
        console.error('Error checking username:', error);
        validationMsg.textContent = 'Error checking username availability';
        validationMsg.className = 'validation-message error';
        return false;
    }
}

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
                const visitorUserId = item.dataset.userId;
                const role = item.dataset.role;

                // Fetch the user's username to navigate to their profile
                try {
                    let profileResponse;
                    if (role === 'player') {
                        profileResponse = await API.get(`/profile/player/${visitorUserId}`);
                    } else {
                        profileResponse = await API.get(`/profile/coach/${visitorUserId}`);
                    }

                    if (profileResponse.profile && profileResponse.profile.username) {
                        closeFollowListModal();
                        // Navigate to the appropriate profile page based on role and type
                        const profile = profileResponse.profile;
                        if (role === 'coach') {
                            const isCollegeCoach = profile.college_division &&
                                ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA'].includes(profile.college_division);
                            if (isCollegeCoach) {
                                window.location.href = `../../collegecoach/tabs/my-profile.html?username=${profile.username}&from=profile`;
                            } else {
                                window.location.href = `my-profile.html?username=${profile.username}&from=profile`;
                            }
                        } else {
                            const isCollegePlayer = profile.college_division &&
                                ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA'].includes(profile.college_division);
                            if (isCollegePlayer) {
                                window.location.href = `../../collegeplayer/tabs/my-profile.html?username=${profile.username}&from=profile`;
                            } else {
                                window.location.href = `../../hsplayer/tabs/my-profile.html?username=${profile.username}&from=profile`;
                            }
                        }
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