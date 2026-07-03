// ─── TrialBanner ─────────────────────────────────────────────────────────────
// Sticky top bar shown during the 30-day trial.
// Color shifts: blue (> 14 days) → amber (7–14) → red (< 7).
// Dismissible per session (doesn't reload trial status on dismiss).
import { useState, useEffect } from 'react';

const API = '/api';
const get = (path) =>
  fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('ml_token')}` },
  }).then(r => r.ok ? r.json() : null);

export default function TrialBanner({ onUpgradeClick }) {
  const [trial, setTrial]       = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    get('/auth/trial-status').then(data => {
      if (data?.isTrialActive) setTrial(data);
    });
  }, []);

  if (!trial || dismissed) return null;

  const { daysRemaining } = trial;

  // Color scheme based on urgency
  let bg, text, border, btnBg, btnText;
  if (daysRemaining > 14) {
    bg = '#1d4ed8'; text = '#fff'; border = '#1e40af';
    btnBg = '#fff'; btnText = '#1d4ed8';
  } else if (daysRemaining > 6) {
    bg = '#d97706'; text = '#fff'; border = '#b45309';
    btnBg = '#fff'; btnText = '#92400e';
  } else {
    bg = '#dc2626'; text = '#fff'; border = '#b91c1c';
    btnBg = '#fff'; btnText = '#991b1b';
  }

  const dayWord = daysRemaining === 1 ? 'day' : 'days';

  return (
    <div style={{
      background: bg,
      borderBottom: `1px solid ${border}`,
      padding: '8px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      flexWrap: 'wrap',
      zIndex: 100,
      position: 'relative',
    }}>
      <span style={{ color: text, fontSize: 13, fontWeight: 500, lineHeight: 1.4 }}>
        {daysRemaining === 0
          ? '⚠️ Your free trial expires today'
          : `🎉 Free trial — ${daysRemaining} ${dayWord} remaining`}
        {' · '}
        <span style={{ opacity: 0.85 }}>Full access to all features</span>
      </span>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onUpgradeClick}
          style={{
            background: btnBg, color: btnText,
            border: 'none', borderRadius: 6,
            padding: '5px 14px', fontSize: 12, fontWeight: 700,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          View Plans
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent', color: text,
            border: 'none', cursor: 'pointer',
            fontSize: 16, lineHeight: 1, padding: '2px 4px',
            opacity: 0.7,
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
