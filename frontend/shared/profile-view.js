let currentProfile = null;
let currentUserId = null;
let currentUserRole = null;
let isCollegeCoach = false;
let isFollowing = false;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');
    const userId = urlParams.get('userId');

    if (!username && !userId) {
        showError('No profile specified');
        return;
    }

    await loadCurrentUser();
    if (username) {
        await loadProfileByUsername(username);
    } else {
        await loadProfileByUserId(userId);
    }

    setupBackButton();
});

async function loadCurrentUser() {
    try {
        const response = await API.get('/auth/me');
        if (response.user) {
            currentUserId = response.user.id;
            currentUserRole = response.user.role;
            isCollegeCoach = response.user.is_college_coach || false;
        }
    } catch (error) {
        console.error('Failed to load current user:', error);
    }
}

async function loadProfileByUsername(username) {
    try {
        const response = await API.get(`/profile/username/${username}`);
        if (response.profile) {
            currentProfile = response.profile;
            await displayProfile(response.profile, response.type);
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
        const userResponse = await API.get(`/profile/player/${userId}`);
        if (userResponse.profile) {
            currentProfile = userResponse.profile;
            await displayProfile(userResponse.profile, 'player');
            return;
        }
    } catch (error) {
        console.error('Not a player profile, trying coach...');
    }

    try {
        const userResponse = await API.get(`/profile/coach/${userId}`);
        if (userResponse.profile) {
            currentProfile = userResponse.profile;
            await displayProfile(userResponse.profile, 'coach');
            return;
        }
    } catch (error) {
        console.error('Error loading profile:', error);
    }

    showError('Profile not found');
}

async function displayProfile(profile, type) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('profileContent').style.display = 'block';

    document.getElementById('profileName').textContent = `${profile.first_name} ${profile.last_name}`;
    document.getElementById('profileUsername').textContent = `@${profile.username || 'no-username'}`;

    if (profile.profile_image_url) {
        document.getElementById('profileImage').src = profile.profile_image_url;
    }

    if (type === 'player') {
        displayPlayerProfile(profile);
    } else {
        displayCoachProfile(profile);
    }

    document.getElementById('bio').textContent = profile.bio || 'No bio provided';

    await loadFollowStats(profile.user_id);
    await loadUserPosts(profile.user_id);
    await checkFollowStatus(profile.user_id);

    setupFollowButton(profile.user_id);
    setupMessageButton(profile.user_id);
}

function displayPlayerProfile(profile) {
    const subtitle = [];
    if (profile.position) subtitle.push(profile.position);
    if (profile.high_school) subtitle.push(profile.high_school);
    if (profile.graduation_year) subtitle.push(`Class of ${profile.graduation_year}`);

    document.getElementById('profileSubtitle').textContent = subtitle.join(' • ');

    // Only show academic info if viewer is a COLLEGE COACH OR viewing their own profile
    const isOwnProfile = currentUserId === profile.user_id;
    const canViewAcademics = isCollegeCoach || isOwnProfile;

    const fields = [
        { label: 'Position', value: profile.position },
        { label: 'High School', value: profile.high_school },
        { label: 'Graduation Year', value: profile.graduation_year },
        { label: 'Location', value: profile.city && profile.state ? `${profile.city}, ${profile.state}` : null },
        { label: 'Height', value: profile.height ? `${Math.floor(profile.height / 12)}'${profile.height % 12}"` : null },
        { label: 'Weight', value: profile.weight ? `${profile.weight} lbs` : null },
    ];

    // Only add academic fields if viewer has permission (college coach or own profile)
    if (canViewAcademics) {
        fields.push({ label: 'GPA', value: profile.gpa });
        fields.push({ label: 'SAT', value: profile.sat_score });
        fields.push({ label: 'ACT', value: profile.act_score });
    }

    displayFields(fields);

    if (profile.hudl_profile || profile.twitter_handle || profile.instagram_handle) {
        const socialLinks = [];
        if (profile.hudl_profile) socialLinks.push(`<a href="${profile.hudl_profile}" target="_blank">Hudl</a>`);
        if (profile.twitter_handle) socialLinks.push(`<a href="https://twitter.com/${profile.twitter_handle}" target="_blank">Twitter</a>`);
        if (profile.instagram_handle) socialLinks.push(`<a href="https://instagram.com/${profile.instagram_handle}" target="_blank">Instagram</a>`);

        const socialField = document.createElement('div');
        socialField.className = 'field';
        socialField.innerHTML = `
            <div class="field-label">Social Links</div>
            <div class="field-value">${socialLinks.join(' • ')}</div>
        `;
        document.getElementById('profileFields').appendChild(socialField);
    }
}

