// Sign In Form Handler

document.addEventListener('DOMContentLoaded', function() {
    const signinForm = document.getElementById('signinForm');
    
    if (signinForm) {
        signinForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const remember = document.getElementById('remember').checked;
            
            // Redirect to main dashboard
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('mainpage.html', window.location.href).href;
        });
    }

    // Google Sign In Handler
    const googleBtn = document.querySelector('.btn-social.google');
    if (googleBtn) {
        googleBtn.addEventListener('click', function() {

            // Redirect to main dashboard
            // Resolve relative nav to an absolute URL so it works in the iOS WKWebView
            // (bare/relative targets silently no-op there). new URL(rel, location.href)
            // correctly preserves the /frontend prefix on web and its absence in-app.
            window.location.href = new URL('mainpage.html', window.location.href).href;
        });
    }

    // Add smooth animations
    const inputs = document.querySelectorAll('.form-group input');
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            this.parentElement.style.transform = 'translateY(-2px)';
            this.parentElement.style.transition = 'transform 0.2s ease';
        });
        
        input.addEventListener('blur', function() {
            this.parentElement.style.transform = 'translateY(0)';
        });
    });
});