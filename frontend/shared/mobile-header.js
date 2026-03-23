// Mobile Header - Shared functionality to populate mobile header with user info
// Include this script on all pages that have the mobile header

async function updateMobileHeader() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            const user = response.user;

            // Update mobile header profile picture (player/coach use profile_image_url, other uses profile_picture_url)
            const profileImgUrl = profile.profile_image_url || profile.profile_picture_url;
            const mobileProfilePic = document.getElementById('mobileProfilePic');
            if (mobileProfilePic && profileImgUrl) {
                mobileProfilePic.innerHTML = `<img src="${profileImgUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            }

            // Update mobile header user info
            const fullName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User';
            const mobileUserName = document.getElementById('mobileUserName');
            if (mobileUserName) {
                mobileUserName.textContent = fullName;
            }

            const mobileUserRole = document.getElementById('mobileUserRole');
            if (mobileUserRole) {
                let roleText = '';

                // Determine profile type from API response fields:
                // user.role = 'player' | 'coach' | 'other'
                // user.is_transfer_player = true/false (player only)
                // user.is_college_coach = true/false (coach only)
                // profile.college_division exists for college players and college coaches
                if (user.role === 'player') {
                    if (user.is_transfer_player) {
                        // Transfer Player: Position • Height • Weight • YOE
                        const parts = [];
                        if (profile.position) parts.push(profile.position);
                        if (profile.height) {
                            if (typeof profile.height === 'string' && (profile.height.includes("'") || profile.height.includes('"'))) {
                                parts.push(profile.height);
                            } else {
                                const ti = parseInt(profile.height);
                                parts.push(`${Math.floor(ti / 12)}'${ti % 12}"`);
                            }
                        }
                        if (profile.weight) parts.push(`${profile.weight} lbs`);
                        if (profile.eligibility) {
                            const yt = profile.eligibility === 1 ? 'year' : 'years';
                            parts.push(`YOE: ${profile.eligibility} ${yt}`);
                        }
                        roleText = parts.join(' • ') || 'Transfer Player';
                    } else if (profile.college_division && ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'].includes(profile.college_division)) {
                        // College Player: Position • Team • Division
                        const parts = [];
                        if (profile.position) parts.push(profile.position);
                        if (profile.team_name) parts.push(profile.team_name);
                        if (profile.college_division) parts.push(formatDivisionDisplay(profile.college_division));
                        roleText = parts.join(' • ') || 'College Player';
                    } else {
                        // HS Player: Position • Height • Weight • GradYear
                        const parts = [];
                        if (profile.position) parts.push(profile.position);
                        if (profile.height) {
                            if (typeof profile.height === 'string' && (profile.height.includes("'") || profile.height.includes('"'))) {
                                parts.push(profile.height);
                            } else {
                                const ti = parseInt(profile.height);
                                parts.push(`${Math.floor(ti / 12)}'${ti % 12}"`);
                            }
                        }
                        if (profile.weight) parts.push(`${profile.weight} lbs`);
                        if (profile.graduation_year) parts.push(profile.graduation_year);
                        roleText = parts.join(' • ') || 'HS Player';
                    }
                } else if (user.role === 'coach') {
                    if (user.is_college_coach) {
                        // College Coach: Team, State • Division
                        const parts = [];
                        if (profile.team_name && profile.state) {
                            parts.push(`${profile.team_name}, ${profile.state}`);
                        } else if (profile.team_name) {
                            parts.push(profile.team_name);
                        } else if (profile.state) {
                            parts.push(profile.state);
                        }
                        if (profile.college_division) {
                            parts.push(formatDivisionDisplay(profile.college_division));
                        }
                        roleText = parts.join(' • ') || 'College Coach';
                    } else {
                        // HS Coach: Team, State
                        const parts = [];
                        if (profile.team_name) parts.push(profile.team_name);
                        if (profile.state) parts.push(profile.state);
                        roleText = parts.join(', ') || 'HS Coach';
                    }
                } else if (user.role === 'other') {
                    roleText = profile.subheader || '';
                }

                mobileUserRole.textContent = roleText;
            }

            // Set color based on logged-in user's role, not the page's profile-type class
            const roleColor = getRoleBorderColor(user.role, user.is_transfer_player, profile.college_division);
            if (mobileUserRole) mobileUserRole.style.color = roleColor;

            // Set role-colored border on mobile header avatar
            if (mobileProfilePic) mobileProfilePic.style.border = `2px solid ${roleColor}`;

            // Also update mobile sidebar user info if present
            const mobileSidebarUserName = document.getElementById('mobileSidebarUserName');
            const mobileSidebarUserRole = document.getElementById('mobileSidebarUserRole');
            const mobileSidebarAvatar = document.getElementById('mobileSidebarAvatar');
            if (mobileSidebarUserName) mobileSidebarUserName.textContent = fullName;
            if (mobileSidebarUserRole) {
                mobileSidebarUserRole.textContent = mobileUserRole ? mobileUserRole.textContent : '';
                mobileSidebarUserRole.style.color = roleColor;
            }
            if (mobileSidebarAvatar) {
                if (profileImgUrl) {
                    mobileSidebarAvatar.innerHTML = `<img src="${profileImgUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                }
                mobileSidebarAvatar.style.border = `2px solid ${roleColor}`;
            }

            // Fix mobile sidebar nav links to point to logged-in user's role folder
            const userFolder = getProfileFolder({ role: user.role, is_transfer_player: user.is_transfer_player, college_division: profile.college_division });

            // Check if we're on a different role's page
            const currentPath = window.location.pathname;
            const pathParts = currentPath.split('/');
            const frontendIdx = pathParts.indexOf('frontend');
            if (frontendIdx !== -1 && pathParts[frontendIdx + 1] !== userFolder) {
                // We're on a different role's page — rewrite mobile sidebar links
                const correctBase = `../../${userFolder}/tabs/`;
                const profileLink = document.getElementById('mobileSidebarProfileLink');
                if (profileLink) profileLink.href = correctBase + 'my-profile.html';

                const sidebarNavItems = document.querySelectorAll('.mobile-sidebar-nav .mobile-sidebar-nav-item');
                sidebarNavItems.forEach(item => {
                    const href = item.getAttribute('href');
                    if (!href || item.tagName === 'BUTTON') return;
                    if (href.includes('my-profile.html')) {
                        item.href = correctBase + 'my-profile.html';
                    } else if (href.includes('settings.html')) {
                        item.href = correctBase + 'settings.html';
                    }
                });
            }
        }
    } catch (error) {
        console.error('Error updating mobile header:', error);
    }
}

// Auto-initialize on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    // Only update if mobile header exists
    if (document.getElementById('mobileHeader')) {
        updateMobileHeader();
    }
});
