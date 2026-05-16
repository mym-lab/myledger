// ─── API Client ───────────────────────────────────────────────
const BASE = '/api';
const getToken = () => localStorage.getItem('ml_token');

async function request(method, path, body = null, auth = false) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (auth) headers['Authorization'] = `Bearer ${getToken()}`;
  const res  = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : null });
  const data = await res.json().catch(() => ({}));
  // Token expired or invalidated server-side → clear local session and throw
  // (No forced redirect here — App.jsx handles routing based on token validity)
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('ml_token');
    localStorage.removeItem('ml_user');
    throw new Error(data?.error || 'Authentication required. Please log in again.');
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const get  = (path, auth = false)        => request('GET',    path, null, auth);
const post = (path, body, auth = false)  => request('POST',   path, body, auth);
const put  = (path, body, auth = false)  => request('PUT',    path, body, auth);
const del  = (path, auth = false)        => request('DELETE', path, null, auth);

// ─── Auth ─────────────────────────────────────────────────────
export const signup         = (data)            => post('/auth/signup',          data);
export const login          = (data)            => post('/auth/login',           data);
export const forgotPassword = (email)           => post('/auth/forgot-password', { email });
export const resetPassword  = (token, password) => post('/auth/reset-password',  { token, password });

// ─── Clients (businesses) ─────────────────────────────────────
export const getClients        = ()           => get('/clients', true);
export const getClient         = (id)         => get(`/clients/${id}`, true);
export const createClient      = (data)       => post('/clients', data, true);
export const updateClient      = (id, data)   => put(`/clients/${id}`, data, true);
export const deleteClient      = (id)         => del(`/clients/${id}`, true);
export const backupClient      = (id)         => get(`/clients/${id}/backup`, true);
export const assignAccountant  = (id, email)  =>
  put(`/clients/${id}/assign-accountant`, { accountantEmail: email }, true);
export const assignEncoder     = (id, email)  =>
  put(`/clients/${id}/assign-encoder`,    { encoderEmail: email },    true);
export const removeEncoder     = (id, encId)  =>
  put(`/clients/${id}/remove-encoder`,    { encoderId: encId },       true);

// ─── Transactions ─────────────────────────────────────────────
export const getTransactions   = (clientId, from, to) => {
  let url = `/transactions?clientId=${clientId}`;
  if (from) url += `&from=${from}`;
  if (to)   url += `&to=${to}`;
  return get(url, true);
};
export const createTransaction = (data)       => post('/transactions', data, true);
export const voidTransaction   = (id, reason) => put(`/transactions/${id}/void`, { reason: reason || '' }, true);
// backward compat alias — routes to void (no hard deletes per CAS)
export const deleteTransaction = (id)         => put(`/transactions/${id}/void`, { reason: '' }, true);

// ─── Reports ──────────────────────────────────────────────────
export const getIncomeReport   = (clientId, from, to) => {
  let url = `/reports/income?clientId=${clientId}`;
  if (from) url += `&from=${from}`;
  if (to)   url += `&to=${to}`;
  return get(url, true);
};
export const getBalanceReport  = (clientId, asOf) => {
  let url = `/reports/balance?clientId=${clientId}`;
  if (asOf) url += `&asOf=${asOf}`;
  return get(url, true);
};
export const getCashFlowReport = (clientId, from, to) => {
  let url = `/reports/cashflow?clientId=${clientId}`;
  if (from) url += `&from=${from}`;
  if (to)   url += `&to=${to}`;
  return get(url, true);
};
export const getSLSP           = (clientId, year, quarter) =>
  get(`/reports/slsp?clientId=${clientId}&year=${year}&quarter=${quarter}`, true);

export const getBooksReport    = (clientId, type, from, to) => {
  let url = `/reports/books?clientId=${clientId}&type=${type}`;
  if (from) url += `&from=${from}`;
  if (to)   url += `&to=${to}`;
  return get(url, true);
};

export const getGeneralJournal = (clientId, from, to) => {
  let url = `/reports/general-journal?clientId=${clientId}`;
  if (from) url += `&from=${from}`;
  if (to)   url += `&to=${to}`;
  return get(url, true);
};

export const getGeneralLedger  = (clientId, from, to, account) => {
  let url = `/reports/general-ledger?clientId=${clientId}`;
  if (from)    url += `&from=${from}`;
  if (to)      url += `&to=${to}`;
  if (account) url += `&account=${encodeURIComponent(account)}`;
  return get(url, true);
};

// ─── Assets / Lapsing ─────────────────────────────────────────
export const getAssets    = (clientId)      => get(`/assets?clientId=${clientId}`, true);
export const createAsset  = (data)          => post('/assets', data, true);
export const updateAsset  = (id, data)      => put(`/assets/${id}`, data, true);
export const deleteAsset  = (id)            => del(`/assets/${id}`, true);
export const getLapsing   = (id)            => get(`/assets/${id}/lapsing`, true);

