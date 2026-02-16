import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { DownloadedEpisode, DownloadTask } from '../types/download';

// Types for episode URL caching
export interface CachedEpisodeUrl {
  index: number;
  url: string;
  expiresAt: string;
}

export interface EpisodeUrlBatch {
  bookId: string;
  batchNumber: number;
  batchStart: number;
  batchEnd: number;
  urls: CachedEpisodeUrl[];
  fetchedAt: string;
}

// API response cache entry
export interface ApiCacheEntry {
  url: string;
  response: any;
  timestamp: number;
  etag?: string;
}

// Cached cover image
export interface CachedCover {
  bookId: string;
  blob: Blob;
  cachedAt: number;
}

// Offline history queue entry
export interface HistoryQueueEntry {
  id?: number; // auto-increment
  bookId: string;
  episodeIndex: number;
  currentTime: number;
  playbackRate: number;
  timestamp: string; // ISO
  synced: boolean;
}

interface AudiobookDB extends DBSchema {
  history: {
    key: string;
    value: {
      bookId: string;
      currentTime: number;
      episodeIndex: number;
      playbackRate: number;
      lastPlayedAt: string;
      syncStatus: 'pending' | 'synced';
    };
    indexes: { 'by-sync-status': string };
  };
  books: {
    key: string;
    value: any;
  };
  auth: {
    key: string;
    value: {
      accessToken: string;
      refreshToken: string;
      expiresAt: string;
    };
  };
  'episode-urls': {
    key: [string, number]; // Compound key: [bookId, batchNumber]
    value: EpisodeUrlBatch;
    indexes: { 'by-book-id': string };
  };
  'api-cache': {
    key: string; // URL
    value: ApiCacheEntry;
  };
  'cached-covers': {
    key: string; // bookId
    value: CachedCover;
  };
  'downloads': {
    key: string; // `${bookId}:${episodeIndex}`
    value: DownloadedEpisode;
    indexes: { 'by-book-id': string };
  };
  'download-tasks': {
    key: string; // task ID
    value: DownloadTask;
    indexes: { 'by-book-id': string; 'by-status': string };
  };
  'history-queue': {
    key: number; // auto-increment
    value: HistoryQueueEntry;
    indexes: { 'by-book-id': string; 'by-synced': number };
  };
}

class IndexedDBService {
  private db: IDBPDatabase<AudiobookDB> | null = null;
  private initPromise: Promise<void> | null = null;

