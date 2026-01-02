const pool = require('../config/database');

async function fixTimestamps() {
  const client = await pool.connect();
  try {
    console.log('Starting timestamp column fix...');

    // List of tables and their timestamp columns to fix
    const tableColumns = [
      { table: 'posts', columns: ['created_at', 'updated_at'] },
      { table: 'post_comments', columns: ['created_at', 'updated_at'] },
      { table: 'post_likes', columns: ['created_at'] },
      { table: 'post_saves', columns: ['created_at'] },
      { table: 'post_shares', columns: ['created_at'] },
      { table: 'comment_likes', columns: ['created_at'] },
      { table: 'messages', columns: ['created_at'] },
      { table: 'conversations', columns: ['created_at', 'updated_at'] },
      { table: 'users', columns: ['created_at', 'updated_at', 'last_login'] },
      { table: 'player_profiles', columns: ['created_at', 'updated_at'] },
      { table: 'coach_profiles', columns: ['created_at', 'updated_at'] },
      { table: 'other_profiles', columns: ['created_at', 'updated_at'] },
      { table: 'follows', columns: ['created_at'] },
      { table: 'notifications', columns: ['created_at'] },
    ];

    for (const { table, columns } of tableColumns) {
      // Check if table exists
      const tableExists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
        [table]
      );

      if (tableExists.rows.length === 0) {
        console.log(`Table ${table} does not exist, skipping...`);
        continue;
      }

      for (const column of columns) {
        // Check if column exists
        const colInfo = await client.query(
          `SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2`,
          [table, column]
        );

        if (colInfo.rows.length === 0) {
          console.log(`Column ${table}.${column} does not exist, skipping...`);
          continue;
        }

        if (colInfo.rows[0].data_type === 'timestamp with time zone') {
          console.log(`Column ${table}.${column} is already TIMESTAMPTZ, skipping...`);
          continue;
        }

        try {
          console.log(`Converting ${table}.${column} to TIMESTAMPTZ...`);
          await client.query(
            `ALTER TABLE ${table} ALTER COLUMN ${column} TYPE TIMESTAMPTZ USING ${column} AT TIME ZONE 'UTC'`
          );
          console.log(`  Done!`);
        } catch (err) {
          console.log(`  Error: ${err.message}`);
        }
      }
    }

    // Verify changes
    console.log('\nVerifying timestamp columns:');
    const result = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (column_name = 'created_at' OR column_name = 'updated_at')
      ORDER BY table_name, column_name
    `);
    console.log(result.rows);

    console.log('\nTimestamp column fix complete!');
  } finally {
    client.release();
    process.exit(0);
  }
}

fixTimestamps().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
