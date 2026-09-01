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
import recurringInvoiceRoutes, { generateDueRecurringInvoices } from './routes/recurring-invoices.js';
import payrollRoutes         from './routes/payroll.js';
import paymentRoutes         from './routes/payments.js';
import monitoringRoutes, { trackActivity } from './routes/monitoring.js';
import importRoutes         from './routes/import.js';
import narrativeRoutes      from './routes/narrative.js';
import receiptsRoutes       from './routes/receipts.js';
import searchRoutes         from './routes/search.js';
import staffRoutes          from './routes/staff.js';
import { getTrialStatus, DRIP_MILESTONES } from './lib/trial.js';
import { getDripEmail }    from './lib/drip-emails.js';



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
app.use('/api/search',           searchRoutes);
app.use('/api/coa',              coaRoutes);
app.use('/api/periods',          periodsRoutes);
app.use('/api/audit',            auditRoutes);
app.use('/api/ocr',              ocrRoutes);
app.use('/api/invitations',      invitationRoutes);
app.use('/api/referrals',        referralRoutes);
app.use('/api/invoices',            invoiceRoutes);
app.use('/api/recurring-invoices',  recurringInvoiceRoutes);
app.use('/api/payroll',             payrollRoutes);
app.use('/api/payments',         paymentRoutes);
app.use('/api/monitoring',       monitoringRoutes);
app.use('/api/import',          importRoutes);
app.use('/api/reports/narrative', narrativeRoutes);
app.use('/api/receipts',          receiptsRoutes);
app.use('/api/staff',            staffRoutes);




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

// ── Trial Drip Email Scheduler ────────────────────────────────────────────────
// Runs once daily (same 8AM PH window). Sends tips to trial users on
// days 3, 7, 14, and 29. Guards per-user so each day only sends once.
async function runTrialDrip() {
  try {
    if (!process.env.RESEND_API_KEY) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastSent = getSetting('trial_drip_last_sent');
    if (lastSent === today) return; // already processed today

    const { sendEmail } = await import('./email.js');

    // Fetch all users who have an active or recently-expired trial
    const users = db.prepare(`
      SELECT * FROM users
      WHERE trial_started_at IS NOT NULL
        AND role IN ('accountant', 'client', 'encoder')
    `).all();

    let sent = 0;
    for (const row of users) {
      const { rowToUser } = await import('./db.js');
      const user = rowToUser(row);
      const { daysElapsed } = getTrialStatus(user);
      const alreadySent = new Set(user.trialDripSent);

      for (const milestone of DRIP_MILESTONES) {
        if (daysElapsed >= milestone && !alreadySent.has(milestone)) {
          const email = getDripEmail(milestone, user);
          if (!email) continue;

          const result = await sendEmail({ to: user.email, ...email });
          if (result.sent) {
            alreadySent.add(milestone);
            db.prepare('UPDATE users SET trial_drip_sent=? WHERE id=?')
              .run(JSON.stringify([...alreadySent]), user.id);
            sent++;
            console.log(`📧 Trial drip day ${milestone} → ${user.email}`);
          }
          break; // only send one milestone per user per run
        }
      }
    }

    setSetting('trial_drip_last_sent', today);
    if (sent > 0) console.log(`📧 Trial drip: ${sent} email(s) sent`);
  } catch (e) {
    console.error('⚠️  Trial drip scheduler error:', e.message);
  }
}

function scheduleTrialDrip() {
  const now  = new Date();
  const utcH = now.getUTCHours();
  // Same window as BIR reminders — 8AM PH = UTC 0:00
  if (utcH === 0) runTrialDrip();
}
setInterval(scheduleTrialDrip, 60 * 60 * 1000);

// ── Invoice Payment Reminder Scheduler ───────────────────────────────────────
// Runs daily at 8AM PH (UTC 0:00).
// Sends overdue reminders to customer_email at 7, 14, and 30 days past due_date.
// Tracks sent reminders via reminder_7_sent_at / reminder_14_sent_at / reminder_30_sent_at
// columns on the invoices table. Each reminder is sent at most once.

// Runtime migrations — add reminder tracking columns if missing
try { db.exec("ALTER TABLE invoices ADD COLUMN reminder_7_sent_at TEXT"); }  catch { /* exists */ }
try { db.exec("ALTER TABLE invoices ADD COLUMN reminder_14_sent_at TEXT"); } catch { /* exists */ }
try { db.exec("ALTER TABLE invoices ADD COLUMN reminder_30_sent_at TEXT"); } catch { /* exists */ }

