// ─── Notifications Routes (BIR Deadline Email Reminders) ─────────────────────
// GET  /api/notifications/smtp-status      check email config status
// POST /api/notifications/test             send a test email
// POST /api/notifications/send-reminders   scan upcoming BIR deadlines + email accountants

import { Router } from 'express';
import { db, rowToClient, getSetting } from '../db.js';
import { sendEmail, testEmail } from '../email.js';

const router = Router();

const stmtAccountants = db.prepare("SELECT * FROM users WHERE role='accountant' AND email IS NOT NULL");
const stmtClientsByAccountant = db.prepare('SELECT * FROM clients WHERE accountant_id=?');

function getUpcomingDeadlines(daysAhead = 7) {
  const now    = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 86400000);
  const year   = now.getFullYear();
  const month  = now.getMonth() + 1;
  const deadlines = [];

  const deadline20th = (y, m) => {
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    return new Date(ny, nm - 1, 20);
  };

  for (let lag = 0; lag <= 2; lag++) {
    const m = ((month - 1 - lag + 12) % 12) + 1;
    const y = m > month ? year - 1 : year;
    const d = deadline20th(y, m);
    if (d >= now && d <= cutoff) {
      const monthName = new Date(y, m - 1, 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' });
      deadlines.push({ form: '2550M', period: monthName, due: d.toISOString().substring(0, 10), type: 'VAT' });
      deadlines.push({ form: '2551M', period: monthName, due: d.toISOString().substring(0, 10), type: 'OPT' });
    }
  }

  const qEnds = [
    { q: 1, endMonth: 3, dueDay: 25 }, { q: 2, endMonth: 6, dueDay: 25 },
    { q: 3, endMonth: 9, dueDay: 25 }, { q: 4, endMonth: 12, dueDay: 25 },
  ];
  for (const { q, endMonth, dueDay } of qEnds) {
    const dueMonth = endMonth === 12 ? 1 : endMonth + 1;
    const dueYear  = endMonth === 12 ? year + 1 : year;
    const d = new Date(dueYear, dueMonth - 1, dueDay);
    if (d >= now && d <= cutoff) {
      deadlines.push({ form: '2550Q',   period: `Q${q} ${year}`, due: d.toISOString().substring(0, 10), type: 'VAT' });
      deadlines.push({ form: '2551Q',   period: `Q${q} ${year}`, due: d.toISOString().substring(0, 10), type: 'OPT' });
      deadlines.push({ form: '1601-EQ', period: `Q${q} ${year}`, due: d.toISOString().substring(0, 10), type: 'EWT' });
    }
  }

  return deadlines.sort((a, b) => a.due.localeCompare(b.due));
}

function buildReminderEmail(accountantName, clients, deadlines, fromName) {
  const dl = deadlines.map(d =>
    `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f5">${d.form}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f5">${d.period}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0f0f5;font-weight:600;color:#ff3b30">${d.due}</td>
    </tr>`
  ).join('');
  const cl = clients.map(c =>
    `<li style="margin-bottom:4px">${c.tradeName} (TIN: ${c.tin || '—'}) — ${c.taxRegime === 'opt' ? 'OPT' : 'VAT-Registered'}</li>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;background:#f5f5f7;padding:32px 16px;color:#1d1d1f">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#0071e3;padding:28px 32px">
      <div style="color:#fff;font-size:22px;font-weight:700">${fromName}</div>
      <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:4px">BIR Filing Deadline Reminder</div>
    </div>
    <div style="padding:28px 32px">
      <p style="margin:0 0 16px">Hi ${accountantName},</p>
      <p style="margin:0 0 20px;color:#6e6e73">The following BIR deadlines are coming up in the next 7 days:</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
        <thead><tr style="background:#f5f5f7">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6e6e73">Form</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6e6e73">Period</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#6e6e73">Due Date</th>
        </tr></thead>
        <tbody>${dl}</tbody>
      </table>
      <p style="margin:0 0 10px;font-weight:600">Your clients:</p>
      <ul style="margin:0 0 24px;padding-left:20px;color:#6e6e73;font-size:13px;line-height:1.8">${cl}</ul>
      <p style="font-size:12px;color:#aeaeb2;border-top:1px solid #f0f0f5;padding-top:16px;margin:0">
        Automated reminder from ${fromName}. Verify with BIR-prescribed forms before filing.
      </p>
    </div>
  </div>
</body></html>`;
}

// GET /api/notifications/smtp-status
router.get('/smtp-status', (req, res, next) => {
  try {
    const hasKey = !!process.env.RESEND_API_KEY;
    const smtp   = getSetting('smtp') || {};
    res.json({ enabled: !!smtp.enabled, configured: hasKey });
  } catch (err) { next(err); }
});

// POST /api/notifications/test
router.post('/test', async (req, res, next) => {
  try {
    if (!process.env.RESEND_API_KEY)
      return res.status(400).json({ error: 'RESEND_API_KEY not set in environment variables.' });

    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'to email required' });

    const result = await testEmail(to);
    if (!result.sent) return res.status(500).json({ error: result.reason || 'Failed to send' });
    res.json({ message: `Test email sent to ${to}` });
  } catch (err) { next(err); }
});

// POST /api/notifications/send-reminders
router.post('/send-reminders', async (req, res, next) => {
  try {
    if (!process.env.RESEND_API_KEY)
      return res.status(400).json({ error: 'RESEND_API_KEY not set. Add it to Railway environment variables.' });

    const smtp = getSetting('smtp') || {};
    if (!smtp.enabled)
      return res.status(400).json({ error: 'Email reminders are disabled. Enable them in Settings.' });

    const daysAhead = Number(req.body.daysAhead) || 7;
    const deadlines = getUpcomingDeadlines(daysAhead);
    if (deadlines.length === 0)
      return res.json({ message: 'No deadlines within the window — no emails sent.', sent: 0 });

    const fromName   = smtp.fromName || 'MyLedger';
    const accountants = stmtAccountants.all();
    let sent = 0;
    const errors = [];

    for (const acct of accountants) {
      const clients = stmtClientsByAccountant.all(acct.id).map(rowToClient);
      if (clients.length === 0) continue;

      const hasVAT = clients.some(c => c.taxRegime !== 'opt');
      const hasOPT = clients.some(c => c.taxRegime === 'opt');
      const relevant = deadlines.filter(d =>
        d.type === 'EWT' || (d.type === 'VAT' && hasVAT) || (d.type === 'OPT' && hasOPT)
      );
      if (relevant.length === 0) continue;

      const result = await sendEmail({
        to: acct.email,
        subject: `BIR Filing Reminder — ${relevant.length} deadline${relevant.length !== 1 ? 's' : ''} coming up`,
        html: buildReminderEmail(acct.name || acct.email, clients, relevant, fromName),
        text: `Hi ${acct.name || acct.email}, you have ${relevant.length} BIR deadline(s) coming up.`,
      });

      if (result.sent) sent++;
      else errors.push({ accountant: acct.email, error: result.reason });
    }

    res.json({
      message: `Reminders sent to ${sent} accountant${sent !== 1 ? 's' : ''}.`,
      sent, deadlinesFound: deadlines.length,
      errors: errors.length ? errors : undefined,
    });
  } catch (err) { next(err); }
});

export default router;
