import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../api/client';
import type { MoveProgress } from '../../types';

interface Props {
  batchId: string;
  onComplete: () => void;
  onError: (message: string) => void;
}

export default function BulkMoveProgress({ batchId, onComplete, onError }: Props) {
  const { t } = useTranslation();
  const [progress, setProgress] = useState<MoveProgress | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const fetchProgress = async () => {
      try {
        const response = await api.get(`/admin/storage/move/progress/${batchId}`);
        const data: MoveProgress = response.data.data;
        setProgress(data);

        // Check if complete
        if (['completed', 'completed_with_errors', 'cancelled', 'stopped_on_error'].includes(data.status)) {
          clearInterval(intervalId);
          // Wait a moment before calling onComplete so user can see final status
          setTimeout(() => {
            onComplete();
          }, 2000);
        }
      } catch (err: any) {
        onError(err.response?.data?.error || t('admin.storage.progressFailed'));
      }
    };

    // Initial fetch
    fetchProgress();

    // Poll every 1 second
    intervalId = setInterval(fetchProgress, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [batchId, onComplete, onError, t]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await api.post(`/admin/storage/move/cancel/${batchId}`);
    } catch (err: any) {
      onError(err.response?.data?.error || t('admin.storage.cancelFailed'));
      setCancelling(false);
    }
  };

  const getProgressPercent = (): number => {
    if (!progress) return 0;
    const processed = progress.completedBooks + progress.failedBooks;
    return Math.round((processed / progress.totalBooks) * 100);
  };

  const getStatusColor = (): string => {
    if (!progress) return 'text-gray-400';
    switch (progress.status) {
      case 'completed':
        return 'text-green-400';
      case 'completed_with_errors':
        return 'text-yellow-400';
      case 'cancelled':
      case 'stopped_on_error':
        return 'text-red-400';
      default:
        return 'text-indigo-400';
    }
  };

  const getStatusText = (): string => {
    if (!progress) return t('admin.storage.loading');
    switch (progress.status) {
      case 'pending':
        return t('admin.storage.statusPending');
      case 'in_progress':
        return t('admin.storage.statusInProgress');
      case 'completed':
        return t('admin.storage.statusCompleted');
      case 'completed_with_errors':
        return t('admin.storage.statusCompletedWithErrors');
      case 'cancelled':
        return t('admin.storage.statusCancelled');
      case 'stopped_on_error':
        return t('admin.storage.statusStoppedOnError');
      default:
        return progress.status;
    }
  };

  const isActive = progress?.status === 'pending' || progress?.status === 'in_progress';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold text-white mb-4">
          {t('admin.storage.bulkMoveProgress')}
        </h2>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-300">
              {progress ? `${progress.completedBooks + progress.failedBooks} / ${progress.totalBooks}` : '...'}
            </span>
            <span className={getStatusColor()}>
              {getStatusText()}
            </span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${getProgressPercent()}%` }}
            />
          </div>
        </div>

        {/* Current Book */}
        {progress?.currentBook && isActive && (
          <div className="mb-4 p-3 bg-gray-700 rounded-lg">
            <p className="text-sm text-gray-400">{t('admin.storage.currentlyMoving')}:</p>
            <p className="text-white font-medium truncate">{progress.currentBook.title}</p>
          </div>
        )}

        {/* Stats */}
        {progress && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="text-center p-3 bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-green-400">{progress.completedBooks}</p>
              <p className="text-sm text-gray-400">{t('admin.storage.successful')}</p>
            </div>
            <div className="text-center p-3 bg-gray-700 rounded-lg">
              <p className="text-2xl font-bold text-red-400">{progress.failedBooks}</p>
              <p className="text-sm text-gray-400">{t('admin.storage.failed')}</p>
            </div>
          </div>
        )}

        {/* Errors */}
        {progress && progress.errors.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-red-400 mb-2">
              {t('admin.storage.errors', { count: progress.errors.length })}:
            </p>
            <div className="max-h-32 overflow-y-auto space-y-1 text-sm">
              {progress.errors.map((err, index) => (
                <div key={index} className="p-2 bg-red-900/30 rounded text-red-300">
                  <span className="font-medium">{err.title}:</span> {err.error}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {isActive ? (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white disabled:opacity-50"
            >
              {cancelling ? t('admin.storage.cancelling') : t('admin.storage.cancel')}
            </button>
          ) : (
            <button
              onClick={onComplete}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded text-white"
            >
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
