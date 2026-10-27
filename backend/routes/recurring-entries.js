// ─── Recurring Journal Entries ────────────────────────────────────────────────
// Scheduled journal entries: rent accrual, depreciation, and any other
// repeating entry. Mirrors the recurring-invoices.js scheduling model.
//
// POST   /api/recurring-entries                     create schedule
// GET    /api/recurring-entries?clientId=           list schedules for a client
// GET    /api/recurring-entries/:id                 one schedule
// PUT    /api/recurring-entries/:id                 update schedule
// DELETE /api/recurring-entries/:id                 delete schedule
// POST   /api/recurring-entries/:id/run             post now (manual)
// POST   /api/recurring-entries/from-entry/:jeId    make a saved journal entry recurring
// POST   /api/recurring-entries/from-asset/:assetId create depreciation schedule
//                                                   from an existing asset
//
// Depreciation schedules keep source_kind='asset'. Their amount is recomputed
// from the asset each run — (cost - salvage) / useful_life_months — and capped
// so accumulated depreciation never exceeds the depreciable base. So editing
// the asset's cost or life automatically corrects future postings.

import { hasRowAccess, actingOwnerId } from '../lib/access.js';
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, withTransaction } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';
import { logAudit } from './audit.js';

const router = Router();

const round = n => Math.round(n * 100) / 100;

// ── Schema ────────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS recurring_entries (
    id              TEXT PRIMARY KEY,
    client_id       TEXT NOT NULL,
    created_by      TEXT NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    reference_no    TEXT NOT NULL DEFAULT '',
    -- 'accrual' | 'depreciation' | 'other' — labelling only
    entry_type      TEXT NOT NULL DEFAULT 'other',
    -- JE lines: [{ account, debit, credit }] — must balance
    entries         TEXT NOT NULL DEFAULT '[]',
    -- Link to a source record so the amount can be derived (assets)
    source_kind     TEXT,
    source_id       TEXT,
    -- Schedule
    frequency       TEXT NOT NULL DEFAULT 'monthly',
    next_run_date   TEXT NOT NULL,
    last_run_date   TEXT,
    end_date        TEXT,
    max_entries     INTEGER,
    -- State
    status          TEXT NOT NULL DEFAULT 'active',
    total_generated INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  )
