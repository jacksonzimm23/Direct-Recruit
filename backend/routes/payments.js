const crypto = require('crypto');
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware, UUID_REGEX } = require('../middleware/auth');
const stripe = require('../utils/stripe');
const logger = require('../utils/logger');
const redisClient = require('../config/redis');
const pool = require('../config/database');

// ─── Entitlement ↔ profile-type validation ───────────────────────────────────
// A subscription tier may only activate an account whose CURRENT profile type
// it belongs to. Without this, any still-active product (e.g. an old $10
// player IAP) would unlock whatever profile the user has now (e.g. a college
// coach with AI token budgets). The single source of truth lives in the User
// model (User.ALLOWED_TIERS_BY_SUBTYPE / User.allowedTiersFor — also used by
// the profile-switch endpoint); this is a local alias for brevity.
const allowedTiersFor = (args) => User.allowedTiersFor(args);

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

    // Validate profile type is paid. Players are paid again (with a 7-day trial
    // applied below), so hsplayer/transferplayer checkouts are allowed here.
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

    // Entitlement↔profile validation: the selected plan must match the caller's
    // ACTUAL profile type — an hsplayer must not be able to buy a coach tier
    // (or vice versa). Role fallback covers the pay-before-profile signup gap.
    const resolvedTier = TIER_MAP[priceKey];
    const { role, subtype } = await User.getSubtypeAndRole(req.userId);
    if (!allowedTiersFor({ subtype, role }).includes(resolvedTier)) {
      return res.status(400).json({ error: 'Selected plan does not match your profile type. Switch your profile type first.' });
    }

    // Already subscribed through Apple — block stacking a second (Stripe)
    // subscription on top; Apple billing can only be managed on the iOS device.
    const subInfo = await User.getSubscriptionInfo(req.userId);
    if (subInfo && subInfo.subscription_source === 'apple_iap' && subInfo.subscription_status === 'active') {
      return res.status(400).json({ error: 'You are subscribed through the iOS app. Manage your subscription on your iOS device.' });
    }

    // Create or retrieve Stripe customer
    let customerId = await User.getStripeCustomerId(req.userId);
    if (!customerId) {
      const customer = await stripe.createCustomer(user.email, req.userId);
      customerId = customer.id;
      await User.updateStripeCustomerId(req.userId, customerId);
    }
    // Player subscriptions (hsplayer/transferplayer) get a 7-day free trial.
    // Keyed off profileType, NOT tier, so a coach checkout NEVER gets a trial.
    const isPlayerTrial = profileType === 'hsplayer' || profileType === 'transferplayer';
    const session = await stripe.createCheckoutSession({
      customerId,
      priceId,
      userId: req.userId,
      profileType,
      tier: resolvedTier,
      trialDays: isPlayerTrial ? 7 : 0,
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
    // 'trialing' included so a player's trial-end date (Stripe's current_period_end
    // during a trial = the day-7 first-charge date) populates the settings display.
    if (isStripeSub && info.stripe_subscription_id
        && (info.subscription_status === 'active' || info.subscription_status === 'trialing')) {
      try {
        const sub = await stripe.getSubscription(info.stripe_subscription_id);
        response.currentPeriodEnd = sub.current_period_end;
        response.cancelAtPeriodEnd = sub.cancel_at_period_end;
      } catch (err) {
        logger.warn(`Failed to fetch subscription details from Stripe: ${err.message}`);
      }
    } else if (info.subscription_source === 'apple_iap' && info.subscription_status === 'trialing') {
      // IAP trial: surface the Apple trial-end date so Settings shows the
      // "Trial Ends / First Billing" row (display parity with Stripe). Scoped to
      // the trialing state only — a rare ~7-day window — so the common active
      // path never pays for this extra RevenueCat call. Best-effort: on any
      // failure the badge still reads "Free Trial", just without the date row.
      try {
        const end = await getIapTrialEnd(req.userId);
        if (end) response.currentPeriodEnd = end;
      } catch (err) {
        logger.warn(`Failed to fetch IAP trial end for user ${req.userId}: ${err.message}`);
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

    // Apple subs can't be cancelled server-side — the stored id is a RevenueCat
    // transaction id, not a Stripe sub id. Only the user can cancel, on-device.
    if (info.subscription_source === 'apple_iap') {
      return res.status(400).json({ error: 'This subscription is managed through Apple. Cancel it in Settings > Apple ID > Subscriptions on your iOS device.' });
    }

    // Accept 'trialing' too: hsplayer/transferplayer start on a 7-day trial and
    // the "Cancel Trial" button (settings.js) posts here. cancelSubscription sets
    // cancel_at_period_end=true, which ends a trialing sub at trial end with NO
    // charge — the promised "cancel during trial → not charged" escape hatch.
    // Without 'trialing' here, a trial player got a 400 and was billed on day 7.
    if (info.subscription_status !== 'active' && info.subscription_status !== 'trialing') {
      return res.status(400).json({ error: 'Subscription is not active' });
    }

    // Cancel at end of billing period (not immediately). For a trialing sub this
    // is the trial-end date, so the first invoice never fires.
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
    // Accept 'trialing' too: a trial player who hit "Cancel Trial" stays in
    // 'trialing' status (toggling cancel_at_period_end doesn't change Stripe's
    // status), so they must be allowed to un-cancel before day 7.
    if (info.subscription_status !== 'active' && info.subscription_status !== 'trialing') {
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
          // Fetch the subscription once — we need its real status (so a player's
          // 7-day trial is stored as 'trialing', not a hardcoded 'active') and,
          // for coaches, its price to resolve the tier. Best-effort: if the fetch
          // fails we fall back to 'active' (players charge on day 7 either way,
          // since Stripe owns the trial timer regardless of our stored label).
          let sub = null;
          try {
            sub = await stripe.getSubscription(session.subscription);
          } catch (err) {
            logger.warn(`checkout.session.completed: could not fetch subscription ${session.subscription}: ${err.message}`);
          }

          // Determine tier from profile type and price
          let tier = null;
          if (profileType === 'hsplayer' || profileType === 'transferplayer') {
            tier = 'player';
          } else if (profileType === 'collegecoach') {
            // Look up tier from subscription's price
            const priceId = sub?.items?.data?.[0]?.price?.id;
            if (priceId === process.env.STRIPE_COACH_STARTER_PRICE_ID) tier = 'starter';
            else if (priceId === process.env.STRIPE_COACH_PRO_PRICE_ID) tier = 'pro';
            else if (priceId === process.env.STRIPE_COACH_ELITE_PRICE_ID) tier = 'elite';
            else {
              logger.warn(`Could not determine coach tier from subscription price, defaulting to pro`);
              tier = 'pro'; // fallback
            }
          }

          // Mirror Stripe's real subscription status so the DB reflects the trial.
          // A player checkout lands 'trialing' (7-day trial); coaches (no trial)
          // land 'active'. Only ever store the terminal-good states here — any
          // exotic Stripe status (incomplete/unpaid) falls back to 'active' so a
          // paid signup is never wrongly paywalled; the *.updated / payment_failed
          // handlers correct it if the real state diverges. Every access gate
          // treats 'trialing' identically to 'active' (paywall + AI gates), so
          // storing 'trialing' grants full access AND unlocks the Cancel Trial
          // button (its /cancel guard requires 'active' OR 'trialing').
          const status = sub?.status === 'trialing' ? 'trialing' : 'active';

          // Defense in depth: the session's profileType/tier was fixed at
          // checkout-creation time; the profile may have switched since (or the
          // session was forged via API abuse). Never activate a tier the CURRENT
          // profile type can't hold. Money was taken — leave the pending-cancel
          // stash intact and resolve via support.
          const { role: curRole, subtype: curSubtype } = await User.getSubtypeAndRole(userId);
          if (!allowedTiersFor({ subtype: curSubtype, role: curRole }).includes(tier)) {
            logger.error(`[Stripe webhook] PRODUCT/PROFILE MISMATCH: user=${userId} subtype=${curSubtype || curRole} tier=${tier} session=${session.id} — NOT activating`);
            break;
          }

          await User.updateSubscription(userId, {
            subscriptionId: session.subscription,
            status,
            tier,
            source: 'stripe'
          });

          if (!session.customer) {
            logger.warn(`checkout.session.completed missing customer for user ${userId}`);
          } else {
            await User.updateStripeCustomerId(userId, session.customer);
          }

          // Verify-then-pay (cross-type paid->paid switch): if this user switched FROM
          // a different paid product, the switch stashed their OLD Stripe sub id rather
          // than cancelling it (so they kept access / weren't double-charged while
          // deciding). Now that the NEW sub is active, cancel the OLD one. Idempotent:
          // takePendingCancelSubId clears the id in the same statement, so a duplicate
          // webhook reads null and skips. Best-effort — never fail the webhook on this.
          try {
            const oldSubId = await User.takePendingCancelSubId(userId);
            if (oldSubId && oldSubId !== session.subscription) {
              await stripe.cancelSubscription(oldSubId);
              logger.info(`Cancelled prior subscription ${oldSubId} for user ${userId} after paid->paid switch`);
            }
          } catch (cancelErr) {
            logger.error(`Failed to cancel prior subscription for user ${userId}: ${cancelErr.message}`);
          }

          logger.info(`Subscription ${status === 'trialing' ? 'started (trial)' : 'activated'} for user ${userId}: tier=${tier}, status=${status}`);
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

// True when a RevenueCat period_type represents a free-trial (or intro-offer)
// window rather than a full-price paid period. RevenueCat sends this UPPERCASE in
// webhook payloads (TRIAL/INTRO/NORMAL/PROMOTIONAL/PREPAID) and lowercase in the
// REST subscriber object (trial/intro/normal/...), so we lowercase before compare.
// Both 'trial' and 'intro' mean the user isn't paying full price yet → 'trialing'.
function isTrialPeriod(periodType) {
  if (!periodType) return false;
  const p = String(periodType).toLowerCase();
  return p === 'trial' || p === 'intro';
}

// Fetch the trial-end date for an IAP subscriber (Unix SECONDS, to match Stripe's
// current_period_end shape the frontend already consumes). Returns the newest
// still-active TRIAL/INTRO sub's expiry, or null if none / not configured.
// Used only by GET /subscription-status for apple_iap + 'trialing' users.
async function getIapTrialEnd(userId) {
  const rcSecret = process.env.REVENUECAT_SECRET_API_KEY;
  if (!rcSecret) return null;
  const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${rcSecret}` }
  });
  if (!rcRes.ok) return null;
  const body = await rcRes.json();
  const subs = (body.subscriber && body.subscriber.subscriptions) || {};
  const now = Date.now();
  let bestMs = 0;
  for (const s of Object.values(subs)) {
    if (!s || !isTrialPeriod(s.period_type) || !s.expires_date) continue;
    const exp = new Date(s.expires_date).getTime();
    if (exp > now && exp > bestMs) bestMs = exp;
  }
  return bestMs ? Math.floor(bestMs / 1000) : null;
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

    // 4.5 TRANSFER: the entitlement moved between RevenueCat app-user-ids (e.g.
    // a Restore Purchases on a different account with the same Apple ID).
    // Deactivate the losing side so two accounts never ride one subscription.
    // The gaining side is NOT auto-activated here — TRANSFER carries no product
    // info; their own (validated) restore/reconcile establishes it.
    if (type === 'TRANSFER') {
      const from = Array.isArray(payload.transferred_from) ? payload.transferred_from : [];
      for (const fromId of from) {
        if (!UUID_REGEX.test(fromId)) continue; // anonymous RC ids — nothing stored for them
        const fromInfo = await User.getSubscriptionInfo(fromId);
        if (fromInfo && fromInfo.subscription_source === 'apple_iap') {
          await User.updateSubscription(fromId, { status: 'cancelled', source: 'apple_iap' });
          logger.warn(`[RevenueCat webhook] TRANSFER: deactivated user=${fromId} (entitlement moved to another account)`);
        }
      }
      return res.sendStatus(200);
    }

    // 5. UUID validation on app_user_id
    if (!app_user_id) {
      logger.warn(`[RevenueCat webhook] missing app_user_id (event ${eventId})`);
      return res.sendStatus(200);
    }
    if (!UUID_REGEX.test(app_user_id)) {
      // Almost always an anonymous RevenueCat id ($RCAnonymousID:...) from a purchase
      // made before the app identified the user. ACK with 200 (not 400) so RevenueCat
      // stops retrying for ~72h — the client-side iap-reconcile + logIn-before-purchase
      // are what actually activate these users. Nothing to do here.
      logger.warn(`[RevenueCat webhook] non-UUID app_user_id (likely anonymous): ${app_user_id} — acking`);
      return res.sendStatus(200);
    }

    // 6. Verify user exists — silent 200 on miss to prevent enumeration
    const user = await User.findById(app_user_id);
    if (!user) {
      logger.warn(`[RevenueCat webhook] unknown app_user_id: ${app_user_id}`);
      return res.sendStatus(200);
    }

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'PRODUCT_CHANGE': {
        // PRODUCT_CHANGE: payload.product_id is the product being changed FROM;
        // the target product arrives in new_product_id.
        const effectiveProductId = type === 'PRODUCT_CHANGE'
          ? (payload.new_product_id || product_id)
          : product_id;
        const effTier = mapRevenueCatProductToTier(effectiveProductId);
        if (!effTier) {
          logger.error(`[RevenueCat webhook] unknown product_id: ${effectiveProductId}`);
          return res.sendStatus(200);
        }

        // Trial-aware status so an Apple free-trial (player intro offer) reads
        // 'trialing' in Settings, matching the Stripe rail. RevenueCat webhook
        // period_type is uppercase (TRIAL/INTRO/NORMAL/...). Both TRIAL and INTRO
        // mean "not yet paying full price," so treat either as trialing. Every
        // access gate accepts 'trialing' identically to 'active', so this only
        // changes the badge/label — never access. On RENEWAL (first real charge)
        // period_type is NORMAL, so status correctly becomes 'active'.
        const iapStatus = isTrialPeriod(payload.period_type) ? 'trialing' : 'active';

        // Entitlement↔profile validation inside a row-locked txn. FOR UPDATE on
        // the users row serializes against profile-switch (which locks the same
        // row in its transaction), so a renewal landing mid-switch validates
        // against the POST-switch profile, never a half-switched one.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [app_user_id]);
          const { role, subtype } = await User.getSubtypeAndRole(app_user_id, client);
          if (!allowedTiersFor({ subtype, role }).includes(effTier)) {
            await client.query('ROLLBACK');
            // Ack 200 — RevenueCat must not retry. Recovery is the user's own
            // validated restore/reconcile after they fix their profile type.
            logger.warn(`[RevenueCat webhook] PRODUCT/PROFILE MISMATCH: user=${app_user_id} subtype=${subtype || role} product=${effectiveProductId} tier=${effTier} — NOT activating`);
            return res.sendStatus(200);
          }
          await User.updateSubscription(app_user_id, {
            subscriptionId: original_transaction_id,
            status: iapStatus,
            tier: effTier,
            source: 'apple_iap'
          }, client);
          await client.query('COMMIT');
        } catch (txErr) {
          await client.query('ROLLBACK').catch(() => {});
          throw txErr;
        } finally {
          client.release();
        }
        logger.info(`[RevenueCat webhook] ${type}: user=${app_user_id} tier=${effTier} status=${iapStatus}`);
        break;
      }
      case 'CANCELLATION':
      case 'EXPIRATION':
      case 'BILLING_ISSUE': {
        // Downgrade guards: only act when the event refers to the subscription
        // we are actually honoring — source must be apple_iap (never clobber a
        // Stripe or comp user) AND the event's product must map to the CURRENT
        // tier (an old player product expiring must not kill a coach's live sub).
        const evTier = mapRevenueCatProductToTier(product_id);
        const info = await User.getSubscriptionInfo(app_user_id);
        if (!info || info.subscription_source !== 'apple_iap') {
          logger.info(`[RevenueCat webhook] ${type} ignored: user=${app_user_id} source=${(info && info.subscription_source) || 'none'}`);
          return res.sendStatus(200);
        }
        if (!evTier || evTier !== info.subscription_tier) {
          logger.info(`[RevenueCat webhook] ${type} ignored: user=${app_user_id} product=${product_id} (tier ${evTier}) != current tier ${info.subscription_tier}`);
          return res.sendStatus(200);
        }

        if (type === 'CANCELLATION') {
          // Auto-renew turned off: paid-through access continues until the
          // EXPIRATION event (mirrors Stripe's cancel_at_period_end). Only a
          // refund/revocation by Apple support ends access immediately.
          if (payload.cancel_reason !== 'CUSTOMER_SUPPORT') {
            logger.info(`[RevenueCat webhook] CANCELLATION (auto-renew off): user=${app_user_id} — access until expiration`);
            return res.sendStatus(200);
          }
          await User.updateSubscription(app_user_id, { status: 'cancelled', source: 'apple_iap' });
          logger.info(`[RevenueCat webhook] CANCELLATION (refund): user=${app_user_id} — access revoked`);
        } else if (type === 'EXPIRATION') {
          await User.updateSubscription(app_user_id, { status: 'cancelled', source: 'apple_iap' });
          logger.info(`[RevenueCat webhook] EXPIRATION: user=${app_user_id}`);
        } else {
          await User.updateSubscription(app_user_id, { status: 'past_due', source: 'apple_iap' });
          logger.warn(`[RevenueCat webhook] BILLING_ISSUE: user=${app_user_id}`);
        }
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

// POST /api/payments/iap-reconcile
// Webhook-independent activation. The iOS app calls this right after a successful IAP
// purchase/restore. It re-checks the user's entitlement DIRECTLY with RevenueCat's REST
// API (server-to-server, using the SECRET api key) keyed off req.userId — the JWT-trusted
// UUID — and flips subscription_status. This makes activation reliable even when the
// webhook is delayed or the purchase was attributed to an anonymous RevenueCat id, and it
// does NOT trust any client-sent status (the request body is ignored for the decision).
router.post('/iap-reconcile', authMiddleware, async (req, res) => {
  try {
    const rcSecret = process.env.REVENUECAT_SECRET_API_KEY;
    if (!rcSecret) {
      logger.error('[iap-reconcile] REVENUECAT_SECRET_API_KEY not set');
      return res.status(500).json({ error: 'IAP reconcile not configured' });
    }

    // Look up the subscriber by our user UUID (the appUserID we logged into RevenueCat).
    const rcRes = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(req.userId)}`, {
      headers: { Authorization: `Bearer ${rcSecret}` }
    });
    if (!rcRes.ok) {
      logger.warn(`[iap-reconcile] RevenueCat lookup failed: ${rcRes.status}`);
      return res.status(502).json({ error: 'RevenueCat lookup failed' });
    }
    const body = await rcRes.json();

    // Collect unexpired subscriptions (RevenueCat keys them by product id).
    const subs = (body.subscriber && body.subscriber.subscriptions) || {};
    const now = Date.now();
    const candidates = [];
    for (const [productId, s] of Object.entries(subs)) {
      const exp = s && s.expires_date ? new Date(s.expires_date).getTime() : 0;
      if (exp > now) {
        // period_type (lowercase on the REST subscriber object) tells us whether
        // this window is a free trial/intro — carried onto the candidate so the
        // chosen match lands 'trialing' vs 'active' (display parity with Stripe).
        candidates.push({
          productId,
          tier: mapRevenueCatProductToTier(productId),
          expires: exp,
          trial: isTrialPeriod(s && s.period_type)
        });
      }
    }
    if (candidates.length === 0) {
      return res.json({ activated: false, reason: 'no_active' });
    }

    // Entitlement↔profile validation inside a row-locked txn (serializes against
    // profile-switch). Only a product allowed for the user's CURRENT profile
    // type may activate — an old player plan must not unlock a coach account.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [req.userId]);
      const { role, subtype } = await User.getSubtypeAndRole(req.userId, client);
      const allowed = allowedTiersFor({ subtype, role });

      // Latest-expiring allowed product wins: deterministic, and prefers the
      // newest sub when an old mismatched one is also still active.
      const match = candidates
        .filter((c) => c.tier && allowed.includes(c.tier))
        .sort((a, b) => b.expires - a.expires)[0];

      if (!match) {
        await client.query('ROLLBACK');
        const newest = candidates.slice().sort((a, b) => b.expires - a.expires)[0];
        logger.warn(`[iap-reconcile] PRODUCT/PROFILE MISMATCH: user=${req.userId} subtype=${subtype || role} active=[${candidates.map((c) => c.productId).join(', ')}] — NOT activating`);
        return res.json({
          activated: false,
          reason: 'product_mismatch',
          foundTier: newest ? newest.tier : null,
          allowedTiers: allowed
        });
      }

      const reconcileStatus = match.trial ? 'trialing' : 'active';
      await User.updateSubscription(req.userId, { status: reconcileStatus, tier: match.tier, source: 'apple_iap' }, client);
      await client.query('COMMIT');
      logger.info(`[iap-reconcile] activated user=${req.userId} tier=${match.tier} status=${reconcileStatus}`);
      return res.json({ activated: true, tier: match.tier, status: reconcileStatus });
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }
  } catch (e) {
    logger.error(`[iap-reconcile] ${e.message}`);
    res.status(500).json({ error: 'reconcile failed' });
  }
});

// Export both the router and the webhook handlers
module.exports = router;
module.exports.webhookHandler = webhookHandler;
module.exports.revenueCatWebhookHandler = revenueCatWebhookHandler;
module.exports.allowedTiersFor = allowedTiersFor; // exported for test scripts
module.exports.isTrialPeriod = isTrialPeriod; // exported for test scripts
