const { Pool } = require('pg');
require('dotenv').config({ path: '../.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'direct_recruit',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'Bailey12@Abri2363',
});

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('Running migration: Add created_by column to conversations...');

    // Add the created_by column
    await client.query(`
      ALTER TABLE conversations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL
    `);
    console.log('Added created_by column');

    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by)
    `);
    console.log('Created index on created_by');

    // Update existing conversations - set created_by to first participant
    const result = await client.query(`
      UPDATE conversations c
      SET created_by = (
        SELECT user_id
        FROM conversation_participants cp
        WHERE cp.conversation_id = c.id
        ORDER BY cp.joined_at ASC
        LIMIT 1
      )
      WHERE c.created_by IS NULL
    `);
    console.log(`Updated ${result.rowCount} existing conversations`);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
