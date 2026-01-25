// Window interface extension for runtime config from config.js
declare global {
  interface Window {
    AUDIOBOOKSHELF_CONFIG?: {
      tunnelUrl?: string;
      lastUpdated?: string;
    };
  }
}

/**
 * Get the API base URL based on environment:
 * - Production (GitHub Pages): Uses tunnelUrl from config.js
 * - Local development: Uses relative '/api' (works with Vite proxy)
 */
export function getApiBaseUrl(): string {
  const config = window.AUDIOBOOKSHELF_CONFIG;

  // Production: Use tunnelUrl from config.js
  if (config?.tunnelUrl) {
    return `${config.tunnelUrl}/api`;
  }

  // Local development with Vite proxy (relative URL)
  if (import.meta.env.DEV) {
    return '/api';
  }

  // Production without tunnelUrl - log error but allow app to load
  console.error('No tunnelUrl configured. Please ensure config.js is present.');
  return '/api';
}

/**
 * Get the storage base URL for audio/image files
 */
export function getStorageBaseUrl(): string {
  const config = window.AUDIOBOOKSHELF_CONFIG;

  if (config?.tunnelUrl) {
    return `${config.tunnelUrl}/storage`;
  }

  return '/storage';
}

/**
 * Check if the app is running in production with tunnelUrl configured
 */
export function isTunnelConfigured(): boolean {
  return !!window.AUDIOBOOKSHELF_CONFIG?.tunnelUrl;
}

/**
 * Get the tunnel URL if configured
 */
export function getTunnelUrl(): string | undefined {
  return window.AUDIOBOOKSHELF_CONFIG?.tunnelUrl;
}
