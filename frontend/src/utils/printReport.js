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

export function buildBIRReturnHtml({ isOPT, effectiveBirType, periodLabel, birYear, r, client }) {
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

  // ── 1702 — Annual Corporate Income Tax Return ────────────────────────────
  if (effectiveBirType === '1702') {
    const ti    = r.taxableIncome || 0;
    const txDue = r.taxDue        || 0;
    const rate  = c.isMsme ? 20 : 25;
    const corpPartI = `
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
          ${birField('9 MSME?', c.isMsme ? 'YES — 20% RCIT' : 'NO — 25% RCIT', 'flex:1')}
          ${birField('10 Date of Incorporation', c.incorporationDate ? new Date(c.incorporationDate).toLocaleDateString('en-US') : '', 'flex:1.5')}
          ${birField('11 Tax Year (YYYY)', String(r.year || birYear), 'flex:0.8')}
        </div>
      </div>`;
    return `${birCss}
    <div class="bir-wrap">
      <div class="bir-header">
        <div class="form-no">BIR Form No. 1702</div>
        <div class="form-title">Annual Income Tax Return — Corporations, Partnerships, and Other Non-Individual Taxpayers</div>
        <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue</div>
      </div>
      ${corpPartI}
      <div class="bir-part">
        <div class="bir-part-title">Part II — Computation of Income Tax</div>
        ${birRow(1,  'Gross Sales / Revenues / Receipts / Fees', r.grossRevenue)}
        ${birRow(2,  'Less: Cost of Sales / Services (COGS)', 0)}
        ${birRow(3,  'Gross Income  (Line 1 − Line 2)', r.grossRevenue, 'bir-total')}
        ${birRow(4,  'Less: Allowable Deductions / Operating Expenses', r.totalExpenses)}
        ${birRow(5,  'Taxable Income (Net Income)  (Line 3 − Line 4)', ti, 'bir-total')}
        ${birRow(6,  `Regular Corporate Income Tax (RCIT) — ${rate}%`, txDue)}
        ${birRow(7,  'Minimum Corporate Income Tax (MCIT) — 2% of Gross Income', Math.round(r.grossRevenue * 0.02 * 100) / 100)}
        ${birRow(8,  `Income Tax Due (Higher of RCIT or MCIT = RCIT ${rate}%)`, txDue, 'bir-total')}
        ${birRow(9,  'Less: Tax Credits / CWT / Payments', 0)}
        ${birRow(10, 'Net Tax Due / (Overpayment)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Penalties</div>
        ${birRow(11, 'Surcharge (25% / 50%)', 0)}
        ${birRow(12, 'Interest (12% per annum)', 0)}
        ${birRow(13, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Summary</div>
        ${birRow('', 'Total Amount Payable / (Overpayment)  (Lines 10 + 11 + 12 + 13)', txDue, 'bir-payable')}
      </div>
      <div class="bir-sig">
        <div class="bir-sig-box">Signature over Printed Name of Authorized Officer</div>
        <div class="bir-sig-box">Title / Designation</div>
        <div class="bir-sig-box">TIN of Signatory</div>
        <div class="bir-sig-box">Date Signed</div>
      </div>
      <p class="bir-note">${r.txCount} transaction(s) included · Due: April 15 of the following year · Rate: ${rate}% RCIT · All amounts in Philippine Peso (₱).</p>
    </div>`;
  }

  // ── 1702Q — Quarterly Corporate Income Tax Return ────────────────────────
  if (effectiveBirType === '1702Q') {
    const ti      = r.taxableIncome || 0;
    const txDue   = r.taxDue        || 0;
    const rate    = c.isMsme ? 20 : 25;
    const qtr     = r.quarter || 1;
    const qLabel  = `Q${qtr} (Cumulative Jan – ${['Mar','Jun','Sep','Dec'][qtr - 1]})`;
    return `${birCss}
    <div class="bir-wrap">
      <div class="bir-header">
        <div class="form-no">BIR Form No. 1702Q</div>
        <div class="form-title">Quarterly Income Tax Return — Corporations, Partnerships, and Other Non-Individual Taxpayers</div>
        <div class="form-sub">Republic of the Philippines · Department of Finance · Bureau of Internal Revenue · Period: ${qLabel} ${r.year || birYear}</div>
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part I — Background Information</div>
        <div class="bir-row">
          ${birField('1 TIN', tinFormatted || '', 'flex:1.5')}
          ${birField('2 RDO Code', c.rdoCode || '', 'width:80px')}
          ${birField('3 Line of Business', c.businessType || '', 'flex:2')}
        </div>
        <div class="bir-row">
          ${birField('4 Corporate Name', c.tradeName || '', 'flex:3')}
          ${birField('5 Taxpayer Type', c.type || 'Corporation', 'flex:1')}
        </div>
        <div class="bir-row">
          ${birField('6 Registered Address', c.address || '', 'flex:3')}
          ${birField('ZIP', c.zipCode || '', 'width:60px')}
          ${birField('7 Quarter', qLabel, 'flex:1.5')}
        </div>
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part II — Computation of Cumulative Income Tax (Quarter ${qtr})</div>
        ${birRow(1,  `Gross Sales / Revenues (Cumulative Jan – ${['Mar','Jun','Sep','Dec'][qtr-1]})`, r.grossRevenue)}
        ${birRow(2,  'Less: Deductions / Operating Expenses (Cumulative)', r.totalExpenses)}
        ${birRow(3,  'Cumulative Taxable Income  (Line 1 − Line 2)', ti, 'bir-total')}
        ${birRow(4,  `Income Tax — ${rate}% RCIT (Cumulative)`, txDue)}
        ${birRow(5,  'Less: Income Tax Paid in Previous Quarter(s)', 0)}
        ${birRow(6,  'Income Tax Due for this Quarter  (Line 4 − Line 5)', txDue, 'bir-payable')}
        ${birRow(7,  'Less: Creditable Withholding Tax', 0)}
        ${birRow(8,  'Net Tax Due / (Overpayment)', txDue, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Penalties</div>
        ${birRow(9,  'Surcharge', 0)}
        ${birRow(10, 'Interest', 0)}
        ${birRow(11, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Summary</div>
        ${birRow('', 'Total Amount Payable / (Overpayment)  (Lines 8 + 9 + 10 + 11)', txDue, 'bir-payable')}
      </div>
      <div class="bir-sig">
        <div class="bir-sig-box">Signature over Printed Name of Authorized Officer</div>
        <div class="bir-sig-box">Title / Designation</div>
        <div class="bir-sig-box">TIN of Signatory</div>
        <div class="bir-sig-box">Date Signed</div>
      </div>
      <p class="bir-note">${r.txCount} transaction(s) included in cumulative figures · Due: 60 days after end of each quarter · Rate: ${rate}% RCIT · All amounts in Philippine Peso (₱).</p>
    </div>`;
  }

  // ── 2551M / 2551Q (Percentage Tax — OPT) ─────────────────────────────────
  if (isOPT) {
    const optPct = (r.optRate * 100).toFixed(0);
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
        <div class="bir-part-title">Part II — Computation of Tax</div>
        ${birRow(1, 'Gross Sales / Receipts / Revenues / Fees', r.grossSales)}
        ${birRow(2, `Rate of Tax (${optPct}% — Section 116, NIRC)`, optPct + '%')}
        ${birRow(3, 'Percentage Tax Due (Line 1 × Rate)', r.percentageTax, 'bir-total')}
        ${birRow(4, 'Less: Tax Credits / Payments', 0)}
        ${birRow(5, 'Tax Still Due / (Overpayment)', r.percentageTax, 'bir-payable')}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part III — Penalties</div>
        ${birRow(6, 'Surcharge', 0)}
        ${birRow(7, 'Interest', 0)}
        ${birRow(8, 'Compromise', 0)}
      </div>
      <div class="bir-part">
        <div class="bir-part-title">Part IV — Summary</div>
        ${birRow('', 'Total Amount Payable / (Overpayment)  (Sum of Lines 5, 6, 7, 8)', r.percentageTax, 'bir-payable')}
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

  // ── 2550M / 2550Q (VAT) ───────────────────────────────────────────────────
  const taxableSales = r.grossSales - r.outputVAT;   // VAT-exclusive NET
  const zeroRated    = r.zeroRated  || 0;
  const exempt       = r.exempt     || 0;
  const totalSales   = taxableSales + zeroRated + exempt;
  const netVAT       = r.netVATDue  || 0;
  const excessInput  = r.excessInputVAT || 0;

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
      <div class="bir-part-title">Part II — Computation of Output Tax</div>
      ${birRow('A', 'Vatable Sales / Receipts (VAT-exclusive)', taxableSales)}
      ${birRow('B', 'Zero-Rated Sales / Receipts', zeroRated)}
      ${birRow('C', 'VAT-Exempt Sales / Receipts', exempt)}
      ${birRow('D', 'Total Sales / Receipts  (A + B + C)', totalSales, 'bir-total')}
      ${birRow('E', 'Output Tax  (A × 12%)', r.outputVAT)}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part III — Computation of Input Tax</div>
      ${birRow('F', 'Purchases Subject to Input Tax (Gross)', r.grossPurchases)}
      ${birRow('G', 'Input Tax from Current Period Purchases', r.inputVAT)}
      ${birRow('H', 'Input Tax Carried Over from Previous Period', 0)}
      ${birRow('I', 'Total Available Input Tax  (G + H)', r.inputVAT, 'bir-total')}
      ${birRow('J', 'Allowable Input Tax', r.inputVAT)}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part IV — Net VAT Payable / Excess Input Tax</div>
      ${birRow('K', 'VAT Payable  (E − J)', netVAT > 0 ? netVAT : 0, netVAT > 0 ? 'bir-payable' : '')}
      ${birRow('L', 'Excess Input Tax Carried Over to Next Period', excessInput > 0 ? excessInput : 0)}
      ${birRow('M', 'Less: Tax Credits / Payments', 0)}
      ${birRow('N', 'Tax Still Due / (Overpayment)', netVAT > 0 ? netVAT : 0, 'bir-payable')}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part V — Penalties</div>
      ${birRow('', 'Surcharge', 0)}
      ${birRow('', 'Interest', 0)}
      ${birRow('', 'Compromise', 0)}
    </div>
    <div class="bir-part">
      <div class="bir-part-title">Part VI — Summary</div>
      ${birRow('', 'Total Amount Payable / (Overpayment)', netVAT > 0 ? netVAT : 0, 'bir-payable')}
    </div>
    <div class="bir-sig">
      <div class="bir-sig-box">Signature over Printed Name of Authorized Representative</div>
      <div class="bir-sig-box">Title / Position</div>
      <div class="bir-sig-box">TIN of Signatory</div>
      <div class="bir-sig-box">Date</div>
    </div>
    <p class="bir-note">${r.txCount} transaction(s) included · ${dueNote} · All amounts are in Philippine Peso (₱).</p>
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
