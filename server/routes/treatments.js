// server/routes/treatments.js
const router = require('express').Router();
const { pool } = require('../pg');
const crypto = require('crypto');
const { authTherapist } = require('../middleware/auth');

// ===== ACCESS =====
async function canAccess(therapistId, patientId) {
  const { rows } = await pool.query(
    'SELECT id FROM patients WHERE id=$1 AND therapist_id=$2',
    [patientId, therapistId]
  );
  return rows.length > 0;
}

// ===== PARSERS =====
function parseTreatment(r) {
  return {
    ...r,
    is_active: !!r.is_active,
  };
}

function parseRule(r) {
  return {
    ...r,
    repeat_each_cycle: !!r.repeat_each_cycle,
    is_active: !!r.is_active,
  };
}

// ===== DATE HELPERS =====

function freqToMs(value, unit) {
  if (unit === 'days') return value * 86400000;
  if (unit === 'weeks') return value * 7 * 86400000;
  return value * 30 * 86400000;
}

function offsetToMs(value, unit) {
  return unit === 'weeks' ? value * 7 * 86400000 : value * 86400000;
}

function toDateStr(ms) {
  return new Date(ms).toISOString().split('T')[0];
}

// ===== CORE LOGIC =====

function computeReminders(treatment, rules, weekStart, weekEnd, dismissed) {
  const dismissedSet = new Set(dismissed.map(d => `${d.rule_id}|${d.occurrence_date}`));

  const startMs = new Date(treatment.start_date).getTime();
  const weekStartMs = new Date(weekStart).getTime();
  const weekEndMs = new Date(weekEnd).getTime() + 86399999;

  const fMs = freqToMs(treatment.frequency_value, treatment.frequency_unit);

  const reminders = [];

  for (const rule of rules) {
    if (!rule.is_active) continue;

    const isDuringWeek = rule.trigger_type === 'during_week';

    const offMs = isDuringWeek
      ? 0
      : rule.trigger_type === 'before'
        ? -offsetToMs(rule.offset_value, rule.offset_unit)
        : offsetToMs(rule.offset_value, rule.offset_unit);

    const nMin = Math.floor((weekStartMs - offMs - startMs) / fMs);
    const nMax = Math.ceil((weekEndMs - offMs - startMs) / fMs);

    for (let n = Math.max(0, nMin - 1); n <= nMax + 1; n++) {
      const cycleMs = startMs + n * fMs;
      if (cycleMs < startMs) continue;

      const cycleDate = toDateStr(cycleMs);

      if (isDuringWeek) {
        const dow = new Date(cycleMs).getDay();
        const sunMs = cycleMs - dow * 86400000;
        const satMs = sunMs + 6 * 86400000 + 86399999;

        if (sunMs > weekEndMs || satMs < weekStartMs) continue;

        const key = `${rule.id}|${cycleDate}`;
        if (!dismissedSet.has(key)) {
          reminders.push({
            rule_id: rule.id,
            treatment_id: treatment.id,
            treatment_name: treatment.name,
            occurrence_date: cycleDate,
            cycle_date: cycleDate,
          });
        }
      } else {
        const reminderMs = cycleMs + offMs;
        if (reminderMs < weekStartMs || reminderMs > weekEndMs) continue;

        const reminderDate = toDateStr(reminderMs);
        const key = `${rule.id}|${reminderDate}`;

        if (!dismissedSet.has(key)) {
          reminders.push({
            rule_id: rule.id,
            treatment_id: treatment.id,
            treatment_name: treatment.name,
            occurrence_date: reminderDate,
            cycle_date: cycleDate,
          });
        }
      }
    }
  }

  return reminders;
}

// ===== ROUTES =====

// GET treatments
router.get('/:pid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const { rows: treatments } = await pool.query(
    'SELECT * FROM patient_treatments WHERE patient_id=$1 ORDER BY created_at',
    [req.params.pid]
  );

  const result = [];

  for (const t of treatments) {
    const { rows: rules } = await pool.query(
      'SELECT * FROM treatment_reminder_rules WHERE treatment_id=$1 ORDER BY created_at',
      [t.id]
    );

    result.push({
      ...parseTreatment(t),
      rules: rules.map(parseRule),
    });
  }

  res.json(result);
});

// CREATE treatment
router.post('/:pid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const b = req.body;
  const id = 'tr_' + crypto.randomUUID().slice(0, 8);

  await pool.query(`
    INSERT INTO patient_treatments
    (id, patient_id, name, treatment_type, frequency_value, frequency_unit, start_date, last_treatment_date, notes, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
  `, [
    id, req.params.pid, b.name,
    b.treatment_type || '',
    b.frequency_value || 1,
    b.frequency_unit || 'weeks',
    b.start_date,
    b.last_treatment_date || null,
    b.notes || '',
    b.is_active !== false
  ]);

  const { rows } = await pool.query(
    'SELECT * FROM patient_treatments WHERE id=$1',
    [id]
  );

  res.json(parseTreatment(rows[0]));
});

// UPDATE treatment
router.put('/:pid/:tid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const b = req.body;

  await pool.query(`
    UPDATE patient_treatments SET
      name=$1,
      treatment_type=$2,
      frequency_value=$3,
      frequency_unit=$4,
      start_date=$5,
      last_treatment_date=$6,
      notes=$7,
      is_active=$8
    WHERE id=$9 AND patient_id=$10
  `, [
    b.name,
    b.treatment_type || '',
    b.frequency_value || 1,
    b.frequency_unit || 'weeks',
    b.start_date,
    b.last_treatment_date || null,
    b.notes || '',
    b.is_active !== false,
    req.params.tid,
    req.params.pid
  ]);

  res.json({ ok: true });
});

