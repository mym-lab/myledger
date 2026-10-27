import { call } from './api.mjs';
import { DatabaseSync } from 'node:sqlite';
const raw = new DatabaseSync(process.env.DB_PATH);
const t = 'f' + Date.now().toString(36);
const ok = (l, c, x = '') => console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? `  [${x}]` : ''));

// 1. Accountant signs up (free plan)
const s = await call('POST', '/auth/signup', { body: { email: `acc${t}@t.com`, password: 'Test1234!', name: 'Acc', role: 'accountant' } });
ok('1 accountant signs up', s.status === 201 || s.status === 200, s.data?.error || '');
const AT = s.data.token;
const mk = (body) => call('POST', '/clients/managed', { token: AT, body });
const body = { tradeName: 'Biz A', tin: '123-456-789-000', userId: `bizA${t}`, password: 'Temp1234' };
ok('2a free-plan accountant blocked from creating client login', (await mk(body)).status === 403);

// Upgrade to firm (what the plan purchase would do)
raw.prepare("UPDATE users SET accountant_tier='firm' WHERE id=?").run(s.data.user.id);
const c = await mk(body);
ok('2b after upgrade, client login created', c.status === 201, c.data?.error || '');
const clientId = c.data.client.id;

// 2c. client logs in with the temp password
const l = await call('POST', '/auth/login', { body: { email: `bizA${t}`, password: 'Temp1234' } });
ok('2c client logs in by User ID', l.status === 200 && l.data.user?.mustChangePassword === true, l.data?.error || '');
const CT = l.data.token;
const blocked = await call('GET', '/transactions?clientId=' + clientId, { token: CT });
ok('2d forced change blocks access until password changed', blocked.status === 403 && blocked.data.code === 'PASSWORD_CHANGE_REQUIRED');
const noConsent = await call('POST', '/auth/change-password', { token: CT, body: { currentPassword: 'Temp1234', newPassword: 'MyOwn123' } });
ok('2e change requires consent', noConsent.status === 400);
const chg = await call('POST', '/auth/change-password', { token: CT, body: { currentPassword: 'Temp1234', newPassword: 'MyOwn123', consent: true } });
ok('2f password changed with consent', chg.status === 200, chg.data?.error || '');
const books = await call('GET', '/clients/' + clientId, { token: CT });
ok('2g client can view its own business', books.status === 200);
const tx = await call('GET', '/transactions?clientId=' + clientId, { token: CT });
ok('2h client can view its books', tx.status === 200);
const other = await call('GET', '/clients', { token: CT });
ok('2i client sees only its own business', other.status === 200 && other.data.clients.length === 1, String(other.data?.clients?.length));

// 3. Accountant creates staff and assigns the client
const st = await call('POST', '/staff', { token: AT, body: { name: 'ana', username: 'ana' + t, password: 'Staff123' } });
const staffId = st.data.staff.id;
const asg = await call('PUT', `/staff/${staffId}/assign`, { token: AT, body: { clientIds: [clientId] } });
ok('3a accountant assigns client to staff', asg.status === 200, asg.data?.error || '');
const sl = await call('POST', '/auth/login', { body: { email: 'ana' + t, password: 'Staff123' } });
const stx = await call('GET', '/transactions?clientId=' + clientId, { token: sl.data.token });
ok('3b assigned staff can work on it', stx.status === 200);
const st2 = await call('POST', '/staff', { token: AT, body: { name: 'ben', username: 'ben' + t, password: 'Staff123' } });
const sl2 = await call('POST', '/auth/login', { body: { email: 'ben' + t, password: 'Staff123' } });
ok('3c unassigned staff cannot', (await call('GET', '/transactions?clientId=' + clientId, { token: sl2.data.token })).status === 404);
