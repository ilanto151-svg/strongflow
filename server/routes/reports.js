// server/routes/reports.js
const router = require('express').Router();
const db     = require('../db');
const crypto = require('crypto');
const { authAny, authPatient } = require('../middleware/auth');

function canAccess(user, pid) {
  if (user.role === 'therapist') {
    return db.prepare('SELECT id FROM patients WHERE id=? AND therapist_id=?').get(pid, user.id);
  }
  return user.id === pid;
}

function parseReport(r) {
  return {
    id: r.id,
    day_key: r.day_key,
    fatigue: r.fatigue,
    pain: r.pain,
    wellbeing: r.wellbeing,
    notes: r.notes,
    session_rpe: r.session_rpe ? JSON.parse(r.session_rpe) : {},
    session_data: r.session_data ? JSON.parse(r.session_data) : {},
    submitted_at: r.submitted_at
  };
}

// GET /reports/:pid — flat array of reports
router.get('/:pid', authAny, (req, res) => {
  if (!canAccess(req.user, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const rows = db.prepare('SELECT * FROM reports WHERE patient_id=? ORDER BY day_key').all(req.params.pid);
  res.json(rows.map(parseReport));
});

// POST /reports/:pid — submit/update a report
router.post('/:pid', authAny, (req, res) => {
  if (!canAccess(req.user, req.params.pid)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const pid = req.params.pid;
  const { day_key, fatigue, pain, wellbeing, notes, session_rpe, session_data } = req.body;

  const existing = db.prepare('SELECT * FROM reports WHERE patient_id=? AND day_key=?').get(pid, day_key);

  if (existing) {
    const nextFatigue    = fatigue      !== undefined ? fatigue      : existing.fatigue;
    const nextPain       = pain         !== undefined ? pain         : existing.pain;
    const nextWellbeing  = wellbeing    !== undefined ? wellbeing    : existing.wellbeing;
    const nextNotes      = notes        !== undefined ? notes        : existing.notes;
    const nextSessionRpe = session_rpe  !== undefined ? JSON.stringify(session_rpe)  : existing.session_rpe;
    const nextSessionData = session_data !== undefined ? JSON.stringify(session_data) : existing.session_data;

    db.prepare(`
      UPDATE reports
      SET fatigue=?, pain=?, wellbeing=?, notes=?, session_rpe=?, session_data=?, submitted_at=datetime('now')
      WHERE patient_id=? AND day_key=?
    `).run(nextFatigue, nextPain, nextWellbeing, nextNotes, nextSessionRpe, nextSessionData, pid, day_key);
  } else {
    const id = 'r_' + crypto.randomUUID().slice(0, 8);

    db.prepare(`
      INSERT INTO reports (id, patient_id, day_key, fatigue, pain, wellbeing, notes, session_rpe, session_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, pid, day_key,
      fatigue ?? null, pain ?? null, wellbeing ?? null,
      notes ?? '',
      session_rpe  !== undefined ? JSON.stringify(session_rpe)  : null,
      session_data !== undefined ? JSON.stringify(session_data) : null
    );
  }

  res.json({ ok: true });
});
module.exports = router;
