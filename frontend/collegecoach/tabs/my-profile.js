// My Profile JavaScript - Dynamic Version

let currentProfile = null;
let currentUser = null;       // mirrors response.user from /auth/me — used by the Change Team modal to surface the coach's login email
let currentUserId = null;
let viewingUserId = null;
let isOwnProfile = true;
let isCollegeCoach = false;
let loggedInUserFolder = null; // Track the logged-in user's folder for navigation
let editSchoolSearch = null; // School search instance for edit modal
let viewedProfileType = null; // Track the type of profile being viewed ('player' or 'coach')
let isViewedProfileHSPlayer = false; // Track if viewed profile is an HS player
let isViewedProfileTransferPlayer = false; // Track if viewed profile is a transfer player

// Profile posts/replies/likes state
let profilePostsLoaded = false;
let profileRepliesLoaded = false;
let profileLikesLoaded = false;
let profilePostsOffset = 0;
let profileRepliesOffset = 0;
let profileLikesOffset = 0;
const POSTS_PER_PAGE = 10;
const REPLIES_PER_PAGE = 10;
const LIKES_PER_PAGE = 10;

// Format phone number as (XXX) XXX-XXXX
function formatPhoneNumber(phone) {
    if (!phone) return '';

    // Get only the digits
    const digits = phone.replace(/\D/g, '');

    // Format based on number of digits
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.substring(0, 3) + ') ' + digits.substring(3);
    return '(' + digits.substring(0, 3) + ') ' + digits.substring(3, 6) + '-' + digits.substring(6, 10);
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
                    if (typeof ensureSchoolLogosLoaded === 'function') await ensureSchoolLogosLoaded('../../assets');
                    const _prLogo = typeof getSchoolLogoHTML === 'function' ? getSchoolLogoHTML(profile.team_name, '../../assets', 16) : '';
                    userName.innerHTML = `<span class="user-name-text">${profile.first_name} ${profile.last_name}</span>${_prLogo}`;
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
                        avatarElement.style.border = `2px solid ${getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division)}`;
                        avatarElement.style.color = getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division);
                        avatarElement.style.backgroundColor = getRoleAvatarBg(user.role, user.is_transfer_player, profile.college_division);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error updating sidebar footer:', error);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Edit Profile modal no longer surfaces the school name / division as editable
    // inputs — team changes now go through the admin-verified team-switch flow
    // (Change Team button). Hidden mirrors keep the old IDs so the save handler
    // still finds them, but they're never written to. The school-search widget
    // is no longer wired here for that reason.
    editSchoolSearch = null;

    // Hide sidebar footer initially to prevent flash of old content
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (sidebarFooter) {
        sidebarFooter.style.opacity = '0';
    }

    // Get username or userId from URL if viewing someone else's profile
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');
    const userIdParam = urlParams.get('userId');

    // Load current user first
    await loadCurrentUser();

    // Setup college coach navigation visibility
    await setupCollegeCoachNav();

    // Load profile data
    if (username) {
        await loadProfileByUsername(username);
    } else if (userIdParam) {
        await loadProfileByUserId(userIdParam);
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
    } finally {
        document.documentElement.classList.add('sidebar-ready');
    }
}

// Rebuild the entire navbar to match the logged-in user's profile type
// This ensures the navbar stays consistent when viewing other profiles
function updateNavbarForLoggedInUser(user, profile) {
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    // Determine the correct folder for the logged-in user
    const role = user.role;
    const userFolder = getProfileFolder({ role, is_transfer_player: user.is_transfer_player, transfer: profile && profile.transfer, college_division: profile && profile.college_division });
    if (!userFolder) return; // Unknown role, don't modify
    const isTransferPlayer = userFolder === 'transferplayer';
    const isCollege = ['collegeplayer', 'collegecoach', 'transferplayer'].includes(userFolder);

    // Add body class for transfer player viewers to apply red theme
    if (isTransferPlayer) {
        document.body.classList.add('transfer-player-viewer');
    }

    // Update profile-type body class to match logged-in user (not the page being viewed)
    document.body.classList.remove('profile-type-player', 'profile-type-coach', 'profile-type-transfer', 'profile-type-other');
    const profileTypeMap = { transferplayer: 'transfer', hsplayer: 'player', collegeplayer: 'player', hscoach: 'coach', collegecoach: 'coach', other: 'other' };
    document.body.classList.add(`profile-type-${profileTypeMap[userFolder] || 'player'}`);

    // Save to global for use in setupUI navigation handlers
    loggedInUserFolder = userFolder;

    const mainPage = role === 'player' ? 'mainpage-player.html' : 'mainpage-coach.html';

    // Determine which nav item should be active based on context
    // Note: Don't use isOwnProfile here - it's not set yet when this function runs
    // The active state will be finalized by updateActiveNavItem() after profile loads
    const urlParams = new URLSearchParams(window.location.search);
    const fromPage = urlParams.get('from');
    const hasUsername = urlParams.get('username') || urlParams.get('userId');

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
                <a href="${FE_BASE}/${userFolder}/${mainPage}" class="nav-item ${feedActive}" id="feedNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span>Feed</span>
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/discover-players.html" class="nav-item ${discoverActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span>Discover</span>
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/my-profile.html" class="nav-item ${profileActive}" id="profileNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </a>
                ${(userFolder === 'hsplayer' || userFolder === 'transferplayer') ? `
                <a href="${FE_BASE}/${userFolder}/tabs/ai-rep.html" class="nav-item nav-item-ai-rep">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z"/>
                    </svg>
                    <span>AI Rep</span>
                </a>
                ` : ''}
                <a href="${FE_BASE}/${userFolder}/tabs/messages.html" class="nav-item ${messagesActive}" id="messagesNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Messages</span>
                    <span class="notification-badge" style="display: none;"></span>
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/notifications.html" class="nav-item ${notificationsActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                    <span class="notification-badge" style="display: none;"></span>
                </a>
                ${isCollege ? `
                <a href="${FE_BASE}/${userFolder}/tabs/transfer-portal.html" class="nav-item${isTransferPlayer ? ' nav-item-portal' : ''}" id="transferPortalNav">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 12h8"></path>
                        <path d="M12 8v8"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>Transfer Portal</span>
                </a>
                ` : ''}
                <a href="${FE_BASE}/${userFolder}/tabs/settings.html" class="nav-item">
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
                <a href="${FE_BASE}/${userFolder}/${mainPage}" class="nav-item ${feedActive}" id="feedNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span>Feed</span>
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/discover-players.html" class="nav-item ${discoverActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span>Discover</span>
                    ${userFolder === 'collegecoach' ? '<span class="nav-ai-badge">AI</span>' : ''}
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/my-profile.html" class="nav-item ${profileActive}" id="profileNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/messages.html" class="nav-item ${messagesActive}" id="messagesNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Messages</span>
                    <span class="notification-badge" style="display: none;"></span>
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/notifications.html" class="nav-item ${notificationsActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                    <span class="notification-badge" style="display: none;"></span>
                </a>
                ${isCollege ? `
                <a href="${FE_BASE}/${userFolder}/tabs/recruiting-board.html" class="nav-item" id="recruitingBoardNav">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="9" y1="3" x2="9" y2="21"></line>
                        <line x1="15" y1="3" x2="15" y2="21"></line>
                        <line x1="3" y1="9" x2="21" y2="9"></line>
                        <line x1="3" y1="15" x2="21" y2="15"></line>
                    </svg>
                    <span>Recruiting Board</span>
                </a>
                <a href="${FE_BASE}/${userFolder}/tabs/transfer-portal.html" class="nav-item" id="transferPortalNav">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 12h8"></path>
                        <path d="M12 8v8"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    <span>Transfer Portal</span>
                    ${userFolder === 'collegecoach' ? '<span class="nav-ai-badge">AI</span>' : ''}
                </a>
                ` : ''}
                <a href="${FE_BASE}/${userFolder}/tabs/settings.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                </a>
            `;
        } else if (role === 'other') {
            navHTML = `
                <a href="${FE_BASE}/other/mainpage-other.html" class="nav-item ${feedActive}" id="feedNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span>Feed</span>
                </a>
                <a href="${FE_BASE}/other/tabs/discover-players.html" class="nav-item ${discoverActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                    <span>Discover</span>
                </a>
                <a href="${FE_BASE}/other/tabs/my-profile.html" class="nav-item ${profileActive}" id="profileNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>My Profile</span>
                </a>
                <a href="${FE_BASE}/other/tabs/messages.html" class="nav-item ${messagesActive}" id="messagesNavItem">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Messages</span>
                    <span class="notification-badge" style="display: none;"></span>
                </a>
                <a href="${FE_BASE}/other/tabs/notifications.html" class="nav-item ${notificationsActive}">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                    <span>Notifications</span>
                    <span class="notification-badge" style="display: none;"></span>
                </a>
                <a href="${FE_BASE}/other/tabs/settings.html" class="nav-item">
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                    <span>Settings</span>
                </a>
            `;
        }

        sidebarNav.innerHTML = navHTML;
        // Bottom-nav navigation on this page is handled by a delegated listener in
        // shared/capacitor-init.js (delegation survives this innerHTML rebuild).

        // Inject a style tag to override the page CSS
        // Use theme colors based on logged-in user's folder, not the page being viewed
        let navActiveColor, navActiveBg, navHoverBg;

        if (userFolder === 'transferplayer') {
            // Transfer players use red theme
            navActiveColor = '#b91c1c';
            navActiveBg = 'rgba(185, 28, 28, 0.2)';
            navHoverBg = 'rgba(185, 28, 28, 0.1)';
        } else if (userFolder === 'collegecoach' || userFolder === 'hscoach') {
            // Coaches use orange theme
            navActiveColor = '#ff6b35';
            navActiveBg = 'rgba(255, 107, 53, 0.2)';
            navHoverBg = 'rgba(255, 107, 53, 0.1)';
        } else if (userFolder === 'other') {
            // Other users use gold theme
            navActiveColor = '#d4a017';
            navActiveBg = 'rgba(212, 160, 23, 0.2)';
            navHoverBg = 'rgba(212, 160, 23, 0.1)';
        } else {
            // Players use cerulean theme
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
            /* AI badge - always orange regardless of viewed profile theme */
            .sidebar .sidebar-nav .nav-ai-badge {
                font-size: 0.6rem !important;
                font-weight: 800 !important;
                letter-spacing: 0.05em !important;
                padding: 0.15rem 0.45rem !important;
                border-radius: 50px !important;
                background: rgba(255, 107, 53, 0.2) !important;
                color: #ff6b35 !important;
                border: 1px solid rgba(255, 107, 53, 0.3) !important;
                margin-left: auto !important;
            }
            .sidebar .sidebar-nav .nav-item.active .nav-ai-badge {
                background: rgba(255, 107, 53, 0.25) !important;
                color: #ff7d4d !important;
            }
        `;
        document.head.appendChild(styleTag);

        // Mark sidebar as ready to show (removes opacity:0 for cross-profile viewing)
        document.documentElement.classList.add('sidebar-ready');

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
        const userRoleColor = role === 'other' ? '#d4a017' : (role === 'player' ? '#1282a2' : '#ff6b35');

        // Update name
        const userName = document.querySelector('.sidebar-footer .user-name');
        if (userName) {
            const _prLogo = typeof getSchoolLogoHTML === 'function' ? getSchoolLogoHTML(profile.team_name, '../../assets', 16) : '';
            userName.innerHTML = `<span class="user-name-text">${profile.first_name} ${profile.last_name}</span>${_prLogo}`;
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
                // HS Player: Position • Height • Weight • GradYear
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
                if (profile.weight) parts.push(`${profile.weight} lbs`);
                if (profile.graduation_year) parts.push(profile.graduation_year);
                userRole.textContent = parts.join(' • ') || 'Player';
            } else if (userFolder === 'collegeplayer') {
                // College Player: Position • Team • Division
                if (profile.position) parts.push(profile.position);
                if (profile.team_name) parts.push(profile.team_name);
                if (profile.college_division) parts.push(formatDivisionDisplay(profile.college_division));
                userRole.textContent = parts.join(' • ') || 'Player';
            } else if (userFolder === 'hscoach') {
                // HS Coach: Team, State
                if (profile.team_name) parts.push(profile.team_name);
                if (profile.state) parts.push(profile.state);
                userRole.textContent = parts.join(', ') || 'HS Coach';
                userRole.style.color = '#ff6b35';
            } else if (userFolder === 'collegecoach') {
                // College Coach: Team, State • Division
                if (profile.team_name && profile.state) {
                    parts.push(`${profile.team_name}, ${profile.state}`);
                } else if (profile.team_name) {
                    parts.push(profile.team_name);
                } else if (profile.state) {
                    parts.push(profile.state);
                }
                if (profile.college_division) parts.push(formatDivisionDisplay(profile.college_division));
                userRole.textContent = parts.join(' • ') || 'College Coach';
                userRole.style.color = '#ff6b35';
            } else if (userFolder === 'other') {
                userRole.textContent = profile.subheader || '';
                userRole.style.color = '#d4a017';
            }
        }

        // Update avatar if available (other profiles use profile_picture_url)
        const avatarUrl = profile.profile_image_url || profile.profile_picture_url;
        if (avatarUrl) {
            const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
            if (avatarElement) {
                avatarElement.innerHTML = `<img src="${avatarUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                avatarElement.style.border = `2px solid ${getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division)}`;
                avatarElement.style.color = getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division);
                avatarElement.style.backgroundColor = getRoleAvatarBg(user.role, user.is_transfer_player, profile.college_division);
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
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
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
                    window.location.href = `${FE_BASE}/${userFolder}/tabs/my-profile.html`;
                } else if (action === 'settings') {
                    window.location.href = `${FE_BASE}/${userFolder}/tabs/settings.html`;
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
    if (window.ModalUtils) ModalUtils.lockBodyScroll();

    const closeModal = () => {
        modal.remove();
        if (window.ModalUtils) ModalUtils.unlockBodyScroll();
    };

    // Handle cancel
    document.getElementById('logoutCancel').addEventListener('click', closeModal);

    // Handle confirm
    document.getElementById('logoutConfirm').addEventListener('click', async () => {
        // Clear authentication and redirect
        await API.auth.logout();
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

async function loadOwnProfile() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            currentProfile = response.profile;
            currentUser = response.user;
            viewingUserId = response.user.id;
            isOwnProfile = true;
            displayProfile(response.profile, response.user.role);
            loadProfileViewCount();
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
            displayProfile(response.profile, response.type, response.accessLevel, response.hasPendingRequest);

            // Remove sensitive DOM elements when viewing another profile
            // This prevents data from being visible in Elements inspector
            if (!isOwnProfile) {
                removeSensitiveElementsForOtherProfile();
                recordProfileView(viewingUserId);
            }

            // Record coach profile view for Portal Intelligence signal tracking
            if (!isOwnProfile && response.type === 'coach') {
                API.post(`/profile/coach-view/${viewingUserId}`).catch(() => {});
            }

            if (isOwnProfile) {
                loadProfileViewCount();
            }
        } else {
            showError('Profile not found');
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile');
    }
}

async function loadProfileByUserId(userId) {
    try {
        const response = await API.get(`/profile/by-id/${userId}`);
        if (response.profile) {
            currentProfile = response.profile;
            viewingUserId = response.profile.user_id;
            isOwnProfile = currentUserId === viewingUserId;
            displayProfile(response.profile, response.type, response.accessLevel, response.hasPendingRequest);

            if (!isOwnProfile) {
                removeSensitiveElementsForOtherProfile();
                recordProfileView(viewingUserId);
            }

            if (!isOwnProfile && response.type === 'coach') {
                API.post(`/profile/coach-view/${viewingUserId}`).catch(() => {});
            }

            if (isOwnProfile) {
                loadProfileViewCount();
            }
        } else {
            showError('Profile not found');
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile');
    }
}

async function displayProfile(profile, type, accessLevel = 'full', hasPendingRequest = false) {

    // Store the profile type for later use
    viewedProfileType = type;

    // Check if this is a restricted (private) profile view
    const isRestrictedView = accessLevel === 'limited';
    window.viewedProfileIsPrivate = isRestrictedView;

    // Security #14: short-circuit on private view BEFORE rendering any
    // metadata. The trimmed response has only name + avatar + private flag,
    // so role-specific render functions would emit empty placeholders.
    if (isRestrictedView) {
        renderLockedProfileView(profile);
        updateProfileActions(hasPendingRequest);
        updateActiveNavItem();
        return;
    }

    // Determine if viewed profile is HS player or transfer player
    if (type === 'player') {
        // HS player: no college_division or empty college_division
        isViewedProfileHSPlayer = !profile.college_division || profile.college_division.trim() === '';
        // Transfer player: has transfer === 'y'
        isViewedProfileTransferPlayer = profile.transfer === 'y';
    } else {
        isViewedProfileHSPlayer = false;
        isViewedProfileTransferPlayer = false;
    }


    // Update profile name
    const nameElement = document.querySelector('.profile-name');
    if (nameElement) {
        const _profLogo = typeof getSchoolLogoHTML === 'function' ? getSchoolLogoHTML(profile.team_name, '../../assets', 28) : '';
        nameElement.innerHTML = `${profile.first_name} ${profile.last_name}${_profLogo}`;

        // Check if this profile follows the current user and add badge
        if (viewingUserId) {
            try {
                const followsMeResponse = await API.get(`/follow/${viewingUserId}/follows-me`);
                // Remove existing badge if any
                const existingBadge = nameElement.querySelector('.follows-you-badge');
                if (existingBadge) existingBadge.remove();

                if (followsMeResponse.followsMe) {
                    const badge = document.createElement('span');
                    badge.className = 'follows-you-badge';
                    badge.textContent = 'Follows you';
                    nameElement.appendChild(badge);
                }
            } catch (error) {
                console.error('Error checking if user follows me:', error);
            }
        }
    }


    // Add color-coded class to profile header
    const profileHeader = document.querySelector('.profile-header-simple');
    if (profileHeader) {
        profileHeader.classList.remove('player-profile', 'coach-profile', 'portal-profile', 'other-profile');
        if (type === 'player') {
            // Check if transfer/portal player
            const isTransfer = profile.transfer === 'y' || profile.is_transfer_player;
            if (isTransfer) {
                profileHeader.classList.add('portal-profile');
            } else {
                profileHeader.classList.add('player-profile');
            }
        } else if (type === 'coach') {
            profileHeader.classList.add('coach-profile');
        } else if (type === 'other') {
            profileHeader.classList.add('other-profile');
        }
    }

    if (type === 'player') {
        displayPlayerProfile(profile);
    } else if (type === 'coach') {
        displayCoachProfile(profile);
    } else if (type === 'other') {
        displayOtherProfile(profile);
    }

    // Update profile actions based on ownership
    updateProfileActions(hasPendingRequest);

    // Update active nav item
    updateActiveNavItem();

    // Update bio in the new location (between header and tabs)
    const bioText = document.querySelector('.profile-info-row .bio-text');
    if (bioText) {
        if (profile.bio) {
            bioText.textContent = profile.bio;
            bioText.classList.remove('empty-state');
        } else {
            bioText.textContent = 'No bio provided yet.';
            bioText.classList.add('empty-state');
        }
    }

    // Update contact info in the new location (between header and tabs)
    updateContactInfoSection(profile);

    // Update profile image and role-colored border/background
    const avatarElement = document.querySelector('.profile-avatar-large');
    if (avatarElement) {
        const isTransfer = profile.transfer === 'y' || profile.is_transfer_player;
        if (profile.profile_image_url) {
            avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            avatarElement.style.backgroundColor = 'transparent';
        } else {
            avatarElement.style.backgroundColor = getRoleAvatarBg(type, isTransfer, profile.college_division);
        }
        avatarElement.style.border = `3px solid ${getRoleBorderColor(type, isTransfer, profile.college_division)}`;
        avatarElement.style.color = getRoleBorderColor(type, isTransfer, profile.college_division);
    }

    // Show profile content now that data is loaded
    document.querySelector('.profile-content').classList.add('profile-loaded');

    // Load follower/following counts from database
    loadFollowCounts(profile.user_id);

    // Security #14: private-profile branch is handled at the top of
    // displayProfile via renderLockedProfileView() — no overlay needed.
}

// Remove sensitive DOM elements when viewing another user's profile
// This prevents data from being visible in the Elements inspector
function removeSensitiveElementsForOtherProfile() {
    // Remove right sidebar widget content (profile views, etc.)
    const profileStatsWidget = document.getElementById('profileStatsWidget');
    if (profileStatsWidget) {
        profileStatsWidget.remove();
    }

    // Remove mobile profile views link
    const mobileProfileViewsLink = document.getElementById('mobileProfileViewsLink');
    if (mobileProfileViewsLink) {
        mobileProfileViewsLink.remove();
    }

    // Remove all edit modals to prevent form data inspection
    const modalsToRemove = [
        'editProfileModal',
        'addOfferModal',
        'editOfferModal',
        'deleteConfirmModal',
        'seasonSelectModal',
        'addStatsModal',
        'editStatsModal',
        'deleteStatsConfirmModal',
        'addHighlightModal',
        'deleteHighlightConfirmModal',
        'editAcademicsModal',
        'profileViewersModal'
    ];

    modalsToRemove.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    });

    // Remove edit buttons
    const editButtons = [
        'editProfileBtn',
        'changePhotoBtn',
        'addOfferBtn',
        'addStatsBtn',
        'addSeasonHighlightBtn',
        'addGameHighlightBtn',
        'editAcademicsBtn'
    ];

    editButtons.forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.remove();
        }
    });
}

// Disable followers/following links for private profiles
function disableFollowLinksForPrivateProfile() {
    const followersLink = document.getElementById('followersLink');
    const followingLink = document.getElementById('followingLink');

    if (followersLink) {
        followersLink.style.pointerEvents = 'none';
        followersLink.style.cursor = 'default';
        followersLink.style.opacity = '0.6';
        followersLink.removeAttribute('href');
    }

    if (followingLink) {
        followingLink.style.pointerEvents = 'none';
        followingLink.style.cursor = 'default';
        followingLink.style.opacity = '0.6';
        followingLink.removeAttribute('href');
    }
}

// Security #14: Replace the entire profile body with a locked card when the
// viewer can't see the private profile. The trimmed `profile` object has only
// { user_id, first_name, last_name, private, profile_image_url|profile_picture_url }.
function renderLockedProfileView(profile) {
    // Avatar + name (the only fields we have).
    const nameElement = document.querySelector('.profile-name');
    if (nameElement) {
        nameElement.innerHTML = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    }
    const avatarElement = document.querySelector('.profile-avatar-large');
    if (avatarElement) {
        const avatarUrl = profile.profile_image_url || profile.profile_picture_url;
        if (avatarUrl) {
            avatarElement.innerHTML = `<img src="${avatarUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            avatarElement.style.backgroundColor = 'transparent';
        } else {
            avatarElement.style.backgroundColor = '#1f2937';
        }
        avatarElement.style.border = '3px solid #6b7280';
        avatarElement.style.color = '#6b7280';
    }
    const profileHeader = document.querySelector('.profile-header-simple');
    if (profileHeader) {
        profileHeader.classList.remove('player-profile', 'coach-profile', 'portal-profile', 'other-profile');
    }

    // Hide every metadata container the regular renderers would have populated
    // (followers/following counts stay visible).
    const elementsToHide = [
        '.profile-info-row',
        '.profile-meta',
        '.profile-position',
        '.profile-username',
        '#profileStatsWidget'
    ];
    elementsToHide.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => { el.style.display = 'none'; });
    });

    // Populate followers/following counts from the dedicated endpoint.
    if (profile.user_id && typeof loadFollowCounts === 'function') {
        loadFollowCounts(profile.user_id);
    }

    // Show the profile shell so the locked card is visible.
    const profileContent = document.querySelector('.profile-content');
    if (profileContent) profileContent.classList.add('profile-loaded');
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer) dashboardContainer.classList.add('profile-loaded');

    // Replace the tabs section with the locked card.
    const tabContent = document.querySelector('.profile-tab-content');
    if (tabContent) tabContent.remove();
    const tabsContainer = document.querySelector('.profile-tabs-container');
    if (tabsContainer) {
        tabsContainer.innerHTML = `
            <div class="locked-profile-card">
                <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     stroke-width="2" width="56" height="56">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <h3>This profile is private</h3>
                <p>Follow to see their posts and stats.</p>
            </div>
        `;
    }

    if (!document.getElementById('lockedProfileStyles')) {
        const style = document.createElement('style');
        style.id = 'lockedProfileStyles';
        style.textContent = `
            .locked-profile-card {
                display: flex; flex-direction: column; align-items: center;
                justify-content: center; padding: 60px 40px; min-height: 300px;
                background: #0a1128; border-radius: 12px; color: white; text-align: center;
            }
            .locked-profile-card .lock-icon { color: white; opacity: 0.9; margin-bottom: 16px; }
            .locked-profile-card h3 { margin: 0 0 8px; font-size: 22px; font-weight: 600; }
            .locked-profile-card p  { margin: 0; opacity: 0.75; font-size: 15px; }
        `;
        document.head.appendChild(style);
    }

    if (typeof removeSensitiveElementsForOtherProfile === 'function') {
        removeSensitiveElementsForOtherProfile();
    }
    if (typeof disableFollowLinksForPrivateProfile === 'function') {
        disableFollowLinksForPrivateProfile();
    }
}

