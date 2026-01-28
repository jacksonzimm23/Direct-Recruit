// Notifications Page JavaScript

// Helper function to determine the correct profile folder based on user data
function getProfileFolder(notification) {
    const role = notification.related_user_role;
    const collegeDivision = notification.related_user_college_division;
    const transfer = notification.related_user_transfer;

    if (role === 'coach') {
        // Coach: check if college or HS
        const isCollege = collegeDivision && ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(collegeDivision);
        return isCollege ? 'collegecoach' : 'hscoach';
    } else if (role === 'other') {
        return 'other';
    } else {
        // Player: check transfer status first, then college division
        if (transfer === 'y') {
            return 'transferplayer';
        } else if (collegeDivision && ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'].includes(collegeDivision)) {
            return 'collegeplayer';
        }
        return 'hsplayer';
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Sidebar toggle is handled by mainpage-player.js
    // Just restore the sidebar state from localStorage
    const dashboardContainer = document.getElementById('dashboardContainer');
    const sidebarHidden = localStorage.getItem('playerSidebarHidden') === 'true';
    const rightSidebarHidden = localStorage.getItem('playerRightSidebarHidden') === 'true';

    if (sidebarHidden) {
        dashboardContainer.classList.add('sidebar-hidden');
    }

    if (rightSidebarHidden) {
        dashboardContainer.classList.add('right-sidebar-hidden');
    }

    // Right sidebar toggle
    const rightSidebarToggle = document.getElementById('rightSidebarToggle');
    if (rightSidebarToggle) {
        rightSidebarToggle.addEventListener('click', function() {
            const isHidden = dashboardContainer.classList.toggle('right-sidebar-hidden');
            localStorage.setItem('playerRightSidebarHidden', isHidden);
        });
    }

    initializeNotifications();
});

// Track current state
let allNotifications = [];
let currentFilter = 'all';

async function initializeNotifications() {
    // Get all notification tabs
    const notificationTabs = document.querySelectorAll('.notification-tab');
    const markAllReadBtn = document.getElementById('markAllReadBtn');

    // Tab filtering functionality
    notificationTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');

            // Update active tab
            notificationTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Filter notifications
            currentFilter = filter;
            renderNotifications();
        });
    });

    // Mark all as read functionality
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', function() {
            markAllNotificationsAsRead();
        });
    }

    // Load notifications from API
    await loadNotifications();
}

// Load notifications from API
async function loadNotifications() {
    try {
        const response = await API.get('/notifications');
        allNotifications = response.notifications || [];
        renderNotifications();
        updateNotificationCounts();
    } catch (error) {
        console.error('Error loading notifications:', error);
        showEmptyState('Error loading notifications');
    }
}

// Render notifications based on current filter
function renderNotifications() {
    const notificationsList = document.getElementById('notificationsList');

    // Filter notifications
    let filteredNotifications = allNotifications;
    if (currentFilter !== 'all') {
        const filterMap = {
            'messages': 'message',
            'follows': 'follow',
            'interactions': 'interaction',
            'profile-views': 'profile_view'
        };
        const typeFilter = filterMap[currentFilter] || currentFilter;
        filteredNotifications = allNotifications.filter(n => n.type === typeFilter);
    }

    if (filteredNotifications.length === 0) {
        showEmptyState();
        return;
    }

    // Group by date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const groups = {
        today: [],
        yesterday: [],
        earlier: []
    };

    filteredNotifications.forEach(notification => {
        const notifDate = new Date(notification.created_at);
        notifDate.setHours(0, 0, 0, 0);

        if (notifDate.getTime() === today.getTime()) {
            groups.today.push(notification);
        } else if (notifDate.getTime() === yesterday.getTime()) {
            groups.yesterday.push(notification);
        } else {
            groups.earlier.push(notification);
        }
    });

    let html = '';

    if (groups.today.length > 0) {
        html += `<div class="notifications-section">
            <h3 class="section-title">Today</h3>
            ${groups.today.map(n => renderNotificationCard(n)).join('')}
        </div>`;
    }

    if (groups.yesterday.length > 0) {
        html += `<div class="notifications-section">
            <h3 class="section-title">Yesterday</h3>
            ${groups.yesterday.map(n => renderNotificationCard(n)).join('')}
        </div>`;
    }

    if (groups.earlier.length > 0) {
        html += `<div class="notifications-section">
            <h3 class="section-title">Earlier</h3>
            ${groups.earlier.map(n => renderNotificationCard(n)).join('')}
        </div>`;
    }

    notificationsList.innerHTML = html;
    setupNotificationActions();
}

