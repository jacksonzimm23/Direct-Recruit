// Dashboard Main Page JavaScript - Other Users Version

async function verifyUserType() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('username')) return;

        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const correctFolder = getProfileFolder({
                role: response.user.role,
                is_transfer_player: response.user.is_transfer_player,
                ...response.profile
            });
            if (correctFolder !== 'other') {
                const pageName = response.user.role === 'coach' ? 'mainpage-coach.html' : 'mainpage-player.html';
                window.location.href = `../${correctFolder}/${pageName}`;
                return;
            }
        }
    } catch (error) {
        console.error('Error verifying user type:', error);
    }
}

document.addEventListener('DOMContentLoaded', async function() {

    // Verify user belongs in the 'other' folder
    await verifyUserType();

    // Update sidebar footer with user info
    await updateSidebarFooter();

    // Initialize mobile sidebar functionality
    initMobileSidebar();

    // Load mobile profile views count
    loadMobileProfileViewsCount();

    // Initialize mobile post modal
    initMobilePostModal();


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
                    // Search handled by shared search component
                }
            }
        });
    }

    // Post options buttons (excluding media button which is handled by feed.js)
    const postOptionBtns = document.querySelectorAll('.post-option-btn:not(#addMediaBtn)');
    postOptionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const title = this.getAttribute('title');
            // Stats button placeholder - to be implemented
            if (title === 'Add Stats') {
                // Future implementation for stats
            }
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
            // TODO: Navigate to user's profile
        });
    });

    // Widget show more buttons
    const showMoreBtns = document.querySelectorAll('.widget-show-more');
    showMoreBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // TODO: Implement show more functionality
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
                // This is where you'd load more posts from your backend
            }
        });
    }

});

// Logout modal function - Global so it can be called from mobile sidebar
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
    if (window.ModalUtils) ModalUtils.lockBodyScroll();

    const closeModal = () => {
        modal.remove();
        if (window.ModalUtils) ModalUtils.unlockBodyScroll();
        document.removeEventListener('keydown', escHandler);
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

    // Close on escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Update sidebar footer with current user info
// Update sidebar footer with current user info (uses getProfileFolder for correct format)
async function updateSidebarFooter() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            const user = response.user;
            const userFolder = window.getProfileFolder
                ? getProfileFolder({ role: user.role, is_transfer_player: user.is_transfer_player, transfer: profile.transfer, college_division: profile.college_division })
                : 'other';

            // Update name
            const userName = document.querySelector('.sidebar-footer .user-name');
            if (userName) {
                userName.textContent = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Other User';
            }

            // Update role/info subtitle based on logged-in user's actual profile type
            const userRoleElement = document.querySelector('.sidebar-footer .user-role');
            if (userRoleElement) {
                const parts = [];
                let color = '#1282a2';

                if (userFolder === 'transferplayer') {
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
                    if (profile.eligibility) {
                        const yearText = profile.eligibility === 1 ? 'year' : 'years';
                        parts.push(`YOE: ${profile.eligibility} ${yearText}`);
                    }
                    userRoleElement.textContent = parts.join(' • ') || 'Transfer Player';
                    color = '#b91c1c';
                } else if (userFolder === 'hsplayer') {
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
                    userRoleElement.textContent = parts.join(' • ') || 'Player';
                } else if (userFolder === 'collegeplayer') {
                    if (profile.position) parts.push(profile.position);
                    if (profile.team_name) parts.push(profile.team_name);
                    if (profile.college_division) parts.push(formatDivisionDisplay(profile.college_division));
                    userRoleElement.textContent = parts.join(' • ') || 'Player';
                } else if (userFolder === 'hscoach') {
                    if (profile.team_name) parts.push(profile.team_name);
                    if (profile.state) parts.push(profile.state);
                    userRoleElement.textContent = parts.join(', ') || 'HS Coach';
                    color = '#ff6b35';
                } else if (userFolder === 'collegecoach') {
                    if (profile.team_name && profile.state) {
                        parts.push(`${profile.team_name}, ${profile.state}`);
                    } else if (profile.team_name) {
                        parts.push(profile.team_name);
                    } else if (profile.state) {
                        parts.push(profile.state);
                    }
                    if (profile.college_division) parts.push(formatDivisionDisplay(profile.college_division));
                    userRoleElement.textContent = parts.join(' • ') || 'College Coach';
                    color = '#ff6b35';
                } else if (userFolder === 'other') {
                    userRoleElement.textContent = profile.subheader || '';
                    color = '#d4a017';
                }

                userRoleElement.style.color = color;
            }

            // Update avatar and show it (was hidden initially to prevent flash)
            const avatarUrl = profile.profile_image_url || profile.profile_picture_url;
            const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
            if (avatarElement) {
                if (avatarUrl) {
                    avatarElement.innerHTML = `<img src="${avatarUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
                avatarElement.style.border = `2px solid ${getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division)}`;
                avatarElement.style.color = getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division);
                avatarElement.style.backgroundColor = getRoleAvatarBg(user.role, user.is_transfer_player, profile.college_division);
                avatarElement.style.visibility = 'visible';
            }

            // Update post creation box avatar
            const postAvatarElement = document.querySelector('.create-post-box .post-avatar-circle');
            if (postAvatarElement) {
                const postAvatarUrl = profile.profile_picture_url || profile.profile_image_url;
                if (postAvatarUrl) {
                    postAvatarElement.innerHTML = `<img src="${postAvatarUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
                postAvatarElement.style.border = `2px solid ${getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division)}`;
                postAvatarElement.style.color = getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division);
                postAvatarElement.style.backgroundColor = getRoleAvatarBg(user.role, user.is_transfer_player, profile.college_division);
            }

            // Mobile header/sidebar user info is handled by mobile-header.js
        }
    } catch (error) {
        console.error('Error updating sidebar footer:', error);
    }
}

