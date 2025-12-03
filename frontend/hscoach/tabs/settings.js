// Settings Page JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    // Hide Recruiting Board and Transfer Portal for high school coaches
    await setupCollegeCoachNav();

    // Sidebar toggle is handled by mainpage-coach.js
    // Just restore the sidebar state from localStorage
    const dashboardContainer = document.getElementById('dashboardContainer');
    const sidebarHidden = localStorage.getItem('coachSidebarHidden') === 'true';
    const rightSidebarHidden = localStorage.getItem('coachRightSidebarHidden') === 'true';

    if (sidebarHidden) {
        dashboardContainer.classList.add('sidebar-hidden');
    }

    if (rightSidebarHidden) {
        dashboardContainer.classList.add('right-sidebar-hidden');
    }

    // Settings section navigation
    initializeSettingsNavigation();

    // Form handling
    initializeFormHandlers();

    // Toggle switches
    initializeToggleSwitches();

    // Save and discard buttons
    initializeSaveButtons();

    // Delete account functionality
    initializeDeleteAccount();
});

// Settings Navigation
function initializeSettingsNavigation() {
    const navButtons = document.querySelectorAll('.settings-nav-btn');
    const sections = document.querySelectorAll('.settings-section');

    navButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetSection = this.dataset.section;

            // Remove active class from all buttons and sections
            navButtons.forEach(btn => btn.classList.remove('active'));
            sections.forEach(section => section.classList.remove('active'));

            // Add active class to clicked button and corresponding section
            this.classList.add('active');
            document.getElementById(targetSection).classList.add('active');

            // Scroll to top of settings content
            document.querySelector('.settings-content').scrollIntoView({ behavior: 'smooth' });
        });
    });
}

// Form Handlers
function initializeFormHandlers() {
    const inputs = document.querySelectorAll('.form-input, .form-select');

    inputs.forEach(input => {
        input.addEventListener('input', function() {
            markFormAsModified();
        });

        input.addEventListener('change', function() {
            markFormAsModified();
        });
    });
}

// Toggle Switches
function initializeToggleSwitches() {
    const toggles = document.querySelectorAll('.toggle-switch input');

    toggles.forEach(toggle => {
        toggle.addEventListener('change', function() {
            markFormAsModified();

            // You can add specific logic for different toggles here
            const toggleItem = this.closest('.toggle-item');
            const toggleLabel = toggleItem.querySelector('.toggle-label').textContent;

            if (this.checked) {
                console.log(`${toggleLabel} enabled`);
            } else {
                console.log(`${toggleLabel} disabled`);
            }
        });
    });
}

// Save and Discard Buttons
function initializeSaveButtons() {
    const saveBtn = document.getElementById('saveChangesBtn');
    const discardBtn = document.getElementById('discardBtn');

    if (saveBtn) {
        saveBtn.addEventListener('click', function() {
            saveSettings();
        });
    }

    if (discardBtn) {
        discardBtn.addEventListener('click', function() {
            discardChanges();
        });
    }
}

// Mark Form as Modified
function markFormAsModified() {
    const saveBtn = document.getElementById('saveChangesBtn');
    const discardBtn = document.getElementById('discardBtn');

    if (saveBtn && discardBtn) {
        saveBtn.style.opacity = '1';
        saveBtn.style.pointerEvents = 'auto';
        discardBtn.style.opacity = '1';
        discardBtn.style.pointerEvents = 'auto';
    }
}

// Save Settings
function saveSettings() {
    // Show loading state
    const saveBtn = document.getElementById('saveChangesBtn');
    const originalText = saveBtn.innerHTML;

    saveBtn.innerHTML = `
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
        </svg>
        Saving...
    `;
    saveBtn.disabled = true;

    // Simulate API call
    setTimeout(() => {
        // Collect form data
        const formData = {
            firstName: document.getElementById('firstName')?.value,
            lastName: document.getElementById('lastName')?.value,
            email: document.getElementById('email')?.value,
            phone: document.getElementById('phone')?.value,
            university: document.getElementById('university')?.value,
            coachTitle: document.getElementById('coachTitle')?.value,
            profileVisibility: document.getElementById('profileVisibility')?.value,
            messagePermissions: document.getElementById('messagePermissions')?.value
        };

        console.log('Saving settings:', formData);

        // Show success message
        showNotification('Settings saved successfully!', 'success');

        // Reset button
        saveBtn.innerHTML = originalText;
        saveBtn.disabled = false;

        // Reset modified state
        resetModifiedState();
    }, 1500);
}

// Discard Changes
function discardChanges() {
    if (confirm('Are you sure you want to discard all changes?')) {
        // Reload the page to reset all form values
        location.reload();
    }
}

// Reset Modified State
function resetModifiedState() {
    const saveBtn = document.getElementById('saveChangesBtn');
    const discardBtn = document.getElementById('discardBtn');

    if (saveBtn && discardBtn) {
        saveBtn.style.opacity = '0.6';
        saveBtn.style.pointerEvents = 'none';
        discardBtn.style.opacity = '0.6';
        discardBtn.style.pointerEvents = 'none';
    }
}

