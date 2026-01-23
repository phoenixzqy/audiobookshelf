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

  const { isAuthenticated } = useAuthStore();

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

  // Handle audio element events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);

    // Auto-continue to next episode when current one ends
    const handleEnded = async () => {
      if (book && currentEpisode < (book.episodes?.length || 0) - 1) {
        setShouldAutoPlay(true);
        await setEpisode(currentEpisode + 1);
      } else {
        setPlaying(false);
        setShouldAutoPlay(false);
      }
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [book, currentEpisode, setTime, setDuration, setPlaying, setShouldAutoPlay, setEpisode]);

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

  // Sync on visibility change (when tab becomes hidden)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && isPlaying) {
        syncHistory();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isPlaying, syncHistory]);

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
