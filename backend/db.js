// ─── Database (node:sqlite — built into Node 22.5+ / Node 24) ────────────────
// Admin seed: if ADMIN_EMAIL + ADMIN_PASSWORD env vars are set and no admin
// exists yet, one is created automatically on first startup.
// Uses the SQLite module that ships with Node.js itself — no npm install,
// no native compilation, no Visual Studio required.
// Synchronous API identical to better-sqlite3 in all routes.

import { DatabaseSync } from 'node:sqlite';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
// In production (Railway), set DB_PATH=/data/myledger.db with a mounted volume.
// Locally it stays next to the backend folder.
const DB_PATH   = process.env.DB_PATH || join(__dirname, 'myledger.db');

// Ensure the directory exists (required when Railway mounts a volume at /data)
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// ── Performance & safety pragmas ──────────────────────────────────────────────
db.exec('PRAGMA journal_mode = WAL;');    // concurrent reads, serialised writes
db.exec('PRAGMA foreign_keys = ON;');     // enforce referential integrity
db.exec('PRAGMA synchronous = NORMAL;');  // safe + fast (WAL default)
db.exec('PRAGMA cache_size = -32000;');   // 32 MB page cache
db.exec('PRAGMA temp_store = MEMORY;');   // temp tables in RAM

// ── Schema creation ───────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT UNIQUE NOT NULL,
  name            TEXT,
  company         TEXT,
  role            TEXT NOT NULL DEFAULT 'client',
  password_hash   TEXT NOT NULL,
  accountant_tier TEXT NOT NULL DEFAULT 'free',
  firm_name       TEXT,
  accent_color    TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id                TEXT PRIMARY KEY,
  owner_id          TEXT NOT NULL,
  accountant_id     TEXT,
  encoder_ids       TEXT NOT NULL DEFAULT '[]',
  trade_name        TEXT NOT NULL,
  tin               TEXT,
  address           TEXT,
  business_type     TEXT,
  type              TEXT,
  tax_regime        TEXT NOT NULL DEFAULT 'vat',
  opt_rate          REAL NOT NULL DEFAULT 0.03,
  birthday          TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  tax_types         TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id                   TEXT PRIMARY KEY,
  client_id            TEXT NOT NULL,
  user_id              TEXT NOT NULL,
  type                 TEXT NOT NULL,
  description          TEXT,
  category             TEXT,
  account              TEXT,
  vat_type             TEXT,
  supplier_vat_type    TEXT,
  settlement           TEXT DEFAULT 'cash',
  settlement_account   TEXT,
  counterparty_name    TEXT,
  counterparty_tin     TEXT,
  counterparty_address TEXT,
  reference_no         TEXT,
  notes                TEXT,
  amount_net           REAL NOT NULL DEFAULT 0,
  amount_vat           REAL NOT NULL DEFAULT 0,
  amount_gross         REAL NOT NULL DEFAULT 0,
  percentage_tax       REAL NOT NULL DEFAULT 0,
  ewt_rate             REAL NOT NULL DEFAULT 0,
  ewt_amount           REAL NOT NULL DEFAULT 0,
  voided_at            TEXT,
  voided_by            TEXT,
  void_reason          TEXT,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_client  ON transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

