// backend/routes/monitoring.js
// User activity tracking and admin monitoring dashboard
// Tracks user actions, active users, and provides admin statistics

import express from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const JWT_SECRET = process.env.JWT_SECRET || 'myledger-dev-secret-change-in-prod';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE: trackActivity
// Exported so it can be used in app.js
// Logs every user request: login, view transaction, submit report, etc.
// ═══════════════════════════════════════════════════════════════════
export const trackActivity = (req, res, next) => {
  // This middleware runs globally (before per-route authenticate calls),
  // so we decode the JWT here directly rather than relying on req.userId.
  // We verify the signature so activity can only be logged for valid sessions.
  const auth = req.headers['authorization'];
  const token = auth && auth.split(' ')[1];
  let userId = null;
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      userId = decoded.userId;
    } catch { /* unauthenticated request — skip tracking */ }
  }

  if (userId) {
    res.startTime = Date.now();
    res.on('finish', () => {
      try {
        const duration = Math.round((Date.now() - res.startTime) / 1000);
        db.prepare(`
          INSERT INTO user_activity (user_id, action, method, timestamp, duration_seconds)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          userId,
          req.path,
          req.method,
          new Date().toISOString(),
          duration
        );
      } catch (e) {
        console.error('Activity tracking error:', e.message);
      }
    });
  }
  next();
};

// ═══════════════════════════════════════════════════════════════════
// GET /api/monitoring/active-users
// Admin only: See who's online RIGHT NOW
// ═══════════════════════════════════════════════════════════════════
router.get('/active-users', authenticate, requireAdmin, (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Get users active in last 5 minutes
    const activeUserIds = db.prepare(`
      SELECT DISTINCT user_id FROM user_activity
      WHERE timestamp > ?
      ORDER BY timestamp DESC
    `).all(fiveMinutesAgo).map(row => row.user_id);

    // Get user details for active users (from users table, not clients)
    const activeUsers = activeUserIds.map(userId => {
      const userData = db.prepare(`
        SELECT id, name, email, role FROM users WHERE id = ?
      `).get(userId);

      const lastActivity = db.prepare(`
        SELECT action, timestamp FROM user_activity
        WHERE user_id = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(userId);

      const lastActivityTime = lastActivity?.timestamp ? new Date(lastActivity.timestamp).getTime() : 0;
      const oneMinuteAgo = Date.now() - 60000;

      return {
        id: userId,
        name: userData?.name || 'Unknown',
        email: userData?.email,
        role: userData?.role || 'client',
        last_activity: lastActivity?.action || 'Unknown',
        last_activity_time: lastActivity?.timestamp,
        status: lastActivityTime > oneMinuteAgo ? 'online' : 'away'
      };
    });

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;

    res.json({
      total_users: totalUsers,
      active_now: activeUsers.length,
      timestamp: new Date().toISOString(),
      users: activeUsers
    });
  } catch (error) {
    console.error('Active users fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/monitoring/payment-stats
// Admin only: Payment collection status & statistics
// ═══════════════════════════════════════════════════════════════════
router.get('/payment-stats', authenticate, requireAdmin, (req, res) => {
  try {

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

    const totalRevenue = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'paid'
    `).get().total || 0;

    const pendingPayments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE status = 'pending'
    `).get().total || 0;

    const overduePayments = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM payments 
      WHERE status = 'pending' AND created_at < ?
    `).get(threeDaysAgo).total || 0;

    const paymentCount = db.prepare(`
      SELECT COUNT(*) as count FROM payments WHERE status = 'paid'
    `).get().count || 0;

    const overdueCount = db.prepare(`
      SELECT COUNT(*) as count FROM payments 
      WHERE status = 'pending' AND created_at < ?
    `).get(threeDaysAgo).count || 0;

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM clients').get().count || 0;

    res.json({
      total_users: totalUsers,
      total_revenue: totalRevenue,
      pending_payments: pendingPayments,
      overdue_payments: overduePayments,
      payment_count: paymentCount,
      overdue_count: overdueCount,
      collection_rate: totalUsers > 0 ? Math.round((paymentCount / totalUsers) * 100) : 0,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Payment stats fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/monitoring/user-stats/:userId
// Admin only: Detailed stats for a specific user
// ═══════════════════════════════════════════════════════════════════
router.get('/user-stats/:userId', authenticate, requireAdmin, (req, res) => {
  try {
    const userId = req.params.userId;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get user info
    const userData = db.prepare('SELECT name, email, role FROM users WHERE id = ?').get(userId);
    if (!userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all activities for user
    const activities = db.prepare(`
      SELECT duration_seconds, timestamp FROM user_activity WHERE user_id = ?
    `).all(userId) || [];

    const totalSessions = activities.length;
    const sessionsToday = activities.filter(a => a.timestamp > twentyFourHoursAgo).length;
    const sessionsThisMonth = activities.filter(a => a.timestamp > thirtyDaysAgo).length;
    const lastActivity = activities.length > 0 ? activities[activities.length - 1].timestamp : null;
    const totalTimeSpent = activities.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
    const avgSessionDuration = activities.length > 0 
      ? Math.round(totalTimeSpent / activities.length)
      : 0;

    res.json({
      user_id: userId,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      total_sessions: totalSessions,
      sessions_today: sessionsToday,
      sessions_this_month: sessionsThisMonth,
      last_login: lastActivity,
      total_time_spent_seconds: totalTimeSpent,
      total_time_spent_hours: Math.round(totalTimeSpent / 3600),
      avg_session_duration_seconds: avgSessionDuration,
      engagement_level: sessionsThisMonth >= 20 ? 'High' : sessionsThisMonth >= 10 ? 'Medium' : 'Low',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('User stats fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/monitoring/activity-log/:userId
// Admin only: Full activity log for a user
// ═══════════════════════════════════════════════════════════════════
router.get('/activity-log/:userId', authenticate, requireAdmin, (req, res) => {
  try {
    const userId = req.params.userId;
    const limit = req.query.limit || 100;

    const activities = db.prepare(`
      SELECT * FROM user_activity 
      WHERE user_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `).all(userId, limit);

    res.json({
      user_id: userId,
      activity_count: activities.length,
      activities: activities || []
    });
  } catch (error) {
    console.error('Activity log fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
