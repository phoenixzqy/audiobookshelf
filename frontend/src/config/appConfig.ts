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
      localUrl?: string;
      lastUpdated?: string;
    };
  }
}

// Config URL for mobile apps (fetched from GitHub Pages repo)
const REMOTE_CONFIG_URL =
  'https://raw.githubusercontent.com/phoenixzqy/phoenixzqy.github.io/refs/heads/master/audiobookshelf/config.js';

// Cached config for native apps
let cachedMobileConfig: { tunnelUrl?: string; localUrl?: string } | null = null;

// Connection type: 'lan' | 'tunnel' | 'local'
export type ConnectionType = 'lan' | 'tunnel' | 'local';
let currentConnectionType: ConnectionType = 'local';
let resolvedBaseUrl: string | null = null;

// Listeners for connection type changes
type ConnectionTypeListener = (type: ConnectionType) => void;
const connectionTypeListeners: ConnectionTypeListener[] = [];

export function onConnectionTypeChange(listener: ConnectionTypeListener): () => void {
  connectionTypeListeners.push(listener);
  return () => {
    const idx = connectionTypeListeners.indexOf(listener);
    if (idx >= 0) connectionTypeListeners.splice(idx, 1);
  };
}

export function getConnectionType(): ConnectionType {
  return currentConnectionType;
}

function setConnectionType(type: ConnectionType) {
  if (currentConnectionType !== type) {
    currentConnectionType = type;
    connectionTypeListeners.forEach(l => l(type));
  }
}

// Initialization promise to prevent multiple fetches
let initPromise: Promise<void> | null = null;

/**
 * Check if a URL is reachable by sending a quick fetch with a short timeout.
 * On native platforms, makes a real GET request.
 * On web HTTPS pages, skips HTTP LAN URLs (mixed content would block them).
 */
