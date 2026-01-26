import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
      this.db = await openDB<AudiobookDB>('audiobook-db', 2, {
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
}

export const indexedDBService = new IndexedDBService();
