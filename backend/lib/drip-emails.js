// ─── Trial Drip Email Templates ───────────────────────────────────────────────
// Sent at days 3, 7, 14, 29 of the trial.
// Role-aware: accountants and clients get different content.

const APP_URL = process.env.APP_URL || 'https://app.kaimanco.com';

const header = (accentColor = '#1d4ed8') => `
  <div style="background:${accentColor};padding:20px 28px;border-radius:12px 12px 0 0;display:flex;align-items:center;gap:12px">
    <span style="color:#fff;font-size:22px;font-weight:700;letter-spacing:-0.5px">MyLedger</span>
    <span style="color:rgba(255,255,255,0.7);font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">by Kaiman &amp; Co.</span>
  </div>`;

const footer = (name) => `
  <p style="margin:28px 0 0;font-size:12px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:20px">
    You're receiving this because ${name} has an active MyLedger trial.<br>
    Questions? Reply to this email — we read everything.<br>
    <a href="${APP_URL}" style="color:#6b7280">Open MyLedger</a>
  </p>`;

const wrap = (inner) =>
  `<div style="font-family:-apple-system,Arial,sans-serif;max-width:540px;margin:0 auto;padding:32px 0">${inner}</div>`;

// ── Day 3: Getting started ────────────────────────────────────────────────────
export function dripDay3Accountant({ name }) {
  const html = wrap(`
    ${header()}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">Day 3 of your trial, ${name.split(' ')[0]} 👋</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">
        You've had 3 days with MyLedger. Here's the fastest way to get value from it.
      </p>

      <div style="background:#f0f9ff;border-left:4px solid #1d4ed8;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px">
        <p style="margin:0;font-size:14px;font-weight:700;color:#1e3a8a">Quick Start: 3 steps to your first VAT return</p>
        <ol style="margin:10px 0 0;padding-left:20px;color:#374151;font-size:14px;line-height:1.9">
          <li><strong>Add a client</strong> — Clients tab → + New Client → enter TIN + tax regime</li>
          <li><strong>Enter 3 transactions</strong> — mix of income and expenses with VAT</li>
          <li><strong>Generate BIR 2550M</strong> — BIR Returns tab → Form 2550M → Preview</li>
        </ol>
      </div>

      <p style="margin:0 0 12px;font-size:14px;color:#374151;font-weight:600">💡 The VAT trick most accountants miss:</p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6">
        For <strong>income</strong>, enter the NET amount — MyLedger adds 12% automatically.<br>
        For <strong>expenses</strong>, enter the GROSS amount — MyLedger extracts the NET and VAT.<br>
        Your BIR 2550M fills itself from these entries. Zero manual calculation.
      </p>

      <a href="${APP_URL}/accountant"
        style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700;margin-bottom:8px">
        Open Accountant Portal →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Day 3: Your fastest path to your first BIR return`,
    html,
    text: `Hi ${name},\n\nDay 3 quick start:\n1. Add a client (TIN + tax regime)\n2. Enter 3 transactions (income NET, expense GROSS)\n3. Generate BIR 2550M from BIR Returns tab\n\nOpen MyLedger: ${APP_URL}\n`,
  };
}

export function dripDay3Client({ name }) {
  const html = wrap(`
    ${header('#0f766e')}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">Day 3 with MyLedger, ${name.split(' ')[0]} 👋</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">
        Your books are ready. Here's how to record your first transactions in under 5 minutes.
      </p>

      <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:24px">
        <p style="margin:0;font-size:14px;font-weight:700;color:#14532d">Getting started in 3 steps</p>
        <ol style="margin:10px 0 0;padding-left:20px;color:#374151;font-size:14px;line-height:1.9">
          <li><strong>Add income</strong> — Transactions tab → + Add → Income → enter NET amount</li>
          <li><strong>Add an expense</strong> — same tab → Expense → enter GROSS amount (what you paid)</li>
          <li><strong>Check your Income Statement</strong> — Reports tab → Income Statement</li>
        </ol>
      </div>

      <p style="margin:0 0 12px;font-size:14px;color:#374151;font-weight:600">📊 What you'll see instantly:</p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6">
        MyLedger automatically separates your NET revenue from VAT output — so your income statement shows the right profit, and your BIR forms are always ready.
      </p>

      <a href="${APP_URL}"
        style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700;margin-bottom:8px">
        Open My Dashboard →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Day 3: Record your first transactions (takes 5 min)`,
    html,
    text: `Hi ${name},\n\nGet started:\n1. Add income (NET amount)\n2. Add an expense (GROSS amount)\n3. Check Reports → Income Statement\n\nOpen MyLedger: ${APP_URL}\n`,
  };
}

