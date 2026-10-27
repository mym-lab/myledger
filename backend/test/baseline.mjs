import { call, db as DatabaseSync } from './api.mjs';
import { DatabaseSync as DS } from 'node:sqlite';
const DBP = process.env.DB_PATH;
const raw = new DS(DBP);
const tag = Date.now().toString(36);

const agency = await call('POST', '/auth/signup', { body: { email: `agency${tag}@t.com`, password: 'Test1234!', name: 'Agency', role: 'accountant' } });
const client = await call('POST', '/auth/signup', { body: { email: `biz${tag}@t.com`, password: 'Test1234!', name: 'Biz', role: 'client' } });
console.log('signup', agency.status, client.status);
raw.prepare("UPDATE users SET accountant_tier='agency' WHERE email=?").run(`agency${tag}@t.com`);
const AT = agency.data.token, CT = client.data.token;

const biz = await call('POST', '/clients', { token: CT, body: { tradeName: 'Biz Co', tin: '123-456-789-000', type: 'corporate' } });
console.log('create client', biz.status, biz.data?.error || '');
const cid = biz.data?.client?.id;
const asg = await call('PUT', `/clients/${cid}/assign-accountant`, { token: CT, body: { accountantEmail: `agency${tag}@t.com` } });
console.log('assign accountant', asg.status, asg.data?.message || asg.data?.error);

const st = await call('POST', '/staff', { token: AT, body: { name: 'Staff One', username: `staff${tag}`, email: `staff${tag}@t.com`, password: 'Staff123' } });
console.log('create staff', st.status, st.data?.error || '');
const sid = st.data?.staff?.id;
const sa = await call('PUT', `/staff/${sid}/assign`, { token: AT, body: { clientIds: [cid] } });
console.log('assign staff', sa.status, sa.data?.error || '');

const login = await call('POST', '/auth/login', { body: { email: `staff${tag}`, password: 'Staff123' } });
console.log('staff login', login.status, login.data?.user?.role);
const ST = login.data?.token;

const list = await call('GET', `/transactions?clientId=${cid}`, { token: ST });
console.log('STAFF GET transactions', list.status, list.data?.error || `ok (${(list.data?.transactions||[]).length} rows)`);
await call('POST', '/coa', { token: CT, body: { clientId: cid, code: '1000', name: 'Cash', category: 'Assets' } });
await call('POST', '/coa', { token: CT, body: { clientId: cid, code: '4000', name: 'Service Income', category: 'Income' } });
const coa = await call('GET', `/coa?clientId=${cid}`, { token: CT });
const accts = coa.data?.accounts || [];
const asset = accts.find(a => a.category === 'Assets')?.code, inc = accts.find(a => a.category === 'Income')?.code;
console.log('coa accounts', accts.length, asset, inc);
const je = await call('POST', '/journal-entries', { token: ST, body: { clientId: cid, date: '2026-10-27', description: 'Test', entries: [{account:asset,debit:100,credit:0},{account:inc,debit:0,credit:100}] } });
console.log('STAFF POST journal entry', je.status, je.data?.error || 'ok');
console.log('CLIENT_ID', cid, 'STAFF_TOKEN_OK', !!ST);
