-- add-pipeline-soft-delete.sql
-- Local dev twin of backend/migrations/038_add_pipeline_soft_delete.sql.
-- See that file for full rationale.

ALTER TABLE pipeline_recruits ADD COLUMN IF NOT EXISTS removed_from_pipeline_at TIMESTAMP NULL;

DROP INDEX IF EXISTS idx_pipeline_recruits_coach_pool;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_pool
    ON pipeline_recruits(coach_user_id, pool_entry_id)
    WHERE pool_entry_id IS NOT NULL AND removed_from_pipeline_at IS NULL;

DROP INDEX IF EXISTS idx_pipeline_recruits_coach_player;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_player
    ON pipeline_recruits(coach_user_id, linked_player_user_id)
    WHERE linked_player_user_id IS NOT NULL AND pool_entry_id IS NULL AND removed_from_pipeline_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_active
    ON pipeline_recruits(coach_user_id, status)
    WHERE removed_from_pipeline_at IS NULL;
