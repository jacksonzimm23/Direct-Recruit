===========================================
PRE-LAUNCH SECURITY CHECKLIST
===========================================

🔴 CRITICAL (Must fix before launch):
- [x] Filter profile data server-side when accessLevel is 'limited'
- [x] Remove or migrate old video upload endpoint to S3
- [x] Add UUID validation to :userId/:playerId route params
- [x] Remove WebSocket auth.token fallback, only accept HTTPOnly cookies
- [x] Return generic errors to client, log full errors server-side
- [soon] Rotate ALL credentials (AWS keys, DB password, Cognito secret, JWT secret)
- [soon] Add .env to .gitignore (ALREADY DONE - but file is tracked)
- [soon] Remove .env from git history (use BFG Repo-Cleaner) ⚠️ YOUR REAL CREDENTIALS ARE IN GIT
- [soon] Fix CORS - restrict to your actual domain in server.js
- [soon] Fix WebSocket CORS in backend/socket.js (set FRONTEND_URL, don't default to '*')
- [x] Remove debug console.logs with sensitive data (settings.js lines 158,235,239,380,706)
- [x] Remove debug console.logs in profile.js (lines 483, 550-551, 580-586)

🟠 HIGH (Fix soon after launch):
- [ ] Add CSRF protection
- [ ] Add virus scanning for file uploads
- [x] Add rate limiting to email change request endpoint (backend/routes/settings.js:125)
- [x] Add rate limiting to username/email check endpoints (backend/routes/profile.js:510,529)
- [ ] Add magic byte validation for file uploads (not just extension/mimetype)
- [acceptable] Review innerHTML usage in frontend for XSS (30+ instances - use textContent where possible)

🟡 MEDIUM (Address when possible):
- [ ] Rate limiting disabled in development - ensure NODE_ENV=production on server
- [ ] Cookie secure:false in dev - ensure production uses HTTPS
- [ ] Consider adding Content-Security-Policy header

🟢 ALREADY GOOD:
- [x] Fix SQL injection in backend/models/PendingEmailChange.js:67
- [x] Enable SSL certificate validation in backend/config/database.js
- [x] Move tokens from localStorage to HTTPOnly cookies
- [x] Move highlight video uploads to S3 (new endpoint)
- [x] Parameterized SQL queries throughout
- [x] AWS Cognito authentication
- [x] Input validation with express-validator
- [x] Rate limiting infrastructure
- [x] Signed S3 URLs
- [x] Password verification for sensitive operations
- [x] Helmet.js security headers
- [x] JWT authentication on protected routes
- [x] File type/size validation on uploads
- [x] Strong password requirements (8 chars, upper, lower, number, special)
- [x] Soft deletes for posts (archive instead of hard delete)
- [x] Role-based access control middleware

⚠️ IMMEDIATE ACTION REQUIRED:
Your .env file with REAL credentials is in Git history:
- AWS Access Key: AKIA***647Y
- AWS Secret Key: hFF9***KPG  
- RDS Password: Bailey***2003
- Database host, Cognito secrets, JWT secret

ANYONE with repo access can see these. You MUST:
1. Rotate ALL credentials in AWS Console immediately
2. Change your RDS password
3. Generate new JWT secret
4. Remove .env from Git history with BFG Repo-Cleaner


Option 1: Git Branches (Recommended)

main (production)     ←── What's deployed on your server
  │
  └── dev             ←── Where you work locally
Workflow:


# Create a dev branch
git checkout -b dev

# Work on features, make changes
# ... edit code ...
git add .
git commit -m "New feature"

# When ready to deploy, merge to main
git checkout main
git merge dev
git push origin main

# Then on your server:
git pull origin main
Your production server only ever pulls from main.


Option 2: Separate Environments with .env
You already have this partially set up. Your code can behave differently based on NODE_ENV:


Local machine:  NODE_ENV=development  →  Uses localhost, test DB
Production:     NODE_ENV=production   →  Uses real domain, production DB
Your server.js already does this for CORS:


const allowedOrigins = process.env.NODE_ENV === 'production'
  ? ['https://directrecruit.net', 'https://www.directrecruit.net']
  : true;  // Allow all in development