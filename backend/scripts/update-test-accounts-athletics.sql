-- update-test-accounts-athletics.sql
--
-- Backfill randomized other_sports + track_100m/track_200m for the
-- prod test accounts seeded via bulk-hsplayers.sql / bulk-transferplayers.sql.
-- Scope: ONLY accounts with email LIKE 'randtest.%@test.com' AND role='player'
--        AND NOT a college player (so transfer='y' OR no college_division).
-- Idempotent: only updates rows where other_sports IS NULL, so re-runs are safe.
--
-- Rules:
--   * Skill players (position contains WR, CB, S, RB, or TE) always get
--     'Track and Field' plus 0-2 random extras from a skill-friendly pool,
--     AND get randomized 100m (10.6-12.0s) + 200m (21.5-24.5s) times.
--   * Non-skill players (linemen, LBs, QBs, K/P) get 0-2 random sports from
--     the full sport list, no guaranteed track, no track times.
--     Roughly 1/3 stay football-only (NULL other_sports) by random chance.
--
-- Per-row random: inline `SELECT ... WHERE random() < N` would normally be
-- cached by the planner (every row gets the same array). The fix is to
-- reference the outer row inside the WHERE clause — `AND u.id IS NOT NULL`
-- is a no-op truth that forces per-row evaluation. Verified working at scale.
--
-- Run from EC2 (or wherever has psql access to prod RDS):
--   psql "$DATABASE_URL" -f backend/scripts/update-test-accounts-athletics.sql
--
-- Cleanup (revert all randtest accounts to football-only, no track times):
--   UPDATE player_profiles SET other_sports = NULL, track_100m = NULL, track_200m = NULL
--    WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'randtest.%@test.com');

BEGIN;

-- ─── SKILL POSITIONS: WR / CB / S / RB / TE ─────────────────────────────────
-- Guaranteed 'Track and Field' + 0-2 random extras from a 5-sport pool
-- (Basketball, Baseball, Soccer, Lacrosse, Wrestling) at p=0.25 each.
-- + randomized track times.
UPDATE player_profiles pp
SET
    other_sports = ARRAY['Track and Field'] || COALESCE(
        ARRAY(
            SELECT s FROM unnest(ARRAY['Basketball','Baseball','Soccer','Lacrosse','Wrestling']) s
            WHERE random() < 0.25 AND u.id IS NOT NULL
            LIMIT 2
        ),
        '{}'::text[]
    ),
    track_100m = round((random() * (12.00 - 10.60) + 10.60)::numeric, 2),
    track_200m = round((random() * (24.50 - 21.50) + 21.50)::numeric, 2)
FROM users u
WHERE pp.user_id = u.id
  AND u.email LIKE 'randtest.%@test.com'
  AND pp.other_sports IS NULL
  -- HS players (no division, no transfer flag) OR transfer players. Excludes college.
  AND (
      ((pp.college_division IS NULL OR pp.college_division = '') AND (pp.transfer IS NULL OR pp.transfer != 'y'))
      OR pp.transfer = 'y'
  )
  AND pp.position ~ '(^|/)(WR|CB|S|RB|TE)($|/)';

-- ─── NON-SKILL POSITIONS: linemen / LBs / QBs / K / P ───────────────────────
-- 0-2 random sports from the full 12-sport pool at p=0.13 each.
-- No track times. Empty array → NULL → "football only" in UI.
UPDATE player_profiles pp
SET
    other_sports = CASE
        WHEN array_length(picks, 1) IS NULL THEN NULL
        ELSE picks
    END
FROM users u,
     LATERAL (
       SELECT ARRAY(
         SELECT s FROM unnest(ARRAY[
           'Basketball','Baseball','Track and Field','Wrestling',
           'Soccer','Lacrosse','Hockey','Volleyball','Tennis',
           'Golf','Swimming','Rugby'
         ]) s
         WHERE random() < 0.13 AND u.id IS NOT NULL
         LIMIT 2
       ) AS picks
     ) AS p
WHERE pp.user_id = u.id
  AND u.email LIKE 'randtest.%@test.com'
  AND pp.other_sports IS NULL
  AND (
      ((pp.college_division IS NULL OR pp.college_division = '') AND (pp.transfer IS NULL OR pp.transfer != 'y'))
      OR pp.transfer = 'y'
  )
  AND pp.position !~ '(^|/)(WR|CB|S|RB|TE)($|/)';

-- Post-update summary so you can sanity-check the result
DO $$
DECLARE
  v_skill_with_track INT;
  v_skill_distinct_sport_combos INT;
  v_nonskill_with_sports INT;
  v_nonskill_distinct_combos INT;
  v_football_only INT;
BEGIN
  SELECT COUNT(*) INTO v_skill_with_track
  FROM player_profiles pp
  JOIN users u ON u.id = pp.user_id
  WHERE u.email LIKE 'randtest.%@test.com' AND pp.track_100m IS NOT NULL;

  SELECT COUNT(DISTINCT pp.other_sports) INTO v_skill_distinct_sport_combos
  FROM player_profiles pp
  JOIN users u ON u.id = pp.user_id
  WHERE u.email LIKE 'randtest.%@test.com' AND pp.track_100m IS NOT NULL;

  SELECT COUNT(*) INTO v_nonskill_with_sports
  FROM player_profiles pp
  JOIN users u ON u.id = pp.user_id
  WHERE u.email LIKE 'randtest.%@test.com' AND pp.track_100m IS NULL
    AND pp.other_sports IS NOT NULL AND array_length(pp.other_sports, 1) > 0;

  SELECT COUNT(DISTINCT pp.other_sports) INTO v_nonskill_distinct_combos
  FROM player_profiles pp
  JOIN users u ON u.id = pp.user_id
  WHERE u.email LIKE 'randtest.%@test.com' AND pp.track_100m IS NULL
    AND pp.other_sports IS NOT NULL AND array_length(pp.other_sports, 1) > 0;

  SELECT COUNT(*) INTO v_football_only
  FROM player_profiles pp
  JOIN users u ON u.id = pp.user_id
  WHERE u.email LIKE 'randtest.%@test.com' AND pp.other_sports IS NULL;

  RAISE NOTICE 'Skill players with track times: %  (% distinct sport combos)', v_skill_with_track, v_skill_distinct_sport_combos;
  RAISE NOTICE 'Non-skill players with other sports: %  (% distinct sport combos)', v_nonskill_with_sports, v_nonskill_distinct_combos;
  RAISE NOTICE 'Football-only (no other sports): %', v_football_only;
END $$;

COMMIT;
