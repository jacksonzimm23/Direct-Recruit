import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.directrecruit.app',
  appName: 'Direct Recruit',
  webDir: 'frontend',

  // Bundled mode: frontend files ship inside the .ipa.
  // API calls still hit https://directrecruit.net via fetch/XHR.
  // Safer for Apple Guideline 4.2 review than pure remote-loading.

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
