// ─── Client Groups (multi-store / consolidated P&L) ──────────────────────────
// GET    /api/client-groups                    list groups for this accountant
// POST   /api/client-groups                    create group
// PUT    /api/client-groups/:id               update name + member list
// DELETE /api/client-groups/:id               delete group
// GET    /api/client-groups/:id/consolidated  consolidated P&L across members

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToTx } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const round = (n) => Math.round(n * 100) / 100;
const sum   = (arr, key) => arr.reduce((s, t) => s + (t[key] || 0), 0);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtGroupsByOwner   = db.prepare('SELECT * FROM client_groups WHERE owner_id = ? ORDER BY name');
const stmtGroupById       = db.prepare('SELECT * FROM client_groups WHERE id = ?');
const stmtMembersByGroup  = db.prepare('SELECT client_id FROM client_group_members WHERE group_id = ?');
const stmtInsertGroup     = db.prepare('INSERT INTO client_groups (id, owner_id, name, created_at) VALUES (?, ?, ?, ?)');
const stmtUpdateGroupName = db.prepare('UPDATE client_groups SET name = ? WHERE id = ?');
const stmtDeleteMembers   = db.prepare('DELETE FROM client_group_members WHERE group_id = ?');
const stmtInsertMember    = db.prepare('INSERT OR IGNORE INTO client_group_members (group_id, client_id) VALUES (?, ?)');
const stmtDeleteGroup     = db.prepare('DELETE FROM client_groups WHERE id = ?');
const stmtClientById      = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtTxByClient      = db.prepare('SELECT * FROM transactions WHERE client_id = ? AND voided_at IS NULL');

function canOwnGroup(group, userId) {
  return group?.owner_id === userId;
}

function canAccessClient(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

function rowToGroup(row) {
  if (!row) return null;
  return { id: row.id, ownerId: row.owner_id, name: row.name, createdAt: row.created_at };
}

function filterByDate(txns, from, to) {
  return txns.filter(t => {
    if (from && t.createdAt < from) return false;
    if (to   && t.createdAt > to + 'T23:59:59') return false;
    return true;
  });
}

function computeIncome(txns, from, to) {
  const filtered = filterByDate(txns, from, to);
  const income   = filtered.filter(t => t.type === 'income');
  const expense  = filtered.filter(t => t.type === 'expense');

  const COGS_CATS = ['Cost of Goods Sold'];
  const cogsExpense = expense.filter(t =>  COGS_CATS.includes(t.category));
  const opexExpense = expense.filter(t => !COGS_CATS.includes(t.category));

  const revenue           = round(sum(income,   'amount_net'));
  const costOfSales       = round(sum(cogsExpense, 'amount_net'));
  const operatingExpenses = round(sum(opexExpense, 'amount_net'));
  const grossProfit       = round(revenue - costOfSales);
  const totalExpenses     = round(sum(expense,  'amount_net'));
  const netProfit         = round(revenue - totalExpenses);

  function byCategory(txList) {
    const map = {};
    for (const t of txList) {
      const cat = t.category || 'Uncategorised';
      map[cat] = round((map[cat] || 0) + (t.amount_net || 0));
    }
    return Object.entries(map).map(([category, amount]) => ({ category, amount }));
  }

  return {
    revenue, costOfSales, grossProfit,
    operatingExpenses, totalExpenses, netProfit,
    expenseBreakdown: {
      cogs: byCategory(cogsExpense),
      opex: byCategory(opexExpense),
    },
  };
}

// ── GET /api/client-groups ────────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  try {
    const ownerId = req.userRole === 'staff' ? req.ownerId : req.userId;
    const groups  = stmtGroupsByOwner.all(ownerId).map(g => {
      const members = stmtMembersByGroup.all(g.id).map(r => r.client_id);
      return { ...rowToGroup(g), memberClientIds: members };
    });
    res.json({ groups });
  } catch (err) { next(err); }
});

