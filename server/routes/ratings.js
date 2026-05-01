// server/routes/ratings.js
const router = require('express').Router();
const { pool } = require('../pg');
const { authAny } = require('../middleware/auth');

async function canAccess(user, pid) {
  if (user.role === 'therapist') {
    const r = await pool.query(
      'SELECT id FROM patients WHERE id=$1 AND therapist_id=$2',
      [pid, user.id]
    );
    return !!r.rows[0];
  }
  return user.id === pid;
}

// GET /ratings/:pid — all exercise + plan ratings for a patient
router.get('/:pid', authAny, async (req, res, next) => {
  try {
    const ok = await canAccess(req.user, req.params.pid);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });

    const [exRows, planRows] = await Promise.all([
      pool.query(
        'SELECT exercise_name, liked FROM patient_exercise_ratings WHERE patient_id=$1',
        [req.params.pid]
      ),
      pool.query(
        'SELECT day_key, plan_liked FROM day_plans WHERE patient_id=$1 AND plan_liked IS NOT NULL',
        [req.params.pid]
      ),
    ]);

    const exercises = {};
    exRows.rows.forEach(r => { exercises[r.exercise_name] = r.liked ? 'liked' : 'disliked'; });

    const plans = {};
    planRows.rows.forEach(r => { plans[String(r.day_key)] = r.plan_liked ? 'liked' : 'disliked'; });

    res.json({ exercises, plans });
  } catch (e) { next(e); }
});

// POST /ratings/:pid/exercise — save or clear an exercise rating
router.post('/:pid/exercise', authAny, async (req, res, next) => {
  try {
    const ok = await canAccess(req.user, req.params.pid);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });

    const { name, liked } = req.body;
    const normName = (name || '').trim().toLowerCase();
    if (!normName) return res.status(400).json({ error: 'name required' });

    if (liked === null || liked === undefined) {
      await pool.query(
        'DELETE FROM patient_exercise_ratings WHERE patient_id=$1 AND exercise_name=$2',
        [req.params.pid, normName]
      );
    } else {
      await pool.query(
        `INSERT INTO patient_exercise_ratings (patient_id, exercise_name, liked, updated_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (patient_id, exercise_name)
         DO UPDATE SET liked=EXCLUDED.liked, updated_at=CURRENT_TIMESTAMP`,
        [req.params.pid, normName, liked]
      );
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /ratings/:pid/plan — save or clear a day-plan like
router.post('/:pid/plan', authAny, async (req, res, next) => {
  try {
    const ok = await canAccess(req.user, req.params.pid);
    if (!ok) return res.status(403).json({ error: 'Forbidden' });

    const { day_key, liked } = req.body;
    if (day_key == null) return res.status(400).json({ error: 'day_key required' });

    await pool.query(
      `INSERT INTO day_plans (patient_id, day_key, plan_liked, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (patient_id, day_key)
       DO UPDATE SET plan_liked=EXCLUDED.plan_liked, updated_at=CURRENT_TIMESTAMP`,
      [req.params.pid, day_key, liked === undefined ? null : liked]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
