import { call } from './api.mjs';
import { DatabaseSync } from 'node:sqlite';
const raw = new DatabaseSync(process.env.DB_PATH);
const tag = 'b' + Date.now().toString(36);
const ok = (label, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + label);

const agency = await call('POST', '/auth/signup', { body: { email: `ag${tag}@t.com`, password: 'Test1234!', name: 'Ag', role: 'accountant' } });
raw.prepare("UPDATE users SET accountant_tier='agency' WHERE email=?").run(`ag${tag}@t.com`);
const AT = agency.data.token;

async function mkClient(name) {
  const c = await call('POST', '/auth/signup', { body: { email: `${name}${tag}@t.com`, password: 'Test1234!', name, role: 'client' } });
  const b = await call('POST', '/clients', { token: c.data.token, body: { tradeName: name + ' Co', tin: '111-222-333-000', type: 'corporate' } });
  await call('PUT', `/clients/${b.data.client.id}/assign-accountant`, { token: c.data.token, body: { accountantEmail: `ag${tag}@t.com` } });
  return { token: c.data.token, cid: b.data.client.id };
}
const A = await mkClient('alpha'), B = await mkClient('beta');
const st = await call('POST', '/staff', { token: AT, body: { name: 'Staff', username: `st${tag}`, password: 'Staff123' } });
await call('PUT', `/staff/${st.data.staff.id}/assign`, { token: AT, body: { clientIds: [A.cid] } });
const ST = (await call('POST', '/auth/login', { body: { email: `st${tag}`, password: 'Staff123' } })).data.token;

ok('assigned client readable by staff', (await call('GET', `/transactions?clientId=${A.cid}`, { token: ST })).status === 200);
ok('unassigned client NOT readable by staff', (await call('GET', `/transactions?clientId=${B.cid}`, { token: ST })).status === 404);
ok('unassigned client: reports blocked', (await call('GET', `/reports/income?clientId=${B.cid}`, { token: ST })).status !== 200);
const list = await call('GET', '/clients', { token: ST });
ok('staff client list shows only assigned client', list.data.clients?.length === 1 && list.data.clients[0].id === A.cid);

// Agency's accountant access removed (what happens after the 30-day lapse)
raw.prepare('UPDATE clients SET accountant_id = NULL WHERE id = ?').run(A.cid);
ok('after agency removed: staff loses client', (await call('GET', `/transactions?clientId=${A.cid}`, { token: ST })).status === 404);
ok('after agency removed: client owner keeps access', (await call('GET', `/transactions?clientId=${A.cid}`, { token: A.token })).status === 200);
const list2 = await call('GET', '/clients', { token: ST });
ok('after agency removed: staff list empty', (list2.data.clients || []).length === 0);
