// ─── ClientInterface.jsx ─────────────────────────────────────────────────────
// MyLedger — Client self-service portal (Apple light theme)
// Business owner logs in to capture their own income, expenses, and VAT.

import { useState, useEffect, useRef } from 'react';
import { useMobile } from '../hooks/useMobile.js';
import { InvoicesTab } from '../components/InvoiceModal.jsx';
import CSVImportModal    from '../components/CSVImportModal.jsx';
import BalanceSheetImport from '../components/BalanceSheetImport.jsx';
import NotificationBell   from '../components/NotificationBell.jsx';
import TrialBanner        from '../components/TrialBanner.jsx';
import PricingModal       from '../components/PricingModal.jsx';
import { printReport, build2307Html } from '../utils/printReport.js';
import {
  getClients, createClient, updateClient, deleteClient, backupClient,
  getTransactions, createTransaction, voidTransaction,
  getIncomeReport, getBalanceReport, getCashFlowReport, getBooksReport, getCashFlowForecast,
  getReceipts, uploadReceipt, deleteReceipt,
  getAssets, createAsset, deleteAsset, getLapsing,
  getBirDeadlines, getBirVatBalance,
  assignAccountant,
  getPendingInvite, cancelPendingInvite,
  getPublicSettings,
  createUpgradeRequest,
  createPaymongoLink,
  pollPaymongoStatus,
  scanReceipt,
  getMyReferrals,
  downloadCSV,
  getNarrative,
  getTrialStatus,
} from '../api.js';

// ─── Design tokens ───────────────────────────────────────────────────────────
const T = {
  bg: '#f5f5f7', surface: '#ffffff', border: '#d2d2d7',
  text: '#1d1d1f', muted: '#6e6e73', accent: '#0071e3',
  green: '#34c759', orange: '#ff9500', red: '#ff3b30', yellow: '#ffcc00',
  purple: '#af52de',
  radius: '12px', shadow: '0 2px 12px rgba(0,0,0,0.08)', shadowMd: '0 4px 24px rgba(0,0,0,0.12)',
};

const SUBSCRIPTION_TIERS = [
  { value: 'free',         label: 'Free',         color: T.muted,   desc: 'Transactions only — no reports or reminders' },
  { value: 'starter',      label: 'Starter',      color: T.accent,  desc: 'Charts · BIR reminders · VAT position · Backup' },
  { value: 'professional', label: 'Professional', color: T.purple,  desc: 'Everything + accountant access & collaboration' },
  { value: 'enterprise',   label: 'Enterprise',   color: '#ff9500', desc: 'Multi-entity · priority support · white-label' },
];

// Monthly transaction caps per tier (null = unlimited)
const TIER_LIMITS = { free: 80, starter: 300, professional: 500, enterprise: null };

// Default settings (overridden by live fetch from /api/admin/settings)
const DEFAULT_SETTINGS = {
  pricing:      { starter: 399, professional: 699, enterprise: 999 },
  payment: {
    maya:  { name: 'Kaiman & Co.', number: '09989919660' },
    gcash: { name: 'Kaiman & Co.', number: '09989919660' },
  },
  contactEmail: 'mym@kaimanco.com',
};

// Default EWT/ATC rates — overridden by admin settings stored in DB
const DEFAULT_EWT_RATES = [
  { atc: 'WC010', rate: 0.01, description: 'Purchase of goods — regular supplier' },
  { atc: 'WC020', rate: 0.02, description: 'Purchase of services — regular supplier' },
  { atc: 'WC158', rate: 0.01, description: 'Purchase of goods — large taxpayer' },
  { atc: 'WC160', rate: 0.02, description: 'Purchase of services — large taxpayer' },
  { atc: 'WF010', rate: 0.05, description: 'Professional / talent fees (≤ ₱3M income)' },
  { atc: 'WF020', rate: 0.10, description: 'Professional / talent fees (> ₱3M income)' },
  { atc: 'WR010', rate: 0.05, description: 'Rental — real/personal property' },
  { atc: 'WC050', rate: 0.10, description: 'Commissions — brokers, agents' },
  { atc: 'WF000', rate: 0.25, description: 'Non-resident alien not engaged in trade' },
];

const TAX_TYPES = [
  { code: '2550M',  label: '2550M — Monthly VAT Return' },
  { code: '2550Q',  label: '2550Q — Quarterly VAT Return' },
  { code: '2551M',  label: '2551M — Monthly Percentage Tax (Non-VAT)' },
  { code: '2551Q',  label: '2551Q — Quarterly Percentage Tax (Non-VAT)' },
  { code: '1601C',  label: '1601-C — WHT on Compensation' },
  { code: '1601EQ', label: '1601-EQ — Expanded WHT (Quarterly)' },
  { code: '1604EQ', label: '1604-EQ — Annual EWT Return' },
  { code: '1702Q',  label: '1702Q — Quarterly IT (Corp)' },
  { code: '1702',   label: '1702 — Annual IT (Corp)' },
  { code: '1701Q',  label: '1701Q — Quarterly IT (Individual)' },
  { code: '1701',   label: '1701 — Annual IT (Individual)' },
  { code: '1550',   label: '1550 — Documentary Stamp Tax' },
];

const INCOME_CATS  = ['Sale of Goods','Sale of Services','Professional Fees','Rental Income','Interest Income','Commission Income','Dividend Income','Other Income','Reimbursement','Capital Contribution','Loan Proceeds','Other Non-Taxable Income'];
const EXPENSE_CATS = ['Cost of Goods Sold','Salaries & Wages','Rent','Utilities','Office Supplies','Advertising & Marketing','Transportation & Travel','Professional Fees','Repairs & Maintenance','Bank Charges & Fees','Taxes & Licenses','Depreciation','Insurance','Interest Expense','Other Expenses'];
const CUSTOM_OPT   = '＋ Other (specify)';

const peso   = n => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDt  = d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const monthLabel = d => new Date(d).toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });

// ─── Tier gating ─────────────────────────────────────────────────────────────
const TIER_RANK = { free: 0, starter: 1, professional: 2, enterprise: 3 };
const tierMeets = (clientTier, required) =>
  (TIER_RANK[clientTier] ?? 0) >= (TIER_RANK[required] ?? 0);

// ─── Module-level UI atoms ────────────────────────────────────────────────────

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
  fontSize: 14, color: T.text, background: '#fafafa', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', style: x = {} }) {
  const sz = { sm: { padding: '5px 12px', fontSize: 13 }, md: { padding: '9px 18px', fontSize: 14 }, lg: { padding: '12px 24px', fontSize: 15 } };
  const vr = {
    primary: { background: T.accent, color: '#fff', border: 'none' },
    danger:  { background: T.red,    color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: T.accent, border: `1px solid ${T.accent}` },
    neutral: { background: T.border, color: T.text, border: 'none' },
    ocr:     { background: '#f5f0ff', color: T.purple, border: `1px solid ${T.purple}40` },
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{ borderRadius: 8, cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 500,
        fontFamily: 'inherit', opacity: disabled ? 0.55 : 1, transition: 'opacity .15s',
        display: 'inline-flex', alignItems: 'center', gap: 6,
        ...sz[size], ...vr[variant], ...x }}>
      {children}
    </button>
  );
}

