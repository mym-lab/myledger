# MyLedger Growth Implementation — Developer Brief

**Status:** Ready for Development  
**Priority:** CRITICAL (Blocks Q3-Q4 growth goals)  
**Timeline:** 12 weeks (3-person sprint)  
**Start Date:** 2026-09-01  

---

## EXECUTIVE SUMMARY

MyLedger needs to implement a coordinated growth strategy that requires both backend and frontend engineering. This brief outlines 5 major implementation tracks with specific deliverables, dependencies, and success metrics.

**Key Insight:** The biggest ROI comes from:
1. **Free tier launch** (removes signup friction) → 2-3x signup volume
2. **Accountant partnership program** (distribution channel) → 1 accountant = 10-20 referred clients
3. **Feature enhancements** (expense tracking, bank reconciliation) → Unlock ₱500K+ ARR

---

## IMPLEMENTATION ROADMAP

### TRACK 1: FREE TIER SYSTEM (Priority: CRITICAL)
**Owner:** Product + Full-stack engineer  
**Timeline:** 1.5 weeks  
**Status:** Required before launch  

#### 1.1 Database Schema Updates

**Files to modify:**
- `backend/db.js` — Add tables for free tier tracking

**Schema additions:**
```javascript
// Add columns to users table (if not exist)
ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN upgraded_at TEXT;
ALTER TABLE users ADD COLUMN free_trial_expires_at TEXT;

// Create free tier usage tracking table
CREATE TABLE IF NOT EXISTS free_tier_usage (
  user_id TEXT PRIMARY KEY,
  invoices_created INTEGER DEFAULT 0,
  transactions_created INTEGER DEFAULT 0,
  team_members_invited INTEGER DEFAULT 0,
  reports_generated INTEGER DEFAULT 0,
  last_activity TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

// Create free tier feature limits
CREATE TABLE IF NOT EXISTS tier_limits (
  tier TEXT PRIMARY KEY,
  invoices_per_month INTEGER,
  transactions_per_month INTEGER,
  team_seats INTEGER,
  integrations_allowed BOOLEAN,
  bank_reconciliation BOOLEAN,
  expense_tracking BOOLEAN,
  price_monthly REAL
);

// Pre-populate tier limits
INSERT INTO tier_limits VALUES
  ('free', 5, 20, 1, 0, 0, 0, 0),
  ('micro', 50, 200, 2, 0, 0, 1, 99),
  ('starter', 500, 2000, 3, 0, 0, 1, 199),
  ('pro', 999, 999999, 10, 1, 0, 1, 399),
  ('enterprise', 999999, 999999, 999, 1, 1, 1, 699);
```

