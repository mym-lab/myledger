// Journal entry lines that hit Income or Expenses accounts, reshaped as
// read-only transaction rows. Used by:
//   - P&L / dashboard reports (routes/reports.js)
//   - the Transactions screen, via GET /api/transactions/journal-lines
// Asset, liability and equity lines are skipped (they are not P&L items).
// vatType is 'journal' so VAT-based reports never pick these rows up.
import { db, rowToJE } from '../db.js';

const stmtCoaRowsByClient = db.prepare('SELECT code, name, category FROM coa WHERE client_id=?');
const stmtJEsByClient     = db.prepare('SELECT * FROM journal_entries WHERE client_id=? ORDER BY date ASC');

const round2 = (n) => Math.round(n * 100) / 100;

// Per-entry supplier data for SLSP purchases and withholding reports.
// Codes: expense accounts (Expenses category), 1110 Input VAT, 2030 Withholding Tax Payable.
// months is an array of month numbers (1-12) within `year`.
export function journalSupplierEntries(clientId, { year, months } = {}) {
  const coaByCode = {};
  for (const r of stmtCoaRowsByClient.all(clientId)) coaByCode[String(r.code)] = r;

  const out = [];
  for (const je of stmtJEsByClient.all(clientId).map(rowToJE)) {
    const d = je.date || '';
    if (year && Number(d.slice(0, 4)) !== Number(year)) continue;
    if (months && !months.includes(Number(d.slice(5, 7)))) continue;

    let expense = 0, inVat = 0, ewt = 0;
    for (const line of (je.entries || [])) {
      const code = String(line.account);
      const acct = coaByCode[code];
      if (!acct) continue;
      const dr = Number(line.debit)  || 0;
      const cr = Number(line.credit) || 0;
      if (acct.category === 'Expenses') expense += dr - cr;
      if (code === '1110') inVat += dr - cr;
      if (code === '2030') ewt   += cr - dr;
    }
    out.push({
      je, cp: je.counterparty || null, date: d,
      expense: round2(expense), inputVat: round2(inVat), ewt: round2(ewt),
    });
  }
  return out;
}

// Net debit (debit - credit) per COA code, for balance-sheet and VAT use.
// Includes every account, not just income/expense. asOf is YYYY-MM-DD (optional).
export function journalNetByCode(clientId, { asOf } = {}) {
  const coaByCode = {};
  for (const r of stmtCoaRowsByClient.all(clientId)) coaByCode[String(r.code)] = r;

  const byCode = {};
  for (const je of stmtJEsByClient.all(clientId).map(rowToJE)) {
    if (asOf && je.date > asOf) continue;
    for (const line of (je.entries || [])) {
      const code = String(line.account);
      const acct = coaByCode[code];
      if (!acct) continue;
      const net = (Number(line.debit) || 0) - (Number(line.credit) || 0);
      if (!byCode[code]) byCode[code] = { category: acct.category, name: acct.name, net: 0 };
      byCode[code].net += net;
    }
  }
  for (const k of Object.keys(byCode)) byCode[k].net = round2(byCode[k].net);
  return byCode;
}

export function journalLinesAsTransactions(clientId, { from, to } = {}) {
  const coaByCode = {};
  for (const r of stmtCoaRowsByClient.all(clientId)) coaByCode[String(r.code)] = r;

  const out = [];
  for (const je of stmtJEsByClient.all(clientId).map(rowToJE)) {
    if (from && je.date < from) continue;
    if (to   && je.date > to)   continue;

    (je.entries || []).forEach((line, i) => {
      const acct = coaByCode[String(line.account)];
      if (!acct) return;
      const dr = Number(line.debit)  || 0;
      const cr = Number(line.credit) || 0;

      let type = null;
      let amount = 0;
      if (acct.category === 'Income')   { type = 'income';  amount = cr - dr; }
      if (acct.category === 'Expenses') { type = 'expense'; amount = dr - cr; }
      if (!type || Math.abs(amount) < 0.005) return;

      out.push({
        id: `je-${je.id}-${i}`,
        journalEntryId: je.id,
        source: 'journal',
        type,
        description: je.description || '',
        category: acct.name,
        account: String(line.account),
        vatType: 'journal',
        amount_net: round2(amount),
        amount_vat: 0,
        amount_gross: round2(amount),
        percentageTax: 0,
        settlement: null,
        createdAt: je.date,
      });
    });
  }
  return out;
}
