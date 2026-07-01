// ─── EncoderPortal.jsx ────────────────────────────────────────────────────────
// MyLedger — Encoder / Data-Entry interface
// Encoders are assigned to clients by the accountant or business owner.
// They can add transactions and VOID (soft-delete) transactions — no hard deletes.
// No reports, no BIR, no books. Orange accent theme to visually distinguish from
// Client (blue) and Accountant (teal).

import { useState, useEffect } from 'react';
import {
  getClients,
  getTransactions, createTransaction, voidTransaction,
} from '../api.js';
import { useMobile } from '../hooks/useMobile.js';
import CSVImportModal from '../components/CSVImportModal.jsx';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:      '#f5f5f7',
  surface: '#ffffff',
  border:  '#d2d2d7',
  text:    '#1d1d1f',
  muted:   '#6e6e73',
  accent:  '#e07000',      // orange — encoder identity
  accentL: '#fff8ec',
  green:   '#34c759',
  red:     '#ff3b30',
  orange:  '#ff9500',
  radius:  '12px',
  shadow:  '0 2px 12px rgba(0,0,0,0.08)',
  shadowMd:'0 4px 24px rgba(0,0,0,0.12)',
};

const INCOME_CATS  = ['Sale of Goods','Sale of Services','Professional Fees','Rental Income','Interest Income','Commission Income','Dividend Income','Other Income'];
const EXPENSE_CATS = ['Cost of Goods Sold','Salaries & Wages','Rent','Utilities','Office Supplies','Advertising & Marketing','Transportation & Travel','Professional Fees','Repairs & Maintenance','Bank Charges & Fees','Taxes & Licenses','Depreciation','Insurance','Interest Expense','Other Expenses'];
const CUSTOM_OPT   = '＋ Other (specify)';

const INCOME_SETTLEMENTS  = ['cash','ar','ewallet','bank_transfer','check'];
const EXPENSE_SETTLEMENTS = ['cash','ap','ewallet','bank_transfer','check','credit_card'];
const SETTLEMENT_LABELS   = {
  cash: 'Cash', ar: 'Accounts Receivable', ap: 'Accounts Payable',
  ewallet: 'E-wallet (GCash/Maya)', bank_transfer: 'Bank Transfer',
  check: 'Check', credit_card: 'Credit Card',
};

const peso  = n => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDt = d => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
  fontSize: 14, color: T.text, background: '#fafafa', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

