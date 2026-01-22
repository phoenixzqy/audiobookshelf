import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';
import type { AudiobookSummary, PlaybackHistory } from '../types';

// Helper to format time
function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// History icon
const HistoryIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z" />
  </svg>
);

export default function HomePage() {
  const [books, setBooks] = useState<AudiobookSummary[]>([]);
  const [historyMap, setHistoryMap] = useState<Map<string, PlaybackHistory>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBooks();
    fetchHistory();
  }, []);

  const fetchBooks = async () => {
    try {
      const response = await api.get('/books');
      setBooks(response.data.data.books);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await api.get('/history');
      const historyData: PlaybackHistory[] = response.data.data;
      const map = new Map<string, PlaybackHistory>();
      historyData.forEach(h => map.set(h.book_id, h));
      setHistoryMap(map);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Get history info for a book
  const getBookHistory = (bookId: string): PlaybackHistory | null => {
    return historyMap.get(bookId) || null;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-400">🎧 Audiobooks</h1>
          <div className="flex items-center gap-3">
            <span className="text-gray-300 hidden sm:inline">{user?.display_name || user?.email}</span>
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-sm"
              >
                Admin
              </Link>
            )}
            <button
              onClick={handleLogout}
              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No audiobooks available yet.</p>
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="mt-4 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
              >
                Upload your first book
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {books.map((book) => {
              const history = getBookHistory(book.id);

              return (
                <Link
                  key={book.id}
                  to={`/player/${book.id}`}
                  className="group bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all"
                >
                  <div className="aspect-square bg-gray-700 flex items-center justify-center relative">
                    {book.cover_url ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-6xl">📚</span>
                    )}

                    {/* In progress indicator */}
                    {history && (
                      <div className="absolute top-2 right-2 w-3 h-3 bg-indigo-500 rounded-full shadow-lg" />
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-white group-hover:text-indigo-400 truncate">
                      {book.title}
                    </h3>
                    {book.author && (
                      <p className="text-sm text-gray-400 truncate">{book.author}</p>
                    )}

                    {/* Show progress info */}
                    {history ? (
                      <div className="mt-2 text-xs">
                        <p className="text-indigo-400">
                          Ep. {history.episode_index + 1}/{book.episode_count} · {formatTime(history.current_time_seconds)}
                        </p>
                        <p className="text-gray-500">
                          {formatRelativeTime(history.last_played_at)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">
                        {book.episode_count} episode{book.episode_count !== 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating History Button */}
      <Link
        to="/history"
        className="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-lg shadow-indigo-500/30 flex items-center justify-center text-white transition-all hover:scale-110 active:scale-95 z-50"
        title="Listening History"
      >
        <HistoryIcon />
      </Link>
    </div>
  );
}
