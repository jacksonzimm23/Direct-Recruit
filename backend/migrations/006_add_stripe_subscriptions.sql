-- Add Stripe subscription columns to users table
-- Date: 2026-04-07
-- Description: Adds columns for Stripe customer/subscription tracking

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(20) DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);
