// server/routes/patients.js
const router = require('express').Router();
const db     = require('../db');
const { authTherapist, authAny } = require('../middleware/auth');
const crypto = require('crypto');

router.get('/', authTherapist, (req, res) => {
  const rows = db.prepare('SELECT * FROM patients WHERE therapist_id=? ORDER BY sort_order,created_at')
    .all(req.user.id);
  res.json(rows);
});

router.get('/:id', authAny, (req, res) => {
  let p;
  if (req.user.role === 'therapist') {
    p = db.prepare('SELECT * FROM patients WHERE id=? AND therapist_id=?').get(req.params.id, req.user.id);
  } else {
    // Patient can only access their own record
    if (req.params.id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    p = db.prepare('SELECT * FROM patients WHERE id=?').get(req.params.id);
  }
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

router.post('/', authTherapist, (req, res) => {
  const { name, phone, email, dob, gender, diagnosis, medhistory, notes, status, sort_order, equipment, environment, comorbidities } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = 'p_' + crypto.randomUUID().slice(0, 8);
  db.prepare(`INSERT INTO patients (id,therapist_id,name,phone,email,dob,gender,diagnosis,medhistory,notes,status,sort_order,equipment,environment,comorbidities)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.user.id, name, phone||'', email||'', dob||null, gender||'', diagnosis||'', medhistory||'', notes||'', status||'active', sort_order||0, equipment||'', environment||'', comorbidities||'');
  res.json(db.prepare('SELECT * FROM patients WHERE id=?').get(id));
});

router.put('/:id', authTherapist, (req, res) => {
  const p = db.prepare('SELECT id FROM patients WHERE id=? AND therapist_id=?')
    .get(req.params.id, req.user.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  const { name, phone, email, dob, gender, diagnosis, medhistory, notes, status, sort_order, equipment, environment, comorbidities } = req.body;
  db.prepare(`UPDATE patients SET name=?,phone=?,email=?,dob=?,gender=?,diagnosis=?,medhistory=?,notes=?,status=?,sort_order=?,equipment=?,environment=?,comorbidities=?
    WHERE id=?`).run(name, phone||'', email||'', dob||null, gender||'', diagnosis||'', medhistory||'', notes||'', status||'active', sort_order||0, equipment||'', environment||'', comorbidities||'', req.params.id);
  res.json(db.prepare('SELECT * FROM patients WHERE id=?').get(req.params.id));
});

router.delete('/:id', authTherapist, (req, res) => {
  db.prepare('DELETE FROM patients WHERE id=? AND therapist_id=?')
    .run(req.params.id, req.user.id);
  res.json({ ok: true });
});

module.exports = router;
