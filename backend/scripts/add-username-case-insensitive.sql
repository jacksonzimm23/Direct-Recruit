-- 054_add_username_case_insensitive.sql
--
-- Make usernames case-insensitive across every table that stores one.
--
-- WHY: username had a plain UNIQUE constraint and every lookup used a
-- case-sensitive `=`, so 'JohnSmith' and 'johnsmith' were two distinct storable
-- identities. Four of the six create-profile pages shipped
-- pattern="[a-zA-Z0-9_]+" (uppercase permitted) and the server-side validator
-- had no charset rule at all, so mixed-case rows can exist. The visible symptom
-- was a user's OWN username reading as "already taken" in the edit-profile
-- modal: the input handler lowercases while the stored value kept its casing,
-- so the self-comparison missed and the availability check ran against their
-- own row.
--
-- Writes are now normalised to lowercase at the API boundary
-- (usernameField() in backend/middleware/validation.js, plus the profile-switch
-- path in backend/routes/settings.js). These indexes make that guarantee
-- structural rather than convention.
--
-- A unique functional index on lower(username) is used rather than converting
-- the columns to citext: same guarantee, one statement per table, no column
-- rewrite under ACCESS EXCLUSIVE, and no change to the comparison semantics the
-- trigram/ILIKE search in PlayerProfile.search() depends on (gin_trgm_ops is
-- defined for text, not citext -- see migrations/017_add_fuzzy_search.sql).
--
-- NO BEGIN/COMMIT IN THIS FILE. backend/scripts/run-prod-migration.js already
-- wraps every migration in BEGIN/COMMIT (run-prod-migration.js:133-142). A
-- nested BEGIN warns, and the inner COMMIT would close the runner's transaction
-- early, so the tracking INSERT would land outside it.
--
-- For the same reason CREATE INDEX CONCURRENTLY is unavailable here (it cannot
-- run inside a transaction). The plain SHARE lock is brief at current row
-- counts; revisit if these tables grow by orders of magnitude.

-- 1. Whitespace-only handles become NULL.
--    A unique index ignores NULLs but treats '' as a real value, so two rows
--    that both trim to '' would collide at step 3.
UPDATE users            SET username = NULL WHERE username IS NOT NULL AND btrim(username) = '';
UPDATE player_profiles  SET username = NULL WHERE username IS NOT NULL AND btrim(username) = '';
UPDATE coach_profiles   SET username = NULL WHERE username IS NOT NULL AND btrim(username) = '';
UPDATE other_profiles   SET username = NULL WHERE username IS NOT NULL AND btrim(username) = '';

-- 2. HARD STOP if lowercasing would collide inside any table.
--    Aborting with a readable message beats a bare 23505 from step 4, and beats
--    silently renaming somebody's public handle. Resolve collisions BY HAND
--    (pick a survivor, suffix the loser in both `users` and its profile table,
--    record old -> new because a rename breaks every shared /profile/username
--    link) and then re-run.
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('%s:%L x%s', tbl, lc, n), '; ') INTO bad FROM (
    SELECT 'users' tbl, lower(btrim(username)) lc, count(*) n
      FROM users WHERE username IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1
    UNION ALL SELECT 'player_profiles', lower(btrim(username)), count(*)
      FROM player_profiles WHERE username IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1
    UNION ALL SELECT 'coach_profiles', lower(btrim(username)), count(*)
      FROM coach_profiles WHERE username IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1
    UNION ALL SELECT 'other_profiles', lower(btrim(username)), count(*)
      FROM other_profiles WHERE username IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1
  ) c;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration 054 aborted: usernames differing only by case must be resolved manually first -> %', bad;
  END IF;
END$$;

-- 3. Backfill: fold any legacy mixed-case usernames down to lowercase.
UPDATE users            SET username = lower(btrim(username)) WHERE username IS NOT NULL AND username <> lower(btrim(username));
UPDATE player_profiles  SET username = lower(btrim(username)) WHERE username IS NOT NULL AND username <> lower(btrim(username));
UPDATE coach_profiles   SET username = lower(btrim(username)) WHERE username IS NOT NULL AND username <> lower(btrim(username));
UPDATE other_profiles   SET username = lower(btrim(username)) WHERE username IS NOT NULL AND username <> lower(btrim(username));

-- 4. The structural backstop. Also serves the equality lookups in
--    User.findByUsername, which are written as WHERE lower(username) = $1.
--    Partial (WHERE username IS NOT NULL) because users.username is nullable:
--    a bare users row exists between registration and profile creation, and
--    several legacy accounts hold the handle only on the profile row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (lower(username)) WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_player_profiles_username_lower
  ON player_profiles (lower(username)) WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_profiles_username_lower
  ON coach_profiles (lower(username)) WHERE username IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_other_profiles_username_lower
  ON other_profiles (lower(username)) WHERE username IS NOT NULL;
