/**
 * Download Service
 *
 * Manages downloading audiobook episodes to local storage.
 * Uses @capacitor/filesystem for native file I/O (Android only).
 * No-op on web platform.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { platformService } from './platformService';
import { indexedDBService } from './indexedDB';
import { getApiBaseUrl } from '../config/appConfig';
import { useAuthStore } from '../stores/authStore';
import type { DownloadedEpisode, DownloadTask, DownloadProgress } from '../types/download';

const MAX_CONCURRENT = 2;
const DOWNLOAD_DIR = 'audiobooks';

type ProgressListener = (progress: DownloadProgress) => void;
type TaskChangeListener = (task: DownloadTask) => void;

class DownloadService {
  private activeDownloads = new Map<string, AbortController>();
  private queue: DownloadTask[] = [];
  private processing = 0;
  private progressListeners: ProgressListener[] = [];
  private taskChangeListeners: TaskChangeListener[] = [];

  /** Check if downloads are supported (Android native only) */
  get isSupported(): boolean {
    return platformService.isNative && !platformService.isHarmonyOS;
  }

  // --- Listeners ---

  onProgress(listener: ProgressListener): () => void {
    this.progressListeners.push(listener);
    return () => {
      const idx = this.progressListeners.indexOf(listener);
      if (idx >= 0) this.progressListeners.splice(idx, 1);
    };
  }

  onTaskChange(listener: TaskChangeListener): () => void {
    this.taskChangeListeners.push(listener);
    return () => {
      const idx = this.taskChangeListeners.indexOf(listener);
      if (idx >= 0) this.taskChangeListeners.splice(idx, 1);
    };
  }

  // --- Download operations ---

  /** Download a single episode */
  async downloadEpisode(
    bookId: string,
    episodeIndex: number,
    bookTitle: string,
    episodeTitle: string,
    _fileName: string
  ): Promise<string> {
    if (!this.isSupported) return '';

    const taskId = `${bookId}:${episodeIndex}:${Date.now()}`;
    const task: DownloadTask = {
      id: taskId,
      bookId,
      bookTitle,
      episodeIndex,
      episodeTitle,
      status: 'pending',
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      error: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };

    await indexedDBService.saveDownloadTask(task);
    this.notifyTaskChange(task);
    this.queue.push(task);
    this.processQueue();

    return taskId;
  }

  /** Download a range of episodes */
  async downloadEpisodeRange(
    bookId: string,
    startEp: number,
    endEp: number,
    bookTitle: string,
    episodes: Array<{ index: number; title: string; file: string }>
  ): Promise<string[]> {
    const taskIds: string[] = [];
    for (let i = startEp; i <= endEp; i++) {
      const ep = episodes.find(e => e.index === i);
      if (!ep) continue;

      // Skip already downloaded
      const existing = await this.isEpisodeDownloaded(bookId, i);
      if (existing) continue;

      const taskId = await this.downloadEpisode(bookId, i, bookTitle, ep.title, ep.file);
      taskIds.push(taskId);
    }
    return taskIds;
  }

  /** Download all episodes of a book */
  async downloadBook(
    bookId: string,
    bookTitle: string,
    episodes: Array<{ index: number; title: string; file: string }>
  ): Promise<string[]> {
    return this.downloadEpisodeRange(bookId, 0, episodes.length - 1, bookTitle, episodes);
  }

  /** Cancel a download task */
  async cancelDownload(taskId: string): Promise<void> {
    // Cancel active download
    const controller = this.activeDownloads.get(taskId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(taskId);
    }

    // Remove from queue
    this.queue = this.queue.filter(t => t.id !== taskId);

    // Update task status
    const task = await indexedDBService.getDownloadTask(taskId);
    if (task && task.status !== 'completed') {
      task.status = 'cancelled';
      task.completedAt = new Date().toISOString();
      await indexedDBService.saveDownloadTask(task);
      this.notifyTaskChange(task);
    }
  }

  /** Delete a downloaded episode file */
  async deleteDownload(bookId: string, episodeIndex: number): Promise<void> {
    if (!this.isSupported) return;

    const id = `${bookId}:${episodeIndex}`;
    const download = await indexedDBService.getDownload(id);
    if (download) {
      try {
        await Filesystem.deleteFile({
          path: download.filePath,
          directory: Directory.Data,
        });
      } catch (err) {
        console.warn('[Download] Failed to delete file:', err);
      }
      await indexedDBService.deleteDownload(id);
    }
  }

  /** Delete all downloaded episodes for a book */
  async deleteBookDownloads(bookId: string): Promise<void> {
    if (!this.isSupported) return;

    const downloads = await indexedDBService.getDownloadsByBook(bookId);
    for (const download of downloads) {
      try {
        await Filesystem.deleteFile({
          path: download.filePath,
          directory: Directory.Data,
        });
      } catch {
        // Continue deleting others
      }
    }
    await indexedDBService.deleteDownloadsByBook(bookId);
  }

  /** Check if an episode is downloaded */
  async isEpisodeDownloaded(bookId: string, episodeIndex: number): Promise<boolean> {
    if (!this.isSupported) return false;
    const id = `${bookId}:${episodeIndex}`;
    const download = await indexedDBService.getDownload(id);
    return !!download;
  }

  /** Get local file URI for a downloaded episode (for playback) */
  async getLocalFileUri(bookId: string, episodeIndex: number): Promise<string | null> {
    if (!this.isSupported) return null;

    const id = `${bookId}:${episodeIndex}`;
    const download = await indexedDBService.getDownload(id);
    if (!download) return null;

    try {
      const result = await Filesystem.getUri({
        path: download.filePath,
        directory: Directory.Data,
      });
      return (window as any).Capacitor?.convertFileSrc?.(result.uri) || result.uri;
    } catch {
      // File missing — clean up metadata
      await indexedDBService.deleteDownload(id);
      return null;
    }
  }

  /** Get all downloaded episodes for a book */
  async getDownloadedEpisodes(bookId: string): Promise<DownloadedEpisode[]> {
    return indexedDBService.getDownloadsByBook(bookId);
  }

  /** Get storage usage summary */
  async getStorageUsage(): Promise<{ totalBytes: number; episodeCount: number; bookCount: number }> {
    const allDownloads = await indexedDBService.getAllDownloads();
    const bookIds = new Set(allDownloads.map(d => d.bookId));
    const totalBytes = allDownloads.reduce((sum, d) => sum + d.fileSize, 0);
    return {
      totalBytes,
      episodeCount: allDownloads.length,
      bookCount: bookIds.size,
    };
  }

  /** Get all active/pending tasks */
  async getActiveTasks(): Promise<DownloadTask[]> {
    const pending = await indexedDBService.getDownloadTasksByStatus('pending');
    const downloading = await indexedDBService.getDownloadTasksByStatus('downloading');
    return [...downloading, ...pending];
  }

  // --- Internal queue processing ---

  private async processQueue() {
    while (this.processing < MAX_CONCURRENT && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.processing++;
      this.executeDownload(task).finally(() => {
        this.processing--;
        this.processQueue();
      });
    }
  }

  private async executeDownload(task: DownloadTask): Promise<void> {
    const controller = new AbortController();
    this.activeDownloads.set(task.id, controller);

    try {
      // Update status
      task.status = 'downloading';
      await indexedDBService.saveDownloadTask(task);
      this.notifyTaskChange(task);

      // Get episode stream URL
      const { accessToken } = useAuthStore.getState();
      const streamUrl = `${getApiBaseUrl()}/books/${task.bookId}/episodes/${task.episodeIndex}/stream?token=${accessToken}`;

      // Download via fetch with progress tracking
      const response = await fetch(streamUrl, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
      task.totalBytes = contentLength;

      // Read the response as arraybuffer (simpler for Filesystem write)
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const chunks: Uint8Array[] = [];
      let downloaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        downloaded += value.length;

        // Update progress
        task.bytesDownloaded = downloaded;
        task.progress = contentLength > 0 ? Math.round((downloaded / contentLength) * 100) : 0;

        this.notifyProgress({
          taskId: task.id,
          bookId: task.bookId,
          episodeIndex: task.episodeIndex,
          progress: task.progress,
          bytesDownloaded: downloaded,
          totalBytes: contentLength,
        });
      }

      // Combine chunks
      const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Convert to base64 for Filesystem.writeFile
      const base64 = this.uint8ArrayToBase64(combined);

      // Determine file extension from original file name or default to .mp3
      const ext = task.episodeTitle.match(/\.\w+$/)?.[0] || '.mp3';
      const filePath = `${DOWNLOAD_DIR}/${task.bookId}/${task.episodeIndex}${ext}`;

      // Ensure directory exists
      try {
        await Filesystem.mkdir({
          path: `${DOWNLOAD_DIR}/${task.bookId}`,
          directory: Directory.Data,
          recursive: true,
        });
      } catch {
        // Directory may already exist
      }

      // Write file
      await Filesystem.writeFile({
        path: filePath,
        data: base64,
        directory: Directory.Data,
      });

      // Save metadata
      const downloadMeta: DownloadedEpisode = {
        id: `${task.bookId}:${task.episodeIndex}`,
        bookId: task.bookId,
        episodeIndex: task.episodeIndex,
        filePath,
        fileSize: totalLength,
        downloadedAt: new Date().toISOString(),
        fileName: task.episodeTitle,
      };
      await indexedDBService.saveDownload(downloadMeta);

      // Mark task complete
      task.status = 'completed';
      task.progress = 100;
      task.bytesDownloaded = totalLength;
      task.completedAt = new Date().toISOString();
      await indexedDBService.saveDownloadTask(task);
      this.notifyTaskChange(task);

    } catch (err: any) {
      if (err.name === 'AbortError') {
        task.status = 'cancelled';
      } else {
        task.status = 'failed';
        task.error = err.message || 'Download failed';
        console.error('[Download] Failed:', task.bookId, task.episodeIndex, err);
      }
      task.completedAt = new Date().toISOString();
      await indexedDBService.saveDownloadTask(task);
      this.notifyTaskChange(task);
    } finally {
      this.activeDownloads.delete(task.id);
    }
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private notifyProgress(progress: DownloadProgress) {
    for (const listener of this.progressListeners) {
      try { listener(progress); } catch {}
    }
  }

  private notifyTaskChange(task: DownloadTask) {
    for (const listener of this.taskChangeListeners) {
      try { listener(task); } catch {}
    }
  }
}

export const downloadService = new DownloadService();
