// ─── Import Routes ─────────────────────────────────────────────────────────────
// POST /api/import/csv            — bulk-import bank transactions from CSV
// POST /api/import/balance-sheet  — seed opening balances (assets/liabilities/equity)

import { Router }  from 'express';
import { v4 as uuid } from 'uuid';
import multer       from 'multer';
import { db, rowToClient } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';
import { calculateIncomeVAT, calculateExpenseVAT } from '../lib/vat.js';
import { logAudit } from './audit.js';

const router = Router();
router.use(authenticate);

// multer — memory storage (no disk writes, parse in RAM)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────────────────────────────
const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtLockCheck  = db.prepare('SELECT id FROM locked_periods WHERE client_id=? AND period=?');

const stmtInsertTx = db.prepare(`
  INSERT INTO transactions
    (id, client_id, user_id, type, description, category,
     vat_type, supplier_vat_type, settlement,
     amount_net, amount_vat, amount_gross, percentage_tax,
     ewt_rate, ewt_amount, created_at)
  VALUES
    (@id, @client_id, @user_id, @type, @description, @category,
     @vat_type, @supplier_vat_type, @settlement,
     @amount_net, @amount_vat, @amount_gross, @percentage_tax,
     @ewt_rate, @ewt_amount, @created_at)
`);

const stmtInsertJE = db.prepare(`
  INSERT INTO journal_entries
    (id, client_id, user_id, date, description, entries, created_at)
  VALUES (@id, @client_id, @user_id, @date, @description, @entries, @created_at)
`);

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId ||
         (client.encoderIds || []).includes(userId);
}

function round(n) { return Math.round(n * 100) / 100; }

// ── CSV Parser (no external deps) ─────────────────────────────────────────────
// Handles quoted fields, commas inside quotes, CRLF/LF line endings
function parseCSV(text) {
  const lines  = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const result = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') { inQ = false; }
        else { cur += c; }
      } else {
        if (c === '"') { inQ = true; }
        else if (c === ',') { row.push(cur.trim()); cur = ''; }
        else { cur += c; }
      }
    }
    row.push(cur.trim());
    result.push(row);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/import/csv
