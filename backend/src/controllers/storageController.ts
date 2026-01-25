import { Request, Response } from 'express';
import { storageMoveService } from '../services/storageMoveService';

/**
 * GET /api/admin/storage/locations
 * Get all configured storage locations with their status
 */
export const getStorageLocations = async (_req: Request, res: Response): Promise<void> => {
  try {
    const locations = await storageMoveService.getStorageLocations();

    res.json({
      success: true,
      data: { locations },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/storage/locations
 * Add a new storage location
 */
export const addStorageLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, basePath } = req.body;

    if (!name || !basePath) {
      res.status(400).json({
        success: false,
        error: 'Name and basePath are required',
      });
      return;
    }

    const location = await storageMoveService.addStorageLocation(name, basePath);

    res.json({
      success: true,
      data: location,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/admin/storage/locations/:id
 * Delete a storage location
 */
export const deleteStorageLocation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await storageMoveService.deleteStorageLocation(id);

    res.json({
      success: true,
      message: 'Storage location deleted',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/storage/validate-path
 * Validate a filesystem path
 */
export const validatePath = async (req: Request, res: Response): Promise<void> => {
  try {
    const { path } = req.body;

    if (!path) {
      res.status(400).json({
        success: false,
        error: 'Path is required',
      });
      return;
    }

    const validation = await storageMoveService.validatePath(path);

    res.json({
      success: true,
      data: validation,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/storage/browse-path
 * Browse filesystem directories
 */
export const browsePath = async (req: Request, res: Response): Promise<void> => {
  try {
    const targetPath = (req.query.path as string) || '';

    const result = await storageMoveService.browsePath(targetPath);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/storage/move
 * Move a single audiobook
 */
export const moveAudiobook = async (req: Request, res: Response): Promise<void> => {
  try {
    const { audiobookId, destinationPath } = req.body;

    if (!audiobookId || !destinationPath) {
      res.status(400).json({
        success: false,
        error: 'audiobookId and destinationPath are required',
      });
      return;
    }

    const result = await storageMoveService.moveSingleBook(audiobookId, destinationPath);

    if (result.success) {
      res.json({
        success: true,
        message: 'Audiobook moved successfully',
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/storage/move/bulk
 * Start a bulk move operation
 */
export const bulkMoveAudiobooks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { audiobookIds, destinationPath, stopOnError = false } = req.body;

    if (!audiobookIds || !Array.isArray(audiobookIds) || audiobookIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'audiobookIds array is required',
      });
      return;
    }

    if (!destinationPath) {
      res.status(400).json({
        success: false,
        error: 'destinationPath is required',
      });
      return;
    }

    const batchId = await storageMoveService.startBulkMove(audiobookIds, destinationPath, stopOnError);

    res.json({
      success: true,
      data: {
        batchId,
        totalBooks: audiobookIds.length,
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/storage/move/progress/:batchId
 * Get progress of a bulk move operation
 */
export const getMoveProgress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    const progress = await storageMoveService.getBatchProgress(batchId);

    res.json({
      success: true,
      data: progress,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/admin/storage/move/cancel/:batchId
 * Cancel a bulk move operation
 */
export const cancelBulkMove = async (req: Request, res: Response): Promise<void> => {
  try {
    const { batchId } = req.params;

    await storageMoveService.cancelBulkMove(batchId);

    res.json({
      success: true,
      message: 'Cancellation requested',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/storage/audiobook/:id/size
 * Get the size of an audiobook's files
 */
export const getAudiobookSize = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const sizeBytes = await storageMoveService.getAudiobookSize(id);

    res.json({
      success: true,
      data: { sizeBytes },
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/storage/audiobooks
 * Get all audiobooks with their storage info
 */
export const getAudiobooksWithStorage = async (_req: Request, res: Response): Promise<void> => {
  try {
    const audiobooks = await storageMoveService.getAudiobooksWithStorage();

    res.json({
      success: true,
      data: { audiobooks },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
