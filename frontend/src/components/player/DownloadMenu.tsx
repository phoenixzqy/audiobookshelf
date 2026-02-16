/**
 * Download menu for PlayerPage — provides book-level download actions.
 * Android native only (hidden on web).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X } from 'lucide-react';
import { downloadService } from '../../services/downloadService';
import { useDownloadStore } from '../../stores/downloadStore';
import type { Episode } from '../../types';

interface DownloadMenuProps {
  bookId: string;
  bookTitle: string;
  episodes: Episode[];
  currentEpisode: number;
}

export function DownloadMenu({ bookId, bookTitle, episodes, currentEpisode }: DownloadMenuProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState(currentEpisode);
  const [rangeEnd, setRangeEnd] = useState(Math.min(currentEpisode + 9, episodes.length - 1));
  const [showRange, setShowRange] = useState(false);

  const { startBookDownload, startRangeDownload, downloadedBooks, activeTasks } = useDownloadStore();

  if (!downloadService.isSupported) return null;

  const downloadedEpisodes = downloadedBooks.get(bookId) || [];
  const downloadedCount = downloadedEpisodes.length;
  const activeCount = activeTasks.filter(t => t.bookId === bookId).length;

  const epData = episodes.map((ep, i) => ({ index: i, title: ep.title, file: ep.file }));

  const handleDownloadAll = async () => {
    await startBookDownload(bookId, bookTitle, epData);
    setIsOpen(false);
  };

  const handleDownloadRemaining = async () => {
    await startRangeDownload(bookId, currentEpisode, episodes.length - 1, bookTitle, epData);
    setIsOpen(false);
  };

  const handleDownloadRange = async () => {
    await startRangeDownload(bookId, rangeStart, rangeEnd, bookTitle, epData);
    setIsOpen(false);
    setShowRange(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors relative"
        title={t('downloads.title')}
      >
        <Download className="w-5 h-5" />
        {(downloadedCount > 0 || activeCount > 0) && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-indigo-500 text-white text-[10px] rounded-full flex items-center justify-center px-1">
            {downloadedCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => { setIsOpen(false); setShowRange(false); }} />

          {/* Menu */}
          <div className="absolute right-0 top-10 z-50 w-64 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
            <div className="p-3 border-b border-gray-700 flex items-center justify-between">
              <span className="text-sm font-medium text-white">{t('downloads.title')}</span>
              <button onClick={() => { setIsOpen(false); setShowRange(false); }} className="text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status */}
            <div className="px-3 py-2 text-xs text-gray-400 border-b border-gray-700">
              {downloadedCount}/{episodes.length} {t('downloads.episodesDownloaded')}
              {activeCount > 0 && ` · ${activeCount} ${t('downloads.active')}`}
            </div>

            {!showRange ? (
              <div className="py-1">
                <button
                  onClick={handleDownloadAll}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  {t('downloads.downloadAll')}
                </button>
                <button
                  onClick={handleDownloadRemaining}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  {t('downloads.downloadRemaining', { episode: currentEpisode + 1 })}
                </button>
                <button
                  onClick={() => setShowRange(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
                >
                  {t('downloads.downloadRange')}
                </button>
              </div>
            ) : (
              <div className="p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 w-12">{t('downloads.from')}</label>
                  <input
                    type="number"
                    min={1}
                    max={episodes.length}
                    value={rangeStart + 1}
                    onChange={e => setRangeStart(Math.max(0, parseInt(e.target.value || '1') - 1))}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400 w-12">{t('downloads.to')}</label>
                  <input
                    type="number"
                    min={1}
                    max={episodes.length}
                    value={rangeEnd + 1}
                    onChange={e => setRangeEnd(Math.min(episodes.length - 1, parseInt(e.target.value || '1') - 1))}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowRange(false)}
                    className="flex-1 px-3 py-1.5 text-sm text-gray-300 bg-gray-700 rounded hover:bg-gray-600"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleDownloadRange}
                    className="flex-1 px-3 py-1.5 text-sm text-white bg-indigo-600 rounded hover:bg-indigo-500"
                  >
                    {t('downloads.download')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