**What this enables:**
- Different tiers (free, micro, starter, pro, enterprise)
- Limit enforcement (can't create 6th invoice on free tier)
- Usage tracking (for analytics and upsell triggers)

#### 1.2 API Changes

**New endpoints to add:**

```
GET /api/subscription/tier
├─ Returns: Current user's tier + remaining usage
├─ Example response:
   {
     tier: 'free',
     invoices_limit: 5,
     invoices_used: 3,
     invoices_remaining: 2,
     features: ['invoicing', 'basic_reports'],
     upgrade_url: '/pricing'
   }

POST /api/subscription/upgrade
├─ Payload: { new_tier: 'starter' }
├─ Validates payment (if paid tier)
├─ Updates users.tier
└─ Returns: Confirmation + access token with new tier

POST /api/subscription/request-access
├─ Use case: "User hit invoice limit, request to create more"
├─ Payload: { feature: 'invoices', reason: 'client_emergency' }
├─ Creates: Support ticket + email to admin
└─ May grant temporary 1-invoice exception
```

**Modify existing endpoints:**

```
POST /api/payments (create invoice)
├─ Check user tier before allowing creation
├─ If tier is 'free' and invoices_used >= 5:
│  └─ Return 402 (Payment Required)
│  └─ Show upsell message: "You've hit your 5-invoice limit. Upgrade to unlimited."
├─ Otherwise: Create invoice as normal
└─ Increment free_tier_usage.invoices_created

GET /api/payments
├─ Include tier check: Show warning if approaching limit
└─ If free + 4 invoices: "1 invoice left this month. Upgrade?"

All authenticated endpoints:
└─ Include tier in JWT token (so frontend can check without API call)
```

**Payment system modifications:**

```
POST /api/payments/upgrade-to-paid
├─ Validates GCash/Maya/Bank Transfer payment
├─ On success: Update users.tier = 'starter' (or other)
├─ Create subscription_payment record
├─ Send confirmation email: "Welcome to Starter plan!"
└─ Redirect: /dashboard?success=upgraded

GET /api/billing/subscription
├─ Returns: Current plan + renewal date + payment method
├─ If trial: Show "Trial ends in X days"
└─ If cancelled: Show "You'll lose access on [date]"
```

#### 1.3 Frontend Changes

**Files to modify:**
- `frontend/src/components/TierGate.jsx` (NEW)
- `frontend/src/components/UpgradePrompt.jsx` (NEW)
- `frontend/src/App.jsx` (add tier check)
- `frontend/src/SubscriptionStatus.jsx` (show free tier option)
- `frontend/src/FeatureList.jsx` (show available features per tier)

**New Component: TierGate.jsx**
```jsx
// Wrap features that require paid tier
import TierGate from './TierGate';

function InvoiceForm() {
  return (
    <TierGate requiredTier="starter" feature="unlimited_invoices">
      {/* Form code */}
      <input type="text" placeholder="Invoice number" />
    </TierGate>
  );
}

// TierGate automatically shows upsell modal if needed
```

**New Component: UpgradePrompt.jsx**
```jsx
// Show when user hits limit
function UpgradePrompt({ reason, currentTier, suggestedTier }) {
  return (
    <Modal>
      <h2>Unlock more with {suggestedTier} plan</h2>
      <p>You've hit your {reason} limit on the free plan.</p>
      
      <FeatureComparison
        currentTier={currentTier}
        nextTier={suggestedTier}
      />
      
      <Button onClick={handleUpgrade}>
        Upgrade to {suggestedTier} (₱{prices[suggestedTier]}/mo)
      </Button>
      <Button onClick={handleLater}>Ask for extension</Button>
    </Modal>
  );
}
```

**Pricing display on signup:**
```jsx
// On registration page, show tier options
<PricingCards>
  <Card tier="free" price="₱0" features={['5 invoices/month', '1 user']} />
  <Card tier="micro" price="₱99" features={['50 invoices/month', '2 users']} />
  <Card tier="starter" price="₱199" features={['Unlimited invoices', '3 users']} />
</PricingCards>
```

#### 1.4 Testing

**Unit tests to add:**
```javascript
describe('Free Tier System', () => {
  test('User can create invoice on free tier', () => {
    // User should be able to create 5 invoices
  });
  
  test('6th invoice blocked on free tier', () => {
    // Error: "You've hit your limit"
  });
  
  test('Upgrade unlocks unlimited invoices', () => {
    // After upgrade, no limit
  });
  
  test('Usage counter increments correctly', () => {
    // free_tier_usage.invoices_created should increase
  });
});
```

**E2E tests:**
```javascript
describe('Free to Paid Funnel', () => {
  test('User can sign up free, hit limit, see upsell, upgrade', () => {
    // 1. Sign up free account
    // 2. Create 5 invoices (hit limit)
    // 3. See modal: "Upgrade to ₱199"
    // 4. Click upgrade
    // 5. Enter payment (GCash/Maya)
    // 6. Confirm tier changed to 'starter'
    // 7. Can now create unlimited invoices
  });
});
```

---

### TRACK 2: ACCOUNTANT PARTNERSHIP PROGRAM (Priority: HIGH)
**Owner:** Product + Backend engineer  
**Timeline:** 2 weeks  
**Status:** Required before outreach  

#### 2.1 Database Schema

```javascript
// Create accountant_partners table
CREATE TABLE IF NOT EXISTS accountant_partners (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE, -- Link to accountant's user record
  tier TEXT DEFAULT 'starter', -- 'starter', 'growth', 'elite'
  referred_clients INTEGER DEFAULT 0,
  commission_earned_total REAL DEFAULT 0,
  commission_paid_total REAL DEFAULT 0,
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'suspended'
  signup_date TEXT NOT NULL,
  last_client_referral_date TEXT,
  nps_score INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

// Track referred clients
CREATE TABLE IF NOT EXISTS partner_referrals (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  commission_per_month REAL DEFAULT 50,
  status TEXT DEFAULT 'active', -- 'active', 'churned'
  referred_date TEXT NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES accountant_partners(id),
  FOREIGN KEY (referred_user_id) REFERENCES users(id)
);

// Track commission payments
CREATE TABLE IF NOT EXISTS partner_commissions (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  month TEXT NOT NULL, -- '2026-09'
  active_clients INTEGER,
  commission_amount REAL,
  status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'failed'
  paid_date TEXT,
  FOREIGN KEY (partner_id) REFERENCES accountant_partners(id)
);

// Create indexes
CREATE INDEX idx_partners_user ON accountant_partners(user_id);
CREATE INDEX idx_referrals_partner ON partner_referrals(partner_id);
CREATE INDEX idx_referrals_status ON partner_referrals(status);
CREATE INDEX idx_commissions_partner ON partner_commissions(partner_id);
```

#### 2.2 API Endpoints

```
POST /api/partners/signup
├─ Payload: { accountant_id, payment_method }
├─ Creates: accountant_partners record (tier='starter')
├─ Adds: 5 free client seats to their account
├─ Email: "Welcome! You're earning commissions now."
└─ Response: Partner dashboard URL

GET /api/partners/dashboard
├─ Returns:
   {
     referred_clients: 12,
     commission_earned: ₱600,
     commission_pending: ₱150,
     partner_tier: 'starter',
     next_tier_requirements: { 
       clients_needed: 10,
       clients_until_growth: 8
     },
     recent_referrals: [
       { client_name, joined_date, status }
     ]
   }

POST /api/partners/refer-client
├─ Payload: { partner_id, client_email }
├─ Creates: partner_referrals record
├─ Sends: Invite email to client (from partner)
├─ Tracks: Conversion path (partner → client signup)
└─ On client upgrade: Auto-add commission record

GET /api/partners/commission-statement
├─ Returns: Monthly breakdown
   {
     month: '2026-09',
     active_clients: 12,
     commission: ₱600,
     next_payment_date: '2026-10-05'
   }

GET /api/partners/resources
├─ Returns: Email templates, marketing materials, training videos
└─ Includes: { templates: [...], videos: [...], one_sheets: [...] }
```

#### 2.3 Commission Calculation System

```javascript
// backend/services/commissionCalculator.js

class CommissionCalculator {
  // Monthly commission calculation (run on 1st of each month)
  calculateMonthlyCommission(partnerId, month) {
    // Get active referrals for partner
    const activeReferrals = db.prepare(`
      SELECT COUNT(*) as count FROM partner_referrals
      WHERE partner_id = ? AND status = 'active'
    `).get(partnerId);
    
    const clientCount = activeReferrals.count;
    const baseCommission = clientCount * 50; // ₱50 per client
    
    // Add bonus if hit targets
    let bonus = 0;
    if (clientCount >= 10 && clientCount < 30) {
      bonus = baseCommission * 0.10; // 10% bonus
    } else if (clientCount >= 30) {
      bonus = baseCommission * 0.15; // 15% bonus
    }
    
    // Create commission record
    db.prepare(`
      INSERT INTO partner_commissions (id, partner_id, month, active_clients, commission_amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(generateId(), partnerId, month, clientCount, baseCommission + bonus);
    
    return baseCommission + bonus;
  }
  
  // Process payouts (monthly)
  processPayouts(month) {
    const pending = db.prepare(`
      SELECT * FROM partner_commissions
      WHERE month = ? AND status = 'pending'
    `).all(month);
    
    pending.forEach(commission => {
      try {
        // Transfer to partner's bank account
        const partner = getPartnerDetails(commission.partner_id);
        transferFunds(partner.bank_account, commission.commission_amount);
        
        // Update status
        db.prepare(`UPDATE partner_commissions SET status = 'paid', paid_date = ? WHERE id = ?`)
          .run(new Date().toISOString(), commission.id);
      } catch (err) {
        // Mark as failed, alert admin
        db.prepare(`UPDATE partner_commissions SET status = 'failed' WHERE id = ?`)
          .run(commission.id);
      }
    });
  }
}
```

#### 2.4 Partner Portal (Frontend)

**Files to create:**
- `frontend/src/PartnerDashboard.jsx`
- `frontend/src/PartnerResources.jsx`
- `frontend/src/CommissionTracker.jsx`

**PartnerDashboard.jsx:**
```jsx
export function PartnerDashboard() {
  const [partner, setPartner] = useState(null);
  const [commissions, setCommissions] = useState([]);
  
  useEffect(() => {
    fetchPartnerData();
  }, []);
  
  return (
    <div className="partner-dashboard">
      <h1>Partner Dashboard</h1>
      
      {/* Stats cards */}
      <StatsCard
        label="Clients Referred"
        value={partner?.referred_clients}
        change="+3 this month"
      />
      
      <StatsCard
        label="Earnings This Month"
        value={`₱${partner?.commission_pending}`}
        status="pending"
      />
      
      <StatsCard
        label="Total Earned"
        value={`₱${partner?.commission_earned_total}`}
        change="All-time"
      />
      
      <StatsCard
        label="Your Tier"
        value={partner?.tier}
        action="Upgrade to Growth tier in 8 more referrals"
      />
      
      {/* Referrals list */}
      <ReferralsList referrals={partner?.recent_referrals} />
      
      {/* Resources */}
      <ResourcesSection />
    </div>
  );
}
```

---

### TRACK 3: EXPENSE TRACKING FEATURE (Priority: HIGH)
**Owner:** Full-stack engineer  
**Timeline:** 2.5 weeks  
**Status:** Unlocks ₱500K+ incremental ARR  

#### 3.1 Backend Implementation

**Database schema:**
```javascript
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'PHP',
  category TEXT NOT NULL,
  vendor TEXT,
  receipt_url TEXT,
  receipt_ocr_text TEXT,
  date TEXT NOT NULL,
  project_id TEXT,
  is_deductible BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_expenses_user ON expenses(user_id);
