import { Request, Response } from 'express';
import { audiobookService } from '../services/audiobookService';
import { storageService } from '../services/storageService';
import { AuthRequest } from '../types';

export const getBooks = async (req: Request, res: Response) => {
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

export const getBookById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const authReq = req as AuthRequest;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
      });
    }

    // Apply content filtering
    if (authReq.user?.user_type === 'kid' && book.book_type !== 'kids') {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    if (!book.is_published && authReq.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Book not published',
      });
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

export const getChapterUrl = async (req: Request, res: Response) => {
  try {
    const { id, chapterIndex } = req.params;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
      });
    }

    const index = parseInt(chapterIndex);
    if (index < 0 || index >= book.chapters.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid chapter index',
      });
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
