import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { AuthRequest } from '../types';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.substring(7);

    const decoded = authService.verifyAccessToken(token);

    (req as AuthRequest).user = {
      id: decoded.id,
      email: decoded.email,
      user_type: decoded.user_type,
      role: decoded.role,
    };

    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = authService.verifyAccessToken(token);

      (req as AuthRequest).user = {
        id: decoded.id,
        email: decoded.email,
        user_type: decoded.user_type,
        role: decoded.role,
      };
    }

    next();
  } catch (error) {
    // Ignore invalid tokens for optional auth
    next();
  }
};
