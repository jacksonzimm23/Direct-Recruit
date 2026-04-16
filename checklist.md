Small schools using AI to match to recruiting areas / hs pipelines
Big schools know who the big time recruits are , benefit more from transfer portal 


Local dev: Edit code → test on 127.0.0.1:5500 with backend on port 5000
Push to git: git add, git commit, git push origin main
Deploy: SSH into EC2 → cd ~/direct-recruit && git pull origin main → restart PM2 only if backend files changed

psql "host=direct-recruit-db.c6t02cia6f8p.us-east-1.rds.amazonaws.com user=dr_admin dbname=direct_recruit sslmode=require"

SELECT pg_size_pretty(pg_database_size('direct_recruit'));




Currently working on: 


- Github dependabot: security and quality, setup secturity policy, dependabot alerts, scans all dependencies and see if they have any vulerabilities 
- Code QL, scans codebase 
[x] Update profile doesn't have same validation endpoints as other updates, validate info and then send to database




Password: Test123!@#

Email	Role
hsplayer@test.com	High School Player
collegeplayer@test.com	College Player
transferplayer@test.com	Transfer Player
hscoach@test.com	High School Coach
collegecoach@test.com	College Coach
other@test.com	Other (Parent/Fan)



## Stripe Implementation Plan — Direct Recruit
### Phase 1: Stripe Foundation (Backend)
- [ ] Install `stripe` npm package in `/backend`
- [ ] Add Stripe env vars to `.env` (`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`)
- [ ] Create Stripe products & prices in Stripe Dashboard: Player Plan ($10/mo), Coach Starter ($20/mo), Coach Pro ($50/mo), Coach Elite ($100/mo)
- [ ] Add DB columns to `users` table: `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `subscription_tier`
- [ ] Create migration files (one in `backend/scripts/`, one in `backend/migrations/`)
- [ ] Create `backend/routes/payments.js` with: `POST /create-checkout-session`, `POST /webhook`, `GET /subscription-status`, `POST /cancel`
- [ ] Create local dev mock `backend/utils/local/stripe-local.js` (skips Stripe in development, auto-approves)
- [ ] Mount routes in `server.js` (webhook route needs `express.raw()` body parser, not JSON)
### Phase 2: Signup Flow — Players ($10/mo)
- [ ] After `authAPI.register()` in `hsplayer/profile-form.js` and `transferplayer/profile-form.js`, redirect to Stripe Checkout instead of immediately creating profile
- [ ] Create `frontend/hsplayer/payment-success.html` and `frontend/transferplayer/payment-success.html`
- [ ] On payment-success page: verify session with backend, create the profile, then redirect to `verify-email.html`
- [ ] Handle webhook `checkout.session.completed` — update user's Stripe fields in DB
### Phase 3: Signup Flow — College Coaches (tiered)
- [ ] Create tier selection step in `collegecoach/coach-profile-form.js` — show Starter/Pro/Elite picker before Stripe Checkout
- [ ] Create `frontend/collegecoach/payment-success.html`
- [ ] Pass selected tier's Stripe Price ID to the checkout session endpoint
- [ ] Store `subscription_tier` (starter/pro/elite) in DB on webhook confirmation
=
### Phase 4: Profile Type Switching + Stripe
- [ ] In `frontend/shared/settings.js` switch modal — if target type is paid, add payment step after Step 3 confirmation
- [ ] In `backend/routes/settings.js` POST endpoint — if switching FROM paid to free, cancel Stripe subscription
- [ ] If switching FROM paid TO paid (e.g., TRANSFER? hsplayer → collegecoach), cancel old subscription and create new checkout
- [ ] Handle edge case: switching between hsplayer ↔ transferplayer (same $10/mo plan, no payment change needed)
### Phase 5: Subscription Management in Settings
- [ ] Add "Subscription" section to all 6 `tabs/settings.html` pages
- [ ] Show current plan, next billing date, subscription status
- [ ] For college coaches: "Change Plan" button (upgrade/downgrade between tiers)
- [ ] "Cancel Subscription" button with confirmation modal
- [ ] Handle webhook events: `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- [ ] When subscription lapses/cancels: update `subscription_status` in DB, gate paid features
### Phase 6: Feature Gating (Full Platform Lock for Unpaid Users)
- [ ] Backend middleware to check `subscription_status === 'active'` on ALL `/api/*` routes for paid profile types (hsplayer, transferplayer, collegecoach). Only exempt: `/api/auth/me`, `/api/auth/logout`, `/api/payments/*`, `/api/settings/switch-profile/*`
- [ ] Create a "Subscription Required" paywall page (`frontend/shared/subscription-required.html`) — shown when an unpaid user tries to access any part of the platform
- [ ] Paywall page options: (1) "Subscribe Now" button → redirects to Stripe Checkout for their profile type, (2) "Switch Profile Type" button → redirects to Settings profile switch flow (can switch to a free type)
- [ ] Frontend auth-check: on every page load, if user is a paid profile type with `subscription_status !== 'active'`, redirect to the paywall page instead of loading the dashboard
- [ ] Gate AI RA + PI token caps to `subscription_tier` for collegecoach (Starter: 4M, Pro: 10M, Elite: 20M)
- [ ] Replace hardcoded `plan: 'Pro'` and `tokenCap: 10_000_000` in `AiAnalytics.getUsageByCoach()` with real tier lookup
- [ ] Handle `invoice.payment_failed` gracefully — show warning banner before full lock, give grace period

