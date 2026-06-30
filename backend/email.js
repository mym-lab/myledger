// ─── Email helper — uses Resend HTTP API ──────────────────────────────────────
// Falls back gracefully: if RESEND_API_KEY is not set, returns { sent: false }.
// Import and call sendEmail() from any route.

import { Resend } from 'resend';
import { getSetting } from './db.js';

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendEmail({ to, subject, html, text }) {
  const resend = getResend();
  if (!resend) return { sent: false, reason: 'RESEND_API_KEY not set' };

  const smtp = getSetting('smtp') || {};
  const fromName  = smtp.fromName  || 'MyLedger';
  const fromEmail = smtp.fromEmail || 'mym@kaimanco.com';

  try {
    const { data, error } = await resend.emails.send({
      from:    `${fromName} <${fromEmail}>`,
      to,
      subject,
      html,
      text,
    });
    if (error) throw new Error(error.message || JSON.stringify(error));
    return { sent: true, id: data?.id };
  } catch (e) {
    console.error('⚠️  Resend email failed:', e.message);
    return { sent: false, reason: e.message };
  }
}

export async function testEmail(to) {
  return sendEmail({
    to,
    subject: 'MyLedger — SMTP Test Email',
    html: `
      <div style="font-family:-apple-system,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <div style="background:#0071e3;padding:20px 24px;border-radius:12px 12px 0 0">
          <span style="color:#fff;font-size:20px;font-weight:700">MyLedger</span>
        </div>
        <div style="background:#fff;padding:24px;border:1px solid #e5e5e7;border-radius:0 0 12px 12px">
          <h2 style="color:#1d1d1f;margin:0 0 12px">✓ Email is working</h2>
          <p style="color:#6e6e73;font-size:14px">Your MyLedger email is configured correctly via Resend.</p>
          <p style="color:#6e6e73;font-size:14px">BIR deadline reminders and accountant invitations will now deliver to inboxes.</p>
        </div>
      </div>`,
    text: 'MyLedger email is working correctly.',
  });
}
