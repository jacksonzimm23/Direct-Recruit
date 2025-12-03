// My Profile JavaScript - Dynamic Version

let currentProfile = null;
let currentUserId = null;
let viewingUserId = null;
let isOwnProfile = true;
let isCollegeCoach = false;
let currentProfileType = 'player'; // Track whether viewing a player or coach profile
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
        }
    } catch (error) {
        console.error('Failed to load current user:', error);
    }
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

    // Update sidebar user info
    const sidebarName = document.querySelector('.sidebar-footer .user-name');
    const sidebarRole = document.querySelector('.sidebar-footer .user-role');
    if (sidebarName) {
        sidebarName.textContent = `${profile.first_name} ${profile.last_name}`;
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

    // Also add to dashboard container so sidebar content shows
    const dashboardContainer = document.getElementById('dashboardContainer');
    if (dashboardContainer) {
        dashboardContainer.classList.add('profile-loaded');
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

    // Update sidebar footer: Position(s), School Name
    const sidebarRole = document.querySelector('.sidebar-footer .user-role');
    if (sidebarRole) {
        const parts = [];
        if (profile.position) parts.push(profile.position);
        if (profile.high_school) parts.push(profile.high_school);
        sidebarRole.textContent = parts.join(' • ') || 'Player';
    }

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

    // Update sidebar role
    const sidebarRole = document.querySelector('.sidebar-footer .user-role');
    if (sidebarRole) {
        sidebarRole.textContent = `Coach${profile.college_name ? ' • ' + profile.college_name : ''}`;
    }

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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Profile
            </button>
            <button class="btn-share-profile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
                // Clear URL parameters and reload
                window.location.href = 'my-profile.html';
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
