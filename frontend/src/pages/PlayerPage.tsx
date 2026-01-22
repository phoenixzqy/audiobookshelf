import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import type { Audiobook, PlaybackHistory } from '../types';

export default function PlayerPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [book, setBook] = useState<Audiobook | null>(null);
  const [history, setHistory] = useState<PlaybackHistory | null>(null);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (bookId) {
      fetchBook();
      fetchHistory();
    }
  }, [bookId]);

  useEffect(() => {
    if (book && currentChapter >= 0) {
      fetchChapterUrl();
    }
  }, [book, currentChapter]);

  const fetchBook = async () => {
    try {
      const response = await api.get(`/books/${bookId}`);
      setBook(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load book');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await api.get('/history');
      const bookHistory = response.data.find((h: PlaybackHistory) => h.book_id === bookId);
      if (bookHistory) {
        setHistory(bookHistory);
        setCurrentChapter(bookHistory.chapter_index);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  const fetchChapterUrl = async () => {
    try {
      const response = await api.get(`/books/${bookId}/chapters/${currentChapter}/url`);
      setAudioUrl(response.data.url);
    } catch (err: any) {
      console.error('Failed to get chapter URL:', err);
    }
  };

  const syncHistory = async (currentTime: number) => {
    try {
      await api.post('/history/sync', {
        history: [
          {
            book_id: bookId,
            chapter_index: currentChapter,
            current_time_seconds: Math.floor(currentTime),
            playback_rate: 1,
            last_played_at: new Date().toISOString(),
          },
        ],
      });
    } catch (err) {
      console.error('Failed to sync history:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex justify-center items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded">
          {error || 'Book not found'}
        </div>
        <Link to="/" className="text-indigo-400 hover:text-indigo-300">
          ← Back to library
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/" className="text-gray-400 hover:text-white">
            ← Back
          </Link>
          <h1 className="text-xl font-bold text-white truncate">{book.title}</h1>
        </div>
      </header>

      {/* Player */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
        <div className="bg-gray-800 rounded-lg p-6">
          {/* Book Info */}
          <div className="flex gap-6 mb-8">
            <div className="w-32 h-32 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
              {book.cover_url ? (
                <img
                  src={book.cover_url}
                  alt={book.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <span className="text-5xl">📚</span>
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">{book.title}</h2>
              {book.author && <p className="text-gray-400">by {book.author}</p>}
              {book.narrator && <p className="text-gray-500 text-sm">Narrated by {book.narrator}</p>}
              {book.description && (
                <p className="text-gray-400 text-sm mt-2 line-clamp-3">{book.description}</p>
              )}
            </div>
          </div>

          {/* Audio Player */}
          {audioUrl && (
            <div className="mb-8">
              <audio
                src={audioUrl}
                controls
                className="w-full"
                onTimeUpdate={(e) => {
                  const audio = e.currentTarget;
                  // Sync every 30 seconds
                  if (Math.floor(audio.currentTime) % 30 === 0) {
                    syncHistory(audio.currentTime);
                  }
                }}
                onPause={(e) => syncHistory(e.currentTarget.currentTime)}
                onEnded={() => {
                  if (currentChapter < book.chapters.length - 1) {
                    setCurrentChapter(currentChapter + 1);
                  }
                }}
              />
            </div>
          )}

          {/* Chapter List */}
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Chapters</h3>
            <div className="space-y-2">
              {book.chapters.map((chapter, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentChapter(index)}
                  className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                    index === currentChapter
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  <span className="font-medium">
                    {chapter.title || `Chapter ${index + 1}`}
                  </span>
                  {chapter.duration && (
                    <span className="text-sm text-gray-400 ml-2">
                      ({Math.floor(chapter.duration / 60)}:{String(chapter.duration % 60).padStart(2, '0')})
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
