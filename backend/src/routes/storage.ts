import { Router } from 'express';
import * as storageController from '../controllers/storageController';
import { authMiddleware } from '../middleware/auth';
import { adminOnly } from '../middleware/rbac';

const router = Router();

// All storage routes require authentication and admin role
router.use(authMiddleware);
router.use(adminOnly);

// Storage location management
router.get('/locations', storageController.getStorageLocations);
router.post('/locations', storageController.addStorageLocation);
router.delete('/locations/:id', storageController.deleteStorageLocation);

// Path validation and browsing
router.post('/validate-path', storageController.validatePath);
router.get('/browse-path', storageController.browsePath);

// Audiobooks with storage info
router.get('/audiobooks', storageController.getAudiobooksWithStorage);
router.get('/audiobook/:id/size', storageController.getAudiobookSize);

// Move operations
router.post('/move', storageController.moveAudiobook);
router.post('/move/bulk', storageController.bulkMoveAudiobooks);
router.get('/move/progress/:batchId', storageController.getMoveProgress);
router.post('/move/cancel/:batchId', storageController.cancelBulkMove);

export default router;
