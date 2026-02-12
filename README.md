# Direct Recruit

A football recruiting platform connecting high school players, college players, transfer portal players, high school coaches, college coaches, and other users (parents, fans, etc.). Built as a traditional multi-page application (MPA) with a Node.js backend and vanilla frontend.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML / CSS / JavaScript (multi-page architecture, no SPA framework) |
| **Backend** | Node.js + Express.js |
| **Database** | PostgreSQL 14+ (hosted on AWS RDS) |
| **Real-time** | Socket.IO (messaging and notifications) |
| **Authentication** | AWS Cognito (identity) + JWT (session, HTTPOnly cookies) |
| **File Storage** | AWS S3 (presigned URLs for secure access) |
| **Email** | AWS SES (transactional emails with branded templates) |
| **Caching / Rate Limiting** | Redis |
| **Process Manager** | pm2 (production) |
| **Hosting** | AWS EC2 (Amazon Linux) |
| **Mobile (WIP)** | Capacitor (iOS wrapper around the web app) |

### Backend Dependencies

```
express, socket.io, pg, jsonwebtoken, cookie-parser, cors, helmet,
multer, dotenv, express-validator, express-rate-limit, rate-limit-redis,
redis, bcrypt, @aws-sdk/client-s3, @aws-sdk/s3-request-presigner,
@aws-sdk/client-cognito-identity-provider, @aws-sdk/client-ses
```

---

## Directory Structure

```
direct-recruit/
├── backend/
│   ├── server.js                 # Express entry point (port 5000)
│   ├── socket.js                 # Socket.IO setup and event handlers
│   ├── config/
│   │   ├── database.js           # PostgreSQL connection pool (pg)
│   │   └── redis.js              # Redis client
│   ├── middleware/
│   │   ├── auth.js               # JWT verification, requireRole(), validateUUID()
│   │   ├── rateLimit.js          # Redis-backed rate limiting
│   │   ├── upload.js             # Multer config for file uploads (memory storage)
│   │   └── validation.js         # Express-validator schemas
│   ├── models/                   # Class-based models with static methods (raw SQL, no ORM)
│   ├── routes/                   # 13 route files mounted at /api/*
│   ├── utils/
│   │   ├── s3.js                 # S3 upload, delete, presigned URL generation
│   │   ├── cognito.js            # Cognito sign up/in, password flows, admin ops
│   │   ├── email.js              # SES email templates and sending
│   │   └── jwt.js                # JWT token generation
│   └── scripts/                  # SQL migration scripts and data fixups
│
├── frontend/
│   ├── landingpage/              # Public landing pages (pre-auth)
│   ├── shared/                   # Shared JS/CSS used across all roles
│   │   ├── api.js                # Centralized API client (fetch wrapper)
│   │   ├── feed.js / feed.css    # Feed manager class
│   │   ├── search.js / search.css
│   │   ├── suggested-connections.js
│   │   ├── settings.js / settings.css
│   │   ├── image-cropper.js
│   │   ├── mobile-header.js
│   │   ├── mobile-overrides.css
│   │   ├── auth-check.js         # Auth guard (redirects unauthenticated users)
│   │   ├── view-profile.html/js  # Generic profile viewer
│   │   └── tabs-scroll-arrows.js
│   ├── hsplayer/                 # High school player dashboard
│   ├── collegeplayer/            # College player dashboard
│   ├── transferplayer/           # Transfer portal player dashboard
│   ├── hscoach/                  # High school coach dashboard
│   ├── collegecoach/             # College coach dashboard
│   └── other/                    # Other users (parents, fans, etc.)
```

### Role Folder Structure

Each of the 6 role folders follows the same pattern:

```
{role}/
├── mainpage-{role}.html/js/css   # Dashboard with feed, sidebar nav, post creation
├── create-profile.html           # Profile creation form
├── profile-form.js/css           # Profile form logic and styling
├── sidebar-nav.js                # Sidebar navigation
├── sidebar-footer.js             # Sidebar footer (user info, dropdown)
└── tabs/
    ├── my-profile.html/js/css    # User's own profile page
    ├── discover-players.html     # Player discovery (or discover-coaches for coaches)
    ├── messages.html/js/css      # Messaging interface
    ├── notifications.html/js/css # Notifications feed
    ├── post-view.html            # Single post view
    └── settings.html             # Account settings
```

---

## Architecture Overview

### Frontend

This is a **multi-page application** — each page is a full HTML document with its own CSS and JS files. Navigation between pages causes full page reloads (no client-side routing).

There are **6 role-based dashboards**, one per user type. Each role folder contains its own copy of the dashboard, profile, messages, notifications, and settings pages. While the structure is identical across roles, the content and logic vary slightly based on role-specific data (e.g., player stats vs. coach credentials).

**Shared utilities** live in `frontend/shared/`. The most important is `api.js`, which is a centralized fetch wrapper that all role folders import. It provides typed sub-API objects:

```
API.auth, API.profile, API.follow, API.posts, API.messages,
API.upload, API.notifications, API.highlights, API.offers,
API.stats, API.coaches, API.recruitingBoard, API.settings
```

