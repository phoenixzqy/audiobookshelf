import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Routes
import authRoutes from './routes/auth';
import booksRoutes from './routes/books';
import historyRoutes from './routes/history';
import adminRoutes from './routes/admin';
import storageRoutes from './routes/storage';
import telemetryRoutes from './routes/telemetry';

// Services
import { logCleanupService } from './services/logCleanupService';
import { telemetryLogger } from './services/telemetryLogger';

const app = express();

// CORS configuration - allow requests from GitHub Pages, localhost, and LAN
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://phoenixzqy.github.io',
      'http://localhost:5173',
      'http://localhost:8081',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8081',
      // Capacitor WebView origins
      'http://localhost',   // Android (androidScheme: 'http')
      'https://localhost',  // Android fallback
      'capacitor://localhost', // iOS
    ];

    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // Allow explicitly listed origins
    if (allowedOrigins.includes(origin)) return callback(null, true);

    // Allow any LAN IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Trust proxy - set before rate limiting middleware
// This tells Express to trust X-Forwarded-For header from reverse proxies
app.set('trust proxy', 1);
// Allow iframe embedding from GitHub Pages (for Cloudflare tunnel landing page)
// This middleware sets headers to allow the app to be loaded in an iframe
app.use((_req, res, next) => {
  // Remove X-Frame-Options to allow iframe embedding
  res.removeHeader('X-Frame-Options');
  // Set CSP to allow framing from any origin (needed for dynamic Cloudflare tunnel URLs)
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' https://*.github.io https://*.trycloudflare.com");
  next();
});

// Security middleware - relaxed for local network access
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow audio streaming from other devices
  crossOriginOpenerPolicy: false, // Disable COOP to avoid warnings on non-HTTPS
  crossOriginEmbedderPolicy: false, // Disable COEP for local development
  originAgentCluster: false, // Disable Origin-Agent-Cluster header
  contentSecurityPolicy: false, // Disable CSP (we set our own above for frame-ancestors)
  frameguard: false, // Disable X-Frame-Options (we allow iframe embedding)
}));

// Serve local storage files in development (BEFORE rate limiting)
if (config.storage.useLocal) {
  const storagePath = path.join(__dirname, '..', 'storage');
  app.use('/storage', express.static(storagePath, {
    setHeaders: (res, filePath) => {
      // Set appropriate content-type for audio files
      if (filePath.endsWith('.mp3')) {
        res.setHeader('Content-Type', 'audio/mpeg');
      } else if (filePath.endsWith('.m4b') || filePath.endsWith('.m4a')) {
        res.setHeader('Content-Type', 'audio/mp4');
      } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      }
      // Allow range requests for audio streaming
      res.setHeader('Accept-Ranges', 'bytes');
      // Cache static files for 1 hour
      res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  }));
  console.log(`📁 Serving local storage from: ${storagePath}`);
}

// Rate limiting - only apply to API routes
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use X-Forwarded-For if available (from reverse proxy), otherwise use IP
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() || req.ip || 'unknown';
  },
  skip: (req) => {
    // Skip rate limiting for static files and health checks
    return req.path.startsWith('/storage') || req.path === '/health';
  },
});

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Compression
app.use(compression());

// Logging
if (config.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Health check (before rate limiting)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes (with rate limiting)
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/books', apiLimiter, booksRoutes);
app.use('/api/history', apiLimiter, historyRoutes);
app.use('/api/admin', apiLimiter, adminRoutes);
app.use('/api/admin/storage', apiLimiter, storageRoutes);
app.use('/api/telemetry', apiLimiter, telemetryRoutes);

// Start log cleanup scheduler (30 day retention, runs daily at 3 AM)
logCleanupService.startScheduledCleanup(30);

// Graceful shutdown handling
const gracefulShutdown = () => {
  console.log('🛑 Shutting down gracefully...');
  logCleanupService.stopScheduledCleanup();
  telemetryLogger.close();
};
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Serve frontend build (production)
const frontendBuildPath = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendBuildPath)) {
  console.log(`🌐 Serving frontend from: ${frontendBuildPath}`);

  // Serve static assets
  app.use(express.static(frontendBuildPath, {
    index: false, // Don't serve index.html for directory requests yet
  }));

  // SPA fallback - serve index.html for all non-API, non-asset routes
  app.get('*', (req, res, next) => {
    // Skip API routes and storage
    if (req.path.startsWith('/api') || req.path.startsWith('/storage') || req.path === '/health') {
      return next();
    }

    const indexPath = path.join(frontendBuildPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });
}

// Error handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
