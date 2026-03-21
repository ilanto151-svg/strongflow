// server/routes/patients.js
const router = require('express').Router();
const { pool } = require('../pg');
const { authTherapist, authAny } = require('../middleware/auth');
const crypto = require('crypto');

// GET all patients for therapist
router.get('/', authTherapist, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM patients
       WHERE therapist_id = $1
       ORDER BY sort_order, created_at`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET one patient
router.get('/:id', authAny, async (req, res, next) => {
  try {
    let patient;

    if (req.user.role === 'therapist') {
      const result = await pool.query(
        `SELECT *
         FROM patients
         WHERE id = $1 AND therapist_id = $2`,
        [req.params.id, req.user.id]
      );
      patient = result.rows[0];
    } else {
      if (req.params.id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const result = await pool.query(
        `SELECT *
         FROM patients
         WHERE id = $1`,
        [req.params.id]
      );
      patient = result.rows[0];
    }

    if (!patient) {
      return res.status(404).json({ error: 'Not found' });
    }

    res.json(patient);
  } catch (err) {
    next(err);
  }
});

// CREATE patient
router.post('/', authTherapist, async (req, res, next) => {
  try {
    const {
      name,
      phone,
      email,
      dob,
      gender,
      diagnosis,
      medhistory,
      notes,
      status,
      sort_order,
      equipment,
      environment,
      comorbidities
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const id = 'p_' + crypto.randomUUID().slice(0, 8);

    await pool.query(
      `INSERT INTO patients (
        id,
        therapist_id,
        name,
        phone,
        email,
        dob,
        gender,
        diagnosis,
        medhistory,
        notes,
        status,
        sort_order,
        equipment,
        environment,
        comorbidities
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15
      )`,
      [
        id,
        req.user.id,
        name,
        phone || '',
        email || '',
        dob || null,
        gender || '',
        diagnosis || '',
        medhistory || '',
        notes || '',
        status || 'active',
        sort_order ?? 0,
        equipment || '',
        environment || '',
        comorbidities || ''
      ]
    );

    const result = await pool.query(
      `SELECT *
       FROM patients
       WHERE id = $1`,
      [id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// UPDATE patient
router.put('/:id', authTherapist, async (req, res, next) => {
  try {
    const exists = await pool.query(
      `SELECT id
       FROM patients
       WHERE id = $1 AND therapist_id = $2`,
      [req.params.id, req.user.id]
    );

    if (!exists.rows[0]) {
      return res.status(404).json({ error: 'Not found' });
    }

    const {
      name,
      phone,
      email,
      dob,
      gender,
      diagnosis,
      medhistory,
      notes,
      status,
      sort_order,
      equipment,
      environment,
      comorbidities
    } = req.body;

    await pool.query(
      `UPDATE patients
       SET
         name = $1,
         phone = $2,
         email = $3,
         dob = $4,
         gender = $5,
         diagnosis = $6,
         medhistory = $7,
         notes = $8,
         status = $9,
         sort_order = $10,
         equipment = $11,
         environment = $12,
         comorbidities = $13
       WHERE id = $14`,
      [
        name,
        phone || '',
        email || '',
        dob || null,
        gender || '',
        diagnosis || '',
        medhistory || '',
        notes || '',
        status || 'active',
        sort_order ?? 0,
        equipment || '',
        environment || '',
        comorbidities || '',
        req.params.id
      ]
    );

    const result = await pool.query(
      `SELECT *
       FROM patients
       WHERE id = $1`,
      [req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE patient
router.delete('/:id', authTherapist, async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM patients
       WHERE id = $1 AND therapist_id = $2`,
      [req.params.id, req.user.id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
