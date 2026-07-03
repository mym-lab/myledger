// ─── Tier Guard Middleware ────────────────────────────────────────────────────
// Enforces plan-based access on premium routes.
//
// During active 30-day trial  → always allowed (full professional access).
// After trial / no trial      → checks accountant_tier against required tier.
//
// Accountant tier hierarchy (low → high):
//   free < solo < professional < firm < agency
//
// Client subscription tier hierarchy:
//   free < starter < professional < enterprise
//
// Usage:
//   router.get('/premium-route', authenticate, requireTier('solo'), handler)
//   router.get('/firm-only',     authenticate, requireTier('firm'), handler)

import { db, rowToUser } from '../db.js';
import { getTrialStatus } from '../lib/trial.js';

const ACCOUNTANT_TIER_RANK = {
  free:         0,
  solo:         1,
  professional: 2,
  firm:         3,
  agency:       4,
};

const CLIENT_TIER_RANK = {
  free:         0,
  starter:      1,
  professional: 2,
  enterprise:   3,
};

/**
 * Returns true if the user's effective tier meets the minimum required.
 * During an active trial the effective tier is always 'professional'.
 */
export function userMeetsTier(user, minTier) {
  const trial = getTrialStatus(user);

  if (trial.isTrialActive) {
    // Trial counts as 'professional' for accountants, 'professional' for clients
    const trialRank = ACCOUNTANT_TIER_RANK[trial.trialTier] ??
                      CLIENT_TIER_RANK[trial.trialTier] ?? 2;
    const reqRank   = ACCOUNTANT_TIER_RANK[minTier] ??
                      CLIENT_TIER_RANK[minTier] ?? 99;
    return trialRank >= reqRank;
  }

  // Post-trial: use actual stored tier
  if (user.role === 'accountant') {
    const userRank = ACCOUNTANT_TIER_RANK[user.accountantTier] ?? 0;
    const reqRank  = ACCOUNTANT_TIER_RANK[minTier] ?? 99;
    return userRank >= reqRank;
  }

  // client / encoder: check accountant_tier (encoder inherits from accountant)
  // For client-owned records, subscription_tier is on the client record, not user —
  // so client-side gating happens in the route handler or frontend.
  // This guard is primarily used for accountant-role routes.
  const userRank = ACCOUNTANT_TIER_RANK[user.accountantTier] ??
                   CLIENT_TIER_RANK[user.accountantTier] ?? 0;
  const reqRank  = ACCOUNTANT_TIER_RANK[minTier] ??
                   CLIENT_TIER_RANK[minTier] ?? 99;
  return userRank >= reqRank;
}

/**
 * Express middleware factory.
 * @param {string} minTier  — minimum tier required ('solo'|'professional'|'firm'|'agency')
 * @param {object} options
 *   @param {string[]} options.exemptRoles — roles that bypass the check (default: ['admin'])
 */
export function requireTier(minTier, { exemptRoles = ['admin'] } = {}) {
  return (req, res, next) => {
    if (!req.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admins always pass
    if (exemptRoles.includes(req.userRole)) return next();

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!row) return res.status(401).json({ error: 'User not found' });

    const user = rowToUser(row);

    if (userMeetsTier(user, minTier)) return next();

    // Determine friendly upgrade message
    const trial     = getTrialStatus(user);
    const tierLabel = {
      solo:         'Solo (₱599/mo)',
      professional: 'Professional (₱1,499/mo)',
      firm:         'Firm (₱2,999/mo)',
      agency:       'Agency (₱4,999/mo)',
    }[minTier] || minTier;

    const message = trial.isExpired
      ? `Your free trial has ended. Upgrade to ${tierLabel} or above to access this feature.`
      : `This feature requires the ${tierLabel} plan or above.`;

    return res.status(403).json({
      error:       'plan_required',
      message,
      requiredTier: minTier,
      currentTier:  user.accountantTier || 'free',
      trialExpired: trial.isExpired,
      upgradeEmail: 'mym@kaimanco.com',
    });
  };
}

/**
 * Middleware that checks if a user is within their client limit.
 * Free tier: max 1 client. Solo: 5. Professional: 15. Firm/Agency: unlimited.
 * Only enforced during client creation (POST /api/clients).
 */
export function requireClientSlot() {
  return (req, res, next) => {
    if (!req.userId) return next();
    if (req.userRole === 'admin') return next();

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!row) return next();

    const user  = rowToUser(row);
    const trial = getTrialStatus(user);

    // During trial: professional allows 15 clients
    const effectiveTier = trial.isTrialActive ? (trial.trialTier || 'professional')
                                               : (user.accountantTier || 'free');

    const CLIENT_LIMITS = {
      free:         1,
      solo:         5,
      professional: 15,
      firm:         Infinity,
      agency:       Infinity,
    };

    const limit = CLIENT_LIMITS[effectiveTier] ?? 1;
    if (limit === Infinity) return next();

    // Count existing clients owned by this accountant
    const { count } = db.prepare(
      "SELECT COUNT(*) as count FROM clients WHERE owner_id = ?"
    ).get(req.userId);

    if (count >= limit) {
      const trial_ = getTrialStatus(user);
      const message = trial_.isExpired
        ? `Your trial ended. Free plan allows 1 client. Upgrade to add more.`
        : `Your ${effectiveTier} plan allows up to ${limit} client${limit === 1 ? '' : 's'}. You have ${count}.`;

      return res.status(403).json({
        error:        'client_limit_reached',
        message,
        limit,
        current:      count,
        requiredTier: 'solo',
        upgradeEmail: 'mym@kaimanco.com',
      });
    }

    next();
  };
}
