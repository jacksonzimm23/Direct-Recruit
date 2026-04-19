-- Phase 3a: track which payment processor owns each subscription.
-- Values: 'stripe' (web), 'apple_iap' (iOS via RevenueCat), NULL (no sub yet).
-- Needed so Phase 3c UI can show correct "Manage Subscription" affordances
-- (web users cancel via our UI; iOS users redirect to Apple Subscriptions).

ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_source VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_users_subscription_source
ON users(subscription_source);

-- Backfill: existing paid accounts are all Stripe (no iOS yet).
UPDATE users
SET subscription_source = 'stripe'
WHERE stripe_subscription_id IS NOT NULL
  AND subscription_source IS NULL;
