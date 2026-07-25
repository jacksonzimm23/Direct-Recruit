/**
 * Local development mock for Stripe.
 * Returns mock data for all Stripe operations — no real charges, no API calls.
 * Production is NOT affected — this file is only loaded when NODE_ENV !== 'production'.
 */

const crypto = require('crypto');
const User = require('../../models/User');

function mockId(prefix) {
  return `${prefix}_mock_${crypto.randomBytes(8).toString('hex')}`;
}

// Map profile types to tier values (same as payments.js TIER_MAP)
const MOCK_TIER_MAP = {
  hsplayer: 'player',
  transferplayer: 'player',
  collegecoach_starter: 'starter',
  collegecoach_pro: 'pro',
  collegecoach_elite: 'elite'
};

// In-memory state for the mock so cancel → getSubscription → reactivate
// reflects an actual lifecycle in local dev. Server restart resets it.
// `status` and `trial` are tracked so getSubscription() reports the real
// lifecycle (a player trial reads 'trialing' with a 7-day period end), keeping
// local dev faithful to production instead of always returning 'active'/30d.
const _mockSubState = new Map();
function _getMockState(subscriptionId) {
  if (!_mockSubState.has(subscriptionId)) {
    _mockSubState.set(subscriptionId, { cancel_at_period_end: false, status: 'active', trial: false });
  }
  return _mockSubState.get(subscriptionId);
}

/**
 * Create a mock Stripe customer.
 */
async function createCustomer(email, userId) {
  const customer = {
    id: mockId('cus'),
    email,
    metadata: { userId }
  };
  console.log(`[Stripe Mock] Customer created: ${customer.id} for ${email}`);
  return customer;
}

/**
 * Create a mock Checkout session.
 * In local dev, returns the successUrl directly so the frontend auto-redirects
 * as if payment succeeded.
 */
async function createCheckoutSession({ customerId, priceId, userId, profileType, tier, context, successUrl, cancelUrl, trialDays }) {
  const sessionId = mockId('cs');
  const subId = mockId('sub');

  // Local dev runs the ENTIRE payment flow up to the Stripe API boundary and stops
  // here. Dump the exact payload that would have been sent so the real request is
  // inspectable without a Stripe account or network call. Everything below this
  // line is the mock standing in for Stripe + its checkout.session.completed webhook.
  console.log('[Stripe Mock] ---- would POST stripe.checkout.sessions.create ----');
  console.log('[Stripe Mock]   customer          : ' + customerId);
  console.log('[Stripe Mock]   line_items[0].price: ' + priceId);
  console.log('[Stripe Mock]   trial_period_days : ' + (trialDays > 0 ? trialDays : '(none)'));
  console.log('[Stripe Mock]   metadata          : ' + JSON.stringify({ userId, profileType, context }));
  console.log('[Stripe Mock]   subscription tier : ' + (tier || '(defaulted to player)'));
  console.log('[Stripe Mock]   success_url       : ' + successUrl);
  console.log('[Stripe Mock]   cancel_url        : ' + cancelUrl);
  console.log('[Stripe Mock] ---- STOP: no network call made ----');
  const session = {
    id: sessionId,
    url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id=${sessionId}`,
    customer: customerId,
    subscription: subId,
    metadata: { userId, profileType, context }
  };

  // Auto-activate subscription in local dev (simulates webhook checkout.session.completed).
  // Player checkouts with a trial land 'trialing' (mirrors real Stripe), so local dev
  // exercises the 'trialing' paywall/gate/settings paths. Coach checkouts stay 'active'.
  if (userId) {
    const resolvedTier = tier || 'player';
    const isPlayerTrial = trialDays && trialDays > 0
      && (profileType === 'hsplayer' || profileType === 'transferplayer');
    const status = isPlayerTrial ? 'trialing' : 'active';
    // Record status + trial on the mock sub so getSubscription() reports the real
    // lifecycle (trialing sub → 'trialing' status + 7-day period, matching prod).
    const state = _getMockState(subId);
    state.status = status;
    state.trial = !!isPlayerTrial;
    try {
      await User.updateSubscription(userId, { subscriptionId: subId, status, tier: resolvedTier, source: 'stripe' });
      // The mock stands in for the checkout.session.completed webhook, which is
      // where the real rail burns the one-per-user free trial. Mirror it here or
      // trial-farming would look "fixed" in prod but still be reproducible locally.
      if (status === 'trialing') {
        await User.markTrialUsed(userId);
        console.log(`[Stripe Mock] Free trial consumed by user ${userId} — future checkouts bill immediately`);
      }
      console.log(`[Stripe Mock] Auto-set subscription for user ${userId}: tier=${resolvedTier}, status=${status}`);
    } catch (e) {
      console.error(`[Stripe Mock] Failed to set subscription: ${e.message}`);
    }
  }

  console.log(`[Stripe Mock] Checkout session created: ${session.id} → redirecting to success URL`);
  return session;
}

/**
 * Mock cancel subscription. Preserves the sub's status (a trialing sub stays
 * 'trialing' — Stripe only flips it at trial end), so cancelling a trial locally
 * behaves like prod: access continues, cancel_at_period_end set, no charge.
 */
async function cancelSubscription(subscriptionId) {
  const state = _getMockState(subscriptionId);
  state.cancel_at_period_end = true;
  console.log(`[Stripe Mock] Subscription ${subscriptionId} set to cancel at period end`);
  return {
    id: subscriptionId,
    status: state.status || 'active',
    cancel_at_period_end: true,
    current_period_end: Math.floor(Date.now() / 1000) + (state.trial ? 7 : 30) * 24 * 60 * 60
  };
}

/**
 * Mock reactivate subscription — clears cancel_at_period_end.
 */
async function reactivateSubscription(subscriptionId) {
  const state = _getMockState(subscriptionId);
  state.cancel_at_period_end = false;
  console.log(`[Stripe Mock] Subscription ${subscriptionId} reactivated (cancel_at_period_end cleared)`);
  return {
    id: subscriptionId,
    status: state.status || 'active',
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + (state.trial ? 7 : 30) * 24 * 60 * 60
  };
}

/**
 * Mock get subscription. Reads status + cancel_at_period_end from in-memory
 * state so the trialing / cancel / reactivate flows can be tested locally
 * without real Stripe. A player trial reports status 'trialing' with a 7-day
 * period end (the day-7 first-charge date), mirroring production.
 */
async function getSubscription(subscriptionId) {
  const state = _getMockState(subscriptionId);
  const periodSeconds = state.trial ? 7 * 24 * 60 * 60 : 30 * 24 * 60 * 60;
  return {
    id: subscriptionId || mockId('sub'),
    status: state.status || 'active',
    cancel_at_period_end: state.cancel_at_period_end,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + periodSeconds,
    items: {
      data: [{ price: { id: 'price_mock', unit_amount: 1000 } }]
    }
  };
}

/**
 * Mock webhook event construction.
 * In local dev, just parses the raw body as JSON — no signature verification.
 */
function constructWebhookEvent(rawBody, signature) {
  return JSON.parse(rawBody);
}

module.exports = {
  createCustomer,
  createCheckoutSession,
  cancelSubscription,
  reactivateSubscription,
  getSubscription,
  constructWebhookEvent
};
