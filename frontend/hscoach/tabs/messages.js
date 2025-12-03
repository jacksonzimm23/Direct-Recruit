// Messages Page JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    // Hide Recruiting Board and Transfer Portal for high school coaches
    await setupCollegeCoachNav();

    // Sidebar toggle is handled by mainpage-coach.js
    // Just restore the sidebar state from localStorage
    const dashboardContainer = document.getElementById('dashboardContainer');
    const sidebarHidden = localStorage.getItem('coachSidebarHidden') === 'true';

    if (sidebarHidden) {
        dashboardContainer.classList.add('sidebar-hidden');
    }

    // Conversation Selection
    const conversationItems = document.querySelectorAll('.conversation-item');
    const messageThread = document.getElementById('messageThread');

    conversationItems.forEach(item => {
        item.addEventListener('click', function() {
            // Remove active class from all conversations
            conversationItems.forEach(conv => conv.classList.remove('active'));

            // Add active class to clicked conversation
            this.classList.add('active');

            // Remove unread status
            this.classList.remove('unread');
            const unreadCount = this.querySelector('.unread-count');
            if (unreadCount) {
                unreadCount.remove();
            }

            // Update notification badge
            updateNotificationBadge();

            // Show message thread on mobile
            if (window.innerWidth <= 768) {
                messageThread.classList.add('active');
            }

            // Load conversation (this would typically fetch from backend)
            const conversationId = this.getAttribute('data-conversation-id');
            const conversationName = this.querySelector('.conversation-name').textContent;

            console.log('Loading conversation:', conversationId, conversationName);

            // Update thread header with selected conversation
            updateThreadHeader(conversationName);
        });
    });

    // Update notification badge count
    function updateNotificationBadge() {
        const unreadConversations = document.querySelectorAll('.conversation-item.unread');
        const badge = document.querySelector('.nav-item.active .notification-badge');

        if (badge) {
            if (unreadConversations.length > 0) {
                badge.textContent = unreadConversations.length;
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // Update thread header
    function updateThreadHeader(name) {
        const threadUserName = document.querySelector('.thread-user-name');
        if (threadUserName) {
            threadUserName.textContent = name;
        }

        // Update right sidebar profile
        const profileNameLarge = document.querySelector('.profile-name-large');
        if (profileNameLarge) {
            profileNameLarge.textContent = name;
        }
    }

    // Search Conversations
    const searchInput = document.getElementById('searchConversations');

    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase().trim();

            conversationItems.forEach(item => {
                const name = item.querySelector('.conversation-name').textContent.toLowerCase();
                const preview = item.querySelector('.preview-text').textContent.toLowerCase();

                if (name.includes(searchTerm) || preview.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    // Message Input
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const messageThreadContent = document.getElementById('messageThreadContent');
    const typingIndicator = document.getElementById('typingIndicator');

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

    // Send Message Function
    function sendMessage() {
        const message = messageInput.value.trim();

        if (message) {
            // Create message element
            const messageGroup = document.createElement('div');
            messageGroup.className = 'message-group sent';

            const messageContent = document.createElement('div');
            messageContent.className = 'message-content';

            const messageBubble = document.createElement('div');
            messageBubble.className = 'message-bubble sent';

            const messageParagraph = document.createElement('p');
            messageParagraph.textContent = message;

            const messageTime = document.createElement('div');
            messageTime.className = 'message-time';
            messageTime.innerHTML = `
                ${getCurrentTime()}
                <svg class="message-status-icon sent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
            `;

            messageBubble.appendChild(messageParagraph);
            messageContent.appendChild(messageBubble);
            messageContent.appendChild(messageTime);
            messageGroup.appendChild(messageContent);

            // Insert before typing indicator
            if (typingIndicator) {
                messageThreadContent.insertBefore(messageGroup, typingIndicator);
            } else {
                messageThreadContent.appendChild(messageGroup);
            }

            // Clear input
            messageInput.value = '';
            messageInput.style.height = 'auto';

            // Scroll to bottom
            scrollToBottom();

            // Simulate message status updates
            setTimeout(() => {
                const statusIcon = messageTime.querySelector('.message-status-icon');
                statusIcon.classList.remove('sent');
                statusIcon.classList.add('delivered');
                statusIcon.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline><polyline points="16 6 5 17"></polyline>';
            }, 1000);

            setTimeout(() => {
                const statusIcon = messageTime.querySelector('.message-status-icon');
                statusIcon.classList.remove('delivered');
                statusIcon.classList.add('read');
            }, 2000);

            // Simulate typing response
            simulateTypingResponse();

            console.log('Message sent:', message);
        }
    }

    // Get current time
    function getCurrentTime() {
        const now = new Date();
        let hours = now.getHours();
        const minutes = now.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12;
        const minutesStr = minutes < 10 ? '0' + minutes : minutes;

        return `${hours}:${minutesStr} ${ampm}`;
    }

    // Scroll to bottom
    function scrollToBottom() {
        messageThreadContent.scrollTop = messageThreadContent.scrollHeight;
    }

    // Simulate typing response
    function simulateTypingResponse() {
        // Show typing indicator after a delay
        setTimeout(() => {
            if (typingIndicator) {
                typingIndicator.style.display = 'flex';
                scrollToBottom();
            }
        }, 1500);

        // Hide typing indicator and show response after another delay
        setTimeout(() => {
            if (typingIndicator) {
                typingIndicator.style.display = 'none';
            }

            // Add a sample response message
            const responses = [
                "That sounds perfect! I'll send you the details shortly.",
                "Great! Looking forward to connecting with you.",
                "Thanks for the quick response!",
                "I'll check my schedule and get back to you."
            ];

            const randomResponse = responses[Math.floor(Math.random() * responses.length)];

            const messageGroup = document.createElement('div');
            messageGroup.className = 'message-group received';

            messageGroup.innerHTML = `
                <div class="message-avatar-circle">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                </div>
                <div class="message-content">
                    <div class="message-bubble received">
                        <p>${randomResponse}</p>
                    </div>
                    <div class="message-time">${getCurrentTime()}</div>
                </div>
            `;

            messageThreadContent.appendChild(messageGroup);
            scrollToBottom();
        }, 3500);
    }

    // Thread Action Buttons
    const threadActionBtns = document.querySelectorAll('.thread-action-btn');

    threadActionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const title = this.getAttribute('title');
            console.log('Thread action:', title);
            alert(`${title} functionality will be connected to your backend.`);
        });
    });

    // Message Option Buttons (Attach, Photo)
    const messageOptionBtns = document.querySelectorAll('.message-option-btn');

    messageOptionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const title = this.getAttribute('title');
            console.log('Message option:', title);
            alert(`${title} functionality will be connected to your backend.`);
        });
    });

    // Emoji Button
    const emojiBtn = document.querySelector('.emoji-btn');

    if (emojiBtn) {
        emojiBtn.addEventListener('click', function() {
            console.log('Emoji picker clicked');
            alert('Emoji picker will be implemented.');
        });
    }

    // View Profile Button
    const viewProfileBtn = document.querySelector('.btn-view-profile');

    if (viewProfileBtn) {
        viewProfileBtn.addEventListener('click', function() {
            console.log('View profile clicked');
            alert('Profile view will be implemented.');
        });
    }

    // Quick Action Buttons
    const quickActionBtns = document.querySelectorAll('.quick-action-btn');

    quickActionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.querySelector('span').textContent;
            console.log('Quick action:', action);

            if (action === 'Delete Conversation') {
                if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
                    alert('Conversation deletion will be connected to your backend.');
                }
            } else {
                alert(`${action} functionality will be connected to your backend.`);
            }
        });
    });

    // Shared Media Items
    const mediaItems = document.querySelectorAll('.media-item');

    mediaItems.forEach(item => {
        item.addEventListener('click', function() {
            console.log('Media item clicked');
            alert('Media viewer will be implemented.');
        });
    });

    // Widget Show More
    const showMoreBtns = document.querySelectorAll('.widget-show-more');

    showMoreBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            console.log('Show more clicked');
            alert('Show more functionality will be implemented.');
        });
    });

    // Back button for mobile
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
                    messageThread.classList.remove('active');
                });

                const threadHeaderInfo = threadHeader.querySelector('.thread-header-info');
                threadHeader.insertBefore(backBtn, threadHeaderInfo);
            }
        }
    }

    // Handle window resize
    window.addEventListener('resize', function() {
        addMobileBackButton();

        // Show thread if active conversation exists and screen is desktop
        if (window.innerWidth > 768) {
            messageThread.classList.remove('active');
        }
    });

    // Initialize mobile back button if needed
    addMobileBackButton();

    // Scroll to bottom on page load
    scrollToBottom();

    // Mark messages as read when scrolled into view
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const messageGroup = entry.target;
                if (messageGroup.classList.contains('received')) {
                    // Mark as read (would typically update backend here)
                    console.log('Message viewed');
                }
            }
        });
    }, {
        root: messageThreadContent,
        threshold: 0.5
    });

    // Observe all received messages
    const receivedMessages = document.querySelectorAll('.message-group.received');
    receivedMessages.forEach(message => {
        observer.observe(message);
    });

    console.log('Direct Recruit Messages Page Loaded');
});

// Function to show/hide college-specific navigation based on user role
async function setupCollegeCoachNav() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            // Check for college_division to determine if user is a college coach
            // High school coaches won't have a division (FBS, FCS, D2, D3, NAIA, JUCO)
            const isCollegeCoach = profile.college_division && profile.college_division.trim() !== '';

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
        console.error('Error setting up college coach navigation:', error);
    }
}