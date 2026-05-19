-- 032_add_named_personal_boards.sql
-- Backfills existing nameless personal recruiting boards with the display name
-- 'My Board' so the redesigned Personal Boards UI (which lists boards by name)
-- has something to render. The 5-board cap is enforced in application code.
--
-- The board_name column already exists on recruiting_boards (it was added with
-- shared boards), so no schema change is needed. The UNIQUE(coach_user_id,
-- class_year) constraint does not block multiple personal boards per coach
-- because personal boards have coach_user_id = NULL and PG treats NULL values
-- as distinct in unique constraints.

UPDATE recruiting_boards
SET board_name = 'My Board'
WHERE is_personal = TRUE
  AND class_year = 0
  AND (board_name IS NULL OR board_name = '');
