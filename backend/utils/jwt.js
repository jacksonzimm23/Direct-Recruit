const jwt = require('jsonwebtoken');

const generateToken = (userId, role) => {
  return jwt.sign(
    { userId, role },
    process.env.JWT_SECRET,
    // 1 year. There is no "Remember me" — a session lasts until the user signs out.
    // GET /auth/me slides this window forward while the session is in use, so the
    // year only ever expires a device that went untouched. Keep in sync with
    // COOKIE_OPTIONS.maxAge (routes/auth.js) and CUTOFF_TTL_SECONDS
    // (utils/tokenRevocation.js). NOTE: JWT_EXPIRE in .env overrides this.
    { expiresIn: process.env.JWT_EXPIRE || '365d' }
  );
};

module.exports = { generateToken };
