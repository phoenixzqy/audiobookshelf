import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { StorageLocation, AudiobookWithStorage } from '../../types';
import MoveBookModal from './MoveBookModal';
import BulkMoveProgress from './BulkMoveProgress';

interface Props {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function StorageTab({ onError, onSuccess }: Props) {
  const { t } = useTranslation();
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [audiobooks, setAudiobooks] = useState<AudiobookWithStorage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooks, setSelectedBooks] = useState<Set<string>>(new Set());

  // Add location form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationPath, setNewLocationPath] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);

  // Move modals
  const [moveModalBook, setMoveModalBook] = useState<AudiobookWithStorage | null>(null);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [locationsRes, audiobooksRes] = await Promise.all([
        api.get('/admin/storage/locations'),
        api.get('/admin/storage/audiobooks'),
      ]);
      setLocations(locationsRes.data.data.locations);
      setAudiobooks(audiobooksRes.data.data.audiobooks);
    } catch (err: any) {
      onError(err.response?.data?.error || t('admin.storage.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim() || !newLocationPath.trim()) return;

    setAddingLocation(true);
    try {
      await api.post('/admin/storage/locations', {
        name: newLocationName.trim(),
        basePath: newLocationPath.trim(),
      });
      onSuccess(t('admin.storage.locationAdded'));
      setNewLocationName('');
      setNewLocationPath('');
      setShowAddForm(false);
      fetchData();
    } catch (err: any) {
      onError(err.response?.data?.error || t('admin.storage.addFailed'));
    } finally {
      setAddingLocation(false);
    }
  };

  const handleDeleteLocation = async (locationId: string) => {
    if (!confirm(t('admin.storage.deleteConfirm'))) return;

    try {
      await api.delete(`/admin/storage/locations/${locationId}`);
      onSuccess(t('admin.storage.locationDeleted'));
      fetchData();
    } catch (err: any) {
      onError(err.response?.data?.error || t('admin.storage.deleteFailed'));
    }
  };

  const handleSelectAll = () => {
    if (selectedBooks.size === audiobooks.length) {
      setSelectedBooks(new Set());
    } else {
      setSelectedBooks(new Set(audiobooks.map(b => b.id)));
    }
  };

  const handleSelectBook = (bookId: string) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(bookId)) {
      newSelected.delete(bookId);
    } else {
      newSelected.add(bookId);
    }
    setSelectedBooks(newSelected);
  };

  const handleMoveComplete = () => {
    setMoveModalBook(null);
    setShowBulkMoveModal(false);
    setSelectedBooks(new Set());
    fetchData();
    onSuccess(t('admin.storage.moveComplete'));
  };

  const handleBulkMoveStart = (batchId: string) => {
    setShowBulkMoveModal(false);
    setActiveBatchId(batchId);
  };

  const handleBulkMoveComplete = () => {
    setActiveBatchId(null);
    setSelectedBooks(new Set());
    fetchData();
    onSuccess(t('admin.storage.moveComplete'));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Storage Locations */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">{t('admin.storage.title')}</h2>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-sm text-white"
          >
            {showAddForm ? t('common.cancel') : t('admin.storage.addLocation')}
          </button>
        </div>

        {/* Add Location Form */}
        {showAddForm && (
          <form onSubmit={handleAddLocation} className="mb-4 p-4 bg-gray-700 rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('admin.storage.locationName')}
                </label>
                <input
                  type="text"
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="External Drive"
                  className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {t('admin.storage.basePath')}
                </label>
                <input
                  type="text"
                  value={newLocationPath}
                  onChange={(e) => setNewLocationPath(e.target.value)}
                  placeholder="G:\AudioBooks"
                  className="w-full px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={addingLocation}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white disabled:opacity-50"
              >
                {addingLocation ? t('common.loading') : t('admin.storage.addLocation')}
              </button>
            </div>
          </form>
        )}

        {/* Locations List */}
        {locations.length === 0 ? (
          <p className="text-gray-400">{t('admin.storage.noLocations')}</p>
        ) : (
          <div className="space-y-3">
            {locations.map((location) => (
              <div
                key={location.id}
                className="flex items-center justify-between bg-gray-700 rounded-lg p-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-white">{location.name}</h3>
                    <span
                      className={`px-2 py-0.5 text-xs rounded ${
                        location.isAvailable
                          ? 'bg-green-900 text-green-300'
                          : 'bg-red-900 text-red-300'
                      }`}
                    >
                      {location.isAvailable ? t('admin.storage.online') : t('admin.storage.offline')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{location.basePath}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t('admin.storage.freeSpace')}: {formatBytes(location.freeSpaceBytes)} / {formatBytes(location.totalSpaceBytes)}
                    {' • '}
                    {t('admin.storage.booksCount', { count: location.bookCount })}
                  </p>
                </div>
                {location.id !== 'default' && (
                  <button
                    onClick={() => handleDeleteLocation(location.id)}
                    className="p-2 text-red-400 hover:text-red-300 hover:bg-gray-600 rounded"
                    title={t('common.delete')}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Audiobooks with Storage Info */}
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            {t('admin.storage.audiobooksTitle', { count: audiobooks.length })}
          </h2>
          {selectedBooks.size > 0 && (
            <button
              onClick={() => setShowBulkMoveModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-sm text-white"
            >
              {t('admin.storage.moveSelected', { count: selectedBooks.size })}
            </button>
          )}
        </div>

        {audiobooks.length === 0 ? (
          <p className="text-gray-400">{t('admin.storage.noAudiobooks')}</p>
        ) : (
          <div className="space-y-2">
            {/* Select All Header */}
            <div className="flex items-center gap-3 p-2 bg-gray-700 rounded">
              <input
                type="checkbox"
                checked={selectedBooks.size === audiobooks.length && audiobooks.length > 0}
                onChange={handleSelectAll}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-300">{t('admin.storage.selectAll')}</span>
            </div>

            {/* Books List */}
            {audiobooks.map((book) => (
              <div
                key={book.id}
                className="flex items-center gap-3 p-3 bg-gray-700 rounded-lg hover:bg-gray-650"
              >
                <input
                  type="checkbox"
                  checked={selectedBooks.has(book.id)}
                  onChange={() => handleSelectBook(book.id)}
                  className="w-4 h-4 text-indigo-600 rounded"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white truncate">{book.title}</h3>
                  <p className="text-sm text-gray-400 truncate">
                    {book.author || t('common.unknown')} • {formatBytes(book.sizeBytes)}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{book.storagePath}</p>
                </div>
                <button
                  onClick={() => setMoveModalBook(book)}
                  className="px-3 py-1.5 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white flex items-center gap-1"
                  title={t('admin.storage.move')}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                  {t('admin.storage.move')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Single Book Move Modal */}
      {moveModalBook && (
        <MoveBookModal
          book={moveModalBook}
          locations={locations}
          onClose={() => setMoveModalBook(null)}
          onMoveComplete={handleMoveComplete}
          onError={onError}
        />
      )}

      {/* Bulk Move Modal */}
      {showBulkMoveModal && (
        <MoveBookModal
          bookIds={Array.from(selectedBooks)}
          bookCount={selectedBooks.size}
          locations={locations}
          onClose={() => setShowBulkMoveModal(false)}
          onBulkMoveStart={handleBulkMoveStart}
          onError={onError}
        />
      )}

      {/* Bulk Move Progress */}
      {activeBatchId && (
        <BulkMoveProgress
          batchId={activeBatchId}
          onComplete={handleBulkMoveComplete}
          onError={onError}
        />
      )}
    </div>
  );
}
