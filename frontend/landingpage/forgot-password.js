// Forgot Password Form Handler

document.addEventListener('DOMContentLoaded', function() {
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            
            // Log the form data (in production, this would send to your backend)
            console.log('Password Reset Request:', {
                email: email
            });
            
            // Show success message
            alert(`Password reset link will be sent to ${email}`);
            
            // In production, you would:
            // 1. Send email to your backend API
            // 2. Backend sends password reset email
            // 3. Show confirmation message
            // 4. Optionally redirect to sign in page
            
            // Simulate redirect after success
            setTimeout(() => {
                // window.location.href = 'signin.html';
            }, 2000);
        });
    }
    
    // Add smooth animations
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.addEventListener('focus', function() {
            this.parentElement.style.transform = 'translateY(-2px)';
            this.parentElement.style.transition = 'transform 0.2s ease';
        });
        
        emailInput.addEventListener('blur', function() {
            this.parentElement.style.transform = 'translateY(0)';
        });
    }
});
