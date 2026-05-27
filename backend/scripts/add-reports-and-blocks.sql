-- Local-dev equivalent of backend/migrations/042_add_reports_and_blocks.sql.
-- Identical SQL; the two files diverge only in how they're applied
-- (seed-local.js runs every script in MIGRATIONS on each seed; prod uses
-- run-prod-migration.js which tracks which numbered files have been applied).

CREATE TABLE IF NOT EXISTS content_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('post', 'comment', 'message', 'profile')),
    content_id UUID,
    reason VARCHAR(30) NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'hate_speech', 'impersonation', 'other')),
    details TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
    reviewed_at TIMESTAMP,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_content_reports_reporter
    ON content_reports(reporter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_reports_status_pending
    ON content_reports(status, created_at DESC) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_content_reports_reporter_content
    ON content_reports(reporter_user_id, content_type, content_id);

CREATE TABLE IF NOT EXISTS blocked_users (
    blocker_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (blocker_id, blocked_id),
    CHECK (blocker_id != blocked_id)
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_id);

ALTER TABLE conversation_participants
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP;
