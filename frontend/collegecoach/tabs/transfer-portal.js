document.addEventListener('DOMContentLoaded', async function() {
    // Show/hide recruiting-specific nav items for college coaches only
    await setupCollegeCoachNav();

    // Filter functionality for Transfer Portal
    const positionFilter = document.getElementById('positionFilter');
    const eligibilityFilter = document.getElementById('eligibilityFilter');
    const levelFilter = document.getElementById('levelFilter');
    const heightSlider = document.getElementById('heightSlider');
    const weightSlider = document.getElementById('weightSlider');
    const gpaSlider = document.getElementById('gpaSlider');
    const resetFiltersBtn = document.getElementById('resetFilters');
    const applyFiltersBtn = document.getElementById('applyFilters');
    const resultsCount = document.getElementById('resultsCount');
    const playerCards = document.querySelectorAll('.player-card');

    // Slider Value Display Elements
    const heightValue = document.getElementById('heightValue');
    const weightValue = document.getElementById('weightValue');
    const gpaValue = document.getElementById('gpaValue');

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

    // Filter players based on selected criteria
    function filterPlayers() {
        const selectedPosition = positionFilter.value;
        const selectedEligibility = eligibilityFilter.value;
        const selectedLevel = levelFilter.value;
        const minHeight = parseInt(heightSlider.value);
        const minWeight = parseInt(weightSlider.value);
        const minGPA = parseInt(gpaSlider.value);

        let visibleCount = 0;

        playerCards.forEach(card => {
            const cardPosition = card.getAttribute('data-position');
            const cardEligibility = card.getAttribute('data-eligibility');
            const cardLevel = card.getAttribute('data-level');
            const cardHeight = parseInt(card.getAttribute('data-height'));
            const cardWeight = parseInt(card.getAttribute('data-weight'));
            const cardGPA = parseInt(card.getAttribute('data-gpa'));

            // Check if card matches all filters
            const matchesPosition = selectedPosition === '' || cardPosition === selectedPosition;
            const matchesEligibility = selectedEligibility === '' || cardEligibility === selectedEligibility;
            const matchesLevel = selectedLevel === '' || cardLevel === selectedLevel;
            const matchesHeight = cardHeight >= minHeight;
            const matchesWeight = cardWeight >= minWeight;
            const matchesGPA = cardGPA >= minGPA;

            // Show or hide card based on all criteria
            if (matchesPosition && matchesEligibility && matchesLevel && matchesHeight && matchesWeight && matchesGPA) {
                card.style.display = 'block';
                visibleCount++;
            } else {
                card.style.display = 'none';
            }
        });

        // Update results count
        resultsCount.textContent = visibleCount;
    }

    // Add event listeners to filter buttons
    applyFiltersBtn.addEventListener('click', filterPlayers);

    // Auto-apply filters on dropdown change
    positionFilter.addEventListener('change', filterPlayers);
    eligibilityFilter.addEventListener('change', filterPlayers);
    levelFilter.addEventListener('change', filterPlayers);

    // Reset all filters
    resetFiltersBtn.addEventListener('click', () => {
        positionFilter.value = '';
        eligibilityFilter.value = '';
        levelFilter.value = '';
        heightSlider.value = 60;
        weightSlider.value = 150;
        gpaSlider.value = 0;

        // Update slider displays
        heightValue.textContent = inchesToDisplay(60);
        weightValue.textContent = '150';
        gpaValue.textContent = '0.0';

        filterPlayers();
    });

    // Contact button functionality
    const contactButtons = document.querySelectorAll('.btn-view-profile');
    contactButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const playerCard = this.closest('.player-card');
            const playerNameElement = playerCard.querySelector('.player-name');

            // Get text content and remove the portal icon
            const fullText = playerNameElement.textContent.trim();
            const cleanName = fullText.replace(/\s+/g, ' ').trim();

            // In a real application, this would open a messaging interface
            alert(`Opening contact form for ${cleanName}...`);
        });
    });

    // Initialize count on page load
    resultsCount.textContent = playerCards.length;
});
