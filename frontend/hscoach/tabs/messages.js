// Messages Page JavaScript - Backend Connected Version

let currentUserId = null;
let currentConversationId = null;
let conversations = [];
let pollingInterval = null;

document.addEventListener('DOMContentLoaded', async function() {
    // Sidebar toggle is handled by mainpage-player.js
    const dashboardContainer = document.getElementById('dashboardContainer');
    const sidebarHidden = localStorage.getItem('playerSidebarHidden') === 'true';

    if (sidebarHidden) {
        dashboardContainer.classList.add('sidebar-hidden');
    }

    // Load current user and initialize
    await loadCurrentUser();
    await loadConversations();

    // Check if we should open a specific conversation (from profile message button)
    const urlParams = new URLSearchParams(window.location.search);
    const targetUserId = urlParams.get('userId');
    if (targetUserId) {
        await openOrCreateConversation(targetUserId);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    setupEventListeners();
    startPolling();

    console.log('Direct Recruit Messages Page Loaded');
});

async function loadCurrentUser() {
    try {
        const response = await API.get('/auth/me');
        if (response.user) {
            currentUserId = response.user.id;

            // Update sidebar user info
            const userName = document.querySelector('.sidebar-footer .user-name');
            const userRole = document.querySelector('.sidebar-footer .user-role');

            if (userName && response.profile) {
                userName.textContent = `${response.profile.first_name} ${response.profile.last_name}`;
            }
            if (userRole && response.profile) {
                const parts = [];
                if (response.profile.position) parts.push(response.profile.position);
                if (response.profile.high_school) parts.push(response.profile.high_school);
                userRole.textContent = parts.join(' • ') || 'Player';
            }

            // Update avatar if available
            if (response.profile && response.profile.profile_image_url) {
                const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
                if (avatarElement) {
                    avatarElement.innerHTML = `<img src="${response.profile.profile_image_url}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
            }
        }
    } catch (error) {
        console.error('Failed to load current user:', error);
    }
}

async function loadConversations() {
    try {
        const response = await API.get('/messages/conversations');
        conversations = response.conversations || [];
        renderConversationsList();
    } catch (error) {
        console.error('Failed to load conversations:', error);
        showEmptyState();
    }
}

function renderConversationsList() {
    const conversationsList = document.getElementById('conversationsList');

    if (conversations.length === 0) {
        conversationsList.innerHTML = `
            <div class="empty-conversations">
                <p>No conversations yet</p>
                <p class="empty-hint">Visit a profile and click "Message" to start chatting</p>
            </div>
        `;
        return;
    }

    conversationsList.innerHTML = conversations.map(conv => {
        const participant = conv.participants && conv.participants[0] ? conv.participants[0] : {};
        const isActive = conv.id === currentConversationId;

        // Check if conversation has unread messages (last message is newer than last_read_at and not from current user)
        const hasUnread = conv.last_message_time &&
                          conv.last_message_sender_id !== currentUserId &&
                          (!conv.last_read_at || new Date(conv.last_message_time) > new Date(conv.last_read_at));

        return `
            <div class="conversation-item ${isActive ? 'active' : ''} ${hasUnread ? 'unread' : ''}"
                 data-conversation-id="${conv.id}"
                 data-participant-id="${participant.id || ''}">
                <div class="unread-indicator"></div>
                <div class="conversation-avatar">
                    <div class="avatar-circle">
                        ${participant.profile_image
                            ? `<img src="${participant.profile_image}" alt="${participant.first_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`
                            : `<svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                               </svg>`
                        }
                    </div>
                </div>
                <div class="conversation-info">
                    <div class="conversation-top">
                        <div class="conversation-name">${participant.first_name || 'Unknown'} ${participant.last_name || ''}</div>
                        <div class="conversation-time">${formatTimeAgo(conv.last_message_time)}</div>
                    </div>
                    <div class="conversation-preview">
                        <span class="preview-text">${truncateMessage(conv.last_message || 'No messages yet')}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Add click handlers
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.addEventListener('click', function() {
            const convId = this.dataset.conversationId;
            selectConversation(convId);
        });
    });
}

async function selectConversation(conversationId) {
    // Update UI
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.conversationId === conversationId) {
            item.classList.add('active');
        }
    });

    currentConversationId = conversationId;

    // Load messages
    await loadMessages(conversationId);

    // Update thread header
    const conv = conversations.find(c => c.id === conversationId);
    if (conv && conv.participants && conv.participants[0]) {
        updateThreadHeader(conv.participants[0]);
    }

    // Show message thread on mobile
    const messageThread = document.getElementById('messageThread');
    if (window.innerWidth <= 768 && messageThread) {
        messageThread.classList.add('active');
    }
}