function displayCoachProfile(profile) {
    const subtitle = [];
    if (profile.position_title) subtitle.push(profile.position_title);
    if (profile.college_name) subtitle.push(profile.college_name);
    if (profile.college_division) subtitle.push(profile.college_division);

    document.getElementById('profileSubtitle').textContent = subtitle.join(' • ');

    const fields = [
        { label: 'Title', value: profile.position_title },
        { label: 'College', value: profile.college_name },
        { label: 'Division', value: profile.college_division },
        { label: 'Location', value: profile.city && profile.state ? `${profile.city}, ${profile.state}` : null },
        { label: 'Phone', value: profile.phone },
        { label: 'Verified', value: profile.verified ? 'Yes ✓' : 'No' },
    ];

    displayFields(fields);
}

function displayFields(fields) {
    const fieldsContainer = document.getElementById('profileFields');
    fieldsContainer.innerHTML = '';

    fields.forEach(field => {
        if (field.value) {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field';
            fieldDiv.innerHTML = `
                <div class="field-label">${field.label}</div>
                <div class="field-value">${field.value}</div>
            `;
            fieldsContainer.appendChild(fieldDiv);
        }
    });
}

async function loadFollowStats(userId) {
    try {
        const response = await API.get(`/follow/${userId}/counts`);
        document.getElementById('followersCount').textContent = response.followers_count || 0;
        document.getElementById('followingCount').textContent = response.following_count || 0;
    } catch (error) {
        console.error('Error loading follow stats:', error);
    }
}

async function loadUserPosts(userId) {
    try {
        const response = await API.get(`/posts/user/${userId}`);
        const postsContainer = document.getElementById('userPosts');

        if (!response.posts || response.posts.length === 0) {
            postsContainer.innerHTML = '<div class="no-posts">No posts yet</div>';
            document.getElementById('postsCount').textContent = '0';
            return;
        }

        document.getElementById('postsCount').textContent = response.posts.length;

        // Render interactive posts
        postsContainer.innerHTML = '';
        response.posts.forEach(post => {
            const postElement = createInteractivePost(post);
            postsContainer.appendChild(postElement);
        });
    } catch (error) {
        console.error('Error loading posts:', error);
        document.getElementById('userPosts').innerHTML = '<div class="no-posts">Failed to load posts</div>';
    }
}

function createInteractivePost(post) {
    const article = document.createElement('article');
    article.className = 'post-item';
    article.dataset.postId = post.id;

    const timeAgo = formatDate(post.created_at);
    const isLiked = post.user_liked || false;

    article.innerHTML = `
        <div class="post-header">
            <div class="post-user-info">
                <div class="post-user-name">${post.author_name || currentProfile.first_name + ' ' + currentProfile.last_name}</div>
                <div class="post-time">${timeAgo}</div>
            </div>
        </div>
        <div class="post-content">${escapeHtml(post.content)}</div>
        <div class="post-stats">
            <span>${post.likes_count || 0} likes</span>
            <span>${post.comments_count || 0} comments</span>
        </div>
        <div class="post-actions-bar">
            <button class="post-action-btn like-btn ${isLiked ? 'liked' : ''}" data-post-id="${post.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
                <span>${isLiked ? 'Liked' : 'Like'}</span>
            </button>
            <button class="post-action-btn comment-btn" data-post-id="${post.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Comment</span>
            </button>
        </div>
        <div class="post-comments" id="comments-${post.id}" style="display: none;">
            <div class="comments-list" id="comments-list-${post.id}"></div>
            <div class="comment-input-container">
                <input type="text" class="comment-input" placeholder="Write a comment..." id="comment-input-${post.id}">
                <button class="comment-submit-btn" data-post-id="${post.id}">Post</button>
            </div>
        </div>
    `;

    // Add event listeners
    setupPostInteractions(article, post.id);

    return article;
}

