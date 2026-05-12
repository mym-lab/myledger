// ─── Transaction Routes ────────────────────────────────────────────────────────
// POST   /api/transactions              create (clientId required)
// GET    /api/transactions?clientId=    list for client (includes voided, marked voided:true)
// PUT    /api/transactions/:id/void     soft-delete (CAS-compliant — no hard deletes)

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToTx } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { calculateIncomeVAT, calculateExpenseVAT } from '../lib/vat.js';
import { INCOME_CATEGORIES, EXPENSE_CATEGORIES } from '../lib/categories.js';
import { logAudit } from './audit.js';

const router = Router();
router.use(authenticate);

// ── CSV helpers ───────────────────────────────────────────────────────────────
function toCSV(headers, rows) {
  const esc = v => { const s = v == null ? '' : String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}
function sendCSV(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + toCSV(headers, rows)); // BOM prefix for Excel compatibility
}

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertTx   = db.prepare(`
  INSERT INTO transactions
    (id, client_id, user_id, type, description, category, account,
     vat_type, supplier_vat_type, settlement, settlement_account,
     counterparty_name, counterparty_tin, counterparty_address,
     reference_no, notes,
     amount_net, amount_vat, amount_gross, percentage_tax,
     ewt_rate, ewt_amount, created_at)
  VALUES
    (@id, @client_id, @user_id, @type, @description, @category, @account,
     @vat_type, @supplier_vat_type, @settlement, @settlement_account,
     @counterparty_name, @counterparty_tin, @counterparty_address,
     @reference_no, @notes,
     @amount_net, @amount_vat, @amount_gross, @percentage_tax,
     @ewt_rate, @ewt_amount, @created_at)
`);
const stmtTxById  = db.prepare('SELECT * FROM transactions WHERE id = ?');
const stmtVoidTx  = db.prepare(
  'UPDATE transactions SET voided_at=@voided_at, voided_by=@voided_by, void_reason=@void_reason WHERE id=@id'
);
const stmtLockCheck = db.prepare(
  'SELECT id FROM locked_periods WHERE client_id=? AND period=?'
);

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId ||
         (client.encoderIds || []).includes(userId);
}

function clientIsOPT(client) {
  return client.taxRegime === 'opt';
}

const SETTLEMENT_ACCOUNT = {
  cash:          'Cash on Hand',
  ar:            'Accounts Receivable',
  ap:            'Accounts Payable',
  ewallet:       'E-wallet (GCash/Maya)',
  bank_transfer: 'Bank Account',
  check:         'Bank Account',
  credit_card:   'Credit Card Payable',
};

// POST /api/transactions
router.post('/', (req, res, next) => {
  try {
    const {
      clientId, type, amount, description,
      category,
      vatType         = 'vatable',
      supplierVatType = 'vat',
      settlement      = 'cash',
      account         = '',
      counterpartyName = '', counterpartyTin = '', counterpartyAddress = '',
      referenceNo = '', notes = '',
      ewtRate = 0,
    } = req.body;

    if (!clientId)  return res.status(400).json({ error: 'clientId is required' });
    if (!type || amount == null || !description)
      return res.status(400).json({ error: 'type, amount and description are required' });
    if (!['income', 'expense'].includes(type))
      return res.status(400).json({ error: 'type must be "income" or "expense"' });
    if (typeof amount !== 'number' || amount <= 0)
      return res.status(400).json({ error: 'amount must be a positive number' });

    const clientRow = stmtClientById.get(clientId);
    const client    = rowToClient(clientRow);
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    // Period lock check
    const txPeriod = new Date().toISOString().substring(0, 7);
    if (stmtLockCheck.get(clientId, txPeriod))
      return res.status(423).json({ error: `Period ${txPeriod} is locked. Unlock it first.` });

    // Category validation
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
    const cat  = category && cats.includes(category) ? category : (category || cats[0]);

    // VAT / OPT calculation
    let vatResult;
    if (type === 'income') {
      const isOPT   = clientIsOPT(client);
      const optRate = client.optRate ?? 0.03;
      vatResult = calculateIncomeVAT(amount, vatType, isOPT, optRate);
    } else {
      vatResult = calculateExpenseVAT(amount, supplierVatType);
    }

    // Resolve account labels
    const settleAcct = SETTLEMENT_ACCOUNT[settlement] || 'Cash on Hand';
    const txAccount  = account || (type === 'income' ? 'Sales Revenue' : cat);

    // EWT calculation
    const validEwtRate = [0, 0.01, 0.02, 0.05, 0.10, 0.15, 0.25].includes(Number(ewtRate)) ? Number(ewtRate) : 0;
    const ewtAmount    = type === 'expense' ? Math.round(vatResult.net * validEwtRate * 100) / 100 : 0;

    const id        = uuid();
    const createdAt = new Date().toISOString();

    stmtInsertTx.run({
      id,
      client_id:           clientId,
      user_id:             req.userId,
      type,
      description,
      category:            cat,
      account:             txAccount,
      vat_type:            type === 'income' ? (vatResult.taxType || vatType) : null,
      supplier_vat_type:   type === 'expense' ? supplierVatType : null,
      settlement,
      settlement_account:  settleAcct,
      counterparty_name:   counterpartyName,
      counterparty_tin:    counterpartyTin,
      counterparty_address: counterpartyAddress,
      reference_no:        referenceNo,
      notes,
      amount_net:          vatResult.net,
      amount_vat:          vatResult.vat,
      amount_gross:        vatResult.gross,
      percentage_tax:      vatResult.percentageTax ?? 0,
      ewt_rate:            type === 'expense' ? validEwtRate : 0,
      ewt_amount:          ewtAmount,
      created_at:          createdAt,
    });

    logAudit({
      clientId, userId: req.userId,
      action: 'CREATE_TRANSACTION', entity: 'transaction', entityId: id,
      detail: `${type} ₱${vatResult.gross} — ${description}`,
    });

    res.status(201).json({
      id, type, description,
      category: cat, account: txAccount,
      vatType:        type === 'income' ? (vatResult.taxType || vatType) : undefined,
      supplierVatType: type === 'expense' ? supplierVatType : undefined,
      settlement, settlementAccount: settleAcct,
      counterpartyName, counterpartyTin, counterpartyAddress,
      referenceNo, notes,
      net:          vatResult.net,
      vat:          vatResult.vat,
      gross:        vatResult.gross,
      percentageTax: vatResult.percentageTax ?? 0,
      ewtRate:      type === 'expense' ? validEwtRate : 0,
      ewtAmount,
      createdAt,
    });
  } catch (err) { next(err); }
});

