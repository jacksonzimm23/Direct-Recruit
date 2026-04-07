// Shared Settings Page JavaScript
// Uses API_BASE_URL from shared/api.js

document.addEventListener('DOMContentLoaded', function() {
    // Initialize settings functionality
    initializeSettingsNavigation();
    initializeFormHandlers();
    initializeToggleSwitches();
    initializeSaveButtons();
    initializeDeleteAccount();
    initializePasswordChange();
    initializeEmailChange();

    // Set initial button states
    resetModifiedState();

    // Load user data
    loadUserSettings();

    // Initialize profile type switching
    initializeProfileTypeSwitching();
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

            // Scroll to top of settings content on mobile
            if (window.innerWidth <= 768) {
                document.querySelector('.settings-content').scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    });
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

    // Email preference settings that should NOT trigger Save Changes (coming soon)
    const emailPreferenceSettings = ['emailMarketing', 'emailWeeklySummary', 'emailRecruitingNews'];

    toggles.forEach(toggle => {
        // Store original value
        toggle.dataset.originalChecked = toggle.checked;

        // Skip disabled toggles and email preference toggles (coming soon)
        const settingName = toggle.dataset.setting;
        if (toggle.disabled || emailPreferenceSettings.includes(settingName)) {
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

        // Push notifications
        pushEnabled: document.querySelector('[data-setting="pushEnabled"]')?.checked || false,
        pushSound: document.querySelector('[data-setting="pushSound"]')?.checked || false,

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
function discardChanges() {
    if (!formModified) return;

    if (confirm('Are you sure you want to discard all changes?')) {
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
        const response = await fetch(`${API_BASE_URL}/settings/account/delete`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
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
        const response = await fetch(`${API_BASE_URL}/settings/password/change`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to change password');
        }

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

const DIVISION_OPTIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA'];

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
    'Alabama','Alaska','Arizona','Arkansas','California','Colorado','Connecticut',
    'Delaware','Florida','Georgia','Hawaii','Idaho','Illinois','Indiana','Iowa',
    'Kansas','Kentucky','Louisiana','Maine','Maryland','Massachusetts','Michigan',
    'Minnesota','Mississippi','Missouri','Montana','Nebraska','Nevada',
    'New Hampshire','New Jersey','New Mexico','New York','North Carolina',
    'North Dakota','Ohio','Oklahoma','Oregon','Pennsylvania','Rhode Island',
    'South Carolina','South Dakota','Tennessee','Texas','Utah','Vermont',
    'Virginia','Washington','West Virginia','Wisconsin','Wyoming'
];

const TYPE_ICONS = {
    hsplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    collegeplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>',
    transferplayer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>',
    hscoach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
    collegecoach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    other: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>'
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

        const badgeEl = document.getElementById('currentProfilePaidBadge');
        if (badgeEl) {
            if (data.is_current_paid) {
                badgeEl.textContent = 'PAID';
                badgeEl.classList.add('badge-paid');
                badgeEl.style.display = '';
            } else {
                badgeEl.textContent = 'FREE';
                badgeEl.classList.add('badge-free');
                badgeEl.style.display = '';
            }
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
    const body = document.querySelector('.switch-modal-body');
    body.innerHTML = renderStep2();
    updateStepIndicator(2);
    attachStep2Listeners();
}

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
            <label>Username <span class="required">*</span></label>
            <input type="text" id="switchUsername" placeholder="Choose a username" class="form-input" maxlength="15">
            <small class="form-hint">1-15 characters, lowercase letters, numbers, underscores only</small>
        </div>
    `;

    if (targetRole === 'player') {
        const needsCollege = ['collegeplayer', 'transferplayer'].includes(selectedTargetType);
        fieldsHTML += `
            <div class="switch-form-group">
                <label>${needsCollege ? 'College/University' : 'High School'} Name <span class="required">*</span></label>
                <input type="text" id="switchTeamName" placeholder="Enter school name" class="form-input">
            </div>
            <div class="switch-form-row">
                <div class="switch-form-group">
                    <label>State <span class="required">*</span></label>
                    <select id="switchState" class="form-input">
                        <option value="">Select State</option>
                        ${US_STATES.map(s => `<option value="${s}">${s}</option>`).join('')}
                    </select>
                </div>
                <div class="switch-form-group">
                    <label>Graduation Year <span class="required">*</span></label>
                    <input type="number" id="switchGradYear" placeholder="e.g. 2026" class="form-input" min="2020" max="2035">
                </div>
            </div>
            <div class="switch-form-group">
                <label>Position <span class="required">*</span></label>
                <select id="switchPosition" class="form-input">
                    <option value="">Select Position</option>
                    ${POSITION_OPTIONS.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>
            </div>
            <div class="switch-form-row">
                <div class="switch-form-group">
                    <label>Height (inches) <span class="required">*</span></label>
                    <input type="number" id="switchHeight" placeholder="e.g. 72" class="form-input" min="48" max="96">
                </div>
                <div class="switch-form-group">
                    <label>Weight (lbs) <span class="required">*</span></label>
                    <input type="number" id="switchWeight" placeholder="e.g. 200" class="form-input" min="80" max="500">
                </div>
            </div>
            <div class="switch-form-group">
                <label>GPA</label>
                <input type="number" id="switchGPA" placeholder="e.g. 3.5" class="form-input" min="0" max="4" step="0.01">
            </div>
        `;

        if (needsCollege) {
            fieldsHTML += `
                <div class="switch-form-row">
                    <div class="switch-form-group">
                        <label>Division <span class="required">*</span></label>
                        <select id="switchDivision" class="form-input">
                            <option value="">Select Division</option>
                            ${DIVISION_OPTIONS.map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="switch-form-group">
                        <label>Conference</label>
                        <input type="text" id="switchConference" placeholder="e.g. SEC" class="form-input">
                    </div>
                </div>
            `;
        }

        if (selectedTargetType === 'transferplayer') {
            fieldsHTML += `
                <div class="switch-form-group">
                    <label>Eligibility (years remaining)</label>
                    <select id="switchEligibility" class="form-input">
                        <option value="">Select</option>
                        <option value="1">1</option>
                        <option value="2">2</option>
                        <option value="3">3</option>
                        <option value="4">4</option>
                        <option value="5">5</option>
                    </select>
                </div>
            `;
        }
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
                    ${US_STATES.map(s => `<option value="${s}">${s}</option>`).join('')}
                </select>
            </div>
            <div class="switch-form-group">
                <label>Coaching Position <span class="required">*</span></label>
                <select id="switchPositionTitle" class="form-input">
                    <option value="">Select Position</option>
                    ${COACH_POSITIONS.map(p => `<option value="${p}">${p}</option>`).join('')}
                </select>
            </div>
        `;

        if (isCollege) {
            fieldsHTML += `
                <div class="switch-form-row">
                    <div class="switch-form-group">
                        <label>Division <span class="required">*</span></label>
                        <select id="switchDivision" class="form-input">
                            <option value="">Select Division</option>
                            ${DIVISION_OPTIONS.map(d => `<option value="${d}">${d}</option>`).join('')}
                        </select>
                    </div>
                    <div class="switch-form-group">
                        <label>Conference</label>
                        <input type="text" id="switchConference" placeholder="e.g. Big 12" class="form-input">
                    </div>
                </div>
            `;
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

function attachStep2Listeners() {
    document.getElementById('switchBackBtn2').addEventListener('click', () => {
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

    const targetRole = getBaseRoleFromType(selectedTargetType);

    if (targetRole === 'player') {
        if (!document.getElementById('switchTeamName')?.value?.trim()) return 'School name is required';
        if (!document.getElementById('switchState')?.value) return 'State is required';
        if (!document.getElementById('switchGradYear')?.value) return 'Graduation year is required';
        if (!document.getElementById('switchPosition')?.value) return 'Position is required';
        if (!document.getElementById('switchHeight')?.value) return 'Height is required';
        if (!document.getElementById('switchWeight')?.value) return 'Weight is required';
        if (['collegeplayer', 'transferplayer'].includes(selectedTargetType)) {
            if (!document.getElementById('switchDivision')?.value) return 'Division is required';
        }
    } else if (targetRole === 'coach') {
        if (!document.getElementById('switchTeamName')?.value?.trim()) return 'School name is required';
        if (!document.getElementById('switchState')?.value) return 'State is required';
        if (!document.getElementById('switchPositionTitle')?.value) return 'Coaching position is required';
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
        username: document.getElementById('switchUsername')?.value?.trim()
    };

    const targetRole = getBaseRoleFromType(selectedTargetType);

    if (targetRole === 'player') {
        data.team_name = document.getElementById('switchTeamName')?.value?.trim();
        data.state = document.getElementById('switchState')?.value;
        data.graduation_year = parseInt(document.getElementById('switchGradYear')?.value) || null;
        data.position = document.getElementById('switchPosition')?.value;
        data.height = parseInt(document.getElementById('switchHeight')?.value) || null;
        data.weight = parseInt(document.getElementById('switchWeight')?.value) || null;
        data.gpa = parseFloat(document.getElementById('switchGPA')?.value) || null;

        if (['collegeplayer', 'transferplayer'].includes(selectedTargetType)) {
            data.college_division = document.getElementById('switchDivision')?.value;
            data.conference = document.getElementById('switchConference')?.value?.trim() || null;
        }
        if (selectedTargetType === 'transferplayer') {
            data.eligibility = parseInt(document.getElementById('switchEligibility')?.value) || null;
        }
    } else if (targetRole === 'coach') {
        data.team_name = document.getElementById('switchTeamName')?.value?.trim();
        data.state = document.getElementById('switchState')?.value;
        data.position_title = document.getElementById('switchPositionTitle')?.value;

        if (selectedTargetType === 'collegecoach') {
            data.college_division = document.getElementById('switchDivision')?.value;
            data.conference = document.getElementById('switchConference')?.value?.trim() || null;
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="warning-icon">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
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

    btn.disabled = true;
    btn.textContent = 'Switching...';
    errorEl.style.display = 'none';

    try {
        const result = await API.settings.switchProfile(selectedTargetType, profileData);

        if (result.success) {
            // Show success briefly then redirect
            btn.textContent = 'Success! Redirecting...';
            btn.classList.remove('btn-danger');
            btn.classList.add('btn-success');

            setTimeout(() => {
                const folder = result.redirect_folder;
                const mainpage = folder.includes('coach')
                    ? `mainpage-${folder}.html`
                    : (folder === 'other' ? 'mainpage-other.html' : `mainpage-${folder}.html`);
                window.location.href = `../../${folder}/${mainpage}`;
            }, 1000);
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
    const modal = document.getElementById('switchProfileModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
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

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
