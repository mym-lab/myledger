// ─── BalanceSheetImport ──────────────────────────────────────────────────────
// Opening balances entry form for new clients switching from another system.
// Creates a single Journal Entry that seeds assets, liabilities, equity.

import { useState } from 'react';
import { importBalanceSheet } from '../api.js';

const T = {
  teal:   '#00897b',
  bg:     '#f5f5f7',
  border: '#e0e0e0',
  text:   '#1a1a2e',
  muted:  '#6e6e80',
  red:    '#ff3b30',
  surface:'#ffffff',
  orange: '#ff9500',
};

const inp = {
  width: '100%', padding: '7px 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: T.surface,
  fontSize: 13, color: T.text, outline: 'none',
};

const TEMPLATE_ACCOUNTS = [
  // Assets
  { account: 'Cash on Hand',             type: 'asset',     debit: 0, credit: 0 },
  { account: 'Cash in Bank',             type: 'asset',     debit: 0, credit: 0 },
  { account: 'Accounts Receivable',      type: 'asset',     debit: 0, credit: 0 },
  { account: 'Inventory',                type: 'asset',     debit: 0, credit: 0 },
  { account: 'Prepaid Expenses',         type: 'asset',     debit: 0, credit: 0 },
  { account: 'Property & Equipment',     type: 'asset',     debit: 0, credit: 0 },
  { account: 'Input VAT Recoverable',    type: 'asset',     debit: 0, credit: 0 },
  // Liabilities
  { account: 'Accounts Payable',         type: 'liability', debit: 0, credit: 0 },
  { account: 'VAT Payable',              type: 'liability', debit: 0, credit: 0 },
  { account: 'Loans Payable',            type: 'liability', debit: 0, credit: 0 },
  { account: 'Accrued Expenses',         type: 'liability', debit: 0, credit: 0 },
  // Equity
  { account: "Owner's Equity / Capital", type: 'equity',    debit: 0, credit: 0 },
  { account: 'Retained Earnings',        type: 'equity',    debit: 0, credit: 0 },
];

const TYPE_COLORS = {
  asset:     { bg: '#e8f5e9', color: '#2e7d32', label: 'Asset' },
  liability: { bg: '#fff3e0', color: '#e65100', label: 'Liability' },
  equity:    { bg: '#e8eaf6', color: '#283593', label: 'Equity' },
};

function round(n) { return Math.round(Number(n || 0) * 100) / 100; }
function peso(n)  { return '₱' + round(n).toLocaleString('en-PH', { minimumFractionDigits: 2 }); }

function Overlay({ children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16 }}>
      <div style={{ background: T.surface, borderRadius: 16, width: '100%', maxWidth: 820,
        maxHeight: '92vh', overflowY: 'auto', padding: 28, position: 'relative',
        boxShadow: '0 24px 48px rgba(0,0,0,0.18)' }}>
        {children}
      </div>
    </div>
  );
}

