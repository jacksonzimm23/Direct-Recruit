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
    console.log('Running migration: Add resend tracking columns...');
    console.log('Connected to:', process.env.DB_HOST);

    // Add resend_count column
    await client.query(`
      ALTER TABLE pending_email_changes
      ADD COLUMN IF NOT EXISTS resend_count INTEGER DEFAULT 0
    `);
    console.log('Added resend_count column');

    // Add last_resend_at column
    await client.query(`
      ALTER TABLE pending_email_changes
      ADD COLUMN IF NOT EXISTS last_resend_at TIMESTAMP
    `);
    console.log('Added last_resend_at column');

    // Add cooldown_until column (for tracking when cooldown ends)
    await client.query(`
      ALTER TABLE pending_email_changes
      ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMP
    `);
    console.log('Added cooldown_until column');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
