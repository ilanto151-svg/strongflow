// server/routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../pg');
const { JWT_SECRET, authAny } = require('../middleware/auth');

const sign = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });

function normalizePhoneForms(input) {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return [];

  const forms = new Set();
  forms.add(digits);

  // Israeli local -> international
  if (digits.startsWith('0') && digits.length >= 9) {
    forms.add('972' + digits.slice(1));
  }

  // Israeli international -> local
  if (digits.startsWith('972') && digits.length >= 11) {
    forms.add('0' + digits.slice(3));
  }

  return Array.from(forms);
}

// ── Therapist: first-time setup ──────────────────────────────────────────────
router.post('/therapist/setup', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password required' });
    }

    const existingResult = await pool.query(
      'SELECT id FROM therapists LIMIT 1'
    );
    const existing = existingResult.rows[0];

    if (existing) {
      return res.status(400).json({ error: 'Account already set up' });
    }

    const hash = bcrypt.hashSync(password, 10);

    await pool.query(
      'INSERT INTO therapists (id, email, password) VALUES ($1, $2, $3)',
      ['t1', email, hash]
    );

    const therapistResult = await pool.query(
      'SELECT * FROM therapists WHERE id = $1',
      ['t1']
    );
    const t = therapistResult.rows[0];

    res.json({
      token: sign({ id: t.id, name: t.name, role: 'therapist' }),
      name: t.name
    });
  } catch (err) {
    console.error('therapist setup error:', err);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// ── Therapist: check if setup done ──────────────────────────────────────────
router.get('/therapist/status', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email FROM therapists LIMIT 1'
    );
    const t = result.rows[0];

    res.json({
      isSetup: !!t,
      email: t?.email || ''
    });
  } catch (err) {
    console.error('therapist status error:', err);
    res.status(500).json({ error: 'Failed to check therapist status' });
  }
});

// ── Therapist: login ─────────────────────────────────────────────────────────
router.post('/therapist/login', async (req, res) => {
  try {
    const { password } = req.body;

    const result = await pool.query(
      'SELECT * FROM therapists LIMIT 1'
    );
    const t = result.rows[0];

    if (!t) {
      return res.status(404).json({ error: 'No account found' });
    }

    if (!bcrypt.compareSync(password, t.password)) {
      return res.status(401).json({ error: 'Incorrect password' });
    }

    res.json({
      token: sign({ id: t.id, name: t.name, role: 'therapist' }),
      name: t.name
    });
  } catch (err) {
    console.error('therapist login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── Therapist: forgot password (generates token) ─────────────────────────────
router.post('/therapist/forgot', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM therapists LIMIT 1'
    );
    const t = result.rows[0];

    if (!t || !t.email) {
      return res.status(404).json({ error: 'No email on file' });
    }

    const token = crypto.randomBytes(20).toString('hex');
    const exp = Date.now() + 3600000; // 1 hour

    await pool.query(
      'UPDATE therapists SET reset_token = $1, reset_exp = $2 WHERE id = $3',
      [token, String(exp), t.id]
    );

    res.json({ token, email: t.email });
  } catch (err) {
    console.error('therapist forgot error:', err);
    res.status(500).json({ error: 'Failed to create reset token' });
  }
});

// ── Therapist: reset password ────────────────────────────────────────────────
router.post('/therapist/reset', async (req, res) => {
  try {
    const { token, password } = req.body;

    const result = await pool.query(
      'SELECT * FROM therapists LIMIT 1'
    );
    const t = result.rows[0];

    if (!t || t.reset_token !== token) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    if (!t.reset_exp || Date.now() > Number(t.reset_exp)) {
      return res.status(400).json({ error: 'Token expired' });
    }

    const hash = bcrypt.hashSync(password, 10);

    await pool.query(
      'UPDATE therapists SET password = $1, reset_token = NULL, reset_exp = NULL WHERE id = $2',
      [hash, t.id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('therapist reset error:', err);
    res.status(500).json({ error: 'Reset failed' });
  }
});

// ── Patient: phone login ─────────────────────────────────────────────────────
router.post('/patient/login', async (req, res) => {
  try {
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'phone required' });
    }

    const inputForms = normalizePhoneForms(phone);

    const result = await pool.query(
      "SELECT * FROM patients WHERE status = 'active'"
    );
    const pts = result.rows;

    console.log('================ PATIENT LOGIN DEBUG ================');
    console.log('RAW INPUT PHONE:', phone);
    console.log('NORMALIZED INPUT FORMS:', inputForms);
    console.log(
      'ACTIVE PATIENTS:',
      pts.map((pt) => ({
        id: pt.id,
        name: pt.name,
        phone: pt.phone,
        patientForms: normalizePhoneForms(pt.phone),
        status: pt.status
      }))
    );

    const p = pts.find((pt) => {
      const patientForms = normalizePhoneForms(pt.phone);
      const matched = patientForms.some((f) => inputForms.includes(f));

      console.log('CHECKING PATIENT:', {
        name: pt.name,
        phone: pt.phone,
        patientForms,
        matched
      });

      return matched;
    });

    console.log('MATCHED PATIENT:', p || null);
    console.log('====================================================');

    if (!p) {
      return res.status(401).json({ error: 'No active patient found with this number' });
    }

    res.json({
      token: sign({
        id: p.id,
        name: p.name,
        role: 'patient',
        patientId: p.id
      }),
      name: p.name,
      id: p.id
    });
  } catch (err) {
    console.error('patient login error:', err);
    res.status(500).json({ error: 'Patient login failed' });
  }
});
// ── Validate token ──────────────────────────────────────────────────────────
router.get('/me', authAny, (req, res) => {
  res.json({
    id: req.user.id,
    name: req.user.name,
    role: req.user.role,
    patientId: req.user.patientId || req.user.id
  });
});

module.exports = router;