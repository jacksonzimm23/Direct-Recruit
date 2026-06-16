-- Add other_profiles.email and other_profiles.phone as the optional
-- "Contact Email" / "Phone" shown on the Other profile's Contact section.
-- Migration 048 (add-profile-contact-email.sql) restored these contact fields
-- for player_profiles and coach_profiles but never touched other_profiles, so
-- the Other role's Edit Profile modal silently dropped them. The model and
-- validators are updated alongside this migration. These are user-entered,
-- intentionally PUBLIC contact fields, separate from users.email (the login
-- email). Idempotent.

ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
