// ─── Upgrade Request Routes ────────────────────────────────────
// POST /api/upgrade-requests                 client OR accountant submits payment notification
// GET  /api/upgrade-requests                 admin: list all (with display name) | any auth user
// PUT  /api/upgrade-requests/:id/approve     admin: approve → updates client tier OR accountant tier
// PUT  /api/upgrade-requests/:id/reject      admin: reject with reason

import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import jwt from 'jsonwebtoken';
import { db, rowToClient, getSetting } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { sendEmail } from '../email.js';

const JWT_SECRET = process.env.JWT_SECRET || 'myledger-dev-secret-change-in-prod';

const router = Router();

// ── Prepared statements ───────────────────────────────────────────────────────
const stmtClientById    = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtUserById      = db.prepare('SELECT * FROM users WHERE id = ?');
// Runtime migration: add billing_cycle to existing upgrade_requests table
try { db.exec("ALTER TABLE upgrade_requests ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly'"); } catch { /* already exists */ }

const stmtInsertUpgrade = db.prepare(`
  INSERT INTO upgrade_requests (id, client_id, user_id, target_tier, method, ref_no, amount, status, request_type, created_at, billing_cycle)
  VALUES (@id, @client_id, @user_id, @target_tier, @method, @ref_no, @amount, @status, @request_type, @created_at, @billing_cycle)
`);
const stmtAllUpgrades   = db.prepare('SELECT * FROM upgrade_requests ORDER BY created_at DESC');
const stmtMyUpgrades    = db.prepare('SELECT * FROM upgrade_requests WHERE user_id=? ORDER BY created_at DESC');
const stmtUpgradeById   = db.prepare('SELECT * FROM upgrade_requests WHERE id=?');
const stmtUpdateUpgrade = db.prepare('UPDATE upgrade_requests SET status=@status, resolved_at=@resolved_at WHERE id=@id');
const stmtRejectUpgrade = db.prepare('UPDATE upgrade_requests SET status=@status, rejected_reason=@reason, resolved_at=@resolved_at WHERE id=@id');
const stmtUpdateClientTier    = db.prepare('UPDATE clients SET subscription_tier=?, subscription_expires_at=?, billing_cycle=? WHERE id=?');
const stmtUpdateAccountantTier = db.prepare('UPDATE users SET accountant_tier=? WHERE id=?');

// ── Receipt email helpers ─────────────────────────────────────────────────────
function buildReceiptHtml({ recipientName, planLabel, planPrice, paymentMethod, refNo, amount, approvedAt, validUntil, appUrl }) {
  const dateStr = new Date(approvedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  return `
    <div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 0">
      <div style="background:#111827;padding:20px 28px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:14px">
        <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">MyLedger</span>
        <span style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Official Receipt</span>
      </div>
      <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 4px;font-size:20px;color:#111827">Thank you, ${recipientName}!</h2>
        <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Your subscription has been activated. Here is your payment acknowledgement.</p>

        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:24px">
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280;width:150px">Plan</td>
              <td style="padding:10px 0;font-weight:700;color:#0071e3">${planLabel}${planPrice ? ` — ${planPrice}` : ''}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280">Payment Method</td>
              <td style="padding:10px 0;font-weight:600;color:#111827;text-transform:uppercase">${paymentMethod}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280">Reference No.</td>
              <td style="padding:10px 0;font-weight:700;color:#111827;font-family:monospace;font-size:15px">${refNo}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280">Amount Paid</td>
              <td style="padding:10px 0;font-weight:700;color:#15803d;font-size:16px">₱${Number(amount || 0).toLocaleString()}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb">
              <td style="padding:10px 0;color:#6b7280">Date Approved</td>
              <td style="padding:10px 0;font-weight:600;color:#111827">${dateStr}</td>
            </tr>
            <tr>
              <td style="padding:10px 0;color:#6b7280">Valid Until</td>
              <td style="padding:10px 0;font-weight:700;color:#111827">${validUntil}</td>
            </tr>
          </table>
        </div>

        <a href="${appUrl}"
          style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:13px 32px;border-radius:9px;font-size:15px;font-weight:700;margin-bottom:24px">
          Go to MyLedger →
        </a>

        <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
          Please keep this email as your proof of payment.<br>
          Questions? Reply to this email or reach us at support@kaimanco.com.
        </p>
      </div>
    </div>`;
}

function buildReceiptText({ planLabel, priceHint, refNo, amount, expiresStr, appUrl }) {
  return `Thank you for your MyLedger subscription!\n\nPlan: ${planLabel}${priceHint ? ' — ' + priceHint : ''}\nReference No.: ${refNo}\nAmount Paid: ₱${Number(amount || 0).toLocaleString()}\nValid Until: ${expiresStr}\n\nOpen MyLedger: ${appUrl}\n\nQuestions? Email support@kaimanco.com`;
}
// ─────────────────────────────────────────────────────────────────────────────

function rowToUpgrade(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, userId: r.user_id,
    targetTier: r.target_tier, method: r.method,
    refNo: r.ref_no, amount: r.amount,
    status: r.status, requestType: r.request_type || 'client',
    createdAt: r.created_at,
    resolvedAt: r.resolved_at || null,
    rejectedReason: r.rejected_reason || '',
  };
}

