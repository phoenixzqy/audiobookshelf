import { create } from 'zustand';
import { downloadService } from '../services/downloadService';
import { indexedDBService } from '../services/indexedDB';
import type { DownloadTask, DownloadProgress } from '../types/download';

interface DownloadStoreState {
  /** Currently active/pending download tasks */
  activeTasks: DownloadTask[];
  /** Map of bookId → downloaded episode indices */
  downloadedBooks: Map<string, number[]>;
  /** Total storage used in bytes */
  storageUsed: number;
  /** Whether the store has been initialized */
  initialized: boolean;

  // Actions
  initialize: () => Promise<void>;
  startDownload: (bookId: string, episodeIndex: number, bookTitle: string, episodeTitle: string, fileName: string) => Promise<string>;
  startBookDownload: (bookId: string, bookTitle: string, episodes: Array<{ index: number; title: string; file: string }>) => Promise<string[]>;
  startRangeDownload: (bookId: string, startEp: number, endEp: number, bookTitle: string, episodes: Array<{ index: number; title: string; file: string }>) => Promise<string[]>;
  cancelDownload: (taskId: string) => Promise<void>;
  deleteDownload: (bookId: string, episodeIndex: number) => Promise<void>;
  deleteBookDownloads: (bookId: string) => Promise<void>;
  isEpisodeDownloaded: (bookId: string, episodeIndex: number) => boolean;
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

    deleteDownload: async (bookId, episodeIndex) => {
      await downloadService.deleteDownload(bookId, episodeIndex);
      await get().refreshDownloads();
    },

    deleteBookDownloads: async (bookId) => {
      await downloadService.deleteBookDownloads(bookId);
      await get().refreshDownloads();
    },

    isEpisodeDownloaded: (bookId, episodeIndex) => {
      const episodes = get().downloadedBooks.get(bookId);
      return episodes?.includes(episodeIndex) ?? false;
    },

    refreshDownloads: async () => {
      try {
        const allDownloads = await indexedDBService.getAllDownloads();
        const bookMap = new Map<string, number[]>();
        let totalSize = 0;

        for (const dl of allDownloads) {
          const existing = bookMap.get(dl.bookId) || [];
          existing.push(dl.episodeIndex);
          bookMap.set(dl.bookId, existing);
          totalSize += dl.fileSize;
        }

        set({ downloadedBooks: bookMap, storageUsed: totalSize });
      } catch (err) {
        console.error('[DownloadStore] Failed to refresh:', err);
      }
    },
  };
});
