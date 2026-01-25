import { Router } from 'express';
import * as telemetryController from '../controllers/telemetryController';
import { adminOnly } from '../middleware/rbac';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';

const router = Router();

// Public endpoint - receives telemetry from any authenticated client
// Using optional auth so the endpoint works even if token is expired
router.post('/errors', optionalAuthMiddleware, telemetryController.receiveErrors);

// Admin endpoints - require authentication and admin role
router.post('/cleanup', authMiddleware, adminOnly, telemetryController.cleanup);
router.get('/stats', authMiddleware, adminOnly, telemetryController.getStats);

export default router;
