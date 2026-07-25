// Shared Settings Page JavaScript
// Uses API_BASE_URL from shared/api.js

document.addEventListener('DOMContentLoaded', function() {
    // Initialize settings functionality
    initializeSettingsNavigation();
    initializeFormHandlers();
    initializeToggleSwitches();
    initializeSaveButtons();
    initializeDataExport();
    initializePushToggle();
    initializeDeleteAccount();
    initializePasswordChange();
    initializeEmailChange();

    // Set initial button states
    resetModifiedState();

    // Load user data
    loadUserSettings();

    // Initialize profile type switching
    initializeProfileTypeSwitching();

    // Initialize subscription section
    initializeSubscriptionSection();
});

// Load user settings from API or localStorage
async function loadUserSettings() {
    try {
        if (!API.isAuthenticated()) {
            return;
        }

        const apiUrl = `${API_BASE_URL}/auth/me`;

        const response = await fetch(apiUrl, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();

            const currentEmailEl = document.getElementById('currentEmail');

            // Set current email from user object
            if (currentEmailEl && data.user && data.user.email) {
                currentEmailEl.value = data.user.email;
            }

            // Populate other form data
            populateSettingsForm(data);
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Failed to load settings.');
    }
}

// Populate form with user data
function populateSettingsForm(data) {
    // Email is stored in user object, not profile
    // Don't overwrite the email here - it's already set from data.user.email above

    // Set profile visibility if available
    if (data.profile && data.profile.profile_visibility) {
        const profileVisibilityEl = document.getElementById('profileVisibility');
        if (profileVisibilityEl) {
            profileVisibilityEl.value = data.profile.profile_visibility;
            profileVisibilityEl.dataset.originalValue = data.profile.profile_visibility;
        }
    }

    // Set message permissions if available
    if (data.profile && data.profile.message_permissions) {
        const messagePermissionsEl = document.getElementById('messagePermissions');
        if (messagePermissionsEl) {
            messagePermissionsEl.value = data.profile.message_permissions;
            messagePermissionsEl.dataset.originalValue = data.profile.message_permissions;
        }
    }

    // Reflect the account's push preference on the iOS push toggle (default on).
    const pushToggle = document.getElementById('pushEnabledToggle');
    if (pushToggle && data.user) {
        pushToggle.checked = data.user.push_enabled !== false;
        pushToggle.dataset.originalChecked = pushToggle.checked;
    }
}

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

            // Hide save/discard footer on sections that don't use it
            const footer = document.querySelector('.settings-footer');
            if (footer) {
                const noFooterSections = ['profileType', 'subscription', 'security', 'blockedUsers'];
                footer.style.display = noFooterSections.includes(targetSection) ? 'none' : '';
            }

            // Lazy-init the Blocked Users section the first time it opens
            // (and refresh whenever the user re-enters it).
            if (targetSection === 'blockedUsers' && typeof window.initializeBlockedUsersSection === 'function') {
                window.initializeBlockedUsersSection();
            }

            // Scroll to top of settings content on mobile
            if (window.innerWidth <= 768) {
                document.querySelector('.settings-content').scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });

    // Auto-navigate to a section via URL hash (e.g., settings.html#profile-type).
    // #security is used by the paywall's "Delete Account" link so a gated user can
    // reach the delete flow directly without hunting through the nav.
    const hashSectionMap = {
        '#profile-type': 'profileType',
        '#security': 'security'
    };
    const targetSection = hashSectionMap[window.location.hash];
    if (targetSection) {
        const navBtn = document.querySelector(`.settings-nav-btn[data-section="${targetSection}"]`);
        if (navBtn) {
            navBtn.click();
        }
    }
}

// Form Handlers
function initializeFormHandlers() {
    const inputs = document.querySelectorAll('.form-input, .form-select');

    // IDs of fields that should NOT trigger Save Changes (handled separately)
    const excludedFieldIds = [
        // Email change fields
        'currentEmail', 'newEmail', 'confirmEmail', 'emailChangePassword',
        // Password change fields
        'currentPassword', 'newPassword', 'confirmPassword',
        // Forgot password modal fields
        'forgotNewPassword', 'forgotConfirmPassword'
    ];

    inputs.forEach(input => {
        // Store original value
        input.dataset.originalValue = input.value;

        // Skip excluded fields - they have their own separate handling
        if (excludedFieldIds.includes(input.id)) {
            return;
        }

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

    // Toggles that should NOT trigger the generic Save Changes flow. Email prefs
    // are coming-soon; pushEnabled self-saves immediately via initializePushToggle.
    const excludedFromSave = ['emailMarketing', 'emailWeeklySummary', 'emailRecruitingNews', 'pushEnabled'];

    toggles.forEach(toggle => {
        // Store original value
        toggle.dataset.originalChecked = toggle.checked;

        // Skip disabled toggles and toggles that manage their own save
        const settingName = toggle.dataset.setting;
        if (toggle.disabled || excludedFromSave.includes(settingName)) {
            return;
        }

        toggle.addEventListener('change', function() {
            markFormAsModified();
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

// Track if form has been modified
let formModified = false;

// Mark Form as Modified
function markFormAsModified() {
    formModified = true;
    const saveBtn = document.getElementById('saveChangesBtn');
    const discardBtn = document.getElementById('discardBtn');

    if (saveBtn && discardBtn) {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        discardBtn.disabled = false;
        discardBtn.style.opacity = '1';
    }
}

// Reset Modified State
function resetModifiedState() {
    formModified = false;
    const saveBtn = document.getElementById('saveChangesBtn');
    const discardBtn = document.getElementById('discardBtn');

    if (saveBtn && discardBtn) {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.5';
        discardBtn.disabled = true;
        discardBtn.style.opacity = '0.5';
    }
}

// Collect all settings data
function collectSettingsData() {
    const data = {
        // Privacy
        profileVisibility: document.getElementById('profileVisibility')?.value || 'everyone',
        messagePermissions: document.getElementById('messagePermissions')?.value || 'everyone',

        // Email preferences
        emailMarketing: document.querySelector('[data-setting="emailMarketing"]')?.checked || false,
        emailWeeklySummary: document.querySelector('[data-setting="emailWeeklySummary"]')?.checked || false,
        emailRecruitingNews: document.querySelector('[data-setting="emailRecruitingNews"]')?.checked || false,

        // Privacy toggles
        showInSearch: document.querySelector('[data-setting="showInSearch"]')?.checked || false,
        showContactInfo: document.querySelector('[data-setting="showContactInfo"]')?.checked || false,
        analyticsTracking: document.querySelector('[data-setting="analyticsTracking"]')?.checked || false,

        // Notification preferences
        notifyMessages: document.querySelector('[data-setting="notifyMessages"]')?.checked || false,
        notifyProfileViews: document.querySelector('[data-setting="notifyProfileViews"]')?.checked || false,
        notifyFollowers: document.querySelector('[data-setting="notifyFollowers"]')?.checked || false,
        notifyInteractions: document.querySelector('[data-setting="notifyInteractions"]')?.checked || false,

        // Push notifications (pushEnabled) self-saves immediately via its own
        // handler (initializePushToggle) and is intentionally NOT included here.

        // Activity visibility
        showOnlineStatus: document.querySelector('[data-setting="showOnlineStatus"]')?.checked || false,
        showActivityFeed: document.querySelector('[data-setting="showActivityFeed"]')?.checked || false,

        // NIL Brand (only for other profiles)
        isNilBrand: document.querySelector('[data-setting="isNilBrand"]')?.checked || false
    };

    return data;
}

// Save Settings
async function saveSettings() {
    const saveBtn = document.getElementById('saveChangesBtn');
    const originalContent = saveBtn.innerHTML;

    // Show loading state
    saveBtn.innerHTML = `
        <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
        </svg>
        Saving...
    `;
    saveBtn.disabled = true;

    // Collect form data
    const formData = collectSettingsData();

    try {
        // Save privacy settings (profile visibility, message permissions)
        const response = await fetch(`${API_BASE_URL}/settings/privacy`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                profile_visibility: formData.profileVisibility,
                message_permissions: formData.messagePermissions
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to save settings');
        }

        // Also save to localStorage as backup
        localStorage.setItem('userSettings', JSON.stringify(formData));

        // Show success message
        showNotification('Settings saved successfully!', 'success');

        // Reset modified state
        resetModifiedState();

        // Update original values
        document.querySelectorAll('.form-input, .form-select').forEach(input => {
            input.dataset.originalValue = input.value;
        });
        document.querySelectorAll('.toggle-switch input').forEach(toggle => {
            toggle.dataset.originalChecked = toggle.checked;
        });
    } catch (error) {
        showNotification(error.message || 'Failed to save settings', 'error');
    } finally {
        // Reset button
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;
    }
}

// Discard Changes
async function discardChanges() {
    if (!formModified) return;

    if (await showConfirmModal({ title: 'Discard Changes', message: 'Are you sure you want to discard all changes?', confirmText: 'Discard', cancelText: 'Keep Editing' })) {
        // Reset form inputs to original values
        document.querySelectorAll('.form-input, .form-select').forEach(input => {
            if (input.dataset.originalValue !== undefined) {
                input.value = input.dataset.originalValue;
            }
        });

        // Reset toggles to original values
        document.querySelectorAll('.toggle-switch input').forEach(toggle => {
            if (toggle.dataset.originalChecked !== undefined) {
                toggle.checked = toggle.dataset.originalChecked === 'true';
            }
        });

        resetModifiedState();
        showNotification('Changes discarded', 'warning');
    }
}

// Download My Data (data portability / right of access)
function initializeDataExport() {
    const exportBtn = document.getElementById('exportDataBtn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', async function() {
        const originalText = exportBtn.textContent;
        exportBtn.disabled = true;
        exportBtn.textContent = 'Preparing...';

        try {
            // iOS Bearer fallback, mirroring the delete-account handler: the raw
            // fetch must carry the stored token because the cookie path is
            // unreliable in the WebView. Gated to the iOS app so web is unaffected.
            const headers = {};
            if (window.API && API.isIOSApp && API.isIOSApp() && API.getAuthToken) {
                const t = API.getAuthToken();
                if (t) headers.Authorization = 'Bearer ' + t;
            }

            const response = await fetch(`${API_BASE_URL}/settings/account/export`, {
                method: 'GET',
                credentials: 'include',
                headers
            });

            if (!response.ok) {
                let msg = 'Failed to export your data';
                try { const body = await response.json(); if (body.error) msg = body.error; } catch (_) {}
                throw new Error(msg);
            }

            // Stream the JSON file to a download. Derive the filename from the
            // Content-Disposition header the server sets, with a sane fallback.
            const blob = await response.blob();
            let filename = 'direct-recruit-data.json';
            const cd = response.headers.get('Content-Disposition');
            if (cd) {
                const match = cd.match(/filename="?([^"]+)"?/i);
                if (match && match[1]) filename = match[1];
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            showNotification('Your data download has started.', 'success');
        } catch (err) {
            showNotification(err.message || 'Failed to export your data', 'error');
        } finally {
            exportBtn.disabled = false;
            exportBtn.textContent = originalText;
        }
    });
}

// iOS Push Notifications toggle.
// The card is hidden on desktop web and only revealed inside the iOS app. The
// toggle self-saves immediately on change (it controls OS-level push
// registration), independent of the Save/Discard flow. Account-wide on/off:
// the backend users.push_enabled flag is the source of truth that notifyUser()
// checks before sending ANY push, so this one switch governs every notification
// type. Default ON.
function initializePushToggle() {
    const card = document.getElementById('pushNotificationsCard');
    const toggle = document.getElementById('pushEnabledToggle');
    if (!card || !toggle) return;

    // Desktop web: leave the card hidden and do nothing.
    if (!(window.API && API.isIOSApp && API.isIOSApp())) {
        return;
    }

    // Inside the iOS app: reveal the card.
    card.style.display = '';

    toggle.addEventListener('change', async function () {
        const wantOn = toggle.checked;
        toggle.disabled = true;
        try {
            if (wantOn) {
                // Turning ON: ensure OS permission, then register + persist.
                const Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications;
                if (Push) {
                    let perm = await Push.checkPermissions().catch(() => null);
                    if (!perm || perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
                        perm = await Push.requestPermissions();
                    }
                    if (!perm || perm.receive !== 'granted') {
                        // OS denied (and can't be re-prompted from the app). Revert
                        // the toggle and guide the user to iOS Settings.
                        toggle.checked = false;
                        showToast('Turn on notifications for Direct Recruit in your iPhone Settings to enable push.', 'warning');
                        return;
                    }
                    // Re-register so the APNs token is (re)sent to the backend.
                    await Push.register();
                }
                await API.deviceTokens.setPushPreference(true);
                toggle.dataset.originalChecked = 'true';
                showToast('Push notifications turned on.', 'success');
            } else {
                // Turning OFF: server-side off only (cannot revoke OS permission
                // from inside the app, and we don't need to).
                await API.deviceTokens.setPushPreference(false);
                toggle.dataset.originalChecked = 'false';
                showToast('Push notifications turned off.', 'success');
            }
        } catch (err) {
            // Revert to the last-known state on any failure.
            toggle.checked = toggle.dataset.originalChecked === 'true';
            showToast('Could not update push notifications. Please try again.', 'error');
        } finally {
            toggle.disabled = false;
        }
    });
}

// Delete Account
function initializeDeleteAccount() {
    const deleteBtn = document.getElementById('deleteAccountBtn');

    if (deleteBtn) {
        deleteBtn.addEventListener('click', function() {
            openDeleteAccountModal();
        });
    }

    // Initialize delete account modal handlers
    initializeDeleteAccountModal();
}

function initializeDeleteAccountModal() {
    const modal = document.getElementById('deleteAccountModal');
    const overlay = document.getElementById('deleteAccountModalOverlay');
    const closeBtn = document.getElementById('closeDeleteAccountModal');
    const cancelBtn = document.getElementById('cancelDeleteAccount');
    const confirmBtn = document.getElementById('confirmDeleteAccount');

    // Close handlers
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDeleteAccountModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeDeleteAccountModal);
    }

    if (overlay) {
        overlay.addEventListener('click', closeDeleteAccountModal);
    }

    // Confirm delete handler
    if (confirmBtn) {
        confirmBtn.addEventListener('click', handleDeleteAccount);
    }

    // Clear error when typing in password field
    const passwordInput = document.getElementById('deleteAccountPassword');
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            clearDeleteAccountError();
        });
    }
}

function openDeleteAccountModal() {
    const modal = document.getElementById('deleteAccountModal');

    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Clear previous state
        const passwordInput = document.getElementById('deleteAccountPassword');
        if (passwordInput) {
            passwordInput.value = '';
        }
        clearDeleteAccountError();

        // Subscription notice (state-aware): if a live subscription is still
        // billing, show the plan, how it's paid, and what deletion does to it.
        // Stripe subs are cancelled automatically by the delete endpoint; Apple
        // subs CANNOT be cancelled server-side — only the user can, on-device —
        // so that branch warns and deep-links to Apple's subscription manager.
        (async () => {
            try {
                if (document.getElementById('deleteSubNotice')) return;
                const sub = await API.payments.getSubscriptionStatus();
                const billing = sub && (sub.status === 'active' || sub.status === 'past_due' || sub.status === 'trialing') && !sub.cancelAtPeriodEnd;
                if (!billing || (sub.source !== 'stripe' && sub.source !== 'apple_iap')) return;

                const anchor = modal.querySelector('.delete-account-warning-box');
                if (!anchor) return;

                const isApple = sub.source === 'apple_iap';
                const plan = (typeof PLAN_DISPLAY !== 'undefined' && PLAN_DISPLAY[sub.tier]) || null;
                // Apple Guideline 3.1.1: don't show $ prices inside the iOS app.
                const planLabel = plan ? (API.isIOSApp() ? plan.name : plan.name + ' (' + plan.price + ')') : 'Subscription';
                const paidVia = isApple ? 'Apple (iOS App Store)' : 'Card (Stripe)';

                const box = document.createElement('div');
                box.id = 'deleteSubNotice';
                box.style.cssText = 'margin-top:10px;padding:12px 14px;border-radius:8px;text-align:left;'
                    + (isApple
                        ? 'border:1px solid rgba(239,68,68,0.45);background:rgba(239,68,68,0.08);'
                        : 'border:1px solid rgba(18,130,162,0.45);background:rgba(18,130,162,0.08);');
                box.innerHTML =
                    '<p style="margin:0 0 6px;color:#ccd6f6;font-size:0.85rem;"><strong>Active plan:</strong> '
                    + planLabel + ' &middot; <strong>Paid via:</strong> ' + paidVia + '</p>'
                    + (isApple
                        ? '<p style="margin:0;color:#fca5a5;font-size:0.85rem;line-height:1.5;"><strong>Deleting your account does NOT cancel your Apple subscription.</strong> Cancel it in Settings &gt; Apple ID &gt; Subscriptions, or you will keep being charged.</p>'
                        : '<p style="margin:0;color:#8892b0;font-size:0.85rem;line-height:1.5;">Your subscription will be <strong style="color:#ccd6f6;">discontinued automatically</strong> when your account is deleted. No further charges.</p>');
                if (isApple) {
                    const appleBtn = document.createElement('button');
                    appleBtn.id = 'deleteManageAppleBtn';
                    appleBtn.type = 'button';
                    appleBtn.textContent = 'Cancel in Apple Subscriptions';
                    appleBtn.style.cssText = 'margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid rgba(239,68,68,0.6);background:transparent;color:#fca5a5;font-size:0.85rem;cursor:pointer;font-family:inherit;';
                    appleBtn.addEventListener('click', () => {
                        // Same deep link as the Subscription tab's "Manage in Apple
                        // Subscriptions" button (works in the WKWebView and Safari).
                        window.open('https://apps.apple.com/account/subscriptions', '_blank');
                    });
                    box.appendChild(appleBtn);
                }
                anchor.insertAdjacentElement('afterend', box);
            } catch (_) { /* notice is best-effort */ }
        })();

        // Focus password input
        setTimeout(() => {
            if (passwordInput) passwordInput.focus();
        }, 100);
    }
}

function closeDeleteAccountModal() {
    const modal = document.getElementById('deleteAccountModal');

    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Clear password field
    const passwordInput = document.getElementById('deleteAccountPassword');
    if (passwordInput) {
        passwordInput.value = '';
    }
    clearDeleteAccountError();
}

function showDeleteAccountError(message) {
    const errorEl = document.getElementById('deleteAccountError');
    if (errorEl) {
        errorEl.textContent = message;
    }
}

function clearDeleteAccountError() {
    const errorEl = document.getElementById('deleteAccountError');
    if (errorEl) {
        errorEl.textContent = '';
    }
}

async function handleDeleteAccount() {
    const passwordInput = document.getElementById('deleteAccountPassword');
    const password = passwordInput?.value;

    if (!password) {
        showDeleteAccountError('Please enter your password to confirm deletion');
        return;
    }

    const confirmBtn = document.getElementById('confirmDeleteAccount');
    const originalText = confirmBtn.textContent;
    confirmBtn.textContent = 'Deleting...';
    confirmBtn.disabled = true;

    clearDeleteAccountError();

    try {
        // iOS Bearer fallback: this raw fetch must carry the stored token (the cookie
        // path is unreliable in the WebView). API.isIOSApp()-gated so web is unaffected.
        // Without it, account deletion 401s in the iOS app (cookie not re-attached).
        const _delHeaders = { 'Content-Type': 'application/json' };
        if (window.API && API.isIOSApp && API.isIOSApp() && API.getAuthToken) {
            const _t = API.getAuthToken();
            if (_t) _delHeaders.Authorization = 'Bearer ' + _t;
        }
        const response = await fetch(`${API_BASE_URL}/settings/account/delete`, {
            method: 'DELETE',
            credentials: 'include',
            headers: _delHeaders,
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete account');
        }

        // Success - close modal and logout
        closeDeleteAccountModal();

        // Clear all auth data
        API.clearAuth();
        localStorage.removeItem('userSettings');

        // Show success notification briefly then redirect
        showNotification('Your account has been deleted. We\'re sorry to see you go.', 'success');

        // Clear form modified state to prevent beforeunload warning
        formModified = false;

        // Redirect to landing page after a short delay
        setTimeout(() => {
            window.location.href = '/';
        }, 2000);

    } catch (error) {
        showDeleteAccountError(error.message || 'Failed to delete account');
    } finally {
        confirmBtn.textContent = originalText;
        confirmBtn.disabled = false;
    }
}

// Password Change Handler
function initializePasswordChange() {
    const updatePasswordBtn = document.getElementById('updatePasswordBtn');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    if (updatePasswordBtn) {
        updatePasswordBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handlePasswordChange(this);
        });
    }

    // Initialize password validation
    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            validatePasswordRequirements(this.value);

            // Also check password match if confirm has value
            if (confirmPasswordInput && confirmPasswordInput.value) {
                checkPasswordMatch();
            }
        });
    }

    // Initialize confirm password match checking
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', checkPasswordMatch);
    }
}