function setupPostInteractions(postElement, postId) {
    // Like button
    const likeBtn = postElement.querySelector('.like-btn');
    if (likeBtn) {
        likeBtn.addEventListener('click', async () => {
            try {
                const isLiked = likeBtn.classList.contains('liked');
                if (isLiked) {
                    await API.delete(`/posts/${postId}/like`);
                    likeBtn.classList.remove('liked');
                    likeBtn.querySelector('span').textContent = 'Like';
                } else {
                    await API.post(`/posts/${postId}/like`);
                    likeBtn.classList.add('liked');
                    likeBtn.querySelector('span').textContent = 'Liked';
                }

                // Update like count
                const stats = postElement.querySelector('.post-stats span:first-child');
                const currentCount = parseInt(stats.textContent.split(' ')[0]);
                stats.textContent = `${isLiked ? currentCount - 1 : currentCount + 1} likes`;
            } catch (error) {
                console.error('Error toggling like:', error);
            }
        });
    }

    // Comment button
    const commentBtn = postElement.querySelector('.comment-btn');
    const commentsSection = postElement.querySelector(`#comments-${postId}`);
    if (commentBtn && commentsSection) {
        commentBtn.addEventListener('click', async () => {
            if (commentsSection.style.display === 'none') {
                commentsSection.style.display = 'block';
                await loadPostComments(postId);
            } else {
                commentsSection.style.display = 'none';
            }
        });
    }

    // Comment submit
    const commentSubmitBtn = postElement.querySelector('.comment-submit-btn');
    const commentInput = postElement.querySelector(`#comment-input-${postId}`);
    if (commentSubmitBtn && commentInput) {
        commentSubmitBtn.addEventListener('click', async () => {
            const content = commentInput.value.trim();
            if (content) {
                try {
                    await API.post(`/posts/${postId}/comments`, { content });
                    commentInput.value = '';
                    await loadPostComments(postId);

                    // Update comment count
                    const stats = postElement.querySelector('.post-stats span:last-child');
                    const currentCount = parseInt(stats.textContent.split(' ')[0]);
                    stats.textContent = `${currentCount + 1} comments`;
                } catch (error) {
                    console.error('Error posting comment:', error);
                }
            }
        });

        // Enter key to submit
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                commentSubmitBtn.click();
            }
        });
    }
}

async function loadPostComments(postId) {
    try {
        const response = await API.get(`/posts/${postId}/comments`);
        const commentsList = document.getElementById(`comments-list-${postId}`);

        if (!response.comments || response.comments.length === 0) {
            commentsList.innerHTML = '<div class="no-comments">No comments yet</div>';
            return;
        }

        commentsList.innerHTML = response.comments.map(comment => `
            <div class="comment">
                <div class="comment-author">${comment.author_first_name} ${comment.author_last_name}</div>
                <div class="comment-content">${escapeHtml(comment.content)}</div>
                <div class="comment-time">${formatDate(comment.created_at)}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading comments:', error);
    }
}

async function checkFollowStatus(userId) {
    if (!currentUserId || currentUserId === userId) {
        document.getElementById('followBtn').style.display = 'none';
        return;
    }

    try {
        const response = await API.get(`/follow/${userId}/check`);
        isFollowing = response.isFollowing;
        updateFollowButton();
    } catch (error) {
        console.error('Error checking follow status:', error);
    }
}

function setupFollowButton(userId) {
    const followBtn = document.getElementById('followBtn');

    if (!currentUserId || currentUserId === userId) {
        followBtn.style.display = 'none';
        return;
    }

    followBtn.addEventListener('click', async () => {
        try {
            if (isFollowing) {
                await API.delete(`/follow/${userId}`);
                isFollowing = false;
            } else {
                await API.post(`/follow/${userId}`);
                isFollowing = true;
            }
            updateFollowButton();
            await loadFollowStats(userId);
        } catch (error) {
            console.error('Error toggling follow:', error);
            alert('Failed to update follow status');
        }
    });
}

function updateFollowButton() {
    const followBtn = document.getElementById('followBtn');
    if (isFollowing) {
        followBtn.textContent = 'Following';
        followBtn.classList.add('following');
    } else {
        followBtn.textContent = 'Follow';
        followBtn.classList.remove('following');
    }
}

function setupMessageButton(userId) {
    const messageBtn = document.getElementById('messageBtn');

    if (!currentUserId || currentUserId === userId) {
        messageBtn.style.display = 'none';
        return;
    }

    messageBtn.addEventListener('click', () => {
        window.location.href = `/messages.html?userId=${userId}`;
    });
}

function setupBackButton() {
    const backLink = document.getElementById('backLink');
    backLink.addEventListener('click', (e) => {
        e.preventDefault();
        window.history.back();
    });
}

function showError(message) {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('errorState').style.display = 'block';
    const errorState = document.getElementById('errorState');
    errorState.querySelector('p').textContent = message;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
