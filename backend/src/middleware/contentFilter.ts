import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

export const contentFilterMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthRequest;

  // Apply content filtering for book queries
  // This middleware is applied to book routes, so we don't need to check the path
  if (!authReq.user) {
    // Public access - only show published books
    authReq.contentFilter = { is_published: true };
  } else if (authReq.user.user_type === 'kid') {
    // Kids can only see kids books
    authReq.contentFilter = {
      book_type: 'kids',
      is_published: true,
    };
  } else if (authReq.user.role === 'admin') {
    // Admins see everything on library page too - they use admin page for unpublished
    // Actually, let's show only published on library, admin page shows all
    authReq.contentFilter = {
      is_published: true,
    };
  } else {
    // Adults see published books
    authReq.contentFilter = {
      is_published: true,
    };
  }

  next();
};