CREATE INDEX idx_expenses_date ON expenses(date);
CREATE INDEX idx_expenses_category ON expenses(category);

CREATE TABLE IF NOT EXISTS expense_categories (
  id TEXT PRIMARY KEY,
  category_name TEXT UNIQUE NOT NULL,
  is_deductible BOOLEAN DEFAULT true,
  tax_code TEXT -- For tax filing integration later
);

-- Pre-populate categories
INSERT INTO expense_categories VALUES
  ('supplies', true, '5101'),
  ('software', true, '5102'),
  ('meals_entertainment', true, '5103'),
  ('travel', true, '5104'),
  ('office_rent', true, '5105'),
  ('utilities', true, '5106'),
  ('professional_services', true, '5107'),
  ('other', false, NULL);
```

**API endpoints:**

```
POST /api/expenses
├─ Payload: { amount, category, vendor, date, receipt_file (optional) }
├─ If receipt_file:
│  └─ Upload to S3, run OCR (Google Vision API)
│  └─ Extract: date, amount, vendor
│  └─ Pre-fill form fields
├─ Create expenses record
└─ Return: Expense with OCR data (for review)

GET /api/expenses
├─ Query params: { start_date, end_date, category, project_id }
├─ Returns: List of expenses with pagination
└─ Include: Total by category (for chart)

