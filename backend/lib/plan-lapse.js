// ─── Managed clients and accountant plan lapse ────────────────────────────────
// An agency (Firm or Agency plan) can create a business user for its client.
// The client's limits come from the agency's plan, and the agency is the client's
// accountant. Nothing is charged to the client.
//
// Plan lapse: when an agency's plan is marked unpaid, it gets a 30-day grace
// period. Reminders go out on day 0, 15 and 25. On day 30 the agency's accountant
// access ends: its clients lose that accountant link (so its staff lose access too).
// The client's own login and records are never locked.
import { db, withTransaction } from '../db.js';
import { sendEmail as defaultSend } from '../email.js';

export const GRACE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = [0, 15, 25];   // reminder stages 1, 2, 3
const ENFORCED_STAGE = 4;

const stmtAccountant = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'accountant'");

/** Plan tier that covers a managed client, or null if it is not covered. */
export function coverageTierFor(user) {
  if (!user?.managedBy) return null;
  const agency = stmtAccountant.get(user.managedBy);
  if (!agency || agency.accountant_tier === 'free') return null;
  return agency.accountant_tier;
}

/** Admin switch: mark an agency's plan unpaid (starts grace) or paid again (ends it). */
export function setPlanLapse(agencyId, lapsed) {
  if (lapsed) {
    const agency = stmtAccountant.get(agencyId);
    if (agency && !agency.plan_lapsed_at)
      db.prepare('UPDATE users SET plan_lapsed_at = ?, lapse_stage = 0 WHERE id = ?')
        .run(new Date().toISOString(), agencyId);
  } else {
    db.prepare('UPDATE users SET plan_lapsed_at = NULL, lapse_stage = 0 WHERE id = ?').run(agencyId);
  }
}

function enforce(agency) {
  const clientIds = db.prepare('SELECT id FROM clients WHERE accountant_id = ?').all(agency.id).map(r => r.id);
  withTransaction(() => {
    db.prepare('UPDATE clients SET accountant_id = NULL WHERE accountant_id = ?').run(agency.id);
    db.prepare("UPDATE users SET accountant_tier = 'free', lapse_stage = ? WHERE id = ?")
      .run(ENFORCED_STAGE, agency.id);
  });
  return clientIds;
}

function recipientsFor(agency) {
  return db.prepare("SELECT email, name FROM users WHERE managed_by = ? AND email IS NOT NULL")
    .all(agency.id);
}

async function notify(send, to, subject, text) {
  if (!to) return;
  try {
    const html = `<p style="font-family:Arial,sans-serif;line-height:1.6">${text.replace(/\n/g, '<br/>')}</p>`;
    await send({ to, subject, html, text });
  } catch (e) {
    console.error('Plan lapse email failed:', e.message);
  }
}

/**
 * Run once an hour. Sends reminders at the right stage and enforces at day 30.
 * Safe to run repeatedly: each stage is sent once, and enforcement happens once.
 */
export async function runPlanLapseCheck({ now = Date.now(), send = defaultSend } = {}) {
  const lapsing = db.prepare(
    "SELECT * FROM users WHERE role = 'accountant' AND plan_lapsed_at IS NOT NULL AND lapse_stage < ?"
  ).all(ENFORCED_STAGE);
  const report = [];

  for (const agency of lapsing) {
    const days = (now - Date.parse(agency.plan_lapsed_at)) / DAY_MS;
    const who  = agency.company || agency.name || 'your accountant';
    const endsOn = new Date(Date.parse(agency.plan_lapsed_at) + GRACE_DAYS * DAY_MS).toISOString().slice(0, 10);

    if (days >= GRACE_DAYS) {
      const clientIds = enforce(agency);
      report.push({ agency: agency.id, action: 'enforced', clients: clientIds.length });
      const notice = `${who}'s MyLedger plan has ended and their access to your books has been removed.\n\n` +
                     `Your own login and records are still yours. You can settle with ${who} or choose another accountant in MyLedger.`;
      for (const r of recipientsFor(agency)) await notify(send, r.email, 'Your accountant access has ended', notice);
      await notify(send, agency.email, 'Accountant access ended for your clients',
        `The grace period has ended. Accountant access to ${clientIds.length} client(s) has been removed. ` +
        `Re-assign clients to restore access once your plan is active again.`);
      continue;
    }

    const stage = REMINDER_DAYS.reduce((max, d, i) => (days >= d ? i + 1 : max), 0);
    if (stage > agency.lapse_stage) {
      const left = Math.max(0, Math.ceil(GRACE_DAYS - days));
      const text = `${who}'s MyLedger plan has lapsed. Their access to your books ends on ${endsOn} (${left} day(s) left).\n\n` +
                   `To keep them as your accountant, ask them to renew. Or you can choose another accountant in MyLedger. ` +
                   `Your own login and records stay with you.`;
      for (const r of recipientsFor(agency)) await notify(send, r.email, `Your accountant's plan lapses on ${endsOn}`, text);
      await notify(send, agency.email, `Plan lapsed: ${left} day(s) of client access left`,
        `Your plan is marked unpaid. Client accountant access ends on ${endsOn}. Renew before then to keep it.`);
      db.prepare('UPDATE users SET lapse_stage = ? WHERE id = ?').run(stage, agency.id);
      report.push({ agency: agency.id, action: 'reminder', stage, daysLeft: left });
    }
  }
  return report;
}
