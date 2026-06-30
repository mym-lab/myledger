// ─── Invitations Routes ───────────────────────────────────────────────────────
// Handles accountant invite flow:
//   GET  /api/invitations/:token              — public, validates token for signup page
//   GET  /api/invitations/client/:clientId    — authenticated, gets pending invite for a client
//   DELETE /api/invitations/client/:clientId  — authenticated, cancels pending invite

import { Router } from 'express';
import { db, rowToClient } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

const stmtByToken = db.prepare(`
  SELECT i.token, i.email, i.status, i.expires_at, c.trade_name, c.tin
  FROM   invitations i
  JOIN   clients     c ON i.client_id = c.id
  WHERE  i.token = ?
`);

const stmtPendingByClient = db.prepare(`
  SELECT email, created_at, expires_at
  FROM   invitations
  WHERE  client_id = ? AND status = 'pending'
  ORDER  BY created_at DESC
  LIMIT  1
`);

// ── GET /api/invitations/:token  (public — no auth — for signup page) ─────────
router.get('/:token', (req, res, next) => {
  try {
    const row = stmtByToken.get(req.params.token);

    if (!row || row.status !== 'pending')
      return res.status(404).json({ error: 'Invitation not found or already used.' });

    if (new Date(row.expires_at) < new Date()) {
      db.prepare("UPDATE invitations SET status='expired' WHERE token=?").run(req.params.token);
      return res.status(410).json({ error: 'This invitation has expired. Ask your client to send a new one.' });
    }

    res.json({ token: row.token, email: row.email, clientName: row.trade_name, tin: row.tin });
  } catch (err) { next(err); }
});

// ── GET /api/invitations/client/:clientId  (authenticated) ───────────────────
router.get('/client/:clientId', authenticate, (req, res, next) => {
  try {
    const client = rowToClient(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.clientId));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.ownerId !== req.userId && client.accountantId !== req.userId)
      return res.status(403).json({ error: 'Access denied' });

    const invite = stmtPendingByClient.get(req.params.clientId);
    res.json({ invite: invite || null });
  } catch (err) { next(err); }
});

// ── DELETE /api/invitations/client/:clientId  (cancel pending invite) ─────────
router.delete('/client/:clientId', authenticate, (req, res, next) => {
  try {
    const client = rowToClient(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.clientId));
    if (!client) return res.status(404).json({ error: 'Client not found' });
    if (client.ownerId !== req.userId)
      return res.status(403).json({ error: 'Only the business owner can cancel invitations' });

    db.prepare("UPDATE invitations SET status='cancelled' WHERE client_id=? AND status='pending'")
      .run(req.params.clientId);
    res.json({ message: 'Invitation cancelled' });
  } catch (err) { next(err); }
});

export default router;
