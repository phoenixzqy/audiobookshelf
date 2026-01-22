import { Request, Response } from 'express';
import { audiobookService } from '../services/audiobookService';
import { storageService } from '../services/storageService';
import { audioStreamService } from '../services/audioStreamService';
import { config } from '../config/env';
import { AuthRequest } from '../types';

export const getBooks = async (req: Request, res: Response): Promise<void> => {
  try {
    const authReq = req as AuthRequest;
    const { limit, offset } = req.query;

    const filters = {
      ...(authReq.contentFilter || {}),
      limit: limit ? parseInt(limit as string) : undefined,
      offset: offset ? parseInt(offset as string) : undefined,
    };

    const result = await audiobookService.getBooks(filters);

    res.json({
      success: true,
      data: {
        books: result.books,
        total: result.total,
        hasMore: result.books.length + (filters.offset || 0) < result.total,
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
      await audioStreamService.streamAudio(req, res, episodePath);
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
