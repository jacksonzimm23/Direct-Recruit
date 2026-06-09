-- add-pending-cancel-sub.sql  (local-dev twin of migrations/047_add_pending_cancel_sub.sql)
-- Verify-then-pay rework: cross-type PAID->PAID profile switch handling.
-- Stashes the OLD Stripe subscription id so the payments webhook can cancel it
-- once the NEW subscription activates (avoids stripping access if the new payment
-- is abandoned). See migrations/047 for the full rationale.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_cancel_stripe_sub_id TEXT;
