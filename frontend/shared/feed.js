// Feed System - Option 4: Two-Section Feed (Following + Discover)
// This file handles all feed-related functionality for all profile dashboards

// Global feedManager variable - declared at top to ensure it's always accessible
var feedManager;

class FeedManager {
    constructor(skipInit = false) {
        this.feedContainer = document.getElementById('feedPosts');
        this.createPostBtn = document.querySelector('.btn-post-submit');
        this.postInput = document.querySelector('textarea.post-input');
        this.currentUserId = null;
        this.currentUserData = null;
        this.currentFeedType = 'discover'; // 'following' or 'discover'
        this.followingOffset = 0;
        this.discoverOffset = 0;
        this.isLoading = false;

        // Media upload state
        this.pendingMediaFiles = [];
        this.pendingMediaPreviews = [];
        this.maxMediaFiles = 4;
        this.maxFileSize = 200 * 1024 * 1024; // 200MB for videos (~5 min at 1080p)
        this.maxImageSize = 10 * 1024 * 1024; // 10MB for images

        // New posts polling state
        this.lastFeedLoadTime = null;
        this.newPostsPollingInterval = null;
        this.newPostsCount = { discover: 0, following: 0 };
        this.pollingIntervalMs = 45000; // Check every 45 seconds

        // Skip init for single post view pages
        if (!skipInit) {
            this.init();
        }
    }

    async init() {
        await this.loadCurrentUser();
        this.setupEventListeners();
        await this.loadFeed();
        this.startNewPostsPolling();
    }

    async loadCurrentUser() {
        try {
            if (!API.isAuthenticated()) {
                window.location.href = '../landingpage/signin.html';
                return;
            }

            // Get user data from API
            const response = await API.get('/auth/me');
            this.currentUserId = response.user.id;
            this.currentUserData = {
                userId: response.user.id,
                role: response.user.role
            };

            // Update create post avatar using the already-fetched response
            if (response.profile?.profile_image_url) {
                const avatar = document.querySelector('.create-post-box .post-avatar-circle');
                if (avatar) {
                    avatar.innerHTML = `<img src="${response.profile.profile_image_url}" alt="Your avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    avatar.style.border = `2px solid ${getRoleBorderColor(response.user.role, response.user.is_transfer_player, response.profile.college_division)}`;
                }
            }
        } catch (error) {
            // If API call fails (unauthorized), redirect to signin
            window.location.href = '../landingpage/signin.html';
        }
    }

    async updateCreatePostAvatar() {
        try {
            const response = await API.get('/auth/me');
            if (response.profile?.profile_image_url) {
                const avatar = document.querySelector('.create-post-box .post-avatar-circle');
                if (avatar) {
                    avatar.innerHTML = `<img src="${response.profile.profile_image_url}" alt="Your avatar" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    avatar.style.border = `2px solid ${getRoleBorderColor(response.user.role, response.user.is_transfer_player, response.profile.college_division)}`;
                }
            }
        } catch (error) {
        }
    }

