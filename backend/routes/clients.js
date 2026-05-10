// ─── Client (Business) Routes ─────────────────────────────────────────────────
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import nodemailer from 'nodemailer';
import { db, rowToClient, rowToTx, withTransaction, getSetting } from '../db.js';
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

// GET /api/clients/:id/backup
router.get('/:id/backup', (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.id));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const transactions = stmtTxsByClient.all(req.params.id).map(rowToTx);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition',
      `attachment; filename="myledger-${client.tradeName.replace(/\s+/g, '-')}-${Date.now()}.json"`);
    res.json({ exportedAt: new Date().toISOString(), client, transactions });
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
    if (smtp.host && smtp.user && smtp.pass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtp.host, port: Number(smtp.port) || 587,
          secure: smtp.secure || false,
          auth: { user: smtp.user, pass: smtp.pass },
        });
        const fromLabel = smtp.fromName || 'MyLedger';
        await transporter.sendMail({
          from:    `"${fromLabel}" <${smtp.fromEmail || smtp.user}>`,
          to:      accountantEmail,
          subject: `${client.tradeName} has invited you to manage their books on MyLedger`,
          html: buildInviteEmail(client.tradeName, fromLabel, inviteUrl),
        });
        emailSent = true;
      } catch (e) {
        console.error('⚠️  Invite email failed (non-fatal):', e.message);
      }
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
