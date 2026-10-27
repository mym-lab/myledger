import { call } from './api.mjs';
import { DatabaseSync } from 'node:sqlite';
import bcrypt from '/home/claude/myledger/backend/node_modules/bcryptjs/index.js';
const DBP = process.env.DB_PATH;
const raw = new DatabaseSync(DBP);
const tag = 'm' + Date.now().toString(36);
const ok = (label, cond, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  [' + extra + ']' : ''));

// Agency on Agency plan
const ag = await call('POST', '/auth/signup', { body: { email: `ag${tag}@t.com`, password: 'Test1234!', name: 'Agency Co', role: 'accountant' } });
raw.prepare("UPDATE users SET accountant_tier='agency', company='Agency Co' WHERE email=?").run(`ag${tag}@t.com`);
const AT = ag.data.token; const agencyId = ag.data.user.id;

// Agency creates a managed client
const mk = await call('POST', '/clients/managed', { token: AT, body: { tradeName: 'Juan Sari-Sari', tin: '555-666-777-000', userId: `juan.${tag}`, password: 'Temp1234', name: 'Juan' } });
ok('agency creates managed client', mk.status === 201, mk.data?.error || '');
const cid = mk.data?.client?.id;
ok('managed client assigned to agency as accountant', mk.data?.client?.accountantId === agencyId);

// Duplicate User ID rejected
const dup = await call('POST', '/clients/managed', { token: AT, body: { tradeName: 'X', tin: '1', userId: `juan.${tag}`, password: 'Temp1234' } });
ok('duplicate User ID rejected', dup.status === 409);

// Client logs in with User ID + temp password, must change password
const lg = await call('POST', '/auth/login', { body: { email: `juan.${tag}`, password: 'Temp1234' } });
ok('client logs in with User ID', lg.status === 200 && lg.data?.user?.mustChangePassword === true, lg.data?.error || '');
const JT = lg.data?.token;
const blocked = await call('GET', `/transactions?clientId=${cid}`, { token: JT });
ok('before password change: app blocked', blocked.status === 403 && blocked.data?.code === 'PASSWORD_CHANGE_REQUIRED');
const noConsent = await call('POST', '/auth/change-password', { token: JT, body: { currentPassword: 'Temp1234', newPassword: 'MyNew1234' } });
ok('change without consent rejected', noConsent.status === 400);
const wrong = await call('POST', '/auth/change-password', { token: JT, body: { currentPassword: 'nope', newPassword: 'MyNew1234', consent: true } });
ok('wrong current password rejected', wrong.status === 401);
const chg = await call('POST', '/auth/change-password', { token: JT, body: { currentPassword: 'Temp1234', newPassword: 'MyNew1234', consent: true } });
ok('password changed with consent', chg.status === 200);
const after = await call('GET', `/transactions?clientId=${cid}`, { token: JT });
ok('after change: client sees own books', after.status === 200);
ok('consent recorded', !!raw.prepare('SELECT consent_at FROM users WHERE username=?').get(`juan.${tag}`).consent_at);
const relog = await call('POST', '/auth/login', { body: { email: `juan.${tag}`, password: 'MyNew1234' } });
ok('client logs in with new password', relog.status === 200 && relog.data?.user?.mustChangePassword === false);

// Agency can view the books with its own login
const agView = await call('GET', `/transactions?clientId=${cid}`, { token: AT });
ok('agency views managed client books', agView.status === 200);

// Coverage: managed client can add another business while agency plan covers it
const second = await call('POST', '/clients', { token: JT, body: { tradeName: 'Second Biz', tin: '999-888-777-000' } });
ok('covered client can create a 2nd business (agency limit)', second.status === 201, second.data?.error || '');

// Staff assigned to the managed client
const st = await call('POST', '/staff', { token: AT, body: { name: 'Staff', username: `st${tag}`, password: 'Staff123' } });
await call('PUT', `/staff/${st.data.staff.id}/assign`, { token: AT, body: { clientIds: [cid] } });
const SLG = await call('POST', '/auth/login', { body: { email: `st${tag}`, password: 'Staff123' } });
ok('assigned staff reads managed client books', (await call('GET', `/transactions?clientId=${cid}`, { token: SLG.data.token })).status === 200);

// Admin marks plan unpaid
const adm = `adm${tag}@t.com`;
const pw = await bcrypt.hash('Admin1234', 10);
raw.prepare("INSERT INTO users (id,email,name,role,password_hash,accountant_tier,created_at) VALUES (?,?,?,?,?,?,?)").run('adm-' + tag, adm, 'Admin', 'admin', pw, 'free', new Date().toISOString());
const AD = (await call('POST', '/auth/login', { body: { email: adm, password: 'Admin1234' } })).data.token;
const lapse = await call('PUT', `/admin/users/${agencyId}/plan-lapse`, { token: AD, body: { lapsed: true } });
ok('admin marks plan unpaid', lapse.status === 200, lapse.data?.error || '');
const row = raw.prepare('SELECT plan_lapsed_at, lapse_stage FROM users WHERE id=?').get(agencyId);
ok('grace started (stage 0)', !!row.plan_lapsed_at && row.lapse_stage === 0);

// Run the hourly lapse check with a stub mailer at different times
const { runPlanLapseCheck } = await import('/home/claude/myledger/backend/lib/plan-lapse.js');
const sent = []; const stub = async m => { sent.push(m.subject); return { sent: true }; };
const DAY = 86400000, t0 = Date.parse(row.plan_lapsed_at);
let r = await runPlanLapseCheck({ now: t0 + 1000, send: stub });
ok('day 0 reminder sent', r.some(x => x.action === 'reminder' && x.stage === 1), JSON.stringify(r));
r = await runPlanLapseCheck({ now: t0 + 1000, send: stub });
ok('day 0 run again: no duplicate', r.length === 0);
r = await runPlanLapseCheck({ now: t0 + 16 * DAY, send: stub });
ok('day 16 reminder (stage 2)', r.some(x => x.stage === 2));
r = await runPlanLapseCheck({ now: t0 + 26 * DAY, send: stub });
ok('day 26 reminder (stage 3)', r.some(x => x.stage === 3));
ok('reminder emails attempted', sent.length >= 3, `${sent.length} emails`);
ok('still has access during grace (day 26)', (await call('GET', `/transactions?clientId=${cid}`, { token: AT })).status === 200);

r = await runPlanLapseCheck({ now: t0 + 31 * DAY, send: stub });
ok('day 31 enforcement', r.some(x => x.action === 'enforced'), JSON.stringify(r));
const acc = raw.prepare('SELECT accountant_id FROM clients WHERE id=?').get(cid);
ok('agency link removed from managed client', acc.accountant_id === null);
ok('agency now blocked from client books', (await call('GET', `/transactions?clientId=${cid}`, { token: AT })).status === 404);
ok('staff loses managed client', (await call('GET', `/transactions?clientId=${cid}`, { token: SLG.data.token })).status === 404);
ok('client keeps own books', (await call('GET', `/transactions?clientId=${cid}`, { token: JT })).status === 200);
ok('client keeps own login', (await call('POST', '/auth/login', { body: { email: `juan.${tag}`, password: 'MyNew1234' } })).status === 200);
ok('coverage ended: 2nd business now blocked (free plan)', (await call('POST', '/clients', { token: JT, body: { tradeName: 'Third', tin: '000-111-222-000' } })).status === 403);
ok('agency tier now free', raw.prepare('SELECT accountant_tier FROM users WHERE id=?').get(agencyId).accountant_tier === 'free');
