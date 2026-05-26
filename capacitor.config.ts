import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.directrecruit.app',
  appName: 'Direct Recruit',
  webDir: 'frontend',

  // Bundled mode: frontend files ship inside the .ipa.
  // API calls still hit https://directrecruit.net via fetch/XHR.
  // Safer for Apple Guideline 4.2 review than pure remote-loading.

  // WebView origin = https://directrecruit.net (instead of capacitor://localhost).
  // Makes window.location.origin match the API host so cookies are same-origin
  // and API_BASE_URL in api.js resolves to https://directrecruit.net/api.
  server: {
    hostname: 'directrecruit.net',
    iosScheme: 'https',
    androidScheme: 'https'
  },

  ios: {
    // 'never' = CSS controls safe-area padding (Phase 2b)
    contentInset: 'never',
    allowsLinkPreview: false,
    scrollEnabled: true
  },

  plugins: {
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
