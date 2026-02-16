/**
 * Cover Cache Service
 *
 * Caches book cover images as blobs in IndexedDB for offline access.
 */

import { indexedDBService } from './indexedDB';
import { networkService } from './networkService';

class CoverCacheService {
  /** Fetch a cover image, using cache when offline */
  async getCoverUrl(bookId: string, networkUrl: string): Promise<string> {
    // If online, fetch from network and cache
    if (networkService.isOnline()) {
      // Return network URL for display, cache in background
      this.cacheInBackground(bookId, networkUrl);
      return networkUrl;
    }

    // Offline: try to serve from cache
    try {
      const cached = await indexedDBService.getCachedCover(bookId);
      if (cached) {
        return URL.createObjectURL(cached.blob);
      }
    } catch (err) {
      console.warn('[CoverCache] Failed to read cache:', err);
    }

    // No cache available
    return networkUrl;
  }

  /** Get a cached cover blob URL (for offline use) */
  async getCachedBlobUrl(bookId: string): Promise<string | null> {
    try {
      const cached = await indexedDBService.getCachedCover(bookId);
      if (cached) {
        return URL.createObjectURL(cached.blob);
      }
    } catch {
      // Ignore
    }
    return null;
  }

  /** Cache a cover image from a network URL */
  async cacheCover(bookId: string, url: string): Promise<void> {
    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const blob = await response.blob();
      await indexedDBService.setCachedCover({
        bookId,
        blob,
        cachedAt: Date.now(),
      });
    } catch (err) {
      console.warn('[CoverCache] Failed to cache cover:', err);
    }
  }

  /** Clear all cached covers */
  async clearAll(): Promise<void> {
    await indexedDBService.clearCachedCovers();
  }

  private cacheInBackground(bookId: string, url: string) {
    // Don't block — cache asynchronously
    this.cacheCover(bookId, url).catch(() => {});
  }
}

export const coverCacheService = new CoverCacheService();
