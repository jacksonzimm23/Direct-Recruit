-- 036_add_recruit_pipeline.sql
-- Per-coach recruiting pipeline table (Plan 4 in pipeline.md).
-- Each row is one recruit a coach is currently evaluating. Sourced either from
-- a team-pool questionnaire submission (pool_entry_id) or directly from a DR
-- player profile (linked_player_user_id). Both paths capture school_key from
-- the coach's normalized team_name at add-time so cross-school protection and
-- the cross-coach pool checkmark query (recruiting-board.js /my-pool) work
-- without re-resolving the coach's school every time.
--
-- status values: 'active' (default), 'out' (Plan 5 hand-off pending),
-- 'promoted' (Plan 6 promote-to-board). NO 'rejected' value — remove from
-- pipeline is a hard DELETE.
--
-- color_tag allowlist (enforced in PipelineRecruit.js, NOT in the schema so
-- we can adjust the palette without a migration): dark_green, light_green,
-- yellow, orange, red, dark_red.

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

-- status CHECK constraint (separate so re-runs are idempotent without
-- conflicting with an existing differently-named constraint).
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

-- grade range CHECK.
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

-- Same pool entry can't appear twice in one coach's pipeline.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_pool
    ON pipeline_recruits(coach_user_id, pool_entry_id)
    WHERE pool_entry_id IS NOT NULL;

-- Same DR player added twice from profile (no pool linkage) is blocked.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_player
    ON pipeline_recruits(coach_user_id, linked_player_user_id)
    WHERE linked_player_user_id IS NOT NULL AND pool_entry_id IS NULL;

-- Hot index: list a coach's pipeline by status (default 'active').
CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_coach_status
    ON pipeline_recruits(coach_user_id, status);

-- Cross-coach checkmark query (per-school) + Plan 5 hand-off recipient lookups.
CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_school_status
    ON pipeline_recruits(school_key, status);

-- Pool-side checkmark join: WHERE pool_entry_id = pe.id.
CREATE INDEX IF NOT EXISTS idx_pipeline_recruits_pool_entry
    ON pipeline_recruits(pool_entry_id)
    WHERE pool_entry_id IS NOT NULL;
