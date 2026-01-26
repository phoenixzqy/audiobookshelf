/**
 * Platform Service
 *
 * Provides platform detection and capability flags for the hybrid app.
 * Abstracts differences between web, Android, iOS, and HarmonyOS.
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export type Platform = 'web' | 'android' | 'ios' | 'harmonyos';

export interface PlatformCapabilities {
  /** Native audio engine available */
  hasNativeAudio: boolean;
  /** Can play audio in background */
  hasBackgroundPlayback: boolean;
  /** Lock screen media controls available */
  hasLockScreenControls: boolean;
  /** Push notifications supported */
  hasNotifications: boolean;
  /** Persistent storage available */
  hasPersistentStorage: boolean;
  /** Deep linking supported */
  hasDeepLinking: boolean;
}

class PlatformService {
  private _platform: Platform;
  private _isNative: boolean;
  private _capabilities: PlatformCapabilities;

  constructor() {
    this._isNative = Capacitor.isNativePlatform();
    this._platform = this.detectPlatform();
    this._capabilities = this.detectCapabilities();

    console.log(`[Platform] Detected: ${this._platform}, native: ${this._isNative}`);
  }

  /**
   * Detect the current platform
   */
  private detectPlatform(): Platform {
    // Check for native Capacitor platforms first
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform();
      if (platform === 'android') return 'android';
      if (platform === 'ios') return 'ios';
    }

    // Check for HarmonyOS via user agent (WebView scenario)
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('harmonyos') || ua.includes('huawei') || ua.includes('hmos')) {
      return 'harmonyos';
    }

    // Check if running in HarmonyOS WebView (custom property injected by native)
    if ((window as any).HARMONYOS === true) {
      return 'harmonyos';
    }

    return 'web';
  }

  /**
   * Detect platform capabilities
   */
  private detectCapabilities(): PlatformCapabilities {
    const hasMediaSession = 'mediaSession' in navigator;

    return {
      hasNativeAudio: this._isNative,
      hasBackgroundPlayback: this._isNative || hasMediaSession,
      hasLockScreenControls: this._isNative || hasMediaSession,
      hasNotifications: 'Notification' in window || this._isNative,
      hasPersistentStorage: 'storage' in navigator || this._isNative,
      hasDeepLinking: this._isNative,
    };
  }

  // ============================================
  // Platform Getters
  // ============================================

  /** Current platform identifier */
  get platform(): Platform {
    return this._platform;
  }

  /** Whether running in native app (Capacitor) */
  get isNative(): boolean {
    return this._isNative;
  }

  /** Whether running in web browser */
  get isWeb(): boolean {
    return this._platform === 'web';
  }

  /** Whether running on Android */
  get isAndroid(): boolean {
    return this._platform === 'android';
  }

  /** Whether running on iOS */
  get isIOS(): boolean {
    return this._platform === 'ios';
  }

  /** Whether running on HarmonyOS */
  get isHarmonyOS(): boolean {
    return this._platform === 'harmonyos';
  }

  /** Platform capabilities */
  get capabilities(): PlatformCapabilities {
    return this._capabilities;
  }

  // ============================================
  // Preferences (cross-platform storage)
  // ============================================

  /**
   * Store a preference value
   * Uses Capacitor Preferences on native, localStorage on web
   */
  async setPreference(key: string, value: string): Promise<void> {
    if (this._isNative) {
      await Preferences.set({ key, value });
    } else {
      try {
        localStorage.setItem(key, value);
      } catch (e) {
        console.warn('[Platform] localStorage write failed:', e);
      }
    }
  }

  /**
   * Retrieve a preference value
   */
  async getPreference(key: string): Promise<string | null> {
    if (this._isNative) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('[Platform] localStorage read failed:', e);
      return null;
    }
  }

  /**
   * Remove a preference
   */
  async removePreference(key: string): Promise<void> {
    if (this._isNative) {
      await Preferences.remove({ key });
    } else {
      try {
        localStorage.removeItem(key);
      } catch (e) {
        console.warn('[Platform] localStorage remove failed:', e);
      }
    }
  }

  /**
   * Clear all preferences
   */
  async clearPreferences(): Promise<void> {
    if (this._isNative) {
      await Preferences.clear();
    } else {
      try {
        localStorage.clear();
      } catch (e) {
        console.warn('[Platform] localStorage clear failed:', e);
      }
    }
  }
}

// Singleton instance
export const platformService = new PlatformService();
