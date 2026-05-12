// ─── CommandCenter.jsx ───────────────────────────────────────────────────────
// MyLedger Admin Dashboard — Apple-inspired light theme
// Tabs: Overview · Clients · Users · Settings

import { useState, useEffect } from 'react';
import {
  getAdminStats, getSettings, updateSettings,
  getUpgradeRequests, approveUpgradeRequest, rejectUpgradeRequest,
  setAccountantTier, setAccountantBranding, setClientSubscriptionTier,
  saveSmtpSettings, sendTestEmail, sendBIRReminders,
  getAuditLog,
  getAllReferrals, creditReferral,
} from '../api.js';

const T = {
  bg:      '#f5f5f7',
  surface: '#ffffff',
  border:  '#d2d2d7',
  text:    '#1d1d1f',
  muted:   '#6e6e73',
  accent:  '#6e3de8',   // purple for admin
  green:   '#34c759',
  orange:  '#ff9500',
  red:     '#ff3b30',
  blue:    '#0071e3',
  radius:  '12px',
  shadow:  '0 2px 12px rgba(0,0,0,0.08)',
};

const TIER_COLORS = { free: T.muted, starter: T.blue, professional: '#af52de', enterprise: T.orange };

const peso = (n) => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt  = (d) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

const inp = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
  fontSize: 14, color: T.text, background: '#fafafa', boxSizing: 'border-box',
  outline: 'none', fontFamily: 'inherit',
};

function Card({ children, style = {} }) {
  return (
    <div style={{ background: T.surface, borderRadius: T.radius, padding: '20px 24px',
      boxShadow: T.shadow, border: `1px solid ${T.border}`, ...style }}>
      {children}
    </div>
  );
}

function SectionHead({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 14,
    textTransform: 'uppercase', letterSpacing: '0.6px' }}>{children}</div>;
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ background: T.surface, borderRadius: T.radius, padding: '20px 24px',
      boxShadow: T.shadow, border: `1px solid ${T.border}`, flex: 1, minWidth: 160 }}>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: color || T.text, letterSpacing: '-0.5px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

const TABS = ['Overview', 'Upgrade Requests', 'Referrals', 'Clients', 'Users', 'Audit Log', 'Settings'];

