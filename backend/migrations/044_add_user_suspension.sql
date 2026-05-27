-- Migration 044: User suspension columns for content moderation (Fix #10).
--
-- Adds is_suspended (boolean flag) and audit columns so admins can suspend
-- users via the moderation queue. authMiddleware checks is_suspended on
-- every request and returns 403 with a specific message.
--
-- Distinct from is_active (which is used for the account-deletion-consent
-- flow). is_suspended is for moderation actions only.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Partial index — only the suspended rows need to be queryable for the
-- admin Suspended Users panel; default is FALSE for everyone else.
CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users(is_suspended) WHERE is_suspended = TRUE;

-- post_shares.is_deleted so admins can soft-delete shares (quote posts +
-- reposts) via the moderation queue. Mirrors the pattern on posts +
-- post_comments. Feed queries should be updated to filter out is_deleted
-- shares in a future pass — for v1, admins can flag them but the filter
-- on the read path isn't enforced (a separate fix).
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
