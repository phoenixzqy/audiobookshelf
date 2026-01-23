import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import api from '../api/client';
import type { AudiobookSummary, PlaybackHistory } from '../types';
import CategoryTabs, { type BookCategory } from '../components/common/CategoryTabs';
import { HeaderWrapper } from '../components/common/HeaderWrapper';
import { MainWrapper } from '../components/common/MainWrapper';
import { formatTime, formatRelativeTime } from '../utils/formatters';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
} from '../components/common/icons';

export default function HomePage() {
  const [books, setBooks] = useState<AudiobookSummary[]>([]);
  const [historyMap, setHistoryMap] = useState<Map<string, PlaybackHistory>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBooks, setTotalBooks] = useState(0);
  const [category, setCategory] = useState<BookCategory>('all');
  const { user } = useAuthStore();
  const { bookId: activeBookId } = usePlayerStore();

  // Check if mini player is visible (book loaded and not on player page)
  const hasMiniPlayer = !!activeBookId;

  const BOOKS_PER_PAGE = 20;

  useEffect(() => {
    setCurrentPage(1); // Reset to page 1 when category changes
  }, [category]);

  useEffect(() => {
    fetchBooks(currentPage, category);
    fetchHistory();
  }, [currentPage, category]);

  const fetchBooks = async (page: number, bookCategory: BookCategory) => {
    setLoading(true);
    try {
      let url = `/books?page=${page}&limit=${BOOKS_PER_PAGE}`;
      if (bookCategory !== 'all') {
        url += `&bookType=${bookCategory}`;
      }
      const response = await api.get(url);
      setBooks(response.data.data.books);
      setTotalPages(response.data.data.totalPages);
      setTotalBooks(response.data.data.total);
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

  // Get history info for a book
  const getBookHistory = (bookId: string): PlaybackHistory | null => {
    return historyMap.get(bookId) || null;
  };

  return (
    <div className={`min-h-screen ${hasMiniPlayer ? 'pb-40' : 'pb-24'}`}>
      {/* Header */}
      <HeaderWrapper>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-400">Audiobooks</h1>
          <span className="text-gray-300 text-sm">{user?.display_name || user?.email}</span>
        </div>
      </HeaderWrapper>

      {/* Main Content */}
      <MainWrapper className="pt-16">
        {/* Category Tabs */}
        <div className="max-w-7xl mx-auto px-4 py-4">
          <CategoryTabs activeCategory={category} onCategoryChange={setCategory} />
        </div>
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
            <p className="text-gray-400 text-lg">
              {category === 'all'
                ? 'No audiobooks available yet.'
                : `No ${category} audiobooks available.`}
            </p>
            {user?.role === 'admin' && category === 'all' && (
              <Link
                to="/admin"
                className="mt-4 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
              >
                Upload your first book
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              {books.map((book) => {
                const history = getBookHistory(book.id);

                return (
                  <Link
                    key={book.id}
                    to={`/player/${book.id}`}
                    className="group bg-gray-800 rounded-xl overflow-hidden hover:bg-gray-750 hover:ring-2 hover:ring-indigo-500/50 transition-all duration-150 hover:scale-[1.02]"
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

                      {/* Category badge */}
                      <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium
                        ${book.book_type === 'kids'
                          ? 'bg-green-600/80 text-white'
                          : 'bg-gray-900/80 text-gray-200'
                        }`}
                      >
                        {book.book_type === 'kids' ? 'Kids' : 'Adult'}
                      </div>
                    </div>
                    <div className="p-3 sm:p-4">
                      <h3 className="font-semibold text-white group-hover:text-indigo-400 truncate text-sm sm:text-base">
                        {book.title}
                      </h3>
                      {book.author && (
                        <p className="text-xs sm:text-sm text-gray-400 truncate">{book.author}</p>
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

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="w-10 h-10 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  title="First page"
                >
                  <ChevronDoubleLeftIcon />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-10 h-10 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Previous page"
                >
                  <ChevronLeftIcon />
                </button>

                <div className="flex items-center gap-1 px-2">
                  {/* Show page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-10 h-10 rounded text-sm ${
                          currentPage === pageNum
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-10 h-10 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Next page"
                >
                  <ChevronRightIcon />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="w-10 h-10 flex items-center justify-center bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Last page"
                >
                  <ChevronDoubleRightIcon />
                </button>
              </div>
            )}

            {/* Page info */}
            <div className="mt-4 text-center text-sm text-gray-500">
              Showing {(currentPage - 1) * BOOKS_PER_PAGE + 1}-{Math.min(currentPage * BOOKS_PER_PAGE, totalBooks)} of {totalBooks} books
            </div>
          </>
        )}
      </MainWrapper>
    </div>
  );
}
