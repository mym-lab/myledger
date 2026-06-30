// backend/init-db.js
// Run once: node init-db.js

import { db } from './db.js';

console.log('🔧 Creating payment + monitoring tables...\n');

try {
  // Create payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reference_number TEXT UNIQUE,
      created_at TEXT NOT NULL,
      paid_at TEXT
    );
  `);
  console.log('✅ payments table created');

  // Create user_activity table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      method TEXT,
      timestamp TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0
    );
  `);
  console.log('✅ user_activity table created');

  // Create subscriptions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL UNIQUE,
      plan TEXT DEFAULT 'Standard',
      amount REAL DEFAULT 599,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      status TEXT DEFAULT 'active'
    );
  `);
  console.log('✅ subscriptions table created');

  console.log('\n✅ All tables initialized!\n');
  process.exit(0);

} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
