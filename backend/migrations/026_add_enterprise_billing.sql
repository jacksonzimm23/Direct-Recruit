-- 026_add_enterprise_billing.sql
-- Schema for the enterprise billing feature:
--   * enterprises        (one row per paid org)
--   * enterprise_seats   (one row per claimed or pending seat)
--   * enterprise_invites (unified: admin-activation + seat-holder tokens)
-- Plus FK columns on users and enterprise_inquiries.

-- ============================================================
-- 1. ENUMS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE enterprise_seat_type AS ENUM ('hsplayer', 'collegecoach');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 2. enterprises
-- ============================================================
CREATE TABLE IF NOT EXISTS enterprises (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_name                  VARCHAR(255) NOT NULL,
  billing_email             VARCHAR(255) NOT NULL,
  admin_user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_customer_id        VARCHAR(255),
  stripe_subscription_id    VARCHAR(255),
  stripe_invoice_id         VARCHAR(255),
  subscription_status       VARCHAR(20) NOT NULL DEFAULT 'none',
  player_seats_paid         INTEGER NOT NULL DEFAULT 0 CHECK (player_seats_paid >= 0),
  coach_seats_paid          INTEGER NOT NULL DEFAULT 0 CHECK (coach_seats_paid  >= 0),
  monthly_price_per_player  DECIMAL(10,2),
  monthly_price_per_coach   DECIMAL(10,2),
  prorate_on_seat_change    BOOLEAN NOT NULL DEFAULT true,
  notes                     TEXT,
  created_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at              TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_enterprises_admin_user_id_unique
  ON enterprises (admin_user_id) WHERE admin_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enterprises_stripe_customer
  ON enterprises (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_enterprises_stripe_subscription
  ON enterprises (stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_enterprises_subscription_status
  ON enterprises (subscription_status);

-- ============================================================
-- 3. enterprise_seats
-- ============================================================
CREATE TABLE IF NOT EXISTS enterprise_seats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enterprise_id  UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  seat_type      enterprise_seat_type NOT NULL,
  invited_email  VARCHAR(255) NOT NULL,
  claimed_at     TIMESTAMP,
  revoked_at     TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Strict: one active seat per user per enterprise.
CREATE UNIQUE INDEX IF NOT EXISTS idx_enterprise_seats_active_user_unique
  ON enterprise_seats (enterprise_id, user_id)
  WHERE user_id IS NOT NULL AND revoked_at IS NULL;

-- Hot path: count active seats by type per enterprise (for getSeatUsage + canAddSeat).
CREATE INDEX IF NOT EXISTS idx_enterprise_seats_active_by_type
  ON enterprise_seats (enterprise_id, seat_type)
  WHERE revoked_at IS NULL;

-- Lookup seats by user_id (paywall + /auth/me fallback).
CREATE INDEX IF NOT EXISTS idx_enterprise_seats_user_id
  ON enterprise_seats (user_id) WHERE user_id IS NOT NULL;

-- ============================================================
-- 4. enterprise_invites (unified: admin + seat-holder via role discriminator)
-- ============================================================
CREATE TABLE IF NOT EXISTS enterprise_invites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enterprise_id  UUID NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  seat_id        UUID REFERENCES enterprise_seats(id) ON DELETE CASCADE,
  role           VARCHAR(20) NOT NULL CHECK (role IN ('enterprise_admin', 'seat_holder')),
  seat_type      enterprise_seat_type,
  token          VARCHAR(64) NOT NULL UNIQUE,
  invited_email  VARCHAR(255) NOT NULL,
  expires_at     TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
  used_at        TIMESTAMP,
  revoked_at     TIMESTAMP,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (role = 'enterprise_admin' AND seat_id IS NULL AND seat_type IS NULL)
    OR
    (role = 'seat_holder' AND seat_id IS NOT NULL AND seat_type IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_enterprise_invites_token
  ON enterprise_invites (token);
CREATE INDEX IF NOT EXISTS idx_enterprise_invites_active
  ON enterprise_invites (enterprise_id, used_at, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_enterprise_invites_email
  ON enterprise_invites (invited_email) WHERE used_at IS NULL AND revoked_at IS NULL;

-- ============================================================
-- 5. users: add FK columns
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS enterprise_id UUID
  REFERENCES enterprises(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS enterprise_seat_id UUID
  REFERENCES enterprise_seats(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_enterprise_id
  ON users (enterprise_id) WHERE enterprise_id IS NOT NULL;

-- ============================================================
-- 6. enterprise_inquiries: link forward to created enterprise + optional seat counts
-- ============================================================
ALTER TABLE enterprise_inquiries
  ADD COLUMN IF NOT EXISTS enterprise_id UUID REFERENCES enterprises(id) ON DELETE SET NULL;
ALTER TABLE enterprise_inquiries
  ADD COLUMN IF NOT EXISTS seats_requested_players INTEGER;
ALTER TABLE enterprise_inquiries
  ADD COLUMN IF NOT EXISTS seats_requested_coaches INTEGER;

CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_enterprise_id
  ON enterprise_inquiries (enterprise_id) WHERE enterprise_id IS NOT NULL;
