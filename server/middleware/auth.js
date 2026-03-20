// server/middleware/auth.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'oncomove-dev-secret-change-in-prod';

function verify(req, res, role) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (role && payload.role !== role) return res.status(403).json({ error: 'Forbidden' });
    req.user = payload;
    return null;
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

exports.authTherapist = (req, res, next) => { const err = verify(req, res, 'therapist'); if (!err) next(); };
exports.authPatient   = (req, res, next) => { const err = verify(req, res, 'patient');   if (!err) next(); };
exports.authAny       = (req, res, next) => { const err = verify(req, res, null);         if (!err) next(); };
exports.JWT_SECRET = JWT_SECRET;