async function loadMessages(conversationId) {
    const messageThreadContent = document.getElementById('messageThreadContent');

    try {
        const response = await API.get(`/messages/conversations/${conversationId}`);
        const messages = response.messages || [];

        renderMessages(messages.reverse()); // Reverse to show oldest first
    } catch (error) {
        console.error('Failed to load messages:', error);
        messageThreadContent.innerHTML = '<div class="message-error">Failed to load messages</div>';
    }
}

function renderMessages(messages) {
    const messageThreadContent = document.getElementById('messageThreadContent');

    if (messages.length === 0) {
        messageThreadContent.innerHTML = `
            <div class="empty-messages">
                <p>No messages yet. Say hello!</p>
            </div>
        `;
        return;
    }

    let html = '';
    let lastDate = null;

    messages.forEach(msg => {
        const msgDate = new Date(msg.created_at).toDateString();

        // Add date divider if new day
        if (msgDate !== lastDate) {
            html += `<div class="message-date-divider"><span>${formatMessageDate(msg.created_at)}</span></div>`;
            lastDate = msgDate;
        }

        // Ensure string comparison for UUIDs
        const isSent = String(msg.sender_id) === String(currentUserId);

        html += `
            <div class="message-group ${isSent ? 'sent' : 'received'}">
                <div class="message-content">
                    <div class="message-bubble ${isSent ? 'sent' : 'received'}">
                        <p>${escapeHtml(msg.content)}</p>
                    </div>
                    <div class="message-time">
                        ${formatMessageTime(msg.created_at)}
                    </div>
                </div>
            </div>
        `;
    });

    messageThreadContent.innerHTML = html;
    scrollToBottom();
}