**CSS loading order:** `landingpage/styles.css` -> role-specific CSS -> shared component CSS -> `mobile-overrides.css`

### Backend

Standard Express.js REST API running on port 5000. All protected routes use `authMiddleware` (JWT from HTTPOnly cookie). Role-specific endpoints use `requireRole()`.

**Models** are class-based with static methods executing raw SQL via the `pg` connection pool. There is no ORM.

**Models:**
`User`, `PlayerProfile`, `CoachProfile`, `OtherProfile`, `Post`, `Follow`, `Message`, `Notification`, `PlayerOffer`, `PlayerGameStats`, `RecruitingBoard`, `ProfileView`, `PendingEmailChange`, `PendingPasswordReset`

### Authentication Flow

1. User registers/signs in via AWS Cognito (`USER_PASSWORD_AUTH` flow)
2. Backend generates a JWT server-side after Cognito authentication
3. JWT is stored as an HTTPOnly cookie (secure in prod, sameSite strict/lax)
4. `authMiddleware` reads the cookie on each request to verify identity
5. Token expiry: 7 days

### File Storage (S3)

S3 keys (not full URLs) are stored in the database. Presigned URLs are generated at read time.

**S3 key structure:**
```
profiles/{userId}/avatar-{timestamp}.{ext}
highlights/{userId}/video-{timestamp}.{ext}
post-media/{userId}/{type}-{timestamp}-{random}.{ext}
```

**Upload limits:**
- Profile images: 5 MB (images only)
- Post media: 200 MB per file, up to 4 files (images + videos)
- Highlight videos: 500 MB (MP4, MOV, AVI, WebM, M4V)

**Presigned URL expiry:** Images 1 hour, Videos 6 hours

### Real-time (Socket.IO)

Configured in `backend/socket.js`. Authenticates via JWT cookie on connection. Users join a personal room and conversation-specific rooms.

**Events:**
- `join_conversation` / `leave_conversation` — room management
- `typing_start` / `typing_stop` — typing indicators
- `send_message` / `new_message` — real-time message delivery
- Notifications are emitted from route handlers via `req.app.get('io')`

### Email (SES)

Branded HTML templates with plain text fallback for:
- Email change verification (6-digit code, 24h expiry)
- Email change confirmation
- Password change confirmation (security notification)
- Password reset verification (6-digit code, 15min expiry)
- Account deletion confirmation

---

## API Routes

| Route File | Prefix | Purpose |
|---|---|---|
| `auth.js` | `/api/auth` | Registration, login, logout, email verification, password reset, `/me` |
| `profile.js` | `/api/profile` | CRUD for player/coach/other profiles, search, profile stats |
| `follow.js` | `/api/follow` | Follow/unfollow, followers/following lists, relationship checks |
| `posts.js` | `/api/posts` | CRUD posts, feed, likes, comments, shares, saves, pins |
| `messages.js` | `/api/messages` | Conversations, send/read messages, unread counts |
| `upload.js` | `/api/upload` | Profile image and post media uploads to S3 |
| `highlights.js` | `/api/highlights` | Player highlight video management |
| `offers.js` | `/api/offers` | Player offers CRUD |
| `stats.js` | `/api/stats` | Player game statistics |
| `coaches.js` | `/api/coaches` | Coach search/discovery |
| `notifications.js` | `/api/notifications` | Get/mark read/delete notifications |
| `recruiting-board.js` | `/api/recruiting-board` | Coach recruiting board management |
| `settings.js` | `/api/settings` | Account settings, privacy, email/password changes, delete account |

---

## Database Schema

PostgreSQL with UUID primary keys, enums, JSONB for flexible data, CASCADE deletes, and performance indexes.

### Core Tables

| Table | Purpose |
|---|---|
| `users` | User accounts (email, role, cognito_sub, active/verified flags) |
| `player_profiles` | Player-specific profile data (position, height, weight, GPA, etc.) |
| `coach_profiles` | Coach-specific profile data (team, division, position title) |
| `other_profiles` | Profiles for non-player, non-coach users |
| `follows` | Follower/following relationships (self-follow prevented via CHECK) |
| `posts` | User posts with optional media |
| `post_likes` | Post like records (unique per user per post) |
| `post_comments` | Post comments |
| `conversations` | Messaging conversations |
| `conversation_participants` | Users in each conversation (with last_read_at tracking) |
| `messages` | Individual messages within conversations |
| `player_highlights` | Highlight video records (season/game type) |
| `player_stats` | Game statistics (JSONB for position-specific flexibility) |
| `player_offers` | Recruiting offers received by players |
| `recruiting_boards` | Coach recruiting boards for tracking players |
| `profile_views` | Profile view tracking |
| `notifications` | User notification records |
| `pending_email_changes` | Email change verification codes (24h expiry) |
| `pending_password_resets` | Password reset codes (15min expiry) |

Schema is managed via SQL migration scripts in `backend/scripts/`. The base schema is in `backend/scripts/schema.sql` with incremental migrations as separate `.sql` and `.js` files.

