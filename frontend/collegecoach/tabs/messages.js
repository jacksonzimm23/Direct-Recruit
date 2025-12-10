// Messages Page JavaScript - Backend Connected Version

let currentUserId = null;
let currentConversationId = null;
let conversations = [];
let pollingInterval = null;
let currentAttachment = null; // Store current attachment {type: 'image'|'file', file: File, preview: string}

// Common emojis for the picker
const emojis = [
    '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊',
    '😋', '😎', '😍', '🥰', '😘', '😗', '😙', '😚', '🙂', '🤗',
    '🤔', '😐', '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐',
    '😯', '😪', '😫', '😴', '😌', '😛', '😜', '😝', '🤤', '😒',
    '👍', '👎', '👏', '🙌', '🤝', '💪', '🙏', '❤️', '🔥', '⭐',
    '🏈', '🏀', '⚽', '🎯', '🏆', '🥇', '💯', '✅', '🎉', '👋'
];

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

    // Check if returning from viewing a profile - restore the conversation
    const returnConversationId = sessionStorage.getItem('messagesReturnConversationId');
    if (returnConversationId) {
        sessionStorage.removeItem('messagesReturnConversationId');
        // Wait a moment for conversations to be loaded, then select the conversation
        setTimeout(() => {
            selectConversation(returnConversationId);
        }, 100);
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
    // Update UI - remove active from all, add to selected, and remove unread class from selected
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.conversationId === conversationId) {
            item.classList.add('active');
            // Remove unread class since we're opening this conversation (it will be marked as read)
            item.classList.remove('unread');
        }
    });

    currentConversationId = conversationId;

    // Show thread header and input container
    const threadHeader = document.getElementById('messageThreadHeader');
    const inputContainer = document.getElementById('messageInputContainer');
    if (threadHeader) threadHeader.style.display = 'flex';
    if (inputContainer) inputContainer.style.display = 'flex';

    // Load messages (this also marks the conversation as read on the backend)
    await loadMessages(conversationId);

    // Update the unread messages badge in the sidebar nav
    if (typeof updateUnreadMessagesBadge === 'function') {
        updateUnreadMessagesBadge();
    }

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
    const threadUserRole = document.querySelector('.thread-user-role');
    const threadAvatarCircle = document.querySelector('.thread-avatar-circle');

    if (threadUserName) {
        threadUserName.textContent = `${participant.first_name || 'Unknown'} ${participant.last_name || ''}`;
    }

    if (threadUserRole) {
        // Build role info string similar to sidebar footer
        const parts = [];

        if (participant.role === 'player') {
            // Check if college player or HS player based on college_division
            const isCollegePlayer = participant.college_division &&
                ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA'].includes(participant.college_division);

            if (isCollegePlayer) {
                // College Player: Position, College Name (stored in high_school), Division
                if (participant.position) parts.push(participant.position);
                if (participant.high_school) parts.push(participant.high_school);
                if (participant.college_division) {
                    const division = participant.college_division;
                    if (division === 'FBS' || division === 'FCS') {
                        parts.push(`D1 ${division}`);
                    } else {
                        parts.push(division);
                    }
                }
            } else {
                // HS Player: Position, High School, Graduation Year
                if (participant.position) parts.push(participant.position);
                if (participant.high_school) parts.push(participant.high_school);
                if (participant.graduation_year) parts.push(`Class of ${participant.graduation_year}`);
            }
            threadUserRole.classList.remove('coach');
        } else if (participant.role === 'coach') {
            // Coach: Position Title (acronym), College, Division
            if (participant.position_title) {
                parts.push(getPositionAcronym(participant.position_title));
            }
            if (participant.college_name) parts.push(participant.college_name);
            if (participant.college_division) {
                // Format FBS/FCS as D1 FBS/D1 FCS
                const division = participant.college_division;
                if (division === 'FBS' || division === 'FCS') {
                    parts.push(`D1 ${division}`);
                } else {
                    parts.push(division);
                }
            }
            threadUserRole.classList.add('coach');
        }

        threadUserRole.textContent = parts.join(' • ') || (participant.role === 'coach' ? 'Coach' : 'Player');
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

    // File attachment button
    const attachFileBtn = document.getElementById('attachFileBtn');
    const fileInput = document.getElementById('fileInput');
    if (attachFileBtn && fileInput) {
        attachFileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileSelect);
    }

    // Image attachment button
    const attachImageBtn = document.getElementById('attachImageBtn');
    const imageInput = document.getElementById('imageInput');
    if (attachImageBtn && imageInput) {
        attachImageBtn.addEventListener('click', () => imageInput.click());
        imageInput.addEventListener('change', handleImageSelect);
    }

    // Emoji button
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiBtn && emojiPicker) {
        // Initialize emoji picker
        initEmojiPicker();

        emojiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleEmojiPicker();
        });

        // Close emoji picker when clicking outside
        document.addEventListener('click', (e) => {
            if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
                emojiPicker.style.display = 'none';
            }
        });
    }
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
            // Store conversation context for when user comes back
            sessionStorage.setItem('messagesReturnConversationId', currentConversationId);

            // Navigate to the appropriate profile page based on role
            if (role === 'coach') {
                // Determine if coach is college or hs based on their profile
                const isCollegeCoach = response.profile.college_division &&
                    ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA'].includes(response.profile.college_division);
                if (isCollegeCoach) {
                    window.location.href = `my-profile.html?username=${response.profile.username}&from=messages`;
                } else {
                    window.location.href = `../../hscoach/tabs/my-profile.html?username=${response.profile.username}&from=messages`;
                }
            } else {
                // For players, determine if college or hs
                const isCollegePlayer = response.profile.college_division &&
                    ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA'].includes(response.profile.college_division);
                if (isCollegePlayer) {
                    window.location.href = `../../collegeplayer/tabs/my-profile.html?username=${response.profile.username}&from=messages`;
                } else {
                    window.location.href = `../../hsplayer/tabs/my-profile.html?username=${response.profile.username}&from=messages`;
                }
            }
        }
    } catch (error) {
        console.error('Failed to get profile:', error);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    stopPolling();
});

