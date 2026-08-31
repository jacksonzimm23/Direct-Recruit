const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Skip rate limiting in development for localhost
const isDevelopment = process.env.NODE_ENV !== 'production';

// Local-only escape hatch: `FORCE_RATE_LIMITS=1 node server.js` exercises the
// 429 paths in dev without pretending to be production (NODE_ENV=production
// locally would also demand a live Redis, SSL on the DB, and prod cookie/CORS
// behaviour). Deliberately does NOT affect getRedisStore below — dev keeps the
// in-memory store.
//
// This exists because the availability limiters skipping in dev is exactly why
// the "username already taken" signup bug was never caught locally: the 429
// response the frontend mishandled could not be produced on a dev machine.
const limitsBypassed = isDevelopment && process.env.FORCE_RATE_LIMITS !== '1';

// Event-window overrides for the two limiters that can HARD-BLOCK onboarding
// (apiLimiter gates every /api call, authLimiter gates register/login/verify).
//
// Optional by design: absent, empty or unparseable falls through the `||` to the
// committed default, so the backend still boots without them. Deliberately NOT
// added to REQUIRED_SECRETS in server.js — a missing required var makes the
// backend refuse to start (lessons.md #116), and these must never be able to do
// that.
//
// Retune live without a deploy: edit prod .env, then
//     pm2 restart direct-recruit --update-env
// To revert entirely: delete the two .env lines and restart. No code change.
//
// COLLAB 2026-08-30: set RATE_API_MAX=10000 / RATE_AUTH_MAX=2000 for the event.
const API_MAX = Number(process.env.RATE_API_MAX) || 2000;
const AUTH_MAX = Number(process.env.RATE_AUTH_MAX) || 500;

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

// Endpoints exempt from the GLOBAL per-IP budget.
//
// Every logged-in user runs two 30s badge polls (CLAUDE.md Pattern 3, e.g.
// frontend/hsplayer/mainpage-player.js) = 4 req/min = ~60 req/user/15min of
// pure IDLE load, before anyone loads a page. apiLimiter is mounted globally on
// /api and keyed on req.ip, so behind carrier NAT (where hundreds of phone users
// share one IP) that budget is consumed by polling alone:
//
//     2000 / 60 = ~33 idle users per IP before the 34th gets 429s on everything.
//
// Both endpoints are authMiddleware-gated and return nothing but
// { unreadCount: N }, so excluding them from the IP budget gives up essentially
// no abuse protection while removing the dominant term.
//
// NOTE ON PATH FORM: apiLimiter is mounted via app.use('/api/', ...) in
// server.js, so Express strips the mount prefix and req.path here is
// '/notifications/unread-count', NOT '/api/notifications/unread-count'.
// If this ever stops matching, the skip simply never fires and behaviour falls
// back to the plain per-IP cap — it fails safe, it does not break.
//
// COLLAB 2026-08-30. To revert: delete POLL_PATHS and restore
// `skip: (req) => isDevelopment`.
const POLL_PATHS = new Set([
  '/notifications/unread-count',
  '/messages/unread-count'
]);

// General API rate limiter
const apiLimiter = rateLimit({
  ...getRedisStore('rl:api:'),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDevelopment ? 10000 : API_MAX, // per IP per 15 min; RATE_API_MAX overrides
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip entirely in development, and always skip the idle badge polls.
  skip: (req) => isDevelopment || POLL_PATHS.has(req.path),
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests, please try again later'
    });
  }
});

// Auth endpoints rate limiter (stricter).
// Cap absorbs carrier NAT (cell users sharing IPs on the iOS app). keyGenerator
// stays on req.ip since req.userId is null at login/signup time.
//
// This one is a HARD blocker when tripped: it guards /register, /login,
// /verify-email, /resend-verification, /forgot-password and /reset-password
// (routes/auth.js), so a false 429 means a new user cannot create an account
// at all. Signup alone costs several calls (register -> verify -> maybe resend),
// so the per-user cost is well above 1.
//
// The previous comment claimed 500/15min "comfortably handles hundreds of users
// behind one carrier NAT" — that was optimistic. Raise it via RATE_AUTH_MAX
// ahead of any campaign that drives concentrated mobile signup traffic.
const authLimiter = rateLimit({
  ...getRedisStore('rl:auth:'),
  windowMs: 15 * 60 * 1000,
  max: isDevelopment ? 10000 : AUTH_MAX, // per IP per 15 min; RATE_AUTH_MAX overrides
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

// Availability check rate limiters.
//
// IMPORTANT: the username and email checks get SEPARATE limiter instances (and
// therefore separate Redis buckets). They both live on the same signup form, so
// sharing one bucket meant typing an email drained the username budget and vice
// versa — a coach filling out one form could exhaust the cap by themselves.
//
// Caps are deliberately generous. The checks are debounced-per-keystroke, so one
// username attempt costs several requests, and cell/school NAT puts many real
// users behind a single IP. A false 429 here is far more damaging than a slow
// enumeration attempt: the endpoints only ever answer yes/no, and the server
// still enforces uniqueness at write time (23505 -> 409).
//
// History: the short-window cap went 10 -> 25 -> 60 -> 200 (daily 400 -> 2000 at
// the same time, for the COLLAB 2026-08-30 traffic event). The 25 was still low enough
// that testers on shared WiFi hit it constantly, and the frontend rendered the
// resulting 429 as "This username is already taken" (fixed in shared/api.js —
// see checkAvailability, which maps any non-200 to 'unknown', never 'taken').
function makeAvailabilityLimiters(label, shortPrefix, dailyPrefix) {
  return {
    short: rateLimit({
      ...getRedisStore(shortPrefix),
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: limitsBypassed ? 10000 : 200, // COLLAB 2026-08-30, revert to: 60
      message: 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => limitsBypassed,
      handler: (req, res) => {
        logger.warn('Availability check short-window limit hit', { ip: req.ip, route: label });
        res.status(429).json({
          error: 'Too many requests, please try again later'
        });
      }
    }),
    daily: rateLimit({
      ...getRedisStore(dailyPrefix),
      windowMs: 24 * 60 * 60 * 1000, // 24 hours
      max: limitsBypassed ? 10000 : 2000, // COLLAB 2026-08-30, revert to: 400
      message: 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false,
      skip: () => limitsBypassed,
      handler: (req, res) => {
        logger.warn('Availability check daily cap hit', { ip: req.ip, route: label });
        res.status(429).json({
          error: 'Too many requests, please try again later'
        });
      }
    })
  };
}

const _usernameAvailability = makeAvailabilityLimiters('check-username', 'rl:avail:', 'rl:availday:');
const _emailAvailability = makeAvailabilityLimiters('check-email', 'rl:availemail:', 'rl:availemailday:');

const availabilityLimiter = _usernameAvailability.short;
const availabilityDailyLimiter = _usernameAvailability.daily;
const emailAvailabilityLimiter = _emailAvailability.short;
const emailAvailabilityDailyLimiter = _emailAvailability.daily;

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
  emailAvailabilityLimiter,
  emailAvailabilityDailyLimiter,
  coachRequestLimiter,
  questionnaireGetLimiter,
  questionnaireSubmitLimiter,
  reportRateLimit
};
