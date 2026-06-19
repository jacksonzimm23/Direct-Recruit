-- 051_add_users_dob_and_terms.sql
-- Adds account-level date of birth (age gate) and Terms of Service acceptance
-- tracking to the users table.
--
-- date_of_birth   - collected at registration so the under-13 age gate runs
--                   BEFORE an account is created (COPPA). This is the
--                   account-level age signal; player_profiles.date_of_birth
--                   still holds the player-specific DOB used elsewhere.
-- terms_accepted_at  - server-side proof the user agreed to the ToS/Privacy
-- terms_version      - which version they agreed to (the doc "Last Updated" date)
-- terms_accepted_ip  - source IP at acceptance, for dispute resolution
--
-- All columns nullable so this is safe on existing rows. The under-13 block and
-- the requirement to accept terms are enforced in validation + client, never
-- via DB constraints. Idempotent.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth     DATE,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS terms_version     VARCHAR(32),
  ADD COLUMN IF NOT EXISTS terms_accepted_ip VARCHAR(64);
