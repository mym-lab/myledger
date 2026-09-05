// ─── bir2307Generator.js ──────────────────────────────────────────────────────
// Generates an official-layout BIR Form 2307 by overlaying data onto the
// flat PDF template using pdf-lib. The template lives at /public/bir/2307-template.pdf.
//
// Usage:
//   const bytes = await generate2307PDF({ payee, client, period, atcList });
//   download2307PDF(bytes, 'BIR_2307_Vendor_Q1_2026.pdf');
//
// For multiple payees (merged single PDF):
//   const bytes = await generateAll2307PDF(payeeList, { client, period });

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const BLACK = rgb(0, 0, 0);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** "Q1 2026" or "Q1 (Jan–Mar) 2026" → { from: 'MM/DD/YYYY', to: 'MM/DD/YYYY' } */
function parsePeriod(period) {
  const m = String(period).match(/Q(\d).*?(\d{4})/);
  if (!m) return { from: '', to: '' };
  const q = parseInt(m[1]);
  const y = m[2];
  const ranges = {
    1: ['01/01', '03/31'],
    2: ['04/01', '06/30'],
    3: ['07/01', '09/30'],
    4: ['10/01', '12/31'],
  };
  const [s, e] = ranges[q] || ['01/01', '03/31'];
  return { from: `${s}/${y}`, to: `${e}/${y}` };
}

/** "123456789000" → ['123', '456', '789', '000'] (Philippine TIN segments) */
function splitTIN(tin) {
  const c = String(tin || '').replace(/\D/g, '');
  return [c.slice(0, 3), c.slice(3, 6), c.slice(6, 9), c.slice(9)];
}

