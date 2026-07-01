// ============================================================
// MyLedger - Backend API
// Node.js + Express + SQLite (node:sqlite, built-in)
// Port: process.env.PORT (Railway sets this) or 5000 locally
// ============================================================

import express from 'express';
import cors from 'cors';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { db, getSetting, setSetting } from './db.js';
import authRoutes            from './routes/auth.js';
import clientRoutes          from './routes/clients.js';
import transactionRoutes     from './routes/transactions.js';
import reportRoutes          from './routes/reports.js';
import birRoutes             from './routes/bir.js';
import birExportRoutes       from './routes/bir-export.js';
import adminRoutes           from './routes/admin.js';
import journalEntriesRoutes  from './routes/journal-entries.js';
import upgradeRequestsRoutes from './routes/upgrade-requests.js';
import assetsRoutes          from './routes/assets.js';
import contactsRoutes        from './routes/contacts.js';
import notificationsRoutes   from './routes/notifications.js';
import coaRoutes             from './routes/coa.js';
import periodsRoutes         from './routes/periods.js';
import auditRoutes           from './routes/audit.js';
import ocrRoutes             from './routes/ocr.js';
import invitationRoutes      from './routes/invitations.js';
import referralRoutes        from './routes/referrals.js';
import invoiceRoutes         from './routes/invoices.js';
import payrollRoutes         from './routes/payroll.js';
import paymentRoutes         from './routes/payments.js';
import monitoringRoutes, { trackActivity } from './routes/monitoring.js';
import importRoutes         from './routes/import.js';
import narrativeRoutes      from './routes/narrative.js';
import receiptsRoutes       from './routes/receipts.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// ─── CORS ─────────────────────────────────────────────────────
// In production the frontend is served by this same Express server,
// so CORS is only needed for local dev (two separate ports).
if (!isProd) {
  app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
}

app.use(express.json({ limit: '10mb' }));
app.use(trackActivity); // Track all user activity



// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',             authRoutes);
app.use('/api/clients',          clientRoutes);
app.use('/api/transactions',     transactionRoutes);
app.use('/api/reports',          reportRoutes);
app.use('/api/bir',              birRoutes);
app.use('/api/bir',              birExportRoutes);
app.use('/api/admin',            adminRoutes);
app.use('/api/journal-entries',  journalEntriesRoutes);
app.use('/api/upgrade-requests', upgradeRequestsRoutes);
app.use('/api/assets',           assetsRoutes);
app.use('/api/contacts',         contactsRoutes);
app.use('/api/notifications',    notificationsRoutes);
app.use('/api/coa',              coaRoutes);
app.use('/api/periods',          periodsRoutes);
app.use('/api/audit',            auditRoutes);
app.use('/api/ocr',              ocrRoutes);
app.use('/api/invitations',      invitationRoutes);
app.use('/api/referrals',        referralRoutes);
app.use('/api/invoices',         invoiceRoutes);
app.use('/api/payroll',          payrollRoutes);
app.use('/api/payments',         paymentRoutes);
app.use('/api/monitoring',       monitoringRoutes);
app.use('/api/import',          importRoutes);
app.use('/api/reports/narrative', narrativeRoutes);
app.use('/api/receipts',          receiptsRoutes);




// ─── Health Check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'MyLedger', version: '1.0.0',
    env: isProd ? 'production' : 'development',
    timestamp: new Date().toISOString() });
});

// ─── Serve Frontend (Production) ──────────────────────────────
// In production Railway runs one server. The Vite build output
// (frontend/dist) is served as static files. All non-API routes
// return index.html so React Router works correctly.
const frontendDist = join(__dirname, '../frontend/dist');
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(join(frontendDist, 'index.html'));
  });
} else if (isProd) {
  // Production but no build found — show helpful error
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.status(503).send('Frontend build not found. Run: cd frontend && npm run build');
    }
  });
}

// ─── Global Error Handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ─── Subscription Expiry Check ────────────────────────────────
// Runs on startup and every 24 h. Downgrades clients whose subscription
// has expired to free tier. subscription_expires_at is kept (not nulled)
// so the frontend can show the "subscription expired" banner.
function checkExpiredSubscriptions() {
  try {
    const now = new Date().toISOString();
    const result = db.prepare(
      "UPDATE clients SET subscription_tier='free' WHERE subscription_expires_at < ? AND subscription_tier != 'free'"
    ).run(now);
    if (result.changes > 0)
      console.log(`⏰  Subscription expiry: ${result.changes} client(s) downgraded to free.`);
  } catch (e) {
    console.error('⚠️  Expiry check failed:', e.message);
  }
}
checkExpiredSubscriptions();
setInterval(checkExpiredSubscriptions, 24 * 60 * 60 * 1000);

// ── Daily BIR Reminder Scheduler ──────────────────────────────────────────────
// Fires at 8:00 AM Philippine time (UTC+8 = 00:00 UTC) each day.
// Guards with last-sent-date so it never double-sends within the same day.
async function runDailyReminders() {
  try {
    const smtp = getSetting('smtp') || {};
    if (!smtp.enabled) return; // reminders disabled in settings
    if (!process.env.RESEND_API_KEY) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastSent = getSetting('notifications_last_sent');
    if (lastSent === today) return; // already sent today

    // Dynamically call send-reminders logic (reuse notifications route helper)
    const port = process.env.PORT || 5000;
    // Use built-in fetch (Node 18+)
    const res = await fetch(`http://localhost:${port}/api/notifications/send-reminders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-cron': '1' },
      body: JSON.stringify({ daysAhead: 7 }),
    });
    if (res.ok) {
      setSetting('notifications_last_sent', today);
      const data = await res.json();
      console.log('📅 Daily BIR reminders:', data.message || 'sent');
    }
  } catch (e) {
    console.error('⚠️  Daily reminder scheduler error:', e.message);
  }
}

// Check every hour; runs when PH local hour is 8 (UTC 0)
function scheduleDailyReminders() {
  const now   = new Date();
  const utcH  = now.getUTCHours();
  const utcM  = now.getUTCMinutes();
  // PH 8 AM = UTC 0:00
  if (utcH === 0 && utcM < 60) {
    runDailyReminders();
  }
}
setInterval(scheduleDailyReminders, 60 * 60 * 1000); // check every hour

app.listen(PORT, () => 