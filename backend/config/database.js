const { Pool, types } = require('pg');
require('dotenv').config();
const logger = require('../utils/logger');

// Override how pg parses TIMESTAMPTZ - return raw string without timezone conversion
// This prevents the pg driver from misinterpreting timezone data
types.setTypeParser(1184, (val) => val); // TIMESTAMPTZ
types.setTypeParser(1114, (val) => val); // TIMESTAMP

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DB_HOST !== 'localhost' ? {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  } : false,
});

// Set timezone to UTC for all connections to ensure consistent timestamp handling
pool.on('connect', (client) => {
  client.query("SET timezone = 'UTC'");
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Wrap pool.query to log database errors with query context
const originalQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  try {
    return await originalQuery(...args);
  } catch (error) {
    // Log the failed query text (but not parameter values, which may contain user data)
    const queryText = typeof args[0] === 'string' ? args[0] : args[0]?.text;
    logger.error('Database query failed', {
      query: queryText?.slice(0, 200),
      error: error.message,
    });
    throw error;
  }
};

module.exports = pool;
