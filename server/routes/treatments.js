// server/routes/treatments.js
const router = require('express').Router();
const db     = require('../db');
const crypto = require('crypto');
const { authTherapist } = require('../middleware/auth');

function canAccess(therapistId, patientId) {
  return db.prepare('SELECT id FROM patients WHERE id=? AND therapist_id=?').get(patientId, therapistId);
}

function parseTreatment(r) {
  return {
    id:                  r.id,
    patient_id:          r.patient_id,
    name:                r.name,
    treatment_type:      r.treatment_type || '',
    frequency_value:     r.frequency_value,
    frequency_unit:      r.frequency_unit,
    start_date:          r.start_date,
    last_treatment_date: r.last_treatment_date || '',
    notes:               r.notes || '',
    is_active:           r.is_active === 1,
    created_at:          r.created_at,
  };
}

function parseRule(r) {
  return {
    id:               r.id,
    treatment_id:     r.treatment_id,
    trigger_type:     r.trigger_type,
    offset_value:     r.offset_value,
    offset_unit:      r.offset_unit,
    message:          r.message,
    repeat_each_cycle: r.repeat_each_cycle === 1,
    is_active:        r.is_active === 1,
    created_at:       r.created_at,
  };
}

// Convert frequency to milliseconds
function freqToMs(value, unit) {
  if (unit === 'days')   return value * 86400000;
  if (unit === 'weeks')  return value * 7 * 86400000;
  return value * 30 * 86400000; // months (approximate)
}

// Convert offset (days or weeks) to milliseconds
function offsetToMs(value, unit) {
  return unit === 'weeks' ? value * 7 * 86400000 : value * 86400000;
}

function toDateStr(ms) {
  return new Date(ms).toISOString().split('T')[0];
}

// Compute which reminder occurrences fall in [weekStart, weekEnd] for one treatment
function computeReminders(treatment, rules, weekStart, weekEnd, dismissed) {
  const dismissedSet = new Set(dismissed.map(d => `${d.rule_id}|${d.occurrence_date}`));
  const startMs    = new Date(treatment.start_date).getTime();
  const weekStartMs = new Date(weekStart).getTime();
  const weekEndMs   = new Date(weekEnd).getTime() + 86399999; // end of last day
  const fMs = freqToMs(treatment.frequency_value, treatment.frequency_unit);

  const reminders = [];

  for (const rule of rules) {
    if (!rule.is_active) continue;

    const isDuringWeek = rule.trigger_type === 'during_week';
    const offMs = isDuringWeek
      ? 0
      : rule.trigger_type === 'before'
        ? -offsetToMs(rule.offset_value, rule.offset_unit)
        :  offsetToMs(rule.offset_value, rule.offset_unit); // on / after

    // Find the cycle index range where reminder_date = cycleMs + offMs falls in [weekStartMs, weekEndMs]
    // => cycleMs in [weekStartMs - offMs, weekEndMs - offMs]
    const nMin = Math.floor((weekStartMs - offMs - startMs) / fMs);
    const nMax = Math.ceil ((weekEndMs   - offMs - startMs) / fMs);

    for (let n = Math.max(0, nMin - 1); n <= nMax + 1; n++) {
      const cycleMs = startMs + n * fMs;
      if (cycleMs < startMs) continue;

      const cycleDate = toDateStr(cycleMs);

      if (isDuringWeek) {
        // Reminder is active throughout the entire week that contains the cycle date
        const dow      = new Date(cycleMs).getDay();
        const sunMs    = cycleMs - dow * 86400000;
        const satMs    = sunMs + 6 * 86400000 + 86399999;
        if (sunMs > weekEndMs || satMs < weekStartMs) continue;

        const key = `${rule.id}|${cycleDate}`;
        if (!dismissedSet.has(key)) {
          reminders.push(makeReminder(rule, treatment, cycleDate, cycleDate));
        }
      } else {
        const reminderMs = cycleMs + offMs;
        if (reminderMs < weekStartMs || reminderMs > weekEndMs) continue;

        const reminderDate = toDateStr(reminderMs);
        const key = `${rule.id}|${reminderDate}`;
        if (!dismissedSet.has(key)) {
          reminders.push(makeReminder(rule, treatment, reminderDate, cycleDate));
        }
      }
    }
  }

  return reminders;
}

