// Sign In Form Handler
// Uses API_BASE_URL from shared/api.js
if (document.getElementById('signinForm')) {
    const form = document.getElementById('signinForm');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Disable button and show loading state
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        try {
            const data = await authAPI.login(email, password);

            // Redirect to correct role folder after login
            if (data.user.role === 'player' || data.user.role === 'coach') {
                try {
                    const meResponse = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include' });
                    const meData = await meResponse.json();
                    const folder = getProfileFolder({
                        role: meData.user.role,
                        is_transfer_player: meData.user.is_transfer_player,
                        ...meData.profile
                    });
                    const pageName = data.user.role === 'player' ? 'mainpage-player.html' : 'mainpage-coach.html';
                    window.location.href = `../${folder}/${pageName}`;
                } catch (profileError) {
                    // If profile fetch fails, use safe defaults
                    const fallback = data.user.role === 'player' ? '../hsplayer/mainpage-player.html' : '../hscoach/mainpage-coach.html';
                    window.location.href = fallback;
                }
            } else if (data.user.role === 'other') {
                window.location.href = '../other/mainpage-other.html';
            }
        } catch (error) {
            // Show inline error message instead of alert
            const errorEl = document.getElementById('loginError');
            if (errorEl) {
                errorEl.textContent = error.message || 'Invalid email or password';
                errorEl.style.display = 'block';
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Sign In<svg class="btn-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>';
        }
    });
}

// Role Selection Handler
function selectRole(role) {
    // Redirect directly to create-profile page
    if (role === 'player') {
        // Show player type selection modal
        showPlayerTypeModal();
    } else if (role === 'coach') {
        // Show coach type selection modal
        showCoachTypeModal();
    } else if (role === 'hscoach') {
        window.location.href = '../hscoach/create-coach-profile.html';
    } else if (role === 'collegecoach') {
        window.location.href = '../collegecoach/create-coach-profile.html';
    } else if (role === 'hsplayer') {
        window.location.href = '../hsplayer/create-profile.html';
    } else if (role === 'collegeplayer') {
        window.location.href = '../collegeplayer/create-profile.html';
    } else if (role === 'other') {
        window.location.href = '../other/create-profile.html';
    }
}

