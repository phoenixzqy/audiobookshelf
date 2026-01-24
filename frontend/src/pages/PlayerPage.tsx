import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../stores/playerStore';
import { useAudioPlayer } from '../contexts/AudioPlayerContext';
import { formatTime } from '../utils/formatters';
import {
  PlayIcon,
  PauseIcon,
  SkipBackIcon,
  SkipForwardIcon,
  RewindIcon,
  FastForwardIcon,
  ListIcon,
  BackIcon,
  TimerIcon,
} from '../components/common/icons';
import { DiskCover } from '../components/player/DiskCover';
import { EpisodeListModal } from '../components/player/EpisodeListModal';
import { SleepTimerModal } from '../components/player/SleepTimerModal';

export default function PlayerPage() {
  const { t } = useTranslation();
  const { bookId } = useParams<{ bookId: string }>();
  const { togglePlay, seek, skipTime } = useAudioPlayer();

  const {
    book,
    currentEpisode,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    error,
    sleepTimerMinutes,
    sleepTimerRemaining,
    loadBook,
    setEpisode,
    setSleepTimer,
    cancelSleepTimer,
    syncHistory,
  } = usePlayerStore();

  // Modal states
  const [showEpisodeList, setShowEpisodeList] = useState(false);
  const [showSleepTimer, setShowSleepTimer] = useState(false);

  // Load book on mount or when bookId changes
  useEffect(() => {
    if (bookId) {
      loadBook(bookId);
    }
  }, [bookId, loadBook]);

  // Handle seek from progress bar
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    seek(newTime);
  };

  // Navigate to episode
  const goToEpisode = async (index: number) => {
    await setEpisode(index);
  };

  const prevEpisode = () => {
    if (currentEpisode > 0) {
      goToEpisode(currentEpisode - 1);
    }
  };

  const nextEpisode = () => {
    const episodeCount = book?.episodes?.length || 0;
    if (currentEpisode < episodeCount - 1) {
      goToEpisode(currentEpisode + 1);
    }
  };

  // Sync history when leaving page via back button
  const handleBackClick = async () => {
    await syncHistory();
  };

  if (isLoading) {
    return (
      <div className="h-screen flex justify-center items-center bg-gray-900 overflow-hidden">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4 bg-gray-900 px-4 overflow-hidden">
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
          {error || t('player.bookNotFound')}
        </div>
        <Link to="/" className="flex items-center gap-2 text-indigo-400 hover:text-indigo-300">
          <BackIcon className="w-5 h-5" />
          {t('player.backToLibrary')}
        </Link>
      </div>
    );
  }

  const episodes = book.episodes || [];
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-4 relative z-10">
        <Link
          to="/"
          className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          onClick={handleBackClick}
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
            title={t('player.sleepTimer')}
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
            <p className="text-gray-400 mt-1">{book.author}</p>
          )}
          <p className="text-indigo-400 text-xlg mt-2">
            {t('player.episodeOf', { current: currentEpisode + 1, total: episodes.length })}
          </p>
          <p className="text-gray-500 text-sm">
            {episodes[currentEpisode]?.title || `${t('common.episode')} ${currentEpisode + 1}`}
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
            className="w-16 h-16 min-w-[4rem] min-h-[4rem] aspect-square flex-shrink-0 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all active:scale-95"
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
        onSetTimer={setSleepTimer}
        onCancelTimer={cancelSleepTimer}
      />

      {/* Custom animation styles */}
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
