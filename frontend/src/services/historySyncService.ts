/**
 * History Sync Service
 *
 * Handles merging offline history entries when the app comes back online.
 * Listens for network status changes and processes the history queue.
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
          await api.post('/history/sync', {
            bookId,
            currentTime: entry.currentTime,
            episodeIndex: entry.episodeIndex,
            playbackRate: entry.playbackRate,
            lastPlayedAt: entry.timestamp,
          });

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
}

// Singleton — initializes on import
export const historySyncService = new HistorySyncService();
