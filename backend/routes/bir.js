// ─── BIR Routes ───────────────────────────────────────────────
// GET  /api/bir/deadlines?clientId=         upcoming filing deadlines
// GET  /api/bir/vat-balance?clientId=       current VAT position
// GET  /api/bir/filing-summary?clientId=&period=YYYY-MM  per-form amounts + status
// PUT  /api/bir/filing-status               mark/unmark a filing as filed
// GET  /api/bir/portfolio?period=YYYY-MM    all clients summary for accountant

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToTx } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';
import { getUpcomingDeadlines } from '../lib/bir-deadlines.js';
import { requireTier } from '../middleware/tierGuard.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);
// BIR returns require at least Solo tier (or active trial)
router.use(requireTier('solo'));

const round = (n) => Math.round((n || 0) * 100) / 100;
const sum   = (arr, key) => arr.reduce((s, t) => s + (t[key] || 0), 0);

// ── Bootstrap bir_filings table ───────────────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS bir_filings (
    id           TEXT PRIMARY KEY,
    client_id    TEXT NOT NULL,
    form         TEXT NOT NULL,
    period       TEXT NOT NULL,
    status       TEXT DEFAULT 'pending',
    filed_at     TEXT,
    filed_by     TEXT,
    notes        TEXT,
    UNIQUE(client_id, form, period)
  )`);
} catch { /* already exists */ }

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById   = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtTxByClient   = db.prepare('SELECT * FROM transactions WHERE client_id=? AND voided_at IS NULL');
const stmtEmployees    = db.prepare('SELECT * FROM employees WHERE client_id=?');
const stmtFiling       = db.prepare('SELECT * FROM bir_filings WHERE client_id=? AND form=? AND period=?');
const stmtUpsertFiling = db.prepare(`
  INSERT INTO bir_filings (id, client_id, form, period, status, filed_at, filed_by, notes)
  VALUES (@id, @clientId, @form, @period, @status, @filedAt, @filedBy, @notes)
  ON CONFLICT(client_id, form, period) DO UPDATE SET
    status=@status, filed_at=@filedAt, filed_by=@filedBy, notes=@notes
