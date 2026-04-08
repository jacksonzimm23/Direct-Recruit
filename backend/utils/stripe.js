// Use local mock unless a real Stripe key is present.
// This lets you test real Stripe checkout in development without switching NODE_ENV
// (which would break CORS, Redis, Cognito, etc.).
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
async function createCheckoutSession({ customerId, priceId, userId, profileType, context, successUrl, cancelUrl }) {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, profileType, context },
    subscription_data: {
      metadata: { userId, profileType }
    }
  });
  logger.info(`Checkout session created: ${session.id} for user ${userId}`);
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
  getSubscription,
  constructWebhookEvent
};
