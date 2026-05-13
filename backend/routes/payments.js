const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware, UUID_REGEX } = require('../middleware/auth');
const stripe = require('../utils/stripe');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');

// Map profile types to their Stripe Price IDs
const PRICE_MAP = {
  hsplayer: process.env.STRIPE_PLAYER_PRICE_ID,
  transferplayer: process.env.STRIPE_PLAYER_PRICE_ID,
  collegecoach_starter: process.env.STRIPE_COACH_STARTER_PRICE_ID,
  collegecoach_pro: process.env.STRIPE_COACH_PRO_PRICE_ID,
  collegecoach_elite: process.env.STRIPE_COACH_ELITE_PRICE_ID
};

// Map profile types to their subscription tier value
const TIER_MAP = {
  hsplayer: 'player',
  transferplayer: 'player',
  collegecoach_starter: 'starter',
  collegecoach_pro: 'pro',
  collegecoach_elite: 'elite'
};

// Allowed origins for Stripe redirect URLs (security audit #8).
// Anything outside this list falls back to a hardcoded directrecruit.net URL.
// Localhost is dev-only — strips the open-redirect vector in production
// while keeping the local Live Server (5500) + backend-served (5000) flows working.
const ALLOWED_ORIGINS = ['https://directrecruit.net', 'https://www.directrecruit.net'];
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:5000', 'http://localhost:5500');
}

function validateRedirectUrl(url, fallback) {
  if (!url) return fallback;
  try {
    const parsed = new URL(url);
    if (ALLOWED_ORIGINS.includes(parsed.origin)) return url;
  } catch (e) {
    // malformed URL — fall through to fallback
  }
  return fallback;
}

