// About Page JavaScript - Animations and Interactivity (NO PARALLAX)

document.addEventListener('DOMContentLoaded', function() {
    
    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe all animated elements
    const animatedElements = document.querySelectorAll(
        '.problem-card, .coach-feature-card, .stat-card, .info-card, .portal-step, .value-card'
    );
    
    animatedElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Add animate-in class styling
    const style = document.createElement('style');
    style.textContent = `
        .animate-in {
            opacity: 1 !important;
            transform: translateY(0) !important;
        }
    `;
    document.head.appendChild(style);

    // Stagger animation for grid items
    const grids = document.querySelectorAll('.problem-grid, .coaches-grid, .stats-grid, .portal-steps');
    grids.forEach(grid => {
        const items = grid.querySelectorAll('.problem-card, .coach-feature-card, .stat-card, .portal-step');
        items.forEach((item, index) => {
            item.style.transitionDelay = `${index * 0.1}s`;
        });
    });

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Portal icon animation enhancement
    const portalIcon = document.querySelector('.portal-icon');
    if (portalIcon) {
        let rotation = 0;
        setInterval(() => {
            rotation += 1;
            portalIcon.style.transform = `rotate(${rotation}deg)`;
        }, 50);
    }

    // REMOVED PARALLAX EFFECT - No longer included

    // Counter animation for stats
    const animateCounter = (element, target) => {
        const duration = 2000;
        const start = 0;
        const increment = target / (duration / 16);
        let current = start;

        const timer = setInterval(() => {
            current += increment;
            if (current >= target) {
                element.textContent = target + (element.textContent.includes('+') ? '+' : '') + 
                                     (element.textContent.includes('%') ? '%' : '');
                clearInterval(timer);
            } else {
                element.textContent = Math.floor(current) + (element.textContent.includes('+') ? '+' : '') +
                                     (element.textContent.includes('%') ? '%' : '');
            }
        }, 16);
    };

    // Observe stats for counter animation
    const statsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !entry.target.dataset.animated) {
                const statNumber = entry.target.querySelector('.stat-number');
                const targetText = statNumber.textContent;
                const targetNumber = parseInt(targetText.replace(/\D/g, ''));
                
                entry.target.dataset.animated = 'true';
                animateCounter(statNumber, targetNumber);
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('.stat-card').forEach(card => {
        statsObserver.observe(card);
    });

    // Hover effect enhancement for cards
    const cards = document.querySelectorAll('.problem-card, .coach-feature-card, .info-card, .portal-step');
    cards.forEach(card => {
        card.addEventListener('mouseenter', function() {
            this.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        });
    });

    // Mobile menu toggle (if needed for smaller screens)
    const navLinks = document.querySelector('.nav-links');
    const navButtons = document.querySelector('.nav-buttons');
    
    if (window.innerWidth <= 768) {
        // Add mobile-friendly touch events
        document.querySelectorAll('.problem-card, .coach-feature-card').forEach(card => {
            card.addEventListener('touchstart', function() {
                this.style.transform = 'scale(0.98)';
            });
            card.addEventListener('touchend', function() {
                this.style.transform = 'scale(1)';
            });
        });
    }

});