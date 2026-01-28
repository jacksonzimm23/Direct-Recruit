# CLAUDE.md - Direct Recruit Project Context

> **Rule:** If you identify something important or necessary that should be added to this file, ask the user for permission before making any changes to CLAUDE.md.

---

## Project Overview

Direct Recruit is a football recruiting platform connecting high school players, college players, transfer players, high school coaches, college coaches, and other users (parents, fans, etc.). It is a traditional multi-page application (MPA) — each page is a full HTML document with its own CSS/JS, no SPA framework.

---

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS, multi-page architecture (no React/Vue)
- **Backend:** Node.js + Express.js
- **Database:** PostgreSQL 14+ on AWS RDS
- **Real-time:** Socket.IO for messaging and notifications
- **Auth:** AWS Cognito + JWT stored in HTTPOnly cookies
- **File Storage:** AWS S3 with presigned URLs
- **Email:** AWS SES for transactional emails
- **Caching/Rate Limiting:** Redis

---

## Directory Structure

```
direct-recruit/
├── backend/
│   ├── server.js                 # Express entry point (port 5000)
│   ├── socket.js                 # Socket.IO setup and events
│   ├── config/
│   │   ├── database.js           # PostgreSQL connection pool (pg)
│   │   └── redis.js              # Redis client
│   ├── middleware/
│   │   ├── auth.js               # JWT verification, requireRole, validateUUID
│   │   ├── rateLimit.js          # Redis-backed rate limiting
│   │   ├── upload.js             # Multer config for file uploads
│   │   └── validation.js         # Express-validator schemas
│   ├── models/                   # Class-based models with static methods (no ORM)
│   ├── routes/                   # 13 route files mounted at /api/*
│   ├── utils/
│   │   ├── s3.js                 # S3 upload, delete, presigned URL generation
│   │   ├── cognito.js            # Cognito sign up/in, password flows, admin ops
│   │   ├── email.js              # SES email templates and sending
│   │   └── jwt.js                # JWT token generation
│   └── scripts/                  # SQL migrations
├── frontend/
│   ├── landingpage/              # Public landing pages
│   ├── shared/                   # Shared JS/CSS used by all roles
│   │   ├── api.js                # Central API client (THE shared utility)
│   │   ├── feed.js / feed.css    # Feed manager class
│   │   ├── search.js / search.css
│   │   ├── suggested-connections.js
│   │   ├── settings.js / settings.css
│   │   ├── image-cropper.js
│   │   ├── mobile-header.js
│   │   ├── mobile-overrides.css
│   │   ├── auth-check.js
│   │   ├── view-profile.html/js  # Generic profile viewer
│   │   └── tabs-scroll-arrows.js
│   ├── hsplayer/                 # High school player dashboard
│   ├── collegeplayer/            # College player dashboard
│   ├── transferplayer/           # Transfer player dashboard
│   ├── hscoach/                  # High school coach dashboard
│   ├── collegecoach/             # College coach dashboard
│   └── other/                    # Other users (parents, fans)
```

Each role folder follows the same structure:
```
{role}/
├── mainpage-{role}.html/js/css   # Dashboard with feed, sidebar nav
├── create-profile.html           # Profile creation form
├── profile-form.js/css
├── sidebar-nav.js / sidebar-footer.js
└── tabs/
    ├── my-profile.html/js/css
    ├── discover-players.html (or discover-coaches.html)
    ├── messages.html/js/css
    ├── notifications.html/js/css
    ├── post-view.html
    └── settings.html
```

---

## AWS Integration

### 1. AWS S3 — File Storage

**Config:** `backend/utils/s3.js`
**Bucket:** `direct-recruit-profiles`

**S3 Key Structure:**
```
profiles/{userId}/avatar-{timestamp}.{ext}              # Profile images
highlights/{userId}/video-{timestamp}.{ext}              # Highlight videos
post-media/{userId}/{type}-{timestamp}-{random}.{ext}    # Post media (images/videos)
```

**Presigned URL Expiry:**
- Images: 1 hour
- Videos: 6 hours

**Upload Limits:**
- Profile images: 5MB max, images only
- Post media: 200MB max, up to 4 files (images + videos)
- Highlight videos: 500MB max (MP4, MOV, AVI, WebM, M4V)

**Key Functions:** `uploadToS3()`, `getSignedS3Url()`, `getSignedVideoUrl()`, `deleteFromS3()`, `generateProfileImageKey()`, `generateHighlightVideoKey()`, `generatePostMediaKey()`

**Media Flow:** Frontend uploads via multer (memory storage) → backend generates S3 key → uploads to S3 → stores S3 key in database (NOT the full URL) → on retrieval, generates presigned URL from stored key.

**Routes using S3 signed URLs:** upload, highlights, posts, profile, notifications, messages, follow, recruiting-board, coaches

### 2. AWS Cognito — Authentication

**Config:** `backend/utils/cognito.js`

**Handles:** User registration, sign in (USER_PASSWORD_AUTH), email verification codes, forgot/reset password, password change, global sign out, admin user management, email change.

