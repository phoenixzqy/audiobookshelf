import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { authMiddleware } from '../middleware/auth';
import { adminOnly } from '../middleware/rbac';

const router = Router();

router.use(authMiddleware);
router.use(adminOnly);

// Book management
router.get('/books', adminController.getBooks); // Admin sees ALL books including unpublished
router.post('/books', adminController.uploadMiddleware, adminController.uploadBook);
router.put('/books/:id', adminController.updateBook);
router.delete('/books/:id', adminController.deleteBook);

// Add episodes to existing book
router.post('/books/:id/episodes', adminController.uploadMiddleware, adminController.addEpisodes);

// Update book cover
router.put('/books/:id/cover', adminController.uploadMiddleware, adminController.updateCover);

// User management
router.get('/users', adminController.getUsers);
router.put('/users/:id/role', adminController.updateUserRole);
router.delete('/users/:id', adminController.deleteUser);

export default router;
