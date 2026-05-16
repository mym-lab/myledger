// ─── OnboardingWizard.jsx ─────────────────────────────────────────────────────
// First-run onboarding overlay — shown once per user (tracked in localStorage).
// Role-aware: different steps for client / accountant / encoder.

import { useState } from 'react';

const T = {
  bg:     '#f5f5f7', surface: '#ffffff', border: '#d2d2d7',
  text:   '#1d1d1f', muted:   '#6e6e73',
  accent: '#0071e3', teal:    '#00836e', orange: '#ff9500',
  green:  '#34c759', red:     '#ff3b30', purple: '#af52de',
};

// ── Step content ──────────────────────────────────────────────────────────────

function ClientSteps(name) {
  return [
    {
      emoji: '👋',
      title: `Welcome to MyLedger${name ? ', ' + name : ''}!`,
      subtitle: 'Your Philippine VAT-compliant bookkeeping system',
      body: (
        <div>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: T.muted, lineHeight: 1.7 }}>
            MyLedger helps you track income and expenses — and automatically handles all the VAT
            math so you stay BIR-compliant without being an accountant.
          </p>
          {[
            { icon: '🧾', text: 'Record income & expenses in seconds' },
            { icon: '📊', text: 'Automatic VAT computation (12% or OPT)' },
            { icon: '📋', text: 'BIR-ready reports & deadline reminders' },
            { icon: '🔐', text: 'Invite your accountant to collaborate' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12,
              background: T.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 14, color: T.text }}>{text}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      emoji: '💰',
      title: 'How transactions work',
      subtitle: 'Enter the amount — VAT is computed for you',
      body: (
        <div>
          <p style={{ margin: '0 0 14px', fontSize: 14, color: T.muted }}>
            The key rule: <strong>income uses NET</strong>, expenses use <strong>GROSS</strong>.
          </p>
          <div style={{ background: '#f0f7ff', borderRadius: 12, padding: 16,
            border: `1px solid ${T.accent}20`, marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: T.accent, fontSize: 13, marginBottom: 8 }}>
              📥 INCOME — enter the NET (before VAT)
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.text, lineHeight: 2 }}>
              You enter: <strong>₱10,000</strong> NET<br/>
              System adds: <strong style={{ color: T.orange }}>+₱1,200</strong> VAT (12%)<br/>
              Customer pays: <strong style={{ color: T.green }}>₱11,200</strong> total
            </div>
          </div>
          <div style={{ background: '#fff8ec', borderRadius: 12, padding: 16,
            border: `1px solid ${T.orange}20` }}>
            <div style={{ fontWeight: 700, color: T.orange, fontSize: 13, marginBottom: 8 }}>
              📤 EXPENSE — enter the GROSS (receipt total)
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: T.text, lineHeight: 2 }}>
              You enter: <strong>₱11,200</strong> GROSS<br/>
              System extracts: <strong style={{ color: T.green }}>₱10,000</strong> NET (÷1.12)<br/>
              Input VAT: <strong style={{ color: T.accent }}>₱1,200</strong> recoverable
            </div>
          </div>
        </div>
      ),
    },
    {
      emoji: '📋',
      title: 'Reports update in real time',
      subtitle: 'Everything you need for BIR compliance',
      body: (
        <div>
          <p style={{ margin: '0 0 14px', fontSize: 14, color: T.muted }}>
            As soon as you add transactions, your reports are ready.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {[
              { icon: '📈', label: 'Income Statement', desc: 'NET revenue − expenses', color: T.green },
              { icon: '⚖️', label: 'Balance Sheet',    desc: 'Input/Output VAT position', color: T.accent },
              { icon: '💵', label: 'Cash Flow',        desc: 'Cash in vs. out', color: T.orange },
              { icon: '📚', label: 'Accounting Books', desc: 'Sales & Purchase books', color: T.purple },
            ].map(({ icon, label, desc, color }) => (
              <div key={label} style={{ background: T.bg, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{desc}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#f0fff4', borderRadius: 10, padding: '10px 14px',
            fontSize: 13, color: T.teal, border: `1px solid ${T.green}20` }}>
            💡 <strong>Free plan</strong> includes transactions only. Upgrade to
            <strong> Starter (₱399/mo)</strong> to unlock all reports & BIR reminders.
          </div>
        </div>
      ),
    },
    {
      emoji: '🚀',
      title: "You're all set!",
      subtitle: 'Three steps to get going',
      body: (
        <div>
          {[
            { step: '1', text: 'Click "+ New Business" to register your business (TIN, type, etc.)' },
            { step: '2', text: 'Record your first income or expense transaction' },
            { step: '3', text: 'Check your VAT position and upcoming BIR deadlines' },
          ].map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
              background: T.bg, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: T.accent,
                color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {step}
              </div>
              <span style={{ fontSize: 14, color: T.text, paddingTop: 3 }}>{text}</span>
            </div>
          ))}
          <div style={{ marginTop: 4, padding: '12px 14px', background: '#f0f7ff',
            borderRadius: 10, fontSize: 13, color: T.muted, border: `1px solid ${T.accent}15` }}>
            📞 Need help? Email <strong>mym@kaimanco.com</strong> — we reply within 24 hours.
          </div>
        </div>
      ),
    },
  ];
}

