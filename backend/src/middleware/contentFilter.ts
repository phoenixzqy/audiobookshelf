import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

export const contentFilterMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthRequest;

  if (authReq.user?.user_type === 'kid') {
    // Kids can only see published kids books
    authReq.contentFilter = { book_type: 'kids', is_published: true };
  } else {
    // Everyone else (adults, admins, public) sees published books
    authReq.contentFilter = { is_published: true };
  }

  next();
};
