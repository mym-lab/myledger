// ─── Global Transaction Search ────────────────────────────────────────────────
// GET /api/search?q=&type=&clientId=&from=&to=&limit=50
//
// Accountants  — search across ALL their assigned clients
// Business owners — search across their own clients only
// Encoders     — search within their assigned clients only

import { Router } from 'express';
import { db }       from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { requireTier } from '../middleware/tierGuard.js';

const router = Router();
router.use(requireTier('professional')); // Global search: professional+ only
router.use(authenticate);

router.get('/', (req, res, next) => {
  try {
    const { userId, userRole } = req;
    const {
      q        = '',
      type     = '',       // 'income' | 'expense' | ''
      clientId = '',       // filter to one client
      from     = '',       // YYYY-MM-DD
      to       = '',
      limit    = '50',
      offset   = '0',
    } = req.query;

    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    // ── Get visible client IDs ───────────────────────────────────────────────
    let visibleClientIds;
    if (userRole === 'accountant') {
      visibleClientIds = db.prepare('SELECT id FROM clients WHERE accountant_id = ?')
        .all(userId).map(r => r.id);
    } else if (userRole === 'encoder') {
      visibleClientIds = db.prepare('SELECT id FROM clients WHERE accountant_id IN (SELECT accountant_id FROM clients WHERE owner_id = ?)')
        .all(userId).map(r => r.id);
      // Fallback: clients they are actually assigned to
      const direct = db.prepare(`
        SELECT DISTINCT client_id FROM encoder_assignments WHERE user_id = ?
      `).all(userId).map(r => r.client_id).filter(Boolean);
      if (direct.length) visibleClientIds = direct;
    } else {
      // owner / client
      visibleClientIds = db.prepare('SELECT id FROM clients WHERE owner_id = ?')
        .all(userId).map(r => r.id);
    }

    // Filter to specific client if provided
    if (clientId) {
      if (!visibleClientIds.includes(clientId)) {
        return res.json({ results: [], total: 0 });
      }
      visibleClientIds = [clientId];
    }

    if (!visibleClientIds.length) return res.json({ results: [], total: 0 });

    // ── Build query ──────────────────────────────────────────────────────────
    const placeholders = visibleClientIds.map(() => '?').join(',');
    const params       = [...visibleClientIds];
    const conditions   = [`t.client_id IN (${placeholders})`, 't.voided_at IS NULL'];

    if (q.trim()) {
      conditions.push(`(
        t.description LIKE ? OR t.reference_no LIKE ?
        OR t.notes LIKE ? OR t.counterparty_name LIKE ?
        OR t.counterparty_tin LIKE ?
      )`);
      const like = `%${q.trim()}%`;
      params.push(like, like, like, like, like);
    }
    if (type === 'income' || type === 'expense') {
      conditions.push('t.type = ?');
      params.push(type);
    }
    if (from) { conditions.push('t.date >= ?'); params.push(from); }
    if (to)   { conditions.push('t.date <= ?'); params.push(to); }

    const where = conditions.join(' AND ');

    const countRow = db.prepare(`
      SELECT COUNT(*) as n FROM transactions t WHERE ${where}
    `).get(...params);

    const rows = db.prepare(`
      SELECT
        t.id, t.client_id, t.type, t.description, t.reference_no,
        t.category, t.net, t.vat, t.gross, t.settlement, t.date, t.created_at,
        t.counterparty_name, t.notes,
        c.trade_name AS client_name
      FROM transactions t
      JOIN clients c ON c.id = t.client_id
      WHERE ${where}
      ORDER BY t.date DESC, t.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, lim, off);

    const results = rows.map(r => ({
      id:              r.id,
      clientId:        r.client_id,
      clientName:      r.client_name,
      type:            r.type,
      description:     r.description,
      referenceNo:     r.reference_no,
      category:        r.category,
      net:             r.net,
      vat:             r.vat,
      gross:           r.gross,
      settlement:      r.settlement,
      date:            r.date,
      createdAt:       r.created_at,
      counterpartyName:r.counterparty_name,
      notes:           r.notes,
    }));

    res.json({ results, total: countRow.n, limit: lim, offset: off });
  } catch (err) { next(err); }
});

export default router;
