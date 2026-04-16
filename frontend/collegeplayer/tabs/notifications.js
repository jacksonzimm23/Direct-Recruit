// Notifications Page JavaScript - Dynamic Version

let currentFilter = 'all';
let notificationsData = [];

// Maps notification fields to the shared getProfileFolder() from api.js
function getNotificationProfileFolder(notification) {
    return getProfileFolder({
        role: notification.related_user_role,
        college_division: notification.related_user_college_division,
        transfer: notification.related_user_transfer
    });
}

document.addEventListener('DOMContentLoaded', function() {
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

    initializeNotifications();
});

async function initializeNotifications() {
    // Show loading state
    showLoadingState();

    // Fetch notifications from API
    await loadNotifications();

    // Setup tab filtering
    setupTabFiltering();

    // Setup mark all as read button
    const markAllReadBtn = document.getElementById('markAllReadBtn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', markAllNotificationsAsRead);
    }

    // Setup keyboard shortcuts
    setupKeyboardShortcuts();

    // Start auto-refresh
    autoRefreshNotifications();
}

// Show loading state
function showLoadingState() {
    const notificationsList = document.getElementById('notificationsList');
    notificationsList.innerHTML = `
        <div class="notifications-loading" style="text-align: center; padding: 3rem;">
            <div style="color: var(--cerulean); font-size: 1.1rem;">Loading notifications...</div>
        </div>
    `;
}

// Load notifications from API
async function loadNotifications() {
    try {
        const response = await API.notifications.getNotifications(null, 100, 0);
        notificationsData = response.notifications || [];

        // Update counts
        await updateNotificationCounts();

        // Render notifications
        renderNotifications();
    } catch (error) {
        console.error('Failed to load notifications:', error);
        showErrorState();
    }
}

// Render notifications list
function renderNotifications() {
    const notificationsList = document.getElementById('notificationsList');

    // Filter notifications based on current filter
    let filteredNotifications = notificationsData;
    if (currentFilter !== 'all') {
        // Map filter names to notification types
        const filterMap = {
            'messages': 'message',
            'follows': 'follow',
            'interactions': 'interaction'
        };
        const apiType = filterMap[currentFilter] || currentFilter;
        filteredNotifications = notificationsData.filter(n => n.type === apiType);
    }

    if (filteredNotifications.length === 0) {
        showEmptyState();
        return;
    }

    // Group notifications by time (New vs Earlier)
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const newNotifications = filteredNotifications.filter(n => new Date(n.created_at) > oneDayAgo);
    const earlierNotifications = filteredNotifications.filter(n => new Date(n.created_at) <= oneDayAgo);

    let html = '';

    // New section
    if (newNotifications.length > 0) {
        html += `
            <div class="notifications-section">
                <h2 class="section-title">New</h2>
                ${newNotifications.map(n => renderNotificationCard(n)).join('')}
            </div>
        `;
    }

    // Earlier section
    if (earlierNotifications.length > 0) {
        html += `
            <div class="notifications-section">
                <h2 class="section-title">Earlier</h2>
                ${earlierNotifications.map(n => renderNotificationCard(n)).join('')}
            </div>
        `;
    }

    notificationsList.innerHTML = html;

    // Setup action listeners for rendered cards
    setupNotificationActions();
}

