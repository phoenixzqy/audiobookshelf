import { create } from 'zustand';
import type { Audiobook, PlaybackHistory } from '../types';
import api from '../api/client';
import { useAuthStore } from './authStore';
import { indexedDBService } from '../services/indexedDB';
import { episodeUrlCache } from '../services/episodeUrlCache';
import { getApiBaseUrl } from '../config/appConfig';
import { networkService } from '../services/networkService';
import { downloadService } from '../services/downloadService';

// Throttle helper for local saves
let lastLocalSaveTime = 0;
const LOCAL_SAVE_THROTTLE_MS = 5000; // Save locally every 5 seconds

interface PlayerState {
  // Current playback
  bookId: string | null;
  book: Audiobook | null;
  currentEpisode: number;
  audioUrl: string | null;
  history: PlaybackHistory | null;
  /** Whether current audio is playing from local download or streaming */
  audioSource: 'local' | 'stream';

  // Playback state
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  shouldAutoPlay: boolean;

  // Sleep timer
  sleepTimerMinutes: number | null;
  sleepTimerRemaining: number;

  // UI state
  isMinimized: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loadBook: (bookId: string) => Promise<void>;
  fetchEpisodeUrl: (bookId: string, episodeIndex: number) => Promise<void>;
  setEpisode: (index: number) => Promise<void>;
  setPlaying: (playing: boolean) => void;
  setTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setShouldAutoPlay: (autoPlay: boolean) => void;
  setMinimized: (minimized: boolean) => void;
  setAudioUrl: (url: string | null) => void;

  // Sleep timer
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  decrementSleepTimer: () => boolean; // Returns true if timer finished

  // History sync
  syncHistory: () => Promise<void>;
  syncHistoryBeacon: () => void; // For page unload
  syncPendingHistory: () => Promise<void>; // Sync any pending history from IndexedDB
  refreshHistory: () => Promise<boolean>; // Fetch fresh history before resume; returns true if position changed

  // Load most recent from history (for mini player on startup)
  loadMostRecentFromHistory: () => Promise<void>;

  // Clear
  clearPlayer: () => void;
}

