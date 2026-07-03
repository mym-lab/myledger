// ─── useTierAccess ────────────────────────────────────────────────────────────
// Hook that computes whether the current user can access each premium feature.
// During active trial → all features unlocked.
// After trial on free → features locked with upgrade prompt.
//
// Usage:
//   const { hasAccess, trialStatus, isTrialActive } = useTierAccess();
//   <FeatureLock locked={!hasAccess('bir_returns')} ...>

import { useState, useEffect } from 'react';

const ACCOUNTANT_TIER_RANK = {
  free: 0, solo: 1, professional: 2, firm: 3, agency: 4,
};

// Which tier each feature requires
const FEATURE_TIERS = {
  // Accountant features
  bir_returns:       'solo',
  ebir_xml:          'solo',
  cash_flow_forecast:'solo',
  encoder_delegation:'solo',
  bir_calendar:      'solo',
  global_search:     'professional',
  audit_log:         'professional',
  income_compare:    'professional',
  firm_branding:     'agency',
  // Client features (checked against client subscription_tier via API)
  invoicing:         'starter_client',
  client_forecast:   'professional_client',
};

const CLIENT_TIER_RANK = {
  free: 0, starter: 1, professional: 2, enterprise: 3,
};

const TRIAL_DAYS = 30;

function computeTrialStatus(trialData) {
  if (!trialData?.trialStartedAt) return { isTrialActive: false, isExpired: true, daysRemaining: 0 };
  return trialData;
}

export function useTierAccess() {
  const [trialStatus, setTrialStatus] = useState(null);
  const [accountantTier, setAccountantTier] = useState('free');
  const [clientSubTier, setClientSubTier] = useState('free'); // for client role

  useEffect(() => {
    const token = localStorage.getItem('ml_token');
    if (!token) return;

    // Fetch trial status
    fetch('/api/auth/trial-status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTrialStatus(data); })
      .catch(() => {});

    // Get tier from stored user (fast, no network)
    try {
      const stored = JSON.parse(localStorage.getItem('ml_user') || 'null');
      if (stored?.accountantTier) setAccountantTier(stored.accountantTier);
    } catch { /* ignore */ }
  }, []);

  const isTrialActive = trialStatus?.isTrialActive ?? false;
  const isTrialExpired = trialStatus?.isExpired ?? false;
  const daysRemaining = trialStatus?.daysRemaining ?? 0;

  /**
   * Returns true if the user can access the given feature right now.
   * During active trial → always true.
   * After trial / no trial → checks actual tier.
   */
  function hasAccess(feature) {
    // Always allow during trial
    if (isTrialActive) return true;

    const minTier = FEATURE_TIERS[feature];
    if (!minTier) return true; // unknown feature → allow

    // Client-specific tiers
    if (minTier === 'starter_client') {
      return CLIENT_TIER_RANK[clientSubTier] >= CLIENT_TIER_RANK['starter'];
    }
    if (minTier === 'professional_client') {
      return CLIENT_TIER_RANK[clientSubTier] >= CLIENT_TIER_RANK['professional'];
    }

    // Accountant tier check
    const userRank = ACCOUNTANT_TIER_RANK[accountantTier] ?? 0;
    const reqRank  = ACCOUNTANT_TIER_RANK[minTier] ?? 99;
    return userRank >= reqRank;
  }

  /**
   * Returns the minimum plan name needed for a feature.
   */
  function planNeeded(feature) {
    const minTier = FEATURE_TIERS[feature];
    const labels = {
      solo:         'Solo (₱599/mo)',
      professional: 'Professional (₱1,499/mo)',
      firm:         'Firm (₱2,999/mo)',
      agency:       'Agency (₱4,999/mo)',
      starter_client:      'Starter (₱399/mo)',
      professional_client: 'Professional (₱699/mo)',
    };
    return labels[minTier] || 'a paid plan';
  }

  return {
    hasAccess,
    planNeeded,
    trialStatus,
    isTrialActive,
    isTrialExpired,
    daysRemaining,
    accountantTier,
  };
}
