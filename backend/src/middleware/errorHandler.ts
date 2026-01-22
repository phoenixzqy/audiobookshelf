import { Request, Response, NextFunction } from 'express';
import multer from 'multer';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('Error:', err);

  // Handle Multer errors
  if (err instanceof multer.MulterError) {
    let message = err.message;
    
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = `Unexpected field "${err.field}". Expected fields: cover, audioFiles`;
    } else if (err.code === 'LIMIT_FILE_SIZE') {
      message = `File too large. Maximum size: 2GB`;
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      message = `Too many files. Maximum: 100`;
    }
    
    res.status(400).json({
      success: false,
      error: message,
    });
    return;
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFoundHandler = (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
  });
};
