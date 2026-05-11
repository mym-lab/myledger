// ─── AccountantPortal.jsx ─────────────────────────────────────────────────────
// MyLedger — Accountant interface
// Accountants see all client businesses assigned to them.
// Features: Dashboard (chart + filings) · Transactions · Income Statement · Balance Sheet · BIR Reminders
// Apple light theme with teal accountant accent.

import { useState, useEffect, useRef } from 'react';
import {
  getClients,
  getTransactions, createTransaction, voidTransaction,
  getIncomeReport, getBalanceReport, getCashFlowReport,
  getBooksReport, getGeneralJournal, getGeneralLedger,
  getCOA, seedCOA, createAccount, updateAccount, deleteAccount,
  getPeriodLocks, lockPeriod, unlockPeriod,
  getAuditLog,
  getBirDeadlines, getBirVatBalance,
  getJournalEntries, createJournalEntry, deleteJournalEntry,
  assignEncoder, removeEncoder,
  getAssets, createAsset, deleteAsset, getLapsing,
  getContacts, createContact, updateContact, deleteContact,
  getSLSP,
  backupClient,
  scanReceipt,
  getMyReferrals,
} from '../api.js';
import {
  printReport,
  printFSReport,
  buildIncomeStatementHtml,
  buildBalanceSheetHtml,
  buildCashFlowHtml,
  buildBIRReturnHtml,
  buildBooksHtml,
} from '../utils/printReport.js';

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

const INCOME_CATS  = ['Sale of Goods','Sale of Services','Professional Fees','Rental Income','Interest Income','Commission Income','Dividend Income','Other Income'];
const EXPENSE_CATS = ['Cost of Goods Sold','Salaries & Wages','Rent','Utilities','Office Supplies','Advertising & Marketing','Transportation & Travel','Professional Fees','Repairs & Maintenance','Bank Charges & Fees','Taxes & Licenses','Depreciation','Insurance','Interest Expense','Other Expenses'];
const CUSTOM_OPT   = '＋ Other (specify)';

const TAX_TYPES = [
  { code: '2550M',  label: '2550M — Monthly VAT Return' },
  { code: '2550Q',  label: '2550Q — Quarterly VAT Return' },
  { code: '2551M',  label: '2551M — Monthly Percentage Tax (Non-VAT)' },
  { code: '2551Q',  label: '2551Q — Quarterly Percentage Tax (Non-VAT)' },
  { code: '1601C',  label: '1601-C — WHT on Compensation' },
  { code: '1601EQ', label: '1601-EQ — Expanded WHT (Quarterly)' },
  { code: '1702Q',  label: '1702Q — Quarterly IT (Corp)' },
  { code: '1702',   label: '1702 — Annual IT (Corp)' },
  { code: '1701Q',  label: '1701Q — Quarterly IT (Individual)' },
  { code: '1701',   label: '1701 — Annual IT (Individual)' },
  { code: '1550',   label: '1550 — Documentary Stamp Tax' },
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
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}>
      <div style={{ background: T.surface, borderRadius: 16, padding: 28, width: '100%',
        maxWidth: wide ? 720 : 480, boxShadow: T.shadowMd, maxHeight: '90vh', overflowY: 'auto' }}
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
  'BIR Returns', 'Alphalist',
  'Income Statement', 'Balance Sheet', 'Cash Flow', 'Assets', 'Contacts', 'SLSP',
]);

// Accountant tier definitions
const ACCT_TIERS = {
  free:         { label: 'Free',         color: '#6e6e73', maxClients: 1,    price: 0    },
  solo:         { label: 'Solo',         color: '#0071e3', maxClients: 5,    price: 599  },
  professional: { label: 'Professional', color: '#ff9500', maxClients: 15,   price: 1499 },
  firm:         { label: 'Firm',         color: '#34c759', maxClients: null, price: 2999 },
  agency:       { label: 'Agency',       color: '#af52de', maxClients: null, price: 4999 },
};