// ── Day 7: Deeper features ────────────────────────────────────────────────────
export function dripDay7Accountant({ name }) {
  const html = wrap(`
    ${header()}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">One week in — here's what's working for you 🗓️</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">
        Most accountants who stick with MyLedger past day 7 never go back to manual spreadsheets. Here's what they discover in week 1.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px 8px 0 0;vertical-align:top;width:50%">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827">📋 BIR Returns auto-fill</p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">2550M, 2550Q, 2551M, 1601-C, 1601-EQ — populated from your transactions. No manual data entry on the form.</p>
          </td>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-left:none;border-radius:8px 8px 0 0;vertical-align:top">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827">🔔 Deadline reminders</p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">Notification bell + daily 8AM email tells you which BIR forms are due in the next 7 days — for all clients at once.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;vertical-align:top">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827">📊 Accounting books</p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">General Journal, General Ledger, Cash Disbursements, Cash Receipts — all generated from your transactions.</p>
          </td>
          <td style="padding:12px 16px;background:#f9fafb;border:1px solid #e5e7eb;border-top:none;border-left:none;vertical-align:top">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#111827">⌘K Global search</p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">Press Cmd+K (or Ctrl+K) to search transactions across all your clients instantly — by description, amount, or date.</p>
          </td>
        </tr>
      </table>

      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6">
        <strong>Try this now:</strong> Go to BIR Returns → Form 2550M for any client with income transactions. Click Preview — your VAT summary is already there.
      </p>

      <a href="${APP_URL}/accountant"
        style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700">
        Try BIR 2550M Now →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Week 1 with MyLedger: 4 things saving accountants hours every month`,
    html,
    text: `Hi ${name},\n\nWhat accountants discover in week 1:\n- BIR Returns auto-fill from transactions\n- Deadline bell + daily 8AM email\n- General Journal, GL, Cash Books\n- Cmd+K search across all clients\n\nOpen MyLedger: ${APP_URL}\n`,
  };
}

export function dripDay7Client({ name }) {
  const html = wrap(`
    ${header('#0f766e')}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">Week 1 check-in: How are your books? 📊</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">
        If you've been recording transactions, here's something most business owners miss in their first week.
      </p>

      <div style="background:#fffbeb;border:1px solid #fcd34d;padding:16px 20px;border-radius:8px;margin-bottom:24px">
        <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#92400e">💡 The VAT separation that protects your cash</p>
        <p style="margin:0;font-size:14px;color:#78350f;line-height:1.6">
          Every time you record income, MyLedger puts 12% of the NET amount into a <strong>VAT Payable bucket</strong>. That's money you owe BIR — not yours to spend. Your Balance Sheet always shows the exact VAT you'll need to remit.
        </p>
      </div>

      <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#111827">Try Reports → Balance Sheet now:</p>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;line-height:1.6">
        You'll see Input VAT (from expenses — recoverable from BIR), Output VAT (from income — owed to BIR), and your true net position. This is what your accountant reviews every quarter.
      </p>

      <a href="${APP_URL}"
        style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700">
        See My Balance Sheet →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Week 1: The VAT separation that protects your cash flow`,
    html,
    text: `Hi ${name},\n\nKey insight: Every income you record puts 12% VAT into a payable bucket. That's BIR's money — not yours. Check Reports → Balance Sheet to see your exact VAT position.\n\nOpen MyLedger: ${APP_URL}\n`,
  };
}

// ── Day 14: Premium feature showcase ─────────────────────────────────────────
export function dripDay14Accountant({ name }) {
  const html = wrap(`
    ${header()}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">Halfway through your trial, ${name.split(' ')[0]} 🚀</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6">
        You have 16 days left. Here are 5 features your colleagues didn't know existed — until they upgraded.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px">
        ${[
          ['📤 eBIR XML Export', 'Generate the exact XML file BIR\'s eFPS system requires for 2550M, 2550Q, 1601-C, and 1601-EQ. No manual re-entry.'],
          ['📅 Filing Calendar', 'One view of every BIR deadline for all your clients — color-coded by urgency. Never miss a due date.'],
          ['🏢 White-label Branding', 'Add your firm name, logo, and accent color. Your clients see YOUR brand, powered by MyLedger.'],
          ['👥 Encoder Delegation', 'Assign an Encoder role to your staff for data entry — they input transactions, you review and file.'],
          ['💰 Cash Flow Forecast', '30/60/90-day cash flow projections per client — identify potential cash gaps before they happen.'],
        ].map(([title, desc]) => `
          <div style="padding:14px 18px;border-bottom:1px solid #e2e8f0">
            <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827">${title}</p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">${desc}</p>
          </div>`).join('')}
      </div>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#1e40af">Your trial includes all of these right now</p>
        <p style="margin:0;font-size:13px;color:#1e3a8a;line-height:1.5">
          After 30 days, solo and free plans have limits. The Professional plan (₱1,499/mo) keeps everything — 15 clients, all BIR forms, white-label, eBIR export. Firm plan (₱2,999/mo) for unlimited clients.
        </p>
      </div>

      <a href="${APP_URL}/accountant"
        style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700">
        Explore All Features →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Day 14: 5 features you may have missed (your trial ends in 16 days)`,
    html,
    text: `Hi ${name},\n\n16 days left in your trial. Features to try:\n- eBIR XML Export\n- Filing Calendar\n- White-label Branding\n- Encoder Delegation\n- 30/60/90-day Cash Flow Forecasts\n\nOpen MyLedger: ${APP_URL}\n`,
  };
}

