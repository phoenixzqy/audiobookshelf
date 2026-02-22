import { create } from 'zustand';
import { downloadService } from '../services/downloadService';
import { indexedDBService } from '../services/indexedDB';
import { networkService } from '../services/networkService';
import { apiCacheService } from '../services/apiCacheService';
import api from '../api/client';
import type { DownloadTask, DownloadProgress } from '../types/download';

/** Book download info with title and episodes */
export interface BookDownloadInfo {
  bookTitle: string;
  episodes: number[];
}

interface DownloadStoreState {
  /** Currently active/pending download tasks */
  activeTasks: DownloadTask[];
  /** Map of bookId → download info (title + episode indices) */
  downloadedBooks: Map<string, BookDownloadInfo>;
  /** Total storage used in bytes */
  storageUsed: number;
  /** Whether the store has been initialized */
  initialized: boolean;
  /** Whether all downloads are paused */
  isPaused: boolean;
  /** Set of paused book IDs */
  pausedBookIds: Set<string>;

  // Actions
  initialize: () => Promise<void>;
  startDownload: (bookId: string, episodeIndex: number, bookTitle: string, episodeTitle: string, fileName: string) => Promise<string>;
  startBookDownload: (bookId: string, bookTitle: string, episodes: Array<{ index: number; title: string; file: string }>) => Promise<string[]>;
  startRangeDownload: (bookId: string, startEp: number, endEp: number, bookTitle: string, episodes: Array<{ index: number; title: string; file: string }>) => Promise<string[]>;
  cancelDownload: (taskId: string) => Promise<void>;
  cancelBookDownloads: (bookId: string) => Promise<void>;
  deleteDownload: (bookId: string, episodeIndex: number) => Promise<void>;
  deleteBookDownloads: (bookId: string) => Promise<void>;
  isEpisodeDownloaded: (bookId: string, episodeIndex: number) => boolean;
  pauseAll: () => void;
  resumeAll: () => void;
  pauseBook: (bookId: string) => void;
  resumeBook: (bookId: string) => void;
  refreshDownloads: () => Promise<void>;
}

