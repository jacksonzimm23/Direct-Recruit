# Direct Recruit — Local Development Setup

This guide sets up a fully functional local environment that runs independently from our AWS production stack. No AWS services are called, no costs are incurred. The production deployment on EC2 is completely unaffected.

---

## Prerequisites

You should already have the `direct-recruit` repo cloned. You'll need:

- **Docker Desktop** — [download here](https://www.docker.com/products/docker-desktop/)
- **Node.js 18+** — [download here](https://nodejs.org/)
- **VS Code** with the **Live Server** extension installed

---

## Step 1: Install Backend Dependencies

```bash
cd direct-recruit/backend
npm install
```

---

## Step 2: Create Your `.env` File

Create a file at `backend/.env` with the following contents:

```
NODE_ENV=development
PORT=5000

# Local PostgreSQL (runs in Docker)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=direct_recruit
DB_USER=postgres
DB_PASSWORD=localdev123

# Local Redis (runs in Docker) — optional, rate limiting is skipped in dev
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT — use any string, does NOT need to match production
JWT_SECRET=local-dev-jwt-secret-change-me

# Verification code for all email/password flows (hardcoded in dev)
LOCAL_DEV_VERIFICATION_CODE=123456

# AI features — leave commented out for mock responses, or add your key for real AI
# ANTHROPIC_API_KEY=
# ANTHROPIC_PI_API_KEY=

# AWS credentials are NOT needed — all AWS services are mocked locally
```

**Important:** `NODE_ENV=development` is what triggers the local mocks. Do not change this value.

There is also a template at `.env.local.example` in the project root you can copy from:
```bash
cp .env.local.example backend/.env
```

---

## Step 3: Start Docker Containers

From the **project root** (not `backend/`):

```bash
docker-compose up -d
```

Verify both containers are running:

```bash
docker ps
```

You should see two containers:
- `dr-postgres` (PostgreSQL 14 on port 5432)
- `dr-redis` (Redis 7 on port 6379)

**Note:** If port 5432 is already in use, you may have a local PostgreSQL installation running. Stop it first (on Windows: open Services → find PostgreSQL → Stop).

---

## Step 4: Seed the Database

```bash
cd backend
npm run seed
```

This creates the full schema (20+ tables, all migrations) and 6 test accounts. You should see `Seed complete!` at the end.

---

## Step 5: Start the Backend

From `backend/`:

```bash
node server.js
```

You should see:

```
Server running on port 5000
WebSocket server running
Environment: development

LOCAL DEV MODE — AWS services are mocked:
  Auth: bcrypt-based (no Cognito)
  Storage: local filesystem (no S3)
  Email: console output (no SES)
  Verification code: 123456
```

If you see this banner, everything is working. No AWS calls will be made.

---

## Step 6: Start the Frontend

1. Open the project in VS Code
2. Make sure Live Server is configured to use `localhost` (not `127.0.0.1`):
   - VS Code Settings → search "Live Server Host" → set to `localhost`
3. Right-click any HTML file in `frontend/landingpage/` → **Open with Live Server**
4. Navigate to `http://localhost:5500/frontend/landingpage/signin.html`

---

## Test Accounts

All accounts use password: **`Test123!@#`**

| Email | Role |
|---|---|
| `hsplayer@test.com` | High School Player |
| `collegeplayer@test.com` | College Player |
| `transferplayer@test.com` | Transfer Player |
| `hscoach@test.com` | High School Coach |
| `collegecoach@test.com` | College Coach |
| `other@test.com` | Other (Parent/Fan) |

---

## How Local Dev Differs from Production

| Feature | Production (EC2/AWS) | Local Dev |
|---|---|---|
| Auth | AWS Cognito | bcrypt password hashing |
| File Storage | AWS S3 | `backend/uploads/` folder |
| Email | AWS SES | Logged to your terminal |
| AI Assistant | Anthropic API | Hardcoded sample responses |
| Rate Limiting | Redis | Skipped entirely |
| Database | AWS RDS (PostgreSQL) | Docker PostgreSQL |

The switching is automatic based on `NODE_ENV`. When set to `development`, local mocks load in place of every AWS SDK. The route files and model files are identical in both environments — only the utility layer swaps out.

---

## Day-to-Day Usage

### Starting a dev session

```bash
docker-compose up -d          # Start DB + Redis (from project root)
cd backend && node server.js  # Start backend
```
Then open Live Server in VS Code.

### Stopping

```bash
docker-compose down            # Stops containers, keeps data
```

Or to wipe the database and start fresh:

```bash
docker-compose down -v         # Deletes database volume
docker-compose up -d           # Recreate containers
cd backend && npm run seed     # Re-seed
```

### Email verification / password reset

All verification codes are **`123456`**. Codes also print to your terminal when triggered.

### File uploads

Uploaded files save to `backend/uploads/` and are served at `http://localhost:5000/uploads/...`

### AI features

Without an API key, AI endpoints return hardcoded sample responses marked with `[LOCAL DEV]`. To use real AI locally, uncomment and add your key in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Deployment Workflow (Unchanged)

Local dev does not affect production. The workflow is still:

1. Make changes locally
2. Test on local server
3. `git push origin main`
4. SSH into EC2 → `git pull origin main` → `pm2 restart all`

The EC2 `.env` has `NODE_ENV=production` and real AWS credentials. Those are never touched by local dev.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Connection refused" on server start | Docker containers aren't running. Run `docker-compose up -d` and check `docker ps` |
| "relation does not exist" errors | Run `npm run seed` from `backend/` |
| Port 5432 already in use | A local PostgreSQL is running on the same port. Stop it in Services (Windows) or `brew services stop postgresql` (Mac) |
| Login redirects back to sign-in page | Make sure Live Server host is set to `localhost`, not `127.0.0.1` (VS Code Settings → Live Server Host) |
| 401 on `/api/auth/me` after login | Clear browser cookies for localhost, restart the backend, try again |
