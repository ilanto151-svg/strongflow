// server/routes/auth.js
const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const db      = require('../db');
const { JWT_SECRET, authAny } = require('../middleware/auth');

const sign = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

// ── Therapist: first-time setup ──────────────────────────────────────────────
router.post('/therapist/setup', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password required' });
  const existing = db.prepare('SELECT id FROM therapists LIMIT 1').get();
  if (existing) return res.status(400).json({ error: 'Account already set up' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO therapists (id,email,password) VALUES (?,?,?)')
    .run('t1', email, hash);
  const t = db.prepare('SELECT * FROM therapists WHERE id=?').get('t1');
  res.json({ token: sign({ id: t.id, name: t.name, role: 'therapist' }), name: t.name });
});

// ── Therapist: check if setup done ──────────────────────────────────────────
router.get('/therapist/status', (req, res) => {
  const t = db.prepare('SELECT id,email FROM therapists LIMIT 1').get();
  res.json({ isSetup: !!t, email: t?.email || '' });
});

// ── Therapist: login ─────────────────────────────────────────────────────────
router.post('/therapist/login', (req, res) => {
  const { password } = req.body;
  const t = db.prepare('SELECT * FROM therapists LIMIT 1').get();
  if (!t) return res.status(404).json({ error: 'No account found' });
  if (!bcrypt.compareSync(password, t.password))
    return res.status(401).json({ error: 'Incorrect password' });
  res.json({ token: sign({ id: t.id, name: t.name, role: 'therapist' }), name: t.name });
});

// ── Therapist: forgot password (generates token) ─────────────────────────────
router.post('/therapist/forgot', (req, res) => {
  const t = db.prepare('SELECT * FROM therapists LIMIT 1').get();
  if (!t || !t.email) return res.status(404).json({ error: 'No email on file' });
  const token = crypto.randomBytes(20).toString('hex');
  const exp   = Date.now() + 3600000; // 1 hour
  db.prepare('UPDATE therapists SET reset_token=?,reset_exp=? WHERE id=?')
    .run(token, exp, t.id);
  // Return token + email so client can compose mailto link
  res.json({ token, email: t.email });
});

// ── Therapist: reset password ────────────────────────────────────────────────
router.post('/therapist/reset', (req, res) => {
  const { token, password } = req.body;
  const t = db.prepare('SELECT * FROM therapists LIMIT 1').get();
  if (!t || t.reset_token !== token) return res.status(400).json({ error: 'Invalid token' });
  if (Date.now() > t.reset_exp) return res.status(400).json({ error: 'Token expired' });
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE therapists SET password=?,reset_token=NULL,reset_exp=NULL WHERE id=?')
    .run(hash, t.id);
  res.json({ ok: true });
});

// ── Patient: phone login ─────────────────────────────────────────────────────
router.post('/patient/login', (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone required' });
  const norm = phone.replace(/\D/g, '');
  const pts  = db.prepare("SELECT * FROM patients WHERE status='active'").all();
  const p    = pts.find(pt => pt.phone && pt.phone.replace(/\D/g, '') === norm);
  if (!p) return res.status(401).json({ error: 'No active patient found with this number' });
  res.json({ token: sign({ id: p.id, name: p.name, role: 'patient', patientId: p.id }), name: p.name, id: p.id });
});

// ── Validate token ──────────────────────────────────────────────────────────
router.get('/me', authAny, (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, role: req.user.role, patientId: req.user.patientId || req.user.id });
});

module.exports = router;
