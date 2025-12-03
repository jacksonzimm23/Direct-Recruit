const pool = require('../config/database');

async function migratePosition() {
    const client = await pool.connect();

    try {
        console.log('Starting position column migration...');

        // Step 1: Add temporary VARCHAR column
        await client.query('ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS position_temp VARCHAR(100)');
        console.log('✓ Added temporary position_temp column');

        // Step 2: Copy existing data
        await client.query("UPDATE player_profiles SET position_temp = position::text WHERE position IS NOT NULL");
        console.log('✓ Copied existing position data');

        // Step 3: Drop old column
        await client.query('ALTER TABLE player_profiles DROP COLUMN IF EXISTS position');
        console.log('✓ Dropped old position column');

        // Step 4: Rename temp column
        await client.query('ALTER TABLE player_profiles RENAME COLUMN position_temp TO position');
        console.log('✓ Renamed position_temp to position');

        console.log('\n✅ Migration completed successfully!');
        console.log('The position column now supports multiple positions (e.g., "CB/WR")');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migratePosition();