// Initialize mobile sidebar functionality
function initMobileSidebar() {
    const mobileProfilePic = document.getElementById('mobileProfilePic');
    const mobileSidebar = document.getElementById('mobileSidebar');
    const mobileSidebarOverlay = document.getElementById('mobileSidebarOverlay');
    const mobileSidebarLogout = document.getElementById('mobileSidebarLogout');

    if (!mobileProfilePic || !mobileSidebar) return;

    // Open sidebar when clicking profile pic
    mobileProfilePic.addEventListener('click', function(e) {
        e.preventDefault();
        mobileSidebar.classList.add('active');
        mobileSidebarOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    });

    // Close sidebar
    function closeMobileSidebar() {
        mobileSidebar.classList.remove('active');
        mobileSidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Click overlay to close
    if (mobileSidebarOverlay) {
        mobileSidebarOverlay.addEventListener('click', closeMobileSidebar);
    }

    // Logout button
    if (mobileSidebarLogout) {
        mobileSidebarLogout.addEventListener('click', function() {
            closeMobileSidebar();
            showLogoutModal();
        });
    }

    // Mobile profile views link - open modal directly
    // Skip if on my-profile page (that page has its own handler)
    const isMyProfilePage = window.location.pathname.includes('my-profile.html');
    const mobileProfileViewsLink = document.getElementById('mobileProfileViewsLink');
    if (mobileProfileViewsLink && !isMyProfilePage) {
        mobileProfileViewsLink.addEventListener('click', function(e) {
            e.preventDefault();
            closeMobileSidebar();
            openMobileProfileViewersModal();
        });
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

// Initialize mobile post modal functionality
function initMobilePostModal() {
    const fab = document.getElementById('mobileFabPost');
    const modal = document.getElementById('mobilePostModal');
    const closeBtn = document.getElementById('mobilePostModalClose');
    const submitBtn = document.getElementById('mobilePostModalSubmit');
    const textarea = document.getElementById('mobilePostModalTextarea');
    const mediaBtn = document.getElementById('mobilePostModalMediaBtn');
    const mediaInput = document.getElementById('mobilePostMediaInput');
    const mediaPreview = document.getElementById('mobilePostModalMediaPreview');
    const avatarEl = document.getElementById('mobilePostModalAvatar');
    const usernameEl = document.getElementById('mobilePostModalUsername');
    const mediaCounter = document.getElementById('mobileMediaCounter');

    if (!fab || !modal) return;

    let selectedFiles = [];
    const maxMediaFiles = 4;

    // Character counter for mobile post textarea
    const mobilePostCounter = document.querySelector('.mobile-post-char-counter');
    if (textarea && mobilePostCounter) {
        textarea.addEventListener('input', () => {
            if (typeof updateCharCounter === 'function') updateCharCounter(mobilePostCounter, textarea.value.length, 300);
        });
    }

    // Update the mobile media counter display
    function updateMobileMediaCounter() {
        if (mediaCounter) {
            mediaCounter.textContent = `${selectedFiles.length}/${maxMediaFiles}`;
            if (selectedFiles.length >= maxMediaFiles) {
                mediaCounter.classList.add('at-max');
            } else {
                mediaCounter.classList.remove('at-max');
            }
        }
    }

    // Open modal when FAB is clicked
    fab.addEventListener('click', function() {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        // Small delay to ensure modal is visible before focusing (triggers keyboard)
        setTimeout(() => {
            textarea.focus();
        }, 100);
    });

    // Handle keyboard visibility - adjust modal when keyboard appears
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
            if (modal.classList.contains('active')) {
                // Adjust modal height to visible viewport (accounts for keyboard)
                const viewportHeight = window.visualViewport.height;
                modal.style.height = `${viewportHeight}px`;
                modal.style.top = `${window.visualViewport.offsetTop}px`;
            }
        });

        window.visualViewport.addEventListener('scroll', () => {
            if (modal.classList.contains('active')) {
                // Keep modal positioned correctly when viewport scrolls
                modal.style.top = `${window.visualViewport.offsetTop}px`;
            }
        });
    }

    // Close modal
    function closeModal() {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        textarea.value = '';
        textarea.blur(); // Dismiss keyboard
        selectedFiles = [];
        mediaPreview.innerHTML = '';
        updateMobileMediaCounter();
        // Reset modal height
        modal.style.height = '';
        modal.style.top = '';
    }

    closeBtn.addEventListener('click', closeModal);

    // Close on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            closeModal();
        }
    });

    // Phase 4b-II: helper factored out so iOS branch + web change handler share it
    function processMobileFile(file) {
        const maxSize = file.type.startsWith('video/') ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > maxSize) {
            const maxSizeMB = maxSize / (1024 * 1024);
            showToast(`File "${file.name}" is too large. Maximum size is ${maxSizeMB}MB.`, 'warning');
            return;
        }

        selectedFiles.push(file);
        updateMobileMediaCounter();

        const previewItem = document.createElement('div');
        previewItem.style.cssText = 'position: relative; display: inline-block; margin: 0.5rem 0.5rem 0 0;';

        if (file.type.startsWith('image/')) {
            const img = document.createElement('img');
            img.src = URL.createObjectURL(file);
            img.style.cssText = 'max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover;';
            previewItem.appendChild(img);
        } else if (file.type.startsWith('video/')) {
            const video = document.createElement('video');
            video.src = URL.createObjectURL(file);
            video.style.cssText = 'max-width: 150px; max-height: 150px; border-radius: 8px; object-fit: cover;';
            video.muted = true;
            previewItem.appendChild(video);
        }

        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.style.cssText = 'position: absolute; top: -8px; right: -8px; width: 24px; height: 24px; border-radius: 50%; background: #ff6b6b; color: white; border: none; cursor: pointer; font-size: 16px; line-height: 1;';
        removeBtn.addEventListener('click', function() {
            const index = selectedFiles.indexOf(file);
            if (index > -1) selectedFiles.splice(index, 1);
            previewItem.remove();
            updateMobileMediaCounter();
        });
        previewItem.appendChild(removeBtn);

        mediaPreview.appendChild(previewItem);
    }

    // Media button click
    mediaBtn.addEventListener('click', async function() {
        if (selectedFiles.length >= maxMediaFiles) {
            showToast(`Maximum ${maxMediaFiles} media files allowed`, 'warning');
            return;
        }

        // Phase 4b-II: iOS action-sheet with Photos / Video
        if (window.API && window.API.isIOSApp && window.API.isIOSApp()
            && window.NativeCamera && window.NativeCamera.showPostMediaSheet) {
            const remaining = maxMediaFiles - selectedFiles.length;
            await window.NativeCamera.showPostMediaSheet(async (pickedFiles) => {
                pickedFiles.slice(0, remaining).forEach(processMobileFile);
            }, remaining);
            return;
        }

        mediaInput.click();
    });

    // Handle file selection (web path)
    mediaInput.addEventListener('change', function() {
        let files = Array.from(this.files);

        const remainingSlots = maxMediaFiles - selectedFiles.length;
        if (remainingSlots === 0) {
            showToast(`Maximum ${maxMediaFiles} media files allowed`, 'warning');
            this.value = '';
            return;
        }

        if (files.length > remainingSlots) {
            showToast(`Maximum ${maxMediaFiles} media files allowed. You can only add ${remainingSlots} more.`, 'warning');
            files = files.slice(0, remainingSlots);
        }

        files.forEach(processMobileFile);

        this.value = '';
    });

    // Submit post
    submitBtn.addEventListener('click', async function() {
        const content = textarea.value.trim();

        if (!content && selectedFiles.length === 0) {
            showToast('Please enter some content or add media to your post.', 'warning');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';

        try {
            // Upload media files first if any
            let mediaUrls = [];

            if (selectedFiles.length > 0) {
                submitBtn.textContent = 'Uploading...';
                const uploadResponse = await uploadAPI.uploadPostMedia(selectedFiles);

                // Extract S3 keys from upload result
                if (uploadResponse.media && uploadResponse.media.length > 0) {
                    mediaUrls = uploadResponse.media.map(m => m.s3Key);
                } else if (uploadResponse.s3Key) {
                    // Single file fallback
                    mediaUrls = [uploadResponse.s3Key];
                }
            }

            // Create the post
            submitBtn.textContent = 'Posting...';
            const postData = {
                content: content,
                media_urls: mediaUrls
            };

            const response = await postsAPI.createPost(postData);

            if (response.post) {
                // Close modal and reset
                closeModal();

                // Refresh the feed to show new post
                if (typeof window.feedSystem !== 'undefined' && window.feedSystem) {
                    window.feedSystem.loadFeed();
                } else {
                    // Fallback: reload page
                    window.location.reload();
                }
            }
        } catch (error) {
            console.error('Error creating post:', error);
            showToast('Failed to create post. Please try again.', 'error');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Post';
        }
    });

    // Update modal avatar and username from user data
    async function updateModalUserInfo() {
        try {
            const response = await authAPI.getCurrentUser();
            if (response.user && response.profile) {
                const profile = response.profile;
                const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User';

                if (usernameEl) {
                    usernameEl.textContent = fullName;
                }

                if (avatarEl && profile.profile_picture_url) {
                    avatarEl.innerHTML = `<img src="${profile.profile_picture_url}" alt="Profile">`;
                }
            }
        } catch (error) {
            console.error('Error updating modal user info:', error);
        }
    }

    updateModalUserInfo();
}

