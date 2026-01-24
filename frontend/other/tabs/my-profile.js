// My Profile JavaScript - Other Profile Type
// Backend connected version for "other" user profiles

let currentProfile = null;
let currentUserId = null;
let viewingUserId = null;
let isOwnProfile = true;
let originalUsername = '';

// Profile posts, replies, and likes state
let profilePostsLoaded = false;
let profileRepliesLoaded = false;
let profileLikesLoaded = false;
let profilePostsOffset = 0;
let profileRepliesOffset = 0;
let profileLikesOffset = 0;
const POSTS_PER_PAGE = 10;
const REPLIES_PER_PAGE = 10;
const LIKES_PER_PAGE = 10;

// ============ INITIALIZATION ============

document.addEventListener('DOMContentLoaded', async function() {
    console.log('My Profile page loaded (other profile type)');

    // Initialize UI components
    initializeTabs();
    initializeEditProfileModal();
    initializeFollowListModal();
    initializePhotoUpload();
    initializeShareButton();

    // Get username from URL if viewing someone else's profile
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');

    // Load current user first
    await loadCurrentUser();

    // Load profile data based on URL params
    if (username) {
        await loadProfileByUsername(username);
    } else {
        await loadOwnProfile();
    }
});

// Load the currently logged-in user's ID
async function loadCurrentUser() {
    try {
        const response = await API.get('/auth/me');
        if (response.user) {
            currentUserId = response.user.id;
        }
    } catch (error) {
        console.error('Failed to load current user:', error);
    }
}

// ============ LOAD PROFILE FROM BACKEND ============