---

## User Roles & Navigation

Six user types, each with their own frontend folder:

| Role | Folder | Description |
|---|---|---|
| High School Player | `frontend/hsplayer/` | HS athletes building recruiting profiles |
| College Player | `frontend/collegeplayer/` | Active college athletes (FBS, FCS, D2, D3, NAIA, NJCAA) |
| Transfer Player | `frontend/transferplayer/` | Players in the transfer portal |
| High School Coach | `frontend/hscoach/` | HS coaching staff |
| College Coach | `frontend/collegecoach/` | College coaching staff |
| Other | `frontend/other/` | Parents, fans, and other users |

### Cross-Role Profile Navigation Logic

When navigating to any user's profile, the frontend determines the correct role folder:

```
if role === 'player':
    if is_transfer_player       -> /transferplayer/
    if college_division exists  -> /collegeplayer/
    else                        -> /hsplayer/
if role === 'coach':
    if college_division exists  -> /collegecoach/
    else                        -> /hscoach/
else                            -> /other/
```

This logic is duplicated across 20+ frontend files (all mainpage, messages, notifications, search, and profile files).

---

## Duplicated Frontend Patterns

A significant portion of frontend logic is duplicated across the 6 role folders. When modifying any of these patterns, the same change must be applied to all 6 folders unless it is role-specific.

| Pattern | What It Does | Duplicated In |
|---|---|---|
| Cross-folder profile navigation | Determines which role folder to navigate to for a user's profile | 20+ files (mainpage, messages, notifications, search, profile) |
| Sidebar footer user info | Fetches `/api/auth/me` and populates sidebar with name, avatar, role subtitle | All mainpage + messages files |
| Unread badge updates | Polls every 30s for unread message/notification counts | All mainpage + messages + notifications files |
| Logout modal | "Are you sure?" confirmation dialog | All mainpage files |
| User dropdown menu | Profile / Settings / Logout dropdown from sidebar avatar | All mainpage files |
| Mobile sidebar | Hamburger menu overlay for mobile | All mainpage files |
| Mobile post modal | Full post creation modal with media upload for mobile | All mainpage files (~240 identical lines each) |
| Sidebar toggle & persistence | Show/hide sidebars with localStorage persistence | All mainpage files |
| Role verification & redirect | Checks if user is on the correct role page, redirects if not | All mainpage files |

The only properly shared utility is `frontend/shared/api.js` — the API client.

---

## Environment Variables

The `.env` file is required in the project root (gitignored). Required variables:

```
NODE_ENV                        # "development" or "production"

# AWS General
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION                      # us-east-1

# S3
AWS_S3_BUCKET

# Cognito
AWS_COGNITO_USER_POOL_ID
AWS_COGNITO_CLIENT_ID
AWS_COGNITO_CLIENT_SECRET

# PostgreSQL (RDS)
DB_HOST
DB_PORT
DB_NAME
DB_USER
DB_PASSWORD

# Email
SES_FROM_EMAIL

# Auth
JWT_SECRET

# Redis
REDIS_URL
```

---

## Local Development

### Prerequisites

- Node.js (LTS)
- PostgreSQL 14+ (or access to the RDS instance)
- Redis
- A `.env` file with all required variables

### Running Locally

1. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```

2. Start the backend server:
   ```bash
   node server.js
   ```
   The API runs on `http://localhost:5000`.

3. Serve the frontend via VS Code Live Server (or any static file server). The frontend makes API calls to the backend at port 5000.

4. Local `.env` should have `NODE_ENV=development`. The production EC2 instance has its own independent `.env` with `NODE_ENV=production`.

### Running Migrations

```bash
cd backend
node scripts/migrate.js
```

Individual migration scripts can be run directly:
```bash
node scripts/run-migration.js
```

---

## Deployment

The app is deployed on an AWS EC2 instance running Amazon Linux.

### Deployment Workflow

1. Make changes locally and test
2. Commit and push to GitHub (`main` branch)
3. SSH into the EC2 instance
4. Pull latest changes: `cd ~/direct-recruit && git pull origin main`
5. If backend files changed, restart: `pm2 restart all`
6. Frontend changes (HTML/CSS/JS) are served as static files and take effect immediately

### Production Notes

- The backend runs under pm2 for process management and automatic restarts
- Frontend files are served as static assets — no build step required
- Local and production `.env` files are independent (both gitignored)
- If `git pull` fails on EC2 due to local changes: `git stash && git pull origin main`

---

## Key Conventions

- **S3 keys in DB, not URLs** — presigned URLs are generated at read time, never stored
- **UUID primary keys** on all tables
- **No ORM** — raw SQL via `pg` pool, class-based models with static methods
- **Auth middleware on all protected routes** — `authMiddleware` verifies JWT, `requireRole()` for role-specific access
- **Tab pages are full HTML documents** — navigation causes full page reloads
- **No build step** — frontend is plain HTML/CSS/JS, served as-is
- **Database connection** — pooled (max 20 connections, idle timeout 30s, connect timeout 10s, SSL for non-localhost, UTC timezone)
