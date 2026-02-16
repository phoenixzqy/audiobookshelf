/**
 * API Response Cache Service
 *
 * Caches GET API responses in IndexedDB for offline access.
 * Strategy: network-first when online, cache-only when offline.
 */

import { indexedDBService } from './indexedDB';

/** TTL configuration per endpoint pattern (milliseconds) */
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

  /** Get a cached response if it exists and hasn't expired */
  async get(url: string): Promise<any | null> {
    try {
      const entry = await indexedDBService.getCachedResponse(url);
      if (!entry) return null;

      const ttl = this.getTTL(url);
      const age = Date.now() - entry.timestamp;

      if (age > ttl) {
        // Expired — but still return it for offline use
        // Caller should check isExpired if they care
        return { data: entry.response, expired: true };
      }

      return { data: entry.response, expired: false };
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

  /** Clear all cached responses */
  async clearAll(): Promise<void> {
    await indexedDBService.clearApiCache();
  }

  /** Clear cached responses matching a URL prefix */
  async clearByPrefix(prefix: string): Promise<void> {
    await indexedDBService.clearApiCacheByPrefix(prefix);
  }
}

export const apiCacheService = new ApiCacheService();
