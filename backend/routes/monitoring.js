// backend/routes/monitoring.js
// User activity tracking and admin monitoring dashboard
// Tracks user actions, active users, and provides admin statistics

import express from 'express';
import { db } from '../db.js';

const router = express.Router();

// Middleware to authenticate requests
const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  
  try {
    const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    req.user = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ═══════════════════════════════════════════════════════════════════
// MIDDLEWARE: trackActivity
// Exported so it can be used in app.js
// Logs every user request: login, view transaction, submit report, etc.
// ═══════════════════════════════════════════════════════════════════
export const trackActivity = (req, res, next) => {
  if (req.user) {
    res.startTime = Date.now();
    res.on('finish', () => {
      try {
        const duration = Math.round((Date.now() - res.startTime) / 1000);
        db.prepare(`
          INSERT INTO user_activity (user_id, action, method, timestamp, duration_seconds)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          req.user.id,
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
router.get('/active-users', authenticateToken, (req, res) => {
  try {
    // Check if user is admin
    const user = db.prepare('SELECT role FROM clients WHERE id = ?').get(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    // Get users active in last 5 minutes
    const activeUserIds = db.prepare(`
      SELECT DISTINCT user_id FROM user_activity 
      WHERE timestamp > ?
      ORDER BY timestamp DESC
    `).all(fiveMinutesAgo).map(row => row.user_id);

    // Get user details for active users
    const activeUsers = activeUserIds.map(userId => {
      const userData = db.prepare(`
        SELECT id, name, email, subscription_tier FROM clients WHERE id = ?
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
        plan: userData?.subscription_tier || 'free',
        last_activity: lastActivity?.action || 'Unknown',
        last_activity_time: lastActivity?.timestamp,
        status: lastActivityTime > oneMinuteAgo ? 'online' : 'away'
      };
    });

    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM clients').get().count;

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
router.get('/payment-stats', authenticateToken, (req, res) => {
  try {
    // Check if admin
    const user = db.prepare('SELECT role FROM clients WHERE id = ?').get(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

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
router.get('/user-stats/:userId', authenticateToken, (req, res) => {
  try {
    // Check if admin
    const user = db.prepare('SELECT role FROM clients WHERE id = ?').get(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const userId = req.params.userId;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Get user info
    const userData = db.prepare('SELECT name, email, subscription_tier FROM clients WHERE id = ?').get(userId);
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
      plan: userData.subscription_tier,
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
router.get('/activity-log/:userId', authenticateToken, (req, res) => {
  try {
    // Check if admin
    const user = db.prepare('SELECT role FROM clients WHERE id = ?').get(req.user.id);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

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
