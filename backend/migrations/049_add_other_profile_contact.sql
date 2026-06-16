-- 049_add_other_profile_contact.sql
-- Add other_profiles.email and other_profiles.phone as the optional
-- "Contact Email" / "Phone" shown on the Other profile's Contact section.
--
-- Migration 048 restored these contact fields for player_profiles and
-- coach_profiles but never touched other_profiles, so the Other role's Edit
-- Profile modal collected a contact email + phone, sent them in the update
-- payload, and they were silently dropped (no column existed, and
-- OtherProfile.update() did not allowlist them). The profile page then always
-- showed "No contact information provided." after reload. This migration adds
-- the columns; the model and validators are updated alongside it.
--
-- These are user-entered, intentionally PUBLIC contact fields, separate from
-- users.email (the login email). Idempotent.

ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