// Render a single notification card
function renderNotificationCard(notification) {
    const isUnread = !notification.is_read;
    const timeAgo = formatTimeAgo(notification.created_at);

    // Determine icon based on type and title
    let iconClass = 'interaction-icon';
    let iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>`;

    if (notification.type === 'message') {
        iconClass = 'message-icon';
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>`;
    } else if (notification.type === 'follow') {
        iconClass = 'follow-icon';
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
        </svg>`;
    } else if (notification.type === 'profile_view') {
        iconClass = 'profile-view-icon';
        iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        </svg>`;
    } else if (notification.type === 'interaction') {
        // Use title to determine specific icon for interactions
        if (notification.title === 'Post Liked' || notification.title === 'Comment Liked') {
            iconClass = 'like-icon';
            iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>`;
        } else if (notification.title === 'New Comment') {
            iconClass = 'comment-icon';
            iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>`;
        } else if (notification.title === 'Post Shared') {
            iconClass = 'share-icon';
            iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 1l4 4-4 4"></path>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <path d="M7 23l-4-4 4-4"></path>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>`;
        } else if (notification.title === 'New Reply') {
            iconClass = 'reply-icon';
            iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 17l-5-5 5-5"></path>
                <path d="M4 12h16"></path>
                <path d="M20 12v5a2 2 0 0 1-2 2H9"></path>
            </svg>`;
        }
    }

    const dataType = notification.type === 'interaction' ? 'interactions' :
                     notification.type === 'message' ? 'messages' :
                     notification.type === 'follow' ? 'follows' :
                     notification.type === 'profile_view' ? 'profile-views' : 'interactions';

    const isFollowRequest = notification.title === 'Follow Request';
    const showFollowRequestActions = isFollowRequest && !notification.request_processed;

    // Use profile picture if available, otherwise fall back to icon
    const hasProfileImage = notification.related_user_profile_image && notification.related_user_username;
    let iconHtml;
    if (hasProfileImage) {
        const folder = getProfileFolder(notification);
        iconHtml = `
            <a href="../../${folder}/tabs/my-profile.html?username=${notification.related_user_username}&from=notifications" class="notification-profile-link">
                <img src="${notification.related_user_profile_image}" alt="" class="notification-profile-img">
            </a>`;
    } else {
        iconHtml = `<div class="notification-icon ${iconClass}">${iconSvg}</div>`;
    }

    return `
        <div class="notification-card ${isUnread ? 'unread' : ''}" data-type="${dataType}" data-id="${notification.id}" data-related-user-id="${notification.related_user_id || ''}" data-title="${notification.title || ''}">
            ${iconHtml}
            <div class="notification-content">
                <p class="notification-text">
                    <strong>${notification.title || 'Notification'}</strong><br>
                    ${formatNotificationMessage(notification)}${showFollowRequestActions ? `
                    <span class="follow-request-actions">
                        <button class="btn-accept-request" data-user-id="${notification.related_user_id}">Accept</button>
                        <button class="btn-decline-request" data-user-id="${notification.related_user_id}">Decline</button>
                    </span>` : ''}
                </p>
                <span class="notification-time">${timeAgo}</span>
            </div>
            <div class="notification-actions">
                ${isUnread && !showFollowRequestActions ? `
                    <button class="btn-notification-action" title="Mark as read">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                ` : ''}
                <button class="btn-notification-delete" title="Delete notification">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

// Format time ago
function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format notification message with clickable name link
// Uses current profile data (fetched via JOIN) rather than stored message to handle profile changes
function formatNotificationMessage(notification) {
    const name = notification.related_user_first_name && notification.related_user_last_name
        ? `${notification.related_user_first_name} ${notification.related_user_last_name}`
        : 'Someone';

    // Create a clickable link if we have a username
    // Navigate to the appropriate profile folder based on user type
    let nameHtml;
    if (notification.related_user_username) {
        const folder = getProfileFolder(notification);
        nameHtml = `<a href="../../${folder}/tabs/my-profile.html?username=${notification.related_user_username}&from=notifications" class="notification-user-link">${name}</a>`;
    } else {
        nameHtml = `<strong>${name}</strong>`;
    }

    // Rebuild message based on notification type/title using current profile data
    // This ensures updated profile names are reflected in old notifications
    const title = notification.title || '';

    switch (title) {
        case 'Profile View':
            const schoolText = notification.related_user_school ? ` from ${notification.related_user_school}` : '';
            return `${nameHtml}${schoolText} viewed your profile`;
        case 'New Follower':
            return `${nameHtml} started following you`;
        case 'Follow Request':
            return `${nameHtml} requested to follow you`;
        case 'Follow Request Accepted':
            return `${nameHtml} accepted your follow request`;
        case 'New Message':
            return `${nameHtml} sent you a message`;
        case 'Post Liked':
            return `${nameHtml} liked your post`;
        case 'Comment Liked':
            return `${nameHtml} liked your comment`;
        case 'New Comment':
            // Extract the comment preview from the original message if available
            const commentMatch = notification.message?.match(/: "(.+)"$/);
            const commentPreview = commentMatch ? `: "${commentMatch[1]}"` : '';
            return `${nameHtml} commented on your post${commentPreview}`;
        case 'Post Shared':
            const isQuote = notification.message?.includes('quoted');
            return `${nameHtml} ${isQuote ? 'quoted' : 'shared'} your post`;
        case 'New Reply':
            // Extract the reply preview from the original message if available
            const replyMatch = notification.message?.match(/: "(.+)"$/);
            const replyPreview = replyMatch ? `: "${replyMatch[1]}"` : '';
            return `${nameHtml} replied to your comment${replyPreview}`;
        default:
            // Fallback: try to replace any name pattern in the original message
            let message = notification.message || '';
            // If the message contains any name-like pattern at the start, replace with current name
            if (message && name !== 'Someone') {
                // Replace the first word(s) that look like a name (capitalized words at start)
                message = message.replace(/^[A-Z][a-z]+ [A-Z][a-z]+/, nameHtml);
            }
            return message || `${nameHtml} interacted with you`;
    }
}

// Setup notification action buttons
function setupNotificationActions() {
    // Mark as read buttons
    document.querySelectorAll('.btn-notification-action').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const card = this.closest('.notification-card');
            const notificationId = card.dataset.id;
            await markNotificationAsRead(notificationId, card);
        });
    });

    // Delete buttons
    document.querySelectorAll('.btn-notification-delete').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const card = this.closest('.notification-card');
            const notificationId = card.dataset.id;
            await deleteNotification(notificationId, card);
        });
    });

    // Follow request accept/decline buttons
    document.querySelectorAll('.btn-accept-request').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            const card = this.closest('.notification-card');
            await handleAcceptFollowRequest(userId, card);
        });
    });

    document.querySelectorAll('.btn-decline-request').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const userId = this.getAttribute('data-user-id');
            const card = this.closest('.notification-card');
            await handleDeclineFollowRequest(userId, card);
        });
    });

    // Click on notification card
    document.querySelectorAll('.notification-card').forEach(card => {
        card.addEventListener('click', async function() {
            const notificationId = this.dataset.id;
            if (this.classList.contains('unread')) {
                await markNotificationAsRead(notificationId, this);
            }
        });
    });
}

