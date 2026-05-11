// ─── Admin Routes ─────────────────────────────────────────────
import { Router } from 'express';
import { db, rowToUser, rowToClient, rowToTx, getSetting, setSetting, getAllSettings } from '../db.js';

const router = Router();
const round = (n) => Math.round(n * 100) / 100;
const sum   = (arr, key) => arr.reduce((s, t) => s + (t[key] || 0), 0);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtAllUsers   = db.prepare('SELECT * FROM users');
const stmtAllClients = db.prepare('SELECT * FROM clients');
const stmtTxCount    = db.prepare('SELECT COUNT(*) as cnt FROM transactions WHERE client_id=?');
const stmtAllTxns    = db.prepare('SELECT * FROM transactions WHERE voided_at IS NULL');
const stmtUserById   = db.prepare('SELECT * FROM users WHERE id=?');
const stmtUpdateBranding = db.prepare('UPDATE users SET firm_name=@firm_name, accent_color=@accent_color WHERE id=@id');
const stmtUpdateTier     = db.prepare('UPDATE users SET accountant_tier=@tier WHERE id=@id');
const stmtUpdateClientTier = db.prepare('UPDATE clients SET subscription_tier=@tier WHERE id=@id');

// GET /api/admin/stats
router.get('/stats', (req, res) => {
  try {
    console.log('📊 GET /api/admin/stats');

    const userRows = stmtAllUsers.all();
    const users = userRows.map(r => ({
      id: r.id, email: r.email, name: r.name, company: r.company,
      role: r.role || 'client',
      accountantTier: r.accountant_tier || null,
      firmName:    r.firm_name    || null,
      accentColor: r.accent_color || null,
      createdAt: r.created_at,
    }));

    const clientRows = stmtAllClients.all();
    const clients = clientRows.map(r => {
      const c = rowToClient(r);
      if (!c) return null;
      const txRow = stmtTxCount.get(c.id);
      const cnt = Number(txRow?.cnt ?? 0);
      return {
        id: c.id, tradeName: c.tradeName, tin: c.tin, type: c.type,
        ownerId: c.ownerId,
        accountantId: c.accountantId,
        subscriptionTier: c.subscriptionTier || 'free',
        taxRegime: c.taxRegime || 'vat',
        createdAt: c.createdAt, txCount: cnt,
      };
    }).filter(Boolean);

    const txRows = stmtAllTxns.all();
    const txns = txRows.map(rowToTx).filter(Boolean);

    const payload = {
      users, clients,
      totalUsers:        users.length,
      totalClients:      clients.length,
      totalTransactions: txns.length,
      totalRevenue:  round(sum(txns.filter(t => t.type === 'income'),  'amount_net')),
      inputVAT:      round(sum(txns.filter(t => t.type === 'expense'), 'amount_vat')),
      outputVAT:     round(sum(txns.filter(t => t.type === 'income'),  'amount_vat')),
    };

    console.log(`   → ${users.length} users (emails: ${users.map(u=>u.email).join(', ')||'none'}), ${clients.length} clients, ${txns.length} txns`);
    return res.json(payload);
  } catch (err) {
    console.error('❌ /api/admin/stats error:', err.message, err.stack);
    return res.status(500).json({ error: err.message || 'Stats error' });
  }
});

// GET /api/admin/settings
router.get('/settings', (req, res, next) => {
  try {
    const all = getAllSettings();
    // Strip password but add passSet flag so frontend knows if one is saved
    if (all.smtp?.pass) { all.smtp = { ...all.smtp, passSet: true, pass: undefined }; }
    res.json({ settings: all });
  } catch (err) { next(err); }
});

