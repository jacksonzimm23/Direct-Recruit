// Payment Success — Profile Type Switch
// After Stripe checkout for a switch-to-paid, redirect to the stored target URL.
// External file to satisfy CSP.

(function () {
    const redirectUrl = localStorage.getItem('switchRedirectUrl');
    localStorage.removeItem('switchRedirectUrl');

    if (redirectUrl) {
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 2000);
    } else {
        document.getElementById('statusTitle').textContent = 'Payment Successful!';
        document.getElementById('statusMessage').innerHTML = 'Redirecting to your dashboard... If not redirected, <a href="../landingpage/signin.html" class="ps-link">sign in here</a>.';
        setTimeout(() => {
            window.location.href = '../landingpage/signin.html';
        }, 3000);
    }
})();
