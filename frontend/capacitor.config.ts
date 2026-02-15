import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.audiobooks.player',
  appName: 'Audiobook Player',
  webDir: 'dist',

  server: {
    // Use HTTP scheme on Android to avoid mixed-content blocking for LAN URLs.
    // LAN backend is http://192.168.x.x:8081 — loading HTTP resources from an
    // https:// origin is blocked by WebView even with allowMixedContent.
    // HTTPS tunnel URLs still work (upgrading HTTP→HTTPS is always allowed).
    androidScheme: 'http',
    iosScheme: 'https',
    // Allow navigation to tunnel URLs, GitHub raw content, and LAN
    allowNavigation: [
      '*.trycloudflare.com',
      'raw.githubusercontent.com',
      '*.blob.core.windows.net',
      '192.168.*.*',
      '10.*.*.*',
      '172.*.*.*',
    ],
  },

  android: {
    // Dark theme background color
    backgroundColor: '#111827',
    // Allow mixed content for development
    allowMixedContent: true,
    // Enable Chrome DevTools for debugging
    webContentsDebuggingEnabled: true,
  },

  ios: {
    // Automatic content inset for safe areas
    contentInset: 'automatic',
    // Dark theme background color
    backgroundColor: '#111827',
    // Custom user agent for analytics
    appendedUserAgentString: 'AudiobookPlayer/1.0',
    // Allow inline media playback (important for audio)
    allowsLinkPreview: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#111827',
      androidScaleType: 'CENTER_CROP',
      showSpinner: true,
      spinnerColor: '#ffffff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#111827',
    },
  },
};

export default config;
