import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function generateShareToken() {
  return uuidv4().replace(/-/g, '');
}

function generateInvoiceNumber(clientId, prefix = 'INV') {
  const year = new Date().getFullYear();

  const existing = db.prepare(
    `SELECT last_number FROM invoice_sequences WHERE client_id = ? AND year = ?`
  ).get(clientId, year);

  let nextNum;
  if (existing) {
    nextNum = existing.last_number + 1;
    db.prepare(
      `UPDATE invoice_sequences SET last_number = ? WHERE client_id = ? AND year = ?`
    ).run(nextNum, clientId, year);
  } else {
    nextNum = 1;
    db.prepare(
      `INSERT INTO invoice_sequences (client_id, year, last_number) VALUES (?, ?, ?)`
    ).run(clientId, year, nextNum);
  }

  const padded = String(nextNum).padStart(4, '0');
  return `${prefix}-${year}-${padded}`;
}

function calcTotals(items, vatType = 'vatable') {
  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0);
  const vat_amount = vatType === 'vatable' ? Math.round(subtotal * 0.12 * 100) / 100 : 0;
  const total = Math.round((subtotal + vat_amount) * 100) / 100;
  return { subtotal: Math.round(subtotal * 100) / 100, vat_amount, total };
}

// ─── GET ALL INVOICES ─────────────────────────────────────────────────────────

router.get('/', authenticateToken, (req, res) => {
  try {
    const clientId = req.query.client_id || req.user.clientId;

    if (req.user.role === 'client' && clientId !== req.user.clientId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const invoices = db.prepare(`
      SELECT i.*,
        (SELECT json_group_array(json_object(
          'id', ii.id, 'description', ii.description,
          'quantity', ii.quantity, 'unit_price', ii.unit_price, 'amount', ii.amount
        )) FROM invoice_items ii WHERE ii.invoice_id = i.id) as items_json
      FROM invoices i
      WHERE i.client_id = ?
      ORDER BY i.created_at DESC
    `).all(clientId);

    const result = invoices.map(inv => ({
      ...inv,
      items: inv.items_json ? JSON.parse(inv.items_json) : [],
      items_json: undefined,
    }));

    res.json(result);
  } catch (err) {
    console.error('GET /invoices error:', err);
    res.status(500).json({ error: 'Failed to fetch invoices' });
  }
});

// ─── GET SINGLE INVOICE ───────────────────────────────────────────────────────

router.get('/:id', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid`).all(req.params.id);
    res.json({ ...invoice, items });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// ─── PUBLIC: VIEW BY SHARE TOKEN (no auth) ───────────────────────────────────

router.get('/public/:token', (req, res) => {
  try {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE share_token = ?`).get(req.params.token);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Use trade_name aliased as business_name for the public view
    const client = db.prepare(
      `SELECT trade_name AS business_name, address, tin FROM clients WHERE id = ?`
    ).get(invoice.client_id);

    const items = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY rowid`).all(invoice.id);

    res.json({ ...invoice, items, issuer: client || {} });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

// ─── CREATE INVOICE ───────────────────────────────────────────────────────────

router.post('/', authenticateToken, (req, res) => {
  try {
    const {
      client_id,
      customer_name,
      customer_email = '',
      customer_address = '',
      customer_tin = '',
      issue_date,
      due_date = '',
      payment_terms = 'Due on Receipt',
      notes = '',
      vat_type = 'vatable',
      invoice_prefix = 'INV',
      items = [],
    } = req.body;

    if (!customer_name) return res.status(400).json({ error: 'customer_name is required' });
    if (!items.length)  return res.status(400).json({ error: 'At least one line item is required' });

    const targetClientId = client_id || req.user.clientId;

    if (req.user.role === 'client' && targetClientId !== req.user.clientId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { subtotal, vat_amount, total } = calcTotals(items, vat_type);
    const invoiceNumber = generateInvoiceNumber(targetClientId, invoice_prefix);
    const shareToken    = generateShareToken();
    const id  = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO invoices (
        id, client_id, invoice_number, invoice_prefix,
        customer_name, customer_email, customer_address, customer_tin,
        issue_date, due_date, payment_terms, notes, vat_type,
        subtotal, vat_amount, total,
        share_token, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)
    `).run(
      id, targetClientId, invoiceNumber, invoice_prefix,
      customer_name, customer_email, customer_address, customer_tin,
      issue_date || now.slice(0, 10), due_date, payment_terms, notes, vat_type,
      subtotal, vat_amount, total,
      shareToken, req.user.id, now, now
    );

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertItem.run(
        uuidv4(), id, item.description,
        item.quantity || 1,
        item.unit_price || 0,
        Math.round((item.quantity || 1) * (item.unit_price || 0) * 100) / 100
      );
    }

    const created      = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(id);
    const createdItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).all(id);
    res.status(201).json({ ...created, items: createdItems });
  } catch (err) {
    console.error('POST /invoices error:', err);
    res.status(500).json({ error: 'Failed to create invoice' });
  }
});

// ─── UPDATE INVOICE (draft only) ─────────────────────────────────────────────

