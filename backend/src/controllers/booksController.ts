import { Request, Response } from 'express';
import { audiobookService } from '../services/audiobookService';
import { storageService } from '../services/storageService';
import { audioStreamService } from '../services/audioStreamService';
import { config } from '../config/env';
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
