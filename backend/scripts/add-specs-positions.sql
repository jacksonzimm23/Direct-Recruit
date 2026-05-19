-- add-specs-positions.sql
-- Local-dev twin of backend/migrations/039_add_specs_positions.sql.
-- See that file for full rationale.

ALTER TABLE recruiting_boards
  ADD COLUMN IF NOT EXISTS specs_positions JSONB NOT NULL DEFAULT '[]'::JSONB;
