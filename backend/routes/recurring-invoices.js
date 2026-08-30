// ─── Recurring Invoices ───────────────────────────────────────────────────────
// Manages recurring invoice schedules (monthly retainers, weekly billing, etc.)
// The scheduler in app.js calls generateDueRecurringInvoices() daily.
//
// POST   /api/recurring-invoices           Create schedule
// GET    /api/recurring-invoices?clientId= List schedules for a client
// GET    /api/recurring-invoices/:id       Get one schedule
// PUT    /api/recurring-invoices/:id       Update schedule
// POST   /api/recurring-invoices/:id/pause  Pause (status → paused)
// POST   /api/recurring-invoices/:id/resume Resume (status → active)
// DELETE /api/recurring-invoices/:id       Cancel (status → cancelled)

import { Router }    from 'express';
import { v4 as uuid } from 'uuid';
import { db }         from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── Schema ────────────────────────────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_invoices (
      id                TEXT PRIMARY KEY,
      client_id         TEXT NOT NULL,
      created_by        TEXT NOT NULL,
      -- Customer
      customer_name     TEXT NOT NULL,
      customer_email    TEXT DEFAULT '',
      customer_address  TEXT DEFAULT '',
      customer_tin      TEXT DEFAULT '',
      -- Invoice defaults
      invoice_prefix    TEXT DEFAULT 'INV',
      notes             TEXT DEFAULT '',
      vat_type          TEXT DEFAULT 'vatable',
      payment_terms     TEXT DEFAULT 'Due on Receipt',
      due_days          INTEGER DEFAULT 30,
      -- Schedule
      frequency         TEXT NOT NULL DEFAULT 'monthly',
      next_run_date     TEXT NOT NULL,
      last_run_date     TEXT,
      end_date          TEXT,
      max_invoices      INTEGER,
      -- State
      status            TEXT NOT NULL DEFAULT 'active',
      total_generated   INTEGER DEFAULT 0,
      -- Line items (JSON)
      items             TEXT NOT NULL DEFAULT '[]',
      created_at        TEXT DEFAULT (datetime('now')),
      updated_at        TEXT DEFAULT (datetime('now'))
    )
  `);
} catch { /* already exists */ }

// ── Helpers ───────────────────────────────────────────────────────────────────
function canAccess(clientId, userId, role) {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(clientId);
  if (!c) return false;
  if (role === 'admin') return true;
  const encoders = JSON.parse(c.encoder_ids || '[]');
  return c.owner_id === userId || c.accountant_id === userId || encoders.includes(userId);
}

function rowToSchedule(r) {
  if (!r) return null;
  return {
    ...r,
    items: r.items ? JSON.parse(r.items) : [],
    max_invoices: r.max_invoices || null,
    end_date:     r.end_date     || null,
    last_run_date: r.last_run_date || null,
  };
}

/** Advance next_run_date by one frequency period */
export function advanceDate(dateStr, frequency) {
  const d = new Date(dateStr + 'T00:00:00');
  switch (frequency) {
    case 'weekly':    d.setDate(d.getDate() + 7);     break;
    case 'monthly':   d.setMonth(d.getMonth() + 1);   break;
    case 'quarterly': d.setMonth(d.getMonth() + 3);   break;
    case 'annual':    d.setFullYear(d.getFullYear() + 1); break;
    default:          d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().slice(0, 10);
}

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/recurring-invoices?clientId=
// ══════════════════════════════════════════════════════════════════════════════
router.get('/', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    if (!canAccess(clientId, req.userId, req.userRole))
      return res.status(403).json({ error: 'Forbidden' });

    const rows = db.prepare(
      `SELECT * FROM recurring_invoices WHERE client_id=? ORDER BY created_at DESC`
    ).all(clientId);

    res.json(rows.map(rowToSchedule));
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/recurring-invoices/:id
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM recurring_invoices WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!canAccess(row.client_id, req.userId, req.userRole))
      return res.status(403).json({ error: 'Forbidden' });
    res.json(rowToSchedule(row));
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/recurring-invoices — Create schedule
// ══════════════════════════════════════════════════════════════════════════════
router.post('/', (req, res, next) => {
  try {
    const {
      client_id,
      customer_name,
      customer_email   = '',
      customer_address = '',
      customer_tin     = '',
      invoice_prefix   = 'INV',
      notes            = '',
      vat_type         = 'vatable',
      payment_terms    = 'Due on Receipt',
      due_days         = 30,
      frequency        = 'monthly',
      start_date,          // first run date (defaults to today)
      end_date,
      max_invoices,
      items            = [],
    } = req.body;

    if (!customer_name)  return res.status(400).json({ error: 'customer_name required' });
    if (!items.length)   return res.status(400).json({ error: 'At least one item required' });
    if (!['weekly','monthly','quarterly','annual'].includes(frequency))
      return res.status(400).json({ error: 'frequency must be weekly|monthly|quarterly|annual' });

    const targetClientId = client_id || (() => {
      if (req.userRole === 'client') {
        const c = db.prepare('SELECT id FROM clients WHERE owner_id=?').get(req.userId);
        return c?.id || null;
      }
      return null;
    })();
    if (!targetClientId) return res.status(400).json({ error: 'client_id required' });
    if (!canAccess(targetClientId, req.userId, req.userRole))
      return res.status(403).json({ error: 'Forbidden' });

    const today         = new Date().toISOString().slice(0, 10);
    const next_run_date = start_date || today;
    const id            = uuid();
    const now           = new Date().toISOString();

    db.prepare(`
      INSERT INTO recurring_invoices
        (id, client_id, created_by, customer_name, customer_email,
         customer_address, customer_tin, invoice_prefix, notes, vat_type,
         payment_terms, due_days, frequency, next_run_date, end_date,
         max_invoices, status, total_generated, items, created_at, updated_at)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, targetClientId, req.userId,
      customer_name, customer_email, customer_address, customer_tin,
      invoice_prefix, notes, vat_type, payment_terms,
      Number(due_days) || 30, frequency, next_run_date,
      end_date || null, max_invoices ? Number(max_invoices) : null,
      'active', 0, JSON.stringify(items), now, now
    );

    res.status(201).json(rowToSchedule(db.prepare('SELECT * FROM recurring_invoices WHERE id=?').get(id)));
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/recurring-invoices/:id — Update schedule
// ══════════════════════════════════════════════════════════════════════════════
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM recurring_invoices WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!canAccess(row.client_id, req.userId, req.userRole))
      return res.status(403).json({ error: 'Forbidden' });

    const {
      customer_name, customer_email, customer_address, customer_tin,
      invoice_prefix, notes, vat_type, payment_terms, due_days,
      frequency, next_run_date, end_date, max_invoices, items,
    } = req.body;

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE recurring_invoices SET
        customer_name=?, customer_email=?, customer_address=?, customer_tin=?,
        invoice_prefix=?, notes=?, vat_type=?, payment_terms=?, due_days=?,
        frequency=?, next_run_date=?, end_date=?, max_invoices=?,
        items=?, updated_at=?
      WHERE id=?
    `).run(
      customer_name    ?? row.customer_name,
      customer_email   ?? row.customer_email,
      customer_address ?? row.customer_address,
      customer_tin     ?? row.customer_tin,
      invoice_prefix   ?? row.invoice_prefix,
      notes            ?? row.notes,
      vat_type         ?? row.vat_type,
      payment_terms    ?? row.payment_terms,
      due_days         != null ? Number(due_days) : row.due_days,
      frequency        ?? row.frequency,
      next_run_date    ?? row.next_run_date,
      end_date         !== undefined ? (end_date || null) : row.end_date,
      max_invoices     != null ? Number(max_invoices) : row.max_invoices,
      items            ? JSON.stringify(items) : row.items,
      now, req.params.id
    );

    res.json(rowToSchedule(db.prepare('SELECT * FROM recurring_invoices WHERE id=?').get(req.params.id)));
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/recurring-invoices/:id/pause | /resume | DELETE (cancel)
// ══════════════════════════════════════════════════════════════════════════════
function setStatus(targetStatus) {
  return (req, res, next) => {
    try {
      const row = db.prepare('SELECT * FROM recurring_invoices WHERE id=?').get(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      if (!canAccess(row.client_id, req.userId, req.userRole))
        return res.status(403).json({ error: 'Forbidden' });
      db.prepare('UPDATE recurring_invoices SET status=?, updated_at=? WHERE id=?')
        .run(targetStatus, new Date().toISOString(), req.params.id);
      res.json({ status: targetStatus });
    } catch (err) { next(err); }
  };
}

router.post('/:id/pause',   setStatus('paused'));
router.post('/:id/resume',  setStatus('active'));
router.delete('/:id',       setStatus('cancelled'));

// ══════════════════════════════════════════════════════════════════════════════
// Exported scheduler function — called by app.js daily
// Generates invoices for all active schedules whose next_run_date <= today
// ══════════════════════════════════════════════════════════════════════════════
export async function generateDueRecurringInvoices(sendEmailFn) {
  const today = new Date().toISOString().slice(0, 10);

  const due = db.prepare(`
    SELECT * FROM recurring_invoices
    WHERE status = 'active'
      AND next_run_date <= ?
  `).all(today);

  let generated = 0;

  for (const sched of due) {
    try {
      // Check end conditions
      if (sched.end_date && sched.end_date < today) {
        db.prepare("UPDATE recurring_invoices SET status='cancelled', updated_at=? WHERE id=?")
          .run(new Date().toISOString(), sched.id);
        continue;
      }
      if (sched.max_invoices && sched.total_generated >= sched.max_invoices) {
        db.prepare("UPDATE recurring_invoices SET status='cancelled', updated_at=? WHERE id=?")
          .run(new Date().toISOString(), sched.id);
        continue;
      }

      const items    = JSON.parse(sched.items || '[]');
      const vatType  = sched.vat_type || 'vatable';

      // Calculate totals (same logic as invoices.js calcTotals)
      let subtotal = 0, reimbursement_total = 0, vat_amount = 0;
      for (const item of items) {
        const lineAmt     = Math.round((item.quantity || 1) * (item.unit_price || 0) * 100) / 100;
        const lineVatType = item.line_vat_type || vatType;
        if (lineVatType === 'reimbursement') { reimbursement_total += lineAmt; }
        else { subtotal += lineAmt; vat_amount += Math.round(lineAmt * 0.12 * 100) / 100; }
      }
      subtotal            = Math.round(subtotal            * 100) / 100;
      reimbursement_total = Math.round(reimbursement_total * 100) / 100;
      vat_amount          = Math.round(vat_amount          * 100) / 100;
      const total         = Math.round((subtotal + vat_amount + reimbursement_total) * 100) / 100;

      // Generate invoice number (reuse sequence logic)
      const year = new Date().getFullYear();
      const prefix = sched.invoice_prefix || 'INV';
      const seq = db.prepare(
        'SELECT last_number FROM invoice_sequences WHERE client_id=? AND year=?'
      ).get(sched.client_id, year);
      let nextNum;
      if (seq) {
        nextNum = seq.last_number + 1;
        db.prepare('UPDATE invoice_sequences SET last_number=? WHERE client_id=? AND year=?')
          .run(nextNum, sched.client_id, year);
      } else {
        nextNum = 1;
        db.prepare('INSERT INTO invoice_sequences (client_id, year, last_number) VALUES (?,?,?)')
          .run(sched.client_id, year, 1);
      }
      const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;

      // Share token
      const shareToken  = uuid().replace(/-/g, '');
      const invoiceId   = uuid();
      const issueDate   = today;
      const dueDate     = (() => {
        const d = new Date(today + 'T00:00:00');
        d.setDate(d.getDate() + (sched.due_days || 30));
        return d.toISOString().slice(0, 10);
      })();
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO invoices
          (id, client_id, invoice_number, invoice_prefix,
           customer_name, customer_email, customer_address, customer_tin,
           issue_date, due_date, payment_terms, notes, vat_type,
           subtotal, reimbursement_total, vat_amount, total,
           share_token, status, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'sent',?,?,?)
      `).run(
        invoiceId, sched.client_id, invoiceNumber, prefix,
        sched.customer_name, sched.customer_email, sched.customer_address, sched.customer_tin,
        issueDate, dueDate, sched.payment_terms, sched.notes, vatType,
        subtotal, reimbursement_total, vat_amount, total,
        shareToken, sched.created_by, now, now
      );

      const insertItem = db.prepare(`
        INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount, line_vat_type)
        VALUES (?,?,?,?,?,?,?)
      `);
      for (const item of items) {
        insertItem.run(
          uuid(), invoiceId, item.description,
          item.quantity   || 1,
          item.unit_price || 0,
          Math.round((item.quantity || 1) * (item.unit_price || 0) * 100) / 100,
          item.line_vat_type || vatType
        );
      }

      // Advance schedule
      const nextRun = advanceDate(today, sched.frequency);
      db.prepare(`
        UPDATE recurring_invoices SET
          next_run_date=?, last_run_date=?, total_generated=total_generated+1, updated_at=?
        WHERE id=?
      `).run(nextRun, today, now, sched.id);

      generated++;
      console.log(`🔁 Recurring invoice generated: ${invoiceNumber} → ${sched.customer_name}`);

      // Send invoice email if customer_email set
      if (sched.customer_email && sendEmailFn) {
        const appUrl = process.env.APP_URL || 'https://app.kaimanco.com';
        const pubUrl = `${appUrl}/invoice/${shareToken}`;
        const biz    = db.prepare('SELECT trade_name FROM clients WHERE id=?').get(sched.client_id);
        await sendEmailFn({
          to:      sched.customer_email,
          subject: `Invoice ${invoiceNumber} from ${biz?.trade_name || 'MyLedger'}`,
          html: `
            <div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 0">
              <div style="background:#111827;padding:20px 28px;border-radius:12px 12px 0 0">
                <span style="color:#fff;font-size:20px;font-weight:700">${biz?.trade_name || 'MyLedger'}</span>
              </div>
              <div style="background:#fff;padding:28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
                <p style="margin:0 0 8px;font-size:16px;color:#111827">Hi ${sched.customer_name},</p>
                <p style="margin:0 0 20px;font-size:14px;color:#6b7280">Please find your invoice for this period below.</p>
                <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
                  <div><div style="font-size:12px;color:#6b7280">Invoice</div><div style="font-size:16px;font-weight:700">${invoiceNumber}</div></div>
                  <div style="text-align:right"><div style="font-size:12px;color:#6b7280">Amount Due</div><div style="font-size:22px;font-weight:700;color:#0071e3">₱${total.toLocaleString('en-PH',{minimumFractionDigits:2})}</div></div>
                </div>
                <div style="margin-bottom:16px;font-size:13px;color:#6b7280">Due date: <strong style="color:#111827">${dueDate}</strong></div>
                <a href="${pubUrl}" style="display:block;text-align:center;background:#111827;color:#fff;text-decoration:none;padding:13px;border-radius:9px;font-size:15px;font-weight:700;margin-bottom:16px">View & Pay Invoice →</a>
                <p style="margin:0;font-size:12px;color:#9ca3af">Questions? Reply to this email.</p>
              </div>
            </div>`,
          text: `Hi ${sched.customer_name},\n\nInvoice ${invoiceNumber} for ₱${total.toLocaleString()} is due on ${dueDate}.\n\nView invoice: ${pubUrl}`,
        }).catch(e => console.error('Recurring invoice email error:', e.message));
      }
    } catch (e) {
      console.error(`⚠️  Recurring invoice error (id: ${sched.id}):`, e.message);
    }
  }

  if (generated > 0) console.log(`🔁 Recurring invoices: ${generated} generated`);
  return generated;
}

export default router;