// Delete Account
function initializeDeleteAccount() {
    const deleteBtn = document.getElementById('deleteAccountBtn');

    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            showDeleteAccountModal();
        });
    }
}

// Show Delete Account Modal
function showDeleteAccountModal() {
    const confirmed = confirm(
        'WARNING: This will permanently delete your account and all associated data.\n\n' +
        'This action cannot be undone. Are you absolutely sure you want to continue?'
    );

    if (confirmed) {
        const doubleConfirm = confirm(
            'Please confirm one more time:\n\n' +
            'I understand that my account and all data will be permanently deleted.'
        );

        if (doubleConfirm) {
            // In a real app, this would call an API endpoint
            console.log('Account deletion requested');
            showNotification('Account deletion request submitted. You will receive a confirmation email.', 'warning');
        }
    }
}

// Show Notification
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${type === 'success' ? '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>' :
                  type === 'warning' ? '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>' :
                  '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'}
            </svg>
            <span>${message}</span>
        </div>
        <button class="notification-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .notification {
            position: fixed;
            top: 2rem;
            right: 2rem;
            background: rgba(254, 252, 251, 0.05);
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 12px;
            padding: 1rem 1.5rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            z-index: 10000;
            min-width: 300px;
            max-width: 500px;
            backdrop-filter: blur(10px);
            animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }

        .notification-success {
            border-color: var(--cerulean);
            background: rgba(18, 130, 162, 0.15);
        }

        .notification-warning {
            border-color: var(--accent-orange);
            background: rgba(255, 107, 53, 0.15);
        }

        .notification-content {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            flex: 1;
        }

        .notification-content svg {
            width: 24px;
            height: 24px;
            flex-shrink: 0;
        }

        .notification-success .notification-content svg {
            color: var(--cerulean);
        }

        .notification-warning .notification-content svg {
            color: var(--accent-orange);
        }

        .notification-content span {
            color: var(--white);
            font-size: 0.95rem;
            font-weight: 500;
        }

        .notification-close {
            background: transparent;
            border: none;
            color: rgba(254, 252, 251, 0.6);
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s ease;
        }

        .notification-close:hover {
            color: var(--white);
        }

        .notification-close svg {
            width: 18px;
            height: 18px;
        }

        .spin {
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            from {
                transform: rotate(0deg);
            }
            to {
                transform: rotate(360deg);
            }
        }
    `;

    if (!document.querySelector('style[data-notification-styles]')) {
        style.setAttribute('data-notification-styles', 'true');
        document.head.appendChild(style);
    }

    // Add to page
    document.body.appendChild(notification);

    // Close button
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Password Change Handler
document.addEventListener('DOMContentLoaded', function() {
    const updatePasswordBtn = document.querySelector('.btn-secondary');

    if (updatePasswordBtn) {
        updatePasswordBtn.addEventListener('click', function(e) {
            e.preventDefault();

            const currentPassword = document.getElementById('currentPassword')?.value;
            const newPassword = document.getElementById('newPassword')?.value;
            const confirmPassword = document.getElementById('confirmPassword')?.value;

            // Validation
            if (!currentPassword || !newPassword || !confirmPassword) {
                showNotification('Please fill in all password fields', 'warning');
                return;
            }

            if (newPassword !== confirmPassword) {
                showNotification('New passwords do not match', 'warning');
                return;
            }

            if (newPassword.length < 8) {
                showNotification('Password must be at least 8 characters long', 'warning');
                return;
            }

            // Simulate password update
            const originalText = this.textContent;
            this.textContent = 'Updating...';
            this.disabled = true;

            setTimeout(() => {
                showNotification('Password updated successfully!', 'success');
                this.textContent = originalText;
                this.disabled = false;

                // Clear password fields
                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
                document.getElementById('confirmPassword').value = '';
            }, 1500);
        });
    }
});

// Session Revoke Handlers
document.addEventListener('DOMContentLoaded', function() {
    const revokeButtons = document.querySelectorAll('.btn-session-revoke');

    revokeButtons.forEach(button => {
        button.addEventListener('click', function() {
            if (confirm('Are you sure you want to revoke this session?')) {
                const sessionItem = this.closest('.session-item');
                const sessionName = sessionItem.querySelector('.session-name').textContent;

                // Simulate session revocation
                this.textContent = 'Revoking...';
                this.disabled = true;

                setTimeout(() => {
                    sessionItem.style.opacity = '0';
                    setTimeout(() => {
                        sessionItem.remove();
                        showNotification(`Session "${sessionName}" has been revoked`, 'success');
                    }, 300);
                }, 1000);
            }
        });
    });
});

// Initialize button states on page load
document.addEventListener('DOMContentLoaded', function() {
    resetModifiedState();
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