import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../api/client';
import type { AudiobookSummary, PlaybackHistory } from '../types';
import { HeaderWrapper } from '../components/common/HeaderWrapper';
import { MainWrapper } from '../components/common/MainWrapper';
import { formatTime, formatRelativeTime } from '../utils/formatters';
import { CoverImage } from '../components/common/CoverImage';
import { PlayIcon } from '../components/common/icons';
import { usePlayerStore } from '../stores/playerStore';

interface HistoryWithBook extends PlaybackHistory {
  book?: AudiobookSummary;
}

export default function HistoryPage() {
  const { t } = useTranslation();
  const [historyItems, setHistoryItems] = useState<HistoryWithBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { bookId: activeBookId } = usePlayerStore();

  // Check if mini player is visible
  const hasMiniPlayer = !!activeBookId;

  useEffect(() => {
    fetchHistoryWithBooks();
  }, []);

  const fetchHistoryWithBooks = async () => {
    try {
      // Use optimized endpoint that returns history pre-joined with books
      const response = await api.get('/history/with-books');
      const historyData: HistoryWithBook[] = response.data.data;

      setHistoryItems(historyData);
    } catch (err: any) {
      setError(err.response?.data?.error || t('history.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen ${hasMiniPlayer ? 'pb-40' : 'pb-24'}`}>
      {/* Header */}
      <HeaderWrapper>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{t('history.title')}</h1>
        </div>
      </HeaderWrapper>

      {/* Main Content */}
      <MainWrapper className="pt-[85px]">
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
            <p className="text-gray-400 text-lg mb-2">{t('history.noHistory')}</p>
            <p className="text-gray-500 text-sm">
              {t('history.noHistoryHint')}
            </p>
            <Link
              to="/"
              className="mt-6 inline-block px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded"
            >
              {t('history.browseBooks')}
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {historyItems.map((item) => {
              const book = item.book!;

              return (
                <Link
                  key={item.id}
                  to={`/player/${book.id}`}
                  className="flex gap-4 bg-gray-800 rounded-xl p-4 hover:bg-gray-750 hover:ring-2 hover:ring-indigo-500/50 transition-all group"
                >
                  {/* Book cover */}
                  <div className="relative flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-700">
                    {book.cover_url ? (
                      <CoverImage
                        bookId={book.id}
                        hasCover={!!book.cover_url}
                        alt={book.title}
                        className="w-full h-full object-cover"
                        fallback={<span className="text-3xl">📚</span>}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-3xl">📚</span>
                      </div>
                    )}

                    {/* Play button overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                        <PlayIcon className="w-5 h-5" />
                      </div>
                    </div>
                  </div>

                  {/* Book info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white text-lg truncate group-hover:text-indigo-400 transition-colors">
                      {book.title}
                    </h3>
                    {book.author && (
                      <p className="text-sm text-gray-400 truncate">{book.author}</p>
                    )}

                    {/* Current position */}
                    <div className="mt-2">
                      <p className="text-sm text-indigo-400">
                        {t('history.episodeOf', { current: item.episode_index + 1, total: book.episode_count })}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {t('common.position')}: {formatTime(item.current_time_seconds)}
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
      </MainWrapper>
    </div>
  );
}
