// ─── OCR / Receipt Scanning ───────────────────────────────────────────────────
// POST /api/ocr/receipt   — upload receipt image or PDF → structured fields
//
// Requires: GOOGLE_VISION_KEY in environment (.env or Railway)
// Body:     multipart/form-data, field name "receipt" (image/* or application/pdf)
// Returns:  { vendor, tin, date, amountGross, amountVat, amountNet,
//             vatExemptSales, serviceCharge, scPwdDiscount, withholdingTax,
//             description, rawText }
//
// Philippine BIR invoice field glossary:
//   "Less: Discount (SC/PWD/...)" → scPwdDiscount  = Senior Citizen/PWD DEDUCTION
//   "Service Charge"              → serviceCharge   = tip pooled to staff, ADDITION
//   "Less: Withholding Tax"       → withholdingTax  = EWT/creditable WHT, DEDUCTION
//   "VAT-Exempt Sales"            → vatExemptSales  = exempt portion of mixed invoice

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';

// ── Vision API caller ─────────────────────────────────────────────────────────
// Images  → images:annotate  (synchronous)
// PDFs    → files:annotate   (synchronous, first page only)
async function callVisionAPI(base64Content, mimeType = 'image/jpeg') {
  const isPdf = mimeType === 'application/pdf';
  const base  = 'https://vision.googleapis.com/v1';

  async function _request(headers) {
    if (isPdf) {
      // files:annotate — accepts PDF/TIFF, returns extra nesting in response
      const url  = `${base}/files:annotate${headers._key ? `?key=${headers._key}` : ''}`;
      const h    = { 'Content-Type': 'application/json', ...(headers.Authorization ? { Authorization: headers.Authorization } : {}) };
      const body = JSON.stringify({
        requests: [{
          inputConfig: { mimeType: 'application/pdf', content: base64Content },
          features:    [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          pages:       [1],   // first page only — receipts are single-page
        }],
      });
      const res  = await fetch(url, { method: 'POST', headers: h, body });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || `Vision HTTP ${res.status}`);
      return data;
    } else {
      // images:annotate — the original image path
      const url  = `${base}/images:annotate${headers._key ? `?key=${headers._key}` : ''}`;
      const h    = { 'Content-Type': 'application/json', ...(headers.Authorization ? { Authorization: headers.Authorization } : {}) };
      const body = JSON.stringify({
        requests: [{ image: { content: base64Content }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }],
      });
      const res  = await fetch(url, { method: 'POST', headers: h, body });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error?.message || `Vision HTTP ${res.status}`);
      return data;
    }
  }

  const apiKey = process.env.GOOGLE_VISION_KEY;
  if (apiKey) {
    return _request({ _key: apiKey });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const { GoogleAuth } = await import('google-auth-library');
    const auth   = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-vision'] });
    const client = await auth.getClient();
    const { token } = await client.getAccessToken();
    return _request({ Authorization: `Bearer ${token}` });
  }

  throw new Error('NOT_CONFIGURED');
}

// ── Extract full text from Vision API response ────────────────────────────────
// Images response: data.responses[0].fullTextAnnotation.text
// PDFs response:   data.responses[0].responses[0].fullTextAnnotation.text  (extra nesting)
function extractText(visionData, isPdf) {
  if (isPdf) {
    return visionData.responses?.[0]?.responses?.[0]?.fullTextAnnotation?.text ?? null;
  }
  return visionData.responses?.[0]?.fullTextAnnotation?.text ?? null;
}

const router = Router();
router.use(authenticate);

// ── File upload — memory storage, no temp files ───────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },   // 10 MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/') && file.mimetype !== 'application/pdf') {
      return cb(new Error('Only image files (jpeg, png, webp, etc.) and PDFs are accepted'));
    }
    cb(null, true);
  },
});

// ── Parser helpers ────────────────────────────────────────────────────────────

function parseNum(str) {
  return parseFloat(String(str).replace(/,/g, ''));
}

// Find an amount associated with a label.
// Checks (in order):
//   1. Inline:  "TOTAL AMOUNT DUE: 5,964.44"
//   2. Inline:  "TOTAL AMOUNT DUE  5,964.44"  (tab/space separated)
//   3. Next 1-2 lines: label on one line, bare number on the next
//      (common in BIR table layouts where Vision splits cells across lines)
function findAmount(lines, labelRe) {
  for (let i = 0; i < lines.length; i++) {
    if (!labelRe.test(lines[i])) continue;

    // Strip the label portion and look for a number in the rest of the line
    const rest = lines[i].replace(labelRe, '');
    const inline = rest.match(/[:\-]?\s*₱?\s*([\d,]+\.?\d*)(?:\s|$)/);
    if (inline) return parseNum(inline[1]);

    // Next 1-2 lines: accept a line that is ONLY a number (possibly with ₱ prefix)
    for (let j = i + 1; j <= Math.min(i + 2, lines.length - 1); j++) {
      const bare = lines[j].match(/^₱?\s*([\d,]+\.?\d+)$/);
      if (bare) return parseNum(bare[1]);
      // Stop if we hit another label-looking line
      if (/^[A-Z]/.test(lines[j]) && lines[j].length > 6) break;
    }
  }
  return null;
}