// Add private profile overlay over the tabs section
function addPrivateProfileOverlay() {
    const existingOverlay = document.querySelector('.private-profile-overlay');
    if (existingOverlay) existingOverlay.remove();

    const tabsContainer = document.querySelector('.profile-tabs-container');
    const tabContent = document.querySelector('.profile-tab-content');
    if (!tabsContainer) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'private-profile-tabs-wrapper';
    wrapper.style.position = 'relative';
    tabsContainer.parentElement.insertBefore(wrapper, tabsContainer);
    wrapper.appendChild(tabsContainer);
    if (tabContent) wrapper.appendChild(tabContent);

    const overlay = document.createElement('div');
    overlay.className = 'private-profile-overlay';
    overlay.innerHTML = `
        <div class="private-profile-message">
            <svg class="lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <h3>This Account is Private</h3>
        </div>
    `;
    wrapper.appendChild(overlay);

    if (!document.getElementById('privateProfileStyles')) {
        const style = document.createElement('style');
        style.id = 'privateProfileStyles';
        style.textContent = `
            .private-profile-tabs-wrapper { position: relative; }
            .private-profile-overlay {
                position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                display: flex; align-items: flex-start; justify-content: center;
                background: #0a1128;
                border-radius: 12px; z-index: 10; min-height: 300px;
            }
            .private-profile-message { text-align: center; padding: 30px 40px; color: white; }
            .private-profile-message .lock-icon { color: white; margin-bottom: 16px; opacity: 0.9; }
            .private-profile-message h3 { margin: 0; font-size: 20px; font-weight: 600; color: white; }
        `;
        document.head.appendChild(style);
    }
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

        // Row 2: School name, State • Division (in orange and bold)
        const row2Parts = [];
        if (profile.team_name) row2Parts.push(profile.team_name);
        if (profile.state) row2Parts.push(profile.state);

        let row2Text = row2Parts.join(', ');

        // Add division with bullet separator if it exists
        if (profile.college_division) {
            row2Text += ` <span>•</span> ${profile.college_division}`;
        }

        if (row2Parts.length > 0) {
            lines.push(`<span style="color: var(--accent-orange); font-weight: 700;">${row2Text}</span>`);
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
    updateInfoItem('College', profile.team_name);
    updateInfoItem('Division', profile.college_division || null);

    // Update contact info
    updateContactInfo(profile);

    // Update overview tab data
    displayOverviewData(profile);
}

function displayOtherProfile(profile) {
    // Update position/title line (using subheader for "other" profiles)
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        const parts = [];
        if (profile.subheader) parts.push(profile.subheader);
        positionElement.textContent = parts.join(' • ') || 'Role not specified';
    }

    // Update meta info
    const metaElement = document.querySelector('.profile-meta');
    if (metaElement) {
        const parts = [];
        if (profile.city && profile.state) parts.push(`${profile.city}, ${profile.state}`);

        metaElement.innerHTML = parts.join(' <span>•</span> ') || 'Information not provided';
    }

    // Update username display
    const usernameElement = document.querySelector('.profile-username');
    if (usernameElement) {
        usernameElement.textContent = profile.username ? `@${profile.username}` : '';
    }

    // Update info items for other profile type
    updateInfoItem('Role', profile.subheader);
    updateInfoItem('Location', profile.city && profile.state ? `${profile.city}, ${profile.state}` : null);
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

// Update contact info in the new location (between header and tabs)
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
        contactInfoCard.innerHTML = '<p class="empty-state">No contact information provided.</p>';
    }
}

function updateContactInfo(profile) {
    // Legacy function - now handled by updateContactInfoSection
    updateContactInfoSection(profile);
}

function updateSchoolInfo(profile) {
    const schoolSection = document.querySelector('.school-card');
    if (!schoolSection) return;

    if (profile.team_name) {
        const schoolName = schoolSection.querySelector('.school-name');
        const schoolLocation = schoolSection.querySelector('.school-location');
        const schoolClass = schoolSection.querySelector('.school-class');

        if (schoolName) schoolName.textContent = profile.team_name;
        if (schoolLocation && profile.city && profile.state) {
            schoolLocation.textContent = `${profile.city}, ${profile.state}`;
        }
        if (schoolClass && profile.graduation_year) {
            schoolClass.textContent = `Class of ${profile.graduation_year}`;
        }
    }
}

function updateProfileActions(hasPendingRequest = false) {
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    const actionsContainer = document.querySelector('.profile-actions');
    if (!actionsContainer) return;

    // Store pending request status for follow button setup
    window.hasPendingFollowRequest = hasPendingRequest;

    // Check if navigated to this profile (has username in URL) - always show back button in this case
    const urlParams = new URLSearchParams(window.location.search);
    const hasUsernameParam = urlParams.get('username') || urlParams.get('userId');

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
<!-- Share/copy-profile-link button removed per request; kept for future use
            <button class="btn-share-profile show-button">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
            -->
        `;

        // Re-attach event listeners after updating DOM
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', function() {
                showEditProfileModal();
            });
        } else {
            console.error('Edit button not found!');
        }

        // Share/copy-profile-link button removed per request; handler kept for future use
        /*
        const shareProfileBtn = document.querySelector('.btn-share-profile');
        if (shareProfileBtn) {
            shareProfileBtn.addEventListener('click', async function() {
                const profileUrl = `${getShareBaseUrl()}/collegecoach/tabs/my-profile.html?username=${currentProfile.username}`;
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
        */
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
<!-- Share/copy-profile-link button removed per request; kept for future use
            <button class="btn-share-profile show-button">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="18" cy="5" r="3"></circle>
                    <circle cx="6" cy="12" r="3"></circle>
                    <circle cx="18" cy="19" r="3"></circle>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
            </button>
            -->
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

        // Share/copy-profile-link button removed per request; handler kept for future use
        /*
        const shareProfileBtn = document.querySelector('.btn-share-profile');
        if (shareProfileBtn) {
            shareProfileBtn.addEventListener('click', async function() {
                const profileUrl = `${getShareBaseUrl()}/collegecoach/tabs/my-profile.html?username=${currentProfile.username}`;
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
        */
    } else {
        // Show back button, follow and message buttons
        // "Add to Pipeline" button (Plan 4) — replaces the legacy
        // "Add to Recruiting Board" button. Visible only when a college coach
        // is viewing an HS or transfer player.
        const showRecruitingBoardBtn = isCollegeCoach && (isViewedProfileHSPlayer || isViewedProfileTransferPlayer);

        let buttonsHTML = `
            <button class="btn-back" id="backBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"></path>
                </svg>
                Back
            </button>
            <button class="btn-follow" id="followBtn">Follow</button>
            <button class="btn-message" id="messageBtn" style="display: none;">Message</button>
            <button class="btn-profile-more" id="profileMoreBtn" aria-label="More options">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                    <circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle>
                </svg>
            </button>
        `;

        if (showRecruitingBoardBtn) {
            buttonsHTML += `
            <button class="btn-recruiting-board" id="recruitingBoardBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="12" y1="8" x2="12" y2="16"></line>
                    <line x1="8" y1="12" x2="16" y2="12"></line>
                </svg>
                Add to Pipeline
            </button>
            `;
        }

        actionsContainer.innerHTML = buttonsHTML;

        // Setup back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        // Setup follow button
        setupFollowButton();

        // Setup three-dot (Report / Block) menu — Fix #2c
        setupProfileMoreMenu(currentProfile);

        // Setup message button (checks permissions and shows/hides accordingly)
        setupMessageButton();

        // Setup recruiting board button if applicable
        if (showRecruitingBoardBtn) {
            setupRecruitingBoardButton();
        }
    }
}

async function setupMessageButton() {
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    const messageBtn = document.getElementById('messageBtn');
    if (!messageBtn || !viewingUserId) return;

    // Check message permissions
    try {
        const permissionResult = await API.get(`/follow/can-message/${viewingUserId}`);

        if (permissionResult.canMessage) {
            // Show the message button
            messageBtn.style.display = '';
            messageBtn.addEventListener('click', () => {
                // Navigate to messages page with the userId to start/open conversation
                const folder = loggedInUserFolder || 'collegecoach';
                window.location.href = `${FE_BASE}/${folder}/tabs/messages.html?userId=${viewingUserId}`;
            });
        } else {
            // Keep the button hidden (already hidden by default)
            messageBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking message permissions:', error);
        // On error, show the button (fail open for better UX)
        messageBtn.style.display = '';
        messageBtn.addEventListener('click', () => {
            const folder = loggedInUserFolder || 'collegecoach';
            window.location.href = `${FE_BASE}/${folder}/tabs/messages.html?userId=${viewingUserId}`;
        });
    }
}

// "Add to Pipeline" button (Plan 4) — POSTs directly to /api/pipeline/from-profile.
// Replaces the previous "Add to Recruiting Board" navigation flow.
async function setupRecruitingBoardButton() {
    const recruitingBoardBtn = document.getElementById('recruitingBoardBtn');
    if (!recruitingBoardBtn || !viewingUserId) return;

    function markInPipeline() {
        recruitingBoardBtn.innerHTML = `
            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            In Your Pipeline
        `;
        recruitingBoardBtn.classList.add('in-pipeline');
        recruitingBoardBtn.disabled = true;
    }

    try {
        const res = await API.pipeline.contains(viewingUserId);
        if (res && res.in_pipeline) {
            markInPipeline();
            return;
        }
    } catch { /* fall through */ }

    recruitingBoardBtn.addEventListener('click', async () => {
        recruitingBoardBtn.disabled = true;
        try {
            await API.pipeline.addFromProfile(viewingUserId);
            if (typeof showToast === 'function') showToast('Added to your pipeline', 'success');
            markInPipeline();
        } catch (err) {
            recruitingBoardBtn.disabled = false;
            console.error('[Add to Pipeline] error:', err, 'data:', err && err.data, 'status:', err && err.status);
            const status = err && err.status;
            const msg = (err && err.message) || 'Failed to add to pipeline';
            if (typeof showToast === 'function') {
                showToast(msg, status === 409 ? 'warning' : 'error');
            }
            if (status === 409) markInPipeline();
        }
    });
}

async function setupFollowButton() {
    const followBtn = document.getElementById('followBtn');
    if (!followBtn || !viewingUserId) return;

    // Check follow status and if they follow us
    try {
        // Security #14: skip follows-me lookup on private profiles to avoid
        // leaking the relational signal (and the "Follow back" wording).
        const isPrivateView = window.viewedProfileIsPrivate === true;
        const followResponse = await API.get(`/follow/${viewingUserId}/check`);
        const followsMeResponse = isPrivateView
            ? { followsMe: false }
            : await API.get(`/follow/${viewingUserId}/follows-me`);
        const isFollowing = followResponse.isFollowing;
        const theyFollowMe = followsMeResponse.followsMe;

        // Check if there's a pending follow request (passed from displayProfile)
        let hasPendingRequest = window.hasPendingFollowRequest || false;

        // Determine button text: "Following", "Requested", "Follow back", or "Follow"
        const getButtonText = (following, pending) => {
            if (following) return 'Following';
            if (pending) return 'Requested';
            if (isPrivateView) return 'Follow';
            return theyFollowMe ? 'Follow back' : 'Follow';
        };

        followBtn.textContent = getButtonText(isFollowing, hasPendingRequest);
        followBtn.classList.toggle('following', isFollowing);
        followBtn.classList.toggle('requested', hasPendingRequest && !isFollowing);

        followBtn.addEventListener('click', async () => {
            try {
                const currentlyFollowing = followBtn.classList.contains('following');
                const currentlyRequested = followBtn.classList.contains('requested');

                if (currentlyFollowing) {
                    await API.delete(`/follow/${viewingUserId}`);
                    followBtn.textContent = getButtonText(false, false);
                    followBtn.classList.remove('following');
                    followBtn.classList.remove('requested');
                    hasPendingRequest = false;
                } else if (currentlyRequested) {
                    // Cancel the follow request
                    await API.delete(`/follow/${viewingUserId}/request`);
                    followBtn.textContent = getButtonText(false, false);
                    followBtn.classList.remove('requested');
                    hasPendingRequest = false;
                } else {
                    // Send follow request (backend handles if it's a request or direct follow)
                    const response = await API.post(`/follow/${viewingUserId}`);
                    if (response.requestPending) {
                        followBtn.textContent = 'Requested';
                        followBtn.classList.add('requested');
                        hasPendingRequest = true;
                    } else {
                        followBtn.textContent = 'Following';
                        followBtn.classList.add('following');
                    }
                }

                // Update the follower count display after follow/unfollow
                loadFollowCounts(viewingUserId);
            } catch (error) {
                console.error('Error toggling follow:', error);
                showToast('Failed to update follow status', 'error');
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
    const hasUsername = urlParams.get('username') || urlParams.get('userId');

    if (feedNavItem && profileNavItem) {
        // Remove active from all first
        feedNavItem.classList.remove('active');
        profileNavItem.classList.remove('active');
        if (discoverNavItem) discoverNavItem.classList.remove('active');
        if (messagesNavItem) messagesNavItem.classList.remove('active');
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
        } else if (fromPage === 'ai-rep') {
            // A player reached this coach profile from their AI Rep "Best-Fit
            // Schools". The coach sidebar has no AI Rep item, so highlight nothing
            // (the Back button returns them to AI Rep).
        } else {
            // Default: Viewing someone else's profile (from feed) - highlight Feed
            feedNavItem.classList.add('active');
        }
    }
}

function setupUI() {
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    // Sidebar toggle functionality - mainpage-coach.js handles the toggle event
    // This function only manages the sidebar visibility state
    const dashboardContainer = document.getElementById('dashboardContainer');
    const rightSidebar = document.getElementById('rightSidebar');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');

    // Note: Right sidebar toggle click handler is in mainpage-coach.js (loaded on all tab pages)
    // This function only manages visibility based on profile ownership

    // Use setTimeout to ensure this runs after DOMContentLoaded
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

    // Show recruiting tab ONLY if viewing profile has a real college_division (college coaches)
    // High school coaches have 'High School' as a marker, which is truthy but is NOT a
    // real college division — exclude it explicitly.
    const isCollegeCoachProfile = currentProfile &&
                                   currentProfile.college_division &&
                                   currentProfile.college_division.trim() !== '' &&
                                   currentProfile.college_division !== 'High School';

    if (isCollegeCoachProfile) {
        if (recruitingTab) {
            recruitingTab.style.display = '';
        }
        if (recruitingPane) {
            recruitingPane.style.display = '';
            // AI Fit-Matching program subtabs
            populateRecruitingProfile(currentProfile);
            setupRecruitingSubnav();
            if (isOwnProfile) setupRecruitingProfileEditing();
        }
    } else {
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

            // Load tab content on first visit
            if (tabId === 'posts' && !profilePostsLoaded) {
                loadProfilePosts();
            } else if (tabId === 'replies' && !profileRepliesLoaded) {
                loadProfileReplies();
            } else if (tabId === 'likes' && !profileLikesLoaded) {
                loadProfileLikes();
            }
        });
    });

    // Setup modal close handlers
    setupEditProfileModal();

    // Change photo button - only allow upload on own profile
    const changePhotoBtn = document.querySelector('.btn-change-photo');
    const photoUploadInput = document.getElementById('photoUploadInput');

    if (changePhotoBtn) {
        if (isOwnProfile) {
            changePhotoBtn.classList.add('show-button');
            changePhotoBtn.style.display = 'flex';
            changePhotoBtn.addEventListener('click', async function() {
                // Phase 4b-I: iOS native picker instead of web <input>
                if (API.isIOSApp && API.isIOSApp() && window.NativeCamera) {
                    const result = await window.NativeCamera.pickProfilePhoto();
                    if (result.cancelled) return;
                    if (result.error) {
                        showToast('Photo picker failed: ' + result.error, 'error');
                        return;
                    }
                    window.imageCropper.open(result.file, async function(croppedFile) {
                        await uploadCroppedImage(croppedFile);
                    });
                    return;
                }
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
                    window.location.href = `${FE_BASE}/${loggedInUserFolder}/tabs/my-profile.html`;
                } else {
                    // Fallback to relative path if folder not set
                    // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
                    // (bare/relative targets silently no-op there). new URL(rel, location.href)
                    // correctly preserves the /frontend prefix on web and its absence in-app.
                    window.location.href = new URL('my-profile.html', window.location.href).href;
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
        showToast('Please select a valid image file (JPG, JPEG, or PNG)', 'warning');
        event.target.value = '';
        return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
        showToast('File size must be less than 5MB', 'warning');
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

            // Update avatar - use the URL directly (signed URLs already have cache-busting via signature)
            // Don't add extra query params as it breaks the S3 signature
            avatarElement.innerHTML = `<img src="${imageUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            avatarElement.style.backgroundColor = 'transparent';
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
        showToast(`Failed to upload photo: ${error.message}`, 'error');
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
    // Bottom-centered, above the mobile bottom nav (76px) + iOS home indicator
    // (env(safe-area-inset-bottom) is 0 on web/desktop). Self-contained translateY
    // slide so it doesn't depend on the horizontal slideIn/slideOut keyframes.
    toast.style.cssText = `
        position: fixed;
        bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        left: 50%;
        background: #10b981;
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        opacity: 0;
        transform: translateX(-50%) translateY(20px);
        transition: opacity 0.3s ease-out, transform 0.3s ease-out;
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => {
            if (toast.parentNode) document.body.removeChild(toast);
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
                <button onclick="window.location.href=new URL('../create-coach-profile.html', window.location.href).href" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
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
                <button onclick="window.location.href=new URL('../mainpage-coach.html', window.location.href).href" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; margin-top: 1rem;">
                    Back to Feed
                </button>
            </div>
        `;
        // Show content since we're done loading
        mainContent.classList.add('profile-loaded');
    }
}

// Show/hide recruiting-specific nav items for college coaches only
async function setupCollegeCoachNav() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            // Check for college_division instead of college_name
            // High school coaches have 'High School' as a marker, which is truthy but
            // is NOT a real college division — exclude it explicitly.
            const isCollegeCoach = profile.college_division &&
                                   profile.college_division.trim() !== '' &&
                                   profile.college_division !== 'High School';

            const recruitingBoardNav = document.getElementById('recruitingBoardNav');
            const transferPortalNav = document.getElementById('transferPortalNav');

            // Only show Recruiting Board and Transfer Portal for college coaches
            if (isCollegeCoach) {
                if (recruitingBoardNav) recruitingBoardNav.style.display = '';
                if (transferPortalNav) transferPortalNav.style.display = '';
            } else {
                // Explicitly hide for high school coaches
                if (recruitingBoardNav) recruitingBoardNav.style.display = 'none';
                if (transferPortalNav) transferPortalNav.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error setting up college coach nav:', error);
    }
}

// Edit Profile Modal Functions
let editSelectedCoachingPositions = []; // Track selected coaching positions in edit modal
let originalUsername = ''; // Store original username for validation
let usernameCheckTimeout = null;

function showEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) {
        console.error('Edit profile modal not found');
        return;
    }

    // Populate form with current profile data
    populateEditForm();
    modal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Prevent background scrolling
}

function populateEditForm() {
    if (!currentProfile) {
        console.warn('No current profile data');
        return;
    }

    // Populate basic info
    const firstName = document.getElementById('editFirstName');
    const lastName = document.getElementById('editLastName');
    const username = document.getElementById('editUsername');

    if (firstName) firstName.value = currentProfile.first_name || '';
    if (lastName) lastName.value = currentProfile.last_name || '';
    if (username) {
        username.value = currentProfile.username || '';
        // Update username character counter
        const usernameCharCounter = document.getElementById('editUsernameCharCounter');
        if (usernameCharCounter) {
            usernameCharCounter.textContent = `${(currentProfile.username || '').length}/15`;
        }
    }

    // Store original username for validation
    originalUsername = currentProfile.username || '';

    // Mirror current team values onto the hidden inputs (no longer user-editable
    // here). The Change Team flow handles updates; this is just UI state parity.
    const collegeName = document.getElementById('editCollegeName');
    const collegeState = document.getElementById('editCollegeState');
    const division = document.getElementById('editDivision');

    if (collegeName) collegeName.value = currentProfile.team_name || '';
    if (collegeState) collegeState.value = currentProfile.state || '';
    if (division) division.value = currentProfile.college_division || '';

    // Render the read-only "current team" display block + wire up the Change
    // Team button (only shown in dev for now — gated by /api/config).
    renderCurrentTeamDisplay(currentProfile);

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

    // Populate About, Email, and Phone fields
    const bioField = document.getElementById('editBio');
    const emailField = document.getElementById('editEmail');
    const phoneField = document.getElementById('editPhone');

    if (bioField) {
        bioField.value = currentProfile.bio || '';
        // Update the character counter
        const bioCharCounter = document.getElementById('bioCharCounter');
        if (bioCharCounter) {
            const currentLength = bioField.value.length;
            bioCharCounter.textContent = `${currentLength}/150`;
            if (currentLength >= 150) {
                bioCharCounter.classList.add('limit-reached');
            } else {
                bioCharCounter.classList.remove('limit-reached');
            }
        }
    }
    if (emailField) emailField.value = currentProfile.email || '';
    if (phoneField) phoneField.value = formatPhoneNumber(currentProfile.phone || '');
    const editDob = document.getElementById('editDateOfBirth');
    if (editDob) editDob.value = currentProfile.date_of_birth ? String(currentProfile.date_of_birth).slice(0, 10) : '';

    // Populate overview fields
    const conferenceField = document.getElementById('editConference');
    const achievementsField = document.getElementById('editAchievements');
    const experienceField = document.getElementById('editExperience');
    const philosophyField = document.getElementById('editPhilosophy');

    if (conferenceField) conferenceField.value = currentProfile.conference || '';
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
}

