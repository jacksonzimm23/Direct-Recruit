// Coach Dashboard JavaScript - HS Coach Version

document.addEventListener('DOMContentLoaded', async function() {
    // IMMEDIATELY populate sidebar footer from cache (before any async calls)
    // This prevents the flash of empty content when navigating between pages
    populateSidebarFooterFromCache();

    // Verify user is on the correct coach page, redirect if needed
    await verifyCoachType();

    // Update sidebar footer with coach info (will fetch fresh data from API)
    await updateSidebarFooter();

    // Initialize mobile sidebar
    initMobileSidebar();

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
    const sidebarHidden = localStorage.getItem('coachSidebarHidden') === 'true';
    const rightSidebarHidden = localStorage.getItem('coachRightSidebarHidden') === 'true';

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
            localStorage.setItem('coachSidebarHidden', isHidden);
        });
    }

    // Right sidebar toggle
    if (rightSidebarToggle) {
        rightSidebarToggle.addEventListener('click', function() {
            const isHidden = dashboardContainer.classList.toggle('right-sidebar-hidden');
            localStorage.setItem('coachRightSidebarHidden', isHidden);
        });
    }

    // Post creation functionality
    const postInput = document.querySelector('.post-input');
    // Post button handler removed - now handled by feed.js
    // const postSubmitBtn = document.querySelector('.btn-post-submit');
    // Event listener moved to shared/feed.js for dynamic feed functionality

    // Post action buttons - handled by shared/feed.js for dynamic posts

    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // Remove active class from all buttons
            filterBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked button
            this.classList.add('active');

            const filterType = this.querySelector('span').textContent;
            console.log('Filter changed to:', filterType);
            alert(`Filtering by: ${filterType}`);
        });
    });

    // Search functionality
    const searchInputs = document.querySelectorAll('.search-input');
    searchInputs.forEach(searchInput => {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const query = this.value.trim();
                if (query) {
                    console.log('Searching for:', query);
                    alert('Search functionality will be connected to your backend.');
                }
            }
        });
    });

    // Post options buttons - handled by feed.js for media upload functionality

    // Trending items
    const trendingItems = document.querySelectorAll('.trending-item');
    trendingItems.forEach(item => {
        item.addEventListener('click', function() {
            const topic = this.querySelector('.trending-topic').textContent;
            console.log('Viewing topic:', topic);
            alert(`Viewing posts for ${topic}...`);
        });
    });

    // Post more button - handled by feed.js for post options menu

    // Auto-resize textarea
    if (postInput) {
        postInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = this.scrollHeight + 'px';
        });
    }

    // Tag clicks
    const tags = document.querySelectorAll('.tag');
    tags.forEach(tag => {
        tag.addEventListener('click', function() {
            const tagName = this.textContent;
            console.log('Tag clicked:', tagName);
            alert(`Viewing posts tagged with ${tagName}...`);
        });
    });

    // Recruiting stats widget items
    const statItems = document.querySelectorAll('.stat-item-widget');
    statItems.forEach(item => {
        item.addEventListener('click', function() {
            const label = this.querySelector('.stat-label-sm').textContent;
            console.log('Stat clicked:', label);
            alert(`Viewing ${label} details...`);
        });
    });

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

    // "Post Update" button in sidebar
    const btnPost = document.querySelector('.btn-post');
    if (btnPost) {
        btnPost.addEventListener('click', function() {
            // Scroll to post creation box
            const createPostBox = document.querySelector('.create-post-box');
            if (createPostBox) {
                createPostBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Focus on textarea after scroll
                setTimeout(() => {
                    if (postInput) {
                        postInput.focus();
                    }
                }, 500);
            }
        });
    }

    // User menu dropdown
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
                        // Check if we're in the tabs folder or root hscoach folder
                        const isInTabsFolder = window.location.pathname.includes('/tabs/');
                        window.location.href = isInTabsFolder ? 'my-profile.html' : 'tabs/my-profile.html';
                    } else if (action === 'settings') {
                        // Check if we're in the tabs folder or root hscoach folder
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

    console.log('Direct Recruit Coach Dashboard Loaded');
});

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
    document.getElementById('logoutConfirm').addEventListener('click', async () => {
        // Clear cached sidebar profile
        localStorage.removeItem('sidebarFooterProfile');
        // Clear authentication and redirect
        await API.auth.logout();
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Verify user is on the correct coach page (HS coach page)
// College coaches should be redirected to collegecoach folder
// Skip redirect if viewing another user's profile (has username parameter)
async function verifyCoachType() {
    try {
        // Skip verification if viewing another user's profile
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('username')) {
            return; // Don't redirect when viewing someone else's profile
        }

        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const collegeDivision = response.profile.college_division;
            const collegeDivisions = ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA'];

            // If user is a college coach, redirect to collegecoach folder
            const isCollegeCoach = collegeDivision && collegeDivisions.includes(collegeDivision);

            if (isCollegeCoach) {
                console.log('College coach detected on HS page, redirecting...');
                window.location.href = '../collegecoach/mainpage-coach.html';
                return;
            }
        }
    } catch (error) {
        console.error('Error verifying coach type:', error);
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

// Helper function to populate sidebar footer from profile data
function populateSidebarFooter(profile) {
    if (!profile) return;

    // Update name (first row)
    const userName = document.querySelector('.sidebar-footer .user-name');
    if (userName) {
        userName.textContent = `${profile.first_name} ${profile.last_name}`;
    }

    // Update school, state (second row) - HS coaches use college_name for their school name
    const userRole = document.querySelector('.sidebar-footer .user-role');
    if (userRole) {
        const parts = [];
        if (profile.team_name) parts.push(profile.team_name);
        if (profile.state) parts.push(profile.state);
        userRole.textContent = parts.join(', ') || 'HS Coach';
    }

    // Update avatar and show it (was hidden initially to prevent flash)
    const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
    if (avatarElement) {
        if (profile.profile_image_url) {
            avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
        avatarElement.style.border = `2px solid ${getRoleBorderColor('coach', false, profile.college_division)}`;
        avatarElement.style.visibility = 'visible';
    }

    // Mobile header/sidebar user info is handled by mobile-header.js
}

// Immediately populate sidebar footer from cache (called on script load, before DOMContentLoaded)
function populateSidebarFooterFromCache() {
    const cachedProfile = localStorage.getItem('sidebarFooterProfile');
    if (cachedProfile) {
        try {
            const profile = JSON.parse(cachedProfile);
            populateSidebarFooter(profile);
        } catch (e) {
            console.error('Error parsing cached profile:', e);
        }
    }
}

// Update sidebar footer with current coach info
async function updateSidebarFooter() {
    try {
        // Fetch fresh data from API
        const response = await API.get('/auth/me');
        console.log('Sidebar footer API response:', response);
        if (response.user && response.profile) {
            const profile = response.profile;
            console.log('Profile data:', profile);

            // Cache the profile data for next page load
            localStorage.setItem('sidebarFooterProfile', JSON.stringify(profile));

            // Update the sidebar footer with fresh data
            populateSidebarFooter(profile);
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
        mobileSidebarLogout.addEventListener('click', async function() {
            closeMobileSidebar();
            localStorage.removeItem('sidebarFooterProfile');
            // Clear authentication and redirect
            await API.auth.logout();
        });
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

    // Media button click
    mediaBtn.addEventListener('click', function() {
        if (selectedFiles.length >= maxMediaFiles) {
            alert(`Maximum ${maxMediaFiles} media files allowed`);
            return;
        }
        mediaInput.click();
    });

    // Handle file selection
    mediaInput.addEventListener('change', function() {
        let files = Array.from(this.files);

        // Check how many more files we can add
        const remainingSlots = maxMediaFiles - selectedFiles.length;
        if (remainingSlots === 0) {
            alert(`Maximum ${maxMediaFiles} media files allowed`);
            this.value = '';
            return;
        }

        if (files.length > remainingSlots) {
            alert(`Maximum ${maxMediaFiles} media files allowed. You can only add ${remainingSlots} more.`);
            files = files.slice(0, remainingSlots);
        }

        files.forEach(file => {
            // Check file size (200MB for videos, 10MB for images)
            const maxSize = file.type.startsWith('video/') ? 200 * 1024 * 1024 : 10 * 1024 * 1024;
            if (file.size > maxSize) {
                const maxSizeMB = maxSize / (1024 * 1024);
                alert(`File "${file.name}" is too large. Maximum size is ${maxSizeMB}MB.`);
                return;
            }

            selectedFiles.push(file);
            updateMobileMediaCounter();

            // Create preview
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

            // Remove button
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
        });

        // Clear input
        this.value = '';
    });

    // Submit post
    submitBtn.addEventListener('click', async function() {
        const content = textarea.value.trim();

        if (!content && selectedFiles.length === 0) {
            alert('Please enter some content or add media to your post.');
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
            alert('Failed to create post. Please try again.');
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

                if (avatarEl && profile.profile_image_url) {
                    avatarEl.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile">`;
                }
            }
        } catch (error) {
            console.error('Error updating modal user info:', error);
        }
    }

    updateModalUserInfo();
}
