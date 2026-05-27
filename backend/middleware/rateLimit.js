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

// Auth endpoints rate limiter (stricter).
// Cap is generous to absorb carrier NAT (cell users sharing IPs on the iOS
// app). 500/15min = ~33/min, comfortably handles hundreds of users behind
// one carrier NAT without false-429s. keyGenerator stays on req.ip since
// req.userId is null at login/signup time.
const authLimiter = rateLimit({
  ...getRedisStore('rl:auth:'),
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : 500, // Cell-NAT-safe cap for iOS app users
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

// Availability check rate limiter — short window, prevents bursts.
// Raised from 10 to 25 to absorb carrier NAT (multiple cell users behind
// the same IP) without false-429s on signup availability checks.
const availabilityLimiter = rateLimit({
  ...getRedisStore('rl:avail:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : 25, // 25 checks per 15 minutes per IP (cell-NAT-safe)
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

// Coach signup request limiter — public contact form abuse protection.
// Only applies to anonymous requests. Authenticated coaches (profile-type
// switches and intra-school team switches) skip the limit entirely because
// they're already verified users and the 3/hr cap was hitting normal usage
// (e.g. a coach editing their team in Settings burned all 3 slots quickly).
// `optionalAuthMiddleware` must run BEFORE this limiter on the route so
// `req.user` is populated by the time `skip` reads it.
const coachRequestLimiter = rateLimit({
  ...getRedisStore('rl:coachreq:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 10000 : 3, // 3 requests per hour per IP
  keyGenerator: (req) => req.ip,
  message: 'Too many signup requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment || !!req.user,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many signup requests. Please try again later.'
    });
  }
});

// Public questionnaire GET — loose limit, just covers slug enumeration
const questionnaireGetLimiter = rateLimit({
  ...getRedisStore('rl:qget:'),
  windowMs: 60 * 1000, // 1 minute
  max: isDevelopment ? 10000 : 30,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
});

// Public questionnaire submission — strict per-IP limit
const questionnaireSubmitLimiter = rateLimit({
  ...getRedisStore('rl:qsubmit:'),
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isDevelopment ? 10000 : 5,
  keyGenerator: (req) => req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many submissions. Please try again in an hour.' });
  }
});

// Report submissions — per-user, 20 reports per rolling 24h.
// Must be mounted AFTER authMiddleware so req.userId is populated.
// Apple Guideline 1.2 wants a reporting mechanism but we also need to
// prevent abusers from spamming reports to harass legitimate users.
const reportRateLimit = rateLimit({
  ...getRedisStore('rl:report:'),
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: isDevelopment ? 10000 : 20,
  keyGenerator: (req) => req.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDevelopment,
  handler: (req, res) => {
    logger.warn('Report rate limit hit', { userId: req.userId, ip: req.ip });
    res.status(429).json({
      error: "You've reached the daily report limit. Please try again tomorrow."
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
  coachRequestLimiter,
  questionnaireGetLimiter,
  questionnaireSubmitLimiter,
  reportRateLimit
};