// Generic character counter update function
function updateCharCounter(fieldName, maxLength) {
    const field = document.getElementById(`edit${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}`);
    const counter = document.getElementById(`${fieldName}CharCounter`);

    if (field && counter) {
        const currentLength = field.value.length;
        counter.textContent = `${currentLength}/${maxLength}`;

        if (currentLength >= maxLength) {
            counter.classList.add('limit-reached');
        } else {
            counter.classList.remove('limit-reached');
        }
    }
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
        const formData = {
            first_name: document.getElementById('editFirstName').value,
            last_name: document.getElementById('editLastName').value,
            username: newUsername,
            position_title: editSelectedCoachingPositions.join('/'), // Join multiple positions with slash
            bio: document.getElementById('editBio').value.trim(),
            email: document.getElementById('editEmail').value.trim(),
            phone: document.getElementById('editPhone').value.trim(),
            date_of_birth: document.getElementById('editDateOfBirth')?.value || null,
            // Overview fields
            conference: document.getElementById('editConference').value.trim(),
            achievements: document.getElementById('editAchievements').value.trim(),
            experience: document.getElementById('editExperience').value.trim(),
            philosophy: document.getElementById('editPhilosophy').value.trim()
        };

        // team_name / state / college_division are NOT included in the payload —
        // these are only changeable through the admin-verified team-switch flow
        // (Change Team button). The hidden inputs in the modal mirror the current
        // values for UI parity but are never read here. The backend would also
        // ignore them on a normal PUT /profile (no override is wired on update;
        // the protection is purely client-side at this point — Plan 5A still
        // fires if any other path mutates team_name).

        // Send update request
        const response = await API.put('/profile', formData);

        if (response.success || response.profile) {
            // Preserve the current signed profile image URL before updating
            // The API returns the raw S3 key, not the signed URL needed for display
            const currentSignedImageUrl = currentProfile.profile_image_url;

            // Update currentProfile
            if (response.profile) {
                currentProfile = response.profile;
            } else {
                // Update with the data we sent
                Object.assign(currentProfile, formData);
            }

            // Restore the signed/full image URL if the API returned an unsigned S3 key
            // (S3 keys start with 'profiles/' while displayable URLs start with 'http')
            if (currentSignedImageUrl && currentSignedImageUrl.startsWith('http')) {
                // Check if the response has an unsigned S3 key or no image URL
                if (!currentProfile.profile_image_url || currentProfile.profile_image_url.startsWith('profiles/')) {
                    currentProfile.profile_image_url = currentSignedImageUrl;
                }
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

function setupEditProfileModal() {
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

    // Handle bio character counter
    const bioInput = document.getElementById('editBio');
    const bioCharCounter = document.getElementById('bioCharCounter');
    if (bioInput && bioCharCounter) {
        const maxLength = 150;

        // Update counter function
        function updateBioCounter() {
            const currentLength = bioInput.value.length;
            bioCharCounter.textContent = `${currentLength}/${maxLength}`;

            if (currentLength >= maxLength) {
                bioCharCounter.classList.add('limit-reached');
            } else {
                bioCharCounter.classList.remove('limit-reached');
            }
        }

        // Listen for input
        bioInput.addEventListener('input', updateBioCounter);

        // Initialize counter on load
        updateBioCounter();
    }

    // Handle overview field character counters
    const overviewTextareas = [
        { id: 'editAchievements', counterId: 'achievementsCharCounter', maxLength: 1000 },
        { id: 'editExperience', counterId: 'experienceCharCounter', maxLength: 1000 },
        { id: 'editPhilosophy', counterId: 'philosophyCharCounter', maxLength: 1000 }
    ];

    overviewTextareas.forEach(({ id, counterId, maxLength }) => {
        const textarea = document.getElementById(id);
        const counter = document.getElementById(counterId);
        if (textarea && counter) {
            textarea.addEventListener('input', () => {
                const currentLength = textarea.value.length;
                counter.textContent = `${currentLength}/${maxLength}`;
                if (currentLength >= maxLength) {
                    counter.classList.add('limit-reached');
                } else {
                    counter.classList.remove('limit-reached');
                }
            });
        }
    });

    // Handle phone number formatting
    const phoneInput = document.getElementById('editPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            // Get only the digits from the input
            let digits = this.value.replace(/\D/g, '');

            // Limit to 10 digits
            digits = digits.substring(0, 10);

            // Format as (XXX) XXX-XXXX
            let formatted = '';
            if (digits.length > 0) {
                formatted = '(' + digits.substring(0, 3);
            }
            if (digits.length >= 3) {
                formatted += ') ' + digits.substring(3, 6);
            }
            if (digits.length >= 6) {
                formatted += '-' + digits.substring(6, 10);
            }

            this.value = formatted;
        });
    }

    // Handle username input changes with debouncing
    const usernameInput = document.getElementById('editUsername');
    if (usernameInput) {
        usernameInput.addEventListener('input', function() {
            // Convert to lowercase automatically
            this.value = this.value.toLowerCase();
            const username = this.value.trim();

            // Update character counter
            const usernameCharCounter = document.getElementById('editUsernameCharCounter');
            if (usernameCharCounter) {
                usernameCharCounter.textContent = `${this.value.length}/15`;
            }

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
}

// ==========================================
// OVERVIEW DISPLAY FUNCTIONS
// ==========================================

function displayOverviewData(profile) {
    // Update School Information
    const schoolNameValue = document.getElementById('schoolNameValue');
    const schoolStateValue = document.getElementById('schoolStateValue');
    const divisionValue = document.getElementById('divisionValue');
    const conferenceValue = document.getElementById('conferenceValue');

    if (schoolNameValue) schoolNameValue.textContent = profile.team_name || '-';
    if (schoolStateValue) schoolStateValue.textContent = profile.state || '-';
    if (divisionValue) {
        divisionValue.textContent = profile.college_division || '-';
    }
    if (conferenceValue) conferenceValue.textContent = profile.conference || '-';

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
            experienceList.innerHTML = '<p class="no-data-message">No coaching experience added yet.</p>';
        }
    }

    // Update Coaching Philosophy
    const philosophyContent = document.getElementById('philosophyContent');
    if (philosophyContent) {
        if (profile.philosophy && profile.philosophy.trim()) {
            philosophyContent.innerHTML = `<p>${escapeHtml(profile.philosophy)}</p>`;
        } else {
            philosophyContent.innerHTML = '<p class="no-data-message">No coaching philosophy added yet.</p>';
        }
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


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

// Helper function to format height from inches to ft'in" format
function formatHeightForDisplay(height) {
    if (!height) return null;
    if (typeof height === 'string' && height.includes("'")) return height;
    const totalInches = typeof height === 'string' ? parseInt(height) : height;
    if (isNaN(totalInches)) return null;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
}

// Helper function to get role subheader text and color for follow list
function getFollowListRoleInfo(user) {
    const role = user.role;
    let text = '';
    let colorClass = '';

    if (role === 'player') {
        // Determine player type
        const isTransfer = user.is_transfer === 'y' || user.is_transfer === true;
        const hasCollegeDivision = user.player_college_division &&
            ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'].includes(user.player_college_division);

        if (isTransfer) {
            // Transfer Player: position • height • weight • YOE
            colorClass = 'role-transfer';
            const parts = [];
            if (user.player_position) parts.push(user.player_position);
            const heightStr = formatHeightForDisplay(user.player_height);
            if (heightStr) parts.push(heightStr);
            if (user.player_weight) parts.push(`${user.player_weight} lbs`);
            if (user.years_of_eligibility) parts.push(`${user.years_of_eligibility} YOE`);
            text = parts.join(' • ') || 'Transfer Player';
        } else if (hasCollegeDivision) {
            // College Player: position • school, state • division
            colorClass = 'role-college-player';
            const parts = [];
            if (user.player_position) parts.push(user.player_position);
            const schoolParts = [];
            if (user.player_team_name) schoolParts.push(user.player_team_name);
            if (user.player_state) schoolParts.push(user.player_state);
            if (schoolParts.length > 0) parts.push(schoolParts.join(', '));
            if (user.player_college_division) parts.push(formatDivisionDisplay(user.player_college_division));
            text = parts.join(' • ') || 'College Player';
        } else {
            // HS Player: position • height • weight • class
            colorClass = 'role-hs-player';
            const parts = [];
            if (user.player_position) parts.push(user.player_position);
            const heightStr = formatHeightForDisplay(user.player_height);
            if (heightStr) parts.push(heightStr);
            if (user.player_weight) parts.push(`${user.player_weight} lbs`);
            if (user.graduation_year) parts.push(user.graduation_year);
            text = parts.join(' • ') || 'HS Player';
        }
    } else if (role === 'coach') {
        const hasCollegeDivision = user.coach_college_division &&
            ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'].includes(user.coach_college_division);

        if (hasCollegeDivision) {
            // College Coach: team, state • division
            colorClass = 'role-college-coach';
            const parts = [];
            const teamParts = [];
            if (user.coach_team_name) teamParts.push(user.coach_team_name);
            if (user.coach_state) teamParts.push(user.coach_state);
            if (teamParts.length > 0) parts.push(teamParts.join(', '));
            if (user.coach_college_division) parts.push(formatDivisionDisplay(user.coach_college_division));
            text = parts.join(' • ') || 'College Coach';
        } else {
            // HS Coach: team, state
            colorClass = 'role-hs-coach';
            const parts = [];
            if (user.coach_team_name) parts.push(user.coach_team_name);
            if (user.coach_state) parts.push(user.coach_state);
            text = parts.join(', ') || 'HS Coach';
        }
    } else if (role === 'other') {
        // Other: subheader
        colorClass = 'role-other';
        text = user.other_subheader || 'Other';
    } else {
        text = role || 'User';
    }

    return { text, colorClass };
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

        const _assetsPath = window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets';
        if (typeof ensureSchoolLogosLoaded === 'function') await ensureSchoolLogosLoaded(_assetsPath);

        // Render the list
        modalBody.innerHTML = users.map(user => {
            const roleInfo = getFollowListRoleInfo(user);
            return `
            <div class="follow-list-item" data-user-id="${user.id}" data-role="${user.role}" data-username="${user.username || ''}" data-is-transfer="${user.is_transfer || ''}" data-division="${user.player_college_division || user.coach_college_division || ''}">
                <div class="follow-list-avatar" style="border: 2px solid ${getRoleBorderColor(user.role, user.is_transfer === 'y' || user.is_transfer === true, user.player_college_division || user.coach_college_division)}; color: ${getRoleBorderColor(user.role, user.is_transfer === 'y' || user.is_transfer === true, user.player_college_division || user.coach_college_division)}; background: ${getRoleAvatarBg(user.role, user.is_transfer === 'y' || user.is_transfer === true, user.player_college_division || user.coach_college_division)}">
                    ${user.profile_image_url
                        ? `<img src="${user.profile_image_url}" alt="${user.first_name}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                           </svg>`
                    }
                </div>
                <div class="follow-list-info">
                    <div class="follow-list-name">${user.first_name} ${user.last_name}${(typeof getSchoolLogoHTML === 'function' && (user.player_college_division || user.coach_college_division)) ? getSchoolLogoHTML(user.player_team_name || user.coach_team_name, _assetsPath, 14) : ''} ${user.username ? `<span style="color: rgba(254,252,251,0.5); font-weight: 400;">@${user.username}</span>` : ''}</div>
                    <div class="follow-list-role ${roleInfo.colorClass}">${roleInfo.text}</div>
                </div>
            </div>
        `}).join('');

        // Add click handlers to navigate to profiles
        modalBody.querySelectorAll('.follow-list-item').forEach(item => {
            item.addEventListener('click', () => {
                const username = item.dataset.username;
                const role = item.dataset.role;
                if (!username) return;

                const isTransfer = item.dataset.isTransfer === 'y' || item.dataset.isTransfer === 'true';
                const division = item.dataset.division || '';
                const folder = getProfileFolder({ role, is_transfer_player: isTransfer, college_division: division });
                closeFollowListModal();
                const currentFrom = new URLSearchParams(window.location.search).get('from') || 'profile';
                window.location.href = new URL(`../../${folder}/tabs/my-profile.html?username=${username}&from=${currentFrom}`, window.location.href).href;
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

// ==================== PROFILE VIEWERS MODAL ====================

function setupProfileViewersModal() {
    const profileViewsLink = document.getElementById('profileViewsLink');
    const mobileProfileViewsLink = document.getElementById('mobileProfileViewsLink');
    const modal = document.getElementById('profileViewersModal');
    const modalOverlay = document.getElementById('profileViewersModalOverlay');
    const modalClose = document.getElementById('profileViewersModalClose');

    if (profileViewsLink) {
        profileViewsLink.addEventListener('click', (e) => {
            e.preventDefault();
            // Only open modal if viewing own profile
            if (isOwnProfile) {
                openProfileViewersModal();
            }
        });
    }

    // Mobile profile views link
    if (mobileProfileViewsLink) {
        mobileProfileViewsLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (isOwnProfile) {
                // Close mobile sidebar first
                const mobileSidebar = document.getElementById('mobileSidebar');
                const mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
                if (mobileSidebar) mobileSidebar.classList.remove('active');
                if (mobileSidebarOverlay) mobileSidebarOverlay.classList.remove('active');
                document.body.style.overflow = ''; // Reset body scroll lock
                openProfileViewersModal();
            }
        });
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', closeProfileViewersModal);
    }

    if (modalClose) {
        modalClose.addEventListener('click', closeProfileViewersModal);
    }
}

async function openProfileViewersModal() {
    const modal = document.getElementById('profileViewersModal');
    const modalBody = document.getElementById('profileViewersModalBody');
    const _assetsPath = window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets';

    if (!modal || !modalBody) return;

    // Show loading state
    modalBody.innerHTML = '<div class="follow-list-loading">Loading...</div>';

    // Show modal + freeze background scroll (restored in closeProfileViewersModal)
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
        if (typeof ensureSchoolLogosLoaded === 'function') await ensureSchoolLogosLoaded(_assetsPath);
        const response = await API.get(`/profile/viewers/${currentUserId}`);
        const viewers = response.viewers || [];

        if (viewers.length === 0) {
            modalBody.innerHTML = '<div class="follow-list-empty">No profile views yet</div>';
            return;
        }

        // Render the list using same format as followers/following modal
        modalBody.innerHTML = viewers.map(viewer => {
            const roleInfo = getFollowListRoleInfo(viewer);
            return `
            <div class="follow-list-item" data-user-id="${viewer.id}" data-role="${viewer.role}">
                <div class="follow-list-avatar" style="border: 2px solid ${getRoleBorderColor(viewer.role, viewer.is_transfer === 'y' || viewer.is_transfer === true, viewer.player_college_division || viewer.coach_college_division)}; color: ${getRoleBorderColor(viewer.role, viewer.is_transfer === 'y' || viewer.is_transfer === true, viewer.player_college_division || viewer.coach_college_division)}; background: ${getRoleAvatarBg(viewer.role, viewer.is_transfer === 'y' || viewer.is_transfer === true, viewer.player_college_division || viewer.coach_college_division)}">
                    ${viewer.profile_image_url
                        ? `<img src="${viewer.profile_image_url}" alt="${viewer.first_name}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                           </svg>`
                    }
                </div>
                <div class="follow-list-info">
                    <div class="follow-list-name">${viewer.first_name} ${viewer.last_name}${(typeof getSchoolLogoHTML === 'function' && (viewer.player_college_division || viewer.coach_college_division)) ? getSchoolLogoHTML(viewer.player_team_name || viewer.coach_team_name, _assetsPath, 14) : ''} ${viewer.username ? `<span style="color: rgba(254,252,251,0.5); font-weight: 400;">@${viewer.username}</span>` : ''}</div>
                    <div class="follow-list-role ${roleInfo.colorClass}">${roleInfo.text}</div>
                </div>
            </div>
        `}).join('');

        // Add click handlers to navigate to profiles
        modalBody.querySelectorAll('.follow-list-item').forEach(item => {
            item.addEventListener('click', async () => {
                const visitorUserId = item.dataset.userId;
                const role = item.dataset.role;

                // Fetch the user's profile to navigate correctly
                try {
                    let profileResponse;
                    if (role === 'player') {
                        profileResponse = await API.get(`/profile/player/${visitorUserId}`);
                    } else if (role === 'coach') {
                        profileResponse = await API.get(`/profile/coach/${visitorUserId}`);
                    } else {
                        profileResponse = await API.get(`/profile/other/${visitorUserId}`);
                    }

                    if (profileResponse.profile && profileResponse.profile.username) {
                        closeProfileViewersModal();
                        const profile = profileResponse.profile;
                        const folder = getProfileFolder({ role, ...profile });
                        const currentFrom = new URLSearchParams(window.location.search).get('from') || 'profile';
                        window.location.href = new URL(`../../${folder}/tabs/my-profile.html?username=${profile.username}&from=${currentFrom}`, window.location.href).href;
                    }
                } catch (error) {
                    console.error('Error fetching profile:', error);
                }
            });
        });

    } catch (error) {
        console.error('Error loading profile viewers:', error);
        modalBody.innerHTML = '<div class="follow-list-empty">Failed to load viewers</div>';
    }
}

function closeProfileViewersModal() {
    const modal = document.getElementById('profileViewersModal');
    if (modal) {
        modal.classList.remove('active');
    }
    document.body.style.overflow = ''; // Restore background scroll
}

// Initialize profile viewers modal when DOM is ready
document.addEventListener('DOMContentLoaded', setupProfileViewersModal);

// ==================== PROFILE POSTS & REPLIES ====================

// Helper function to format time ago
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 4) return `${weeks}w`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(days / 365);
    return `${years}y`;
}

// Format post content (handles mentions and hashtags)
function formatPostContent(content) {
    if (!content) return '';
    // Convert @mentions to links
    let formatted = content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    // Convert #hashtags to links
    formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    // Convert URLs to links
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return formatted;
}

// Build media HTML for profile posts (used when updating DOM after edit)
// Build media HTML for profile posts (used when updating DOM after edit and displaying posts)
// This matches the feed's grid layout with all images displayed
function buildMediaGridHTML(mediaUrls, mediaType) {
    if (!mediaUrls || mediaUrls.length === 0) return '';

    const urls = mediaUrls.slice(0, 4);
    const mediaCount = urls.length;

    const isVideoUrl = (url, index) => {
        if (mediaType === 'video') return true;
        return url && url.toLowerCase().match(/\.(mp4|mov|avi|webm|m4v)(\?|#|$)/);
    };

    let gridCells = '';
    for (let i = 0; i < mediaCount; i++) {
        const url = urls[i];
        const isVideo = isVideoUrl(url, i);
        const videoIndicator = isVideo ? `
            <div class="video-indicator">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            </div>
        ` : '';

        gridCells += `
            <div class="media-grid-cell" onclick="event.stopPropagation(); openProfileMediaSlideshowFromElement(this);">
                ${isVideo ?
                    `<video src="${url}#t=0.1" muted playsinline preload="metadata"></video>` :
                    `<img src="${url}" alt="Post media ${i + 1}">`
                }
                ${videoIndicator}
            </div>
        `;
    }

    return `
        <div class="post-media-grid media-count-${mediaCount}" onclick="event.stopPropagation();">
            ${gridCells}
        </div>
    `;
}

// Build meta info for post author
function buildPostMetaInfo(post) {
    let metaInfo = '';
    let starsHtml = '';

    // Add star rating prefix for HS players and transfer players with verified stars
    if (post.author_role === 'player' && post.author_star_rating && post.author_star_rating >= 1 && post.author_star_rating <= 5) {
        const isHSPlayer = !post.author_division && post.author_transfer !== 'y';
        const isTransferPlayer = post.author_transfer === 'y';
        if (isHSPlayer || isTransferPlayer) {
            starsHtml = `<span class="post-meta-stars" style="color: #ffd700; font-weight: 600;">${post.author_star_rating}★</span> `;
        }
    }

    if (post.author_role === 'player') {
        const parts = [];
        if (post.author_transfer === 'y') {
            // Transfer Player: Position • Height • Weight • YOE
            if (post.author_position) parts.push(post.author_position);

            if (post.author_height) {
                // Handle height as either total inches (number) or formatted string ("6'1"")
                const heightStr = String(post.author_height);
                if (heightStr.includes("'")) {
                    // Already formatted as feet'inches"
                    parts.push(heightStr);
                } else {
                    // Convert from total inches to feet'inches" format
                    const totalInches = parseInt(heightStr);
                    if (!isNaN(totalInches) && totalInches > 0) {
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        parts.push(`${feet}'${inches}"`);
                    }
                }
            }

            if (post.author_weight) {
                parts.push(`${post.author_weight} lbs`);
            }

            if (post.author_eligibility) {
                const yearText = post.author_eligibility === 1 ? 'year' : 'years';
                parts.push(`YOE: ${post.author_eligibility} ${yearText}`);
            }
        } else if (post.author_division) {
            // College Player: Position • College • Division
            if (post.author_position) parts.push(post.author_position);
            if (post.author_school) parts.push(post.author_school);
            if (post.author_division) parts.push(formatDivisionDisplay(post.author_division));
        } else {
            // HS Player: Position • Height • Weight • GradYear
            if (post.author_position) parts.push(post.author_position);
            if (post.author_height) {
                const h = String(post.author_height);
                if (h.includes("'")) { parts.push(h); }
                else { const t = parseInt(h); if (!isNaN(t) && t > 0) parts.push(`${Math.floor(t/12)}'${t%12}"`); }
            }
            if (post.author_weight) parts.push(`${post.author_weight} lbs`);
            if (post.author_grad_year) parts.push(post.author_grad_year);
        }
        metaInfo = starsHtml + parts.join(' • ');
    } else if (post.author_role === 'coach') {
        // Coach
        const parts = [];
        if (post.author_division) {
            // College Coach: College, State • Division
            if (post.author_school && post.author_state) {
                parts.push(`${post.author_school}, ${post.author_state}`);
            } else if (post.author_school) {
                parts.push(post.author_school);
            } else if (post.author_state) {
                parts.push(post.author_state);
            }
            if (post.author_division) parts.push(formatDivisionDisplay(post.author_division));
            metaInfo = parts.join(' • ');
        } else {
            // HS Coach: School, State (comma-separated like sidebar)
            if (post.author_school) parts.push(post.author_school);
            if (post.author_state) parts.push(post.author_state);
            const schoolState = parts.join(', ');
            metaInfo = schoolState || '';
        }
    } else if (post.author_role === 'other') {
        // Other profile type: subheader in yellow
        if (post.author_subheader) {
            metaInfo = `<span style="color: #d4a017;">${post.author_subheader}</span>`;
        } else {
            metaInfo = '';
        }
    } else {
        // Fallback
        metaInfo = '';
    }

    return metaInfo;
}

// ---------------------------------------------------------------------------
// DEPRECATED — no longer called. The Posts and Likes tabs render through
// feed.js via renderProfileFeedCards(); see the FEED-IDENTICAL POST RENDERING
// block further down. These are the renderers whose author_* / original_author_*
// handling disagreed with the feed and produced the wrong header, subheader and
// avatar on shares.
//
// Dead as of this change: createProfilePostElement, createProfileRepostElement,
// createProfileQuotePostElement, createProfileLikedPostElement,
// createProfileLikedQuotePostElement, editProfilePost (replaced by
// feedManager.editPost), plus their helpers buildPostMetaInfo,
// buildOriginalPostMetaInfo and buildMediaGridHTML.
//
// Kept for one review cycle so the old markup is easy to diff against the new
// cards; slated for deletion in the same pass that ports this to the other five
// role folders. createProfileReplyElement is NOT dead — the Replies tab still
// uses it, and it still needs formatPostContent.
// ---------------------------------------------------------------------------

