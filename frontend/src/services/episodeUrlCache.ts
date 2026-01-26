/**
 * Episode URL Cache Service
 *
 * This service manages caching of episode URLs to enable background playback.
 * When the browser is in background or phone is locked, HTTP requests may be
 * blocked/throttled. By pre-fetching and caching episode URLs, we can continue
 * playback across episode boundaries without making HTTP requests.
 *
 * Architecture:
 * - Memory cache: Fast access for URLs needed during playback
 * - IndexedDB: Persistent storage that survives page reloads
 *
 * Batch Strategy:
 * - Episodes are fetched in batches of 100
 * - Batch 0: episodes 0-99, Batch 1: episodes 100-199, etc.
 * - When approaching batch boundary (episode 90+), next batch is prefetched
 */

import { indexedDBService, CachedEpisodeUrl } from './indexedDB';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { getApiBaseUrl } from '../config/appConfig';

// In-memory cache for instant access (survives across component renders)
// Key format: `${bookId}:${episodeIndex}`
const memoryCache = new Map<string, CachedEpisodeUrl>();

// Track in-flight prefetch requests to avoid duplicate fetches
const pendingPrefetches = new Map<string, Promise<void>>();

function getMemoryCacheKey(bookId: string, episodeIndex: number): string {
  return `${bookId}:${episodeIndex}`;
}

function getBatchKey(bookId: string, batchNumber: number): string {
  return `${bookId}:batch:${batchNumber}`;
}

function getBatchNumber(episodeIndex: number): number {
  return Math.floor(episodeIndex / 100);
}

/**
 * Convert a URL from the bulk endpoint to a usable audio URL.
 * For local storage URLs (containing /storage/), we need to use the stream endpoint instead.
 * For Azure SAS URLs, we use them directly.
 */
function convertToPlayableUrl(url: string, bookId: string, episodeIndex: number): string {
  // Check if this is a local storage URL (contains /storage/)
  if (url.includes('/storage/')) {
    // Local storage - use the stream endpoint with token auth
    const { accessToken } = useAuthStore.getState();
    const streamUrl = `${getApiBaseUrl()}/books/${bookId}/episodes/${episodeIndex}/stream`;
    return `${streamUrl}?token=${accessToken}`;
  }
  // Azure SAS URL or other external URL - use directly
  return url;
}

