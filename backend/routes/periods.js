// ─── Period Locking ────────────────────────────────────────────────────────────
// GET    /api/periods?clientId=         list locked periods for a client
// POST   /api/periods/lock              lock a period { clientId, period: 'YYYY-MM' }
// POST   /api/periods/unlock            unlock a period { clientId, period: 'YYYY-MM' }

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { logAudit } from './audit.js';

const router = Router();
router.use(authenticate);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById      = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtPeriodsByClient = db.prepare('SELECT * FROM locked_periods WHERE client_id=? ORDER BY period DESC');
const stmtFindPeriod      = db.prepare('SELECT * FROM locked_periods WHERE client_id=? AND period=?');
const stmtInsertPeriod    = db.prepare(`
  INSERT INTO locked_periods (id, client_id, period, locked_by, locked_at)
  VALUES (@id, @client_id, @period, @locked_by, @locked_at)
`);
const stmtDeletePeriod    = db.prepare('DELETE FROM locked_periods WHERE client_id=? AND period=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

function isValidPeriod(p) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

// GET /api/periods?clientId=
router.get('/', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const periods = stmtPeriodsByClient.all(clientId).map(r => ({
      id: r.id, clientId: r.client_id, period: r.period,
      lockedBy: r.locked_by, lockedAt: r.locked_at,
    }));
    res.json({ periods });
  } catch (err) { next(err); }
});

// POST /api/periods/lock
router.post('/lock', (req, res, next) => {
  try {
    const { clientId, period } = req.body;
    if (!clientId || !period) return res.status(400).json({ error: 'clientId and period are required' });
    if (!isValidPeriod(period)) return res.status(400).json({ error: 'period must be YYYY-MM format' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    if (stmtFindPeriod.get(clientId, period))
      return res.status(409).json({ error: `Period ${period} is already locked` });

    const id       = uuid();
    const lockedAt = new Date().toISOString();
    stmtInsertPeriod.run({ id, client_id: clientId, period, locked_by: req.userId, locked_at: lockedAt });

    logAudit({ clientId, userId: req.userId, action: 'LOCK_PERIOD', entity: 'period', entityId: period, detail: `Period ${period} locked` });
    res.json({ message: `Period ${period} locked`, lock: { id, clientId, period, lockedBy: req.userId, lockedAt } });
  } catch (err) { next(err); }
});

// POST /api/periods/unlock
router.post('/unlock', (req, res, next) => {
  try {
    const { clientId, period } = req.body;
    if (!clientId || !period) return res.status(400).json({ error: 'clientId and period are required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    if (!stmtFindPeriod.get(clientId, period))
      return res.status(404).json({ error: `Period ${period} is not locked` });

    stmtDeletePeriod.run(clientId, period);

    logAudit({ clientId, userId: req.userId, action: 'UNLOCK_PERIOD', entity: 'period', entityId: period, detail: `Period ${period} unlocked` });
    res.json({ message: `Period ${period} unlocked` });
  } catch (err) { next(err); }
});

export default router;
