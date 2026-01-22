import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { AuthRequest } from '../types';

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
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

/**
 * Auth middleware that also supports token from query parameter.
 * This is needed for streaming endpoints where the browser's audio/video
 * elements cannot set custom headers.
 */
export const streamAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Try header first
    const authHeader = req.headers.authorization;
    let token: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.query.token && typeof req.query.token === 'string') {
      // Fall back to query parameter for streaming
      token = req.query.token;
    }

    if (!token) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
    }

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
  _res: Response,
  next: NextFunction
): Promise<void> => {
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
