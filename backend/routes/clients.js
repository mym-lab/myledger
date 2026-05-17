// ─── Client (Business) Routes ─────────────────────────────────────────────────
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToTx, withTransaction, getSetting } from '../db.js';
import { sendEmail } from '../email.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtAllClients  = db.prepare('SELECT * FROM clients');
const stmtClientById  = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertClient = db.prepare(`
  INSERT INTO clients
    (id, owner_id, accountant_id, encoder_ids, trade_name, tin, address,
     business_type, type, tax_regime, opt_rate, birthday, subscription_tier, tax_types, created_at)
  VALUES
    (@id, @owner_id, @accountant_id, @encoder_ids, @trade_name, @tin, @address,
     @business_type, @type, @tax_regime, @opt_rate, @birthday, @subscription_tier, @tax_types, @created_at)
`);
const stmtUpdateClient = db.prepare(`
  UPDATE clients SET
    trade_name=@trade_name, tin=@tin, type=@type, address=@address,
    business_type=@business_type, tax_regime=@tax_regime, opt_rate=@opt_rate,
    birthday=@birthday, subscription_tier=@subscription_tier, tax_types=@tax_types
  WHERE id=@id
`);
const stmtDeleteClient = db.prepare('DELETE FROM clients WHERE id = ?');
const stmtSetAccountant = db.prepare('UPDATE clients SET accountant_id=? WHERE id=?');
const stmtSetEncoders   = db.prepare('UPDATE clients SET encoder_ids=? WHERE id=?');
const stmtTxsByClient     = db.prepare('SELECT * FROM transactions WHERE client_id=?');
const stmtDeleteTx        = db.prepare('DELETE FROM transactions    WHERE client_id=?');
const stmtDeleteJE        = db.prepare('DELETE FROM journal_entries WHERE client_id=?');
const stmtDeleteAssets    = db.prepare('DELETE FROM assets          WHERE client_id=?');
const stmtDeleteContacts  = db.prepare('DELETE FROM contacts        WHERE client_id=?');
const stmtDeleteCOA       = db.prepare('DELETE FROM coa             WHERE client_id=?');
const stmtDeletePeriods   = db.prepare('DELETE FROM locked_periods  WHERE client_id=?');
const stmtDeleteAudit     = db.prepare('DELETE FROM audit_log       WHERE client_id=?');
const stmtUserByEmail   = db.prepare('SELECT * FROM users WHERE email=? AND role=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}
function canEncode(client, userId) {
  return (client.encoderIds || []).includes(userId);
}
function anyAccess(client, userId) {
  return canAccess(client, userId) || canEncode(client, userId);
}

// GET /api/clients
router.get('/', (req, res, next) => {
  try {
    const userRow = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
    const isAdmin = userRow?.role === 'admin';
    const clients = stmtAllClients.all()
      .map(rowToClient)
      .filter(c => isAdmin || anyAccess(c, req.userId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ clients });
  } catch (err) { next(err); }
});

// POST /api/clients
router.post('/', (req, res, next) => {
  try {
    const {
      tradeName, tin, type, address = '', businessType = '',
      ownerBirthdate = '', subscriptionTier = 'free',
      taxRegime = 'vat', optRate = 0.03,
      taxTypes = [],
    } = req.body;
    if (!tradeName || !tin)
      return res.status(400).json({ error: 'tradeName and tin are required' });

    const userRow = db.prepare('SELECT * FROM users WHERE id=?').get(req.userId);
    const role    = userRow?.role || 'client';

    const id = uuid();
    stmtInsertClient.run({
      id,
      // admin can also own a client directly (for testing / demo purposes)
      owner_id:          (role === 'client' || role === 'admin') ? req.userId : null,
      accountant_id:     role === 'accountant' ? req.userId : null,
      encoder_ids:       '[]',
      trade_name:        tradeName,
      tin,
      address,
      business_type:     businessType,
      type:              type || 'Corporation',
      tax_regime:        taxRegime,
      opt_rate:          Number(optRate) || 0.03,
      birthday:          ownerBirthdate || null,
      subscription_tier: subscriptionTier,
      tax_types:         JSON.stringify(Array.isArray(taxTypes) ? taxTypes : []),
      created_at:        new Date().toISOString(),
    });

    const client = rowToClient(stmtClientById.get(id));
    res.status(201).json({ client });
  } catch (err) { next(err); }
});

// GET /api/clients/:id
router.get('/:id', (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.id));
    if (!client || !anyAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });
    res.json({ client });
  } catch (err) { next(err); }
});

