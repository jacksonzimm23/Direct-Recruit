// API Configuration
const API_BASE_URL = 'http://localhost:5000/api';

// Storage keys
const TOKEN_KEY = 'auth_token';
const USER_KEY = 'user_data';

// Get stored token
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

// Store token
function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

// Get stored user data
function getUser() {
    const userData = localStorage.getItem(USER_KEY);
    return userData ? JSON.parse(userData) : null;
}

// Store user data
function setUser(user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// Clear auth data
function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
}

// Check if user is authenticated
function isAuthenticated() {
    return !!getToken();
}

// API Request wrapper
async function apiRequest(endpoint, options = {}) {
    const token = getToken();

    const config = {
        headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
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

        setToken(data.token);
        setUser(data.user);
        return data;
    },

    login: async (email, password) => {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        setToken(data.token);
        setUser(data.user);
        return data;
    },

    logout: () => {
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

    getPlayerProfile: async (userId) => {
        return await apiRequest(`/profile/player/${userId}`);
    },

    getCoachProfile: async (userId) => {
        return await apiRequest(`/profile/coach/${userId}`);
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
    sharePost: async (postId, shareType = 'repost', quoteContent = null) => {
        return await apiRequest(`/posts/${postId}/share`, {
            method: 'POST',
            body: JSON.stringify({ share_type: shareType, quote_content: quoteContent })
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

        const token = getToken();
        const response = await fetch(`${API_BASE_URL}/upload/profile-image`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    },

    uploadHighlightVideo: async (file) => {
        const formData = new FormData();
        formData.append('highlight_video', file);

        const token = getToken();
        const response = await fetch(`${API_BASE_URL}/upload/highlight-video`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    },

    uploadPostMedia: async (file) => {
        const formData = new FormData();
        formData.append('media', file);

        const token = getToken();
        const response = await fetch(`${API_BASE_URL}/upload/post-media`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Upload failed');
        }

        return await response.json();
    }
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

    // Auth helpers
    getToken,
    setToken,
    getUser,
    setUser,
    clearAuth,
    isAuthenticated
};

// Make API available globally
window.API = API;
