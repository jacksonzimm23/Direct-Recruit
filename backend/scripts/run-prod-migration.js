/**
 * Production Migration Runner
 *
 * Tracks which migrations have been applied to the database using a
 * `schema_migrations` table. Only runs new migrations that haven't
 * been applied yet.
 *
 * Usage:
 *   cd backend && node scripts/run-prod-migration.js
 *
 * Options:
 *   --dry-run    Show which migrations would run without executing them
 *   --status     Show the status of all migrations (applied vs pending)
 */

const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Match the same type parsing as the main app
types.setTypeParser(1184, (val) => val);
types.setTypeParser(1114, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_HOST !== 'localhost' ? {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
  } : false,
});

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations() {
  const result = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY id'
  );
  return result.rows.map(row => row.filename);
}

function getPendingMigrations(applied) {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('No migrations directory found.');
    return [];
  }

  const allFiles = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Alphabetical sort ensures numbered order (001_, 002_, etc.)

  return allFiles.filter(f => !applied.includes(f));
}

async function showStatus(applied) {
  const allFiles = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
    : [];

  if (allFiles.length === 0) {
    console.log('\nNo migration files found in backend/migrations/');
    return;
  }

  console.log('\n  Migration Status:');
  console.log('  ' + '-'.repeat(60));

  for (const file of allFiles) {
    const status = applied.includes(file) ? '✓ APPLIED' : '○ PENDING';
    console.log(`  ${status}  ${file}`);
  }

  console.log('  ' + '-'.repeat(60));
  const pendingCount = allFiles.filter(f => !applied.includes(f)).length;
  console.log(`  ${applied.length} applied, ${pendingCount} pending\n`);
}

async function runMigrations(dryRun = false) {
  console.log('===========================================');
  console.log('  Direct Recruit — Production Migrations');
  console.log('===========================================');
  console.log(`  Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`  Database: ${process.env.DB_NAME}`);
  if (dryRun) console.log('  Mode: DRY RUN (no changes will be made)');

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('  Connection: OK');

    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    // If --status flag, just show status and exit
    if (process.argv.includes('--status')) {
      await showStatus(applied);
      return;
    }

    const pending = getPendingMigrations(applied);

    if (pending.length === 0) {
      console.log('\n  No pending migrations. Database is up to date.\n');
      return;
    }

    console.log(`\n  ${pending.length} pending migration(s):\n`);

    for (const filename of pending) {
      const filePath = path.join(MIGRATIONS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8');

      if (dryRun) {
        console.log(`  WOULD RUN: ${filename}`);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [filename]
        );
        await client.query('COMMIT');
        console.log(`  ✓ APPLIED: ${filename}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✗ FAILED: ${filename}`);
        console.error(`    Error: ${err.message}`);
        console.error('\n  Migration stopped. Fix the error and re-run.');
        process.exit(1);
      } finally {
        client.release();
      }
    }

    console.log('\n  All migrations applied successfully!\n');
  } catch (err) {
    console.error('\nFATAL:', err.message);
    console.error('Check your .env and database connection.\n');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const dryRun = process.argv.includes('--dry-run');
runMigrations(dryRun);
