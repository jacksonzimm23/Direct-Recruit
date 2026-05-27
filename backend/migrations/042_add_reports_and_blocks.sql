-- Migration 042: Apple Guideline 1.2 — Report Content + Block User (Fix #2a).
--
-- Adds two new tables and one column to support user-facing reporting of
-- objectionable content and two-way blocking of abusive users.
--
--   content_reports — every user-submitted report against a post, comment,
--                     message, or user. Stored with status='pending' for
--                     later admin triage (admin queue UI deferred).
--   blocked_users   — directional block edges. App treats blocks as two-way
--                     at query time (either party blocking hides both).
--                     Auto-unfollow + hide conversations is handled in the
--                     BlockedUser.create() transaction.
--   conversation_participants.hidden_at — soft-hide a conversation per user
--                     side. Set on both rows when a block is created so
--                     neither party sees the conversation in their inbox.
--                     Existing model code (Message.getUserConversations)
--                     already filters on this column.

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

-- Compound index for the "auto-hide reported content from the reporter"
-- feature in sub-plan #2b: fast `WHERE reporter=? AND content_type=? AND content_id=?`
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

-- Soft-hide column for conversations. May already exist per references in
-- Message.getUserConversations — IF NOT EXISTS makes this safe to re-run.
ALTER TABLE conversation_participants
    ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMP;