// ==================== MOBILE PROFILE VIEWERS MODAL ====================

function ensureProfileViewersModal() {
    if (document.getElementById('mobileProfileViewersModal')) return;

    const modalHTML = `
    <div class="follow-list-modal" id="mobileProfileViewersModal">
        <div class="follow-list-modal-overlay" id="mobileProfileViewersModalOverlay"></div>
        <div class="follow-list-modal-content">
            <div class="follow-list-modal-header">
                <h2>Profile Viewers</h2>
                <button class="follow-list-modal-close" id="mobileProfileViewersModalClose">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="follow-list-modal-body" id="mobileProfileViewersModalBody">
                <div class="follow-list-loading">Loading...</div>
            </div>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const overlay = document.getElementById('mobileProfileViewersModalOverlay');
    const closeBtn = document.getElementById('mobileProfileViewersModalClose');

    if (overlay) {
        overlay.addEventListener('click', closeMobileProfileViewersModal);
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closeMobileProfileViewersModal);
    }
}

async function openMobileProfileViewersModal() {
    ensureProfileViewersModal();

    const modal = document.getElementById('mobileProfileViewersModal');
    const modalBody = document.getElementById('mobileProfileViewersModalBody');

    if (!modal || !modalBody) return;

    modalBody.innerHTML = '<div class="follow-list-loading">Loading...</div>';
    modal.classList.add('active');
    if (window.ModalUtils) ModalUtils.lockBodyScroll();

    try {
        const authResponse = await API.get('/auth/me');
        if (!authResponse.user) {
            modalBody.innerHTML = '<div class="follow-list-empty">Please log in to view this</div>';
            return;
        }
        const currentUserId = authResponse.user.id;

        const response = await API.get(`/profile/viewers/${currentUserId}`);
        const viewers = response.viewers || [];

        if (viewers.length === 0) {
            modalBody.innerHTML = '<div class="follow-list-empty">No profile views yet</div>';
            return;
        }

        modalBody.innerHTML = viewers.map(viewer => {
            const roleInfo = getMobileRoleInfo(viewer);
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
                    <div class="follow-list-name">${viewer.first_name} ${viewer.last_name}</div>
                    <div class="follow-list-role ${roleInfo.colorClass}">${roleInfo.text}</div>
                </div>
            </div>
        `}).join('');

        modalBody.querySelectorAll('.follow-list-item').forEach(item => {
            item.addEventListener('click', async () => {
                const visitorUserId = item.dataset.userId;
                const role = item.dataset.role;

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
                        closeMobileProfileViewersModal();
                        const profile = profileResponse.profile;
                        const folder = getProfileFolder({ role, ...profile });
                        const isInTabs = window.location.pathname.includes('/tabs/');
                        const basePath = isInTabs ? '../../' : '../';
                        window.location.href = `${basePath}${folder}/tabs/my-profile.html?username=${profile.username}&from=profile`;
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

function closeMobileProfileViewersModal() {
    const modal = document.getElementById('mobileProfileViewersModal');
    if (modal) {
        modal.classList.remove('active');
        if (window.ModalUtils) ModalUtils.unlockBodyScroll();
    }
}

function getMobileRoleInfo(user) {
    const role = user.role;
    let text = '';
    let colorClass = '';

    if (role === 'player') {
        const isTransfer = user.is_transfer === 'y' || user.is_transfer === true;
        const hasCollegeDivision = user.player_college_division &&
            ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'].includes(user.player_college_division);

        if (isTransfer) {
            colorClass = 'role-transfer-player';
            const parts = [];
            if (user.player_position) parts.push(user.player_position);
            const heightStr = formatHeightForMobileDisplay(user.player_height);
            if (heightStr) parts.push(heightStr);
            if (user.player_weight) parts.push(`${user.player_weight} lbs`);
            if (user.years_of_eligibility) parts.push(`${user.years_of_eligibility} YOE`);
            text = parts.join(' \u2022 ') || 'Transfer Player';
        } else if (hasCollegeDivision) {
            colorClass = 'role-college-player';
            const parts = [];
            if (user.player_position) parts.push(user.player_position);
            const schoolParts = [];
            if (user.player_team_name) schoolParts.push(user.player_team_name);
            if (user.player_state) schoolParts.push(user.player_state);
            if (schoolParts.length > 0) parts.push(schoolParts.join(', '));
            if (user.player_college_division) parts.push(formatDivisionDisplay(user.player_college_division));
            text = parts.join(' \u2022 ') || 'College Player';
        } else {
            colorClass = 'role-hs-player';
            const parts = [];
            if (user.player_position) parts.push(user.player_position);
            const heightStr = formatHeightForMobileDisplay(user.player_height);
            if (heightStr) parts.push(heightStr);
            if (user.player_weight) parts.push(`${user.player_weight} lbs`);
            if (user.graduation_year) parts.push(user.graduation_year);
            text = parts.join(' \u2022 ') || 'HS Player';
        }
    } else if (role === 'coach') {
        const hasCollegeDivision = user.coach_college_division &&
            ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'].includes(user.coach_college_division);

        if (hasCollegeDivision) {
            colorClass = 'role-college-coach';
            const parts = [];
            const teamParts = [];
            if (user.coach_team_name) teamParts.push(user.coach_team_name);
            if (user.coach_state) teamParts.push(user.coach_state);
            if (teamParts.length > 0) parts.push(teamParts.join(', '));
            if (user.coach_college_division) parts.push(formatDivisionDisplay(user.coach_college_division));
            text = parts.join(' \u2022 ') || 'College Coach';
        } else {
            colorClass = 'role-hs-coach';
            const parts = [];
            if (user.coach_team_name) parts.push(user.coach_team_name);
            if (user.coach_state) parts.push(user.coach_state);
            text = parts.join(', ') || 'HS Coach';
        }
    } else if (role === 'other') {
        colorClass = 'role-other';
        text = user.other_subheader || 'Other';
    } else {
        text = role || 'User';
    }

    return { text, colorClass };
}

function formatHeightForMobileDisplay(height) {
    if (!height) return '';
    if (typeof height === 'string' && height.includes("'")) {
        return height;
    }
    const totalInches = parseInt(height);
    if (isNaN(totalInches)) return '';
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${feet}'${inches}"`;
}

async function loadMobileProfileViewsCount() {
    const mobileViewCountElement = document.getElementById('mobileProfileViewsCount');
    const mobileProfileViewsLink = document.getElementById('mobileProfileViewsLink');

    if (!mobileViewCountElement || !mobileProfileViewsLink) return;

    try {
        const authResponse = await API.get('/auth/me');
        if (!authResponse.user) return;

        const currentUserId = authResponse.user.id;
        const response = await API.get(`/profile/views/${currentUserId}`);
        const viewCount = response.viewCount || 0;

        mobileViewCountElement.textContent = viewCount;
        mobileProfileViewsLink.style.display = 'flex';
    } catch (error) {
        console.error('Error loading mobile profile views count:', error);
        mobileViewCountElement.textContent = '0';
    }
}
