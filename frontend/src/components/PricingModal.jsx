// ─── PricingModal ─────────────────────────────────────────────────────────────
// Shows tiered pricing during and after trial.
// During trial: prices are grayed out with "after trial" label — shows value
//   without pressure, anchors expectation.
// After trial: prices shown normally with upgrade CTA.
//
// Props:
//   onClose     — fn to close modal
//   userRole    — 'accountant' | 'client' | 'encoder'
//   trialStatus — result of GET /api/auth/trial-status (or null)
import { useEffect, useState } from 'react';

const ACCOUNTANT_PLANS = [
  {
    id:       'free',
    name:     'Free',
    price:    0,
    desc:     'Try the basics',
    features: [
      '1 client',
      'Transactions & basic reports',
      'Income statement & balance sheet',
    ],
    locked: [],
    cta: 'Current plan',
    ctaDisabled: true,
  },
  {
    id:       'solo',
    name:     'Solo',
    price:    599,
    desc:     'For solo practitioners',
    features: [
      '5 clients',
      'All BIR returns (2550M/Q, 2551, 1601-C/EQ)',
      'eBIR XML export',
      'Cash flow forecasting',
      'Encoder delegation',
      'BIR deadline reminders',
    ],
    cta: 'Upgrade to Solo',
  },
  {
    id:       'professional',
    name:     'Professional',
    price:    1499,
    desc:     'Most popular',
    highlight: true,
    features: [
      '15 clients',
      'Everything in Solo',
      'BIR Form 1601-FQ & 2000-OT',
      'Global Cmd-K search',
      'Audit log & period lock',
      'Filing calendar view',
    ],
    cta: 'Upgrade to Professional',
  },
  {
    id:       'firm',
    name:     'Firm',
    price:    2999,
    desc:     'For accounting firms',
    features: [
      'Unlimited clients',
      'Everything in Professional',
      'White-label branding (logo + colors)',
      'Multi-encoder support',
      'Priority support',
    ],
    cta: 'Upgrade to Firm',
  },
  {
    id:       'agency',
    name:     'Agency',
    price:    4999,
    desc:     'Scale without limits',
    features: [
      'Everything in Firm',
      'Full white-label (client-facing)',
      'Dedicated onboarding',
      'SLA support',
    ],
    cta: 'Upgrade to Agency',
  },
];

const CLIENT_PLANS = [
  {
    id:       'free',
    name:     'Free',
    price:    0,
    desc:     'Get started',
    features: [
      '50 transactions/month',
      'Income statement & balance sheet',
      'Basic reports',
    ],
    cta: 'Current plan',
    ctaDisabled: true,
  },
  {
    id:       'starter',
    name:     'Starter',
    price:    399,
    desc:     'For small businesses',
    highlight: true,
    features: [
      'Unlimited transactions',
      'Invoicing with VAT',
      'BIR deadline alerts',
      'Accountant access',
      'Receipt attachments',
    ],
    cta: 'Upgrade to Starter',
  },
  {
    id:       'professional',
    name:     'Professional',
    price:    699,
    desc:     'For growing businesses',
    features: [
      'Everything in Starter',
      '30/60/90-day cash flow forecast',
      'CSV bank import',
      'OCR receipt scanning',
      'Audit log',
    ],
    cta: 'Upgrade to Professional',
  },
  {
    id:       'enterprise',
    name:     'Enterprise',
    price:    999,
    desc:     'Full power',
    features: [
      'Everything in Professional',
      'Payroll & 1601-C',
      'eBIR XML for own filing',
      'Priority support',
    ],
    cta: 'Upgrade to Enterprise',
  },
];

function Check() {
  return <span style={{ color: '#16a34a', marginRight: 8, fontSize: 13 }}>✓</span>;
}

