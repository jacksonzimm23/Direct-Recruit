// Discover Players JavaScript

document.addEventListener('DOMContentLoaded', function() {

    // Filter functionality
    const positionFilter = document.getElementById('positionFilter');
    const classFilter = document.getElementById('classFilter');
    const stateFilter = document.getElementById('stateFilter');
    const ratingFilter = document.getElementById('ratingFilter');
    const resetFiltersBtn = document.getElementById('resetFilters');

    // Quick filter buttons
    const quickFilterBtns = document.querySelectorAll('.quick-filter-btn');

    quickFilterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            quickFilterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const filterType = this.textContent.trim();
            console.log('Quick filter applied:', filterType);
            // Apply filter logic here
        });
    });

    // Filter change handlers
    if (positionFilter) {
        positionFilter.addEventListener('change', function() {
            console.log('Position filter:', this.value);
            applyFilters();
        });
    }

    if (classFilter) {
        classFilter.addEventListener('change', function() {
            console.log('Class filter:', this.value);
            applyFilters();
        });
    }

    if (stateFilter) {
        stateFilter.addEventListener('change', function() {
            console.log('State filter:', this.value);
            applyFilters();
        });
    }

    if (ratingFilter) {
        ratingFilter.addEventListener('change', function() {
            console.log('Rating filter:', this.value);
            applyFilters();
        });
    }

    // Reset filters
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', function() {
            positionFilter.value = '';
            classFilter.value = '';
            stateFilter.value = '';
            ratingFilter.value = '';
            console.log('Filters reset');
            applyFilters();
        });
    }

    function applyFilters() {
        // This would connect to your backend to filter players
        console.log('Applying filters...');
        alert('Filter functionality will be connected to your backend.');
    }

    // View profile buttons
    const viewProfileBtns = document.querySelectorAll('.btn-view-profile');
    viewProfileBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const playerCard = this.closest('.player-card');
            const username = playerCard.dataset.username;
            if (username) {
                // Navigate to my-profile page with username parameter
                // Stay in the same folder so navigation continues to work
                window.location.href = `my-profile.html?username=${username}`;
            } else {
                const playerName = playerCard.querySelector('.player-name').textContent;
                console.log('No username for player:', playerName);
                alert('Profile not available. User has not set up their profile yet.');
            }
        });
    });

    // Load more button
    const loadMoreBtn = document.querySelector('.btn-load-more');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function() {
            console.log('Loading more players...');
            this.textContent = 'Loading...';

            // Simulate loading
            setTimeout(() => {
                this.textContent = 'Load More Players';
                alert('More players loaded! This will connect to your backend.');
            }, 1000);
        });
    }

    console.log('Discover Players page loaded');
});
