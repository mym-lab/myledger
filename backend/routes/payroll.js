// ─── routes/payroll.js — 1601-C Payroll & WHT on Compensation ────────────────
// Endpoints:
//   GET    /api/payroll/employees?clientId=
//   POST   /api/payroll/employees
//   PUT    /api/payroll/employees/:id
//   DELETE /api/payroll/employees/:id
//   GET    /api/payroll/compute/:clientId/:year/:month

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── TRAIN Law graduated annual WHT computation ────────────────────────────────
// BIR Revenue Regulations 8-2018 (TRAIN Law, RA 10963)
//   ≤ ₱250,000/yr        → 0%
//   ₱250,001–400,000     → 20% of excess over ₱250,000
//   ₱400,001–800,000     → ₱30,000 + 25% of excess over ₱400,000
//   ₱800,001–2,000,000   → ₱130,000 + 30% of excess over ₱800,000
//   ₱2,000,001–8,000,000 → ₱490,000 + 32% of excess over ₱2,000,000
//   > ₱8,000,000         → ₱2,410,000 + 35% of excess over ₱8,000,000
function computeAnnualWHT(annualTaxable) {
  const t = annualTaxable;
  if (t <= 250000)   return 0;
  if (t <= 400000)   return (t - 250000) * 0.20;
  if (t <= 800000)   return 30000  + (t - 400000) * 0.25;
  if (t <= 2000000)  return 130000 + (t - 800000) * 0.30;
  if (t <= 8000000)  return 490000 + (t - 2000000) * 0.32;
  return 2410000 + (t - 8000000) * 0.35;
}

function computeEmployeeWHT(emp) {
  const basic   = parseFloat(emp.monthly_basic_salary)      || 0;
  const sss     = parseFloat(emp.sss_contribution)          || 0;
  const ph      = parseFloat(emp.philhealth_contribution)   || 0;
  const pag     = parseFloat(emp.pagibig_contribution)      || 0;
  const monthlyTaxable = Math.max(0, basic - sss - ph - pag);
  const annualTaxable  = monthlyTaxable * 12;
  const annualWHT      = computeAnnualWHT(annualTaxable);
  return {
    monthly_basic_salary:   Math.round(basic * 100) / 100,
    monthly_deductions:     Math.round((sss + ph + pag) * 100) / 100,
    monthly_taxable:        Math.round(monthlyTaxable * 100) / 100,
    annual_taxable:         Math.round(annualTaxable * 100) / 100,
    annual_wht:             Math.round(annualWHT * 100) / 100,
    monthly_wht:            Math.round(annualWHT / 12 * 100) / 100,
  };
}

const stmtClient      = db.prepare('SELECT * FROM clients WHERE id=?');
const stmtByClient    = db.prepare('SELECT * FROM employees WHERE client_id=? ORDER BY name');
const stmtById        = db.prepare('SELECT * FROM employees WHERE id=?');
const stmtInsert      = db.prepare(`
  INSERT INTO employees
    (id, client_id, name, tin, employment_type, monthly_basic_salary,
     sss_contribution, philhealth_contribution, pagibig_contribution, hire_date)
  VALUES (?,?,?,?,?,?,?,?,?,?)
`);
const stmtUpdate      = db.prepare(`
  UPDATE employees SET name=?, tin=?, employment_type=?, monthly_basic_salary=?,
    sss_contribution=?, philhealth_contribution=?, pagibig_contribution=?, hire_date=?
  WHERE id=?
`);
const stmtDelete      = db.prepare('DELETE FROM employees WHERE id=?');

function canAccess(clientId, userId) {
  const client = rowToClient(stmtClient.get(clientId));
  if (!client) return false;
  return client.ownerId === userId || client.accountantId === userId;
}

// ── GET /api/payroll/employees?clientId= ─────────────────────────────────────
router.get('/employees', (req, res) => {
  const { clientId } = req.query;
  if (!clientId) return res.status(400).json({ error: 'clientId required' });
  if (!canAccess(clientId, req.userId))
    return res.status(403).json({ error: 'Forbidden' });
  res.json(stmtByClient.all(clientId));
});

// ── POST /api/payroll/employees ───────────────────────────────────────────────
router.post('/employees', (req, res) => {
  const { clientId, name, tin, employmentType, monthlyBasicSalary,
    sssContribution, philhealthContribution, pagibigContribution, hireDate } = req.body;
  if (!clientId || !name || monthlyBasicSalary == null)
    return res.status(400).json({ error: 'clientId, name, monthlyBasicSalary are required' });
  if (!canAccess(clientId, req.userId))
    return res.status(403).json({ error: 'Forbidden' });
  const id = uuid();
  stmtInsert.run(
    id, clientId, name,
    tin || null,
    employmentType || 'regular',
    parseFloat(monthlyBasicSalary) || 0,
    parseFloat(sssContribution) || 0,
    parseFloat(philhealthContribution) || 0,
    parseFloat(pagibigContribution) || 0,
    hireDate || null
  );
  res.json({ id, message: 'Employee added' });
});

// ── PUT /api/payroll/employees/:id ────────────────────────────────────────────
router.put('/employees/:id', (req, res) => {
  const emp = stmtById.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  if (!canAccess(emp.client_id, req.userId))
    return res.status(403).json({ error: 'Forbidden' });
  const { name, tin, employmentType, monthlyBasicSalary,
    sssContribution, philhealthContribution, pagibigContribution, hireDate } = req.body;
  stmtUpdate.run(
    name ?? emp.name,
    tin  ?? emp.tin,
    employmentType  ?? emp.employment_type,
    parseFloat(monthlyBasicSalary)      ?? emp.monthly_basic_salary,
    parseFloat(sssContribution)         ?? emp.sss_contribution,
    parseFloat(philhealthContribution)  ?? emp.philhealth_contribution,
    parseFloat(pagibigContribution)     ?? emp.pagibig_contribution,
    hireDate ?? emp.hire_date,
    req.params.id
  );
  res.json({ message: 'Updated' });
});

// ── DELETE /api/payroll/employees/:id ─────────────────────────────────────────
router.delete('/employees/:id', (req, res) => {
  const emp = stmtById.get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Not found' });
  if (!canAccess(emp.client_id, req.userId))
    return res.status(403).json({ error: 'Forbidden' });
  stmtDelete.run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ── GET /api/payroll/compute/:clientId/:year/:month ───────────────────────────
// Returns WHT computation for all employees (month 1–12)
router.get('/compute/:clientId/:year/:month', (req, res) => {
  const { clientId, year, month } = req.params;
  if (!canAccess(clientId, req.userId))
    return res.status(403).json({ error: 'Forbidden' });
  const employees = stmtByClient.all(clientId);
  const rows = employees.map(emp => ({
    id:              emp.id,
    name:            emp.name,
    tin:             emp.tin,
    employment_type: emp.employment_type,
    hire_date:       emp.hire_date,
    ...computeEmployeeWHT(emp),
  }));
  const totals = {
    total_monthly_basic:   Math.round(rows.reduce((s, r) => s + r.monthly_basic_salary, 0) * 100) / 100,
    total_monthly_taxable: Math.round(rows.reduce((s, r) => s + r.monthly_taxable, 0) * 100) / 100,
    total_monthly_wht:     Math.round(rows.reduce((s, r) => s + r.monthly_wht, 0) * 100) / 100,
  };
  res.json({ year: parseInt(year), month: parseInt(month), employees: rows, totals });
});

export default router;
