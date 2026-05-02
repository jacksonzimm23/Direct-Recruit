const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Skip rate limiting in development for localhost
const isDevelopment = process.env.NODE_ENV !== 'production';

// Only load Redis store in production
function getRedisStore(prefix) {
  if (isDevelopment) return {};
  const RedisStore = require('rate-limit-redis').default;
  const redisClient = require('../config/redis');
  return {
    store: new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
      prefix
    })
  };
}

// General API rate limiter
const apiLimiter = rateLimit({
  ...getRedisStore('rl:api:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : 2000, // 2000 requests per 15 minutes per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment, // Skip rate limiting entirely in development
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later'
    });
  }
});

// Auth endpoints rate limiter (stricter)
const authLimiter = rateLimit({
  ...getRedisStore('rl:auth:'),
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : 200, // Much higher limit for development
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment, // Skip rate limiting entirely in development
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts, please try again later'
    });
  }
});

// Post creation rate limiter
const postLimiter = rateLimit({
  ...getRedisStore('rl:post:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 posts per hour
  message: 'Post limit reached, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Password reset rate limiter — keyed by email (3 per hour per email)
const passwordResetLimiter = rateLimit({
  ...getRedisStore('rl:pwreset:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 10000 : 3,
  keyGenerator: (req) => req.body.email || req.ip,
  message: 'Too many password reset attempts for this email. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many password reset attempts for this email. Please try again later.'
    });
  }
});

// Availability check rate limiter — short window, prevents bursts
const availabilityLimiter = rateLimit({
  ...getRedisStore('rl:avail:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : 10, // 10 checks per 15 minutes per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment,
  handler: (req, res) => {
    logger.warn('Availability check short-window limit hit', { ip: req.ip, route: 'check-availability' });
    res.status(429).json({
      error: 'Too many requests, please try again later'
    });
  }
});

// Availability check daily soft-cap — prevents sustained enumeration from a single IP
const availabilityDailyLimiter = rateLimit({
  ...getRedisStore('rl:availday:'),
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: isDevelopment ? 10000 : 100, // 100 checks per day per IP
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment,
  handler: (req, res) => {
    logger.warn('Availability check daily cap hit', { ip: req.ip, route: 'check-availability' });
    res.status(429).json({
      error: 'Too many requests, please try again later'
    });
  }
});

// Message rate limiter
const messageLimiter = rateLimit({
  ...getRedisStore('rl:msg:'),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: 'Message limit reached, slow down',
  standardHeaders: true,
  legacyHeaders: false
});

// Coach signup request limiter — public contact form abuse protection
const coachRequestLimiter = rateLimit({
  ...getRedisStore('rl:coachreq:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 10000 : 3, // 3 requests per hour per IP
  keyGenerator: (req) => req.ip,
  message: 'Too many signup requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many signup requests. Please try again later.'
    });
  }
});

module.exports = {
  apiLimiter,
  authLimiter,
  postLimiter,
  messageLimiter,
  passwordResetLimiter,
  availabilityLimiter,
  availabilityDailyLimiter,
  coachRequestLimiter
};