// Update unread messages badge in sidebar nav
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

// ============ Emoji Picker Functions ============

function initEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (!emojiPicker) return;

    emojiPicker.innerHTML = emojis.map(emoji =>
        `<span class="emoji-item" data-emoji="${emoji}">${emoji}</span>`
    ).join('');

    // Add click handlers for each emoji
    emojiPicker.querySelectorAll('.emoji-item').forEach(item => {
        item.addEventListener('click', () => {
            insertEmoji(item.dataset.emoji);
        });
    });
}

function toggleEmojiPicker() {
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) {
        emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'grid' : 'none';
    }
}

function insertEmoji(emoji) {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        const start = messageInput.selectionStart;
        const end = messageInput.selectionEnd;
        const text = messageInput.value;
        messageInput.value = text.substring(0, start) + emoji + text.substring(end);
        messageInput.selectionStart = messageInput.selectionEnd = start + emoji.length;
        messageInput.focus();
    }

    // Close picker after selection
    const emojiPicker = document.getElementById('emojiPicker');
    if (emojiPicker) emojiPicker.style.display = 'none';
}

// ============ File Attachment Functions ============

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        alert('File size must be less than 10MB');
        e.target.value = '';
        return;
    }

    currentAttachment = {
        type: 'file',
        file: file,
        name: file.name
    };

    showAttachmentPreview();
}

function handleImageSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Check file size (max 5MB for images)
    if (file.size > 5 * 1024 * 1024) {
        alert('Image size must be less than 5MB');
        e.target.value = '';
        return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onload = function(event) {
        currentAttachment = {
            type: 'image',
            file: file,
            preview: event.target.result,
            name: file.name
        };
        showAttachmentPreview();
    };
    reader.readAsDataURL(file);
}

function showAttachmentPreview() {
    const preview = document.getElementById('attachmentPreview');
    if (!preview || !currentAttachment) return;

    if (currentAttachment.type === 'image') {
        preview.innerHTML = `
            <div class="preview-item image-preview">
                <img src="${currentAttachment.preview}" alt="Preview">
                <button class="remove-attachment" onclick="removeAttachment()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
    } else {
        // File preview
        const fileIcon = getFileIcon(currentAttachment.name);
        preview.innerHTML = `
            <div class="preview-item file-preview">
                <div class="file-icon">${fileIcon}</div>
                <span class="file-name">${truncateFileName(currentAttachment.name)}</span>
                <button class="remove-attachment" onclick="removeAttachment()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
    }

    preview.style.display = 'flex';
}

function removeAttachment() {
    currentAttachment = null;
    const preview = document.getElementById('attachmentPreview');
    if (preview) {
        preview.innerHTML = '';
        preview.style.display = 'none';
    }
    // Clear file inputs
    const fileInput = document.getElementById('fileInput');
    const imageInput = document.getElementById('imageInput');
    if (fileInput) fileInput.value = '';
    if (imageInput) imageInput.value = '';
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = {
        pdf: '📄',
        doc: '📝',
        docx: '📝',
        txt: '📃',
        zip: '📦',
        default: '📎'
    };
    return icons[ext] || icons.default;
}

function truncateFileName(name, maxLength = 20) {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop();
    const baseName = name.substring(0, name.length - ext.length - 1);
    return baseName.substring(0, maxLength - ext.length - 4) + '...' + ext;
}

// Convert coach position titles to acronyms
function getPositionAcronym(title) {
    const acronyms = {
        'Head Coach': 'HC',
        'Offensive Coordinator': 'OC',
        'Defensive Coordinator': 'DC',
        'Special Teams Coordinator': 'STC',
        'Quarterbacks Coach': 'QBs',
        'Running Backs Coach': 'RBs',
        'Wide Receivers Coach': 'WRs',
        'Tight Ends Coach': 'TEs',
        'Offensive Line Coach': 'OL',
        'Defensive Line Coach': 'DL',
        'Linebackers Coach': 'LBs',
        'Defensive Backs Coach': 'DBs',
        'Safeties Coach': 'SAFs',
        'Cornerbacks Coach': 'CBs',
        'Strength Coach': 'S&C',
        'Recruiting Coordinator': 'RC',
        'Assistant Coach': 'Asst',
        'Graduate Assistant': 'GA',
        'Quality Control': 'QC'
    };

    // Handle combined titles with "/"
    if (title.includes('/')) {
        return title.split('/').map(part => acronyms[part.trim()] || part.trim()).join('/');
    }

    return acronyms[title] || title;
}
