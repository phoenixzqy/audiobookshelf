import { Request, Response } from 'express';
import { audiobookService } from '../services/audiobookService';
import { storageService } from '../services/storageService';
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

export const getChapterUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id, chapterIndex } = req.params;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    const index = parseInt(chapterIndex);
    if (index < 0 || index >= book.chapters.length) {
      res.status(400).json({
        success: false,
        error: 'Invalid chapter index',
      });
      return;
    }

    const chapter = book.chapters[index];
    const chapterPath = `${book.blob_path}/${chapter.file}`;

    const sasUrl = await storageService.generateSasUrl(
      book.storage_config_id,
      'audiobooks',
      chapterPath
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