async function isUrlReachable(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    // On web (non-native), HTTPS pages can't access HTTP URLs due to mixed content
    if (!platformService.isNative && !platformService.isHarmonyOS) {
      const pageProtocol = window.location?.protocol;
      if (pageProtocol === 'https:' && url.startsWith('http:')) {
        console.log('[Config] Skipping HTTP LAN check from HTTPS page (mixed content)');
        return false;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch config from GitHub raw URL for mobile apps
 */
async function fetchRemoteConfig(): Promise<{ tunnelUrl?: string; localUrl?: string } | null> {
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
      const localMatch = configJs.match(/localUrl:\s*["']([^"']+)["']/);
      return {
        tunnelUrl: match[1],
        localUrl: localMatch?.[1] || undefined,
      };
    }

    console.warn('[Config] tunnelUrl not found in remote config');
    return null;
  } catch (error) {
    console.error('[Config] Failed to fetch remote config:', error);
    return null;
  }
}

/**
 * Resolve which backend URL to use: try localUrl first, fallback to tunnelUrl.
 * This saves bandwidth by preferring LAN connections when available.
 */
async function resolveConnection(): Promise<void> {
  const localUrl = getLocalUrl();
  const tunnelUrl = getRawTunnelUrl();

  if (import.meta.env.DEV) {
    setConnectionType('local');
    resolvedBaseUrl = null;
    console.log('[Config] Dev mode - using Vite proxy');
    return;
  }

  if (localUrl) {
    console.log('[Config] Checking LAN reachability:', localUrl);
    const reachable = await isUrlReachable(localUrl);
    if (reachable) {
      console.log('[Config] LAN backend reachable - using local connection');
      setConnectionType('lan');
      resolvedBaseUrl = localUrl;
      return;
    }
    console.log('[Config] LAN backend not reachable - falling back to tunnel');
  }

  if (tunnelUrl) {
    setConnectionType('tunnel');
    resolvedBaseUrl = tunnelUrl;
  }
}

/** Get localUrl from config (web or native) */
function getLocalUrl(): string | undefined {
  if (platformService.isNative || platformService.isHarmonyOS) {
    return cachedMobileConfig?.localUrl;
  }
  return window.AUDIOBOOKSHELF_CONFIG?.localUrl || undefined;
}

/** Get raw tunnelUrl from config (web or native) */
function getRawTunnelUrl(): string | undefined {
  if (platformService.isNative || platformService.isHarmonyOS) {
    return cachedMobileConfig?.tunnelUrl;
  }
  return window.AUDIOBOOKSHELF_CONFIG?.tunnelUrl;
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
      // Resolve LAN vs tunnel for web
      await resolveConnection();
      return;
    }

    // Native or HarmonyOS: Fetch config from GitHub
    console.log('[Config] Native/HarmonyOS platform - fetching remote config');

    // First, check for cached config
    const cachedUrl = await platformService.getPreference('tunnelUrl');
    const cachedLocalUrl = await platformService.getPreference('localUrl');
    if (cachedUrl) {
      console.log('[Config] Using cached tunnelUrl');
      cachedMobileConfig = { tunnelUrl: cachedUrl, localUrl: cachedLocalUrl || undefined };
    }

    // Fetch fresh config (update cache in background)
    const remoteConfig = await fetchRemoteConfig();
    if (remoteConfig?.tunnelUrl) {
      cachedMobileConfig = remoteConfig;
      // Cache for offline use
      await platformService.setPreference('tunnelUrl', remoteConfig.tunnelUrl);
      if (remoteConfig.localUrl) {
        await platformService.setPreference('localUrl', remoteConfig.localUrl);
      }
      console.log('[Config] Updated cached config');
    } else if (!cachedMobileConfig) {
      console.error('[Config] No config available - app may not function correctly');
    }

    // Resolve LAN vs tunnel for native
    await resolveConnection();
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
  // Dev mode: use Vite proxy
  if (import.meta.env.DEV) {
    return '/api';
  }

  // Use resolved base URL (LAN or tunnel, determined during init)
  if (resolvedBaseUrl) {
    return `${resolvedBaseUrl}/api`;
  }

  // Fallback: try config directly
  const config = window.AUDIOBOOKSHELF_CONFIG;
  if (config?.tunnelUrl) {
    return `${config.tunnelUrl}/api`;
  }

  // Native fallback
  if (platformService.isNative || platformService.isHarmonyOS) {
    if (cachedMobileConfig?.tunnelUrl) {
      return `${cachedMobileConfig.tunnelUrl}/api`;
    }
  }

  // Production without any URL configured
  console.error('[Config] No backend URL configured. API calls may fail.');
  return '/api';
}

/**
 * Get the storage base URL for audio/image files
 */
export function getStorageBaseUrl(): string {
  if (import.meta.env.DEV) {
    return '/storage';
  }

  if (resolvedBaseUrl) {
    return `${resolvedBaseUrl}/storage`;
  }

  const config = window.AUDIOBOOKSHELF_CONFIG;
  if (config?.tunnelUrl) {
    return `${config.tunnelUrl}/storage`;
  }

  if (platformService.isNative || platformService.isHarmonyOS) {
    if (cachedMobileConfig?.tunnelUrl) {
      return `${cachedMobileConfig.tunnelUrl}/storage`;
    }
  }

  return '/storage';
}

/**
 * Check if the app is running with tunnelUrl configured
 */
export function isTunnelConfigured(): boolean {
  if (resolvedBaseUrl) return true;
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
    // For web: re-resolve connection (LAN may have changed)
    await resolveConnection();
    console.log('[Config] Connection re-resolved:', currentConnectionType);
    return true;
  }

  const remoteConfig = await fetchRemoteConfig();
  if (remoteConfig?.tunnelUrl) {
    cachedMobileConfig = remoteConfig;
    await platformService.setPreference('tunnelUrl', remoteConfig.tunnelUrl);
    if (remoteConfig.localUrl) {
      await platformService.setPreference('localUrl', remoteConfig.localUrl);
    }
    await resolveConnection();
    console.log('[Config] Config refreshed successfully');
    return true;
  }

  return false;
}
