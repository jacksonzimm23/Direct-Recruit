// Notifications Page JavaScript - Dynamic Version

let currentFilter = 'all';
let notificationsData = [];

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
    const typeClass = getTypeIconClass(notification.type);
    const icon = getTypeIcon(notification.type);
    const timeAgo = formatTimeAgo(notification.created_at);

    return `
        <div class="notification-card ${isUnread ? 'unread' : ''}" data-type="${notification.type}" data-id="${notification.id}">
            <div class="notification-icon ${typeClass}">
                ${icon}
            </div>
            <div class="notification-content">
                <div class="notification-text">
                    ${formatNotificationMessage(notification)}
                </div>
                <div class="notification-time">${timeAgo}</div>
            </div>
            <div class="notification-actions">
                ${isUnread ? `
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

// Format notification message with bold name
function formatNotificationMessage(notification) {
    const name = notification.related_user_first_name && notification.related_user_last_name
        ? `${notification.related_user_first_name} ${notification.related_user_last_name}`
        : 'Someone';

    // Use the message from the API which already has the full text
    // But we want to make the name bold
    let message = notification.message || '';

    // If the message starts with the name, make it bold
    if (message.startsWith(name)) {
        message = `<strong>${name}</strong>${message.substring(name.length)}`;
    } else if (message.includes(name)) {
        message = message.replace(name, `<strong>${name}</strong>`);
    }

    return message;
}

// Get icon class based on notification type
function getTypeIconClass(type) {
    const classes = {
        'message': 'message-icon',
        'follow': 'follow-icon',
        'interaction': 'interaction-icon'
    };
    return classes[type] || 'message-icon';
}

// Get SVG icon based on notification type
function getTypeIcon(type) {
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

    // Click on notification card
    document.querySelectorAll('.notification-card').forEach(card => {
        card.addEventListener('click', function() {
            handleNotificationClick(this);
        });
    });
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
                    window.location.href = `../../profiles/view-profile.html?username=${notification.related_user_username}`;
                }
                break;
            case 'interaction':
                // Could navigate to the specific post if we have post ID
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
