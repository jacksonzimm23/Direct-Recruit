-- Re-add player_profiles.email and coach_profiles.email as the optional
-- "Contact Email" shown on profiles. These were dropped by
-- drop-vestigial-email-columns.sql (security audit #32) on the belief that no
-- code read them — but the Edit Profile modal has always offered a Contact
-- Email field, and the profile page renders profile.email when present. This
-- is a user-entered, intentionally PUBLIC contact address, separate from
-- users.email (the login email). Listed AFTER the drop in the seed MIGRATIONS
-- order, so a fresh seed nets out with the columns present. Idempotent.

ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
