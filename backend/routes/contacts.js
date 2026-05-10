// ─── Contacts Routes (Vendors & Customers) ────────────────────────────────────
// POST   /api/contacts                  create contact
// GET    /api/contacts?clientId=        list contacts for client
// PUT    /api/contacts/:id              update contact
// DELETE /api/contacts/:id             delete contact

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { db, rowToClient, rowToContact } from '../db.js';
import { authenticate, noEncoder } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);
router.use(noEncoder);

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById      = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtInsertContact   = db.prepare(`
  INSERT INTO contacts (id, client_id, user_id, name, type, tin, address, phone, email, notes, created_at)
  VALUES (@id, @client_id, @user_id, @name, @type, @tin, @address, @phone, @email, @notes, @created_at)
`);
const stmtContactsByClient = db.prepare('SELECT * FROM contacts WHERE client_id=? ORDER BY name ASC');
const stmtContactById      = db.prepare('SELECT * FROM contacts WHERE id=?');
const stmtUpdateContact    = db.prepare(`
  UPDATE contacts SET name=@name, type=@type, tin=@tin, address=@address,
    phone=@phone, email=@email, notes=@notes WHERE id=@id
`);
const stmtDeleteContact = db.prepare('DELETE FROM contacts WHERE id=?');

function canAccess(client, userId) {
  return client.ownerId === userId || client.accountantId === userId;
}

// POST /api/contacts
router.post('/', (req, res, next) => {
  try {
    const {
      clientId, name, type = 'supplier',
      tin = '', address = '', phone = '', email = '', notes = '',
    } = req.body;

    if (!clientId || !name)
      return res.status(400).json({ error: 'clientId and name are required' });
    if (!['customer', 'supplier', 'both'].includes(type))
      return res.status(400).json({ error: 'type must be customer, supplier, or both' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    const id = uuid();
    stmtInsertContact.run({
      id,
      client_id: clientId,
      user_id:   req.userId,
      name:      name.trim(),
      type,
      tin:       tin.trim(),
      address:   address.trim(),
      phone:     phone.trim(),
      email:     email.trim(),
      notes:     notes.trim(),
      created_at: new Date().toISOString(),
    });

    const contact = rowToContact(stmtContactById.get(id));
    res.status(201).json({ contact });
  } catch (err) { next(err); }
});

// GET /api/contacts?clientId=[&q=search]
router.get('/', (req, res, next) => {
  try {
    const { clientId, q } = req.query;
    if (!clientId) return res.status(400).json({ error: 'clientId required' });

    const client = rowToClient(stmtClientById.get(clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(404).json({ error: 'Client not found' });

    let contacts = stmtContactsByClient.all(clientId).map(rowToContact);

    if (q) {
      const search = q.toLowerCase();
      contacts = contacts.filter(c =>
        c.name.toLowerCase().includes(search) ||
        (c.tin   && c.tin.includes(search))   ||
        (c.email && c.email.toLowerCase().includes(search))
      );
    }

    res.json({ contacts, count: contacts.length });
  } catch (err) { next(err); }
});

// PUT /api/contacts/:id
router.put('/:id', (req, res, next) => {
  try {
    const existing = rowToContact(stmtContactById.get(req.params.id));
    if (!existing) return res.status(404).json({ error: 'Contact not found' });

    const client = rowToClient(stmtClientById.get(existing.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    const { name, type, tin, address, phone, email, notes } = req.body;

    stmtUpdateContact.run({
      id:      req.params.id,
      name:    (name    != null ? name.trim()    : existing.name),
      type:    (type             ?? existing.type),
      tin:     (tin     != null ? tin.trim()     : existing.tin),
      address: (address != null ? address.trim() : existing.address),
      phone:   (phone   != null ? phone.trim()   : existing.phone),
      email:   (email   != null ? email.trim()   : existing.email),
      notes:   (notes   != null ? notes.trim()   : existing.notes),
    });

    const contact = rowToContact(stmtContactById.get(req.params.id));
    res.json({ contact });
  } catch (err) { next(err); }
});

// DELETE /api/contacts/:id
router.delete('/:id', (req, res, next) => {
  try {
    const contact = rowToContact(stmtContactById.get(req.params.id));
    if (!contact) return res.status(404).json({ error: 'Contact not found' });

    const client = rowToClient(stmtClientById.get(contact.clientId));
    if (!client || !canAccess(client, req.userId))
      return res.status(403).json({ error: 'Not authorised' });

    stmtDeleteContact.run(req.params.id);
    res.json({ message: 'Contact deleted' });
  } catch (err) { next(err); }
});

export default router;
