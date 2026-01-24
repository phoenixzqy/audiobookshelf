import { Router } from 'express';
import * as historyController from '../controllers/historyController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

// Specific routes first (before parameterized routes)
router.get('/most-recent', historyController.getMostRecentWithBook);
router.get('/with-books', historyController.getAllWithBooks);
router.get('/recent', historyController.getRecentHistory);
router.get('/book/:bookId', historyController.getHistoryByBookId);

// Generic routes
router.get('/', historyController.getHistory);
router.post('/sync', historyController.syncHistory);

export default router;
