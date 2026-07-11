// Smooth scrolling for navigation links
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

// Legal-page back button (terms / privacy). Handler lives here in an external
// 'self' script — NOT an inline onclick — because the node backend's CSP
// (script-src 'self', no unsafe-inline) blocks inline handlers in production and
// in the iOS app (lesson #84). history.back() returns to whatever page linked
// here (paywall, Settings, sign-in, landing footer) without routing an
// authenticated paywall user through index.html, which logged them out on iOS.
document.querySelectorAll('.legal-back-button').forEach(btn => {
    btn.addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = 'index.html';
        }
    });
});

// Navbar background change on scroll. The legal pages (terms / privacy) have no
// .navbar, so guard against null — otherwise navbar.style throws on every scroll.
const navbar = document.querySelector('.navbar');

if (navbar) {
    window.addEventListener('scroll', () => {
        const currentScroll = window.pageYOffset;

        if (currentScroll > 100) {
            navbar.style.background = 'rgba(10, 17, 40, 0.98)';
            navbar.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.3)';
        } else {
            navbar.style.background = 'rgba(10, 17, 40, 0.95)';
            navbar.style.boxShadow = 'none';
        }
    });
}
