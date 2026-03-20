// server/routes/exercises.js
const router = require('express').Router();
const db     = require('../db');
const crypto = require('crypto');
const { authTherapist, authAny } = require('../middleware/auth');

function canAccessTherapist(tid, pid) {
  return db.prepare('SELECT id FROM patients WHERE id=? AND therapist_id=?').get(pid, tid);
}

function canAccessAny(user, pid) {
  if (user.role === 'therapist') return canAccessTherapist(user.id, pid);
  return user.id === pid;
}

function parseEx(r) {
  return {
    id:          r.id,
    instance_id: r.instance_id,
    day_key:     r.day_key,
    type:        r.type,
    name:        r.name,
    image:       r.image,
    description: r.description,
    equipment:   r.equipment,
    sets:        r.sets,
    reps:        r.reps,
    duration:    r.duration,
    body_area:   r.body_area,
    weight:      r.weight || '',
    rest:        r.rest || '',
    notes:       r.notes,
    rpe:         r.rpe,
    img_data:    r.img_data,
    img_url:     r.img_url,
    link:        r.link,
    intervals:   r.intervals || '[]',
    sort_order:  r.sort_order,
  };
}

// Get all exercises for a patient — flat array
router.get('/:pid', authAny, (req, res) => {
  if (!canAccessAny(req.user, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const rows = db.prepare('SELECT * FROM exercises WHERE patient_id=? ORDER BY day_key,sort_order,created_at')
    .all(req.params.pid);
  res.json(rows.map(parseEx));
});

// Add exercise
router.post('/:pid', authTherapist, (req, res) => {
  if (!canAccessTherapist(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });

  const ex  = req.body;
  const id  = 'ex_' + crypto.randomUUID().slice(0, 8);
  const iid = ex.instance_id || ('i_' + crypto.randomUUID().slice(0, 8));

  const maxOrd = db.prepare('SELECT MAX(sort_order) as m FROM exercises WHERE patient_id=? AND day_key=?')
    .get(req.params.pid, ex.day_key);

  const ord = (maxOrd && maxOrd.m ? maxOrd.m : 0) + 1;

  db.prepare('INSERT INTO exercises (id,patient_id,day_key,instance_id,type,name,image,description,equipment,sets,reps,duration,body_area,weight,rest,notes,rpe,img_data,img_url,link,intervals,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(
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
      ex.rpe != null ? ex.rpe : '',
      ex.img_data || null,
      ex.img_url || null,
      ex.link || null,
      ex.intervals || '[]',
      ord
    );

  res.json(parseEx(db.prepare('SELECT * FROM exercises WHERE id=?').get(id)));
});

// Update exercise
router.put('/:pid/:iid', authTherapist, (req, res) => {
  if (!canAccessTherapist(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });

  const ex = req.body;

  db.prepare('UPDATE exercises SET name=?,image=?,description=?,equipment=?,sets=?,reps=?,duration=?,body_area=?,weight=?,rest=?,notes=?,rpe=?,img_data=?,img_url=?,link=?,intervals=? WHERE instance_id=? AND patient_id=?')
    .run(
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
      ex.rpe != null ? ex.rpe : '',
      ex.img_data || null,
      ex.img_url || null,
      ex.link || null,
      ex.intervals || '[]',
      req.params.iid,
      req.params.pid
    );

  res.json({ ok: true });
});

// Delete exercise
router.delete('/:pid/:iid', authTherapist, (req, res) => {
  if (!canAccessTherapist(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM exercises WHERE instance_id=? AND patient_id=?')
    .run(req.params.iid, req.params.pid);
  res.json({ ok: true });
});

// Copy week
router.post('/:pid/copy', authTherapist, (req, res) => {
  if (!canAccessTherapist(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });

  const { src_week_offset, dst_week_offset } = req.body;
  let copied = 0;

  for (let dow = 0; dow < 7; dow++) {
    const srcKey = src_week_offset * 7 + dow;
    const dstKey = dst_week_offset * 7 + dow;

    const srcExs = db.prepare('SELECT * FROM exercises WHERE patient_id=? AND day_key=? ORDER BY sort_order')
      .all(req.params.pid, srcKey);

    if (!srcExs.length) continue;

    const maxOrd = db.prepare('SELECT MAX(sort_order) as m FROM exercises WHERE patient_id=? AND day_key=?')
      .get(req.params.pid, dstKey);

    let ord = (maxOrd && maxOrd.m ? maxOrd.m : 0) + 1;

    srcExs.forEach(ex => {
      const newId  = 'ex_' + crypto.randomUUID().slice(0, 8);
      const newIid = 'i_' + crypto.randomUUID().slice(0, 8);

      db.prepare('INSERT INTO exercises (id,patient_id,day_key,instance_id,type,name,image,description,equipment,sets,reps,duration,body_area,weight,rest,notes,rpe,img_data,img_url,link,intervals,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(
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
        );
    });

    copied++;
  }

  res.json({ copied });
});

// Copy single exercise to a target day
router.post('/:pid/copy-exercise', authTherapist, (req, res) => {
  if (!canAccessTherapist(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const { instance_id, dst_day_key, mode } = req.body;

  const ex = db.prepare('SELECT * FROM exercises WHERE instance_id=? AND patient_id=?')
    .get(instance_id, req.params.pid);
  if (!ex) return res.status(404).json({ error: 'Exercise not found' });

  if (mode === 'replace') {
    db.prepare('DELETE FROM exercises WHERE patient_id=? AND day_key=?')
      .run(req.params.pid, dst_day_key);
  }

  const maxOrd = db.prepare('SELECT MAX(sort_order) as m FROM exercises WHERE patient_id=? AND day_key=?')
    .get(req.params.pid, dst_day_key);
  const ord = (maxOrd && maxOrd.m ? maxOrd.m : 0) + 1;

  const newId  = 'ex_' + crypto.randomUUID().slice(0, 8);
  const newIid = 'i_'  + crypto.randomUUID().slice(0, 8);

  db.prepare('INSERT INTO exercises (id,patient_id,day_key,instance_id,type,name,image,description,equipment,sets,reps,duration,body_area,weight,rest,notes,rpe,img_data,img_url,link,intervals,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(newId, req.params.pid, dst_day_key, newIid,
         ex.type, ex.name, ex.image || '', ex.description || '', ex.equipment || '',
         ex.sets || '', ex.reps || '', ex.duration || '', ex.body_area || '',
         ex.weight || '', ex.rest || '', ex.notes || '', ex.rpe != null ? ex.rpe : '',
         ex.img_data || null, ex.img_url || null, ex.link || null,
         ex.intervals || '[]', ord);

  res.json({ ok: true });
});

// Copy all exercises from one day to another
router.post('/:pid/copy-day', authTherapist, (req, res) => {
  if (!canAccessTherapist(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const { src_day_key, dst_day_key, mode } = req.body;

  const srcExs = db.prepare('SELECT * FROM exercises WHERE patient_id=? AND day_key=? ORDER BY sort_order, created_at')
    .all(req.params.pid, src_day_key);

  if (mode === 'replace') {
    db.prepare('DELETE FROM exercises WHERE patient_id=? AND day_key=?')
      .run(req.params.pid, dst_day_key);
  }

  const maxOrd = db.prepare('SELECT MAX(sort_order) as m FROM exercises WHERE patient_id=? AND day_key=?')
    .get(req.params.pid, dst_day_key);
  let ord = (maxOrd && maxOrd.m ? maxOrd.m : 0) + 1;

  const stmt = db.prepare('INSERT INTO exercises (id,patient_id,day_key,instance_id,type,name,image,description,equipment,sets,reps,duration,body_area,weight,rest,notes,rpe,img_data,img_url,link,intervals,sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');

  for (const ex of srcExs) {
    stmt.run('ex_' + crypto.randomUUID().slice(0, 8), req.params.pid, dst_day_key,
             'i_' + crypto.randomUUID().slice(0, 8),
             ex.type, ex.name, ex.image || '', ex.description || '', ex.equipment || '',
             ex.sets || '', ex.reps || '', ex.duration || '', ex.body_area || '',
             ex.weight || '', ex.rest || '', ex.notes || '', ex.rpe != null ? ex.rpe : '',
             ex.img_data || null, ex.img_url || null, ex.link || null,
             ex.intervals || '[]', ord++);
  }

  res.json({ copied: srcExs.length });
});

module.exports = router;
