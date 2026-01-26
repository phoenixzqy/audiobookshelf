import {
  createContext,
  useContext,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { usePlayerStore } from '../stores/playerStore';
import { useAuthStore } from '../stores/authStore';
import { RetryManager } from '../utils/retryManager';
import { telemetryService } from '../services/telemetryService';
import { episodeUrlCache } from '../services/episodeUrlCache';
import { getApiBaseUrl } from '../config/appConfig';

interface AudioPlayerContextType {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  skipTime: (seconds: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null);

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isTransitioningRef = useRef(false);

  const { isAuthenticated } = useAuthStore();

  // Use refs for values needed in event handlers to avoid stale closures
  // This is critical for background playback where handlers fire without re-renders
  const bookRef = useRef<typeof book>(null);
  const currentEpisodeRef = useRef(0);
  const bookIdRef = useRef<string | null>(null);

  const {
    audioUrl,
    isPlaying,
    currentEpisode,
    book,
    bookId,
    history,
    shouldAutoPlay,
    sleepTimerMinutes,
    sleepTimerRemaining,
    setPlaying,
    setTime,
    setDuration,
    setShouldAutoPlay,
    setEpisode,
    syncHistory,
    syncHistoryBeacon,
    syncPendingHistory,
    loadMostRecentFromHistory,
    decrementSleepTimer,
  } = usePlayerStore();

  // Keep refs in sync with state
  useEffect(() => {
    bookRef.current = book;
    currentEpisodeRef.current = currentEpisode;
    bookIdRef.current = bookId;
  }, [book, currentEpisode, bookId]);

  // On mount: sync pending history and load most recent for mini player
  useEffect(() => {
    if (!isAuthenticated) return;

    // Sync any pending history first, then load most recent
    syncPendingHistory().then(() => {
      loadMostRecentFromHistory();
    });
  }, [isAuthenticated, syncPendingHistory, loadMostRecentFromHistory]);

  // Play
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setShouldAutoPlay(true);
    audio.play().catch((err) => {
      console.log('Play blocked:', err);
      setPlaying(false);
    });
  }, [setShouldAutoPlay, setPlaying]);

  // Pause (with sync)
  const pause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    await syncHistory();
  }, [syncHistory]);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  // Seek to time
  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setTime(time);
  }, [setTime]);

  // Skip forward/backward
  const skipTime = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Math.max(0, Math.min(audio.currentTime + seconds, audio.duration || 0));
    audio.currentTime = newTime;
    setTime(newTime);
  }, [setTime]);

  // Handle audio element events - use refs to avoid stale closures in background
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);

    // Auto-continue to next episode when current one ends - with retry logic
    // Uses refs to get current values, avoiding stale closure issues in background
    const handleEnded = async () => {
      // Prevent multiple transitions
      if (isTransitioningRef.current) return;

      // Use refs to get current values (not stale closure values)
      const currentBook = bookRef.current;
      const currentEp = currentEpisodeRef.current;
      const currentBookId = bookIdRef.current;

      const nextEpisode = currentEp + 1;
      const hasMoreEpisodes = currentBook && nextEpisode < (currentBook.episodes?.length || 0);

      if (!hasMoreEpisodes) {
        // Last episode - stop playback
        setPlaying(false);
        setShouldAutoPlay(false);
        return;
      }

      isTransitioningRef.current = true;
      setShouldAutoPlay(true);

      // Create retry manager with telemetry callbacks
      const retryManager = new RetryManager({
        maxRetries: 5,
        retryInterval: 2000,
        onRetry: (attempt, error) => {
          console.log(`Episode transition retry ${attempt}/5:`, error.message);
          if (currentBookId) {
            telemetryService.trackEpisodeFetchError(
              currentBookId,
              nextEpisode,
              attempt,
              error,
              'retrying'
            );
          }
        },
      });

      // Execute episode transition with retry
      const result = await retryManager.execute(async () => {
        // Step 1: Switch to next episode (fetches new URL, uses cache if available)
        await setEpisode(nextEpisode);

        // Step 2: Small delay to ensure the new audio URL is loaded
        await new Promise(resolve => setTimeout(resolve, 100));

        // Step 3: Force play after episode change (important for background playback)
        if (audioRef.current && audioRef.current.src) {
          await audioRef.current.play();
        } else {
          throw new Error('Audio element not ready');
        }

        return true;
      });

      // Track outcome
      if (result.success) {
        if (result.attempts > 1 && currentBookId) {
          // Succeeded after retry(s) - log success
          telemetryService.trackRetrySuccess(
            currentBookId,
            nextEpisode,
            result.attempts,
            result.totalDuration
          );
        }
        // If succeeded first try, no telemetry needed (reduce noise)
      } else {
        // All retries exhausted - try cache invalidation as last resort
        console.error('Episode transition failed after all retries:', result.lastError);

        if (currentBookId) {
          // Invalidate cache - URLs might be stale
          console.log('[AudioPlayer] Invalidating cache and attempting final retry');
          await episodeUrlCache.invalidateBook(currentBookId);

          // One more attempt with fresh URLs from API
          try {
            await setEpisode(nextEpisode);
            await new Promise(resolve => setTimeout(resolve, 100));
            if (audioRef.current?.src) {
              await audioRef.current.play();
              console.log('[AudioPlayer] Final retry after cache clear succeeded');
              isTransitioningRef.current = false;
              return; // Success!
            }
          } catch (finalErr) {
            console.error('[AudioPlayer] Final retry after cache clear failed:', finalErr);
          }

          telemetryService.trackRetryExhausted(
            currentBookId,
            nextEpisode,
            result.totalDuration,
            result.lastError!
          );
        }

        setPlaying(false);
      }

      isTransitioningRef.current = false;
    };

    // Handle errors (important for background playback recovery)
    const handleError = (e: Event) => {
      console.error('Audio error:', e);

      // Track media errors in telemetry - use ref for current values
      const currentBookId = bookIdRef.current;
      const currentEp = currentEpisodeRef.current;
      if (currentBookId) {
        const audioElement = e.target as HTMLAudioElement;
        telemetryService.trackMediaError(currentBookId, currentEp, audioElement?.error);
      }

      // Don't stop playing state immediately - let retry logic handle it
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [setTime, setDuration, setPlaying, setShouldAutoPlay, setEpisode]);

  // Handle audio URL changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    audio.src = audioUrl;
    audio.load();
  }, [audioUrl]);

  // Handle loaded metadata - restore position and auto-play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      // Restore position from history if available
      if (history && history.episode_index === currentEpisode && history.current_time_seconds > 0) {
        audio.currentTime = history.current_time_seconds;
      }

      // Auto-play if enabled
      if (shouldAutoPlay) {
        audio.play().catch((err) => {
          console.log('Auto-play blocked:', err);
          setPlaying(false);
        });
      }
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
  }, [history, currentEpisode, shouldAutoPlay, setPlaying]);

  // Periodic history sync (every 30 seconds while playing)
  useEffect(() => {
    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    if (!isPlaying || !bookId) return;

    syncIntervalRef.current = setInterval(() => {
      syncHistory();
    }, 30000);

    return () => {
      if (syncIntervalRef.current) {
        clearInterval(syncIntervalRef.current);
      }
    };
  }, [isPlaying, bookId, syncHistory]);

  // Sleep timer countdown
  useEffect(() => {
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    if (sleepTimerMinutes === null || sleepTimerRemaining <= 0 || !isPlaying) return;

    sleepTimerRef.current = setInterval(() => {
      const finished = decrementSleepTimer();
      if (finished) {
        pause();
      }
    }, 1000);

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [sleepTimerMinutes, sleepTimerRemaining, isPlaying, decrementSleepTimer, pause]);

  // Sync on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      syncHistoryBeacon();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [syncHistoryBeacon]);

  // Sync on visibility change (bidirectional sync for multi-device support)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // App came to foreground - only sync pending history
        // DON'T reload from server if already playing - it would interrupt playback
        syncPendingHistory();
        // Note: We intentionally don't call loadMostRecentFromHistory here
        // because it could interrupt ongoing playback in background
      } else if (document.visibilityState === 'hidden' && isPlaying) {
        // App went to background - sync to server
        syncHistory();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, syncHistory, syncPendingHistory]);

  // Media Session API - enables lock screen controls and helps keep audio alive in background
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    if (!book) return;

    // Set metadata
    navigator.mediaSession.metadata = new MediaMetadata({
      title: book.episodes?.[currentEpisode]?.title || book.title,
      artist: book.author || 'Unknown Author',
      album: book.title,
      artwork: book.cover_url ? [
        { src: `${getApiBaseUrl()}/books/${book.id}/cover`, sizes: '512x512', type: 'image/jpeg' }
      ] : [],
    });

    // Set playback state
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    // Set action handlers
    navigator.mediaSession.setActionHandler('play', () => play());
    navigator.mediaSession.setActionHandler('pause', () => pause());
    navigator.mediaSession.setActionHandler('seekbackward', () => skipTime(-30));
    navigator.mediaSession.setActionHandler('seekforward', () => skipTime(30));

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      if (currentEpisode > 0) {
        setEpisode(currentEpisode - 1);
      }
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (book && currentEpisode < (book.episodes?.length || 0) - 1) {
        setEpisode(currentEpisode + 1);
      }
    });

    // Update position state
    const audio = audioRef.current;
    if (audio && audio.duration && !isNaN(audio.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: audio.currentTime,
        });
      } catch (e) {
        // Position state not supported or invalid values
      }
    }

    return () => {
      // Clean up action handlers
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('seekbackward', null);
      navigator.mediaSession.setActionHandler('seekforward', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
    };
  }, [book, currentEpisode, isPlaying, play, pause, skipTime, setEpisode]);

  return (
    <AudioPlayerContext.Provider
      value={{
        audioRef,
        play,
        pause,
        togglePlay,
        seek,
        skipTime,
      }}
    >
      {/* Global audio element */}
      <audio ref={audioRef} />
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
  }
  return context;
}
