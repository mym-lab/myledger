// ─── FirmSettings.jsx ─────────────────────────────────────────────────────────
// Modal for accountant white-label configuration:
//   • Firm name (replaces "MyLedger" in header + reports)
//   • Brand accent color (header badge + buttons)
//   • Firm logo (shown in header + PDF reports)

import { useState, useRef } from 'react';
import { updateProfile } from '../api.js';

const PRESET_COLORS = [
  '#00836e', // teal (default)
  '#1d4ed8', // blue
  '#7c3aed', // purple
  '#dc2626', // red
  '#ea580c', // orange
  '#059669', // green
  '#0891b2', // cyan
  '#db2777', // pink
  '#92400e', // brown
  '#1e293b', // slate
];

export default function FirmSettings({ user, onClose, onSaved }) {
  const [firmName,   setFirmName]   = useState(user?.firmName    || '');
  const [accent,     setAccent]     = useState(user?.accentColor || '#00836e');
  const [logoData,   setLogoData]   = useState(user?.firmLogo    || null);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [logoError,  setLogoError]  = useState('');
  const fileRef = useRef(null);

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 300_000) { setLogoError('Logo too large — max 300KB'); return; }
    if (!file.type.startsWith('image/')) { setLogoError('Must be an image file (PNG/SVG/JPG)'); return; }
    setLogoError('');
    const reader = new FileReader();
    reader.onload = ev => setLogoData(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      const result = await updateProfile({
        firmName:    firmName.trim() || null,
        accentColor: accent,
        firmLogo:    logoData,
      });
      // Persist to localStorage so next load picks it up immediately
      try {
        const stored = JSON.parse(localStorage.getItem('ml_user') || '{}');
        stored.firmName    = result.firmName;
        stored.accentColor = result.accentColor;
        stored.firmLogo    = result.firmLogo;
        localStorage.setItem('ml_user', JSON.stringify(stored));
      } catch {}
      onSaved?.(result);
      onClose();
    } catch (e) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const previewAccent = accent || '#00836e';

  return (
    /* Backdrop */
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: 'fixed', inset: 0, zIndex: 1500,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480,
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0f0f5',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Firm Branding</div>
            <div style={{ fontSize: 12, color: '#6e6e73', marginTop: 2 }}>
              Customize your firm name, color, and logo
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>✕</button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Live preview bar */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 14px',
            border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
            {logoData
              ? <img src={logoData} alt="Logo" style={{ height: 28, maxWidth: 80, objectFit: 'contain' }} />
              : <span style={{ fontWeight: 700, fontSize: 15, color: previewAccent }}>
                  {firmName || 'Firm Name'}
                </span>
            }
            <span style={{ background: previewAccent, color: '#fff', fontSize: 10,
              fontWeight: 700, padding: '2px 8px', borderRadius: 5 }}>ACCOUNTANT</span>
            <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>Header preview</span>
          </div>

          {/* Firm name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151',
              display: 'block', marginBottom: 6 }}>
              Firm Name
            </label>
            <input
              value={firmName}
              onChange={e => setFirmName(e.target.value)}
              placeholder="e.g. Dela Cruz & Associates CPA"
              maxLength={60}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 8,
                border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box' }}
            />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Shown in header and PDF reports. Leave blank to use "MyLedger".
            </div>
          </div>

          {/* Accent color */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151',
              display: 'block', marginBottom: 8 }}>
              Brand Color
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESET_COLORS.map(c => (
                <button key={c} onClick={() => setAccent(c)} style={{
                  width: 28, height: 28, borderRadius: '50%', background: c,
                  border: accent === c ? '3px solid #1d1d1f' : '2px solid transparent',
                  cursor: 'pointer', boxShadow: accent === c ? '0 0 0 2px #fff inset' : 'none',
                  flexShrink: 0,
                }} title={c} />
              ))}
              {/* Custom color picker */}
              <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: 4, fontSize: 12, color: '#6e6e73' }}>
                <input type="color" value={accent} onChange={e => setAccent(e.target.value)}
                  style={{ width: 28, height: 28, border: 'none', padding: 0, cursor: 'pointer',
                    borderRadius: 4, background: 'none' }} />
                Custom
              </label>
              <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: 'monospace' }}>{accent}</span>
            </div>
          </div>

          {/* Logo upload */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: '#374151',
              display: 'block', marginBottom: 8 }}>
              Firm Logo
            </label>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {logoData
                ? <img src={logoData} alt="Logo" style={{ height: 48, maxWidth: 120,
                    objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 8, padding: 4 }} />
                : <div style={{ width: 80, height: 48, background: '#f1f5f9', borderRadius: 8,
                    border: '1px dashed #d1d5db', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 20 }}>🏢</div>
              }
              <div>
                <input ref={fileRef} type="file" accept="image/*"
                  onChange={handleLogoChange} style={{ display: 'none' }} />
                <button onClick={() => fileRef.current?.click()}
                  style={{ fontSize: 13, background: '#f1f5f9', border: '1px solid #e2e8f0',
                    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {logoData ? '↩ Replace logo' : '⬆ Upload logo'}
                </button>
                {logoData && (
                  <button onClick={() => setLogoData(null)}
                    style={{ fontSize: 12, marginLeft: 8, background: 'none', border: 'none',
                      cursor: 'pointer', color: '#ef4444' }}>Remove</button>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                  PNG, SVG, or JPG — max 300KB
                </div>
                {logoError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>{logoError}</div>}
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: '#fff1f0', border: '1px solid #fca5a5',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#dc2626' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <button onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: '#f8fafc', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ padding: '9px 20px', borderRadius: 8, border: 'none',
                background: previewAccent, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600, fontFamily: 'inherit', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving…' : 'Save Branding'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