`);
try { db.exec('CREATE INDEX IF NOT EXISTS idx_recje_client ON recurring_entries(client_id)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_recje_due ON recurring_entries(status, next_run_date)'); } catch (_) {}
// Supplier / lessor + VAT/EWT details, copied onto every posted run so SLSP and 1601-EQ pick them up
try { db.exec("ALTER TABLE recurring_entries ADD COLUMN counterparty TEXT NOT NULL DEFAULT 'null'"); } catch (_) {}

// ── Helpers ───────────────────────────────────────────────────────────────────
function canAccess(clientId, req) {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(clientId);
  if (!c) return false;
  if (req.userRole === 'admin') return true;
  return hasRowAccess(c, req);
}

function rowToSchedule(r) {
  if (!r) return null;
  return {
    ...r,
    entries:       r.entries ? JSON.parse(r.entries) : [],
    max_entries:   r.max_entries   || null,
    end_date:      r.end_date      || null,
    last_run_date: r.last_run_date || null,
    source_kind:   r.source_kind   || null,
    source_id:     r.source_id     || null,
    counterparty:  r.counterparty ? (JSON.parse(r.counterparty) || null) : null,
  };
}

/** Advance a date by one frequency period. Clamps month-end overflow:
 *  Jan 31 + 1 month → Feb 28/29, not Mar 3. */
export function advanceEntryDate(dateStr, frequency) {
  // Pure UTC arithmetic. Local-midnight Dates shift back a day in timezones
  // ahead of UTC (e.g. Philippines), so toISOString() would return the day before.
  const [y, m, day] = dateStr.split('-').map(Number);
  if (frequency === 'weekly') {
    return new Date(Date.UTC(y, m - 1, day + 7)).toISOString().slice(0, 10);
  }
  const months = frequency === 'quarterly' ? 3 : frequency === 'annual' ? 12 : 1;
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const daysInTarget = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, daysInTarget));
  return first.toISOString().slice(0, 10);
}

/** Validate and normalise JE lines. Returns { lines, error }. */
function normaliseLines(raw) {
  if (!Array.isArray(raw) || raw.length === 0)
    return { error: 'At least one entry line is required' };

  const lines = raw.map(e => ({
    account: String(e.account || '').trim(),
    debit:   round(Number(e.debit)  || 0),
    credit:  round(Number(e.credit) || 0),
  }));

  if (lines.some(l => !l.account))
    return { error: 'Every entry line needs an account code' };
  if (lines.some(l => l.debit < 0 || l.credit < 0))
    return { error: 'Debit and credit amounts cannot be negative' };
  if (lines.some(l => l.debit > 0 && l.credit > 0))
    return { error: 'A line cannot have both a debit and a credit' };

  const totalDebit  = round(lines.reduce((s, l) => s + l.debit,  0));
  const totalCredit = round(lines.reduce((s, l) => s + l.credit, 0));
  if (totalDebit === 0 && totalCredit === 0)
    return { error: 'Entry total cannot be zero' };
  if (Math.abs(totalDebit - totalCredit) > 0.01)
    return {
      error: `Journal entry is unbalanced. Debits (${totalDebit.toFixed(2)}) ≠ Credits (${totalCredit.toFixed(2)})`,
    };

  return { lines };
}

/** Accumulated depreciation already posted for an asset, from its schedule. */
function postedForAsset(assetId) {
  const sched = db.prepare(
    "SELECT * FROM recurring_entries WHERE source_kind='asset' AND source_id=?"
  ).get(assetId);
  if (!sched) return 0;
  const lines = JSON.parse(sched.entries || '[]');
  const perRun = round(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  return round(perRun * (sched.total_generated || 0));
}

/** Lines for one depreciation run, or null when fully depreciated. */
function depreciationLinesForAsset(assetId, overrideLines) {
  const a = db.prepare('SELECT * FROM assets WHERE id=?').get(assetId);
  if (!a) return null;

  const base = round(a.cost - a.salvage_value);
  if (base <= 0 || !a.useful_life_months) return null;

  const alreadyPosted = postedForAsset(assetId);
  const remaining     = round(base - alreadyPosted);
  if (remaining <= 0) return null;

  // Last period takes the rounding remainder so the total lands exactly on base
  const monthly = round(base / a.useful_life_months);
  const amount  = Math.min(monthly, remaining);
  if (amount <= 0) return null;

  // Keep whatever account codes the schedule was created with
  const debitAccount  = overrideLines?.find(l => Number(l.debit)  > 0)?.account || '5200';
  const creditAccount = overrideLines?.find(l => Number(l.credit) > 0)?.account || '1510';

  return [
    { account: debitAccount,  debit: amount, credit: 0 },
    { account: creditAccount, debit: 0,      credit: amount },
  ];
}

const stmtInsertJE = db.prepare(`
  INSERT INTO journal_entries (id, client_id, user_id, date, description, reference_no, entries, counterparty, created_at)
  VALUES (@id, @client_id, @user_id, @date, @description, @reference_no, @entries, @counterparty, @created_at)
