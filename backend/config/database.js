const { Pool, types } = require('pg');
require('dotenv').config();

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
    rejectUnauthorized: false
  } : false,
});

// Set timezone to UTC for all connections to ensure consistent timestamp handling
pool.on('connect', (client) => {
  client.query("SET timezone = 'UTC'");
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;
