-- 031_add_pff_grade.sql
-- Adds PFF Grade to player_profiles for collegeplayer + transferplayer.
-- 0.0 – 100.0 with 1 decimal place. NULL = no grade reported (NOT zero).
-- hsplayer and other roles never set this column.
ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS pff_grade NUMERIC(4,1);
