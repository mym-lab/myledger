#!/usr/bin/env node
// ─── migrate-from-lowdb.js ───────────────────────────────────────────────────
// One-shot migration: reads myledger.json (lowdb) → inserts into myledger.db
//
// Usage: node migrate-from-lowdb.js [path-to-myledger.json]
//
// Run ONCE before switching to the new SQLite backend.
// Safe to re-run — uses INSERT OR IGNORE so it won't duplicate rows.

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { db, withTransaction } from './db.js';   // Opens myledger.db and creates all tables

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Locate source JSON ────────────────────────────────────────────────────────
const jsonPath = process.argv[2] || join(__dirname, 'myledger.json');

if (!existsSync(jsonPath)) {
  console.error(`❌ File not found: ${jsonPath}`);
  console.error('   Usage: node migrate-from-lowdb.js [path-to-myledger.json]');
  process.exit(1);
}

console.log(`\n📂 Reading: ${jsonPath}`);
const raw  = readFileSync(jsonPath, 'utf-8');
const data = JSON.parse(raw);

// ── Counters ──────────────────────────────────────────────────────────────────
const counts = {};
const skip   = {};

function count(table, n = 1)     { counts[table] = (counts[table] || 0) + n; }
function skipped(table, n = 1)   { skip[table]   = (skip[table]   || 0) + n; }

// ── Prepared statements ───────────────────────────────────────────────────────
const stmts = {
  user: db.prepare(`INSERT OR IGNORE INTO users
    (id, email, name, company, role, password_hash, accountant_tier, firm_name, accent_color, created_at)
    VALUES (@id, @email, @name, @company, @role, @password_hash, @accountant_tier, @firm_name, @accent_color, @created_at)`),

  client: db.prepare(`INSERT OR IGNORE INTO clients
    (id, owner_id, accountant_id, encoder_ids, trade_name, tin, address,
     business_type, type, tax_regime, opt_rate, birthday, subscription_tier, tax_types, created_at)
    VALUES
    (@id, @owner_id, @accountant_id, @encoder_ids, @trade_name, @tin, @address,
     @business_type, @type, @tax_regime, @opt_rate, @birthday, @subscription_tier, @tax_types, @created_at)`),

  transaction: db.prepare(`INSERT OR IGNORE INTO transactions
    (id, client_id, user_id, type, description, category, account,
     vat_type, supplier_vat_type, settlement, settlement_account,
     counterparty_name, counterparty_tin, counterparty_address,
     reference_no, notes,
     amount_net, amount_vat, amount_gross, percentage_tax,
     ewt_rate, ewt_amount,
     voided_at, voided_by, void_reason, created_at)
    VALUES
    (@id, @client_id, @user_id, @type, @description, @category, @account,
     @vat_type, @supplier_vat_type, @settlement, @settlement_account,
     @counterparty_name, @counterparty_tin, @counterparty_address,
     @reference_no, @notes,
     @amount_net, @amount_vat, @amount_gross, @percentage_tax,
     @ewt_rate, @ewt_amount,
     @voided_at, @voided_by, @void_reason, @created_at)`),

  je: db.prepare(`INSERT OR IGNORE INTO journal_entries
    (id, client_id, user_id, date, description, reference_no, entries, created_at)
    VALUES (@id, @client_id, @user_id, @date, @description, @reference_no, @entries, @created_at)`),

  asset: db.prepare(`INSERT OR IGNORE INTO assets
    (id, client_id, name, category, cost, salvage_value, useful_life_months, start_date, status, created_at)
    VALUES (@id, @client_id, @name, @category, @cost, @salvage_value, @useful_life_months, @start_date, @status, @created_at)`),

  contact: db.prepare(`INSERT OR IGNORE INTO contacts
    (id, client_id, user_id, name, type, tin, address, phone, email, notes, created_at)
    VALUES (@id, @client_id, @user_id, @name, @type, @tin, @address, @phone, @email, @notes, @created_at)`),

  coa: db.prepare(`INSERT OR IGNORE INTO coa
    (id, client_id, code, name, category, type, normal_balance, created_at)
    VALUES (@id, @client_id, @code, @name, @category, @type, @normal_balance, @created_at)`),

  period: db.prepare(`INSERT OR IGNORE INTO locked_periods
    (id, client_id, period, locked_by, locked_at)
    VALUES (@id, @client_id, @period, @locked_by, @locked_at)`),

  audit: db.prepare(`INSERT OR IGNORE INTO audit_log
    (id, client_id, user_id, action, entity, entity_id, detail, timestamp)
    VALUES (@id, @client_id, @user_id, @action, @entity, @entity_id, @detail, @timestamp)`),

  upgrade: db.prepare(`INSERT OR IGNORE INTO upgrade_requests
    (id, client_id, user_id, target_tier, method, ref_no, amount, status, rejected_reason, resolved_at, created_at)
    VALUES (@id, @client_id, @user_id, @target_tier, @method, @ref_no, @amount, @status, @rejected_reason, @resolved_at, @created_at)`),

  setting: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
};

