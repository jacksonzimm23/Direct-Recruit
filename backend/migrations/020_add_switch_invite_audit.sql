-- 020_add_switch_invite_audit.sql
-- Adds switch context to the coach verification flow + an audit trail on profile_switch_history.
-- Lets the admin dashboard distinguish brand-new signups from existing-user switches,
-- and lets the invite link router pick the right destination page (create-coach-profile vs complete-switch).

ALTER TABLE coach_signup_requests
  ADD COLUMN IF NOT EXISTS is_switch        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS existing_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE coach_invites
  ADD COLUMN IF NOT EXISTS is_switch BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE profile_switch_history
  ADD COLUMN IF NOT EXISTS invite_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS source       VARCHAR(20) DEFAULT 'switch';
