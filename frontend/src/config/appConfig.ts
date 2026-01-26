/**
 * App Configuration
 *
 * Handles runtime configuration for both web and native platforms.
 * - Web: Loads config from config.js script tag
 * - Native: Fetches config from GitHub raw URL
 */

import { platformService } from '../services/platformService';

// Window interface extension for runtime config from config.js
declare global {
  interface Window {
    AUDIOBOOKSHELF_CONFIG?: {
      tunnelUrl?: string;
      lastUpdated?: string;
    };
  }
}

// Config URL for mobile apps (fetched from GitHub Pages repo)
const REMOTE_CONFIG_URL =
  'https://raw.githubusercontent.com/phoenixzqy/phoenixzqy.github.io/refs/heads/master/audiobookshelf/config.js';

// Cached config for native apps
let cachedMobileConfig: { tunnelUrl?: string } | null = null;

// Initialization promise to prevent multiple fetches
let initPromise: Promise<void> | null = null;

/**
 * Fetch config from GitHub raw URL for mobile apps
 */
async function fetchRemoteConfig(): Promise<{ tunnelUrl?: string } | null> {
  try {
    console.log('[Config] Fetching remote config from GitHub...');

    const response = await fetch(REMOTE_CONFIG_URL, {
      cache: 'no-cache',
      headers: {
        Accept: 'text/javascript, application/javascript, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const configJs = await response.text();

    // Parse tunnelUrl from the JavaScript content
    // Matches: tunnelUrl: 'https://...' or tunnelUrl: "https://..."
    const match = configJs.match(/tunnelUrl:\s*["']([^"']+)["']/);

    if (match && match[1]) {
      console.log('[Config] Remote config loaded successfully');
      return { tunnelUrl: match[1] };
    }

    console.warn('[Config] tunnelUrl not found in remote config');
    return null;
  } catch (error) {
    console.error('[Config] Failed to fetch remote config:', error);
    return null;
  }
}

/**
 * Initialize configuration
 *
 * Call once at app startup. For web, config.js is already loaded via script tag.
 * For native apps, fetches config from GitHub and caches it.
 */
export async function initializeConfig(): Promise<void> {
  // Return existing promise if already initializing
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    // Web: config.js already loaded via script tag
    if (platformService.isWeb && !platformService.isHarmonyOS) {
      console.log('[Config] Web platform - using config.js from script tag');
      return;
    }

    // Native or HarmonyOS: Fetch config from GitHub
    console.log('[Config] Native/HarmonyOS platform - fetching remote config');

    // First, check for cached config
    const cachedUrl = await platformService.getPreference('tunnelUrl');
    if (cachedUrl) {
      console.log('[Config] Using cached tunnelUrl');
      cachedMobileConfig = { tunnelUrl: cachedUrl };
    }

    // Fetch fresh config (update cache in background)
    const remoteConfig = await fetchRemoteConfig();
    if (remoteConfig?.tunnelUrl) {
      cachedMobileConfig = remoteConfig;
      // Cache for offline use
      await platformService.setPreference('tunnelUrl', remoteConfig.tunnelUrl);
      console.log('[Config] Updated cached tunnelUrl');
    } else if (!cachedMobileConfig) {
      console.error('[Config] No config available - app may not function correctly');
    }
  })();

  return initPromise;
}

/**
 * Get the API base URL based on environment:
 * - Production (GitHub Pages): Uses tunnelUrl from config.js
 * - Native apps: Uses tunnelUrl from cached mobile config
 * - Local development: Uses relative '/api' (works with Vite proxy)
 */
export function getApiBaseUrl(): string {
  // Native apps: Use cached mobile config
  if (platformService.isNative || platformService.isHarmonyOS) {
    if (cachedMobileConfig?.tunnelUrl) {
      return `${cachedMobileConfig.tunnelUrl}/api`;
    }
    // Fallback: Check if window config exists (HarmonyOS WebView loading PWA)
  }

  // Web: Use config from script tag
  const config = window.AUDIOBOOKSHELF_CONFIG;
  if (config?.tunnelUrl) {
    return `${config.tunnelUrl}/api`;
  }

  // Local development with Vite proxy (relative URL)
  if (import.meta.env.DEV) {
    return '/api';
  }

  // Production without tunnelUrl - log error but allow app to load
  console.error('[Config] No tunnelUrl configured. API calls may fail.');
  return '/api';
}

/**
 * Get the storage base URL for audio/image files
 */
export function getStorageBaseUrl(): string {
  // Native apps: Use cached mobile config
  if (platformService.isNative || platformService.isHarmonyOS) {
    if (cachedMobileConfig?.tunnelUrl) {
      return `${cachedMobileConfig.tunnelUrl}/storage`;
    }
  }

  const config = window.AUDIOBOOKSHELF_CONFIG;
  if (config?.tunnelUrl) {
    return `${config.tunnelUrl}/storage`;
  }

  return '/storage';
}

/**
 * Check if the app is running with tunnelUrl configured
 */
export function isTunnelConfigured(): boolean {
  if (platformService.isNative || platformService.isHarmonyOS) {
    return !!cachedMobileConfig?.tunnelUrl;
  }
  return !!window.AUDIOBOOKSHELF_CONFIG?.tunnelUrl;
}

/**
 * Get the tunnel URL if configured
 */
export function getTunnelUrl(): string | undefined {
  if (platformService.isNative || platformService.isHarmonyOS) {
    return cachedMobileConfig?.tunnelUrl;
  }
  return window.AUDIOBOOKSHELF_CONFIG?.tunnelUrl;
}

/**
 * Force refresh config from remote (useful for manual refresh)
 */
export async function refreshConfig(): Promise<boolean> {
  if (!platformService.isNative && !platformService.isHarmonyOS) {
    console.log('[Config] Config refresh not supported on web');
    return false;
  }

  const remoteConfig = await fetchRemoteConfig();
  if (remoteConfig?.tunnelUrl) {
    cachedMobileConfig = remoteConfig;
    await platformService.setPreference('tunnelUrl', remoteConfig.tunnelUrl);
    console.log('[Config] Config refreshed successfully');
    return true;
  }

  return false;
}
