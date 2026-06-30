# MyLedger v10-clean — Audit & Bug-Fix Status Report
Generated: 2026-05-10

---

## Fixes Applied in This Pass

### 1. `backend/migrate-from-lowdb.js` — `tax_types` added to client INSERT

**Problem:** The prepared statement for inserting clients was missing the `tax_types` column. Any migration run from a `myledger.json` that contains `taxTypes` arrays would silently drop that data, resulting in clients with empty tax-type lists after migration.

**Fix:** Added `tax_types` to both the column list and the VALUES list. Added `tax_types: JSON.stringify(c.taxTypes || c.tax_types || [])` to the run object so it handles both camelCase and snake_case field names from the old JSON.

**File changes:**
- Line 43–48: `tax_types` added to INSERT column list
- Line ~137: `tax_types: JSON.stringify(c.taxTypes || c.tax_types || [])` added to run params

---

### 2. `backend/db.js` — `ownerBirthdate` alias added to `rowToClient`

**Problem:** The `rowToClient` mapper returns `birthday: r.birthday` but the frontend (`ClientInterface.jsx` and `AccountantPortal.jsx`) consistently uses `ownerBirthdate`. This caused a silent bug:
- Business Setup modal pre-populated with existing data shows an empty birthday field even when one is stored
- The AccountantPortal "Business Info" card never shows owner birthday even when present
- The Sole Proprietor "1701 requirement" warning never fires in edit mode

**Fix:** Added `ownerBirthdate: r.birthday` alongside `birthday: r.birthday` in `rowToClient` so both property names work without changing any routes or frontend code.

**File changes:**
- `rowToClient` function: `birthday: r.birthday, ownerBirthdate: r.birthday, subscriptionTier: ...`

---

### 3. `backend/routes/audit.js` — Stale comment corrected

**Problem:** Line 45 said `// Synchronous — better-sqlite3 does not need async` — a leftover from the better-sqlite3 era. Misleading for anyone maintaining the code.

**Fix:** Updated comment to `// Synchronous — node:sqlite API is fully synchronous (no async needed)`.

---

## Verified — No Changes Required

### `backend/routes/bir.js`
- `/deadlines` correctly fetches client via `rowToClient(stmtClientById.get(clientId))` — `taxTypes` is properly populated via `rowToClient`.
- `/vat-balance` also uses `rowToClient` correctly.
- Both endpoints are wrapped in `try { ... } catch (err) { next(err); }`.
- Note: The BIR returns (2550M, 2550Q, 1601-EQ, 2551M, 2551Q) are computed **in the frontend** (`AccountantPortal.jsx` helper functions `computeBIRVAT`, `computeOPT`), not via separate backend routes. This is the intended design — no gap here.

### `backend/routes/reports.js`
- All 7 endpoints (`/income`, `/balance`, `/cashflow`, `/books`, `/slsp`, `/general-journal`, `/general-ledger`) are wrapped in `try/catch`.
- `clientId` validated and gated via `getClientAndTx()` which returns `{ client: null }` on access failure — routes return 404 cleanly.
- Dynamic SQL in `/cashflow` uses `db.prepare(assetSQL).all(...assetArgs)` — this spread syntax is valid for `node:sqlite`'s `StatementSync.all()`, same as `better-sqlite3`.
- No orphaned `better-sqlite3`-specific calls found.

### `backend/routes/notifications.js`
- `stmtClientsByAccountant.all(acct.id).map(rowToClient)` — correctly uses `rowToClient`. `taxRegime` (used for VAT/OPT filtering) is properly populated.
- Note: The email reminder logic filters by `taxRegime` (VAT vs OPT), not by `taxTypes` array. This is a valid design choice — the `taxTypes` array is a user-facing checklist of which BIR forms the business files; `taxRegime` is the system-level VAT vs OPT classification. No fix needed.
- All three endpoints have `try/catch` error handling.

### `backend/routes/journal-entries.js`
- No `db.transaction()` calls — uses prepared statements directly (single-row inserts, no transaction needed here).
- All 3 endpoints wrapped in `try/catch`.
- Uses `rowToClient`, `rowToJE` correctly.

### `backend/routes/audit.js`
- No `db.transaction()` calls.
- `logAudit` helper wrapped in its own `try/catch` with swallow — appropriate (audit failure must not crash a request).
- GET endpoint wrapped in `try/catch`.

### `backend/routes/periods.js`
- No `db.transaction()` calls.
- All 3 endpoints wrapped in `try/catch`.
- `isValidPeriod()` regex guard on input.

### `backend/routes/assets.js`
- No `db.transaction()` calls.
- All 5 endpoints wrapped in `try/catch`.
- Uses `rowToClient`, `rowToAsset` correctly.

