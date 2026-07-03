// ─── Trial System Helpers ─────────────────────────────────────────────────────
// Every new user gets a 30-day trial at 'professional' tier.
// After trial ends, accountants revert to their accountant_tier (default: free).
// Clients revert to client's subscription_tier (default: free).

export const TRIAL_DAYS = 30;

/**
 * Compute trial status from a rowToUser() result.
 * @param {object} user  — result of rowToUser()
 * @returns {{ isTrialActive, trialTier, daysRemaining, daysElapsed, trialEndsAt, isExpired }}
 */
export function getTrialStatus(user) {
  if (!user?.trialStartedAt) {
    // Legacy user with no trial — treat as expired so no banner shows
    return {
      isTrialActive: false,
      trialTier:     user?.accountantTier || 'free',
      daysRemaining: 0,
      daysElapsed:   TRIAL_DAYS,
      trialEndsAt:   null,
      isExpired:     true,
    };
  }

  const trialStart = new Date(user.trialStartedAt);
  const trialEnd   = new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const now        = new Date();
  const msRemaining  = trialEnd - now;
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  const daysElapsed   = Math.floor((now - trialStart) / (24 * 60 * 60 * 1000));
  const isTrialActive = now < trialEnd;

  return {
    isTrialActive,
    trialTier:     user.trialTier || 'professional',
    daysRemaining,
    daysElapsed,
    trialEndsAt:   trialEnd.toISOString(),
    isExpired:     !isTrialActive,
  };
}

/**
 * Which drip email day milestones exist and when to send them.
 * Keyed by trial day number (sends when daysElapsed >= day and not yet sent).
 */
export const DRIP_MILESTONES = [3, 7, 14, 29];