export const useDownloadStore = create<DownloadStoreState>()((set, get) => {
  // Subscribe to download service events
  downloadService.onTaskChange(async (task) => {
    const { activeTasks } = get();
    const idx = activeTasks.findIndex(t => t.id === task.id);

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      // Remove from active, refresh downloaded list
      set({ activeTasks: activeTasks.filter(t => t.id !== task.id) });
      if (task.status === 'completed') {
        // Refresh downloaded books map
        get().refreshDownloads();
      }
    } else if (idx >= 0) {
      // Update existing task
      const updated = [...activeTasks];
      updated[idx] = task;
      set({ activeTasks: updated });
    } else {
      // Add new task
      set({ activeTasks: [...activeTasks, task] });
    }
  });

  downloadService.onProgress((progress: DownloadProgress) => {
    const { activeTasks } = get();
    const idx = activeTasks.findIndex(t => t.id === progress.taskId);
    if (idx >= 0) {
      const updated = [...activeTasks];
      updated[idx] = {
        ...updated[idx],
        progress: progress.progress,
        bytesDownloaded: progress.bytesDownloaded,
        totalBytes: progress.totalBytes,
      };
      set({ activeTasks: updated });
    }
  });

  return {
    activeTasks: [],
    downloadedBooks: new Map(),
    storageUsed: 0,
    initialized: false,
    isPaused: false,
    pausedBookIds: new Set(),

    initialize: async () => {
      if (get().initialized) return;
      await get().refreshDownloads();
      set({ initialized: true });
    },

    startDownload: async (bookId, episodeIndex, bookTitle, episodeTitle, fileName) => {
      return downloadService.downloadEpisode(bookId, episodeIndex, bookTitle, episodeTitle, fileName);
    },

    startBookDownload: async (bookId, bookTitle, episodes) => {
      return downloadService.downloadBook(bookId, bookTitle, episodes);
    },

    startRangeDownload: async (bookId, startEp, endEp, bookTitle, episodes) => {
      return downloadService.downloadEpisodeRange(bookId, startEp, endEp, bookTitle, episodes);
    },

    cancelDownload: async (taskId) => {
      await downloadService.cancelDownload(taskId);
    },

    cancelBookDownloads: async (bookId) => {
      await downloadService.cancelBookDownloads(bookId);
    },

    deleteDownload: async (bookId, episodeIndex) => {
      await downloadService.deleteDownload(bookId, episodeIndex);
      await get().refreshDownloads();
    },

    deleteBookDownloads: async (bookId) => {
      await downloadService.deleteBookDownloads(bookId);
      await get().refreshDownloads();
    },

    isEpisodeDownloaded: (bookId, episodeIndex) => {
      const info = get().downloadedBooks.get(bookId);
      return info?.episodes?.includes(episodeIndex) ?? false;
    },

    pauseAll: () => {
      downloadService.pauseAll();
      set({ isPaused: true });
    },

    resumeAll: () => {
      downloadService.resumeAll();
      set({ isPaused: false, pausedBookIds: new Set() });
    },

    pauseBook: (bookId) => {
      downloadService.pauseBook(bookId);
      const paused = new Set(get().pausedBookIds);
      paused.add(bookId);
      set({ pausedBookIds: paused });
    },

    resumeBook: (bookId) => {
      downloadService.resumeBook(bookId);
      const paused = new Set(get().pausedBookIds);
      paused.delete(bookId);
      set({ pausedBookIds: paused });
    },

    refreshDownloads: async () => {
      try {
        const allDownloads = await indexedDBService.getAllDownloads();
        const bookMap = new Map<string, BookDownloadInfo>();
        let totalSize = 0;

        // Collect book IDs that need title lookup
        const booksNeedingTitle = new Set<string>();

        for (const dl of allDownloads) {
          const existing = bookMap.get(dl.bookId) || { bookTitle: dl.bookTitle || '', episodes: [] };
          existing.episodes.push(dl.episodeIndex);
          // Use the most recent bookTitle if available
          if (dl.bookTitle) {
            existing.bookTitle = dl.bookTitle;
          } else {
            booksNeedingTitle.add(dl.bookId);
          }
          bookMap.set(dl.bookId, existing);
          totalSize += dl.fileSize;
        }

        // Try to get missing book titles from cache first, then API
        if (booksNeedingTitle.size > 0) {
          for (const bookId of booksNeedingTitle) {
            let bookTitle: string | null = null;

            // 1. Try API cache first (already loaded from home/history page)
            try {
              const cached = await apiCacheService.get(`/books/${bookId}`);
              if (cached?.data?.data?.title) {
                bookTitle = cached.data.data.title;
              }
            } catch {
              // Cache read failed, continue to API
            }

            // 2. If not in cache and online, fetch from API
            if (!bookTitle && networkService.isOnline()) {
              try {
                const res = await api.get(`/books/${bookId}`);
                bookTitle = res.data?.data?.title || null;
              } catch {
                // API call failed, will use fallback
              }
            }

            // Update if we got a title
            if (bookTitle) {
              const info = bookMap.get(bookId);
              if (info) {
                info.bookTitle = bookTitle;
              }
              // Persist to IndexedDB so we don't need to look up again
              const bookDownloads = allDownloads.filter(d => d.bookId === bookId);
              for (const dl of bookDownloads) {
                await indexedDBService.saveDownload({ ...dl, bookTitle });
              }
            }
          }
        }

        // Set fallback titles for any remaining books without titles
        for (const [bookId, info] of bookMap.entries()) {
          if (!info.bookTitle) {
            info.bookTitle = `Book ${bookId.slice(0, 8)}...`;
          }
        }

        set({ downloadedBooks: bookMap, storageUsed: totalSize });
      } catch (err) {
        console.error('[DownloadStore] Failed to refresh:', err);
      }
    },
  };
});
