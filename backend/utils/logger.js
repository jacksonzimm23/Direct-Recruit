// Environment-aware logger — silent in production except for errors and warnings
const isProd = process.env.NODE_ENV === 'production';

const logger = {
  info: (...args) => { if (!isProd) console.log(...args); },
  debug: (...args) => { if (!isProd) console.log(...args); },
  warn: (...args) => { console.warn(...args); },
  error: (...args) => { console.error(...args); },
};

module.exports = logger;
