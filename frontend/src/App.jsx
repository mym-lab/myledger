// ─── App Root ─────────────────────────────────────────────────
// 3 interfaces, routed by URL path + user role:
//
//   /           → ClientInterface   (business owner self-service)
//   /accountant → AccountantPortal  (assigned accountant tools)
//   /admin      → CommandCenter     (MyLedger owner platform view)
//
// The app reads role from the stored user object and redirects
// to the correct interface automatically after login.

import { useState } from 'react';
import ClientInterface   from './pages/ClientInterface.jsx';
import AccountantPortal  from './pages/AccountantPortal.jsx';
import EncoderPortal     from './pages/EncoderPortal.jsx';
import CommandCenter     from './pages/CommandCenter.jsx';
import AuthScreen        from './pages/AuthScreen.jsx';
import OnboardingWizard  from './pages/OnboardingWizard.jsx';
import InvoicePage       from './pages/InvoicePage.jsx';

// Returns true if this user has already completed onboarding
function hasOnboarded(userId) {
  return !!localStorage.getItem(`ml_onboarded_${userId}`);
}
function markOnboarded(userId) {
  localStorage.setItem(`ml_onboarded_${userId}`, '1');
}

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
  const [showOnboarding, setShowOnboarding] = useState(false);

  function handleLogin(tok, usr) {
    localStorage.setItem('ml_token', tok);
    localStorage.setItem('ml_user',  JSON.stringify(usr));
    setToken(tok);
    setUser(usr);
    // Show onboarding wizard on first login (skip for admin)
    if (usr?.role !== 'admin' && !hasOnboarded(usr?.id)) {
      setShowOnboarding(true);
    }
    // Auto-redirect based on role after login
    if (usr?.role === 'admin' && !PATH.startsWith('/admin')) {
      window.location.href = '/admin';
    } else if (usr?.role === 'accountant' && !PATH.startsWith('/accountant')) {
      window.location.href = '/accountant';
    } else if (usr?.role === 'encoder' && !PATH.startsWith('/encoder')) {
      window.location.href = '/encoder';
    }
  }

  function handleOnboardingComplete() {
    if (user?.id) markOnboarded(user.id);
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
    return <AccountantPortal onLogout={handleLogout} />;
  }

  // ── Encoder path ──
  if (PATH.startsWith('/encoder') || user?.role === 'encoder') {
    return <EncoderPortal onLogout={handleLogout} />;
  }

  // ── Default: client self-service ──
  return <ClientInterface onLogout={handleLogout} />;
}
