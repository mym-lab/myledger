// ─── Report Routes ─────────────────────────────────────────────────────────────
// GET /api/reports/income?clientId=[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
// GET /api/reports/balance?clientId=[&asOf=YYYY-MM-DD]
// GET /api/reports/cashflow?clientId=[&from=YYYY-MM-DD][&to=YYYY-MM-DD]
// GET /api/reports/books?clientId=&type=sales|purchases|receipts|disbursements[&from=][&to=]
// GET /api/reports/slsp?clientId=&year=&quarter=1|2|3|4
// GET /api/reports/general-journal?clientId=[&from=][&to=]
// GET /api/reports/general-ledger?clientId=[&from=][&to=][&account=]

import { Router } from 'express';
import { db, rowToClient, rowToTx, rowToJE, rowToAsset, rowToContact } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);

const round = (n) => Math.round(n * 100) / 100;
const sum   = (arr, key) => arr.reduce((s, t) => s + (t[key] || 0), 0);

// ── CSV helpers ───────────────────────────────────────────────────────────────
function toCSV(headers, rows) {
  const esc = v => { const s = v == null ? '' : String(v); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
}
function sendCSV(res, filename, headers, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + toCSV(headers, rows));
}

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById    = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtTxByClient    = db.prepare(`SELECT * FROM transactions WHERE client_id=? AND voided_at IS NULL`);
const stmtAssetsByClient= db.prepare(`SELECT * FROM assets WHERE client_id=? AND status='active'`);
const stmtJEsByClient   = db.prepare(`SELECT * FROM journal_entries WHERE client_id=? ORDER BY date ASC`);
const stmtContactsByClient = db.prepare('SELECT * FROM contacts WHERE client_id=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

function getClientAndTx(clientId, userId) {
  const client = rowToClient(stmtClientById.get(clientId));
  if (!client || !canAccess(client, userId)) return { client: null, txns: [] };
  const txns = stmtTxByClient.all(clientId).map(rowToTx);
  return { client, txns };
}

function filterByDate(txns, from, to) {
  return txns.filter(t => {
    if (from && t.createdAt < from) return false;
    if (to   && t.createdAt > to + 'T23:59:59') return false;
    return true;
  });
}

// ── Income Statement ──────────────────────────────────────────────────────────
router.get('/income', (req, res, next) => {
  try {
    const { clientId, from, to } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const filtered = filterByDate(txns, from, to);
    const income   = filtered.filter(t => t.type === 'income');
    const expense  = filtered.filter(t => t.type === 'expense');

    const revenue  = round(sum(income,  'amount_net'));
    const expenses = round(sum(expense, 'amount_net'));
    const optTax   = round(sum(income,  'percentageTax'));

    const vatable   = round(sum(income.filter(t => t.vatType === 'vatable'    || !t.vatType), 'amount_net'));
    const zeroRated = round(sum(income.filter(t => t.vatType === 'zero_rated'), 'amount_net'));
    const exempt    = round(sum(income.filter(t => t.vatType === 'exempt'),     'amount_net'));
    const optSales  = round(sum(income.filter(t => t.vatType === 'opt'),        'amount_net'));

    // ── COGS vs Operating expense split ──────────────────────────────────────
    const COGS_CATS = ['Cost of Goods Sold'];
    const cogsExpense = expense.filter(t =>  COGS_CATS.includes(t.category));
    const opexExpense = expense.filter(t => !COGS_CATS.includes(t.category));

    const costOfSales       = round(sum(cogsExpense, 'amount_net'));
    const operatingExpenses = round(sum(opexExpense, 'amount_net'));
    const grossProfit       = round(revenue - costOfSales);

    // Itemised by category (only include categories that have amounts)
    function byCategory(txList) {
      const map = {};
      for (const t of txList) {
        const cat = t.category || 'Other Expenses';
        map[cat] = round((map[cat] || 0) + (t.amount_net || 0));
      }
      return map;
    }

    res.json({
      period: from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Up to ${to}` : 'All periods',
      revenue, expenses,
      costOfSales, operatingExpenses, grossProfit,
      profit:   round(revenue - expenses),
      optTax,
      revenueBreakdown: { vatable, zeroRated, exempt, optSales },
      expenseBreakdown: {
        cogs: byCategory(cogsExpense),
        opex: byCategory(opexExpense),
      },
      note: 'All amounts NET (VAT-exclusive) — correct for P&L reporting.',
    });
  } catch (err) { next(err); }
});

// ── Balance Sheet ─────────────────────────────────────────────────────────────
router.get('/balance', (req, res, next) => {
  try {
    const { clientId, asOf } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const filtered = asOf ? txns.filter(t => t.createdAt <= asOf + 'T23:59:59') : txns;
    const income   = filtered.filter(t => t.type === 'income');
    const expense  = filtered.filter(t => t.type === 'expense');

    const inputVAT  = round(sum(expense.filter(t => !t.supplierVatType || t.supplierVatType === 'vat'), 'amount_vat'));
    const outputVAT = round(sum(income.filter(t => t.vatType === 'vatable' || !t.vatType), 'amount_vat'));
    const netVAT    = round(outputVAT - inputVAT);

    const ar = round(sum(income.filter(t => t.settlement === 'ar'), 'amount_gross'));
    const ap = round(sum(expense.filter(t => t.settlement === 'ap' || t.settlement === 'credit_card'), 'amount_gross'));

    const cashIn  = round(sum(income.filter(t => ['cash','ewallet','bank_transfer'].includes(t.settlement || 'cash')), 'amount_gross'));
    const cashOut = round(sum(expense.filter(t => ['cash','ewallet','bank_transfer','check'].includes(t.settlement || 'cash')), 'amount_gross'));

    const assets     = stmtAssetsByClient.all(clientId).map(rowToAsset);
    const totalAssetCost = round(sum(assets, 'cost'));
    const cutoffDate = asOf ? new Date(asOf) : new Date();
    const totalAccumDep = round(assets.reduce((s, a) => {
      const start = new Date(a.startDate);
      const months = Math.max(0, Math.floor((cutoffDate - start) / (1000 * 60 * 60 * 24 * 30.44)));
      const depPerMonth = (a.cost - a.salvageValue) / a.usefulLifeMonths;
      return s + Math.min(depPerMonth * months, a.cost - a.salvageValue);
    }, 0));

    res.json({
      asOf: asOf || new Date().toISOString().substring(0, 10),
      assets: {
        input_vat:           inputVAT,
        accounts_receivable: ar,
        cash_net:            round(cashIn - cashOut),
        fixed_assets_net:    round(totalAssetCost - totalAccumDep),
        note: 'Input VAT Recoverable — claimable from BIR',
      },
      liabilities: {
        vat_payable:      outputVAT,
        accounts_payable: ap,
        note: 'Output VAT Payable — remittable to BIR',
      },
      net_vat_position: netVAT,
      net_note: netVAT >= 0 ? 'Net VAT payable to BIR' : 'Net VAT credit (refundable)',
    });
  } catch (err) { next(err); }
});

// ── Cash Flow Statement (Indirect Method) ────────────────────────────────────
router.get('/cashflow', (req, res, next) => {
  try {
    const { clientId, from, to } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const filtered = filterByDate(txns, from, to);
    const income   = filtered.filter(t => t.type === 'income');
    const expense  = filtered.filter(t => t.type === 'expense');

    const netIncome = round(sum(income, 'amount_net') - sum(expense, 'amount_net'));

    const assets = stmtAssetsByClient.all(clientId).map(rowToAsset);
    const depAddBack = round(assets.reduce((s, a) => {
      const startDate = from ? new Date(Math.max(new Date(a.startDate), new Date(from))) : new Date(a.startDate);
      const endDate   = to ? new Date(to) : new Date();
      if (startDate >= endDate) return s;
      const months = Math.max(0, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24 * 30.44)));
      const depPM  = (a.cost - a.salvageValue) / a.usefulLifeMonths;
      return s + Math.min(depPM * months, a.cost - a.salvageValue);
    }, 0));

    const arIncrease = round(sum(income.filter(t => t.settlement === 'ar'), 'amount_gross'));
    const apIncrease = round(sum(expense.filter(t => ['ap','credit_card'].includes(t.settlement || '')), 'amount_gross'));
    const operatingCF = round(netIncome + depAddBack - arIncrease + apIncrease);

    // Investing: asset purchases within period
    let assetSQL = 'SELECT * FROM assets WHERE client_id=?';
    const assetArgs = [clientId];
    if (from) { assetSQL += ' AND start_date >= ?'; assetArgs.push(from); }
    if (to)   { assetSQL += ' AND start_date <= ?'; assetArgs.push(to); }
    const assetsInPeriod = db.prepare(assetSQL).all(...assetArgs).map(rowToAsset);
    const investingCF = round(-sum(assetsInPeriod, 'cost'));

    const cashCollected = round(sum(income.filter(t => ['cash','ewallet','bank_transfer'].includes(t.settlement || 'cash')), 'amount_gross'));
    const cashPaid      = round(sum(expense.filter(t => ['cash','ewallet','bank_transfer','check'].includes(t.settlement || 'cash')), 'amount_gross'));
    const netCashChange = round(cashCollected - cashPaid + investingCF);

    res.json({
      period: from && to ? `${from} to ${to}` : 'All periods',
      operating:  { netIncome, depreciationAddBack: depAddBack, arIncrease: -arIncrease, apIncrease, total: operatingCF },
      investing:  { assetPurchases: investingCF, total: investingCF },
      financing:  { note: 'Manual journal entries required for loans/equity contributions.', total: 0 },
      direct:     { cashCollected, cashPaid: -cashPaid, note: 'Direct method cross-check (cash settlements only)' },
      netCashChange,
    });
  } catch (err) { next(err); }
});

// ── Accounting Books ──────────────────────────────────────────────────────────
router.get('/books', (req, res, next) => {
  try {
    const { clientId, type, from, to } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    if (!type)     return res.status(400).json({ error: 'type required (sales|purchases|receipts|disbursements)' });

    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const filtered = filterByDate(txns, from, to);
    let rows;

    if (type === 'sales') {
      rows = filtered.filter(t => t.type === 'income')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map(t => ({
          date: t.createdAt.substring(0, 10), referenceNo: t.referenceNo || '',
          customer: t.counterpartyName || '', tin: t.counterpartyTin || '',
          description: t.description, account: t.account || 'Sales Revenue',
          vatType: t.vatType || 'vatable',
          vatable:  t.vatType === 'vatable' || !t.vatType ? t.amount_net : 0,
          zeroRated: t.vatType === 'zero_rated' ? t.amount_net : 0,
          exempt:    t.vatType === 'exempt' ? t.amount_net : 0,
          optSales:  t.vatType === 'opt'    ? t.amount_gross : 0,
          outputVAT: t.amount_vat || 0, percentageTax: t.percentageTax || 0,
          gross: t.amount_gross, settlement: t.settlement || 'cash',
        }));
    } else if (type === 'purchases') {
      rows = filtered.filter(t => t.type === 'expense')
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map(t => ({
          date: t.createdAt.substring(0, 10), referenceNo: t.referenceNo || '',
          supplier: t.counterpartyName || '', tin: t.counterpartyTin || '',
          description: t.description, account: t.account || t.category || '',
          supplierVatType: t.supplierVatType || 'vat',
          vatPurchases:    !t.supplierVatType || t.supplierVatType === 'vat' ? t.amount_net : 0,
          nonVatPurchases: t.supplierVatType === 'non_vat' ? t.amount_gross : 0,
          inputVAT: t.amount_vat || 0, gross: t.amount_gross, settlement: t.settlement || 'cash',
        }));
    } else if (type === 'receipts') {
      const cashSettlements = ['cash', 'ewallet', 'bank_transfer'];
      rows = filtered.filter(t => t.type === 'income' && cashSettlements.includes(t.settlement || 'cash'))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map(t => ({
          date: t.createdAt.substring(0, 10), referenceNo: t.referenceNo || '',
          payer: t.counterpartyName || '', description: t.description,
          settlement: t.settlement || 'cash',
          vatable:   t.vatType === 'vatable' || !t.vatType ? t.amount_net : 0,
          zeroRated: t.vatType === 'zero_rated' ? t.amount_net : 0,
          outputVAT: t.amount_vat || 0, total: t.amount_gross,
        }));
    } else if (type === 'disbursements') {
      const cashSettlements = ['cash', 'ewallet', 'bank_transfer', 'check'];
      rows = filtered.filter(t => t.type === 'expense' && cashSettlements.includes(t.settlement || 'cash'))
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map(t => ({
          date: t.createdAt.substring(0, 10), referenceNo: t.referenceNo || '',
          payee: t.counterpartyName || '', description: t.description,
          settlement: t.settlement || 'cash', account: t.account || t.category || '',
          vatPurchases:    !t.supplierVatType || t.supplierVatType === 'vat' ? t.amount_net : 0,
          nonVatPurchases: t.supplierVatType === 'non_vat' ? t.amount_gross : 0,
          inputVAT: t.amount_vat || 0, total: t.amount_gross,
        }));
    } else {
      return res.status(400).json({ error: 'type must be sales|purchases|receipts|disbursements' });
    }

    const totals = rows.reduce((acc, r) => {
      Object.keys(r).forEach(k => { if (typeof r[k] === 'number') acc[k] = round((acc[k] || 0) + r[k]); });
      return acc;
    }, {});

    if (req.query.format === 'csv') {
      const date   = new Date().toISOString().substring(0, 10);
      const fname  = `${client.tradeName.replace(/\s+/g,'_')}_${type}_book_${date}.csv`;
      let headers, csvRows;
      if (type === 'sales') {
        headers  = ['Date','Ref No.','Customer','TIN','Description','Account','Vatable','Zero-Rated','Exempt','OPT Sales','Output VAT','% Tax','Gross'];
        csvRows  = rows.map(r => [r.date, r.referenceNo, r.customer, r.tin, r.description, r.account, r.vatable, r.zeroRated, r.exempt, r.optSales, r.outputVAT, r.percentageTax, r.gross]);
      } else if (type === 'purchases') {
        headers  = ['Date','Ref No.','Supplier','TIN','Description','Account','VAT Purchases','Non-VAT Purchases','Input VAT','Gross'];
        csvRows  = rows.map(r => [r.date, r.referenceNo, r.supplier, r.tin, r.description, r.account, r.vatPurchases, r.nonVatPurchases, r.inputVAT, r.gross]);
      } else if (type === 'receipts') {
        headers  = ['Date','Ref No.','Payer','Description','Settlement','Vatable','Zero-Rated','Output VAT','Total'];
        csvRows  = rows.map(r => [r.date, r.referenceNo, r.payer, r.description, r.settlement, r.vatable, r.zeroRated, r.outputVAT, r.total]);
      } else {
        headers  = ['Date','Ref No.','Payee','Description','Settlement','Account','VAT Purchases','Non-VAT Purchases','Input VAT','Total'];
        csvRows  = rows.map(r => [r.date, r.referenceNo, r.payee, r.description, r.settlement, r.account, r.vatPurchases, r.nonVatPurchases, r.inputVAT, r.total]);
      }
      return sendCSV(res, fname, headers, csvRows);
    }

    res.json({ type, period: from && to ? `${from} to ${to}` : 'All periods', rows, totals, count: rows.length });
  } catch (err) { next(err); }
});

// ── SLSP ─────────────────────────────────────────────────────────────────────
router.get('/slsp', (req, res, next) => {
  try {
    const { clientId, year, quarter } = req.query;
    if (!clientId || !year || !quarter)
      return res.status(400).json({ error: 'clientId, year and quarter are required' });

    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const contacts = stmtContactsByClient.all(clientId).map(rowToContact);
    const y = Number(year), q = Number(quarter);
    const qMonths = { 1: [1,2,3], 2: [4,5,6], 3: [7,8,9], 4: [10,11,12] }[q];
    if (!qMonths) return res.status(400).json({ error: 'quarter must be 1, 2, 3, or 4' });

    const findContact = (name) => {
      if (!name) return null;
      const lower = name.toLowerCase().trim();
      return contacts.find(c => c.name.toLowerCase().trim() === lower) || null;
    };
    const inPeriod = t => {
      const d = new Date(t.createdAt);
      return d.getFullYear() === y && qMonths.includes(d.getMonth() + 1);
    };

    const sales = txns.filter(t => t.type === 'income' && inPeriod(t))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(t => {
        const con = findContact(t.counterpartyName);
        return {
          date: t.createdAt.substring(0, 10), referenceNo: t.referenceNo || '',
          buyerName: t.counterpartyName || '(Walk-in Customer)',
          buyerTin: con?.tin || '', buyerAddr: con?.address || '',
          netSales:   round(t.amount_net   || 0),
          outputVAT:  round(t.amount_vat   || 0),
          grossSales: round(t.amount_gross || 0),
          vatType: t.vatType || 'vatable',
        };
      });

    const purchases = txns.filter(t => t.type === 'expense' && inPeriod(t))
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(t => {
        const con = findContact(t.counterpartyName);
        return {
          date: t.createdAt.substring(0, 10), referenceNo: t.referenceNo || '',
          supplierName: t.counterpartyName || '(Unknown Supplier)',
          supplierTin: con?.tin || '', supplierAddr: con?.address || '',
          netPurchases:   round(t.amount_net   || 0),
          inputVAT:       round(t.amount_vat   || 0),
          grossPurchases: round(t.amount_gross || 0),
          supplierVatType: t.supplierVatType || 'vat',
        };
      });

    if (req.query.format === 'csv') {
      const list = req.query.list || 'sales';
      const fname = `${client.tradeName.replace(/\s+/g,'_')}_SLSP_${list}_Q${q}_${y}.csv`;
      if (list === 'purchases') {
        const headers = ['Date','Invoice/OR No.','Supplier Name','Supplier TIN','Supplier Address','Net Purchases (PHP)','Input VAT (PHP)','Gross Purchases (PHP)','VAT Type'];
        const csvRows = purchases.map(r => [r.date, r.referenceNo, r.supplierName, r.supplierTin, r.supplierAddr, r.netPurchases, r.inputVAT, r.grossPurchases, r.supplierVatType]);
        return sendCSV(res, fname, headers, csvRows);
      } else {
        const headers = ['Date','Invoice/OR No.','Buyer Name','Buyer TIN','Buyer Address','Net Sales (PHP)','Output VAT (PHP)','Gross Sales (PHP)','VAT Type'];
        const csvRows = sales.map(r => [r.date, r.referenceNo, r.buyerName, r.buyerTin, r.buyerAddr, r.netSales, r.outputVAT, r.grossSales, r.vatType]);
        return sendCSV(res, fname, headers, csvRows);
      }
    }

    res.json({
      client: { id: client.id, tradeName: client.tradeName, tin: client.tin },
      period: { year: y, quarter: q, months: qMonths },
      sales, salesTotals: {
        netSales:   round(sales.reduce((s, r) => s + r.netSales,   0)),
        outputVAT:  round(sales.reduce((s, r) => s + r.outputVAT,  0)),
        grossSales: round(sales.reduce((s, r) => s + r.grossSales, 0)),
      },
      purchases, purchaseTotals: {
        netPurchases:   round(purchases.reduce((s, r) => s + r.netPurchases,   0)),
        inputVAT:       round(purchases.reduce((s, r) => s + r.inputVAT,       0)),
        grossPurchases: round(purchases.reduce((s, r) => s + r.grossPurchases, 0)),
      },
    });
  } catch (err) { next(err); }
});

// ── General Journal ───────────────────────────────────────────────────────────
router.get('/general-journal', (req, res, next) => {
  try {
    const { clientId, from, to } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const filtered = filterByDate(txns, from, to);

    const txLines = filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .map(t => {
        const settleAcct  = t.settlementAccount || 'Cash on Hand';
        const revenueAcct = t.account || (t.type === 'income' ? 'Sales Revenue' : t.category || 'Expense');
        let entries;
        if (t.type === 'income') {
          entries = [
            { account: settleAcct, debit: t.amount_gross, credit: 0 },
            { account: revenueAcct, debit: 0, credit: t.amount_net },
            ...(t.amount_vat > 0 ? [{ account: 'VAT Payable', debit: 0, credit: t.amount_vat }] : []),
          ];
        } else {
          entries = [
            { account: revenueAcct, debit: t.amount_net, credit: 0 },
            ...(t.amount_vat > 0 ? [{ account: 'Input VAT Recoverable', debit: t.amount_vat, credit: 0 }] : []),
            { account: settleAcct, debit: 0, credit: t.amount_gross },
          ];
        }
        return { source: 'transaction', id: t.id, date: t.createdAt.substring(0, 10),
          description: t.description, referenceNo: t.referenceNo || '', entries };
      });

    const manualJEs = stmtJEsByClient.all(clientId).map(rowToJE)
      .filter(je => {
        if (from && je.date < from) return false;
        if (to   && je.date > to)   return false;
        return true;
      })
      .map(je => ({
        source: 'manual', id: je.id, date: je.date,
        description: je.description, referenceNo: je.referenceNo || '',
        entries: je.entries.map(e => ({ account: e.account, debit: e.debit || 0, credit: e.credit || 0 })),
      }));

    const allEntries = [...txLines, ...manualJEs].sort((a, b) => new Date(a.date) - new Date(b.date));

    if (req.query.format === 'csv') {
      const date = new Date().toISOString().substring(0, 10);
      const headers = ['Date','Reference No.','Description','Account','Debit (PHP)','Credit (PHP)'];
      const csvRows = [];
      allEntries.forEach(e => {
        e.entries.forEach(line => {
          csvRows.push([e.date, e.referenceNo, e.description, line.account, line.debit || 0, line.credit || 0]);
        });
      });
      return sendCSV(res, `${client.tradeName.replace(/\s+/g,'_')}_general_journal_${date}.csv`, headers, csvRows);
    }

    res.json({ period: from && to ? `${from} to ${to}` : 'All periods', entries: allEntries, count: allEntries.length });
  } catch (err) { next(err); }
});

// ── General Ledger ────────────────────────────────────────────────────────────
router.get('/general-ledger', (req, res, next) => {
  try {
    const { clientId, from, to, account: filterAccount } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const filtered = filterByDate(txns, from, to);
    const lines = [];

    filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(t => {
      const settleAcct  = t.settlementAccount || 'Cash on Hand';
      const revenueAcct = t.account || (t.type === 'income' ? 'Sales Revenue' : t.category || 'Expense');
      const date = t.createdAt.substring(0, 10);
      const ref  = t.referenceNo || '';
      const desc = t.description;
      if (t.type === 'income') {
        lines.push({ date, account: settleAcct,              debit: t.amount_gross, credit: 0, description: desc, ref });
        lines.push({ date, account: revenueAcct,             debit: 0, credit: t.amount_net,   description: desc, ref });
        if (t.amount_vat > 0)
          lines.push({ date, account: 'VAT Payable',         debit: 0, credit: t.amount_vat,   description: desc, ref });
      } else {
        lines.push({ date, account: revenueAcct,             debit: t.amount_net,   credit: 0, description: desc, ref });
        if (t.amount_vat > 0)
          lines.push({ date, account: 'Input VAT Recoverable', debit: t.amount_vat, credit: 0, description: desc, ref });
        lines.push({ date, account: settleAcct,              debit: 0, credit: t.amount_gross, description: desc, ref });
      }
    });

    stmtJEsByClient.all(clientId).map(rowToJE)
      .filter(je => {
        if (from && je.date < from) return false;
        if (to   && je.date > to)   return false;
        return true;
      })
      .forEach(je => {
        (je.entries || []).forEach(e => {
          lines.push({ date: je.date, account: e.account, debit: e.debit || 0, credit: e.credit || 0,
            description: je.description, ref: je.referenceNo || '' });
        });
      });

    const accountMap = {};
    lines.forEach(l => {
      if (!accountMap[l.account]) accountMap[l.account] = [];
      accountMap[l.account].push(l);
    });

    const accounts = Object.keys(accountMap)
      .filter(a => !filterAccount || a.toLowerCase().includes(filterAccount.toLowerCase()))
      .sort()
      .map(accountName => {
        let runningBalance = 0;
        const rows = accountMap[accountName]
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .map(l => {
            runningBalance = round(runningBalance + l.debit - l.credit);
            return { date: l.date, description: l.description, ref: l.ref,
              debit: l.debit, credit: l.credit, balance: runningBalance };
          });
        const totalDebit  = round(rows.reduce((s, r) => s + r.debit,  0));
        const totalCredit = round(rows.reduce((s, r) => s + r.credit, 0));
        return { account: accountName, rows, totalDebit, totalCredit, closingBalance: runningBalance };
      });

    if (req.query.format === 'csv') {
      const date = new Date().toISOString().substring(0, 10);
      const headers = ['Account','Date','Description','Reference No.','Debit (PHP)','Credit (PHP)','Running Balance (PHP)'];
      const csvRows = [];
      accounts.forEach(acct => {
        acct.rows.forEach(r => {
          csvRows.push([acct.account, r.date, r.description, r.ref, r.debit, r.credit, r.balance]);
        });
        csvRows.push(['', '', `— ${acct.account} Totals —`, '', acct.totalDebit, acct.totalCredit, acct.closingBalance]);
        csvRows.push([]); // blank separator between accounts
      });
      return sendCSV(res, `${client.tradeName.replace(/\s+/g,'_')}_general_ledger_${date}.csv`, headers, csvRows);
    }

    res.json({ period: from && to ? `${from} to ${to}` : 'All periods', accounts, accountCount: accounts.length });
  } catch (err) { next(err); }
});

// ── Income Compare (Multi-Period) ──────────────────────────────────────────────
// GET /api/reports/income-compare?clientId=&period=YYYY-MM
// Returns 3-column income statement: current month, previous month, same month last year + variances
router.get('/income-compare', (req, res, next) => {
  try {
    const { clientId } = req.query;
    let { period } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    // Default period = current month
    if (!period) {
      const now = new Date();
      period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const { client, txns } = getClientAndTx(clientId, req.userId);
    if (!client) return res.status(404).json({ error: 'Client not found' });

    const [y, m] = period.split('-').map(Number);

    // Build date ranges for the 3 periods
    function monthRange(year, month) {
      const pad = n => String(n).padStart(2, '0');
      const lastDay = new Date(year, month, 0).getDate();
      return {
        from: `${year}-${pad(month)}-01`,
        to:   `${year}-${pad(month)}-${lastDay}`,
        label: new Date(year, month - 1, 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' }),
      };
    }

    const prevMonth = m === 1 ? monthRange(y - 1, 12) : monthRange(y, m - 1);
    const currMonth = monthRange(y, m);
    const lastYear  = monthRange(y - 1, m);

    function computePeriod(range) {
      const filtered = filterByDate(txns, range.from, range.to);
      const income   = filtered.filter(t => t.type === 'income');
      const expense  = filtered.filter(t => t.type === 'expense');

      const COGS_CATS = ['Cost of Goods Sold'];
      const cogsExpense = expense.filter(t =>  COGS_CATS.includes(t.category));
      const opexExpense = expense.filter(t => !COGS_CATS.includes(t.category));

      const revenue   = round(sum(income,  'amount_net'));
      const expenses  = round(sum(expense, 'amount_net'));
      const costOfSales = round(sum(cogsExpense, 'amount_net'));
      const opex      = round(sum(opexExpense, 'amount_net'));
      const grossProfit = round(revenue - costOfSales);
      const profit    = round(revenue - expenses);
      const outputVAT = round(sum(income,  'amount_vat'));
      const inputVAT  = round(sum(expense, 'amount_vat'));
      const txCount   = filtered.length;

      // Expense by category
      const expenseDetail = {};
      for (const t of expense) {
        const cat = t.category || 'Other Expenses';
        expenseDetail[cat] = round((expenseDetail[cat] || 0) + (t.amount_net || 0));
      }

      return { revenue, expenses, costOfSales, opex, grossProfit, profit, outputVAT, inputVAT, txCount, expenseDetail };
    }

    const curr = computePeriod(currMonth);
    const prev = computePeriod(prevMonth);
    const ly   = computePeriod(lastYear);

    function variance(curr, prev) {
      const varPHP = round(curr - prev);
      const varPct = prev !== 0 ? round((varPHP / Math.abs(prev)) * 100) : null;
      return { varPHP, varPct };
    }

    const vsPrev = {
      revenue:       variance(curr.revenue,    prev.revenue),
      expenses:      variance(curr.expenses,   prev.expenses),
      costOfSales:   variance(curr.costOfSales,prev.costOfSales),
      opex:          variance(curr.opex,       prev.opex),
      grossProfit:   variance(curr.grossProfit,prev.grossProfit),
      profit:        variance(curr.profit,     prev.profit),
      outputVAT:     variance(curr.outputVAT,  prev.outputVAT),
      inputVAT:      variance(curr.inputVAT,   prev.inputVAT),
    };

    const vsLY = {
      revenue:       variance(curr.revenue,    ly.revenue),
      expenses:      variance(curr.expenses,   ly.expenses),
      costOfSales:   variance(curr.costOfSales,ly.costOfSales),
      opex:          variance(curr.opex,       ly.opex),
      grossProfit:   variance(curr.grossProfit,ly.grossProfit),
      profit:        variance(curr.profit,     ly.profit),
      outputVAT:     variance(curr.outputVAT,  ly.outputVAT),
      inputVAT:      variance(curr.inputVAT,   ly.inputVAT),
    };

    res.json({
      period,
      periods: {
        current:      { ...currMonth, ...curr },
        previous:     { ...prevMonth, ...prev },
        sameLastYear: { ...lastYear,  ...ly   },
      },
      variance: { vsPrev, vsLY },
    });
  } catch (err) { next(err); }
});

export default router;
