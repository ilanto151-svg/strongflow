// server/routes/exercises.js
const router = require('express').Router();
const { pool } = require('../pg');
const crypto = require('crypto');
const { authTherapist, authAny } = require('../middleware/auth');

async function canAccessTherapist(tid, pid) {
  const result = await pool.query(
    'SELECT id FROM patients WHERE id = $1 AND therapist_id = $2',
    [pid, tid]
  );
  return result.rows[0];
}

async function canAccessAny(user, pid) {
  if (user.role === 'therapist') {
    return !!(await canAccessTherapist(user.id, pid));
  }
  return user.id === pid;
}

function parseEx(r) {
  return {
    id: r.id,
    instance_id: r.instance_id,
    day_key: r.day_key,
    type: r.type,
    name: r.name,
    image: r.image,
    description: r.description,
    equipment: r.equipment,
    sets: r.sets,
    reps: r.reps,
    duration: r.duration,
    body_area: r.body_area,
    weight: r.weight || '',
    rest: r.rest || '',
    notes: r.notes,
    rpe: r.rpe,
    img_data: r.img_data,
    img_url: r.img_url,
    link: r.link,
    intervals: r.intervals || '[]',
    sort_order: r.sort_order,
  };
}

// Get all exercises for a patient — flat array
router.get('/:pid', authAny, async (req, res, next) => {
  try {
    const allowed = await canAccessAny(req.user, req.params.pid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const rows = await pool.query(
      `SELECT * FROM exercises
       WHERE patient_id = $1
       ORDER BY day_key, sort_order, created_at`,
      [req.params.pid]
    );

    res.json(rows.rows.map(parseEx));
  } catch (err) {
    next(err);
  }
});

// Add exercise
router.post('/:pid', authTherapist, async (req, res, next) => {
  try {
    const allowed = await canAccessTherapist(req.user.id, req.params.pid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const ex = req.body;
    const id = 'ex_' + crypto.randomUUID().slice(0, 8);
    const iid = ex.instance_id || ('i_' + crypto.randomUUID().slice(0, 8));

    const maxOrd = await pool.query(
      'SELECT MAX(sort_order) AS m FROM exercises WHERE patient_id = $1 AND day_key = $2',
      [req.params.pid, ex.day_key]
    );

    const ord = ((maxOrd.rows[0] && maxOrd.rows[0].m) || 0) + 1;

    await pool.query(
      `INSERT INTO exercises (
        id, patient_id, day_key, instance_id, type, name, image, description,
        equipment, sets, reps, duration, body_area, weight, rest, notes,
        rpe, img_data, img_url, link, intervals, sort_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22
      )`,
      [
        id,
        req.params.pid,
        ex.day_key,
        iid,
        ex.type,
        ex.name,
        ex.image || '',
        ex.description || '',
        ex.equipment || '',
        ex.sets || '',
        ex.reps || '',
        ex.duration || '',
        ex.body_area || '',
        ex.weight || '',
        ex.rest || '',
        ex.notes || '',
        ex.rpe != null ? ex.rpe : 5,
        ex.img_data || null,
        ex.img_url || null,
        ex.link || null,
        ex.intervals || '[]',
        ord
      ]
    );

    const inserted = await pool.query(
      'SELECT * FROM exercises WHERE id = $1',
      [id]
    );

    res.json(parseEx(inserted.rows[0]));
  } catch (err) {
    next(err);
  }
});

// Update exercise
router.put('/:pid/:iid', authTherapist, async (req, res, next) => {
  try {
    const allowed = await canAccessTherapist(req.user.id, req.params.pid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const ex = req.body;

    await pool.query(
      `UPDATE exercises
       SET
         name = $1,
         image = $2,
         description = $3,
         equipment = $4,
         sets = $5,
         reps = $6,
         duration = $7,
         body_area = $8,
         weight = $9,
         rest = $10,
         notes = $11,
         rpe = $12,
         img_data = $13,
         img_url = $14,
         link = $15,
         intervals = $16
       WHERE instance_id = $17 AND patient_id = $18`,
      [
        ex.name,
        ex.image || '',
        ex.description || '',
        ex.equipment || '',
        ex.sets || '',
        ex.reps || '',
        ex.duration || '',
        ex.body_area || '',
        ex.weight || '',
        ex.rest || '',
        ex.notes || '',
        ex.rpe != null ? ex.rpe : 5,
        ex.img_data || null,
        ex.img_url || null,
        ex.link || null,
        ex.intervals || '[]',
        req.params.iid,
        req.params.pid
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Delete exercise
router.delete('/:pid/:iid', authTherapist, async (req, res, next) => {
  try {
    const allowed = await canAccessTherapist(req.user.id, req.params.pid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(
      'DELETE FROM exercises WHERE instance_id = $1 AND patient_id = $2',
      [req.params.iid, req.params.pid]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Copy week
router.post('/:pid/copy', authTherapist, async (req, res, next) => {
  try {
    const allowed = await canAccessTherapist(req.user.id, req.params.pid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const { src_week_offset, dst_week_offset } = req.body;
    let copied = 0;

    for (let dow = 0; dow < 7; dow++) {
      const srcKey = src_week_offset * 7 + dow;
      const dstKey = dst_week_offset * 7 + dow;

      const srcExs = await pool.query(
        `SELECT * FROM exercises
         WHERE patient_id = $1 AND day_key = $2
         ORDER BY sort_order`,
        [req.params.pid, srcKey]
      );

      if (!srcExs.rows.length) continue;

      const maxOrd = await pool.query(
        'SELECT MAX(sort_order) AS m FROM exercises WHERE patient_id = $1 AND day_key = $2',
        [req.params.pid, dstKey]
      );

      let ord = ((maxOrd.rows[0] && maxOrd.rows[0].m) || 0) + 1;

      for (const ex of srcExs.rows) {
        const newId = 'ex_' + crypto.randomUUID().slice(0, 8);
        const newIid = 'i_' + crypto.randomUUID().slice(0, 8);

        await pool.query(
          `INSERT INTO exercises (
            id, patient_id, day_key, instance_id, type, name, image, description,
            equipment, sets, reps, duration, body_area, weight, rest, notes,
            rpe, img_data, img_url, link, intervals, sort_order
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22
          )`,
          [
            newId,
            req.params.pid,
            dstKey,
            newIid,
            ex.type,
            ex.name,
            ex.image || '',
            ex.description || '',
            ex.equipment || '',
            ex.sets || '',
            ex.reps || '',
            ex.duration || '',
            ex.body_area || '',
            ex.weight || '',
            ex.rest || '',
            ex.notes || '',
            null,
            ex.img_data || null,
            ex.img_url || null,
            ex.link || null,
            ex.intervals || '[]',
            ord++
          ]
        );
      }

      copied++;
    }

    res.json({ copied });
  } catch (err) {
    next(err);
  }
});

// Copy single exercise to a target day
router.post('/:pid/copy-exercise', authTherapist, async (req, res, next) => {
  try {
    const allowed = await canAccessTherapist(req.user.id, req.params.pid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const { instance_id, dst_day_key, mode } = req.body;

    const exResult = await pool.query(
      'SELECT * FROM exercises WHERE instance_id = $1 AND patient_id = $2',
      [instance_id, req.params.pid]
    );

    const ex = exResult.rows[0];
    if (!ex) return res.status(404).json({ error: 'Exercise not found' });

    if (mode === 'replace') {
      await pool.query(
        'DELETE FROM exercises WHERE patient_id = $1 AND day_key = $2',
        [req.params.pid, dst_day_key]
      );
    }

    const maxOrd = await pool.query(
      'SELECT MAX(sort_order) AS m FROM exercises WHERE patient_id = $1 AND day_key = $2',
      [req.params.pid, dst_day_key]
    );

    const ord = ((maxOrd.rows[0] && maxOrd.rows[0].m) || 0) + 1;

    const newId = 'ex_' + crypto.randomUUID().slice(0, 8);
    const newIid = 'i_' + crypto.randomUUID().slice(0, 8);

    await pool.query(
      `INSERT INTO exercises (
        id, patient_id, day_key, instance_id, type, name, image, description,
        equipment, sets, reps, duration, body_area, weight, rest, notes,
        rpe, img_data, img_url, link, intervals, sort_order
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22
      )`,
      [
        newId,
        req.params.pid,
        dst_day_key,
        newIid,
        ex.type,
        ex.name,
        ex.image || '',
        ex.description || '',
        ex.equipment || '',
        ex.sets || '',
        ex.reps || '',
        ex.duration || '',
        ex.body_area || '',
        ex.weight || '',
        ex.rest || '',
        ex.notes || '',
        ex.rpe != null ? ex.rpe : 5,
        ex.img_data || null,
        ex.img_url || null,
        ex.link || null,
        ex.intervals || '[]',
        ord
      ]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Copy all exercises from one day to another
router.post('/:pid/copy-day', authTherapist, async (req, res, next) => {
  try {
    const allowed = await canAccessTherapist(req.user.id, req.params.pid);
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });

    const { src_day_key, dst_day_key, mode } = req.body;

    const srcExs = await pool.query(
      `SELECT * FROM exercises
       WHERE patient_id = $1 AND day_key = $2
       ORDER BY sort_order, created_at`,
      [req.params.pid, src_day_key]
    );

    if (mode === 'replace') {
      await pool.query(
        'DELETE FROM exercises WHERE patient_id = $1 AND day_key = $2',
        [req.params.pid, dst_day_key]
      );
    }

    const maxOrd = await pool.query(
      'SELECT MAX(sort_order) AS m FROM exercises WHERE patient_id = $1 AND day_key = $2',
      [req.params.pid, dst_day_key]
    );

    let ord = ((maxOrd.rows[0] && maxOrd.rows[0].m) || 0) + 1;

    for (const ex of srcExs.rows) {
      await pool.query(
        `INSERT INTO exercises (
          id, patient_id, day_key, instance_id, type, name, image, description,
          equipment, sets, reps, duration, body_area, weight, rest, notes,
          rpe, img_data, img_url, link, intervals, sort_order
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21, $22
        )`,
        [
          'ex_' + crypto.randomUUID().slice(0, 8),
          req.params.pid,
          dst_day_key,
          'i_' + crypto.randomUUID().slice(0, 8),
          ex.type,
          ex.name,
          ex.image || '',
          ex.description || '',
          ex.equipment || '',
          ex.sets || '',
          ex.reps || '',
          ex.duration || '',
          ex.body_area || '',
          ex.weight || '',
          ex.rest || '',
          ex.notes || '',
          ex.rpe != null ? ex.rpe : 5,
          ex.img_data || null,
          ex.img_url || null,
          ex.link || null,
          ex.intervals || '[]',
          ord++
        ]
      );
    }

    res.json({ copied: srcExs.rows.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;