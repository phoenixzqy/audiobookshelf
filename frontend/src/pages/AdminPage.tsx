import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import type { Audiobook, User } from '../types';

interface EpisodeMeta {
  title: string;
  duration: number;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<'books' | 'users' | 'upload'>('books');
  const [books, setBooks] = useState<Audiobook[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Upload form state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadCover, setUploadCover] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadAuthor, setUploadAuthor] = useState('');
  const [uploadType, setUploadType] = useState<'adult' | 'kids'>('adult');
  const [uploading, setUploading] = useState(false);
  const [chapterMetas, setChapterMetas] = useState<EpisodeMeta[]>([]);

  // Add episode to existing book state
  const [selectedBookId, setSelectedBookId] = useState<string>('');
  const [addEpisodeFiles, setAddEpisodeFiles] = useState<File[]>([]);
  const [addingEpisodes, setAddingEpisodes] = useState(false);

  // Edit book modal state
  const [editingBook, setEditingBook] = useState<Audiobook | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAuthor, setEditAuthor] = useState('');
  const [editNarrator, setEditNarrator] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editBookType, setEditBookType] = useState<'adult' | 'kids'>('adult');
  const [editEpisodes, setEditEpisodes] = useState<EpisodeMeta[]>([]);
  const [saving, setSaving] = useState(false);

  // Refs for file inputs
  const folderInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  const addEpisodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeTab === 'books') {
      fetchBooks();
    } else if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  // Update episode metas when files change
  useEffect(() => {
    const metas = uploadFiles.map((file, index) => ({
      title: file.name.replace(/\.[^/.]+$/, '') || `Episode ${index + 1}`,
      duration: 0,
    }));
    setChapterMetas(metas);
  }, [uploadFiles]);

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const response = await api.get('/books');
      setBooks(response.data.data.books);
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
      setUsers(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // Handle folder selection (via webkitdirectory)
  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      // Filter for audio files and sort by name
      const audioFiles = Array.from(files)
        .filter(file => file.type.startsWith('audio/') ||
                       file.name.endsWith('.mp3') ||
                       file.name.endsWith('.m4b') ||
                       file.name.endsWith('.m4a'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setUploadFiles(audioFiles);
    }
  };

  // Handle multiple file selection
  const handleFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const audioFiles = Array.from(files)
        .filter(file => file.type.startsWith('audio/') ||
                       file.name.endsWith('.mp3') ||
                       file.name.endsWith('.m4b') ||
                       file.name.endsWith('.m4a'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setUploadFiles(audioFiles);
    }
  };

  // Handle cover selection
  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setUploadCover(file);
    }
  };

  // Update episode title
  const updateEpisodeTitle = (index: number, title: string) => {
    setChapterMetas(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], title };
      return updated;
    });
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadFiles.length === 0) {
      setError('Please select audio files');
      return;
    }

    setUploading(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('title', uploadTitle);
    formData.append('author', uploadAuthor);
    formData.append('bookType', uploadType);

    // Add cover if provided
    if (uploadCover) {
      formData.append('cover', uploadCover);
    }

    // Add audio files
    uploadFiles.forEach(file => {
      formData.append('audioFiles', file);
    });

    // Add chapters metadata
    formData.append('chapters', JSON.stringify(chapterMetas));

    try {
      await api.post('/admin/books', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Book uploaded successfully!');
      resetUploadForm();
      setActiveTab('books');
      fetchBooks();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadFiles([]);
    setUploadCover(null);
    setUploadTitle('');
    setUploadAuthor('');
    setChapterMetas([]);
    if (folderInputRef.current) folderInputRef.current.value = '';
    if (filesInputRef.current) filesInputRef.current.value = '';
  };

  // Handle adding episodes to existing book
  const handleAddEpisodeFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const audioFiles = Array.from(files)
        .filter(file => file.type.startsWith('audio/') ||
                       file.name.endsWith('.mp3') ||
                       file.name.endsWith('.m4b') ||
                       file.name.endsWith('.m4a'))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      setAddEpisodeFiles(audioFiles);
    }
  };

  const handleAddEpisodes = async () => {
    if (!selectedBookId || addEpisodeFiles.length === 0) {
      setError('Please select a book and audio files');
      return;
    }

    setAddingEpisodes(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    addEpisodeFiles.forEach(file => {
      formData.append('audioFiles', file);
    });

    // Auto-generate episode metadata
    const episodes = addEpisodeFiles.map((file, index) => ({
      title: file.name.replace(/\.[^/.]+$/, '') || `New Episode ${index + 1}`,
      duration: 0,
    }));
    formData.append('chapters', JSON.stringify(episodes));

    try {
      await api.post(`/admin/books/${selectedBookId}/episodes`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setSuccess('Episodes added successfully!');
      setAddEpisodeFiles([]);
      setSelectedBookId('');
      if (addEpisodeInputRef.current) addEpisodeInputRef.current.value = '';
      fetchBooks();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add episodes');
    } finally {
      setAddingEpisodes(false);
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

  // Open edit modal with book data
  const openEditModal = (book: Audiobook) => {
    setEditingBook(book);
    setEditTitle(book.title);
    setEditAuthor(book.author || '');
    setEditNarrator(book.narrator || '');
    setEditDescription(book.description || '');
    setEditBookType(book.book_type);
    setEditEpisodes(book.episodes.map(ep => ({ title: ep.title, duration: ep.duration })));
  };

  // Close edit modal
  const closeEditModal = () => {
    setEditingBook(null);
    setEditTitle('');
    setEditAuthor('');
    setEditNarrator('');
    setEditDescription('');
    setEditBookType('adult');
    setEditEpisodes([]);
  };

  // Update episode title in edit modal
  const updateEditEpisodeTitle = (index: number, title: string) => {
    setEditEpisodes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], title };
      return updated;
    });
  };

  // Save book changes
  const handleSaveBook = async () => {
    if (!editingBook) return;

    setSaving(true);
    setError('');

    try {
      // Build updated episodes with original file and index info
      const updatedEpisodes = editingBook.episodes.map((ep, idx) => ({
        ...ep,
        title: editEpisodes[idx]?.title || ep.title,
      }));

      await api.put(`/admin/books/${editingBook.id}`, {
        title: editTitle,
        author: editAuthor || null,
        narrator: editNarrator || null,
        description: editDescription || null,
        book_type: editBookType,
        episodes: updatedEpisodes,
      });

      setSuccess('Book updated successfully!');
      closeEditModal();
      fetchBooks();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update book');
    } finally {
      setSaving(false);
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
            <button onClick={() => setError('')} className="float-right text-red-300 hover:text-white">×</button>
          </div>
        )}
        {success && (
          <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-3 rounded mb-4">
            {success}
            <button onClick={() => setSuccess('')} className="float-right text-green-300 hover:text-white">×</button>
          </div>
        )}

        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-8">
            {/* New Book Upload */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Upload New Audiobook</h2>
              <form onSubmit={handleUpload} className="space-y-4">
                {/* Audio File Selection */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Audio Files
                  </label>
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">Select Folder</label>
                      <input
                        ref={folderInputRef}
                        type="file"
                        // @ts-ignore - webkitdirectory is not in types
                        webkitdirectory=""
                        directory=""
                        multiple
                        onChange={handleFolderSelect}
                        className="block w-full text-gray-400 text-sm"
                      />
                    </div>
                    <div className="text-gray-500 self-end pb-2">or</div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">Select Files</label>
                      <input
                        ref={filesInputRef}
                        type="file"
                        accept="audio/*"
                        multiple
                        onChange={handleFilesSelect}
                        className="block w-full text-gray-400 text-sm"
                      />
                    </div>
                  </div>
                  {uploadFiles.length > 0 && (
                    <p className="text-sm text-indigo-400">
                      {uploadFiles.length} audio file(s) selected
                    </p>
                  )}
                </div>

                {/* Cover Image */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Cover Image (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCoverSelect}
                    className="block w-full text-gray-400 text-sm"
                  />
                  {uploadCover && (
                    <div className="mt-2 flex items-center gap-2">
                      <img
                        src={URL.createObjectURL(uploadCover)}
                        alt="Cover preview"
                        className="w-16 h-16 object-cover rounded"
                      />
                      <button
                        type="button"
                        onClick={() => setUploadCover(null)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {/* Title and Author */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
                    <input
                      type="text"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Author</label>
                    <input
                      type="text"
                      value={uploadAuthor}
                      onChange={(e) => setUploadAuthor(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                    />
                  </div>
                </div>

                {/* Content Type */}
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

                {/* Episode List */}
                {chapterMetas.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Episodes ({chapterMetas.length})
                    </label>
                    <div className="max-h-60 overflow-y-auto space-y-2 bg-gray-700 rounded p-2">
                      {chapterMetas.map((episode, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <span className="text-gray-500 text-sm w-8">{index + 1}.</span>
                          <input
                            type="text"
                            value={episode.title}
                            onChange={(e) => updateEpisodeTitle(index, e.target.value)}
                            className="flex-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={uploading || uploadFiles.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload Book'}
                </button>
              </form>
            </div>

            {/* Add Episodes to Existing Book */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Add Episodes to Existing Book</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Select Book</label>
                  <select
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  >
                    <option value="">-- Select a book --</option>
                    {books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.title} ({book.episodes.length} episodes)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Audio Files to Add
                  </label>
                  <input
                    ref={addEpisodeInputRef}
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleAddEpisodeFiles}
                    className="block w-full text-gray-400 text-sm"
                  />
                  {addEpisodeFiles.length > 0 && (
                    <p className="text-sm text-indigo-400 mt-1">
                      {addEpisodeFiles.length} file(s) selected
                    </p>
                  )}
                </div>

                <button
                  onClick={handleAddEpisodes}
                  disabled={addingEpisodes || !selectedBookId || addEpisodeFiles.length === 0}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
                >
                  {addingEpisodes ? 'Adding...' : 'Add Episodes'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Books Tab */}
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
                    <div className="flex items-center gap-4">
                      {book.cover_url ? (
                        <img
                          src={book.cover_url}
                          alt={book.title}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-700 rounded flex items-center justify-center">
                          📚
                        </div>
                      )}
                      <div>
                        <h3 className="font-medium text-white">{book.title}</h3>
                        <p className="text-sm text-gray-400">
                          {book.author || 'Unknown'} • {book.episodes.length} episodes •{' '}
                          <span
                            className={
                              book.book_type === 'kids' ? 'text-green-400' : 'text-yellow-400'
                            }
                          >
                            {book.book_type}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEditModal(book)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 rounded text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteBook(book.id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
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

      {/* Edit Book Modal */}
      {editingBook && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-white">Edit Book</h2>
              <button
                onClick={closeEditModal}
                className="text-gray-400 hover:text-white text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  required
                />
              </div>

              {/* Author & Narrator */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Author</label>
                  <input
                    type="text"
                    value={editAuthor}
                    onChange={(e) => setEditAuthor(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Narrator</label>
                  <input
                    type="text"
                    value={editNarrator}
                    onChange={(e) => setEditNarrator(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                />
              </div>

              {/* Content Type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Content Type</label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="adult"
                      checked={editBookType === 'adult'}
                      onChange={() => setEditBookType('adult')}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Adult</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      value="kids"
                      checked={editBookType === 'kids'}
                      onChange={() => setEditBookType('kids')}
                      className="mr-2"
                    />
                    <span className="text-gray-300">Kids</span>
                  </label>
                </div>
              </div>

              {/* Episodes */}
              {editEpisodes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Episodes ({editEpisodes.length})
                  </label>
                  <div className="max-h-48 overflow-y-auto space-y-2 bg-gray-700 rounded p-2">
                    {editEpisodes.map((episode, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="text-gray-500 text-sm w-8">{index + 1}.</span>
                        <input
                          type="text"
                          value={episode.title}
                          onChange={(e) => updateEditEpisodeTitle(index, e.target.value)}
                          className="flex-1 px-2 py-1 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                <button
                  onClick={closeEditModal}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBook}
                  disabled={saving || !editTitle}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
