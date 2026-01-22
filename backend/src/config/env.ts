import dotenv from 'dotenv';
import type { SignOptions } from 'jsonwebtoken';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8081'),

  database: {
    url: process.env.DATABASE_URL || '',
    poolMin: parseInt(process.env.DATABASE_POOL_MIN || '2'),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX || '10'),
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'development-secret-change-in-production',
    accessExpiry: (process.env.JWT_ACCESS_EXPIRY || '1d') as SignOptions['expiresIn'], // 1 day - will be auto-refreshed
    refreshExpiryDays: parseInt(process.env.JWT_REFRESH_EXPIRY_DAYS || '180'), // 6 months
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY || 'development-key-32-chars-long!!',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },

  sas: {
    expiryMinutes: parseInt(process.env.SAS_TOKEN_EXPIRY_MINUTES || '60'),
  },

  storage: {
    // Use local file storage instead of Azure Blob Storage
    // Set to 'true' for local development, 'false' for production with Azure
    useLocal: process.env.USE_LOCAL_STORAGE === 'true' || process.env.NODE_ENV === 'development',
  },

  log: {
    level: process.env.LOG_LEVEL || 'info',
  },
};
