const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const Message = require('./models/Message');
const logger = require('./utils/logger');

// Redis-backed rate limiter for socket events (falls back to in-memory in dev)
function createSocketRateLimiter(maxEvents, windowMs) {
  const redis = require('./config/redis');
  const useRedis = process.env.NODE_ENV === 'production' && redis.isReady;

  if (!useRedis) {
    // In-memory fallback for development
    const counters = new Map();
    setInterval(() => {
      const now = Date.now();
      for (const [key, data] of counters) {
        if (now - data.start > windowMs) counters.delete(key);
      }
    }, 60000);

    return (socketId) => {
      const now = Date.now();
      const data = counters.get(socketId);
      if (!data || now - data.start > windowMs) {
        counters.set(socketId, { count: 1, start: now });
        return true;
      }
      data.count++;
      return data.count <= maxEvents;
    };
  }

  // Redis-backed limiter for production
  const windowSec = Math.ceil(windowMs / 1000);
  return async (socketId) => {
    try {
      const key = `sock_rl:${socketId}`;
      const count = await redis.incr(key);
      if (count === 1) await redis.expire(key, windowSec);
      return count <= maxEvents;
    } catch {
      return true; // Allow on Redis error to avoid blocking users
    }
  };
}

function initializeSocket(server) {
  const allowedOrigins = process.env.NODE_ENV === 'production'
    ? ['https://directrecruit.net', 'https://www.directrecruit.net']
    : true;

  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      // Try to get token from cookie first, then fall back to auth object
      let token = null;

      // Parse cookies from handshake headers (HTTPOnly cookies only - no fallback)
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = cookie.parse(cookieHeader);
        token = cookies.token;
      }

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userRole = decoded.role;
      next();
    } catch (error) {
      next(new Error('Invalid authentication'));
    }
  });

  // Rate limiters: 30 messages/min, 60 typing events/min
  const messageRateLimit = createSocketRateLimiter(30, 60000);
  const typingRateLimit = createSocketRateLimiter(60, 60000);

  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId}`);

    // Join user's personal room
    socket.join(socket.userId);

    // Join conversation room
    socket.on('join_conversation', async (conversationId) => {
      try {
        const isParticipant = await Message.isParticipant(conversationId, socket.userId);
        if (isParticipant) {
          socket.join(conversationId);
          socket.emit('joined_conversation', { conversationId });
        }
      } catch (error) {
        logger.error('Join conversation error:', error);
      }
    });

    // Leave conversation room
    socket.on('leave_conversation', (conversationId) => {
      socket.leave(conversationId);
    });

    // Typing indicator (rate limited)
    socket.on('typing_start', async (conversationId) => {
      if (!(await typingRateLimit(socket.id))) return;
      socket.to(conversationId).emit('user_typing', { userId: socket.userId, conversationId });
    });

    socket.on('typing_stop', async (conversationId) => {
      if (!(await typingRateLimit(socket.id))) return;
      socket.to(conversationId).emit('user_stopped_typing', { userId: socket.userId, conversationId });
    });

    // Send message via socket (alternative to REST endpoint)
    socket.on('send_message', async ({ conversationId, content, media_url, media_type }) => {
      try {
        if (!(await messageRateLimit(socket.id))) {
          socket.emit('error', { message: 'Too many messages. Please slow down.' });
          return;
        }

        const isParticipant = await Message.isParticipant(conversationId, socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Not a participant' });
          return;
        }

        const trimmedContent = content ? String(content).trim() : '';
        const mediaUrl = media_url || null;
        const mediaType = media_type || null;

        if (!trimmedContent && !mediaUrl) {
          socket.emit('error', { message: 'Message must have content or an attachment' });
          return;
        }
        if (mediaUrl && !mediaUrl.startsWith(`message-media/${socket.userId}/`)) {
          socket.emit('error', { message: 'Invalid media reference' });
          return;
        }
        if (mediaUrl && !['image', 'video'].includes(mediaType)) {
          socket.emit('error', { message: 'Invalid media_type' });
          return;
        }

        const message = await Message.sendMessage(
          conversationId,
          socket.userId,
          trimmedContent || null,
          mediaUrl,
          mediaType
        );
        io.to(conversationId).emit('new_message', message);
      } catch (error) {
        logger.error('Send message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Online status
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.userId}`);
    });
  });

  return io;
}

module.exports = initializeSocket;
