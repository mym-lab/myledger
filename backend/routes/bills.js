// ─── Bills / Accounts Payable ─────────────────────────────────────────────────
// GET    /api/bills?clientId=
// POST   /api/bills          { clientId, vendorName, vendorEmail, billNumber, billDate, dueDate, category, notes, amountNet, amountVat, amountGross }
// PUT    /api/bills/:id      { vendorName, vendorEmail, billNumber, billDate, dueDate, category, notes, amountNet, amountVat, amountGross }
// POST   /api/bills/:id/pay  — mark paid
// POST   /api/bills/:id/void — void
// DELETE /api/bills/:id

import { Router } from 'express';
import { db, rowToClient } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';
import { v4 as uuid } from 'uuid';

const router = Router();
router.use(authenticate);
router.use(noEncoder);

const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

function rowToBill(r) {
  if (!r) return null;
  return {
    id:          r.id,
    clientId:    r.client_id,
    vendorName:  r.vendor_name,
    vendorEmail: r.vendor_email,
    billNumber:  r.bill_number,
    billDate:    r.bill_date,
    dueDate:     r.due_date,
    category:    r.category,
    notes:       r.notes,
    amountNet:   r.amount_net,
    amountVat:   r.amount_vat,
    amountGross: r.amount_gross,
    status:      r.status,
    paidAt:      r.paid_at,
    createdBy:   r.created_by,
    createdAt:   r.created_at,
  };
}

// ── List bills ────────────────────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  try {
    const { clientId, status } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.user.userId)) return res.status(403).json({ error: 'Forbidden' });

    let sql = 'SELECT * FROM bills WHERE client_id = ?';
    const args = [clientId];
    if (status) { sql += ' AND status = ?'; args.push(status); }
    sql += ' ORDER BY due_date ASC, created_at DESC';

    const bills = db.prepare(sql).all(...args).map(rowToBill);
    res.json({ bills });
  } catch (err) { next(err); }
});

// ── Create bill ───────────────────────────────────────────────────────────────
router.post('/', (req, res, next) => {
  try {
    const { clientId, vendorName, billDate, dueDate, amountNet = 0, amountVat = 0, amountGross = 0,
            vendorEmail = '', billNumber = '', category = '', notes = '' } = req.body;
    if (!clientId || !vendorName || !billDate || !dueDate)
      return res.status(400).json({ error: 'clientId, vendorName, billDate, dueDate required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.user.userId)) return res.status(403).json({ error: 'Forbidden' });

    const id = uuid();
    db.prepare(`
      INSERT INTO bills (id, client_id, vendor_name, vendor_email, bill_number, bill_date, due_date,
        category, notes, amount_net, amount_vat, amount_gross, status, paid_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', '', ?, datetime('now'))
    `).run(id, clientId, vendorName, vendorEmail, billNumber, billDate, dueDate,
           category, notes, +amountNet, +amountVat, +amountGross, req.user.userId);

    const bill = rowToBill(db.prepare('SELECT * FROM bills WHERE id = ?').get(id));
    res.status(201).json({ bill });
  } catch (err) { next(err); }
});

// ── Update bill ───────────────────────────────────────────────────────────────
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bill not found' });
    if (row.status !== 'unpaid') return res.status(400).json({ error: 'Cannot edit a paid or voided bill' });

    const client = rowToClient(stmtClientById.get(row.client_id));
    if (!client || !canAccess(client, req.user.userId)) return res.status(403).json({ error: 'Forbidden' });

    const { vendorName = row.vendor_name, vendorEmail = row.vendor_email, billNumber = row.bill_number,
            billDate = row.bill_date, dueDate = row.due_date, category = row.category,
            notes = row.notes, amountNet = row.amount_net, amountVat = row.amount_vat,
            amountGross = row.amount_gross } = req.body;

    db.prepare(`
      UPDATE bills SET vendor_name=?, vendor_email=?, bill_number=?, bill_date=?, due_date=?,
        category=?, notes=?, amount_net=?, amount_vat=?, amount_gross=? WHERE id=?
    `).run(vendorName, vendorEmail, billNumber, billDate, dueDate,
           category, notes, +amountNet, +amountVat, +amountGross, req.params.id);

    res.json({ bill: rowToBill(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id)) });
  } catch (err) { next(err); }
});

// ── Mark paid ─────────────────────────────────────────────────────────────────
router.post('/:id/pay', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bill not found' });
    if (row.status !== 'unpaid') return res.status(400).json({ error: 'Bill is already paid or voided' });

    const client = rowToClient(stmtClientById.get(row.client_id));
    if (!client || !canAccess(client, req.user.userId)) return res.status(403).json({ error: 'Forbidden' });

    const paidAt = new Date().toISOString().substring(0, 10);
    db.prepare("UPDATE bills SET status='paid', paid_at=? WHERE id=?").run(paidAt, req.params.id);
    res.json({ bill: rowToBill(db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id)) });
  } catch (err) { next(err); }
});

// ── Void bill ─────────────────────────────────────────────────────────────────
router.post('/:id/void', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bill not found' });

    const client = rowToClient(stmtClientById.get(row.client_id));
    if (!client || !canAccess(client, req.user.userId)) return res.status(403).json({ error: 'Forbidden' });

    db.prepare("UPDATE bills SET status='void' WHERE id=?").run(req.params.id);
    res.json({ message: 'Bill voided' });
  } catch (err) { next(err); }
});

// ── Delete bill ───────────────────────────────────────────────────────────────
router.delete('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Bill not found' });

    const client = rowToClient(stmtClientById.get(row.client_id));
    if (!client || !canAccess(client, req.user.userId)) return res.status(403).json({ error: 'Forbidden' });

    db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
    res.json({ message: 'Bill deleted' });
  } catch (err) { next(err); }
});

export default router;
