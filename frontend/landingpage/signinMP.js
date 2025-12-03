// Sign In Form Handler

document.addEventListener('DOMContentLoaded', function() {
    const signinForm = document.getElementById('signinForm');
    
    if (signinForm) {
        signinForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const remember = document.getElementById('remember').checked;
            
            // Log the form data (in production, this would send to your backend)
            console.log('Sign In Attempt:', {
                email: email,
                password: '***hidden***',
                remember: remember
            });
            
            // Redirect to main dashboard
            window.location.href = 'mainpage.html';
        });
    }
    
    // Google Sign In Handler
    const googleBtn = document.querySelector('.btn-social.google');
    if (googleBtn) {
        googleBtn.addEventListener('click', function() {
            console.log('Google Sign In clicked');
            
            // Redirect to main dashboard
            window.location.href = 'mainpage.html';
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