const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Middleware to validate UUID parameters
const validateUUID = (...paramNames) => {
  return (req, res, next) => {
    for (const paramName of paramNames) {
      const value = req.params[paramName];
      if (value && !UUID_REGEX.test(value)) {
        return res.status(400).json({ error: 'Invalid ID format' });
      }
    }
    next();
  };
};

const authMiddleware = async (req, res, next) => {
  try {
    // Read token from cookie (primary) or Authorization header (fallback for WebSocket)
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      if (process.env.NODE_ENV !== 'production') {
        logger.info('[AUTH DEBUG] No token found. Cookies:', JSON.stringify(req.cookies), 'Origin:', req.headers.origin);
      }
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.info('[AUTH DEBUG] Token verify failed:', error.message);
    }
    res.status(401).json({ error: 'Invalid authentication' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authMiddleware, requireRole, validateUUID };
