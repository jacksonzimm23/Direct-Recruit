const redisClient = require('../config/redis');
const logger = require('./logger');

const KEY_PREFIX = 'jwt:revoke-before:';
// 7 days + 1h slack — TTL just needs to outlive the longest-lived JWT.
const CUTOFF_TTL_SECONDS = 7 * 24 * 60 * 60 + 3600;

// Bump the revoke-before cutoff for a user to "now". Any JWT for this user
// with iat <= cutoff is now invalid until the user logs in again (which
// produces a fresh JWT with iat > cutoff). No-op in dev (Redis stub).
async function bumpRevokeCutoff(userId) {
  if (!userId || !redisClient.isReady) return;
  try {
    const cutoff = Math.floor(Date.now() / 1000);
    await redisClient.set(`${KEY_PREFIX}${userId}`, String(cutoff), { EX: CUTOFF_TTL_SECONDS });
  } catch (err) {
    logger.error('bumpRevokeCutoff failed', { userId, error: err.message });
    // Fail open — never block a legitimate logout/password-change on a Redis blip.
  }
}

// Returns true if the token's iat is at or before the user's revoke cutoff.
// Fail-open on Redis errors (graceful degradation).
async function isTokenRevoked(userId, tokenIat) {
  if (!userId || !tokenIat || !redisClient.isReady) return false;
  try {
    const cutoffStr = await redisClient.get(`${KEY_PREFIX}${userId}`);
    if (!cutoffStr) return false;
    const cutoff = parseInt(cutoffStr, 10);
    if (!Number.isFinite(cutoff)) return false;
    return tokenIat <= cutoff;
  } catch (err) {
    logger.error('isTokenRevoked check failed', { userId, error: err.message });
    return false; // fail open
  }
}

module.exports = { bumpRevokeCutoff, isTokenRevoked };
