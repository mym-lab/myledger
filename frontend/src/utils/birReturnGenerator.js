// ─── birReturnGenerator.js ────────────────────────────────────────────────────
// Generates BIR return PDFs by overlaying data onto official flat templates.
// Templates live at /public/bir/<form>-template.pdf.
//
// Exports:
//   generate2550QPDF({ client, year, quarter, prefill }) → Uint8Array
//   downloadBIRPDF(pdfBytes, filename)

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BLACK = rgb(0, 0, 0);
const WHITE = rgb(1, 1, 1);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Number → "1,234,567.89" */
function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "123456789000" → ['123', '456', '789', '000'] */
function splitTIN(tin) {
  const c = String(tin || '').replace(/\D/g, '');
  return [c.slice(0, 3), c.slice(3, 6), c.slice(6, 9), c.slice(9)];
}

/**
 * Quarter date ranges (calendar year):
 *   1 → Jan 1 – Mar 31, 2 → Apr 1 – Jun 30, 3 → Jul 1 – Sep 30, 4 → Oct 1 – Dec 31
 */
const Q_RANGES = {
  1: ['01/01', '03/31'],
  2: ['04/01', '06/30'],
  3: ['07/01', '09/30'],
  4: ['10/01', '12/31'],
};
const Q_LABELS = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };

// ── 2550Q ─────────────────────────────────────────────────────────────────────

/**
 * Generate BIR Form 2550Q (Quarterly VAT Return) by overlaying on official template.
 *
 * @param {Object} opts
 * @param {Object} opts.client   { tradeName, tin, registeredAddress|address, zipCode }
 * @param {number} opts.year     e.g. 2026
 * @param {number} opts.quarter  1..4
 * @param {Object} opts.prefill  result of compute2550Prefill()
 * @returns {Promise<Uint8Array>}
 */
