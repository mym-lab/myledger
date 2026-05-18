// ─── printReport — browser print-to-PDF utility ──────────────────────────────
// Opens a clean print window. User hits Ctrl+P / Cmd+P → Save as PDF.
// No external dependencies required.
//
// Two templates:
//   printReport()   — operational reports (BIR, Books, SLSP) — accent-colored header
//   printFSReport() — financial statements (IS, BS) — SGV-style PFRS layout

const peso = n => '₱' + (n ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt  = n => {
  if (n == null || n === 0) return '—';
  if (n < 0) return `(${peso(Math.abs(n))})`;
  return peso(n);
};

// ─────────────────────────────────────────────────────────────────────────────
// OPERATIONAL REPORT TEMPLATE  (BIR returns, Books, SLSP, etc.)
// ─────────────────────────────────────────────────────────────────────────────
export function printReport({ title, subtitle = '', bodyHtml, firmLabel = 'MyLedger by Kaiman & Co.', accentColor = '#0071e3', printNow = true }) {
  const now = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      color: #1d1d1f;
      background: #fff;
      padding: 32px 40px;
    }
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid ${accentColor};
      padding-bottom: 14px;
      margin-bottom: 24px;
    }
    .report-header-left .firm { font-size: 18px; font-weight: 700; color: ${accentColor}; }
    .report-header-left .report-title { font-size: 14px; font-weight: 600; color: #1d1d1f; margin-top: 4px; }
    .report-header-left .report-sub { font-size: 12px; color: #6e6e73; margin-top: 2px; }
    .report-header-right { text-align: right; font-size: 11px; color: #6e6e73; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th {
      background: #f5f5f7;
      color: #6e6e73;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 12px;
      text-align: left;
      border-bottom: 1px solid #e5e5ea;
    }
    th.num { text-align: right; }
    td {
      padding: 9px 12px;
      border-bottom: 1px solid #f0f0f5;
      font-size: 12px;
      vertical-align: top;
    }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td {
      font-weight: 700;
      border-top: 2px solid #e5e5ea;
      border-bottom: none;
      background: #f5f5f7;
    }
    .stmt-row {
      display: flex;
      justify-content: space-between;
      padding: 9px 0;
      border-bottom: 1px solid #e5e5ea;
      font-size: 13px;
    }
    .stmt-row.bold { font-weight: 700; font-size: 15px; border-bottom: none; padding-top: 12px; }
    .stmt-row .lbl { color: #6e6e73; }
    .stmt-row.bold .lbl { color: #1d1d1f; }
    .stmt-sep { border: none; border-top: 2px solid #e5e5ea; margin: 6px 0; }
    .card-grid { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .card { border: 1px solid #e5e5ea; border-radius: 10px; padding: 14px 18px; flex: 1; min-width: 140px; }
    .card .card-label { font-size: 11px; color: #6e6e73; margin-bottom: 4px; }
    .card .card-value { font-size: 22px; font-weight: 700; }
    .section-head { font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.6px; color: #6e6e73; margin-bottom: 10px; margin-top: 22px; }
    .report-footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #e5e5ea;
      font-size: 10px; color: #aeaeb2; display: flex; justify-content: space-between; }
    @media print {
      body { padding: 20px 28px; }
      @page { margin: 14mm 12mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <div class="report-header-left">
      <div class="firm">${firmLabel}</div>
      <div class="report-title">${title}</div>
      ${subtitle ? `<div class="report-sub">${subtitle}</div>` : ''}
    </div>
    <div class="report-header-right">
      <div>Generated: ${now}</div>
      <div style="margin-top:3px;font-size:10px;color:#aeaeb2">MyLedger — Philippine VAT Bookkeeping</div>
    </div>
  </div>

  ${bodyHtml}

  <div class="report-footer">
    <span>${firmLabel}</span>
    <span>This report is for internal review only. Verify with official BIR forms before filing.</span>
  </div>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { alert('Please allow pop-ups for this site to export PDF.'); return; }
  win.document.write(html);
  win.document.close();
  if (printNow) win.onload = () => win.print();
}

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL STATEMENT TEMPLATE  (SGV / PFRS professional layout)
// ─────────────────────────────────────────────────────────────────────────────
// Layout principles:
//   • Georgia serif, 12pt body
//   • Centered entity name block (company, statement title, period, currency note)
//   • Black text throughout — no color coding in financial data
//   • Peso sign (₱) only on the FIRST amount row of each column and on total rows
//   • Parentheses for negative amounts — never a minus sign
//   • Single top-border line for subtotals; double top-border for grand totals
//   • Indented sub-items under section headers
//   • ALL-CAPS section headers
//   • Note column placeholder — "Note X" beside key line items
//   • Preparer footer: prepared by, reviewed, "Draft — not for external distribution"
// ─────────────────────────────────────────────────────────────────────────────
export function printFSReport({ title, entityName, period, bodyHtml, firmLabel = 'MyLedger by Kaiman & Co.', printNow = true }) {
  const now = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title} — ${entityName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      font-size: 11pt;
      color: #000;
      background: #fff;
      padding: 36px 52px;
      line-height: 1.45;
    }

    /* ── Entity header block (centered) ── */
    .fs-entity-header {
      text-align: center;
      margin-bottom: 32px;
    }
    .fs-entity-name {
      font-size: 14pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .fs-statement-title {
      font-size: 12pt;
      font-weight: bold;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .fs-period {
      font-size: 11pt;
      margin-bottom: 4px;
    }
    .fs-currency-note {
      font-size: 9.5pt;
      font-style: italic;
      color: #444;
    }

    /* ── Horizontal rule under header ── */
    .fs-header-rule {
      border: none;
      border-top: 2px solid #000;
      margin-bottom: 24px;
    }

    /* ── Main statement table ── */
    .fs-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 32px;
    }
    .fs-table td {
      padding: 3px 0;
      vertical-align: top;
      font-size: 11pt;
    }

    /* Column widths: note ref | account name | amount */
    .col-note  { width: 54px;  color: #555; font-size: 9.5pt; padding-top: 4px; }
    .col-label { width: auto; }
    .col-amt   { width: 130px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .col-amt2  { width: 130px; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; color: #555; }

    /* Indentation levels */
    .indent-1 { padding-left: 18px; }
    .indent-2 { padding-left: 36px; }

    /* Section headers */
    .fs-section {
      font-weight: bold;
      text-transform: uppercase;
      font-size: 11pt;
      padding-top: 16px;
      padding-bottom: 4px;
    }

    /* Subtotal row — single top border */
    .fs-subtotal td { border-top: 1px solid #000; padding-top: 4px; font-weight: bold; }

    /* Total row — double top border */
    .fs-total td {
      border-top: 3px double #000;
      padding-top: 5px;
      font-weight: bold;
      font-size: 11.5pt;
    }

    /* Grand total — double top border + bold */
    .fs-grand-total td {
      border-top: 3px double #000;
      border-bottom: 3px double #000;
      padding: 5px 0;
      font-weight: bold;
      font-size: 11.5pt;
    }

    /* Spacer row */
    .fs-spacer td { padding: 6px 0 0; }

    /* Column header row */
    .fs-col-header td {
      font-size: 9.5pt;
      text-align: right;
      padding-bottom: 4px;
      border-bottom: 1px solid #000;
      font-style: italic;
      color: #333;
    }
    .fs-col-header td.col-label { text-align: left; }

    /* Notes section */
    .fs-notes {
      margin-top: 28px;
      font-size: 9.5pt;
      color: #333;
      border-top: 1px solid #999;
      padding-top: 14px;
    }
    .fs-notes p { margin-bottom: 6px; line-height: 1.5; }

    /* Footer */
    .fs-footer {
      margin-top: 36px;
      padding-top: 12px;
      border-top: 1px solid #000;
      display: flex;
      justify-content: space-between;
      font-size: 9pt;
      color: #333;
    }
    .fs-footer-sig { text-align: center; }
    .fs-footer-sig .sig-line {
      border-top: 1px solid #000;
      width: 180px;
      margin: 28px auto 4px;
      font-size: 9pt;
    }

    .draft-watermark {
      position: fixed;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 72pt;
      color: rgba(0,0,0,0.04);
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 12px;
      pointer-events: none;
      z-index: 0;
    }

    @media print {
      body { padding: 18mm 20mm; }
      @page { margin: 15mm 18mm; size: A4 portrait; }
      .draft-watermark { color: rgba(0,0,0,0.04); }
    }
  </style>
</head>
<body>

  <div class="draft-watermark">DRAFT</div>

  <div class="fs-entity-header">
    <div class="fs-entity-name">${entityName}</div>
    <div class="fs-statement-title">${title}</div>
    <div class="fs-period">${period}</div>
    <div class="fs-currency-note">(Amounts in Philippine Peso)</div>
  </div>

  <hr class="fs-header-rule" />

  ${bodyHtml}

  <div class="fs-footer">
    <div>
      <div style="font-size:9.5pt;font-weight:bold;margin-bottom:4px">${firmLabel}</div>
      <div>Generated: ${now}</div>
      <div style="margin-top:6px;font-style:italic;color:#555">
        DRAFT — For management review only. Not for external distribution.<br/>
        Prepared using MyLedger · Philippine PFRS-basis bookkeeping.
      </div>
    </div>
    <div class="fs-footer-sig">
      <div class="sig-line"></div>
      <div style="font-size:9pt">Prepared by</div>
    </div>
    <div class="fs-footer-sig">
      <div class="sig-line"></div>
      <div style="font-size:9pt">Reviewed by</div>
    </div>
  </div>

</body>
</html>`;

  const win = window.open('', '_blank', 'width=900,height=750');
  if (!win) { alert('Please allow pop-ups for this site to export PDF.'); return; }
  win.document.write(html);
  win.document.close();
  if (printNow) win.onload = () => win.print();
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML BUILDERS — Operational reports (used with printReport)
// ─────────────────────────────────────────────────────────────────────────────

export function buildBIRReturnHtml({ isOPT, effectiveBirType, periodLabel, birYear, r, clientName }) {
  const regime = isOPT ? `OPT (${(r.optRate * 100).toFixed(0)}% Percentage Tax)` : 'VAT-Registered (12%)';
  if (isOPT) {
    return `
      <div class="section-head">BIR Form ${effectiveBirType} — ${clientName}</div>
      <div class="card-grid">
        <div class="card"><div class="card-label">Gross Sales / Receipts</div><div class="card-value" style="color:#00836e">${peso(r.grossSales)}</div></div>
        <div class="card"><div class="card-label">OPT Rate</div><div class="card-value" style="color:#ff9500">${(r.optRate * 100).toFixed(0)}%</div><div style="font-size:11px;color:#6e6e73;margin-top:4px">Sec. 116, NIRC</div></div>
        <div class="card"><div class="card-label">Percentage Tax Due</div><div class="card-value" style="color:#ff3b30">${peso(r.percentageTax)}</div></div>
      </div>
      <div style="max-width:480px">
        <div class="section-head">Computation — Form ${effectiveBirType} · ${periodLabel} ${birYear}</div>
        <div class="stmt-row"><span class="lbl">Gross Sales / Receipts / Fees</span><span>${peso(r.grossSales)}</span></div>
        <div class="stmt-row bold">
          <span class="lbl">Percentage Tax Due (${(r.optRate * 100).toFixed(0)}% of Gross Sales)</span>
          <span style="color:#ff3b30">${peso(r.percentageTax)}</span>
        </div>
        <p style="font-size:11px;color:#6e6e73;margin-top:14px">
          ${r.txCount} income transaction(s) included ·
          Tax regime: ${regime} ·
          Due: 20th of the following ${effectiveBirType === '2551Q' ? 'quarter-end month' : 'month'}.
        </p>
      </div>
    `;
  }
  return `
    <div class="section-head">BIR Form ${effectiveBirType} — ${clientName}</div>
    <div class="card-grid">
      <div class="card"><div class="card-label">Gross Sales</div><div class="card-value" style="color:#00836e">${peso(r.grossSales)}</div></div>
      <div class="card"><div class="card-label">Output VAT (12%)</div><div class="card-value" style="color:#ff9500">${peso(r.outputVAT)}</div></div>
      <div class="card"><div class="card-label">Gross Purchases</div><div class="card-value" style="color:#ff3b30">${peso(r.grossPurchases)}</div></div>
      <div class="card"><div class="card-label">Input VAT (12%)</div><div class="card-value" style="color:#0071e3">${peso(r.inputVAT)}</div></div>
    </div>
    <div style="max-width:480px">
      <div class="section-head">Computation — Form ${effectiveBirType} · ${periodLabel} ${birYear}</div>
      <div class="stmt-row"><span class="lbl">Taxable Sales (VAT-exclusive NET)</span><span>${peso(r.grossSales - r.outputVAT)}</span></div>
      <div class="stmt-row"><span class="lbl">Output VAT Due (12%)</span><span style="color:#ff9500">${peso(r.outputVAT)}</span></div>
      <hr class="stmt-sep"/>
      <div class="stmt-row" style="padding-left:12px"><span class="lbl">Allowable Input VAT (from purchases)</span><span style="color:#0071e3">${peso(r.inputVAT)}</span></div>
      <hr class="stmt-sep"/>
      <div class="stmt-row bold">
        <span class="lbl">${r.netVATDue > 0 ? 'VAT Payable to BIR' : 'Excess Input VAT (carry forward)'}</span>
        <span style="color:${r.netVATDue > 0 ? '#ff3b30' : '#00836e'}">${peso(r.netVATDue > 0 ? r.netVATDue : r.excessInputVAT)}</span>
      </div>
      <p style="font-size:11px;color:#6e6e73;margin-top:14px">
        ${r.txCount} transaction(s) included ·
        Due: 20th of the following ${effectiveBirType === '2550Q' ? 'quarter-end month' : 'month'}.
      </p>
    </div>
  `;
}

export function buildBooksHtml({ booksType, booksData, clientName }) {
  if (!booksData) return '<p style="color:#6e6e73">No data available.</p>';
  const rows   = booksData.rows   || [];
  const totals = booksData.totals || {};
  const titleMap = {
    sales: 'Sales Book', purchases: 'Purchases Book',
    receipts: 'Cash Receipts Book', disbursements: 'Cash Disbursements Book',
  };
  const getParty = r => r.customer || r.supplier || r.payer || r.payee || '';
  const isCash   = booksType === 'receipts' || booksType === 'disbursements';
  const totalGross = totals.gross || totals.total || 0;
  const totalVat   = totals.outputVAT || totals.inputVAT || 0;
  const totalNet   = totals.vatable != null
    ? (totals.vatable + (totals.zeroRated || 0) + (totals.exempt || 0) + (totals.optSales || 0))
    : (totals.vatPurchases || 0) + (totals.nonVatPurchases || 0);

  const headers = isCash
    ? ['Date', 'Ref No.', 'Name', 'Description', 'Mode', 'Amount']
    : ['Date', 'Ref No.', 'Name', 'Description', 'Gross', 'VAT', 'NET'];

  const rowsHtml = rows.map(r => {
    const dt = r.date ? new Date(r.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
    const netVal = booksType === 'sales'
      ? (r.vatable || 0) + (r.zeroRated || 0) + (r.exempt || 0) + (r.optSales || 0)
      : (r.vatPurchases || 0) + (r.nonVatPurchases || 0);
    return `<tr>
      <td style="white-space:nowrap">${dt}</td>
      <td style="color:#6e6e73">${r.referenceNo || '—'}</td>
      <td>${getParty(r) || '—'}</td>
      <td>${r.description || ''}</td>
      ${isCash
        ? `<td style="color:#6e6e73">${r.settlement || '—'}</td>
           <td class="num" style="color:${booksType === 'receipts' ? '#00836e' : '#ff3b30'};font-weight:600">${peso(r.total || r.gross)}</td>`
        : `<td class="num" style="color:${booksType === 'sales' ? '#00836e' : '#ff3b30'};font-weight:600">${peso(r.gross)}</td>
           <td class="num" style="color:#ff9500">${peso(r.outputVAT || r.inputVAT || 0)}</td>
           <td class="num">${peso(netVal)}</td>`}
    </tr>`;
  }).join('');

  const footerHtml = isCash
    ? `<tr><td colspan="5" style="font-weight:700">TOTALS</td>
       <td class="num" style="color:${booksType === 'receipts' ? '#00836e' : '#ff3b30'}">${peso(totalGross)}</td></tr>`
    : `<tr><td colspan="4" style="font-weight:700">TOTALS</td>
       <td class="num" style="color:${booksType === 'sales' ? '#00836e' : '#ff3b30'}">${peso(totalGross)}</td>
       <td class="num" style="color:#ff9500">${peso(totalVat)}</td>
       <td class="num">${peso(totalNet)}</td></tr>`;

  return `
    <div class="section-head">${titleMap[booksType]} — ${clientName} · ${booksData.period || ''}</div>
    <table>
      <thead><tr>${headers.map((h, i) => `<th${i >= headers.length - (isCash ? 1 : 3) ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="7" style="text-align:center;color:#6e6e73;padding:20px">No entries found.</td></tr>'}</tbody>
      <tfoot>${footerHtml}</tfoot>
    </table>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML BUILDERS — Financial Statements (used with printFSReport)
// SGV / PFRS professional layout
// ─────────────────────────────────────────────────────────────────────────────

// Helper: format peso with first-row rule
// firstPeso = true → show ₱ prefix; false → show spaces indent
const fmtAmt = (n, showSign = false) => {
  if (n == null) return '—';
  if (n === 0)   return '—';
  if (n < 0)     return `(${peso(Math.abs(n))})`;
  return showSign ? peso(n) : peso(n);
};

// Build a standard table row
// indent: 0 = section header, 1 = main item, 2 = sub-item
// type: 'normal' | 'subtotal' | 'total' | 'grand'
// noteRef: e.g. '1', '2', null
function fsRow({ label, amount, noteRef = null, indent = 1, type = 'normal', showPesoSign = false, emptyAmt = false }) {
  const trClass = type === 'grand' ? 'fs-grand-total'
    : type === 'total' ? 'fs-total'
    : type === 'subtotal' ? 'fs-subtotal'
    : '';
  const amtHtml = emptyAmt ? '' : fmtAmt(amount, showPesoSign);
  const indentClass = indent === 2 ? 'indent-2' : indent === 1 ? 'indent-1' : '';
  const noteCell = noteRef ? `<span style="font-size:9pt;font-style:italic;color:#555">(Note ${noteRef})</span>` : '';

  return `<tr class="${trClass}">
    <td class="col-note">${noteRef ? `Note ${noteRef}` : ''}</td>
    <td class="col-label ${indentClass}">${label} ${noteCell}</td>
    <td class="col-amt">${amtHtml}</td>
  </tr>`;
}

function fsSpacer() {
  return `<tr class="fs-spacer"><td colspan="3"></td></tr>`;
}

function fsSectionHeader(label) {
  return `<tr><td class="col-note"></td><td class="col-label fs-section" colspan="2">${label}</td></tr>`;
}

// ── Income Statement (Statement of Comprehensive Income) ─────────────────────
export function buildIncomeStatementHtml(income, clientName) {
  if (!income) return '<p>No data available.</p>';

  const rb = income.revenueBreakdown || {};
  const vatable    = rb.vatable   || 0;
  const zeroRated  = rb.zeroRated || 0;
  const exempt     = rb.exempt    || 0;
  const optSales   = rb.optSales  || 0;
  const isOPT      = optSales > 0 && vatable === 0;

  // Show revenue breakdown only if there are multiple types
  const hasBreakdown = (vatable > 0 ? 1 : 0) + (zeroRated > 0 ? 1 : 0) +
                       (exempt > 0 ? 1 : 0) + (optSales > 0 ? 1 : 0) > 1;

  const rows = [];

  // ── REVENUE section ──
  rows.push(fsSectionHeader('REVENUES'));

  if (hasBreakdown) {
    if (vatable   > 0) rows.push(fsRow({ label: 'Vatable Sales/Revenues',           amount: vatable,   indent: 2, noteRef: '1' }));
    if (zeroRated > 0) rows.push(fsRow({ label: 'Zero-rated Sales/Revenues',        amount: zeroRated, indent: 2, noteRef: '1' }));
    if (exempt    > 0) rows.push(fsRow({ label: 'VAT-exempt Sales/Revenues',        amount: exempt,    indent: 2, noteRef: '1' }));
    if (optSales  > 0) rows.push(fsRow({ label: 'Gross Receipts (OPT-registered)', amount: optSales,  indent: 2, noteRef: '1' }));
    rows.push(fsRow({ label: 'Total Revenues', amount: income.revenue, indent: 1, type: 'subtotal', showPesoSign: true }));
  } else {
    rows.push(fsRow({ label: isOPT ? 'Gross Receipts' : 'Net Sales/Revenues (VAT-exclusive)', amount: income.revenue, indent: 1, noteRef: '1', showPesoSign: true }));
  }

  rows.push(fsSpacer());

  // ── COST OF SALES ──
  const eb     = income.expenseBreakdown || {};
  const cogsMap = eb.cogs || {};
  const opexMap = eb.opex || {};
  const cogsEntries = Object.entries(cogsMap).filter(([, v]) => v > 0);
  const opexEntries = Object.entries(opexMap).filter(([, v]) => v > 0);
  const grossProfit = income.grossProfit ?? (income.revenue - (income.costOfSales || 0));
  const costOfSales = income.costOfSales || 0;

  if (costOfSales > 0 || cogsEntries.length > 0) {
    rows.push(fsSectionHeader('COST OF SALES'));
    if (cogsEntries.length > 0) {
      for (const [cat, amt] of cogsEntries) {
        rows.push(fsRow({ label: cat, amount: amt > 0 ? -amt : 0, indent: 2, showPesoSign: false }));
      }
      rows.push(fsRow({ label: 'Total Cost of Sales', amount: costOfSales > 0 ? -costOfSales : 0, indent: 1, noteRef: '2', type: 'subtotal', showPesoSign: true }));
    } else {
      rows.push(fsRow({ label: 'Cost of Goods Sold', amount: costOfSales > 0 ? -costOfSales : 0, indent: 1, noteRef: '2', showPesoSign: true }));
    }
    rows.push(fsSpacer());

    // ── GROSS PROFIT ──
    rows.push(fsRow({
      label: grossProfit >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS',
      amount: grossProfit,
      indent: 0,
      type: 'subtotal',
      showPesoSign: true,
    }));
    rows.push(fsSpacer());
  }

  // ── OPERATING EXPENSES ──
  const operatingExpenses = income.operatingExpenses || (income.expenses - costOfSales);
  if (operatingExpenses > 0 || opexEntries.length > 0) {
    rows.push(fsSectionHeader('OPERATING EXPENSES'));
    if (opexEntries.length > 0) {
      for (const [cat, amt] of opexEntries) {
        rows.push(fsRow({ label: cat, amount: amt > 0 ? -amt : 0, indent: 2, showPesoSign: false }));
      }
      rows.push(fsRow({ label: 'Total Operating Expenses', amount: operatingExpenses > 0 ? -operatingExpenses : 0, indent: 1, noteRef: '2', type: 'subtotal', showPesoSign: true }));
    } else if (operatingExpenses > 0) {
      rows.push(fsRow({ label: 'Total Operating Expenses', amount: -operatingExpenses, indent: 1, noteRef: '2', showPesoSign: true }));
    }
    rows.push(fsSpacer());
  }

  // ── If no COGS split, show old combined section for backwards compat ──
  if (costOfSales === 0 && operatingExpenses === 0 && income.expenses > 0) {
    rows.push(fsSectionHeader('COSTS AND EXPENSES'));
    rows.push(fsRow({ label: 'Total Costs and Expenses', amount: -income.expenses, indent: 1, noteRef: '2', showPesoSign: true }));
    rows.push(fsSpacer());
  }

  // ── Income before tax ──
  const profitBeforeTax = income.revenue - income.expenses;
  rows.push(fsRow({
    label: profitBeforeTax >= 0 ? 'INCOME BEFORE INCOME TAX' : 'LOSS BEFORE INCOME TAX',
    amount: profitBeforeTax,
    indent: 0,
    type: 'subtotal',
    showPesoSign: true,
  }));

  rows.push(fsSpacer());

  // ── Provision for income tax (placeholder) ──
  rows.push(fsRow({ label: 'Provision for Income Tax', amount: 0, indent: 1, noteRef: '3', emptyAmt: false }));

  rows.push(fsSpacer());

  // ── Net income ──
  rows.push(fsRow({
    label: income.profit >= 0 ? 'NET INCOME FOR THE PERIOD' : 'NET LOSS FOR THE PERIOD',
    amount: income.profit,
    indent: 0,
    type: 'grand',
    showPesoSign: true,
  }));

  const notesHtml = `
    <div class="fs-notes">
      <p><strong>Note 1 — Revenues.</strong>
        Revenues represent the net (VAT-exclusive) amount billed to customers during the period.
        For VAT-registered entities, output VAT is excluded and remitted separately to the BIR.
        For OPT-registered entities, gross receipts are presented; 3% percentage tax is computed separately.
      </p>
      <p><strong>Note 2 — Costs and Expenses.</strong>
        Cost of Sales represents direct costs (e.g., cost of goods sold) deducted from revenues to arrive at gross profit.
        Operating expenses represent indirect costs of running the business during the period.
        All amounts are net (VAT-exclusive); input VAT on purchases is treated as a recoverable asset.
        Expanded withholding taxes (EWT), if applicable, are deducted at source.
      </p>
      <p><strong>Note 3 — Income Tax.</strong>
        Provision for income tax has not been computed. Please consult your tax adviser to determine
        the applicable corporate or individual income tax for the period.
      </p>
      <p style="margin-top:10px;font-style:italic;font-size:9pt;color:#555">
        This statement was prepared on a PFRS basis using transaction data recorded in MyLedger.
        ${income.txCount != null ? `Period covers ${income.txCount} transaction(s). ` : ''}
        ${income.note || ''}
      </p>
    </div>
  `;

  return `<table class="fs-table">${rows.join('')}</table>${notesHtml}`;
}

// ── Cash Flow Statement ───────────────────────────────────────────────────────
export function buildCashFlowHtml(cf, clientName) {
  if (!cf) return '<p>No data available.</p>';

  const op  = cf.operating || {};
  const iv  = cf.investing  || {};
  const fi  = cf.financing  || {};
  const net = cf.netCashChange ?? 0;

  // Helper: indent label + tabular amount columns, with sign-flip display
  // showSign: always show ₱ prefix
  const cfRow = ({ label, amount, indent = 1, type = 'normal', showPesoSign = false, italic = false }) => {
    const trClass = type === 'grand' ? 'fs-grand-total'
      : type === 'total' ? 'fs-total'
      : type === 'subtotal' ? 'fs-subtotal'
      : '';
    const indentClass = indent === 2 ? 'indent-2' : indent === 1 ? 'indent-1' : '';
    const amtDisplay = amount == null ? '—'
      : amount === 0 ? '—'
      : amount < 0 ? `(${peso(Math.abs(amount))})`
      : (showPesoSign ? peso(amount) : peso(amount));
    const labelStyle = italic ? 'style="font-style:italic;color:#555"' : '';
    return `<tr class="${trClass}">
      <td class="col-note"></td>
      <td class="col-label ${indentClass}" ${labelStyle}>${label}</td>
      <td class="col-amt">${amtDisplay}</td>
    </tr>`;
  };

  const cfSection = label => `<tr>
    <td class="col-note"></td>
    <td class="col-label fs-section" colspan="2">${label}</td>
  </tr>`;

  const cfSpacer = () => `<tr class="fs-spacer"><td colspan="3"></td></tr>`;

  const rows = [];

  // ── A. OPERATING ACTIVITIES ──
  rows.push(cfSection('A. CASH FLOWS FROM OPERATING ACTIVITIES'));
  rows.push(cfRow({ label: 'Net Income / (Loss) for the Period', amount: op.netIncome ?? 0, indent: 1, showPesoSign: true }));
  rows.push(cfRow({ label: 'Adjustments for non-cash items:', indent: 1, italic: true }));
  rows.push(cfRow({ label: 'Depreciation and Amortization', amount: op.depreciationAddBack ?? 0, indent: 2 }));
  rows.push(cfRow({ label: 'Changes in working capital:', indent: 1, italic: true }));
  rows.push(cfRow({ label: 'Increase in Trade and Other Receivables', amount: op.arIncrease ?? 0, indent: 2 }));
  rows.push(cfRow({ label: 'Increase in Trade and Other Payables',    amount: op.apIncrease ?? 0, indent: 2 }));
  rows.push(cfRow({ label: 'NET CASH FROM OPERATING ACTIVITIES', amount: op.total ?? 0, indent: 0, type: 'subtotal', showPesoSign: true }));

  rows.push(cfSpacer());

  // ── B. INVESTING ACTIVITIES ──
  rows.push(cfSection('B. CASH FLOWS FROM INVESTING ACTIVITIES'));
  if ((iv.assetPurchases ?? 0) !== 0) {
    rows.push(cfRow({ label: 'Acquisition of Property, Plant and Equipment', amount: iv.assetPurchases ?? 0, indent: 2, showPesoSign: true }));
  } else {
    rows.push(cfRow({ label: 'No investing transactions in this period.', indent: 2, italic: true }));
  }
  rows.push(cfRow({ label: 'NET CASH FROM INVESTING ACTIVITIES', amount: iv.total ?? 0, indent: 0, type: 'subtotal', showPesoSign: true }));

  rows.push(cfSpacer());

  // ── C. FINANCING ACTIVITIES ──
  rows.push(cfSection('C. CASH FLOWS FROM FINANCING ACTIVITIES'));
  rows.push(cfRow({ label: 'Financing transactions (loans, equity contributions)', indent: 2, italic: true }));
  rows.push(cfRow({ label: 'Record via Journal Entries tab for full capture.', indent: 2, italic: true }));
  rows.push(cfRow({ label: 'NET CASH FROM FINANCING ACTIVITIES', amount: fi.total ?? 0, indent: 0, type: 'subtotal', showPesoSign: true }));

  rows.push(cfSpacer());
  rows.push(cfSpacer());

  // ── NET MOVEMENT ──
  rows.push(cfRow({
    label: 'NET INCREASE / (DECREASE) IN CASH AND CASH EQUIVALENTS',
    amount: net,
    indent: 0,
    type: 'grand',
    showPesoSign: true,
  }));

  const notesHtml = `
    <div class="fs-notes">
      <p><strong>Basis of Preparation.</strong>
        This cash flow statement is prepared using the <em>indirect method</em> for operating activities,
        starting from net income and adjusting for non-cash items (depreciation) and changes in
        working capital (accounts receivable and payable movements).
      </p>
      <p><strong>Investing Activities.</strong>
        Derived from fixed asset records in MyLedger. Only assets recorded during the selected period
        are included. Disposals, if any, should be recorded via manual journal entries.
      </p>
      <p><strong>Financing Activities.</strong>
        Loans, equity contributions, and owner's drawings are not automatically captured from transaction
        data. These should be posted as manual journal entries for inclusion in future periods.
      </p>
      ${cf.direct ? `
      <p><strong>Cross-check — Direct Method.</strong>
        Cash collected from customers: ${peso(cf.direct.cashCollected ?? 0)} ·
        Cash paid to suppliers/employees: ${peso(Math.abs(cf.direct.cashPaid ?? 0))}.
        This represents actual cash settlements only (excludes AR/AP transactions).
      </p>` : ''}
      <p style="margin-top:10px;font-style:italic;font-size:9pt;color:#555">
        Period covered: ${cf.period || 'All periods'}.
        This statement is derived from transaction data in MyLedger and is intended for management
        review. Figures are based on recorded settlements and may require adjustment for formal reporting.
      </p>
    </div>
  `;

  return `<table class="fs-table">${rows.join('')}</table>${notesHtml}`;
}

// ── Balance Sheet (Statement of Financial Position) ───────────────────────────
export function buildBalanceSheetHtml(balance, clientName) {
  if (!balance) return '<p>No data available.</p>';

  const a  = balance.assets      || {};
  const l  = balance.liabilities || {};

  const inputVAT     = a.input_vat          || 0;
  const ar           = a.accounts_receivable || 0;
  const cashNet      = a.cash_net           || 0;
  const fixedNet     = a.fixed_assets_net   || 0;

  const outputVAT    = l.vat_payable        || 0;
  const ap           = l.accounts_payable   || 0;

  const totalCurrentAssets    = inputVAT + ar + (cashNet > 0 ? cashNet : 0);
  const totalNonCurrentAssets = fixedNet;
  const totalAssets           = totalCurrentAssets + totalNonCurrentAssets;

  const totalCurrentLiab = outputVAT + ap;
  const totalLiabilities = totalCurrentLiab;

  const netProfit = (balance.equityNetIncome != null)
    ? balance.equityNetIncome
    : totalAssets - totalLiabilities;   // basic accounting equation
  const totalEquity = netProfit;
  const totalLiabAndEquity = totalLiabilities + totalEquity;

  const rows = [];

  // ═════ ASSETS ═════
  rows.push(fsSectionHeader('ASSETS'));

  rows.push(fsSectionHeader('Current Assets'));
  if (cashNet !== 0)   rows.push(fsRow({ label: 'Cash and Cash Equivalents',    amount: cashNet,   indent: 2, noteRef: '4', showPesoSign: true }));
  if (ar > 0)          rows.push(fsRow({ label: 'Trade and Other Receivables',  amount: ar,        indent: 2, noteRef: '5' }));
  if (inputVAT > 0)    rows.push(fsRow({ label: 'Input VAT Recoverable',        amount: inputVAT,  indent: 2, noteRef: '6' }));
  rows.push(fsRow({ label: 'Total Current Assets', amount: totalCurrentAssets, indent: 1, type: 'subtotal', showPesoSign: true }));

  rows.push(fsSpacer());

  rows.push(fsSectionHeader('Non-current Assets'));
  if (fixedNet > 0) {
    rows.push(fsRow({ label: 'Property, Plant and Equipment — Net', amount: fixedNet, indent: 2, noteRef: '7' }));
  } else {
    rows.push(fsRow({ label: 'Property, Plant and Equipment', amount: 0, indent: 2, emptyAmt: true }));
    rows.push(`<tr><td class="col-note"></td><td class="col-label indent-2" style="font-style:italic;font-size:9.5pt;color:#555">No fixed assets recorded.</td><td class="col-amt"></td></tr>`);
  }
  rows.push(fsRow({ label: 'Total Non-current Assets', amount: totalNonCurrentAssets, indent: 1, type: 'subtotal', showPesoSign: totalNonCurrentAssets > 0 }));

  rows.push(fsSpacer());

  rows.push(fsRow({ label: 'TOTAL ASSETS', amount: totalAssets, indent: 0, type: 'grand', showPesoSign: true }));

  rows.push(fsSpacer());
  rows.push(fsSpacer());

  // ═════ LIABILITIES AND EQUITY ═════
  rows.push(fsSectionHeader('LIABILITIES AND EQUITY'));

  rows.push(fsSectionHeader('Current Liabilities'));
  if (outputVAT > 0) rows.push(fsRow({ label: 'Output VAT Payable',       amount: outputVAT, indent: 2, noteRef: '8', showPesoSign: true }));
  if (ap > 0)        rows.push(fsRow({ label: 'Trade and Other Payables', amount: ap,        indent: 2, noteRef: '9' }));
  rows.push(fsRow({ label: 'Total Current Liabilities', amount: totalCurrentLiab, indent: 1, type: 'subtotal', showPesoSign: true }));

  rows.push(fsSpacer());

  rows.push(fsRow({ label: 'TOTAL LIABILITIES', amount: totalLiabilities, indent: 0, type: 'total', showPesoSign: true }));

  rows.push(fsSpacer());

  rows.push(fsSectionHeader('Equity'));
  rows.push(fsRow({ label: "Owner's Equity / Retained Earnings (Net Profit)", amount: netProfit, indent: 2, noteRef: '10', showPesoSign: true }));
  rows.push(fsRow({ label: 'Total Equity', amount: totalEquity, indent: 1, type: 'subtotal', showPesoSign: true }));

  rows.push(fsSpacer());

  rows.push(fsRow({
    label: 'TOTAL LIABILITIES AND EQUITY',
    amount: totalLiabAndEquity,
    indent: 0,
    type: 'grand',
    showPesoSign: true,
  }));

  const netVAT = balance.net_vat_position ?? 0;

  const notesHtml = `
    <div class="fs-notes">
      <p><strong>Note 4 — Cash and Cash Equivalents.</strong>
        Represents net cash from transactions settled by cash, e-wallet (GCash/Maya), bank transfer, or cheque.
      </p>
      <p><strong>Note 5 — Trade and Other Receivables.</strong>
        Represents the gross amount billed to customers but not yet collected (settlement type: Accounts Receivable).
      </p>
      <p><strong>Note 6 — Input VAT Recoverable.</strong>
        Represents VAT paid on purchases from VAT-registered suppliers, claimable as a tax credit against Output VAT.
        ${netVAT >= 0
          ? `Net VAT payable to BIR: ${peso(netVAT)}.`
          : `Net VAT credit (excess input VAT refundable): ${peso(Math.abs(netVAT))}.`}
      </p>
      <p><strong>Note 7 — Property, Plant and Equipment.</strong>
        Stated at cost less accumulated straight-line depreciation computed per asset record in MyLedger.
      </p>
      <p><strong>Note 8 — Output VAT Payable.</strong>
        Represents VAT collected from customers on vatable sales, remittable to the BIR via Form 2550M/2550Q.
      </p>
      <p><strong>Note 9 — Trade and Other Payables.</strong>
        Represents amounts owed to suppliers not yet settled (settlement type: Accounts Payable or Credit Card).
      </p>
      <p><strong>Note 10 — Equity.</strong>
        Derived as Total Assets less Total Liabilities. Includes net income for the period computed on a PFRS basis.
        Equity is presented for management reference; a formal equity schedule may be prepared separately.
      </p>
      <p style="margin-top:10px;font-style:italic;font-size:9pt;color:#555">
        This statement of financial position is derived from transaction data in MyLedger and includes
        VAT accounts, settlement-based cash/receivable/payable positions, and recorded fixed assets.
        Figures are based on recorded transaction data and are intended for management review.
        As of: ${balance.asOf || '—'}.
      </p>
    </div>
  `;

  return `<table class="fs-table">${rows.join('')}</table>${notesHtml}`;
}
