// server/routes/therapist.js
const router = require('express').Router();
const { pool } = require('../pg');
const { authTherapist } = require('../middleware/auth');

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.get('/me', authTherapist, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, email, whatsapp_number FROM therapists WHERE id = $1 LIMIT 1',
    [req.user.id]
  );

  if (!rows.length) {
    return res.status(404).json({ error: 'Therapist not found' });
  }

  res.json(rows[0]);
}));

router.put('/settings', authTherapist, asyncHandler(async (req, res) => {
  const { whatsapp_number } = req.body;

  await pool.query(
    'UPDATE therapists SET whatsapp_number = $1 WHERE id = $2',
    [whatsapp_number || '', req.user.id]
  );

  res.json({ ok: true });
}));

router.put('/name', authTherapist, asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'name required' });
  }

  await pool.query(
    'UPDATE therapists SET name = $1 WHERE id = $2',
    [name, req.user.id]
  );

  res.json({ ok: true, name });
}));

module.exports = router;