// ─── Create Checkout Session ─────────────────────────────────────────────────
// POST /api/payments/create-checkout-session
router.post('/create-checkout-session', authMiddleware, async (req, res) => {
  try {
    const { profileType, tier, context, successUrl, cancelUrl } = req.body;

    // Validate profile type is paid
    if (!User.PAID_TYPES.includes(profileType)) {
      return res.status(400).json({ error: 'This profile type does not require a subscription' });
    }

    // Build the price key
    let priceKey;
    if (profileType === 'collegecoach') {
      if (!tier || !['starter', 'pro', 'elite'].includes(tier)) {
        return res.status(400).json({ error: 'College coaches must select a tier: starter, pro, or elite' });
      }
      priceKey = `collegecoach_${tier}`;
    } else {
      priceKey = profileType;
    }

    const priceId = PRICE_MAP[priceKey];
    if (!priceId) {
      logger.error(`No Stripe Price ID configured for ${priceKey}`);
      return res.status(500).json({ error: 'Payment configuration error' });
    }

    // Get user
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create or retrieve Stripe customer
    let customerId = await User.getStripeCustomerId(req.userId);
    if (!customerId) {
      const customer = await stripe.createCustomer(user.email, req.userId);
      customerId = customer.id;
      await User.updateStripeCustomerId(req.userId, customerId);
    }

    // Create checkout session
    const resolvedTier = TIER_MAP[profileType === 'collegecoach' ? `collegecoach_${tier}` : profileType];
    const session = await stripe.createCheckoutSession({
      customerId,
      priceId,
      userId: req.userId,
      profileType,
      tier: resolvedTier,
      context: context || 'signup',
      successUrl: validateRedirectUrl(successUrl, 'https://directrecruit.net/frontend/shared/payment-success.html?session_id={CHECKOUT_SESSION_ID}'),
      cancelUrl: validateRedirectUrl(cancelUrl, 'https://directrecruit.net/frontend/landingpage/pricing.html')
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    logger.error('Create checkout session error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ─── Subscription Status ─────────────────────────────────────────────────────
// GET /api/payments/subscription-status
router.get('/subscription-status', authMiddleware, async (req, res) => {
  try {
    const info = await User.getSubscriptionInfo(req.userId);
    if (!info) {
      return res.status(404).json({ error: 'User not found' });
    }

    const response = {
      status: info.subscription_status || 'none',
      tier: info.subscription_tier || null,
      source: info.subscription_source || null,
      stripeCustomerId: info.stripe_customer_id || null
    };

    // Fetch current period details — ONLY for Stripe subs. Apple IAP periods
    // are managed by App Store / RevenueCat; we read those from the webhook.
    const isStripeSub = info.subscription_source === 'stripe'
      || (info.stripe_subscription_id && !info.subscription_source);
    if (isStripeSub && info.stripe_subscription_id && info.subscription_status === 'active') {
      try {
        const sub = await stripe.getSubscription(info.stripe_subscription_id);
        response.currentPeriodEnd = sub.current_period_end;
        response.cancelAtPeriodEnd = sub.cancel_at_period_end;
      } catch (err) {
        logger.warn(`Failed to fetch subscription details from Stripe: ${err.message}`);
      }
    }

    res.json(response);
  } catch (error) {
    logger.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// ─── Cancel Subscription ─────────────────────────────────────────────────────
// POST /api/payments/cancel
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const info = await User.getSubscriptionInfo(req.userId);
    if (!info || !info.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    if (info.subscription_status !== 'active') {
      return res.status(400).json({ error: 'Subscription is not active' });
    }

    // Cancel at end of billing period (not immediately)
    const subscription = await stripe.cancelSubscription(info.stripe_subscription_id);

    res.json({
      message: 'Subscription will be cancelled at the end of the current billing period',
      currentPeriodEnd: subscription.current_period_end
    });
  } catch (error) {
    logger.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /api/payments/reactivate — un-cancel a subscription that's pending
// cancellation (cancel_at_period_end=true). Stripe stops planning to cancel
// and the next billing date stays exactly where it was — no new charge.
router.post('/reactivate', authMiddleware, async (req, res) => {
  try {
    const info = await User.getSubscriptionInfo(req.userId);
    if (!info || !info.stripe_subscription_id) {
      return res.status(400).json({ error: 'No subscription to reactivate' });
    }
    if (info.subscription_source === 'apple_iap') {
      return res.status(400).json({ error: 'Apple subscriptions are managed in iOS Settings' });
    }
    if (info.subscription_status !== 'active') {
      return res.status(400).json({ error: 'Subscription is not active. Subscribe again to restart.' });
    }

    // Confirm with Stripe that the sub is actually pending cancellation before
    // claiming we "reactivated" it. Avoids confusing UX if state desyncs.
    const current = await stripe.getSubscription(info.stripe_subscription_id);
    if (!current.cancel_at_period_end) {
      return res.status(400).json({ error: 'Subscription is not pending cancellation' });
    }

    const subscription = await stripe.reactivateSubscription(info.stripe_subscription_id);
    res.json({
      message: 'Subscription reactivated',
      currentPeriodEnd: subscription.current_period_end
    });
  } catch (error) {
    logger.error('Reactivate subscription error:', error);
    res.status(500).json({ error: 'Failed to reactivate subscription' });
  }
});

// ─── Webhook Handler ─────────────────────────────────────────────────────────
// This is exported separately and mounted with express.raw() in server.js
async function webhookHandler(req, res) {
  let event;

  try {
    const signature = req.headers['stripe-signature'];
    event = stripe.constructWebhookEvent(req.body, signature);
  } catch (err) {
    logger.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  // Idempotency via Redis (skip in dev where redis is a no-op stub).
  // Mirrors the RevenueCat dedup pattern from security #9. Placed AFTER
  // signature verification so attackers can't poison Redis with forged IDs.
  if (redisClient.isReady && event.id) {
    const dedupeKey = `stripe:event:${event.id}`;
    const setResult = await redisClient.set(dedupeKey, '1', { NX: true, EX: 604800 });
    if (setResult === null) {
      logger.info(`[Stripe webhook] duplicate event ${event.id} — skipping`);
      return res.json({ received: true });
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const profileType = session.metadata?.profileType;

        if (userId && session.subscription) {
          // Determine tier from profile type and price
          let tier = null;
          if (profileType === 'hsplayer' || profileType === 'transferplayer') {
            tier = 'player';
          } else if (profileType === 'collegecoach') {
            // Look up tier from subscription's price
            try {
              const sub = await stripe.getSubscription(session.subscription);
              const priceId = sub.items.data[0]?.price?.id;
              if (priceId === process.env.STRIPE_COACH_STARTER_PRICE_ID) tier = 'starter';
              else if (priceId === process.env.STRIPE_COACH_PRO_PRICE_ID) tier = 'pro';
              else if (priceId === process.env.STRIPE_COACH_ELITE_PRICE_ID) tier = 'elite';
              else tier = 'pro'; // fallback
            } catch (err) {
              logger.warn(`Could not determine tier from subscription, defaulting to pro: ${err.message}`);
              tier = 'pro';
            }
          }

          await User.updateSubscription(userId, {
            subscriptionId: session.subscription,
            status: 'active',
            tier,
            source: 'stripe'
          });

          if (!session.customer) {
            logger.warn(`checkout.session.completed missing customer for user ${userId}`);
          } else {
            await User.updateStripeCustomerId(userId, session.customer);
          }

          logger.info(`Subscription activated for user ${userId}: tier=${tier}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (userId) {
          const status = subscription.cancel_at_period_end ? 'active' : subscription.status;
          await User.updateSubscription(userId, {
            subscriptionId: subscription.id,
            status: status === 'active' ? 'active' : status,
            source: 'stripe'
          });
          logger.info(`Subscription updated for user ${userId}: status=${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await User.updateSubscription(userId, {
            subscriptionId: null,
            status: 'cancelled',
            tier: null,
            source: 'stripe'
          });
          logger.info(`Subscription cancelled for user ${userId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;

        if (subscriptionId) {
          try {
            const sub = await stripe.getSubscription(subscriptionId);
            const userId = sub.metadata?.userId;
            if (userId) {
              await User.updateSubscription(userId, {
                subscriptionId,
                status: 'past_due',
                source: 'stripe'
              });
              logger.warn(`Payment failed for user ${userId}, subscription ${subscriptionId}`);
            }
          } catch (err) {
            logger.error(`Failed to handle payment_failed for subscription ${subscriptionId}: ${err.message}`);
          }
        }
        break;
      }

      default:
        logger.info(`Unhandled Stripe event type: ${event.type}`);
    }
  } catch (error) {
    logger.error(`Webhook event processing error: ${error.message}`);
  }

  // Always return 200 to acknowledge receipt
  res.json({ received: true });
}

// ─── RevenueCat IAP Support (Phase 3a) ──────────────────────────────────────
// Maps RevenueCat product IDs (configured in App Store Connect) to our
// internal tier strings. Product IDs come from env vars so prod/dev can differ.
function mapRevenueCatProductToTier(productId) {
  const map = {
    [process.env.IAP_PRODUCT_PLAYER]: 'player',
    [process.env.IAP_PRODUCT_COACH_STARTER]: 'starter',
    [process.env.IAP_PRODUCT_COACH_PRO]: 'pro',
    [process.env.IAP_PRODUCT_COACH_ELITE]: 'elite'
  };
  // Guard against undefined env vars mapping productId='undefined' -> 'player'
  if (!productId) return null;
  return map[productId] || null;
}

// POST /api/payments/revenuecat-webhook
// Auth: timing-safe Authorization header match against REVENUECAT_WEBHOOK_AUTH_HEADER.
// Idempotency: Redis SET NX with 7d TTL on event.id (RevenueCat retries up to ~72h).
// Mounted with express.raw() in server.js — req.body is a Buffer.
async function revenueCatWebhookHandler(req, res) {
  try {
    const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
    if (!expectedAuth) {
      logger.error('[RevenueCat webhook] REVENUECAT_WEBHOOK_AUTH_HEADER not set');
      return res.status(500).send('webhook not configured');
    }

    // 1. Timing-safe auth header compare
    const provided = req.headers['authorization'] || '';
    const expectedBuf = Buffer.from(expectedAuth, 'utf8');
    const providedBuf = Buffer.from(provided, 'utf8');
    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return res.status(401).send('unauthorized');
    }

    // 2. Parse body
    const event = JSON.parse(req.body.toString('utf8'));
    const eventId = event.id;
    const payload = event.event || {};
    const { type, app_user_id, product_id, original_transaction_id } = payload;

    // 3. Require event.id (RevenueCat always sends one — guard anyway)
    if (!eventId) {
      logger.warn('[RevenueCat webhook] missing event.id — acking');
      return res.sendStatus(200);
    }

    // 4. Idempotency via Redis (skip in dev where redis is a no-op stub)
    if (redisClient.isReady) {
      const dedupeKey = `revenuecat:event:${eventId}`;
      const setResult = await redisClient.set(dedupeKey, '1', { NX: true, EX: 604800 });
      if (setResult === null) {
        logger.info(`[RevenueCat webhook] duplicate event ${eventId} — skipping`);
        return res.sendStatus(200);
      }
    }

    // 5. UUID validation on app_user_id
    if (!app_user_id) {
      logger.warn(`[RevenueCat webhook] missing app_user_id (event ${eventId})`);
      return res.sendStatus(200);
    }
    if (!UUID_REGEX.test(app_user_id)) {
      logger.warn(`[RevenueCat webhook] malformed app_user_id: ${app_user_id}`);
      return res.status(400).send('invalid app_user_id');
    }

    // 6. Verify user exists — silent 200 on miss to prevent enumeration
    const user = await User.findById(app_user_id);
    if (!user) {
      logger.warn(`[RevenueCat webhook] unknown app_user_id: ${app_user_id}`);
      return res.sendStatus(200);
    }

    const tier = mapRevenueCatProductToTier(product_id);

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE': {
        if (!tier) {
          logger.error(`[RevenueCat webhook] unknown product_id: ${product_id}`);
          return res.sendStatus(200);
        }
        await User.updateSubscription(app_user_id, {
          subscriptionId: original_transaction_id,
          status: 'active',
          tier,
          source: 'apple_iap'
        });
        logger.info(`[RevenueCat webhook] ${type}: user=${app_user_id} tier=${tier}`);
        break;
      }
      case 'CANCELLATION':
      case 'EXPIRATION': {
        await User.updateSubscription(app_user_id, {
          status: 'cancelled',
          source: 'apple_iap'
        });
        logger.info(`[RevenueCat webhook] ${type}: user=${app_user_id}`);
        break;
      }
      case 'BILLING_ISSUE': {
        await User.updateSubscription(app_user_id, {
          status: 'past_due',
          source: 'apple_iap'
        });
        logger.warn(`[RevenueCat webhook] BILLING_ISSUE: user=${app_user_id}`);
        break;
      }
      default:
        logger.info(`[RevenueCat webhook] unhandled event type: ${type}`);
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error(`[RevenueCat webhook] error: ${error.message}`);
    res.sendStatus(500);
  }
}

// GET /api/payments/revenuecat-config
// Returns public RevenueCat API key + iOS product IDs for the mobile app.
// Safe to expose client-side (like Stripe publishable keys).
router.get('/revenuecat-config', authMiddleware, (req, res) => {
  res.json({
    apiKey: process.env.REVENUECAT_IOS_API_KEY || '',
    products: {
      player: process.env.IAP_PRODUCT_PLAYER || '',
      coach_starter: process.env.IAP_PRODUCT_COACH_STARTER || '',
      coach_pro: process.env.IAP_PRODUCT_COACH_PRO || '',
      coach_elite: process.env.IAP_PRODUCT_COACH_ELITE || ''
    }
  });
});

// Export both the router and the webhook handlers
module.exports = router;
module.exports.webhookHandler = webhookHandler;
module.exports.revenueCatWebhookHandler = revenueCatWebhookHandler;
