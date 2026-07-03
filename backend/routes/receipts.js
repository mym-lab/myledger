// ─── Receipt / Document Attachments ──────────────────────────────────────────
// POST   /api/receipts/:txId          — upload file (multipart/form-data, field: file)
// GET    /api/receipts/:txId          — list attachments for a transaction
// GET    /api/receipts/:txId/:id      — download a specific attachment
// DELETE /api/receipts/:txId/:id      — delete an attachment

import { Router } from 'express';
import multer       from 'multer';
import { v4 as uuid } from 'uuid';
import { db }       from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// 10 MB per file, memory storage (base64 → SQLite TEXT — no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('File type not allowed. Use JPG, PNG, PDF, CSV, or Excel.'));
  },
});

// ── Bootstrap table ───────────────────────────────────────────────────────────
try {
  db.exec(`CREATE TABLE IF NOT EXISTS transaction_attachments (
    id             TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    client_id      TEXT NOT NULL,
    filename       TEXT NOT NULL,
    mimetype       TEXT NOT NULL,
    size           INTEGER NOT NULL,
    data           TEXT NOT NULL,
    uploaded_by    TEXT NOT NULL,
    created_at     TEXT NOT NULL
  )`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ta_tx ON transaction_attachments(transaction_id)`);
} catch { /* already exists */ }

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTx(txId) {
  return db.prepare('SELECT * FROM transactions WHERE id = ? AND voided_at IS NULL').get(txId);
}
function canAccess(clientId, userId) {
  const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId);
  if (!client) return false;
  return client.owner_id === userId || client.accountant_id === userId;
}

// ── POST /api/receipts/:txId ──────────────────────────────────────────────────
router.post('/:txId', upload.single('file'), (req, res, next) => {
  try {
    const { txId } = req.params;
    const tx = getTx(txId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (!canAccess(tx.client_id, req.userId)) return res.status(403).json({ error: 'Forbidden' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Max 10 attachments per transaction
    const count = db.prepare('SELECT COUNT(*) as n FROM transaction_attachments WHERE transaction_id=?').get(txId);
    if (count.n >= 10) return res.status(400).json({ error: 'Maximum 10 attachments per transaction' });

    const id   = uuid();
    const b64  = req.file.buffer.toString('base64');
    const now  = new Date().toISOString();

    db.prepare(`INSERT INTO transaction_attachments (id, transaction_id, client_id, filename, mimetype, size, data, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, txId, tx.client_id, req.file.originalname, req.file.mimetype, req.file.size, b64, req.userId, now);

    res.status(201).json({
      id, filename: req.file.originalname, mimetype: req.file.mimetype,
      size: req.file.size, createdAt: now,
    });
  } catch (err) { next(err); }
});

// ── GET /api/receipts/:txId ───────────────────────────────────────────────────
router.get('/:txId', (req, res, next) => {
  try {
    const { txId } = req.params;
    const tx = getTx(txId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (!canAccess(tx.client_id, req.userId)) return res.status(403).json({ error: 'Forbidden' });

    const rows = db.prepare(
      'SELECT id, filename, mimetype, size, uploaded_by, created_at FROM transaction_attachments WHERE transaction_id=? ORDER BY created_at ASC'
    ).all(txId);

    res.json({ attachments: rows.map(r => ({
      id: r.id, filename: r.filename, mimetype: r.mimetype,
      size: r.size, uploadedBy: r.uploaded_by, createdAt: r.created_at,
    }))});
  } catch (err) { next(err); }
});

// ── GET /api/receipts/:txId/:id ───────────────────────────────────────────────
router.get('/:txId/:id', (req, res, next) => {
  try {
    const { txId, id } = req.params;
    const tx = getTx(txId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (!canAccess(tx.client_id, req.userId)) return res.status(403).json({ error: 'Forbidden' });

    const att = db.prepare('SELECT * FROM transaction_attachments WHERE id=? AND transaction_id=?').get(id, txId);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });

    const buf = Buffer.from(att.data, 'base64');
    res.setHeader('Content-Type', att.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.send(buf);
  } catch (err) { next(err); }
});

// ── DELETE /api/receipts/:txId/:id ───────────────────────────────────────────
router.delete('/:txId/:id', (req, res, next) => {
  try {
    const { txId, id } = req.params;
    const tx = getTx(txId);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (!canAccess(tx.client_id, req.userId)) return res.status(403).json({ error: 'Forbidden' });

    const att = db.prepare('SELECT * FROM transaction_attachments WHERE id=? AND transaction_id=?').get(id, txId);
    if (!att) return res.status(404).json({ error: 'Attachment not found' });

    db.prepare('DELETE FROM transaction_attachments WHERE id=?').run(id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
