const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
require('dotenv').config();

// Fail-fast on missing required env vars (security audit #12).
// Always-required secrets crash the boot in any environment; prod-only
// secrets crash only when NODE_ENV=production. pm2 surfaces the FATAL
// line in `pm2 logs` so misconfig is visible within seconds instead of
// failing on the first auth/payment request hours later.
const REQUIRED_SECRETS = [
  'JWT_SECRET',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD'
];
if (process.env.NODE_ENV === 'production') {
  REQUIRED_SECRETS.push(
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PLAYER_PRICE_ID',
    'STRIPE_COACH_STARTER_PRICE_ID',
    'STRIPE_COACH_PRO_PRICE_ID',
    'STRIPE_COACH_ELITE_PRICE_ID',
    'ADMIN_ANALYTICS_KEY',
    'AWS_COGNITO_USER_POOL_ID',
    'AWS_COGNITO_CLIENT_ID',
    'AWS_COGNITO_CLIENT_SECRET'
  );
}
for (const secret of REQUIRED_SECRETS) {
  if (!process.env[secret]) {
    console.error(`FATAL: Missing required env var: ${secret}`);
    process.exit(1);
  }
}

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
const paymentsRoutes = require('./routes/payments');
const coachSignupRoutes = require('./routes/coach-signup');
const adminCoachVerificationRoutes = require('./routes/admin-coach-verification');
const initializeSocket = require('./socket');
const { apiLimiter } = require('./middleware/rateLimit');
const { sanitizeBody } = require('./middleware/validation');
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
// Stripe webhook needs raw body for signature verification — must be before express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentsRoutes.webhookHandler);
// RevenueCat webhook also needs raw body (we parse manually inside the handler) — same ordering rule
app.post('/api/payments/revenuecat-webhook', express.raw({ type: 'application/json' }), paymentsRoutes.revenueCatWebhookHandler);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Recursively strip HTML from all parsed request bodies. Mounted AFTER the
// raw-body webhook routes above (Stripe + RevenueCat) so those receive the
// Buffer they need for signature verification — those use app.post with
// express.raw, not app.use, so they short-circuit before this runs.
app.use(sanitizeBody);

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
// Serve static uploads BEFORE helmet to avoid security headers blocking images.
// Add X-Content-Type-Options: nosniff so browsers honor the declared Content-Type
// and don't MIME-sniff uploaded files (e.g., a .jpg containing HTML won't render as HTML).
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(path.join(__dirname, 'uploads')));
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
app.use('/api/payments', paymentsRoutes);
app.use('/api/coach-signup', coachSignupRoutes);
app.use('/api/admin/coach-verification', adminCoachVerificationRoutes);

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

// Recalculate engagement scores every 15 minutes for time decay
const Post = require('./models/Post');
setInterval(async () => {
  try {
    await Post.recalculateAllEngagementScores();
  } catch (err) {
    logger.error('Engagement score batch recalc failed:', err.message);
  }
}, 15 * 60 * 1000);

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