export const usePlayerStore = create<PlayerState>()((set, get) => ({
  // Initial state
  bookId: null,
  book: null,
  currentEpisode: 0,
  audioUrl: null,
  history: null,
  audioSource: 'stream' as const,

  isPlaying: false,
  currentTime: 0,
  duration: 0,
  shouldAutoPlay: true,

  sleepTimerMinutes: null,
  sleepTimerRemaining: 0,

  isMinimized: false,
  isLoading: false,
  error: null,

  // Load a book and its history
  loadBook: async (bookId: string) => {
    const currentBookId = get().bookId;
    const currentBook = get().book;

    // If same book is already loaded, skip loading (no spinner flash)
    if (currentBookId === bookId && currentBook) {
      return;
    }

    // If switching books, sync current history first
    if (currentBookId && currentBookId !== bookId) {
      await get().syncHistory();
    }

    set({ isLoading: true, error: null });

    try {
      // Fetch book from API
      const bookRes = await api.get(`/books/${bookId}`);
      const book = bookRes.data.data;

      // Get best available history (compares local vs server, handles offline)
      const { historySyncService } = await import('../services/historySyncService');
      const bestHistory = await historySyncService.getBestHistory(bookId);

      // Determine episode and time from history
      const episode = bestHistory?.episodeIndex ?? 0;
      const time = bestHistory?.currentTime ?? 0;

      set({
        bookId,
        book,
        history: bestHistory ? {
          book_id: bookId,
          episode_index: bestHistory.episodeIndex,
          current_time_seconds: bestHistory.currentTime,
          playback_rate: bestHistory.playbackRate,
          last_played_at: bestHistory.lastPlayedAt,
        } as PlaybackHistory : null,
        currentEpisode: episode,
        currentTime: time,
        isLoading: false,
      });

      // Prefetch episode URLs in background (for seamless episode transitions)
      // This enables background playback without HTTP requests during transitions
      episodeUrlCache.prefetchBatch(bookId, episode).catch((err) => {
        console.warn('Failed to prefetch episode URLs:', err);
      });

      // Fetch episode URL - catch errors during initial load to not block UI
      try {
        await get().fetchEpisodeUrl(bookId, episode);
      } catch (urlErr) {
        console.error('Failed to fetch initial episode URL:', urlErr);
        // Don't fail the whole load - user can try playing later
      }
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to load book',
        isLoading: false,
      });
    }
  },

  // Internal: fetch episode URL - checks local download first, then cache, then API
  // Throws on failure for retry handling in AudioPlayerContext
  fetchEpisodeUrl: async (bookId: string, episodeIndex: number) => {
    const { accessToken } = useAuthStore.getState();

    // Check local download first (instant, no network needed)
    try {
      const localUri = await downloadService.getLocalFileUri(bookId, episodeIndex);
      if (localUri) {
        console.log(`[PlayerStore] Using local file for episode ${episodeIndex}`);
        set({ audioUrl: localUri, audioSource: 'local' });
        return;
      }
    } catch (err) {
      console.warn('[PlayerStore] Local file check failed:', err);
    }

    // Try URL cache (instant access, works in background when HTTP is blocked)
    try {
      const cachedUrl = await episodeUrlCache.getUrl(bookId, episodeIndex);
      if (cachedUrl) {
        console.log(`[PlayerStore] Using cached URL for episode ${episodeIndex}`);
        set({ audioUrl: cachedUrl, audioSource: 'stream' });
        return;
      }
    } catch (cacheErr) {
      console.warn('[PlayerStore] Cache lookup failed, falling back to API:', cacheErr);
    }

    // Cache miss or error - fetch from API
    console.log(`[PlayerStore] Fetching episode ${episodeIndex} URL from API`);
    const response = await api.get(`/books/${bookId}/episodes/${episodeIndex}/url`);
    const { url } = response.data.data;

    if (!url) {
      throw new Error('Episode URL is empty or invalid');
    }

    // Check if local storage or Azure SAS URL
    let finalUrl: string;
    if (url.includes('/storage/')) {
      const streamUrl = `${getApiBaseUrl()}/books/${bookId}/episodes/${episodeIndex}/stream`;
      finalUrl = `${streamUrl}?token=${accessToken}`;
    } else {
      finalUrl = url;
    }

    set({ audioUrl: finalUrl, audioSource: 'stream' });
  },

  // Set episode (with sync) - throws on failure for retry handling
  setEpisode: async (index: number) => {
    const { book, bookId, syncHistory } = get();
    if (!book || !bookId) {
      throw new Error('No book loaded');
    }
    if (index < 0 || index >= (book.episodes?.length || 0)) {
      throw new Error('Invalid episode index');
    }

    // Sync current position before switching
    await syncHistory();

    set({
      currentEpisode: index,
      currentTime: 0,
      shouldAutoPlay: true,
      history: null, // Clear history so we don't restore position
    });

    // Fetch new episode URL - will throw on failure
    await get().fetchEpisodeUrl(bookId, index);

    // Prefetch next batch if approaching batch boundary
    const totalEpisodes = book.episodes?.length || 0;
    episodeUrlCache.prefetchNextBatchIfNeeded(bookId, index, totalEpisodes);
  },

  setPlaying: (playing: boolean) => set({ isPlaying: playing }),
  setTime: (time: number) => {
    set({ currentTime: time });
    
    // Throttled local save to IndexedDB for crash recovery
    const now = Date.now();
    if (now - lastLocalSaveTime >= LOCAL_SAVE_THROTTLE_MS) {
      lastLocalSaveTime = now;
      const { bookId, currentEpisode } = get();
      if (bookId && time > 0) {
        indexedDBService.saveHistory({
          bookId,
          currentTime: Math.floor(time),
          episodeIndex: currentEpisode,
          playbackRate: 1,
          lastPlayedAt: new Date().toISOString(),
          syncStatus: 'pending',
        }).catch(console.error);
      }
    }
  },
  setDuration: (duration: number) => set({ duration }),
  setShouldAutoPlay: (autoPlay: boolean) => set({ shouldAutoPlay: autoPlay }),
  setMinimized: (minimized: boolean) => set({ isMinimized: minimized }),
  setAudioUrl: (url: string | null) => set({ audioUrl: url }),

  // Sleep timer
  setSleepTimer: (minutes: number) => {
    set({
      sleepTimerMinutes: minutes,
      sleepTimerRemaining: minutes * 60,
    });
  },

  cancelSleepTimer: () => {
    set({
      sleepTimerMinutes: null,
      sleepTimerRemaining: 0,
    });
  },

  decrementSleepTimer: () => {
    const { sleepTimerRemaining } = get();
    if (sleepTimerRemaining <= 1) {
      set({
        sleepTimerMinutes: null,
        sleepTimerRemaining: 0,
      });
      return true; // Timer finished
    }
    set({ sleepTimerRemaining: sleepTimerRemaining - 1 });
    return false;
  },

  // Sync history via API (queues to IndexedDB when offline)
  syncHistory: async () => {
    const { bookId, currentEpisode, currentTime } = get();
    if (!bookId) return;

    const now = new Date().toISOString();
    const historyEntry = {
      bookId,
      currentTime: Math.floor(currentTime),
      episodeIndex: currentEpisode,
      playbackRate: 1,
      lastPlayedAt: now,
    };

    // Always save to local history store (for offline access and comparison)
    indexedDBService.saveHistory({
      bookId,
      currentTime: Math.floor(currentTime),
      episodeIndex: currentEpisode,
      playbackRate: 1,
      lastPlayedAt: now,
      syncStatus: networkService.isOnline() ? 'synced' : 'pending',
    }).catch(() => {});

    // Always save to local queue for crash recovery and sync tracking
    indexedDBService.appendHistoryQueue({
      bookId,
      episodeIndex: currentEpisode,
      currentTime: Math.floor(currentTime),
      playbackRate: 1,
      timestamp: now,
      synced: false,
    }).catch(() => {});

    // If online, sync to server immediately
    if (networkService.isOnline()) {
      try {
        const response = await api.post('/history/sync', historyEntry);
        // Update local with server's authoritative response
        const serverHistory = response.data?.data;
        if (serverHistory) {
          indexedDBService.saveHistory({
            bookId,
            currentTime: serverHistory.current_time_seconds,
            episodeIndex: serverHistory.episode_index,
            playbackRate: serverHistory.playback_rate ?? 1,
            lastPlayedAt: serverHistory.last_played_at,
            syncStatus: 'synced',
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Failed to sync history:', err);
        // Mark as pending since sync failed
        indexedDBService.saveHistory({
          bookId,
          currentTime: Math.floor(currentTime),
          episodeIndex: currentEpisode,
          playbackRate: 1,
          lastPlayedAt: now,
          syncStatus: 'pending',
        }).catch(() => {});
      }
    }
  },

  // Sync history via sendBeacon (for page unload)
  syncHistoryBeacon: () => {
    const { bookId, currentEpisode, currentTime } = get();
    if (!bookId || currentTime <= 0) return;

    const { accessToken } = useAuthStore.getState();
    const payload = JSON.stringify({
      bookId,
      currentTime: Math.floor(currentTime),
      episodeIndex: currentEpisode,
      playbackRate: 1,
      lastPlayedAt: new Date().toISOString(),
    });

    // Always save to IndexedDB first (synchronous-ish, more reliable)
    // This ensures we have a local backup even if sendBeacon fails
    indexedDBService.saveHistory({
      bookId,
      currentTime: Math.floor(currentTime),
      episodeIndex: currentEpisode,
      playbackRate: 1,
      lastPlayedAt: new Date().toISOString(),
      syncStatus: 'pending',
    }).catch(() => {
      // Ignore errors during unload
    });

    // Use sendBeacon for reliable delivery on page close
    // Note: sendBeacon doesn't support custom headers, so we use query param
    const url = `/api/history/sync?token=${accessToken}`;
    const sent = navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
    
    // If sendBeacon succeeded, mark as synced in IndexedDB
    if (sent) {
      indexedDBService.markHistorySynced(bookId).catch(() => {});
    }
  },

  // Sync any pending history from IndexedDB (call on app startup)
  syncPendingHistory: async () => {
    try {
      const pendingHistory = await indexedDBService.getAllPendingHistory();
      for (const history of pendingHistory) {
        try {
          await api.post('/history/sync', {
            bookId: history.bookId,
            currentTime: history.currentTime,
            episodeIndex: history.episodeIndex,
            playbackRate: history.playbackRate,
            lastPlayedAt: history.lastPlayedAt,
          });
          await indexedDBService.markHistorySynced(history.bookId);
        } catch (err) {
          console.error('Failed to sync pending history for book:', history.bookId, err);
        }
      }
    } catch (err) {
      console.error('Failed to get pending history:', err);
    }
  },

  // Fetch fresh history for the current book from server before manual resume.
  // Fixes multi-device stale position: if another device played further,
  // we pick up the newer position before starting playback.
  refreshHistory: async () => {
    const { bookId, currentEpisode, currentTime } = get();
    if (!bookId) return false;

    try {
      const res = await api.get(`/history/book/${bookId}`);
      const serverHistory: PlaybackHistory | null = res.data.data;
      if (!serverHistory) return false;

      const episodeChanged = serverHistory.episode_index !== currentEpisode;
      const timeChanged = Math.abs(serverHistory.current_time_seconds - currentTime) > 2;

      if (!episodeChanged && !timeChanged) return false;

      set({
        history: serverHistory,
        currentEpisode: serverHistory.episode_index,
        currentTime: serverHistory.current_time_seconds,
      });

      // If episode changed, fetch the new episode URL
      if (episodeChanged) {
        await get().fetchEpisodeUrl(bookId, serverHistory.episode_index);
      }

      return true;
    } catch (err) {
      console.error('Failed to refresh history:', err);
      return false;
    }
  },

  // Load most recent book from history for mini player on startup (paused state)
  loadMostRecentFromHistory: async () => {
    // Don't load if already have a book loaded
    if (get().bookId) return;

    try {
      // Use optimized endpoint that returns most recent history with book details in one call
      const response = await api.get('/history/most-recent');
      const result = response.data.data;

      if (!result) return;

      const { history, book } = result;

      // Set state with shouldAutoPlay = false so it stays paused
      set({
        bookId: history.book_id,
        book,
        history,
        currentEpisode: history.episode_index,
        currentTime: history.current_time_seconds,
        shouldAutoPlay: false, // Don't auto-play on startup
        isLoading: false,
      });

      // Prefetch episode URLs in background
      episodeUrlCache.prefetchBatch(history.book_id, history.episode_index).catch((err) => {
        console.warn('Failed to prefetch episode URLs:', err);
      });

      // Fetch episode URL so it's ready to play - catch errors to not block startup
      try {
        await get().fetchEpisodeUrl(history.book_id, history.episode_index);
      } catch (urlErr) {
        console.error('Failed to fetch episode URL for recent history:', urlErr);
      }
    } catch (err) {
      console.error('Failed to load most recent history:', err);
    }
  },

  clearPlayer: () => {
    set({
      bookId: null,
      book: null,
      currentEpisode: 0,
      audioUrl: null,
      history: null,
      audioSource: 'stream',
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      shouldAutoPlay: true,
      sleepTimerMinutes: null,
      sleepTimerRemaining: 0,
      isMinimized: false,
      isLoading: false,
      error: null,
    });
  },
}));
