// Mobile Header - Shared functionality to populate mobile header with user info
// Include this script on all pages that have the mobile header

async function updateMobileHeader() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;

            // Update mobile header profile picture
            const mobileProfilePic = document.getElementById('mobileProfilePic');
            if (mobileProfilePic && profile.profile_picture_url) {
                mobileProfilePic.innerHTML = `<img src="${profile.profile_picture_url}" alt="Profile" class="mobile-profile-pic">`;
            }

            // Update mobile header user info
            const mobileUserName = document.getElementById('mobileUserName');
            if (mobileUserName) {
                mobileUserName.textContent = `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'User';
            }

            const mobileUserRole = document.getElementById('mobileUserRole');
            if (mobileUserRole) {
                // Set role text based on user type
                let roleText = profile.subheader || '';

                // If no subheader, use role/position based on user type
                if (!roleText && response.user.user_type) {
                    switch (response.user.user_type) {
                        case 'hsplayer':
                            roleText = profile.position || 'HS Player';
                            break;
                        case 'collegeplayer':
                            roleText = profile.position || 'College Player';
                            break;
                        case 'transferplayer':
                            roleText = profile.position || 'Transfer Player';
                            break;
                        case 'hscoach':
                            roleText = profile.title || 'HS Coach';
                            break;
                        case 'collegecoach':
                            roleText = profile.title || 'College Coach';
                            break;
                        case 'other':
                            roleText = profile.subheader || '';
                            break;
                    }
                }

                mobileUserRole.textContent = roleText;
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
