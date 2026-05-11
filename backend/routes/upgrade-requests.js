// ─── Upgrade Request Routes ────────────────────────────────────
// POST /api/upgrade-requests                 client submits payment notification
// GET  /api/upgrade-requests                 admin: list all  | client: list own
// PUT  /api/upgrade-requests/:id/approve     admin: approve → updates client tier
// PUT  /api/upgrade-requests/:id/reject      admin: reject with reason

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, getSetting } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById    = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertUpgrade = db.prepare(`
  INSERT INTO upgrade_requests (id, client_id, user_id, target_tier, method, ref_no, amount, status, created_at)
  VALUES (@id, @client_id, @user_id, @target_tier, @method, @ref_no, @amount, @status, @created_at)
`);
const stmtAllUpgrades   = db.prepare('SELECT * FROM upgrade_requests ORDER BY created_at DESC');
const stmtUpgradeById   = db.prepare('SELECT * FROM upgrade_requests WHERE id=?');
const stmtUpdateUpgrade = db.prepare('UPDATE upgrade_requests SET status=@status, resolved_at=@resolved_at WHERE id=@id');
const stmtRejectUpgrade = db.prepare('UPDATE upgrade_requests SET status=@status, rejected_reason=@reason, resolved_at=@resolved_at WHERE id=@id');
const stmtUpdateClientTier    = db.prepare('UPDATE clients SET subscription_tier=?, subscription_expires_at=? WHERE id=?');
const stmtUserById            = db.prepare('SELECT * FROM users WHERE id=?');

function rowToUpgrade(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, userId: r.user_id,
    targetTier: r.target_tier, method: r.method,
    refNo: r.ref_no, amount: r.amount,
    status: r.status, createdAt: r.created_at,
    resolvedAt: r.resolved_at || null,
    rejectedReason: r.rejected_reason || '',
  };
}

// POST /api/upgrade-requests
router.post('/', authenticate, (req, res, next) => {
  try {
    const { clientId, targetTier, method, refNo, amount } = req.body;
    if (!clientId || !targetTier || !method || !refNo)
      return res.status(400).json({ error: 'clientId, targetTier, method and refNo are required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || (client.ownerId !== req.userId && client.accountantId !== req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const id = uuid();
    stmtInsertUpgrade.run({
      id,
      client_id:   clientId,
      user_id:     req.userId,
      target_tier: targetTier,
      method,
      ref_no:      refNo,
      amount:      Number(amount) || 0,
      status:      'pending',
      created_at:  new Date().toISOString(),
    });

    const upgradeRequest = rowToUpgrade(stmtUpgradeById.get(id));
    res.status(201).json({ upgradeRequest });
  } catch (err) { next(err); }
});

// GET /api/upgrade-requests
router.get('/', (req, res, next) => {
  try {
    const requests = stmtAllUpgrades.all().map(rowToUpgrade);
    res.json({ upgradeRequests: requests, count: requests.length });
  } catch (err) { next(err); }
});

// PUT /api/upgrade-requests/:id/approve
router.put('/:id/approve', (req, res, next) => {
  try {
    const r = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    if (!r) return res.status(404).json({ error: 'Request not found' });

    const resolvedAt  = new Date().toISOString();
    // Subscription expires 30 days from approval
    const expiresAt   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    stmtUpdateUpgrade.run({ id: req.params.id, status: 'approved', resolved_at: resolvedAt });
    stmtUpdateClientTier.run(r.targetTier, expiresAt, r.clientId);

    // ── Referral commission on subscription payment ──────────────────────────
    // Find who referred the user that submitted this upgrade request
    const submitter  = stmtUserById.get(r.userId);
    const referrerId = submitter?.referred_by;
    if (referrerId && r.amount > 0) {
      const pct        = getSetting('referral')?.subscriptionPercent ?? 10;
      const commission = Math.round(r.amount * pct) / 100;

      // Credit referrer balance
      db.prepare('UPDATE users SET referral_balance = referral_balance + ? WHERE id = ?')
        .run(commission, referrerId);

      // Log it as a referral record (type: commission)
      db.prepare(`
        INSERT INTO referrals (id, referrer_id, referee_id, referee_email, status, reward_amount, created_at)
        VALUES (?, ?, ?, ?, 'credited', ?, ?)
      `).run(
        `${r.id}-comm`,         // stable id so re-approvals don't re-insert
        referrerId,
        submitter.id,
        submitter.email,
        commission,
        resolvedAt
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const updated = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    const client  = rowToClient(stmtClientById.get(r.clientId));
    res.json({ upgradeRequest: updated, client });
  } catch (err) { next(err); }
});

// PUT /api/upgrade-requests/:id/reject
router.put('/:id/reject', (req, res, next) => {
  try {
    const r = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    if (!r) return res.status(404).json({ error: 'Request not found' });

    const resolvedAt = new Date().toISOString();
    stmtRejectUpgrade.run({ id: req.params.id, status: 'rejected', reason: req.body.reason || '', resolved_at: resolvedAt });

    const updated = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    res.json({ upgradeRequest: updated });
  } catch (err) { next(err); }
});

export default router;