## Pre-Launch Checklist
### Critical
- [x] Add graceful shutdown handler (SIGTERM/SIGINT) to server.js
### High Priority
- [x] Expand Helmet security headers (HSTS, Content-Security-Policy)
- [x] Add Redis connection failure handling on startup
- [x] Move Socket.IO rate limiter from in-memory Map to Redis
### Medium Priority
- [x] Add request timeout to Express server
### Manual Verification
- [ ] End-to-end test on production (register → verify → profile → posts → messages → password reset → delete account)
- [ ] Verify EC2 .env has all required production variables
- [ ] Remove seed test accounts from production DB
- [ ] Add Privacy Policy & Terms of Service pages
- [ ] Set up S3 lifecycle policy for orphaned files

DIRECT RECRUIT - SECURITY & PRODUCTION READINESS CHECKLIST
===========================================================

[✓] 1. User data isolation
    - All routes use req.userId from JWT (can't be spoofed)
    - Write endpoints never accept user IDs from params/body
    - Read endpoints check ownership + privacy
    - TODO: Re-enable private profile checks on follower/following lists (follow.js, commented-out code)

[✓] 2. Input validation & sanitization
    - SQL injection protected (all parameterized queries via pg library)
    - Registration/profile creation validated with express-validator schemas
    - Length limits enforced: names (50), team/title (100), bio (1000), posts/messages (5000), comments (2000), board names (100)
    - HTML stripping via sanitizeBody middleware on all text-input routes (profile, posts, comments, messages, boards)
    - XSS fixed: escapeHtml() applied to first_name and profile_image in all 6 messages.js files
    - XSS fixed: escapeHtml() applied to boardName, class_year, position, and playerName in hsplayer + transferplayer my-profile.js

[✓] 3. CORS policy configured
    - Production whitelists directrecruit.net + www.directrecruit.net only

[✓] 4. Rate limiting on all endpoints
    - Global apiLimiter (2000 req/15min) on all /api/*
    - Stricter limiters on auth (200/15min), posts (20/hr), messages (30/min)

[✓] 5. Password reset codes expire
    - AWS Cognito handles 24hr code expiry + account lockout after failed attempts

[~] 6. Frontend error handling
    - Global window.onerror handler catches uncaught exceptions, logs them, and shows a toast
    - Global unhandledrejection handler catches async/await errors (filters out background network noise)
    - Toast notification system (showToast) added to api.js — auto-included on every page, no new script tags needed
    - Fixed 10 empty catch blocks across feed.js, settings.js, and search.js:
        - User-facing actions (feed load, comments, likes, unfollow, settings) now show toast + console.error
        - Background operations (avatar load, new post polling, role check) now log to console without toasting
    [ ] Skipped Sentry for now — the global handlers + toasts cover error visibility without adding cost or external dependencies. Can revisit later if you need remote error tracking in prod

[✓] 7. Database indexing
    - Well-covered: users (email, role, cognito_sub), posts (user_id, created_at), messages (conversation_id, created_at), follows (follower, following), GIN trigram indexes for fuzzy search, plus profile views, recruiting boards, and read status

[~] 8. Production logging
    - Winston structured logging replaces minimal console wrapper (JSON in prod, readable in dev)
    - Morgan logs every HTTP request (method, URL, status, response time) through Winston
    - Request IDs (X-Request-Id header) assigned to every request for tracing through logs
    - Log file persistence with daily rotation: app logs (14 day retention, 20MB max) + error-only logs (30 day retention)
    - Database errors logged with query context (query text truncated, no user data exposed)
    [ ] Skipped CloudWatch for now — file-based logging on EC2 is free and sufficient at current scale. Can add CloudWatch later if you need centralized log search or cross-service aggregation

[~] 9. Alerting & monitoring
    - /health endpoint now verifies DB + Redis connectivity (returns 200 "ok" or 503 "degraded" with per-service status)
    [ ] Skipped Sentry — free tier is 5K errors/month, paid after. Global frontend error handlers + Winston logging cover error visibility for now
    [ ] Skipped CloudWatch — basic EC2 metrics are free but alarms cost $3-10/month. Can add later when traffic justifies it
    [ ] Skipped alert rules and notification channels — these depend on Sentry/CloudWatch which were skipped. Revisit when adding a paid monitoring service

[—] 10. Rollback capability
    - Not needed at current scale — single developer, manual deploy, git revert + pm2 restart takes under a minute
    - Revisit when: adding team members, increasing deploy frequency, or onboarding paying users


# Direct Recruit — Launch Checklist

## CRITICAL (Must fix before launch)

[~] Security hardening
    - /api/coaches/college-coach now requires authMiddleware (was publicly accessible)
    - Password reset rate limited to 3 attempts/hour per email (on top of existing IP-based authLimiter)
    - Email/username availability checks limited to 30/15min per IP (was using general 2000/15min apiLimiter)
    - Offers validated: collegeName (150 char), division (20 char) + HTML stripping via sanitizeBody
    - Highlights validated: title (200 char), hudl_link (500 char) + HTML stripping via sanitizeBody
    - Socket.IO rate limited: 30 messages/min, 60 typing events/min per connection (silently drops excess)
    [ ]  Skipped CSRF tokens — SameSite cookie policy already mitigates CSRF. Adding tokens would require changes to 40+ frontend files for minimal additional protection

[✓] Data Integrity
    - S3 files cleaned up on account deletion: profile images, highlight videos, and all post media deleted before DB cascade
    - S3 files cleaned up on post deletion: media_urls array files deleted from S3 after soft-delete
    - Both use non-blocking cleanup (account/post deletion succeeds even if S3 cleanup partially fails)
    - Division migration script created (fix-division-values.sql): FBS → D1 FBS, FCS → D1 FCS across player + coach profiles
    - NOTE: Run the migration on prod after deploying: psql -f backend/scripts/fix-division-values.sql

[✓] Frontend cleanup
    - Removed all 8 console.log statements from frontend (service-worker.js + sw-register.js) — zero remain. All 617 console.error statements preserved (intentional error logging)
    - Removed placeholder "Search functionality will be connected..." alerts from all 6 mainpage files
    - Deleted empty 0-byte file frontend/hscoach/tabs/Coach

---

## HIGH (Should fix before launch)

[—] Mobile
    - mobile-overrides.css not needed on remaining pages — already display correctly on mobile without it
    - Revisit only if specific mobile layout issues are reported on landing, create-profile, verify-email, or view-profile pages

[✓] Functionality
    - Socket.IO reconnection — NOT NEEDED. Frontend uses HTTP polling (5s intervals), not Socket.IO. No reconnection issue exists
    - Typing indicator cleanup — NOT NEEDED. Backend has typing events defined but frontend doesn't use Socket.IO, so no typing indicators are active
    - Notification cleanup on post deletion — FIXED. Added Notification.deleteByEntityId() method and call it when posts are deleted to remove orphaned like/comment/share notifications
    - Offer notifications — Intentionally not implemented (feature decision, not a bug). Can add later if wanted

[✓] Backend
    - Centralized API_BASE URL — removed duplicated localhost:5000 detection from 8 files (5 verify-email, forgot-password, auth, settings). All now use shared API_BASE_URL from api.js

---

[~] MEDIUM (Recommended before launch)

[✓] 404/error pages
    - Created branded 404.html and 500.html matching your site design
    - Browser requests get the HTML page, API requests still get JSON
    
[ ] Privacy policy & terms of service (MANUAL — needs legal content)
    - Get legal text (lawyer, template service, or generator like termly.io/privacypolicies.com)
    - Once you have the content, I can build the pages for you

[ ] End-to-end test on production (MANUAL — run through these after deploying)
    1. Register a new account with a real email
    2. Verify email with the code
    3. Create a profile (player, coach, or other)
    4. Make a post with an image
    5. Send a message to another user
    6. Test password reset flow
    7. Test profile privacy toggle
    8. Test account deletion

[ ] Verify EC2 environment variables (MANUAL — SSH in and check)
    ssh -i "C:\Users\jacks\Downloads\direct-recruit-key.pem" ec2-user@98.82.239.221
    cat ~/direct-recruit/.env
    # Confirm ALL of these exist:
    - NODE_ENV=production
    - PORT=5000
    - JWT_SECRET
    - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
    - AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
    - AWS_S3_BUCKET
    - AWS_COGNITO_USER_POOL_ID, AWS_COGNITO_CLIENT_ID, AWS_COGNITO_CLIENT_SECRET
    - SES_FROM_EMAIL
    - REDIS_HOST, REDIS_PORT (or REDIS_URL)

[ ] Remove seed test accounts from production (MANUAL — run on prod DB)
    DELETE FROM users WHERE email IN (
      'player@test.com', 'coach@test.com', 'other@test.com',
      'player2@test.com', 'coach2@test.com', 'other2@test.com'
    );
    # CASCADE will clean up profiles, posts, messages, etc.

[ ] S3 lifecycle policy (MANUAL — AWS Console)
    1. Go to S3 → direct-recruit-profiles → Management → Lifecycle rules
    2. Create rule: "cleanup-orphaned-files"
    3. Apply to all objects
    4. Expiration: 90 days for objects with no tags
    5. This is a safety net — catches anything the code-level cleanup missed

