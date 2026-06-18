-- add-profile-contact-fields.sql (local-dev twin of migrations/050_add_profile_contact_fields.sql)
-- Adds recruiting contact fields used to enrich the college-coach recruiting
-- board CSV export (for import into ARMS/Teamworks).
--
-- DATE OF BIRTH is added to coach_profiles and other_profiles (player_profiles
-- already has date_of_birth). DOB is collected on ALL profile types for App
-- Store age-rating compliance.
--
-- The remaining fields are collected on HS players + transfer players only
-- (enforced in the app layer / client), but the columns live on the shared
-- player_profiles table:
--   gender            - 'Male' | 'Female' (app-layer allowlist, no DB CHECK)
--   address           - street line of mailing address (city/state already exist)
--   zip               - mailing zip (distinct from the AI-fit home_zip VARCHAR(5))
--   coach_name/email/phone - role-neutral coach contact; the UI labels it
--                            "HS Coach" (hsplayer) or "Previous Coach" (transferplayer)
--   parent_guardians  - JSONB array of up to 4 {name,email,phone} objects
--                       (mirrors the existing fit_preferences JSONB pattern)
--
-- All columns nullable (JSONB is NOT NULL DEFAULT '[]') so this is safe on
-- existing rows. Mandatoriness is enforced in validation + client, never via DB
-- NOT NULL. Idempotent.

ALTER TABLE player_profiles
  ADD COLUMN IF NOT EXISTS gender           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS address          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS zip              VARCHAR(10),
  ADD COLUMN IF NOT EXISTS coach_name       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS coach_email      VARCHAR(255),
  ADD COLUMN IF NOT EXISTS coach_phone      VARCHAR(20),
  ADD COLUMN IF NOT EXISTS parent_guardians JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE coach_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE other_profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;
