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

// ── BIR Form helper styles ────────────────────────────────────────────────────
const birCss = `
  <style>
    .bir-wrap { font-family: Arial, sans-serif; font-size: 9pt; color: #000; max-width: 720px; }
    .bir-header { text-align: center; border: 2px solid #000; padding: 8px 4px; margin-bottom: 0; }
    .bir-header .form-no { font-size: 14pt; font-weight: 700; }
    .bir-header .form-title { font-size: 10pt; font-weight: 700; margin: 2px 0; }
    .bir-header .form-sub { font-size: 8pt; }
    .bir-part { border: 1px solid #000; border-top: none; padding: 0; margin: 0; }
    .bir-part-title { background: #000; color: #fff; font-weight: 700; font-size: 8pt;
      padding: 3px 6px; text-transform: uppercase; letter-spacing: 0.05em; }
    .bir-row { display: flex; border-bottom: 1px solid #ccc; min-height: 20px; }
    .bir-row:last-child { border-bottom: none; }
    .bir-cell { padding: 3px 6px; border-right: 1px solid #ccc; font-size: 8.5pt; }
    .bir-cell:last-child { border-right: none; }
    .bir-label { color: #555; font-size: 7.5pt; display: block; margin-bottom: 1px; }
    .bir-value { font-weight: 600; font-size: 9pt; }
    .bir-lineno { width: 28px; text-align: center; background: #f5f5f5; font-size: 8pt;
      color: #555; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .bir-amt { text-align: right; min-width: 110px; flex-shrink: 0; }
    .bir-total { background: #f0f0f0; font-weight: 700; }
    .bir-payable { background: #fff3cd; font-weight: 700; }
    .bir-sig { border: 1px solid #000; border-top: none; padding: 10px 8px; display: flex; gap: 16px; }
    .bir-sig-box { flex: 1; border-top: 1px solid #000; padding-top: 4px; font-size: 8pt; text-align: center; color: #555; }
    .bir-note { font-size: 8pt; color: #555; margin-top: 8px; font-style: italic; }
  </style>
`;

function birRow(lineNo, label, value, cls = '') {
  const fmt = v => v == null ? '' : typeof v === 'number' ? peso(v) : v;
  return `
    <div class="bir-row ${cls}">
      <div class="bir-lineno">${lineNo || ''}</div>
      <div class="bir-cell" style="flex:1">${label}</div>
      <div class="bir-cell bir-amt">${fmt(value)}</div>
    </div>`;
}
function birField(label, value, width = 'flex:1') {
  return `<div class="bir-cell" style="${width}"><span class="bir-label">${label}</span><span class="bir-value">${value || '—'}</span></div>`;
}

