// ─── Referral Program Routes ───────────────────────────────────────────────────
// GET  /api/referrals/me          get my referral code + stats + balance
// GET  /api/referrals/list        admin: list all referrals
// POST /api/referrals/credit/:id  admin: approve and credit a referral

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, rowToUser } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Inline admin guard (this codebase has no requireRole helper)
function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// Generate a short unique referral code from user id + name
function makeCode(user) {
  const name = (user.name || user.email || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5);
  const suffix = user.id.replace(/-/g, '').slice(0, 5).toUpperCase();
  return `KM-${name}-${suffix}`;
}

// GET /api/referrals/me
router.get('/me', (req, res, next) => {
  try {
    const user = rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId));
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Auto-generate referral code if not set
    if (!user.referralCode) {
      const code = makeCode(user);
      db.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(code, user.id);
      user.referralCode = code;
    }

    const appUrl = process.env.APP_URL || 'https://app.kaimanco.com';
    const referralLink = `${appUrl}?ref=${user.referralCode}`;

    const referrals = db.prepare(
      'SELECT * FROM referrals WHERE referrer_id = ? ORDER BY created_at DESC'
    ).all(req.userId);

    const stats = {
      total:    referrals.length,
      pending:  referrals.filter(r => r.status === 'pending').length,
      credited: referrals.filter(r => r.status === 'credited').length,
      balance:  user.referralBalance || 0,
    };

    res.json({
      referralCode: user.referralCode,
      referralLink,
      stats,
      referrals: referrals.map(r => ({
        id: r.id, refereeEmail: r.referee_email,
        status: r.status, rewardAmount: r.reward_amount,
        creditedAt: r.credited_at, createdAt: r.created_at,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/referrals/list  (admin only)
router.get('/list', requireAdmin, (req, res, next) => {
  try {
    const rows = db.prepare(`
      SELECT r.*, u.email as referrer_email, u.name as referrer_name
      FROM referrals r
      LEFT JOIN users u ON u.id = r.referrer_id
      ORDER BY r.created_at DESC
    `).all();

    res.json({ referrals: rows.map(r => ({
      id: r.id,
      referrerId: r.referrer_id,
      referrerEmail: r.referrer_email,
      referrerName: r.referrer_name,
      refereeEmail: r.referee_email,
      status: r.status,
      rewardAmount: r.reward_amount,
      creditedAt: r.credited_at,
      createdAt: r.created_at,
    }))});
  } catch (err) { next(err); }
});

// POST /api/referrals/credit/:id  (admin only)
router.post('/credit/:id', requireAdmin, (req, res, next) => {
  try {
    const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
    if (!referral) return res.status(404).json({ error: 'Referral not found' });
    if (referral.status === 'credited') return res.status(400).json({ error: 'Already credited' });

    const now = new Date().toISOString();
    db.prepare("UPDATE referrals SET status='credited', credited_at=? WHERE id=?").run(now, referral.id);

    // Add to referrer's balance
    db.prepare('UPDATE users SET referral_balance = referral_balance + ? WHERE id = ?')
      .run(referral.reward_amount, referral.referrer_id);

    res.json({ message: `Referral credited. ₱${referral.reward_amount} added to referrer's balance.` });
  } catch (err) { next(err); }
});

// Internal helper: record a referral when someone signs up with a ref code
export function recordReferral(refereeId, refereeEmail, refCode) {
  if (!refCode) return;
  const referrer = db.prepare('SELECT id FROM users WHERE referral_code = ?').get(refCode);
  if (!referrer || referrer.id === refereeId) return;

  // Don't duplicate
  const existing = db.prepare('SELECT id FROM referrals WHERE referrer_id=? AND referee_email=?')
    .get(referrer.id, refereeEmail);
  if (existing) return;

  db.prepare(`
    INSERT INTO referrals (id, referrer_id, referee_id, referee_email, status, reward_amount, created_at)
    VALUES (?, ?, ?, ?, 'pending', 200, ?)
  `).run(uuidv4(), referrer.id, refereeId, refereeEmail, new Date().toISOString());
}

export default router;
