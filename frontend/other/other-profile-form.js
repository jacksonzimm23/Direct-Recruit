// Other User Profile Form JavaScript

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('otherProfileForm');
    const bioTextarea = document.getElementById('bio');
    const bioCount = document.getElementById('bioCount');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    // Bio character counter
    if (bioTextarea && bioCount) {
        bioTextarea.addEventListener('input', function() {
            const count = this.value.length;
            bioCount.textContent = count;

            if (count >= 300) {
                bioCount.style.color = 'var(--accent-orange)';
            } else {
                bioCount.style.color = 'rgba(254, 252, 251, 0.6)';
            }
        });
    }

    // Auto-add @ to username if not present
    if (usernameInput) {
        usernameInput.addEventListener('blur', function() {
            if (this.value && !this.value.startsWith('@')) {
                this.value = '@' + this.value;
            }
        });

        usernameInput.addEventListener('input', function() {
            // Remove any spaces
            this.value = this.value.replace(/\s/g, '');
        });
    }

    // Password validation
    if (passwordInput && confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', function() {
            if (this.value !== passwordInput.value) {
                this.setCustomValidity('Passwords do not match');
            } else {
                this.setCustomValidity('');
            }
        });

        passwordInput.addEventListener('input', function() {
            if (confirmPasswordInput.value) {
                if (confirmPasswordInput.value !== this.value) {
                    confirmPasswordInput.setCustomValidity('Passwords do not match');
                } else {
                    confirmPasswordInput.setCustomValidity('');
                }
            }
        });
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', function(e) {
            e.preventDefault();

            // Get form data
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            // Validate passwords match
            if (data.password !== data.confirmPassword) {
                alert('Passwords do not match!');
                return;
            }

            // Validate age (must be 13+)
            const birthDate = new Date(data.dateOfBirth);
            const today = new Date();
            let age = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--;
            }

            if (age < 13) {
                alert('You must be at least 13 years old to create an account.');
                return;
            }

            // Check if terms are agreed to
            if (!data.agreeTerms) {
                alert('You must agree to the Terms of Service and Privacy Policy.');
                return;
            }

            console.log('Form submitted with data:', data);

            // Show success message
            alert('Account created successfully! Redirecting to sign in...');

            // In a real application, this would send data to a server
            // For now, redirect to sign in page after a delay
            setTimeout(() => {
                window.location.href = '../landingpage/signin.html';
            }, 1500);
        });
    }

    // Phone number formatting
    const phoneInput = document.getElementById('phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');

            if (value.length > 0) {
                if (value.length <= 3) {
                    value = '(' + value;
                } else if (value.length <= 6) {
                    value = '(' + value.slice(0, 3) + ') ' + value.slice(3);
                } else {
                    value = '(' + value.slice(0, 3) + ') ' + value.slice(3, 6) + '-' + value.slice(6, 10);
                }
            }

            e.target.value = value;
        });
    }

    // Date validation - prevent future dates
    const dateInput = document.getElementById('dateOfBirth');
    if (dateInput) {
        const today = new Date();
        const maxDate = new Date(today.getFullYear() - 13, today.getMonth(), today.getDate());
        dateInput.max = maxDate.toISOString().split('T')[0];
    }
});

// Prevent form submission on Enter key except for textareas
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const form = document.getElementById('otherProfileForm');
        if (form && e.target.form === form) {
            e.preventDefault();
        }
    }
});
