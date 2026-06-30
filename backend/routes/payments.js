// backend/routes/payments.js
// Payment collection system - GCash, PayMaya, Bank Transfer
// Endpoints for payment creation, status tracking, subscription management

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
// POST /api/payments
// Create payment record (when user clicks "Pay with GCash")
// ═══════════════════════════════════════════════════════════════════
router.post('/', authenticateToken, (req, res) => {
  try {
    const { amount, method } = req.body;
    const userId = req.user.id;

    if (!amount || !method) {
      return res.status(400).json({ error: 'Amount and method required' });
    }

    const referenceNumber = `INV-${userId}-${Date.now()}`;
    
    const stmt = db.prepare(`
      INSERT INTO payments (user_id, amount, method, status, reference_number, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      userId,
      amount,
      method,
      'pending',
      referenceNumber,
      new Date().toISOString()
    );

    res.json({
      id: result.lastID,
      user_id: userId,
      amount,
      method,
      status: 'pending',
      reference_number: referenceNumber,
      created_at: new Date().toISOString()
    });
  } catch (error) {
    console.error('Payment creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/payments
// Get user's payment history
// ═══════════════════════════════════════════════════════════════════
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    const payments = db.prepare(`
      SELECT * FROM payments 
      WHERE user_id = ? 
      ORDER BY created_at DESC
    `).all(userId);

    res.json(payments || []);
  } catch (error) {
    console.error('Payment fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// PUT /api/payments/:id
// Update payment status (when GCash/PayMaya confirms payment)
// ═══════════════════════════════════════════════════════════════════
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const { status, reference_number } = req.body;
    const paymentId = req.params.id;
    const userId = req.user.id;

    // Verify payment belongs to this user
    const payment = db.prepare(`
      SELECT * FROM payments WHERE id = ? AND user_id = ?
    `).get(paymentId, userId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update payment status
    const updateStmt = db.prepare(`
      UPDATE payments 
      SET status = ?, reference_number = ?, paid_at = ?
      WHERE id = ?
    `);

    updateStmt.run(
      status,
      reference_number || payment.reference_number,
      status === 'paid' ? new Date().toISOString() : null,
      paymentId
    );

    // If paid, update subscription expiry
    if (status === 'paid') {
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(`
        UPDATE clients 
        SET subscription_expires_at = ?
        WHERE id = ? AND subscription_tier != 'free'
      `).run(thirtyDaysFromNow, userId);
    }

    res.json({ 
      success: true, 
      message: 'Payment updated',
      payment_id: paymentId,
      new_status: status 
    });
  } catch (error) {
    console.error('Payment update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/payments/subscription/user/:userId
// Get user's subscription status
// ═══════════════════════════════════════════════════════════════════
router.get('/subscription/user/:userId', authenticateToken, (req, res) => {
  try {
    const userId = req.params.userId;
    const requestingUser = req.user.id;

    // Users can only see their own subscription
    if (userId !== requestingUser) {
      // Allow admin to see any subscription
      const admin = db.prepare('SELECT role FROM clients WHERE id = ?').get(requestingUser);
      if (!admin || admin.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized' });
      }
    }

    const subscription = db.prepare(`
      SELECT 
        id, 
        subscription_tier as plan,
        subscription_expires_at as due_date,
        CASE 
          WHEN subscription_expires_at < datetime('now') THEN 'expired'
          ELSE 'active'
        END as status
      FROM clients
      WHERE id = ?
    `).get(userId);

    if (!subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json(subscription);
  } catch (error) {
    console.error('Subscription fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/payments/status/:paymentId
// Check specific payment status
// ═══════════════════════════════════════════════════════════════════
router.get('/status/:paymentId', authenticateToken, (req, res) => {
  try {
    const paymentId = req.params.paymentId;
    const userId = req.user.id;

    const payment = db.prepare(`
      SELECT * FROM payments WHERE id = ? AND user_id = ?
    `).get(paymentId, userId);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error('Payment status fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
