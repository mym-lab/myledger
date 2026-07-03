// ─── GlobalSearch.jsx ─────────────────────────────────────────────────────────
// Cmd-K / Ctrl-K triggered search modal for accountants.
// Shows a floating panel with live results across all clients.

import { useState, useEffect, useRef, useCallback } from 'react';
import { globalSearch } from '../api.js';

const peso = n => '₱' + (n ?? 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const fmtDate = d => d ? new Date(d + 'T00:00').toLocaleDateString('en-PH', {
  month: 'short', day: 'numeric', year: 'numeric',
}) : '';

export default function GlobalSearch({ accentColor = '#00836e', clients = [] }) {
  const [open,     setOpen]     = useState(false);
  const [q,        setQ]        = useState('');
  const [type,     setType]     = useState('');
  const [clientId, setClientId] = useState('');
  const [from,     setFrom]     = useState('');
  const [to,       setTo]       = useState('');
  const [results,  setResults]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const inputRef = useRef(null);
  const timerRef = useRef(null);

  // Keyboard shortcut
  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
    else { setQ(''); setResults([]); setTotal(0); setType(''); setClientId(''); setFrom(''); setTo(''); }
  }, [open]);

  const runSearch = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (!q.trim() && !type && !clientId && !from && !to) { setResults([]); setTotal(0); return; }
      setLoading(true);
      try {
        const r = await globalSearch({ q, type, clientId, from, to, limit: 50 });
        setResults(r.results || []);
        setTotal(r.total   || 0);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }, 280);
  }, [q, type, clientId, from, to]);

  useEffect(() => { if (open) runSearch(); }, [q, type, clientId, from, to, open, runSearch]);

  const pill = {
    fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6,
    padding: '4px 8px', background: '#fafafa', fontFamily: 'inherit', color: '#374151',
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} title="Search (⌘K)" style={{
      display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9',
      border: '1px solid #e2e8f0', borderRadius: 8, padding: '5px 12px',
      cursor: 'pointer', fontSize: 13, color: '#6e6e73', fontFamily: 'inherit',
    }}>
      🔍 <span>Search</span>
      <kbd style={{ background: '#e2e8f0', borderRadius: 4, padding: '1px 5px',
        fontSize: 11, color: '#94a3b8', fontFamily: 'inherit' }}>⌘K</kbd>
    </button>
  );

  return (
    <div onClick={e => { if (e.target === e.currentTarget) setOpen(false); }} style={{
      position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.45)',
      backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', paddingTop: '10vh',
    }}>
      <div style={{
        width: '100%', maxWidth: 680, background: '#fff', borderRadius: 16,
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '76vh',
      }}>
        {/* Search bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10,
          padding: '14px 16px', borderBottom: '1px solid #f0f0f5' }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search descriptions, ref numbers, vendors…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16,
              color: '#1d1d1f', background: 'transparent', fontFamily: 'inherit' }} />
          {loading && <span style={{ fontSize: 12, color: '#9ca3af' }}>…</span>}
          <button onClick={() => setOpen(false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 18, color: '#9ca3af', padding: '2px 4px' }}>✕</button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px',
          borderBottom: '1px solid #f0f0f5', flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={pill} value={type} onChange={e => setType(e.target.value)}>
            <option value="">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          {clients.length > 1 && (
            <select style={pill} value={clientId} onChange={e => setClientId(e.target.value)}>
              <option value="">All clients</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
            </select>
          )}
          <input type="date" style={pill} value={from} onChange={e => setFrom(e.target.value)} title="From" />
          <input type="date" style={pill} value={to}   onChange={e => setTo(e.target.value)}   title="To" />
          {(type || clientId || from || to) && (
            <button onClick={() => { setType(''); setClientId(''); setFrom(''); setTo(''); }}
              style={{ fontSize: 12, border: 'none', background: 'none',
                cursor: 'pointer', color: '#ef4444' }}>✕ Clear</button>
          )}
        </div>

        {/* Results list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {results.length === 0 && !loading ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>
              {(q || type || clientId || from || to)
                ? <><div style={{ fontSize: 28, marginBottom: 8 }}>🔎</div>No results found</>
                : <><div style={{ fontSize: 28, marginBottom: 8 }}>⌨️</div>Type to search across all clients</>}
            </div>
          ) : (
            <div>
              {total > 0 && (
                <div style={{ padding: '8px 16px 4px', fontSize: 11, color: '#9ca3af' }}>
                  {total} result{total !== 1 ? 's' : ''}{total > 50 ? ' — showing first 50' : ''}
                </div>
              )}
              {results.map(r => (
                <div key={r.id}
                  style={{ padding: '12px 16px', borderBottom: '1px solid #f9fafb', cursor: 'default' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: r.type === 'income' ? '#e3f7ed' : '#fff0f0',
                          color: r.type === 'income' ? '#1a7a40' : '#dc2626' }}>
                          {r.type.toUpperCase()}
                        </span>
                        <span style={{ fontSize: 11, color: accentColor, fontWeight: 600 }}>{r.clientName}</span>
                        {r.category && <span style={{ fontSize: 11, color: '#9ca3af', background: '#f1f5f9',
                          padding: '1px 6px', borderRadius: 4 }}>{r.category}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#1d1d1f',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.description}
                      </div>
                      <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 11, color: '#9ca3af' }}>
                        {r.date && <span>{fmtDate(r.date)}</span>}
                        {r.referenceNo && <span>Ref: {r.referenceNo}</span>}
                        {r.counterpartyName && <span>{r.counterpartyName}</span>}
                        {r.notes && <span style={{ fontStyle: 'italic', overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{r.notes}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 700,
                        color: r.type === 'income' ? '#1a7a40' : '#dc2626' }}>
                        {r.type === 'income' ? '+' : '-'}{peso(r.net)}
                      </div>
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>
                        VAT {peso(r.vat)} · Gross {peso(r.gross)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
