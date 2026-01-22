const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'direct_recruit',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Bailey12@Abri2363',
  ssl: process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running migration: Add private profile support...');

    // Add profile_visibility column to player_profiles
    await client.query(`
      ALTER TABLE player_profiles
      ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) DEFAULT 'everyone'
    `);
    console.log('Added profile_visibility to player_profiles');

    // Add message_permissions column to player_profiles
    await client.query(`
      ALTER TABLE player_profiles
      ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone'
    `);
    console.log('Added message_permissions to player_profiles');

    // Add profile_visibility column to coach_profiles
    await client.query(`
      ALTER TABLE coach_profiles
      ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) DEFAULT 'everyone'
    `);
    console.log('Added profile_visibility to coach_profiles');

    // Add message_permissions column to coach_profiles
    await client.query(`
      ALTER TABLE coach_profiles
      ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone'
    `);
    console.log('Added message_permissions to coach_profiles');

    // Add profile_visibility column to other_profiles
    await client.query(`
      ALTER TABLE other_profiles
      ADD COLUMN IF NOT EXISTS profile_visibility VARCHAR(20) DEFAULT 'everyone'
    `);
    console.log('Added profile_visibility to other_profiles');

    // Add message_permissions column to other_profiles
    await client.query(`
      ALTER TABLE other_profiles
      ADD COLUMN IF NOT EXISTS message_permissions VARCHAR(20) DEFAULT 'everyone'
    `);
    console.log('Added message_permissions to other_profiles');

    // Create follow_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS follow_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        requester_id UUID REFERENCES users(id) ON DELETE CASCADE,
        target_id UUID REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(requester_id, target_id),
        CHECK (requester_id != target_id)
      )
    `);
    console.log('Created follow_requests table');

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_follow_requests_requester ON follow_requests(requester_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_follow_requests_target ON follow_requests(target_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_follow_requests_status ON follow_requests(status)`);
    console.log('Created indexes on follow_requests');

    // Create trigger for updated_at
    await client.query(`
      DROP TRIGGER IF EXISTS update_follow_requests_updated_at ON follow_requests
    `);
    await client.query(`
      CREATE TRIGGER update_follow_requests_updated_at
        BEFORE UPDATE ON follow_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);
    console.log('Created trigger for follow_requests');

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