export function buildBIRReturnHtml({ isOPT, effectiveBirType, periodLabel, birYear, r, client, prefill }) {
  // Support old call signature (clientName string) for safety
  if (typeof client === 'string') client = { tradeName: client };
  const c = client || {};

  const tinFormatted = (c.tin || '').replace(/[^0-9]/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d*)/, '$1-$2-$3-$4').replace(/-$/, '');
  const address = [c.address, c.zipCode].filter(Boolean).join('  ZIP: ');
  const dueDay  = (effectiveBirType === '2550Q' || effectiveBirType === '2551Q') ? '25th' : '20th';
  const dueNote = `Due on or before the ${dueDay} of the following ${effectiveBirType.endsWith('Q') ? 'quarter-end month' : 'month'}.`;

  // ── Part I: Background Information (shared by all forms) ──────────────────
  const partI = `
    <div class="bir-part">
      <div class="bir-part-title">Part I — Background Information</div>
      <div class="bir-row">
        ${birField('1 Taxpayer Identification Number (TIN)', tinFormatted || c.tin || '', 'flex:1.5')}
        ${birField('2 RDO Code', c.rdoCode || '', 'width:80px')}
        ${birField('3 Line of Business / Occupation', c.businessType || c.type || '', 'flex:2')}
      </div>
      <div class="bir-row">
        ${birField('4 Taxpayer\'s Name (Last, First, Middle / Corporate Name)', c.tradeName || '', 'flex:3')}
        ${birField('5 Taxpayer Type', c.type || 'Corporation', 'flex:1')}
      </div>
      <div class="bir-row">
        ${birField('6 Registered Address', c.address || '', 'flex:3')}
        ${birField('ZIP Code', c.zipCode || '', 'width:70px')}
        ${birField('7 Telephone', c.telephone || '', 'flex:1')}
      </div>
      <div class="bir-row">
        ${birField('8 Amended Return?', 'No', 'flex:1')}
        ${birField('9 No. of Sheets Attached', '—', 'flex:1')}
        ${c.type === 'Sole Proprietor' || c.type === 'Individual'
          ? birField('10 Date of Birth (MM/DD/YYYY)', c.birthday ? new Date(c.birthday).toLocaleDateString('en-US') : '', 'flex:1.5')
          : birField('10 Date of Incorporation', c.incorporationDate ? new Date(c.incorporationDate).toLocaleDateString('en-US') : '', 'flex:1.5')}
        ${birField('11 Period (MM/YYYY)', `${String(r.month || '').padStart(2,'0') || periodLabel}/${birYear}`, 'flex:1')}
      </div>
    </div>`;

  // ── Helper: peso formatter ────────────────────────────────────────────────
  const pesoFmt = v => `₱ ${(v || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Part I extended for income tax forms (adds civil status / spouse TIN) ──
  const itPartI = `
    <div class="bir-part">
      <div class="bir-part-title">Part I — Background Information</div>
      <div class="bir-row">
        ${birField('1 Taxpayer Identification Number (TIN)', tinFormatted || c.tin || '', 'flex:1.5')}
        ${birField('2 RDO Code', c.rdoCode || '', 'width:80px')}
        ${birField('3 Line of Business / Occupation', c.businessType || '', 'flex:2')}
      </div>
      <div class="bir-row">
        ${birField('4A Taxpayer\'s Name (Last, First, Middle)', c.tradeName || '', 'flex:3')}
        ${birField('4B Civil Status', c.civilStatus || 'Single', 'flex:1')}
      </div>
      ${c.civilStatus === 'Married' ? `
      <div class="bir-row">
        ${birField('5A Spouse\'s Name', '—', 'flex:2')}
        ${birField('5B Spouse\'s TIN', c.spouseTin || '', 'flex:1.5')}
        ${birField('5C Spouse\'s RDO Code', '', 'width:90px')}
      </div>` : ''}
      <div class="bir-row">
        ${birField('6 Registered Address', c.address || '', 'flex:3')}
        ${birField('ZIP Code', c.zipCode || '', 'width:70px')}
        ${birField('7 Telephone', c.telephone || '', 'flex:1')}
      </div>
      <div class="bir-row">
        ${birField('8 Amended Return?', 'No', 'flex:1')}
        ${birField('9 No. of Sheets Attached', '—', 'flex:1')}
        ${birField('10 Date of Birth (MM/DD/YYYY)', c.birthday ? new Date(c.birthday).toLocaleDateString('en-US') : '', 'flex:1.5')}
        ${birField('11 Tax Year (YYYY)', String(r.year || birYear), 'flex:0.8')}
      </div>
    </div>`;

  // ── 1701 — Annual Income Tax Return (Individual / Sole Prop) ─────────────
  if (effectiveBirType === '1701') {
    const ti    = r.taxableIncome || 0;
    const txDue = r.taxDue        || 0;
    return `${birCss}
    <div class="bir-wrap">
      <div class="bir-header">
        <div class="form-no">BIR Form No. 1701</div>
        <div class="form-title">Annual Income Tax Return — Individuals (Including Mixed Income Earners)</div>
        <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
      </div>
      ${itPartI}
      <div class="bir-part">
        <div class="bir-part-title">Part II — Computation of Taxable Income</div>
        ${birRow(1,  'Gross Sales / Revenues / Receipts / Fees', r.grossRevenue)}
        ${birRow(2,  'Less: Cost of Sales / Services', 0)}
        ${birRow(3,  'Gross Income  (Line 1 − Line 2)', r.grossRevenue, 'bir-total')}
        ${birRow(4,  'Less: Allowable Itemized Deductions', r.totalExpenses)}
        ${birRow(5,  'Taxable Compensation Income', 0)}
        ${birRow(6,  'Total Taxable Income  (Line 3 − Line 4 + Line 5)', ti, 'bir-total')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Computation of Tax (TRAIN Law Graduated Rates, eff. 2023)</div>
        ${birRow(7,  'Income Tax Due on Taxable Income (TRAIN Law Schedule)', txDue)}
        ${birRow(8,  'Less: Tax Credits / Payments / Withholding Tax', 0)}
        ${birRow(9,  'Net Tax Due / (Overpayment)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Penalties</div>
        ${birRow(10, 'Surcharge (25% / 50%)', 0)}
        ${birRow(11, 'Interest (12% per annum)', 0)}
        ${birRow(12, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part V — Summary</div>
        ${birRow('', 'Total Amount Payable / (Overpayment)  (Sum of Lines 9–12)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part" style="background:#fffbea; padding:12px 16px; font-size:12px; color:#7a5f00;">
        <strong>TRAIN Law Tax Table Applied (eff. 2023):</strong><br>
        ₱0–₱250K: 0% &nbsp;·&nbsp; ₱250K–₱400K: 15% &nbsp;·&nbsp; ₱400K–₱800K: ₱22,500 + 20% &nbsp;·&nbsp;
        ₱800K–₱2M: ₱102,500 + 25% &nbsp;·&nbsp; ₱2M–₱8M: ₱402,500 + 30% &nbsp;·&nbsp; Over ₱8M: ₱2,202,500 + 35%
      </div>
      <div class="bir-sig">
        <div class="bir-sig-box">Signature over Printed Name of Taxpayer / Authorized Representative</div>
        <div class="bir-sig-box">Title / Designation</div>
        <div class="bir-sig-box">TIN of Signatory</div>
        <div class="bir-sig-box">Date Signed</div>
      </div>
      <p class="bir-note">${r.txCount} transaction(s) included · Due: April 15 of the following year · All amounts in Philippine Peso (₱).</p>
    </div>`;
  }

  // ── 1701A — Annual Income Tax Return (Simplified — 8% / OSD) ────────────
  if (effectiveBirType === '1701A') {
    const gross   = r.grossRevenue || 0;
    const txDue   = r.taxDue       || 0;
    const is8pct  = (c.taxOption || r.taxOption) === '8percent';
    const taxBase = is8pct ? Math.max(gross - 250000, 0) : gross * 0.60; // OSD: 60% of gross
    return `${birCss}
    <div class="bir-wrap">
      <div class="bir-header">
        <div class="form-no">BIR Form No. 1701A</div>
        <div class="form-title">Annual Income Tax Return — Individuals Earning Purely from Business/Profession</div>
        <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
      </div>
      ${itPartI}
      <div class="bir-part">
        <div class="bir-part-title">Part II — Method of Deduction</div>
        <div class="bir-row">
          ${birField('Availment of 8% Income Tax Rate?', is8pct ? 'YES' : 'NO', 'flex:1')}
          ${birField('Elected OSD (40% / Optional Standard Deduction)?', !is8pct ? 'YES' : 'NO', 'flex:1')}
        </div>
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Computation of Tax</div>
        ${birRow(1, 'Gross Sales / Revenues / Receipts / Fees', gross)}
        ${is8pct
          ? `${birRow(2, 'Less: ₱250,000 Exemption (8% option)', 250000)}
             ${birRow(3, 'Tax Base (Line 1 − ₱250,000)', taxBase, 'bir-total')}
             ${birRow(4, 'Income Tax Due (Line 3 × 8%)', txDue, 'bir-payable')}`
          : `${birRow(2, 'Less: OSD (40% of Gross Revenue)', gross * 0.40)}
             ${birRow(3, 'Taxable Income after OSD', taxBase, 'bir-total')}
             ${birRow(4, 'Income Tax Due (TRAIN Graduated Rates)', txDue, 'bir-payable')}`
        }
        ${birRow(5, 'Less: Tax Credits / Payments', 0)}
        ${birRow(6, 'Net Tax Due / (Overpayment)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Penalties</div>
        ${birRow(7, 'Surcharge', 0)}
        ${birRow(8, 'Interest', 0)}
        ${birRow(9, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part V — Summary</div>
        ${birRow('', 'Total Amount Payable / (Overpayment)', txDue, 'bir-payable')}
      </div>
      <div class="bir-sig">
        <div class="bir-sig-box">Signature over Printed Name of Taxpayer / Authorized Representative</div>
        <div class="bir-sig-box">Title / Designation</div>
        <div class="bir-sig-box">TIN of Signatory</div>
        <div class="bir-sig-box">Date Signed</div>
      </div>
      <p class="bir-note">${r.txCount} transaction(s) included · Due: April 15 of the following year · All amounts in Philippine Peso (₱).</p>
    </div>`;
  }

  // ── Shared corporate Part I (1702 + 1702Q) ───────────────────────────────
  function corpPartI_html(qLabel) {
    const mcitPct = ((r.mcitRate || 0.02) * 100).toFixed(0);
    const rcitPct = ((r.rcitRate || (c.isMsme ? 0.20 : 0.25)) * 100).toFixed(0);
    return `
      <div class="bir-part">
        <div class="bir-part-title">Part I — Background Information</div>
        <div class="bir-row">
          ${birField('1 Taxpayer Identification Number (TIN)', tinFormatted || c.tin || '', 'flex:1.5')}
          ${birField('2 RDO Code', c.rdoCode || '', 'width:80px')}
          ${birField('3 Line of Business / Industry', c.businessType || '', 'flex:2')}
        </div>
        <div class="bir-row">
          ${birField('4 Corporate Name', c.tradeName || '', 'flex:3')}
          ${birField('5 Taxpayer Type', c.type || 'Corporation', 'flex:1')}
        </div>
        <div class="bir-row">
          ${birField('6 Registered Address', c.address || '', 'flex:3')}
          ${birField('ZIP Code', c.zipCode || '', 'width:70px')}
          ${birField('7 Telephone', c.telephone || '', 'flex:1')}
        </div>
        <div class="bir-row">
          ${birField('8 Amended Return?', 'No', 'flex:1')}
          ${birField('9 RCIT Rate', `${rcitPct}%${c.isMsme ? ' (MSME — CREATE Act)' : ' (Regular)'}`, 'flex:1')}
          ${birField('10 Date of Incorporation', c.incorporationDate ? new Date(c.incorporationDate).toLocaleDateString('en-US') : '—', 'flex:1.5')}
          ${birField('11 Tax Year', String(r.year || birYear) + (qLabel ? ` · ${qLabel}` : ''), 'flex:1')}
        </div>
      </div>`;
  }

  // ── 1702 — Annual Corporate Income Tax Return ────────────────────────────
  if (effectiveBirType === '1702') {
    const ti       = r.taxableIncome || 0;
    const txDue    = r.taxDue        || 0;
    const rcit     = r.rcit          ?? txDue;
    const mcit     = r.mcit          ?? 0;
    const mcitPct  = ((r.mcitRate || 0.02) * 100).toFixed(0);
    const rcitPct  = ((r.rcitRate || (c.isMsme ? 0.20 : 0.25)) * 100).toFixed(0);
    const grossInc = r.grossIncome   ?? r.grossRevenue ?? 0;
    const cogs     = r.cogs          ?? 0;
    const applyMCIT   = !!r.applyMCIT;
    const mcitAppl    = r.mcitApplicable !== false; // default true if not set
    const taxBasisNote = !mcitAppl
      ? `MCIT not yet applicable (before 4th taxable year) — RCIT ${rcitPct}% applies`
      : applyMCIT
        ? `MCIT applies — ₱${mcit.toLocaleString('en-PH', {minimumFractionDigits:2})} > RCIT ₱${rcit.toLocaleString('en-PH', {minimumFractionDigits:2})}`
        : `RCIT applies — ₱${rcit.toLocaleString('en-PH', {minimumFractionDigits:2})} ≥ MCIT ₱${mcit.toLocaleString('en-PH', {minimumFractionDigits:2})}`;

    return `${birCss}
    <div class="bir-wrap">
      <div class="bir-header">
        <div class="form-no">BIR Form No. 1702</div>
        <div class="form-title">Annual Income Tax Return — Corporations, Partnerships, and Other Non-Individual Taxpayers</div>
        <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
      </div>
      ${corpPartI_html('')}
      <div class="bir-part">
        <div class="bir-part-title">Part II — Computation of Normal Income Tax</div>
        ${r.nonTaxableTotal > 0 ? `
        ${birRow('',  'Total Collections (all income types, VAT-exclusive)', r.totalGrossAll || r.grossRevenue)}
        ${birRow('',  'Less: Non-Taxable Items (Reimbursements / Capital Contributions / Loan Proceeds)', r.nonTaxableTotal || 0)}` : ''}
        ${birRow(1,  'Gross Sales / Revenues / Receipts — VAT-exclusive, Taxable Only', r.grossRevenue)}
        ${birRow(2,  'Less: Cost of Sales / Services (COGS)', cogs)}
        ${birRow(3,  'Gross Income  (Line 1 − Line 2)', grossInc, 'bir-total')}
        ${birRow(4,  'Less: Allowable Deductions / Operating Expenses', r.totalExpenses)}
        ${birRow(5,  'Net Taxable Income  (Line 3 − Line 4)', ti, 'bir-total')}
        ${birRow(6,  `Regular Corporate Income Tax (RCIT) — ${rcitPct}%  (Line 5 × ${rcitPct}%)`, rcit)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Minimum Corporate Income Tax (MCIT)</div>
        ${birRow(7,  `MCIT — ${mcitPct}% of Gross Income  (Line 3 × ${mcitPct}%)`, mcit)}
        ${birRow(8,  mcitAppl
            ? `Income Tax Due — Higher of RCIT (Line 6) or MCIT (Line 7)`
            : `Income Tax Due — RCIT only (MCIT not yet applicable — before 4th year)`,
          txDue, 'bir-total')}
        ${birRow(9,  'Less: Tax Credits / CWT / Prior Payments', 0)}
        ${birRow(10, 'Net Tax Due / (Overpayment)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Penalties</div>
        ${birRow(11, 'Surcharge (25% / 50%)', 0)}
        ${birRow(12, 'Interest (12% per annum)', 0)}
        ${birRow(13, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part V — Summary</div>
        ${birRow('', 'Total Amount Payable / (Overpayment)  (Lines 10 + 11 + 12 + 13)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part" style="background:#fffbea; padding:10px 16px; font-size:12px; color:#7a5f00;">
        <strong>MCIT / RCIT Note:</strong> ${taxBasisNote}.
        ${applyMCIT ? ' Excess MCIT over RCIT may be carried forward as credit for up to 3 succeeding taxable years.' : ''}
      </div>
      <div class="bir-sig">
        <div class="bir-sig-box">Signature over Printed Name of Authorized Officer</div>
        <div class="bir-sig-box">Title / Designation</div>
        <div class="bir-sig-box">TIN of Signatory</div>
        <div class="bir-sig-box">Date Signed</div>
      </div>
      <p class="bir-note">${r.txCount} transaction(s) included · Due: April 15 of the following year · All amounts in Philippine Peso (₱).</p>
    </div>`;
  }

  // ── 1702Q — Quarterly Corporate Income Tax Return ────────────────────────
  if (effectiveBirType === '1702Q') {
    const ti       = r.taxableIncome || 0;
    const txDue    = r.taxDue        || 0;
    const rcit     = r.rcit          ?? txDue;
    const mcit     = r.mcit          ?? 0;
    const mcitPct  = ((r.mcitRate || 0.02) * 100).toFixed(0);
    const rcitPct  = ((r.rcitRate || (c.isMsme ? 0.20 : 0.25)) * 100).toFixed(0);
    const grossInc = r.grossIncome   ?? r.grossRevenue ?? 0;
    const cogs     = r.cogs          ?? 0;
    const applyMCIT   = !!r.applyMCIT;
    const mcitAppl    = r.mcitApplicable !== false;
    const qtr      = r.quarter || 1;
    const qLabel   = `Q${qtr} (Cumulative Jan – ${['Mar','Jun','Sep','Dec'][qtr - 1]})`;
    return `${birCss}
    <div class="bir-wrap">
      <div class="bir-header">
        <div class="form-no">BIR Form No. 1702Q</div>
        <div class="form-title">Quarterly Income Tax Return — Corporations, Partnerships, and Other Non-Individual Taxpayers</div>
        <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue · Period: ${qLabel} ${r.year || birYear}</div>
      </div>
      ${corpPartI_html(qLabel)}
      <div class="bir-part">
        <div class="bir-part-title">Part II — Computation of Cumulative Income Tax (Quarter ${qtr})</div>
        ${r.nonTaxableTotal > 0 ? `
        ${birRow('',  'Total Collections (all income types, VAT-exclusive)', r.totalGrossAll || r.grossRevenue)}
        ${birRow('',  'Less: Non-Taxable Items (Reimbursements / Capital Contributions / Loan Proceeds)', r.nonTaxableTotal || 0)}` : ''}
        ${birRow(1,  `Gross Sales / Revenues (Cumulative Jan – ${['Mar','Jun','Sep','Dec'][qtr-1]}) — VAT-exclusive, Taxable Only`, r.grossRevenue)}
        ${birRow(2,  'Less: Cost of Sales / Services (COGS, Cumulative)', cogs)}
        ${birRow(3,  'Gross Income  (Line 1 − Line 2)', grossInc, 'bir-total')}
        ${birRow(4,  'Less: Total Allowable Deductions (Cumulative)', r.totalExpenses)}
        ${birRow(5,  'Cumulative Net Taxable Income  (Line 3 − Line 4)', ti, 'bir-total')}
        ${birRow(6,  `Cumulative RCIT — ${rcitPct}%  (Line 5 × ${rcitPct}%)`, rcit)}
        ${birRow(7,  `Cumulative MCIT — ${mcitPct}% of Gross Income  (Line 3 × ${mcitPct}%)`, mcit)}
        ${birRow(8,  mcitAppl
            ? 'Cumulative Income Tax Due — Higher of RCIT (Line 6) or MCIT (Line 7)'
            : 'Cumulative Income Tax Due — RCIT only (MCIT not yet applicable)',
          txDue, 'bir-total')}
        ${birRow(9,  'Less: Income Tax Paid in Previous Quarter(s)', 0)}
        ${birRow(10, 'Income Tax Due this Quarter  (Line 8 − Line 9)', txDue, 'bir-payable')}
        ${birRow(11, 'Less: Creditable Withholding Tax (CWT)', 0)}
        ${birRow(12, 'Net Tax Due / (Overpayment)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Penalties</div>
        ${birRow(13, 'Surcharge', 0)}
        ${birRow(14, 'Interest', 0)}
        ${birRow(15, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Summary</div>
        ${birRow('', 'Total Amount Payable / (Overpayment)  (Lines 12 + 13 + 14 + 15)', txDue, 'bir-payable')}
      </div>
      <div class="bir-sig">
        <div class="bir-sig-box">Signature over Printed Name of Authorized Officer</div>
        <div class="bir-sig-box">Title / Designation</div>
        <div class="bir-sig-box">TIN of Signatory</div>
        <div class="bir-sig-box">Date Signed</div>
      </div>
      <p class="bir-note">${r.txCount} transaction(s) in cumulative figures · Due: 60 days after end of quarter · ${applyMCIT ? `MCIT ${mcitPct}% applies` : `RCIT ${rcitPct}% applies`} · All amounts in Philippine Peso (₱).</p>
    </div>`;
  }

  // ── 2551M / 2551Q (Percentage Tax — OPT) ─────────────────────────────────
  if (isOPT) {
    const optPct = (r.optRate * 100).toFixed(0);
    const peso = n => `₱ ${(+(n || 0)).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const schRow = (atc, nature, taxBase, rate, taxDue, cls = '') => `
      <tr class="${cls}">
        <td style="padding:4px 8px;border:1px solid #ccc;">${atc}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;">${nature}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:right;">${typeof taxBase === 'number' ? peso(taxBase) : taxBase}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:center;">${rate}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;text-align:right;">${typeof taxDue === 'number' ? peso(taxDue) : taxDue}</td>
      </tr>`;
    return `${birCss}
    <div class="bir-wrap">
      <div class="bir-header">
        <div class="form-no">BIR Form No. ${effectiveBirType}</div>
        <div class="form-title">${effectiveBirType === '2551Q'
          ? 'Quarterly Percentage Tax Return'
          : 'Monthly Percentage Tax Return'}</div>
        <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
      </div>
      ${partI}
      <div class="bir-part">
        <div class="bir-part-title">Schedule 1 — Breakdown of Gross Sales/Receipts (by ATC)</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;">
          <thead>
            <tr style="background:#f0f0f0;">
              <th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">ATC</th>
              <th style="padding:4px 8px;border:1px solid #ccc;text-align:left;">Nature of Income Payment</th>
              <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">Taxable Amount (₱)</th>
              <th style="padding:4px 8px;border:1px solid #ccc;text-align:center;">Rate</th>
              <th style="padding:4px 8px;border:1px solid #ccc;text-align:right;">Tax Due (₱)</th>
            </tr>
          </thead>
          <tbody>
            ${schRow('PT 010', 'Gross Sales/Receipts/Revenues/Fees — Sec. 116', r.grossSales, `${optPct}%`, r.percentageTax)}
            ${schRow('', '<strong>Item 14 — Total (from Schedule 1)</strong>', r.grossSales, '', r.percentageTax, 'bir-total')}
          </tbody>
        </table>
        <p style="font-size:11px;color:#666;margin:4px 0 0;">
          Item 15 (Less: Tax Credits/Payments from BIR 2307 received) — enter manually on the actual form.
        </p>
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part II — Computation of Tax</div>
        ${birRow(14, 'Total Percentage Tax Due (from Schedule 1)', r.percentageTax, 'bir-total')}
        ${birRow(15, 'Less: Tax Credits / Payments (from 2307s received)', 0)}
        ${birRow(16, 'Tax Still Due / (Overpayment)  (Item 14 − Item 15)', r.percentageTax, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Penalties</div>
        ${birRow(17, 'Surcharge', 0)}
        ${birRow(18, 'Interest', 0)}
        ${birRow(19, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Summary</div>
        ${birRow(20, 'Total Amount Payable / (Overpayment)  (Items 16 + 17 + 18 + 19)', r.percentageTax, 'bir-payable')}
      </div>
      <div class="bir-sig">
        <div class="bir-sig-box">Signature over Printed Name of Authorized Representative</div>
        <div class="bir-sig-box">Title / Position</div>
        <div class="bir-sig-box">TIN of Signatory</div>
        <div class="bir-sig-box">Date</div>
      </div>
      <p class="bir-note">${r.txCount} transaction(s) included in this return · ${dueNote}</p>
    </div>`;
  }

  // ── 2550M / 2550Q (VAT) — official BIR item numbers ──────────────────────
  // Use prefill (vatType-aware breakdown) when available, else fall back to r
  const p31A = prefill ? prefill.item31A : Math.max(0, r.grossSales - r.outputVAT);
  const p31B = prefill ? prefill.item31B : (r.outputVAT || 0);
  const p32A = prefill ? prefill.item32A : (r.zeroRated  || 0);
  const p33A = prefill ? prefill.item33A : (r.exempt || 0);
  const p34  = prefill ? prefill.item34  : (p31A + p32A + p33A);
  const p44A = prefill ? prefill.item44A : (r.grossPurchases || 0);
  const p44B = prefill ? prefill.item44B : (r.inputVAT || 0);
  const p46  = p44B;   // Total available input tax (no carryover assumed)
  const p47  = p44B;   // Allowable input tax
  const p60  = Math.max(0, p31B - p47);   // Output tax less allowable input
  const p61V = prefill ? prefill.vatPayable  : (r.netVATDue       || 0);
  const p61E = prefill ? prefill.excessInput : (r.excessInputVAT  || 0);

  return `${birCss}
  <div class="bir-wrap">
    <div class="bir-header">
      <div class="form-no">BIR Form No. ${effectiveBirType}</div>
      <div class="form-title">${effectiveBirType === '2550Q'
        ? 'Quarterly Value-Added Tax Return'
        : 'Monthly Value-Added Tax Declaration'}</div>
      <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
    </div>
    ${partI}
    <div class="bir-part">
      <div class="bir-part-title">Part IV — Sales/Receipts &amp; Output Tax</div>
      ${birRow('31A', 'Taxable Sales / Receipts (VAT-exclusive)', p31A)}
      ${birRow('31B', 'Output Tax on Taxable Sales  (31A × 12%)', p31B)}
      ${birRow('32A', 'Zero-Rated Sales / Receipts', p32A)}
      ${birRow('33A', 'VAT-Exempt Sales / Receipts', p33A)}
      ${birRow('34',  'Total Sales / Receipts  (31A + 32A + 33A)', p34, 'bir-total')}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part IV — Purchases &amp; Input Tax</div>
      ${birRow('44A', 'Purchases Subject to Input Tax (Gross Amount)', p44A)}
      ${birRow('44B', 'Input Tax from Current Period Purchases  (44A × 12/112)', p44B)}
      ${birRow('45',  'Input Tax Carried Over from Previous Period', 0)}
      ${birRow('46',  'Total Available Input Tax  (44B + 45)', p46, 'bir-total')}
      ${birRow('47',  'Allowable Input Tax', p47)}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part IV — Net VAT Payable / Excess Input Tax</div>
      ${birRow('60',  'Output Tax Less Allowable Input Tax  (31B − 47)', p60)}
      ${birRow('61',  p61V > 0 ? 'VAT Payable  (Item 60)' : 'Excess Input Tax Carried Over to Next Period',
                      p61V > 0 ? p61V : p61E,
                      p61V > 0 ? 'bir-payable' : '')}
      ${birRow('62',  'Less: Tax Credits / Payments (from 2307s issued to you)', 0)}
      ${birRow('63',  'Tax Still Due / (Overpayment)  (61 − 62)', p61V > 0 ? p61V : 0, 'bir-payable')}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part V — Penalties</div>
      ${birRow('64', 'Surcharge', 0)}
      ${birRow('65', 'Interest', 0)}
      ${birRow('66', 'Compromise', 0)}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part VI — Summary</div>
      ${birRow('67', 'Total Amount Payable / (Overpayment)  (Items 63 + 64 + 65 + 66)', p61V > 0 ? p61V : 0, 'bir-payable')}
    </div>
    <div class="bir-sig">
      <div class="bir-sig-box">Signature over Printed Name of Authorized Representative</div>
      <div class="bir-sig-box">Title / Position</div>
      <div class="bir-sig-box">TIN of Signatory</div>
      <div class="bir-sig-box">Date</div>
    </div>
    <p class="bir-note">${(prefill || r).txCount} transaction(s) included · ${dueNote} · All amounts are in Philippine Peso (₱).</p>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BIR Form 1601-EQ — Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)
// ─────────────────────────────────────────────────────────────────────────────
export function build1601EQHtml({ txns, client, birYear, qStart, periodLabel }) {
  const c = client || {};
  const tinFormatted = (c.tin || '').replace(/[^0-9]/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d*)/, '$1-$2-$3-$4').replace(/-$/, '');
  const qMths = [qStart, qStart + 1, qStart + 2];
  const qNum  = qStart === 1 ? 1 : qStart === 4 ? 2 : qStart === 7 ? 3 : 4;
  const endMonthLabel = ['March', 'June', 'September', 'December'][qNum - 1];

  const ATC_MAP = {
    0.01: { atc: 'WC010', description: 'Supplier of Goods — Top 20,000 Corporations' },
    0.02: { atc: 'WC020', description: 'Supplier of Services / Contractors' },
    0.05: { atc: 'WF010', description: 'Professional / Talent Fees (5%)' },
    0.10: { atc: 'WF020', description: 'Professional / Talent Fees (10%)' },
    0.15: { atc: 'WR010', description: 'Rental — Real / Personal Property (15%)' },
    0.25: { atc: 'WF000', description: 'Non-Resident Payees (25%)' },
  };

  const filtered = (txns || []).filter(t => {
    const d = new Date(t.createdAt);
    return d.getFullYear() === birYear && qMths.includes(d.getMonth() + 1)
      && t.type === 'expense' && parseFloat(t.ewtRate) > 0 && t.ewtAmount > 0;
  });

  const byAtc = {};
  filtered.forEach(t => {
    const rate = parseFloat(t.ewtRate);
    const info = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate * 100)).padStart(3, '0')}`, description: `EWT ${(rate * 100).toFixed(0)}%` };
    const key = info.atc;
    byAtc[key] = byAtc[key] || { ...info, rate, base: 0, ewt: 0 };
    byAtc[key].base = Math.round((byAtc[key].base + (t.amount_net || 0)) * 100) / 100;
    byAtc[key].ewt  = Math.round((byAtc[key].ewt  + (t.ewtAmount  || 0)) * 100) / 100;
  });
  const atcList  = Object.values(byAtc);
  const totalEWT  = Math.round(atcList.reduce((s, a) => s + a.ewt,  0) * 100) / 100;
  const totalBase = Math.round(atcList.reduce((s, a) => s + a.base, 0) * 100) / 100;

  const atcRows = atcList.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#999;font-style:italic;padding:14px">No EWT transactions for this quarter</td></tr>`
    : atcList.map(a => `
        <tr>
          <td style="font-family:monospace;font-weight:700;color:#003087;padding:6px 8px;border:1px solid #ddd">${a.atc}</td>
          <td style="padding:6px 8px;border:1px solid #ddd">${a.description}</td>
          <td style="text-align:right;padding:6px 8px;border:1px solid #ddd">${peso(a.base)}</td>
          <td style="text-align:right;padding:6px 8px;border:1px solid #ddd">${(a.rate * 100).toFixed(0)}%</td>
          <td style="text-align:right;font-weight:700;padding:6px 8px;border:1px solid #ddd">${peso(a.ewt)}</td>
        </tr>`).join('');

  const payeeRows = filtered.map(t => {
    const d    = new Date(t.createdAt);
    const rate = parseFloat(t.ewtRate);
    const info = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate * 100)).padStart(3, '0')}` };
    return `
      <tr>
        <td style="padding:5px 8px;border:1px solid #ddd">${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</td>
        <td style="padding:5px 8px;border:1px solid #ddd">${t.counterpartyName || '—'}</td>
        <td style="font-family:monospace;font-weight:700;color:#003087;padding:5px 8px;border:1px solid #ddd">${info.atc}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;color:#555">${t.description || '—'}</td>
        <td style="text-align:right;padding:5px 8px;border:1px solid #ddd">${peso(t.amount_net || 0)}</td>
        <td style="text-align:right;padding:5px 8px;border:1px solid #ddd">${(rate * 100).toFixed(0)}%</td>
        <td style="text-align:right;font-weight:700;padding:5px 8px;border:1px solid #ddd">${peso(t.ewtAmount || 0)}</td>
      </tr>`;
  }).join('');

  return `${birCss}
  <div class="bir-wrap">
    <div class="bir-header">
      <div class="form-no">BIR Form No. 1601-EQ</div>
      <div class="form-title">Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)</div>
      <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part I — Background Information</div>
      <div class="bir-row">
        ${birField('1 Taxpayer Identification Number (TIN)', tinFormatted || c.tin || '', 'flex:1.5')}
        ${birField('2 RDO Code', c.rdoCode || '', 'width:80px')}
        ${birField('3 Line of Business / Occupation', c.businessType || c.type || '', 'flex:2')}
      </div>
      <div class="bir-row">
        ${birField("4 Taxpayer's Name", c.tradeName || '', 'flex:3')}
        ${birField('5 Tax Type', 'EWT (Expanded Withholding Tax)', 'flex:1.5')}
      </div>
      <div class="bir-row">
        ${birField('6 Registered Address', c.address || '', 'flex:3')}
        ${birField('ZIP Code', c.zipCode || '', 'width:70px')}
        ${birField('7 Telephone', c.telephone || '', 'flex:1')}
      </div>
      <div class="bir-row">
        ${birField('8 Amended Return?', 'No', 'flex:1')}
        ${birField('9 Return Period', `Q${qNum} — Jan–${endMonthLabel} ${birYear}`, 'flex:2')}
        ${birField('10 No. of Sheets Attached', String(filtered.length), 'flex:1')}
      </div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part II — Computation of Tax (Schedule of EWT by ATC)</div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin:0">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;width:90px">ATC</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc">Nature of Income Payment</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:120px">Income Payment</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:70px">Tax Rate</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:120px">Tax Withheld</th>
          </tr>
        </thead>
        <tbody>${atcRows}</tbody>
        <tfoot>
          <tr style="background:#f8f8f8;font-weight:700">
            <td colspan="4" style="padding:8px;border:1px solid #ccc">TOTAL EWT Withheld for the Quarter (Line 1)</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(totalEWT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part III — Tax Due / Penalties</div>
      ${birRow(1, 'Total EWT Withheld for the Quarter', totalEWT)}
      ${birRow(2, 'Less: Tax Remitted in Previous Month(s) of the Quarter (if applicable)', 0)}
      ${birRow(3, 'Tax Still Due / (Overpayment) (Line 1 − Line 2)', totalEWT, 'bir-total')}
      <div class="bir-row"><div class="bir-lineno"></div><div class="bir-cell" style="flex:1;font-weight:700;font-size:8pt;padding:4px 6px">ADD PENALTIES:</div></div>
      ${birRow(4, 'Surcharge (25% / 50%)', 0)}
      ${birRow(5, 'Interest (12% per annum)', 0)}
      ${birRow(6, 'Compromise', 0)}
      ${birRow('', 'TOTAL AMOUNT PAYABLE / (OVERPAYMENT) (Lines 3 + 4 + 5 + 6)', totalEWT, 'bir-payable')}
    </div>

    ${filtered.length > 0 ? `
    <div class="bir-part" style="margin-top:14px">
      <div class="bir-part-title">Annex — Schedule of Individual EWT Transactions (${filtered.length} transaction${filtered.length !== 1 ? 's' : ''})</div>
      <table style="width:100%;border-collapse:collapse;font-size:8pt;margin:0">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">Date</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">Payee</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">ATC</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">Description</th>
            <th style="padding:5px 8px;text-align:right;border:1px solid #ccc">NET Amount</th>
            <th style="padding:5px 8px;text-align:right;border:1px solid #ccc">Rate</th>
            <th style="padding:5px 8px;text-align:right;border:1px solid #ccc">EWT Withheld</th>
          </tr>
        </thead>
        <tbody>${payeeRows}</tbody>
        <tfoot>
          <tr style="background:#f8f8f8;font-weight:700">
            <td colspan="4" style="padding:6px 8px;border:1px solid #ccc">TOTAL</td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ccc">${peso(totalBase)}</td>
            <td style="border:1px solid #ccc"></td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ccc">${peso(totalEWT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>` : ''}

    <div style="margin-top:16px;display:flex;gap:16px">
      <div class="bir-sig-box">Signature over Printed Name of Authorized Representative</div>
      <div class="bir-sig-box">Title / Position</div>
      <div class="bir-sig-box">TIN of Signatory</div>
      <div class="bir-sig-box">Date</div>
    </div>
    <p class="bir-note">${filtered.length} EWT transaction(s) included · Due: Last day of the month after quarter end · All amounts in Philippine Peso (₱).</p>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BIR Form 1604-EQ — Annual Information Return of Creditable Income Taxes Withheld (Expanded)
// ─────────────────────────────────────────────────────────────────────────────
export function build1604EQHtml({ txns, client, birYear }) {
  const c = client || {};
  const tinFormatted = (c.tin || '').replace(/[^0-9]/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d*)/, '$1-$2-$3-$4').replace(/-$/, '');

  const ATC_MAP = {
    0.01: { atc: 'WC010', description: 'Supplier of Goods — Top 20,000 Corporations' },
    0.02: { atc: 'WC020', description: 'Supplier of Services / Contractors' },
    0.05: { atc: 'WF010', description: 'Professional / Talent Fees (5%)' },
    0.10: { atc: 'WF020', description: 'Professional / Talent Fees (10%)' },
    0.15: { atc: 'WR010', description: 'Rental — Real / Personal Property (15%)' },
    0.25: { atc: 'WF000', description: 'Non-Resident Payees (25%)' },
  };

  // All EWT transactions for the year
  const filtered = (txns || []).filter(t => {
    const d = new Date(t.createdAt);
    return d.getFullYear() === birYear && t.type === 'expense'
      && parseFloat(t.ewtRate) > 0 && t.ewtAmount > 0;
  });

  // Quarterly breakdown [Q1, Q2, Q3, Q4] → months [1-3, 4-6, 7-9, 10-12]
  const qRanges = [[1,3],[4,6],[7,9],[10,12]];
  const qTotals = qRanges.map(([m1, m2]) => {
    const qTxns = filtered.filter(t => { const m = new Date(t.createdAt).getMonth() + 1; return m >= m1 && m <= m2; });
    return Math.round(qTxns.reduce((s, t) => s + (t.ewtAmount || 0), 0) * 100) / 100;
  });

  // Annual ATC summary
  const byAtc = {};
  filtered.forEach(t => {
    const rate = parseFloat(t.ewtRate);
    const info = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate * 100)).padStart(3, '0')}`, description: `EWT ${(rate * 100).toFixed(0)}%` };
    const key = info.atc;
    byAtc[key] = byAtc[key] || { ...info, rate, base: 0, ewt: 0, q: [0,0,0,0] };
    byAtc[key].base = Math.round((byAtc[key].base + (t.amount_net || 0)) * 100) / 100;
    byAtc[key].ewt  = Math.round((byAtc[key].ewt  + (t.ewtAmount  || 0)) * 100) / 100;
    // quarterly breakdown per ATC
    const m  = new Date(t.createdAt).getMonth() + 1;
    const qi = m <= 3 ? 0 : m <= 6 ? 1 : m <= 9 ? 2 : 3;
    byAtc[key].q[qi] = Math.round((byAtc[key].q[qi] + (t.ewtAmount || 0)) * 100) / 100;
  });
  const atcList  = Object.values(byAtc);
  const totalEWT  = Math.round(atcList.reduce((s, a) => s + a.ewt,  0) * 100) / 100;
  const totalBase = Math.round(atcList.reduce((s, a) => s + a.base, 0) * 100) / 100;

  const atcRows = atcList.length === 0
    ? `<tr><td colspan="7" style="text-align:center;color:#999;font-style:italic;padding:14px">No EWT transactions for this year</td></tr>`
    : atcList.map(a => `
        <tr>
          <td style="font-family:monospace;font-weight:700;color:#003087;padding:6px 8px;border:1px solid #ddd">${a.atc}</td>
          <td style="padding:6px 8px;border:1px solid #ddd">${a.description}</td>
          <td style="text-align:right;padding:6px 8px;border:1px solid #ddd">${peso(a.base)}</td>
          <td style="text-align:right;padding:6px 8px;border:1px solid #ddd">${peso(a.q[0])}</td>
          <td style="text-align:right;padding:6px 8px;border:1px solid #ddd">${peso(a.q[1])}</td>
          <td style="text-align:right;padding:6px 8px;border:1px solid #ddd">${peso(a.q[2])}</td>
          <td style="text-align:right;padding:6px 8px;border:1px solid #ddd">${peso(a.q[3])}</td>
          <td style="text-align:right;font-weight:700;padding:6px 8px;border:1px solid #ddd">${peso(a.ewt)}</td>
        </tr>`).join('');

  // Payee annex (all year)
  const payeeRows = filtered.map(t => {
    const d    = new Date(t.createdAt);
    const rate = parseFloat(t.ewtRate);
    const info = ATC_MAP[rate] || { atc: `WC${String(Math.round(rate * 100)).padStart(3, '0')}` };
    return `
      <tr>
        <td style="padding:5px 8px;border:1px solid #ddd">${d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</td>
        <td style="padding:5px 8px;border:1px solid #ddd">${t.counterpartyName || '—'}</td>
        <td style="font-family:monospace;font-weight:700;color:#003087;padding:5px 8px;border:1px solid #ddd">${info.atc}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;color:#555">${t.description || '—'}</td>
        <td style="text-align:right;padding:5px 8px;border:1px solid #ddd">${peso(t.amount_net || 0)}</td>
        <td style="text-align:right;padding:5px 8px;border:1px solid #ddd">${(rate * 100).toFixed(0)}%</td>
        <td style="text-align:right;font-weight:700;padding:5px 8px;border:1px solid #ddd">${peso(t.ewtAmount || 0)}</td>
      </tr>`;
  }).join('');

  return `${birCss}
  <div class="bir-wrap">
    <div class="bir-header">
      <div class="form-no">BIR Form No. 1604-EQ</div>
      <div class="form-title">Annual Information Return of Creditable Income Taxes Withheld (Expanded)</div>
      <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part I — Background Information</div>
      <div class="bir-row">
        ${birField('1 Taxpayer Identification Number (TIN)', tinFormatted || c.tin || '', 'flex:1.5')}
        ${birField('2 RDO Code', c.rdoCode || '', 'width:80px')}
        ${birField('3 Line of Business / Occupation', c.businessType || c.type || '', 'flex:2')}
      </div>
      <div class="bir-row">
        ${birField("4 Taxpayer's Name", c.tradeName || '', 'flex:3')}
        ${birField('5 Tax Type', 'EWT (Expanded Withholding Tax)', 'flex:1.5')}
      </div>
      <div class="bir-row">
        ${birField('6 Registered Address', c.address || '', 'flex:3')}
        ${birField('ZIP Code', c.zipCode || '', 'width:70px')}
        ${birField('7 Telephone', c.telephone || '', 'flex:1')}
      </div>
      <div class="bir-row">
        ${birField('8 Amended Return?', 'No', 'flex:1')}
        ${birField('9 Return Period', `Annual — 01/01/${birYear} to 12/31/${birYear}`, 'flex:2')}
        ${birField('10 No. of Payees', String(new Set(filtered.map(t => t.counterpartyName || t.description)).size), 'flex:1')}
      </div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part II — Annual Summary of EWT by ATC (with Quarterly Breakdown)</div>
      <table style="width:100%;border-collapse:collapse;font-size:8pt;margin:0">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;width:80px">ATC</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc">Nature of Income Payment</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Total Income Payment</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:90px">Q1 EWT</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:90px">Q2 EWT</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:90px">Q3 EWT</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:90px">Q4 EWT</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Annual EWT</th>
          </tr>
        </thead>
        <tbody>${atcRows}</tbody>
        <tfoot>
          <tr style="background:#f8f8f8;font-weight:700">
            <td colspan="2" style="padding:8px;border:1px solid #ccc">ANNUAL TOTAL</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(totalBase)}</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(qTotals[0])}</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(qTotals[1])}</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(qTotals[2])}</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(qTotals[3])}</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(totalEWT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part III — Verification / Penalties</div>
      ${birRow(1, 'Total Annual EWT Withheld (Sum of all quarters)', totalEWT)}
      ${birRow(2, 'Less: Total EWT Remitted via Quarterly 1601-EQ Returns', totalEWT)}
      ${birRow(3, 'Tax Still Due / (Overpayment) (Line 1 − Line 2)', 0, 'bir-total')}
      <div class="bir-row"><div class="bir-lineno"></div><div class="bir-cell" style="flex:1;font-weight:700;font-size:8pt;padding:4px 6px">ADD PENALTIES (if any):</div></div>
      ${birRow(4, 'Surcharge (25% / 50%)', 0)}
      ${birRow(5, 'Interest (12% per annum)', 0)}
      ${birRow(6, 'Compromise', 0)}
      ${birRow('', 'TOTAL AMOUNT PAYABLE / (OVERPAYMENT)', 0, 'bir-payable')}
      <p style="font-size:8pt;color:#555;margin:8px 0 0;font-style:italic">
        Note: The 1604-EQ is an information return filed annually. EWT was remitted quarterly via BIR Form 1601-EQ.
        Attach the Alphalist of Payees (1604-EQ Annex) — available in the Alphalist tab.
      </p>
    </div>

    ${filtered.length > 0 ? `
    <div class="bir-part" style="margin-top:14px">
      <div class="bir-part-title">Annex — Complete Schedule of EWT Transactions for ${birYear} (${filtered.length} transaction${filtered.length !== 1 ? 's' : ''})</div>
      <table style="width:100%;border-collapse:collapse;font-size:8pt;margin:0">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">Date</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">Payee</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">ATC</th>
            <th style="padding:5px 8px;text-align:left;border:1px solid #ccc">Description</th>
            <th style="padding:5px 8px;text-align:right;border:1px solid #ccc">NET Amount</th>
            <th style="padding:5px 8px;text-align:right;border:1px solid #ccc">Rate</th>
            <th style="padding:5px 8px;text-align:right;border:1px solid #ccc">EWT Withheld</th>
          </tr>
        </thead>
        <tbody>${payeeRows}</tbody>
        <tfoot>
          <tr style="background:#f8f8f8;font-weight:700">
            <td colspan="4" style="padding:6px 8px;border:1px solid #ccc">ANNUAL TOTAL</td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ccc">${peso(totalBase)}</td>
            <td style="border:1px solid #ccc"></td>
            <td style="padding:6px 8px;text-align:right;border:1px solid #ccc">${peso(totalEWT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>` : ''}

    <div style="margin-top:16px;display:flex;gap:16px">
      <div class="bir-sig-box">Signature over Printed Name of Authorized Representative</div>
      <div class="bir-sig-box">Title / Position</div>
      <div class="bir-sig-box">TIN of Signatory</div>
      <div class="bir-sig-box">Date</div>
    </div>
    <p class="bir-note">${filtered.length} EWT transaction(s) · Due: On or before March 1 of the following year · All amounts in Philippine Peso (₱).</p>
  </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BIR Form 1601-C — Monthly Remittance Return of Income Taxes Withheld on Compensation
// ─────────────────────────────────────────────────────────────────────────────
export function build1601CHtml({ payrollResult, client, monthLabel }) {
  const c = client || {};
  const tinFormatted = (c.tin || '').replace(/[^0-9]/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d*)/, '$1-$2-$3-$4').replace(/-$/, '');
  const result    = payrollResult || { employees: [], totals: {} };
  const employees = result.employees || [];
  const totals    = result.totals    || {};
  const totalWHT  = totals.total_monthly_wht     || 0;
  const totalBasic = totals.total_monthly_basic   || 0;

  const empRows = employees.length === 0
    ? `<tr><td colspan="6" style="text-align:center;color:#999;font-style:italic;padding:14px">No employees on record</td></tr>`
    : employees.map(e => `
        <tr>
          <td style="padding:5px 8px;border:1px solid #ddd">${e.name}</td>
          <td style="padding:5px 8px;border:1px solid #ddd;color:#555">${e.tin || '—'}</td>
          <td style="text-align:right;padding:5px 8px;border:1px solid #ddd">${peso(e.monthly_basic_salary)}</td>
          <td style="text-align:right;padding:5px 8px;border:1px solid #ddd">${peso(e.monthly_deductions)}</td>
          <td style="text-align:right;padding:5px 8px;border:1px solid #ddd">${peso(e.monthly_taxable)}</td>
          <td style="text-align:right;font-weight:700;padding:5px 8px;border:1px solid #ddd">${peso(e.monthly_wht)}</td>
        </tr>`).join('');

  return `${birCss}
  <div class="bir-wrap">
    <div class="bir-header">
      <div class="form-no">BIR Form No. 1601-C</div>
      <div class="form-title">Monthly Remittance Return of Income Taxes Withheld on Compensation</div>
      <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part I — Background Information</div>
      <div class="bir-row">
        ${birField('1 Taxpayer Identification Number (TIN)', tinFormatted || c.tin || '', 'flex:1.5')}
        ${birField('2 RDO Code', c.rdoCode || '', 'width:80px')}
        ${birField('3 Line of Business / Occupation', c.businessType || c.type || '', 'flex:2')}
      </div>
      <div class="bir-row">
        ${birField("4 Taxpayer's Name", c.tradeName || '', 'flex:3')}
        ${birField('5 Tax Type', 'WC (Withholding Tax on Compensation)', 'flex:1.5')}
      </div>
      <div class="bir-row">
        ${birField('6 Registered Address', c.address || '', 'flex:3')}
        ${birField('ZIP Code', c.zipCode || '', 'width:70px')}
        ${birField('7 Telephone', c.telephone || '', 'flex:1')}
      </div>
      <div class="bir-row">
        ${birField('8 Amended Return?', 'No', 'flex:1')}
        ${birField('9 Return Period', monthLabel || '', 'flex:2')}
        ${birField('10 No. of Employees', String(employees.length), 'flex:1')}
      </div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part II — Computation of Tax (Schedule of Employees)</div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin:0">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc">Employee Name</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;width:100px">TIN</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Monthly Basic</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Deductions</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Taxable</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">WHT</th>
          </tr>
        </thead>
        <tbody>${empRows}</tbody>
        <tfoot>
          <tr style="background:#f8f8f8;font-weight:700">
            <td colspan="2" style="padding:8px;border:1px solid #ccc">TOTAL (${employees.length} employee${employees.length !== 1 ? 's' : ''})</td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(totalBasic)}</td>
            <td style="padding:8px;border:1px solid #ccc"></td>
            <td style="padding:8px;border:1px solid #ccc"></td>
            <td style="padding:8px;text-align:right;border:1px solid #ccc">${peso(totalWHT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part III — Tax Due / Penalties</div>
      ${birRow(1, 'Total Taxes Withheld on Compensation for the Month', totalWHT)}
      ${birRow(2, 'Less: Tax Remitted in Previous Return (if amended)', 0)}
      ${birRow(3, 'Tax Still Due / (Overpayment) (Line 1 − Line 2)', totalWHT, 'bir-total')}
      <div class="bir-row"><div class="bir-lineno"></div><div class="bir-cell" style="flex:1;font-weight:700;font-size:8pt;padding:4px 6px">ADD PENALTIES:</div></div>
      ${birRow(4, 'Surcharge (25% / 50%)', 0)}
      ${birRow(5, 'Interest (12% per annum)', 0)}
      ${birRow(6, 'Compromise', 0)}
      ${birRow('', 'TOTAL AMOUNT PAYABLE / (OVERPAYMENT) (Lines 3 + 4 + 5 + 6)', totalWHT, 'bir-payable')}
    </div>

    <div style="margin-top:16px;display:flex;gap:16px">
      <div class="bir-sig-box">Signature over Printed Name of Authorized Representative</div>
      <div class="bir-sig-box">Title / Position</div>
      <div class="bir-sig-box">TIN of Signatory</div>
      <div class="bir-sig-box">Date</div>
    </div>
    <p class="bir-note">${employees.length} employee(s) · Due: On or before the 10th of the following month · All amounts in Philippine Peso (₱).</p>
  </div>`;
}

export function buildAlphalistHtml({ rows, clientName, period }) {
  const withTin    = rows.filter(r => r.tin !== '—');
  const withoutTin = rows.filter(r => r.tin === '—');
  const totalNet   = rows.reduce((s, r) => s + r.net, 0);
  const totalVat   = rows.reduce((s, r) => s + r.vat, 0);
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalEWT   = rows.reduce((s, r) => s + r.ewt, 0);

  const tableRows = (data, showEWT) => data.length === 0
    ? `<tr><td colspan="${showEWT ? 8 : 7}" style="text-align:center;color:#999;font-style:italic;padding:12px">No records</td></tr>`
    : data.map(r => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #ddd;font-family:monospace;font-size:8pt">${r.tin}</td>
        <td style="padding:5px 8px;border:1px solid #ddd">${r.name}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;color:#555;font-size:8pt">${r.address}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right">${r.txCount}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right">${peso(r.net)}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right">${peso(r.vat)}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-weight:600">${peso(r.gross)}</td>
        ${showEWT ? `<td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-weight:700;color:#c84b00">${r.ewt > 0 ? peso(r.ewt) : '—'}</td>` : ''}
      </tr>`).join('');

  const tableFooter = (data, showEWT) => `
    <tr style="background:#f8f8f8;font-weight:700">
      <td colspan="3" style="padding:7px 8px;border:1px solid #ddd">TOTAL (${data.length} vendors)</td>
      <td style="padding:7px 8px;border:1px solid #ddd;text-align:right">${data.reduce((s,r)=>s+r.txCount,0)}</td>
      <td style="padding:7px 8px;border:1px solid #ddd;text-align:right">${peso(data.reduce((s,r)=>s+r.net,0))}</td>
      <td style="padding:7px 8px;border:1px solid #ddd;text-align:right">${peso(data.reduce((s,r)=>s+r.vat,0))}</td>
      <td style="padding:7px 8px;border:1px solid #ddd;text-align:right">${peso(data.reduce((s,r)=>s+r.gross,0))}</td>
      ${showEWT ? `<td style="padding:7px 8px;border:1px solid #ddd;text-align:right;color:#c84b00">${peso(data.reduce((s,r)=>s+r.ewt,0))}</td>` : ''}
    </tr>`;

  const thead = (showEWT) => `
    <tr style="background:#f0f0f0">
      <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;width:100px">TIN</th>
      <th style="padding:6px 8px;text-align:left;border:1px solid #ccc">Vendor / Payee Name</th>
      <th style="padding:6px 8px;text-align:left;border:1px solid #ccc">Address</th>
      <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:40px">Tx</th>
      <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Net Purchases</th>
      <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Input VAT</th>
      <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">Gross Purchases</th>
      ${showEWT ? '<th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:110px">EWT Withheld</th>' : ''}
    </tr>`;

  return `
  <div style="font-family:Arial,sans-serif;font-size:9pt;color:#000;max-width:760px">
    <div style="text-align:center;border:2px solid #000;padding:8px;margin-bottom:0">
      <div style="font-size:13pt;font-weight:700">Alphalist of Payees</div>
      <div style="font-size:9pt;font-weight:600">Annex to BIR Form 1604-EQ — Expanded Withholding Tax</div>
      <div style="font-size:8pt">Taxpayer: ${clientName} · Period: ${period}</div>
    </div>

    ${withTin.length > 0 ? `
    <div style="background:#000;color:#fff;font-weight:700;font-size:8pt;padding:3px 6px;text-transform:uppercase;letter-spacing:.05em">
      Part I — Payees with TIN (${withTin.length} records) — Alphalist Reportable
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:0">
      <thead>${thead(true)}</thead>
      <tbody>${tableRows(withTin, true)}${tableFooter(withTin, true)}</tbody>
    </table>` : ''}

    ${withoutTin.length > 0 ? `
    <div style="background:#555;color:#fff;font-weight:700;font-size:8pt;padding:3px 6px;text-transform:uppercase;letter-spacing:.05em;margin-top:12px">
      Part II — Payees without TIN (${withoutTin.length} records) — Needs Follow-up
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:0">
      <thead>${thead(false)}</thead>
      <tbody>${tableRows(withoutTin, false)}${tableFooter(withoutTin, false)}</tbody>
    </table>` : ''}

    <div style="margin-top:16px;border:1px solid #ccc;padding:8px;display:flex;gap:32px;font-size:9pt">
      <span><strong>Total Vendors:</strong> ${rows.length}</span>
      <span><strong>Total Net Purchases:</strong> ${peso(totalNet)}</span>
      <span><strong>Total Input VAT:</strong> ${peso(totalVat)}</span>
      <span><strong>Total Gross:</strong> ${peso(totalGross)}</span>
      <span><strong>Total EWT Withheld:</strong> ${peso(totalEWT)}</span>
    </div>
  </div>`;
}

export function build2307Html({ payee, client, period, atcList }) {
  const c = client || {};
  const p = payee  || {};
  const tinFmt = tin => (tin || '').replace(/[^0-9]/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d*)/, '$1-$2-$3-$4').replace(/-$/, '');
  const totalEWT  = Math.round(atcList.reduce((s, a) => s + (a.ewt || 0), 0) * 100) / 100;
  const totalBase = Math.round(atcList.reduce((s, a) => s + (a.base || 0), 0) * 100) / 100;

  const atcRows = atcList.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#999;font-style:italic;padding:10px">No EWT transactions</td></tr>`
    : atcList.map(a => `
      <tr>
        <td style="padding:5px 8px;border:1px solid #ddd;font-family:monospace;font-weight:700;color:#003087">${a.atc}</td>
        <td style="padding:5px 8px;border:1px solid #ddd">${a.description}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right">${peso(a.base)}</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right">${(a.rate * 100).toFixed(0)}%</td>
        <td style="padding:5px 8px;border:1px solid #ddd;text-align:right;font-weight:700">${peso(a.ewt)}</td>
      </tr>`).join('');

  return `${birCss}
  <div class="bir-wrap">
    <div class="bir-header">
      <div class="form-no">BIR Form No. 2307</div>
      <div class="form-title">Certificate of Creditable Tax Withheld at Source</div>
      <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part I — Payee Information (Supplier / Vendor)</div>
      <div class="bir-row">
        ${birField('1 Payee TIN', tinFmt(p.tin) || p.tin || '—', 'flex:1.5')}
        ${birField('2 Payee Name', p.name || '—', 'flex:3')}
      </div>
      <div class="bir-row">
        ${birField('3 Payee Registered Address', p.address || '—', 'flex:4')}
      </div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part II — Withholding Agent Information (Your Business)</div>
      <div class="bir-row">
        ${birField('4 Withholding Agent TIN', tinFmt(c.tin) || c.tin || '—', 'flex:1.5')}
        ${birField('5 Withholding Agent Name', c.tradeName || '—', 'flex:3')}
      </div>
      <div class="bir-row">
        ${birField('6 Registered Address', c.address || '—', 'flex:3')}
        ${birField('ZIP', c.zipCode || '—', 'width:70px')}
        ${birField('7 Telephone', c.telephone || '—', 'flex:1')}
      </div>
      <div class="bir-row">
        ${birField('8 Return Period', period || '—', 'flex:2')}
        ${birField('9 Date of Remittance', '—', 'flex:1.5')}
        ${birField('10 Amended?', 'No', 'flex:0.8')}
      </div>
    </div>

    <div class="bir-part">
      <div class="bir-part-title">Part III — Schedule of Income Payments and Taxes Withheld</div>
      <table style="width:100%;border-collapse:collapse;font-size:8.5pt;margin:0">
        <thead>
          <tr style="background:#f0f0f0">
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc;width:90px">ATC</th>
            <th style="padding:6px 8px;text-align:left;border:1px solid #ccc">Nature of Income Payment</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:120px">Income Payment</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:70px">Rate</th>
            <th style="padding:6px 8px;text-align:right;border:1px solid #ccc;width:120px">Tax Withheld</th>
          </tr>
        </thead>
        <tbody>${atcRows}</tbody>
        <tfoot>
          <tr style="background:#f8f8f8;font-weight:700">
            <td colspan="2" style="padding:7px 8px;border:1px solid #ccc">TOTAL</td>
            <td style="padding:7px 8px;border:1px solid #ccc;text-align:right">${peso(totalBase)}</td>
            <td style="border:1px solid #ccc"></td>
            <td style="padding:7px 8px;border:1px solid #ccc;text-align:right">${peso(totalEWT)}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div style="margin-top:14px;display:flex;gap:16px">
      <div class="bir-sig-box" style="flex:2">Signature of Withholding Agent / Authorized Representative over Printed Name</div>
      <div class="bir-sig-box">TIN</div>
      <div class="bir-sig-box">Title / Position</div>
      <div class="bir-sig-box">Date</div>
    </div>
    <p class="bir-note">This certificate is issued by the withholding agent to the payee. Keep this for your records — use it to claim tax credits on your income tax return.</p>
  </div>`;
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
