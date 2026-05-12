-- Migration: 027_fix_player_height_type
-- Description: Convert player_profiles.height from VARCHAR to INTEGER on prod.
--              Schema drift between dev (INTEGER) and prod (VARCHAR) broke the
--              feed's UNION queries (UNION types integer and character varying
--              cannot be matched). Idempotent: no-op if already INTEGER.
--              The suggested_connections_mv (migration 026) references height,
--              so we drop+recreate it via CASCADE; the bootstrap refresh in
--              server.js repopulates the MV on next boot.

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
