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
    fileSize: 1024 * 1024 * 1024 * 2, // 2GB per file
  },
});

export const uploadMiddleware = (req: Request, res: Response, next: Function) => {
  // Use .any() to accept all fields, then manually filter in the controller
  upload.any()(req, res, (err) => {
    if (err) {
      return next(err); // Pass to error handler
    }
    next();
  });
};

export const uploadBook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, description, author, narrator, bookType, chapters: episodesJson } = req.body;
    const allFiles = req.files as Express.Multer.File[] | undefined;

    if (!title || !bookType) {
      res.status(400).json({
        success: false,
        error: 'Title and bookType are required',
      });
      return;
    }

    // Separate files by fieldname
    const coverFiles = allFiles?.filter(f => f.fieldname === 'cover') || [];
    const audioFiles = allFiles?.filter(f => f.fieldname === 'audioFiles') || [];

    if (audioFiles.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Audio files are required',
      });
      return;
    }

    // Parse episodes metadata
    const episodes = JSON.parse(episodesJson);

    if (episodes.length !== audioFiles.length) {
      res.status(400).json({
        success: false,
        error: 'Episode metadata count must match audio file count',
      });
      return;
    }

    // Calculate total size
    let totalSize = audioFiles.reduce((sum, file) => sum + file.size, 0);
    if (coverFiles.length > 0) {
      totalSize += coverFiles[0].size;
    }

    // Select storage
    const storageConfigId = await storageService.selectStorageForUpload(totalSize);
    const bookId = uuidv4();
    const blobPath = `book-${bookId}`;

    // Upload cover if provided
    let coverUrl: string | undefined;
    if (coverFiles.length > 0) {
      const coverFile = coverFiles[0];
      // Keep original filename
      coverUrl = await storageService.uploadFile(
        storageConfigId,
        'audiobooks',
        `${blobPath}/${coverFile.originalname}`,
        coverFile.buffer,
        coverFile.mimetype
      );
    }

    // Upload audio files
    const uploadedEpisodes = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const episode = episodes[i];

      // Keep original filename
      const fileName = file.originalname;

      await storageService.uploadFile(
        storageConfigId,
        'audiobooks',
        `${blobPath}/${fileName}`,
        file.buffer,
        file.mimetype
      );

      uploadedEpisodes.push({
        index: i,
        title: episode.title,
        file: fileName,
        duration: episode.duration,
      });
    }

    // Create book record
    const book = await audiobookService.createBook(
      title,
      bookType,
      storageConfigId,
      blobPath,
      uploadedEpisodes,
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

export const updateBook = async (req: Request, res: Response): Promise<void> => {
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

export const deleteBook = async (req: Request, res: Response): Promise<void> => {
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

    // Delete blobs
    for (const episode of book.episodes) {
      await storageService.deleteBlob(
        book.storage_config_id,
        'audiobooks',
        `${book.blob_path}/${episode.file}`
      );
    }

    // Delete cover image if exists
    if (book.cover_url) {
      // Extract the filename from the cover URL (e.g., "/storage/audiobooks/book-xxx/cover.jpg" -> "cover.jpg")
      const coverFilename = book.cover_url.split('/').pop();
      if (coverFilename) {
        await storageService.deleteBlob(
          book.storage_config_id,
          'audiobooks',
          `${book.blob_path}/${coverFilename}`
        );
      }
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

export const getUsers = async (_req: Request, res: Response): Promise<void> => {
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

export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
      res.status(400).json({
        success: false,
        error: 'Invalid role',
      });
      return;
    }

    const result = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, user_type, role, display_name',
      [role, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        error: 'User not found',
      });
      return;
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

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
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

// Add episodes to an existing book
export const addEpisodes = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { chapters: episodesJson, insertAt } = req.body;
    const allFiles = req.files as Express.Multer.File[] | undefined;

    // Filter for audio files
    const audioFiles = allFiles?.filter(f => f.fieldname === 'audioFiles') || [];

    if (audioFiles.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Audio files are required',
      });
      return;
    }

    const book = await audiobookService.getBookById(id);
    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    // Parse episodes metadata
    const newEpisodes = episodesJson ? JSON.parse(episodesJson) : [];

    // Validate episode count matches file count
    if (newEpisodes.length !== audioFiles.length) {
      // Auto-generate episode metadata if not provided or mismatched
      newEpisodes.length = 0;
      for (let i = 0; i < audioFiles.length; i++) {
        newEpisodes.push({
          title: `Episode ${book.episodes.length + i + 1}`,
          duration: 0,
        });
      }
    }

    // Calculate total size
    const totalSize = audioFiles.reduce((sum, file) => sum + file.size, 0);

    // Find the highest episode number currently used
    const existingEpisodeNumbers = book.episodes.map(ep => {
      const match = ep.file.match(/episode-(\d+)/);
      return match ? parseInt(match[1]) : 0;
    });
    let nextEpisodeNum = Math.max(...existingEpisodeNumbers, 0) + 1;

    // Upload audio files
    const uploadedEpisodes = [];
    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];
      const episode = newEpisodes[i];

      const fileName = `episode-${String(nextEpisodeNum + i).padStart(3, '0')}.mp3`;

      await storageService.uploadFile(
        book.storage_config_id,
        'audiobooks',
        `${book.blob_path}/${fileName}`,
        file.buffer,
        file.mimetype
      );

      uploadedEpisodes.push({
        index: 0, // Will be recalculated
        title: episode.title,
        file: fileName,
        duration: episode.duration || 0,
      });
    }

    // Merge episodes: insert at position or append
    const insertPosition = insertAt !== undefined ? parseInt(insertAt) : book.episodes.length;
    const allEpisodes = [
      ...book.episodes.slice(0, insertPosition),
      ...uploadedEpisodes,
      ...book.episodes.slice(insertPosition),
    ];

    // Recalculate indices
    allEpisodes.forEach((ep, idx) => {
      ep.index = idx;
    });

    // Update book with new episodes
    const updatedBook = await audiobookService.updateBook(id, { episodes: allEpisodes });

    // Update storage usage
    await storageService.updateStorageUsage(book.storage_config_id, totalSize);

    res.json({
      success: true,
      data: updatedBook,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// Update book cover
export const updateCover = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const allFiles = req.files as Express.Multer.File[] | undefined;

    // Filter for cover file
    const coverFiles = allFiles?.filter(f => f.fieldname === 'cover') || [];

    if (coverFiles.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Cover image is required',
      });
      return;
    }

    const book = await audiobookService.getBookById(id);
    if (!book) {
      res.status(404).json({
        success: false,
        error: 'Book not found',
      });
      return;
    }

    const coverFile = coverFiles[0];

    // Delete old cover if exists
    if (book.cover_url) {
      await storageService.deleteBlob(
        book.storage_config_id,
        'audiobooks',
        `${book.blob_path}/cover.jpg`
      );
    }

    // Upload new cover
    const coverUrl = await storageService.uploadFile(
      book.storage_config_id,
      'audiobooks',
      `${book.blob_path}/cover.jpg`,
      coverFile.buffer,
      coverFile.mimetype
    );

    // Update book record
    const updatedBook = await audiobookService.updateBook(id, { cover_url: coverUrl });

    res.json({
      success: true,
      data: updatedBook,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
