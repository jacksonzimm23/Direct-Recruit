// View Profile Redirect - Routes to the correct profile page based on user type
// This page determines which folder's my-profile.html to load based on the viewed user's type

document.addEventListener('DOMContentLoaded', async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('username');
    const userId = urlParams.get('userId');


    if (!username && !userId) {
        showError('No username or user ID specified');
        return;
    }

    try {
        // Check if user is authenticated (use API helper which knows the correct token key)
        if (!API.isAuthenticated()) {
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('../landingpage/index.html', window.location.href).href;
            return;
        }


        // Fetch the profile to determine its type
        let response;
        if (username) {
            response = await API.get(`/profile/username/${username}`);
        } else {
            response = await API.get(`/profile/by-id/${userId}`);
        }


        if (!response.profile) {
            showError('Profile not found');
            return;
        }

        // Determine the correct folder based on profile type and division
        const targetFolder = getProfileFolder({ role: response.type, ...response.profile });

        // Build the target URL with username or userId
        const profileUsername = username || response.profile.username;
        const fromParam = urlParams.get('from');
        let targetUrl;

        if (profileUsername) {
            targetUrl = `../${targetFolder}/tabs/my-profile.html?username=${encodeURIComponent(profileUsername)}`;
        } else if (userId || response.profile.user_id) {
            targetUrl = `../${targetFolder}/tabs/my-profile.html?userId=${encodeURIComponent(userId || response.profile.user_id)}`;
        } else {
            showError('Profile has no identifier');
            return;
        }

        if (fromParam) {
            targetUrl += `&from=${encodeURIComponent(fromParam)}`;
        }
        // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
        // (bare/relative targets silently no-op there). new URL(rel, location.href)
        // correctly preserves the /frontend prefix on web and its absence in-app.
        window.location.replace(new URL(targetUrl, window.location.href).href);

    } catch (error) {
        // Don't redirect to login for all errors - only for auth errors
        // Show error message instead and let user go back
        showError('Failed to load profile: ' + (error.message || 'Unknown error'));
    }
});

// getTargetFolder replaced by shared getProfileFolder() from api.js

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