// ── Philippine BIR receipt / invoice parser ───────────────────────────────────
//
// Handles two document types:
//   A. BIR Formal Invoice (Sales Invoice, Service Invoice, Official Receipt)
//      — printed template with standard bottom grid; VAT fields always labeled
//   B. POS / thermal receipts (restaurants, fuel stations)
//      — narrative layout; amounts embedded in flow text
//
function parsePhilippineReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // ── TIN ──────────────────────────────────────────────────────────────────────
  // Philippine TIN format: 000-000-000-000 (12 or 15 digits with dashes)
  let tin = null;
  const tinRe = /\b(\d{3}[- ]\d{3}[- ]\d{3}(?:[- ]\d{3,5})?)\b/;
  for (const ln of lines) {
    const m = ln.match(tinRe);
    if (m) { tin = m[1].replace(/ /g, '-'); break; }
  }

  // ── Vendor name ───────────────────────────────────────────────────────────────
  const SKIP_VENDOR = /^(OFFICIAL\s+RECEIPT|SALES\s+INVOICE|SERVICE\s+INVOICE|INVOICE|RECEIPT|VAT\s+REG|NON-VAT|TAX\s+INVOICE|BIR\s+FORM|AUTHORITY|PERMIT)/i;
  let vendor = null;
  for (const ln of lines) {
    if (SKIP_VENDOR.test(ln)) continue;
    if (ln === ln.toUpperCase() && ln.length >= 6 && /[A-Z]{3}/.test(ln)) {
      vendor = ln; break;
    }
  }
  if (!vendor) vendor = lines.find(l => l.length >= 6) || null;

  // ── Date ─────────────────────────────────────────────────────────────────────
  let date = null;
  const datePatterns = [
    /\b(\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2})\b/,
    /\b(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{4})\b/,
    /\b(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2})\b/,
  ];
  outer: for (const ln of lines) {
    for (const re of datePatterns) {
      const m = ln.match(re);
      if (m) { date = m[1]; break outer; }
    }
  }

  // ── Amounts ──────────────────────────────────────────────────────────────────
  const grossRe  = /total\s+amount\s*(due|payable)|amount\s+due|grand\s+total|total\s+due|total\s+payable/i;
  const vatRe    = /output\s+vat|vat\s+amount|12\s*%\s*vat|value[\s\-]added\s+tax|tax\s+amount/i;
  const netRe    = /vatable\s+sales?|net\s+(of\s+)?vat|vat\s+able\s+sales?/i;
  const exemptRe = /vat[\s\-]exempt\s+sales?|zero[\s\-]rated\s+sales?|exempt\s+sales?/i;
  const scRe     = /\bservice\s+charge\b/i;
  const discRe   = /less\s*[:\-]?\s*(sc[\s\/]?pwd|senior|pwd|discount)|sc\/pwd\s+discount/i;
  const whtRe    = /less\s*[:\-]?\s*withholding|withholding\s+tax|\bewt\b|creditable\s+tax/i;

  const amountGross    = findAmount(lines, grossRe);
  const amountVat      = findAmount(lines, vatRe);
  const amountNet      = findAmount(lines, netRe);
  const vatExemptSales = findAmount(lines, exemptRe);
  const serviceCharge  = findAmount(lines, scRe);
  const scPwdDiscount  = findAmount(lines, discRe);
  const withholdingTax = findAmount(lines, whtRe);

  // Fallback: if no labeled gross found, use the largest trailing amount on any line
  let grossFallback = null;
  if (amountGross === null) {
    const nums = [];
    for (const ln of lines) {
      const m = ln.match(/[P]?\s*([\d,]+\.\d{2})\s*$/);
      if (m) nums.push(parseNum(m[1]));
    }
    if (nums.length) grossFallback = Math.max(...nums);
  }

  return {
    vendor:         vendor,
    tin:            tin,
    date:           date,
    amountGross:    amountGross ?? grossFallback,
    amountVat:      amountVat,
    amountNet:      amountNet,
    vatExemptSales: vatExemptSales,
    serviceCharge:  serviceCharge,
    scPwdDiscount:  scPwdDiscount,
    withholdingTax: withholdingTax,
  };
}

// ── POST /api/ocr/receipt ─────────────────────────────────────────────────────
router.post('/receipt', upload.single('receipt'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Use field name "receipt".' });
    }

    const mimeType = req.file.mimetype;
    const base64   = req.file.buffer.toString('base64');

    let rawText = null;
    try {
      const visionData = await callVisionAPI(base64, mimeType);
      rawText = extractText(visionData, mimeType === 'application/pdf');
    } catch (err) {
      if (err.message === 'NOT_CONFIGURED') {
        return res.status(503).json({
          error: 'OCR not configured. Set GOOGLE_VISION_KEY in Railway environment variables.',
          code: 'NOT_CONFIGURED',
        });
      }
      throw err;
    }

    if (!rawText) {
      return res.status(422).json({ error: 'Vision API returned no text. Try a clearer image.' });
    }

    const parsed = parsePhilippineReceipt(rawText);

    return res.json({
      ...parsed,
      description: parsed.vendor || '',
      rawText,
    });
  } catch (err) {
    console.error('OCR route error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
   const parsed = parsePhilippineReceipt(rawText);

    return res.json({
      ...parsed,
      description: parsed.vendor || '',
      rawText,
    });
  } catch (err) {
    console.error('OCR route error:', err);
    return res.status(500).json({ error: err.message });
  }
});

export default router;
