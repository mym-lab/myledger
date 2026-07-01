// ─── Payments Routes ──────────────────────────────────────────────────────────
// POST /api/payments/paymongo/create-link   Create PayMongo payment link
// POST /api/payments/paymongo/webhook       PayMongo webhook (raw body — no JSON middleware)
// GET  /api/payments/paymongo/status/:id    Poll link payment status
//
// PayMongo is the primary payment processor (supports GCash, Maya, credit/debit cards).
// On successful payment, the webhook automatically upgrades the user's tier —
// the same logic used by the manual upgrade-request approval flow.
//
// Environment variables required:
//   PAYMONGO_SECRET_KEY   — from PayMongo Dashboard → Developers → API Keys (live_sk_...)
//   PAYMONGO_WEBHOOK_SECRET — from PayMongo Dashboard → Webhooks (whsk_...)
//   APP_URL               — e.g. https://app.kaimanco.com

import { Router }      from 'express';
import { createHmac }  from 'crypto';
import { v4 as uuid }  from 'uuid';
import express         from 'express';
import { db, rowToClient, getSetting } from '../db.js';
import { authenticate }  from '../middleware/auth.js';
import { sendEmail }     from '../email.js';

const router = Router();

const PAYMONGO_BASE  = 'https://api.paymongo.com/v1';
const TIER_PRICES_CLIENT = {
  free:         0,
  starter:      299,
  professional: 799,
  enterprise:   1999,
};
const TIER_PRICES_ACCT = {
  free:         0,
  solo:         599,
  professional: 1499,
  firm:         2999,
  agency:       4999,
};