    setupEventListeners() {
        // Create post button
        if (this.createPostBtn) {
            this.createPostBtn.addEventListener('click', () => this.createPost());
        }

        // Enter to submit (Shift+Enter for new line)
        if (this.postInput) {
            this.postInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.createPost();
                }
            });

            // Auto-resize textarea
            this.postInput.addEventListener('input', () => {
                this.postInput.style.height = 'auto';
                this.postInput.style.height = this.postInput.scrollHeight + 'px';
            });
        }

        // Media upload button
        const addMediaBtn = document.getElementById('addMediaBtn');
        const mediaInput = document.getElementById('postMediaInput');

        if (addMediaBtn && mediaInput) {
            addMediaBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (this.pendingMediaFiles.length >= this.maxMediaFiles) {
                    this.showToast(`Maximum ${this.maxMediaFiles} files allowed`, 'error');
                    return;
                }
                mediaInput.click();
            });

            mediaInput.addEventListener('change', (e) => this.handleMediaSelect(e));
        }

        // Feed tab switching
        document.addEventListener('click', (e) => {
            if (e.target.closest('.feed-tab')) {
                const tab = e.target.closest('.feed-tab');
                const feedType = tab.dataset.feed;
                if (feedType && feedType !== this.currentFeedType) {
                    this.switchFeedTab(feedType);
                }
            }
        });

        // Infinite scroll
        window.addEventListener('scroll', () => {
            if (this.isLoading) return;
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                this.loadMorePosts();
            }
        });
    }

    // ==================== MEDIA UPLOAD ====================

    handleMediaSelect(event) {
        const files = Array.from(event.target.files);
        if (!files.length) return;

        // Check how many more files we can add
        const remainingSlots = this.maxMediaFiles - this.pendingMediaFiles.length;
        if (remainingSlots === 0) {
            this.showToast(`Maximum ${this.maxMediaFiles} media files allowed`, 'error');
            event.target.value = '';
            return;
        }

        if (files.length > remainingSlots) {
            this.showToast(`Maximum ${this.maxMediaFiles} media files allowed. You can only add ${remainingSlots} more.`, 'error');
            files.splice(remainingSlots);
        }

        // Validate and add each file
        for (const file of files) {
            if (!this.validateMediaFile(file)) continue;
            this.addMediaFile(file);
        }

        // Clear the input so the same file can be selected again if removed
        event.target.value = '';
    }

    validateMediaFile(file) {
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');

        if (!isVideo && !isImage) {
            this.showToast('Only images and videos are allowed', 'error');
            return false;
        }

        // Check file size
        const maxSize = isVideo ? this.maxFileSize : this.maxImageSize;
        if (file.size > maxSize) {
            const maxMB = Math.round(maxSize / (1024 * 1024));
            this.showToast(`File too large. Maximum size: ${maxMB}MB`, 'error');
            return false;
        }

        // Check for duplicates
        const isDuplicate = this.pendingMediaFiles.some(
            f => f.name === file.name && f.size === file.size
        );
        if (isDuplicate) {
            this.showToast('This file is already added', 'error');
            return false;
        }

        return true;
    }

    addMediaFile(file) {
        const isVideo = file.type.startsWith('video/');

        // Create preview URL
        const previewUrl = URL.createObjectURL(file);

        // Store file and preview
        this.pendingMediaFiles.push(file);
        this.pendingMediaPreviews.push({
            url: previewUrl,
            type: isVideo ? 'video' : 'image',
            name: file.name
        });

        this.renderMediaPreviews();
    }

    renderMediaPreviews() {
        const container = document.getElementById('mediaPreviewContainer');
        const grid = document.getElementById('mediaPreviewGrid');

        if (!container || !grid) return;

        if (this.pendingMediaPreviews.length === 0) {
            container.style.display = 'none';
            grid.innerHTML = '';
            this.updateMediaCounter();
            return;
        }

        container.style.display = 'block';
        grid.innerHTML = this.pendingMediaPreviews.map((preview, index) => `
            <div class="media-preview-item" data-index="${index}">
                ${preview.type === 'video' ? `
                    <video src="${preview.url}" muted></video>
                    <div class="media-preview-type">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                ` : `
                    <img src="${preview.url}" alt="Preview">
                `}
                <button class="media-preview-remove" onclick="feedManager.removeMediaFile(${index})" title="Remove">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');

        // Update media button state and counter
        this.updateMediaCounter();
    }

    updateMediaCounter() {
        const counter = document.getElementById('mediaCounter');
        const addMediaBtn = document.getElementById('addMediaBtn');
        const currentCount = this.pendingMediaFiles.length;

        // Update counter display
        if (counter) {
            counter.textContent = `${currentCount}/${this.maxMediaFiles}`;
            if (currentCount >= this.maxMediaFiles) {
                counter.classList.add('at-max');
            } else {
                counter.classList.remove('at-max');
            }
        }

        // Update button state
        if (addMediaBtn) {
            if (currentCount >= this.maxMediaFiles) {
                addMediaBtn.classList.add('disabled');
                addMediaBtn.title = `Maximum ${this.maxMediaFiles} files`;
            } else {
                addMediaBtn.classList.remove('disabled');
                addMediaBtn.title = 'Add Photo/Video';
            }
        }
    }

    removeMediaFile(index) {
        // Revoke the object URL to free memory
        if (this.pendingMediaPreviews[index]) {
            URL.revokeObjectURL(this.pendingMediaPreviews[index].url);
        }

        // Remove from arrays
        this.pendingMediaFiles.splice(index, 1);
        this.pendingMediaPreviews.splice(index, 1);

        this.renderMediaPreviews();
    }

    clearMediaFiles() {
        // Revoke all object URLs
        this.pendingMediaPreviews.forEach(preview => {
            URL.revokeObjectURL(preview.url);
        });

        this.pendingMediaFiles = [];
        this.pendingMediaPreviews = [];
        this.renderMediaPreviews();
    }

    async loadFeed() {
        this.showLoading();

        try {
            // Load feeds - reposts/quotes are now included in getFollowingFeed
            const [followingResponse, discoverResponse] = await Promise.all([
                postsAPI.getFollowingFeed(20, 0),
                postsAPI.getDiscoverFeed(10, 0)
            ]);

            // Record when feed was loaded for new posts polling
            this.lastFeedLoadTime = new Date().toISOString();
            this.newPostsCount = { discover: 0, following: 0 };

            this.hideLoading();
            this.renderTwoSectionFeed(
                followingResponse.posts || [],
                discoverResponse.posts || []
            );

        } catch (error) {
            this.hideLoading();
            this.showError('Failed to load feed. Please refresh the page.');
        }
    }

    renderTwoSectionFeed(followingPosts, discoverPosts) {
        this.feedContainer.innerHTML = '';

        // Feed tabs
        const tabsHtml = `
            <div class="feed-tabs">
                <button class="feed-tab ${this.currentFeedType === 'discover' ? 'active' : ''}" data-feed="discover">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    Discover
                </button>
                <button class="feed-tab ${this.currentFeedType === 'following' ? 'active' : ''}" data-feed="following">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    Your Network
                </button>
            </div>
        `;
        this.feedContainer.innerHTML = tabsHtml;

        // Create sections container
        const sectionsContainer = document.createElement('div');
        sectionsContainer.className = 'feed-sections';
        this.feedContainer.appendChild(sectionsContainer);

        // Following section
        const followingSection = document.createElement('div');
        followingSection.className = `feed-section ${this.currentFeedType === 'following' ? 'active' : ''}`;
        followingSection.id = 'following-section';

        if (followingPosts.length > 0) {
            followingPosts.forEach(post => {
                if (post.is_quote) {
                    // Quote post from someone you follow
                    const postEl = this.createFeedQuotePostElement(post);
                    followingSection.appendChild(postEl);
                } else if (post.is_repost) {
                    // Repost from someone you follow
                    const postEl = this.createFeedRepostElement(post);
                    followingSection.appendChild(postEl);
                } else {
                    // Regular post
                    followingSection.appendChild(this.createPostElement(post));
                }
            });
        } else {
            followingSection.innerHTML = `
                <div class="empty-section">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                    <h3>No posts from your network</h3>
                    <p>Follow coaches and players to see their updates here!</p>
                </div>
            `;
        }
        sectionsContainer.appendChild(followingSection);

        // Discover section
        const discoverSection = document.createElement('div');
        discoverSection.className = `feed-section ${this.currentFeedType === 'discover' ? 'active' : ''}`;
        discoverSection.id = 'discover-section';

        if (discoverPosts.length > 0) {
            discoverPosts.forEach(post => {
                if (post.is_quote) {
                    // Quote post from someone in discover
                    const postEl = this.createFeedQuotePostElement(post);
                    discoverSection.appendChild(postEl);
                } else if (post.is_repost) {
                    // Repost from someone in discover
                    const postEl = this.createFeedRepostElement(post);
                    discoverSection.appendChild(postEl);
                } else {
                    // Regular post
                    discoverSection.appendChild(this.createPostElement(post));
                }
            });
        } else {
            discoverSection.innerHTML = `
                <div class="empty-section">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    <h3>No posts to discover</h3>
                    <p>Check back later for new content!</p>
                </div>
            `;
        }
        sectionsContainer.appendChild(discoverSection);
    }

    switchFeedTab(feedType) {
        this.currentFeedType = feedType;

        // Update tabs
        document.querySelectorAll('.feed-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.feed === feedType);
        });

        // Update sections
        document.querySelectorAll('.feed-section').forEach(section => {
            section.classList.toggle('active', section.id === `${feedType}-section`);
        });

        // Hide "new posts" button for the current tab when switching (it will show count for that tab)
        this.updateNewPostsButton();
    }

    // ==================== NEW POSTS POLLING ====================

    startNewPostsPolling() {
        // Clear any existing interval
        if (this.newPostsPollingInterval) {
            clearInterval(this.newPostsPollingInterval);
        }

        // Start polling for new posts
        this.newPostsPollingInterval = setInterval(() => {
            this.checkForNewPosts();
        }, this.pollingIntervalMs);

        // Also check when tab becomes visible again
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.lastFeedLoadTime) {
                this.checkForNewPosts();
            }
        });
    }

    stopNewPostsPolling() {
        if (this.newPostsPollingInterval) {
            clearInterval(this.newPostsPollingInterval);
            this.newPostsPollingInterval = null;
        }
    }

    async checkForNewPosts() {
        if (!this.lastFeedLoadTime) return;

        try {
            // Check for new posts in the current feed type
            const response = await API.get(`/posts/feed/new-posts-count?since=${encodeURIComponent(this.lastFeedLoadTime)}&feedType=${this.currentFeedType}`);

            if (response.newPostsCount > 0) {
                this.newPostsCount[this.currentFeedType] = response.newPostsCount;
                this.showNewPostsButton(response.newPostsCount);
            }
        } catch (error) {
        }
    }

    showNewPostsButton(count) {
        // Remove existing button if any
        const existingBtn = document.querySelector('.new-posts-button');
        if (existingBtn) {
            existingBtn.remove();
        }

        // Create the "New posts available" button
        const button = document.createElement('button');
        button.className = 'new-posts-button';
        button.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
            ${count} new post${count !== 1 ? 's' : ''} available
        `;
        button.addEventListener('click', () => this.refreshFeed());

        // Insert after the feed tabs
        const feedTabs = document.querySelector('.feed-tabs');
        if (feedTabs) {
            feedTabs.insertAdjacentElement('afterend', button);
        }
    }

    hideNewPostsButton() {
        const existingBtn = document.querySelector('.new-posts-button');
        if (existingBtn) {
            existingBtn.remove();
        }
    }

    updateNewPostsButton() {
        // Show button if there are new posts for the current tab
        const count = this.newPostsCount[this.currentFeedType];
        if (count > 0) {
            this.showNewPostsButton(count);
        } else {
            this.hideNewPostsButton();
        }
    }

    async refreshFeed() {
        // Hide the button immediately
        this.hideNewPostsButton();

        // Reset offsets
        this.followingOffset = 0;
        this.discoverOffset = 0;

        // Scroll to top smoothly
        window.scrollTo({ top: 0, behavior: 'smooth' });

        // Reload the feed
        await this.loadFeed();
    }

    createPostElement(post, showRepostIndicator = false) {

        const article = document.createElement('article');
        article.className = 'post-card';
        // For reposts, use original_post_id for actions, but keep share id for data attribute
        const postId = post.original_post_id || post.id;
        article.dataset.postId = postId;
        article.dataset.userReposted = post.user_reposted ? 'true' : 'false';
        if (showRepostIndicator && post.id !== postId) {
            // Store share ID for unrepost functionality
            article.dataset.shareId = post.id;
        }

        const timeAgo = this.getTimeAgo(post.original_created_at || post.created_at);
        const isLiked = post.user_liked || false;
        const isSaved = post.user_saved || false;
        const isReposted = post.user_reposted || false;
        const isOwnPost = post.user_id === this.currentUserId;
        const authorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';

        // Repost indicator HTML
        const repostIndicator = showRepostIndicator ? `
            <div class="repost-indicator">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                <span>You reposted</span>
            </div>
        ` : '';

        // Build meta info based on role and profile type
        let metaInfo = '';
        let starsHtml = '';

        // Add star rating prefix for HS players and transfer players with verified stars
        if (post.author_role === 'player' && post.author_star_rating && post.author_star_rating >= 1 && post.author_star_rating <= 5) {
            // Only show stars for HS players (no division) and transfer players
            const isHSPlayer = !post.author_division && post.author_transfer !== 'y';
            const isTransferPlayer = post.author_transfer === 'y';
            if (isHSPlayer || isTransferPlayer) {
                starsHtml = `<span class="post-meta-stars" style="color: #ffd700; font-weight: 600;">${post.author_star_rating}â˜…</span> `;
            }
        }

        if (post.author_role === 'player') {
            const parts = [];

            // Check if transfer player (transfer = 'y')
            if (post.author_transfer === 'y') {
                // Transfer Player: Position â€¢ Height â€¢ Weight â€¢ YOE
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
                // College Player: Position â€¢ College â€¢ Division
                if (post.author_position) parts.push(post.author_position);
                if (post.author_school) parts.push(post.author_school);
                // Format FBS/FCS as D1 FBS/D1 FCS
                const div = post.author_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
            } else {
                // HS Player: Position â€¢ High School â€¢ Year
                if (post.author_position) parts.push(post.author_position);
                if (post.author_school) parts.push(post.author_school);
                if (post.author_grad_year) {
                    parts.push(post.author_grad_year);
                }
            }

            parts.push(timeAgo);
            metaInfo = starsHtml + parts.join(' â€¢ ');
        } else if (post.author_role === 'other') {
            // Other profile: entire meta info in yellow
            if (post.author_subheader) {
                metaInfo = `<span style="color: #d4a017;">${post.author_subheader} â€¢ ${timeAgo}</span>`;
            } else {
                metaInfo = `<span style="color: #d4a017;">${timeAgo}</span>`;
            }
        } else {
            // Coach
            const parts = [];

            // Check if college coach (has division) or HS coach (no division)
            if (post.author_division) {
                // College Coach: College, State â€¢ Division
                if (post.author_school && post.author_state) {
                    parts.push(`${post.author_school}, ${post.author_state}`);
                } else if (post.author_school) {
                    parts.push(post.author_school);
                } else if (post.author_state) {
                    parts.push(post.author_state);
                }
                // Format FBS/FCS as D1 FBS/D1 FCS
                const div = post.author_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
                parts.push(timeAgo);
                metaInfo = parts.join(' â€¢ ');
            } else {
                // HS Coach: School, State (comma-separated like sidebar)
                if (post.author_school) parts.push(post.author_school);
                if (post.author_state) parts.push(post.author_state);
                // Use comma separator for HS Coach to match sidebar, then add timeAgo with bullet
                const schoolState = parts.join(', ');
                metaInfo = schoolState ? `${schoolState} â€¢ ${timeAgo}` : timeAgo;
            }
        }

        // Build media HTML using fixed-size grid layout
        let mediaHtml = '';
        if (post.media_urls && post.media_urls.length > 0) {
            // Limit to max 4 media items
            const mediaUrls = post.media_urls.slice(0, 4);
            const mediaCount = mediaUrls.length;
            const mediaUrlsJson = JSON.stringify(post.media_urls).replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const mediaTypesJson = JSON.stringify(post.media_types || []).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            // Helper to check if a URL is a video
            const isVideoUrl = (url, index) => {
                // Check media_types array first
                if (post.media_types && post.media_types[index]) {
                    return post.media_types[index] === 'video';
                }
                // Fallback: check media_type for single item posts
                if (post.media_type === 'video') return true;
                // Fallback: check URL extension
                const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
                return videoExtensions.some(ext => url.toLowerCase().includes(ext));
            };

            // Helper to render a grid cell with media
            const renderGridCell = (url, index) => {
                const isVideo = isVideoUrl(url, index);
                const videoIndicator = isVideo ? `
                    <div class="video-indicator">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                ` : '';

                return `
                    <div class="media-grid-cell" onclick="event.stopPropagation(); feedManager.openMediaSlideshow(${mediaUrlsJson}, ${index}, ${mediaTypesJson})">
                        ${isVideo ?
                            `<video src="${url}" muted preload="metadata"></video>` :
                            `<img src="${url}" alt="Post media ${index + 1}">`
                        }
                        ${videoIndicator}
                    </div>
                `;
            };

            // Build grid cells for each media item
            let gridCells = '';
            for (let i = 0; i < mediaCount; i++) {
                gridCells += renderGridCell(mediaUrls[i], i);
            }

            mediaHtml = `
                <div class="post-media-grid media-count-${mediaCount}" onclick="event.stopPropagation();">
                    ${gridCells}
                </div>
            `;
        }

        article.innerHTML = `
            ${repostIndicator}
            <div class="post-header">
                <a href="#" class="post-avatar-link" onclick="feedManager.goToProfile('${post.author_username || post.user_id}', '${post.author_role}', '${post.author_division || ''}', '${post.user_id}', ${post.author_transfer === 'y'}); return false;">
                    <div class="post-avatar-circle" style="border: 2px solid ${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}">
                        ${post.author_image ?
                            `<img src="${post.author_image}" alt="${authorName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </a>
                <div class="post-user-info">
                    <div class="post-user-name-row">
                        <a href="#" class="post-user-name" onclick="feedManager.goToProfile('${post.author_username || post.user_id}', '${post.author_role}', '${post.author_division || ''}', '${post.user_id}', ${post.author_transfer === 'y'}); return false;">
                            ${authorName}
                            ${post.author_verified ? `
                                <svg class="verified-badge" viewBox="0 0 24 24" fill="#1DA1F2">
                                    <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/>
                                </svg>
                            ` : ''}
                        </a>
                        ${post.author_username ? `<span class="post-user-handle">@${post.author_username}</span>` : ''}
                    </div>
                    <div class="post-meta ${post.author_role === 'coach' ? 'coach-meta' : (post.author_role === 'other' ? 'other-meta' : (post.author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">
                        ${metaInfo}
                    </div>
                </div>
                <div class="post-header-actions">
                    ${!isOwnPost && !post.is_following ? `
                        <button class="btn-follow-small" onclick="feedManager.followUser('${post.user_id}', this)">Follow</button>
                    ` : ''}
                    <button class="post-more-btn" onclick="feedManager.showPostMenu('${postId}', ${isOwnPost}, event)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                    </button>
                    <div class="post-view-icon" data-post-id="${postId}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="post-content" data-post-id="${postId}" style="cursor: pointer;">
                <p>${this.formatContent(post.content)}</p>
                ${mediaHtml}
            </div>
            <div class="post-stats">
                <span class="likes-count" onclick="feedManager.showLikes('${postId}')">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="comments-count" onclick="feedManager.toggleComments('${postId}')">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="post-shares-count" onclick="feedManager.showShares('${postId}')">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="post-actions-bar">
                <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="feedManager.toggleLike('${postId}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="post-action-btn" onclick="feedManager.toggleComments('${postId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="post-action-btn ${isSaved ? 'saved' : ''}" onclick="feedManager.toggleSave('${postId}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                <button class="post-action-btn ${isReposted ? 'reposted' : ''}" onclick="feedManager.sharePost('${postId}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span class="shares-count">${isReposted ? 'Reposted' : ((post.shares_count || 0) + ' ' + ((post.shares_count || 0) === 1 ? 'share' : 'shares'))}</span>
                </button>
            </div>
            <div class="post-comments-section" id="comments-${postId}" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-container">
                    <input type="text" placeholder="Write a comment..." class="comment-input" id="comment-input-${postId}" onkeypress="if(event.key==='Enter') feedManager.addComment('${postId}')">
                    <button onclick="feedManager.addComment('${postId}')">Post</button>
                </div>
            </div>
        `;

        // Click handlers are managed via document-level event delegation for reliability
        // See the event delegation code at the bottom of this file

        return article;
    }

    // Create a repost element for the feed (from someone you follow)
    createFeedRepostElement(post) {
        const article = document.createElement('article');
        article.className = 'post-card feed-repost-card';
        const postId = post.original_post_id || post.id;
        article.dataset.postId = postId;
        article.dataset.shareId = post.share_id;
        article.dataset.userReposted = post.user_reposted ? 'true' : 'false';

        const reposterName = `${post.reposter_first_name || ''} ${post.reposter_last_name || ''}`.trim() || 'Someone';
        const isOwnRepost = post.reposter_user_id === this.currentUserId;
        const timeAgo = this.getTimeAgo(post.original_created_at || post.created_at);
        const repostTimeAgo = this.getTimeAgo(post.sort_date);
        const isLiked = post.user_liked || false;
        const isSaved = post.user_saved || false;
        const isReposted = post.user_reposted || false;
        const isOwnPost = post.user_id === this.currentUserId;
        const authorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';

        // Build meta info for original author
        let metaInfo = this.buildAuthorMetaInfo(post, timeAgo);

        // Build media HTML
        let mediaHtml = this.buildMediaHtml(post);

        article.innerHTML = `
            <div class="repost-indicator">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                <span>${isOwnRepost ? 'You' : reposterName} reposted</span>
                <span class="repost-time">${repostTimeAgo}</span>
            </div>
            <div class="post-header">
                <a href="#" class="post-avatar-link" onclick="feedManager.goToProfile('${post.author_username || post.user_id}', '${post.author_role}', '${post.author_division || ''}', '${post.user_id}', ${post.author_transfer === 'y'}); return false;">
                    <div class="post-avatar-circle" style="border: 2px solid ${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}">
                        ${post.author_image ?
                            `<img src="${post.author_image}" alt="${authorName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </a>
                <div class="post-user-info">
                    <div class="post-user-name-row">
                        <a href="#" class="post-user-name" onclick="feedManager.goToProfile('${post.author_username || post.user_id}', '${post.author_role}', '${post.author_division || ''}', '${post.user_id}', ${post.author_transfer === 'y'}); return false;">
                            ${authorName}
                            ${post.author_verified ? `
                                <svg class="verified-badge" viewBox="0 0 24 24" fill="#1DA1F2">
                                    <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.018-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.248 1.336.248 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484zm-6.616-3.334l-4.334 6.5c-.145.217-.382.334-.625.334-.143 0-.288-.04-.416-.126l-.115-.094-2.415-2.415c-.293-.293-.293-.768 0-1.06s.768-.294 1.06 0l1.77 1.767 3.825-5.74c.23-.345.696-.436 1.04-.207.346.23.44.696.21 1.04z"/>
                                </svg>
                            ` : ''}
                        </a>
                        ${post.author_username ? `<span class="post-user-handle">@${post.author_username}</span>` : ''}
                    </div>
                    <div class="post-meta ${post.author_role === 'coach' ? 'coach-meta' : (post.author_role === 'other' ? 'other-meta' : (post.author_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">
                        ${metaInfo}
                    </div>
                </div>
                <div class="post-header-actions">
                    <button class="post-more-btn" onclick="feedManager.showPostMenu('${postId}', ${isOwnPost}, event)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                    </button>
                    <div class="post-view-icon" data-post-id="${postId}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="post-content" data-post-id="${postId}" style="cursor: pointer;">
                <p>${this.formatContent(post.content)}</p>
                ${mediaHtml}
            </div>
            <div class="post-stats">
                <span class="likes-count" onclick="feedManager.showLikes('${postId}')">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="comments-count" onclick="feedManager.toggleComments('${postId}')">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="post-shares-count" onclick="feedManager.showShares('${postId}')">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="post-actions-bar">
                <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="feedManager.toggleLike('${postId}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="post-action-btn" onclick="feedManager.toggleComments('${postId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="post-action-btn ${isSaved ? 'saved' : ''}" onclick="feedManager.toggleSave('${postId}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                <button class="post-action-btn ${isReposted ? 'reposted' : ''}" onclick="feedManager.sharePost('${postId}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span class="shares-count">${isReposted ? 'Reposted' : ((post.shares_count || 0) + ' ' + ((post.shares_count || 0) === 1 ? 'share' : 'shares'))}</span>
                </button>
            </div>
            <div class="post-comments-section" id="comments-${postId}" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-container">
                    <input type="text" placeholder="Write a comment..." class="comment-input" id="comment-input-${postId}" onkeypress="if(event.key==='Enter') feedManager.addComment('${postId}')">
                    <button onclick="feedManager.addComment('${postId}')">Post</button>
                </div>
            </div>
        `;

        return article;
    }

    // Create a quote post element for the feed (from someone you follow)
    createFeedQuotePostElement(post) {
        const article = document.createElement('article');
        article.className = 'post-card quote-post-card feed-quote-card';
        const postId = post.original_post_id || post.id;
        article.dataset.postId = postId;
        article.dataset.shareId = post.share_id;

        const reposterName = `${post.reposter_first_name || ''} ${post.reposter_last_name || ''}`.trim() || 'Someone';
        const repostTimeAgo = this.getTimeAgo(post.sort_date);
        const originalAuthorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
        const originalTimeAgo = this.getTimeAgo(post.original_created_at || post.created_at);
        const isLiked = post.user_liked || false;
        const isSaved = post.user_saved || false;
        const isReposted = post.user_reposted || false;
        const isOwnQuote = post.reposter_user_id === this.currentUserId;

        // Build meta info for quoter (reposter) using similar logic to buildAuthorMetaInfo
        const quoterMetaInfo = this.buildReposterMetaInfo(post, repostTimeAgo);

        // Build media HTML for the quote's own media (user's attached media)
        const quoteMediaHtml = post.quote_media_urls ? this.buildMediaHtml({ media_urls: post.quote_media_urls, media_type: post.quote_media_type }) : '';

        // Build media HTML for original post in the embed
        const originalMediaUrls = post.original_media_urls || post.media_urls;
        const originalMediaType = post.original_media_type || post.media_type;
        const quotedMediaHtml = this.buildQuotedMediaHtml(originalMediaUrls, originalMediaType);

        article.innerHTML = `
            <div class="post-header">
                <a href="#" class="post-avatar-link" onclick="feedManager.goToProfile('${post.reposter_username || post.reposter_user_id}', '${post.reposter_role}', '${post.reposter_division || ''}', '${post.reposter_user_id}', ${post.reposter_transfer === 'y'}); return false;">
                    <div class="post-avatar-circle" style="border: 2px solid ${getRoleBorderColor(post.reposter_role, post.reposter_transfer === 'y', post.reposter_division)}">
                        ${post.reposter_image ?
                            `<img src="${post.reposter_image}" alt="${reposterName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </a>
                <div class="post-user-info">
                    <div class="post-user-name-row">
                        <a href="#" class="post-user-name" onclick="event.stopPropagation(); feedManager.goToProfile('${post.reposter_username || post.reposter_user_id}', '${post.reposter_role}', '${post.reposter_division || ''}', '${post.reposter_user_id}', ${post.reposter_transfer === 'y'}); return false;">
                            ${reposterName}
                        </a>
                        ${post.reposter_username ? `<span class="post-user-handle">@${post.reposter_username}</span>` : ''}
                    </div>
                    <div class="post-meta ${post.reposter_role === 'coach' ? 'coach-meta' : (post.reposter_role === 'other' ? 'other-meta' : (post.reposter_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">
                        ${quoterMetaInfo}
                    </div>
                </div>
                <div class="post-header-actions">
                    <button class="post-more-btn" onclick="event.stopPropagation(); feedManager.showQuotePostMenu('${post.share_id}', ${isOwnQuote}, event)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                    </button>
                    <div class="post-view-icon" data-post-id="${postId}" data-share-id="${post.share_id}" onclick="event.stopPropagation(); feedManager.navigateToPostView(null, event, '${post.share_id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="post-content" data-post-id="${postId}" data-share-id="${post.share_id}" style="cursor: pointer;">
                <p>${this.formatContent(post.quote_content || '')}</p>
            </div>
            <div onclick="event.stopPropagation();">${quoteMediaHtml}</div>
            <div class="quoted-post-embed" onclick="event.stopPropagation(); feedManager.navigateToPostView('${postId}', event)" style="cursor: pointer;">
                <div class="quoted-post-header">
                    <div class="quoted-post-avatar" style="border: 2px solid ${getRoleBorderColor(post.author_role, post.author_transfer === 'y', post.author_division)}">
                        ${post.author_image ?
                            `<img src="${post.author_image}" alt="${originalAuthorName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                    <div class="quoted-post-info">
                        <span class="quoted-post-author">${originalAuthorName}</span>
                        <span class="quoted-post-time">${originalTimeAgo}</span>
                    </div>
                </div>
                <div class="quoted-post-content">
                    ${this.formatContent(post.original_content || post.content || '')}
                </div>
                ${quotedMediaHtml}
            </div>
            <div class="post-stats">
                <span class="likes-count" onclick="feedManager.showLikes('${postId}')">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="comments-count" onclick="feedManager.toggleComments('${postId}')">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="post-shares-count" onclick="feedManager.showShareLikes('${post.share_id}')">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="post-actions-bar">
                <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="feedManager.toggleShareLike('${post.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="post-action-btn" onclick="feedManager.toggleShareComments('${post.share_id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="post-action-btn ${isSaved ? 'saved' : ''}" onclick="feedManager.toggleShareSave('${post.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                <button class="post-action-btn ${isReposted ? 'reposted' : ''}" onclick="feedManager.sharePost('${postId}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span class="shares-count">${isReposted ? 'Reposted' : ((post.shares_count || 0) + ' ' + ((post.shares_count || 0) === 1 ? 'share' : 'shares'))}</span>
                </button>
            </div>
            <div class="post-comments-section" id="share-comments-${post.share_id}" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-container">
                    <input type="text" placeholder="Write a comment..." class="comment-input" id="share-comment-input-${post.share_id}" onkeypress="if(event.key==='Enter') feedManager.addShareComment('${post.share_id}')">
                    <button onclick="feedManager.addShareComment('${post.share_id}')">Post</button>
                </div>
            </div>
        `;

        return article;
    }

    // Create a quote post element for single post view (with quoter's full details)
    createSingleQuotePostElement(share) {
        const article = document.createElement('article');
        article.className = 'post-card quote-post-card single-quote-view';
        const postId = share.original_post_id;
        article.dataset.postId = postId;
        article.dataset.shareId = share.share_id;

        const quoterName = `${share.quoter_first_name || ''} ${share.quoter_last_name || ''}`.trim() || 'Someone';
        const isOwnQuote = share.quoter_user_id === this.currentUserId;
        const quoteTimeAgo = this.getTimeAgo(share.share_created_at || share.sort_date);
        const originalAuthorName = `${share.author_first_name || ''} ${share.author_last_name || ''}`.trim() || 'Unknown User';
        const originalTimeAgo = this.getTimeAgo(share.original_created_at);
        // Use share-specific engagement status for quote posts
        const isLiked = share.user_liked_share || false;
        const isSaved = share.user_saved_share || false;
        const isReposted = share.user_reposted || false;
        // Use share's own engagement counts
        const likesCount = share.share_likes_count || 0;
        const commentsCount = share.share_comments_count || 0;
        const sharesCount = share.share_shares_count || 0;

        // Build meta info for quoter
        const quoterMetaInfo = this.buildQuoterMetaInfo(share, quoteTimeAgo);

        // Build media HTML for the quote's own media (user's attached media)
        const quoteMediaHtml = share.quote_media_urls ? this.buildMediaHtml({ media_urls: share.quote_media_urls, media_type: share.quote_media_type }) : '';

        // Build quoted media HTML for original post (uses quoted post sizing)
        const quotedMediaHtml = this.buildQuotedMediaHtml(share.media_urls, share.media_type);

        article.innerHTML = `
            <div class="post-header">
                <a href="#" class="post-avatar-link" onclick="feedManager.goToProfile('${share.quoter_username || share.quoter_user_id}', '${share.quoter_role}', '${share.quoter_division || ''}', '${share.quoter_user_id}', ${share.quoter_transfer === 'y'}); return false;">
                    <div class="post-avatar-circle" style="border: 2px solid ${getRoleBorderColor(share.quoter_role, share.quoter_transfer === 'y', share.quoter_division)}">
                        ${share.quoter_image ?
                            `<img src="${share.quoter_image}" alt="${quoterName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </a>
                <div class="post-user-info">
                    <div class="post-user-name-row">
                        <a href="#" class="post-user-name" onclick="feedManager.goToProfile('${share.quoter_username || share.quoter_user_id}', '${share.quoter_role}', '${share.quoter_division || ''}', '${share.quoter_user_id}', ${share.quoter_transfer === 'y'}); return false;">
                            ${quoterName}
                        </a>
                        ${share.quoter_username ? `<span class="post-user-handle">@${share.quoter_username}</span>` : ''}
                    </div>
                    <div class="post-meta ${share.quoter_role === 'coach' ? 'coach-meta' : (share.quoter_role === 'other' ? 'other-meta' : (share.quoter_transfer === 'y' ? 'transfer-player-meta' : 'player-meta'))}">
                        ${quoterMetaInfo}
                    </div>
                </div>
                <div class="post-header-actions">
                    <button class="post-more-btn" onclick="feedManager.showQuotePostMenu('${share.share_id}', ${isOwnQuote}, event)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="post-content">
                <p>${this.formatContent(share.quote_content || '')}</p>
            </div>
            <div onclick="event.stopPropagation();">${quoteMediaHtml}</div>
            <div class="quoted-post-embed" onclick="feedManager.navigateToPostView('${postId}', event)" style="cursor: pointer;">
                <div class="quoted-post-header">
                    <a href="#" onclick="feedManager.goToProfile('${share.author_username || share.author_user_id}', '${share.author_role}', '${share.author_division || ''}', '${share.author_user_id}', ${share.author_transfer === 'y'}); event.stopPropagation(); return false;">
                        <div class="quoted-post-avatar" style="border: 2px solid ${getRoleBorderColor(share.author_role, share.author_transfer === 'y', share.author_division)}">
                            ${share.author_image ?
                                `<img src="${share.author_image}" alt="${originalAuthorName}">` :
                                `<svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>`
                            }
                        </div>
                    </a>
                    <div class="quoted-post-info">
                        <span class="quoted-post-author">${originalAuthorName}</span>
                        <span class="quoted-post-time">${originalTimeAgo}</span>
                    </div>
                </div>
                <div class="quoted-post-content">
                    ${this.formatContent(share.content || '')}
                </div>
                ${quotedMediaHtml}
            </div>
            <div class="post-stats">
                <span class="likes-count" onclick="feedManager.showShareLikes('${share.share_id}')">${likesCount} ${likesCount === 1 ? 'like' : 'likes'}</span>
                <span class="comments-count" onclick="feedManager.toggleShareComments('${share.share_id}')">${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}</span>
                <span class="post-shares-count">${sharesCount} ${sharesCount === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="post-actions-bar">
                <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="feedManager.toggleShareLike('${share.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="post-action-btn" onclick="feedManager.toggleShareComments('${share.share_id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="post-action-btn ${isSaved ? 'saved' : ''}" onclick="feedManager.toggleShareSave('${share.share_id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isSaved ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>${isSaved ? 'Saved' : 'Save'}</span>
                </button>
                <button class="post-action-btn ${isReposted ? 'reposted' : ''}" onclick="feedManager.sharePost('${postId}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span class="shares-count">${isReposted ? 'Reposted' : (sharesCount + ' ' + (sharesCount === 1 ? 'share' : 'shares'))}</span>
                </button>
            </div>
            <div class="post-comments-section" id="share-comments-${share.share_id}" style="display: none;">
                <div class="comments-list"></div>
                <div class="comment-input-container">
                    <input type="text" placeholder="Write a comment..." class="comment-input" id="share-comment-input-${share.share_id}" onkeypress="if(event.key==='Enter') feedManager.addShareComment('${share.share_id}')">
                    <button onclick="feedManager.addShareComment('${share.share_id}')">Post</button>
                </div>
            </div>
        `;

        return article;
    }

    // Helper to build quoter meta info (for single quote post view)
    buildQuoterMetaInfo(share, timeAgo) {
        let metaInfo = '';
        let starsHtml = '';

        // Add star rating for HS players and transfer players
        if (share.quoter_role === 'player' && share.quoter_star_rating && share.quoter_star_rating >= 1 && share.quoter_star_rating <= 5) {
            const isHSPlayer = !share.quoter_division && share.quoter_transfer !== 'y';
            const isTransferPlayer = share.quoter_transfer === 'y';
            if (isHSPlayer || isTransferPlayer) {
                starsHtml = `<span class="post-meta-stars" style="color: #ffd700; font-weight: 600;">${share.quoter_star_rating}â˜…</span> `;
            }
        }

        if (share.quoter_role === 'player') {
            const parts = [];
            if (share.quoter_transfer === 'y') {
                // Transfer Player: Position â€¢ Height â€¢ Weight â€¢ YOE
                if (share.quoter_position) parts.push(share.quoter_position);
                if (share.quoter_height) {
                    const heightStr = String(share.quoter_height);
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
                if (share.quoter_weight) parts.push(`${share.quoter_weight} lbs`);
                if (share.quoter_eligibility) {
                    const yearText = share.quoter_eligibility === 1 ? 'year' : 'years';
                    parts.push(`YOE: ${share.quoter_eligibility} ${yearText}`);
                }
            } else if (share.quoter_division) {
                // College player
                if (share.quoter_position) parts.push(share.quoter_position);
                if (share.quoter_school) parts.push(share.quoter_school);
                const div = share.quoter_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
            } else {
                // HS player
                if (share.quoter_position) parts.push(share.quoter_position);
                if (share.quoter_school) parts.push(share.quoter_school);
                if (share.quoter_grad_year) parts.push(share.quoter_grad_year);
            }
            parts.push(timeAgo);
            metaInfo = starsHtml + parts.join(' â€¢ ');
        } else if (share.quoter_role === 'other') {
            if (share.quoter_subheader) {
                metaInfo = `<span style="color: #d4a017;">${share.quoter_subheader} â€¢ ${timeAgo}</span>`;
            } else {
                metaInfo = timeAgo;
            }
        } else if (share.quoter_role === 'coach') {
            const parts = [];
            if (share.quoter_division) {
                if (share.quoter_school) parts.push(share.quoter_school);
                const div = share.quoter_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
                parts.push(timeAgo);
                metaInfo = parts.join(' â€¢ ');
            } else {
                if (share.quoter_school) parts.push(share.quoter_school);
                if (share.quoter_state) parts.push(share.quoter_state);
                const schoolState = parts.join(', ');
                metaInfo = schoolState ? `${schoolState} â€¢ ${timeAgo}` : timeAgo;
            }
        } else {
            metaInfo = timeAgo;
        }

        return metaInfo;
    }

    // Helper to build author meta info string
    buildAuthorMetaInfo(post, timeAgo) {
        let metaInfo = '';
        let starsHtml = '';

        if (post.author_role === 'player' && post.author_star_rating && post.author_star_rating >= 1 && post.author_star_rating <= 5) {
            const isHSPlayer = !post.author_division && post.author_transfer !== 'y';
            const isTransferPlayer = post.author_transfer === 'y';
            if (isHSPlayer || isTransferPlayer) {
                starsHtml = `<span class="post-meta-stars" style="color: #ffd700; font-weight: 600;">${post.author_star_rating}â˜…</span> `;
            }
        }

        if (post.author_role === 'player') {
            const parts = [];
            if (post.author_transfer === 'y') {
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
                if (post.author_weight) parts.push(`${post.author_weight} lbs`);
                if (post.author_eligibility) {
                    const yearText = post.author_eligibility === 1 ? 'year' : 'years';
                    parts.push(`YOE: ${post.author_eligibility} ${yearText}`);
                }
            } else if (post.author_division) {
                if (post.author_position) parts.push(post.author_position);
                if (post.author_school) parts.push(post.author_school);
                const div = post.author_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
            } else {
                if (post.author_position) parts.push(post.author_position);
                if (post.author_school) parts.push(post.author_school);
                if (post.author_grad_year) parts.push(post.author_grad_year);
            }
            parts.push(timeAgo);
            metaInfo = starsHtml + parts.join(' â€¢ ');
        } else if (post.author_role === 'other') {
            if (post.author_subheader) {
                metaInfo = `<span style="color: #d4a017;">${post.author_subheader} â€¢ ${timeAgo}</span>`;
            } else {
                metaInfo = timeAgo;
            }
        } else if (post.author_role === 'coach') {
            const parts = [];
            if (post.author_division) {
                if (post.author_school) parts.push(post.author_school);
                const div = post.author_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
                parts.push(timeAgo);
                metaInfo = parts.join(' â€¢ ');
            } else {
                if (post.author_school) parts.push(post.author_school);
                if (post.author_state) parts.push(post.author_state);
                const schoolState = parts.join(', ');
                metaInfo = schoolState ? `${schoolState} â€¢ ${timeAgo}` : timeAgo;
            }
        } else {
            metaInfo = timeAgo;
        }

        return metaInfo;
    }

    // Helper to build reposter/quoter meta info string (for repost and quote posts in feed)
    // Uses same format as buildAuthorMetaInfo but for the reposter/quoter
    buildReposterMetaInfo(post, timeAgo) {
        let metaInfo = '';
        const role = post.reposter_role;

        if (role === 'player') {
            // Check if college player (has division) vs HS player
            if (post.reposter_division) {
                // College player or transfer player
                const parts = [];
                if (post.reposter_position) parts.push(post.reposter_position);
                if (post.reposter_school) parts.push(post.reposter_school);
                const div = post.reposter_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
                parts.push(timeAgo);
                metaInfo = parts.join(' â€¢ ');
            } else {
                // HS player
                const parts = [];
                if (post.reposter_position) parts.push(post.reposter_position);
                if (post.reposter_school && post.reposter_state) {
                    parts.push(`${post.reposter_school}, ${post.reposter_state}`);
                } else if (post.reposter_school) {
                    parts.push(post.reposter_school);
                } else if (post.reposter_state) {
                    parts.push(post.reposter_state);
                }
                if (post.reposter_grad_year) parts.push(`'${String(post.reposter_grad_year).slice(-2)}`);
                parts.push(timeAgo);
                metaInfo = parts.join(' â€¢ ');
            }
        } else if (role === 'coach') {
            const parts = [];
            if (post.reposter_division) {
                if (post.reposter_school) parts.push(post.reposter_school);
                const div = post.reposter_division;
                if (div === 'FBS' || div === 'FCS') {
                    parts.push(`D1 ${div}`);
                } else {
                    parts.push(div);
                }
                parts.push(timeAgo);
                metaInfo = parts.join(' â€¢ ');
            } else {
                if (post.reposter_school) parts.push(post.reposter_school);
                if (post.reposter_state) parts.push(post.reposter_state);
                const schoolState = parts.join(', ');
                metaInfo = schoolState ? `${schoolState} â€¢ ${timeAgo}` : timeAgo;
            }
        } else if (role === 'other') {
            // Other role - use subheader if available
            if (post.reposter_subheader) {
                metaInfo = `${post.reposter_subheader} â€¢ ${timeAgo}`;
            } else {
                metaInfo = timeAgo;
            }
        } else {
            metaInfo = timeAgo;
        }

        return metaInfo;
    }

    // Helper to build media HTML
    buildMediaHtml(post) {
        let mediaHtml = '';
        if (post.media_urls && post.media_urls.length > 0) {
            const mediaUrls = post.media_urls.slice(0, 4);
            const mediaCount = mediaUrls.length;
            const mediaUrlsJson = JSON.stringify(post.media_urls).replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const mediaTypesJson = JSON.stringify(post.media_types || []).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            const isVideoUrl = (url, index) => {
                if (post.media_types && post.media_types[index]) {
                    return post.media_types[index] === 'video';
                }
                if (post.media_type === 'video') return true;
                const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
                return videoExtensions.some(ext => url.toLowerCase().includes(ext));
            };

            const renderGridCell = (url, index) => {
                const isVideo = isVideoUrl(url, index);
                const videoIndicator = isVideo ? `
                    <div class="video-indicator">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                ` : '';

                return `
                    <div class="media-grid-cell" onclick="event.stopPropagation(); feedManager.openMediaSlideshow(${mediaUrlsJson}, ${index}, ${mediaTypesJson})">
                        ${isVideo ?
                            `<video src="${url}" muted preload="metadata"></video>` :
                            `<img src="${url}" alt="Post media ${index + 1}">`
                        }
                        ${videoIndicator}
                    </div>
                `;
            };

            let gridCells = '';
            for (let i = 0; i < mediaCount; i++) {
                gridCells += renderGridCell(mediaUrls[i], i);
            }

            mediaHtml = `
                <div class="post-media-grid media-count-${mediaCount}" onclick="event.stopPropagation();">
                    ${gridCells}
                </div>
            `;
        }
        return mediaHtml;
    }

    // Helper to build media HTML for quoted post embeds (matches original post media grid sizing)
    buildQuotedMediaHtml(mediaUrls, mediaType) {
        let mediaHtml = '';
        if (mediaUrls && mediaUrls.length > 0) {
            const urls = Array.isArray(mediaUrls) ? mediaUrls : [mediaUrls];
            const mediaCount = Math.min(urls.length, 4);
            const mediaUrlsJson = JSON.stringify(urls).replace(/'/g, "\\'").replace(/"/g, '&quot;');

            const isVideo = (url) => {
                if (mediaType === 'video') return true;
                const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
                return videoExtensions.some(ext => url.toLowerCase().includes(ext));
            };

            const renderGridCell = (url, index) => {
                const isVideoUrl = isVideo(url);
                const videoIndicator = isVideoUrl ? `
                    <div class="video-indicator">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </div>
                ` : '';

                return `
                    <div class="quoted-media-item" onclick="feedManager.openMediaSlideshow(${mediaUrlsJson}, ${index}); event.stopPropagation();">
                        ${isVideoUrl ?
                            `<video src="${url}" muted preload="metadata"></video>` :
                            `<img src="${url}" alt="Quoted post media ${index + 1}">`
                        }
                        ${videoIndicator}
                    </div>
                `;
            };

            let gridCells = '';
            for (let i = 0; i < mediaCount; i++) {
                gridCells += renderGridCell(urls[i], i);
            }

            mediaHtml = `<div class="quoted-post-media media-count-${mediaCount}">${gridCells}</div>`;
        }
        return mediaHtml;
    }

    // Create a quote post element (user's comment with embedded original post)
    createQuotePostElement(post) {
        const article = document.createElement('article');
        article.className = 'post-card quote-post-card';
        article.dataset.postId = post.id;
        article.dataset.shareId = post.id; // For quote posts, share_id is the same as id
        article.dataset.originalPostId = post.original_post_id;

        const timeAgo = this.getTimeAgo(post.reposted_at || post.created_at);
        const quoterName = `${post.quoter_first_name || ''} ${post.quoter_last_name || ''}`.trim() || 'You';
        const originalAuthorName = `${post.author_first_name || ''} ${post.author_last_name || ''}`.trim() || 'Unknown User';
        const originalTimeAgo = this.getTimeAgo(post.original_created_at);

        // Check if current user owns this quote post
        const isOwnQuote = post.quoter_user_id === this.currentUserId;

        // Build media HTML for the quote's own media (user's attached media)
        const quoteMediaHtml = post.quote_media_urls ? this.buildMediaHtml({ media_urls: post.quote_media_urls, media_type: post.quote_media_type }) : '';

        // Build media HTML for original post in the embed
        const originalMediaUrls = post.original_media_urls || post.media_urls;
        const originalMediaType = post.original_media_type || post.media_type;
        const quotedMediaHtml = this.buildQuotedMediaHtml(originalMediaUrls, originalMediaType);

        // Add click handler to navigate to quote post page
        article.style.cursor = 'pointer';
        article.onclick = (e) => {
            // Don't navigate if clicking on interactive elements or media
            if (e.target.closest('a, button, .post-actions-bar, .post-comments-section, .quoted-post-embed, .post-stats, .post-media-grid, .media-grid-cell, video, img')) {
                return;
            }
            this.navigateToPostView(null, e, post.id);
        };

        article.innerHTML = `
            <div class="post-header">
                <a href="#" class="post-avatar-link" onclick="event.stopPropagation(); feedManager.goToProfile('${post.quoter_username || post.quoter_user_id}', '${post.quoter_role || 'player'}', '${post.quoter_division || ''}', '${post.quoter_user_id}', ${post.quoter_transfer === 'y'}); return false;">
                    <div class="post-avatar-circle" style="border: 2px solid ${getRoleBorderColor(post.quoter_role || 'player', post.quoter_transfer === 'y', post.quoter_division)}">
                        ${post.quoter_image ?
                            `<img src="${post.quoter_image}" alt="${quoterName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                </a>
                <div class="post-user-info">
                    <div class="post-user-name-row">
                        <a href="#" class="post-user-name" onclick="event.stopPropagation(); feedManager.goToProfile('${post.quoter_username || post.quoter_user_id}', '${post.quoter_role || 'player'}', '${post.quoter_division || ''}', '${post.quoter_user_id}', ${post.quoter_transfer === 'y'}); return false;">
                            ${quoterName}
                        </a>
                        ${post.quoter_username ? `<span class="post-user-handle">@${post.quoter_username}</span>` : ''}
                    </div>
                    <div class="post-meta">${timeAgo}</div>
                </div>
                <div class="post-header-actions">
                    <button class="post-more-btn" onclick="event.stopPropagation(); feedManager.showQuotePostMenu('${post.id}', ${isOwnQuote}, event)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                    </button>
                    <div class="post-view-icon" data-post-id="${post.original_post_id}" data-share-id="${post.id}" onclick="event.stopPropagation(); feedManager.navigateToPostView(null, event, '${post.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
            <div class="post-content" data-post-id="${post.original_post_id}" data-share-id="${post.id}" style="cursor: pointer;">
                <p>${this.formatContent(post.quote_content)}</p>
            </div>
            <div onclick="event.stopPropagation();">${quoteMediaHtml}</div>
            <div class="quoted-post-embed" onclick="event.stopPropagation(); feedManager.navigateToPostView('${post.original_post_id}', event)" style="cursor: pointer;">
                <div class="quoted-post-header">
                    <a href="#" onclick="feedManager.goToProfile('${post.author_username || post.author_user_id}', '${post.author_role || 'player'}', '${post.author_division || ''}', '${post.author_user_id}', ${post.author_transfer === 'y'}); event.stopPropagation(); return false;">
                        <div class="quoted-post-avatar" style="border: 2px solid ${getRoleBorderColor(post.author_role || 'player', post.author_transfer === 'y', post.author_division)}">
                            ${post.author_image ?
                                `<img src="${post.author_image}" alt="${originalAuthorName}">` :
                                `<svg viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>`
                            }
                        </div>
                    </a>
                    <div class="quoted-post-info">
                        <span class="quoted-post-author">${originalAuthorName}</span>
                        <span class="quoted-post-time">${originalTimeAgo}</span>
                    </div>
                </div>
                <div class="quoted-post-content">
                    ${this.formatContent(post.original_content || post.content)}
                </div>
                ${quotedMediaHtml}
            </div>
            <div class="post-stats">
                <span class="likes-count" onclick="feedManager.showLikes('${post.original_post_id}')">${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                <span class="comments-count">${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>
                <span class="post-shares-count" onclick="feedManager.showShares('${post.original_post_id}')">${post.shares_count || 0} ${(post.shares_count || 0) === 1 ? 'share' : 'shares'}</span>
            </div>
            <div class="post-actions-bar">
                <button class="post-action-btn" onclick="feedManager.toggleLike('${post.original_post_id}', this)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                    <span>Like</span>
                </button>
                <button class="post-action-btn" onclick="feedManager.toggleComments('${post.original_post_id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="post-action-btn" onclick="feedManager.sharePost('${post.original_post_id}', event)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <span>Share</span>
                </button>
            </div>
        `;

        return article;
    }

    // Menu for quote posts (edit/delete quote for owner, report for non-owner)
    showQuotePostMenu(shareId, isOwner, event) {
        event.stopPropagation();

        // Remove existing menu
        const existing = document.querySelector('.post-dropdown-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'post-dropdown-menu';
        menu.innerHTML = `
            ${isOwner ? `
                <div class="dropdown-item" onclick="feedManager.editQuotePost('${shareId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Edit Quote</span>
                </div>
                <div class="dropdown-item dropdown-item-danger" onclick="feedManager.deleteQuotePost('${shareId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete Quote Post</span>
                </div>
            ` : `
                <div class="dropdown-item" onclick="feedManager.reportQuotePost('${shareId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                        <line x1="4" y1="22" x2="4" y2="15"></line>
                    </svg>
                    <span>Report Quote Post</span>
                </div>
            `}
        `;

        document.body.appendChild(menu);

        // Position menu
        const btn = event.target.closest('.post-more-btn');
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

    // Edit quote post content
    async editQuotePost(shareId) {
        // Close menu
        document.querySelector('.post-dropdown-menu')?.remove();

        try {
            // Fetch the current quote post data
            const response = await API.get(`/posts/share/${shareId}`);
            const share = response.share;

            if (!share) {
                this.showToast('Quote post not found', 'error');
                return;
            }

            // Initialize edit media state - use quote_media_urls (the quote's own media, not the original post's media)
            // quote_media_urls_keys contains original S3 keys, quote_media_urls contains signed URLs for display
            const existingMediaKeys = share.quote_media_urls_keys || [];
            const existingMediaType = share.quote_media_type || null;
            const signedUrls = share.quote_media_urls || share.signed_quote_media_urls || [];

            // Track current media state (existing S3 keys to keep, new files to upload)
            let currentMediaKeys = [...existingMediaKeys]; // S3 keys of existing media
            let newMediaFiles = []; // New files to upload
            let newMediaPreviews = []; // Preview URLs for new files
            const maxMedia = 4;

            // Determine if quote has media
            const hasMedia = existingMediaKeys.length > 0;

            // Create edit modal
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
                        <textarea id="edit-quote-textarea" class="edit-post-textarea" placeholder="Add your comment...">${share.quote_content || ''}</textarea>

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
                                ${this.renderEditMediaItems(existingMediaKeys, signedUrls, existingMediaType, 'quote')}
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

            // Focus textarea
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

                // Build HTML for existing media (using signed URLs)
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

                // Build HTML for new media (using blob URLs)
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

                grid.innerHTML = html;
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
            const mediaInput = document.getElementById('edit-quote-media-input');
            mediaInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                const totalCount = currentMediaKeys.length + newMediaFiles.length;
                const remaining = maxMedia - totalCount;

                if (remaining <= 0) {
                    this.showToast(`Maximum ${maxMedia} media files allowed`, 'error');
                    e.target.value = '';
                    return;
                }

                const filesToAdd = files.slice(0, remaining);
                for (const file of filesToAdd) {
                    if (!this.validateMediaFile(file)) continue;

                    const isVideo = file.type.startsWith('video/');
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
                        saveBtn.textContent = 'Uploading media...';
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
                            this.showToast('Failed to upload media: ' + uploadError.message, 'error');
                            saveBtn.disabled = false;
                            saveBtn.textContent = 'Save';
                            return;
                        }
                    }

                    // If all media removed, set to null
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

                    // Update the quote content and media in the DOM
                    const quoteCard = document.querySelector(`[data-share-id="${shareId}"]`) ||
                                      document.querySelector(`.quote-post-card[data-post-id="${shareId}"]`);
                    if (quoteCard) {
                        // Update content
                        const contentP = quoteCard.querySelector('.post-content p');
                        if (contentP) {
                            contentP.innerHTML = this.formatContent(newContent);
                        }

                        // Update media - find the media container (the div after .post-content)
                        const postContent = quoteCard.querySelector('.post-content');
                        if (postContent && postContent.nextElementSibling) {
                            const mediaContainer = postContent.nextElementSibling;
                            // Only update if it's the media wrapper (not the quoted-post-embed)
                            if (!mediaContainer.classList.contains('quoted-post-embed')) {
                                // Build new media HTML
                                const newMediaHtml = updatedShare.quote_media_urls && updatedShare.quote_media_urls.length > 0
                                    ? this.buildMediaHtml({ media_urls: updatedShare.quote_media_urls, media_type: updatedShare.quote_media_type })
                                    : '';
                                mediaContainer.innerHTML = newMediaHtml;
                            }
                        }
                    }

                    modal.remove();
                    this.showToast('Quote updated', 'success');
                } catch (error) {
                    this.showToast('Failed to update quote', 'error');
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save';
                }
            };

            // Close on overlay click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    newMediaPreviews.forEach(p => URL.revokeObjectURL(p.url));
                    modal.remove();
                }
            });
        } catch (error) {
            this.showToast('Failed to load quote post', 'error');
        }
    }

    // Helper to render edit media items
    renderEditMediaItems(mediaKeys, signedUrls, mediaType, prefix) {
        if (!mediaKeys || mediaKeys.length === 0) return '';

        return mediaKeys.map((key, index) => {
            const signedUrl = signedUrls[index] || key;
            const isVideo = mediaType === 'video' || key.includes('video') || key.match(/\.(mp4|mov|webm)$/i);
            return `
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
        }).join('');
    }

    // Report quote post
    reportQuotePost(shareId) {
        document.querySelector('.post-dropdown-menu')?.remove();
        this.showToast('Quote post reported. We will review it shortly.', 'info');
    }

    async deleteQuotePost(shareId) {
        // Close menu
        document.querySelector('.post-dropdown-menu')?.remove();

        // Remove any existing delete modal
        document.getElementById('delete-quote-modal')?.remove();

        // Create delete confirmation modal
        const modal = document.createElement('div');
        modal.className = 'feed-modal-overlay';
        modal.id = 'delete-quote-modal';
        modal.innerHTML = `
            <div class="feed-modal">
                <div class="delete-modal">
                    <div class="delete-modal-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </div>
                    <h3>Delete Quote Post</h3>
                    <p>Are you sure you want to delete this quote post?</p>
                    <div class="delete-modal-actions">
                        <button class="delete-modal-btn delete-modal-btn-cancel" onclick="feedManager.closeModal('delete-quote-modal')">Cancel</button>
                        <button class="delete-modal-btn delete-modal-btn-delete" onclick="feedManager.confirmDeleteQuote('${shareId}')">Delete</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal('delete-quote-modal');
            }
        });
    }

    async confirmDeleteQuote(shareId) {
        try {
            await postsAPI.unsharePost(shareId);
            // Quote posts have data-share-id attribute
            document.querySelector(`[data-share-id="${shareId}"]`)?.remove();
            this.closeModal('delete-quote-modal');
            this.showToast('Quote post deleted', 'success');
        } catch (error) {
            this.showToast('Failed to delete quote post', 'error');
        }
    }

    formatContent(content) {
        if (!content) return '';
        // Escape HTML
        let formatted = this.escapeHtml(content);
        // Convert newlines to <br>
        formatted = formatted.replace(/\n/g, '<br>');
        // Make URLs clickable
        formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
        // Make hashtags clickable
        formatted = formatted.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
        // Make mentions clickable
        formatted = formatted.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        return formatted;
    }

    // ==================== POST ACTIONS ====================

    async createPost() {
        const content = this.postInput?.value.trim();
        const hasMedia = this.pendingMediaFiles.length > 0;

        if (!content && !hasMedia) {
            this.showToast('Please write something or add media before posting!', 'error');
            return;
        }

        try {
            this.createPostBtn.disabled = true;
            this.createPostBtn.textContent = hasMedia ? 'Uploading...' : 'Posting...';

            // Check if this is a quote post
            const quotedPostId = this.postInput.dataset.quotedPost;

            if (quotedPostId) {
                // Create a quote post (share with quote content and optional media)
                let mediaUrls = [];
                let mediaType = null;

                if (hasMedia) {
                    // Upload media files to S3
                    this.createPostBtn.textContent = 'Uploading media...';

                    try {
                        const uploadResult = await uploadAPI.uploadPostMedia(this.pendingMediaFiles);

                        // Extract S3 keys from upload result
                        if (uploadResult.media && uploadResult.media.length > 0) {
                            mediaUrls = uploadResult.media.map(m => m.s3Key);
                            mediaType = uploadResult.media_type;
                        } else if (uploadResult.s3Key) {
                            // Single file fallback
                            mediaUrls = [uploadResult.s3Key];
                            mediaType = uploadResult.media_type;
                        }
                    } catch (uploadError) {
                        this.showToast('Failed to upload media: ' + uploadError.message, 'error');
                        return;
                    }
                }

                this.createPostBtn.textContent = 'Posting...';
                await postsAPI.sharePost(quotedPostId, 'quote', content, mediaUrls.length > 0 ? mediaUrls : null, mediaType);
                this.showToast('Quote posted!', 'success');

                // Clean up quote preview
                this.cancelQuote();
            } else {
                // Regular post - check for media
                let mediaUrls = [];
                let mediaType = null;

                if (hasMedia) {
                    // Upload media files to S3
                    this.createPostBtn.textContent = 'Uploading media...';

                    try {
                        const uploadResult = await uploadAPI.uploadPostMedia(this.pendingMediaFiles);

                        // Extract S3 keys from upload result
                        if (uploadResult.media && uploadResult.media.length > 0) {
                            mediaUrls = uploadResult.media.map(m => m.s3Key);
                            mediaType = uploadResult.media_type;
                        } else if (uploadResult.s3Key) {
                            // Single file fallback
                            mediaUrls = [uploadResult.s3Key];
                            mediaType = uploadResult.media_type;
                        }
                    } catch (uploadError) {
                        this.showToast('Failed to upload media: ' + uploadError.message, 'error');
                        return;
                    }
                }

                this.createPostBtn.textContent = 'Posting...';

                // Create post with media
                const postData = { content: content || '' };
                if (mediaUrls.length > 0) {
                    postData.media_urls = mediaUrls;
                    postData.media_type = mediaType;
                }

                await postsAPI.createPost(postData);
                this.showToast('Post created!', 'success');
            }

            // Clear input and media
            this.postInput.value = '';
            this.postInput.style.height = 'auto';
            this.clearMediaFiles();

            await this.loadFeed();
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (error) {
            this.showToast('Failed to create post', 'error');
        } finally {
            this.createPostBtn.disabled = false;
            this.createPostBtn.textContent = 'Post';
        }
    }

    async toggleLike(postId, button) {
        const isLiked = button.classList.contains('liked');
        const svg = button.querySelector('svg');
        const span = button.querySelector('span');
        const statsEl = button.closest('.post-card').querySelector('.likes-count');

        try {
            if (isLiked) {
                await postsAPI.unlikePost(postId);
                button.classList.remove('liked');
                svg.setAttribute('fill', 'none');
                span.textContent = 'Like';
                // Update count
                const count = parseInt(statsEl.textContent) - 1;
                statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
            } else {
                await postsAPI.likePost(postId);
                button.classList.add('liked');
                svg.setAttribute('fill', 'currentColor');
                span.textContent = 'Liked';
                // Update count
                const count = parseInt(statsEl.textContent) + 1;
                statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
            }
        } catch (error) {
            this.showToast('Failed to update like', 'error');
        }
    }

    async toggleSave(postId, button) {
        const isSaved = button.classList.contains('saved');
        const svg = button.querySelector('svg');
        const span = button.querySelector('span');

        try {
            if (isSaved) {
                await postsAPI.unsavePost(postId);
                button.classList.remove('saved');
                svg.setAttribute('fill', 'none');
                span.textContent = 'Save';
                this.showToast('Post removed from saved', 'success');
            } else {
                await postsAPI.savePost(postId);
                button.classList.add('saved');
                svg.setAttribute('fill', 'currentColor');
                span.textContent = 'Saved';
                this.showToast('Post saved!', 'success');
            }
        } catch (error) {
            this.showToast('Failed to update save', 'error');
        }
    }

    async toggleComments(postId) {
        const section = document.getElementById(`comments-${postId}`);
        if (!section) {
            return;
        }
        if (section.style.display === 'none') {
            await this.loadComments(postId);
            section.style.display = 'block';
            section.querySelector('.comment-input')?.focus();
        } else {
            section.style.display = 'none';
        }
    }

    async loadComments(postId) {
        try {
            const response = await postsAPI.getComments(postId);
            const listEl = document.querySelector(`#comments-${postId} .comments-list`);

            if (!listEl) {
                return;
            }

            if (response.comments && response.comments.length > 0) {
                const isOwnComment = (userId) => userId === this.currentUserId;
                listEl.innerHTML = response.comments.map(comment => `
                    <div class="comment" data-comment-id="${comment.id}">
                        <div class="comment-avatar clickable-profile" onclick="feedManager.goToProfile('${comment.author_username || comment.user_id}', '${comment.author_role || 'player'}', '${comment.author_division || ''}', '${comment.user_id}', ${comment.author_transfer === 'y'})" style="border: 2px solid ${getRoleBorderColor(comment.author_role || 'player', comment.author_transfer === 'y', comment.author_division)}">
                            ${comment.author_image ?
                                `<img src="${comment.author_image}" alt="">` :
                                `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
                            }
                        </div>
                        <div class="comment-body">
                            <div class="comment-header">
                                <span class="comment-author clickable-profile" onclick="feedManager.goToProfile('${comment.author_username || comment.user_id}', '${comment.author_role || 'player'}', '${comment.author_division || ''}', '${comment.user_id}', ${comment.author_transfer === 'y'})">${comment.author_first_name || ''} ${comment.author_last_name || ''}</span>
                                <span class="comment-time">${this.getTimeAgo(comment.created_at)}</span>
                            </div>
                            <div class="comment-content">${this.escapeHtml(comment.content)}</div>
                            <div class="comment-actions">
                                <button class="comment-like-btn ${comment.user_liked ? 'liked' : ''}" data-liked="${comment.user_liked ? 'true' : 'false'}" onclick="feedManager.toggleCommentLike('${comment.id}', this)">
                                    <svg viewBox="0 0 24 24" fill="${comment.user_liked ? '#e74c3c' : 'none'}" stroke="${comment.user_liked ? '#e74c3c' : 'currentColor'}" stroke-width="2" width="14" height="14">
                                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                                    </svg>
                                    <span class="comment-like-count">${comment.likes_count || 0}</span>
                                </button>
                                <button onclick="feedManager.replyToComment('${postId}', '${comment.id}', '${comment.author_first_name || ''} ${comment.author_last_name || ''}')">Reply</button>
                                <button onclick="feedManager.repostComment('${postId}', '${comment.id}')">Repost</button>
                                ${comment.user_id === this.currentUserId ? `<button class="comment-delete-btn" onclick="feedManager.deleteComment('${postId}', '${comment.id}')">Delete</button>` : ''}
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                listEl.innerHTML = '<div class="no-comments">No comments yet. Be the first!</div>';
            }
        } catch (error) {
        }
    }

    async addComment(postId) {
        const input = document.getElementById(`comment-input-${postId}`);
        const content = input?.value.trim();
        if (!content) return;

        try {
            // Check if replying to a comment
            const parentCommentId = input.dataset.replyTo || null;
            await postsAPI.addComment(postId, content, parentCommentId);
            input.value = '';
            input.placeholder = 'Write a comment...';
            delete input.dataset.replyTo;

            // Hide reply indicator if present
            const replyIndicator = document.getElementById(`reply-indicator-${postId}`);
            if (replyIndicator) replyIndicator.remove();

            await this.loadComments(postId);

            // Update comment count
            const statsEl = document.querySelector(`[data-post-id="${postId}"] .comments-count`);
            if (statsEl) {
                const count = parseInt(statsEl.textContent) + 1;
                statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
            }
        } catch (error) {
            this.showToast('Failed to add comment', 'error');
        }
    }

    async deleteComment(postId, commentId) {
        // Create delete confirmation modal
        const modal = document.createElement('div');
        modal.className = 'feed-modal-overlay';
        modal.id = 'delete-comment-modal';
        modal.innerHTML = `
            <div class="feed-modal">
                <div class="delete-modal">
                    <div class="delete-modal-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </div>
                    <h3>Delete Comment</h3>
                    <p>Are you sure you want to delete this comment?</p>
                    <div class="delete-modal-actions">
                        <button class="delete-modal-btn delete-modal-btn-cancel" onclick="feedManager.closeModal('delete-comment-modal')">Cancel</button>
                        <button class="delete-modal-btn delete-modal-btn-delete" onclick="feedManager.confirmDeleteComment('${postId}', '${commentId}')">Delete</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal('delete-comment-modal');
            }
        });
    }

    async confirmDeleteComment(postId, commentId) {
        try {
            await postsAPI.deleteComment(postId, commentId);

            // Remove comment from DOM
            const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
            if (commentEl) commentEl.remove();

            // Update comment count
            const statsEl = document.querySelector(`[data-post-id="${postId}"] .comments-count`);
            if (statsEl) {
                const count = Math.max(0, parseInt(statsEl.textContent) - 1);
                statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
            }

            this.closeModal('delete-comment-modal');
            this.showToast('Comment deleted', 'success');
        } catch (error) {
            this.showToast('Failed to delete comment', 'error');
        }
    }

    repostComment(postId, commentId) {
        // Create a repost modal or redirect to create post with quoted comment
        this.showToast('Repost feature coming soon!', 'info');
    }

    // ==================== SHARE ENGAGEMENT (for quote posts) ====================

    async toggleShareLike(shareId, button) {
        const isLiked = button.classList.contains('liked');
        const svg = button.querySelector('svg');
        const span = button.querySelector('span');
        const statsEl = button.closest('.post-card').querySelector('.likes-count');

        try {
            if (isLiked) {
                await API.delete(`/posts/share/${shareId}/like`);
                button.classList.remove('liked');
                svg.setAttribute('fill', 'none');
                span.textContent = 'Like';
                // Update count
                if (statsEl) {
                    const count = parseInt(statsEl.textContent) - 1;
                    statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
                }
            } else {
                await API.post(`/posts/share/${shareId}/like`);
                button.classList.add('liked');
                svg.setAttribute('fill', 'currentColor');
                span.textContent = 'Liked';
                // Update count
                if (statsEl) {
                    const count = parseInt(statsEl.textContent) + 1;
                    statsEl.textContent = `${count} ${count === 1 ? 'like' : 'likes'}`;
                }
            }
        } catch (error) {
            this.showToast('Failed to update like', 'error');
        }
    }

    async toggleShareSave(shareId, button) {
        const isSaved = button.classList.contains('saved');
        const svg = button.querySelector('svg');
        const span = button.querySelector('span');

        try {
            if (isSaved) {
                await API.delete(`/posts/share/${shareId}/save`);
                button.classList.remove('saved');
                svg.setAttribute('fill', 'none');
                span.textContent = 'Save';
                this.showToast('Quote post removed from saved', 'success');
            } else {
                await API.post(`/posts/share/${shareId}/save`);
                button.classList.add('saved');
                svg.setAttribute('fill', 'currentColor');
                span.textContent = 'Saved';
                this.showToast('Quote post saved!', 'success');
            }
        } catch (error) {
            this.showToast('Failed to update save', 'error');
        }
    }

    async toggleShareComments(shareId) {
        const section = document.getElementById(`share-comments-${shareId}`);
        if (!section) {
            return;
        }
        if (section.style.display === 'none') {
            await this.loadShareComments(shareId);
            section.style.display = 'block';
            section.querySelector('.comment-input')?.focus();
        } else {
            section.style.display = 'none';
        }
    }

    async loadShareComments(shareId) {
        try {
            const response = await API.get(`/posts/share/${shareId}/comments`);
            const listEl = document.querySelector(`#share-comments-${shareId} .comments-list`);

            if (!listEl) {
                return;
            }

            if (response.comments && response.comments.length > 0) {
                const isOwnComment = (userId) => userId === this.currentUserId;
                listEl.innerHTML = response.comments.map(comment => `
                    <div class="comment" data-comment-id="${comment.id}">
                        <div class="comment-avatar clickable-profile" onclick="feedManager.goToProfile('${comment.username || comment.user_id}', '${comment.role || 'player'}', '${comment.division || ''}', '${comment.user_id}', ${comment.transfer === 'y'})" style="border: 2px solid ${getRoleBorderColor(comment.role || 'player', comment.transfer === 'y', comment.division)}">
                            ${comment.profile_image ?
                                `<img src="${comment.profile_image}" alt="">` :
                                `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`
                            }
                        </div>
                        <div class="comment-content">
                            <div class="comment-header">
                                <span class="comment-author clickable-profile" onclick="feedManager.goToProfile('${comment.username || comment.user_id}', '${comment.role || 'player'}', '${comment.division || ''}', '${comment.user_id}', ${comment.transfer === 'y'})">${comment.first_name} ${comment.last_name}</span>
                                <span class="comment-time">${this.getTimeAgo(comment.created_at)}</span>
                            </div>
                            <p>${this.formatContent(comment.content)}</p>
                            <div class="comment-actions">
                                <button onclick="feedManager.likeShareComment('${comment.id}', this)">
                                    Like ${comment.likes_count > 0 ? `(${comment.likes_count})` : ''}
                                </button>
                                ${isOwnComment(comment.user_id) ?
                                    `<button onclick="feedManager.deleteShareComment('${shareId}', '${comment.id}')">Delete</button>` :
                                    ''
                                }
                            </div>
                        </div>
                    </div>
                `).join('');
            } else {
                listEl.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
            }
        } catch (error) {
        }
    }

    async addShareComment(shareId) {
        const input = document.getElementById(`share-comment-input-${shareId}`);
        const content = input?.value.trim();
        if (!content) return;

        try {
            await API.post(`/posts/share/${shareId}/comments`, { content });
            input.value = '';
            await this.loadShareComments(shareId);

            // Update comment count
            const statsEl = document.querySelector(`[data-share-id="${shareId}"] .comments-count`);
            if (statsEl) {
                const count = parseInt(statsEl.textContent) + 1;
                statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
            }
        } catch (error) {
            this.showToast('Failed to add comment', 'error');
        }
    }

    async deleteShareComment(shareId, commentId) {
        try {
            await API.delete(`/posts/share/comments/${commentId}`);

            // Remove comment from DOM
            const commentEl = document.querySelector(`[data-comment-id="${commentId}"]`);
            if (commentEl) commentEl.remove();

            // Update comment count
            const statsEl = document.querySelector(`[data-share-id="${shareId}"] .comments-count`);
            if (statsEl) {
                const count = Math.max(0, parseInt(statsEl.textContent) - 1);
                statsEl.textContent = `${count} ${count === 1 ? 'comment' : 'comments'}`;
            }

            this.showToast('Comment deleted', 'success');
        } catch (error) {
            this.showToast('Failed to delete comment', 'error');
        }
    }

    async likeShareComment(commentId, button) {
        try {
            await API.post(`/posts/share/comments/${commentId}/like`);
            // Update button text
            const match = button.textContent.match(/\((\d+)\)/);
            const currentCount = match ? parseInt(match[1]) : 0;
            button.textContent = `Like (${currentCount + 1})`;
        } catch (error) {
        }
    }

    async showShareLikes(shareId) {
        try {
            const response = await API.get(`/posts/share/${shareId}/likes`);
            const likes = response.likes || [];

            if (likes.length === 0) {
                this.showToast('No likes yet', 'info');
                return;
            }

            // Create modal to show likes
            this.showLikesModal(likes, 'Quote Post Likes');
        } catch (error) {
            this.showToast('Failed to load likes', 'error');
        }
    }

    async sharePost(postId, event) {
        event?.stopPropagation();

        // Remove existing share menu
        const existing = document.querySelector('.share-menu');
        if (existing) existing.remove();

        // Check if user has already reposted
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        const isReposted = postCard?.dataset.userReposted === 'true';

        // Create share menu
        const menu = document.createElement('div');
        menu.className = 'share-menu post-dropdown-menu';
        menu.innerHTML = `
            <div class="dropdown-item ${isReposted ? 'dropdown-item-danger' : ''}" onclick="feedManager.repostPost('${postId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <polyline points="17 1 21 5 17 9"></polyline>
                    <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                    <polyline points="7 23 3 19 7 15"></polyline>
                    <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                </svg>
                ${isReposted ? 'Undo Repost' : 'Repost'}
            </div>
            <div class="dropdown-item" onclick="feedManager.quotePost('${postId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                Quote Post
            </div>
            <div class="dropdown-item" onclick="feedManager.copyPostLink('${postId}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
                Copy Link
            </div>
        `;

        // Position menu near the share button using absolute positioning
        const btn = event?.target?.closest('.post-action-btn');
        if (btn) {
            // Append to the post card for proper scroll behavior
            const postCard = btn.closest('.post-card');
            if (postCard) {
                postCard.style.position = 'relative';
                menu.style.position = 'absolute';
                menu.style.bottom = '60px';
                menu.style.right = '0';
                postCard.appendChild(menu);
            } else {
                document.body.appendChild(menu);
                const rect = btn.getBoundingClientRect();
                menu.style.position = 'fixed';
                menu.style.top = rect.bottom + 5 + 'px';
                menu.style.left = rect.left + 'px';
            }
        } else {
            document.body.appendChild(menu);
        }

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

    async repostPost(postId) {
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        const isReposted = postCard?.dataset.userReposted === 'true';
        const shareBtn = postCard?.querySelector('.post-action-btn:last-of-type');
        const btnStatsEl = shareBtn?.querySelector('.shares-count');
        const postStatsEl = postCard?.querySelector('.post-shares-count');

        try {
            document.querySelector('.share-menu')?.remove();

            if (isReposted) {
                // Undo repost
                await postsAPI.unrepostPost(postId);
                postCard.dataset.userReposted = 'false';
                if (shareBtn) shareBtn.classList.remove('reposted');

                // Update button text
                if (btnStatsEl) {
                    const currentCount = parseInt(postStatsEl?.textContent) || 0;
                    const newCount = Math.max(0, currentCount - 1);
                    btnStatsEl.textContent = `${newCount} ${newCount === 1 ? 'share' : 'shares'}`;
                }

                // Update post stats
                if (postStatsEl) {
                    const currentCount = parseInt(postStatsEl.textContent) || 0;
                    const newCount = Math.max(0, currentCount - 1);
                    postStatsEl.textContent = `${newCount} ${newCount === 1 ? 'share' : 'shares'}`;
                }

                this.showToast('Repost removed', 'success');
            } else {
                // Repost
                const result = await postsAPI.sharePost(postId, 'repost');

                // Handle case where already reposted (shouldn't happen but just in case)
                if (result.already_reposted) {
                    this.showToast('Already reposted', 'info');
                    postCard.dataset.userReposted = 'true';
                    if (shareBtn) shareBtn.classList.add('reposted');
                    if (btnStatsEl) btnStatsEl.textContent = 'Reposted';
                    return;
                }

                postCard.dataset.userReposted = 'true';
                if (shareBtn) shareBtn.classList.add('reposted');
                if (btnStatsEl) btnStatsEl.textContent = 'Reposted';

                // Update post stats counter
                if (postStatsEl) {
                    const currentCount = parseInt(postStatsEl.textContent) || 0;
                    const newCount = currentCount + 1;
                    postStatsEl.textContent = `${newCount} ${newCount === 1 ? 'share' : 'shares'}`;
                }

                this.showToast('Reposted!', 'success');
            }
        } catch (error) {
            this.showToast('Failed to update repost', 'error');
        }
    }

    async quotePost(postId) {
        document.querySelector('.share-menu')?.remove();

        // Get the post data from the post card
        const postCard = document.querySelector(`[data-post-id="${postId}"]`);
        if (!postCard) {
            this.showToast('Post not found', 'error');
            return;
        }

        // Extract post info
        const authorName = postCard.querySelector('.post-user-name')?.textContent.trim() || 'Unknown User';
        const postContent = postCard.querySelector('.post-content p')?.textContent.trim() || '';
        const authorImage = postCard.querySelector('.post-avatar-circle img')?.src;

        // Focus on create post box and add reference to quoted post
        const postInput = document.querySelector('.post-input');
        const createPostBox = document.querySelector('.create-post-box');

        if (postInput && createPostBox) {
            // Scroll to post creation
            createPostBox.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Store the quoted post ID
            postInput.dataset.quotedPost = postId;
            postInput.placeholder = 'Add your thoughts to share this post...';

            // Remove existing preview if any
            const existingPreview = document.getElementById('quote-post-preview');
            if (existingPreview) existingPreview.remove();

            // Create quote preview
            const preview = document.createElement('div');
            preview.id = 'quote-post-preview';
            preview.className = 'quote-post-preview';
            preview.innerHTML = `
                <div class="quote-post-preview-header">
                    <span>Quoting Post</span>
                    <button class="quote-post-preview-close" onclick="feedManager.cancelQuote()">&times;</button>
                </div>
                <div class="quote-post-preview-content">
                    <div class="quote-post-preview-avatar" style="border: 2px solid ${postCard.querySelector('.post-avatar-circle')?.style.borderColor || '#1282a2'}">
                        ${authorImage ?
                            `<img src="${authorImage}" alt="${authorName}">` :
                            `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>`
                        }
                    </div>
                    <div class="quote-post-preview-body">
                        <div class="quote-post-preview-author">${this.escapeHtml(authorName)}</div>
                        <div class="quote-post-preview-text">${this.escapeHtml(postContent.substring(0, 200))}${postContent.length > 200 ? '...' : ''}</div>
                    </div>
                </div>
            `;

            // Insert preview after the textarea, before the post actions row
            const textarea = createPostBox.querySelector('.post-input');
            if (textarea) {
                textarea.parentElement.insertBefore(preview, textarea.nextSibling);
            } else {
                createPostBox.appendChild(preview);
            }

            // Focus on input
            setTimeout(() => postInput.focus(), 300);
        }
    }

    cancelQuote() {
        const preview = document.getElementById('quote-post-preview');
        if (preview) preview.remove();

        const postInput = document.querySelector('.post-input');
        if (postInput) {
            delete postInput.dataset.quotedPost;
            postInput.placeholder = "What's on your mind?";
        }
    }

    async copyPostLink(postId) {
        try {
            const url = `${window.location.origin}/post/${postId}`;
            await navigator.clipboard.writeText(url);
            this.showToast('Link copied!', 'success');
            document.querySelector('.share-menu')?.remove();
        } catch (error) {
            this.showToast('Failed to copy link', 'error');
        }
    }

    async followUser(userId, button) {
        try {
            await followAPI.follow(userId);
            button.textContent = 'Following';
            button.classList.add('following');
            button.onclick = () => this.unfollowUser(userId, button);
            this.showToast('Followed!', 'success');
        } catch (error) {
            this.showToast('Failed to follow', 'error');
        }
    }

    async unfollowUser(userId, button) {
        try {
            await followAPI.unfollow(userId);
            button.textContent = 'Follow';
            button.classList.remove('following');
            button.onclick = () => this.followUser(userId, button);
        } catch (error) {
        }
    }

    showPostMenu(postId, isOwner, event) {
        event.stopPropagation();

        // Remove existing menu
        const existing = document.querySelector('.post-dropdown-menu');
        if (existing) existing.remove();

        const menu = document.createElement('div');
        menu.className = 'post-dropdown-menu';
        menu.innerHTML = `
            ${isOwner ? `
                <div class="dropdown-item" onclick="feedManager.editPost('${postId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                    <span>Edit Post</span>
                </div>
                <div class="dropdown-item" onclick="feedManager.pinPost('${postId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2">
                        <line x1="12" y1="17" x2="12" y2="22"></line>
                        <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path>
                    </svg>
                    <span>Pin Post</span>
                </div>
                <div class="dropdown-item dropdown-item-danger" onclick="feedManager.deletePost('${postId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                    <span>Delete Post</span>
                </div>
            ` : `
                <div class="dropdown-item" onclick="feedManager.reportPost('${postId}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#1282a2" stroke-width="2">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                        <line x1="4" y1="22" x2="4" y2="15"></line>
                    </svg>
                    <span>Report Post</span>
                </div>
            `}
        `;

        document.body.appendChild(menu);

        // Position menu
        const btn = event.target.closest('.post-more-btn');
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

    async deletePost(postId) {
        if (!confirm('Are you sure you want to delete this post?')) return;

        try {
            await postsAPI.deletePost(postId);
            document.querySelector(`[data-post-id="${postId}"]`).remove();
            this.showToast('Post deleted', 'success');
        } catch (error) {
            this.showToast('Failed to delete post', 'error');
        }
    }

    async goToProfile(identifier, role, collegeDivision = null, userId = null, isTransfer = false) {
        // Check if clicking on own profile - just go to my-profile.html
        const targetUserId = userId || identifier;
        if (targetUserId === this.currentUserId) {
            // Determine if we're in tabs folder or not
            const currentPath = window.location.pathname;
            if (currentPath.includes('/tabs/')) {
                window.location.href = 'my-profile.html';
            } else {
                window.location.href = 'tabs/my-profile.html';
            }
            return;
        }

        // Check if identifier is a UUID (user_id) vs a username
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

        // Determine current path context
        const currentPath = window.location.pathname;
        const isInTabsFolder = currentPath.includes('/tabs/');
        const prefix = isInTabsFolder ? '../../' : '../';

        try {
            let username = identifier;

            // If identifier is a UUID, we need to get the username first
            if (isUUID) {
                let endpoint = role === 'coach' ? `/profile/coach/${identifier}` : `/profile/player/${identifier}`;
                const response = await API.get(endpoint);
                if (response.profile) {
                    username = response.profile.username || identifier;
                }
            }

            // Determine the correct folder based on role, college division, and transfer status
            let folder = 'hsplayer';
            const isCollege = collegeDivision && collegeDivision.trim() !== '';

            if (role === 'coach') {
                folder = isCollege ? 'collegecoach' : 'hscoach';
            } else if (role === 'player') {
                if (isTransfer) {
                    folder = 'transferplayer';
                } else {
                    folder = isCollege ? 'collegeplayer' : 'hsplayer';
                }
            } else if (role === 'other') {
                folder = 'other';
            }

            // Navigate to the profile type's folder with cross-folder navigation
            window.location.href = `${prefix}${folder}/tabs/my-profile.html?username=${username}&from=feed`;
        } catch (error) {
            // Fallback: determine folder from role and navigate
            let folder = 'hsplayer';
            const isCollege = collegeDivision && collegeDivision.trim() !== '';
            if (role === 'coach') {
                folder = isCollege ? 'collegecoach' : 'hscoach';
            } else if (role === 'player') {
                if (isTransfer) {
                    folder = 'transferplayer';
                } else {
                    folder = isCollege ? 'collegeplayer' : 'hsplayer';
                }
            } else if (role === 'other') {
                folder = 'other';
            }
            window.location.href = `${prefix}${folder}/tabs/my-profile.html?username=${identifier}&from=feed`;
        }
    }

    // ==================== UTILITY ====================

    async loadMorePosts() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const section = document.getElementById(`${this.currentFeedType}-section`);
            let posts;

            if (this.currentFeedType === 'following') {
                this.followingOffset += 10;
                const response = await postsAPI.getFollowingFeed(10, this.followingOffset);
                posts = response.posts;
            } else {
                this.discoverOffset += 10;
                const response = await postsAPI.getDiscoverFeed(10, this.discoverOffset);
                posts = response.posts;
            }

            if (posts && posts.length > 0) {
                posts.forEach(post => {
                    if (post.is_quote) {
                        section.appendChild(this.createFeedQuotePostElement(post));
                    } else if (post.is_repost) {
                        section.appendChild(this.createFeedRepostElement(post));
                    } else {
                        section.appendChild(this.createPostElement(post));
                    }
                });
            }
        } catch (error) {
        } finally {
            this.isLoading = false;
        }
    }

    showLoading() {
        this.feedContainer.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Loading feed...</p>
            </div>
        `;
    }

    hideLoading() {
        const spinner = this.feedContainer.querySelector('.loading-spinner');
        if (spinner) spinner.remove();
    }

    showError(message) {
        this.feedContainer.innerHTML = `
            <div class="error-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>${message}</p>
                <button onclick="feedManager.loadFeed()">Retry</button>
            </div>
        `;
    }

    showToast(message, type = 'info') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const postTime = new Date(timestamp);
        const seconds = Math.floor((now - postTime) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
        return postTime.toLocaleDateString();
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    openMediaViewer(url) {
        // Legacy single image viewer - redirect to slideshow
        this.openMediaSlideshow([url], 0);
    }

    openMediaSlideshow(urls, startIndex = 0, mediaTypes = []) {
        // Parse URLs and types if passed as string (from HTML attribute)
        const mediaUrls = typeof urls === 'string' ? JSON.parse(urls) : urls;
        const types = typeof mediaTypes === 'string' ? JSON.parse(mediaTypes) : mediaTypes;
        let currentIndex = startIndex;

        const viewer = document.createElement('div');
        viewer.className = 'media-slideshow';

        // Helper to check if URL is video
        const isVideoUrl = (url, index) => {
            if (types && types[index]) {
                return types[index] === 'video';
            }
            const videoExtensions = ['.mp4', '.mov', '.avi', '.webm'];
            return videoExtensions.some(ext => url.toLowerCase().includes(ext));
        };

        // Helper to render media element for slideshow
        const renderMediaContent = (url, index) => {
            if (isVideoUrl(url, index)) {
                return `<video class="slideshow-video" src="${url}" controls autoplay></video>`;
            }
            return `<img class="slideshow-image" src="${url}" alt="Media">`;
        };

        const updateSlide = () => {
            const contentContainer = viewer.querySelector('.slideshow-content');
            const counter = viewer.querySelector('.slideshow-counter');
            const prevBtn = viewer.querySelector('.slideshow-prev');
            const nextBtn = viewer.querySelector('.slideshow-next');

            // Pause any playing video before switching
            const currentVideo = contentContainer.querySelector('video');
            if (currentVideo) {
                currentVideo.pause();
            }

            // Update media content
            const existingMedia = contentContainer.querySelector('.slideshow-image, .slideshow-video');
            if (existingMedia) {
                existingMedia.remove();
            }

            // Insert new media between prev and next buttons
            const newMedia = document.createElement('div');
            newMedia.innerHTML = renderMediaContent(mediaUrls[currentIndex], currentIndex);
            nextBtn.insertAdjacentElement('beforebegin', newMedia.firstChild);

            counter.textContent = `${currentIndex + 1} / ${mediaUrls.length}`;

            // Show/hide nav buttons based on position
            prevBtn.style.visibility = currentIndex === 0 ? 'hidden' : 'visible';
            nextBtn.style.visibility = currentIndex === mediaUrls.length - 1 ? 'hidden' : 'visible';
        };

        const goNext = (e) => {
            e.stopPropagation();
            if (currentIndex < mediaUrls.length - 1) {
                currentIndex++;
                updateSlide();
            }
        };

        const goPrev = (e) => {
            e.stopPropagation();
            if (currentIndex > 0) {
                currentIndex--;
                updateSlide();
            }
        };

        const close = () => {
            // Pause any playing video
            const currentVideo = viewer.querySelector('video');
            if (currentVideo) {
                currentVideo.pause();
            }
            document.removeEventListener('keydown', handleKeydown);
            viewer.remove();
        };

        const handleKeydown = (e) => {
            if (e.key === 'Escape') close();
            if (e.key === 'ArrowRight' && currentIndex < mediaUrls.length - 1) {
                currentIndex++;
                updateSlide();
            }
            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                currentIndex--;
                updateSlide();
            }
        };

        viewer.innerHTML = `
            <div class="slideshow-backdrop"></div>
            <button class="slideshow-close">&times;</button>
            <div class="slideshow-counter">${currentIndex + 1} / ${mediaUrls.length}</div>
            <div class="slideshow-content">
                <button class="slideshow-nav slideshow-prev" ${currentIndex === 0 ? 'style="visibility:hidden"' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                </button>
                ${renderMediaContent(mediaUrls[currentIndex], currentIndex)}
                <button class="slideshow-nav slideshow-next" ${currentIndex === mediaUrls.length - 1 ? 'style="visibility:hidden"' : ''}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                </button>
            </div>
        `;

        document.body.appendChild(viewer);

        // Add event listeners
        viewer.querySelector('.slideshow-backdrop').addEventListener('click', close);
        viewer.querySelector('.slideshow-close').addEventListener('click', close);
        viewer.querySelector('.slideshow-prev').addEventListener('click', goPrev);
        viewer.querySelector('.slideshow-next').addEventListener('click', goNext);
        document.addEventListener('keydown', handleKeydown);
    }

    async toggleCommentLike(commentId, button) {
        const isLiked = button.dataset.liked === 'true';
        const svg = button.querySelector('svg');
        const countSpan = button.querySelector('.comment-like-count');
        let count = parseInt(countSpan.textContent) || 0;

        try {
            if (isLiked) {
                // Unlike
                await postsAPI.unlikeComment(commentId);
                button.dataset.liked = 'false';
                button.classList.remove('liked');
                svg.setAttribute('fill', 'none');
                svg.setAttribute('stroke', 'currentColor');
                count = Math.max(0, count - 1);
            } else {
                // Like
                await postsAPI.likeComment(commentId);
                button.dataset.liked = 'true';
                button.classList.add('liked');
                svg.setAttribute('fill', '#e74c3c');
                svg.setAttribute('stroke', '#e74c3c');
                count += 1;
            }
            countSpan.textContent = count;
        } catch (error) {
        }
    }

    replyToComment(postId, commentId, authorName = '') {
        const input = document.getElementById(`comment-input-${postId}`);
        if (input) {
            input.focus();
            input.placeholder = `Replying to ${authorName}...`;
            input.dataset.replyTo = commentId;

            // Show reply indicator
            const container = input.parentElement;
            let indicator = document.getElementById(`reply-indicator-${postId}`);
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.id = `reply-indicator-${postId}`;
                indicator.className = 'reply-indicator';
                container.insertBefore(indicator, input);
            }
            indicator.innerHTML = `
                <span>Replying to ${authorName}</span>
                <button onclick="feedManager.cancelReply('${postId}')">&times;</button>
            `;
        }
    }

    cancelReply(postId) {
        const input = document.getElementById(`comment-input-${postId}`);
        if (input) {
            input.placeholder = 'Write a comment...';
            delete input.dataset.replyTo;
        }
        const indicator = document.getElementById(`reply-indicator-${postId}`);
        if (indicator) indicator.remove();
    }

    async editPost(postId) {
        // Close post menu
        document.querySelector('.post-dropdown-menu')?.remove();

        try {
            // Fetch the current post data to get media info
            const response = await API.get(`/posts/${postId}`);
            const post = response.post;

            if (!post) {
                this.showToast('Post not found', 'error');
                return;
            }

            // Initialize edit media state
            // media_urls_keys contains original S3 keys, media_urls contains signed URLs for display
            const existingMediaKeys = post.media_urls_keys || [];
            const existingMediaType = post.media_type || null;
            const signedUrls = post.media_urls || post.signed_media_urls || [];

            // Track current media state (S3 keys to keep)
            let currentMediaKeys = [...existingMediaKeys];
            let newMediaFiles = [];
            let newMediaPreviews = [];
            const maxMedia = 4;

            const hasMedia = existingMediaKeys.length > 0;

            // Create edit modal
            const modal = document.createElement('div');
            modal.className = 'feed-modal-overlay';
            modal.id = 'edit-post-modal';
            modal.innerHTML = `
                <div class="feed-modal edit-modal ${hasMedia ? 'with-media' : ''}">
                    <div class="feed-modal-header">
                        <h3>Edit Post</h3>
                        <button class="feed-modal-close" onclick="feedManager.closeModal('edit-post-modal')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="feed-modal-body">
                        <textarea class="edit-post-textarea" id="edit-post-content" placeholder="What's on your mind?">${this.escapeHtml(post.content || '')}</textarea>

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
                                ${this.renderEditMediaItems(existingMediaKeys, signedUrls, existingMediaType, 'post')}
                            </div>
                        </div>

                        <div class="edit-modal-actions">
                            <button class="edit-modal-btn edit-modal-btn-cancel" onclick="feedManager.closeModal('edit-post-modal')">Cancel</button>
                            <button class="edit-modal-btn edit-modal-btn-save" id="save-edit-btn">Save Changes</button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Focus on textarea
            setTimeout(() => {
                const textarea = document.getElementById('edit-post-content');
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

                grid.innerHTML = html;
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
            const mediaInput = document.getElementById('edit-post-media-input');
            mediaInput.addEventListener('change', (e) => {
                const files = Array.from(e.target.files);
                const totalCount = currentMediaKeys.length + newMediaFiles.length;
                const remaining = maxMedia - totalCount;

                if (remaining <= 0) {
                    this.showToast(`Maximum ${maxMedia} media files allowed`, 'error');
                    e.target.value = '';
                    return;
                }

                const filesToAdd = files.slice(0, remaining);
                for (const file of filesToAdd) {
                    if (!this.validateMediaFile(file)) continue;

                    const isVideo = file.type.startsWith('video/');
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

            // Handle save
            document.getElementById('save-edit-btn').onclick = async () => {
                const content = document.getElementById('edit-post-content')?.value.trim();
                if (!content) {
                    this.showToast('Post content cannot be empty', 'error');
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
                        saveBtn.textContent = 'Uploading media...';
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
                            this.showToast('Failed to upload media: ' + uploadError.message, 'error');
                            saveBtn.disabled = false;
                            saveBtn.textContent = 'Save Changes';
                            return;
                        }
                    }

                    // If all media removed, set to null
                    if (finalMediaUrls.length === 0) {
                        finalMediaUrls = null;
                        finalMediaType = null;
                    }

                    await postsAPI.updatePost(postId, {
                        content,
                        media_urls: finalMediaUrls,
                        media_type: finalMediaType
                    });

                    // Cleanup blob URLs
                    newMediaPreviews.forEach(p => URL.revokeObjectURL(p.url));

                    // Fetch updated post data to get signed URLs for media
                    const updatedResponse = await API.get(`/posts/${postId}`);
                    const updatedPost = updatedResponse.post;

                    // Update the post content and media in the DOM
                    const postCard = document.querySelector(`[data-post-id="${postId}"]`);
                    if (postCard) {
                        const postContent = postCard.querySelector('.post-content');
                        if (postContent) {
                            // Build new media HTML
                            const newMediaHtml = updatedPost.media_urls && updatedPost.media_urls.length > 0
                                ? this.buildMediaHtml({ media_urls: updatedPost.media_urls, media_type: updatedPost.media_type })
                                : '';

                            // Rebuild the entire post-content innerHTML (text + media)
                            postContent.innerHTML = `<p>${this.formatContent(content)}</p>${newMediaHtml}`;
                        }
                    }

                    this.closeModal('edit-post-modal');
                    this.showToast('Post updated!', 'success');
                } catch (error) {
                    this.showToast('Failed to update post', 'error');
                    saveBtn.disabled = false;
                    saveBtn.textContent = 'Save Changes';
                }
            };

            // Close on overlay click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    newMediaPreviews.forEach(p => URL.revokeObjectURL(p.url));
                    this.closeModal('edit-post-modal');
                }
            });
        } catch (error) {
            this.showToast('Failed to load post', 'error');
        }
    }

    // saveEditPost is no longer needed as the save handler is now inline in editPost

    async deletePost(postId) {
        // Close post menu
        document.querySelector('.post-dropdown-menu')?.remove();

        // Create delete confirmation modal
        const modal = document.createElement('div');
        modal.className = 'feed-modal-overlay';
        modal.id = 'delete-post-modal';
        modal.innerHTML = `
            <div class="feed-modal">
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
                        <button class="delete-modal-btn delete-modal-btn-cancel" onclick="feedManager.closeModal('delete-post-modal')">Cancel</button>
                        <button class="delete-modal-btn delete-modal-btn-delete" onclick="feedManager.confirmDeletePost('${postId}')">Delete</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal('delete-post-modal');
            }
        });
    }

    async confirmDeletePost(postId) {
        try {
            await postsAPI.deletePost(postId);
            document.querySelector(`[data-post-id="${postId}"]`)?.remove();
            this.closeModal('delete-post-modal');
            this.showToast('Post deleted', 'success');
        } catch (error) {
            this.showToast('Failed to delete post', 'error');
        }
    }

    async showShares(postId) {
        // Create shares modal
        const modal = document.createElement('div');
        modal.className = 'feed-modal-overlay';
        modal.id = 'shares-modal';
        modal.innerHTML = `
            <div class="feed-modal">
                <div class="feed-modal-header">
                    <h3>Shares</h3>
                    <button class="feed-modal-close" onclick="feedManager.closeModal('shares-modal')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="feed-modal-body">
                    <div class="loading-spinner" style="padding: 2rem;">
                        <div class="spinner"></div>
                        <p>Loading shares...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal('shares-modal');
            }
        });

        try {
            const data = await postsAPI.getShares(postId);
            const modalBody = modal.querySelector('.feed-modal-body');

            if (data.all.length === 0) {
                modalBody.innerHTML = `
                    <div class="shares-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="17 1 21 5 17 9"></polyline>
                            <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                            <polyline points="7 23 3 19 7 15"></polyline>
                            <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                        </svg>
                        <p>No one has shared this post yet</p>
                    </div>
                `;
                return;
            }

            // Render tabs and share lists
            modalBody.innerHTML = `
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
                <div class="shares-list" id="shares-list-content">
                    ${this.renderSharesList(data.all)}
                </div>
            `;

            // Tab switching
            modalBody.querySelectorAll('.shares-tab').forEach(tab => {
                tab.addEventListener('click', () => {
                    modalBody.querySelectorAll('.shares-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');

                    const type = tab.dataset.type;
                    let listToShow = data.all;
                    if (type === 'reposts') listToShow = data.reposts;
                    if (type === 'quotes') listToShow = data.quotes;

                    document.getElementById('shares-list-content').innerHTML = this.renderSharesList(listToShow);
                });
            });

        } catch (error) {
            const modalBody = modal.querySelector('.feed-modal-body');
            modalBody.innerHTML = `
                <div class="shares-empty">
                    <p>Failed to load shares</p>
                </div>
            `;
        }
    }

    renderSharesList(shares) {
        if (shares.length === 0) {
            return `
                <div class="shares-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="17 1 21 5 17 9"></polyline>
                        <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                        <polyline points="7 23 3 19 7 15"></polyline>
                        <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
                    </svg>
                    <p>No shares in this category</p>
                </div>
            `;
        }

        return shares.map(share => `
            <div class="share-item" onclick="feedManager.goToProfile('${share.username || share.user_id}', '${share.role}', '${share.college_division || ''}', '${share.user_id}', ${share.transfer === 'y'}); feedManager.closeModal('shares-modal');">
                <div class="share-item-avatar" style="border: 2px solid ${getRoleBorderColor(share.role, share.transfer === 'y', share.college_division)}">
                    ${share.profile_image_url ?
                        `<img src="${share.profile_image_url}" alt="${share.first_name}">` :
                        `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>`
                    }
                </div>
                <div class="share-item-info">
                    <div class="share-item-name">${share.first_name || ''} ${share.last_name || ''}</div>
                    <div class="share-item-meta">
                        ${share.position ? share.position + ' â€¢ ' : ''}${share.school || ''}
                        ${share.share_type === 'quote' ? ' â€¢ Quote' : ' â€¢ Repost'}
                    </div>
                    ${share.share_type === 'quote' && share.quote_content ? `
                        <div class="share-item-quote">"${this.escapeHtml(share.quote_content.substring(0, 100))}${share.quote_content.length > 100 ? '...' : ''}"</div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    async showLikes(postId) {
        // Create likes modal
        const modal = document.createElement('div');
        modal.className = 'feed-modal-overlay';
        modal.id = 'likes-modal';
        modal.innerHTML = `
            <div class="feed-modal">
                <div class="feed-modal-header">
                    <h3>Likes</h3>
                    <button class="feed-modal-close" onclick="feedManager.closeModal('likes-modal')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>
                <div class="feed-modal-body">
                    <div class="loading-spinner" style="padding: 2rem;">
                        <div class="spinner"></div>
                        <p>Loading likes...</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal('likes-modal');
            }
        });

        try {
            const data = await postsAPI.getLikes(postId);
            const modalBody = modal.querySelector('.feed-modal-body');

            if (!data.likes || data.likes.length === 0) {
                modalBody.innerHTML = `
                    <div class="shares-empty">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                        </svg>
                        <p>No likes yet</p>
                    </div>
                `;
                return;
            }

            modalBody.innerHTML = `
                <div class="shares-list">
                    ${data.likes.map(like => `
                        <div class="share-item" onclick="feedManager.goToProfile('${like.username || like.id}', '${like.role}', '${like.college_division || ''}', '${like.id}', ${like.transfer === 'y'}); feedManager.closeModal('likes-modal');">
                            <div class="share-item-avatar" style="border: 2px solid ${getRoleBorderColor(like.role, like.transfer === 'y', like.college_division)}">
                                ${like.profile_image_url ?
                                    `<img src="${like.profile_image_url}" alt="${like.first_name}">` :
                                    `<svg viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>`
                                }
                            </div>
                            <div class="share-item-info">
                                <div class="share-item-name">${like.first_name || ''} ${like.last_name || ''}</div>
                                <div class="share-item-meta">${like.role === 'coach' ? 'Coach' : 'Player'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;

        } catch (error) {
            const modalBody = modal.querySelector('.feed-modal-body');
            modalBody.innerHTML = `
                <div class="shares-empty">
                    <p>Failed to load likes</p>
                </div>
            `;
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.remove();
    }

    pinPost(postId) {
        postsAPI.pinPost(postId).then(() => {
            this.showToast('Post pinned to your profile!', 'success');
        }).catch(() => {
            this.showToast('Failed to pin post', 'error');
        });
    }

    reportPost(postId) {
        this.showToast('Report feature coming soon!', 'info');
    }

    // Navigate to single post view page
    // For quote posts, pass shareId to view the quote post itself (not just the original)
    navigateToPostView(postId, event, shareId = null) {
        // Safety check - if there's no postId, don't navigate
        if (!postId && !shareId) {
            return;
        }

        // Determine the correct path based on current location
        const currentPath = window.location.pathname;
        let basePath = '';

        if (currentPath.includes('/hsplayer/')) {
            basePath = currentPath.includes('/tabs/') ? '' : 'tabs/';
        } else if (currentPath.includes('/hscoach/')) {
            basePath = currentPath.includes('/tabs/') ? '' : 'tabs/';
        } else if (currentPath.includes('/collegeplayer/')) {
            basePath = currentPath.includes('/tabs/') ? '' : 'tabs/';
        } else if (currentPath.includes('/collegecoach/')) {
            basePath = currentPath.includes('/tabs/') ? '' : 'tabs/';
        } else if (currentPath.includes('/transferplayer/')) {
            basePath = currentPath.includes('/tabs/') ? '' : 'tabs/';
        } else if (currentPath.includes('/other/')) {
            basePath = currentPath.includes('/tabs/') ? '' : 'tabs/';
        }

        // If shareId is provided (quote post), navigate with share parameter
        if (shareId) {
            window.location.href = `${basePath}post-view.html?share=${shareId}&ref=feed`;
        } else {
            window.location.href = `${basePath}post-view.html?id=${postId}&ref=feed`;
        }
    }
}

// Initialize feed manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on a page with feed container
    if (document.getElementById('feedPosts')) {
        feedManager = new FeedManager();
    }
});

// Handle back/forward cache - ensure feedManager is available when page is restored from bfcache
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        // Page was restored from bfcache - always reinitialize to ensure fresh event listeners
        if (document.getElementById('feedPosts')) {
            feedManager = new FeedManager();
        }
    }
});

// Event delegation for post content clicks - using capture phase for maximum reliability
// The capture phase fires before bubbling, ensuring we catch the event first
document.addEventListener('click', (event) => {
    // Handle clicks on the arrow icon first (most specific)
    const viewIcon = event.target.closest('.post-view-icon');
    if (viewIcon) {
        const postId = viewIcon.dataset.postId;
        const shareId = viewIcon.dataset.shareId; // For quote posts
        if ((postId || shareId) && feedManager) {
            event.preventDefault();
            event.stopPropagation();
            feedManager.navigateToPostView(postId, event, shareId);
            return;
        }
    }

    // Check if click is on post-content or inside it (for text area clicks)
    const postContent = event.target.closest('.post-content');
    if (postContent && feedManager) {
        // Don't navigate if clicking directly on interactive media elements
        const isVideo = event.target.closest('video');
        const isLink = event.target.closest('a');
        const isButton = event.target.closest('button');
        const isImage = event.target.tagName === 'IMG'; // Only if clicking directly on the image itself
        const isMediaWrapper = event.target.closest('.media-wrapper'); // Multi-media wrapper with click handler

        // Allow slideshow to handle direct clicks on images or media wrappers
        // But clicking on .post-media padding/background should navigate to post view
        if (isVideo || isLink || isButton || isImage || isMediaWrapper) {
            return;
        }

        const postId = postContent.dataset.postId;
        const shareId = postContent.dataset.shareId; // For quote posts
        if (postId || shareId) {
            event.preventDefault();
            feedManager.navigateToPostView(postId, event, shareId);
        }
        return;
    }

    // Handle clicks anywhere on feed quote post cards (for areas outside post-content)
    const quoteCard = event.target.closest('.feed-quote-card');
    if (quoteCard && feedManager) {
        // Don't navigate if clicking on interactive elements
        const isButton = event.target.closest('button');
        const isLink = event.target.closest('a');
        const isInput = event.target.closest('input');
        const isStats = event.target.closest('.post-stats');
        const isActions = event.target.closest('.post-actions-bar');
        const isComments = event.target.closest('.post-comments-section');
        // Also exclude media elements to allow slideshow to work
        const isMedia = event.target.closest('.media-grid-cell, .post-media-grid, video, img');
        const isQuotedPost = event.target.closest('.quoted-post-embed');

        if (isButton || isLink || isInput || isStats || isActions || isComments || isMedia || isQuotedPost) {
            return;
        }

        const postId = quoteCard.dataset.postId;
        const shareId = quoteCard.dataset.shareId;
        if (shareId) {
            event.preventDefault();
            feedManager.navigateToPostView(postId, event, shareId);
        }
    }
}, true); // Use capture phase
