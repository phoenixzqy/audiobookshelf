import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { audiobookService } from '../services/audiobookService';
import { storageService } from '../services/storageService';
import { audioStreamService } from '../services/audioStreamService';
import { config } from '../config/env';
import { query } from '../config/database';
import { AuthRequest } from '../types';

export const getBooks = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { limit, offset, page, bookType } = req.query;

    // Support both offset-based and page-based pagination
    const pageSize = limit ? parseInt(limit as string) : 20;
    let offsetValue: number;
    let currentPage: number;

    if (page) {
      currentPage = Math.max(1, parseInt(page as string));
      offsetValue = (currentPage - 1) * pageSize;
    } else {
      offsetValue = offset ? parseInt(offset as string) : 0;
      currentPage = Math.floor(offsetValue / pageSize) + 1;
    }

    // Build filters from content filter middleware + query params
    const filters: {
      bookType?: 'adult' | 'kids';
      isPublished?: boolean;
      limit: number;
      offset: number;
      userId?: string;
    } = {
      limit: pageSize,
      offset: offsetValue,
    };

    // Pass userId for sorting by history
    if (authReq.user?.id) {
      filters.userId = authReq.user.id;
    }

    // Apply content filter (is_published, book_type from middleware)
    if (authReq.contentFilter) {
      if (authReq.contentFilter.is_published !== undefined) {
        filters.isPublished = authReq.contentFilter.is_published;
      }
      if (authReq.contentFilter.book_type) {
        filters.bookType = authReq.contentFilter.book_type;
      }
    }

    // Allow bookType query param to further filter (but not override kid restrictions)
    if (bookType && (bookType === 'adult' || bookType === 'kids')) {
      // Kids can only see kids books - don't allow them to override
      if (authReq.user?.user_type !== 'kid') {
        filters.bookType = bookType;
      }
    }

    const result = await audiobookService.getBooks(filters);
    const totalPages = Math.ceil(result.total / pageSize);

    res.json({
      success: true,
      data: {
        books: result.books,
        total: result.total,
        page: currentPage,
        limit: pageSize,
        totalPages,
        hasMore: currentPage < totalPages,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getBookById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    // Apply content filtering
    if (authReq.user?.user_type === 'kid' && book.book_type !== 'kids') {
      res.status(403).json({
        success: false,
        error: 'Access denied',
      });
      return;
    }

    if (!book.is_published && authReq.user?.role !== 'admin') {
      res.status(403).json({
        success: false,
        error: 'Book not published',
      });
      return;
    }

    res.json({
      success: true,
      data: book,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getEpisodeUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, episodeIndex } = req.params;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    const index = parseInt(episodeIndex);
    if (index < 0 || index >= book.episodes.length) {
      res.status(400).json({
        success: false,
        error: 'Invalid episode index',
      });
      return;
    }

    const episode = book.episodes[index];
    const episodePath = `${book.blob_path}/${episode.file}`;

    const sasUrl = await storageService.generateSasUrl(
      book.storage_config_id,
      'audiobooks',
      episodePath
    );

    res.json({
      success: true,
      data: {
        url: sasUrl,
        expiresIn: 3600, // 1 hour in seconds
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get bulk episode URLs for prefetching.
 * Returns up to 100 episode URLs at once to enable background playback
 * without requiring HTTP requests during episode transitions.
 *
 * Query params:
 * - start: Starting episode index (0-based, default 0)
 * - count: Number of episodes to fetch (default 100, max 100)
 */
export const getBulkEpisodeUrls = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const start = Math.max(0, parseInt(req.query.start as string) || 0);
    const count = Math.min(Math.max(1, parseInt(req.query.count as string) || 100), 100);

    const book = await audiobookService.getBookById(id);

    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    const totalEpisodes = book.episodes?.length || 0;

    // Validate start index
    if (start >= totalEpisodes) {
      res.status(400).json({
        success: false,
        error: `Start index ${start} exceeds total episodes ${totalEpisodes}`,
      });
      return;
    }

    const actualEnd = Math.min(start + count, totalEpisodes);
    const expiryMinutes = 60; // 1 hour

    // Generate URLs in parallel for better performance
    const urlPromises = [];
    for (let i = start; i < actualEnd; i++) {
      const episode = book.episodes[i];
      const episodePath = `${book.blob_path}/${episode.file}`;

      urlPromises.push(
        storageService.generateSasUrl(
          book.storage_config_id,
          'audiobooks',
          episodePath,
          expiryMinutes
        ).then(url => ({
          index: i,
          url,
          expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
        }))
      );
    }

    const urls = await Promise.all(urlPromises);

    res.json({
      success: true,
      data: {
        urls,
        totalEpisodes,
        batchStart: start,
        batchEnd: actualEnd - 1,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Stream episode audio with HTTP Range request support.
 * This is optimized for large audio files (1GB+) - only the requested
 * byte range is read and sent, not the entire file.
 *
 * For local storage: streams directly from disk with Range support
 * For Azure storage: redirects to SAS URL (Azure handles Range requests)
 */
export const streamEpisode = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, episodeIndex } = req.params;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    const index = parseInt(episodeIndex);
    if (index < 0 || index >= book.episodes.length) {
      res.status(400).json({
        success: false,
        error: 'Invalid episode index',
      });
      return;
    }

    const episode = book.episodes[index];
    const episodePath = `audiobooks/${book.blob_path}/${episode.file}`;

    if (config.storage.useLocal) {
      // For local storage, use our streaming service with Range support
      // Pass the storage_config_id to handle books in custom storage locations
      await audioStreamService.streamAudio(req, res, episodePath, book.storage_config_id);
    } else {
      // For Azure storage, redirect to SAS URL
      // Azure Blob Storage natively supports Range requests
      const sasUrl = await storageService.generateSasUrl(
        book.storage_config_id,
        'audiobooks',
        `${book.blob_path}/${episode.file}`
      );
      res.redirect(302, sasUrl);
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Get the base storage path for a given storage config ID.
 * Returns the custom storage path if configured, otherwise the default.
 */
async function getStorageBasePath(storageConfigId: string | null): Promise<string> {
  const defaultStorageDir = path.join(__dirname, '..', '..', 'storage');

  if (!storageConfigId) {
    return defaultStorageDir;
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

  return defaultStorageDir;
}

/**
 * Serve cover image for a book.
 * Handles books in custom storage locations.
 */
export const getCover = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    // If no cover URL, return 404
    if (!book.cover_url) {
      res.status(404).json({
        success: false,
        error: 'No cover image',
      });
      return;
    }

    if (config.storage.useLocal) {
      // Extract the relative path from cover_url
      // Old format: "/storage/audiobooks\book-xxx\cover.jpg" or "/storage/audiobooks/book-xxx/cover.jpg"
      // We need: "audiobooks/book-xxx/cover.jpg"
      let relativePath = book.cover_url;

      // Remove leading "/storage/" if present
      if (relativePath.startsWith('/storage/')) {
        relativePath = relativePath.substring('/storage/'.length);
      }

      // Normalize path separators (Windows uses backslashes in old data)
      relativePath = relativePath.replace(/\\/g, '/');

      // Get the correct storage base path
      const storageDir = await getStorageBasePath(book.storage_config_id);
      const coverPath = path.join(storageDir, relativePath);

      console.log('Cover debug:', {
        original_cover_url: book.cover_url,
        storage_config_id: book.storage_config_id,
        storageDir,
        relativePath,
        coverPath,
      });

      // Security: Ensure path doesn't escape storage directory
      const resolvedPath = path.resolve(coverPath);
      if (!resolvedPath.startsWith(path.resolve(storageDir))) {
        res.status(403).json({ success: false, error: 'Access denied' });
        return;
      }

      // Check if file exists
      if (!fs.existsSync(resolvedPath)) {
        res.status(404).json({
          success: false,
          error: 'Cover file not found',
        });
        return;
      }

      // Determine content type
      const ext = path.extname(resolvedPath).toLowerCase();
      let contentType = 'image/jpeg';
      if (ext === '.png') contentType = 'image/png';
      else if (ext === '.webp') contentType = 'image/webp';
      else if (ext === '.gif') contentType = 'image/gif';

      // Set headers and send file
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
      res.sendFile(resolvedPath);
    } else {
      // For Azure storage, redirect to SAS URL
      // Extract relative path from cover_url (same logic as local)
      let relativePath = book.cover_url;
      if (relativePath.startsWith('/storage/')) {
        relativePath = relativePath.substring('/storage/'.length);
      }
      relativePath = relativePath.replace(/\\/g, '/');

      // Remove "audiobooks/" prefix if present since generateSasUrl adds container
      if (relativePath.startsWith('audiobooks/')) {
        relativePath = relativePath.substring('audiobooks/'.length);
      }

      const sasUrl = await storageService.generateSasUrl(
        book.storage_config_id,
        'audiobooks',
        relativePath
      );
      res.redirect(302, sasUrl);
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