// PUT /api/clients/:id
router.put('/:id', (req, res, next) => {
  try {
    const existing = rowToClient(stmtClientById.get(req.params.id));
    if (!existing || !canAccess(existing, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const {
      tradeName, tin, type, address, businessType,
      ownerBirthdate, subscriptionTier, taxRegime, optRate, taxTypes,
    } = req.body;

    stmtUpdateClient.run({
      id:                req.params.id,
      trade_name:        tradeName        ?? existing.tradeName,
      tin:               tin              ?? existing.tin,
      type:              type             ?? existing.type,
      address:           address          ?? existing.address,
      business_type:     businessType     ?? existing.businessType,
      tax_regime:        taxRegime        ?? existing.taxRegime,
      opt_rate:          optRate != null ? Number(optRate) : existing.optRate,
      birthday:          ownerBirthdate   ?? existing.birthday,
      subscription_tier: subscriptionTier ?? existing.subscriptionTier,
      tax_types:         taxTypes != null
                           ? JSON.stringify(Array.isArray(taxTypes) ? taxTypes : [])
                           : JSON.stringify(existing.taxTypes || []),
    });

    const client = rowToClient(stmtClientById.get(req.params.id));
    res.json({ client });
  } catch (err) { next(err); }
});

// DELETE /api/clients/:id
router.delete('/:id', (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.id));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    withTransaction(() => {
      stmtDeleteTx.run(req.params.id);
      stmtDeleteJE.run(req.params.id);
      stmtDeleteAssets.run(req.params.id);
      stmtDeleteContacts.run(req.params.id);
      stmtDeleteCOA.run(req.params.id);
      stmtDeletePeriods.run(req.params.id);
      stmtDeleteAudit.run(req.params.id);
      stmtDeleteClient.run(req.params.id);
    });
    res.json({ message: 'Client and all related data deleted' });
  } catch (err) { next(err); }
});

