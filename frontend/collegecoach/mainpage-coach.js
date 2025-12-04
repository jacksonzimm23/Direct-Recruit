// Coach Dashboard JavaScript - College Coach Version

document.addEventListener('DOMContentLoaded', async function() {
    // IMMEDIATELY populate sidebar footer from cache (before any async calls)
    // This prevents the flash of empty content when navigating between pages
    populateSidebarFooterFromCache();

    // Verify user is on the correct coach page, redirect if needed
    await verifyCoachType();

    // Update sidebar footer with coach info (will fetch fresh data from API)
    await updateSidebarFooter();

    // Show/hide recruiting-specific nav items for college coaches only
    await setupCollegeCoachNav();

    // Sidebar Toggle Functionality
    const sidebarToggle = document.getElementById('sidebarToggle');
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');
    const dashboardContainer = document.getElementById('dashboardContainer');

    // Check if sidebar states are saved in localStorage
    const sidebarHidden = localStorage.getItem('coachSidebarHidden') === 'true';
    const rightSidebarHidden = localStorage.getItem('coachRightSidebarHidden') === 'true';

    if (sidebarHidden) {
        dashboardContainer.classList.add('sidebar-hidden');
    }

    if (rightSidebarHidden) {
        dashboardContainer.classList.add('right-sidebar-hidden');
    }

    // Left sidebar toggle
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            const isHidden = dashboardContainer.classList.toggle('sidebar-hidden');
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

    // Post action buttons
    const postActionBtns = document.querySelectorAll('.post-action-btn');
    postActionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            console.log('Post action clicked');

            // Check if button has a span with count
            const countSpan = this.querySelector('span');
            if (countSpan) {
                alert('Post interaction functionality will be connected to your backend.');
            }
        });
    });

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

    // Post options buttons
    const postOptionBtns = document.querySelectorAll('.post-option-btn');
    postOptionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const title = this.getAttribute('title');
            console.log('Post option clicked:', title);
            alert(`${title} functionality will be connected to your backend.`);
        });
    });


    // Trending items
    const trendingItems = document.querySelectorAll('.trending-item');
    trendingItems.forEach(item => {
        item.addEventListener('click', function() {
            const topic = this.querySelector('.trending-topic').textContent;
            console.log('Viewing topic:', topic);
            alert(`Viewing posts for ${topic}...`);
        });
    });

    // Post more button
    const postMoreBtns = document.querySelectorAll('.post-more-btn');
    postMoreBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            console.log('Post options clicked');
            alert('Post options menu (edit, delete, report) will be implemented.');
        });
    });

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
                        const isInTabsFolder = window.location.pathname.includes('/tabs/');
                        window.location.href = isInTabsFolder ? 'my-profile.html' : 'tabs/my-profile.html';
                    } else if (action === 'settings') {
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
    document.getElementById('logoutConfirm').addEventListener('click', () => {
        // Clear authentication
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        // Redirect to landing page
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

// Verify user is on the correct coach page (College coach page)
// HS coaches should be redirected to hscoach folder
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

            // If user is NOT a college coach (HS coach), redirect to hscoach folder
            const isCollegeCoach = collegeDivision && collegeDivisions.includes(collegeDivision);

            if (!isCollegeCoach) {
                console.log('HS coach detected on college page, redirecting...');
                window.location.href = '../hscoach/mainpage-coach.html';
                return;
            }
        }
    } catch (error) {
        console.error('Error verifying coach type:', error);
    }
}

// Show/hide recruiting-specific nav items for college coaches only
async function setupCollegeCoachNav() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            // Check for college_division - high school coaches have 'High School'
            // College coaches have divisions like FBS, FCS, D2, D3, NAIA, JUCO
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

// Helper function to populate sidebar footer from profile data
function populateSidebarFooter(profile) {
    if (!profile) return;

    // Update name (first row)
    const userName = document.querySelector('.sidebar-footer .user-name');
    if (userName) {
        userName.textContent = `${profile.first_name} ${profile.last_name}`;
    }

    // Update school and division (second row) - for college coaches show college_name • division
    const userRole = document.querySelector('.sidebar-footer .user-role');
    if (userRole) {
        const parts = [];
        if (profile.college_name) parts.push(profile.college_name);
        if (profile.college_division) parts.push(profile.college_division);
        userRole.textContent = parts.join(' • ') || 'College Coach';
    }

    // Update avatar if available
    if (profile.profile_image_url) {
        const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
        if (avatarElement) {
            avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
        }
    }
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