CREATE TABLE IF NOT EXISTS journal_entries (
  id           TEXT PRIMARY KEY,
  client_id    TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  date         TEXT NOT NULL,
  description  TEXT,
  reference_no TEXT,
  entries      TEXT NOT NULL DEFAULT '[]',
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_je_client ON journal_entries(client_id);

CREATE TABLE IF NOT EXISTS upgrade_requests (
  id              TEXT PRIMARY KEY,
  client_id       TEXT,
  user_id         TEXT,
  target_tier     TEXT,
  method          TEXT,
  ref_no          TEXT,
  amount          REAL,
  status          TEXT NOT NULL DEFAULT 'pending',
  rejected_reason TEXT,
  resolved_at     TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id                 TEXT PRIMARY KEY,
  client_id          TEXT NOT NULL,
  name               TEXT NOT NULL,
  category           TEXT,
  cost               REAL NOT NULL DEFAULT 0,
  salvage_value      REAL NOT NULL DEFAULT 0,
  useful_life_months INTEGER NOT NULL DEFAULT 60,
  start_date         TEXT,
  status             TEXT NOT NULL DEFAULT 'active',
  created_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_client ON assets(client_id);

CREATE TABLE IF NOT EXISTS contacts (
  id         TEXT PRIMARY KEY,
  client_id  TEXT NOT NULL,
  user_id    TEXT,
  name       TEXT NOT NULL,
  type       TEXT,
  tin        TEXT,
  address    TEXT,
  phone      TEXT,
  email      TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);

CREATE TABLE IF NOT EXISTS coa (
  id             TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  code           TEXT NOT NULL,
  name           TEXT NOT NULL,
  category       TEXT,
  type           TEXT NOT NULL DEFAULT 'custom',
  normal_balance TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_coa_client ON coa(client_id);

CREATE TABLE IF NOT EXISTS locked_periods (
  id        TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  period    TEXT NOT NULL,
  locked_by TEXT,
  locked_at TEXT NOT NULL,
  UNIQUE(client_id, period)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id        TEXT PRIMARY KEY,
  client_id TEXT,
  user_id   TEXT,
  action    TEXT,
  entity    TEXT,
  entity_id TEXT,
  detail    TEXT,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_log(client_id);
CREATE INDEX IF NOT EXISTS idx_audit_time   ON audit_log(timestamp);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invitations (
  id         TEXT PRIMARY KEY,
  token      TEXT UNIQUE NOT NULL,
  client_id  TEXT NOT NULL,
  email      TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inv_token  ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_inv_client ON invitations(client_id);
`);

// ── Column migrations — add columns that were missing in earlier versions ──────
try { db.exec("ALTER TABLE clients ADD COLUMN tax_types TEXT NOT NULL DEFAULT '[]'"); }
catch (_) { /* column already exists — safe to ignore */ }

// ── Default settings bootstrap ────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  pricing: { starter: 399, professional: 699, enterprise: 999 },
  accountantPricing: { pro: 2499, agency: 5999 },
  payment: {
    maya:  { name: 'Kaiman & Co.', number: '09989919660' },
    gcash: { name: 'Kaiman & Co.', number: '09989919660' },
  },
  contactEmail: 'mym@kaimanco.com',
  smtp: {
    host: '', port: 587, secure: false,
    user: '', pass: '',
    fromName: 'MyLedger', fromEmail: '', enabled: false,
  },
};

const initSetting = db.prepare(
  `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`
);
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  initSetting.run(k, JSON.stringify(v));
}

// ── Settings helpers ──────────────────────────────────────────────────────────
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : null;
}

export function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value));
}

export function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  return Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]));
}

// ── Transaction helper (node:sqlite has no db.transaction()) ─────────────────
export function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ── Row helpers — convert snake_case DB rows to camelCase JS objects ──────────
export function rowToUser(r) {
  if (!r) return null;
  return {
    id: r.id, email: r.email, name: r.name, company: r.company,
    role: r.role, passwordHash: r.password_hash,
    accountantTier: r.accountant_tier,
    firmName: r.firm_name, accentColor: r.accent_color,
    createdAt: r.created_at,
  };
}

export function rowToClient(r) {
  if (!r) return null;
  return {
    id: r.id, ownerId: r.owner_id, accountantId: r.accountant_id,
    encoderIds:   JSON.parse(r.encoder_ids || '[]'),
    taxTypes:     JSON.parse(r.tax_types   || '[]'),
    tradeName: r.trade_name, tin: r.tin, address: r.address,
    businessType: r.business_type, type: r.type,
    taxRegime: r.tax_regime, optRate: r.opt_rate,
    birthday: r.birthday, ownerBirthdate: r.birthday, subscriptionTier: r.subscription_tier,
    createdAt: r.created_at,
  };
}

export function rowToTx(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, userId: r.user_id,
    type: r.type, description: r.description,
    category: r.category, account: r.account,
    vatType: r.vat_type, supplierVatType: r.supplier_vat_type,
    settlement: r.settlement, settlementAccount: r.settlement_account,
    counterpartyName: r.counterparty_name,
    counterpartyTin: r.counterparty_tin,
    counterpartyAddress: r.counterparty_address,
    referenceNo: r.reference_no, notes: r.notes,
    amount_net: r.amount_net, amount_vat: r.amount_vat, amount_gross: r.amount_gross,
    percentageTax: r.percentage_tax,
    ewtRate: r.ewt_rate, ewtAmount: r.ewt_amount,
    voidedAt: r.voided_at, voidedBy: r.voided_by, voidReason: r.void_reason,
    createdAt: r.created_at,
  };
}

export function rowToJE(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, userId: r.user_id,
    date: r.date, description: r.description, referenceNo: r.reference_no,
    entries: JSON.parse(r.entries || '[]'),
    createdAt: r.created_at,
  };
}

export function rowToAsset(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, name: r.name, category: r.category,
    cost: r.cost, salvageValue: r.salvage_value,
    usefulLifeMonths: r.useful_life_months,
    startDate: r.start_date, status: r.status, createdAt: r.created_at,
  };
}

export function rowToContact(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, userId: r.user_id,
    name: r.name, type: r.type, tin: r.tin, address: r.address,
    phone: r.phone, email: r.email, notes: r.notes, createdAt: r.created_at,
  };
}

export function rowToCOA(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, code: r.code, name: r.name,
    category: r.category, type: r.type, normalBalance: r.normal_balance,
    createdAt: r.created_at,
  };
}

export function rowToAudit(r) {
  if (!r) return null;
  return {
    id: r.id, clientId: r.client_id, userId: r.user_id,
    action: r.action, entity: r.entity, entityId: r.entity_id,
    detail: r.detail, timestamp: r.timestamp,
  };
}

// ── Admin seed — runs once on startup if env vars are set ─────────────────────
(function seedAdmin() {
  const email    = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) {
    console.log('ℹ️  Admin account already exists — seed skipped.');
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`
    INSERT INTO users (id, email, name, company, role, password_hash, accountant_tier, created_at)
    VALUES (?, ?, 'Admin', 'Kaiman & Co.', 'admin', ?, 'free', ?)
  `).run(uuidv4(), email, hash, new Date().toISOString());

  console.log(`✅  Admin account created: ${email}`);
})();
