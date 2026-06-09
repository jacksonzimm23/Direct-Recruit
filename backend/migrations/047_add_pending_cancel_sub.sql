-- 047_add_pending_cancel_sub.sql
-- Verify-then-pay rework: cross-type PAID->PAID profile switch handling.
--
-- When a user switches between two DIFFERENT paid products (e.g. hsplayer $10 ->
-- collegecoach $20+), we no longer cancel their old Stripe subscription at switch
-- time (that stripped access if they abandoned the new payment). Instead we:
--   1. set subscription_status='none' so the paywall makes them pay for the NEW product,
--   2. stash the OLD Stripe subscription id here, and
--   3. cancel that old sub from the payments webhook once the NEW subscription activates.
-- If they abandon the new payment, the old Stripe sub is still alive (no money lost)
-- and this column lets a sweep / support reconcile it.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pending_cancel_stripe_sub_id TEXT;