function updateThreadHeader(participant) {
    const threadUserName = document.querySelector('.thread-user-name');
    const threadUserStatus = document.querySelector('.thread-user-status');
    const threadAvatarCircle = document.querySelector('.thread-avatar-circle');

    if (threadUserName) {
        threadUserName.textContent = `${participant.first_name || 'Unknown'} ${participant.last_name || ''}`;
    }

    if (threadUserStatus) {
        const roleText = participant.role === 'coach' ? 'Coach' : 'Player';
        threadUserStatus.innerHTML = `<span>${roleText}</span>`;
    }

    if (threadAvatarCircle && participant.profile_image) {
        threadAvatarCircle.innerHTML = `<img src="${participant.profile_image}" alt="${participant.first_name}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
    }
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (!message || !currentConversationId) return;

    // Clear input immediately for better UX
    messageInput.value = '';
    messageInput.style.height = 'auto';

    try {
        const response = await API.post(`/messages/conversations/${currentConversationId}/messages`, {
            content: message
        });

        if (response.message) {
            // Add message to UI
            appendMessage(response.message);

            // Update conversation list
            await loadConversations();
        }
    } catch (error) {
        console.error('Failed to send message:', error);
        // Restore message on error
        messageInput.value = message;
        alert('Failed to send message. Please try again.');
    }
}

function appendMessage(msg) {
    const messageThreadContent = document.getElementById('messageThreadContent');
    const typingIndicator = document.getElementById('typingIndicator');

    // Ensure string comparison for UUIDs
    const isSent = String(msg.sender_id) === String(currentUserId);

    const messageGroup = document.createElement('div');
    messageGroup.className = `message-group ${isSent ? 'sent' : 'received'}`;

    messageGroup.innerHTML = `
        <div class="message-content">
            <div class="message-bubble ${isSent ? 'sent' : 'received'}">
                <p>${escapeHtml(msg.content)}</p>
            </div>
            <div class="message-time">
                ${formatMessageTime(msg.created_at)}
            </div>
        </div>
    `;

    if (typingIndicator) {
        messageThreadContent.insertBefore(messageGroup, typingIndicator);
    } else {
        messageThreadContent.appendChild(messageGroup);
    }

    scrollToBottom();
}

async function openOrCreateConversation(otherUserId) {
    try {
        const response = await API.post('/messages/conversations', {
            otherUserId: otherUserId
        });

        if (response.conversation) {
            // Reload conversations to include the new one
            await loadConversations();

            // Select the conversation
            await selectConversation(response.conversation.id);
        }
    } catch (error) {
        console.error('Failed to create conversation:', error);
    }
}

function setupEventListeners() {
    // View Profile Button
    const viewProfileBtn = document.getElementById('viewProfileBtn');
    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', function() {
            if (currentConversationId) {
                const conv = conversations.find(c => c.id === currentConversationId);
                if (conv && conv.participants && conv.participants[0]) {
                    const participant = conv.participants[0];
                    // Navigate to profile using participant info
                    // We need to fetch their username first
                    navigateToProfile(participant.id, participant.role);
                }
            }
        });
    }

    // Message Input
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');

    // Auto-resize textarea
    if (messageInput) {
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });

        // Send message on Enter (Shift+Enter for new line)
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Send Message Button
    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', sendMessage);
    }

    // Search Conversations
    const searchInput = document.getElementById('searchConversations');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();
            filterConversations(searchTerm);
        });
    }

    // Back button for mobile
    addMobileBackButton();

    // Handle window resize
    window.addEventListener('resize', function() {
        addMobileBackButton();
        if (window.innerWidth > 768) {
            const messageThread = document.getElementById('messageThread');
            if (messageThread) messageThread.classList.remove('active');
        }
    });
}

function filterConversations(searchTerm) {
    const items = document.querySelectorAll('.conversation-item');

    items.forEach(item => {
        const name = item.querySelector('.conversation-name').textContent.toLowerCase();
        const preview = item.querySelector('.preview-text').textContent.toLowerCase();

        if (name.includes(searchTerm) || preview.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function addMobileBackButton() {
    if (window.innerWidth <= 768) {
        const threadHeader = document.querySelector('.message-thread-header');
        if (threadHeader && !document.querySelector('.back-btn-mobile')) {
            const backBtn = document.createElement('button');
            backBtn.className = 'back-btn-mobile thread-action-btn';
            backBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
            `;
            backBtn.style.marginRight = 'auto';

            backBtn.addEventListener('click', function() {
                const messageThread = document.getElementById('messageThread');
                if (messageThread) messageThread.classList.remove('active');
            });

            const threadHeaderInfo = threadHeader.querySelector('.thread-header-info');
            threadHeader.insertBefore(backBtn, threadHeaderInfo);
        }
    }
}

function startPolling() {
    // Poll for new messages every 5 seconds
    pollingInterval = setInterval(async () => {
        await loadConversations();

        // If we have a conversation selected, reload its messages
        if (currentConversationId) {
            await loadMessages(currentConversationId);
        }
    }, 5000);
}

function stopPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
}

// Utility functions
function formatTimeAgo(timestamp) {
    if (!timestamp) return '';

    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return time.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMessageDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    }
}

function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function truncateMessage(message, maxLength = 40) {
    if (!message) return '';
    if (message.length <= maxLength) return message;
    return message.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const messageThreadContent = document.getElementById('messageThreadContent');
    if (messageThreadContent) {
        messageThreadContent.scrollTop = messageThreadContent.scrollHeight;
    }
}

function showEmptyState() {
    const conversationsList = document.getElementById('conversationsList');
    conversationsList.innerHTML = `
        <div class="empty-conversations">
            <p>No conversations yet</p>
            <p class="empty-hint">Visit a profile and click "Message" to start chatting</p>
        </div>
    `;
}

// Navigate to a user's profile
async function navigateToProfile(userId, role) {
    try {
        const endpoint = role === 'coach' ? `/profile/coach/${userId}` : `/profile/player/${userId}`;
        const response = await API.get(endpoint);

        if (response.profile && response.profile.username) {
            window.location.href = `my-profile.html?username=${response.profile.username}`;
        }
    } catch (error) {
        console.error('Failed to get profile:', error);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    stopPolling();
});