// Create post card HTML
function createProfilePostElement(post) {
    const authorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
    const metaInfo = buildPostMetaInfo(post);
    const isOwnPost = post.user_id === currentUserId;
    const isPinned = post.is_pinned || false;
    const isLiked = post.user_liked || false;
    const isSaved = post.user_saved || false;
    const isReposted = post.user_reposted || false;

    // Build media HTML using the grid layout (same as feed)
    const mediaHtml = buildMediaGridHTML(post.media_urls, post.media_type);

    // Pinned badge HTML
    const pinnedBadge = isPinned ? `
        <div class="profile-post-pinned-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <line x1="12" y1="17" x2="12" y2="22"></line>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
            </svg>
            <span>Pinned</span>
        </div>
    ` : '';

    // Post options menu button (only for own posts)
    const optionsButton = isOwnPost ? `
        <button class="profile-post-more-btn" onclick="event.stopPropagation(); showProfilePostMenu('${post.id}', ${isPinned}, event)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="19" cy="12" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle>
            </svg>
        </button>
    ` : '';

    return `
        ${pinnedBadge}
        <article class="profile-post-card${isPinned ? ' pinned' : ''}" data-post-id="${post.id}" data-author-user-id="${post.author_user_id || post.user_id || ''}" onclick="navigateToPost('${post.id}')">
            <div class="profile-post-header">
                <div class="profile-post-avatar" style="border: 2px solid ${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}; color: ${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}; background: ${getRoleAvatarBg(post.author_role, post.author_transfer === 'y', post.author_division)}">
                    ${post.author_image
                        ? `<img src="${post.author_image}" alt="${authorName}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>`
                    }
                </div>
                <div class="profile-post-info">
                    <div class="profile-post-author">
                        ${authorName}${typeof getSchoolLogoHTML === 'function' && post.author_division ? getSchoolLogoHTML(post.author_school, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 16) : ''}
                        ${post.author_username ? `<span class="profile-post-handle">@${post.author_username}</span>` : ''}
                        <span class="profile-post-timestamp">${formatTimeAgo(post.created_at)}</span>
                        ${optionsButton}
                    </div>
                    <div class="profile-post-meta ${post.author_role === 'coach' ? 'coach-meta' : (post.author_role === 'other' ? 'other-meta' : (post.author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">${metaInfo}</div>
                </div>
            </div>
            <div class="profile-post-content">
                <p>${formatPostContent(post.content)}</p>
                ${mediaHtml}
            </div>
            <div class="profile-post-stats" onclick="event.stopPropagation();">
                <span class="profile-likes-count" onclick="showPostLikes('${post.id}')" style="cursor: pointer;">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="profile-comments-count" onclick="togglePostComments('${post.id}')" style="cursor: pointer;">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="profile-shares-count" onclick="event.stopPropagation(); showPostShares('${post.id}')" style="cursor: pointer;">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="profile-post-actions" onclick="event.stopPropagation();">
                <button class="profile-action-btn ${isLiked ? 'liked' : ''}" onclick="togglePostLike('${post.id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="profile-action-btn" onclick="togglePostComments('${post.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
<!-- Save button commented out (feature paused, kept for future use)
                <button class="profile-action-btn ${isSaved ? 'saved' : ''}" onclick="togglePostSave('${post.id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                -->
                <button class="profile-action-btn ${isReposted ? 'reposted' : ''}" onclick="profileSharePost('${post.id}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span>Share</span>
                </button>
            </div>
        </article>
    `;
}

// Create repost card HTML (simple repost without added content)
function createProfileRepostElement(post) {
    const reposterId = post.author_user_id || post.user_id;
    const reposterName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
    const originalAuthorName = `${post.original_author_first_name || ''} ${post.original_author_last_name || ''}`.trim() || 'Unknown User';
    const originalMetaInfo = buildOriginalPostMetaInfo(post);
    const timeAgo = formatTimeAgo(post.created_at);
    const isOwnRepost = reposterId === currentUserId;
    const isLiked = post.user_liked || false;
    const isSaved = post.user_saved || false;
    const isReposted = post.user_reposted || false;

    // Build media HTML for original post — same grid renderer the profile's own posts
    // use, so reposted media opens in the viewer and multi-image reposts show every
    // image instead of only the first behind a "1 / N" badge.
    let mediaHtml = '';
    if (post.original_media_urls && post.original_media_urls.length > 0) {
        mediaHtml = buildMediaGridHTML(post.original_media_urls, post.original_media_type);
    }

    // Options button (for own reposts and others)
    const optionsButton = `
        <button class="profile-post-more-btn" onclick="event.stopPropagation(); showRepostMenu('${post.share_id}', '${post.id}', ${isOwnRepost}, event)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="19" cy="12" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle>
            </svg>
        </button>
    `;

    return `
        <article class="profile-post-card profile-repost-card" data-post-id="${post.id}" data-share-id="${post.share_id}" data-author-user-id="${post.author_user_id || post.user_id || ''}" onclick="navigateToPost('${post.id}')">
            <div class="profile-repost-indicator">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                <span>${isOwnRepost ? 'You' : reposterName} reposted</span>
                <span class="repost-time">${timeAgo}</span>
            </div>
            <div class="profile-post-header">
                <div class="profile-post-avatar" style="border: 2px solid ${getRoleBorderColor(post.original_author_role, post.original_author_transfer === 'y', post.original_author_division)}; color: ${getRoleBorderColor(post.original_author_role, post.original_author_transfer === 'y', post.original_author_division)}; background: ${getRoleAvatarBg(post.original_author_role, post.original_author_transfer === 'y', post.original_author_division)}">
                    ${post.original_author_image
                        ? `<img src="${post.original_author_image}" alt="${originalAuthorName}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>`
                    }
                </div>
                <div class="profile-post-info">
                    <div class="profile-post-author">
                        ${originalAuthorName}${typeof getSchoolLogoHTML === 'function' && post.original_author_division ? getSchoolLogoHTML(post.original_author_school, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 16) : ''}
                        ${post.original_author_username ? `<span class="profile-post-handle">@${post.original_author_username}</span>` : ''}
                        <span class="profile-post-timestamp">${formatTimeAgo(post.original_created_at)}</span>
                        ${optionsButton}
                    </div>
                    <div class="profile-post-meta ${post.original_author_role === 'coach' ? 'coach-meta' : (post.original_author_role === 'other' ? 'other-meta' : (post.original_author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">${originalMetaInfo}</div>
                </div>
            </div>
            <div class="profile-post-content">
                <p>${formatPostContent(post.original_content || '')}</p>
                ${mediaHtml}
            </div>
            <div class="profile-post-stats" onclick="event.stopPropagation();">
                <span class="profile-likes-count" onclick="showPostLikes('${post.id}')" style="cursor: pointer;">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="profile-comments-count" onclick="togglePostComments('${post.id}')" style="cursor: pointer;">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="profile-shares-count" onclick="event.stopPropagation(); showPostShares('${post.id}')" style="cursor: pointer;">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="profile-post-actions" onclick="event.stopPropagation();">
                <button class="profile-action-btn ${isLiked ? 'liked' : ''}" onclick="togglePostLike('${post.id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="profile-action-btn" onclick="togglePostComments('${post.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
<!-- Save button commented out (feature paused, kept for future use)
                <button class="profile-action-btn ${isSaved ? 'saved' : ''}" onclick="togglePostSave('${post.id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                -->
                <button class="profile-action-btn ${isReposted ? 'reposted' : ''}" onclick="profileSharePost('${post.id}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span>Share</span>
                </button>
            </div>
        </article>
    `;
}

// Create quote post card HTML (repost with added commentary)
function createProfileQuotePostElement(post) {
    const quoterId = post.author_user_id || post.user_id;
    const quoterName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
    const quoterMetaInfo = buildPostMetaInfo(post);
    const originalAuthorName = `${post.original_author_first_name || ''} ${post.original_author_last_name || ''}`.trim() || 'Unknown User';
    const originalTimeAgo = formatTimeAgo(post.original_created_at);
    const quoteTimeAgo = formatTimeAgo(post.created_at);
    const isOwnQuote = quoterId === currentUserId;
    const originalPostId = post.original_post_id || post.id;
    const isLiked = post.user_liked || false;
    const isSaved = post.user_saved || false;
    const isReposted = post.user_reposted || false;

    // Build media HTML for original post using grid layout (matches feed styling)
    let originalMediaHtml = '';
    if (post.original_media_urls && post.original_media_urls.length > 0) {
        const urls = post.original_media_urls;
        const mediaCount = Math.min(urls.length, 4);
        const isVideoUrl = (url) => {
            if (post.original_media_type === 'video') return true;
            return url && url.toLowerCase().match(/\.(mp4|mov|avi|webm|m4v)(\?|#|$)/);
        };

        let gridCells = '';
        for (let i = 0; i < mediaCount; i++) {
            const url = urls[i];
            const isVideo = isVideoUrl(url);
            const videoIndicator = isVideo ? `
                <div class="video-indicator">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </div>
            ` : '';

            gridCells += `
                <div class="quoted-media-item" onclick="event.stopPropagation(); openProfileMediaSlideshowFromElement(this);">
                    ${isVideo ?
                        `<video src="${url}#t=0.1" muted playsinline preload="metadata"></video>` :
                        `<img src="${url}" alt="Post media ${i + 1}">`
                    }
                    ${videoIndicator}
                </div>
            `;
        }

        originalMediaHtml = `<div class="quoted-post-media media-count-${mediaCount}">${gridCells}</div>`;
    }

    // Build media HTML for the quote post's own media
    const quoteMediaHtml = buildMediaGridHTML(post.quote_media_urls, post.quote_media_type);

    // Options button - show for all users (owner gets edit/delete, others get report)
    const optionsButton = `
        <button class="profile-post-more-btn" onclick="event.stopPropagation(); showQuoteMenu('${post.share_id}', '${originalPostId}', ${isOwnQuote}, event)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="19" cy="12" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle>
            </svg>
        </button>
    `;

    return `
        <article class="profile-post-card profile-quote-card" data-post-id="${originalPostId}" data-share-id="${post.share_id}" data-author-user-id="${post.author_user_id || post.user_id || ''}" onclick="navigateToQuotePost('${post.share_id}')" style="cursor: pointer;">
            <div class="profile-post-header">
                <div class="profile-post-avatar" onclick="event.stopPropagation(); goToProfile('${post.author_username || quoterId}', '${post.author_role || 'player'}', '${post.author_division || ''}', '${quoterId}', ${post.author_transfer === 'y'})" style="cursor: pointer; border: 2px solid ${getRoleBorderColor(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}; color: ${getRoleBorderColor(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}; background: ${getRoleAvatarBg(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}">
                    ${post.author_image
                        ? `<img src="${post.author_image}" alt="${quoterName}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>`
                    }
                </div>
                <div class="profile-post-info">
                    <div class="profile-post-author" onclick="event.stopPropagation(); goToProfile('${post.author_username || quoterId}', '${post.author_role || 'player'}', '${post.author_division || ''}', '${quoterId}', ${post.author_transfer === 'y'})" style="cursor: pointer;">
                        ${quoterName}${typeof getSchoolLogoHTML === 'function' && post.author_division ? getSchoolLogoHTML(post.author_school, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 16) : ''}
                        ${post.author_username ? `<span class="profile-post-handle">@${post.author_username}</span>` : ''}
                        <span class="profile-post-timestamp">${formatTimeAgo(post.created_at)}</span>
                        ${optionsButton}
                    </div>
                    <div class="profile-post-meta ${post.author_role === 'coach' ? 'coach-meta' : (post.author_role === 'other' ? 'other-meta' : (post.author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">${quoterMetaInfo}</div>
                </div>
            </div>
            <div class="profile-post-content" onclick="navigateToQuotePost('${post.share_id}')" style="cursor: pointer;">
                <p>${formatPostContent(post.quote_content || '')}</p>
            </div>
            ${quoteMediaHtml ? `<div onclick="event.stopPropagation();">${quoteMediaHtml}</div>` : ''}
            <!-- Embedded original post -->
            <div class="profile-quote-embedded" onclick="event.stopPropagation(); navigateToPost('${originalPostId}')">
                <div class="quote-embedded-header">
                    <div class="quote-embedded-avatar" onclick="event.stopPropagation(); goToProfile('${post.original_author_username || post.original_author_user_id}', '${post.original_author_role || 'player'}', '${post.original_author_division || ''}', '${post.original_author_user_id}', ${post.original_author_transfer === 'y'})" style="cursor: pointer;">
                        ${post.original_author_image
                            ? `<img src="${post.original_author_image}" alt="${originalAuthorName}">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>`
                        }
                    </div>
                    <div class="quote-embedded-info">
                        <span class="quote-embedded-author">${originalAuthorName}</span>
                        <span class="quote-embedded-time">${originalTimeAgo}</span>
                    </div>
                </div>
                <div class="quote-embedded-content">
                    <p>${formatPostContent(post.original_content || '')}</p>
                    ${originalMediaHtml}
                </div>
            </div>
            <div class="profile-post-stats">
                <span class="profile-likes-count" onclick="event.stopPropagation(); showShareLikes('${post.share_id}')" style="cursor: pointer;">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="profile-comments-count" onclick="event.stopPropagation(); toggleShareComments('${post.share_id}')" style="cursor: pointer;">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="profile-shares-count" onclick="event.stopPropagation(); showPostShares('${post.original_post_id || post.id}')" style="cursor: pointer;">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="profile-post-actions">
                <button class="profile-action-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleShareLike('${post.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="profile-action-btn" onclick="event.stopPropagation(); toggleShareComments('${post.share_id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="profile-action-btn ${isSaved ? 'saved' : ''}" onclick="event.stopPropagation(); toggleShareSave('${post.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                <button class="profile-action-btn ${isReposted ? 'reposted' : ''}" onclick="event.stopPropagation(); profileSharePost('${originalPostId}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span>${isReposted ? 'Shared' : 'Share'}</span>
                </button>
            </div>
            <div class="profile-comments-section" id="share-comments-${post.share_id}" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-container">
                    <input type="text" placeholder="Write a comment..." class="comment-input" maxlength="300" id="share-comment-input-${post.share_id}" onkeypress="if(event.key==='Enter') addShareComment('${post.share_id}')">
                    <button onclick="addShareComment('${post.share_id}')">Post</button>
                </div>
            </div>
        </article>
    `;
}

// Build meta info for original post in reposts/quotes
function buildOriginalPostMetaInfo(post) {
    const timeAgo = formatTimeAgo(post.original_created_at);
    let starsHtml = '';

    if (post.original_author_role === 'player' && post.original_author_star_rating && post.original_author_star_rating >= 1 && post.original_author_star_rating <= 5) {
        const isHSPlayer = !post.original_author_division && post.original_author_transfer !== 'y';
        const isTransferPlayer = post.original_author_transfer === 'y';
        if (isHSPlayer || isTransferPlayer) {
            starsHtml = `<span class="post-meta-stars" style="color: #ffd700; font-weight: 600;">${post.original_author_star_rating}★</span> `;
        }
    }

    if (post.original_author_role === 'player') {
        const parts = [];
        if (post.original_author_transfer === 'y') {
            if (post.original_author_position) parts.push(post.original_author_position);
            if (post.original_author_height) {
                const heightStr = String(post.original_author_height);
                if (heightStr.includes("'") || heightStr.includes('-')) {
                    parts.push(heightStr.replace('-', "'") + '"');
                } else {
                    const feet = Math.floor(parseInt(heightStr) / 12);
                    const inches = parseInt(heightStr) % 12;
                    parts.push(`${feet}'${inches}"`);
                }
            }
            if (post.original_author_weight) parts.push(`${post.original_author_weight} lbs`);
            if (post.original_author_eligibility) {
                const yearText = post.original_author_eligibility === 1 ? 'year' : 'years';
                parts.push(`YOE: ${post.original_author_eligibility} ${yearText}`);
            }
        } else if (post.original_author_division) {
            if (post.original_author_position) parts.push(post.original_author_position);
            if (post.original_author_school) parts.push(post.original_author_school);
            const div = post.original_author_division;
            const divLabel = div === 'D1' ? 'D1' : div === 'D2' ? 'D2' : div === 'D3' ? 'D3' : div === 'NAIA' ? 'NAIA' : div === 'JUCO' ? 'JUCO' : '';
            if (divLabel) parts.push(divLabel);
        } else {
            if (post.original_author_position) parts.push(post.original_author_position);
            if (post.original_author_school) parts.push(post.original_author_school);
            if (post.original_author_grad_year) parts.push(`'${String(post.original_author_grad_year).slice(-2)}`);
        }
        return starsHtml + parts.join(' · ') + (parts.length > 0 ? ' · ' : '') + timeAgo;
    } else if (post.original_author_role === 'coach') {
        const parts = [];
        if (post.original_author_position) parts.push(post.original_author_position);
        if (post.original_author_school) parts.push(post.original_author_school);
        if (post.original_author_division) {
            const div = post.original_author_division;
            const divLabel = div === 'D1' ? 'D1' : div === 'D2' ? 'D2' : div === 'D3' ? 'D3' : div === 'NAIA' ? 'NAIA' : div === 'JUCO' ? 'JUCO' : div === 'High School' ? 'HS' : '';
            if (divLabel) parts.push(divLabel);
        }
        return parts.join(' · ') + (parts.length > 0 ? ' · ' : '') + timeAgo;
    } else if (post.original_author_role === 'other') {
        const parts = [];
        if (post.original_author_subheader) parts.push(post.original_author_subheader);
        return parts.join(' · ') + (parts.length > 0 ? ' · ' : '') + timeAgo;
    }
    return timeAgo;
}

// Show repost menu (delete option)
function showRepostMenu(shareId, postId, isOwner, event) {
    event.stopPropagation();

    // Remove existing menu
    const existing = document.querySelector('.repost-dropdown-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'repost-dropdown-menu';
    menu.innerHTML = isOwner ? `
        <div class="dropdown-item dropdown-item-danger" onclick="deleteRepost('${shareId}', '${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Undo Repost</span>
        </div>
    ` : `
        <div class="dropdown-item" onclick="event.stopPropagation(); reportPost('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                <line x1="4" y1="22" x2="4" y2="15"></line>
            </svg>
            <span>Report Post</span>
        </div>
        <div class="dropdown-item dropdown-item-danger" onclick="event.stopPropagation(); window.blockProfilePostAuthor('${postId}', '${shareId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
            </svg>
            <span>Block User</span>
        </div>
    `;

    // Position menu
    const rect = event.target.closest('button').getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    menu.style.zIndex = '1000';

    document.body.appendChild(menu);

    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// Show quote menu (delete option)
async function reportPost(postId) {
    const menu = document.querySelector('.repost-dropdown-menu');
    if (menu) menu.remove();
    if (typeof window.openReportModal !== 'function') {
        showToast('Report unavailable. Please refresh and try again.', 'error');
        return;
    }
    const submitted = await window.openReportModal({
        contentType: 'post',
        contentId: postId,
        contentLabel: 'Post'
    });
    if (!submitted) return;
    const card = document.querySelector(`.post-card[data-post-id="${postId}"]:not([data-share-id])`);
    if (card && typeof window.fadeAndReplaceWithReportedChip === 'function') {
        window.fadeAndReplaceWithReportedChip(card);
    }
}

function showQuoteMenu(shareId, postId, isOwner, event) {
    event.stopPropagation();

    // Remove existing menu
    const existing = document.querySelector('.profile-post-dropdown-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'profile-post-dropdown-menu';
    menu.innerHTML = `
        ${isOwner ? `
            <div class="dropdown-item" onclick="event.stopPropagation(); editQuote('${shareId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Quote
            </div>
            <div class="dropdown-item dropdown-item-danger" onclick="event.stopPropagation(); deleteQuote('${shareId}', '${postId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete Quote
            </div>
        ` : `
            <div class="dropdown-item" onclick="event.stopPropagation(); reportQuote('${shareId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                    <line x1="4" y1="22" x2="4" y2="15"></line>
                </svg>
                Report Quote
            </div>
            <div class="dropdown-item dropdown-item-danger" onclick="event.stopPropagation(); window.blockProfilePostAuthor('${postId}', '${shareId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                </svg>
                Block User
            </div>
        `}
    `;

    document.body.appendChild(menu);

    // Position menu
    const btn = event.target.closest('button');
    const rect = btn.getBoundingClientRect();
    menu.style.top = rect.bottom + 5 + 'px';
    menu.style.right = window.innerWidth - rect.right + 'px';

    // Close on outside click or scroll
    setTimeout(() => {
        function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
        }
        document.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
    }, 0);
}

// Delete repost
async function deleteRepost(shareId, postId) {
    const menu = document.querySelector('.repost-dropdown-menu');
    if (menu) menu.remove();

    const modal = document.createElement('div');
    modal.className = 'profile-post-modal-overlay';
    modal.id = 'delete-repost-modal';
    modal.innerHTML = `
        <div class="profile-post-modal">
            <div class="delete-modal">
                <div class="delete-modal-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </div>
                <h3>Undo Repost</h3>
                <p>Are you sure you want to remove this repost from your profile?</p>
                <div class="delete-modal-actions">
                    <button class="delete-modal-btn delete-modal-btn-cancel" onclick="closeProfilePostModal('delete-repost-modal')">Cancel</button>
                    <button class="delete-modal-btn delete-modal-btn-delete" onclick="confirmDeleteRepost('${shareId}')">Remove</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProfilePostModal('delete-repost-modal');
    });
}

async function confirmDeleteRepost(shareId) {
    const deleteBtn = document.querySelector('#delete-repost-modal .delete-modal-btn-delete');
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.textContent = 'Removing...'; }
    try {
        await API.delete(`/posts/shares/${shareId}`);
        const card = document.querySelector(`[data-share-id="${shareId}"]`);
        if (card) card.remove();
        closeProfilePostModal('delete-repost-modal');
        showToast('Repost removed');
    } catch (error) {
        console.error('Error deleting repost:', error);
        closeProfilePostModal('delete-repost-modal');
        showToast('Failed to remove repost', 'error');
    }
}

// Delete quote post
async function deleteQuote(shareId, postId) {
    const menu = document.querySelector('.quote-dropdown-menu');
    if (menu) menu.remove();

    const modal = document.createElement('div');
    modal.className = 'profile-post-modal-overlay';
    modal.id = 'delete-quote-modal';
    modal.innerHTML = `
        <div class="profile-post-modal">
            <div class="delete-modal">
                <div class="delete-modal-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </div>
                <h3>Delete Quote Post</h3>
                <p>Are you sure you want to delete this quote post? This action cannot be undone.</p>
                <div class="delete-modal-actions">
                    <button class="delete-modal-btn delete-modal-btn-cancel" onclick="closeProfilePostModal('delete-quote-modal')">Cancel</button>
                    <button class="delete-modal-btn delete-modal-btn-delete" onclick="confirmDeleteQuote('${shareId}')">Delete</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeProfilePostModal('delete-quote-modal');
    });
}

async function confirmDeleteQuote(shareId) {
    const deleteBtn = document.querySelector('#delete-quote-modal .delete-modal-btn-delete');
    if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.textContent = 'Deleting...'; }
    try {
        await API.delete(`/posts/shares/${shareId}`);
        const card = document.querySelector(`[data-share-id="${shareId}"]`);
        if (card) card.remove();
        closeProfilePostModal('delete-quote-modal');
        showToast('Quote post deleted');
    } catch (error) {
        console.error('Error deleting quote:', error);
        closeProfilePostModal('delete-quote-modal');
        showToast('Failed to delete quote post', 'error');
    }
}

// Create reply card HTML
function createProfileReplyElement(reply) {
    const authorName = `${reply.author_first_name || ''} ${reply.author_last_name || ''}`.trim() || 'Unknown User';
    const originalAuthorName = `${reply.original_author_first_name || ''} ${reply.original_author_last_name || ''}`.trim() || 'Unknown User';
    const timeAgo = formatTimeAgo(reply.reply_created_at || reply.created_at);

    // Truncate original post content for preview (50 characters max)
    let originalContentPreview = reply.original_post_content || '';
    if (originalContentPreview.length > 50) {
        originalContentPreview = originalContentPreview.substring(0, 50) + '...';
    }

    // Only show menu button if viewing own profile
    const isOwnReply = !viewingUserId || viewingUserId === currentUserId;

    return `
        <article class="profile-reply-card" data-comment-id="${reply.id}" data-post-id="${reply.original_post_id}" data-content="${escapeHtmlAttr(reply.content)}" onclick="if(!event.target.closest('button')){navigateToPost('${reply.original_post_id}')}" style="cursor: pointer;">
            <div class="profile-reply-context">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Replying to <strong>${originalAuthorName}</strong></span>
            </div>
            <div class="profile-reply-original" onclick="navigateToPost('${reply.original_post_id}')">
                <p>${formatPostContent(originalContentPreview)}</p>
            </div>
            <div class="profile-reply-content">
                <div class="profile-reply-header">
                    <div class="profile-reply-avatar" style="border: 2px solid ${getRoleBorderColor(reply.author_role, reply.author_transfer === 'y', reply.author_division)}; color: ${getRoleBorderColor(reply.author_role, reply.author_transfer === 'y', reply.author_division)}; background: ${getRoleAvatarBg(reply.author_role, reply.author_transfer === 'y', reply.author_division)}">
                        ${reply.author_image
                            ? `<img src="${reply.author_image}" alt="${authorName}">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>`
                        }
                    </div>
                    <div class="profile-reply-info">
                        <div class="profile-reply-author">${authorName}${typeof getSchoolLogoHTML === 'function' && reply.author_division ? getSchoolLogoHTML(reply.author_school, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 14) : ''} ${reply.author_username ? `<span class="profile-post-handle">@${reply.author_username}</span>` : ''}<span class="profile-post-timestamp">${timeAgo}</span>${isOwnReply ? `<button class="reply-menu-btn" onclick="event.stopPropagation(); showReplyMenu('${reply.id}', '${reply.original_post_id}', event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg></button>` : ''}</div>
                        <div class="profile-reply-meta" style="font-weight: 700;">${buildCommentSubheader(reply.author_role, { transfer: reply.author_transfer, position: reply.author_position, height: reply.author_height, weight: reply.author_weight, eligibility: reply.author_eligibility, division: reply.author_division, school: reply.author_school, grad_year: reply.author_grad_year, state: reply.author_state, subheader: reply.author_subheader }) || ''}</div>
                    </div>
                </div>
                <div class="profile-reply-text" onclick="navigateToPost('${reply.original_post_id}')">
                    <p>${formatPostContent(reply.content)}</p>
                </div>
                <div class="profile-reply-stats" onclick="event.stopPropagation();">
                    <button class="comment-like-btn ${reply.user_liked ? 'liked' : ''}" onclick="event.stopPropagation(); likePostComment('${reply.id}', this)">
                        <svg viewBox="0 0 24 24" fill="${reply.user_liked ? '#e74c3c' : 'none'}" stroke="${reply.user_liked ? '#e74c3c' : 'currentColor'}" stroke-width="2" width="14" height="14">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <span>${reply.likes_count || 0}</span>
                    </button>
                </div>
            </div>
        </article>
    `;
}

// Escape HTML for safe attribute usage
function escapeHtmlAttr(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
}

// Show reply menu (edit/delete options)
function showReplyMenu(commentId, postId, event) {
    event.stopPropagation();

    // Remove existing menu
    const existing = document.querySelector('.reply-dropdown-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'reply-dropdown-menu';
    menu.innerHTML = `
        <div class="dropdown-item" onclick="editReply('${commentId}', '${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            <span>Edit Reply</span>
        </div>
        <div class="dropdown-item dropdown-item-danger" onclick="deleteReply('${commentId}', '${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Delete Reply</span>
        </div>
    `;

    document.body.appendChild(menu);

    // Position menu near the button
    const btn = event.target.closest('.reply-menu-btn');
    const rect = btn.getBoundingClientRect();
    menu.style.top = rect.bottom + 5 + 'px';
    menu.style.right = window.innerWidth - rect.right + 'px';

    // Close on outside click or scroll
    setTimeout(() => {
        function closeMenu(e) {
            if (e.type === 'scroll' || !menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
                window.removeEventListener('scroll', closeMenu, true);
            }
        }
        document.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
    }, 0);
}

// Edit reply
function editReply(commentId, postId) {
    // Close menu
    document.querySelector('.reply-dropdown-menu')?.remove();

    // Find the reply card and get current content
    const replyCard = document.querySelector(`[data-comment-id="${commentId}"]`);
    if (!replyCard) return;

    const currentContent = replyCard.dataset.content || '';

    // Create edit modal
    const modal = document.createElement('div');
    modal.className = 'reply-edit-modal-overlay';
    modal.id = 'edit-reply-modal';
    modal.innerHTML = `
        <div class="reply-edit-modal">
            <div class="reply-edit-modal-header">
                <h3>Edit Reply</h3>
                <button class="reply-edit-modal-close" onclick="closeReplyModal()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="reply-edit-modal-body">
                <textarea id="editReplyContent" maxlength="300" placeholder="Edit your reply...">${currentContent}</textarea>
            </div>
            <div class="reply-edit-modal-footer">
                <button class="btn-cancel" onclick="closeReplyModal()">Cancel</button>
                <button class="btn-save" onclick="saveReplyEdit('${commentId}', '${postId}')">Save</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Focus the textarea
    const textarea = document.getElementById('editReplyContent');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeReplyModal();
        }
    });
}

// Save reply edit
async function saveReplyEdit(commentId, postId) {
    const textarea = document.getElementById('editReplyContent');
    const content = textarea?.value.trim();

    if (!content) {
        showProfileToast('Reply cannot be empty', 'error');
        return;
    }

    const saveBtn = document.querySelector('.reply-edit-modal .btn-save');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        await API.put(`/posts/${postId}/comments/${commentId}`, { content });

        // Update the reply card content
        const replyCard = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (replyCard) {
            const textElement = replyCard.querySelector('.profile-reply-text p');
            if (textElement) {
                textElement.innerHTML = formatPostContent(content);
            }
            replyCard.dataset.content = content;
        }

        closeReplyModal();
        showProfileToast('Reply updated', 'success');
    } catch (error) {
        console.error('Error updating reply:', error);
        showProfileToast('Failed to update reply', 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save';
        }
    }
}

// Close reply edit modal
function closeReplyModal() {
    const modal = document.getElementById('edit-reply-modal');
    if (modal) modal.remove();
}

// Delete reply
function deleteReply(commentId, postId) {
    // Close menu
    document.querySelector('.reply-dropdown-menu')?.remove();

    // Create delete confirmation modal
    const modal = document.createElement('div');
    modal.className = 'reply-delete-modal-overlay';
    modal.id = 'delete-reply-modal';
    modal.innerHTML = `
        <div class="reply-delete-modal">
            <div class="reply-delete-modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </div>
            <h3>Delete Reply</h3>
            <p>Are you sure you want to delete this reply? This action cannot be undone.</p>
            <div class="reply-delete-modal-actions">
                <button class="btn-cancel" onclick="closeDeleteReplyModal()">Cancel</button>
                <button class="btn-delete" onclick="confirmDeleteReply('${commentId}', '${postId}')">Delete</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeDeleteReplyModal();
        }
    });
}

// Close delete reply modal
function closeDeleteReplyModal() {
    const modal = document.getElementById('delete-reply-modal');
    if (modal) modal.remove();
}

// Confirm delete reply
async function confirmDeleteReply(commentId, postId) {
    const deleteBtn = document.querySelector('.reply-delete-modal .btn-delete');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
    }

    try {
        await API.delete(`/posts/${postId}/comments/${commentId}`);

        // Remove the reply card from the DOM
        const replyCard = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (replyCard) {
            replyCard.remove();
        }

        closeDeleteReplyModal();
        showProfileToast('Reply deleted', 'success');

        // Check if no more replies
        const container = document.getElementById('profileRepliesContainer');
        if (container && container.children.length === 0) {
            container.innerHTML = `
                <div class="profile-replies-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <p>No replies yet</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error deleting reply:', error);
        showProfileToast('Failed to delete reply', 'error');
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete';
        }
    }
}

// Navigate to single post view
function navigateToPost(postId) {
    window.location.href = new URL(`post-view.html?id=${postId}&ref=profile`, window.location.href).href;
}

// Navigate to quote post single page
function navigateToQuotePost(shareId) {
    window.location.href = new URL(`post-view.html?share=${shareId}`, window.location.href).href;
}

