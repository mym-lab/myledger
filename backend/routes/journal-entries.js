// ─── Journal Entry Routes ──────────────────────────────────────
// POST   /api/journal-entries          create
// GET    /api/journal-entries?clientId= list for client
// DELETE /api/journal-entries/:id       delete

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToJE } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';
import { logAudit } from './audit.js';
import { hasClientAccess, actingOwnerId } from '../lib/access.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertJE   = db.prepare(`
  INSERT INTO journal_entries (id, client_id, user_id, date, description, reference_no, entries, counterparty, created_at)
  VALUES (@id, @client_id, @user_id, @date, @description, @reference_no, @entries, @counterparty, @created_at)
`);
const stmtJEsByClient = db.prepare('SELECT * FROM journal_entries WHERE client_id=? ORDER BY date DESC');
const stmtJEById      = db.prepare('SELECT * FROM journal_entries WHERE id=?');
const stmtDeleteJE    = db.prepare('DELETE FROM journal_entries WHERE id=?');
const stmtCoaCodes    = db.prepare('SELECT code FROM coa WHERE client_id=?');
const stmtUpdateJE    = db.prepare(`
  UPDATE journal_entries
  SET date=@date, description=@description, reference_no=@reference_no,
      entries=@entries, counterparty=@counterparty
  WHERE id=@id
`);

const cents = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Account codes in this client's chart of accounts
function codeSet(clientId) {
  return new Set(stmtCoaCodes.all(clientId).map(r => String(r.code)));
}

// Lines must use chart-of-accounts codes so reports can classify them.
function accountError(codes, entries) {
  const bad = [...new Set(entries.map(e => String(e.account || '').trim())
    .filter(a => !codes.has(a)))];
  return bad.length
    ? `Pick an account from your chart of accounts. Not found: ${bad.map(a => a || '(blank)').join(', ')}`
    : null;
}

// Optional supplier/lessor details, sanitised. Null when nothing was given.
function cleanCounterparty(counterparty) {
  return counterparty && (counterparty.name || counterparty.tin) ? {
    name:    String(counterparty.name    || '').trim(),
    tin:     String(counterparty.tin     || '').trim(),
    address: String(counterparty.address || '').trim(),
    vatType: String(counterparty.vatType || 'vat'),
    ewtAtc:  String(counterparty.ewtAtc  || '').trim(),
    ewtRate: Number(counterparty.ewtRate) || 0,
  } : null;
}

function canAccess(client, req) {
  return hasClientAccess(client, req, { allowEncoders: false });
}

// POST /api/journal-entries
router.post('/', (req, res, next) => {
  try {
    const { clientId, date, description, referenceNo = '', entries = [], counterparty = null } = req.body;
    if (!clientId)        return res.status(400).json({ error: 'clientId is required' });
    if (!description)     return res.status(400).json({ error: 'description is required' });
    if (!entries.length)  return res.status(400).json({ error: 'At least one entry line is required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req))
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

    const cp = cleanCounterparty(counterparty);

    const accErr = accountError(codeSet(clientId), cleanEntries);
    if (accErr) return res.status(400).json({ error: accErr });

    const id        = uuid();
    const createdAt = new Date().toISOString();
    const jeDate    = date || createdAt.substring(0, 10);

    stmtInsertJE.run({
      id,
      client_id:    clientId,
      user_id:      actingOwnerId(req),
      date:         jeDate,
      description,
      reference_no: referenceNo,
      entries:      JSON.stringify(cleanEntries),
      counterparty: JSON.stringify(cp),
      created_at:   createdAt,
    });

    const je = rowToJE(stmtJEById.get(id));
    logAudit({
      clientId,
      userId:  req.userRole === 'staff' ? req.ownerId : req.userId,
      staffId: req.userRole === 'staff' ? req.userId  : null,
      action: 'CREATE_JOURNAL_ENTRY', entity: 'journal_entry', entityId: id,
      detail: description || '',
    });
    res.status(201).json({ journalEntry: je });
  } catch (err) { next(err); }
});

// GET /api/journal-entries?clientId=
router.get('/', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId query param required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req))
      return res.status(404).json({ error: 'Client not found' });

    const codes   = codeSet(clientId);
    const entries = stmtJEsByClient.all(clientId).map(rowToJE).map(je => ({
      ...je,
      unmapped: (je.entries || []).filter(l => !codes.has(String(l.account || '').trim())).length,
    }));
    res.json({ journalEntries: entries, count: entries.length });
  } catch (err) { next(err); }
});

// PUT /api/journal-entries/:id — edit an entry (header, lines, supplier)
router.put('/:id', (req, res, next) => {
  try {
    const je = rowToJE(stmtJEById.get(req.params.id));
    if (!je) return res.status(404).json({ error: 'Journal entry not found' });
    const client = rowToClient(stmtClientById.get(je.clientId));
    if (!client || !canAccess(client, req))
      return res.status(403).json({ error: 'Not authorised' });

    const { date, description, referenceNo = '', entries = [], counterparty = null } = req.body || {};
    if (!description)    return res.status(400).json({ error: 'description is required' });
    if (!entries.length) return res.status(400).json({ error: 'At least one entry line is required' });

    const cleanEntries = entries.map(e => ({
      account: String(e.account || '').trim(),
      debit:   cents(e.debit),
      credit:  cents(e.credit),
    }));
    const totalDebit  = cleanEntries.reduce((s, e) => s + e.debit,  0);
    const totalCredit = cleanEntries.reduce((s, e) => s + e.credit, 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01)
      return res.status(400).json({
        error: `Journal entry is unbalanced. Debits (${totalDebit.toFixed(2)}) ≠ Credits (${totalCredit.toFixed(2)})`
      });

    const accErr = accountError(codeSet(je.clientId), cleanEntries);
    if (accErr) return res.status(400).json({ error: accErr });

    stmtUpdateJE.run({
      id:           je.id,
      date:         date || je.date,
      description,
      reference_no: referenceNo,
      entries:      JSON.stringify(cleanEntries),
      counterparty: JSON.stringify(cleanCounterparty(counterparty)),
    });

    logAudit({
      clientId: je.clientId,
      userId:  req.userRole === 'staff' ? req.ownerId : req.userId,
      staffId: req.userRole === 'staff' ? req.userId  : null,
      action: 'UPDATE_JOURNAL_ENTRY', entity: 'journal_entry', entityId: je.id,
      detail: description,
    });
    res.json({ journalEntry: rowToJE(stmtJEById.get(je.id)) });
  } catch (err) { next(err); }
});

// DELETE /api/journal-entries/:id
router.delete('/:id', (req, res, next) => {
  try {
    const je = rowToJE(stmtJEById.get(req.params.id));
    if (!je) return res.status(404).json({ error: 'Journal entry not found' });

    const client = rowToClient(stmtClientById.get(je.clientId));
    if (!client || !canAccess(client, req))
      return res.status(403).json({ error: 'Not authorised' });

    stmtDeleteJE.run(req.params.id);
    logAudit({
      clientId: je.clientId,
      userId:  req.userRole === 'staff' ? req.ownerId : req.userId,
      staffId: req.userRole === 'staff' ? req.userId  : null,
      action: 'DELETE_JOURNAL_ENTRY', entity: 'journal_entry', entityId: je.id,
      detail: je.description || '',
    });
    res.json({ message: 'Journal entry deleted' });
  } catch (err) { next(err); }
});

export default router;
