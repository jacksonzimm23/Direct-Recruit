# Direct Recruit - Development & Deployment Workflow

## Overview

- **Local machine** = where you develop and test with Claude Code
- **GitHub** = private repo that stores your code (no credentials)
- **EC2 server** = runs your live website at https://directrecruit.net
- Changes are NEVER auto-deployed. You control when the live site updates.

---

## Step 1: Develop Locally

Edit code on your local machine using Claude Code or your editor.
Test on your local dev server:

```bash
cd backend
npm run dev
```

Visit `http://localhost:5000` to test changes.

---

## Step 2: Push to GitHub

When you're happy with your changes:

```bash
git add .
git commit -m "description of what you changed"
git push origin main
```

This uploads your code to GitHub. The live site does NOT change yet.

---

## Step 3: Deploy to Live Site

Only do this when you're ready for the live site to update.

### 3a. SSH into your server

```bash
ssh -i "C:\Users\jacks\Downloads\direct-recruit-key.pem" ec2-user@98.82.239.221
```

### 3b. Pull the latest code

```bash
cd /home/ec2-user/direct-recruit
git pull origin main
```

### 3c. Install dependencies (only if you added new packages)

```bash
cd backend
npm install --production
```

### 3d. Restart the app

```bash
pm2 restart direct-recruit
```

### 3e. Verify it's running

```bash
pm2 status
```

Should show `online` status.

### 3f. Exit the server

```bash
exit
```

---

## Quick Deploy (All-in-One)

Once you're comfortable, you can do it all in one line after SSHing in:

```bash
cd /home/ec2-user/direct-recruit && git pull origin main && cd backend && npm install --production && pm2 restart direct-recruit
```

---

## Important Notes

- **Never edit code directly on the EC2 server** (except .env). Always edit locally, push to GitHub, then pull on the server.
- **The .env file on EC2 is separate from your local .env.** They have different credentials. The EC2 .env is never in git.
- **Claude Code only sees your local machine.** It cannot access the production server or its credentials.
- **If your home IP changes**, update the RDS security group inbound rule with your new IP (AWS Console > EC2 > Security Groups > direct-recruit-db-sg).
- **SSL certificate auto-renews** via Certbot. No action needed.

---

## Useful Commands (Run on EC2 Server)

| Command | Purpose |
|---------|---------|
| `pm2 status` | Check if the app is running |
| `pm2 logs direct-recruit` | View app logs |
| `pm2 logs direct-recruit --lines 50` | View last 50 log lines |
| `pm2 restart direct-recruit` | Restart the app |
| `pm2 stop direct-recruit` | Stop the app |
| `pm2 start direct-recruit` | Start the app |
| `sudo systemctl status nginx` | Check if Nginx is running |
| `sudo systemctl restart nginx` | Restart Nginx |
| `sudo certbot renew --dry-run` | Test SSL renewal |

---

## Server Details

| Item | Value |
|------|-------|
| Server IP | 98.82.239.221 |
| Domain | https://directrecruit.net |
| SSH Key | C:\Users\jacks\Downloads\direct-recruit-key.pem |
| SSH User | ec2-user |
| App Manager | PM2 |
| Web Server | Nginx |
| App Port | 5000 (internal, proxied by Nginx) |
| Node.js | v20 LTS |