// Open media slideshow (simple lightbox for profile page)
function openProfileMediaSlideshow(mediaUrls, startIndex = 0) {
    if (!mediaUrls || mediaUrls.length === 0) return;
    const urls = typeof mediaUrls === 'string' ? JSON.parse(mediaUrls) : mediaUrls;
    let currentIndex = startIndex;
    const overlay = document.createElement('div');
    overlay.className = 'media-slideshow-overlay';
    overlay.innerHTML = `
        <div class="media-slideshow-container">
            <button class="slideshow-close" onclick="closeProfileMediaSlideshow()">&times;</button>
            ${urls.length > 1 ? `
                <button class="slideshow-nav slideshow-prev" onclick="navigateProfileSlideshow(-1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
                <button class="slideshow-nav slideshow-next" onclick="navigateProfileSlideshow(1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
            ` : ''}
            <div class="slideshow-media-container"></div>
            ${urls.length > 1 ? `<div class="slideshow-counter">${currentIndex + 1} / ${urls.length}</div>` : ''}
        </div>
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    window.profileSlideshowData = { urls, currentIndex };
    updateProfileSlideshowMedia();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeProfileMediaSlideshow(); });
    document.addEventListener('keydown', handleProfileSlideshowKeydown);
}

function updateProfileSlideshowMedia() {
    const data = window.profileSlideshowData;
    if (!data) return;
    const container = document.querySelector('.slideshow-media-container');
    const counter = document.querySelector('.slideshow-counter');
    const url = data.urls[data.currentIndex];
    const isVideo = url.toLowerCase().match(/\.(mp4|mov|avi|webm|m4v)(\?|#|$)/);
    if (isVideo) {
        container.innerHTML = `<video src="${url}" controls autoplay playsinline style="max-width: 90vw; max-height: 90vh;"></video>`;
    } else {
        container.innerHTML = `<img src="${url}" alt="Media" style="max-width: 90vw; max-height: 90vh; object-fit: contain;">`;
    }
    if (counter) counter.textContent = `${data.currentIndex + 1} / ${data.urls.length}`;
}

function navigateProfileSlideshow(direction) {
    const data = window.profileSlideshowData;
    if (!data) return;
    data.currentIndex = (data.currentIndex + direction + data.urls.length) % data.urls.length;
    updateProfileSlideshowMedia();
}

function closeProfileMediaSlideshow() {
    const overlay = document.querySelector('.media-slideshow-overlay');
    if (overlay) { overlay.remove(); document.body.style.overflow = ''; }
    document.removeEventListener('keydown', handleProfileSlideshowKeydown);
    window.profileSlideshowData = null;
}

function handleProfileSlideshowKeydown(e) {
    if (e.key === 'Escape') closeProfileMediaSlideshow();
    if (e.key === 'ArrowLeft') navigateProfileSlideshow(-1);
    if (e.key === 'ArrowRight') navigateProfileSlideshow(1);
}

// Open media slideshow from a clicked element (reads the sibling media out of the DOM).
// Three markups feed this and they use different class names: the post's own media
// grid, the quoted-post embed, and the single-media block on reposts/liked posts.
// Matching only the quoted-embed pair is what left grid media unclickable.
function openProfileMediaSlideshowFromElement(clickedElement) {
    const GRID_SHAPES = [
        { container: '.post-media-grid', item: '.media-grid-cell' },
        { container: '.quoted-post-media', item: '.quoted-media-item' }
    ];

    let mediaContainer = null;
    let itemSelector = null;
    for (const shape of GRID_SHAPES) {
        const found = clickedElement.closest(shape.container);
        if (found) {
            mediaContainer = found;
            itemSelector = shape.item;
            break;
        }
    }
    if (!mediaContainer) return;

    // Resolve the cell even when the click landed on the inner <img>/<video>.
    const clickedCell = clickedElement.closest(itemSelector) || clickedElement;

    const mediaItems = mediaContainer.querySelectorAll(itemSelector);
    const urls = [];
    let startIndex = 0;

    mediaItems.forEach((item, index) => {
        const img = item.querySelector('img');
        const video = item.querySelector('video');
        if (img) urls.push(img.src);
        else if (video) urls.push(video.src);

        if (item === clickedCell) startIndex = urls.length - 1;
    });

    if (urls.length > 0) {
        openProfileMediaSlideshow(urls, Math.max(0, startIndex));
    }
}

// ============================================
// Post Engagement Functions
// ============================================

async function togglePostLike(postId, button) {
    const isLiked = button.classList.contains('liked');
    const svg = button.querySelector('svg');
    const span = button.querySelector('span');
    const statsEl = button.closest('.profile-post-card').querySelector('.profile-likes-count');

    try {
        if (isLiked) {
            await API.delete(`/posts/${postId}/like`);
            button.classList.remove('liked');
            svg.setAttribute('fill', 'none');
            span.textContent = 'Like';
            if (statsEl) {
                const count = parseInt(statsEl.textContent) - 1;
                statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
            }
        } else {
            await API.post(`/posts/${postId}/like`);
            button.classList.add('liked');
            svg.setAttribute('fill', 'currentColor');
            span.textContent = 'Liked';
            if (statsEl) {
                const count = parseInt(statsEl.textContent) + 1;
                statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
            }
        }
    } catch (error) {
        console.error('Error toggling like:', error);
    }
}

async function togglePostSave(postId, button) {
    const isSaved = button.classList.contains('saved');
    const span = button.querySelector('span');
    const svg = button.querySelector('svg');

    try {
        if (isSaved) {
            await API.delete(`/posts/${postId}/save`);
            button.classList.remove('saved');
            svg.setAttribute('fill', 'none');
            span.textContent = 'Save';
        } else {
            await API.post(`/posts/${postId}/save`);
            button.classList.add('saved');
            svg.setAttribute('fill', 'currentColor');
            span.textContent = 'Saved';
        }
    } catch (error) {
        console.error('Error toggling save:', error);
    }
}

async function togglePostComments(postId) {
    const postCard = document.querySelector(`[data-post-id="${postId}"]`);
    if (!postCard) return;

    let commentsSection = postCard.querySelector('.profile-comments-section');

    if (commentsSection) {
        commentsSection.remove();
        return;
    }

    commentsSection = document.createElement('div');
    commentsSection.className = 'profile-comments-section';
    commentsSection.innerHTML = `
        <div class="comments-list" id="comments-${postId}">
            <div class="comments-loading">Loading comments...</div>
        </div>
        <div class="comment-input-container">
            <input type="text" class="comment-input" maxlength="300" placeholder="Write a comment..." id="comment-input-${postId}">
            <button onclick="event.stopPropagation(); addPostComment('${postId}')">Post</button>
        </div>
    `;

    const actionsBar = postCard.querySelector('.profile-post-actions');
    if (actionsBar) {
        actionsBar.after(commentsSection);
    } else {
        postCard.appendChild(commentsSection);
    }

    // Load comments
    await loadPostComments(postId);

    // Add enter key listener for comment input
    const input = document.getElementById(`comment-input-${postId}`);
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                addPostComment(postId);
            }
        });
        input.addEventListener('click', (e) => e.stopPropagation());
    }
}

// buildCommentSubheader() intentionally lives in shared/api.js, not here.
//
// This file used to declare its own copy, which (being a top-level function
// declaration in a later-loaded script) shadowed the shared one across the whole
// profile page. The two had drifted: the local copy interpolated school/position
// unescaped, and coloured transfer players #e63946 while the feed used #ef4444.
// Deleting it means the Posts, Likes and Replies tabs now produce byte-identical
// subheaders to the mainpage feed, and get the shared version's escaping.

async function loadPostComments(postId) {
    const commentsList = document.getElementById(`comments-${postId}`);
    if (!commentsList) return;

    try {
        const response = await API.get(`/posts/${postId}/comments`);
        const comments = response.comments || [];

        if (comments.length === 0) {
            commentsList.innerHTML = '<div class="no-comments">No comments yet. Be the first to comment!</div>';
            return;
        }

        commentsList.innerHTML = comments.map(comment => {
            const commentAuthorName = `${comment.author_first_name || ''} ${comment.author_last_name || ''}`.trim() || 'Unknown';
            const isOwnComment = comment.user_id === currentUserId;
            const subheader = buildCommentSubheader(comment.author_role, {
                transfer: comment.author_transfer, position: comment.author_position, height: comment.author_height,
                weight: comment.author_weight, eligibility: comment.author_eligibility, division: comment.author_division,
                school: comment.author_school, grad_year: comment.author_grad_year, state: comment.author_state,
                subheader: comment.author_subheader
            });
            return `
                <div class="comment" data-comment-id="${comment.id}">
                    <div class="comment-avatar" onclick="event.stopPropagation(); goToProfile('${comment.author_username || comment.user_id}', '${comment.author_role || 'player'}', '${comment.author_division || ''}', '${comment.user_id}', ${comment.author_transfer === 'y'})" style="cursor: pointer; border: 2px solid ${getRoleBorderColor(comment.author_role || 'player', comment.author_transfer === 'y', comment.author_division)}; color: ${getRoleBorderColor(comment.author_role || 'player', comment.author_transfer === 'y', comment.author_division)}; background: ${getRoleAvatarBg(comment.author_role || 'player', comment.author_transfer === 'y', comment.author_division)}">
                        ${comment.author_image
                            ? `<img src="${comment.author_image}" alt="${commentAuthorName}">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
                        }
                    </div>
                    <div class="comment-body">
                        <div class="comment-header">
                            <span class="comment-author" onclick="event.stopPropagation(); goToProfile('${comment.author_username || comment.user_id}', '${comment.author_role || 'player'}', '${comment.author_division || ''}', '${comment.user_id}', ${comment.author_transfer === 'y'})" style="cursor: pointer;">${commentAuthorName}${typeof getSchoolLogoHTML === 'function' && comment.author_division ? ' ' + getSchoolLogoHTML(comment.author_school, _assetsPath, 14) : ''}</span>
                            ${comment.author_username ? `<span class="comment-username" style="color: rgba(254,252,251,0.5); font-size: 12px; font-weight: 400;">@${comment.author_username}</span>` : ''}
                            <span class="comment-timestamp">${formatTimeAgo(comment.created_at)}</span>
                        </div>
                        ${subheader ? `<div class="comment-subheader">${subheader}</div>` : ''}
                        <div class="comment-content">${comment.content}</div>
                        <div class="comment-actions">
                            <button class="comment-like-btn ${comment.user_liked ? 'liked' : ''}" onclick="event.stopPropagation(); likePostComment('${comment.id}', this)">
                                <svg viewBox="0 0 24 24" fill="${comment.user_liked ? '#e74c3c' : 'none'}" stroke="${comment.user_liked ? '#e74c3c' : 'currentColor'}" stroke-width="2" width="14" height="14">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                                <span>${comment.likes_count || 0}</span>
                            </button>
                            ${isOwnComment ? `
                                <button class="comment-delete-btn" onclick="event.stopPropagation(); deletePostComment('${postId}', '${comment.id}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading comments:', error);
        commentsList.innerHTML = '<div class="comments-error">Failed to load comments</div>';
    }
}

async function addPostComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    if (!input) return;

    const content = input.value.trim();
    if (!content) return;

    try {
        await API.post(`/posts/${postId}/comments`, { content });
        input.value = '';
        await loadPostComments(postId);

        // Update comment count in stats
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        const statsEl = postCard?.querySelector('.profile-comments-count');
        if (statsEl) {
            const count = parseInt(statsEl.textContent) + 1;
            statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
        }
    } catch (error) {
        console.error('Error adding comment:', error);
    }
}

async function deletePostComment(postId, commentId) {
    if (!(await showConfirmModal({ title: 'Delete Comment', message: 'Are you sure you want to delete this comment?', confirmText: 'Delete', cancelText: 'Cancel' }))) return;

    try {
        await API.delete(`/posts/comments/${commentId}`);
        await loadPostComments(postId);

        // Update comment count in stats
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        const statsEl = postCard?.querySelector('.profile-comments-count');
        if (statsEl) {
            const count = Math.max(0, parseInt(statsEl.textContent) - 1);
            statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
        }
    } catch (error) {
        console.error('Error deleting comment:', error);
    }
}

async function likePostComment(commentId, button) {
    const isLiked = button.classList.contains('liked');
    const svg = button.querySelector('svg');
    const countSpan = button.querySelector('span');

    try {
        if (isLiked) {
            await API.delete(`/posts/comments/${commentId}/like`);
            button.classList.remove('liked');
            svg.setAttribute('fill', 'none');
            countSpan.textContent = Math.max(0, parseInt(countSpan.textContent) - 1);
        } else {
            await API.post(`/posts/comments/${commentId}/like`);
            button.classList.add('liked');
            svg.setAttribute('fill', 'currentColor');
            countSpan.textContent = parseInt(countSpan.textContent) + 1;
        }
    } catch (error) {
        console.error('Error liking comment:', error);
    }
}

function showPostLikes(postId) {
    showLikesModalForPost(postId);
}

async function showLikesModalForPost(postId) {
    try {
        const response = await API.get(`/posts/${postId}/likes`);
        const likes = response.likes || [];
        showLikesModal(likes, 'Likes');
    } catch (error) {
        console.error('Error fetching likes:', error);
    }
}

async function profileSharePost(postId, event) {
    event.stopPropagation();

    const existingMenu = document.querySelector('.share-menu');
    if (existingMenu) {
        existingMenu.remove();
        return;
    }

    // Check if user has already reposted
    let hasReposted = false;
    try {
        const reposts = await API.get('/posts/reposts/mine?limit=100');
        hasReposted = reposts.reposts?.some(r => r.original_post_id === postId && r.share_type === 'repost');
    } catch (e) {
        console.error('Error checking repost status:', e);
    }

    const menu = document.createElement('div');
    menu.className = 'share-menu';
    menu.innerHTML = `
        <div class="share-menu-item" onclick="event.stopPropagation(); profileRepostPost('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
            <span>${hasReposted ? 'Undo Repost' : 'Repost'}</span>
        </div>
        <div class="share-menu-item" onclick="event.stopPropagation(); profileQuotePost('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Quote</span>
        </div>
        <div class="share-menu-item" onclick="event.stopPropagation(); profileCopyPostLink('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy Link</span>
        </div>
    `;

    document.body.appendChild(menu);

    const button = event.target.closest('button');
    const rect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${rect.bottom + 5}px`;
    menu.style.left = `${rect.left}px`;

    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

function profileCopyPostLink(postId) {
    document.querySelector('.share-menu')?.remove();
    // getShareBaseUrl points at the public site — inside the iOS app the WebView
    // origin is https://localhost, a dead link for anyone it's shared with.
    const url = `${getShareBaseUrl()}/${getProfileFolder({ role: getUser()?.role || 'coach' })}/tabs/post-view.html?id=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard');
    }).catch(() => {
        showToast('Failed to copy link', 'error');
    });
}

async function profileRepostPost(postId) {
    document.querySelector('.share-menu')?.remove();

    try {
        // Check if already reposted
        const reposts = await API.get('/posts/reposts/mine?limit=100');
        const existingRepost = reposts.reposts?.find(r => r.original_post_id === postId && r.share_type === 'repost');

        if (existingRepost) {
            await API.delete(`/posts/${postId}/repost`);
            showToast('Repost removed');
        } else {
            await API.post(`/posts/${postId}/share`, { share_type: 'repost' });
            showToast('Reposted!');
        }
    } catch (error) {
        console.error('Error toggling repost:', error);
        showToast('Failed to repost', true);
    }
}

function profileQuotePost(postId) {
    document.querySelector('.share-menu')?.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'quote-modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <button class="modal-close" onclick="document.getElementById('quote-modal').remove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <h3 style="margin-bottom: 1rem;">Quote Post</h3>
            <textarea id="quote-content" placeholder="Add your thoughts..." style="width: 100%; min-height: 100px; padding: 0.75rem; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: rgba(255,255,255,0.05); color: white; resize: vertical;"></textarea>
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: flex-end;">
                <button class="btn-secondary" onclick="document.getElementById('quote-modal').remove()">Cancel</button>
                <button class="btn-primary" onclick="submitProfileQuote('${postId}')">Quote</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#quote-content').focus();
}

async function submitProfileQuote(postId) {
    const content = document.getElementById('quote-content')?.value.trim();

    try {
        await API.post(`/posts/${postId}/share`, { share_type: 'quote', quote_content: content });
        document.getElementById('quote-modal')?.remove();
        showToast('Quote posted!');
    } catch (error) {
        console.error('Error creating quote:', error);
        showToast('Failed to create quote', true);
    }
}

// ============================================
// Share (Quote Post) Engagement Functions
// ============================================

async function toggleShareLike(shareId, button) {
    const isLiked = button.classList.contains('liked');
    const svg = button.querySelector('svg');
    const span = button.querySelector('span');
    const statsEl = button.closest('.profile-post-card, .profile-quote-card').querySelector('.profile-likes-count');

    try {
        if (isLiked) {
            await API.delete(`/posts/share/${shareId}/like`);
            button.classList.remove('liked');
            svg.setAttribute('fill', 'none');
            span.textContent = 'Like';
            if (statsEl) {
                const count = parseInt(statsEl.textContent) - 1;
                statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
            }
        } else {
            await API.post(`/posts/share/${shareId}/like`);
            button.classList.add('liked');
            svg.setAttribute('fill', 'currentColor');
            span.textContent = 'Liked';
            if (statsEl) {
                const count = parseInt(statsEl.textContent) + 1;
                statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
            }
        }
    } catch (error) {
        console.error('Error toggling share like:', error);
        showToast('Failed to update like', 'error');
    }
}

async function toggleShareSave(shareId, button) {
    const isSaved = button.classList.contains('saved');
    const svg = button.querySelector('svg');
    const span = button.querySelector('span');

    try {
        if (isSaved) {
            await API.delete(`/posts/share/${shareId}/save`);
            button.classList.remove('saved');
            svg.setAttribute('fill', 'none');
            span.textContent = 'Save';
            showToast('Quote post removed from saved', 'success');
        } else {
            await API.post(`/posts/share/${shareId}/save`);
            button.classList.add('saved');
            svg.setAttribute('fill', 'currentColor');
            span.textContent = 'Saved';
            showToast('Quote post saved!', 'success');
        }
    } catch (error) {
        console.error('Error toggling share save:', error);
        showToast('Failed to update save', 'error');
    }
}

async function toggleShareComments(shareId) {
    const section = document.getElementById(`share-comments-${shareId}`);
    if (!section) return;

    if (section.style.display === 'none') {
        await loadShareComments(shareId);
        section.style.display = 'block';
        const input = section.querySelector('.comment-input');
        if (input) input.focus();
    } else {
        section.style.display = 'none';
    }
}

async function loadShareComments(shareId) {
    try {
        const response = await API.get(`/posts/share/${shareId}/comments`);
        const listEl = document.querySelector(`#share-comments-${shareId} .comments-list`);
        if (!listEl) return;

        if (response.comments && response.comments.length > 0) {
            listEl.innerHTML = response.comments.map(comment => {
                const shareSubheader = buildCommentSubheader(comment.role, {
                    transfer: comment.transfer, position: comment.position, height: comment.height,
                    weight: comment.weight, eligibility: comment.eligibility, division: comment.division,
                    school: comment.team_name, grad_year: comment.grad_year, state: comment.state,
                    subheader: comment.subheader
                });
                const commentTimeAgo = formatTimeAgo(comment.created_at);
                let commentMetaLine = shareSubheader || '';
                return `
                <div class="comment" data-comment-id="${comment.id}">
                    <div class="comment-avatar" onclick="goToProfile('${comment.username || comment.user_id}', '${comment.role || 'player'}', '${comment.division || ''}', '${comment.user_id}', ${comment.transfer === 'y'})" style="cursor: pointer; border: 2px solid ${getRoleBorderColor(comment.role || 'player', comment.transfer === 'y', comment.division)}; color: ${getRoleBorderColor(comment.role || 'player', comment.transfer === 'y', comment.division)}; background: ${getRoleAvatarBg(comment.role || 'player', comment.transfer === 'y', comment.division)}">
                        ${comment.profile_image ?
                            `<img src="${comment.profile_image}" alt="">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
                        }
                    </div>
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-author" onclick="goToProfile('${comment.username || comment.user_id}', '${comment.role || 'player'}', '${comment.division || ''}', '${comment.user_id}', ${comment.transfer === 'y'})" style="cursor: pointer;">${comment.first_name} ${comment.last_name}${typeof getSchoolLogoHTML === 'function' && comment.division ? ' ' + getSchoolLogoHTML(comment.team_name, _assetsPath, 14) : ''}</span>
                            ${comment.username ? `<span class="comment-username" style="color: rgba(254,252,251,0.5); font-size: 12px; font-weight: 400;">@${comment.username}</span>` : ''}
                            <span class="comment-timestamp">${commentTimeAgo}</span>
                        </div>
                        <div class="comment-subheader">${commentMetaLine}</div>
                        <p>${formatPostContent(comment.content)}</p>
                        <div class="comment-actions">
                            <button class="comment-like-btn ${comment.user_liked ? 'liked' : ''}" onclick="event.stopPropagation(); likeShareComment('${comment.id}', this)">
                                <svg viewBox="0 0 24 24" fill="${comment.user_liked ? '#e74c3c' : 'none'}" stroke="${comment.user_liked ? '#e74c3c' : 'currentColor'}" stroke-width="2" width="14" height="14">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                </svg>
                                <span>${comment.likes_count || 0}</span>
                            </button>
                            ${comment.user_id === currentUserId ? `
                                <button class="comment-delete-btn" onclick="event.stopPropagation(); deleteShareComment('${shareId}', '${comment.id}')">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                </div>
            `}).join('');
        } else {
            listEl.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
        }
    } catch (error) {
        console.error('Error loading share comments:', error);
    }
}

async function addShareComment(shareId) {
    const input = document.getElementById(`share-comment-input-${shareId}`);
    const content = input?.value.trim();
    if (!content) return;

    try {
        await API.post(`/posts/share/${shareId}/comments`, { content });
        input.value = '';
        await loadShareComments(shareId);

        // Update comment count
        const statsEl = document.querySelector(`[data-share-id="${shareId}"] .profile-comments-count`);
        if (statsEl) {
            const count = parseInt(statsEl.textContent) + 1;
            statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
        }
    } catch (error) {
        console.error('Error adding share comment:', error);
        showToast('Failed to add comment', 'error');
    }
}

async function deleteShareComment(shareId, commentId) {
    try {
        await API.delete(`/posts/share/comments/${commentId}`);

        // Remove comment from DOM
        const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
        if (commentEl) commentEl.remove();

        // Update comment count
        const statsEl = document.querySelector(`[data-share-id="${shareId}"] .profile-comments-count`);
        if (statsEl) {
            const count = Math.max(0, parseInt(statsEl.textContent) - 1);
            statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
        }

        showToast('Comment deleted', 'success');
    } catch (error) {
        console.error('Error deleting share comment:', error);
        showToast('Failed to delete comment', 'error');
    }
}

async function likeShareComment(commentId, button) {
    const isLiked = button.classList.contains('liked');
    const svg = button.querySelector('svg');
    const countSpan = button.querySelector('span');

    try {
        if (isLiked) {
            await API.delete(`/posts/share/comments/${commentId}/like`);
            button.classList.remove('liked');
            if (svg) { svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); }
            if (countSpan) countSpan.textContent = Math.max(0, parseInt(countSpan.textContent) - 1);
        } else {
            await API.post(`/posts/share/comments/${commentId}/like`);
            button.classList.add('liked');
            if (svg) { svg.setAttribute('fill', '#e74c3c'); svg.setAttribute('stroke', '#e74c3c'); }
            if (countSpan) countSpan.textContent = parseInt(countSpan.textContent) + 1;
        }
    } catch (error) {
        console.error('Error liking share comment:', error);
    }
}

async function showShareLikes(shareId) {
    try {
        const response = await API.get(`/posts/share/${shareId}/likes`);
        const likes = response.likes || [];

        if (likes.length === 0) {
            showToast('No likes yet', 'info');
            return;
        }

        showLikesModal(likes, 'Quote Post Likes');
    } catch (error) {
        console.error('Error fetching share likes:', error);
        showToast('Failed to load likes', 'error');
    }
}

async function showPostShares(postId) {
    try {
        const data = await postsAPI.getShares(postId);

        if (!data.all || data.all.length === 0) {
            showToast('No shares yet', 'info');
            return;
        }

        // Remove existing modals
        document.querySelector('.shares-modal-overlay')?.remove();
        document.querySelector('.likes-modal-overlay')?.remove();

        const modal = document.createElement('div');
        modal.className = 'shares-modal-overlay';
        modal.innerHTML = `
            <div class="likes-modal">
                <div class="likes-modal-header">
                    <h3>Shares</h3>
                    <button class="likes-modal-close" onclick="this.closest('.shares-modal-overlay').remove()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="shares-tabs">
                    <button class="shares-tab active" data-type="all">
                        All <span class="shares-tab-count">${data.all.length}</span>
                    </button>
                    <button class="shares-tab" data-type="reposts">
                        Reposts <span class="shares-tab-count">${data.repost_count}</span>
                    </button>
                    <button class="shares-tab" data-type="quotes">
                        Quotes <span class="shares-tab-count">${data.quote_count}</span>
                    </button>
                </div>
                <div class="likes-modal-list" id="shares-list-content">
                    ${renderSharesList(data.all)}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Tab switching
        modal.querySelectorAll('.shares-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                modal.querySelectorAll('.shares-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const type = tab.dataset.type;
                let listToShow = data.all;
                if (type === 'reposts') listToShow = data.reposts;
                if (type === 'quotes') listToShow = data.quotes;
                document.getElementById('shares-list-content').innerHTML = renderSharesList(listToShow);
            });
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

    } catch (error) {
        console.error('Error fetching shares:', error);
        showToast('Failed to load shares', 'error');
    }
}

function renderSharesList(shares) {
    if (shares.length === 0) {
        return `<div class="likes-modal-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
            <p>No shares in this category</p>
        </div>`;
    }

    return shares.map(share => {
        const shareSub = buildCommentSubheader(share.role, {
            transfer: share.transfer, position: share.position, height: share.height,
            weight: share.weight, eligibility: share.eligibility, division: share.division,
            school: share.school, grad_year: share.grad_year, state: share.state,
            subheader: share.subheader
        });
        const imgUrl = share.profile_image_url || share.profile_image;
        const shareTypeLabel = share.share_type === 'quote' ? 'Quote' : 'Repost';
        return `
        <div class="likes-modal-item" onclick="goToProfile('${share.username || share.user_id}', '${share.role}', '${share.division || ''}', '${share.user_id}', ${share.transfer === 'y'}); this.closest('.shares-modal-overlay').remove();" style="cursor: pointer;">
            <div class="likes-modal-avatar" style="border: 2px solid ${getRoleBorderColor(share.role, share.transfer === 'y', share.division)}; color: ${getRoleBorderColor(share.role, share.transfer === 'y', share.division)}; background: ${getRoleAvatarBg(share.role, share.transfer === 'y', share.division)}">
                ${imgUrl ? `<img src="${imgUrl}" alt="${share.first_name}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}
            </div>
            <div class="likes-modal-info">
                <span class="likes-modal-name">${share.first_name || ''} ${share.last_name || ''}${typeof getSchoolLogoHTML === 'function' && share.division ? ' ' + getSchoolLogoHTML(share.school || share.team_name, _assetsPath, 14) : ''}</span>
                ${share.username ? `<span class="likes-modal-username" style="color: rgba(254,252,251,0.5); font-size: 12px; font-weight: 400;">@${share.username}</span>` : ''}
                ${shareSub ? `<span class="comment-subheader">${shareSub}</span>` : ''}
                <span class="shares-type-label" style="font-size: 0.7rem; opacity: 0.5;">${shareTypeLabel}</span>
            </div>
        </div>
    `}).join('');
}

