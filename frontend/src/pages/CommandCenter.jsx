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
  restoreBackup,
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

const TABS = ['Overview', 'Upgrade Requests', 'Referrals', 'Clients', 'Users', 'Audit Log', 'Security', 'Settings'];

// ── Restore Backup Button ─────────────────────────────────────────────────────
function RestoreBackupButton({ onDone }) {
  const [status, setStatus] = useState(null); // null | 'loading' | 'success' | 'conflict' | 'error'
  const [msg,    setMsg]    = useState('');
  const [pending, setPending] = useState(null); // backup data waiting for force-confirm

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    setStatus('loading'); setMsg('');
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.client || !data.exportedAt)
        throw new Error('Invalid backup file — not a MyLedger backup.');
      await doRestore(data, false);
    } catch (err) {
      setStatus('error');
      setMsg(err.message || 'Restore failed');
    }
  }

  async function doRestore(data, force) {
    setStatus('loading'); setMsg('');
    try {
      const r = await restoreBackup(data, force);
      setStatus('success');
      setMsg(`✅ "${r.clientId ? data.client.tradeName : ''}" restored — ${r.restored?.transactions ?? 0} transactions, ${r.restored?.invoices ?? 0} invoices.`);
      setPending(null);
      if (onDone) onDone();
    } catch (err) {
      if (err.message?.includes('already exists')) {
        setStatus('conflict');
        setMsg(err.message);
        setPending(data);
      } else {
        setStatus('error');
        setMsg(err.message || 'Restore failed');
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        background: '#1d1d1f', color: '#fff', fontSize: 13, fontWeight: 600,
        padding: '8px 16px', borderRadius: 8, userSelect: 'none',
        opacity: status === 'loading' ? 0.6 : 1,
      }}>
        {status === 'loading' ? '⏳ Restoring…' : '⬆ Restore Backup'}
        <input type="file" accept=".json" onChange={handleFile}
          style={{ display: 'none' }} disabled={status === 'loading'} />
      </label>

      {status === 'conflict' && (
        <div style={{ background: '#fff8ec', border: '1px solid #ff9500', borderRadius: 8,
          padding: '10px 14px', fontSize: 13, maxWidth: 380, textAlign: 'right' }}>
          <div style={{ color: '#ff9500', fontWeight: 600, marginBottom: 6 }}>⚠ Client already exists</div>
          <div style={{ color: '#1d1d1f', marginBottom: 10, fontSize: 12 }}>{msg}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setStatus(null); setMsg(''); setPending(null); }}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d2d2d7',
                background: '#fff', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => doRestore(pending, true)}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none',
                background: '#ff3b30', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              Overwrite & Restore
            </button>
          </div>
        </div>
      )}

      {(status === 'success' || status === 'error') && (
        <div style={{ fontSize: 12, color: status === 'success' ? '#34c759' : '#ff3b30',
          maxWidth: 380, textAlign: 'right' }}>
          {msg}
        </div>
      )}
    </div>
  );
}

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
  const [staffLimitForm,  setStaffLimitForm]  = useState({ free: '0', starter: '1', solo: '2', professional: '5', firm: '10', agency: '25' });
  // Referral rate settings
  const [referralForm,  setReferralForm]  = useState({ signupBonus: '100', subscriptionPercent: '10' });
  // EWT / ATC rates (editable table)
  const DEFAULT_EWT_RATES_CC = [
    { atc: 'WC010', rate: '0.01', description: 'Purchase of goods — regular supplier' },
    { atc: 'WC020', rate: '0.02', description: 'Purchase of services — regular supplier' },
    { atc: 'WC158', rate: '0.01', description: 'Purchase of goods — large taxpayer' },
    { atc: 'WC160', rate: '0.02', description: 'Purchase of services — large taxpayer' },
    { atc: 'WF010', rate: '0.05', description: 'Professional / talent fees (≤ ₱3M income)' },
    { atc: 'WF020', rate: '0.10', description: 'Professional / talent fees (> ₱3M income)' },
    { atc: 'WR010', rate: '0.05', description: 'Rental — real/personal property' },
    { atc: 'WC050', rate: '0.10', description: 'Commissions — brokers, agents' },
    { atc: 'WF000', rate: '0.25', description: 'Non-resident alien not engaged in trade' },
  ];
  const [ewtRatesForm, setEwtRatesForm] = useState(DEFAULT_EWT_RATES_CC);
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
  // Active users (live polling)
  const [activeUsers,    setActiveUsers]    = useState([]);

  // Backup
  const [backupList,   setBackupList]   = useState([]);
  const [backupBusy,   setBackupBusy]   = useState(false);
  const [backupMsg,    setBackupMsg]    = useState('');

  // Security / login attempts
  const [secAttempts,    setSecAttempts]    = useState([]);
  const [secSummary,     setSecSummary]     = useState(null);
  const [secLoad,        setSecLoad]        = useState(false);
  const [secFilter,      setSecFilter]      = useState('failed'); // 'failed' | 'all'
  const [secEmailFilter, setSecEmailFilter] = useState('');

  // Named function so RestoreBackupButton (and other places) can call it
  function loadStats() {
    getAdminStats().then(setStats).catch(e => setError(e.message));
  }

  function loadActiveUsers() {
    const token = localStorage.getItem('ml_token') || '';
    fetch('/api/monitoring/active-users', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.users) setActiveUsers(data.users); })
      .catch(() => {});
  }

  useEffect(() => {
    loadUpgradeRequests();
    loadActiveUsers();
    const interval = setInterval(loadActiveUsers, 60_000);
    return () => clearInterval(interval);
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
    try { const r = await getUpgradeRequests(); setUpgradeReqs(r?.upgradeRequests || []); }
    catch (e) { console.error(e); }
    finally { setReqLoading(false); }
  }

  async function handleApprove(id) {
    if (!confirm('Approve this upgrade? The plan will be activated immediately.')) return;
    try {
      await approveUpgradeRequest(id);
      setActionMsg('✓ Approved — plan activated.');
      loadUpgradeRequests();
      loadStats();
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
    if (tab === 'Security')  loadLoginAttempts();
    if (tab === 'Settings')  loadBackups();
  }, [tab]);

  async function loadBackups() {
    const token = localStorage.getItem('ml_token') || '';
    try {
      const res  = await fetch('/api/admin/backups', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setBackupList(data.backups || []);
    } catch (_) {}
  }

  async function triggerBackup() {
    setBackupBusy(true); setBackupMsg('');
    const token = localStorage.getItem('ml_token') || '';
    try {
      const res  = await fetch('/api/admin/backup', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.ok) { setBackupMsg(`✅ Backup complete: ${data.fileName} (${data.sizeMB} MB)`); loadBackups(); }
      else setBackupMsg(`❌ ${data.error}`);
    } catch (e) { setBackupMsg(`❌ ${e.message}`); }
    finally { setBackupBusy(false); }
  }

  async function loadLoginAttempts(filter, emailQ) {
    setSecLoad(true);
    const f = filter  !== undefined ? filter  : secFilter;
    const q = emailQ  !== undefined ? emailQ  : secEmailFilter;
    try {
      const token = localStorage.getItem('ml_token') || '';
      let url = `/api/admin/login-attempts?limit=300`;
      if (f === 'failed')  url += '&success=0';
      if (f === 'success') url += '&success=1';
      if (q.trim()) url += `&email=${encodeURIComponent(q.trim())}`;
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setSecAttempts(data.attempts || []);
      setSecSummary(data.summary  || null);
    } catch (e) { console.error(e); }
    finally { setSecLoad(false); }
  }

  useEffect(() => {
    loadStats();
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
      if (Array.isArray(s.ewtRates) && s.ewtRates.length > 0) {
        setEwtRatesForm(s.ewtRates.map(r => ({ atc: r.atc, rate: String(r.rate), description: r.description || '' })));
      }
      if (s.staffLimits) setStaffLimitForm({
        free:         String(s.staffLimits.free         ?? 0),
        starter:      String(s.staffLimits.starter      ?? 1),
        solo:         String(s.staffLimits.solo         ?? 2),
        professional: String(s.staffLimits.professional ?? 5),
        firm:         String(s.staffLimits.firm         ?? 10),
        agency:       String(s.staffLimits.agency       ?? 25),
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
      loadStats();
      setTimeout(() => setTierMsg(''), 3000);
    } catch (e) { alert(e.message); }
  }

  async function handleSetTier(userId, tier) {
    try {
      await setAccountantTier(userId, tier);
      setTierMsg(`✓ Tier set to "${tier}"`);
      loadStats();
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
      loadStats();
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
        ewtRates: ewtRatesForm
          .filter(r => r.atc.trim() && !isNaN(Number(r.rate)) && Number(r.rate) >= 0 && Number(r.rate) <= 1)
          .map(r => ({ atc: r.atc.trim().toUpperCase(), rate: Number(r.rate), description: r.description.trim() })),
        staffLimits: {
          free:         Number(staffLimitForm.free),
          starter:      Number(staffLimitForm.starter),
          solo:         Number(staffLimitForm.solo),
          professional: Number(staffLimitForm.professional),
          firm:         Number(staffLimitForm.firm),
          agency:       Number(staffLimitForm.agency),
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

  // ── MRR / Revenue metrics (MyLedger's own subscription revenue, not clients' revenue) ──
  const prices = {
    starter:      Number(settings?.pricing?.starter)      || 299,
    professional: Number(settings?.pricing?.professional) || 499,
    enterprise:   Number(settings?.pricing?.enterprise)   || 699,
  };
  // Count annual vs monthly per tier — annual subscribers pay 0.8× monthly (20% off)
  const annualCounts  = { free: 0, starter: 0, professional: 0, enterprise: 0 };
  const monthlyCounts = { free: 0, starter: 0, professional: 0, enterprise: 0 };
  (stats?.clients || []).forEach(c => {
    const t = c.subscriptionTier || 'free';
    if (!(t in annualCounts)) return;
    if (c.billingCycle === 'annual') annualCounts[t]++;
    else monthlyCounts[t]++;
  });
  // MRR = monthly clients × full price + annual clients × (price × 0.8)
  const mrr = ['starter', 'professional', 'enterprise'].reduce((sum, t) => {
    return sum
      + monthlyCounts[t] * prices[t]
      + annualCounts[t]  * prices[t] * 0.8;
  }, 0);
  const arr = mrr * 12;
  const paidCount = tierCounts.starter + tierCounts.professional + tierCounts.enterprise;
  const annualCount = annualCounts.starter + annualCounts.professional + annualCounts.enterprise;
  const totalClientCount = stats?.totalClients || 0;
  const conversionRate = totalClientCount > 0 ? Math.round((paidCount / totalClientCount) * 100) : 0;

  // Churn risk: free clients older than 14 days who never converted
  const _fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString();
  const churnRisk = (stats?.clients || [])
    .filter(c => (c.subscriptionTier === 'free' || !c.subscriptionTier) && c.createdAt < _fourteenDaysAgo)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest first

  // Recent sign-ups (last 7 days), newest first
  const _sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const recentSignups = (stats?.users || [])
    .filter(u => u.createdAt >= _sevenDaysAgo)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  const _daysAgo = (iso) => Math.floor((Date.now() - new Date(iso)) / 86400000);
  const _timeAgo = (iso) => {
    if (!iso) return 'never';
    const mins = Math.floor((Date.now() - new Date(iso)) / 60000);
    if (mins < 2)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

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
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>Platform Overview</h2>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 22 }}>
              MyLedger subscription revenue &amp; platform health
            </div>

            {/* ── Row 1: MyLedger Revenue ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
              letterSpacing: '0.6px', marginBottom: 10 }}>MyLedger Revenue</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              <MetricCard label="Monthly Recurring Revenue" color={T.green}
                value={stats ? peso(mrr) : '—'}
                sub={`ARR: ${stats ? peso(arr) : '—'}`} />
              <MetricCard label="Paid Subscribers" color={T.accent}
                value={stats ? paidCount : '—'}
                sub={`of ${totalClientCount} client businesses`} />
              <MetricCard label="Conversion Rate" color={conversionRate >= 40 ? T.green : T.orange}
                value={stats ? `${conversionRate}%` : '—'}
                sub="free → paid" />
              <MetricCard label="Total Users" color={T.blue}
                value={stats?.totalUsers ?? '—'}
                sub={stats ? `+${stats.newUsersWeek} this week` : 'loading…'} />
            </div>

            {/* ── Row 2: Activity ── */}
            <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase',
              letterSpacing: '0.6px', marginBottom: 10 }}>User Activity</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
              <MetricCard label="Active Now" color={activeUsers.length > 0 ? T.green : T.muted}
                value={activeUsers.length} sub="last 5 min" />
              <MetricCard label="Active This Week" color={T.blue}
                value={stats?.activeWeek ?? '—'} sub="unique users" />
              <MetricCard label="New Sign-Ups This Month" color={T.text}
                value={stats?.newUsersMonth ?? '—'} sub={`${stats?.newUsersWeek ?? '—'} this week`} />
              <MetricCard label="Total Transactions" color={T.text}
                value={stats?.totalTransactions ?? '—'} sub="all time" />
            </div>

            {/* ── Subscription Revenue Breakdown ── */}
            <Card style={{ marginBottom: 20 }}>
              <SectionHead>Subscription Revenue Breakdown</SectionHead>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {Object.entries(tierCounts).map(([tier, count]) => {
                  const price   = prices[tier] || 0;
                  const mCount  = monthlyCounts[tier] || 0;
                  const aCount  = annualCounts[tier]  || 0;
                  const tMrr    = mCount * price + aCount * price * 0.8;
                  return (
                    <div key={tier} style={{ flex: 1, minWidth: 110, textAlign: 'center',
                      background: `${TIER_COLORS[tier]}10`, borderRadius: 10, padding: '16px 12px',
                      border: `1px solid ${TIER_COLORS[tier]}30` }}>
                      <div style={{ fontSize: 30, fontWeight: 700, color: TIER_COLORS[tier] }}>{count}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: TIER_COLORS[tier],
                        textTransform: 'capitalize', marginTop: 4 }}>{tier}</div>
                      {/* Annual / monthly split badges */}
                      {tier !== 'free' && count > 0 && (
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                          {mCount > 0 && (
                            <span style={{ fontSize: 10, background: '#f0f4ff', color: T.blue,
                              padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>
                              {mCount} mo
                            </span>
                          )}
                          {aCount > 0 && (
                            <span style={{ fontSize: 10, background: '#f0fdf4', color: '#16a34a',
                              padding: '2px 7px', borderRadius: 8, fontWeight: 600 }}>
                              {aCount} yr ✓
                            </span>
                          )}
                        </div>
                      )}
                      {tier !== 'free' && price > 0 && (
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>
                          ₱{price}/mo {aCount > 0 ? `· ₱${Math.round(price*0.8*12).toLocaleString()}/yr` : ''}
                        </div>
                      )}
                      {tier !== 'free' && tMrr > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.green,
                          marginTop: 8, background: '#f0fdf4', borderRadius: 6, padding: '3px 8px' }}>
                          ₱{Math.round(tMrr).toLocaleString()}/mo
                        </div>
                      )}
                      {tier === 'free' && (
                        <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>no revenue</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {mrr > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}`,
                  display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: 11, color: T.muted }}>Total MRR</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.green }}>{peso(Math.round(mrr))}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: T.muted }}>Projected ARR</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{peso(Math.round(arr))}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: T.muted }}>Avg Revenue / Paid Client</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: T.text }}>
                      {paidCount > 0 ? peso(Math.round(mrr / paidCount)) : '—'}
                    </div>
                  </div>
                  {annualCount > 0 && (
                    <div style={{ marginLeft: 'auto' }}>
                      <div style={{ fontSize: 11, color: T.muted }}>Annual subscribers</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#16a34a' }}>
                        {annualCount} of {paidCount} 🎉
                      </div>
                      <div style={{ fontSize: 10, color: T.muted }}>saving 20% each</div>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* ── Recent Sign-Ups ── */}
            {recentSignups.length > 0 && (
              <Card style={{ marginBottom: 20 }}>
                <SectionHead>Recent Sign-Ups — Last 7 Days</SectionHead>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {recentSignups.map(u => {
                    const biz = (stats?.clients || []).find(c => c.ownerId === u.id);
                    return (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', background: '#fafafa', borderRadius: 8,
                        border: `1px solid ${T.border}` }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%',
                          background: T.accent + '18', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 15, fontWeight: 700, color: T.accent }}>
                          {(u.name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: T.text,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.name || u.email}
                          </div>
                          <div style={{ fontSize: 11, color: T.muted }}>
                            {u.email}
                            {biz ? ` · ${biz.tradeName}` : ''}
                            {' · '}{u.role}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: T.muted }}>{fmt(u.createdAt)}</div>
                          {biz && (
                            <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 3, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'capitalize',
                                background: (TIER_COLORS[biz.subscriptionTier || 'free']) + '18',
                                color: TIER_COLORS[biz.subscriptionTier || 'free'],
                                padding: '2px 8px', borderRadius: 10, display: 'inline-block' }}>
                                {biz.subscriptionTier || 'free'}
                              </span>
                              {biz.billingCycle === 'annual' && (
                                <span style={{ fontSize: 10, fontWeight: 600,
                                  background: '#f0fdf4', color: '#16a34a',
                                  padding: '2px 8px', borderRadius: 10, display: 'inline-block' }}>
                                  annual ✓
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* ── Churn Watch ── */}
            {churnRisk.length > 0 && (
              <Card style={{ marginBottom: 20, borderColor: T.orange + '40' }}>
                <SectionHead>⚠️ Churn Watch — Free Clients 14+ Days (Not Converted)</SectionHead>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {churnRisk.slice(0, 5).map(c => {
                    const owner = (stats?.users || []).find(u => u.id === c.ownerId);
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 14px', background: '#fffbf0', borderRadius: 8,
                        border: `1px solid ${T.orange}20` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: T.text }}>{c.tradeName}</div>
                          <div style={{ fontSize: 11, color: T.muted }}>
                            {owner?.email || '—'} · {c.txCount} txn{c.txCount !== 1 ? 's' : ''}
                            {' · '}joined {_daysAgo(c.createdAt)} days ago
                            {owner?.lastActive ? ` · active ${_timeAgo(owner.lastActive)}` : ' · never active'}
                            {c.subscriptionExpiresAt ? ` · expires ${fmt(c.subscriptionExpiresAt)}` : ''}
                          </div>
                        </div>
                        <button onClick={() => setTab('Clients')}
                          style={{ fontSize: 11, padding: '5px 13px', borderRadius: 6,
                            border: `1px solid ${T.orange}`, background: 'transparent',
                            color: T.orange, cursor: 'pointer', fontWeight: 600,
                            fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                          View →
                        </button>
                      </div>
                    );
                  })}
                  {churnRisk.length > 5 && (
                    <div style={{ fontSize: 12, color: T.muted, textAlign: 'center', paddingTop: 4 }}>
                      +{churnRisk.length - 5} more — see Clients tab
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* ── Alerts row ── */}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>
                Client Businesses ({stats?.totalClients ?? 0})
              </h2>
              <RestoreBackupButton onDone={loadStats} />
            </div>
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

        {/* ════════════ SECURITY ════════════ */}
        {tab === 'Security' && (
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 600 }}>🔒 Security — Login Attempts</h2>
            <p style={{ margin: '0 0 20px', color: T.muted, fontSize: 13 }}>
              All login attempts recorded since the last deployment. Failed = wrong password or unknown email.
            </p>

            {/* Filters */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {['failed','all','success'].map(f => (
                <button key={f} onClick={() => { setSecFilter(f); loadLoginAttempts(f); }}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    background: secFilter === f ? T.accent : T.border, color: secFilter === f ? '#fff' : T.text }}>
                  {f === 'failed' ? '❌ Failed only' : f === 'success' ? '✅ Successful only' : '📋 All'}
                </button>
              ))}
              <input placeholder="Filter by email…" value={secEmailFilter}
                onChange={e => setSecEmailFilter(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') loadLoginAttempts(undefined, e.target.value); }}
                style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, fontSize: 13, minWidth: 200 }} />
              <button onClick={() => loadLoginAttempts()}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13,
                  background: T.border, color: T.text }}>↻ Refresh</button>
            </div>

            {/* Summary cards — only for failed */}
            {secSummary && secFilter !== 'success' && (
              <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ background: T.surface, borderRadius: 12, padding: '14px 20px', border: `1px solid ${T.border}`, minWidth: 160 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', marginBottom: 4 }}>Total Failed</div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: secSummary.totalFailed > 10 ? '#ff3b30' : T.text }}>{secSummary.totalFailed}</div>
                </div>
                {secSummary.topIps?.length > 0 && (
                  <div style={{ background: T.surface, borderRadius: 12, padding: '14px 20px', border: `1px solid ${T.border}`, flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Top IPs (failed)</div>
                    {secSummary.topIps.map(({ ip, count }) => (
                      <div key={ip} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                        <span style={{ fontFamily: 'monospace', color: count > 5 ? '#ff3b30' : T.text }}>{ip}</span>
                        <span style={{ fontWeight: 600, color: count > 5 ? '#ff3b30' : T.muted }}>{count}×</span>
                      </div>
                    ))}
                  </div>
                )}
                {secSummary.topEmails?.length > 0 && (
                  <div style={{ background: T.surface, borderRadius: 12, padding: '14px 20px', border: `1px solid ${T.border}`, flex: 1, minWidth: 240 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: 'uppercase', marginBottom: 8 }}>Top Targets (failed)</div>
                    {secSummary.topEmails.map(({ email, count }) => (
                      <div key={email} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '2px 0' }}>
                        <span style={{ color: count > 5 ? '#ff3b30' : T.text }}>{email}</span>
                        <span style={{ fontWeight: 600, color: count > 5 ? '#ff3b30' : T.muted }}>{count}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Table */}
            {secLoad ? (
              <div style={{ color: T.muted }}>Loading…</div>
            ) : secAttempts.length === 0 ? (
              <div style={{ color: T.muted, textAlign: 'center', padding: 32 }}>No records found.</div>
            ) : (
              <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                      {['Time (UTC)', 'Email', 'IP Address', 'Role', 'Result'].map(h => (
                        <th key={h} style={{ textAlign: 'left', fontSize: 11, fontWeight: 700, color: T.muted,
                          textTransform: 'uppercase', letterSpacing: '0.5px', padding: '10px 14px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {secAttempts.map(a => (
                      <tr key={a.id} style={{ borderBottom: `1px solid ${T.border}20`,
                        background: !a.success ? '#fff5f5' : 'transparent' }}>
                        <td style={{ padding: '8px 14px', fontSize: 12, fontFamily: 'monospace', color: T.muted, whiteSpace: 'nowrap' }}>
                          {a.attempted_at?.replace('T', ' ').slice(0, 19)}
                        </td>
                        <td style={{ padding: '8px 14px', fontSize: 13 }}>{a.email}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, fontFamily: 'monospace', color: T.muted }}>{a.ip || '—'}</td>
                        <td style={{ padding: '8px 14px', fontSize: 12, color: T.muted }}>{a.role || '—'}</td>
                        <td style={{ padding: '8px 14px' }}>
                          <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                            background: a.success ? '#d1fae5' : '#fee2e2',
                            color:      a.success ? '#065f46' : '#991b1b' }}>
                            {a.success ? '✅ Success' : '❌ Failed'}
                          </span>
                        </td>
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

            {/* ── Database Backups ── */}
            <Card style={{ marginBottom: 24 }}>
              <SectionHead>🗄️ Database Backups</SectionHead>
              <p style={{ fontSize: 13, color: T.muted, margin: '0 0 14px' }}>
                Daily automatic backup at 2:00 AM PH time. Last 7 days kept on the Railway volume.
                Enable cloud backup by setting <code>BACKUP_S3_ENDPOINT</code>, <code>BACKUP_S3_BUCKET</code>,
                <code>BACKUP_S3_KEY</code>, <code>BACKUP_S3_SECRET</code> env vars (Cloudflare R2 or Backblaze B2).
              </p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
                <button onClick={triggerBackup} disabled={backupBusy}
                  style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: backupBusy ? 'not-allowed' : 'pointer',
                    background: T.accent, color: '#fff', fontWeight: 600, fontSize: 13, opacity: backupBusy ? 0.6 : 1 }}>
                  {backupBusy ? '⏳ Backing up…' : '⬇ Run Backup Now'}
                </button>
                {backupMsg && <span style={{ fontSize: 13, color: backupMsg.startsWith('✅') ? '#34c759' : '#ff3b30' }}>{backupMsg}</span>}
              </div>
              {backupList.length === 0 ? (
                <div style={{ fontSize: 13, color: T.muted }}>No backups yet — first backup runs tonight at 2 AM PH or click above.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      <th style={{ textAlign: 'left', padding: '5px 8px', color: T.muted, fontWeight: 600 }}>File</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px', color: T.muted, fontWeight: 600 }}>Size</th>
                      <th style={{ textAlign: 'right', padding: '5px 8px', color: T.muted, fontWeight: 600 }}>Created (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backupList.map(b => (
                      <tr key={b.fileName} style={{ borderBottom: `1px solid ${T.border}20` }}>
                        <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{b.fileName}</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: T.muted }}>{b.sizeMB} MB</td>
                        <td style={{ padding: '5px 8px', textAlign: 'right', color: T.muted }}>{b.createdAt?.slice(0, 19).replace('T', ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

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
                    { key: 'firm',         label: 'Firm',         color: '#34c759', desc: 'Up to 50 clients' },
                    { key: 'agency',       label: 'Agency',       color: '#af52de', desc: 'Up to 100 clients + white-label' },
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

              {/* Staff Sub-user Limits per Accountant Tier */}
              <Card style={{ gridColumn: '1 / -1' }}>
                <SectionHead>Staff Sub-user Limits per Accountant Tier</SectionHead>
                <div style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
                  Max number of staff logins an accountant can create. Set to 0 to disable staff for that tier.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
                  {[
                    { key: 'free',         label: 'Free',         color: '#6e6e73' },
                    { key: 'starter',      label: 'Starter',      color: '#5ac8fa' },
                    { key: 'solo',         label: 'Solo',         color: '#0071e3' },
                    { key: 'professional', label: 'Professional',  color: '#ff9500' },
                    { key: 'firm',         label: 'Firm',         color: '#34c759' },
                    { key: 'agency',       label: 'Agency',       color: '#af52de' },
                  ].map(({ key, label, color }) => (
                    <div key={key}>
                      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color, marginBottom: 6 }}>
                        {label}
                      </label>
                      <input style={{ ...inp, fontWeight: 600, fontSize: 15, marginBottom: 0 }}
                        type="number" min="0" max="999"
                        value={staffLimitForm[key]}
                        onChange={e => setStaffLimitForm(f => ({ ...f, [key]: e.target.value }))} />
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>staff</div>
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

              {/* EWT / ATC Rates */}
              <Card style={{ gridColumn: '1 / -1' }}>
                <SectionHead>EWT / ATC Rates (Withholding Tax)</SectionHead>
                <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
                  These rates appear in the client &amp; accountant Add Transaction dropdowns and are used to generate BIR Form 2307. Add, edit, or remove rows as BIR updates rates.
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: T.border }}>
                        {['ATC Code', 'Rate (%)', 'Description', ''].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: T.muted, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ewtRatesForm.map((row, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: '6px 8px' }}>
                            <input value={row.atc} placeholder="WC010"
                              onChange={e => setEwtRatesForm(f => f.map((r, j) => j === i ? { ...r, atc: e.target.value } : r))}
                              style={{ ...inp, marginBottom: 0, width: 90, fontFamily: 'monospace', fontSize: 13 }} />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <input value={String(Number(row.rate) * 100)} placeholder="1"
                                type="number" step="0.01" min="0" max="100"
                                onChange={e => setEwtRatesForm(f => f.map((r, j) => j === i ? { ...r, rate: String(Number(e.target.value) / 100) } : r))}
                                style={{ ...inp, marginBottom: 0, width: 70 }} />
                              <span style={{ color: T.muted, fontSize: 13 }}>%</span>
                            </div>
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input value={row.description} placeholder="Description shown in dropdown"
                              onChange={e => setEwtRatesForm(f => f.map((r, j) => j === i ? { ...r, description: e.target.value } : r))}
                              style={{ ...inp, marginBottom: 0, width: '100%', minWidth: 220 }} />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button onClick={() => setEwtRatesForm(f => f.filter((_, j) => j !== i))}
                              style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 16, padding: '2px 6px' }}
                              title="Remove row">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setEwtRatesForm(f => [...f, { atc: '', rate: '0.01', description: '' }])}
                  style={{ marginTop: 10, padding: '7px 16px', borderRadius: 8, border: `1px dashed ${T.border}`,
                    background: 'none', color: T.accent, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
                  + Add Rate
                </button>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>
                  Click <strong>Save All Settings</strong> below to apply changes.
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
                  { key: 'firm',         label: 'Firm',         color: '#34c759', clients: 'Up to 50 clients',          desc: 'All features + multi-user' },
                  { key: 'agency',       label: 'Agency',       color: '#af52de', clients: 'Up to 100 clients',        desc: 'Full branding & firm customization (+ Rolling Forecast & Comparative — Phase 2)' },
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
