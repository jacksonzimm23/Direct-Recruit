-- add-coach-signup-request-archival.sql
-- Local-dev counterpart of backend/migrations/029_add_coach_signup_request_archival.sql

ALTER TABLE coach_signup_requests
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

ALTER TABLE coach_signup_requests
  DROP CONSTRAINT IF EXISTS coach_signup_requests_edu_email_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coach_signup_requests_edu_email_active
  ON coach_signup_requests (edu_email)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_coach_signup_requests_deleted_at
  ON coach_signup_requests (deleted_at);
