# Direct Recruit Backend - Complete Setup & Testing Guide

## Prerequisites Installation

### 1. Install PostgreSQL
**Windows:**
1. Download from https://www.postgresql.org/download/windows/
2. Run installer, use default port 5432
3. Set password for `postgres` user (remember this!)
4. Complete installation

**Verify:**
```bash
psql --version
```

### 2. Install Redis
**Windows:**
1. Download from https://github.com/microsoftarchive/redis/releases
2. Download `Redis-x64-3.0.504.msi`
3. Run installer with defaults
4. Redis runs as Windows service automatically

**Verify:**
```bash
redis-cli ping
# Should return: PONG
```

## Project Setup

### Step 1: Install Node Packages
```bash
cd backend
npm install
```

### Step 2: Create Environment File
```bash
# Copy example file
copy .env.example .env
```

Edit `.env` file with your settings:
```env
PORT=5000
NODE_ENV=development

# PostgreSQL - CHANGE PASSWORD
DB_HOST=localhost
DB_PORT=5432
DB_NAME=direct_recruit
DB_USER=postgres
DB_PASSWORD=YOUR_POSTGRES_PASSWORD_HERE

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT - CHANGE THIS SECRET
JWT_SECRET=YOUR_SECRET_KEY_HERE
JWT_EXPIRE=7d

# File Upload
MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads
```

### Step 3: Create Database
Open Command Prompt or PowerShell:

```bash
# Connect to PostgreSQL
psql -U postgres

# Enter your postgres password when prompted
# Then in psql terminal:
CREATE DATABASE direct_recruit;

# Verify it was created:
\l

# Exit psql:
\q
```

### Step 4: Run Database Migration
```bash
npm run migrate
```

**Expected output:**
```
Running database migration...
Migration completed successfully!
```

**If you get an error:**
- Check `.env` has correct DB_PASSWORD
- Verify PostgreSQL is running: `psql -U postgres -c "SELECT version();"`
- Check database exists: `psql -U postgres -l`

### Step 5: Start Server
```bash
npm run dev
```

**Expected output:**
```
Server running on port 5000
Environment: development
Redis connected
```

**If Redis fails:**
- Windows: Check Services, ensure "Redis" is running
- Or start manually: `redis-server`

## Testing the API

### Method 1: Using VS Code REST Client Extension (RECOMMENDED)

1. **Install Extension:**
   - Open VS Code Extensions (Ctrl+Shift+X)
   - Search "REST Client"
   - Install by Huachao Mao

2. **Open test file:**
   - Open `backend/test-api.http`

3. **Test endpoints:**
   - Click "Send Request" above each request
   - Results appear in new tab

**Testing Flow:**
```
1. Health Check → Should return {"status":"ok"}
2. Register Player → Copy the "token" from response
3. Replace TOKEN in other requests with copied token
4. Create Player Profile → Should return profile data
5. Get Current User → Should show user with profile
```

### Method 2: Using Postman

1. **Download Postman:** https://www.postman.com/downloads/

2. **Create Collection:**
   - New Collection → "Direct Recruit"

3. **Test Registration:**
   - New Request → POST
   - URL: `http://localhost:5000/api/auth/register`
   - Body → raw → JSON:
   ```json
   {
     "email": "testplayer@example.com",
     "password": "<your_password>",
     "role": "player"
   }
   ```
   - Send → Copy `token` from response

4. **Test Profile Creation:**
   - New Request → POST
   - URL: `http://localhost:5000/api/profile/player`
   - Headers → Add: `Authorization: Bearer YOUR_TOKEN_HERE`
   - Body → raw → JSON:
   ```json
   {
     "first_name": "John",
     "last_name": "Doe",
     "high_school": "Lincoln High",
     "graduation_year": 2025,
     "city": "Denver",
     "state": "Colorado",
     "position": "QB",
     "height": 74,
     "weight": 205,
     "gpa": 3.8,
     "player_status": "senior"
   }
   ```

### Method 3: Using cURL (Command Line)

**Register:**
```bash
curl -X POST http://localhost:5000/api/auth/register ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"test@example.com\",\"password\":\"<your_password>\",\"role\":\"player\"}"
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"test@example.com\",\"password\":\"<your_password>\"}"
```

**Create Profile (replace YOUR_TOKEN):**
```bash
curl -X POST http://localhost:5000/api/profile/player ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer YOUR_TOKEN" ^
  -d "{\"first_name\":\"John\",\"last_name\":\"Doe\",\"high_school\":\"Lincoln High\",\"graduation_year\":2025,\"city\":\"Denver\",\"state\":\"Colorado\",\"position\":\"QB\",\"height\":74,\"weight\":205,\"gpa\":3.8,\"player_status\":\"senior\"}"
```

## Verifying Data in Database

**Check created users:**
```bash
psql -U postgres -d direct_recruit

# In psql:
SELECT id, email, role, profile_completed FROM users;

# Check player profiles:
SELECT first_name, last_name, position, high_school FROM player_profiles;

# Exit:
\q
```

## Common Issues & Solutions

### "Connection refused" to PostgreSQL
```bash
# Check if PostgreSQL is running (Windows)
sc query postgresql-x64-14

# If not running, start it:
net start postgresql-x64-14
```

### "Redis connection failed"
```bash
# Check Redis service (Windows)
sc query Redis

# Start if needed:
net start Redis

# Or run manually:
redis-server
```

### Migration fails
```bash
# Drop and recreate database
psql -U postgres
DROP DATABASE IF EXISTS direct_recruit;
CREATE DATABASE direct_recruit;
\q

# Run migration again
npm run migrate
```

### "JWT must be provided"
- Make sure you copied the full token from login response
- Include `Bearer ` before token in Authorization header
- Token format: `Authorization: Bearer eyJhbGc...`

### Port 5000 already in use
- Change PORT in `.env` to 5001 or another port
- Restart server

## Success Checklist

- [ ] PostgreSQL installed and running
- [ ] Redis installed and running
- [ ] Database `direct_recruit` created
- [ ] Migration completed successfully
- [ ] Server starts without errors
- [ ] Health check returns `{"status":"ok"}`
- [ ] Can register new user and receive token
- [ ] Can create profile with auth token
- [ ] Can view profile data in database

## Next Steps After Testing

Once everything works:
1. Test coach registration and profile creation
2. Create multiple users to test search
3. Ready to build follow/feed system
4. Add real-time messaging with Socket.IO

## Quick Reference

**Start everything:**
```bash
# Terminal 1: Start server
cd backend
npm run dev

# Server runs on http://localhost:5000
```

**Test endpoint:**
```bash
# Health check
curl http://localhost:5000/health
```

**View logs:**
- Server logs appear in terminal
- Check for errors during requests
