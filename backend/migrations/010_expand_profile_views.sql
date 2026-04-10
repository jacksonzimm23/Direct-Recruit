-- Migration: 010_expand_profile_views
-- Date: 2026-04-10
-- Description: Expand profile_views to support ALL profile types and replace
--              UNIQUE constraint with 2-day cooldown logic

-- Rename column from player-specific to generic
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profile_views' AND column_name = 'viewed_player_id') THEN
    ALTER TABLE profile_views RENAME COLUMN viewed_player_id TO viewed_user_id;
  END IF;
END $$;

-- Drop old UNIQUE constraint (allowed only 1 view per viewer EVER)
ALTER TABLE profile_views DROP CONSTRAINT IF EXISTS profile_views_viewed_player_id_viewer_id_key;

-- Drop old index with old column name
DROP INDEX IF EXISTS idx_profile_views_viewed_player;

-- New index for the renamed column
CREATE INDEX IF NOT EXISTS idx_profile_views_viewed_user ON profile_views(viewed_user_id);

-- Composite index for the 2-day cooldown check
CREATE INDEX IF NOT EXISTS idx_profile_views_cooldown
  ON profile_views(viewed_user_id, viewer_id, created_at DESC);
