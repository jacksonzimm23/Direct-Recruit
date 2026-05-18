-- add-pipeline-handoffs.sql
-- Local dev twin of backend/migrations/037_add_pipeline_handoffs.sql.
-- See that file for full rationale.

CREATE TABLE IF NOT EXISTS pipeline_handoffs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_recruit_id UUID NOT NULL REFERENCES pipeline_recruits(id) ON DELETE CASCADE,
    from_coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_coach_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_key VARCHAR(255) NOT NULL,
    state VARCHAR(16) NOT NULL DEFAULT 'pending',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    message TEXT,
    received_recruit_id UUID REFERENCES pipeline_recruits(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acted_on_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_to_state
    ON pipeline_handoffs(to_coach_id, state);

CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_to_unread
    ON pipeline_handoffs(to_coach_id, is_read)
    WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_from_school
    ON pipeline_handoffs(from_coach_id, school_key)
    WHERE state = 'pending';

CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_source
    ON pipeline_handoffs(source_recruit_id);
