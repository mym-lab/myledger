// ─── NotificationBell.jsx ─────────────────────────────────────────────────────
// Shared bell icon + dropdown for AccountantPortal and ClientInterface.
// Pulls from GET /api/notifications. Tracks "last seen" in localStorage so
// the badge count resets when the panel is opened.

import { useState, useEffect, useRef } from 'react';
import { getNotifications } from '../api.js';

const SEV_COLOR = {
  error:   { bg: '#fff1f0', border: '#fca5a5', dot: '#ef4444', text: '#991b1b' },
  warning: { bg: '#fffbeb', border: '#fcd34d', dot: '#f59e0b', text: '#92400e' },
  info:    { bg: '#eff6ff', border: '#93c5fd', dot: '#3b82f6', text: '#1e40af' },
};
const SEV_ICON = { error: '🔴', warning: '🟡', info: '🔵' };
const TYPE_ICON = {
  bir_overdue:     '⚠️',
  bir_due_soon:    '📅',
  encoder_activity:'⌨️',
  ar_overdue:      '💰',
};

const LS_KEY = 'ml_notif_last_seen';

export default function NotificationBell({ accentColor = '#1d4ed8' }) {
  const [open,   setOpen]   = useState(false);
  const [items,  setItems]  = useState([]);
  const [badge,  setBadge]  = useState(0);
  const [loading,setLoading]= useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Fetch on mount + every 5 min
  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r  = await getNotifications();
      const ns = r.notifications || [];
      setItems(ns);

      // Badge = items newer than last_seen (use item.date as proxy)
      const lastSeen = localStorage.getItem(LS_KEY) || '1970-01-01';
      const unseen   = ns.filter(n => n.severity === 'error' || n.date >= lastSeen);
      setBadge(unseen.length);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  }

  function openPanel() {
    setOpen(o => !o);
    if (!open) {
      // Mark as seen
      localStorage.setItem(LS_KEY, new Date().toISOString().slice(0, 10));
      setBadge(0);
    }
  }

  const errors   = items.filter(n => n.severity === 'error');
  const warnings = items.filter(n => n.severity === 'warning');
  const infos    = items.filter(n => n.severity === 'info');

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell button */}
      <button
        onClick={openPanel}
        title={`${items.length} notification${items.length !== 1 ? 's' : ''}`}
        style={{
          position: 'relative', background: 'none', border: 'none',
          cursor: 'pointer', padding: '4px 6px', borderRadius: 8,
          fontSize: 18, lineHeight: 1, color: badge > 0 ? accentColor : '#6e6e73',
          transition: 'color 0.15s',
        }}
      >
        🔔
        {badge > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            background: '#ef4444', color: '#fff',
            fontSize: 10, fontWeight: 700, lineHeight: 1,
            padding: '2px 4px', borderRadius: 999,
            minWidth: 16, textAlign: 'center',
            border: '1.5px solid #fff',
          }}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 340, maxHeight: 480, overflowY: 'auto',
          background: '#fff', borderRadius: 14,
          border: '1px solid #e5e7eb',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          zIndex: 999,
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px 10px', borderBottom: '1px solid #f0f0f5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Notifications</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {loading && <span style={{ fontSize: 11, color: '#6e6e73' }}>Refreshing…</span>}
              <button onClick={load} title="Refresh"
                style={{ background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, color: '#6e6e73', padding: '2px 4px' }}>↻</button>
            </div>
          </div>

          {items.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#6e6e73' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              <div style={{ fontSize: 13 }}>All clear — no pending items</div>
            </div>
          ) : (
            <div>
              {[
                { label: 'Action Required', list: errors },
                { label: 'Due Soon',        list: warnings },
                { label: 'Info',            list: infos },
              ].map(({ label, list }) =>
                list.length === 0 ? null : (
                  <div key={label}>
                    <div style={{
                      padding: '8px 16px 4px',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.6px',
                      color: '#9ca3af', textTransform: 'uppercase',
                    }}>{label}</div>
                    {list.map(n => {
                      const c = SEV_COLOR[n.severity] || SEV_COLOR.info;
                      return (
                        <div key={n.id} style={{
                          margin: '4px 10px', borderRadius: 10,
                          background: c.bg, border: `1px solid ${c.border}`,
                          padding: '10px 12px',
                        }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <span style={{ fontSize: 16, flexShrink: 0 }}>
                              {TYPE_ICON[n.type] || SEV_ICON[n.severity]}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: c.text,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {n.title}
                              </div>
                              <div style={{ fontSize: 12, color: '#374151', marginTop: 2,
                                lineHeight: 1.4 }}>
                                {n.body}
                              </div>
                              {n.date && (
                                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>
                                  {n.date}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              )}
              <div style={{ height: 8 }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
