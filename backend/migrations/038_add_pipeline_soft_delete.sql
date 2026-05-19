-- 038_add_pipeline_soft_delete.sql
-- Soft-delete for pipeline_recruits so a coach removing a recruit doesn't wipe
-- their grade history. The row stays in the table with removed_from_pipeline_at
-- set; live reads filter it out, but cross-coach evaluation listings
-- (PipelineRecruit.getEvaluationsAtSchool) intentionally include it so a coach
-- a year later can still see "Coach Smith graded this kid 78 / yellow last May".
--
-- The partial UNIQUE indexes are recreated with an additional
--   AND removed_from_pipeline_at IS NULL
-- predicate so the same (coach_user_id, pool_entry_id) pair can coexist as one
-- soft-deleted row plus one fresh re-added row. Each re-add starts ungraded;
-- the old soft-deleted row keeps its original grade + date in history.
--
-- Cascade note: pipeline_handoffs.source_recruit_id REFERENCES pipeline_recruits(id)
-- ON DELETE CASCADE — that clause is now dead under soft-delete (no rows physically
-- delete), but harmless. PipelineHandoff.create() now also filters soft-deleted
-- source rows so coaches can't send a hand-off off a tombstoned row.

ALTER TABLE pipeline_recruits ADD COLUMN IF NOT EXISTS removed_from_pipeline_at TIMESTAMP NULL;

-- Drop + recreate the partial UNIQUE indexes with the new predicate.
DROP INDEX IF EXISTS idx_pipeline_recruits_coach_pool;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_pool
    ON pipeline_recruits(coach_user_id, pool_entry_id)
    WHERE pool_entry_id IS NOT NULL AND removed_from_pipeline_at IS NULL;

DROP INDEX IF EXISTS idx_pipeline_recruits_coach_player;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_player
    ON pipeline_recruits(coach_user_id, linked_player_user_id)
    WHERE linked_player_user_id IS NOT NULL AND pool_entry_id IS NULL AND removed_from_pipeline_at IS NULL;

-- Covering index for getPipelineForCoach (hot path: a coach's active pipeline list).
CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_active
    ON pipeline_recruits(coach_user_id, status)
    WHERE removed_from_pipeline_at IS NULL;
