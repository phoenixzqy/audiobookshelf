import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import type { Audiobook, User } from '../types';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'books' | 'users' | 'upload'>('books');
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploadType, setUploadType] = useState<'adult' | 'kids'>('adult');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (activeTab === 'books') {
      fetchBooks();
    } else if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const response = await api.get('/books');
      setBooks(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await api.get('/admin/users');
      setUsers(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('audioFile', uploadFile);
    formData.append('title', uploadTitle);
    formData.append('author', uploadAuthor);
    formData.append('bookType', uploadType);

    try {
      await api.post('/admin/books', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Book uploaded successfully!');
      setUploadFile(null);
      setUploadTitle('');
      setUploadAuthor('');
      setActiveTab('books');
      fetchBooks();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!confirm('Are you sure you want to delete this book?')) return;

    try {
      await api.delete(`/admin/books/${bookId}`);
      setBooks(books.filter((b) => b.id !== bookId));
      setSuccess('Book deleted');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(users.map((u) => (u.id === userId ? { ...u, role: newRole as 'admin' | 'user' } : u)));
      setSuccess(`User role updated to ${newRole}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Update failed');
    }
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gray-800 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-400 hover:text-white">
              ← Back
            </Link>
            <h1 className="text-2xl font-bold text-indigo-400">Admin Dashboard</h1>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 border-b border-gray-700 mb-6">
          {(['books', 'users', 'upload'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize ${
                activeTab === tab
                  ? 'text-indigo-400 border-b-2 border-indigo-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        {/* Content */}
        {activeTab === 'upload' && (
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold text-white mb-4">Upload Audiobook</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Audio File (MP3, M4B)
                </label>
                <input
                  type="file"
                  accept="audio/*"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                  className="block w-full text-gray-400"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Author</label>
                <input
                  type="text"
                  value={uploadAuthor}
                  onChange={(e) => setUploadAuthor(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Content Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="adult"
                      checked={uploadType === 'adult'}
                      onChange={() => setUploadType('adult')}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Adult</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="kids"
                      checked={uploadType === 'kids'}
                      onChange={() => setUploadType('kids')}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Kids</span>
                  </label>
                </div>
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Book'}
              </button>
            </form>
          </div>
        )}

        {activeTab === 'books' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">
              Books ({books.length})
            </h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            ) : books.length === 0 ? (
              <p className="text-gray-400">No books yet. Upload your first book!</p>
            ) : (
              <div className="space-y-3">
                {books.map((book) => (
                  <div
                    key={book.id}
                    className="flex items-center justify-between bg-gray-800 rounded-lg p-4"
                  >
                    <div>
                      <h3 className="font-medium text-white">{book.title}</h3>
                      <p className="text-sm text-gray-400">
                        {book.author || 'Unknown'} • {book.chapters.length} chapters •{' '}
                        <span
                          className={
                            book.book_type === 'kids' ? 'text-green-400' : 'text-yellow-400'
                          }
                        >
                          {book.book_type}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteBook(book.id)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">
              Users ({users.length})
            </h2>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            ) : users.length === 0 ? (
              <p className="text-gray-400">No users found.</p>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between bg-gray-800 rounded-lg p-4"
                  >
                    <div>
                      <h3 className="font-medium text-white">
                        {user.display_name || user.email}
                      </h3>
                      <p className="text-sm text-gray-400">
                        {user.email} •{' '}
                        <span
                          className={
                            user.user_type === 'kid' ? 'text-green-400' : 'text-blue-400'
                          }
                        >
                          {user.user_type}
                        </span>{' '}
                        •{' '}
                        <span
                          className={
                            user.role === 'admin' ? 'text-yellow-400' : 'text-gray-400'
                          }
                        >
                          {user.role}
                        </span>
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleRole(user.id, user.role)}
                      className="px-3 py-1 bg-gray-700 hover:bg-gray-600 rounded text-sm"
                    >
                      {user.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
