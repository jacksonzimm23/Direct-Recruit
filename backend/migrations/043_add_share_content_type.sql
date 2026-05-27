-- Migration 043: Extend content_reports to support reporting quote posts (shares).
--
-- Quote posts live in post_shares.id and need to be reportable on their own
-- merit — a quoter's commentary can be abusive even when the original post
-- is fine. This adds 'share' to the content_type CHECK constraint so the
-- reports API can accept content_type='share' with content_id=<post_shares.id>.
--
-- Purely additive: existing rows ('post', 'comment', 'message', 'profile')
-- all still satisfy the new constraint.

ALTER TABLE content_reports DROP CONSTRAINT IF EXISTS content_reports_content_type_check;
ALTER TABLE content_reports ADD CONSTRAINT content_reports_content_type_check
  CHECK (content_type IN ('post', 'comment', 'message', 'profile', 'share'));
