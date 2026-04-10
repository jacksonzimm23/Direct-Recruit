// One-time backfill script to populate engagement_score for all existing posts.
// Run with: node backend/scripts/recalculate-engagement-scores.js

const pool = require('../config/database');

async function backfill() {
  const result = await pool.query(`
    UPDATE posts SET engagement_score = (
      (likes_count * 2.0) +
      (comments_count * 3.0) +
      (shares_count * 5.0) +
      (saves_count * 2.5)
    ) / POWER(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0 + 2, 1.5)
    WHERE (is_deleted = false OR is_deleted IS NULL)
  `);
  console.log(`Updated ${result.rowCount} posts`);
  process.exit(0);
}

backfill().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