function showLikesModal(likes, title) {
    // Remove existing modals
    document.querySelector('.likes-modal-overlay')?.remove();
    document.querySelector('.shares-modal-overlay')?.remove();

    const modal = document.createElement('div');
    modal.className = 'likes-modal-overlay';
    modal.innerHTML = `
        <div class="likes-modal">
            <div class="likes-modal-header">
                <h3>${title}</h3>
                <button class="likes-modal-close" onclick="this.closest('.likes-modal-overlay').remove()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="likes-modal-list">
                ${likes.map(like => {
                    const likeSub = buildCommentSubheader(like.role, {
                        transfer: like.transfer, position: like.position, height: like.height,
                        weight: like.weight, eligibility: like.eligibility, division: like.division,
                        school: like.school, grad_year: like.grad_year, state: like.state,
                        subheader: like.subheader
                    });
                    const imgUrl = like.profile_image_url || like.profile_image;
                    return `
                    <div class="likes-modal-item" onclick="goToProfile('${like.username || like.user_id}', '${like.role || 'player'}', '${like.division || ''}', '${like.user_id}', ${like.transfer === 'y'})" style="cursor: pointer;">
                        <div class="likes-modal-avatar" style="border: 2px solid ${getRoleBorderColor(like.role, like.transfer === 'y', like.division)}; color: ${getRoleBorderColor(like.role, like.transfer === 'y', like.division)}; background: ${getRoleAvatarBg(like.role, like.transfer === 'y', like.division)}">
                            ${imgUrl ?
                                `<img src="${imgUrl}" alt="">` :
                                `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
                            }
                        </div>
                        <div class="likes-modal-info">
                            <span class="likes-modal-name">${like.first_name} ${like.last_name}${typeof getSchoolLogoHTML === 'function' && like.division ? ' ' + getSchoolLogoHTML(like.school || like.team_name, _assetsPath, 14) : ''}</span>
                            ${like.username ? `<span class="likes-modal-username" style="color: rgba(254,252,251,0.5); font-size: 12px; font-weight: 400;">@${like.username}</span>` : ''}
                            ${likeSub ? `<span class="comment-subheader">${likeSub}</span>` : ''}
                        </div>
                    </div>
                `}).join('')}
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
}

// Edit quote post content
async function editQuote(shareId) {
    // Close menu
    const menu = document.querySelector('.profile-post-dropdown-menu');
    if (menu) menu.remove();

    try {
        // Fetch the current quote post data
        const response = await API.get(`/posts/share/${shareId}`);
        const share = response.share;

        if (!share) {
            showToast('Quote post not found', 'error');
            return;
        }

        // Initialize edit media state - use quote_media_urls (the quote's own media, not the original post's media)
        const existingMediaKeys = share.quote_media_urls_keys || [];
        const existingMediaType = share.quote_media_type || null;
        const signedUrls = share.quote_media_urls || share.signed_quote_media_urls || [];
        let currentMediaKeys = [...existingMediaKeys];
        let newMediaFiles = [];
        let newMediaPreviews = [];
        const maxMedia = 4;
        const hasMedia = existingMediaKeys.length > 0;

        // Helper to render media items with CSS classes
        const renderEditMediaItems = () => {
            let html = '';
            currentMediaKeys.forEach((key, index) => {
                const signedUrl = signedUrls[existingMediaKeys.indexOf(key)] || key;
                const isVideo = existingMediaType === 'video' || key.includes('video') || key.match(/\.(mp4|mov|webm)$/i);
                html += `
                    <div class="edit-media-item" data-type="existing" data-index="${index}">
                        ${isVideo ? `
                            <video src="${signedUrl}" muted></video>
                            <div class="media-type-badge">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                            </div>
                        ` : `
                            <img src="${signedUrl}" alt="Media">
                        `}
                        <button class="edit-media-remove-btn" data-type="existing" data-index="${index}" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                `;
            });
            newMediaPreviews.forEach((preview, index) => {
                html += `
                    <div class="edit-media-item" data-type="new" data-index="${index}">
                        ${preview.type === 'video' ? `
                            <video src="${preview.url}" muted></video>
                            <div class="media-type-badge">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                            </div>
                        ` : `
                            <img src="${preview.url}" alt="Preview">
                        `}
                        <button class="edit-media-remove-btn" data-type="new" data-index="${index}" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                `;
            });
            return html;
        };

        // Create edit modal with CSS classes
        const modal = document.createElement('div');
        modal.className = 'feed-modal-overlay';
        modal.id = 'edit-quote-modal';
        modal.innerHTML = `
            <div class="feed-modal edit-modal ${hasMedia ? 'with-media' : ''}">
                <div class="feed-modal-header">
                    <h3>Edit Quote</h3>
                    <button class="feed-modal-close" onclick="document.getElementById('edit-quote-modal').remove()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="feed-modal-body">
                    <textarea id="edit-quote-textarea" class="edit-post-textarea" maxlength="300" placeholder="Add your comment...">${share.quote_content || ''}</textarea>

                    <div class="edit-modal-media-section">
                        <div class="edit-modal-media-header">
                            <div class="edit-modal-media-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                                <span>Media</span>
                                <span class="edit-modal-media-counter" id="edit-quote-media-counter">${existingMediaKeys.length}/${maxMedia}</span>
                            </div>
                            <label class="edit-modal-add-media-btn ${existingMediaKeys.length >= maxMedia ? 'disabled' : ''}" id="edit-quote-add-media-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Add
                                <input type="file" id="edit-quote-media-input" accept="image/*,video/*" multiple style="display: none;">
                            </label>
                        </div>
                        <div class="edit-modal-media-grid" id="edit-quote-media-grid">
                            ${renderEditMediaItems()}
                        </div>
                    </div>

                    <div class="edit-modal-actions">
                        <button class="edit-modal-btn edit-modal-btn-cancel" onclick="document.getElementById('edit-quote-modal').remove()">Cancel</button>
                        <button class="edit-modal-btn edit-modal-btn-save" id="save-quote-btn">Save</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        document.getElementById('edit-quote-textarea').focus();

        // Update modal class based on media presence
        const updateModalSize = () => {
            const modalEl = modal.querySelector('.feed-modal');
            if (currentMediaKeys.length > 0 || newMediaFiles.length > 0) {
                modalEl.classList.add('with-media');
            } else {
                modalEl.classList.remove('with-media');
            }
        };

        // Update media counter and button state
        const updateMediaCounter = () => {
            const totalCount = currentMediaKeys.length + newMediaFiles.length;
            const counter = document.getElementById('edit-quote-media-counter');
            const addBtn = document.getElementById('edit-quote-add-media-btn');

            if (counter) {
                counter.textContent = `${totalCount}/${maxMedia}`;
                counter.classList.toggle('at-max', totalCount >= maxMedia);
            }
            if (addBtn) {
                addBtn.classList.toggle('disabled', totalCount >= maxMedia);
            }
            updateModalSize();
        };

        // Re-render media grid
        const renderMediaGrid = () => {
            const grid = document.getElementById('edit-quote-media-grid');
            if (!grid) return;
            grid.innerHTML = renderEditMediaItems();
            updateMediaCounter();
        };

        // Handle remove button clicks
        modal.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.edit-media-remove-btn');
            if (removeBtn) {
                e.stopPropagation();
                const type = removeBtn.dataset.type;
                const index = parseInt(removeBtn.dataset.index);
                if (type === 'existing') {
                    currentMediaKeys.splice(index, 1);
                } else if (type === 'new') {
                    URL.revokeObjectURL(newMediaPreviews[index].url);
                    newMediaFiles.splice(index, 1);
                    newMediaPreviews.splice(index, 1);
                }
                renderMediaGrid();
            }
        });

        // Handle adding new media
        document.getElementById('edit-quote-media-input').addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            const totalCount = currentMediaKeys.length + newMediaFiles.length;
            const remaining = maxMedia - totalCount;

            if (remaining <= 0) {
                showToast(`Maximum ${maxMedia} media files allowed`, 'error');
                e.target.value = '';
                return;
            }

            const filesToAdd = files.slice(0, remaining);
            for (const file of filesToAdd) {
                const isVideo = file.type.startsWith('video/');
                const isImage = file.type.startsWith('image/');
                if (!isVideo && !isImage) continue;

                const previewUrl = URL.createObjectURL(file);
                newMediaFiles.push(file);
                newMediaPreviews.push({
                    url: previewUrl,
                    type: isVideo ? 'video' : 'image',
                    name: file.name
                });
            }
            renderMediaGrid();
            e.target.value = '';
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                newMediaPreviews.forEach(p => URL.revokeObjectURL(p.url));
                modal.remove();
            }
        });

        // Handle save
        document.getElementById('save-quote-btn').onclick = async () => {
            const newContent = document.getElementById('edit-quote-textarea').value.trim();
            const saveBtn = document.getElementById('save-quote-btn');

            try {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';

                let finalMediaUrls = [...currentMediaKeys];
                let finalMediaType = existingMediaType;

                // Upload new media if any
                if (newMediaFiles.length > 0) {
                    saveBtn.textContent = 'Uploading...';
                    try {
                        const uploadResult = await uploadAPI.uploadPostMedia(newMediaFiles);
                        if (uploadResult.media && uploadResult.media.length > 0) {
                            finalMediaUrls = [...finalMediaUrls, ...uploadResult.media.map(m => m.s3Key)];
                            finalMediaType = uploadResult.media_type;
                        } else if (uploadResult.s3Key) {
                            finalMediaUrls.push(uploadResult.s3Key);
                            finalMediaType = uploadResult.media_type;
                        }
                    } catch (uploadError) {
                        console.error('Media upload failed:', uploadError);
                        showToast('Failed to upload media', 'error');
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save';
                        return;
                    }
                }

                if (finalMediaUrls.length === 0) {
                    finalMediaUrls = null;
                    finalMediaType = null;
                }

                await API.put(`/posts/share/${shareId}`, {
                    quote_content: newContent,
                    media_urls: finalMediaUrls,
                    media_type: finalMediaType
                });

                // Cleanup blob URLs
                newMediaPreviews.forEach(p => URL.revokeObjectURL(p.url));

                // Fetch updated share data to get signed URLs for media
                const updatedResponse = await API.get(`/posts/share/${shareId}`);
                const updatedShare = updatedResponse.share;

                // Update the quote post in the DOM
                const quoteCard = document.querySelector(`[data-share-id="${shareId}"]`);
                if (quoteCard) {
                    // Update content text
                    const contentEl = quoteCard.querySelector('.profile-post-content');
                    if (contentEl) {
                        contentEl.innerHTML = formatPostContent(newContent);
                    }

                    // Update media - find or create media container
                    const existingMediaGrid = quoteCard.querySelector('.post-media-grid');
                    if (existingMediaGrid) {
                        existingMediaGrid.remove();
                    }

                    // Add new media if present
                    if (updatedShare.quote_media_urls && updatedShare.quote_media_urls.length > 0) {
                        const newMediaHtml = buildMediaGridHTML(updatedShare.quote_media_urls, updatedShare.quote_media_type);
                        const contentContainer = quoteCard.querySelector('.profile-post-content');
                        if (contentContainer) {
                            contentContainer.insertAdjacentHTML('afterend', newMediaHtml);
                        }
                    }
                }

                modal.remove();
                showToast('Quote updated', 'success');
            } catch (error) {
                console.error('Error updating quote:', error);
                showToast('Failed to update quote', 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save';
            }
        };
    } catch (error) {
        console.error('Error fetching quote post:', error);
        showToast('Failed to load quote post', 'error');
    }
}

// Report quote post
async function reportQuote(shareId) {
    const menu = document.querySelector('.quote-dropdown-menu');
    if (menu) menu.remove();
    if (typeof window.openReportModal !== 'function') {
        showToast('Report unavailable. Please refresh and try again.', 'error');
        return;
    }
    const submitted = await window.openReportModal({
        contentType: 'share',
        contentId: shareId,
        contentLabel: 'Quote Post'
    });
    if (!submitted) return;
    const card = document.querySelector(`.post-card[data-share-id="${shareId}"]`);
    if (card && typeof window.fadeAndReplaceWithReportedChip === 'function') {
        window.fadeAndReplaceWithReportedChip(card);
    }
}

// Navigate to user profile (cross-folder navigation)
function goToProfile(identifier, role, collegeDivision, userId, isTransfer) {
    // Check if clicking on own profile - just go to my-profile.html
    if (userId === currentUserId) {
        // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
        // (bare/relative targets silently no-op there). new URL(rel, location.href)
        // correctly preserves the /frontend prefix on web and its absence in-app.
        window.location.href = new URL('my-profile.html', window.location.href).href;
        return;
    }

    const folder = getProfileFolder({ role, is_transfer_player: isTransfer, college_division: collegeDivision });

    // Navigate using username if available, otherwise user ID
    const param = identifier && !identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
        ? `username=${identifier}`
        : `id=${userId}`;

    const navFrom = new URLSearchParams(window.location.search).get('from') || 'profile';
    window.location.href = new URL(`../../${folder}/tabs/my-profile.html?${param}&from=${navFrom}`, window.location.href).href;
}

// ==================== FEED-IDENTICAL POST RENDERING ====================
//
// The Posts and Likes tabs render through the SAME feed.js templates the mainpage
// feed uses, so a post is pixel-identical in both places. Everything on the card
// (like, comment, share, likes/shares modals, media slideshow, profile links)
// comes from FeedManager, so there is one implementation to keep correct.
//
// The catch: the two endpoints disagree on field names for SHARES.
//
//                       GET /posts/feed/discover     GET /posts/user/:id  and  /likes
//   author_*            the ORIGINAL post author     the REPOSTER / QUOTER
//   reposter_*          the reposter / quoter        (absent)
//   original_author_*   (absent)                     the ORIGINAL post author
//
// feed.js is written against the discover shape. Handing it a profile share row
// unchanged renders the reposter as the original author and blanks the
// "X reposted" line — that is the header/subheader/avatar bug this replaces.
// normalizeProfilePostForFeed() translates share rows; plain posts already match
// on both endpoints and pass straight through.
//
// The remap lives here rather than in the SQL aliases on purpose: this frontend is
// bundled into the iOS app, so changing the API response shape would ship to web
// instantly but not to installed builds, breaking the profile tab on any older app
// until users updated. Keeping the contract fixed lets backend and app deploy
// independently.

// Identity columns that carry an author_/reposter_/original_author_ prefix.
// user_id is handled separately because its unprefixed form is also meaningful.
const _SHARE_IDENTITY_FIELDS = [
    'role', 'username', 'first_name', 'last_name', 'image', 'position', 'school',
    'grad_year', 'star_rating', 'division', 'transfer', 'height', 'weight',
    'eligibility', 'state', 'verified', 'subheader'
];

function normalizeProfilePostForFeed(post) {
    if (!post || (!post.is_repost && !post.is_quote)) return post;

    const p = { ...post };

    // Read every value off the untouched `post` so the two swaps cannot clobber
    // each other.
    _SHARE_IDENTITY_FIELDS.forEach(f => {
        p[`reposter_${f}`] = post[`author_${f}`];   // profile author_*  -> feed reposter_*
        p[`author_${f}`] = post[`original_author_${f}`]; // profile original_author_* -> feed author_*
    });
    p.reposter_user_id = post.author_user_id || post.user_id;
    p.author_user_id = post.original_author_user_id;
    // feed.js reads post.user_id as the ORIGINAL author on share cards.
    p.user_id = post.original_author_user_id || post.user_id;

    // Reposts: the profile query leaves the body columns NULL and puts the
    // original's body in original_*; the discover query populates both.
    if (post.is_repost) {
        p.content = post.content != null ? post.content : post.original_content;
        p.media_urls = post.media_urls || post.original_media_urls;
        p.media_type = post.media_type || post.original_media_type;
    }

    // The Likes endpoint returns no sort_date, and the quote template times the
    // quoter's line off it — without this it renders "Invalid Date".
    p.sort_date = post.sort_date || post.created_at;

    return p;
}

// One FeedManager for the page, assigned to the global `feedManager` because the
// inline onclick handlers inside the feed templates call it by that name.
function getProfileFeedManager() {
    if (typeof FeedManager === 'undefined') return null;   // feed.js failed to load
    if (window.feedManager) return window.feedManager;

    // skipInit: no feed fetch, no new-posts polling, no infinite scroll.
    const fm = new FeedManager(true);
    fm.currentUserId = currentUserId;
    // Left null so saveFeedStateForReturn() no-ops: the feed's scroll-restore
    // snapshot is keyed to the mainpage and must not fire from the profile.
    fm.feedContainer = null;

    // A post opened from the profile must come back to the profile, so post-view
    // gets ref=profile instead of the feed's ref=feed. Keeps the same 4-arg shape as
    // FeedManager.navigateToPostView so the iOS comment routing can pass
    // { focusComment: true } through from the Comment button.
    fm.navigateToPostView = function (postId, event, shareId = null, opts = {}) {
        if (!postId && !shareId) return;
        const qs = shareId ? `share=${shareId}` : `id=${postId}`;
        const focusParam = opts.focusComment ? '&focus=comment' : '';
        window.location.href = new URL(`post-view.html?${qs}&ref=profile${focusParam}`, window.location.href).href;
    };

    // No quotePost override: FeedManager.quotePost feature-detects the inline
    // composer and falls back to its own full-screen quote modal, which is what
    // these pages (and the iOS app) need. One composer for every surface.

    // Own posts get the profile menu (adds Unpin, which the feed menu lacks).
    // Everyone else's posts keep the feed menu (Report / Block).
    const feedShowPostMenu = fm.showPostMenu.bind(fm);
    fm.showPostMenu = function (postId, isOwner, event) {
        if (!isOwner) return feedShowPostMenu(postId, isOwner, event);
        event.stopPropagation();
        const card = event.target.closest('.post-card');
        showProfilePostMenu(postId, card?.dataset.isPinned === 'true', event);
    };

    window.feedManager = fm;
    return fm;
}

// Pinning is profile-only, so it is layered onto the feed card rather than baked
// into the shared template. The badge goes INSIDE the card (the old markup made it
// a sibling, which is why deletes had to hunt for previousElementSibling).
function decorateProfilePostCard(el, rawPost) {
    if (!el) return el;
    el.dataset.isPinned = rawPost.is_pinned ? 'true' : 'false';
    if (!rawPost.is_pinned) return el;

    el.classList.add('pinned');
    const badge = document.createElement('div');
    badge.className = 'profile-post-pinned-badge';
    badge.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <line x1="12" y1="17" x2="12" y2="22"></line>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
        </svg>
        <span>Pinned</span>`;
    el.insertBefore(badge, el.firstChild);
    return el;
}

// Append posts to a container using the feed templates. Shared by Posts + Likes.
function renderProfileFeedCards(container, posts) {
    const fm = getProfileFeedManager();
    if (!fm) {
        console.error('feed.js did not load — cannot render profile posts');
        container.innerHTML = `
            <div class="profile-posts-error">
                <p>Failed to load posts</p>
            </div>`;
        return;
    }

    posts.forEach(rawPost => {
        const post = normalizeProfilePostForFeed(rawPost);
        let el;
        if (post.is_quote) {
            el = fm.createFeedQuotePostElement(post);
        } else if (post.is_repost) {
            el = fm.createFeedRepostElement(post);
        } else {
            el = fm.createPostElement(post);
        }
        container.appendChild(decorateProfilePostCard(el, rawPost));
    });
}

// Load profile posts
async function loadProfilePosts(loadMore = false) {
    const container = document.getElementById('profilePostsContainer');
    const loadMoreContainer = document.getElementById('loadMorePostsContainer');
    const loadMoreBtn = document.getElementById('loadMorePostsBtn');

    if (!container) return;

    // Determine which user's posts to load
    const userId = viewingUserId || currentUserId;
    if (!userId) return;

    if (!loadMore) {
        container.innerHTML = `
            <div class="profile-posts-loading">
                <div class="loading-spinner"></div>
                <span>Loading posts...</span>
            </div>
        `;
        profilePostsOffset = 0;
    } else if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
    }

    try {
        const response = await API.get(`/posts/user/${userId}?limit=${POSTS_PER_PAGE}&offset=${profilePostsOffset}`);
        const posts = response.posts || [];

        if (!loadMore) {
            container.innerHTML = '';
        }

        if (posts.length === 0 && profilePostsOffset === 0) {
            // No posts found - keep default placeholder
            container.innerHTML = `
                <div class="profile-posts-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <p>No posts yet</p>
                </div>
            `;
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        } else {
            // Render posts (including reposts and quote posts)
            // School logos are looked up synchronously inside the feed templates,
            // so the JSON has to be in memory before the first render (lesson 51).
            if (typeof ensureSchoolLogosLoaded === 'function') {
                await ensureSchoolLogosLoaded('../../assets');
            }

            // Rendered with the mainpage feed templates (reposts and quote posts
            // included) so the cards are identical to the feed.
            renderProfileFeedCards(container, posts);

            profilePostsOffset += posts.length;
            profilePostsLoaded = true;

            // Show/hide load more button
            if (loadMoreContainer) {
                loadMoreContainer.style.display = posts.length >= POSTS_PER_PAGE ? 'flex' : 'none';
            }
        }
    } catch (error) {
        console.error('Error loading posts:', error);
        if (!loadMore) {
            container.innerHTML = `
                <div class="profile-posts-error">
                    <p>Failed to load posts</p>
                    <button onclick="loadProfilePosts()" class="btn-retry">Retry</button>
                </div>
            `;
        }
    } finally {
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'See More';
        }
    }
}

// Load profile replies
async function loadProfileReplies(loadMore = false) {
    const container = document.getElementById('profileRepliesContainer');
    const loadMoreContainer = document.getElementById('loadMoreRepliesContainer');
    const loadMoreBtn = document.getElementById('loadMoreRepliesBtn');

    if (!container) return;

    // Determine which user's replies to load
    const userId = viewingUserId || currentUserId;
    if (!userId) return;

    if (!loadMore) {
        container.innerHTML = `
            <div class="profile-replies-loading">
                <div class="loading-spinner"></div>
                <span>Loading replies...</span>
            </div>
        `;
        profileRepliesOffset = 0;
    } else if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
    }

    try {
        const response = await API.get(`/posts/user/${userId}/replies?limit=${REPLIES_PER_PAGE}&offset=${profileRepliesOffset}`);
        const replies = response.replies || [];

        if (!loadMore) {
            container.innerHTML = '';
        }

        if (replies.length === 0 && profileRepliesOffset === 0) {
            // No replies found - keep default placeholder
            container.innerHTML = `
                <div class="profile-replies-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <p>No replies yet</p>
                </div>
            `;
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        } else {
            // Render replies
            replies.forEach(reply => {
                container.innerHTML += createProfileReplyElement(reply);
            });

            profileRepliesOffset += replies.length;
            profileRepliesLoaded = true;

            // Show/hide load more button
            if (loadMoreContainer) {
                loadMoreContainer.style.display = replies.length >= REPLIES_PER_PAGE ? 'flex' : 'none';
            }
        }
    } catch (error) {
        console.error('Error loading replies:', error);
        if (!loadMore) {
            container.innerHTML = `
                <div class="profile-replies-error">
                    <p>Failed to load replies</p>
                    <button onclick="loadProfileReplies()" class="btn-retry">Retry</button>
                </div>
            `;
        }
    } finally {
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'See More';
        }
    }
}

// Load profile liked posts
async function loadProfileLikes(loadMore = false) {
    const container = document.getElementById('profileLikesContainer');
    const loadMoreContainer = document.getElementById('loadMoreLikesContainer');
    const loadMoreBtn = document.getElementById('loadMoreLikesBtn');

    if (!container) return;

    // Determine which user's liked posts to load
    const userId = viewingUserId || currentUserId;
    if (!userId) return;

    if (!loadMore) {
        container.innerHTML = `
            <div class="profile-likes-loading">
                <div class="loading-spinner"></div>
                <span>Loading liked posts...</span>
            </div>
        `;
        profileLikesOffset = 0;
    } else if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
        loadMoreBtn.textContent = 'Loading...';
    }

    try {
        const response = await API.get(`/posts/user/${userId}/likes?limit=${LIKES_PER_PAGE}&offset=${profileLikesOffset}`);
        const posts = response.posts || [];

        if (!loadMore) {
            container.innerHTML = '';
        }

        if (posts.length === 0 && profileLikesOffset === 0) {
            // No liked posts found
            container.innerHTML = `
                <div class="profile-likes-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <p>No liked posts yet</p>
                </div>
            `;
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        } else {
            // Render liked posts (including liked quote posts)
            if (typeof ensureSchoolLogosLoaded === 'function') {
                await ensureSchoolLogosLoaded('../../assets');
            }

            // Same feed templates as the Posts tab. The liked-posts endpoint has no
            // is_repost column (only regular posts and quote posts can be liked), so
            // the dispatch inside renderProfileFeedCards resolves to the plain-post
            // and quote-post templates.
            renderProfileFeedCards(container, posts);

            profileLikesOffset += posts.length;
            profileLikesLoaded = true;

            // Show/hide load more button
            if (loadMoreContainer) {
                loadMoreContainer.style.display = posts.length >= LIKES_PER_PAGE ? 'flex' : 'none';
            }
        }
    } catch (error) {
        console.error('Error loading liked posts:', error);
        if (!loadMore) {
            container.innerHTML = `
                <div class="profile-likes-error">
                    <p>Failed to load liked posts</p>
                    <button onclick="loadProfileLikes()" class="btn-retry">Retry</button>
                </div>
            `;
        }
    } finally {
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.textContent = 'See More';
        }
    }
}