**Auth Flow:** Cognito auth → JWT generated server-side → stored as HTTPOnly cookie (secure in prod, sameSite strict/lax) → middleware reads cookie on each request → 7-day expiry.

**Key Functions:** `signUp()`, `confirmSignUp()`, `signIn()`, `forgotPassword()`, `confirmForgotPassword()`, `changePassword()`, `globalSignOut()`, `adminCreateUser()`, `adminDeleteUser()`, `adminUpdateUserEmail()`

### 3. AWS SES — Email

**Config:** `backend/utils/email.js`

**Email Types:**
- Email change verification (6-digit code, 24h expiry)
- Email change confirmation
- Password change confirmation (security notification)
- Password reset verification (6-digit code, 15min expiry)
- Account deletion confirmation

All emails use branded HTML templates with plain text fallback.

### 4. AWS RDS — PostgreSQL Database

**Config:** `backend/config/database.js`

**Connection:** `pg` library with connection pooling (max 20, idle timeout 30s, connect timeout 10s). SSL enabled for non-localhost. UTC timezone enforced.

**Schema:** 20+ tables using UUID primary keys, enums for types, JSONB for flexible data, CASCADE deletes, indexes on frequently queried columns. Managed via SQL migration scripts in `backend/scripts/`.

### Environment Variables Required

```
AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (us-east-1)
AWS_S3_BUCKET
AWS_COGNITO_USER_POOL_ID, AWS_COGNITO_CLIENT_ID, AWS_COGNITO_CLIENT_SECRET
DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
SES_FROM_EMAIL
JWT_SECRET
REDIS_URL
```

---

## 10 Repetitive Patterns

These patterns are duplicated across 6 role folders. When modifying any of them, **apply the same change to all 6 role folders** unless the change is role-specific.

The 6 role folders: `hsplayer`, `collegeplayer`, `transferplayer`, `hscoach`, `collegecoach`, `other`

---

### Pattern 1: Cross-Folder Profile Navigation

**What:** Determines which role folder to navigate to when viewing any user's profile, based on their `role`, `is_transfer_player`, and `college_division`.

**Logic:**
```
if role === 'player':
    if is_transfer_player → transferplayer/
    else if college_division in ['FBS','FCS','D2','D3','NAIA','NJCAA'] → collegeplayer/
    else → hsplayer/
if role === 'coach':
    if college_division exists → collegecoach/
    else → hscoach/
else → other/
```

**Duplicated in (20+ files):**
- All 6 `mainpage-*.js` files
- All 6 `tabs/messages.js` files
- All 6 `tabs/notifications.js` files
- `frontend/shared/search.js`
- All `my-profile.js` files

**When modifying:** Any change to navigation logic must be replicated in ALL of these files. The logic is identical everywhere — only the file it lives in differs.

---

### Pattern 2: Sidebar Footer User Info Population

**What:** Fetches `/api/auth/me` and populates the sidebar footer with the user's name, avatar, and role-specific subtitle.

**Subtitle format varies by role (with color):**
- HS Player: `Position • Height • Weight • GradYear` — color: `#1282a2` (cerulean)
- College Player: `Position • Team • Division` — color: `#1282a2` (cerulean)
- Transfer Player: `Position • Height • Weight • YOE: N year(s)` — color: `#b91c1c` (red)
- HS Coach: `Team, State` (comma-separated) — color: `#ff6b35` (orange)
- College Coach: `Team, State • Division` — color: `#ff6b35` (orange)
- Other: Just subheader text — color: `#1282a2` (cerulean)

**Duplicated in:**
- All 6 `mainpage-*.js` (`updateSidebarFooter` function, ~100 lines each)
- All 6 `tabs/messages.js` (`loadCurrentUser` function, ~70 lines each)

**When modifying:** Update the sidebar footer rendering in both the mainpage file AND the messages file for all applicable roles.

---

### Pattern 3: Unread Badge Updates (Messages & Notifications)

**What:** Polls the backend every 30 seconds to fetch unread message/notification counts and update badge numbers in the sidebar nav.

**Logic:** Fetch count → if > 0, show badge with number (cap at "99+") → if 0, hide badge.

**DOM target:** `.nav-item[href*="messages"] .notification-badge` and `.nav-item[href*="notifications"] .notification-badge`

**Duplicated in:**
- All 6 `mainpage-*.js` (`updateUnreadMessagesBadge`, `updateUnreadNotificationsBadge`)
- All 6 `tabs/messages.js` (`updateUnreadMessagesBadge`)
- All 6 `tabs/notifications.js` (`updateNotificationCounts`)

**When modifying:** The logic is identical everywhere. Change it in all files.

---

### Pattern 4: Logout Modal

**What:** Creates a modal overlay with "Are you sure you want to log out?" confirmation. On confirm: calls `API.auth.logout()`, clears localStorage, redirects to landing page.

**Duplicated in:** All 6 `mainpage-*.js` (`showLogoutModal` function, ~60 identical lines each)

**When modifying:** Same HTML structure, same event handlers, same API call everywhere.

---

### Pattern 5: User Dropdown Menu (Profile / Settings / Logout)

