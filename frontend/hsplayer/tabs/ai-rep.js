// AI Rep Page - HS Player
// Frontend-only prototype with placeholder data

(function initAiRep() {
    // Entrance animation for cards
    const animateElements = document.querySelectorAll('.ai-rep-match-card:not(.ai-rep-match-hidden), .ai-rep-card, .ai-rep-hero');
    animateElements.forEach((el, i) => {
        el.classList.add('ai-rep-animate-in');
        setTimeout(() => {
            el.classList.add('ai-rep-visible');
        }, 80 + (i * 50));
    });

    // Show More matches logic
    const showMoreBtn = document.getElementById('aiRepShowMore');
    const matchList = document.getElementById('aiRepMatchList');
    if (!showMoreBtn || !matchList) return;

    const BATCH_SIZE = 5;

    showMoreBtn.addEventListener('click', function() {
        const hiddenCards = matchList.querySelectorAll('.ai-rep-match-hidden');
        const toShow = Array.from(hiddenCards).slice(0, BATCH_SIZE);

        toShow.forEach((card, i) => {
            card.classList.remove('ai-rep-match-hidden');
            card.style.opacity = '0';
            card.style.transform = 'translateY(10px)';
            setTimeout(() => {
                card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            }, i * 60);
        });

        // Hide button if no more hidden cards
        const remaining = matchList.querySelectorAll('.ai-rep-match-hidden');
        if (remaining.length === 0) {
            showMoreBtn.style.display = 'none';
        }
    });
})();
