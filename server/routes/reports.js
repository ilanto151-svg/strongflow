// server/routes/reports.js
const router = require('express').Router();
const { pool } = require('../pg');
const { authAny } = require('../middleware/auth');

async function canAccess(user, pid) {
  if (user.role === 'therapist') {
    const { rows } = await pool.query(
      'SELECT id FROM patients WHERE id = $1 AND therapist_id = $2 LIMIT 1',
      [pid, user.id]
    );
    return rows.length > 0;
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
    submitted_at: r.created_at || null,
  };
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// GET /reports/:pid
router.get(
  '/:pid',
  authAny,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM reports WHERE patient_id = $1 ORDER BY day_key',
      [req.params.pid]
    );

    res.json(rows.map(parseReport));
  })
);

// POST /reports/:pid
router.post(
  '/:pid',
  authAny,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const pid = req.params.pid;
    const { day_key, fatigue, pain, wellbeing, notes, session_rpe, session_data } = req.body;

    const existingResult = await pool.query(
      'SELECT * FROM reports WHERE patient_id = $1 AND day_key = $2 LIMIT 1',
      [pid, day_key]
    );

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];

      const nextFatigue = fatigue !== undefined ? fatigue : existing.fatigue;
      const nextPain = pain !== undefined ? pain : existing.pain;
      const nextWellbeing = wellbeing !== undefined ? wellbeing : existing.wellbeing;
      const nextNotes = notes !== undefined ? notes : existing.notes;
      const nextSessionRpe =
        session_rpe !== undefined ? JSON.stringify(session_rpe) : existing.session_rpe;
      const nextSessionData =
        session_data !== undefined ? JSON.stringify(session_data) : existing.session_data;

      await pool.query(
        `
        UPDATE reports
        SET fatigue = $1,
            pain = $2,
            wellbeing = $3,
            notes = $4,
            session_rpe = $5,
            session_data = $6,
            created_at = CURRENT_TIMESTAMP
        WHERE patient_id = $7 AND day_key = $8
        `,
        [
          nextFatigue,
          nextPain,
          nextWellbeing,
          nextNotes,
          nextSessionRpe,
          nextSessionData,
          pid,
          day_key,
        ]
      );
    } else {
      await pool.query(
        `
        INSERT INTO reports
        (patient_id, day_key, fatigue, pain, wellbeing, notes, session_rpe, session_data, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
        `,
        [
          pid,
          day_key,
          fatigue ?? null,
          pain ?? null,
          wellbeing ?? null,
          notes ?? '',
          session_rpe !== undefined ? JSON.stringify(session_rpe) : null,
          session_data !== undefined ? JSON.stringify(session_data) : null,
        ]
      );
    }

    res.json({ ok: true });
  })
);

module.exports = router;