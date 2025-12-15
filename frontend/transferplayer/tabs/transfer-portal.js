// Transfer Portal JavaScript - Transfer Player Welcome Page

document.addEventListener('DOMContentLoaded', function() {
    // Check if coming from portal entry (show welcome animation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('welcome') === 'true' || document.referrer.includes('collegeplayer')) {
        showWelcomeAnimation();
    }

    // Leave Portal Popup functionality
    initLeavePortalPopup();

    // Initialize leave portal form
    initLeavePortalForm();

    // Populate state dropdown
    populateStateDropdown();
});

function initLeavePortalPopup() {
    const leaveBtn = document.getElementById('leavePortalBtn');
    const overlay = document.getElementById('leavePortalOverlay');
    const closeBtn = document.getElementById('leavePortalClose');

    if (leaveBtn && overlay) {
        // Open popup when button is clicked
        leaveBtn.addEventListener('click', function() {
            overlay.classList.add('active');
        });

        // Close popup when close button is clicked
        if (closeBtn) {
            closeBtn.addEventListener('click', function() {
                overlay.classList.remove('active');
            });
        }

        // Close popup when clicking outside
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });

        // Close popup on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && overlay.classList.contains('active')) {
                overlay.classList.remove('active');
            }
        });
    }
}

function showWelcomeAnimation() {
    // Add entrance animation class
    const welcomeSection = document.querySelector('.portal-welcome-section');
    if (welcomeSection) {
        welcomeSection.style.animation = 'welcomeFadeIn 1s ease forwards';
    }

    // Add styles for welcome animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes welcomeFadeIn {
            0% {
                opacity: 0;
                transform: translateY(20px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .portal-info-card {
            opacity: 0;
            animation: cardSlideIn 0.6s ease forwards;
        }

        .portal-info-card:nth-child(1) { animation-delay: 0.3s; }
        .portal-info-card:nth-child(2) { animation-delay: 0.5s; }
        .portal-info-card:nth-child(3) { animation-delay: 0.7s; }

        @keyframes cardSlideIn {
            0% {
                opacity: 0;
                transform: translateY(30px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .portal-action-btn {
            opacity: 0;
            animation: actionFadeIn 0.5s ease forwards;
            animation-delay: 1s;
        }

        @keyframes actionFadeIn {
            0% {
                opacity: 0;
            }
            100% {
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// Store form data for confirmation
let pendingFormData = null;

function initLeavePortalForm() {
    const form = document.getElementById('leavePortalForm');
    const confirmOverlay = document.getElementById('confirmOverlay');
    const confirmCancel = document.getElementById('confirmCancel');
    const confirmYes = document.getElementById('confirmYes');

    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            // Store form data
            pendingFormData = {
                high_school: document.getElementById('newSchool').value,
                state: document.getElementById('newState').value,
                college_division: document.getElementById('newDivision').value
            };

            // Show confirmation popup
            if (confirmOverlay) {
                confirmOverlay.classList.add('active');
            }
        });
    }

    // Cancel button
    if (confirmCancel) {
        confirmCancel.addEventListener('click', function() {
            confirmOverlay.classList.remove('active');
            pendingFormData = null;
        });
    }

    // Confirm button
    if (confirmYes) {
        confirmYes.addEventListener('click', async function() {
            if (pendingFormData) {
                await submitLeavePortal(pendingFormData);
            }
        });
    }

    // Close confirmation on overlay click
    if (confirmOverlay) {
        confirmOverlay.addEventListener('click', function(e) {
            if (e.target === confirmOverlay) {
                confirmOverlay.classList.remove('active');
                pendingFormData = null;
            }
        });
    }
}

async function submitLeavePortal(data) {
    const confirmYes = document.getElementById('confirmYes');
    const originalText = confirmYes.textContent;

    try {
        confirmYes.textContent = 'Saving...';
        confirmYes.disabled = true;

        // Update profile with new school info and remove from portal
        // transfer column uses 'y' for in portal, null/empty to leave
        const response = await API.put('/profile', {
            high_school: data.high_school,
            state: data.state,
            college_division: data.college_division,
            transfer: null
        });

        // Close popups
        document.getElementById('confirmOverlay').classList.remove('active');
        document.getElementById('leavePortalOverlay').classList.remove('active');

        // Redirect to collegeplayer mainpage (since they now have a college_division)
        window.location.href = '../../collegeplayer/mainpage-player.html';

    } catch (error) {
        console.error('Error leaving portal:', error);
        alert('Failed to update profile. Please try again.');
        confirmYes.textContent = originalText;
        confirmYes.disabled = false;
    }
}

function populateStateDropdown() {
    const stateSelect = document.getElementById('newState');
    if (!stateSelect) return;

    const states = [
        'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
        'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
        'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
        'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
        'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
        'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
        'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
        'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
        'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
        'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'
    ];

    states.forEach(state => {
        const option = document.createElement('option');
        option.value = state;
        option.textContent = state;
        stateSelect.appendChild(option);
    });
}
