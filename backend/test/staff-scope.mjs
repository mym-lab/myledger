// Staff access to invoices, contacts, periods, assets, BIR, bills and recurring invoices.
import { call } from './api.mjs';
import { DatabaseSync } from 'node:sqlite';
const raw = new DatabaseSync(process.env.DB_PATH);
const t = 'ss' + Date.now().toString(36);
const ok = (l, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? `  [${x}]` : ''));

const s = await call('POST', '/auth/signup', { body: { email: `ss${t}@t.com`, password: 'Test1234!', name: 'SS', role: 'accountant' } });
const AT = s.data.token; const agencyId = s.data.user.id;
raw.prepare("UPDATE users SET accountant_tier='firm' WHERE id=?").run(agencyId);
const mk = async (n) => (await call('POST', '/clients/managed', { token: AT, body: { tradeName: 'Biz ' + n, tin: '5' + n, userId: `ss${n}${t}`, password: 'Temp1234' } })).data.client.id;
const A = await mk('A'), B = await mk('B');
const ana = (await call('POST', '/staff', { token: AT, body: { name: 'ana', username: 'ana' + t, password: 'Staff123' } })).data.staff.id;
const ben = (await call('POST', '/staff', { token: AT, body: { name: 'ben', username: 'ben' + t, password: 'Staff123' } })).data.staff.id;
await call('PUT', `/staff/${ana}/assign`, { token: AT, body: { clientIds: [A] } });
const AnaT = (await call('POST', '/auth/login', { body: { email: 'ana' + t, password: 'Staff123' } })).data.token;
const BenT = (await call('POST', '/auth/login', { body: { email: 'ben' + t, password: 'Staff123' } })).data.token;

const r = { ok: [], bad: [] };
const expect = async (label, p, status) => {
  const res = await p;
  ok(label, res.status === status, `got ${res.status}${res.data?.error ? ' ' + res.data.error : ''}`);
};

// Assigned staff: read and write on A
await expect('ana lists invoices for A', call('GET', `/invoices?client_id=${A}`, { token: AnaT }), 200);
await expect('ana creates a contact for A', call('POST', '/contacts', { token: AnaT, body: { clientId: A, name: 'Supplier X', type: 'supplier' } }), 201);
const contactRow = raw.prepare("SELECT user_id FROM contacts WHERE client_id=? AND name='Supplier X'").get(A);
ok('contact records the agency, not the staff id', contactRow?.user_id === agencyId, contactRow?.user_id || 'none');
await expect('ana lists periods for A', call('GET', `/periods?clientId=${A}`, { token: AnaT }), 200);
await expect('ana locks a period for A', call('POST', '/periods/lock', { token: AnaT, body: { clientId: A, period: '2026-01' } }), 200);
const lock = raw.prepare("SELECT locked_by FROM locked_periods WHERE client_id=? AND period='2026-01'").get(A);
ok('period lock records the agency', lock?.locked_by === agencyId, lock?.locked_by || 'none');
await expect('ana lists assets for A', call('GET', `/assets?clientId=${A}`, { token: AnaT }), 200);
await expect('ana lists BIR deadlines for A', call('GET', `/bir/deadlines?clientId=${A}`, { token: AnaT }), 200);
await expect('ana lists bills for A', call('GET', `/bills?clientId=${A}`, { token: AnaT }), 200);
await expect('ana lists recurring invoices for A', call('GET', `/recurring-invoices?clientId=${A}`, { token: AnaT }), 200);

// Not assigned: refused on A
await expect('ben cannot list invoices for A', call('GET', `/invoices?client_id=${A}`, { token: BenT }), 403);
await expect('ben cannot create a contact for A', call('POST', '/contacts', { token: BenT, body: { clientId: A, name: 'Nope' } }), 404);
await expect('ben cannot lock a period for A', call('POST', '/periods/lock', { token: BenT, body: { clientId: A, period: '2026-02' } }), 404);
await expect('ben cannot list assets for A', call('GET', `/assets?clientId=${A}`, { token: BenT }), 404);
await expect('ben cannot list bills for A', call('GET', `/bills?clientId=${A}`, { token: BenT }), 403);

// Agency still works on both
await expect('agency lists invoices for B', call('GET', `/invoices?client_id=${B}`, { token: AT }), 200);