// GET /api/clients/:id/backup  — full snapshot (all related data)
router.get('/:id/backup', (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.id));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const id = req.params.id;

    const transactions   = db.prepare('SELECT * FROM transactions   WHERE client_id=?').all(id);
    const journalEntries = db.prepare('SELECT * FROM journal_entries WHERE client_id=?').all(id);
    const assets         = db.prepare('SELECT * FROM assets          WHERE client_id=?').all(id);
    const coa            = db.prepare('SELECT * FROM coa             WHERE client_id=?').all(id);
    const contacts       = db.prepare('SELECT * FROM contacts        WHERE client_id=?').all(id);
    const periods        = db.prepare('SELECT * FROM locked_periods  WHERE client_id=?').all(id);
    const invoices       = db.prepare('SELECT * FROM invoices        WHERE client_id=?').all(id);
    const invoiceItems   = invoices.length
      ? db.prepare(
          `SELECT * FROM invoice_items WHERE invoice_id IN (${invoices.map(() => '?').join(',')})`
        ).all(...invoices.map(i => i.id))
      : [];

    const safeName = client.tradeName.replace(/[^a-zA-Z0-9]/g, '-');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="myledger-backup-${safeName}-${Date.now()}.json"`);
    res.json({
      version:     2,
      exportedAt:  new Date().toISOString(),
      client,
      transactions,
      journalEntries,
      assets,
      coa,
      contacts,
      periods,
      invoices,
      invoiceItems,
    });
  } catch (err) { next(err); }
});

// POST /api/clients/restore  — admin only, restores a full backup JSON
// Accepts the JSON produced by GET /api/clients/:id/backup (version 2).
// Safe: if a client with the same ID already exists the restore is SKIPPED
// (returns a 409) so live data is never overwritten accidentally.
// To force-restore over existing data, pass ?force=true.
router.post('/restore', (req, res, next) => {
  try {
    // Admin or owner only
    const userRow = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
    if (userRow?.role !== 'admin')
      return res.status(403).json({ error: 'Only admins can restore backups' });

    const backup = req.body;
    if (!backup?.client || !backup?.exportedAt)
      return res.status(400).json({ error: 'Invalid backup file — missing client or exportedAt' });

    const { client, transactions = [], journalEntries = [], assets = [],
            coa = [], contacts = [], periods = [], invoices = [], invoiceItems = [] } = backup;

    // Check if this client already exists
    const existing = db.prepare('SELECT id FROM clients WHERE id=?').get(client.id);
    if (existing && req.query.force !== 'true')
      return res.status(409).json({
        error: `Client "${client.tradeName}" (ID: ${client.id}) already exists. Pass ?force=true to overwrite.`,
        clientId: client.id,
      });

    const now = new Date().toISOString();

    db.exec('BEGIN');
    try {
      if (existing) {
        // Force-overwrite: delete everything for this client first
        db.prepare('DELETE FROM transactions   WHERE client_id=?').run(client.id);
        db.prepare('DELETE FROM journal_entries WHERE client_id=?').run(client.id);
        db.prepare('DELETE FROM assets          WHERE client_id=?').run(client.id);
        db.prepare('DELETE FROM coa             WHERE client_id=?').run(client.id);
        db.prepare('DELETE FROM contacts        WHERE client_id=?').run(client.id);
        db.prepare('DELETE FROM locked_periods  WHERE client_id=?').run(client.id);
        const oldInvoices = db.prepare('SELECT id FROM invoices WHERE client_id=?').all(client.id);
        for (const inv of oldInvoices)
          db.prepare('DELETE FROM invoice_items WHERE invoice_id=?').run(inv.id);
        db.prepare('DELETE FROM invoices WHERE client_id=?').run(client.id);
        db.prepare('DELETE FROM clients  WHERE id=?').run(client.id);
      }

      // Restore client
      db.prepare(`
        INSERT INTO clients (id, owner_id, accountant_id, encoder_ids, trade_name, tin, address,
          business_type, type, tax_regime, opt_rate, birthday, subscription_tier, tax_types, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        client.id, client.ownerId, client.accountantId || null,
        JSON.stringify(client.encoderIds || []),
        client.tradeName, client.tin, client.address || '',
        client.businessType || '', client.type || 'Corporation',
        client.taxRegime || 'vat', client.optRate || 0.03,
        client.birthday || null, client.subscriptionTier || 'free',
        JSON.stringify(client.taxTypes || []),
        client.createdAt || now,
      );

      // Restore transactions
      const txStmt = db.prepare(`
        INSERT OR IGNORE INTO transactions
          (id, client_id, user_id, type, description, category, account, vat_type,
           supplier_vat_type, settlement, settlement_account, counterparty_name,
           counterparty_tin, counterparty_address, reference_no, notes,
           amount_net, amount_vat, amount_gross, percentage_tax, ewt_rate, ewt_amount,
           voided_at, voided_by, void_reason, invoice_id, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const t of transactions) {
        txStmt.run(
          t.id, client.id, t.user_id || t.userId || req.userId,
          t.type, t.description || '', t.category || '', t.account || '',
          t.vat_type || t.vatType || 'vatable',
          t.supplier_vat_type || t.supplierVatType || null,
          t.settlement || 'cash', t.settlement_account || t.settlementAccount || null,
          t.counterparty_name || t.counterpartyName || null,
          t.counterparty_tin  || t.counterpartyTin  || null,
          t.counterparty_address || t.counterpartyAddress || null,
          t.reference_no || t.referenceNo || null,
          t.notes || null,
          t.amount_net, t.amount_vat, t.amount_gross,
          t.percentage_tax || t.percentageTax || null,
          t.ewt_rate || t.ewtRate || null,
          t.ewt_amount || t.ewtAmount || null,
          t.voided_at || t.voidedAt || null,
          t.voided_by || t.voidedBy || null,
          t.void_reason || t.voidReason || null,
          t.invoice_id || t.invoiceId || null,
          t.created_at || t.createdAt || now,
        );
      }

      // Restore journal entries
      const jeStmt = db.prepare(`
        INSERT OR IGNORE INTO journal_entries (id, client_id, user_id, date, description, reference_no, entries, created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      for (const je of journalEntries) {
        jeStmt.run(
          je.id, client.id, je.user_id || je.userId || req.userId,
          je.date, je.description || '', je.reference_no || je.referenceNo || null,
          typeof je.entries === 'string' ? je.entries : JSON.stringify(je.entries || []),
          je.created_at || je.createdAt || now,
        );
      }

      // Restore assets
      const assetStmt = db.prepare(`
        INSERT OR IGNORE INTO assets (id, client_id, name, category, cost, salvage_value, useful_life_months, start_date, status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `);
      for (const a of assets) {
        assetStmt.run(
          a.id, client.id, a.name, a.category || '',
          a.cost, a.salvage_value || a.salvageValue || 0,
          a.useful_life_months || a.usefulLifeMonths || 60,
          a.start_date || a.startDate, a.status || 'active',
          a.created_at || a.createdAt || now,
        );
      }

      // Restore COA
      const coaStmt = db.prepare(`
        INSERT OR IGNORE INTO coa (id, client_id, code, name, category, type, normal_balance, created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `);
      for (const c of coa) {
        coaStmt.run(
          c.id, client.id, c.code, c.name, c.category || '',
          c.type || '', c.normal_balance || c.normalBalance || 'debit',
          c.created_at || c.createdAt || now,
        );
      }

      // Restore contacts
      const contactStmt = db.prepare(`
        INSERT OR IGNORE INTO contacts (id, client_id, user_id, name, type, tin, address, phone, email, notes, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const c of contacts) {
        contactStmt.run(
          c.id, client.id, c.user_id || c.userId || req.userId,
          c.name, c.type || 'vendor', c.tin || null, c.address || null,
          c.phone || null, c.email || null, c.notes || null,
          c.created_at || c.createdAt || now,
        );
      }

      // Restore period locks
      const periodStmt = db.prepare(`
        INSERT OR IGNORE INTO locked_periods (id, client_id, period, locked_by, locked_at)
        VALUES (?,?,?,?,?)
      `);
      for (const p of periods) {
        periodStmt.run(
          p.id, client.id, p.period,
          p.locked_by || p.lockedBy || req.userId,
          p.locked_at || p.lockedAt || now,
        );
      }

      // Restore invoices + items
      const invStmt = db.prepare(`
        INSERT OR IGNORE INTO invoices
          (id, client_id, invoice_number, invoice_prefix, customer_name, customer_email,
           customer_address, customer_tin, issue_date, due_date, payment_terms, notes,
           vat_type, subtotal, vat_amount, total, reimbursement_total, status, share_token,
           transaction_id, reversal_transaction_id, void_reason, voided_by, voided_at,
           sent_at, paid_at, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      for (const inv of invoices) {
        invStmt.run(
          inv.id, client.id, inv.invoice_number, inv.invoice_prefix || 'INV',
          inv.customer_name, inv.customer_email || '',
          inv.customer_address || '', inv.customer_tin || '',
          inv.issue_date, inv.due_date || '', inv.payment_terms || 'Due on Receipt',
          inv.notes || '', inv.vat_type || 'vatable',
          inv.subtotal || 0, inv.vat_amount || 0, inv.total || 0,
          inv.reimbursement_total || 0,
          inv.status || 'draft', inv.share_token || null,
          inv.transaction_id || '', inv.reversal_transaction_id || '',
          inv.void_reason || '', inv.voided_by || '', inv.voided_at || '',
          inv.sent_at || '', inv.paid_at || '',
          inv.created_by || req.userId,
          inv.created_at || now, inv.updated_at || now,
        );
      }
      const itemStmt = db.prepare(`
        INSERT OR IGNORE INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount, line_vat_type)
        VALUES (?,?,?,?,?,?,?)
      `);
      for (const item of invoiceItems) {
        itemStmt.run(
          item.id, item.invoice_id, item.description,
          item.quantity || 1, item.unit_price || 0, item.amount || 0,
          item.line_vat_type || 'vatable',
        );
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({
      message:  `Backup restored successfully for "${client.tradeName}"`,
      clientId: client.id,
      restored: {
        transactions:   transactions.length,
        journalEntries: journalEntries.length,
        assets:         assets.length,
        coa:            coa.length,
        contacts:       contacts.length,
        invoices:       invoices.length,
      },
    });
  } catch (err) { next(err); }
});

// PUT /api/clients/:id/assign-accountant
router.put('/:id/assign-accountant', async (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.id));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const { accountantEmail } = req.body;
    if (!accountantEmail) return res.status(400).json({ error: 'accountantEmail is required' });

    // ── Case 1: accountant already registered → assign immediately ─────────────
    const accountant = stmtUserByEmail.get(accountantEmail, 'accountant');
    if (accountant) {
      stmtSetAccountant.run(accountant.id, req.params.id);
      return res.json({ assigned: true, message: `${accountant.name} assigned as accountant` });
    }

    // ── Case 2: not registered → create invitation + send email ────────────────
    const token     = uuid();
    const now       = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    // Cancel any previous pending invite for this client+email
    db.prepare("UPDATE invitations SET status='cancelled' WHERE client_id=? AND email=? AND status='pending'")
      .run(req.params.id, accountantEmail);

    // Create new invite
    db.prepare(`INSERT INTO invitations (id, token, client_id, email, status, created_at, expires_at)
                VALUES (?, ?, ?, ?, 'pending', ?, ?)`)
      .run(uuid(), token, req.params.id, accountantEmail, now, expiresAt);

    // Send email if SMTP configured (non-blocking — failure won't break the response)
    const smtp = getSetting('smtp') || {};
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const inviteUrl = `${appUrl}?invite=${token}`;

    let emailSent = false;
    if (process.env.RESEND_API_KEY) {
      const smtp = getSetting('smtp') || {};
      const fromLabel = smtp.fromName || 'MyLedger';
      const result = await sendEmail({
        to:      accountantEmail,
        subject: `${client.tradeName} has invited you to manage their books on MyLedger`,
        html:    buildInviteEmail(client.tradeName, fromLabel, inviteUrl),
        text:    `You've been invited to manage ${client.tradeName} on MyLedger. Accept here: ${inviteUrl}`,
      });
      emailSent = result.sent;
      if (!result.sent) console.error('⚠️  Invite email failed (non-fatal):', result.reason);
    }

    return res.json({
      invited:   true,
      emailSent,
      inviteUrl,      // always returned so admin/client can copy-paste if SMTP not set
      message:   emailSent
        ? `Invitation email sent to ${accountantEmail}. They have 7 days to sign up.`
        : `Invitation created. Share this link with ${accountantEmail}: ${inviteUrl}`,
    });
  } catch (err) { next(err); }
});

