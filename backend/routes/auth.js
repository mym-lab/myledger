// ─── Auth Routes ──────────────────────────────────────────────────────────────
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { db, rowToUser } from '../db.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'myledger-dev-secret-change-in-prod';

const stmtFindByEmail  = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtInsertUser   = db.prepare(`
  INSERT INTO users (id, email, name, company, role, password_hash, accountant_tier, firm_name, accent_color, created_at)
  VALUES (@id, @email, @name, @company, @role, @password_hash, @accountant_tier, @firm_name, @accent_color, @created_at)
`);

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, company = '', role = 'client', inviteToken } = req.body;
    if (!email || !password || !name)
      return res.status(400).json({ error: 'email, password and name are required' });
    if (!['client', 'accountant', 'encoder'].includes(role))
      return res.status(400).json({ error: 'role must be "client", "accountant" or "encoder"' });

    if (stmtFindByEmail.get(email))
      return res.status(409).json({ error: 'Email already registered' });

    // Validate invite token before creating the user
    let invite = null;
    if (inviteToken) {
      invite = db.prepare(
        "SELECT * FROM invitations WHERE token=? AND status='pending' AND email=?"
      ).get(inviteToken, email);
      if (!invite || new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Invitation is invalid or expired. Ask your client to resend.' });
      }
    }

    const id              = uuid();
    const password_hash   = await bcrypt.hash(password, 10);
    const accountant_tier = role === 'accountant' ? 'free' : '';

    stmtInsertUser.run({
      id, email, name, company, role,
      password_hash, accountant_tier,
      firm_name: null, accent_color: null,
      created_at: new Date().toISOString(),
    });

    // Auto-assign to client if valid invite
    if (invite) {
      db.prepare('UPDATE clients SET accountant_id=? WHERE id=?').run(id, invite.client_id);
      db.prepare("UPDATE invitations SET status='accepted' WHERE token=?").run(inviteToken);
    }

    const token = jwt.sign({ userId: id, role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      token,
      user: { id, email, name, company, role, accountantTier: accountant_tier || undefined },
      autoAssigned: invite ? true : undefined,
    });
  } catch (err) { next(err); }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const row = stmtFindByEmail.get(email);
    if (!row || !(await bcrypt.compare(password, row.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = rowToUser(row);
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      token,
      user: {
        id: user.id, email: user.email, name: user.name, company: user.company,
        role: user.role, accountantTier: user.accountantTier || undefined,
        firmName:    user.firmName    || null,
        accentColor: user.accentColor || null,
      },
    });
  } catch (err) { next(err); }
});

export default router;
