import { create } from 'zustand';
import type { Audiobook, PlaybackHistory } from '../types';
import api from '../api/client';
import { useAuthStore } from './authStore';
import { indexedDBService } from '../services/indexedDB';

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

    // If switching books, sync current history first
    if (currentBookId && currentBookId !== bookId) {
      await get().syncHistory();
    }

    set({ isLoading: true, error: null });

    try {
      // Fetch book and history in parallel
      const [bookRes, historyRes] = await Promise.all([
        api.get(`/books/${bookId}`),
        api.get('/history'),
      ]);

      const book = bookRes.data.data;
      const historyData: PlaybackHistory[] = historyRes.data.data;
      const bookHistory = historyData.find((h: PlaybackHistory) => h.book_id === bookId) || null;

      // Determine episode and time from history
      const episode = bookHistory?.episode_index ?? 0;
      const time = bookHistory?.current_time_seconds ?? 0;

      set({
        bookId,
        book,
        history: bookHistory,
        currentEpisode: episode,
        currentTime: time,
        isLoading: false,
      });

      // Fetch episode URL
      await get().fetchEpisodeUrl(bookId, episode);
    } catch (err: any) {
      set({
        error: err.response?.data?.error || 'Failed to load book',
        isLoading: false,
      });
    }
  },

  // Internal: fetch episode URL
  fetchEpisodeUrl: async (bookId: string, episodeIndex: number) => {
    try {
      const { accessToken } = useAuthStore.getState();
      const response = await api.get(`/books/${bookId}/episodes/${episodeIndex}/url`);
      const { url } = response.data.data;

      // Check if local storage or Azure SAS URL
      if (url.includes('/storage/')) {
        const streamUrl = `/api/books/${bookId}/episodes/${episodeIndex}/stream`;
        set({ audioUrl: `${streamUrl}?token=${accessToken}` });
      } else {
        set({ audioUrl: url });
      }
    } catch (err) {
      console.error('Failed to get episode URL:', err);
    }
  },

  // Set episode (with sync)
  setEpisode: async (index: number) => {
    const { book, bookId, syncHistory } = get();
    if (!book || !bookId || index < 0 || index >= (book.episodes?.length || 0)) return;

    // Sync current position before switching
    await syncHistory();

    set({
      currentEpisode: index,
      currentTime: 0,
      shouldAutoPlay: true,
      history: null, // Clear history so we don't restore position
    });

    // Fetch new episode URL
    await get().fetchEpisodeUrl(bookId, index);
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

  // Sync history via API
  syncHistory: async () => {
    const { bookId, currentEpisode, currentTime } = get();
    if (!bookId) return;

    try {
      await api.post('/history/sync', {
        bookId,
        currentTime: Math.floor(currentTime),
        episodeIndex: currentEpisode,
        playbackRate: 1,
        lastPlayedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to sync history:', err);
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

  // Load most recent book from history for mini player on startup (paused state)
  loadMostRecentFromHistory: async () => {
    // Don't load if already have a book loaded
    if (get().bookId) return;

    try {
      // Fetch recent history
      const historyRes = await api.get('/history');
      const historyData: PlaybackHistory[] = historyRes.data.data;

      if (!historyData || historyData.length === 0) return;

      // Sort by last_played_at to get most recent
      const sorted = [...historyData].sort(
        (a, b) => new Date(b.last_played_at).getTime() - new Date(a.last_played_at).getTime()
      );
      const mostRecent = sorted[0];

      // Fetch the book details
      const bookRes = await api.get(`/books/${mostRecent.book_id}`);
      const book = bookRes.data.data;

      // Set state with shouldAutoPlay = false so it stays paused
      set({
        bookId: mostRecent.book_id,
        book,
        history: mostRecent,
        currentEpisode: mostRecent.episode_index,
        currentTime: mostRecent.current_time_seconds,
        shouldAutoPlay: false, // Don't auto-play on startup
        isLoading: false,
      });

      // Fetch episode URL so it's ready to play
      await get().fetchEpisodeUrl(mostRecent.book_id, mostRecent.episode_index);
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