// Render a single notification card
function renderNotificationCard(notification) {
    const isUnread = !notification.is_read;
    const typeClass = getTypeIconClass(notification.type, notification.title);
    const icon = getTypeIcon(notification.type, notification.title);
    const timeAgo = formatTimeAgo(notification.created_at);
    const isFollowRequest = notification.title === 'Follow Request';

    // Check if this is a follow request that hasn't been processed yet
    const showFollowRequestActions = isFollowRequest && !notification.request_processed;

    // Use profile picture if available, otherwise fall back to icon
    const hasProfileImage = notification.related_user_profile_image && notification.related_user_username;
    let iconHtml;
    if (hasProfileImage) {
        const folder = getNotificationProfileFolder(notification);
        iconHtml = `
            <a href="../../${folder}/tabs/my-profile.html?username=${notification.related_user_username}&from=notifications" class="notification-profile-link">
                <img src="${notification.related_user_profile_image}" alt="" class="notification-profile-img" style="border: 2px solid ${getRoleBorderColor(notification.related_user_role, notification.related_user_transfer === 'y', notification.related_user_college_division)}; color: ${getRoleBorderColor(notification.related_user_role, notification.related_user_transfer === 'y', notification.related_user_college_division)}; background: ${getRoleAvatarBg(notification.related_user_role, notification.related_user_transfer === 'y', notification.related_user_college_division)}">
            </a>`;
    } else {
        iconHtml = `<div class="notification-icon ${typeClass}">${icon}</div>`;
    }

    return `
        <div class="notification-card ${isUnread ? 'unread' : ''}" data-type="${notification.type}" data-id="${notification.id}" data-related-user-id="${notification.related_user_id || ''}" data-title="${notification.title || ''}">
            ${iconHtml}
            <div class="notification-content">
                <div class="notification-text">
                    ${formatNotificationMessage(notification)}${showFollowRequestActions ? `
                    <span class="follow-request-actions">
                        <button class="btn-accept-request" data-user-id="${notification.related_user_id}">Accept</button>
                        <button class="btn-decline-request" data-user-id="${notification.related_user_id}">Decline</button>
                    </span>` : ''}
                </div>
                <div class="notification-time">${timeAgo}</div>
            </div>
            <div class="notification-actions">
                ${isUnread && !showFollowRequestActions ? `
                    <button class="btn-notification-action" title="Mark as read">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </button>
                ` : ''}
                <button class="btn-notification-delete" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;
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
        const folder = getNotificationProfileFolder(notification);
        const _nLogo = typeof getSchoolLogoHTML === 'function' ? getSchoolLogoHTML(notification.related_user_school, '../../assets', 14) : '';
        nameHtml = `<a href="../../${folder}/tabs/my-profile.html?username=${notification.related_user_username}&from=notifications" class="notification-user-link">${name}${_nLogo}</a>`;
    } else {
        const _nLogo = typeof getSchoolLogoHTML === 'function' ? getSchoolLogoHTML(notification.related_user_school, '../../assets', 14) : '';
        nameHtml = `<strong>${name}${_nLogo}</strong>`;
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
        case 'Portal Entry':
            return `${nameHtml} has entered the transfer portal`;
        case 'AI Search Match':
            return notification.message;
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

// Get icon class based on notification type and title
function getTypeIconClass(type, title) {
    // For interactions, use title to determine specific icon class
    if (type === 'interaction' && title) {
        if (title === 'Post Liked' || title === 'Comment Liked') {
            return 'like-icon';
        } else if (title === 'New Comment') {
            return 'comment-icon';
        } else if (title === 'Post Shared') {
            return 'share-icon';
        } else if (title === 'New Reply') {
            return 'reply-icon';
        } else if (title === 'Portal Entry') {
            return 'portal-entry-icon';
        } else if (title === 'AI Search Match') {
            return 'ai-search-icon';
        }
    }

    const classes = {
        'message': 'message-icon',
        'follow': 'follow-icon',
        'interaction': 'interaction-icon',
        'profile-view': 'view-icon'
    };
    return classes[type] || 'message-icon';
}

// Get SVG icon based on notification type and title
function getTypeIcon(type, title) {
    // For interactions, use title to determine specific icon
    if (type === 'interaction' && title) {
        if (title === 'Post Liked' || title === 'Comment Liked') {
            // Heart icon for likes
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>`;
        } else if (title === 'New Comment') {
            // Comment bubble icon
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
            </svg>`;
        } else if (title === 'Post Shared') {
            // Share/repost icon
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 1l4 4-4 4"></path>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
                <path d="M7 23l-4-4 4-4"></path>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>`;
        } else if (title === 'New Reply') {
            // Reply icon (arrow reply)
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 17l-5-5 5-5"></path>
                <path d="M4 12h16"></path>
                <path d="M20 12v5a2 2 0 0 1-2 2H9"></path>
            </svg>`;
        } else if (title === 'Portal Entry') {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>`;
        } else if (title === 'AI Search Match') {
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
            </svg>`;
        }
    }

    const icons = {
        'message': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>`,
        'follow': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="20" y1="8" x2="20" y2="14"></line>
            <line x1="23" y1="11" x2="17" y2="11"></line>
        </svg>`,
        'interaction': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
        </svg>`,
        'profile-view': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        </svg>`
    };
    return icons[type] || icons['message'];
}

// Format time ago
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    if (seconds < 172800) return 'Yesterday';
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
    if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
    return date.toLocaleDateString();
}

// Setup tab filtering
function setupTabFiltering() {
    const notificationTabs = document.querySelectorAll('.notification-tab');

    notificationTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');

            // Update active tab
            notificationTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Update current filter and re-render
            currentFilter = filter;
            renderNotifications();
        });
    });
}

// Setup notification action buttons
function setupNotificationActions() {
    // Mark as read buttons
    document.querySelectorAll('.btn-notification-action').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const card = this.closest('.notification-card');
            const notificationId = card.getAttribute('data-id');
            await markNotificationAsRead(notificationId, card);
        });
    });

    // Delete buttons
    document.querySelectorAll('.btn-notification-delete').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.stopPropagation();
            const card = this.closest('.notification-card');
            const notificationId = card.getAttribute('data-id');
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
        card.addEventListener('click', function() {
            handleNotificationClick(this);
        });
    });
}

// Handle accepting a follow request
async function handleAcceptFollowRequest(userId, card) {
    try {
        const response = await API.post(`/follow/requests/user/${userId}/accept`);

        const notificationId = card.getAttribute('data-id');
        const notification = notificationsData.find(n => n.id === notificationId);

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
                    const folder = getNotificationProfileFolder(notification);
                    const nameLink = notification.related_user_username
                        ? `<a href="../../${folder}/tabs/my-profile.html?username=${notification.related_user_username}&from=notifications" class="notification-user-link">${name}</a>`
                        : `<strong>${name}</strong>`;

                    contentDiv.innerHTML = `
                        <div class="notification-text">${nameLink} is now following you</div>
                        <div class="notification-time">${formatTimeAgo(notification.created_at)}</div>
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

        const notificationId = card.getAttribute('data-id');

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

// Mark single notification as read
async function markNotificationAsRead(notificationId, card) {
    try {
        await API.notifications.markAsRead(notificationId);

        // Update local data
        const notification = notificationsData.find(n => n.id === notificationId);
        if (notification) notification.is_read = true;

        // Update UI
        card.classList.remove('unread');
        const markReadBtn = card.querySelector('.btn-notification-action');
        if (markReadBtn) markReadBtn.style.display = 'none';

        // Update counts
        await updateNotificationCounts();
    } catch (error) {
        console.error('Failed to mark notification as read:', error);
        showFeedback('Failed to mark as read');
    }
}

// Mark all notifications as read
async function markAllNotificationsAsRead() {
    try {
        await API.notifications.markAllAsRead();

        // Update local data
        notificationsData.forEach(n => n.is_read = true);

        // Re-render
        renderNotifications();

        // Update counts
        await updateNotificationCounts();

        showFeedback('All notifications marked as read');
    } catch (error) {
        console.error('Failed to mark all as read:', error);
        showFeedback('Failed to mark all as read');
    }
}

// Delete notification
async function deleteNotification(notificationId, card) {
    try {
        // Add fade-out animation
        card.style.transition = 'all 0.3s ease';
        card.style.opacity = '0';
        card.style.transform = 'translateX(-20px)';

        await API.notifications.deleteNotification(notificationId);

        // Update local data
        notificationsData = notificationsData.filter(n => n.id !== notificationId);

        setTimeout(async () => {
            // Re-render
            renderNotifications();

            // Update counts
            await updateNotificationCounts();

            showFeedback('Notification deleted');
        }, 300);
    } catch (error) {
        console.error('Failed to delete notification:', error);
        card.style.opacity = '1';
        card.style.transform = 'translateX(0)';
        showFeedback('Failed to delete notification');
    }
}

// Handle notification click
async function handleNotificationClick(card) {
    const notificationId = card.getAttribute('data-id');
    const notification = notificationsData.find(n => n.id === notificationId);

    // Mark as read if unread
    if (notification && !notification.is_read) {
        await markNotificationAsRead(notificationId, card);
    }

    // Navigate based on notification type
    if (notification) {
        switch (notification.type) {
            case 'message':
                window.location.href = 'messages.html';
                break;
            case 'follow':
                if (notification.related_user_username) {
                    // Navigate to the appropriate profile folder based on user type
                    const folder = getNotificationProfileFolder(notification);
                    window.location.href = `../../${folder}/tabs/my-profile.html?username=${notification.related_user_username}&from=notifications`;
                }
                break;
            case 'interaction':
                if (notification.title === 'AI Search Match') {
                    // College players don't have AI Rep — no navigation
                }
                break;
        }
    }
}

// Update notification counts in tabs
async function updateNotificationCounts() {
    try {
        const response = await API.notifications.getCounts();
        const counts = response.counts || {};

        // Update "All" tab count
        const allTab = document.querySelector('.notification-tab[data-filter="all"] .tab-count');
        if (allTab) {
            allTab.textContent = counts.all?.total || 0;
        }

        // Map filter names to API types
        const filterToType = {
            'messages': 'message',
            'follows': 'follow',
            'interactions': 'interaction'
        };

        // Update counts for each type
        Object.entries(filterToType).forEach(([filter, type]) => {
            const tab = document.querySelector(`.notification-tab[data-filter="${filter}"] .tab-count`);
            if (tab) {
                tab.textContent = counts[type]?.total || 0;
            }
        });

        // Update sidebar badge
        updateSidebarBadge(counts.all?.unread || 0);
    } catch (error) {
        console.error('Failed to update counts:', error);
    }
}

// Update notification badge in sidebar
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

// Show empty state
function showEmptyState() {
    const notificationsList = document.getElementById('notificationsList');

    notificationsList.innerHTML = `
        <div class="notifications-empty">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <h2 class="empty-title">All caught up!</h2>
            <p class="empty-text">You have no notifications at this time.</p>
        </div>
    `;
}

// Show error state
function showErrorState() {
    const notificationsList = document.getElementById('notificationsList');

    notificationsList.innerHTML = `
        <div class="notifications-empty">
            <svg class="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <h2 class="empty-title">Unable to load notifications</h2>
            <p class="empty-text">Please try again later.</p>
            <button onclick="loadNotifications()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--cerulean); color: white; border: none; border-radius: 6px; cursor: pointer;">Retry</button>
        </div>
    `;
}

// Show feedback message
function showFeedback(message) {
    // Remove existing feedback
    const existingFeedback = document.querySelector('.feedback-toast');
    if (existingFeedback) existingFeedback.remove();

    const feedback = document.createElement('div');
    feedback.className = 'feedback-toast';
    feedback.textContent = message;
    feedback.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        background: var(--cerulean);
        color: var(--white);
        padding: 1rem 1.5rem;
        border-radius: 8px;
        font-size: 0.9rem;
        font-weight: 700;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 1000;
        animation: slideInUp 0.3s ease;
    `;

    document.body.appendChild(feedback);

    setTimeout(() => {
        feedback.style.animation = 'slideOutDown 0.3s ease';
        setTimeout(() => feedback.remove(), 300);
    }, 3000);
}

// Add animation styles
const style = document.createElement('style');
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

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
            const markAllBtn = document.getElementById('markAllReadBtn');
            if (markAllBtn && document.activeElement.tagName !== 'INPUT') {
                e.preventDefault();
                markAllNotificationsAsRead();
            }
        }
    });
}

// Auto-refresh notifications
function autoRefreshNotifications() {
    setInterval(async () => {
        try {
            const response = await API.notifications.getUnreadCount();
            const currentUnread = notificationsData.filter(n => !n.is_read).length;

            // If unread count changed, reload notifications
            if (response.unreadCount !== currentUnread) {
                await loadNotifications();
            }
        } catch (error) {
            console.error('Auto-refresh error:', error);
        }
    }, 30000); // Check every 30 seconds
}

// Export functions for potential external use
window.NotificationsApp = {
    markAllAsRead: markAllNotificationsAsRead,
    updateCounts: updateNotificationCounts,
    reload: loadNotifications
};
