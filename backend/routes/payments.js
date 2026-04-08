const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const stripe = require('../utils/stripe');
const logger = require('../utils/logger');

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
    const session = await stripe.createCheckoutSession({
      customerId,
      priceId,
      userId: req.userId,
      profileType,
      context: context || 'signup',
      successUrl: successUrl || `${req.headers.origin}/frontend/shared/payment-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: cancelUrl || `${req.headers.origin}/frontend/landingpage/pricing.html`
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
      stripeCustomerId: info.stripe_customer_id || null
    };

    // If there's an active subscription, fetch current period details from Stripe
    if (info.stripe_subscription_id && info.subscription_status === 'active') {
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
            tier
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
            status: status === 'active' ? 'active' : status
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
            tier: null
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
                status: 'past_due'
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

// Export both the router and the webhook handler
module.exports = router;
module.exports.webhookHandler = webhookHandler;
