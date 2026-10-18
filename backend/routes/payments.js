// ─── Payments Routes ──────────────────────────────────────────────────────────
// GET /api/payments/subscription/user/:userId   Current plan for a user
//
// Payment is manual by design: the client or accountant transfers via Maya,
// GCash, or bank transfer, submits the reference number, and an admin verifies
// and approves it through /api/upgrade-requests — which owns the tier upgrade,
// the receipt email, and the audit trail.
//
// PayMongo was removed in 2026-10 (users found the hosted-checkout flow
// confusing). Its helper, webhook, and the duplicate applyUpgrade/
// buildReceiptHtml that only the webhook used went with it; the surviving
// copies live in routes/upgrade-requests.js. The paymongo_links table is left
// in place so historical rows remain readable, but nothing writes to it.

import { Router }       from 'express';
import { db }           from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const stmtUserById = db.prepare('SELECT * FROM users WHERE id = ?');

// ── Current subscription for a user ───────────────────────────────────────────
router.get('/subscription/user/:userId', authenticate, (req, res) => {
  try {
    const userId = req.params.userId;
    if (userId !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    const user = stmtUserById.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      plan:   user.accountant_tier || 'free',
      status: 'active',
      userId: user.id,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