**What:** Dropdown menu triggered from the sidebar footer avatar. Contains links to My Profile, Settings, and Logout. Uses path detection (`isInTabsFolder`) to determine relative navigation paths.

**Duplicated in:** All 6 `mainpage-*.js` (~80 lines each, including SVG icons)

**When modifying:** Identical across all roles. If adding a new menu item, add it in all 6 files.

---

### Pattern 6: Mobile Sidebar

**What:** Mobile hamburger menu that opens a sidebar overlay. Handles opening/closing, scroll locking on body, profile pic click navigation, logout button, and syncing user info from the desktop sidebar.

**Duplicated in:** All 6 `mainpage-*.js` (`initMobileSidebar` function, ~60-80 lines each)

**Variation:** Coach files cache profile data in localStorage; player files may not. Otherwise ~95% identical.

---

### Pattern 7: Mobile Post Modal

**What:** Full post creation modal for mobile with media upload, file preview, emoji support, and visual viewport keyboard handling. Supports up to 4 media files (200MB video / 10MB image limit).

**Duplicated in:** All 6 `mainpage-*.js` (`initMobilePostModal` function, ~240 identical lines each)

**When modifying:** This is the largest duplicated block. Changes must go in all 6 files. The logic is 100% identical.

---

### Pattern 8: Sidebar Toggle & Persistence

**What:** Toggle buttons for showing/hiding left and right sidebars. State persisted to localStorage and restored on page load.

**localStorage keys:**
- Players: `playerSidebarHidden`, `playerRightSidebarHidden`
- Coaches: `coachSidebarHidden`, `coachRightSidebarHidden`

**Duplicated in:** All 6 `mainpage-*.js` (~40 lines each)

**Variation:** Only the localStorage key names differ between players and coaches.

---

### Pattern 9: Player/Coach Type Verification & Redirect

**What:** On page load, fetches the user's profile and checks if they're on the correct role page. If not, redirects them to the correct folder. Skips redirect when `?username=` param is present (viewing someone else's profile).

**Duplicated in:** All 6 `mainpage-*.js` (`verifyPlayerType` or `verifyCoachType` function)

**Variation:** Each file checks different conditions specific to its role:
- `hsplayer/` redirects college and transfer players away
- `collegeplayer/` redirects HS and transfer players away
- `transferplayer/` redirects non-transfer players away
- etc.

---

### Pattern 10: API Request Wrapper (SHARED)

**What:** Centralized API client with fetch wrapper, credentials handling, and typed sub-APIs for all backend endpoints.

**Location:** `frontend/shared/api.js` (this IS properly shared — the only one of the 10)

**Sub-APIs:** `authAPI`, `profileAPI`, `followAPI`, `postsAPI`, `messagesAPI`, `uploadAPI`, `notificationsAPI`, `highlightsAPI`, `offersAPI`, `statsAPI`, `coachesAPI`, `recruitingBoardAPI`, `settingsAPI`

**Helpers:** `getUser()`, `setUser()`, `clearAuth()`, `isAuthenticated()`

**When modifying:** Only one file to change. All roles import from `../shared/api.js`.

---

## Socket.IO Events

**Server config:** `backend/socket.js` — authenticates via JWT cookie, users join personal room + conversation rooms.

**Events:**
- `join_conversation` / `leave_conversation` — room management
- `typing_start` / `typing_stop` — typing indicators
- `send_message` / `new_message` — real-time messaging
- Notifications emitted from route handlers via `req.app.get('io')`

---

## Backend Routes Summary

| Route File | Prefix | Purpose |
|---|---|---|
| auth.js | /api/auth | Registration, login, logout, verify email, password reset, /me |
| profile.js | /api/profile | CRUD for player/coach/other profiles, search, profile stats |
| follow.js | /api/follow | Follow/unfollow, followers/following lists, relationship checks |
| posts.js | /api/posts | CRUD posts, feed, likes, comments, shares, saves, pins |
| messages.js | /api/messages | Conversations, send/read messages |
| upload.js | /api/upload | Profile image + post media uploads to S3 |
| highlights.js | /api/highlights | Player highlight video management |
| offers.js | /api/offers | Player offers CRUD |
| stats.js | /api/stats | Player game statistics |
| coaches.js | /api/coaches | Coach search/discovery |
| notifications.js | /api/notifications | Get/mark read/delete notifications |
| recruiting-board.js | /api/recruiting-board | Coach recruiting board management |
| settings.js | /api/settings | Account settings, privacy, email/password changes, delete account |

---

## Key Conventions

- **Database keys, not URLs:** S3 keys are stored in the database. Presigned URLs are generated at read time.
- **UUID primary keys** throughout all tables.
- **No ORM:** Models use raw SQL via `pg` pool with class-based static methods.
- **Auth middleware:** `authMiddleware` on all protected routes, `requireRole()` for role-specific endpoints.
- **CSS loading order:** `landingpage/styles.css` → role-specific CSS → shared component CSS → `mobile-overrides.css`
- **Tab pages are full HTML documents**, not components. Navigation causes full page reloads.
