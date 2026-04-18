## Phase 0: Decisions to confirm before any code
Confirm WebView wrapper (Capacitor) is the path — not React Native, not native Swift. Given your situation (solo dev, Windows, working web app), Capacitor is the right call.
Confirm: mobile web → redirect to App Store. This means frontend/shared/mobile-overrides.css becomes the iOS app's only mobile experience. Anyone hitting directrecruit.net on mobile Safari/Chrome gets a "Download the app" landing page instead of the current responsive view.
Pricing strategy — you'll need higher iOS prices to absorb Apple's 30% (or 15% for year 2 / Small Business Program). Decide tier prices now: e.g., Player $14.99, Coach Starter $29.99, Pro $69.99, Elite $139.99.


## Phase 1: Mobile-web redirect (web side, ~1 day)
In frontend/shared/api.js (loaded everywhere), add an early-running check:


const isMobileWeb = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                    && !window.Capacitor;  // Capacitor injects this global
const isAllowedPage = ['/landingpage/', '/admin/'].some(p => window.location.pathname.includes(p));
if (isMobileWeb && !isAllowedPage) {
    window.location.href = '/landingpage/get-the-app.html';
}
Create frontend/landingpage/get-the-app.html with App Store badge + brief copy. Don't redirect from landing pages — those still need to work on mobile web for marketing/sharing.

Then strip frontend/shared/mobile-overrides.css of the assumption that it'll ever run in mobile Safari — it's now exclusively the iOS app's CSS. Add .ios-app body class scoping (Phase 2).

## Phase 2: Capacitor setup + iOS app detection
Install Capacitor in the project root, point it at frontend/ as the web directory.
Add <html class=""> → on Capacitor init, set document.documentElement.classList.add('ios-app').
Refactor frontend/shared/mobile-overrides.css to be scoped under .ios-app (or rename to ios-app-overrides.css and load conditionally).
Add safe-area handling: padding-top: env(safe-area-inset-top) on .mobile-header, bottom nav, etc.
Disable web-isms: tap highlight, hover stickiness, body bounce scroll.
Splash screen + app icon (already have icons in frontend/icons/ios/).

## Phase 3: Stripe → IAP routing
This is what gets you rejected if done wrong. The 6 Stripe touchpoints need iOS-aware branching:

File	Current behavior	iOS app behavior
frontend/shared/api.js:910-923 (paymentsAPI)	Calls Stripe	Add paymentsAPI.iap.* methods that call native StoreKit via Capacitor plugin
frontend/shared/settings.js:2915-3177 (Subscription section)	Shows Stripe subscribe + cancel buttons	iOS: show "Manage in Apple Subscriptions" deep link to https://apps.apple.com/account/subscriptions
frontend/shared/subscription-required.html (paywall)	Stripe checkout buttons	iOS: trigger native IAP purchase flow
frontend/collegecoach/coach-profile-form.js:558-598 (showTierModal)	Shows tier picker → Stripe	iOS: same picker → IAP product purchase
frontend/collegecoach/payment-success.html	Reads Stripe pendingProfileData	iOS: triggered after StoreKit success callback instead
frontend/shared/payment-success-switch.html	Stripe redirect target	iOS: not used — switch flow stays in-app via StoreKit callback
Use RevenueCat (revenuecat.com) — it's the standard IAP wrapper. It abstracts StoreKit so your Capacitor plugin gets a simple purchasePackage() API, handles receipt verification, and gives you a unified webhook for both Apple IAP and (future) Google Play. This saves you ~2 weeks of receipt-verification plumbing. Free up to $10K/month revenue.

Backend changes:

Add subscription_source column to users ('stripe' | 'apple_iap')
New endpoint POST /api/payments/revenuecat-webhook (mirrors your existing Stripe webhook)
Cross-platform sign-in: backend reports is_subscribed: true if either source is active

## Phase 4: Native capabilities to satisfy Guideline 4.2 
Apple will reject a "just a website" wrapper. Add these Capacitor plugins:

