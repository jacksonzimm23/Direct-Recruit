// Shared Coach Navigation Functions

// Show/hide recruiting-specific nav items for college coaches only
async function setupCollegeCoachNav() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            // Check for college_division - high school coaches have 'High School'
            // College coaches have divisions like FBS, FCS, D2, D3, NAIA, JUCO
            const isCollegeCoach = profile.college_division &&
                                   profile.college_division.trim() !== '' &&
                                   profile.college_division !== 'High School';

            const recruitingBoardNav = document.getElementById('recruitingBoardNav');
            const transferPortalNav = document.getElementById('transferPortalNav');

            // Only show Recruiting Board and Transfer Portal for college coaches
            if (isCollegeCoach) {
                if (recruitingBoardNav) recruitingBoardNav.style.display = '';
                if (transferPortalNav) transferPortalNav.style.display = '';
            } else {
                // Explicitly hide for high school coaches
                if (recruitingBoardNav) recruitingBoardNav.style.display = 'none';
                if (transferPortalNav) transferPortalNav.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error setting up college coach nav:', error);
    }
}