// ── Enrich upgrade requests with display name ──────────────────────────────
function enrichUpgrade(req) {
  if (!req) return null;
  const u = stmtUserById.get(req.userId);
  if (req.requestType === 'accountant') {
    return {
      ...req,
      displayName: u?.name || u?.email || 'Unknown Accountant',
      displayEmail: u?.email || '',
      tradeName: null,
    };
  }
  // client upgrade
  const c = req.clientId ? rowToClient(stmtClientById.get(req.clientId)) : null;
  return {
    ...req,
    displayName: c?.tradeName || u?.email || 'Unknown Client',
    displayEmail: u?.email || '',
    tradeName: c?.tradeName || null,
  };
}

// POST /api/upgrade-requests
router.post('/', authenticate, (req, res, next) => {
  try {
    const { clientId, targetTier, method, refNo, amount, requestType = 'client', billingCycle = 'monthly' } = req.body;

    if (!targetTier || !method || !refNo)
      return res.status(400).json({ error: 'targetTier, method and refNo are required' });

    // Client upgrade requires clientId; accountant upgrade does not
    if (requestType === 'client') {
      if (!clientId) return res.status(400).json({ error: 'clientId is required for client upgrades' });
      const client = rowToClient(stmtClientById.get(clientId));
      if (!client || (client.ownerId !== req.userId && client.accountantId !== req.userId))
        return res.status(404).json({ error: 'Client not found' });
    }

    const id = uuid();
    stmtInsertUpgrade.run({
      id,
      client_id:     requestType === 'client' ? clientId : null,
      user_id:       req.userId,
      target_tier:   targetTier,
      method,
      ref_no:        refNo,
      amount:        Number(amount) || 0,
      status:        'pending',
      request_type:  requestType,
      created_at:    new Date().toISOString(),
      billing_cycle: billingCycle,
    });

    const upgradeRequest = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(id)));

    // ── Notify admin by email ──────────────────────────────────────────────────
    const submitter = stmtUserById.get(req.userId);
    const tierLabel = targetTier.charAt(0).toUpperCase() + targetTier.slice(1);
    const typeLabel = requestType === 'accountant' ? '🧾 Accountant' : '🏢 Client';
    const clientName = requestType === 'client' && clientId
      ? (rowToClient(stmtClientById.get(clientId))?.tradeName || '—')
      : '—';
    const prices = getSetting('accountantTierPrices') || {};
    const priceHint = prices[targetTier] ? `₱${Number(prices[targetTier]).toLocaleString()}/mo` : '';

    sendEmail({
      to: 'mym@kaimanco.com',
      subject: `💳 MyLedger Upgrade Request — ${typeLabel} → ${tierLabel} ${priceHint}`,
      html: `
        <div style="font-family:-apple-system,Arial,sans-serif;max-width:540px;margin:0 auto;padding:32px 0">
          <div style="background:#111827;padding:20px 28px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
            <span style="color:#fff;font-size:20px;font-weight:700">MyLedger</span>
            <span style="color:#C9A84C;font-size:12px;font-weight:600;letter-spacing:1px">UPGRADE REQUEST</span>
          </div>
          <div style="background:#fff;padding:28px;border:1px solid #e5e5e7;border-radius:0 0 12px 12px">
            <h2 style="margin:0 0 6px;font-size:20px;color:#111827">New Upgrade Request</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px">A payment notification has been submitted and is waiting for your approval.</p>

            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:10px 0;color:#6b7280;width:140px">Type</td>
                <td style="padding:10px 0;font-weight:600;color:#111827">${typeLabel}</td>
              </tr>
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:10px 0;color:#6b7280">Submitted by</td>
                <td style="padding:10px 0;font-weight:600;color:#111827">${submitter?.name || ''} &lt;${submitter?.email || '—'}&gt;</td>
              </tr>
              ${clientName !== '—' ? `
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:10px 0;color:#6b7280">Client</td>
                <td style="padding:10px 0;font-weight:600;color:#111827">${clientName}</td>
              </tr>` : ''}
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:10px 0;color:#6b7280">Target Plan</td>
                <td style="padding:10px 0;font-weight:700;color:#0071e3">${tierLabel} ${priceHint}</td>
              </tr>
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:10px 0;color:#6b7280">Payment Method</td>
                <td style="padding:10px 0;font-weight:600;color:#111827;text-transform:uppercase">${method}</td>
              </tr>
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:10px 0;color:#6b7280">Reference No.</td>
                <td style="padding:10px 0;font-weight:700;color:#111827;font-family:monospace;font-size:15px">${refNo}</td>
              </tr>
              <tr>
                <td style="padding:10px 0;color:#6b7280">Amount Declared</td>
                <td style="padding:10px 0;font-weight:700;color:#15803d;font-size:16px">₱${Number(amount || 0).toLocaleString()}</td>
              </tr>
            </table>

            <a href="https://app.kaimanco.com/admin"
              style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 28px;border-radius:9px;font-size:14px;font-weight:700">
              Review in Admin Console →
            </a>

            <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">
              Verify the payment via ${method.toUpperCase()} before approving. Reference: <strong>${refNo}</strong>
            </p>
          </div>
        </div>`,
      text: `New MyLedger Upgrade Request\n\nType: ${typeLabel}\nSubmitted by: ${submitter?.email}\nClient: ${clientName}\nTarget Plan: ${tierLabel} ${priceHint}\nPayment: ${method.toUpperCase()} — Ref: ${refNo}\nAmount: ₱${Number(amount || 0).toLocaleString()}\n\nReview at: https://app.kaimanco.com/admin`,
    }).catch(e => console.error('Upgrade notify email failed:', e.message));
    // ──────────────────────────────────────────────────────────────────────────

    res.status(201).json({ upgradeRequest });
  } catch (err) { next(err); }
});

