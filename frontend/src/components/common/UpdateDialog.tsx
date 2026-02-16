/**
 * UpdateDialog — Modal for in-app APK update
 *
 * Shows version info, release notes, download progress, and install trigger.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, X, CheckCircle, AlertCircle } from 'lucide-react';
import { type UpdateInfo, downloadAndInstall, getUpdateLogs } from '../../services/appUpdateService';

interface UpdateDialogProps {
  updateInfo: UpdateInfo;
  onClose: () => void;
}

export function UpdateDialog({ updateInfo, onClose }: UpdateDialogProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'downloading' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  const handleUpdate = async () => {
    setStatus('downloading');
    setProgress(0);
    setError('');
    setShowLogs(false);

    try {
      await downloadAndInstall(updateInfo.downloadUrl, (p) => setProgress(p));
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
      setStatus('error');
    }
  };

  const logs = getUpdateLogs();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-800 rounded-2xl w-full max-w-sm shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">
            {t('update.title', 'Update Available')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Version comparison */}
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-gray-400">{t('update.current', 'Current')}</p>
              <p className="text-white font-mono">v{updateInfo.currentVersion}</p>
            </div>
            <div className="text-gray-500 text-xl">→</div>
            <div className="text-right">
              <p className="text-gray-400">{t('update.latest', 'Latest')}</p>
              <p className="text-green-400 font-mono font-semibold">v{updateInfo.latestVersion}</p>
            </div>
          </div>

          {/* Release notes preview */}
          {updateInfo.releaseNotes && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-xs text-gray-400 mb-1">{t('update.whatsNew', "What's New")}</p>
              <p className="text-sm text-gray-300 whitespace-pre-line line-clamp-6">
                {updateInfo.releaseNotes.slice(0, 500)}
              </p>
            </div>
          )}

          {/* Progress bar */}
          {status === 'downloading' && (
            <div>
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>{t('update.downloading', 'Downloading...')}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Done status */}
          {status === 'done' && (
            <div className="flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle className="w-5 h-5" />
              <span>{t('update.ready', 'Ready to install')}</span>
            </div>
          )}

          {/* Error status */}
          {status === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-red-400 text-sm">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="break-words">{error}</span>
              </div>
              <button
                onClick={() => setShowLogs(!showLogs)}
                className="text-xs text-gray-500 hover:text-gray-300 underline"
              >
                {showLogs ? 'Hide Logs' : 'Show Debug Logs'}
              </button>
            </div>
          )}

          {/* Debug logs */}
          {showLogs && logs.length > 0 && (
            <div className="bg-gray-900 rounded-lg p-3 max-h-40 overflow-y-auto font-mono text-xs">
              {logs.map((entry, i) => (
                <div key={i} className={`${entry.status === 'error' ? 'text-red-400' : entry.status === 'ok' ? 'text-green-400' : 'text-gray-400'}`}>
                  [{entry.step}] {entry.message}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg bg-gray-700 text-gray-300 text-sm font-medium hover:bg-gray-600 transition-colors"
          >
            {t('update.later', 'Later')}
          </button>
          <button
            onClick={handleUpdate}
            disabled={status === 'downloading'}
            className="flex-1 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            {status === 'downloading'
              ? t('update.downloading', 'Downloading...')
              : status === 'error'
              ? t('update.retry', 'Retry')
              : t('update.updateNow', 'Update Now')}
          </button>
        </div>
      </div>
    </div>
  );
}
