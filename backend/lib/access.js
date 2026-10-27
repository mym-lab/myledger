// ─── Who may work on a client's books ─────────────────────────────────────────
// Owner, accountant and (where allowed) encoders, as before.
// A staff member counts only while BOTH hold:
//   1. they are assigned to that client, and
//   2. their agency is still that client's accountant.
// So removing the agency's accountant access also removes its staff's access.
import { db } from '../db.js';

const stmtStaffOwner    = db.prepare('SELECT owner_id FROM accountant_staff WHERE id = ?');
const stmtStaffAssigned = db.prepare('SELECT 1 FROM staff_assignments WHERE staff_id = ? AND client_id = ?');

export function hasClientAccess(client, req, { allowEncoders = true } = {}) {
  if (!client || !req?.userId) return false;

  if (req.userRole === 'staff') {
    const staff = stmtStaffOwner.get(req.userId);
    if (!staff || client.accountantId !== staff.owner_id) return false;
    return !!stmtStaffAssigned.get(req.userId, client.id);
  }

  if (client.ownerId === req.userId || client.accountantId === req.userId) return true;
  return allowEncoders && (client.encoderIds || []).includes(req.userId);
}

// User id written on records: for staff, the agency that employs them
// (the audit log still records the staff member separately).
export function actingOwnerId(req) {
  if (req.userRole !== 'staff') return req.userId;
  const staff = stmtStaffOwner.get(req.userId);
  return staff ? staff.owner_id : null;
}
