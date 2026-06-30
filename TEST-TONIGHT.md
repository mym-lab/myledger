# MyLedger v10 — Tonight's Test Plan

## STARTUP (2 windows)
```
Window 1:  double-click  start-backend.bat   → http://localhost:5000
Window 2:  double-click  start-frontend.bat  → http://localhost:3000
```

---

## 1. HEALTH CHECK
Open: http://localhost:5000/api/health
Expected: `{"status":"ok","app":"MyLedger",...}`

---

## 2. CLIENT SIGNUP & SETUP
Go to: http://localhost:3000
1. Click "Create Account" → select **Business Owner**
2. Fill: Name, Business Name (e.g. "ABC Trading"), Email, Password → Submit
3. Should land on **ClientInterface** (blue theme)
4. Go to **Business Setup** tab:
   - Add TIN, type, address, tax types (tick 2550M, 2550Q)
   - Tax Regime: VAT-registered
   - Save → should see success

---

## 3. CLIENT TRANSACTIONS
Go to **Transactions** tab → "+ Add Transaction"

### Test A — Vatable Income
- Type: Income · Amount: 10000 · VAT Type: Vatable
- Preview must show: NET ₱10,000 · VAT ₱1,200 · GROSS ₱11,200
- Description: "Sales Invoice #001" · Settlement: Cash
- Save

### Test B — Vatable Expense
- Type: Expense · Amount: 11200 (GROSS) · Supplier VAT: VAT-registered
- Preview must show: NET ₱10,000 · VAT ₱1,200 · GROSS ₱11,200
- Description: "Office supplies" · Settlement: Cash
- Save

### Test C — Zero-rated Income
- Type: Income · Amount: 50000 · VAT Type: Zero-rated
- Preview must show: NET ₱50,000 · VAT ₱0 · GROSS ₱50,000
- Save

### Test D — Non-VAT Expense
- Type: Expense · Amount: 5000 · Supplier VAT: Non-VAT supplier
- Preview must show: NET ₱5,000 · VAT ₱0 · GROSS ₱5,000
- Save

### Verify transaction list shows 4 rows with correct NET/VAT/GROSS

---

## 4. CLIENT REPORTS
### Income Statement tab
- Should show: Revenue ₱60,000 · Expenses ₱15,000 · Profit ₱45,000
- (10,000 vatable + 50,000 zero-rated) minus (10,000 + 5,000)

### Balance Sheet tab
- Assets → Input VAT Recoverable: ₱1,200
- Liabilities → Output VAT Payable: ₱1,200
- Net position: ₱0 (balanced)

### Books tab — Sales Book
- Should show 2 income rows (Test A + C)
- Totals: GROSS = ₱61,200, VAT = ₱1,200, NET = ₱60,000

### Books tab — Purchases Book
- Should show 2 expense rows (Test B + D)
- Test B: GROSS ₱11,200 · VAT ₱1,200 · NET ₱10,000
- Test D: GROSS ₱5,000 · VAT ₱0 · NET ₱5,000

---

## 5. ACCOUNTANT SIGNUP & ASSIGNMENT
Open new private/incognito tab: http://localhost:3000
1. Click "Create Account" → select **Accountant** 🧮
2. Fill: Name "Maria Cruz", Firm "Cruz & Associates", Email, Password
3. Should land on **AccountantPortal** (teal theme)
4. Should say "No clients yet"

### Assign accountant to client:
- Go back to ClientInterface (client tab)
- Business Setup → "Assign Accountant" field → enter accountant's email
- Save
- Refresh AccountantPortal → client should appear in dropdown

---

## 6. ACCOUNTANT PORTAL TEST
With client selected in dropdown:

### Dashboard tab
- Metric cards: Net Revenue, Expenses, Profit, Transactions, Output VAT

### Transactions tab — Add Transaction
- "+ Add Transaction" → check all new fields appear:
  - VAT Type dropdown (income) / Supplier VAT Type (expense)
  - Settlement dropdown
  - Account Name field
- Add a test transaction — VatCalc preview should show correctly

### Books tab
- Click "📋 Sales" → hit Refresh → should show income transactions
- Click "🛒 Purchases" → should show expense transactions
- Date range filter works

### Trial Balance tab
- Should show accounts using REAL names (not hardcoded "Cash / Bank")
- Accounts from settlement (e.g. "Cash on Hand") and account fields

### Income Statement, Balance Sheet tabs
- Should match client's reports

### Cash Flow tab
- Refresh → should show Operating / Investing / Financing sections
- Net Cash Movement at bottom

### BIR Returns tab
- Select 2550M, pick current month → shows gross sales / output VAT computation

### Alphalist tab
- If expense transactions have counterpartyTin → grouped by vendor

---

## 7. COMMAND CENTER (Admin)
Go to: http://localhost:3000/admin (no login required — MVP)
- Should see **CommandCenter** (purple theme)
- Users tab → should show all signup accounts
- Transactions tab → all transactions across all clients
- Settings tab → can adjust pricing/tier limits
- Upgrade Requests tab → any tier upgrade requests

---

## 8. QUICK CURL TESTS (optional, verify backend directly)

```bash
# Health
curl http://localhost:5000/api/health

# Signup client
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"client@test.com\",\"password\":\"test123\",\"name\":\"Test Client\",\"role\":\"client\"}"

# Signup accountant
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"acct@test.com\",\"password\":\"test123\",\"name\":\"Test Accountant\",\"role\":\"accountant\"}"

# Login (save TOKEN from response)
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"client@test.com\",\"password\":\"test123\"}"

# Income transaction (use TOKEN from login)
curl -X POST http://localhost:5000/api/transactions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"clientId\":\"CLIENT_ID\",\"type\":\"income\",\"amount\":10000,\"vatType\":\"vatable\",\"description\":\"Sales\",\"settlement\":\"cash\"}"

# Books report
curl "http://localhost:5000/api/reports/books?clientId=CLIENT_ID&type=sales" \
  -H "Authorization: Bearer TOKEN"
```

---

## KNOWN ISSUES / WATCH FOR
- `db.json` is created in `backend/` on first run — this is your database
- If you get CORS errors: confirm backend is on port 5000
- If frontend can't reach backend: check `frontend/vite.config.js` has `/api` proxy
- Admin path `/admin` has NO auth — add password before going live

---

## PASS CRITERIA
- [ ] Client can sign up, add transactions, see reports
- [ ] VAT math is 100% correct (NET × 1.12 = GROSS for income)
- [ ] Accountant can sign up, get assigned, see client's books
- [ ] Books show in SLSP format with correct columns
- [ ] Trial Balance uses real account names (not hardcoded)
- [ ] Command Center shows all users and transactions
- [ ] No console errors in browser DevTools
