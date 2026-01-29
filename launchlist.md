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
- [x] Add .env to .gitignore (ALREADY DONE - but file is tracked)
- [x] Fix CORS - restrict to your actual domain in server.js
- [x] Fix WebSocket CORS in backend/socket.js (set FRONTEND_URL, don't default to '*')
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




  Complete Deployment Guide: Direct Recruit
Phase 1: Scrub Git History & Rotate Credentials
You mentioned you'll rotate credentials. Do that after scrubbing history so the old creds are dead and gone from the repo.

Step 1A: Verify .env is not in git history
Based on my analysis, your .env was never committed — .gitignore had it from the start. So you're clean. But to double-check:


git log --all --full-history -- .env
If this returns nothing, you're good. If it returns commits, you'd need to use BFG Repo Cleaner to scrub it. But you should be fine.

Step 1B: Rotate all credentials
Do this in the AWS Console:

IAM Access Key — Go to IAM → Users → your user → Security credentials → Create new access key → Delete old one
RDS Password — Go to RDS → Modify instance → Set new master password
Cognito Client Secret — Go to Cognito → User Pool → App clients → Create new client (or regenerate secret) → Update client ID/secret
JWT Secret — Generate a new one locally:

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Update your local .env with all new values
Test locally to confirm everything still works: npm run dev
Phase 2: Open AWS Security Groups for Public Access
Right now your RDS is likely restricted to your home IP. You need to keep it locked down but allow your production server to access it.

Step 2A: Create an EC2 instance (your production server)
Go to AWS Console → EC2 → Launch Instance
Settings:
Name: direct-recruit-prod
AMI: Amazon Linux 2023 (or Ubuntu 22.04 LTS)
Instance type: t3.micro (free tier eligible, fine to start)
Key pair: Create a new one, name it direct-recruit-key. Download the .pem file. Save this somewhere safe, not in your repo.
Network settings:
Create a new security group: direct-recruit-prod-sg
Allow SSH (port 22) from "My IP" (for now — we'll discuss later)
Allow HTTP (port 80) from 0.0.0.0/0 (anywhere)
Allow HTTPS (port 443) from 0.0.0.0/0 (anywhere)
Storage: 20 GB gp3
Launch the instance
Note the Elastic IP — go to EC2 → Elastic IPs → Allocate → Associate with your instance. This gives you a static IP that won't change on reboot.
Step 2B: Fix the RDS Security Group
Go to RDS → your database instance → Connectivity & security
Click the VPC security group link
Edit Inbound rules:
Remove the rule allowing your home IP on port 5432 (or keep it for local dev — your choice)
Add rule: Type: PostgreSQL, Port: 5432, Source: direct-recruit-prod-sg (select the EC2 security group by name)
This means only your EC2 instance can talk to the database
If you still want local dev access to RDS, keep your home IP rule too. Just know it breaks when your IP changes (most ISPs rotate IPs). Alternative: use an SSH tunnel through EC2 for local dev access (more secure).
Step 2C: Redis — Install on EC2 (not publicly exposed)
Your current Redis is localhost. On the production server, Redis will also run locally on that server. No security group changes needed — it never leaves the machine.

Phase 3: Set Up the Production Server
SSH into your EC2 instance. On Windows, use PowerShell or the .pem file with your SSH client:


ssh -i "direct-recruit-key.pem" ec2-user@YOUR_ELASTIC_IP
(Use ubuntu@ instead of ec2-user@ if you chose Ubuntu.)

Step 3A: Install dependencies
Amazon Linux 2023:


# Node.js 20 LTS
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Git
sudo yum install -y git

# Redis
sudo yum install -y redis6
sudo systemctl enable redis6
sudo systemctl start redis6

# Nginx (reverse proxy)
sudo yum install -y nginx
sudo systemctl enable nginx

# PM2 (process manager - keeps your app running)
sudo npm install -g pm2
Ubuntu 22.04:


curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git redis-server nginx
sudo systemctl enable redis-server
sudo systemctl start redis-server
sudo npm install -g pm2
Step 3B: Clone your repo

cd /home/ec2-user   # or /home/ubuntu
git clone https://github.com/YOUR_USERNAME/direct-recruit.git
cd direct-recruit
npm install --production
Step 3C: Create the production .env on the server
This file lives only on the server, never in git:


nano .env
Paste in your production values:


PORT=5000
NODE_ENV=production

DB_HOST=direct-recruit-db.XXXXXX.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=direct_recruit
DB_USER=dr_admin
DB_PASSWORD=YOUR_NEW_ROTATED_PASSWORD

REDIS_HOST=localhost
REDIS_PORT=6379

JWT_SECRET=YOUR_NEW_ROTATED_JWT_SECRET
JWT_EXPIRE=7d

MAX_FILE_SIZE=5242880
UPLOAD_PATH=./uploads

AWS_ACCESS_KEY_ID=YOUR_NEW_ROTATED_KEY
AWS_SECRET_ACCESS_KEY=YOUR_NEW_ROTATED_SECRET
AWS_REGION=us-east-1
AWS_S3_BUCKET=direct-recruit-profiles

AWS_COGNITO_USER_POOL_ID=us-east-1_XXXXXXX
AWS_COGNITO_CLIENT_ID=YOUR_NEW_CLIENT_ID
AWS_COGNITO_CLIENT_SECRET=YOUR_NEW_CLIENT_SECRET

SES_FROM_EMAIL=jacksonzimm@gmail.com
Save and exit (Ctrl+X, Y, Enter).

Step 3D: Configure Nginx as a reverse proxy

sudo nano /etc/nginx/conf.d/direct-recruit.conf
Paste:


server {
    listen 80;
    server_name directrecruit.net www.directrecruit.net;

    # Frontend static files
    location / {
        root /home/ec2-user/direct-recruit/frontend;
        index landingpage/index.html;
        try_files $uri $uri/ =404;
    }

    # Backend API and Socket.IO
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Health check
    location /health {
        proxy_pass http://127.0.0.1:5000;
    }
}
Adjust the root path if you used Ubuntu (/home/ubuntu/...).


# Remove default config if it conflicts
sudo rm -f /etc/nginx/conf.d/default.conf

# Test and start
sudo nginx -t
sudo systemctl restart nginx
Step 3E: Start your app with PM2

cd /home/ec2-user/direct-recruit/backend
pm2 start server.js --name direct-recruit
pm2 save
pm2 startup  # follow the printed command to enable on boot
At this point, visiting http://YOUR_ELASTIC_IP should show your site.

Phase 4: Domain & HTTPS
Step 4A: Point your domain to the server
Go to your domain registrar (wherever you bought directrecruit.net) and set:

Record Type	Name	Value
A	@	YOUR_ELASTIC_IP
A	www	YOUR_ELASTIC_IP
DNS propagation takes 5 minutes to 48 hours (usually under 30 minutes).

Step 4B: Install SSL with Certbot (free HTTPS)

# Amazon Linux 2023
sudo yum install -y certbot python3-certbot-nginx

# Ubuntu
sudo apt install -y certbot python3-certbot-nginx

# Get certificate (do this AFTER DNS is pointing to your server)
sudo certbot --nginx -d directrecruit.net -d www.directrecruit.net
Certbot will automatically modify your Nginx config to handle HTTPS and redirect HTTP → HTTPS. It also auto-renews.

Step 4C: Update Cognito callback URLs
In AWS Cognito console, update your app client's callback/redirect URLs from http://localhost:5000 to https://directrecruit.net.

Step 4D: Update CORS
Your server.js already has production CORS set to directrecruit.net — that's correct. Just make sure NODE_ENV=production in your server .env.

Phase 5: Your Daily Workflow
Here's how development works from now on:


1.  Edit code locally with Claude Code
2.  Test on localhost:5000
3.  When satisfied:
        git add .
        git commit -m "description of changes"
        git push origin main
4.  When ready to update production (NOT automatic):
        ssh -i "direct-recruit-key.pem" ec2-user@YOUR_ELASTIC_IP
        cd direct-recruit
        git pull origin main
        npm install --production   # only if dependencies changed
        pm2 restart direct-recruit
5.  Exit SSH. Done.
Claude Code only touches your local machine. It never sees the production .env and never triggers a deploy. You decide when to push and when to pull on the server.

Security Summary
Concern	Solution
Claude seeing production creds	Production .env only exists on EC2, never in git
Auto-deploying to domain	Manual git pull + pm2 restart — you control it
RDS open to the internet	Security group only allows EC2 instance, not public
Redis open to the internet	Runs on localhost on EC2, no external port
SSH access	Key-pair only, port 22 restricted to your IP
HTTPS	Certbot/Let's Encrypt, auto-renews
Git history	.env was never committed; credentials rotated anyway
