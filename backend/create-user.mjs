// ─── Create any user directly in the database ─────────────────────────────────
// Usage: node create-user.mjs <email> <password> <name> <role> [company]
// Role:  client | accountant | encoder | admin
//
// Examples:
//   node create-user.mjs martm.mesjara@gmail.com marty123 Marty accountant "Kaiman & Co."
//   node create-user.mjs encoder@test.com enc123 "Jane Encoder" encoder
//   node create-user.mjs client2@test.com pass123 "Juan Client" client "Juan's Store"

import { db } from './db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuid } from 'uuid';

const [,, email, password, name, role = 'client', company = ''] = process.argv;

if (!email || !password || !name) {
  console.log('Usage: node create-user.mjs <email> <password> <name> <role> [company]');
  console.log('Role:  client | accountant | encoder | admin');
  process.exit(1);
}

const validRoles = ['client', 'accountant', 'encoder', 'admin'];
if (!validRoles.includes(role)) {
  console.error(`❌ Invalid role "${role}". Must be one of: ${validRoles.join(', ')}`);
  process.exit(1);
}

const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);

if (existing) {
  // Update role if it changed
  if (existing.role !== role) {
    db.prepare('UPDATE users SET role = ?, accountant_tier = ? WHERE email = ?')
      .run(role, role === 'accountant' ? 'free' : '', email);
    console.log(`✅ Updated ${email}: role changed to "${role}"`);
  } else {
    console.log(`ℹ️  User ${email} already exists with role "${role}" — no changes made.`);
  }
} else {
  const hash = bcrypt.hashSync(password, 10);
  const id   = uuid();
  db.prepare(`
    INSERT INTO users (id, email, name, company, role, password_hash, accountant_tier, firm_name, accent_color, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, null, null, ?)
  `).run(id, email, name, company, role, hash, role === 'accountant' ? 'free' : '', new Date().toISOString());

  console.log(`✅ Created ${role} account:`);
  console.log(`   Email:    ${email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Name:     ${name}`);
  console.log(`   Role:     ${role}`);
}

console.log('\n→ You can now assign this user in the app or log in at http://localhost:3000\n');
