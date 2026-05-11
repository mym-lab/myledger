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
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('ml_user') || 'null'); } catch { return null; }
  });

  function handleLogin(tok, usr) {
    localStorage.setItem('ml_token', tok);
    localStorage.setItem('ml_user',  JSON.stringify(usr));
    setToken(tok);
    setUser(usr);
    // Auto-redirect based on role after login
    if (usr?.role === 'admin' && !PATH.startsWith('/admin')) {
      window.location.href = '/admin';
    } else if (usr?.role === 'accountant' && !PATH.startsWith('/accountant')) {
      window.location.href = '/accountant';
    } else if (usr?.role === 'encoder' && !PATH.startsWith('/encoder')) {
      window.location.href = '/encoder';
    }
  }

  function handleLogout() {
    localStorage.removeItem('ml_token');
    localStorage.removeItem('ml_user');
    setToken(''); setUser(null);
    window.location.href = '/';
  }

  // ── Admin path — no auth required (MVP) ──
  if (PATH.startsWith('/admin')) {
    return <CommandCenter onLogout={handleLogout} />;
  }

  // ── Require login for all other paths ──
  if (!token) {
    return <AuthScreen onLogin={handleLogin} />;
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
