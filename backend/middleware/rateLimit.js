const rateLimit = require('express-rate-limit');

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

// Message rate limiter
const messageLimiter = rateLimit({
  ...getRedisStore('rl:msg:'),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: 'Message limit reached, slow down',
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = {
  apiLimiter,
  authLimiter,
  postLimiter,
  messageLimiter
};
