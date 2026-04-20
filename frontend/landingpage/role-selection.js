// Role Selection JavaScript
// Note: selectRole() function is now defined in auth.js to handle registration flow

// Add keyboard navigation
document.addEventListener('DOMContentLoaded', function() {
    const roleCards = document.querySelectorAll('.role-card');
    
    roleCards.forEach(card => {
        // Make cards keyboard accessible
        card.setAttribute('tabindex', '0');
        
        // Handle keyboard navigation
        card.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const button = this.querySelector('.btn-role-select');
                button.click();
            }
        });
        
        // Add hover effect on focus
        card.addEventListener('focus', function() {
            this.style.transform = 'translateY(-8px)';
        });
        
        card.addEventListener('blur', function() {
            this.style.transform = 'translateY(0)';
        });
    });
});

// Handle card click (not just button)
document.addEventListener('DOMContentLoaded', function() {
    const roleCards = document.querySelectorAll('.role-card');
    
    roleCards.forEach(card => {
        card.addEventListener('click', function(e) {
            // If clicking the card but not the button, trigger the button
            if (!e.target.closest('.btn-role-select')) {
                const button = this.querySelector('.btn-role-select');
                button.click();
            }
        });
    });
});