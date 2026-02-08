import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.directrecruit.app',
  appName: 'Direct Recruit',
  webDir: 'frontend',

  // Remote mode: load from production server
  server: {
    url: 'https://directrecruit.net',
    cleartext: false
  },

  ios: {
    // Content inset adjustment for safe areas
    contentInset: 'automatic',
    // Allow navigation to external URLs (e.g., for OAuth, links)
    allowsLinkPreview: true,
    // Scroll behavior
    scrollEnabled: true
  }
};

export default config;
