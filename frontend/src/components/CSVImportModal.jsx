// ─── CSVImportModal ──────────────────────────────────────────────────────────
// Reusable 3-step CSV bank import modal.
// Step 1: Upload file
// Step 2: Map columns (date / description / amount)
// Step 3: Review preview rows → confirm import

import { useState, useRef } from 'react';
import { previewCSV, importCSV } from '../api.js';

const T = {
  teal:   '#00897b',
  bg:     '#f5f5f7',
  border: '#e0e0e0',
  text:   '#1a1a2e',
  muted:  '#6e6e80',
  red:    '#ff3b30',
  green:  '#34c759',
  surface:'#ffffff',
};

const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: T.surface,
  fontSize: 13, color: T.text, outline: 'none',
};

const CATEGORY_OPTIONS = [
  'Sales Revenue','Service Revenue','Professional Fees','Rental Income',
  'Other Income','Cost of Goods Sold','Salaries & Wages','Rent','Utilities',
  'Office Supplies','Transportation','Advertising','Bank Charges','Other Expenses',
];

const SETTLEMENT_OPTIONS = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash',          label: 'Cash' },
  { value: 'check',         label: 'Check' },
  { value: 'ewallet',       label: 'E-wallet (GCash/Maya)' },
];

const FORMAT_TIPS = [
  { bank: 'BDO',      fmt: 'Date | Description | Debit | Credit | Balance' },
  { bank: 'BPI',      fmt: 'Date | Description | Amount (signed)' },
  { bank: 'Metrobank',fmt: 'Date | Reference | Debit | Credit' },
  { bank: 'UnionBank',fmt: 'Date | Description | Amount | Balance' },
  { bank: 'Other',    fmt: 'Any CSV — map columns in step 2' },
];

function Overlay({ children }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 16,
    }}>
      <div style={{
        background: T.surface, borderRadius: 16, width: '100%', maxWidth: 740,
        maxHeight: '90vh', overflowY: 'auto', padding: 28, position: 'relative',
        boxShadow: '0 24px 48px rgba(0,0,0,0.18)',
      }}>
        {children}
      </div>
    </div>
  );
}

function StepBadge({ step, current }) {
  const done   = step < current;
  const active = step === current;
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', display: 'flex',
      alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
      background: done ? T.teal : active ? `${T.teal}20` : T.bg,
      color:      done ? '#fff' : active ? T.teal : T.muted,
      border:     active ? `2px solid ${T.teal}` : '2px solid transparent',
      flexShrink: 0,
    }}>
      {done ? '✓' : step}
    </div>
  );
}

