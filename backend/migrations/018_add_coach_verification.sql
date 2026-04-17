-- 018_add_coach_verification.sql
-- Adds invite-based signup gate for College Coach profiles.

DO $$ BEGIN
  CREATE TYPE coach_request_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS coach_signup_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  school          VARCHAR(255) NOT NULL,
  position        VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  edu_email       VARCHAR(255) NOT NULL UNIQUE,
  personal_email  VARCHAR(255) NOT NULL,
  notes           TEXT,
  status          coach_request_status NOT NULL DEFAULT 'pending',
  rejected_reason TEXT,
  ip_address      VARCHAR(45),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coach_signup_requests_status_created
  ON coach_signup_requests (status, created_at DESC);

CREATE TABLE IF NOT EXISTS coach_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES coach_signup_requests(id) ON DELETE CASCADE,
  token      VARCHAR(64) NOT NULL UNIQUE,
  edu_email  VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name  VARCHAR(100) NOT NULL,
  school     VARCHAR(255) NOT NULL,
  position   VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  used_at    TIMESTAMP,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_coach_invites_token ON coach_invites (token);
CREATE INDEX IF NOT EXISTS idx_coach_invites_active
  ON coach_invites (used_at, revoked_at, expires_at);
