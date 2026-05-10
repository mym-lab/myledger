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
    req.userRole = decoded.role || 'client';   // 'client' | 'accountant' | 'encoder'
    next();
  } catch {
    res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// Block encoders from sensitive routes
export function noEncoder(req, res, next) {
  if (req.userRole === 'encoder')
    return res.status(403).json({ error: 'Encoders do not have access to this resource' });
  next();
}
