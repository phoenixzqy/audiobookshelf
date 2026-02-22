import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, HardDrive, Trash2, X } from 'lucide-react';
import { useDownloadStore } from '../stores/downloadStore';
import { downloadService } from '../services/downloadService';

type Tab = 'library' | 'active' | 'storage';

export default function DownloadsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const { activeTasks, downloadedBooks, storageUsed, initialized, isPaused, pausedBookIds, initialize, deleteDownload, deleteBookDownloads, cancelDownload, cancelBookDownloads, pauseAll, resumeAll, pauseBook, resumeBook } = useDownloadStore();

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  if (!downloadService.isSupported) {
    return (
      <div className="min-h-screen bg-gray-900 p-4 pt-12">
        <h1 className="text-xl font-bold text-white mb-4">{t('downloads.title')}</h1>
        <p className="text-gray-400">{t('downloads.androidOnly', 'Downloads are only available on the Android app.')}</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'library', label: t('downloads.library') },
    { id: 'active', label: t('downloads.activeTab'), badge: activeTasks.length || undefined },
    { id: 'storage', label: t('downloads.storage') },
  ];

  return (
    <div className="min-h-screen bg-gray-900 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <h1 className="text-xl font-bold text-white px-4 pt-4 pb-2">{t('downloads.title')}</h1>
        <div className="flex gap-1 px-4 pb-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors relative ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-4">
        {activeTab === 'library' && (
          <LibraryTab
            downloadedBooks={downloadedBooks}
            onDeleteEpisode={deleteDownload}
            onDeleteBook={deleteBookDownloads}
          />
        )}
        {activeTab === 'active' && (
          <ActiveTab
            tasks={activeTasks}
            onCancel={cancelDownload}
            isPaused={isPaused}
            pausedBookIds={pausedBookIds}
            onPauseAll={pauseAll}
            onResumeAll={resumeAll}
            onPauseBook={pauseBook}
            onResumeBook={resumeBook}
            onCancelBook={cancelBookDownloads}
          />
        )}
        {activeTab === 'storage' && (
          <StorageTab
            storageUsed={storageUsed}
            downloadedBooks={downloadedBooks}
            onDeleteBook={deleteBookDownloads}
          />
        )}
      </div>
    </div>
  );
}