// ── Run all inserts in one transaction for speed ──────────────────────────────
const migrate = () => withTransaction(() => {

  // Users
  for (const u of data.users || []) {
    try {
      stmts.user.run({
        id:             u.id,
        email:          u.email,
        name:           u.name || '',
        company:        u.company || '',
        role:           u.role || 'client',
        password_hash:  u.passwordHash || u.password_hash || '',
        accountant_tier: u.accountantTier || u.accountant_tier || 'free',
        firm_name:      u.firmName  || u.firm_name  || null,
        accent_color:   u.accentColor || u.accent_color || null,
        created_at:     u.createdAt || u.created_at || new Date().toISOString(),
      });
      count('users');
    } catch (e) { skipped('users'); console.warn('  ⚠ user skip:', u.email, e.message); }
  }

  // Clients
  for (const c of data.clients || []) {
    try {
      stmts.client.run({
        id:                c.id,
        owner_id:          c.ownerId || c.owner_id || null,
        accountant_id:     c.accountantId || c.accountant_id || null,
        encoder_ids:       JSON.stringify(c.encoderIds || c.encoder_ids || []),
        trade_name:        c.tradeName || c.trade_name || '',
        tin:               c.tin || '',
        address:           c.address || '',
        business_type:     c.businessType || c.business_type || '',
        type:              c.type || 'Corporation',
        tax_regime:        c.taxRegime || c.tax_regime || 'vat',
        opt_rate:          c.optRate || c.opt_rate || 0.03,
        birthday:          c.birthday || c.ownerBirthdate || null,
        subscription_tier: c.subscriptionTier || c.subscription_tier || 'free',
        tax_types:         JSON.stringify(c.taxTypes || c.tax_types || []),
        created_at:        c.createdAt || c.created_at || new Date().toISOString(),
      });
      count('clients');
    } catch (e) { skipped('clients'); console.warn('  ⚠ client skip:', c.tradeName, e.message); }
  }

  // Transactions
  for (const t of data.transactions || []) {
    try {
      stmts.transaction.run({
        id:                  t.id,
        client_id:           t.clientId || t.client_id,
        user_id:             t.userId   || t.user_id,
        type:                t.type,
        description:         t.description || '',
        category:            t.category || '',
        account:             t.account || '',
        vat_type:            t.vatType  || t.vat_type  || null,
        supplier_vat_type:   t.supplierVatType || t.supplier_vat_type || null,
        settlement:          t.settlement || 'cash',
        settlement_account:  t.settlementAccount || t.settlement_account || 'Cash on Hand',
        counterparty_name:   t.counterpartyName   || t.counterparty_name   || '',
        counterparty_tin:    t.counterpartyTin    || t.counterparty_tin    || '',
        counterparty_address:t.counterpartyAddress || t.counterparty_address || '',
        reference_no:        t.referenceNo || t.reference_no || '',
        notes:               t.notes || '',
        amount_net:          t.amount_net  || 0,
        amount_vat:          t.amount_vat  || 0,
        amount_gross:        t.amount_gross || 0,
        percentage_tax:      t.percentageTax || t.percentage_tax || 0,
        ewt_rate:            t.ewtRate  || t.ewt_rate  || 0,
        ewt_amount:          t.ewtAmount || t.ewt_amount || 0,
        voided_at:           t.voidedAt  || t.voided_at  || null,
        voided_by:           t.voidedBy  || t.voided_by  || null,
        void_reason:         t.voidReason || t.void_reason || '',
        created_at:          t.createdAt || t.created_at || new Date().toISOString(),
      });
      count('transactions');
    } catch (e) { skipped('transactions'); console.warn('  ⚠ tx skip:', t.id, e.message); }
  }

  // Journal Entries
  for (const je of data.journalEntries || []) {
    try {
      stmts.je.run({
        id:           je.id,
        client_id:    je.clientId || je.client_id,
        user_id:      je.userId   || je.user_id,
        date:         je.date,
        description:  je.description || '',
        reference_no: je.referenceNo || je.reference_no || '',
        entries:      JSON.stringify(je.entries || []),
        created_at:   je.createdAt || je.created_at || new Date().toISOString(),
      });
      count('journal_entries');
    } catch (e) { skipped('journal_entries'); }
  }

  // Assets
  for (const a of data.assets || []) {
    try {
      stmts.asset.run({
        id:                 a.id,
        client_id:          a.clientId || a.client_id,
        name:               a.name,
        category:           a.category || '',
        cost:               a.cost || 0,
        salvage_value:      a.salvageValue || a.salvage_value || 0,
        useful_life_months: a.usefulLifeMonths || a.useful_life_months || 60,
        start_date:         a.startDate || a.start_date,
        status:             a.status || 'active',
        created_at:         a.createdAt || a.created_at || new Date().toISOString(),
      });
      count('assets');
    } catch (e) { skipped('assets'); }
  }

  // Contacts
  for (const c of data.contacts || []) {
    try {
      stmts.contact.run({
        id:         c.id,
        client_id:  c.clientId || c.client_id,
        user_id:    c.userId   || c.user_id || null,
        name:       c.name,
        type:       c.type || 'supplier',
        tin:        c.tin     || '',
        address:    c.address || '',
        phone:      c.phone   || '',
        email:      c.email   || '',
        notes:      c.notes   || '',
        created_at: c.createdAt || c.created_at || new Date().toISOString(),
      });
      count('contacts');
    } catch (e) { skipped('contacts'); }
  }

  // Chart of Accounts
  for (const a of data.coa || []) {
    try {
      stmts.coa.run({
        id:             a.id,
        client_id:      a.clientId || a.client_id,
        code:           a.code,
        name:           a.name,
        category:       a.category || '',
        type:           a.type     || 'custom',
        normal_balance: a.normalBalance || a.normal_balance || 'debit',
        created_at:     a.createdAt || a.created_at || new Date().toISOString(),
      });
      count('coa');
    } catch (e) { skipped('coa'); }
  }

  // Locked Periods
  for (const p of data.lockedPeriods || []) {
    try {
      stmts.period.run({
        id:         p.id,
        client_id:  p.clientId || p.client_id,
        period:     p.period,
        locked_by:  p.lockedBy || p.locked_by || null,
        locked_at:  p.lockedAt || p.locked_at || new Date().toISOString(),
      });
      count('locked_periods');
    } catch (e) { skipped('locked_periods'); }
  }

  // Audit Log
  for (const e of data.auditLog || []) {
    try {
      stmts.audit.run({
        id:         e.id,
        client_id:  e.clientId  || e.client_id  || null,
        user_id:    e.userId    || e.user_id    || null,
        action:     e.action    || '',
        entity:     e.entity    || '',
        entity_id:  e.entityId  || e.entity_id  || null,
        detail:     e.detail    || '',
        timestamp:  e.timestamp || new Date().toISOString(),
      });
      count('audit_log');
    } catch (e) { skipped('audit_log'); }
  }

  // Upgrade Requests
  for (const r of data.upgradeRequests || []) {
    try {
      stmts.upgrade.run({
        id:              r.id,
        client_id:       r.clientId    || r.client_id,
        user_id:         r.userId      || r.user_id,
        target_tier:     r.targetTier  || r.target_tier,
        method:          r.method,
        ref_no:          r.refNo       || r.ref_no,
        amount:          r.amount      || 0,
        status:          r.status      || 'pending',
        rejected_reason: r.rejectedReason || r.rejected_reason || '',
        resolved_at:     r.resolvedAt  || r.resolved_at || null,
        created_at:      r.createdAt   || r.created_at || new Date().toISOString(),
      });
      count('upgrade_requests');
    } catch (e) { skipped('upgrade_requests'); }
  }

  // Settings — merge into key-value store
  if (data.settings && typeof data.settings === 'object') {
    for (const [k, v] of Object.entries(data.settings)) {
      stmts.setting.run(k, JSON.stringify(v));
    }
    count('settings', Object.keys(data.settings).length);
  }
});

// ── Execute ───────────────────────────────────────────────────────────────────
console.log('⚙  Migrating...\n');
migrate();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('✅  Migration complete!\n');
console.log('  Records inserted:');
for (const [table, n] of Object.entries(counts)) {
  console.log(`    ${table.padEnd(20)} ${n}`);
}
if (Object.keys(skip).length) {
  console.log('\n  Skipped (duplicates or errors):');
  for (const [table, n] of Object.entries(skip)) {
    console.log(`    ${table.padEnd(20)} ${n}`);
  }
}
console.log('\n  Database: backend/myledger.db');
console.log('  Ready to start: npm start\n');
