// ─── Upgrade Request Routes ────────────────────────────────────
// POST /api/upgrade-requests                 client OR accountant submits payment notification
// GET  /api/upgrade-requests                 admin: list all (with display name) | any auth user
// PUT  /api/upgrade-requests/:id/approve     admin: approve → updates client tier OR accountant tier
// PUT  /api/upgrade-requests/:id/reject      admin: reject with reason

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { db, rowToClient, getSetting } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'myledger-dev-secret-change-in-prod';

const router = Router();

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById    = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtUserById      = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtInsertUpgrade = db.prepare(`
  INSERT INTO upgrade_requests (id, client_id, user_id, target_tier, method, ref_no, amount, status, request_type, created_at)
  VALUES (@id, @client_id, @user_id, @target_tier, @method, @ref_no, @amount, @status, @request_type, @created_at)
`);
const stmtAllUpgrades   = db.prepare('SELECT * FROM upgrade_requests ORDER BY created_at DESC');
const stmtMyUpgrades    = db.prepare('SELECT * FROM upgrade_requests WHERE user_id=? ORDER BY created_at DESC');
const stmtUpgradeById   = db.prepare('SELECT * FROM upgrade_requests WHERE id=?');
const stmtUpdateUpgrade = db.prepare('UPDATE upgrade_requests SET status=@status, resolved_at=@resolved_at WHERE id=@id');
const stmtRejectUpgrade = db.prepare('UPDATE upgrade_requests SET status=@status, rejected_reason=@reason, resolved_at=@resolved_at WHERE id=@id');
const stmtUpdateClientTier    = db.prepare('UPDATE clients SET subscription_tier=?, subscription_expires_at=? WHERE id=?');
const stmtUpdateAccountantTier = db.prepare('UPDATE users SET accountant_tier=? WHERE id=?');

function rowToUpgrade(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, userId: r.user_id,
    targetTier: r.target_tier, method: r.method,
    refNo: r.ref_no, amount: r.amount,
    status: r.status, requestType: r.request_type || 'client',
    createdAt: r.created_at,
    resolvedAt: r.resolved_at || null,
    rejectedReason: r.rejected_reason || '',
  };
}

// ── Enrich upgrade requests with display name ──────────────────────────────
function enrichUpgrade(req) {
  if (!req) return null;
  const u = stmtUserById.get(req.userId);
  if (req.requestType === 'accountant') {
    return {
      ...req,
      displayName: u?.name || u?.email || 'Unknown Accountant',
      displayEmail: u?.email || '',
      tradeName: null,
    };
  }
  // client upgrade
  const c = req.clientId ? rowToClient(stmtClientById.get(req.clientId)) : null;
  return {
    ...req,
    displayName: c?.tradeName || u?.email || 'Unknown Client',
    displayEmail: u?.email || '',
    tradeName: c?.tradeName || null,
  };
}

// POST /api/upgrade-requests
router.post('/', authenticate, (req, res, next) => {
  try {
    const { clientId, targetTier, method, refNo, amount, requestType = 'client' } = req.body;

    if (!targetTier || !method || !refNo)
      return res.status(400).json({ error: 'targetTier, method and refNo are required' });

    // Client upgrade requires clientId; accountant upgrade does not
    if (requestType === 'client') {
      if (!clientId) return res.status(400).json({ error: 'clientId is required for client upgrades' });
      const client = rowToClient(stmtClientById.get(clientId));
      if (!client || (client.ownerId !== req.userId && client.accountantId !== req.userId))
        return res.status(404).json({ error: 'Client not found' });
    }

    const id = uuid();
    stmtInsertUpgrade.run({
      id,
      client_id:    requestType === 'client' ? clientId : null,
      user_id:      req.userId,
      target_tier:  targetTier,
      method,
      ref_no:       refNo,
      amount:       Number(amount) || 0,
      status:       'pending',
      request_type: requestType,
      created_at:   new Date().toISOString(),
    });

    const upgradeRequest = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(id)));
    res.status(201).json({ upgradeRequest });
  } catch (err) { next(err); }
});

// GET /api/upgrade-requests — optional auth: admin gets all, authed user gets own, no token gets []
router.get('/', (req, res, next) => {
  try {
    let userId = null;
    let isAdmin = false;
    const auth  = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId  = decoded.userId;
        const userRow = stmtUserById.get(userId);
        isAdmin = userRow?.role === 'admin';
      } catch { /* expired / invalid — treat as unauthenticated, return [] */ }
    }

    const rows     = isAdmin ? stmtAllUpgrades.all() : (userId ? stmtMyUpgrades.all(userId) : []);
    const requests = rows.map(r => enrichUpgrade(rowToUpgrade(r))).filter(Boolean);
    res.json({ upgradeRequests: requests, count: requests.length });
  } catch (err) { next(err); }
});

// PUT /api/upgrade-requests/:id/approve
router.put('/:id/approve', authenticate, (req, res, next) => {
  try {
    const r = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    if (!r) return res.status(404).json({ error: 'Request not found' });

    const resolvedAt = new Date().toISOString();

    if (r.requestType === 'accountant') {
      // Update the accountant's tier on the users table
      stmtUpdateAccountantTier.run(r.targetTier, r.userId);
      stmtUpdateUpgrade.run({ id: req.params.id, status: 'approved', resolved_at: resolvedAt });

      const updated = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(req.params.id)));
      const user    = stmtUserById.get(r.userId);
      return res.json({ upgradeRequest: updated, user });
    }

    // Client upgrade
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    stmtUpdateUpgrade.run({ id: req.params.id, status: 'approved', resolved_at: resolvedAt });
    stmtUpdateClientTier.run(r.targetTier, expiresAt, r.clientId);

    // ── Referral commission on subscription payment ──────────────────────────
    const submitter  = stmtUserById.get(r.userId);
    const referrerId = submitter?.referred_by;
    if (referrerId && r.amount > 0) {
      const pct        = getSetting('referral')?.subscriptionPercent ?? 10;
      const commission = Math.round(r.amount * pct) / 100;
      db.prepare('UPDATE users SET referral_balance = referral_balance + ? WHERE id = ?')
        .run(commission, referrerId);
      db.prepare(`
        INSERT INTO referrals (id, referrer_id, referee_id, referee_email, status, reward_amount, created_at)
        VALUES (?, ?, ?, ?, 'credited', ?, ?)
      `).run(
        `${r.id}-comm`, referrerId, submitter.id, submitter.email, commission, resolvedAt
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const updated = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(req.params.id)));
    const client  = rowToClient(stmtClientById.get(r.clientId));
    res.json({ upgradeRequest: updated, client });
  } catch (err) { next(err); }
});

// PUT /api/upgrade-requests/:id/reject
router.put('/:id/reject', authenticate, (req, res, next) => {
  try {
    const r = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    if (!r) return res.status(404).json({ error: 'Request not found' });

    const resolvedAt = new Date().toISOString();
    stmtRejectUpgrade.run({ id: req.params.id, status: 'rejected', reason: req.body.reason || '', resolved_at: resolvedAt });

    const updated = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(req.params.id)));
    res.json({ upgradeRequest: updated });
  } catch (err) { next(err); }
});

export default router;