PUT /api/expenses/:id
├─ Allow user to correct OCR data
├─ Update: amount, category, vendor, date, etc.
└─ Return: Updated expense

DELETE /api/expenses/:id
├─ Soft delete (keep for audit trail)
└─ Return: Success

GET /api/expenses/summary
├─ Returns: Aggregated data by category and month
   {
     total: ₱45,230,
     by_category: { supplies: ₱12,000, travel: ₱8,500, ... },
     by_month: { '2026-08': ₱15,000, '2026-09': ₱30,230, ... },
     deductible_total: ₱42,000,
     tax_benefit: ₱10,500 (assuming 25% tax rate)
   }

POST /api/expenses/upload-receipt
├─ File upload endpoint (multipart)
├─ Accepts: PDF, JPG, PNG
├─ Returns: OCR results for user review
└─ No expense created until user confirms
```

**OCR Integration:**

```javascript
// backend/services/receiptOCR.js
const vision = require('@google-cloud/vision');

async function extractReceiptData(imageBuffer) {
  const client = new vision.ImageAnnotatorClient();
  
  const request = {
    image: { content: imageBuffer },
  };
  
  const [result] = await client.textDetection(request);
  const detections = result.textAnnotations;
  
  // Parse detected text
  const allText = detections.map(d => d.description).join('\n');
  
  // Use regex + AI to extract key fields
  const extracted = {
    vendor: extractVendor(allText),
    amount: extractAmount(allText),
    date: extractDate(allText),
    items: extractItems(allText),
    confidence: calculateConfidence(allText)
  };
  
  return extracted;
}

function extractAmount(text) {
  // Find patterns like "₱123.45" or "PHP 123.45"
  const pattern = /₱|PHP\s*(\d+[,.]?\d*)/gi;
  const matches = text.match(pattern);
  // Return largest amount (likely the total)
  return matches ? Math.max(...matches.map(m => parseFloat(m))) : null;
}

function extractDate(text) {
  // Find common date patterns (MM/DD/YYYY, DD-MM-YYYY, etc.)
  const patterns = [
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/,
    /([A-Za-z]+)\s*(\d{1,2}),\s*(\d{4})/
  ];
  // Return most recent plausible date
}
```

#### 3.2 Frontend Implementation

**Files to create:**
- `frontend/src/ExpenseTracker.jsx`
- `frontend/src/ExpenseForm.jsx`
- `frontend/src/ReceiptUpload.jsx`
- `frontend/src/ExpenseReports.jsx`

**ReceiptUpload.jsx:**
```jsx
import { useState } from 'react';

