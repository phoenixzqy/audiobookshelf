import { Router } from 'express';
import * as booksController from '../controllers/booksController';
import { optionalAuthMiddleware, authMiddleware } from '../middleware/auth';
import { contentFilterMiddleware } from '../middleware/contentFilter';

const router = Router();

router.get('/', optionalAuthMiddleware, contentFilterMiddleware, booksController.getBooks);
router.get('/:id', optionalAuthMiddleware, booksController.getBookById);
router.get('/:id/episodes/:episodeIndex/url', authMiddleware, booksController.getEpisodeUrl);

export default router;