async function loadOwnProfile() {
    try {
        const response = await API.get('/auth/me');

        if (response.user && response.profile) {
            currentProfile = response.profile;
            viewingUserId = response.user.id;
            isOwnProfile = true;
            displayProfile(response.profile, 'other'); // Own profile is always 'other' type

            // Show Likes tab for own profile
            const likesTab = document.querySelector('.profile-tab[data-tab="likes"]');
            if (likesTab) {
                likesTab.style.display = '';
            }

            // Load follower/following counts
            loadFollowCounts(viewingUserId);

            // Load initial posts since Posts tab is now the default active tab
            loadProfilePosts();
        } else {
            console.error('No profile data received');
            showError('Failed to load profile');
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

            // Hide Likes tab if viewing someone else's profile
            const likesTab = document.querySelector('.profile-tab[data-tab="likes"]');
            if (likesTab) {
                likesTab.style.display = isOwnProfile ? '' : 'none';
            }

            // Load follower/following counts
            loadFollowCounts(viewingUserId);

            // Load initial posts since Posts tab is now the default active tab
            loadProfilePosts();
        } else {
            showError('Profile not found');
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile');
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

function displayProfile(profile, type, accessLevel = 'full', hasPendingRequest = false) {
    console.log('displayProfile called with type:', type, 'accessLevel:', accessLevel);

    // Use passed profile or fall back to currentProfile
    const profileData = profile || currentProfile;
    if (!profileData) return;

    // Check if this is a restricted (private) profile view
    const isRestrictedView = accessLevel === 'limited';


    // Update profile name in header
    const nameElement = document.querySelector('.profile-name');
    if (nameElement) {
        const firstName = profileData.first_name || '';
        const lastName = profileData.last_name || '';
        nameElement.textContent = `${firstName} ${lastName}`.trim() || 'Your Name';
    }

    // Display type-specific content
    if (type === 'player') {
        displayPlayerProfile(profileData);
    } else if (type === 'coach') {
        displayCoachProfile(profileData);
    } else {
        displayOtherProfile(profileData);
    }

    // Update username display
    const usernameElement = document.querySelector('.profile-username');
    if (usernameElement) {
        usernameElement.textContent = profileData.username ? `@${profileData.username}` : '';
    }

    // Update bio in the About section
    const bioText = document.querySelector('.profile-info-row .bio-text');
    if (bioText) {
        if (profileData.bio) {
            bioText.textContent = profileData.bio;
            bioText.classList.remove('empty-state');
        } else {
            bioText.textContent = 'No bio provided yet.';
            bioText.classList.add('empty-state');
        }
    }

    // Update Contact Info section
    updateContactInfoSection();

    // Update profile image if available
    const imgUrl = profileData.profile_picture_url || profileData.profile_image_url;
    if (imgUrl) {
        const avatarElement = document.getElementById('profileAvatar');
        if (avatarElement) {
            avatarElement.innerHTML = `<img src="${imgUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    }

    // Show the profile content
    const profileContent = document.querySelector('.profile-content');
    if (profileContent) {
        profileContent.classList.add('profile-loaded');
    }

    // Show dashboard container
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer) {
        dashboardContainer.classList.add('profile-loaded');
    }

    // Update sidebar footer with current profile info (only for own profile)
    if (isOwnProfile) {
        updateSidebarFooter();
    }

    // Update profile actions based on ownership
    updateProfileActions();

    // If this is a private profile view (restricted), add overlay on tabs section
    if (isRestrictedView) {
        addPrivateProfileOverlay();
        disableFollowLinksForPrivateProfile();
    }
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

// Helper function to format height
function formatHeight(height) {
    if (!height) return null;
    if (typeof height === 'string' && (height.includes("'") || height.includes('"'))) {
        return height;
    }
    if (typeof height === 'number') {
        const feet = Math.floor(height / 12);
        const inches = height % 12;
        return `${feet}'${inches}"`;
    }
    if (typeof height === 'string' && /^\d+$/.test(height)) {
        const totalInches = parseInt(height);
        const feet = Math.floor(totalInches / 12);
        const inches = totalInches % 12;
        return `${feet}'${inches}"`;
    }
    return height;
}

function displayPlayerProfile(profile) {
    // Update position/title line for player
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        const parts = [];
        if (profile.position) {
            const positionDisplay = Array.isArray(profile.position)
                ? profile.position.join('/')
                : profile.position;
            parts.push(positionDisplay);
        }
        if (profile.height) {
            const formattedHeight = formatHeight(profile.height);
            if (formattedHeight) parts.push(formattedHeight);
        }
        if (profile.weight) {
            parts.push(`${profile.weight} lbs`);
        }
        if (profile.college_division) {
            const div = profile.college_division;
            if (div === 'FBS' || div === 'FCS') {
                parts.push(`D1 ${div}`);
            } else {
                parts.push(div);
            }
        }
        positionElement.textContent = parts.join(' • ') || 'Player';
        positionElement.style.color = '#1282a2'; // Blue for players
    }
}

function displayCoachProfile(profile) {
    // Update position/title line for coach
    const positionElement = document.querySelector('.profile-position');
    if (positionElement) {
        const parts = [];
        if (profile.position_title) parts.push(profile.position_title);
        if (profile.team_name) parts.push(profile.team_name);
        if (profile.college_division) {
            const div = profile.college_division;
            if (div === 'FBS' || div === 'FCS') {
                parts.push(`D1 ${div}`);
            } else {
                parts.push(div);
            }
        }
        positionElement.textContent = parts.join(' • ') || 'Coach';
        positionElement.style.color = '#f47521'; // Orange for coaches
    }
}

function displayOtherProfile(profileData) {
    // Update subheader (displayed under name, using profile-position element)
    const subheaderElement = document.querySelector('.profile-position');
    if (subheaderElement) {
        const parts = [];
        if (profileData.subheader) parts.push(profileData.subheader);
        if (profileData.company_name) parts.push(profileData.company_name);
        subheaderElement.textContent = parts.join(' • ') || '';
        subheaderElement.style.color = '#d4a017'; // Yellow color for other profile
    }
}

// Update sidebar footer and mobile header with current user info
function updateSidebarFooter() {
    if (!currentProfile) return;

    const firstName = currentProfile.first_name || '';
    const lastName = currentProfile.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim() || 'Other User';
    const subheaderText = currentProfile.subheader || '';

    // Update name in sidebar
    const userName = document.querySelector('.sidebar-footer .user-name');
    if (userName) {
        userName.textContent = fullName;
    }

    // Update subheader in sidebar
    const userRoleElement = document.querySelector('.sidebar-footer .user-role');
    if (userRoleElement) {
        userRoleElement.textContent = subheaderText;
        userRoleElement.style.color = '#d4a017'; // Yellow color for other profile
    }

    // Update avatar in sidebar and restore visibility (it was hidden initially to prevent flash)
    const sidebarAvatar = document.querySelector('.sidebar-footer .user-avatar-circle');
    if (sidebarAvatar) {
        if (currentProfile.profile_picture_url) {
            sidebarAvatar.innerHTML = `<img src="${currentProfile.profile_picture_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
        sidebarAvatar.style.visibility = 'visible';
    }

    // === MOBILE HEADER UPDATES ===
    // Update mobile header profile picture
    const mobileProfilePic = document.getElementById('mobileProfilePic');
    if (mobileProfilePic) {
        if (currentProfile.profile_picture_url) {
            mobileProfilePic.innerHTML = `<img src="${currentProfile.profile_picture_url}" alt="Profile" class="mobile-profile-pic">`;
        }
    }

    // Update mobile header user name
    const mobileUserName = document.getElementById('mobileUserName');
    if (mobileUserName) {
        mobileUserName.textContent = fullName;
    }

    // Update mobile header user role/subheader
    const mobileUserRole = document.getElementById('mobileUserRole');
    if (mobileUserRole) {
        mobileUserRole.textContent = subheaderText;
    }

    // === MOBILE SIDEBAR UPDATES ===
    // Update mobile sidebar avatar
    const mobileSidebarAvatar = document.getElementById('mobileSidebarAvatar');
    if (mobileSidebarAvatar && currentProfile.profile_picture_url) {
        mobileSidebarAvatar.innerHTML = `<img src="${currentProfile.profile_picture_url}" alt="Profile" class="mobile-sidebar-avatar">`;
    }

    // Update mobile sidebar user name
    const mobileSidebarUserName = document.getElementById('mobileSidebarUserName');
    if (mobileSidebarUserName) {
        mobileSidebarUserName.textContent = fullName;
    }

    // Update mobile sidebar user role
    const mobileSidebarUserRole = document.getElementById('mobileSidebarUserRole');
    if (mobileSidebarUserRole) {
        mobileSidebarUserRole.textContent = subheaderText;
    }
}

// Update profile actions (edit/share/follow buttons) based on ownership
function updateProfileActions(hasPendingRequest = false) {
    const actionsContainer = document.querySelector('.profile-actions');
    if (!actionsContainer) return;

    // Store pending request status for follow button setup
    window.hasPendingFollowRequest = hasPendingRequest;

    // Check if navigated to this profile via URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const hasUsernameParam = urlParams.get('username');

    if (isOwnProfile && !hasUsernameParam) {
        // Show edit and share buttons (viewing own profile directly)
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
                const profileUrl = `${window.location.origin}/frontend/other/tabs/my-profile.html?username=${currentProfile.username}`;
                try {
                    await navigator.clipboard.writeText(profileUrl);
                    showToast('Profile link copied to clipboard!');
                } catch (err) {
                    showToast('Failed to copy link');
                }
            });
        }
    } else if (isOwnProfile && hasUsernameParam) {
        // Own profile but navigated via URL - show back, edit, and share buttons
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
                const profileUrl = `${window.location.origin}/frontend/other/tabs/my-profile.html?username=${currentProfile.username}`;
                try {
                    await navigator.clipboard.writeText(profileUrl);
                    showToast('Profile link copied to clipboard!');
                } catch (err) {
                    showToast('Failed to copy link');
                }
            });
        }
    } else {
        // Viewing someone else's profile - show back, follow, and message buttons
        actionsContainer.innerHTML = `
            <button class="btn-back" id="backBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 12H5M12 19l-7-7 7-7"></path>
                </svg>
                Back
            </button>
            <button class="btn-follow" id="followBtn">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                Follow
            </button>
            <button class="btn-message" id="messageBtn" style="display: none;">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Message
            </button>
        `;

        // Setup back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        // Setup follow button
        const followBtn = document.getElementById('followBtn');
        if (followBtn) {
            // Check if already following
            checkFollowStatus(followBtn);
            followBtn.addEventListener('click', () => toggleFollow(followBtn));
        }

        // Setup message button (checks permissions and shows/hides accordingly)
        setupMessageButton();
    }
}

async function setupMessageButton() {
    const messageBtn = document.getElementById('messageBtn');
    if (!messageBtn || !viewingUserId) return;

    // Check message permissions
    try {
        const permissionResult = await API.get(`/follow/can-message/${viewingUserId}`);

        if (permissionResult.canMessage) {
            // Show the message button
            messageBtn.style.display = '';
            messageBtn.addEventListener('click', () => {
                // Navigate to messages with this user
                window.location.href = `messages.html?userId=${viewingUserId}`;
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
            window.location.href = `messages.html?userId=${viewingUserId}`;
        });
    }
}

// Check if currently following this user
async function checkFollowStatus(followBtn) {
    try {
        const response = await followAPI.checkFollowing(viewingUserId);
        const hasPendingRequest = window.hasPendingFollowRequest || false;

        if (response.isFollowing) {
            followBtn.classList.add('following');
            followBtn.classList.remove('requested');
            followBtn.innerHTML = `
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <polyline points="17 11 19 13 23 9"></polyline>
                </svg>
                Following
            `;
        } else if (hasPendingRequest) {
            followBtn.classList.add('requested');
            followBtn.classList.remove('following');
            followBtn.innerHTML = `
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <circle cx="20" cy="11" r="3"></circle>
                </svg>
                Requested
            `;
        }
    } catch (error) {
        console.error('Error checking follow status:', error);
    }
}

// Toggle follow/unfollow
async function toggleFollow(followBtn) {
    const isFollowing = followBtn.classList.contains('following');
    const isRequested = followBtn.classList.contains('requested');

    try {
        if (isFollowing) {
            await followAPI.unfollow(viewingUserId);
            followBtn.classList.remove('following');
            followBtn.classList.remove('requested');
            followBtn.innerHTML = `
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                Follow
            `;
            showToast('Unfollowed');
            window.hasPendingFollowRequest = false;
        } else if (isRequested) {
            // Cancel the follow request
            await API.delete(`/follow/${viewingUserId}/request`);
            followBtn.classList.remove('requested');
            followBtn.innerHTML = `
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="8.5" cy="7" r="4"></circle>
                    <line x1="20" y1="8" x2="20" y2="14"></line>
                    <line x1="23" y1="11" x2="17" y2="11"></line>
                </svg>
                Follow
            `;
            showToast('Request cancelled');
            window.hasPendingFollowRequest = false;
        } else {
            const response = await followAPI.follow(viewingUserId);
            if (response.requestPending) {
                followBtn.classList.add('requested');
                followBtn.innerHTML = `
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <circle cx="20" cy="11" r="3"></circle>
                    </svg>
                    Requested
                `;
                showToast('Follow request sent');
                window.hasPendingFollowRequest = true;
            } else {
                followBtn.classList.add('following');
                followBtn.innerHTML = `
                    <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="8.5" cy="7" r="4"></circle>
                        <polyline points="17 11 19 13 23 9"></polyline>
                    </svg>
                    Following
                `;
                showToast('Following');
            }
        }

        // Update follower count
        loadFollowCounts(viewingUserId);
    } catch (error) {
        console.error('Error toggling follow:', error);
        showToast('Failed to update follow status');
    }
}

// Update the Contact Info section between header and tabs
function updateContactInfoSection() {
    const contactInfoCard = document.getElementById('contactInfoCard');
    if (!contactInfoCard) return;

    let contactHTML = '';

    if (currentProfile.email) {
        contactHTML += `
            <div class="contact-item">
                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
                <span>${currentProfile.email}</span>
            </div>
        `;
    }

    if (currentProfile.phone) {
        const formattedPhone = formatPhoneNumber(currentProfile.phone);
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

function showError(message) {
    console.error(message);
    // Show the profile content anyway so UI isn't blank
    const profileContent = document.querySelector('.profile-content');
    if (profileContent) {
        profileContent.classList.add('profile-loaded');
    }
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer) {
        dashboardContainer.classList.add('profile-loaded');
    }
}

// ============ TAB FUNCTIONALITY ============

function initializeTabs() {
    const tabs = document.querySelectorAll('.profile-tab');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const tabId = this.dataset.tab;

            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');

            // Load posts, replies, or likes when those tabs are clicked
            if (tabId === 'posts' && !profilePostsLoaded) {
                loadProfilePosts();
            } else if (tabId === 'replies' && !profileRepliesLoaded) {
                loadProfileReplies();
            } else if (tabId === 'likes' && !profileLikesLoaded) {
                loadProfileLikes();
            }
        });
    });

    // Setup load more buttons
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
}

// ============ EDIT PROFILE MODAL ============

function initializeEditProfileModal() {
    // Note: Edit button click handler is set up dynamically in updateProfileActions()
    const modal = document.getElementById('editProfileModal');
    const closeBtn = document.getElementById('editModalClose');
    const cancelBtn = document.getElementById('btnModalCancel');
    const saveBtn = document.getElementById('btnModalSave');
    const overlay = document.getElementById('editModalOverlay');

    // Close modal handlers
    if (closeBtn) {
        closeBtn.addEventListener('click', hideEditProfileModal);
    }
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideEditProfileModal);
    }
    if (overlay) {
        overlay.addEventListener('click', hideEditProfileModal);
    }

    // Save changes
    if (saveBtn) {
        saveBtn.addEventListener('click', saveProfileChanges);
    }

    // Initialize bio character counter
    const bioTextarea = document.getElementById('editBio');
    const charCounter = document.getElementById('bioCharCounter');
    if (bioTextarea && charCounter) {
        bioTextarea.addEventListener('input', function() {
            const length = this.value.length;
            charCounter.textContent = `${length}/150`;
            charCounter.classList.toggle('limit-reached', length >= 150);
        });
    }

    // Initialize subheader character counter
    const subheaderInput = document.getElementById('editSubheader');
    const subheaderCounter = document.getElementById('subheaderCharCounter');
    if (subheaderInput && subheaderCounter) {
        subheaderInput.addEventListener('input', function() {
            const length = this.value.length;
            subheaderCounter.textContent = `${length}/30`;
            subheaderCounter.classList.toggle('limit-reached', length >= 30);
        });
    }

    // Initialize phone number formatting
    const phoneInput = document.getElementById('editPhone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            this.value = formatPhoneNumber(this.value);
        });
    }

    // Initialize username availability check
    const usernameInput = document.getElementById('editUsername');
    if (usernameInput) {
        let usernameCheckTimeout;
        usernameInput.addEventListener('input', function() {
            clearTimeout(usernameCheckTimeout);
            const username = this.value.trim();

            // TODO: Add backend check for username availability
            console.log('Check username availability:', username);
        });
    }
}

function showEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        populateEditForm();
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function hideEditProfileModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function populateEditForm() {
    // Populate form with current profile data
    const editFirstName = document.getElementById('editFirstName');
    const editLastName = document.getElementById('editLastName');
    const editUsername = document.getElementById('editUsername');
    const editSubheader = document.getElementById('editSubheader');
    const editBio = document.getElementById('editBio');
    const editEmail = document.getElementById('editEmail');
    const editPhone = document.getElementById('editPhone');

    if (currentProfile) {
        if (editFirstName) editFirstName.value = currentProfile.first_name || '';
        if (editLastName) editLastName.value = currentProfile.last_name || '';
        if (editUsername) editUsername.value = currentProfile.username || '';
        if (editSubheader) editSubheader.value = currentProfile.subheader || '';
        if (editBio) editBio.value = currentProfile.bio || '';
        if (editEmail) editEmail.value = currentProfile.email || '';
        if (editPhone) editPhone.value = formatPhoneNumber(currentProfile.phone) || '';

        // Update bio character counter
        if (editBio) {
            const charCounter = document.getElementById('bioCharCounter');
            if (charCounter) {
                charCounter.textContent = `${editBio.value.length}/150`;
            }
        }

        // Update subheader character counter
        if (editSubheader) {
            const subheaderCounter = document.getElementById('subheaderCharCounter');
            if (subheaderCounter) {
                subheaderCounter.textContent = `${editSubheader.value.length}/30`;
            }
        }

        // Store original username for validation
        originalUsername = currentProfile.username || '';
    }
}

async function saveProfileChanges() {
    const saveBtn = document.getElementById('btnModalSave');

    // Gather form data
    const formData = {
        first_name: document.getElementById('editFirstName')?.value?.trim() || '',
        last_name: document.getElementById('editLastName')?.value?.trim() || '',
        username: document.getElementById('editUsername')?.value?.trim() || '',
        subheader: document.getElementById('editSubheader')?.value?.trim() || '',
        bio: document.getElementById('editBio')?.value?.trim() || '',
        email: document.getElementById('editEmail')?.value?.trim() || '',
        phone: document.getElementById('editPhone')?.value?.replace(/\D/g, '') || ''
    };

    // Validate required fields
    if (!formData.first_name || !formData.last_name) {
        showToast('First name and last name are required');
        return;
    }

    if (!formData.username) {
        showToast('Username is required');
        return;
    }

    // Validate username format (letters, numbers, underscores only)
    if (!/^[a-zA-Z0-9_]+$/.test(formData.username)) {
        showToast('Username can only contain letters, numbers, and underscores');
        return;
    }

    // Validate email format if provided
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        showToast('Please enter a valid email address');
        return;
    }

    // Show loading state
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const response = await API.put('/profile', formData);

        if (response.success || response.profile) {
            // Update local profile data
            currentProfile = { ...currentProfile, ...formData };

            // Update the display
            displayProfile();

            // Close modal
            hideEditProfileModal();

            showToast('Profile updated successfully!');
        } else {
            showToast('Failed to update profile');
        }
    } catch (error) {
        console.error('Error saving profile:', error);
        showToast('Failed to save changes. Please try again.');
    } finally {
        // Reset button state
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// ============ FOLLOWERS/FOLLOWING MODAL ============

function initializeFollowListModal() {
    const followersLink = document.getElementById('followersLink');
    const followingLink = document.getElementById('followingLink');
    const modal = document.getElementById('followListModal');
    const closeBtn = document.getElementById('followListModalClose');
    const overlay = document.getElementById('followListModalOverlay');

    if (followersLink) {
        followersLink.addEventListener('click', function(e) {
            e.preventDefault();
            showFollowListModal('followers');
        });
    }

    if (followingLink) {
        followingLink.addEventListener('click', function(e) {
            e.preventDefault();
            showFollowListModal('following');
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', hideFollowListModal);
    }

    if (overlay) {
        overlay.addEventListener('click', hideFollowListModal);
    }
}

async function showFollowListModal(type) {
    const modal = document.getElementById('followListModal');
    const title = document.getElementById('followListModalTitle');
    const body = document.getElementById('followListModalBody');

    if (!modal || !title || !body) return;

    title.textContent = type === 'followers' ? 'Followers' : 'Following';
    body.innerHTML = '<div class="follow-list-loading">Loading...</div>';
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';

    try {
        let users = [];
        if (type === 'followers') {
            const response = await followAPI.getFollowers(currentUserId);
            users = response.followers || response || [];
        } else {
            const response = await followAPI.getFollowing(currentUserId);
            users = response.following || response || [];
        }

        if (users.length === 0) {
            body.innerHTML = `<div class="follow-list-empty" style="text-align: center; padding: 2rem; color: #666;">No ${type} yet</div>`;
            return;
        }

        // Render the list
        body.innerHTML = users.map(user => `
            <div class="follow-list-item" data-user-id="${user.id}" data-role="${user.role}" style="display: flex; align-items: center; padding: 12px; cursor: pointer; border-bottom: 1px solid #eee;">
                <div class="follow-list-avatar" style="width: 48px; height: 48px; border-radius: 50%; overflow: hidden; margin-right: 12px; background: #f0f0f0; display: flex; align-items: center; justify-content: center;">
                    ${user.profile_image_url
                        ? `<img src="${user.profile_image_url}" alt="${user.first_name}" style="width: 100%; height: 100%; object-fit: cover;">`
                        : `<svg viewBox="0 0 24 24" fill="#999" width="24" height="24">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                           </svg>`
                    }
                </div>
                <div class="follow-list-info">
                    <div class="follow-list-name" style="font-weight: 600; color: #1a1a2e;">${user.first_name} ${user.last_name}</div>
                    <div class="follow-list-role" style="font-size: 0.85rem; color: #666; text-transform: capitalize;">${user.role}</div>
                </div>
            </div>
        `).join('');

        // Add click handlers to navigate to profiles
        body.querySelectorAll('.follow-list-item').forEach(item => {
            item.addEventListener('click', async () => {
                const visitorUserId = item.dataset.userId;
                const role = item.dataset.role;

                // Fetch the user's profile to navigate to their profile page
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
                        hideFollowListModal();
                        const profile = profileResponse.profile;
                        // Navigate to appropriate profile folder based on role and profile data
                        let folder = 'hsplayer';
                        if (role === 'coach') {
                            const hasCollegeDivision = profile.college_division &&
                                ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(profile.college_division);
                            folder = hasCollegeDivision ? 'collegecoach' : 'hscoach';
                        } else if (role === 'other') {
                            folder = 'other';
                        } else {
                            // Player - check for transfer or college
                            if (profile.transfer === 'y' || profile.is_transfer_player) {
                                folder = 'transferplayer';
                            } else if (profile.college_division &&
                                ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(profile.college_division)) {
                                folder = 'collegeplayer';
                            } else {
                                folder = 'hsplayer';
                            }
                        }
                        window.location.href = `../../${folder}/tabs/my-profile.html?username=${profile.username}&from=profile`;
                    }
                } catch (error) {
                    console.error('Error fetching profile:', error);
                }
            });
        });

    } catch (error) {
        console.error('Error loading follow list:', error);
        body.innerHTML = '<div class="follow-list-empty" style="text-align: center; padding: 2rem; color: #666;">Failed to load</div>';
    }
}

function hideFollowListModal() {
    const modal = document.getElementById('followListModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ============ PHOTO UPLOAD ============

function initializePhotoUpload() {
    const changePhotoBtn = document.getElementById('changePhotoBtn');
    const photoInput = document.getElementById('photoUploadInput');

    if (changePhotoBtn && photoInput) {
        changePhotoBtn.addEventListener('click', function() {
            photoInput.click();
        });

        photoInput.addEventListener('change', handlePhotoUpload);
    }
}

async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        showToast('Please select a valid image file (JPG, JPEG, or PNG)');
        event.target.value = '';
        return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
        showToast('File size must be less than 5MB');
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
        <div class="upload-spinner" style="display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
            <div class="spinner" style="width: 40px; height: 40px; border: 3px solid rgba(18, 130, 162, 0.2); border-top-color: var(--cerulean); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        </div>
    `;
    if (changePhotoBtn) {
        changePhotoBtn.disabled = true;
        changePhotoBtn.style.opacity = '0.5';
    }

    try {
        console.log('Calling uploadAPI.uploadProfileImage...');
        // Upload to server
        const response = await uploadAPI.uploadProfileImage(file);
        console.log('Upload response:', response);

        if (response.imageUrl || response.url) {
            const imageUrl = response.imageUrl || response.url;

            // Update profile with new image URL
            currentProfile.profile_picture_url = imageUrl;

            // Update avatar
            avatarElement.innerHTML = `<img src="${imageUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;

            // Update avatar in sidebar
            const sidebarAvatar = document.querySelector('.sidebar-footer .user-avatar-circle');
            if (sidebarAvatar) {
                sidebarAvatar.innerHTML = `<img src="${imageUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }

            // Show success message
            showToast('Profile photo updated successfully!');
        } else {
            throw new Error('No image URL returned from server');
        }

    } catch (error) {
        console.error('Error uploading photo:', error);

        // Restore original avatar on error
        avatarElement.innerHTML = originalAvatarHTML;

        // Show error message
        showToast(`Failed to upload photo: ${error.message}`);
    } finally {
        // Re-enable button
        if (changePhotoBtn) {
            changePhotoBtn.disabled = false;
            changePhotoBtn.style.opacity = '1';
        }
    }
}

// ============ SHARE BUTTON ============

function initializeShareButton() {
    // Note: Share button click handler is now set up dynamically in updateProfileActions()
    // This function is kept for backwards compatibility but the handler is now in updateProfileActions
}

// ============ UTILITY FUNCTIONS ============

function formatPhoneNumber(phone) {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 0) return '';
    if (digits.length <= 3) return '(' + digits;
    if (digits.length <= 6) return '(' + digits.substring(0, 3) + ') ' + digits.substring(3);
    return '(' + digits.substring(0, 3) + ') ' + digits.substring(3, 6) + '-' + digits.substring(6, 10);
}

function showToast(message) {
    // Remove existing toast
    const existingToast = document.querySelector('.profile-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = 'profile-toast';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a2e;
        color: white;
        padding: 1rem 2rem;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 10000;
        animation: toastSlideUp 0.3s ease;
    `;

    // Add animation keyframes if not already added
    if (!document.getElementById('toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `
            @keyframes toastSlideUp {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'toastSlideUp 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ============ PROFILE POSTS, REPLIES & LIKES ============

// Helper function to format time ago
function formatTimeAgo(dateString) {
    if (!dateString) return 'Just now';

    const date = new Date(dateString);
    const now = new Date();

    // Check for invalid date
    if (isNaN(date.getTime())) {
        return 'Just now';
    }

    const diffMs = now - date;
    const seconds = Math.floor(diffMs / 1000);

    // Handle future dates (negative diff) or very recent posts
    if (seconds < 0 || seconds < 60) return 'Just now';
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
    let formatted = content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
    formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
    formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return formatted;
}

// Navigate to single post view
function navigateToPost(postId) {
    window.location.href = `post-view.html?id=${postId}&ref=profile`;
}

// Build meta info for post author (handles all profile types)
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

    const timeAgo = formatTimeAgo(post.created_at);

    if (post.author_role === 'player') {
        const parts = [];
        if (post.author_transfer === 'y') {
            // Transfer Player: Position • Height • Weight • YOE
            if (post.author_position) parts.push(post.author_position);

            if (post.author_height) {
                const heightStr = String(post.author_height);
                if (heightStr.includes("'")) {
                    parts.push(heightStr);
                } else {
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
            const div = post.author_division;
            if (div === 'FBS' || div === 'FCS') {
                parts.push(`D1 ${div}`);
            } else {
                parts.push(div);
            }
        } else {
            // HS Player: Position • High School • Class of Year
            if (post.author_position) parts.push(post.author_position);
            if (post.author_school) parts.push(post.author_school);
            if (post.author_grad_year) {
                parts.push(`Class of ${post.author_grad_year}`);
            }
        }
        parts.push(timeAgo);
        metaInfo = starsHtml + parts.join(' • ');
    } else if (post.author_role === 'coach') {
        // Coach
        const parts = [];
        if (post.author_division) {
            // College Coach: College • Division
            if (post.author_school) parts.push(post.author_school);
            const div = post.author_division;
            if (div === 'FBS' || div === 'FCS') {
                parts.push(`D1 ${div}`);
            } else {
                parts.push(div);
            }
            parts.push(timeAgo);
            metaInfo = parts.join(' • ');
        } else {
            // HS Coach: School, State (comma-separated like sidebar)
            if (post.author_school) parts.push(post.author_school);
            if (post.author_state) parts.push(post.author_state);
            const schoolState = parts.join(', ');
            metaInfo = schoolState ? `${schoolState} • ${timeAgo}` : timeAgo;
        }
    } else if (post.author_role === 'other') {
        // Other profile type: subheader in yellow
        if (post.author_subheader) {
            metaInfo = `<span style="color: #d4a017;">${post.author_subheader} • ${timeAgo}</span>`;
        } else {
            metaInfo = `<span style="color: #d4a017;">${timeAgo}</span>`;
        }
    } else {
        // Fallback
        metaInfo = timeAgo;
    }

    return metaInfo;
}

// Load profile posts
async function loadProfilePosts(loadMore = false) {
    const container = document.getElementById('profilePostsContainer');
    const loadMoreContainer = document.getElementById('loadMorePostsContainer');
    const loadMoreBtn = document.getElementById('loadMorePostsBtn');

    if (!container) return;
    if (!viewingUserId) return;

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
        const response = await API.get(`/posts/user/${viewingUserId}?limit=${POSTS_PER_PAGE}&offset=${profilePostsOffset}`);
        const posts = response.posts || [];

        if (!loadMore) {
            container.innerHTML = '';
        }

        if (posts.length === 0 && profilePostsOffset === 0) {
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
            posts.forEach(post => {
                container.innerHTML += createProfilePostElement(post);
            });

            profilePostsOffset += posts.length;
            profilePostsLoaded = true;

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
            loadMoreBtn.textContent = 'Load More Posts';
        }
    }
}

// Create post card HTML
function createProfilePostElement(post) {
    const authorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
    const metaInfo = buildPostMetaInfo(post);
    const isOwnPost = post.user_id === currentUserId;
    const isPinned = post.is_pinned || false;

    // Determine CSS class for meta info based on author role
    let metaClass = 'profile-post-meta';
    if (post.author_role === 'coach') {
        metaClass += ' coach-meta';
    } else if (post.author_role === 'player' && post.author_transfer === 'y') {
        metaClass += ' transfer-player-meta';
    }

    // Build media HTML
    let mediaHtml = '';
    if (post.media_urls && post.media_urls.length > 0) {
        const mediaCount = post.media_urls.length;
        const isVideo = post.media_type === 'video' || (post.media_urls[0] && post.media_urls[0].toLowerCase().match(/\.(mp4|mov|avi|webm)$/));

        if (isVideo) {
            mediaHtml = `
                <div class="profile-post-media">
                    <video controls src="${post.media_urls[0]}"></video>
                </div>
            `;
        } else {
            mediaHtml = `
                <div class="profile-post-media">
                    <img src="${post.media_urls[0]}" alt="Post media">
                    ${mediaCount > 1 ? `<span class="media-count-badge"><span>1 / ${mediaCount}</span></span>` : ''}
                </div>
            `;
        }
    }

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
        <article class="profile-post-card${isPinned ? ' pinned' : ''}" data-post-id="${post.id}" onclick="navigateToPost('${post.id}')">
            <div class="profile-post-header">
                <div class="profile-post-avatar">
                    ${post.author_image
                        ? `<img src="${post.author_image}" alt="${authorName}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>`
                    }
                </div>
                <div class="profile-post-info">
                    <div class="profile-post-author">${authorName}</div>
                    <div class="${metaClass}">${metaInfo}</div>
                </div>
                <div class="profile-post-header-actions">
                    ${optionsButton}
                    <div class="profile-post-view-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="profile-post-content">
                <p>${formatPostContent(post.content)}</p>
                ${mediaHtml}
            </div>
            <div class="profile-post-stats">
                <span>${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span>${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span>${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
        </article>
    `;
}

// Load profile replies
async function loadProfileReplies(loadMore = false) {
    const container = document.getElementById('profileRepliesContainer');
    const loadMoreContainer = document.getElementById('loadMoreRepliesContainer');
    const loadMoreBtn = document.getElementById('loadMoreRepliesBtn');

    if (!container) return;
    if (!viewingUserId) return;

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
        const response = await API.get(`/posts/user/${viewingUserId}/replies?limit=${REPLIES_PER_PAGE}&offset=${profileRepliesOffset}`);
        const replies = response.replies || [];

        if (!loadMore) {
            container.innerHTML = '';
        }

        if (replies.length === 0 && profileRepliesOffset === 0) {
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
            replies.forEach(reply => {
                container.innerHTML += createProfileReplyElement(reply);
            });

            profileRepliesOffset += replies.length;
            profileRepliesLoaded = true;

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
            loadMoreBtn.textContent = 'Load More Replies';
        }
    }
}

// Create reply card HTML
function createProfileReplyElement(reply) {
    const authorName = `${reply.author_first_name || ''} ${reply.author_last_name || ''}`.trim() || 'Unknown User';
    const originalAuthorName = `${reply.original_author_first_name || ''} ${reply.original_author_last_name || ''}`.trim() || 'Unknown User';
    const timeAgo = formatTimeAgo(reply.reply_created_at || reply.created_at);
    const isOwnReply = reply.user_id === currentUserId;

    // Build meta info using the same pattern as posts
    // Create a temporary post-like object to use buildPostMetaInfo
    const replyAsPost = {
        ...reply,
        created_at: reply.reply_created_at || reply.created_at
    };
    const metaInfo = buildPostMetaInfo(replyAsPost);

    // Determine CSS class for meta info based on author role
    let metaClass = 'profile-reply-time';
    if (reply.author_role === 'coach') {
        metaClass += ' coach-meta';
    } else if (reply.author_role === 'player' && reply.author_transfer === 'y') {
        metaClass += ' transfer-player-meta';
    }

    let originalContentPreview = reply.original_post_content || '';
    if (originalContentPreview.length > 50) {
        originalContentPreview = originalContentPreview.substring(0, 50) + '...';
    }

    // Escape content for data attribute
    const escapedContent = escapeHtml(reply.content || '');

    return `
        <article class="profile-reply-card" data-comment-id="${reply.id}" data-post-id="${reply.original_post_id}" data-content="${escapedContent}">
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
                    <div class="profile-reply-avatar">
                        ${reply.author_image
                            ? `<img src="${reply.author_image}" alt="${authorName}">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                              </svg>`
                        }
                    </div>
                    <div class="profile-reply-info">
                        <div class="profile-reply-author">${authorName}</div>
                        <div class="${metaClass}">${metaInfo}</div>
                    </div>
                    <div class="profile-reply-actions">
                        ${isOwnReply ? `
                            <button class="reply-menu-btn" onclick="event.stopPropagation(); showReplyMenu('${reply.id}', '${reply.original_post_id}', event)">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <circle cx="12" cy="12" r="1"></circle>
                                    <circle cx="19" cy="12" r="1"></circle>
                                    <circle cx="5" cy="12" r="1"></circle>
                                </svg>
                            </button>
                        ` : ''}
                        <div class="profile-reply-view-icon" onclick="navigateToPost('${reply.original_post_id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                        </div>
                    </div>
                </div>
                <div class="profile-reply-text" onclick="navigateToPost('${reply.original_post_id}')">
                    <p>${formatPostContent(reply.content)}</p>
                </div>
                <div class="profile-reply-stats">
                    <span>${reply.likes_count || 0} ${reply.likes_count === 1 ? 'like' : 'likes'}</span>
                </div>
            </div>
        </article>
    `;
}

// Load profile liked posts
async function loadProfileLikes(loadMore = false) {
    const container = document.getElementById('profileLikesContainer');
    const loadMoreContainer = document.getElementById('loadMoreLikesContainer');
    const loadMoreBtn = document.getElementById('loadMoreLikesBtn');

    if (!container) return;
    if (!viewingUserId) return;

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
        const response = await API.get(`/posts/user/${viewingUserId}/likes?limit=${LIKES_PER_PAGE}&offset=${profileLikesOffset}`);
        const posts = response.posts || [];

        if (!loadMore) {
            container.innerHTML = '';
        }

        if (posts.length === 0 && profileLikesOffset === 0) {
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
            posts.forEach(post => {
                container.innerHTML += createProfileLikedPostElement(post);
            });

            profileLikesOffset += posts.length;
            profileLikesLoaded = true;

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
            loadMoreBtn.textContent = 'Load More';
        }
    }
}

// Create liked post card HTML
function createProfileLikedPostElement(post) {
    const authorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
    const metaInfo = buildPostMetaInfo(post);

    // Determine CSS class for meta info based on author role
    let metaClass = 'profile-post-meta';
    if (post.author_role === 'coach') {
        metaClass += ' coach-meta';
    } else if (post.author_role === 'player' && post.author_transfer === 'y') {
        metaClass += ' transfer-player-meta';
    }

    // Build media HTML
    let mediaHtml = '';
    if (post.media_urls && post.media_urls.length > 0) {
        const mediaCount = post.media_urls.length;
        const isVideo = post.media_type === 'video' || (post.media_urls[0] && post.media_urls[0].toLowerCase().match(/\.(mp4|mov|avi|webm)$/));

        if (isVideo) {
            mediaHtml = `
                <div class="profile-post-media">
                    <video controls src="${post.media_urls[0]}"></video>
                </div>
            `;
        } else {
            mediaHtml = `
                <div class="profile-post-media">
                    <img src="${post.media_urls[0]}" alt="Post media">
                    ${mediaCount > 1 ? `<span class="media-count-badge"><span>1 / ${mediaCount}</span></span>` : ''}
                </div>
            `;
        }
    }

    return `
        <article class="profile-post-card" data-post-id="${post.id}" onclick="navigateToPost('${post.id}')">
            <div class="profile-post-header">
                <div class="profile-post-avatar">
                    ${post.author_image
                        ? `<img src="${post.author_image}" alt="${authorName}">`
                        : `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>`
                    }
                </div>
                <div class="profile-post-info">
                    <div class="profile-post-author">${authorName}</div>
                    <div class="${metaClass}">${metaInfo}</div>
                </div>
                <div class="profile-post-header-actions">
                    <div class="profile-post-view-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="profile-post-content">
                <p>${formatPostContent(post.content)}</p>
                ${mediaHtml}
            </div>
            <div class="profile-post-stats">
                <span>${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span>${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span>${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
        </article>
    `;
}

// ============ POST MENU FUNCTIONS ============

// Show post options dropdown menu
function showProfilePostMenu(postId, isPinned, event) {
    event.stopPropagation();

    // Remove existing menu
    const existing = document.querySelector('.profile-post-dropdown-menu');
    if (existing) existing.remove();

    const menu = document.createElement('div');
    menu.className = 'profile-post-dropdown-menu';
    menu.innerHTML = `
        <div class="dropdown-item" onclick="event.stopPropagation(); editProfilePost('${postId}')">
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
    const btn = event.target.closest('.profile-post-more-btn');
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
let editMediaFile = null;
async function editProfilePost(postId) {
    // Close dropdown menu
    document.querySelector('.profile-post-dropdown-menu')?.remove();

    // Get current post content and media
    const postCard = document.querySelector(`[data-post-id="${postId}"]`);
    const currentContent = postCard?.querySelector('.profile-post-content p')?.innerText || '';

    // Get current media
    const mediaElement = postCard?.querySelector('.profile-post-media img, .profile-post-media video');
    const currentMediaUrl = mediaElement?.src || '';
    const currentMediaType = mediaElement?.tagName?.toLowerCase() === 'video' ? 'video' : 'image';

    // Create edit modal
    const modal = document.createElement('div');
    modal.className = 'profile-post-modal-overlay';
    modal.id = 'edit-profile-post-modal';
    modal.innerHTML = `
        <div class="profile-post-modal edit-modal">
            <div class="profile-post-modal-header">
                <h3>Edit Post</h3>
                <button class="profile-post-modal-close" onclick="closeProfilePostModal('edit-profile-post-modal')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="profile-post-modal-body">
                <textarea class="edit-post-textarea" id="edit-profile-post-content" placeholder="What's on your mind?">${escapeHtml(currentContent)}</textarea>

                <div class="edit-post-media-section">
                    <div class="edit-post-media-preview" id="edit-media-preview" style="${currentMediaUrl ? '' : 'display: none;'}">
                        ${currentMediaUrl ? (currentMediaType === 'video'
                            ? `<video src="${currentMediaUrl}" controls></video>`
                            : `<img src="${currentMediaUrl}" alt="Post media">`)
                        : ''}
                        <button class="remove-media-btn" onclick="removeEditMedia()">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="edit-post-media-actions">
                        <label class="add-media-btn">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21 15 16 10 5 21"></polyline>
                            </svg>
                            <span>${currentMediaUrl ? 'Change Media' : 'Add Media'}</span>
                            <input type="file" id="edit-media-input" accept="image/*,video/*" style="display: none;" onchange="handleEditMediaSelect(event)">
                        </label>
                    </div>
                </div>

                <div class="edit-modal-actions">
                    <button class="edit-modal-btn edit-modal-btn-cancel" onclick="closeProfilePostModal('edit-profile-post-modal')">Cancel</button>
                    <button class="edit-modal-btn edit-modal-btn-save" id="save-edit-btn" onclick="saveProfilePostEdit('${postId}')">Save Changes</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Store original media URL for comparison
    modal.dataset.originalMediaUrl = currentMediaUrl;
    modal.dataset.newMediaFile = '';

    // Focus on textarea
    setTimeout(() => {
        const textarea = document.getElementById('edit-profile-post-content');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }, 100);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeProfilePostModal('edit-profile-post-modal');
        }
    });
}

// Handle media selection in edit modal
function handleEditMediaSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    editMediaFile = file;
    const previewContainer = document.getElementById('edit-media-preview');
    const isVideo = file.type.startsWith('video/');
    const url = URL.createObjectURL(file);

    previewContainer.innerHTML = `
        ${isVideo
            ? `<video src="${url}" controls></video>`
            : `<img src="${url}" alt="New media">`
        }
        <button class="remove-media-btn" onclick="removeEditMedia()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;
    previewContainer.style.display = 'block';

    // Update button text
    const addMediaSpan = document.querySelector('.add-media-btn span');
    if (addMediaSpan) addMediaSpan.textContent = 'Change Media';
}

// Remove media in edit modal
function removeEditMedia() {
    editMediaFile = null;
    const previewContainer = document.getElementById('edit-media-preview');
    previewContainer.innerHTML = '';
    previewContainer.style.display = 'none';

    // Reset file input
    const input = document.getElementById('edit-media-input');
    if (input) input.value = '';

    // Update button text
    const addMediaSpan = document.querySelector('.add-media-btn span');
    if (addMediaSpan) addMediaSpan.textContent = 'Add Media';

    // Mark media as removed
    const modal = document.getElementById('edit-profile-post-modal');
    if (modal) modal.dataset.mediaRemoved = 'true';
}

// Save post edit
async function saveProfilePostEdit(postId) {
    const content = document.getElementById('edit-profile-post-content')?.value.trim();
    if (!content) {
        showToast('Post content cannot be empty');
        return;
    }

    const saveBtn = document.getElementById('save-edit-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const modal = document.getElementById('edit-profile-post-modal');
        const mediaRemoved = modal?.dataset.mediaRemoved === 'true';

        // Prepare update data
        const updateData = { content };

        // Handle media changes
        if (editMediaFile) {
            // Upload new media
            const formData = new FormData();
            formData.append('media', editMediaFile);

            const uploadResponse = await fetch('/api/posts/upload-media', {
                method: 'POST',
                credentials: 'include',
                body: formData
            });

            if (uploadResponse.ok) {
                const uploadResult = await uploadResponse.json();
                updateData.media_urls = [uploadResult.url];
                updateData.media_type = editMediaFile.type.startsWith('video/') ? 'video' : 'image';
            }
        } else if (mediaRemoved) {
            // Media was removed
            updateData.media_urls = [];
            updateData.media_type = null;
        }

        await API.put(`/posts/${postId}`, updateData);

        // Update the post content in the DOM
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        const contentEl = postCard?.querySelector('.profile-post-content p');
        if (contentEl) {
            contentEl.innerHTML = formatPostContent(content);
        }

        // Update media if changed
        const mediaContainer = postCard?.querySelector('.profile-post-media');
        if (editMediaFile && updateData.media_urls?.length > 0) {
            const isVideo = editMediaFile.type.startsWith('video/');
            if (mediaContainer) {
                mediaContainer.innerHTML = isVideo
                    ? `<video controls src="${updateData.media_urls[0]}"></video>`
                    : `<img src="${updateData.media_urls[0]}" alt="Post media">`;
            } else {
                // Add new media container
                const contentDiv = postCard?.querySelector('.profile-post-content');
                if (contentDiv) {
                    const newMediaDiv = document.createElement('div');
                    newMediaDiv.className = 'profile-post-media';
                    newMediaDiv.innerHTML = isVideo
                        ? `<video controls src="${updateData.media_urls[0]}"></video>`
                        : `<img src="${updateData.media_urls[0]}" alt="Post media">`;
                    contentDiv.appendChild(newMediaDiv);
                }
            }
        } else if (mediaRemoved && mediaContainer) {
            mediaContainer.remove();
        }

        closeProfilePostModal('edit-profile-post-modal');
        showToast('Post updated!');
        editMediaFile = null;
    } catch (error) {
        console.error('Error updating post:', error);
        showToast('Failed to update post');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// Pin post
async function pinProfilePost(postId) {
    document.querySelector('.profile-post-dropdown-menu')?.remove();

    try {
        await API.post(`/posts/${postId}/pin`);
        showToast('Post pinned to your profile!');

        // Reload posts to show pinned at top
        profilePostsOffset = 0;
        await loadProfilePosts(false);
    } catch (error) {
        console.error('Error pinning post:', error);
        showToast('Failed to pin post');
    }
}

// Unpin post
async function unpinProfilePost(postId) {
    document.querySelector('.profile-post-dropdown-menu')?.remove();

    try {
        await API.delete(`/posts/${postId}/pin`);
        showToast('Post unpinned');

        // Reload posts
        profilePostsOffset = 0;
        await loadProfilePosts(false);
    } catch (error) {
        console.error('Error unpinning post:', error);
        showToast('Failed to unpin post');
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

        // Remove post from DOM
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        // Also remove pinned badge if exists (it's a sibling before the article)
        const pinnedBadge = postCard?.previousElementSibling;
        if (pinnedBadge?.classList.contains('profile-post-pinned-badge')) {
            pinnedBadge.remove();
        }
        postCard?.remove();

        closeProfilePostModal('delete-profile-post-modal');
        showToast('Post deleted');

        // Check if posts container is now empty
        const container = document.getElementById('profilePostsContainer');
        if (container && !container.querySelector('.profile-post-card')) {
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
        showToast('Failed to delete post');
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

// Escape HTML utility
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML.replace(/"/g, '&quot;');
}

// ============ REPLY MENU FUNCTIONS ============

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
                <textarea id="editReplyContent" placeholder="Edit your reply...">${currentContent}</textarea>
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
        showToast('Reply cannot be empty');
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
        showToast('Reply updated!');
    } catch (error) {
        console.error('Error updating reply:', error);
        showToast('Failed to update reply');
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
        showToast('Reply deleted');

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
        showToast('Failed to delete reply');
        if (deleteBtn) {
            deleteBtn.disabled = false;
            deleteBtn.textContent = 'Delete';
        }
    }
}
