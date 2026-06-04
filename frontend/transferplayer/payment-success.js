// Payment Success — Transfer Player
// Reads pendingProfileData from localStorage, creates the player profile,
// then redirects to email verification. External file to satisfy CSP.

(async function () {
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    const redirectInfo = document.getElementById('redirectInfo');

    const pendingData = localStorage.getItem('pendingProfileData');

    if (!pendingData) {
        statusTitle.textContent = 'Something went wrong';
        statusMessage.textContent = 'No profile data found. Please start the signup process again.';
        redirectInfo.innerHTML = '<p><a href="create-profile.html" style="color: var(--cerulean, #1282a2);">Back to Sign Up</a></p>';
        return;
    }

    try {
        const profileData = JSON.parse(pendingData);
        await API.profile.createPlayerProfile(profileData);

        localStorage.removeItem('pendingProfileData');

        statusTitle.textContent = 'Payment Successful!';
        statusMessage.textContent = 'Your profile has been created. Redirecting to email verification...';

        setTimeout(() => {
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('verify-email.html', window.location.href).href;
        }, 2000);
    } catch (error) {
        console.error('Profile creation failed:', error);
        statusTitle.textContent = 'Profile Setup Failed';
        statusMessage.textContent = 'Payment was successful but profile creation failed: ' + error.message;
        redirectInfo.innerHTML = '<p>Your payment has been processed. Please <a href="../landingpage/signin.html" style="color: var(--cerulean, #1282a2);">sign in</a> to complete your profile setup.</p>';
    }
})();