// GET /api/transactions?clientId=[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
router.get('/', (req, res, next) => {
  try {
    const { clientId, from, to } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId query param required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    // Build dynamic SQL with optional date filters
    let sql    = 'SELECT * FROM transactions WHERE client_id=?';
    const args = [clientId];
    if (from) { sql += ' AND created_at >= ?'; args.push(from); }
    if (to)   { sql += ' AND created_at <= ?'; args.push(to + 'T23:59:59'); }
    sql += ' ORDER BY created_at DESC';

    const rows = db.prepare(sql).all(...args);

    const transactions = rows.map(r => {
      const t = rowToTx(r);
      return {
        id: t.id, type: t.type, description: t.description,
        category:            t.category            || '',
        account:             t.account             || (t.type === 'income' ? 'Sales Revenue' : t.category || ''),
        vatType:             t.vatType             || (t.type === 'income' ? 'vatable' : undefined),
        supplierVatType:     t.supplierVatType     || (t.type === 'expense' ? 'vat' : undefined),
        settlement:          t.settlement          || 'cash',
        settlementAccount:   t.settlementAccount   || 'Cash on Hand',
        counterpartyName:    t.counterpartyName    || '',
        counterpartyTin:     t.counterpartyTin     || '',
        counterpartyAddress: t.counterpartyAddress || '',
        referenceNo:         t.referenceNo         || '',
        notes:               t.notes               || '',
        net:   t.amount_net,
        vat:   t.amount_vat,
        gross: t.amount_gross,
        percentageTax: t.percentageTax || 0,
        ewtRate:       t.ewtRate   || 0,
        ewtAmount:     t.ewtAmount || 0,
        voided:    !!t.voidedAt,
        voidedAt:   t.voidedAt   || null,
        voidReason: t.voidReason || '',
        createdAt: t.createdAt,
      };
    });

    if (req.query.format === 'csv') {
      const date = new Date().toISOString().substring(0, 10);
      const headers = ['Date','Type','Description','Category','Reference No.','Counterparty Name','TIN','Settlement','NET (PHP)','VAT (PHP)','GROSS (PHP)','VAT Type','EWT Rate','EWT Amount','Voided','Void Reason'];
      const csvRows = transactions.map(t => [
        t.createdAt.substring(0, 10), t.type, t.description, t.category,
        t.referenceNo, t.counterpartyName, t.counterpartyTin, t.settlement,
        t.net, t.vat, t.gross,
        t.vatType || t.supplierVatType || '',
        t.ewtRate || 0, t.ewtAmount || 0,
        t.voided ? 'Yes' : 'No', t.voidReason || '',
      ]);
      return sendCSV(res, `transactions_${date}.csv`, headers, csvRows);
    }

    res.json({ transactions, count: transactions.length });
  } catch (err) { next(err); }
});

// PUT /api/transactions/:id/void  — CAS-compliant soft delete
router.put('/:id/void', (req, res, next) => {
  try {
    const tx = rowToTx(stmtTxById.get(req.params.id));
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.voidedAt) return res.status(400).json({ error: 'Transaction already voided' });

    const client = rowToClient(stmtClientById.get(tx.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    // Period lock check on void
    const txPeriod = tx.createdAt.substring(0, 7);
    if (stmtLockCheck.get(tx.clientId, txPeriod))
      return res.status(423).json({ error: `Period ${txPeriod} is locked. Unlock it first.` });

    const voidedAt = new Date().toISOString();
    const voidReason = (req.body.reason || '').trim();

    stmtVoidTx.run({ id: req.params.id, voided_at: voidedAt, voided_by: req.userId, void_reason: voidReason });

    logAudit({
      clientId: tx.clientId, userId: req.userId,
      action: 'VOID_TRANSACTION', entity: 'transaction', entityId: tx.id,
      detail: voidReason,
    });

    res.json({ message: 'Transaction voided', id: tx.id, voidedAt });
  } catch (err) { next(err); }
});

export default router;
