// Notifications Page JavaScript

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

function initializeNotifications() {
    // Get all notification tabs
    const notificationTabs = document.querySelectorAll('.notification-tab');
    const notificationCards = document.querySelectorAll('.notification-card');
    const markAllReadBtn = document.getElementById('markAllReadBtn');

    // Tab filtering functionality
    notificationTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const filter = this.getAttribute('data-filter');

            // Update active tab
            notificationTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Filter notifications
            filterNotifications(filter);
        });
    });

    // Mark all as read functionality
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', function() {
            markAllNotificationsAsRead();
        });
    }

    // Individual notification actions
    setupNotificationActions();

    // Update notification counts
    updateNotificationCounts();
}

// Filter notifications based on selected tab
function filterNotifications(filter) {
    const notificationCards = document.querySelectorAll('.notification-card');

    notificationCards.forEach(card => {
        const cardType = card.getAttribute('data-type');

        if (filter === 'all') {
            card.style.display = 'flex';
        } else if (cardType === filter) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });

    // Show/hide section titles if all cards in section are hidden
    updateSectionVisibility();
}

// Update section visibility based on filtered cards
function updateSectionVisibility() {
    const sections = document.querySelectorAll('.notifications-section');

    sections.forEach(section => {
        const visibleCards = section.querySelectorAll('.notification-card:not([style*="display: none"])');

        if (visibleCards.length === 0) {
            section.style.display = 'none';
        } else {
            section.style.display = 'block';
        }
    });
}

// Mark all notifications as read
function markAllNotificationsAsRead() {
    const unreadCards = document.querySelectorAll('.notification-card.unread');

    unreadCards.forEach(card => {
        markNotificationAsRead(card);
    });

    // Update counts
    updateNotificationCounts();

    // Show success feedback
    showFeedback('All notifications marked as read');
}

// Mark individual notification as read
function markNotificationAsRead(card) {
    card.classList.remove('unread');

    // Remove the mark as read button
    const markReadBtn = card.querySelector('.btn-notification-action');
    if (markReadBtn) {
        markReadBtn.style.display = 'none';
    }

    // Add fade animation
    card.style.opacity = '0.7';
    setTimeout(() => {
        card.style.opacity = '1';
    }, 300);
}

// Setup individual notification action buttons
function setupNotificationActions() {
    // Mark as read buttons
    const markReadButtons = document.querySelectorAll('.btn-notification-action');
    markReadButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.notification-card');
            markNotificationAsRead(card);
            updateNotificationCounts();
        });
    });

    // Delete buttons
    const deleteButtons = document.querySelectorAll('.btn-notification-delete');
    deleteButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const card = this.closest('.notification-card');
            deleteNotification(card);
        });
    });

    // Click on notification card
    const notificationCards = document.querySelectorAll('.notification-card');
    notificationCards.forEach(card => {
        card.addEventListener('click', function() {
            handleNotificationClick(card);
        });
    });
}

// Delete notification
function deleteNotification(card) {
    // Add fade-out animation
    card.style.transition = 'all 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'translateX(-20px)';

    setTimeout(() => {
        card.remove();
        updateNotificationCounts();
        updateSectionVisibility();

        // Check if there are any notifications left
        const remainingCards = document.querySelectorAll('.notification-card');
        if (remainingCards.length === 0) {
            showEmptyState();
        }

        showFeedback('Notification deleted');
    }, 300);
}

// Handle notification click
function handleNotificationClick(card) {
    const type = card.getAttribute('data-type');

    // Mark as read if unread
    if (card.classList.contains('unread')) {
        markNotificationAsRead(card);
        updateNotificationCounts();
    }

    // Navigate based on notification type
    // In a real application, you would navigate to the relevant page
    console.log(`Navigating to ${type} page...`);

    // Example navigation logic (uncomment to use):
    // if (type === 'messages') {
    //     window.location.href = 'messages.html';
    // } else if (type === 'profile-views') {
    //     window.location.href = 'my-profile.html';
    // }
}

// Update notification counts
function updateNotificationCounts() {
    const allNotifications = document.querySelectorAll('.notification-card');
    const unreadNotifications = document.querySelectorAll('.notification-card.unread');

    // Update "All" tab count
    const allTab = document.querySelector('.notification-tab[data-filter="all"] .tab-count');
    if (allTab) {
        allTab.textContent = allNotifications.length;
    }

    // Update counts for each type
    const types = ['profile-views', 'messages', 'follows', 'interactions'];
    types.forEach(type => {
        const typeCards = document.querySelectorAll(`.notification-card[data-type="${type}"]`);
        const tab = document.querySelector(`.notification-tab[data-filter="${type}"] .tab-count`);
        if (tab) {
            tab.textContent = typeCards.length;
        }
    });

    // Update badge in sidebar navigation
    updateSidebarBadge(unreadNotifications.length);
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

// Show feedback message
function showFeedback(message) {
    // Create feedback element
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

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideInUp {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        @keyframes slideOutDown {
            from {
                opacity: 1;
                transform: translateY(0);
            }
            to {
                opacity: 0;
                transform: translateY(20px);
            }
        }
    `;
    document.head.appendChild(style);

    document.body.appendChild(feedback);

    // Remove after 3 seconds
    setTimeout(() => {
        feedback.style.animation = 'slideOutDown 0.3s ease';
        setTimeout(() => {
            feedback.remove();
        }, 300);
    }, 3000);
}

// Toggle switches functionality
document.addEventListener('DOMContentLoaded', function() {
    const toggleSwitches = document.querySelectorAll('.toggle-switch input');

    toggleSwitches.forEach(toggle => {
        toggle.addEventListener('change', function() {
            const settingsItem = this.closest('.settings-item');
            const label = settingsItem.querySelector('.settings-label').textContent;

            if (this.checked) {
                showFeedback(`${label} notifications enabled`);
            } else {
                showFeedback(`${label} notifications disabled`);
            }
        });
    });
});

// Auto-refresh notification counts (simulated)
// In a real application, this would fetch from a server
function autoRefreshNotifications() {
    setInterval(() => {
        // Simulate checking for new notifications
        // In production, this would be an API call
        console.log('Checking for new notifications...');
    }, 30000); // Check every 30 seconds
}

// Initialize auto-refresh
document.addEventListener('DOMContentLoaded', function() {
    autoRefreshNotifications();
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
    filterNotifications: filterNotifications
};
