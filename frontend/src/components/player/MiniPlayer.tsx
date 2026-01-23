import { useNavigate, useLocation } from 'react-router-dom';
import { usePlayerStore } from '../../stores/playerStore';
import { useAudioPlayer } from '../../contexts/AudioPlayerContext';
import { PlayIcon, PauseIcon } from '../common/icons';
import { formatTime } from '../../utils/formatters';

export function MiniPlayer() {
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
  } = usePlayerStore();

  // Don't show if no book is loaded
  if (!bookId || !book) return null;

  // Don't show on admin pages, login, register, or player pages
  const hiddenPaths = ['/admin', '/login', '/register', '/player'];
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
    <div className="fixed bottom-[75px] left-0 right-0 z-40 bg-gray-800/95 backdrop-blur-sm border-t border-gray-700 safe-area-bottom">
      {/* Progress bar at top */}
      <div className="h-1 bg-gray-700">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-3 px-4 py-3">
        {/* Cover thumbnail - clickable to expand */}
        <button
          onClick={handleNavigateToPlayer}
          className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden bg-gray-700 hover:ring-2 hover:ring-indigo-500/50 transition-all"
        >
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="w-full h-full object-cover"
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
            Ep. {currentEpisode + 1}/{episodes.length} · {formatTime(currentTime)}
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

      {/* iOS safe area padding */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </div>
  );
}
