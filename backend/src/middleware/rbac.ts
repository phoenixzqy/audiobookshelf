import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

export const rbacMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;

    if (!authReq.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }

    next();
  };
};

export const adminOnly = rbacMiddleware(['admin']);