function AccountantSteps(name) {
  return [
    {
      emoji: '👋',
      title: `Welcome, ${name || 'Accountant'}!`,
      subtitle: 'Your all-in-one client management portal',
      body: (
        <div>
          <p style={{ margin: '0 0 14px', fontSize: 14, color: T.muted, lineHeight: 1.7 }}>
            Manage multiple client businesses, generate BIR returns, and keep everyone
            compliant — all from one dashboard.
          </p>
          {[
            { icon: '📁', text: 'Manage multiple client businesses from one place' },
            { icon: '🧾', text: 'BIR returns: 2550M/Q, 2551M/Q, 1601-EQ' },
            { icon: '📊', text: 'Income statement, balance sheet, cash flow, SLSP' },
            { icon: '📖', text: 'General Journal & General Ledger per client' },
            { icon: '🏷️', text: 'White-label portal with your firm branding (Agency plan)' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12,
              background: T.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 14, color: T.text }}>{text}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      emoji: '⚡',
      title: 'Free plan — and when to upgrade',
      subtitle: 'Start free, scale when you need it',
      body: (
        <div>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: T.muted }}>
            Your account starts on <strong>Free</strong>. Upgrade any time via the portal.
          </p>
          {[
            { tier: 'Free',         color: T.muted,   price: 'Free',      clients: '1 client',    note: 'Dashboard & Transactions only' },
            { tier: 'Solo',         color: T.accent,  price: '₱599/mo',   clients: '5 clients',   note: 'All features unlocked' },
            { tier: 'Professional', color: T.orange,  price: '₱1,499/mo', clients: '15 clients',  note: 'All features + priority support' },
            { tier: 'Firm',         color: T.green,   price: '₱2,999/mo', clients: 'Unlimited',   note: 'All features' },
            { tier: 'Agency',       color: T.purple,  price: '₱4,999/mo', clients: 'Unlimited',   note: 'All features + white-label branding' },
          ].map(({ tier, color, price, clients, note }) => (
            <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 10,
              background: T.bg, borderRadius: 10, padding: '9px 12px', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}15`,
                padding: '3px 8px', borderRadius: 5, minWidth: 86, textAlign: 'center',
                textTransform: 'uppercase' }}>{tier}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, minWidth: 72 }}>{price}</span>
              <span style={{ fontSize: 12, color: T.muted }}>
                <strong style={{ color: T.text }}>{clients}</strong> · {note}
              </span>
            </div>
          ))}
          <div style={{ marginTop: 10, background: '#f0f7ff', borderRadius: 10,
            padding: '10px 14px', fontSize: 13, color: T.accent, border: `1px solid ${T.accent}15` }}>
            💳 Pay via GCash / Maya → submit ref number → admin activates same day.
          </div>
        </div>
      ),
    },
    {
      emoji: '📁',
      title: 'Adding and managing clients',
      subtitle: 'Each client has its own separate books',
      body: (
        <div>
          {[
            { icon: '➕', title: 'Add a client directly', desc: 'You create the business profile and manage all their books.' },
            { icon: '📧', title: 'Invite an existing client', desc: "Send an email invite — they sign up and you're assigned as their accountant." },
            { icon: '✏️', title: 'Assign encoders', desc: 'Delegate data entry to encoders so you focus on reporting and compliance.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start',
              background: T.bg, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: T.text, marginBottom: 2 }}>{title}</div>
                <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      emoji: '🚀',
      title: "You're ready!",
      subtitle: 'Add your first client to get started',
      body: (
        <div>
          {[
            { step: '1', text: 'Click "+ Add Client" in the sidebar to create a client business' },
            { step: '2', text: 'Record their income & expense transactions' },
            { step: '3', text: 'Generate BIR returns and financial reports on demand' },
          ].map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
              background: T.bg, borderRadius: 10, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: T.teal,
                color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {step}
              </div>
              <span style={{ fontSize: 14, color: T.text, paddingTop: 3 }}>{text}</span>
            </div>
          ))}
          <div style={{ marginTop: 4, padding: '12px 14px', background: '#e6f7f5',
            borderRadius: 10, fontSize: 13, color: T.teal, border: `1px solid ${T.teal}15` }}>
            💡 Share your referral link — earn <strong>10% of every subscription</strong> payment
            from accountants and clients you refer.
          </div>
        </div>
      ),
    },
  ];
}

function EncoderSteps(name) {
  return [
    {
      emoji: '👋',
      title: `Welcome, ${name || 'Encoder'}!`,
      subtitle: 'Your role: accurate, fast data entry',
      body: (
        <div>
          <p style={{ margin: '0 0 14px', fontSize: 14, color: T.muted, lineHeight: 1.7 }}>
            As an encoder you enter transactions for the client businesses your accountant assigns
            to you. The system handles all VAT calculations automatically.
          </p>
          {[
            { icon: '📋', text: 'Your assigned clients appear in the sidebar' },
            { icon: '➕', text: 'Add income and expense transactions' },
            { icon: '🧮', text: 'VAT is computed automatically — just enter the amount' },
            { icon: '🔒', text: 'Reports and settings are managed by the accountant' },
          ].map(({ icon, text }) => (
            <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 12,
              background: T.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <span style={{ fontSize: 14, color: T.text }}>{text}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      emoji: '📝',
      title: 'Adding transactions',
      subtitle: 'Five steps, every time',
      body: (
        <div>
          {[
            { step: '1', text: 'Select the client from the left sidebar' },
            { step: '2', text: 'Click "+ New Transaction"' },
            { step: '3', text: 'Choose type — Income (enter NET) or Expense (enter GROSS)' },
            { step: '4', text: 'Fill in description, reference number, category, date' },
            { step: '5', text: 'Submit — VAT is computed automatically' },
          ].map(({ step, text }) => (
            <div key={step} style={{ display: 'flex', alignItems: 'flex-start', gap: 12,
              background: T.bg, borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: T.orange,
                color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {step}
              </div>
              <span style={{ fontSize: 14, color: T.text, paddingTop: 2 }}>{text}</span>
            </div>
          ))}
          <div style={{ marginTop: 4, background: '#fff8ec', borderRadius: 10,
            padding: '10px 14px', fontSize: 13, color: T.orange, border: `1px solid ${T.orange}20` }}>
            ⚠️ Always double-check the amount and reference number before submitting.
            Corrections require the accountant to void and re-enter.
          </div>
        </div>
      ),
    },
    {
      emoji: '✅',
      title: "You're ready to encode!",
      subtitle: 'Quick reference',
      body: (
        <div>
          <div style={{ background: '#fff8ec', borderRadius: 12, padding: 16,
            border: `1px solid ${T.orange}20`, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: T.orange, marginBottom: 10 }}>
              Key rules
            </div>
            <div style={{ fontSize: 14, color: T.text, lineHeight: 2.2 }}>
              📥 Income → enter the <strong>NET amount</strong> (before VAT)<br/>
              📤 Expense → enter the <strong>GROSS amount</strong> (total on receipt)<br/>
              📷 Use the Scan Receipt button to auto-fill from a photo
            </div>
          </div>
          <div style={{ padding: '12px 14px', background: T.bg,
            borderRadius: 10, fontSize: 13, color: T.muted }}>
            📞 Questions about assignments or access? Contact your accountant directly —
            they control your client assignments and permissions.
          </div>
        </div>
      ),
    },
  ];
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingWizard({ user, onComplete }) {
  const role   = user?.role || 'client';
  const name   = user?.name?.split(' ')[0] || '';
  const accent = role === 'accountant' ? T.teal : role === 'encoder' ? T.orange : T.accent;

  const steps  = role === 'accountant' ? AccountantSteps(name)
               : role === 'encoder'    ? EncoderSteps(name)
               : ClientSteps(name);

  const [step, setStep] = useState(0);
  const isLast  = step === steps.length - 1;
  const current = steps[step];
  const pct     = ((step + 1) / steps.length) * 100;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
    }}>
      <div style={{
        background: T.surface, borderRadius: 20, width: '100%', maxWidth: 520,
        boxShadow: '0 8px 48px rgba(0,0,0,0.24)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '92vh',
      }}>

        {/* Progress bar */}
        <div style={{ height: 4, background: T.bg, flexShrink: 0 }}>
          <div style={{ height: '100%', background: accent, width: `${pct}%`,
            transition: 'width 0.4s ease', borderRadius: '0 4px 4px 0' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '22px 28px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            {/* Step dots */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {steps.map((_, i) => (
                <div key={i} style={{
                  height: 7, width: i === step ? 22 : 7, borderRadius: 4,
                  background: i <= step ? accent : T.border,
                  transition: 'all 0.3s ease',
                }} />
              ))}
            </div>
            <button onClick={onComplete} style={{
              background: 'none', border: 'none', color: T.muted, cursor: 'pointer',
              fontSize: 13, padding: '4px 8px', borderRadius: 6, fontFamily: 'inherit',
            }}>
              Skip
            </button>
          </div>
          <div style={{ fontSize: 34, marginBottom: 8, lineHeight: 1 }}>{current.emoji}</div>
          <h2 style={{ margin: '0 0 3px', fontSize: 19, fontWeight: 700, color: T.text, letterSpacing: '-0.3px' }}>
            {current.title}
          </h2>
          <p style={{ margin: '0 0 18px', fontSize: 13, color: T.muted }}>
            {current.subtitle}
          </p>
        </div>

        {/* Scrollable body */}
        <div style={{ padding: '0 28px', overflowY: 'auto', flex: 1 }}>
          {current.body}
        </div>

        {/* Footer buttons */}
        <div style={{ padding: '18px 28px 24px', display: 'flex', gap: 10, flexShrink: 0 }}>
          {step > 0 && (
            <button onClick={() => setStep(s => s - 1)} style={{
              padding: '11px 20px', borderRadius: 10, border: `1px solid ${T.border}`,
              background: 'transparent', color: T.muted, fontSize: 14, cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 500,
            }}>
              ← Back
            </button>
          )}
          <button
            onClick={() => isLast ? onComplete() : setStep(s => s + 1)}
            style={{
              flex: 1, padding: '12px', borderRadius: 10, border: 'none',
              background: accent, color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 4px 14px ${accent}35`,
            }}
          >
            {isLast ? "Let's go! →" : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