`);

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

// ── Period helpers ────────────────────────────────────────────────────────────
function parseYYYYMM(period) {
  // period = 'YYYY-MM'
  const [y, m] = period.split('-').map(Number);
  return { year: y, month: m };
}

function quarterBounds(year, month) {
  const q = Math.ceil(month / 3);
  const qStartMonth = (q - 1) * 3 + 1;            // 1, 4, 7, 10
  const qEndMonth   = q * 3;                        // 3, 6, 9, 12
  const qStart = `${year}-${String(qStartMonth).padStart(2,'0')}-01`;
  // Last day of qEndMonth
  const lastDay = new Date(year, qEndMonth, 0).getDate();
  const qEnd   = `${year}-${String(qEndMonth).padStart(2,'0')}-${lastDay}`;
  return { q, qStart, qEnd, qLabel: `${year}-Q${q}` };
}

function monthBounds(year, month) {
  const mStr   = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    mStart: `${year}-${mStr}-01`,
    mEnd:   `${year}-${mStr}-${lastDay}`,
    mLabel: `${year}-${mStr}`,
  };
}

function filterPeriod(txns, from, to) {
  return txns.filter(t => t.createdAt >= from && t.createdAt <= to + 'T23:59:59');
}

// ── WHT computation (mirrors payroll.js) ──────────────────────────────────────
function computeAnnualWHT(annualTaxable) {
  const t = annualTaxable;
  if (t <= 250000)   return 0;
  if (t <= 400000)   return (t - 250000) * 0.20;
  if (t <= 800000)   return 30000  + (t - 400000) * 0.25;
  if (t <= 2000000)  return 130000 + (t - 800000) * 0.30;
  if (t <= 8000000)  return 490000 + (t - 2000000) * 0.32;
  return 2410000 + (t - 8000000) * 0.35;
}
function empMonthlyWHT(emp) {
  const basic = parseFloat(emp.monthly_basic_salary) || 0;
  const deductions = (parseFloat(emp.sss_contribution) || 0)
                   + (parseFloat(emp.philhealth_contribution) || 0)
                   + (parseFloat(emp.pagibig_contribution) || 0);
  const annualTaxable = Math.max(0, basic - deductions) * 12;
  return Math.round(computeAnnualWHT(annualTaxable) / 12 * 100) / 100;
}

// ── GET /api/bir/deadlines?clientId= ─────────────────────────────────────────
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

// ── GET /api/bir/vat-balance?clientId= ───────────────────────────────────────
router.get('/vat-balance', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId query param required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const txns      = stmtTxByClient.all(clientId).map(rowToTx);
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

// ── GET /api/bir/filing-summary?clientId=&period=YYYY-MM ─────────────────────
// Returns per-form computed amounts + filed status for the given period.
router.get('/filing-summary', (req, res, next) => {
  try {
    const { clientId } = req.query;
    let   { period }   = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    // Default period = current month
    if (!period) {
      const now = new Date();
      period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const { year, month } = parseYYYYMM(period);
    const { mStart, mEnd, mLabel } = monthBounds(year, month);
    const { q, qStart, qEnd, qLabel } = quarterBounds(year, month);

    const allTxns  = stmtTxByClient.all(clientId).map(rowToTx);
    const mTxns    = filterPeriod(allTxns, mStart, mEnd);   // month slice
    const qTxns    = filterPeriod(allTxns, qStart, qEnd);   // quarter slice
    const employees = stmtEmployees.all(clientId);

    const taxTypes = client.taxTypes || [];
    const forms    = [];

    // Helper: get filed status from DB
    const filingStatus = (form, per) => {
      const row = stmtFiling.get(clientId, form, per);
      return row ? row.status : 'pending';
    };

    // ── 2550M — Monthly VAT ───────────────────────────────────────────────────
    if (taxTypes.includes('2550M')) {
      const outputVAT = round(sum(mTxns.filter(t => t.type === 'income'),  'amount_vat'));
      const inputVAT  = round(sum(mTxns.filter(t => t.type === 'expense'), 'amount_vat'));
      const amountDue = round(outputVAT - inputVAT);
      const hasData   = mTxns.length > 0;
      const filed     = filingStatus('2550M', mLabel);
      forms.push({
        form: '2550M', name: 'Monthly VAT Return', period: mLabel,
        periodLabel: new Date(year, month - 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' }),
        amountDue, outputVAT, inputVAT,
        breakdown: `Output VAT ₱${outputVAT.toLocaleString()} − Input VAT ₱${inputVAT.toLocaleString()}`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        dueDay: '20th of following month',
      });
    }

    // ── 2550Q — Quarterly VAT ─────────────────────────────────────────────────
    if (taxTypes.includes('2550Q')) {
      const outputVAT = round(sum(qTxns.filter(t => t.type === 'income'),  'amount_vat'));
      const inputVAT  = round(sum(qTxns.filter(t => t.type === 'expense'), 'amount_vat'));
      const amountDue = round(outputVAT - inputVAT);
      const hasData   = qTxns.length > 0;
      const filed     = filingStatus('2550Q', qLabel);
      forms.push({
        form: '2550Q', name: 'Quarterly VAT Return', period: qLabel,
        periodLabel: `Q${q} ${year} (${new Date(year, (q-1)*3).toLocaleString('en-PH',{month:'short'})}–${new Date(year, q*3-1).toLocaleString('en-PH',{month:'short'})})`,
        amountDue, outputVAT, inputVAT,
        breakdown: `Output VAT ₱${outputVAT.toLocaleString()} − Input VAT ₱${inputVAT.toLocaleString()}`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        dueDay: '25th day after quarter end',
      });
    }

    // ── 2551M — Monthly Percentage Tax ───────────────────────────────────────
    if (taxTypes.includes('2551M')) {
      const amountDue = round(sum(mTxns.filter(t => t.type === 'income'), 'percentageTax'));
      const grossSales = round(sum(mTxns.filter(t => t.type === 'income'), 'amount_gross'));
      const hasData   = mTxns.filter(t => t.type === 'income').length > 0;
      const filed     = filingStatus('2551M', mLabel);
      forms.push({
        form: '2551M', name: 'Monthly Percentage Tax', period: mLabel,
        periodLabel: new Date(year, month - 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' }),
        amountDue, grossSales,
        breakdown: `3% × Gross Sales ₱${grossSales.toLocaleString()}`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        dueDay: '20th of following month',
      });
    }

    // ── 2551Q — Quarterly Percentage Tax ─────────────────────────────────────
    if (taxTypes.includes('2551Q')) {
      const amountDue  = round(sum(qTxns.filter(t => t.type === 'income'), 'percentageTax'));
      const grossSales = round(sum(qTxns.filter(t => t.type === 'income'), 'amount_gross'));
      const hasData    = qTxns.filter(t => t.type === 'income').length > 0;
      const filed      = filingStatus('2551Q', qLabel);
      forms.push({
        form: '2551Q', name: 'Quarterly Percentage Tax', period: qLabel,
        periodLabel: `Q${q} ${year}`,
        amountDue, grossSales,
        breakdown: `3% × Gross Sales ₱${grossSales.toLocaleString()}`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        dueDay: '25th day after quarter end',
      });
    }

    // ── 1601C — WHT on Compensation (monthly) ─────────────────────────────────
    if (taxTypes.includes('1601C')) {
      const totalWHT  = round(employees.reduce((s, e) => s + empMonthlyWHT(e), 0));
      const totalComp = round(employees.reduce((s, e) => s + (parseFloat(e.monthly_basic_salary) || 0), 0));
      const hasData   = employees.length > 0;
      const filed     = filingStatus('1601C', mLabel);
      forms.push({
        form: '1601C', name: 'WHT on Compensation', period: mLabel,
        periodLabel: new Date(year, month - 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' }),
        amountDue: totalWHT, employeeCount: employees.length, totalCompensation: totalComp,
        breakdown: `${employees.length} employee${employees.length !== 1 ? 's' : ''}, total compensation ₱${totalComp.toLocaleString()}`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : totalWHT === 0 ? 'zero' : 'ready',
        status: filed,
        dueDay: '10th of following month',
      });
    }

    // ── 1601EQ — Expanded WHT (quarterly) ────────────────────────────────────
    if (taxTypes.includes('1601EQ')) {
      const amountDue = round(sum(qTxns.filter(t => t.type === 'expense'), 'ewtAmount'));
      const hasData   = qTxns.filter(t => (t.ewtAmount || 0) > 0).length > 0;
      const filed     = filingStatus('1601EQ', qLabel);
      forms.push({
        form: '1601EQ', name: 'Expanded WHT (Quarterly)', period: qLabel,
        periodLabel: `Q${q} ${year}`,
        amountDue,
        breakdown: `Sum of EWT withheld on payments to suppliers`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        dueDay: '25th day after quarter end',
      });
    }

    // ── 1702Q — Quarterly Income Tax (Corporation) ────────────────────────────
    if (taxTypes.includes('1702Q')) {
      const revenue  = round(sum(qTxns.filter(t => t.type === 'income'),  'amount_net'));
      const expenses = round(sum(qTxns.filter(t => t.type === 'expense'), 'amount_net'));
      const netIncome = round(revenue - expenses);
      // Estimated quarterly IT: 25% corporate rate × net income / 4 (very rough)
      const amountDue = Math.max(0, round(netIncome * 0.25));
      const hasData   = qTxns.length > 0;
      const filed     = filingStatus('1702Q', qLabel);
      forms.push({
        form: '1702Q', name: 'Quarterly Income Tax (Corp)', period: qLabel,
        periodLabel: `Q${q} ${year}`,
        amountDue, netIncome,
        breakdown: `Estimated: 25% × Net Income ₱${netIncome.toLocaleString()} (actual may vary)`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        isEstimate: true,
        dueDay: '60th day after quarter end',
      });
    }

    // ── 1701Q — Quarterly Income Tax (Individual) ─────────────────────────────
    if (taxTypes.includes('1701Q')) {
      const revenue  = round(sum(qTxns.filter(t => t.type === 'income'),  'amount_net'));
      const expenses = round(sum(qTxns.filter(t => t.type === 'expense'), 'amount_net'));
      const netIncome = round(revenue - expenses);
      // Estimated: 20% for simplicity — actual uses graduated table
      const amountDue = Math.max(0, round(netIncome * 0.20));
      const hasData   = qTxns.length > 0;
      const filed     = filingStatus('1701Q', qLabel);
      forms.push({
        form: '1701Q', name: 'Quarterly Income Tax (Individual)', period: qLabel,
        periodLabel: `Q${q} ${year}`,
        amountDue, netIncome,
        breakdown: `Estimated: graduated rate applied to Net Income ₱${netIncome.toLocaleString()}`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        isEstimate: true,
        dueDay: '60th day after quarter end',
      });
    }

    // ── 1702 / 1701 — Annual IT ───────────────────────────────────────────────
    for (const code of ['1702', '1701']) {
      if (!taxTypes.includes(code)) continue;
      const yearStart = `${year}-01-01`;
      const yearEnd   = `${year}-12-31`;
      const yTxns     = filterPeriod(allTxns, yearStart, yearEnd);
      const revenue   = round(sum(yTxns.filter(t => t.type === 'income'),  'amount_net'));
      const expenses  = round(sum(yTxns.filter(t => t.type === 'expense'), 'amount_net'));
      const netIncome = round(revenue - expenses);
      const rate      = code === '1702' ? 0.25 : 0.20;
      const amountDue = Math.max(0, round(netIncome * rate));
      const hasData   = yTxns.length > 0;
      const filed     = filingStatus(code, String(year));
      forms.push({
        form: code,
        name: code === '1702' ? 'Annual IT (Corporation)' : 'Annual IT (Individual)',
        period: String(year), periodLabel: `Year ${year}`,
        amountDue, netIncome,
        breakdown: `Estimated: ${code === '1702' ? '25%' : '~20%'} × Net Income ₱${netIncome.toLocaleString()}`,
        readiness: filed === 'filed' ? 'filed' : !hasData ? 'missing' : amountDue === 0 ? 'zero' : 'ready',
        status: filed,
        isEstimate: true,
        dueDay: 'April 15 of following year',
      });
    }

    res.json({ clientId, period, forms });
  } catch (err) { next(err); }
});

// ── PUT /api/bir/filing-status ────────────────────────────────────────────────
// Body: { clientId, form, period, status ('filed'|'pending'), notes }
router.put('/filing-status', (req, res, next) => {
  try {
    const { clientId, form, period, status, notes } = req.body;
    if (!clientId || !form || !period) return res.status(400).json({ error: 'clientId, form, period required' });
    if (!['filed', 'pending'].includes(status)) return res.status(400).json({ error: 'status must be filed or pending' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    stmtUpsertFiling.run({
      id:       uuid(),
      clientId, form, period, status,
      filedAt:  status === 'filed' ? new Date().toISOString() : null,
      filedBy:  status === 'filed' ? req.userId : null,
      notes:    notes || null,
    });

    res.json({ message: `Marked as ${status}`, form, period, status });
  } catch (err) { next(err); }
});

// ── GET /api/bir/portfolio?period=YYYY-MM ─────────────────────────────────────
// Returns all clients assigned to this accountant with current-period metrics.
router.get('/portfolio', (req, res, next) => {
  try {
    let { period } = req.query;
    if (!period) {
      const now = new Date();
      period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    const { year, month } = parseYYYYMM(period);
    const { mStart, mEnd } = monthBounds(year, month);

    // All clients where this accountant is assigned
    const allClients = db.prepare(
      `SELECT * FROM clients WHERE accountant_id = ? ORDER BY trade_name`
    ).all(req.userId).map(rowToClient);

    const result = allClients.map(client => {
      const txns  = stmtTxByClient.all(client.id).map(rowToTx);
      const mTxns = filterPeriod(txns, mStart, mEnd);

      const revenue   = round(sum(mTxns.filter(t => t.type === 'income'),  'amount_net'));
      const expenses  = round(sum(mTxns.filter(t => t.type === 'expense'), 'amount_net'));
      const profit    = round(revenue - expenses);
      const outputVAT = round(sum(mTxns.filter(t => t.type === 'income'),  'amount_vat'));
      const inputVAT  = round(sum(mTxns.filter(t => t.type === 'expense'), 'amount_vat'));
      const vatDue    = round(outputVAT - inputVAT);

      // Upcoming deadlines count (urgent or upcoming)
      const deadlines = getUpcomingDeadlines(client.taxTypes || []);
      const urgent    = deadlines.filter(d => d.urgency === 'urgent').length;
      const upcoming  = deadlines.filter(d => d.urgency === 'upcoming').length;

      return {
        id: client.id, tradeName: client.tradeName,
        tin: client.tin, type: client.type,
        subscriptionTier: client.subscriptionTier,
        taxTypes: client.taxTypes || [],
        metrics: { revenue, expenses, profit, outputVAT, inputVAT, vatDue, txCount: mTxns.length },
        deadlines: { urgent, upcoming, total: deadlines.length },
      };
    });

    res.json({ period, clients: result, count: result.length });
  } catch (err) { next(err); }
});


// ── GET /api/bir/calendar?year=YYYY&month=MM ─────────────────────────────────
// Returns all BIR deadlines for all of this accountant's clients in a given month,
// grouped by ISO date string. Used by the filing calendar view.
router.get('/calendar', (req, res, next) => {
  try {
    const { year, month } = req.query;
    const y = parseInt(year)  || new Date().getFullYear();
    const m = parseInt(month) || (new Date().getMonth() + 1);

    // All clients this accountant manages
    const stmt = req.userRole === 'admin'
      ? db.prepare('SELECT * FROM clients ORDER BY trade_name')
      : db.prepare('SELECT * FROM clients WHERE accountant_id=? OR owner_id=? ORDER BY trade_name');

    const rows = req.userRole === 'admin'
      ? stmt.all()
      : stmt.all(req.userId, req.userId);

    const clients = rows.map(rowToClient);

    // Generate all deadlines for each client that fall in the target month
    const byDate = {};  // { 'YYYY-MM-DD': [{clientId, tradeName, form, name, isoDate}] }

    // Helper: compute all BIR deadlines for a month given tax types
    function deadsInMonth(taxTypes, y, m) {
      const result = [];
      const firstDay = new Date(y, m - 1, 1);
      const lastDay  = new Date(y, m, 0);

      // Monthly forms
      const monthlyForms = {
        '2550M': { name: '2550M — Monthly VAT',          day: 20 },
        '2551M': { name: '2551M — Monthly % Tax',        day: 20 },
        '1601C': { name: '1601-C — WHT Compensation',    day: 10 },
        '1550':  { name: '1550 — Doc Stamp Tax',         day: 5  },
      };
      for (const [code, { name, day }] of Object.entries(monthlyForms)) {
        if (!taxTypes.includes(code)) continue;
        // The 20th of month M is the deadline for the return of month M-1
        const due = new Date(y, m - 1, day);
        if (due >= firstDay && due <= lastDay) {
          result.push({ form: code, name, isoDate: due.toISOString().slice(0, 10) });
        }
      }

      // Quarterly forms — due 20th/25th/60th after quarter end
      const quarterEnds = [
        { q: 1, endY: y, endM: 3,  endD: 31 },
        { q: 2, endY: y, endM: 6,  endD: 30 },
        { q: 3, endY: y, endM: 9,  endD: 30 },
        { q: 4, endY: y, endM: 12, endD: 31 },
        // Prior year Q4 (for Jan deadlines)
        { q: 4, endY: y - 1, endM: 12, endD: 31 },
      ];

      const quarterlyForms = [
        { code: '2550Q',  name: '2550Q — Quarterly VAT',     offsetDays: 25 },
        { code: '2551Q',  name: '2551Q — Quarterly % Tax',   offsetDays: 25 },
        { code: '1601EQ', name: '1601-EQ — EWT Quarterly',   offsetDays: 25 },
        { code: '1702Q',  name: '1702Q — Corp IT Quarterly',  offsetDays: 60 },
        { code: '1701Q',  name: '1701Q — Indiv IT Quarterly', offsetDays: 60 },
      ];

      for (const { endY, endM, endD } of quarterEnds) {
        const qEnd = new Date(endY, endM - 1, endD);
        for (const { code, name, offsetDays } of quarterlyForms) {
          if (!taxTypes.includes(code)) continue;
          const due = new Date(qEnd.getTime() + offsetDays * 86400000);
          if (due >= firstDay && due <= lastDay) {
            result.push({ form: code, name, isoDate: due.toISOString().slice(0, 10) });
          }
        }
      }

      // Annual forms
      const annualForms = [
        { code: '1702', name: '1702 — Annual IT (Corp)',   month: 4, day: 15 },
        { code: '1701', name: '1701 — Annual IT (Indiv)',  month: 4, day: 15 },
      ];
      for (const { code, name, month: fm, day: fd } of annualForms) {
        if (!taxTypes.includes(code)) continue;
        const due = new Date(y, fm - 1, fd);
        if (due >= firstDay && due <= lastDay) {
          result.push({ form: code, name, isoDate: due.toISOString().slice(0, 10) });
        }
      }

      return result;
    }

    const today = new Date().toISOString().slice(0, 10);

    for (const client of clients) {
      const taxTypes = client.taxTypes || [];
      if (!taxTypes.length) continue;
      const deads = deadsInMonth(taxTypes, y, m);
      for (const d of deads) {
        if (!byDate[d.isoDate]) byDate[d.isoDate] = [];
        byDate[d.isoDate].push({
          clientId: client.id, tradeName: client.tradeName,
          form: d.form, name: d.name,
          daysUntil: Math.ceil((new Date(d.isoDate) - new Date(today)) / 86400000),
        });
      }
    }

    const events = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({ date, items, count: items.length }));

    res.json({ year: y, month: m, events, clientCount: clients.length });
  } catch (err) { next(err); }
});

export default router;
