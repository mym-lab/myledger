# MyLedger — Railway Deployment Guide

> One-time setup. After this, every `git push` auto-deploys.

---

## Prerequisites (install once)

| Tool | Download |
|------|----------|
| Git | https://git-scm.com/download/win |
| Node 22 | https://nodejs.org (LTS) |
| Railway CLI | `npm install -g @railway/cli` |

---

## Step 1 — Create a GitHub Repository

1. Go to https://github.com/new
2. Repository name: `myledger`
3. Set to **Private**
4. Do NOT initialize with README (you already have files)
5. Click **Create repository**
6. Copy the repo URL shown — looks like: `https://github.com/YOUR_USERNAME/myledger.git`

---

## Step 2 — Initialize Git and Push

Open a terminal (PowerShell or CMD) and run these commands from inside your `v10-clean` folder:

```bash
cd C:\Users\Kurt\Desktop\MyLedger\v10-clean

git init
git add .
git commit -m "Initial commit: MyLedger MVP v10"

git remote add origin https://github.com/YOUR_USERNAME/myledger.git
git branch -M main
git push -u origin main
```

Verify it uploaded by refreshing your GitHub repo page — you should see all your files.

---

## Step 3 — Create a Railway Project

1. Go to https://railway.app and sign up / log in (GitHub login recommended)
2. Click **New Project**
3. Choose **Deploy from GitHub repo**
4. Select your `myledger` repo
5. Railway will detect `railway.json` automatically — click **Deploy**

> Railway will start building immediately. The first build takes ~3-5 minutes (installs npm packages, builds Vite frontend). It will FAIL at first because environment variables aren't set yet — that's expected.

---

## Step 4 — Set Environment Variables

In your Railway project dashboard:
1. Click your service (it will be named `myledger` or similar)
2. Go to **Variables** tab
3. Add these one by one (click **New Variable** for each):

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | (generate a strong random string — use: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `DB_PATH` | `/data/myledger.db` |
| `APP_URL` | (leave blank for now — fill in after first successful deploy) |

**To generate JWT_SECRET:** Open PowerShell and run:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output and paste it as the JWT_SECRET value.

---

## Step 5 — Add a Persistent Volume (CRITICAL)

Without this, your database resets every redeploy. Do this before your first real use.

1. In your Railway project, click **New** → **Volume**
2. Name it: `myledger-data`
3. Mount path: `/data`
4. Attach it to your `myledger` service
5. Railway will redeploy automatically

> This creates a persistent disk at `/data`. Your SQLite database (`/data/myledger.db`) will survive all future deploys and restarts.

---

## Step 6 — Verify the Deploy

After the build succeeds (green checkmark):

1. Click your service → **Settings** → copy the **Public URL** (looks like `https://myledger-production-xxxx.up.railway.app`)
2. Open that URL in your browser — you should see the MyLedger login screen
3. Test the health check: `https://YOUR_URL/api/health` — should return `{"status":"ok"}`
4. Create your admin account by signing up with your email

---

## Step 7 — Update APP_URL

1. Copy your Railway public URL
2. Go back to **Variables**
3. Set `APP_URL` = `https://myledger-production-xxxx.up.railway.app`
4. This is used in invitation emails so the links work correctly

---

## Step 8 (Optional) — Custom Domain

To use `app.kaimanco.com` instead of the Railway URL:

1. Railway service → **Settings** → **Custom Domain** → Add domain
2. Copy the CNAME record Railway provides
3. Go to your domain registrar (where you registered kaimanco.com)
4. Add a CNAME record:
   - Name/Host: `app`
   - Value: (the CNAME Railway gave you)
5. Wait 5-15 minutes for DNS to propagate
6. Update `APP_URL` env var to `https://app.kaimanco.com`

---

## Future Deploys

Every time you make code changes:

```bash
git add .
git commit -m "describe what you changed"
git push
```

Railway auto-deploys on every push to `main`. Zero downtime.

---

## If Something Goes Wrong

| Problem | Fix |
|---------|-----|
| Build fails | Check **Deploy Logs** in Railway — usually a missing package |
| App crashes on start | Check **Runtime Logs** — usually a missing env var |
| Database resets | Volume not mounted — repeat Step 5 |
| Invite links broken | APP_URL env var not set or wrong |
| Can't log in after redeploy | Database survived (volume working) — create account if first time |

---

## Environment Variables Summary

```
NODE_ENV=production
JWT_SECRET=<64-char random hex>
DB_PATH=/data/myledger.db
APP_URL=https://your-railway-url.up.railway.app
```

That's it. Your app is live 24/7 without your PC needing to be on.