`);

/**
 * Post one schedule as a journal entry and advance it.
 * Returns { journalEntryId, lines, amount } or { skipped: '<reason>' }.
 * Caller owns error handling; the write is wrapped in a transaction.
 */
function postSchedule(sched, postingDate, actingUserId) {
  let lines = JSON.parse(sched.entries || '[]');

  // Depreciation amounts are derived from the asset, never from stale state
  if (sched.source_kind === 'asset') {
    const derived = depreciationLinesForAsset(sched.source_id, lines);
    if (!derived) return { skipped: 'fully_depreciated_or_asset_missing' };
    lines = derived;
  }

  const { lines: clean, error } = normaliseLines(lines);
  if (error) return { skipped: error };

  const amount = round(clean.reduce((s, l) => s + l.debit, 0));
  const jeId   = uuid();
  const nowIso = new Date().toISOString();
  const nextRun = advanceEntryDate(postingDate, sched.frequency);

  withTransaction(() => {
    stmtInsertJE.run({
      id:           jeId,
      client_id:    sched.client_id,
      user_id:      actingUserId || sched.created_by,
      date:         postingDate,
      description:  sched.description || sched.name,
      reference_no: sched.reference_no || '',
      entries:      JSON.stringify(clean),
      counterparty: sched.counterparty || 'null',
      created_at:   nowIso,
    });

    db.prepare(`
      UPDATE recurring_entries
      SET last_run_date   = ?,
          next_run_date   = ?,
          total_generated = total_generated + 1,
          updated_at      = ?
      WHERE id = ?
    `).run(postingDate, nextRun, nowIso, sched.id);
  });

  return { journalEntryId: jeId, lines: clean, amount, nextRunDate: nextRun };
}

// ══════════════════════════════════════════════════════════════════════════════
// Scheduler entry point — called hourly from app.js
// ══════════════════════════════════════════════════════════════════════════════
export function generateDueRecurringEntries() {
  const today  = new Date().toISOString().slice(0, 10);
  const nowIso = new Date().toISOString();

  const due = db.prepare(`
    SELECT * FROM recurring_entries
    WHERE status = 'active' AND next_run_date <= ?
  `).all(today);

  const cancel = (id) =>
    db.prepare("UPDATE recurring_entries SET status='cancelled', updated_at=? WHERE id=?")
      .run(nowIso, id);

  let generated = 0;
  const skipped = [];

  for (const sched of due) {
    try {
      if (sched.end_date && sched.end_date < today)                       { cancel(sched.id); continue; }
      if (sched.max_entries && sched.total_generated >= sched.max_entries) { cancel(sched.id); continue; }

      const result = postSchedule(sched, today, null);

      if (result.skipped) {
        // A finished asset should stop costing us a run every hour
        if (result.skipped === 'fully_depreciated_or_asset_missing') cancel(sched.id);
        else skipped.push({ id: sched.id, name: sched.name, reason: result.skipped });
        continue;
      }

      logAudit({
        clientId: sched.client_id,
        userId:   sched.created_by,
        staffId:  null,
        action:   'CREATE_JOURNAL_ENTRY',
        entity:   'journal_entry',
        entityId: result.journalEntryId,
        detail:   `Recurring: ${sched.name}`,
      });
      generated++;
    } catch (e) {
      console.error(`Recurring entry ${sched.id} (${sched.name}) failed:`, e.message);
      skipped.push({ id: sched.id, name: sched.name, reason: e.message });
    }
  }

  if (generated || skipped.length)
    console.log(`📘  Recurring entries: ${generated} posted, ${skipped.length} skipped`);

  return { generated, skipped, examined: due.length };
}

// ── Everything below requires auth ────────────────────────────────────────────
router.use(authenticate);
router.use(noEncoder);

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/recurring-entries — create schedule
// ══════════════════════════════════════════════════════════════════════════════
router.post('/', (req, res, next) => {
  try {
    const {
      clientId,
      name,
      description  = '',
      referenceNo  = '',
      entryType    = 'other',
      entries      = [],
      frequency    = 'monthly',
      startDate,
      endDate      = null,
      maxEntries   = null,
      counterparty = null,
    } = req.body;

    if (!clientId) return res.status(400).json({ error: 'clientId is required' });
    if (!name)     return res.status(400).json({ error: 'name is required' });
    if (!startDate) return res.status(400).json({ error: 'startDate is required' });
    if (!['weekly', 'monthly', 'quarterly', 'annual'].includes(frequency))
      return res.status(400).json({ error: 'frequency must be weekly, monthly, quarterly or annual' });
    if (!canAccess(clientId, req))
      return res.status(404).json({ error: 'Client not found' });

    const { lines, error } = normaliseLines(entries);
    if (error) return res.status(400).json({ error });

    const id     = uuid();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO recurring_entries
        (id, client_id, created_by, name, description, reference_no, entry_type,
         entries, source_kind, source_id, frequency, next_run_date, last_run_date,
         end_date, max_entries, status, total_generated, created_at, updated_at, counterparty)
      VALUES
        (@id, @client_id, @created_by, @name, @description, @reference_no, @entry_type,
         @entries, NULL, NULL, @frequency, @next_run_date, NULL,
         @end_date, @max_entries, 'active', 0, @created_at, @updated_at, @counterparty)
    `).run({
      id,
      client_id:     clientId,
      created_by:    actingOwnerId(req),
      name,
      description:   description || name,
      reference_no:  referenceNo,
      entry_type:    entryType,
      entries:       JSON.stringify(lines),
      frequency,
      next_run_date: startDate,
      end_date:      endDate || null,
      max_entries:   maxEntries != null ? Math.round(Number(maxEntries)) : null,
      created_at:    nowIso,
      updated_at:    nowIso,
      counterparty:  counterparty && (counterparty.name || counterparty.tin)
                       ? JSON.stringify(counterparty) : 'null',
    });

    const row = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(id);
    res.status(201).json({ schedule: rowToSchedule(row) });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/recurring-entries/from-asset/:assetId
