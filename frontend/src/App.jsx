// ─── App Root ─────────────────────────────────────────────────
// 3 interfaces, routed by URL path + user role:
//
//   /           → ClientInterface   (business owner self-service)
//   /accountant → AccountantPortal  (assigned accountant tools)
//   /admin      → CommandCenter     (MyLedger owner platform view)
//
// The app reads role from the stored user object and redirects
// to the correct interface automatically after login.

import { useState, Component } from 'react';
import ClientInterface   from './pages/ClientInterface.jsx';
import AccountantPortal  from './pages/AccountantPortal.jsx';
import EncoderPortal     from './pages/EncoderPortal.jsx';
import CommandCenter     from './pages/CommandCenter.jsx';
import AuthScreen        from './pages/AuthScreen.jsx';
import OnboardingWizard  from './pages/OnboardingWizard.jsx';
import InvoicePage       from './pages/InvoicePage.jsx';

// ── Error Boundary — catches React render crashes and shows a recovery screen ──
// Without this, any JS error in a portal causes a completely blank white page.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('💥 MyLedger render error:', error, info);
    this.setState({ info });
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message || 'Unknown error';
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', padding: 24,
      }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, maxWidth: 480,
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1d1d1f' }}>
            Something went wrong
          </h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6e6e73', lineHeight: 1.6 }}>
            The app hit an unexpected error. Please refresh — your data is safe.
          </p>
          <div style={{ background: '#f5f5f7', borderRadius: 10, padding: '10px 14px',
            marginBottom: 20, textAlign: 'left' }}>
            <code style={{ fontSize: 11, color: '#e74c3c', wordBreak: 'break-all', lineHeight: 1.6 }}>
              {msg}
            </code>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '10px 22px', background: '#0071e3', color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit' }}>
              Refresh Page
            </button>
            <button
              onClick={() => { localStorage.removeItem('ml_token'); localStorage.removeItem('ml_user'); window.location.reload(); }}
              style={{ padding: '10px 22px', background: 'transparent', color: '#6e6e73',
                border: '1px solid #d2d2d7', borderRadius: 10, fontSize: 14, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'inherit' }}>
              Sign out &amp; Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
}


// Returns true if this user has already completed onboarding
function hasOnboarded(userId) {
  return !!localStorage.getItem(`ml_onboarded_${userId}`);
}
function markOnboarded(userId) {
  localStorage.setItem(`ml_onboarded_${userId}`, '1');
}
// Persists across role-redirect so accountants/encoders see the wizard too
function setPendingOnboard() { localStorage.setItem('ml_pending_onboard', '1'); }
function clearPendingOnboard() { localStorage.removeItem('ml_pending_onboard'); }
function hasPendingOnboard() { return !!localStorage.getItem('ml_pending_onboard'); }

const PATH = window.location.pathname;

// Decode JWT payload and check expiry without a library
function isTokenValid(tok) {
  if (!tok) return false;
  try {
    const payload = JSON.parse(atob(tok.split('.')[1]));
    // exp is in seconds; give 60s leeway
    return payload.exp * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

function clearAuth() {
  localStorage.removeItem('ml_token');
  localStorage.removeItem('ml_user');
}

export default function App() {
  const [token, setToken] = useState(() => {
    const tok = localStorage.getItem('ml_token') || '';
    if (!isTokenValid(tok)) { clearAuth(); return ''; }
    return tok;
  });
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ml_user') || 'null'); } catch { return null; }
  });
  // Check on mount: show wizard if a redirect-surviving pending flag exists
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      const usr = JSON.parse(localStorage.getItem('ml_user') || 'null');
      return !!(usr && usr.role !== 'admin' && hasPendingOnboard() && !hasOnboarded(usr.id));
    } catch { return false; }
  });

  function handleLogin(tok, usr) {
    localStorage.setItem('ml_token', tok);
    localStorage.setItem('ml_user',  JSON.stringify(usr));
    setToken(tok);
    setUser(usr);
    // Mark pending onboarding BEFORE any redirect (persists across page reload)
    if (usr?.role !== 'admin' && !hasOnboarded(usr?.id)) {
      setPendingOnboard();
    }
    // Auto-redirect based on role after login
    if (usr?.role === 'admin' && !PATH.startsWith('/admin')) {
      window.location.href = '/admin';
    } else if (usr?.role === 'accountant' && !PATH.startsWith('/accountant')) {
      window.location.href = '/accountant';
    } else if (usr?.role === 'encoder' && !PATH.startsWith('/encoder')) {
      window.location.href = '/encoder';
    } else {
      // No redirect for clients — show wizard directly
      if (usr?.role !== 'admin' && !hasOnboarded(usr?.id)) setShowOnboarding(true);
    }
  }

  function handleOnboardingComplete() {
    if (user?.id) markOnboarded(user.id);
    clearPendingOnboard();
    setShowOnboarding(false);
  }

  function handleLogout() {
    localStorage.removeItem('ml_token');
    localStorage.removeItem('ml_user');
    setToken(''); setUser(null);
    window.location.href = '/';
  }

  // ── Public invoice view — no auth required ──
  if (PATH.startsWith('/invoice/')) {
    return <InvoicePage />;
  }

  // ── Admin path — requires valid token + admin role ──
  if (PATH.startsWith('/admin')) {
    if (!token || user?.role !== 'admin') {
      return <AuthScreen onLogin={handleLogin} adminMode />;
    }
    return <CommandCenter onLogout={handleLogout} />;
  }

  // ── Require login for all other paths ──
  if (!token) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  // ── Onboarding wizard — shown alone (no portal underneath) to avoid
  //    background API calls failing and triggering a redirect loop ──
  if (showOnboarding) {
    return <OnboardingWizard user={user} onComplete={handleOnboardingComplete} />;
  }

  // ── Accountant path ──
  if (PATH.startsWith('/accountant') || user?.role === 'accountant') {
    return <ErrorBoundary><AccountantPortal onLogout={handleLogout} /></ErrorBoundary>;
  }

  // ── Encoder path ──
  if (PATH.startsWith('/encoder') || user?.role === 'encoder') {
    return <ErrorBoundary><EncoderPortal onLogout={handleLogout} /></ErrorBoundary>;
  }

  // ── Default: client self-service ──
  return <ErrorBoundary><ClientInterface onLogout={handleLogout} /></ErrorBoundary>;
}