export function ReceiptUpload({ onDataExtracted }) {
  const [uploading, setUploading] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);
  
  const handleUpload = async (file) => {
    setUploading(true);
    
    // Upload to /api/expenses/upload-receipt
    const formData = new FormData();
    formData.append('receipt', file);
    
    const response = await fetch('/api/expenses/upload-receipt', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    
    const data = await response.json();
    setOcrResult(data);
    setUploading(false);
  };
  
  return (
    <div className="receipt-upload">
      <Dropzone onDrop={handleUpload} />
      
      {uploading && <Spinner />}
      
      {ocrResult && (
        <ReceiptReview
          data={ocrResult}
          onConfirm={() => onDataExtracted(ocrResult)}
        />
      )}
    </div>
  );
}
```

**ExpenseForm.jsx:**
```jsx
export function ExpenseForm({ initialData, onSubmit }) {
  const [form, setForm] = useState(initialData || {});
  
  const handleSubmit = async () => {
    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    
    onSubmit();
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="number" 
        value={form.amount}
        placeholder="Amount (₱)"
        onChange={e => setForm({...form, amount: e.target.value})}
      />
      
      <select 
        value={form.category}
        onChange={e => setForm({...form, category: e.target.value})}
      >
        <option value="supplies">Supplies</option>
        <option value="software">Software</option>
        <option value="meals">Meals & Entertainment</option>
        <option value="travel">Travel</option>
      </select>
      
      <input 
        type="date"
        value={form.date}
        onChange={e => setForm({...form, date: e.target.value})}
      />
      
      <button type="submit">Save Expense</button>
    </form>
  );
}
```

**ExpenseReports.jsx:**
```jsx
export function ExpenseReports() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState(null);
  
  useEffect(() => {
    fetchExpenses();
    fetchSummary();
  }, []);
  
  return (
    <div className="expense-reports">
      <h2>Monthly Expense Summary</h2>
      
      {/* Summary cards */}
      <SummaryCard 
        label="Total Expenses" 
        value={`₱${summary?.total}`}
      />
      <SummaryCard 
        label="Deductible Amount" 
        value={`₱${summary?.deductible_total}`}
      />
      <SummaryCard 
        label="Estimated Tax Savings" 
        value={`₱${summary?.tax_benefit}`}
        note="Based on 25% tax rate"
      />
      
      {/* Category breakdown chart */}
      <BarChart data={summary?.by_category} />
      
      {/* Monthly trend */}
      <LineChart data={summary?.by_month} />
      
      {/* Export button */}
      <Button onClick={exportToCSV}>Export for Tax Filing</Button>
    </div>
  );
}
```

---

### TRACK 4: BANK RECONCILIATION (Priority: MEDIUM)
**Owner:** Backend engineer (integrations expert)  
**Timeline:** 3.5 weeks  
**Status:** Phase 2 feature, high accountant value  

#### 4.1 Bank Integration Architecture

**Choose Plaid (recommended for Philippines):**
- Supports: BPI, BDO, Metabank (via Plaid)
- Cost: $1-3 per account/month
- Security: Industry-standard encryption

**Setup Plaid:**

```javascript
// backend/.env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENVIRONMENT=production (or sandbox for testing)

// backend/services/plaidClient.js
const { Configuration, PlaidApi, PlaidEnvironments } = require('plaid');

const configuration = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID,
      'PLAID-SECRET': process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

module.exports = plaidClient;
```

#### 4.2 Database Schema

```javascript
CREATE TABLE IF NOT EXISTS bank_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL (encrypted),
  plaid_item_id TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL (encrypted),
  last_sync TEXT,
  sync_status TEXT DEFAULT 'active',
  error_message TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  vendor TEXT,
  date TEXT NOT NULL,
  description TEXT,
  matched_to_expense_id TEXT,
  matched_to_invoice_id TEXT,
  status TEXT DEFAULT 'unmatched', -- 'unmatched', 'matched', 'reconciled'
  match_confidence REAL DEFAULT 0, -- 0-1
  FOREIGN KEY (connection_id) REFERENCES bank_connections(id),
  FOREIGN KEY (matched_to_expense_id) REFERENCES expenses(id)
);

