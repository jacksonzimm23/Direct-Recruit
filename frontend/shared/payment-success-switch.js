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
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('../landingpage/signin.html', window.location.href).href;
        }, 3000);
    }
})();
