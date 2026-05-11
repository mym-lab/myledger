// ─── AuthScreen.jsx ───────────────────────────────────────────────────────────
// Login / Signup — Apple light theme
// Handles ?invite=TOKEN URL param: pre-fills email, locks role to accountant

import { useState, useEffect } from 'react';
import { login, signup, getInvite } from '../api.js';

const T = {
  bg:      '#f5f5f7',
  surface: '#ffffff',
  border:  '#d2d2d7',
  text:    '#1d1d1f',
  muted:   '#6e6e73',
  accent:  '#0071e3',
  teal:    '#00836e',
  red:     '#ff3b30',
  green:   '#34c759',
};

const inp = {
  width: '100%', padding: '11px 14px', borderRadius: 10, border: `1px solid ${T.border}`,
  fontSize: 15, color: T.text, background: '#fafafa', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit', marginBottom: 12,
};

export default function AuthScreen({ onLogin }) {
  const [mode,        setMode]       = useState('login');
  const [role,        setRole]       = useState('client');
  const [email,       setEmail]      = useState('');
  const [pass,        setPass]       = useState('');
  const [name,        setName]       = useState('');
  const [company,     setComp]       = useState('');
  const [err,         setErr]        = useState('');
  const [loading,     setLoad]       = useState(false);

  // Invite flow state
  const [inviteToken,  setInviteToken]  = useState('');
  const [inviteClient, setInviteClient] = useState('');  // client trade name
  const [inviteLocked, setInviteLocked] = useState(false); // email + role locked

  // Referral code from ?ref=CODE in URL
  const [refCode, setRefCode] = useState('');

  // On mount — check ?invite=TOKEN and ?ref=CODE in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Capture referral code (persists even if invite also present)
    const ref = params.get('ref');
    if (ref) setRefCode(ref);

    const token  = params.get('invite');
    if (!token) return;

    getInvite(token)
      .then(data => {
        setInviteToken(data.token);
        setInviteClient(data.clientName);
        setEmail(data.email);
        setRole('accountant');
        setInviteLocked(true);
        setMode('signup');           // jump straight to signup
      })
      .catch(() => {
        setErr('This invitation link is invalid or has expired. Ask your client to send a new one.');
      });
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(''); setLoad(true);
    try {
      const res = mode === 'login'
        ? await login({ email, password: pass })
        : await signup({ email, password: pass, name, company, role,
                         inviteToken: inviteToken || undefined,
                         refCode: refCode || undefined });
      onLogin(res.token, res.user);
    } catch (e) { setErr(e.message); }
    finally { setLoad(false); }
  }

  const accentColor = role === 'accountant' ? T.teal : role === 'encoder' ? '#ff9500' : T.accent;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', boxShadow: '0 6px 20px rgba(0,113,227,0.28)' }}>
            <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-1px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}>ML</span>
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>MyLedger</h1>
          <div style={{ fontSize: 13, color: T.muted, marginTop: 4, letterSpacing: '0.2px' }}>by Kaiman & Co.</div>
        </div>

        {/* Referral banner */}
        {refCode && !inviteClient && (
          <div style={{ background: '#fff8ec', border: '1px solid #ff9500', borderRadius: 12,
            padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 20 }}>🎁</div>
            <div>
              <div style={{ fontWeight: 600, color: '#cc7700', fontSize: 14 }}>You were referred!</div>
              <div style={{ fontSize: 13, color: '#3d3d3f', marginTop: 2, lineHeight: 1.5 }}>
                Sign up now and your referrer earns <strong>₱200</strong> when you join MyLedger.
              </div>
            </div>
          </div>
        )}

        {/* Invite banner */}
        {inviteClient && (
          <div style={{ background: '#e6f7f5', border: `1px solid ${T.teal}`, borderRadius: 12,
            padding: '14px 18px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{ fontSize: 20 }}>🎉</div>
            <div>
              <div style={{ fontWeight: 600, color: T.teal, fontSize: 14 }}>You've been invited!</div>
              <div style={{ fontSize: 13, color: '#3d3d3f', marginTop: 2, lineHeight: 1.5 }}>
                <strong>{inviteClient}</strong> has invited you to manage their books on MyLedger.
                Create your free accountant account below to get started.
              </div>
            </div>
          </div>
        )}

        <div style={{ background: T.surface, borderRadius: 18, padding: '28px 28px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: `1px solid ${T.border}` }}>

          {/* Sign in / Create account toggle — hidden when invite locks to signup */}
          {!inviteLocked && (
            <div style={{ display: 'flex', background: T.bg, borderRadius: 10, padding: 3, marginBottom: 24 }}>
              {[['login','Sign In'],['signup','Create Account']].map(([m, lbl]) => (
                <button key={m} onClick={() => { setMode(m); setErr(''); }} style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontSize: 14, fontWeight: 500, fontFamily: 'inherit', transition: 'all .15s',
                  background: mode === m ? T.surface : 'transparent',
                  color: mode === m ? T.text : T.muted,
                  boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                }}>{lbl}</button>
              ))}
            </div>
          )}

          {/* Role selector (signup only, hidden when invite locks role) */}
          {mode === 'signup' && !inviteLocked && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: T.muted, marginBottom: 10 }}>I am signing up as a:</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { value: 'client',     abbr: 'BO', title: 'Business Owner',  desc: 'Self-service bookkeeping',        color: T.accent,  bg: '#e8f2ff' },
                  { value: 'accountant', abbr: 'CA', title: 'Accountant',      desc: 'Manage clients, BIR & reports',   color: T.teal,    bg: '#e6f7f5' },
                  { value: 'encoder',    abbr: 'EN', title: 'Encoder',         desc: 'Data entry for assigned clients', color: '#ff9500', bg: '#fff8ec' },
                ].map(opt => (
                  <div key={opt.value} onClick={() => setRole(opt.value)} style={{
                    padding: '14px', borderRadius: 12, cursor: 'pointer', transition: 'all .15s',
                    border: `2px solid ${role === opt.value ? opt.color : T.border}`,
                    background: role === opt.value ? opt.bg : T.surface,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: opt.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 8, opacity: role === opt.value ? 1 : 0.55 }}>
                      <span style={{ color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '0.3px' }}>{opt.abbr}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 3 }}>{opt.title}</div>
                    <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invite — show locked role badge */}
          {mode === 'signup' && inviteLocked && (
            <div style={{ marginBottom: 18, padding: '10px 14px', background: '#e6f7f5',
              borderRadius: 10, fontSize: 13, color: T.teal, fontWeight: 500 }}>
              Creating an Accountant account
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <input style={inp} type="text" placeholder="Full name" required
                  value={name} onChange={e => setName(e.target.value)} />
                <input style={inp} type="text"
                  placeholder={role === 'accountant' ? 'Accounting firm name (optional)' : 'Business name (optional)'}
                  value={company} onChange={e => setComp(e.target.value)} />
              </>
            )}

            <input
              style={{ ...inp, background: inviteLocked ? '#f0f0f0' : '#fafafa',
                       color: inviteLocked ? T.muted : T.text }}
              type="email" placeholder="Email address" required
              value={email}
              onChange={e => { if (!inviteLocked) setEmail(e.target.value); }}
              readOnly={inviteLocked}
            />
            <input style={{ ...inp, marginBottom: 0 }} type="password" placeholder="Password" required
              value={pass} onChange={e => setPass(e.target.value)} />

            {err && <div style={{ color: T.red, fontSize: 13, marginTop: 10 }}>{err}</div>}

            <button type="submit" disabled={loading} style={{
              width: '100%', marginTop: 18, padding: '13px', border: 'none', borderRadius: 12,
              background: accentColor, color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              fontFamily: 'inherit', transition: 'opacity .15s',
            }}>
              {loading ? 'Please wait…' : mode === 'login' ? 'Sign In'
                : inviteLocked ? 'Accept Invitation & Create Account'
                : `Create ${role === 'accountant' ? 'Accountant' : role === 'encoder' ? 'Encoder' : 'Business Owner'} Account`}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: T.muted }}>
          Philippine VAT-compliant bookkeeping · 3 interfaces for every role
        </div>
      </div>
    </div>
  );
}
