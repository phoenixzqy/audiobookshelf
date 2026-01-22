import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import type { Audiobook, PlaybackHistory } from '../types';

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

// Back icon
const BackIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
  </svg>
);

// Play icon
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M8 5v14l11-7z" />
  </svg>
);

interface HistoryWithBook extends PlaybackHistory {
  book?: Audiobook;
}

export default function HistoryPage() {
  const [historyItems, setHistoryItems] = useState<HistoryWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchHistoryWithBooks();
  }, []);

  const fetchHistoryWithBooks = async () => {
    try {
      // Fetch history and books in parallel
      const [historyRes, booksRes] = await Promise.all([
        api.get('/history'),
        api.get('/books'),
      ]);

      const historyData: PlaybackHistory[] = historyRes.data.data;
      const booksData: Audiobook[] = booksRes.data.data.books;

      // Create a map of books by ID
      const booksMap = new Map<string, Audiobook>();
      booksData.forEach(book => booksMap.set(book.id, book));

      // Merge history with book data and sort by last_played_at
      const merged: HistoryWithBook[] = historyData
        .map(h => ({
          ...h,
          book: booksMap.get(h.book_id),
        }))
        .filter(h => h.book) // Only include items where book still exists
        .sort((a, b) => new Date(b.last_played_at).getTime() - new Date(a.last_played_at).getTime());

      setHistoryItems(merged);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link
            to="/"
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-full transition-colors"
          >
            <BackIcon />
          </Link>
          <h1 className="text-2xl font-bold text-white">Listening History</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded">
            {error}
          </div>
        ) : historyItems.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📖</div>
            <p className="text-gray-400 text-lg mb-2">No listening history yet</p>
            <p className="text-gray-500 text-sm">
              Start listening to an audiobook and it will appear here.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
            >
              Browse Audiobooks
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {historyItems.map((item) => {
              const book = item.book!;
              const currentEpisode = book.episodes[item.episode_index];

              return (
                <Link
                  key={item.id}
                  to={`/player/${book.id}`}
                  className="flex gap-4 bg-gray-800 rounded-xl p-4 hover:bg-gray-750 hover:ring-2 hover:ring-indigo-500/50 transition-all group"
                >
                  {/* Book cover */}
                  <div className="relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-700">
                    {book.cover_url ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-3xl">📚</span>
                      </div>
                    )}

                    {/* Play button overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                        <PlayIcon />
                      </div>
                    </div>
                  </div>

                  {/* Book info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-lg truncate group-hover:text-indigo-400 transition-colors">
                      {book.title}
                    </h3>
                    {book.author && (
                      <p className="text-sm text-gray-400 truncate">by {book.author}</p>
                    )}

                    {/* Current position */}
                    <div className="mt-2">
                      <p className="text-sm text-indigo-400">
                        Episode {item.episode_index + 1} of {book.episodes.length}
                        {currentEpisode?.title && (
                          <span className="text-gray-500 ml-1">· {currentEpisode.title}</span>
                        )}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        Position: {formatTime(item.current_time_seconds)}
                      </p>
                    </div>

                    {/* Last played */}
                    <p className="mt-2 text-xs text-gray-500">
                      {formatRelativeTime(item.last_played_at)}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
