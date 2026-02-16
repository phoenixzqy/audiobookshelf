import { useState, useEffect } from 'react';
import { Download, HardDrive, Trash2, X } from 'lucide-react';
import { useDownloadStore } from '../stores/downloadStore';
import { downloadService } from '../services/downloadService';

type Tab = 'library' | 'active' | 'storage';

export default function DownloadsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const { activeTasks, downloadedBooks, storageUsed, initialized, initialize, deleteDownload, deleteBookDownloads, cancelDownload } = useDownloadStore();

  useEffect(() => {
    if (!initialized) initialize();
  }, [initialized, initialize]);

  if (!downloadService.isSupported) {
    return (
      <div className="min-h-screen bg-gray-900 p-4 pt-12">
        <h1 className="text-xl font-bold text-white mb-4">Downloads</h1>
        <p className="text-gray-400">Downloads are only available on the Android app.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'library', label: 'Library' },
    { id: 'active', label: 'Active', badge: activeTasks.length || undefined },
    { id: 'storage', label: 'Storage' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 pb-32">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        <h1 className="text-xl font-bold text-white px-4 pt-4 pb-2">Downloads</h1>
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
          <ActiveTab tasks={activeTasks} onCancel={cancelDownload} />
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
  downloadedBooks: Map<string, number[]>;
  onDeleteEpisode: (bookId: string, epIndex: number) => Promise<void>;
  onDeleteBook: (bookId: string) => Promise<void>;
}) {
  const [expandedBook, setExpandedBook] = useState<string | null>(null);

  if (downloadedBooks.size === 0) {
    return (
      <div className="text-center py-16">
        <Download className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400 text-lg mb-2">No downloads yet</p>
        <p className="text-gray-500 text-sm">Download books for offline listening</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {Array.from(downloadedBooks.entries()).map(([bookId, episodes]) => (
        <div key={bookId} className="bg-gray-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpandedBook(expandedBook === bookId ? null : bookId)}
            className="w-full flex items-center justify-between p-4 text-left"
          >
            <div>
              <p className="text-white font-medium">Book {bookId.slice(0, 8)}...</p>
              <p className="text-gray-400 text-sm">{episodes.length} episodes downloaded</p>
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
              {episodes.sort((a, b) => a - b).map(ep => (
                <div key={ep} className="flex items-center justify-between py-2">
                  <span className="text-gray-300 text-sm">Episode {ep + 1}</span>
                  <button
                    onClick={() => onDeleteEpisode(bookId, ep)}
                    className="text-red-400 text-xs hover:text-red-300"
                  >
                    Remove
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
}: {
  tasks: import('../types/download').DownloadTask[];
  onCancel: (taskId: string) => Promise<void>;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <Download className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">No active downloads</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map(task => (
        <div key={task.id} className="bg-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{task.bookTitle}</p>
              <p className="text-gray-400 text-xs truncate">{task.episodeTitle}</p>
            </div>
            <button onClick={() => onCancel(task.id)} className="p-1 text-gray-400 hover:text-red-400">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${task.progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-1 text-xs text-gray-500">
            <span>{task.status === 'downloading' ? `${task.progress}%` : task.status}</span>
            {task.totalBytes > 0 && (
              <span>{formatBytes(task.bytesDownloaded)} / {formatBytes(task.totalBytes)}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Storage Tab ---
function StorageTab({
  storageUsed,
  downloadedBooks,
  onDeleteBook,
}: {
  storageUsed: number;
  downloadedBooks: Map<string, number[]>;
  onDeleteBook: (bookId: string) => Promise<void>;
}) {
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClearAll = async () => {
    for (const bookId of downloadedBooks.keys()) {
      await onDeleteBook(bookId);
    }
    setShowConfirm(false);
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-gray-800 rounded-xl p-6 text-center">
        <HardDrive className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
        <p className="text-2xl font-bold text-white">{formatBytes(storageUsed)}</p>
        <p className="text-gray-400 text-sm mt-1">
          {downloadedBooks.size} books · {Array.from(downloadedBooks.values()).reduce((s, eps) => s + eps.length, 0)} episodes
        </p>
      </div>

      {/* Clear all */}
      {downloadedBooks.size > 0 && (
        <div>
          {showConfirm ? (
            <div className="bg-red-900/30 border border-red-800 rounded-xl p-4">
              <p className="text-red-200 text-sm mb-3">Delete all downloaded files? This cannot be undone.</p>
              <div className="flex gap-2">
                <button onClick={handleClearAll} className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium">
                  Delete All
                </button>
                <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm font-medium">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="w-full py-3 bg-gray-800 text-red-400 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
            >
              Clear All Downloads
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
