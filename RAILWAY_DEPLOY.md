# MyLedger — Railway Deployment Guide

Live app: **https://app.kaimanco.com**
Repo: **https://github.com/mym-lab/myledger** (main branch)

---

## Overview

MyLedger runs on Railway Hobby plan. Deployments are fully automatic — every `git push` to `main` triggers a redeploy with zero downtime.

**Stack at runtime:**
- Node v24, ESM modules
- Express backend on port 5000
- SQLite database on a persistent volume (`/data/myledger.db`)
- Vite-built React frontend served as static files by Express

---

## One-Time Setup (already done — reference only)

### 1. Create Railway project

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select `mym-lab/myledger`, branch `main`

### 2. Add persistent volume

Railway ephemeral filesystem resets on every deploy. The SQLite DB must live on a volume.

1. In Railway dashboard → your service → **Volumes** tab
2. Add volume: mount path `/data`
3. Volume name: `myledger-volume`

The app reads `DB_PATH` env var to locate the database (defaults to `/data/myledger.db`).

### 3. Set environment variables

In Railway dashboard → your service → **Variables** tab:

| Variable | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables prod mode |
| `JWT_SECRET` | _(your secret)_ | Long random string — keep private |
| `DB_PATH` | `/data/myledger.db` | Points to the volume |
| `RESEND_API_KEY` | _(your key)_ | From resend.com dashboard |
| `APP_URL` | `https://app.kaimanco.com` | Used in email links |

### 4. Configure build & start commands

In Railway dashboard → your service → **Settings** tab:

| Setting | Value |
|---|---|
| **Build command** | `cd frontend && npm install --include=dev && npm run build && cd ../backend && npm install` |
| **Start command** | `NODE_ENV=production node backend/app.js` |
| **Builder** | Nixpacks (auto-detected) |

### 5. Set custom domain

1. Railway service → **Settings** → Custom Domain → Add `app.kaimanco.com`
2. In Squarespace DNS: add a CNAME record `app` → `[railway-provided-cname].railway.app`

---

## Day-to-Day Deployment

```bash
# From C:\Users\Kurt\Desktop\MyLedger\v10-clean
git add -A
git commit -m "your message"
git push
```

Railway picks up the push automatically. Typical deploy time: **2–3 minutes**.

Watch the build log in Railway dashboard → your service → **Deployments** tab.

---

## Checking Logs

**Live logs:**
Railway dashboard → service → **Logs** tab (streams in real time)

**Or via Railway CLI:**
```bash
railway logs
```

Common things to look for:
- `✅ MyLedger backend running on port 5000` — server started
- `📦 Database ready` — SQLite connected
- `🕐 Daily cron running` — subscription expiry cron alive

---

## Environment Variables — Quick Reference

```bash
# Minimum required for production
NODE_ENV=production
JWT_SECRET=<long-random-secret>
DB_PATH=/data/myledger.db
RESEND_API_KEY=re_xxxxxxxxxxxx
APP_URL=https://app.kaimanco.com

# Optional — Google Vision for OCR receipt scanning
GOOGLE_APPLICATION_CREDENTIALS_JSON=<base64 or path>
```

To update a variable: Railway dashboard → Variables → edit → Railway auto-redeploys.

---

## First Admin Account

After first deploy, register at `https://app.kaimanco.com` with:
- Email: `mym@kaimanco.com`
- Any password

Then in Railway shell (or locally with DB access), promote to admin:
```sql
UPDATE users SET role='admin' WHERE email='mym@kaimanco.com';
```

Or use the Railway dashboard → service → **Shell** tab:
```bash
node -e "
import { db } from './backend/db.js';
db.prepare(\"UPDATE users SET role='admin' WHERE email='mym@kaimanco.com'\").run();
console.log('Done');
"
```

---

## Database Backup

**Via the app:** CommandCenter → Backup tab → Download Backup
This exports all clients, transactions, users, and settings as a JSON file.

**Direct SQLite copy (Railway shell):**
```bash
cp /data/myledger.db /data/myledger-backup-$(date +%Y%m%d).db
```

**Restore from app backup:**
CommandCenter → Backup tab → Restore → upload the JSON file

---

## Rollback

If a deploy breaks production:

1. Railway dashboard → **Deployments** tab
2. Find the last good deployment
3. Click **Redeploy** on that deployment

Railway will re-run the exact same build without touching the volume/database.

---

## Resend Email Setup

MyLedger uses [Resend](https://resend.com) for transactional email (Railway blocks all SMTP ports).

1. Create account at resend.com
2. Add and verify domain `kaimanco.com`
3. Create API key → copy to Railway env var `RESEND_API_KEY`

Emails sent:
- Welcome email on signup
- Upgrade/renewal approval confirmation
- BIR deadline reminders (daily cron)

---

## Local Development

```bash
cd C:\Users\Kurt\Desktop\MyLedger\v10-clean

# Backend
cd backend
npm install
node app.js          # runs on http://localhost:5000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev          # runs on http://localhost:5173, proxies /api to :5000
```

Local DB is created at `backend/myledger.db` (not on the volume).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Deploy fails at frontend build | Missing dev dep | Ensure `npm install --include=dev` in build command |
| `Cannot find module` error | Backend deps not installed | Check build command runs `cd ../backend && npm install` |
| DB not persisting between deploys | Volume not mounted | Verify volume mount at `/data` in Railway Volumes tab |
| Emails not sending | Bad Resend key | Check `RESEND_API_KEY` env var in Railway Variables |
| `JWT_SECRET` error | Var not set | Add `JWT_SECRET` to Railway Variables |
| 502 on first deploy | Cold start time | Wait 30s and refresh — Railway takes a moment on first boot |