// Create liked post card HTML (similar to regular post but without edit options for other users' posts)
function createProfileLikedPostElement(post) {
    const authorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
    const metaInfo = buildPostMetaInfo(post);
    const isOwnPost = post.user_id === currentUserId;
    const isLiked = post.user_liked !== false; // For liked posts, default to true since user liked it
    const isSaved = post.user_saved || false;
    const isReposted = post.user_reposted || false;

    // Build media HTML — shared grid renderer, so liked posts behave like the
    // profile's own posts: click any image or video to open the full-size viewer.
    let mediaHtml = '';
    if (post.media_urls && post.media_urls.length > 0) {
        mediaHtml = buildMediaGridHTML(post.media_urls, post.media_type);
    }

    // Post options menu button (only for own posts)
    const optionsButton = isOwnPost ? `
        <button class="profile-post-more-btn" onclick="event.stopPropagation(); showProfilePostMenu('${post.id}', ${post.is_pinned || false}, event)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="19" cy="12" r="1"></circle>
                <circle cx="5" cy="12" r="1"></circle>
            </svg>
        </button>
    ` : '';

    return `
        <article class="profile-post-card" data-post-id="${post.id}" data-author-user-id="${post.author_user_id || post.user_id || ''}" onclick="navigateToPost('${post.id}')">
            <div class="profile-post-header">
                <div class="profile-post-avatar" style="border: 2px solid ${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}; color: ${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}; background: ${getRoleAvatarBg(post.author_role, post.author_transfer === 'y', post.author_division)}">
                    ${post.author_image
                        ? `<img src="${post.author_image}" alt="${authorName}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>`
                    }
                </div>
                <div class="profile-post-info">
                    <div class="profile-post-author">
                        ${authorName}${typeof getSchoolLogoHTML === 'function' && post.author_division ? getSchoolLogoHTML(post.author_school, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 16) : ''}
                        ${post.author_username ? `<span class="profile-post-handle">@${post.author_username}</span>` : ''}
                        <span class="profile-post-timestamp">${formatTimeAgo(post.created_at)}</span>
                        ${optionsButton}
                    </div>
                    <div class="profile-post-meta ${post.author_role === 'coach' ? 'coach-meta' : (post.author_role === 'other' ? 'other-meta' : (post.author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">${metaInfo}</div>
                </div>
            </div>
            <div class="profile-post-content">
                <p>${formatPostContent(post.content)}</p>
                ${mediaHtml}
            </div>
            <div class="profile-post-stats" onclick="event.stopPropagation();">
                <span class="profile-likes-count" onclick="showPostLikes('${post.id}')" style="cursor: pointer;">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="profile-comments-count" onclick="togglePostComments('${post.id}')" style="cursor: pointer;">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="profile-shares-count" onclick="event.stopPropagation(); showPostShares('${post.id}')" style="cursor: pointer;">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="profile-post-actions" onclick="event.stopPropagation();">
                <button class="profile-action-btn ${isLiked ? 'liked' : ''}" onclick="togglePostLike('${post.id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="profile-action-btn" onclick="togglePostComments('${post.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
<!-- Save button commented out (feature paused, kept for future use)
                <button class="profile-action-btn ${isSaved ? 'saved' : ''}" onclick="togglePostSave('${post.id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                -->
                <button class="profile-action-btn ${isReposted ? 'reposted' : ''}" onclick="profileSharePost('${post.id}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span>Share</span>
                </button>
            </div>
        </article>
    `;
}

// Create liked quote post card HTML (for quote posts the user has liked)
function createProfileLikedQuotePostElement(post) {
    const quoterId = post.author_user_id || post.user_id;
    const quoterName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
    const quoterMetaInfo = buildPostMetaInfo(post);
    const originalAuthorName = `${post.original_author_first_name || ''} ${post.original_author_last_name || ''}`.trim() || 'Unknown User';
    const originalTimeAgo = formatTimeAgo(post.original_created_at);
    const quoteTimeAgo = formatTimeAgo(post.created_at);
    const originalPostId = post.original_post_id || post.id;
    const isLiked = post.user_liked !== false;
    const isSaved = post.user_saved || false;
    const isReposted = post.user_reposted || false;

    // Build media HTML for original post using grid layout
    let originalMediaHtml = '';
    if (post.original_media_urls && post.original_media_urls.length > 0) {
        const urls = post.original_media_urls;
        const mediaCount = Math.min(urls.length, 4);
        const isVideoUrl = (url) => {
            if (post.original_media_type === 'video') return true;
            return url && url.toLowerCase().match(/\.(mp4|mov|avi|webm|m4v)(\?|#|$)/);
        };

        let gridCells = '';
        for (let i = 0; i < mediaCount; i++) {
            const url = urls[i];
            const isVideo = isVideoUrl(url);
            const videoIndicator = isVideo ? `
                <div class="video-indicator">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                </div>
            ` : '';

            gridCells += `
                <div class="quoted-media-item" onclick="event.stopPropagation(); openProfileMediaSlideshowFromElement(this);">
                    ${isVideo ?
                        `<video src="${url}#t=0.1" muted playsinline preload="metadata"></video>` :
                        `<img src="${url}" alt="Post media ${i + 1}">`
                    }
                    ${videoIndicator}
                </div>
            `;
        }

        originalMediaHtml = `<div class="quoted-post-media media-count-${mediaCount}">${gridCells}</div>`;
    }

    // Build media HTML for the quote post's own media
    const quoteMediaHtml = buildMediaGridHTML(post.quote_media_urls, post.quote_media_type);

    return `
        <article class="profile-post-card profile-quote-card" data-post-id="${originalPostId}" data-share-id="${post.share_id}" data-author-user-id="${post.author_user_id || post.user_id || ''}" onclick="navigateToQuotePost('${post.share_id}')" style="cursor: pointer;">
            <div class="profile-post-header">
                <div class="profile-post-avatar" onclick="event.stopPropagation(); goToProfile('${post.author_username || quoterId}', '${post.author_role || 'player'}', '${post.author_division || ''}', '${quoterId}', ${post.author_transfer === 'y'})" style="cursor: pointer; border: 2px solid ${getRoleBorderColor(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}; color: ${getRoleBorderColor(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}; background: ${getRoleAvatarBg(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}">
                    ${post.author_image
                        ? `<img src="${post.author_image}" alt="${quoterName}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>`
                    }
                </div>
                <div class="profile-post-info">
                    <div class="profile-post-author" onclick="event.stopPropagation(); goToProfile('${post.author_username || quoterId}', '${post.author_role || 'player'}', '${post.author_division || ''}', '${quoterId}', ${post.author_transfer === 'y'})" style="cursor: pointer;">
                        ${quoterName}${typeof getSchoolLogoHTML === 'function' && post.author_division ? getSchoolLogoHTML(post.author_school, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 16) : ''}
                        ${post.author_username ? `<span class="profile-post-handle">@${post.author_username}</span>` : ''}
                        <span class="profile-post-timestamp">${quoteTimeAgo}</span>
                    </div>
                    <div class="profile-post-meta ${post.author_role === 'coach' ? 'coach-meta' : (post.author_role === 'other' ? 'other-meta' : (post.author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">${quoterMetaInfo}</div>
                </div>
            </div>
            <div class="profile-post-content" onclick="navigateToQuotePost('${post.share_id}')" style="cursor: pointer;">
                <p>${formatPostContent(post.quote_content || '')}</p>
            </div>
            ${quoteMediaHtml ? `<div onclick="event.stopPropagation();">${quoteMediaHtml}</div>` : ''}
            <!-- Embedded original post -->
            <div class="profile-quote-embedded" onclick="event.stopPropagation(); navigateToPost('${originalPostId}')">
                <div class="quote-embedded-header">
                    <div class="quote-embedded-avatar" onclick="event.stopPropagation(); goToProfile('${post.original_author_username || post.original_author_user_id}', '${post.original_author_role || 'player'}', '${post.original_author_division || ''}', '${post.original_author_user_id}', ${post.original_author_transfer === 'y'})" style="cursor: pointer;">
                        ${post.original_author_image
                            ? `<img src="${post.original_author_image}" alt="${originalAuthorName}">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>`
                        }
                    </div>
                    <div class="quote-embedded-info">
                        <span class="quote-embedded-author">${originalAuthorName}</span>
                        <span class="quote-embedded-time">${originalTimeAgo}</span>
                    </div>
                </div>
                <div class="quote-embedded-content">
                    <p>${formatPostContent(post.original_content || '')}</p>
                    ${originalMediaHtml}
                </div>
            </div>
            <div class="profile-post-stats">
                <span class="profile-likes-count" onclick="event.stopPropagation(); showShareLikes('${post.share_id}')" style="cursor: pointer;">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="profile-comments-count" onclick="event.stopPropagation(); toggleShareComments('${post.share_id}')" style="cursor: pointer;">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="profile-shares-count" onclick="event.stopPropagation(); showPostShares('${post.original_post_id || post.id}')" style="cursor: pointer;">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="profile-post-actions">
                <button class="profile-action-btn ${isLiked ? 'liked' : ''}" onclick="event.stopPropagation(); toggleShareLike('${post.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="profile-action-btn" onclick="event.stopPropagation(); toggleShareComments('${post.share_id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="profile-action-btn ${isSaved ? 'saved' : ''}" onclick="event.stopPropagation(); toggleShareSave('${post.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                <button class="profile-action-btn ${isReposted ? 'reposted' : ''}" onclick="event.stopPropagation(); profileSharePost('${originalPostId}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span>${isReposted ? 'Shared' : 'Share'}</span>
                </button>
            </div>
            <div class="profile-comments-section" id="share-comments-${post.share_id}" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-container">
                    <input type="text" placeholder="Write a comment..." class="comment-input" maxlength="300" id="share-comment-input-${post.share_id}" onkeypress="if(event.key==='Enter') addShareComment('${post.share_id}')">
                    <button onclick="addShareComment('${post.share_id}')">Post</button>
                </div>
            </div>
        </article>
    `;
}

// Setup load more buttons
document.addEventListener('DOMContentLoaded', () => {
    const loadMorePostsBtn = document.getElementById('loadMorePostsBtn');
    const loadMoreRepliesBtn = document.getElementById('loadMoreRepliesBtn');
    const loadMoreLikesBtn = document.getElementById('loadMoreLikesBtn');

    if (loadMorePostsBtn) {
        loadMorePostsBtn.addEventListener('click', () => loadProfilePosts(true));
    }

    if (loadMoreRepliesBtn) {
        loadMoreRepliesBtn.addEventListener('click', () => loadProfileReplies(true));
    }

    if (loadMoreLikesBtn) {
        loadMoreLikesBtn.addEventListener('click', () => loadProfileLikes(true));
    }
});

// ==================== POST OPTIONS MENU ====================

// Show post options dropdown menu
function showProfilePostMenu(postId, isPinned, event) {
    event.stopPropagation();

    // Remove existing menu
    const existing = document.querySelector('.profile-post-dropdown-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'profile-post-dropdown-menu';
    menu.innerHTML = `
        <div class="dropdown-item" onclick="event.stopPropagation(); feedManager.editPost('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
            Edit Post
        </div>
        <div class="dropdown-item" onclick="event.stopPropagation(); ${isPinned ? `unpinProfilePost('${postId}')` : `pinProfilePost('${postId}')`}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="17" x2="12" y2="22"></line>
                <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
            </svg>
            ${isPinned ? 'Unpin Post' : 'Pin Post'}
        </div>
        <div class="dropdown-item dropdown-item-danger" onclick="event.stopPropagation(); deleteProfilePost('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Delete Post
        </div>
    `;

    document.body.appendChild(menu);

    // Position menu
    // Posts/Likes cards are feed cards (.post-more-btn); the selector keeps
    // .profile-post-more-btn for any card still on the old markup.
    const btn = event.target.closest('.post-more-btn, .profile-post-more-btn');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    menu.style.top = rect.bottom + 5 + 'px';
    menu.style.right = window.innerWidth - rect.right + 'px';

    // Close on outside click or scroll
    setTimeout(() => {
        function closeMenu() {
            menu.remove();
            document.removeEventListener('click', closeMenu);
            window.removeEventListener('scroll', closeMenu, true);
        }
        document.addEventListener('click', closeMenu);
        window.addEventListener('scroll', closeMenu, true);
    }, 0);
}

// Edit post
async function editProfilePost(postId) {
    // Close dropdown menu
    document.querySelector('.profile-post-dropdown-menu')?.remove();

    try {
        // Fetch the current post data to get media info
        const response = await API.get(`/posts/${postId}`);
        const post = response.post;

        if (!post) {
            showToast('Post not found', 'error');
            return;
        }

        // Initialize edit media state
        const existingMediaKeys = post.media_urls_keys || [];
        const existingMediaType = post.media_type || null;
        const signedUrls = post.media_urls || post.signed_media_urls || [];
        let currentMediaKeys = [...existingMediaKeys];
        let newMediaFiles = [];
        let newMediaPreviews = [];
        const maxMedia = 4;
        const hasMedia = existingMediaKeys.length > 0;

        // Helper to render media items with CSS classes
        const renderEditMediaItems = () => {
            let html = '';
            currentMediaKeys.forEach((key, index) => {
                const signedUrl = signedUrls[existingMediaKeys.indexOf(key)] || key;
                const isVideo = existingMediaType === 'video' || key.includes('video') || key.match(/\.(mp4|mov|webm)$/i);
                html += `
                    <div class="edit-media-item" data-type="existing" data-index="${index}">
                        ${isVideo ? `
                            <video src="${signedUrl}" muted></video>
                            <div class="media-type-badge">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                            </div>
                        ` : `
                            <img src="${signedUrl}" alt="Media">
                        `}
                        <button class="edit-media-remove-btn" data-type="existing" data-index="${index}" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                `;
            });
            newMediaPreviews.forEach((preview, index) => {
                html += `
                    <div class="edit-media-item" data-type="new" data-index="${index}">
                        ${preview.type === 'video' ? `
                            <video src="${preview.url}" muted></video>
                            <div class="media-type-badge">
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                                </svg>
                            </div>
                        ` : `
                            <img src="${preview.url}" alt="Preview">
                        `}
                        <button class="edit-media-remove-btn" data-type="new" data-index="${index}" title="Remove">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                `;
            });
            return html;
        };

        // Create edit modal with CSS classes
        const modal = document.createElement('div');
        modal.className = 'feed-modal-overlay';
        modal.id = 'edit-profile-post-modal';
        modal.innerHTML = `
            <div class="feed-modal edit-modal ${hasMedia ? 'with-media' : ''}">
                <div class="feed-modal-header">
                    <h3>Edit Post</h3>
                    <button class="feed-modal-close" onclick="document.getElementById('edit-profile-post-modal').remove()">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="feed-modal-body">
                    <textarea id="edit-profile-post-content" class="edit-post-textarea" maxlength="300" placeholder="What's on your mind?">${escapeHtml(post.content || '')}</textarea>

                    <div class="edit-modal-media-section">
                        <div class="edit-modal-media-header">
                            <div class="edit-modal-media-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                                <span>Media</span>
                                <span class="edit-modal-media-counter" id="edit-post-media-counter">${existingMediaKeys.length}/${maxMedia}</span>
                            </div>
                            <label class="edit-modal-add-media-btn ${existingMediaKeys.length >= maxMedia ? 'disabled' : ''}" id="edit-post-add-media-btn">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Add
                                <input type="file" id="edit-post-media-input" accept="image/*,video/*" multiple style="display: none;">
                            </label>
                        </div>
                        <div class="edit-modal-media-grid" id="edit-post-media-grid">
                            ${renderEditMediaItems()}
                        </div>
                    </div>

                    <div class="edit-modal-actions">
                        <button class="edit-modal-btn edit-modal-btn-cancel" onclick="document.getElementById('edit-profile-post-modal').remove()">Cancel</button>
                        <button class="edit-modal-btn edit-modal-btn-save" id="save-edit-btn">Save Changes</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Focus on textarea
        setTimeout(() => {
            const textarea = document.getElementById('edit-profile-post-content');
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }, 100);

        // Update modal class based on media presence
        const updateModalSize = () => {
            const modalEl = modal.querySelector('.feed-modal');
            if (currentMediaKeys.length > 0 || newMediaFiles.length > 0) {
                modalEl.classList.add('with-media');
            } else {
                modalEl.classList.remove('with-media');
            }
        };

        // Update media counter and button state
        const updateMediaCounter = () => {
            const totalCount = currentMediaKeys.length + newMediaFiles.length;
            const counter = document.getElementById('edit-post-media-counter');
            const addBtn = document.getElementById('edit-post-add-media-btn');

            if (counter) {
                counter.textContent = `${totalCount}/${maxMedia}`;
                counter.classList.toggle('at-max', totalCount >= maxMedia);
            }
            if (addBtn) {
                addBtn.classList.toggle('disabled', totalCount >= maxMedia);
            }
            updateModalSize();
        };

        // Re-render media grid
        const renderMediaGrid = () => {
            const grid = document.getElementById('edit-post-media-grid');
            if (!grid) return;
            grid.innerHTML = renderEditMediaItems();
            updateMediaCounter();
        };

        // Handle remove button clicks
        modal.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.edit-media-remove-btn');
            if (removeBtn) {
                e.stopPropagation();
                const type = removeBtn.dataset.type;
                const index = parseInt(removeBtn.dataset.index);
                if (type === 'existing') {
                    currentMediaKeys.splice(index, 1);
                } else if (type === 'new') {
                    URL.revokeObjectURL(newMediaPreviews[index].url);
                    newMediaFiles.splice(index, 1);
                    newMediaPreviews.splice(index, 1);
                }
                renderMediaGrid();
            }
        });

        // Handle adding new media
        document.getElementById('edit-post-media-input').addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            const totalCount = currentMediaKeys.length + newMediaFiles.length;
            const remaining = maxMedia - totalCount;

            if (remaining <= 0) {
                showToast(`Maximum ${maxMedia} media files allowed`, 'error');
                e.target.value = '';
                return;
            }

            const filesToAdd = files.slice(0, remaining);
            for (const file of filesToAdd) {
                const isVideo = file.type.startsWith('video/');
                const isImage = file.type.startsWith('image/');
                if (!isVideo && !isImage) continue;

                const previewUrl = URL.createObjectURL(file);
                newMediaFiles.push(file);
                newMediaPreviews.push({
                    url: previewUrl,
                    type: isVideo ? 'video' : 'image',
                    name: file.name
                });
            }
            renderMediaGrid();
            e.target.value = '';
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                newMediaPreviews.forEach(p => URL.revokeObjectURL(p.url));
                modal.remove();
            }
        });

        // Handle save
        document.getElementById('save-edit-btn').onclick = async () => {
            const content = document.getElementById('edit-profile-post-content')?.value.trim();
            if (!content) {
                showToast('Post content cannot be empty', 'error');
                return;
            }

            const saveBtn = document.getElementById('save-edit-btn');
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                let finalMediaUrls = [...currentMediaKeys];
                let finalMediaType = existingMediaType;

                // Upload new media if any
                if (newMediaFiles.length > 0) {
                    saveBtn.textContent = 'Uploading...';
                    try {
                        const uploadResult = await uploadAPI.uploadPostMedia(newMediaFiles);
                        if (uploadResult.media && uploadResult.media.length > 0) {
                            finalMediaUrls = [...finalMediaUrls, ...uploadResult.media.map(m => m.s3Key)];
                            finalMediaType = uploadResult.media_type;
                        } else if (uploadResult.s3Key) {
                            finalMediaUrls.push(uploadResult.s3Key);
                            finalMediaType = uploadResult.media_type;
                        }
                    } catch (uploadError) {
                        console.error('Media upload failed:', uploadError);
                        showToast('Failed to upload media', 'error');
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Save Changes';
                        return;
                    }
                }

                if (finalMediaUrls.length === 0) {
                    finalMediaUrls = null;
                    finalMediaType = null;
                }

                await API.put(`/posts/${postId}`, {
                    content,
                    media_urls: finalMediaUrls,
                    media_type: finalMediaType
                });

                // Cleanup blob URLs
                newMediaPreviews.forEach(p => URL.revokeObjectURL(p.url));

                // Fetch updated post data to get signed URLs for media
                const updatedResponse = await API.get(`/posts/${postId}`);
                const updatedPost = updatedResponse.post;

                // Update the post in the DOM
                const postCard = document.querySelector(`[data-post-id="${postId}"]`);
                if (postCard) {
                    // Update content text
                    const contentEl = postCard.querySelector('.profile-post-content');
                    if (contentEl) {
                        contentEl.innerHTML = formatPostContent(content);
                    }

                    // Update media - find or create media container
                    const existingMediaGrid = postCard.querySelector('.post-media-grid');
                    if (existingMediaGrid) {
                        existingMediaGrid.remove();
                    }

                    // Add new media if present
                    if (updatedPost.media_urls && updatedPost.media_urls.length > 0) {
                        const newMediaHtml = buildMediaGridHTML(updatedPost.media_urls, updatedPost.media_type);
                        const contentContainer = postCard.querySelector('.profile-post-content');
                        if (contentContainer) {
                            contentContainer.insertAdjacentHTML('afterend', newMediaHtml);
                        }
                    }
                }

                modal.remove();
                showToast('Post updated!', 'success');
            } catch (error) {
                console.error('Error updating post:', error);
                showToast('Failed to update post', 'error');
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        };
    } catch (error) {
        console.error('Error fetching post:', error);
        showToast('Failed to load post', 'error');
    }
}

// Pin post
async function pinProfilePost(postId) {
    document.querySelector('.profile-post-dropdown-menu')?.remove();

    try {
        await API.post(`/posts/${postId}/pin`);
        showProfileToast('Post pinned to your profile!', 'success');

        // Reload posts to show pinned at top
        profilePostsOffset = 0;
        await loadProfilePosts(false);
    } catch (error) {
        console.error('Error pinning post:', error);
        showProfileToast('Failed to pin post', 'error');
    }
}

// Unpin post
async function unpinProfilePost(postId) {
    document.querySelector('.profile-post-dropdown-menu')?.remove();

    try {
        await API.delete(`/posts/${postId}/pin`);
        showProfileToast('Post unpinned', 'success');

        // Reload posts
        profilePostsOffset = 0;
        await loadProfilePosts(false);
    } catch (error) {
        console.error('Error unpinning post:', error);
        showProfileToast('Failed to unpin post', 'error');
    }
}

