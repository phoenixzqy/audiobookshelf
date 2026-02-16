import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayerStore } from '../../stores/playerStore';
import { useAudioPlayer } from '../../contexts/AudioPlayerContext';
import { PlayIcon, PauseIcon, LocalSourceIcon, StreamSourceIcon } from '../common/icons';
import { formatTime } from '../../utils/formatters';
import { CoverImage } from '../common/CoverImage';

export function MiniPlayer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { togglePlay } = useAudioPlayer();

  const {
    bookId,
    book,
    currentEpisode,
    isPlaying,
    currentTime,
    duration,
    audioSource,
  } = usePlayerStore();

  // Don't show if no book is loaded
  if (!bookId || !book) return null;

  // Don't show on admin pages, login, register, or player pages
  const hiddenPaths = ['/admin', '/login', '/register', '/player', '/profile'];
  const shouldHide = hiddenPaths.some(path => location.pathname.startsWith(path));

  if (shouldHide) {
    return null;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const episodes = book.episodes || [];

  const handleNavigateToPlayer = () => {
    navigate(`/player/${bookId}`);
  };

  return (
    <div className="fixed left-0 right-0 z-40 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700" style={{ bottom: 'var(--bottom-nav-height, 0px)' }}>
      {/* Progress bar at top - full width */}
      <div className="h-1 bg-gray-700">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Content with max-width */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center gap-3 py-3">
          {/* Cover thumbnail - clickable to expand */}
          <button
            onClick={handleNavigateToPlayer}
            className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-700 hover:ring-2 hover:ring-indigo-500/50 transition-all"
          >
            {book.cover_url ? (
              <CoverImage
                bookId={book.id}
                hasCover={!!book.cover_url}
                alt={book.title}
                className="w-full h-full object-cover"
                fallback={<span className="text-lg">🎧</span>}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-600 to-purple-700">
                <span className="text-lg">🎧</span>
              </div>
            )}
          </button>

          {/* Title and episode info - clickable to expand */}
          <button
            onClick={handleNavigateToPlayer}
            className="flex-1 min-w-0 text-left"
          >
            <p className="text-white font-medium truncate text-sm">
              {book.title}
            </p>
            <p className="text-gray-400 text-xs truncate">
              {audioSource === 'local' && <LocalSourceIcon className="w-3 h-3 inline-block mr-1 text-green-400" />}
              {audioSource === 'stream' && <StreamSourceIcon className="w-3 h-3 inline-block mr-1 text-blue-400" />}
              {t('common.episodeAbbr')} {currentEpisode + 1}/{episodes.length} · {formatTime(currentTime)}
            </p>
          </button>

          {/* Play/Pause button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg hover:shadow-indigo-500/30 transition-all active:scale-95"
          >
            {isPlaying ? <PauseIcon className="w-6 h-6" /> : <PlayIcon className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </div>
  );
}