// DELETE treatment
router.delete('/:pid/:tid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  await pool.query(
    'DELETE FROM patient_treatments WHERE id=$1 AND patient_id=$2',
    [req.params.tid, req.params.pid]
  );

  res.json({ ok: true });
});

// GET reminders for a week
router.get('/:pid/reminders', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const { week_start, week_end } = req.query;

  const { rows: treatments } = await pool.query(
    'SELECT * FROM patient_treatments WHERE patient_id=$1 AND is_active=true',
    [req.params.pid]
  );

  const allReminders = [];

  for (const t of treatments) {
    const { rows: rules } = await pool.query(
      'SELECT * FROM treatment_reminder_rules WHERE treatment_id=$1',
      [t.id]
    );

    const ruleIds = rules.map(r => r.id);

    let dismissed = [];

    if (ruleIds.length > 0) {
      const { rows } = await pool.query(
        'SELECT rule_id, occurrence_date FROM treatment_reminder_occurrences WHERE rule_id = ANY($1::text[]) AND dismissed_at IS NOT NULL',
        [ruleIds]
      );
      dismissed = rows;
    }

    const reminders = computeReminders(
      parseTreatment(t),
      rules.map(parseRule),
      week_start,
      week_end,
      dismissed
    );

    allReminders.push(...reminders);
  }

  res.json(allReminders);
});

// GET cycles — actual treatment dates within a date range
// Returns { "YYYY-MM-DD": [{ name, treatment_type, notes }, ...], ... }
router.get('/:pid/cycles', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.json({});

  const rangeStartMs = new Date(week_start).getTime();
  const rangeEndMs   = new Date(week_end).getTime() + 86399999;

  const { rows: treatments } = await pool.query(
    'SELECT * FROM patient_treatments WHERE patient_id=$1 AND is_active=true',
    [req.params.pid]
  );

  const result = {};

  for (const t of treatments) {
    const startMs = new Date(t.start_date).getTime();
    const lastMs  = t.last_treatment_date
      ? new Date(t.last_treatment_date).getTime() + 86399999
      : Infinity;
    const fMs = freqToMs(t.frequency_value, t.frequency_unit);

    const nMin = Math.max(0, Math.floor((rangeStartMs - startMs) / fMs) - 1);
    const nMax = Math.ceil((rangeEndMs - startMs) / fMs) + 1;

    for (let n = nMin; n <= nMax; n++) {
      const cycleMs = startMs + n * fMs;
      if (cycleMs < startMs) continue;
      if (cycleMs > lastMs) continue;
      if (cycleMs < rangeStartMs || cycleMs > rangeEndMs) continue;

      const dateStr = toDateStr(cycleMs);
      if (!result[dateStr]) result[dateStr] = [];
      result[dateStr].push({
        name: t.name,
        treatment_type: t.treatment_type || '',
        notes: t.notes || '',
      });
    }
  }

  res.json(result);
});

// ADD RULE
router.post('/:pid/:tid/rules', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const b = req.body;
  const id = 'rr_' + crypto.randomUUID().slice(0, 8);

  await pool.query(`
    INSERT INTO treatment_reminder_rules
    (id, treatment_id, trigger_type, offset_value, offset_unit, message, repeat_each_cycle, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [
    id,
    req.params.tid,
    b.trigger_type || 'after',
    b.offset_value || 0,
    b.offset_unit || 'days',
    b.message || '',
    b.repeat_each_cycle !== false,
    true
  ]);

  res.json({ ok: true });
});

// UPDATE RULE
router.put('/:pid/:tid/rules/:rid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const b = req.body;

  await pool.query(`
    UPDATE treatment_reminder_rules SET
      trigger_type=$1,
      offset_value=$2,
      offset_unit=$3,
      message=$4,
      repeat_each_cycle=$5,
      is_active=$6
    WHERE id=$7 AND treatment_id=$8
  `, [
    b.trigger_type || 'after',
    b.offset_value || 0,
    b.offset_unit || 'days',
    b.message || '',
    b.repeat_each_cycle !== false,
    b.is_active !== false,
    req.params.rid,
    req.params.tid
  ]);

  res.json({ ok: true });
});

// DELETE RULE
router.delete('/:pid/:tid/rules/:rid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  await pool.query(
    'DELETE FROM treatment_reminder_rules WHERE id=$1 AND treatment_id=$2',
    [req.params.rid, req.params.tid]
  );

  res.json({ ok: true });
});

// DISMISS reminder
router.post('/:pid/dismiss', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const { rule_id, occurrence_date } = req.body;
  const id = 'occ_' + crypto.randomUUID().slice(0, 8);

  await pool.query(`
    INSERT INTO treatment_reminder_occurrences
    (id, rule_id, occurrence_date, dismissed_at)
    VALUES ($1,$2,$3,NOW())
    ON CONFLICT (rule_id, occurrence_date)
    DO UPDATE SET dismissed_at=NOW()
  `, [id, rule_id, occurrence_date]);

  res.json({ ok: true });
});

module.exports = router;
