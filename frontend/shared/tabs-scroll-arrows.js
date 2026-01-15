// Profile Tabs Scroll Arrows
// Shows/hides scroll arrows based on tab container scroll position
// Include this file in all my-profile.html pages

(function initTabsScrollArrows() {
    // Only run on mobile (768px and below)
    function isMobile() {
        return window.innerWidth <= 768;
    }

    const profileTabs = document.getElementById('profileTabs');
    const scrollLeft = document.getElementById('tabsScrollLeft');
    const scrollRight = document.getElementById('tabsScrollRight');

    if (!profileTabs || !scrollLeft || !scrollRight) return;

    // Update arrow visibility based on scroll position
    function updateArrowVisibility() {
        if (!isMobile()) {
            scrollLeft.classList.remove('visible');
            scrollRight.classList.remove('visible');
            return;
        }

        const scrollLeftPos = profileTabs.scrollLeft;
        const scrollWidth = profileTabs.scrollWidth;
        const clientWidth = profileTabs.clientWidth;
        const maxScroll = scrollWidth - clientWidth;

        // Show left arrow if not at the start (with small threshold)
        if (scrollLeftPos > 5) {
            scrollLeft.classList.add('visible');
        } else {
            scrollLeft.classList.remove('visible');
        }

        // Show right arrow if not at the end (with small threshold)
        if (scrollLeftPos < maxScroll - 5) {
            scrollRight.classList.add('visible');
        } else {
            scrollRight.classList.remove('visible');
        }
    }

    // Scroll tabs when clicking arrows
    function scrollTabs(direction) {
        const scrollAmount = 150; // pixels to scroll
        const currentScroll = profileTabs.scrollLeft;
        const newScroll = direction === 'left'
            ? currentScroll - scrollAmount
            : currentScroll + scrollAmount;

        profileTabs.scrollTo({
            left: newScroll,
            behavior: 'smooth'
        });
    }

    // Event listeners for arrow clicks
    scrollLeft.addEventListener('click', (e) => {
        e.preventDefault();
        scrollTabs('left');
    });

    scrollRight.addEventListener('click', (e) => {
        e.preventDefault();
        scrollTabs('right');
    });

    // Update arrows on scroll
    profileTabs.addEventListener('scroll', updateArrowVisibility);

    // Update arrows on resize
    window.addEventListener('resize', updateArrowVisibility);

    // Initial check (delayed to ensure tabs are fully rendered)
    setTimeout(updateArrowVisibility, 100);

    // Also check after a longer delay for dynamic content
    setTimeout(updateArrowVisibility, 500);
})();
