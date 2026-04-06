const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const followRoutes = require('./routes/follow');
const postRoutes = require('./routes/posts');
const messageRoutes = require('./routes/messages');
const uploadRoutes = require('./routes/upload');
const offerRoutes = require('./routes/offers');
const statsRoutes = require('./routes/stats');
const highlightsRoutes = require('./routes/highlights');
const coachesRoutes = require('./routes/coaches');
const notificationsRoutes = require('./routes/notifications');
const recruitingBoardRoutes = require('./routes/recruiting-board');
const settingsRoutes = require('./routes/settings');
const aiRoutes = require('./routes/ai');
const adminAnalyticsRoutes = require('./routes/admin-analytics');
const aiRepRoutes = require('./routes/ai-rep');
const initializeSocket = require('./socket');
const { apiLimiter } = require('./middleware/rateLimit');
const logger = require('./utils/logger');

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);
const PORT = process.env.PORT || 5000;

app.set('io', io);

// CORS configuration
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://directrecruit.net', 'https://www.directrecruit.net']
  : true; // Allow all origins in development

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Assign a unique request ID to every request for log tracing
app.use((req, res, next) => {
  req.requestId = uuidv4().slice(0, 8);
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

// HTTP request logging — streams through Winston
app.use(morgan(':method :url :status :response-time ms', {
  stream: { write: (msg) => logger.info(msg.trim()) },
  skip: (req) => req.url === '/health',
}));
// Serve static uploads BEFORE helmet to avoid security headers blocking images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.amazonaws.com"],
      connectSrc: ["'self'", "wss:", "ws:"],
      mediaSrc: ["'self'", "blob:", "https://*.amazonaws.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use('/api/', apiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/follow', followRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/highlights', highlightsRoutes);
app.use('/api/coaches', coachesRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/recruiting-board', recruitingBoardRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin/analytics', adminAnalyticsRoutes);
app.use('/api/ai-rep', aiRepRoutes);

// In development, serve frontend files so cookies work on the same origin
if (process.env.NODE_ENV !== 'production') {
  app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
}

// Health check — verifies DB and Redis connectivity
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Check database
  try {
    const pool = require('./config/database');
    const result = await pool.query('SELECT 1');
    health.services.database = 'connected';
  } catch (error) {
    health.status = 'degraded';
    health.services.database = 'disconnected';
    logger.error('Health check: database unreachable', { error: error.message });
  }

  // Check Redis (only in production — dev uses a stub)
  try {
    const redis = require('./config/redis');
    if (process.env.NODE_ENV === 'production' && redis.isReady) {
      await redis.sendCommand(['PING']);
      health.services.redis = 'connected';
    } else if (process.env.NODE_ENV === 'production') {
      health.status = 'degraded';
      health.services.redis = 'disconnected';
    } else {
      health.services.redis = 'stub (dev)';
    }
  } catch (error) {
    health.status = 'degraded';
    health.services.redis = 'disconnected';
    logger.error('Health check: redis unreachable', { error: error.message });
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(err.message, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    stack: err.stack,
  });
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Something went wrong!' });
  }
  res.status(500).sendFile(path.join(__dirname, '..', 'frontend', '500.html'));
});

// 404 handler
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '..', 'frontend', '404.html'));
});

// Kill stalled connections after 30 seconds
server.setTimeout(30000);

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`WebSocket server running`);
  logger.info(`Environment: ${process.env.NODE_ENV}`);

  if (process.env.NODE_ENV !== 'production') {
    logger.info('');
    logger.info('LOCAL DEV MODE — AWS services are mocked:');
    logger.info('  Auth: bcrypt-based (no Cognito)');
    logger.info('  Storage: local filesystem (no S3)');
    logger.info('  Email: console output (no SES)');
    logger.info(`  Verification code: ${process.env.LOCAL_DEV_VERIFICATION_CODE || '123456'}`);
    logger.info('');
  }
});

// Graceful shutdown — drain connections before exiting
function gracefulShutdown(signal) {
  logger.info(`${signal} received, shutting down gracefully...`);

  server.close(() => {
    logger.info('HTTP server closed');

    const pool = require('./config/database');
    pool.end(() => {
      logger.info('Database connections closed');

      try {
        const redis = require('./config/redis');
        if (redis.isReady) {
          redis.quit().then(() => {
            logger.info('Redis connection closed');
            process.exit(0);
          });
        } else {
          process.exit(0);
        }
      } catch {
        process.exit(0);
      }
    });
  });

  // Force exit after 30s if something hangs
  setTimeout(() => {
    logger.error('Forced shutdown after 30s timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