CREATE INDEX idx_transactions_date ON bank_transactions(date);
CREATE INDEX idx_transactions_status ON bank_transactions(status);
CREATE INDEX idx_transactions_vendor ON bank_transactions(vendor);
```

#### 4.3 API Endpoints

```
POST /api/bank/link-token
├─ Returns: Plaid link token (for frontend integration)
├─ Frontend uses this to show bank selection UI
└─ User selects bank and logs in (Plaid handles securely)

POST /api/bank/set-access-token
├─ Payload: { public_token } (from Plaid after user login)
├─ Exchanges for access_token (backend to Plaid)
├─ Stores: bank_connections record
├─ Fetches: Initial transactions (last 90 days)
└─ Returns: Success + connection details

GET /api/bank/transactions
├─ Query params: { start_date, end_date, status }
├─ Returns: bank_transactions with match status
   {
     unmatched: 15,
     matched: 48,
     reconciled: 48,
     transactions: [
       {
         date: '2026-08-25',
         vendor: 'Starbucks',
         amount: -150,
         status: 'matched',
         matched_to: 'Expense #123'
       }
     ]
   }

POST /api/bank/reconcile
├─ Payload: { transaction_id, matched_to, type }
├─ type: 'expense' | 'invoice' | 'transfer'
├─ Updates: bank_transactions.status = 'reconciled'
└─ Returns: Updated transaction

GET /api/bank/sync
├─ Manual sync trigger (fetches latest transactions)
├─ Auto-run nightly at 2am
└─ Returns: Sync status + new transaction count

POST /api/bank/disconnect
├─ Revokes Plaid access token
├─ Deletes: bank_connections record
└─ Keeps: bank_transactions (for history)
```

#### 4.4 Matching Algorithm

```javascript
// backend/services/transactionMatcher.js

class TransactionMatcher {
  matchTransaction(bankTx) {
    let bestMatch = null;
    let bestScore = 0;
    
    // Try matching to invoices first
    const invoices = this.getRecentInvoices(bankTx.date);
    invoices.forEach(invoice => {
      const score = this.scoreMatch(bankTx, invoice);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { type: 'invoice', id: invoice.id, score };
      }
    });
    
    // Try matching to expenses
    const expenses = this.getRecentExpenses(bankTx.date);
    expenses.forEach(expense => {
      const score = this.scoreMatch(bankTx, expense);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { type: 'expense', id: expense.id, score };
      }
    });
    
    return bestScore > 0.7 ? bestMatch : null;
  }
  
  scoreMatch(bankTx, ledgerEntry) {
    let score = 0;
    
    // Amount match (exact = 1.0, within 5% = 0.9, etc.)
    const amountDiff = Math.abs(bankTx.amount - ledgerEntry.amount) / ledgerEntry.amount;
    if (amountDiff === 0) score += 0.4;
    else if (amountDiff < 0.05) score += 0.35;
    else if (amountDiff < 0.1) score += 0.2;
    
    // Date match (within 2 days)
    const dateDiff = Math.abs(
      new Date(bankTx.date) - new Date(ledgerEntry.date)
    ) / (1000 * 60 * 60 * 24);
    if (dateDiff === 0) score += 0.3;
    else if (dateDiff < 2) score += 0.25;
    else if (dateDiff < 5) score += 0.15;
    
    // Vendor match
    if (bankTx.vendor && ledgerEntry.vendor) {
      if (bankTx.vendor.toLowerCase() === ledgerEntry.vendor.toLowerCase()) {
        score += 0.3;
      } else if (this.vendorsSimilar(bankTx.vendor, ledgerEntry.vendor)) {
        score += 0.15;
      }
    }
    
    return Math.min(score, 1.0);
  }
  
  vendorsSimilar(vendor1, vendor2) {
    // Simple similarity check (could use Levenshtein distance)
    const v1 = vendor1.toLowerCase().split(' ');
    const v2 = vendor2.toLowerCase().split(' ');
    const commonWords = v1.filter(w => v2.includes(w));
    return commonWords.length > 0;
  }
}
```

---

### TRACK 5: ANALYTICS & DASHBOARDING (Priority: MEDIUM)
**Owner:** Frontend engineer + analytics person  
**Timeline:** 1.5 weeks  
**Status:** Essential for data-driven decisions  

#### 5.1 Analytics Events

**Install Firebase Analytics:**

```javascript
// frontend/index.js
import { initializeApp } from 'firebase/app';
import { getAnalytics, logEvent } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export for use throughout app
export { analytics, logEvent };
```

**Events to track:**

```javascript
// User lifecycle
logEvent(analytics, 'signup', {
  segment: 'freelancer|accountant|sme',
  source: 'google|facebook|organic|partner',
  timestamp: new Date().toISOString()
});

