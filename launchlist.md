===========================================
PRE-LAUNCH SECURITY CHECKLIST
===========================================

🔴 CRITICAL (Must fix before launch):
- [ ] Rotate ALL credentials (AWS keys, DB password, Cognito secret, JWT secret)
- [ ] Add .env to .gitignore
- [ ] Remove .env from git history (use BFG Repo-Cleaner)
- [ ] Fix CORS - restrict to your actual domain in server.js
- [ ] Fix SQL injection in backend/models/PendingEmailChange.js:67
- [ ] Enable SSL certificate validation in backend/config/database.js
- [ ] Fix WebSocket CORS in backend/socket.js (set FRONTEND_URL)

🟠 HIGH (Fix soon after launch):
- [ ] Move tokens from localStorage to HTTPOnly cookies
- [ ] Add CSRF protection
- [ ] Move highlight video uploads to S3 (currently on local disk)
- [ ] Add virus scanning for file uploads

🟢 ALREADY GOOD:
- [x] Parameterized SQL queries (except one spot noted above)
- [x] AWS Cognito authentication
- [x] Input validation with express-validator
- [x] Rate limiting infrastructure
- [x] Signed S3 URLs
- [x] Password verification for sensitive operations
- [x] Helmet.js security headers
- [x] JWT authentication on protected routes
- [x] File type/size validation on uploads