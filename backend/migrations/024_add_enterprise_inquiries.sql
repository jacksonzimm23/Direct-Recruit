-- 024_add_enterprise_inquiries.sql
-- Adds inbound inquiry queue for "Enterprise" sales requests (full team / staff onboarding).

DO $$ BEGIN
  CREATE TYPE enterprise_inquiry_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS enterprise_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name      VARCHAR(100) NOT NULL,
  last_name       VARCHAR(100) NOT NULL,
  school          VARCHAR(255) NOT NULL,
  phone           VARCHAR(50)  NOT NULL,
  personal_email  VARCHAR(255) NOT NULL UNIQUE,
  notes           TEXT,
  status          enterprise_inquiry_status NOT NULL DEFAULT 'pending',
  rejected_reason TEXT,
  ip_address      VARCHAR(45),
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at     TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_status_created
  ON enterprise_inquiries (status, created_at DESC);
