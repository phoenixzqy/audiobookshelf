import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

export const contentFilterMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthRequest;

  // Apply filtering to book queries
  if (req.path.includes('/api/books') && req.method === 'GET') {
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
      // Admins see everything
      authReq.contentFilter = {};
    } else {
      // Adults see published books
      authReq.contentFilter = {
        is_published: true,
      };
    }
  }

  next();
};