// Handle accepting a follow request
async function handleAcceptFollowRequest(userId, card) {
    try {
        const response = await API.post(`/follow/requests/user/${userId}/accept`);

        const notificationId = card.dataset.id;
        const notification = allNotifications.find(n => String(n.id) === String(notificationId));

        if (response.requestCancelled) {
            // Request was cancelled - delete the notification
            await deleteNotification(notificationId, card);
            showFeedback('Request was already cancelled');
        } else {
            // Update the notification to show they are now following
            if (notification) {
                const name = notification.related_user_first_name && notification.related_user_last_name
                    ? `${notification.related_user_first_name} ${notification.related_user_last_name}`
                    : 'Someone';

                // Update the card content to show new follower message
                const contentDiv = card.querySelector('.notification-content');
                if (contentDiv) {
                    const folder = getProfileFolder(notification);
                    const nameLink = notification.related_user_username
                        ? `<a href="../../${folder}/tabs/my-profile.html?username=${notification.related_user_username}&from=notifications" class="notification-user-link">${name}</a>`
                        : `<strong>${name}</strong>`;

                    contentDiv.innerHTML = `
                        <p class="notification-text">
                            <strong>New Follower</strong><br>
                            ${nameLink} is now following you
                        </p>
                        <span class="notification-time">${formatTimeAgo(notification.created_at)}</span>
                    `;
                }

                notification.request_processed = true;
                notification.title = 'New Follower';
                notification.message = `${name} is now following you`;
            }

            // Mark as read
            await markNotificationAsRead(notificationId, card);
            showFeedback('Follow request accepted');
        }
    } catch (error) {
        console.error('Failed to accept follow request:', error);
        showFeedback('Failed to accept follow request');
    }
}

