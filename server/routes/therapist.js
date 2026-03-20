// server/routes/therapist.js
const router = require('express').Router();
const db     = require('../db');
const { authTherapist } = require('../middleware/auth');

router.get('/me', authTherapist, (req, res) => {
  const t = db.prepare('SELECT id,name,email,whatsapp_number FROM therapists WHERE id=?').get(req.user.id);
  res.json(t);
});

router.put('/settings', authTherapist, (req, res) => {
  const { whatsapp_number } = req.body;
  db.prepare('UPDATE therapists SET whatsapp_number=? WHERE id=?').run(whatsapp_number || '', req.user.id);
  res.json({ ok: true });
});

router.put('/name', authTherapist, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  db.prepare('UPDATE therapists SET name=? WHERE id=?').run(name, req.user.id);
  res.json({ ok: true, name });
});

module.exports = router;
