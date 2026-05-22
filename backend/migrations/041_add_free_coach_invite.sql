-- Migration 041: FREE comp-access flag for coach invites.
--
-- Adds a per-invite boolean so the admin can approve a coach with
-- complimentary access (no Stripe Checkout). The flag rides with the
-- token through the email + create-profile flow, and at profile-create
-- time the createCoachProfile handler writes subscription_status='comp'
-- + subscription_tier='starter' + subscription_source='comp' to the
-- users row directly. No Stripe customer is created. Comp coaches stay
-- visible in `WHERE subscription_source='comp'` for later conversion.

ALTER TABLE coach_invites ADD COLUMN IF NOT EXISTS is_free BOOLEAN DEFAULT false;
