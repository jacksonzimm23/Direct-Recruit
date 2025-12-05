const express = require('express');
const http = require('http');
const cors = require('cors');
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
const initializeSocket = require('./socket');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const server = http.createServer(app);
const io = initializeSocket(server);
const PORT = process.env.PORT || 5000;

app.set('io', io);

// Middleware
app.use(cors());
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
});

module.exports = app;