export const episodeUrlCache = {
  /**
   * Get episode URL from cache (memory first, then IndexedDB).
   * Returns null if not cached or expired.
   *
   * This method is synchronous-first for memory cache to enable
   * fast access during background playback.
   *
   * Note: URLs are converted at retrieval time to ensure fresh auth tokens
   * and correct base URLs for the current environment.
   */
  async getUrl(bookId: string, episodeIndex: number): Promise<string | null> {
    const key = getMemoryCacheKey(bookId, episodeIndex);

    // Check memory cache first (instant access)
    const memoryCached = memoryCache.get(key);
    if (memoryCached) {
      // Check if still valid (with 5 min buffer for safety)
      const expiryWithBuffer = new Date(memoryCached.expiresAt);
      expiryWithBuffer.setMinutes(expiryWithBuffer.getMinutes() - 5);

      if (expiryWithBuffer > new Date()) {
        console.log(`[EpisodeUrlCache] Memory cache hit for episode ${episodeIndex}`);
        // Convert URL at retrieval time to ensure fresh token and correct base URL
        return convertToPlayableUrl(memoryCached.url, bookId, episodeIndex);
      }

      // Expired - remove from memory
      console.log(`[EpisodeUrlCache] Memory cache expired for episode ${episodeIndex}`);
      memoryCache.delete(key);
    }

    // Check IndexedDB
    try {
      const batchNum = getBatchNumber(episodeIndex);
      const batch = await indexedDBService.getEpisodeUrlBatch(bookId, batchNum);

      if (!batch) {
        console.log(`[EpisodeUrlCache] No IndexedDB batch found for episode ${episodeIndex}`);
        return null;
      }

      const cached = batch.urls.find((u) => u.index === episodeIndex);
      if (!cached) {
        console.log(`[EpisodeUrlCache] Episode ${episodeIndex} not in batch`);
        return null;
      }

      // Check expiry (with 5 min buffer)
      const expiryWithBuffer = new Date(cached.expiresAt);
      expiryWithBuffer.setMinutes(expiryWithBuffer.getMinutes() - 5);

      if (expiryWithBuffer < new Date()) {
        console.log(`[EpisodeUrlCache] IndexedDB cache expired for episode ${episodeIndex}`);
        return null;
      }

      // Populate memory cache for future access
      memoryCache.set(key, cached);
      console.log(`[EpisodeUrlCache] IndexedDB cache hit for episode ${episodeIndex}`);
      // Convert URL at retrieval time to ensure fresh token and correct base URL
      return convertToPlayableUrl(cached.url, bookId, episodeIndex);
    } catch (error) {
      console.error('[EpisodeUrlCache] Error reading from IndexedDB:', error);
      return null;
    }
  },

  /**
   * Prefetch a batch of episode URLs.
   * This should be called when a book is loaded or when approaching batch boundaries.
   *
   * @param bookId - The book ID
   * @param episodeIndex - Any episode index in the desired batch
   * @param force - Force refetch even if cached
   */
  async prefetchBatch(bookId: string, episodeIndex: number, force = false): Promise<void> {
    const batchNum = getBatchNumber(episodeIndex);
    const batchKey = getBatchKey(bookId, batchNum);
    const batchStart = batchNum * 100;

    // Check if already prefetching this batch
    const pendingPromise = pendingPrefetches.get(batchKey);
    if (pendingPromise) {
      console.log(`[EpisodeUrlCache] Already prefetching batch ${batchNum}, waiting...`);
      return pendingPromise;
    }

    // Check if batch already cached and valid (unless force refresh)
    if (!force) {
      try {
        const existing = await indexedDBService.getEpisodeUrlBatch(bookId, batchNum);
        if (existing && existing.urls.length > 0) {
          // Check if first URL is still valid (with 10 min buffer for prefetch)
          const firstExpiry = new Date(existing.urls[0].expiresAt);
          firstExpiry.setMinutes(firstExpiry.getMinutes() - 10);

          if (firstExpiry > new Date()) {
            console.log(`[EpisodeUrlCache] Batch ${batchNum} already cached and valid, populating memory`);
            // Populate memory cache from IndexedDB
            for (const cached of existing.urls) {
              memoryCache.set(getMemoryCacheKey(bookId, cached.index), cached);
            }
            return;
          }
        }
      } catch (error) {
        console.error('[EpisodeUrlCache] Error checking existing batch:', error);
        // Continue with fetch
      }
    }

    // Create prefetch promise
    const prefetchPromise = (async () => {
      try {
        console.log(`[EpisodeUrlCache] Fetching batch ${batchNum} (episodes ${batchStart}+)`);

        const response = await api.get(`/books/${bookId}/episodes/urls`, {
          params: { start: batchStart, count: 100 },
        });

        const { urls, batchStart: start, batchEnd: end } = response.data.data;

        console.log(`[EpisodeUrlCache] Received ${urls.length} URLs for episodes ${start}-${end}`);

        // Store in IndexedDB
        await indexedDBService.saveEpisodeUrlBatch({
          bookId,
          batchStart: start,
          batchEnd: end,
          urls,
          fetchedAt: new Date().toISOString(),
        });

        // Populate memory cache
        for (const cached of urls) {
          memoryCache.set(getMemoryCacheKey(bookId, cached.index), cached);
        }

        console.log(`[EpisodeUrlCache] Batch ${batchNum} cached successfully`);
      } finally {
        // Clean up pending promise
        pendingPrefetches.delete(batchKey);
      }
    })();

    pendingPrefetches.set(batchKey, prefetchPromise);
    return prefetchPromise;
  },

  /**
   * Check if we're approaching a batch boundary and prefetch next batch if needed.
   * Should be called after each episode change.
   *
   * @param bookId - The book ID
   * @param episodeIndex - Current episode index
   * @param totalEpisodes - Total number of episodes in the book
   */
  async prefetchNextBatchIfNeeded(
    bookId: string,
    episodeIndex: number,
    totalEpisodes: number
  ): Promise<void> {
    const batchNum = getBatchNumber(episodeIndex);
    const positionInBatch = episodeIndex % 100;

    // If in last 10 episodes of batch, prefetch next batch
    if (positionInBatch >= 90) {
      const nextBatchStart = (batchNum + 1) * 100;
      if (nextBatchStart < totalEpisodes) {
        console.log(`[EpisodeUrlCache] Approaching batch boundary, prefetching next batch`);
        // Fire and forget - don't block on this
        this.prefetchBatch(bookId, nextBatchStart).catch((err) => {
          console.warn('[EpisodeUrlCache] Failed to prefetch next batch:', err);
        });
      }
    }
  },

  /**
   * Invalidate all cached URLs for a book.
   * Should be called when URLs consistently fail (might be stale).
   */
  async invalidateBook(bookId: string): Promise<void> {
    console.log(`[EpisodeUrlCache] Invalidating cache for book ${bookId}`);

    // Clear memory cache
    for (const key of Array.from(memoryCache.keys())) {
      if (key.startsWith(`${bookId}:`)) {
        memoryCache.delete(key);
      }
    }

    // Clear IndexedDB
    try {
      await indexedDBService.clearEpisodeUrlsForBook(bookId);
    } catch (error) {
      console.error('[EpisodeUrlCache] Error clearing IndexedDB cache:', error);
    }
  },

  /**
   * Clear memory cache only (for testing or forced refresh).
   */
  clearMemoryCache(): void {
    console.log('[EpisodeUrlCache] Clearing memory cache');
    memoryCache.clear();
  },

  /**
   * Clear all caches (memory and IndexedDB).
   * Useful for logout or troubleshooting.
   */
  async clearAll(): Promise<void> {
    console.log('[EpisodeUrlCache] Clearing all caches');
    memoryCache.clear();
    try {
      await indexedDBService.clearAllEpisodeUrls();
    } catch (error) {
      console.error('[EpisodeUrlCache] Error clearing all caches:', error);
    }
  },

  /**
   * Get cache statistics for debugging.
   */
  getStats(): { memoryCacheSize: number; pendingPrefetches: number } {
    return {
      memoryCacheSize: memoryCache.size,
      pendingPrefetches: pendingPrefetches.size,
    };
  },
};
