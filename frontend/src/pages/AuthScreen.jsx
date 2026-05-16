// ─── AuthScreen.jsx ───────────────────────────────────────────────────────────
// Login / Signup / Forgot Password / Reset Password — Apple light theme
// Handles ?invite=TOKEN URL param: pre-fills email, locks role to accountant
// Handles ?reset=TOKEN URL param: shows reset-password form

import { useState, useEffect } from 'react';
import { login, signup, getInvite, getSettings, forgotPassword, resetPassword } from '../api.js';

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
  const [inviteClient, setInviteClient] = useState('');
  const [inviteLocked, setInviteLocked] = useState(false);

  // Referral code
  const [refCode,      setRefCode]      = useState('');
  const [signupBonus,  setSignupBonus]  = useState(100);

  // Forgot password flow
  const [forgotMode,    setForgotMode]    = useState(false);
  const [forgotEmail,   setForgotEmail]   = useState('');
  const [forgotMsg,     setForgotMsg]     = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Reset password flow (triggered by ?reset=TOKEN in URL)
  const [resetMode,    setResetMode]    = useState(false);
  const [resetToken,   setResetToken]   = useState('');
  const [newPass,      setNewPass]      = useState('');
  const [confirmPass,  setConfirmPass]  = useState('');
  const [resetMsg,     setResetMsg]     = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetDone,    setResetDone]    = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Password reset flow
    const resetParam = params.get('reset');
    if (resetParam) {
      setResetToken(resetParam);
      setResetMode(true);
      return; // don't process invite or ref when resetting
    }

    // Referral code
    const ref = params.get('ref');
    if (ref) {
      setRefCode(ref);
      getSettings().then(r => {
        const bonus = r?.settings?.referral?.signupBonus;
        if (bonus != null) setSignupBonus(bonus);
      }).catch(() => {});
    }

    // Invite flow
    const token = params.get('invite');
    if (!token) return;

    getInvite(token)
      .then(data => {
        setInviteToken(data.token);
        setInviteClient(data.clientName);
        setEmail(data.email);
        setRole('accountant');
        setInviteLocked(true);
        setMode('signup');
      })
      .catch(() => {
        setErr('This invitation link is invalid or has expired. Ask your client to send a new one.');
      });
  }, []);

  // ── Login / Signup submit ──────────────────────────────────────────────────
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

  // ── Forgot password submit ─────────────────────────────────────────────────
  async function handleForgot(e) {
    e.preventDefault();
    if (!forgotEmail) return;
    setForgotLoading(true); setForgotMsg('');
    try {
      const r = await forgotPassword(forgotEmail);
      setForgotMsg(r?.message || 'If this email is registered, a reset link has been sent.');
    } catch (err) {
      setForgotMsg(err.message || 'Something went wrong. Please try again.');
    } finally { setForgotLoading(false); }
  }

  // ── Reset password submit ──────────────────────────────────────────────────
  async function handleReset(e) {
    e.preventDefault();
    if (newPass !== confirmPass) { setResetMsg('Passwords do not match.'); return; }
    if (newPass.length < 6) { setResetMsg('Password must be at least 6 characters.'); return; }
    setResetLoading(true); setResetMsg('');
    try {
      const r = await resetPassword(resetToken, newPass);
      setResetMsg('✓ ' + (r?.message || 'Password reset successfully!'));
      setResetDone(true);
      // Clean URL and go back to login after 2 s
      setTimeout(() => {
        window.history.replaceState({}, '', '/');
        setResetMode(false); setResetToken(''); setResetDone(false);
        setNewPass(''); setConfirmPass(''); setResetMsg('');
        setMode('login');
      }, 2500);
    } catch (err) {
      setResetMsg(err.message || 'Reset failed. The link may have expired.');
    } finally { setResetLoading(false); }
  }

  const accentColor = role === 'accountant' ? T.teal : role === 'encoder' ? '#ff9500' : T.accent;

  // ─── Render: Reset password card ──────────────────────────────────────────
  if (resetMode) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: T.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px', boxShadow: '0 6px 20px rgba(0,113,227,0.28)' }}>
              <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-1px' }}>ML</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>
              MyLedger
            </h1>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>by Kaiman & Co.</div>
          </div>

          <div style={{ background: T.surface, borderRadius: 18, padding: '28px 28px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: `1px solid ${T.border}` }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: T.text }}>
              Set new password
            </h2>
            <p style={{ margin: '0 0 22px', fontSize: 14, color: T.muted }}>
              Enter and confirm your new password below.
            </p>

            {resetDone ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.green }}>{resetMsg}</div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 8 }}>
                  Redirecting to login…
                </div>
              </div>
            ) : (
              <form onSubmit={handleReset}>
                <input style={inp} type="password" placeholder="New password (min. 6 characters)"
                  value={newPass} onChange={e => setNewPass(e.target.value)} required />
                <input style={{ ...inp, marginBottom: 0 }} type="password" placeholder="Confirm new password"
                  value={confirmPass} onChange={e => setConfirmPass(e.target.value)} required />

                {resetMsg && (
                  <div style={{ fontSize: 13, marginTop: 10,
                    color: resetMsg.startsWith('✓') ? T.green : T.red }}>
                    {resetMsg}
                  </div>
                )}

                <button type="submit" disabled={resetLoading} style={{
                  width: '100%', marginTop: 18, padding: '13px', border: 'none', borderRadius: 12,
                  background: T.accent, color: '#fff', fontSize: 15, fontWeight: 600,
                  cursor: resetLoading ? 'not-allowed' : 'pointer', opacity: resetLoading ? 0.7 : 1,
                  fontFamily: 'inherit',
                }}>
                  {resetLoading ? 'Resetting…' : 'Reset Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Forgot password card ─────────────────────────────────────────
  if (forgotMode) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 20,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ width: 60, height: 60, borderRadius: 16, background: T.accent,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px', boxShadow: '0 6px 20px rgba(0,113,227,0.28)' }}>
              <span style={{ color: '#fff', fontSize: 22, fontWeight: 800, letterSpacing: '-1px' }}>ML</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: T.text, letterSpacing: '-0.5px' }}>
              MyLedger
            </h1>
            <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>by Kaiman & Co.</div>
          </div>

          <div style={{ background: T.surface, borderRadius: 18, padding: '28px 28px',
            boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: `1px solid ${T.border}` }}>
            <h2 style={{ margin: '0 0 6px', fontSize: 20, fontWeight: 700, color: T.text }}>
              Forgot password?
            </h2>
            <p style={{ margin: '0 0 22px', fontSize: 14, color: T.muted }}>
              Enter your email address and we'll send you a reset link.
            </p>

            {forgotMsg ? (
              <div>
                <div style={{ background: '#f0fff4', border: `1px solid ${T.green}30`, borderRadius: 10,
                  padding: '14px 16px', fontSize: 14, color: T.teal, fontWeight: 500, lineHeight: 1.6 }}>
                  📨 {forgotMsg}
                </div>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 12, lineHeight: 1.6 }}>
                  Didn't receive it? Check your spam folder, or{' '}
                  <button type="button" onClick={() => setForgotMsg('')}
                    style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer',
                      fontSize: 13, padding: 0 }}>try again</button>.
                </div>
              </div>
            ) : (
              <form onSubmit={handleForgot}>
                <input style={inp} type="email" placeholder="Your email address" required
                  value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} />

                <button type="submit" disabled={forgotLoading} style={{
                  width: '100%', padding: '13px', border: 'none', borderRadius: 12,
                  background: T.accent, color: '#fff', fontSize: 15, fontWeight: 600,
                  cursor: forgotLoading ? 'not-allowed' : 'pointer', opacity: forgotLoading ? 0.7 : 1,
                  fontFamily: 'inherit', marginBottom: 0,
                }}>
                  {forgotLoading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <div style={{ textAlign: 'center', marginTop: 20 }}>
              <button type="button" onClick={() => { setForgotMode(false); setForgotMsg(''); }}
                style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer',
                  fontSize: 14, padding: 0 }}>
                ← Back to Sign In
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Normal login / signup card ───────────────────────────────────
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
                Sign up now — your referrer earns <strong>₱{signupBonus.toLocaleString('en-PH')} credits</strong> when you join.
                No business registration needed to get started.
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

          {/* Sign in / Create account toggle */}
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

          {/* Role selector (signup only) */}
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

          {/* Invite locked role badge */}
          {mode === 'signup' && inviteLocked && (
            <div style={{ marginBottom: 18, padding: '10px 14px', background: '#e6f7f5',
              borderRadius: 10, fontSize: 13, color: T.teal, fontWeight: 500 }}>
              Creating an Accountant account
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {mode === 'signup' && (
              <>
                <input style={inp} type="text" placeholder="Your full name" required
                  value={name} onChange={e => setName(e.target.value)} />
                <input style={inp} type="text"
                  placeholder={
                    role === 'accountant' ? 'Accounting firm name (optional)'
                    : role === 'encoder'  ? 'Company name (optional)'
                    : 'Business name (optional — you can add this later)'
                  }
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

            {/* Forgot password link — login mode only */}
            {mode === 'login' && (
              <div style={{ textAlign: 'center', marginTop: 14 }}>
                <button type="button"
                  onClick={() => { setForgotMode(true); setForgotEmail(email); setForgotMsg(''); }}
                  style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer',
                    fontSize: 13, padding: 0, textDecoration: 'underline', textDecorationColor: T.border }}>
                  Forgot password?
                </button>
              </div>
            )}
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: T.muted }}>
          Philippine VAT-compliant bookkeeping · 3 interfaces for every role
        </div>
      </div>
    </div>
  );
}