### `backend/routes/contacts.js`
- No `db.transaction()` calls.
- All 4 endpoints wrapped in `try/catch`.

### `backend/routes/coa.js`
- Uses `withTransaction()` correctly in `/seed/:clientId` — the only bulk-insert operation in this file.
- All 5 endpoints wrapped in `try/catch`.

### `frontend/src/pages/AccountantPortal.jsx` — `taxTypes` usage
- The portal does **not** have a client-creation modal. Clients are created by the client user via `ClientInterface.jsx`. The accountant only accesses clients assigned to them.
- `taxTypes` is read-only in AccountantPortal (displayed in Business Info card, used to gate BIR Reminders tab). All reads use `(active.taxTypes || [])` with safe fallback.
- No `createClient` or `updateClient` calls in AccountantPortal — no gap here.

### `frontend/src/pages/ClientInterface.jsx` — `taxTypes` in Business Setup
- `BusinessModal` includes `taxTypes: []` in its blank form state.
- `toggleTT()` correctly toggles tax types in/out of the `taxTypes` array.
- `onSave(form)` passes the full form including `taxTypes` to `saveBusiness()`.
- `saveBusiness()` calls `createClient(form)` or `updateClient(active.id, form)` — the full form is sent.
- Backend `clients.js` POST reads `taxTypes` from body, JSON-stringifies and stores it.

### `backend/db.js` — Schema completeness vs `myledger.json`
Compared all fields in the old `myledger.json` client records against the SQLite schema:

| Old JSON field       | SQLite column          | Status    |
|----------------------|------------------------|-----------|
| `id`                 | `id`                   | OK        |
| `ownerId`            | `owner_id`             | OK        |
| `accountantId`       | `accountant_id`        | OK        |
| `tradeName`          | `trade_name`           | OK        |
| `tin`                | `tin`                  | OK        |
| `type`               | `type`                 | OK        |
| `address`            | `address`              | OK        |
| `taxTypes`           | `tax_types`            | OK (fixed)|
| `ownerBirthdate`     | `birthday`             | OK        |
| `subscriptionTier`   | `subscription_tier`    | OK        |
| `taxRegime`          | `tax_regime`           | OK        |
| `optRate`            | `opt_rate`             | OK        |
| `createdAt`          | `created_at`           | OK        |
| `assignedUsers`      | _(dropped — replaced by accountant_id / encoder_ids)_ | By design |
| `updatedAt`          | _(not in SQLite schema)_ | Not needed (no update timestamps in this system) |

No additional missing columns found.

---

## Remaining Issues Requiring User Action

### A. Existing `myledger.db` clients have `tax_types = '[]'` (empty)
The `tax_types` column was added via `ALTER TABLE` migration but any clients inserted **before this session** have empty arrays. If you have real clients in the database whose tax types were lost:

**Option 1 — Re-run migration** (if you still have `myledger.json`):
```
cd backend
node migrate-from-lowdb.js
```
This will skip existing rows (INSERT OR IGNORE) so duplicates are safe, but **will not update existing rows** — INSERT OR IGNORE does not overwrite. The `tax_types` column on existing rows will remain `[]`.

**Option 2 — Use the app** (recommended):
Have each client log in → Business Setup → check their tax obligations → Save. This is the safest path since `myledger.json` data may be stale.

**Option 3 — One-time SQL fix** (if you know what each client files):
Open the DB with any SQLite browser and run:
```sql
UPDATE clients SET tax_types = '["2550M","2550Q","1601EQ"]' WHERE id = '...';
```

### B. Restart required
After these file changes, restart the backend server:
```
npm start
```
(or stop and re-run `node app.js` / your start script)

---

## Recommended Test Sequence

1. **Start backend:** `cd backend && node app.js` — should start clean on port 5000.
2. **Login as client user** (e.g. `martm.mesjara@gmail.com`).
3. **Business Setup → Edit:** Confirm the birthday field is pre-populated (if one was set). Confirm tax obligation checkboxes reflect current `taxTypes`. Save and verify the response shows the updated data.
4. **Overview tab:** Confirm "Upcoming BIR Filings" widget shows filings (if taxTypes were set).
5. **Login as accountant** (e.g. `mym@kaimanco.com`).
6. **AccountantPortal → Business Info card:** Confirm "Tax Types" row shows the correct list.
7. **BIR Reminders tab:** Confirm it shows deadlines (not the "No tax types configured" placeholder) for clients that have taxTypes.
8. **AccountantPortal → Income Statement / Balance Sheet tabs:** Verify reports load without errors.
9. **SLSP tab:** Verify SLSP loads for a client with transactions.
10. **Admin CommandCenter (if applicable):** Verify stats endpoint, set-owner endpoint work.

---

*Report generated by automated audit pass — v10-clean codebase, Node 24 ESM + node:sqlite backend.*
