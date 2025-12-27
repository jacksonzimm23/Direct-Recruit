// View Profile Redirect - Routes to the correct profile page based on user type
// This page determines which folder's my-profile.html to load based on the viewed user's type

document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');

    console.log('View Profile: Loading profile for username:', username);

    if (!username) {
        showError('No username specified');
        return;
    }

    try {
        // Check if user is authenticated (use API helper which knows the correct token key)
        if (!API.isAuthenticated()) {
            console.log('View Profile: No token found, redirecting to login');
            window.location.href = '../landingpage/index.html';
            return;
        }

        console.log('View Profile: Token found, fetching profile...');

        // Fetch the profile to determine its type
        const response = await API.get(`/profile/username/${username}`);

        console.log('View Profile: API response:', response);

        if (!response.profile) {
            console.log('View Profile: No profile in response');
            showError('Profile not found');
            return;
        }

        // Determine the correct folder based on profile type and division
        const targetFolder = getTargetFolder(response.profile, response.type);

        console.log('View Profile: Target folder:', targetFolder);

        // Redirect to the appropriate my-profile page with the username
        // Preserve the 'from' parameter if present
        const fromParam = urlParams.get('from');
        let targetUrl = `../${targetFolder}/tabs/my-profile.html?username=${encodeURIComponent(username)}`;
        if (fromParam) {
            targetUrl += `&from=${encodeURIComponent(fromParam)}`;
        }
        console.log('View Profile: Redirecting to:', targetUrl);
        window.location.replace(targetUrl);

    } catch (error) {
        console.error('View Profile: Error loading profile:', error);
        // Don't redirect to login for all errors - only for auth errors
        // Show error message instead and let user go back
        showError('Failed to load profile: ' + (error.message || 'Unknown error'));
    }
});

function getTargetFolder(profile, type) {
    const collegeDivisions = ['FBS', 'FCS', 'D2', 'D3', 'NAIA', 'NJCAA', 'JUCO'];

    if (type === 'player') {
        // Check if college player based on college_division
        const isCollegePlayer = profile.college_division && collegeDivisions.includes(profile.college_division);
        return isCollegePlayer ? 'collegeplayer' : 'hsplayer';
    } else if (type === 'coach') {
        // Check if college coach based on college_division or school_type
        const isCollegeCoach =
            profile.school_type === 'college' ||
            (profile.college_division && collegeDivisions.includes(profile.college_division));
        return isCollegeCoach ? 'collegecoach' : 'hscoach';
    }

    // Default fallback
    return 'hsplayer';
}

function showError(message) {
    const loadingContainer = document.querySelector('.loading-container');
    const loadingText = document.querySelector('.loading-text');
    const errorMessage = document.getElementById('errorMessage');
    const spinner = document.querySelector('.loading-spinner');

    // Show the container for error display
    if (loadingContainer) loadingContainer.style.display = 'block';
    if (loadingText) loadingText.style.display = 'none';
    if (spinner) spinner.style.display = 'none';
    if (errorMessage) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    // Redirect to home after a delay
    setTimeout(() => {
        window.history.back();
    }, 2000);
}
