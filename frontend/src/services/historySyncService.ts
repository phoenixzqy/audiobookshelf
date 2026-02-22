/**
 * History Sync Service
 *
 * Handles merging offline history entries when the app comes back online.
 * Listens for network status changes and processes the history queue.
 *
 * Strategy:
 * - Always keep a local copy in IndexedDB 'history' store
 * - When syncing, send local data to server (server handles conflict resolution)
 * - Server returns the authoritative record (may be local or server, whichever is newer)
 * - Update local copy with the authoritative record
 */

import { networkService } from './networkService';
import { indexedDBService, type HistoryQueueEntry } from './indexedDB';
import api from '../api/client';

class HistorySyncService {
  private syncing = false;

  constructor() {
    // Listen for online events to trigger sync
    networkService.subscribe((state) => {
      if (state.status === 'online') {
        this.syncPendingQueue();
      }
    });
  }

  /** Process all unsynced history queue entries */
  async syncPendingQueue(): Promise<void> {
    if (this.syncing || !networkService.isOnline()) return;
    this.syncing = true;

    try {
      const unsyncedEntries = await indexedDBService.getUnsyncedHistoryQueue();
      if (unsyncedEntries.length === 0) {
        this.syncing = false;
        return;
      }

      console.log(`[HistorySync] Processing ${unsyncedEntries.length} queued entries`);

      // Group by bookId and keep only the latest entry per book
      const latestPerBook = this.getLatestPerBook(unsyncedEntries);
      const syncedIds: number[] = [];

      for (const [bookId, entry] of latestPerBook.entries()) {
        try {
          // Send to server - server returns authoritative record (handles conflict resolution)
          const response = await api.post('/history/sync', {
            bookId,
            currentTime: entry.currentTime,
            episodeIndex: entry.episodeIndex,
            playbackRate: entry.playbackRate,
            lastPlayedAt: entry.timestamp,
          });

          // Update local IndexedDB history store with authoritative record from server
          const serverHistory = response.data?.data;
          if (serverHistory) {
            await indexedDBService.saveHistory({
              bookId,
              currentTime: serverHistory.current_time_seconds ?? entry.currentTime,
              episodeIndex: serverHistory.episode_index ?? entry.episodeIndex,
              playbackRate: serverHistory.playback_rate ?? entry.playbackRate,
              lastPlayedAt: serverHistory.last_played_at ?? entry.timestamp,
              syncStatus: 'synced',
            });
          }

          // Mark all entries for this book as synced
          const bookEntries = unsyncedEntries.filter(e => e.bookId === bookId);
          syncedIds.push(...bookEntries.map(e => e.id!).filter(Boolean));
        } catch (err) {
          console.error(`[HistorySync] Failed to sync book ${bookId}:`, err);
          // Don't mark as synced — will retry next time
        }
      }

      // Mark synced entries
      if (syncedIds.length > 0) {
        await indexedDBService.markHistoryQueueSynced(syncedIds);
        // Clean up old synced entries
        await indexedDBService.clearSyncedHistoryQueue();
      }

      console.log(`[HistorySync] Synced ${syncedIds.length} entries`);
    } catch (err) {
      console.error('[HistorySync] Sync failed:', err);
    } finally {
      this.syncing = false;
    }
  }

  /** Get the latest entry per book (latest timestamp wins) */
  private getLatestPerBook(entries: HistoryQueueEntry[]): Map<string, HistoryQueueEntry> {
    const map = new Map<string, HistoryQueueEntry>();
    for (const entry of entries) {
      const existing = map.get(entry.bookId);
      if (!existing || entry.timestamp > existing.timestamp) {
        map.set(entry.bookId, entry);
      }
    }
    return map;
  }

  /**
   * Get the best available history for a book, comparing local and server.
   * Returns the most recent based on lastPlayedAt timestamp.
   * Falls back gracefully when offline (uses local only).
   */
  async getBestHistory(bookId: string): Promise<{
    currentTime: number;
    episodeIndex: number;
    playbackRate: number;
    lastPlayedAt: string;
    source: 'local' | 'server';
  } | null> {
    // Get local history from IndexedDB
    const localHistory = await indexedDBService.getHistory(bookId);

    // If offline, just return local history
    if (!networkService.isOnline()) {
      if (!localHistory) return null;
      return {
        currentTime: localHistory.currentTime,
        episodeIndex: localHistory.episodeIndex,
        playbackRate: localHistory.playbackRate,
        lastPlayedAt: localHistory.lastPlayedAt,
        source: 'local',
      };
    }

    // Fetch server history
    let serverHistory: any = null;
    try {
      const res = await api.get(`/history/book/${bookId}`);
      serverHistory = res.data?.data;
    } catch {
      // Server unreachable - use local
      if (!localHistory) return null;
      return {
        currentTime: localHistory.currentTime,
        episodeIndex: localHistory.episodeIndex,
        playbackRate: localHistory.playbackRate,
        lastPlayedAt: localHistory.lastPlayedAt,
        source: 'local',
      };
    }

    // No history anywhere
    if (!localHistory && !serverHistory) return null;

    // Only server has history
    if (!localHistory && serverHistory) {
      // Cache it locally
      await indexedDBService.saveHistory({
        bookId,
        currentTime: serverHistory.current_time_seconds,
        episodeIndex: serverHistory.episode_index,
        playbackRate: serverHistory.playback_rate ?? 1,
        lastPlayedAt: serverHistory.last_played_at,
        syncStatus: 'synced',
      });
      return {
        currentTime: serverHistory.current_time_seconds,
        episodeIndex: serverHistory.episode_index,
        playbackRate: serverHistory.playback_rate ?? 1,
        lastPlayedAt: serverHistory.last_played_at,
        source: 'server',
      };
    }

    // Only local has history
    if (localHistory && !serverHistory) {
      return {
        currentTime: localHistory.currentTime,
        episodeIndex: localHistory.episodeIndex,
        playbackRate: localHistory.playbackRate,
        lastPlayedAt: localHistory.lastPlayedAt,
        source: 'local',
      };
    }

    // Both have history - compare timestamps
    const localTime = new Date(localHistory!.lastPlayedAt).getTime();
    const serverTime = new Date(serverHistory.last_played_at).getTime();

    if (localTime >= serverTime) {
      return {
        currentTime: localHistory!.currentTime,
        episodeIndex: localHistory!.episodeIndex,
        playbackRate: localHistory!.playbackRate,
        lastPlayedAt: localHistory!.lastPlayedAt,
        source: 'local',
      };
    } else {
      // Server is newer - update local cache
      await indexedDBService.saveHistory({
        bookId,
        currentTime: serverHistory.current_time_seconds,
        episodeIndex: serverHistory.episode_index,
        playbackRate: serverHistory.playback_rate ?? 1,
        lastPlayedAt: serverHistory.last_played_at,
        syncStatus: 'synced',
      });
      return {
        currentTime: serverHistory.current_time_seconds,
        episodeIndex: serverHistory.episode_index,
        playbackRate: serverHistory.playback_rate ?? 1,
        lastPlayedAt: serverHistory.last_played_at,
        source: 'server',
      };
    }
  }
}

// Singleton — initializes on import
export const historySyncService = new HistorySyncService();
