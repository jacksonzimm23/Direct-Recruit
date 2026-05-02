const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');
const { isTokenRevoked } = require('../utils/tokenRevocation');

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
        // Log presence + cookie names only — never the JWT value (could leak via
        // shared terminal output / screenshots / log aggregation).
        const cookieNames = Object.keys(req.cookies || {}).join(',') || '(none)';
        logger.info(`[AUTH DEBUG] No token found. hasTokenCookie=${!!req.cookies?.token} cookieNames=[${cookieNames}] origin=${req.headers.origin || '(none)'}`);
      }
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Reject tokens issued before the user's most recent revocation event
    // (logout / password change / password reset). Security #24.
    if (await isTokenRevoked(decoded.userId, decoded.iat)) {
      return res.status(401).json({ error: 'Invalid authentication' });
    }

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

// Soft-auth middleware — populates req.user / req.userId if a valid token is present,
// but never 401s. Use on endpoints that work for both logged-in and logged-out users
// where the auth state changes behavior (e.g., the coach signup-request form: anonymous
// submission for new signups, authenticated submission for profile-type switches).
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next();
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Revoked token → silently treat as anonymous (matches optional-auth's
    // existing "bad token" behavior — never 401 here). Security #24.
    if (await isTokenRevoked(decoded.userId, decoded.iat)) {
      return next();
    }

    const user = await User.findById(decoded.userId);
    if (user && user.is_active) {
      req.user = user;
      req.userId = user.id;
    }
  } catch (e) {
    // Bad / expired token — silently continue as anonymous
  }
  next();
};

module.exports = { authMiddleware, optionalAuthMiddleware, requireRole, validateUUID, UUID_REGEX };