function buildInviteEmail(clientName, fromLabel, inviteUrl) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif;background:#f5f5f7;padding:32px 16px;color:#1d1d1f">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#0071e3;padding:28px 32px">
      <div style="color:#fff;font-size:22px;font-weight:700">${fromLabel}</div>
      <div style="color:rgba(255,255,255,0.8);font-size:14px;margin-top:4px">Philippine VAT-Compliant Bookkeeping</div>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px;font-weight:600">You've been invited! 🎉</p>
      <p style="margin:0 0 16px;color:#3d3d3f;line-height:1.6">
        <strong>${clientName}</strong> has invited you to manage their books, prepare BIR returns,
        and view financial reports on <strong>MyLedger</strong>.
      </p>
      <p style="margin:0 0 24px;color:#6e6e73;font-size:14px;line-height:1.6">
        Click the button below to create your free accountant account. Your email address will be
        pre-filled and you'll be immediately assigned to ${clientName}.
      </p>
      <a href="${inviteUrl}" style="display:inline-block;background:#0071e3;color:#fff;text-decoration:none;
        padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;margin-bottom:24px">
        Accept Invitation →
      </a>
      <p style="margin:0;font-size:12px;color:#aeaeb2;border-top:1px solid #f0f0f5;padding-top:16px">
        This invitation expires in 7 days. If the button doesn't work, copy this link:<br/>
        <a href="${inviteUrl}" style="color:#0071e3;word-break:break-all">${inviteUrl}</a>
      </p>
    </div>
  </div>
</body></html>`;
}

// PUT /api/clients/:id/assign-encoder
router.put('/:id/assign-encoder', (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.id));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const { encoderEmail } = req.body;
    if (!encoderEmail) return res.status(400).json({ error: 'encoderEmail is required' });

    const encoder = stmtUserByEmail.get(encoderEmail, 'encoder');
    if (!encoder) return res.status(404).json({ error: 'No encoder account found with that email' });

    const ids = client.encoderIds || [];
    if (!ids.includes(encoder.id)) ids.push(encoder.id);
    stmtSetEncoders.run(JSON.stringify(ids), req.params.id);
    res.json({ message: `${encoder.name} added as encoder`, encoderIds: ids });
  } catch (err) { next(err); }
});

// PUT /api/clients/:id/remove-encoder
router.put('/:id/remove-encoder', (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.id));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const { encoderId } = req.body;
    if (!encoderId) return res.status(400).json({ error: 'encoderId is required' });

    const ids = (client.encoderIds || []).filter(id => id !== encoderId);
    stmtSetEncoders.run(JSON.stringify(ids), req.params.id);
    res.json({ message: 'Encoder removed', encoderIds: ids });
  } catch (err) { next(err); }
});

export default router;
