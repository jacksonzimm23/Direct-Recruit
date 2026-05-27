-- Local-dev counterpart of migration 044.
-- See backend/migrations/044_add_user_suspension.sql for full rationale.
-- Adds is_suspended + audit columns to users for the moderation queue.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON users(is_suspended) WHERE is_suspended = TRUE;

ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE post_shares ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
