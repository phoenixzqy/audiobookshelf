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
import { mediaControlsPlugin } from '../capacitor/mediaControlsPlugin';

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
    refreshHistory,
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

  // Play — start playback immediately (preserves user gesture context on mobile),
  // then sync history in background for multi-device support.
  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setShouldAutoPlay(true);

    // Start playback immediately within the user gesture context.
    // On mobile WebViews, async operations (like network calls) before play()
    // lose the user interaction, causing autoplay to be blocked by the browser.
    if (audio.src) {
      audio.play().catch((err) => {
        console.log('Play blocked:', err);
        setPlaying(false);
      });
    }
    // If audio isn't loaded yet, shouldAutoPlay=true ensures
    // handleLoadedMetadata will auto-play when the audio loads.

    // Background: sync history for multi-device support.
    // If another device played further ahead, adjust position while playing.
    refreshHistory().then((positionChanged) => {
      if (!positionChanged) return;
      const currentAudio = audioRef.current;
      if (!currentAudio) return;

      const state = usePlayerStore.getState();
      // If only position changed (same episode), seek while playing
      if (currentAudio.src && !currentAudio.paused) {
        currentAudio.currentTime = state.currentTime;
      }
      // If episode changed, fetchEpisodeUrl was already called in refreshHistory,
      // which updates audioUrl → audioUrl effect loads new src →
      // handleLoadedMetadata auto-plays since shouldAutoPlay is true.
    }).catch(() => {});
  }, [setShouldAutoPlay, setPlaying, refreshHistory]);

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

      console.log('[AudioPlayer] Episode ended:', {
        bookId: currentBookId,
        currentEpisode: currentEp,
        nextEpisode,
        hasMoreEpisodes,
        totalEpisodes: currentBook?.episodes?.length,
        previousUrl: audio.src,
        timestamp: new Date().toISOString(),
      });

      if (!hasMoreEpisodes) {
        // Last episode - stop playback
        console.log('[AudioPlayer] Last episode reached - stopping playback');
        setPlaying(false);
        setShouldAutoPlay(false);
        return;
      }

      isTransitioningRef.current = true;
      setShouldAutoPlay(true);

      const transitionStartTime = Date.now();

      // Track if we've already invalidated cache during retries
      let cacheInvalidated = false;

      // Create retry manager with telemetry callbacks
      const retryManager = new RetryManager({
        maxRetries: 5,
        retryInterval: 2000,
        onRetry: async (attempt, error) => {
          console.log(`[AudioPlayer] Episode transition retry ${attempt}/5:`, {
            error: error.message,
            bookId: currentBookId,
            fromEpisode: currentEp,
            toEpisode: nextEpisode,
            cacheInvalidated,
            elapsedMs: Date.now() - transitionStartTime,
          });
          if (currentBookId) {
            telemetryService.trackEpisodeFetchError(
              currentBookId,
              nextEpisode,
              attempt,
              error,
              'retrying'
            );

            // After 2 failed retries, invalidate cache - URLs might be stale/expired
            // This catches the common case where SAS URLs have expired
            if (attempt >= 2 && !cacheInvalidated) {
              console.log('[AudioPlayer] Multiple retries failed - invalidating cache for book:', currentBookId);
              await episodeUrlCache.invalidateBook(currentBookId);
              cacheInvalidated = true;
            }
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
          console.log('[AudioPlayer] Attempting to play new episode:', {
            newUrl: audioRef.current.src,
            readyState: audioRef.current.readyState,
          });
          await audioRef.current.play();
        } else {
          throw new Error('Audio element not ready');
        }

        return true;
      });

      const transitionDuration = Date.now() - transitionStartTime;

      // Track outcome
      if (result.success) {
        console.log('[AudioPlayer] Episode transition succeeded:', {
          fromEpisode: currentEp,
          toEpisode: nextEpisode,
          attempts: result.attempts,
          duration: transitionDuration,
          newUrl: audioRef.current?.src,
        });
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
        // All retries exhausted
        console.error('[AudioPlayer] Episode transition failed after all retries:', {
          fromEpisode: currentEp,
          toEpisode: nextEpisode,
          attempts: result.attempts,
          duration: transitionDuration,
          lastError: result.lastError?.message,
          cacheInvalidated,
        });

        if (currentBookId) {
          // Try one more time with fresh URLs if we haven't invalidated yet
          if (!cacheInvalidated) {
            console.log('[AudioPlayer] Invalidating cache and attempting final retry');
            await episodeUrlCache.invalidateBook(currentBookId);

            try {
              await setEpisode(nextEpisode);
              await new Promise(resolve => setTimeout(resolve, 100));
              if (audioRef.current?.src) {
                await audioRef.current.play();
                console.log('[AudioPlayer] Final retry after cache clear succeeded:', {
                  newUrl: audioRef.current.src,
                  totalDuration: Date.now() - transitionStartTime,
                });
                isTransitioningRef.current = false;
                return; // Success!
              }
            } catch (finalErr) {
              console.error('[AudioPlayer] Final retry after cache clear failed:', {
                error: finalErr instanceof Error ? finalErr.message : String(finalErr),
              });
            }
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
    // This handles MEDIA_ELEMENT_ERROR (code 4) - format errors, network issues, etc.
    const handleError = async (e: Event) => {
      const audioElement = e.target as HTMLAudioElement;
      const error = audioElement?.error;

      // Detailed error logging for debugging
      const errorDetails = {
        // Error info
        errorCode: error?.code,
        errorMessage: error?.message,
        // Audio element state
        audioSrc: audioElement?.src, // Full URL for debugging
        readyState: audioElement?.readyState,
        readyStateLabel: ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA'][audioElement?.readyState ?? 0],
        networkState: audioElement?.networkState,
        networkStateLabel: ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE'][audioElement?.networkState ?? 0],
        currentTime: audioElement?.currentTime,
        duration: audioElement?.duration,
        paused: audioElement?.paused,
        ended: audioElement?.ended,
        // Context
        bookId: bookIdRef.current,
        episodeIndex: currentEpisodeRef.current,
        isTransitioning: isTransitioningRef.current,
        timestamp: new Date().toISOString(),
      };

      console.error('[AudioPlayer] Audio error occurred:', errorDetails);

      // Track media errors in telemetry with full context
      const currentBookId = bookIdRef.current;
      const currentEp = currentEpisodeRef.current;
      if (currentBookId) {
        telemetryService.trackMediaError(currentBookId, currentEp, error, audioElement);
      }

      // Don't retry if we're already transitioning (handleEnded is handling it)
      if (isTransitioningRef.current) {
        console.log('[AudioPlayer] Error during transition - letting handleEnded manage retry');
        return;
      }

      // Attempt recovery for media errors (code 4 = format/decode error, code 2 = network)
      if (error && (error.code === 4 || error.code === 2) && currentBookId) {
        console.log('[AudioPlayer] Attempting error recovery...', {
          errorCode: error.code,
          originalUrl: audioElement?.src,
        });

        const recoveryStartTime = Date.now();
        const originalUrl = audioElement?.src || '';
        const originalError = { code: error.code, message: error.message };

        // Step 1: Invalidate cache (URL might be stale or expired)
        await episodeUrlCache.invalidateBook(currentBookId);
        console.log('[AudioPlayer] Cache invalidated for book:', currentBookId);

        // Step 2: Try to re-fetch the episode URL and reload
        const retryManager = new RetryManager({
          maxRetries: 3,
          retryInterval: 1500,
          onRetry: (attempt, err) => {
            console.log(`[AudioPlayer] Error recovery retry ${attempt}/3:`, {
              error: err.message,
              bookId: currentBookId,
              episodeIndex: currentEp,
            });
            telemetryService.trackEpisodeFetchError(
              currentBookId,
              currentEp,
              attempt,
              err,
              'retrying'
            );
          },
        });

        const wasPlaying = usePlayerStore.getState().isPlaying;
        const result = await retryManager.execute(async () => {
          // Re-fetch episode URL from API (cache was invalidated)
          await usePlayerStore.getState().fetchEpisodeUrl(currentBookId, currentEp);

          // Small delay to let new URL load
          await new Promise(resolve => setTimeout(resolve, 200));

          // Try to play if we were playing before
          if (wasPlaying && audioRef.current?.src) {
            console.log('[AudioPlayer] New URL loaded, attempting playback:', {
              newUrl: audioRef.current.src,
              previousUrl: originalUrl,
            });
            await audioRef.current.play();
          }

          return true;
        });

        const recoveryDuration = Date.now() - recoveryStartTime;

        if (result.success) {
          console.log('[AudioPlayer] Error recovery succeeded:', {
            attempts: result.attempts,
            duration: recoveryDuration,
            newUrl: audioRef.current?.src,
          });
          telemetryService.trackErrorRecovery(
            currentBookId,
            currentEp,
            originalError,
            originalUrl,
            'success',
            result.attempts,
            recoveryDuration
          );
        } else {
          console.error('[AudioPlayer] Error recovery failed:', {
            attempts: result.attempts,
            duration: recoveryDuration,
            lastError: result.lastError?.message,
            originalUrl,
          });
          telemetryService.trackErrorRecovery(
            currentBookId,
            currentEp,
            originalError,
            originalUrl,
            'failure',
            result.attempts,
            recoveryDuration
          );
          setPlaying(false);
        }
      }
    };

    // Handle stalled event - network issues during playback
    // This fires when the browser is trying to fetch media data but data isn't forthcoming
    let stalledRecoveryInProgress = false;
    const handleStalled = async () => {
      // Avoid duplicate recovery attempts
      if (stalledRecoveryInProgress || isTransitioningRef.current) return;

      const currentBookId = bookIdRef.current;
      const currentEp = currentEpisodeRef.current;
      const wasPlaying = usePlayerStore.getState().isPlaying;

      // Only attempt recovery if we were actively playing
      if (!wasPlaying || !currentBookId) return;

      const stalledStartTime = Date.now();
      const originalUrl = audio.src;

      console.log('[AudioPlayer] Stalled event detected:', {
        bookId: currentBookId,
        episodeIndex: currentEp,
        audioUrl: originalUrl,
        readyState: audio.readyState,
        networkState: audio.networkState,
        currentTime: audio.currentTime,
        buffered: audio.buffered.length > 0
          ? `${audio.buffered.start(0).toFixed(2)}-${audio.buffered.end(audio.buffered.length - 1).toFixed(2)}`
          : 'none',
        timestamp: new Date().toISOString(),
      });

      stalledRecoveryInProgress = true;

      // Wait a moment to see if it resolves naturally
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if still stalled (no progress made)
      if (audio.readyState < 3) { // HAVE_FUTURE_DATA = 3
        console.log('[AudioPlayer] Still stalled after 3s - refreshing URL:', {
          readyState: audio.readyState,
          networkState: audio.networkState,
        });

        // Invalidate cache and get fresh URL
        await episodeUrlCache.invalidateBook(currentBookId);

        try {
          const currentTime = audio.currentTime;
          await usePlayerStore.getState().fetchEpisodeUrl(currentBookId, currentEp);

          // Small delay for new URL to load
          await new Promise(resolve => setTimeout(resolve, 200));

          // Restore position and play
          if (audioRef.current) {
            audioRef.current.currentTime = currentTime;
            await audioRef.current.play();

            const recoveryDuration = Date.now() - stalledStartTime;
            console.log('[AudioPlayer] Stalled recovery succeeded:', {
              duration: recoveryDuration,
              newUrl: audioRef.current.src,
              restoredTime: currentTime,
            });
            telemetryService.trackStalledRecovery(
              currentBookId,
              currentEp,
              audioRef.current,
              'success',
              recoveryDuration
            );
          }
        } catch (err) {
          const recoveryDuration = Date.now() - stalledStartTime;
          console.error('[AudioPlayer] Stalled recovery failed:', {
            error: err instanceof Error ? err.message : String(err),
            duration: recoveryDuration,
            originalUrl,
          });
          telemetryService.trackStalledRecovery(
            currentBookId,
            currentEp,
            audio,
            'failure',
            recoveryDuration
          );
        }
      } else {
        console.log('[AudioPlayer] Stalled resolved naturally:', {
          readyState: audio.readyState,
          duration: Date.now() - stalledStartTime,
        });
      }

      stalledRecoveryInProgress = false;
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('stalled', handleStalled);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('stalled', handleStalled);
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

  // WakeLock - prevents OS from suspending the app during audio playback.
  // Critical for background playback and episode transitions on mobile.
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    if (!isPlaying) return;

    let wakeLock: WakeLockSentinel | null = null;

    const acquireLock = async () => {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
        console.log('[AudioPlayer] WakeLock acquired');
        wakeLock.addEventListener('release', () => {
          console.log('[AudioPlayer] WakeLock released');
        });
      } catch (err) {
        console.warn('[AudioPlayer] WakeLock request failed:', err);
      }
    };

    acquireLock();

    // Re-acquire WakeLock when app returns to foreground (WakeLock is auto-released on background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && isPlaying) {
        acquireLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (wakeLock) {
        wakeLock.release().catch(() => {});
        wakeLock = null;
      }
    };
  }, [isPlaying]);

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

  // Native media controls (Android notification + lock screen)
  useEffect(() => {
    if (!book) return;

    const artUrl = book.cover_url
      ? `${getApiBaseUrl()}/books/${book.id}/cover`
      : undefined;

    mediaControlsPlugin.updateMetadata({
      title: book.episodes?.[currentEpisode]?.title || book.title,
      artist: book.author || 'Unknown Author',
      album: book.title,
      artUrl,
    }).catch(() => {});
  }, [book, currentEpisode]);

  // Sync native playback state (throttled via isPlaying change + 30s interval)
  useEffect(() => {
    if (!book) return;

    const syncState = () => {
      const audio = audioRef.current;
      const pos = audio ? Math.floor(audio.currentTime) : 0;
      const dur = audio ? Math.floor(audio.duration || 0) : 0;
      mediaControlsPlugin.updatePlaybackState({
        isPlaying,
        position: pos,
        duration: dur,
      }).catch(() => {});
    };

    syncState();

    // Update every 5s while playing so notification progress bar stays accurate
    if (!isPlaying) return;
    const interval = setInterval(syncState, 5000);
    return () => clearInterval(interval);
  }, [isPlaying, book]);

  // Listen for native media button events
  useEffect(() => {
    let handle: { remove: () => Promise<void> } | null = null;

    mediaControlsPlugin.addListener('mediaAction', (data) => {
      switch (data.action) {
        case 'play': play(); break;
        case 'pause': pause(); break;
        case 'previous':
          if (currentEpisodeRef.current > 0) setEpisode(currentEpisodeRef.current - 1);
          break;
        case 'next': {
          const b = bookRef.current;
          if (b && currentEpisodeRef.current < (b.episodes?.length || 0) - 1) {
            setEpisode(currentEpisodeRef.current + 1);
          }
          break;
        }
        case 'stop': pause(); break;
      }
    }).then(h => { handle = h; });

    return () => { handle?.remove(); };
  }, [play, pause, setEpisode]);

  // Destroy native service on unmount
  useEffect(() => {
    return () => { mediaControlsPlugin.destroy().catch(() => {}); };
  }, []);

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
      {/* Global audio element - preload="metadata" ensures only codec/duration info
          is fetched initially; audio data is streamed on-demand via Range requests */}
      <audio ref={audioRef} preload="metadata" />
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
