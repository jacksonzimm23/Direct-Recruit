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

// Show share toast notification
function showShareToast() {
    // Remove existing toast if any
    const existingToast = document.querySelector('.share-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = 'share-toast';
    toast.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Profile link copied to clipboard!
    `;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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
                        avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
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
    const role = user.role;

    let isTransferPlayer = false;

    if (role === 'player') {
        // Check if transfer player first - they should use transferplayer folder
        isTransferPlayer = user.is_transfer_player || (profile && profile.transfer === 'y');
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
    let notificationsActive = '';

    if (!hasUsername) {
        // Viewing own profile
        profileActive = 'active';
    } else if (fromPage === 'messages') {
        messagesActive = 'active';
    } else if (fromPage === 'discover') {
        discoverActive = 'active';
    } else if (fromPage === 'notifications') {
        notificationsActive = 'active';
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
                <a href="/frontend/${userFolder}/tabs/notifications.html" class="nav-item ${notificationsActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                    <span class="notification-badge" style="display: none;"></span>
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
                <a href="/frontend/${userFolder}/tabs/notifications.html" class="nav-item ${notificationsActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                    <span class="notification-badge" style="display: none;"></span>
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

        // Inject a style tag to override the page CSS
        // Use theme colors based on logged-in user's folder, not the page being viewed
        let navActiveColor, navActiveBg, navHoverBg;

        if (userFolder === 'transferplayer') {
            // Transfer players use red theme
            navActiveColor = '#b91c1c';
            navActiveBg = 'rgba(185, 28, 28, 0.2)';
            navHoverBg = 'rgba(185, 28, 28, 0.1)';
        } else if (userFolder === 'collegecoach' || userFolder === 'hscoach') {
            // Coaches use blue/cerulean theme
            navActiveColor = '#1282a2';
            navActiveBg = 'rgba(18, 130, 162, 0.2)';
            navHoverBg = 'rgba(18, 130, 162, 0.1)';
        } else {
            // Other players use blue/cerulean theme
            navActiveColor = '#1282a2';
            navActiveBg = 'rgba(18, 130, 162, 0.2)';
            navHoverBg = 'rgba(18, 130, 162, 0.1)';
        }

        // Remove any existing nav override style
        const existingStyle = document.getElementById('nav-theme-override');
        if (existingStyle) {
            existingStyle.remove();
        }

        // Create new style tag with proper theme colors - use very high specificity
        const styleTag = document.createElement('style');
        styleTag.id = 'nav-theme-override';
        styleTag.textContent = `
            /* Reset all nav items to default state - white text */
            .sidebar .sidebar-nav .nav-item,
            .sidebar .sidebar-nav a.nav-item {
                color: var(--white, #ffffff) !important;
            }
            .sidebar .sidebar-nav .nav-item .nav-icon,
            .sidebar .sidebar-nav a.nav-item .nav-icon {
                color: var(--white, #ffffff) !important;
            }
            /* Transfer Portal nav item - always red text only for transfer players */
            ${userFolder === 'transferplayer' ? `
            .sidebar .sidebar-nav .nav-item.nav-item-portal,
            .sidebar .sidebar-nav a.nav-item.nav-item-portal {
                color: #b91c1c !important;
            }
            .sidebar .sidebar-nav .nav-item.nav-item-portal .nav-icon,
            .sidebar .sidebar-nav a.nav-item.nav-item-portal .nav-icon {
                color: #b91c1c !important;
            }
            ` : ''}
            /* Hover state */
            .sidebar .sidebar-nav .nav-item:hover,
            .sidebar .sidebar-nav a.nav-item:hover {
                background: ${navHoverBg} !important;
            }
            /* Active state - based on logged-in user's theme */
            .sidebar .sidebar-nav .nav-item.active,
            .sidebar .sidebar-nav a.nav-item.active {
                background: ${navActiveBg} !important;
                color: ${navActiveColor} !important;
                border-left: 3px solid ${navActiveColor} !important;
            }
            .sidebar .sidebar-nav .nav-item.active .nav-icon,
            .sidebar .sidebar-nav a.nav-item.active .nav-icon {
                color: ${navActiveColor} !important;
            }
        `;
        document.head.appendChild(styleTag);

        // Update unread messages badge after navbar is rebuilt
        if (typeof updateUnreadMessagesBadge === 'function') {
            updateUnreadMessagesBadge();
        }
        // Update unread notifications badge after navbar is rebuilt
        if (typeof updateUnreadNotificationsBadge === 'function') {
            updateUnreadNotificationsBadge();
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
                if (profile.college_division) {
                    // Format FBS/FCS as D1 FBS/D1 FCS
                    const divDisplay = (profile.college_division === 'FBS' || profile.college_division === 'FCS')
                        ? `D1 ${profile.college_division}`
                        : profile.college_division;
                    parts.push(divDisplay);
                }
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

async function displayProfile(profile, type) {
    // Store the profile type globally
    currentProfileType = type;

    // Update profile name
    const nameElement = document.querySelector('.profile-name');
    if (nameElement) {
        nameElement.textContent = `${profile.first_name} ${profile.last_name}`;

        // Check if this profile follows the current user and add badge
        if (viewingUserId) {
            try {
                const followsMeResponse = await API.get(`/follow/${viewingUserId}/follows-me`);
                // Remove existing badge if any
                const existingBadge = nameElement.parentElement.querySelector('.follows-you-badge');
                if (existingBadge) existingBadge.remove();

                if (followsMeResponse.followsMe) {
                    const badge = document.createElement('span');
                    badge.className = 'follows-you-badge';
                    badge.textContent = 'Follows you';
                    nameElement.parentElement.insertBefore(badge, nameElement.nextSibling);
                }
            } catch (error) {
                console.error('Error checking if user follows me:', error);
            }
        }
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

    // Update Current Team Info section in Overview tab
    updateCurrentTeamInfo(profile);

    // Update Career Achievements section in Overview tab
    updateCareerAchievements(profile);

    // Update Social Media section in Overview tab
    updateSocialMedia(profile);

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

        // Add college division
        if (profile.college_division) {
            const div = profile.college_division;
            // Add "D1" prefix for FBS/FCS divisions
            if (div === 'FBS' || div === 'FCS') {
                parts.push(`D1 ${div}`);
            } else {
                parts.push(div);
            }
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
        if (profile.college_division) {
            // Format FBS/FCS as D1 FBS/D1 FCS
            const divDisplay = (profile.college_division === 'FBS' || profile.college_division === 'FCS')
                ? `D1 ${profile.college_division}`
                : profile.college_division;
            parts.push(divDisplay);
        }
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

// Update the Current Team Info section in Overview tab
function updateCurrentTeamInfo(profile) {
    const schoolEl = document.getElementById('teamSchool');
    const stateEl = document.getElementById('teamState');
    const divisionEl = document.getElementById('teamDivision');
    const conferenceEl = document.getElementById('teamConference');
    const positionEl = document.getElementById('teamPosition');
    const numberEl = document.getElementById('teamNumber');
    const eligibilityEl = document.getElementById('teamEligibility');

    if (schoolEl) schoolEl.textContent = profile.high_school || '-';
    if (stateEl) stateEl.textContent = profile.state || '-';
    if (divisionEl) divisionEl.textContent = profile.college_division || '-';
    if (conferenceEl) conferenceEl.textContent = profile.conference || '-';

    // Handle position - can be array or slash-separated string
    if (positionEl) {
        if (profile.position) {
            const positionDisplay = Array.isArray(profile.position)
                ? profile.position.join('/')
                : profile.position;
            positionEl.textContent = positionDisplay;
        } else {
            positionEl.textContent = '-';
        }
    }

    if (numberEl) numberEl.textContent = profile.number ? `#${profile.number}` : '-';
    if (eligibilityEl) eligibilityEl.textContent = profile.eligibility ? `${profile.eligibility} year${profile.eligibility !== 1 ? 's' : ''}` : '-';
}

// Update the Career Achievements section in Overview tab
function updateCareerAchievements(profile) {
    const achievementsCard = document.getElementById('careerAchievementsCard');
    if (!achievementsCard) return;

    if (profile.achievements && profile.achievements.trim()) {
        achievementsCard.innerHTML = `<p class="achievements-text">${profile.achievements}</p>`;
    } else {
        achievementsCard.innerHTML = '<p class="empty-state-text">No achievements added yet.</p>';
    }
}

// Update the Social Media section in Overview tab
function updateSocialMedia(profile) {
    const socialMediaCard = document.getElementById('socialMediaCard');
    if (!socialMediaCard) return;

    // Parse socials from JSON if stored as string
    let socials = {};
    if (profile.socials) {
        try {
            socials = typeof profile.socials === 'string'
                ? JSON.parse(profile.socials)
                : profile.socials;
        } catch (e) {
            console.log('Could not parse socials:', e);
        }
    }

    const hasHudl = socials.hudl && socials.hudl.trim();
    const hasInstagram = socials.instagram && socials.instagram.trim();

    if (hasHudl || hasInstagram) {
        let html = '<div class="social-media-links">';

        if (hasHudl) {
            html += `
                <a href="${socials.hudl}" target="_blank" rel="noopener noreferrer" class="social-media-link">
                    <div class="social-icon hudl">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                        </svg>
                    </div>
                    <span class="link-text">Hudl Profile</span>
                    <svg class="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; opacity: 0.5;">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
            `;
        }

        if (hasInstagram) {
            html += `
                <a href="${socials.instagram}" target="_blank" rel="noopener noreferrer" class="social-media-link">
                    <div class="social-icon instagram">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                        </svg>
                    </div>
                    <span class="link-text">Instagram</span>
                    <svg class="external-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; opacity: 0.5;">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                </a>
            `;
        }

        html += '</div>';
        socialMediaCard.innerHTML = html;
    } else {
        socialMediaCard.innerHTML = '<p class="empty-state-text">No social media links added yet.</p>';
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

        // Setup share profile button
        const shareBtn = actionsContainer.querySelector('.btn-share-profile');
        if (shareBtn) {
            shareBtn.addEventListener('click', async function() {
                const profileUrl = `${window.location.origin}/frontend/collegeplayer/tabs/my-profile.html?username=${currentProfile.username}`;
                try {
                    await navigator.clipboard.writeText(profileUrl);
                    showShareToast();
                } catch (err) {
                    const textArea = document.createElement('textarea');
                    textArea.value = profileUrl;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    showShareToast();
                }
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

        // Setup back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        // Setup edit profile button
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', function() {
                showEditProfileModal();
            });
        }

        // Setup share profile button
        const shareBtn = actionsContainer.querySelector('.btn-share-profile');
        if (shareBtn) {
            shareBtn.addEventListener('click', async function() {
                const profileUrl = `${window.location.origin}/frontend/collegeplayer/tabs/my-profile.html?username=${currentProfile.username}`;
                try {
                    await navigator.clipboard.writeText(profileUrl);
                    showShareToast();
                } catch (err) {
                    const textArea = document.createElement('textarea');
                    textArea.value = profileUrl;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    showShareToast();
                }
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
        // Determine the correct folder for navigation based on logged-in user
        const folder = loggedInUserFolder || 'collegeplayer';
        window.location.href = `/frontend/${folder}/tabs/messages.html?userId=${viewingUserId}`;
    });
}

async function setupFollowButton() {
    const followBtn = document.getElementById('followBtn');
    if (!followBtn || !viewingUserId) return;

    // Check follow status and if they follow us
    try {
        const [followResponse, followsMeResponse] = await Promise.all([
            API.get(`/follow/${viewingUserId}/check`),
            API.get(`/follow/${viewingUserId}/follows-me`)
        ]);
        const isFollowing = followResponse.isFollowing;
        const theyFollowMe = followsMeResponse.followsMe;

        // Determine button text: "Following", "Follow back", or "Follow"
        const getButtonText = (following) => {
            if (following) return 'Following';
            return theyFollowMe ? 'Follow back' : 'Follow';
        };

        followBtn.textContent = getButtonText(isFollowing);
        followBtn.classList.toggle('following', isFollowing);

        followBtn.addEventListener('click', async () => {
            try {
                const currentlyFollowing = followBtn.classList.contains('following');

                if (currentlyFollowing) {
                    await API.delete(`/follow/${viewingUserId}`);
                    followBtn.textContent = getButtonText(false);
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
    const notificationsNavItem = document.querySelector('.nav-item[href*="notifications"]');

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
        if (notificationsNavItem) notificationsNavItem.classList.remove('active');

        if (!hasUsername || isOwnProfile) {
            // Viewing own profile - highlight My Profile
            profileNavItem.classList.add('active');
        } else if (fromPage === 'messages' && messagesNavItem) {
            // Came from messages page - highlight Messages
            messagesNavItem.classList.add('active');
        } else if (fromPage === 'discover' && discoverNavItem) {
            // Came from discover page - highlight Discover
            discoverNavItem.classList.add('active');
        } else if (fromPage === 'notifications' && notificationsNavItem) {
            // Came from notifications page - highlight Notifications
            notificationsNavItem.classList.add('active');
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

    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;

            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

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

            // Update avatar - use the URL directly (signed URLs already have cache-busting via signature)
            // Don't add extra query params as it breaks the S3 signature
            avatarElement.innerHTML = `<img src="${imageUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

            // Update avatar in sidebar
            const sidebarAvatar = document.querySelector('.sidebar-footer .user-avatar-circle');
            if (sidebarAvatar) {
                sidebarAvatar.innerHTML = `<img src="${imageUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
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
                <button onclick="window.location.href='../../hsplayer/create-profile.html'" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
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
        const conference = document.getElementById('editConference');
        const jerseyNumber = document.getElementById('editJerseyNumber');
        const eligibility = document.getElementById('editEligibility');

        if (collegeName) collegeName.value = currentProfile.high_school || ''; // Using high_school field for college name
        if (collegeState) collegeState.value = currentProfile.state || '';
        if (division) division.value = currentProfile.college_division || '';
        if (conference) conference.value = currentProfile.conference || '';
        if (jerseyNumber) jerseyNumber.value = currentProfile.number || '';
        if (eligibility) eligibility.value = currentProfile.eligibility || '';
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

    // Populate achievements
    const achievements = document.getElementById('editAchievements');
    if (achievements) {
        achievements.value = currentProfile.achievements || '';
        // Update character counter
        const achievementsCounter = document.getElementById('achievementsCharCounter');
        if (achievementsCounter) {
            const currentLength = achievements.value.length;
            achievementsCounter.textContent = `${currentLength}/500`;
            achievementsCounter.classList.toggle('limit-reached', currentLength >= 500);
        }
    }

    // Populate social media links - parse from JSON if stored as JSON string
    let socials = {};
    if (currentProfile.socials) {
        try {
            socials = typeof currentProfile.socials === 'string'
                ? JSON.parse(currentProfile.socials)
                : currentProfile.socials;
        } catch (e) {
            console.log('Could not parse socials:', e);
        }
    }

    const hudlLink = document.getElementById('editHudlLink');
    const instagramLink = document.getElementById('editInstagramLink');
    if (hudlLink) hudlLink.value = socials.hudl || '';
    if (instagramLink) instagramLink.value = socials.instagram || '';

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

        // Build social media links object
        const hudlLink = document.getElementById('editHudlLink').value.trim();
        const instagramLink = document.getElementById('editInstagramLink').value.trim();
        const socialsObj = {};
        if (hudlLink) socialsObj.hudl = hudlLink;
        if (instagramLink) socialsObj.instagram = instagramLink;
        const socialsJson = Object.keys(socialsObj).length > 0 ? JSON.stringify(socialsObj) : null;

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
            phone: phoneDigits,
            achievements: document.getElementById('editAchievements').value || null,
            socials: socialsJson
        };

        // Add school fields based on type
        if (isCollegePlayer) {
            formData.high_school = document.getElementById('editCollegeName').value;
            formData.state = document.getElementById('editCollegeState').value;
            formData.college_division = document.getElementById('editDivision').value;
            formData.conference = document.getElementById('editConference').value || null;
            formData.number = document.getElementById('editJerseyNumber').value ? parseInt(document.getElementById('editJerseyNumber').value) : null;
            formData.eligibility = document.getElementById('editEligibility').value ? parseInt(document.getElementById('editEligibility').value) : null;
        } else {
            formData.high_school = document.getElementById('editHighSchool').value;
            formData.state = document.getElementById('editHSState').value;
            formData.college_division = null; // Clear college division for HS players
            formData.conference = null;
            formData.number = null;
            formData.eligibility = null;
        }

        // Send update request
        const response = await API.put('/profile', formData);

        if (response.success || response.profile) {
            // Preserve the current signed profile image URL before updating
            // The API returns the raw S3 key, not the signed URL needed for display
            const currentSignedImageUrl = currentProfile.profile_image_url;

            // Update currentProfile - use response.profile which has the database formatted data
            if (response.profile) {
                currentProfile = response.profile;
            } else {
                // If response.profile not available, merge formData but keep database types
                currentProfile = { ...currentProfile, ...formData };
            }

            // Restore the signed image URL if the API returned an unsigned S3 key
            // (S3 keys start with 'profiles/' while signed URLs start with 'https://')
            if (currentSignedImageUrl && currentSignedImageUrl.startsWith('https://')) {
                // Check if the response has an unsigned S3 key or no image URL
                if (!currentProfile.profile_image_url || currentProfile.profile_image_url.startsWith('profiles/')) {
                    currentProfile.profile_image_url = currentSignedImageUrl;
                }
            }

            // Check if player type changed (College to HS) - redirect to appropriate folder
            const collegeDivisions = ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO', 'Division II', 'Division III'];
            const newCollegeDivision = formData.college_division;
            const isStillCollegePlayer = newCollegeDivision && collegeDivisions.includes(newCollegeDivision);

            if (!isStillCollegePlayer) {
                // Player changed from College to HS - redirect to hsplayer folder
                showSuccessMessage('Profile updated! Redirecting to high school player dashboard...');
                setTimeout(() => {
                    window.location.href = '../../hsplayer/mainpage-player.html';
                }, 1000);
                return;
            }

            // Refresh the profile display
            displayProfile(currentProfile, 'player');

            // Refresh sidebar footer with updated profile info
            if (typeof updateSidebarFooter === 'function') {
                await updateSidebarFooter();
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

    // Handle achievements character counter
    const achievementsInput = document.getElementById('editAchievements');
    const achievementsCounter = document.getElementById('achievementsCharCounter');
    if (achievementsInput && achievementsCounter) {
        achievementsInput.addEventListener('input', function() {
            const currentLength = this.value.length;
            achievementsCounter.textContent = `${currentLength}/500`;

            // Add/remove limit-reached class
            if (currentLength >= 500) {
                achievementsCounter.classList.add('limit-reached');
            } else {
                achievementsCounter.classList.remove('limit-reached');
            }
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
                            const coachFolder = isCollegeCoach ? 'collegecoach' : 'hscoach';
                            window.location.href = `../../${coachFolder}/tabs/my-profile.html?username=${profile.username}&from=profile`;
                        } else {
                            const isCollegePlayer = profile.college_division &&
                                ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA'].includes(profile.college_division);
                            if (isCollegePlayer) {
                                window.location.href = `my-profile.html?username=${profile.username}&from=profile`;
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