function buildReminderHtml({ customerName, invoiceNumber, total, daysOverdue, dueDate, publicUrl, businessName, appUrl }) {
  const urgencyColor = daysOverdue >= 30 ? '#dc2626' : daysOverdue >= 14 ? '#d97706' : '#2563eb';
  const urgencyLabel = daysOverdue >= 30 ? 'Final Notice' : daysOverdue >= 14 ? 'Second Reminder' : 'Payment Reminder';
  return `
  <div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 0">
    <div style="background:#111827;padding:20px 28px;border-radius:12px 12px 0 0;display:flex;align-items:center;justify-content:space-between">
      <span style="color:#fff;font-size:20px;font-weight:700">${businessName || 'MyLedger'}</span>
      <span style="background:${urgencyColor};color:#fff;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:4px 10px;border-radius:6px">${urgencyLabel}</span>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <p style="margin:0 0 6px;font-size:16px;color:#111827">Hi ${customerName},</p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6">
        This is a reminder that <strong>Invoice ${invoiceNumber}</strong> was due on
        <strong>${dueDate}</strong> and is now <strong style="color:${urgencyColor}">${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue</strong>.
      </p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:20px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px">Invoice</div>
            <div style="font-size:16px;font-weight:700;color:#111827">${invoiceNumber}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;color:#6b7280;margin-bottom:4px">Amount Due</div>
            <div style="font-size:24px;font-weight:700;color:${urgencyColor}">₱${Number(total).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      </div>
      ${publicUrl ? `<a href="${publicUrl}" style="display:block;text-align:center;background:#111827;color:#fff;text-decoration:none;padding:13px 32px;border-radius:9px;font-size:15px;font-weight:700;margin-bottom:16px">View Invoice →</a>` : ''}
      <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
        If you have already sent payment, please disregard this notice.<br>
        Questions? Reply to this email or contact us directly.
      </p>
    </div>
  </div>`;
}

async function runInvoicePaymentReminders() {
  try {
    if (!process.env.RESEND_API_KEY) return;

    const today     = new Date();
    const todayStr  = today.toISOString().slice(0, 10);
    const appUrl    = process.env.APP_URL || 'https://app.kaimanco.com';
    const { sendEmail } = await import('./email.js');

    // Fetch all 'sent' invoices with a due_date and customer_email
    const overdue = db.prepare(`
      SELECT i.*, c.trade_name as business_name
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.status = 'sent'
        AND i.due_date != ''
        AND i.due_date IS NOT NULL
        AND i.due_date < ?
        AND i.customer_email != ''
        AND i.customer_email IS NOT NULL
    `).all(todayStr);

    const MILESTONES = [
      { days: 7,  col: 'reminder_7_sent_at',  sentField: 'reminder_7_sent_at' },
      { days: 14, col: 'reminder_14_sent_at', sentField: 'reminder_14_sent_at' },
      { days: 30, col: 'reminder_30_sent_at', sentField: 'reminder_30_sent_at' },
    ];

    let sent = 0;
    for (const inv of overdue) {
      const dueDate    = new Date(inv.due_date + 'T00:00:00');
      const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
      const publicUrl  = inv.share_token ? `${appUrl}/invoice/${inv.share_token}` : null;
      const dueDateStr = dueDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

      for (const m of MILESTONES) {
        if (daysOverdue < m.days) continue;           // not yet due for this milestone
        if (inv[m.sentField]) continue;               // already sent

        const result = await sendEmail({
          to:      inv.customer_email,
          subject: `Payment Reminder: Invoice ${inv.invoice_number} is ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`,
          html:    buildReminderHtml({
            customerName:  inv.customer_name,
            invoiceNumber: inv.invoice_number,
            total:         inv.total,
            daysOverdue,
            dueDate:       dueDateStr,
            publicUrl,
            businessName:  inv.business_name,
            appUrl,
          }),
          text: `Hi ${inv.customer_name},\n\nThis is a reminder that Invoice ${inv.invoice_number} (₱${Number(inv.total).toLocaleString()}) was due on ${dueDateStr} and is now ${daysOverdue} days overdue.\n\n${publicUrl ? `View invoice: ${publicUrl}\n\n` : ''}If you have already sent payment, please disregard this notice.\n\nThank you.`,
        });

        if (result.sent) {
          db.prepare(`UPDATE invoices SET ${m.col} = ? WHERE id = ?`).run(todayStr, inv.id);
          console.log(`📧 Invoice reminder (${m.days}d) → ${inv.customer_email} | ${inv.invoice_number}`);
          sent++;
          break; // send only the highest applicable reminder per run
        }
      }
    }

    if (sent > 0) console.log(`📬 Invoice payment reminders: ${sent} sent`);
  } catch (e) {
    console.error('⚠️  Invoice reminder scheduler error:', e.message);
  }
}

function scheduleInvoiceReminders() {
  const now  = new Date();
  const utcH = now.getUTCHours();
  // 8AM PH = 0:00 UTC — same window as other daily schedulers
  if (utcH === 0) runInvoicePaymentReminders();
}
// Run on startup to catch any missed sends, then every hour
runInvoicePaymentReminders();
setInterval(scheduleInvoiceReminders, 60 * 60 * 1000);


// -- Recurring Invoice Scheduler ------------------------------------------
// Runs daily at 8AM PH (UTC 0:00).
// Generates invoices for all active recurring schedules due today or earlier.
async function runRecurringInvoices() {
  try {
    if (!process.env.RESEND_API_KEY) {
      await generateDueRecurringInvoices(null);
      return;
    }
    const { sendEmail } = await import('./email.js');
    await generateDueRecurringInvoices(sendEmail);
  } catch (e) {
    console.error('Recurring invoice scheduler error:', e.message);
  }
}

function scheduleRecurringInvoices() {
  const now  = new Date();
  const utcH = now.getUTCHours();
  if (utcH === 0) runRecurringInvoices();
}
// Run on startup to catch any missed generations, then every hour
runRecurringInvoices();
setInterval(scheduleRecurringInvoices, 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`
✅  MyLedger ${isProd ? 'PRODUCTION' : 'dev'} server → http://localhost:${PORT}`);
  if (!isProd) {
    console.log(`    Frontend dev server  → http://localhost:3000`);
  } else {
    console.log(`    Serving frontend from ${frontendDist}`);
  }
  console.log(`    Health : GET /api/health
`);
});