// ── POST /api/client-groups ───────────────────────────────────────────────────
router.post('/', (req, res, next) => {
  try {
    const ownerId = req.userRole === 'staff' ? req.ownerId : req.userId;
    const { name, clientIds = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Group name is required' });

    const id        = uuid();
    const createdAt = new Date().toISOString();
    stmtInsertGroup.run(id, ownerId, name.trim(), createdAt);

    for (const cid of clientIds) stmtInsertMember.run(id, cid);

    res.status(201).json({ group: { id, ownerId, name: name.trim(), createdAt, memberClientIds: clientIds } });
  } catch (err) { next(err); }
});

// ── PUT /api/client-groups/:id ────────────────────────────────────────────────
router.put('/:id', (req, res, next) => {
  try {
    const ownerId = req.userRole === 'staff' ? req.ownerId : req.userId;
    const group   = stmtGroupById.get(req.params.id);
    if (!group || !canOwnGroup(group, ownerId))
      return res.status(404).json({ error: 'Group not found' });

    const { name, clientIds = [] } = req.body;
    if (name?.trim()) stmtUpdateGroupName.run(name.trim(), group.id);

    // Full-replace members
    stmtDeleteMembers.run(group.id);
    for (const cid of clientIds) stmtInsertMember.run(group.id, cid);

    const updatedMembers = stmtMembersByGroup.all(group.id).map(r => r.client_id);
    res.json({ group: { ...rowToGroup(stmtGroupById.get(group.id)), memberClientIds: updatedMembers } });
  } catch (err) { next(err); }
});

// ── DELETE /api/client-groups/:id ─────────────────────────────────────────────
router.delete('/:id', (req, res, next) => {
  try {
    const ownerId = req.userRole === 'staff' ? req.ownerId : req.userId;
    const group   = stmtGroupById.get(req.params.id);
    if (!group || !canOwnGroup(group, ownerId))
      return res.status(404).json({ error: 'Group not found' });

    stmtDeleteMembers.run(group.id);
    stmtDeleteGroup.run(group.id);
    res.json({ message: 'Group deleted' });
  } catch (err) { next(err); }
});

// ── GET /api/client-groups/:id/consolidated ───────────────────────────────────
// Returns per-client P&L + consolidated totals for a date range
router.get('/:id/consolidated', (req, res, next) => {
  try {
    const ownerId = req.userRole === 'staff' ? req.ownerId : req.userId;
    const group   = stmtGroupById.get(req.params.id);
    if (!group || !canOwnGroup(group, ownerId))
      return res.status(404).json({ error: 'Group not found' });

    const { from, to } = req.query;
    const memberIds    = stmtMembersByGroup.all(group.id).map(r => r.client_id);

    if (memberIds.length === 0)
      return res.json({ group: rowToGroup(group), from, to, stores: [], consolidated: null });

    const stores = [];
    for (const cid of memberIds) {
      const client = rowToClient(stmtClientById.get(cid));
      if (!client || !canAccessClient(client, ownerId)) continue;

      const txns = stmtTxByClient.all(cid).map(rowToTx);
      const pnl  = computeIncome(txns, from, to);
      stores.push({ clientId: cid, clientName: client.tradeName, ...pnl });
    }

    // Consolidated totals
    const consolidated = {
      revenue:           round(stores.reduce((s, st) => s + st.revenue, 0)),
      costOfSales:       round(stores.reduce((s, st) => s + st.costOfSales, 0)),
      grossProfit:       round(stores.reduce((s, st) => s + st.grossProfit, 0)),
      operatingExpenses: round(stores.reduce((s, st) => s + st.operatingExpenses, 0)),
      totalExpenses:     round(stores.reduce((s, st) => s + st.totalExpenses, 0)),
      netProfit:         round(stores.reduce((s, st) => s + st.netProfit, 0)),
    };

    res.json({ group: rowToGroup(group), from, to, stores, consolidated });
  } catch (err) { next(err); }
});

export default router;