// Password validation functions
function validatePasswordRequirements(password) {
    const checkLength = document.getElementById('checkLength');
    const checkUppercase = document.getElementById('checkUppercase');
    const checkLowercase = document.getElementById('checkLowercase');
    const checkNumber = document.getElementById('checkNumber');
    const checkSpecial = document.getElementById('checkSpecial');

    // Check each criteria
    const hasLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*]/.test(password);

    // Update checklist
    updateChecklistItem(checkLength, hasLength);
    updateChecklistItem(checkUppercase, hasUpperCase);
    updateChecklistItem(checkLowercase, hasLowerCase);
    updateChecklistItem(checkNumber, hasNumber);
    updateChecklistItem(checkSpecial, hasSpecialChar);

    // Store validity on the input element
    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput) {
        const allValid = hasLength && hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar;
        newPasswordInput.dataset.valid = allValid;
    }
}

function updateChecklistItem(element, isValid) {
    if (!element) return;
    const icon = element.querySelector('.check-icon');
    if (isValid) {
        element.classList.add('valid');
        if (icon) icon.innerHTML = '&#10003;'; // Checkmark
    } else {
        element.classList.remove('valid');
        if (icon) icon.innerHTML = '&#10005;'; // X mark
    }
}

function checkPasswordMatch() {
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    const matchMsg = document.getElementById('passwordMatchMessage');

    if (!matchMsg) return;

    // Don't show message if confirm password is empty
    if (!confirmPassword) {
        matchMsg.textContent = '';
        matchMsg.className = 'password-match-message';
        return;
    }

    // Check if passwords match
    if (newPassword === confirmPassword) {
        matchMsg.textContent = 'Passwords match!';
        matchMsg.className = 'password-match-message show match';
    } else {
        matchMsg.textContent = 'Passwords do not match';
        matchMsg.className = 'password-match-message show no-match';
    }
}

function resetPasswordChecklist() {
    const checklistItems = ['checkLength', 'checkUppercase', 'checkLowercase', 'checkNumber', 'checkSpecial'];
    checklistItems.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.classList.remove('valid');
            const icon = element.querySelector('.check-icon');
            if (icon) icon.innerHTML = '&#10005;';
        }
    });

    // Clear password match message
    const matchMsg = document.getElementById('passwordMatchMessage');
    if (matchMsg) {
        matchMsg.textContent = '';
        matchMsg.className = 'password-match-message';
    }

    // Reset validity
    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput) {
        newPasswordInput.dataset.valid = 'false';
    }
}

async function handlePasswordChange(button) {
    const currentPassword = document.getElementById('currentPassword')?.value;
    const newPassword = document.getElementById('newPassword')?.value;
    const confirmPassword = document.getElementById('confirmPassword')?.value;
    const newPasswordInput = document.getElementById('newPassword');

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
        showNotification('Please fill in all password fields', 'warning');
        return;
    }

    // Check if password meets all requirements
    if (newPasswordInput?.dataset.valid !== 'true') {
        showNotification('Please make sure your password meets all requirements', 'warning');
        return;
    }

    if (newPassword !== confirmPassword) {
        showNotification('New passwords do not match', 'warning');
        return;
    }

    // Check if new password is same as current password
    if (currentPassword === newPassword) {
        showNotification('New password must be different from your current password', 'warning');
        return;
    }

    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Updating...';
    button.disabled = true;

    try {
        // iOS Bearer fallback: this raw fetch must carry the stored token (the cookie
        // path is unreliable in the WebView). API.isIOSApp()-gated so web is unaffected.
        const _pwHeaders = { 'Content-Type': 'application/json' };
        if (window.API && API.isIOSApp && API.isIOSApp() && API.getAuthToken) {
            const _t = API.getAuthToken();
            if (_t) _pwHeaders.Authorization = 'Bearer ' + _t;
        }
        const response = await fetch(`${API_BASE_URL}/settings/password/change`, {
            method: 'POST',
            credentials: 'include',
            headers: _pwHeaders,
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to change password');
        }

        // The password change rotates the JWT (revokes old sessions). Persist the new
        // token so the iOS session survives — otherwise the next request 401s.
        if (data.token && window.API && API.setAuthToken) API.setAuthToken(data.token);

        showNotification('Password updated successfully! A confirmation email has been sent.', 'success');

        // Clear password fields
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';

        // Reset password checklist
        resetPasswordChecklist();

    } catch (error) {
        showNotification(error.message || 'Failed to change password', 'error');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Email Change Handler
let emailChangeData = null; // Store data needed for verification
let emailCheckTimeout = null; // Debounce timer for email availability check

function initializeEmailChange() {
    const updateEmailBtn = document.getElementById('updateEmailBtn');

    if (updateEmailBtn) {
        updateEmailBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handleEmailChangeRequest(this);
        });
    }

    // Initialize email availability checking
    initializeEmailAvailabilityCheck();

    // Initialize verification modal handlers
    initializeEmailVerificationModal();
}

function initializeEmailAvailabilityCheck() {
    const newEmailInput = document.getElementById('newEmail');
    const confirmEmailInput = document.getElementById('confirmEmail');

    if (newEmailInput) {
        newEmailInput.addEventListener('input', function() {
            // Clear previous timeout
            if (emailCheckTimeout) {
                clearTimeout(emailCheckTimeout);
            }

            const email = this.value.trim();

            // Reset message if empty
            if (!email) {
                hideEmailAvailabilityMessage();
                return;
            }

            // Basic email validation before checking
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                hideEmailAvailabilityMessage();
                return;
            }

            // Show checking state
            showEmailAvailabilityMessage('Checking availability...', 'checking');

            // Debounce the API call (500ms delay)
            emailCheckTimeout = setTimeout(() => {
                checkEmailAvailability(email);
            }, 500);

            // Also check if confirm email matches when new email changes
            if (confirmEmailInput && confirmEmailInput.value.trim()) {
                checkEmailMatch();
            }
        });
    }

    // Initialize email match checking
    if (confirmEmailInput) {
        confirmEmailInput.addEventListener('input', checkEmailMatch);
    }
}

function checkEmailMatch() {
    const newEmail = document.getElementById('newEmail')?.value.trim();
    const confirmEmail = document.getElementById('confirmEmail')?.value.trim();
    const matchMsg = document.getElementById('emailMatchMessage');

    if (!matchMsg) return;

    // Don't show message if confirm email is empty
    if (!confirmEmail) {
        hideEmailMatchMessage();
        return;
    }

    // Check if emails match
    if (newEmail === confirmEmail) {
        showEmailMatchMessage('Emails match', 'match');
    } else {
        showEmailMatchMessage('Emails do not match', 'no-match');
    }
}

function showEmailMatchMessage(message, status) {
    const matchMsg = document.getElementById('emailMatchMessage');
    if (matchMsg) {
        matchMsg.textContent = message;
        matchMsg.className = 'email-match-message show ' + status;
    }
}

function hideEmailMatchMessage() {
    const matchMsg = document.getElementById('emailMatchMessage');
    if (matchMsg) {
        matchMsg.textContent = '';
        matchMsg.className = 'email-match-message';
    }
}

async function checkEmailAvailability(email) {
    try {
        const currentEmail = document.getElementById('currentEmail')?.value;

        // Don't check if it's the same as current email
        if (email === currentEmail) {
            showEmailAvailabilityMessage('This is your current email', 'unavailable');
            return;
        }

        const response = await fetch(`${API_BASE_URL}/settings/email/check-availability?email=${encodeURIComponent(email)}`, {
            credentials: 'include'
        });

        const data = await response.json();

        if (!response.ok) {
            hideEmailAvailabilityMessage();
            return;
        }

        if (data.available) {
            showEmailAvailabilityMessage('Email is available', 'available');
        } else {
            showEmailAvailabilityMessage('This email is already in use', 'unavailable');
        }
    } catch (error) {
        hideEmailAvailabilityMessage();
    }
}

function showEmailAvailabilityMessage(message, status) {
    const availabilityMsg = document.getElementById('emailAvailabilityMessage');
    if (availabilityMsg) {
        availabilityMsg.textContent = message;
        availabilityMsg.className = 'email-availability-message show ' + status;
    }
}

function hideEmailAvailabilityMessage() {
    const availabilityMsg = document.getElementById('emailAvailabilityMessage');
    if (availabilityMsg) {
        availabilityMsg.textContent = '';
        availabilityMsg.className = 'email-availability-message';
    }
}

function initializeEmailVerificationModal() {
    // Close modal handlers
    const modal = document.getElementById('emailVerificationModal');
    const closeBtn = document.getElementById('closeEmailVerificationModal');
    const cancelBtn = document.getElementById('cancelEmailVerification');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeEmailVerificationModal);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeEmailVerificationModal);
    }

    // Close on overlay click
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeEmailVerificationModal();
            }
        });
    }

    // Verify button handler
    const verifyBtn = document.getElementById('verifyEmailCodeBtn');
    if (verifyBtn) {
        verifyBtn.addEventListener('click', handleEmailVerification);
    }

    // Resend code handler
    const resendBtn = document.getElementById('resendEmailCodeBtn');
    if (resendBtn) {
        resendBtn.addEventListener('click', handleResendEmailCode);
    }

    // Auto-focus next input on code entry
    const codeInputs = document.querySelectorAll('.verification-code-input');
    codeInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            const value = e.target.value;

            // Only allow numbers
            if (!/^\d*$/.test(value)) {
                e.target.value = '';
                return;
            }

            // Mark as filled
            if (value) {
                input.classList.add('filled');
                // Move to next input
                if (index < codeInputs.length - 1) {
                    codeInputs[index + 1].focus();
                }
            } else {
                input.classList.remove('filled');
            }

            // Clear error state when typing
            clearVerificationError();
        });

        input.addEventListener('keydown', function(e) {
            // Handle backspace
            if (e.key === 'Backspace' && !input.value && index > 0) {
                codeInputs[index - 1].focus();
                codeInputs[index - 1].value = '';
                codeInputs[index - 1].classList.remove('filled');
            }

            // Handle arrow keys
            if (e.key === 'ArrowLeft' && index > 0) {
                e.preventDefault();
                codeInputs[index - 1].focus();
            }
            if (e.key === 'ArrowRight' && index < codeInputs.length - 1) {
                e.preventDefault();
                codeInputs[index + 1].focus();
            }
        });

        // Allow paste of full code
        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            pastedData.split('').forEach((char, i) => {
                if (codeInputs[i]) {
                    codeInputs[i].value = char;
                    codeInputs[i].classList.add('filled');
                }
            });
            if (pastedData.length > 0) {
                codeInputs[Math.min(pastedData.length, codeInputs.length - 1)].focus();
            }
        });
    });
}

function clearVerificationError() {
    const errorMsg = document.getElementById('emailVerificationError');
    if (errorMsg) {
        errorMsg.textContent = '';
        errorMsg.style.display = 'none';
    }
    const codeInputs = document.querySelectorAll('.verification-code-input');
    codeInputs.forEach(input => input.classList.remove('error'));
}

async function handleEmailChangeRequest(button) {
    const currentEmail = document.getElementById('currentEmail')?.value;
    const newEmail = document.getElementById('newEmail')?.value;
    const confirmEmail = document.getElementById('confirmEmail')?.value;
    const password = document.getElementById('emailChangePassword')?.value;

    // Validation
    if (!newEmail || !confirmEmail) {
        showNotification('Please fill in all email fields', 'warning');
        return;
    }

    if (!password) {
        showNotification('Please enter your password to change email', 'warning');
        return;
    }

    if (newEmail !== confirmEmail) {
        showNotification('Email addresses do not match', 'warning');
        return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
        showNotification('Please enter a valid email address', 'warning');
        return;
    }

    if (newEmail === currentEmail) {
        showNotification('New email must be different from current email', 'warning');
        return;
    }

    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Sending code...';
    button.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/settings/email/request-change`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newEmail, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to request email change');
        }

        // Store data for verification step (no accessToken needed - we use our own verification)
        emailChangeData = {
            newEmail: newEmail
        };

        // Show verification modal
        showEmailVerificationModal(newEmail);

        // Clear password field
        document.getElementById('emailChangePassword').value = '';

    } catch (error) {
        showNotification(error.message || 'Failed to request email change', 'error');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

function showEmailVerificationModal(email) {
    const modal = document.getElementById('emailVerificationModal');
    const emailDisplay = document.getElementById('verificationEmailDisplay');

    if (emailDisplay) {
        emailDisplay.textContent = email;
    }

    // Clear previous code inputs
    const codeInputs = document.querySelectorAll('.verification-code-input');
    codeInputs.forEach(input => {
        input.value = '';
    });

    // Focus first input
    if (codeInputs[0]) {
        setTimeout(() => codeInputs[0].focus(), 100);
    }

    // Show modal
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    // Clear any error/success messages
    const errorMsg = document.getElementById('emailVerificationError');
    if (errorMsg) {
        errorMsg.style.display = 'none';
        errorMsg.textContent = '';
    }
    const successMsg = document.getElementById('emailVerificationSuccess');
    if (successMsg) {
        successMsg.style.display = 'none';
        successMsg.textContent = '';
    }
}

function closeEmailVerificationModal() {
    const modal = document.getElementById('emailVerificationModal');

    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Clear any active cooldown countdown
    const resendBtn = document.getElementById('resendEmailCodeBtn');
    if (resendBtn && resendBtn.dataset.cooldownInterval) {
        clearInterval(parseInt(resendBtn.dataset.cooldownInterval));
        resendBtn.textContent = 'Resend Code';
        resendBtn.disabled = false;
        delete resendBtn.dataset.cooldownInterval;
    }

    // Clear stored data (email change cancelled)
    emailChangeData = null;
}

async function handleEmailVerification() {
    if (!emailChangeData) {
        showNotification('Email change session expired. Please try again.', 'error');
        closeEmailVerificationModal();
        return;
    }

    // Get code from inputs
    const codeInputs = document.querySelectorAll('.verification-code-input');
    const code = Array.from(codeInputs).map(input => input.value).join('');

    if (code.length !== 6) {
        showVerificationError('Please enter the complete 6-digit code');
        return;
    }

    const verifyBtn = document.getElementById('verifyEmailCodeBtn');
    const originalText = verifyBtn.textContent;
    verifyBtn.textContent = 'Verifying...';
    verifyBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/settings/email/verify-change`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to verify email');
        }

        // Success! Close modal and update UI
        closeEmailVerificationModal();

        // Update current email display
        const currentEmailInput = document.getElementById('currentEmail');
        if (currentEmailInput) {
            currentEmailInput.value = data.email;
        }

        // Clear the new email fields
        document.getElementById('newEmail').value = '';
        document.getElementById('confirmEmail').value = '';

        showNotification('Email changed successfully!', 'success');

        // Clear stored data
        emailChangeData = null;

    } catch (error) {
        showVerificationError(error.message || 'Invalid verification code');
    } finally {
        verifyBtn.textContent = originalText;
        verifyBtn.disabled = false;
    }
}

function showVerificationError(message) {
    const errorMsg = document.getElementById('emailVerificationError');
    if (errorMsg) {
        errorMsg.textContent = message;
        errorMsg.style.display = 'block';
    }

    // Hide success message if showing
    const successMsg = document.getElementById('emailVerificationSuccess');
    if (successMsg) {
        successMsg.style.display = 'none';
    }

    // Add error styling to inputs briefly (like create profile verification)
    const codeInputs = document.querySelectorAll('.verification-code-input');
    codeInputs.forEach(input => input.classList.add('error'));
    setTimeout(() => {
        codeInputs.forEach(input => input.classList.remove('error'));
    }, 500);

    // Clear all code inputs and focus first one (like create profile verification)
    resetVerificationCodeInputs();
}

function resetVerificationCodeInputs() {
    const codeInputs = document.querySelectorAll('.verification-code-input');
    codeInputs.forEach(input => {
        input.value = '';
        input.classList.remove('filled', 'error', 'success');
    });
    if (codeInputs[0]) {
        codeInputs[0].focus();
    }
}