// Upload a bank statement CSV and bulk-create transactions.
//
// Workflow (2-step):
//   Step 1 — POST with { clientId, preview: true } + file → returns parsed rows
//             so the UI can show a preview and let the user map columns.
//   Step 2 — POST with { clientId, mapping, rows } (no file) → insert confirmed rows.
//
// Column mapping (sent by client in step 2):
//   { dateCol, descCol, amountCol, typeCol, debitCol, creditCol }
//   Either amountCol (signed) OR debitCol + creditCol (two-column format)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/csv', upload.single('file'), (req, res, next) => {
  try {
    const clientId = req.body.clientId;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const isOPT    = client.taxRegime === 'opt';
    const optRate  = Number(client.optRate) || 0.03;

    // ── STEP 1: Preview ────────────────────────────────────────────────────────
    if (req.body.preview === 'true' || req.body.preview === true) {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const text    = req.file.buffer.toString('utf-8').replace(/^﻿/, ''); // strip BOM
      const rows    = parseCSV(text);
      const headers = rows[0] || [];
      const sample  = rows.slice(1, 6); // first 5 data rows as preview
      return res.json({ headers, sample, totalRows: rows.length - 1 });
    }

    // ── STEP 2: Import confirmed rows ─────────────────────────────────────────
    const { mapping, rows: confirmedRows, defaultCategory = 'Other', defaultSettlement = 'bank_transfer' } = req.body;

    if (!mapping || !confirmedRows || !Array.isArray(confirmedRows))
      return res.status(400).json({ error: 'mapping and rows are required for import' });

    const { dateCol, descCol, amountCol, debitCol, creditCol } = mapping;

    const errors   = [];
    const inserted = [];
    const today    = new Date().toISOString();
    const philippinesOffset = 8 * 60; // UTC+8

    const importTx = db.transaction(() => {
      for (let i = 0; i < confirmedRows.length; i++) {
        const row = confirmedRows[i];

        // ── Resolve date ────────────────────────────────────────────────────
        let rawDate = dateCol != null ? row[dateCol] : null;
        let txDate;
        if (rawDate) {
          // Try multiple date formats: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, MM-DD-YYYY
          const clean = rawDate.replace(/['"]/g, '').trim();
          const fmts  = [
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
            /^(\d{4})-(\d{2})-(\d{2})$/,        // YYYY-MM-DD
            /^(\d{1,2})-(\d{1,2})-(\d{4})$/,    // MM-DD-YYYY
          ];
          for (const fmt of fmts) {
            const m = clean.match(fmt);
            if (m) {
              if (fmt === fmts[1]) {
                txDate = clean; // already ISO
              } else {
                // Assume MM/DD/YYYY or MM-DD-YYYY
                const [, p1, p2, p3] = m;
                txDate = `${p3}-${p1.padStart(2,'0')}-${p2.padStart(2,'0')}`;
              }
              break;
            }
          }
        }
        if (!txDate) txDate = new Date().toISOString().substring(0, 10);
        const createdAt = `${txDate}T00:00:00.000Z`;

        // ── Resolve amount + type ────────────────────────────────────────────
        let amount, type;
        if (amountCol != null) {
          // Single signed column: positive = income, negative = expense
          const raw = String(row[amountCol] || '').replace(/[₱,\s"']/g, '');
          amount = parseFloat(raw);
          if (isNaN(amount) || amount === 0) { errors.push(`Row ${i + 2}: invalid amount "${row[amountCol]}"`); continue; }
          type = amount > 0 ? 'income' : 'expense';
          amount = Math.abs(amount);
        } else if (debitCol != null && creditCol != null) {
          // Two-column: credit = income, debit = expense
          const cr = parseFloat(String(row[creditCol] || '').replace(/[₱,\s"']/g, '')) || 0;
          const dr = parseFloat(String(row[debitCol]  || '').replace(/[₱,\s"']/g, '')) || 0;
          if (cr > 0)      { type = 'income';  amount = cr; }
          else if (dr > 0) { type = 'expense'; amount = dr; }
          else { errors.push(`Row ${i + 2}: both debit and credit are zero`); continue; }
        } else {
          errors.push(`Row ${i + 2}: no amount column mapped`); continue;
        }

        // ── Check period lock ────────────────────────────────────────────────
        const period = txDate.substring(0, 7);
        if (stmtLockCheck.get(clientId, period)) {
          errors.push(`Row ${i + 2} (${txDate}): period ${period} is locked — skipped`);
          continue;
        }

        // ── Description ──────────────────────────────────────────────────────
        const description = descCol != null
          ? String(row[descCol] || '').replace(/['"]/g, '').trim() || 'Bank import'
          : 'Bank import';

        // ── VAT calc ─────────────────────────────────────────────────────────
        let vatResult;
        if (type === 'income') {
          vatResult = calculateIncomeVAT(amount, 'vatable', isOPT, optRate);
        } else {
          vatResult = calculateExpenseVAT(amount, 'vat');
        }

        const id = uuid();
        stmtInsertTx.run({
          id,
          client_id:          clientId,
          user_id:            req.userId,
          type,
          description,
          category:           defaultCategory,
          vat_type:           type === 'income' ? 'vatable' : null,
          supplier_vat_type:  type === 'expense' ? 'vat' : null,
          settlement:         defaultSettlement,
          amount_net:         vatResult.net,
          amount_vat:         vatResult.vat,
          amount_gross:       vatResult.gross,
          percentage_tax:     vatResult.percentageTax || 0,
          ewt_rate:           0,
          ewt_amount:         0,
          created_at:         createdAt,
        });
        inserted.push(id);
      }
    });

    importTx();

    logAudit(db, {
      clientId,
      userId:      req.userId,
      action:      'CSV_IMPORT',
      description: `Imported ${inserted.length} transactions from CSV (${errors.length} skipped)`,
    });

    res.json({
      imported: inserted.length,
      skipped:  errors.length,
      errors:   errors.slice(0, 20), // cap error list
    });

  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/import/balance-sheet
// Seed opening balances for a new client via a JSON array of account entries.
// Creates a single Journal Entry dated on the opening date.
//
// Body:
//   { clientId, openingDate, entries: [{ account, debit, credit, description }] }
//
// The entries array must balance (total debits = total credits).
// Blocked for encoders. Period-lock aware.
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/balance-sheet', noEncoder, (req, res, next) => {
  try {
    const { clientId, openingDate, entries } = req.body;

    if (!clientId)    return res.status(400).json({ error: 'clientId is required' });
    if (!openingDate) return res.status(400).json({ error: 'openingDate is required (YYYY-MM-DD)' });
    if (!Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: 'entries array is required and must not be empty' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    // Period lock check
    const period = openingDate.substring(0, 7);
    if (stmtLockCheck.get(clientId, period))
      return res.status(423).json({ error: `Period ${period} is locked. Unlock it before importing opening balances.` });

    // Validate entries
    const errs = [];
    let totalDebit = 0, totalCredit = 0;

    const cleanEntries = entries.map((e, i) => {
      const dr = round(Number(e.debit)  || 0);
      const cr = round(Number(e.credit) || 0);
      if (!e.account) errs.push(`Entry ${i + 1}: account name is required`);
      if (dr < 0 || cr < 0) errs.push(`Entry ${i + 1}: debit/credit cannot be negative`);
      if (dr > 0 && cr > 0) errs.push(`Entry ${i + 1}: entry cannot have both debit and credit`);
      totalDebit  = round(totalDebit  + dr);
      totalCredit = round(totalCredit + cr);
      return { account: e.account, debit: dr, credit: cr, description: e.description || '' };
    });

    if (errs.length) return res.status(400).json({ error: errs.join('; ') });

    if (round(totalDebit) !== round(totalCredit))
      return res.status(400).json({
        error: `Journal entry does not balance. Total debits ₱${totalDebit} ≠ total credits ₱${totalCredit}.`,
        totalDebit,
        totalCredit,
        difference: round(Math.abs(totalDebit - totalCredit)),
      });

    const id  = uuid();
    const now = new Date().toISOString();

    stmtInsertJE.run({
      id,
      client_id:   clientId,
      user_id:     req.userId,
      date:        openingDate,
      description: `Opening Balances as of ${openingDate}`,
      entries:     JSON.stringify(cleanEntries),
      created_at:  now,
    });

    logAudit(db, {
      clientId,
      userId:      req.userId,
      action:      'BALANCE_SHEET_IMPORT',
      description: `Imported opening balances as of ${openingDate} — ${cleanEntries.length} accounts, ₱${totalDebit} total`,
    });

    res.json({
      journalEntryId: id,
      accounts:       cleanEntries.length,
      totalDebit,
      totalCredit,
      openingDate,
    });

  } catch (err) { next(err); }
});

export default router;
