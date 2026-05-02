-- Migration: 025_drop_vestigial_email_columns
-- Date: 2026-05-02
-- Description: Drop player_profiles.email and coach_profiles.email — vestigial
--              duplicates of users.email from an earlier schema. No code reads
--              them; pp.* / cp.* SELECTs were silently leaking the column to
--              non-owner clients (see security audit #32 — handled defensively
--              at the response layer via `delete profile.email`, but dropping
--              the columns removes the leak surface entirely).

ALTER TABLE player_profiles DROP COLUMN IF EXISTS email;
ALTER TABLE coach_profiles DROP COLUMN IF EXISTS email;
