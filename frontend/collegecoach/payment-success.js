// Payment Success — College Coach
// Reads pendingProfileData from localStorage, creates the coach profile,
// then redirects to email verification.
// Kept as a separate file because the server's CSP forbids inline scripts.

(async function () {
    const statusTitle = document.getElementById('statusTitle');
    const statusMessage = document.getElementById('statusMessage');
    const redirectInfo = document.getElementById('redirectInfo');

    const pendingData = localStorage.getItem('pendingProfileData');

    if (!pendingData) {
        statusTitle.textContent = 'Something went wrong';
        statusMessage.textContent = 'No profile data found. Please start the signup process again.';
        redirectInfo.innerHTML = '<p><a href="create-coach-profile.html" style="color: var(--accent-orange, #ff6b35);">Back to Sign Up</a></p>';
        return;
    }

    try {
        const profileData = JSON.parse(pendingData);

        // For profile-type switches the switch transaction already created the coach_profiles
        // row server-side BEFORE Stripe checkout. Calling createCoachProfile here would create
        // a duplicate. Just clear pending data and route to the mainpage (user is already
        // email-verified from their original account).
        if (profileData._isSwitch) {
            localStorage.removeItem('pendingProfileData');
            statusTitle.textContent = 'Switch Complete!';
            statusMessage.textContent = "You're now a College Coach. Redirecting to your dashboard...";
            setTimeout(() => {
                window.location.href = 'mainpage-coach.html';
            }, 1500);
            return;
        }

        await API.profile.createCoachProfile(profileData);

        localStorage.removeItem('pendingProfileData');

        statusTitle.textContent = 'Payment Successful!';
        statusMessage.textContent = 'Your profile has been created. Redirecting to email verification...';

        setTimeout(() => {
            window.location.href = 'verify-email.html';
        }, 2000);
    } catch (error) {
        console.error('Profile creation failed:', error);
        statusTitle.textContent = 'Profile Setup Failed';
        statusMessage.textContent = 'Payment was successful but profile creation failed: ' + error.message;
        redirectInfo.innerHTML = '<p>Your payment has been processed. Please <a href="../landingpage/signin.html" style="color: var(--accent-orange, #ff6b35);">sign in</a> to complete your profile setup.</p>';
    }
})();