/** Number → "1,234,567.89" */
function fmt(n) {
  return (parseFloat(n) || 0).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Core generator ────────────────────────────────────────────────────────────

/**
 * Generate one BIR 2307 PDF page overlaid on the official template.
 *
 * @param {Object}   opts
 * @param {Object}   opts.payee    { name, tin, address, zipCode }
 * @param {Object}   opts.client   { tradeName, tin, registeredAddress|address, zipCode }
 * @param {string}   opts.period   "Q1 2026" (or "Q2 (Apr–Jun) 2026")
 * @param {Array}    opts.atcList  [{ atc, description, m1, m2, m3, base, ewt }]
 * @returns {Promise<Uint8Array>}
 */
export async function generate2307PDF({ payee, client, period, atcList }) {
  const res = await fetch('/bir/2307-template.pdf');
  if (!res.ok) throw new Error('BIR 2307 template not found at /bir/2307-template.pdf');
  const templateBytes = await res.arrayBuffer();

  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const page   = pdfDoc.getPages()[0];
  const H      = page.getHeight(); // 936 pts (A4-tall BIR form)

  const font  = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontB = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const SZ = 8.5; // default font size

  /**
   * Left-aligned draw.
   * y is supplied as the pdfplumber "top" coordinate; we convert to pdf-lib baseline.
   */
  const draw = (text, x, pTop, opts = {}) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    const sz = opts.size ?? SZ;
    page.drawText(t, {
      x,
      y: H - pTop - sz,        // pdf-lib origin is bottom-left
      font: opts.bold ? fontB : font,
      size: sz,
      color: BLACK,
    });
  };

  /**
   * Right-aligned draw — `rightEdge` is the x of the column's right boundary.
   */
  const drawR = (text, rightEdge, pTop, opts = {}) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    const sz  = opts.size ?? SZ;
    const f   = opts.bold ? fontB : font;
    const w   = f.widthOfTextAtSize(t, sz);
    page.drawText(t, {
      x: rightEdge - w - 2,
      y: H - pTop - sz,
      font: f,
      size: sz,
      color: BLACK,
    });
  };

  // ── Field 1: Period From / To ─────────────────────────────────────────────
  // Box: top=106.4 bottom=122.3 → center pTop = (106.4+122.3)/2 - 6.25 = 108
  // "To" box starts at x=399; "From" box x=151-257
  const { from: pFrom, to: pTo } = parsePeriod(period);
  draw(pFrom, 155, 108);
  draw(pTo,   401, 108);

  // ── Part I – Payee ────────────────────────────────────────────────────────

  // Field 2: Payee TIN
  // Digit cell box: top=137.3 bottom=152.9 → center pTop = 139
  const [pt1, pt2, pt3, pt4] = splitTIN(payee.tin);
  draw(pt1, 170, 139); draw(pt2, 261, 139);
  draw(pt3, 313, 139); if (pt4) draw(pt4, 364, 139);

  // Field 3: Payee Name
  // Box: top=164.3 bottom=180.2 → center pTop = 166
  draw(String(payee.name || '').slice(0, 65), 36, 166);

  // Field 4: Payee Address + 4A ZIP
  // Box: top=192.7 bottom=208.6 → center pTop = 194
  draw(String(payee.address || '').slice(0, 70), 36, 194);
  if (payee.zipCode) draw(String(payee.zipCode).slice(0, 6), 544, 194);

  // ── Part II – Payor ───────────────────────────────────────────────────────

  // Field 6: Payor TIN
  // Digit cell box: top=252.5 bottom=268.5 → center pTop = 254
  const [ct1, ct2, ct3, ct4] = splitTIN(client.tin);
  draw(ct1, 170, 254); draw(ct2, 262, 254);
  draw(ct3, 313, 254); if (ct4) draw(ct4, 364, 254);

  // Field 7: Payor Name
  // Box: top=279.5 bottom=295.4 → center pTop = 281
  draw(String(client.tradeName || client.name || '').slice(0, 65), 36, 281);

  // Field 8: Payor Address + 8A ZIP
  // Box: top=307.9 bottom=323.8 → center pTop = 310
  const payorAddr = String(client.registeredAddress || client.address || '').slice(0, 70);
  draw(payorAddr, 36, 310);
  if (client.zipCode) draw(String(client.zipCode).slice(0, 6), 544, 310);

  // ── Part III – EWT Table ──────────────────────────────────────────────────
  // Column right-edge x values (from pdfplumber vertical lines):
  //   Description: ≤176   ATC: ≤219   M1: ≤291   M2: ≤365   M3: ≤438
  //   Total:       ≤510   TaxWithheld: ≤596
  // Data rows start at pdfplumber top≈370, row height ≈ 13.7 pts, max 9 rows.
  // Total row: pdfplumber top≈505 (aligned with "Total" label text).

  const ROW_H = 13.7;
  const DATA_TOP = 370;
  const TOTAL_TOP = 503;
  const COL_SZ = 7.5;

  let totM1 = 0, totM2 = 0, totM3 = 0, totBase = 0, totEWT = 0;

  (atcList || []).slice(0, 9).forEach((a, i) => {
    const rowTop = DATA_TOP + i * ROW_H;

    const m1   = parseFloat(a.m1   || 0);
    const m2   = parseFloat(a.m2   || 0);
    const m3   = parseFloat(a.m3   || 0);
    const base = parseFloat(a.base || (m1 + m2 + m3));
    const ewt  = parseFloat(a.ewt  || 0);

    totM1 += m1; totM2 += m2; totM3 += m3;
    totBase += base; totEWT += ewt;

    // Description (truncate to fit ~22 chars in the narrow description column)
    const desc = String(a.description || a.atc || '');
    draw(desc.slice(0, 22), 20, rowTop, { size: COL_SZ });

    // ATC code
    draw(String(a.atc || ''), 179, rowTop, { size: COL_SZ });

    // Monthly amounts + totals (right-aligned)
    if (m1)   drawR(fmt(m1),   289, rowTop, { size: COL_SZ });
    if (m2)   drawR(fmt(m2),   363, rowTop, { size: COL_SZ });
    if (m3)   drawR(fmt(m3),   436, rowTop, { size: COL_SZ });
    if (base) drawR(fmt(base), 508, rowTop, { size: COL_SZ });
    if (ewt)  drawR(fmt(ewt),  593, rowTop, { size: COL_SZ });
  });

  // EWT totals row
  if (totM1)   drawR(fmt(totM1),   289, TOTAL_TOP, { size: COL_SZ, bold: true });
  if (totM2)   drawR(fmt(totM2),   363, TOTAL_TOP, { size: COL_SZ, bold: true });
  if (totM3)   drawR(fmt(totM3),   436, TOTAL_TOP, { size: COL_SZ, bold: true });
  if (totBase) drawR(fmt(totBase), 508, TOTAL_TOP, { size: COL_SZ, bold: true });
  if (totEWT)  drawR(fmt(totEWT),  593, TOTAL_TOP, { size: COL_SZ, bold: true });

  return pdfDoc.save();
}

// ── Batch generator ───────────────────────────────────────────────────────────

/**
 * Generate one PDF containing one page per payee (merged).
 *
 * @param {Array}  payeeList  Each item must have { atcList, name, tin, address, zipCode }
 * @param {Object} opts       { client, period }
 * @returns {Promise<Uint8Array>}
 */
export async function generateAll2307PDF(payeeList, { client, period }) {
  const merged = await PDFDocument.create();
  for (const p of payeeList) {
    const atcList = p.atcList || Object.values(p.atcs || {});
    const bytes = await generate2307PDF({ payee: p, client, period, atcList });
    const src   = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const [pg]  = await merged.copyPages(src, [0]);
    merged.addPage(pg);
  }
  return merged.save();
}

// ── Download helper ───────────────────────────────────────────────────────────

/**
 * Trigger a browser download of a PDF byte array.
 *
 * @param {Uint8Array} pdfBytes
 * @param {string}     filename
 */
export function download2307PDF(pdfBytes, filename) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename || 'BIR_2307.pdf';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
