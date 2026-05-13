-- 029_add_coach_signup_request_archival.sql
-- Soft-delete column for coach_signup_requests so that when a coach deletes
-- their account or switches profile type away from collegecoach, their
-- approval row is archived (hidden from the admin dashboard) and they can
-- submit a brand-new signup request later without hitting the UNIQUE edu_email
-- constraint.

ALTER TABLE coach_signup_requests
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Replace the plain UNIQUE constraint on edu_email with a partial unique index
-- that only enforces uniqueness among non-archived rows. Existing archived rows
-- (deleted_at IS NOT NULL) no longer block fresh resubmissions.
ALTER TABLE coach_signup_requests
  DROP CONSTRAINT IF EXISTS coach_signup_requests_edu_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_signup_requests_edu_email_active
  ON coach_signup_requests (edu_email)
  WHERE deleted_at IS NULL;

-- Partial index for the admin dashboard's default "exclude archived" filter
CREATE INDEX IF NOT EXISTS idx_coach_signup_requests_deleted_at
  ON coach_signup_requests (deleted_at);
