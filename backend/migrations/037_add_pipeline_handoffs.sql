-- 037_add_pipeline_handoffs.sql
-- Per-school hand-off rows (Plan 5A in pipeline.md).
-- Each row is one pending hand-off from a sender coach to a recipient coach
-- at the same school. The recipient's accept/reject deletes the row; same
-- lifecycle as Group Invites. school_key snapshots the sender's normalized
-- team_name at send time so the Out view (sender's perspective) and the
-- recipient auto-cancel hook (CoachProfile.update / settings.switch-profile)
-- can both gate on the snapshot vs. the coach's current school.
--
-- state values: 'pending' is the only one that actually appears in storage
-- since rows are deleted on accept/reject. Column kept for the in-transaction
-- window and for a possible future soft-delete migration. No CHECK constraint
-- so the column can carry transient values during the brief update-then-
-- delete window in accept/reject without violating it.

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

-- In view query: WHERE to_coach_id = $me AND state = 'pending' AND school_key = $myCurrentSchool
CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_to_state
    ON pipeline_handoffs(to_coach_id, state);

-- Unread count query: WHERE to_coach_id = $me AND state = 'pending' AND school_key = $myCurrentSchool AND is_read = FALSE
CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_to_unread
    ON pipeline_handoffs(to_coach_id, is_read)
    WHERE state = 'pending';

-- Out view query: WHERE from_coach_id = $me AND state = 'pending' AND school_key = $myCurrentSchool
CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_from_school
    ON pipeline_handoffs(from_coach_id, school_key)
    WHERE state = 'pending';

-- Cascade lookups + flip-back-status scan: WHERE source_recruit_id = $1 AND state = 'pending'
CREATE INDEX IF NOT EXISTS idx_pipeline_handoffs_source
    ON pipeline_handoffs(source_recruit_id);
