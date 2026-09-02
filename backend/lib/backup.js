// ─── Database Backup ──────────────────────────────────────────────────────────
// Copies the live SQLite DB to /data/backups/myledger-YYYY-MM-DD.db
// Keeps the last 7 daily backups and deletes older ones.
// Sends a brief status email to the admin via Resend.
//
// Cloud backup (Cloudflare R2 / Backblaze B2):
//   Set these Railway env vars to enable off-site upload:
//   BACKUP_S3_ENDPOINT  — e.g. https://<accountid>.r2.cloudflarestorage.com
//   BACKUP_S3_BUCKET    — bucket name
//   BACKUP_S3_KEY       — access key ID
//   BACKUP_S3_SECRET    — secret access key
//   (Uses AWS Signature V4 — compatible with R2 and B2)

import { copyFileSync, readdirSync, statSync, unlinkSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHmac, createHash } from 'crypto';
import { sendEmail } from '../email.js';

const DB_PATH      = process.env.DB_PATH || join(dirname(fileURLToPath(import.meta.url)), '../myledger.db');
const BACKUP_DIR   = process.env.BACKUP_DIR || join(dirname(DB_PATH), 'backups');
const KEEP_DAYS    = 7;
const ADMIN_EMAIL  = process.env.ADMIN_EMAIL || 'mym@kaimanco.com';

function today() { return new Date().toISOString().slice(0, 10); }
function pad(n)  { return String(n).padStart(2, '0'); }

function fileSizeMB(path) {
  try { return (statSync(path).size / 1024 / 1024).toFixed(2); }
  catch (_) { return '?'; }
}

// ── Prune backups older than KEEP_DAYS ───────────────────────────────────────
function pruneOldBackups() {
  try {
    const files = readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('myledger-') && f.endsWith('.db'))
      .sort(); // ascending date order
    if (files.length > KEEP_DAYS) {
      const toDelete = files.slice(0, files.length - KEEP_DAYS);
      for (const f of toDelete) {
        unlinkSync(join(BACKUP_DIR, f));
        console.log(`🗑  Deleted old backup: ${f}`);
      }
    }
  } catch (e) {
    console.error('⚠️  Backup prune error:', e.message);
  }
}

// ── Optional: upload to S3-compatible storage (R2 / B2) ──────────────────────
async function uploadToS3(filePath, fileName) {
  const endpoint = process.env.BACKUP_S3_ENDPOINT;
  const bucket   = process.env.BACKUP_S3_BUCKET;
  const keyId    = process.env.BACKUP_S3_KEY;
  const secret   = process.env.BACKUP_S3_SECRET;
  if (!endpoint || !bucket || !keyId || !secret) return null;

  try {
    const fileData = readFileSync(filePath);
    const region   = 'auto';
    const service  = 's3';
    const host     = new URL(endpoint).host;
    const now      = new Date();
    const amzDate  = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const contentHash = createHash('sha256').update(fileData).digest('hex');

    // Build canonical request
    const canonicalUri     = `/${bucket}/${fileName}`;
    const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${contentHash}\nx-amz-date:${amzDate}\n`;
    const signedHeaders    = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalReq     = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${contentHash}`;

    // String to sign
    const credScope  = `${dateStamp}/${region}/${service}/aws4_request`;
    const strToSign  = `AWS4-HMAC-SHA256\n${amzDate}\n${credScope}\n${createHash('sha256').update(canonicalReq).digest('hex')}`;

    // Signing key
    function hmac(key, data) { return createHmac('sha256', key).update(data).digest(); }
    const sigKey    = hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), region), service), 'aws4_request');
    const signature = createHmac('sha256', sigKey).update(strToSign).digest('hex');
    const authHeader = `AWS4-HMAC-SHA256 Credential=${keyId}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`${endpoint}/${bucket}/${fileName}`, {
      method:  'PUT',
      headers: {
        'Host':                   host,
        'x-amz-date':             amzDate,
        'x-amz-content-sha256':   contentHash,
        'Authorization':          authHeader,
        'Content-Type':           'application/octet-stream',
        'Content-Length':         String(fileData.length),
      },
      body: fileData,
    });

    if (res.ok) return { ok: true, bucket, fileName };
    const text = await res.text();
    console.error('⚠️  S3 upload failed:', res.status, text);
    return { ok: false, error: `${res.status} ${text}` };
  } catch (e) {
    console.error('⚠️  S3 upload error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Main export: runBackup() ──────────────────────────────────────────────────
export async function runBackup({ manual = false } = {}) {
  const date     = today();
  const fileName = `myledger-${date}.db`;
  const destPath = join(BACKUP_DIR, fileName);

  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    copyFileSync(DB_PATH, destPath);
    const sizeMB = fileSizeMB(destPath);
    console.log(`✅ Backup created: ${fileName} (${sizeMB} MB)`);

    pruneOldBackups();

    // List remaining backups for email
    let backupList = [];
    try {
      backupList = readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('myledger-') && f.endsWith('.db'))
        .sort().reverse()
        .map(f => `${f} — ${fileSizeMB(join(BACKUP_DIR, f))} MB`);
    } catch (_) {}

    // Optional cloud upload
    const s3Result = await uploadToS3(destPath, fileName);
    const s3Line   = s3Result
      ? s3Result.ok
        ? `<p>☁️  Cloud backup: uploaded to <strong>${s3Result.bucket}/${s3Result.fileName}</strong></p>`
        : `<p>⚠️  Cloud backup failed: ${s3Result.error}</p>`
      : '<p>ℹ️  Cloud backup not configured (set BACKUP_S3_* env vars to enable).</p>';

    // Send status email
    if (process.env.RESEND_API_KEY) {
      await sendEmail({
        to:      ADMIN_EMAIL,
        subject: `MyLedger Backup — ${date}${manual ? ' (manual)' : ''}`,
        html: `
          <div style="font-family:system-ui,sans-serif;max-width:540px;margin:0 auto;padding:24px">
            <h2 style="color:#1d1d1f;margin:0 0 12px">✅ Daily Backup Complete</h2>
            <p><strong>File:</strong> ${fileName}</p>
            <p><strong>Size:</strong> ${sizeMB} MB</p>
            <p><strong>Location:</strong> /data/backups/ (Railway volume)</p>
            ${s3Line}
            <hr style="border:none;border-top:1px solid #e5e5ea;margin:16px 0">
            <p style="font-size:13px;color:#6e6e73"><strong>Last ${backupList.length} backups:</strong><br>
              ${backupList.map(b => `• ${b}`).join('<br>')}
            </p>
          </div>`,
      }).catch(e => console.error('Backup email failed:', e.message));
    }

    return { ok: true, fileName, sizeMB, s3: s3Result };
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
    if (process.env.RESEND_API_KEY) {
      sendEmail({
        to:      ADMIN_EMAIL,
        subject: `⚠️ MyLedger Backup FAILED — ${date}`,
        html:    `<p>Backup failed on ${date}:</p><pre>${err.message}</pre>`,
      }).catch(() => {});
    }
    throw err;
  }
}

// ── List existing backups ─────────────────────────────────────────────────────
export function listBackups() {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    return readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('myledger-') && f.endsWith('.db'))
      .sort().reverse()
      .map(f => {
        const path = join(BACKUP_DIR, f);
        const stat = statSync(path);
        return { fileName: f, sizeMB: parseFloat(fileSizeMB(path)), createdAt: stat.mtime.toISOString() };
      });
  } catch (_) { return []; }
}
