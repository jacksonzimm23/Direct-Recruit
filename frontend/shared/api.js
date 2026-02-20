// API Configuration
// Use 127.0.0.1 to match the frontend origin for proper cookie handling
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5000/api'
    : `${window.location.origin}/api`;

// Storage keys
const USER_KEY = 'user_data';

// Get stored user data
function getUser() {
    const userData = localStorage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
}

// Store user data
function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Clear auth data (user data from localStorage, cookie cleared by backend)
function clearAuth() {
    localStorage.removeItem(USER_KEY);
}

// Check if user is authenticated (based on cached user data)
// For actual validation, use authAPI.getCurrentUser()
function isAuthenticated() {
    return !!getUser();
}

// API Request wrapper
async function apiRequest(endpoint, options = {}) {
    const config = {
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        const isJson = contentType && contentType.includes('application/json');

        let data;
        if (isJson) {
            data = await response.json();
        } else {
            // Handle plain text responses (like rate limit errors)
            const text = await response.text();
            data = { error: text };
        }

        if (!response.ok) {
            // Handle validation errors array
            if (data.errors && Array.isArray(data.errors)) {
                const errorMessages = data.errors.map(e => e.msg).join(', ');
                console.error('Validation errors:', data.errors);
                throw new Error(errorMessages);
            }
            throw new Error(data.error || data.message || 'Request failed');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}

// Auth API
const authAPI = {
    register: async (email, password, role) => {
        const data = await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, role })
        });

        setUser(data.user);
        return data;
    },

    login: async (email, password) => {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        setUser(data.user);
        return data;
    },

    logout: async () => {
        try {
            await apiRequest('/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout error:', error);
        }
        clearAuth();
        window.location.href = '/frontend/landingpage/index.html';
    },

    getCurrentUser: async () => {
        return await apiRequest('/auth/me');
    }
};