export default function CommandCenter({ onLogout }) {
  const [tab,      setTab]     = useState('Overview');
  const [stats,    setStats]   = useState(null);
  const [settings, setSettings] = useState(null);
  const [error,    setError]   = useState('');

  // Settings form state
  const [pricingForm,  setPricingForm]  = useState({ starter: '', professional: '', enterprise: '' });
  const [paymentForm,  setPaymentForm]  = useState({
    mayaName: '', mayaNumber: '', gcashName: '', gcashNumber: '',
  });
  const [emailForm,    setEmailForm]    = useState('');
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');

  // Upgrade requests
  const [upgradeReqs,  setUpgradeReqs]  = useState([]);
  const [reqLoading,   setReqLoading]   = useState(false);
  const [reqFilter,    setReqFilter]    = useState('pending'); // 'all' | 'pending' | 'approved' | 'rejected'
  const [rejectModal,  setRejectModal]  = useState(null);  // upgradeReq id being rejected
  const [rejectReason, setRejectReason] = useState('');
  const [actionMsg,    setActionMsg]    = useState('');
  // Accountant tier management
  const [tierMsg,      setTierMsg]      = useState('');
  const [acctPricingForm, setAcctPricingForm] = useState({ solo: '', professional: '', firm: '', agency: '' });
  // Referral rate settings
  const [referralForm,  setReferralForm]  = useState({ signupBonus: '100', subscriptionPercent: '10' });
  // White-label branding forms: keyed by userId
  const [brandingForms, setBrandingForms] = useState({});  // { [userId]: { firmName, accentColor } }
  const [brandingMsg,   setBrandingMsg]   = useState('');
  // SMTP / email reminders
  const [smtpForm,    setSmtpForm]    = useState({ host: '', port: '587', secure: false, user: '', pass: '', fromName: 'MyLedger', fromEmail: '', enabled: false });
  const [smtpMsg,     setSmtpMsg]     = useState('');
  const [smtpSaving,  setSmtpSaving]  = useState(false);
  const [testEmail,   setTestEmail]   = useState('');
  const [reminderMsg, setReminderMsg] = useState('');
  // Audit log (system-wide — admin picks client)
  const [auditClients,   setAuditClients]   = useState([]);
  const [auditClientId,  setAuditClientId]  = useState('');
  const [auditEntries,   setAuditEntries]   = useState([]);
  const [auditLoad,      setAuditLoad]      = useState(false);
  // Referrals
  const [allReferrals,   setAllReferrals]   = useState([]);
  const [refLoading,     setRefLoading]     = useState(false);
  const [refMsg,         setRefMsg]         = useState('');
  const [refFilter,      setRefFilter]      = useState('all');

  useEffect(() => {
    loadUpgradeRequests();
    // auditClients is derived from stats.clients (loaded below) — no separate call needed
  }, []);

  async function loadAllReferrals() {
    setRefLoading(true);
    try { const r = await getAllReferrals(); setAllReferrals(r.referrals || []); }
    catch (e) { console.error(e); }
    finally { setRefLoading(false); }
  }

  async function handleCreditReferral(id, amount) {
    const display = amount ? `₱${Number(amount).toLocaleString('en-PH')}` : 'the bonus';
    if (!confirm(`Credit this referral and add ${display} to the referrer's balance?`)) return;
    try {
      await creditReferral(id);
      setRefMsg(`✓ Referral credited! ${display} added to referrer balance.`);
      loadAllReferrals();
      setTimeout(() => setRefMsg(''), 4000);
    } catch (e) { alert(e.message); }
  }

  async function loadAudit(clientId) {
    const id = clientId || auditClientId;
    if (!id) return;
    setAuditLoad(true);
    try { const r = await getAuditLog(id, 200); setAuditEntries(r.entries || []); }
    catch (e) { console.error(e); }
    finally { setAuditLoad(false); }
  }

  async function loadUpgradeRequests() {
    setReqLoading(true);
    try { const r = await getUpgradeRequests(); setUpgradeReqs(r.upgradeRequests || []); }
    catch (e) { console.error(e); }
    finally { setReqLoading(false); }
  }

  async function handleApprove(id) {
    if (!confirm('Approve this upgrade? The plan will be activated immediately.')) return;
    try {
      await approveUpgradeRequest(id);
      setActionMsg('✓ Approved — plan activated.');
      loadUpgradeRequests();
      getAdminStats().then(setStats).catch(() => {});
      setTimeout(() => setActionMsg(''), 4000);
    } catch (e) { alert(e.message); }
  }

  async function handleReject(id) {
    try {
      await rejectUpgradeRequest(id, rejectReason.trim() || 'Payment not verified');
      setRejectModal(null); setRejectReason('');
      setActionMsg('Request rejected.');
      loadUpgradeRequests();
      setTimeout(() => setActionMsg(''), 4000);
    } catch (e) { alert(e.message); }
  }

  // Load referrals when Referrals tab is active
  useEffect(() => {
    if (tab === 'Referrals') loadAllReferrals();
  }, [tab]);

  useEffect(() => {
    getAdminStats().then(setStats).catch(e => setError(e.message));
    getSettings().then(r => {
      if (!r?.settings) return;
      const s = r.settings;
      setSettings(s);
      setPricingForm({
        starter:      String(s.pricing?.starter      ?? 399),
        professional: String(s.pricing?.professional ?? 699),
        enterprise:   String(s.pricing?.enterprise   ?? 999),
      });
      setPaymentForm({
        mayaName:    s.payment?.maya?.name    ?? 'Kaiman & Co.',
        mayaNumber:  s.payment?.maya?.number  ?? '',
        gcashName:   s.payment?.gcash?.name   ?? 'Kaiman & Co.',
        gcashNumber: s.payment?.gcash?.number ?? '',
      });
      setEmailForm(s.contactEmail ?? 'mym@kaimanco.com');
      setAcctPricingForm({
        solo:         String(s.accountantPricing?.solo         ?? 599),
        professional: String(s.accountantPricing?.professional ?? 1499),
        firm:         String(s.accountantPricing?.firm         ?? 2999),
        agency:       String(s.accountantPricing?.agency       ?? 4999),
      });
      if (s.referral) setReferralForm({
        signupBonus:         String(s.referral.signupBonus         ?? 100),
        subscriptionPercent: String(s.referral.subscriptionPercent ?? 10),
      });
      if (s.smtp) setSmtpForm(f => ({ ...f, passSet: !!s.smtp.passSet,
        ...f,
        host:      s.smtp.host      ?? '',
        port:      String(s.smtp.port ?? 587),
        secure:    s.smtp.secure    ?? false,
        user:      s.smtp.user      ?? '',
        fromName:  s.smtp.fromName  ?? 'MyLedger',
        fromEmail: s.smtp.fromEmail ?? '',
        enabled:   s.smtp.enabled   ?? false,
        // note: pass is NOT returned from server for security
      }));
    }).catch(() => {});
  }, []);

  async function handleSetClientTier(clientId, tier) {
    try {
      await setClientSubscriptionTier(clientId, tier);
      setTierMsg(`✓ Subscription set to "${tier}"`);
      getAdminStats().then(setStats).catch(() => {});
      setTimeout(() => setTierMsg(''), 3000);
    } catch (e) { alert(e.message); }
  }

  async function handleSetTier(userId, tier) {
    try {
      await setAccountantTier(userId, tier);
      setTierMsg(`✓ Tier set to "${tier}"`);
      getAdminStats().then(setStats).catch(() => {});
      setTimeout(() => setTierMsg(''), 3000);
    } catch (e) { alert(e.message); }
  }

  function getBrandingForm(u) {
    return brandingForms[u.id] ?? { firmName: u.firmName || '', accentColor: u.accentColor || '#0071e3' };
  }
  function setBrandingField(userId, field, value) {
    setBrandingForms(prev => ({
      ...prev,
      [userId]: { ...(prev[userId] ?? { firmName: '', accentColor: '#0071e3' }), [field]: value },
    }));
  }
  async function handleSetBranding(u) {
    const form = getBrandingForm(u);
    try {
      await setAccountantBranding(u.id, form.firmName, form.accentColor);
      setBrandingMsg(`✓ Branding saved for ${u.name || u.email}`);
      getAdminStats().then(setStats).catch(() => {});
      setTimeout(() => setBrandingMsg(''), 3000);
    } catch (e) { alert(e.message); }
  }

  async function handleSaveSmtp() {
    setSmtpSaving(true); setSmtpMsg('');
    try {
      await saveSmtpSettings({
        host:      smtpForm.host,
        port:      Number(smtpForm.port),
        secure:    smtpForm.secure,
        user:      smtpForm.user,
        pass:      smtpForm.pass || undefined,  // only send if changed
        fromName:  smtpForm.fromName,
        fromEmail: smtpForm.fromEmail,
        enabled:   smtpForm.enabled,
      });
      setSmtpMsg('✓ SMTP settings saved');
      setTimeout(() => setSmtpMsg(''), 3000);
    } catch (e) { setSmtpMsg('✗ ' + e.message); }
    finally { setSmtpSaving(false); }
  }

  async function handleTestEmail() {
    if (!testEmail) return alert('Enter a recipient email first');
    try {
      const r = await sendTestEmail(testEmail);
      setSmtpMsg('✓ ' + r.message);
      setTimeout(() => setSmtpMsg(''), 4000);
    } catch (e) { setSmtpMsg('✗ ' + e.message); }
  }

  async function handleSendReminders() {
    if (!confirm('Send BIR deadline reminders to all accountants now?')) return;
    setReminderMsg('Sending…');
    try {
      const r = await sendBIRReminders(7);
      setReminderMsg(`✓ ${r.message}`);
      setTimeout(() => setReminderMsg(''), 5000);
    } catch (e) { setReminderMsg('✗ ' + e.message); }
  }

  async function saveSettings() {
    setSaving(true); setSaveMsg('');
    try {
      const r = await updateSettings({
        pricing: {
          starter:      Number(pricingForm.starter),
          professional: Number(pricingForm.professional),
          enterprise:   Number(pricingForm.enterprise),
        },
        payment: {
          maya:  { name: paymentForm.mayaName,  number: paymentForm.mayaNumber  },
          gcash: { name: paymentForm.gcashName, number: paymentForm.gcashNumber },
        },
        contactEmail: emailForm,
        accountantPricing: {
          solo:         Number(acctPricingForm.solo),
          professional: Number(acctPricingForm.professional),
          firm:         Number(acctPricingForm.firm),
          agency:       Number(acctPricingForm.agency),
        },
        referral: {
          signupBonus:         Number(referralForm.signupBonus),
          subscriptionPercent: Number(referralForm.subscriptionPercent),
        },
      });
      setSettings(r.settings);
      setSaveMsg('✓ Settings saved successfully');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e) { setSaveMsg('Error: ' + e.message); }
    finally { setSaving(false); }
  }

  const totalInputVAT  = stats?.inputVAT  ?? 0;
  const totalOutputVAT = stats?.outputVAT ?? 0;
  const netVAT         = totalOutputVAT - totalInputVAT;

  // Subscription breakdown from clients
  const tierCounts = { free: 0, starter: 0, professional: 0, enterprise: 0 };
  (stats?.clients || []).forEach(c => {
    const t = c.subscriptionTier || 'free';
    if (t in tierCounts) tierCounts[t]++;
  });

  return (
    <div style={{ minHeight: '100vh', background: T.bg,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif',
      color: T.text }}>

      {/* Header */}
      <div style={{ background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 56 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 16 }}>MyLedger</span>
            <span style={{ color: T.muted, fontSize: 14 }}>by Kaiman &amp; Co.</span>
            <span style={{ background: T.accent, color: '#fff', fontSize: 11, fontWeight: 700,
              padding: '2px 9px', borderRadius: 6, letterSpacing: '0.4px' }}>ADMIN</span>
          </div>
          <button onClick={onLogout}
            style={{ background: T.border, border: 'none', borderRadius: 8, padding: '6px 14px',
              fontSize: 13, cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit' }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 24px 56px' }}>

        {error && (
          <div style={{ color: T.red, background: '#fff5f5', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, fontSize: 14 }}>{error}</div>
        )}

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: T.surface, padding: 4,
          borderRadius: 10, boxShadow: T.shadow, flexWrap: 'wrap' }}>
          {TABS.map(t => {
            const pendingCount = t === 'Upgrade Requests' ? upgradeReqs.filter(r => r.status === 'pending').length : 0;
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 500, fontFamily: 'inherit', transition: 'all .15s',
                background: tab === t ? T.accent : 'transparent',
                color:      tab === t ? '#fff'   : T.muted,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {t}
                {pendingCount > 0 && (
                  <span style={{ background: T.orange, color: '#fff', fontSize: 10, fontWeight: 700,
                    borderRadius: 10, padding: '1px 6px', lineHeight: 1.4 }}>{pendingCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ════════════ OVERVIEW ════════════ */}
        {tab === 'Overview' && (
          <div>
            <h2 style={{ margin: '0 0 22px', fontSize: 22, fontWeight: 600 }}>Platform Overview</h2>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              <MetricCard label="Total Users"         value={stats?.totalUsers        ?? '—'} color={T.accent} />
              <MetricCard label="Client Businesses"   value={stats?.totalClients      ?? '—'} color={T.blue} />
              <MetricCard label="Total Transactions"  value={stats?.totalTransactions  ?? '—'} color={T.text} />
              <MetricCard label="Net Revenue (all)"   value={stats ? peso(stats.totalRevenue) : '—'} sub="VAT-exclusive" color={T.green} />
            </div>

            {/* Subscription breakdown */}
            <Card style={{ marginBottom: 20 }}>
              <SectionHead>Subscription Breakdown</SectionHead>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {Object.entries(tierCounts).map(([tier, count]) => (
                  <div key={tier} style={{ flex: 1, minWidth: 100, textAlign: 'center',
                    background: `${TIER_COLORS[tier]}10`, borderRadius: 10, padding: '14px 12px',
                    border: `1px solid ${TIER_COLORS[tier]}30` }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: TIER_COLORS[tier] }}>{count}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TIER_COLORS[tier],
                      textTransform: 'capitalize', marginTop: 4 }}>{tier}</div>
                    {settings?.pricing?.[tier] && (
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>
                        ₱{settings.pricing[tier]}/mo
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* VAT summary */}
            <Card style={{ marginBottom: 20 }}>
              <SectionHead>Platform-Wide VAT Summary</SectionHead>
              <div style={{ display: 'flex', gap: 36, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 12, color: T.muted }}>Total Input VAT (assets)</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: T.green }}>{peso(totalInputVAT)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: T.muted }}>Total Output VAT (liabilities)</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: T.orange }}>{peso(totalOutputVAT)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: T.muted }}>Net VAT across all clients</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: netVAT >= 0 ? T.red : T.green }}>
                    {peso(Math.abs(netVAT))}
                    <span style={{ fontSize: 12, fontWeight: 400, marginLeft: 8, color: T.muted }}>
                      {netVAT >= 0 ? 'net payable' : 'net credit'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Pending upgrade requests notice */}
            {upgradeReqs.filter(r => r.status === 'pending').length > 0 && (
              <div onClick={() => setTab('Upgrade Requests')}
                style={{ background: '#fff8ec', borderRadius: T.radius, padding: '12px 18px',
                  fontSize: 13, color: T.orange, border: `1px solid ${T.orange}30`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18 }}>💳</span>
                <strong>{upgradeReqs.filter(r => r.status === 'pending').length} upgrade request{upgradeReqs.filter(r => r.status === 'pending').length > 1 ? 's' : ''} pending review</strong>
                <span style={{ marginLeft: 'auto', color: T.orange }}>View →</span>
              </div>
            )}

            <div style={{ background: '#f0f7ff', borderRadius: T.radius, padding: '12px 18px',
              fontSize: 13, color: T.muted, border: `1px solid #d0e8ff` }}>
              ℹ️ Admin panel is not behind authentication in MVP. Secure before production deployment.
            </div>
          </div>
        )}

        {/* ════════════ UPGRADE REQUESTS ════════════ */}
        {tab === 'Upgrade Requests' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>Upgrade Requests</h2>
                <div style={{ fontSize: 13, color: T.muted }}>
                  Client and accountant plan upgrade notifications pending payment verification.
                </div>
              </div>
              <button onClick={loadUpgradeRequests}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
                  padding: '7px 14px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 6, color: T.text }}>
                ↻ Refresh
              </button>
            </div>

            {actionMsg && (
              <div style={{ background: '#f0fff4', color: T.green, borderRadius: 8,
                padding: '10px 16px', fontSize: 13, fontWeight: 600, marginBottom: 16,
                border: `1px solid ${T.green}30` }}>{actionMsg}</div>
            )}

            {/* Filter pills */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {['pending', 'approved', 'rejected', 'all'].map(f => {
                const counts = { all: upgradeReqs.length };
                ['pending','approved','rejected'].forEach(s => {
                  counts[s] = upgradeReqs.filter(r => r.status === s).length;
                });
                const active = reqFilter === f;
                const fColors = { pending: T.orange, approved: T.green, rejected: T.red, all: T.muted };
                const fc = fColors[f];
                return (
                  <button key={f} onClick={() => setReqFilter(f)} style={{
                    padding: '5px 14px', borderRadius: 20, border: `1px solid ${active ? fc : T.border}`,
                    background: active ? `${fc}15` : T.surface,
                    color: active ? fc : T.muted,
                    fontSize: 13, fontWeight: active ? 700 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)} ({counts[f]})
                  </button>
                );
              })}
            </div>

            {reqLoading ? <div style={{ color: T.muted, padding: 20 }}>Loading…</div> : (() => {
              const filtered = reqFilter === 'all'
                ? upgradeReqs
                : upgradeReqs.filter(r => r.status === reqFilter);

              if (filtered.length === 0) return (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
                  <div>No {reqFilter === 'all' ? '' : reqFilter + ' '}upgrade requests.</div>
                </div>
              );

              const TIER_C = { free: T.muted, starter: T.blue, professional: '#af52de', enterprise: T.orange };

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filtered.map(req => {
                    const tc = TIER_C[req.targetTier] || T.muted;
                    const statusColor = req.status === 'approved' ? T.green : req.status === 'rejected' ? T.red : T.orange;
                    const statusBg    = req.status === 'approved' ? '#f0fff4' : req.status === 'rejected' ? '#fff5f5' : '#fff8ec';
                    return (
                      <div key={req.id} style={{ background: T.surface, borderRadius: T.radius,
                        border: `1px solid ${T.border}`, boxShadow: T.shadow, padding: '18px 22px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                          {/* Left side */}
                          <div style={{ flex: 1, minWidth: 220 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 700, fontSize: 16 }}>{req.displayName || req.tradeName || req.displayEmail}</span>
                              <span style={{
                                background: req.requestType === 'accountant' ? '#af52de15' : '#0071e315',
                                color:      req.requestType === 'accountant' ? '#af52de'   : '#0071e3',
                                fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                                textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                {req.requestType === 'accountant' ? '🧾 Accountant' : '🏢 Client'}
                              </span>
                              <span style={{ background: `${tc}15`, color: tc, fontSize: 11, fontWeight: 700,
                                padding: '2px 9px', borderRadius: 5, textTransform: 'uppercase' }}>
                                → {req.targetTier}
                              </span>
                              <span style={{ background: statusBg, color: statusColor, fontSize: 11,
                                fontWeight: 700, padding: '2px 9px', borderRadius: 5, textTransform: 'uppercase' }}>
                                {req.status}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
                              <span style={{ color: T.muted }}>
                                💳 <strong>{req.method?.toUpperCase()}</strong>
                              </span>
                              <span style={{ color: T.muted }}>
                                Ref: <span style={{ fontFamily: 'monospace', color: T.text, fontWeight: 600 }}>{req.refNo}</span>
                              </span>
                              {req.amount > 0 && (
                                <span style={{ color: T.muted }}>
                                  Amount: <strong style={{ color: T.green }}>{peso(req.amount)}</strong>
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: T.muted, marginTop: 5 }}>
                              Submitted {fmt(req.createdAt)}
                              {req.resolvedAt && ` · Resolved ${fmt(req.resolvedAt)}`}
                            </div>
                            {req.rejectedReason && (
                              <div style={{ fontSize: 12, color: T.red, marginTop: 4, fontStyle: 'italic' }}>
                                Reason: {req.rejectedReason}
                              </div>
                            )}
                          </div>

                          {/* Action buttons — only for pending */}
                          {req.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <button onClick={() => handleApprove(req.id)}
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                                  background: T.green, color: '#fff', fontSize: 13, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'inherit' }}>
                                ✓ Approve
                              </button>
                              <button onClick={() => { setRejectModal(req.id); setRejectReason(''); }}
                                style={{ padding: '8px 18px', borderRadius: 8,
                                  border: `1px solid ${T.red}`, background: 'transparent',
                                  color: T.red, fontSize: 13, fontWeight: 600,
                                  cursor: 'pointer', fontFamily: 'inherit' }}>
                                ✕ Reject
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Pending-request count badge in tab */}
            {/* Reject reason modal */}
            {rejectModal && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}
                onClick={() => setRejectModal(null)}>
                <div style={{ background: T.surface, borderRadius: 16, padding: 28, width: '100%',
                  maxWidth: 420, boxShadow: '0 4px 24px rgba(0,0,0,0.15)' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ margin: '0 0 16px', fontSize: 17, fontWeight: 600 }}>Reject Upgrade Request</h3>
                  <label style={{ fontSize: 13, color: T.muted, display: 'block', marginBottom: 6 }}>
                    Reason (shown to client)
                  </label>
                  <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    rows={3} placeholder="e.g. Reference number not found, payment not received…"
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
                      fontSize: 14, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
                    <button onClick={() => setRejectModal(null)}
                      style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${T.border}`,
                        background: 'transparent', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Cancel
                    </button>
                    <button onClick={() => handleReject(rejectModal)}
                      style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                        background: T.red, color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'inherit' }}>
                      Confirm Reject
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════ REFERRALS ════════════ */}
        {tab === 'Referrals' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Referral Management</h2>
                <div style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
                  Signup bonus: <strong>₱{settings?.referral?.signupBonus ?? 100} credits</strong> per referral ·
                  Subscription commission: <strong>{settings?.referral?.subscriptionPercent ?? 10}%</strong> per approved payment.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {refMsg && <span style={{ fontSize: 13, color: T.green }}>{refMsg}</span>}
                <button onClick={loadAllReferrals} style={{ padding: '7px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
                  background: T.surface, fontSize: 13, cursor: 'pointer', color: T.muted }}>↻ Refresh</button>
              </div>
            </div>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {['all', 'pending', 'credited'].map(f => (
                <button key={f} onClick={() => setRefFilter(f)} style={{
                  padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 500, fontFamily: 'inherit',
                  background: refFilter === f ? T.accent : T.bg,
                  color: refFilter === f ? '#fff' : T.muted,
                }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {refLoading && <div style={{ color: T.muted, fontSize: 14 }}>Loading…</div>}

            {!refLoading && (() => {
              const filtered = allReferrals.filter(r => refFilter === 'all' || r.status === refFilter);
              if (filtered.length === 0) return (
                <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>🔗</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>No {refFilter !== 'all' ? refFilter : ''} referrals found</div>
                </div>
              );
              return (
                <div style={{ background: T.surface, borderRadius: T.radius, overflow: 'hidden',
                  boxShadow: T.shadow, border: `1px solid ${T.border}` }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead style={{ background: T.bg }}>
                      <tr>
                        {['Referrer', 'Referee Email', 'Status', 'Reward', 'Date', 'Action'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left',
                            fontSize: 11, fontWeight: 600, color: T.muted,
                            textTransform: 'uppercase', letterSpacing: '0.5px',
                            borderBottom: `1px solid ${T.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(r => (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 500 }}>{r.referrerName || '—'}</div>
                            <div style={{ fontSize: 11, color: T.muted }}>{r.referrerEmail}</div>
                          </td>
                          <td style={{ padding: '12px 14px', color: T.text }}>{r.refereeEmail}</td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                              background: r.status === 'credited' ? '#e8f8ee' : '#fff8ec',
                              color: r.status === 'credited' ? T.green : T.orange }}>
                              {r.status === 'credited' ? '✓ Credited' : '⏳ Pending'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', fontWeight: 600,
                            color: r.status === 'credited' ? T.green : T.muted }}>
                            {r.status === 'credited' ? `₱${r.rewardAmount}` : `₱${r.rewardAmount} (pending)`}
                          </td>
                          <td style={{ padding: '12px 14px', color: T.muted }}>
                            {new Date(r.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            {r.status === 'pending' ? (
                              <button onClick={() => handleCreditReferral(r.id, r.rewardAmount)} style={{
                                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                                background: T.green, color: '#fff', fontSize: 12, fontWeight: 600,
                                fontFamily: 'inherit',
                              }}>
                                ✓ Credit ₱{r.rewardAmount}
                              </button>
                            ) : (
                              <span style={{ fontSize: 12, color: T.muted }}>
                                {r.creditedAt ? new Date(r.creditedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '—'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        )}

        {/* ════════════ CLIENTS ════════════ */}
        {tab === 'Clients' && (
          <div>
            <h2 style={{ margin: '0 0 22px', fontSize: 22, fontWeight: 600 }}>
              Client Businesses ({stats?.totalClients ?? 0})
            </h2>
            {!stats || stats.clients.length === 0 ? (
              <div style={{ color: T.muted, padding: 20 }}>No clients yet.</div>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.bg }}>
                        {['Trade Name','TIN','Type','Plan','Tax Types','Transactions','Added'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                            color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.clients.map((c, i) => {
                        const tier = c.subscriptionTier || 'free';
                        const tc   = TIER_COLORS[tier] || T.muted;
                        return (
                          <tr key={c.id} style={{ borderBottom: i < stats.clients.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                            <td style={{ padding: '11px 14px', fontWeight: 600 }}>{c.tradeName}</td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontFamily: 'monospace', fontSize: 12 }}>{c.tin}</td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12 }}>{c.type}</td>
                            <td style={{ padding: '11px 14px' }}>
                              <span style={{ background: `${tc}15`, color: tc, fontSize: 11, fontWeight: 700,
                                padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                {tier}
                              </span>
                            </td>
                            <td style={{ padding: '11px 14px' }}>
                              {(c.taxTypes || []).length === 0 ? (
                                <span style={{ color: T.muted, opacity: 0.4 }}>—</span>
                              ) : (
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {c.taxTypes.map(code => (
                                    <span key={code} style={{ background: '#f0f7ff', color: T.blue,
                                      fontSize: 10, padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{code}</span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '11px 14px', textAlign: 'center', fontWeight: 600 }}>{c.txCount}</td>
                            <td style={{ padding: '11px 14px', color: T.muted, whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(c.createdAt)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ════════════ USERS ════════════ */}
        {tab === 'Users' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
                All Users ({stats?.totalUsers ?? 0})
              </h2>
              {tierMsg && (
                <span style={{ fontSize: 13, fontWeight: 600, color: tierMsg.startsWith('✓') ? '#00836e' : T.orange }}>
                  {tierMsg}
                </span>
              )}
              {brandingMsg && (
                <span style={{ fontSize: 13, fontWeight: 600, color: '#00836e', marginLeft: 12 }}>
                  {brandingMsg}
                </span>
              )}
            </div>
            {!stats || stats.users.length === 0 ? (
              <div style={{ color: T.muted, padding: 20 }}>No users yet.</div>
            ) : (
              <Card style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.bg }}>
                        {['Name','Email','Role','Tier','Company','Joined','Actions'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                            color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}`,
                            whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stats.users.map((u, i) => {
                        const isAcct    = u.role === 'accountant';
                        const isEncoder = u.role === 'encoder';
                        const isClient  = !isAcct && !isEncoder;
                        const roleColor = isAcct ? '#00836e' : isEncoder ? '#e07000' : T.blue;
                        const tier      = u.accountantTier || 'free';
                        const TIER_COLORS = { free: T.muted, solo: '#0071e3', professional: '#ff9500', firm: '#34c759', agency: '#af52de' };
                        const tierColor = TIER_COLORS[tier] || T.muted;
                        // For client users, look up their business(es)
                        const clientBiz = isClient ? (stats.clients || []).filter(c => c.ownerId === u.id) : [];
                        const SUB_COLORS = { free: T.muted, starter: T.blue, professional: '#af52de', enterprise: T.orange };
                        const isAgency  = isAcct && tier === 'agency';
                        const bForm     = getBrandingForm(u);
                        const rowBorder = `1px solid ${T.border}`;
                        return (
                          <>
                          <tr key={u.id} style={{ borderBottom: isAgency ? 'none' : (i < stats.users.length - 1 ? rowBorder : 'none') }}>
                            <td style={{ padding: '11px 14px', fontWeight: 600 }}>{u.name || '—'}</td>
                            <td style={{ padding: '11px 14px', color: T.muted, fontSize: 12 }}>{u.email}</td>
                            <td style={{ padding: '11px 14px' }}>
                              <span style={{ background: `${roleColor}15`, color: roleColor, fontSize: 11,
                                fontWeight: 700, padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase' }}>
                                {u.role || 'client'}
                              </span>
                            </td>
                            <td style={{ padding: '11px 14px' }}>
                              {isAcct ? (
                                <span style={{ background: `${tierColor}18`, color: tierColor, fontSize: 11,
                                  fontWeight: 700, padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase' }}>
                                  {tier}
                                </span>
                              ) : isClient && clientBiz.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  {clientBiz.map(biz => {
                                    const sc = SUB_COLORS[biz.subscriptionTier] || T.muted;
                                    return (
                                      <span key={biz.id} style={{ background: `${sc}18`, color: sc, fontSize: 11,
                                        fontWeight: 700, padding: '2px 8px', borderRadius: 5, textTransform: 'uppercase' }}>
                                        {biz.subscriptionTier}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : <span style={{ color: T.border }}>—</span>}
                            </td>
                            <td style={{ padding: '11px 14px', color: T.muted }}>{u.company || '—'}</td>
                            <td style={{ padding: '11px 14px', color: T.muted, whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(u.createdAt)}</td>
                            <td style={{ padding: '11px 14px' }}>
                              {isAcct ? (
                                <select value={tier}
                                  onChange={e => handleSetTier(u.id, e.target.value)}
                                  style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6,
                                    border: `1px solid ${T.border}`, background: T.surface,
                                    color: T.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                                  <option value="free">Free</option>
                                  <option value="solo">Solo (₱{(settings?.accountantPricing?.solo ?? 599).toLocaleString()})</option>
                                  <option value="professional">Professional (₱{(settings?.accountantPricing?.professional ?? 1499).toLocaleString()})</option>
                                  <option value="firm">Firm (₱{(settings?.accountantPricing?.firm ?? 2999).toLocaleString()})</option>
                                  <option value="agency">Agency (₱{(settings?.accountantPricing?.agency ?? 4999).toLocaleString()})</option>
                                </select>
                              ) : isClient && clientBiz.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  {clientBiz.map(biz => (
                                    <div key={biz.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 11, color: T.muted, maxWidth: 80,
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {biz.tradeName}
                                      </span>
                                      <select value={biz.subscriptionTier}
                                        onChange={e => handleSetClientTier(biz.id, e.target.value)}
                                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6,
                                          border: `1px solid ${T.border}`, background: T.surface,
                                          color: T.text, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        <option value="free">Free</option>
                                        <option value="starter">Starter (₱{(settings?.pricing?.starter ?? 399).toLocaleString()})</option>
                                        <option value="professional">Professional (₱{(settings?.pricing?.professional ?? 699).toLocaleString()})</option>
                                        <option value="enterprise">Enterprise (₱{(settings?.pricing?.enterprise ?? 999).toLocaleString()})</option>
                                      </select>
                                    </div>
                                  ))}
                                </div>
                              ) : <span style={{ color: T.border, fontSize: 12 }}>—</span>}
                            </td>
                          </tr>
                          {isAgency && (
                            <tr key={`${u.id}-branding`}
                              style={{ borderBottom: i < stats.users.length - 1 ? rowBorder : 'none',
                                background: '#faf5ff' }}>
                              <td colSpan={7} style={{ padding: '10px 16px 14px 16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: '#af52de',
                                    textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                                    🏷 White-label
                                  </span>
                                  <input
                                    placeholder="Firm name (e.g. Dela Cruz Accounting)"
                                    value={bForm.firmName}
                                    onChange={e => setBrandingField(u.id, 'firmName', e.target.value)}
                                    style={{ fontSize: 12, padding: '5px 10px', borderRadius: 7,
                                      border: `1px solid ${T.border}`, background: T.surface,
                                      color: T.text, fontFamily: 'inherit', width: 220 }}
                                  />
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <label style={{ fontSize: 12, color: T.muted }}>Accent:</label>
                                    <input type="color" value={bForm.accentColor}
                                      onChange={e => setBrandingField(u.id, 'accentColor', e.target.value)}
                                      style={{ width: 36, height: 28, border: 'none', borderRadius: 6,
                                        cursor: 'pointer', padding: 2, background: 'none' }} />
                                    <span style={{ fontSize: 12, color: T.muted, fontFamily: 'monospace' }}>
                                      {bForm.accentColor}
                                    </span>
                                  </div>
                                  <button onClick={() => handleSetBranding(u)}
                                    style={{ fontSize: 12, padding: '5px 14px', borderRadius: 7,
                                      background: '#af52de', color: '#fff', border: 'none',
                                      cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                                    Save
                                  </button>
                                  {(u.firmName || u.accentColor) && (
                                    <span style={{ fontSize: 11, color: T.muted }}>
                                      Current: <strong>{u.firmName || '(none)'}</strong>
                                      {u.accentColor && (
                                        <span style={{ marginLeft: 6, display: 'inline-block',
                                          width: 12, height: 12, borderRadius: 3,
                                          background: u.accentColor, verticalAlign: 'middle' }} />
                                      )}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ════════════ AUDIT LOG ════════════ */}
        {tab === 'Audit Log' && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 600 }}>Audit Log</h2>
            <p style={{ margin: '0 0 20px', fontSize: 13, color: T.muted }}>
              Append-only trail of all creates, voids, period locks, and logins. Select a client to view.
            </p>
            <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
              <select value={auditClientId} style={{ padding: '9px 12px', borderRadius: 8,
                border: `1px solid ${T.border}`, fontSize: 14, background: '#fafafa', minWidth: 240 }}
                onChange={e => { setAuditClientId(e.target.value); setAuditEntries([]); }}>
                <option value="">— Select client —</option>
                {(stats?.clients || []).map(c => <option key={c.id} value={c.id}>{c.tradeName}</option>)}
              </select>
              <button onClick={() => loadAudit(auditClientId)} disabled={!auditClientId}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', cursor: auditClientId ? 'pointer' : 'not-allowed',
                  background: T.accent, color: '#fff', fontSize: 14, fontWeight: 500, opacity: auditClientId ? 1 : 0.5 }}>
                Load Log
              </button>
            </div>
            {auditLoad ? <div style={{ color: T.muted }}>Loading…</div>
            : auditEntries.length === 0 ? (
              <div style={{ color: T.muted, fontSize: 13, padding: '20px 0' }}>
                {auditClientId ? 'No audit entries for this client yet.' : 'Select a client above.'}
              </div>
            ) : (
              <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: T.bg }}>
                      {['Timestamp', 'Action', 'Entity', 'Detail'].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600,
                          color: T.muted, fontSize: 11, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditEntries.map((e, i) => (
                      <tr key={e.id} style={{ borderBottom: i < auditEntries.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                        <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12, whiteSpace: 'nowrap' }}>
                          {new Date(e.timestamp).toLocaleString('en-PH')}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{
                            background: e.action.includes('VOID') ? '#fff0f0' : e.action.includes('LOCK') ? '#fff8ec' : '#f0faf8',
                            color: e.action.includes('VOID') ? '#ff3b30' : e.action.includes('LOCK') ? '#e07000' : T.accent,
                            padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                          }}>{e.action.replace(/_/g, ' ')}</span>
                        </td>
                        <td style={{ padding: '10px 14px', color: T.muted, fontSize: 12 }}>{e.entity}</td>
                        <td style={{ padding: '10px 14px', fontSize: 12 }}>{e.detail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════ SETTINGS ════════════ */}
        {tab === 'Settings' && (
          <div>
            <h2 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 600 }}>Platform Settings</h2>
            <p style={{ margin: '0 0 28px', fontSize: 14, color: T.muted }}>
              Changes take effect immediately for all new upgrade payments.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Client Pricing */}
              <Card>
                <SectionHead>Client Subscription Pricing (₱/month)</SectionHead>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {[
                    { key: 'starter',      label: 'Starter',      color: T.blue,    limit: '300 tx/mo' },
                    { key: 'professional', label: 'Professional', color: '#af52de', limit: '500 tx/mo' },
                    { key: 'enterprise',   label: 'Enterprise',   color: T.orange,  limit: 'Unlimited' },
                  ].map(({ key, label, color, limit }) => (
                    <div key={key}>
                      <label style={{ display: 'flex', justifyContent: 'space-between',
                        fontSize: 13, fontWeight: 600, color, marginBottom: 5 }}>
                        <span>{label}</span>
                        <span style={{ fontWeight: 400, color: T.muted, fontSize: 12 }}>{limit}</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 16, color: T.muted }}>₱</span>
                        <input style={{ ...inp, fontWeight: 600, fontSize: 16 }}
                          type="number" min="0" value={pricingForm[key]}
                          onChange={e => setPricingForm(f => ({ ...f, [key]: e.target.value }))} />
                        <span style={{ fontSize: 13, color: T.muted, whiteSpace: 'nowrap' }}>/month</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Payment accounts */}
              <Card>
                <SectionHead>Payment Accounts</SectionHead>

                {/* Maya */}
                <div style={{ marginBottom: 18, padding: '14px', background: '#f0fbff',
                  borderRadius: 10, border: '1px solid #00a8e020' }}>
                  <div style={{ fontWeight: 700, color: '#00a8e0', marginBottom: 10, fontSize: 14 }}>
                    Maya
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>Account Name</label>
                      <input style={inp} value={paymentForm.mayaName}
                        onChange={e => setPaymentForm(f => ({ ...f, mayaName: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>Mobile Number</label>
                      <input style={inp} value={paymentForm.mayaNumber} placeholder="09XXXXXXXXX"
                        onChange={e => setPaymentForm(f => ({ ...f, mayaNumber: e.target.value }))} />
                    </div>
                  </div>
                </div>

                {/* GCash */}
                <div style={{ padding: '14px', background: '#f0f5ff',
                  borderRadius: 10, border: '1px solid #007dff20' }}>
                  <div style={{ fontWeight: 700, color: '#007dff', marginBottom: 10, fontSize: 14 }}>
                    GCash
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>Account Name</label>
                      <input style={inp} value={paymentForm.gcashName}
                        onChange={e => setPaymentForm(f => ({ ...f, gcashName: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>Mobile Number</label>
                      <input style={inp} value={paymentForm.gcashNumber} placeholder="09XXXXXXXXX"
                        onChange={e => setPaymentForm(f => ({ ...f, gcashNumber: e.target.value }))} />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Accountant Pricing */}
              <Card style={{ gridColumn: '1 / -1' }}>
                <SectionHead>Accountant Plan Pricing (₱/month)</SectionHead>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
                  Accountants pay these rates to unlock all portal features. Each tier has a different client limit.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                  {[
                    { key: 'solo',         label: 'Solo',         color: '#0071e3', desc: 'Up to 5 clients' },
                    { key: 'professional', label: 'Professional', color: '#ff9500', desc: 'Up to 15 clients' },
                    { key: 'firm',         label: 'Firm',         color: '#34c759', desc: 'Unlimited clients' },
                    { key: 'agency',       label: 'Agency',       color: '#af52de', desc: 'Unlimited + white-label' },
                  ].map(({ key, label, color, desc }) => (
                    <div key={key}>
                      <label style={{ display: 'flex', flexDirection: 'column', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color }}>{label}</span>
                        <span style={{ fontWeight: 400, color: T.muted, fontSize: 11, marginTop: 1 }}>{desc}</span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 15, color: T.muted }}>₱</span>
                        <input style={{ ...inp, fontWeight: 600, fontSize: 16, marginBottom: 0 }}
                          type="number" min="0" value={acctPricingForm[key]}
                          onChange={e => setAcctPricingForm(f => ({ ...f, [key]: e.target.value }))} />
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>/month</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Referral Program Rates */}
              <Card style={{ gridColumn: '1 / -1' }}>
                <SectionHead>Referral Program Rates</SectionHead>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
                  Adjust these as you scale. Reduce once you hit 100 clients or want to protect margins.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                  <div>
                    <label style={{ fontSize: 13, color: T.muted, display: 'block', marginBottom: 5 }}>
                      Signup bonus — credited when a referred user creates their account
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 15, color: T.muted }}>₱</span>
                      <input style={{ ...inp, fontWeight: 600, fontSize: 16, marginBottom: 0 }}
                        type="number" min="0" value={referralForm.signupBonus}
                        onChange={e => setReferralForm(f => ({ ...f, signupBonus: e.target.value }))} />
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                      Currently: <strong style={{ color: T.accent }}>₱{Number(referralForm.signupBonus).toLocaleString() || 0} credits</strong> per signup
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, color: T.muted, display: 'block', marginBottom: 5 }}>
                      Subscription commission — credited to referrer on each approved payment
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input style={{ ...inp, fontWeight: 600, fontSize: 16, marginBottom: 0 }}
                        type="number" min="0" max="100" value={referralForm.subscriptionPercent}
                        onChange={e => setReferralForm(f => ({ ...f, subscriptionPercent: e.target.value }))} />
                      <span style={{ fontSize: 15, color: T.muted }}>%</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                      E.g. Starter (₱{Number(referralForm.subscriptionPercent || 0) > 0
                        ? Math.round(399 * Number(referralForm.subscriptionPercent) / 100)
                        : 0}) · Professional (₱{Number(referralForm.subscriptionPercent || 0) > 0
                        ? Math.round(699 * Number(referralForm.subscriptionPercent) / 100)
                        : 0}) · Enterprise (₱{Number(referralForm.subscriptionPercent || 0) > 0
                        ? Math.round(999 * Number(referralForm.subscriptionPercent) / 100)
                        : 0})
                    </div>
                  </div>
                </div>
              </Card>

              {/* Contact + save */}
              <Card style={{ gridColumn: '1 / -1' }}>
                <SectionHead>Contact &amp; Support</SectionHead>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px', alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: 13, color: T.muted, display: 'block', marginBottom: 5 }}>
                      Support email (shown to clients after payment)
                    </label>
                    <input style={inp} type="email" value={emailForm}
                      onChange={e => setEmailForm(e.target.value)} placeholder="hello@kaimanco.com" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button onClick={saveSettings} disabled={saving}
                      style={{ padding: '10px 28px', borderRadius: 8, border: 'none',
                        background: saving ? T.border : T.accent, color: '#fff',
                        fontWeight: 600, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit', transition: 'background .15s' }}>
                      {saving ? 'Saving…' : 'Save All Settings'}
                    </button>
                    {saveMsg && (
                      <span style={{ fontSize: 13, color: saveMsg.startsWith('✓') ? T.green : T.red,
                        fontWeight: 600 }}>{saveMsg}</span>
                    )}
                  </div>
                </div>
              </Card>

            </div>

            {/* Live preview — Clients */}
            <Card style={{ marginTop: 20 }}>
              <SectionHead>Live Preview — Client Plans</SectionHead>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {['starter','professional','enterprise'].map(key => {
                  const colors = { starter: T.blue, professional: '#af52de', enterprise: T.orange };
                  const labels = { starter: 'Starter', professional: 'Professional', enterprise: 'Enterprise' };
                  const descs  = {
                    starter:      'Charts · BIR reminders · VAT position · Backup',
                    professional: 'Everything + accountant access & collaboration',
                    enterprise:   'Multi-entity · priority support · white-label',
                  };
                  const price = pricingForm[key];
                  const c = colors[key];
                  return (
                    <div key={key} style={{ flex: 1, minWidth: 180, borderRadius: 12, padding: '16px',
                      border: `2px solid ${c}`, background: `${c}06` }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: c }}>{labels[key]}</div>
                      <div style={{ fontSize: 12, color: T.muted, marginTop: 4, lineHeight: 1.5 }}>{descs[key]}</div>
                      <div style={{ marginTop: 10, fontSize: 24, fontWeight: 700, color: c }}>₱{price || '—'}</div>
                      <div style={{ fontSize: 12, color: T.muted }}>/month</div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Live preview — Accountants */}
            <Card style={{ marginTop: 16 }}>
              <SectionHead>Live Preview — Accountant Plans</SectionHead>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { key: 'solo',         label: 'Solo',         color: '#0071e3', clients: '5 clients',              desc: 'All portal features' },
                  { key: 'professional', label: 'Professional', color: '#ff9500', clients: '15 clients',             desc: 'All features + priority support' },
                  { key: 'firm',         label: 'Firm',         color: '#34c759', clients: 'Unlimited clients',      desc: 'All features + multi-user' },
                  { key: 'agency',       label: 'Agency',       color: '#af52de', clients: 'Unlimited + white-label', desc: 'Full branding & firm customization' },
                ].map(({ key, label, color, clients, desc }) => (
                  <div key={key} style={{ flex: 1, minWidth: 160, borderRadius: 12, padding: '16px',
                    border: `2px solid ${color}`, background: `${color}06` }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color }}>{label}</div>
                    <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{clients}</div>
                    <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700, color }}>
                      ₱{Number(acctPricingForm[key]).toLocaleString() || '—'}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted }}>/month</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 6, lineHeight: 1.4 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </Card>

            {/* ── SMTP / Email Reminders ── */}
            <Card style={{ marginTop: 24, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <SectionHead style={{ margin: 0 }}>Email Reminders — SMTP Configuration</SectionHead>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ fontSize: 13, color: T.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={smtpForm.enabled}
                      onChange={e => setSmtpForm(f => ({ ...f, enabled: e.target.checked }))} />
                    Enable reminders
                  </label>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>SMTP Host</label>
                  <input style={{ ...inp, width: '100%' }} placeholder="smtp.gmail.com"
                    value={smtpForm.host} onChange={e => setSmtpForm(f => ({ ...f, host: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>Port</label>
                  <input style={{ ...inp, width: '100%' }} placeholder="587"
                    value={smtpForm.port} onChange={e => setSmtpForm(f => ({ ...f, port: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
                  <label style={{ fontSize: 13, color: T.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={smtpForm.secure}
                      onChange={e => setSmtpForm(f => ({ ...f, secure: e.target.checked }))} />
                    TLS / SSL (port 465)
                  </label>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>SMTP Username</label>
                  <input style={{ ...inp, width: '100%' }} placeholder="you@gmail.com"
                    value={smtpForm.user} onChange={e => setSmtpForm(f => ({ ...f, user: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>SMTP Password / App Password</label>
                  <input type="password" style={{ ...inp, width: '100%' }}
                    placeholder={smtpForm.passSet ? '●●●● saved — type to change' : 'App Password'}
                    value={smtpForm.pass} onChange={e => setSmtpForm(f => ({ ...f, pass: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>From Name</label>
                  <input style={{ ...inp, width: '100%' }} placeholder="MyLedger"
                    value={smtpForm.fromName} onChange={e => setSmtpForm(f => ({ ...f, fromName: e.target.value }))} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: T.muted, display: 'block', marginBottom: 4 }}>From Email</label>
                  <input style={{ ...inp, width: '100%' }} placeholder="noreply@myledger.ph"
                    value={smtpForm.fromEmail} onChange={e => setSmtpForm(f => ({ ...f, fromEmail: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button onClick={handleSaveSmtp} disabled={smtpSaving}
                  style={{ padding: '8px 18px', borderRadius: 8, background: T.accent, color: '#fff',
                    border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  {smtpSaving ? 'Saving…' : 'Save SMTP'}
                </button>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input style={{ ...inp, width: 200 }} placeholder="test@example.com"
                    value={testEmail} onChange={e => setTestEmail(e.target.value)} />
                  <button onClick={handleTestEmail}
                    style={{ padding: '8px 14px', borderRadius: 8, background: T.surface, color: T.text,
                      border: `1px solid ${T.border}`, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    Send Test
                  </button>
                </div>
                {smtpMsg && (
                  <span style={{ fontSize: 13, fontWeight: 600,
                    color: smtpMsg.startsWith('✓') ? '#00836e' : T.red }}>{smtpMsg}</span>
                )}
              </div>
            </Card>

            {/* ── Send Reminders Now ── */}
            <Card style={{ marginTop: 16, gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <SectionHead style={{ margin: '0 0 4px' }}>BIR Deadline Reminders</SectionHead>
                  <div style={{ fontSize: 13, color: T.muted }}>
                    Scans all accountants with clients and emails them any BIR deadlines within the next 7 days (2550M, 2551M, 1601-EQ, quarterly forms).
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <button onClick={handleSendReminders}
                    style={{ padding: '9px 20px', borderRadius: 8, background: smtpForm.enabled ? T.accent : T.border,
                      color: '#fff', border: 'none', fontSize: 13, fontWeight: 600,
                      cursor: smtpForm.enabled ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                      opacity: smtpForm.enabled ? 1 : 0.5 }}
                    disabled={!smtpForm.enabled}>
                    📧 Send Reminders Now
                  </button>
                  {reminderMsg && (
                    <span style={{ fontSize: 12, fontWeight: 600,
                      color: reminderMsg.startsWith('✓') ? '#00836e' : T.red }}>{reminderMsg}</span>
                  )}
                  {!smtpForm.enabled && (
                    <span style={{ fontSize: 11, color: T.muted }}>Enable SMTP above to activate</span>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
