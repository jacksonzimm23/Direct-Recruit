const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const Message = require('./models/Message');
const logger = require('./utils/logger');

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

    // Typing indicator
    socket.on('typing_start', (conversationId) => {
      socket.to(conversationId).emit('user_typing', { userId: socket.userId, conversationId });
    });

    socket.on('typing_stop', (conversationId) => {
      socket.to(conversationId).emit('user_stopped_typing', { userId: socket.userId, conversationId });
    });

    // Send message via socket (alternative to REST endpoint)
    socket.on('send_message', async ({ conversationId, content }) => {
      try {
        const isParticipant = await Message.isParticipant(conversationId, socket.userId);
        if (!isParticipant) {
          socket.emit('error', { message: 'Not a participant' });
          return;
        }

        const message = await Message.sendMessage(conversationId, socket.userId, content);
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