// ── PayMongo API helper ───────────────────────────────────────────────────────
async function paymongoRequest(method, path, body) {
  const key = process.env.PAYMONGO_SECRET_KEY;
  if (!key) throw new Error('PAYMONGO_SECRET_KEY is not set');

  const res = await fetch(`${PAYMONGO_BASE}${path}`, {
    method,
    headers: {
      'Authorization': 'Basic ' + Buffer.from(key + ':').toString('base64'),
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = data?.errors?.[0]?.detail || data?.error || `PayMongo error ${res.status}`;
    throw new Error(detail);
  }
  return data;
}

// ── Receipt email (reused from upgrade-requests.js logic) ────────────────────
const stmtUserById   = db.prepare('SELECT * FROM users WHERE id = ?');
const stmtClientById = db.prepare('SELECT * FROM clients WHERE id = ?');
const stmtUpdateClientTier    = db.prepare('UPDATE clients SET subscription_tier=?, subscription_expires_at=? WHERE id=?');
const stmtUpdateAccountantTier = db.prepare('UPDATE users SET accountant_tier=? WHERE id=?');

function buildReceiptHtml({ recipientName, planLabel, planPrice, paymentMethod, refNo, amount, approvedAt, validUntil, appUrl }) {
  const dateStr = new Date(approvedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  return `<div style="font-family:-apple-system,Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 0">
    <div style="background:#111827;padding:20px 28px;border-radius:12px 12px 0 0">
      <span style="color:#fff;font-size:22px;font-weight:700">MyLedger</span>
      <span style="color:#C9A84C;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;margin-left:12px">Payment Receipt</span>
    </div>
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 4px;font-size:20px;color:#111827">Thank you, ${recipientName}!</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:14px">Your payment was received and your subscription is now active.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 0;color:#6b7280;width:150px">Plan</td><td style="padding:10px 0;font-weight:700;color:#0071e3">${planLabel}${planPrice ? ` — ${planPrice}` : ''}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 0;color:#6b7280">Payment Method</td><td style="padding:10px 0;font-weight:600;text-transform:uppercase">${paymentMethod}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 0;color:#6b7280">Reference</td><td style="padding:10px 0;font-weight:700;font-family:monospace">${refNo}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 0;color:#6b7280">Amount</td><td style="padding:10px 0;font-weight:700;color:#15803d;font-size:16px">₱${Number(amount||0).toLocaleString()}</td></tr>
        <tr style="border-bottom:1px solid #e5e7eb"><td style="padding:10px 0;color:#6b7280">Date</td><td style="padding:10px 0;font-weight:600">${dateStr}</td></tr>
        <tr><td style="padding:10px 0;color:#6b7280">Valid Until</td><td style="padding:10px 0;font-weight:700">${validUntil}</td></tr>
      </table>
      <a href="${appUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:13px 32px;border-radius:9px;font-size:15px;font-weight:700">Go to MyLedger →</a>
    </div>
  </div>`;
}

// ── Apply tier upgrade (called by webhook) ────────────────────────────────────
function applyUpgrade({ userId, clientId, targetTier, requestType, amount, refNo, paymentMethod }) {
  const resolvedAt = new Date().toISOString();
  const expiresAt  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const appUrl     = process.env.APP_URL || 'https://app.kaimanco.com';
  const tierLabel  = targetTier.charAt(0).toUpperCase() + targetTier.slice(1);
  const user       = stmtUserById.get(userId);

  if (requestType === 'accountant') {
    stmtUpdateAccountantTier.run(targetTier, userId);
    const prices    = getSetting('accountantTierPrices') || {};
    const priceStr  = prices[targetTier] ? `₱${Number(prices[targetTier]).toLocaleString()}/mo` : '';
    const expiresStr = new Date(expiresAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
    if (user?.email) {
      sendEmail({
        to:   user.email,
        subject: `MyLedger — ${tierLabel} Plan Activated ✅`,
        html: buildReceiptHtml({ recipientName: user.name || user.email, planLabel: `${tierLabel} (Accountant)`,
          planPrice: priceStr, paymentMethod, refNo, amount, approvedAt: resolvedAt, validUntil: expiresStr, appUrl }),
        text: `Thank you! Your ${tierLabel} Accountant plan is now active until ${expiresStr}. Ref: ${refNo}`,
      }).catch(() => {});
    }
    return;
  }

  // Client upgrade
  stmtUpdateClientTier.run(targetTier, expiresAt, clientId);

  // Referral commission
  const referrerId = user?.referred_by;
  if (referrerId && amount > 0) {
    const pct        = getSetting('referral')?.subscriptionPercent ?? 10;
    const commission = Math.round(amount * pct) / 100;
    db.prepare('UPDATE users SET referral_balance = referral_balance + ? WHERE id = ?').run(commission, referrerId);
    db.prepare(`INSERT INTO referrals (id, referrer_id, referee_id, referee_email, status, reward_amount, created_at)
      VALUES (?, ?, ?, ?, 'credited', ?, ?)`).run(
      uuid(), referrerId, userId, user?.email || '', commission, resolvedAt
    );
  }

  const clientObj  = clientId ? rowToClient(stmtClientById.get(clientId)) : null;
  const expiresStr = new Date(expiresAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });
  if (user?.email) {
    sendEmail({
      to:      user.email,
      subject: `MyLedger — ${tierLabel} Plan Activated ✅`,
      html:    buildReceiptHtml({ recipientName: user.name || user.email,
        planLabel: `${tierLabel} (${clientObj?.tradeName || 'Client'})`,
        planPrice: amount ? `₱${Number(amount).toLocaleString()}` : '',
        paymentMethod, refNo, amount, approvedAt: resolvedAt, validUntil: expiresStr, appUrl }),
      text: `Thank you! Your ${tierLabel} plan is now active until ${expiresStr}. Ref: ${refNo}`,
    }).catch(() => {});
  }
}

// ── Store pending payment link ─────────────────────────────────────────────────
// We store the metadata (userId, tier, etc.) alongside the PayMongo link ID
// so the webhook can look it up when payment arrives.
try {
  db.exec(`CREATE TABLE IF NOT EXISTS paymongo_links (
    id            TEXT PRIMARY KEY,      -- PayMongo link ID (link_...)
    user_id       TEXT NOT NULL,
    client_id     TEXT,
    target_tier   TEXT NOT NULL,
    request_type  TEXT NOT NULL DEFAULT 'client',
    amount        REAL NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    checkout_url  TEXT,
    created_at    TEXT NOT NULL
  )`);
} catch { /* already exists */ }

const stmtInsertLink  = db.prepare(`INSERT INTO paymongo_links VALUES (@id,@userId,@clientId,@targetTier,@requestType,@amount,@status,@checkoutUrl,@createdAt)`);
const stmtGetLink     = db.prepare('SELECT * FROM paymongo_links WHERE id=?');
const stmtMarkPaid    = db.prepare('UPDATE paymongo_links SET status=? WHERE id=?');

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/paymongo/create-link
// Creates a PayMongo payment link and returns checkout_url
// Body: { clientId, targetTier, requestType ('client'|'accountant') }
// ══════════════════════════════════════════════════════════════════════════════
router.post('/paymongo/create-link', authenticate, async (req, res, next) => {
  try {
    const { clientId, targetTier, requestType = 'client' } = req.body;
    if (!targetTier) return res.status(400).json({ error: 'targetTier required' });

    // Determine amount
    const prices    = requestType === 'accountant' ? TIER_PRICES_ACCT : TIER_PRICES_CLIENT;
    const adminPrices = getSetting('accountantTierPrices') || {};
    const priceFromAdmin = adminPrices[targetTier];
    const amountPHP = priceFromAdmin ? Number(priceFromAdmin) : (prices[targetTier] || 0);
    if (amountPHP <= 0) return res.status(400).json({ error: 'Free tier has no payment' });

    const tierLabel  = targetTier.charAt(0).toUpperCase() + targetTier.slice(1);
    const typeLabel  = requestType === 'accountant' ? 'Accountant' : 'Client';
    const appUrl     = process.env.APP_URL || 'https://app.kaimanco.com';

    const linkData = await paymongoRequest('POST', '/links', {
      data: {
        attributes: {
          amount:      amountPHP * 100,   // centavos
          description: `MyLedger ${tierLabel} ${typeLabel} Plan — 1 month`,
          remarks:     JSON.stringify({
            userId:      req.userId,
            clientId:    clientId || null,
            targetTier,
            requestType,
          }),
          redirect: {
            success: `${appUrl}/?payment=success&tier=${targetTier}`,
            failed:  `${appUrl}/?payment=failed`,
          },
        },
      },
    });

    const linkId      = linkData.data.id;
    const checkoutUrl = linkData.data.attributes.checkout_url;

    // Persist so webhook can retrieve metadata
    stmtInsertLink.run({
      id:          linkId,
      userId:      req.userId,
      clientId:    clientId || null,
      targetTier,
      requestType,
      amount:      amountPHP,
      status:      'pending',
      checkoutUrl,
      createdAt:   new Date().toISOString(),
    });

    res.json({ linkId, checkoutUrl, amount: amountPHP });
  } catch (err) { next(err); }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/paymongo/webhook
// Receives PayMongo webhook events. Must be raw body for HMAC verification.
// Register in PayMongo Dashboard → Webhooks:
//   URL: https://app.kaimanco.com/api/payments/paymongo/webhook
//   Events: link.payment.paid, checkout_session.payment.paid
// ══════════════════════════════════════════════════════════════════════════════
router.post(
  '/paymongo/webhook',
  express.raw({ type: '*/*' }),        // raw body for signature check
  (req, res, next) => {
    try {
      const sigHeader = req.headers['paymongo-signature'];
      const secret    = process.env.PAYMONGO_WEBHOOK_SECRET;

      // ── Verify HMAC signature ─────────────────────────────────────────────
      if (secret && sigHeader) {
        // Format: "t=timestamp,te=...,li=..."
        const parts      = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')));
        const timestamp  = parts.t;
        const expectedSig = createHmac('sha256', secret)
          .update(`${timestamp}.${req.body}`)
          .digest('hex');
        const receivedSig = parts.li || parts.te || '';
        if (expectedSig !== receivedSig) {
          console.warn('PayMongo webhook signature mismatch');
          return res.status(400).json({ error: 'Invalid signature' });
        }
      } else if (process.env.NODE_ENV === 'production' && secret) {
        // In prod, require valid signature if secret is configured
        return res.status(400).json({ error: 'Missing signature' });
      }

      const event = JSON.parse(req.body.toString());
      const type  = event?.data?.attributes?.type;
      const data  = event?.data?.attributes?.data;

      // ── Handle paid events ────────────────────────────────────────────────
      if (type === 'link.payment.paid' || type === 'checkout_session.payment.paid') {
        // Retrieve link ID from the payment's metadata or payment intent
        const linkId = data?.attributes?.links?.[0]?.id
                    || event?.data?.attributes?.payment_intent_id
                    || data?.id;

        const paymentId = data?.id || 'unknown';
        const paidAmount = ((data?.attributes?.amount || 0) / 100);
        const payMethod  = data?.attributes?.source?.type || 'paymongo';

        // Look up our stored link record
        const linkRow = linkId ? stmtGetLink.get(linkId) : null;
        if (!linkRow) {
          // Try to parse remarks from the payment's description
          console.warn('PayMongo webhook: link not found for', linkId, '— check remarks');
          return res.json({ received: true, note: 'Link record not found; no action taken.' });
        }

        if (linkRow.status === 'paid') {
          return res.json({ received: true, note: 'Already processed' });
        }

        // Apply the upgrade
        applyUpgrade({
          userId:      linkRow.user_id,
          clientId:    linkRow.client_id,
          targetTier:  linkRow.target_tier,
          requestType: linkRow.request_type,
          amount:      paidAmount || linkRow.amount,
          refNo:       paymentId,
          paymentMethod: payMethod,
        });

        stmtMarkPaid.run('paid', linkRow.id);

        // Also notify admin
        const user = stmtUserById.get(linkRow.user_id);
        sendEmail({
          to:      'mym@kaimanco.com',
          subject: `💳 PayMongo Payment Confirmed — ${linkRow.request_type} → ${linkRow.target_tier}`,
          html:    `<p>Auto-upgrade processed:<br>User: ${user?.email}<br>Tier: ${linkRow.target_tier}<br>Amount: ₱${paidAmount.toLocaleString()}<br>Ref: ${paymentId}</p>`,
          text:    `Auto-upgrade: ${user?.email} → ${linkRow.target_tier} ₱${paidAmount} Ref: ${paymentId}`,
        }).catch(() => {});
      }

      res.json({ received: true });
    } catch (err) {
      console.error('Webhook error:', err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/payments/paymongo/status/:linkId
// Poll to check if a PayMongo link has been paid (for client-side polling)
// ══════════════════════════════════════════════════════════════════════════════
router.get('/paymongo/status/:linkId', authenticate, async (req, res, next) => {
  try {
    const linkId  = req.params.linkId;
    const linkRow = stmtGetLink.get(linkId);
    if (!linkRow || linkRow.user_id !== req.userId)
      return res.status(404).json({ error: 'Link not found' });

    // Also check live status from PayMongo in case webhook was missed
    if (linkRow.status !== 'paid') {
      try {
        const live = await paymongoRequest('GET', `/links/${linkId}`);
        const liveStatus = live?.data?.attributes?.status;
        if (liveStatus === 'paid' && linkRow.status === 'pending') {
          // Payment came through but webhook missed — apply now
          const paidAmount = (live.data.attributes.amount || 0) / 100;
          applyUpgrade({
            userId:      linkRow.user_id,
            clientId:    linkRow.client_id,
            targetTier:  linkRow.target_tier,
            requestType: linkRow.request_type,
            amount:      paidAmount,
            refNo:       linkId,
            paymentMethod: 'paymongo',
          });
          stmtMarkPaid.run('paid', linkId);
          return res.json({ status: 'paid', tier: linkRow.target_tier });
        }
        return res.json({ status: liveStatus || linkRow.status });
      } catch {
        return res.json({ status: linkRow.status });
      }
    }

    res.json({ status: linkRow.status, tier: linkRow.target_tier });
  } catch (err) { next(err); }
});

// ── Legacy endpoints (kept for backward compatibility) ────────────────────────
router.get('/subscription/user/:userId', authenticate, (req, res) => {
  try {
    const userId = req.params.userId;
    if (userId !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    const user = stmtUserById.get(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      plan: user.accountant_tier || 'free',
      status: 'active',
      userId: user.id,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
