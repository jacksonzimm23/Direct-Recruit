-- Convert player_profiles.height from VARCHAR to INTEGER if needed.
-- Schema drift: prod had VARCHAR while local + code expected INTEGER, which
-- broke the feed's UNION queries (Post.getFollowingFeed / getDiscoverFeed).
-- Idempotent: no-op if already INTEGER.
-- The suggested_connections_mv references height, so we drop+recreate it
-- via CASCADE; the bootstrap refresh in server.js repopulates on next boot.

DO $$
DECLARE
  current_type text;
BEGIN
  SELECT data_type INTO current_type
  FROM information_schema.columns
  WHERE table_name = 'player_profiles' AND column_name = 'height';

  IF current_type = 'character varying' THEN
    DROP MATERIALIZED VIEW IF EXISTS suggested_connections_mv CASCADE;

    ALTER TABLE player_profiles
      ALTER COLUMN height TYPE INTEGER USING NULLIF(height, '')::INTEGER;
  END IF;
END $$;
