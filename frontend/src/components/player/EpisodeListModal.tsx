import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, CheckCircle } from 'lucide-react';
import { CloseIcon } from '../common/icons';
import { downloadService } from '../../services/downloadService';
import { useDownloadStore } from '../../stores/downloadStore';
import type { Episode } from '../../types';

interface EpisodeListModalProps {
  isOpen: boolean;
  onClose: () => void;
  episodes: Episode[];
  currentEpisode: number;
  onSelectEpisode: (index: number) => void;
  bookTitle: string;
  bookId?: string;
}

export function EpisodeListModal({
  isOpen,
  onClose,
  episodes,
  currentEpisode,
  onSelectEpisode,
  bookTitle,
  bookId,
}: EpisodeListModalProps) {
  const { t } = useTranslation();
  const { isEpisodeDownloaded, startDownload } = useDownloadStore();
  const showDownload = downloadService.isSupported && !!bookId;
  const activeEpisodeRef = useCallback((node: HTMLButtonElement | null) => {
    if (node) {
      // Small delay to ensure the modal layout is rendered before scrolling
      requestAnimationFrame(() => {
        node.scrollIntoView({ block: 'center', behavior: 'instant' });
      });
    }
  }, []);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/95 backdrop-blur-sm">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-white">{t('common.episodes')}</h2>
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
                ref={index === currentEpisode ? activeEpisodeRef : undefined}
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
                      {episode.title || `${t('common.episode')} ${index + 1}`}
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
                  {showDownload && bookId && (
                    isEpisodeDownloaded(bookId, index) ? (
                      <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startDownload(bookId, index, bookTitle, episode.title || `Episode ${index + 1}`, episode.file);
                        }}
                        className="p-1 rounded-full hover:bg-gray-600 text-gray-500 hover:text-white transition-colors flex-shrink-0"
                        title={t('downloads.download')}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )
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
