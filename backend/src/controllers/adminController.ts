import { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { audiobookService } from '../services/audiobookService';
import { storageService } from '../services/storageService';
import { query } from '../config/database';

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
  },
});

export const uploadMiddleware = upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'audioFiles', maxCount: 100 },
]);

export const uploadBook = async (req: Request, res: Response) => {
  try {
    const { title, description, author, narrator, bookType, chapters: chaptersJson } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!title || !bookType || !files.audioFiles) {
      return res.status(400).json({
        success: false,
        error: 'Title, bookType, and audio files are required',
      });
    }

    // Parse chapters metadata
    const chapters = JSON.parse(chaptersJson);

    if (chapters.length !== files.audioFiles.length) {
      return res.status(400).json({
        success: false,
        error: 'Chapter metadata count must match audio file count',
      });
    }

    // Calculate total size
    const totalSize = files.audioFiles.reduce((sum, file) => sum + file.size, 0);
    if (files.cover) {
      totalSize + files.cover[0].size;
    }

    // Select storage
    const storageConfigId = await storageService.selectStorageForUpload(totalSize);
    const bookId = uuidv4();
    const blobPath = `book-${bookId}`;

    // Upload cover if provided
    let coverUrl: string | undefined;
    if (files.cover) {
      const coverFile = files.cover[0];
      coverUrl = await storageService.uploadFile(
        storageConfigId,
        'audiobooks',
        `${blobPath}/cover.jpg`,
        coverFile.buffer,
        coverFile.mimetype
      );
    }

    // Upload audio files
    const uploadedChapters = [];
    for (let i = 0; i < files.audioFiles.length; i++) {
      const file = files.audioFiles[i];
      const chapter = chapters[i];

      const fileName = `chapter-${String(i + 1).padStart(3, '0')}.mp3`;

      await storageService.uploadFile(
        storageConfigId,
        'audiobooks',
        `${blobPath}/${fileName}`,
        file.buffer,
        file.mimetype
      );

      uploadedChapters.push({
        index: i,
        title: chapter.title,
        file: fileName,
        duration: chapter.duration,
      });
    }

    // Create book record
    const book = await audiobookService.createBook(
      title,
      bookType,
      storageConfigId,
      blobPath,
      uploadedChapters,
      {
        description,
        author,
        narrator,
        coverUrl,
      }
    );

    // Update storage usage
    await storageService.updateStorageUsage(storageConfigId, totalSize);

    res.status(201).json({
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

export const updateBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const book = await audiobookService.updateBook(id, updates);

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

export const deleteBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const book = await audiobookService.getBookById(id);

    if (!book) {
      return res.status(404).json({
        success: false,
        error: 'Book not found',
      });
    }

    // Delete blobs
    for (const chapter of book.chapters) {
      await storageService.deleteBlob(
        book.storage_config_id,
        'audiobooks',
        `${book.blob_path}/${chapter.file}`
      );
    }

    if (book.cover_url) {
      await storageService.deleteBlob(
        book.storage_config_id,
        'audiobooks',
        `${book.blob_path}/cover.jpg`
      );
    }

    // Delete book record
    await audiobookService.deleteBook(id);

    res.json({
      success: true,
      message: 'Book deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const result = await query('SELECT id, email, user_type, role, display_name, created_at FROM users ORDER BY created_at DESC');

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const updateUserRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role',
      });
    }

    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, user_type, role, display_name',
      [role, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await query('DELETE FROM users WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
