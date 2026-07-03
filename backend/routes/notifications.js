// ─── In-App Notifications ─────────────────────────────────────────────────────
// GET /api/notifications  — computed notifications for current user

import { Router } from 'express';
import { db }       from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { getUpcomingDeadlines } from '../lib/bir-deadlines.js';

const router = Router();
router.use(authenticate);

// ── GET /api/notifications ────────────────────────────────────────────────────
router.get('/', (req, res, next) => {
  try {
    const { userId, userRole } = req;
    const now   = new Date();
    const today = now.toISOString().slice(0, 10);
    const notifications = [];

    // ── Fetch clients for this user ──────────────────────────────────────────
    let clients = [];
    if (userRole === 'accountant') {
      clients = db.prepare('SELECT * FROM clients WHERE accountant_id = ?').all(userId);
    } else {
      clients = db.prepare('SELECT * FROM clients WHERE owner_id = ?').all(userId);
    }

    // ── BIR deadline notifications ───────────────────────────────────────────
    for (const client of clients) {
      const taxTypes = client.taxTypes || [];
      if (!taxTypes.length) continue;

      const deadlines = getUpcomingDeadlines(taxTypes, now);

      for (const dl of deadlines) {
        const daysUntil = dl.daysUntil ?? Math.round((new Date(dl.due) - now) / 86400000);
        if (daysUntil <= 7) {
          const severity = daysUntil <= 0 ? 'error' : daysUntil <= 3 ? 'warning' : 'info';
          const label    = daysUntil < 0  ? `${Math.abs(daysUntil)}d overdue`
                         : daysUntil === 0 ? 'due today'
                         : `due in ${daysUntil}d`;
          notifications.push({
            id: `bir-${client.id}-${dl.code || dl.name.slice(0,8)}`,
            type: daysUntil <= 0 ? 'bir_overdue' : 'bir_due_soon',
            severity,
            title: `${dl.code || 'Filing'} — ${label}`,
            body: `${client.tradeName}: ${dl.name}`,
            clientId: client.id,
            clientName: client.tradeName,
            date: dl.due,
            daysUntil,
          });
        }
      }
    }

    // ── Encoder activity (accountant only, last 24h) ─────────────────────────
    if (userRole === 'accountant' && clients.length > 0) {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const placeholders = clients.map(() => '?').join(',');
      const clientIds = clients.map(c => c.id);

      const rows = db.prepare(`
        SELECT t.client_id, c.trade_name, u.email, COUNT(*) AS n
        FROM transactions t
        JOIN clients c ON c.id = t.client_id
        JOIN users u ON u.id = t.created_by
        WHERE t.client_id IN (${placeholders})
          AND t.created_at >= ?
          AND u.role = 'encoder'
          AND t.voided_at IS NULL
        GROUP BY t.client_id, t.created_by
      `).all(...clientIds, since);

      for (const row of rows) {
        notifications.push({
          id: `enc-${row.client_id}-${today}`,
          type: 'encoder_activity',
          severity: 'info',
          title: `${row.n} new entry${row.n > 1 ? 's' : ''} encoded`,
          body: `${row.trade_name} — ${row.email}`,
          clientId: row.client_id,
          clientName: row.trade_name,
          date: today,
        });
      }
    }

    // ── AR overdue — income with AR settlement > 30 days old ────────────────
    for (const client of clients) {
      const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
      const ar = db.prepare(`
        SELECT COUNT(*) as n, SUM(gross) as total
        FROM transactions
        WHERE client_id = ? AND type = 'income' AND settlement = 'ar'
          AND voided_at IS NULL AND created_at < ?
      `).get(client.id, cutoff);

      if (ar?.n > 0) {
        const amt = (ar.total || 0).toLocaleString('en-PH', {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
        notifications.push({
          id: `ar-${client.id}`,
          type: 'ar_overdue',
          severity: 'warning',
          title: `${ar.n} AR invoice${ar.n > 1 ? 's' : ''} unpaid 30+ days`,
          body: `${client.tradeName}: ₱${amt} receivable outstanding`,
          clientId: client.id,
          clientName: client.tradeName,
          date: today,
        });
      }
    }

    // Sort: error → warning → info, then by date
    const order = { error: 0, warning: 1, info: 2 };
    notifications.sort((a, b) =>
      (order[a.severity] ?? 9) - (order[b.severity] ?? 9) ||
      new Date(a.date) - new Date(b.date)
    );

    res.json({ notifications, count: notifications.length });
  } catch (err) { next(err); }
});

export default router;