logEvent(analytics, 'free_to_paid', {
  user_id: userId,
  upgrade_tier: 'micro|starter|pro',
  days_as_free: 14,
  ltv: 2388
});

logEvent(analytics, 'churn', {
  user_id: userId,
  reason: 'too_expensive|not_needed|competitor',
  ltv: 2388,
  arn: 450 // Annual Recurring at churn
});

// Feature usage
logEvent(analytics, 'create_invoice', {
  segment: 'freelancer|accountant|sme'
});

logEvent(analytics, 'upload_receipt', {
  success: true|false,
  ocr_confidence: 0.95
});

logEvent(analytics, 'reconcile_transaction', {
  match_confidence: 0.92,
  manual_review: true|false
});

logEvent(analytics, 'hit_feature_limit', {
  feature: 'invoices|team_members|exports',
  segment: 'freelancer|accountant|sme'
});

// Partner events
logEvent(analytics, 'partner_signup', {
  partner_tier: 'starter|growth|elite'
});

logEvent(analytics, 'refer_client', {
  partner_id: 'xxx',
  success: true|false
});
```

#### 5.2 Backend Analytics Queries

```javascript
// backend/routes/analytics.js

app.get('/api/analytics/growth', authenticateAdmin, (req, res) => {
  const metrics = {
    total_subscriptions: db.prepare(`
      SELECT COUNT(*) as count FROM users WHERE tier != 'free'
    `).get().count,
    
    mrr: db.prepare(`
      SELECT SUM(
        CASE 
          WHEN tier = 'free' THEN 0
          WHEN tier = 'micro' THEN 99
          WHEN tier = 'starter' THEN 199
          WHEN tier = 'pro' THEN 399
          WHEN tier = 'enterprise' THEN 699
        END
      ) as mrr
      FROM users
    `).get().mrr,
    
    new_signups_7d: db.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE created_at > datetime('now', '-7 days')
    `).get().count,
    
    free_to_paid_conversion: db.prepare(`
      SELECT 
        COUNT(*) filter (where upgraded_at IS NOT NULL) as converted,
        COUNT(*) as total,
        CAST(COUNT(*) filter (where upgraded_at IS NOT NULL) AS FLOAT) / COUNT(*) as rate
      FROM users
      WHERE created_at > datetime('now', '-30 days')
    `).get(),
    
    churn_30d: db.prepare(`
      SELECT COUNT(*) as count FROM users
      WHERE deleted_at > datetime('now', '-30 days')
    `).get().count
  };
  
  res.json(metrics);
});
```

#### 5.3 Analytics Dashboard (Frontend)

**Create `/pages/Analytics.jsx`:**

```jsx
export function Analytics() {
  const [metrics, setMetrics] = useState(null);
  
  useEffect(() => {
    fetchMetrics();
  }, []);
  
  return (
    <div className="analytics-dashboard">
      <h1>Growth Dashboard</h1>
      
      <MetricsGrid>
        <MetricCard 
          label="Total Subscriptions"
          value={metrics?.total_subscriptions}
          change="+12% WoW"
        />
        <MetricCard 
          label="Monthly Recurring Revenue"
          value={`₱${metrics?.mrr?.toLocaleString()}`}
          change="+15% WoW"
        />
        <MetricCard 
          label="New Signups (7d)"
          value={metrics?.new_signups_7d}
          change="On pace for 130/mo"
        />
        <MetricCard 
          label="Free → Paid Conversion"
          value={`${(metrics?.free_to_paid_conversion?.rate * 100).toFixed(1)}%`}
          change="Target: 10-15%"
        />
      </MetricsGrid>
      
      <ChartsGrid>
        <SubscriptionTrendChart />
        <MRRTrendChart />
        <ConversionFunnelChart />
        <CohortRetentionChart />
      </ChartsGrid>
    </div>
  );
}
```

---

## IMPLEMENTATION SEQUENCING

### Sprint 1 (Week 1-2)
```
Week 1:
├─ Track 1.1: Free tier schema (3 days)
├─ Track 1.2: Free tier API (2 days)
└─ Track 5.1: Analytics events setup (2 days)

Week 2:
├─ Track 1.3: Free tier frontend (3 days)
├─ Track 2.1: Partner schema (2 days)
└─ Testing & bug fixes (2 days)
```

### Sprint 2 (Week 3-4)
```
Week 3:
├─ Track 2.2: Partner API (3 days)
├─ Track 2.3: Commission calculation (2 days)
└─ Track 3.1: Expense schema & API (2 days)

Week 4:
├─ Track 2.4: Partner portal (2 days)
├─ Track 3.2: Expense frontend (2 days)
├─ Track 3.3: Receipt OCR integration (2 days)
└─ Testing (1 day)
```

### Sprint 3 (Week 5-6)
```
Week 5:
├─ Track 4.1: Plaid integration setup (2 days)
├─ Track 4.2: Bank transaction schema (1 day)
├─ Track 4.3: Bank API endpoints (3 days)
└─ Testing (1 day)

Week 6:
├─ Track 4.4: Matching algorithm (2 days)
├─ Track 4.5: Bank reconciliation UI (2 days)
├─ Track 5.2: Analytics queries (2 days)
└─ Testing & optimization (1 day)
```

### Weeks 7-12: Optimization & Launch
```
├─ Performance testing
├─ Security audit
├─ User acceptance testing (with beta partners)
├─ Marketing asset creation
├─ Training docs + partner resources
└─ Production deployment
```

---

## TECHNICAL DEPENDENCIES

### External Services
- **Plaid** (for bank connections)
- **Google Vision API** (for OCR)
- **Firebase Analytics** (for tracking)
- **AWS S3** (for receipt storage)

### Team Requirements
- 1 Frontend engineer (UI/UX focus)
- 1 Backend engineer (API/integrations)
- 1 Integrations engineer (Plaid/OCR setup)
- 1 Product manager (requirements + QA)
- 1 QA engineer (full testing)

---

## SUCCESS CRITERIA

### By end of Week 2 (Free Tier Launch)
- ✅ Free tier live
- ✅ 500+ free signups
- ✅ 10%+ free → paid conversion
- ✅ Analytics dashboard shows live data

### By end of Week 4 (Partner Program Launch)
- ✅ 20+ accountant partners signed up
- ✅ 50+ referred clients (from partners)
- ✅ Expense tracking live
- ✅ Commission system calculating correctly

### By end of Week 6 (Full Feature Launch)
- ✅ Bank reconciliation live (beta)
- ✅ All analytics metrics visible
- ✅ Partner dashboard working
- ✅ No critical bugs

### 90-day Goal
- ✅ 2,000+ total subscriptions
- ✅ ₱300K+ MRR
- ✅ 100+ accountant partners
- ✅ 500+ partner-referred clients

---

## TESTING CHECKLIST

### Unit Tests
- [ ] Free tier limits enforced correctly
- [ ] Commission calculation accurate
- [ ] OCR extraction working
- [ ] Transaction matching algorithm

### Integration Tests
- [ ] Free → Paid signup flow end-to-end
- [ ] Partner referral tracking
- [ ] Bank sync and reconciliation
- [ ] All API endpoints working

### E2E Tests
- [ ] Full user journey (free signup → upgrade → use expense tracking)
- [ ] Full partner journey (partner signup → add clients → earn commissions)
- [ ] Full accountant journey (connect bank → reconcile → generate reports)

### Performance Tests
- [ ] Signup page loads <2s
- [ ] Dashboard renders <3s (even with 1000+ transactions)
- [ ] OCR processing <10s per receipt
- [ ] Bank sync completes <30s

---

## DEPLOYMENT PLAN

### Phase 1: Beta (Week 7-8)
```
Deploy to staging environment
├─ 20 beta partners test
├─ Gather feedback
└─ Fix critical bugs
```

### Phase 2: Gradual Rollout (Week 9-10)
```
Deploy to production with feature flags
├─ 10% of users → see free tier option
├─ 10% → see partner dashboard
├─ Monitor errors + user behavior
└─ Expand to 50% after 2 days
```

### Phase 3: Full Launch (Week 11-12)
```
100% production deployment
├─ Email all users: "New features available"
├─ Blog post: Feature announcement
├─ Partner webinar: How to refer clients
└─ Monitor closely for first 2 weeks
```

---

## MONITORING & SUPPORT

### Daily Checks
- Error rate <0.1%
- API response time <500ms
- Feature adoption rate
- New signups trending

### Weekly Checks
- Conversion rate by segment
- Partner activation rate
- Churn trends
- Top customer issues

### Monthly Checks
- MRR growth vs target
- CAC vs LTV ratio
- Feature impact on retention
- Technical debt assessment

---

**Prepared by:** Growth & Marketing Strategy  
**Date:** 2026-08-30  
**Approval:** [Awaiting PO signature]

---

