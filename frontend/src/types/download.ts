/** Status of a single downloaded episode file */
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

/** Metadata for a downloaded episode stored in IndexedDB */
export interface DownloadedEpisode {
  /** Compound key: `${bookId}:${episodeIndex}` */
  id: string;
  bookId: string;
  episodeIndex: number;
  /** Local filesystem path (Capacitor Filesystem) */
  filePath: string;
  /** File size in bytes */
  fileSize: number;
  /** ISO timestamp when download completed */
  downloadedAt: string;
  /** Original file name from server */
  fileName: string;
}

/** A download task (active, queued, or completed) */
export interface DownloadTask {
  /** Unique task ID */
  id: string;
  bookId: string;
  bookTitle: string;
  episodeIndex: number;
  episodeTitle: string;
  status: DownloadStatus;
  /** 0-100 */
  progress: number;
  /** Bytes downloaded so far */
  bytesDownloaded: number;
  /** Total bytes (0 if unknown) */
  totalBytes: number;
  /** Error message if failed */
  error: string | null;
  /** ISO timestamp when task was created */
  createdAt: string;
  /** ISO timestamp when task completed/failed */
  completedAt: string | null;
}

/** Progress update emitted during download */
export interface DownloadProgress {
  taskId: string;
  bookId: string;
  episodeIndex: number;
  progress: number;
  bytesDownloaded: number;
  totalBytes: number;
}

/** Summary of downloaded content for a single book */
export interface BookDownloadSummary {
  bookId: string;
  bookTitle: string;
  coverUrl: string | null;
  totalEpisodes: number;
  downloadedEpisodes: number;
  totalSizeBytes: number;
  episodes: DownloadedEpisode[];
}

/** Storage usage summary */
export interface StorageUsage {
  /** Total bytes used by all downloads */
  totalBytes: number;
  /** Number of downloaded episodes */
  episodeCount: number;
  /** Number of books with at least one download */
  bookCount: number;
  /** Per-book breakdown */
  byBook: Array<{
    bookId: string;
    bookTitle: string;
    sizeBytes: number;
    episodeCount: number;
  }>;
}
