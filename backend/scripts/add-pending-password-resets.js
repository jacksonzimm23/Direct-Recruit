const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running migration: Add pending_password_resets table...');
    console.log('Connected to:', process.env.DB_HOST);

    // Create the pending_password_resets table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_password_resets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email VARCHAR(255) NOT NULL,
        verification_code VARCHAR(6) NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        resend_count INTEGER DEFAULT 0,
        last_resend_at TIMESTAMP,
        cooldown_until TIMESTAMP,
        UNIQUE(user_id)
      )
    `);
    console.log('Created pending_password_resets table');

    // Create index on user_id for faster lookups
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_password_resets_user_id ON pending_password_resets(user_id)
    `);
    console.log('Created index on user_id');

    // Create index on expires_at for cleanup queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_password_resets_expires_at ON pending_password_resets(expires_at)
    `);
    console.log('Created index on expires_at');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
