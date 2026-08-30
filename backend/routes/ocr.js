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

  // ── TIN ───────────────────────────────────────────────────────