async function handleResendEmailCode() {
    if (!emailChangeData) {
        showNotification('Email change session expired. Please try again.', 'error');
        closeEmailVerificationModal();
        return;
    }

    const resendBtn = document.getElementById('resendEmailCodeBtn');
    const originalText = resendBtn.textContent;
    resendBtn.textContent = 'Sending...';
    resendBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/settings/email/resend-code`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            // Handle rate limiting (429 status)
            if (response.status === 429) {
                clearVerificationSuccess();
                showVerificationError(data.error || 'Too many attempts. Please try again later.');

                // Disable resend button for the cooldown period
                if (data.minutesRemaining) {
                    startResendCooldown(data.minutesRemaining);
                }
                return;
            }
            throw new Error(data.error || 'Failed to resend code');
        }

        // Show inline success message in modal with resends remaining
        let successMessage = 'New code sent! Check your email.';
        if (data.resendsRemaining !== undefined && data.resendsRemaining > 0) {
            successMessage += ` (${data.resendsRemaining} resend${data.resendsRemaining !== 1 ? 's' : ''} remaining)`;
        } else if (data.resendsRemaining === 0) {
            successMessage += ' (No more resends available)';
        }
        showVerificationSuccess(successMessage);

        // Clear code inputs and reset state
        resetVerificationCodeInputs();

        // Hide error
        clearVerificationError();

    } catch (error) {
        clearVerificationSuccess();
        showVerificationError(error.message || 'Failed to resend code');
    } finally {
        resendBtn.textContent = originalText;
        resendBtn.disabled = false;
    }
}

function startResendCooldown(minutes) {
    const resendBtn = document.getElementById('resendEmailCodeBtn');
    if (!resendBtn) return;

    let secondsRemaining = minutes * 60;
    resendBtn.disabled = true;

    const updateButtonText = () => {
        const mins = Math.floor(secondsRemaining / 60);
        const secs = secondsRemaining % 60;
        resendBtn.textContent = `Try again in ${mins}:${secs.toString().padStart(2, '0')}`;
    };

    updateButtonText();

    const countdownInterval = setInterval(() => {
        secondsRemaining--;
        if (secondsRemaining <= 0) {
            clearInterval(countdownInterval);
            resendBtn.textContent = 'Resend Code';
            resendBtn.disabled = false;
            clearVerificationError();
        } else {
            updateButtonText();
        }
    }, 1000);

    // Store interval ID so we can clear it if modal is closed
    resendBtn.dataset.cooldownInterval = countdownInterval;
}

function showVerificationSuccess(message) {
    const successMsg = document.getElementById('emailVerificationSuccess');
    if (successMsg) {
        successMsg.textContent = message;
        successMsg.style.display = 'block';
    }
    // Hide error if showing
    clearVerificationError();
}

function clearVerificationSuccess() {
    const successMsg = document.getElementById('emailVerificationSuccess');
    if (successMsg) {
        successMsg.textContent = '';
        successMsg.style.display = 'none';
    }
}


// Show Notification
function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.settings-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `settings-notification ${type}`;

    const icons = {
        success: '<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
        warning: '<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>',
        error: '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>',
        info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
    };

    notification.innerHTML = `
        <div class="notification-content">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${icons[type] || icons.info}
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

    // Add to page
    document.body.appendChild(notification);

    // Close button handler
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
        notification.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => notification.remove(), 300);
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notification.remove(), 300);
        }
    }, 5000);
}

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', function(e) {
    if (formModified) {
        e.preventDefault();
        e.returnValue = '';
    }
});

// ==================== FORGOT PASSWORD MODAL ====================

let forgotPasswordData = null; // Store data needed for reset flow
let forgotPasswordResendCount = 0;

function initializeForgotPassword() {
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', function(e) {
            e.preventDefault();
            openForgotPasswordModal();
        });
    }

    // Initialize modal handlers
    initializeForgotPasswordModal();
}

function initializeForgotPasswordModal() {
    // Close button
    const closeBtn = document.getElementById('closeForgotPasswordModal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeForgotPasswordModal);
    }

    // Cancel button
    const cancelBtn = document.getElementById('cancelForgotPassword');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', closeForgotPasswordModal);
    }

    // Send code button (Step 1)
    const sendCodeBtn = document.getElementById('sendResetCodeBtn');
    if (sendCodeBtn) {
        sendCodeBtn.addEventListener('click', handleSendResetCode);
    }

    // Verify code button (Step 2)
    const verifyCodeBtn = document.getElementById('verifyResetCodeBtn');
    if (verifyCodeBtn) {
        verifyCodeBtn.addEventListener('click', handleVerifyResetCode);
    }

    // Back button (Step 2)
    const backBtn = document.getElementById('backToStep1Btn');
    if (backBtn) {
        backBtn.addEventListener('click', goBackToStep1);
    }

    // Resend code button (Step 2)
    const resendBtn = document.getElementById('resendResetCodeBtn');
    if (resendBtn) {
        resendBtn.addEventListener('click', handleResendResetCode);
    }

    // Set new password button (Step 3)
    const setPasswordBtn = document.getElementById('setNewPasswordBtn');
    if (setPasswordBtn) {
        setPasswordBtn.addEventListener('click', handleSetNewPassword);
    }

    // Verify Cognito code button (Step 4)
    const verifyCognitoBtn = document.getElementById('verifyCognitoCodeBtn');
    if (verifyCognitoBtn) {
        verifyCognitoBtn.addEventListener('click', handleVerifyCognitoCode);
    }

    // Done button (Step 5)
    const doneBtn = document.getElementById('closeForgotPasswordSuccess');
    if (doneBtn) {
        doneBtn.addEventListener('click', closeForgotPasswordModal);
    }

    // Setup code input handlers for Step 2
    setupForgotPasswordCodeInputs();

    // Setup code input handlers for Step 4 (Cognito code)
    setupCognitoCodeInputs();

    // Setup password validation for Step 3
    setupForgotPasswordValidation();

    // Close on background/overlay click
    const modal = document.getElementById('forgotPasswordModal');
    const overlay = document.getElementById('forgotPasswordModalOverlay');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeForgotPasswordModal();
            }
        });
    }
    if (overlay) {
        overlay.addEventListener('click', closeForgotPasswordModal);
    }
}

function setupForgotPasswordCodeInputs() {
    const codeInputs = document.querySelectorAll('.forgot-password-code-input');

    codeInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            const value = this.value.replace(/\D/g, '');
            this.value = value;

            if (value && index < codeInputs.length - 1) {
                codeInputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && !this.value && index > 0) {
                codeInputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

            pastedData.split('').forEach((char, i) => {
                if (codeInputs[i]) {
                    codeInputs[i].value = char;
                }
            });

            const nextIndex = Math.min(pastedData.length, codeInputs.length - 1);
            codeInputs[nextIndex].focus();
        });
    });
}

function setupCognitoCodeInputs() {
    const codeInputs = document.querySelectorAll('.forgot-password-cognito-code-input');

    codeInputs.forEach((input, index) => {
        input.addEventListener('input', function(e) {
            const value = this.value.replace(/\D/g, '');
            this.value = value;

            if (value && index < codeInputs.length - 1) {
                codeInputs[index + 1].focus();
            }
        });

        input.addEventListener('keydown', function(e) {
            if (e.key === 'Backspace' && !this.value && index > 0) {
                codeInputs[index - 1].focus();
            }
        });

        input.addEventListener('paste', function(e) {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

            pastedData.split('').forEach((char, i) => {
                if (codeInputs[i]) {
                    codeInputs[i].value = char;
                }
            });

            const nextIndex = Math.min(pastedData.length, codeInputs.length - 1);
            codeInputs[nextIndex].focus();
        });
    });
}

function setupForgotPasswordValidation() {
    const newPasswordInput = document.getElementById('forgotNewPassword');
    const confirmPasswordInput = document.getElementById('forgotConfirmPassword');

    if (newPasswordInput) {
        newPasswordInput.addEventListener('input', function() {
            validateForgotPasswordRequirements(this.value);
            if (confirmPasswordInput && confirmPasswordInput.value) {
                checkForgotPasswordMatch();
            }
        });
    }

    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', checkForgotPasswordMatch);
    }
}

