/**
 * Download Prefetch Service
 *
 * Automatically downloads upcoming episodes when on WiFi,
 * if the user has already downloaded episodes for a book.
 */

import { networkService } from './networkService';
import { downloadService } from './downloadService';
import { indexedDBService } from './indexedDB';
import { usePlayerStore } from '../stores/playerStore';

const PREFETCH_AHEAD = 3; // Download 3 episodes ahead
let prefetchEnabled = true;

class DownloadPrefetchService {
  private checking = false;

  constructor() {
    // Check on WiFi reconnect
    networkService.subscribe((state) => {
      if (state.connectionMode === 'wifi' && state.status === 'online') {
        this.checkAndPrefetch();
      }
    });
  }

  /** Enable/disable auto-prefetch */
  setEnabled(enabled: boolean) {
    prefetchEnabled = enabled;
  }

  isEnabled(): boolean {
    return prefetchEnabled;
  }

  /** Check if we should prefetch and do it */
  async checkAndPrefetch(): Promise<void> {
    if (!prefetchEnabled || !downloadService.isSupported || this.checking) return;
    if (!networkService.isOnline() || !networkService.isWiFi()) return;

    this.checking = true;

    try {
      const { bookId, book, currentEpisode } = usePlayerStore.getState();
      if (!bookId || !book?.episodes) return;

      // Check if this book has any downloads
      const downloaded = await indexedDBService.getDownloadsByBook(bookId);
      if (downloaded.length === 0) return; // User hasn't downloaded anything for this book

      const totalEpisodes = book.episodes.length;

      // Queue next N episodes that aren't downloaded yet
      for (let i = 1; i <= PREFETCH_AHEAD; i++) {
        const nextEp = currentEpisode + i;
        if (nextEp >= totalEpisodes) break;

        const isDownloaded = await downloadService.isEpisodeDownloaded(bookId, nextEp);
        if (isDownloaded) continue;

        const ep = book.episodes[nextEp];
        if (!ep) continue;

        console.log(`[Prefetch] Auto-downloading episode ${nextEp}: ${ep.title}`);
        await downloadService.downloadEpisode(bookId, nextEp, book.title, ep.title, ep.file);
      }
    } catch (err) {
      console.warn('[Prefetch] Auto-prefetch failed:', err);
    } finally {
      this.checking = false;
    }
  }

  /** Trigger prefetch check (call on episode change) */
  onEpisodeChange() {
    if (prefetchEnabled && networkService.isWiFi()) {
      this.checkAndPrefetch();
    }
  }
}

export const downloadPrefetchService = new DownloadPrefetchService();