export default function BalanceSheetImport({ clientId, onClose, onImported }) {
  const today = new Date().toISOString().substring(0, 10);

  const [openingDate, setOpeningDate] = useState(today);
  const [entries, setEntries] = useState(
    TEMPLATE_ACCOUNTS.map(a => ({ ...a, key: Math.random() }))
  );
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [result,  setResult]  = useState(null);

  const totalDebit  = round(entries.reduce((s, e) => s + round(e.debit),  0));
  const totalCredit = round(entries.reduce((s, e) => s + round(e.credit), 0));
  const balanced    = totalDebit === totalCredit;
  const diff        = round(Math.abs(totalDebit - totalCredit));

  function updateEntry(key, field, value) {
    setErr('');
    setEntries(es => es.map(e => e.key === key ? { ...e, [field]: value } : e));
  }

  function addRow() {
    setEntries(es => [...es, { account: '', type: 'asset', debit: 0, credit: 0, key: Math.random() }]);
  }

  function removeRow(key) {
    setEntries(es => es.filter(e => e.key !== key));
  }

  async function handleSave() {
    if (!openingDate) { setErr('Opening date is required.'); return; }
    if (!balanced)    { setErr(`Entry doesn't balance — difference of ${peso(diff)}. Debits must equal Credits.`); return; }
    const toSend = entries
      .filter(e => e.account && (round(e.debit) > 0 || round(e.credit) > 0))
      .map(e => ({ account: e.account, debit: round(e.debit), credit: round(e.credit) }));
    if (toSend.length === 0) { setErr('Enter at least one account with a balance.'); return; }

    setSaving(true); setErr('');
    try {
      const data = await importBalanceSheet(clientId, openingDate, toSend);
      setResult(data);
      onImported?.();
    } catch (e) {
      setErr(e.message || 'Import failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (result) {
    return (
      <Overlay>
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Opening Balances Imported</h3>
          <div style={{ fontSize: 14, color: T.muted, marginBottom: 20 }}>
            Journal Entry created for <strong>{result.openingDate}</strong>
            {' '}— <strong>{result.accounts}</strong> accounts, total {peso(result.totalDebit)}.
          </div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 24 }}>
            You can view and edit this in the <strong>Journal Entries</strong> tab.
          </div>
          <button onClick={onClose}
            style={{ padding: '10px 28px', borderRadius: 8, border: 'none',
              background: T.teal, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>📊 Import Opening Balances</h2>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Seed this client's balance sheet for clients switching from another system mid-year.
            Creates a single journal entry.
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none',
          fontSize: 22, cursor: 'pointer', color: T.muted }}>×</button>
      </div>

      {err && (
        <div style={{ background: '#fff2f2', border: `1px solid ${T.red}40`, borderRadius: 8,
          padding: '10px 14px', color: T.red, fontSize: 13, marginBottom: 16 }}>
          ⚠️ {err}
        </div>
      )}

      {/* Opening date */}
      <div style={{ marginBottom: 18 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block', marginBottom: 4 }}>
          Opening Balance Date *
        </label>
        <input type="date" style={{ ...inp, maxWidth: 200 }}
          value={openingDate} onChange={e => setOpeningDate(e.target.value)} />
        <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>
          Usually the last day of the prior period (e.g. Dec 31 of last year)
        </div>
      </div>

      {/* Balance indicator */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '10px 14px',
        borderRadius: 10, marginBottom: 14,
        background: balanced ? '#f0fff0' : '#fff8e6',
        border: `1px solid ${balanced ? '#90ee9060' : T.orange + '60'}`,
      }}>
        <div>
          <div style={{ fontSize: 11, color: T.muted }}>Total Debits</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{peso(totalDebit)}</div>
        </div>
        <div style={{ fontSize: 20, color: T.muted }}>=</div>
        <div>
          <div style={{ fontSize: 11, color: T.muted }}>Total Credits</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{peso(totalCredit)}</div>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600,
          color: balanced ? '#1a8a1a' : T.orange }}>
          {balanced ? '✅ Balanced' : `⚠️ Off by ${peso(diff)}`}
        </div>
      </div>

      {/* Accounts table */}
      <div style={{ overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ background: T.bg }}>
              <th style={{ padding: '8px 10px', textAlign: 'left', border: `1px solid ${T.border}`,
                fontWeight: 600, color: T.muted, width: '40%' }}>Account Name</th>
              <th style={{ padding: '8px 10px', textAlign: 'left', border: `1px solid ${T.border}`,
                fontWeight: 600, color: T.muted, width: '15%' }}>Type</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', border: `1px solid ${T.border}`,
                fontWeight: 600, color: T.muted }}>Debit (₱)</th>
              <th style={{ padding: '8px 10px', textAlign: 'right', border: `1px solid ${T.border}`,
                fontWeight: 600, color: T.muted }}>Credit (₱)</th>
              <th style={{ padding: '8px 6px', border: `1px solid ${T.border}`, width: 32 }}></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, idx) => {
              const tc = TYPE_COLORS[e.type] || TYPE_COLORS.asset;
              return (
                <tr key={e.key} style={{ background: idx % 2 === 0 ? T.surface : T.bg }}>
                  <td style={{ padding: '5px 8px', border: `1px solid ${T.border}` }}>
                    <input style={{ ...inp, padding: '5px 8px' }}
                      value={e.account} placeholder="Account name"
                      onChange={ev => updateEntry(e.key, 'account', ev.target.value)} />
                  </td>
                  <td style={{ padding: '5px 8px', border: `1px solid ${T.border}` }}>
                    <select style={{ ...inp, padding: '5px 8px' }}
                      value={e.type} onChange={ev => updateEntry(e.key, 'type', ev.target.value)}>
                      <option value="asset">Asset</option>
                      <option value="liability">Liability</option>
                      <option value="equity">Equity</option>
                    </select>
                  </td>
                  <td style={{ padding: '5px 8px', border: `1px solid ${T.border}` }}>
                    <input type="number" min="0" step="0.01" style={{ ...inp, padding: '5px 8px', textAlign: 'right' }}
                      value={e.debit || ''}
                      onChange={ev => updateEntry(e.key, 'debit', ev.target.value)}
                      onFocus={ev => { if (!ev.target.value || ev.target.value === '0') ev.target.value = ''; }}
                    />
                  </td>
                  <td style={{ padding: '5px 8px', border: `1px solid ${T.border}` }}>
                    <input type="number" min="0" step="0.01" style={{ ...inp, padding: '5px 8px', textAlign: 'right' }}
                      value={e.credit || ''}
                      onChange={ev => updateEntry(e.key, 'credit', ev.target.value)}
                      onFocus={ev => { if (!ev.target.value || ev.target.value === '0') ev.target.value = ''; }}
                    />
                  </td>
                  <td style={{ padding: '5px 6px', border: `1px solid ${T.border}`, textAlign: 'center' }}>
                    <button onClick={() => removeRow(e.key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: T.muted, fontSize: 16, lineHeight: 1 }}>×</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: T.bg, fontWeight: 700 }}>
              <td colSpan={2} style={{ padding: '8px 10px', border: `1px solid ${T.border}`, fontSize: 12 }}>
                TOTAL
              </td>
              <td style={{ padding: '8px 10px', border: `1px solid ${T.border}`,
                textAlign: 'right', color: T.teal }}>
                {peso(totalDebit)}
              </td>
              <td style={{ padding: '8px 10px', border: `1px solid ${T.border}`,
                textAlign: 'right', color: T.teal }}>
                {peso(totalCredit)}
              </td>
              <td style={{ border: `1px solid ${T.border}` }}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div style={{ marginBottom: 20 }}>
        <button onClick={addRow}
          style={{ padding: '7px 14px', borderRadius: 8, border: `1px dashed ${T.teal}`,
            background: `${T.teal}08`, color: T.teal, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          + Add Account Row
        </button>
      </div>

      <div style={{ background: '#fffbec', border: `1px solid ${T.orange}60`, borderRadius: 10,
        padding: '10px 14px', marginBottom: 20, fontSize: 12.5, color: '#a07000' }}>
        <strong>Standard rule:</strong> Assets = Liabilities + Equity.
        Enter assets as Debits, liabilities and equity as Credits.
        The entry must balance before saving.
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8,
          border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontSize: 13 }}>
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving || !balanced}
          style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
            background: balanced ? T.teal : '#ccc',
            color: '#fff', fontWeight: 600, fontSize: 13,
            cursor: balanced && !saving ? 'pointer' : 'not-allowed' }}>
          {saving ? 'Saving…' : '💾 Save Opening Balances'}
        </button>
      </div>
    </Overlay>
  );
}
