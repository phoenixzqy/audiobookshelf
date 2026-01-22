import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Audio streaming service with HTTP Range request support.
 * This enables efficient streaming of large audio files (1GB+) by sending
 * only the requested byte ranges instead of the entire file.
 */
class AudioStreamService {
  private storageDir: string;

  constructor() {
    this.storageDir = path.join(__dirname, '..', '..', 'storage');
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
   */
  async streamAudio(req: Request, res: Response, relativePath: string): Promise<void> {
    const filePath = path.join(this.storageDir, relativePath);

    // Security: Ensure path doesn't escape storage directory
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(path.resolve(this.storageDir))) {
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

        stream.on('error', (err) => {
          console.error('Stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Stream error' });
          }
        });

        stream.pipe(res);
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

        stream.on('error', (err) => {
          console.error('Stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Stream error' });
          }
        });

        stream.pipe(res);
      }
    } catch (error: any) {
      console.error('Audio stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error.message });
      }
    }
  }

  /**
   * Get file size without reading the entire file
   */
  getFileSize(relativePath: string): number | null {
    const filePath = path.join(this.storageDir, relativePath);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(path.resolve(this.storageDir))) {
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
