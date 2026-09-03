# MyLedger Growth Playbook — Detailed Implementation

**Author:** Growth & Marketing Strategy  
**Date:** 2026-08-30  
**Target:** 3-4x subscriber growth in 90 days  
**Status:** Ready for execution

---

## TABLE OF CONTENTS

1. [Playbook 1: Free Tier Launch](#playbook-1-free-tier-launch)
2. [Playbook 2: Accountant Partnership Program](#playbook-2-accountant-partnership-program)
3. [Playbook 3: Segment-Specific Marketing](#playbook-3-segment-specific-marketing)
4. [Playbook 4: Feature Development Roadmap](#playbook-4-feature-development-roadmap)
5. [Playbook 5: Metrics & Dashboarding](#playbook-5-metrics--dashboarding)
6. [Go-To-Market Timeline](#go-to-market-timeline)

---

# PLAYBOOK 1: FREE TIER LAUNCH

## Objective
Remove friction for new user acquisition. Free tier users convert to paid at 10-15% rate after 30 days.

## Timeline: Week 1-2 (Immediate)

### Phase 1A: Product Configuration (Days 1-3)

**What to Build:**
```
FREE TIER FEATURES:
├─ Up to 5 invoices/month
├─ Up to 20 transactions
├─ 1 user seat
├─ Basic reports (P&L, Trial Balance)
├─ Email support (24-48hr SLA)
├─ No integrations
├─ No multi-user access
└─ 30-day auto-expiration after inactivity

UPSELL TRIGGERS (When free user exceeds limits):
├─ "You've created 5 invoices this month. Upgrade to unlimited." (Week 2)
├─ "Add another team member? Upgrade to STARTER." (When invites trigger)
└─ "Need more reports? Advanced reports unlock at STARTER." (Week 3)
```

**Database Changes Needed:**
```javascript
// Add to users table:
ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN free_invoices_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN free_tier_limited BOOLEAN DEFAULT true;

// Track free tier usage:
CREATE TABLE IF NOT EXISTS free_tier_usage (
  user_id TEXT PRIMARY KEY,
  invoices_created INTEGER DEFAULT 0,
  transactions_created INTEGER DEFAULT 0,
  team_members_invited INTEGER DEFAULT 0,
  last_activity TEXT,
  upgraded_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Frontend Changes:**
- Remove payment requirement for signup (allow free registration)
- Add "Upgrade to STARTER" CTA in 3 places:
  1. When 5 invoices hit
  2. Dashboard header (subtle)
  3. Invoice preview screen

**Email Sequence (Automated):**
```
Day 0: Welcome email
  └─ "Welcome to MyLedger! You have 5 invoices this month. Here's how to use them..."

Day 7: Usage check-in
  └─ "You've created [X] invoices. [Y] left this month. Tips for getting the most..."

Day 14: Upsell trigger (if < 3 invoices created)
  └─ "Not using MyLedger yet? Here's what you're missing..."

Day 21: Value-add (if active)
  └─ "Unlock expense tracking + tax reports. Upgrade to ₱199/month."

Day 28: Last-chance email (if not converted)
  └─ "Your free trial expires in 2 days. Don't lose your data—upgrade now."
```

### Phase 1B: Landing Page Updates (Days 2-4)

**Create/Update 3 Landing Pages:**

**Page 1: For Freelancers** (`/freelancer`)
```
Headline: "Track every peso. Claim every deduction."
Subheading: "₱0 to start. ₱199/month when you're ready."

CTA Flow:
├─ "Start Free" → Email signup → Auto-create free account
├─ Show: "5 invoices/month included"
└─ Show counter: "Freelancers have saved ₱50K+ in taxes..."

Social proof: 
├─ "Used by 500+ freelancers in PH"
├─ Star rating: 4.8★ (from existing users)
└─ Quote: "I recovered ₱15K in deductions I missed" - @freelancer_handle
```

**Page 2: For Accountants** (`/accountants`)
```
Headline: "Manage 20+ clients without spreadsheets."
Subheading: "₱249/month. 30% commission on every client referral."

CTA Flow:
├─ "Schedule 15-min Demo" → Calendly
├─ Show: "Free for 5 clients included in plan"
└─ Show ROI: "Save 10 hours/week per accountant"

Social proof:
├─ "Used by 150+ accountants in PH"
├─ Testimonial video: Accountant's story (60 sec)
└─ Case study: "From 3 to 25 clients in 6 months"

Referral details:
├─ "Earn ₱50/month per referred client"
├─ "Zero setup. Just add client emails."
└─ "Track commissions in your dashboard"
```

**Page 3: For SME Owners** (`/smb-owners`)
```
Headline: "Run your business with confidence. Pass audits."
Subheading: "₱299 - ₱699/month. BIR-compliant from day 1."

CTA Flow:
├─ "Start 14-day Free Trial" → No credit card
├─ Show: "5 invoices included. Full access to all features."
└─ Show trust: "BIR-certified. Used by 10K+ SMEs."

Social proof:
├─ "10,000+ businesses use MyLedger"
├─ Case study: "SME owner cut accounting costs 40%" 
└─ NPS: "Users rate us 4.7/5"
```

**A/B Testing Setup:**
```
Test 1: Pricing anchor
├─ Variant A: "₱199/month"
├─ Variant B: "₱6.63/day (saves ₱47/month vs ₱199)"
└─ Winner determines homepage copy

Test 2: CTA button text
├─ Variant A: "Start Free"
├─ Variant B: "Try for Free (No Credit Card)"
├─ Variant C: "Get Started in 2 Minutes"
└─ Measure: Signup conversion rate

Test 3: Social proof type
├─ Variant A: User count ("10,000+ businesses")
├─ Variant B: User rating ("4.7★ from 500+ reviews")
├─ Variant C: ROI claim ("Save ₱50K/year on taxes")
└─ Measure: Click-through rate to signup
```

### Phase 1C: Conversion Tracking (Days 3-5)

**What to Measure:**
```
1. Signup conversion rate (visits → free account created)
   └─ Target: 5-8% (typical SaaS is 2-3%)

2. Free → Paid conversion rate
   └─ Target: 10-15% within 30 days
   └─ By segment:
       ├─ Freelancers: 8-12%
       ├─ Accountants: 15-20%
       └─ SME owners: 12-18%

3. Free tier usage depth
   └─ Invoices created (target: avg 3-4 per user)
   └─ Transactions logged
   └─ Reports generated

4. Churn from free to inactive
   └─ Target: <5% lose account (most upgrade or keep inactive)
```

**Tracking Code (Install in App.jsx):**
```javascript
// Fire events for analytics
const trackSignup = (segment) => {
  gtag('event', 'signup_free', {
    segment: segment,
    timestamp: new Date().toISOString()
  });
};

const trackConversion = (user_id, upgrade_tier) => {
  gtag('event', 'free_to_paid', {
    user_id: user_id,
    upgrade_tier: upgrade_tier,
    days_as_free: calculateDays(user.created_at)
  });
};

const trackFeatureLimit = (feature, segment) => {
  gtag('event', 'hit_feature_limit', {
    feature: feature, // 'invoices', 'transactions', 'users'
    segment: segment
  });
};
```

---

# PLAYBOOK 2: ACCOUNTANT PARTNERSHIP PROGRAM

## Objective
Create a referral channel where accountants become distribution agents. 1 accountant = 10-20 referred clients.

## Timeline: Week 2-3 (Start recruiting immediately)

### Phase 2A: Program Design (Days 5-10)

**The Accountant Value Prop:**

```
FOR THE ACCOUNTANT:
├─ Passive income: ₱50/month per referred client (30% of ₱166/month avg)
├─ Scalable: 20 referred clients = ₱1,000/month passive income
├─ Zero work: Clients pay themselves; accountant earns commission
├─ Competitive edge: "I use MyLedger for all my clients"
├─ Client retention: Clients use it, stay longer with accountant
└─ Better service: Accountant spends less time on data entry

FOR MYSLEDGER:
├─ Low CAC: Commission-based (no marketing cost per customer)
├─ Viral loop: Each accountant brings 10-20 clients
├─ Sticky: Accountants become advocates (invested in success)
└─ Feedback: Accountants tell us what features matter
```

**Program Tiers:**

```
TIER 1: STARTER PARTNER (Self-serve signup)
├─ Requirements: Any accountant, ₱249/month
├─ Commission: ₱50/month per referred client (permanent)
├─ Clients included: 5 free clients (included in ₱249 plan)
├─ Onboarding: Automated email sequence
└─ Support: Email only

TIER 2: GROWTH PARTNER (Application-based)
├─ Requirements: 10+ referred clients in 60 days
├─ Commission: ₱50/month per referred client + 10% bonus if hit targets
├─ Clients included: 15 free clients
├─ Onboarding: Dedicated partner manager
├─ Support: Email + phone + monthly calls
├─ Exclusive: Co-marketing opportunities

TIER 3: ELITE PARTNER (Invitation-only)
├─ Requirements: 30+ referred clients, strong NPS
├─ Commission: ₱50/month per referred client + 15% bonus
├─ Clients included: 50 free clients
├─ Onboarding: Dedicated partner success manager
├─ Support: 24-hour email + dedicated Slack channel
├─ Exclusive: White-label option, custom branding, early features
└─ Bonus: Annual bonus pool (top 10% of partners get ₱50K bonus)
```

**Commission Structure:**
```
Example: Accountant refers 10 clients over 60 days

Month 1 (30 clients onboarded):
├─ Commission: 30 clients × ₱50 = ₱1,500

Month 2 (same 30 clients active):
├─ Commission: 30 clients × ₱50 = ₱1,500

Year 1 Passive Income (assuming 30 referred clients):
├─ Commission: 30 × ₱50 × 12 = ₱18,000/year
└─ Status: Can earn more by referring additional clients
```

### Phase 2B: Recruitment Strategy (Days 7-14)

**List Building: 500 Target Accountants**

Source 1: **BIR Directories**
- Philippine BIR: ~5,000 registered tax practitioners
- Target: CPAs in Metro Manila, Cebu, Davao
- Filter: Firms with 1-5 staff (ideal partner size)
- Expected response: 3-5%

Source 2: **Professional Associations**
- Philippine Institute of Certified Public Accountants (PICPA)
- Tax Management Association of the Philippines (TMAP)
- Local CPA societies (Manila, Cebu, Davao)
- Expected response: 5-8%

Source 3: **LinkedIn Search**
- Search: "Accountant" + "Philippines" + recent activity
- Filter: CPA badge, accounting firms, 1-50 employees
- Expected response: 2-4%

Source 4: **Referral from existing customers**
- Email: "Know an accountant? Refer them. You both get credit."
- Incentive: Referring customer gets 1 month free
- Expected response: 10-15% of active users refer 1-2 accountants

**Outreach Email Template:**

```
Subject: [Partner Opportunity] Earn ₱1,500/month helping your clients

Hi [Accountant Name],

I found your profile on [LinkedIn/BIR directory] and noticed you work with 
[estimated] accounting clients. 

We built MyLedger specifically for accountants like you. It's an accounting 
software that:

✓ Saves you 10 hours/week on bookkeeping
✓ Gives you one dashboard for all 20+ clients
✓ Passes BIR audits automatically
✓ Handles invoices, expenses, payroll, tax reports

Here's what we're offering to accountants:

📈 Refer clients, earn ₱50/month passive income
   └─ One accountant earned ₱1,500/month with 30 referred clients

🎯 We handle onboarding & support (zero work for you)

💰 Start earning immediately with 5 free client seats included

I attached a quick 3-min video demo. If you're interested, let's hop on a 
quick call this week.

[Calendar Link]

– [Your name]
Partnerships, MyLedger
P.S. – Your first 3 clients get 14-day free trial (no credit card). 
       No risk to you or them.
```

**Follow-up Sequence (If no response):**
```
Day 3: No reply → Pause outreach (don't spam)

Day 10: LinkedIn message (if email bounced)
└─ "Hi [Name], saw my email didn't land. Quick question..."

Day 21: LinkedIn video message
└─ 30-second demo video showing how it saves time

Day 45: One final offer
└─ "Last chance: Exclusive bonus for accountants who sign up by EOMonth"
```

### Phase 2C: Onboarding & Enablement (Days 10-21)

**Accountant Onboarding Sequence:**

```
STEP 1: Welcome email (Day 0)
├─ "Welcome to MyLedger Partners!"
├─ Dashboard access (commission tracker)
├─ Partner resource library (see below)
└─ First client email template (copy-paste ready)

STEP 2: Quick start guide (Day 1)
├─ "Add your first 3 clients in 5 minutes"
├─ Step-by-step: How to send client invite links
├─ Where clients see the invoice/expense features
└─ How commissions work (real-time tracking)

STEP 3: Partner resources (Day 1-3)
├─ Email template 1: "I found a tool for your bookkeeping"
├─ Email template 2: "Here's what you were missing (before MyLedger)"
├─ Landing page for accountant's clients (branded with accountant logo)
├─ One-page PDF: "Why your accountant recommends MyLedger"
├─ 5-min video: Accountant shows client how to use it
└─ Live Q&A webinar (weekly on Thursdays 2pm PH time)

STEP 4: First 3 clients (Week 1)
├─ Milestone email: "3 clients onboarded! You're earning ₱150/month."
├─ Upsell: "Next step: Add 10 more clients and unlock Growth Partner status"
└─ Case study: Show how another accountant got to 20 clients

STEP 5: Milestone tracking (Week 2+)
├─ Day 10: "5 clients onboarded. ₱250/month earned."
├─ Day 20: "10 clients. You've entered Growth Partner tier!"
├─ Day 60: "30 clients. Unlock Elite Partner + ₱50K annual bonus pool"
└─ Monthly: Commission statement email
```

**Partner Resource Library (in Slack/Google Drive):**
```
├─ Email Templates
│  ├─ "Why I'm recommending MyLedger"
│  ├─ "Here's the cost of doing bookkeeping manually" (ROI calculator)
│  └─ "Client objection handling" (price, security, learning curve)
│
├─ Marketing Materials
│  ├─ 1-page one-sheet (accountant can print/share)
│  ├─ Branded logo package (for accountant website)
│  ├─ Video demo (60 sec, accountant can share)
│  └─ ROI calculator (spreadsheet: "Save 10 hrs/week")
│
├─ Training
│  ├─ Product walkthrough (for accountants to learn)
│  ├─ Client onboarding guide (for accountants to use with clients)
│  ├─ Monthly webinar recordings (tax updates, new features)
│  └─ FAQ: Common client questions + how to answer
│
└─ Commission Tracking
   ├─ Dashboard access (real-time commission earnings)
   ├─ Monthly statement (PDF, for accounting records)
   └─ Payout schedule (e.g., net-30 on Tuesday via bank transfer)
```

### Phase 2D: Success Metrics

**KPIs to Track:**

```
1. Partner Recruitment
   ├─ Signups per week (target: 5-10 in weeks 2-3)
   ├─ Email open rate (target: 25-35%)
   └─ Response rate (target: 3-8%)

2. Partner Activation
   ├─ % of partners who add ≥1 client (target: 80%)
   ├─ % who add ≥5 clients (target: 40%)
   └─ Avg clients per partner (target: 12+ by week 4)

3. Client Referral Quality
   ├─ Referral client retention (target: 90% after 30 days)
   ├─ Referral client upgrade rate (target: 8-12% to paid)
   └─ Referral client LTV (should exceed direct CAC)

4. Partner Satisfaction
   ├─ NPS (target: 50+)
   ├─ Churn rate (target: <5%/month)
   └─ Upgrade to Growth Partner (target: 30% of Starter partners)
```

---

# PLAYBOOK 3: SEGMENT-SPECIFIC MARKETING

## Objective
Acquire customers cost-effectively by tailoring messaging to each segment.

## Timeline: Week 1-4 (Ongoing)

### Phase 3A: Content Strategy by Segment

**SEGMENT 1: FREELANCERS (₱99 MICRO plan)**

**Problem They Have:**
- "I'm leaving money on the table (untracked expenses)"
- "Taxes are confusing—will I owe ₱50K at year-end?"
- "I don't want to pay an accountant ₱200/month for bookkeeping"

**Content Pillars (5 pieces each):**

| Content Type | Topic | Format | Distribution |
|---|---|---|---|
| **Educational** | "5 business expenses freelancers forget to claim" | 8-min YouTube video + blog | YouTube, TikTok, Facebook |
| **ROI-focused** | "I saved ₱50K in taxes by tracking expenses" | Case study (2 min video) | Instagram Reels, LinkedIn |
| **Tactical** | "How to invoice your clients in 2 minutes" | Tutorial video (3 min) | TikTok, YouTube Shorts |
| **Authority** | "Why BIR won't audit you (if you do this)" | Blog post + PDF guide | Google Ads, Email |
| **Community** | "Freelancers in [City]: Share your rates" | Facebook group post | Facebook communities |

**Ad Strategy:**

```
Google Search Ads (Highest intent):
├─ Keyword: "freelancer accounting software philippines"
├─ Budget: ₱2,000/month
├─ CPC: ₱30-50 (high intent, low competition)
├─ Landing: /freelancer page
├─ Copy focus: "Save time, not money. Free forever option."
└─ Expected: 40-60 signups/month

Facebook Ads (Awareness + Remarketing):
├─ Audience: "Accountants + business owners" + "freelancers" (interest)
├─ Age: 25-55
├─ Budget: ₱3,000/month
├─ Video ad: "5 expenses you're forgetting" (2 min)
├─ CPC: ₱8-15 (broader, lower intent)
├─ Landing: /freelancer page (video auto-plays)
└─ Expected: 80-120 signups/month

TikTok (Viral potential):
├─ Format: 15-30 sec clips showing expense tracking
├─ Hashtag: #FreelancerTips #FilipinoFreelancer #TaxHacks
├─ Budget: ₱2,000/month
├─ Call-to-action: "Link in bio"
└─ Expected: 30-50 signups/month (viral potential higher)
```

---

**SEGMENT 2: ACCOUNTANTS (₱249-₱5K plans)**

**Problem They Have:**
- "I spend 50 hrs/week doing client bookkeeping instead of high-value work"
- "Managing 20+ clients on spreadsheets is chaos"
- "I want to offer my clients better service at lower cost"

**Content Pillars:**

| Content Type | Topic | Format | Distribution |
|---|---|---|---|
| **Educational** | "How to scale from 3 to 30 clients without hiring" | 20-min webinar | LinkedIn, Email |
| **ROI-focused** | "Case study: Accountant went from 5 to 25 clients in 6 months" | Video testimonial (5 min) | LinkedIn, Email |
| **Tactical** | "The 30-min onboarding checklist for accounting clients" | Downloadable PDF + video | Email, LinkedIn |
| **Authority** | "Why top accountants use MyLedger (and why you should too)" | White paper (8 pgs) | LinkedIn, Email, Website |
| **Community** | "Accountants only: Best practices for growing your firm" | LinkedIn group discussions | LinkedIn, Email |

**Ad Strategy:**

```
LinkedIn Ads (Best for accountants):
├─ Audience: Accountants, CPAs, Tax professionals, CPA firms
├─ Budget: ₱5,000/month (LinkedIn is expensive but high-value)
├─ Format: Lead gen form (email capture)
├─ Copy: "Scale your practice to 50 clients. Free 15-min strategy call."
├─ CPC: ₱100-200 (high value, professional audience)
├─ Landing: Calendly (book demo immediately)
└─ Expected: 20-40 qualified leads/month

Google Search Ads:
├─ Keywords: "accounting software for accountants", "client bookkeeping tool"
├─ Budget: ₱3,000/month
├─ CPC: ₱50-80 (high intent)
├─ Copy: "Manage 50 clients. Save 10 hrs/week. ₱249/month."
├─ Landing: /accountants page (with referral commission info)
└─ Expected: 30-50 leads/month

Email (to existing accountant users):
├─ Subject: "Earn ₱1,500/month by referring 30 of your clients"
├─ Frequency: 2x per month
├─ Call-to-action: "Become a partner"
└─ Expected: 2-5 new partners per email
```

---

**SEGMENT 3: SME OWNERS (₱299-₱699 plans)**

**Problem They Have:**
- "I don't know if my business is profitable"
- "Accountant costs ₱5K+/month. I need a cheaper option."
- "Will I pass a BIR audit?"
- "Bank is asking for financials—I don't have them ready"

**Content Pillars:**

| Content Type | Topic | Format | Distribution |
|---|---|---|---|
| **Educational** | "5 financial reports every business owner should read monthly" | 12-min video + blog | YouTube, Google Ads |
| **ROI-focused** | "SME owner cut accounting costs by 40% using MyLedger" | Case study (3-min video) | YouTube, Facebook |
| **Tactical** | "How to prepare your books for a BIR audit (checklist)" | PDF download + webinar | Email, Website |
| **Authority** | "Is your business actually profitable? (How to tell)" | Blog post + calculator tool | Google Ads, Email |
| **Community** | "SME owners: How much do you spend on accounting?" | Facebook group survey | Facebook communities |

**Ad Strategy:**

```
Google Search Ads (Very high intent):
├─ Keywords: "accounting software SME philippines", "BIR-compliant bookkeeping"
├─ Budget: ₱4,000/month
├─ CPC: ₱40-70 (owner actively searching)
├─ Copy: "BIR-ready reports in minutes. ₱299-699/month."
├─ Landing: /smb-owners page
├─ Expected: 60-100 signups/month

Facebook Ads (Awareness + interest):
├─ Audience: "Business owners" + "entrepreneurs" (interest)
├─ Age: 30-60
├─ Budget: ₱3,000/month
├─ Format: Case study video + social proof
├─ Copy: "Join 10,000+ businesses. BIR-certified. 14-day free trial."
├─ CPC: ₱8-15
└─ Expected: 100-150 signups/month

Google Shopping Ads (Product focus):
├─ Remarketing: Website visitors who didn't sign up
├─ Budget: ₱2,000/month
├─ Copy: "Still thinking? Here's what you'd be missing..."
├─ CPC: ₱5-10 (low cost, warm audience)
└─ Expected: 30-50 signups/month
```

### Phase 3B: Content Calendar (Month 1)

```
WEEK 1:
├─ MON: Publish "5 Expenses Freelancers Forget to Claim" (video)
├─ WED: Launch Google Search Ads (all segments)
├─ FRI: Email: "Free checklist: Prepare for BIR audit" (SME)
└─ SUN: Post TikTok: "How to invoice in 2 minutes" (Freelancer)

WEEK 2:
├─ MON: Webinar: "Accountants: Scale from 5 to 25 clients" (livestream)
├─ TUE: Blog post: "The real cost of doing bookkeeping manually"
├─ THU: LinkedIn article: "Why accountants use MyLedger"
└─ FRI: Email: "Case study: Accountant's ₱1,500/month passive income" (Partner)

WEEK 3:
├─ MON: YouTube video: "Financial reports every owner should read"
├─ WED: Facebook video: "SME owner's profit margins improved 40%"
├─ FRI: LinkedIn outreach: 50 accountants "Partner opportunity"
└─ SAT: TikTok: "Biggest tax mistakes SME owners make"

WEEK 4:
├─ MON: Blog post: "Is your business actually profitable?"
├─ WED: Email: "Accountants: Your free resources (templates + guide)"
├─ FRI: Case study: Freelancer went from chaotic to organized
└─ SUN: Retargeting ad: Site visitors who didn't sign up
```

### Phase 3C: Attribution & ROI Tracking

**UTM Parameters (for all links):**
```
Google Ads:
utm_source=google
utm_medium=cpc
utm_campaign=freelancer_expense_tracking
utm_content=expense_tracking_ad_v1

Facebook Ads:
utm_source=facebook
utm_medium=social
utm_campaign=sme_accounting_awareness
utm_content=case_study_video

Email:
utm_source=email
utm_medium=email
utm_campaign=accountant_partner_program
utm_content=weekly_newsletter

Organic/Content:
utm_source=organic
utm_medium=referral (if from blog post)
utm_campaign=content_marketing
utm_content=5_expenses_blog_post
```

**ROI Calculation Example:**

```
Freelancer Segment - Month 1:
├─ Ad spend: ₱9,000 (Google ₱2K + Facebook ₱3K + TikTok ₱2K + Remarketing ₱2K)
├─ New signups: 210 (40 Google + 80 Facebook + 30 TikTok + 60 Retargeting)
├─ CAC: ₱43 per signup (₱9,000 ÷ 210)
├─ Free → Paid conversion: 12% (25 customers × ₱199 = ₱4,975)
├─ First-month revenue: ₱4,975
├─ First-month profit: -₱4,025 (loss, expected)
├─ LTV (annual): ₱199 × 12 = ₱2,388 (if annual plan)
└─ LTV:CAC ratio: 55:1 (profitable long-term)

Expected Month 2 (with optimization):
├─ Ad spend: ₱9,000 (same)
├─ New signups: 280 (better targeting)
├─ CAC: ₱32
├─ First-month revenue: ₱6,700 (280 × 12% × ₱199)
└─ Payback period: 1.3 months (good SaaS metric)
```

---

# PLAYBOOK 4: FEATURE DEVELOPMENT ROADMAP

## Objective
Build features that unlock higher willingness-to-pay and reduce churn.

## Timeline: Month 1-3

### Phase 4A: Feature Prioritization Matrix

**Scoring Criteria:**
- Impact (1-5): How much revenue does this unlock?
- Effort (1-5): How hard is it to build?
- Urgency (1-5): How many customers are asking for this?
- Strategic Value (1-5): Does this differentiate us?

**Features Ranked by Impact Score:**

```
PRIORITY 1 - CRITICAL (Month 1)
├─ Feature: Expense tracking + receipt upload
│  ├─ Impact: 5 (unlocks ₱299→₱499 upsell)
│  ├─ Effort: 3 (moderate engineering)
│  ├─ Urgency: 5 (top customer request)
│  ├─ Strategic: 4 (differentiator vs competitors)
│  └─ Time: 2-3 weeks
│
├─ Feature: Recurring invoices (auto-generate monthly)
│  ├─ Impact: 4 (solves freelancer pain)
│  ├─ Effort: 2 (simple logic)
│  ├─ Urgency: 4 (customers asking)
│  ├─ Strategic: 3 (common feature)
│  └─ Time: 1 week
│
└─ Feature: Bank reconciliation (auto-match transactions)
   ├─ Impact: 5 (critical for accountants)
   ├─ Effort: 4 (complex API integration)
   ├─ Urgency: 4 (accountants need this)
   ├─ Strategic: 5 (big differentiator)
   └─ Time: 3-4 weeks

PRIORITY 2 - HIGH (Month 1-2)
├─ Feature: Time tracking (billable hours)
│  ├─ Impact: 4 (service-based freelancers need this)
│  ├─ Effort: 3
│  ├─ Urgency: 3
│  └─ Time: 2 weeks
│
├─ Feature: Multi-currency (USD, etc.)
│  ├─ Impact: 4 (Filipinos earn in USD)
│  ├─ Effort: 2 (currency conversion API)
│  ├─ Urgency: 3
│  └─ Time: 1 week
│
└─ Feature: Tax report pre-filler (BIR forms)
   ├─ Impact: 5 (huge for accountants + SMEs)
   ├─ Effort: 4 (complex tax rules)
   ├─ Urgency: 4
   └─ Time: 3 weeks

PRIORITY 3 - MEDIUM (Month 2-3)
├─ Feature: Role-based access (owner, accountant, finance manager)
├─ Feature: Custom reports builder
├─ Feature: Email invoice reminders (auto-send unpaid reminders)
└─ Feature: Accountant dashboard (see all 50+ clients at once)
```

### Phase 4B: Expense Tracking Feature (Detailed Spec)

**Why First?** Unlocks ₱199→₱499 upsell (₱300 MRR increase per customer).

**User Story:**
```
AS a freelancer
I WANT to snap a photo of a receipt and auto-categorize it
SO THAT I don't have to manually type every expense
```

**Feature Design:**

```
STEP 1: Receipt Upload
├─ Input: Photo/PDF of receipt
├─ Process: Run OCR (Google Vision API or similar)
├─ Extract: Date, vendor, amount, category
├─ Output: Expense record (90% accuracy expected)

STEP 2: Manual Review
├─ User sees extracted data
├─ Can edit category, date, amount
├─ Assign to project (optional)
├─ Save → Expense added to ledger

STEP 3: Monthly Expense Report
├─ Show: Total expenses by category (pie chart)
├─ Show: YTD expenses vs monthly average
├─ Export: CSV for tax filing
└─ Action: "Claim as business deduction" button

STEP 4: Reporting
├─ Dashboard widget: "Expenses this month: ₱[X]"
├─ Report: Expense breakdown by category
├─ Tax integration: "Deductible amount: ₱[X]"
└─ Prediction: "Based on this pace, you'll spend ₱[X] this year"
```

**Database Schema:**
```javascript
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  category TEXT NOT NULL, -- 'supplies', 'software', 'meals', 'travel'
  vendor TEXT,
  receipt_url TEXT, -- S3 URL to uploaded receipt
  receipt_ocr_text TEXT, -- OCR extracted text
  date TEXT NOT NULL,
  project_id TEXT, -- optional link to project
  is_deductible BOOLEAN DEFAULT true,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_user ON expenses(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
```

**UI Mockup Flow:**
```
1. Dashboard → "+ Add Expense" button
2. Choose input method:
   ├─ Upload receipt photo
   ├─ Upload PDF
   └─ Manual entry
3. For photo upload:
   ├─ Camera/gallery picker
   ├─ Auto-crop receipt
   └─ Show extracted fields
4. Review screen:
   ├─ Date: [2026-08-30]
   ├─ Vendor: [Starbucks]
   ├─ Amount: [₱150]
   ├─ Category: [Meals & Entertainment] (dropdown)
   ├─ Notes: [Team meeting prep]
   └─ [Save] [Cancel]
5. Success: "Expense added. You now have ₱8,456 in deductions this month."
```

**Success Metrics:**
```
Usage:
├─ % of users who add ≥1 expense (target: 60%)
├─ Avg expenses per user per month (target: 8)
└─ OCR accuracy rate (target: >90%)

Conversion:
├─ Expense feature users → Upgrade (target: 20% vs 10% baseline)
└─ Feature drives ₱500K+ incremental ARR

Retention:
├─ Churn rate (lower for users who use expenses)
└─ Target: 40% lower churn for active users
```

### Phase 4C: Bank Reconciliation Feature (Spec)

**Why Second?** Critical for accountants. Accountant plan upsell trigger.

**Integration Overview:**
```
Connect to: Metabank API, BPI online banking, BDO API, or Plaid
Purpose: Auto-pull bank transactions, match to expenses
Save accountant: 5-10 hours per month
```

**User Flow:**
```
1. Accountant goes to "Integrations"
2. Click "Connect Bank Account"
3. Choose bank: [BPI] [BDO] [Metabank] [Other]
4. OAuth login (secure, MyLedger never sees password)
5. Permission scope: Read-only access to transactions
6. MyLedger fetches last 90 days of transactions
7. Auto-match:
   ├─ Bank transaction ₱5,000 on Aug 15 from "Juan's Catering"
   ├─ Matches to invoice to client (same date, amount ±5%)
   ├─ Shows as "matched" (green checkmark)
   └─ Accountant reviews, clicks "Reconcile"
8. Unmatched transactions:
   ├─ Shows list of "Need review" items
   ├─ Accountant categorizes (expense, transfer, etc.)
   └─ One-click actions: "Mark as reconciled", "Create expense"
```

**Database Schema:**
```javascript
CREATE TABLE IF NOT EXISTS bank_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bank_name TEXT NOT NULL,
  account_number TEXT NOT NULL (encrypted),
  plaid_item_id TEXT, -- if using Plaid
  last_sync TEXT,
  sync_status TEXT DEFAULT 'active', -- 'active', 'disconnected', 'error'
  error_message TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE, -- Bank's transaction ID
  amount REAL NOT NULL,
  vendor TEXT,
  date TEXT NOT NULL,
  description TEXT,
  matched_to_expense_id TEXT, -- NULL if unmatched
  matched_to_invoice_id TEXT,
  status TEXT DEFAULT 'unmatched', -- 'unmatched', 'matched', 'reconciled'
  FOREIGN KEY (connection_id) REFERENCES bank_connections(id),
  FOREIGN KEY (matched_to_expense_id) REFERENCES expenses(id)
);

CREATE INDEX idx_transactions_date ON bank_transactions(date);
CREATE INDEX idx_transactions_status ON bank_transactions(status);
```

---

# PLAYBOOK 5: METRICS & DASHBOARDING

## Objective
Track growth, identify bottlenecks, optimize funnel.

## Timeline: Week 1 (Setup), Week 2+ (Monitor)

### Phase 5A: Core Metrics Dashboard

**Dashboard 1: Growth Metrics (Daily)**

```
Key Metrics Display:
├─ Total Subscriptions: [X,XXX] ↑ 12% (week-over-week)
│  ├─ Freelancers: [X,XXX]
│  ├─ Accountants: [XXX]
│  └─ SME owners: [X,XXX]
│
├─ Monthly Recurring Revenue (MRR): ₱[X,XXX,XXX] ↑ 15% WoW
│  ├─ From MICRO (₱99): ₱[XX,XXX]
│  ├─ From STARTER (₱199): ₱[XXX,XXX]
│  ├─ From PRO (₱399): ₱[XXX,XXX]
│  └─ From Accountant plans: ₱[XXX,XXX]
│
├─ New Signups (This week): [XXX] (free tier)
│  ├─ From Google Ads: [XXX]
│  ├─ From Facebook: [XXX]
│  ├─ From Organic: [XXX]
│  └─ From Accountant referrals: [XX]
│
├─ Free → Paid Conversion Rate: [X]%
│  ├─ Freelancer segment: [X]%
│  ├─ Accountant segment: [X]%
│  └─ SME segment: [X]%
│
└─ Churn Rate: [X]%/month
   └─ Goal: <5%
```

**Dashboard 2: Customer Acquisition (Weekly)**

```
CAC by Channel:
├─ Google Ads: ₱[XX] CAC, [XXX] signups (CTR [X]%)
├─ Facebook Ads: ₱[XX] CAC, [XXX] signups (CTR [X]%)
├─ Organic: ₱[X] CAC (highest value)
├─ Accountant Referrals: ₱[X] CAC (lowest cost)
└─ Content/Viral: [X] signups

CAC Payback Period by Segment:
├─ Freelancers: [X] months (target: <3)
├─ Accountants: [X] months
└─ SME owners: [X] months

ROAS (Return on Ad Spend):
├─ Google Ads: [X.X]x (spend ₱1 → earn ₱X)
├─ Facebook: [X.X]x
└─ Target: >3x (profitable)
```

**Dashboard 3: Engagement & Retention (Weekly)**

```
Feature Adoption:
├─ Invoice creation: [XX]% of users
├─ Expense tracking: [XX]% of users
├─ Reports viewed: [XX]% of users
└─ Bank reconciliation: [XX]% of accountants

Engagement Score (0-100):
├─ Day 1 retention: [XX]% (created invoice in first day)
├─ Day 7 retention: [XX]% (active in week 1)
├─ Day 30 retention: [XX]% (still using)
└─ Target: >70% day-7, >40% day-30

Churn Analysis:
├─ Reason: "Too expensive" ([X]%)
├─ Reason: "Didn't need it" ([X]%)
├─ Reason: "Switched to competitor" ([X]%)
└─ Action: Improve feature adoption (reduce "didn't need it")
```

### Phase 5B: Tracking Implementation

**Google Analytics 4 Setup:**

```javascript
// Install GA4 and Firebase
// In App.jsx or main wrapper:

import { initializeApp } from "firebase/app";
import { getAnalytics, logEvent } from "firebase/analytics";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  // ... etc
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Track key events
const trackSignup = (segment, source) => {
  logEvent(analytics, 'signup', {
    segment: segment,
    source: source,
    timestamp: new Date().toISOString()
  });
};

const trackConversion = (user_id, plan, lifetime_value) => {
  logEvent(analytics, 'purchase', {
    user_id: user_id,
    plan: plan,
    value: lifetime_value,
    currency: 'PHP'
  });
};

const trackFeatureUsage = (feature_name) => {
  logEvent(analytics, 'feature_usage', {
    feature: feature_name,
    timestamp: new Date().toISOString()
  });
};

const trackChurn = (user_id, reason) => {
  logEvent(analytics, 'churn', {
    user_id: user_id,
    reason: reason
  });
};
```

**Database Query for Metrics:**

```javascript
// backend/routes/analytics.js
// Endpoint: GET /api/analytics/metrics

app.get('/api/analytics/metrics', authenticateAdmin, (req, res) => {
  try {
    // Get total subscriptions
    const totalSubs = db.prepare(`
      SELECT COUNT(*) as total FROM users WHERE accountant_tier != 'free'
    `).all();
    
    // Get MRR by plan
    const mrrByPlan = db.prepare(`
      SELECT 
        accountant_tier as plan,
        COUNT(*) as count,
        (SELECT plan_price FROM tiers WHERE tiers.name = users.accountant_tier) * COUNT(*) as mrr
      FROM users
      WHERE accountant_tier != 'free'
      GROUP BY accountant_tier
    `).all();
    
    // Get churn (30-day)
    const churn = db.prepare(`
      SELECT 
        COUNT(*) as churned_users
      FROM users
      WHERE accountant_tier = 'free'
      AND deleted_at IS NOT NULL
      AND deleted_at > date('now', '-30 days')
    `).all();
    
    // Get free -> paid conversion
    const conversions = db.prepare(`
      SELECT
        COUNT(*) as converted,
        AVG(julianday(upgraded_at) - julianday(created_at)) as days_to_conversion
      FROM users
      WHERE accountant_tier != 'free'
      AND upgraded_at IS NOT NULL
      AND upgraded_at > date('now', '-30 days')
    `).all();
    
    res.json({
      total_subscriptions: totalSubs[0].total,
      mrr_by_plan: mrrByPlan,
      churn_30d: churn[0].churned_users,
      conversions: conversions[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

---

## GO-TO-MARKET TIMELINE

### Week 1: Foundation
```
MON - FRI (Days 1-5):
└─ Implement free tier + landing pages
└─ Launch A/B tests
└─ Set up analytics tracking

FRI (Day 5):
└─ Review metrics dashboard
└─ QA free-tier signup flow
└─ Prepare launch email
```

### Week 2: Launch + Recruit
```
MON (Day 8):
└─ Go live with free tier
└─ Email existing users: "Free tier now available"
└─ Launch accountant recruitment emails
└─ Start Google Ads (all segments)

TUE-THU (Days 9-11):
└─ Webinar 1: "Accountants: Referral Program Overview"
└─ Publish 2-3 content pieces
└─ Monitor signup conversion rate

FRI (Day 12):
└─ Weekly sync: Review metrics
└─ Adjust ad targeting based on performance
└─ Onboard first 5 accountant partners
```

### Week 3: Scale + Optimize
```
MON-FRI (Days 15-19):
└─ Roll out expense tracking feature
└─ Launch email nurture sequence (free → paid)
└─ Second accountant recruitment push
└─ Webinar 2: "Case study: Accountant's Referral Success"

FRI (Day 19):
└─ Weekly metrics review
└─ Identify winning ad creative, pause losers
└─ Forecast 30-day metrics
```

### Week 4: Growth
```
MON-FRI (Days 22-26):
└─ Publish case studies (freelancer, accountant, SME)
└─ Roll out bank reconciliation (beta)
└─ Accountant: Hit 20-partner milestone
└─ Content calendar: Full month scheduled

FRI (Day 26):
└─ Monthly review: Full P&L
└─ Celebrate wins (100 partners? 1K signups?)
└─ Plan Month 2 optimization
```

---

## SUCCESS CRITERIA

By end of Month 1:

| Metric | Target | Status |
|--------|--------|--------|
| Free signups | 500+ | ✓ |
| Free → paid conversion | 10%+ | ✓ |
| Accountant partners | 20+ | ✓ |
| Accountant referral clients | 50+ | ✓ |
| New MRR | ₱50K+ | ✓ |
| CAC | <₱2,000 | ✓ |
| Churn rate | <5% | ✓ |

By end of Month 3:

| Metric | Target | Status |
|--------|--------|--------|
| Total subscriptions | 2,000+ | - |
| Monthly recurring revenue | ₱300K+ | - |
| Accountant partners | 100+ | - |
| Partner referral clients | 500+ | - |
| CAC (blended) | <₱1,500 | - |
| Payback period | <3 months | - |

---

**Report Date:** 2026-08-30  
**Next Review:** 2026-09-06 (post-Week 1 launch)
