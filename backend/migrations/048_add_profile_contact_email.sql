-- 048_add_profile_contact_email.sql
-- Re-add player_profiles.email and coach_profiles.email as the optional
-- "Contact Email" shown on profiles.
--
-- These columns were dropped by 015/drop-vestigial-email-columns (security
-- audit #32) on the belief that no code read them — but the Edit Profile
-- modal has always offered a Contact Email field, and the profile page
-- renders profile.email when present. The field silently never saved because
-- (a) the column was gone and (b) PlayerProfile/CoachProfile.update() did not
-- allowlist 'email'. Both are fixed together: this migration restores the
-- columns, and the models/validators now accept the field.
--
-- This is a user-entered, intentionally PUBLIC contact address, separate from
-- users.email (the login email). Idempotent.

ALTER TABLE player_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
