/**
 * Local development mock for Stripe.
 * Returns mock data for all Stripe operations — no real charges, no API calls.
 * Production is NOT affected — this file is only loaded when NODE_ENV !== 'production'.
 */

const crypto = require('crypto');

function mockId(prefix) {
  return `${prefix}_mock_${crypto.randomBytes(8).toString('hex')}`;
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
async function createCheckoutSession({ customerId, priceId, userId, profileType, context, successUrl, cancelUrl }) {
  const sessionId = mockId('cs');
  const session = {
    id: sessionId,
    url: `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id=${sessionId}`,
    customer: customerId,
    subscription: mockId('sub'),
    metadata: { userId, profileType, context }
  };
  console.log(`[Stripe Mock] Checkout session created: ${session.id} → redirecting to success URL`);
  return session;
}

/**
 * Mock cancel subscription.
 */
async function cancelSubscription(subscriptionId) {
  console.log(`[Stripe Mock] Subscription ${subscriptionId} set to cancel at period end`);
  return {
    id: subscriptionId,
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
  };
}

/**
 * Mock get subscription.
 */
async function getSubscription(subscriptionId) {
  return {
    id: subscriptionId || mockId('sub'),
    status: 'active',
    cancel_at_period_end: false,
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
  getSubscription,
  constructWebhookEvent
};