function makeReminder(rule, treatment, occurrenceDate, cycleDate) {
  return {
    rule_id:        rule.id,
    treatment_id:   treatment.id,
    treatment_name: treatment.name,
    trigger_type:   rule.trigger_type,
    offset_value:   rule.offset_value,
    offset_unit:    rule.offset_unit,
    message:        rule.message,
    occurrence_date: occurrenceDate,
    cycle_date:     cycleDate,
  };
}

// ── CRUD: Treatments ──────────────────────────────────────────────────────────

// GET  /treatments/:pid — all treatments + their rules
router.get('/:pid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const rows = db.prepare('SELECT * FROM patient_treatments WHERE patient_id=? ORDER BY created_at').all(req.params.pid);
  const result = rows.map(t => {
    const rules = db.prepare('SELECT * FROM treatment_reminder_rules WHERE treatment_id=? ORDER BY created_at').all(t.id);
    return { ...parseTreatment(t), rules: rules.map(parseRule) };
  });
  res.json(result);
});

// POST /treatments/:pid — add treatment
router.post('/:pid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const b  = req.body;
  const id = 'tr_' + crypto.randomUUID().slice(0, 8);
  db.prepare(`INSERT INTO patient_treatments
    (id, patient_id, name, treatment_type, frequency_value, frequency_unit, start_date, last_treatment_date, notes, is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.params.pid, b.name, b.treatment_type || '', b.frequency_value || 1, b.frequency_unit || 'weeks',
         b.start_date, b.last_treatment_date || null, b.notes || '', b.is_active !== false ? 1 : 0);
  res.json(parseTreatment(db.prepare('SELECT * FROM patient_treatments WHERE id=?').get(id)));
});

// PUT /treatments/:pid/:tid — update treatment
router.put('/:pid/:tid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  db.prepare(`UPDATE patient_treatments SET
    name=?, treatment_type=?, frequency_value=?, frequency_unit=?,
    start_date=?, last_treatment_date=?, notes=?, is_active=?
    WHERE id=? AND patient_id=?`)
    .run(b.name, b.treatment_type || '', b.frequency_value || 1, b.frequency_unit || 'weeks',
         b.start_date, b.last_treatment_date || null, b.notes || '', b.is_active !== false ? 1 : 0,
         req.params.tid, req.params.pid);
  res.json({ ok: true });
});

// DELETE /treatments/:pid/:tid
router.delete('/:pid/:tid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM patient_treatments WHERE id=? AND patient_id=?').run(req.params.tid, req.params.pid);
  res.json({ ok: true });
});

// ── CRUD: Reminder Rules ──────────────────────────────────────────────────────

// POST /treatments/:pid/:tid/rules
router.post('/:pid/:tid/rules', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const b  = req.body;
  const id = 'rr_' + crypto.randomUUID().slice(0, 8);
  db.prepare(`INSERT INTO treatment_reminder_rules
    (id, treatment_id, trigger_type, offset_value, offset_unit, message, repeat_each_cycle, is_active)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, req.params.tid, b.trigger_type || 'after', b.offset_value || 0, b.offset_unit || 'days',
         b.message || '', b.repeat_each_cycle !== false ? 1 : 0, 1);
  res.json(parseRule(db.prepare('SELECT * FROM treatment_reminder_rules WHERE id=?').get(id)));
});

