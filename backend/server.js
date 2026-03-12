const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
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
const initializeSocket = require('./socket');
const { apiLimiter } = require('./middleware/rateLimit');

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
// Serve static uploads BEFORE helmet to avoid security headers blocking images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
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

// In development, serve frontend files so cookies work on the same origin
if (process.env.NODE_ENV !== 'production') {
  app.use('/frontend', express.static(path.join(__dirname, '..', 'frontend')));
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server running`);
  console.log(`Environment: ${process.env.NODE_ENV}`);

  if (process.env.NODE_ENV !== 'production') {
    console.log('');
    console.log('LOCAL DEV MODE — AWS services are mocked:');
    console.log('  Auth: bcrypt-based (no Cognito)');
    console.log('  Storage: local filesystem (no S3)');
    console.log('  Email: console output (no SES)');
    console.log(`  Verification code: ${process.env.LOCAL_DEV_VERIFICATION_CODE || '123456'}`);
    console.log('');
  }
});

module.exports = app;
