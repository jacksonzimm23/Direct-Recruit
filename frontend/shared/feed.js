// Feed System - Dynamic Post Loading and Creation
// This file handles all feed-related functionality for both player and coach dashboards

class FeedManager {
    constructor() {
        this.feedContainer = document.getElementById('feedPosts');
        this.createPostBtn = document.querySelector('.btn-post-submit');
        this.postInput = document.querySelector('textarea.post-input');
        this.currentUserId = null;
        this.currentUserData = null;

        this.init();
    }

    async init() {
        // Get current user info
        await this.loadCurrentUser();

        // Load initial feed
        await this.loadFeed();

        // Set up event listeners
        this.setupEventListeners();

        // Debug: Log elements to verify they were found
        console.log('Feed initialized');
        console.log('Post button:', this.createPostBtn);
        console.log('Post input:', this.postInput);
    }

    async loadCurrentUser() {
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                window.location.href = '../landingpage/signin.html';
                return;
            }

            // Decode JWT to get user ID (simple decode, not validation)
            const payload = JSON.parse(atob(token.split('.')[1]));
            this.currentUserId = payload.userId;

            // Store for later use
            this.currentUserData = {
                userId: payload.userId,
                role: payload.role
            };

            // Update sidebar footer with user info
            await this.updateSidebarFooter();
        } catch (error) {
            console.error('Error loading user:', error);
            window.location.href = '../landingpage/signin.html';
        }
    }

    async updateSidebarFooter() {
        try {
            const response = await API.get('/auth/me');
            if (response.user && response.profile) {
                const profile = response.profile;
                const userRole = response.user.role;

                // Update name
                const userName = document.querySelector('.sidebar-footer .user-name');
                if (userName) {
                    userName.textContent = `${profile.first_name} ${profile.last_name}`;
                }

                // Update role/info line
                const userRoleElement = document.querySelector('.sidebar-footer .user-role');
                if (userRoleElement) {
                    const parts = [];

                    if (userRole === 'player') {
                        // Player: Position, Height, Weight, State
                        if (profile.position) parts.push(profile.position);
                        if (profile.height) parts.push(profile.height);
                        if (profile.weight) parts.push(`${profile.weight} lbs`);
                        if (profile.state) parts.push(profile.state);
                    } else if (userRole === 'coach') {
                        // Coach: School name, State
                        if (profile.college_name) parts.push(profile.college_name);
                        if (profile.state) parts.push(profile.state);
                    }

                    userRoleElement.textContent = parts.join(', ') || (userRole === 'player' ? 'Player' : 'Coach');
                }

                // Update avatar if available
                if (profile.profile_image_url) {
                    const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
                    if (avatarElement) {
                        avatarElement.innerHTML = `<img src="${profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                    }
                }
            }
        } catch (error) {
            console.error('Error updating sidebar footer:', error);
        }
    }

    setupEventListeners() {
        // Create post button
        if (this.createPostBtn) {
            this.createPostBtn.addEventListener('click', () => this.createPost());
        }

        // Allow Enter + Shift to submit
        if (this.postInput) {
            this.postInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                    e.preventDefault();
                    this.createPost();
                }
            });
        }

        // Post button in sidebar
        const sidebarPostBtn = document.querySelector('.btn-post');
        if (sidebarPostBtn) {
            sidebarPostBtn.addEventListener('click', () => {
                this.postInput?.focus();
                this.postInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }

    async loadFeed() {
        try {
            // Show loading spinner
            this.showLoading();

            const response = await postsAPI.getFeed();

            // Hide loading spinner
            this.hideLoading();

            if (response.posts && response.posts.length > 0) {
                this.renderPosts(response.posts);
            } else {
                this.showEmptyState();
            }
        } catch (error) {
            console.error('Error loading feed:', error);
            this.hideLoading();
            this.showError('Failed to load feed. Please refresh the page.');
        }
    }

    renderPosts(posts) {
        this.feedContainer.innerHTML = '';

        posts.forEach(post => {
            const postElement = this.createPostElement(post);
            this.feedContainer.appendChild(postElement);
        });
    }

    createPostElement(post) {
        const article = document.createElement('article');
        article.className = 'post-card';
        article.dataset.postId = post.id;

        const timeAgo = this.getTimeAgo(post.created_at);
        const isLiked = post.user_liked || false;

        article.innerHTML = `
            <div class="post-header">
                <div class="post-avatar-circle">
                    ${post.profile_image_url ?
                        `<img src="${post.profile_image_url}" alt="${post.author_name}">` :
                        `<svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>`
                    }
                </div>
                <div class="post-user-info">
                    <div class="post-user-name">
                        ${post.author_name || 'Unknown User'}
                        ${post.author_verified ? `
                            <svg class="verified-badge" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/>
                            </svg>
                        ` : ''}
                    </div>
                    <div class="post-meta ${post.author_role === 'coach' ? 'coach-meta' : 'player-meta'}">
                        ${post.author_role === 'player' ?
                            `${post.author_position || ''} ${post.author_school || ''} • ${timeAgo}` :
                            `${post.author_title || 'Coach'} • ${post.author_school || ''} • ${timeAgo}`
                        }
                    </div>
                </div>
                ${post.user_id === this.currentUserId ? `
                    <button class="post-more-btn" onclick="feedManager.deletePost('${post.id}')">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="19" cy="12" r="1"></circle>
                            <circle cx="5" cy="12" r="1"></circle>
                        </svg>
                    </button>
                ` : ''}
            </div>
            <div class="post-content">
                <p>${this.escapeHtml(post.content)}</p>
                ${post.media_url ? `
                    <div class="post-image">
                        <img src="${post.media_url}" alt="Post media">
                    </div>
                ` : ''}
            </div>
            <div class="post-stats">
                <span>${post.likes_count || 0} ${post.likes_count === 1 ? 'like' : 'likes'}</span>
                ${post.comments_count > 0 ?
                    `<span class="comments-link" onclick="feedManager.toggleComments('${post.id}')" style="cursor: pointer; color: var(--cerulean);">${post.comments_count} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>` :
                    `<span>${post.comments_count || 0} ${post.comments_count === 1 ? 'comment' : 'comments'}</span>`
                }
            </div>
            <div class="post-actions-bar">
                <button class="post-action-btn ${isLiked ? 'liked' : ''}" onclick="feedManager.toggleLike('${post.id}', this)">
                    <svg viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                    </svg>
                    <span>${isLiked ? 'Liked' : 'Like'}</span>
                </button>
                <button class="post-action-btn" onclick="feedManager.toggleComments('${post.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Comment</span>
                </button>
                <button class="post-action-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                        <polyline points="16 6 12 2 8 6"></polyline>
                        <line x1="12" y1="2" x2="12" y2="15"></line>
                    </svg>
                    <span>Share</span>
                </button>
            </div>
            <div class="post-comments" id="comments-${post.id}" style="display: none;">
                <!-- Comments will be loaded here -->
            </div>
        `;

        return article;
    }

    async createPost() {
        const content = this.postInput?.value.trim();

        console.log('Create post clicked');
        console.log('Post input element:', this.postInput);
        console.log('Post content:', content);

        if (!content) {
            alert('Please write something before posting!');
            return;
        }

        try {
            this.createPostBtn.disabled = true;
            this.createPostBtn.textContent = 'Posting...';

            const postData = {
                content: content
            };

            console.log('Sending post data:', postData);
            const response = await postsAPI.createPost(postData);
            console.log('Post created successfully:', response);

            // Clear input
            this.postInput.value = '';

            // Reload feed to show new post
            await this.loadFeed();

            // Scroll to top to see new post
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (error) {
            console.error('Error creating post:', error);
            alert('Failed to create post. Please try again.');
        } finally {
            this.createPostBtn.disabled = false;
            this.createPostBtn.textContent = 'Post';
        }
    }

    async toggleLike(postId, buttonElement) {
        try {
            console.log('Toggle like clicked for post:', postId);
            console.log('Button element:', buttonElement);

            const isLiked = buttonElement.classList.contains('liked');
            console.log('Is currently liked:', isLiked);

            if (isLiked) {
                console.log('Unliking post...');
                const result = await postsAPI.unlikePost(postId);
                console.log('Unlike result:', result);
            } else {
                console.log('Liking post...');
                const result = await postsAPI.likePost(postId);
                console.log('Like result:', result);
            }

            console.log('Like toggled successfully, reloading feed...');
            // Reload feed to update counts
            await this.loadFeed();
            console.log('Feed reloaded');

        } catch (error) {
            console.error('Error toggling like:', error);
            alert('Failed to update like. Please try again.');
        }
    }

    async toggleComments(postId) {
        const commentsSection = document.getElementById(`comments-${postId}`);

        if (commentsSection.style.display === 'none') {
            // Load and show comments
            await this.loadComments(postId);
            commentsSection.style.display = 'block';
        } else {
            // Hide comments
            commentsSection.style.display = 'none';
        }
    }

    async loadComments(postId) {
        try {
            const response = await postsAPI.getComments(postId);
            console.log('Comments response:', response);
            const commentsSection = document.getElementById(`comments-${postId}`);

            if (response.comments && response.comments.length > 0) {
                commentsSection.innerHTML = `
                    <div class="comments-list">
                        ${response.comments.map(comment => {
                            console.log('Processing comment:', comment);
                            const authorName = `${comment.author_first_name || ''} ${comment.author_last_name || ''}`.trim() || 'Unknown User';
                            const commentContent = comment.content || '';
                            console.log('Comment content:', commentContent);
                            return `
                                <div class="comment">
                                    <div class="comment-author">${authorName}</div>
                                    <div class="comment-content">${this.escapeHtml(commentContent)}</div>
                                    <div class="comment-time">${this.getTimeAgo(comment.created_at)}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    <div class="comment-input-container">
                        <input type="text" placeholder="Write a comment..." class="comment-input" id="comment-input-${postId}">
                        <button onclick="feedManager.addComment('${postId}')">Post</button>
                    </div>
                `;
            } else {
                commentsSection.innerHTML = `
                    <div class="no-comments">No comments yet. Be the first to comment!</div>
                    <div class="comment-input-container">
                        <input type="text" placeholder="Write a comment..." class="comment-input" id="comment-input-${postId}">
                        <button onclick="feedManager.addComment('${postId}')">Post</button>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading comments:', error);
        }
    }

    async addComment(postId) {
        const input = document.getElementById(`comment-input-${postId}`);
        const content = input?.value.trim();

        if (!content) return;

        try {
            await postsAPI.addComment(postId, content);
            await this.loadComments(postId);
            await this.loadFeed(); // Reload to update comment counts
        } catch (error) {
            console.error('Error adding comment:', error);
            alert('Failed to add comment. Please try again.');
        }
    }

    async deletePost(postId) {
        if (!confirm('Are you sure you want to delete this post?')) {
            return;
        }

        try {
            await postsAPI.deletePost(postId);
            await this.loadFeed();
        } catch (error) {
            console.error('Error deleting post:', error);
            alert('Failed to delete post. Please try again.');
        }
    }

    showLoading() {
        this.feedContainer.innerHTML = `
            <div class="loading-spinner">
                <div class="spinner"></div>
                <p>Loading posts...</p>
            </div>
        `;
    }

    hideLoading() {
        const spinner = this.feedContainer.querySelector('.loading-spinner');
        if (spinner) {
            spinner.remove();
        }
    }

    showEmptyState() {
        this.feedContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <h3>No posts yet</h3>
                <p>Be the first to share an update!</p>
            </div>
        `;
    }

    showError(message) {
        this.feedContainer.innerHTML = `
            <div class="error-state">
                <p>${message}</p>
                <button onclick="feedManager.loadFeed()">Retry</button>
            </div>
        `;
    }

    getTimeAgo(timestamp) {
        const now = new Date();
        const postTime = new Date(timestamp);
        const seconds = Math.floor((now - postTime) / 1000);

        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return postTime.toLocaleDateString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize feed manager when DOM is loaded
let feedManager;
document.addEventListener('DOMContentLoaded', () => {
    feedManager = new FeedManager();
});
