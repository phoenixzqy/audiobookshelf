import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';
import type { Audiobook } from '../types';

export default function HomePage() {
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const response = await api.get('/books');
      setBooks(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-indigo-400">🎧 Audiobooks</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-300">{user?.display_name || user?.email}</span>
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
            {books.map((book) => (
              <Link
                key={book.id}
                to={`/player/${book.id}`}
                className="group bg-gray-800 rounded-lg overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all"
              >
                <div className="aspect-square bg-gray-700 flex items-center justify-center">
                  {book.cover_url ? (
                    <img
                      src={book.cover_url}
                      alt={book.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-6xl">📚</span>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-white group-hover:text-indigo-400 truncate">
                    {book.title}
                  </h3>
                  {book.author && (
                    <p className="text-sm text-gray-400 truncate">{book.author}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    {book.chapters.length} chapter{book.chapters.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
