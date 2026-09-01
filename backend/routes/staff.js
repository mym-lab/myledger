// ─── Accountant Staff / Team Management ───────────────────────────────────────
// All routes require a valid JWT.
// Owner-only routes (create, delete, assign) require role === 'accountant'.
//
// POST   /api/staff            — create a staff sub-user (owner only)
// GET    /api/staff            — list staff + their assigned clients (owner only)
// PUT    /api/staff/:id/assign — set assigned client IDs for a staff member (owner only)
// DELETE /api/staff/:id        — remove a staff member (owner only)

import { Router }   from 'express';
import bcrypt        from 'bcryptjs';
import { v4 as uuid } from 'uuid';
import { db, rowToStaff, getSetting } from '../db.js';
import { authenticate }   from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtOwnerTier    = db.prepare('SELECT accountant_tier FROM users WHERE id = ?');
const stmtCountStaff   = db.prepare('SELECT COUNT(*) AS cnt FROM accountant_staff WHERE owner_id = ?');

const stmtInsertStaff = db.prepare(`
  INSERT INTO accountant_staff (id, owner_id, name, email, password_hash, created_at)
  VALUES (@id, @owner_id, @name, @email, @password_hash, datetime('now'))
`);

const stmtListStaff = db.prepare(
  'SELECT * FROM accountant_staff WHERE owner_id = ? ORDER BY created_at ASC'
);

const stmtGetStaff = db.prepare(
  'SELECT * FROM accountant_staff WHERE id = ?'
);

const stmtFindStaffByEmail = db.prepare(
  'SELECT id FROM accountant_staff WHERE email = ?'
);

const stmtDeleteStaff = db.prepare(
  'DELETE FROM accountant_staff WHERE id = ? AND owner_id = ?'
);

const stmtAssignmentsForStaff = db.prepare(
  'SELECT client_id FROM staff_assignments WHERE staff_id = ?'
);

const stmtDeleteAssignments = db.prepare(
  'DELETE FROM staff_assignments WHERE staff_id = ?'
);

const stmtInsertAssignment = db.prepare(`
  INSERT OR IGNORE INTO staff_assignments (staff_id, client_id, assigned_at)
  VALUES (@staff_id, @client_id, datetime('now'))
`);

// Verify a client belongs to this accountant (owner)
const stmtCheckClient = db.prepare(
  'SELECT id FROM clients WHERE id = ? AND accountant_id = ?'
);

// ── Helpers ───────────────────────────────────────────────────────────────────
function requireOwner(req, res) {
  if (req.userRole !== 'accountant') {
    res.status(403).json({ error: 'Only the account owner can manage staff' });
    return false;
  }
  return true;
}

function staffWithAssignments(staffRows, ownerId) {
  return staffRows.map(row => {
    const staff = rowToStaff(row);
    const assignments = stmtAssignmentsForStaff.all(staff.id).map(r => r.client_id);
    return { ...staff, assignedClientIds: assignments };
  });
}

// ── POST /api/staff — create staff member ─────────────────────────────────────
router.post('/', async (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password are required' });

    if (stmtFindStaffByEmail.get(email))
      return res.status(409).json({ error: 'A staff member with that email already exists' });

    // Enforce per-tier staff limit (from admin-editable settings)
    const staffLimits = getSetting('staffLimits') || {};
    const ownerRow    = stmtOwnerTier.get(req.userId);
    const tier        = ownerRow?.accountant_tier || 'free';
    const limit       = staffLimits[tier] ?? 0;
    const current     = stmtCountStaff.get(req.userId).cnt;
    if (limit === 0)
      return res.status(403).json({ error: 'Your current plan does not include staff sub-users. Please upgrade.' });
    if (current >= limit)
      return res.status(403).json({
        error: `Staff limit reached for your ${tier} plan (${limit} staff). Please upgrade to add more.`,
      });

    const password_hash = await bcrypt.hash(password, 10);
    const id = uuid();

    stmtInsertStaff.run({ id, owner_id: req.userId, name, email, password_hash });

    const staff = rowToStaff(stmtGetStaff.get(id));
    res.status(201).json({ staff: { ...staff, assignedClientIds: [] } });
  } catch (err) { next(err); }
});

// ── GET /api/staff — list all staff + assigned clients ────────────────────────
router.get('/', (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    const rows  = stmtListStaff.all(req.userId);
    const staff = staffWithAssignments(rows, req.userId);
    res.json({ staff });
  } catch (err) { next(err); }
});

// ── PUT /api/staff/:id/assign — set client assignments for a staff member ──────
// Body: { clientIds: ['uuid1', 'uuid2', ...] }
// Replaces existing assignments (idempotent full-replace).
router.put('/:id/assign', (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    const { id } = req.params;
    const { clientIds = [] } = req.body;

    // Verify staff belongs to this owner
    const staffRow = stmtGetStaff.get(id);
    if (!staffRow || staffRow.owner_id !== req.userId)
      return res.status(404).json({ error: 'Staff member not found' });

    // Verify every clientId belongs to this accountant
    for (const cid of clientIds) {
      if (!stmtCheckClient.get(cid, req.userId))
        return res.status(400).json({ error: `Client ${cid} not found or not yours` });
    }

    // Full replace — delete existing, insert new set
    stmtDeleteAssignments.run(id);
    for (const client_id of clientIds) {
      stmtInsertAssignment.run({ staff_id: id, client_id });
    }

    const staff = rowToStaff(staffRow);
    res.json({ staff: { ...staff, assignedClientIds: clientIds } });
  } catch (err) { next(err); }
});

// ── DELETE /api/staff/:id — remove a staff member ────────────────────────────
router.delete('/:id', (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    const { id } = req.params;

    const staffRow = stmtGetStaff.get(id);
    if (!staffRow || staffRow.owner_id !== req.userId)
      return res.status(404).json({ error: 'Staff member not found' });

    // Remove assignments first (FK safety), then the staff row
    stmtDeleteAssignments.run(id);
    stmtDeleteStaff.run(id, req.userId);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── PUT /api/staff/:id/password — owner resets a staff member's password ───────
router.put('/:id/password', async (req, res, next) => {
  if (!requireOwner(req, res)) return;
  try {
    const { id } = req.params;
    const { password } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const staffRow = stmtGetStaff.get(id);
    if (!staffRow || staffRow.owner_id !== req.userId)
      return res.status(404).json({ error: 'Staff member not found' });

    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE accountant_staff SET password_hash = ? WHERE id = ?').run(password_hash, id);

    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
