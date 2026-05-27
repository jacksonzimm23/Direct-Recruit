-- Local-dev counterpart of migration 043.
-- See backend/migrations/043_add_share_content_type.sql for full rationale.
-- Adds 'share' to content_reports.content_type CHECK constraint.

ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_content_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_content_type_check
  CHECK (content_type IN ('post', 'comment', 'message', 'profile', 'share'));
