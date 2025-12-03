// Discover Players JavaScript

document.addEventListener('DOMContentLoaded', async function() {
    // Show/hide recruiting-specific nav items for college coaches only
    await setupCollegeCoachNav();

    // Filter Elements
    const positionFilter = document.getElementById('positionFilter');
    const stateFilter = document.getElementById('stateFilter');
    const heightSlider = document.getElementById('heightSlider');
    const weightSlider = document.getElementById('weightSlider');
    const gpaSlider = document.getElementById('gpaSlider');
    const gradYearFilter = document.getElementById('gradYearFilter');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const resetFiltersBtn = document.getElementById('resetFilters');
    const resultsCount = document.getElementById('resultsCount');

    // Slider Value Display Elements
    const heightValue = document.getElementById('heightValue');
    const weightValue = document.getElementById('weightValue');
    const gpaValue = document.getElementById('gpaValue');

    // Player Cards
    const playerCards = document.querySelectorAll('.player-card');

    // Convert inches to feet/inches display
    function inchesToDisplay(inches) {
        const feet = Math.floor(inches / 12);
        const remainingInches = inches % 12;
        return `${feet}'${remainingInches}"`;
    }

    // Convert GPA slider value to actual GPA
    function sliderToGPA(value) {
        return (value / 10).toFixed(1);
    }

    // Update slider displays
    heightSlider.addEventListener('input', function() {
        heightValue.textContent = inchesToDisplay(this.value);
    });

    weightSlider.addEventListener('input', function() {
        weightValue.textContent = this.value;
    });

    gpaSlider.addEventListener('input', function() {
        gpaValue.textContent = sliderToGPA(this.value);
    });

    // Filter Players Function
    function filterPlayers() {
        const position = positionFilter.value.toLowerCase();
        const state = stateFilter.value.toLowerCase();
        const minHeight = parseInt(heightSlider.value);
        const minWeight = parseInt(weightSlider.value);
        const minGPA = parseInt(gpaSlider.value);
        const gradYear = gradYearFilter.value;

        let visibleCount = 0;

        playerCards.forEach(card => {
            const playerPosition = card.dataset.position.toLowerCase();
            const playerState = card.dataset.state.toLowerCase();
            const playerHeight = parseInt(card.dataset.height);
            const playerWeight = parseInt(card.dataset.weight);
            const playerGPA = parseInt(card.dataset.gpa);
            const playerGrad = card.dataset.grad;

            // Check all filter conditions
            const matchesPosition = !position || playerPosition === position;
            const matchesState = !state || playerState === state;
            const matchesHeight = playerHeight >= minHeight;
            const matchesWeight = playerWeight >= minWeight;
            const matchesGPA = playerGPA >= minGPA;
            const matchesGradYear = !gradYear || playerGrad === gradYear;

            // Show/hide card based on all conditions
            if (matchesPosition && matchesState && matchesHeight && matchesWeight && matchesGPA && matchesGradYear) {
                card.style.display = 'flex';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Update results count
        resultsCount.textContent = visibleCount;
    }

    // Apply Filters Button
    applyFiltersBtn.addEventListener('click', function() {
        filterPlayers();
    });

    // Reset Filters Button
    resetFiltersBtn.addEventListener('click', function() {
        // Reset all inputs
        positionFilter.value = '';
        stateFilter.value = '';
        heightSlider.value = 60;
        weightSlider.value = 150;
        gpaSlider.value = 0;
        gradYearFilter.value = '';

        // Update slider displays
        heightValue.textContent = inchesToDisplay(60);
        weightValue.textContent = '150';
        gpaValue.textContent = '0.0';

        // Show all players
        playerCards.forEach(card => {
            card.style.display = 'flex';
        });

        // Update count
        resultsCount.textContent = playerCards.length;
    });

    // Auto-apply filters on dropdown change (optional)
    positionFilter.addEventListener('change', filterPlayers);
    stateFilter.addEventListener('change', filterPlayers);
    gradYearFilter.addEventListener('change', filterPlayers);

    // Initial count
    resultsCount.textContent = playerCards.length;

    // View Profile Buttons
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

    console.log('Discover Players Page Loaded');
});

// Function to show/hide college-specific navigation based on user role
async function setupCollegeCoachNav() {
    try {
        const response = await API.get('/auth/me');
        if (response.user && response.profile) {
            const profile = response.profile;
            // Check for college_division to determine if user is a college coach
            // High school coaches won't have a division (FBS, FCS, D2, D3, NAIA, JUCO)
            const isCollegeCoach = profile.college_division && profile.college_division.trim() !== '';

            const recruitingBoardNav = document.getElementById('recruitingBoardNav');
            const transferPortalNav = document.getElementById('transferPortalNav');

            // Only show Recruiting Board and Transfer Portal for college coaches
            if (isCollegeCoach) {
                if (recruitingBoardNav) recruitingBoardNav.style.display = '';
                if (transferPortalNav) transferPortalNav.style.display = '';
            } else {
                // Explicitly hide for high school coaches
                if (recruitingBoardNav) recruitingBoardNav.style.display = 'none';
                if (transferPortalNav) transferPortalNav.style.display = 'none';
            }
        }
    } catch (error) {
        console.error('Error setting up college coach navigation:', error);
    }
}
