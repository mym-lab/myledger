// ─── AccountantPortal.jsx ─────────────────────────────────────────────────────
// MyLedger — Accountant interface
// Accountants see all client businesses assigned to them.
// Features: Dashboard (chart + filings) · Transactions · Income Statement · Balance Sheet · BIR Reminders
// Apple light theme with teal accountant accent.

import { useState, useEffect, useRef } from 'react';
import { useMobile } from '../hooks/useMobile.js';
import { InvoicesTab }       from '../components/InvoiceModal.jsx';
import CSVImportModal        from '../components/CSVImportModal.jsx';
import NotificationBell       from '../components/NotificationBell.jsx';
import GlobalSearch           from '../components/GlobalSearch.jsx';
import FirmSettings           from '../components/FirmSettings.jsx';
import TrialBanner            from '../components/TrialBanner.jsx';
import PricingModal           from '../components/PricingModal.jsx';
import BalanceSheetImport    from '../components/BalanceSheetImport.jsx';
import {
  getClients, updateClient, getNarrative,
  getTransactions, createTransaction, updateTransaction, voidTransaction,
  getIncomeReport, getBalanceReport, getCashFlowReport, getCashFlowForecast,
  getReceipts, uploadReceipt, deleteReceipt,
  getBirCalendar,
  getBooksReport, getGeneralJournal, getGeneralLedger,
  getCOA, seedCOA, createAccount, updateAccount, deleteAccount,
  getPeriodLocks, lockPeriod, unlockPeriod,
  getAuditLog,
  getBirDeadlines, getBirVatBalance, getBirFilingSummary, updateBirFilingStatus, getBirPortfolio,
  getIncomeCompare,
  getJournalEntries, createJournalEntry, deleteJournalEntry,
  assignEncoder, removeEncoder,
  getAssets, createAsset, deleteAsset, getLapsing,
  getContacts, createContact, updateContact, deleteContact,
  getSLSP,
  getEmployees, createEmployee, updateEmployee, deleteEmployee, computePayroll,
  backupClient,
  scanReceipt,
  getMyReferrals,
  getStaff, createStaff, assignStaff, resetStaffPassword, deleteStaff,
  getClientGroups, createClientGroup, updateClientGroup, deleteClientGroup, getConsolidated,
  getBudgets, saveBudget,
  getBills, createBill, payBill, voidBill, deleteBill,
  getAgedAR, getAgedAP,
  downloadCSV,
  downloadBirXml,
  createPaymongoLink,
  pollPaymongoStatus,
  createAccountantUpgradeRequest,
  getMyUpgradeRequests,
  getMe,
  getPublicSettings,
  getTrialStatus,
} from '../api.js';
import {
  printReport,
  printFSReport,
  buildIncomeStatementHtml,
  buildBalanceSheetHtml,
  buildCashFlowHtml,
  buildBIRReturnHtml,
  build1601EQHtml,
  build1604EQHtml,
  build1601CHtml,
  buildBooksHtml,
  buildAlphalistHtml,
} from '../utils/printReport.js';
import { generate2307PDF, generateAll2307PDF, download2307PDF } from '../utils/bir2307Generator.js';
import { generate2550QPDF, downloadBIRPDF } from '../utils/birReturnGenerator.js';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:      '#f5f5f7',
  surface: '#ffffff',
  border:  '#d2d2d7',
  text:    '#1d1d1f',
  muted:   '#6e6e73',
  accent:  '#00836e',      // teal — differentiates from client blue
  accentL: '#e6f7f5',
  green:   '#34c759',
  orange:  '#ff9500',
  red:     '#ff3b30',
  yellow:  '#ffcc00',
  purple:  '#af52de',
  radius:  '12px',
  shadow:  '0 2px 12px rgba(0,0,0,0.08)',
  shadowMd:'0 4px 24px rgba(0,0,0,0.12)',
};

const INCOME_CATS  = ['Sale of Goods','Sale of Services','Professional Fees','Rental Income','Interest Income','Commission Income','Dividend Income','Other Income',
  // Non-taxable / pass-through
  'Reimbursement','Capital Contribution','Loan Proceeds','Other Non-Taxable Income'];
const EXPENSE_CATS = ['Cost of Goods Sold','Salaries & Wages','Rent','Utilities','Office Supplies','Advertising & Marketing','Transportation & Travel','Professional Fees','Repairs & Maintenance','Bank Charges & Fees','Taxes & Licenses','Depreciation','Insurance','Interest Expense','Other Expenses'];
// Income categories excluded from Income Tax Return (1701 / 1701A / 1702 / 1702Q)
const NON_TAXABLE_INCOME_CATS = ['Reimbursement','Capital Contribution','Loan Proceeds','Other Non-Taxable Income'];
const CUSTOM_OPT   = '＋ Other (specify)';

const TAX_TYPES = [
  { code: '2550M',  label: '2550M — Monthly VAT Return' },
  { code: '2550Q',  label: '2550Q — Quarterly VAT Return' },
  { code: '2551M',  label: '2551M — Monthly Percentage Tax (Non-VAT)' },
  { code: '2551Q',  label: '2551Q — Quarterly Percentage Tax (Non-VAT)' },
  { code: '1601C',  label: '1601-C — WHT on Compensation' },
  { code: '1601EQ', label: '1601-EQ — Expanded WHT (Quarterly)' },
  { code: '1601FQ', label: '1601-FQ — Final WHT (Quarterly)' },
  { code: '1702Q',  label: '1702Q — Quarterly IT (Corp)' },
  { code: '1702',   label: '1702 — Annual IT (Corp)' },
  { code: '1701Q',  label: '1701Q — Quarterly IT (Individual)' },
  { code: '1701',   label: '1701 — Annual IT (Individual)' },
  { code: '1550',   label: '1550 — Documentary Stamp Tax (Monthly)' },
  { code: '2000OT', label: '2000-OT — DST One-Time Transactions' },
];

// Default EWT rates — used as fallback if admin hasn't configured custom rates via CommandCenter.
// Built from dynamic admin settings at runtime; these are never sent to BIR directly.
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

const peso  = n => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDt = d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

// ─── Shared atoms ─────────────────────────────────────────────────────────────
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
        fontFamily: 'inherit', opacity: disabled ? 0.5 : 1,
        display: 'inline-flex', alignItems: 'center', gap: 6, ...sz[size], ...vr[variant], ...x }}>
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
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: T.text }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22,
            cursor: 'pointer', color: T.muted, lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Fld({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: T.muted, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{ background: T.surface, borderRadius: T.radius, padding: '20px 24px',
      boxShadow: T.shadow, border: `1px solid ${T.border}`, ...style }}>
      {children}
    </div>
  );
}

function SectionHead({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 12,
    textTransform: 'uppercase', letterSpacing: '0.6px' }}>{children}</div>;
}

// Paid-only tabs — free tier is locked out
const PRO_TABS = new Set([
  'Journal Entries', 'Trial Balance', 'Books', 'General Journal', 'General Ledger', 'COA', 'Period Lock', 'Audit Log',
  'BIR Returns', 'Payroll', 'Alphalist',
  'Income Statement', 'Balance Sheet', 'Cash Flow', 'Assets', 'Contacts', 'SLSP', 'Budget', 'Aged AR/AP', 'Consolidated',
]);

// Accountant tier definitions
const ACCT_TIERS = {
  free:         { label: 'Free',         color: '#6e6e73', maxClients: 1,    price: 0    },
  starter:      { label: 'Starter',      color: '#5ac8fa', maxClients: 5,    price: 249  },
  solo:         { label: 'Solo',         color: '#0071e3', maxClients: 10,   price: 599  },
  professional: { label: 'Professional', color: '#ff9500', maxClients: 15,   price: 1499 },
  firm:         { label: 'Firm',         color: '#34c759', maxClients: 50,   price: 2999 },
  agency:       { label: 'Agency',       color: '#af52de', maxClients: 100,  price: 4999 },
};

function ProLock({ onUpgrade, trialExpired = false }) {
  const isMobile = useMobile();
  const [hovered, setHovered] = useState(null);
  const tiers = [
    { tier: 'starter',      label: 'Starter',      price: '₱249',   clients: '5 clients',              color: '#5ac8fa', note: 'Best entry point' },
    { tier: 'solo',         label: 'Solo',         price: '₱599',   clients: '10 clients',             color: '#0071e3', note: null },
    { tier: 'professional', label: 'Professional', price: '₱1,499', clients: '15 clients',             color: '#ff9500', note: null },
    { tier: 'firm',         label: 'Firm',         price: '₱2,999', clients: '50 clients',             color: '#34c759', note: null },
    { tier: 'agency',       label: 'Agency',       price: '₱4,999', clients: '100 clients',            color: '#af52de',
      note: 'Rolling Forecast & Comparative — Phase 2' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 360, padding: 40 }}>
      <div style={{ background: T.surface, borderRadius: 20, padding: '40px 48px', textAlign: 'center',
        boxShadow: T.shadowMd, border: `1px solid ${T.border}`, maxWidth: 500 }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🔒</div>
        {trialExpired && (
          <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
            padding: '8px 14px', marginBottom: 14, fontSize: 13, color: '#92400e' }}>
            Your 30-day free trial has ended. Choose a plan to continue.
          </div>
        )}
        <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: T.text }}>
          {trialExpired ? 'Trial Ended — Upgrade to Continue' : 'Paid Plan Feature'}
        </h3>
        <p style={{ margin: '0 0 20px', color: T.muted, fontSize: 14, lineHeight: 1.65 }}>
          This tab is available on any paid plan. Upgrade to unlock Journal Entries,
          Trial Balance, Accounting Books, BIR Returns, Alphalist,
          Financial Statements, and Cash Flow.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8, marginBottom: 16, textAlign: 'left' }}>
          {tiers.map(t => (
            <div key={t.tier}
              onClick={() => onUpgrade && onUpgrade(t.tier)}
              onMouseEnter={() => setHovered(t.tier)}
              onMouseLeave={() => setHovered(null)}
              style={{
                background: hovered === t.tier ? `${t.color}18` : `${t.color}10`,
                border: `1.5px solid ${hovered === t.tier ? t.color : t.color + '40'}`,
                borderRadius: 10, padding: '10px 14px',
                cursor: onUpgrade ? 'pointer' : 'default',
                transition: 'all .15s',
              }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: t.color, marginBottom: 2 }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>
                {t.price}<span style={{ fontSize: 11, color: T.muted, fontWeight: 400 }}>/mo</span>
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{t.clients}</div>
              {t.note && (
                <div style={{ marginTop: 5, fontSize: 10, fontWeight: 600, color: t.color,
                  background: `${t.color}15`, borderRadius: 6, padding: '2px 7px', display: 'inline-block',
                  letterSpacing: '0.2px' }}>
                  ✦ {t.note}
                </div>
              )}
              {onUpgrade && (
                <div style={{ marginTop: 6, fontSize: 11, fontWeight: 600, color: t.color,
                  opacity: hovered === t.tier ? 1 : 0, transition: 'opacity .15s' }}>
                  Select this plan →
                </div>
              )}
            </div>
          ))}
        </div>
        {onUpgrade ? (
          <button onClick={() => onUpgrade('starter')}
            style={{ width: '100%', padding: '12px 16px', borderRadius: 10, border: 'none',
              background: T.accent, color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'inherit' }}>
            Upgrade Plan →
          </button>
        ) : (
          <a href="mailto:mym@kaimanco.com?subject=MyLedger%20Accountant%20Plan%20Upgrade"
            style={{ display: 'block', background: T.accentL, borderRadius: 10, padding: '12px 16px',
              fontSize: 13, color: T.accent, textDecoration: 'none', cursor: 'pointer',
              border: `1px solid ${T.accent}30` }}>
            📧 Email <strong>mym@kaimanco.com</strong> to upgrade →
          </a>
        )}
      </div>
    </div>
  );
}

function VatCalc({ type, amount, vatType = 'vatable', supplierVatType = 'vat', isOPT = false, optRate = 0.03 }) {
  if (!amount || isNaN(amount) || Number(amount) <= 0) return null;
  const n = parseFloat(amount);
  const round = x => Math.round(x * 100) / 100;
  let net, vat, gross, ptax = 0, msg, bg = T.accentL;

  if (type === 'income') {
    if (isOPT) {
      net = n; vat = 0; gross = n; ptax = round(n * optRate);
      msg = `OPT client — GROSS = NET. Percentage Tax: ${(optRate * 100).toFixed(0)}% = ${peso(ptax)}`;
      bg = '#fff8ec';
    } else if (vatType === 'zero_rated') {
      net = n; vat = 0; gross = n;
      msg = 'Zero-rated — no VAT charged. GROSS = NET.';
      bg = '#e8f5ff';
    } else if (vatType === 'exempt') {
      net = n; vat = 0; gross = n;
      msg = 'VAT-exempt — no VAT. GROSS = NET.';
      bg = '#f0fff4';
    } else {
      net = n; vat = round(n * 0.12); gross = round(n * 1.12);
      msg = 'NET entered — customer pays GROSS (inc. 12% VAT).';
    }
  } else {
    if (supplierVatType === 'non_vat') {
      net = n; vat = 0; gross = n;
      msg = 'Non-VAT supplier — no input VAT claimable. NET = GROSS.';
      bg = '#f0fff4';
    } else {
      gross = n; net = round(n / 1.12); vat = round(gross - net);
      msg = 'GROSS entered — NET to P&L, input VAT extracted.';
    }
  }
  return (
    <div style={{ background: bg, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginTop: 6 }}>
      <div style={{ color: T.muted, marginBottom: 6 }}>{msg}</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span>NET <strong style={{ color: T.text }}>{peso(net)}</strong></span>
        <span>VAT <strong style={{ color: T.orange }}>{peso(vat)}</strong></span>
        <span>GROSS <strong style={{ color: T.accent }}>{peso(gross)}</strong></span>
        {ptax > 0 && <span>OPT <strong style={{ color: T.purple }}>{peso(ptax)}</strong></span>}
      </div>
    </div>
  );
}

// ─── SVG Bar Chart ─────────────────────────────────────────────────────────────
function MonthlyBarChart({ transactions }) {
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
  const cH      = 110;
  const barW    = 14;
  const gap     = 4;
  const groupW  = 44;
  const W       = months.length * groupW + 16;

  return (
    <div>
      <svg width={W} height={cH + 28} style={{ width: '100%', overflow: 'visible' }}
        viewBox={`0 0 ${W} ${cH + 28}`} preserveAspectRatio="xMinYMid meet">
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
              <rect x={x} y={cH - ih} width={barW} height={Math.max(ih, 1)} fill={T.green} rx={3} opacity={0.85} />
              <rect x={x + barW + gap} y={cH - eh} width={barW} height={Math.max(eh, 1)} fill={T.red} rx={3} opacity={0.75} />
              <text x={x + barW + 1} y={cH + 18} textAnchor="middle"
                fontSize={10} fill={T.muted} fontFamily="-apple-system, sans-serif">{m.label}</text>
            </g>
          );
        })}
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
  if (!forecast) return <div style={{ color: '#888', fontSize: 13, padding: '20px 0' }}>No forecast data.</div>;

  const weeks = forecast.weeks || [];
  const W     = 680;
  const H     = 220;
  const PAD   = { top: 20, right: 20, bottom: 40, left: 72 };
  const cW    = W - PAD.left - PAD.right;
  const cH    = H - PAD.top  - PAD.bottom;

  if (!weeks.length) return <div style={{ color: '#888', fontSize: 13 }}>No weekly data.</div>;

  const balances = weeks.map(w => w.runningBalance);
  const minBal   = Math.min(0, ...balances);
  const maxBal   = Math.max(0, ...balances);
  const range    = maxBal - minBal || 1;

  const scaleX = (i) => PAD.left + (i / (weeks.length - 1 || 1)) * cW;
  const scaleY = (v) => PAD.top + cH - ((v - minBal) / range) * cH;

  const pts = weeks.map((w, i) => `${scaleX(i)},${scaleY(w.runningBalance)}`).join(' ');

  const zeroY = scaleY(0);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => ({
    value: minBal + f * range,
    y: PAD.top + cH * (1 - f),
  }));

  const fmt = (n) => {
    const abs = Math.abs(n || 0);
    const sign = (n || 0) < 0 ? '-' : '';
    if (abs >= 1000000) return sign + '₱' + (abs / 1000000).toFixed(1) + 'M';
    if (abs >= 1000)    return sign + '₱' + (abs / 1000).toFixed(0)    + 'k';
    return sign + '₱' + abs.toFixed(0);
  };

  const summaryKey = String(days);
  const s = forecast.summary?.[summaryKey] || {};

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[30, 60, 90].map(d => (
          <button key={d} onClick={() => onDaysChange(d)}
            style={{
              padding: '5px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontWeight: d === days ? 700 : 400, fontSize: 13,
              background: d === days ? '#0f766e' : '#f1f5f9',
              color:      d === days ? '#fff'    : '#475569',
            }}>
            {d}d
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
        {ticks.map((tick, i) => (
          <g key={i}>
            <line x1={PAD.left} y1={tick.y} x2={W - PAD.right} y2={tick.y}
              stroke="#e2e8f0" strokeWidth="1" strokeDasharray={tick.value === 0 ? 'none' : '3 3'} />
            <text x={PAD.left - 6} y={tick.y + 4} textAnchor="end" fontSize="10" fill="#94a3b8">
              {fmt(tick.value)}
            </text>
          </g>
        ))}
        {minBal < 0 && maxBal > 0 && (
          <line x1={PAD.left} y1={zeroY} x2={W - PAD.right} y2={zeroY}
            stroke="#94a3b8" strokeWidth="1.5" />
        )}
        <polygon
          points={weeks.map((w, i) => `${scaleX(i)},${scaleY(Math.max(0, w.runningBalance))}`).join(' ')
            + ` ${scaleX(weeks.length - 1)},${zeroY} ${PAD.left},${zeroY}`}
          fill="#0f766e" opacity="0.12" />
        {minBal < 0 && (
          <polygon
            points={`${PAD.left},${zeroY} `
              + weeks.map((w, i) => `${scaleX(i)},${scaleY(Math.min(0, w.runningBalance))}`).join(' ')
              + ` ${scaleX(weeks.length - 1)},${zeroY}`}
            fill="#ef4444" opacity="0.15" />
        )}
        <polyline points={pts} fill="none" stroke="#0f766e" strokeWidth="2.5" strokeLinejoin="round" />
        {weeks.map((w, i) => (
          <g key={i}>
            <title>{`Week ${w.week} (${w.weekStart})
Balance: ${fmt(w.runningBalance)}
AR: ${fmt(w.inflows)}
Expenses: ${fmt(w.outflows)}
Tax: ${fmt(w.taxObligations)}`}</title>
            <circle cx={scaleX(i)} cy={scaleY(w.runningBalance)} r="4"
              fill={w.runningBalance >= 0 ? '#0f766e' : '#ef4444'}
              stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}
        {weeks.map((w, i) => (i % 2 === 0 || i === weeks.length - 1) && (
          <text key={i} x={scaleX(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="#94a3b8">
            {w.weekStart.slice(5)}
          </text>
        ))}
      </svg>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 14 }}>
        {[
          { label: 'Opening Balance',     value: fmt(forecast.openingBalance || 0), color: '#0f172a' },
          { label: `${days}d Inflows`,    value: fmt(s.inflows  || 0),             color: '#0f766e' },
          { label: `${days}d Outflows`,   value: fmt(s.outflows || 0),             color: '#ef4444' },
          { label: `${days}d End Balance`,value: fmt(s.endBalance ?? forecast.openingBalance ?? 0),
            color: (s.endBalance ?? 0) >= 0 ? '#0f766e' : '#ef4444' },
        ].map(c => (
          <div key={c.label} style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
        Weekly expense avg: {fmt(forecast.assumptions?.weeklyExpenseAvg || 0)} ·
        AR pending: {forecast.assumptions?.arPending || 0} invoice(s) ·
        Tax obligations: {forecast.assumptions?.taxCount || 0}
      </div>
    </div>
  );
}

const INCOME_SETTLEMENTS  = ['cash','ar','ewallet','bank_transfer','check'];
const EXPENSE_SETTLEMENTS = ['cash','ap','ewallet','bank_transfer','check','credit_card'];
const SETTLEMENT_LABELS   = {
  cash: 'Cash', ar: 'Accounts Receivable', ap: 'Accounts Payable',
  ewallet: 'E-wallet (GCash/Maya)', bank_transfer: 'Bank Transfer',
  check: 'Check / Cheque', credit_card: 'Credit Card',
};

// ─── TxModal (module-level — own state, no parent remount) ───────────────────
function TxModal({ clientId, client, onSaved, onClose }) {
  const isMobile = useMobile();
  const isOPT   = client?.taxRegime === 'opt';
  const optRate = client?.optRate ?? 0.03;

  const today = new Date().toISOString().substring(0, 10);
  const blank = {
    type: 'income', amount: '', description: '', category: '', customCat: '',
    vatType: 'vatable', supplierVatType: 'vat', settlement: 'cash', account: '',
    counterpartyName: '', counterpartyTin: '', counterpartyAddress: '',
    referenceNo: '', notes: '',
    ewtRate: '0',  // expense only — expanded withholding tax rate
    date: today,
  };
  const [form,       setForm]       = useState(blank);
  const [saving,     setSaving]     = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrMsg,     setOcrMsg]     = useState('');
  const fileRef = useRef(null);

  const cats       = form.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const isCustom   = form.category === CUSTOM_OPT;
  const settlements = form.type === 'income' ? INCOME_SETTLEMENTS : EXPENSE_SETTLEMENTS;
  const set        = key => e => setForm(f => ({ ...f, [key]: e.target.value }));
  const amtLabel   = form.type === 'income'
    ? (isOPT ? 'Amount — GROSS Sales' : form.vatType === 'vatable' ? 'Amount — NET (ex-VAT)' : 'Amount')
    : (form.supplierVatType === 'vat' ? 'Amount — GROSS (inc. VAT)' : 'Amount — NET (no VAT)');

  async function handleOcrFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true); setOcrMsg('');
    try {
      const data = await scanReceipt(file);
      setForm(f => ({
        ...f,
        type:             'expense',
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
      e.target.value = '';
    }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    const finalCat = isCustom ? form.customCat.trim() || 'Other' : form.category;
    try {
      await createTransaction({
        clientId, type: form.type, amount: parseFloat(form.amount),
        description: form.description,
        category: finalCat || undefined,
        vatType: form.vatType,
        supplierVatType: form.supplierVatType,
        settlement: form.settlement,
        account: form.account || undefined,
        counterpartyName: form.counterpartyName, counterpartyTin: form.counterpartyTin,
        counterpartyAddress: form.counterpartyAddress,
        referenceNo: form.referenceNo, notes: form.notes,
        ewtRate: form.type === 'expense' ? parseFloat(form.ewtRate || 0) : 0,
        date: form.date || undefined,
      });
      onSaved(); onClose();
    } catch (e) { alert(e.message); setSaving(false); }
  }

  return (
    <ModalShell title="Add Transaction" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        {/* ── OCR Receipt Scanner ── */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment"
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

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 16px' }}>
          <Fld label="Transaction Date">
            <input style={inp} type="date" required
              value={form.date} onChange={set('date')} max={today} />
          </Fld>
          <Fld label="Type">
            <select style={inp} value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value, category: '', customCat: '',
                vatType: 'vatable', supplierVatType: 'vat',
                settlement: e.target.value === 'income' ? 'cash' : 'cash' }))}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </Fld>
          <Fld label={amtLabel}>
            <input style={inp} type="number" step="0.01" min="0.01" required
              value={form.amount} onChange={set('amount')} placeholder="0.00" />
          </Fld>
        </div>

        {/* VAT type selector */}
        {form.type === 'income' && !isOPT && (
          <Fld label="VAT Type">
            <select style={inp} value={form.vatType} onChange={set('vatType')}>
              <option value="vatable">Vatable (12%)</option>
              <option value="zero_rated">Zero-rated (0% — exports, etc.)</option>
              <option value="exempt">VAT-exempt (Sec. 109 NIRC)</option>
            </select>
          </Fld>
        )}
        {form.type === 'income' && isOPT && (
          <div style={{ background: '#fff8ec', border: `1px solid ${T.orange}30`, borderRadius: 8,
            padding: '8px 12px', fontSize: 12, color: T.orange, marginBottom: 10 }}>
            ⚡ OPT Client — Percentage Tax applies ({(optRate * 100).toFixed(0)}%). Enter GROSS sales.
          </div>
        )}
        {form.type === 'expense' && (
          <Fld label="Supplier VAT Type">
            <select style={inp} value={form.supplierVatType} onChange={set('supplierVatType')}>
              <option value="vat">VAT-registered supplier (extract 12% input VAT)</option>
              <option value="non_vat">Non-VAT supplier (no input VAT)</option>
            </select>
          </Fld>
        )}

        <VatCalc type={form.type} amount={form.amount}
          vatType={form.vatType} supplierVatType={form.supplierVatType}
          isOPT={isOPT} optRate={optRate} />

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Description *">
            <input style={inp} required value={form.description} onChange={set('description')}
              placeholder="Brief description" />
          </Fld>
          <Fld label="Reference / OR No.">
            <input style={inp} value={form.referenceNo} onChange={set('referenceNo')}
              placeholder="Invoice or OR number" />
          </Fld>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Settlement Method">
            <select style={inp} value={form.settlement} onChange={set('settlement')}>
              {settlements.map(s => <option key={s} value={s}>{SETTLEMENT_LABELS[s]}</option>)}
            </select>
          </Fld>
          <Fld label="Account Name (optional)">
            <input style={inp} value={form.account} onChange={set('account')}
              placeholder={form.type === 'income' ? 'e.g. Sales Revenue' : 'e.g. Office Supplies'} />
          </Fld>
        </div>

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

        {/* Counterparty section */}
        <div style={{ marginTop: 4, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 10,
            textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            {form.type === 'income' ? 'Customer Details (SLSP / BIR)' : 'Vendor Details (SLSP / Alphalist)'}
          </div>
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

        <Fld label="Internal Notes">
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 60 }}
            value={form.notes} onChange={set('notes')} placeholder="Adjusting notes, audit trail, etc." />
        </Fld>

        {/* EWT — Expanded Withholding Tax (expense only) */}
        {form.type === 'expense' && (
          <div style={{ background: '#fff8f0', border: `1px solid ${T.orange}30`,
            borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.orange,
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
              Expanded Withholding Tax (EWT / 1601-EQ) — Optional
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Fld label="EWT Rate">
                <select style={{ ...inp }} value={form.ewtRate} onChange={set('ewtRate')}>
                  <option value="0">None</option>
                  <option value="0.01">1% — Payments to suppliers (goods)</option>
                  <option value="0.02">2% — Payments for services</option>
                  <option value="0.05">5% — Professional fees (small)</option>
                  <option value="0.10">10% — Professional fees (large / Sec. 2.57.2)</option>
                  <option value="0.15">15% — Rental (real property, Sec. 2.57.2)</option>
                  <option value="0.25">25% — Non-resident</option>
                </select>
              </Fld>
              {parseFloat(form.ewtRate) > 0 && parseFloat(form.amount) > 0 && (() => {
                const net = form.supplierVatType === 'vat'
                  ? parseFloat(form.amount) / 1.12
                  : parseFloat(form.amount);
                const ewt = Math.round(net * parseFloat(form.ewtRate) * 100) / 100;
                return (
                  <div style={{ background: `${T.orange}15`, borderRadius: 8, padding: '8px 14px',
                    fontSize: 13, color: T.orange, fontWeight: 600 }}>
                    EWT: {peso(ewt)} withheld
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Transaction'}</Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── JournalEntryModal (module-level) ────────────────────────────────────────
function JournalEntryModal({ clientId, onSaved, onClose }) {
  const isMobile = useMobile();
  const blank = () => ({ account: '', debit: '', credit: '' });
  const [form,  setForm]  = useState({
    date: new Date().toISOString().substring(0, 10),
    description: '', referenceNo: '',
  });
  const [lines,  setLines]  = useState([blank(), blank()]);
  const [saving, setSaving] = useState(false);

  const setF = key => e => setForm(f => ({ ...f, [key]: e.target.value }));
  const setL = (i, key) => e =>
    setLines(ls => ls.map((l, idx) => idx === i ? { ...l, [key]: e.target.value } : l));

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!balanced) return alert('Journal entry must balance — Debits must equal Credits.');
    setSaving(true);
    try {
      await createJournalEntry({
        clientId, date: form.date, description: form.description, referenceNo: form.referenceNo,
        entries: lines
          .filter(l => l.account || parseFloat(l.debit) || parseFloat(l.credit))
          .map(l => ({ account: l.account, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
      });
      onSaved(); onClose();
    } catch (err) { alert(err.message); setSaving(false); }
  }

  return (
    <ModalShell title="New Journal Entry" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '160px 1fr 1fr', gap: '0 16px' }}>
          <Fld label="Date">
            <input style={inp} type="date" required value={form.date} onChange={setF('date')} />
          </Fld>
          <Fld label="Description *">
            <input style={inp} required value={form.description} onChange={setF('description')} placeholder="Journal entry memo" />
          </Fld>
          <Fld label="Reference No.">
            <input style={inp} value={form.referenceNo} onChange={setF('referenceNo')} placeholder="JE-001" />
          </Fld>
        </div>

        <div style={{ marginTop: 4 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 32px', gap: '0 8px', marginBottom: 6 }}>
            {['Account Name', 'Debit (₱)', 'Credit (₱)', ''].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 600, color: T.muted,
                textTransform: 'uppercase', letterSpacing: '0.4px' }}>{h}</div>
            ))}
          </div>

          {lines.map((line, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 32px', gap: '0 8px', marginBottom: 8 }}>
              <input style={inp} value={line.account} onChange={setL(i, 'account')}
                placeholder={i === 0 ? 'e.g. Cash / Bank Account' : 'e.g. Sales Revenue'} />
              <input style={{ ...inp, textAlign: 'right' }} type="number" step="0.01" min="0"
                value={line.debit} onChange={setL(i, 'debit')} placeholder="0.00" />
              <input style={{ ...inp, textAlign: 'right' }} type="number" step="0.01" min="0"
                value={line.credit} onChange={setL(i, 'credit')} placeholder="0.00" />
              <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                disabled={lines.length <= 2}
                style={{ border: 'none', background: 'none', fontSize: 18, color: T.red,
                  cursor: lines.length <= 2 ? 'not-allowed' : 'pointer',
                  opacity: lines.length <= 2 ? 0.25 : 1 }}>✕</button>
            </div>
          ))}

          {/* Totals */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 130px 32px', gap: '0 8px',
            paddingTop: 10, borderTop: `2px solid ${T.border}`, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.muted }}>Totals</div>
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: balanced ? T.accent : T.orange }}>
              {peso(totalDebit)}</div>
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 14, color: balanced ? T.accent : T.orange }}>
              {peso(totalCredit)}</div>
            <div />
          </div>

          {!balanced && totalDebit > 0 && (
            <div style={{ fontSize: 12, color: T.orange, marginTop: 6 }}>
              ⚠ Out of balance by {peso(Math.abs(totalDebit - totalCredit))}
            </div>
          )}
          {balanced && (totalDebit > 0) && (
            <div style={{ fontSize: 12, color: T.accent, marginTop: 6 }}>✓ Balanced</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
          <Btn variant="ghost" size="sm" type="button"
            onClick={() => setLines(ls => [...ls, blank()])}>+ Add Line</Btn>
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" disabled={saving || !balanced}>{saving ? 'Saving…' : 'Post Entry'}</Btn>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── ContactModal (module-level) ──────────────────────────────────────────────
const CON_TYPES = [
  { value: 'customer', label: '🧑‍💼 Customer' },
  { value: 'supplier', label: '🏭 Supplier' },
  { value: 'both',     label: '🔄 Both' },
];

function ContactModal({ clientId, existing, onSaved, onClose }) {
  const isMobile = useMobile();
  const blank = { name: '', type: 'supplier', tin: '', address: '', phone: '', email: '', notes: '' };
  const [form, setForm] = useState(existing ? { ...blank, ...existing } : blank);
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.name.trim()) return alert('Name is required');
    setSaving(true);
    try {
      if (existing?.id) {
        await updateContact(existing.id, form);
      } else {
        await createContact({ ...form, clientId });
      }
      onSaved();
      onClose();
    } catch (e) { alert(e.message); }
    finally { setSaving(false); }
  }

  const fld = (label, key, type = 'text', placeholder = '') => (
    <div>
      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>{label}</label>
      <input type={type} value={form[key]} placeholder={placeholder}
        onChange={e => set(key, e.target.value)}
        style={{ ...inp, width: '100%' }} />
    </div>
  );

  return (
    <ModalShell title={existing ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {fld('Name *', 'name', 'text', 'e.g. ABC Trading Corporation')}
        <div>
          <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>Type *</label>
          <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
            {CON_TYPES.map(ct => (
              <button key={ct.value} onClick={() => set('type', ct.value)}
                style={{ flex: 1, padding: '8px 6px', border: 'none', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                  background: form.type === ct.value ? T.accent : T.surface,
                  color: form.type === ct.value ? '#fff' : T.muted }}>
                {ct.label}
              </button>
            ))}
          </div>
        </div>
        {fld('TIN', 'tin', 'text', '000-000-000-000')}
        {fld('Address', 'address', 'text', 'Business address')}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
          {fld('Phone', 'phone', 'tel', '+63 9XX XXX XXXX')}
          {fld('Email', 'email', 'email', 'contact@example.com')}
        </div>
        <div>
          <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>Notes</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            rows={2} placeholder="Optional notes"
            style={{ ...inp, width: '100%', resize: 'vertical', fontFamily: 'inherit' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
          <Btn variant="neutral" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : existing ? 'Save Changes' : 'Add Contact'}</Btn>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── AssetModal (module-level) ───────────────────────────────────────────────
const ASSET_CATS = ['Land','Building','Machinery & Equipment','Furniture & Fixtures','Transportation Equipment','Office Equipment','Computer Equipment','Leasehold Improvements','Other Fixed Assets'];

function AssetModal({ clientId, onSaved, onClose }) {
  const isMobile = useMobile();
  const blank = {
    name: '', category: 'Machinery & Equipment',
    cost: '', salvageValue: '0', usefulLifeMonths: '60',
    startDate: new Date().toISOString().substring(0, 10),
    notes: '',
  };
  const [form, setForm]   = useState(blank);
  const [saving, setSaving] = useState(false);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  const depPM = form.cost && form.usefulLifeMonths
    ? ((Number(form.cost) - Number(form.salvageValue || 0)) / Number(form.usefulLifeMonths)).toFixed(2)
    : null;

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    try {
      await createAsset({
        clientId, name: form.name, category: form.category,
        cost: Number(form.cost), salvageValue: Number(form.salvageValue || 0),
        usefulLifeMonths: Number(form.usefulLifeMonths),
        startDate: form.startDate, notes: form.notes,
      });
      onSaved(); onClose();
    } catch (err) { alert(err.message); setSaving(false); }
  }

  return (
    <ModalShell title="Add Fixed Asset" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Fld label="Asset Name *">
          <input style={inp} required value={form.name} onChange={set('name')}
            placeholder="e.g. Delivery Van, MacBook Pro" />
        </Fld>
        <Fld label="Category">
          <select style={inp} value={form.category} onChange={set('category')}>
            {ASSET_CATS.map(c => <option key={c}>{c}</option>)}
          </select>
        </Fld>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Cost (₱) *">
            <input style={inp} type="number" min="0.01" step="0.01" required
              value={form.cost} onChange={set('cost')} placeholder="0.00" />
          </Fld>
          <Fld label="Salvage Value (₱)">
            <input style={inp} type="number" min="0" step="0.01"
              value={form.salvageValue} onChange={set('salvageValue')} placeholder="0.00" />
          </Fld>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Useful Life (months) *">
            <input style={inp} type="number" min="1" required
              value={form.usefulLifeMonths} onChange={set('usefulLifeMonths')} placeholder="60" />
          </Fld>
          <Fld label="Start Date *">
            <input style={inp} type="date" required
              value={form.startDate} onChange={set('startDate')} />
          </Fld>
        </div>
        {depPM && (
          <div style={{ background: T.accentL, borderRadius: 8, padding: '10px 14px',
            fontSize: 13, marginBottom: 12 }}>
            Monthly depreciation (straight-line):{' '}
            <strong style={{ color: T.accent }}>₱{Number(depPM).toLocaleString('en-PH', { minimumFractionDigits: 2 })}</strong>
          </div>
        )}
        <Fld label="Notes">
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 52 }}
            value={form.notes} onChange={set('notes')} placeholder="Optional" />
        </Fld>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Asset'}</Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Trial balance helper ─────────────────────────────────────────────────────
function computeTrialBalance(transactions, journals) {
  const accts = {};
  function add(name, dr, cr) {
    if (!name) return;
    if (!accts[name]) accts[name] = { debit: 0, credit: 0 };
    accts[name].debit  += dr || 0;
    accts[name].credit += cr || 0;
  }
  transactions.forEach(t => {
    const settleAcct = t.settlementAccount || (t.settlement === 'ar' ? 'Accounts Receivable' : t.settlement === 'ap' ? 'Accounts Payable' : 'Cash / Bank');
    const revenueAcct = t.account || 'Sales Revenue';
    const expenseAcct = t.account || t.category || 'Operating Expense';
    if (t.type === 'income') {
      add(settleAcct,              t.gross || 0, 0);
      add(revenueAcct,             0, t.net || 0);
      if (t.vat > 0) add('Output VAT Payable', 0, t.vat);
    } else {
      add(expenseAcct,             t.net || 0, 0);
      if (t.vat > 0) add('Input VAT Recoverable', t.vat || 0, 0);
      add(settleAcct,              0, t.gross || 0);
    }
  });
  journals.forEach(je => {
    je.entries.forEach(e => add(e.account, e.debit, e.credit));
  });
  return Object.entries(accts)
    .map(([name, { debit, credit }]) => ({ name, debit, credit, balance: debit - credit }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Alphalist helper ─────────────────────────────────────────────────────────
function computeAlphalist(transactions, year = 0, quarter = 0) {
  let filtered = transactions.filter(t => t.type === 'expense' && !t.isVoid);
  if (year) {
    filtered = filtered.filter(t => new Date(t.createdAt).getFullYear() === year);
    if (quarter) {
      filtered = filtered.filter(t => {
        const m = new Date(t.createdAt).getMonth() + 1;
        return Math.ceil(m / 3) === quarter;
      });
    }
  }
  const map = {};
  filtered.forEach(t => {
    const key = t.counterpartyTin || '__NO_TIN__' + (t.counterpartyName || '');
    if (!map[key]) map[key] = {
      tin: t.counterpartyTin || '—', name: t.counterpartyName || 'Unknown Vendor',
      address: t.counterpartyAddress || '—',
      gross: 0, net: 0, vat: 0, ewt: 0, txCount: 0,
    };
    map[key].gross   = Math.round((map[key].gross   + (t.gross       || 0)) * 100) / 100;
    map[key].net     = Math.round((map[key].net     + (t.net         || 0)) * 100) / 100;
    map[key].vat     = Math.round((map[key].vat     + (t.vat         || 0)) * 100) / 100;
    map[key].ewt     = Math.round((map[key].ewt     + (t.ewtAmount   || 0)) * 100) / 100;
    map[key].txCount++;
  });
  return Object.values(map).sort((a, b) => b.gross - a.gross);
}

// ─── BIR 2550M/2550Q helper ───────────────────────────────────────────────────
function computeBIRVAT(transactions, year, month, isQuarterly) {
  // For monthly: filter to that month. For quarterly: filter to 3-month quarter.
  const q = isQuarterly ? Math.floor((month - 1) / 3) : null;
  const filtered = transactions.filter(t => {
    const d = new Date(t.createdAt);
    const y = d.getFullYear(); const m = d.getMonth() + 1;
    if (y !== year) return false;
    if (isQuarterly) return Math.floor((m - 1) / 3) === q;
    return m === month;
  });
  const income  = filtered.filter(t => t.type === 'income');
  const expense = filtered.filter(t => t.type === 'expense');
  const grossSales      = income.reduce((s, t) => s + (t.gross || 0), 0);
  const outputVAT       = income.reduce((s, t) => s + (t.vat   || 0), 0);
  const grossPurchases  = expense.reduce((s, t) => s + (t.gross || 0), 0);
  const inputVAT        = expense.reduce((s, t) => s + (t.vat   || 0), 0);
  const netVATDue       = Math.max(outputVAT - inputVAT, 0);
  const excessInputVAT  = Math.max(inputVAT - outputVAT, 0);
  const endMonth = isQuarterly ? q * 3 + 3 : month;
  return { grossSales, outputVAT, grossPurchases, inputVAT, netVATDue, excessInputVAT,
    month: endMonth, txCount: filtered.length };
}

// ─── BIR 2550M/2550Q Form Pre-fill (line-item breakdown by vatType) ──────────
function compute2550Prefill(transactions, year, month, isQuarterly) {
  const q = isQuarterly ? Math.floor((month - 1) / 3) : null;
  const filtered = transactions.filter(t => {
    const d = new Date(t.createdAt);
    const ty = d.getFullYear(); const m = d.getMonth() + 1;
    if (ty !== year) return false;
    if (isQuarterly) return Math.floor((m - 1) / 3) === q;
    return m === month;
  });
  const rnd = n => Math.round((n || 0) * 100) / 100;
  const income  = filtered.filter(t => t.type === 'income');
  const expense = filtered.filter(t => t.type === 'expense');

  // Sales breakdown by vatType
  const vatableInc   = income.filter(t => !t.vatType || t.vatType === 'vatable');
  const zeroRatedInc = income.filter(t => t.vatType === 'zero-rated');
  const exemptInc    = income.filter(t => t.vatType === 'exempt');

  const item31A = rnd(vatableInc.reduce((s,t)   => s + (t.net || 0), 0));  // Taxable sales (net of VAT)
  const item31B = rnd(vatableInc.reduce((s,t)   => s + (t.vat || 0), 0));  // Output VAT (12%)
  const item32A = rnd(zeroRatedInc.reduce((s,t) => s + (t.net || 0), 0));  // Zero-rated sales
  const item33A = rnd(exemptInc.reduce((s,t)    => s + (t.net || 0), 0));  // Exempt sales
  const item34  = rnd(item31A + item32A + item33A);                          // Total sales/receipts

  // Purchases breakdown by supplierVatType
  const vatableExp = expense.filter(t => !t.supplierVatType || t.supplierVatType === 'vatable');

  const item44A = rnd(vatableExp.reduce((s,t) => s + (t.gross || 0), 0));  // Domestic purchases (gross)
  const item44B = rnd(vatableExp.reduce((s,t) => s + (t.vat   || 0), 0));  // Input VAT from purchases

  const vatPayable   = rnd(Math.max(0, item31B - item44B));
  const excessInput  = rnd(Math.max(0, item44B - item31B));

  return { item31A, item31B, item32A, item33A, item34, item44A, item44B,
    vatPayable, excessInput, txCount: filtered.length };
}

// ─── BIR 2551M/2551Q helper (OPT / Percentage Tax) ───────────────────────────
function computeOPT(transactions, client, year, month, isQuarterly) {
  const optRate = client?.optRate ?? 0.03;
  const q = isQuarterly ? Math.floor((month - 1) / 3) : null;
  const filtered = transactions.filter(t => {
    const d = new Date(t.createdAt);
    const y = d.getFullYear(); const m = d.getMonth() + 1;
    if (y !== year) return false;
    if (t.type !== 'income') return false;
    if (isQuarterly) return Math.floor((m - 1) / 3) === q;
    return m === month;
  });
  const grossSales     = filtered.reduce((s, t) => s + (t.gross || 0), 0);
  const percentageTax  = Math.round(grossSales * optRate * 100) / 100;
  const endMonth = isQuarterly ? q * 3 + 3 : month;
  return { grossSales, optRate, percentageTax, month: endMonth, txCount: filtered.length };
}

// ─── TRAIN Law income tax helpers ────────────────────────────────────────────
const round2 = n => Math.round(n * 100) / 100;

function trainGraduated(taxableIncome) {
  if (taxableIncome <= 0)         return 0;
  if (taxableIncome <= 250000)    return 0;
  if (taxableIncome <= 400000)    return round2((taxableIncome - 250000) * 0.15);
  if (taxableIncome <= 800000)    return round2(22500  + (taxableIncome - 400000) * 0.20);
  if (taxableIncome <= 2000000)   return round2(102500 + (taxableIncome - 800000) * 0.25);
  if (taxableIncome <= 8000000)   return round2(402500 + (taxableIncome - 2000000) * 0.30);
  return round2(2202500 + (taxableIncome - 8000000) * 0.35);
}

// Annual income tax computation (1701 / 1701A / 1702 / 1702Q)
function computeIncomeTax(transactions, client, year, quarter /* null = annual */) {
  const isQuarterly = quarter !== null && quarter !== undefined;
  const filtered = transactions.filter(t => {
    const d  = new Date(t.createdAt);
    if (d.getFullYear() !== year) return false;
    if (isQuarterly) {
      // quarter = 1..4; months in quarter: Q1=1-3, Q2=1-6, Q3=1-9, Q4=1-12 (cumulative)
      const m = d.getMonth() + 1;
      return m <= quarter * 3;
    }
    return true; // annual — all months
  });

  const allIncome  = filtered.filter(t => t.type === 'income');
  const expense    = filtered.filter(t => t.type === 'expense');

  // Split income: taxable vs non-taxable (reimbursements, capital contributions, etc.)
  const nonTaxIncome = allIncome.filter(t => NON_TAXABLE_INCOME_CATS.includes(t.category));
  const income       = allIncome.filter(t => !NON_TAXABLE_INCOME_CATS.includes(t.category));

  // Use NET (VAT-exclusive) for all income tax computations.
  // Output VAT collected is a liability (remitted to BIR), not revenue.
  const grossRevenue    = round2(income.reduce((s, t)  => s + (t.net || 0), 0));
  const netRevenue      = grossRevenue;  // same — both VAT-exclusive
  const totalExpenses   = round2(expense.reduce((s, t) => s + (t.net   || 0), 0));
  const nonTaxableTotal = round2(nonTaxIncome.reduce((s, t) => s + (t.net || 0), 0));
  const totalGrossAll   = round2(allIncome.reduce((s, t) => s + (t.net || 0), 0));
  const taxableIncome = round2(netRevenue - totalExpenses);

  const type      = client?.type || 'Corporation';
  const taxOption = client?.taxOption || 'graduated';
  const isMsme    = !!client?.isMsme;

  const isSoleProp = type === 'Sole Proprietor' || type === 'Individual';

  let taxDue = 0;
  let method = '';

  if (isSoleProp) {
    if (taxOption === '8percent') {
      // 8% flat on (gross revenue - 250,000) — no deductions
      taxDue = round2(Math.max(grossRevenue - 250000, 0) * 0.08);
      method = '8% Flat Tax on Gross Revenue − ₱250,000';
    } else if (taxOption === 'osd') {
      // OSD: 40% of gross revenue as deduction, then graduated
      const osdDeduction = round2(grossRevenue * 0.40);
      const osdTaxable   = round2(grossRevenue - osdDeduction);
      taxDue = trainGraduated(osdTaxable);
      method = `OSD (40%) — Taxable Income: ₱${osdTaxable.toLocaleString()}`;
    } else {
      // Graduated — net income after actual expenses
      taxDue = trainGraduated(taxableIncome);
      method = 'Graduated Rates (Actual Deductions)';
    }
  } else {
    // ── Corporate income tax: RCIT vs MCIT ───────────────────────────────────
    // RCIT: 25% of net taxable income (20% for MSME qualifying under CREATE)
    // MCIT: 2% of gross income (revenue − cost of sales), applies from 4th taxable year
    //       Temporarily 1% under CREATE Act Jul 2020–Jun 2023; back to 2% from Jul 2023
    // Rule: pay the HIGHER of RCIT or MCIT (MCIT only once in 4th year+)

    const rcitRate = isMsme ? 0.20 : 0.25;
    // MCIT rate: 1% if period is 2020–Jun 2023, else 2%
    const mcitRate = (year < 2023 || (year === 2023 && (quarter || 4) <= 2)) ? 0.01 : 0.02;

    // Gross income for MCIT = gross revenue − COGS (we use grossRevenue as proxy if no COGS split)
    const cogsExpense = expense.filter(t => t.category === 'Cost of Goods Sold');
    const cogs        = round2(cogsExpense.reduce((s, t) => s + (t.net || 0), 0));
    const grossIncome = round2(Math.max(grossRevenue - cogs, 0)); // Gross Revenue − COGS

    const rcit = round2(Math.max(taxableIncome, 0) * rcitRate);
    const mcit = round2(grossIncome * mcitRate);

    // MCIT applicability: only from the 4th taxable year after date of incorporation
    // If incorporationDate not set, default conservative = MCIT applicable
    let mcitApplicable = true;
    if (client?.incorporationDate) {
      const incDate   = new Date(client.incorporationDate);
      const incYear   = incDate.getFullYear();
      // 4th taxable year = incorporation year + 3
      mcitApplicable  = year >= incYear + 3;
    }

    const applyMCIT = mcitApplicable && mcit > rcit;
    taxDue = applyMCIT ? mcit : rcit;

    const rcitLabel = `${(rcitRate * 100).toFixed(0)}% RCIT`;
    const mcitLabel = `${(mcitRate * 100).toFixed(0)}% MCIT`;
    method = applyMCIT
      ? `${mcitLabel} applies (MCIT ₱${mcit.toLocaleString()} > RCIT ₱${rcit.toLocaleString()})`
      : `${rcitLabel} applies (RCIT ₱${rcit.toLocaleString()} ≥ MCIT ₱${mcit.toLocaleString()})`;

    // Attach MCIT details to return for use in form rendering
    Object.assign({}, { rcit, mcit, mcitRate, rcitRate, grossIncome, cogs, applyMCIT, mcitApplicable });
    // store on result object below
    return {
      year, quarter, periodLabel: isQuarterly ? `Q${quarter}` : 'Annual',
      grossRevenue, netRevenue, totalExpenses, taxableIncome,
      grossIncome, cogs,
      rcit, mcit, rcitRate, mcitRate, applyMCIT, mcitApplicable,
      taxDue, method,
      nonTaxableTotal, totalGrossAll,
      isSoleProp: false, taxOption: 'rcit',
      txCount: filtered.length,
    };
  }

  const periodLabel = isQuarterly ? `Q${quarter}` : 'Annual';
  return {
    year, quarter, periodLabel,
    grossRevenue, netRevenue, totalExpenses, taxableIncome,
    nonTaxableTotal, totalGrossAll,
    taxDue, method,
    isSoleProp, taxOption,
    txCount: filtered.length,
  };
}

const TABS = ['Dashboard', 'Transactions', 'Invoices', 'Journal Entries', 'Trial Balance', 'Books', 'General Journal', 'General Ledger', 'COA', 'Period Lock', 'Audit Log', 'BIR Returns', 'Payroll', 'Alphalist', 'SLSP', 'Income Statement', 'Balance Sheet', 'Cash Flow', 'Assets', 'Contacts', 'BIR Reminders', 'Filing Calendar', 'Compare', 'Budget', 'Aged AR/AP', 'Consolidated', 'Portfolio', 'Business Setup', 'Referral', 'My Team'];

// Grouped navigation — replaces the flat 26-tab bar with 6 category groups
const TAB_GROUPS = [
  { label: '📊 Overview',    tabs: ['Dashboard', 'Portfolio'] },
  { label: '📝 Data Entry',  tabs: ['Transactions', 'Invoices', 'Contacts'] },
  { label: '📒 Books',       tabs: ['Journal Entries', 'Trial Balance', 'Books', 'General Journal', 'General Ledger', 'COA', 'Assets'] },
  { label: '📈 Reports',     tabs: ['Income Statement', 'Balance Sheet', 'Cash Flow', 'Compare', 'Budget', 'Aged AR/AP', 'Consolidated'] },
  { label: '🏛 BIR & Tax',   tabs: ['BIR Reminders', 'Filing Calendar', 'BIR Returns', 'Payroll', 'Alphalist', 'SLSP'] },
  { label: '⚙️ Settings',    tabs: ['Period Lock', 'Audit Log', 'Business Setup', 'Referral', 'My Team'] },
];

const TAX_TYPES_LIST = [
  { code: '2550M',  label: '2550M — Monthly VAT Return' },
  { code: '2550Q',  label: '2550Q — Quarterly VAT Return' },
  { code: '2551M',  label: '2551M — Monthly Percentage Tax (Non-VAT)' },
  { code: '2551Q',  label: '2551Q — Quarterly Percentage Tax (Non-VAT)' },
  { code: '1601C',  label: '1601-C — WHT on Compensation' },
  { code: '1601EQ', label: '1601-EQ — Expanded WHT (Quarterly)' },
  { code: '1601FQ', label: '1601-FQ — Final WHT (Quarterly)' },
  { code: '1604EQ', label: '1604-EQ — Annual EWT Return' },
  { code: '1702Q',  label: '1702Q — Quarterly IT (Corp)' },
  { code: '1702',   label: '1702 — Annual IT (Corp)' },
  { code: '1701Q',  label: '1701Q — Quarterly IT (Individual)' },
  { code: '1701',   label: '1701 — Annual IT (Individual)' },
  { code: '1550',   label: '1550 — Documentary Stamp Tax (Monthly)' },
  { code: '2000OT', label: '2000-OT — DST One-Time Transactions' },
];

const BOOKS_COLUMNS = {
  sales: ['Date','Ref / OR No.','Customer','Description','Gross Sales','Output VAT','Net Sales'],
  purchases: ['Date','Ref No.','Vendor','Description','Gross Purchases','Input VAT','Net Purchases'],
  receipts: ['Date','Ref No.','Received From','Description','Mode','Amount (Gross)'],
  disbursements: ['Date','Ref No.','Paid To','Description','Mode','Amount (Gross)'],
};

// ─── EditTxModal ─────────────────────────────────────────────────────────────
// Accountant-only: correct non-amount fields (date, desc, category, ref, notes,
// settlement, counterparty) on transactions that fall in an unlocked period.
const EDIT_INCOME_CATS  = ['Sale of Goods','Sale of Services','Professional Fees','Rental Income','Interest Income','Commission Income','Dividend Income','Other Income'];
const EDIT_EXPENSE_CATS = ['Cost of Goods Sold','Salaries & Wages','Rent','Utilities','Office Supplies','Advertising & Marketing','Transportation & Travel','Professional Fees','Repairs & Maintenance','Bank Charges & Fees','Taxes & Licenses','Depreciation','Insurance','Interest Expense','Other Expenses'];
const EDIT_SETTLEMENTS  = ['cash','ar','ap','ewallet','bank_transfer','check','credit_card'];
const EDIT_SETTLE_LABELS = {
  cash: 'Cash', ar: 'Accounts Receivable', ap: 'Accounts Payable',
  ewallet: 'E-wallet (GCash/Maya)', bank_transfer: 'Bank Transfer',
  check: 'Check', credit_card: 'Credit Card',
};

function EditTxModal({ tx, lockedPeriods = [], onSave, onClose }) {
  const today    = new Date().toISOString().substring(0, 10);
  const origDate = tx.createdAt ? tx.createdAt.substring(0, 10) : today;
  const origPeriod = origDate.substring(0, 7);
  const isLocked = lockedPeriods.some(p => p.period === origPeriod);

  const [form, setForm] = useState({
    date:               origDate,
    type:               tx.type                || 'expense',
    description:        tx.description         || '',
    category:           tx.category            || '',
    referenceNo:        tx.referenceNo         || '',
    notes:              tx.notes               || '',
    counterpartyName:   tx.counterpartyName    || '',
    counterpartyTin:    tx.counterpartyTin     || '',
    counterpartyAddress: tx.counterpartyAddress || '',
    settlement:         tx.settlement          || 'cash',
  });
  const [saving, setSaving] = useState(false);
  const typeChanged = form.type !== tx.type;
  // Use form.type (not tx.type) so the category list updates immediately when type is switched
  const cats = form.type === 'income' ? EDIT_INCOME_CATS : EDIT_EXPENSE_CATS;
  const set  = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  function handleTypeChange(e) {
    const newType = e.target.value;
    // Clear category when type changes to avoid mismatched category/type
    setForm(f => ({ ...f, type: newType, category: '' }));
  }

  const inp = {
    width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
    fontSize: 14, color: T.text, background: '#fafafa', boxSizing: 'border-box',
    outline: 'none', fontFamily: 'inherit',
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try { await onSave(tx.id, form); }
    catch { /* error shown by caller */ }
    finally { setSaving(false); }
  }

  const newPeriod = form.date.substring(0, 7);
  const newPeriodLocked = newPeriod !== origPeriod && lockedPeriods.some(p => p.period === newPeriod);

  return (
    <ModalShell title={`✎ Edit Transaction — ${form.type === 'income' ? '🟢 Income' : '🔴 Expense'}`} onClose={onClose}>
      {isLocked && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#856404' }}>
          ⚠️ Period <strong>{origPeriod}</strong> is currently locked. Unlock it first in the Period Lock tab before editing this transaction.
        </div>
      )}
      <div style={{ background: T.bg, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: T.muted }}>
        <strong>Note:</strong> Amount and VAT cannot be changed here. To correct the amount, void this transaction and add a new one.
        <div style={{ marginTop: 4 }}>Original: {origDate} · {tx.type} · NET {tx.net != null ? `₱${tx.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })}` : '—'}</div>
      </div>

      {/* Type reclassification warning */}
      {typeChanged && (
        <div style={{ background: '#fff8e6', border: '1px solid #f59e0b', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#92400e' }}>
          ⚠️ <strong>Reclassifying:</strong> This will change the transaction from <strong>{tx.type}</strong> to <strong>{form.type}</strong>.
          VAT amounts stay the same — only the accounting treatment changes (revenue ↔ expense, output ↔ input VAT).
          The category has been cleared — please re-select the correct one below.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
          <Fld label="Transaction Date *">
            <input style={inp} type="date" required value={form.date}
              onChange={set('date')} max={today} />
            {newPeriodLocked && (
              <div style={{ fontSize: 11, color: T.red, marginTop: 4 }}>
                ⚠️ Target period {newPeriod} is also locked.
              </div>
            )}
          </Fld>
          <Fld label="Transaction Type">
            <select style={{ ...inp, borderColor: typeChanged ? '#f59e0b' : T.border,
              fontWeight: typeChanged ? 700 : 400 }}
              value={form.type} onChange={handleTypeChange}>
              <option value="income">🟢 Income</option>
              <option value="expense">🔴 Expense</option>
            </select>
          </Fld>
          <Fld label="Settlement">
            <select style={inp} value={form.settlement} onChange={set('settlement')}>
              {EDIT_SETTLEMENTS.map(s => <option key={s} value={s}>{EDIT_SETTLE_LABELS[s]}</option>)}
            </select>
          </Fld>
        </div>

        <Fld label="Description *">
          <input style={inp} required value={form.description} onChange={set('description')} />
        </Fld>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Fld label={`Category ${typeChanged ? '(re-select for new type)' : ''}`}>
            <select style={{ ...inp, borderColor: typeChanged && !form.category ? T.red : T.border }}
              value={form.category} onChange={set('category')}>
              <option value="">— Select —</option>
              {cats.map(c => <option key={c}>{c}</option>)}
            </select>
          </Fld>
          <Fld label="Reference / OR No.">
            <input style={inp} value={form.referenceNo} onChange={set('referenceNo')} placeholder="Invoice or OR number" />
          </Fld>
        </div>

        <div style={{ paddingTop: 10, borderTop: `1px solid ${T.border}`, marginTop: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8,
            textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {form.type === 'income' ? 'Customer Details' : 'Vendor Details'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
            <Fld label={tx.type === 'income' ? 'Customer Name' : 'Vendor Name'}>
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

        <Fld label="Notes">
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 48 }}
            value={form.notes} onChange={set('notes')} placeholder="Internal notes or correction reason…" />
        </Fld>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving || isLocked || newPeriodLocked}>
            {saving ? 'Saving…' : 'Save Changes'}
          </Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── BusinessSetupTab — lets accountants edit business profile & tax config ───
function BusinessSetupTab({ client, onSaved }) {
  const isMobile = useMobile();
  const [form, setForm] = useState({
    tradeName:         client.tradeName         || '',
    tin:               client.tin               || '',
    type:              client.type              || 'Corporation',
    address:           client.address           || '',
    zipCode:           client.zipCode           || '',
    telephone:         client.telephone         || '',
    rdoCode:           client.rdoCode           || '',
    ownerBirthdate:    client.birthday          || '',
    incorporationDate: client.incorporationDate || '',
    civilStatus:       client.civilStatus       || 'Single',
    spouseTin:         client.spouseTin         || '',
    taxOption:         client.taxOption         || 'graduated',
    isMsme:            !!client.isMsme,
    taxTypes:          client.taxTypes          || [],
    taxRegime:         client.taxRegime         || 'vat',
    optRate:           client.optRate           != null ? String(client.optRate) : '0.03',
    businessType:      client.businessType      || '',
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [err,    setErr]    = useState('');

  const set = key => e => { setSaved(false); setForm(f => ({ ...f, [key]: e.target.value })); };
  const isSoleProp = form.type === 'Sole Proprietor';

  function toggleTT(code) {
    setSaved(false);
    setForm(f => ({
      ...f,
      taxTypes: f.taxTypes.includes(code) ? f.taxTypes.filter(x => x !== code) : [...f.taxTypes, code],
    }));
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.tradeName || !form.tin) { setErr('Trade Name and TIN are required.'); return; }
    setSaving(true); setErr(''); setSaved(false);
    try {
      const { client: updated } = await updateClient(client.id, {
        ...form,
        optRate: form.taxRegime === 'opt' ? Number(form.optRate) : undefined,
      });
      setSaved(true);
      onSaved(updated);
    } catch (e) {
      setErr(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const grid2 = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' };
  const grid3 = { display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 16px' };

  return (
    <form onSubmit={handleSave}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Business Setup</h2>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Update business profile, tax obligations, and BIR configuration for this client.
          </div>
        </div>
        <Btn type="submit" disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Changes'}
        </Btn>
      </div>

      {err   && <div style={{ color: T.red, background: '#fff2f2', border: `1px solid ${T.red}40`,
        borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>⚠️ {err}</div>}
      {saved && <div style={{ color: '#1a8a1a', background: '#f0fff0', border: '1px solid #90ee9060',
        borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>✅ Business profile saved successfully.</div>}

      {/* ── Basic Info ── */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHead>Business Information</SectionHead>
        <div style={grid2}>
          <Fld label="Trade Name *">
            <input style={inp} required value={form.tradeName} onChange={set('tradeName')} placeholder="ABC Corporation" />
          </Fld>
          <Fld label="TIN *">
            <input style={inp} required value={form.tin} onChange={set('tin')} placeholder="000-000-000-000" />
          </Fld>
        </div>
        <div style={grid2}>
          <Fld label="Business Type">
            <select style={inp} value={form.type} onChange={set('type')}>
              {['Corporation','Sole Proprietor','One Person Corporation (OPC)','Partnership'].map(t => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Fld>
          <Fld label="Line of Business">
            <input style={inp} value={form.businessType} onChange={set('businessType')} placeholder="e.g. Consultancy, Retail" />
          </Fld>
        </div>
        <Fld label="Registered Address">
          <input style={inp} value={form.address} onChange={set('address')} placeholder="Full registered business address" />
        </Fld>
        <div style={grid3}>
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
      </Card>

      {/* ── Sole Prop fields ── */}
      {isSoleProp && (
        <Card style={{ marginBottom: 16, background: '#fffbec', borderColor: `${T.yellow}60` }}>
          <SectionHead>📋 Individual / Sole Proprietor (Form 1701 / 1701A)</SectionHead>
          <div style={grid2}>
            <Fld label="Owner's Date of Birth *">
              <input style={inp} type="date" value={form.ownerBirthdate} onChange={set('ownerBirthdate')} />
            </Fld>
            <Fld label="Civil Status">
              <select style={inp} value={form.civilStatus} onChange={set('civilStatus')}>
                {['Single','Married','Head of Family','Legally Separated','Widow/Widower'].map(s => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Fld>
          </div>
          {form.civilStatus === 'Married' && (
            <Fld label="Spouse's TIN">
              <input style={inp} value={form.spouseTin} onChange={set('spouseTin')} placeholder="000-000-000-000" />
            </Fld>
          )}
          <Fld label="Income Tax Option (1701A: 8% Flat vs. Graduated)">
            <select style={inp} value={form.taxOption} onChange={set('taxOption')}>
              <option value="graduated">Graduated Rates (TRAIN Law — 0% to 35%)</option>
              <option value="8percent">8% Flat Tax on Gross Revenue − ₱250,000 (Form 1701A)</option>
              <option value="osd">Optional Standard Deduction (40% of Gross Revenue)</option>
            </select>
          </Fld>
        </Card>
      )}

      {/* ── Corporate fields ── */}
      {!isSoleProp && (
        <Card style={{ marginBottom: 16, background: '#f0f4ff', borderColor: '#4a6cf760' }}>
          <SectionHead>📋 Corporate (Form 1702 / 1702Q)</SectionHead>
          <Fld label="Date of Incorporation">
            <input style={inp} type="date" value={form.incorporationDate} onChange={set('incorporationDate')} />
          </Fld>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
            <input type="checkbox" checked={!!form.isMsme}
              onChange={e => { setSaved(false); setForm(f => ({ ...f, isMsme: e.target.checked })); }} />
            <span>Qualifies as MSME — 20% RCIT rate (instead of 25%)</span>
          </label>
        </Card>
      )}

      {/* ── Tax Regime ── */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHead>VAT / Tax Regime</SectionHead>
        <Fld label="Tax Regime">
          <select style={inp} value={form.taxRegime} onChange={set('taxRegime')}>
            <option value="vat">VAT Registered — 12% Output VAT on vatable sales</option>
            <option value="opt">Percentage Tax / OPT — Section 116 NIRC (Non-VAT)</option>
            <option value="non_vat_exempt">Non-VAT Exempt — no VAT, no percentage tax</option>
          </select>
        </Fld>
        {form.taxRegime === 'opt' && (
          <Fld label="OPT Rate (as decimal)">
            <input style={inp} type="number" step="0.001" min="0.001" max="0.1"
              value={form.optRate} onChange={set('optRate')} placeholder="0.03" />
            <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
              Enter as decimal: 0.03 = 3% · 0.01 = 1%. Common: 3% (general), 1% (TRAIN Law 2023–2025)
            </div>
          </Fld>
        )}
      </Card>

      {/* ── Tax Obligations ── */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHead>BIR Tax Obligations</SectionHead>
        <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>
          Check all BIR forms this client is required to file. This controls which BIR Reminders and returns appear.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px 16px' }}>
          {TAX_TYPES_LIST.map(o => (
            <label key={o.code} style={{ display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, cursor: 'pointer', padding: '6px 10px', borderRadius: 8,
              background: form.taxTypes.includes(o.code) ? `${T.teal}14` : T.bg,
              border: `1px solid ${form.taxTypes.includes(o.code) ? T.teal : T.border}`,
              transition: 'all .15s' }}>
              <input type="checkbox" checked={form.taxTypes.includes(o.code)} onChange={() => toggleTT(o.code)} />
              {o.label}
            </label>
          ))}
        </div>
        {form.taxTypes.length === 0 && (
          <div style={{ marginTop: 12, fontSize: 13, color: T.orange }}>
            ⚠️ No tax obligations selected — BIR Reminders tab will show "No tax types configured".
          </div>
        )}
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <Btn type="submit" disabled={saving}>
          {saving ? 'Saving…' : '💾 Save Changes'}
        </Btn>
      </div>
    </form>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────


// ─── FWT1601FQCalc — BIR Form 1601-FQ Final Withholding Tax (Quarterly) ───────
const FWT_ATC = [
  { atc: 'WF001', description: 'Interest — bank deposits & deposit substitutes',       rate: 0.20, category: 'Interest' },
  { atc: 'WF002', description: 'Interest — foreign currency deposits',                 rate: 0.15, category: 'Interest' },
  { atc: 'WF006', description: 'Interest — government securities',                     rate: 0.20, category: 'Interest' },
  { atc: 'WF050', description: 'Dividends — resident individuals from domestic corps', rate: 0.10, category: 'Dividends' },
  { atc: 'WF120', description: 'Royalties — books, literary, musical',                 rate: 0.10, category: 'Royalties' },
  { atc: 'WF121', description: 'Royalties — other (patents, franchises, etc.)',         rate: 0.20, category: 'Royalties' },
  { atc: 'WF130', description: 'Prizes exceeding ₱10,000',                             rate: 0.20, category: 'Prizes' },
  { atc: 'WF131', description: 'Other winnings (lotto, sweepstakes, etc.)',             rate: 0.20, category: 'Prizes' },
  { atc: 'WF200', description: "Informer's reward to BIR",                             rate: 0.10, category: 'Other' },
  { atc: 'WF300', description: 'Non-resident alien (not engaged in trade/business)',   rate: 0.25, category: 'Non-Resident' },
  { atc: 'WF310', description: 'Foreign corporation (not engaged in business in PH)',  rate: 0.25, category: 'Non-Resident' },
];

function FWT1601FQCalc({ birYear, birQuarter }) {
  const qLabel = { 1: 'Q1 (Jan–Mar)', 2: 'Q2 (Apr–Jun)', 3: 'Q3 (Jul–Sep)', 4: 'Q4 (Oct–Dec)' };
  const dueMonth = { 1: 'April 30', 2: 'July 31', 3: 'October 31', 4: 'January 31' };
  const [expanded,  setExpanded]  = useState(false);
  const [entries,   setEntries]   = useState(
    FWT_ATC.map(a => ({ ...a, base: '' }))
  );

  const setBase = (idx, val) => setEntries(prev =>
    prev.map((e, i) => i === idx ? { ...e, base: val } : e)
  );

  const withAmounts = entries.map(e => ({
    ...e,
    baseAmt: parseFloat(e.base) || 0,
    fwtAmt:  Math.round((parseFloat(e.base) || 0) * e.rate * 100) / 100,
  })).filter(e => e.baseAmt > 0 || e.base !== '');

  const totalBase = withAmounts.reduce((s, e) => s + e.baseAmt, 0);
  const totalFWT  = withAmounts.reduce((s, e) => s + e.fwtAmt,  0);
  const hasData   = withAmounts.some(e => e.baseAmt > 0);

  const peso_ = n => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct   = r => (r * 100).toFixed(0) + '%';
  const inp3  = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db',
    fontSize: 13, width: 140, fontFamily: 'inherit', textAlign: 'right',
    background: '#fafafa', outline: 'none' };

  const categories = [...new Set(FWT_ATC.map(a => a.category))];

  return (
    <Card style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(x => !x)}>
        <div>
          <SectionHead style={{ marginBottom: 2 }}>BIR Form 1601-FQ — Final Withholding Tax (Quarterly)</SectionHead>
          <div style={{ fontSize: 12, color: T.muted }}>
            Interest, dividends, royalties, prizes — {qLabel[birQuarter]} {birYear}
          </div>
        </div>
        <span style={{ fontSize: 20, color: T.muted }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 18 }}>
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px',
            marginBottom: 18, fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
            Enter the <strong>gross income payments</strong> (base) made during the quarter for each FWT type.
            The system computes the FWT withheld automatically.
            Due: <strong>{dueMonth[birQuarter] || 'last day of month after quarter'}</strong>.
          </div>

          {/* Entry table by category */}
          {categories.map(cat => {
            const catEntries = entries.map((e, i) => ({ ...e, idx: i })).filter(e => e.category === cat);
            return (
              <div key={cat} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                  letterSpacing: '0.5px', marginBottom: 8 }}>{cat}</div>
                <div style={{ background: T.surface, borderRadius: 10, border: '1px solid ' + T.border, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.bg }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                          color: T.muted, fontSize: 11 }}>ATC</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                          color: T.muted, fontSize: 11 }}>Description</th>
                        <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600,
                          color: T.muted, fontSize: 11 }}>Rate</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600,
                          color: T.muted, fontSize: 11 }}>Base (₱)</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600,
                          color: T.muted, fontSize: 11 }}>FWT Withheld</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catEntries.map(e => (
                        <tr key={e.atc} style={{ borderTop: '1px solid ' + T.border }}>
                          <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12,
                            color: T.accent, fontWeight: 600 }}>{e.atc}</td>
                          <td style={{ padding: '8px 12px', color: T.text, fontSize: 12 }}>{e.description}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center', color: T.muted, fontWeight: 600 }}>
                            {pct(e.rate)}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                            <input
                              style={inp3}
                              type="number" min="0" step="1000"
                              value={e.base}
                              onChange={ev => setBase(e.idx, ev.target.value)}
                              placeholder="0.00"
                            />
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600,
                            color: (parseFloat(e.base) || 0) > 0 ? T.orange : T.muted }}>
                            {(parseFloat(e.base) || 0) > 0
                              ? peso_(Math.round((parseFloat(e.base) || 0) * e.rate * 100) / 100)
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          {/* Total */}
          {hasData && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
              padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: '#6e6e73', marginBottom: 4 }}>
                  Total FWT Payable — {qLabel[birQuarter]} {birYear}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#166534' }}>
                  {peso_(totalFWT)}
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 2 }}>
                  On total base income payments of {peso_(totalBase)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#6e6e73', marginBottom: 4 }}>Filing deadline</div>
                <div style={{ fontWeight: 600, color: '#166534' }}>{dueMonth[birQuarter]}</div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 4 }}>
                  BIR Form 1601-FQ. Remit via eBIR or bank.
                </div>
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, fontSize: 11, color: T.muted, lineHeight: 1.6,
            background: T.bg, borderRadius: 8, padding: '10px 12px' }}>
            ℹ️ Enter payments made to payees during the quarter. FWT is withheld at source and remitted to BIR.
            Separate return required per quarter. Cross-reference with payee records for BIR 1604-CF (annual).
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── DST2000OT Calculator (BIR Form 2000-OT) ─────────────────────────────────
const DST_SCHEDULES = [
  {
    code: 'real_property',
    label: 'Sale / Transfer of Real Property',
    notes: 'RA 9243 — based on consideration or zonal value, whichever is higher',
    tiers: [
      { upto: 1000,      rate: 0,    fixed: 15    },  // ₱15 per ₱1k
    ],
    compute: (amt) => Math.floor(amt / 1000) * 15,
    rateLabel: '₱15 per ₱1,000 of consideration',
  },
  {
    code: 'lease',
    label: 'Lease Agreement / Rental Contract',
    notes: 'First ₱2,000: ₱6. Each additional ₱1,000 per year: ₱1',
    compute: (amt, years = 1) => {
      const annual = amt * years;
      if (annual <= 2000) return 6;
      return 6 + Math.ceil((annual - 2000) / 1000);
    },
    rateLabel: '₱6 on first ₱2,000 + ₱1 per ₱1,000 thereafter (annual)',
    hasYears: true,
  },
  {
    code: 'promissory',
    label: 'Promissory Note / Loan Agreement',
    notes: 'On principal — ₱1 for every ₱200 or fraction thereof',
    compute: (amt) => Math.ceil(amt / 200),
    rateLabel: '₱1 per ₱200 of principal (0.5%)',
  },
  {
    code: 'shares',
    label: 'Sale / Transfer of Shares of Stock',
    notes: 'Listed: 60 centavos per ₱200 par value; Unlisted: ₱1.50 per ₱200',
    compute: (amt, _, isListed = false) => {
      const rate = isListed ? 0.60 : 1.50;
      return Math.ceil(amt / 200) * rate;
    },
    rateLabel: '₱0.60 (listed) / ₱1.50 (unlisted) per ₱200 par value',
    hasListed: true,
  },
  {
    code: 'mortgage',
    label: 'Real Estate Mortgage',
    notes: '₱20 + ₱10 per ₱5,000 or fraction thereof',
    compute: (amt) => 20 + Math.ceil(amt / 5000) * 10,
    rateLabel: '₱20 + ₱10 per ₱5,000 of obligation',
  },
  {
    code: 'insurance',
    label: 'Life Insurance Policy',
    notes: 'Sliding scale on face value',
    compute: (amt) => {
      if (amt <= 100000)    return 0;
      if (amt <= 300000)    return 20;
      if (amt <= 500000)    return 50;
      if (amt <= 750000)    return 100;
      if (amt <= 1000000)   return 150;
      return 200 + Math.floor((amt - 1000000) / 1000000) * 100;
    },
    rateLabel: 'Sliding scale (₱0 ≤ ₱100k; ₱20 ≤ ₱300k; ₱50 ≤ ₱500k; etc.)',
  },
  {
    code: 'charter_party',
    label: 'Charter Party / Freight Shipment',
    notes: '₱10 if ≤ ₱1,000; + ₱5 per ₱1,000 or fraction thereafter',
    compute: (amt) => amt <= 1000 ? 10 : 10 + Math.ceil((amt - 1000) / 1000) * 5,
    rateLabel: '₱10 + ₱5 per ₱1,000 above first ₱1,000',
  },
];

function DST2000OTCalc() {
  const [docType,   setDocType]   = useState('real_property');
  const [amount,    setAmount]    = useState('');
  const [years,     setYears]     = useState('1');
  const [isListed,  setIsListed]  = useState(false);
  const [expanded,  setExpanded]  = useState(false);

  const schedule = DST_SCHEDULES.find(s => s.code === docType) || DST_SCHEDULES[0];
  const amt  = parseFloat(amount) || 0;
  const yrs  = parseFloat(years)  || 1;

  let dst = 0;
  if (amt > 0) {
    try { dst = schedule.compute(amt, yrs, isListed); } catch {}
  }
  const peso_  = n => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const inp2 = { width: '100%', padding: '9px 12px', borderRadius: 8,
    border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit',
    outline: 'none', boxSizing: 'border-box', background: '#fafafa' };

  return (
    <Card style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(x => !x)}>
        <div>
          <SectionHead style={{ marginBottom: 2 }}>BIR Form 2000-OT — Documentary Stamp Tax</SectionHead>
          <div style={{ fontSize: 12, color: T.muted }}>
            One-time transactions: real property, leases, promissory notes, shares
          </div>
        </div>
        <span style={{ fontSize: 20, color: T.muted }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <Fld label="Document / Transaction Type">
              <select style={inp2} value={docType} onChange={e => setDocType(e.target.value)}>
                {DST_SCHEDULES.map(s => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            </Fld>
            <Fld label={docType === 'lease' ? 'Contract Amount (Annual Rent)' : 'Consideration / Amount (₱)'}>
              <input style={inp2} type="number" min="0" step="1000"
                value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="e.g. 1000000" />
            </Fld>
          </div>

          {schedule.hasYears && (
            <Fld label="Lease Term (years)">
              <input style={{ ...inp2, maxWidth: 160 }} type="number" min="1" step="1"
                value={years} onChange={e => setYears(e.target.value)} />
            </Fld>
          )}
          {schedule.hasListed && (
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" id="isListed" checked={isListed}
                onChange={e => setIsListed(e.target.checked)} style={{ width: 16, height: 16 }} />
              <label htmlFor="isListed" style={{ fontSize: 13, cursor: 'pointer' }}>
                Listed on the Philippine Stock Exchange (PSE)
              </label>
            </div>
          )}

          {/* Rate info */}
          <div style={{ background: '#eff6ff', borderRadius: 8, padding: '10px 14px',
            marginBottom: 16, fontSize: 12, color: '#1e40af', lineHeight: 1.6 }}>
            <strong>Rate:</strong> {schedule.rateLabel}
            {schedule.notes && <><br /><span style={{ color: '#6e6e73' }}>{schedule.notes}</span></>}
          </div>

          {/* Result */}
          {amt > 0 && (
            <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10,
              padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
              alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#6e6e73', marginBottom: 4 }}>
                  DST Payable — {schedule.label}
                </div>
                <div style={{ fontSize: 28, fontWeight: 700, color: '#166534' }}>
                  {peso_(dst)}
                </div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 2 }}>
                  On consideration of {peso_(amt)}
                  {schedule.hasYears ? ` over ${yrs} year${yrs !== 1 ? 's' : ''}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 11, color: '#6e6e73', marginBottom: 4 }}>Filing deadline</div>
                <div style={{ fontWeight: 600, color: '#166534' }}>5th day of the following month</div>
                <div style={{ fontSize: 11, color: '#6e6e73', marginTop: 4 }}>
                  Use BIR Form 2000-OT. Attach to notarized document.
                </div>
              </div>
            </div>
          )}

          {/* All schedules table */}
          <details style={{ marginTop: 18 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: T.muted,
              userSelect: 'none', marginBottom: 10 }}>
              View all DST schedules (RA 9243 / TRAIN Law)
            </summary>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.bg }}>
                    {['Document Type', 'Rate / Basis', 'Notes'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                        color: T.muted, borderBottom: '1px solid ' + T.border }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DST_SCHEDULES.map((s, i) => (
                    <tr key={s.code} style={{ background: i % 2 === 0 ? T.surface : '#fafafa' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 500, color: T.text }}>{s.label}</td>
                      <td style={{ padding: '8px 12px', color: '#374151' }}>{s.rateLabel}</td>
                      <td style={{ padding: '8px 12px', color: T.muted, fontStyle: 'italic' }}>{s.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </Card>
  );
}

export default function AccountantPortal({ onLogout }) {
  const isMobile = useMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Read stored user to determine tier — state so it updates after admin approval
  const storedUser = (() => { try { return JSON.parse(localStorage.getItem('ml_user') || 'null'); } catch { return null; } })();
  const [accountantTier, setAccountantTier] = useState(storedUser?.accountantTier || 'free');
  const [meData, setMeData]                 = useState(storedUser);
  const tierInfo       = ACCT_TIERS[accountantTier] || ACCT_TIERS.free;
  // During active trial → full professional access regardless of stored tier
  const isPro    = accountantTier !== 'free' || (trialStatus?.isTrialActive ?? false);
  const isAgency = accountantTier === 'agency' || (trialStatus?.isTrialActive ?? false);
  const maxClients     = tierInfo.maxClients;          // number = hard limit per tier
  const [showFirmSettings, setShowFirmSettings] = useState(false);
  const [showPricing,     setShowPricing]     = useState(false);
  const [trialStatus,     setTrialStatus]     = useState(null);
  const firmName       = isAgency && meData?.firmName    ? meData.firmName    : null;
  const accentOverride = isAgency && meData?.accentColor ? meData.accentColor : null;
  // Dynamic accent: agency accountants with a custom color override T.accent site-wide in header/badges
  const firmLogoData   = isAgency && meData?.firmLogo    ? meData.firmLogo    : null;
  const brandAccent    = accentOverride || T.accent;
  // Staff sub-users see a limited view (no My Team, no Settings tabs)
  const isStaffUser    = meData?.role === 'staff';

  const [tab,       setTab]     = useState('Dashboard');
  const [clients,   setClients] = useState([]);
  const [active,    setActive]  = useState(null);
  const [clLoading, setCLL]     = useState(true);

  const [income,    setIncome]  = useState(null);
  const [balance,   setBalance] = useState(null);
  const [vatBal,    setVatBal]  = useState(null);
  const [txns,      setTxns]    = useState([]);
  const [txLoad,    setTxLoad]  = useState(false);
  const [deadlines, setDL]      = useState([]);
  const [birLoad,   setBirLoad] = useState(false);

  // My Team state
  const [teamStaff,      setTeamStaff]     = useState([]);
  const [teamLoading,    setTeamLoading]   = useState(false);
  const [teamError,      setTeamError]     = useState('');
  const [showAddStaff,   setShowAddStaff]  = useState(false);
  const [newStaffName,   setNewStaffName]  = useState('');
  const [newStaffEmail,  setNewStaffEmail] = useState('');
  const [newStaffPw,     setNewStaffPw]    = useState('');
  const [newStaffPwShow, setNewStaffPwShow]= useState(false);
  const [newStaffBusy,   setNewStaffBusy]  = useState(false);
  const [newStaffErr,    setNewStaffErr]   = useState('');
  // Per-staff reset password state: { [staffId]: { show, pw, showPw, busy, err } }
  const [staffReset,     setStaffReset]    = useState({});

  // Consolidated P&L state
  const [groups,           setGroups]          = useState([]);
  const [groupsLoading,    setGroupsLoading]   = useState(false);
  const [showNewGroup,     setShowNewGroup]     = useState(false);
  const [newGroupName,     setNewGroupName]     = useState('');
  const [newGroupClients,  setNewGroupClients]  = useState([]);
  const [newGroupBusy,     setNewGroupBusy]     = useState(false);
  const [editGroupId,      setEditGroupId]      = useState(null); // group being edited
  const [editGroupName,    setEditGroupName]    = useState('');
  const [editGroupClients, setEditGroupClients] = useState([]);
  const [selectedGroupId,  setSelectedGroupId]  = useState('');
  const [consolFrom,       setConsolFrom]       = useState('');
  const [consolTo,         setConsolTo]         = useState('');
  const [consolData,       setConsolData]       = useState(null);
  const [consolLoading,    setConsolLoading]    = useState(false);

  // ── Budget state ─────────────────────────────────────────────────────────────
  const defaultBudgetPeriod = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`; };
  const [budgetPeriod,  setBudgetPeriod]  = useState(defaultBudgetPeriod);
  const [budgetData,    setBudgetData]    = useState({});   // { category|type -> amount }
  const [budgetLoad,    setBudgetLoad]    = useState(false);
  const [budgetSaving,  setBudgetSaving]  = useState({});   // { key -> bool }
  // For Compare tab budget overlay
  const [compareBudget, setCompareBudget] = useState(null); // { revenue, costOfSales, opex }

  // ── Aged AR/AP state ──────────────────────────────────────────────────────────
  const [agedAR,        setAgedAR]        = useState(null);  // { rows, totals, asOf }
  const [agedAP,        setAgedAP]        = useState(null);  // { rows, totals, asOf }
  const [agedLoad,      setAgedLoad]      = useState(false);
  const [bills,         setBills]         = useState([]);
  const [billsLoad,     setBillsLoad]     = useState(false);
  const [showBillForm,  setShowBillForm]  = useState(false);
  const [billForm,      setBillForm]      = useState({ vendorName: '', vendorEmail: '', billNumber: '', billDate: '', dueDate: '', category: '', notes: '', amountNet: '', amountVat: '', amountGross: '' });
  const [billFormErr,   setBillFormErr]   = useState('');
  const [billSaving,    setBillSaving]    = useState(false);

  const [showTx, setShowTx]   = useState(false);
  const [journals,  setJournals]  = useState([]);
  const [jLoad,     setJLoad]     = useState(false);
  const [showJE,    setShowJE]    = useState(false);
  // BIR Returns period picker
  const now0          = new Date();
  const [birYear,   setBirYear]   = useState(now0.getFullYear());
  const [birMonth,  setBirMonth]  = useState(now0.getMonth() + 1);
  const [birType,   setBirType]   = useState('2550M'); // '2550M' | '2550Q'
  // Books
  const [booksType, setBooksType] = useState('sales');
  const [booksFrom, setBooksFrom] = useState('');
  const [booksTo,   setBooksTo]   = useState('');
  const [booksData, setBooksData] = useState(null);
  const [booksLoad, setBooksLoad] = useState(false);
  // Income Statement date range
  const [incFrom,   setIncFrom]   = useState('');
  const [incTo,     setIncTo]     = useState('');
  // Balance Sheet as-of date
  const [balAsOf,   setBalAsOf]   = useState('');
  // Cash Flow
  const [cfFrom,    setCfFrom]    = useState('');
  const [cfTo,      setCfTo]      = useState('');
  const [cfReport,  setCfReport]  = useState(null);
  const [cfLoad,    setCfLoad]    = useState(false);
  // Encoder assignment
  const [encEmail,  setEncEmail]  = useState('');
  const [encMsg,    setEncMsg]    = useState('');
  const [encLoad,   setEncLoad]   = useState(false);
  // Assets
  const [assets,      setAssets]      = useState([]);
  const [assetLoad,   setAssetLoad]   = useState(false);
  const [showAddAsset,setShowAddAsset]= useState(false);
  const [lapsingData, setLapsingData] = useState(null);
  const [showLapsing, setShowLapsing] = useState(false);
  // Contacts
  const [contacts,     setContacts]    = useState([]);
  const [contactLoad,  setContactLoad] = useState(false);
  const [contactQ,     setContactQ]    = useState('');
  const [showAddCon,   setShowAddCon]  = useState(false);
  const [editContact,  setEditContact] = useState(null);  // contact being edited
  // SLSP
  const [slspData,    setSlspData]    = useState(null);
  const [slspLoad,    setSlspLoad]    = useState(false);
  const [slspYear,    setSlspYear]    = useState(new Date().getFullYear());
  const [slspQ,       setSlspQ]       = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  // Alphalist
  const [alphaYear, setAlphaYear] = useState(new Date().getFullYear());
  const [alphaQ,    setAlphaQ]    = useState(0); // 0 = all quarters
  // Payroll / 1601-C
  const [employees,     setEmployees]    = useState([]);
  const [payrollResult, setPayrollResult]= useState(null);
  const [payrollLoad,   setPayrollLoad]  = useState(false);
  const [showEmpModal,  setShowEmpModal] = useState(false);
  const [editEmp,       setEditEmp]      = useState(null);
  const [payrollYear,   setPayrollYear]  = useState(new Date().getFullYear());
  const [payrollMonth,  setPayrollMonth] = useState(new Date().getMonth() + 1);
  const [empForm,       setEmpForm]      = useState({
    name: '', tin: '', employmentType: 'regular',
    monthlyBasicSalary: '', sssContribution: '',
    philhealthContribution: '', pagibigContribution: '', hireDate: '',
  });
  // General Journal
  const [gjData,      setGjData]      = useState(null);
  const [gjLoad,      setGjLoad]      = useState(false);
  const [gjFrom,      setGjFrom]      = useState('');
  const [gjTo,        setGjTo]        = useState('');
  // Audit Log
  const [auditEntries,     setAuditEntries]    = useState([]);
  const [auditLoad,        setAuditLoad]       = useState(false);
  const [auditStaffFilter, setAuditStaffFilter]= useState(''); // staffId or '' for all
  // Period Locking
  const [periods,      setPeriods]     = useState([]);
  const [periodsLoad,  setPeriodsLoad] = useState(false);
  const [lockInput,    setLockInput]   = useState(new Date().toISOString().substring(0, 7));
  const [lockMsg,      setLockMsg]     = useState('');
  // COA
  const [coaData,     setCoaData]     = useState([]);
  const [coaLoad,     setCoaLoad]     = useState(false);
  const [coaFilter,   setCoaFilter]   = useState('');
  const [showAddAcct, setShowAddAcct] = useState(false);
  const [newAcct,     setNewAcct]     = useState({ code: '', name: '', category: 'Assets', normalBalance: 'debit' });
  // General Ledger
  const [glData,      setGlData]      = useState(null);
  const [glLoad,      setGlLoad]      = useState(false);
  const [glFrom,      setGlFrom]      = useState('');
  const [glTo,        setGlTo]        = useState('');
  const [glAccount,   setGlAccount]   = useState('');
  const [glExpanded,  setGlExpanded]  = useState({});
  // Referral
  const [refData,    setRefData]    = useState(null);
  const [refLoad,    setRefLoad]    = useState(false);
  const [refErr,     setRefErr]     = useState('');
  const [refCopied,  setRefCopied]  = useState(false);
  // Accountant self-serve upgrade
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [upgradeTarget,  setUpgradeTarget]  = useState('solo');
  const [upgradeMethod,  setUpgradeMethod]  = useState('gcash');
  const [upgradeRef,     setUpgradeRef]     = useState('');
  const [upgradeAmount,  setUpgradeAmount]  = useState('');
  const [upgradeSubmitting, setUpgradeSubmitting] = useState(false);
  const [upgradeMsg,     setUpgradeMsg]     = useState('');
  const [myUpgradeReqs,  setMyUpgradeReqs]  = useState([]);
  const [tierUpgradedMsg, setTierUpgradedMsg] = useState(''); // success banner after admin approves tier
  // PayMongo online payment state (accountant upgrade modal)
  const [pmLinkId,      setPmLinkId]      = useState(null);
  const [pmCheckoutUrl, setPmCheckoutUrl] = useState(null);
  const [pmCreating,    setPmCreating]    = useState(false);
  const [pmPolling,     setPmPolling]     = useState(false);
  const [pmPollTimer,   setPmPollTimer]   = useState(null);
  const [pmError,       setPmError]       = useState('');
  const [showManual,    setShowManual]    = useState(false);
  // Site settings — EWT rates and other admin-configurable values
  const [siteSettings, setSiteSettings] = useState({});
  // CSV / Balance Sheet import modals
  const [showCSVImport,  setShowCSVImport]  = useState(false);
  const [showBSImport,   setShowBSImport]   = useState(false);
  // AI Narrative
  const [narrative,     setNarrative]     = useState(null);
  const [narrativeLoad, setNarrativeLoad] = useState(false);
  // Cash position
  const [cashPos,       setCashPos]       = useState(null);
  // Cash flow forecast
  const [forecast,      setForecast]      = useState(null);
  const [forecastDays,  setForecastDays]  = useState(90);
  const [forecastLoad,  setForecastLoad]  = useState(false);
  // BIR Filing Summary
  const now0a = new Date();
  const defaultPeriod = `${now0a.getFullYear()}-${String(now0a.getMonth() + 1).padStart(2, '0')}`;
  const [birSummaryPeriod,  setBirSummaryPeriod]  = useState(defaultPeriod);
  const [birSummaryData,    setBirSummaryData]    = useState(null);
  const [birSummaryLoad,    setBirSummaryLoad]    = useState(false);
  const [birSummaryMarkingId, setBirSummaryMarkingId] = useState(null); // form being marked
  // Multi-Period Compare
  const [comparePeriod, setComparePeriod] = useState(defaultPeriod);
  const [compareData,   setCompareData]   = useState(null);
  const [compareLoad,   setCompareLoad]   = useState(false);
  // Filing Calendar
  const [calYear,       setCalYear]       = useState(now0a.getFullYear());
  const [calMonth,      setCalMonth]      = useState(now0a.getMonth() + 1);
  const [calData,       setCalData]       = useState(null);
  const [calLoad,       setCalLoad]       = useState(false);
  const [calSelected,   setCalSelected]   = useState(null); // selected date string
  // Portfolio (all clients)
  const [portfolioPeriod, setPortfolioPeriod] = useState(defaultPeriod);
  const [portfolioData,   setPortfolioData]   = useState(null);
  const [portfolioLoad,   setPortfolioLoad]   = useState(false);

  useEffect(() => {
    loadClients();
    loadMyUpgradeReqs();
    getPublicSettings().then(r => { if (r) setSiteSettings(r); }).catch(() => {});
    // Fetch fresh user data so tier reflects any admin approval since last login
    getMe().then(freshUser => {
      setMeData(freshUser);
      const freshTier = freshUser?.accountantTier || 'free';
      setAccountantTier(freshTier);
      // Keep localStorage in sync so next page load shows correct tier
      try {
        const stored = JSON.parse(localStorage.getItem('ml_user') || 'null');
        if (stored) {
          localStorage.setItem('ml_user', JSON.stringify({
            ...stored,
            accountantTier: freshTier,
            firmName:    freshUser?.firmName    ?? stored.firmName,
            accentColor: freshUser?.accentColor ?? stored.accentColor,
          }));
        }
      } catch { /* ignore */ }
    }).catch(() => { /* network hiccup — keep showing stored tier */ });
    // Fetch trial status for banner + pricing modal
    getTrialStatus().then(t => { if (t) setTrialStatus(t); }).catch(() => {});
  }, []);

  async function loadMyUpgradeReqs() {
    try { const r = await getMyUpgradeRequests(); setMyUpgradeReqs(r.upgradeRequests || []); }
    catch (e) { console.error(e); }
  }

  // Helper: re-check /api/auth/me and update tier if it changed
  async function refreshTier() {
    try {
      const freshUser = await getMe();
      const freshTier = freshUser?.accountantTier || 'free';
      setMeData(freshUser);
      if (freshTier !== accountantTier) {
        setAccountantTier(freshTier);
        setTierUpgradedMsg(`🎉 Your plan has been upgraded to ${freshTier.charAt(0).toUpperCase() + freshTier.slice(1)}!`);
        setTimeout(() => setTierUpgradedMsg(''), 8000);
        try {
          const stored = JSON.parse(localStorage.getItem('ml_user') || 'null');
          if (stored) localStorage.setItem('ml_user', JSON.stringify({
            ...stored, accountantTier: freshTier,
            firmName:    freshUser?.firmName    ?? stored.firmName,
            accentColor: freshUser?.accentColor ?? stored.accentColor,
          }));
        } catch { /* ignore */ }
        loadMyUpgradeReqs(); // refresh request list so pending banner clears
      }
      return freshTier;
    } catch { return accountantTier; }
  }

  // Poll for tier change every 30s when there is a pending upgrade request
  useEffect(() => {
    const hasPending = myUpgradeReqs.some(r => r.status === 'pending');
    if (!hasPending) return;
    const interval = setInterval(refreshTier, 30000);
    return () => clearInterval(interval);
  }, [myUpgradeReqs, accountantTier]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submitUpgrade() {
    if (!upgradeRef.trim()) { setUpgradeMsg('Please enter your payment reference number.'); return; }
    setUpgradeSubmitting(true); setUpgradeMsg('');
    try {
      await createAccountantUpgradeRequest({
        targetTier: upgradeTarget,
        method:     upgradeMethod,
        refNo:      upgradeRef.trim(),
        amount:     Number(upgradeAmount) || 0,
      });
      setUpgradeMsg('✓ Request submitted! We\'ll activate your plan within 24 hours.');
      setUpgradeRef(''); setUpgradeAmount('');
      loadMyUpgradeReqs();
      setTimeout(() => { setShowUpgrade(false); setUpgradeMsg(''); }, 3000);
    } catch (e) {
      setUpgradeMsg(e.message || 'Submission failed. Please try again.');
    } finally { setUpgradeSubmitting(false); }
  }

  // Load staff when My Team tab is opened
  async function loadTeam() {
    setTeamLoading(true); setTeamError('');
    try { setTeamStaff((await getStaff()).staff || []); }
    catch (e) { setTeamError(e.message); }
    finally { setTeamLoading(false); }
  }

  async function loadGroups() {
    setGroupsLoading(true);
    try { setGroups((await getClientGroups()).groups || []); }
    catch (e) { console.error(e); }
    finally { setGroupsLoading(false); }
  }

  async function loadConsolidated(gid, from, to) {
    const groupId = gid !== undefined ? gid : selectedGroupId;
    if (!groupId) return;
    setConsolLoading(true);
    try { setConsolData(await getConsolidated(groupId, from || consolFrom, to || consolTo)); }
    catch (e) { console.error(e); }
    finally { setConsolLoading(false); }
  }

  // Referral + My Team + Consolidated tabs are user-level (no active client needed)
  useEffect(() => {
    if (tab === 'Referral')     loadReferrals();
    if (tab === 'My Team')      loadTeam();
    if (tab === 'Consolidated') loadGroups();
  }, [tab]);

  useEffect(() => {
    if (!active) return;
    if (tab === 'Dashboard')        { loadDashboard(); loadNarrative(); }
    if (tab === 'Transactions')     loadTxns();
    if (tab === 'BIR Reminders')    loadBIR();
    // Pro-only tabs
    if (!isPro) return;
    if (tab === 'Income Statement') { setIncome(null); }
    if (tab === 'Balance Sheet')    { setBalance(null); }
    if (tab === 'Cash Flow')        loadCashFlow();
    if (tab === 'Journal Entries')  loadJournals();
    if (tab === 'Trial Balance')    { loadTxns(); loadJournals(); }
    if (tab === 'BIR Returns')      loadTxns();
    if (tab === 'Alphalist')        loadTxns();
    if (tab === 'Books')            loadBooksReport();
    if (tab === 'General Journal')  loadGJ();
    if (tab === 'General Ledger')   loadGL();
    if (tab === 'COA')              loadCOA();
    if (tab === 'Period Lock')      loadPeriods();
    if (tab === 'Audit Log')        { setAuditStaffFilter(''); loadAudit(''); }
    if (tab === 'Assets')           loadAssets();
    if (tab === 'Contacts')         loadContacts();
    if (tab === 'SLSP')             loadSLSP();
    if (tab === 'Payroll')          loadEmployees();
    if (tab === 'BIR Reminders')    { loadBirSummary(); loadBIR(); }
    if (tab === 'Filing Calendar')  { loadCalendar(); }
    if (tab === 'Compare')          loadIncomeCompare();
    if (tab === 'Budget')           loadBudget();
    if (tab === 'Aged AR/AP')       { loadAgedReport(); loadBillsList(); }
  }, [active?.id, tab]);

  // Portfolio tab doesn't need an active client — loads on tab switch only
  useEffect(() => {
    if (tab === 'Portfolio') loadPortfolio();
  }, [tab]);

  async function loadClients() {
    setCLL(true);
    try {
      const r = await getClients();
      // Enforce client limit per accountant tier
      const all = r.clients || [];
      const visible = all.slice(0, maxClients);
      setClients(visible);
      if (visible.length > 0) {
        setActive(visible[0]);
      } else {
        // No clients yet — go straight to Referral so they can share their link
        setTab('Referral');
      }
    } catch (e) { console.error(e); }
    finally { setCLL(false); }
  }

  async function loadDashboard() {
    try {
      const [inc, bal, vat, txr] = await Promise.all([
        getIncomeReport(active.id), getBalanceReport(active.id),
        getBirVatBalance(active.id), getTransactions(active.id),
      ]);
      setIncome(inc); setBalance(bal); setVatBal(vat);
      setTxns(txr.transactions || []);
      // Also load upcoming BIR deadlines for the widget
      if ((active.taxTypes || []).length > 0) {
        const dlr = await getBirDeadlines(active.id);
        setDL(dlr.deadlines || []);
      }
      // Cash flow forecast
      try {
        const fc = await getCashFlowForecast(active.id, 90);
        setForecast(fc);
      } catch (e) { /* forecast optional */ }
      // Cash position derived from income report
      if (inc) {
        setCashPos({
          cash:       (inc.grossRevenue || inc.revenue * 1.12 || 0) - (inc.grossExpenses || inc.expenses * 1.12 || 0),
          netProfit:  inc.profit || 0,
          vatPayable: Math.max(0, (vat?.outputVAT || 0) - (vat?.inputVAT || 0)),
        });
      }
    } catch (e) { console.error(e); }
  }

  async function loadNarrative() {
    if (!active) return;
    setNarrativeLoad(true);
    try {
      const data = await getNarrative(active.id);
      setNarrative(data);
    } catch (e) { console.error('Narrative load failed', e); }
    finally { setNarrativeLoad(false); }
  }

  async function loadTxns() {
    setTxLoad(true);
    try { const r = await getTransactions(active.id); setTxns(r.transactions || []); }
    catch (e) { console.error(e); }
    finally { setTxLoad(false); }
  }

  async function loadIncome(from, to) {
    try { setIncome(await getIncomeReport(active.id, from || undefined, to || undefined)); }
    catch (e) { console.error(e); }
  }

  async function loadBalance(asOf) {
    try { setBalance(await getBalanceReport(active.id, asOf || undefined)); }
    catch (e) { console.error(e); }
  }

  async function loadBIR() {
    setBirLoad(true);
    try {
      const [dl, vat] = await Promise.all([getBirDeadlines(active.id), getBirVatBalance(active.id)]);
      setDL(dl.deadlines || []); setVatBal(vat);
    } catch (e) { console.error(e); }
    finally { setBirLoad(false); }
  }

  async function loadCalendar(y, m) {
    const year  = y || calYear;
    const month = m || calMonth;
    setCalLoad(true);
    try { setCalData(await getBirCalendar(year, month)); }
    catch (e) { console.error(e); }
    finally { setCalLoad(false); }
  }

  async function loadBirSummary(period) {
    const p = period || birSummaryPeriod;
    setBirSummaryLoad(true);
    try {
      const data = await getBirFilingSummary(active.id, p);
      setBirSummaryData(data);
    } catch (e) { console.error(e); }
    finally { setBirSummaryLoad(false); }
  }

  async function markBirFiling(form, period, currentStatus) {
    const newStatus = currentStatus === 'filed' ? 'pending' : 'filed';
    setBirSummaryMarkingId(form + period);
    try {
      await updateBirFilingStatus(active.id, form, period, newStatus);
      await loadBirSummary();
    } catch (e) { console.error(e); }
    finally { setBirSummaryMarkingId(null); }
  }

  async function loadIncomeCompare(period) {
    const p = period || comparePeriod;
    setCompareLoad(true);
    try {
      const data = await getIncomeCompare(active.id, p);
      setCompareData(data);
      // Also load budget for the current period so Compare can show vs-budget column
      if (active?.id) {
        try {
          const bRes = await getBudgets(active.id, p);
          const bMap = {};
          for (const b of (bRes.budgets || [])) bMap[`${b.category}|${b.type}`] = b.amount;
          const rev  = bMap['Revenue|income']            || 0;
          const cogs = bMap['Cost of Goods Sold|expense'] || 0;
          const opex = bMap['Operating Expenses|expense'] || 0;
          setCompareBudget({ revenue: rev, costOfSales: cogs, opex, grossProfit: rev - cogs, profit: rev - cogs - opex });
        } catch (_) { setCompareBudget(null); }
      }
    } catch (e) { console.error(e); }
    finally { setCompareLoad(false); }
  }

  async function loadBudget(period) {
    if (!active?.id) return;
    const p = period || budgetPeriod;
    setBudgetLoad(true);
    try {
      const res = await getBudgets(active.id, p);
      const map = {};
      for (const b of (res.budgets || [])) map[`${b.category}|${b.type}`] = b.amount;
      setBudgetData(map);
    } catch (e) { console.error(e); }
    finally { setBudgetLoad(false); }
  }

  async function handleBudgetSave(category, type, rawValue) {
    if (!active?.id) return;
    const key = `${category}|${type}`;
    const amount = parseFloat(rawValue) || 0;
    setBudgetSaving(s => ({ ...s, [key]: true }));
    try {
      await saveBudget({ clientId: active.id, period: budgetPeriod, category, type, amount });
      setBudgetData(d => ({ ...d, [key]: amount }));
    } catch (e) { console.error(e); }
    finally { setBudgetSaving(s => ({ ...s, [key]: false })); }
  }

  async function loadAgedReport() {
    if (!active?.id) return;
    setAgedLoad(true);
    try {
      const [ar, ap] = await Promise.all([getAgedAR(active.id), getAgedAP(active.id)]);
      setAgedAR(ar);
      setAgedAP(ap);
    } catch (e) { console.error(e); }
    finally { setAgedLoad(false); }
  }

  async function loadBillsList() {
    if (!active?.id) return;
    setBillsLoad(true);
    try {
      const res = await getBills(active.id);
      setBills(res.bills || []);
    } catch (e) { console.error(e); }
    finally { setBillsLoad(false); }
  }

  async function handleCreateBill(e) {
    e.preventDefault();
    setBillFormErr('');
    if (!billForm.vendorName || !billForm.billDate || !billForm.dueDate || !billForm.amountGross)
      return setBillFormErr('Vendor name, bill date, due date, and amount are required.');
    setBillSaving(true);
    try {
      await createBill({ clientId: active.id, ...billForm,
        amountNet: parseFloat(billForm.amountNet) || 0,
        amountVat: parseFloat(billForm.amountVat) || 0,
        amountGross: parseFloat(billForm.amountGross) || 0,
      });
      setBillForm({ vendorName: '', vendorEmail: '', billNumber: '', billDate: '', dueDate: '', category: '', notes: '', amountNet: '', amountVat: '', amountGross: '' });
      setShowBillForm(false);
      await Promise.all([loadBillsList(), loadAgedReport()]);
    } catch (e) { setBillFormErr(e.message || 'Failed to save bill'); }
    finally { setBillSaving(false); }
  }

  async function handlePayBill(id) {
    try { await payBill(id); await Promise.all([loadBillsList(), loadAgedReport()]); }
    catch (e) { console.error(e); }
  }

  async function handleVoidBill(id) {
    if (!confirm('Void this bill?')) return;
    try { await voidBill(id); await Promise.all([loadBillsList(), loadAgedReport()]); }
    catch (e) { console.error(e); }
  }

  async function loadPortfolio(period) {
    const p = period || portfolioPeriod;
    setPortfolioLoad(true);
    try {
      const data = await getBirPortfolio(p);
      setPortfolioData(data);
    } catch (e) { console.error(e); }
    finally { setPortfolioLoad(false); }
  }

  async function loadJournals() {
    setJLoad(true);
    try { const r = await getJournalEntries(active.id); setJournals(r.journalEntries || []); }
    catch (e) { console.error(e); }
    finally { setJLoad(false); }
  }

  async function loadBooksReport(type, from, to) {
    const t = type ?? booksType; const f = from ?? booksFrom; const tto = to ?? booksTo;
    setBooksLoad(true);
    try { setBooksData(await getBooksReport(active.id, t, f || undefined, tto || undefined)); }
    catch (e) { console.error(e); }
    finally { setBooksLoad(false); }
  }

  async function loadAudit(staffId) {
    setAuditLoad(true);
    const filterStaff = staffId !== undefined ? staffId : auditStaffFilter;
    try { const r = await getAuditLog(active.id, 200, filterStaff || undefined); setAuditEntries(r.entries || []); }
    catch (e) { console.error(e); }
    finally { setAuditLoad(false); }
  }

  async function loadPeriods() {
    setPeriodsLoad(true);
    try { const r = await getPeriodLocks(active.id); setPeriods(r.periods || []); }
    catch (e) { console.error(e); }
    finally { setPeriodsLoad(false); }
  }

  async function handleLock() {
    try {
      await lockPeriod(active.id, lockInput);
      setLockMsg(`✅ Period ${lockInput} locked`);
      loadPeriods();
    } catch (e) { setLockMsg(`❌ ${e.message}`); }
  }

  async function handleUnlock(period) {
    try {
      await unlockPeriod(active.id, period);
      setLockMsg(`🔓 Period ${period} unlocked`);
      loadPeriods();
    } catch (e) { setLockMsg(`❌ ${e.message}`); }
  }

  async function loadCOA() {
    setCoaLoad(true);
    try { const r = await getCOA(active.id); setCoaData(r.accounts || []); }
    catch (e) { console.error(e); }
    finally { setCoaLoad(false); }
  }

  async function handleSeedCOA() {
    try { await seedCOA(active.id); loadCOA(); }
    catch (e) { alert(e.message); }
  }

  async function handleAddAccount() {
    if (!newAcct.code || !newAcct.name) { alert('Code and name are required.'); return; }
    try {
      await createAccount({ ...newAcct, clientId: active.id });
      setShowAddAcct(false);
      setNewAcct({ code: '', name: '', category: 'Assets', normalBalance: 'debit' });
      loadCOA();
    } catch (e) { alert(e.message); }
  }

  async function handleDeleteAccount(id) {
    if (!confirm('Delete this account?')) return;
    try { await deleteAccount(id); loadCOA(); }
    catch (e) { alert(e.message); }
  }

  async function loadGJ(from, to) {
    const f = from ?? gjFrom; const t = to ?? gjTo;
    setGjLoad(true);
    try { setGjData(await getGeneralJournal(active.id, f || undefined, t || undefined)); }
    catch (e) { console.error(e); }
    finally { setGjLoad(false); }
  }

  async function loadGL(from, to, account) {
    const f = from ?? glFrom; const t = to ?? glTo; const a = account ?? glAccount;
    setGlLoad(true);
    try { setGlData(await getGeneralLedger(active.id, f || undefined, t || undefined, a || undefined)); }
    catch (e) { console.error(e); }
    finally { setGlLoad(false); }
  }

  async function loadCashFlow(from, to) {
    const f = from ?? cfFrom; const t = to ?? cfTo;
    setCfLoad(true);
    try { setCfReport(await getCashFlowReport(active.id, f || undefined, t || undefined)); }
    catch (e) { console.error(e); }
    finally { setCfLoad(false); }
  }

  async function voidTx(id) {
    const reason = window.prompt('Void reason (required for audit trail):');
    if (reason === null) return;  // cancelled
    if (!reason.trim()) { alert('A void reason is required.'); return; }
    try {
      await voidTransaction(id, reason.trim());
      loadTxns(); loadIncome();
    } catch (e) { alert(e.message); }
  }

  // Edit transaction (accountant-only, period-lock aware)
  const [editTx, setEditTx] = useState(null);  // null | transaction object
  const [receiptTx,     setReceiptTx]     = useState(null);  // tx whose receipts to manage
  const [receiptList,   setReceiptList]   = useState([]);
  const [receiptLoad,   setReceiptLoad]   = useState(false);
  const [receiptUploading, setReceiptUploading] = useState(false);

  async function handleEditSave(id, data) {
    try {
      await updateTransaction(id, data);
      setEditTx(null);
      loadTxns(); loadIncome();
    } catch (e) {
      alert(e.message || 'Failed to update transaction');
    }
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

  async function deleteJE(id) {
    if (!confirm('Delete this journal entry? This cannot be undone.')) return;
    await deleteJournalEntry(id); loadJournals();
  }

  async function handleAssignEncoder(e) {
    e.preventDefault();
    if (!active || !encEmail.trim()) return;
    setEncLoad(true); setEncMsg('');
    try {
      await assignEncoder(active.id, encEmail.trim());
      setEncMsg('✓ Encoder assigned successfully.');
      setEncEmail('');
      loadClients(); // refresh to show updated encoderIds
    } catch (err) { setEncMsg('⚠ ' + err.message); }
    finally { setEncLoad(false); }
  }

  async function handleRemoveEncoder(encId) {
    if (!confirm('Remove this encoder from the client?')) return;
    try {
      await removeEncoder(active.id, encId);
      loadClients();
    } catch (err) { alert(err.message); }
  }

  async function loadAssets() {
    setAssetLoad(true);
    try { const r = await getAssets(active.id); setAssets(r.assets || []); }
    catch (e) { console.error(e); }
    finally { setAssetLoad(false); }
  }

  async function loadContacts(q = contactQ) {
    if (!active) return;
    setContactLoad(true);
    try { const r = await getContacts(active.id, q || undefined); setContacts(r.contacts || []); }
    catch (e) { console.error(e); }
    finally { setContactLoad(false); }
  }

  async function deleteContactItem(id) {
    if (!confirm('Delete this contact?')) return;
    try { await deleteContact(id); loadContacts(); }
    catch (e) { alert(e.message); }
  }

  async function loadSLSP(y = slspYear, q = slspQ) {
    if (!active) return;
    setSlspLoad(true);
    try { const r = await getSLSP(active.id, y, q); setSlspData(r); }
    catch (e) { console.error(e); }
    finally { setSlspLoad(false); }
  }

  async function loadEmployees() {
    if (!active) return;
    try { const rows = await getEmployees(active.id); setEmployees(rows); }
    catch (e) { console.error(e); }
  }
  async function runPayroll(y = payrollYear, m = payrollMonth) {
    if (!active) return;
    setPayrollLoad(true);
    try { const r = await computePayroll(active.id, y, m); setPayrollResult(r); }
    catch (e) { console.error(e); }
    finally { setPayrollLoad(false); }
  }

  async function loadReferrals() {
    setRefLoad(true); setRefErr('');
    try { const r = await getMyReferrals(); setRefData(r); }
    catch (e) { console.error('Referral load error:', e); setRefErr(e.message || 'Failed to load referral data'); }
    finally { setRefLoad(false); }
  }

  function exportSLSPcsv(rows, headers, filename) {
    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function deleteAssetItem(id) {
    if (!confirm('Delete this asset? This cannot be undone.')) return;
    try { await deleteAsset(id); loadAssets(); }
    catch (e) { alert(e.message); }
  }

  async function viewLapsing(id) {
    try { const r = await getLapsing(id); setLapsingData(r); setShowLapsing(true); }
    catch (e) { alert(e.message); }
  }

  async function handleBackup() {
    if (!active) return;
    try {
      const data = await backupClient(active.id);
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const slug = active.tradeName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      a.href = url;
      a.download = `myledger_backup_${slug}_${new Date().toISOString().substring(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { alert('Backup failed: ' + e.message); }
  }

  const upcomingTop3 = deadlines.slice(0, 3);

  // ── When no clients, default to Referral tab so the accountant can share their link ──
  const noClients = !clLoading && clients.length === 0;

  // ── Main portal ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif', color: T.text }}>

      {/* Trial Banner */}
      <TrialBanner onUpgradeClick={() => setShowPricing(true)} />

      {/* Pricing Modal */}
      {showPricing && (
        <PricingModal
          onClose={() => setShowPricing(false)}
          userRole="accountant"
          trialStatus={trialStatus}
        />
      )}

      {/* Header */}
      <div style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        {isMobile ? (
          /* ── Mobile top bar ── */
          <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', height: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {firmLogoData
                ? <img src={firmLogoData} alt="Logo" style={{ height: 26, maxWidth: 80, objectFit: 'contain' }} />
                : <span style={{ fontWeight: 700, fontSize: 16, color: firmName ? brandAccent : T.text }}>
                    {firmName || 'MyLedger'}
                  </span>
              }
              <span style={{ background: brandAccent, color: '#fff', fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 5 }}>ACCT</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <NotificationBell accentColor={brandAccent} />
              <Btn variant="neutral" size="sm" onClick={onLogout}>Sign out</Btn>
            </div>
          </div>
        ) : (
          /* ── Desktop header ── */
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {firmName || firmLogoData ? (
                  <>
                    {firmLogoData
                      ? <img src={firmLogoData} alt="Logo" style={{ height: 28, maxWidth: 100, objectFit: 'contain' }} />
                      : <span style={{ fontWeight: 700, fontSize: 16, color: brandAccent }}>{firmName}</span>
                    }
                    <span style={{ background: brandAccent, color: '#fff', fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 6 }}>ACCOUNTANT</span>
                  </>
                ) : (
                  <>
                    <span style={{ fontWeight: 700, fontSize: 16 }}>MyLedger</span>
                    <span style={{ color: T.muted, fontSize: 14 }}> by Kaiman &amp; Co. </span>
                    <span style={{ background: brandAccent, color: '#fff', fontSize: 11, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 6 }}>ACCOUNTANT</span>
                  </>
                )}
                <span
                  onClick={accountantTier !== 'agency' ? () => {
                    // Pre-select next tier up from current
                    const order = ['free','solo','professional','firm','agency'];
                    const nextIdx = Math.min(order.indexOf(accountantTier) + 1, order.length - 1);
                    setUpgradeTarget(order[nextIdx]);
                    setShowUpgrade(true);
                  } : undefined}
                  title={accountantTier !== 'agency' ? 'Click to upgrade plan' : tierInfo.label}
                  style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                    textTransform: 'uppercase', letterSpacing: '0.4px',
                    border: accountantTier === 'free' ? `1px solid ${T.border}` : 'none',
                    background: accountantTier === 'free' ? T.bg : (accentOverride && isAgency ? accentOverride : tierInfo.color),
                    color: accountantTier === 'free' ? T.muted : '#fff',
                    cursor: accountantTier !== 'agency' ? 'pointer' : 'default',
                    transition: 'opacity .15s',
                  }}
                  onMouseEnter={e => { if (accountantTier !== 'agency') e.currentTarget.style.opacity = '0.75'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >
                  {tierInfo.label}{accountantTier !== 'agency' ? ' ↑' : ''}
                </span>
              </div>
              {clients.length > 0 && (
                <>
                  <span style={{ color: T.border, fontSize: 18 }}>|</span>
                  <select value={active?.id || ''} onChange={e => {
                    const c = clients.find(x => x.id === e.target.value);
                    setActive(c); setTxns([]); setIncome(null); setBalance(null); setVatBal(null); setDL([]);
                    setBooksData(null); setCfReport(null); setIncFrom(''); setIncTo(''); setBalAsOf('');
                    setEmployees([]); setPayrollResult(null);
                  }} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600,
                    color: T.text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
                  </select>
                  {active && (
                    <span style={{ fontSize: 12, color: T.muted }}>
                      TIN {active.tin} · {active.type}
                      {active.subscriptionTier && active.subscriptionTier !== 'free' && (
                        <span style={{ marginLeft: 8, background: T.accentL, color: T.accent,
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                          {active.subscriptionTier}
                        </span>
                      )}
                    </span>
                  )}
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button onClick={() => setShowFirmSettings(true)}
                title="Firm branding settings"
                style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8,
                  padding: '5px 10px', cursor: 'pointer', fontSize: 14, color: '#6e6e73',
                  fontFamily: 'inherit' }}>
                🎨
              </button>
              {/* Global search: professional+ or active trial */}
              {(accountantTier === 'professional' || accountantTier === 'firm' || accountantTier === 'agency' || trialStatus?.isTrialActive) && (
                <GlobalSearch accentColor={brandAccent} clients={clients} />
              )}
              {active && (
                <Btn variant="ghost" size="sm" onClick={handleBackup} title={`Download JSON backup of ${active.tradeName}`}>
                  ⬇ Backup
                </Btn>
              )}
              <NotificationBell accentColor={brandAccent} />
              <Btn variant="neutral" size="sm" onClick={onLogout}>Sign out</Btn>
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '20px 16px 48px' : '28px 24px 56px',
        minWidth: 0, overflowX: 'hidden' }}>

        {/* Mobile: client selector */}
        {isMobile && clients.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <select value={active?.id || ''} onChange={e => {
              const c = clients.find(x => x.id === e.target.value);
              setActive(c); setTxns([]); setIncome(null); setBalance(null); setVatBal(null); setDL([]);
              setBooksData(null); setCfReport(null); setEmployees([]); setPayrollResult(null);
            }} style={{ ...inp, fontWeight: 600 }}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
            </select>
          </div>
        )}

        {/* ── Grouped navigation ─────────────────────────────────────────────
             Top row  : 6 category pills   (~36 px, never wraps on desktop)
             Sub-tab  : tabs in active group only (~34 px, max 7 items)
             Total    : ~70 px vs the previous ~180 px wrapping mess        */}
        {(() => {
          // Staff sub-users see a restricted tab set (no team/settings management)
          const visibleGroups = isStaffUser
            ? TAB_GROUPS.map(g => ({
                ...g,
                tabs: g.tabs.filter(t => t !== 'My Team' && t !== 'Business Setup' && t !== 'Referral'),
              })).filter(g => g.tabs.length > 0)
            : TAB_GROUPS;
          const activeGroup = visibleGroups.find(g => g.tabs.includes(tab)) || visibleGroups[0];
          return (
            <div style={{ marginBottom: 24 }}>

              {/* Category row */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', background: T.surface,
                padding: 4, borderRadius: '10px 10px 0 0', boxShadow: T.shadow }}>
                {visibleGroups.map(g => {
                  const isActive = g === activeGroup;
                  return (
                    <button key={g.label}
                      onClick={() => {
                        // Jump to first unlocked tab in this group (or first tab if all locked)
                        const first = g.tabs.find(t => isPro || !PRO_TABS.has(t)) || g.tabs[0];
                        setTab(first);
                      }}
                      style={{ padding: '8px 18px', borderRadius: 7, border: 'none',
                        cursor: 'pointer', fontSize: 13, fontWeight: 700,
                        fontFamily: 'inherit', transition: 'all .15s', whiteSpace: 'nowrap',
                        background: isActive ? T.accent : 'transparent',
                        color: isActive ? '#fff' : T.muted,
                        borderBottom: isActive ? `2px solid ${T.accent}` : '2px solid transparent',
                      }}>
                      {g.label}
                    </button>
                  );
                })}
              </div>

              {/* Sub-tab row — only active group's tabs */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', padding: '6px 8px',
                background: `${T.accent}06`, borderRadius: '0 0 10px 10px',
                border: `1px solid ${T.accent}18`, borderTop: 'none',
                boxShadow: '0 3px 10px rgba(0,0,0,0.04)' }}>
                {activeGroup.tabs.map(t => {
                  const locked  = !isPro && PRO_TABS.has(t);
                  const isActive = tab === t;
                  return (
                    <button key={t} onClick={() => setTab(t)}
                      style={{ padding: '5px 14px', borderRadius: 6, border: 'none',
                        cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 600 : 400,
                        fontFamily: 'inherit', transition: 'all .15s', whiteSpace: 'nowrap',
                        background: isActive ? T.accent : 'transparent',
                        color: isActive ? '#fff' : locked ? '#bbb' : T.text,
                        display: 'flex', alignItems: 'center', gap: 4,
                        opacity: locked && !isActive ? 0.65 : 1,
                      }}>
                      {locked && <span style={{ fontSize: 9 }}>🔒</span>}
                      {t}
                    </button>
                  );
                })}
              </div>

            </div>
          );
        })()}

        {/* ── Tier upgraded success toast ── */}
        {tierUpgradedMsg && (
          <div style={{ marginBottom: 16, borderRadius: 10, padding: '12px 18px',
            background: '#edfbf5', border: `1px solid ${T.green}50`,
            display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, fontWeight: 600, color: T.text }}>
            <span style={{ fontSize: 20 }}>🎉</span>
            <span style={{ flex: 1 }}>{tierUpgradedMsg}</span>
            <button onClick={() => setTierUpgradedMsg('')} style={{ background: 'none', border: 'none',
              cursor: 'pointer', fontSize: 18, color: T.muted, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* ── Upgrade banner (free tier only) ── */}
        {!isPro && (() => {
          const pendingReq = myUpgradeReqs.find(r => r.status === 'pending');
          return (
            <div style={{ marginBottom: 20, borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${T.accent}40`, background: `${T.accent}08` }}>
              <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center',
                gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 2 }}>
                    🔒 You're on the <strong>Free</strong> plan — unlock all features
                  </div>
                  <div style={{ fontSize: 12, color: T.muted }}>
                    Upgrade to access Journal Entries, Books, BIR Returns, Financial Statements, and more.
                  </div>
                </div>
                {pendingReq ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ background: '#fff8ec', border: `1px solid ${T.orange}40`,
                      borderRadius: 8, padding: '8px 14px', fontSize: 13, color: T.orange, fontWeight: 600 }}>
                      ⏳ Upgrade pending review — checking automatically every 30s
                    </div>
                    <button onClick={refreshTier} style={{
                      padding: '7px 14px', background: T.accent, color: '#fff', border: 'none',
                      borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}>↻ Check now</button>
                  </div>
                ) : (
                  <button onClick={() => { setUpgradeTarget('solo'); setShowUpgrade(true); }} style={{
                    padding: '9px 22px', background: T.accent, color: '#fff', border: 'none',
                    borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                  }}>Upgrade Plan →</button>
                )}
              </div>
            </div>
          );
        })()}

        {/* No clients yet — show a helpful prompt on non-Referral tabs */}
        {noClients && tab !== 'Referral' && (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
            <h3 style={{ fontSize: 20, fontWeight: 600, color: T.text, marginBottom: 8 }}>No clients yet</h3>
            <p style={{ color: T.muted, lineHeight: 1.6, maxWidth: 360, margin: '0 auto 20px' }}>
              Clients will appear once they assign you as their accountant from their MyLedger portal.
              Meanwhile, share your referral link to bring them in.
            </p>
            <button onClick={() => setTab('Referral')} style={{
              padding: '10px 24px', background: T.accent, color: '#fff', border: 'none',
              borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            }}>Go to Referral Program →</button>
          </div>
        )}
        {!noClients && !active && <div style={{ color: T.muted, textAlign: 'center', padding: 60 }}>Select a client above.</div>}

        {/* ════════════ DASHBOARD ════════════ */}
        {tab === 'Dashboard' && active && (
          <div>
            <h2 style={{ margin: '0 0 22px', fontSize: 22, fontWeight: 600 }}>{active.tradeName} — Dashboard</h2>

            {/* Weekly backup reminder */}
            {(() => {
              const key       = 'ml_backup_reminder_dismissed';
              const dismissed = localStorage.getItem(key);
              const weekAgo   = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
              if (dismissed && dismissed > weekAgo) return null;
              const date = new Date().toISOString().slice(0,10);
              return (
                <div style={{ background: '#fffbeb', border: '1px solid #fbbf24', borderRadius: 10,
                  padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center',
                  gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
                  <span style={{ flex: 1 }}>
                    💾 <strong>Data backup reminder:</strong> Download a CSV copy of your transactions for safe-keeping.
                  </span>
                  <button onClick={() => downloadCSV(`/transactions?clientId=${active.id}`, `transactions_${active.tradeName}_${date}.csv`)}
                    style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: '#f59e0b', color: '#fff', fontWeight: 600, fontSize: 12 }}>
                    ⬇ Download CSV
                  </button>
                  <button onClick={() => { localStorage.setItem(key, new Date().toISOString()); window.dispatchEvent(new Event('storage')); }}
                    style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #fbbf24',
                      cursor: 'pointer', background: 'transparent', color: '#92400e', fontSize: 12 }}
                    title="Remind me again in 7 days">
                    Dismiss
                  </button>
                </div>
              );
            })()}

            {/* Metric cards */}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              {[
                { label: 'Net Revenue',  value: income ? peso(income.revenue)  : '—', color: T.green  },
                { label: 'Net Expenses', value: income ? peso(income.expenses) : '—', color: T.red    },
                { label: 'Net Profit',   value: income ? peso(income.profit)   : '—',
                  color: !income ? T.text : income.profit >= 0 ? T.accent : T.red },
                { label: 'Transactions', value: txns.length, color: T.text },
                { label: 'Output VAT',   value: vatBal ? peso(vatBal.outputVAT) : '—', color: T.orange },
              ].map(m => (
                <div key={m.label} style={{ background: T.surface, borderRadius: T.radius, padding: '18px 22px',
                  boxShadow: T.shadow, border: `1px solid ${T.border}`, flex: 1, minWidth: 140 }}>
                  <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: m.color, letterSpacing: '-0.5px' }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Chart + Upcoming filings */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '3fr 2fr', gap: 20, marginBottom: 20 }}>
              {/* Monthly chart */}
              <Card>
                <SectionHead>Monthly Revenue vs. Expenses (last 6 months)</SectionHead>
                <MonthlyBarChart transactions={txns} />
              </Card>

              {/* Upcoming filings */}
              <Card>
                <SectionHead>Upcoming BIR Filings</SectionHead>
                {(active.taxTypes || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
                    No tax types configured for this client.
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
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{d.dueDate}</div>
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

            {/* VAT compliance */}
            {vatBal && (
              <Card style={{ marginBottom: 20 }}>
                <SectionHead>VAT Compliance Position</SectionHead>
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Input VAT Recoverable (asset)</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: T.green }}>{peso(vatBal.inputVAT)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Output VAT Payable (liability)</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: T.orange }}>{peso(vatBal.outputVAT)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Net VAT Position</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: vatBal.netVATPayable >= 0 ? T.red : T.green }}>
                      {vatBal.note}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* ── Cash Position Widget ── */}
            {cashPos && (
              <Card style={{ marginBottom: 20 }}>
                <SectionHead>💵 Cash Position</SectionHead>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
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
            )}

            {/* ── Cash Flow Forecast ── */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionHead style={{ margin: 0 }}>📈 Cash Flow Forecast</SectionHead>
                {forecastLoad && <span style={{ fontSize: 12, color: '#94a3b8' }}>Loading…</span>}
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

            {/* ── AI Narrative ── */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <SectionHead style={{ margin: 0 }}>✨ AI Summary</SectionHead>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {narrative?.cachedAt && (
                    <span style={{ fontSize: 11, color: T.muted }}>
                      {narrative.fromCache ? 'Cached · ' : 'Fresh · '}
                      {new Date(narrative.cachedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
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
                    {narrativeLoad ? '…' : '↻ Refresh'}
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
              {!narrativeLoad && !narrative && (
                <div style={{ fontSize: 13, color: T.muted, fontStyle: 'italic' }}>
                  Click Refresh to generate today's summary.
                </div>
              )}
              <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>
                Generated once per day by AI · Resets at midnight Philippine time
              </div>
            </Card>

            {/* Client profile */}
            <Card style={{ marginBottom: 20 }}>
              <SectionHead>Client Profile</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px 24px' }}>
                {[
                  ['Trade Name',  active.tradeName],
                  ['TIN',         active.tin],
                  ['Type',        active.type],
                  ['Address',     active.address || '—'],
                  ['Tax Types',   (active.taxTypes || []).join(', ') || 'None'],
                  ['Plan',        active.subscriptionTier || 'free'],
                  ...(active.type === 'Sole Proprietor' && active.ownerBirthdate
                    ? [['Owner Birthday', new Date(active.ownerBirthdate).toLocaleDateString('en-PH',
                        { month: 'long', day: 'numeric', year: 'numeric' })]]
                    : []),
                  ['Client Since', fmtDt(active.createdAt)],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k}</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{v}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Encoder assignment */}
            <Card>
              <SectionHead>Encoders Assigned to This Client</SectionHead>
              {(active.encoderIds || []).length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, fontStyle: 'italic' }}>
                  No encoders assigned yet. Encoders can add and delete transactions but cannot access reports or BIR tools.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {(active.encoderIds || []).map(encId => (
                    <div key={encId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#fff8ec', borderRadius: 8, padding: '9px 14px',
                      border: `1px solid #ff950030` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 14 }}>⌨️</span>
                        <span style={{ fontSize: 13, color: T.text, fontFamily: 'monospace' }}>{encId}</span>
                      </div>
                      <button onClick={() => handleRemoveEncoder(encId)} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: T.red, fontSize: 13, padding: '2px 8px', borderRadius: 5,
                        fontFamily: 'inherit' }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAssignEncoder} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>
                    Assign Encoder by Email
                  </label>
                  <input style={inp} type="email" placeholder="encoder@example.com"
                    value={encEmail} onChange={e => setEncEmail(e.target.value)} required />
                </div>
                <Btn type="submit" disabled={encLoad} style={{ marginBottom: 0 }}>
                  {encLoad ? 'Assigning…' : 'Assign Encoder'}
                </Btn>
              </form>
              {encMsg && (
                <div style={{ marginTop: 8, fontSize: 13,
                  color: encMsg.startsWith('✓') ? T.accent : T.orange }}>
                  {encMsg}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ════════════ TRANSACTIONS ════════════ */}
        {tab === 'Transactions' && active && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Transactions — {active.tradeName}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {txns.length > 0 && (
                  <Btn size="sm" variant="neutral" onClick={() => {
                    const date = new Date().toISOString().substring(0, 10);
                    downloadCSV(`/transactions?clientId=${active.id}`, `transactions_${active.tradeName}_${date}.csv`);
                  }}>⬇ Export CSV</Btn>
                )}
                <Btn size="sm" variant="neutral" onClick={() => setShowCSVImport(true)}>📥 Import Bank CSV</Btn>
                <Btn size="sm" variant="neutral" onClick={() => setShowBSImport(true)}>📊 Import Opening Balances</Btn>
                <Btn onClick={() => setShowTx(true)}>+ Add Transaction</Btn>
              </div>
            </div>
            {txLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : txns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🧾</div>
                <div>No transactions recorded for this client.</div>
              </div>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.bg }}>
                        {['Date','Type','Category','Description','Ref. No.','Counterparty','NET','VAT','GROSS',''].map(h => (
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
                        }}>
                          <td style={{ padding: '11px 14px', color: T.muted, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{fmtDt(t.createdAt)}</td>
                          <td style={{ padding: '11px 14px' }}>
                            {t.voided
                              ? <span style={{ background: '#f0f0f0', color: T.muted, padding: '2px 8px',
                                  borderRadius: 6, fontSize: 12, fontWeight: 600 }}>VOID</span>
                              : <span style={{ background: t.type === 'income' ? '#e3f7ed' : '#fff0f0',
                                  color: t.type === 'income' ? T.green : T.red,
                                  padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>{t.type}</span>
                            }
                          </td>
                          <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12,
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{t.category}</td>
                          <td style={{ padding: '11px 14px', maxWidth: 200 }}>
                            <div style={{ textDecoration: t.voided ? 'line-through' : 'none' }}>{t.description}</div>
                            {t.voided && t.voidReason && <div style={{ fontSize: 11, color: T.red, marginTop: 2 }}>Void: {t.voidReason}</div>}
                            {!t.voided && t.notes && <div style={{ fontSize: 11, color: T.muted, marginTop: 2, fontStyle: 'italic' }}>{t.notes}</div>}
                          </td>
                          <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12,
                            textDecoration: t.voided ? 'line-through' : 'none' }}>
                            {t.referenceNo || <span style={{ opacity: 0.35 }}>—</span>}
                          </td>
                          <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12 }}>
                            {t.counterpartyName || <span style={{ opacity: 0.35 }}>—</span>}
                            {t.counterpartyTin && <div style={{ fontSize: 11 }}>TIN: {t.counterpartyTin}</div>}
                          </td>
                          <td style={{ padding: '11px 14px', fontWeight: 500, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{peso(t.net)}</td>
                          <td style={{ padding: '11px 14px', color: T.orange, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{peso(t.vat)}</td>
                          <td style={{ padding: '11px 14px', color: T.muted, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{peso(t.gross)}</td>
                          <td style={{ padding: '11px 14px' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              {!t.voided && (<>
                                <button onClick={() => setEditTx(t)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                                    color: T.blue, fontSize: 13, padding: '3px 6px', borderRadius: 5 }}>
                                  ✎ Edit
                                </button>
                                <button onClick={() => voidTx(t.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer',
                                    color: T.red, fontSize: 13, padding: '3px 6px', borderRadius: 5 }}>
                                  ⊘ Void
                                </button>
                              </>)}
                              <button onClick={() => openReceipts(t)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                  color: T.muted, fontSize: 13, padding: '3px 6px', borderRadius: 5 }}>
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

              {/* Upload area */}
              <label style={{ display: 'block', border: `2px dashed ${T.border}`, borderRadius: 10,
                padding: '14px 20px', cursor: 'pointer', textAlign: 'center',
                background: T.bg, marginBottom: 16, fontSize: 13, color: T.muted }}>
                {receiptUploading ? 'Uploading…' : '+ Upload receipt (JPG, PNG, PDF, CSV, XLS — max 10 MB)'}
                <input type="file" hidden onChange={handleReceiptUpload} disabled={receiptUploading}
                  accept="image/*,.pdf,.csv,.xls,.xlsx" />
              </label>

              {/* Attachment list */}
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

        {/* ── Edit transaction modal (accountant-only) ── */}
        {editTx && (
          <EditTxModal
            tx={editTx}
            lockedPeriods={periods}
            onSave={handleEditSave}
            onClose={() => setEditTx(null)}
          />
        )}

        {/* ════════════ JOURNAL ENTRIES ════════════ */}
        {tab === 'Journal Entries' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Journal Entries — {active.tradeName}</h2>
              <Btn onClick={() => setShowJE(true)}>+ New Journal Entry</Btn>
            </div>

            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              Manual adjusting entries. Debits must equal Credits before saving.
            </div>

            {jLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : journals.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📒</div>
                <div>No journal entries yet. Use this for month-end adjustments and corrections.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {journals.map(je => (
                  <Card key={je.id} style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 15, color: T.text }}>{je.description}</span>
                        {je.referenceNo && (
                          <span style={{ marginLeft: 10, fontSize: 12, color: T.muted,
                            background: T.bg, padding: '2px 8px', borderRadius: 5 }}>
                            {je.referenceNo}
                          </span>
                        )}
                        <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>
                          {new Date(je.date).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })}
                          &nbsp;·&nbsp;Posted {fmtDt(je.createdAt)}
                        </div>
                      </div>
                      <button onClick={() => deleteJE(je.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer',
                          color: T.red, fontSize: 14, padding: '4px 8px', borderRadius: 6,
                          display: 'flex', alignItems: 'center', gap: 4 }}>
                        ✕ Delete
                      </button>
                    </div>

                    {/* Line items table */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: T.bg }}>
                            {['Account', 'Debit', 'Credit'].map(h => (
                              <th key={h} style={{ padding: '7px 12px', textAlign: h === 'Account' ? 'left' : 'right',
                                fontWeight: 600, color: T.muted, fontSize: 11,
                                borderBottom: `1px solid ${T.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {je.entries.map((e, i) => (
                            <tr key={i} style={{ borderBottom: i < je.entries.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                              <td style={{ padding: '8px 12px', paddingLeft: e.debit === 0 ? 36 : 12 }}>
                                {e.account || <span style={{ color: T.muted, fontStyle: 'italic' }}>Unnamed account</span>}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500,
                                color: e.debit > 0 ? T.text : 'transparent' }}>
                                {e.debit > 0 ? peso(e.debit) : '—'}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500,
                                color: e.credit > 0 ? T.muted : 'transparent' }}>
                                {e.credit > 0 ? peso(e.credit) : '—'}
                              </td>
                            </tr>
                          ))}
                          {/* Totals row */}
                          <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                            <td style={{ padding: '8px 12px', fontWeight: 700, fontSize: 12, color: T.muted }}>TOTAL</td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                              {peso(je.entries.reduce((s, e) => s + (e.debit || 0), 0))}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>
                              {peso(je.entries.reduce((s, e) => s + (e.credit || 0), 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════ TRIAL BALANCE ════════════ */}
        {tab === 'Trial Balance' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>Trial Balance — {active.tradeName}</h2>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              Synthetic trial balance derived from all transactions and manual journal entries.
              Accounts are named per transaction category.
            </div>

            {(() => {
              const rows = computeTrialBalance(txns, journals);
              if (rows.length === 0) return (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                  <div>No data yet. Add transactions or journal entries first.</div>
                </div>
              );
              const totalDr = rows.reduce((s, r) => s + r.debit, 0);
              const totalCr = rows.reduce((s, r) => s + r.credit, 0);
              return (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {['Account', 'Debit', 'Credit', 'Balance (Dr/Cr)'].map((h, i) => (
                            <th key={h} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'right',
                              fontWeight: 600, color: T.muted, fontSize: 11,
                              borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.name} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                            <td style={{ padding: '10px 16px', fontWeight: 500 }}>{r.name}</td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', color: r.debit > 0 ? T.text : T.border }}>
                              {r.debit > 0 ? peso(r.debit) : '—'}
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', color: r.credit > 0 ? T.text : T.border }}>
                              {r.credit > 0 ? peso(r.credit) : '—'}
                            </td>
                            <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600,
                              color: r.balance >= 0 ? T.text : T.orange }}>
                              {r.balance >= 0
                                ? <span>{peso(r.balance)} <span style={{ fontSize: 11, fontWeight: 400, color: T.muted }}>Dr</span></span>
                                : <span>{peso(Math.abs(r.balance))} <span style={{ fontSize: 11, fontWeight: 400, color: T.muted }}>Cr</span></span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                          <td style={{ padding: '11px 16px', fontWeight: 700 }}>TOTALS</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700 }}>{peso(totalDr)}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700 }}>{peso(totalCr)}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700,
                            color: Math.abs(totalDr - totalCr) < 0.01 ? T.accent : T.red }}>
                            {Math.abs(totalDr - totalCr) < 0.01
                              ? '✓ Balanced'
                              : `Out by ${peso(Math.abs(totalDr - totalCr))}`}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              );
            })()}
          </div>
        )}

        {/* ════════════ BIR RETURNS ════════════ */}
        {tab === 'BIR Returns' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : (() => {
            const isOPT      = active.taxRegime === 'opt';
            const isSoleProp = active.type === 'Sole Proprietor' || active.type === 'Individual';
            const isCorp     = !isSoleProp;

            // Form groups
            const indvITForms = active.taxOption === '8percent'
              ? ['1701A'] : ['1701'];
            const corpITForms = ['1702', '1702Q'];

            const vatForms    = isOPT ? ['2551M', '2551Q'] : ['2550M', '2550Q'];
            const itForms     = isSoleProp ? indvITForms : corpITForms;
            const formGroups  = [
              { label: 'Income Tax', forms: itForms },
              { label: isOPT ? 'Percentage Tax' : 'VAT Returns', forms: vatForms },
              { label: 'Withholding Tax', forms: ['1601-EQ', '1601FQ', '1604-EQ'] },
            ];
            const allForms    = [...itForms, ...vatForms, '1601-EQ', '1604-EQ', '1601FQ'];

            // Normalise the current selection
            const is1601EQ    = birType === '1601-EQ';
            const is1604EQ    = birType === '1604-EQ';
            const isITForm    = ['1701', '1701A', '1702', '1702Q'].includes(birType);
            const isVATForm   = ['2550M', '2550Q', '2551M', '2551Q'].includes(birType);
            const effectiveBirType = allForms.includes(birType) ? birType
              : (isSoleProp ? (active.taxOption === '8percent' ? '1701A' : '1701') : '1702');

            const isQuarterly = ['2550Q', '2551Q', '1601-EQ', '1702Q', '1601FQ'].includes(effectiveBirType);
            const isAnnual    = ['1701', '1701A', '1702', '1604-EQ'].includes(effectiveBirType);
            const monthNames  = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
            const qLabels     = { 1: 'Q1 (Jan–Mar)', 4: 'Q2 (Apr–Jun)', 7: 'Q3 (Jul–Sep)', 10: 'Q4 (Oct–Dec)' };
            // Normalize birMonth to the start of its quarter (1, 4, 7, or 10)
            // This prevents a bug where birMonth=5 (May, the default) makes quarterly forms
            // visually show Q1 but compute Q2 (Math.ceil(5/3)=2).
            const qStart    = birMonth <= 3 ? 1 : birMonth <= 6 ? 4 : birMonth <= 9 ? 7 : 10;
            const itQuarter = qStart === 1 ? 1 : qStart === 4 ? 2 : qStart === 7 ? 3 : 4;
            const periodLabel = isAnnual ? `Annual ${birYear}`
              : isQuarterly ? qLabels[qStart]
              : monthNames[birMonth];

            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, flexWrap: 'wrap', gap: 8 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
                    BIR Returns — {active.tradeName}
                  </h2>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['2550M','2550Q','2551M','2551Q','1601C','1601EQ'].includes(
                      effectiveBirType === '1601-EQ' ? '1601EQ' : effectiveBirType
                    ) && (
                      <Btn size="sm" variant="neutral" onClick={async () => {
                        try {
                          const xmlForm  = effectiveBirType === '1601-EQ' ? '1601EQ' : effectiveBirType;
                          const xmlMonth = isQuarterly ? qStart : birMonth;
                          await downloadBirXml(active.id, xmlForm, birYear, xmlMonth);
                        } catch (e) { alert('XML export failed: ' + e.message); }
                      }}>Export XML</Btn>
                    )}
                  <Btn size="sm" variant="neutral" onClick={async () => {
                    let r, bodyHtml;
                    if (is1604EQ) {
                      bodyHtml = build1604EQHtml({ txns, client: active, birYear });
                      printReport({ title: `BIR Form ${effectiveBirType} — ${active.tradeName}`, subtitle: periodLabel, bodyHtml, firmLabel: firmName || 'MyLedger by Kaiman & Co.', accentColor: brandAccent });
                    } else if (is1601EQ) {
                      bodyHtml = build1601EQHtml({ txns, client: active, birYear, qStart, periodLabel });
                      printReport({ title: `BIR Form ${effectiveBirType} — ${active.tradeName}`, subtitle: periodLabel, bodyHtml, firmLabel: firmName || 'MyLedger by Kaiman & Co.', accentColor: brandAccent });
                    } else if (isITForm) {
                      const qNum = ['1702Q'].includes(effectiveBirType) ? itQuarter : null;
                      r = computeIncomeTax(txns, active, birYear, qNum);
                      bodyHtml = buildBIRReturnHtml({ effectiveBirType, periodLabel, birYear, r, client: active });
                      printReport({ title: `BIR Form ${effectiveBirType} — ${active.tradeName}`, subtitle: periodLabel, bodyHtml, firmLabel: firmName || 'MyLedger by Kaiman & Co.', accentColor: brandAccent });
                    } else if (isOPT) {
                      r = computeOPT(txns, active, birYear, isQuarterly ? qStart : birMonth, isQuarterly);
                      bodyHtml = buildBIRReturnHtml({ isOPT, effectiveBirType, periodLabel, birYear, r, client: active });
                      printReport({ title: `BIR Form ${effectiveBirType} — ${active.tradeName}`, subtitle: periodLabel, bodyHtml, firmLabel: firmName || 'MyLedger by Kaiman & Co.', accentColor: brandAccent });
                    } else if (effectiveBirType === '2550Q') {
                      // ── BIR 2550Q: pdf-lib overlay on official template ──
                      try {
                        const prefill = compute2550Prefill(txns, birYear, qStart, true);
                        const qNum = Math.floor((qStart - 1) / 3) + 1; // 1..4
                        const bytes = await generate2550QPDF({ client: active, year: birYear, quarter: qNum, prefill });
                        const safeName = (active.tradeName || 'client').replace(/[^a-zA-Z0-9]/g, '_');
                        downloadBIRPDF(bytes, `BIR_2550Q_${safeName}_Q${qNum}_${birYear}.pdf`);
                      } catch (e) {
                        console.error('2550Q PDF error:', e);
                        alert('Failed to generate 2550Q PDF. Check console for details.');
                      }
                    } else {
                      // 2550M — HTML print
                      r = computeBIRVAT(txns, birYear, birMonth, false);
                      const prefill = compute2550Prefill(txns, birYear, birMonth, false);
                      bodyHtml = buildBIRReturnHtml({ isOPT, effectiveBirType, periodLabel, birYear, r, client: active, prefill });
                      printReport({ title: `BIR Form ${effectiveBirType} — ${active.tradeName}`, subtitle: periodLabel, bodyHtml, firmLabel: firmName || 'MyLedger by Kaiman & Co.', accentColor: brandAccent });
                    }
                  }}>⬇ Export PDF</Btn>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
                  {isSoleProp
                    ? `Individual taxpayer — Form 1701 / 1701A`
                    : isCorp
                    ? `Corporate taxpayer — Form 1702 / 1702Q`
                    : isOPT
                    ? `OPT client (${((active.optRate ?? 0.03) * 100).toFixed(0)}% Percentage Tax) — Form 2551M / 2551Q`
                    : 'VAT-registered client — Form 2550M / 2550Q'}
                </div>

                {/* Period picker */}
                <Card style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Form</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {formGroups.map(grp => (
                          <div key={grp.label}>
                            <div style={{ fontSize: 11, color: T.muted, marginBottom: 3, fontWeight: 600,
                              textTransform: 'uppercase', letterSpacing: '0.5px' }}>{grp.label}</div>
                            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                              {grp.forms.map(f => (
                                <button key={f} onClick={() => setBirType(f)} style={{
                                  padding: '7px 16px', border: 'none', fontSize: 13, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'inherit',
                                  background: effectiveBirType === f ? T.accent : T.surface,
                                  color: effectiveBirType === f ? '#fff' : T.muted,
                                }}>{f}</button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Year</label>
                      <select style={{ ...inp, width: 100 }} value={birYear}
                        onChange={e => setBirYear(Number(e.target.value))}>
                        {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                      </select>
                    </div>

                    {isAnnual ? null : !isQuarterly ? (
                      <div>
                        <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Month</label>
                        <select style={{ ...inp, width: 140 }} value={birMonth}
                          onChange={e => setBirMonth(Number(e.target.value))}>
                          {monthNames.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                        </select>
                      </div>
                    ) : (
                      <div>
                        <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Quarter</label>
                        <select style={{ ...inp, width: 140 }} value={qStart}
                          onChange={e => setBirMonth(Number(e.target.value))}>
                          <option value={1}>Q1 (Jan–Mar)</option>
                          <option value={4}>Q2 (Apr–Jun)</option>
                          <option value={7}>Q3 (Jul–Sep)</option>
                          <option value={10}>Q4 (Oct–Dec)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </Card>

                {/* ── Income Tax Forms: 1701 / 1701A / 1702 / 1702Q ── */}
                {isITForm && (() => {
                  const qNum = effectiveBirType === '1702Q' ? itQuarter : null;
                  const r = computeIncomeTax(txns, active, birYear, qNum);
                  const peso2 = v => `₱${(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  return (
                    <div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                        <div style={{ background: '#e3f7ed', borderRadius: T.radius, padding: '18px 22px',
                          border: `1px solid ${T.green}30`, flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>Net Revenue (VAT-exclusive)</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: T.green }}>{peso2(r.grossRevenue)}</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{r.txCount} transactions</div>
                        </div>
                        <div style={{ background: '#f0f0ff', borderRadius: T.radius, padding: '18px 22px',
                          border: `1px solid #8080c030`, flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>Total Deductions / Expenses</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: '#5050b0' }}>{peso2(r.totalExpenses)}</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>NET basis</div>
                        </div>
                        <div style={{ background: '#fff8ec', borderRadius: T.radius, padding: '18px 22px',
                          border: `1px solid ${T.orange}30`, flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>Taxable Income</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: T.orange }}>{peso2(r.taxableIncome)}</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{r.method}</div>
                        </div>
                        <div style={{ background: '#fff0f5', borderRadius: T.radius, padding: '18px 22px',
                          border: `1px solid ${T.red}30`, flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>Income Tax Due</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: T.red }}>{peso2(r.taxDue)}</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Before credits / penalties</div>
                        </div>
                      </div>

                      {/* Non-taxable income reconciliation note */}
                      {(r.nonTaxableTotal > 0) && (
                        <div style={{ background: '#fffbec', border: `1px solid ${T.yellow}60`,
                          borderRadius: T.radius, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
                          <div style={{ fontWeight: 600, color: '#a07000', marginBottom: 6 }}>
                            ⚠ Non-Taxable Income Excluded from ITR
                          </div>
                          <div style={{ color: T.text, marginBottom: 4 }}>
                            Total gross collections: <strong>₱{(r.totalGrossAll||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</strong>
                          </div>
                          <div style={{ color: T.muted }}>
                            Less: Non-taxable items (Reimbursements, Capital Contributions, Loan Proceeds):
                            <strong style={{ color: '#a07000', marginLeft: 6 }}>
                              ₱{(r.nonTaxableTotal||0).toLocaleString('en-PH',{minimumFractionDigits:2})}
                            </strong>
                          </div>
                          <div style={{ color: T.text, marginTop: 4 }}>
                            Taxable gross revenue used for ITR: <strong>₱{(r.grossRevenue||0).toLocaleString('en-PH',{minimumFractionDigits:2})}</strong>
                          </div>
                          <div style={{ fontSize: 12, color: T.muted, marginTop: 6 }}>
                            Tag income transactions as "Reimbursement", "Capital Contribution", or "Loan Proceeds" to exclude them from income tax computation.
                          </div>
                        </div>
                      )}

                      {/* MCIT vs RCIT breakdown for corporate clients */}
                      {!r.isSoleProp && (
                        <Card style={{ marginBottom: 20, fontSize: 13 }}>
                          <SectionHead>MCIT vs RCIT Comparison</SectionHead>
                          {[
                            ['Gross Revenue', `₱${(r.grossRevenue||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                            ['Less: Cost of Goods Sold (COGS)', `₱${(r.cogs||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                            ['Gross Income (MCIT base)', `₱${(r.grossIncome||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                            [`MCIT (${((r.mcitRate||0.02)*100).toFixed(0)}% × Gross Income)`, `₱${(r.mcit||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                            ['─', '─'],
                            ['Net Revenue (VAT-exclusive)', `₱${(r.netRevenue||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                            ['Less: Total Deductible Expenses', `₱${(r.totalExpenses||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                            ['Net Taxable Income (RCIT base)', `₱${(r.taxableIncome||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                            [`RCIT (${((r.rcitRate||0.25)*100).toFixed(0)}% × Net Taxable Income)`, `₱${(r.rcit||0).toLocaleString('en-PH',{minimumFractionDigits:2})}`],
                          ].map(([k, v]) => k === '─' ? (
                            <div key={k} style={{ borderTop: `1px solid ${T.border}`, margin: '6px 0' }} />
                          ) : (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between',
                              padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
                              <span style={{ color: T.muted }}>{k}</span>
                              <span style={{ fontWeight: 500 }}>{v}</span>
                            </div>
                          ))}
                          <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8,
                            background: r.applyMCIT ? '#fff0f5' : '#e3f7ed',
                            border: `1px solid ${r.applyMCIT ? T.red : T.green}40`,
                            fontSize: 13, fontWeight: 600,
                            color: r.applyMCIT ? T.red : T.green }}>
                            {r.mcitApplicable
                              ? (r.applyMCIT
                                  ? `⚠ MCIT applies — ₱${(r.mcit||0).toLocaleString('en-PH',{minimumFractionDigits:2})} (higher than RCIT)`
                                  : `✓ RCIT applies — ₱${(r.rcit||0).toLocaleString('en-PH',{minimumFractionDigits:2})} (higher than MCIT)`)
                              : '⚠ MCIT not yet applicable (company has not reached its 4th taxable year)'}
                          </div>
                        </Card>
                      )}

                      {/* TRAIN Law rate table reference */}
                      {r.isSoleProp && r.taxOption === 'graduated' && (
                        <Card style={{ marginBottom: 20, fontSize: 13 }}>
                          <SectionHead>TRAIN Law Graduated Tax Table (Effective 2023)</SectionHead>
                          {[
                            ['₱0 – ₱250,000',       '0%',  '₱0'],
                            ['₱250,001 – ₱400,000',  '15%', '15% of excess over ₱250,000'],
                            ['₱400,001 – ₱800,000',  '20%', '₱22,500 + 20% of excess over ₱400,000'],
                            ['₱800,001 – ₱2,000,000','25%', '₱102,500 + 25% of excess over ₱800,000'],
                            ['₱2M – ₱8M',            '30%', '₱402,500 + 30% of excess over ₱2,000,000'],
                            ['Over ₱8M',             '35%', '₱2,202,500 + 35% of excess over ₱8,000,000'],
                          ].map(([band, rate, tax]) => (
                            <div key={band} style={{ display: 'grid', gridTemplateColumns: '2fr 0.5fr 3fr',
                              padding: '6px 0', borderBottom: `1px solid ${T.border}`, gap: 8 }}>
                              <span style={{ color: T.muted }}>{band}</span>
                              <span style={{ fontWeight: 600, color: T.accent }}>{rate}</span>
                              <span style={{ color: T.text }}>{tax}</span>
                            </div>
                          ))}
                        </Card>
                      )}
                    </div>
                  );
                })()}

                {/* ── OPT / 2551 ── */}
                {isOPT && !is1601EQ && !is1604EQ && !isITForm && (() => {
                  const r = computeOPT(txns, active, birYear, isQuarterly ? qStart : birMonth, isQuarterly);
                  return (
                    <div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                        <div style={{ background: '#e3f7ed', borderRadius: T.radius, padding: '18px 22px',
                          border: `1px solid ${T.green}30`, flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>Gross Sales / Receipts</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: T.green }}>{peso(r.grossSales)}</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{r.txCount} income transactions</div>
                        </div>
                        <div style={{ background: '#fff8ec', borderRadius: T.radius, padding: '18px 22px',
                          border: `1px solid ${T.orange}30`, flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>OPT Rate</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: T.orange }}>{(r.optRate * 100).toFixed(0)}%</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Sec. 116, NIRC</div>
                        </div>
                        <div style={{ background: '#fff0f5', borderRadius: T.radius, padding: '18px 22px',
                          border: `1px solid ${T.red}30`, flex: 1, minWidth: 160 }}>
                          <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>Percentage Tax Due</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: T.red }}>{peso(r.percentageTax)}</div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>Payable to BIR</div>
                        </div>
                      </div>

                      <Card style={{ maxWidth: 540 }}>
                        <SectionHead>BIR Form {effectiveBirType} — {periodLabel} {birYear}</SectionHead>
                        {r.txCount === 0 && (
                          <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 16 }}>
                            No income transactions found for this period.
                          </div>
                        )}
                        {[
                          { label: 'Gross Sales / Receipts / Fees',           value: r.grossSales,     color: T.text   },
                          { label: `Percentage Tax (${(r.optRate * 100).toFixed(0)}% of Gross Sales)`, value: r.percentageTax, color: T.red, bold: true },
                        ].map((row, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                            padding: row.bold ? '12px 0 4px' : '8px 0',
                            borderBottom: row.bold ? 'none' : `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 13, color: row.bold ? T.text : T.muted,
                              fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                            <span style={{ fontSize: row.bold ? 18 : 13, fontWeight: row.bold ? 700 : 500,
                              color: row.color }}>{peso(row.value)}</span>
                          </div>
                        ))}
                        <div style={{ marginTop: 16, fontSize: 12, color: T.muted, lineHeight: 1.6,
                          background: T.bg, borderRadius: 8, padding: '10px 12px' }}>
                          Due: 20th of the following {isQuarterly ? 'quarter-end month' : 'month'} ·
                          Always verify with actual BIR-prescribed forms before filing.
                        </div>
                      </Card>

                      {/* ── 2551Q/2551M Schedule 1 Pre-fill ── */}
                      <Card style={{ maxWidth: 540, marginTop: 16 }}>
                        <SectionHead>BIR Form {effectiveBirType} — Schedule 1 (Pre-filled)</SectionHead>
                        <div style={{ fontSize: 12, color: T.muted, marginBottom: 14, fontStyle: 'italic' }}>
                          Derived from {r.txCount} income transaction{r.txCount !== 1 ? 's' : ''}. Verify with your CPA before filing.
                        </div>

                        {/* Schedule 1 header */}
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 100px',
                          gap: '0 8px', fontSize: 11, fontWeight: 700, color: T.muted,
                          textTransform: 'uppercase', letterSpacing: 0.5,
                          borderBottom: `2px solid ${T.border}`, paddingBottom: 6, marginBottom: 6 }}>
                          <span>ATC</span><span>Taxable Amount</span><span>Rate</span><span style={{ textAlign: 'right' }}>Tax Due</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 100px',
                          gap: '0 8px', padding: '8px 0',
                          borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                          <span style={{ fontFamily: 'monospace', color: T.accent, fontWeight: 600 }}>PT 010</span>
                          <span style={{ color: T.muted }}>Gross Sales/Receipts (Sec. 116)</span>
                          <span style={{ color: T.text }}>{(r.optRate * 100).toFixed(0)}%</span>
                          <span style={{ textAlign: 'right', fontWeight: 600, color: T.red }}>{peso(r.percentageTax)}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 70px 100px',
                          gap: '0 8px', padding: '10px 0 4px', fontSize: 14, fontWeight: 700 }}>
                          <span></span>
                          <span style={{ color: T.muted }}>Item 14 — Total Tax Due</span>
                          <span></span>
                          <span style={{ textAlign: 'right', color: T.red }}>{peso(r.percentageTax)}</span>
                        </div>

                        <div style={{ marginTop: 14, fontSize: 12, color: T.muted, lineHeight: 1.6,
                          background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: '8px 12px' }}>
                          ℹ Item 15 (Creditable % Tax Withheld per 2307): enter manually from 2307s received from customers.
                          Net payable = Item 14 − Item 15.
                        </div>
                      </Card>
                    </div>
                  );
                })()}

                {/* ── 1601-EQ (Expanded Withholding Tax) — BIR Form Replica ── */}
                {is1601EQ && (() => {
                  const qMths = [qStart, qStart + 1, qStart + 2];
                  const filtered = txns.filter(t => {
                    const d = new Date(t.createdAt);
                    return d.getFullYear() === birYear && qMths.includes(d.getMonth() + 1)
                      && t.type === 'expense' && parseFloat(t.ewtRate) > 0 && t.ewtAmount > 0;
                  });
                  const totalEWT  = Math.round(filtered.reduce((s, t) => s + (t.ewtAmount || 0), 0) * 100) / 100;
                  const totalBase = Math.round(filtered.reduce((s, t) => s + (t.amount_net || 0), 0) * 100) / 100;

                  // Build ATC_MAP from admin-configurable settings (fallback to defaults)
                  const ewtRatesList1601 = siteSettings.ewtRates || DEFAULT_EWT_RATES;
                  const ATC_MAP = {};
                  ewtRatesList1601.forEach(r => { ATC_MAP[r.rate] = { atc: r.atc, description: r.description }; });

                  const byAtc = {};
                  filtered.forEach(t => {
                    const rate = parseFloat(t.ewtRate);
                    const info = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate * 100)).padStart(3, '0')}`, description: `EWT ${(rate * 100).toFixed(0)}%` };
                    const key = info.atc;
                    byAtc[key] = byAtc[key] || { ...info, rate, base: 0, ewt: 0 };
                    byAtc[key].base = Math.round((byAtc[key].base + (t.amount_net || 0)) * 100) / 100;
                    byAtc[key].ewt  = Math.round((byAtc[key].ewt  + (t.ewtAmount  || 0)) * 100) / 100;
                  });
                  const atcList = Object.values(byAtc);
                  const endMonthLabel = ['March', 'June', 'September', 'December'][itQuarter - 1];

                  return (
                    <div>
                      {/* Summary cards */}
                      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Total Income Payments (NET)', value: totalBase,       color: T.text,   bg: T.accentL },
                          { label: 'Total EWT Withheld',          value: totalEWT,        color: T.orange, bg: '#fff8ec' },
                          { label: 'EWT Transactions',            value: filtered.length, color: T.accent, bg: T.accentL, count: true },
                        ].map(m => (
                          <div key={m.label} style={{ background: m.bg, borderRadius: T.radius, padding: '18px 22px',
                            border: `1px solid ${m.color}30`, flex: 1, minWidth: 160 }}>
                            <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>{m.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>
                              {m.count ? m.value : peso(m.value)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* BIR Form 1601-EQ replica */}
                      <Card style={{ marginBottom: 20 }}>
                        {/* Header */}
                        <div style={{ textAlign: 'center', paddingBottom: 16, borderBottom: `2px solid ${T.accent}`, marginBottom: 16 }}>
                          <div style={{ fontSize: 10, color: T.muted, letterSpacing: 1, textTransform: 'uppercase' }}>BIR Form No.</div>
                          <div style={{ fontSize: 28, fontWeight: 900, color: T.accent, letterSpacing: 2 }}>1601-EQ</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 4 }}>
                            Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)
                          </div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                            {periodLabel} {birYear} · Due: Last day of month following quarter end
                          </div>
                        </div>

                        {/* Part I */}
                        <SectionHead>Part I — Background Information</SectionHead>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px',
                          padding: '12px', background: T.bg, borderRadius: T.radius, marginBottom: 20 }}>
                          {[
                            ['Taxpayer Name', active.tradeName],
                            ['TIN', active.tin || '—'],
                            ['RDO Code', active.rdoCode || '—'],
                            ['Line of Business', active.businessType || active.type || '—'],
                            ['Tax Type', 'EWT — Expanded Withholding Tax'],
                            ['Return Period', `Q${itQuarter} Jan–${endMonthLabel} ${birYear}`],
                          ].map(([lbl, val]) => (
                            <div key={lbl} style={{ fontSize: 12 }}>
                              <div style={{ fontSize: 10, color: T.muted, marginBottom: 2 }}>{lbl}</div>
                              <div style={{ fontWeight: 600 }}>{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Part II: ATC Schedule */}
                        <SectionHead>Part II — Schedule of EWT by ATC</SectionHead>
                        {atcList.length === 0 ? (
                          <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 16,
                            padding: '16px', background: T.bg, borderRadius: T.radius, textAlign: 'center' }}>
                            No expense transactions with EWT found for {periodLabel} {birYear}.<br/>
                            Add EWT rates when recording eligible expense payments.
                          </div>
                        ) : (
                          <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius,
                            overflow: 'hidden', marginBottom: 16 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: T.bg }}>
                                  {['ATC', 'Nature of Income Payment', 'Income Payment', 'Tax Rate', 'Tax Withheld'].map((h, i) => (
                                    <th key={h} style={{ padding: '8px 12px', textAlign: i >= 2 ? 'right' : 'left',
                                      fontWeight: 600, color: T.muted, fontSize: 10, textTransform: 'uppercase',
                                      borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {atcList.map((a, i) => (
                                  <tr key={a.atc} style={{ borderBottom: i < atcList.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                    <td style={{ padding: '9px 12px', fontWeight: 700, color: T.accent,
                                      fontFamily: 'monospace', letterSpacing: 1 }}>{a.atc}</td>
                                    <td style={{ padding: '9px 12px' }}>{a.description}</td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right',
                                      fontVariantNumeric: 'tabular-nums' }}>{peso(a.base)}</td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right',
                                      color: T.muted }}>{(a.rate * 100).toFixed(0)}%</td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right',
                                      fontWeight: 700, color: T.orange }}>{peso(a.ewt)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                                  <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700 }}>
                                    Total EWT Withheld for the Quarter (Line 1)
                                  </td>
                                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900,
                                    color: T.orange, fontSize: 15 }}>{peso(totalEWT)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}

                        {/* Part III: Tax Due */}
                        <SectionHead>Part III — Tax Due / Penalties</SectionHead>
                        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.radius,
                          overflow: 'hidden', marginBottom: 16 }}>
                          {[
                            { no: 1, label: 'Total EWT Withheld for the Quarter', value: totalEWT, bold: false },
                            { no: 2, label: 'Less: Tax Remitted in Previous Month(s) of the Quarter', value: 0, bold: false },
                            { no: 3, label: 'Tax Still Due / (Overpayment)  (Line 1 − Line 2)', value: totalEWT, bold: true, highlight: true },
                            { no: 4, label: 'Add Penalties — Surcharge (25% / 50%)', value: 0, bold: false },
                            { no: 5, label: 'Add Penalties — Interest (12% per annum)', value: 0, bold: false },
                            { no: 6, label: 'Add Penalties — Compromise', value: 0, bold: false },
                          ].map((row, i, arr) => (
                            <div key={row.no} style={{
                              display: 'flex', alignItems: 'center', padding: '9px 14px',
                              borderBottom: i < arr.length - 1 ? `1px solid ${T.border}` : 'none',
                              background: row.highlight ? `${T.orange}12` : 'transparent',
                            }}>
                              <span style={{ width: 24, fontSize: 11, color: T.muted, fontWeight: 600, flexShrink: 0 }}>{row.no}.</span>
                              <span style={{ flex: 1, fontSize: 12, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                              <span style={{ fontSize: row.bold ? 15 : 13, fontWeight: row.bold ? 700 : 400,
                                color: row.bold ? T.orange : (row.value === 0 ? T.muted : T.text),
                                fontVariantNumeric: 'tabular-nums' }}>
                                {row.value === 0 && !row.bold ? '—' : peso(row.value)}
                              </span>
                            </div>
                          ))}
                          <div style={{ display: 'flex', alignItems: 'center', padding: '12px 14px',
                            background: `${T.orange}15`, borderTop: `2px solid ${T.orange}40` }}>
                            <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>
                              TOTAL AMOUNT PAYABLE  (Lines 3 + 4 + 5 + 6)
                            </span>
                            <span style={{ fontWeight: 900, fontSize: 18, color: T.orange }}>{peso(totalEWT)}</span>
                          </div>
                        </div>

                        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6,
                          background: T.bg, borderRadius: 8, padding: '10px 12px' }}>
                          ⚠️ Generated by MyLedger — Always verify with actual BIR-prescribed forms before filing.
                          Penalties apply for late remittance (25% surcharge + 12% interest per annum).
                        </div>
                      </Card>

                      {/* Annex: Transaction Detail */}
                      {filtered.length > 0 && (
                        <Card style={{ padding: 0, overflow: 'hidden' }}>
                          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`,
                            fontWeight: 700, fontSize: 14 }}>
                            Annex — EWT Transaction Detail ({filtered.length} payment{filtered.length !== 1 ? 's' : ''})
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: T.bg }}>
                                  {['Date','Payee','ATC','Description','NET Amount','EWT Rate','EWT Withheld'].map((h, i) => (
                                    <th key={h} style={{ padding: '9px 12px', textAlign: i >= 4 ? 'right' : 'left',
                                      fontWeight: 600, color: T.muted, fontSize: 10, textTransform: 'uppercase',
                                      borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.map((t, i) => {
                                  const rate    = parseFloat(t.ewtRate);
                                  const atcInfo = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate * 100)).padStart(3, '0')}` };
                                  return (
                                    <tr key={t.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                      <td style={{ padding: '9px 12px', color: T.muted, whiteSpace: 'nowrap' }}>
                                        {new Date(t.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                      </td>
                                      <td style={{ padding: '9px 12px' }}>{t.counterpartyName || <span style={{ color: T.muted }}>—</span>}</td>
                                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontWeight: 700,
                                        color: T.accent, fontSize: 11, whiteSpace: 'nowrap' }}>{atcInfo.atc}</td>
                                      <td style={{ padding: '9px 12px', color: T.muted }}>{t.description}</td>
                                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>{peso(t.amount_net)}</td>
                                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.muted }}>
                                        {(rate * 100).toFixed(0)}%
                                      </td>
                                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: T.orange }}>
                                        {peso(t.ewtAmount)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                                  <td colSpan={4} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: T.muted }}>TOTAL EWT WITHHELD</td>
                                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{peso(totalBase)}</td>
                                  <td></td>
                                  <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: T.orange }}>{peso(totalEWT)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </Card>
                      )}
                    </div>
                  );
                })()}

                {/* ── 1604-EQ (Annual EWT Return) ── */}
                {is1604EQ && (() => {
                  // Build ATC_MAP from admin-configurable settings (fallback to defaults)
                  const ewtRatesList1604 = siteSettings.ewtRates || DEFAULT_EWT_RATES;
                  const ATC_MAP = {};
                  ewtRatesList1604.forEach(r => { ATC_MAP[r.rate] = { atc: r.atc, description: r.description }; });
                  const filtered = txns.filter(t =>
                    new Date(t.createdAt).getFullYear() === birYear
                    && t.type === 'expense' && parseFloat(t.ewtRate) > 0 && t.ewtAmount > 0
                  );
                  const qRanges = [[1,3],[4,6],[7,9],[10,12]];
                  const qTotals = qRanges.map(([m1,m2]) => {
                    const qt = filtered.filter(t => { const m = new Date(t.createdAt).getMonth()+1; return m>=m1&&m<=m2; });
                    return Math.round(qt.reduce((s,t) => s+(t.ewtAmount||0),0)*100)/100;
                  });
                  const byAtc = {};
                  filtered.forEach(t => {
                    const rate = parseFloat(t.ewtRate);
                    const info = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate*100)).padStart(3,'0')}`, description: `EWT ${(rate*100).toFixed(0)}%` };
                    byAtc[info.atc] = byAtc[info.atc] || { ...info, rate, base:0, ewt:0, q:[0,0,0,0] };
                    byAtc[info.atc].base = Math.round((byAtc[info.atc].base+(t.amount_net||0))*100)/100;
                    byAtc[info.atc].ewt  = Math.round((byAtc[info.atc].ewt+(t.ewtAmount||0))*100)/100;
                    const m = new Date(t.createdAt).getMonth()+1;
                    const qi = m<=3?0:m<=6?1:m<=9?2:3;
                    byAtc[info.atc].q[qi] = Math.round((byAtc[info.atc].q[qi]+(t.ewtAmount||0))*100)/100;
                  });
                  const atcList  = Object.values(byAtc);
                  const totalEWT  = Math.round(atcList.reduce((s,a)=>s+a.ewt,0)*100)/100;
                  const totalBase = Math.round(atcList.reduce((s,a)=>s+a.base,0)*100)/100;
                  return (
                    <div>
                      <div style={{ display:'flex', gap:16, marginBottom:20, flexWrap:'wrap' }}>
                        {[
                          { label:'Annual EWT Withheld', value:totalEWT,  sub:'Total for '+birYear,  color:'#3b82f6', bg:'#eff6ff' },
                          { label:'Total Income Payments', value:totalBase, sub:'Base for EWT',       color:T.green,   bg:'#e3f7ed' },
                          { label:'Q1 EWT (Jan–Mar)',     value:qTotals[0], sub:'1st quarter',        color:T.muted,   bg:T.bg },
                          { label:'Q2 EWT (Apr–Jun)',     value:qTotals[1], sub:'2nd quarter',        color:T.muted,   bg:T.bg },
                          { label:'Q3 EWT (Jul–Sep)',     value:qTotals[2], sub:'3rd quarter',        color:T.muted,   bg:T.bg },
                          { label:'Q4 EWT (Oct–Dec)',     value:qTotals[3], sub:'4th quarter',        color:T.muted,   bg:T.bg },
                        ].map(m => (
                          <div key={m.label} style={{ background:m.bg, borderRadius:T.radius, padding:'14px 18px',
                            border:`1px solid ${m.color}30`, flex:1, minWidth:140 }}>
                            <div style={{ fontSize:12, color:T.muted, marginBottom:4 }}>{m.label}</div>
                            <div style={{ fontSize:20, fontWeight:700, color:m.color }}>{peso(m.value)}</div>
                            <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{m.sub}</div>
                          </div>
                        ))}
                      </div>

                      {/* ATC summary table */}
                      <Card style={{ marginBottom:16, padding:0, overflow:'hidden' }}>
                        <div style={{ padding:'12px 18px', borderBottom:`1px solid ${T.border}`, fontWeight:700, fontSize:14 }}>
                          BIR Form 1604-EQ — Annual Summary by ATC with Quarterly Breakdown ({birYear})
                        </div>
                        <div style={{ overflowX:'auto' }}>
                          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                            <thead>
                              <tr style={{ background:T.bg }}>
                                {['ATC','Nature of Income Payment','Total Base','Q1 EWT','Q2 EWT','Q3 EWT','Q4 EWT','Annual EWT'].map((h,i) => (
                                  <th key={h} style={{ padding:'8px 10px', textAlign: i>=2?'right':'left',
                                    fontWeight:600, color:T.muted, fontSize:11, borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {atcList.length === 0
                                ? <tr><td colSpan={8} style={{ padding:20, textAlign:'center', color:T.muted }}>No EWT transactions for {birYear}</td></tr>
                                : atcList.map(a => (
                                  <tr key={a.atc} style={{ borderBottom:`1px solid ${T.border}` }}>
                                    <td style={{ padding:'8px 10px', fontFamily:'monospace', fontWeight:700, color:'#003087' }}>{a.atc}</td>
                                    <td style={{ padding:'8px 10px', color:T.text }}>{a.description}</td>
                                    <td style={{ padding:'8px 10px', textAlign:'right', color:T.muted }}>{peso(a.base)}</td>
                                    <td style={{ padding:'8px 10px', textAlign:'right', color:T.text }}>{peso(a.q[0])}</td>
                                    <td style={{ padding:'8px 10px', textAlign:'right', color:T.text }}>{peso(a.q[1])}</td>
                                    <td style={{ padding:'8px 10px', textAlign:'right', color:T.text }}>{peso(a.q[2])}</td>
                                    <td style={{ padding:'8px 10px', textAlign:'right', color:T.text }}>{peso(a.q[3])}</td>
                                    <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color:'#003087' }}>{peso(a.ewt)}</td>
                                  </tr>
                                ))
                              }
                            </tbody>
                            {atcList.length > 0 && (
                              <tfoot>
                                <tr style={{ background:T.bg, fontWeight:700 }}>
                                  <td colSpan={2} style={{ padding:'8px 10px', borderTop:`1px solid ${T.border}` }}>ANNUAL TOTAL</td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', borderTop:`1px solid ${T.border}` }}>{peso(totalBase)}</td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', borderTop:`1px solid ${T.border}` }}>{peso(qTotals[0])}</td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', borderTop:`1px solid ${T.border}` }}>{peso(qTotals[1])}</td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', borderTop:`1px solid ${T.border}` }}>{peso(qTotals[2])}</td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', borderTop:`1px solid ${T.border}` }}>{peso(qTotals[3])}</td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', color:'#003087', borderTop:`1px solid ${T.border}` }}>{peso(totalEWT)}</td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      </Card>

                      {/* Payee detail */}
                      {filtered.length > 0 && (
                        <Card style={{ padding:0, overflow:'hidden' }}>
                          <div style={{ padding:'12px 18px', borderBottom:`1px solid ${T.border}`, fontWeight:700, fontSize:14 }}>
                            EWT Transaction Detail — {filtered.length} transaction{filtered.length!==1?'s':''} for {birYear}
                          </div>
                          <div style={{ overflowX:'auto' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                              <thead>
                                <tr style={{ background:T.bg }}>
                                  {['Date','Payee','ATC','Description','NET Amount','Rate','EWT'].map((h,i) => (
                                    <th key={h} style={{ padding:'8px 10px', textAlign:i>=4?'right':'left',
                                      fontWeight:600, color:T.muted, fontSize:11, borderBottom:`1px solid ${T.border}` }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.map((t,i) => {
                                  const rate = parseFloat(t.ewtRate);
                                  const info = ATC_MAP[rate] || { atc:`WC${String(Math.round(rate*100)).padStart(3,'0')}` };
                                  const d = new Date(t.createdAt);
                                  return (
                                    <tr key={t.id||i} style={{ borderBottom:`1px solid ${T.border}` }}>
                                      <td style={{ padding:'7px 10px', color:T.muted, whiteSpace:'nowrap' }}>{d.toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</td>
                                      <td style={{ padding:'7px 10px', color:T.text }}>{t.counterpartyName||'—'}</td>
                                      <td style={{ padding:'7px 10px', fontFamily:'monospace', fontWeight:700, color:'#003087' }}>{info.atc}</td>
                                      <td style={{ padding:'7px 10px', color:T.muted }}>{t.description||'—'}</td>
                                      <td style={{ padding:'7px 10px', textAlign:'right', color:T.text }}>{peso(t.amount_net||0)}</td>
                                      <td style={{ padding:'7px 10px', textAlign:'right', color:T.muted }}>{(rate*100).toFixed(0)}%</td>
                                      <td style={{ padding:'7px 10px', textAlign:'right', fontWeight:700, color:'#003087' }}>{peso(t.ewtAmount||0)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr style={{ background:T.bg, fontWeight:700 }}>
                                  <td colSpan={4} style={{ padding:'8px 10px', borderTop:`1px solid ${T.border}` }}>TOTAL</td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', borderTop:`1px solid ${T.border}` }}>{peso(totalBase)}</td>
                                  <td style={{ borderTop:`1px solid ${T.border}` }}></td>
                                  <td style={{ padding:'8px 10px', textAlign:'right', color:'#003087', borderTop:`1px solid ${T.border}` }}>{peso(totalEWT)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </Card>
                      )}

                      <p style={{ fontSize:12, color:T.muted, marginTop:12 }}>
                        Due: On or before March 1 of {birYear+1} · Attach Alphalist of Payees (available in the Alphalist tab) ·
                        EWT was remitted quarterly via BIR Form 1601-EQ.
                      </p>
                    </div>
                  );
                })()}

                {/* ── VAT / 2550 ── */}
                {!isOPT && !is1601EQ && !is1604EQ && !isITForm && birType !== '1601FQ' && (() => {
                  const r = computeBIRVAT(txns, birYear, isQuarterly ? qStart : birMonth, isQuarterly);
                  return (
                    <div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Gross Sales', value: r.grossSales, sub: 'Total gross incl. VAT', color: T.green,  bg: '#e3f7ed' },
                          { label: 'Output VAT (12%)', value: r.outputVAT, sub: 'Collected from customers', color: T.orange, bg: '#fff8ec' },
                          { label: 'Gross Purchases', value: r.grossPurchases, sub: 'Total gross incl. VAT', color: T.red, bg: '#fff0f5' },
                          { label: 'Input VAT (12%)', value: r.inputVAT, sub: 'Claimable from purchases', color: T.accent, bg: T.accentL },
                        ].map(m => (
                          <div key={m.label} style={{ background: m.bg, borderRadius: T.radius, padding: '18px 22px',
                            border: `1px solid ${m.color}30`, flex: 1, minWidth: 160 }}>
                            <div style={{ fontSize: 12, color: T.muted, marginBottom: 5 }}>{m.label}</div>
                            <div style={{ fontSize: 22, fontWeight: 700, color: m.color }}>{peso(m.value)}</div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{m.sub}</div>
                          </div>
                        ))}
                      </div>
                      <Card style={{ maxWidth: 540 }}>
                        <SectionHead>BIR Form {effectiveBirType} — {periodLabel} {birYear}</SectionHead>
                        {r.txCount === 0 && (
                          <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 16 }}>
                            No transactions found for this period.
                          </div>
                        )}
                        {[
                          { label: 'Taxable Sales (VAT-exclusive NET)',     value: r.grossSales - r.outputVAT, color: T.text   },
                          { label: 'Output VAT Due (12%)',                  value: r.outputVAT,                color: T.orange },
                          null,
                          { label: 'Allowable Input VAT (from purchases)', value: r.inputVAT,                 color: T.accent, sub: true },
                          null,
                          { label: r.netVATDue > 0 ? 'VAT Payable to BIR' : 'Excess Input VAT (carry forward)',
                            value: r.netVATDue > 0 ? r.netVATDue : r.excessInputVAT,
                            color: r.netVATDue > 0 ? T.red : T.green, bold: true },
                        ].map((row, i) => row === null
                          ? <hr key={i} style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '8px 0' }} />
                          : (
                            <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between',
                              padding: row.bold ? '10px 0 4px' : '7px 0',
                              borderBottom: row.bold ? 'none' : `1px solid ${T.border}`,
                              paddingLeft: row.sub ? 12 : 0 }}>
                              <span style={{ fontSize: 13, color: row.bold ? T.text : T.muted,
                                fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                              <span style={{ fontSize: row.bold ? 17 : 13, fontWeight: row.bold ? 700 : 500,
                                color: row.color }}>{peso(row.value)}</span>
                            </div>
                          )
                        )}
                        <div style={{ marginTop: 16, fontSize: 12, color: T.muted, lineHeight: 1.6,
                          background: T.bg, borderRadius: 8, padding: '10px 12px' }}>
                          {r.txCount} transactions included · Due: 20th of the following {isQuarterly ? 'quarter-end month' : 'month'}.
                          Always verify with actual BIR-prescribed forms before filing.
                        </div>
                      </Card>

                      {/* ── 2550Q/2550M Pre-fill Table ── */}
                      {['2550M', '2550Q'].includes(effectiveBirType) && (() => {
                        const p = compute2550Prefill(txns, birYear, isQuarterly ? qStart : birMonth, isQuarterly);
                        const formLabel = effectiveBirType === '2550Q' ? '2550Q' : '2550M';
                        const row = (item, label, value, opts = {}) => (
                          <div key={item} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                            padding: '7px 0',
                            borderBottom: opts.last ? 'none' : `1px solid ${T.border}`,
                            paddingLeft: opts.indent ? 16 : 0,
                            background: opts.highlight ? '#f0f7ff' : 'transparent',
                            marginLeft: opts.indent ? 0 : 0,
                          }}>
                            <span style={{ fontSize: 12, color: opts.bold ? T.text : T.muted,
                              fontWeight: opts.bold ? 700 : 400 }}>
                              <span style={{ fontFamily: 'monospace', color: T.accent, marginRight: 8,
                                fontSize: 11, fontWeight: 600 }}>{item}</span>
                              {label}
                            </span>
                            <span style={{ fontSize: opts.bold ? 15 : 13, fontWeight: opts.bold ? 700 : 500,
                              color: opts.color || T.text }}>{peso(value)}</span>
                          </div>
                        );
                        return (
                          <Card style={{ maxWidth: 540, marginTop: 16 }}>
                            <SectionHead>BIR Form {formLabel} — Pre-filled Values</SectionHead>
                            <div style={{ fontSize: 12, color: T.muted, marginBottom: 14, fontStyle: 'italic' }}>
                              Derived from {p.txCount} transaction{p.txCount !== 1 ? 's' : ''}. Verify with your CPA before filing.
                            </div>

                            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                              letterSpacing: 1, marginBottom: 6 }}>Part IV — Sales / Receipts</div>
                            {row('31A', 'Taxable Sales — VAT-exclusive Net', p.item31A, { color: T.text })}
                            {row('31B', 'Output VAT Due (12%)', p.item31B, { color: T.orange })}
                            {row('32A', 'Zero-Rated Sales / Receipts', p.item32A, { color: T.text })}
                            {row('33A', 'Exempt Sales / Receipts', p.item33A, { color: T.text })}
                            {row('34', 'Total Sales / Receipts (31A + 32A + 33A)', p.item34, { bold: true })}

                            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
                              letterSpacing: 1, margin: '14px 0 6px' }}>Part IV — Purchases</div>
                            {row('44A', 'Domestic Purchases — Gross Amount', p.item44A, { color: T.text })}
                            {row('44B', 'Allowable Input VAT (from vatable purchases)', p.item44B, { color: T.accent })}

                            <div style={{ borderTop: `2px solid ${T.border}`, marginTop: 10, paddingTop: 10 }}>
                              {p.vatPayable > 0
                                ? row('61', 'Net VAT Payable (31B − 44B)', p.vatPayable,
                                    { bold: true, color: T.red, last: true })
                                : row('—', 'Excess Input VAT (carry forward)', p.excessInput,
                                    { bold: true, color: T.green, last: true })
                              }
                            </div>

                            {(p.item32A > 0 || p.item33A > 0) && (
                              <div style={{ marginTop: 12, fontSize: 12, color: T.muted, lineHeight: 1.5,
                                background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
                                padding: '8px 12px' }}>
                                ⚠ Zero-rated / exempt transactions detected. Attach Schedules as required by BIR before filing.
                              </div>
                            )}
                          </Card>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* ── 2307 — EWT Certificates to Issue (quarterly) ── */}
                {(() => {
                  const qMths = [qStart, qStart + 1, qStart + 2];
                  const ewtTxns = txns.filter(t => {
                    const d = new Date(t.createdAt);
                    return d.getFullYear() === birYear
                      && qMths.includes(d.getMonth() + 1)
                      && t.type === 'expense'
                      && (t.ewtAmount || 0) > 0;
                  });
                  if (!ewtTxns.length) return null;

                  // Build ATC map
                  const ewtRates2307 = siteSettings.ewtRates || DEFAULT_EWT_RATES;
                  const ATC_MAP2307 = {};
                  ewtRates2307.forEach(r => { ATC_MAP2307[r.rate] = { atc: r.atc, description: r.description }; });

                  // Group by payee — track months + ATCs for certificate generation
                  const byPayee = {};
                  ewtTxns.forEach(t => {
                    const key  = t.counterpartyTin || ('__' + (t.counterpartyName || ''));
                    const name = t.counterpartyName || '(no payee name)';
                    const mo   = new Date(t.createdAt).getMonth() + 1;
                    const mIdx = qMths.indexOf(mo);
                    if (!byPayee[key]) byPayee[key] = {
                      name, tin: t.counterpartyTin || '', address: t.counterpartyAddress || '',
                      months: [0,0,0], totalPayments: 0, totalEWT: 0, atcs: {}
                    };
                    const netAmt = t.net || t.amount_net || 0;
                    byPayee[key].months[mIdx] = Math.round((byPayee[key].months[mIdx] + netAmt) * 100) / 100;
                    byPayee[key].totalPayments = Math.round((byPayee[key].totalPayments + netAmt) * 100) / 100;
                    byPayee[key].totalEWT      = Math.round((byPayee[key].totalEWT + (t.ewtAmount || 0)) * 100) / 100;
                    // ATC breakdown
                    const rate = parseFloat(t.ewtRate);
                    const info = ATC_MAP2307[rate] || { atc: `WC${String(Math.round(rate*100)).padStart(3,'0')}`, description: `EWT ${(rate*100).toFixed(0)}%` };
                    const atcKey = info.atc;
                    byPayee[key].atcs[atcKey] = byPayee[key].atcs[atcKey] || { ...info, rate, base: 0, ewt: 0, m1: 0, m2: 0, m3: 0 };
                    byPayee[key].atcs[atcKey].base = Math.round((byPayee[key].atcs[atcKey].base + netAmt) * 100) / 100;
                    byPayee[key].atcs[atcKey].ewt  = Math.round((byPayee[key].atcs[atcKey].ewt + (t.ewtAmount || 0)) * 100) / 100;
                    // per-ATC monthly amounts for 2307 certificate columns
                    if (mIdx === 0) byPayee[key].atcs[atcKey].m1 = Math.round((byPayee[key].atcs[atcKey].m1 + netAmt) * 100) / 100;
                    if (mIdx === 1) byPayee[key].atcs[atcKey].m2 = Math.round((byPayee[key].atcs[atcKey].m2 + netAmt) * 100) / 100;
                    if (mIdx === 2) byPayee[key].atcs[atcKey].m3 = Math.round((byPayee[key].atcs[atcKey].m3 + netAmt) * 100) / 100;
                  });
                  const payees = Object.values(byPayee).sort((a,b) => b.totalEWT - a.totalEWT);
                  const grandPayments = Math.round(payees.reduce((s,p) => s + p.totalPayments, 0) * 100) / 100;
                  const grandEWT      = Math.round(payees.reduce((s,p) => s + p.totalEWT, 0) * 100) / 100;

                  const qNum2307   = qMths[0] <= 3 ? 1 : qMths[0] <= 6 ? 2 : qMths[0] <= 9 ? 3 : 4;
                  const qLabel2307 = `Q${qNum2307} ${birYear}`;
                  const mLabel = (m) => m ? new Date(birYear, m - 1).toLocaleString('en-PH', { month: 'short' }) : '—';
                  const qMonthLabels = qMths.map(m => mLabel(m));

                  const printOne = async (p) => {
                    try {
                      const bytes = await generate2307PDF({
                        payee: p, client: active, period: qLabel2307,
                        atcList: Object.values(p.atcs),
                      });
                      download2307PDF(bytes, `BIR_2307_${(p.name||'payee').replace(/[^a-zA-Z0-9]/g,'_')}_${qLabel2307.replace(/\s+/g,'_')}.pdf`);
                    } catch(e) {
                      console.error('2307 PDF error:', e);
                      alert('Failed to generate 2307 PDF. See console for details.');
                    }
                  };
                  const printAll = async () => {
                    try {
                      const bytes = await generateAll2307PDF(
                        payees.map(p => ({ ...p, atcList: Object.values(p.atcs) })),
                        { client: active, period: qLabel2307 }
                      );
                      download2307PDF(bytes, `BIR_2307_ALL_${qLabel2307.replace(/\s+/g,'_')}.pdf`);
                    } catch(e) {
                      console.error('2307 PDF error:', e);
                      alert('Failed to generate 2307 PDFs. See console for details.');
                    }
                  };

                  return (
                    <Card style={{ marginTop: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
                        <SectionHead style={{ margin: 0 }}>BIR Form 2307 — EWT Certificates to Issue · {qLabel2307}</SectionHead>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: T.muted, fontStyle: 'italic' }}>
                            {payees.length} payee{payees.length !== 1 ? 's' : ''} · {ewtTxns.length} transaction{ewtTxns.length !== 1 ? 's' : ''}
                          </span>
                          <Btn size="sm" variant="neutral" onClick={printAll}>⬇ Print All ({payees.length})</Btn>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
                        One 2307 must be issued per payee per quarter. Issue within 20 days after the end of the quarter.
                      </div>

                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ background: T.bg }}>
                              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: T.muted, borderBottom: `2px solid ${T.border}` }}>Payee / Vendor</th>
                              <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: T.muted, borderBottom: `2px solid ${T.border}` }}>TIN</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: T.muted, borderBottom: `2px solid ${T.border}` }}>{mLabel(qMths[0])}</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: T.muted, borderBottom: `2px solid ${T.border}` }}>{mLabel(qMths[1])}</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: T.muted, borderBottom: `2px solid ${T.border}` }}>{mLabel(qMths[2])}</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: T.muted, borderBottom: `2px solid ${T.border}` }}>Total Payments</th>
                              <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: T.orange, borderBottom: `2px solid ${T.border}` }}>EWT Withheld</th>
                              <th style={{ padding: '8px 10px', borderBottom: `2px solid ${T.border}` }}></th>
                            </tr>
                          </thead>
                          <tbody>
                            {payees.map((p, i) => (
                              <tr key={p.name} style={{ background: i % 2 === 0 ? 'transparent' : T.bg }}>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, fontWeight: 500 }}>{p.name}</td>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, color: T.muted, fontFamily: 'monospace', fontSize: 11 }}>{p.tin || '—'}</td>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, textAlign: 'right', color: p.months[0] ? T.text : T.muted }}>{p.months[0] ? peso(p.months[0]) : '—'}</td>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, textAlign: 'right', color: p.months[1] ? T.text : T.muted }}>{p.months[1] ? peso(p.months[1]) : '—'}</td>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, textAlign: 'right', color: p.months[2] ? T.text : T.muted }}>{p.months[2] ? peso(p.months[2]) : '—'}</td>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, textAlign: 'right' }}>{peso(p.totalPayments)}</td>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, textAlign: 'right', fontWeight: 700, color: T.orange }}>{peso(p.totalEWT)}</td>
                                <td style={{ padding: '7px 10px', borderBottom: `1px solid ${T.border}`, textAlign: 'right' }}>
                                  <Btn size="sm" variant="neutral" onClick={() => printOne(p)}>⬇ 2307</Btn>
                                </td>
                              </tr>
                            ))}
                            <tr style={{ background: T.bg, fontWeight: 700 }}>
                              <td colSpan={5} style={{ padding: '8px 10px', borderTop: `2px solid ${T.border}`, color: T.text }}>Grand Total</td>
                              <td style={{ padding: '8px 10px', borderTop: `2px solid ${T.border}`, textAlign: 'right' }}>{peso(grandPayments)}</td>
                              <td style={{ padding: '8px 10px', borderTop: `2px solid ${T.border}`, textAlign: 'right', color: T.orange }}>{peso(grandEWT)}</td>
                              <td style={{ padding: '8px 10px', borderTop: `2px solid ${T.border}` }}></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <div style={{ marginTop: 12, fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                        * Income payments = net amount paid (ex-VAT). EWT withheld = amount deducted from payment.
                        Confirm payee TIN and ATC before issuing the signed certificate.
                      </div>
                    </Card>
                  );
                })()}

                {/* ── 2000-OT DST Calculator ── */}
                <DST2000OTCalc />
                {/* ── 1601-FQ Final WHT Quarterly ── */}
                <FWT1601FQCalc birYear={birYear} birQuarter={itQuarter} />
              </div>
            );
          })()
        )}

        {/* ════════════ ALPHALIST ════════════ */}
        {tab === 'Alphalist' && active && (
  !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Alphalist of Payees — {active.tradeName}</h2>
      <div style={{ display: 'flex', gap: 8 }}>
        <Btn size="sm" variant="neutral" onClick={() => {
          const rows = computeAlphalist(txns, alphaYear, alphaQ);
          const periodLbl = alphaQ === 0 ? `Full Year ${alphaYear}` : `Q${alphaQ} ${alphaYear}`;
          const bodyHtml = buildAlphalistHtml({ rows, clientName: active.tradeName, period: periodLbl });
          printReport({
            title: `Alphalist of Payees — ${active.tradeName}`,
            subtitle: periodLbl,
            bodyHtml,
            firmLabel: firmName || 'MyLedger by Kaiman & Co.',
            accentColor: brandAccent,
          });
        }}>⬇ Export PDF</Btn>
        <Btn size="sm" variant="neutral" onClick={() => {
          const rows = computeAlphalist(txns, alphaYear, alphaQ);
          const periodLbl = alphaQ === 0 ? `Full_Year_${alphaYear}` : `Q${alphaQ}_${alphaYear}`;
          const headers = ['TIN','Vendor/Payee','Address','Tx Count','Net Purchases','Input VAT','Gross Purchases','EWT Withheld'];
          const csvRows = rows.map(r => [r.tin, r.name, r.address, r.txCount, r.net, r.vat, r.gross, r.ewt]);
          const csv = [headers, ...csvRows].map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url;
          a.download = `Alphalist_${active.tradeName.replace(/\s+/g,'_')}_${periodLbl}.csv`;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }}>⬇ CSV</Btn>
      </div>
    </div>
    <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
      Expense transactions grouped by vendor for BIR Alphalist of Payees (1604-EQ Annex).
    </div>

    {/* Period picker */}
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Fld label="Year">
          <input style={{ ...inp, width: 90 }} type="number" value={alphaYear}
            onChange={e => setAlphaYear(Number(e.target.value))} min={2020} max={2099} />
        </Fld>
        <Fld label="Quarter">
          <select style={{ ...inp, width: 160 }} value={alphaQ}
            onChange={e => setAlphaQ(Number(e.target.value))}>
            <option value={0}>All Quarters</option>
            <option value={1}>Q1 (Jan–Mar)</option>
            <option value={2}>Q2 (Apr–Jun)</option>
            <option value={3}>Q3 (Jul–Sep)</option>
            <option value={4}>Q4 (Oct–Dec)</option>
          </select>
        </Fld>
      </div>
    </Card>

    {(() => {
      const rows = computeAlphalist(txns, alphaYear, alphaQ);
      const withTin    = rows.filter(r => r.tin !== '—');
      const withoutTin = rows.filter(r => r.tin === '—');
      const ewtRows    = withTin.filter(r => r.ewt > 0);
      const periodLbl  = alphaQ === 0 ? `Full Year ${alphaYear}` : `Q${alphaQ} ${alphaYear}`;

      if (rows.length === 0) return (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div>No expense transactions found for {periodLbl}.</div>
        </div>
      );

      const AlphaTable = ({ data, title, showEWT = false }) => (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10 }}>{title}</div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: T.bg }}>
                    {['TIN','Vendor / Payee','Address','Tx','Net Purchases','Input VAT','Gross Purchases', ...(showEWT ? ['EWT Withheld'] : [])].map((h, i) => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: i >= 3 ? 'right' : 'left',
                        fontWeight: 600, color: T.muted, fontSize: 10, borderBottom: `1px solid ${T.border}`,
                        whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((r, i) => (
                    <tr key={i} style={{ borderBottom: i < data.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                      <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 11,
                        color: r.tin !== '—' ? T.text : T.muted }}>{r.tin}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 500 }}>{r.name}</td>
                      <td style={{ padding: '9px 12px', color: T.muted, fontSize: 11, maxWidth: 160 }}>{r.address}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.muted }}>{r.txCount}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right' }}>{peso(r.net)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: T.orange }}>{peso(r.vat)}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>{peso(r.gross)}</td>
                      {showEWT && <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: T.red }}>{r.ewt > 0 ? peso(r.ewt) : <span style={{ color: T.muted }}>—</span>}</td>}
                    </tr>
                  ))}
                  <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                    <td colSpan={3} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: T.muted }}>TOTAL</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{data.reduce((s, r) => s + r.txCount, 0)}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{peso(data.reduce((s, r) => s + r.net, 0))}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: T.orange }}>{peso(data.reduce((s, r) => s + r.vat, 0))}</td>
                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700 }}>{peso(data.reduce((s, r) => s + r.gross, 0))}</td>
                    {showEWT && <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: T.red }}>{peso(data.reduce((s, r) => s + r.ewt, 0))}</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      );

      return (
        <div>
          {withTin.length > 0    && <AlphaTable data={withTin}    title={`${withTin.length} vendors with TIN — Alphalist reportable (${periodLbl})`} showEWT={true} />}
          {withoutTin.length > 0 && <AlphaTable data={withoutTin} title={`${withoutTin.length} vendors without TIN — needs follow-up`} showEWT={false} />}

          {/* 2307 Generator — only show if there are EWT transactions */}
          {ewtRows.length > 0 && (
            <Card style={{ marginBottom: 20, borderLeft: `4px solid ${T.orange}` }}>
              <SectionHead>BIR Form 2307 — Certificates of Creditable Tax Withheld</SectionHead>
              <div style={{ fontSize: 13, color: T.muted, marginBottom: 14 }}>
                Generate a Certificate of Creditable Tax Withheld at Source (BIR Form 2307) for each payee
                from whom EWT was withheld during {periodLbl}. Issue these to your vendors — they use it to claim tax credits.
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Btn onClick={async () => {
                  // Build ATC_MAP from admin-configurable settings (fallback to defaults)
                  const ewtRatesList2307 = siteSettings.ewtRates || DEFAULT_EWT_RATES;
                  const ATC_MAP = {};
                  ewtRatesList2307.forEach(r => { ATC_MAP[r.rate] = { atc: r.atc, description: r.description }; });
                  const qNum = alphaQ || Math.ceil((new Date().getMonth() + 1) / 3);
                  const qEnd = ['March','June','September','December'][qNum - 1];
                  const qLabel = `Q${qNum} ${alphaYear}`;
                  const qMths = alphaQ === 0
                    ? [1,2,3,4,5,6,7,8,9,10,11,12]
                    : [(alphaQ-1)*3+1, (alphaQ-1)*3+2, (alphaQ-1)*3+3];

                  // Filter EWT txns for this period
                  const ewtTxns = txns.filter(t => {
                    const d = new Date(t.createdAt);
                    return d.getFullYear() === alphaYear && qMths.includes(d.getMonth()+1)
                      && t.type === 'expense' && parseFloat(t.ewtRate) > 0 && t.ewtAmount > 0;
                  });

                  // Group by payee, tracking per-ATC monthly amounts for the 3-column table
                  const byPayee = {};
                  ewtTxns.forEach(t => {
                    const d   = new Date(t.createdAt);
                    const key = t.counterpartyTin || ('__'+t.counterpartyName);
                    if (!byPayee[key]) byPayee[key] = {
                      tin: t.counterpartyTin || '',
                      name: t.counterpartyName || 'Unknown Vendor',
                      address: t.counterpartyAddress || '',
                      atcs: {}
                    };
                    const rate   = parseFloat(t.ewtRate);
                    const info   = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate*100)).padStart(3,'0')}`, description: `EWT ${(rate*100).toFixed(0)}%` };
                    const atcKey = info.atc;
                    byPayee[key].atcs[atcKey] = byPayee[key].atcs[atcKey] || { ...info, rate, base: 0, ewt: 0, m1: 0, m2: 0, m3: 0 };
                    const net  = t.net || t.amount_net || 0;
                    const mIdx = qMths.indexOf(d.getMonth() + 1);
                    byPayee[key].atcs[atcKey].base = Math.round((byPayee[key].atcs[atcKey].base + net) * 100) / 100;
                    byPayee[key].atcs[atcKey].ewt  = Math.round((byPayee[key].atcs[atcKey].ewt  + (t.ewtAmount || 0)) * 100) / 100;
                    if (mIdx === 0) byPayee[key].atcs[atcKey].m1 = Math.round((byPayee[key].atcs[atcKey].m1 + net) * 100) / 100;
                    if (mIdx === 1) byPayee[key].atcs[atcKey].m2 = Math.round((byPayee[key].atcs[atcKey].m2 + net) * 100) / 100;
                    if (mIdx === 2) byPayee[key].atcs[atcKey].m3 = Math.round((byPayee[key].atcs[atcKey].m3 + net) * 100) / 100;
                  });

                  const payees = Object.values(byPayee);
                  try {
                    const bytes = await generateAll2307PDF(
                      payees.map(p => ({ ...p, atcList: Object.values(p.atcs) })),
                      { client: active, period: qLabel }
                    );
                    download2307PDF(bytes, `BIR_2307_ALL_${qLabel.replace(/\s+/g,'_')}.pdf`);
                  } catch(e) {
                    console.error('2307 PDF error:', e);
                    alert('Failed to generate PDF. See console for details.');
                  }
                }}>⬇ Print All 2307s ({ewtRows.length} payee{ewtRows.length!==1?'s':''})</Btn>
              </div>
            </Card>
          )}
        </div>
      );
    })()}
  </div>
)}

        {/* ════════════ AUDIT LOG ════════════ */}
        {tab === 'Audit Log' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Audit Log — {active.tradeName}</h2>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {teamStaff.length > 0 && (
                  <select value={auditStaffFilter} onChange={e => {
                    const val = e.target.value;
                    setAuditStaffFilter(val);
                    loadAudit(val);
                  }} style={{ ...inp, fontSize: 12, padding: '5px 10px', minWidth: 140 }}>
                    <option value="">All staff</option>
                    {teamStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                <Btn size="sm" variant="ghost" onClick={() => loadAudit()}>↻ Refresh</Btn>
              </div>
            </div>
            {auditLoad ? <div style={{ color: T.muted }}>Loading…</div>
            : auditEntries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div>No audit entries yet. Actions will be logged here.</div>
              </div>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.bg }}>
                      {['Timestamp', 'Action', 'Entity', 'Detail', ...(teamStaff.length > 0 ? ['Staff'] : [])].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                          color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < auditEntries.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                        <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(e.timestamp).toLocaleString('en-PH')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            background: e.action.includes('VOID') ? '#fff0f0' : e.action.includes('LOCK') ? '#fff8ec' : T.accentL,
                            color: e.action.includes('VOID') ? T.red : e.action.includes('LOCK') ? T.orange : T.accent,
                            padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                          }}>{e.action.replace(/_/g, ' ')}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12 }}>{e.entity}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>{e.detail || '—'}</td>
                        {teamStaff.length > 0 && (
                          <td style={{ padding: '10px 14px', fontSize: 12, color: T.muted }}>
                            {e.staffName || '—'}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        )}

        {/* ════════════ PERIOD LOCK ════════════ */}
        {tab === 'Period Lock' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div style={{ maxWidth: 640 }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 600 }}>Period Locking — {active.tradeName}</h2>
            <p style={{ color: T.muted, fontSize: 13, marginBottom: 24 }}>
              Locked periods block new transactions and voids. Required for CAS compliance.
            </p>

            <Card style={{ marginBottom: 20 }}>
              <SectionHead>Lock a Period</SectionHead>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="month" value={lockInput} onChange={e => setLockInput(e.target.value)}
                  style={{ ...inp, width: 180 }} />
                <Btn onClick={handleLock}>🔒 Lock</Btn>
              </div>
              {lockMsg && <div style={{ marginTop: 10, fontSize: 13, color: lockMsg.startsWith('✅') || lockMsg.startsWith('🔓') ? T.green : T.red }}>{lockMsg}</div>}
            </Card>

            <Card>
              <SectionHead>Locked Periods</SectionHead>
              {periodsLoad ? <div style={{ color: T.muted }}>Loading…</div>
              : periods.length === 0 ? (
                <div style={{ color: T.muted, fontSize: 13, padding: '12px 0' }}>No locked periods.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      {['Period', 'Locked At', ''].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600,
                          color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {periods.map((p, i) => (
                      <tr key={p.id} style={{ borderBottom: i < periods.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                          🔒 {p.period}
                        </td>
                        <td style={{ padding: '10px 12px', color: T.muted, fontSize: 12 }}>{fmtDt(p.lockedAt)}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <Btn size="sm" variant="ghost" onClick={() => handleUnlock(p.period)}>🔓 Unlock</Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        )}

        {/* ════════════ COA ════════════ */}
        {tab === 'COA' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Chart of Accounts — {active.tradeName}</h2>
              <div style={{ display: 'flex', gap: 10 }}>
                {coaData.length === 0 && (
                  <Btn variant="ghost" size="sm" onClick={handleSeedCOA}>🌱 Seed Standard PH COA</Btn>
                )}
                <Btn size="sm" onClick={() => setShowAddAcct(true)}>+ Add Account</Btn>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <input placeholder="Search accounts…" value={coaFilter} onChange={e => setCoaFilter(e.target.value)}
                style={{ ...inp, maxWidth: 320 }} />
            </div>

            {coaLoad ? <div style={{ color: T.muted }}>Loading…</div>
            : coaData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📒</div>
                <div style={{ marginBottom: 12 }}>No chart of accounts yet.</div>
                <Btn onClick={handleSeedCOA}>🌱 Seed Standard PH COA</Btn>
              </div>
            ) : (
              ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'].map(cat => {
                const accts = coaData.filter(a => a.category === cat &&
                  (!coaFilter || a.name.toLowerCase().includes(coaFilter.toLowerCase()) || a.code.includes(coaFilter)));
                if (accts.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 20 }}>
                    <SectionHead>{cat}</SectionHead>
                    <Card style={{ padding: 0, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: T.bg }}>
                            {['Code', 'Account Name', 'Normal Balance', 'Type', ''].map(h => (
                              <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600,
                                color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {accts.map((a, i) => (
                            <tr key={a.id} style={{ borderBottom: i < accts.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                              <td style={{ padding: '10px 14px', fontWeight: 600, color: T.accent, fontSize: 12 }}>{a.code}</td>
                              <td style={{ padding: '10px 14px' }}>{a.name}</td>
                              <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12 }}>
                                <span style={{ background: a.normalBalance === 'debit' ? '#e3f7ed' : '#fff0f0',
                                  color: a.normalBalance === 'debit' ? T.green : T.red,
                                  padding: '2px 8px', borderRadius: 5, fontSize: 11 }}>
                                  {a.normalBalance}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12 }}>
                                <span style={{ background: a.type === 'system' ? T.bg : '#f5f0ff',
                                  color: a.type === 'system' ? T.muted : T.purple,
                                  padding: '2px 7px', borderRadius: 5, fontSize: 11 }}>
                                  {a.type}
                                </span>
                              </td>
                              <td style={{ padding: '10px 14px' }}>
                                {a.type === 'custom' && (
                                  <button onClick={() => handleDeleteAccount(a.id)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer',
                                      color: T.red, fontSize: 13 }}>✕</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  </div>
                );
              })
            )}

            {showAddAcct && (
              <ModalShell title="Add Account" onClose={() => setShowAddAcct(false)}>
                <Fld label="Account Code">
                  <input style={inp} value={newAcct.code} onChange={e => setNewAcct(p => ({ ...p, code: e.target.value }))} placeholder="e.g. 1300" />
                </Fld>
                <Fld label="Account Name">
                  <input style={inp} value={newAcct.name} onChange={e => setNewAcct(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Prepaid Insurance" />
                </Fld>
                <Fld label="Category">
                  <select style={inp} value={newAcct.category} onChange={e => setNewAcct(p => ({ ...p, category: e.target.value }))}>
                    {['Assets','Liabilities','Equity','Income','Expenses'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </Fld>
                <Fld label="Normal Balance">
                  <select style={inp} value={newAcct.normalBalance} onChange={e => setNewAcct(p => ({ ...p, normalBalance: e.target.value }))}>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </Fld>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                  <Btn variant="ghost" onClick={() => setShowAddAcct(false)}>Cancel</Btn>
                  <Btn onClick={handleAddAccount}>Add Account</Btn>
                </div>
              </ModalShell>
            )}
          </div>
        )}

        {/* ════════════ GENERAL JOURNAL ════════════ */}
        {tab === 'General Journal' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>General Journal — {active.tradeName}</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="date" value={gjFrom} onChange={e => setGjFrom(e.target.value)} style={{ ...inp, width: 150 }} />
                <span style={{ color: T.muted, fontSize: 13 }}>to</span>
                <input type="date" value={gjTo} onChange={e => setGjTo(e.target.value)} style={{ ...inp, width: 150 }} />
                <Btn size="sm" onClick={() => loadGJ(gjFrom, gjTo)}>Refresh</Btn>
                {gjData && gjData.entries.length > 0 && (
                  <Btn size="sm" variant="neutral" onClick={() => {
                    const date = new Date().toISOString().substring(0, 10);
                    let path = `/reports/general-journal?clientId=${active.id}`;
                    if (gjFrom) path += `&from=${gjFrom}`;
                    if (gjTo)   path += `&to=${gjTo}`;
                    downloadCSV(path, `general_journal_${active.tradeName}_${date}.csv`);
                  }}>⬇ CSV</Btn>
                )}
              </div>
            </div>
            {gjLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : !gjData ? null
            : gjData.entries.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>No entries for this period.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {gjData.entries.map((je, i) => (
                  <Card key={je.id + i} style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{je.description}</span>
                        {je.referenceNo && <span style={{ marginLeft: 10, fontSize: 12, color: T.muted,
                          background: T.bg, padding: '2px 8px', borderRadius: 5 }}>{je.referenceNo}</span>}
                        <span style={{ marginLeft: 10, fontSize: 11, color: T.muted, background: je.source === 'manual' ? '#f5f0ff' : T.accentL,
                          padding: '2px 7px', borderRadius: 5 }}>{je.source === 'manual' ? 'Manual JE' : 'Transaction'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: T.muted }}>{je.date}</div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {['Account','Debit','Credit'].map(h => (
                            <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Account' ? 'left' : 'right',
                              fontWeight: 600, color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {je.entries.map((e, j) => (
                          <tr key={j} style={{ borderBottom: j < je.entries.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                            <td style={{ padding: '7px 10px', paddingLeft: e.debit === 0 ? 30 : 10 }}>{e.account}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 500 }}>
                              {e.debit > 0 ? peso(e.debit) : '—'}</td>
                            <td style={{ padding: '7px 10px', textAlign: 'right', color: T.muted }}>
                              {e.credit > 0 ? peso(e.credit) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Card>
                ))}
                <div style={{ textAlign: 'right', fontSize: 12, color: T.muted, padding: '6px 0' }}>
                  {gjData.count} entries · {gjData.period}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ GENERAL LEDGER ════════════ */}
        {tab === 'General Ledger' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>General Ledger — {active.tradeName}</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input placeholder="Filter account…" value={glAccount} onChange={e => setGlAccount(e.target.value)}
                  style={{ ...inp, width: 180 }} />
                <input type="date" value={glFrom} onChange={e => setGlFrom(e.target.value)} style={{ ...inp, width: 150 }} />
                <span style={{ color: T.muted, fontSize: 13 }}>to</span>
                <input type="date" value={glTo} onChange={e => setGlTo(e.target.value)} style={{ ...inp, width: 150 }} />
                <Btn size="sm" onClick={() => loadGL(glFrom, glTo, glAccount)}>Refresh</Btn>
                {glData && glData.accounts.length > 0 && (
                  <Btn size="sm" variant="neutral" onClick={() => {
                    const date = new Date().toISOString().substring(0, 10);
                    let path = `/reports/general-ledger?clientId=${active.id}`;
                    if (glFrom)    path += `&from=${glFrom}`;
                    if (glTo)      path += `&to=${glTo}`;
                    if (glAccount) path += `&account=${encodeURIComponent(glAccount)}`;
                    downloadCSV(path, `general_ledger_${active.tradeName}_${date}.csv`);
                  }}>⬇ CSV</Btn>
                )}
              </div>
            </div>
            {glLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : !glData ? null
            : glData.accounts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>No accounts found.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {glData.accounts.map(acct => (
                  <Card key={acct.account} style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 18px', display: 'flex', justifyContent: 'space-between',
                      alignItems: 'center', cursor: 'pointer', background: T.bg,
                      borderBottom: glExpanded[acct.account] ? `1px solid ${T.border}` : 'none' }}
                      onClick={() => setGlExpanded(p => ({ ...p, [acct.account]: !p[acct.account] }))}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{acct.account}</span>
                      <div style={{ display: 'flex', gap: 24, alignItems: 'center', fontSize: 13 }}>
                        <span style={{ color: T.muted }}>Dr: <strong>{peso(acct.totalDebit)}</strong></span>
                        <span style={{ color: T.muted }}>Cr: <strong>{peso(acct.totalCredit)}</strong></span>
                        <span style={{ color: acct.closingBalance >= 0 ? T.green : T.red, fontWeight: 700 }}>
                          Balance: {peso(Math.abs(acct.closingBalance))} {acct.closingBalance < 0 ? 'Cr' : 'Dr'}
                        </span>
                        <span style={{ color: T.muted, fontSize: 16 }}>{glExpanded[acct.account] ? '▲' : '▼'}</span>
                      </div>
                    </div>
                    {glExpanded[acct.account] && (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            {['Date','Description','Ref','Debit','Credit','Balance'].map(h => (
                              <th key={h} style={{ padding: '8px 12px', textAlign: ['Debit','Credit','Balance'].includes(h) ? 'right' : 'left',
                                fontWeight: 600, color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`, background: '#fafafa' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {acct.rows.map((row, i) => (
                            <tr key={i} style={{ borderBottom: i < acct.rows.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                              <td style={{ padding: '8px 12px', color: T.muted, whiteSpace: 'nowrap' }}>{row.date}</td>
                              <td style={{ padding: '8px 12px' }}>{row.description}</td>
                              <td style={{ padding: '8px 12px', color: T.muted, fontSize: 12 }}>{row.ref || '—'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>{row.debit > 0 ? peso(row.debit) : '—'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', color: T.muted }}>{row.credit > 0 ? peso(row.credit) : '—'}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600,
                                color: row.balance >= 0 ? T.text : T.red }}>{peso(Math.abs(row.balance))} {row.balance < 0 ? 'Cr' : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                ))}
                <div style={{ textAlign: 'right', fontSize: 12, color: T.muted, padding: '6px 0' }}>
                  {glData.accountCount} accounts · {glData.period}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ INCOME STATEMENT ════════════ */}
        {tab === 'Income Statement' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Income Statement — {active.tradeName}</h2>
              {income && (
                <Btn size="sm" variant="neutral" onClick={() => printFSReport({
                  title: 'STATEMENT OF COMPREHENSIVE INCOME',
                  entityName: active.tradeName,
                  period: income.period
                    ? `For the Period: ${income.period}`
                    : `For the Period Ended ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                  bodyHtml: buildIncomeStatementHtml(income, active.tradeName),
                  firmLabel: firmName || 'MyLedger by Kaiman & Co.',
                })}>⬇ Export PDF</Btn>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              All amounts are NET (VAT-exclusive) — correct P&amp;L basis under PFRS.
            </div>

            <Card style={{ marginBottom: 20 }}>
              <SectionHead>Date Range</SectionHead>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Fld label="From"><input style={{ ...inp, width: 160 }} type="date" value={incFrom} onChange={e => setIncFrom(e.target.value)} /></Fld>
                <Fld label="To"><input style={{ ...inp, width: 160 }} type="date" value={incTo} onChange={e => setIncTo(e.target.value)} /></Fld>
                <Btn onClick={() => loadIncome(incFrom, incTo)} style={{ marginBottom: 14 }}>Run Report</Btn>
                {(incFrom || incTo) && <Btn variant="ghost" onClick={() => { setIncFrom(''); setIncTo(''); loadIncome('', ''); }} style={{ marginBottom: 14 }}>All Periods</Btn>}
              </div>
            </Card>

            {!income ? (
              <div style={{ color: T.muted, textAlign: 'center', padding: 48 }}>
                Select a date range above and click <strong>Run Report</strong>.<br />
                <span style={{ fontSize: 12 }}>Leave dates blank to include all periods.</span>
              </div>
            ) : (() => {
              const eb       = income.expenseBreakdown || {};
              const cogsMap  = eb.cogs || {};
              const opexMap  = eb.opex || {};
              const cogsEntries = Object.entries(cogsMap).filter(([,v]) => v > 0);
              const opexEntries = Object.entries(opexMap).filter(([,v]) => v > 0);
              const hasCOGS  = (income.costOfSales || 0) > 0;
              const grossProfit = income.grossProfit ?? (income.revenue - (income.costOfSales || 0));

              const Row = ({ label, value, indent = false, bold = false, color, divider = false, section = false }) => {
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
                      <span style={{ fontSize: bold ? 18 : 14, fontWeight: bold ? 700 : 500, color: color || T.text }}>
                        {value < 0 ? `(${peso(Math.abs(value))})` : peso(value)}
                      </span>
                    )}
                  </div>
                );
              };

              return (
                <Card style={{ maxWidth: 560 }}>
                  <SectionHead>Profit &amp; Loss</SectionHead>

                  {/* REVENUES */}
                  <Row section label="Revenues" />
                  <Row label="Net Sales / Revenues" value={income.revenue} color={T.green} />
                  <Row divider />

                  {/* COST OF SALES */}
                  {hasCOGS && (<>
                    <Row section label="Cost of Sales" />
                    {cogsEntries.map(([cat, amt]) => <Row key={cat} label={cat} value={-amt} indent color={T.red} />)}
                    {cogsEntries.length > 1 && <Row label="Total Cost of Sales" value={-(income.costOfSales||0)} color={T.red} />}
                    <Row divider />
                    <Row label="Gross Profit" value={grossProfit} bold color={grossProfit >= 0 ? T.accent : T.red} />
                    <Row divider />
                  </>)}

                  {/* OPERATING EXPENSES */}
                  <Row section label="Operating Expenses" />
                  {opexEntries.length > 0
                    ? opexEntries.map(([cat, amt]) => <Row key={cat} label={cat} value={-amt} indent color={T.red} />)
                    : (!hasCOGS && income.expenses > 0 &&
                        <Row label="Total Costs and Expenses" value={-income.expenses} color={T.red} />)
                  }
                  {opexEntries.length > 1 && <Row label="Total Operating Expenses" value={-(income.operatingExpenses||0)} color={T.red} />}
                  <Row divider />

                  {/* NET PROFIT */}
                  <Row label={income.profit >= 0 ? 'Net Profit' : 'Net Loss'} value={income.profit}
                    bold color={income.profit >= 0 ? T.accent : T.red} />

                  <div style={{ marginTop: 16, fontSize: 12, color: T.muted, fontStyle: 'italic' }}>{income.note}</div>
                </Card>
              );
            })()}
          </div>
        )}

        {/* ════════════ BALANCE SHEET ════════════ */}
        {tab === 'Balance Sheet' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Statement of Financial Position — {active.tradeName}</h2>
              {balance && (
                <Btn size="sm" variant="neutral" onClick={() => printFSReport({
                  title: 'STATEMENT OF FINANCIAL POSITION',
                  entityName: active.tradeName,
                  period: `As of ${balance.asOf
                    ? new Date(balance.asOf).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
                    : new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                  bodyHtml: buildBalanceSheetHtml(balance, active.tradeName),
                  firmLabel: firmName || 'MyLedger by Kaiman & Co.',
                })}>⬇ Export PDF</Btn>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              Derived from transaction settlements and VAT accounts. All amounts VAT-exclusive.
            </div>

            <Card style={{ marginBottom: 20 }}>
              <SectionHead>As-of Date</SectionHead>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <Fld label="As Of"><input style={{ ...inp, width: 160 }} type="date" value={balAsOf} onChange={e => setBalAsOf(e.target.value)} /></Fld>
                <Btn onClick={() => loadBalance(balAsOf)} style={{ marginBottom: 14 }}>Run Report</Btn>
                {balAsOf && <Btn variant="ghost" onClick={() => { setBalAsOf(''); loadBalance(''); }} style={{ marginBottom: 14 }}>Today</Btn>}
              </div>
            </Card>

            {!balance ? (
              <div style={{ color: T.muted, textAlign: 'center', padding: 48 }}>
                Select a date above and click <strong>Run Report</strong>.<br />
                <span style={{ fontSize: 12 }}>Leave blank to see the current balance.</span>
              </div>
            ) : (() => {
              const a = balance.assets || {};
              const l = balance.liabilities || {};
              const totalCurrentAssets = (a.input_vat || 0) + (a.accounts_receivable || 0) + (a.cash_net > 0 ? a.cash_net : 0);
              const totalCurrentLiab   = (l.vat_payable || 0) + (l.accounts_payable || 0);
              const totalAssets        = totalCurrentAssets + (a.fixed_assets_net || 0);
              const netEquity          = totalAssets - totalCurrentLiab;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
                  {/* ASSETS */}
                  <Card>
                    <SectionHead>Assets</SectionHead>
                    {[
                      { label: 'Cash & Cash Equivalents', value: a.cash_net,           color: T.text  },
                      { label: 'Trade Receivables (AR)',   value: a.accounts_receivable,color: T.text  },
                      { label: 'Input VAT Recoverable',    value: a.input_vat,          color: T.green },
                      { label: 'Fixed Assets (Net)',        value: a.fixed_assets_net,  color: T.text  },
                    ].filter(r => r.value > 0).map(r => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0',
                        borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                        <span style={{ color: T.muted }}>{r.label}</span>
                        <span style={{ fontWeight: 500, color: r.color }}>{peso(r.value)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px',
                      borderTop: `2px solid ${T.text}`, marginTop: 4, fontWeight: 700, fontSize: 14 }}>
                      <span>Total Assets</span>
                      <span style={{ color: T.accent }}>{peso(totalAssets)}</span>
                    </div>
                  </Card>

                  {/* LIABILITIES & EQUITY */}
                  <Card>
                    <SectionHead>Liabilities &amp; Equity</SectionHead>
                    {[
                      { label: 'Output VAT Payable',      value: l.vat_payable,       color: T.orange },
                      { label: 'Trade Payables (AP)',      value: l.accounts_payable,  color: T.text   },
                    ].filter(r => r.value > 0).map(r => (
                      <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0',
                        borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                        <span style={{ color: T.muted }}>{r.label}</span>
                        <span style={{ fontWeight: 500, color: r.color }}>{peso(r.value)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0',
                      borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                      <span style={{ color: T.muted }}>Owner's Equity / Net Income</span>
                      <span style={{ fontWeight: 500, color: netEquity >= 0 ? T.accent : T.red }}>{peso(netEquity)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0 4px',
                      borderTop: `2px solid ${T.text}`, marginTop: 4, fontWeight: 700, fontSize: 14 }}>
                      <span>Total Liab. &amp; Equity</span>
                      <span style={{ color: T.accent }}>{peso(totalCurrentLiab + netEquity)}</span>
                    </div>
                  </Card>

                  {/* Net VAT position summary */}
                  <Card style={{ gridColumn: '1 / -1' }}>
                    <SectionHead>Net VAT Position</SectionHead>
                    <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <div style={{ fontSize: 12, color: T.muted }}>Input VAT (Asset)</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.green }}>{peso(a.input_vat || 0)}</div>
                      </div>
                      <div style={{ fontSize: 20, color: T.muted }}>−</div>
                      <div>
                        <div style={{ fontSize: 12, color: T.muted }}>Output VAT (Liability)</div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.orange }}>{peso(l.vat_payable || 0)}</div>
                      </div>
                      <div style={{ fontSize: 20, color: T.muted }}>=</div>
                      <div>
                        <div style={{ fontSize: 12, color: T.muted }}>
                          {balance.net_vat_position >= 0 ? 'Net VAT Payable to BIR' : 'Net VAT Credit (refundable)'}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 700,
                          color: balance.net_vat_position >= 0 ? T.red : T.green }}>
                          {peso(Math.abs(balance.net_vat_position))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════ BOOKS ════════════ */}
        {tab === 'Books' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>Accounting Books — {active.tradeName}</h2>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              Philippine SLSP-format subsidiary books derived from transactions. Use these to verify entries and check for adjustments needed.
            </div>

            {/* Controls */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Book Type</label>
                  <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                    {['sales','purchases','receipts','disbursements'].map(bt => (
                      <button key={bt} onClick={() => {
                        setBooksType(bt); setBooksData(null);
                        loadBooksReport(bt, booksFrom, booksTo);
                      }} style={{ padding: '8px 14px', border: 'none', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        background: booksType === bt ? T.accent : T.surface,
                        color: booksType === bt ? '#fff' : T.muted }}>
                        {bt === 'sales' ? '📋 Sales' : bt === 'purchases' ? '🛒 Purchases' : bt === 'receipts' ? '💰 Receipts' : '💸 Disbursements'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>From</label>
                  <input type="date" style={{ ...inp, width: 150 }} value={booksFrom}
                    onChange={e => { setBooksFrom(e.target.value); }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>To</label>
                  <input type="date" style={{ ...inp, width: 150 }} value={booksTo}
                    onChange={e => { setBooksTo(e.target.value); }} />
                </div>
                <Btn size="sm" onClick={() => loadBooksReport(booksType, booksFrom, booksTo)}>Refresh</Btn>
                {booksData && (
                  <Btn size="sm" variant="neutral" onClick={() => {
                    const titleMap = { sales: 'Sales Book', purchases: 'Purchases Book', receipts: 'Cash Receipts Book', disbursements: 'Cash Disbursements Book' };
                    printReport({
                      title: `${titleMap[booksType]} — ${active.tradeName}`,
                      subtitle: booksData.period || '',
                      bodyHtml: buildBooksHtml({ booksType, booksData, clientName: active.tradeName }),
                      firmLabel: firmName || 'MyLedger by Kaiman & Co.',
                      accentColor: brandAccent,
                    });
                  }}>⬇ Export PDF</Btn>
                )}
                {booksData && (
                  <Btn size="sm" variant="neutral" onClick={() => {
                    const date = new Date().toISOString().substring(0, 10);
                    let path = `/reports/books?clientId=${active.id}&type=${booksType}`;
                    if (booksFrom) path += `&from=${booksFrom}`;
                    if (booksTo)   path += `&to=${booksTo}`;
                    const nameMap = { sales: 'sales_book', purchases: 'purchases_book', receipts: 'cash_receipts', disbursements: 'cash_disbursements' };
                    downloadCSV(path, `${active.tradeName}_${nameMap[booksType]}_${date}.csv`);
                  }}>⬇ CSV</Btn>
                )}
              </div>
            </Card>

            {booksLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : !booksData ? null
            : (() => {
              const rows    = booksData.rows || [];
              const totals  = booksData.totals || {};
              const titleMap = { sales: 'Sales Book', purchases: 'Purchases Book', receipts: 'Cash Receipts Book', disbursements: 'Cash Disbursements Book' };

              if (rows.length === 0) return (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📒</div>
                  <div>No entries found for this period.</div>
                </div>
              );

              // Gross/VAT/net totals from backend totals object
              const totalGross = totals.gross || totals.total || 0;
              const totalVat   = totals.outputVAT || totals.inputVAT || 0;
              const totalNet   = totals.vatable != null ? (totals.vatable + (totals.zeroRated || 0) + (totals.exempt || 0) + (totals.optSales || 0)) : (totals.vatPurchases || 0) + (totals.nonVatPurchases || 0);

              // Counterparty name: backend uses different keys per book type
              const getParty = r => r.customer || r.supplier || r.payer || r.payee || '';

              return (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{titleMap[booksType]} — {booksData.period}</div>
                    <div style={{ fontSize: 12, color: T.muted }}>{rows.length} entries</div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {BOOKS_COLUMNS[booksType].map((h, i) => (
                            <th key={h} style={{ padding: '10px 14px', textAlign: i >= BOOKS_COLUMNS[booksType].length - 3 ? 'right' : 'left',
                              fontWeight: 600, color: T.muted, fontSize: 11,
                              borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                            <td style={{ padding: '10px 14px', color: T.muted, whiteSpace: 'nowrap' }}>
                              {r.date ? new Date(r.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12 }}>{r.referenceNo || <span style={{ opacity: 0.35 }}>—</span>}</td>
                            <td style={{ padding: '10px 14px', maxWidth: 160, fontSize: 12 }}>{getParty(r) || <span style={{ color: T.muted }}>—</span>}</td>
                            <td style={{ padding: '10px 14px', maxWidth: 200 }}>{r.description}</td>
                            {(booksType === 'receipts' || booksType === 'disbursements') ? (
                              <>
                                <td style={{ padding: '10px 14px', fontSize: 12, color: T.muted }}>
                                  {SETTLEMENT_LABELS[r.settlement] || r.settlement || '—'}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600,
                                  color: booksType === 'receipts' ? T.green : T.red }}>{peso(r.total || r.gross)}</td>
                              </>
                            ) : (
                              <>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600,
                                  color: booksType === 'sales' ? T.green : T.red }}>{peso(r.gross)}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', color: T.orange }}>{peso(r.outputVAT || r.inputVAT || 0)}</td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500 }}>
                                  {peso(booksType === 'sales'
                                    ? ((r.vatable || 0) + (r.zeroRated || 0) + (r.exempt || 0) + (r.optSales || 0))
                                    : ((r.vatPurchases || 0) + (r.nonVatPurchases || 0)))}
                                </td>
                              </>
                            )}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                          <td colSpan={4} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: T.muted }}>TOTALS</td>
                          {(booksType === 'receipts' || booksType === 'disbursements') ? (
                            <>
                              <td />
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700,
                                color: booksType === 'receipts' ? T.green : T.red }}>{peso(totalGross)}</td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700,
                                color: booksType === 'sales' ? T.green : T.red }}>{peso(totalGross)}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: T.orange }}>{peso(totalVat)}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{peso(totalNet)}</td>
                            </>
                          )}
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </Card>
              );
            })()}
          </div>
        )}

        {/* ════════════ CASH FLOW ════════════ */}
        {tab === 'Cash Flow' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Cash Flow Statement — {active.tradeName}</h2>
              {cfReport && (
                <Btn size="sm" variant="neutral" onClick={() => printFSReport({
                  title: 'STATEMENT OF CASH FLOWS',
                  entityName: active.tradeName,
                  period: cfReport.period && cfReport.period !== 'All periods'
                    ? `For the Period: ${cfReport.period}`
                    : `For the Period Ended ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`,
                  bodyHtml: buildCashFlowHtml(cfReport, active.tradeName),
                  firmLabel: firmName || 'MyLedger by Kaiman & Co.',
                })}>⬇ Export PDF</Btn>
              )}
            </div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              Indirect method — starts from net income and adjusts for non-cash items. Investing section derived from asset transactions.
            </div>

            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>From</label>
                  <input type="date" style={{ ...inp, width: 150 }} value={cfFrom}
                    onChange={e => setCfFrom(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>To</label>
                  <input type="date" style={{ ...inp, width: 150 }} value={cfTo}
                    onChange={e => setCfTo(e.target.value)} />
                </div>
                <Btn size="sm" onClick={() => loadCashFlow(cfFrom, cfTo)}>Refresh</Btn>
              </div>
            </Card>

            {cfLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : !cfReport ? null
            : (() => {
              const op  = cfReport.operating || {};
              const iv  = cfReport.investing || {};
              const fi  = cfReport.financing || {};
              const net = cfReport.netCashChange ?? cfReport.netCashMovement ?? 0;

              const CfRow = ({ label, value, bold, sub, color }) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: bold ? '10px 0 4px' : '7px 0', paddingLeft: sub ? 16 : 0,
                  borderBottom: bold ? 'none' : `1px solid ${T.border}` }}>
                  <span style={{ fontSize: 13, color: bold ? T.text : T.muted, fontWeight: bold ? 700 : 400 }}>{label}</span>
                  <span style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 700 : 500,
                    color: color || (value >= 0 ? T.text : T.red) }}>
                    {value < 0 ? `(${peso(Math.abs(value))})` : peso(value)}
                  </span>
                </div>
              );

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Operating */}
                  <Card style={{ maxWidth: 600 }}>
                    <SectionHead>A. Operating Activities (Indirect Method)</SectionHead>
                    <CfRow label="Net Income / (Loss)" value={op.netIncome ?? 0} />
                    <CfRow label="Add: Depreciation & Amortization" value={op.depreciationAddBack ?? op.addDepreciation ?? 0} sub />
                    <CfRow label="Less: Increase in Accounts Receivable" value={op.arIncrease ?? 0} sub />
                    <CfRow label="Add: Increase in Accounts Payable" value={op.apIncrease ?? 0} sub />
                    <hr style={{ border: 'none', borderTop: `2px solid ${T.border}`, margin: '6px 0' }} />
                    <CfRow label="Net Cash from Operating Activities" value={op.total ?? 0}
                      bold color={(op.total ?? 0) >= 0 ? T.accent : T.red} />
                  </Card>

                  {/* Investing */}
                  <Card style={{ maxWidth: 600 }}>
                    <SectionHead>B. Investing Activities</SectionHead>
                    {(iv.assetPurchases || iv.total) !== 0
                      ? <CfRow label="Purchase of Fixed Assets" value={iv.assetPurchases ?? iv.total ?? 0} sub />
                      : <div style={{ fontSize: 13, color: T.muted, fontStyle: 'italic', marginBottom: 8 }}>No fixed asset purchases in this period.</div>}
                    <hr style={{ border: 'none', borderTop: `2px solid ${T.border}`, margin: '6px 0' }} />
                    <CfRow label="Net Cash from Investing Activities" value={iv.total ?? 0}
                      bold color={(iv.total ?? 0) >= 0 ? T.accent : T.red} />
                  </Card>

                  {/* Financing */}
                  <Card style={{ maxWidth: 600 }}>
                    <SectionHead>C. Financing Activities</SectionHead>
                    <div style={{ fontSize: 12, color: T.muted, fontStyle: 'italic', marginBottom: 10 }}>
                      Financing (loans, equity) captured via manual journal entries — post them under Journal Entries tab.
                    </div>
                    <CfRow label="Net Cash from Financing Activities" value={fi.total ?? 0}
                      bold color={(fi.total ?? 0) >= 0 ? T.accent : T.red} />
                  </Card>

                  {/* Net movement */}
                  <Card style={{ maxWidth: 600, background: net >= 0 ? '#f0fff4' : '#fff5f5',
                    border: `1px solid ${net >= 0 ? T.green : T.red}30` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>Net Cash Movement</div>
                        <div style={{ fontSize: 12, color: T.muted, marginTop: 3 }}>A + B + C · {cfReport.period || 'All periods'}</div>
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: net >= 0 ? T.green : T.red }}>
                        {net < 0 ? `(${peso(Math.abs(net))})` : peso(net)}
                      </div>
                    </div>
                  </Card>

                  {/* Direct method cross-check */}
                  {cfReport.direct && (
                    <Card style={{ maxWidth: 600, background: T.bg }}>
                      <SectionHead>Cross-check: Direct Method (Cash Settlements Only)</SectionHead>
                      <CfRow label="Cash Collected from Customers" value={cfReport.direct.cashCollected ?? 0} />
                      <CfRow label="Cash Paid to Suppliers/Employees" value={cfReport.direct.cashPaid ?? 0} />
                    </Card>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════ ASSETS ════════════ */}
        {tab === 'Assets' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>Fixed Assets — {active.tradeName}</h2>
                <div style={{ fontSize: 13, color: T.muted }}>Straight-line depreciation · Click "Lapsing" to view full schedule</div>
              </div>
              <Btn onClick={() => setShowAddAsset(true)}>+ Add Asset</Btn>
            </div>

            {assetLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : assets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏗</div>
                <div style={{ marginBottom: 8 }}>No fixed assets recorded.</div>
                <div style={{ fontSize: 13 }}>Add assets to generate depreciation schedules and improve Cash Flow accuracy.</div>
              </div>
            ) : (
              <>
                {/* Summary cards */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                  {[
                    { label: 'Total Cost',          value: assets.reduce((s, a) => s + a.cost, 0),                    color: T.text   },
                    { label: 'Accumulated Dep.',     value: assets.reduce((s, a) => s + a.accumulatedDepreciation, 0), color: T.orange },
                    { label: 'Net Book Value',        value: assets.reduce((s, a) => s + a.bookValue, 0),              color: T.accent },
                    { label: 'Monthly Dep. (total)', value: assets.filter(a => !a.fullyDepreciated).reduce((s, a) => s + a.monthlyDepreciation, 0), color: T.purple },
                  ].map(m => (
                    <div key={m.label} style={{ background: T.surface, borderRadius: T.radius,
                      padding: '18px 22px', boxShadow: T.shadow, border: `1px solid ${T.border}`,
                      flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 12, color: T.muted, marginBottom: 6 }}>{m.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: m.color }}>{peso(m.value)}</div>
                    </div>
                  ))}
                </div>

                {/* Asset table */}
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: T.bg }}>
                          {['Asset','Category','Start Date','Cost','Salvage','Useful Life','Monthly Dep.','Accum. Dep.','Book Value','Status',''].map((h, i) => (
                            <th key={h+i} style={{ padding: '10px 14px', textAlign: i >= 3 && i <= 8 ? 'right' : 'left',
                              fontWeight: 600, color: T.muted, fontSize: 11,
                              borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {assets.map((a, i) => (
                          <tr key={a.id} style={{ borderBottom: i < assets.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                            <td style={{ padding: '11px 14px', fontWeight: 600 }}>{a.name}</td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12 }}>{a.category}</td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12, whiteSpace: 'nowrap' }}>{a.startDate}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right' }}>{peso(a.cost)}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', color: T.muted }}>{peso(a.salvageValue)}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', color: T.muted }}>{a.usefulLifeMonths}mo</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', color: T.purple }}>{peso(a.monthlyDepreciation)}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', color: T.orange }}>{peso(a.accumulatedDepreciation)}</td>
                            <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 600, color: T.accent }}>{peso(a.bookValue)}</td>
                            <td style={{ padding: '11px 14px' }}>
                              {a.fullyDepreciated
                                ? <span style={{ background: '#f0f0f0', color: T.muted, fontSize: 11,
                                    fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>FULLY DEP.</span>
                                : <span style={{ background: '#e3f7ed', color: T.green, fontSize: 11,
                                    fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>ACTIVE</span>}
                            </td>
                            <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                              <button onClick={() => viewLapsing(a.id)}
                                style={{ background: T.accentL, border: 'none', color: T.accent,
                                  fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 6,
                                  cursor: 'pointer', marginRight: 6 }}>Lapsing</button>
                              <button onClick={() => deleteAssetItem(a.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                  color: T.red, fontSize: 16 }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </>
            )}
          </div>
        )}

        {/* ════════════ SLSP ════════════ */}
        {tab === 'SLSP' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>SLSP — {active.tradeName}</h2>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
              Summary List of Sales &amp; Purchases — BIR VAT Relief format. Export CSV for eBIRForms submission.
            </div>

            {/* Period picker */}
            <Card style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Year</label>
                  <select style={{ ...inp, width: 100 }} value={slspYear}
                    onChange={e => setSlspYear(Number(e.target.value))}>
                    {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Quarter</label>
                  <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                    {[1,2,3,4].map(q => (
                      <button key={q} onClick={() => setSlspQ(q)}
                        style={{ padding: '8px 18px', border: 'none', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                          background: slspQ === q ? T.accent : T.surface,
                          color: slspQ === q ? '#fff' : T.muted }}>
                        Q{q}
                      </button>
                    ))}
                  </div>
                </div>
                <Btn size="sm" onClick={() => loadSLSP(slspYear, slspQ)}>Generate</Btn>
              </div>
            </Card>

            {slspLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : !slspData ? null
            : (() => {
              const { sales, salesTotals, purchases, purchaseTotals } = slspData;
              const qLabel = `Q${slspQ} ${slspYear}`;

              const SLSPTable = ({ title, rows, cols, totals, csvHeaders, csvFilename, amountColor }) => (
                <Card style={{ marginBottom: 24, padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{title} — {qLabel}
                      <span style={{ fontWeight: 400, fontSize: 12, color: T.muted, marginLeft: 10 }}>
                        {rows.length} entr{rows.length !== 1 ? 'ies' : 'y'}
                      </span>
                    </div>
                    <Btn size="sm" variant="neutral"
                      onClick={() => exportSLSPcsv(rows, csvHeaders, csvFilename)}>
                      ⬇ Export CSV
                    </Btn>
                  </div>
                  {rows.length === 0 ? (
                    <div style={{ padding: '32px 18px', color: T.muted, textAlign: 'center' }}>
                      No transactions in this period.
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ background: T.bg }}>
                            {cols.map(c => (
                              <th key={c.key} style={{ padding: '9px 12px', textAlign: c.num ? 'right' : 'left',
                                fontWeight: 600, color: T.muted, fontSize: 10, textTransform: 'uppercase',
                                letterSpacing: '0.4px', borderBottom: `1px solid ${T.border}`,
                                whiteSpace: 'nowrap' }}>{c.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                              {cols.map(c => (
                                <td key={c.key} style={{ padding: '9px 12px', textAlign: c.num ? 'right' : 'left',
                                  color: c.num ? T.text : T.muted, fontWeight: c.bold ? 700 : 400,
                                  color: c.highlight ? amountColor : c.muted ? T.muted : T.text }}>
                                  {c.num ? peso(r[c.key]) : (r[c.key] || <span style={{ opacity: 0.3 }}>—</span>)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                            {cols.map((c, i) => (
                              <td key={c.key} style={{ padding: '9px 12px', textAlign: c.num ? 'right' : 'left',
                                fontWeight: 700, fontSize: 12, color: c.highlight ? amountColor : T.muted }}>
                                {i === 0 ? 'TOTALS' : c.num ? peso(totals[c.key] ?? 0) : ''}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </Card>
              );

              return (
                <div>
                  <SLSPTable
                    title="Summary List of Sales (SLS)"
                    rows={sales}
                    amountColor={T.green}
                    cols={[
                      { key: 'date',       label: 'Date',           muted: true },
                      { key: 'referenceNo',label: 'Ref No.',        muted: true },
                      { key: 'buyerName',  label: 'Buyer Name' },
                      { key: 'buyerTin',   label: 'Buyer TIN',      muted: true },
                      { key: 'netSales',   label: 'Net Sales',      num: true },
                      { key: 'outputVAT',  label: 'Output VAT',     num: true },
                      { key: 'grossSales', label: 'Gross Amount',   num: true, highlight: true },
                    ]}
                    totals={salesTotals}
                    csvHeaders={['date','referenceNo','buyerName','buyerTin','buyerAddr','netSales','outputVAT','grossSales','vatType']}
                    csvFilename={`SLSP-Sales-${active.tradeName}-Q${slspQ}-${slspYear}.csv`}
                  />
                  <SLSPTable
                    title="Summary List of Purchases (SLP)"
                    rows={purchases}
                    amountColor={T.orange}
                    cols={[
                      { key: 'date',          label: 'Date',           muted: true },
                      { key: 'referenceNo',   label: 'Ref No.',        muted: true },
                      { key: 'supplierName',  label: 'Supplier Name' },
                      { key: 'supplierTin',   label: 'Supplier TIN',   muted: true },
                      { key: 'netPurchases',  label: 'Net Purchases',  num: true },
                      { key: 'inputVAT',      label: 'Input VAT',      num: true },
                      { key: 'grossPurchases',label: 'Gross Amount',   num: true, highlight: true },
                    ]}
                    totals={purchaseTotals}
                    csvHeaders={['date','referenceNo','supplierName','supplierTin','supplierAddr','netPurchases','inputVAT','grossPurchases','supplierVatType']}
                    csvFilename={`SLSP-Purchases-${active.tradeName}-Q${slspQ}-${slspYear}.csv`}
                  />
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════ CONTACTS ════════════ */}
        {tab === 'Contacts' && active && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>Contacts — {active.tradeName}</h2>
                <div style={{ fontSize: 13, color: T.muted }}>Vendors and customers used for SLSP and Alphalist filing.</div>
              </div>
              <Btn onClick={() => { setEditContact(null); setShowAddCon(true); }}>+ Add Contact</Btn>
            </div>

            {/* Search bar */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="text" placeholder="Search by name, TIN, or email…"
                  value={contactQ}
                  onChange={e => setContactQ(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && loadContacts(contactQ)}
                  style={{ ...inp, flex: 1 }}
                />
                <Btn size="sm" onClick={() => loadContacts(contactQ)}>Search</Btn>
                {contactQ && (
                  <Btn size="sm" variant="neutral" onClick={() => { setContactQ(''); loadContacts(''); }}>Clear</Btn>
                )}
                <div style={{ fontSize: 13, color: T.muted, marginLeft: 6 }}>
                  {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
                </div>
              </div>
            </Card>

            {contactLoad ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div>
            : contacts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>No contacts yet</div>
                <div style={{ fontSize: 13 }}>Add vendors and customers to link them to transactions for SLSP filing.</div>
              </div>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.bg }}>
                        {['Name', 'Type', 'TIN', 'Phone', 'Email', 'Actions'].map((h, i) => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                            color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`,
                            whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((c, i) => {
                        const typeColor = c.type === 'customer' ? T.green : c.type === 'supplier' ? T.orange : T.accent;
                        const typeLabel = c.type === 'customer' ? 'Customer' : c.type === 'supplier' ? 'Supplier' : 'Both';
                        return (
                          <tr key={c.id} style={{ borderBottom: i < contacts.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                            <td style={{ padding: '11px 14px', fontWeight: 600 }}>
                              {c.name}
                              {c.address && <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{c.address}</div>}
                            </td>
                            <td style={{ padding: '11px 14px' }}>
                              <span style={{ background: `${typeColor}18`, color: typeColor, fontSize: 11,
                                fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>
                                {typeLabel}
                              </span>
                            </td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12, fontFamily: 'monospace' }}>
                              {c.tin || <span style={{ opacity: 0.35 }}>—</span>}
                            </td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12 }}>
                              {c.phone || <span style={{ opacity: 0.35 }}>—</span>}
                            </td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12 }}>
                              {c.email || <span style={{ opacity: 0.35 }}>—</span>}
                            </td>
                            <td style={{ padding: '11px 14px' }}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <Btn size="sm" variant="ghost"
                                  onClick={() => { setEditContact(c); setShowAddCon(true); }}>Edit</Btn>
                                <Btn size="sm" variant="danger"
                                  onClick={() => deleteContactItem(c.id)}>Delete</Btn>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ════════════ PAYROLL / 1601-C ════════════ */}
        {tab === 'Payroll' && active && (() => {
          const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
          const monthLabel = `${monthNames[payrollMonth]} ${payrollYear}`;

          // TRAIN Law annual WHT (same as backend, for preview)
          function annualWHT(t) {
            if (t <= 250000)  return 0;
            if (t <= 400000)  return (t - 250000) * 0.20;
            if (t <= 800000)  return 30000  + (t - 400000) * 0.25;
            if (t <= 2000000) return 130000 + (t - 800000) * 0.30;
            if (t <= 8000000) return 490000 + (t - 2000000) * 0.32;
            return 2410000 + (t - 8000000) * 0.35;
          }

          const empSetEmpForm = (k) => (e) => setEmpForm(f => ({ ...f, [k]: e.target.value }));

          async function handleSaveEmp(e) {
            e.preventDefault();
            try {
              if (editEmp) {
                await updateEmployee(editEmp.id, { ...empForm, clientId: active.id });
              } else {
                await createEmployee({ ...empForm, clientId: active.id });
              }
              setShowEmpModal(false); setEditEmp(null);
              setEmpForm({ name:'', tin:'', employmentType:'regular', monthlyBasicSalary:'', sssContribution:'', philhealthContribution:'', pagibigContribution:'', hireDate:'' });
              loadEmployees();
            } catch(err) { alert(err.message); }
          }

          async function handleDeleteEmp(id, name) {
            if (!confirm(`Remove ${name} from payroll?`)) return;
            try { await deleteEmployee(id); loadEmployees(); }
            catch(err) { alert(err.message); }
          }

          return (
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                <h2 style={{ margin:0, fontSize:22, fontWeight:600 }}>Payroll & 1601-C — {active.tradeName}</h2>
                <Btn size="sm" variant="neutral" disabled={!payrollResult} onClick={() => {
                  if (!payrollResult) return;
                  const bodyHtml = build1601CHtml({ payrollResult, client: active, monthLabel });
                  printReport({
                    title: `BIR Form 1601-C — ${active.tradeName}`,
                    subtitle: monthLabel,
                    bodyHtml,
                    firmLabel: firmName || 'MyLedger by Kaiman & Co.',
                    accentColor: brandAccent,
                  });
                }}>⬇ Export 1601-C PDF</Btn>
              </div>
              <div style={{ fontSize:13, color:T.muted, marginBottom:24 }}>
                Withholding Tax on Compensation (TRAIN Law) · BIR Form 1601-C
              </div>

              {/* Period picker */}
              <Card style={{ marginBottom:20 }}>
                <div style={{ display:'flex', gap:16, alignItems:'flex-end', flexWrap:'wrap' }}>
                  <Fld label="Month">
                    <select style={{ ...inp, width:160 }} value={payrollMonth}
                      onChange={e => setPayrollMonth(Number(e.target.value))}>
                      {monthNames.slice(1).map((n,i) => <option key={i+1} value={i+1}>{n}</option>)}
                    </select>
                  </Fld>
                  <Fld label="Year">
                    <input style={{ ...inp, width:90 }} type="number" value={payrollYear}
                      onChange={e => setPayrollYear(Number(e.target.value))} min={2020} max={2099} />
                  </Fld>
                  <Btn onClick={() => runPayroll(payrollYear, payrollMonth)} style={{ marginBottom:14 }}>
                    {payrollLoad ? 'Computing…' : 'Compute WHT'}
                  </Btn>
                </div>
              </Card>

              {/* Employee roster */}
              <Card style={{ marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <SectionHead style={{ margin:0 }}>Employee Roster ({employees.length})</SectionHead>
                  <Btn size="sm" onClick={() => {
                    setEditEmp(null);
                    setEmpForm({ name:'', tin:'', employmentType:'regular', monthlyBasicSalary:'', sssContribution:'', philhealthContribution:'', pagibigContribution:'', hireDate:'' });
                    setShowEmpModal(true);
                  }}>+ Add Employee</Btn>
                </div>
                {employees.length === 0 ? (
                  <div style={{ color:T.muted, fontSize:13, fontStyle:'italic', textAlign:'center', padding:24 }}>
                    No employees yet. Click "+ Add Employee" to get started.
                  </div>
                ) : (
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr style={{ background:T.bg }}>
                          {['Name','TIN','Type','Monthly Basic','Deductions','Monthly Taxable','Monthly WHT',''].map((h,i) => (
                            <th key={h||i} style={{ padding:'8px 10px', textAlign: i>=3&&i<=6 ? 'right':'left',
                              fontWeight:600, color:T.muted, fontSize:10, textTransform:'uppercase',
                              borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {employees.map((emp, idx) => {
                          const basic   = parseFloat(emp.monthly_basic_salary) || 0;
                          const sss     = parseFloat(emp.sss_contribution) || 0;
                          const ph      = parseFloat(emp.philhealth_contribution) || 0;
                          const pag     = parseFloat(emp.pagibig_contribution) || 0;
                          const ded     = sss + ph + pag;
                          const taxable = Math.max(0, basic - ded);
                          const annual  = taxable * 12;
                          const mWHT    = Math.round(annualWHT(annual) / 12 * 100) / 100;
                          return (
                            <tr key={emp.id} style={{ borderBottom: idx < employees.length-1 ? `1px solid ${T.border}` : 'none' }}>
                              <td style={{ padding:'9px 10px', fontWeight:600 }}>{emp.name}</td>
                              <td style={{ padding:'9px 10px', color:T.muted, fontFamily:'monospace' }}>{emp.tin || '—'}</td>
                              <td style={{ padding:'9px 10px', color:T.muted, fontSize:11 }}>{emp.employment_type}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right' }}>{peso(basic)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right', color:T.muted }}>{peso(ded)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right' }}>{peso(taxable)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:700, color:T.orange }}>{peso(mWHT)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right', whiteSpace:'nowrap' }}>
                                <button onClick={() => { setEditEmp(emp);
                                  setEmpForm({ name:emp.name, tin:emp.tin||'', employmentType:emp.employment_type,
                                    monthlyBasicSalary:String(emp.monthly_basic_salary),
                                    sssContribution:String(emp.sss_contribution),
                                    philhealthContribution:String(emp.philhealth_contribution),
                                    pagibigContribution:String(emp.pagibig_contribution),
                                    hireDate:emp.hire_date||'' });
                                  setShowEmpModal(true);
                                }} style={{ background:'none', border:'none', cursor:'pointer',
                                  color:T.accent, fontSize:12, padding:'2px 6px' }}>Edit</button>
                                <button onClick={() => handleDeleteEmp(emp.id, emp.name)}
                                  style={{ background:'none', border:'none', cursor:'pointer',
                                    color:T.red, fontSize:12, padding:'2px 6px' }}>Remove</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              {/* BIR Form 1601-C replica */}
              {payrollResult && (() => {
                const pr = payrollResult;
                const rows = pr.employees || [];
                const tot  = pr.totals    || {};
                return (
                  <Card style={{ marginBottom:20 }}>
                    {/* Header */}
                    <div style={{ textAlign:'center', paddingBottom:16, borderBottom:`2px solid ${T.accent}`, marginBottom:16 }}>
                      <div style={{ fontSize:10, color:T.muted, letterSpacing:1, textTransform:'uppercase' }}>BIR Form No.</div>
                      <div style={{ fontSize:28, fontWeight:900, color:T.accent, letterSpacing:2 }}>1601-C</div>
                      <div style={{ fontSize:13, fontWeight:700, color:T.text, marginTop:4 }}>
                        Monthly Remittance Return of Income Taxes Withheld on Compensation
                      </div>
                      <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>
                        {monthLabel} · Due: On or before the 10th of the following month
                      </div>
                    </div>

                    {/* Part I */}
                    <SectionHead>Part I — Background Information</SectionHead>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px 16px',
                      padding:'12px', background:T.bg, borderRadius:T.radius, marginBottom:20 }}>
                      {[
                        ['Taxpayer Name', active.tradeName],
                        ['TIN', active.tin || '—'],
                        ['RDO Code', active.rdoCode || '—'],
                        ['Tax Type', 'WC — WHT on Compensation'],
                        ['Return Period', monthLabel],
                        ['No. of Employees', String(rows.length)],
                      ].map(([lbl, val]) => (
                        <div key={lbl} style={{ fontSize:12 }}>
                          <div style={{ fontSize:10, color:T.muted, marginBottom:2 }}>{lbl}</div>
                          <div style={{ fontWeight:600 }}>{val}</div>
                        </div>
                      ))}
                    </div>

                    {/* Part II: Employee schedule */}
                    <SectionHead>Part II — Schedule of Employees</SectionHead>
                    <div style={{ border:`1px solid ${T.border}`, borderRadius:T.radius, overflow:'hidden', marginBottom:16 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:T.bg }}>
                            {['Employee Name','TIN','Monthly Basic','Deductions','Monthly Taxable','Annual Taxable','Monthly WHT'].map((h,i) => (
                              <th key={h} style={{ padding:'8px 10px', textAlign:i>=2?'right':'left',
                                fontWeight:600, color:T.muted, fontSize:10, textTransform:'uppercase',
                                borderBottom:`1px solid ${T.border}`, whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding:16, textAlign:'center', color:T.muted, fontStyle:'italic' }}>No employees</td></tr>
                          ) : rows.map((e, i) => (
                            <tr key={e.id} style={{ borderBottom: i < rows.length-1 ? `1px solid ${T.border}` : 'none' }}>
                              <td style={{ padding:'9px 10px', fontWeight:600 }}>{e.name}</td>
                              <td style={{ padding:'9px 10px', color:T.muted, fontFamily:'monospace' }}>{e.tin || '—'}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right' }}>{peso(e.monthly_basic_salary)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right', color:T.muted }}>{peso(e.monthly_deductions)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right' }}>{peso(e.monthly_taxable)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right', color:T.muted }}>{peso(e.annual_taxable)}</td>
                              <td style={{ padding:'9px 10px', textAlign:'right', fontWeight:700, color:T.orange }}>{peso(e.monthly_wht)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background:T.bg, borderTop:`2px solid ${T.border}` }}>
                            <td colSpan={5} style={{ padding:'10px', fontWeight:700 }}>
                              TOTAL ({rows.length} employee{rows.length!==1?'s':''})
                            </td>
                            <td style={{ padding:'10px', textAlign:'right', fontWeight:600 }}>{peso(tot.total_monthly_basic)}</td>
                            <td style={{ padding:'10px', textAlign:'right', fontWeight:900, color:T.orange, fontSize:15 }}>{peso(tot.total_monthly_wht)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Part III: Tax Due */}
                    <SectionHead>Part III — Tax Due / Penalties</SectionHead>
                    <div style={{ border:`1px solid ${T.border}`, borderRadius:T.radius, overflow:'hidden', marginBottom:16 }}>
                      {[
                        { no:1, label:'Total Taxes Withheld on Compensation for the Month', value:tot.total_monthly_wht, bold:false },
                        { no:2, label:'Less: Tax Remitted in Previous Return (if amended)', value:0, bold:false },
                        { no:3, label:'Tax Still Due / (Overpayment) (Line 1 − Line 2)', value:tot.total_monthly_wht, bold:true, highlight:true },
                        { no:4, label:'Add Penalties — Surcharge (25% / 50%)', value:0, bold:false },
                        { no:5, label:'Add Penalties — Interest (12% per annum)', value:0, bold:false },
                        { no:6, label:'Add Penalties — Compromise', value:0, bold:false },
                      ].map((row, i, arr) => (
                        <div key={row.no} style={{
                          display:'flex', alignItems:'center', padding:'9px 14px',
                          borderBottom: i < arr.length-1 ? `1px solid ${T.border}` : 'none',
                          background: row.highlight ? `${T.orange}12` : 'transparent',
                        }}>
                          <span style={{ width:24, fontSize:11, color:T.muted, fontWeight:600, flexShrink:0 }}>{row.no}.</span>
                          <span style={{ flex:1, fontSize:12, fontWeight:row.bold?700:400 }}>{row.label}</span>
                          <span style={{ fontSize:row.bold?15:13, fontWeight:row.bold?700:400,
                            color:row.bold?T.orange:(row.value===0?T.muted:T.text),
                            fontVariantNumeric:'tabular-nums' }}>
                            {row.value===0&&!row.bold ? '—' : peso(row.value)}
                          </span>
                        </div>
                      ))}
                      <div style={{ display:'flex', alignItems:'center', padding:'12px 14px',
                        background:`${T.orange}15`, borderTop:`2px solid ${T.orange}40` }}>
                        <span style={{ flex:1, fontWeight:700, fontSize:13 }}>TOTAL AMOUNT PAYABLE  (Lines 3 + 4 + 5 + 6)</span>
                        <span style={{ fontWeight:900, fontSize:18, color:T.orange }}>{peso(tot.total_monthly_wht)}</span>
                      </div>
                    </div>

                    <div style={{ fontSize:11, color:T.muted, lineHeight:1.6, background:T.bg, borderRadius:8, padding:'10px 12px' }}>
                      ⚠️ Generated by MyLedger — Always verify with actual BIR-prescribed forms before filing.
                      WHT computed using TRAIN Law (RA 10963) graduated rates.
                      Due: On or before the 10th day of the following month.
                    </div>
                  </Card>
                );
              })()}

              {/* TRAIN Law Reference Card */}
              <Card style={{ marginBottom:20 }}>
                <SectionHead>TRAIN Law Graduated Rates — Annual Taxable Compensation</SectionHead>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ background:T.bg }}>
                        {['Annual Taxable Income','Tax Rate','Fixed Amount','On Excess Over'].map((h,i) => (
                          <th key={h} style={{ padding:'8px 12px', textAlign:i===0?'left':'right',
                            fontWeight:600, color:T.muted, fontSize:10, textTransform:'uppercase',
                            borderBottom:`1px solid ${T.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        ['Up to ₱250,000',                 '0%',   '—',          '—'],
                        ['₱250,001 – ₱400,000',            '20%',  '—',          '₱250,000'],
                        ['₱400,001 – ₱800,000',            '25%',  '₱30,000',    '₱400,000'],
                        ['₱800,001 – ₱2,000,000',          '30%',  '₱130,000',   '₱800,000'],
                        ['₱2,000,001 – ₱8,000,000',        '32%',  '₱490,000',   '₱2,000,000'],
                        ['Over ₱8,000,000',                '35%',  '₱2,410,000', '₱8,000,000'],
                      ].map(([range, rate, fixed, excess], i) => (
                        <tr key={range} style={{ borderBottom:`1px solid ${T.border}`, background: i%2===0 ? 'transparent' : T.bg }}>
                          <td style={{ padding:'8px 12px', fontWeight:600 }}>{range}</td>
                          <td style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, color:T.accent }}>{rate}</td>
                          <td style={{ padding:'8px 12px', textAlign:'right', color:T.muted }}>{fixed}</td>
                          <td style={{ padding:'8px 12px', textAlign:'right', color:T.muted }}>{excess}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ fontSize:11, color:T.muted, marginTop:10 }}>
                  Monthly WHT = Annual tax on (Monthly Basic − SSS − PhilHealth − Pagibig) × 12, divided by 12.
                  RA 10963 (TRAIN Law) · Effective January 1, 2023.
                </div>
              </Card>

              {/* Employee Modal */}
              {showEmpModal && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000,
                  display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ background:T.surface, borderRadius:T.radius, padding:28, width:520,
                    maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
                    <h3 style={{ margin:'0 0 20px', fontSize:17 }}>{editEmp ? 'Edit Employee' : 'Add Employee'}</h3>
                    <form onSubmit={handleSaveEmp}>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                        <Fld label="Full Name *" style={{ gridColumn:'1/-1' }}>
                          <input style={{ ...inp, width:'100%' }} value={empForm.name}
                            onChange={empSetEmpForm('name')} required placeholder="Juan dela Cruz" />
                        </Fld>
                        <Fld label="TIN">
                          <input style={{ ...inp }} value={empForm.tin}
                            onChange={empSetEmpForm('tin')} placeholder="000-000-000" />
                        </Fld>
                        <Fld label="Employment Type">
                          <select style={{ ...inp }} value={empForm.employmentType}
                            onChange={empSetEmpForm('employmentType')}>
                            <option value="regular">Regular</option>
                            <option value="probationary">Probationary</option>
                            <option value="project-based">Project-Based</option>
                            <option value="part-time">Part-Time</option>
                          </select>
                        </Fld>
                        <Fld label="Monthly Basic Salary (₱) *">
                          <input style={{ ...inp }} type="number" min="0" step="0.01"
                            value={empForm.monthlyBasicSalary}
                            onChange={empSetEmpForm('monthlyBasicSalary')} required placeholder="20000" />
                        </Fld>
                        <Fld label="Hire Date">
                          <input style={{ ...inp }} type="date" value={empForm.hireDate}
                            onChange={empSetEmpForm('hireDate')} />
                        </Fld>
                      </div>

                      <div style={{ fontSize:12, fontWeight:700, color:T.muted, textTransform:'uppercase',
                        letterSpacing:'0.5px', marginBottom:10 }}>
                        Monthly Deductions (SSS / PhilHealth / Pagibig)
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>
                        <Fld label="SSS Contribution (₱)">
                          <input style={{ ...inp }} type="number" min="0" step="0.01"
                            value={empForm.sssContribution}
                            onChange={empSetEmpForm('sssContribution')} placeholder="1125" />
                        </Fld>
                        <Fld label="PhilHealth (₱)">
                          <input style={{ ...inp }} type="number" min="0" step="0.01"
                            value={empForm.philhealthContribution}
                            onChange={empSetEmpForm('philhealthContribution')} placeholder="500" />
                        </Fld>
                        <Fld label="Pag-IBIG (₱)">
                          <input style={{ ...inp }} type="number" min="0" step="0.01"
                            value={empForm.pagibigContribution}
                            onChange={empSetEmpForm('pagibigContribution')} placeholder="200" />
                        </Fld>
                      </div>

                      {/* Live WHT preview */}
                      {parseFloat(empForm.monthlyBasicSalary) > 0 && (() => {
                        const basic  = parseFloat(empForm.monthlyBasicSalary) || 0;
                        const sss    = parseFloat(empForm.sssContribution) || 0;
                        const ph     = parseFloat(empForm.philhealthContribution) || 0;
                        const pag    = parseFloat(empForm.pagibigContribution) || 0;
                        const taxable= Math.max(0, basic - sss - ph - pag);
                        const annual = taxable * 12;
                        const mWHT   = Math.round(annualWHT(annual) / 12 * 100) / 100;
                        return (
                          <div style={{ background:`${T.orange}12`, borderRadius:T.radius, padding:'12px 16px',
                            marginBottom:20, fontSize:12 }}>
                            <div style={{ fontWeight:700, color:T.orange, marginBottom:6 }}>WHT Preview (TRAIN Law)</div>
                            <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
                              <span style={{ color:T.muted }}>Monthly Taxable: <strong style={{ color:T.text }}>{peso(taxable)}</strong></span>
                              <span style={{ color:T.muted }}>Annual Taxable: <strong style={{ color:T.text }}>{peso(annual)}</strong></span>
                              <span style={{ color:T.muted }}>Monthly WHT: <strong style={{ color:T.orange }}>{peso(mWHT)}</strong></span>
                            </div>
                          </div>
                        );
                      })()}

                      <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                        <Btn variant="ghost" type="button" onClick={() => { setShowEmpModal(false); setEditEmp(null); }}>Cancel</Btn>
                        <Btn type="submit">{editEmp ? 'Save Changes' : 'Add Employee'}</Btn>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ════════════ BIR REMINDERS (Filing Summary) ════════════ */}
        {tab === 'BIR Reminders' && active && (() => {
          const forms = birSummaryData?.forms || [];
          const readinessColor = { filed: T.green, ready: T.accent, zero: T.muted, missing: T.orange, pending: T.muted };
          const readinessBg    = { filed: '#f0fff4', ready: T.accentL, zero: '#f5f5f7', missing: '#fff8ec', pending: '#f5f5f7' };
          const readinessLabel = { filed: '✅ Filed', ready: '🟢 Ready to file', zero: '⚪ Zero due', missing: '⚠️ Missing data', pending: '⏳ Pending' };
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>BIR Filing Summary — {active.tradeName}</h2>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                    Computed amounts per form · Mark obligations as filed when submitted
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="month" value={birSummaryPeriod}
                    onChange={e => { setBirSummaryPeriod(e.target.value); loadBirSummary(e.target.value); }}
                    style={{ ...inp, width: 160, padding: '7px 10px' }} />
                  <Btn size="sm" variant="ghost" onClick={() => loadBirSummary()}>↻ Refresh</Btn>
                </div>
              </div>

              {birSummaryLoad ? (
                <div style={{ color: T.muted, padding: 24 }}>Computing filing summary…</div>
              ) : (active.taxTypes || []).length === 0 ? (
                <Card style={{ textAlign: 'center', color: T.muted, padding: 32 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                  No tax obligations configured. Go to Business Setup to add this client's BIR forms.
                </Card>
              ) : forms.length === 0 ? (
                <Card style={{ textAlign: 'center', color: T.muted, padding: 32 }}>
                  No filings found for this period. Check that the client's tax types are configured.
                </Card>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                  {forms.map(f => {
                    const rl    = f.readiness || 'pending';
                    const col   = readinessColor[rl] || T.muted;
                    const bg    = readinessBg[rl]    || '#f5f5f7';
                    const lbl   = readinessLabel[rl] || '⏳ Pending';
                    const marking = birSummaryMarkingId === f.form + f.period;
                    return (
                      <div key={f.form + f.period} style={{ background: bg, borderRadius: T.radius,
                        padding: '18px 22px', border: `1px solid ${col}30`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        {/* Left: form info */}
                        <div style={{ flex: 1, minWidth: 200 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 16 }}>{f.form}</span>
                            <span style={{ fontSize: 12, background: `${col}18`, color: col,
                              borderRadius: 20, padding: '2px 10px', fontWeight: 600, border: `1px solid ${col}30` }}>
                              {lbl}
                            </span>
                            {f.isEstimate && (
                              <span style={{ fontSize: 11, color: T.orange, background: '#fff8ec',
                                borderRadius: 20, padding: '2px 8px', border: '1px solid #ff950030' }}>
                                Estimate
                              </span>
                            )}
                          </div>
                          <div style={{ fontWeight: 500, fontSize: 14, color: T.text, marginBottom: 3 }}>{f.name}</div>
                          <div style={{ fontSize: 12, color: T.muted }}>Period: {f.periodLabel}</div>
                          {f.breakdown && (
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{f.breakdown}</div>
                          )}
                          {f.dueDay && (
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>📅 Due: {f.dueDay}</div>
                          )}
                        </div>

                        {/* Right: amount + action */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: T.muted, marginBottom: 1 }}>Amount Due</div>
                            <div style={{ fontSize: 24, fontWeight: 700, color: f.amountDue > 0 ? T.red : T.muted }}>
                              {peso(f.amountDue)}
                            </div>
                          </div>
                          <button
                            disabled={marking}
                            onClick={() => markBirFiling(f.form, f.period, f.status)}
                            style={{
                              padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12,
                              fontWeight: 600, cursor: marking ? 'not-allowed' : 'pointer',
                              background: f.status === 'filed' ? '#f5f5f7' : T.accent,
                              color: f.status === 'filed' ? T.muted : '#fff',
                              fontFamily: 'inherit', opacity: marking ? 0.6 : 1,
                            }}>
                            {marking ? '…' : f.status === 'filed' ? 'Unmark Filed' : 'Mark as Filed'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* VAT Position summary */}
              {vatBal && (
                <Card>
                  <SectionHead>All-Time VAT Balance</SectionHead>
                  <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 12, color: T.muted }}>Input VAT (asset)</div>
                      <div style={{ fontSize: 22, fontWeight: 600, color: T.green }}>{peso(vatBal.inputVAT)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: T.muted }}>Output VAT (liability)</div>
                      <div style={{ fontSize: 22, fontWeight: 600, color: T.orange }}>{peso(vatBal.outputVAT)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, color: T.muted }}>Net to remit</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: vatBal.netVATPayable >= 0 ? T.red : T.green }}>
                        {vatBal.note}
                      </div>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          );
        })()}


        {/* ══════════ FILING CALENDAR ══════════ */}
        {tab === 'Filing Calendar' && (() => {
          const today     = new Date().toISOString().slice(0, 10);
          const daysInMo  = new Date(calYear, calMonth, 0).getDate();
          const firstDoW  = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
          const calPad    = Array(firstDoW).fill(null);
          const calDays   = Array.from({ length: daysInMo }, (_, i) => i + 1);
          const allDays   = [...calPad, ...calDays];
          const monthName = new Date(calYear, calMonth - 1, 1).toLocaleString('en-PH', { month: 'long', year: 'numeric' });

          const eventsByDate = {};
          (calData?.events || []).forEach(ev => { eventsByDate[ev.date] = ev; });

          function navMonth(dir) {
            let m = calMonth + dir;
            let y = calYear;
            if (m < 1)  { m = 12; y--; }
            if (m > 12) { m = 1;  y++; }
            setCalMonth(m); setCalYear(y); setCalSelected(null);
            setCalLoad(true);
            getBirCalendar(y, m).then(d => setCalData(d)).catch(console.error).finally(() => setCalLoad(false));
          }

          const selectedEvents = calSelected ? (eventsByDate[calSelected]?.items || []) : [];

          // Aggregate: how many deadlines per client this month
          const clientSummary = {};
          (calData?.events || []).forEach(ev => {
            ev.items.forEach(item => {
              if (!clientSummary[item.clientId]) clientSummary[item.clientId] = { tradeName: item.tradeName, forms: [] };
              clientSummary[item.clientId].forms.push({ form: item.form, date: ev.date });
            });
          });

          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>📅 BIR Filing Calendar</h2>
                <div style={{ fontSize: 13, color: T.muted }}>All clients · {calData?.clientCount || 0} clients tracked</div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: 20 }}>
                {/* Calendar grid */}
                <Card>
                  {/* Month nav */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <button onClick={() => navMonth(-1)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.muted, padding: '4px 8px' }}>
                      ‹
                    </button>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{monthName}</div>
                    <button onClick={() => navMonth(1)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.muted, padding: '4px 8px' }}>
                      ›
                    </button>
                  </div>

                  {calLoad ? (
                    <div style={{ color: T.muted, textAlign: 'center', padding: 32, fontSize: 13 }}>Loading calendar…</div>
                  ) : (
                    <div>
                      {/* Day headers */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
                        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600,
                            color: T.muted, padding: '4px 0', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                            {d}
                          </div>
                        ))}
                      </div>

                      {/* Day cells */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
                        {allDays.map((day, idx) => {
                          if (!day) return <div key={`pad-${idx}`} />;
                          const iso = `${calYear}-${String(calMonth).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                          const ev  = eventsByDate[iso];
                          const isToday    = iso === today;
                          const isSelected = iso === calSelected;
                          const urgentCnt  = ev?.items.filter(i => i.daysUntil <= 7 && i.daysUntil >= 0).length || 0;
                          const upcomCnt   = ev?.items.filter(i => i.daysUntil > 7 && i.daysUntil <= 21).length || 0;
                          const normalCnt  = ev?.items.filter(i => i.daysUntil > 21).length || 0;
                          const pastCnt    = ev?.items.filter(i => i.daysUntil < 0).length || 0;

                          return (
                            <div key={iso}
                              onClick={() => setCalSelected(isSelected ? null : iso)}
                              style={{
                                borderRadius: 8,
                                padding: '6px 4px',
                                minHeight: 52,
                                cursor: ev ? 'pointer' : 'default',
                                background: isSelected ? T.accentL : isToday ? '#e8f4ff' : ev ? '#fafafa' : 'transparent',
                                border: isSelected ? `2px solid ${T.accent}` : isToday ? `2px solid #0071e3` : '1px solid transparent',
                                transition: 'all 0.1s',
                              }}>
                              <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400,
                                color: isToday ? '#0071e3' : T.text, textAlign: 'center', marginBottom: 4 }}>
                                {day}
                              </div>
                              {ev && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center' }}>
                                  {urgentCnt > 0 && (
                                    <span style={{ background: T.red, color: '#fff', borderRadius: 10,
                                      fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>
                                      {urgentCnt}
                                    </span>
                                  )}
                                  {upcomCnt > 0 && (
                                    <span style={{ background: T.orange, color: '#fff', borderRadius: 10,
                                      fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>
                                      {upcomCnt}
                                    </span>
                                  )}
                                  {normalCnt > 0 && (
                                    <span style={{ background: T.green, color: '#fff', borderRadius: 10,
                                      fontSize: 9, padding: '1px 5px', fontWeight: 700 }}>
                                      {normalCnt}
                                    </span>
                                  )}
                                  {pastCnt > 0 && (
                                    <span style={{ background: T.muted, color: '#fff', borderRadius: 10,
                                      fontSize: 9, padding: '1px 5px' }}>
                                      {pastCnt}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Legend */}
                      <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 11, color: T.muted, flexWrap: 'wrap' }}>
                        {[
                          { color: T.red,    label: 'Urgent (≤7d)' },
                          { color: T.orange, label: 'Upcoming (≤21d)' },
                          { color: T.green,  label: 'Scheduled' },
                          { color: T.muted,  label: 'Past' },
                        ].map(({ color, label }) => (
                          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ background: color, width: 10, height: 10, borderRadius: 5, display: 'inline-block' }} />
                            {label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Side panel: selected day details OR client summary */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {calSelected ? (
                    <Card>
                      <SectionHead>
                        {new Date(calSelected + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </SectionHead>
                      {selectedEvents.length === 0 ? (
                        <div style={{ fontSize: 13, color: T.muted }}>No deadlines on this date.</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {selectedEvents.map((item, i) => {
                            const urg = item.daysUntil <= 7 && item.daysUntil >= 0 ? 'urgent'
                              : item.daysUntil > 7 && item.daysUntil <= 21 ? 'upcoming' : item.daysUntil < 0 ? 'past' : 'normal';
                            const col = urg === 'urgent' ? T.red : urg === 'upcoming' ? T.orange : urg === 'past' ? T.muted : T.green;
                            return (
                              <div key={i} style={{ padding: '10px 12px', borderRadius: 10,
                                border: `1px solid ${col}30`, background: `${col}08` }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: col }}>{item.form}</div>
                                <div style={{ fontSize: 12, color: T.text, marginTop: 2 }}>{item.tradeName}</div>
                                <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                                  {item.daysUntil < 0 ? `${Math.abs(item.daysUntil)}d overdue` :
                                   item.daysUntil === 0 ? 'Due today' : `${item.daysUntil}d left`}
                                </div>
                                <button onClick={() => { setActive(selectedEvents[i] && { id: item.clientId, tradeName: item.tradeName }); setTab('BIR Reminders'); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.accent, fontSize: 11, padding: 0, marginTop: 4 }}>
                                  View client →
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  ) : (
                    <Card>
                      <SectionHead>Month Summary</SectionHead>
                      <div style={{ fontSize: 13, color: T.muted, marginBottom: 12 }}>
                        {(calData?.events || []).reduce((s, e) => s + e.count, 0)} total deadlines across {Object.keys(clientSummary).length} clients
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                        {Object.values(clientSummary).sort((a, b) => a.tradeName.localeCompare(b.tradeName)).map(c => (
                          <div key={c.tradeName} style={{ padding: '8px 10px', background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}>
                            <div style={{ fontWeight: 600, fontSize: 12 }}>{c.tradeName}</div>
                            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                              {c.forms.map(f => f.form).join(' · ')}
                            </div>
                          </div>
                        ))}
                        {Object.keys(clientSummary).length === 0 && (
                          <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic' }}>
                            No deadlines this month.
                          </div>
                        )}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══════════ COMPARE (Multi-Period Income Statement) ══════════ */}
        {tab === 'Compare' && active && (() => {
          const p = compareData?.periods;
          const v = compareData?.variance;
          const cb = compareBudget; // { revenue, costOfSales, opex, grossProfit, profit } or null
          function varCell(varObj) {
            if (!varObj) return <td style={{ color: T.muted, textAlign: 'right' }}>—</td>;
            const sign = varObj.varPHP >= 0 ? '+' : '';
            const pct  = varObj.varPct != null ? ` (${varObj.varPHP >= 0 ? '+' : ''}${varObj.varPct}%)` : '';
            const col  = varObj.varPHP >= 0 ? T.green : T.red;
            return (
              <td style={{ textAlign: 'right', fontSize: 13, color: col, fontWeight: 500 }}>
                {sign}{peso(varObj.varPHP)}{pct}
              </td>
            );
          }
          function budgetVarCell(actual, budget) {
            if (!cb || budget == null) return <td style={{ color: T.muted, textAlign: 'right', fontSize: 13 }}>—</td>;
            const diff = actual - budget;
            const pct  = budget !== 0 ? ` (${diff >= 0 ? '+' : ''}${Math.round(diff / budget * 100)}%)` : '';
            const col  = diff >= 0 ? T.green : T.red;
            return (
              <td style={{ textAlign: 'right', fontSize: 13, color: col, fontWeight: 500 }}>
                {diff >= 0 ? '+' : ''}{peso(diff)}{pct}
              </td>
            );
          }
          const rows = [
            { label: 'Net Revenue',        key: 'revenue',     budgetKey: 'revenue',     bold: true },
            { label: 'Cost of Goods Sold', key: 'costOfSales', budgetKey: 'costOfSales', indent: true },
            { label: 'Gross Profit',       key: 'grossProfit', budgetKey: 'grossProfit', bold: true, rule: true },
            { label: 'Operating Expenses', key: 'opex',        budgetKey: 'opex',        indent: true },
            { label: 'Net Profit / Loss',  key: 'profit',      budgetKey: 'profit',      bold: true, rule: true },
            { label: 'Output VAT',         key: 'outputVAT',   budgetKey: null,          muted: true },
            { label: 'Input VAT',          key: 'inputVAT',    budgetKey: null,          muted: true },
          ];
          const cellSt = (val, bold) => ({
            textAlign: 'right', fontSize: bold ? 15 : 13, fontWeight: bold ? 700 : 400,
            color: typeof val === 'number' && val < 0 ? T.red : T.text,
            padding: '7px 12px',
          });
          const thSt = { textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.muted,
            textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px' };
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Period Comparison — {active.tradeName}</h2>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                    3-column income statement: this month, last month, same month last year
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="month" value={comparePeriod}
                    onChange={e => { setComparePeriod(e.target.value); loadIncomeCompare(e.target.value); }}
                    style={{ ...inp, width: 160, padding: '7px 10px' }} />
                  <Btn size="sm" variant="ghost" onClick={() => loadIncomeCompare()}>↻ Refresh</Btn>
                </div>
              </div>

              {compareLoad ? (
                <div style={{ color: T.muted }}>Loading comparison…</div>
              ) : !compareData ? (
                <Card style={{ textAlign: 'center', color: T.muted, padding: 32 }}>
                  Select a period and click Refresh.
                </Card>
              ) : (
                <Card style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: T.muted,
                          textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px', width: '22%' }}>
                          Line Item
                        </th>
                        <th style={thSt}>{p?.current?.label || 'Current'}</th>
                        <th style={thSt}>{p?.previous?.label || 'Prev Month'}</th>
                        <th style={{ ...thSt, color: T.orange }}>vs Prev Month</th>
                        <th style={thSt}>{p?.sameLastYear?.label || 'Same Mth LY'}</th>
                        <th style={{ ...thSt, color: T.purple }}>vs Last Year</th>
                        {cb && <th style={{ ...thSt, color: '#0071e3' }}>Budget</th>}
                        {cb && <th style={{ ...thSt, color: '#0071e3' }}>vs Budget</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.key} style={{
                          borderBottom: r.rule ? `2px solid ${T.border}` : `1px solid ${T.border}20`,
                          background: r.bold ? '#f9f9fb' : 'transparent',
                        }}>
                          <td style={{ padding: '7px 12px', paddingLeft: r.indent ? 24 : 12,
                            fontSize: r.bold ? 14 : 13, fontWeight: r.bold ? 600 : 400,
                            color: r.muted ? T.muted : T.text }}>
                            {r.label}
                          </td>
                          <td style={cellSt(p?.current?.[r.key], r.bold)}>{peso(p?.current?.[r.key] ?? 0)}</td>
                          <td style={cellSt(p?.previous?.[r.key], false)}>{peso(p?.previous?.[r.key] ?? 0)}</td>
                          {varCell(v?.vsPrev?.[r.key])}
                          <td style={cellSt(p?.sameLastYear?.[r.key], false)}>{peso(p?.sameLastYear?.[r.key] ?? 0)}</td>
                          {varCell(v?.vsLY?.[r.key])}
                          {cb && r.budgetKey && <td style={cellSt(cb[r.budgetKey], false)}>{peso(cb[r.budgetKey] ?? 0)}</td>}
                          {cb && !r.budgetKey && <td style={{ color: T.muted, textAlign: 'right', fontSize: 13 }}>—</td>}
                          {cb && r.budgetKey && budgetVarCell(p?.current?.[r.key] ?? 0, cb[r.budgetKey])}
                          {cb && !r.budgetKey && <td style={{ color: T.muted, textAlign: 'right', fontSize: 13 }}>—</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 12 }}>
                    All amounts NET (VAT-exclusive). Positive variance = higher than comparison period.
                  </div>
                </Card>
              )}

              {/* Expense detail breakdown */}
              {compareData && p?.current?.expenseDetail && Object.keys(p.current.expenseDetail).length > 0 && (
                <Card style={{ marginTop: 16 }}>
                  <SectionHead>Current Month Expense Detail</SectionHead>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: T.muted,
                          padding: '6px 8px', textTransform: 'uppercase' }}>Category</th>
                        <th style={{ textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.muted,
                          padding: '6px 8px', textTransform: 'uppercase' }}>Amount (NET)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(p.current.expenseDetail)
                        .sort((a, b) => b[1] - a[1])
                        .map(([cat, amt]) => (
                          <tr key={cat} style={{ borderBottom: `1px solid ${T.border}20` }}>
                            <td style={{ padding: '5px 8px', fontSize: 13, color: T.text }}>{cat}</td>
                            <td style={{ padding: '5px 8px', fontSize: 13, textAlign: 'right', color: T.text }}>{peso(amt)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          );
        })()}

        {/* ══════════ BUDGET ══════════ */}
        {tab === 'Budget' && active && (() => {
          if (!isPro) return <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'professional'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} />;

          // Standard budget lines
          const BUDGET_LINES = [
            { label: 'Revenue',              category: 'Revenue',              type: 'income',  bold: true },
            { label: 'Cost of Goods Sold',   category: 'Cost of Goods Sold',   type: 'expense', indent: true },
            { label: 'Operating Expenses',   category: 'Operating Expenses',   type: 'expense', indent: true },
          ];

          const get = (cat, typ) => budgetData[`${cat}|${typ}`] ?? '';
          const revenue  = parseFloat(budgetData['Revenue|income'])            || 0;
          const cogs     = parseFloat(budgetData['Cost of Goods Sold|expense']) || 0;
          const opex     = parseFloat(budgetData['Operating Expenses|expense']) || 0;
          const gross    = revenue - cogs;
          const net      = revenue - cogs - opex;

          const inp2 = { ...inp, textAlign: 'right', width: 160, padding: '6px 10px' };
          const thSt = { textAlign: 'right', fontSize: 11, fontWeight: 700, color: T.muted,
            textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px' };
          const derivedCell = (val) => (
            <td style={{ textAlign: 'right', padding: '7px 12px', fontSize: 15, fontWeight: 700,
              color: val < 0 ? T.red : T.text }}>
              {peso(val)}
            </td>
          );

          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Budget Entry — {active.tradeName}</h2>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                    Set monthly budget targets. These appear as a comparison column in the Compare tab.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="month" value={budgetPeriod}
                    onChange={e => { setBudgetPeriod(e.target.value); loadBudget(e.target.value); }}
                    style={{ ...inp, width: 160, padding: '7px 10px' }} />
                  <Btn size="sm" variant="ghost" onClick={() => loadBudget()}>↻ Refresh</Btn>
                </div>
              </div>

              {budgetLoad ? (
                <div style={{ color: T.muted }}>Loading budget…</div>
              ) : (
                <Card style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                        <th style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: T.muted,
                          textTransform: 'uppercase', letterSpacing: '0.5px', padding: '8px 12px', width: '55%' }}>
                          Line Item
                        </th>
                        <th style={thSt}>Budget Amount (₱ NET)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {BUDGET_LINES.map(row => {
                        const key = `${row.category}|${row.type}`;
                        const saving = budgetSaving[key];
                        return (
                          <tr key={key} style={{ borderBottom: `1px solid ${T.border}20` }}>
                            <td style={{ padding: '7px 12px', paddingLeft: row.indent ? 28 : 12,
                              fontSize: row.bold ? 14 : 13, fontWeight: row.bold ? 600 : 400, color: T.text }}>
                              {row.label}
                            </td>
                            <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                              <input
                                type="number" min="0" step="0.01"
                                defaultValue={get(row.category, row.type)}
                                key={`${budgetPeriod}-${key}`}
                                style={{ ...inp2, opacity: saving ? 0.5 : 1 }}
                                onBlur={e => handleBudgetSave(row.category, row.type, e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                                placeholder="0.00"
                              />
                              {saving && <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>saving…</span>}
                            </td>
                          </tr>
                        );
                      })}

                      {/* Derived rows */}
                      <tr style={{ borderTop: `2px solid ${T.border}`, background: '#f9f9fb' }}>
                        <td style={{ padding: '7px 12px', fontSize: 14, fontWeight: 600, color: T.text }}>Gross Profit</td>
                        {derivedCell(gross)}
                      </tr>
                      <tr style={{ borderTop: `2px solid ${T.border}`, background: '#f9f9fb' }}>
                        <td style={{ padding: '7px 12px', fontSize: 14, fontWeight: 700, color: T.text }}>Net Profit / Loss</td>
                        {derivedCell(net)}
                      </tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11.5, color: T.muted, marginTop: 12, padding: '0 12px 12px' }}>
                    All amounts NET (VAT-exclusive). Changes save automatically on Tab / Enter / click away.
                  </div>
                </Card>
              )}
            </div>
          );
        })()}

        {/* ══════════ AGED AR / AP ══════════ */}
        {tab === 'Aged AR/AP' && active && (() => {
          if (!isPro) return <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} />;

          const fmt = (n) => `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const bucketLabel  = { current: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '90plus': '90+ days' };
          const bucketColor  = { current: '#34c759', '1_30': '#ff9500', '31_60': '#ff6b00', '61_90': '#ff3b30', '90plus': '#8b0000' };
          const bucketKeys   = ['current', '1_30', '31_60', '61_90', '90plus'];

          const AgingTable = ({ title, rows, totals, emptyMsg }) => (
            <div style={{ marginBottom: 36 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 17, fontWeight: 600 }}>{title}</h3>
              {(!rows || rows.length === 0) ? (
                <div style={{ color: '#86868b', fontSize: 14, padding: '24px 0' }}>{emptyMsg}</div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: '#f5f5f7', borderBottom: '2px solid #e5e5ea' }}>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Name</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Ref #</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontWeight: 600 }}>Due Date</th>
                        {bucketKeys.map(k => (
                          <th key={k} style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 600, color: bucketColor[k] }}>{bucketLabel[k]}</th>
                        ))}
                        <th style={{ textAlign: 'right', padding: '8px 10px', fontWeight: 700 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '7px 10px', fontWeight: 500 }}>{r.customerName || r.vendorName}</td>
                          <td style={{ padding: '7px 10px', color: '#86868b' }}>{r.invoiceNumber || r.billNumber || '—'}</td>
                          <td style={{ padding: '7px 10px', color: r.daysOverdue > 0 ? '#ff3b30' : '#1d1d1f' }}>{r.dueDate || '—'}</td>
                          {bucketKeys.map(k => (
                            <td key={k} style={{ textAlign: 'right', padding: '7px 10px', color: r.bucket === k ? bucketColor[k] : '#c7c7cc', fontWeight: r.bucket === k ? 600 : 400 }}>
                              {r.bucket === k ? fmt(r.total) : '—'}
                            </td>
                          ))}
                          <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 600 }}>{fmt(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: '#f5f5f7', borderTop: '2px solid #e5e5ea', fontWeight: 700 }}>
                        <td colSpan={3} style={{ padding: '8px 10px' }}>TOTAL</td>
                        {bucketKeys.map(k => (
                          <td key={k} style={{ textAlign: 'right', padding: '8px 10px', color: totals[k] > 0 ? bucketColor[k] : '#c7c7cc' }}>{totals[k] > 0 ? fmt(totals[k]) : '—'}</td>
                        ))}
                        <td style={{ textAlign: 'right', padding: '8px 10px' }}>{fmt(totals.grand)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );

          return (
            <div>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Aged AR / AP</h2>
                  {agedAR?.asOf && <div style={{ fontSize: 12, color: '#86868b', marginTop: 2 }}>As of {agedAR.asOf}</div>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn size="sm" variant="ghost" onClick={loadAgedReport}>↻ Refresh</Btn>
                  <Btn size="sm" onClick={() => setShowBillForm(s => !s)}>+ Add Bill</Btn>
                </div>
              </div>

              {/* Add Bill Form */}
              {showBillForm && (
                <div style={{ background: '#f9f9f9', border: '1px solid #e5e5ea', borderRadius: 12, padding: 20, marginBottom: 28 }}>
                  <h4 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 600 }}>New Bill (Accounts Payable)</h4>
                  {billFormErr && <div style={{ color: '#ff3b30', fontSize: 13, marginBottom: 10 }}>{billFormErr}</div>}
                  <form onSubmit={handleCreateBill}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
                      {[
                        { label: 'Vendor Name *', key: 'vendorName', type: 'text' },
                        { label: 'Vendor Email', key: 'vendorEmail', type: 'email' },
                        { label: 'Bill Number', key: 'billNumber', type: 'text' },
                        { label: 'Bill Date *', key: 'billDate', type: 'date' },
                        { label: 'Due Date *', key: 'dueDate', type: 'date' },
                        { label: 'Category', key: 'category', type: 'text' },
                        { label: 'Amount (Net)', key: 'amountNet', type: 'number' },
                        { label: 'VAT Amount', key: 'amountVat', type: 'number' },
                        { label: 'Total Amount *', key: 'amountGross', type: 'number' },
                      ].map(f => (
                        <div key={f.key}>
                          <label style={{ fontSize: 12, color: '#86868b', display: 'block', marginBottom: 4 }}>{f.label}</label>
                          <input type={f.type} value={billForm[f.key]} step={f.type === 'number' ? '0.01' : undefined}
                            onChange={e => setBillForm(b => ({ ...b, [f.key]: e.target.value }))}
                            style={{ width: '100%', padding: '8px 10px', border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
                          />
                        </div>
                      ))}
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={{ fontSize: 12, color: '#86868b', display: 'block', marginBottom: 4 }}>Notes</label>
                        <input type="text" value={billForm.notes} onChange={e => setBillForm(b => ({ ...b, notes: e.target.value }))}
                          style={{ width: '100%', padding: '8px 10px', border: '1px solid #d2d2d7', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <Btn size="sm" variant="ghost" type="button" onClick={() => { setShowBillForm(false); setBillFormErr(''); }}>Cancel</Btn>
                      <Btn size="sm" type="submit" disabled={billSaving}>{billSaving ? 'Saving…' : 'Save Bill'}</Btn>
                    </div>
                  </form>
                </div>
              )}

              {agedLoad ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#86868b' }}>Loading…</div>
              ) : (
                <>
                  {/* AR Aging */}
                  <AgingTable
                    title="📥 Accounts Receivable — Unpaid Invoices"
                    rows={agedAR?.rows}
                    totals={agedAR?.totals || {}}
                    emptyMsg="No unpaid invoices. All clear! ✓"
                  />

                  {/* AP Aging */}
                  <AgingTable
                    title="📤 Accounts Payable — Outstanding Bills"
                    rows={agedAP?.rows}
                    totals={agedAP?.totals || {}}
                    emptyMsg="No outstanding bills."
                  />

                  {/* Bills list with Pay / Void actions */}
                  {bills.length > 0 && (
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>All Bills</h3>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: '#f5f5f7', borderBottom: '2px solid #e5e5ea' }}>
                              {['Vendor', 'Bill #', 'Bill Date', 'Due Date', 'Amount', 'Status', 'Actions'].map(h => (
                                <th key={h} style={{ textAlign: h === 'Amount' ? 'right' : 'left', padding: '8px 10px', fontWeight: 600 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {bills.map(b => (
                              <tr key={b.id} style={{ borderBottom: '1px solid #f0f0f0', opacity: b.status === 'void' ? 0.45 : 1 }}>
                                <td style={{ padding: '7px 10px', fontWeight: 500 }}>{b.vendorName}</td>
                                <td style={{ padding: '7px 10px', color: '#86868b' }}>{b.billNumber || '—'}</td>
                                <td style={{ padding: '7px 10px' }}>{b.billDate}</td>
                                <td style={{ padding: '7px 10px', color: b.status === 'unpaid' && b.dueDate < new Date().toISOString().substring(0,10) ? '#ff3b30' : '#1d1d1f' }}>{b.dueDate}</td>
                                <td style={{ textAlign: 'right', padding: '7px 10px', fontWeight: 600 }}>{fmt(b.amountGross)}</td>
                                <td style={{ padding: '7px 10px' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                                    background: b.status === 'paid' ? '#d1fae5' : b.status === 'void' ? '#f3f3f3' : '#fff7ed',
                                    color:      b.status === 'paid' ? '#065f46' : b.status === 'void' ? '#86868b' : '#c2410c' }}>
                                    {b.status.charAt(0).toUpperCase() + b.status.slice(1)}
                                  </span>
                                </td>
                                <td style={{ padding: '7px 10px' }}>
                                  {b.status === 'unpaid' && (
                                    <div style={{ display: 'flex', gap: 6 }}>
                                      <Btn size="xs" onClick={() => handlePayBill(b.id)}>✓ Mark Paid</Btn>
                                      <Btn size="xs" variant="ghost" onClick={() => handleVoidBill(b.id)}>Void</Btn>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })()}

        {/* ══════════ CONSOLIDATED P&L ══════════ */}
        {tab === 'Consolidated' && !isStaffUser && (
          !isPro ? <ProLock onUpgrade={(tier) => { setUpgradeTarget(tier || 'solo'); setShowUpgrade(true); }} trialExpired={trialStatus?.isExpired ?? false} /> :
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Consolidated P&L</h2>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  Group multiple clients (e.g. stores / branches) and view their combined financials.
                </div>
              </div>
              <Btn size="sm" onClick={() => { setShowNewGroup(true); setNewGroupName(''); setNewGroupClients([]); }}>
                + New Group
              </Btn>
            </div>

            {/* ── New group form ── */}
            {showNewGroup && (
              <Card style={{ marginBottom: 20 }}>
                <SectionHead>Create a Client Group</SectionHead>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
                  <input placeholder="Group name (e.g. ABC Pawnshop Stores)"
                    value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                    style={inp} />
                  <div style={{ fontSize: 12, color: T.muted, fontWeight: 600, marginTop: 4 }}>
                    Select member clients:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                    {(clients || []).map(c => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                        <input type="checkbox"
                          checked={newGroupClients.includes(c.id)}
                          onChange={e => setNewGroupClients(prev =>
                            e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                          )} />
                        {c.tradeName}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Btn disabled={newGroupBusy || !newGroupName.trim() || newGroupClients.length < 2}
                      onClick={async () => {
                        setNewGroupBusy(true);
                        try {
                          await createClientGroup({ name: newGroupName, clientIds: newGroupClients });
                          setShowNewGroup(false);
                          loadGroups();
                        } catch (e) { alert(e.message); }
                        finally { setNewGroupBusy(false); }
                      }}>
                      {newGroupBusy ? 'Saving…' : 'Create Group'}
                    </Btn>
                    <Btn variant="ghost" onClick={() => setShowNewGroup(false)}>Cancel</Btn>
                  </div>
                  {newGroupClients.length < 2 && newGroupName.trim() && (
                    <div style={{ fontSize: 12, color: T.orange }}>Select at least 2 clients.</div>
                  )}
                </div>
              </Card>
            )}

            {/* ── Group list ── */}
            {groupsLoading ? <div style={{ color: T.muted }}>Loading…</div>
            : groups.length === 0 && !showNewGroup ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>No groups yet</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Create a group to consolidate P&Ls across stores or branches.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {groups.map(g => {
                  const isEditing = editGroupId === g.id;
                  const memberNames = (g.memberClientIds || [])
                    .map(cid => (clients || []).find(c => c.id === cid)?.tradeName || cid)
                    .join(', ');
                  return (
                    <Card key={g.id}>
                      {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <input value={editGroupName} onChange={e => setEditGroupName(e.target.value)}
                            style={inp} placeholder="Group name" />
                          <div style={{ fontSize: 12, color: T.muted, fontWeight: 600 }}>Member clients:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                            {(clients || []).map(c => (
                              <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                <input type="checkbox"
                                  checked={editGroupClients.includes(c.id)}
                                  onChange={e => setEditGroupClients(prev =>
                                    e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                                  )} />
                                {c.tradeName}
                              </label>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <Btn onClick={async () => {
                              try {
                                await updateClientGroup(g.id, { name: editGroupName, clientIds: editGroupClients });
                                setEditGroupId(null);
                                loadGroups();
                              } catch (e) { alert(e.message); }
                            }}>Save</Btn>
                            <Btn variant="ghost" onClick={() => setEditGroupId(null)}>Cancel</Btn>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                              {g.memberClientIds?.length || 0} clients: {memberNames || '—'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Btn size="sm" variant="ghost" onClick={() => {
                              setEditGroupId(g.id);
                              setEditGroupName(g.name);
                              setEditGroupClients(g.memberClientIds || []);
                            }}>Edit</Btn>
                            <Btn size="sm" onClick={() => {
                              setSelectedGroupId(g.id);
                              setConsolData(null);
                              loadConsolidated(g.id, consolFrom, consolTo);
                            }} style={{ background: T.accent, color: '#fff' }}>View Report</Btn>
                            <Btn size="sm" variant="danger" onClick={async () => {
                              if (!confirm(`Delete group "${g.name}"?`)) return;
                              try {
                                await deleteClientGroup(g.id);
                                if (selectedGroupId === g.id) { setSelectedGroupId(''); setConsolData(null); }
                                loadGroups();
                              } catch (e) { alert(e.message); }
                            }}>Delete</Btn>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {/* ── Consolidated Report ── */}
            {selectedGroupId && (
              <div style={{ marginTop: 32 }}>
                <Card style={{ marginBottom: 16, padding: '14px 20px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>
                      {groups.find(g => g.id === selectedGroupId)?.name} — Consolidated P&L
                    </span>
                    <input type="date" value={consolFrom} onChange={e => setConsolFrom(e.target.value)}
                      style={{ ...inp, fontSize: 12, padding: '5px 10px' }} />
                    <span style={{ fontSize: 12, color: T.muted }}>to</span>
                    <input type="date" value={consolTo} onChange={e => setConsolTo(e.target.value)}
                      style={{ ...inp, fontSize: 12, padding: '5px 10px' }} />
                    <Btn size="sm" onClick={() => loadConsolidated(selectedGroupId, consolFrom, consolTo)}>Run</Btn>
                  </div>
                </Card>

                {consolLoading ? <div style={{ color: T.muted }}>Loading…</div>
                : consolData && (() => {
                  const { stores = [], consolidated } = consolData;
                  if (!stores.length) return (
                    <div style={{ color: T.muted, fontSize: 13, padding: 20 }}>No data for this period.</div>
                  );

                  const fmt = n => `₱${(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                  const rows = [
                    { label: 'Revenue',             key: 'revenue',           bold: true },
                    { label: 'Cost of Sales',        key: 'costOfSales',       indent: true },
                    { label: 'Gross Profit',         key: 'grossProfit',       bold: true },
                    { label: 'Operating Expenses',   key: 'operatingExpenses', indent: true },
                    { label: 'Net Profit / (Loss)',  key: 'netProfit',         bold: true, highlight: true },
                  ];

                  return (
                    <Card style={{ padding: 0, overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: T.bg }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                              color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>Account</th>
                            {stores.map(s => (
                              <th key={s.clientId} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600,
                                color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>
                                {s.clientName}
                              </th>
                            ))}
                            <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700,
                              color: T.accent, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>TOTAL</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr key={row.key} style={{
                              borderBottom: i < rows.length - 1 ? `1px solid ${T.border}` : 'none',
                              background: row.highlight ? T.accentL : 'transparent',
                            }}>
                              <td style={{ padding: '10px 14px', fontWeight: row.bold ? 600 : 400,
                                paddingLeft: row.indent ? 28 : 14, color: row.indent ? T.muted : 'inherit' }}>
                                {row.label}
                              </td>
                              {stores.map(s => (
                                <td key={s.clientId} style={{ padding: '10px 14px', textAlign: 'right',
                                  fontWeight: row.bold ? 600 : 400,
                                  color: row.key === 'netProfit' ? (s[row.key] >= 0 ? T.green : T.red) : 'inherit' }}>
                                  {fmt(s[row.key])}
                                </td>
                              ))}
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700,
                                color: row.key === 'netProfit'
                                  ? (consolidated[row.key] >= 0 ? T.green : T.red)
                                  : T.accent }}>
                                {fmt(consolidated?.[row.key])}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </Card>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ══════════ PORTFOLIO (All Clients) ══════════ */}
        {tab === 'Portfolio' && (() => {
          const clients = portfolioData?.clients || [];
          const periodLabel = portfolioPeriod
            ? new Date(portfolioPeriod + '-01').toLocaleString('en-PH', { month: 'long', year: 'numeric' })
            : '';
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Portfolio Overview</h2>
                  <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                    All {clients.length} client{clients.length !== 1 ? 's' : ''} · {periodLabel}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="month" value={portfolioPeriod}
                    onChange={e => { setPortfolioPeriod(e.target.value); loadPortfolio(e.target.value); }}
                    style={{ ...inp, width: 160, padding: '7px 10px' }} />
                  <Btn size="sm" variant="ghost" onClick={() => loadPortfolio()}>↻ Refresh</Btn>
                </div>
              </div>

              {portfolioLoad ? (
                <div style={{ color: T.muted }}>Loading portfolio…</div>
              ) : clients.length === 0 ? (
                <Card style={{ textAlign: 'center', color: T.muted, padding: 32 }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>📁</div>
                  No clients assigned yet. Clients will appear here once assigned to your account.
                </Card>
              ) : (
                <>
                  {/* Summary metrics */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
                    {[
                      { label: 'Total Clients',    value: clients.length,                                  fmt: 'count' },
                      { label: 'Total Revenue',     value: clients.reduce((s, c) => s + (c.metrics?.revenue || 0), 0), fmt: 'peso' },
                      { label: 'Total Net Profit',  value: clients.reduce((s, c) => s + (c.metrics?.profit  || 0), 0), fmt: 'peso' },
                      { label: 'VAT to Remit',      value: clients.reduce((s, c) => s + Math.max(0, c.metrics?.vatDue || 0), 0), fmt: 'peso' },
                    ].map(m => (
                      <div key={m.label} style={{ background: T.surface, borderRadius: T.radius, padding: '16px 20px',
                        border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
                        <div style={{ fontSize: 12, color: T.muted, marginBottom: 4 }}>{m.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: T.text }}>
                          {m.fmt === 'peso' ? peso(m.value) : m.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Client table */}
                  <Card style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                      <thead>
                        <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                          {['Client','Type','Revenue','Expenses','Profit','VAT Due','Txns','Deadlines'].map(h => (
                            <th key={h} style={{ textAlign: h === 'Client' ? 'left' : 'right', padding: '8px 10px',
                              fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clients.map(c => {
                          const m = c.metrics || {};
                          const dl = c.deadlines || {};
                          const urgColor = dl.urgent > 0 ? T.red : dl.upcoming > 0 ? T.orange : T.green;
                          return (
                            <tr key={c.id}
                              onClick={() => { setActive(c); setTab('Dashboard'); }}
                              style={{ borderBottom: `1px solid ${T.border}30`, cursor: 'pointer' }}
                              onMouseEnter={e => e.currentTarget.style.background = T.accentL}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                              <td style={{ padding: '9px 10px' }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{c.tradeName}</div>
                                {c.tin && <div style={{ fontSize: 11, color: T.muted }}>TIN: {c.tin}</div>}
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 12, color: T.muted }}>
                                {c.type || '—'}
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 13, color: T.text }}>
                                {peso(m.revenue || 0)}
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 13, color: T.text }}>
                                {peso(m.expenses || 0)}
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 13,
                                fontWeight: 600, color: (m.profit || 0) >= 0 ? T.accent : T.red }}>
                                {peso(m.profit || 0)}
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 13,
                                color: (m.vatDue || 0) > 0 ? T.orange : T.muted }}>
                                {peso(Math.max(0, m.vatDue || 0))}
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: 13, color: T.muted }}>
                                {m.txCount || 0}
                              </td>
                              <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                                {dl.total === 0 ? (
                                  <span style={{ fontSize: 12, color: T.muted }}>None</span>
                                ) : (
                                  <span style={{ fontSize: 12, fontWeight: 600, color: urgColor }}>
                                    {dl.urgent > 0 ? `🔴 ${dl.urgent} urgent` : `🟡 ${dl.upcoming} upcoming`}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ fontSize: 11.5, color: T.muted, marginTop: 12 }}>
                      Click any row to go to that client's dashboard. Amounts shown in NET (VAT-exclusive) for the selected period.
                    </div>
                  </Card>
                </>
              )}
            </div>
          );
        })()}

        {/* ══════════ INVOICES ══════════ */}
        {tab === 'Invoices' && active && (
          <InvoicesTab clientId={active.id} isAccountant={true} />
        )}

        {/* ══════════ BUSINESS SETUP ══════════ */}
        {tab === 'Business Setup' && active && (() => {
          // Local form state is managed in a sub-component to isolate re-renders
          return <BusinessSetupTab client={active} onSaved={client => {
            // Refresh the clients list so header / dashboard reflects changes
            getClients().then(r => {
              if (r?.clients) {
                setClients(r.clients);
                const updated = r.clients.find(c => c.id === client.id);
                if (updated) setActive(updated);
              }
            }).catch(() => {});
          }} />;
        })()}

        {/* ══════════ REFERRAL ══════════ */}
        {tab === 'Referral' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Referral Program</h2>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  Earn <strong style={{ color: '#ff9500' }}>
                    ₱{refData?.rates?.signupBonus ?? 100} credits per signup
                  </strong> + <strong style={{ color: '#ff9500' }}>
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
                    Share with business owners or colleagues. You earn <strong>₱{refData?.rates?.signupBonus ?? 100} credits</strong> per signup + <strong>{refData?.rates?.subscriptionPercent ?? 10}%</strong> of every subscription payment they make.
                  </div>
                </Card>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
                  {[
                    { label: 'Total Referrals', value: refData.stats.total,    color: brandAccent },
                    { label: 'Pending',          value: refData.stats.pending,  color: '#ff9500' },
                    { label: 'Credited',         value: refData.stats.credited, color: T.green },
                    { label: 'Cash Balance',     value: `₱${(refData.stats.balance||0).toLocaleString()}`, color: '#af52de' },
                  ].map(s => (
                    <Card key={s.label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{s.label}</div>
                    </Card>
                  ))}
                </div>

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
                        Contact <strong>mym@kaimanco.com</strong> to redeem as a subscription credit or cash payout.
                      </div>
                    </div>
                  </div>
                )}

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
                                color: r.status === 'credited' ? T.green : '#ff9500' }}>
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
                  </Card>
                )}
              </>
            )}
          </div>
        )}

        {/* ════════════ MY TEAM ════════════ */}
        {tab === 'My Team' && !isStaffUser && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>My Team</h2>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  Add staff sub-users and assign them to specific clients. They log in with their own credentials.
                </div>
              </div>
              <Btn size="sm" onClick={() => { setShowAddStaff(s => !s); setNewStaffErr(''); }}>
                {showAddStaff ? '✕ Cancel' : '+ Invite Staff'}
              </Btn>
            </div>

            {/* Add staff form */}
            {showAddStaff && (
              <Card style={{ marginBottom: 20, background: '#f9fffe', border: `1px solid ${T.accent}30` }}>
                <SectionHead>New Staff Member</SectionHead>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <input placeholder="Full name" value={newStaffName}
                    onChange={e => setNewStaffName(e.target.value)}
                    style={{ ...inp, flex: '1 1 160px' }} />
                  <input placeholder="Email address" type="email" value={newStaffEmail}
                    onChange={e => setNewStaffEmail(e.target.value)}
                    style={{ ...inp, flex: '1 1 200px' }} />
                  <div style={{ position: 'relative', flex: '1 1 180px' }}>
                    <input placeholder="Temporary password" type={newStaffPwShow ? 'text' : 'password'}
                      value={newStaffPw} onChange={e => setNewStaffPw(e.target.value)}
                      style={{ ...inp, width: '100%', paddingRight: 36, boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setNewStaffPwShow(s => !s)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', fontSize: 15,
                        color: T.muted, padding: 0, lineHeight: 1 }}>
                      {newStaffPwShow ? '🙈' : '👁️'}
                    </button>
                  </div>
                  <Btn disabled={newStaffBusy} onClick={async () => {
                    if (!newStaffName || !newStaffEmail || !newStaffPw)
                      return setNewStaffErr('All fields are required.');
                    setNewStaffBusy(true); setNewStaffErr('');
                    try {
                      await createStaff({ name: newStaffName, email: newStaffEmail, password: newStaffPw });
                      setNewStaffName(''); setNewStaffEmail(''); setNewStaffPw('');
                      setShowAddStaff(false);
                      loadTeam();
                    } catch (e) { setNewStaffErr(e.message); }
                    finally { setNewStaffBusy(false); }
                  }}>
                    {newStaffBusy ? 'Creating…' : 'Create'}
                  </Btn>
                </div>
                {newStaffErr && <div style={{ color: '#ff3b30', fontSize: 12 }}>{newStaffErr}</div>}
              </Card>
            )}

            {teamLoading && <div style={{ color: T.muted, fontSize: 14 }}>Loading…</div>}
            {teamError  && <div style={{ color: '#ff3b30', fontSize: 13, padding: '12px 16px',
              background: '#fff2f2', borderRadius: 8, border: '1px solid #ffcdd2', marginBottom: 16 }}>
              ⚠️ {teamError}
            </div>}

            {!teamLoading && teamStaff.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>No staff yet</div>
                <div style={{ fontSize: 13, marginTop: 6 }}>Invite a staff member to get started.</div>
              </div>
            )}

            {teamStaff.map(member => {
              const assignedSet = new Set(member.assignedClientIds || []);
              return (
                <Card key={member.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{member.name}</div>
                      <div style={{ fontSize: 12, color: T.muted }}>{member.email}</div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                        Staff · {assignedSet.size} client{assignedSet.size !== 1 ? 's' : ''} assigned
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Btn size="sm" variant="ghost" onClick={() => {
                        setAuditStaffFilter(member.id);
                        setTab('Audit Log');
                        loadAudit(member.id);
                      }}>👀 Activity</Btn>
                      <Btn size="sm" variant="danger" onClick={async () => {
                        if (!confirm(`Remove ${member.name}? This cannot be undone.`)) return;
                        try { await deleteStaff(member.id); loadTeam(); }
                        catch (e) { alert(e.message); }
                      }}>Remove</Btn>
                    </div>
                  </div>

                  {/* ── Reset password ─────────────────────────────── */}
                  {(() => {
                    const rs = staffReset[member.id] || {};
                    const patchRs = patch => setStaffReset(prev => ({
                      ...prev, [member.id]: { ...(prev[member.id] || {}), ...patch }
                    }));
                    return (
                      <div style={{ marginBottom: 14 }}>
                        {!rs.show ? (
                          <button onClick={() => patchRs({ show: true, pw: '', showPw: false, err: '' })}
                            style={{ fontSize: 12, color: T.accent, background: 'none', border: 'none',
                              cursor: 'pointer', padding: 0, fontFamily: 'inherit', textDecoration: 'underline' }}>
                            🔑 Reset password
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ position: 'relative' }}>
                              <input placeholder="New password (min 6 chars)"
                                type={rs.showPw ? 'text' : 'password'}
                                value={rs.pw || ''}
                                onChange={e => patchRs({ pw: e.target.value })}
                                style={{ ...inp, paddingRight: 34, width: 220, boxSizing: 'border-box' }} />
                              <button type="button" onClick={() => patchRs({ showPw: !rs.showPw })}
                                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 13,
                                  color: T.muted, padding: 0, lineHeight: 1 }}>
                                {rs.showPw ? '🙈' : '👁️'}
                              </button>
                            </div>
                            <Btn size="sm" disabled={rs.busy} onClick={async () => {
                              if (!rs.pw || rs.pw.length < 6) return patchRs({ err: 'Min 6 characters.' });
                              patchRs({ busy: true, err: '' });
                              try {
                                await resetStaffPassword(member.id, rs.pw);
                                patchRs({ show: false, busy: false, pw: '' });
                              } catch (e) { patchRs({ err: e.message, busy: false }); }
                            }}>
                              {rs.busy ? 'Saving…' : 'Save'}
                            </Btn>
                            <button onClick={() => patchRs({ show: false })}
                              style={{ fontSize: 12, color: T.muted, background: 'none', border: 'none',
                                cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                              Cancel
                            </button>
                            {rs.err && <span style={{ fontSize: 12, color: '#ff3b30' }}>{rs.err}</span>}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <SectionHead>Assigned Clients</SectionHead>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {clients.map(c => {
                      const checked = assignedSet.has(c.id);
                      return (
                        <label key={c.id} style={{
                          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                          padding: '5px 12px', borderRadius: 20, fontSize: 13,
                          background: checked ? T.accentL : '#f5f5f7',
                          border: `1px solid ${checked ? T.accent : T.border}`,
                          color: checked ? T.accent : T.text,
                          fontWeight: checked ? 600 : 400,
                          transition: 'all .15s',
                        }}>
                          <input type="checkbox" checked={checked} style={{ display: 'none' }}
                            onChange={async () => {
                              const next = checked
                                ? [...assignedSet].filter(id => id !== c.id)
                                : [...assignedSet, c.id];
                              try {
                                const updated = await assignStaff(member.id, next);
                                setTeamStaff(prev => prev.map(m =>
                                  m.id === member.id
                                    ? { ...m, assignedClientIds: updated.staff.assignedClientIds }
                                    : m
                                ));
                              } catch (e) { alert(e.message); }
                            }} />
                          {checked ? '✓ ' : ''}{c.tradeName}
                        </label>
                      );
                    })}
                  </div>
                  {clients.length === 0 && (
                    <div style={{ fontSize: 13, color: T.muted }}>No clients yet.</div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

      </div>

      {showFirmSettings && (
        <FirmSettings
          user={meData}
          onClose={() => setShowFirmSettings(false)}
          onSaved={data => setMeData(prev => ({ ...prev, ...data }))}
        />
      )}

      {/* CSV Import Modal */}
      {showCSVImport && active && (
        <CSVImportModal
          clientId={active.id}
          onClose={() => setShowCSVImport(false)}
          onImported={() => { loadTxns(); if (tab === 'Dashboard') loadDashboard(); }}
        />
      )}

      {/* Balance Sheet Opening Balances Import */}
      {showBSImport && active && (
        <BalanceSheetImport
          clientId={active.id}
          onClose={() => setShowBSImport(false)}
          onImported={() => { loadJournals(); if (tab === 'Dashboard') loadDashboard(); }}
        />
      )}

      {/* TxModal — module-level, no focus loss on typing */}
      {showTx && (
        <TxModal
          key={active?.id}
          clientId={active?.id}
          client={active}
          onSaved={() => { loadTxns(); if (tab === 'Dashboard') loadDashboard(); if (tab === 'Books') loadBooksReport(); }}
          onClose={() => setShowTx(false)}
        />
      )}
      {/* JournalEntryModal */}
      {showJE && (
        <JournalEntryModal
          key={active?.id + '-je'}
          clientId={active?.id}
          onSaved={() => { loadJournals(); }}
          onClose={() => setShowJE(false)}
        />
      )}

      {/* AssetModal */}
      {showAddAsset && (
        <AssetModal
          key={active?.id + '-asset'}
          clientId={active?.id}
          onSaved={() => loadAssets()}
          onClose={() => setShowAddAsset(false)}
        />
      )}

      {/* ContactModal */}
      {showAddCon && (
        <ContactModal
          key={(editContact?.id || 'new') + '-contact'}
          clientId={active?.id}
          existing={editContact}
          onSaved={() => loadContacts()}
          onClose={() => { setShowAddCon(false); setEditContact(null); }}
        />
      )}

      {/* Lapsing Schedule Modal */}
      {showLapsing && lapsingData && (
        <ModalShell title={`Lapsing Schedule — ${lapsingData.asset?.name}`} onClose={() => setShowLapsing(false)} wide>
          <div style={{ marginBottom: 16, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
            {[
              ['Cost',             peso(lapsingData.asset?.cost)],
              ['Salvage Value',    peso(lapsingData.asset?.salvageValue)],
              ['Useful Life',      `${lapsingData.asset?.usefulLifeMonths} months`],
              ['Method',           lapsingData.asset?.method],
              ['Monthly Dep.',     peso(lapsingData.asset?.monthlyDepreciation)],
              ['Total Dep.',       peso(lapsingData.asset?.totalDepreciation)],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: T.bg, zIndex: 1 }}>
                <tr>
                  {['Period','Depreciation','Accumulated Dep.','Book Value'].map((h, i) => (
                    <th key={h} style={{ padding: '9px 14px', textAlign: i === 0 ? 'left' : 'right',
                      fontWeight: 600, color: T.muted, fontSize: 11,
                      borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(lapsingData.schedule || []).map((row, i) => (
                  <tr key={row.period} style={{ borderBottom: `1px solid ${T.border}`,
                    background: i % 2 === 0 ? T.surface : T.bg }}>
                    <td style={{ padding: '8px 14px', fontWeight: 500 }}>{row.period}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: T.orange }}>{peso(row.depreciation)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', color: T.muted }}>{peso(row.accumulated)}</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: T.accent }}>{peso(row.bookValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ModalShell>
      )}

      {/* ── Accountant Upgrade Modal ── */}
      {showUpgrade && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowUpgrade(false); }}>
          <div style={{ background: T.surface, borderRadius: 20, padding: '32px 36px', width: '100%',
            maxWidth: 520, boxShadow: '0 8px 40px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Upgrade Your Plan</h2>
              <button onClick={() => setShowUpgrade(false)} style={{ background: 'none', border: 'none',
                fontSize: 22, cursor: 'pointer', color: T.muted, lineHeight: 1 }}>×</button>
            </div>

            {/* Plan picker */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block',
                marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Select Plan</label>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
                {[
                  { tier: 'solo',         label: 'Solo',         price: '₱599',   clients: '5 clients',   color: '#0071e3', note: null },
                  { tier: 'professional', label: 'Professional', price: '₱1,499', clients: '15 clients',  color: '#ff9500', note: null },
                  { tier: 'firm',         label: 'Firm',         price: '₱2,999', clients: '50 clients',  color: '#34c759', note: null },
                  { tier: 'agency',       label: 'Agency',       price: '₱4,999', clients: '100 clients', color: '#af52de',
                    note: 'Rolling Forecast & Comparative — Phase 2' },
                ].map(p => (
                  <div key={p.tier} onClick={() => setUpgradeTarget(p.tier)}
                    style={{ border: `2px solid ${upgradeTarget === p.tier ? p.color : T.border}`,
                      borderRadius: 10, padding: '12px 14px', cursor: 'pointer',
                      background: upgradeTarget === p.tier ? `${p.color}10` : T.bg,
                      transition: 'all .15s' }}>
                    <div style={{ fontWeight: 700, color: p.color, fontSize: 14 }}>{p.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.text, margin: '4px 0 2px' }}>
                      {p.price}<span style={{ fontSize: 11, fontWeight: 400, color: T.muted }}>/mo</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.muted }}>{p.clients}</div>
                    {p.note && (
                      <div style={{ marginTop: 5, fontSize: 10, fontWeight: 600, color: p.color,
                        background: `${p.color}15`, borderRadius: 6, padding: '2px 7px',
                        display: 'inline-block', letterSpacing: '0.2px' }}>
                        ✦ {p.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Status messages */}
            {pmError && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 9, fontSize: 13,
                background: '#fff5f5', color: '#d32f2f', border: '1px solid #d32f2f30' }}>
                {pmError}
              </div>
            )}
            {upgradeMsg && (
              <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 9, fontSize: 13,
                background: upgradeMsg.startsWith('✓') ? '#f0fff4' : '#fff5f5',
                color: upgradeMsg.startsWith('✓') ? '#15803d' : '#d32f2f',
                border: `1px solid ${upgradeMsg.startsWith('✓') ? '#15803d' : '#d32f2f'}30` }}>
                {upgradeMsg}
              </div>
            )}

            {/* PayMongo — primary payment */}
            {pmPolling ? (
              <div style={{ textAlign: 'center', padding: '18px 0', marginBottom: 16 }}>
                <div style={{ fontSize: 14, color: T.muted, marginBottom: 6 }}>
                  Waiting for payment confirmation...
                </div>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 10 }}>
                  Complete payment in the tab that opened. This page updates automatically.
                </div>
                <button onClick={() => { clearInterval(pmPollTimer); setPmPolling(false); setPmLinkId(null); }}
                  style={{ fontSize: 12, color: T.muted, background: 'none', border: 'none',
                    cursor: 'pointer', textDecoration: 'underline' }}>
                  Cancel / use bank transfer instead
                </button>
              </div>
            ) : !pmLinkId ? (
              <div style={{ marginBottom: 18 }}>
                <button disabled={pmCreating}
                  onClick={async () => {
                    setPmCreating(true); setPmError('');
                    try {
                      const r = await createPaymongoLink(null, upgradeTarget, 'accountant');
                      setPmLinkId(r.linkId);
                      window.open(r.checkoutUrl, '_blank', 'noopener');
                      setPmPolling(true);
                      const timer = setInterval(async () => {
                        try {
                          const s = await pollPaymongoStatus(r.linkId);
                          if (s.status === 'paid') {
                            clearInterval(timer); setPmPolling(false);
                            setUpgradeMsg('✓ Payment confirmed! Your plan has been upgraded.');
                            setTimeout(() => {
                              setShowUpgrade(false); setUpgradeMsg('');
                              getMe().then(u => localStorage.setItem('ml_user', JSON.stringify(u))).catch(() => {});
                            }, 2500);
                          }
                        } catch (_) {}
                      }, 4000);
                      setPmPollTimer(timer);
                    } catch (e) { setPmError('Payment error: ' + e.message); }
                    finally { setPmCreating(false); }
                  }}
                  style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none',
                    background: pmCreating ? '#ccc' : '#00a551', color: '#fff',
                    fontSize: 15, fontWeight: 700,
                    cursor: pmCreating ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                  {pmCreating ? 'Creating link...' : 'Pay Online — GCash / Maya / Card'}
                </button>
                <div style={{ marginTop: 6, fontSize: 11, color: T.muted, textAlign: 'center' }}>
                  Powered by PayMongo · Secure checkout · Plan activates instantly
                </div>
              </div>
            ) : null}

            {/* Manual bank transfer fallback */}
            <div style={{ textAlign: 'center', marginBottom: 12 }}>
              <button onClick={() => setShowManual(m => !m)}
                style={{ fontSize: 12, color: T.muted, background: 'none', border: 'none',
                  cursor: 'pointer', textDecoration: 'underline' }}>
                {showManual ? 'Hide manual transfer option' : 'Already paid via GCash / bank transfer?'}
              </button>
            </div>
            {showManual && (
              <>
                <div style={{ background: '#f0f8ff', border: '1px solid #0071e330', borderRadius: 10,
                  padding: '14px 16px', marginBottom: 14, fontSize: 13 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: T.text }}>Manual Transfer</div>
                  <div style={{ color: T.muted, lineHeight: 1.7 }}>
                    <strong style={{ color: T.text }}>GCash / Maya:</strong> 0998-991-9660 (Kaiman and Co.)<br />
                    <strong style={{ color: T.text }}>Bank transfer:</strong> BDO — Kaiman and Co. (email for account details)<br />
                    Enter reference and amount below — we verify and upgrade within 1 business day.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {['gcash', 'maya', 'bank'].map(m => (
                    <button key={m} onClick={() => setUpgradeMethod(m)}
                      style={{ padding: '7px 14px', borderRadius: 8,
                        border: `1.5px solid ${upgradeMethod === m ? T.accent : T.border}`,
                        background: upgradeMethod === m ? `${T.accent}10` : T.surface,
                        color: upgradeMethod === m ? T.accent : T.muted,
                        fontWeight: 600, fontSize: 13, cursor: 'pointer',
                        fontFamily: 'inherit', textTransform: 'uppercase' }}>
                      {m}
                    </button>
                  ))}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block',
                    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reference No. *</label>
                  <input value={upgradeRef} onChange={e => setUpgradeRef(e.target.value)}
                    placeholder="e.g. GC2025001234"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9,
                      border: `1px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit',
                      outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block',
                    marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount Paid (PHP)</label>
                  <input type="number" value={upgradeAmount} onChange={e => setUpgradeAmount(e.target.value)}
                    placeholder="e.g. 599"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 9,
                      border: `1px solid ${T.border}`, fontSize: 14, fontFamily: 'inherit',
                      outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                  <button onClick={() => { setShowUpgrade(false); setShowManual(false); }}
                    style={{ flex: 1, padding: '11px', borderRadius: 10, border: `1px solid ${T.border}`,
                      background: T.surface, color: T.muted, fontSize: 14, fontWeight: 600,
                      cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button onClick={submitUpgrade} disabled={upgradeSubmitting}
                    style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none',
                      background: upgradeSubmitting ? T.border : T.accent, color: '#fff',
                      fontSize: 14, fontWeight: 700,
                      cursor: upgradeSubmitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                    {upgradeSubmitting ? 'Submitting...' : 'Submit Payment Notification'}
                  </button>
                </div>
              </>
            )}

            <div style={{ marginTop: 14, fontSize: 12, color: T.muted, textAlign: 'center' }}>
              Questions? Email <a href="mailto:mym@kaimanco.com" style={{ color: T.accent }}>mym@kaimanco.com</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
