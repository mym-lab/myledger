// ─── OCR / Receipt Scanning ───────────────────────────────────────────────────
// POST /api/ocr/receipt   — upload receipt image → structured fields
//
// Requires: GOOGLE_VISION_KEY in environment (.env)
// Body:     multipart/form-data, field name "receipt" (any image type)
// Returns:  { vendor, tin, date, amountGross, amountVat, amountNet, description, rawText }

import { Router } from 'express';
import multer from 'multer';
import { GoogleAuth } from 'google-auth-library';
import { authenticate } from '../middleware/auth.js';

// GoogleAuth reads GOOGLE_APPLICATION_CREDENTIALS automatically (ADC)
const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-vision'],
});

const router = Router();
router.use(authenticate);

// ── File upload (memory only — no temp files on disk) ────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },          // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/'))
      return cb(new Error('Only image files are accepted (jpeg, png, webp, etc.)'));
    cb(null, true);
  },
});

// ── Philippine OR receipt parser ──────────────────────────────────────────────
// BIR-registered receipts follow a predictable layout:
//   Business name → TIN → Address → Items → Vatable Sales → 12% VAT → Total
function parsePhilippineReceipt(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  let amountGross = null;
  let amountVat   = null;
  let amountNet   = null;
  let tin         = null;
  let vendor      = null;
  let date        = null;

  // TIN — BIR format XXX-XXX-XXX or XXX-XXX-XXX-XXXXX
  const tinMatch = text.match(
    /TIN[\s:No.#]*(\d{3}[-\s]\d{3}[-\s]\d{3}(?:[-\s]\d{3,5})?)/i
  );
  if (tinMatch) tin = tinMatch[1].replace(/\s/g, '-');

  // Date — common PH formats: MM/DD/YYYY, DD-Mon-YYYY, Month DD YYYY
  const dateMatch = text.match(
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})|(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\.?\s+\d{1,2},?\s*\d{4})/i
  );
  if (dateMatch) date = dateMatch[0];

  // Total amount — ordered most-specific → least-specific
  const totalPatterns = [
    /TOTAL AMOUNT DUE\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /GRAND TOTAL\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /TOTAL DUE\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /AMOUNT DUE\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /TOTAL\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
  ];
  for (const p of totalPatterns) {
    const m = text.match(p);
    if (m) { amountGross = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  // VAT / Output tax amount
  const vatPatterns = [
    /(?:ADD[:\s]+)?12%\s*VAT\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /OUTPUT\s*TAX\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /VAT\s+AMOUNT\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /VAT\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
  ];
  for (const p of vatPatterns) {
    const m = text.match(p);
    if (m) { amountVat = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  // Net / Vatable sales
  const netPatterns = [
    /VATABLE\s*SALES\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /NET\s*AMOUNT\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
    /SUBTOTAL\s*[:\-]?\s*₱?\s*([\d,]+\.?\d*)/i,
  ];
  for (const p of netPatterns) {
    const m = text.match(p);
    if (m) { amountNet = parseFloat(m[1].replace(/,/g, '')); break; }
  }

  // Derive missing values (assume 12% VAT if only gross known)
  if (amountGross && amountVat && !amountNet) {
    amountNet = Math.round((amountGross - amountVat) * 100) / 100;
  }
  if (amountGross && !amountVat && !amountNet) {
    amountNet = Math.round(amountGross / 1.12 * 100) / 100;
    amountVat = Math.round((amountGross - amountNet) * 100) / 100;
  }

  // Vendor — first meaningful line (skip generic labels)
  const skipWords = /^(receipt|official|invoice|tax|date|no\.|#\d|page|or no)/i;
  for (const line of lines.slice(0, 6)) {
    if (line.length > 3 && !skipWords.test(line) && !/^\d+$/.test(line)) {
      vendor = line;
      break;
    }
  }

  return {
    vendor:      vendor      || '',
    tin:         tin         || '',
    date:        date        || '',
    amountGross: amountGross ?? null,
    amountVat:   amountVat   ?? null,
    amountNet:   amountNet   ?? null,
    description: vendor ? `${vendor} — receipt` : '',
    rawText:     text,
  };
}

// ── POST /api/ocr/receipt ─────────────────────────────────────────────────────
router.post('/receipt', upload.single('receipt'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded. Use form field name "receipt".' });
    }

    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return res.status(503).json({
        error: 'Google Application Credentials not configured',
        hint:  'Set GOOGLE_APPLICATION_CREDENTIALS=./service-account.json in backend/.env',
      });
    }

    const base64 = req.file.buffer.toString('base64');

    // Get a short-lived access token via ADC (Service Account JSON)
    console.log('🔐 Getting ADC token, credentials path:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    const authClient  = await googleAuth.getClient();
    const { token }   = await authClient.getAccessToken();
    console.log('✅ Token obtained:', token ? 'yes' : 'NO TOKEN');

    const visionRes = await fetch(
      'https://vision.googleapis.com/v1/images:annotate',
      {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          requests: [{
            image:    { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          }],
        }),
      }
    );

    const visionData = await visionRes.json();

    if (!visionRes.ok || visionData.error) {
      const details = visionData.error?.message || `HTTP ${visionRes.status}`;
      console.error('❌ Vision API error:', details, JSON.stringify(visionData.error));
      return res.status(422).json({
        error:   'Google Vision API error',
        details,
      });
    }

    const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text;
    if (!fullText) {
      return res.status(422).json({
        error: 'No text detected in image. Try a clearer, well-lit photo.',
      });
    }

    const parsed = parsePhilippineReceipt(fullText);
    res.json({ success: true, ...parsed });

  } catch (err) { next(err); }
});

export default router;
