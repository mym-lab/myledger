// ─── Chart of Accounts (COA) ──────────────────────────────────────────────────
// GET    /api/coa?clientId=                list all accounts for a client
// POST   /api/coa                          create custom account
// PUT    /api/coa/:id                      update account
// DELETE /api/coa/:id                      delete custom account (cannot delete system ones)
// POST   /api/coa/seed/:clientId           seed standard PH COA for a client

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToCOA, withTransaction } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Standard Philippine COA — 5 element structure
const PH_COA_TEMPLATE = [
  { code: '1000', name: 'Cash on Hand',                  category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1010', name: 'Cash in Bank',                  category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1020', name: 'E-wallet (GCash/Maya)',          category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1100', name: 'Accounts Receivable',           category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1110', name: 'Input VAT Recoverable',         category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1200', name: 'Inventory',                     category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1300', name: 'Prepaid Expenses',              category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1500', name: 'Property, Plant & Equipment',   category: 'Assets',      type: 'system', normalBalance: 'debit' },
  { code: '1510', name: 'Accumulated Depreciation',      category: 'Assets',      type: 'system', normalBalance: 'credit' },
  { code: '2000', name: 'Accounts Payable',              category: 'Liabilities', type: 'system', normalBalance: 'credit' },
  { code: '2010', name: 'VAT Payable',                   category: 'Liabilities', type: 'system', normalBalance: 'credit' },
  { code: '2020', name: 'Percentage Tax Payable',        category: 'Liabilities', type: 'system', normalBalance: 'credit' },
  { code: '2030', name: 'Withholding Tax Payable',       category: 'Liabilities', type: 'system', normalBalance: 'credit' },
  { code: '2040', name: 'Credit Card Payable',           category: 'Liabilities', type: 'system', normalBalance: 'credit' },
  { code: '2100', name: 'Loans Payable',                 category: 'Liabilities', type: 'system', normalBalance: 'credit' },
  { code: '2200', name: 'Accrued Liabilities',           category: 'Liabilities', type: 'system', normalBalance: 'credit' },
  { code: '3000', name: "Owner's Capital",               category: 'Equity',      type: 'system', normalBalance: 'credit' },
  { code: '3010', name: "Owner's Drawing",               category: 'Equity',      type: 'system', normalBalance: 'debit'  },
  { code: '3100', name: 'Retained Earnings',             category: 'Equity',      type: 'system', normalBalance: 'credit' },
  { code: '4000', name: 'Sales Revenue',                 category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '4010', name: 'Sale of Goods',                 category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '4020', name: 'Sale of Services',              category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '4030', name: 'Professional Fees',             category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '4040', name: 'Rental Income',                 category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '4050', name: 'Interest Income',               category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '4060', name: 'Commission Income',             category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '4090', name: 'Other Income',                  category: 'Income',      type: 'system', normalBalance: 'credit' },
  { code: '5000', name: 'Cost of Goods Sold',            category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5100', name: 'Salaries & Wages',              category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5110', name: 'Rent',                          category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5120', name: 'Utilities',                     category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5130', name: 'Office Supplies',               category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5140', name: 'Advertising & Marketing',       category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5150', name: 'Transportation & Travel',       category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5160', name: 'Professional Fees',             category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5170', name: 'Repairs & Maintenance',         category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5180', name: 'Bank Charges & Fees',           category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5190', name: 'Taxes & Licenses',              category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5200', name: 'Depreciation',                  category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5210', name: 'Insurance',                     category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5220', name: 'Interest Expense',              category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
  { code: '5290', name: 'Other Expenses',                category: 'Expenses',    type: 'system', normalBalance: 'debit'  },
];

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById    = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtCOAByClient   = db.prepare('SELECT * FROM coa WHERE client_id=? ORDER BY code ASC');
const stmtCOAById       = db.prepare('SELECT * FROM coa WHERE id=?');
const stmtCOAByCode     = db.prepare('SELECT * FROM coa WHERE client_id=? AND code=?');
const stmtInsertCOA     = db.prepare(`
  INSERT INTO coa (id, client_id, code, name, category, type, normal_balance, created_at)
  VALUES (@id, @client_id, @code, @name, @category, @type, @normal_balance, @created_at)
`);
const stmtUpdateCOA     = db.prepare('UPDATE coa SET name=@name, category=@category, normal_balance=@normal_balance WHERE id=@id');
const stmtDeleteCOA     = db.prepare('DELETE FROM coa WHERE id=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

// POST /api/coa/seed/:clientId — seed PH COA for a client (idempotent)
router.post('/seed/:clientId', (req, res, next) => {
  try {
    const client = rowToClient(stmtClientById.get(req.params.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const existing     = stmtCOAByClient.all(req.params.clientId).map(rowToCOA);
    const existingCodes = new Set(existing.map(a => a.code));
    let added = 0;

    withTransaction(() => {
      for (const tmpl of PH_COA_TEMPLATE) {
        if (!existingCodes.has(tmpl.code)) {
          stmtInsertCOA.run({
            id:             uuid(),
            client_id:      req.params.clientId,
            code:           tmpl.code,
            name:           tmpl.name,
            category:       tmpl.category,
            type:           tmpl.type,
            normal_balance: tmpl.normalBalance,
            created_at:     new Date().toISOString(),
          });
          added++;
        }
      }
    });

    res.json({ message: `Seeded ${added} accounts`, total: existing.length + added });
  } catch (err) { next(err); }
});

// GET /api/coa?clientId=
router.get('/', (req, res, next) => {
  try {
    const { clientId } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const accounts = stmtCOAByClient.all(clientId).map(rowToCOA);
    res.json({ accounts, count: accounts.length });
  } catch (err) { next(err); }
});

// POST /api/coa — create custom account
router.post('/', (req, res, next) => {
  try {
    const { clientId, code, name, category, normalBalance = 'debit' } = req.body;
    if (!clientId || !code || !name || !category)
      return res.status(400).json({ error: 'clientId, code, name, category are required' });

    const validCats = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];
    if (!validCats.includes(category))
      return res.status(400).json({ error: `category must be one of: ${validCats.join(', ')}` });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    if (stmtCOAByCode.get(clientId, code))
      return res.status(409).json({ error: `Account code ${code} already exists` });

    const id = uuid();
    stmtInsertCOA.run({
      id, client_id: clientId, code, name, category,
      type: 'custom', normal_balance: normalBalance,
      created_at: new Date().toISOString(),
    });

    const account = rowToCOA(stmtCOAById.get(id));
    res.status(201).json(account);
  } catch (err) { next(err); }
});

// PUT /api/coa/:id
router.put('/:id', (req, res, next) => {
  try {
    const existing = rowToCOA(stmtCOAById.get(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Account not found' });

    const client = rowToClient(stmtClientById.get(existing.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    const { name, category, normalBalance } = req.body;
    stmtUpdateCOA.run({
      id:             req.params.id,
      name:           name          ?? existing.name,
      category:       category      ?? existing.category,
      normal_balance: normalBalance ?? existing.normalBalance,
    });

    const account = rowToCOA(stmtCOAById.get(req.params.id));
    res.json(account);
  } catch (err) { next(err); }
});

// DELETE /api/coa/:id — only custom accounts can be deleted
router.delete('/:id', (req, res, next) => {
  try {
    const existing = rowToCOA(stmtCOAById.get(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Account not found' });
    if (existing.type === 'system')
      return res.status(400).json({ error: 'System accounts cannot be deleted' });

    const client = rowToClient(stmtClientById.get(existing.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    stmtDeleteCOA.run(req.params.id);
    res.json({ message: 'Account deleted' });
  } catch (err) { next(err); }
});

export default router;