function validateForgotPasswordRequirements(password) {
    const requirements = {
        'forgotCheckLength': password.length >= 8,
        'forgotCheckUppercase': /[A-Z]/.test(password),
        'forgotCheckLowercase': /[a-z]/.test(password),
        'forgotCheckNumber': /[0-9]/.test(password),
        'forgotCheckSpecial': /[!@#$%^&*]/.test(password)
    };

    for (const [id, isValid] of Object.entries(requirements)) {
        const item = document.getElementById(id);
        if (item) {
            if (isValid) {
                item.classList.add('valid');
                item.querySelector('.check-icon').innerHTML = '&#10003;';
            } else {
                item.classList.remove('valid');
                item.querySelector('.check-icon').innerHTML = '&#10005;';
            }
        }
    }

    return Object.values(requirements).every(v => v);
}

function checkForgotPasswordMatch() {
    const newPassword = document.getElementById('forgotNewPassword')?.value || '';
    const confirmPassword = document.getElementById('forgotConfirmPassword')?.value || '';
    const matchMessage = document.getElementById('forgotPasswordMatchMessage');

    if (!matchMessage) return false;

    if (!confirmPassword) {
        matchMessage.classList.remove('show', 'match', 'no-match');
        matchMessage.textContent = '';
        return false;
    }

    matchMessage.classList.add('show');

    if (newPassword === confirmPassword) {
        matchMessage.classList.remove('no-match');
        matchMessage.classList.add('match');
        matchMessage.textContent = 'Passwords match';
        return true;
    } else {
        matchMessage.classList.remove('match');
        matchMessage.classList.add('no-match');
        matchMessage.textContent = 'Passwords do not match';
        return false;
    }
}

async function openForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');
    const emailDisplay = document.getElementById('forgotPasswordEmailDisplay');

    // Get current email from the account settings
    const currentEmail = document.getElementById('currentEmail')?.value || '';

    if (emailDisplay) {
        emailDisplay.textContent = currentEmail;
    }

    // Store email for the flow
    forgotPasswordData = { email: currentEmail };
    forgotPasswordResendCount = 0;

    // Reset to Step 1
    showForgotPasswordStep(1);

    // Clear any errors
    clearForgotPasswordErrors();

    // Show modal
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeForgotPasswordModal() {
    const modal = document.getElementById('forgotPasswordModal');

    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Clear stored data
    forgotPasswordData = null;
    forgotPasswordResendCount = 0;

    // Clear any cooldown intervals
    const resendBtn = document.getElementById('resendResetCodeBtn');
    if (resendBtn && resendBtn.dataset.cooldownInterval) {
        clearInterval(parseInt(resendBtn.dataset.cooldownInterval));
        resendBtn.textContent = 'Resend Code';
        resendBtn.disabled = false;
        delete resendBtn.dataset.cooldownInterval;
    }

    // Reset form fields
    resetForgotPasswordForm();

    // Cancel the pending reset on the server (if any)
    cancelPendingReset();
}

async function cancelPendingReset() {
    try {
        if (!API.isAuthenticated()) return;

        await fetch(`${API_BASE_URL}/settings/password/forgot/cancel`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        // Ignore errors for cancel
    }
}

function showForgotPasswordStep(stepNumber) {
    // Show/hide body steps
    const steps = document.querySelectorAll('.forgot-password-step');
    steps.forEach((step, index) => {
        step.style.display = index + 1 === stepNumber ? 'block' : 'none';
    });

    // Show/hide footer steps
    const footerSteps = document.querySelectorAll('.forgot-password-footer-step');
    footerSteps.forEach((step, index) => {
        step.style.display = index + 1 === stepNumber ? 'flex' : 'none';
    });

    // Update modal header title based on step
    const modalTitle = document.getElementById('forgotPasswordModalTitle');
    if (modalTitle) {
        const titles = {
            1: 'Reset Password',
            2: 'Verify Email',
            3: 'New Password',
            4: 'Final Verification',
            5: 'Success'
        };
        modalTitle.textContent = titles[stepNumber] || 'Reset Password';
    }
}

function clearForgotPasswordErrors() {
    const errorElements = document.querySelectorAll('.forgot-password-error');
    errorElements.forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

function showForgotPasswordError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

function resetForgotPasswordForm() {
    // Clear code inputs (Step 2)
    const codeInputs = document.querySelectorAll('.forgot-password-code-input');
    codeInputs.forEach(input => {
        input.value = '';
    });

    // Clear Cognito code inputs (Step 4)
    const cognitoCodeInputs = document.querySelectorAll('.forgot-password-cognito-code-input');
    cognitoCodeInputs.forEach(input => {
        input.value = '';
    });

    // Clear password inputs
    const newPasswordInput = document.getElementById('forgotNewPassword');
    const confirmPasswordInput = document.getElementById('forgotConfirmPassword');
    if (newPasswordInput) newPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';

    // Reset password checklist
    const checklistItems = ['forgotCheckLength', 'forgotCheckUppercase', 'forgotCheckLowercase', 'forgotCheckNumber', 'forgotCheckSpecial'];
    checklistItems.forEach(id => {
        const item = document.getElementById(id);
        if (item) {
            item.classList.remove('valid');
            item.querySelector('.check-icon').innerHTML = '&#10005;';
        }
    });

    // Reset match message
    const matchMessage = document.getElementById('forgotPasswordMatchMessage');
    if (matchMessage) {
        matchMessage.classList.remove('show', 'match', 'no-match');
        matchMessage.textContent = '';
    }

    // Reset resend count display
    const resendCountEl = document.getElementById('resetResendCount');
    if (resendCountEl) {
        resendCountEl.textContent = '';
    }
}

async function handleSendResetCode() {
    const sendBtn = document.getElementById('sendResetCodeBtn');
    const originalText = sendBtn.textContent;
    sendBtn.textContent = 'Sending...';
    sendBtn.disabled = true;

    clearForgotPasswordErrors();

    try {
        const response = await fetch(`${API_BASE_URL}/settings/password/forgot/request`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to send verification code');
        }

        // Store email and move to Step 2
        forgotPasswordData = { email: data.email };

        // Update email display in Step 2
        const emailConfirm = document.getElementById('forgotPasswordEmailConfirm');
        if (emailConfirm) {
            emailConfirm.textContent = data.email;
        }

        showForgotPasswordStep(2);

        // Focus first code input
        const firstInput = document.querySelector('.forgot-password-code-input');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }

    } catch (error) {
        showForgotPasswordError('forgotPasswordError', error.message);
    } finally {
        sendBtn.textContent = originalText;
        sendBtn.disabled = false;
    }
}

async function handleVerifyResetCode() {
    const codeInputs = document.querySelectorAll('.forgot-password-code-input');
    const code = Array.from(codeInputs).map(input => input.value).join('');

    if (code.length !== 6) {
        showForgotPasswordError('forgotPasswordCodeError', 'Please enter the complete 6-digit code');
        return;
    }

    const verifyBtn = document.getElementById('verifyResetCodeBtn');
    const originalText = verifyBtn.textContent;
    verifyBtn.textContent = 'Verifying...';
    verifyBtn.disabled = true;

    clearForgotPasswordErrors();

    try {
        const response = await fetch(`${API_BASE_URL}/settings/password/forgot/verify`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Invalid verification code');
        }

        // Move to Step 3 (Set New Password)
        showForgotPasswordStep(3);

        // Focus new password input
        const newPasswordInput = document.getElementById('forgotNewPassword');
        if (newPasswordInput) {
            setTimeout(() => newPasswordInput.focus(), 100);
        }

    } catch (error) {
        showForgotPasswordError('forgotPasswordCodeError', error.message);
    } finally {
        verifyBtn.textContent = originalText;
        verifyBtn.disabled = false;
    }
}

function goBackToStep1() {
    showForgotPasswordStep(1);
    clearForgotPasswordErrors();
}

async function handleResendResetCode() {
    const resendBtn = document.getElementById('resendResetCodeBtn');
    const originalText = resendBtn.textContent;
    resendBtn.textContent = 'Sending...';
    resendBtn.disabled = true;

    clearForgotPasswordErrors();

    try {
        const response = await fetch(`${API_BASE_URL}/settings/password/forgot/resend`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (!response.ok) {
            // Check if it's a rate limit error
            if (response.status === 429) {
                startForgotPasswordCooldown(data.minutesRemaining || 15);
            }
            throw new Error(data.error || 'Failed to resend code');
        }

        // Clear code inputs
        const codeInputs = document.querySelectorAll('.forgot-password-code-input');
        codeInputs.forEach(input => input.value = '');
        if (codeInputs[0]) codeInputs[0].focus();

        // Update resends remaining
        const resendCountEl = document.getElementById('resetResendCount');
        if (resendCountEl && data.resendsRemaining !== undefined) {
            if (data.resendsRemaining > 0) {
                resendCountEl.textContent = `(${data.resendsRemaining} left)`;
            } else {
                resendCountEl.textContent = '(No more resends)';
            }
        }

        showNotification('Verification code resent!', 'success');

    } catch (error) {
        showForgotPasswordError('forgotPasswordCodeError', error.message);
    } finally {
        if (!resendBtn.dataset.cooldownInterval) {
            resendBtn.textContent = originalText;
            resendBtn.disabled = false;
        }
    }
}

function startForgotPasswordCooldown(minutes) {
    const resendBtn = document.getElementById('resendResetCodeBtn');
    if (!resendBtn) return;

    let secondsRemaining = minutes * 60;
    resendBtn.disabled = true;

    const updateButtonText = () => {
        const mins = Math.floor(secondsRemaining / 60);
        const secs = secondsRemaining % 60;
        resendBtn.textContent = `Try again in ${mins}:${secs.toString().padStart(2, '0')}`;
    };

    updateButtonText();

    const countdownInterval = setInterval(() => {
        secondsRemaining--;
        if (secondsRemaining <= 0) {
            clearInterval(countdownInterval);
            resendBtn.textContent = 'Resend Code';
            resendBtn.disabled = false;
            delete resendBtn.dataset.cooldownInterval;
            clearForgotPasswordErrors();
        } else {
            updateButtonText();
        }
    }, 1000);

    resendBtn.dataset.cooldownInterval = countdownInterval;
}

async function handleSetNewPassword() {
    const newPassword = document.getElementById('forgotNewPassword')?.value || '';
    const confirmPassword = document.getElementById('forgotConfirmPassword')?.value || '';

    // Validate password requirements
    if (!validateForgotPasswordRequirements(newPassword)) {
        showForgotPasswordError('forgotPasswordSetError', 'Please meet all password requirements');
        return;
    }

    // Validate passwords match
    if (newPassword !== confirmPassword) {
        showForgotPasswordError('forgotPasswordSetError', 'Passwords do not match');
        return;
    }

    const setBtn = document.getElementById('setNewPasswordBtn');
    const originalText = setBtn.textContent;
    setBtn.textContent = 'Setting Password...';
    setBtn.disabled = true;

    clearForgotPasswordErrors();

    try {
        const response = await fetch(`${API_BASE_URL}/settings/password/forgot/set`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to set new password');
        }

        // Check if Cognito code is required (two-step password reset)
        if (data.requiresCognitoCode) {
            // Store the new password for the next step
            forgotPasswordData = { ...forgotPasswordData, newPassword, email: data.email };

            // Update email display in Step 4
            const emailConfirm = document.getElementById('forgotPasswordCognitoEmailConfirm');
            if (emailConfirm) {
                emailConfirm.textContent = data.email;
            }

            // Move to Step 4 (Cognito Code)
            showForgotPasswordStep(4);

            // Focus first Cognito code input
            setTimeout(() => {
                const firstInput = document.querySelector('.forgot-password-cognito-code-input');
                if (firstInput) firstInput.focus();
            }, 100);
        } else {
            // Move to Step 5 (Success)
            showForgotPasswordStep(5);
        }

    } catch (error) {
        showForgotPasswordError('forgotPasswordSetError', error.message);
    } finally {
        setBtn.textContent = originalText;
        setBtn.disabled = false;
    }
}

async function handleVerifyCognitoCode() {
    // Get the Cognito code from inputs
    const codeInputs = document.querySelectorAll('.forgot-password-cognito-code-input');
    let code = '';
    codeInputs.forEach(input => {
        code += input.value;
    });

    if (code.length !== 6) {
        showForgotPasswordError('forgotPasswordCognitoCodeError', 'Please enter the complete 6-digit code');
        return;
    }

    if (!forgotPasswordData?.newPassword) {
        showForgotPasswordError('forgotPasswordCognitoCodeError', 'Session expired. Please restart the process.');
        return;
    }

    const verifyBtn = document.getElementById('verifyCognitoCodeBtn');
    const originalText = verifyBtn.textContent;
    verifyBtn.textContent = 'Completing...';
    verifyBtn.disabled = true;

    clearForgotPasswordErrors();

    try {
        const response = await fetch(`${API_BASE_URL}/settings/password/forgot/set`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                newPassword: forgotPasswordData.newPassword,
                cognitoCode: code
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to complete password reset');
        }

        // Move to Step 5 (Success)
        showForgotPasswordStep(5);

    } catch (error) {
        showForgotPasswordError('forgotPasswordCognitoCodeError', error.message);
    } finally {
        verifyBtn.textContent = originalText;
        verifyBtn.disabled = false;
    }
}

// Initialize forgot password on page load
document.addEventListener('DOMContentLoaded', function() {
    initializeForgotPassword();
});

// ==================== PROFILE TYPE SWITCHING ====================

let switchProfileInfo = null;
let selectedTargetType = null;

const POSITION_OPTIONS = [
    'QB', 'RB', 'WR', 'TE', 'OT', 'OG', 'C', 'DE', 'DT', 'NT',
    'ILB', 'OLB', 'CB', 'S', 'K', 'P', 'LS'
];

let switchSchoolSearch = null;

// AI Fit-Matching pickers for the switch modal (Plan 4). Reset each time
// attachStep2Listeners() runs so controllers don't leak across type re-renders.
let switchFitPickers = {};

const DIVISION_OPTIONS = [
    ['D1 FBS', 'D1 FBS (Football Bowl Subdivision)'],
    ['D1 FCS', 'D1 FCS (Football Championship Subdivision)'],
    ['D2', 'Division II'],
    ['D3', 'Division III'],
    ['NAIA', 'NAIA'],
    ['NJCAA', 'NJCAA (Junior College)']
];

const COACH_POSITIONS = [
    'Head Coach', 'Offensive Coordinator', 'Defensive Coordinator',
    'Special Teams Coordinator', 'Quarterbacks Coach', 'Running Backs Coach',
    'Wide Receivers Coach', 'Tight Ends Coach', 'Offensive Line Coach',
    'Defensive Line Coach', 'Linebackers Coach', 'Defensive Backs Coach',
    'Strength & Conditioning', 'Director of Player Personnel',
    'Recruiting Coordinator', 'Director of Operations', 'Graduate Assistant',
    'Quality Control', 'Other Staff'
];

const US_STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
    ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
    ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
    ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
    ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],
    ['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
    ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
    ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],
    ['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
    ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
    ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
];

const TYPE_ICONS = {
    hsplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    collegeplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>',
    transferplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
    hscoach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M9 12h6"></path><path d="M9 16h6"></path></svg>',
    collegecoach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect><path d="M9 12h6"></path><path d="M9 16h6"></path></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>'
};

async function initializeProfileTypeSwitching() {
    const switchBtn = document.getElementById('switchProfileBtn');
    if (!switchBtn) return;

    try {
        const data = await API.settings.getSwitchProfileInfo();
        switchProfileInfo = data;

        // Update current type display
        const valueEl = document.getElementById('currentProfileTypeValue');
        if (valueEl) valueEl.textContent = data.current_label;

        // PAID/FREE badge for the CURRENT profile. This tracks whether the user is
        // actually on a paid plan, NOT whether the profile type is paywalled —
        // players are free accounts that can hold the $10/mo AI Rep add-on, and a
        // paying player must not read "FREE".
        let isPaidNow = !!data.is_current_paid;
        if (data.holds_paid_subscription) {
            try {
                const sub = await API.payments.getSubscriptionStatus();
                // Cancelled before the trial ends (or before the next renewal):
                // Stripe will end it with no charge, so the account is on its way
                // back to free. Show FREE now rather than after the period lapses.
                // Never downgrade a collegecoach this way — that type is paywalled
                // regardless of subscription state.
                if (sub && sub.cancelAtPeriodEnd && !PAID_PROFILE_TYPES.includes(data.current_type)) {
                    isPaidNow = false;
                }
            } catch (_) { /* fall back to the server's answer */ }
        }
        switchProfileInfo.is_current_paid = isPaidNow;   // keep step 3's badge in sync

        const badgeEl = document.getElementById('currentProfilePaidBadge');
        if (badgeEl) {
            badgeEl.classList.remove('badge-paid', 'badge-free');
            badgeEl.textContent = isPaidNow ? 'PAID' : 'FREE';
            badgeEl.classList.add(isPaidNow ? 'badge-paid' : 'badge-free');
            badgeEl.style.display = '';
        }

        // Handle cooldown
        if (!data.can_switch) {
            switchBtn.disabled = true;
            switchBtn.textContent = `Switch available in ${data.cooldown_remaining_hours}h`;
            const cooldownMsg = document.getElementById('switchCooldownMessage');
            if (cooldownMsg) {
                cooldownMsg.textContent = `You recently switched profiles. You can switch again in ${data.cooldown_remaining_hours} hours.`;
                cooldownMsg.style.display = '';
            }
        }

        switchBtn.addEventListener('click', openSwitchProfileModal);
    } catch (error) {
        console.error('Failed to load profile type info:', error);
    }
}

function openSwitchProfileModal() {
    if (!switchProfileInfo || !switchProfileInfo.can_switch) return;

    selectedTargetType = null;

    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'switch-profile-modal-overlay';
    modal.id = 'switchProfileModal';
    modal.innerHTML = `
        <div class="switch-profile-modal">
            <div class="switch-modal-header">
                <h2>Switch Profile Type</h2>
                <button class="switch-modal-close" id="switchModalClose">&times;</button>
            </div>
            <div class="switch-modal-steps">
                <div class="switch-step-indicator">
                    <span class="step-dot active" data-step="1">1</span>
                    <span class="step-line"></span>
                    <span class="step-dot" data-step="2">2</span>
                    <span class="step-line"></span>
                    <span class="step-dot" data-step="3">3</span>
                </div>
            </div>
            <div class="switch-modal-body">
                ${renderStep1()}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // Event listeners
    document.getElementById('switchModalClose').addEventListener('click', closeSwitchProfileModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSwitchProfileModal();
    });

    attachStep1Listeners();
}

function renderStep1() {
    const cards = switchProfileInfo.targets.map(t => `
        <div class="switch-type-card" data-type="${t.type}">
            <div class="switch-type-icon">${TYPE_ICONS[t.type]}</div>
            <div class="switch-type-info">
                <span class="switch-type-name">${t.label}</span>
                <span class="switch-type-badge ${t.is_paid ? 'badge-paid' : 'badge-free'}">${t.is_paid ? 'PAID' : 'FREE'}</span>
            </div>
        </div>
    `).join('');

    return `
        <div class="switch-step" id="switchStep1">
            <h3>Choose your new profile type</h3>
            <p class="switch-step-subtitle">Currently: <strong>${switchProfileInfo.current_label}</strong></p>
            <div class="switch-type-grid">${cards}</div>
            <div class="switch-step-actions">
                <button class="btn-secondary" id="switchCancelBtn">Cancel</button>
                <button class="btn-primary" id="switchNextBtn1" disabled>Next</button>
            </div>
        </div>
    `;
}

function attachStep1Listeners() {
    document.querySelectorAll('.switch-type-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.switch-type-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedTargetType = card.dataset.type;
            document.getElementById('switchNextBtn1').disabled = false;
        });
    });

    document.getElementById('switchCancelBtn').addEventListener('click', closeSwitchProfileModal);
    document.getElementById('switchNextBtn1').addEventListener('click', goToStep2);
}

function goToStep2() {
    // Switching TO collegecoach is invite-gated — user must request access via the contact form,
    // get manually approved, and redeem an invite link. Redirect them to the contact form
    // instead of letting them fill out the standard switch profile form.
    if (selectedTargetType === 'collegecoach') {
        showCollegeCoachSwitchVerificationSplash();
        return;
    }

    const body = document.querySelector('.switch-modal-body');
    body.innerHTML = renderStep2();
    updateStepIndicator(2);
    attachStep2Listeners();

    // Clean up any previous school search instance
    if (switchSchoolSearch) {
        switchSchoolSearch.destroy();
        switchSchoolSearch = null;
    }

    // Initialize school search for college target types
    if (['collegeplayer', 'transferplayer', 'collegecoach'].includes(selectedTargetType)) {
        if (typeof initSchoolSearch === 'function') {
            switchSchoolSearch = initSchoolSearch({
                nameInput: '#switchTeamName',
                divisionSelect: '#switchDivision',
                assetBasePath: '../../assets'
            });
        }
    }
}

// --- AI Fit-Matching markup builders for the switch modal (Plan 4) ---
// Multi-select values are drawn from MATCH_CONSTANTS so they stay string-identical
// to the create forms (lesson #4/#19). Returns '' if MATCH_CONSTANTS isn't loaded.
function renderSwitchPlayerFitFields() {
    if (typeof MATCH_CONSTANTS === 'undefined') return '';
    const opt = ' <span class="optional">(Optional)</span>';
    // Major label is tense-specific, mirroring each create-profile form:
    // hsplayer "Intended Major(s)", collegeplayer "Current Major",
    // transferplayer "Current / Intended Major".
    const majorLabel = selectedTargetType === 'collegeplayer'
        ? 'Current Major'
        : (selectedTargetType === 'transferplayer' ? 'Current / Intended Major' : 'Intended Major(s)');
    const yesNoUnsure = (name) => `
        <div class="switch-radio-row">
            <label class="switch-radio-label"><input type="radio" name="${name}" value="yes"><span>Yes</span></label>
            <label class="switch-radio-label"><input type="radio" name="${name}" value="no"><span>No</span></label>
            <label class="switch-radio-label"><input type="radio" name="${name}" value="unsure"><span>Unsure</span></label>
        </div>`;
    const slider = (id, label, lowLbl, highLbl) => `
        <div class="fit-slider-group">
            <label for="${id}">${label}</label>
            <div class="fit-slider-row">
                <input type="range" id="${id}" min="1" max="5" step="1" value="3">
                <span class="fit-slider-value" id="${id}Val">3</span>
            </div>
            <div class="fit-slider-ends"><span>${lowLbl}</span><span>${highLbl}</span></div>
        </div>`;
    // Weighted GPA exists only on the hsplayer create form; college/transfer omit it.
    const weightedGpaField = selectedTargetType === 'hsplayer' ? `
            <div class="switch-form-group">
                <label>Weighted GPA${opt}</label>
                <input type="number" id="switchWeightedGpa" class="form-input" min="0" max="6" step="0.01" placeholder="e.g., 4.20">
            </div>` : '';
    // AP/IB label gains the "(in high school)?" qualifier on college/transfer (their
    // create forms phrase it that way since the courses were taken in HS).
    const apIbLabel = selectedTargetType === 'hsplayer'
        ? 'AP / IB / Honors courses taken?'
        : 'AP / IB / Honors courses taken (in high school)?';
    return `
        <h4 class="switch-section-heading">Academics</h4>
        <div class="switch-form-row">
            ${weightedGpaField}
            <div class="switch-form-group">
                <label for="switchClassRank">Class Rank${opt}</label>
                <input type="text" id="switchClassRank" class="form-input" maxlength="50" placeholder="e.g., 12 of 350, or Top 10%">
            </div>
        </div>
        <div class="switch-form-row">
            <div class="switch-form-group">
                <label for="switchSatScore">SAT Score${opt}</label>
                <input type="number" id="switchSatScore" class="form-input" min="400" max="1600" step="10" placeholder="e.g., 1180">
            </div>
            <div class="switch-form-group">
                <label for="switchActScore">ACT Score${opt}</label>
                <input type="number" id="switchActScore" class="form-input" min="1" max="36" step="1" placeholder="e.g., 26">
            </div>
        </div>
        <div class="switch-form-row">
            <div class="switch-form-group">
                <label>${apIbLabel}${opt}</label>
                <div class="switch-radio-row">
                    <label class="switch-radio-label"><input type="radio" name="switchHasApIb" value="no" checked><span>No</span></label>
                    <label class="switch-radio-label"><input type="radio" name="switchHasApIb" value="yes"><span>Yes</span></label>
                </div>
            </div>
            <div class="switch-form-group" id="switchApIbCountGroup" style="display:none;">
                <label for="switchApIbCount">How many?</label>
                <input type="number" id="switchApIbCount" class="form-input" min="0" max="40" step="1" placeholder="e.g., 5">
            </div>
        </div>
        <div class="switch-form-group">
            <label>${majorLabel}${opt}</label>
            <p class="form-hint" style="margin-bottom:0.5rem;">Select up to 3 majors you're interested in studying</p>
            <div class="multi-select-container" id="switchMajorContainer"></div>
            <small class="major-cap-hint" id="switchMajorCapHint">Maximum of 3 majors selected</small>
            <div class="selected-items" id="switchSelectedMajors"></div>
        </div>

        <h4 class="switch-section-heading">Recruiting Fit</h4>
        <p class="form-hint" style="margin-bottom:0.75rem;">Optional — helps coaches find players who truly fit their program. The more you share, the better your matches.</p>
        <div class="switch-form-group">
            <label for="switchHomeZip">Home ZIP Code${opt}</label>
            <input type="text" id="switchHomeZip" class="form-input" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" placeholder="e.g., 80401">
            <small class="form-hint">Helps coaches gauge distance and regional fit</small>
        </div>
        <div class="switch-form-row">
            <div class="switch-form-group"><label>Will you need financial aid?${opt}</label>${yesNoUnsure('switchNeedsFinancialAid')}</div>
            <div class="switch-form-group"><label>Do you need athletic scholarship money?${opt}</label>${yesNoUnsure('switchNeedsScholarship')}</div>
        </div>
        <div class="switch-form-group">
            <label>Are you Pell-eligible or a first-generation college student?${opt}</label>
            <div class="switch-radio-row">
                <label class="switch-radio-label"><input type="radio" name="switchPellFirstGen" value="yes"><span>Yes</span></label>
                <label class="switch-radio-label"><input type="radio" name="switchPellFirstGen" value="no"><span>No</span></label>
            </div>
        </div>
        <div class="switch-form-group">
            <label>Levels open to playing${opt}</label>
            <p class="form-hint" style="margin-bottom:0.5rem;">Which division levels would you consider?</p>
            <div class="multi-select-container" id="switchLevelsContainer"></div>
            <div class="selected-items" id="switchSelectedLevels"></div>
        </div>
        <div class="switch-form-group">
            <label>Preferred region(s)${opt}</label>
            <p class="form-hint" style="margin-bottom:0.5rem;">Where would you like to play?</p>
            <div class="multi-select-container" id="switchRegionsContainer"></div>
            <div class="selected-items" id="switchSelectedRegions"></div>
        </div>
        <div class="switch-form-group">
            <label for="switchCampusSetting">Preferred campus setting${opt}</label>
            <select id="switchCampusSetting" class="form-input">
                <option value="">No preference</option>
                <option value="urban">Urban</option>
                <option value="suburban">Suburban</option>
                <option value="rural">Rural</option>
                <option value="small-town">Small town</option>
            </select>
        </div>
        <div class="switch-form-group">
            <label>How important is each of these to you?${opt}</label>
            <p class="form-hint" style="margin-bottom:0.75rem;">Slide from Not important (1) to Very important (5)</p>
            ${slider('switchImpPlayingTime', 'Early playing time', 'Not important', 'Very important')}
            ${slider('switchImpCloseToHome', 'Staying close to home', 'Not important', 'Very important')}
            ${slider('switchImpAcademics', 'Academics vs. football', 'Football-first', 'Academics-first')}
            ${slider('switchImpCompetition', 'Level of competition', 'Not important', 'Very important')}
        </div>
        <div class="switch-form-group">
            <label for="switchLookingFor">What I'm looking for in a program${opt}</label>
            <textarea id="switchLookingFor" class="form-input" rows="3" maxlength="280" placeholder="In a sentence or two, describe your ideal program (playing style, culture, goals)..."></textarea>
            <small class="form-hint"><span id="switchLookingForCount">0</span>/280</small>
        </div>
    `;
}
// NOTE: coach "Program Profile" fields are NOT built here for the switch modal —
// switching to collegecoach is invite-gated and never reaches step 2 (see goToStep2).
// Those fields live on create-coach-profile.html (Plan 3) and flow through the
// invite-redemption switch path, which POST /switch-profile persists (backend, Plan 4).

function renderStep2() {
    const target = switchProfileInfo.targets.find(t => t.type === selectedTargetType);
    const shared = switchProfileInfo.shared_fields;
    const targetRole = getBaseRoleFromType(selectedTargetType);

    let fieldsHTML = `
        <div class="switch-form-group">
            <label>First Name</label>
            <input type="text" id="switchFirstName" value="${escapeHTML(shared.first_name)}" class="form-input">
        </div>
        <div class="switch-form-group">
            <label>Last Name</label>
            <input type="text" id="switchLastName" value="${escapeHTML(shared.last_name)}" class="form-input">
        </div>
        <div class="switch-form-group">
            <label>Email</label>
            <input type="email" id="switchEmail" value="${escapeHTML(shared.email)}" class="form-input" disabled>
            <small class="form-hint">Email cannot be changed during a profile switch</small>
        </div>
        <div class="switch-form-group">
            <label>Username</label>
            <input type="text" id="switchUsername" value="${escapeHTML(shared.username || '')}" class="form-input" disabled>
            <small class="form-hint">Username is preserved from your current profile</small>
        </div>
        <div class="switch-form-group">
            <label>Date of Birth <span class="required">*</span></label>
            <input type="date" id="switchDateOfBirth" class="form-input">
        </div>
    `;

    if (targetRole === 'player') {
        const needsCollege = ['collegeplayer', 'transferplayer'].includes(selectedTargetType);
        // Transfer players describe their PREVIOUS school/state/division/conference,
        // matching the transferplayer create form's "Previous ..." labels.
        const prev = selectedTargetType === 'transferplayer' ? 'Previous ' : '';
        fieldsHTML += `
            <div class="switch-form-group">
                <label>${prev}${needsCollege ? 'College/University' : 'High School'} Name <span class="required">*</span></label>
                <input type="text" id="switchTeamName" placeholder="Enter school name" class="form-input">
            </div>
            <div class="switch-form-row">
                <div class="switch-form-group">
                    <label>${prev}State <span class="required">*</span></label>
                    <select id="switchState" class="form-input">
                        <option value="">Select State</option>
                        ${US_STATES.map(([abbr, name]) => `<option value="${abbr}">${name}</option>`).join('')}
                    </select>
                </div>
                <div class="switch-form-group">
                    <label>Graduation Year <span class="required">*</span></label>
                    <input type="number" id="switchGradYear" placeholder="e.g. 2026" class="form-input" min="2020" max="2035">
                </div>
            </div>
            <div class="switch-form-group">
                <label>Position(s) <span class="required">*</span></label>
                <p class="form-hint" style="margin-bottom: 0.5rem;">Select all positions you play</p>
                <div class="switch-position-grid">
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Offense - Skill Positions</h4>
                        ${['QB|Quarterback', 'RB|Running Back', 'FB|Fullback', 'WR|Wide Receiver', 'TE|Tight End'].map(p => {
                            const [code, name] = p.split('|');
                            return `<label class="switch-pos-checkbox"><input type="checkbox" name="switchPosition" value="${code}"><span>${name} (${code})</span></label>`;
                        }).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Offense - Line</h4>
                        ${['OT|Offensive Tackle', 'OG|Offensive Guard', 'C|Center'].map(p => {
                            const [code, name] = p.split('|');
                            return `<label class="switch-pos-checkbox"><input type="checkbox" name="switchPosition" value="${code}"><span>${name} (${code})</span></label>`;
                        }).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Defense - Line</h4>
                        ${['DE|Defensive End', 'DT|Defensive Tackle', 'NT|Nose Tackle'].map(p => {
                            const [code, name] = p.split('|');
                            return `<label class="switch-pos-checkbox"><input type="checkbox" name="switchPosition" value="${code}"><span>${name} (${code})</span></label>`;
                        }).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Defense - Linebackers</h4>
                        ${['ILB|Inside Linebacker', 'OLB|Outside Linebacker'].map(p => {
                            const [code, name] = p.split('|');
                            return `<label class="switch-pos-checkbox"><input type="checkbox" name="switchPosition" value="${code}"><span>${name} (${code})</span></label>`;
                        }).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Defense - Secondary</h4>
                        ${['CB|Cornerback', 'S|Safety'].map(p => {
                            const [code, name] = p.split('|');
                            return `<label class="switch-pos-checkbox"><input type="checkbox" name="switchPosition" value="${code}"><span>${name} (${code})</span></label>`;
                        }).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Special Teams</h4>
                        ${['K|Kicker', 'P|Punter', 'LS|Long Snapper'].map(p => {
                            const [code, name] = p.split('|');
                            return `<label class="switch-pos-checkbox"><input type="checkbox" name="switchPosition" value="${code}"><span>${name} (${code})</span></label>`;
                        }).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Utility</h4>
                        ${['ATH|Athlete'].map(p => {
                            const [code, name] = p.split('|');
                            return `<label class="switch-pos-checkbox"><input type="checkbox" name="switchPosition" value="${code}"><span>${name} (${code})</span></label>`;
                        }).join('')}
                    </div>
                </div>
                <div class="switch-selected-positions" id="switchSelectedPositions"></div>
            </div>
            <div class="switch-form-row">
                <div class="switch-form-group">
                    <label>Height <span class="required">*</span></label>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input type="number" id="switchHeightFt" placeholder="Ft" class="form-input" min="0" style="width:70px;">
                        <span style="color:rgba(255,255,255,0.5);font-size:13px;">ft</span>
                        <input type="number" id="switchHeightIn" placeholder="In" class="form-input" min="0" max="11" style="width:70px;">
                        <span style="color:rgba(255,255,255,0.5);font-size:13px;">in</span>
                    </div>
                </div>
                <div class="switch-form-group">
                    <label>Weight (lbs) <span class="required">*</span></label>
                    <input type="number" id="switchWeight" placeholder="e.g. 200" class="form-input" min="0">
                </div>
            </div>
            <div class="switch-form-group">
                <label for="switchGPA">Unweighted GPA <span class="optional">(Optional)</span></label>
                <input type="number" id="switchGPA" placeholder="e.g., 3.75" class="form-input" min="0" max="4" step="0.01">
                <small class="form-hint">Your GPA on a 4.0 scale</small>
            </div>
        `;

        // Recruiting contact fields — hsplayer + transferplayer only. Coach label
        // is role-specific ("HS Coach" vs "Previous Coach"). Matches the order of
        // the create-profile forms.
        if (['hsplayer', 'transferplayer'].includes(selectedTargetType)) {
            const coachHeading = selectedTargetType === 'transferplayer' ? 'Previous Coach' : 'HS Coach';
            fieldsHTML += `
                <div class="switch-form-group">
                    <label>Gender <span class="required">*</span></label>
                    <select id="switchGender" class="form-input">
                        <option value="">Select Gender</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                    </select>
                </div>
                <div class="switch-form-group">
                    <label>Phone Number <span class="required">*</span></label>
                    <input type="tel" id="switchPhone" placeholder="(555) 123-4567" class="form-input">
                </div>
                <div class="switch-form-group">
                    <label>Mailing Address <span class="required">*</span></label>
                    <input type="text" id="switchAddress" placeholder="123 Main St" class="form-input">
                </div>
                <div class="switch-form-row">
                    <div class="switch-form-group">
                        <label>City <span class="required">*</span></label>
                        <input type="text" id="switchCity" placeholder="Denver" class="form-input">
                    </div>
                    <div class="switch-form-group">
                        <label>ZIP Code <span class="required">*</span></label>
                        <input type="text" id="switchZip" inputmode="numeric" placeholder="80202" class="form-input">
                    </div>
                </div>
                <h4 class="switch-section-heading">${coachHeading}</h4>
                <div class="switch-form-group">
                    <label>Coach Name <span class="required">*</span></label>
                    <input type="text" id="switchCoachName" placeholder="Coach full name" class="form-input">
                </div>
                <div class="switch-form-row">
                    <div class="switch-form-group">
                        <label>Coach Email <span class="required">*</span></label>
                        <input type="email" id="switchCoachEmail" placeholder="coach@email.com" class="form-input">
                    </div>
                    <div class="switch-form-group">
                        <label>Coach Phone <span class="required">*</span></label>
                        <input type="tel" id="switchCoachPhone" placeholder="(555) 123-4567" class="form-input">
                    </div>
                </div>
                <h4 class="switch-section-heading">Parent / Guardian <span class="optional">(Optional)</span></h4>
                <p class="form-hint" style="margin-bottom: 0.5rem;">Add up to 4. Fill in name, email, and phone for each.</p>
                <div id="switchGuardianRows"></div>
                <button type="button" id="switchAddGuardianBtn" class="btn-add-guardian">+ Add parent/guardian</button>
            `;
        }

        if (needsCollege) {
            fieldsHTML += `
                <div class="switch-form-row">
                    <div class="switch-form-group form-group">
                        <label>${prev}Division <span class="required">*</span></label>
                        <select id="switchDivision" class="form-input">
                            <option value="">Select Division</option>
                            ${DIVISION_OPTIONS.map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="switch-form-group">
                        <label>${prev}Conference <span class="optional">(Optional)</span></label>
                        <input type="text" id="switchConference" placeholder="e.g., Big 12, SEC, ACC" class="form-input">
                    </div>
                </div>
                <div class="switch-form-group">
                    <label for="switchJerseyNumber">Jersey Number <span class="optional">(Optional)</span></label>
                    <input type="number" id="switchJerseyNumber" min="0" max="99" placeholder="e.g., 12" class="form-input">
                </div>
            `;
        }

        // Eligibility — collegeplayer ("Eligibility Remaining", optional) and
        // transferplayer ("Years of Eligibility Remaining", required) both have it,
        // with create-form-matching labels + option text ("N year(s)").
        if (selectedTargetType === 'collegeplayer') {
            fieldsHTML += `
                <div class="switch-form-group">
                    <label for="switchEligibility">Eligibility Remaining <span class="optional">(Optional)</span></label>
                    <select id="switchEligibility" class="form-input">
                        <option value="">Select</option>
                        <option value="1">1 year</option>
                        <option value="2">2 years</option>
                        <option value="3">3 years</option>
                        <option value="4">4 years</option>
                        <option value="5">5 years</option>
                    </select>
                </div>
            `;
        } else if (selectedTargetType === 'transferplayer') {
            fieldsHTML += `
                <div class="switch-form-group">
                    <label for="switchEligibility">Years of Eligibility Remaining <span class="required">*</span></label>
                    <select id="switchEligibility" class="form-input">
                        <option value="">Select</option>
                        <option value="1">1 year</option>
                        <option value="2">2 years</option>
                        <option value="3">3 years</option>
                        <option value="4">4 years</option>
                        <option value="5">5 years</option>
                    </select>
                </div>
            `;
        }

        // Athletics — hsplayer + transferplayer only. Canonical sport names must
        // match the dropdown values used elsewhere (e.g. "Track and Field" with
        // the word "and", not "&" — sanitize-html re-encodes "&" to "&amp;").
        if (['hsplayer', 'transferplayer'].includes(selectedTargetType)) {
            const SPORTS = ['Basketball','Baseball','Track and Field','Wrestling','Soccer','Lacrosse','Hockey','Volleyball','Tennis','Golf','Swimming','Rugby','Other'];
            // Transfer players may have played in the past — match the transferplayer
            // create form's past/present phrasing.
            const isTransfer = selectedTargetType === 'transferplayer';
            const playSportsLabel = isTransfer ? 'Do you (or did you) play other sports?' : 'Do you play other sports?';
            const t100Label = isTransfer ? 'Current or past 100m time (seconds)' : '100m time (seconds)';
            const t200Label = isTransfer ? 'Current or past 200m time (seconds)' : '200m time (seconds)';
            fieldsHTML += `
                <div class="switch-form-group">
                    <label>${playSportsLabel}</label>
                    <div class="switch-radio-row">
                        <label class="switch-radio-label">
                            <input type="radio" name="switchPlaysOtherSports" value="no" checked>
                            <span>No</span>
                        </label>
                        <label class="switch-radio-label">
                            <input type="radio" name="switchPlaysOtherSports" value="yes">
                            <span>Yes</span>
                        </label>
                    </div>
                </div>
                <div id="switchOtherSportsBlock" style="display:none;">
                    <div class="switch-form-group">
                        <label>Sports You Play</label>
                        <p class="form-hint" style="margin-bottom: 0.5rem;">Select all sports you participate in</p>
                        <div class="switch-sport-grid" id="switchSportCheckboxes">
                            ${SPORTS.map(s => `
                                <label class="switch-pos-checkbox">
                                    <input type="checkbox" name="switchOtherSport" value="${s}" class="switch-sport-checkbox">
                                    <span>${s}</span>
                                </label>`).join('')}
                        </div>
                        <div class="switch-selected-positions" id="switchSelectedSports"></div>
                    </div>
                    <div class="switch-form-group" id="switchOtherSportTextGroup" style="display:none;">
                        <label for="switchOtherSportText">Specify other sport(s)</label>
                        <input type="text" id="switchOtherSportText" maxlength="100" class="form-input" placeholder="e.g. Fencing">
                    </div>
                    <div id="switchTrackTimesBlock" style="display:none;">
                        <div class="switch-form-row">
                            <div class="switch-form-group">
                                <label for="switchTrack100m">${t100Label}</label>
                                <input type="number" step="0.01" id="switchTrack100m" class="form-input" placeholder="e.g. 11.25">
                            </div>
                            <div class="switch-form-group">
                                <label for="switchTrack200m">${t200Label}</label>
                                <input type="number" step="0.01" id="switchTrack200m" class="form-input" placeholder="e.g. 22.80">
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }

        // PFF Grade — collegeplayer + transferplayer only. NULL = no grade.
        if (['collegeplayer', 'transferplayer'].includes(selectedTargetType)) {
            fieldsHTML += `
                <div class="switch-form-group">
                    <label>Do you have a PFF Grade?</label>
                    <div class="switch-radio-row">
                        <label class="switch-radio-label">
                            <input type="radio" name="switchHasPffGrade" value="no" checked>
                            <span>No</span>
                        </label>
                        <label class="switch-radio-label">
                            <input type="radio" name="switchHasPffGrade" value="yes">
                            <span>Yes</span>
                        </label>
                    </div>
                </div>
                <div id="switchPffGradeBlock" style="display:none;">
                    <div class="switch-form-group">
                        <label for="switchPffGrade">PFF Grade (0.0 – 100.0)</label>
                        <input type="number" id="switchPffGrade" min="0" max="100" step="0.1" class="form-input" placeholder="e.g. 80.5">
                    </div>
                </div>
            `;
        }

        // AI Fit-Matching "Recruiting Fit" fields — identical across all 3 player
        // targets (Plan 4). Pickers/sliders are wired in attachStep2Listeners().
        fieldsHTML += renderSwitchPlayerFitFields();
    } else if (targetRole === 'coach') {
        const isCollege = selectedTargetType === 'collegecoach';
        fieldsHTML += `
            <div class="switch-form-group">
                <label>${isCollege ? 'College/University' : 'High School'} Name <span class="required">*</span></label>
                <input type="text" id="switchTeamName" placeholder="Enter school name" class="form-input">
            </div>
            <div class="switch-form-group">
                <label>State <span class="required">*</span></label>
                <select id="switchState" class="form-input">
                    <option value="">Select State</option>
                    ${US_STATES.map(([abbr, name]) => `<option value="${abbr}">${name}</option>`).join('')}
                </select>
            </div>
            <div class="switch-form-group">
                <label>Coaching Position(s) <span class="required">*</span></label>
                <p class="form-hint" style="margin-bottom: 0.5rem;">Select all positions you coach</p>
                <div class="switch-position-grid">
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Head Coach</h4>
                        ${['Head Coach'].map(p => `<label class="switch-pos-checkbox"><input type="checkbox" name="switchCoachPosition" value="${p}"><span>${p}</span></label>`).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Coordinators</h4>
                        ${['Offensive Coordinator', 'Defensive Coordinator', 'Special Teams Coordinator'].map(p => `<label class="switch-pos-checkbox"><input type="checkbox" name="switchCoachPosition" value="${p}"><span>${p}</span></label>`).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Offense Coaches</h4>
                        ${['Quarterbacks Coach', 'Running Backs Coach', 'Wide Receivers Coach', 'Tight Ends Coach', 'Offensive Line Coach'].map(p => `<label class="switch-pos-checkbox"><input type="checkbox" name="switchCoachPosition" value="${p}"><span>${p}</span></label>`).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Defense Coaches</h4>
                        ${['Defensive Line Coach', 'Linebackers Coach', 'Defensive Backs Coach', 'Safeties Coach', 'Cornerbacks Coach'].map(p => `<label class="switch-pos-checkbox"><input type="checkbox" name="switchCoachPosition" value="${p}"><span>${p}</span></label>`).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Special Teams</h4>
                        ${['Special Teams Coach'].map(p => `<label class="switch-pos-checkbox"><input type="checkbox" name="switchCoachPosition" value="${p}"><span>${p}</span></label>`).join('')}
                    </div>
                    <div class="switch-pos-group">
                        <h4 class="switch-pos-group-label">Other Staff</h4>
                        ${['Recruiting Coordinator', 'Assistant Coach', 'Graduate Assistant'].map(p => `<label class="switch-pos-checkbox"><input type="checkbox" name="switchCoachPosition" value="${p}"><span>${p}</span></label>`).join('')}
                    </div>
                </div>
                <div class="switch-selected-positions" id="switchSelectedCoachPositions"></div>
            </div>
        `;

        if (isCollege) {
            fieldsHTML += `
                <div class="switch-form-row">
                    <div class="switch-form-group form-group">
                        <label>Division <span class="required">*</span></label>
                        <select id="switchDivision" class="form-input">
                            <option value="">Select Division</option>
                            ${DIVISION_OPTIONS.map(([val, label]) => `<option value="${val}">${label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="switch-form-group">
                        <label>Conference</label>
                        <input type="text" id="switchConference" placeholder="e.g. Big 12" class="form-input">
                    </div>
                </div>
            `;
            // NOTE: AI Fit-Matching "Program Profile" fields are NOT rendered here.
            // Switching TO collegecoach is invite-gated — goToStep2() redirects to the
            // invite splash before this step-2 form ever shows. The coach fit fields are
            // collected on create-coach-profile.html (Plan 3, isSwitchMode) and flow
            // through POST /switch-profile, which DOES persist them (backend, Plan 4).
        }
    } else {
        // 'other' type — minimal fields
        fieldsHTML += `
            <div class="switch-form-group">
                <label>Subheader</label>
                <input type="text" id="switchSubheader" placeholder="e.g. Sports Reporter, Parent" class="form-input" maxlength="100">
            </div>
            <div class="switch-form-group">
                <label>Bio</label>
                <textarea id="switchBio" placeholder="Tell us about yourself" class="form-input" rows="3" maxlength="1000"></textarea>
            </div>
        `;
    }

    return `
        <div class="switch-step" id="switchStep2">
            <h3>Set up your ${target.label} profile</h3>
            <p class="switch-step-subtitle">Fill in the required information for your new profile.</p>
            <div class="switch-form">${fieldsHTML}</div>
            <div class="switch-form-error" id="switchFormError" style="display:none;"></div>
            <div class="switch-step-actions">
                <button class="btn-secondary" id="switchBackBtn2">Back</button>
                <button class="btn-primary" id="switchNextBtn2">Next</button>
            </div>
        </div>
    `;
}

// ── Switch-form parent/guardian rows (hsplayer/transferplayer; optional, up to 4) ──
const SWITCH_GUARDIAN_MAX = 4;

function refreshSwitchGuardianUI() {
    const container = document.getElementById('switchGuardianRows');
    const addBtn = document.getElementById('switchAddGuardianBtn');
    if (!container) return;
    const rows = container.querySelectorAll('.guardian-row');
    rows.forEach((row, i) => {
        const title = row.querySelector('.guardian-row-title');
        if (title) title.textContent = `Parent / Guardian ${i + 1}`;
    });
    if (addBtn) addBtn.disabled = rows.length >= SWITCH_GUARDIAN_MAX;
}

function addSwitchGuardianRow(data) {
    const container = document.getElementById('switchGuardianRows');
    if (!container) return;
    if (container.querySelectorAll('.guardian-row').length >= SWITCH_GUARDIAN_MAX) return;
    const d = data || {};
    const row = document.createElement('div');
    row.className = 'guardian-row';
    row.innerHTML = `
        <div class="guardian-row-header">
            <span class="guardian-row-title">Parent / Guardian</span>
            <button type="button" class="btn-remove-guardian" title="Remove">&times;</button>
        </div>
        <div class="switch-form-group">
            <label>Name</label>
            <input type="text" class="guardian-name form-input" placeholder="Full name" value="${escapeHTML(d.name || '')}">
        </div>
        <div class="switch-form-row">
            <div class="switch-form-group">
                <label>Email</label>
                <input type="email" class="guardian-email form-input" placeholder="email@example.com" value="${escapeHTML(d.email || '')}">
            </div>
            <div class="switch-form-group">
                <label>Phone</label>
                <input type="tel" class="guardian-phone form-input" placeholder="(555) 123-4567" value="${escapeHTML(d.phone || '')}">
            </div>
        </div>
    `;
    row.querySelector('.btn-remove-guardian').addEventListener('click', function () {
        row.remove();
        refreshSwitchGuardianUI();
    });
    container.appendChild(row);
    refreshSwitchGuardianUI();
}

function collectSwitchGuardians() {
    const container = document.getElementById('switchGuardianRows');
    if (!container) return [];
    const out = [];
    container.querySelectorAll('.guardian-row').forEach(row => {
        const name = (row.querySelector('.guardian-name').value || '').trim();
        const email = (row.querySelector('.guardian-email').value || '').trim();
        const phone = (row.querySelector('.guardian-phone').value || '').trim().replace(/\D/g, '');
        if (name || email || phone) out.push({ name, email, phone });
    });
    return out;
}

// Returns an error string if any shown guardian row is partially filled, else null.
function validateSwitchGuardians() {
    const list = collectSwitchGuardians();
    for (const g of list) {
        if (!g.name || !g.email || !g.phone) {
            return 'Each parent/guardian needs a name, email, and phone (or remove the row).';
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email)) {
            return 'Please enter a valid parent/guardian email.';
        }
    }
    return null;
}

function attachStep2Listeners() {
    // Parent/guardian Add button (only present for hsplayer/transferplayer targets)
    const switchAddGuardianBtn = document.getElementById('switchAddGuardianBtn');
    if (switchAddGuardianBtn) switchAddGuardianBtn.addEventListener('click', () => addSwitchGuardianRow());

    document.getElementById('switchBackBtn2').addEventListener('click', () => {
        if (switchSchoolSearch) {
            switchSchoolSearch.destroy();
            switchSchoolSearch = null;
        }
        const body = document.querySelector('.switch-modal-body');
        body.innerHTML = renderStep1();
        updateStepIndicator(1);
        attachStep1Listeners();
        // Re-select the previously selected type
        if (selectedTargetType) {
            const card = document.querySelector(`.switch-type-card[data-type="${selectedTargetType}"]`);
            if (card) {
                card.classList.add('selected');
                document.getElementById('switchNextBtn1').disabled = false;
            }
        }
    });

    // Position checkbox listeners (player)
    document.querySelectorAll('input[name="switchPosition"]').forEach(cb => {
        cb.addEventListener('change', updateSelectedPositionsDisplay);
    });

    // Position checkbox listeners (coach)
    document.querySelectorAll('input[name="switchCoachPosition"]').forEach(cb => {
        cb.addEventListener('change', updateSelectedCoachPositionsDisplay);
    });

    // Athletics — only present for hsplayer + transferplayer targets
    const athleticsRadios = document.querySelectorAll('input[name="switchPlaysOtherSports"]');
    if (athleticsRadios.length) {
        athleticsRadios.forEach(r => r.addEventListener('change', function () {
            const show = this.value === 'yes';
            const block = document.getElementById('switchOtherSportsBlock');
            if (block) block.style.display = show ? '' : 'none';
            if (!show) {
                // Reset everything so a "No" submit always produces NULLs server-side
                document.querySelectorAll('.switch-sport-checkbox:checked').forEach(c => { c.checked = false; });
                const tg = document.getElementById('switchOtherSportTextGroup');
                const tb = document.getElementById('switchTrackTimesBlock');
                const ot = document.getElementById('switchOtherSportText');
                const t1 = document.getElementById('switchTrack100m');
                const t2 = document.getElementById('switchTrack200m');
                if (tg) tg.style.display = 'none';
                if (tb) tb.style.display = 'none';
                if (ot) ot.value = '';
                if (t1) t1.value = '';
                if (t2) t2.value = '';
                updateSelectedSportsDisplay();
            }
        }));

        document.querySelectorAll('.switch-sport-checkbox').forEach(cb => {
            cb.addEventListener('change', () => {
                const sel = getSelectedSports();
                const tb = document.getElementById('switchTrackTimesBlock');
                const og = document.getElementById('switchOtherSportTextGroup');
                if (tb) tb.style.display = sel.includes('Track and Field') ? '' : 'none';
                if (og) og.style.display = sel.includes('Other') ? '' : 'none';
                if (!sel.includes('Track and Field')) {
                    const t1 = document.getElementById('switchTrack100m');
                    const t2 = document.getElementById('switchTrack200m');
                    if (t1) t1.value = '';
                    if (t2) t2.value = '';
                }
                if (!sel.includes('Other')) {
                    const ot = document.getElementById('switchOtherSportText');
                    if (ot) ot.value = '';
                }
                updateSelectedSportsDisplay();
            });
        });

        // Carry over existing Athletics data when switching between hs/transfer player
        applyAthleticsPrefill();
    }

    // PFF Grade — collegeplayer + transferplayer targets
    const pffRadios = document.querySelectorAll('input[name="switchHasPffGrade"]');
    if (pffRadios.length) {
        pffRadios.forEach(r => r.addEventListener('change', function () {
            const show = this.value === 'yes';
            const block = document.getElementById('switchPffGradeBlock');
            if (block) block.style.display = show ? '' : 'none';
            if (!show) {
                const input = document.getElementById('switchPffGrade');
                if (input) input.value = '';
            }
        }));
        // Carry over existing PFF grade when switching between collegeplayer<->transferplayer
        applyPffGradePrefill();
    }

    // --- AI Fit-Matching pickers / sliders / counters (Plan 4) ---
    // Reset so controllers from a previous target type don't leak across re-renders.
    // FRESH INPUT: no prefill — pickers start empty, sliders default 3.
    switchFitPickers = {};
    const targetRole = getBaseRoleFromType(selectedTargetType);
    const hasMatchUI = typeof initMatchMultiSelect === 'function' && typeof MATCH_CONSTANTS !== 'undefined';

    const wireSlider = (id) => {
        const s = document.getElementById(id), out = document.getElementById(id + 'Val');
        if (s && out) s.addEventListener('input', () => { out.textContent = s.value; });
    };
    const wireCounter = (taId, countId) => {
        const ta = document.getElementById(taId), c = document.getElementById(countId);
        if (ta && c) ta.addEventListener('input', () => { c.textContent = ta.value.length; });
    };

    if (targetRole === 'player') {
        if (hasMatchUI) {
            switchFitPickers.major = initMatchMultiSelect({
                container: '#switchMajorContainer', chips: '#switchSelectedMajors',
                groups: MATCH_CONSTANTS.MAJOR_GROUPS, max: 3, capHintEl: '#switchMajorCapHint', name: 'switch_major'
            });
            switchFitPickers.levels = initMatchMultiSelect({
                container: '#switchLevelsContainer', chips: '#switchSelectedLevels',
                options: MATCH_CONSTANTS.LEVELS, name: 'switch_levels'
            });
            switchFitPickers.regions = initMatchMultiSelect({
                container: '#switchRegionsContainer', chips: '#switchSelectedRegions',
                options: MATCH_CONSTANTS.REGIONS, name: 'switch_regions'
            });
        }
        // AP/IB count reveal
        document.querySelectorAll('input[name="switchHasApIb"]').forEach(r => r.addEventListener('change', function () {
            const grp = document.getElementById('switchApIbCountGroup');
            if (grp) grp.style.display = this.value === 'yes' ? '' : 'none';
            if (this.value !== 'yes') { const c = document.getElementById('switchApIbCount'); if (c) c.value = ''; }
        }));
        ['switchImpPlayingTime', 'switchImpCloseToHome', 'switchImpAcademics', 'switchImpCompetition'].forEach(wireSlider);
        wireCounter('switchLookingFor', 'switchLookingForCount');
    }
    // (collegecoach fit fields are handled on create-coach-profile.html, not here —
    //  switching to collegecoach is invite-gated and never reaches this step.)

    document.getElementById('switchNextBtn2').addEventListener('click', () => {
        const error = validateStep2();
        if (error) {
            const errorEl = document.getElementById('switchFormError');
            errorEl.textContent = error;
            errorEl.style.display = '';
            return;
        }
        goToStep3();
    });
}

function validateStep2() {
    const username = document.getElementById('switchUsername')?.value?.trim();
    if (!username) return 'Username is required';
    if (!/^[a-z0-9_]{1,15}$/.test(username)) return 'Username must be 1-15 characters, lowercase letters, numbers, and underscores only';

    // DOB required for ALL target types (App Store age rating).
    if (!document.getElementById('switchDateOfBirth')?.value) return 'Date of birth is required';

    const targetRole = getBaseRoleFromType(selectedTargetType);

    if (targetRole === 'player') {
        if (!document.getElementById('switchTeamName')?.value?.trim()) return 'School name is required';
        if (!document.getElementById('switchState')?.value) return 'State is required';
        if (!document.getElementById('switchGradYear')?.value) return 'Graduation year is required';
        if (getSelectedPositions().length === 0) return 'At least one position is required';
        if (!document.getElementById('switchHeightFt')?.value) return 'Height is required';
        if (!document.getElementById('switchWeight')?.value) return 'Weight is required';
        if (['collegeplayer', 'transferplayer'].includes(selectedTargetType)) {
            if (!document.getElementById('switchDivision')?.value) return 'Division is required';
        }
        // Recruiting contact fields — required on hsplayer + transferplayer only.
        if (['hsplayer', 'transferplayer'].includes(selectedTargetType)) {
            if (!document.getElementById('switchGender')?.value) return 'Gender is required';
            if (!document.getElementById('switchPhone')?.value?.trim()) return 'Phone number is required';
            if (!document.getElementById('switchAddress')?.value?.trim()) return 'Mailing address is required';
            if (!document.getElementById('switchCity')?.value?.trim()) return 'City is required';
            const zip = (document.getElementById('switchZip')?.value || '').trim();
            if (!/^\d{5}(-\d{4})?$/.test(zip)) return 'A valid ZIP code is required';
            if (!document.getElementById('switchCoachName')?.value?.trim()) return 'Coach name is required';
            const cEmail = (document.getElementById('switchCoachEmail')?.value || '').trim();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cEmail)) return 'A valid coach email is required';
            if (!document.getElementById('switchCoachPhone')?.value?.trim()) return 'Coach phone is required';
            // Parent/guardian rows are optional but each shown row is all-or-nothing.
            const gErr = validateSwitchGuardians();
            if (gErr) return gErr;
        }
    } else if (targetRole === 'coach') {
        if (!document.getElementById('switchTeamName')?.value?.trim()) return 'School name is required';
        if (!document.getElementById('switchState')?.value) return 'State is required';
        if (getSelectedCoachPositions().length === 0) return 'At least one coaching position is required';
        if (selectedTargetType === 'collegecoach') {
            if (!document.getElementById('switchDivision')?.value) return 'Division is required';
        }
    }

    return null;
}

function collectStep2Data() {
    const data = {
        first_name: document.getElementById('switchFirstName')?.value?.trim(),
        last_name: document.getElementById('switchLastName')?.value?.trim(),
        username: document.getElementById('switchUsername')?.value?.trim(),
        // DOB collected for ALL target types (App Store age rating).
        date_of_birth: document.getElementById('switchDateOfBirth')?.value || null
    };

    const targetRole = getBaseRoleFromType(selectedTargetType);

    if (targetRole === 'player') {
        data.team_name = document.getElementById('switchTeamName')?.value?.trim();
        data.state = document.getElementById('switchState')?.value;
        data.graduation_year = parseInt(document.getElementById('switchGradYear')?.value) || null;
        data.position = getSelectedPositions().join('/');
        const heightFt = parseInt(document.getElementById('switchHeightFt')?.value) || 0;
        const heightIn = parseInt(document.getElementById('switchHeightIn')?.value) || 0;
        data.height = heightFt > 0 ? (heightFt * 12) + heightIn : null;
        data.weight = parseInt(document.getElementById('switchWeight')?.value) || null;
        data.gpa = parseFloat(document.getElementById('switchGPA')?.value) || null;

        if (['collegeplayer', 'transferplayer'].includes(selectedTargetType)) {
            data.college_division = document.getElementById('switchDivision')?.value;
            data.conference = document.getElementById('switchConference')?.value?.trim() || null;
            data.number = parseInt(document.getElementById('switchJerseyNumber')?.value) || null;
        }
        // Eligibility — collegeplayer + transferplayer both collect it.
        if (['collegeplayer', 'transferplayer'].includes(selectedTargetType)) {
            data.eligibility = parseInt(document.getElementById('switchEligibility')?.value) || null;
        }

        // Athletics — hsplayer + transferplayer only (mirrors profile-form.js)
        if (['hsplayer', 'transferplayer'].includes(selectedTargetType)) {
            const playsYes = document.querySelector('input[name="switchPlaysOtherSports"]:checked')?.value === 'yes';
            const selectedSports = getSelectedSports();
            let otherSportsPayload = null;
            if (playsYes && selectedSports.length) {
                otherSportsPayload = selectedSports.filter(s => s !== 'Other');
                if (selectedSports.includes('Other')) {
                    const txt = (document.getElementById('switchOtherSportText')?.value || '').trim();
                    if (txt) otherSportsPayload.push(`other:${txt}`);
                }
                if (otherSportsPayload.length === 0) otherSportsPayload = null;
            }
            data.other_sports = otherSportsPayload;
            const hasTrack = playsYes && selectedSports.includes('Track and Field');
            data.track_100m = hasTrack ? (parseFloat(document.getElementById('switchTrack100m')?.value) || null) : null;
            data.track_200m = hasTrack ? (parseFloat(document.getElementById('switchTrack200m')?.value) || null) : null;

            // Recruiting contact fields — hsplayer + transferplayer only (private; CSV export).
            data.gender = document.getElementById('switchGender')?.value || null;
            data.phone = (document.getElementById('switchPhone')?.value || '').trim() || null;
            data.address = (document.getElementById('switchAddress')?.value || '').trim() || null;
            data.city = (document.getElementById('switchCity')?.value || '').trim() || null;
            data.zip = (document.getElementById('switchZip')?.value || '').trim() || null;
            data.coach_name = (document.getElementById('switchCoachName')?.value || '').trim() || null;
            data.coach_email = (document.getElementById('switchCoachEmail')?.value || '').trim() || null;
            data.coach_phone = (document.getElementById('switchCoachPhone')?.value || '').trim() || null;
            data.parent_guardians = collectSwitchGuardians();
        }

        // PFF Grade — collegeplayer + transferplayer only. NULL = no grade reported.
        if (['collegeplayer', 'transferplayer'].includes(selectedTargetType)) {
            const hasPff = document.querySelector('input[name="switchHasPffGrade"]:checked')?.value === 'yes';
            data.pff_grade = hasPff
                ? (parseFloat(document.getElementById('switchPffGrade')?.value) || null)
                : null;
        }

        // AI Fit-Matching "Recruiting Fit" fields (Plan 4) — same shape the create
        // route persists (mirrors hsplayer/profile-form.js serialization).
        const sRadio = (name) => { const el = document.querySelector(`input[name="${name}"]:checked`); return el ? el.value : null; };
        const sNum = (id) => { const el = document.getElementById(id); if (!el || el.value === '') return null; const n = parseFloat(el.value); return Number.isNaN(n) ? null : n; };
        const sInt = (id) => { const el = document.getElementById(id); if (!el || el.value === '') return null; const n = parseInt(el.value, 10); return Number.isNaN(n) ? null : n; };
        const hasApIb = sRadio('switchHasApIb') === 'yes';
        const pell = sRadio('switchPellFirstGen');
        data.sat_score = sInt('switchSatScore');
        data.act_score = sInt('switchActScore');
        data.weighted_gpa = sNum('switchWeightedGpa');
        data.has_ap_ib = hasApIb;
        data.ap_ib_count = hasApIb ? sInt('switchApIbCount') : null;
        data.class_rank = (document.getElementById('switchClassRank')?.value || '').trim() || null;
        const majors = switchFitPickers.major ? switchFitPickers.major.getSelected() : [];
        data.intended_major = majors.length ? majors : null;
        data.home_zip = (document.getElementById('switchHomeZip')?.value || '').trim() || null;
        data.needs_financial_aid = sRadio('switchNeedsFinancialAid');
        data.needs_scholarship = sRadio('switchNeedsScholarship');
        data.pell_or_first_gen = pell === null ? null : (pell === 'yes');
        const levels = switchFitPickers.levels ? switchFitPickers.levels.getSelected() : [];
        data.levels_open = levels.length ? levels : null;
        const regions = switchFitPickers.regions ? switchFitPickers.regions.getSelected() : [];
        data.preferred_regions = regions.length ? regions : null;
        data.preferred_campus_setting = document.getElementById('switchCampusSetting')?.value || null;
        const lookingFor = (document.getElementById('switchLookingFor')?.value || '').trim();
        data.fit_preferences = {
            importance_playing_time: sInt('switchImpPlayingTime'),
            importance_close_to_home: sInt('switchImpCloseToHome'),
            importance_academics_vs_football: sInt('switchImpAcademics'),
            importance_competition_level: sInt('switchImpCompetition'),
            looking_for_text: lookingFor || null
        };
    } else if (targetRole === 'coach') {
        data.team_name = document.getElementById('switchTeamName')?.value?.trim();
        data.state = document.getElementById('switchState')?.value;
        data.position_title = getSelectedCoachPositions().join('/');

        if (selectedTargetType === 'collegecoach') {
            data.college_division = document.getElementById('switchDivision')?.value;
            data.conference = document.getElementById('switchConference')?.value?.trim() || null;
            // collegecoach fit fields are NOT collected here — that switch goes through
            // create-coach-profile.html (Plan 3), which serializes them into profileData.
        }
    } else {
        data.subheader = document.getElementById('switchSubheader')?.value?.trim() || null;
        data.bio = document.getElementById('switchBio')?.value?.trim() || null;
    }

    return data;
}

function goToStep3() {
    const body = document.querySelector('.switch-modal-body');
    const target = switchProfileInfo.targets.find(t => t.type === selectedTargetType);
    const profileData = collectStep2Data();

    let warnings = `
        <div class="switch-warning">
            <div>
                <strong>This action is permanent.</strong>
                <p>Your current profile data (stats, position, team info, etc.) will be permanently deleted. All of your social data will be preserved, including your posts, comments, likes, followers, following, messages, conversations, and notifications.</p>
            </div>
        </div>
    `;

    if (target.is_paid) {
        warnings += `
            <div class="switch-info-banner">
                <strong>${target.label}</strong> is a paid profile type. A subscription will be required for full access to premium features.
            </div>
        `;
    }

    body.innerHTML = `
        <div class="switch-step" id="switchStep3">
            <h3>Confirm profile switch</h3>
            <div class="switch-confirm-summary">
                <div class="switch-confirm-from">
                    <span class="switch-confirm-label">From</span>
                    <span class="switch-confirm-value">${switchProfileInfo.current_label}</span>
                    <span class="switch-type-badge ${switchProfileInfo.is_current_paid ? 'badge-paid' : 'badge-free'}">${switchProfileInfo.is_current_paid ? 'PAID' : 'FREE'}</span>
                </div>
                <div class="switch-confirm-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                        <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                </div>
                <div class="switch-confirm-to">
                    <span class="switch-confirm-label">To</span>
                    <span class="switch-confirm-value">${target.label}</span>
                    <span class="switch-type-badge ${target.is_paid ? 'badge-paid' : 'badge-free'}">${target.is_paid ? 'PAID' : 'FREE'}</span>
                </div>
            </div>
            ${warnings}
            <div class="switch-confirm-check">
                <label>
                    <input type="checkbox" id="switchConfirmCheckbox">
                    I understand this is permanent and want to switch my profile type
                </label>
            </div>
            <div class="switch-form-error" id="switchConfirmError" style="display:none;"></div>
            <div class="switch-step-actions">
                <button class="btn-secondary" id="switchBackBtn3">Back</button>
                <button class="btn-primary btn-danger" id="switchConfirmBtn" disabled>Switch Profile</button>
            </div>
        </div>
    `;

    updateStepIndicator(3);

    document.getElementById('switchConfirmCheckbox').addEventListener('change', (e) => {
        document.getElementById('switchConfirmBtn').disabled = !e.target.checked;
    });

    document.getElementById('switchBackBtn3').addEventListener('click', () => {
        goToStep2();
    });

    document.getElementById('switchConfirmBtn').addEventListener('click', () => {
        executeSwitchProfile(profileData);
    });
}

async function executeSwitchProfile(profileData) {
    const btn = document.getElementById('switchConfirmBtn');
    const errorEl = document.getElementById('switchConfirmError');
    const originalText = btn.textContent;

    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');

    // Plan B5 — iOS Apple-billing gate. An Apple IAP subscription can only be
    // cancelled by the user in iOS Settings (there is no backend RevenueCat cancel
    // API). Warn BEFORE the switch whenever the current Apple plan won't carry to
    // the target type — paid→free AND cross-type paid→paid alike (the old plan
    // keeps billing while the new type needs its own purchase). The
    // hsplayer↔transferplayer pair shares one product, so it carries: no warning.
    // Profile types blocked from the platform without a subscription. Players are
    // NOT here since 2026-07 — they are free, and their subscription is an AI Rep
    // add-on. This list only picks the warning COPY below.
    const PAID = ['collegecoach'];
    const targetIsFree = !PAID.includes(selectedTargetType);
    // Ask "does my plan carry to the target?", NOT "is my profile type paid".
    // is_current_paid is false for players now, so keying off it would silence this
    // warning exactly when a player with an Apple sub switches away — and Apple
    // would keep charging them with no notice. allowed_tiers mirrors the backend
    // switch ladder's targetAllowedTiers, so the two can't drift.
    const targetInfo = switchProfileInfo && switchProfileInfo.targets &&
                       switchProfileInfo.targets.find(t => t.type === selectedTargetType);
    const targetAllowedTiers = (targetInfo && targetInfo.allowed_tiers) || [];
    if (API.isIOSApp() && switchProfileInfo) {
        let source = null, status = null, tier = null;
        try {
            const sub = await API.payments.getSubscriptionStatus();
            source = sub && sub.source;
            status = sub && sub.status;
            tier = sub && sub.tier;
        } catch (_) { /* if we can't tell, fall through to the warning to be safe */ }
        // 'trialing' counts: a trial player is still on the hook on day 7. The old
        // check was status === 'active' only, which missed the DEFAULT state of a
        // brand-new player subscriber.
        const holdsEntitlement = ['active', 'trialing', 'past_due'].includes(status);
        const carriesOver = !!tier && targetAllowedTiers.includes(tier);
        // carriesOver already covers the hsplayer<->transferplayer pair (both allow
        // the 'player' tier), so no separate samePricePair check is needed.
        if (source === 'apple_iap' && holdsEntitlement && !carriesOver) {
            const proceed = await showConfirmModal({
                title: 'Apple subscription stays active',
                message: targetIsFree
                    ? 'Your subscription is billed through Apple. Switching to a free profile will NOT cancel it. Cancel it yourself in Settings > Apple ID > Subscriptions, or you will keep being charged.'
                    : 'Your current Apple plan keeps billing until YOU cancel it in Settings > Apple ID > Subscriptions. Your new profile type requires purchasing its own plan.',
                confirmText: 'Switch Anyway',
                cancelText: 'Go Back',
                danger: true
            });
            if (!proceed) {
                return; // user backed out; no switch
            }
        }
    }

    btn.disabled = true;
    btn.textContent = 'Switching...';
    errorEl.style.display = 'none';

    try {
        const result = await API.settings.switchProfile(selectedTargetType, profileData);

        if (result.success) {
            // iOS Bearer fallback: the switch rotates the JWT (new role). Persist the
            // new token or iOS keeps sending the old-role token after the switch.
            if (result.token && API.setAuthToken) API.setAuthToken(result.token);
            const folder = result.redirect_folder;
            const mainpageMap = {
                hsplayer: 'mainpage-player.html',
                collegeplayer: 'mainpage-player.html',
                transferplayer: 'mainpage-player.html',
                hscoach: 'mainpage-coach.html',
                collegecoach: 'mainpage-coach.html',
                other: 'mainpage-other.html'
            };
            const mainpage = mainpageMap[folder] || 'mainpage-player.html';
            const redirectUrl = `${FE_BASE}/${folder}/${mainpage}`;

            if (result.requires_payment) {
                // Verify-then-pay model: the switch has committed server-side and the
                // user is now on the paid profile type with subscription_status='none'.
                // They are an existing, already-verified account, so send them to the
                // PAYWALL (shared/subscription-required.html) to subscribe — Stripe (web)
                // / Apple IAP (iOS), handled there. We do NOT take payment from settings.
                // An unpaid switched account is a normal gated account, not broken.
                closeSwitchProfileModal();
                btn.textContent = 'Switched! Redirecting...';
                showToast('Switched to ' + (result.payment_profile_type || 'paid') + '. Subscribe to unlock its features.', 'success');
                window.location.href = FE_BASE + '/shared/subscription-required.html';
                return;
            } else {
                // No payment needed — show success and redirect
                btn.textContent = 'Success! Redirecting...';
                btn.classList.remove('btn-danger');
                btn.classList.add('btn-success');
                setTimeout(() => {
                    window.location.href = redirectUrl;
                }, 1000);
            }
        } else {
            errorEl.textContent = result.error || 'Failed to switch profile';
            errorEl.style.display = '';
            btn.textContent = originalText;
            btn.disabled = false;
        }
    } catch (error) {
        errorEl.textContent = error.message || 'Failed to switch profile. Please try again.';
        errorEl.style.display = '';
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function closeSwitchProfileModal() {
    if (switchSchoolSearch) {
        switchSchoolSearch.destroy();
        switchSchoolSearch = null;
    }
    const modal = document.getElementById('switchProfileModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

// Replaces step 2 of the switch flow when user picks College Coach.
// Switching to College Coach is invite-only — they can't fill out a form here;
// they have to submit a contact request, get manually approved, and redeem an invite.
function showCollegeCoachSwitchVerificationSplash() {
    const body = document.querySelector('.switch-modal-body');
    if (!body) return;
    // Full URL (origin + path), not a bare /frontend/... — iOS WKWebView (origin
    // https://localhost) won't navigate on a bare root-relative path. In-app the bundle
    // root is the frontend/ contents, so there is no '/frontend' path segment; on web
    // there is. Mirror shared/api.js's prefix convention so this resolves in BOTH envs.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    const requestUrl = FE_BASE + '/landingpage/coach-signup-request.html?switch=1';
    body.innerHTML = `
        <div style="padding: 1rem 0.5rem; text-align: center;">
            <div style="width:64px;height:64px;border-radius:50%;background:rgba(255,107,53,0.15);
                        border:2px solid #ff6b35;display:inline-flex;align-items:center;justify-content:center;
                        margin-bottom:1.25rem;color:#ff6b35;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
            </div>
            <h2 style="font-size:1.4rem;font-weight:800;color:#fff;margin:0 0 0.5rem;">
                College Coach accounts require verification
            </h2>
            <p style="color:rgba(255,255,255,0.7);font-size:0.95rem;line-height:1.5;margin:0 0 1.25rem;">
                Submit a request and we'll review within 48 hours. We'll send a verification link
                to your <strong>.edu</strong> email — once you click it, your account switches over
                with school + division locked to what we verified.
            </p>
            <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.5;margin:0 0 1.5rem;">
                Your existing posts, connections, and account stay intact. The switch happens after
                you click the verification link.
            </p>
            <div style="display:flex;gap:0.75rem;flex-direction:column;max-width:280px;margin:0 auto;">
                <button type="button"
                   onclick="closeSwitchProfileModal(); window.location.href='${requestUrl}';"
                   style="display:inline-block;background:linear-gradient(135deg,#1282a2 0%,#ff6b35 140%);
                          color:#fff;border:none;font-weight:700;padding:0.75rem 1.5rem;cursor:pointer;
                          border-radius:10px;font-size:0.95rem;font-family:inherit;">
                    Request Access
                </button>
                <button type="button" onclick="closeSwitchProfileModal()"
                        style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);
                               color:rgba(255,255,255,0.85);font-weight:600;padding:0.65rem 1.5rem;
                               border-radius:10px;cursor:pointer;font-family:inherit;font-size:0.9rem;">
                    Cancel
                </button>
            </div>
        </div>
    `;
}

function updateStepIndicator(step) {
    document.querySelectorAll('.step-dot').forEach(dot => {
        const dotStep = parseInt(dot.dataset.step);
        dot.classList.toggle('active', dotStep === step);
        dot.classList.toggle('completed', dotStep < step);
    });
}

function getBaseRoleFromType(type) {
    if (['hsplayer', 'collegeplayer', 'transferplayer'].includes(type)) return 'player';
    if (['hscoach', 'collegecoach'].includes(type)) return 'coach';
    return 'other';
}

function getSelectedPositions() {
    return Array.from(document.querySelectorAll('input[name="switchPosition"]:checked')).map(cb => cb.value);
}

function updateSelectedPositionsDisplay() {
    const container = document.getElementById('switchSelectedPositions');
    if (!container) return;
    const positions = getSelectedPositions();
    if (positions.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = positions.map(pos =>
        `<span class="switch-pos-pill">${pos}<button type="button" data-pos="${pos}">&times;</button></span>`
    ).join('');
    container.querySelectorAll('button[data-pos]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cb = document.querySelector(`input[name="switchPosition"][value="${btn.dataset.pos}"]`);
            if (cb) cb.checked = false;
            updateSelectedPositionsDisplay();
        });
    });
}

function getSelectedCoachPositions() {
    return Array.from(document.querySelectorAll('input[name="switchCoachPosition"]:checked')).map(cb => cb.value);
}

function updateSelectedCoachPositionsDisplay() {
    const container = document.getElementById('switchSelectedCoachPositions');
    if (!container) return;
    const positions = getSelectedCoachPositions();
    if (positions.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = positions.map(pos =>
        `<span class="switch-pos-pill">${pos}<button type="button" data-pos="${pos}">&times;</button></span>`
    ).join('');
    container.querySelectorAll('button[data-pos]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cb = document.querySelector(`input[name="switchCoachPosition"][value="${btn.dataset.pos}"]`);
            if (cb) cb.checked = false;
            updateSelectedCoachPositionsDisplay();
        });
    });
}

// ─── Athletics helpers (used by hsplayer + transferplayer switch targets) ────
function getSelectedSports() {
    return Array.from(document.querySelectorAll('.switch-sport-checkbox:checked')).map(cb => cb.value);
}

function updateSelectedSportsDisplay() {
    const container = document.getElementById('switchSelectedSports');
    if (!container) return;
    const sports = getSelectedSports();
    if (sports.length === 0) {
        container.innerHTML = '';
        return;
    }
    container.innerHTML = sports.map(s =>
        `<span class="switch-pos-pill">${s}<button type="button" data-sport="${s}">&times;</button></span>`
    ).join('');
    container.querySelectorAll('button[data-sport]').forEach(btn => {
        btn.addEventListener('click', () => {
            const cb = document.querySelector(`.switch-sport-checkbox[value="${btn.dataset.sport}"]`);
            if (cb) {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            }
        });
    });
}

function applyAthleticsPrefill() {
    const a = switchProfileInfo && switchProfileInfo.current_athletics;
    if (!a) return;
    const sports = Array.isArray(a.other_sports) ? a.other_sports : [];
    if (sports.length === 0 && a.track_100m == null && a.track_200m == null) return;

    // Split "other:<text>" entries from canonical sport names
    const namedSports = [];
    let otherText = '';
    sports.forEach(s => {
        if (typeof s === 'string' && s.startsWith('other:')) {
            otherText = s.slice('other:'.length);
        } else if (typeof s === 'string') {
            namedSports.push(s);
        }
    });
    const wantOther = otherText.length > 0;

    // Flip the Yes radio so the conditional block reveals
    const yesRadio = document.querySelector('input[name="switchPlaysOtherSports"][value="yes"]');
    if (yesRadio) {
        yesRadio.checked = true;
        yesRadio.dispatchEvent(new Event('change'));
    }

    // Check the canonical sport boxes (+ Other if applicable)
    namedSports.forEach(s => {
        const cb = document.querySelector(`.switch-sport-checkbox[value="${s}"]`);
        if (cb) cb.checked = true;
    });
    if (wantOther) {
        const cb = document.querySelector('.switch-sport-checkbox[value="Other"]');
        if (cb) cb.checked = true;
    }

    // Fire one synthetic change to reveal Track Times / Other Sport text blocks
    const anyCb = document.querySelector('.switch-sport-checkbox');
    if (anyCb) anyCb.dispatchEvent(new Event('change'));

    // Fill values
    if (otherText) {
        const ot = document.getElementById('switchOtherSportText');
        if (ot) ot.value = otherText;
    }
    if (a.track_100m != null) {
        const t1 = document.getElementById('switchTrack100m');
        if (t1) t1.value = a.track_100m;
    }
    if (a.track_200m != null) {
        const t2 = document.getElementById('switchTrack200m');
        if (t2) t2.value = a.track_200m;
    }
}

// PFF Grade prefill — carries existing grade across collegeplayer<->transferplayer switches.
// hsplayer has no PFF column so this never fires when switching from hs.
function applyPffGradePrefill() {
    const v = switchProfileInfo && switchProfileInfo.current_pff_grade;
    if (v == null) return;
    const yesRadio = document.querySelector('input[name="switchHasPffGrade"][value="yes"]');
    if (yesRadio) {
        yesRadio.checked = true;
        yesRadio.dispatchEvent(new Event('change'));
    }
    const input = document.getElementById('switchPffGrade');
    if (input) input.value = v;
}

// ─── Subscription Section ────────────────────────────────────────────────────
// Profile types blocked from the PLATFORM without a subscription (mirrors
// User.PAID_TYPES). Since 2026-07 players are NOT here — they are free, and their
// $10/mo subscription is an AI Rep add-on instead. That makes this section
// three-state, not two: free type / free player with an optional add-on / paid coach.
const PAID_PROFILE_TYPES = ['collegecoach'];
// Free types that can buy an optional add-on (mirrors User.ADDON_TYPES).
const ADDON_PROFILE_TYPES = ['hsplayer', 'transferplayer'];
const PLAN_DISPLAY = {
    player: { name: 'Player Plan', price: '$10/mo' },
    starter: { name: 'Coach Starter', price: '$20/mo' },
    pro: { name: 'Coach Pro', price: '$50/mo' },
    elite: { name: 'Coach Elite', price: '$100/mo' }
};

async function initializeSubscriptionSection() {
    const content = document.getElementById('subscriptionContent');
    if (!content) return;

    try {
        const me = await API.auth.getCurrentUser();
        const profileFolder = getProfileFolder({
            role: me.user.role,
            is_transfer_player: me.user.is_transfer_player,
            college_division: me.profile && me.profile.college_division
        });
        const isPaid = PAID_PROFILE_TYPES.includes(profileFolder);
        const hasAddon = ADDON_PROFILE_TYPES.includes(profileFolder);

        // Players (free platform + optional AI Rep add-on). If they actually hold
        // the add-on we MUST fall through to the full subscription UI — otherwise a
        // paying player would be told their account is free with no way to cancel,
        // which is both wrong and an App Store review risk.
        if (hasAddon) {
            const sub = await API.payments.getSubscriptionStatus();
            const holdsAddon = ['active', 'trialing', 'past_due', 'comp'].includes(sub && sub.status);
            if (holdsAddon) {
                renderSubscriptionUI(content, sub, profileFolder);
                return;
            }
            renderFreePlayerUI(content, sub);
            return;
        }

        if (!isPaid) {
            const showRestore = API.isIOSApp();
            content.innerHTML = `
                <div class="sub-free-message">
                    <p>Your account type is <strong>free</strong> — no subscription needed.</p>
                    <p style="color:rgba(255,255,255,0.4);font-size:0.85rem;margin-top:8px;">All social features, messaging, and discovery are included at no cost.</p>
                </div>
                ${showRestore ? `
                <div class="sub-actions" style="margin-top:20px;">
                    <button class="btn-secondary" id="subRestorePurchasesBtn">Restore Purchases</button>
                    <p class="sub-cancel-note" style="margin-top:8px;font-size:0.8rem;">Previously paid through Apple? Tap to restore your subscription.</p>
                </div>
                ` : ''}
            `;
            if (showRestore) {
                const restoreBtn = document.getElementById('subRestorePurchasesBtn');
                if (restoreBtn) restoreBtn.addEventListener('click', () => handleRestorePurchases(restoreBtn));
            }
            return;
        }

        const sub = await API.payments.getSubscriptionStatus();
        renderSubscriptionUI(content, sub, profileFolder);
    } catch (error) {
        console.error('Failed to load subscription info:', error);
        content.innerHTML = '<p style="color:#8892b0;">Unable to load subscription information.</p>';
    }
}

// Free player (hsplayer / transferplayer) with no AI Rep add-on. The account
// itself costs nothing; the only thing purchasable is AI Rep. Selling it is
// delegated to AiRepPaywall (shared/api.js) so the price line, trial terms,
// Apple/Stripe branching, and the required disclosures live in exactly one place
// and can't drift between here and the in-page lock.
function renderFreePlayerUI(container, sub) {
    const showRestore = API.isIOSApp();
    // A previously-cancelled add-on is worth naming, so the player understands why
    // AI Rep stopped working rather than assuming it broke.
    const wasCancelled = sub && sub.status === 'cancelled';
    container.innerHTML = `
        <div class="sub-free-message">
            <p>Your account is <strong>free</strong> — no subscription needed.</p>
            <p style="color:rgba(255,255,255,0.4);font-size:0.85rem;margin-top:8px;">All social features, messaging, discovery, and your profile are included at no cost.</p>
        </div>
        <div class="sub-details" style="margin-top:20px;">
            <div class="sub-row">
                <span class="sub-label">AI Rep</span>
                <span class="sub-value"><span class="sub-badge sub-badge-none">${wasCancelled ? 'Cancelled' : 'Not Subscribed'}</span></span>
            </div>
        </div>
        <p style="color:rgba(255,255,255,0.5);font-size:0.85rem;line-height:1.6;margin:12px 0 0;">
            Unlock Best-Fit Schools, Search Appearances, and Profile Optimization to see
            which programs are searching for players like you.
        </p>
        <div class="sub-actions" style="margin-top:16px;">
            <button class="btn-primary" id="subAiRepBtn">${wasCancelled ? 'Resubscribe to AI Rep' : 'Unlock AI Rep'}</button>
        </div>
        ${showRestore ? `
        <div class="sub-actions" style="margin-top:20px;">
            <button class="btn-secondary" id="subRestorePurchasesBtn">Restore Purchases</button>
            <p class="sub-cancel-note" style="margin-top:8px;font-size:0.8rem;">Previously paid through Apple? Tap to restore your subscription.</p>
        </div>
        ` : ''}
    `;
    const aiRepBtn = document.getElementById('subAiRepBtn');
    if (aiRepBtn) {
        aiRepBtn.addEventListener('click', () => {
            if (window.AiRepPaywall) window.AiRepPaywall.open();
        });
    }
    if (showRestore) {
        const restoreBtn = document.getElementById('subRestorePurchasesBtn');
        if (restoreBtn) restoreBtn.addEventListener('click', () => handleRestorePurchases(restoreBtn));
    }
}

function renderSubscriptionUI(container, sub, profileFolder) {
    // Comp-access coaches (admin-approved FREE) don't have a Stripe subscription,
    // so the Cancel/Change Plan UI doesn't apply. Render a friendly read-only state.
    if (sub.status === 'comp') {
        container.innerHTML = `
            <div class="sub-details">
                <div class="sub-row"><span class="sub-label">Plan</span><span class="sub-value">Complimentary Access</span></div>
                <div class="sub-row"><span class="sub-label">Status</span><span class="sub-value"><span class="sub-badge sub-badge-active" style="background:#ff6b35;">Comped</span></span></div>
            </div>
            <p style="color:#8892b0;font-size:0.9rem;line-height:1.6;margin-top:16px;">You have complimentary access to Direct Recruit, granted by our admin team. No payment required. Questions? Reach out to support.</p>
        `;
        return;
    }

    const plan = PLAN_DISPLAY[sub.tier] || null;
    const isActive = sub.status === 'active';
    const isTrialing = sub.status === 'trialing';   // 7-day free trial (players)
    const isPastDue = sub.status === 'past_due';
    const isCancelled = sub.status === 'cancelled';
    const isNone = !sub.status || sub.status === 'none';
    const isCoach = profileFolder === 'collegecoach';

    // Apple Guideline 3.1.1: don't show $ prices inside the iOS app.
    // The user already paid via Apple — they can see the exact amount in
    // their App Store subscriptions page in their local currency.
    const isIOS = API.isIOSApp();

    let statusBadge = '';
    if ((isActive || isTrialing) && sub.cancelAtPeriodEnd) statusBadge = '<span class="sub-badge sub-badge-warning">Cancelling</span>';
    else if (isTrialing) statusBadge = '<span class="sub-badge sub-badge-active">Free Trial</span>';
    else if (isActive) statusBadge = '<span class="sub-badge sub-badge-active">Active</span>';
    else if (isPastDue) statusBadge = '<span class="sub-badge sub-badge-warning">Past Due</span>';
    else if (isCancelled) statusBadge = '<span class="sub-badge sub-badge-cancelled">Cancelled</span>';
    else statusBadge = '<span class="sub-badge sub-badge-none">No Subscription</span>';

    let html = '<div class="sub-details">';

    // Plan name — hide ($price) suffix on iOS
    const planLabel = plan ? (isIOS ? plan.name : plan.name + ' (' + plan.price + ')') : 'None';
    html += `<div class="sub-row"><span class="sub-label">Plan</span><span class="sub-value">${planLabel}</span></div>`;

    // Status
    html += `<div class="sub-row"><span class="sub-label">Status</span><span class="sub-value">${statusBadge}</span></div>`;

    // Billing date. For a trial, currentPeriodEnd is the day-7 first-charge date.
    if ((isActive || isTrialing) && sub.currentPeriodEnd) {
        const endDate = new Date(sub.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        if (sub.cancelAtPeriodEnd) {
            html += `<div class="sub-row"><span class="sub-label">Access Until</span><span class="sub-value" style="color:#f59e0b;">${endDate}</span></div>`;
        } else if (isTrialing) {
            html += `<div class="sub-row"><span class="sub-label">Trial Ends / First Billing</span><span class="sub-value">${endDate}</span></div>`;
        } else {
            html += `<div class="sub-row"><span class="sub-label">Next Billing</span><span class="sub-value">${endDate}</span></div>`;
        }
    }

    html += '</div>';

    // Phase 3c: iOS devices must use Apple's subscription management (Apple
    // Guideline 3.1.3). Stripe cancel/change buttons are replaced by a deep
    // link to Apple's subscription center. (`isIOS` is computed above.)

    // Source-aware management: a subscription can only be managed on the rail
    // it was created on — Stripe subs on the web, Apple subs on the iOS device.
    // Viewing from the other side gets an informational note instead of
    // buttons that would fail (server rejects cross-rail cancel/change anyway).
    const managedElsewhere = (isActive || isTrialing) && (
        (isIOS && sub.source === 'stripe') ||
        (!isIOS && sub.source === 'apple_iap')
    );

    // Buttons. A trialing user is treated like an active one so they can cancel
    // before the day-7 charge (Stripe cancel_at_period_end ends it at trial end).
    html += '<div class="sub-actions">';
    if (managedElsewhere) {
        html += sub.source === 'apple_iap'
            ? '<p class="sub-cancel-note">Subscribed via the iOS app. Manage or cancel your subscription on your iOS device (Settings &gt; Apple ID &gt; Subscriptions, or the Direct Recruit app).</p>'
            : '<p class="sub-cancel-note">Subscribed on the web. Manage your subscription from a desktop browser at directrecruit.net.</p>';
    } else if ((isActive || isTrialing) && !sub.cancelAtPeriodEnd) {
        if (isIOS) {
            html += '<button class="btn-primary" id="subManageAppleBtn">Manage in Apple Subscriptions</button>';
            html += '<p class="sub-cancel-note" style="margin-top:12px;">Plan changes and cancellation are managed through Apple.</p>';
        } else {
            if (isCoach) {
                html += '<button class="btn-secondary" id="subChangePlanBtn">Change Plan</button>';
            }
            html += `<button class="btn-danger-outline" id="subCancelBtn">${isTrialing ? 'Cancel Trial' : 'Cancel Subscription'}</button>`;
        }
    } else if ((isActive || isTrialing) && sub.cancelAtPeriodEnd) {
        if (isIOS) {
            html += '<p class="sub-cancel-note">Your subscription will end at the end of the current billing period. You can resubscribe anytime through Apple.</p>';
            html += '<button class="btn-primary" id="subManageAppleBtn">Manage in Apple Subscriptions</button>';
        } else {
            html += '<p class="sub-cancel-note">Your subscription will end at the end of the current billing period. Reactivate to stay on the monthly billing schedule — no new charge, your next billing date stays the same.</p>';
            html += '<button class="btn-primary" id="subReactivateBtn">Reactivate Subscription</button>';
        }
    } else {
        html += `<button class="btn-primary" id="subSubscribeBtn">${isCancelled ? 'Resubscribe' : 'Subscribe'}</button>`;
    }
    html += '</div>';

    // Apple Guideline 3.1.1 requires Restore Purchases to be reachable on iOS
    // regardless of current subscription state — covers reinstalls, device
    // changes, and edge cases where Apple's record diverges from ours.
    if (isIOS) {
        html += '<div class="sub-actions" style="margin-top:12px;">';
        html += '<button class="btn-secondary" id="subRestorePurchasesBtn">Restore Purchases</button>';
        html += '<p class="sub-cancel-note" style="margin-top:8px;font-size:0.8rem;">Already paid through Apple? Tap to restore your subscription.</p>';
        html += '</div>';
    }

    container.innerHTML = html;

    // Attach event listeners
    const cancelBtn = document.getElementById('subCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => showCancelSubscriptionModal(sub));

    const manageAppleBtn = document.getElementById('subManageAppleBtn');
    if (manageAppleBtn) {
        manageAppleBtn.addEventListener('click', () => {
            window.open('https://apps.apple.com/account/subscriptions', '_blank');
        });
    }

    const subscribeBtn = document.getElementById('subSubscribeBtn');
    if (subscribeBtn) subscribeBtn.addEventListener('click', () => handleSubscribe(profileFolder));

    const changePlanBtn = document.getElementById('subChangePlanBtn');
    if (changePlanBtn) changePlanBtn.addEventListener('click', () => handleChangePlan());

    const reactivateBtn = document.getElementById('subReactivateBtn');
    if (reactivateBtn) reactivateBtn.addEventListener('click', () => handleReactivate());

    const restoreBtn = document.getElementById('subRestorePurchasesBtn');
    if (restoreBtn) restoreBtn.addEventListener('click', () => handleRestorePurchases(restoreBtn));
}

async function handleRestorePurchases(btn) {
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Restoring...';
    try {
        const r = await window.IAP.restorePurchases();
        if (r.success) {
            // Server-authoritative: /iap-reconcile validates the restored product
            // against the CURRENT profile type before activating anything — an
            // old player plan must not unlock a coach account (or vice versa).
            let rec = null;
            try {
                rec = await API.payments.reconcileIap(r.customerInfo);
            } catch (_) {
                showToast('Couldn\'t verify your subscription. Check your connection and try again.', 'error');
                btn.disabled = false;
                btn.textContent = originalText;
                return;
            }
            if (rec && rec.activated) {
                showToast('Purchases restored successfully.', 'success');
                setTimeout(() => window.location.reload(), 1500);
                return;
            }
            if (rec && rec.reason === 'stripe_active') {
                // Server refused an Apple takeover of a live Stripe sub — restoring
                // would have left the web subscription billing with no way to cancel.
                showToast('You already have an active subscription billed on the web. Manage or cancel it from a desktop browser at directrecruit.net before subscribing through Apple.', 'warning', 12000);
            } else if (rec && rec.reason === 'product_mismatch') {
                showToast('Your Apple subscription is for a different profile type. Switch to that profile type to use it, or cancel it in Settings > Apple ID > Subscriptions to stop billing.', 'warning', 12000);
            } else {
                showToast('No active subscription found for your Apple ID.', 'error');
            }
            btn.disabled = false;
            btn.textContent = originalText;
            return;
        }
        showToast('Restore failed: ' + (r.error || 'unknown'), 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    } catch (e) {
        console.error('Restore error:', e);
        showToast('Restore failed: ' + e.message, 'error');
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function showCancelSubscriptionModal(sub) {
    const endDate = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'the end of your billing period';

    const overlay = document.createElement('div');
    overlay.id = 'cancelSubModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
        <div style="background:#112240;border-radius:12px;max-width:460px;width:100%;padding:32px;border:1px solid rgba(100,116,152,0.2);">
            <h3 style="color:#ccd6f6;margin:0 0 12px;font-size:1.1rem;">Cancel Subscription?</h3>
            <p style="color:#8892b0;font-size:0.9rem;line-height:1.6;margin:0 0 8px;">You'll keep full access until <strong style="color:#ccd6f6;">${endDate}</strong>.</p>
            <p style="color:#8892b0;font-size:0.9rem;line-height:1.6;margin:0 0 24px;">After that, your profile and data remain saved — you can resubscribe anytime.</p>
            <div style="display:flex;gap:12px;justify-content:flex-end;">
                <button id="cancelSubKeep" style="background:transparent;border:1px solid rgba(100,116,152,0.3);color:#8892b0;padding:10px 20px;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-size:0.9rem;">Keep Subscription</button>
                <button id="cancelSubConfirm" style="background:#ef4444;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-family:'Inter',sans-serif;font-size:0.9rem;font-weight:600;">Cancel Subscription</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('cancelSubKeep').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    document.getElementById('cancelSubConfirm').addEventListener('click', async () => {
        const btn = document.getElementById('cancelSubConfirm');
        btn.textContent = 'Cancelling...';
        btn.disabled = true;
        try {
            await API.payments.cancelSubscription();
            overlay.remove();
            initializeSubscriptionSection();
        } catch (error) {
            console.error('Cancel failed:', error);
            btn.textContent = 'Failed — try again';
            btn.disabled = false;
        }
    });
}

async function handleSubscribe(profileFolder) {
    const btn = document.getElementById('subSubscribeBtn');
    if (btn) { btn.textContent = 'Redirecting...'; btn.disabled = true; }

    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');

    try {
        if (profileFolder === 'collegecoach') {
            // Coaches: the tier modal (shared between Stripe + iOS) handles branching
            showSwitchTierModal();
        } else if (ADDON_PROFILE_TYPES.includes(profileFolder) && window.AiRepPaywall) {
            // Players buy the AI Rep add-on, not platform access. Route through the
            // shared paywall modal so the price line, trial terms, Apple/Stripe
            // branching, Restore Purchases, and the required disclosures come from
            // ONE place and can't drift from the in-page AI Rep lock.
            window.AiRepPaywall.open();
            if (btn) { btn.textContent = 'Subscribe'; btn.disabled = false; }
        } else {
            const profileType = profileFolder === 'hsplayer' ? 'hsplayer' : 'transferplayer';

            // Phase 3c: iOS branch — use IAP instead of Stripe
            if (API.isIOSApp()) {
                const r = await window.IAP.purchaseTier(profileType, null);
                if (r.success) {
                    const me = await API.auth.getCurrentUser().catch(() => null);
                    if (me && me.user && me.user.id) {
                        localStorage.setItem('iap_pending_activation', JSON.stringify({
                            at: Date.now(), userId: me.user.id
                        }));
                    }
                    window.location.reload();
                    return;
                }
                if (r.cancelled) {
                    if (btn) { btn.textContent = 'Subscribe'; btn.disabled = false; }
                    return;
                }
                showToast('Purchase failed: ' + (r.error || 'unknown'), 'error');
                if (btn) { btn.textContent = 'Subscribe'; btn.disabled = false; }
                return;
            }

            // Web — existing Stripe flow
            const { url } = await API.payments.createCheckoutSession(
                profileType, null, 'resubscribe',
                FE_BASE + '/shared/payment-success-switch.html',
                window.location.href
            );
            localStorage.setItem('switchRedirectUrl', window.location.href);
            window.location.href = url;
        }
    } catch (error) {
        console.error('Subscribe failed:', error);
        if (btn) { btn.textContent = 'Subscribe'; btn.disabled = false; }
        showToast('Failed to start checkout: ' + error.message, 'error');
    }
}

async function handleChangePlan() {
    localStorage.setItem('switchRedirectUrl', window.location.href);
    showSwitchTierModal();
}

async function handleReactivate() {
    const btn = document.getElementById('subReactivateBtn');
    if (!btn) return;
    const originalText = btn.textContent;
    btn.textContent = 'Reactivating…';
    btn.disabled = true;
    try {
        const result = await API.payments.reactivateSubscription();
        const nextBilling = result.currentPeriodEnd
            ? new Date(result.currentPeriodEnd * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            : null;
        showToast(
            nextBilling
                ? `Subscription reactivated. Next billing: ${nextBilling}.`
                : 'Subscription reactivated.',
            'success'
        );
        await initializeSubscriptionSection();
    } catch (error) {
        showToast('Reactivation failed: ' + (error.message || 'Try again later.'), 'error');
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Tier Selection Modal for Profile Switch to College Coach ────────────────
function showSwitchTierModal() {
    // In-app the bundle root is the frontend/ contents, so there is no '/frontend'
    // path segment; on web there is. Mirror shared/api.js's prefix convention so
    // these URLs resolve in BOTH the WKWebView and the browser.
    const FE_BASE = window.location.origin + (window.location.pathname.startsWith('/frontend/') ? '/frontend' : '');
    const overlay = document.createElement('div');
    overlay.id = 'switchTierModal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';

    overlay.innerHTML = `
        <div style="background:#0a1128;border-radius:16px;max-width:900px;width:100%;padding:40px 32px;position:relative;max-height:90vh;overflow-y:auto;">
            <button id="switchTierClose" style="position:absolute;top:16px;right:16px;background:none;border:none;color:rgba(255,255,255,0.5);font-size:24px;cursor:pointer;">&times;</button>
            <h2 style="color:#fff;text-align:center;font-size:24px;font-weight:700;margin:0 0 8px;">Choose Your Plan</h2>
            <p style="color:rgba(255,255,255,0.45);text-align:center;font-size:14px;margin:0 0 32px;">Select a subscription tier for your coaching account.</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;">
                ${switchTierCard('Starter', '20', ['AI Recruiting Assistant','Portal Intelligence','Recruiting Board','4M AI tokens/month','Direct messaging'], false)}
                ${switchTierCard('Pro', '50', ['Everything in Starter','10M AI tokens/month (2.5x)','Saved players & portal watchlist','Custom baseline metrics','Priority support'], true)}
                ${switchTierCard('Elite', '100', ['Everything in Pro','20M AI tokens/month (5x)','Team collaboration tools','Unlimited saved players','Dedicated support'], false)}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    document.getElementById('switchTierClose').addEventListener('click', () => {
        overlay.remove();
        // Redirect to new mainpage without payment — profile was already switched
        const redirectUrl = localStorage.getItem('switchRedirectUrl');
        if (redirectUrl) {
            localStorage.removeItem('switchRedirectUrl');
            window.location.href = redirectUrl;
        }
    });

    overlay.querySelectorAll('[data-switch-tier]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const tier = btn.dataset.switchTier;
            btn.textContent = 'Redirecting...';
            btn.disabled = true;

            // Phase 3c: iOS branch — use IAP instead of Stripe
            if (API.isIOSApp()) {
                try {
                    const r = await window.IAP.purchaseTier('collegecoach', tier);
                    if (r.success) {
                        const me = await API.auth.getCurrentUser().catch(() => null);
                        if (me && me.user && me.user.id) {
                            localStorage.setItem('iap_pending_activation', JSON.stringify({
                                at: Date.now(), userId: me.user.id
                            }));
                        }
                        // Navigate directly to the stored redirect URL (bypass payment-success-switch.html)
                        const redirectUrl = localStorage.getItem('switchRedirectUrl');
                        localStorage.removeItem('switchRedirectUrl');
                        window.location.href = redirectUrl || (FE_BASE + '/collegecoach/mainpage-coach.html');
                        return;
                    }
                    if (r.cancelled) {
                        btn.textContent = 'Select';
                        btn.disabled = false;
                        return;
                    }
                    showToast('Purchase failed: ' + (r.error || 'unknown'), 'error');
                    btn.textContent = 'Select';
                    btn.disabled = false;
                    return;
                } catch (iosErr) {
                    console.error('IAP error:', iosErr);
                    showToast('Purchase failed: ' + iosErr.message, 'error');
                    btn.textContent = 'Select';
                    btn.disabled = false;
                    return;
                }
            }

            // Web — existing Stripe flow
            try {
                const { url } = await API.payments.createCheckoutSession(
                    'collegecoach',
                    tier,
                    'switch',
                    FE_BASE + '/shared/payment-success-switch.html',
                    window.location.href
                );
                window.location.href = url;
            } catch (error) {
                console.error('Checkout error:', error);
                showToast('Failed to start checkout: ' + error.message, 'error');
                btn.textContent = 'Select';
                btn.disabled = false;
            }
        });
    });
}

function switchTierCard(name, price, features, isPopular) {
    const borderColor = isPopular ? '#ff6b35' : 'rgba(255,255,255,0.08)';
    const bgColor = isPopular ? 'rgba(255,107,53,0.04)' : 'rgba(255,255,255,0.03)';
    const badge = isPopular ? '<div style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#ff6b35;color:#fff;font-size:11px;font-weight:700;padding:4px 16px;border-radius:20px;text-transform:uppercase;letter-spacing:0.5px;white-space:nowrap;">Most Popular</div>' : '';

    const featureList = features.map(f =>
        `<li style="display:flex;align-items:center;gap:8px;color:rgba(255,255,255,0.7);font-size:13px;padding:6px 0;">
            <svg viewBox="0 0 20 20" fill="#ff6b35" width="16" height="16" style="flex-shrink:0;"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>
            ${f}
        </li>`
    ).join('');

    return `
        <div style="background:${bgColor};border:1px solid ${borderColor};border-radius:16px;padding:28px 20px;text-align:center;position:relative;display:flex;flex-direction:column;">
            ${badge}
            <h3 style="color:#fff;font-size:20px;font-weight:700;margin:0 0 12px;">${name}</h3>
            <div style="margin-bottom:12px;">
                <span style="font-size:32px;font-weight:800;color:#fff;">$${price}</span>
                <span style="font-size:14px;color:rgba(255,255,255,0.4);">/month</span>
            </div>
            <ul style="list-style:none;padding:0;margin:0 0 20px;text-align:left;flex:1;">${featureList}</ul>
            <button data-switch-tier="${name.toLowerCase()}" style="background:#ff6b35;color:#fff;border:none;border-radius:8px;padding:12px;font-size:14px;font-weight:600;cursor:pointer;width:100%;font-family:'Inter',sans-serif;">Select</button>
        </div>
    `;
}
