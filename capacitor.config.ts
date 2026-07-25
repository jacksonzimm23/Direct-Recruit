import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.directrecruit.app',
  appName: 'Direct Recruit',
  webDir: 'frontend',

  // Native WKWebView background. This is what shows during the gap BETWEEN
  // documents on an MPA navigation (tapping the bottom nav tears down one page
  // and paints the next) — and it defaults to WHITE, which reads as a flash on
  // every tab change. CSS cannot fix it: html.ios-app{background} in
  // ios-app-overrides.css only applies once the NEW document paints, which is
  // after the white is already on screen. Setting it natively makes the gap the
  // same colour as both pages, so navigation looks seamless.
  // Requires `npx cap sync ios` + a rebuild to take effect.
  backgroundColor: '#0a1128',

  // Bundled mode: frontend files ship inside the .ipa.
  // API calls hit https://directrecruit.net via native HTTP (CapacitorHttp).

  // WebView origin is left at the default https://localhost (NO server.hostname).
  // This is critical: CapacitorHttp bypasses requests to the WebView's OWN origin
  // (see @capacitor/ios native-bridge.js). If the WebView origin were
  // directrecruit.net, /api calls would be same-origin and get served the bundled
  // index.html instead of reaching the backend. With origin = https://localhost,
  // calls to https://directrecruit.net/api/* are cross-origin and CapacitorHttp
  // routes them natively. CapacitorCookies persists the auth cookie in the native
  // iOS cookie store, so cookie-based auth works without same-origin.
  server: {
    iosScheme: 'https',
    androidScheme: 'https'
  },

  ios: {
    // Explicit iOS value (overrides the global above). Kept alongside it so the
    // WKWebView background can never fall back to white on this platform.
    backgroundColor: '#0a1128',
    // 'never' = CSS controls safe-area padding (Phase 2b)
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true,
    // false = WKWebView is NOT inspectable from Safari's Develop menu in
    // release/TestFlight builds. This is the secure production state.
    // Flip to true (then `npx cap sync ios`) only when you need on-device
    // Safari Web Inspector debugging again.
    webContentsDebuggingEnabled: false
  },

  plugins: {
    // Route fetch()/XHR through native HTTP (URLSession) instead of the WebView.
    // Without this, the WKWebView asset handler intercepts ALL https:// requests to
    // the bundled origin (directrecruit.net) and returns the local index.html — so
    // /api/* calls came back as HTML (200 text/html) instead of the real backend JSON,
    // which broke sign-in on iOS. Native HTTP hits the real server and handles cookies
    // via the iOS cookie store.
    CapacitorHttp: {
      enabled: true
    },
    // Persists cookies (incl. the auth cookie) in the native iOS cookie store so
    // cookie-based auth works with native HTTP across the localhost↔directrecruit.net
    // origin split. Required alongside CapacitorHttp for this setup.
    CapacitorCookies: {
      enabled: true
    },
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: false,       // Phase 2b hides it programmatically
      backgroundColor: '#0a1128',  // Match site dark theme
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',               // Light text on dark bg
      backgroundColor: '#0a1128',
      overlaysWebView: true        // Needed for safe-area CSS in Phase 2b
    }
  }
};

export default config;
