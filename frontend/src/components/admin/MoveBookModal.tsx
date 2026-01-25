import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { StorageLocation, AudiobookWithStorage, BrowsePathResult } from '../../types';

interface SingleBookProps {
  book: AudiobookWithStorage;
  bookIds?: never;
  bookCount?: never;
  locations: StorageLocation[];
  onClose: () => void;
  onMoveComplete: () => void;
  onBulkMoveStart?: never;
  onError: (message: string) => void;
}

interface BulkMoveProps {
  book?: never;
  bookIds: string[];
  bookCount: number;
  locations: StorageLocation[];
  onClose: () => void;
  onMoveComplete?: never;
  onBulkMoveStart: (batchId: string) => void;
  onError: (message: string) => void;
}

type Props = SingleBookProps | BulkMoveProps;

export default function MoveBookModal(props: Props) {
  const { locations, onClose, onError } = props;
  const { t } = useTranslation();

  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [customPath, setCustomPath] = useState('');
  const [useCustomPath, setUseCustomPath] = useState(false);
  const [stopOnError, setStopOnError] = useState(false);
  const [moving, setMoving] = useState(false);

  // Path browser state
  const [showBrowser, setShowBrowser] = useState(false);
  const [browserPath, setBrowserPath] = useState<BrowsePathResult | null>(null);
  const [loadingBrowser, setLoadingBrowser] = useState(false);

  const isBulkMove = 'bookIds' in props && props.bookIds !== undefined;
  const title = isBulkMove
    ? t('admin.storage.bulkMoveTitle', { count: props.bookCount })
    : t('admin.storage.moveTitle', { title: props.book?.title });

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

  const getDestinationPath = (): string => {
    if (useCustomPath) return customPath;
    const location = locations.find(l => l.id === selectedLocation);
    return location?.basePath || '';
  };

  const handleBrowsePath = async (path: string = '') => {
    setLoadingBrowser(true);
    try {
      const response = await api.get('/admin/storage/browse-path', {
        params: { path },
      });
      setBrowserPath(response.data.data);
      setShowBrowser(true);
    } catch (err: any) {
      onError(err.response?.data?.error || t('admin.storage.browseFailed'));
    } finally {
      setLoadingBrowser(false);
    }
  };

  const handleSelectBrowserPath = (path: string) => {
    setCustomPath(path);
    setShowBrowser(false);
  };

  const handleMove = async () => {
    const destinationPath = getDestinationPath();
    if (!destinationPath) {
      onError(t('admin.storage.selectDestination'));
      return;
    }

    setMoving(true);
    try {
      if (isBulkMove) {
        const response = await api.post('/admin/storage/move/bulk', {
          audiobookIds: props.bookIds,
          destinationPath,
          stopOnError,
        });
        props.onBulkMoveStart(response.data.data.batchId);
      } else {
        await api.post('/admin/storage/move', {
          audiobookId: props.book.id,
          destinationPath,
        });
        props.onMoveComplete();
      }
    } catch (err: any) {
      onError(err.response?.data?.error || t('admin.storage.moveFailed'));
      setMoving(false);
    }
  };

  // Available locations (exclude current location for single book)
  const availableLocations = isBulkMove
    ? locations.filter(l => l.isAvailable)
    : locations.filter(l => l.isAvailable && l.basePath !== props.book?.storagePath);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            &times;
          </button>
        </div>

        {/* Book Info (single move only) */}
        {!isBulkMove && props.book && (
          <div className="mb-4 p-3 bg-gray-700 rounded-lg">
            <p className="text-white font-medium">{props.book.title}</p>
            <p className="text-sm text-gray-400">
              {props.book.author || t('common.unknown')} &bull; {formatBytes(props.book.sizeBytes)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t('admin.storage.currentLocation')}: {props.book.storagePath}
            </p>
          </div>
        )}

        {/* Destination Selection */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              {t('admin.storage.selectDestination')}
            </label>

            {/* Predefined Locations */}
            {availableLocations.length > 0 && (
              <div className="space-y-2 mb-4">
                {availableLocations.map((location) => (
                  <label
                    key={location.id}
                    className={`flex items-center p-3 rounded-lg cursor-pointer ${
                      !useCustomPath && selectedLocation === location.id
                        ? 'bg-indigo-900/50 border border-indigo-500'
                        : 'bg-gray-700 border border-transparent hover:border-gray-500'
                    }`}
                  >
                    <input
                      type="radio"
                      name="location"
                      checked={!useCustomPath && selectedLocation === location.id}
                      onChange={() => {
                        setSelectedLocation(location.id);
                        setUseCustomPath(false);
                      }}
                      className="sr-only"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{location.name}</span>
                        <span className="text-xs text-green-400">
                          {formatBytes(location.freeSpaceBytes)} {t('admin.storage.free')}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">{location.basePath}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      !useCustomPath && selectedLocation === location.id
                        ? 'border-indigo-500 bg-indigo-500'
                        : 'border-gray-500'
                    }`}>
                      {!useCustomPath && selectedLocation === location.id && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* Custom Path Option */}
            <label
              className={`flex items-start p-3 rounded-lg cursor-pointer ${
                useCustomPath
                  ? 'bg-indigo-900/50 border border-indigo-500'
                  : 'bg-gray-700 border border-transparent hover:border-gray-500'
              }`}
            >
              <input
                type="radio"
                name="location"
                checked={useCustomPath}
                onChange={() => setUseCustomPath(true)}
                className="sr-only"
              />
              <div className="flex-1">
                <span className="text-white font-medium">{t('admin.storage.customPath')}</span>
                {useCustomPath && (
                  <div className="mt-2 flex gap-2">
                    <input
                      type="text"
                      value={customPath}
                      onChange={(e) => setCustomPath(e.target.value)}
                      placeholder="G:\AudioBooks"
                      className="flex-1 px-3 py-2 bg-gray-600 border border-gray-500 rounded text-white text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => handleBrowsePath(customPath || '')}
                      disabled={loadingBrowser}
                      className="px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded text-sm text-white"
                    >
                      {t('admin.storage.browse')}
                    </button>
                  </div>
                )}
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                useCustomPath
                  ? 'border-indigo-500 bg-indigo-500'
                  : 'border-gray-500'
              }`}>
                {useCustomPath && (
                  <div className="w-2 h-2 rounded-full bg-white" />
                )}
              </div>
            </label>
          </div>

          {/* Stop on Error Option (bulk move only) */}
          {isBulkMove && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={stopOnError}
                onChange={(e) => setStopOnError(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <span className="text-sm text-gray-300">{t('admin.storage.stopOnError')}</span>
            </label>
          )}
        </div>

        {/* Path Browser Modal */}
        {showBrowser && browserPath && (
          <div className="mt-4 p-3 bg-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-300 truncate flex-1">
                {browserPath.currentPath || t('admin.storage.drives')}
              </span>
              <button
                onClick={() => setShowBrowser(false)}
                className="text-gray-400 hover:text-white ml-2"
              >
                &times;
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1">
              {browserPath.parentPath && (
                <button
                  onClick={() => handleBrowsePath(browserPath.parentPath!)}
                  className="w-full text-left px-2 py-1.5 hover:bg-gray-600 rounded text-sm text-gray-300 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                  </svg>
                  ..
                </button>
              )}
              {browserPath.items.map((item) => (
                <button
                  key={item.path}
                  onClick={() => item.type === 'directory' || item.type === 'drive'
                    ? handleBrowsePath(item.path)
                    : handleSelectBrowserPath(item.path)}
                  onDoubleClick={() => handleSelectBrowserPath(item.path)}
                  className="w-full text-left px-2 py-1.5 hover:bg-gray-600 rounded text-sm text-white flex items-center gap-2"
                >
                  <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                  {item.name}
                </button>
              ))}
            </div>

            <div className="mt-2 flex justify-end">
              <button
                onClick={() => handleSelectBrowserPath(browserPath.currentPath)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 rounded text-sm text-white"
              >
                {t('admin.storage.selectThisFolder')}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleMove}
            disabled={moving || (!selectedLocation && !customPath) || (useCustomPath && !customPath)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white disabled:opacity-50"
          >
            {moving ? t('admin.storage.moving') : t('admin.storage.startMove')}
          </button>
        </div>
      </div>
    </div>
  );
}
