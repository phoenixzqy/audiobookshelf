import { Router } from 'express';
import * as historyController from '../controllers/historyController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', historyController.getHistory);
router.post('/sync', historyController.syncHistory);
router.get('/recent', historyController.getRecentHistory);

export default router;
