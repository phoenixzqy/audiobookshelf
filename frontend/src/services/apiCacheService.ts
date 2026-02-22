/**
 * API Response Cache Service
 *
 * Caches GET API responses in IndexedDB for offline access.
 * Strategy: network-first when online, cache-only when offline.
 * 
 * IMPORTANT: When offline, cache entries NEVER expire - they are always available.
 * TTL only applies when online to determine if a fresh fetch should be attempted.
 */

import { indexedDBService } from './indexedDB';
import { networkService } from './networkService';

/** TTL configuration per endpoint pattern (milliseconds) - only used when ONLINE */
const TTL_CONFIG: Array<{ pattern: RegExp; ttl: number }> = [
  { pattern: /^\/books\/[^/]+$/, ttl: 60 * 60 * 1000 },    // Book details: 1 hour
  { pattern: /^\/books\/?$/, ttl: 5 * 60 * 1000 },          // Book list: 5 min
  { pattern: /^\/history\//, ttl: 60 * 1000 },               // History: 1 min
];

const DEFAULT_TTL = 5 * 60 * 1000; // 5 min default

/** Endpoints that should NOT be cached */
const NO_CACHE_PATTERNS = [
  /^\/auth\//,
  /\/stream$/,
  /\/url$/,
  /\/urls$/,
];

class ApiCacheService {
  /** Get TTL for a given URL path */
  private getTTL(url: string): number {
    for (const { pattern, ttl } of TTL_CONFIG) {
      if (pattern.test(url)) return ttl;
    }
    return DEFAULT_TTL;
  }

  /** Check if a URL should be cached */
  shouldCache(url: string): boolean {
    return !NO_CACHE_PATTERNS.some(pattern => pattern.test(url));
  }

  /**
   * Get a cached response.
   * 
   * When OFFLINE: Always returns cached data regardless of age (never expires).
   * When ONLINE: Returns data with `expired` flag indicating if TTL has passed.
   */
  async get(url: string): Promise<{ data: any; expired: boolean } | null> {
    try {
      const entry = await indexedDBService.getCachedResponse(url);
      if (!entry) return null;

      // When offline, cache NEVER expires - always return the data
      if (!networkService.isOnline()) {
        return { data: entry.response, expired: false };
      }

      // When online, check TTL
      const ttl = this.getTTL(url);
      const age = Date.now() - entry.timestamp;

      return { data: entry.response, expired: age > ttl };
    } catch (err) {
      console.warn('[ApiCache] Failed to read cache:', err);
      return null;
    }
  }

  /** Cache a response */
  async set(url: string, response: any): Promise<void> {
    if (!this.shouldCache(url)) return;

    try {
      await indexedDBService.setCachedResponse({
        url,
        response,
        timestamp: Date.now(),
      });
    } catch (err) {
      console.warn('[ApiCache] Failed to write cache:', err);
    }
  }

  /** 
   * Clear all cached responses.
   * NOTE: This should NOT be called while offline to preserve offline data.
   */
  async clearAll(): Promise<void> {
    if (!networkService.isOnline()) {
      console.warn('[ApiCache] Skipping cache clear while offline');
      return;
    }
    await indexedDBService.clearApiCache();
  }

  /** 
   * Clear cached responses matching a URL prefix.
   * NOTE: This should NOT be called while offline to preserve offline data.
   */
  async clearByPrefix(prefix: string): Promise<void> {
    if (!networkService.isOnline()) {
      console.warn('[ApiCache] Skipping cache clear while offline');
      return;
    }
    await indexedDBService.clearApiCacheByPrefix(prefix);
  }
}

export const apiCacheService = new ApiCacheService();
