// Use local mock unless a real Stripe key is present.
// This lets you test real Stripe checkout in development without switching NODE_ENV
// (which would break CORS, Redis, Cognito, etc.).
// In production, a missing or malformed key MUST crash startup — silently falling
// back to the mock would auto-approve payments and leak revenue.
if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY?.startsWith('sk_')) {
  throw new Error('FATAL: STRIPE_SECRET_KEY is required in production');
}
const hasRealStripeKey = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_');
if (!hasRealStripeKey) { module.exports = require('./local/stripe-local'); return; }

const logger = require('./logger');
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a Stripe customer for a user.
 */
async function createCustomer(email, userId) {
  const customer = await stripe.customers.create({
    email,
    metadata: { userId }
  });
  logger.info(`Stripe customer created: ${customer.id} for user ${userId}`);
  return customer;
}

/**
 * Create a Stripe Checkout session for a subscription.
 */
async function createCheckoutSession({ customerId, priceId, userId, profileType, context, successUrl, cancelUrl, trialDays }) {
  const subscription_data = { metadata: { userId, profileType } };
  // Free-trial support: only when the caller passes a positive trialDays (players
  // get 7; coaches get 0/undefined, so a coach subscription is charged immediately).
  if (trialDays && trialDays > 0) {
    subscription_data.trial_period_days = trialDays;
  }
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, profileType, context },
    subscription_data
  });
  logger.info(`Checkout session created: ${session.id} for user ${userId}${trialDays > 0 ? ` (trial ${trialDays}d)` : ''}`);
  return session;
}

/**
 * Cancel a Stripe subscription at end of billing period.
 */
async function cancelSubscription(subscriptionId) {
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true
  });
  logger.info(`Subscription ${subscriptionId} set to cancel at period end`);
  return subscription;
}

/**
 * Reactivate a Stripe subscription that's pending cancellation
 * (cancel_at_period_end was set to true). No new charge is created — Stripe
 * just unschedules the cancellation, and the next billing date stays put.
 */
async function reactivateSubscription(subscriptionId) {
  const subscription = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false
  });
  logger.info(`Subscription ${subscriptionId} reactivated (cancel_at_period_end cleared)`);
  return subscription;
}

/**
 * Retrieve a Stripe subscription.
 */
async function getSubscription(subscriptionId) {
  return await stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * Verify and construct a Stripe webhook event from raw body + signature.
 */
function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );
}

module.exports = {
  createCustomer,
  createCheckoutSession,
  cancelSubscription,
  reactivateSubscription,
  getSubscription,
  constructWebhookEvent
};