// ─── BIR ──────────────────────────────────────────────────────
export const getBirDeadlines   = (clientId)   => get(`/bir/deadlines?clientId=${clientId}`,   true);
export const getBirVatBalance  = (clientId)   => get(`/bir/vat-balance?clientId=${clientId}`, true);

// ─── Journal Entries ──────────────────────────────────────────
export const getJournalEntries  = (clientId)  => get(`/journal-entries?clientId=${clientId}`, true);
export const createJournalEntry = (data)      => post('/journal-entries', data, true);
export const deleteJournalEntry = (id)        => del(`/journal-entries/${id}`, true);

// ─── Upgrade Requests ─────────────────────────────────────────
export const createUpgradeRequest           = (data)         => post('/upgrade-requests', data, true);
export const createAccountantUpgradeRequest = (data)         => post('/upgrade-requests', { ...data, requestType: 'accountant' }, true);
export const getUpgradeRequests             = ()             => get('/upgrade-requests', true);
export const getMyUpgradeRequests           = ()             => get('/upgrade-requests', true);
export const approveUpgradeRequest          = (id)           => put(`/upgrade-requests/${id}/approve`, {}, true);
export const rejectUpgradeRequest           = (id, reason)   => put(`/upgrade-requests/${id}/reject`, { reason }, true);

// ─── Admin ────────────────────────────────────────────────────
export const getAdminStats     = ()           => get('/admin/stats');
export const getSettings       = ()           => get('/admin/settings');
export const updateSettings    = (data)       => put('/admin/settings', data);
export const setAccountantTier         = (userId, tier)           => put(`/admin/users/${userId}/set-tier`,     { tier });
export const setAccountantBranding     = (userId, firmName, accentColor) =>
  put(`/admin/users/${userId}/set-branding`, { firmName, accentColor });
export const setClientSubscriptionTier = (clientId, tier)         => put(`/admin/clients/${clientId}/set-tier`, { tier });
export const saveSmtpSettings          = (data)                   => put('/admin/smtp', data);

// ─── Notifications ─────────────────────────────────────────────
export const sendTestEmail      = (to)             => post('/notifications/test',           { to });
export const sendBIRReminders   = (daysAhead = 7)  => post('/notifications/send-reminders', { daysAhead });

// ─── Contacts (Vendors & Customers) ──────────────────────────
export const getContacts    = (clientId, q)   => {
  let url = `/contacts?clientId=${clientId}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  return get(url, true);
};
export const createContact  = (data)          => post('/contacts', data, true);
export const updateContact  = (id, data)      => put(`/contacts/${id}`, data, true);
export const deleteContact  = (id)            => del(`/contacts/${id}`, true);

// ─── Chart of Accounts ────────────────────────────────────────
export const getCOA         = (clientId)      => get(`/coa?clientId=${clientId}`, true);
export const seedCOA        = (clientId)      => post(`/coa/seed/${clientId}`, {}, true);
export const createAccount  = (data)          => post('/coa', data, true);
export const updateAccount  = (id, data)      => put(`/coa/${id}`, data, true);
export const deleteAccount  = (id)            => del(`/coa/${id}`, true);

// ─── Period Locks ─────────────────────────────────────────────
export const getPeriodLocks    = (clientId)   => get(`/periods?clientId=${clientId}`, true);
export const lockPeriod        = (clientId, period) => post('/periods/lock', { clientId, period }, true);
export const unlockPeriod      = (clientId, period) => post('/periods/unlock', { clientId, period }, true);

// ─── Audit Log ────────────────────────────────────────────────
export const getAuditLog       = (clientId, limit) => {
  let url = `/audit?clientId=${clientId}`;
  if (limit) url += `&limit=${limit}`;
  return get(url, true);
};

// ─── OCR — Receipt Scanning ───────────────────────────────────
export const scanReceipt = async (file) => {
  const formData = new FormData();
  formData.append('receipt', file);
  const res = await fetch('/api/ocr/receipt', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${getToken()}` },
    // No Content-Type header — browser sets it with the correct multipart boundary
    body:    formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'OCR failed');
  return data;
};

// ─── Invitations ─────────────────────────────────────────────
export const getInvite              = (token)    => get(`/invitations/${token}`);
export const getPendingInvite       = (clientId) => get(`/invitations/client/${clientId}`, true);
export const cancelPendingInvite    = (clientId) => del(`/invitations/client/${clientId}`, true);

// ─── Referrals ────────────────────────────────────────────────
export const getMyReferrals    = ()           => get('/referrals/me', true);
export const getAllReferrals    = ()           => get('/referrals/list', true);
export const creditReferral    = (id)         => post(`/referrals/credit/${id}`, {}, true);

// ─── Health ───────────────────────────────────────────────────
export const healthCheck       = ()           => get('/health');

// ─── CSV Downloads ────────────────────────────────────────────
export async function downloadCSV(path, filename) {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(BASE + path + sep + 'format=csv', {
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('ml_token');
    localStorage.removeItem('ml_user');
    throw new Error('Session expired. Please log in again.');
  }
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error || 'Download failed');
  }
  const blob = await res.blob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
