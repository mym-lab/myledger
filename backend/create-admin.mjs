// ─── One-time admin account creator ──────────────────────────────────────────
// Usage: node create-admin.mjs [email] [password] [name]
// Example: node create-admin.mjs admin@kaimanco.com admin123 Marty

import { db } from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const email    = process.argv[2] || 'admin@kaimanco.com';
const password = process.argv[3] || 'admin123';
const name     = process.argv[4] || 'Admin';

const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);

if (existing) {
  db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
  console.log(`✅ Updated existing user ${email} → role: admin`);
} else {
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, email, name, company, role, password_hash, accountant_tier, created_at)
    VALUES (?, ?, ?, ?, 'admin', ?, 'free', ?)
  `).run(uuid(), email, name, 'Kaiman & Co', hash, new Date().toISOString());
  console.log(`✅ Created admin account: ${email} / ${password}`);
}

console.log('→ Sign in at http://localhost:3000 — you will be routed to CommandCenter');
