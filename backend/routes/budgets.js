// ─── Budgets (budget-vs-actual) ───────────────────────────────────────────────
// GET    /api/budgets?clientId=&period=YYYY-MM   list budget entries
// POST   /api/budgets                            upsert one entry
// DELETE /api/budgets/:id                        remove one entry
// All endpoints require professional+ tier.

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTier } from '../middleware/tierGuard.js';

const router = Router();
router.use(authenticate);
router.use(requireTier('professional'));

// ── GET /api/budgets?clientId=&period= ───────────────────────────────────────
router.get('/', (req, res, next) => {
  try {
    const { clientId, period } = req.query;
    if (!clientId || !period) return res.status(400).json({ error: 'clientId and period required' });

    const rows = db.prepare(
      'SELECT * FROM budgets WHERE client_id = ? AND period = ? ORDER BY type, category'
    ).all(clientId, period);

    res.json({ budgets: rows });
  } catch (err) { next(err); }
});

// ── POST /api/budgets ─────────────────────────────────────────────────────────
// Body: { clientId, period, category, type, amount }
// Uses INSERT … ON CONFLICT to upsert — safe to call on every cell blur.
router.post('/', (req, res, next) => {
  try {
    const { clientId, period, category, type, amount } = req.body;
    if (!clientId || !period || !category || !type)
      return res.status(400).json({ error: 'clientId, period, category, type required' });

    const id  = uuid();
    const amt = parseFloat(amount) || 0;

    db.prepare(`
      INSERT INTO budgets (id, client_id, period, category, type, amount, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(client_id, period, category, type)
      DO UPDATE SET amount = excluded.amount
    `).run(id, clientId, period, category, type, amt);

    // Return the actual row (the id may differ if we hit the ON CONFLICT path)
    const row = db.prepare(
      'SELECT * FROM budgets WHERE client_id = ? AND period = ? AND category = ? AND type = ?'
    ).get(clientId, period, category, type);

    res.json({ budget: row });
  } catch (err) { next(err); }
});

// ── DELETE /api/budgets/:id ───────────────────────────────────────────────────
router.delete('/:id', (req, res, next) => {
  try {
    db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
