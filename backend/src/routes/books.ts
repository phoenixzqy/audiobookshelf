import { Router } from 'express';
import * as booksController from '../controllers/booksController';
import { optionalAuthMiddleware, authMiddleware, streamAuthMiddleware } from '../middleware/auth';
import { contentFilterMiddleware } from '../middleware/contentFilter';

const router = Router();

router.get('/', optionalAuthMiddleware, contentFilterMiddleware, booksController.getBooks);
router.get('/:id', optionalAuthMiddleware, booksController.getBookById);
router.get('/:id/episodes/:episodeIndex/url', authMiddleware, booksController.getEpisodeUrl);
// Streaming endpoint for audio files with Range request support
// Uses streamAuthMiddleware to support token in query param (browser audio elements can't set headers)
router.get('/:id/episodes/:episodeIndex/stream', streamAuthMiddleware, booksController.streamEpisode);

export default router;
