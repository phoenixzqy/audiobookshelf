import { openDB, DBSchema, IDBPDatabase } from 'idb';

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
}

class IndexedDBService {
  private db: IDBPDatabase<AudiobookDB> | null = null;

  async init() {
    this.db = await openDB<AudiobookDB>('audiobook-db', 1, {
      upgrade(db) {
        const historyStore = db.createObjectStore('history', { keyPath: 'bookId' });
        historyStore.createIndex('by-sync-status', 'syncStatus');

        db.createObjectStore('books', { keyPath: 'id' });
        db.createObjectStore('auth');
      },
    });
  }

  async saveHistory(history: AudiobookDB['history']['value']) {
    if (!this.db) await this.init();
    await this.db!.put('history', history);
  }

  async getHistory(bookId: string) {
    if (!this.db) await this.init();
    return await this.db!.get('history', bookId);
  }

  async getAllPendingHistory() {
    if (!this.db) await this.init();
    return await this.db!.getAllFromIndex('history', 'by-sync-status', 'pending');
  }

  async markHistorySynced(bookId: string) {
    const history = await this.getHistory(bookId);
    if (history) {
      history.syncStatus = 'synced';
      await this.saveHistory(history);
    }
  }

  async cacheBook(book: any) {
    if (!this.db) await this.init();
    await this.db!.put('books', book);
  }

  async getBook(bookId: string) {
    if (!this.db) await this.init();
    return await this.db!.get('books', bookId);
  }

  async saveAuth(auth: AudiobookDB['auth']['value']) {
    if (!this.db) await this.init();
    await this.db!.put('auth', auth, 'tokens');
  }

  async getAuth() {
    if (!this.db) await this.init();
    return await this.db!.get('auth', 'tokens');
  }

  async clearAuth() {
    if (!this.db) await this.init();
    await this.db!.delete('auth', 'tokens');
  }
}

export const indexedDBService = new IndexedDBService();
