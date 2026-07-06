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
const _mockSubState = new Map();
function _getMockState(subscriptionId) {
  if (!_mockSubState.has(subscriptionId)) {
    _mockSubState.set(subscriptionId, { cancel_at_period_end: false });
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
    try {
      await User.updateSubscription(userId, { subscriptionId: subId, status, tier: resolvedTier, source: 'stripe' });
      console.log(`[Stripe Mock] Auto-set subscription for user ${userId}: tier=${resolvedTier}, status=${status}`);
    } catch (e) {
      console.error(`[Stripe Mock] Failed to set subscription: ${e.message}`);
    }
  }

  console.log(`[Stripe Mock] Checkout session created: ${session.id} → redirecting to success URL`);
  return session;
}

/**
 * Mock cancel subscription.
 */
async function cancelSubscription(subscriptionId) {
  _getMockState(subscriptionId).cancel_at_period_end = true;
  console.log(`[Stripe Mock] Subscription ${subscriptionId} set to cancel at period end`);
  return {
    id: subscriptionId,
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  };
}

/**
 * Mock reactivate subscription — clears cancel_at_period_end.
 */
async function reactivateSubscription(subscriptionId) {
  _getMockState(subscriptionId).cancel_at_period_end = false;
  console.log(`[Stripe Mock] Subscription ${subscriptionId} reactivated (cancel_at_period_end cleared)`);
  return {
    id: subscriptionId,
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  };
}

/**
 * Mock get subscription. Reads cancel_at_period_end from in-memory state so
 * the cancel → reactivate flow can be tested locally without real Stripe.
 */
async function getSubscription(subscriptionId) {
  const state = _getMockState(subscriptionId);
  return {
    id: subscriptionId || mockId('sub'),
    status: 'active',
    cancel_at_period_end: state.cancel_at_period_end,
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
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
