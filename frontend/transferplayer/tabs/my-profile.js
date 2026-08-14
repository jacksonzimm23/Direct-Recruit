// My Profile JavaScript - Dynamic Version

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let currentProfile = null;
let currentUserId = null;
let viewingUserId = null;
let isOwnProfile = true;
let isCollegeCoach = false;
let currentProfileType = 'player'; // Track whether viewing a player or coach profile
let loggedInUserFolder = null; // Track the logged-in user's folder for navigation
let editSelectedPositions = []; // Track selected positions in edit modal
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

    // If it's a string that's just a number (total inches as string), convert it
    if (typeof height === 'string' && /^\d+$/.test(height)) {
        const totalInches = parseInt(height);
        const feet = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
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

// Function to update sidebar footer with fresh data from API
async function updateSidebarFooterFromAPI() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;

            // Update name
            const userName = document.querySelector('.sidebar-footer .user-name');
            if (userName) {
                // Shared helper: always the LOGGED-IN user, with their school logo.
                // Kept identical across all six role folders so the sidebar cannot change
                // depending on whose profile you happen to be viewing.
                renderSidebarFooterName(userName, profile.first_name, profile.last_name, profile.team_name);
            }

            // Update role/info line for transfer player: position • height • weight • YOE
            const userRoleElement = document.querySelector('.sidebar-footer .user-role');
            if (userRoleElement) {
                const parts = [];

                // Position (slashed if multiple)
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

                // Weight
                if (profile.weight) {
                    parts.push(`${profile.weight} lbs`);
                }

                // Years of Eligibility
                if (profile.eligibility) {
                    const yearText = profile.eligibility === 1 ? 'year' : 'years';
                    parts.push(`YOE: ${profile.eligibility} ${yearText}`);
                }

                userRoleElement.textContent = parts.join(' • ') || 'Transfer Player';
                userRoleElement.style.color = '#b91c1c'; // Transfer player red
            }

            // Update avatar if available
            if (profile.profile_image_url) {
                const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
                if (avatarElement) {
                    avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    avatarElement.style.border = `2px solid ${getRoleBorderColor(response.user.role, response.user.is_transfer_player, profile.college_division)}`;
                    avatarElement.style.color = getRoleBorderColor(response.user.role, response.user.is_transfer_player, profile.college_division);
                    avatarElement.style.backgroundColor = getRoleAvatarBg(response.user.role, response.user.is_transfer_player, profile.college_division);
                }
            }
        }
    } catch (error) {
        console.error('Error updating sidebar footer:', error);
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize school search for edit modal
    editSchoolSearch = initSchoolSearch({
        nameInput: '#editCollegeName',
        divisionSelect: '#editDivision',
        assetBasePath: '../../assets'
    });

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

    // Load profile data
    if (username) {
        await loadProfileByUsername(username);
    } else if (userIdParam) {
        await loadProfileByUserId(userIdParam);
    } else {
        await loadOwnProfile();
    }

    setupUI();
    loadGameStats();
    loadTransferStats();
    loadHighlights();
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
    // Determine the correct folder for the logged-in user
    const role = user.role;
    const userFolder = getProfileFolder({ role, is_transfer_player: user.is_transfer_player, transfer: profile && profile.transfer, college_division: profile && profile.college_division });
    if (!userFolder) return; // Unknown role, don't modify
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    const isTransferPlayer = userFolder === 'transferplayer';
    const isCollege = ['collegeplayer', 'collegecoach', 'transferplayer'].includes(userFolder);

    // Update profile-type body class to match logged-in user (not the page being viewed)
    document.body.classList.remove('profile-type-player', 'profile-type-coach', 'profile-type-transfer', 'profile-type-other');
    const profileTypeMap = { transferplayer: 'transfer', hsplayer: 'player', collegeplayer: 'player', hscoach: 'coach', collegecoach: 'coach', other: 'other' };
    document.body.classList.add(`profile-type-${profileTypeMap[userFolder] || 'player'}`);

    // Save to global for use in setupUI navigation handlers
    loggedInUserFolder = userFolder;

    const mainPage = role === 'player' ? 'mainpage-player.html' : (role === 'coach' ? 'mainpage-coach.html' : 'mainpage-other.html');

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
    let transferPortalActive = '';
    let notificationsActive = '';

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
    } else if (fromPage === 'transfer-portal') {
        transferPortalActive = 'active';
    } else if (fromPage === 'notifications') {
        notificationsActive = 'active';
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
                <a href="${FE_BASE}/${userFolder}/tabs/transfer-portal.html" class="nav-item${isTransferPlayer ? ' nav-item-portal' : ''}${transferPortalActive ? ' active' : ''}" id="transferPortalNav">
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
                <a href="${FE_BASE}/${userFolder}/tabs/transfer-portal.html" class="nav-item${transferPortalActive ? ' active' : ''}" id="transferPortalNav">
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
                background: transparent !important;
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
            // Shared helper: always the LOGGED-IN user, with their school logo.
            // Kept identical across all six role folders so the sidebar cannot change
            // depending on whose profile you happen to be viewing.
            renderSidebarFooterName(userName, profile.first_name, profile.last_name, profile.team_name);
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
                        // Already formatted as string like "6'2""
                        parts.push(profile.height);
                    } else {
                        // Number (total inches) - convert to feet'inches"
                        const totalInches = parseInt(profile.height);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        parts.push(`${feet}'${inches}"`);
                    }
                }

                // Weight
                if (profile.weight) {
                    parts.push(`${profile.weight} lbs`);
                }

                // Years of Eligibility
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
    const userMenu = document.querySelector('.user-menu');
    if (!userMenu) return;
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');

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
            viewingUserId = response.user.id;
            isOwnProfile = true;
            displayProfile(response.profile, response.user.role);

            // Load profile view count for own profile
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
            }

            // Record profile view if viewing someone else's profile
            if (!isOwnProfile) {
                recordProfileView(viewingUserId);
            }

            // Load profile view count if viewing own profile
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
    // Store the profile type globally
    currentProfileType = type;
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

    // NOTE: Don't update sidebar footer here - it should always show the logged-in user's info
    // which is set by updateNavbarForLoggedInUser()

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

    // Update bio in the About section between header and tabs
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

    // Update Contact Info section between header and tabs
    updateContactInfoSection(profile);

    // Update PFF Grade row between About/Contact and tabs (hidden when no value)
    updatePffGradeSection(profile);

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

    // Also add to dashboard container so sidebar content shows
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer) {
        dashboardContainer.classList.add('profile-loaded');
    }

    // Load offers from database (for player profiles)
    if (type === 'player') {
        loadOffers();
        // Note: Career stats are loaded via loadCareerStats() in DOMContentLoaded
        // which calls displayCareerStatsTable() and displayOverviewCareerStats()
    }

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
        'editRpAcademicsModal',
        'editRpMajorGoalsModal',
        'editRpFinancialModal',
        'editRpLevelLocationModal',
        'editRpPrioritiesModal',
        'profileViewersModal'
    ];

    modalsToRemove.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.remove();
        }
    });

    // Remove edit buttons (these should already be hidden but remove from DOM for safety)
    const editButtons = [
        'editProfileBtn',
        'changePhotoBtn',
        'addOfferBtn',
        'addStatsBtn',
        'addSeasonHighlightBtn',
        'addGameHighlightBtn'
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

    // Transfer Player Profile Meta: Previous School, Division, Eligibility, GPA
    const metaElement = document.querySelector('.profile-meta');
    if (metaElement) {
        const lines = [];

        // Row 1: Previous School (with state if available)
        if (profile.team_name) {
            const schoolWithState = profile.state ? `${profile.team_name}, ${profile.state}` : profile.team_name;
            lines.push(`<span style="color: rgba(254, 252, 251, 0.7); font-weight: 600;">Previous School:</span> <span style="color: #b91c1c; font-weight: 600;">${schoolWithState}</span>`);
        }

        // Row 2: Previous Division
        if (profile.college_division) {
            lines.push(`<span style="color: rgba(254, 252, 251, 0.7); font-weight: 600;">Previous Division:</span> <span style="color: #b91c1c; font-weight: 600;">${profile.college_division}</span>`);
        }

        // Row 3: Years of Eligibility
        if (profile.eligibility) {
            const yearText = profile.eligibility === 1 ? 'Year' : 'Years';
            lines.push(`<span style="color: rgba(254, 252, 251, 0.7); font-weight: 600;">Years of Eligibility:</span> <span style="color: #b91c1c; font-weight: 600;">${profile.eligibility} ${yearText}</span>`);
        }

        // GPA is shown in Academics section only

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

    // Update social media section
    updateSocialMedia(profile);
}

function displayCoachProfile(profile) {
    // Update position/title line
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        const parts = [];
        if (profile.position_title) parts.push(profile.position_title);
        if (profile.team_name) parts.push(profile.team_name);
        positionElement.textContent = parts.join(' • ') || 'Position not specified';
    }

    // Update meta info
    const metaElement = document.querySelector('.profile-meta');
    if (metaElement) {
        const parts = [];
        if (profile.college_division) {
            parts.push(formatDivisionDisplay(profile.college_division));
        }
        if (profile.city && profile.state) parts.push(`${profile.city}, ${profile.state}`);
        if (profile.verified) parts.push('Verified ✓');

        metaElement.innerHTML = parts.join(' <span>•</span> ') || 'Information not provided';
    }

    // NOTE: Don't update sidebar footer here - it should always show the logged-in user's info
    // which is set by updateNavbarForLoggedInUser()

    // Update info items for coach
    updateInfoItem('Title', profile.position_title);
    updateInfoItem('College', profile.team_name);
    updateInfoItem('Division', profile.college_division);

    // Update contact info
    updateContactInfo(profile);
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

// PFF Grade column — sits between About and Contact Info. Hidden when no grade
// on file (column display:none + .pff-hidden on row reverts grid to 2-col).
function updatePffGradeSection(profile) {
    const row = document.getElementById('profileInfoRow');
    const col = document.getElementById('pffGradeColumn');
    const valueEl = document.getElementById('pffGradeValue');
    if (!row || !col || !valueEl) return;
    const raw = profile && profile.pff_grade;
    if (raw !== null && raw !== undefined && raw !== '') {
        const n = parseFloat(raw);
        if (Number.isFinite(n)) {
            valueEl.textContent = n.toFixed(1);
            col.style.display = '';
            row.classList.remove('pff-hidden');
            return;
        }
    }
    col.style.display = 'none';
    row.classList.add('pff-hidden');
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
        contactInfoCard.innerHTML = '<p class="empty-state">No contact information provided.</p>';
    }
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

// Update the Social Media section in Overview tab
function updateSocialMedia(profile) {
    const socialMediaCard = document.getElementById('socialMediaCard');
    if (!socialMediaCard) return;

    // Read the real player_profiles columns (instagram_handle, hudl_profile).
    // (Legacy code parsed a profile.socials blob that was never persisted.)
    const socials = {
        hudl: (profile.hudl_profile || '').trim(),
        instagram: (profile.instagram_handle || '').trim()
    };

    const hasHudl = socials.hudl && socials.hudl.trim();
    const hasInstagram = socials.instagram && socials.instagram.trim();

    if (!hasHudl && !hasInstagram) {
        socialMediaCard.innerHTML = '<p class="empty-state-text">No social media links added yet.</p>';
        return;
    }

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
}

function updateProfileActions(hasPendingRequest = false) {
    const actionsContainer = document.querySelector('.profile-actions');
    if (!actionsContainer) return;
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');

    // Store pending request status for follow button setup
    window.hasPendingFollowRequest = hasPendingRequest;

    // Check if navigated to this profile (has username in URL) - always show back button in this case
    const urlParams = new URLSearchParams(window.location.search);
    const hasUsernameParam = urlParams.get('username') || urlParams.get('userId');

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
<!-- Share/copy-profile-link button removed per request; kept for future use
            <button class="btn-share-profile">
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

        // Setup edit profile button
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', function() {
                showEditProfileModal();
            });
        }

        // Share/copy-profile-link button removed per request; handler kept for future use
        /*
        const shareBtn = actionsContainer.querySelector('.btn-share-profile');
        if (shareBtn) {
            shareBtn.addEventListener('click', async function() {
                const profileUrl = `${getShareBaseUrl()}/transferplayer/tabs/my-profile.html?username=${currentProfile.username}`;
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
            <button class="btn-edit-profile" id="editProfileBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Profile
            </button>
<!-- Share/copy-profile-link button removed per request; kept for future use
            <button class="btn-share-profile">
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

        // Setup edit profile button
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', function() {
                showEditProfileModal();
            });
        }

        // Share/copy-profile-link button removed per request; handler kept for future use
        /*
        const shareBtn = actionsContainer.querySelector('.btn-share-profile');
        if (shareBtn) {
            shareBtn.addEventListener('click', async function() {
                const profileUrl = `${getShareBaseUrl()}/transferplayer/tabs/my-profile.html?username=${currentProfile.username}`;
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
    const messageBtn = document.getElementById('messageBtn');
    if (!messageBtn || !viewingUserId) return;
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');

    // Check message permissions
    try {
        const permissionResult = await API.get(`/follow/can-message/${viewingUserId}`);

        if (permissionResult.canMessage) {
            // Show the message button
            messageBtn.style.display = '';
            messageBtn.addEventListener('click', () => {
                // Navigate to messages page with the userId to start/open conversation
                const folder = loggedInUserFolder || 'transferplayer';
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
            const folder = loggedInUserFolder || 'transferplayer';
            window.location.href = `${FE_BASE}/${folder}/tabs/messages.html?userId=${viewingUserId}`;
        });
    }
}

// "Add to Pipeline" button (Plan 4) — POSTs directly to /api/pipeline/from-profile.
// Replaces the previous "Add to Recruiting Board" modal flow.
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

function setupAddToBoardButton() {
    const recruitingBoardBtn = document.getElementById('recruitingBoardBtn');
    if (!recruitingBoardBtn) return;

    const modal = document.getElementById('recruitingBoardModal');
    const overlay = document.getElementById('recruitingBoardModalOverlay');
    const closeBtn = document.getElementById('recruitingBoardModalClose');
    const cancelBtn = document.getElementById('recruitingBoardCancelBtn');
    const submitBtn = document.getElementById('recruitingBoardSubmitBtn');
    const boardSelect = document.getElementById('recruitingBoardSelect');
    const classYearSelect = document.getElementById('recruitingClassYear');
    const positionSelect = document.getElementById('recruitingPosition');

    if (!modal || !boardSelect || !classYearSelect || !positionSelect) return;

    // Cache for boards and position configs
    let availableBoards = [];
    let positionConfigs = {}; // Cache configs by board ID

    // Populate class year options (2026-2030)
    function populateClassYears() {
        classYearSelect.innerHTML = '<option value="">Select Class Year</option>';
        const currentYear = new Date().getFullYear();
        for (let year = currentYear + 1; year <= currentYear + 5; year++) {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = `Class of ${year}`;
            classYearSelect.appendChild(option);
        }
    }

    // Load positions into dropdown
    function populatePositions(config) {
        positionSelect.innerHTML = '<option value="">Select Position</option>';

        const allPositions = [];

        // Add offense positions
        if (config.offensePositions) {
            config.offensePositions.forEach(group => {
                if (group.positions) {
                    group.positions.forEach(pos => {
                        allPositions.push(pos);
                    });
                }
            });
        }

        // Add defense positions
        if (config.defensePositions) {
            config.defensePositions.forEach(group => {
                if (group.positions) {
                    group.positions.forEach(pos => {
                        allPositions.push(pos);
                    });
                }
            });
        }

        // Add unique positions to dropdown
        const uniquePositions = [...new Set(allPositions)];
        uniquePositions.forEach(pos => {
            const option = document.createElement('option');
            option.value = pos;
            option.textContent = pos;
            positionSelect.appendChild(option);
        });

        if (uniquePositions.length === 0) {
            positionSelect.innerHTML = '<option value="">No positions configured</option>';
        }
    }

    // Load available boards
    async function loadBoards() {
        boardSelect.innerHTML = '<option value="">Loading boards...</option>';
        classYearSelect.innerHTML = '<option value="">Select a board first</option>';
        positionSelect.innerHTML = '<option value="">Select a board first</option>';

        try {
            // Get personal board config
            const personalConfig = await API.get('/recruiting-board/personal/config');

            // Get shared boards
            const sharedResponse = await API.get('/recruiting-board/shared');

            availableBoards = [];

            // Add personal board
            availableBoards.push({
                id: 'personal',
                name: 'Personal Board',
                type: 'personal',
                config: personalConfig
            });

            // Add owned shared boards
            if (sharedResponse.ownedBoards) {
                sharedResponse.ownedBoards.forEach(board => {
                    availableBoards.push({
                        id: board.id,
                        name: board.board_name,
                        type: 'shared',
                        config: null // Will load on selection
                    });
                });
            }

            // Add collaborator boards
            if (sharedResponse.collaboratorBoards) {
                sharedResponse.collaboratorBoards.forEach(board => {
                    availableBoards.push({
                        id: board.id,
                        name: `${board.board_name} (${board.owner_first_name} ${board.owner_last_name})`,
                        type: 'shared',
                        config: null
                    });
                });
            }

            // Populate board dropdown
            boardSelect.innerHTML = '<option value="">Select a Board</option>';
            availableBoards.forEach((board, index) => {
                const option = document.createElement('option');
                option.value = index;
                option.textContent = board.name;
                boardSelect.appendChild(option);
            });

        } catch (error) {
            console.error('Error loading boards:', error);
            boardSelect.innerHTML = '<option value="">Error loading boards</option>';
        }
    }

    // Handle board selection change
    boardSelect.addEventListener('change', async () => {
        const selectedIndex = boardSelect.value;

        if (!selectedIndex) {
            classYearSelect.innerHTML = '<option value="">Select a board first</option>';
            positionSelect.innerHTML = '<option value="">Select a board first</option>';
            updateSubmitState();
            return;
        }

        const selectedBoard = availableBoards[parseInt(selectedIndex)];

        // Populate class years
        populateClassYears();

        // Load position config for selected board
        positionSelect.innerHTML = '<option value="">Loading positions...</option>';

        try {
            let config;
            if (selectedBoard.type === 'personal') {
                config = selectedBoard.config || await API.get('/recruiting-board/personal/config');
            } else {
                // Load shared board config
                if (positionConfigs[selectedBoard.id]) {
                    config = positionConfigs[selectedBoard.id];
                } else {
                    const boardData = await API.get(`/recruiting-board/shared/${selectedBoard.id}`);
                    config = {
                        offensePositions: boardData.offensePositions,
                        defensePositions: boardData.defensePositions
                    };
                    positionConfigs[selectedBoard.id] = config;
                }
            }
            populatePositions(config);
        } catch (error) {
            console.error('Error loading board config:', error);
            positionSelect.innerHTML = '<option value="">Error loading positions</option>';
        }

        updateSubmitState();
    });

    // Open modal on button click
    recruitingBoardBtn.addEventListener('click', async () => {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Reset dropdowns
        submitBtn.disabled = true;

        // Load available boards
        await loadBoards();
    });

    // Close modal functions
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (overlay) overlay.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Enable submit when all three selections are made
    function updateSubmitState() {
        submitBtn.disabled = !boardSelect.value || !classYearSelect.value || !positionSelect.value;
    }

    classYearSelect.addEventListener('change', updateSubmitState);
    positionSelect.addEventListener('change', updateSubmitState);

    // Submit handler
    submitBtn.addEventListener('click', async () => {
        const selectedBoardIndex = boardSelect.value;
        const classYear = classYearSelect.value;
        const position = positionSelect.value;

        if (!selectedBoardIndex || !classYear || !position) {
            showToast('Please select board, class year, and position', 'error');
            return;
        }

        const selectedBoard = availableBoards[parseInt(selectedBoardIndex)];

        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';

        try {
            // Transfer players are always 'transfer' type
            const playerType = 'transfer';

            // Build player data to send
            const playerData = {
                user_id: viewingUserId,
                username: currentProfile.username,
                first_name: currentProfile.first_name,
                last_name: currentProfile.last_name,
                height: currentProfile.height,
                weight: currentProfile.weight,
                team_name: currentProfile.team_name,
                state: currentProfile.state,
                college_division: currentProfile.college_division,
                profile_image_url: currentProfile.profile_image_url,
                player_type: playerType,
                position: position
            };

            // Use correct API route based on board type
            if (selectedBoard.type === 'personal') {
                await API.post(`/recruiting-board/personal/${classYear}/players`, playerData);
            } else {
                await API.post(`/recruiting-board/shared/${selectedBoard.id}/${classYear}/players`, playerData);
            }

            const boardName = selectedBoard.name;
            showToast(`${currentProfile.first_name} ${currentProfile.last_name} added to ${boardName} (${classYear})!`, 'success');
            closeModal();

            // Update button to show remove mode now
            const recruitingBoardBtn = document.getElementById('recruitingBoardBtn');
            if (recruitingBoardBtn) {
                recruitingBoardBtn.classList.add('remove-mode');
                recruitingBoardBtn.innerHTML = `
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                    Remove from Recruiting Board
                `;
                // Re-setup for remove functionality
                setupRemoveFromBoardButton([{
                    class_year: classYear,
                    position: position,
                    board_type: selectedBoard.type,
                    board_id: selectedBoard.id
                }]);
            }
        } catch (error) {
            console.error('Error adding player to board:', error);
            showToast(error.message || 'Failed to add player to board', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add to Board';
        }
    });
}

function setupRemoveFromBoardButton(boardEntries) {
    const recruitingBoardBtn = document.getElementById('recruitingBoardBtn');
    if (!recruitingBoardBtn || !viewingUserId || !currentProfile) return;

    const modal = document.getElementById('removeRecruitingBoardModal');
    const overlay = document.getElementById('removeRecruitingBoardModalOverlay');
    const closeBtn = document.getElementById('removeRecruitingBoardModalClose');
    const cancelBtn = document.getElementById('removeRecruitingBoardCancelBtn');
    const submitBtn = document.getElementById('removeRecruitingBoardSubmitBtn');
    const confirmText = document.getElementById('removeConfirmText');
    const boardInfo = document.getElementById('removeBoardInfo');
    const boardSelect = document.getElementById('removeBoardSelect');
    const boardSelectionContainer = document.getElementById('removeBoardSelection');

    if (!modal) return;

    // Remove old click listener and add new one
    const newBtn = recruitingBoardBtn.cloneNode(true);
    recruitingBoardBtn.parentNode.replaceChild(newBtn, recruitingBoardBtn);

    // Populate board selector
    function populateBoardSelector() {
        if (!boardSelect) return;

        boardSelect.innerHTML = '';

        // Add "All Boards" option if more than one board
        if (boardEntries.length > 1) {
            const allOption = document.createElement('option');
            allOption.value = 'all';
            allOption.textContent = `All Boards (${boardEntries.length})`;
            boardSelect.appendChild(allOption);
        }

        // Add individual board options
        boardEntries.forEach((entry, index) => {
            const option = document.createElement('option');
            option.value = index.toString();
            const boardName = entry.board_name || (entry.board_type === 'personal' ? 'Personal Board' : 'Shared Board');
            option.textContent = `${boardName} - Class of ${entry.class_year} (${entry.position})`;
            boardSelect.appendChild(option);
        });

        // If only one entry, select it and hide the "All" option context
        if (boardEntries.length === 1) {
            boardSelect.value = '0';
        }
    }

    // Update board info based on selection
    function updateBoardInfo() {
        if (!boardSelect || !boardInfo) return;

        const selectedValue = boardSelect.value;

        if (selectedValue === 'all') {
            const boardList = boardEntries.map(e => {
                const boardName = escapeHtml(e.board_name) || (e.board_type === 'personal' ? 'Personal Board' : 'Shared Board');
                return `${boardName} - Class of ${escapeHtml(e.class_year)} (${escapeHtml(e.position)})`;
            }).join('<br>');
            boardInfo.innerHTML = `<strong>Will remove from:</strong><br>${boardList}`;
        } else {
            const entry = boardEntries[parseInt(selectedValue)];
            if (entry) {
                const boardName = escapeHtml(entry.board_name) || (entry.board_type === 'personal' ? 'Personal Board' : 'Shared Board');
                boardInfo.innerHTML = `<strong>Will remove from:</strong> ${boardName} - Class of ${escapeHtml(entry.class_year)} (${escapeHtml(entry.position)})`;
            }
        }
    }

    // Open remove modal on button click
    newBtn.addEventListener('click', () => {
        const playerName = `${escapeHtml(currentProfile.first_name)} ${escapeHtml(currentProfile.last_name)}`;
        confirmText.innerHTML = `Remove <strong>${playerName}</strong> from recruiting board?`;

        // Populate and show the board selector
        populateBoardSelector();
        updateBoardInfo();

        // Show/hide selector based on number of entries
        if (boardSelectionContainer) {
            boardSelectionContainer.style.display = boardEntries.length > 0 ? 'block' : 'none';
        }

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    // Handle board selection change
    if (boardSelect) {
        boardSelect.addEventListener('change', updateBoardInfo);
    }

    // Close modal functions
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (overlay) overlay.addEventListener('click', closeModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Submit handler - remove from selected board(s)
    if (submitBtn) {
        submitBtn.addEventListener('click', async () => {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Removing...';

            try {
                const selectedValue = boardSelect ? boardSelect.value : 'all';
                let entriesToRemove = [];

                if (selectedValue === 'all') {
                    entriesToRemove = boardEntries;
                } else {
                    const index = parseInt(selectedValue);
                    if (boardEntries[index]) {
                        entriesToRemove = [boardEntries[index]];
                    }
                }

                // Remove from selected boards
                for (const entry of entriesToRemove) {
                    if (entry.board_type === 'shared' && entry.board_id) {
                        await API.delete(`/recruiting-board/shared/${entry.board_id}/${entry.class_year}/players/${viewingUserId}?position=${entry.position}`);
                    } else {
                        await API.delete(`/recruiting-board/personal/${entry.class_year}/players/${viewingUserId}?position=${entry.position}`);
                    }
                }

                const removedCount = entriesToRemove.length;
                const message = removedCount === 1
                    ? `${currentProfile.first_name} ${currentProfile.last_name} removed from board!`
                    : `${currentProfile.first_name} ${currentProfile.last_name} removed from ${removedCount} boards!`;
                showToast(message, 'success');
                closeModal();

                // Check if player is still on any boards
                const remainingEntries = boardEntries.filter(e => !entriesToRemove.includes(e));

                if (remainingEntries.length === 0) {
                    // Update button back to add mode
                    const currentBtn = document.getElementById('recruitingBoardBtn');
                    if (currentBtn) {
                        currentBtn.classList.remove('remove-mode');
                        currentBtn.innerHTML = `
                            <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="12" y1="8" x2="12" y2="16"></line>
                                <line x1="8" y1="12" x2="16" y2="12"></line>
                            </svg>
                            Add to Recruiting Board
                        `;
                        // Re-setup for add functionality
                        setupAddToBoardButton();
                    }
                } else {
                    // Update the boardEntries and re-setup remove button with remaining entries
                    setupRemoveFromBoardButton(remainingEntries);
                }
            } catch (error) {
                console.error('Error removing player from board:', error);
                showToast(error.message || 'Failed to remove player from board', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Remove';
            }
        });
    }
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
    const transferPortalNavItem = document.getElementById('transferPortalNav');
    const recruitingBoardNavItem = document.getElementById('recruitingBoardNav');
    const notificationsNavItem = document.querySelector('.nav-item[href*="notifications"]');

    // Check if we came from another page
    const urlParams = new URLSearchParams(window.location.search);
    const fromPage = urlParams.get('from');
    const hasUsername = urlParams.get('username') || urlParams.get('userId');

    // Remove active from all first
    if (feedNavItem) feedNavItem.classList.remove('active');
    if (profileNavItem) profileNavItem.classList.remove('active');
    if (messagesNavItem) messagesNavItem.classList.remove('active');
    if (discoverNavItem) discoverNavItem.classList.remove('active');
    if (transferPortalNavItem) transferPortalNavItem.classList.remove('active');
    if (recruitingBoardNavItem) recruitingBoardNavItem.classList.remove('active');
    if (notificationsNavItem) notificationsNavItem.classList.remove('active');

    if (!hasUsername || isOwnProfile) {
        // Viewing own profile - highlight My Profile
        if (profileNavItem) profileNavItem.classList.add('active');
    } else if (fromPage === 'recruiting' && recruitingBoardNavItem) {
        // Came from recruiting board - highlight Recruiting Board
        recruitingBoardNavItem.classList.add('active');
    } else if (fromPage === 'messages' && messagesNavItem) {
        // Came from messages page - highlight Messages
        messagesNavItem.classList.add('active');
    } else if (fromPage === 'discover' && discoverNavItem) {
        // Came from discover page - highlight Discover
        discoverNavItem.classList.add('active');
    } else if (fromPage === 'profile' && profileNavItem) {
        // Came from another profile (followers/following modal) - highlight My Profile
        profileNavItem.classList.add('active');
    } else if (fromPage === 'feed' && feedNavItem) {
        // Came from feed page - highlight Feed
        feedNavItem.classList.add('active');
    } else if (fromPage === 'transfer-portal' && transferPortalNavItem) {
        // Came from transfer portal page - highlight Transfer Portal
        transferPortalNavItem.classList.add('active');
    } else if (fromPage === 'notifications' && notificationsNavItem) {
        // Came from notifications page - highlight Notifications
        notificationsNavItem.classList.add('active');
    } else if (feedNavItem) {
        // Default: Viewing someone else's profile (from feed) - highlight Feed
        feedNavItem.classList.add('active');
    }
}

function setupUI() {
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    // Sidebar toggle functionality
    const dashboardContainer = document.getElementById('dashboardContainer');
    const rightSidebar = document.getElementById('rightSidebar');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');
    const sidebarToggle = document.getElementById('sidebarToggle');

    // Left sidebar toggle click handler
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            const isHidden = dashboardContainer.classList.toggle('sidebar-hidden');
            document.body.classList.toggle('sidebar-hidden', isHidden);
            localStorage.setItem('playerSidebarHidden', isHidden);
        });
    }

    // Right sidebar toggle click handler
    if (rightSidebarToggle) {
        rightSidebarToggle.addEventListener('click', function() {
            const isHidden = dashboardContainer.classList.toggle('right-sidebar-hidden');
            localStorage.setItem('playerRightSidebarHidden', isHidden);
        });
    }

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
    const statsPane = document.getElementById('stats');
    const highlightsPane = document.getElementById('highlights');
    // Recruiting Profile tab (AI Fit-Matching)
    const rpTab = document.querySelector('.profile-tab[data-tab="recruiting-profile"]');
    const rpPane = document.getElementById('recruiting-profile');

    if (currentProfileType === 'coach') {
        // Hide ALL player-specific tabs when viewing a coach profile
        if (statsTab) statsTab.style.display = 'none';
        if (highlightsTab) highlightsTab.style.display = 'none';
        if (statsPane) statsPane.style.display = 'none';
        if (highlightsPane) highlightsPane.style.display = 'none';
        if (rpTab) rpTab.style.display = 'none';
        if (rpPane) rpPane.style.display = 'none';
    } else if (currentProfileType === 'player') {
        // For player profiles, show all tabs
        if (statsTab) statsTab.style.display = '';
        if (highlightsTab) highlightsTab.style.display = '';
        if (statsPane) statsPane.style.display = '';
        if (highlightsPane) highlightsPane.style.display = '';

        // Recruiting Profile — visible only to the owner + college coaches.
        // When visible, it becomes the FIRST tab and the default-active pane.
        const canSeeRP = isOwnProfile || isCollegeCoach;
        if (canSeeRP && rpTab && rpPane) {
            rpTab.style.display = '';
            rpPane.style.display = '';
            const tabsWrap = document.getElementById('profileTabs');
            if (tabsWrap && tabsWrap.firstElementChild !== rpTab) {
                tabsWrap.insertBefore(rpTab, tabsWrap.firstElementChild);
            }
            document.querySelectorAll('.profile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            rpTab.classList.add('active');
            rpPane.classList.add('active');
            populateRecruitingProfile(currentProfile);
            const banner = document.getElementById('recruitingMatchBanner');
            if (banner) banner.style.display = (isCollegeCoach && !isOwnProfile) ? '' : 'none';
            if (isCollegeCoach && !isOwnProfile) renderMatchScore(null, currentProfile);
            const disclaimer = document.getElementById('recruitingDisclaimer');
            if (disclaimer) disclaimer.style.display = isOwnProfile ? '' : 'none';
            if (isOwnProfile) setupRecruitingProfileEditing();
            setupRecruitingSubnav();
        } else if (rpTab && rpPane) {
            rpTab.style.display = 'none';
            rpPane.style.display = 'none';
        }

        // Update athletics display with profile data
        if (typeof updateAthleticsDisplay === 'function') {
            updateAthleticsDisplay(currentProfile);
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
                    You haven't set up your profile yet. Complete your profile to get discovered by coaches!
                </p>
                <button onclick="window.location.href=new URL('../create-profile.html', window.location.href).href" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem;">
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
                <button onclick="window.location.href=new URL('../mainpage-player.html', window.location.href).href" style="padding: 1rem 2rem; background: var(--cerulean); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1rem; margin-top: 1rem;">
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

// ── Edit-modal parent/guardian rows (optional, up to 4) ──
const EDIT_GUARDIAN_MAX = 4;

function refreshEditGuardianUI() {
    const container = document.getElementById('editGuardianRows');
    const addBtn = document.getElementById('editAddGuardianBtn');
    if (!container) return;
    const rows = container.querySelectorAll('.guardian-row');
    rows.forEach((row, i) => {
        const title = row.querySelector('.guardian-row-title');
        if (title) title.textContent = `Parent / Guardian ${i + 1}`;
    });
    if (addBtn) addBtn.disabled = rows.length >= EDIT_GUARDIAN_MAX;
}

function addEditGuardianRow(data) {
    const container = document.getElementById('editGuardianRows');
    if (!container) return;
    if (container.querySelectorAll('.guardian-row').length >= EDIT_GUARDIAN_MAX) return;
    const d = data || {};
    const esc = (s) => String(s || '').replace(/"/g, '&quot;');
    const row = document.createElement('div');
    row.className = 'guardian-row';
    row.innerHTML = `
        <div class="guardian-row-header">
            <span class="guardian-row-title">Parent / Guardian</span>
            <button type="button" class="btn-remove-guardian" title="Remove">&times;</button>
        </div>
        <div class="form-group">
            <label>Name</label>
            <input type="text" class="guardian-name" placeholder="Full name" value="${esc(d.name)}">
        </div>
        <div class="form-row">
            <div class="form-group">
                <label>Email</label>
                <input type="email" class="guardian-email" placeholder="email@example.com" value="${esc(d.email)}">
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="tel" class="guardian-phone" placeholder="(555) 123-4567" value="${esc(formatPhoneNumber(d.phone) || '')}">
            </div>
        </div>
    `;
    row.querySelector('.btn-remove-guardian').addEventListener('click', function () {
        row.remove();
        refreshEditGuardianUI();
    });
    container.appendChild(row);
    refreshEditGuardianUI();
}

function collectEditGuardians() {
    const container = document.getElementById('editGuardianRows');
    if (!container) return [];
    const out = [];
    container.querySelectorAll('.guardian-row').forEach(row => {
        const name = (row.querySelector('.guardian-name').value || '').trim();
        const email = (row.querySelector('.guardian-email').value || '').trim();
        const phone = (row.querySelector('.guardian-phone').value || '').trim().replace(/\D/g, '');
        if (name || email || phone) out.push({ name, email, phone });
    });
    return out;
}

function validateEditGuardians(list) {
    for (const g of list) {
        if (!g.name || !g.email || !g.phone) {
            return 'Each parent/guardian needs a name, email, and phone (or remove the row).';
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)) {
            return 'Please enter a valid parent/guardian email.';
        }
    }
    return null;
}

function populateEditForm() {
    if (!currentProfile) return;

    // Wire the "Add parent/guardian" button once (modal markup is static).
    const addGuardianBtn = document.getElementById('editAddGuardianBtn');
    if (addGuardianBtn && !addGuardianBtn.dataset.wired) {
        addGuardianBtn.dataset.wired = 'true';
        addGuardianBtn.addEventListener('click', () => addEditGuardianRow());
    }

    // Populate text inputs
    document.getElementById('editFirstName').value = currentProfile.first_name || '';
    document.getElementById('editLastName').value = currentProfile.last_name || '';
    document.getElementById('editUsername').value = currentProfile.username || '';

    // Update username character counter
    const usernameCharCounter = document.getElementById('editUsernameCharCounter');
    if (usernameCharCounter) {
        usernameCharCounter.textContent = `${(currentProfile.username || '').length}/15`;
    }

    // Store original username for validation
    originalUsername = currentProfile.username || '';
    isEditUsernameAvailable = true; // Start as true since it's the current username

    // Parse height - either from string "6'1"" or from integer (total inches) or numeric string
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
        } else if (typeof currentProfile.height === 'string' && /^\d+$/.test(currentProfile.height)) {
            // Handle numeric string (total inches as string)
            const totalInches = parseInt(currentProfile.height);
            feet = Math.floor(totalInches / 12);
            inches = totalInches % 12;
        }
        document.getElementById('editHeightFt').value = feet || '';
        document.getElementById('editHeightIn').value = inches || '';
    } else {
        document.getElementById('editHeightFt').value = '';
        document.getElementById('editHeightIn').value = '';
    }

    document.getElementById('editWeight').value = currentProfile.weight || '';
    document.getElementById('editGraduationYear').value = currentProfile.graduation_year || '';
    // GPA moved to Recruiting Profile › Academics (no longer in the main edit modal)

    // PFF Grade prefill — empty input means "no grade reported"
    const editPffInput = document.getElementById('editPffGrade');
    if (editPffInput) {
        editPffInput.value = (currentProfile.pff_grade != null) ? currentProfile.pff_grade : '';
    }

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
        const eligibility = document.getElementById('editEligibility');

        if (collegeName) collegeName.value = currentProfile.team_name || '';
        if (collegeState) collegeState.value = currentProfile.state || '';
        if (division) division.value = currentProfile.college_division || '';
        if (eligibility) eligibility.value = currentProfile.eligibility || '';

        // Show school logo preview if school is in the database
        if (editSchoolSearch) {
            if (currentProfile.team_name) {
                editSchoolSearch.preselectSchool(currentProfile.team_name);
            } else {
                editSchoolSearch.clearSelection();
            }
        }
    } else {
        // Show high school fields and set active button
        if (schoolTypeHS) schoolTypeHS.classList.add('active');
        if (schoolTypeCollege) schoolTypeCollege.classList.remove('active');
        if (highschoolFields) highschoolFields.style.display = 'block';
        if (collegeFields) collegeFields.style.display = 'none';

        // Populate high school fields
        const highSchoolName = document.getElementById('editHighSchool');
        const hsState = document.getElementById('editHSState');

        if (highSchoolName) highSchoolName.value = currentProfile.team_name || '';
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

    // Recruiting contact fields (private; CSV export)
    const editDob = document.getElementById('editDateOfBirth');
    if (editDob) editDob.value = currentProfile.date_of_birth ? String(currentProfile.date_of_birth).slice(0, 10) : '';
    const editGender = document.getElementById('editGender');
    if (editGender) editGender.value = currentProfile.gender || '';
    const editAddress = document.getElementById('editAddress');
    if (editAddress) editAddress.value = currentProfile.address || '';
    const editCity = document.getElementById('editCity');
    if (editCity) editCity.value = currentProfile.city || '';
    const editZip = document.getElementById('editZip');
    if (editZip) editZip.value = currentProfile.zip || '';
    const coachHeading = document.getElementById('editCoachHeading');
    if (coachHeading) coachHeading.textContent = (currentProfile.transfer === 'y') ? 'Previous Coach' : 'HS Coach';
    const editCoachName = document.getElementById('editCoachName');
    if (editCoachName) editCoachName.value = currentProfile.coach_name || '';
    const editCoachEmail = document.getElementById('editCoachEmail');
    if (editCoachEmail) editCoachEmail.value = currentProfile.coach_email || '';
    const editCoachPhone = document.getElementById('editCoachPhone');
    if (editCoachPhone) editCoachPhone.value = formatPhoneNumber(currentProfile.coach_phone) || '';
    const guardianContainer = document.getElementById('editGuardianRows');
    if (guardianContainer) {
        guardianContainer.innerHTML = '';
        const list = Array.isArray(currentProfile.parent_guardians) ? currentProfile.parent_guardians : [];
        list.slice(0, 4).forEach(g => addEditGuardianRow(g));
        refreshEditGuardianUI();
    }

    // Populate social media fields from the real columns (instagram_handle,
    // hudl_profile) — not the legacy profile.socials blob that was never saved.
    const hudlLink = document.getElementById('editHudlLink');
    const instagramLink = document.getElementById('editInstagramLink');
    if (hudlLink) hudlLink.value = currentProfile.hudl_profile || '';
    if (instagramLink) instagramLink.value = currentProfile.instagram_handle || '';

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
            showToast('Please select at least one position.', 'warning');
            return;
        }

        // Validate username is available (if it was changed)
        const newUsername = document.getElementById('editUsername').value.trim();
        if (newUsername !== originalUsername && !isEditUsernameAvailable) {
            // Just focus on the username field and keep modal open - don't show alert
            document.getElementById('editUsername').focus();
            return;
        }

        // Validate parent/guardian rows (each shown row is all-or-nothing).
        const guardianList = collectEditGuardians();
        const guardianErr = validateEditGuardians(guardianList);
        if (guardianErr) {
            showToast(guardianErr, 'warning');
            return;
        }

        // Show loading state
        const saveBtn = document.getElementById('btnModalSave');
        const originalText = saveBtn.textContent;
        saveBtn.textContent = 'Saving...';
        saveBtn.disabled = true;

        // Convert height to total inches for storage
        const heightFt = parseInt(document.getElementById('editHeightFt').value) || 0;
        const heightIn = parseInt(document.getElementById('editHeightIn').value) || 0;
        const heightTotalInches = (heightFt > 0 || heightIn > 0) ? (heightFt * 12) + heightIn : null;

        // Get phone number and extract only digits for storage
        const phoneInput = document.getElementById('editPhone').value;
        const phoneDigits = phoneInput.replace(/\D/g, '');
        const coachPhoneDigits = (document.getElementById('editCoachPhone')?.value || '').replace(/\D/g, '');

        // Determine which school type is active
        // For transfer players, there's no school type toggle - they're always college players
        const schoolTypeCollege = document.getElementById('editSchoolTypeCollege');
        const isCollegePlayer = !schoolTypeCollege || schoolTypeCollege.classList.contains('active');

        // Get form data - save positions as slash-separated string
        const formData = {
            first_name: document.getElementById('editFirstName').value,
            last_name: document.getElementById('editLastName').value,
            username: document.getElementById('editUsername').value,
            position: editSelectedPositions.join('/'), // Join multiple positions with slash (e.g., "CB/WR")
            height: heightTotalInches, // Store as total inches (e.g., 73 for 6'1")
            weight: document.getElementById('editWeight').value ? parseInt(document.getElementById('editWeight').value) : null,
            graduation_year: document.getElementById('editGraduationYear').value ? parseInt(document.getElementById('editGraduationYear').value) : null,
            bio: document.getElementById('editBio').value,
            email: document.getElementById('editEmail').value,
            phone: phoneDigits,
            // Recruiting contact fields (private; CSV export)
            date_of_birth: document.getElementById('editDateOfBirth')?.value || null,
            gender: document.getElementById('editGender')?.value || null,
            address: (document.getElementById('editAddress')?.value || '').trim() || null,
            city: (document.getElementById('editCity')?.value || '').trim() || null,
            zip: (document.getElementById('editZip')?.value || '').trim() || null,
            coach_name: (document.getElementById('editCoachName')?.value || '').trim() || null,
            coach_email: (document.getElementById('editCoachEmail')?.value || '').trim() || null,
            coach_phone: coachPhoneDigits || null,
            parent_guardians: guardianList
        };

        // Add school fields based on type
        if (isCollegePlayer) {
            formData.team_name = document.getElementById('editCollegeName').value;
            formData.state = document.getElementById('editCollegeState').value;
            formData.college_division = document.getElementById('editDivision').value;
            const eligibilityValue = document.getElementById('editEligibility').value;
            formData.eligibility = eligibilityValue ? parseInt(eligibilityValue) : null;
        } else {
            formData.team_name = document.getElementById('editHighSchool').value;
            formData.state = document.getElementById('editHSState').value;
            formData.college_division = null; // Clear college division for HS players
        }

        // PFF Grade — blank input means NULL (clears any existing grade)
        const pffRaw = document.getElementById('editPffGrade').value;
        formData.pff_grade = pffRaw === '' ? null : (parseFloat(pffRaw) || null);

        // Social / film links — write the REAL player_profiles columns
        // (instagram_handle, hudl_profile). These are allowlisted in
        // PlayerProfile.update(); the old formData.socials blob had no column and
        // was silently dropped.
        const hudlLink = document.getElementById('editHudlLink');
        const instagramLink = document.getElementById('editInstagramLink');
        formData.instagram_handle = (instagramLink ? instagramLink.value.trim() : '') || null;
        formData.hudl_profile = (hudlLink ? hudlLink.value.trim() : '') || null;

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

            // Restore the signed/full image URL if the API returned an unsigned S3 key
            // (S3 keys start with 'profiles/' while displayable URLs start with 'http')
            if (currentSignedImageUrl && currentSignedImageUrl.startsWith('http')) {
                // Check if the response has an unsigned S3 key or no image URL
                if (!currentProfile.profile_image_url || currentProfile.profile_image_url.startsWith('profiles/')) {
                    currentProfile.profile_image_url = currentSignedImageUrl;
                }
            }

            // Refresh the profile display
            displayProfile(currentProfile, 'player');

            // Keep the Recruiting Profile tab in sync (if present/visible)
            if (typeof populateRecruitingProfile === 'function') {
                populateRecruitingProfile(currentProfile);
            }

            // Update athletics display
            if (typeof updateAthleticsDisplay === 'function') {
                updateAthleticsDisplay(currentProfile);
            }

            // Update sidebar footer with fresh data from database
            await updateSidebarFooterFromAPI();

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
        showToast('Failed to save profile changes: ' + error.message, 'error');

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

            // Update character counter
            const charCounter = document.getElementById('editUsernameCharCounter');
            if (charCounter) {
                charCounter.textContent = `${this.value.length}/15`;
            }

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

// School logos data (loaded once)
let schoolLogosData = null;
let schoolNamesList = []; // sorted A-Z for dropdown
let selectedOfferSchool = null; // { name, division, logo }

async function loadSchoolLogosData() {
    if (schoolLogosData) return schoolLogosData;
    try {
        const response = await fetch('../../assets/school-logos.json');
        schoolLogosData = await response.json();
        schoolNamesList = Object.keys(schoolLogosData).sort((a, b) => a.localeCompare(b));
        return schoolLogosData;
    } catch (error) {
        console.error('Error loading school logos data:', error);
        return null;
    }
}

function getSchoolLogoPath(logoFile) {
    if (!logoFile) return null;
    return `../../assets/logos/${logoFile}`;
}

// Fuzzy search: matches if all typed words appear somewhere in the school name (case-insensitive)
function fuzzyMatchSchool(query, schoolName) {
    const queryLower = query.toLowerCase().trim();
    const nameLower = schoolName.toLowerCase();

    if (!queryLower) return 0;

    // Exact full match
    if (nameLower === queryLower) return 100;

    // Name starts with query (e.g., "georgia" → "Georgia Southern...")
    if (nameLower.startsWith(queryLower)) return 90;

    // A word in the name starts with the full query (e.g., "georgia" in "University of Georgia")
    const nameWords = nameLower.split(/[\s,()]+/).filter(Boolean);
    if (nameWords.some(w => w.startsWith(queryLower))) return 80;

    // Exact substring match (query appears somewhere in name)
    if (nameLower.includes(queryLower)) return 70;

    // Multi-word query: all words appear in name
    const queryWords = queryLower.split(/\s+/).filter(Boolean);
    if (queryWords.length > 1) {
        const allMatch = queryWords.every(w => nameLower.includes(w));
        if (allMatch) {
            // Boost score by how much of the name the query covers
            const coverage = queryLower.length / nameLower.length;
            return 50 + Math.round(coverage * 30);
        }

        // Most words match (allow 1 miss)
        const matchCount = queryWords.filter(w => nameLower.includes(w)).length;
        if (matchCount >= queryWords.length - 1) return 30;
    }

    // Single word: check if it starts any word in the name
    if (queryWords.length === 1 && nameWords.some(w => w.startsWith(queryWords[0]))) return 60;

    return 0;
}

function renderSchoolDropdown(query) {
    const dropdown = document.getElementById('schoolSearchDropdown');
    if (!dropdown || !schoolLogosData) return;

    if (!query || query.length < 1) {
        // Show all schools A-Z when input is focused with no query
        const html = schoolNamesList.map(name => {
            const school = schoolLogosData[name];
            const logoPath = getSchoolLogoPath(school.logo);
            const logoHTML = logoPath
                ? `<img src="${logoPath}" alt="" class="school-dropdown-logo">`
                : `<svg class="school-dropdown-logo-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>`;
            return `<div class="school-dropdown-item" data-school-name="${name.replace(/"/g, '&quot;')}">
                ${logoHTML}
                <div class="school-dropdown-info">
                    <span class="school-dropdown-name">${name}</span>
                    <span class="school-dropdown-division">${school.division || ''}</span>
                </div>
            </div>`;
        }).join('');
        dropdown.innerHTML = html;
        dropdown.classList.add('active');
        return;
    }

    // Fuzzy search and rank results
    const results = [];
    for (const name of schoolNamesList) {
        const score = fuzzyMatchSchool(query, name);
        if (score > 0) results.push({ name, score });
    }
    results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    results.splice(20); // Show top 20 matches only

    if (results.length === 0) {
        dropdown.innerHTML = '<div class="school-dropdown-empty">No schools found</div>';
        dropdown.classList.add('active');
        return;
    }

    const html = results.map(({ name }) => {
        const school = schoolLogosData[name];
        const logoPath = getSchoolLogoPath(school.logo);
        const logoHTML = logoPath
            ? `<img src="${logoPath}" alt="" class="school-dropdown-logo">`
            : `<svg class="school-dropdown-logo-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>`;
        return `<div class="school-dropdown-item" data-school-name="${name.replace(/"/g, '&quot;')}">
            ${logoHTML}
            <div class="school-dropdown-info">
                <span class="school-dropdown-name">${name}</span>
                <span class="school-dropdown-division">${school.division || ''}</span>
            </div>
        </div>`;
    }).join('');
    dropdown.innerHTML = html;
    dropdown.classList.add('active');
}

function selectSchool(schoolName) {
    const school = schoolLogosData[schoolName];
    if (!school) return;

    selectedOfferSchool = {
        name: schoolName,
        division: school.division || '',
        logo: school.logo || null
    };

    // Hide search input, show preview
    const searchInput = document.getElementById('offerSchoolSearch');
    const dropdown = document.getElementById('schoolSearchDropdown');
    const preview = document.getElementById('offerSchoolPreview');
    const searchWrapper = searchInput?.closest('.form-group');

    if (searchWrapper) searchWrapper.style.display = 'none';
    if (dropdown) dropdown.classList.remove('active');

    // Populate preview
    const previewLogo = document.getElementById('offerPreviewLogo');
    const previewName = document.getElementById('offerPreviewName');
    const previewDivision = document.getElementById('offerPreviewDivision');

    if (previewLogo) {
        const logoPath = getSchoolLogoPath(selectedOfferSchool.logo);
        if (logoPath) {
            previewLogo.innerHTML = `<img src="${logoPath}" alt="${schoolName}">`;
        } else {
            previewLogo.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>`;
        }
    }
    if (previewName) previewName.textContent = schoolName;
    if (previewDivision) previewDivision.textContent = selectedOfferSchool.division;
    if (preview) preview.style.display = 'flex';
}

function clearSchoolSelection() {
    selectedOfferSchool = null;

    const searchInput = document.getElementById('offerSchoolSearch');
    const preview = document.getElementById('offerSchoolPreview');
    const searchWrapper = searchInput?.closest('.form-group');

    if (searchWrapper) searchWrapper.style.display = 'flex';
    if (preview) preview.style.display = 'none';
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
}

function initOfferSchoolSearch() {
    const searchInput = document.getElementById('offerSchoolSearch');
    const dropdown = document.getElementById('schoolSearchDropdown');
    const btnCantFind = document.getElementById('btnCantFindSchool');
    const btnBackToSearch = document.getElementById('btnBackToSearch');
    const previewClear = document.getElementById('offerPreviewClear');

    if (!searchInput) return;

    // Load data
    loadSchoolLogosData();

    // Search input events
    searchInput.addEventListener('input', () => {
        renderSchoolDropdown(searchInput.value.trim());
    });

    searchInput.addEventListener('focus', () => {
        if (schoolLogosData) {
            renderSchoolDropdown(searchInput.value.trim());
        }
    });

    // Click on dropdown item
    if (dropdown) {
        dropdown.addEventListener('click', (e) => {
            const item = e.target.closest('.school-dropdown-item');
            if (item) {
                const schoolName = item.dataset.schoolName;
                selectSchool(schoolName);
            }
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (dropdown && !e.target.closest('.school-search-wrapper')) {
            dropdown.classList.remove('active');
        }
    });

    // Clear selection
    if (previewClear) {
        previewClear.addEventListener('click', clearSchoolSelection);
    }

    // Toggle manual mode
    if (btnCantFind) {
        btnCantFind.addEventListener('click', () => {
            document.getElementById('offerSearchMode').style.display = 'none';
            document.getElementById('offerManualMode').style.display = 'block';
            selectedOfferSchool = null;
        });
    }

    if (btnBackToSearch) {
        btnBackToSearch.addEventListener('click', () => {
            document.getElementById('offerManualMode').style.display = 'none';
            document.getElementById('offerSearchMode').style.display = 'block';
            document.getElementById('offerCollegeName').value = '';
            document.getElementById('offerDivision').value = '';
        });
    }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initOfferSchoolSearch();
});

// Add Offer Modal Functions
function showAddOfferModal() {
    const modal = document.getElementById('addOfferModal');
    if (modal) {
        // Reset to search mode
        const searchMode = document.getElementById('offerSearchMode');
        const manualMode = document.getElementById('offerManualMode');
        if (searchMode) searchMode.style.display = 'block';
        if (manualMode) manualMode.style.display = 'none';

        // Clear search
        const searchInput = document.getElementById('offerSchoolSearch');
        if (searchInput) searchInput.value = '';
        clearSchoolSelection();

        // Clear manual form
        document.getElementById('offerCollegeName').value = '';
        document.getElementById('offerDivision').value = '';

        // Close dropdown
        const dropdown = document.getElementById('schoolSearchDropdown');
        if (dropdown) dropdown.classList.remove('active');

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Load school data if not loaded
        loadSchoolLogosData();
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
    let collegeName, division, logoFile;

    const manualMode = document.getElementById('offerManualMode');
    const isManual = manualMode && manualMode.style.display !== 'none';

    if (isManual) {
        // Manual entry
        collegeName = document.getElementById('offerCollegeName').value.trim();
        division = document.getElementById('offerDivision').value;
        logoFile = null;

        if (!collegeName) {
            showToast('Please enter a college or university name.', 'warning');
            return;
        }
        if (!division) {
            showToast('Please select a division.', 'warning');
            return;
        }
    } else {
        // Search mode - must have selected a school
        if (!selectedOfferSchool) {
            showToast('Please select a school from the dropdown.', 'warning');
            return;
        }
        collegeName = selectedOfferSchool.name;
        division = selectedOfferSchool.division;
        logoFile = selectedOfferSchool.logo;
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
            addOfferToGrid(collegeName, division, true, null, logoFile);

            // Show success message
            showSuccessMessage('Offer added successfully!');

            // Close modal
            hideAddOfferModal();
        } else {
            throw new Error(response.error || 'Failed to add offer');
        }
    } catch (error) {
        console.error('Error saving offer:', error);
        showToast('Failed to add offer: ' + error.message, 'error');
    } finally {
        // Restore button
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

function addOfferToGrid(collegeName, division, addToTop = false, offerIndex = null, logoFile = undefined) {
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

    // Look up logo from school-logos.json if not explicitly provided
    if (logoFile === undefined && schoolLogosData && schoolLogosData[collegeName]) {
        logoFile = schoolLogosData[collegeName].logo;
    }

    const logoPath = logoFile ? getSchoolLogoPath(logoFile) : null;
    const logoHTML = logoPath
        ? `<img src="${logoPath}" alt="${collegeName}">`
        : `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                    <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                </svg>`;

    // Create new offer item HTML with data attributes and click handler (only for own profile in offers tab)
    const clickableClass = isOwnProfile ? 'offer-item-clickable' : '';
    const offerHTML = `
        <div class="offer-item ${clickableClass}" data-offer-index="${offerIndex}" data-college="${collegeName}" data-division="${division}">
            <div class="offer-logo">
                ${logoHTML}
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
                ${logoHTML}
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
        // Ensure school logos data is loaded for logo display
        await loadSchoolLogosData();

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
            // No offers - show empty state message and hide the "Show More" button
            if (offersGridFull) {
                offersGridFull.innerHTML = '<div class="no-offers-message">No offers yet.</div>';
            }
            if (offersGrid) {
                offersGrid.innerHTML = '<div class="no-offers-message">No offers yet.</div>';
            }
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
    const preview = document.getElementById('editOfferPreview');

    if (modal && indexInput && preview) {
        indexInput.value = index;

        // Build preview with logo
        let logoHTML = '';
        if (schoolLogosData && schoolLogosData[collegeName] && schoolLogosData[collegeName].logo) {
            const logoPath = getSchoolLogoPath(schoolLogosData[collegeName].logo);
            logoHTML = `<img src="${logoPath}" alt="${collegeName}">`;
        } else {
            logoHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>`;
        }

        preview.innerHTML = `
            <div class="edit-offer-preview-logo">${logoHTML}</div>
            <div class="edit-offer-preview-info">
                <div class="edit-offer-preview-name">${collegeName}</div>
                <div class="edit-offer-preview-division">${division}</div>
            </div>
        `;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
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
        showToast('Please enter a college or university name.', 'warning');
        return;
    }
    if (!division) {
        showToast('Please select a division.', 'warning');
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
        showToast('Failed to update offer: ' + error.message, 'error');
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
        showToast('Failed to delete offer: ' + error.message, 'error');
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
    // Bottom-centered, above the mobile bottom nav (76px) + iOS home indicator
    // (env(safe-area-inset-bottom); 0 on web/desktop). Keeps toasts clear of the
    // top status bar/notch and the bottom nav on every page.
    toast.style.cssText = `
        position: fixed;
        bottom: calc(88px + env(safe-area-inset-bottom, 0px));
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: ${bgColor};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 10001;
        opacity: 0;
        transition: opacity 0.3s ease-out, transform 0.3s ease-out;
        font-size: 0.95rem;
        font-weight: 500;
    `;

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
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
                const fieldId = `stat_${position}_${stat.replace(/[^a-zA-Z0-9%]/g, '_').toLowerCase()}`;
                const input = document.getElementById(fieldId);
                if (input && input.value) {
                    // Convert stat name to snake_case for storage
                    const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
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
            const fieldId = `stat_${position}_${stat.replace(/[^a-zA-Z0-9%]/g, '_').toLowerCase()}`;
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

// Note: setupAddStatsModal is defined above but NOT used for transfer players.
// Transfer players use setupTransferAddStatsModal (for career stats only, no game-by-game).
// See initialization at the bottom of this file.

// ============================================
// LOAD AND DISPLAY GAME STATS
// ============================================

let allGamesData = []; // Store all games for filtering
let selectedSeasonYear = null; // Currently selected season year

async function loadGameStats() {
    try {
        let response;
        if (!isOwnProfile && currentProfile && currentProfile.username) {
            response = await API.get(`/stats/player/${currentProfile.username}`);
        } else {
            response = await API.get('/stats/my-games');
        }
        if (response.games) {
            allGamesData = response.games;

            // Parse position_stats for all games first
            parseAllGamesData(allGamesData);

            // Extract unique season years and update dropdown
            updateSeasonDropdown(allGamesData);

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


    // Clear container
    container.innerHTML = '';

    if (!games || games.length === 0) {
        container.innerHTML = '<div class="no-stats-message">No games recorded yet.</div>';
        return;
    }

    // Filter games by season year if specified
    let filteredGames = games;
    if (filterYear) {
        filteredGames = games.filter(game => parseInt(game.season_year) === parseInt(filterYear));
    }

    if (filteredGames.length === 0) {
        container.innerHTML = '<div class="no-stats-message">No games recorded for this season.</div>';
        return;
    }

    // Debug: Log first game's position_stats

    // Define position categories
    const offensivePositions = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'];
    const defensivePositions = ['DE', 'DT', 'NT', 'ILB', 'OLB', 'CB', 'S'];
    const specialPositions = ['K', 'P', 'LS'];

    // Define stats by category (keys must match how they're stored in DB via POSITION_STATS conversion)
    // POSITION_STATS uses uppercase labels that get converted: 'RUSH YDS' -> 'rush_yds', 'TACKLES' -> 'tackles', etc.
    const offensiveStats = ['rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp_%', 'rec', 'rec_yds', 'rec_td', 'rec_tds', 'total_tds'];
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
        let rowCount = 0;

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

            rowCount++;
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

                const suffix = stat === 'comp_%' ? '%' : '';
                bodyHtml += `<td>${displayValue}${suffix}</td>`;
            });

            bodyHtml += '</tr>';
        });

        // If no rows were added, don't create the table
        if (bodyHtml === '') return '';

        // Add totals row
        bodyHtml += '<tr class="totals-row">';
        bodyHtml += '<td><strong>TOTAL</strong></td>';
        sortedStats.forEach(stat => {
            let total = totals[stat];
            if (stat === 'comp_%' && rowCount > 0) {
                total = total / rowCount;
            }
            const suffix = stat === 'comp_%' ? '%' : '';
            const displayTotal = Number.isInteger(total) ? total : total.toFixed(1);
            bodyHtml += `<td><strong>${displayTotal}${suffix}</strong></td>`;
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
        container.innerHTML = '<div class="no-stats-message">No games recorded yet.</div>';
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
    const offensiveStats = ['rush_yds', 'rush_tds', 'pass_yds', 'pass_tds', 'ints', 'comp_%', 'rec', 'rec_yds', 'rec_td', 'rec_tds', 'total_tds'];
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

    // Get sorted season years (ascending - latest at bottom)
    const seasonYears = Object.keys(gamesBySeason).sort((a, b) => a - b);

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
        let seasonCount = 0;

        let bodyHtml = '';
        seasonYears.forEach(year => {
            const { totals, gamesCount } = calculateSeasonTotals(gamesBySeason[year], categoryPositions, sortedStats);

            if (gamesCount === 0) return; // Skip seasons with no games for this category

            careerGamesCount += gamesCount;
            seasonCount++;

            bodyHtml += `<tr>`;
            bodyHtml += `<td>${year}</td>`;
            bodyHtml += `<td>${gamesCount}</td>`;

            sortedStats.forEach(stat => {
                let displayVal = totals[stat];
                if (stat === 'comp_%' && gamesCount > 0) {
                    // Average comp % for this season, accumulate season average for career
                    displayVal = displayVal / gamesCount;
                    careerTotals[stat] += displayVal;
                } else {
                    careerTotals[stat] += totals[stat];
                }
                const suffix = stat === 'comp_%' ? '%' : '';
                const displayValue = Number.isInteger(displayVal) ? displayVal : displayVal.toFixed(1);
                bodyHtml += `<td>${displayValue}${suffix}</td>`;
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
            let total = careerTotals[stat];
            // Comp % career total = average of season averages
            if (stat === 'comp_%' && seasonCount > 0) {
                total = total / seasonCount;
            }
            const suffix = stat === 'comp_%' ? '%' : '';
            const displayTotal = Number.isInteger(total) ? total : total.toFixed(1);
            bodyHtml += `<td><strong>${displayTotal}${suffix}</strong></td>`;
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
            let value = totals[stat];
            // Comp % should show average, not sum
            if (stat === 'comp_%' && gamesCount > 0) {
                value = value / gamesCount;
            }
            const suffix = stat === 'comp_%' ? '%' : '';
            const displayValue = Number.isInteger(value) ? value : value.toFixed(1);
            const label = statLabels[stat] || stat.replace(/_/g, ' ').toUpperCase();
            html += `
                <div class="stat-box">
                    <div class="stat-value">${displayValue}${suffix}</div>
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
            const fieldId = `edit_stat_${position}_${stat.replace(/[^a-zA-Z0-9%]/g, '_').toLowerCase()}`;
            const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
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
            const fieldId = `edit_stat_${position}_${stat.replace(/[^a-zA-Z0-9%]/g, '_').toLowerCase()}`;
            const input = document.getElementById(fieldId);
            if (input && input.value) {
                const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
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

// Note: The game stats edit modal (setupEditStatsModal above) is NOT used for transfer players.
// Transfer players use the career stats edit modal defined later in this file.
// See initialization in the "TRANSFER PLAYER CAREER STATS" section at the bottom.

// ============================================
// TRANSFER PLAYER CAREER STATS (Position-specific like hsplayer)
// ============================================

// Note: POSITION_STATS is defined earlier in this file (around line 3093)
// Note: selectedStatsPositions is defined earlier in this file (around line 2653)

let careerStatsData = []; // Store career stats for transfer players
let lastSeasonStatsData = []; // Store last season stats for transfer players
let currentEditStatsPosition = null;
let currentStatsType = 'career'; // 'career' or 'lastseason'

// Setup Add Stats Modal for transfer player stats
function setupTransferAddStatsModal() {
    const addStatsModal = document.getElementById('addStatsModal');
    const addStatsModalOverlay = document.getElementById('addStatsModalOverlay');
    const addStatsModalClose = document.getElementById('addStatsModalClose');
    const addStatsBtn = document.getElementById('addStatsBtn');
    const btnAddStatsCancel = document.getElementById('btnAddStatsCancel');
    const btnAddStatsSave = document.getElementById('btnAddStatsSave');
    const btnSelectPosition = document.getElementById('btnSelectPosition');
    const positionDropdown = document.getElementById('positionDropdown');
    const statsPositionInput = document.getElementById('statsPositionInput');
    const btnCareerStats = document.getElementById('btnCareerStats');
    const btnLastSeasonStats = document.getElementById('btnLastSeasonStats');

    if (!addStatsModal) return;

    // Stats type toggle handlers
    if (btnCareerStats) {
        btnCareerStats.addEventListener('click', () => {
            currentStatsType = 'career';
            btnCareerStats.classList.add('active');
            if (btnLastSeasonStats) btnLastSeasonStats.classList.remove('active');
        });
    }

    if (btnLastSeasonStats) {
        btnLastSeasonStats.addEventListener('click', () => {
            currentStatsType = 'lastseason';
            btnLastSeasonStats.classList.add('active');
            if (btnCareerStats) btnCareerStats.classList.remove('active');
        });
    }

    // Open Add Stats modal
    if (addStatsBtn) {
        addStatsBtn.addEventListener('click', () => {
            resetStatsModal();
            addStatsModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    // Close modal functions
    function closeAddStatsModal() {
        addStatsModal.classList.remove('active');
        document.body.style.overflow = '';
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

    // Position selection toggle
    if (btnSelectPosition) {
        btnSelectPosition.addEventListener('click', () => {
            positionDropdown.classList.toggle('active');
        });
    }

    // Position option click handlers
    document.querySelectorAll('#positionDropdown .position-option').forEach(option => {
        option.addEventListener('click', () => {
            const position = option.dataset.position;
            if (!selectedStatsPositions.includes(position)) {
                selectedStatsPositions.push(position);
                option.classList.add('selected');
                option.classList.add('added');
                updatePositionInput();
                addPositionStatsFields(position);
            }
            positionDropdown.classList.remove('active');
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.stats-position-selector') && positionDropdown) {
            positionDropdown.classList.remove('active');
        }
    });

    // Save stats handler
    if (btnAddStatsSave) {
        btnAddStatsSave.addEventListener('click', async () => {
            await saveTransferStats();
        });
    }
}

function resetStatsModal() {
    selectedStatsPositions = [];
    currentStatsType = 'career'; // Reset to career stats

    const statsPositionInput = document.getElementById('statsPositionInput');
    const positionDropdown = document.getElementById('positionDropdown');
    const btnCareerStats = document.getElementById('btnCareerStats');
    const btnLastSeasonStats = document.getElementById('btnLastSeasonStats');

    if (statsPositionInput) statsPositionInput.value = '';
    if (positionDropdown) positionDropdown.classList.remove('active');

    // Reset stats type buttons
    if (btnCareerStats) btnCareerStats.classList.add('active');
    if (btnLastSeasonStats) btnLastSeasonStats.classList.remove('active');

    // Remove selected class from all position options
    document.querySelectorAll('#positionDropdown .position-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.classList.remove('added');
    });

    // Clear stats fields container
    const container = document.getElementById('statsFieldsContainer');
    if (container) container.innerHTML = '';
}

function updatePositionInput() {
    const statsPositionInput = document.getElementById('statsPositionInput');
    if (statsPositionInput) {
        statsPositionInput.value = selectedStatsPositions.join(', ');
    }
}

// Note: addPositionStatsFields and removePositionStats are defined earlier in this file (around lines 3114 and 3168)

async function saveTransferStats() {
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
            const fieldId = `stat_${position}_${stat.replace(/[^a-zA-Z0-9%]/g, '_').toLowerCase()}`;
            const input = document.getElementById(fieldId);
            // Convert stat name to snake_case for storage
            const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
            // Store 0 if empty, otherwise store the value
            positionStats[statKey] = input && input.value !== '' ? (parseFloat(input.value) || 0) : 0;
        });

        // Always add position (even with all zeros)
        positions[position] = positionStats;
    });

    // Disable save button while saving
    const btnSave = document.getElementById('btnAddStatsSave');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';
    }

    // Determine season_year based on stats type
    // 0 = career stats, -1 = last season stats
    const seasonYear = currentStatsType === 'career' ? 0 : -1;
    const opponentLabel = currentStatsType === 'career' ? 'Career Stats' : 'Last Season Stats';

    try {
        const response = await API.post('/stats', {
            opponent: opponentLabel,
            positions,
            season_year: seasonYear
        });

        if (response.success) {
            const message = currentStatsType === 'career'
                ? 'Career stats saved successfully!'
                : 'Last season stats saved successfully!';
            showToast(message, 'success');

            // Close modal
            const addStatsModal = document.getElementById('addStatsModal');
            if (addStatsModal) {
                addStatsModal.classList.remove('active');
                document.body.style.overflow = '';
            }

            // Reload stats
            await loadTransferStats();
        } else {
            throw new Error(response.error || 'Failed to save stats');
        }
    } catch (error) {
        console.error('Error saving stats:', error);
        showToast('Failed to save stats. Please try again.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Save Stats';
        }
    }
}

// Load transfer player stats from API (both career and last season)
async function loadTransferStats() {
    try {
        let response;
        if (!isOwnProfile && currentProfile && currentProfile.username) {
            response = await API.get(`/stats/player/${currentProfile.username}`);
        } else {
            response = await API.get('/stats/my-games');
        }
        if (response.games) {
            const allGames = response.games;

            // Parse position_stats for all games
            allGames.forEach(game => {
                if (typeof game.position_stats === 'string') {
                    try {
                        game.position_stats = JSON.parse(game.position_stats);
                    } catch (e) {
                        game.position_stats = [];
                    }
                }
                if (!Array.isArray(game.position_stats)) {
                    game.position_stats = [];
                }
            });

            // Separate career stats (season_year = 0) from last season stats (season_year = -1)
            careerStatsData = allGames.filter(g => g.season_year === 0);
            lastSeasonStatsData = allGames.filter(g => g.season_year === -1);

            // Display stats
            displayTransferStatsTable(careerStatsData, lastSeasonStatsData);
            displayOverviewTransferStats(careerStatsData, lastSeasonStatsData);
        }
    } catch (error) {
        console.error('Error loading transfer stats:', error);
    }
}

// Alias for backwards compatibility
async function loadCareerStats() {
    return loadTransferStats();
}

// Display transfer stats in the Stats tab (both career and last season)
function displayTransferStatsTable(careerGames, lastSeasonGames) {
    const container = document.getElementById('careerStatsTablesContainer');
    if (!container) return;

    // Clear container
    container.innerHTML = '';

    const hasCareerStats = careerGames && careerGames.length > 0;
    const hasLastSeasonStats = lastSeasonGames && lastSeasonGames.length > 0;

    if (!hasCareerStats && !hasLastSeasonStats) {
        container.innerHTML = '<div class="no-stats-message">No statistics recorded yet.</div>';
        return;
    }

    let html = '';

    // Last Season Stats Section
    if (hasLastSeasonStats) {
        html += '<div class="stats-section-wrapper">';
        html += '<h2>Last Season Stats</h2>';
        html += buildStatsDisplay(lastSeasonGames, 'lastseason');
        html += '</div>';
    }

    // Career Stats Section
    if (hasCareerStats) {
        html += '<div class="stats-section-wrapper">';
        html += '<h2>Career Stats</h2>';
        html += buildStatsDisplay(careerGames, 'career');
        html += '</div>';
    }

    container.innerHTML = html;

    // Add click handlers for editing stats
    setupStatsClickHandlers();
}

function buildStatsDisplay(games, statsType) {
    // Define position categories
    const offensivePositions = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'];
    const defensivePositions = ['DE', 'DT', 'NT', 'ILB', 'OLB', 'CB', 'S'];
    const specialPositions = ['K', 'P', 'LS'];

    // Collect stats by category
    const categorizedStats = {
        offense: { positions: [], stats: {} },
        defense: { positions: [], stats: {} },
        special: { positions: [], stats: {} }
    };

    games.forEach(game => {
        if (game.position_stats && Array.isArray(game.position_stats)) {
            game.position_stats.forEach(ps => {
                if (ps && ps.position && ps.stats) {
                    const position = ps.position;
                    let category = null;

                    if (offensivePositions.includes(position)) category = 'offense';
                    else if (defensivePositions.includes(position)) category = 'defense';
                    else if (specialPositions.includes(position)) category = 'special';

                    if (category) {
                        if (!categorizedStats[category].positions.includes(position)) {
                            categorizedStats[category].positions.push(position);
                        }
                        // Merge stats
                        Object.entries(ps.stats).forEach(([key, value]) => {
                            if (!categorizedStats[category].stats[key]) {
                                categorizedStats[category].stats[key] = 0;
                            }
                            categorizedStats[category].stats[key] += parseFloat(value) || 0;
                        });
                    }
                }
            });
        }
    });

    // Create stats display for each category
    let html = '';

    if (categorizedStats.offense.positions.length > 0) {
        html += createCategoryStatsSection('Offensive Stats', categorizedStats.offense, games, statsType);
    }

    if (categorizedStats.defense.positions.length > 0) {
        html += createCategoryStatsSection('Defensive Stats', categorizedStats.defense, games, statsType);
    }

    if (categorizedStats.special.positions.length > 0) {
        html += createCategoryStatsSection('Special Teams Stats', categorizedStats.special, games, statsType);
    }

    return html;
}

// Alias for backwards compatibility
function displayCareerStatsTable(games) {
    displayTransferStatsTable(games, []);
}

function createCategoryStatsSection(title, categoryData, games, statsType = 'career') {
    const positions = categoryData.positions;
    if (positions.length === 0) return '';

    let html = `
        <div class="stats-category-section">
            <h3 class="stats-category-title">${title}</h3>
    `;

    // For each position in this category, show the stats
    positions.forEach(position => {
        const stats = POSITION_STATS[position] || [];
        if (stats.length === 0) return;

        // Find the game entry for this position
        let positionStats = {};
        let gameId = null;
        games.forEach(game => {
            if (game.position_stats && Array.isArray(game.position_stats)) {
                game.position_stats.forEach(ps => {
                    if (ps && ps.position === position && ps.stats) {
                        positionStats = ps.stats;
                        gameId = game.game_id; // API returns game_id not id
                    }
                });
            }
        });

        html += `
            <div class="position-stats-display" data-position="${position}" data-game-id="${gameId}" data-stats-type="${statsType}">
                <div class="position-stats-header-display">
                    <h4>${position}</h4>
                    <button type="button" class="btn-edit-position-stats" data-position="${position}" data-game-id="${gameId}" data-stats-type="${statsType}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                </div>
                <div class="stats-values-grid">
        `;

        stats.forEach(stat => {
            const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
            const value = positionStats[statKey] !== undefined ? positionStats[statKey] : 0;
            const suffix = statKey === 'comp_%' ? '%' : '';
            html += `
                <div class="stat-value-item">
                    <span class="stat-label">${stat}</span>
                    <span class="stat-value">${value}${suffix}</span>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    return html;
}

function setupStatsClickHandlers() {
    document.querySelectorAll('.btn-edit-position-stats').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const position = btn.dataset.position;
            const gameId = btn.dataset.gameId;
            const statsType = btn.dataset.statsType || 'career';
            openEditStatsModal(position, gameId, statsType);
        });
    });
}

let currentEditStatsType = 'career'; // Track current stats type being edited

function openEditStatsModal(position, gameId, statsType = 'career') {
    const modal = document.getElementById('editStatsModal');
    if (!modal) return;

    currentEditStatsPosition = position;
    currentEditStatsType = statsType;
    document.getElementById('editStatsPosition').value = gameId;

    // Populate the edit modal with existing stats
    populateEditStatsModal(position, gameId, statsType);

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function populateEditStatsModal(position, gameId, statsType = 'career') {
    const container = document.getElementById('editStatsFieldsContainer');
    if (!container) return;

    const stats = POSITION_STATS[position] || [];

    // Find existing stats for this position based on stats type
    let existingStats = {};
    const dataArray = statsType === 'lastseason' ? lastSeasonStatsData : careerStatsData;
    dataArray.forEach(game => {
        if (game.game_id == gameId && game.position_stats) {
            game.position_stats.forEach(ps => {
                if (ps && ps.position === position && ps.stats) {
                    existingStats = ps.stats;
                }
            });
        }
    });

    const statsTypeLabel = statsType === 'lastseason' ? 'Last Season' : 'Career';
    let html = `
        <div class="position-stats-section">
            <div class="position-stats-header">
                <h4>${position} ${statsTypeLabel} Stats</h4>
            </div>
    `;

    if (stats.length === 0) {
        html += '<p class="no-stats-message">No stats to track for this position.</p>';
    } else {
        html += '<div class="stats-fields-grid">';
        stats.forEach(stat => {
            const fieldId = `edit_stat_${position}_${stat.replace(/[^a-zA-Z0-9%]/g, '_').toLowerCase()}`;
            const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
            const value = existingStats[statKey] || '';
            html += `
                <div class="stat-field-group">
                    <label for="${fieldId}">${stat}</label>
                    <input type="number" id="${fieldId}" name="${fieldId}" min="0" step="any" placeholder="0" value="${value}">
                </div>
            `;
        });
        html += '</div>';
    }

    html += '</div>';
    container.innerHTML = html;
}

function setupEditStatsModal() {
    const editStatsModal = document.getElementById('editStatsModal');
    const editStatsModalOverlay = document.getElementById('editStatsModalOverlay');
    const editStatsModalClose = document.getElementById('editStatsModalClose');
    const btnEditStatsCancel = document.getElementById('btnEditStatsCancel');
    const btnEditStatsSave = document.getElementById('btnEditStatsSave');
    const btnDeleteStats = document.getElementById('btnDeleteStats');

    if (!editStatsModal) return;

    function closeModal() {
        editStatsModal.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (editStatsModalOverlay) editStatsModalOverlay.addEventListener('click', closeModal);
    if (editStatsModalClose) editStatsModalClose.addEventListener('click', closeModal);
    if (btnEditStatsCancel) btnEditStatsCancel.addEventListener('click', closeModal);

    if (btnEditStatsSave) {
        btnEditStatsSave.addEventListener('click', async () => {
            await saveEditedStats();
        });
    }

    if (btnDeleteStats) {
        btnDeleteStats.addEventListener('click', showDeleteStatsConfirm);
    }

    // Delete confirmation handlers
    const deleteStatsConfirmOverlay = document.getElementById('deleteStatsConfirmOverlay');
    const btnStatsConfirmCancel = document.getElementById('btnStatsConfirmCancel');
    const btnStatsConfirmDelete = document.getElementById('btnStatsConfirmDelete');

    if (deleteStatsConfirmOverlay) {
        deleteStatsConfirmOverlay.addEventListener('click', hideDeleteStatsConfirm);
    }
    if (btnStatsConfirmCancel) {
        btnStatsConfirmCancel.addEventListener('click', hideDeleteStatsConfirm);
    }
    if (btnStatsConfirmDelete) {
        btnStatsConfirmDelete.addEventListener('click', confirmDeleteStats);
    }
}

async function saveEditedStats() {
    const gameId = document.getElementById('editStatsPosition').value;
    const position = currentEditStatsPosition;
    const statsType = currentEditStatsType;
    const stats = POSITION_STATS[position] || [];

    // Collect stats - store 0 for empty inputs
    const positionStats = {};
    stats.forEach(stat => {
        const fieldId = `edit_stat_${position}_${stat.replace(/[^a-zA-Z0-9%]/g, '_').toLowerCase()}`;
        const input = document.getElementById(fieldId);
        const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
        positionStats[statKey] = input && input.value !== '' ? (parseFloat(input.value) || 0) : 0;
    });

    const btnSave = document.getElementById('btnEditStatsSave');
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving...';
    }

    try {
        // Find existing game data based on stats type
        const dataArray = statsType === 'lastseason' ? lastSeasonStatsData : careerStatsData;
        const game = dataArray.find(g => g.game_id == gameId);
        if (!game) throw new Error('Game not found');

        // Update position stats
        const positions = {};
        if (game.position_stats && Array.isArray(game.position_stats)) {
            game.position_stats.forEach(ps => {
                if (ps && ps.position && ps.stats) {
                    if (ps.position === position) {
                        positions[ps.position] = positionStats;
                    } else {
                        positions[ps.position] = ps.stats;
                    }
                }
            });
        }

        const response = await API.put(`/stats/${gameId}`, {
            game_date: game.game_date,
            season_year: game.season_year,
            opponent: game.opponent,
            result: game.result,
            positions
        });

        if (response.success) {
            showToast('Stats updated successfully!', 'success');

            // Close modal
            const editStatsModal = document.getElementById('editStatsModal');
            if (editStatsModal) {
                editStatsModal.classList.remove('active');
                document.body.style.overflow = '';
            }

            // Reload stats
            await loadCareerStats();
        } else {
            throw new Error(response.error || 'Failed to update stats');
        }
    } catch (error) {
        console.error('Error updating stats:', error);
        showToast('Failed to update stats. Please try again.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Save Changes';
        }
    }
}

function showDeleteStatsConfirm() {
    const modal = document.getElementById('deleteStatsConfirmModal');
    if (modal) modal.classList.add('active');
}

function hideDeleteStatsConfirm() {
    const modal = document.getElementById('deleteStatsConfirmModal');
    if (modal) modal.classList.remove('active');
}

async function confirmDeleteStats() {
    const gameId = document.getElementById('editStatsPosition').value;

    try {
        const response = await API.delete(`/stats/${gameId}`);

        if (response.success) {
            showToast('Stats deleted successfully!', 'success');

            hideDeleteStatsConfirm();

            const editStatsModal = document.getElementById('editStatsModal');
            if (editStatsModal) {
                editStatsModal.classList.remove('active');
                document.body.style.overflow = '';
            }

            await loadCareerStats();
        } else {
            throw new Error(response.error || 'Failed to delete stats');
        }
    } catch (error) {
        console.error('Error deleting stats:', error);
        showToast('Failed to delete stats. Please try again.', 'error');
    }
}

// Display career stats in Overview tab (like hsplayer)
function displayOverviewCareerStats(games) {
    const container = document.getElementById('overviewCareerStatsContainer');
    if (!container) return;

    container.innerHTML = '';

    if (!games || games.length === 0) {
        container.innerHTML = `
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

    // Collect stats by position
    const positionTotals = {};

    games.forEach(game => {
        if (game.position_stats && Array.isArray(game.position_stats)) {
            game.position_stats.forEach(ps => {
                if (ps && ps.position && ps.stats) {
                    if (!positionTotals[ps.position]) {
                        positionTotals[ps.position] = {};
                    }
                    Object.entries(ps.stats).forEach(([key, value]) => {
                        if (!positionTotals[ps.position][key]) {
                            positionTotals[ps.position][key] = 0;
                        }
                        positionTotals[ps.position][key] += parseFloat(value) || 0;
                    });
                }
            });
        }
    });

    if (Object.keys(positionTotals).length === 0) {
        container.innerHTML = `
            <div class="overview-section">
                <h2 class="section-title">Career Stats</h2>
                <div class="info-card">
                    <div class="no-stats-message">No career stats recorded yet.</div>
                </div>
            </div>
        `;
        return;
    }

    let html = '<div class="overview-section"><h2 class="section-title">Career Stats</h2><div class="info-card">';

    // Offensive Stats
    const offPositions = Object.keys(positionTotals).filter(p => offensivePositions.includes(p));
    if (offPositions.length > 0) {
        html += '<div class="overview-stats-category"><h3 class="overview-stats-category-title">Offense</h3>';
        offPositions.forEach(pos => {
            html += createOverviewPositionStats(pos, positionTotals[pos]);
        });
        html += '</div>';
    }

    // Defensive Stats
    const defPositions = Object.keys(positionTotals).filter(p => defensivePositions.includes(p));
    if (defPositions.length > 0) {
        html += '<div class="overview-stats-category"><h3 class="overview-stats-category-title">Defense</h3>';
        defPositions.forEach(pos => {
            html += createOverviewPositionStats(pos, positionTotals[pos]);
        });
        html += '</div>';
    }

    // Special Teams Stats
    const specPositions = Object.keys(positionTotals).filter(p => specialPositions.includes(p));
    if (specPositions.length > 0) {
        html += '<div class="overview-stats-category"><h3 class="overview-stats-category-title">Special Teams</h3>';
        specPositions.forEach(pos => {
            html += createOverviewPositionStats(pos, positionTotals[pos]);
        });
        html += '</div>';
    }

    html += '</div></div>';
    container.innerHTML = html;
}

function createOverviewPositionStats(position, stats) {
    const posStats = POSITION_STATS[position] || [];
    if (posStats.length === 0) return '';

    let html = `<div style="margin-bottom: 1rem;"><h4 style="font-size: 0.85rem; color: var(--cerulean); margin: 0 0 0.5rem 0;">${position}</h4><div class="stats-horizontal">`;

    posStats.forEach(stat => {
        const statKey = stat.toLowerCase().replace(/[^a-z0-9%]/g, '_');
        const suffix = statKey === 'comp_%' ? '%' : '';
        const value = stats[statKey] !== undefined ? (Number.isInteger(stats[statKey]) ? stats[statKey] : stats[statKey].toFixed(1)) : '-';
        html += `<div class="stat-box"><div class="stat-value">${value}${value !== '-' ? suffix : ''}</div><div class="stat-label">${stat}</div></div>`;
    });

    html += '</div></div>';
    return html;
}

// Display both career and last season stats in Overview tab
function displayOverviewTransferStats(careerGames, lastSeasonGames) {
    const container = document.getElementById('overviewCareerStatsContainer');
    if (!container) return;

    container.innerHTML = '';

    const hasCareerStats = careerGames && careerGames.length > 0;
    const hasLastSeasonStats = lastSeasonGames && lastSeasonGames.length > 0;

    if (!hasCareerStats && !hasLastSeasonStats) {
        container.innerHTML = `
            <div class="overview-section">
                <h2 class="section-title">Stats</h2>
                <div class="info-card">
                    <div class="no-stats-message">No stats recorded yet.</div>
                </div>
            </div>
        `;
        return;
    }

    // Define position categories
    const offensivePositions = ['QB', 'RB', 'FB', 'WR', 'TE', 'OT', 'OG', 'C'];
    const defensivePositions = ['DE', 'DT', 'NT', 'ILB', 'OLB', 'CB', 'S'];
    const specialPositions = ['K', 'P', 'LS'];

    // Helper function to collect stats by position from games
    function collectPositionTotals(games) {
        const positionTotals = {};
        games.forEach(game => {
            if (game.position_stats && Array.isArray(game.position_stats)) {
                game.position_stats.forEach(ps => {
                    if (ps && ps.position && ps.stats) {
                        if (!positionTotals[ps.position]) {
                            positionTotals[ps.position] = {};
                        }
                        Object.entries(ps.stats).forEach(([key, value]) => {
                            if (!positionTotals[ps.position][key]) {
                                positionTotals[ps.position][key] = 0;
                            }
                            positionTotals[ps.position][key] += parseFloat(value) || 0;
                        });
                    }
                });
            }
        });
        return positionTotals;
    }

    // Helper function to build stats HTML for a category
    function buildCategoryStatsHtml(positionTotals, categoryPositions, categoryTitle) {
        const positions = Object.keys(positionTotals).filter(p => categoryPositions.includes(p));
        if (positions.length === 0) return '';

        let html = `<div class="overview-stats-category"><h3 class="overview-stats-category-title">${categoryTitle}</h3>`;
        positions.forEach(pos => {
            html += createOverviewPositionStats(pos, positionTotals[pos]);
        });
        html += '</div>';
        return html;
    }

    // Build HTML
    let html = '<div class="overview-section"><h2 class="section-title">Stats</h2><div class="info-card">';

    // Last Season Stats
    if (hasLastSeasonStats) {
        const lastSeasonTotals = collectPositionTotals(lastSeasonGames);
        if (Object.keys(lastSeasonTotals).length > 0) {
            html += '<div class="overview-stats-wrapper"><h3 class="overview-stats-section-title">Last Season</h3>';
            html += buildCategoryStatsHtml(lastSeasonTotals, offensivePositions, 'Offense');
            html += buildCategoryStatsHtml(lastSeasonTotals, defensivePositions, 'Defense');
            html += buildCategoryStatsHtml(lastSeasonTotals, specialPositions, 'Special Teams');
            html += '</div>';
        }
    }

    // Career Stats
    if (hasCareerStats) {
        const careerTotals = collectPositionTotals(careerGames);
        if (Object.keys(careerTotals).length > 0) {
            html += '<div class="overview-stats-wrapper"><h3 class="overview-stats-section-title">Career</h3>';
            html += buildCategoryStatsHtml(careerTotals, offensivePositions, 'Offense');
            html += buildCategoryStatsHtml(careerTotals, defensivePositions, 'Defense');
            html += buildCategoryStatsHtml(careerTotals, specialPositions, 'Special Teams');
            html += '</div>';
        }
    }

    html += '</div></div>';
    container.innerHTML = html;
}

// Initialize transfer stats system when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupTransferAddStatsModal();
    setupEditStatsModal();
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

    // Phase 4b-III: iOS branch — stash a File picked via NativeCamera so the
    // save handler can read it regardless of whether the web <input> was used.
    let _iosHighlightVideo = null;
    const _hlVideoInputForIOS = document.getElementById('highlightVideoFile');
    if (_hlVideoInputForIOS) {
        _hlVideoInputForIOS.addEventListener('click', async function(e) {
            if (window.API && window.API.isIOSApp && window.API.isIOSApp()
                && window.NativeCamera && window.NativeCamera.showHighlightVideoSheet) {
                e.preventDefault();
                // Camera Roll / Files bottom sheet. The old pickPostVideo path
                // relied on Camera.getVideo, which doesn't exist in the installed
                // plugin — the picker never opened. Cancel keeps any previous stash.
                await window.NativeCamera.showHighlightVideoSheet(async function(file) {
                    _iosHighlightVideo = file;
                    showToast('Selected: ' + file.name, 'success');
                });
            }
        });
        _hlVideoInputForIOS.addEventListener('change', function() {
            _iosHighlightVideo = null;
        });
    }

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

    // Helper function to show validation error
    function showHighlightError(message) {
        const errorContainer = document.getElementById('highlightValidationErrors');
        const errorText = document.getElementById('highlightErrorText');
        if (errorContainer && errorText) {
            errorText.textContent = message;
            errorContainer.style.display = 'block';
        }
    }

    // Helper function to hide validation error
    function hideHighlightError() {
        const errorContainer = document.getElementById('highlightValidationErrors');
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }

    // Helper function to update progress bar
    function updateProgressBar(percent, status = 'uploading') {
        const progressContainer = document.getElementById('videoUploadProgress');
        const progressBar = document.getElementById('videoProgressBar');
        const progressText = document.getElementById('videoProgressText');

        if (progressContainer && progressBar && progressText) {
            progressContainer.style.display = 'flex';
            progressBar.style.width = `${percent}%`;

            if (status === 'ready') {
                progressBar.classList.add('complete');
                progressText.textContent = 'Ready!';
            } else if (status === 'processing') {
                progressBar.classList.remove('complete');
                progressText.textContent = 'Processing...';
            } else {
                progressBar.classList.remove('complete');
                progressText.textContent = `${Math.round(percent)}%`;
            }
        }
    }

    // Helper function to reset progress bar
    function resetProgressBar() {
        const progressContainer = document.getElementById('videoUploadProgress');
        const progressBar = document.getElementById('videoProgressBar');
        const progressText = document.getElementById('videoProgressText');

        if (progressContainer && progressBar && progressText) {
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            progressBar.classList.remove('complete');
            progressText.textContent = '0%';
        }
    }

    // Save highlight
    if (btnHighlightSave) {
        btnHighlightSave.addEventListener('click', async () => {
            const title = highlightTitleInput?.value?.trim();
            const link = highlightLinkInputField?.value?.trim();
            const videoFileInput = document.getElementById('highlightVideoFile');
            // Phase 4b-III: prefer iOS-picked stash, fall back to web input
            const videoFile = _iosHighlightVideo || videoFileInput?.files?.[0];

            // Hide any previous errors
            hideHighlightError();

            if (!title) {
                showHighlightError('Please enter a title for your highlight');
                return;
            }

            // Check if either a Hudl link or video file is provided
            if (!link && !videoFile) {
                showHighlightError('Please enter a Hudl link or upload a video file');
                return;
            }

            // Validate Hudl link if provided
            if (link && !isValidHudlLink(link)) {
                showHighlightError('Please enter a valid Hudl link (e.g., https://www.hudl.com/video/...)');
                return;
            }

            // Validate video file size (500MB max)
            if (videoFile && videoFile.size > 500 * 1024 * 1024) {
                showHighlightError('Video file is too large. Maximum size is 500MB.');
                return;
            }

            try {
                btnHighlightSave.disabled = true;
                btnHighlightSave.textContent = 'Adding...';

                let response;

                if (videoFile) {
                    // Upload with video file
                    const formData = new FormData();
                    formData.append('highlight_type', currentHighlightType);
                    formData.append('title', title);
                    if (link) formData.append('hudl_link', link);
                    formData.append('video_file', videoFile);

                    // Use XMLHttpRequest for progress tracking
                    response = await new Promise((resolve, reject) => {
                        const xhr = new XMLHttpRequest();

                        xhr.upload.addEventListener('progress', (e) => {
                            if (e.lengthComputable) {
                                const percent = (e.loaded / e.total) * 100;
                                updateProgressBar(percent, 'uploading');
                            }
                        });

                        // When upload completes, show processing status
                        xhr.upload.addEventListener('load', () => {
                            updateProgressBar(100, 'processing');
                        });

                        xhr.addEventListener('load', () => {
                            if (xhr.status >= 200 && xhr.status < 300) {
                                try {
                                    updateProgressBar(100, 'ready');
                                    resolve(JSON.parse(xhr.responseText));
                                } catch (e) {
                                    reject(new Error('Invalid response'));
                                }
                            } else {
                                reject(new Error(xhr.statusText || 'Upload failed'));
                            }
                        });

                        xhr.addEventListener('error', () => reject(new Error('Network error')));

                        xhr.open('POST', `${API_BASE_URL}/highlights/upload`);
                        xhr.withCredentials = true;
                        xhr.send(formData);
                    });
                } else {
                    // Regular API call for Hudl link only
                    response = await API.post('/highlights', {
                        highlight_type: currentHighlightType,
                        title: title,
                        hudl_link: link
                    });
                }

                if (response.success) {
                    closeHighlightModal();
                    loadHighlights(); // Reload highlights
                } else {
                    showHighlightError(response.message || 'Failed to add highlight');
                }
            } catch (error) {
                console.error('Error adding highlight:', error);
                showHighlightError('Failed to add highlight. Please try again.');
            } finally {
                btnHighlightSave.disabled = false;
                btnHighlightSave.textContent = 'Add Highlight';
                resetProgressBar();
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

        // Reset video file input
        const videoFileInput = document.getElementById('highlightVideoFile');
        if (videoFileInput) videoFileInput.value = '';
        // Phase 4b-III: also clear the iOS stash
        _iosHighlightVideo = null;

        // Hide validation errors
        hideHighlightError();

        // Reset progress bar
        resetProgressBar();
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

    // Check if this is an uploaded video (has video_signed_url) or a Hudl link
    const isUploadedVideo = highlight.video_signed_url && highlight.video_url;
    const linkOrVideo = isUploadedVideo ? highlight.video_signed_url : highlight.hudl_link;
    const displayUrl = isUploadedVideo ? 'Uploaded Video' : truncateUrl(highlight.hudl_link);

    // For uploaded videos, show video thumbnail; for Hudl links, show play icon
    const thumbnailContent = isUploadedVideo
        ? `<video class="highlight-video-preview" src="${highlight.video_signed_url}" muted preload="metadata"></video>
           <div class="highlight-play-overlay">
               <svg viewBox="0 0 24 24" fill="currentColor">
                   <polygon points="5 3 19 12 5 21 5 3"></polygon>
               </svg>
           </div>`
        : `<svg viewBox="0 0 24 24" fill="currentColor">
               <polygon points="5 3 19 12 5 21 5 3"></polygon>
           </svg>`;

    return `
        <div class="highlight-card" data-link="${linkOrVideo || ''}" data-is-video="${isUploadedVideo}">
            <div class="highlight-thumbnail">
                ${thumbnailContent}
                ${deleteButton}
            </div>
            <div class="highlight-info">
                <h3>${escapedTitle}</h3>
                <p>${displayUrl}</p>
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
    // Click on card to open link or video modal
    container.querySelectorAll('.highlight-card').forEach(card => {
        card.addEventListener('click', (e) => {
            // Don't open link if clicking delete button
            if (e.target.closest('.highlight-delete-btn')) return;

            const link = card.dataset.link;
            const isVideo = card.dataset.isVideo === 'true';

            if (link) {
                if (isVideo) {
                    // Open video in modal
                    openVideoModal(link);
                } else {
                    // Open Hudl link in new tab
                    window.open(link, '_blank');
                }
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

// Open video in fullscreen modal
function openVideoModal(videoUrl) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('videoPlayerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'videoPlayerModal';
        modal.className = 'video-player-modal';
        modal.innerHTML = `
            <div class="video-player-modal-overlay"></div>
            <div class="video-player-modal-content">
                <button class="video-player-modal-close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
                <video id="videoPlayerElement" controls autoplay playsinline>
                    <source src="" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>
        `;
        document.body.appendChild(modal);

        // Close modal on overlay click
        modal.querySelector('.video-player-modal-overlay').addEventListener('click', closeVideoModal);
        modal.querySelector('.video-player-modal-close').addEventListener('click', closeVideoModal);

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeVideoModal();
            }
        });
    }

    // Set video source and show modal
    const videoElement = modal.querySelector('#videoPlayerElement');
    videoElement.src = videoUrl;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeVideoModal() {
    const modal = document.getElementById('videoPlayerModal');
    if (modal) {
        const videoElement = modal.querySelector('#videoPlayerElement');
        videoElement.pause();
        videoElement.src = '';
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
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
            showToast(response.message || 'Failed to delete highlight', 'error');
        }
    } catch (error) {
        console.error('Error deleting highlight:', error);
        showToast('Failed to delete highlight. Please try again.', 'error');
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
});

// ============================================
// RECRUITING PROFILE TAB (AI Fit-Matching)
// ============================================

// Stored multi-select controllers for the edit modals (created on open)
let rpMajorPicker = null, rpLevelsPicker = null, rpRegionsPicker = null;

// Parse fit_preferences which may arrive as a JSON string or an object.
function rpParseFitPrefs(profile) {
    const fp = profile && profile.fit_preferences;
    if (fp == null) return {};
    if (typeof fp === 'object') return fp;
    try { return JSON.parse(fp) || {}; } catch (e) { return {}; }
}

// Render an array of values as chips into a container (textContent — never raw HTML).
function rpRenderTags(elId, arr) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    const vals = Array.isArray(arr) ? arr.filter(v => v != null && v !== '') : [];
    if (!vals.length) {
        const span = document.createElement('span');
        span.className = 'info-value';
        span.textContent = '—';
        el.appendChild(span);
        return;
    }
    vals.forEach(v => {
        const span = document.createElement('span');
        span.className = 'recruiting-tag';
        span.textContent = v;
        el.appendChild(span);
    });
}

function rpSetText(elId, value) {
    const el = document.getElementById(elId);
    if (el) el.textContent = (value == null || value === '') ? '—' : value;
}

// Capitalize a stored lowercase enum value for DISPLAY only (e.g. 'yes' → 'Yes',
// 'small-town' → 'Small-town'). Stored values stay lowercase for matching/allowlists.
function rpTitleCase(value) {
    if (value == null || value === '') return value;
    const s = String(value);
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Display labels for preferred_campus_setting. rpTitleCase would render the
// stored hyphenated values as 'No-preference' / 'Small-town'; this keeps the
// read-only view reading exactly like the option the player picked.
// null/'' still falls through to the '—' empty state (never answered), which is
// a different thing from an explicit 'no-preference' answer.
const RP_CAMPUS_LABELS = {
    'no-preference': 'No preference',
    'urban': 'Urban',
    'suburban': 'Suburban',
    'rural': 'Rural',
    'small-town': 'Small town'
};
function rpCampusLabel(value) {
    if (value == null || value === '') return value;
    return RP_CAMPUS_LABELS[value] || rpTitleCase(value);
}

// Coach-only AI Match score on the recruiting-profile banner. PLAN 6 = placeholder
// (number only, no fill bar) + fit rating (Strong/Good/...) + ⓘ button that opens
// the AI Match explainer modal. Plan 7 swaps FitDisplay.PLACEHOLDER_SCORE for the
// real score and passes computed match reasons to FitInfoModal.open({score, matches}).
async function renderMatchScore(viewerCoachProfile, playerProfile) {
    const scoreEl = document.getElementById('rmbScore');
    if (!scoreEl) return;
    if (typeof FitDisplay === 'undefined') { scoreEl.textContent = '—'; return; }

    const playerName = playerProfile
        ? `${playerProfile.first_name || ''} ${playerProfile.last_name || ''}`.trim()
        : '';

    // Fetch the real AI Match fit for the viewing coach <-> this player (Plan 7).
    let fit = null;
    // The VIEWING COACH's own Program Profile completeness, for the modal's
    // 'your program profile is incomplete' callout.
    let viewerProfile = null;
    try {
        const res = await API.profile.getFit(playerProfile.user_id);
        fit = res && res.fit;
        viewerProfile = res && res.viewerProfile;
    } catch (e) {
        // network/permission error -> fall back to the "not yet rated" state below
    }

    const score = fit ? fit.score : null;        // null => below the display floor
    const tier = score != null ? FitDisplay.tierOf(score) : null;
    scoreEl.textContent = score != null ? (String(score) + (FitDisplay.FIT_SHOW_PERCENT ? '%' : '')) : '—';
    if (tier) scoreEl.style.color = tier.color;

    // Match details for the modal, from the present dimensions only.
    // Pass ALL FIVE criteria, including unscoreable ones — the modal renders those
    // as muted "not rated" rows naming which side is missing data.
    const matches = (fit && Array.isArray(fit.dimensions))
        ? fit.dimensions.map(d => ({ label: d.label, detail: d.detail, score: d.score, present: d.present }))
        : null;

    // Subtitle: fit rating + info button (replaces the old "coming soon" text)
    const subEl = document.getElementById('rmbSub');
    if (subEl) {
        const ratingLabel = tier ? tier.label : 'Not yet rated';
        const ratingColor = tier ? tier.color : 'var(--text-secondary, #64748b)';
        subEl.innerHTML =
            `<span class="rmb-rating" style="color:${ratingColor}">${ratingLabel}</span>` +
            `<button class="rmb-info-btn" id="rmbInfoBtn" aria-label="About AI Match" title="About AI Match" type="button">` +
            `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="11" x2="12" y2="17"></line><line x1="12" y1="7" x2="12.01" y2="7"></line></svg>` +
            `</button>`;
        const infoBtn = document.getElementById('rmbInfoBtn');
        if (infoBtn && typeof FitInfoModal !== 'undefined') {
            infoBtn.addEventListener('click', () => FitInfoModal.open({
                score, playerName, matches, viewerProfile,
                profileHref: new URL('../../collegecoach/tabs/my-profile.html', window.location.href).href
            }));
        }
    }
}

// Populate all read-only subtab fields from the loaded profile.
function populateRecruitingProfile(profile) {
    if (!profile) return;
    const fp = rpParseFitPrefs(profile);

    // Academics
    if (profile.gpa != null && profile.gpa !== '') {
        const n = parseFloat(profile.gpa);
        rpSetText('rpUnweightedGpa', isNaN(n) ? '—' : n.toFixed(2));
    } else rpSetText('rpUnweightedGpa', null);
    if (profile.weighted_gpa != null && profile.weighted_gpa !== '') {
        const w = parseFloat(profile.weighted_gpa);
        rpSetText('rpWeightedGpa', isNaN(w) ? '—' : w.toFixed(2));
    } else rpSetText('rpWeightedGpa', null);
    rpSetText('rpSat', profile.sat_score);
    rpSetText('rpAct', profile.act_score);
    rpSetText('rpApIb', profile.has_ap_ib ? ('Yes' + (profile.ap_ib_count ? ` (${profile.ap_ib_count} courses)` : '')) : (profile.has_ap_ib === false ? 'No' : '—'));
    rpSetText('rpClassRank', profile.class_rank);

    // Major & Goals
    rpRenderTags('rpMajor', profile.intended_major);
    rpSetText('rpLookingFor', fp.looking_for_text);

    // Financial Fit
    rpSetText('rpNeedsAid', rpTitleCase(profile.needs_financial_aid));
    rpSetText('rpNeedsScholarship', rpTitleCase(profile.needs_scholarship));
    rpSetText('rpPellFirstGen', profile.pell_or_first_gen === true ? 'Yes' : (profile.pell_or_first_gen === false ? 'No' : '—'));
    rpSetText('rpHomeZip', profile.home_zip);

    // Level & Location
    rpRenderTags('rpLevelsOpen', profile.levels_open);
    rpRenderTags('rpPreferredRegions', profile.preferred_regions);
    rpSetText('rpCampusSetting', rpCampusLabel(profile.preferred_campus_setting));

    // Priorities (sliders → "N / 5")
    const slider = (v) => (v == null || v === '') ? '—' : `${v} / 5`;
    rpSetText('rpImpPlayingTime', slider(fp.importance_playing_time));
    rpSetText('rpImpCloseToHome', slider(fp.importance_close_to_home));
    rpSetText('rpImpAcademics', slider(fp.importance_academics_vs_football));
    rpSetText('rpImpCompetition', slider(fp.importance_competition_level));

    // Athletics (other sports + track times) — absorbed into Priorities & Athletics subtab
    if (typeof updateAthleticsDisplay === 'function') updateAthleticsDisplay(profile);
}

// Subtab dropdown → swap visible subtab pane (scoped to the RP pane).
function setupRecruitingSubnav() {
    const sel = document.getElementById('recruitingSubtabSelect');
    if (!sel || sel._rpWired) return;
    sel._rpWired = true;
    sel.addEventListener('change', function () {
        document.querySelectorAll('#recruiting-profile .recruiting-subtab-pane').forEach(p => {
            p.classList.toggle('active', p.dataset.subtab === this.value);
        });
    });
}

// Generic modal open/close helpers
function rpOpenModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.add('active'); document.body.style.overflow = 'hidden'; }
}
function rpCloseModal(id) {
    const m = document.getElementById(id);
    if (m) { m.classList.remove('active'); document.body.style.overflow = ''; }
}
function rpNumOrNull(id) { const e = document.getElementById(id); if (!e || e.value === '') return null; const n = parseFloat(e.value); return Number.isNaN(n) ? null : n; }
function rpIntOrNull(id) { const e = document.getElementById(id); if (!e || e.value === '') return null; const n = parseInt(e.value, 10); return Number.isNaN(n) ? null : n; }
function rpRadioVal(name) { const e = document.querySelector(`input[name="${name}"]:checked`); return e ? e.value : null; }

// After a successful save: merge into currentProfile, re-render, close.
async function rpSavePayload(payload, modalId) {
    try {
        const response = await API.put('/profile', payload);
        if (response.success || response.profile) {
            Object.assign(currentProfile, payload);
            populateRecruitingProfile(currentProfile);
            if ('gpa' in payload) displayProfile(currentProfile, 'player'); // header shows GPA
            rpCloseModal(modalId);
            if (typeof showToast === 'function') showToast('Saved', 'success');
        } else {
            showToast(response.message || 'Failed to save', 'error');
        }
    } catch (err) {
        console.error('RP save error:', err);
        showToast('Failed to save. Please try again.', 'error');
    }
}

// Wire all 5 edit modals (owner-only). Called from the visibility block.
function setupRecruitingProfileEditing() {
    if (window._rpEditingWired) return;
    window._rpEditingWired = true;
    const haveMatchUI = typeof initMatchMultiSelect === 'function' && typeof MATCH_CONSTANTS !== 'undefined';

    // Reveal the per-subtab Edit buttons
    document.querySelectorAll('.btn-edit-recruiting-section').forEach(b => b.classList.add('show-button'));

    // Generic close wiring for a modal id
    const wireClose = (modalId) => {
        document.getElementById(modalId + 'Overlay')?.addEventListener('click', () => rpCloseModal(modalId));
        document.getElementById(modalId + 'Close')?.addEventListener('click', () => rpCloseModal(modalId));
    };

    // ---- Academics ----
    document.getElementById('editRpAcademicsBtn')?.addEventListener('click', () => {
        const p = currentProfile;
        document.getElementById('editRpUnweightedGpa').value = p.gpa ?? '';
        document.getElementById('editRpSat').value = p.sat_score ?? '';
        document.getElementById('editRpAct').value = p.act_score ?? '';
        const hasAp = p.has_ap_ib === true;
        (document.querySelector(`input[name="editRpHasApIb"][value="${hasAp ? 'yes' : 'no'}"]`) || {}).checked = true;
        document.getElementById('editRpApIbCountGroup').style.display = hasAp ? '' : 'none';
        document.getElementById('editRpApIbCount').value = p.ap_ib_count ?? '';
        document.getElementById('editRpClassRank').value = p.class_rank ?? '';
        rpOpenModal('editRpAcademicsModal');
    });
    document.querySelectorAll('input[name="editRpHasApIb"]').forEach(r => r.addEventListener('change', function () {
        const grp = document.getElementById('editRpApIbCountGroup');
        grp.style.display = this.value === 'yes' ? '' : 'none';
        if (this.value !== 'yes') document.getElementById('editRpApIbCount').value = '';
    }));
    document.getElementById('btnEditRpAcademicsCancel')?.addEventListener('click', () => rpCloseModal('editRpAcademicsModal'));
    wireClose('editRpAcademicsModal');
    document.getElementById('btnEditRpAcademicsSave')?.addEventListener('click', () => {
        const hasAp = rpRadioVal('editRpHasApIb') === 'yes';
        rpSavePayload({
            gpa: rpNumOrNull('editRpUnweightedGpa'),
            sat_score: rpIntOrNull('editRpSat'),
            act_score: rpIntOrNull('editRpAct'),
            has_ap_ib: hasAp,
            ap_ib_count: hasAp ? rpIntOrNull('editRpApIbCount') : null,
            class_rank: (document.getElementById('editRpClassRank').value || '').trim() || null
        }, 'editRpAcademicsModal');
    });

    // ---- Major & Goals ----
    const lfCounter = document.getElementById('editRpLookingForCount');
    document.getElementById('editRpLookingFor')?.addEventListener('input', function () { if (lfCounter) lfCounter.textContent = this.value.length; });
    document.getElementById('editRpMajorGoalsBtn')?.addEventListener('click', () => {
        const p = currentProfile, fp = rpParseFitPrefs(p);
        const cont = document.getElementById('editRpMajorContainer');
        if (cont) cont.innerHTML = '';
        if (haveMatchUI) {
            rpMajorPicker = initMatchMultiSelect({
                container: '#editRpMajorContainer', chips: '#editRpMajorChips',
                groups: MATCH_CONSTANTS.MAJOR_GROUPS, max: 3, capHintEl: '#editRpMajorCapHint',
                name: 'rp_major', preselected: p.intended_major || []
            });
        }
        document.getElementById('editRpLookingFor').value = fp.looking_for_text || '';
        if (lfCounter) lfCounter.textContent = (fp.looking_for_text || '').length;
        rpOpenModal('editRpMajorGoalsModal');
    });
    document.getElementById('btnEditRpMajorGoalsCancel')?.addEventListener('click', () => rpCloseModal('editRpMajorGoalsModal'));
    wireClose('editRpMajorGoalsModal');
    document.getElementById('btnEditRpMajorGoalsSave')?.addEventListener('click', () => {
        const majors = rpMajorPicker ? rpMajorPicker.getSelected() : (currentProfile.intended_major || []);
        const lf = (document.getElementById('editRpLookingFor').value || '').trim();
        const fp = { ...rpParseFitPrefs(currentProfile), looking_for_text: lf || null };
        rpSavePayload({ intended_major: majors.length ? majors : null, fit_preferences: fp }, 'editRpMajorGoalsModal');
    });

    // ---- Financial Fit ----
    document.getElementById('editRpFinancialBtn')?.addEventListener('click', () => {
        const p = currentProfile;
        const setRadio = (name, val) => { const el = val != null && document.querySelector(`input[name="${name}"][value="${val}"]`); if (el) el.checked = true; else document.querySelectorAll(`input[name="${name}"]`).forEach(r => r.checked = false); };
        setRadio('editRpNeedsAid', p.needs_financial_aid);
        setRadio('editRpNeedsScholarship', p.needs_scholarship);
        setRadio('editRpPellFirstGen', p.pell_or_first_gen === true ? 'yes' : (p.pell_or_first_gen === false ? 'no' : null));
        document.getElementById('editRpHomeZip').value = p.home_zip ?? '';
        rpOpenModal('editRpFinancialModal');
    });
    document.getElementById('btnEditRpFinancialCancel')?.addEventListener('click', () => rpCloseModal('editRpFinancialModal'));
    wireClose('editRpFinancialModal');
    document.getElementById('btnEditRpFinancialSave')?.addEventListener('click', () => {
        const pell = rpRadioVal('editRpPellFirstGen');
        const zip = (document.getElementById('editRpHomeZip').value || '').trim();
        if (zip && !/^\d{5}$/.test(zip)) { showToast('Home ZIP must be a 5-digit code', 'warning'); return; }
        rpSavePayload({
            needs_financial_aid: rpRadioVal('editRpNeedsAid'),
            needs_scholarship: rpRadioVal('editRpNeedsScholarship'),
            pell_or_first_gen: pell == null ? null : (pell === 'yes'),
            home_zip: zip || null
        }, 'editRpFinancialModal');
    });

    // ---- Level & Location ----
    document.getElementById('editRpLevelLocationBtn')?.addEventListener('click', () => {
        const p = currentProfile;
        ['editRpLevelsContainer', 'editRpRegionsContainer'].forEach(id => { const c = document.getElementById(id); if (c) c.innerHTML = ''; });
        if (haveMatchUI) {
            rpLevelsPicker = initMatchMultiSelect({ container: '#editRpLevelsContainer', chips: '#editRpLevelsChips', options: MATCH_CONSTANTS.LEVELS, name: 'rp_levels', preselected: p.levels_open || [] });
            rpRegionsPicker = initMatchMultiSelect({ container: '#editRpRegionsContainer', chips: '#editRpRegionsChips', options: MATCH_CONSTANTS.REGIONS, name: 'rp_regions', preselected: p.preferred_regions || [] });
        }
        document.getElementById('editRpCampusSetting').value = p.preferred_campus_setting || '';
        rpOpenModal('editRpLevelLocationModal');
    });
    document.getElementById('btnEditRpLevelLocationCancel')?.addEventListener('click', () => rpCloseModal('editRpLevelLocationModal'));
    wireClose('editRpLevelLocationModal');
    document.getElementById('btnEditRpLevelLocationSave')?.addEventListener('click', () => {
        const levels = rpLevelsPicker ? rpLevelsPicker.getSelected() : (currentProfile.levels_open || []);
        const regions = rpRegionsPicker ? rpRegionsPicker.getSelected() : (currentProfile.preferred_regions || []);
        rpSavePayload({
            levels_open: levels.length ? levels : null,
            preferred_regions: regions.length ? regions : null,
            preferred_campus_setting: document.getElementById('editRpCampusSetting').value || null
        }, 'editRpLevelLocationModal');
    });

    // ---- Priorities ----
    [['editRpImpPlayingTime', 'editRpImpPlayingTimeVal'], ['editRpImpCloseToHome', 'editRpImpCloseToHomeVal'], ['editRpImpAcademics', 'editRpImpAcademicsVal'], ['editRpImpCompetition', 'editRpImpCompetitionVal']].forEach(([sid, vid]) => {
        const s = document.getElementById(sid), o = document.getElementById(vid);
        if (s && o) s.addEventListener('input', () => { o.textContent = s.value; });
    });
    document.getElementById('editRpPrioritiesBtn')?.addEventListener('click', () => {
        const fp = rpParseFitPrefs(currentProfile);
        const set = (sid, vid, v) => { const s = document.getElementById(sid), o = document.getElementById(vid); const val = (v == null || v === '') ? 3 : v; if (s) s.value = val; if (o) o.textContent = val; };
        set('editRpImpPlayingTime', 'editRpImpPlayingTimeVal', fp.importance_playing_time);
        set('editRpImpCloseToHome', 'editRpImpCloseToHomeVal', fp.importance_close_to_home);
        set('editRpImpAcademics', 'editRpImpAcademicsVal', fp.importance_academics_vs_football);
        set('editRpImpCompetition', 'editRpImpCompetitionVal', fp.importance_competition_level);
        rpOpenModal('editRpPrioritiesModal');
    });
    document.getElementById('btnEditRpPrioritiesCancel')?.addEventListener('click', () => rpCloseModal('editRpPrioritiesModal'));
    wireClose('editRpPrioritiesModal');
    document.getElementById('btnEditRpPrioritiesSave')?.addEventListener('click', () => {
        const fp = {
            ...rpParseFitPrefs(currentProfile),
            importance_playing_time: rpIntOrNull('editRpImpPlayingTime'),
            importance_close_to_home: rpIntOrNull('editRpImpCloseToHome'),
            importance_academics_vs_football: rpIntOrNull('editRpImpAcademics'),
            importance_competition_level: rpIntOrNull('editRpImpCompetition')
        };
        rpSavePayload({ fit_preferences: fp }, 'editRpPrioritiesModal');
    });
}


// ============================================
// ATHLETICS TAB FUNCTIONALITY
// ============================================

let editAthleticsSelectedSports = [];

function escapeAthleticsHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function updateAthleticsDisplay(profile) {
    const chipsEl = document.getElementById('athleticsSportsChips');
    if (!chipsEl) return;

    const rawSports = Array.isArray(profile && profile.other_sports) ? profile.other_sports : [];
    const sports = rawSports.map(s => (typeof s === 'string' && s.startsWith('other:')) ? s.slice(6) : s);

    if (sports.length === 0) {
        chipsEl.innerHTML = '<span class="empty-state-inline">Football only</span>';
    } else {
        chipsEl.innerHTML = sports.map(s => `<span class="sport-chip">${escapeAthleticsHtml(s)}</span>`).join('');
    }

    const has100 = profile && profile.track_100m !== null && profile.track_100m !== undefined && profile.track_100m !== '';
    const has200 = profile && profile.track_200m !== null && profile.track_200m !== undefined && profile.track_200m !== '';
    const trackRow = document.getElementById('athleticsTrackRow');
    const t100Item = document.getElementById('athleticsTrack100Item');
    const t200Item = document.getElementById('athleticsTrack200Item');

    if (!has100 && !has200) {
        if (trackRow) trackRow.style.display = 'none';
    } else if (trackRow) {
        trackRow.style.display = '';
        if (t100Item) t100Item.style.display = has100 ? '' : 'none';
        if (t200Item) t200Item.style.display = has200 ? '' : 'none';
        if (has100) document.getElementById('athleticsTrack100').textContent = `${parseFloat(profile.track_100m).toFixed(2)}s`;
        if (has200) document.getElementById('athleticsTrack200').textContent = `${parseFloat(profile.track_200m).toFixed(2)}s`;
    }

    const editBtn = document.getElementById('editRpAthleticsBtn');
    if (editBtn) {
        if (isOwnProfile) editBtn.classList.add('show-button');
        else editBtn.classList.remove('show-button');
    }
}

function updateEditAthleticsSelectedChips() {
    const container = document.getElementById('editSelectedSports');
    if (!container) return;
    container.innerHTML = '';
    editAthleticsSelectedSports.forEach(sport => {
        const pill = document.createElement('div');
        pill.className = 'selected-item';
        pill.innerHTML = `${escapeAthleticsHtml(sport)} <button type="button" class="remove-edit-sport-item" data-sport="${escapeAthleticsHtml(sport)}">&times;</button>`;
        container.appendChild(pill);
    });
    container.querySelectorAll('.remove-edit-sport-item').forEach(btn => {
        btn.addEventListener('click', function() {
            const sport = this.dataset.sport;
            editAthleticsSelectedSports = editAthleticsSelectedSports.filter(s => s !== sport);
            const cb = document.querySelector(`.edit-sport-checkbox[value="${sport}"]`);
            if (cb) cb.checked = false;
            applyEditAthleticsVisibility();
            updateEditAthleticsSelectedChips();
        });
    });
}

function applyEditAthleticsVisibility() {
    const trackBlock = document.getElementById('editTrackTimesBlock');
    const otherGroup = document.getElementById('editOtherSportTextGroup');
    if (trackBlock) trackBlock.style.display = editAthleticsSelectedSports.includes('Track and Field') ? '' : 'none';
    if (otherGroup) otherGroup.style.display = editAthleticsSelectedSports.includes('Other') ? '' : 'none';
    if (!editAthleticsSelectedSports.includes('Track and Field')) {
        const t1 = document.getElementById('editTrack100m');
        const t2 = document.getElementById('editTrack200m');
        if (t1) t1.value = '';
        if (t2) t2.value = '';
    }
    if (!editAthleticsSelectedSports.includes('Other')) {
        const ost = document.getElementById('editOtherSportText');
        if (ost) ost.value = '';
    }
}

function showEditAthleticsModal() {
    const modal = document.getElementById('editAthleticsModal');
    if (!modal || !currentProfile) return;

    // Reset modal state
    editAthleticsSelectedSports = [];
    document.querySelectorAll('.edit-sport-checkbox').forEach(c => { c.checked = false; });
    document.querySelector('input[name="edit_plays_other_sports"][value="no"]').checked = true;
    document.getElementById('editOtherSportsBlock').style.display = 'none';
    document.getElementById('editOtherSportTextGroup').style.display = 'none';
    document.getElementById('editTrackTimesBlock').style.display = 'none';
    document.getElementById('editOtherSportText').value = '';
    document.getElementById('editTrack100m').value = '';
    document.getElementById('editTrack200m').value = '';

    // Prefill from currentProfile
    const rawSports = Array.isArray(currentProfile.other_sports) ? currentProfile.other_sports : [];
    if (rawSports.length > 0) {
        document.querySelector('input[name="edit_plays_other_sports"][value="yes"]').checked = true;
        document.getElementById('editOtherSportsBlock').style.display = '';

        const otherEntry = rawSports.find(s => typeof s === 'string' && s.startsWith('other:'));
        const standardSports = rawSports.filter(s => typeof s === 'string' && !s.startsWith('other:'));

        editAthleticsSelectedSports = standardSports.slice();
        standardSports.forEach(sport => {
            const cb = document.querySelector(`.edit-sport-checkbox[value="${sport}"]`);
            if (cb) cb.checked = true;
        });
        if (otherEntry) {
            editAthleticsSelectedSports.push('Other');
            const otherCb = document.querySelector('.edit-sport-checkbox[value="Other"]');
            if (otherCb) otherCb.checked = true;
            document.getElementById('editOtherSportText').value = otherEntry.slice(6);
        }
        applyEditAthleticsVisibility();
        updateEditAthleticsSelectedChips();

        if (editAthleticsSelectedSports.includes('Track and Field')) {
            if (currentProfile.track_100m != null) document.getElementById('editTrack100m').value = currentProfile.track_100m;
            if (currentProfile.track_200m != null) document.getElementById('editTrack200m').value = currentProfile.track_200m;
        }
    }

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function hideEditAthleticsModal() {
    const modal = document.getElementById('editAthleticsModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

async function saveAthleticsChanges() {
    const playsOther = document.querySelector('input[name="edit_plays_other_sports"]:checked').value === 'yes';
    let otherSportsPayload = null;
    if (playsOther && editAthleticsSelectedSports.length) {
        otherSportsPayload = editAthleticsSelectedSports.filter(s => s !== 'Other');
        if (editAthleticsSelectedSports.includes('Other')) {
            const otherText = (document.getElementById('editOtherSportText').value || '').trim();
            if (otherText) otherSportsPayload.push(`other:${otherText}`);
        }
        if (otherSportsPayload.length === 0) otherSportsPayload = null;
    }

    const t100 = (playsOther && editAthleticsSelectedSports.includes('Track and Field'))
        ? (parseFloat(document.getElementById('editTrack100m').value) || null) : null;
    const t200 = (playsOther && editAthleticsSelectedSports.includes('Track and Field'))
        ? (parseFloat(document.getElementById('editTrack200m').value) || null) : null;

    const payload = { other_sports: otherSportsPayload, track_100m: t100, track_200m: t200 };

    try {
        const response = await API.put('/profile', payload);
        if (response.success || response.profile) {
            currentProfile.other_sports = otherSportsPayload;
            currentProfile.track_100m = t100;
            currentProfile.track_200m = t200;
            updateAthleticsDisplay(currentProfile);
            hideEditAthleticsModal();
            if (typeof showToast === 'function') showToast('Athletics info saved', 'success');
        } else {
            showToast(response.message || 'Failed to save athletics information', 'error');
        }
    } catch (error) {
        console.error('Error saving athletics:', error);
        showToast('Failed to save athletics information. Please try again.', 'error');
    }
}

function setupAthleticsModal() {
    const editBtn = document.getElementById('editRpAthleticsBtn');
    const overlay = document.getElementById('editAthleticsModalOverlay');
    const closeBtn = document.getElementById('editAthleticsModalClose');
    const cancelBtn = document.getElementById('btnEditAthleticsCancel');
    const saveBtn = document.getElementById('btnEditAthleticsSave');

    if (editBtn && isOwnProfile) {
        editBtn.classList.add('show-button');
        editBtn.addEventListener('click', showEditAthleticsModal);
    }

    if (overlay) overlay.addEventListener('click', hideEditAthleticsModal);
    if (closeBtn) closeBtn.addEventListener('click', hideEditAthleticsModal);
    if (cancelBtn) cancelBtn.addEventListener('click', hideEditAthleticsModal);
    if (saveBtn) saveBtn.addEventListener('click', saveAthleticsChanges);

    // Wire modal Yes/No toggle
    document.querySelectorAll('input[name="edit_plays_other_sports"]').forEach(radio => {
        radio.addEventListener('change', function() {
            const show = this.value === 'yes';
            const block = document.getElementById('editOtherSportsBlock');
            if (block) block.style.display = show ? '' : 'none';
            if (!show) {
                editAthleticsSelectedSports = [];
                document.querySelectorAll('.edit-sport-checkbox:checked').forEach(c => { c.checked = false; });
                applyEditAthleticsVisibility();
                updateEditAthleticsSelectedChips();
            }
        });
    });

    // Wire modal sport checkboxes
    document.querySelectorAll('.edit-sport-checkbox').forEach(cb => {
        cb.addEventListener('change', function() {
            editAthleticsSelectedSports = Array.from(document.querySelectorAll('.edit-sport-checkbox:checked')).map(c => c.value);
            applyEditAthleticsVisibility();
            updateEditAthleticsSelectedChips();
        });
    });
}

// Initialize athletics when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        setupAthleticsModal();
        if (currentProfile) {
            updateAthleticsDisplay(currentProfile);
        }
    }, 500);
});


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
                // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
                // (bare/relative targets silently no-op there). new URL(rel, location.href)
                // correctly preserves the /frontend prefix on web and its absence in-app.
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

// ==================== Profile Views Functions ====================

// Record a profile view when viewing another user's profile
async function recordProfileView(viewedUserId) {
    try {
        await API.post(`/profile/view/${viewedUserId}`);
    } catch (error) {
        console.error('Error recording profile view:', error);
    }
}

// Fetch and display profile view count
async function loadProfileViewCount() {
    const viewCountElement = document.getElementById('profileViewsCount');
    const mobileViewCountElement = document.getElementById('mobileProfileViewsCount');
    const profileStatsWidget = document.getElementById('profileStatsWidget');
    const mobileProfileViewsLink = document.getElementById('mobileProfileViewsLink');

    // Only show profile stats for own profile
    if (!isOwnProfile) {
        if (profileStatsWidget) profileStatsWidget.style.display = 'none';
        if (mobileProfileViewsLink) mobileProfileViewsLink.style.display = 'none';
        return;
    }
    if (profileStatsWidget) profileStatsWidget.style.display = 'block';
    if (mobileProfileViewsLink) mobileProfileViewsLink.style.display = 'flex';

    try {
        const response = await API.get(`/profile/views/${currentUserId}`);
        const viewCount = response.viewCount || 0;
        if (viewCountElement) viewCountElement.textContent = viewCount;
        if (mobileViewCountElement) mobileViewCountElement.textContent = viewCount;
    } catch (error) {
        console.error('Error loading profile view count:', error);
        if (viewCountElement) viewCountElement.textContent = '0';
        if (mobileViewCountElement) mobileViewCountElement.textContent = '0';
    }
}

// Setup the profile viewers modal
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
            // Only open modal if viewing own profile
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
                        // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
                        // (bare/relative targets silently no-op there). new URL(rel, location.href)
                        // correctly preserves the /frontend prefix on web and its absence in-app.
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
    // parseServerDate (shared/api.js) reads offset-less timestamps as UTC. Roughly
    // 60 columns are `timestamp without time zone`, and parsing those as local time
    // puts them in the future, which pinned relative times to "just now" for hours.
    const date = (typeof parseServerDate === "function") ? parseServerDate(dateString) : new Date(dateString);
    const now = new Date();
    // Clamp negatives so clock skew cannot produce a nonsense future duration.
    const seconds = Math.max(0, Math.floor((now - date) / 1000));

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

    const optionsButton = `<button class="profile-post-more-btn" onclick="event.stopPropagation(); showRepostMenu('${post.share_id}', '${post.id}', ${isOwnRepost}, event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg></button>`;

    return `
        <article class="profile-post-card profile-repost-card" data-post-id="${post.id}" data-share-id="${post.share_id}" data-author-user-id="${post.author_user_id || post.user_id || ''}" onclick="navigateToPost('${post.id}')">
            <div class="profile-repost-indicator">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                <span>${isOwnRepost ? 'You' : reposterName} reposted</span>
                <span class="repost-time">${timeAgo}</span>
            </div>
            <div class="profile-post-header">
                <div class="profile-post-avatar" style="border: 2px solid ${getRoleBorderColor(post.original_author_role, post.original_author_transfer === 'y', post.original_author_division)}; color: ${getRoleBorderColor(post.original_author_role, post.original_author_transfer === 'y', post.original_author_division)}; background: ${getRoleAvatarBg(post.original_author_role, post.original_author_transfer === 'y', post.original_author_division)}">${post.original_author_image ? `<img src="${post.original_author_image}" alt="${originalAuthorName}">` : `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`}</div>
                <div class="profile-post-info">
                    <div class="profile-post-author">${originalAuthorName}${typeof getSchoolLogoHTML === 'function' && post.original_author_division ? getSchoolLogoHTML(post.original_author_school, (window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets'), 16) : ''}${post.original_author_username ? `<span class="profile-post-handle">@${post.original_author_username}</span>` : ''}<span class="profile-post-timestamp">${formatTimeAgo(post.original_created_at)}</span>${optionsButton}</div>
                    <div class="profile-post-meta ${post.original_author_role === 'coach' ? 'coach-meta' : (post.original_author_role === 'other' ? 'other-meta' : (post.original_author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">${originalMetaInfo}</div>
                </div>
            </div>
            <div class="profile-post-content"><p>${formatPostContent(post.original_content || '')}</p>${mediaHtml}</div>
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

// Create quote post card HTML
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
            if (div) parts.push(div);
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
            if (div) parts.push(div === 'High School' ? 'HS' : div);
        }
        return parts.join(' · ') + (parts.length > 0 ? ' · ' : '') + timeAgo;
    } else if (post.original_author_role === 'other') {
        const parts = [];
        if (post.original_author_subheader) parts.push(post.original_author_subheader);
        return parts.join(' · ') + (parts.length > 0 ? ' · ' : '') + timeAgo;
    }
    return timeAgo;
}

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
    } catch (error) { console.error('Error deleting repost:', error); closeProfilePostModal('delete-repost-modal'); showToast('Failed to remove repost', 'error'); }
}

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
    } catch (error) { console.error('Error deleting quote:', error); closeProfilePostModal('delete-quote-modal'); showToast('Failed to delete quote post', 'error'); }
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
    // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
    // (bare/relative targets silently no-op there). new URL(rel, location.href)
    // correctly preserves the /frontend prefix on web and its absence in-app.
    window.location.href = new URL(`post-view.html?id=${postId}&ref=profile`, window.location.href).href;
}

// Navigate to quote post single page
function navigateToQuotePost(shareId) {
    // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
    // (bare/relative targets silently no-op there). new URL(rel, location.href)
    // correctly preserves the /frontend prefix on web and its absence in-app.
    window.location.href = new URL(`post-view.html?share=${shareId}`, window.location.href).href;
}

// Open media slideshow (simple lightbox for profile page)
function openProfileMediaSlideshow(mediaUrls, startIndex = 0) {
    if (!mediaUrls || mediaUrls.length === 0) return;

    // Parse URLs if passed as string
    const urls = typeof mediaUrls === 'string' ? JSON.parse(mediaUrls) : mediaUrls;
    let currentIndex = startIndex;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'media-slideshow-overlay';
    overlay.innerHTML = `
        <div class="media-slideshow-container">
            <button class="slideshow-close" onclick="closeProfileMediaSlideshow()">&times;</button>
            ${urls.length > 1 ? `
                <button class="slideshow-nav slideshow-prev" onclick="navigateProfileSlideshow(-1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                <button class="slideshow-nav slideshow-next" onclick="navigateProfileSlideshow(1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            ` : ''}
            <div class="slideshow-media-container">
                <!-- Media will be inserted here -->
            </div>
            ${urls.length > 1 ? `<div class="slideshow-counter">${currentIndex + 1} / ${urls.length}</div>` : ''}
        </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Store data for navigation
    window.profileSlideshowData = { urls, currentIndex };

    // Show first media
    updateProfileSlideshowMedia();

    // Close on overlay click (not on content)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeProfileMediaSlideshow();
    });

    // Close on escape
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

    if (counter) {
        counter.textContent = `${data.currentIndex + 1} / ${data.urls.length}`;
    }
}

function navigateProfileSlideshow(direction) {
    const data = window.profileSlideshowData;
    if (!data) return;

    data.currentIndex = (data.currentIndex + direction + data.urls.length) % data.urls.length;
    updateProfileSlideshowMedia();
}

function closeProfileMediaSlideshow() {
    const overlay = document.querySelector('.media-slideshow-overlay');
    if (overlay) {
        overlay.remove();
        document.body.style.overflow = '';
    }
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
                let commentMetaLine = '';
                if (shareSubheader) {
                    commentMetaLine = shareSubheader.replace(/<\/span>$/, ` \u2022 ${commentTimeAgo}</span>`);
                } else {
                    commentMetaLine = `<span style="font-size:11px;color:rgba(254,252,251,0.5);">${commentTimeAgo}</span>`;
                }
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
                            <span class="comment-timestamp">${formatTimeAgo(comment.created_at)}</span>
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

async function profileSharePost(postId, event) {
    event?.stopPropagation();

    // Remove existing share menu
    const existing = document.querySelector('.share-menu');
    if (existing) existing.remove();

    // Create share menu
    const menu = document.createElement('div');
    menu.className = 'share-menu profile-dropdown-menu';
    menu.innerHTML = `
        <div class="dropdown-item" onclick="profileRepostPost('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="17 1 21 5 17 9"></polyline>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <polyline points="7 23 3 19 7 15"></polyline>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
            <span>Repost</span>
        </div>
        <div class="dropdown-item" onclick="profileQuotePost('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>Quote</span>
        </div>
        <div class="dropdown-item" onclick="event.stopPropagation(); profileCopyPostLink('${postId}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
            <span>Copy Link</span>
        </div>
    `;

    // Position menu near event target
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

function profileCopyPostLink(postId) {
    document.querySelector('.share-menu')?.remove();
    // getShareBaseUrl points at the public site — inside the iOS app the WebView
    // origin is https://localhost, a dead link for anyone it's shared with.
    const url = `${getShareBaseUrl()}/${getProfileFolder({ role: getUser()?.role || 'player' })}/tabs/post-view.html?id=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Link copied to clipboard');
    }).catch(() => {
        showToast('Failed to copy link', 'error');
    });
}

async function profileRepostPost(postId) {
    // Close menu
    const menu = document.querySelector('.share-menu');
    if (menu) menu.remove();

    try {
        await API.post(`/posts/${postId}/share`, { share_type: 'repost' });
        showToast('Post reposted!', 'success');
    } catch (error) {
        console.error('Error reposting:', error);
        if (error.message?.includes('already shared')) {
            showToast('You already reposted this', 'error');
        } else {
            showToast('Failed to repost', 'error');
        }
    }
}

function profileQuotePost(postId) {
    // Close menu
    const menu = document.querySelector('.share-menu');
    if (menu) menu.remove();

    // Create quote modal
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'quote-modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 500px;">
            <div class="modal-header">
                <h3>Quote Post</h3>
                <button class="modal-close" onclick="document.getElementById('quote-modal').remove()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="modal-body">
                <textarea id="quote-content" placeholder="Add your thoughts..." rows="4" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; resize: none; font-size: 15px;"></textarea>
            </div>
            <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
                <button class="btn-secondary" onclick="document.getElementById('quote-modal').remove()">Cancel</button>
                <button class="btn-primary" onclick="submitProfileQuote('${postId}')">Post Quote</button>
            </div>
        </div>
    `;

    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });

    document.body.appendChild(modal);
    document.getElementById('quote-content').focus();
}

async function submitProfileQuote(postId) {
    const content = document.getElementById('quote-content')?.value.trim();
    if (!content) {
        showToast('Please add your thoughts to the quote', 'error');
        return;
    }

    try {
        await API.post(`/posts/${postId}/share`, { share_type: 'quote', quote_content: content });
        document.getElementById('quote-modal')?.remove();
        showToast('Quote posted!', 'success');
    } catch (error) {
        console.error('Error posting quote:', error);
        showToast('Failed to post quote', 'error');
    }
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
    // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
    // (bare/relative targets silently no-op there). new URL(rel, location.href)
    // correctly preserves the /frontend prefix on web and its absence in-app.
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
                        <span class="profile-post-timestamp">${formatTimeAgo(post.created_at)}</span>
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

// Escape HTML utility
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Mobile sidebar toggle functionality
document.addEventListener('DOMContentLoaded', function() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (sidebarToggle && sidebar) {
        // Toggle sidebar on button click
        sidebarToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            sidebar.classList.toggle('open');
            if (sidebarOverlay) {
                sidebarOverlay.classList.toggle('active');
            }
        });

        // Close sidebar when clicking overlay
        if (sidebarOverlay) {
            sidebarOverlay.addEventListener('click', function() {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            });
        }

        // Close sidebar when clicking a nav link (on mobile)
        const navLinks = sidebar.querySelectorAll('.nav-item');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('open');
                    if (sidebarOverlay) {
                        sidebarOverlay.classList.remove('active');
                    }
                }
            });
        });
    }
});
