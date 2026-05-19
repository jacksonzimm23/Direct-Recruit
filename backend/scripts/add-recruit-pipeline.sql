-- add-recruit-pipeline.sql
-- Local dev twin of backend/migrations/036_add_recruit_pipeline.sql.
-- See that file for full rationale.

CREATE TABLE IF NOT EXISTS pipeline_recruits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    coach_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_key VARCHAR(255) NOT NULL,
    pool_entry_id UUID REFERENCES pool_entries(id) ON DELETE SET NULL,
    linked_player_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'active',
    grade INT,
    color_tag VARCHAR(16),
    notes TEXT,
    evaluation_chain JSONB NOT NULL DEFAULT '[]'::JSONB,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'pipeline_recruits_status_check'
    ) THEN
        ALTER TABLE pipeline_recruits
            ADD CONSTRAINT pipeline_recruits_status_check
            CHECK (status IN ('active', 'out', 'promoted'));
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'pipeline_recruits_grade_check'
    ) THEN
        ALTER TABLE pipeline_recruits
            ADD CONSTRAINT pipeline_recruits_grade_check
            CHECK (grade IS NULL OR (grade >= 0 AND grade <= 100));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_pool
    ON pipeline_recruits(coach_user_id, pool_entry_id)
    WHERE pool_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_player
    ON pipeline_recruits(coach_user_id, linked_player_user_id)
    WHERE linked_player_user_id IS NOT NULL AND pool_entry_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_status
    ON pipeline_recruits(coach_user_id, status);

CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_school_status
    ON pipeline_recruits(school_key, status);

CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_pool_entry
    ON pipeline_recruits(pool_entry_id)
    WHERE pool_entry_id IS NOT NULL;
