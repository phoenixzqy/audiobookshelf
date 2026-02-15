import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { query } from '../config/database';

/**
 * Audio streaming service with HTTP Range request support.
 * This enables efficient streaming of large audio files (1GB+) by sending
 * only the requested byte ranges instead of the entire file.
 */
class AudioStreamService {
  private defaultStorageDir: string;

  constructor() {
    this.defaultStorageDir = path.join(__dirname, '..', '..', 'storage');
  }

  /**
   * Get the base storage path for a given storage config ID.
   * Returns the custom storage path if configured, otherwise the default.
   */
  private async getStorageBasePath(storageConfigId: string | null): Promise<string> {
    if (!storageConfigId) {
      return this.defaultStorageDir;
    }

    try {
      const result = await query(
        `SELECT container_name FROM storage_configs WHERE id = $1 AND blob_endpoint = 'local'`,
        [storageConfigId]
      );

      if (result.rows.length > 0 && result.rows[0].container_name) {
        return result.rows[0].container_name;
      }
    } catch (error) {
      console.error('Error fetching storage config:', error);
    }

    return this.defaultStorageDir;
  }

  /**
   * Get MIME type for audio file
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.mp3':
        return 'audio/mpeg';
      case '.m4b':
      case '.m4a':
        return 'audio/mp4';
      case '.ogg':
        return 'audio/ogg';
      case '.wav':
        return 'audio/wav';
      case '.flac':
        return 'audio/flac';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Stream audio file with Range request support
   *
   * @param req - Express request
   * @param res - Express response
   * @param relativePath - Path relative to storage directory (e.g., "audiobooks/book-id/episode.mp3")
   * @param storageConfigId - Optional storage config ID for custom storage locations
   */
  async streamAudio(req: Request, res: Response, relativePath: string, storageConfigId: string | null = null): Promise<void> {
    const storageDir = await this.getStorageBasePath(storageConfigId);
    const filePath = path.join(storageDir, relativePath);

    // Security: Ensure path doesn't escape storage directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(storageDir))) {
      res.status(403).json({ success: false, error: 'Access denied' });
      return;
    }

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      const fileSize = stat.size;
      const mimeType = this.getMimeType(resolvedPath);

      const range = req.headers.range;

      if (range) {
        // Parse Range header (e.g., "bytes=0-999999")
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        // Validate range
        if (start >= fileSize || end >= fileSize || start > end) {
          res.status(416).set({
            'Content-Range': `bytes */${fileSize}`,
          }).end();
          return;
        }

        const chunkSize = end - start + 1;

        res.status(206).set({
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        });

        // Create read stream for the specified range
        const stream = fs.createReadStream(resolvedPath, { start, end });
        this.pipeWithCleanup(stream, req, res);
      } else {
        // No Range header - send entire file
        // For large files, we still use streaming to avoid memory issues
        res.status(200).set({
          'Accept-Ranges': 'bytes',
          'Content-Length': fileSize,
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        });

        const stream = fs.createReadStream(resolvedPath);
        this.pipeWithCleanup(stream, req, res);
      }
    } catch (error: any) {
      console.error('Audio stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  /**
   * Pipe a read stream to the response, ensuring the stream is destroyed
   * when the client disconnects or an error occurs. Without this, abandoned
   * streams leak file descriptors and internal buffers over time.
   */
  private pipeWithCleanup(stream: fs.ReadStream, req: Request, res: Response): void {
    stream.on('error', (err) => {
      console.error('Stream error:', err);
      stream.destroy();
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Stream error' });
      }
    });

    // Destroy the read stream when the client disconnects mid-transfer
    req.on('close', () => {
      if (!stream.destroyed) {
        stream.destroy();
      }
    });

    stream.pipe(res);
  }

  /**
   * Get file size without reading the entire file
   */
  async getFileSize(relativePath: string, storageConfigId: string | null = null): Promise<number | null> {
    const storageDir = await this.getStorageBasePath(storageConfigId);
    const filePath = path.join(storageDir, relativePath);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(path.resolve(storageDir))) {
      return null;
    }

    if (!fs.existsSync(resolvedPath)) {
      return null;
    }

    const stat = fs.statSync(resolvedPath);
    return stat.size;
  }
}

export const audioStreamService = new AudioStreamService();
