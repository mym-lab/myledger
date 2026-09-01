// ─── Auth Routes ──────────────────────────────────────────────────────────────
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { randomBytes } from 'crypto';
import { db, rowToUser, rowToStaff } from '../db.js';
import { getTrialStatus } from '../lib/trial.js';
import { requireTier }   from '../middleware/tierGuard.js';
import { authenticate } from '../middleware/auth.js';
import { recordReferral } from './referrals.js';
import { sendEmail } from '../email.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'myledger-dev-secret-change-in-prod';

const stmtFindByEmail      = db.prepare('SELECT * FROM users WHERE email = ?');
const stmtFindStaffByEmail = db.prepare('SELECT * FROM accountant_staff WHERE email = ?');
const stmtInsertUser   = db.prepare(`
  INSERT INTO users (id, email, name, company, role, password_hash, accountant_tier, firm_name, accent_color, trial_started_at, trial_tier, trial_drip_sent, created_at)
  VALUES (@id, @email, @name, @company, @role, @password_hash, @accountant_tier, @firm_name, @accent_color, @trial_started_at, @trial_tier, @trial_drip_sent, @created_at)
`);

// POST /api/auth/signup
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, company = '', role = 'client', inviteToken, refCode } = req.body;
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
    const now             = new Date().toISOString();
    // Every new signup gets a 30-day free trial at 'professional' tier
    const trial_tier      = role === 'accountant' ? 'professional' : 'professional';

    stmtInsertUser.run({
      id, email, name, company, role,
      password_hash, accountant_tier,
      firm_name: null, accent_color: null,
      trial_started_at: now,
      trial_tier,
      trial_drip_sent: '[]',
      created_at: now,
    });

    // Record referral if signup came via a referral link
    if (refCode) recordReferral(id, email, refCode);

    // ── Welcome email ─────────────────────────────────────────────────────────
    const appUrl    = process.env.APP_URL || 'https://app.kaimanco.com';
    const roleLabel = role === 'accountant' ? 'Accountant Portal' : role === 'encoder' ? 'Encoder Portal' : 'Dashboard';
    const roleHint  = role === 'accountant'
      ? 'Start by adding your first client — then issue BIR returns, manage books, and run payroll, all in one place.'
      : role === 'encoder'
      ? 'You can start encoding transactions right away once your accountant assigns you a client.'
      : 'Start by adding your business details and your first transaction — your books are ready to go.';
    sendEmail({
      to: email,
      subject: 'Welcome to MyLedger 🎉',
      html: `
        <div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 0">
          <div style="background:#111827;padding:20px 28px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
            <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">MyLedger</span>
            <span style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">by Kaiman &amp; Co.</span>
          </div>
          <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
            <h2 style="margin:0 0 8px;font-size:22px;color:#111827">Welcome, ${name}! 👋</h2>
            <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">
              Your MyLedger account is ready. ${roleHint}
            </p>

            <a href="${appUrl}"
              style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:13px 32px;border-radius:9px;font-size:15px;font-weight:700;margin-bottom:28px">
              Open ${roleLabel} →
            </a>

            <hr style="border:none;border-top:1px solid #f3f4f6;margin:0 0 20px">

            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6">
              <strong style="color:#111827">📊 VAT-smart bookkeeping</strong> — Income and expense VAT is computed automatically so your BIR returns are always ready.
            </p>
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;line-height:1.6">
              <strong style="color:#111827">📋 BIR forms on demand</strong> — 2550M/Q, 2551M/Q, 1601-EQ, 1601-C, 1700 series — generated from your actual books.
            </p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.6">
              <strong style="color:#111827">🔐 Your data, your control</strong> — Period locking, audit log, and role-based access keep everything secure.
            </p>

            <p style="margin:28px 0 0;font-size:12px;color:#9ca3af">
              You're receiving this because you signed up at <a href="${appUrl}" style="color:#6b7280">${appUrl}</a>.<br>
              Questions? Reply to this email or reach us at support@kaimanco.com.
            </p>
          </div>
        </div>`,
      text: `Welcome to MyLedger, ${name}!\n\n${roleHint}\n\nOpen your ${roleLabel}: ${appUrl}\n\nQuestions? Email support@kaimanco.com`,
    }).catch(e => console.error('Welcome email failed:', e.message));
    // ─────────────────────────────────────────────────────────────────────────

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

    // ── Check main users table first ─────────────────────────────────────────
    const row = stmtFindByEmail.get(email);
    if (row) {
      if (!(await bcrypt.compare(password, row.password_hash)))
        return res.status(401).json({ error: 'Invalid credentials' });

      const user  = rowToUser(row);
      const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({
        token,
        user: {
          id: user.id, email: user.email, name: user.name, company: user.company,
          role: user.role, accountantTier: user.accountantTier || undefined,
          firmName:    user.firmName    || null,
          accentColor: user.accentColor || null,
        },
      });
    }

    // ── Fall through: check accountant_staff table ────────────────────────────
    const staffRow = stmtFindStaffByEmail.get(email);
    if (!staffRow || !(await bcrypt.compare(password, staffRow.password_hash)))
      return res.status(401).json({ error: 'Invalid credentials' });

    const staff = rowToStaff(staffRow);
    const token = jwt.sign(
      { userId: staff.id, role: 'staff', ownerId: staff.ownerId },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id:      staff.id,
        email:   staff.email,
        name:    staff.name,
        role:    'staff',
        ownerId: staff.ownerId,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email is required' });

    const user = stmtFindByEmail.get(email);
    // Always return success — never reveal whether an email exists
    if (!user) return res.json({ message: 'If this email is registered, a reset link has been sent.' });

    const token   = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600_000).toISOString(); // 1 hour

    db.prepare('UPDATE users SET reset_token=?, reset_token_expires=? WHERE id=?')
      .run(token, expires, user.id);

    const baseUrl  = process.env.APP_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl}?reset=${token}`;

    // Always log so it works even without email configured
    console.log(`🔑 Password reset for ${email}: ${resetUrl}`);

    await sendEmail({
      to: email,
      subject: 'MyLedger — Reset Your Password',
      html: `
        <div style="font-family:-apple-system,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <div style="background:#0071e3;padding:20px 24px;border-radius:12px 12px 0 0">
            <span style="color:#fff;font-size:20px;font-weight:700">MyLedger</span>
          </div>
          <div style="background:#fff;padding:24px;border:1px solid #e5e5e7;border-radius:0 0 12px 12px">
            <h2 style="color:#1d1d1f;margin:0 0 12px">Reset your password</h2>
            <p style="color:#6e6e73;font-size:14px;margin:0 0 20px">
              Click the button below to reset your password. This link expires in 1 hour.
            </p>
            <a href="${resetUrl}" style="display:inline-block;background:#0071e3;color:#fff;
              padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
              Reset Password
            </a>
            <p style="color:#aeaeb2;font-size:12px;margin:20px 0 0;border-top:1px solid #f0f0f5;padding-top:16px">
              If you didn't request this, you can safely ignore it.
            </p>
          </div>
        </div>`,
      text: `Reset your MyLedger password: ${resetUrl}\n\nThis link expires in 1 hour.`,
    });

    res.json({ message: 'If this email is registered, a reset link has been sent.' });
  } catch (err) { next(err); }
});

// GET /api/auth/me — returns fresh user data (used to sync accountant tier after admin approval)
router.get('/me', authenticate, (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ error: 'User not found' });
  const user = rowToUser(row);
  res.json({
    id: user.id, email: user.email, name: user.name, company: user.company,
    role: user.role, accountantTier: user.accountantTier || undefined,
    firmName:    user.firmName    || null,
    accentColor: user.accentColor || null,
  });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password)
      return res.status(400).json({ error: 'token and password are required' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
    if (!user)
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    if (new Date(user.reset_token_expires) < new Date())
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });

    const password_hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET password_hash=?, reset_token=NULL, reset_token_expires=NULL WHERE id=?')
      .run(password_hash, user.id);

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) { next(err); }
});

// GET /api/auth/trial-status — current trial state for the logged-in user
router.get('/trial-status', authenticate, (req, res) => {
  const row  = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!row) return res.status(404).json({ error: 'User not found' });
  const user = rowToUser(row);
  res.json(getTrialStatus(user));
});

// ── Runtime migration: add firm_logo if missing ──────────────────────────────
try {
  db.exec("ALTER TABLE users ADD COLUMN firm_logo TEXT");
} catch { /* column already exists */ }

// PUT /api/auth/profile — update firm branding (agency tier only)
router.put('/profile', authenticate, requireTier('agency'), (req, res, next) => {
  try {
    const { firmName, accentColor, firmLogo } = req.body;

    // Validate accent color: must be a valid hex or null
    if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
      return res.status(400).json({ error: 'Invalid accent color — use a 6-digit hex like #1d4ed8' });
    }

    // firmLogo: base64 data URI, max ~300KB
    if (firmLogo && firmLogo.length > 400000) {
      return res.status(400).json({ error: 'Logo too large — keep it under 300KB' });
    }

    db.prepare(`
      UPDATE users SET
        firm_name    = COALESCE(?, firm_name),
        accent_color = ?,
        firm_logo    = ?
      WHERE id = ?
    `).run(firmName || null, accentColor || null, firmLogo || null, req.userId);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    const user    = rowToUser(updated);
    res.json({
      firmName:    user.firmName,
      accentColor: user.accentColor,
      firmLogo:    user.firmLogo,
    });
  } catch (err) { next(err); }
});

export default router;
