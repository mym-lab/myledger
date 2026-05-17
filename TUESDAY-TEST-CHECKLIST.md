# MyLedger — Tuesday Deployment Test Checklist
Run these tests in order before opening to real users.
Use an **incognito window** for each role so sessions don't mix.

---

## 🟢 STEP 1 — Health Check (30 seconds)
Open in browser:
```
https://app.kaimanco.com/api/health
```
Expected: `{"status":"ok","app":"MyLedger",...}`

---

## 🟢 STEP 2 — Admin Login
1. Go to `https://app.kaimanco.com/admin`
2. Log in with `mym@kaimanco.com` + your admin password
3. You should see the **CommandCenter** with ADMIN badge in header
4. Check all tabs load: Overview, Upgrade Requests, Clients, Users, Settings

**Verify in admin:**
- [ ] All existing users visible in Users tab
- [ ] All existing clients visible in Clients tab
- [ ] Upgrade Requests tab shows any pending requests

---

## 🟢 STEP 3 — Client Flow (new incognito window)
1. Go to `https://app.kaimanco.com`
2. Click **Sign Up** → fill in name, email, password, role = **Client**
3. Complete the onboarding wizard (4 slides, click Next)
4. You land on **ClientInterface** — should show "Set Up Your Business"

**Business Setup:**
- [ ] Fill in Trade Name, TIN, select tax regime
- [ ] Click Save — business is created, no session logout
- [ ] Dashboard shows Overview tab with empty state

**Add a transaction:**
- [ ] Go to Transactions tab → click Add Transaction
- [ ] Type: Income, Amount: 10000, Description: "Test Sale"
- [ ] Save — shows NET ₱10,000 / VAT ₱1,200 / GROSS ₱11,200

**Add an expense:**
- [ ] Add Transaction → Type: Expense, Amount (GROSS): 11200, Description: "Office Supplies"
- [ ] Save — shows NET ₱10,000 / VAT ₱1,200 / GROSS ₱11,200

**Reports (Starter tier or above):**
- [ ] Income Statement shows Revenue ₱10,000 / Expense ₱10,000 / Profit ₱0
- [ ] Balance Sheet shows Input VAT ₱1,200 / Output VAT ₱1,200

**Backup:**
- [ ] Business Setup tab → click ⬇ Backup
- [ ] A JSON file downloads — open it and verify it contains transactions, client info

**Delete guard:**
- [ ] Click Delete in Business Setup
- [ ] Confirm modal appears — requires typing the business name
- [ ] Type a wrong name → Delete button stays disabled
- [ ] Type the correct name → Delete button activates (don't click, just verify)
- [ ] Click Cancel to close

---

## 🟢 STEP 4 — Accountant Flow (new incognito window)
1. Go to `https://app.kaimanco.com`
2. Sign Up → role = **Accountant**, fill in name + company
3. Onboarding → land on AccountantPortal
4. Should show "No clients yet" with a free-tier banner

**Upgrade request:**
- [ ] Click Upgrade in the free-tier banner
- [ ] Select Solo plan → fill in payment reference → Submit
- [ ] You receive an email at mym@kaimanco.com with upgrade details

**In admin console:**
- [ ] Upgrade Requests tab shows the new request
- [ ] Approve it → accountant tier updates to Solo

---

## 🟢 STEP 5 — Backup Restore (admin only)
1. Log in as admin at `/admin`
2. Go to **Clients** tab
3. Click **⬆ Restore Backup** button
4. Select the backup JSON downloaded in Step 3
5. Confirm it restores successfully (shows transaction + invoice counts)
6. Verify the restored client appears in the Clients list

---

## 🟢 STEP 6 — Final Admin Verification
Back in CommandCenter:
- [ ] Overview tab: Total Users, Total Clients, Total Transactions all updated
- [ ] Audit Log tab: recent actions logged (signup, transaction created, etc.)
- [ ] Settings tab: pricing values are correct

---

## ✅ GO / NO-GO

| Check | Status |
|-------|--------|
| Health endpoint responds | ⬜ |
| Admin login works | ⬜ |
| Client signup → business setup (no logout) | ⬜ |
| Income + Expense transaction VAT correct | ⬜ |
| Backup downloads with all data | ⬜ |
| Delete confirmation guard works | ⬜ |
| Accountant upgrade email received | ⬜ |
| Backup restore works in admin | ⬜ |
| Railway volume persisting data | ⬜ |

**All 9 checks green = READY FOR TUESDAY** 🚀

---

## 🔧 If anything fails

| Problem | Fix |
|---------|-----|
| Redirected to login after business setup | Set `JWT_SECRET` in Railway Variables |
| Admin console blank / 401 errors | Push latest code, check Railway deploy |
| Backup missing journal entries | Make sure latest code is deployed (new backup v2) |
| Restore fails with "already exists" | Click "Overwrite & Restore" in the warning |
| Email not received | Check RESEND_API_KEY in Railway Variables |
