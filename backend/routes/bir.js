// ─── BIR Routes ───────────────────────────────────────────────
// GET /api/bir/deadlines?clientId=   upcoming filing deadlines
// GET /api/bir/vat-balance?clientId= current VAT position

import { Router } from 'express';
import { db, rowToClient, rowToTx } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';
import { getUpcomingDeadlines } from '../lib/bir-deadlines.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);

const round = (n) => Math.round(n * 100) / 100;
const sum   = (arr, key) => arr.reduce((s, t) => s + (t[key] || 0), 0);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtTxByClient = db.prepare('SELECT * FROM transactions WHERE client_id=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

// GET /api/bir/deadlines?clientId=
router.get('/deadlines', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId query param required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const deadlines = getUpcomingDeadlines(client.taxTypes || []);
    res.json({ client: { id: client.id, tradeName: client.tradeName }, deadlines });
  } catch (err) { next(err); }
});

// GET /api/bir/vat-balance?clientId=
router.get('/vat-balance', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId query param required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const txns     = stmtTxByClient.all(clientId).map(rowToTx);
    const inputVAT  = round(sum(txns.filter(t => t.type === 'expense'), 'amount_vat'));
    const outputVAT = round(sum(txns.filter(t => t.type === 'income'),  'amount_vat'));
    const net       = round(outputVAT - inputVAT);

    res.json({
      inputVAT, outputVAT,
      netVATPayable: net,
      status: net > 0 ? 'payable' : net < 0 ? 'refundable' : 'zero',
      note: net >= 0
        ? `₱${net.toLocaleString()} payable to BIR`
        : `₱${Math.abs(net).toLocaleString()} credit (refundable)`,
    });
  } catch (err) { next(err); }
});

export default router;