// PUT /api/admin/settings
router.put('/settings', (req, res, next) => {
  try {
    const { pricing, payment, contactEmail, accountantPricing, referral } = req.body;

    if (pricing) {
      const current = getSetting('pricing') || {};
      if (pricing.starter     != null) current.starter     = Number(pricing.starter);
      if (pricing.professional != null) current.professional = Number(pricing.professional);
      if (pricing.enterprise  != null) current.enterprise  = Number(pricing.enterprise);
      setSetting('pricing', current);
    }
    if (payment?.maya) {
      const current = getSetting('payment') || {};
      current.maya = current.maya || {};
      if (payment.maya.number) current.maya.number = payment.maya.number;
      if (payment.maya.name)   current.maya.name   = payment.maya.name;
      setSetting('payment', current);
    }
    if (payment?.gcash) {
      const current = getSetting('payment') || {};
      current.gcash = current.gcash || {};
      if (payment.gcash.number) current.gcash.number = payment.gcash.number;
      if (payment.gcash.name)   current.gcash.name   = payment.gcash.name;
      setSetting('payment', current);
    }
    if (contactEmail) setSetting('contactEmail', contactEmail);
    if (referral) {
      const current = getSetting('referral') || {};
      if (referral.signupBonus        != null) current.signupBonus        = Number(referral.signupBonus);
      if (referral.subscriptionPercent != null) current.subscriptionPercent = Number(referral.subscriptionPercent);
      setSetting('referral', current);
    }
    if (accountantPricing) {
      const current = getSetting('accountantPricing') || {};
      if (accountantPricing.solo         != null) current.solo         = Number(accountantPricing.solo);
      if (accountantPricing.professional != null) current.professional = Number(accountantPricing.professional);
      if (accountantPricing.firm         != null) current.firm         = Number(accountantPricing.firm);
      if (accountantPricing.agency       != null) current.agency       = Number(accountantPricing.agency);
      setSetting('accountantPricing', current);
    }

    res.json({ settings: getAllSettings() });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id/set-branding
router.put('/users/:id/set-branding', (req, res, next) => {
  try {
    const { firmName, accentColor } = req.body;
    const user = rowToUser(stmtUserById.get(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'accountant')
      return res.status(400).json({ error: 'Only accountant accounts support branding' });

    stmtUpdateBranding.run({
      id:           req.params.id,
      firm_name:    firmName   != null ? firmName.trim()   : user.firmName,
      accent_color: accentColor != null ? accentColor.trim() : user.accentColor,
    });

    const updated = rowToUser(stmtUserById.get(req.params.id));
    res.json({
      message: 'Branding updated',
      user: { id: updated.id, email: updated.email, firmName: updated.firmName, accentColor: updated.accentColor },
    });
  } catch (err) { next(err); }
});

// PUT /api/admin/users/:id/set-tier
router.put('/users/:id/set-tier', (req, res, next) => {
  try {
    const { tier } = req.body;
    if (!['free', 'solo', 'professional', 'firm', 'agency'].includes(tier))
      return res.status(400).json({ error: 'tier must be free, solo, professional, firm, or agency' });

    const user = rowToUser(stmtUserById.get(req.params.id));
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role !== 'accountant')
      return res.status(400).json({ error: 'Only accountant accounts have tiers' });

    stmtUpdateTier.run({ tier, id: req.params.id });
    res.json({ message: `Tier set to ${tier}`, user: { id: user.id, email: user.email, accountantTier: tier } });
  } catch (err) { next(err); }
});

// PUT /api/admin/smtp
router.put('/smtp', (req, res, next) => {
  try {
    const { host, port, secure, user, pass, fromName, fromEmail, enabled } = req.body;
    const current = getSetting('smtp') || {};
    if (host      != null) current.host      = host.trim();
    if (port      != null) current.port      = Number(port);
    if (secure    != null) current.secure    = !!secure;
    if (user      != null) current.user      = user.trim();
    if (pass      != null) current.pass      = pass;
    if (fromName  != null) current.fromName  = fromName.trim();
    if (fromEmail != null) current.fromEmail = fromEmail.trim();
    if (enabled   != null) current.enabled   = !!enabled;
    setSetting('smtp', current);

    const { pass: _p, ...safeSmtp } = current;
    res.json({ message: 'SMTP settings saved', smtp: { ...safeSmtp, passSet: !!current.pass } });
  } catch (err) { next(err); }
});

// PUT /api/admin/clients/:id/set-owner
router.put('/clients/:id/set-owner', (req, res, next) => {
  try {
    const { ownerEmail } = req.body;
    if (!ownerEmail) return res.status(400).json({ error: 'ownerEmail required' });

    const user = db.prepare('SELECT id, email FROM users WHERE email = ?').get(ownerEmail);
    if (!user) return res.status(404).json({ error: `No user found with email: ${ownerEmail}` });

    const info = db.prepare('SELECT id, trade_name FROM clients WHERE id=?').get(req.params.id);
    if (!info) return res.status(404).json({ error: 'Client not found' });

    db.prepare('UPDATE clients SET owner_id = ? WHERE id = ?').run(user.id, req.params.id);
    res.json({ message: `"${info.trade_name}" ownership transferred to ${user.email}` });
  } catch (err) { next(err); }
});

// PUT /api/admin/clients/:id/set-tier
router.put('/clients/:id/set-tier', (req, res, next) => {
  try {
    const { tier } = req.body;
    if (!['free', 'starter', 'professional', 'enterprise'].includes(tier))
      return res.status(400).json({ error: 'Invalid tier' });

    const info = db.prepare('SELECT id FROM clients WHERE id=?').get(req.params.id);
    if (!info) return res.status(404).json({ error: 'Client not found' });

    stmtUpdateClientTier.run({ tier, id: req.params.id });
    res.json({ message: `Client tier set to ${tier}` });
  } catch (err) { next(err); }
});

export default router;