function Btn({ children, onClick, variant = 'primary', size = 'md', disabled, type = 'button', style: x = {} }) {
  const sz = { sm: { padding: '5px 12px', fontSize: 13 }, md: { padding: '9px 18px', fontSize: 14 } };
  const vr = {
    primary: { background: T.accent, color: '#fff', border: 'none' },
    danger:  { background: T.red,    color: '#fff', border: 'none' },
    ghost:   { background: 'transparent', color: T.accent, border: `1px solid ${T.accent}` },
    neutral: { background: T.border, color: T.text, border: 'none' },
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

function ModalShell({ title, onClose, children }) {
  const isMobile = useMobile();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      display: 'flex', alignItems: isMobile ? 'flex-end' : 'center',
      justifyContent: 'center', zIndex: 1000, padding: isMobile ? 0 : 20 }}
      onClick={onClose}>
      <div style={{ background: T.surface,
        borderRadius: isMobile ? '20px 20px 0 0' : 16,
        padding: 28, width: '100%',
        maxWidth: isMobile ? '100vw' : 560,
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

function VatCalc({ type, amount, vatType = 'vatable', supplierVatType = 'vat' }) {
  if (!amount || isNaN(amount) || Number(amount) <= 0) return null;
  const n = parseFloat(amount);
  const round = x => Math.round(x * 100) / 100;
  let net, vat, gross, msg;

  if (type === 'income') {
    if (vatType === 'zero_rated' || vatType === 'exempt') {
      net = n; vat = 0; gross = n;
      msg = vatType === 'zero_rated' ? 'Zero-rated — no VAT.' : 'VAT-exempt — no VAT.';
    } else {
      net = n; vat = round(n * 0.12); gross = round(n * 1.12);
      msg = 'NET entered — customer pays GROSS (inc. 12% VAT).';
    }
  } else {
    if (supplierVatType === 'non_vat') {
      net = n; vat = 0; gross = n; msg = 'Non-VAT supplier — no input VAT.';
    } else {
      gross = n; net = round(n / 1.12); vat = round(gross - net);
      msg = 'GROSS entered — NET to P&L, input VAT extracted.';
    }
  }

  return (
    <div style={{ background: T.accentL, borderRadius: 8, padding: '10px 14px', fontSize: 13, marginTop: 6, marginBottom: 10 }}>
      <div style={{ color: T.muted, marginBottom: 4 }}>{msg}</div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        <span>NET <strong style={{ color: T.text }}>{peso(net)}</strong></span>
        <span>VAT <strong style={{ color: T.orange }}>{peso(vat)}</strong></span>
        <span>GROSS <strong style={{ color: T.accent }}>{peso(gross)}</strong></span>
      </div>
    </div>
  );
}

// ─── TxModal (module-level) ───────────────────────────────────────────────────
function TxModal({ clientId, onSaved, onClose }) {
  const isMobile = useMobile();
  const today = new Date().toISOString().substring(0, 10);
  const blank = {
    type: 'income', amount: '', description: '', category: '', customCat: '',
    vatType: 'vatable', supplierVatType: 'vat', settlement: 'cash',
    referenceNo: '', notes: '', date: today,
    counterpartyName: '', counterpartyTin: '', counterpartyAddress: '',
  };
  const [form,   setForm]   = useState(blank);
  const [saving, setSaving] = useState(false);
  const cats       = form.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  const isCustom   = form.category === CUSTOM_OPT;
  const settlements = form.type === 'income' ? INCOME_SETTLEMENTS : EXPENSE_SETTLEMENTS;
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true);
    const finalCat = isCustom ? form.customCat.trim() || 'Other' : form.category;
    try {
      await createTransaction({
        clientId, type: form.type, amount: parseFloat(form.amount),
        description: form.description, category: finalCat || undefined,
        vatType: form.vatType, supplierVatType: form.supplierVatType,
        settlement: form.settlement,
        counterpartyName: form.counterpartyName, counterpartyTin: form.counterpartyTin,
        counterpartyAddress: form.counterpartyAddress,
        referenceNo: form.referenceNo, notes: form.notes,
        date: form.date || undefined,
      });
      onSaved(); onClose();
    } catch (err) { alert(err.message); setSaving(false); }
  }

  return (
    <ModalShell title="Add Transaction" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Transaction Date">
            <input style={inp} type="date" required
              value={form.date} onChange={set('date')} max={today} />
          </Fld>
          <Fld label="Type">
            <select style={inp} value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value, category: '', customCat: '',
                vatType: 'vatable', supplierVatType: 'vat', settlement: 'cash' }))}>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </Fld>
          <Fld label={form.type === 'income' ? (form.vatType === 'vatable' ? 'Amount — NET (ex-VAT)' : 'Amount') : (form.supplierVatType === 'vat' ? 'Amount — GROSS (inc. VAT)' : 'Amount')}>
            <input style={inp} type="number" step="0.01" min="0.01" required
              value={form.amount} onChange={set('amount')} placeholder="0.00" />
          </Fld>
        </div>

        {form.type === 'income' && (
          <Fld label="VAT Type">
            <select style={inp} value={form.vatType} onChange={set('vatType')}>
              <option value="vatable">Vatable (12%)</option>
              <option value="zero_rated">Zero-rated</option>
              <option value="exempt">VAT-exempt</option>
            </select>
          </Fld>
        )}
        {form.type === 'expense' && (
          <Fld label="Supplier VAT Type">
            <select style={inp} value={form.supplierVatType} onChange={set('supplierVatType')}>
              <option value="vat">VAT-registered supplier</option>
              <option value="non_vat">Non-VAT supplier</option>
            </select>
          </Fld>
        )}

        <VatCalc type={form.type} amount={form.amount}
          vatType={form.vatType} supplierVatType={form.supplierVatType} />

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Description *">
            <input style={inp} required value={form.description} onChange={set('description')} placeholder="Brief description" />
          </Fld>
          <Fld label="Reference / OR No.">
            <input style={inp} value={form.referenceNo} onChange={set('referenceNo')} placeholder="Invoice or OR number" />
          </Fld>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 16px' }}>
          <Fld label="Settlement">
            <select style={inp} value={form.settlement} onChange={set('settlement')}>
              {settlements.map(s => <option key={s} value={s}>{SETTLEMENT_LABELS[s]}</option>)}
            </select>
          </Fld>
          <Fld label="Category">
            <select style={inp} value={form.category} onChange={set('category')}>
              <option value="">— Select —</option>
              {cats.map(c => <option key={c}>{c}</option>)}
              <option value={CUSTOM_OPT}>{CUSTOM_OPT}</option>
            </select>
          </Fld>
        </div>
        {isCustom && (
          <Fld label="Specify category">
            <input style={inp} value={form.customCat} onChange={set('customCat')} placeholder="Category name…" autoFocus />
          </Fld>
        )}

        <div style={{ paddingTop: 10, borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {form.type === 'income' ? 'Customer Details' : 'Vendor Details'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '0 12px' }}>
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

        <Fld label="Notes">
          <textarea style={{ ...inp, resize: 'vertical', minHeight: 50 }}
            value={form.notes} onChange={set('notes')} placeholder="Internal notes…" />
        </Fld>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Transaction'}</Btn>
        </div>
      </form>
    </ModalShell>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function EncoderPortal({ onLogout }) {
  const isMobile = useMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [clients,   setClients] = useState([]);
  const [active,    setActive]  = useState(null);
  const [clLoading, setCLL]     = useState(true);
  const [txns,      setTxns]    = useState([]);
  const [txLoad,    setTxLoad]  = useState(false);
  const [showTx,       setShowTx]       = useState(false);
  const [showCSVImport,setShowCSVImport] = useState(false);

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('ml_user') || 'null'); } catch { return null; }
  })();

  useEffect(() => { loadClients(); }, []);
  useEffect(() => { if (active) loadTxns(); }, [active?.id]);

  async function loadClients() {
    setCLL(true);
    try {
      const r = await getClients();
      setClients(r.clients || []);
      if (r.clients?.length > 0) setActive(r.clients[0]);
    } catch (e) { console.error(e); }
    finally { setCLL(false); }
  }

  async function loadTxns() {
    setTxLoad(true);
    try { const r = await getTransactions(active.id); setTxns(r.transactions || []); }
    catch (e) { console.error(e); }
    finally { setTxLoad(false); }
  }

  async function voidTx(id) {
    const reason = window.prompt('Void reason (required for audit trail):');
    if (reason === null) return;
    if (!reason.trim()) { alert('A void reason is required.'); return; }
    try { await voidTransaction(id, reason.trim()); loadTxns(); }
    catch (e) { alert(e.message); }
  }

  // ── No clients assigned ───────────────────────────────────────────────────
  if (!clLoading && clients.length === 0) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>⌨️</div>
          <h2 style={{ fontSize: 24, fontWeight: 600, color: T.text, marginBottom: 10 }}>No clients assigned yet</h2>
          <p style={{ color: T.muted, lineHeight: 1.6, marginBottom: 24 }}>
            Ask your accountant or the business owner to assign you as an encoder from their portal.
            Your email: <strong>{user?.email}</strong>
          </p>
          <Btn variant="neutral" onClick={onLogout}>Sign out</Btn>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif', color: T.text }}>

      {/* Header */}
      <div style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        {isMobile ? (
          /* ── Mobile top bar ── */
          <div style={{ padding: '0 16px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', height: 52 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 16 }}>MyLedger</span>
              <span style={{ background: T.accent, color: '#fff', fontSize: 10, fontWeight: 600,
                padding: '2px 7px', borderRadius: 5 }}>ENCODER</span>
            </div>
            <Btn variant="neutral" size="sm" onClick={onLogout}>Sign out</Btn>
          </div>
        ) : (
          /* ── Desktop header ── */
          <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16 }}>MyLedger</span>
                <span style={{ color: T.muted, fontSize: 14 }}> by Kaiman &amp; Co. </span>
                <span style={{ background: T.accent, color: '#fff', fontSize: 11, fontWeight: 600,
                  padding: '2px 8px', borderRadius: 6 }}>ENCODER</span>
              </div>
              {clients.length > 0 && (
                <>
                  <span style={{ color: T.border, fontSize: 18 }}>|</span>
                  <select value={active?.id || ''} onChange={e => {
                    const c = clients.find(x => x.id === e.target.value);
                    setActive(c); setTxns([]);
                  }} style={{ border: 'none', background: 'transparent', fontSize: 14, fontWeight: 600,
                    color: T.text, cursor: 'pointer', outline: 'none', fontFamily: 'inherit' }}>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
                  </select>
                  {active && (
                    <span style={{ fontSize: 12, color: T.muted }}>TIN {active.tin}</span>
                  )}
                </>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 13, color: T.muted }}>Signed in as {user?.name || user?.email}</span>
              <Btn variant="neutral" size="sm" onClick={onLogout}>Sign out</Btn>
            </div>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: isMobile ? '20px 16px 48px' : '32px 24px 56px' }}>

        {/* Mobile: client selector */}
        {isMobile && clients.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <select value={active?.id || ''} onChange={e => {
              const c = clients.find(x => x.id === e.target.value);
              setActive(c); setTxns([]);
            }} style={{ ...inp, fontWeight: 600, flex: 1 }}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
            </select>
          </div>
        )}

        {/* Notice banner */}
        <div style={{ background: T.accentL, border: `1px solid ${T.accent}30`, borderRadius: 10,
          padding: '12px 16px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 20 }}>⌨️</span>
          <div>
            <span style={{ fontWeight: 600, fontSize: 13, color: T.accent }}>Encoder Access</span>
            <span style={{ fontSize: 13, color: T.muted, marginLeft: 8 }}>
              You can add transactions and void incorrect entries (with a reason). Contact your accountant to edit dates or correct amounts.
            </span>
          </div>
        </div>

        {/* Transactions */}
        {active && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 12 : 0, marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: isMobile ? 18 : 22, fontWeight: 600 }}>
                  {isMobile ? 'Transactions' : `Transactions — ${active.tradeName}`}
                </h2>
                <div style={{ fontSize: 13, color: T.muted }}>{txns.length} records</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Btn variant="neutral" size="sm" onClick={() => setShowCSVImport(true)}>📥 Import Bank CSV</Btn>
                <Btn onClick={() => setShowTx(true)} style={isMobile ? { width: '100%', justifyContent: 'center' } : {}}>
                  + Add Transaction
                </Btn>
              </div>
            </div>
            <div style={{ fontSize: 12, color: T.muted, marginBottom: 12, padding: '6px 10px',
              background: T.accentL, borderRadius: 6, border: `1px solid ${T.accent}20` }}>
              ℹ️ Transactions cannot be deleted — only voided (with reason). Contact your accountant to correct any errors.
            </div>

            {txLoad ? (
              <div style={{ color: T.muted, padding: 40, textAlign: 'center' }}>Loading…</div>
            ) : txns.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '80px 20px', color: T.muted,
                background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>🧾</div>
                <div style={{ fontWeight: 500, marginBottom: 6 }}>No transactions yet</div>
                <div style={{ fontSize: 13 }}>Click "+ Add Transaction" to get started.</div>
              </div>
            ) : (
              <div style={{ background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}`,
                boxShadow: T.shadow, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.bg }}>
                        {['Date','Type','Category','Description','Ref. No.','Settlement','NET','VAT','GROSS',''].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                            color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {txns.map((t, i) => (
                        <tr key={t.id} style={{
                          borderBottom: i < txns.length - 1 ? `1px solid ${T.border}` : 'none',
                          background: t.voided ? '#fafafa' : (i % 2 === 0 ? T.surface : '#fafafa'),
                          opacity: t.voided ? 0.5 : 1,
                        }}>
                          <td style={{ padding: '11px 14px', color: T.muted, whiteSpace: 'nowrap',
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{fmtDt(t.createdAt)}</td>
                          <td style={{ padding: '11px 14px' }}>
                            {t.voided
                              ? <span style={{ background: '#f0f0f0', color: T.muted, padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>VOID</span>
                              : <span style={{ background: t.type === 'income' ? '#e3f7ed' : '#fff0f0',
                                  color: t.type === 'income' ? '#1a7a40' : T.red,
                                  padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600 }}>
                                  {t.type}
                                </span>
                            }
                          </td>
                          <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12,
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{t.category || '—'}</td>
                          <td style={{ padding: '11px 14px', maxWidth: 200 }}>
                            <div style={{ textDecoration: t.voided ? 'line-through' : 'none' }}>{t.description}</div>
                            {t.voided && t.voidReason && <div style={{ fontSize: 11, color: T.red, marginTop: 2 }}>Void: {t.voidReason}</div>}
                            {!t.voided && t.notes && <div style={{ fontSize: 11, color: T.muted, fontStyle: 'italic', marginTop: 2 }}>{t.notes}</div>}
                          </td>
                          <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12,
                            textDecoration: t.voided ? 'line-through' : 'none' }}>{t.referenceNo || '—'}</td>
                          <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12,
                            textDecoration: t.voided ? 'line-through' : 'none' }}>
                            {SETTLEMENT_LABELS[t.settlement] || t.settlement || 'Cash'}
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
                    </t