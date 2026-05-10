// ─── Journal Entry Routes ──────────────────────────────────────
// POST   /api/journal-entries          create
// GET    /api/journal-entries?clientId= list for client
// DELETE /api/journal-entries/:id       delete

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToJE } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertJE   = db.prepare(`
  INSERT INTO journal_entries (id, client_id, user_id, date, description, reference_no, entries, created_at)
  VALUES (@id, @client_id, @user_id, @date, @description, @reference_no, @entries, @created_at)
`);
const stmtJEsByClient = db.prepare('SELECT * FROM journal_entries WHERE client_id=? ORDER BY date DESC');
const stmtJEById      = db.prepare('SELECT * FROM journal_entries WHERE id=?');
const stmtDeleteJE    = db.prepare('DELETE FROM journal_entries WHERE id=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

// POST /api/journal-entries
router.post('/', (req, res, next) => {
  try {
    const { clientId, date, description, referenceNo = '', entries = [] } = req.body;
    if (!clientId)        return res.status(400).json({ error: 'clientId is required' });
    if (!description)     return res.status(400).json({ error: 'description is required' });
    if (!entries.length)  return res.status(400).json({ error: 'At least one entry line is required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    // Validate: total debits must equal total credits
    const totalDebit  = entries.reduce((s, e) => s + (Number(e.debit)  || 0), 0);
    const totalCredit = entries.reduce((s, e) => s + (Number(e.credit) || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
      return res.status(400).json({
        error: `Journal entry is unbalanced. Debits (${totalDebit.toFixed(2)}) ≠ Credits (${totalCredit.toFixed(2)})`
      });

    const cleanEntries = entries.map(e => ({
      account: e.account || '',
      debit:   Math.round((Number(e.debit)  || 0) * 100) / 100,
      credit:  Math.round((Number(e.credit) || 0) * 100) / 100,
    }));

    const id        = uuid();
    const createdAt = new Date().toISOString();
    const jeDate    = date || createdAt.substring(0, 10);

    stmtInsertJE.run({
      id,
      client_id:    clientId,
      user_id:      req.userId,
      date:         jeDate,
      description,
      reference_no: referenceNo,
      entries:      JSON.stringify(cleanEntries),
      created_at:   createdAt,
    });

    const je = rowToJE(stmtJEById.get(id));
    res.status(201).json({ journalEntry: je });
  } catch (err) { next(err); }
});

// GET /api/journal-entries?clientId=
router.get('/', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId query param required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const entries = stmtJEsByClient.all(clientId).map(rowToJE);
    res.json({ journalEntries: entries, count: entries.length });
  } catch (err) { next(err); }
});

// DELETE /api/journal-entries/:id
router.delete('/:id', (req, res, next) => {
  try {
    const je = rowToJE(stmtJEById.get(req.params.id));
    if (!je) return res.status(404).json({ error: 'Journal entry not found' });

    const client = rowToClient(stmtClientById.get(je.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    stmtDeleteJE.run(req.params.id);
    res.json({ message: 'Journal entry deleted' });
  } catch (err) { next(err); }
});

export default router;
