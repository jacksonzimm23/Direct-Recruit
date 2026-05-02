-- Drop player_profiles.email and coach_profiles.email — vestigial duplicates
-- of users.email from an earlier schema. No code reads them. Idempotent so
-- the seed system can re-run on every `npm run seed`. (Security audit #32.)

ALTER TABLE player_profiles DROP COLUMN IF EXISTS email;
ALTER TABLE coach_profiles DROP COLUMN IF EXISTS email;
