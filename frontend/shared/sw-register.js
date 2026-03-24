// Service Worker Registration
// This file registers the service worker for PWA functionality

(function() {
  'use strict';

  // Only register service worker in production and if supported
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      // Determine the correct path to the service worker based on current location
      const swPath = getServiceWorkerPath();

      navigator.serviceWorker.register(swPath)
        .then(function(registration) {
          // Service Worker registered successfully

          // Check for updates periodically
          setInterval(function() {
            registration.update();
          }, 60 * 60 * 1000); // Check every hour

          // Handle updates
          registration.addEventListener('updatefound', function() {
            const newWorker = registration.installing;

            newWorker.addEventListener('statechange', function() {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New service worker available, notify user if needed
                // New version available — will activate on next page load
              }
            });
          });
        })
        .catch(function(error) {
          // Service Worker registration failed — non-critical, app works without it
        });
    });
  }

  // Get the correct path to the service worker based on current page location
  function getServiceWorkerPath() {
    const pathname = window.location.pathname;

    // If we're in a tabs subfolder (e.g., /hsplayer/tabs/messages.html)
    if (pathname.includes('/tabs/')) {
      return '../../service-worker.js';
    }

    // If we're in a role folder or landingpage (e.g., /hsplayer/mainpage-player.html)
    if (pathname.includes('/hsplayer/') ||
        pathname.includes('/collegeplayer/') ||
        pathname.includes('/transferplayer/') ||
        pathname.includes('/hscoach/') ||
        pathname.includes('/collegecoach/') ||
        pathname.includes('/other/') ||
        pathname.includes('/landingpage/') ||
        pathname.includes('/shared/')) {
      return '../service-worker.js';
    }

    // Default: assume we're at the root
    return '/service-worker.js';
  }
})();