// Create a monthly depreciation schedule from an existing asset.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/from-asset/:assetId', (req, res, next) => {
  try {
    const asset = db.prepare('SELECT * FROM assets WHERE id=?').get(req.params.assetId);
    if (!asset) return res.status(404).json({ error: 'Asset not found' });
    if (!canAccess(asset.client_id, req))
      return res.status(403).json({ error: 'Not authorised' });

    const existing = db.prepare(
      "SELECT id FROM recurring_entries WHERE source_kind='asset' AND source_id=?"
    ).get(req.params.assetId);
    if (existing)
      return res.status(409).json({
        error: 'This asset already has a depreciation schedule',
        scheduleId: existing.id,
      });

    const {
      debitAccount  = '5200',   // Depreciation
      creditAccount = '1510',   // Accumulated Depreciation
      startDate,
      frequency     = 'monthly',
    } = req.body || {};

    const base = round(asset.cost - asset.salvage_value);
    if (base <= 0)
      return res.status(400).json({ error: 'Asset has no depreciable base (cost ≤ salvage value)' });
    if (!asset.useful_life_months)
      return res.status(400).json({ error: 'Asset has no useful life set' });

    const monthly = round(base / asset.useful_life_months);
    const lines = [
      { account: debitAccount,  debit: monthly, credit: 0 },
      { account: creditAccount, debit: 0,       credit: monthly },
    ];

    const id     = uuid();
    const nowIso = new Date().toISOString();
    const first  = startDate || asset.start_date || nowIso.slice(0, 10);

    db.prepare(`
      INSERT INTO recurring_entries
        (id, client_id, created_by, name, description, reference_no, entry_type,
         entries, source_kind, source_id, frequency, next_run_date, last_run_date,
         end_date, max_entries, status, total_generated, created_at, updated_at)
      VALUES
        (@id, @client_id, @created_by, @name, @description, '', 'depreciation',
         @entries, 'asset', @source_id, @frequency, @next_run_date, NULL,
         NULL, @max_entries, 'active', 0, @created_at, @updated_at)
    `).run({
      id,
      client_id:     asset.client_id,
      created_by:    actingOwnerId(req),
      name:          `Depreciation — ${asset.name}`,
      description:   `Monthly depreciation — ${asset.name}`,
      entries:       JSON.stringify(lines),
      source_id:     asset.id,
      frequency,
      next_run_date: first,
      max_entries:   asset.useful_life_months,
      created_at:    nowIso,
      updated_at:    nowIso,
    });

    const row = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(id);
    res.status(201).json({
      schedule: rowToSchedule(row),
      monthlyDepreciation: monthly,
      depreciableBase: base,
      periods: asset.useful_life_months,
    });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/recurring-entries?clientId=
// ══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
// POST /api/recurring-entries/from-entry/:jeId
// Turn a saved journal entry into a schedule. The saved entry is the first
// posting; the schedule starts one period after it. Lines and the supplier /
// lessor (with VAT and EWT details) are copied, so every run feeds SLSP and 1601-EQ.
// ═══════════════════════════════════════════════════════════
router.post('/from-entry/:jeId', (req, res, next) => {
  try {
    const je = db.prepare('SELECT * FROM journal_entries WHERE id=?').get(req.params.jeId);
    if (!je || !canAccess(je.client_id, req))
      return res.status(404).json({ error: 'Journal entry not found' });

    const { frequency = 'monthly', endDate = null } = req.body || {};
    if (!['weekly', 'monthly', 'quarterly', 'annual'].includes(frequency))
      return res.status(400).json({ error: 'frequency must be weekly, monthly, quarterly or annual' });

    const { lines, error } = normaliseLines(JSON.parse(je.entries || '[]'));
    if (error) return res.status(400).json({ error });

    const nextRun = advanceEntryDate(je.date, frequency);
    if (endDate && endDate < nextRun)
      return res.status(400).json({ error: 'End date must be on or after the next posting date (' + nextRun + ')' });

    const id     = uuid();
    const nowIso = new Date().toISOString();

    db.prepare(`
      INSERT INTO recurring_entries
        (id, client_id, created_by, name, description, reference_no, entry_type,
         entries, source_kind, source_id, frequency, next_run_date, last_run_date,
         end_date, max_entries, status, total_generated, created_at, updated_at, counterparty)
      VALUES
        (@id, @client_id, @created_by, @name, @description, @reference_no, 'other',
         @entries, NULL, NULL, @frequency, @next_run_date, NULL,
         @end_date, NULL, 'active', 0, @created_at, @updated_at, @counterparty)
    `).run({
      id,
      client_id:     je.client_id,
      created_by:    actingOwnerId(req),
      name:          je.description || 'Recurring entry',
      description:   je.description || '',
      reference_no:  je.reference_no || '',
      entries:       JSON.stringify(lines),
      frequency,
      next_run_date: nextRun,
      end_date:      endDate || null,
      created_at:    nowIso,
      updated_at:    nowIso,
      counterparty:  je.counterparty || 'null',
    });

    const row = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(id);
    res.status(201).json({ schedule: rowToSchedule(row) });
  } catch (err) { next(err); }
});

router.get('/', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });
    if (!canAccess(clientId, req))
      return res.status(404).json({ error: 'Client not found' });

    const rows = db.prepare(
      'SELECT * FROM recurring_entries WHERE client_id=? ORDER BY created_at DESC'
    ).all(clientId);

    res.json({ schedules: rows.map(rowToSchedule), count: rows.length });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/recurring-entries/:id
