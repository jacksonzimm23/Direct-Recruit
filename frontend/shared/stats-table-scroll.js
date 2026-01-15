// Stats Table Scroll Arrows
// Shows a right arrow indicator when stats tables can be scrolled horizontally
// Only shows on mobile (768px and below)

(function initStatsTableScroll() {
    // Only run on mobile
    function isMobile() {
        return window.innerWidth <= 768;
    }

    // Create the scroll arrow element
    function createScrollArrow() {
        const arrow = document.createElement('button');
        arrow.className = 'stats-scroll-arrow stats-scroll-arrow-right';
        arrow.setAttribute('aria-label', 'Scroll right for more stats');
        arrow.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
        `;
        return arrow;
    }

    // Setup scroll arrow for a single table container
    function setupTableScrollArrow(container) {
        // Skip if already setup
        if (container.dataset.scrollArrowSetup) return;
        container.dataset.scrollArrowSetup = 'true';

        // Find or create wrapper
        let wrapper = container.closest('.stats-table-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'stats-table-wrapper';
            container.parentNode.insertBefore(wrapper, container);
            wrapper.appendChild(container);
        }

        // Create and add arrow
        const arrow = createScrollArrow();
        wrapper.appendChild(arrow);

        // Update arrow visibility based on scroll position
        function updateArrowVisibility() {
            if (!isMobile()) {
                arrow.classList.remove('visible');
                return;
            }

            const scrollLeft = container.scrollLeft;
            const scrollWidth = container.scrollWidth;
            const clientWidth = container.clientWidth;
            const maxScroll = scrollWidth - clientWidth;

            // Show right arrow if there's more content to scroll (with threshold)
            if (maxScroll > 5 && scrollLeft < maxScroll - 5) {
                arrow.classList.add('visible');
            } else {
                arrow.classList.remove('visible');
            }
        }

        // Scroll when clicking arrow
        arrow.addEventListener('click', (e) => {
            e.preventDefault();
            const scrollAmount = 150;
            container.scrollTo({
                left: container.scrollLeft + scrollAmount,
                behavior: 'smooth'
            });
        });

        // Update on scroll
        container.addEventListener('scroll', updateArrowVisibility);

        // Initial check
        updateArrowVisibility();

        return updateArrowVisibility;
    }

    // Find and setup all stats table containers
    function setupAllTables() {
        const containers = document.querySelectorAll('.stats-table-container');
        const updateFunctions = [];

        containers.forEach(container => {
            const updateFn = setupTableScrollArrow(container);
            if (updateFn) updateFunctions.push(updateFn);
        });

        return updateFunctions;
    }

    // Initial setup
    let updateFunctions = [];

    function init() {
        updateFunctions = setupAllTables();
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Re-run setup periodically for dynamically added tables
    // This handles tables that are added after initial page load
    const observer = new MutationObserver((mutations) => {
        let shouldUpdate = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && (
                        node.classList?.contains('stats-table-container') ||
                        node.querySelector?.('.stats-table-container')
                    )) {
                        shouldUpdate = true;
                    }
                });
            }
        });
        if (shouldUpdate) {
            setTimeout(() => {
                updateFunctions = setupAllTables();
            }, 100);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Update all arrows on resize
    window.addEventListener('resize', () => {
        updateFunctions.forEach(fn => fn && fn());
    });

    // Also check after delays for dynamic content
    setTimeout(init, 500);
    setTimeout(init, 1000);
})();
