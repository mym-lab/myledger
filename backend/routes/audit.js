// ─── Audit Log ─────────────────────────────────────────────────────────────────
// Append-only log of all creates, voids, logins, period locks/unlocks
// GET /api/audit?clientId=  — get entries for a client (admin/accountant only)

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToAudit } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById    = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertAudit   = db.prepare(`
  INSERT INTO audit_log (id, client_id, user_id, action, entity, entity_id, detail, timestamp)
  VALUES (@id, @client_id, @user_id, @action, @entity, @entity_id, @detail, @timestamp)
`);
const stmtAuditByClient = db.prepare(`
  SELECT * FROM audit_log WHERE client_id=? ORDER BY timestamp DESC LIMIT ?
`);

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

// GET /api/audit?clientId=[&limit=200]
router.get('/', (req, res, next) => {
  try {
    const { clientId, limit = 200 } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const entries = stmtAuditByClient.all(clientId, Number(limit)).map(rowToAudit);
    res.json({ entries, count: entries.length });
  } catch (err) { next(err); }
});

export default router;

// ── Exported helper — call this from other routes to log events ───────────────
// Synchronous — node:sqlite API is fully synchronous (no async needed)
export function logAudit({ clientId, userId, action, entity, entityId, detail = '' }) {
  try {
    stmtInsertAudit.run({
      id:        uuid(),
      client_id: clientId || null,
      user_id:   userId,
      action,
      entity,
      entity_id: entityId || null,
      detail,
      timestamp: new Date().toISOString(),
    });
  } catch (_) {
    // Non-critical — never crash a request because audit failed
  }
}