// Handle declining a follow request
async function handleDeclineFollowRequest(userId, card) {
    try {
        const response = await API.post(`/follow/requests/user/${userId}/decline`);

        const notificationId = card.dataset.id;

        // Delete the notification regardless of whether request was cancelled
        await deleteNotification(notificationId, card);

        if (response.requestCancelled) {
            showFeedback('Request was already cancelled');
        } else {
            showFeedback('Follow request declined');
        }
    } catch (error) {
        console.error('Failed to decline follow request:', error);
        showFeedback('Failed to decline follow request');
    }
}

// Mark notification as read
async function markNotificationAsRead(notificationId, cardElement) {
    try {
        await API.put(`/notifications/${notificationId}/read`);

        // Update local state
        const notification = allNotifications.find(n => String(n.id) === String(notificationId));
        if (notification) notification.is_read = true;

        // Update UI
        cardElement.classList.remove('unread');
        const markReadBtn = cardElement.querySelector('.btn-notification-action');
        if (markReadBtn) markReadBtn.style.display = 'none';

        updateNotificationCounts();
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

// Delete notification
async function deleteNotification(notificationId, cardElement) {
    try {
        await API.delete(`/notifications/${notificationId}`);

        // Update local state
        allNotifications = allNotifications.filter(n => String(n.id) !== String(notificationId));

        // Animate removal
        cardElement.style.transition = 'all 0.3s ease';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'translateX(-20px)';

        setTimeout(() => {
            cardElement.remove();
            updateNotificationCounts();
            updateSectionVisibility();

            if (allNotifications.length === 0) {
                showEmptyState();
            }

            showFeedback('Notification deleted');
        }, 300);
    } catch (error) {
        console.error('Error deleting notification:', error);
        showFeedback('Failed to delete notification', 'error');
    }
}

// Mark all as read
async function markAllNotificationsAsRead() {
    try {
        await API.put('/notifications/read-all');

        // Update local state
        allNotifications.forEach(n => n.is_read = true);

        // Update UI
        document.querySelectorAll('.notification-card.unread').forEach(card => {
            card.classList.remove('unread');
            const btn = card.querySelector('.btn-notification-action');
            if (btn) btn.style.display = 'none';
        });

        updateNotificationCounts();
        showFeedback('All notifications marked as read');
    } catch (error) {
        console.error('Error marking all as read:', error);
        showFeedback('Failed to mark all as read', 'error');
    }
}

// Update notification counts
function updateNotificationCounts() {
    const unreadCount = allNotifications.filter(n => !n.is_read).length;

    // Update "All" tab count
    const allTab = document.querySelector('.notification-tab[data-filter="all"] .tab-count');
    if (allTab) allTab.textContent = allNotifications.length;

    // Update counts for each type
    const typeCounts = {
        'messages': allNotifications.filter(n => n.type === 'message').length,
        'follows': allNotifications.filter(n => n.type === 'follow').length,
        'interactions': allNotifications.filter(n => n.type === 'interaction').length,
        'profile-views': allNotifications.filter(n => n.type === 'profile_view').length
    };

    Object.entries(typeCounts).forEach(([type, count]) => {
        const tab = document.querySelector(`.notification-tab[data-filter="${type}"] .tab-count`);
        if (tab) tab.textContent = count;
    });

    // Update sidebar badge
    updateSidebarBadge(unreadCount);
}

// Update sidebar badge
function updateSidebarBadge(count) {
    const navBadge = document.querySelector('.nav-item[href="notifications.html"] .notification-badge');
    if (navBadge) {
        if (count > 0) {
            navBadge.textContent = count;
            navBadge.style.display = 'block';
        } else {
            navBadge.style.display = 'none';
        }
    }
}

// Update section visibility
function updateSectionVisibility() {
    document.querySelectorAll('.notifications-section').forEach(section => {
        const visibleCards = section.querySelectorAll('.notification-card:not([style*="display: none"])');
        section.style.display = visibleCards.length === 0 ? 'none' : 'block';
    });
}

// Show empty state
function showEmptyState(message = null) {
    const notificationsList = document.getElementById('notificationsList');
    notificationsList.innerHTML = `
        <div class="notifications-empty">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <h2 class="empty-title">${message || 'All caught up!'}</h2>
            <p class="empty-text">${message ? 'Please try again later.' : 'You have no notifications at this time.'}</p>
        </div>
    `;
}

// Show feedback message
function showFeedback(message, type = 'success') {
    const feedback = document.createElement('div');
    feedback.className = 'feedback-toast';
    feedback.textContent = message;
    feedback.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: ${type === 'error' ? '#ef4444' : 'var(--cerulean)'};
        color: var(--white);
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 700;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        animation: slideInUp 0.3s ease;
    `;

    // Add animation if not present
    if (!document.getElementById('feedback-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'feedback-animation-styles';
        style.textContent = `
            @keyframes slideInUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes slideOutDown {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(20px); }
            }
            .follow-request-actions {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }
            .follow-request-actions button {
                padding: 6px 16px;
                border-radius: 6px;
                font-size: 0.85rem;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                border: none;
            }
            .btn-accept-request {
                background: var(--cerulean, #1282a2);
                color: white;
            }
            .btn-accept-request:hover {
                background: #0f6d8a;
            }
            .btn-decline-request {
                background: transparent;
                color: var(--gray, #6c757d);
                border: 1px solid var(--gray, #6c757d) !important;
            }
            .btn-decline-request:hover {
                background: rgba(108, 117, 125, 0.1);
            }
            .request-status {
                font-size: 0.85rem;
                font-weight: 600;
                padding: 6px 0;
            }
            .request-status.accepted {
                color: var(--cerulean, #1282a2);
            }
            .request-status.declined {
                color: var(--gray, #6c757d);
            }
            .request-status.cancelled {
                color: #856404;
                font-style: italic;
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(feedback);

    setTimeout(() => {
        feedback.style.animation = 'slideOutDown 0.3s ease';
        setTimeout(() => feedback.remove(), 300);
    }, 3000);
}

// Auto-refresh notifications
function autoRefreshNotifications() {
    setInterval(async () => {
        try {
            await loadNotifications();
        } catch (error) {
            console.error('Auto-refresh error:', error);
        }
    }, 60000); // Refresh every 60 seconds
}

// Initialize auto-refresh
document.addEventListener('DOMContentLoaded', function() {
    autoRefreshNotifications();
});

// Toggle switches functionality
document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitches = document.querySelectorAll('.toggle-switch input');

    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', function() {
            const settingsItem = this.closest('.settings-item');
            const label = settingsItem?.querySelector('.settings-label')?.textContent || 'Notification';

            if (this.checked) {
                showFeedback(`${label} notifications enabled`);
            } else {
                showFeedback(`${label} notifications disabled`);
            }
        });
    });
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + A to mark all as read
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        const markAllBtn = document.getElementById('markAllReadBtn');
        if (markAllBtn && document.activeElement.tagName !== 'INPUT') {
            e.preventDefault();
            markAllNotificationsAsRead();
        }
    }
});

// Export functions for potential external use
window.NotificationsApp = {
    markAllAsRead: markAllNotificationsAsRead,
    updateCounts: updateNotificationCounts,
    refresh: loadNotifications
};