function ModalShell({ title, onClose, children, wide }) {
  const isMobile = useMobile();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
      justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 20 }}
      onClick={onClose}>
      <div style={{ background: T.surface,
        borderRadius: isMobile ? '20px 20px 0 0' : 16,
        padding: 28, width: '100%',
        maxWidth: isMobile ? '100vw' : (wide ? 720 : 480),
        margin: isMobile ? 0 : 'auto',
        position: isMobile ? 'fixed' : 'relative',
        bottom: isMobile ? 0 : 'auto',
        left: isMobile ? 0 : 'auto',
        boxShadow: T.shadowMd, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22,
            cursor: 'pointer', color: T.muted, lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Fld({ label, children, half }) {
  return (
    <div style={{ marginBottom: 14, ...(half ? {} : {}) }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: T.muted, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function SectionHead({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: '0.6px' }}>{children}</div>;
}

function Card({ children, style = {} }) {
  return <div style={{ background: T.surface, borderRadius: T.radius, padding: '20px 24px',
    boxShadow: T.shadow, border: `1px solid ${T.border}`, ...style }}>{children}</div>;
}

// ─── UpgradeGate ─────────────────────────────────────────────────────────────
// Wraps any section. If the client's tier < required, shows a blur overlay
// with an upgrade prompt instead of the live content.
function UpgradeGate({ tier, required, onUpgrade, children }) {
  if (tierMeets(tier, required)) return children;
  const reqInfo  = SUBSCRIPTION_TIERS.find(t => t.value === required) || SUBSCRIPTION_TIERS[1];
  return (
    /* No overflow:hidden here — it clips the button on small containers.
       Instead we clip only the blurred preview layer. */
    <div style={{ position: 'relative', borderRadius: T.radius }}>
      {/* Blurred preview of actual content */}
      <div style={{ filter: 'blur(4px)', pointerEvents: 'none', userSelect: 'none',
        opacity: 0.5, overflow: 'hidden', borderRadius: T.radius, minHeight: 80 }}>
        {children}
      </div>
      {/* Overlay — uses min-height so the button is never clipped */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 140,
        background: 'rgba(245,245,247,0.80)', backdropFilter: 'blur(2px)',
        borderRadius: T.radius, border: `1.5px dashed ${reqInfo.color}50` }}>
        <div style={{ fontSize: 26 }}>🔒</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: T.text }}>
          {reqInfo.label} feature
        </div>
        <div style={{ fontSize: 13, color: T.muted, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
          {reqInfo.desc}
        </div>
        <button onClick={onUpgrade}
          style={{ marginTop: 4, padding: '9px 22px', borderRadius: 8, border: 'none',
            background: reqInfo.color, color: '#fff', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          Upgrade to {reqInfo.label}
        </button>
      </div>
    </div>
  );
}

// ─── PaymentModal ─────────────────────────────────────────────────────────────
// Payment via Maya or GCash (manual transfer → upgrade request).
// PayMongo removed — users found it confusing. Maya/GCash are the standard PH wallets.
function PaymentModal({ clientId, currentTier, settings, onClose, onUpgradeSuccess }) {
  const isMobile = useMobile();
  const pricing      = settings?.pricing      || DEFAULT_SETTINGS.pricing;
  const payAccts     = settings?.payment      || DEFAULT_SETTINGS.payment;
  const contactEmail = settings?.contactEmail || DEFAULT_SETTINGS.contactEmail;

  const tiersWithPrice = SUBSCRIPTION_TIERS.map(t => ({
    ...t,
    price: t.value === 'free' ? 0 : (pricing[t.value] ?? 0),
  }));
  const upgradeable = tiersWithPrice.filter(t => t.value !== 'free' &&
    (TIER_RANK[t.value] ?? 0) > (TIER_RANK[currentTier] ?? 0));

  const [selTier,      setSelTier]      = useState(upgradeable[0]?.value || 'starter');
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'
  const [step,         setStep]         = useState(1);   // 1=pick tier, 2=pick method, 'manual'=transfer details, 3=done
  const [method,       setMethod]       = useState(null);  // 'maya' | 'gcash'
  const [refNo,        setRefNo]        = useState('');
  const [submitting,   setSubmitting]   = useState(false);

  const tierObj      = tiersWithPrice.find(t => t.value === selTier);
  const monthlyPrice = tierObj?.price || 0;
  const annualPrice  = Math.round(monthlyPrice * 12 * 0.80);
  const displayPrice = billingCycle === 'annual' ? annualPrice : monthlyPrice;
  const acct         = method ? { ...payAccts[method], type: method === 'maya' ? 'Maya' : 'GCash' } : null;
  const methodColor  = method === 'maya' ? '#00a8e0' : '#007dff';

  function goMethod(m) {
    setMethod(m);
    setRefNo(`ML-${Math.floor(100000 + Math.random() * 900000)}`);
    setStep('manual');
  }

  return (
    <ModalShell title="Upgrade Your Plan" onClose={onClose} wide>

      {/* ── Step 1: Pick tier ── */}
      {step === 1 && (
        <div>
          {/* Billing cycle toggle */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
            <div style={{ display: 'inline-flex', background: T.border, borderRadius: 10, padding: 3, gap: 2 }}>
              {['monthly', 'annual'].map(cycle => (
                <button key={cycle} onClick={() => setBillingCycle(cycle)}
                  style={{
                    padding: '7px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 13, fontWeight: 600, transition: 'all .15s',
                    background: billingCycle === cycle ? T.accent : 'transparent',
                    color: billingCycle === cycle ? '#fff' : T.muted,
                  }}>
                  {cycle === 'monthly' ? 'Monthly' : '🎉 Annual — Save 20%'}
                </button>
              ))}
            </div>
          </div>
          {billingCycle === 'annual' && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8,
              padding: '8px 14px', fontSize: 13, color: '#166534', marginBottom: 12, textAlign: 'center' }}>
              Annual plan saves you <strong>2 months free</strong>. Billed once per year.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
            {upgradeable.map(t => (
              <div key={t.value} onClick={() => setSelTier(t.value)}
                style={{ borderRadius: 12, padding: '14px 18px', cursor: 'pointer', transition: 'all .15s',
                  border: selTier === t.value ? `2px solid ${t.color}` : `1.5px solid ${T.border}`,
                  background: selTier === t.value ? `${t.color}08` : T.surface,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: t.color }}>{t.label}</div>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>{t.desc}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 110 }}>
                  {billingCycle === 'annual' ? (
                    <>
                      <div style={{ fontSize: 22, fontWeight: 700, color: t.color }}>
                        ₱{Math.round(t.price * 12 * 0.8).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted }}>/year (20% off)</div>
                      <div style={{ fontSize: 11, color: T.muted, textDecoration: 'line-through' }}>
                        ₱{(t.price * 12).toLocaleString()} regular
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 22, fontWeight: 700, color: t.color }}>₱{t.price}</div>
                      <div style={{ fontSize: 12, color: T.muted }}>/month</div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Payment method choice — Maya & GCash as primary CTAs */}
          <p style={{ fontSize: 13, color: T.muted, marginBottom: 12, fontWeight: 600 }}>
            Pay via:
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 20 }}>
            <button onClick={() => goMethod('maya')}
              style={{ borderRadius: 14, padding: '20px 16px', cursor: 'pointer', border: '2px solid #00a8e0',
                background: '#f0fbff', textAlign: 'center', fontFamily: 'inherit',
                transition: 'all .15s', boxShadow: '0 2px 8px #00a8e020' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>💙</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: '#00a8e0', marginBottom: 2 }}>Maya</div>
              <div style={{ fontSize: 12, color: T.muted }}>PayMaya / Maya Wallet</div>
            </button>
            <button onClick={() => goMethod('gcash')}
              style={{ borderRadius: 14, padding: '20px 16px', cursor: 'pointer', border: '2px solid #007dff',
                background: '#f0f5ff', textAlign: 'center', fontFamily: 'inherit',
                transition: 'all .15s', boxShadow: '0 2px 8px #007dff20' }}>
              <div style={{ fontSize: 28, marginBottom: 4 }}>💙</div>
              <div style={{ fontWeight: 800, fontSize: 20, color: '#007dff', marginBottom: 2 }}>GCash</div>
              <div style={{ fontSize: 12, color: T.muted }}>Globe GCash</div>
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* ── Transfer details ── */}
      {step === 'manual' && acct && (
        <div>
          <div style={{ background: `${methodColor}10`, border: `1.5px solid ${methodColor}30`,
            borderRadius: 14, padding: '18px 20px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 6 }}>Send payment to</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: methodColor }}>{acct.type}</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginTop: 6, letterSpacing: '0.5px' }}>{acct.number}</div>
            <div style={{ fontSize: 14, color: T.muted, marginTop: 2 }}>{acct.name}</div>
            <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '14px 0' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <div style={{ fontSize: 12, color: T.muted }}>Amount</div>
                <div style={{ fontSize: 26, fontWeight: 700 }}>₱{displayPrice.toLocaleString()}{billingCycle === 'annual' ? '' : '.00'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: T.muted }}>Reference No.</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace',
                  color: T.accent, letterSpacing: '1.5px' }}>{refNo}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Type this in the notes/memo field</div>
              </div>
            </div>
          </div>
          <div style={{ background: '#fffbe6', borderRadius: 10, padding: '10px 14px',
            fontSize: 13, color: '#856404', marginBottom: 20, lineHeight: 1.6 }}>
            ⚠️ Important: Include <strong>{refNo}</strong> in the payment notes / memo so we can match
            your payment. Your plan activates within <strong>1–2 hours</strong> on business days.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Btn variant="ghost" onClick={() => setStep(1)}>← Back</Btn>
            <Btn disabled={submitting}
              onClick={async () => {
                setSubmitting(true);
                try {
                  if (clientId) await createUpgradeRequest({ clientId, targetTier: selTier, method, refNo, amount: displayPrice, billingCycle });
                  setStep(3);
                } catch { setStep(3); }
                finally { setSubmitting(false); }
              }}
              style={{ background: methodColor }}>
              {submitting ? 'Sending…' : "I've sent the payment ✓"}
            </Btn>
          </div>
        </div>
      )}

      {/* ── Confirmation ── */}
      {step === 3 && (
        <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Payment Notified!</h3>
          <p style={{ fontSize: 14, color: T.muted, lineHeight: 1.7, marginBottom: 6 }}>
            We've received your upgrade request for<br />
            <strong style={{ color: tierObj?.color }}>{tierObj?.label} Plan</strong> — ₱{tierObj?.price}/month.
          </p>
          <div style={{ background: '#f0fff4', borderRadius: 10, padding: '12px 16px',
            fontSize: 13, color: T.green, fontWeight: 600, marginBottom: 20 }}>
            Reference: {refNo} · via {acct?.type}
          </div>
          <p style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
            Your plan activates within <strong>1–2 hours</strong> on business days.<br />
            Questions? Contact us at <strong>{contactEmail}</strong>
          </p>
          <Btn onClick={onClose} size="lg">Done</Btn>
        </div>
      )}
    </ModalShell>
  );
}

// ─── SVG Bar Chart ─────────────────────────────────────────────────────────────
function MonthlyBarChart({ transactions }) {
  // Build last 6 months
  const now    = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ key, label: d.toLocaleDateString('en-PH', { month: 'short' }), income: 0, expense: 0 });
  }

  transactions.forEach(t => {
    const key = t.createdAt?.substring(0, 7);
    const m   = months.find(x => x.key === key);
    if (m) {
      if (t.type === 'income')  m.income  += (t.net || 0);
      if (t.type === 'expense') m.expense += (t.net || 0);
    }
  });

  const hasData = months.some(m => m.income > 0 || m.expense > 0);
  if (!hasData) return (
    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: T.muted, fontSize: 13, fontStyle: 'italic' }}>No transaction data yet</div>
  );

  const maxVal  = Math.max(...months.flatMap(m => [m.income, m.expense]), 1);
  const cH      = 110;  // chart area height
  const barW    = 14;
  const gap     = 4;
  const groupW  = 44;
  const W       = months.length * groupW + 16;

  return (
    <div>
      <svg width={W} height={cH + 28} style={{ width: '100%', overflow: 'visible' }}
        viewBox={`0 0 ${W} ${cH + 28}`} preserveAspectRatio="xMinYMid meet">
        {/* Gridlines */}
        {[0, 0.5, 1].map(pct => {
          const y = (1 - pct) * cH;
          return <line key={pct} x1={0} y1={y} x2={W} y2={y} stroke={T.border} strokeWidth={0.5} strokeDasharray="3,3" />;
        })}
        {months.map((m, i) => {
          const x  = i * groupW + 8;
          const ih = (m.income  / maxVal) * cH;
          const eh = (m.expense / maxVal) * cH;
          return (
            <g key={m.key}>
              {/* Income bar */}
              <rect x={x} y={cH - ih} width={barW} height={Math.max(ih, 1)}
                fill={T.green} rx={3} opacity={0.85} />
              {/* Expense bar */}
              <rect x={x + barW + gap} y={cH - eh} width={barW} height={Math.max(eh, 1)}
                fill={T.red} rx={3} opacity={0.75} />
              {/* Month label */}
              <text x={x + barW + 1} y={cH + 18} textAnchor="middle"
                fontSize={10} fill={T.muted} fontFamily="-apple-system, sans-serif">{m.label}</text>
            </g>
          );
        })}
        {/* Baseline */}
        <line x1={0} y1={cH} x2={W} y2={cH} stroke={T.border} strokeWidth={1} />
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: T.muted }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: T.green, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}></span>Revenue</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: T.red, borderRadius: 2, marginRight: 4, verticalAlign: 'middle' }}></span>Expenses</span>
      </div>
    </div>
  );
}
// ─── Cash Flow Forecast Chart ──────────────────────────────────────────────────
function CashFlowForecastChart({ forecast, days, onDaysChange }) {
  if (!forecast) return <div style={{ color: T.muted, fontSize: 13, padding: '16px 0' }}>No forecast data yet.</div>;

  const weeks = forecast.weeks || [];
  const W = 640; const H = 210;
  const PAD = { top: 18, right: 16, bottom: 38, left: 66 };
  const cW = W - PAD.left - PAD.right;
  const cH = H - PAD.top  - PAD.bottom;

  if (!weeks.length) return <div style={{ color: T.muted, fontSize: 13 }}>No weekly data.</div>;

  const balances = weeks.map(w => w.runningBalance);
  const minBal = Math.min(0, ...balances);
  const maxBal = Math.max(0, ...balances);
  const range  = maxBal - minBal || 1;

  const sx = (i) => PAD.left + (i / (weeks.length - 1 || 1)) * cW;
  const sy = (v) => PAD.top + cH - ((v - minBal) / range) * cH;

  const pts   = weeks.map((w, i) => `${sx(i)},${sy(w.runningBalance)}`).join(' ');
  const zeroY = sy(0);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    value: minBal + f * range,
    y: PAD.top + cH * (1 - f),
  }));

  const fmt = (n) => {
    const abs = Math.abs(n || 0); const sign = (n || 0) < 0 ? '-' : '';
    if (abs >= 1000000) return sign + '₱' + (abs / 1000000).toFixed(1) + 'M';
    if (abs >= 1000)    return sign + '₱' + (abs / 1000).toFixed(0) + 'k';
    return sign + '₱' + abs.toFixed(0);
  };

  const s = forecast.summary?.[String(days)] || {};

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => onDaysChange(d)} style={{
            padding: '4px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontWeight: d === days ? 700 : 400, fontSize: 13,
            background: d === days ? T.accent : T.bg,
            color:      d === days ? '#fff'   : T.muted,
          }}>{d}d</button>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {ticks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={tick.y} x2={W - PAD.right} y2={tick.y}
              stroke={T.border} strokeWidth="1" strokeDasharray={tick.value === 0 ? 'none' : '3 3'} />
            <text x={PAD.left - 5} y={tick.y + 4} textAnchor="end" fontSize="10" fill={T.muted}>
              {fmt(tick.value)}
            </text>
          </g>
        ))}
        {minBal < 0 && maxBal > 0 && (
          <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY} stroke={T.muted} strokeWidth="1.5" />
        )}
        <polygon
          points={weeks.map((w, i) => `${sx(i)},${sy(Math.max(0, w.runningBalance))}`).join(' ')
            + ` ${sx(weeks.length - 1)},${zeroY} ${PAD.left},${zeroY}`}
          fill={T.green} opacity="0.12" />
        {minBal < 0 && (
          <polygon
            points={`${PAD.left},${zeroY} `
              + weeks.map((w, i) => `${sx(i)},${sy(Math.min(0, w.runningBalance))}`).join(' ')
              + ` ${sx(weeks.length - 1)},${zeroY}`}
            fill={T.red} opacity="0.15" />
        )}
        <polyline points={pts} fill="none" stroke={T.accent} strokeWidth="2.5" strokeLinejoin="round" />
        {weeks.map((w, i) => (
          <g key={i}>
            <title>{`Wk ${w.week} (${w.weekStart})\nBal: ${fmt(w.runningBalance)}\nAR: ${fmt(w.inflows)}\nExp: ${fmt(w.outflows)}\nTax: ${fmt(w.taxObligations)}`}</title>
            <circle cx={sx(i)} cy={sy(w.runningBalance)} r="3.5"
              fill={w.runningBalance >= 0 ? T.green : T.red} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}
        {weeks.map((w, i) => (i % 2 === 0 || i === weeks.length - 1) && (
          <text key={i} x={sx(i)} y={H - 4} textAnchor="middle" fontSize="9.5" fill={T.muted}>
            {w.weekStart.slice(5)}
          </text>
        ))}
      </svg>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginTop: 12 }}>
        {[
          { label: 'Opening',      value: fmt(forecast.openingBalance || 0), color: T.text   },
          { label: `${days}d In`,  value: fmt(s.inflows  || 0),             color: T.green  },
          { label: `${days}d Out`, value: fmt(s.outflows || 0),             color: T.red    },
          { label: `${days}d End`, value: fmt(s.endBalance ?? 0),
            color: (s.endBalance ?? 0) >= 0 ? T.green : T.red },
        ].map(c => (
          <div key={c.label} style={{ background: T.bg, borderRadius: 10, padding: '8px 10px', border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.muted, marginBottom: 3 }}>{c.label}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
        Based on last 90 days of expenses \xb7 AR from pending invoices \xb7 Estimated BIR tax obligations
      </div>
    </div>
  );
}


// ─── VAT Calc Preview ─────────────────────────────────────────────────────────
function VatCalc({ type, amount, vatType = 'vatable', supplierVatType = 'vat', isOPT = false, optRate = 0.03 }) {
  if (!amount || isNaN(amount) || Number(amount) <= 0) return null;
  const n = parseFloat(amount);
  const r = v => Math.round(v * 100) / 100;
  let net, vat = 0, gross, ptax = 0, msg;
  if (type === 'income') {
    if (isOPT) {
      net = n; gross = n; ptax = r(n * optRate);
      msg = `OPT — Gross = Sales. ${(optRate * 100).toFixed(1)}% percentage tax = ${peso(ptax)}`;
    } else if (vatType === 'zero_rated') {
      net = n; gross = n; msg = 'Zero-rated — 0% VAT. NET = GROSS.';
    } else if (vatType === 'exempt') {
      net = n; gross = n; msg = 'VAT-exempt — 0% VAT. NET = GROSS.';
    } else {
      net = n; vat = r(n * 0.12); gross = r(n * 1.12);
      msg = 'Vatable — customer pays GROSS (NET + 12% VAT).';
    }
  } else {
    if (supplierVatType === 'non_vat') {
      gross = n; net = n; msg = 'Non-VAT supplier — no input VAT extracted. NET = GROSS.';
    } else {
      gross = n; net = r(n / 1.12); vat = r(gross - net);
      msg = 'VAT supplier — extracting 12% input VAT from GROSS.';
    }
  }
  return (
    <div style={{ background: '#f0f7ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginTop: 6, marginBottom: 4 }}>
      <div style={{ color: T.muted, marginBottom: 6 }}>{msg}</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span>NET <strong style={{ color: T.text }}>{peso(net)}</strong></span>
        {vat > 0  && <span>VAT <strong style={{ color: T.orange }}>{peso(vat)}</strong></span>}
        {ptax > 0 && <span>% TAX <strong style={{ color: T.purple }}>{peso(ptax)}</strong></span>}
        {vat > 0  && <span>GROSS <strong style={{ color: T.accent }}>{peso(gross)}</strong></span>}
      </div>
    </div>
  );
}

// ─── TxModal (module-level — own state, no parent remount) ───────────────────
function TxModal({ clientId, client, onSaved, onClose, ewtRates = DEFAULT_EWT_RATES }) {
  const isMobile = useMobile();
  const isOPT   = client?.taxRegime === 'opt';
  const optRate = Number(client?.optRate) || 0.03;

  const today = new Date().toISOString().substring(0, 10);
  const blank = {
    type: 'income', amount: '', description: '', category: '', customCat: '',
    vatType: 'vatable', supplierVatType: 'vat',
    settlement: 'cash', account: '',
    counterpartyName: '', counterpartyTin: '', counterpartyAddress: '',
    referenceNo: '', notes: '',
    date: today,
    ewtRate: '0',
  };
  const [form,       setForm]       = useState(blank);
  const [saving,     setSaving]     = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg,     setOcrMsg]     = useState('');
  const fileRef = useRef(null);

  async function handleOcrFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrMsg('');
    try {
      const data = await scanReceipt(file);
      // Pre-fill form with whatever was extracted
      setForm(f => ({
        ...f,
        type:             'expense',   // receipts are almost always expenses
        amount:           data.amountGross ? String(data.amountGross) : f.amount,
        description:      data.description || data.vendor || f.description,
        counterpartyName: data.vendor      || f.counterpartyName,
        counterpartyTin:  data.tin         || f.counterpartyTin,
      }));
      const extracted = [
        data.amountGross ? `₱${data.amountGross.toLocaleString()} gross` : null,
        data.amountVat   ? `₱${data.amountVat.toLocaleString()} VAT`     : null,
        data.vendor      ? data.vendor                                    : null,
        data.date        ? data.date                                      : null,
      ].filter(Boolean).join(' · ');
      setOcrMsg(extracted ? `✅ Extracted: ${extracted}` : '⚠️ Scanned but could not read amounts — please fill in manually.');
    } catch (err) {
      setOcrMsg(`❌ ${err.message}`);
    } finally {
      setOcrLoading(false);
      e.target.value = '';   // allow re-scanning same file
    }
  }

  const cats     = form.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const isCustom = form.category === CUSTOM_OPT;
  const set      = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const incomeSettlements  = [
    { value: 'cash',          label: 'Cash on Hand' },
    { value: 'ar',            label: 'Accounts Receivable' },
    { value: 'ewallet',       label: 'E-wallet (GCash/Maya)' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
  ];
  const expenseSettlements = [
    { value: 'cash',          label: 'Cash on Hand' },
    { value: 'ap',            label: 'Accounts Payable' },
    { value: 'ewallet',       label: 'E-wallet' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'check',         label: 'Check' },
    { value: 'credit_card',   label: 'Credit Card' },
  ];
  const settlements = form.type === 'income' ? incomeSettlements : expenseSettlements;

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    const finalCat = isCustom ? form.customCat.trim() || 'Other' : form.category;
    try {
      await createTransaction({
        clientId, type: form.type, amount: parseFloat(form.amount),
        description: form.description,
        category: finalCat || undefined,
        vatType: form.type === 'income' ? (isOPT ? 'opt' : form.vatType) : undefined,
        supplierVatType: form.type === 'expense' ? form.supplierVatType : undefined,
        settlement: form.settlement,
        account: form.account || undefined,
        counterpartyName: form.counterpartyName, counterpartyTin: form.counterpartyTin,
        counterpartyAddress: form.counterpartyAddress,
        referenceNo: form.referenceNo, notes: form.notes,
        date: form.date || undefined,
        ewtRate: form.type === 'expense' ? Number(form.ewtRate) : 0,
      });
      onSaved(); onClose();
    } catch (e) { alert(e.message); setSaving(false); }
  }

  return (
    <ModalShell title="Add Transaction" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {/* ── OCR Receipt Scanner ── */}
        <input ref={fileRef} type="file" accept="image/*,application/pdf"
          style={{ display: 'none' }} onChange={handleOcrFile} />
        <div style={{ background: '#f5f0ff', border: `1px solid ${T.purple}30`, borderRadius: 10,
          padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>📸</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.purple }}>Scan Receipt</div>
              <div style={{ fontSize: 12, color: T.muted }}>
                {ocrLoading ? 'Reading receipt…' : 'Photo → auto-fill amount, vendor & TIN'}
              </div>
            </div>
            <Btn variant="ocr" size="sm" disabled={ocrLoading}
              onClick={() => fileRef.current?.click()}>
              {ocrLoading ? '⏳ Scanning…' : '📷 Scan'}
            </Btn>
          </div>
          {ocrMsg && (
            <div style={{ marginTop: 8, fontSize: 12,
              color: ocrMsg.startsWith('✅') ? T.green : ocrMsg.startsWith('⚠️') ? T.orange : T.red }}>
              {ocrMsg}
            </div>
          )}
        </div>

        {/* ── Date + Type + Amount ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 16px' }}>
          <Fld label="Transaction Date">
            <input style={inp} type="date" required
              value={form.date} onChange={set('date')} max={today} />
          </Fld>
          <Fld label="Type">
            <select style={inp} value={form.type} onChange={e => setForm(f => ({
              ...f, type: e.target.value, category: '', customCat: '', settlement: 'cash',
              vatType: 'vatable', supplierVatType: 'vat', ewtRate: '0',
            }))}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </Fld>
          <Fld label={form.type === 'income' ? (isOPT ? 'Amount — GROSS (Sales)' : 'Amount — NET (ex-VAT)') : 'Amount — GROSS (inc. VAT)'}>
            <input style={inp} type="number" step="0.01" min="0.01" required
              value={form.amount} onChange={set('amount')} placeholder="0.00" />
          </Fld>
        </div>

        {/* ── VAT / Tax type ── */}
        {form.type === 'income' && (
          isOPT ? (
            <div style={{ background: '#fff8ec', border: `1px solid ${T.orange}40`, borderRadius: 8,
              padding: '9px 14px', fontSize: 13, marginBottom: 10, color: '#7a5800' }}>
              <strong style={{ color: T.orange }}>OPT Client</strong> — Percentage Tax at {(optRate * 100).toFixed(1)}%.
              Gross amount = Sales. Input amount as gross sales.
            </div>
          ) : (
            <Fld label="VAT Type">
              <select style={inp} value={form.vatType} onChange={set('vatType')}>
                <option value="vatable">Vatable — 12% Output VAT</option>
                <option value="zero_rated">Zero-rated — 0% (exports, etc.)</option>
                <option value="exempt">VAT-exempt — 0% (no VAT at all)</option>
              </select>
            </Fld>
          )
        )}
        {form.type === 'expense' && (
          <Fld label="Supplier VAT Status">
            <select style={inp} value={form.supplierVatType} onChange={set('supplierVatType')}>
              <option value="vat">VAT Supplier — extract 12% input VAT from gross</option>
              <option value="non_vat">Non-VAT Supplier — no input VAT, gross = net</option>
            </select>
          </Fld>
        )}

        <VatCalc
          type={form.type} amount={form.amount}
          vatType={form.vatType} supplierVatType={form.supplierVatType}
          isOPT={form.type === 'income' && isOPT} optRate={optRate}
        />

        {/* ── Description + Reference ── */}
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Description *">
            <input style={inp} required value={form.description} onChange={set('description')}
              placeholder="Brief description" />
          </Fld>
          <Fld label="Reference / OR No.">
            <input style={inp} value={form.referenceNo} onChange={set('referenceNo')}
              placeholder="Invoice or OR number" />
          </Fld>
        </div>

        {/* ── Settlement + Account ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Settlement / Payment Method">
            <select style={inp} value={form.settlement} onChange={set('settlement')}>
              {settlements.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Fld>
          <Fld label="Account (optional)">
            <input style={inp} value={form.account} onChange={set('account')}
              placeholder={form.type === 'income' ? 'e.g. Sales Revenue' : 'e.g. Cost of Sales'} />
          </Fld>
        </div>

        {/* ── Category ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isCustom && !isMobile ? '1fr 1fr' : '1fr', gap: '0 16px' }}>
          <Fld label="Category">
            <select style={inp} value={form.category} onChange={set('category')}>
              <option value="">— Select category —</option>
              {cats.map(c => <option key={c}>{c}</option>)}
              <option value={CUSTOM_OPT}>{CUSTOM_OPT}</option>
            </select>
          </Fld>
          {isCustom && (
            <Fld label="Specify category">
              <input style={inp} value={form.customCat} onChange={set('customCat')}
                placeholder="Type category name…" autoFocus />
            </Fld>
          )}
        </div>

        {/* ── Counterparty ── */}
        <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <SectionHead>{form.type === 'income' ? 'Customer Details — SLSP' : 'Vendor Details — SLSP / Alphalist'}</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 16px' }}>
            <Fld label={form.type === 'income' ? 'Customer Name' : 'Vendor Name'}>
              <input style={inp} value={form.counterpartyName} onChange={set('counterpartyName')} placeholder="Optional" />
            </Fld>
            <Fld label="TIN">
              <input style={inp} value={form.counterpartyTin} onChange={set('counterpartyTin')} placeholder="000-000-000-000" />
            </Fld>
            <Fld label="Address">
              <input style={inp} value={form.counterpartyAddress} onChange={set('counterpartyAddress')} placeholder="Optional" />
            </Fld>
          </div>
        </div>

        {/* ── Expanded Withholding Tax (expense only) ── */}
        {form.type === 'expense' && (
          <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
            <SectionHead>Expanded Withholding Tax (EWT) — Optional</SectionHead>
            <Fld label="EWT Rate (ATC)">
              <select style={inp} value={form.ewtRate} onChange={set('ewtRate')}>
                <option value="0">— No EWT —</option>
                {ewtRates.map(r => (
                  <option key={r.atc} value={String(r.rate)}>
                    {(r.rate * 100).toFixed(r.rate % 0.01 === 0 ? 0 : 2)}% — {r.atc} · {r.description}
                  </option>
                ))}
              </select>
            </Fld>
            {Number(form.ewtRate) > 0 && form.amount && !isNaN(form.amount) && Number(form.amount) > 0 && (() => {
              const gross   = parseFloat(form.amount);
              const net     = form.supplierVatType === 'non_vat' ? gross : Math.round(gross / 1.12 * 100) / 100;
              const ewtAmt  = Math.round(net * Number(form.ewtRate) * 100) / 100;
              const netPay  = Math.round((gross - ewtAmt) * 100) / 100;
              return (
                <div style={{ background: '#fff8ec', border: `1px solid ${T.orange}40`, borderRadius: 8,
                  padding: '10px 14px', fontSize: 13, marginTop: 4, marginBottom: 4 }}>
                  <div style={{ color: '#7a5800', marginBottom: 6 }}>
                    <strong>You withhold ₱{ewtAmt.toLocaleString('en-PH', { minimumFractionDigits: 2 })} from this payment.</strong>
                  </div>
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', color: T.muted }}>
                    <span>Gross due <strong style={{ color: T.text }}>₱{gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></span>
                    <span>EWT withheld <strong style={{ color: T.orange }}>₱{ewtAmt.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></span>
                    <span>Net cash paid <strong style={{ color: T.accent }}>₱{netPay.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong></span>
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: T.muted }}>
                    Issue a BIR Form 2307 to your vendor/landlord as proof of withholding.
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        <Fld label="Notes">
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 52 }}
            value={form.notes} onChange={set('notes')} placeholder="Internal notes (not printed on reports)" />
        </Fld>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Transaction'}</Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── BusinessModal (module-level — own state) ─────────────────────────────────
function BusinessModal({ initialValues, isEdit, onSave, onClose }) {
  const isMobile = useMobile();
  const blank = { tradeName: '', tin: '', type: 'Corporation', address: '',
                  zipCode: '', telephone: '', rdoCode: '',
                  ownerBirthdate: '', incorporationDate: '',
                  civilStatus: 'Single', spouseTin: '', taxOption: 'graduated', isMsme: false,
                  taxTypes: [], subscriptionTier: 'free',
                  taxRegime: 'vat', optRate: '0.03' };
  const [form,   setForm]   = useState(() => initialValues ? { ...blank, ...initialValues } : blank);
  const [err,    setErr]    = useState('');
  const [saving, setSaving] = useState(false);

  const isSoleProp = form.type === 'Sole Proprietor';
  const set        = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  function toggleTT(code) {
    setForm(f => ({
      ...f,
      taxTypes: f.taxTypes.includes(code) ? f.taxTypes.filter(x => x !== code) : [...f.taxTypes, code],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.tradeName || !form.tin) { setErr('Trade Name and TIN are required.'); return; }
    if (isSoleProp && !form.ownerBirthdate) { setErr('Date of Birth is required for Sole Proprietors (needed for Form 1701).'); return; }
    setSaving(true); setErr('');
    try { await onSave(form); }
    catch (e) { setErr(e.message); setSaving(false); }
  }

  const tier = SUBSCRIPTION_TIERS.find(t => t.value === form.subscriptionTier) || SUBSCRIPTION_TIERS[0];

  return (
    <ModalShell title={isEdit ? 'Edit Business Details' : 'Set Up Your Business'} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>

        {/* ── Subscription tier ── */}
        <div style={{ marginBottom: 20, padding: '14px 16px', borderRadius: 10,
          background: '#fafafa', border: `1px solid ${T.border}` }}>
          <SectionHead>Subscription Plan</SectionHead>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {SUBSCRIPTION_TIERS.map(t => (
              <div key={t.value} onClick={() => setForm(f => ({ ...f, subscriptionTier: t.value }))}
                style={{ padding: '10px 12px', borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
                  border: `2px solid ${form.subscriptionTier === t.value ? t.color : T.border}`,
                  background: form.subscriptionTier === t.value ? `${t.color}14` : T.surface }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.color, marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.3 }}>{t.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Basic info ── */}
        <SectionHead>Business Information</SectionHead>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Trade Name *">
            <input style={inp} required value={form.tradeName} onChange={set('tradeName')} placeholder="ABC Corporation" />
          </Fld>
          <Fld label="TIN *">
            <input style={inp} required value={form.tin} onChange={set('tin')} placeholder="000-000-000-000" />
          </Fld>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Business Type">
            <select style={inp} value={form.type} onChange={set('type')}>
              {['Corporation','Sole Proprietor','One Person Corporation (OPC)','Partnership'].map(t => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Fld>
          <Fld label="Address">
            <input style={inp} value={form.address} onChange={set('address')} placeholder="Registered business address" />
          </Fld>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 16px' }}>
          <Fld label="ZIP Code">
            <input style={inp} value={form.zipCode} onChange={set('zipCode')} placeholder="1234" />
          </Fld>
          <Fld label="Telephone">
            <input style={inp} value={form.telephone} onChange={set('telephone')} placeholder="02-8123-4567" />
          </Fld>
          <Fld label="RDO Code">
            <input style={inp} value={form.rdoCode} onChange={set('rdoCode')} placeholder="e.g. 040" />
          </Fld>
        </div>

        {/* ── Sole Proprietor / Individual income tax fields (1701 / 1701A) ── */}
        {isSoleProp && (
          <div style={{ background: '#fffbec', border: `1px solid ${T.yellow}60`, borderRadius: 10,
            padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#a07000', marginBottom: 8 }}>
              📋 Required for BIR Form 1701 / 1701A (Annual Income Tax — Individual)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
              <Fld label="Owner's Date of Birth *">
                <input style={inp} type="date" value={form.ownerBirthdate} onChange={set('ownerBirthdate')} />
              </Fld>
              <Fld label="Civil Status">
                <select style={inp} value={form.civilStatus} onChange={set('civilStatus')}>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Head of Family">Head of Family</option>
                  <option value="Legally Separated">Legally Separated</option>
                  <option value="Widow/Widower">Widow/Widower</option>
                </select>
              </Fld>
            </div>
            {form.civilStatus === 'Married' && (
              <Fld label="Spouse's TIN">
                <input style={inp} value={form.spouseTin} onChange={set('spouseTin')} placeholder="000-000-000-000" />
              </Fld>
            )}
            <Fld label="Income Tax Option (1701A: 8% Flat vs. Graduated Rates)">
              <select style={inp} value={form.taxOption} onChange={set('taxOption')}>
                <option value="graduated">Graduated Rates (TRAIN Law — 0% to 35%)</option>
                <option value="8percent">8% Flat Tax on Gross Revenue − ₱250,000 (Form 1701A)</option>
                <option value="osd">Optional Standard Deduction (40% of Gross Revenue)</option>
              </select>
            </Fld>
          </div>
        )}

        {/* ── Corporation income tax fields (1702 / 1702Q) ── */}
        {!isSoleProp && (
          <div style={{ background: '#f0f4ff', border: `1px solid #4a6cf760`, borderRadius: 10,
            padding: '12px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#2a4a9f', marginBottom: 8 }}>
              📋 Required for BIR Form 1702 / 1702Q (Annual / Quarterly Corporate Income Tax)
            </div>
            <Fld label="Date of Incorporation">
              <input style={inp} type="date" value={form.incorporationDate} onChange={set('incorporationDate')} />
            </Fld>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
              cursor: 'pointer', marginTop: 4, marginBottom: 8 }}>
              <input type="checkbox" checked={!!form.isMsme}
                onChange={e => setForm(f => ({ ...f, isMsme: e.target.checked }))} />
              <span>Qualifies as MSME (Micro, Small, Medium Enterprise) — 20% RCIT rate instead of 25%</span>
            </label>
          </div>
        )}

        {/* ── Tax types ── */}
        <Fld label="Tax Obligations (check all that apply)">
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '6px 12px',
            padding: '12px', background: T.bg, borderRadius: 8 }}>
            {TAX_TYPES.map(o => (
              <label key={o.code} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={form.taxTypes.includes(o.code)} onChange={() => toggleTT(o.code)} />
                {o.label}
              </label>
            ))}
          </div>
        </Fld>

        {/* ── Tax regime ── */}
        <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <SectionHead>VAT / Tax Regime</SectionHead>
          <Fld label="Tax Regime">
            <select style={inp} value={form.taxRegime} onChange={set('taxRegime')}>
              <option value="vat">VAT Registered — 12% Output VAT on vatable sales</option>
              <option value="opt">Percentage Tax / OPT — Section 116 NIRC (Non-VAT)</option>
              <option value="non_vat_exempt">Non-VAT Exempt — no VAT, no percentage tax</option>
            </select>
          </Fld>
          {form.taxRegime === 'opt' && (
            <Fld label="OPT Rate (decimal)">
              <input style={inp} type="number" step="0.001" min="0.001" max="0.1"
                value={form.optRate} onChange={set('optRate')} placeholder="0.03" />
              <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                Enter as decimal: 0.03 = 3%, 0.01 = 1%. Common: 3% (general), 1% (TRAIN Law 2023-2025)
              </div>
            </Fld>
          )}
        </div>

        {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : isEdit ? 'Update' : 'Create Business'}</Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── AssignModal ──────────────────────────────────────────────────────────────
function AssignModal({ clientId, onSaved, onClose }) {
  const [email,     setEmail]     = useState('');
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState('');
  const [result,    setResult]    = useState(null);  // { type: 'assigned'|'invited', message, inviteUrl?, emailSent? }
  const [copied,    setCopied]    = useState(false);

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setErr('');
    try {
      const r = await assignAccountant(clientId, email);
      if (r.assigned) {
        setResult({ type: 'assigned', message: r.message });
        setTimeout(() => { onSaved(); onClose(); }, 1500);
      } else if (r.invited) {
        setResult({ type: 'invited', message: r.message, inviteUrl: r.inviteUrl, emailSent: r.emailSent });
        onSaved(); // refresh client list so pending invite shows in Business Setup
      }
    } catch (e) { setErr(e.message); setSaving(false); }
  }

  function copyLink() {
    if (!result?.inviteUrl) return;
    navigator.clipboard.writeText(result.inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Result screen (after submit) ─────────────────────────────────────────────
  if (result) {
    return (
      <ModalShell title="Assign Accountant" onClose={onClose}>
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>
            {result.type === 'assigned' ? '✅' : result.emailSent ? '📧' : '🔗'}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 8 }}>
            {result.type === 'assigned' ? 'Accountant Assigned!' : 'Invitation Sent!'}
          </div>
          <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>{result.message}</div>

          {/* Show copyable link when SMTP is not configured */}
          {result.type === 'invited' && result.inviteUrl && !result.emailSent && (
            <div style={{ marginTop: 16, background: '#f5f5f7', borderRadius: 10, padding: '12px 14px',
              textAlign: 'left', border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 6, fontWeight: 500 }}>
                📋 Share this invitation link with your accountant:
              </div>
              <div style={{ fontSize: 12, color: T.accent, wordBreak: 'break-all',
                fontFamily: 'monospace', lineHeight: 1.5, marginBottom: 10 }}>
                {result.inviteUrl}
              </div>
              <Btn size="sm" onClick={copyLink} style={{ width: '100%' }}>
                {copied ? '✓ Copied!' : 'Copy Link'}
              </Btn>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn onClick={onClose}>Done</Btn>
        </div>
      </ModalShell>
    );
  }

  // ── Entry form ────────────────────────────────────────────────────────────────
  return (
    <ModalShell title="Assign Accountant" onClose={onClose}>
      <p style={{ fontSize: 14, color: T.muted, marginBottom: 16, lineHeight: 1.6 }}>
        Enter your accountant's email. If they're already on MyLedger they'll be assigned immediately.
        Otherwise we'll send them an invitation to create a free accountant account.
      </p>
      <form onSubmit={handleSubmit}>
        <Fld label="Accountant's Email">
          <input style={inp} type="email" required value={email}
            onChange={e => setEmail(e.target.value)} placeholder="accountant@kaimanco.com" />
        </Fld>
        {err && <div style={{ color: T.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Please wait…' : 'Assign / Invite'}</Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── MetricCard ───────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: T.surface, borderRadius: T.radius, padding: '18px 22px',
      boxShadow: T.shadow, border: `1px solid ${T.border}`, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, color: color || T.text, letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── AssetModal (module-level) ────────────────────────────────────────────────
const ASSET_CATS = ['Machinery & Equipment','Furniture & Fixtures','Computer & IT Equipment',
  'Office Equipment','Transportation Equipment','Leasehold Improvements','Buildings','Other'];

function AssetModal({ clientId, onSaved, onClose }) {
  const isMobile = useMobile();
  const blank = { name: '', category: 'Machinery & Equipment', cost: '', salvageValue: '0',
                  usefulLifeMonths: '60', startDate: '', notes: '' };
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const cost    = parseFloat(form.cost) || 0;
  const salvage = parseFloat(form.salvageValue) || 0;
  const months  = parseInt(form.usefulLifeMonths) || 1;
  const depPM   = cost > 0 ? Math.round((cost - salvage) / months * 100) / 100 : 0;

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      await createAsset({ clientId, ...form,
        cost, salvageValue: salvage, usefulLifeMonths: months });
      onSaved(); onClose();
    } catch (err) { alert(err.message); setSaving(false); }
  }

  return (
    <ModalShell title="Add Fixed Asset" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <Fld label="Asset Name *">
          <input style={inp} required value={form.name} onChange={set('name')}
            placeholder="Office printer, Delivery van, etc." />
        </Fld>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Category">
            <select style={inp} value={form.category} onChange={set('category')}>
              {ASSET_CATS.map(c => <option key={c}>{c}</option>)}
            </select>
          </Fld>
          <Fld label="Acquisition Date *">
            <input style={inp} type="date" required value={form.startDate} onChange={set('startDate')} />
          </Fld>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 16px' }}>
          <Fld label="Cost (₱) *">
            <input style={inp} type="number" required step="0.01" min="0.01"
              value={form.cost} onChange={set('cost')} placeholder="0.00" />
          </Fld>
          <Fld label="Salvage Value (₱)">
            <input style={inp} type="number" step="0.01" min="0"
              value={form.salvageValue} onChange={set('salvageValue')} placeholder="0.00" />
          </Fld>
          <Fld label="Useful Life (months)">
            <input style={inp} type="number" min="1"
              value={form.usefulLifeMonths} onChange={set('usefulLifeMonths')} placeholder="60" />
          </Fld>
        </div>
        {depPM > 0 && (
          <div style={{ background: '#f0f7ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 10 }}>
            Monthly Depreciation (Straight-Line): <strong>{peso(depPM)}</strong> ·
            Total: <strong>{peso(Math.round((cost - salvage) * 100) / 100)}</strong> over {months} months
          </div>
        )}
        <Fld label="Notes">
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 48 }}
            value={form.notes} onChange={set('notes')} placeholder="Optional notes" />
        </Fld>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Asset'}</Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── LapsingModal (module-level) ──────────────────────────────────────────────
function LapsingModal({ data, onClose }) {
  if (!data) return null;
  const { asset, schedule } = data;
  return (
    <ModalShell title={`Lapsing Schedule — ${asset.name}`} onClose={onClose} wide>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16,
        background: T.bg, padding: '12px 16px', borderRadius: 10 }}>
        {[['Cost', peso(asset.cost)], ['Salvage', peso(asset.salvageValue)],
          ['Monthly Dep.', peso(asset.monthlyDepreciation)],
          ['Total Dep.', peso(asset.totalDepreciation)],
          ['Method', asset.method]].map(([l,v]) => (
          <div key={l}>
            <div style={{ fontSize: 11, color: T.muted }}>{l}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ overflowY: 'auto', overflowX: 'auto', maxHeight: 400, border: `1px solid ${T.border}`, borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: T.bg, position: 'sticky', top: 0 }}>
              {['Period','Depreciation','Accumulated','Book Value'].map(h => (
                <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 600,
                  color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.map((r, i) => (
              <tr key={r.period} style={{ borderBottom: i < schedule.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                <td style={{ padding: '7px 14px', fontFamily: 'monospace', fontSize: 12, color: T.muted }}>{r.period}</td>
                <td style={{ padding: '7px 14px' }}>{peso(r.depreciation)}</td>
                <td style={{ padding: '7px 14px', color: T.orange }}>{peso(r.accumulated)}</td>
                <td style={{ padding: '7px 14px', fontWeight: 600, color: T.accent }}>{peso(r.bookValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}



// ─── Install Settings Button (for Business Setup tab) ────────────────────────
function InstallSettingsButton({ T }) {
  const [platform,       setPlatform]       = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed,      setInstalled]      = useState(false);
  const [expanded,       setExpanded]       = useState(false);
  const [dismissed,      setDismissed]      = useState(
    !!localStorage.getItem('ml_install_dismissed')
  );

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setInstalled(true);
      return;
    }
    const ua = navigator.userAgent;
    const isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);
    const isMac     = /Macintosh/.test(ua) && !isIOS;
    const isChrome  = /Chrome/.test(ua) && !/Edg/.test(ua);
    const isEdge    = /Edg/.test(ua);
    const isSafari  = /Safari/.test(ua) && !isChrome && !isEdge && !/CriOS|FxiOS/.test(ua);

    if (isIOS && isSafari)  { setPlatform('ios');        return; }
    if (isMac && isSafari)  { setPlatform('mac-safari'); return; }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform(isAndroid ? 'android' : 'desktop');
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setInstalled(true);
    }
  };

  const showBanner = () => {
    localStorage.removeItem('ml_install_dismissed');
    setDismissed(false);
    // Trigger re-check of InstallPrompt by refreshing
    window.location.reload();
  };

  const instructions = {
    ios: ['Tap the Share button (box with arrow) in Safari', 'Scroll down and tap "Add to Home Screen"', 'Tap "Add" to confirm'],
    'mac-safari': ['Click the Share button in the Safari toolbar', 'Choose "Add to Dock"', 'Click "Add" to confirm'],
  };

  if (installed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#22c55e', fontWeight: 600, fontSize: 14 }}>
        <span style={{ fontSize: 20 }}>✅</span> MyLedger is already installed on this device.
      </div>
    );
  }

  const steps = instructions[platform];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Native install button (Chrome/Edge/Android) */}
      {deferredPrompt && (
        <div>
          <Btn onClick={handleInstall} style={{ gap: 8 }}>
            📲 Install MyLedger
          </Btn>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
            Installs as a standalone app on this device — no App Store required.
          </div>
        </div>
      )}

      {/* Manual steps for iOS / macOS Safari */}
      {steps && (
        <div>
          <div
            style={{ fontSize: 14, color: T.accent, cursor: 'pointer', fontWeight: 500 }}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? '▾ Hide' : '▸ Show'} install steps for this device
          </div>
          {expanded && (
            <ol style={{ margin: '10px 0 0 18px', padding: 0, fontSize: 13, color: T.text, lineHeight: 1.8 }}>
              {steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}
        </div>
      )}

      {/* No prompt and no manual steps = browser doesn't support PWA install */}
      {!deferredPrompt && !steps && (
        <div style={{ fontSize: 13, color: T.muted }}>
          Your current browser does not support direct install. Try opening MyLedger in Chrome, Edge, or Safari.
        </div>
      )}

      {/* Re-show install banner if it was dismissed */}
      {dismissed && (
        <div style={{ marginTop: 4, fontSize: 13, color: T.muted }}>
          You dismissed the install banner. <span style={{ color: T.accent, cursor: 'pointer', textDecoration: 'underline' }}
            onClick={showBanner}>Show it again</span>
        </div>
      )}
    </div>
  );
}

// ─── PWA Install Prompt ───────────────────────────────────────────────────────
function InstallPrompt() {
  const [show,           setShow]           = useState(false);
  const [platform,       setPlatform]       = useState('');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [expanded,       setExpanded]       = useState(false);

  useEffect(() => {
    if (localStorage.getItem('ml_install_dismissed')) return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator.standalone) return;

    const ua = navigator.userAgent;
    const isIOS     = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isAndroid = /Android/.test(ua);
    const isMac     = /Macintosh/.test(ua) && !isIOS;
    const isChrome  = /Chrome/.test(ua) && !/Edg/.test(ua);
    const isEdge    = /Edg/.test(ua);
    const isSafari  = /Safari/.test(ua) && !isChrome && !isEdge && !/CriOS|FxiOS/.test(ua);

    if (isIOS && isSafari)  { setPlatform('ios');        setShow(true); return; }
    if (isMac && isSafari)  { setPlatform('mac-safari'); setShow(true); return; }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform(isAndroid ? 'android' : 'desktop');
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem('ml_install_dismissed', '1');
    setShow(false);
  };

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') dismiss();
    }
  };

  if (!show) return null;

  const instructions = {
    ios: [
      'Tap the Share button (box with arrow) in Safari',
      'Scroll down and tap "Add to Home Screen"',
      'Tap "Add" to confirm',
    ],
    'mac-safari': [
      'Click the Share button in the Safari toolbar',
      'Choose "Add to Dock"',
      'Click "Add" to confirm',
    ],
    android: null,
    desktop: null,
  };

  const steps = instructions[platform];

  return (
    <div style={{
      background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)',
      border: '1px solid #2a5298',
      borderRadius: 12,
      padding: '14px 18px',
      marginBottom: 16,
      display: 'flex',
      alignItems: 'flex-start',
      gap: 14,
      boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    }}>
      <span style={{ fontSize: 28, flexShrink: 0 }}>📲</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: '#e8f0fe', fontSize: 15, marginBottom: 4 }}>
          Install MyLedger for quick access
        </div>
        {steps ? (
          <>
            <div
              style={{ color: '#93b4e8', fontSize: 13, cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded ? '▾ Hide steps' : '▸ Show how to install'}
            </div>
            {expanded && (
              <ol style={{ margin: '8px 0 0 18px', padding: 0, color: '#c8daf5', fontSize: 13, lineHeight: 1.7 }}>
                {steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
          </>
        ) : (
          <div style={{ color: '#93b4e8', fontSize: 13, marginTop: 2 }}>
            Add it to your home screen for a faster, app-like experience.
          </div>
        )}
        {!steps && (
          <button
            onClick={handleInstall}
            style={{
              marginTop: 10,
              background: '#2a5298',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '7px 18px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Install App
          </button>
        )}
      </div>
      <button
        onClick={dismiss}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#7a9cc8',
          fontSize: 18,
          cursor: 'pointer',
          padding: '0 4px',
          lineHeight: 1,
          flexShrink: 0,
        }}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

const TABS = ['Overview', 'Transactions', 'Invoices', 'Income Statement', 'Balance Sheet', 'Cash Flow', 'Books', 'Assets', 'BIR Reminders', 'Referral', 'Business Setup'];
// Minimum tier required per tab (undefined = always accessible)
const TAB_TIER = {
  'BIR Reminders':   'starter',
  'Income Statement':'starter',
  'Balance Sheet':   'starter',
  'Cash Flow':       'starter',
  'Assets':          'starter',
  'Books':           'professional',
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ClientInterface({ onLogout }) {
  const isMobile = useMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab,       setTab]      = useState('Overview');
  const [clients,   setClients]  = useState([]);
  const [active,    setActive]   = useState(null);
  const [clLoading, setCLL]      = useState(true);

  // Overview data
  const [income,    setIncome]   = useState(null);
  const [vatBal,    setVatBal]   = useState(null);
  const [overTxns,  setOverTxns] = useState([]);   // all txns for chart
  const [deadlines, setDL]       = useState([]);

  // Transactions tab
  const [txns,   setTxns]   = useState([]);
  const [txLoad, setTxLoad] = useState(false);
  // BIR 2307 period picker
  const now0 = new Date();
  const [ewt2307Year, setEwt2307Year] = useState(now0.getFullYear());
  const [ewt2307Q,    setEwt2307Q]    = useState(Math.ceil((now0.getMonth() + 1) / 3));

  // BIR tab
  const [birLoad, setBirLoad] = useState(false);

  // Income Statement tab
  const [incFrom, setIncFrom] = useState('');
  const [incTo,   setIncTo]   = useState('');
  const [incRep,  setIncRep]  = useState(null);
  const [incLoad, setIncLoad] = useState(false);

  // Balance Sheet tab
  const [balAsOf,  setBalAsOf]  = useState('');
  const [balRep,   setBalRep]   = useState(null);
  const [balLoad,  setBalLoad]  = useState(false);

  // Cash Flow tab
  const [cfFrom,  setCfFrom]  = useState('');
  const [cfTo,    setCfTo]    = useState('');
  const [cfRep,   setCfRep]   = useState(null);
  const [cfLoad,  setCfLoad]  = useState(false);

  // Books tab
  const [booksType, setBooksType] = useState('sales');
  const [booksFrom, setBooksFrom] = useState('');
  const [booksTo,   setBooksTo]   = useState('');
  const [booksData, setBooksData] = useState(null);
  const [booksLoad, setBooksLoad] = useState(false);

  // Assets tab
  const [assets,       setAssets]       = useState([]);
  const [assetLoad,    setAssetLoad]    = useState(false);
  const [showAsset,    setShowAsset]    = useState(false);
  const [showLapsing,  setShowLapsing]  = useState(false);
  const [lapsingData,  setLapsingData]  = useState(null);

  // Referral tab
  const [refData,   setRefData]   = useState(null);
  const [refLoad,   setRefLoad]   = useState(false);
  const [refErr,    setRefErr]    = useState('');
  const [refCopied, setRefCopied] = useState(false);

  // Site settings (pricing, payment accounts)
  const [siteSettings, setSiteSettings] = useState(DEFAULT_SETTINGS);

  // Modals
  const [showTx,      setShowTx]      = useState(false);
  const [showBiz,       setShowBiz]       = useState(false);
  const [bizIsEdit,     setBizIsEdit]     = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showAssign,    setShowAssign]    = useState(false);
  const [pendingInvite, setPendingInvite] = useState(null);  // { email, expires_at } or null
  const [showPayment,   setShowPayment]   = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showBSImport,  setShowBSImport]  = useState(false);
  const [showPricing,   setShowPricing]   = useState(false);
  const [trialStatus,   setTrialStatus]   = useState(null);
  const [narrative,     setNarrative]     = useState(null);
  const [narrativeLoad, setNarrativeLoad] = useState(false);
  const [forecast,      setForecast]      = useState(null);
  const [forecastDays,  setForecastDays]  = useState(90);
  const [forecastLoad,  setForecastLoad]  = useState(false);
  const [cashPos,       setCashPos]       = useState(null);
  const [overviewErr,   setOverviewErr]   = useState('');
  const [receiptTx,     setReceiptTx]     = useState(null);
  const [receiptList,   setReceiptList]   = useState([]);
  const [receiptLoad,   setReceiptLoad]   = useState(false);
  const [receiptUploading, setReceiptUploading] = useState(false);

  useEffect(() => {
    loadClients();
    getPublicSettings().then(r => { if (r) setSiteSettings(r); }).catch(() => {});
    getTrialStatus().then(t => { if (t) setTrialStatus(t); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!active) return;
    if (tab === 'Overview')      { loadOverview(); loadNarrative(); }
    if (tab === 'Transactions')  loadTxns();
    if (tab === 'BIR Reminders') loadBIR();
    if (tab === 'Assets')        loadAssets();
    if (tab === 'Referral')      loadReferrals();
  }, [active?.id, tab]);

  // Load pending accountant invite whenever active client changes
  useEffect(() => {
    loadPendingInvite(active?.id || null);
  }, [active?.id]);

  async function loadClients() {
    setCLL(true);
    try {
      const r = await getClients();
      setClients(r.clients || []);
      if (r.clients?.length > 0) setActive(r.clients[0]);
    } catch (e) { console.error(e); }
    finally { setCLL(false); }
  }

  async function loadPendingInvite(clientId) {
    if (!clientId) { setPendingInvite(null); return; }
    try {
      const r = await getPendingInvite(clientId);
      setPendingInvite(r.invite || null);
    } catch (e) {
      setPendingInvite(null);
    }
  }

  // Silent cache-only load — never triggers AI generation on tab open.
  // The user explicitly generates/refreshes via the button.
  async function loadNarrative() {
    if (!active) return;
    try {
      const data = await getNarrative(active.id);
      setNarrative(data);
    } catch (e) { /* silent — narrative is optional */ }
  }

  async function loadOverview() {
    setOverviewErr('');
    try {
      const [inc, vat, txRes, dl] = await Promise.all([
        getIncomeReport(active.id),
        getBirVatBalance(active.id),
        getTransactions(active.id),
        getBirDeadlines(active.id),
      ]);
      setIncome(inc); setVatBal(vat);
      setOverTxns(txRes.transactions || []);
      setDL(dl.deadlines || []);
      // Cash Position — derived from income + VAT balance
      if (inc) {
        setCashPos({
          cash:       (inc.grossRevenue || inc.revenue * 1.12 || 0) - (inc.grossExpenses || inc.expenses * 1.12 || 0),
          netProfit:  inc.profit || 0,
          vatPayable: Math.max(0, (vat?.outputVAT || 0) - (vat?.inputVAT || 0)),
        });
      }
      try { const fc = await getCashFlowForecast(active.id, 90); setForecast(fc); } catch (e) { /* optional */ }
    } catch (e) {
      console.error('Overview load failed:', e);
      setOverviewErr(e.message || 'Failed to load dashboard data. Please refresh.');
    }
  }

  async function loadTxns() {
    setTxLoad(true);
    try { const r = await getTransactions(active.id); setTxns(r.transactions || []); }
    catch (e) { console.error(e); }
    finally { setTxLoad(false); }
  }

  async function loadBIR() {
    setBirLoad(true);
    try {
      const [dl, vat] = await Promise.all([getBirDeadlines(active.id), getBirVatBalance(active.id)]);
      setDL(dl.deadlines || []); setVatBal(vat);
    } catch (e) { console.error(e); }
    finally { setBirLoad(false); }
  }

  async function loadAssets() {
    setAssetLoad(true);
    try { const r = await getAssets(active.id); setAssets(r.assets || []); }
    catch (e) { console.error(e); } finally { setAssetLoad(false); }
  }

  async function loadReferrals() {
    setRefLoad(true); setRefErr('');
    try { const r = await getMyReferrals(); setRefData(r); }
    catch (e) { console.error('Referral load error:', e); setRefErr(e.message || 'Failed to load referral data'); }
    finally { setRefLoad(false); }
  }

  async function loadIncReport() {
    setIncLoad(true);
    try { setIncRep(await getIncomeReport(active.id, incFrom || undefined, incTo || undefined)); }
    catch (e) { console.error(e); } finally { setIncLoad(false); }
  }

  async function loadBalReport() {
    setBalLoad(true);
    try { setBalRep(await getBalanceReport(active.id, balAsOf || undefined)); }
    catch (e) { console.error(e); } finally { setBalLoad(false); }
  }

  async function loadCfReport() {
    setCfLoad(true);
    try { setCfRep(await getCashFlowReport(active.id, cfFrom || undefined, cfTo || undefined)); }
    catch (e) { console.error(e); } finally { setCfLoad(false); }
  }

  async function loadBooksReport() {
    setBooksLoad(true);
    try { setBooksData(await getBooksReport(active.id, booksType, booksFrom || undefined, booksTo || undefined)); }
    catch (e) { console.error(e); } finally { setBooksLoad(false); }
  }

  async function deleteAssetItem(id) {
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    await deleteAsset(id); loadAssets();
  }

  async function viewLapsing(id) {
    try { const r = await getLapsing(id); setLapsingData(r); setShowLapsing(true); }
    catch (e) { alert(e.message); }
  }

  async function openReceipts(tx) {
    setReceiptTx(tx);
    setReceiptLoad(true);
    try { const r = await getReceipts(tx.id); setReceiptList(r.attachments || []); }
    catch (e) { console.error(e); }
    finally { setReceiptLoad(false); }
  }

  async function handleReceiptUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !receiptTx) return;
    setReceiptUploading(true);
    try {
      const att = await uploadReceipt(receiptTx.id, file);
      setReceiptList(prev => [...prev, att]);
    } catch (err) { alert(err.message || 'Upload failed'); }
    finally { setReceiptUploading(false); e.target.value = ''; }
  }

  async function handleReceiptDelete(attachId) {
    if (!receiptTx || !confirm('Delete this attachment?')) return;
    await deleteReceipt(receiptTx.id, attachId);
    setReceiptList(prev => prev.filter(a => a.id !== attachId));
  }

  async function voidTx(id) {
    const reason = window.prompt('Void reason (required for audit trail):');
    if (reason === null) return;
    if (!reason.trim()) { alert('A void reason is required.'); return; }
    try { await voidTransaction(id, reason.trim()); loadTxns(); loadOverview(); }
    catch (e) { alert(e.message); }
  }

  async function handleBackup() {
    try {
      const data = await backupClient(active.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `myledger-${active.tradeName.replace(/\s+/g, '-')}-${Date.now()}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { alert(e.message); }
  }

  async function handleDeleteBiz() {
    // Open the confirmation modal instead of browser confirm()
    setDeleteConfirmText('');
    setShowDeleteConfirm(true);
  }

  async function confirmDeleteBiz() {
    try {
      await deleteClient(active.id);
      const rest = clients.filter(c => c.id !== active.id);
      setClients(rest); setActive(rest[0] || null);
      setTxns([]); setIncome(null); setVatBal(null); setDL([]); setOverTxns([]); setCashPos(null); setOverviewErr('');
    } catch (e) { alert(e.message); }
    setShowDeleteConfirm(false);
    setDeleteConfirmText('');
  }

  async function saveBusiness(form) {
    if (bizIsEdit) {
      const r = await updateClient(active.id, form);
      setActive(r.client);
      setClients(cs => cs.map(c => c.id === r.client.id ? r.client : c));
    } else {
      const r = await createClient(form);
      setClients(cs => [r.client, ...cs]); setActive(r.client);
    }
    setShowBiz(false);
  }

  const tierInfo     = SUBSCRIPTION_TIERS.find(t => t.value === active?.subscriptionTier) || SUBSCRIPTION_TIERS[0];
  const tier         = active?.subscriptionTier || 'free';
  const upcomingTop3 = deadlines.slice(0, 3);
  const openUpgrade  = () => setShowPayment(true);

  // Transaction limit for current tier
  const txLimit      = TIER_LIMITS[tier] ?? null;
  const thisMonthKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const txThisMonth  = overTxns.filter(t => t.createdAt?.startsWith(thisMonthKey)).length;
  const txPct        = txLimit ? Math.min((txThisMonth / txLimit) * 100, 100) : 0;
  const txAtLimit    = txLimit !== null && txThisMonth >= txLimit;
  const txNearLimit  = txLimit !== null && txThisMonth >= txLimit * 0.8 && !txAtLimit;

  // ── No-business onboarding ────────────────────────────────────────────────
  if (!clLoading && clients.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 440 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🏢</div>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: T.text, marginBottom: 10 }}>Welcome to MyLedger</h2>
          <p style={{ color: T.muted, lineHeight: 1.6, marginBottom: 28 }}>
            Set up your business profile to start tracking income, expenses, and VAT.
          </p>
          <Btn size="lg" onClick={() => { setBizIsEdit(false); setShowBiz(true); }}>+ Set Up My Business</Btn>
        </div>
        {showBiz && <BusinessModal isEdit={false} onSave={saveBusiness} onClose={() => setShowBiz(false)} />}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
      color: T.text }}>

      {/* Trial Banner */}
      <TrialBanner onUpgradeClick={() => setShowPricing(true)} />
      <InstallPrompt />

      {/* Pricing Modal */}
      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          userRole="client"
          trialStatus={trialStatus}
        />
      )}

      {/* ── Delete confirmation modal ── */}
      {showDeleteConfirm && active && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 420, width: '100%',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 32, marginBottom: 8, textAlign: 'center' }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, textAlign: 'center', color: T.red }}>
              Delete Business?
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 1.6 }}>
              This will permanently delete <strong style={{ color: T.text }}>{active.tradeName}</strong> and{' '}
              <strong style={{ color: T.red }}>all its transactions, reports, assets, and invoices</strong>.
              This cannot be undone.
            </p>
            <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: T.text }}>
              Type the business name to confirm:
            </p>
            <input
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={active.tradeName}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
                fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: `1px solid ${T.border}`,
                  background: '#fff', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                disabled={deleteConfirmText.trim() !== active.tradeName.trim()}
                onClick={confirmDeleteBiz}
                style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                  background: deleteConfirmText.trim() === active.tradeName.trim() ? T.red : '#ffd5d5',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: deleteConfirmText.trim() === active.tradeName.trim() ? 'pointer' : 'not-allowed' }}>
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        {isMobile ? (
          /* ── Mobile top bar ── */
          <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', height: 52 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>MyLedger</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => { setBizIsEdit(false); setShowBiz(true); }}>+ Biz</Btn>
              <NotificationBell accentColor={T.accent} />
              <Btn variant="neutral" size="sm" onClick={onLogout}>Sign out</Btn>
            </div>
          </div>
        ) : (
          /* ── Desktop header ── */
          <div style={{ maxWidth: 1140, margin: '0 auto', padding: '0 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>MyLedger</span>
                <span style={{ color: T.muted, fontSize: 14 }}> by Kaiman & Co.</span>
              </div>
              {clients.length > 0 && (
                <>
                  <span style={{ color: T.border, fontSize: 18 }}>|</span>
                  <select value={active?.id || ''} onChange={e => {
                    const c = clients.find(x => x.id === e.target.value);
                    setActive(c); setTxns([]); setIncome(null); setVatBal(null); setDL([]); setOverTxns([]); setCashPos(null); setOverviewErr('');
                  }} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600,
                    color: T.text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
                  </select>
                  {active && (
                    <span style={{ background: `${tierInfo.color}18`, color: tierInfo.color,
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                      textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      {tierInfo.label}
                    </span>
                  )}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn variant="ghost" size="sm" onClick={() => { setBizIsEdit(false); setShowBiz(true); }}>+ Business</Btn>
              <NotificationBell accentColor={T.accent} />
              <Btn variant="neutral" size="sm" onClick={onLogout}>Sign out</Btn>
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1140, margin: '0 auto', padding: isMobile ? '20px 16px 48px' : '28px 24px 56px',
        minWidth: 0, overflowX: 'hidden' }}>

        {/* Mobile: client selector */}
        {isMobile && clients.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <select value={active?.id || ''} onChange={e => {
              const c = clients.find(x => x.id === e.target.value);
              setActive(c); setTxns([]); setIncome(null); setVatBal(null); setDL([]); setOverTxns([]); setCashPos(null); setOverviewErr('');
            }} style={{ ...inp, fontWeight: 600 }}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
            </select>
          </div>
        )}

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: T.surface, padding: 4,
          borderRadius: 10, boxShadow: T.shadow, flexWrap: 'wrap',
          overflowX: isMobile ? 'auto' : 'visible' }}>
          {TABS.map(t => {
            const locked = TAB_TIER[t] && !tierMeets(tier, TAB_TIER[t]);
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500, fontFamily: 'inherit', transition: 'all .15s',
                background: tab === t ? T.accent : 'transparent',
                color: tab === t ? '#fff' : locked ? T.border : T.muted,
                display: 'flex', alignItems: 'center', gap: 5 }}>
                {t}{locked && <span style={{ fontSize: 11 }}>🔒</span>}
              </button>
            );
          })}
        </div>

        {!active && tab !== 'Referral' && <div style={{ color: T.muted, textAlign: 'center', padding: 60 }}>Add a business to get started.</div>}

        {/* ── Subscription expired banner ── */}
        {active && active.subscriptionTier === 'free' && active.subscriptionExpiresAt &&
          new Date(active.subscriptionExpiresAt) < new Date() && (
          <div style={{ background: '#fff5f5', border: '1px solid #ff3b3040', borderRadius: T.radius,
            padding: '16px 20px', marginBottom: 20,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 24 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: T.red }}>
                  Your subscription has expired
                </div>
                <div style={{ fontSize: 13, color: '#3d3d3f', marginTop: 3, lineHeight: 1.5 }}>
                  <strong>{active.tradeName}</strong> has been downgraded to the Free plan.
                  Reports, BIR reminders, and other premium features are now locked.
                  Renew your plan to restore full access.
                </div>
              </div>
            </div>
            <button onClick={() => setShowPayment(true)} style={{
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: T.red, color: '#fff', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
            }}>
              Renew Plan →
            </button>
          </div>
        )}

        {/* ══════════ OVERVIEW ══════════ */}
        {tab === 'Overview' && active && (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>{active.tradeName}</h2>
              <span style={{ fontSize: 13, color: T.muted }}>TIN {active.tin} · {active.type}</span>
            </div>

            {/* Error banner */}
            {overviewErr && (
              <div style={{ background: '#fff5f5', border: '1px solid #fca5a5', borderRadius: 10,
                padding: '10px 16px', marginBottom: 16, fontSize: 13, color: '#b91c1c' }}>
                ⚠️ {overviewErr}
              </div>
            )}

            {/* P&L cards */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
              <MetricCard label="Net Revenue"  value={income ? peso(income.revenue)  : '—'} sub="VAT-exclusive" color={T.green} />
              <MetricCard label="Net Expenses" value={income ? peso(income.expenses) : '—'} sub="VAT-exclusive" color={T.red} />
              <MetricCard label="Net Profit"   value={income ? peso(income.profit)   : '—'}
                sub={income ? (income.profit >= 0 ? 'Profitable ✓' : 'Net loss') : ''}
                color={!income ? T.text : income.profit >= 0 ? T.accent : T.red} />
              <MetricCard label="Output VAT"   value={vatBal ? peso(vatBal.outputVAT) : '—'} sub="Payable to BIR" color={T.orange} />
              <MetricCard label="Total Transactions" value={overTxns.length} sub="recorded" color={T.text} />
            </div>

            {/* Chart + Upcoming filings — Starter+ */}
            <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 20, marginBottom: 20 }}>
              {/* Monthly chart */}
              <Card>
                <SectionHead>Monthly Revenue vs. Expenses (last 6 months)</SectionHead>
                <MonthlyBarChart transactions={overTxns} />
              </Card>

              {/* Upcoming filings */}
              <Card>
                <SectionHead>Upcoming BIR Filings</SectionHead>
                {(active.taxTypes || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
                    No tax types configured.<br />
                    <span style={{ color: T.accent, cursor: 'pointer' }}
                      onClick={() => setTab('Business Setup')}>Set up in Business Setup →</span>
                  </div>
                ) : upcomingTop3.length === 0 ? (
                  <div style={{ fontSize: 13, color: T.muted }}>No upcoming deadlines found.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {upcomingTop3.map((d, i) => {
                      const uc  = d.urgency === 'urgent' ? T.red : d.urgency === 'upcoming' ? T.orange : T.green;
                      const ubg = d.urgency === 'urgent' ? '#fff5f5' : d.urgency === 'upcoming' ? '#fff8ec' : '#f0fff4';
                      return (
                        <div key={i} style={{ background: ubg, borderRadius: 10, padding: '10px 14px',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          border: `1px solid ${uc}20` }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{d.form}</div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{fmtDt(d.dueDate)}</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, fontSize: 16, color: uc }}>{d.daysUntil}d</div>
                            <div style={{ fontSize: 10, color: uc, textTransform: 'uppercase', fontWeight: 600 }}>{d.urgency}</div>
                          </div>
                        </div>
                      );
                    })}
                    {deadlines.length > 3 && (
                      <div onClick={() => setTab('BIR Reminders')}
                        style={{ fontSize: 12, color: T.accent, cursor: 'pointer', paddingTop: 4 }}>
                        View all {deadlines.length} deadlines →
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>
            </UpgradeGate>

            {/* VAT position — Starter+ */}
            <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
              <Card style={{ marginTop: 20 }}>
                <SectionHead>VAT Position</SectionHead>
                <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Input VAT (recoverable)</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.green }}>{peso(vatBal?.inputVAT)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Output VAT (payable)</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.orange }}>{peso(vatBal?.outputVAT)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Net to BIR</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: (vatBal?.netVATPayable ?? 0) >= 0 ? T.red : T.green }}>
                      {peso(Math.abs(vatBal?.netVATPayable ?? 0))}
                      <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 8, color: T.muted }}>{vatBal?.status}</span>
                    </div>
                  </div>
                </div>
              </Card>
            </UpgradeGate>

            {/* ── Cash Position — Starter+ ── */}
            {cashPos && (
              <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
                <Card style={{ marginTop: 20 }}>
                  <SectionHead>💵 Cash Position</SectionHead>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {[
                      { label: 'Estimated Cash (this period)', value: cashPos.cash,       color: cashPos.cash >= 0 ? T.green : T.red },
                      { label: 'Net Profit / Loss',            value: cashPos.netProfit,  color: cashPos.netProfit >= 0 ? T.accent : T.red },
                      { label: 'VAT to Remit to BIR',         value: cashPos.vatPayable, color: cashPos.vatPayable > 0 ? T.orange : T.green },
                    ].map(m => (
                      <div key={m.label} style={{ flex: 1, minWidth: 160, padding: '12px 16px',
                        background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 5 }}>{m.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{peso(m.value)}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 10 }}>
                    Cash estimate = gross income received − gross expenses paid this period.
                    Set aside the VAT amount before the 20th for BIR remittance.
                  </div>
                </Card>
              </UpgradeGate>
            )}

            {/* ── Cash Flow Forecast ── */}
            <Card style={{ marginTop: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionHead style={{ margin: 0 }}>📈 Cash Flow Forecast</SectionHead>
                {forecastLoad && <span style={{ fontSize: 12, color: T.muted }}>Loading…</span>}
              </div>
              <CashFlowForecastChart
                forecast={forecast}
                days={forecastDays}
                onDaysChange={async (d) => {
                  setForecastDays(d);
                  setForecastLoad(true);
                  try { setForecast(await getCashFlowForecast(active.id, d)); }
                  catch (e) { console.error(e); }
                  finally { setForecastLoad(false); }
                }}
              />
            </Card>

            {/* ── AI Narrative — Starter+ ── */}
            <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
              <Card style={{ marginTop: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <SectionHead style={{ margin: 0 }}>✨ Month-End AI Summary</SectionHead>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {narrative?.cachedAt && (
                      <span style={{ fontSize: 11, color: T.muted }}>
                        Generated {new Date(narrative.cachedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                    <Btn size="sm" variant="ghost"
                      onClick={async () => {
                        setNarrativeLoad(true);
                        try { setNarrative(await getNarrative(active.id, undefined, undefined, true)); }
                        catch (e) { console.error(e); }
                        finally { setNarrativeLoad(false); }
                      }}
                      disabled={narrativeLoad}>
                      {narrativeLoad ? '…' : '↻ Generate'}
                    </Btn>
                  </div>
                </div>
                {narrativeLoad && (
                  <div style={{ fontSize: 13, color: T.muted, fontStyle: 'italic' }}>
                    Generating summary…
                  </div>
                )}
                {!narrativeLoad && narrative?.narrative && (
                  <div style={{ fontSize: 14, color: T.text, lineHeight: 1.7,
                    padding: '12px 16px', background: `${T.accent}08`,
                    borderRadius: 10, border: `1px solid ${T.accent}20` }}>
                    {narrative.narrative}
                  </div>
                )}
                {!narrativeLoad && !narrative?.narrative && (
                  <div style={{ fontSize: 13, color: T.muted, fontStyle: 'italic' }}>
                    No summary yet this month. Click Generate at month-end for an AI review of your financials.
                  </div>
                )}
                <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>
                  Updated once per month · Click Generate at month-end to refresh
                </div>
              </Card>
            </UpgradeGate>
          </div>
        )}

        {/* ══════════ TRANSACTIONS ══════════ */}
        {tab === 'Transactions' && active && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: txLimit ? 14 : 20, flexWrap: 'wrap', gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Transactions</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {txns.length > 0 && (
                  <Btn size="sm" variant="neutral" onClick={() => {
                    const date = new Date().toISOString().substring(0, 10);
                    downloadCSV(`/transactions?clientId=${active.id}`, `transactions_${date}.csv`);
                  }}>⬇ CSV</Btn>
                )}
                <Btn size="sm" variant="ghost" onClick={() => setShowCSVImport(true)}>📥 Import Bank CSV</Btn>
                <Btn size="sm" variant="ghost" onClick={() => setShowBSImport(true)}>📊 Opening Balances</Btn>
                {txAtLimit
                  ? <Btn variant="danger" onClick={() => setShowPayment(true)}>Limit reached — Upgrade ↑</Btn>
                  : <Btn onClick={() => setShowTx(true)}>+ Add Transaction</Btn>
                }
              </div>
            </div>

            {/* Transaction usage bar */}
            {txLimit && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12,
                  color: txAtLimit ? T.red : txNearLimit ? T.orange : T.muted, marginBottom: 5 }}>
                  <span>
                    {txAtLimit   && '🚫 Monthly limit reached — '}
                    {txNearLimit && '⚠️ Approaching limit — '}
                    {txThisMonth} / {txLimit} transactions this month
                  </span>
                  <span style={{ fontWeight: 600 }}>{tierInfo.label} Plan</span>
                </div>
                <div style={{ height: 6, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, transition: 'width .4s',
                    width: `${txPct}%`,
                    background: txAtLimit ? T.red : txNearLimit ? T.orange : T.green }} />
                </div>
                {(txAtLimit || txNearLimit) && (
                  <div style={{ marginTop: 8, fontSize: 13, color: txAtLimit ? T.red : T.orange }}>
                    {txAtLimit
                      ? <>You've hit the {txLimit}-transaction limit for the <strong>{tierInfo.label}</strong> plan. <span onClick={() => setShowPayment(true)} style={{ color: T.accent, cursor: 'pointer', fontWeight: 600 }}>Upgrade now →</span></>
                      : <>Only {txLimit - txThisMonth} transactions remaining this month. <span onClick={() => setShowPayment(true)} style={{ color: T.accent, cursor: 'pointer', fontWeight: 600 }}>Upgrade to get more →</span></>
                    }
                  </div>
                )}
              </div>
            )}

            {/* ── BIR Form 2307 Generator ───────────────────────────────────── */}
            {(() => {
              // Build ATC_MAP from live settings (admin-configurable), fallback to defaults
              const ewtRatesList = siteSettings.ewtRates || DEFAULT_EWT_RATES;
              const ATC_MAP = {};
              ewtRatesList.forEach(r => { ATC_MAP[r.rate] = { atc: r.atc, description: r.description }; });
              const qRanges = { 1:[1,3], 2:[4,6], 3:[7,9], 4:[10,12] };
              const [m1, m2] = qRanges[ewt2307Q];
              const qLabel   = `Q${ewt2307Q} ${ewt2307Year}`;
              const ewtTxns  = txns.filter(t => {
                const d = new Date(t.createdAt);
                const m = d.getMonth() + 1;
                return d.getFullYear() === ewt2307Year && m >= m1 && m <= m2
                  && t.type === 'expense' && parseFloat(t.ewtRate) > 0 && t.ewtAmount > 0;
              });
              const totalEWT   = Math.round(ewtTxns.reduce((s, t) => s + (t.ewtAmount || 0), 0) * 100) / 100;
              const payeeCount = new Set(ewtTxns.map(t => t.counterpartyName || t.description || '?')).size;
              const hasEWT   = txns.some(t => parseFloat(t.ewtRate) > 0 && t.ewtAmount > 0);
              if (!hasEWT && txns.length > 0) return null;
              if (txns.length === 0) return null;
              return (
                <div style={{ background: '#f0f7ff', border: `1px solid #bfdbfe`, borderRadius: T.radius, padding: '16px 20px', marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#1e40af', marginBottom: 3 }}>
                        📋 BIR Form 2307 — Certificate of Creditable Tax Withheld
                      </div>
                      <div style={{ fontSize: 12, color: T.muted }}>
                        {ewtTxns.length > 0
                          ? `${ewtTxns.length} EWT transaction${ewtTxns.length !== 1 ? 's' : ''} · Total EWT: ₱${totalEWT.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
                          : 'No EWT transactions for this period'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <select value={ewt2307Q} onChange={e => setEwt2307Q(Number(e.target.value))}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, background: '#fff' }}>
                        <option value={1}>Q1 (Jan–Mar)</option>
                        <option value={2}>Q2 (Apr–Jun)</option>
                        <option value={3}>Q3 (Jul–Sep)</option>
                        <option value={4}>Q4 (Oct–Dec)</option>
                      </select>
                      <select value={ewt2307Year} onChange={e => setEwt2307Year(Number(e.target.value))}
                        style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, background: '#fff' }}>
                        {[now0.getFullYear(), now0.getFullYear()-1, now0.getFullYear()-2].map(y =>
                          <option key={y} value={y}>{y}</option>
                        )}
                      </select>
                      <Btn size="sm" disabled={ewtTxns.length === 0} onClick={() => {
                        // Group by payee
                        const byPayee = {};
                        ewtTxns.forEach(t => {
                          const key  = t.counterpartyName || t.description || 'Unknown Payee';
                          const rate = parseFloat(t.ewtRate);
                          const info = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate*100)).padStart(3,'0')}`, description: `EWT ${(rate*100).toFixed(0)}%` };
                          byPayee[key] = byPayee[key] || { name: key, tin: t.counterpartyTin || '—', address: t.counterpartyAddress || '—', atcs: {} };
                          byPayee[key].atcs[info.atc] = byPayee[key].atcs[info.atc] || { ...info, base: 0, ewt: 0 };
                          byPayee[key].atcs[info.atc].base = Math.round((byPayee[key].atcs[info.atc].base + (t.amount_net || 0)) * 100) / 100;
                          byPayee[key].atcs[info.atc].ewt  = Math.round((byPayee[key].atcs[info.atc].ewt  + (t.ewtAmount  || 0)) * 100) / 100;
                        });
                        const payees  = Object.values(byPayee);
                        const allHtml = payees.map(p =>
                          build2307Html({ payee: p, client: active, period: qLabel, atcList: Object.values(p.atcs) })
                        ).join('<div style="page-break-after:always"></div>');
                        printReport({
                          title: `BIR Form 2307 — ${active.tradeName} — ${qLabel}`,
                          subtitle: `${payees.length} payee certificate${payees.length !== 1 ? 's' : ''}`,
                          bodyHtml: allHtml,
                          firmLabel: 'MyLedger by Kaiman & Co.',
                        });
                      }}>
                        🖨 Generate 2307{ewtTxns.length > 0 ? ` (${payeeCount} payee${payeeCount !== 1 ? 's' : ''})` : ''}
                      </Btn>
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* ─────────────────────────────────────────────────────────────── */}

            {txLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : txns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                <div>No transactions yet. Add your first one above.</div>
              </div>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.bg }}>
                        {['Date','Type','Category','Description','Ref. No.','Counterparty','NET','VAT','GROSS','Settlement',''].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                            color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t, i) => (
                        <tr key={t.id} style={{
                          borderBottom: i < txns.length - 1 ? `1px solid ${T.border}` : 'none',
                          opacity: t.voided ? 0.5 : 1,
                          background: t.voided ? '#fafafa' : undefined,
                        }}
                          title={t.notes || undefined}>
                          <td style={{ padding: '10px 14px', color: T.muted, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{fmtDt(t.createdAt)}</td>
                          <td style={{ padding: '10px 14px' }}>
                            {t.voided
                              ? <span style={{ background: '#f0f0f0', color: T.muted, padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>VOID</span>
                              : <>
                                  <span style={{ background: t.type === 'income' ? '#e3f7ed' : '#fff0f0',
                                    color: t.type === 'income' ? T.green : T.red,
                                    padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{t.type}</span>
                                  {t.vatType && t.vatType !== 'vatable' && (
                                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{t.vatType.replace('_',' ')}</div>
                                  )}
                                </>
                            }
                          </td>
                          <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12,
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{t.category}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ textDecoration: t.voided ? 'line-through' : 'none' }}>{t.description}</span>
                            {t.voided && t.voidReason && <div style={{ fontSize: 11, color: T.red, marginTop: 2 }}>Void: {t.voidReason}</div>}
                            {!t.voided && t.notes && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>📝 {t.notes}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', color: T.accent, fontSize: 12,
                            textDecoration: t.voided ? 'line-through' : 'none' }}>
                            {t.referenceNo || <span style={{ opacity: 0.3 }}>—</span>}
                          </td>
                          <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12 }}>
                            {t.counterpartyName || <span style={{ opacity: 0.3 }}>—</span>}
                            {t.counterpartyTin && <div style={{ fontSize: 11 }}>TIN: {t.counterpartyTin}</div>}
                          </td>
                          <td style={{ padding: '10px 14px', fontWeight: 500, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{peso(t.net)}</td>
                          <td style={{ padding: '10px 14px', color: T.orange, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{peso(t.vat)}</td>
                          <td style={{ padding: '10px 14px', color: T.muted, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{peso(t.gross)}</td>
                          <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>
                            {t.settlement ? t.settlement.replace('_',' ') : 'cash'}
                          </td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                              {!t.voided && (
                                <button onClick={() => voidTx(t.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                                    color: T.red, fontSize: 13, padding: '3px 6px', borderRadius: 5 }}>
                                  ⊘ Void
                                </button>
                              )}
                              <button onClick={() => openReceipts(t)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                  color: T.muted, fontSize: 14, padding: '3px 6px', borderRadius: 5 }}>
                                📎
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ── Receipt Attachments Modal ── */}
        {receiptTx && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 900,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setReceiptTx(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              background: T.surface, borderRadius: 16, padding: 28, width: '100%', maxWidth: 480,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>📎 Attachments</div>
                <button onClick={() => setReceiptTx(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.muted }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
                {receiptTx.description} — {fmtDt(receiptTx.createdAt)}
              </div>
              <label style={{ display: 'block', border: `2px dashed ${T.border}`, borderRadius: 10,
                padding: '14px 20px', cursor: 'pointer', textAlign: 'center',
                background: T.bg, marginBottom: 16, fontSize: 13, color: T.muted }}>
                {receiptUploading ? 'Uploading…' : '+ Upload receipt (JPG, PNG, PDF, CSV, XLS — max 10 MB)'}
                <input type="file" hidden onChange={handleReceiptUpload} disabled={receiptUploading}
                  accept="image/*,.pdf,.csv,.xls,.xlsx" />
              </label>
              {receiptLoad ? (
                <div style={{ color: T.muted, fontSize: 13 }}>Loading…</div>
              ) : receiptList.length === 0 ? (
                <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic' }}>No attachments yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {receiptList.map(att => (
                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', background: T.bg, borderRadius: 10, border: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 20 }}>
                        {att.mimetype === 'application/pdf' ? '📄' : att.mimetype.startsWith('image') ? '🖼️' : '📊'}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.filename}
                        </div>
                        <div style={{ fontSize: 11, color: T.muted }}>
                          {(att.size / 1024).toFixed(1)} KB · {fmtDt(att.createdAt)}
                        </div>
                      </div>
                      <a href={`/api/receipts/${receiptTx.id}/${att.id}`}
                        target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: T.accent, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                        View
                      </a>
                      <button onClick={() => handleReceiptDelete(att.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.red, fontSize: 16 }}>
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════ INCOME STATEMENT ══════════ */}
        {tab === 'Income Statement' && active && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 600 }}>Income Statement</h2>
            <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
              <Card style={{ marginBottom: 20 }}>
                <SectionHead>Date Range</SectionHead>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <Fld label="From"><input style={{ ...inp, width: 160 }} type="date" value={incFrom} onChange={e => setIncFrom(e.target.value)} /></Fld>
                  <Fld label="To"><input style={{ ...inp, width: 160 }} type="date" value={incTo} onChange={e => setIncTo(e.target.value)} /></Fld>
                  <Btn onClick={loadIncReport} disabled={incLoad} style={{ marginBottom: 14 }}>{incLoad ? 'Loading…' : 'Run Report'}</Btn>
                  {(incFrom || incTo) && <Btn variant="ghost" onClick={() => { setIncFrom(''); setIncTo(''); setIncRep(null); }} style={{ marginBottom: 14 }}>All Periods</Btn>}
                </div>
              </Card>
              {incRep ? (() => {
                const eb = incRep.expenseBreakdown || {};
                const cogsMap = eb.cogs || {};
                const opexMap = eb.opex || {};
                const cogsEntries = Object.entries(cogsMap).filter(([,v]) => v > 0);
                const opexEntries = Object.entries(opexMap).filter(([,v]) => v > 0);
                const hasCOGS = (incRep.costOfSales || 0) > 0;
                const grossProfit = incRep.grossProfit ?? (incRep.revenue - (incRep.costOfSales || 0));

                const PLRow = ({ label, value, indent, bold, color, divider, section }) => {
                  if (divider) return <hr style={{ border: 'none', borderTop: `2px solid ${T.border}`, margin: '4px 0' }} />;
                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      padding: bold ? '10px 0 4px' : section ? '14px 0 2px' : '7px 0',
                      borderBottom: (bold || section) ? 'none' : `1px solid ${T.border}`,
                      paddingLeft: indent ? 16 : 0 }}>
                      <span style={{ fontSize: section ? 11 : 14, fontWeight: section ? 600 : bold ? 700 : 400,
                        color: section ? T.muted : bold ? T.text : T.muted,
                        textTransform: section ? 'uppercase' : 'none', letterSpacing: section ? '0.05em' : 0 }}>
                        {label}
                      </span>
                      {value != null && (
                        <span style={{ fontSize: bold ? 16 : 14, fontWeight: bold ? 700 : 500, color: color || T.text }}>
                          {value < 0 ? `(${peso(Math.abs(value))})` : peso(value)}
                        </span>
                      )}
                    </div>
                  );
                };

                return (
                  <div>
                    <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>Period: {incRep.period}</div>

                    {/* Summary metric cards */}
                    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 20 }}>
                      <MetricCard label="Net Revenue"  value={peso(incRep.revenue)}  sub="VAT-exclusive" color={T.green} />
                      {hasCOGS && <MetricCard label="Gross Profit" value={peso(grossProfit)} sub="Revenue − COGS" color={grossProfit >= 0 ? T.accent : T.red} />}
                      <MetricCard label="Net Expenses" value={peso(incRep.expenses)} sub="VAT-exclusive" color={T.red} />
                      <MetricCard label="Net Profit"   value={peso(incRep.profit)}
                        sub={incRep.profit >= 0 ? 'Profitable ✓' : 'Net loss'}
                        color={incRep.profit >= 0 ? T.accent : T.red} />
                      {(incRep.optTax ?? 0) > 0 && <MetricCard label="Percentage Tax" value={peso(incRep.optTax)} sub="OPT payable" color={T.orange} />}
                    </div>

                    {/* P&L detail card */}
                    <Card style={{ marginBottom: 16 }}>
                      <SectionHead>Profit &amp; Loss Detail</SectionHead>
                      <PLRow section label="Revenues" />
                      <PLRow label="Net Sales / Revenues" value={incRep.revenue} color={T.green} />
                      <PLRow divider />

                      {hasCOGS && (<>
                        <PLRow section label="Cost of Sales" />
                        {cogsEntries.map(([cat, amt]) => <PLRow key={cat} label={cat} value={-amt} indent color={T.red} />)}
                        {cogsEntries.length > 1 && <PLRow label="Total Cost of Sales" value={-(incRep.costOfSales||0)} color={T.red} />}
                        <PLRow divider />
                        <PLRow label="Gross Profit" value={grossProfit} bold color={grossProfit >= 0 ? T.accent : T.red} />
                        <PLRow divider />
                      </>)}

                      <PLRow section label="Operating Expenses" />
                      {opexEntries.length > 0
                        ? opexEntries.map(([cat, amt]) => <PLRow key={cat} label={cat} value={-amt} indent color={T.red} />)
                        : (!hasCOGS && incRep.expenses > 0 && <PLRow label="Total Costs and Expenses" value={-incRep.expenses} color={T.red} />)
                      }
                      {opexEntries.length > 1 && <PLRow label="Total Operating Expenses" value={-(incRep.operatingExpenses||0)} color={T.red} />}
                      <PLRow divider />
                      <PLRow label={incRep.profit >= 0 ? 'Net Profit' : 'Net Loss'} value={incRep.profit} bold color={incRep.profit >= 0 ? T.accent : T.red} />
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 12, fontStyle: 'italic' }}>{incRep.note}</div>
                    </Card>

                    {/* Revenue breakdown by VAT type (only if mixed) */}
                    {((incRep.revenueBreakdown?.zeroRated > 0) || (incRep.revenueBreakdown?.exempt > 0) || (incRep.revenueBreakdown?.optSales > 0)) && (
                      <Card>
                        <SectionHead>Revenue Breakdown by VAT Type</SectionHead>
                        {[
                          ['Vatable Sales (12% VAT)',     incRep.revenueBreakdown?.vatable,   T.accent],
                          ['Zero-rated Sales',             incRep.revenueBreakdown?.zeroRated, T.green],
                          ['Exempt Sales',                 incRep.revenueBreakdown?.exempt,    T.muted],
                          ['OPT / Percentage Tax Sales',   incRep.revenueBreakdown?.optSales,  T.orange],
                        ].filter(([,v]) => (v ?? 0) > 0).map(([label, val, color]) => (
                          <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                            padding: '9px 0', borderBottom: `1px solid ${T.border}`, fontSize: 14 }}>
                            <span style={{ color: T.muted }}>{label}</span>
                            <span style={{ fontWeight: 600, color }}>{peso(val)}</span>
                          </div>
                        ))}
                      </Card>
                    )}
                  </div>
                );
              })() : (
                <div style={{ color: T.muted, textAlign: 'center', padding: 48 }}>
                  Select a date range above and click <strong>Run Report</strong>.<br />
                  <span style={{ fontSize: 12 }}>Leave dates blank to include all periods.</span>
                </div>
              )}
            </UpgradeGate>
          </div>
        )}

        {/* ══════════ BALANCE SHEET ══════════ */}
        {tab === 'Balance Sheet' && active && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 600 }}>Balance Sheet</h2>
            <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
              <Card style={{ marginBottom: 20 }}>
                <SectionHead>As-of Date</SectionHead>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <Fld label="As Of"><input style={{ ...inp, width: 160 }} type="date" value={balAsOf} onChange={e => setBalAsOf(e.target.value)} /></Fld>
                  <Btn onClick={loadBalReport} disabled={balLoad} style={{ marginBottom: 14 }}>{balLoad ? 'Loading…' : 'Run Report'}</Btn>
                  {balAsOf && <Btn variant="ghost" onClick={() => { setBalAsOf(''); setBalRep(null); }} style={{ marginBottom: 14 }}>Today</Btn>}
                </div>
              </Card>
              {balRep ? (
                <div>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 16 }}>As of: {balRep.asOf}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginBottom: 20 }}>
                    <Card>
                      <SectionHead>Assets</SectionHead>
                      {Object.entries(balRep.assets).filter(([k]) => k !== 'note').map(([k, v]) =>
                        typeof v === 'number' ? (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                            padding: '9px 0', borderBottom: `1px solid ${T.border}`, fontSize: 14 }}>
                            <span style={{ color: T.muted, textTransform: 'capitalize' }}>{k.replace(/_/g,' ')}</span>
                            <span style={{ fontWeight: 600, color: v >= 0 ? T.green : T.red }}>{peso(v)}</span>
                          </div>
                        ) : null
                      )}
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{balRep.assets.note}</div>
                    </Card>
                    <Card>
                      <SectionHead>Liabilities</SectionHead>
                      {Object.entries(balRep.liabilities).filter(([k]) => k !== 'note').map(([k, v]) =>
                        typeof v === 'number' ? (
                          <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                            padding: '9px 0', borderBottom: `1px solid ${T.border}`, fontSize: 14 }}>
                            <span style={{ color: T.muted, textTransform: 'capitalize' }}>{k.replace(/_/g,' ')}</span>
                            <span style={{ fontWeight: 600, color: T.orange }}>{peso(v)}</span>
                          </div>
                        ) : null
                      )}
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 10 }}>{balRep.liabilities.note}</div>
                    </Card>
                  </div>
                  <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 15 }}>Net VAT Position</div>
                      <div style={{ fontWeight: 700, fontSize: 20, color: (balRep.net_vat_position ?? 0) >= 0 ? T.red : T.green }}>
                        {peso(Math.abs(balRep.net_vat_position ?? 0))}
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{balRep.net_note}</div>
                  </Card>
                </div>
              ) : (
                <div style={{ color: T.muted, textAlign: 'center', padding: 48 }}>
                  Select a date above and click <strong>Run Report</strong>.<br />
                  <span style={{ fontSize: 12 }}>Leave blank to see the current balance.</span>
                </div>
              )}
            </UpgradeGate>
          </div>
        )}

        {/* ══════════ CASH FLOW ══════════ */}
        {tab === 'Cash Flow' && active && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 600 }}>Cash Flow Statement</h2>
            <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
              <Card style={{ marginBottom: 20 }}>
                <SectionHead>Date Range</SectionHead>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <Fld label="From"><input style={{ ...inp, width: 160 }} type="date" value={cfFrom} onChange={e => setCfFrom(e.target.value)} /></Fld>
                  <Fld label="To"><input style={{ ...inp, width: 160 }} type="date" value={cfTo} onChange={e => setCfTo(e.target.value)} /></Fld>
                  <Btn onClick={loadCfReport} disabled={cfLoad} style={{ marginBottom: 14 }}>{cfLoad ? 'Loading…' : 'Run Report'}</Btn>
                  {(cfFrom || cfTo) && <Btn variant="ghost" onClick={() => { setCfFrom(''); setCfTo(''); setCfRep(null); }} style={{ marginBottom: 14 }}>All Periods</Btn>}
                </div>
              </Card>
              {cfRep ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  <div style={{ fontSize: 12, color: T.muted }}>Period: {cfRep.period}</div>
                  <Card>
                    <SectionHead>Operating Activities (Indirect Method)</SectionHead>
                    {[
                      ['Net Income',                          cfRep.operating.netIncome],
                      ['+ Depreciation Add-back',             cfRep.operating.depreciationAddBack],
                      ['± AR Change (credit sales)',          cfRep.operating.arIncrease],
                      ['± AP Change (unpaid expenses)',       cfRep.operating.apIncrease],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                        padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 14 }}>
                        <span style={{ color: T.muted }}>{label}</span>
                        <span style={{ fontWeight: 500, color: (val ?? 0) >= 0 ? T.text : T.red }}>{peso(val)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                      fontSize: 15, fontWeight: 700, borderTop: `2px solid ${T.border}`, marginTop: 4 }}>
                      <span>Net Cash from Operations</span>
                      <span style={{ color: (cfRep.operating.total ?? 0) >= 0 ? T.green : T.red }}>{peso(cfRep.operating.total)}</span>
                    </div>
                  </Card>
                  <Card>
                    <SectionHead>Investing Activities</SectionHead>
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      padding: '8px 0', borderBottom: `1px solid ${T.border}`, fontSize: 14 }}>
                      <span style={{ color: T.muted }}>Asset Purchases</span>
                      <span style={{ fontWeight: 500, color: T.red }}>{peso(cfRep.investing.assetPurchases)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0',
                      fontSize: 15, fontWeight: 700, borderTop: `2px solid ${T.border}`, marginTop: 4 }}>
                      <span>Net Cash from Investing</span>
                      <span style={{ color: (cfRep.investing.total ?? 0) >= 0 ? T.green : T.red }}>{peso(cfRep.investing.total)}</span>
                    </div>
                  </Card>
                  <Card>
                    <SectionHead>Direct Method Cross-check (Cash Settlements Only)</SectionHead>
                    <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontSize: 12, color: T.muted }}>Cash Collected</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.green }}>{peso(cfRep.direct.cashCollected)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: T.muted }}>Cash Paid</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.red }}>{peso(Math.abs(cfRep.direct.cashPaid ?? 0))}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: T.muted }}>Net Cash Change</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: (cfRep.netCashChange ?? 0) >= 0 ? T.green : T.red }}>{peso(cfRep.netCashChange)}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: T.muted }}>{cfRep.direct.note}</div>
                  </Card>
                </div>
              ) : (
                <div style={{ color: T.muted, textAlign: 'center', padding: 48 }}>
                  Select a date range above and click <strong>Run Report</strong>.
                </div>
              )}
            </UpgradeGate>
          </div>
        )}

        {/* ══════════ BOOKS ══════════ */}
        {tab === 'Books' && active && (
          <div>
            <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 600 }}>Accounting Books</h2>
            <UpgradeGate tier={tier} required="professional" onUpgrade={openUpgrade}>
              <Card style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <Fld label="Book">
                    <select style={{ ...inp, width: 230 }} value={booksType}
                      onChange={e => { setBooksType(e.target.value); setBooksData(null); }}>
                      <option value="sales">Sales Book</option>
                      <option value="purchases">Purchases Book</option>
                      <option value="receipts">Cash Receipts Book</option>
                      <option value="disbursements">Cash Disbursements Book</option>
                    </select>
                  </Fld>
                  <Fld label="From"><input style={{ ...inp, width: 150 }} type="date" value={booksFrom} onChange={e => setBooksFrom(e.target.value)} /></Fld>
                  <Fld label="To"><input style={{ ...inp, width: 150 }} type="date" value={booksTo} onChange={e => setBooksTo(e.target.value)} /></Fld>
                  <Btn onClick={loadBooksReport} disabled={booksLoad} style={{ marginBottom: 14 }}>{booksLoad ? 'Loading…' : 'Load Book'}</Btn>
                </div>
              </Card>
              {booksData ? (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', background: T.bg, borderBottom: `1px solid ${T.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>
                      {booksData.type} Book — {booksData.period}
                    </div>
                    <div style={{ fontSize: 13, color: T.muted }}>{booksData.count} records</div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    {booksData.rows.length === 0 ? (
                      <div style={{ padding: 40, textAlign: 'center', color: T.muted }}>No records for this period.</div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: '#f8f8f8' }}>
                            {Object.keys(booksData.rows[0]).map(h => (
                              <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 600,
                                color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`,
                                whiteSpace: 'nowrap', textTransform: 'capitalize' }}>
                                {h.replace(/([A-Z])/g, ' $1').replace(/_/g,' ').trim()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {booksData.rows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: i < booksData.rows.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                              {Object.entries(r).map(([k, v]) => (
                                <td key={k} style={{ padding: '8px 12px', whiteSpace: 'nowrap',
                                  color: typeof v === 'number' && v !== 0 ? T.text : T.muted,
                                  fontWeight: typeof v === 'number' && v !== 0 ? 500 : 400 }}>
                                  {typeof v === 'number' ? (v !== 0 ? peso(v) : '—') : (v || '—')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                            {Object.keys(booksData.rows[0]).map((k, i) => (
                              <td key={k} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
                                {i === 0 ? 'TOTALS' : (typeof booksData.totals[k] === 'number' && booksData.totals[k] !== 0 ? peso(booksData.totals[k]) : '')}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </div>
                </Card>
              ) : (
                <div style={{ color: T.muted, textAlign: 'center', padding: 48 }}>
                  Select a book type and click <strong>Load Book</strong>.
                </div>
              )}
            </UpgradeGate>
          </div>
        )}

        {/* ══════════ ASSETS ══════════ */}
        {tab === 'Assets' && active && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Fixed Assets & Lapsing</h2>
              <Btn onClick={() => setShowAsset(true)}>+ Add Asset</Btn>
            </div>
            <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
              {assetLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
              : assets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
                  <div>No fixed assets recorded yet. Click <strong>+ Add Asset</strong> to get started.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {assets.map(a => (
                    <Card key={a.id} style={{ padding: '16px 20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{a.name}</div>
                          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                            {a.category} · Acquired {a.startDate} · {a.usefulLifeMonths} mo useful life
                          </div>
                          {a.fullyDepreciated && (
                            <div style={{ fontSize: 11, color: T.orange, marginTop: 3, fontWeight: 600 }}>
                              ✓ Fully Depreciated
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', textAlign: 'right' }}>
                          <div><div style={{ fontSize: 11, color: T.muted }}>Cost</div><div style={{ fontWeight: 600 }}>{peso(a.cost)}</div></div>
                          <div><div style={{ fontSize: 11, color: T.muted }}>Accum. Dep.</div><div style={{ fontWeight: 600, color: T.orange }}>{peso(a.accumulatedDepreciation)}</div></div>
                          <div><div style={{ fontSize: 11, color: T.muted }}>Book Value</div><div style={{ fontWeight: 700, color: T.accent, fontSize: 18 }}>{peso(a.bookValue)}</div></div>
                          <div><div style={{ fontSize: 11, color: T.muted }}>Monthly Dep.</div><div style={{ fontWeight: 600 }}>{peso(a.monthlyDepreciation)}</div></div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12,
                        borderTop: `1px solid ${T.border}`, justifyContent: 'flex-end' }}>
                        <Btn size="sm" variant="ghost" onClick={() => viewLapsing(a.id)}>📋 View Lapsing Schedule</Btn>
                        <Btn size="sm" variant="danger" onClick={() => deleteAssetItem(a.id)}>Delete</Btn>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </UpgradeGate>
          </div>
        )}

        {/* ══════════ BIR REMINDERS ══════════ */}
        {tab === 'BIR Reminders' && active && (
          <div>
            <h2 style={{ margin: '0 0 22px', fontSize: 22, fontWeight: 600 }}>BIR Filing Reminders</h2>
            {!tierMeets(tier, 'starter') ? (
              <UpgradeGate tier={tier} required="starter" onUpgrade={openUpgrade}>
                <Card>
                  <SectionHead>Upcoming BIR Filings</SectionHead>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {['2550M','1702Q','1601-EQ'].map(f => (
                      <div key={f} style={{ background: '#f0fff4', borderRadius: 10, padding: '12px 16px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontWeight: 600 }}>{f}</div>
                        <div style={{ fontWeight: 700, fontSize: 18, color: T.green }}>14d</div>
                      </div>
                    ))}
                  </div>
                </Card>
              </UpgradeGate>
            ) : birLoad ? <div style={{ color: T.muted }}>Loading…</div>
            : (active.taxTypes || []).length === 0 ? (
              <Card style={{ textAlign: 'center', color: T.muted }}>
                No tax types configured.<br />
                <span style={{ color: T.accent, cursor: 'pointer' }}
                  onClick={() => setTab('Business Setup')}>Configure in Business Setup →</span>
              </Card>
            ) : deadlines.length === 0 ? <div style={{ color: T.muted }}>No upcoming deadlines found.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {deadlines.map((d, i) => {
                  const uc  = d.urgency === 'urgent' ? T.red : d.urgency === 'upcoming' ? T.orange : T.green;
                  const ubg = d.urgency === 'urgent' ? '#fff5f5' : d.urgency === 'upcoming' ? '#fff8ec' : '#f0fff4';
                  return (
                    <div key={i} style={{ background: ubg, borderRadius: T.radius, padding: '16px 20px',
                      border: `1px solid ${uc}30`,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{d.form} — {d.name.replace(/^BIR Form \w+ — /, '')}</div>
                        <div style={{ color: T.muted, fontSize: 13, marginTop: 3 }}>Due: {fmtDt(d.dueDate)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 22, color: uc }}>{d.daysUntil}d</div>
                        <div style={{ fontSize: 11, color: uc, textTransform: 'uppercase', fontWeight: 600 }}>{d.urgency}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {vatBal && tierMeets(tier, 'starter') && (
              <Card style={{ marginTop: 20 }}>
                <SectionHead>Current VAT Balance</SectionHead>
                <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
                  <div><div style={{ fontSize: 12, color: T.muted }}>Input VAT (asset)</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.green }}>{peso(vatBal.inputVAT)}</div></div>
                  <div><div style={{ fontSize: 12, color: T.muted }}>Output VAT (liability)</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.orange }}>{peso(vatBal.outputVAT)}</div></div>
                  <div><div style={{ fontSize: 12, color: T.muted }}>Net position</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: vatBal.netVATPayable >= 0 ? T.red : T.green }}>{vatBal.note}</div></div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══════════ INVOICES ══════════ */}
        {tab === 'Invoices' && active && (
          <InvoicesTab clientId={active.id} isAccountant={false} />
        )}

        {/* ══════════ REFERRAL ══════════ */}
        {tab === 'Referral' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Referral Program</h2>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  Earn <strong style={{ color: T.orange }}>
                    ₱{refData?.rates?.signupBonus ?? 100} credits per signup
                  </strong> + <strong style={{ color: T.orange }}>
                    {refData?.rates?.subscriptionPercent ?? 10}% of every subscription payment
                  </strong> they make.
                </div>
              </div>
              <Btn size="sm" variant="ghost" onClick={loadReferrals}>↻ Refresh</Btn>
            </div>

            {refLoad && <div style={{ color: T.muted, fontSize: 14 }}>Loading…</div>}
            {refErr  && <div style={{ color: '#ff3b30', fontSize: 13, padding: '12px 16px',
              background: '#fff2f2', borderRadius: 8, border: '1px solid #ffcdd2', marginBottom: 16 }}>
              ⚠️ {refErr} — try refreshing or signing out and back in.
            </div>}

            {refData && (
              <>
                {/* Referral link */}
                <Card style={{ marginBottom: 20 }}>
                  <SectionHead>Your Referral Link</SectionHead>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, background: '#f5f5f7', borderRadius: 8, padding: '10px 14px',
                      fontFamily: 'monospace', fontSize: 13, color: T.text, wordBreak: 'break-all',
                      border: `1px solid ${T.border}` }}>
                      {refData.referralLink}
                    </div>
                    <Btn size="sm" onClick={() => {
                      navigator.clipboard.writeText(refData.referralLink);
                      setRefCopied(true);
                      setTimeout(() => setRefCopied(false), 2000);
                    }}>
                      {refCopied ? '✓ Copied!' : '📋 Copy Link'}
                    </Btn>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: T.muted }}>
                    You earn <strong>₱{refData?.rates?.signupBonus ?? 100} credits</strong> when they sign up,
                    plus <strong>{refData?.rates?.subscriptionPercent ?? 10}%</strong> of every subscription payment they make.
                  </div>
                </Card>

                {/* Stats row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                  {[
                    { label: 'Total Referrals', value: refData.stats.total, color: T.accent },
                    { label: 'Pending',          value: refData.stats.pending,  color: T.orange },
                    { label: 'Credited',         value: refData.stats.credited, color: T.green },
                    { label: 'Cash Balance',     value: `₱${(refData.stats.balance||0).toLocaleString()}`, color: '#af52de' },
                  ].map(s => (
                    <Card key={s.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{s.label}</div>
                    </Card>
                  ))}
                </div>

                {/* Balance note */}
                {refData.stats.balance > 0 && (
                  <div style={{ background: '#e8f8ee', border: `1px solid ${T.green}40`,
                    borderRadius: T.radius, padding: '14px 18px', marginBottom: 20,
                    display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span style={{ fontSize: 22 }}>💰</span>
                    <div>
                      <div style={{ fontWeight: 600, color: '#1a7f44', fontSize: 14 }}>
                        You have ₱{(refData.stats.balance).toLocaleString()} in referral credits!
                      </div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                        Contact us at <strong>mym@kaimanco.com</strong> to redeem your balance as a subscription credit or cash payout.
                      </div>
                    </div>
                  </div>
                )}

                {/* Referrals list */}
                {refData.referrals.length === 0 ? (
                  <Card>
                    <div style={{ textAlign: 'center', padding: '32px 0', color: T.muted }}>
                      <div style={{ fontSize: 32, marginBottom: 10 }}>🔗</div>
                      <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>No referrals yet</div>
                      <div style={{ fontSize: 13 }}>Share your link above to start earning!</div>
                    </div>
                  </Card>
                ) : (
                  <Card>
                    <SectionHead>Referral History</SectionHead>
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                          {['Email', 'Status', 'Reward', 'Date'].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left',
                              fontSize: 11, fontWeight: 600, color: T.muted, textTransform: 'uppercase',
                              letterSpacing: '0.5px' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {refData.referrals.map(r => (
                          <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                            <td style={{ padding: '10px 10px', color: T.text }}>{r.refereeEmail}</td>
                            <td style={{ padding: '10px 10px' }}>
                              <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                background: r.status === 'credited' ? '#e8f8ee' : '#fff8ec',
                                color: r.status === 'credited' ? T.green : T.orange }}>
                                {r.status === 'credited' ? '✓ Credited' : '⏳ Pending'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 10px', fontWeight: 600, color: T.green }}>
                              {r.status === 'credited' ? `₱${r.rewardAmount}` : '—'}
                            </td>
                            <td style={{ padding: '10px 10px', color: T.muted }}>
                              {new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ══════════ BUSINESS SETUP ══════════ */}
        {tab === 'Business Setup' && active && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Business Setup</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                {tierMeets(tier, 'starter')
                  ? <Btn variant="ghost" size="sm" onClick={handleBackup}>⬇ Backup</Btn>
                  : <Btn variant="neutral" size="sm" disabled title="Starter+ required">⬇ Backup 🔒</Btn>}
                <Btn size="sm" onClick={() => { setBizIsEdit(true); setShowBiz(true); }}>Edit Details</Btn>
                <Btn variant="danger" size="sm" onClick={handleDeleteBiz}>Delete</Btn>
              </div>
            </div>

            {/* Subscription tier banner */}
            <div style={{ background: `${tierInfo.color}10`, border: `1px solid ${tierInfo.color}30`,
              borderRadius: T.radius, padding: '14px 20px', marginBottom: 20,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: tierInfo.color, textTransform: 'uppercase',
                  letterSpacing: '0.6px', marginBottom: 4 }}>Current Plan</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: tierInfo.color }}>{tierInfo.label}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>{tierInfo.desc}</div>
              </div>
              {tier !== 'enterprise' && (
                <Btn size="sm" variant="ghost"
                  style={{ borderColor: tierInfo.color, color: tierInfo.color }}
                  onClick={() => setShowPayment(true)}>
                  Upgrade Plan ↑
                </Btn>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 20, marginBottom: 20 }}>
              {/* Business info */}
              <Card>
                <SectionHead>Business Information</SectionHead>
                {[
                  ['Trade Name',   active.tradeName],
                  ['TIN',          active.tin],
                  ['Type',         active.type],
                  ['Address',      active.address || '—'],
                  ['ZIP Code',     active.zipCode || '—'],
                  ['Telephone',    active.telephone || '—'],
                  ['RDO Code',     active.rdoCode || '—'],
                  ['Tax Regime',   active.taxRegime === 'opt' ? `OPT / Percentage Tax (${((Number(active.optRate)||0.03)*100).toFixed(1)}%)` : active.taxRegime === 'non_vat_exempt' ? 'Non-VAT Exempt' : 'VAT Registered (12%)'],
                  ...(active.type === 'Sole Proprietor' ? [
                    ['Date of Birth', active.ownerBirthdate ? new Date(active.ownerBirthdate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : '—'],
                    ['Civil Status',  active.civilStatus || '—'],
                    ...(active.civilStatus === 'Married' ? [['Spouse TIN', active.spouseTin || '—']] : []),
                    ['IT Option',     active.taxOption === '8percent' ? '8% Flat Tax (Form 1701A)' : active.taxOption === 'osd' ? 'OSD (40%)' : 'Graduated Rates (Form 1701)'],
                  ] : [
                    ...(active.incorporationDate ? [['Date of Incorporation', new Date(active.incorporationDate).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })]] : []),
                    ['MSME Rate',    active.isMsme ? '20% RCIT (MSME)' : '25% RCIT (Regular)'],
                  ]),
                  ['Client Since', fmtDt(active.createdAt)],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                    padding: '9px 0', borderBottom: `1px solid ${T.border}`, fontSize: 14 }}>
                    <span style={{ color: T.muted }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
                  </div>
                ))}
              </Card>

              {/* Tax obligations */}
              <Card>
                <SectionHead>Tax Obligations</SectionHead>
                {(active.taxTypes || []).length === 0 ? (
                  <div style={{ color: T.muted, fontSize: 14, marginBottom: 16 }}>None configured.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 16 }}>
                    {active.taxTypes.map(code => {
                      const o = TAX_TYPES.find(x => x.code === code);
                      return (
                        <div key={code} style={{ background: '#f0f7ff', borderRadius: 8,
                          padding: '7px 12px', fontSize: 13, color: T.accent, fontWeight: 500 }}>
                          {o?.label || code}
                        </div>
                      );
                    })}
                  </div>
                )}
                <Btn size="sm" variant="ghost" onClick={() => { setBizIsEdit(true); setShowBiz(true); }}>
                  Manage Tax Types
                </Btn>
              </Card>
            </div>

            {/* Accountant access — Professional+ */}
            <UpgradeGate tier={tier} required="professional" onUpgrade={openUpgrade}>
              <Card style={{ marginTop: 20 }}>
                <SectionHead>Accountant Access</SectionHead>
                {active.accountantId ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, color: T.text }}>
                      ✓ An accountant has been granted access to this business.
                    </div>
                    <Btn size="sm" variant="ghost" onClick={() => setShowAssign(true)}
                      style={{ marginLeft: 16, whiteSpace: 'nowrap' }}>
                      Change Accountant
                    </Btn>
                  </div>
                ) : pendingInvite ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10,
                      background: '#fff8ec', border: '1px solid #ff950040', borderRadius: 10,
                      padding: '12px 14px', marginBottom: 12 }}>
                      <span style={{ fontSize: 18 }}>✉️</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                          Invitation pending
                        </div>
                        <div style={{ fontSize: 13, color: T.muted, marginTop: 2 }}>
                          Sent to <strong>{pendingInvite.email}</strong>. Waiting for them to sign up.
                          Expires {new Date(pendingInvite.expires_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}.
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Btn size="sm" variant="ghost" onClick={async () => {
                        try {
                          await cancelPendingInvite(active.id);
                          setPendingInvite(null);
                        } catch (e) { alert(e.message); }
                      }}>Cancel Invitation</Btn>
                      <Btn size="sm" onClick={() => setShowAssign(true)}>Resend / Change</Btn>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 14, color: T.muted }}>
                      No accountant assigned yet. Assign one to allow your accountant to prepare reports and BIR returns.
                    </div>
                    <Btn size="sm" variant="ghost" onClick={() => setShowAssign(true)}
                      style={{ marginLeft: 16, whiteSpace: 'nowrap' }}>
                      Assign Accountant
                    </Btn>
                  </div>
                )}
              </Card>
            </UpgradeGate>

            {/* Encoder list — read-only for client */}
            <Card style={{ marginTop: 20 }}>
              <SectionHead>Data Encoders</SectionHead>
              {(active.encoderIds || []).length === 0 ? (
                <div style={{ fontSize: 14, color: T.muted }}>
                  No encoders assigned to this business. Your accountant can assign encoders to help with data entry.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>
                    The following encoder accounts have transaction data-entry access to this business.
                    They can add and delete transactions but cannot view reports, BIR returns, or financial statements.
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(active.encoderIds || []).map((encId, i) => (
                      <div key={encId} style={{ display: 'flex', alignItems: 'center', gap: 10,
                        background: '#fff8ec', borderRadius: 8, padding: '9px 14px',
                        border: '1px solid #ff950025' }}>
                        <span style={{ fontSize: 16 }}>⌨️</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>Encoder #{i + 1}</div>
                          <div style={{ fontSize: 11, color: T.muted, fontFamily: 'monospace' }}>{encId}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: T.muted }}>
                    To add or remove encoders, contact your assigned accountant.
                  </div>
                </>
              )}
            </Card>

            {/* ── Install MyLedger App ── */}
            <Card style={{ marginTop: 20 }}>
              <SectionHead>Install MyLedger App</SectionHead>
              <div style={{ fontSize: 14, color: T.muted, marginBottom: 14 }}>
                Add MyLedger to your home screen or desktop for faster access — no App Store needed.
              </div>
              <InstallSettingsButton T={T} />
            </Card>
          </div>
        )}

      </div>

      {/* ══ Modals (all module-level — no focus loss) ══ */}
      {showTx && (
        <TxModal key={active?.id} clientId={active?.id} client={active}
          ewtRates={siteSettings.ewtRates || DEFAULT_EWT_RATES}
          onSaved={() => { loadTxns(); loadOverview(); }}
          onClose={() => setShowTx(false)} />
      )}
      {showBiz && (
        <BusinessModal key={bizIsEdit ? (active?.id || 'edit') : 'new'}
          initialValues={bizIsEdit ? active : null}
          isEdit={bizIsEdit}
          onSave={saveBusiness}
          onClose={() => setShowBiz(false)} />
      )}
      {showAssign && (
        <AssignModal clientId={active?.id}
          onSaved={() => { loadClients(); loadPendingInvite(active?.id); }}
          onClose={() => setShowAssign(false)} />
      )}
      {showPayment && (
        <PaymentModal
          clientId={active?.id}
          currentTier={tier}
          settings={siteSettings}
          onClose={() => setShowPayment(false)}
          onUpgradeSuccess={() => { setShowPayment(false); loadClients(); }}
        />
      )}
      {showAsset && (
        <AssetModal clientId={active?.id}
          onSaved={() => { setShowAsset(false); loadAssets(); }}
          onClose={() => setShowAsset(false)} />
      )}
      {showLapsing && lapsingData && (
        <LapsingModal data={lapsingData} onClose={() => { setShowLapsing(false); setLapsingData(null); }} />
      )}
      {showCSVImport && active && (
        <CSVImportModal
          clientId={active.id}
          onClose={() => setShowCSVImport(false)}
          onImported={() => { loadTxns(); loadOverview(); }}
        />
      )}
      {showBSImport && active && (
        <BalanceSheetImport
          clientId={active.id}
          onClose={() => setShowBSImport(false)}
          onImported={() => { loadTxns(); loadOverview(); }}
        />
      )}
    </div>
  );
}