router.put('/:id', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be edited' });

    const {
      customer_name, customer_email, customer_address, customer_tin,
      issue_date, due_date, payment_terms, notes, vat_type, items,
    } = req.body;

    const { subtotal, vat_amount, total } = calcTotals(items || [], vat_type || invoice.vat_type);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE invoices SET
        customer_name = ?, customer_email = ?, customer_address = ?, customer_tin = ?,
        issue_date = ?, due_date = ?, payment_terms = ?, notes = ?, vat_type = ?,
        subtotal = ?, vat_amount = ?, total = ?, updated_at = ?
      WHERE id = ?
    `).run(
      customer_name    ?? invoice.customer_name,
      customer_email   ?? invoice.customer_email,
      customer_address ?? invoice.customer_address,
      customer_tin     ?? invoice.customer_tin,
      issue_date       || invoice.issue_date,
      due_date         ?? invoice.due_date,
      payment_terms    || invoice.payment_terms,
      notes            ?? invoice.notes,
      vat_type         || invoice.vat_type,
      subtotal, vat_amount, total, now,
      req.params.id
    );

    if (items) {
      db.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).run(req.params.id);
      const insertItem = db.prepare(`
        INSERT INTO invoice_items (id, invoice_id, description, quantity, unit_price, amount)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(
          uuidv4(), req.params.id, item.description,
          item.quantity || 1, item.unit_price || 0,
          Math.round((item.quantity || 1) * (item.unit_price || 0) * 100) / 100
        );
      }
    }

    const updated      = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
    const updatedItems = db.prepare(`SELECT * FROM invoice_items WHERE invoice_id = ?`).all(req.params.id);
    res.json({ ...updated, items: updatedItems });
  } catch (err) {
    console.error('PUT /invoices error:', err);
    res.status(500).json({ error: 'Failed to update invoice' });
  }
});

// ─── MARK AS SENT ─────────────────────────────────────────────────────────────

router.post('/:id/send', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'Cannot send a voided invoice' });

    const now = new Date().toISOString();
    db.prepare(`UPDATE invoices SET status = 'sent', sent_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, req.params.id);

    res.json({ success: true, status: 'sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as sent' });
  }
});

// ─── MARK AS PAID → auto-create income transaction ───────────────────────────

router.post('/:id/pay', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'paid') return res.status(400).json({ error: 'Invoice already paid' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'Cannot mark a voided invoice as paid' });

    const { settlement = 'cash', payment_date } = req.body;
    const now     = new Date().toISOString();
    const paidAt  = payment_date ? `${payment_date}T00:00:00.000Z` : now;
    const txId    = uuidv4();

    // Auto-create income transaction (matches v10-clean transactions schema)
    db.prepare(`
      INSERT INTO transactions (
        id, client_id, user_id, type, description, category,
        vat_type, settlement, reference_no,
        amount_net, amount_vat, amount_gross,
        created_at, invoice_id
      ) VALUES (?, ?, ?, 'income', ?, 'Sale of Services', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      txId,
      invoice.client_id,
      req.user.id,
      `Invoice ${invoice.invoice_number} — ${invoice.customer_name}`,
      invoice.vat_type,
      settlement,
      invoice.invoice_number,
      invoice.subtotal,
      invoice.vat_amount,
      invoice.total,
      paidAt,
      invoice.id
    );

    db.prepare(`
      UPDATE invoices SET status = 'paid', paid_at = ?, transaction_id = ?, updated_at = ?
      WHERE id = ?
    `).run(now, txId, now, req.params.id);

    res.json({ success: true, status: 'paid', transaction_id: txId });
  } catch (err) {
    console.error('POST /invoices/pay error:', err);
    res.status(500).json({ error: 'Failed to mark invoice as paid' });
  }
});

// ─── VOID INVOICE → reversal transaction if was paid ─────────────────────────

router.post('/:id/void', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status === 'void') return res.status(400).json({ error: 'Invoice already voided' });

    // Only accountants or admin can void paid invoices
    if (invoice.status === 'paid' && req.user.role === 'client') {
      return res.status(403).json({ error: 'Only accountants can void paid invoices' });
    }

    const { void_reason = '' } = req.body;
    const now = new Date().toISOString();
    let reversalTxId = null;

    // If invoice was paid → create reversal transaction (negative amounts cancel Output VAT)
    if (invoice.status === 'paid' && invoice.transaction_id) {
      reversalTxId = uuidv4();
      db.prepare(`
        INSERT INTO transactions (
          id, client_id, user_id, type, description, category,
          vat_type, settlement, reference_no,
          amount_net, amount_vat, amount_gross,
          created_at, invoice_id
        ) VALUES (?, ?, ?, 'income', ?, 'Sale of Services — Reversal', ?, 'reversal', ?, ?, ?, ?, ?, ?)
      `).run(
        reversalTxId,
        invoice.client_id,
        req.user.id,
        `VOID: Invoice ${invoice.invoice_number} — ${invoice.customer_name}`,
        invoice.vat_type,
        `VOID-${invoice.invoice_number}`,
        -invoice.subtotal,
        -invoice.vat_amount,
        -invoice.total,
        now,
        invoice.id
      );
    }

    db.prepare(`
      UPDATE invoices SET
        status = 'void', void_reason = ?, voided_by = ?, voided_at = ?,
        reversal_transaction_id = ?, updated_at = ?
      WHERE id = ?
    `).run(void_reason, req.user.id, now, reversalTxId, now, req.params.id);

    res.json({ success: true, status: 'void', reversal_transaction_id: reversalTxId });
  } catch (err) {
    console.error('POST /invoices/void error:', err);
    res.status(500).json({ error: 'Failed to void invoice' });
  }
});

// ─── DELETE (draft only) ──────────────────────────────────────────────────────

router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const invoice = db.prepare(`SELECT * FROM invoices WHERE id = ?`).get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.status !== 'draft') return res.status(400).json({ error: 'Only draft invoices can be deleted' });

    db.prepare(`DELETE FROM invoice_items WHERE invoice_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM invoices WHERE id = ?`).run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete invoice' });
  }
});

export default router;
