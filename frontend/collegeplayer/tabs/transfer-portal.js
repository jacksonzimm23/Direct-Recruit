// Transfer Portal JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize checklist functionality
    initChecklist();

    // Initialize enter portal button
    initEnterPortalButton();
});

// Checklist state (persisted in localStorage)
const CHECKLIST_STORAGE_KEY = 'transferPortalChecklist';

function getChecklistState() {
    const stored = localStorage.getItem(CHECKLIST_STORAGE_KEY);
    if (stored) {
        return JSON.parse(stored);
    }
    return {
        compliance: false,
        staff: false,
        window: false,
        module: false
    };
}

function saveChecklistState(state) {
    localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(state));
}

function initChecklist() {
    const checklistItems = document.querySelectorAll('.checklist-item');
    const state = getChecklistState();

    // Apply saved state
    checklistItems.forEach(item => {
        const itemKey = item.dataset.item;
        if (state[itemKey]) {
            item.classList.add('completed');
        }
    });

    // Update progress
    updateProgress();

    // Add click handlers
    checklistItems.forEach(item => {
        item.addEventListener('click', function() {
            const itemKey = this.dataset.item;
            const state = getChecklistState();

            // Toggle completion
            state[itemKey] = !state[itemKey];
            saveChecklistState(state);

            // Update UI
            if (state[itemKey]) {
                this.classList.add('completed');
            } else {
                this.classList.remove('completed');
            }

            updateProgress();
        });
    });
}

function updateProgress() {
    const state = getChecklistState();
    const completedCount = Object.values(state).filter(v => v).length;
    const totalCount = Object.keys(state).length;
    const percentage = (completedCount / totalCount) * 100;

    // Update count text
    const countElement = document.getElementById('completedCount');
    if (countElement) {
        countElement.textContent = completedCount;
    }

    // Update progress bar
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
        progressFill.style.width = `${percentage}%`;
    }

    // Enable/disable the enter portal button
    const enterPortalBtn = document.getElementById('enterPortalBtn');
    if (enterPortalBtn) {
        enterPortalBtn.disabled = completedCount < totalCount;
    }
}

function initEnterPortalButton() {
    const enterPortalBtn = document.getElementById('enterPortalBtn');

    if (enterPortalBtn) {
        enterPortalBtn.addEventListener('click', function() {
            showConfirmationModal();
        });
    }
}

function showConfirmationModal() {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'portal-modal-overlay';
    modalOverlay.innerHTML = `
        <div class="portal-modal">
            <button class="modal-close-btn" id="modalCloseBtn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <div class="modal-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M8 12h8"></path>
                    <path d="M12 8v8"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            </div>

            <h2 class="modal-title">Are You Sure?</h2>
            <p class="modal-message">
                You will be redirected to Settings to switch your profile type to Transfer Player.
            </p>

            <div class="modal-warning">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <p><strong>This will change your profile type.</strong> You can switch your profile type in Settings.</p>
            </div>

            <div class="modal-actions">
                <button class="btn-modal-cancel" id="modalCancelBtn">Cancel</button>
                <button class="btn-modal-confirm" id="modalConfirmBtn">Yes, Enter Database</button>
            </div>
        </div>
    `;

    document.body.appendChild(modalOverlay);

    // Close button handler
    const closeBtn = document.getElementById('modalCloseBtn');
    closeBtn.addEventListener('click', () => {
        modalOverlay.remove();
    });

    // Cancel button handler
    const cancelBtn = document.getElementById('modalCancelBtn');
    cancelBtn.addEventListener('click', () => {
        modalOverlay.remove();
    });

    // Confirm button handler — redirect to Settings Profile Type section
    const confirmBtn = document.getElementById('modalConfirmBtn');
    confirmBtn.addEventListener('click', () => {
        modalOverlay.remove();
        // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
        // (bare/relative targets silently no-op there). new URL(rel, location.href)
        // correctly preserves the /frontend prefix on web and its absence in-app.
        window.location.href = new URL('settings.html#profile-type', window.location.href).href;
    });

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.remove();
        }
    });

    // Close on Escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            modalOverlay.remove();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}