export function dripDay14Client({ name }) {
  const html = wrap(`
    ${header('#0f766e')}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">Two weeks in — your 2-week summary 📈</h2>
      <p style="margin:0 0 20px;color:#6b7280;font-size:15px;line-height:1.6">
        16 days left in your trial. Here's what MyLedger is doing behind the scenes for your business.
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px">
        ${[
          ['📊 Real-time Income Statement', 'NET revenue, COGS, OPEX, and net profit — updated every time you add a transaction.'],
          ['🧾 Invoicing', 'Issue official invoices with automatic VAT computation. Share a payment link. Mark as paid. All linked to your books.'],
          ['🔔 BIR Deadline Alerts', 'Never miss a VAT return or quarterly filing — MyLedger notifies you before each deadline.'],
          ['📱 Works on your phone', 'Add transactions from anywhere. Install MyLedger to your home screen (it\'s a web app — no app store needed).'],
        ].map(([title, desc]) => `
          <div style="padding:14px 18px;border-bottom:1px solid #e2e8f0">
            <p style="margin:0 0 2px;font-size:13px;font-weight:700;color:#111827">${title}</p>
            <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">${desc}</p>
          </div>`).join('')}
      </div>

      <a href="${APP_URL}"
        style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700">
        Open My Dashboard →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Day 14: Here's what MyLedger has been doing for your business`,
    html,
    text: `Hi ${name},\n\nTwo weeks in. Features working for you:\n- Real-time Income Statement\n- Invoicing with VAT\n- BIR Deadline Alerts\n- Mobile-friendly (install to home screen)\n\nOpen MyLedger: ${APP_URL}\n`,
  };
}

// ── Day 29: Trial ending ──────────────────────────────────────────────────────
export function dripDay29Accountant({ name }) {
  const html = wrap(`
    ${header()}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">Your trial ends tomorrow, ${name.split(' ')[0]}</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6">
        After midnight, your account switches to the Free plan. Here's what that means — and how to keep everything.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:10px 14px;text-align:left;border:1px solid #e2e8f0;color:#374151">Feature</th>
            <th style="padding:10px 14px;text-align:center;border:1px solid #e2e8f0;color:#374151">Free</th>
            <th style="padding:10px 14px;text-align:center;border:1px solid #e2e8f0;color:#1d4ed8;background:#eff6ff">Professional</th>
            <th style="padding:10px 14px;text-align:center;border:1px solid #e2e8f0;color:#374151">Firm</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ['Clients', '1', '15', 'Unlimited'],
            ['BIR Returns (all forms)', '❌', '✅', '✅'],
            ['eBIR XML Export', '❌', '✅', '✅'],
            ['White-label branding', '❌', '❌', '✅'],
            ['Cash flow forecasting', '❌', '✅', '✅'],
            ['Encoder delegation', '❌', '✅', '✅'],
            ['Price', 'Free', '₱1,499/mo', '₱2,999/mo'],
          ].map(([feat, f, p, fm]) => `
            <tr>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#374151">${feat}</td>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#9ca3af;text-align:center">${f}</td>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#1d4ed8;text-align:center;background:#eff6ff;font-weight:600">${p}</td>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#374151;text-align:center">${fm}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e;line-height:1.5">
          <strong>Your data is safe regardless of plan.</strong> All transactions, clients, and reports remain accessible — even on Free. You only lose access to advanced features.
        </p>
      </div>

      <p style="margin:0 0 16px;font-size:14px;color:#374151">
        To upgrade, email <a href="mailto:mym@kaimanco.com" style="color:#1d4ed8">mym@kaimanco.com</a> with your plan choice — we'll activate it within the hour.
      </p>

      <a href="mailto:mym@kaimanco.com?subject=MyLedger%20Upgrade%20Request&body=Hi%2C%20I%27d%20like%20to%20upgrade%20to%20the%20Professional%20plan."
        style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700">
        Request Upgrade →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Your MyLedger trial ends tomorrow — here's what changes`,
    html,
    text: `Hi ${name},\n\nYour trial ends tomorrow. Free plan limits:\n- 1 client only\n- No BIR Returns\n- No eBIR XML export\n\nProfessional (₱1,499/mo): 15 clients + all features\nFirm (₱2,999/mo): Unlimited clients + white-label\n\nTo upgrade, email mym@kaimanco.com\n\nYour data stays safe regardless of plan.\n`,
  };
}

