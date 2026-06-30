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

import { db } from './db.js';
import authRoutes            from './routes/auth.js';
import clientRoutes          from './routes/clients.js';
import transactionRoutes     from './routes/transactions.js';
import reportRoutes          from './routes/reports.js';
import birRoutes             from './routes/bir.js';
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

app.listen(PORT, () => {
  console.log(`\n✅  MyLedger ${isProd ? 'PRODUCTION' : 'dev'} server → http://localhost:${PORT}`);
  if (!isProd) {
    console.log(`    Frontend dev server  → http://localhost:3000`);
  } else {
    console.log(`    Serving frontend from ${frontendDist}`);
  }
  console.log(`    Health : GET /api/health\n`);
});