// GET /api/upgrade-requests — optional auth: admin gets all, authed user gets own, no token gets []
router.get('/', (req, res, next) => {
  try {
    let userId = null;
    let isAdmin = false;
    const auth  = req.headers['authorization'];
    const token = auth && auth.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId  = decoded.userId;
        const userRow = stmtUserById.get(userId);
        isAdmin = userRow?.role === 'admin';
      } catch { /* expired / invalid — treat as unauthenticated, return [] */ }
    }

    const rows     = isAdmin ? stmtAllUpgrades.all() : (userId ? stmtMyUpgrades.all(userId) : []);
    const requests = rows.map(r => enrichUpgrade(rowToUpgrade(r))).filter(Boolean);
    res.json({ upgradeRequests: requests, count: requests.length });
  } catch (err) { next(err); }
});

// PUT /api/upgrade-requests/:id/approve
router.put('/:id/approve', authenticate, (req, res, next) => {
  try {
    const r = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    if (!r) return res.status(404).json({ error: 'Request not found' });

    const resolvedAt = new Date().toISOString();

    const appUrl   = process.env.APP_URL || 'https://app.kaimanco.com';
    const tierLabel = r.targetTier.charAt(0).toUpperCase() + r.targetTier.slice(1);

    if (r.requestType === 'accountant') {
      // Update the accountant's tier on the users table
      stmtUpdateAccountantTier.run(r.targetTier, r.userId);
      stmtUpdateUpgrade.run({ id: req.params.id, status: 'approved', resolved_at: resolvedAt });

      const updated = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(req.params.id)));
      const user    = stmtUserById.get(r.userId);

      // ── Receipt email → accountant ────────────────────────────────────────
      if (user?.email) {
        const prices     = getSetting('accountantTierPrices') || {};
        const priceHint  = prices[r.targetTier] ? `₱${Number(prices[r.targetTier]).toLocaleString()}/mo` : '';
        const daysValid  = (r.billing_cycle || r.billingCycle) === 'annual' ? 365 : 30;
        const expiresAt  = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);
        const expiresStr = expiresAt.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
        sendEmail({
          to: user.email,
          subject: `MyLedger — ${tierLabel} Plan Activated ✅`,
          html: buildReceiptHtml({
            recipientName : user.name || user.email,
            planLabel     : `${tierLabel} (Accountant)`,
            planPrice     : priceHint,
            paymentMethod : r.method,
            refNo         : r.refNo,
            amount        : r.amount,
            approvedAt    : resolvedAt,
            validUntil    : expiresStr,
            appUrl,
          }),
          text: buildReceiptText({ planLabel: `${tierLabel} Accountant Plan`, priceHint, refNo: r.refNo, amount: r.amount, expiresStr, appUrl }),
        }).catch(e => console.error('Accountant receipt email failed:', e.message));
      }
      // ─────────────────────────────────────────────────────────────────────

      return res.json({ upgradeRequest: updated, user });
    }

    // Client upgrade
    const clientBillingCycle = (r.billing_cycle || r.billingCycle || 'monthly');
    const clientDays = clientBillingCycle === 'annual' ? 365 : 30;
    const expiresAt = new Date(Date.now() + clientDays * 24 * 60 * 60 * 1000).toISOString();
    stmtUpdateUpgrade.run({ id: req.params.id, status: 'approved', resolved_at: resolvedAt });
    stmtUpdateClientTier.run(r.targetTier, expiresAt, clientBillingCycle, r.clientId);

    // ── Referral commission on subscription payment ──────────────────────────
    const submitter  = stmtUserById.get(r.userId);
    const referrerId = submitter?.referred_by;
    if (referrerId && r.amount > 0) {
      const pct        = getSetting('referral')?.subscriptionPercent ?? 10;
      const commission = Math.round(r.amount * pct) / 100;
      db.prepare('UPDATE users SET referral_balance = referral_balance + ? WHERE id = ?')
        .run(commission, referrerId);
      db.prepare(`
        INSERT INTO referrals (id, referrer_id, referee_id, referee_email, status, reward_amount, created_at)
        VALUES (?, ?, ?, ?, 'credited', ?, ?)
      `).run(
        `${r.id}-comm`, referrerId, submitter.id, submitter.email, commission, resolvedAt
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Receipt email → client subscriber ────────────────────────────────────
    if (submitter?.email) {
      const clientObj  = rowToClient(stmtClientById.get(r.clientId));
      const expiresStr = new Date(expiresAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
      sendEmail({
        to: submitter.email,
        subject: `MyLedger — ${tierLabel} Plan Activated ✅`,
        html: buildReceiptHtml({
          recipientName : submitter.name || submitter.email,
          planLabel     : `${tierLabel} (${clientObj?.tradeName || 'Client'})`,
          planPrice     : r.amount ? `₱${Number(r.amount).toLocaleString()}` : '',
          paymentMethod : r.method,
          refNo         : r.refNo,
          amount        : r.amount,
          approvedAt    : resolvedAt,
          validUntil    : expiresStr,
          appUrl,
        }),
        text: buildReceiptText({ planLabel: `${tierLabel} Client Plan`, priceHint: r.amount ? `₱${Number(r.amount).toLocaleString()}` : '', refNo: r.refNo, amount: r.amount, expiresStr, appUrl }),
      }).catch(e => console.error('Client receipt email failed:', e.message));
    }
    // ─────────────────────────────────────────────────────────────────────────

    const updated = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(req.params.id)));
    const client  = rowToClient(stmtClientById.get(r.clientId));
    res.json({ upgradeRequest: updated, client });
  } catch (err) { next(err); }
});

// PUT /api/upgrade-requests/:id/reject
router.put('/:id/reject', authenticate, (req, res, next) => {
  try {
    const r = rowToUpgrade(stmtUpgradeById.get(req.params.id));
    if (!r) return res.status(404).json({ error: 'Request not found' });

    const resolvedAt = new Date().toISOString();
    stmtRejectUpgrade.run({ id: req.params.id, status: 'rejected', reason: req.body.reason || '', resolved_at: resolvedAt });

    const updated = enrichUpgrade(rowToUpgrade(stmtUpgradeById.get(req.params.id)));
    res.json({ upgradeRequest: updated });
  } catch (err) { next(err); }
});

export default router;
