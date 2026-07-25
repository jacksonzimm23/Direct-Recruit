-- 053_add_trial_used.sql
-- Records when a user consumed their one-and-only free trial of the AI Rep
-- add-on ($10/mo, hsplayer + transferplayer).
--
-- Why: Stripe applies `trial_period_days` to EVERY subscription created for a
-- customer — it has no built-in once-per-customer trial. Without this column a
-- player could start a trial, cancel on day 6, resubscribe, and get another free
-- 7 days, indefinitely, never paying.
--
-- NULL  = never used a trial (eligible)
-- set   = trial already consumed (subsequent checkouts bill immediately)
--
-- Deliberately per-USER, not per-subscription or per-profile-type: hsplayer and
-- transferplayer share one product, so switching between them must not hand out
-- a second trial. It also spans both billing rails — an Apple trial marks the
-- user ineligible for a Stripe trial and vice versa. (Apple separately enforces
-- intro-offer eligibility per Apple ID, so the IAP rail is doubly covered.)

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used_at TIMESTAMP;

-- Backfill: anyone holding a live player-tier subscription has, by definition,
-- already started their trial. Marks them ineligible for a second one if they
-- later cancel and come back. Coaches are unaffected (they never get a trial).
UPDATE users
   SET trial_used_at = NOW()
 WHERE trial_used_at IS NULL
   AND subscription_tier = 'player'
   AND subscription_status IN ('active', 'trialing', 'past_due');
