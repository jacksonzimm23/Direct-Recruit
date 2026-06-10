// ==================== IAP Products & Purchase Helpers (Phase 3b) ====================
// Wraps RevenueCat's Capacitor plugin with a small, Direct-Recruit-tier-aware API.
// Only works inside the iOS app (window.Capacitor present). Callers should
// gate on API.isIOSApp() before using.
//
// Usage:
//   await IAP.loadConfig();
//   const result = await IAP.purchaseTier('collegecoach', 'pro');
//   if (result.success) { /* profile creation, navigate to verify-email */ }
//   else if (result.cancelled) { /* user closed Apple sheet */ }
//   else { console.log(result.error); }

(function () {
    let _configCache = null;

    // Ensure RevenueCat is identified with the REAL user UUID before any purchase or
    // restore. Without this, a cold iOS launch (where capacitor-init.js's logIn may have
    // lost the /me race) leaves RevenueCat on an anonymous id ($RCAnonymousID). The
    // purchase then webhooks with a non-UUID app_user_id, fails validation server-side,
    // and the DB never flips to active — stranding the user on the paywall. Re-asserting
    // identity here makes the purchase attributable to the user so the webhook + reconcile
    // both work. Uses API.auth.getCurrentUser (routes to the prod host + sends the Bearer
    // token) rather than a raw fetch, so it works inside the iOS WebView.
    async function ensureRevenueCatIdentity(Purchases) {
        try {
            const me = (window.API && window.API.auth)
                ? await window.API.auth.getCurrentUser().catch(function () { return null; })
                : null;
            if (me && me.user && me.user.id) {
                await Purchases.logIn({ appUserID: me.user.id });
            }
        } catch (_) { /* fall through — the backend reconcile endpoint is the backstop */ }
    }

    async function loadConfig() {
        if (_configCache) return _configCache;
        // Use the shared API base (absolute https://directrecruit.net/api in the app) so the
        // call reaches the backend via CapacitorHttp rather than the local bundle origin.
        const base = window.API_BASE_URL || '/api';
        const res = await fetch(`${base}/payments/revenuecat-config`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load RevenueCat config');
        _configCache = await res.json();
        return _configCache;
    }

    function getProductForTier(profileType, tier) {
        if (!_configCache) throw new Error('IAP.loadConfig() must be called first');
        // Tier->key mapping matches backend mapRevenueCatProductToTier
        let key;
        if (profileType === 'hsplayer' || profileType === 'transferplayer') {
            key = 'player';
        } else if (profileType === 'collegecoach' && tier === 'starter') {
            key = 'coach_starter';
        } else if (profileType === 'collegecoach' && tier === 'pro') {
            key = 'coach_pro';
        } else if (profileType === 'collegecoach' && tier === 'elite') {
            key = 'coach_elite';
        } else {
            return null;
        }
        return _configCache.products?.[key] || null;
    }

    async function purchaseTier(profileType, tier) {
        try {
            await loadConfig();
            const productId = getProductForTier(profileType, tier);
            if (!productId) return { success: false, error: 'Unknown tier' };

            const Purchases = window.Capacitor?.Plugins?.Purchases;
            if (!Purchases) return { success: false, error: 'RevenueCat plugin not available' };

            // Attribute the purchase to the real user UUID (not $RCAnonymousID) so the
            // webhook can match it server-side. Critical on cold iOS launches.
            await ensureRevenueCatIdentity(Purchases);

            // Fetch offerings to find the package matching this product.
            // Apple's purchase sheet will appear when we call purchasePackage.
            const offerings = await Purchases.getOfferings();
            const currentOffering = offerings?.current || offerings?.all?.default;
            if (!currentOffering?.availablePackages?.length) {
                return { success: false, error: 'No packages available' };
            }

            const pkg = currentOffering.availablePackages.find(function (p) {
                return (p.product?.identifier === productId)
                    || (p.storeProduct?.identifier === productId);
            });
            if (!pkg) return { success: false, error: 'Product ' + productId + ' not in offerings' };

            const result = await Purchases.purchasePackage({ aPackage: pkg });
            const customerInfo = result?.customerInfo || {};
            return {
                success: true,
                originalTransactionId: result?.transaction?.originalTransactionIdentifier || null,
                customerInfo: customerInfo
            };
        } catch (e) {
            // User-cancelled purchases throw — treat specially so UI can distinguish
            if (e && e.userCancelled) return { success: false, cancelled: true };
            return { success: false, error: (e && e.message) || 'Purchase failed' };
        }
    }

    // Apple Guideline 3.1.1 prohibits hardcoded $ prices in the iOS app —
    // they must come from Apple in the user's local currency. This helper
    // returns a { tierKey: priceString } map for tier-picker modals to use.
    // Returns empty {} on any failure so callers can fall back to web prices.
    async function getOfferingsPriceMap() {
        try {
            await loadConfig();
            const Purchases = window.Capacitor?.Plugins?.Purchases;
            if (!Purchases) return {};
            const offerings = await Purchases.getOfferings();
            const currentOffering = offerings?.current || offerings?.all?.default;
            if (!currentOffering?.availablePackages?.length) return {};
            const map = {};
            const cfg = _configCache?.products || {};
            for (const pkg of currentOffering.availablePackages) {
                const id = pkg.product?.identifier || pkg.storeProduct?.identifier;
                const priceString = pkg.product?.priceString
                    || pkg.storeProduct?.priceString
                    || pkg.product?.localizedPriceString
                    || null;
                if (!id || !priceString) continue;
                for (const [tierKey, productId] of Object.entries(cfg)) {
                    if (productId === id) map[tierKey] = priceString;
                }
            }
            return map;
        } catch (e) {
            console.warn('[IAP] getOfferingsPriceMap failed:', e);
            return {};
        }
    }

    // Apple Guideline 3.1.1 requires a Restore Purchases option for subscription
    // apps. RevenueCat's restorePurchases() asks Apple for the user's existing
    // transactions and re-syncs entitlements. The webhook then fires server-side
    // and updates subscription_status in the DB.
    async function restorePurchases() {
        try {
            const Purchases = window.Capacitor?.Plugins?.Purchases;
            if (!Purchases) return { success: false, error: 'RevenueCat plugin not available' };

            // Identify as the real user first so restored transactions re-associate with
            // the UUID (not an anonymous id), letting the webhook/reconcile flip the DB.
            await ensureRevenueCatIdentity(Purchases);

            const result = await Purchases.restorePurchases();
            const customerInfo = result?.customerInfo || result || {};
            const entitlements = customerInfo?.entitlements?.active || {};
            const hasActive = Object.keys(entitlements).length > 0;
            // Which products the active entitlements belong to — display only.
            // The SERVER decides what activates (/iap-reconcile validates the
            // product against the user's current profile type).
            const products = Object.values(entitlements)
                .map(function (e) { return e && e.productIdentifier; })
                .filter(Boolean);
            return { success: true, hasActive: hasActive, products: products, customerInfo: customerInfo };
        } catch (e) {
            return { success: false, error: (e && e.message) || 'Restore failed' };
        }
    }

    // Expose globally — Phase 3c's 6 touchpoints use window.IAP
    window.IAP = {
        loadConfig: loadConfig,
        getProductForTier: getProductForTier,
        getOfferingsPriceMap: getOfferingsPriceMap,
        purchaseTier: purchaseTier,
        restorePurchases: restorePurchases
    };
})();