export function dripDay29Client({ name }) {
  const html = wrap(`
    ${header('#0f766e')}
    <div style="background:#fff;padding:32px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 6px;font-size:20px;color:#111827">Your trial ends tomorrow, ${name.split(' ')[0]}</h2>
      <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6">
        Tomorrow your account moves to the Free plan. Here's a clear picture of what stays and what changes.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:13px">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:10px 14px;text-align:left;border:1px solid #e2e8f0;color:#374151">Feature</th>
            <th style="padding:10px 14px;text-align:center;border:1px solid #e2e8f0;color:#374151">Free</th>
            <th style="padding:10px 14px;text-align:center;border:1px solid #e2e8f0;color:#0f766e;background:#f0fdf4">Starter</th>
            <th style="padding:10px 14px;text-align:center;border:1px solid #e2e8f0;color:#374151">Professional</th>
          </tr>
        </thead>
        <tbody>
          ${[
            ['Transactions', '50/mo', 'Unlimited', 'Unlimited'],
            ['Income Statement', '✅', '✅', '✅'],
            ['Balance Sheet', '✅', '✅', '✅'],
            ['Invoicing', '❌', '✅', '✅'],
            ['BIR Deadline Alerts', '❌', '✅', '✅'],
            ['Cash Flow Forecast', '❌', '❌', '✅'],
            ['Accountant Access', '❌', '✅', '✅'],
            ['Price', 'Free', '₱399/mo', '₱699/mo'],
          ].map(([feat, f, s, p]) => `
            <tr>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#374151">${feat}</td>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#9ca3af;text-align:center">${f}</td>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#0f766e;text-align:center;background:#f0fdf4;font-weight:600">${s}</td>
              <td style="padding:9px 14px;border:1px solid #e2e8f0;color:#374151;text-align:center">${p}</td>
            </tr>`).join('')}
        </tbody>
      </table>

      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:14px 18px;margin-bottom:24px">
        <p style="margin:0;font-size:13px;color:#92400e">
          <strong>Your data is always safe.</strong> All transactions and reports remain — only feature access changes.
        </p>
      </div>

      <p style="margin:0 0 16px;font-size:14px;color:#374151">
        To upgrade, email <a href="mailto:mym@kaimanco.com" style="color:#0f766e">mym@kaimanco.com</a> with your plan choice.
      </p>

      <a href="mailto:mym@kaimanco.com?subject=MyLedger%20Upgrade%20Request&body=Hi%2C%20I%27d%20like%20to%20keep%20using%20MyLedger%20on%20the%20Starter%20plan."
        style="display:inline-block;background:#0f766e;color:#fff;text-decoration:none;padding:13px 28px;border-radius:9px;font-size:14px;font-weight:700">
        Request Upgrade →
      </a>
      ${footer(name)}
    </div>`);

  return {
    subject: `Your MyLedger trial ends tomorrow — keep your books going`,
    html,
    text: `Hi ${name},\n\nYour trial ends tomorrow. Starter plan (₱399/mo): unlimited transactions + invoicing + BIR alerts.\n\nTo upgrade, email mym@kaimanco.com\n\nYour data stays safe regardless.\n`,
  };
}

/**
 * Get the right drip email for a user at a given milestone day.
 * @param {number} day — 3, 7, 14, or 29
 * @param {object} user — rowToUser() result
 */
export function getDripEmail(day, user) {
  const isAccountant = user.role === 'accountant';
  const ctx = { name: user.name || user.email };

  switch (day) {
    case 3:  return isAccountant ? dripDay3Accountant(ctx)  : dripDay3Client(ctx);
    case 7:  return isAccountant ? dripDay7Accountant(ctx)  : dripDay7Client(ctx);
    case 14: return isAccountant ? dripDay14Accountant(ctx) : dripDay14Client(ctx);
    case 29: return isAccountant ? dripDay29Accountant(ctx) : dripDay29Client(ctx);
    default: return null;
  }
}