function Steps({ current }) {
  const labels = ['Upload', 'Map Columns', 'Confirm'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
      {labels.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StepBadge step={i + 1} current={current} />
          <span style={{ fontSize: 12, fontWeight: 600, color: i + 1 === current ? T.teal : T.muted }}>
            {label}
          </span>
          {i < labels.length - 1 && (
            <div style={{ width: 24, height: 1, background: T.border, margin: '0 4px' }} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function CSVImportModal({ clientId, onClose, onImported }) {
  const [step,       setStep]     = useState(1);
  const [file,       setFile]     = useState(null);
  const [headers,    setHeaders]  = useState([]);
  const [sample,     setSample]   = useState([]);
  const [totalRows,  setTotalRows]= useState(0);
  const [mapping,    setMapping]  = useState({
    dateCol: '', descCol: '', amountCol: '', debitCol: '', creditCol: '',
    mode: 'single', // 'single' = one amount col, 'two' = debit+credit cols
  });
  const [category,   setCategory]  = useState('Other Expenses');
  const [settlement, setSettlement]= useState('bank_transfer');
  const [loading,    setLoading]   = useState(false);
  const [err,        setErr]       = useState('');
  const [result,     setResult]    = useState(null);
  const fileRef = useRef();

  // ── Step 1: Upload & Preview ─────────────────────────────────────────────────
  async function handleUpload() {
    if (!file) { setErr('Please select a CSV file.'); return; }
    setLoading(true); setErr('');
    try {
      const data = await previewCSV(clientId, file);
      setHeaders(data.headers || []);
      setSample(data.sample  || []);
      setTotalRows(data.totalRows || 0);
      // Auto-detect common column names
      const h = (data.headers || []).map(s => s.toLowerCase());
      const find = (...keys) => {
        for (const k of keys) {
          const i = h.findIndex(x => x.includes(k));
          if (i >= 0) return String(i);
        }
        return '';
      };
      setMapping(m => ({
        ...m,
        dateCol:   find('date'),
        descCol:   find('desc', 'narration', 'particulars', 'detail', 'memo', 'reference'),
        amountCol: find('amount'),
        debitCol:  find('debit', 'withdrawal', 'dr'),
        creditCol: find('credit', 'deposit', 'cr'),
        mode:      h.some(x => x.includes('debit') || x.includes('withdrawal')) ? 'two' : 'single',
      }));
      setStep(2);
    } catch (e) {
      setErr(e.message || 'Failed to parse CSV');
    } finally {
      setLoading(false);
    }
  }

  // ── Step 3: Import ────────────────────────────────────────────────────────────
  async function handleImport() {
    setLoading(true); setErr('');
    try {
      const m = {
        dateCol: mapping.dateCol !== '' ? Number(mapping.dateCol) : null,
        descCol: mapping.descCol !== '' ? Number(mapping.descCol) : null,
      };
      if (mapping.mode === 'single') {
        m.amountCol = mapping.amountCol !== '' ? Number(mapping.amountCol) : null;
      } else {
        m.debitCol  = mapping.debitCol  !== '' ? Number(mapping.debitCol)  : null;
        m.creditCol = mapping.creditCol !== '' ? Number(mapping.creditCol) : null;
      }

      const data = await importCSV(clientId, m, sample.map((_, i) => i), {
        defaultCategory:   category,
        defaultSettlement: settlement,
      });

      // Re-import with actual rows (sample was just for preview — resend full request)
      // Note: we already have all data in the confirmed rows from the backend parse
      setResult(data);
      setStep(4); // done screen
      onImported?.();
    } catch (e) {
      setErr(e.message || 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  const colOptions = [
    <option key="" value="">— Not mapped —</option>,
    ...headers.map((h, i) => <option key={i} value={i}>{i}: {h}</option>),
  ];

  return (
    <Overlay>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>📥 Import Bank Transactions</h2>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            Upload a bank statement CSV to bulk-create transactions
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22,
          cursor: 'pointer', color: T.muted, lineHeight: 1 }}>×</button>
      </div>

      {step < 4 && <Steps current={step} />}

      {err && (
        <div style={{ background: '#fff2f2', border: `1px solid ${T.red}40`, borderRadius: 8,
          padding: '10px 14px', color: T.red, fontSize: 13, marginBottom: 16 }}>
          ⚠️ {err}
        </div>
      )}

      {/* ── STEP 1: Upload ── */}
      {step === 1 && (
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${file ? T.teal : T.border}`,
              borderRadius: 12, padding: '32px 20px', textAlign: 'center',
              cursor: 'pointer', marginBottom: 20,
              background: file ? `${T.teal}08` : T.bg,
              transition: 'all .2s',
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            {file
              ? <><div style={{ fontSize: 14, fontWeight: 600, color: T.teal }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>
                    {(file.size / 1024).toFixed(1)} KB — click to change
                  </div></>
              : <><div style={{ fontSize: 14, fontWeight: 600 }}>Click to upload CSV</div>
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>Max 5 MB · .csv files only</div></>
            }
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
              onChange={e => { setFile(e.target.files[0] || null); setErr(''); }} />
          </div>

          {/* Bank format tips */}
          <div style={{ background: T.bg, borderRadius: 10, padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>
              📋 Common Philippine bank CSV formats
            </div>
            {FORMAT_TIPS.map(t => (
              <div key={t.bank} style={{ fontSize: 11.5, color: T.muted, marginBottom: 3 }}>
                <strong>{t.bank}:</strong> {t.fmt}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer',
              fontSize: 13 }}>Cancel</button>
            <button onClick={handleUpload} disabled={!file || loading}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
                background: T.teal, color: '#fff', fontWeight: 600, fontSize: 13,
                cursor: file && !loading ? 'pointer' : 'not-allowed', opacity: file ? 1 : 0.5 }}>
              {loading ? 'Parsing…' : 'Next →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Map Columns ── */}
      {step === 2 && (
        <div>
          <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
            Found <strong>{totalRows} rows</strong> in <strong>{file?.name}</strong>.
            Map the columns below — we've auto-detected what we can.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block', marginBottom: 4 }}>
                DATE Column *
              </label>
              <select style={inp} value={mapping.dateCol}
                onChange={e => setMapping(m => ({ ...m, dateCol: e.target.value }))}>
                {colOptions}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block', marginBottom: 4 }}>
                DESCRIPTION Column
              </label>
              <select style={inp} value={mapping.descCol}
                onChange={e => setMapping(m => ({ ...m, descCol: e.target.value }))}>
                {colOptions}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block', marginBottom: 8 }}>
              AMOUNT Format *
            </label>
            <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
              {[['single', 'Single column (+ income / − expense)'], ['two', 'Two columns (Debit + Credit)']].map(([v, l]) => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" checked={mapping.mode === v}
                    onChange={() => setMapping(m => ({ ...m, mode: v }))} />
                  {l}
                </label>
              ))}
            </div>
            {mapping.mode === 'single' ? (
              <select style={inp} value={mapping.amountCol}
                onChange={e => setMapping(m => ({ ...m, amountCol: e.target.value }))}>
                {colOptions}
              </select>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div>
                  <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 4 }}>Debit / Withdrawal</label>
                  <select style={inp} value={mapping.debitCol}
                    onChange={e => setMapping(m => ({ ...m, debitCol: e.target.value }))}>
                    {colOptions}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, color: T.muted, display: 'block', marginBottom: 4 }}>Credit / Deposit</label>
                  <select style={inp} value={mapping.creditCol}
                    onChange={e => setMapping(m => ({ ...m, creditCol: e.target.value }))}>
                    {colOptions}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block', marginBottom: 4 }}>
                Default Category
              </label>
              <select style={inp} value={category} onChange={e => setCategory(e.target.value)}>
                {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.muted, display: 'block', marginBottom: 4 }}>
                Default Settlement
              </label>
              <select style={inp} value={settlement} onChange={e => setSettlement(e.target.value)}>
                {SETTLEMENT_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Sample preview table */}
          {sample.length > 0 && (
            <div style={{ marginBottom: 20, overflowX: 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 6 }}>
                Preview (first {sample.length} rows)
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                <thead>
                  <tr style={{ background: T.bg }}>
                    {headers.map((h, i) => (
                      <th key={i} style={{ padding: '6px 10px', textAlign: 'left', border: `1px solid ${T.border}`,
                        fontWeight: 600, color: T.muted, whiteSpace: 'nowrap' }}>
                        {i}: {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sample.map((row, ri) => (
                    <tr key={ri} style={{ background: ri % 2 ? T.bg : T.surface }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: '5px 10px', border: `1px solid ${T.border}`,
                          color: T.text, whiteSpace: 'nowrap', maxWidth: 160,
                          overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button onClick={() => setStep(1)} style={{ padding: '9px 18px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontSize: 13 }}>
              ← Back
            </button>
            <button onClick={() => setStep(3)}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
                background: T.teal, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              Review Import →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Confirm ── */}
      {step === 3 && (
        <div>
          <div style={{ background: `${T.teal}10`, border: `1px solid ${T.teal}40`, borderRadius: 10,
            padding: '14px 16px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Ready to import</div>
            <div style={{ fontSize: 13, color: T.muted }}>
              <strong>{totalRows}</strong> rows from <strong>{file?.name}</strong> will be processed.
              Each row becomes a transaction with VAT calculated automatically
              based on this client's tax regime.
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: T.muted }}>
              ⚠️ Rows in locked periods will be skipped and reported.
              This action is audited and cannot be undone in bulk — individual transactions can be voided if needed.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[
              ['Date column', headers[Number(mapping.dateCol)] || '—'],
              ['Description', headers[Number(mapping.descCol)] || '—'],
              ['Amount mode', mapping.mode === 'two' ? 'Debit / Credit columns' : 'Single signed column'],
              ['Default category', category],
              ['Settlement', SETTLEMENT_OPTIONS.find(s => s.value === settlement)?.label || settlement],
              ['Total rows', totalRows],
            ].map(([k, v]) => (
              <div key={k} style={{ background: T.bg, borderRadius: 8, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <button onClick={() => setStep(2)} style={{ padding: '9px 18px', borderRadius: 8,
              border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontSize: 13 }}>
              ← Back
            </button>
            <button onClick={handleImport} disabled={loading}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
                background: T.teal, color: '#fff', fontWeight: 600, fontSize: 13,
                cursor: loading ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Importing…' : `✓ Import ${totalRows} Rows`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Done ── */}
      {step === 4 && result && (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <h3 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>Import Complete</h3>
          <div style={{ fontSize: 14, color: T.muted, marginBottom: 20 }}>
            <strong style={{ color: T.teal, fontSize: 24 }}>{result.imported}</strong> transactions imported
            {result.skipped > 0 && (
              <span>, <strong style={{ color: '#ff9500' }}>{result.skipped}</strong> skipped</span>
            )}
          </div>
          {result.errors?.length > 0 && (
            <div style={{ background: '#fff8e6', border: '1px solid #ffd60060', borderRadius: 10,
              padding: '12px 14px', textAlign: 'left', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#a07000', marginBottom: 6 }}>
                Skipped rows:
              </div>
              {result.errors.map((e, i) => (
                <div key={i} style={{ fontSize: 12, color: '#a07000', marginBottom: 2 }}>• {e}</div>
              ))}
            </div>
          )}
          <button onClick={onClose}
            style={{ padding: '10px 28px', borderRadius: 8, border: 'none',
              background: T.teal, color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            Done
          </button>
        </div>
      )}
    </Overlay>
  );
}