// PUT /treatments/:pid/:tid/rules/:rid
router.put('/:pid/:tid/rules/:rid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  db.prepare(`UPDATE treatment_reminder_rules SET
    trigger_type=?, offset_value=?, offset_unit=?, message=?, repeat_each_cycle=?, is_active=?
    WHERE id=? AND treatment_id=?`)
    .run(b.trigger_type, b.offset_value || 0, b.offset_unit || 'days', b.message || '',
         b.repeat_each_cycle !== false ? 1 : 0, b.is_active !== false ? 1 : 0,
         req.params.rid, req.params.tid);
  res.json({ ok: true });
});

// DELETE /treatments/:pid/:tid/rules/:rid
router.delete('/:pid/:tid/rules/:rid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM treatment_reminder_rules WHERE id=? AND treatment_id=?').run(req.params.rid, req.params.tid);
  res.json({ ok: true });
});

// ── Reminders ─────────────────────────────────────────────────────────────────

// GET /treatments/:pid/cycles?week_start=YYYY-MM-DD&week_end=YYYY-MM-DD
// Returns { 'YYYY-MM-DD': [{ name, treatment_type, notes }] } for each cycle date in range
router.get('/:pid/cycles', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.status(400).json({ error: 'week_start and week_end required' });

  const treatments = db.prepare('SELECT * FROM patient_treatments WHERE patient_id=? AND is_active=1').all(req.params.pid);
  const byDate = {};

  for (const t of treatments) {
    const startMs    = new Date(t.start_date).getTime();
    const weekStartMs = new Date(week_start).getTime();
    const weekEndMs   = new Date(week_end).getTime() + 86399999;
    const fMs = freqToMs(t.frequency_value, t.frequency_unit);

    const nMin = Math.floor((weekStartMs - startMs) / fMs);
    const nMax = Math.ceil((weekEndMs   - startMs) / fMs);

    for (let n = Math.max(0, nMin - 1); n <= nMax + 1; n++) {
      const cycleMs = startMs + n * fMs;
      if (cycleMs < startMs || cycleMs < weekStartMs || cycleMs > weekEndMs) continue;
      const dateStr = toDateStr(cycleMs);
      if (!byDate[dateStr]) byDate[dateStr] = [];
      byDate[dateStr].push({ name: t.name, treatment_type: t.treatment_type || '', notes: t.notes || '' });
    }
  }

  res.json(byDate);
});

// GET /treatments/:pid/reminders?week_start=YYYY-MM-DD&week_end=YYYY-MM-DD
router.get('/:pid/reminders', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.status(400).json({ error: 'week_start and week_end required' });

  const treatments = db.prepare('SELECT * FROM patient_treatments WHERE patient_id=? AND is_active=1').all(req.params.pid);
  const allReminders = [];

  for (const t of treatments) {
    const rules = db.prepare('SELECT * FROM treatment_reminder_rules WHERE treatment_id=?').all(t.id);
    if (!rules.length) continue;

    const ruleIds = rules.map(r => r.id);
    const placeholders = ruleIds.map(() => '?').join(',');
    const dismissed = ruleIds.length
      ? db.prepare(`SELECT rule_id, occurrence_date FROM treatment_reminder_occurrences WHERE rule_id IN (${placeholders}) AND dismissed_at IS NOT NULL`).all(...ruleIds)
      : [];

    const reminders = computeReminders(parseTreatment(t), rules.map(parseRule), week_start, week_end, dismissed);
    allReminders.push(...reminders);
  }

  res.json(allReminders);
});

// POST /treatments/:pid/dismiss — dismiss a single occurrence
router.post('/:pid/dismiss', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const { rule_id, occurrence_date } = req.body;
  const id = 'occ_' + crypto.randomUUID().slice(0, 8);
  db.prepare(`INSERT OR IGNORE INTO treatment_reminder_occurrences (id, rule_id, occurrence_date, dismissed_at) VALUES (?,?,?,datetime('now'))`)
    .run(id, rule_id, occurrence_date);
  db.prepare(`UPDATE treatment_reminder_occurrences SET dismissed_at=datetime('now') WHERE rule_id=? AND occurrence_date=?`)
    .run(rule_id, occurrence_date);
  res.json({ ok: true });
});

module.exports = router;
