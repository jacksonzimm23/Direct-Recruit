const redis = require('redis');
require('dotenv').config();
const logger = require('../utils/logger');

// In development, export a stub so the app starts without Redis
if (process.env.NODE_ENV !== 'production') {
  const stub = {
    sendCommand: () => Promise.resolve(),
    connect: () => Promise.resolve(),
    on: () => stub,
    isReady: false
  };
  logger.info('[Redis] Skipped — using in-memory stub for development');
  module.exports = stub;
  return;
}

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Redis connected'));

(async () => {
  await redisClient.connect();
})();

module.exports = redisClient;