export async function generate2550QPDF({ client, year, quarter, prefill }) {
  const res = await fetch('/bir/2550Q-template.pdf');
  if (!res.ok) throw new Error('BIR 2550Q template not found at /bir/2550Q-template.pdf');
  const templateBytes = await res.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const pages  = pdfDoc.getPages();
  const pg1    = pages[0];
  const pg2    = pages[1];
  const H      = pg1.getHeight(); // 1008 pts

  const font  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const SZ    = 8.5;

  // ── Draw helpers ─────────────────────────────────────────────────────────────
  /** Left-aligned text on a specific page */
  const draw = (page, text, x, pTop, opts = {}) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    const sz = opts.size ?? SZ;
    page.drawText(t, {
      x,
      y: H - pTop - sz,
      font: opts.bold ? fontB : font,
      size: sz,
      color: BLACK,
    });
  };

  /** Right-aligned text on a specific page */
  const drawR = (page, text, rightEdge, pTop, opts = {}) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    const sz = opts.size ?? SZ;
    const f  = opts.bold ? fontB : font;
    const w  = f.widthOfTextAtSize(t, sz);
    page.drawText(t, {
      x: rightEdge - w - 2,
      y: H - pTop - sz,
      font: f,
      size: sz,
      color: BLACK,
    });
  };

  // ── Computed values ───────────────────────────────────────────────────────────
  const {
    item31A = 0, item31B = 0,
    item32A = 0, item33A = 0,
    item34  = 0,
    item44A = 0, item44B = 0,
    vatPayable = 0, excessInput = 0,
  } = prefill || {};

  // Derived items (simplified — no carryover, no deductions)
  const item34A  = item34;           // Total Sales (31A+32A+33A)
  const item34B  = item31B;          // Total Output Tax Due (= output VAT on vatable sales)
  const item37B  = item34B;          // Adjusted Output Tax Due (Items 35/36 assumed 0)
  const item44Ar = item44A;          // Domestic Purchases
  const item44Br = item44B;          // Input VAT on Domestic Purchases
  const item50A  = item44A;          // Total Current Purchases (= 44A, assuming no svc/import)
  const item50B  = item44B;          // Total Current Input Tax (= 44B)
  const item51B  = item44B;          // Total Available Input Tax (43B=0 + 50B)
  const item60B  = item51B;          // Total Allowable Input Tax (no deductions)
  const item61   = vatPayable;       // Net VAT Payable (positive) or excess (negative)
  const item15   = vatPayable;       // Part II – same as Part IV item 61
  const item21   = vatPayable;       // Tax Still Payable (no credits applied)

  const [s1, s2, s3] = splitTIN(client?.tin);
  const qRange        = Q_RANGES[quarter] || Q_RANGES[1];
  const periodFrom    = `${qRange[0]}/${year}`;
  const periodTo      = `${qRange[1]}/${year}`;
  const yearEnded     = `12/${year}`;

  // ── PAGE 1 ───────────────────────────────────────────────────────────────────

  // "For the" Calendar checkbox: small square x0=74.0-87.7, top=110.3-122.5 → pTop=109.9
  draw(pg1, 'X', 78, 109.9, { bold: true });

  // Year Ended (Item 2): inner box x0=196.4-299.1, top=111.5-121.9
  // White-erase the label text "2 Year Ended (MM/YYYY)" then draw clean value
  pg1.drawRectangle({ x: 197, y: H - 121.9, width: 101, height: 10.4, color: WHITE, borderWidth: 0, opacity: 1 });
  drawR(pg1, yearEnded, 296, 110.45);

  // Quarter checkbox: actual checkbox squares (12x12pt) measured positions
  // Q1: x0=434.6-448.3  Q2: x0=470.4-484.1  Q3: x0=512.6-526.2  Q4: x0=554.3-567.9
  const qCheckX = { 1: 437, 2: 473, 3: 515, 4: 557 };
  if (qCheckX[quarter]) draw(pg1, 'X', qCheckX[quarter], 109.9, { bold: true });

  // Return Period From/To (Item 4):
  // "From" label at x=35 top=141.3, "To" label at x=184.4 top=141.3
  draw(pg1, periodFrom, 60,  141.3);
  draw(pg1, periodTo,   198, 141.3);

  // TIN (Item 7): digit boxes at x≈234/248/263 (seg1), 290/304/319 (seg2), 348/362/376 (seg3)
  // Dashes between segments at x=279.4, 336.6, 393.7
  draw(pg1, s1, 235, 171.5);
  draw(pg1, s2, 291, 171.5);
  draw(pg1, s3, 348, 171.5);

  // Taxpayer Name (Item 9): box top=186.5 bot=196.9 → pTop=185.45
  // Draw after item number "9" (x1≈36); label text overlaps but is normal for flat-PDF overlay
  draw(pg1, String(client?.tradeName || client?.name || '').slice(0, 80), 38, 185.45);

  // Registered Address (Item 10): box top=215.1 bot=225.5 → pTop=214.05
  const addr = String(client?.registeredAddress || client?.address || '').slice(0, 100);
  draw(pg1, addr, 38, 214.05);

  // ZIP Code (Item 10A): inner box x0=466.8-526.9, top=247.4 bot=257.8 → pTop=246.35
  if (client?.zipCode) draw(pg1, String(client.zipCode).slice(0, 5), 487, 246.35);

  // Part II – Total Tax Payable
  // Pre-printed decimal separator dot at x=552.4; right-align whole pesos to 550, cents at 555
  // Item 15 (Net VAT Payable from Part IV Item 61): box top=344.9 bot=362.6 → pTop=347.5
  if (item15 > 0) {
    const [w15, c15] = fmt(item15).split('.');
    drawR(pg1, w15, 550, 347.5, { bold: true });
    draw(pg1, c15 || '00', 555, 347.5, { bold: true });
  }

  // Item 21 (Tax Still Payable): box top=465.2 bot=483.0 → pTop=467.85
  if (item21 > 0) {
    const [w21, c21] = fmt(item21).split('.');
    drawR(pg1, w21, 550, 467.85, { bold: true });
    draw(pg1, c21 || '00', 555, 467.85, { bold: true });
  }

  // ── PAGE 2 ───────────────────────────────────────────────────────────────────

  // Page 2 header: TIN + Name
  // TIN box: x0=27.5-214.2, top=79.8-90.1 → pTop=78.7
  // "TIN" label at x=27.5-42.0; draw value after it. Branch "00000" pre-printed at x≈151.
  const tinFormatted = `${s1}-${s2}-${s3}`;
  draw(pg2, tinFormatted, 55, 78.7);
  // Name box: x0=225.1-584.5, top=79.8-90.1 → pTop=78.7
  draw(pg2, String(client?.tradeName || client?.name || '').slice(0, 60), 228, 78.7);

  // Part IV – VAT Computation
  // Columns: A = Sales/Purchases (right-align x=370), B = Output/Input Tax (right-align x=580)

  // Item 31 (VATable Sales): rect top=132.4 bot=147.9 → pTop=133.9
  if (item31A) drawR(pg2, fmt(item31A), 370, 133.9);
  if (item31B) drawR(pg2, fmt(item31B), 580, 133.9);

  // Item 32 (Zero-Rated Sales): rect top=148.4 bot=163.8 → pTop=149.85
  if (item32A) drawR(pg2, fmt(item32A), 370, 149.85);

  // Item 33 (Exempt Sales): rect top=164.3 bot=179.8 → pTop=165.8
  if (item33A) drawR(pg2, fmt(item33A), 370, 165.8);

  // Item 34 (Total Sales & Output Tax): rect top=180.3 bot=197.5 → pTop=182.65
  if (item34A) drawR(pg2, fmt(item34A), 370, 182.65, { bold: true });
  if (item34B) drawR(pg2, fmt(item34B), 580, 182.65, { bold: true });

  // Item 37 (Total Adjusted Output Tax Due): rect top=229.9 bot=245.3 → pTop=231.35
  if (item37B) drawR(pg2, fmt(item37B), 580, 231.35, { bold: true });

  // Item 44 (Domestic Purchases): rect top=366.1 bot=381.6 → pTop=367.6
  if (item44Ar) drawR(pg2, fmt(item44Ar), 370, 367.6);
  if (item44Br) drawR(pg2, fmt(item44Br), 580, 367.6);

  // Item 50 (Total Current Purchases/Input Tax): rect top=461.9 bot=479.6 → pTop=464.5
  if (item50A) drawR(pg2, fmt(item50A), 370, 464.5, { bold: true });
  if (item50B) drawR(pg2, fmt(item50B), 580, 464.5, { bold: true });

  // Item 51 (Total Available Input Tax): rect top=480.1 bot=495.6 → pTop=481.6
  if (item51B) drawR(pg2, fmt(item51B), 580, 481.6, { bold: true });

  // Item 60 (Total Allowable Input Tax): rect top=635.2 bot=650.6 → pTop=636.65
  if (item60B) drawR(pg2, fmt(item60B), 580, 636.65, { bold: true });

  // Item 61 (Net VAT Payable / Excess Input Tax): rect top=651.1 bot=666.6 → pTop=652.6
  if (item61 > 0)      drawR(pg2, fmt(item61),      580, 652.6, { bold: true });
  else if (excessInput > 0) drawR(pg2, `(${fmt(excessInput)})`, 580, 652.6, { bold: true });

  return pdfDoc.save();
}

// ── Download helper ───────────────────────────────────────────────────────────

/**
 * Trigger browser download of a PDF byte array.
 * @param {Uint8Array} pdfBytes
 * @param {string}     filename
 */
export function downloadBIRPDF(pdfBytes, filename) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || 'BIR_Return.pdf';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