function ProLock() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 360, padding: 40 }}>
      <div style={{ background: T.surface, borderRadius: 20, padding: '40px 48px', textAlign: 'center',
        boxShadow: T.shadowMd, border: `1px solid ${T.border}`, maxWidth: 440 }}>
        <div style={{ fontSize: 52, marginBottom: 14 }}>🔒</div>
        <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: T.text }}>Paid Plan Feature</h3>
        <p style={{ margin: '0 0 20px', color: T.muted, fontSize: 14, lineHeight: 1.65 }}>
          This tab is available on any paid plan. Upgrade to unlock Journal Entries,
          Trial Balance, Accounting Books, BIR Returns, Alphalist,
          Financial Statements, and Cash Flow.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, textAlign: 'left' }}>
          {[
            { label: 'Solo',         price: '₱599',   clients: '5 clients',         color: '#0071e3' },
            { label: 'Professional', price: '₱1,499', clients: '15 clients',        color: '#ff9500' },
            { label: 'Firm',         price: '₱2,999', clients: 'Unlimited clients', color: '#34c759' },
            { label: 'Agency',       price: '₱4,999', clients: 'Unlimited + white-label', color: '#af52de' },
          ].map(t => (
            <div key={t.label} style={{ background: `${t.color}10`, border: `1px solid ${t.color}30`,
              borderRadius: 8, padding: '8px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: t.color }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{t.price}<span style={{ fontSize: 11, color: T.muted, fontWeight: 400 }}>/mo</span></div>
              <div style={{ fontSize: 11, color: T.muted }}>{t.clients}</div>
            </div>
          ))}
        </div>
        <a href="mailto:mym@kaimanco.com?subject=MyLedger%20Accountant%20Plan%20Upgrade"
          style={{ display: 'block', background: T.accentL, borderRadius: 10, padding: '12px 16px',
            fontSize: 13, color: T.accent, textDecoration: 'none', cursor: 'pointer',
            border: `1px solid ${T.accent}30`, transition: 'background .15s' }}
          onMouseOver={e => e.currentTarget.style.background = '#d6eaff'}
          onMouseOut={e => e.currentTarget.style.background = T.accentL}>
          📧 Email <strong>mym@kaimanco.com</strong> to upgrade your plan →
        </a>
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

const INCOME_SETTLEMENTS  = ['cash','ar','ewallet','bank_transfer','check'];
const EXPENSE_SETTLEMENTS = ['cash','ap','ewallet','bank_transfer','check','credit_card'];
const SETTLEMENT_LABELS   = {
  cash: 'Cash', ar: 'Accounts Receivable', ap: 'Accounts Payable',
  ewallet: 'E-wallet (GCash/Maya)', bank_transfer: 'Bank Transfer',
  check: 'Check / Cheque', credit_card: 'Credit Card',
};

// ─── TxModal (module-level — own state, no parent remount) ───────────────────
function TxModal({ clientId, client, onSaved, onClose }) {
  const isOPT   = client?.taxRegime === 'opt';
  const optRate = client?.optRate ?? 0.03;

  const blank = {
    type: 'income', amount: '', description: '', category: '', customCat: '',
    vatType: 'vatable', supplierVatType: 'vat', settlement: 'cash', account: '',
    counterpartyName: '', counterpartyTin: '', counterpartyAddress: '',
    referenceNo: '', notes: '',
    ewtRate: '0',  // expense only — expanded withholding tax rate
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
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

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Description *">
            <input style={inp} required value={form.description} onChange={set('description')}
              placeholder="Brief description" />
          </Fld>
          <Fld label="Reference / OR No.">
            <input style={inp} value={form.referenceNo} onChange={set('referenceNo')}
              placeholder="Invoice or OR number" />
          </Fld>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
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

        <div style={{ display: 'grid', gridTemplateColumns: isCustom ? '1fr 1fr' : '1fr', gap: '0 16px' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 16px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: '0 16px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Cost (₱) *">
            <input style={inp} type="number" min="0.01" step="0.01" required
              value={form.cost} onChange={set('cost')} placeholder="0.00" />
          </Fld>
          <Fld label="Salvage Value (₱)">
            <input style={inp} type="number" min="0" step="0.01"
              value={form.salvageValue} onChange={set('salvageValue')} placeholder="0.00" />
          </Fld>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
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
function computeAlphalist(transactions) {
  const map = {};
  transactions.filter(t => t.type === 'expense').forEach(t => {
    const key = t.counterpartyTin || '__NO_TIN__' + (t.counterpartyName || '');
    if (!map[key]) map[key] = {
      tin: t.counterpartyTin || '—', name: t.counterpartyName || 'Unknown Vendor',
      address: t.counterpartyAddress || '—',
      gross: 0, net: 0, vat: 0, txCount: 0,
    };
    map[key].gross   += t.gross || 0;
    map[key].net     += t.net   || 0;
    map[key].vat     += t.vat   || 0;
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
  return { grossSales, outputVAT, grossPurchases, inputVAT, netVATDue, excessInputVAT,
    txCount: filtered.length };
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
  return { grossSales, optRate, percentageTax, txCount: filtered.length };
}

const TABS = ['Dashboard', 'Transactions', 'Journal Entries', 'Trial Balance', 'Books', 'General Journal', 'General Ledger', 'COA', 'Period Lock', 'Audit Log', 'BIR Returns', 'Alphalist', 'SLSP', 'Income Statement', 'Balance Sheet', 'Cash Flow', 'Assets', 'Contacts', 'BIR Reminders', 'Referral'];

const BOOKS_COLUMNS = {
  sales: ['Date','Ref / OR No.','Customer','Description','Gross Sales','Output VAT','Net Sales'],
  purchases: ['Date','Ref No.','Vendor','Description','Gross Purchases','Input VAT','Net Purchases'],
  receipts: ['Date','Ref No.','Received From','Description','Mode','Amount (Gross)'],
  disbursements: ['Date','Ref No.','Paid To','Description','Mode','Amount (Gross)'],
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function AccountantPortal({ onLogout }) {
  // Read stored user to determine tier
  const storedUser    = (() => { try { return JSON.parse(localStorage.getItem('ml_user') || 'null'); } catch { return null; } })();
  const accountantTier = storedUser?.accountantTier || 'free';
  const tierInfo       = ACCT_TIERS[accountantTier] || ACCT_TIERS.free;
  const isPro          = accountantTier !== 'free';   // any paid tier unlocks features
  const isAgency       = accountantTier === 'agency';
  const maxClients     = tierInfo.maxClients;          // null = unlimited
  const firmName       = isAgency && storedUser?.firmName    ? storedUser.firmName    : null;
  const accentOverride = isAgency && storedUser?.accentColor ? storedUser.accentColor : null;
  // Dynamic accent: agency accountants with a custom color override T.accent site-wide in header/badges
  const brandAccent    = accentOverride || T.accent;

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
  // General Journal
  const [gjData,      setGjData]      = useState(null);
  const [gjLoad,      setGjLoad]      = useState(false);
  const [gjFrom,      setGjFrom]      = useState('');
  const [gjTo,        setGjTo]        = useState('');
  // Audit Log
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditLoad,    setAuditLoad]   = useState(false);
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

  useEffect(() => { loadClients(); }, []);

  // Referral tab is user-level (no active client needed)
  useEffect(() => {
    if (tab === 'Referral') loadReferrals();
  }, [tab]);

  useEffect(() => {
    if (!active) return;
    if (tab === 'Dashboard')        loadDashboard();
    if (tab === 'Transactions')     loadTxns();
    if (tab === 'BIR Reminders')    loadBIR();
    // Pro-only tabs
    if (!isPro) return;
    if (tab === 'Income Statement') loadIncome();
    if (tab === 'Balance Sheet')    loadBalance();
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
    if (tab === 'Audit Log')        loadAudit();
    if (tab === 'Assets')           loadAssets();
    if (tab === 'Contacts')         loadContacts();
    if (tab === 'SLSP')             loadSLSP();
  }, [active?.id, tab]);

  async function loadClients() {
    setCLL(true);
    try {
      const r = await getClients();
      // Enforce client limit per accountant tier
      const all = r.clients || [];
      const visible = maxClients === null ? all : all.slice(0, maxClients);
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
    } catch (e) { console.error(e); }
  }

  async function loadTxns() {
    setTxLoad(true);
    try { const r = await getTransactions(active.id); setTxns(r.transactions || []); }
    catch (e) { console.error(e); }
    finally { setTxLoad(false); }
  }

  async function loadIncome() {
    try { setIncome(await getIncomeReport(active.id)); }
    catch (e) { console.error(e); }
  }

  async function loadBalance() {
    try { setBalance(await getBalanceReport(active.id)); }
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

  async function loadAudit() {
    setAuditLoad(true);
    try { const r = await getAuditLog(active.id, 200); setAuditEntries(r.entries || []); }
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

      {/* Header */}
      <div style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {firmName ? (
                /* White-label: show firm name instead of MyLedger branding */
                <>
                  <span style={{ fontWeight: 700, fontSize: 16, color: brandAccent }}>{firmName}</span>
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
              <span style={{
                background: tierInfo.color + (accountantTier === 'free' ? '00' : ''),
                color: accountantTier === 'free' ? T.muted : '#fff',
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                textTransform: 'uppercase', letterSpacing: '0.4px',
                border: accountantTier === 'free' ? `1px solid ${T.border}` : 'none',
                background: accountantTier === 'free' ? T.bg : (accentOverride && isAgency ? accentOverride : tierInfo.color),
              }}>{tierInfo.label}</span>
            </div>
            {clients.length > 0 && (
              <>
                <span style={{ color: T.border, fontSize: 18 }}>|</span>
                <select value={active?.id || ''} onChange={e => {
                  const c = clients.find(x => x.id === e.target.value);
                  setActive(c); setTxns([]); setIncome(null); setBalance(null); setVatBal(null); setDL([]);
                  setBooksData(null); setCfReport(null);
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
            {active && (
              <Btn variant="ghost" size="sm" onClick={handleBackup} title={`Download JSON backup of ${active.tradeName}`}>
                ⬇ Backup
              </Btn>
            )}
            <Btn variant="neutral" size="sm" onClick={onLogout}>Sign out</Btn>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 24px 56px' }}>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: T.surface, padding: 4,
          borderRadius: 10, boxShadow: T.shadow, flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const locked = !isPro && PRO_TABS.has(t);
            const isActive = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500, fontFamily: 'inherit', transition: 'all .15s',
                background: isActive ? (locked ? '#888' : T.accent) : locked ? '#f0f0f0' : 'transparent',
                color: isActive ? '#fff' : locked ? '#aaa' : T.muted,
                display: 'flex', alignItems: 'center', gap: 5,
                opacity: locked && !isActive ? 0.7 : 1,
              }}>
                {locked && <span style={{ fontSize: 10 }}>🔒</span>}
                {t}
              </button>
            );
          })}
        </div>

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
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20, marginBottom: 20 }}>
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
              <Btn onClick={() => setShowTx(true)}>+ Add Transaction</Btn>
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
                            {!t.voided && (
                              <button onClick={() => voidTx(t.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer',
                                  color: T.red, fontSize: 13, padding: '3px 6px', borderRadius: 5 }}>
                                ⊘ Void
                              </button>
                            )}
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

        {/* ════════════ JOURNAL ENTRIES ════════════ */}
        {tab === 'Journal Entries' && active && (
          !isPro ? <ProLock /> : <div>
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
          !isPro ? <ProLock /> : <div>
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
          !isPro ? <ProLock /> : (() => {
            const isOPT = active.taxRegime === 'opt';
            // Form options depend on tax regime — 1601-EQ is always available
            const formOptions = isOPT
              ? ['2551M', '2551Q', '1601-EQ']
              : ['2550M', '2550Q', '1601-EQ'];
            // If current birType doesn't match regime, show correct default
            const is1601EQ     = birType === '1601-EQ';
            const effectiveBirType = is1601EQ ? '1601-EQ' : isOPT
              ? (birType === '2551M' || birType === '2551Q' ? birType : '2551M')
              : (birType === '2550M' || birType === '2550Q' ? birType : '2550M');
            const isQuarterly = effectiveBirType === '2550Q' || effectiveBirType === '2551Q' || effectiveBirType === '1601-EQ';
            const monthNames = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
            const qLabels    = { 1: 'Q1 (Jan–Mar)', 4: 'Q2 (Apr–Jun)', 7: 'Q3 (Jul–Sep)', 10: 'Q4 (Oct–Dec)' };
            const periodLabel = isQuarterly ? qLabels[birMonth] : monthNames[birMonth];

            return (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
                    BIR Returns — {active.tradeName}
                  </h2>
                  <Btn size="sm" variant="neutral" onClick={() => {
                    const r = isOPT ? computeOPT(txns, active, birYear, birMonth, isQuarterly) : computeBIRVAT(txns, birYear, birMonth, isQuarterly);
                    printReport({
                      title: `BIR Form ${effectiveBirType} — ${active.tradeName}`,
                      subtitle: `${periodLabel} ${birYear}`,
                      bodyHtml: buildBIRReturnHtml({ isOPT, effectiveBirType, periodLabel, birYear, r, clientName: active.tradeName }),
                      firmLabel: firmName || 'MyLedger by Kaiman & Co.',
                      accentColor: brandAccent,
                    });
                  }}>⬇ Export PDF</Btn>
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
                  {isOPT
                    ? `OPT client (${((active.optRate ?? 0.03) * 100).toFixed(0)}% Percentage Tax) — Form 2551M / 2551Q`
                    : 'VAT-registered client — Form 2550M / 2550Q'}
                </div>

                {/* Period picker */}
                <Card style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 5 }}>Form</label>
                      <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: `1px solid ${T.border}` }}>
                        {formOptions.map(f => (
                          <button key={f} onClick={() => setBirType(f)} style={{
                            padding: '8px 20px', border: 'none', fontSize: 13, fontWeight: 600,
                            cursor: 'pointer', fontFamily: 'inherit',
                            background: effectiveBirType === f ? T.accent : T.surface,
                            color: effectiveBirType === f ? '#fff' : T.muted,
                          }}>{f}</button>
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

                    {!isQuarterly ? (
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
                        <select style={{ ...inp, width: 140 }} value={birMonth}
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

                {/* ── OPT / 2551 ── */}
                {isOPT && !is1601EQ && (() => {
                  const r = computeOPT(txns, active, birYear, birMonth, isQuarterly);
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
                    </div>
                  );
                })()}

                {/* ── 1601-EQ (Expanded Withholding Tax) ── */}
                {is1601EQ && (() => {
                  const q     = Math.floor((birMonth - 1) / 3);
                  const qMths = [q*3+1, q*3+2, q*3+3];
                  const filtered = txns.filter(t => {
                    const d = new Date(t.createdAt);
                    return d.getFullYear() === birYear && qMths.includes(d.getMonth() + 1)
                      && t.type === 'expense' && t.ewtRate > 0 && t.ewtAmount > 0;
                  });
                  const totalEWT = Math.round(filtered.reduce((s, t) => s + (t.ewtAmount || 0), 0) * 100) / 100;
                  const totalBase = Math.round(filtered.reduce((s, t) => s + (t.amount_net || 0), 0) * 100) / 100;

                  // Group by rate
                  const byRate = {};
                  filtered.forEach(t => {
                    const key = t.ewtRate;
                    byRate[key] = byRate[key] || { rate: key, count: 0, base: 0, ewt: 0 };
                    byRate[key].count++;
                    byRate[key].base = Math.round((byRate[key].base + t.amount_net) * 100) / 100;
                    byRate[key].ewt  = Math.round((byRate[key].ewt  + t.ewtAmount)  * 100) / 100;
                  });

                  return (
                    <div>
                      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                        {[
                          { label: 'Taxable Amount (NET)', value: totalBase, color: T.text,   bg: T.accentL },
                          { label: 'Total EWT Withheld',   value: totalEWT,  color: T.orange, bg: '#fff8ec' },
                          { label: 'Transactions with EWT', value: filtered.length, color: T.accent, bg: T.accentL, count: true },
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

                      <Card style={{ maxWidth: 580, marginBottom: 20 }}>
                        <SectionHead>BIR Form 1601-EQ — {periodLabel} {birYear}</SectionHead>
                        {filtered.length === 0 && (
                          <div style={{ color: T.muted, fontSize: 13, fontStyle: 'italic', marginBottom: 16 }}>
                            No expense transactions with EWT found for this quarter.
                            Add EWT rates when recording eligible expense payments.
                          </div>
                        )}
                        {Object.values(byRate).map(r => (
                          <div key={r.rate} style={{ display: 'flex', justifyContent: 'space-between',
                            padding: '8px 0', borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 13, color: T.muted }}>
                              {(r.rate * 100).toFixed(0)}% EWT — {r.count} payment{r.count !== 1 ? 's' : ''} · Base: {peso(r.base)}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.orange }}>{peso(r.ewt)}</span>
                          </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between',
                          padding: '12px 0 4px', fontWeight: 700 }}>
                          <span style={{ color: T.text }}>Total EWT Payable to BIR</span>
                          <span style={{ fontSize: 18, color: T.orange }}>{peso(totalEWT)}</span>
                        </div>
                        <div style={{ marginTop: 16, fontSize: 12, color: T.muted, lineHeight: 1.6,
                          background: T.bg, borderRadius: 8, padding: '10px 12px' }}>
                          Due: Last day of the month after the quarter end ·
                          Always verify with actual BIR-prescribed forms before filing.
                        </div>
                      </Card>

                      {filtered.length > 0 && (
                        <Card style={{ padding: 0, overflow: 'hidden' }}>
                          <div style={{ padding: '12px 18px', borderBottom: `1px solid ${T.border}`,
                            fontWeight: 700, fontSize: 14 }}>
                            EWT Transaction Detail — {filtered.length} payments
                          </div>
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: T.bg }}>
                                  {['Date','Payee','Description','NET Amount','EWT Rate','EWT Withheld'].map((h, i) => (
                                    <th key={h} style={{ padding: '9px 12px', textAlign: i >= 3 ? 'right' : 'left',
                                      fontWeight: 600, color: T.muted, fontSize: 10, textTransform: 'uppercase',
                                      borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.map((t, i) => (
                                  <tr key={t.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                    <td style={{ padding: '9px 12px', color: T.muted, whiteSpace: 'nowrap' }}>
                                      {new Date(t.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                    </td>
                                    <td style={{ padding: '9px 12px' }}>{t.counterpartyName || <span style={{ color: T.muted }}>—</span>}</td>
                                    <td style={{ padding: '9px 12px', color: T.muted }}>{t.description}</td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600 }}>{peso(t.amount_net)}</td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right', color: T.muted }}>
                                      {(t.ewtRate * 100).toFixed(0)}%
                                    </td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: T.orange }}>
                                      {peso(t.ewtAmount)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                                  <td colSpan={5} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: T.muted }}>TOTAL EWT</td>
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

                {/* ── VAT / 2550 ── */}
                {!isOPT && !is1601EQ && (() => {
                  const r = computeBIRVAT(txns, birYear, birMonth, isQuarterly);
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
                    </div>
                  );
                })()}
              </div>
            );
          })()
        )}

        {/* ════════════ ALPHALIST ════════════ */}
        {tab === 'Alphalist' && active && (
          !isPro ? <ProLock /> : <div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>Alphalist / SLSP — {active.tradeName}</h2>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 20 }}>
              Expense transactions grouped by vendor/counterparty for BIR Alphalist reporting.
              TIN-less vendors are grouped separately.
            </div>

            {(() => {
              const rows = computeAlphalist(txns);
              const withTin    = rows.filter(r => r.tin !== '—');
              const withoutTin = rows.filter(r => r.tin === '—');

              if (rows.length === 0) return (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                  <div>No expense transactions yet. Add expenses with vendor details to populate this report.</div>
                </div>
              );

              const AlphaTable = ({ data, title }) => (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 10 }}>{title}</div>
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: T.bg }}>
                            {['TIN','Vendor / Payee','Address','Tx Count','Net Purchases','Input VAT','Gross Purchases'].map((h, i) => (
                              <th key={h} style={{ padding: '10px 14px', textAlign: i >= 3 ? 'right' : 'left',
                                fontWeight: 600, color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`,
                                whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.map((r, i) => (
                            <tr key={i} style={{ borderBottom: i < data.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                              <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12,
                                color: r.tin !== '—' ? T.text : T.muted }}>{r.tin}</td>
                              <td style={{ padding: '10px 14px', fontWeight: 500 }}>{r.name}</td>
                              <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12, maxWidth: 160 }}>{r.address}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', color: T.muted }}>{r.txCount}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500 }}>{peso(r.net)}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', color: T.orange }}>{peso(r.vat)}</td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 600, color: T.red }}>{peso(r.gross)}</td>
                            </tr>
                          ))}
                          <tr style={{ background: T.bg, borderTop: `2px solid ${T.border}` }}>
                            <td colSpan={3} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: T.muted }}>TOTAL</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{data.reduce((s, r) => s + r.txCount, 0)}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>{peso(data.reduce((s, r) => s + r.net, 0))}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: T.orange }}>{peso(data.reduce((s, r) => s + r.vat, 0))}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: T.red }}>{peso(data.reduce((s, r) => s + r.gross, 0))}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              );

              return (
                <div>
                  {withTin.length > 0    && <AlphaTable data={withTin}    title={`${withTin.length} vendors with TIN (Alphalist reportable)`} />}
                  {withoutTin.length > 0 && <AlphaTable data={withoutTin} title={`${withoutTin.length} vendors without TIN (needs follow-up)`} />}
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════ AUDIT LOG ════════════ */}
        {tab === 'Audit Log' && active && (
          !isPro ? <ProLock /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Audit Log — {active.tradeName}</h2>
              <Btn size="sm" variant="ghost" onClick={loadAudit}>↻ Refresh</Btn>
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
                      {['Timestamp', 'Action', 'Entity', 'Detail'].map(h => (
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
          !isPro ? <ProLock /> : <div style={{ maxWidth: 640 }}>
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
          !isPro ? <ProLock /> : <div>
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
          !isPro ? <ProLock /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>General Journal — {active.tradeName}</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="date" value={gjFrom} onChange={e => setGjFrom(e.target.value)} style={{ ...inp, width: 150 }} />
                <span style={{ color: T.muted, fontSize: 13 }}>to</span>
                <input type="date" value={gjTo} onChange={e => setGjTo(e.target.value)} style={{ ...inp, width: 150 }} />
                <Btn size="sm" onClick={() => loadGJ(gjFrom, gjTo)}>Refresh</Btn>
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
          !isPro ? <ProLock /> : <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>General Ledger — {active.tradeName}</h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input placeholder="Filter account…" value={glAccount} onChange={e => setGlAccount(e.target.value)}
                  style={{ ...inp, width: 180 }} />
                <input type="date" value={glFrom} onChange={e => setGlFrom(e.target.value)} style={{ ...inp, width: 150 }} />
                <span style={{ color: T.muted, fontSize: 13 }}>to</span>
                <input type="date" value={glTo} onChange={e => setGlTo(e.target.value)} style={{ ...inp, width: 150 }} />
                <Btn size="sm" onClick={() => loadGL(glFrom, glTo, glAccount)}>Refresh</Btn>
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
          !isPro ? <ProLock /> : <div>
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

            {!income ? <div style={{ color: T.muted }}>Loading…</div> : (
              <Card style={{ maxWidth: 520 }}>
                <SectionHead>Profit &amp; Loss</SectionHead>
                {[
                  { label: 'Net Revenue',  value: income.revenue,             color: T.green,  bold: false },
                  { label: 'Net Expenses', value: -Math.abs(income.expenses), color: T.red,    bold: false },
                  { label: null },
                  { label: 'Net Profit',   value: income.profit, color: income.profit >= 0 ? T.accent : T.red, bold: true },
                ].map((row, i) => row.label === null
                  ? <hr key={i} style={{ border: 'none', borderTop: `2px solid ${T.border}`, margin: '8px 0' }} />
                  : (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between',
                      padding: row.bold ? '12px 0 4px' : '8px 0',
                      borderBottom: row.bold ? 'none' : `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 14, fontWeight: row.bold ? 700 : 400, color: row.bold ? T.text : T.muted }}>{row.label}</span>
                      <span style={{ fontSize: row.bold ? 18 : 14, fontWeight: row.bold ? 700 : 500, color: row.color }}>
                        {row.value < 0 ? `(${peso(Math.abs(row.value))})` : peso(row.value)}
                      </span>
                    </div>
                  )
                )}
                <div style={{ marginTop: 16, fontSize: 12, color: T.muted, fontStyle: 'italic' }}>{income.note}</div>
              </Card>
            )}
          </div>
        )}

        {/* ════════════ BALANCE SHEET ════════════ */}
        {tab === 'Balance Sheet' && active && (
          !isPro ? <ProLock /> : <div>
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
              Derived from transaction settlements and VAT accounts. Full FS requires CPA review.
            </div>

            {!balance ? <div style={{ color: T.muted }}>Loading…</div> : (() => {
              const a = balance.assets || {};
              const l = balance.liabilities || {};
              const totalCurrentAssets = (a.input_vat || 0) + (a.accounts_receivable || 0) + (a.cash_net > 0 ? a.cash_net : 0);
              const totalCurrentLiab   = (l.vat_payable || 0) + (l.accounts_payable || 0);
              const totalAssets        = totalCurrentAssets + (a.fixed_assets_net || 0);
              const netEquity          = totalAssets - totalCurrentLiab;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
          !isPro ? <ProLock /> : <div>
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
          !isPro ? <ProLock /> : <div>
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
          !isPro ? <ProLock /> : <div>
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
          !isPro ? <ProLock /> : <div>
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
          !isPro ? <ProLock /> : <div>
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

        {/* ════════════ BIR REMINDERS ════════════ */}
        {tab === 'BIR Reminders' && active && (
          <div>
            <h2 style={{ margin: '0 0 22px', fontSize: 22, fontWeight: 600 }}>BIR Filing Reminders — {active.tradeName}</h2>

            {birLoad ? <div style={{ color: T.muted }}>Loading…</div>
            : (active.taxTypes || []).length === 0 ? (
              <Card style={{ textAlign: 'center', color: T.muted, padding: 32 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                No tax types configured for this client. Their business profile needs to be updated with tax obligations.
              </Card>
            ) : deadlines.length === 0 ? <div style={{ color: T.muted }}>No upcoming deadlines.</div>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
                {deadlines.map((d, i) => {
                  const uc  = d.urgency === 'urgent' ? T.red : d.urgency === 'upcoming' ? T.orange : T.green;
                  const ubg = d.urgency === 'urgent' ? '#fff5f5' : d.urgency === 'upcoming' ? '#fff8ec' : '#f0fff4';
                  return (
                    <div key={i} style={{ background: ubg, borderRadius: T.radius, padding: '16px 20px',
                      border: `1px solid ${uc}30`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{d.form} — {d.name}</div>
                        <div style={{ color: T.muted, fontSize: 13, marginTop: 3 }}>Due: {d.dueDate}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, fontSize: 20, color: uc }}>{d.daysUntil}d</div>
                        <div style={{ fontSize: 11, color: uc, textTransform: 'uppercase', fontWeight: 600 }}>{d.urgency}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {vatBal && (
              <Card>
                <SectionHead>Current VAT Balance</SectionHead>
                <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Input VAT</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.green }}>{peso(vatBal.inputVAT)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Output VAT</div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: T.orange }}>{peso(vatBal.outputVAT)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: T.muted }}>Net position</div>
                    <div style={{ fontSize: 20, fontWeight: 600, color: vatBal.netVATPayable >= 0 ? T.red : T.green }}>{vatBal.note}</div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══════════ REFERRAL ══════════ */}
        {tab === 'Referral' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Referral Program</h2>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  Earn <strong style={{ color: '#ff9500' }}>
                    ₱{refData?.rates?.signupBonus ?? 100} per signup
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
                    Share with business owners or colleagues. You earn ₱200 when each referred user's account is approved.
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

      </div>

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
    </div>
  );
}
