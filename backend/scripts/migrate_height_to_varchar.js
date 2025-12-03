const pool = require('../config/database');

async function migrateHeight() {
    const client = await pool.connect();

    try {
        console.log('Starting height column migration...');

        // Step 1: Add temporary VARCHAR column
        await client.query('ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS height_temp VARCHAR(20)');
        console.log('✓ Added temporary height_temp column');

        // Step 2: Convert existing integer heights to feet'inches" format
        const result = await client.query('SELECT id, height FROM player_profiles WHERE height IS NOT NULL');

        for (const row of result.rows) {
            if (row.height && typeof row.height === 'number') {
                const feet = Math.floor(row.height / 12);
                const inches = row.height % 12;
                const heightString = `${feet}'${inches}"`;

                await client.query(
                    'UPDATE player_profiles SET height_temp = $1 WHERE id = $2',
                    [heightString, row.id]
                );
            } else if (row.height) {
                // Already a string, copy as-is
                await client.query(
                    'UPDATE player_profiles SET height_temp = $1 WHERE id = $2',
                    [row.height, row.id]
                );
            }
        }
        console.log(`✓ Converted ${result.rows.length} height values to feet'inches" format`);

        // Step 3: Drop old column
        await client.query('ALTER TABLE player_profiles DROP COLUMN IF EXISTS height');
        console.log('✓ Dropped old height column');

        // Step 4: Rename temp column
        await client.query('ALTER TABLE player_profiles RENAME COLUMN height_temp TO height');
        console.log('✓ Renamed height_temp to height');

        console.log('\n✅ Migration completed successfully!');
        console.log('The height column now stores formatted strings (e.g., "6\'1\\"")');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        client.release();
        await pool.end();
    }
}

migrateHeight();