// --- Library Tab ---
function LibraryTab({
  downloadedBooks,
  onDeleteEpisode,
  onDeleteBook,
}: {
  downloadedBooks: Map<string, import('../stores/downloadStore').BookDownloadInfo>;
  onDeleteEpisode: (bookId: string, epIndex: number) => Promise<void>;
  onDeleteBook: (bookId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  if (downloadedBooks.size === 0) {
    return (
      <div className="text-center py-16">
        <Download className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400 text-lg mb-2">{t('downloads.noDownloads')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from(downloadedBooks.entries()).map(([bookId, bookInfo]) => (
        <div key={bookId} className="bg-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedBook(expandedBook === bookId ? null : bookId)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div>
              <p className="text-white font-medium">{bookInfo.bookTitle}</p>
              <p className="text-gray-400 text-sm">{bookInfo.episodes.length} {t('downloads.episodes')}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); onDeleteBook(bookId); }}
                className="p-2 text-red-400 hover:bg-red-900/30 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </button>
          {expandedBook === bookId && (
            <div className="border-t border-gray-700 px-4 pb-3">
              {bookInfo.episodes.sort((a, b) => a - b).map(ep => (
                <div key={ep} className="flex items-center justify-between py-2">
                  <span className="text-gray-300 text-sm">{t('common.episode')} {ep + 1}</span>
                  <button
                    onClick={() => onDeleteEpisode(bookId, ep)}
                    className="text-red-400 text-xs hover:text-red-300"
                  >
                    {t('common.remove')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Active Tab ---
function ActiveTab({
  tasks,
  onCancel,
  isPaused,
  pausedBookIds,
  onPauseAll,
  onResumeAll,
  onPauseBook,
  onResumeBook,
  onCancelBook,
}: {
  tasks: import('../types/download').DownloadTask[];
  onCancel: (taskId: string) => Promise<void>;
  isPaused: boolean;
  pausedBookIds: Set<string>;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onPauseBook: (bookId: string) => void;
  onResumeBook: (bookId: string) => void;
  onCancelBook: (bookId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <Download className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">{t('downloads.noActive')}</p>
      </div>
    );
  }

  // Group tasks by bookId
  const grouped = new Map<string, { bookTitle: string; tasks: typeof tasks }>();
  for (const task of tasks) {
    const group = grouped.get(task.bookId) || { bookTitle: task.bookTitle, tasks: [] };
    group.tasks.push(task);
    grouped.set(task.bookId, group);
  }

  // Overall progress
  const totalBytes = tasks.reduce((s, t) => s + t.totalBytes, 0);
  const downloadedBytes = tasks.reduce((s, t) => s + t.bytesDownloaded, 0);

  return (
    <div className="space-y-4">
      {/* Global controls */}
      <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
        <div className="text-sm text-gray-300">
          {tasks.length} {t('downloads.episodes')} · {totalBytes > 0 ? formatBytes(downloadedBytes) + ' / ' + formatBytes(totalBytes) : ''}
        </div>
        <button
          onClick={isPaused ? onResumeAll : onPauseAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-700 text-gray-200 hover:bg-gray-600 transition-colors"
        >
          {isPaused ? (
            <><PlayTriangleIcon className="w-3.5 h-3.5" /> {t('downloads.resumeAll', 'Resume All')}</>
          ) : (
            <><PauseBarIcon className="w-3.5 h-3.5" /> {t('downloads.pauseAll', 'Pause All')}</>
          )}
        </button>
      </div>

      {/* Grouped by book */}
      {Array.from(grouped.entries()).map(([bookId, { bookTitle, tasks: bookTasks }]) => {
        const bookPaused = isPaused || pausedBookIds.has(bookId);
        const bookDownloaded = bookTasks.reduce((s, t) => s + t.bytesDownloaded, 0);
        const bookTotal = bookTasks.reduce((s, t) => s + t.totalBytes, 0);
        const activeCount = bookTasks.filter(t => t.status === 'downloading').length;
        const pendingCount = bookTasks.filter(t => t.status === 'pending').length;

        return (
          <div key={bookId} className="bg-gray-800 rounded-xl overflow-hidden">
            {/* Book header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-medium truncate">{bookTitle}</p>
                <p className="text-gray-500 text-xs">
                  {activeCount > 0 && `${activeCount} ${t('downloads.active')}`}
                  {activeCount > 0 && pendingCount > 0 && ' · '}
                  {pendingCount > 0 && `${pendingCount} ${t('downloads.pending', 'pending')}`}
                  {bookTotal > 0 && ` · ${formatBytes(bookDownloaded)} / ${formatBytes(bookTotal)}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!isPaused && (
                  <button
                    onClick={() => bookPaused ? onResumeBook(bookId) : onPauseBook(bookId)}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
                    title={bookPaused ? 'Resume' : 'Pause'}
                  >
                    {bookPaused ? <PlayTriangleIcon className="w-4 h-4" /> : <PauseBarIcon className="w-4 h-4" />}
                  </button>
                )}
                <button
                  onClick={() => onCancelBook(bookId)}
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded-lg hover:bg-gray-700"
                  title="Cancel all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Episode tasks */}
            <div className="px-4 py-2 space-y-2">
              {bookTasks.map(task => (
                <div key={task.id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-300 text-xs truncate">{task.episodeTitle}</p>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${bookPaused ? 'bg-yellow-500' : 'bg-indigo-500'}`}
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-gray-500 text-xs whitespace-nowrap w-10 text-right">
                    {bookPaused && task.status !== 'downloading' ? '⏸' : `${task.progress}%`}
                  </span>
                  <button onClick={() => onCancel(task.id)} className="p-1 text-gray-500 hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Small inline SVG icons for pause/play in download controls
function PauseBarIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
    </svg>
  );
}

function PlayTriangleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

// --- Storage Tab ---
function StorageTab({
  storageUsed,
  downloadedBooks,
  onDeleteBook,
}: {
  storageUsed: number;
  downloadedBooks: Map<string, import('../stores/downloadStore').BookDownloadInfo>;
  onDeleteBook: (bookId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClearAll = async () => {
    for (const bookId of downloadedBooks.keys()) {
      await onDeleteBook(bookId);
    }
    setShowConfirm(false);
  };

  const totalEpisodes = Array.from(downloadedBooks.values()).reduce((s, info) => s + info.episodes.length, 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gray-800 rounded-xl p-6 text-center">
        <HardDrive className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <p className="text-2xl font-bold text-white">{formatBytes(storageUsed)}</p>
        <p className="text-gray-400 text-sm mt-1">
          {downloadedBooks.size} books · {totalEpisodes} episodes
        </p>
      </div>

      {/* Clear all */}
      {downloadedBooks.size > 0 && (
        <div>
          {showConfirm ? (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4">
              <p className="text-red-200 text-sm mb-3">{t('downloads.clearAllConfirm')}</p>
              <div className="flex gap-2">
                <button onClick={handleClearAll} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">
                  {t('common.delete')}
                </button>
                <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm font-medium">
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full py-3 bg-gray-800 text-red-400 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              {t('downloads.clearAll')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
