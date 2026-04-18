// ==================== Capacitor Init (Phase 2b) ====================
// Adds .ios-app class to <html> when running inside the Capacitor WebView.
// Initializes StatusBar + hides SplashScreen after first paint.
// Safe to load on mobile web and desktop — it's a no-op there.
// MUST load BEFORE api.js / feed.js / any other scripts that might
// rely on `.ios-app` for conditional behavior.
(function capacitorInit() {
    try {
        const cap = window.Capacitor;
        if (!cap || typeof cap.isNativePlatform !== 'function') return;
        if (!cap.isNativePlatform()) return;

        // Mark <html> for CSS scoping — as early as possible, before first paint
        document.documentElement.classList.add('ios-app');

        const plugins = cap.Plugins || {};
        const { StatusBar, SplashScreen } = plugins;

        // StatusBar: light text on our dark theme
        if (StatusBar) {
            StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
            // setBackgroundColor is Android-only per Capacitor docs; iOS ignores it safely
            StatusBar.setBackgroundColor?.({ color: '#0a1128' }).catch(() => {});
        }

        // SplashScreen: hide after DOM is ready + 300ms buffer for first render
        if (SplashScreen) {
            const hide = () => setTimeout(() => {
                SplashScreen.hide().catch(() => {});
            }, 300);
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', hide, { once: true });
            } else {
                hide();
            }
        }
    } catch (e) {
        console.error('[capacitorInit]', e);
    }
})();
