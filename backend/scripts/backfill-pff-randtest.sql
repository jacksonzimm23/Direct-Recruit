-- backfill-pff-randtest.sql
-- Backfills pff_grade on randtest.%@test.com player_profiles rows (the bulk
-- collegeplayer + transferplayer test users) using the same realistic
-- distribution the seed-*players.js generators now emit on new INSERTs:
--
--   ~8%  → NULL                  (no grade on file)
--   ~15% → 45.0–60.0 (below avg)
--   ~37% → 60.0–75.0 (avg → above avg)
--   ~30% → 75.0–85.0 (high)
--   ~10% → 85.0–95.0 (elite)
--
-- IDEMPOTENT: only touches rows whose pff_grade IS NULL (safe to re-run).
-- SAFETY: scoped to randtest.%@test.com only. Will NOT touch real users.
--
-- Apply locally:
--   docker exec -i dr-postgres psql -U postgres -d direct_recruit < backend/scripts/backfill-pff-randtest.sql
--
-- Apply on prod (after SSH'ing into EC2 — see CLAUDE.md):
--   cd ~/direct-recruit
--   psql "$DATABASE_URL" -f backend/scripts/backfill-pff-randtest.sql
--   (or pipe via stdin if the file isn't on the EC2 box)

BEGIN;

WITH targets AS (
  SELECT pp.user_id, random() AS roll
  FROM player_profiles pp
  JOIN users u ON u.id = pp.user_id
  WHERE u.email LIKE 'randtest.%@test.com'
    AND pp.pff_grade IS NULL
)
UPDATE player_profiles pp
SET pff_grade = ROUND(
  CASE
    WHEN t.roll < 0.08 THEN NULL                       -- 8%: keep NULL (no-op via NULLIF below)
    WHEN t.roll < 0.23 THEN 45.0 + (random() * 15.0)   -- 15%: 45.0-60.0
    WHEN t.roll < 0.60 THEN 60.0 + (random() * 15.0)   -- 37%: 60.0-75.0
    WHEN t.roll < 0.90 THEN 75.0 + (random() * 10.0)   -- 30%: 75.0-85.0
    ELSE                     85.0 + (random() * 10.0)  -- 10%: 85.0-95.0
  END::numeric,
  1
)
FROM targets t
WHERE pp.user_id = t.user_id;

-- Report what we did
SELECT
  COUNT(*) FILTER (WHERE pp.pff_grade IS NULL) AS still_null,
  COUNT(*) FILTER (WHERE pp.pff_grade BETWEEN 0    AND 59.9) AS below_avg,
  COUNT(*) FILTER (WHERE pp.pff_grade BETWEEN 60.0 AND 74.9) AS avg_tier,
  COUNT(*) FILTER (WHERE pp.pff_grade BETWEEN 75.0 AND 84.9) AS high_tier,
  COUNT(*) FILTER (WHERE pp.pff_grade BETWEEN 85.0 AND 100.0) AS elite,
  COUNT(*) AS total_randtest
FROM player_profiles pp
JOIN users u ON u.id = pp.user_id
WHERE u.email LIKE 'randtest.%@test.com';

COMMIT;
