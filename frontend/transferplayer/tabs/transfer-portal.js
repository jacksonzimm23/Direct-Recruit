// Transfer Portal JavaScript - Transfer Player Welcome Page

document.addEventListener('DOMContentLoaded', function() {
    // Check if coming from portal entry (show welcome animation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('welcome') === 'true' || document.referrer.includes('collegeplayer')) {
        showWelcomeAnimation();
    }
});

function showWelcomeAnimation() {
    // Add entrance animation class
    const welcomeSection = document.querySelector('.portal-welcome-section');
    if (welcomeSection) {
        welcomeSection.style.animation = 'welcomeFadeIn 1s ease forwards';
    }

    // Add styles for welcome animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes welcomeFadeIn {
            0% {
                opacity: 0;
                transform: translateY(20px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .portal-info-card {
            opacity: 0;
            animation: cardSlideIn 0.6s ease forwards;
        }

        .portal-info-card:nth-child(1) { animation-delay: 0.3s; }
        .portal-info-card:nth-child(2) { animation-delay: 0.5s; }
        .portal-info-card:nth-child(3) { animation-delay: 0.7s; }

        @keyframes cardSlideIn {
            0% {
                opacity: 0;
                transform: translateY(30px);
            }
            100% {
                opacity: 1;
                transform: translateY(0);
            }
        }

        .portal-action-btn {
            opacity: 0;
            animation: actionFadeIn 0.5s ease forwards;
            animation-delay: 1s;
        }

        @keyframes actionFadeIn {
            0% {
                opacity: 0;
            }
            100% {
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}
