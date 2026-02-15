/**
 * Capacitor Initialization
 *
 * Initializes Capacitor plugins and sets up native platform features.
 * Only runs when the app is running as a native app (Android/iOS).
 */

import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { platformService } from '../services/platformService';
import { checkForUpdate } from '../services/appUpdateService';

/**
 * Initialize Capacitor plugins and native features
 */
export async function initializeCapacitor(): Promise<void> {
  if (!platformService.isNative) {
    console.log('[Capacitor] Not a native platform, skipping initialization');
    return;
  }

  console.log(`[Capacitor] Initializing for ${platformService.platform}...`);

  try {
    // Configure status bar
    await configureStatusBar();

    // Set up app lifecycle listeners
    setupAppLifecycleListeners();

    // Set up navigation handlers
    setupNavigationHandlers();

    // Hide splash screen after everything is ready
    await SplashScreen.hide();

    // Check for app updates in background (Android only, non-blocking)
    if (platformService.isAndroid) {
      checkForUpdateOnStartup();
    }

    console.log('[Capacitor] Initialization complete');
  } catch (error) {
    console.error('[Capacitor] Initialization error:', error);
    // Don't throw - app should still work even if some native features fail
  }
}

/**
 * Configure the native status bar
 */
async function configureStatusBar(): Promise<void> {
  try {
    // Dark content on dark background
    await StatusBar.setStyle({ style: Style.Dark });

    // Android-specific: Set background color
    if (platformService.isAndroid) {
      await StatusBar.setBackgroundColor({ color: '#111827' });
    }

    console.log('[Capacitor] Status bar configured');
  } catch (error) {
    console.warn('[Capacitor] Failed to configure status bar:', error);
  }
}

/**
 * Set up app lifecycle listeners
 */
function setupAppLifecycleListeners(): void {
  // Handle app state changes (foreground/background)
  App.addListener('appStateChange', ({ isActive }) => {
    console.log(`[Capacitor] App state: ${isActive ? 'foreground' : 'background'}`);

    // Dispatch custom event for other parts of the app to listen to
    window.dispatchEvent(
      new CustomEvent('capacitorAppStateChange', {
        detail: { isActive },
      })
    );

    // When app goes to background, ensure audio keeps playing
    // The native audio session should handle this automatically,
    // but we can trigger any cleanup or sync operations here
    if (!isActive) {
      // App going to background - this is a good time to sync history
      window.dispatchEvent(new CustomEvent('appBackgrounded'));
    }
  });

  // Handle app pause (iOS specific - when app loses focus but isn't fully backgrounded)
  App.addListener('pause', () => {
    console.log('[Capacitor] App paused');
    window.dispatchEvent(new CustomEvent('appPaused'));
  });

  // Handle app resume
  App.addListener('resume', () => {
    console.log('[Capacitor] App resumed');
    window.dispatchEvent(new CustomEvent('appResumed'));
  });
}

/**
 * Set up navigation handlers (back button, deep links)
 */
function setupNavigationHandlers(): void {
  // Handle hardware back button (Android)
  if (platformService.isAndroid) {
    App.addListener('backButton', ({ canGoBack }) => {
      console.log(`[Capacitor] Back button pressed, canGoBack: ${canGoBack}`);

      if (canGoBack) {
        // Navigate back in browser history
        window.history.back();
      } else {
        // At root - minimize app instead of exiting
        App.minimizeApp();
      }
    });
  }

  // Handle deep links (audiobookshelf://...)
  App.addListener('appUrlOpen', ({ url }) => {
    console.log(`[Capacitor] Deep link received: ${url}`);
    handleDeepLink(url);
  });
}

/**
 * Parse and handle deep links
 */
function handleDeepLink(url: string): void {
  try {
    const urlObj = new URL(url);

    // Handle different deep link paths
    // Example: audiobookshelf://book/123
    if (urlObj.pathname.startsWith('/book/')) {
      const bookId = urlObj.pathname.replace('/book/', '');
      console.log(`[Capacitor] Deep link to book: ${bookId}`);

      window.dispatchEvent(
        new CustomEvent('deepLinkNavigation', {
          detail: { type: 'book', bookId },
        })
      );
    }
    // Example: audiobookshelf://library
    else if (urlObj.pathname === '/library' || urlObj.pathname === '/') {
      window.dispatchEvent(
        new CustomEvent('deepLinkNavigation', {
          detail: { type: 'library' },
        })
      );
    }
    // Example: audiobookshelf://history
    else if (urlObj.pathname === '/history') {
      window.dispatchEvent(
        new CustomEvent('deepLinkNavigation', {
          detail: { type: 'history' },
        })
      );
    }
  } catch (error) {
    console.error('[Capacitor] Failed to parse deep link:', error);
  }
}

/**
 * Get app info (version, build, etc.)
 */
export async function getAppInfo(): Promise<{
  name: string;
  id: string;
  build: string;
  version: string;
}> {
  if (!platformService.isNative) {
    return {
      name: 'Audiobook Player',
      id: 'com.audiobooks.player',
      build: 'web',
      version: '1.0.0',
    };
  }

  const info = await App.getInfo();
  return info;
}

/**
 * Exit the app (Android only)
 */
export async function exitApp(): Promise<void> {
  if (platformService.isAndroid) {
    await App.exitApp();
  }
}

/**
 * Minimize the app (Android only)
 */
export async function minimizeApp(): Promise<void> {
  if (platformService.isAndroid) {
    await App.minimizeApp();
  }
}

/**
 * Check for updates on startup and dispatch event if available.
 * Non-blocking — runs in background after app initialization.
 */
async function checkForUpdateOnStartup(): Promise<void> {
  try {
    // Small delay to not compete with app initialization
    await new Promise(resolve => setTimeout(resolve, 3000));

    const info = await checkForUpdate();
    if (info.hasUpdate) {
      console.log(`[Capacitor] Update available: v${info.latestVersion}`);
      window.dispatchEvent(
        new CustomEvent('appUpdateAvailable', { detail: info })
      );
    }
  } catch (err) {
    console.warn('[Capacitor] Startup update check failed:', err);
  }
}
