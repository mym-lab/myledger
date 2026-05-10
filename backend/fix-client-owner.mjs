// ─── Fix Client Ownership ─────────────────────────────────────────────────────
// Reassigns a client's owner_id to match a user's actual UUID in the database.
// Run this when the migrated owner_id doesn't match the logged-in user's token.
//
// Usage:
//   node fix-client-owner.mjs                          → lists all clients + users
//   node fix-client-owner.mjs [clientTradeName] [userEmail]  → fixes ownership
//
// Example:
//   node fix-client-owner.mjs "Test2" "test@test.com"

import { db } from './db.js';

const tradeName = process.argv[2];
const userEmail = process.argv[3];

// ── Show current state ────────────────────────────────────────────────────────
const users   = db.prepare('SELECT id, email, role FROM users').all();
const clients = db.prepare('SELECT id, trade_name, owner_id FROM clients').all();

console.log('\n👤  USERS:');
users.forEach(u => console.log(`  ${u.id}  ${u.role.padEnd(12)} ${u.email}`));

console.log('\n🏢  CLIENTS:');
clients.forEach(c => {
  const owner = users.find(u => u.id === c.owner_id);
  const ownerLabel = owner ? owner.email : `⚠️  unknown (${c.owner_id})`;
  console.log(`  ${c.id}  "${c.trade_name}"  → owner: ${ownerLabel}`);
});

// ── Fix if args provided ──────────────────────────────────────────────────────
if (!tradeName || !userEmail) {
  console.log('\n💡  To fix: node fix-client-owner.mjs "TradeName" "user@email.com"\n');
  process.exit(0);
}

const user   = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
const client = clients.find(c => c.trade_name.toLowerCase() === tradeName.toLowerCase());

if (!user)   { console.error(`\n❌  User not found: ${userEmail}`);   process.exit(1); }
if (!client) { console.error(`\n❌  Client not found: "${tradeName}"`); process.exit(1); }

db.prepare('UPDATE clients SET owner_id = ? WHERE id = ?').run(user.id, client.id);

console.log(`\n✅  Fixed: "${client.trade_name}" → owner is now ${user.email} (${user.id})`);
console.log('   Restart the backend, then log in as this user — edit + save should work.\n');
