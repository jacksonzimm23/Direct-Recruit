// Sidebar Footer Component for HS Player
// This component injects the sidebar-footer element with user menu
// and populates it with the logged-in user's data from /api/auth/me

(function initSidebarFooter() {
    const sidebarFooterContainer = document.querySelector('.sidebar-footer');
    if (!sidebarFooterContainer) return;

    // Build the footer HTML - avatar is hidden initially to prevent flash
    const footerHTML = `
        <div class="user-menu">
            <div class="user-avatar-circle" style="visibility: hidden;">
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
            </div>
            <div class="user-info">
                <div class="user-name"></div>
                <div class="user-role"></div>
            </div>
            <svg class="more-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"></circle>
                <circle cx="12" cy="5" r="1"></circle>
                <circle cx="12" cy="19" r="1"></circle>
            </svg>
        </div>
    `;

    sidebarFooterContainer.innerHTML = footerHTML;

    // Populate sidebar footer with logged-in user's data
    populateSidebarFooter();
})();

async function populateSidebarFooter() {
    try {
        const response = await API.get('/auth/me');
        if (!response.user || !response.profile) return;

        const profile = response.profile;
        const user = response.user;
        const userFolder = window.getProfileFolder
            ? getProfileFolder({ role: user.role, is_transfer_player: user.is_transfer_player, transfer: profile.transfer, college_division: profile.college_division })
            : 'hsplayer';

        // Update name
        const userName = document.querySelector('.sidebar-footer .user-name');
        if (userName) {
            userName.textContent = `${profile.first_name} ${profile.last_name}`;
        }

        // Update role/info subtitle
        const userRole = document.querySelector('.sidebar-footer .user-role');
        if (userRole) {
            const parts = [];
            let color = '#1282a2'; // default cerulean

            if (userFolder === 'transferplayer') {
                if (profile.position) parts.push(profile.position);
                if (profile.height) {
                    if (typeof profile.height === 'string' && (profile.height.includes("'") || profile.height.includes('"'))) {
                        parts.push(profile.height);
                    } else {
                        const totalInches = parseInt(profile.height);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        parts.push(`${feet}'${inches}"`);
                    }
                }
                if (profile.weight) parts.push(`${profile.weight} lbs`);
                if (profile.eligibility) {
                    const yearText = profile.eligibility === 1 ? 'year' : 'years';
                    parts.push(`YOE: ${profile.eligibility} ${yearText}`);
                }
                userRole.textContent = parts.join(' • ') || 'Transfer Player';
                color = '#b91c1c';
            } else if (userFolder === 'hsplayer') {
                if (profile.position) parts.push(profile.position);
                if (profile.height) {
                    if (typeof profile.height === 'string' && (profile.height.includes("'") || profile.height.includes('"'))) {
                        parts.push(profile.height);
                    } else {
                        const totalInches = parseInt(profile.height);
                        const feet = Math.floor(totalInches / 12);
                        const inches = totalInches % 12;
                        parts.push(`${feet}'${inches}"`);
                    }
                }
                if (profile.weight) parts.push(`${profile.weight} lbs`);
                if (profile.graduation_year) parts.push(profile.graduation_year);
                userRole.textContent = parts.join(' • ') || 'Player';
            } else if (userFolder === 'collegeplayer') {
                if (profile.position) parts.push(profile.position);
                if (profile.team_name) parts.push(profile.team_name);
                if (profile.college_division) parts.push(profile.college_division);
                userRole.textContent = parts.join(' • ') || 'Player';
            } else if (userFolder === 'hscoach') {
                if (profile.team_name) parts.push(profile.team_name);
                if (profile.state) parts.push(profile.state);
                userRole.textContent = parts.join(', ') || 'HS Coach';
                color = '#ff6b35';
            } else if (userFolder === 'collegecoach') {
                if (profile.team_name && profile.state) {
                    parts.push(`${profile.team_name}, ${profile.state}`);
                } else if (profile.team_name) {
                    parts.push(profile.team_name);
                } else if (profile.state) {
                    parts.push(profile.state);
                }
                if (profile.college_division) parts.push(profile.college_division);
                userRole.textContent = parts.join(' • ') || 'College Coach';
                color = '#ff6b35';
            } else if (userFolder === 'other') {
                userRole.textContent = profile.subheader || '';
                color = '#1282a2';
            }

            userRole.style.color = color;
        }

        // Update avatar
        const avatarUrl = profile.profile_image_url || profile.profile_picture_url;
        const avatarElement = document.querySelector('.sidebar-footer .user-avatar-circle');
        if (avatarElement) {
            if (avatarUrl) {
                avatarElement.innerHTML = `<img src="${avatarUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }
            avatarElement.style.visibility = 'visible';
        }

        // Show sidebar footer
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter) {
            sidebarFooter.style.opacity = '1';
            sidebarFooter.style.transition = 'opacity 0.2s ease';
        }
    } catch (error) {
        console.error('Error populating sidebar footer:', error);
    }
}
