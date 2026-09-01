// ─── JWT Authentication Middleware ────────────────────────────
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'myledger-dev-secret-change-in-prod';

export function authenticate(req, res, next) {
  const auth = req.headers['authorization'];
  const token = auth && auth.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId   = decoded.userId;
    req.userRole = decoded.role || 'client';   // 'client' | 'accountant' | 'encoder' | 'staff'
    req.ownerId  = decoded.ownerId || null;    // set for role=staff: accountant's user id
    next();
  } catch (err) {
    // 401 = token invalid or expired → client must re-authenticate
    // (403 is reserved for valid token + insufficient role, handled by noEncoder/requireAdmin)
    const msg = err.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.'
              : 'Invalid token. Please sign in again.';
    res.status(401).json({ error: msg });
  }
}

// Block encoders from sensitive routes
export function noEncoder(req, res, next) {
  if (req.userRole === 'encoder')
    return res.status(403).json({ error: 'Encoders do not have access to this resource' });
  next();
}

// Admin-only routes
export function requireAdmin(req, res, next) {
  if (req.userRole !== 'admin')
    return res.status(403).json({ error: 'Admin access required' });
  next();
}
