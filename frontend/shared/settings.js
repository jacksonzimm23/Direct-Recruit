// Shared Settings Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize settings functionality
    initializeSettingsNavigation();
    initializeFormHandlers();
    initializeToggleSwitches();
    initializeSaveButtons();
    initializeDeleteAccount();
    initializePasswordChange();
    initializeEmailChange();
    initializeSessionRevoke();

    // Set initial button states
    resetModifiedState();

    // Load user data
    loadUserSettings();
});

// Load user settings from API or localStorage
async function loadUserSettings() {
    try {
        const token = localStorage.getItem('auth_token');

        if (!token) {
            return;
        }

        const apiUrl = `${window.API_BASE_URL || 'http://localhost:5000/api'}/auth/me`;

        const response = await fetch(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
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
    }
}

// Populate form with user data
function populateSettingsForm(data) {
    // Email is stored in user object, not profile
    // Don't overwrite the email here - it's already set from data.user.email above
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

    // IDs of email change fields that should NOT trigger Save Changes
    const emailChangeFieldIds = ['currentEmail', 'newEmail', 'confirmEmail', 'emailChangePassword'];

    inputs.forEach(input => {
        // Store original value
        input.dataset.originalValue = input.value;

        // Skip email change fields - they have their own separate handling
        if (emailChangeFieldIds.includes(input.id)) {
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
function saveSettings() {
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
    console.log('Saving settings:', formData);

    // TODO: Replace with actual API call when backend is ready
    // For now, save to localStorage as placeholder
    localStorage.setItem('userSettings', JSON.stringify(formData));

    // Simulate API call delay
    setTimeout(() => {
        // Show success message
        showNotification('Settings saved successfully!', 'success');

        // Reset button
        saveBtn.innerHTML = originalContent;
        saveBtn.disabled = false;

        // Reset modified state
        resetModifiedState();

        // Update original values
        document.querySelectorAll('.form-input, .form-select').forEach(input => {
            input.dataset.originalValue = input.value;
        });
        document.querySelectorAll('.toggle-switch input').forEach(toggle => {
            toggle.dataset.originalChecked = toggle.checked;
        });
    }, 1000);
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
            // TODO: Call API endpoint to delete account
            console.log('Account deletion requested');
            showNotification('Account deletion request submitted. You will receive a confirmation email.', 'warning');
        }
    }
}

// Password Change Handler
function initializePasswordChange() {
    const updatePasswordBtn = document.getElementById('updatePasswordBtn');

    if (updatePasswordBtn) {
        updatePasswordBtn.addEventListener('click', function(e) {
            e.preventDefault();
            handlePasswordChange(this);
        });
    }
}

function handlePasswordChange(button) {
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

    // Show loading state
    const originalText = button.textContent;
    button.textContent = 'Updating...';
    button.disabled = true;

    // TODO: Replace with actual API call
    setTimeout(() => {
        showNotification('Password updated successfully!', 'success');
        button.textContent = originalText;
        button.disabled = false;

        // Clear password fields
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmPassword').value = '';
    }, 1500);
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
        const token = localStorage.getItem('auth_token');
        const currentEmail = document.getElementById('currentEmail')?.value;

        // Don't check if it's the same as current email
        if (email === currentEmail) {
            showEmailAvailabilityMessage('This is your current email', 'unavailable');
            return;
        }

        const response = await fetch(`${window.API_BASE_URL || 'http://localhost:5000/api'}/settings/email/check-availability?email=${encodeURIComponent(email)}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
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
        console.error('Email availability check error:', error);
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
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${window.API_BASE_URL || 'http://localhost:5000/api'}/settings/email/request-change`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
        console.error('Email change request error:', error);
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
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${window.API_BASE_URL || 'http://localhost:5000/api'}/settings/email/verify-change`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
        console.error('Email verification error:', error);
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
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`${window.API_BASE_URL || 'http://localhost:5000/api'}/settings/email/resend-code`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
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
        console.error('Resend code error:', error);
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

// Session Revoke Handlers
function initializeSessionRevoke() {
    const revokeButtons = document.querySelectorAll('.btn-session-revoke');

    revokeButtons.forEach(button => {
        button.addEventListener('click', function() {
            handleSessionRevoke(this);
        });
    });
}

function handleSessionRevoke(button) {
    if (confirm('Are you sure you want to revoke this session?')) {
        const sessionItem = button.closest('.session-item');
        const sessionName = sessionItem.querySelector('.session-name').textContent;

        // Show loading state
        button.textContent = 'Revoking...';
        button.disabled = true;

        // TODO: Replace with actual API call
        setTimeout(() => {
            sessionItem.style.opacity = '0';
            setTimeout(() => {
                sessionItem.remove();
                showNotification(`Session "${sessionName}" has been revoked`, 'success');
            }, 300);
        }, 1000);
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
