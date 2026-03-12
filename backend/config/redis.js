const redis = require('redis');
require('dotenv').config();

// In development, export a stub so the app starts without Redis
if (process.env.NODE_ENV !== 'production') {
  const stub = {
    sendCommand: () => Promise.resolve(),
    connect: () => Promise.resolve(),
    on: () => stub,
    isReady: false
  };
  console.log('[Redis] Skipped — using in-memory stub for development');
  module.exports = stub;
  return;
}

const redisClient = redis.createClient({
  socket: {
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT
  }
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.on('connect', () => console.log('Redis connected'));

(async () => {
  await redisClient.connect();
})();

module.exports = redisClient;