// ══════════════════════════════════════════════════════════════════════════════
router.get('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!canAccess(row.client_id, req))
      return res.status(403).json({ error: 'Forbidden' });
    res.json({ schedule: rowToSchedule(row) });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// PUT /api/recurring-entries/:id
// ══════════════════════════════════════════════════════════════════════════════
router.put('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!canAccess(row.client_id, req))
      return res.status(403).json({ error: 'Forbidden' });

    const {
      name, description, referenceNo, entryType, entries,
      frequency, nextRunDate, endDate, maxEntries, status,
    } = req.body;

    if (frequency && !['weekly', 'monthly', 'quarterly', 'annual'].includes(frequency))
      return res.status(400).json({ error: 'frequency must be weekly, monthly, quarterly or annual' });
    if (status && !['active', 'paused', 'cancelled'].includes(status))
      return res.status(400).json({ error: 'status must be active, paused or cancelled' });

    let entriesJson = row.entries;
    if (entries !== undefined) {
      if (row.source_kind === 'asset')
        return res.status(400).json({
          error: 'Depreciation lines are derived from the asset. Edit the asset instead.',
        });
      const { lines, error } = normaliseLines(entries);
      if (error) return res.status(400).json({ error });
      entriesJson = JSON.stringify(lines);
    }

    db.prepare(`
      UPDATE recurring_entries SET
        name          = @name,
        description   = @description,
        reference_no  = @reference_no,
        entry_type    = @entry_type,
        entries       = @entries,
        frequency     = @frequency,
        next_run_date = @next_run_date,
        end_date      = @end_date,
        max_entries   = @max_entries,
        status        = @status,
        updated_at    = @updated_at
      WHERE id = @id
    `).run({
      id:            req.params.id,
      name:          name         ?? row.name,
      description:   description  ?? row.description,
      reference_no:  referenceNo  ?? row.reference_no,
      entry_type:    entryType    ?? row.entry_type,
      entries:       entriesJson,
      frequency:     frequency    ?? row.frequency,
      next_run_date: nextRunDate  ?? row.next_run_date,
      end_date:      endDate !== undefined ? (endDate || null) : row.end_date,
      max_entries:   maxEntries !== undefined
                       ? (maxEntries != null ? Math.round(Number(maxEntries)) : null)
                       : row.max_entries,
      status:        status       ?? row.status,
      updated_at:    new Date().toISOString(),
    });

    const updated = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(req.params.id);
    res.json({ schedule: rowToSchedule(updated) });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// DELETE /api/recurring-entries/:id — removes the schedule only.
// Journal entries it already posted are kept (audit trail).
// ══════════════════════════════════════════════════════════════════════════════
router.delete('/:id', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!canAccess(row.client_id, req))
      return res.status(403).json({ error: 'Forbidden' });

    db.prepare('DELETE FROM recurring_entries WHERE id=?').run(req.params.id);
    res.json({
      message: 'Schedule deleted',
      note: `${row.total_generated} journal entries already posted were kept`,
    });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/recurring-entries/:id/run — post now
// ══════════════════════════════════════════════════════════════════════════════
router.post('/:id/run', (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM recurring_entries WHERE id=?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!canAccess(row.client_id, req))
      return res.status(403).json({ error: 'Forbidden' });

    const postingDate = req.body?.postingDate || new Date().toISOString().slice(0, 10);

    // Don't let a manual run post into a locked period
    const period = postingDate.slice(0, 7);
    const locked = db.prepare(
      'SELECT 1 FROM locked_periods WHERE client_id=? AND period=?'
    ).get(row.client_id, period);
    if (locked)
      return res.status(409).json({ error: `Period ${period} is locked` });

    const result = postSchedule(row, postingDate, actingOwnerId(req));
    if (result.skipped)
      return res.status(409).json({ error: result.skipped });

    logAudit({
      clientId: row.client_id,
      userId:   req.userRole === 'staff' ? req.ownerId : req.userId,
      staffId:  req.userRole === 'staff' ? req.userId  : null,
      action:   'CREATE_JOURNAL_ENTRY',
      entity:   'journal_entry',
      entityId: result.journalEntryId,
      detail:   `Recurring (manual): ${row.name}`,
    });

    res.status(201).json({
      journalEntryId: result.journalEntryId,
      date:           postingDate,
      amount:         result.amount,
      entries:        result.lines,
      nextRunDate:    result.nextRunDate,
    });
  } catch (err) { next(err); }
});

export default router;