export default function PricingModal({ onClose, userRole = 'accountant', trialStatus }) {
  const isTrialActive = trialStatus?.isTrialActive;
  const daysRemaining = trialStatus?.daysRemaining ?? 0;
  const plans = userRole === 'accountant' ? ACCOUNTANT_PLANS : CLIENT_PLANS;
  const accentColor = userRole === 'accountant' ? '#1d4ed8' : '#0f766e';

  const handleUpgradeClick = () => {
    const subject = encodeURIComponent('MyLedger Upgrade Request');
    const body = encodeURIComponent(`Hi,\n\nI'd like to upgrade my MyLedger account.\n\nEmail: (your email)\nRole: ${userRole}\n\nPlease activate my subscription.\n\nThank you!`);
    window.open(`mailto:mym@kaimanco.com?subject=${subject}&body=${body}`, '_blank');
  };

  // Trap scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        zIndex: 1000, overflowY: 'auto', padding: '24px 12px',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 900,
        boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          background: accentColor,
          padding: '28px 32px 24px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        }}>
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: '#fff' }}>
              {isTrialActive ? `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left in your trial` : 'Choose your plan'}
            </h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 1.5 }}>
              {isTrialActive
                ? 'You have full access to all features during your trial. Here\'s what each plan includes after it ends.'
                : 'Keep your books running — pick the plan that fits your practice.'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.2)', border: 'none',
              borderRadius: 8, color: '#fff', fontSize: 20,
              width: 36, height: 36, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: 16,
            }}
          >
            ×
          </button>
        </div>

        {/* Trial notice */}
        {isTrialActive && (
          <div style={{
            background: '#fffbeb', borderBottom: '1px solid #fcd34d',
            padding: '12px 32px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>💡</span>
            <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
              <strong>Prices shown are after your trial ends.</strong> You're currently using all features for free. To upgrade before your trial ends, email{' '}
              <a href="mailto:mym@kaimanco.com" style={{ color: '#92400e' }}>mym@kaimanco.com</a>.
            </p>
          </div>
        )}

        {/* Plans grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${plans.length}, 1fr)`,
          gap: 0,
          padding: '24px 24px 32px',
          overflowX: 'auto',
        }}>
          {plans.map(plan => (
            <div key={plan.id} style={{
              border: plan.highlight
                ? `2px solid ${accentColor}`
                : '1px solid #e5e7eb',
              borderRadius: 12, padding: '20px 16px',
              margin: '0 6px',
              position: 'relative',
              background: plan.highlight ? '#f0f9ff' : '#fff',
              minWidth: 150,
            }}>
              {plan.highlight && (
                <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: accentColor, color: '#fff',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                }}>
                  Most Popular
                </div>
              )}

              <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700, color: '#374151' }}>
                {plan.name}
              </p>
              <p style={{ margin: '0 0 12px', fontSize: 11, color: '#9ca3af' }}>
                {plan.desc}
              </p>

              {/* Price — grayed during trial */}
              <div style={{ marginBottom: 16 }}>
                {plan.price === 0 ? (
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>Free</span>
                ) : (
                  <span style={{
                    fontSize: 22, fontWeight: 800,
                    color: isTrialActive ? '#9ca3af' : '#111827',
                    transition: 'color 0.2s',
                  }}>
                    ₱{plan.price.toLocaleString()}
                    <span style={{ fontSize: 11, fontWeight: 400, color: '#9ca3af' }}>/mo</span>
                  </span>
                )}
                {isTrialActive && plan.price > 0 && (
                  <p style={{ margin: '2px 0 0', fontSize: 10, color: '#9ca3af' }}>after trial</p>
                )}
              </div>

              {/* Features */}
              <ul style={{ margin: '0 0 16px', padding: 0, listStyle: 'none' }}>
                {plan.features.map(f => (
                  <li key={f} style={{
                    display: 'flex', alignItems: 'flex-start',
                    fontSize: 12, color: '#374151', marginBottom: 6, lineHeight: 1.4,
                  }}>
                    <Check />{f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                onClick={plan.ctaDisabled ? undefined : handleUpgradeClick}
                disabled={plan.ctaDisabled}
                style={{
                  width: '100%',
                  background: plan.ctaDisabled ? '#f3f4f6'
                    : plan.highlight ? accentColor : '#111827',
                  color: plan.ctaDisabled ? '#9ca3af' : '#fff',
                  border: 'none', borderRadius: 8,
                  padding: '9px 0', fontSize: 12, fontWeight: 700,
                  cursor: plan.ctaDisabled ? 'default' : 'pointer',
                }}
              >
                {plan.cta}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: '1px solid #f3f4f6', padding: '16px 32px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
            All plans include VAT-smart bookkeeping, automatic BIR calculations, and secure data.
          </p>
          <a
            href="mailto:mym@kaimanco.com"
            style={{ fontSize: 12, color: accentColor, textDecoration: 'none' }}
          >
            Questions? Email us →
          </a>
        </div>
      </div>
    </div>
  );
}