  async init() {
    // Prevent multiple simultaneous initializations
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      this.db = await openDB<AudiobookDB>('audiobook-db', 3, {
        upgrade(db, oldVersion) {
          // Version 1: Original stores
          if (oldVersion < 1) {
            const historyStore = db.createObjectStore('history', { keyPath: 'bookId' });
            historyStore.createIndex('by-sync-status', 'syncStatus');

            db.createObjectStore('books', { keyPath: 'id' });
            db.createObjectStore('auth');
          }

          // Version 2: Add episode-urls store
          if (oldVersion < 2) {
            const episodeUrlsStore = db.createObjectStore('episode-urls', { keyPath: ['bookId', 'batchNumber'] });
            episodeUrlsStore.createIndex('by-book-id', 'bookId');
          }

          // Version 3: Offline support stores
          if (oldVersion < 3) {
            db.createObjectStore('api-cache', { keyPath: 'url' });
            db.createObjectStore('cached-covers', { keyPath: 'bookId' });

            const downloadsStore = db.createObjectStore('downloads', { keyPath: 'id' });
            downloadsStore.createIndex('by-book-id', 'bookId');

            const tasksStore = db.createObjectStore('download-tasks', { keyPath: 'id' });
            tasksStore.createIndex('by-book-id', 'bookId');
            tasksStore.createIndex('by-status', 'status');

            const historyQueueStore = db.createObjectStore('history-queue', { keyPath: 'id', autoIncrement: true });
            historyQueueStore.createIndex('by-book-id', 'bookId');
            historyQueueStore.createIndex('by-synced', 'synced');
          }
        },
      });
    })();

    return this.initPromise;
  }

  private async ensureDb(): Promise<IDBPDatabase<AudiobookDB>> {
    if (!this.db) await this.init();
    return this.db!;
  }

  // ============================================
  // History methods (for crash recovery)
  // ============================================

  async saveHistory(history: AudiobookDB['history']['value']) {
    const db = await this.ensureDb();
    await db.put('history', history);
  }

  async getHistory(bookId: string) {
    const db = await this.ensureDb();
    return await db.get('history', bookId);
  }

  async getAllPendingHistory() {
    const db = await this.ensureDb();
    return await db.getAllFromIndex('history', 'by-sync-status', 'pending');
  }

  async markHistorySynced(bookId: string) {
    const history = await this.getHistory(bookId);
    if (history) {
      history.syncStatus = 'synced';
      await this.saveHistory(history);
    }
  }

  // ============================================
  // Book cache methods (DEPRECATED - unused)
  // Kept for IndexedDB schema compatibility only.
  // Do not use these methods - they are not maintained.
  // ============================================

  /**
   * @deprecated Not used - kept for IndexedDB schema compatibility.
   * Books are fetched fresh from API on each load.
   */
  async cacheBook(book: any) {
    const db = await this.ensureDb();
    await db.put('books', book);
  }

  /**
   * @deprecated Not used - kept for IndexedDB schema compatibility.
   * Books are fetched fresh from API on each load.
   */
  async getBook(bookId: string) {
    const db = await this.ensureDb();
    return await db.get('books', bookId);
  }

  // ============================================
  // Auth methods (DEPRECATED - using localStorage instead)
  // Kept for IndexedDB schema compatibility only.
  // Auth is managed by authStore using localStorage.
  // ============================================

  /**
   * @deprecated Not used - auth uses localStorage via authStore.
   * Kept for IndexedDB schema compatibility.
   */
  async saveAuth(auth: AudiobookDB['auth']['value']) {
    const db = await this.ensureDb();
    await db.put('auth', auth, 'tokens');
  }

  /**
   * @deprecated Not used - auth uses localStorage via authStore.
   * Kept for IndexedDB schema compatibility.
   */
  async getAuth() {
    const db = await this.ensureDb();
    return await db.get('auth', 'tokens');
  }

  /**
   * @deprecated Not used - auth uses localStorage via authStore.
   * Kept for IndexedDB schema compatibility.
   */
  async clearAuth() {
    const db = await this.ensureDb();
    await db.delete('auth', 'tokens');
  }

  // ============================================
  // Episode URL cache methods
  // ============================================

  /**
   * Get a cached batch of episode URLs
   */
  async getEpisodeUrlBatch(bookId: string, batchNumber: number): Promise<EpisodeUrlBatch | undefined> {
    const db = await this.ensureDb();
    return await db.get('episode-urls', [bookId, batchNumber]);
  }

  /**
   * Save a batch of episode URLs to cache
   */
  async saveEpisodeUrlBatch(batch: Omit<EpisodeUrlBatch, 'batchNumber'>): Promise<void> {
    const db = await this.ensureDb();
    const batchNumber = Math.floor(batch.batchStart / 100);
    await db.put('episode-urls', {
      ...batch,
      batchNumber,
    });
  }

  /**
   * Clear all cached episode URLs for a specific book
   */
  async clearEpisodeUrlsForBook(bookId: string): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('episode-urls', 'readwrite');
    const index = tx.store.index('by-book-id');

    // Get all keys for this book
    let cursor = await index.openKeyCursor(bookId);
    while (cursor) {
      await tx.store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }

    await tx.done;
  }

  /**
   * Clear all cached episode URLs (useful for logout or storage issues)
   */
  async clearAllEpisodeUrls(): Promise<void> {
    const db = await this.ensureDb();
    await db.clear('episode-urls');
  }

  // ============================================
  // API response cache methods
  // ============================================

  async getCachedResponse(url: string): Promise<ApiCacheEntry | undefined> {
    const db = await this.ensureDb();
    return await db.get('api-cache', url);
  }

  async setCachedResponse(entry: ApiCacheEntry): Promise<void> {
    const db = await this.ensureDb();
    await db.put('api-cache', entry);
  }

  async clearApiCache(): Promise<void> {
    const db = await this.ensureDb();
    await db.clear('api-cache');
  }

  async clearApiCacheByPrefix(prefix: string): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('api-cache', 'readwrite');
    let cursor = await tx.store.openCursor();
    while (cursor) {
      if (cursor.key.startsWith(prefix)) {
        await cursor.delete();
      }
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // ============================================
  // Cover image cache methods
  // ============================================

  async getCachedCover(bookId: string): Promise<CachedCover | undefined> {
    const db = await this.ensureDb();
    return await db.get('cached-covers', bookId);
  }

  async setCachedCover(cover: CachedCover): Promise<void> {
    const db = await this.ensureDb();
    await db.put('cached-covers', cover);
  }

  async clearCachedCovers(): Promise<void> {
    const db = await this.ensureDb();
    await db.clear('cached-covers');
  }

  // ============================================
  // Download metadata methods
  // ============================================

  async getDownload(id: string): Promise<DownloadedEpisode | undefined> {
    const db = await this.ensureDb();
    return await db.get('downloads', id);
  }

  async getDownloadsByBook(bookId: string): Promise<DownloadedEpisode[]> {
    const db = await this.ensureDb();
    return await db.getAllFromIndex('downloads', 'by-book-id', bookId);
  }

  async getAllDownloads(): Promise<DownloadedEpisode[]> {
    const db = await this.ensureDb();
    return await db.getAll('downloads');
  }

  async saveDownload(download: DownloadedEpisode): Promise<void> {
    const db = await this.ensureDb();
    await db.put('downloads', download);
  }

  async deleteDownload(id: string): Promise<void> {
    const db = await this.ensureDb();
    await db.delete('downloads', id);
  }

  async deleteDownloadsByBook(bookId: string): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('downloads', 'readwrite');
    const index = tx.store.index('by-book-id');
    let cursor = await index.openKeyCursor(bookId);
    while (cursor) {
      await tx.store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // ============================================
  // Download task methods
  // ============================================

  async getDownloadTask(id: string): Promise<DownloadTask | undefined> {
    const db = await this.ensureDb();
    return await db.get('download-tasks', id);
  }

  async getDownloadTasksByBook(bookId: string): Promise<DownloadTask[]> {
    const db = await this.ensureDb();
    return await db.getAllFromIndex('download-tasks', 'by-book-id', bookId);
  }

  async getDownloadTasksByStatus(status: string): Promise<DownloadTask[]> {
    const db = await this.ensureDb();
    return await db.getAllFromIndex('download-tasks', 'by-status', status);
  }

  async getAllDownloadTasks(): Promise<DownloadTask[]> {
    const db = await this.ensureDb();
    return await db.getAll('download-tasks');
  }

  async saveDownloadTask(task: DownloadTask): Promise<void> {
    const db = await this.ensureDb();
    await db.put('download-tasks', task);
  }

  async deleteDownloadTask(id: string): Promise<void> {
    const db = await this.ensureDb();
    await db.delete('download-tasks', id);
  }

  async clearCompletedTasks(): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('download-tasks', 'readwrite');
    const index = tx.store.index('by-status');
    for (const status of ['completed', 'failed', 'cancelled']) {
      let cursor = await index.openKeyCursor(status);
      while (cursor) {
        await tx.store.delete(cursor.primaryKey);
        cursor = await cursor.continue();
      }
    }
    await tx.done;
  }

  // ============================================
  // History queue methods (offline sync)
  // ============================================

  async appendHistoryQueue(entry: Omit<HistoryQueueEntry, 'id'>): Promise<void> {
    const db = await this.ensureDb();
    await db.add('history-queue', entry as HistoryQueueEntry);
  }

  async getUnsyncedHistoryQueue(): Promise<HistoryQueueEntry[]> {
    const db = await this.ensureDb();
    // synced is stored as boolean but indexed as number (0/1)
    return await db.getAllFromIndex('history-queue', 'by-synced', 0);
  }

  async markHistoryQueueSynced(ids: number[]): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('history-queue', 'readwrite');
    for (const id of ids) {
      const entry = await tx.store.get(id);
      if (entry) {
        entry.synced = true;
        await tx.store.put(entry);
      }
    }
    await tx.done;
  }

  async clearSyncedHistoryQueue(): Promise<void> {
    const db = await this.ensureDb();
    const tx = db.transaction('history-queue', 'readwrite');
    const index = tx.store.index('by-synced');
    let cursor = await index.openKeyCursor(1);
    while (cursor) {
      await tx.store.delete(cursor.primaryKey);
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

export const indexedDBService = new IndexedDBService();
