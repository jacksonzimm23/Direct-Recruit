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

            // School logo next to the name — iOS APP ONLY (gated by the .ios-app
            // class set synchronously in <head> by capacitor-init.js; false in
            // mobile web + desktop). Only the 3 college roles have a college
            // team_name that maps to a logo: collegeplayer, transferplayer,
            // collegecoach. Mirrors the desktop sidebar-footer pattern (lessons
            // 47-52): await the JSON preload, then guard getSchoolLogoHTML with
            // typeof. Returns '' for HS/other roles, unknown schools, web, or if
            // school-search.js failed to load — so the name always still renders.
            const _COLLEGE_DIVISIONS = ['D1 FBS', 'D1 FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'FBS', 'FCS', '3C2A'];
            const _isCollegeRole =
                (user.role === 'player' && (user.is_transfer_player ||
                    (profile.college_division && _COLLEGE_DIVISIONS.includes(profile.college_division)))) ||
                (user.role === 'coach' && (user.is_college_coach ||
                    (profile.college_division && _COLLEGE_DIVISIONS.includes(profile.college_division))));
            const _isIosApp = document.documentElement.classList.contains('ios-app');
            let _nameLogo = '';
            if (_isIosApp && _isCollegeRole && profile.team_name) {
                const _mhAssets = window.location.pathname.includes('/tabs/') ? '../../assets' : '../assets';
                if (typeof ensureSchoolLogosLoaded === 'function') await ensureSchoolLogosLoaded(_mhAssets);
                _nameLogo = typeof getSchoolLogoHTML === 'function' ? getSchoolLogoHTML(profile.team_name, _mhAssets, 16) : '';
            }
            // Switching from textContent to innerHTML to inject the logo, so the
            // name must be HTML-escaped (reuse the global escapeHtml from api.js).
            const _safeName = (typeof escapeHtml === 'function') ? escapeHtml(fullName) : fullName;
            const _nameHtml = `<span class="mobile-name-text">${_safeName}</span>${_nameLogo}`;

            const mobileUserName = document.getElementById('mobileUserName');
            if (mobileUserName) {
                mobileUserName.innerHTML = _nameHtml;
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
            const roleBg = getRoleAvatarBg(user.role, user.is_transfer_player, profile.college_division);
            if (mobileUserRole) mobileUserRole.style.color = roleColor;

            // Mobile header avatar: role-colored ring always; when NO photo, also tie the
            // background fill + placeholder person icon to the profile type (mirrors the
            // sidebar-footer behavior) instead of the hardcoded cerulean CSS default.
            if (mobileProfilePic) {
                mobileProfilePic.style.border = `2px solid ${roleColor}`;
                if (!profileImgUrl) {
                    mobileProfilePic.style.backgroundColor = roleBg;
                    mobileProfilePic.style.color = roleColor;
                    mobileProfilePic.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
                }
            }

            // Also update mobile sidebar user info if present
            const mobileSidebarUserName = document.getElementById('mobileSidebarUserName');
            const mobileSidebarUserRole = document.getElementById('mobileSidebarUserRole');
            const mobileSidebarAvatar = document.getElementById('mobileSidebarAvatar');
            if (mobileSidebarUserName) mobileSidebarUserName.innerHTML = _nameHtml;
            if (mobileSidebarUserRole) {
                mobileSidebarUserRole.textContent = mobileUserRole ? mobileUserRole.textContent : '';
                mobileSidebarUserRole.style.color = roleColor;
            }
            if (mobileSidebarAvatar) {
                mobileSidebarAvatar.style.border = `2px solid ${roleColor}`;
                if (profileImgUrl) {
                    mobileSidebarAvatar.innerHTML = `<img src="${profileImgUrl}" alt="Profile" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
                } else {
                    // No photo: role-colored fill + placeholder icon (matches header avatar)
                    mobileSidebarAvatar.style.backgroundColor = roleBg;
                    mobileSidebarAvatar.style.color = roleColor;
                    mobileSidebarAvatar.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>`;
                }
            }

            // Fix mobile sidebar nav links to point to logged-in user's role folder
            const userFolder = getProfileFolder({ role: user.role, is_transfer_player: user.is_transfer_player, college_division: profile.college_division });

            // Detect the CURRENT role folder. Path is /frontend/<role>/... on web
            // but /<role>/... inside the Capacitor iOS app bundle. Detect either.
            const currentPath = window.location.pathname;
            const fe = currentPath.startsWith('/frontend/') ? '/frontend' : '';
            const after = fe ? currentPath.slice(fe.length) : currentPath; // -> /<role>/...
            const currentRole = after.split('/').filter(Boolean)[0] || '';

            // If we're on a different role's page, links must target the logged-in
            // user's folder; otherwise normalize to the current role's folder. Either
            // way, build an ABSOLUTE base so the hrefs actually navigate in WKWebView
            // (bare relative paths silently no-op inside the iOS app).
            const targetRole = (currentRole && currentRole !== userFolder) ? userFolder : (currentRole || userFolder);
            const correctBase = window.location.origin + fe + '/' + targetRole + '/tabs/';

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
