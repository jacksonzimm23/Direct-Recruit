-- add-users-dob-and-terms.sql
-- Local dev twin of backend/migrations/051_add_users_dob_and_terms.sql.
-- Adds account-level date_of_birth (under-13 age gate) and Terms of Service
-- acceptance tracking (terms_accepted_at / terms_version / terms_accepted_ip)
-- to the users table. All columns nullable, idempotent. See the migration for
-- full rationale.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth     DATE,
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS terms_version     VARCHAR(32),
  ADD COLUMN IF NOT EXISTS terms_accepted_ip VARCHAR(64);
