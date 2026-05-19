-- 039_add_specs_positions.sql
-- Adds a Specs (Special Teams) section to the football field, alongside
-- Offense and Defense. JSONB array of {group, positions} matches the
-- offense_positions / defense_positions shape. ALTER ADD COLUMN with a
-- NOT NULL DEFAULT '[]'::jsonb backfills existing rows in place — no
-- separate UPDATE needed. Frontend renders an empty specs array as the
-- default K/P/LS slots so existing boards visually pick up the new section
-- without a data migration.

ALTER TABLE recruiting_boards
  ADD COLUMN IF NOT EXISTS specs_positions JSONB NOT NULL DEFAULT '[]'::JSONB;
