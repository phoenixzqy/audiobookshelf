import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';
import type { Audiobook, PlaybackHistory } from '../types';

// Icons as SVG components for better control
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const SkipBackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
  </svg>
);

const SkipForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
  </svg>
);

const RewindIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
  </svg>
);

const FastForwardIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
  </svg>
);

const ListIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
  </svg>
);

const BackIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

// Timer/Moon icon for sleep timer
const TimerIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" />
  </svg>
);

// Sleep Timer Modal Component
function SleepTimerModal({
  isOpen,
  onClose,
  activeTimer,
  remainingTime,
  onSetTimer,
  onCancelTimer,
}: {
  isOpen: boolean;
  onClose: () => void;
  activeTimer: number | null;
  remainingTime: number;
  onSetTimer: (minutes: number) => void;
  onCancelTimer: () => void;
}) {
  if (!isOpen) return null;

  const timerOptions = [5, 10, 15, 20, 30, 45, 60];

  const formatRemainingTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-gray-800 rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <TimerIcon />
            Sleep Timer
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Active timer display */}
        {activeTimer !== null && (
          <div className="mb-6 p-4 bg-indigo-600/20 border border-indigo-500/30 rounded-xl">
            <p className="text-indigo-300 text-sm mb-1">Timer active</p>
            <p className="text-3xl font-bold text-white">{formatRemainingTime(remainingTime)}</p>
            <button
              onClick={() => {
                onCancelTimer();
                onClose();
              }}
              className="mt-3 w-full py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded-lg text-red-400 text-sm transition-colors"
            >
              Cancel Timer
            </button>
          </div>
        )}

        {/* Timer options */}
        <div className="grid grid-cols-3 gap-3">
          {timerOptions.map((minutes) => (
            <button
              key={minutes}
              onClick={() => {
                onSetTimer(minutes);
                onClose();
              }}
              className={`py-4 rounded-xl text-center transition-all ${
                activeTimer === minutes
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                  : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <span className="text-lg font-semibold">{minutes}</span>
              <span className="text-xs block text-gray-400">min</span>
            </button>
          ))}
        </div>

        {/* Off button */}
        <button
          onClick={() => {
            onCancelTimer();
            onClose();
          }}
          className="w-full mt-4 py-3 rounded-xl bg-gray-700/50 text-gray-300 hover:bg-gray-700 transition-colors"
        >
          Turn Off
        </button>
      </div>
    </div>
  );
}

// Vinyl/Disk style cover component
function DiskCover({ coverUrl, isPlaying, title }: { coverUrl?: string | null; isPlaying: boolean; title: string }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Outer disk ring */}
      <div className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl" />

      {/* Vinyl grooves effect */}
      <div className="absolute w-60 h-60 rounded-full border-4 border-gray-700/50" />
      <div className="absolute w-52 h-52 rounded-full border-2 border-gray-700/30" />
      <div className="absolute w-44 h-44 rounded-full border border-gray-700/20" />

      {/* Cover image with rotation animation */}
      <div
        className={`relative w-40 h-40 rounded-full overflow-hidden shadow-lg border-4 border-gray-600 ${
          isPlaying ? 'animate-spin-slow' : ''
        }`}
        style={{ animationDuration: '8s' }}
      >
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
            <span className="text-4xl">🎧</span>
          </div>
        )}

        {/* Center hole */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gray-900 border-2 border-gray-700" />
      </div>
    </div>
  );
}

// Episode List Modal
function EpisodeListModal({
  isOpen,
  onClose,
  episodes,
  currentEpisode,
  onSelectEpisode,
  bookTitle,
}: {
  isOpen: boolean;
  onClose: () => void;
  episodes: { index: number; title: string; duration?: number }[];
  currentEpisode: number;
  onSelectEpisode: (index: number) => void;
  bookTitle: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/95 backdrop-blur-sm">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">Episodes</h2>
            <p className="text-sm text-gray-400">{bookTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Episode List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-2">
            {episodes.map((episode, index) => (
              <button
                key={index}
                onClick={() => {
                  onSelectEpisode(index);
                  onClose();
                }}
                className={`w-full text-left px-4 py-4 rounded-xl transition-all ${
                  index === currentEpisode
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                    : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index === currentEpisode ? 'bg-white/20' : 'bg-gray-700'
                  }`}>
                    {index + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {episode.title || `Episode ${index + 1}`}
                    </p>
                    {episode.duration && episode.duration > 0 && (
                      <p className="text-sm opacity-70">
                        {Math.floor(episode.duration / 60)}:{String(episode.duration % 60).padStart(2, '0')}
                      </p>
                    )}
                  </div>
                  {index === currentEpisode && (
                    <div className="flex items-center gap-1">
                      <span className="w-1 h-3 bg-white rounded-full animate-pulse" />
                      <span className="w-1 h-4 bg-white rounded-full animate-pulse delay-75" />
                      <span className="w-1 h-2 bg-white rounded-full animate-pulse delay-150" />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Format time helper
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function PlayerPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const audioRef = useRef<HTMLAudioElement>(null);

  const [book, setBook] = useState<Audiobook | null>(null);
  const [history, setHistory] = useState<PlaybackHistory | null>(null);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [shouldAutoPlay, setShouldAutoPlay] = useState(true); // Auto-play flag

  // Sleep timer state
  const [showSleepTimer, setShowSleepTimer] = useState(false);
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemaining, setSleepTimerRemaining] = useState(0);
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (bookId) {
      fetchBook();
      fetchHistory();
    }
  }, [bookId]);

  useEffect(() => {
    if (book && currentEpisode >= 0) {
      fetchEpisodeUrl();
    }
  }, [book, currentEpisode]);

  // Sync playback state with audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration || 0);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    // Auto-continue to next episode when current one ends
    const handleEnded = () => {
      if (book && currentEpisode < (book.episodes?.length || 0) - 1) {
        // Move to next episode and keep auto-play enabled
        setShouldAutoPlay(true);
        setCurrentEpisode(currentEpisode + 1);
        syncHistory(audio.duration || currentTime); // Sync at end of episode
      } else {
        // End of book
        setIsPlaying(false);
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
  }, [book, currentEpisode, currentTime]);

  // Auto-sync history periodically
  useEffect(() => {
    if (!isPlaying || !bookId) return;

    const interval = setInterval(() => {
      syncHistory(currentTime);
    }, 30000); // Sync every 30 seconds

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, bookId]);

  // Sleep timer effect
  useEffect(() => {
    // Clear any existing timer
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    // If timer is active and playing, start countdown
    if (sleepTimerMinutes !== null && sleepTimerRemaining > 0 && isPlaying) {
      sleepTimerRef.current = setInterval(() => {
        setSleepTimerRemaining((prev) => {
          if (prev <= 1) {
            // Timer finished - pause playback
            const audio = audioRef.current;
            if (audio) {
              audio.pause();
              syncHistory(audio.currentTime);
            }
            setSleepTimerMinutes(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
      }
    };
  }, [sleepTimerMinutes, sleepTimerRemaining, isPlaying]);

  // Sleep timer handlers
  const handleSetSleepTimer = (minutes: number) => {
    setSleepTimerMinutes(minutes);
    setSleepTimerRemaining(minutes * 60);
  };

  const handleCancelSleepTimer = () => {
    setSleepTimerMinutes(null);
    setSleepTimerRemaining(0);
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
  };

  const fetchBook = async () => {
    try {
      const response = await api.get(`/books/${bookId}`);
      setBook(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load book');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await api.get('/history');
      const historyData = response.data.data;
      const bookHistory = historyData.find((h: PlaybackHistory) => h.book_id === bookId);
      if (bookHistory) {
        setHistory(bookHistory);
        setCurrentEpisode(bookHistory.episode_index);
        setCurrentTime(bookHistory.current_time_seconds);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const fetchEpisodeUrl = async () => {
    try {
      // Get the access token for authenticated streaming
      const { accessToken } = useAuthStore.getState();

      // Use the streaming endpoint which supports HTTP Range requests for large files
      // The browser's audio element will automatically make Range requests
      // Use current origin to work across devices (not just localhost)
      const streamUrl = `/api/books/${bookId}/episodes/${currentEpisode}/stream`;

      // For local development, we can use the streaming endpoint directly with auth header
      // For production with Azure, we'll get a SAS URL
      const response = await api.get(`/books/${bookId}/episodes/${currentEpisode}/url`);
      const { url } = response.data.data;

      // Check if it's a local storage URL (starts with /storage)
      // or an Azure SAS URL (which already includes auth)
      if (url.includes('/storage/')) {
        // Local storage - use streaming endpoint with token in query param
        // This allows the browser's audio element to authenticate
        setAudioUrl(`${streamUrl}?token=${accessToken}`);
      } else {
        // Azure SAS URL - already authenticated
        setAudioUrl(url);
      }
    } catch (err: any) {
      console.error('Failed to get episode URL:', err);
    }
  };

  const syncHistory = async (time: number) => {
    try {
      await api.post('/history/sync', {
        bookId: bookId,
        currentTime: Math.floor(time),
        episodeIndex: currentEpisode,
        playbackRate: 1,
        lastPlayedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to sync history:', err);
    }
  };

  // Handle audio loaded - auto-play and restore position
  const handleAudioLoaded = (e: React.SyntheticEvent<HTMLAudioElement>) => {
    const audio = e.currentTarget;

    // Restore position if we have history for this episode
    if (history && history.episode_index === currentEpisode && history.current_time_seconds > 0) {
      audio.currentTime = history.current_time_seconds;
      // Clear the history position so we don't keep restoring it on subsequent loads
      setHistory(prev => prev ? { ...prev, current_time_seconds: 0 } : null);
    }

    // Auto-play
    if (shouldAutoPlay) {
      audio.play().catch(err => {
        // Browser may block auto-play without user interaction
        console.log('Auto-play blocked:', err);
        setIsPlaying(false);
      });
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      syncHistory(audio.currentTime);
    } else {
      setShouldAutoPlay(true);
      audio.play();
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const newTime = parseFloat(e.target.value);
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skipTime = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, duration));
  };

  const goToEpisode = (index: number) => {
    if (!book || index < 0 || index >= (book.episodes?.length || 0)) return;

    syncHistory(currentTime);
    setShouldAutoPlay(true); // Auto-play when selecting an episode
    setCurrentEpisode(index);
    setCurrentTime(0);
    // Clear history position since we're manually selecting an episode
    setHistory(prev => prev ? { ...prev, episode_index: index, current_time_seconds: 0 } : null);
  };

  const prevEpisode = () => goToEpisode(currentEpisode - 1);
  const nextEpisode = () => goToEpisode(currentEpisode + 1);

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center bg-gray-900">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-900 px-4">
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
          {error || 'Book not found'}
        </div>
        <Link to="/" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to library
        </Link>
      </div>
    );
  }

  // Ensure episodes array exists
  const episodes = book.episodes || [];
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex flex-col">
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onLoadedMetadata={handleAudioLoaded}
      />

      {/* Header */}
      <header className="flex items-center justify-between p-4 relative z-10">
        <Link
          to="/"
          className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          onClick={() => syncHistory(currentTime)}
        >
          <BackIcon />
        </Link>
        <h1 className="text-white font-medium truncate max-w-[50%] text-center">
          {book.title}
        </h1>
        <div className="flex items-center gap-1">
          {/* Sleep Timer Button */}
          <button
            onClick={() => setShowSleepTimer(true)}
            className={`p-2 rounded-full hover:bg-gray-800 transition-colors relative ${
              sleepTimerMinutes !== null ? 'text-indigo-400' : 'text-gray-400 hover:text-white'
            }`}
            title="Sleep Timer"
          >
            <TimerIcon />
            {sleepTimerMinutes !== null && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
            )}
          </button>
          {/* Episode List Button */}
          <button
            onClick={() => setShowEpisodeList(true)}
            className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          >
            <ListIcon />
          </button>
        </div>
      </header>

      {/* Main content - Disk cover */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <DiskCover
          coverUrl={book.cover_url}
          isPlaying={isPlaying}
          title={book.title}
        />

        {/* Book info */}
        <div className="mt-16 text-center">
          <h2 className="text-xl font-bold text-white">{book.title}</h2>
          {book.author && (
            <p className="text-gray-400 mt-1">by {book.author}</p>
          )}
          <p className="text-indigo-400 text-xlg mt-2">
            Episode {currentEpisode + 1} of {episodes.length}
          </p>
          <p className="text-gray-500 text-sm">
            {episodes[currentEpisode]?.title || `Episode ${currentEpisode + 1}`}
          </p>
        </div>
      </div>

      {/* Bottom player controls */}
      <div className="bg-gray-800/80 backdrop-blur-lg rounded-t-3xl px-6 pb-8 pt-6 shadow-2xl">
        {/* Progress bar */}
        <div className="mb-6">
          <div className="relative h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="absolute h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-400">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Control buttons */}
        <div className="flex items-center justify-center gap-4">
          {/* Previous episode */}
          <button
            onClick={prevEpisode}
            disabled={currentEpisode === 0}
            className="p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <SkipBackIcon />
          </button>

          {/* Rewind 10s */}
          <button
            onClick={() => skipTime(-10)}
            className="p-3 rounded-full text-gray-300 hover:text-white hover:bg-gray-700/50 transition-all"
          >
            <RewindIcon />
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all active:scale-95"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>

          {/* Forward 30s */}
          <button
            onClick={() => skipTime(30)}
            className="p-3 rounded-full text-gray-300 hover:text-white hover:bg-gray-700/50 transition-all"
          >
            <FastForwardIcon />
          </button>

          {/* Next episode */}
          <button
            onClick={nextEpisode}
            disabled={currentEpisode === episodes.length - 1}
            className="p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <SkipForwardIcon />
          </button>
        </div>

        {/* Episode list shortcut */}
        <button
          onClick={() => setShowEpisodeList(true)}
          className="w-full mt-6 py-3 rounded-xl bg-gray-700/50 text-gray-300 hover:bg-gray-700 transition-colors flex items-center justify-center gap-2"
        >
          <ListIcon />
          <span>View all {episodes.length} episodes</span>
        </button>
      </div>

      {/* Episode list modal */}
      <EpisodeListModal
        isOpen={showEpisodeList}
        onClose={() => setShowEpisodeList(false)}
        episodes={episodes}
        currentEpisode={currentEpisode}
        onSelectEpisode={goToEpisode}
        bookTitle={book.title}
      />

      {/* Sleep timer modal */}
      <SleepTimerModal
        isOpen={showSleepTimer}
        onClose={() => setShowSleepTimer(false)}
        activeTimer={sleepTimerMinutes}
        remainingTime={sleepTimerRemaining}
        onSetTimer={handleSetSleepTimer}
        onCancelTimer={handleCancelSleepTimer}
      />

      {/* Add custom animation styles */}
      <style>{`
        @keyframes spin-slow {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
        @keyframes slide-up {
          from {
            transform: translateY(100%);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
