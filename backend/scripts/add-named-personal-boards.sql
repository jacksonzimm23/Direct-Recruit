-- add-named-personal-boards.sql
-- Allows a coach to have up to 5 named personal recruiting boards instead of one.
-- Backfills any existing nameless personal-board row with the name 'My Board'.
--
-- Schema notes (verified against local 2026-05-15):
--   - The UNIQUE(coach_user_id, class_year) constraint does NOT block multiple
--     personal boards per coach because personal boards have coach_user_id = NULL
--     (PG treats NULL as distinct in UNIQUE constraints).
--   - board_name column already exists (used by shared boards), so no DDL needed.
--   - No personal rows with class_year > 0 exist, so no per-class-year row
--     consolidation is required.
--
-- This migration is intentionally minimal: just a backfill so the existing
-- single personal board has a display name when the new UI loads it.

UPDATE recruiting_boards
SET board_name = 'My Board'
WHERE is_personal = TRUE
  AND class_year = 0
  AND (board_name IS NULL OR board_name = '');