Push Notifications (@capacitor/push-notifications) — wire to your existing notifications system. New backend endpoint to register device tokens.
Camera / Photo library (@capacitor/camera) — replace the web <input type="file"> for post media uploads, profile pic, highlight videos. Your post creation in frontend/shared/feed.js and the mobile post modal need an iOS branch.
Apple Sign In (@capacitor-community/apple-sign-in) — required by Guideline 4.8 if you offer any other social login. Currently you only have email/password, so this isn't strictly required, but it's a strong signal of "real iOS app." Recommended.
Account deletion — already exists in your settings flow. Just make sure it's reachable in the iOS app (Apple Guideline 5.1.1(v) requires it).
Splash screen (@capacitor/splash-screen) — already have icons.

## Phase 5: Polish to pass review
The MPA full-page-reload thing is your biggest 4.2 risk. Mitigations:

Loading state — show a brief skeleton/spinner overlay during navigation so users don't see white flashes
Preload the next page on link hover/tap-down
Set background color on <html> to your dark theme so the white flash becomes a dark flash (much less jarring)
Also:

Disable browser back gesture overrides
Test all flows on a real iPhone (or browserstack iOS device)
Ensure no "Open in Safari" links anywhere
Privacy nutrition labels match what your app collects (camera, push, photo library, contacts if any)
Privacy Policy + Terms must be reachable in-app (you have terms.html already)

