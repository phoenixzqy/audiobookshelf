import { CloseIcon } from '../common/icons';
import type { Episode } from '../../types';

interface EpisodeListModalProps {
  isOpen: boolean;
  onClose: () => void;
  episodes: Episode[];
  currentEpisode: number;
  onSelectEpisode: (index: number) => void;
  bookTitle: string;
}

export function EpisodeListModal({
  isOpen,
  onClose,
  episodes,
  currentEpisode,
  onSelectEpisode,
  bookTitle,
}: EpisodeListModalProps) {
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
