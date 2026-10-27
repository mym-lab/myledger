import { call } from './api.mjs';
import { DatabaseSync } from 'node:sqlite';
const raw = new DatabaseSync(process.env.DB_PATH);
const tag = 's' + Date.now().toString(36);
const ok = (l, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? `  [${x}]` : ''));

const ag = await call('POST', '/auth/signup', { body: { email: `ag${tag}@t.com`, password: 'Test1234!', name: 'Ag', role: 'accountant' } });
raw.prepare("UPDATE users SET accountant_tier='agency', company='Firm A' WHERE email=?").run(`ag${tag}@t.com`);
const AT = ag.data.token;
const mkStaff = async (n) => (await call('POST', '/staff', { token: AT, body: { name: n, username: `${n}${tag}`, password: 'Staff123' } })).data.staff;
const sA = await mkStaff('alice'), sB = await mkStaff('bob');
const login = async (u) => (await call('POST', '/auth/login', { body: { email: u, password: 'Staff123' } })).data.token;
const AliceT = await login(`alice${tag}`), BobT = await login(`bob${tag}`);

// Staff creates a client for the agency
const r1 = await call('POST', '/clients/managed', { token: AliceT, body: { tradeName: 'Client One', tin: '111-000-111-000', userId: `c1${tag}`, password: 'Temp1234' } });
ok('staff creates managed client', r1.status === 201, r1.data?.error || '');
const c1 = r1.data?.client?.id;
ok('creator staff auto-assigned', (r1.data?.assignedStaffIds || []).includes(sA.id) && r1.data.assignedStaffIds.length === 1);
ok('creating staff can work on it', (await call('GET', `/transactions?clientId=${c1}`, { token: AliceT })).status === 200);
ok('other staff cannot see it', (await call('GET', `/transactions?clientId=${c1}`, { token: BobT })).status === 404);
ok('agency is the accountant of it', r1.data?.client?.accountantId === ag.data.user.id);
const audit = raw.prepare("SELECT staff_id FROM audit_log WHERE client_id=? AND action='CREATE_MANAGED_CLIENT'").get(c1);
ok('audit records the staff member', audit?.staff_id === sA.id, audit?.staff_id || 'none');

// Agency creates a client and assigns Bob
const r2 = await call('POST', '/clients/managed', { token: AT, body: { tradeName: 'Client Two', tin: '222-000-111-000', userId: `c2${tag}`, password: 'Temp1234', staffIds: [sB.id] } });
ok('agency creates client assigned to bob', r2.status === 201 && r2.data.assignedStaffIds.length === 1, r2.data?.error || '');
const c2 = r2.data?.client?.id;
ok('bob can work on it', (await call('GET', `/transactions?clientId=${c2}`, { token: BobT })).status === 200);
ok('alice cannot see it', (await call('GET', `/transactions?clientId=${c2}`, { token: AliceT })).status === 404);

// Staff from another firm cannot be assigned
const ag2 = await call('POST', '/auth/signup', { body: { email: `ag2${tag}@t.com`, password: 'Test1234!', name: 'Ag2', role: 'accountant' } });
raw.prepare("UPDATE users SET accountant_tier='agency' WHERE email=?").run(`ag2${tag}@t.com`);
const st2 = (await call('POST', '/staff', { token: ag2.data.token, body: { name: 'zed', username: `zed${tag}`, password: 'Staff123' } })).data.staff;
const r3 = await call('POST', '/clients/managed', { token: AT, body: { tradeName: 'X', tin: '3', userId: `c3${tag}`, password: 'Temp1234', staffIds: [st2.id] } });
ok('cannot assign staff of another firm', r3.status === 400);

// A firm on a lower plan cannot create managed clients, even through its staff
const ag3 = await call('POST', '/auth/signup', { body: { email: `ag3${tag}@t.com`, password: 'Test1234!', name: 'Ag3', role: 'accountant' } });
raw.prepare("UPDATE users SET accountant_tier='solo' WHERE email=?").run(`ag3${tag}@t.com`);
const s3 = (await call('POST', '/staff', { token: ag3.data.token, body: { name: 'yan', username: `yan${tag}`, password: 'Staff123' } })).data;
const s3T = await login(`yan${tag}`);
const r4 = await call('POST', '/clients/managed', { token: s3T, body: { tradeName: 'Y', tin: '4', userId: `c4${tag}`, password: 'Temp1234' } });
ok('solo-plan firm staff blocked', r4.status === 403, r4.data?.error || '');