## Phase 6: App Store submission 
Apple Developer Program — $99/year (probably already done if you're planning this).
App Store Connect — create app listing, screenshots, description.
Configure IAP products in App Store Connect with the price tiers (must match what RevenueCat expects).
Build the iOS binary — this is the only step requiring a Mac. Use EAS Build (~$30/mo) OR MacInCloud OR borrow a Mac.
Submit. Expect 1-3 rejections, address each, resubmit. Most common cited issue will be 4.2 — have your push/camera/IAP integration ready to point at as evidence of native functionality.

---

## Phase 0 — Confirmed Decisions (locked 2026-04-18)

**Decision 1 — Wrapper: Capacitor.** WebView wrapper of existing `frontend/` directory. Not React Native, not Swift.

**Decision 2 — Mobile web → App Store redirect.**
- iOS mobile browsers → `get-the-app.html` (App Store CTA).
- Android mobile browsers → `coming-soon-android.html` ("Coming soon" CTA).
- Exemptions (NOT redirected, stays on mobile web):
  - All `frontend/landingpage/*.html` pages (SEO, marketing, signin, signup, pricing, etc.)
  - The redirect target pages themselves (`get-the-app.html`, `coming-soon-android.html`)
- `frontend/admin/*` is NOT exempted — admin dashboard also redirects on mobile (Jackson's decision; admin is private + desktop-only for him).

**Decision 3 — Pricing: Apple Small Business Program tiers.**
- Apply for SBP on day 1 of App Store Connect setup (15% Apple cut vs 30%).
- Web prices stay the same. iOS prices are separate:

  | Tier | Web | iOS |
  |---|---|---|
  | HS Player | $10/mo | $11.99/mo |
  | Transfer Player | $10/mo | $11.99/mo |
  | Coach Starter | $20/mo | $24.99/mo |
  | Coach Pro | $50/mo | $59.99/mo |
  | Coach Elite | $100/mo | $119.99/mo |

- iOS app may only display iOS prices (Apple anti-steering rule; not using External Link Entitlement in v1).

**Decision 4 — Apple Developer Program:** already active. No action needed.

**Decision 5 — Mac access:** Jackson owns a Mac. Used only at (a) initial Xcode project generation via `npx cap add ios` in Phase 2, and (b) final archive + App Store Connect upload in Phase 6. Development on Windows otherwise.

**Decisions deferred to later phases:**
- External Link Entitlement (post-*Epic v. Apple*) — not pursued for v1, revisit after launch.
- Apple Sign In (Guideline 4.8) — not strictly required since no third-party social login exists; will decide in Phase 4.
- CLAUDE.md / lessons.md updates — will ask for permission when a stable iOS pattern exists (likely mid-Phase 2).

---

## Phase 1 — Notes (shipped 2026-04-18)

**What shipped:**
1. Mobile-web redirect IIFE prepended to `frontend/shared/api.js` (top of file, before the Toast system block).
2. Inline redirect `<script>` added to the `<head>` of `frontend/landingpage/index.html` — needed because `index.html` doesn't load `api.js`, so without it the root URL on mobile would show the splash instead of redirecting.
3. `frontend/landingpage/get-the-app.html` — iOS target page with App Store badge CTA.
4. `frontend/landingpage/coming-soon-android.html` — Android target page with "Continue on Desktop" CTA.

**Redirect exemption rules (do NOT redirect when any is true):**
- `window.Capacitor` exists (inside the iOS app WebView — future-proofed for Phase 2).
- UA is not iPhone/iPad/iPod AND not Android (desktop and all other devices).
- Path matches any exemption: `/landingpage/` anywhere in path, or path ends with `/get-the-app.html` or `/coming-soon-android.html`.

**Exemption scope decisions:**
- ALL `frontend/landingpage/*.html` pages stay on mobile web (signin, get-started, pricing, features, support, terms, privacy, forgot-password, coach-signup-request, index).
- Landing pages that stay on mobile web intentionally keep the Pricing link — those pages show **web pricing only** and are the correct surface to advertise web prices. Only the two new mobile-app-target pages (`get-the-app.html`, `coming-soon-android.html`) have Pricing removed from nav + footer.
- `frontend/admin/*` is NOT exempted — admin is desktop-only, and Jackson doesn't need it on mobile.
- The iOS app is exempted via `window.Capacitor` (not an explicit path allow-list) — this means EVERY page will render inside the iOS WebView once Phase 2 ships, including landing pages.

**Path prefix handling:**
The redirect resolves `/frontend` prefix dynamically: if the current path starts with `/frontend/` (Live Server dev) it prepends `/frontend` to the target; otherwise (EC2 production where paths are `/collegecoach/...`) it uses no prefix. Both `api.js` IIFE and the `index.html` inline script use this same logic.

**Redirect technique:**
`window.location.replace()` (NOT `.href =`) — prevents the pre-redirect URL from entering browser history, so the back button doesn't trap users in a redirect loop.

**Testing approach used (worked well, reuse in later phases):**
Since headless browser tools weren't available (no jsdom/puppeteer/playwright in the project), verification was done by:
1. `curl -A <UA>` with spoofed User-Agent strings — confirms static HTML + all referenced assets serve 200. Doesn't execute JS.
2. Node simulation of the redirect IIFE against a matrix of (UA, path, Capacitor) tuples — 12 scenarios for `api.js`, 5 scenarios for `index.html`. Catches every logic branch without needing a browser.
3. `node --check frontend/shared/api.js` — catches JS syntax errors in the IIFE before runtime.
4. User visual verification for rendering polish.

**Known Phase 1 gotcha:**
If a user has an existing auth session cookie and opens a deep app URL on mobile, they get redirected to `get-the-app.html` WITHOUT signing out. The session cookie persists. When they install the iOS app and open it, they'll still be signed in because the Capacitor WebView reads the same cookies from the same domain. This is the intended behavior but worth knowing for future debugging.

**Local dev gotcha surfaced during Phase 1 testing (see lessons.md #10):**
Login failed during verification because the Windows `postgresql-x64-18` service was running and grabbing port 5432 ahead of Docker. The backend silently connected to Windows Postgres (which has a different schema + no seed data) instead of the Docker container. Fix: stop the Windows service (admin PowerShell: `net stop postgresql-x64-18`). Symptom to watch for in future phases: backend seems to work but queries fail with "column X does not exist" even though `docker exec psql` shows the column is there.

**What Phase 1 did NOT touch (saved for later phases):**
- `frontend/shared/mobile-overrides.css` — unchanged. Still works as-is. Phase 2 scopes it under `.ios-app`.
- Stripe / IAP / payment flows — all unchanged (Phase 3).
- Backend routes, schema, migrations — all unchanged.
- `CLAUDE.md` / `lessons.md` — unchanged. Will request permission to document the `window.Capacitor` detection pattern once Phase 2 stabilizes it.

**If Phase 1 needs to be rolled back:**
Delete the IIFE at the top of `frontend/shared/api.js` (lines 1-35) AND the inline `<script>` block in `frontend/landingpage/index.html` `<head>` (the block after `sw-register.js`). The two new HTML pages can stay — they're harmless if never linked.