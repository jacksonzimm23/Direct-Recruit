-- add-coach-verification-school-lock.sql (local seed version of 019)
-- Adds division to both coach-verification tables plus admin-lock fields on the request row.

ALTER TABLE coach_signup_requests
  ADD COLUMN IF NOT EXISTS division        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS locked_school   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS locked_division VARCHAR(50),
  ADD COLUMN IF NOT EXISTS locked_at       TIMESTAMP;

ALTER TABLE coach_invites
  ADD COLUMN IF NOT EXISTS division VARCHAR(50);
