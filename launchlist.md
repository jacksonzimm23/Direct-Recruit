===========================================
PRE-LAUNCH SECURITY CHECKLIST
===========================================

🔴 CRITICAL (Must fix before launch):
- [ ] Filter profile data server-side when accessLevel is 'limited' (backend/routes/profile.js:295-301)
- [ ] Remove or migrate old video upload endpoint to S3 (backend/routes/upload.js:123-145)
- [ ] Add UUID validation to :userId/:playerId route params (multiple routes)
- [ ] Remove WebSocket auth.token fallback, only accept HTTPOnly cookies (backend/socket.js:29)
- [ ] Return generic errors to client, log full errors server-side (backend/routes/auth.js:96)
- [ ] Rotate ALL credentials (AWS keys, DB password, Cognito secret, JWT secret)
- [ ] Add .env to .gitignore
- [ ] Remove .env from git history (use BFG Repo-Cleaner)
- [ ] Fix CORS - restrict to your actual domain in server.js
- [ ] Fix WebSocket CORS in backend/socket.js (set FRONTEND_URL)

🟠 HIGH (Fix soon after launch):
- [ ] Add CSRF protection
- [ ] Add virus scanning for file uploads
- [ ] Add rate limiting to email change request endpoint (backend/routes/settings.js:125)

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