// Profile API
const profileAPI = {
    createPlayerProfile: async (profileData) => {
        return await apiRequest('/profile/player', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    },

    createCoachProfile: async (profileData) => {
        return await apiRequest('/profile/coach', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    },

    createOtherProfile: async (profileData) => {
        return await apiRequest('/profile/other', {
            method: 'POST',
            body: JSON.stringify(profileData)
        });
    },

    getPlayerProfile: async (userId) => {
        return await apiRequest(`/profile/player/${userId}`);
    },

    getCoachProfile: async (userId) => {
        return await apiRequest(`/profile/coach/${userId}`);
    },

    getOtherProfile: async (userId) => {
        return await apiRequest(`/profile/other/${userId}`);
    },

    searchPlayers: async (filters) => {
        const params = new URLSearchParams(filters);
        return await apiRequest(`/profile/search/players?${params}`);
    },

    searchCoaches: async (filters) => {
        const params = new URLSearchParams(filters);
        return await apiRequest(`/profile/search/coaches?${params}`);
    }
};

// Follow API
const followAPI = {
    follow: async (userId) => {
        return await apiRequest(`/follow/${userId}`, { method: 'POST' });
    },

    unfollow: async (userId) => {
        return await apiRequest(`/follow/${userId}`, { method: 'DELETE' });
    },

    getFollowers: async (userId, limit = 50, offset = 0) => {
        return await apiRequest(`/follow/${userId}/followers?limit=${limit}&offset=${offset}`);
    },

    getFollowing: async (userId, limit = 50, offset = 0) => {
        return await apiRequest(`/follow/${userId}/following?limit=${limit}&offset=${offset}`);
    },

    getCounts: async (userId) => {
        return await apiRequest(`/follow/${userId}/counts`);
    },

    checkFollowing: async (userId) => {
        return await apiRequest(`/follow/${userId}/check`);
    }
};

// Posts API
const postsAPI = {
    createPost: async (postData) => {
        return await apiRequest('/posts', {
            method: 'POST',
            body: JSON.stringify(postData)
        });
    },

    getPost: async (postId) => {
        return await apiRequest(`/posts/${postId}`);
    },

    updatePost: async (postId, postData) => {
        return await apiRequest(`/posts/${postId}`, {
            method: 'PUT',
            body: JSON.stringify(postData)
        });
    },

    deletePost: async (postId) => {
        return await apiRequest(`/posts/${postId}`, { method: 'DELETE' });
    },

    // Feed endpoints (Option 4: Two-Section Feed)
    getFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed?limit=${limit}&offset=${offset}`);
    },

    getCombinedFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed/combined?limit=${limit}&offset=${offset}`);
    },

    getFollowingFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed/following?limit=${limit}&offset=${offset}`);
    },

    getDiscoverFeed: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/feed/discover?limit=${limit}&offset=${offset}`);
    },

    getUserPosts: async (userId, limit = 20, offset = 0) => {
        return await apiRequest(`/posts/user/${userId}?limit=${limit}&offset=${offset}`);
    },

    // Likes
    likePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/like`, { method: 'POST' });
    },

    unlikePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/like`, { method: 'DELETE' });
    },

    getLikes: async (postId, limit = 50, offset = 0) => {
        return await apiRequest(`/posts/${postId}/likes?limit=${limit}&offset=${offset}`);
    },

    getShares: async (postId, limit = 50, offset = 0) => {
        return await apiRequest(`/posts/${postId}/shares?limit=${limit}&offset=${offset}`);
    },

    // Comments
    addComment: async (postId, content, parentCommentId = null) => {
        const body = { content };
        if (parentCommentId) {
            body.parent_comment_id = parentCommentId;
        }
        return await apiRequest(`/posts/${postId}/comments`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    getComments: async (postId, limit = 50, offset = 0) => {
        return await apiRequest(`/posts/${postId}/comments?limit=${limit}&offset=${offset}`);
    },

    getCommentReplies: async (commentId, limit = 20, offset = 0) => {
        return await apiRequest(`/posts/comments/${commentId}/replies?limit=${limit}&offset=${offset}`);
    },

    deleteComment: async (postId, commentId) => {
        return await apiRequest(`/posts/${postId}/comments/${commentId}`, { method: 'DELETE' });
    },

    // Comment likes
    likeComment: async (commentId) => {
        return await apiRequest(`/posts/comments/${commentId}/like`, { method: 'POST' });
    },

    unlikeComment: async (commentId) => {
        return await apiRequest(`/posts/comments/${commentId}/like`, { method: 'DELETE' });
    },

    // Saves (Bookmarks)
    savePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/save`, { method: 'POST' });
    },

    unsavePost: async (postId) => {
        return await apiRequest(`/posts/${postId}/save`, { method: 'DELETE' });
    },

    getSavedPosts: async (limit = 20, offset = 0) => {
        return await apiRequest(`/posts/saved/list?limit=${limit}&offset=${offset}`);
    },

    getMyReposts: async (limit = 10, offset = 0) => {
        return await apiRequest(`/posts/reposts/mine?limit=${limit}&offset=${offset}`);
    },

    // Shares
    sharePost: async (postId, shareType = 'repost', quoteContent = null, mediaUrls = null, mediaType = null) => {
        const body = { share_type: shareType, quote_content: quoteContent };
        if (mediaUrls && mediaUrls.length > 0) {
            body.media_urls = mediaUrls;
            body.media_type = mediaType;
        }
        return await apiRequest(`/posts/${postId}/share`, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    unsharePost: async (shareId) => {
        return await apiRequest(`/posts/shares/${shareId}`, { method: 'DELETE' });
    },

    // Unrepost by post ID (for toggle behavior)
    unrepostPost: async (postId) => {
        return await apiRequest(`/posts/${postId}/repost`, { method: 'DELETE' });
    },

    // Pin
    pinPost: async (postId) => {
        return await apiRequest(`/posts/${postId}/pin`, { method: 'POST' });
    },

    unpinPost: async (postId) => {
        return await apiRequest(`/posts/${postId}/pin`, { method: 'DELETE' });
    }
};

// Messages API
const messagesAPI = {
    getConversations: async (limit = 20, offset = 0) => {
        return await apiRequest(`/messages/conversations?limit=${limit}&offset=${offset}`);
    },

    createConversation: async (otherUserId) => {
        return await apiRequest('/messages/conversations', {
            method: 'POST',
            body: JSON.stringify({ otherUserId })
        });
    },

    getMessages: async (conversationId, limit = 50, offset = 0) => {
        return await apiRequest(`/messages/conversations/${conversationId}?limit=${limit}&offset=${offset}`);
    },

    sendMessage: async (conversationId, content) => {
        return await apiRequest(`/messages/conversations/${conversationId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    },

    markAsRead: async (conversationId) => {
        return await apiRequest(`/messages/conversations/${conversationId}/read`, {
            method: 'POST'
        });
    }
};

// Upload API
const uploadAPI = {
    uploadProfileImage: async (file) => {
        const formData = new FormData();
        formData.append('profile_image', file);

        const response = await fetch(`${API_BASE_URL}/upload/profile-image`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    },

    uploadPostMedia: async (files) => {
        const formData = new FormData();

        // Support both single file and array of files
        const fileArray = Array.isArray(files) ? files : [files];
        fileArray.forEach(file => {
            formData.append('media', file);
        });

        const response = await fetch(`${API_BASE_URL}/upload/post-media`, {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    }
};

// Notifications API
const notificationsAPI = {
    // Get all notifications with optional filtering
    getNotifications: async (type = null, limit = 50, offset = 0) => {
        let url = `/notifications?limit=${limit}&offset=${offset}`;
        if (type) url += `&type=${type}`;
        return await apiRequest(url);
    },

    // Get unread count
    getUnreadCount: async (type = null) => {
        let url = '/notifications/unread-count';
        if (type) url += `?type=${type}`;
        return await apiRequest(url);
    },

    // Get counts by type
    getCounts: async () => {
        return await apiRequest('/notifications/counts');
    },

    // Mark single notification as read
    markAsRead: async (notificationId) => {
        return await apiRequest(`/notifications/${notificationId}/read`, {
            method: 'PUT'
        });
    },

    // Mark all notifications as read
    markAllAsRead: async (type = null) => {
        let url = '/notifications/read-all';
        if (type) url += `?type=${type}`;
        return await apiRequest(url, {
            method: 'PUT'
        });
    },

    // Delete single notification
    deleteNotification: async (notificationId) => {
        return await apiRequest(`/notifications/${notificationId}`, {
            method: 'DELETE'
        });
    },

    // Delete all notifications
    deleteAll: async (type = null) => {
        let url = '/notifications';
        if (type) url += `?type=${type}`;
        return await apiRequest(url, {
            method: 'DELETE'
        });
    }
};

// Role-based avatar border color utility
function getRoleBorderColor(role, isTransfer, collegeDivision) {
    if (role === 'player') {
        if (isTransfer === true || isTransfer === 'y') return '#ef4444';
        return '#1282a2';
    }
    if (role === 'coach') return '#ff6b35';
    if (role === 'other') return '#d4a017';
    return '#1282a2';
}
window.getRoleBorderColor = getRoleBorderColor;

function buildCommentSubheader(role, data) {
    const parts = [];
    if (role === 'player') {
        if (data.transfer === 'y') {
            if (data.position) parts.push(data.position);
            if (data.height) {
                const h = String(data.height);
                if (h.includes("'")) { parts.push(h); } else { const t = parseInt(h); if (!isNaN(t) && t > 0) parts.push(`${Math.floor(t/12)}'${t%12}"`); }
            }
            if (data.weight) parts.push(`${data.weight} lbs`);
            if (data.eligibility) { const yt = data.eligibility === 1 ? 'year' : 'years'; parts.push(`YOE: ${data.eligibility} ${yt}`); }
            return parts.length ? `<span style="color:#ef4444;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        } else if (data.division) {
            if (data.position) parts.push(data.position);
            if (data.school) parts.push(data.school);
            if (data.division) parts.push(data.division);
            return parts.length ? `<span style="color:#1282a2;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        } else {
            if (data.position) parts.push(data.position);
            if (data.school) parts.push(data.school);
            if (data.grad_year) parts.push(data.grad_year);
            return parts.length ? `<span style="color:#1282a2;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        }
    } else if (role === 'coach') {
        if (data.division) {
            if (data.school && data.state) parts.push(`${data.school}, ${data.state}`);
            else if (data.school) parts.push(data.school);
            else if (data.state) parts.push(data.state);
            if (data.division) parts.push(data.division);
            return parts.length ? `<span style="color:#ff6b35;font-size:11px;">${parts.join(' \u2022 ')}</span>` : '';
        } else {
            if (data.school) parts.push(data.school);
            if (data.state) parts.push(data.state);
            return parts.length ? `<span style="color:#ff6b35;font-size:11px;">${parts.join(', ')}</span>` : '';
        }
    } else if (role === 'other') {
        return data.subheader ? `<span style="color:#d4a017;font-size:11px;">${data.subheader}</span>` : '';
    }
    return '';
}
window.buildCommentSubheader = buildCommentSubheader;

// Shared college division list — the single source of truth
const COLLEGE_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', '3C2A'];

/**
 * Determines the correct role folder for a user based on their role, transfer status, and division.
 * Accepts an object with any combination of these fields (from /auth/me, profile endpoints, notifications, etc.)
 * @param {Object} user
 * @param {string} user.role - 'player', 'coach', or 'other'
 * @param {boolean|string} [user.is_transfer_player] - true/false from users table
 * @param {string} [user.transfer] - 'y'/'n' from player_profiles table
 * @param {string} [user.college_division] - division value from profile
 * @returns {string} folder name: 'hsplayer', 'collegeplayer', 'transferplayer', 'hscoach', 'collegecoach', or 'other'
 */
function getProfileFolder(user) {
    const role = user.role;
    const collegeDivision = user.college_division;
    const isCollege = collegeDivision && COLLEGE_DIVISIONS.includes(collegeDivision);
    const isTransfer = user.is_transfer_player || user.transfer === 'y';

    if (role === 'coach') {
        return isCollege ? 'collegecoach' : 'hscoach';
    } else if (role === 'other') {
        return 'other';
    } else {
        // player (default)
        if (isTransfer) return 'transferplayer';
        if (isCollege) return 'collegeplayer';
        return 'hsplayer';
    }
}
window.getProfileFolder = getProfileFolder;
window.COLLEGE_DIVISIONS = COLLEGE_DIVISIONS;

// AI chat API
const aiAPI = {
    getChats: async (type = 'recruit_assistant') =>
        apiRequest(`/ai/chats?type=${type}`),
    createChat: async (chatType = 'recruit_assistant', title = 'New Chat') =>
        apiRequest('/ai/chats', { method: 'POST', body: JSON.stringify({ chat_type: chatType, title }) }),
    getChat: async (chatId) =>
        apiRequest(`/ai/chats/${chatId}`),
    updateChatTitle: async (chatId, title) =>
        apiRequest(`/ai/chats/${chatId}/title`, { method: 'PUT', body: JSON.stringify({ title }) }),
    deleteChat: async (chatId) =>
        apiRequest(`/ai/chats/${chatId}`, { method: 'DELETE' }),
    sendMessage: async (chatId, message, baselines = null) =>
        apiRequest(`/ai/chats/${chatId}/message`, {
            method: 'POST',
            body: JSON.stringify({ message, baselines })
        }),
    reSearch: async (filters) =>
        apiRequest('/ai/search', {
            method: 'POST',
            body: JSON.stringify({ filters })
        }),
    sendPiMessage: async (chatId, message) =>
        apiRequest(`/ai/chats/${chatId}/pi-message`, {
            method: 'POST',
            body: JSON.stringify({ message })
        }),
    getWatchlist: async () =>
        apiRequest('/ai/watchlist'),
    checkWatchlist: async (playerIds) =>
        apiRequest(`/ai/watchlist/check?playerIds=${playerIds.join(',')}`),
    addToWatchlist: async (playerUserId) =>
        apiRequest(`/ai/watchlist/${playerUserId}`, { method: 'POST' }),
    removeFromWatchlist: async (playerUserId) =>
        apiRequest(`/ai/watchlist/${playerUserId}`, { method: 'DELETE' }),
    clearWatchlist: async () =>
        apiRequest('/ai/watchlist', { method: 'DELETE' }),
};

// Unified API object for convenience
const API = {
    // Direct access to apiRequest for custom endpoints
    get: async (endpoint) => await apiRequest(endpoint),
    post: async (endpoint, data) => await apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(data)
    }),
    put: async (endpoint, data) => await apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(data)
    }),
    delete: async (endpoint) => await apiRequest(endpoint, {
        method: 'DELETE'
    }),

    // Sub-APIs
    auth: authAPI,
    profile: profileAPI,
    follow: followAPI,
    posts: postsAPI,
    messages: messagesAPI,
    upload: uploadAPI,
    notifications: notificationsAPI,
    ai: aiAPI,

    // Auth helpers
    getUser,
    setUser,
    clearAuth,
    isAuthenticated
};

// Make API available globally
window.API = API;
window.API_BASE_URL = API_BASE_URL;
