import { call } from './api.mjs';
import { DatabaseSync } from 'node:sqlite';
const raw = new DatabaseSync(process.env.DB_PATH);
const s = await call('POST', '/auth/signup', { body: { email: 'uifirm@t.com', password: 'Test1234!', name: 'UI Firm', role: 'accountant' } });
raw.prepare("UPDATE users SET accountant_tier='firm', company='UI Firm' WHERE email='uifirm@t.com'").run();
const st = await call('POST', '/staff', { token: s.data.token, body: { name: 'Staff Ana', username: 'ana.ui', password: 'Staff123' } });
console.log('seeded', s.status, st.status);
