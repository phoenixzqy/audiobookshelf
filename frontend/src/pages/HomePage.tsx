import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { usePlayerStore } from '../stores/playerStore';
import api from '../api/client';
import type { AudiobookSummary, PlaybackHistory } from '../types';
import CategoryTabs, { type BookCategory } from '../components/common/CategoryTabs';
import { HeaderWrapper } from '../components/common/HeaderWrapper';
import { MainWrapper } from '../components/common/MainWrapper';
import { formatTime, formatRelativeTime } from '../utils/formatters';
import { CoverImage } from '../components/common/CoverImage';

export default function HomePage() {
  const { t } = useTranslation();
  const [books, setBooks] = useState<AudiobookSummary[]>([]);
  const [historyMap, setHistoryMap] = useState<Map<string, PlaybackHistory>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const { user } = useAuthStore();
  const { bookId: activeBookId } = usePlayerStore();

  // Kids can only see kids content, adults default to adult
  const isKidUser = user?.user_type === 'kid';
  const [category, setCategory] = useState<BookCategory>(isKidUser ? 'kids' : 'adult');

  // Check if mini player is visible (book loaded and not on player page)
  const hasMiniPlayer = !!activeBookId;

  // Infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const BOOKS_PER_PAGE = 20;

  // Reset when category changes
  useEffect(() => {
    setBooks([]);
    setPage(1);
    setHasMore(true);
    setLoading(true);
  }, [category]);

  // Fetch books
  useEffect(() => {
    fetchBooks(page, category, page === 1);
  }, [page, category]);

  // Fetch history once on mount
  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchBooks = async (pageNum: number, bookCategory: BookCategory, isFirstPage: boolean) => {
    if (isFirstPage) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const url = `/books?page=${pageNum}&limit=${BOOKS_PER_PAGE}&bookType=${bookCategory}`;
      const response = await api.get(url);
      const { books: newBooks, hasMore: moreAvailable } = response.data.data;

      if (isFirstPage) {
        setBooks(newBooks);
      } else {
        setBooks(prev => [...prev, ...newBooks]);
      }
      setHasMore(moreAvailable);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setLoading(false);
      setLoadingMore(false);
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

  // Load more callback for intersection observer
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      setPage(prev => prev + 1);
    }
  }, [loadingMore, hasMore]);

  // Setup intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before reaching the end
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadingMore, loadMore]);

  // Get history info for a book
  const getBookHistory = (bookId: string): PlaybackHistory | null => {
    return historyMap.get(bookId) || null;
  };

  return (
    <div className={`min-h-screen ${hasMiniPlayer ? 'pb-40' : 'pb-24'}`}>
      {/* Header */}
      <HeaderWrapper>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-400">{t('home.title')}</h1>
          <span className="text-gray-300 text-sm">{user?.display_name || user?.email}</span>
        </div>
      </HeaderWrapper>

      {/* Main Content */}
      <MainWrapper className={isKidUser ? "pt-[80px]" : "pt-16"}>
        {/* Category Tabs - only show for adult users */}
        {!isKidUser && (
          <div className="max-w-7xl mx-auto px-4 py-4">
            <CategoryTabs activeCategory={category} onCategoryChange={setCategory} />
          </div>
        )}
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
              {t('home.noCategoryBooks', { category: t(`categories.${category}`) })}
            </p>
            {user?.role === 'admin' && (
              <Link
                to="/admin"
                className="mt-4 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
              >
                {t('home.uploadFirst')}
              </Link>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
              {books.map((book) => {
                const history = getBookHistory(book.id);

                return (
                  <Link
                    key={book.id}
                    to={`/player/${book.id}`}
                    className="group bg-gray-800 rounded-xl overflow-hidden hover:bg-gray-750 hover:ring-2 hover:ring-indigo-500/50 transition-all duration-150 hover:scale-[1.02]"
                  >
                    <div className="aspect-square bg-gray-700 flex items-center justify-center relative">
                      <CoverImage
                        bookId={book.id}
                        hasCover={!!book.cover_url}
                        alt={book.title}
                        className="w-full h-full object-cover"
                        fallback={<span className="text-6xl">📚</span>}
                      />

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
                        {t(`categories.${book.book_type === 'kids' ? 'kids' : 'adult'}`)}
                      </div>
                    </div>
                    <div className="p-3 sm:p-4">
                      <h3 className="font-semibold text-white group-hover:text-indigo-400 text-sm sm:text-base line-clamp-2 h-10 sm:h-12">
                        {book.title}
                      </h3>
                      {book.author && (
                        <p className="text-xs sm:text-sm text-gray-400 truncate">{book.author}</p>
                      )}

                      {/* Show progress info */}
                      {history ? (
                        <div className="mt-2 text-xs">
                          <p className="text-indigo-400">
                            {t('common.episodeAbbr')} {history.episode_index + 1}/{book.episode_count} · {formatTime(history.current_time_seconds)}
                          </p>
                          <p className="text-gray-500">
                            {formatRelativeTime(history.last_played_at)}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mt-2">
                          {book.episode_count} {t('common.episodes')}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Infinite scroll trigger */}
            <div ref={loadMoreRef} className="h-20 flex items-center justify-center">
              {loadingMore && (
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              )}
            </div>
          </>
        )}
      </MainWrapper>
    </div>
  );
}