// Delete post
async function deleteProfilePost(postId) {
    document.querySelector('.profile-post-dropdown-menu')?.remove();

    // Create delete confirmation modal
    const modal = document.createElement('div');
    modal.className = 'profile-post-modal-overlay';
    modal.id = 'delete-profile-post-modal';
    modal.innerHTML = `
        <div class="profile-post-modal">
            <div class="delete-modal">
                <div class="delete-modal-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        <line x1="10" y1="11" x2="10" y2="17"></line>
                        <line x1="14" y1="11" x2="14" y2="17"></line>
                    </svg>
                </div>
                <h3>Delete Post</h3>
                <p>Are you sure you want to delete this post? This action cannot be undone.</p>
                <div class="delete-modal-actions">
                    <button class="delete-modal-btn delete-modal-btn-cancel" onclick="closeProfilePostModal('delete-profile-post-modal')">Cancel</button>
                    <button class="delete-modal-btn delete-modal-btn-delete" onclick="confirmDeleteProfilePost('${postId}')">Delete</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProfilePostModal('delete-profile-post-modal');
        }
    });
}

// Confirm delete post
async function confirmDeleteProfilePost(postId) {
    const deleteBtn = document.querySelector('.delete-modal-btn-delete');
    if (deleteBtn) {
        deleteBtn.disabled = true;
        deleteBtn.textContent = 'Deleting...';
    }

    try {
        await API.delete(`/posts/${postId}`);
        // Remove every card for this post (it can appear in both the Posts and the
        // Likes tab). The Pinned badge is a child of the card, so it goes with it.
        document.querySelectorAll(`.post-card[data-post-id="${postId}"]`).forEach(c => c.remove());

        closeProfilePostModal('delete-profile-post-modal');
        showProfileToast('Post deleted', 'success');

        // Check if posts container is now empty
        const container = document.getElementById('profilePostsContainer');
        if (container && !container.querySelector('.post-card')) {
            container.innerHTML = `
                <div class="profile-posts-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <p>No posts yet</p>
                </div>
            `;
            const loadMoreContainer = document.getElementById('loadMorePostsContainer');
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        }
    } catch (error) {
        console.error('Error deleting post:', error);
        showProfileToast('Failed to delete post', 'error');
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete';
        }
    }
}

// Close modal utility
function closeProfilePostModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.remove();
    }
    editMediaFile = null;
}

// Toast notification for profile post actions
function showProfileToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.profile-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `profile-toast profile-toast-${type}`;
    toast.innerHTML = `
        <span>${message}</span>
    `;
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== PROFILE VIEW TRACKING ====================

async function recordProfileView(viewedUserId) {
    try {
        await API.post(`/profile/view/${viewedUserId}`);
    } catch (error) {
        console.error('Error recording profile view:', error);
    }
}

async function loadProfileViewCount() {
    const viewCountEl = document.getElementById('profileViewsCount');
    const mobileViewCountEl = document.getElementById('mobileProfileViewsCount');
    const statsWidget = document.getElementById('profileStatsWidget');
    const mobileLink = document.getElementById('mobileProfileViewsLink');

    if (!isOwnProfile) {
        if (statsWidget) statsWidget.style.display = 'none';
        if (mobileLink) mobileLink.style.display = 'none';
        return;
    }

    try {
        const response = await API.get(`/profile/views/${currentUserId}`);
        const count = response.viewCount || 0;
        if (viewCountEl) viewCountEl.textContent = count;
        if (mobileViewCountEl) mobileViewCountEl.textContent = count;
    } catch (error) {
        console.error('Error loading profile view count:', error);
    }
}

// Escape HTML utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// US state list shared between current-team-display rendering and the Change Team modal
const US_STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
    ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
    ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
    ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
    ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
    ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
    ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
    ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
    ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
    ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
];

// Position groups for the Change Team modal — mirrors the Edit Profile modal's
// checkbox grid exactly, but rendered into its own container so the two modals
// don't share DOM ids.
const COACHING_POSITION_GROUPS = [
    { label: 'Head Coach', items: ['Head Coach'] },
    { label: 'Coordinators', items: ['Offensive Coordinator','Defensive Coordinator','Special Teams Coordinator'] },
    { label: 'Offensive Position Coaches', items: ['Quarterbacks Coach','Running Backs Coach','Wide Receivers Coach','Tight Ends Coach','Offensive Line Coach'] },
    { label: 'Defensive Position Coaches', items: ['Defensive Line Coach','Linebackers Coach','Defensive Backs Coach','Safeties Coach','Cornerbacks Coach'] },
    { label: 'Special Teams', items: ['Special Teams Coach'] },
    { label: 'Other Staff', items: ['Recruiting Coordinator','Assistant Coach','Graduate Assistant'] }
];

let ctSelectedPositions = [];

function buildChangeTeamStateList() {
    const sel = document.getElementById('ctNewState');
    if (!sel || sel.options.length > 1) return;
    US_STATES.forEach(([code, name]) => {
        const opt = document.createElement('option');
        opt.value = code;
        opt.textContent = name;
        sel.appendChild(opt);
    });
}

function buildChangeTeamPositionGrid() {
    const container = document.getElementById('ctCoachingPositionsContainer');
    if (!container || container.children.length > 0) return;
    COACHING_POSITION_GROUPS.forEach(group => {
        const wrap = document.createElement('div');
        wrap.className = 'multi-select-group';
        const h4 = document.createElement('h4');
        h4.className = 'group-label';
        h4.textContent = group.label;
        wrap.appendChild(h4);
        group.items.forEach(item => {
            const lab = document.createElement('label');
            lab.className = 'checkbox-label';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.name = 'ctCoachingPosition';
            cb.value = item;
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    if (!ctSelectedPositions.includes(item)) ctSelectedPositions.push(item);
                } else {
                    ctSelectedPositions = ctSelectedPositions.filter(p => p !== item);
                }
                renderCtSelectedPositions();
            });
            const span = document.createElement('span');
            span.textContent = item;
            lab.appendChild(cb);
            lab.appendChild(span);
            wrap.appendChild(lab);
        });
        container.appendChild(wrap);
    });
}

function renderCtSelectedPositions() {
    const c = document.getElementById('ctSelectedCoachingPositions');
    if (!c) return;
    c.innerHTML = '';
    ctSelectedPositions.forEach(pos => {
        const pill = document.createElement('div');
        pill.className = 'selected-item';
        pill.innerHTML = `${escapeHtml(pos)} <button type="button" class="remove-item" data-position="${escapeHtml(pos)}">×</button>`;
        c.appendChild(pill);
    });
    c.querySelectorAll('.remove-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const pos = btn.dataset.position;
            ctSelectedPositions = ctSelectedPositions.filter(p => p !== pos);
            const cb = document.querySelector(`#ctCoachingPositionsContainer input[value="${CSS.escape(pos)}"]`);
            if (cb) cb.checked = false;
            renderCtSelectedPositions();
        });
    });
}

// ─── Team Switch (Change Team) ────────────────────────────────────────────────
// Fills the read-only "current team" display inside the Edit Profile modal and
// gates the Change Team button on dev-mode env. Production builds hide the
// button entirely — coaches can still see their team here but can't open the
// switch modal until we flip the gate.
async function renderCurrentTeamDisplay(profile) {
    const nameEl = document.getElementById('currentTeamName');
    const subEl = document.getElementById('currentTeamSub');
    const logoSlot = document.getElementById('currentTeamLogoSlot');
    const btn = document.getElementById('btnOpenChangeTeam');
    const hint = document.getElementById('changeTeamHint');
    if (!nameEl || !subEl) return;

    nameEl.textContent = profile.team_name || 'No team set';
    const parts = [];
    if (profile.college_division) parts.push(profile.college_division);
    if (profile.state) parts.push(profile.state);
    subEl.textContent = parts.join(' · ') || '';

    // School logo (best-effort — silently skip if school-search isn't loaded)
    if (logoSlot) {
        logoSlot.innerHTML = '';
        try {
            if (typeof ensureSchoolLogosLoaded === 'function') {
                await ensureSchoolLogosLoaded('../../assets');
            }
            if (typeof getSchoolLogoHTML === 'function' && profile.team_name) {
                logoSlot.innerHTML = getSchoolLogoHTML(profile.team_name, '../../assets', 32);
            }
        } catch (_) { /* noop */ }
    }

    // DEV: the bypass page applies switches instantly and logs to the same
    // history table, which would otherwise trip the 72h cooldown and disable
    // this button. Skip the eligibility gate in dev so devs can switch freely.
    try {
        const cfg = await API.config.getEnv();
        if (cfg && cfg.env === 'development') {
            if (btn) { btn.style.display = ''; btn.disabled = false; }
            if (hint) hint.style.display = 'none';
            return;
        }
    } catch (_) { /* fall through to the prod eligibility gate */ }

    // Check eligibility (cooldown + pending request) before showing the button.
    // The button is now live in both dev and prod — server-side eligibility check
    // is the real gate.
    if (btn && hint) {
        try {
            const elig = await API.coachSignup.getTeamSwitchEligibility();
            if (elig.eligible) {
                btn.style.display = '';
                btn.disabled = false;
                hint.style.display = 'none';
            } else {
                btn.style.display = '';
                btn.disabled = true;
                hint.style.display = '';
                if (elig.reason === 'cooldown' && elig.next_eligible_at) {
                    const d = new Date(elig.next_eligible_at);
                    hint.textContent = `You can request another team change after ${d.toLocaleString()}.`;
                } else if (elig.reason === 'pending_request') {
                    hint.textContent = "You already have a team-switch request in review.";
                } else {
                    hint.textContent = "Team switches aren't available right now.";
                }
            }
        } catch (e) {
            if (btn) btn.style.display = 'none';
        }
    }
}

async function openChangeTeamModal() {
    // DEV BYPASS: on a local dev server, skip the admin-verification request
    // flow entirely and route to the standalone dev bypass page where the coach
    // can pick a school and apply it instantly. Prod keeps the request modal.
    // /api/config returns { env } and falls back to 'production' on error, so
    // this never fires in prod.
    try {
        const cfg = await API.config.getEnv();
        if (cfg && cfg.env === 'development') {
            const prefix = window.location.pathname.startsWith('/frontend/') ? '/frontend' : '';
            window.location.href = `${prefix}/collegecoach/dev-team-switch.html`;
            return;
        }
    } catch (_) { /* fall through to the prod request modal */ }

    const modal = document.getElementById('changeTeamModal');
    if (!modal) return;
    buildChangeTeamStateList();
    buildChangeTeamPositionGrid();
    ctSelectedPositions = [];
    renderCtSelectedPositions();
    // Reset fields
    const f = (id) => document.getElementById(id);
    // Login email lives on response.user.email (not coach_profiles). Fall back
    // to a fresh /auth/me fetch if currentUser wasn't populated yet for some reason.
    let acctEmail = (currentUser && currentUser.email) || '';
    if (!acctEmail) {
        try {
            const me = await API.auth.getCurrentUser();
            if (me && me.user) {
                currentUser = me.user;
                acctEmail = me.user.email || '';
            }
        } catch (_) { /* leave blank */ }
    }
    if (f('ctCurrentEmail')) f('ctCurrentEmail').value = acctEmail;
    if (f('ctNewEduEmail')) f('ctNewEduEmail').value = '';
    if (f('ctNewTeamName')) f('ctNewTeamName').value = '';
    if (f('ctNewDivision')) f('ctNewDivision').value = '';
    if (f('ctNewState')) f('ctNewState').value = '';
    document.querySelectorAll('#ctCoachingPositionsContainer input[name="ctCoachingPosition"]').forEach(cb => { cb.checked = false; });
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideChangeTeamModal() {
    const modal = document.getElementById('changeTeamModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
}

async function submitChangeTeam() {
    const submitBtn = document.getElementById('changeTeamSubmit');
    if (!submitBtn) return;
    const originalText = submitBtn.textContent;
    const newEdu = (document.getElementById('ctNewEduEmail').value || '').trim();
    const newTeam = (document.getElementById('ctNewTeamName').value || '').trim();
    const newDiv = document.getElementById('ctNewDivision').value;
    const newState = document.getElementById('ctNewState').value;
    if (!newEdu || !newTeam || !newDiv || !newState || ctSelectedPositions.length === 0) {
        if (typeof showToast === 'function') showToast('Please fill in every required field.', 'error');
        return;
    }
    if (!/\.edu(\.[a-z]{2})?$/i.test(newEdu)) {
        if (typeof showToast === 'function') showToast('Your new email must be a .edu address.', 'error');
        return;
    }
    submitBtn.textContent = 'Submitting...';
    submitBtn.disabled = true;
    try {
        const resp = await API.coachSignup.requestTeamSwitch({
            new_edu_email: newEdu,
            new_team_name: newTeam,
            new_division: newDiv,
            new_state: newState,
            new_position: ctSelectedPositions.join('/')
        });
        hideChangeTeamModal();
        // Also close the edit-profile modal so the coach lands back on their profile
        const editModal = document.getElementById('editProfileModal');
        if (editModal) {
            editModal.classList.remove('active');
            document.body.style.overflow = '';
        }
        if (typeof showToast === 'function') {
            showToast(resp.message || "Request submitted. We'll review within 24-48 hours.", 'success');
        } else {
            alert(resp.message || "Request submitted. We'll review within 24-48 hours.");
        }
    } catch (err) {
        const msg = (err && err.data && err.data.error) || err.message || 'Failed to submit request';
        if (typeof showToast === 'function') showToast(msg, 'error'); else alert(msg);
    } finally {
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
}

// Wire up the Change Team button + modal close/cancel/submit handlers once on load.
document.addEventListener('DOMContentLoaded', function() {
    const openBtn = document.getElementById('btnOpenChangeTeam');
    const closeBtn = document.getElementById('changeTeamClose');
    const cancelBtn = document.getElementById('changeTeamCancel');
    const submitBtn = document.getElementById('changeTeamSubmit');
    const overlay = document.getElementById('changeTeamOverlay');
    if (openBtn) openBtn.addEventListener('click', openChangeTeamModal);
    if (closeBtn) closeBtn.addEventListener('click', hideChangeTeamModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideChangeTeamModal);
    if (overlay) overlay.addEventListener('click', hideChangeTeamModal);
    if (submitBtn) submitBtn.addEventListener('click', submitChangeTeam);
});


// ============================================
// RECRUITING PROFILE TAB — Program subtabs (AI Fit-Matching)
// ============================================

let rpTopProgramsPicker = null, rpFootballMajorsPicker = null, rpAffiliationPicker = null;

function rpParseFitPrefs(profile) {
    const fp = profile && profile.fit_preferences;
    if (fp == null) return {};
    if (typeof fp === 'object') return fp;
    try { return JSON.parse(fp) || {}; } catch (e) { return {}; }
}
function rpSetText(elId, value) {
    const el = document.getElementById(elId);
    if (el) el.textContent = (value == null || value === '') ? '—' : value;
}
// Capitalize a stored lowercase enum value for DISPLAY only (e.g. 'partial' → 'Partial',
// 'need-met' → 'Need-met'). Stored values stay lowercase for matching/allowlists.
function rpTitleCase(value) {
    if (value == null || value === '') return value;
    const s = String(value);
    return s.charAt(0).toUpperCase() + s.slice(1);
}
function rpRange(min, max) {
    const a = (min == null || min === '') ? null : min;
    const b = (max == null || max === '') ? null : max;
    if (a == null && b == null) return '—';
    if (a != null && b != null) return a + ' – ' + b;
    return a != null ? (a + '+') : ('up to ' + b);
}
function rpRenderTags(elId, arr) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    const vals = Array.isArray(arr) ? arr.filter(v => v != null && v !== '') : [];
    if (!vals.length) { const s = document.createElement('span'); s.className = 'info-value'; s.textContent = '—'; el.appendChild(s); return; }
    vals.forEach(v => { const s = document.createElement('span'); s.className = 'recruiting-tag'; s.textContent = v; el.appendChild(s); });
}

// Populate the 5 program subtabs from the coach profile.
function populateRecruitingProfile(profile) {
    if (!profile) return;
    const fp = rpParseFitPrefs(profile);
    // Admissions
    rpSetText('rpAdmittedGpa', rpRange(profile.admitted_gpa_min, profile.admitted_gpa_max));
    rpSetText('rpTestOptional', profile.test_optional === true ? 'Yes' : (profile.test_optional === false ? 'No' : '—'));
    rpSetText('rpSatRange', rpRange(profile.sat_min, profile.sat_max));
    rpSetText('rpActRange', rpRange(profile.act_min, profile.act_max));
    // Academics & Majors
    rpRenderTags('rpTopPrograms', profile.top_programs);
    rpRenderTags('rpFootballMajors', profile.football_player_majors);
    rpSetText('rpAcademicSupport', rpTitleCase(fp.academic_support));
    // Cost & Aid
    rpSetText('rpAffordabilityBand', rpTitleCase(profile.affordability_band));
    rpSetText('rpOffersAthleticAid', rpTitleCase(profile.offers_athletic_aid));
    rpSetText('rpAidGenerosity', rpTitleCase(profile.aid_generosity));
    rpSetText('rpRosterPctOnAid', rpTitleCase(fp.roster_pct_on_aid));
    // Program & Location
    rpSetText('rpCampusSetting', rpTitleCase(profile.campus_setting));
    rpSetText('rpDistanceProfile', rpTitleCase(profile.distance_profile));
    rpSetText('rpHsTier', rpTitleCase(profile.hs_tier_recruited));
    rpRenderTags('rpAffiliation', fp.affiliation);
    // Scheme & Fit
    rpSetText('rpOffensiveScheme', fp.offensive_scheme);
    rpSetText('rpDefensiveScheme', fp.defensive_scheme);
    rpSetText('rpDevVsPlug', (fp.dev_vs_plug_and_play == null || fp.dev_vs_plug_and_play === '') ? '—' : (fp.dev_vs_plug_and_play + ' / 5'));
    rpSetText('rpGreatFit', fp.great_fit_text);
}

function setupRecruitingSubnav() {
    const sel = document.getElementById('recruitingSubtabSelect');
    if (!sel || sel._rpWired) return;
    sel._rpWired = true;
    sel.addEventListener('change', function () {
        document.querySelectorAll('#recruiting .recruiting-subtab-pane').forEach(p => {
            p.classList.toggle('active', p.dataset.subtab === this.value);
        });
    });
}

function rpOpenModal(id) { const m = document.getElementById(id); if (m) { m.classList.add('active'); document.body.style.overflow = 'hidden'; } }
function rpCloseModal(id) { const m = document.getElementById(id); if (m) { m.classList.remove('active'); document.body.style.overflow = ''; } }
function rpNumOrNull(id) { const e = document.getElementById(id); if (!e || e.value === '') return null; const n = parseFloat(e.value); return Number.isNaN(n) ? null : n; }
function rpIntOrNull(id) { const e = document.getElementById(id); if (!e || e.value === '') return null; const n = parseInt(e.value, 10); return Number.isNaN(n) ? null : n; }
function rpRadioVal(name) { const e = document.querySelector('input[name="' + name + '"]:checked'); return e ? e.value : null; }

async function rpSavePayload(payload, modalId) {
    try {
        const response = await API.put('/profile', payload);
        if (response.success || response.profile) {
            Object.assign(currentProfile, payload);
            populateRecruitingProfile(currentProfile);
            rpCloseModal(modalId);
            if (typeof showToast === 'function') showToast('Saved', 'success');
        } else { showToast(response.message || 'Failed to save', 'error'); }
    } catch (err) { console.error('RP save error:', err); showToast('Failed to save. Please try again.', 'error'); }
}

function setupRecruitingProfileEditing() {
    if (window._rpEditingWired) return;
    window._rpEditingWired = true;
    const haveMatchUI = typeof initMatchMultiSelect === 'function' && typeof MATCH_CONSTANTS !== 'undefined';
    document.querySelectorAll('.btn-edit-recruiting-section').forEach(b => b.classList.add('show-button'));
    const wireClose = (modalId) => {
        const ov = document.getElementById(modalId + 'Overlay'); if (ov) ov.addEventListener('click', () => rpCloseModal(modalId));
        const cl = document.getElementById(modalId + 'Close'); if (cl) cl.addEventListener('click', () => rpCloseModal(modalId));
    };
    const onClick = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };

    // ---- Admissions ----
    onClick('editRpAdmissionsBtn', () => {
        const p = currentProfile;
        document.getElementById('editRpAdmittedGpaMin').value = p.admitted_gpa_min == null ? '' : p.admitted_gpa_min;
        document.getElementById('editRpAdmittedGpaMax').value = p.admitted_gpa_max == null ? '' : p.admitted_gpa_max;
        const to = p.test_optional === true ? 'yes' : (p.test_optional === false ? 'no' : null);
        document.querySelectorAll('input[name="editRpTestOptional"]').forEach(r => { r.checked = (r.value === to); });
        document.getElementById('editRpSatMin').value = p.sat_min == null ? '' : p.sat_min;
        document.getElementById('editRpSatMax').value = p.sat_max == null ? '' : p.sat_max;
        document.getElementById('editRpActMin').value = p.act_min == null ? '' : p.act_min;
        document.getElementById('editRpActMax').value = p.act_max == null ? '' : p.act_max;
        rpOpenModal('editRpAdmissionsModal');
    });
    onClick('btnEditRpAdmissionsCancel', () => rpCloseModal('editRpAdmissionsModal'));
    wireClose('editRpAdmissionsModal');
    onClick('btnEditRpAdmissionsSave', () => {
        const to = rpRadioVal('editRpTestOptional');
        rpSavePayload({
            admitted_gpa_min: rpNumOrNull('editRpAdmittedGpaMin'), admitted_gpa_max: rpNumOrNull('editRpAdmittedGpaMax'),
            test_optional: to == null ? null : (to === 'yes'),
            sat_min: rpIntOrNull('editRpSatMin'), sat_max: rpIntOrNull('editRpSatMax'),
            act_min: rpIntOrNull('editRpActMin'), act_max: rpIntOrNull('editRpActMax')
        }, 'editRpAdmissionsModal');
    });

    // ---- Academics & Majors ----
    onClick('editRpAcadMajorsBtn', () => {
        const p = currentProfile, fp = rpParseFitPrefs(p);
        ['editRpTopProgramsContainer', 'editRpFootballMajorsContainer'].forEach(id => { const c = document.getElementById(id); if (c) c.innerHTML = ''; });
        if (haveMatchUI) {
            rpTopProgramsPicker = initMatchMultiSelect({ container: '#editRpTopProgramsContainer', chips: '#editRpTopProgramsChips', groups: MATCH_CONSTANTS.MAJOR_GROUPS, name: 'rp_top', preselected: p.top_programs || [] });
            rpFootballMajorsPicker = initMatchMultiSelect({ container: '#editRpFootballMajorsContainer', chips: '#editRpFootballMajorsChips', groups: MATCH_CONSTANTS.MAJOR_GROUPS, name: 'rp_fbm', preselected: p.football_player_majors || [] });
        }
        document.getElementById('editRpAcademicSupport').value = fp.academic_support || '';
        rpOpenModal('editRpAcadMajorsModal');
    });
    onClick('btnEditRpAcadMajorsCancel', () => rpCloseModal('editRpAcadMajorsModal'));
    wireClose('editRpAcadMajorsModal');
    onClick('btnEditRpAcadMajorsSave', () => {
        const top = rpTopProgramsPicker ? rpTopProgramsPicker.getSelected() : (currentProfile.top_programs || []);
        const fbm = rpFootballMajorsPicker ? rpFootballMajorsPicker.getSelected() : (currentProfile.football_player_majors || []);
        const fp = Object.assign({}, rpParseFitPrefs(currentProfile), { academic_support: document.getElementById('editRpAcademicSupport').value || null });
        rpSavePayload({ top_programs: top.length ? top : null, football_player_majors: fbm.length ? fbm : null, fit_preferences: fp }, 'editRpAcadMajorsModal');
    });

    // ---- Cost & Aid ----
    onClick('editRpCostAidBtn', () => {
        const p = currentProfile, fp = rpParseFitPrefs(p);
        document.getElementById('editRpAffordabilityBand').value = p.affordability_band || '';
        document.getElementById('editRpOffersAthleticAid').value = p.offers_athletic_aid || '';
        document.getElementById('editRpAidGenerosity').value = p.aid_generosity || '';
        document.getElementById('editRpRosterPctOnAid').value = fp.roster_pct_on_aid || '';
        rpOpenModal('editRpCostAidModal');
    });
    onClick('btnEditRpCostAidCancel', () => rpCloseModal('editRpCostAidModal'));
    wireClose('editRpCostAidModal');
    onClick('btnEditRpCostAidSave', () => {
        const fp = Object.assign({}, rpParseFitPrefs(currentProfile), { roster_pct_on_aid: document.getElementById('editRpRosterPctOnAid').value || null });
        rpSavePayload({
            affordability_band: document.getElementById('editRpAffordabilityBand').value || null,
            offers_athletic_aid: document.getElementById('editRpOffersAthleticAid').value || null,
            aid_generosity: document.getElementById('editRpAidGenerosity').value || null,
            fit_preferences: fp
        }, 'editRpCostAidModal');
    });

    // ---- Program & Location ----
    onClick('editRpProgramLocationBtn', () => {
        const p = currentProfile, fp = rpParseFitPrefs(p);
        document.getElementById('editRpCampusSetting').value = p.campus_setting || '';
        document.getElementById('editRpDistanceProfile').value = p.distance_profile || '';
        document.getElementById('editRpHsTier').value = p.hs_tier_recruited || '';
        const cont = document.getElementById('editRpAffiliationContainer'); if (cont) cont.innerHTML = '';
        if (haveMatchUI) {
            rpAffiliationPicker = initMatchMultiSelect({ container: '#editRpAffiliationContainer', chips: '#editRpAffiliationChips', options: MATCH_CONSTANTS.AFFILIATIONS, name: 'rp_affiliation', preselected: fp.affiliation || [] });
        }
        rpOpenModal('editRpProgramLocationModal');
    });
    onClick('btnEditRpProgramLocationCancel', () => rpCloseModal('editRpProgramLocationModal'));
    wireClose('editRpProgramLocationModal');
    onClick('btnEditRpProgramLocationSave', () => {
        const aff = rpAffiliationPicker ? rpAffiliationPicker.getSelected() : (rpParseFitPrefs(currentProfile).affiliation || []);
        const fp = Object.assign({}, rpParseFitPrefs(currentProfile), { affiliation: aff.length ? aff : null });
        rpSavePayload({
            campus_setting: document.getElementById('editRpCampusSetting').value || null,
            distance_profile: document.getElementById('editRpDistanceProfile').value || null,
            hs_tier_recruited: document.getElementById('editRpHsTier').value || null,
            fit_preferences: fp
        }, 'editRpProgramLocationModal');
    });

    // ---- Scheme & Fit ----
    const gf = document.getElementById('editRpGreatFit'), gfc = document.getElementById('editRpGreatFitCount');
    if (gf && gfc) gf.addEventListener('input', () => { gfc.textContent = gf.value.length; });
    const dev = document.getElementById('editRpDevVsPlug'), devV = document.getElementById('editRpDevVsPlugVal');
    if (dev && devV) dev.addEventListener('input', () => { devV.textContent = dev.value; });
    onClick('editRpSchemeFitBtn', () => {
        const fp = rpParseFitPrefs(currentProfile);
        document.getElementById('editRpOffensiveScheme').value = fp.offensive_scheme || '';
        document.getElementById('editRpDefensiveScheme').value = fp.defensive_scheme || '';
        const dv = (fp.dev_vs_plug_and_play == null || fp.dev_vs_plug_and_play === '') ? 3 : fp.dev_vs_plug_and_play;
        if (dev) dev.value = dv; if (devV) devV.textContent = dv;
        if (gf) gf.value = fp.great_fit_text || ''; if (gfc) gfc.textContent = (fp.great_fit_text || '').length;
        rpOpenModal('editRpSchemeFitModal');
    });
    onClick('btnEditRpSchemeFitCancel', () => rpCloseModal('editRpSchemeFitModal'));
    wireClose('editRpSchemeFitModal');
    onClick('btnEditRpSchemeFitSave', () => {
        const greatFit = (document.getElementById('editRpGreatFit').value || '').trim();
        const fp = Object.assign({}, rpParseFitPrefs(currentProfile), {
            offensive_scheme: document.getElementById('editRpOffensiveScheme').value || null,
            defensive_scheme: document.getElementById('editRpDefensiveScheme').value || null,
            dev_vs_plug_and_play: rpIntOrNull('editRpDevVsPlug'),
            great_fit_text: greatFit || null
        });
        rpSavePayload({ fit_preferences: fp }, 'editRpSchemeFitModal');
    });
}