// Coach Type Selection Modal
function showCoachTypeModal() {
    const modal = document.createElement('div');
    modal.className = 'coach-type-modal';
    modal.innerHTML = `
        <style>
        .coach-type-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .coach-type-modal .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
        }
        .coach-type-modal .modal-content {
            position: relative;
            background: #0a1128;
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
        }
        .coach-type-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }
        .coach-type-modal .modal-header h2 {
            margin: 0;
            font-size: 1.5rem;
            color: #fefcfb;
            font-weight: 700;
        }
        .coach-type-modal .modal-close {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: rgba(254, 252, 251, 0.6);
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
        }
        .coach-type-modal .modal-close:hover {
            color: #fefcfb;
        }
        .coach-type-options {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .coach-type-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 24px;
            background: rgba(18, 130, 162, 0.1);
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .coach-type-btn:hover {
            background: rgba(18, 130, 162, 0.2);
            border-color: #1282a2;
            transform: translateY(-2px);
        }
        .coach-type-btn svg {
            width: 48px;
            height: 48px;
            color: #1282a2;
        }
        .coach-type-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #fefcfb;
        }
        .coach-type-desc {
            font-size: 0.9rem;
            color: rgba(254, 252, 251, 0.6);
            text-align: center;
        }
        </style>
        <div class="modal-overlay" onclick="closeCoachTypeModal()"></div>
        <div class="modal-content coach-type-content">
            <div class="modal-header">
                <h2>What type of coach are you?</h2>
                <button class="modal-close" onclick="closeCoachTypeModal()">&times;</button>
            </div>
            <div class="coach-type-options">
                <button class="coach-type-btn" onclick="selectRole('hscoach')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span class="coach-type-title">High School Coach</span>
                    <span class="coach-type-desc">Connect with your high school players and network with other coaches</span>
                </button>
                <button class="coach-type-btn" onclick="selectRole('collegecoach')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                    </svg>
                    <span class="coach-type-title">College Coach</span>
                    <span class="coach-type-desc">Recruit players for your college program</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closeCoachTypeModal() {
    const modal = document.querySelector('.coach-type-modal');
    if (modal) {
        modal.remove();
    }
}

// Player Type Selection Modal
function showPlayerTypeModal() {
    const modal = document.createElement('div');
    modal.className = 'player-type-modal';
    modal.innerHTML = `
        <style>
        .player-type-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .player-type-modal .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
        }
        .player-type-modal .modal-content {
            position: relative;
            background: #0a1128;
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 16px;
            padding: 32px;
            max-width: 500px;
            width: 90%;
        }
        .player-type-modal .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }
        .player-type-modal .modal-header h2 {
            margin: 0;
            font-size: 1.5rem;
            color: #fefcfb;
            font-weight: 700;
        }
        .player-type-modal .modal-close {
            background: none;
            border: none;
            font-size: 28px;
            cursor: pointer;
            color: rgba(254, 252, 251, 0.6);
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: color 0.2s;
        }
        .player-type-modal .modal-close:hover {
            color: #fefcfb;
        }
        .player-type-options {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .player-type-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 12px;
            padding: 24px;
            background: rgba(18, 130, 162, 0.1);
            border: 1px solid rgba(18, 130, 162, 0.3);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .player-type-btn:hover {
            background: rgba(18, 130, 162, 0.2);
            border-color: #1282a2;
            transform: translateY(-2px);
        }
        .player-type-btn svg {
            width: 48px;
            height: 48px;
            color: #1282a2;
        }
        .player-type-title {
            font-size: 1.1rem;
            font-weight: 700;
            color: #fefcfb;
        }
        .player-type-desc {
            font-size: 0.9rem;
            color: rgba(254, 252, 251, 0.6);
            text-align: center;
        }
        </style>
        <div class="modal-overlay" onclick="closePlayerTypeModal()"></div>
        <div class="modal-content player-type-content">
            <div class="modal-header">
                <h2>What type of player are you?</h2>
                <button class="modal-close" onclick="closePlayerTypeModal()">&times;</button>
            </div>
            <div class="player-type-options">
                <button class="player-type-btn" onclick="selectRole('hsplayer')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                    <span class="player-type-title">High School Player</span>
                    <span class="player-type-desc">Get recruited by college programs</span>
                </button>
                <button class="player-type-btn" onclick="selectRole('collegeplayer')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
                        <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
                    </svg>
                    <span class="player-type-title">College Player</span>
                    <span class="player-type-desc">Connect with other athletes or enter the transfer portal database</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function closePlayerTypeModal() {
    const modal = document.querySelector('.player-type-modal');
    if (modal) {
        modal.remove();
    }
}

function showRegistrationModal(role) {
    // Create modal HTML
    const modal = document.createElement('div');
    modal.className = 'registration-modal';
    modal.innerHTML = `
        <div class="modal-overlay" onclick="closeRegistrationModal()"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h2>Create Your Account</h2>
                <button class="modal-close" onclick="closeRegistrationModal()">×</button>
            </div>
            <form id="registrationForm" class="registration-form">
                <div class="form-group">
                    <label for="reg-email">Email Address</label>
                    <input type="email" id="reg-email" required placeholder="your.email@example.com">
                </div>
                <div class="form-group">
                    <label for="reg-password">Password</label>
                    <input type="password" id="reg-password" required placeholder="Min. 8 characters" minlength="8">
                </div>
                <div class="form-group">
                    <label for="reg-confirm-password">Confirm Password</label>
                    <input type="password" id="reg-confirm-password" required placeholder="Re-enter password">
                </div>
                <button type="submit" class="btn-primary">Create Account</button>
            </form>
            <p class="modal-footer">
                Already have an account? <a href="signin.html">Sign In</a>
            </p>
        </div>
    `;

    document.body.appendChild(modal);

    // Add modal styles
    const style = document.createElement('style');
    style.textContent = `
        .registration-modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .modal-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
        }
        .modal-content {
            position: relative;
            background: white;
            border-radius: 12px;
            padding: 32px;
            max-width: 480px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
        }
        .modal-header h2 {
            margin: 0;
            font-size: 24px;
        }
        .modal-close {
            background: none;
            border: none;
            font-size: 32px;
            cursor: pointer;
            color: #666;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .registration-form .form-group {
            margin-bottom: 20px;
        }
        .registration-form label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #333;
        }
        .registration-form input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
        }
        .registration-form input:focus {
            outline: none;
            border-color: #1282a2;
        }
        .registration-form .btn-primary {
            width: 100%;
            padding: 14px;
            margin-top: 8px;
        }
        .modal-footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
        }
        .modal-footer a {
            color: #1282a2;
            text-decoration: none;
            font-weight: 600;
        }
    `;
    document.head.appendChild(style);

    // Handle registration form
    const form = document.getElementById('registrationForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password').value;

        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account...';

        try {
            await authAPI.register(email, password, role);

            // Redirect to profile creation
            if (role === 'hsplayer') {
                window.location.href = '../hsplayer/create-profile.html';
            } else if (role === 'collegeplayer') {
                window.location.href = '../collegeplayer/create-profile.html';
            } else if (role === 'hscoach') {
                window.location.href = '../hscoach/create-coach-profile.html';
            } else if (role === 'collegecoach') {
                window.location.href = '../collegecoach/create-coach-profile.html';
            }
        } catch (error) {
            alert('Registration failed: ' + error.message);
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
        }
    });
}

function closeRegistrationModal() {
    const modal = document.querySelector('.registration-modal');
    if (modal) {
        modal.remove();
    }
}

// No auto-redirect on signin page - always show the login form
