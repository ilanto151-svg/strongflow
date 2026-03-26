// server/routes/treatments.js
const router = require('express').Router();
const { pool } = require('../pg');
const crypto = require('crypto');
const { authTherapist } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS GUARD
// ─────────────────────────────────────────────────────────────────────────────

async function canAccess(therapistId, patientId) {
  const { rows } = await pool.query(
    'SELECT id FROM patients WHERE id=$1 AND therapist_id=$2',
    [patientId, therapistId]
  );
  return rows.length > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW PARSERS
// ─────────────────────────────────────────────────────────────────────────────

function parseTreatment(r) {
  return { ...r, is_active: !!r.is_active };
}

function parseRule(r) {
  return { ...r, repeat_each_cycle: !!r.repeat_each_cycle, is_active: !!r.is_active };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE UTILITIES  (all work on YYYY-MM-DD strings)
//
// WHY strings?  'YYYY-MM-DD' lexicographic order == chronological order, so
// we can use plain < > === comparisons without any timezone conversion.
// WHY noon UTC?  Arithmetic on a Date set to T12:00:00Z avoids the DST
// "spring forward" edge case that can shift an end-of-day midnight into the
// next (or previous) UTC date.
// ─────────────────────────────────────────────────────────────────────────────

/** Return the YYYY-MM-DD string n calendar days after dateStr. */
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + Number(n));
  return d.toISOString().split('T')[0];
}

/**
 * Add (value, unit) to a YYYY-MM-DD string.
 * Uses exact calendar arithmetic: months advances the month counter (not 30 days).
 * Coerces value to Number defensively — pg may return INTEGER columns as strings
 * in certain driver/pooler configurations, which would cause the JS + operator to
 * concatenate instead of add (e.g. 22 + "2" → "222").
 */
function addPeriod(dateStr, value, unit) {
  const n = Number(value);
  const d = new Date(dateStr + 'T12:00:00Z');
  if      (unit === 'days')  d.setUTCDate(d.getUTCDate()   + n);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate()   + n * 7);
  else                       d.setUTCMonth(d.getUTCMonth() + n);   // months
  return d.toISOString().split('T')[0];
}

/**
 * Apply a reminder-rule offset to a cycle date → reminder date string.
 *  'on'     → same day
 *  'before' → subtract offset
 *  'after'  → add offset
 */
function applyOffset(cycleDateStr, triggerType, offsetValue, offsetUnit) {
  if (triggerType === 'on') return cycleDateStr;
  const sign = triggerType === 'before' ? -1 : 1;
  const ov   = Number(offsetValue);
  if (offsetUnit === 'weeks') return addDays(cycleDateStr, sign * ov * 7);
  return addDays(cycleDateStr, sign * ov); // days
}

/** YYYY-MM-DD of the Sunday that begins the calendar week containing dateStr. */
function sundayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().split('T')[0];
}

/** YYYY-MM-DD of the Saturday that ends the calendar week containing dateStr. */
function saturdayOfWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (6 - d.getUTCDay()));
  return d.toISOString().split('T')[0];
}

/** Human-readable timing label shown in tooltips and banners. */
function timingLabel(triggerType, offsetValue, offsetUnit) {
  if (triggerType === 'on')          return 'on treatment day';
  if (triggerType === 'during_week') return 'during treatment week';
  const dir  = triggerType === 'before' ? 'before' : 'after';
  const unit = Number(offsetValue) === 1
    ? String(offsetUnit).replace(/s$/, '')  // "day" not "days"
    : offsetUnit;
  return `${offsetValue} ${unit} ${dir}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CYCLE GENERATOR
//
// Returns every treatment occurrence whose date is within [rangeStart, rangeEnd]
// (both YYYY-MM-DD strings, inclusive).
//
// For 'days' and 'weeks' frequencies the algorithm uses DIRECT INDEX COMPUTATION:
//   cycleDate = addDays(startDate, cycleIndex × periodDays)
//
// This is immune to the PgBouncer / connection-pooler type-stripping bug where
// pg returns INTEGER columns as JavaScript strings.  When that happens, the old
// iterative approach did   d.setUTCDate(22 + "2")  →  string concat → "222"  →
// setUTCDate(222) → October → loop exits after 1 cycle.
// With direct computation the multiplied index is always a plain JS integer so
// the arithmetic is always numeric addition, never string concatenation.
//
// For 'months' frequencies no fixed day-count exists, so we still iterate using
// addPeriod (which already has Number() coercion).
//
// cycleIndex (0 = startDate itself) is preserved so reminder rules can check
// repeat_each_cycle correctly.
// ─────────────────────────────────────────────────────────────────────────────

function getCyclesInRange(
  startDate, freqValue, freqUnit, lastDate, rangeStart, rangeEnd,
  activeBlockCount = 0, breakCount = 0, breakUnit = 'weeks'
) {
  if (!startDate) return [];

  // Always coerce to number — guards against pg/PgBouncer returning INTEGER as string.
  const fv = Number(freqValue);
  if (!fv || fv <= 0) return [];

  // Only treat last_treatment_date as a real end-date when it is strictly after
  // start_date.  A value equal to start_date (or empty/null) means "no end".
  const endDate = (lastDate && String(lastDate) > String(startDate))
    ? String(lastDate)
    : null;

  const aBlock   = Number(activeBlockCount) || 0;
  const bCount   = Number(breakCount)       || 0;
  const hasBreak = aBlock > 0 && bCount > 0;

  const results = [];

  // ── Days / Weeks ───────────────────────────────────────────────────────────
  if (freqUnit === 'days' || freqUnit === 'weeks') {
    const periodDays = freqUnit === 'weeks' ? fv * 7 : fv;

    if (hasBreak && (breakUnit === 'days' || breakUnit === 'weeks')) {
      // ── Break pattern, fixed-day super-period → direct index computation ──
      const breakDays       = breakUnit === 'weeks' ? bCount * 7 : bCount;
      const superPeriodDays = aBlock * periodDays + breakDays;

      const gapMs   = new Date(rangeStart + 'T12:00:00Z').getTime()
                    - new Date(startDate  + 'T12:00:00Z').getTime();
      const gapDays = Math.round(gapMs / 86_400_000);
      // Back up 1 super-period worth of occurrences so we never miss the first
      const firstN  = gapDays > 0
        ? Math.max(0, Math.floor(gapDays / superPeriodDays) - 1) * aBlock
        : 0;

      for (let n = firstN; n < firstN + 10_000; n++) {
        const sp           = Math.floor(n / aBlock);
        const pos          = n % aBlock;
        const daysFromStart = sp * superPeriodDays + pos * periodDays;
        const cycleDate    = addDays(startDate, daysFromStart);
        if (cycleDate > rangeEnd) break;
        if (endDate && cycleDate > endDate) break;
        if (cycleDate >= rangeStart) results.push({ date: cycleDate, cycleIndex: n });
      }
      return results;
    }

    if (hasBreak && breakUnit === 'months') {
      // ── Break pattern, months break — iterate super-periods ───────────────
      let blockStart = startDate;
      let occIdx     = 0;
      let safety     = 0;
      while (blockStart <= rangeEnd && safety < 10_000) {
        safety++;
        for (let pos = 0; pos < aBlock; pos++) {
          const cycleDate = addDays(blockStart, pos * periodDays);
          if (endDate && cycleDate > endDate) return results;
          if (cycleDate > rangeEnd) return results;
          if (cycleDate >= rangeStart) results.push({ date: cycleDate, cycleIndex: occIdx });
          occIdx++;
        }
        const blockEnd = addDays(blockStart, aBlock * periodDays);
        const next     = addPeriod(blockEnd, bCount, 'months');
        if (next <= blockEnd) break; // infinite-loop guard
        blockStart = next;
      }
      return results;
    }

    // ── No break — original direct index computation ───────────────────────
    const gapMs    = new Date(rangeStart + 'T12:00:00Z').getTime()
                   - new Date(startDate  + 'T12:00:00Z').getTime();
    const gapDays  = Math.round(gapMs / 86_400_000);
    const firstIdx = Math.max(0, Math.floor(gapDays / periodDays) - 1);

    for (let idx = firstIdx; idx < firstIdx + 10_000; idx++) {
      const cycleDate = addDays(startDate, idx * periodDays);
      if (cycleDate > rangeEnd) break;
      if (endDate && cycleDate > endDate) break;
      if (cycleDate >= rangeStart) results.push({ date: cycleDate, cycleIndex: idx });
    }
    return results;
  }

  // ── Months frequency ───────────────────────────────────────────────────────
  if (hasBreak) {
    // ── Break pattern, iterate super-periods ──────────────────────────────
    // Skip ahead to approximately the right super-period
    const gapMs = new Date(rangeStart + 'T12:00:00Z').getTime()
                - new Date(startDate  + 'T12:00:00Z').getTime();
    const approxBreakMonths = breakUnit === 'months' ? bCount
      : breakUnit === 'weeks' ? bCount / 4.33 : bCount / 30;
    const spMonths = aBlock * fv + approxBreakMonths;
    const skipSP   = gapMs > 0
      ? Math.max(0, Math.floor(gapMs / (spMonths * 30 * 86_400_000)) - 2) : 0;

    let blockStart = startDate;
    let occIdx     = 0;
    for (let i = 0; i < skipSP; i++) {
      const blockEnd = addPeriod(blockStart, fv * aBlock, 'months');
      occIdx    += aBlock;
      blockStart = addPeriod(blockEnd, bCount, breakUnit);
    }

    let safety = 0;
    while (blockStart <= rangeEnd && safety < 10_000) {
      safety++;
      for (let pos = 0; pos < aBlock; pos++) {
        const cycleDate = pos === 0 ? blockStart : addPeriod(blockStart, fv * pos, 'months');
        if (endDate && cycleDate > endDate) return results;
        if (cycleDate > rangeEnd) return results;
        if (cycleDate >= rangeStart) results.push({ date: cycleDate, cycleIndex: occIdx });
        occIdx++;
      }
      const blockEnd = addPeriod(blockStart, fv * aBlock, 'months');
      const next     = addPeriod(blockEnd, bCount, breakUnit);
      if (next <= blockEnd) break;
      blockStart = next;
    }
    return results;
  }

  // ── Months, no break: iterative ────────────────────────────────────────────
  const gapMs    = new Date(rangeStart + 'T12:00:00Z').getTime()
                 - new Date(startDate  + 'T12:00:00Z').getTime();
  const skipCount = gapMs > 0
    ? Math.max(0, Math.floor(gapMs / (fv * 30 * 86_400_000)) - 2)
    : 0;

  let current    = startDate;
  let cycleIndex = 0;
  for (let i = 0; i < skipCount; i++) {
    const next = addPeriod(current, fv, 'months');
    if (next <= current) return [];
    current = next;
    cycleIndex++;
  }

  let safety = 0;
  while (current <= rangeEnd && safety < 10_000) {
    safety++;
    if (endDate && current > endDate) break;
    if (current >= rangeStart) results.push({ date: current, cycleIndex });
    const next = addPeriod(current, fv, 'months');
    if (next <= current) break;
    current = next;
    cycleIndex++;
  }

  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// REMINDER BANNER COMPUTATION  (used by GET /:pid/reminders)
//
// Returns an array of objects that drive the dismissable top-of-week banners.
// Now correctly includes every field the UI needs (message, trigger_type,
// offset_value, offset_unit) and respects repeat_each_cycle.
// ─────────────────────────────────────────────────────────────────────────────

function computeReminders(treatment, rules, weekStart, weekEnd, dismissed) {
  if (!treatment.start_date) return [];

  const dismissedSet = new Set(dismissed.map(d => `${d.rule_id}|${d.occurrence_date}`));
  const reminders    = [];

  // Find all cycles that could produce reminders intersecting [weekStart, weekEnd].
  // Expand search window by 60 days so offset reminders are never missed.
  const searchStart = addDays(weekStart, -60);
  const searchEnd   = addDays(weekEnd,   +60);

  const cycles = getCyclesInRange(
    treatment.start_date,
    treatment.frequency_value,
    treatment.frequency_unit,
    treatment.last_treatment_date || null,
    searchStart,
    searchEnd,
    treatment.active_block_count || 0,
    treatment.break_count        || 0,
    treatment.break_unit         || 'weeks'
  );

  for (const { date: cycleDate, cycleIndex } of cycles) {
    for (const rule of rules) {
      if (!rule.is_active) continue;
      if (!rule.repeat_each_cycle && cycleIndex > 0) continue;

      let occurrenceDate;

      if (rule.trigger_type === 'during_week') {
        // Fires for the entire calendar week containing cycleDate.
        const cycleSun = sundayOfWeek(cycleDate);
        const cycleSat = saturdayOfWeek(cycleDate);
        // Does the cycle's week overlap with [weekStart, weekEnd]?
        if (cycleSun > weekEnd || cycleSat < weekStart) continue;
        occurrenceDate = cycleDate; // key is the treatment date itself
      } else {
        occurrenceDate = applyOffset(cycleDate, rule.trigger_type, rule.offset_value, rule.offset_unit);
        if (occurrenceDate < weekStart || occurrenceDate > weekEnd) continue;
      }

      const key = `${rule.id}|${occurrenceDate}`;
      if (dismissedSet.has(key)) continue;

      reminders.push({
        rule_id:         rule.id,
        treatment_id:    treatment.id,
        treatment_name:  treatment.name     || '',
        occurrence_date: occurrenceDate,
        cycle_date:      cycleDate,
        message:         rule.message       || '',
        trigger_type:    rule.trigger_type,
        offset_value:    rule.offset_value,
        offset_unit:     rule.offset_unit,
      });
    }
  }

  return reminders;
}

// ─────────────────────────────────────────────────────────────────────────────
// CALENDAR MARKER COMPUTATION  (used by GET /:pid/cycles → reminderDates)
//
// Returns { "YYYY-MM-DD": [reminderEntry…] } for dot markers on the calendar.
// No dismissal check — dots are always visible.
// Skips during_week (no single date).
// ─────────────────────────────────────────────────────────────────────────────

function computeReminderDates(treatment, rules, rangeStart, rangeEnd) {
  if (!treatment.start_date) return {};

  // Expand cycle search so offset reminders from just-outside cycles are caught.
  const searchStart = addDays(rangeStart, -60);
  const searchEnd   = addDays(rangeEnd,   +60);

  const cycles = getCyclesInRange(
    treatment.start_date,
    treatment.frequency_value,
    treatment.frequency_unit,
    treatment.last_treatment_date || null,
    searchStart,
    searchEnd,
    treatment.active_block_count || 0,
    treatment.break_count        || 0,
    treatment.break_unit         || 'weeks'
  );

  const result = {};

  for (const { date: cycleDate, cycleIndex } of cycles) {
    for (const rule of rules) {
      if (!rule.is_active)                             continue;
      if (rule.trigger_type === 'during_week')         continue; // no single date
      if (!rule.repeat_each_cycle && cycleIndex > 0)  continue;

      const reminderDate = applyOffset(cycleDate, rule.trigger_type, rule.offset_value, rule.offset_unit);
      if (reminderDate < rangeStart || reminderDate > rangeEnd) continue;

      if (!result[reminderDate]) result[reminderDate] = [];
      result[reminderDate].push({
        message:        rule.message       || '',
        treatment_name: treatment.name     || '',
        timing:         timingLabel(rule.trigger_type, rule.offset_value, rule.offset_unit),
        trigger_type:   rule.trigger_type,
        offset_value:   rule.offset_value,
        offset_unit:    rule.offset_unit,
        cycle_date:     cycleDate,
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// GET all treatments (with nested rules) for a patient
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
    result.push({ ...parseTreatment(t), rules: rules.map(parseRule) });
  }

  res.json(result);
});

// CREATE treatment
router.post('/:pid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const b  = req.body;
  const id = 'tr_' + crypto.randomUUID().slice(0, 8);

  await pool.query(`
    INSERT INTO patient_treatments
    (id, patient_id, name, treatment_type, frequency_value, frequency_unit,
     start_date, last_treatment_date, notes, is_active,
     active_block_count, break_count, break_unit, duration_days)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
  `, [
    id, req.params.pid, b.name,
    b.treatment_type      || '',
    b.frequency_value     || 1,
    b.frequency_unit      || 'weeks',
    b.start_date,
    b.last_treatment_date || null,
    b.notes               || '',
    b.is_active !== false,
    Number(b.active_block_count) || 0,
    Number(b.break_count)        || 1,
    b.break_unit                 || 'weeks',
    Math.max(1, Number(b.duration_days) || 1),
  ]);

  const { rows } = await pool.query('SELECT * FROM patient_treatments WHERE id=$1', [id]);
  res.json(parseTreatment(rows[0]));
});

// UPDATE treatment
router.put('/:pid/:tid', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const b = req.body;
  await pool.query(`
    UPDATE patient_treatments SET
      name=$1, treatment_type=$2, frequency_value=$3, frequency_unit=$4,
      start_date=$5, last_treatment_date=$6, notes=$7, is_active=$8,
      active_block_count=$9, break_count=$10, break_unit=$11,
      duration_days=$12
    WHERE id=$13 AND patient_id=$14
  `, [
    b.name,
    b.treatment_type      || '',
    b.frequency_value     || 1,
    b.frequency_unit      || 'weeks',
    b.start_date,
    b.last_treatment_date || null,
    b.notes               || '',
    b.is_active !== false,
    Number(b.active_block_count) || 0,
    Number(b.break_count)        || 1,
    b.break_unit                 || 'weeks',
    Math.max(1, Number(b.duration_days) || 1),
    req.params.tid, req.params.pid,
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

// GET reminder banners for a week
// Returns a flat array for the dismissable top-of-week alert banners.
router.get('/:pid/reminders', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.json([]);

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
        `SELECT rule_id, occurrence_date FROM treatment_reminder_occurrences
         WHERE rule_id = ANY($1::text[]) AND dismissed_at IS NOT NULL`,
        [ruleIds]
      );
      dismissed = rows;
    }

    allReminders.push(
      ...computeReminders(parseTreatment(t), rules.map(parseRule), week_start, week_end, dismissed)
    );
  }

  res.json(allReminders);
});

// GET calendar cycle data for a date range.
//
// Returns:
//   treatmentDates: { "YYYY-MM-DD": [{ name, treatment_type, notes }] }
//   reminderDates:  { "YYYY-MM-DD": [{ message, treatment_name, timing,
//                                       trigger_type, offset_value,
//                                       offset_unit, cycle_date }] }
//
// A date can appear in BOTH (e.g. an on-day reminder rule).
// Both week-view and month-view calls use this endpoint.

router.get('/:pid/cycles', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const { week_start, week_end } = req.query;
  if (!week_start || !week_end)
    return res.json({ treatmentDates: {}, reminderDates: {} });

  const { rows: treatments } = await pool.query(
    'SELECT * FROM patient_treatments WHERE patient_id=$1 AND is_active=true',
    [req.params.pid]
  );

  const treatmentDates = {};
  const reminderDates  = {};

  for (const t of treatments) {
    const { rows: rules } = await pool.query(
      'SELECT * FROM treatment_reminder_rules WHERE treatment_id=$1 AND is_active=true',
      [t.id]
    );
    const parsedRules = rules.map(parseRule);

    // ── Treatment cycle dates (expanded by duration_days) ─────────────────
    //
    // Each cycle occurrence starts on its recurrence date and spans
    // duration_days consecutive days.  Reminders stay anchored to the start
    // date (computed separately via computeReminderDates above).
    const dur = Math.max(1, Number(t.duration_days) || 1);

    const cycles = getCyclesInRange(
      t.start_date,
      t.frequency_value,
      t.frequency_unit,
      t.last_treatment_date || null,
      // Expand the search window backwards by (dur-1) days so a cycle that
      // starts just before week_start still fills in its continuation days.
      addDays(week_start, -(dur - 1)),
      week_end,
      t.active_block_count || 0,
      t.break_count        || 0,
      t.break_unit         || 'weeks'
    );

    for (const { date: startDate } of cycles) {
      for (let d = 0; d < dur; d++) {
        const spanDate = d === 0 ? startDate : addDays(startDate, d);
        // Only populate dates actually inside the requested range.
        if (spanDate < week_start || spanDate > week_end) continue;
        if (!treatmentDates[spanDate]) treatmentDates[spanDate] = [];
        treatmentDates[spanDate].push({
          name:           t.name,
          treatment_type: t.treatment_type || '',
          notes:          t.notes          || '',
          duration_days:  dur,
          day_of_span:    d + 1,
        });
      }
    }

    // ── Reminder dates ─────────────────────────────────────────────────────
    const rDates = computeReminderDates(parseTreatment(t), parsedRules, week_start, week_end);
    for (const [date, items] of Object.entries(rDates)) {
      if (!reminderDates[date]) reminderDates[date] = [];
      reminderDates[date].push(...items);
    }
  }

  res.json({ treatmentDates, reminderDates });
});

// ADD RULE
router.post('/:pid/:tid/rules', authTherapist, async (req, res) => {
  if (!(await canAccess(req.user.id, req.params.pid)))
    return res.status(403).json({ error: 'Forbidden' });

  const b  = req.body;
  const id = 'rr_' + crypto.randomUUID().slice(0, 8);

  await pool.query(`
    INSERT INTO treatment_reminder_rules
    (id, treatment_id, trigger_type, offset_value, offset_unit,
     message, repeat_each_cycle, is_active)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
  `, [
    id, req.params.tid,
    b.trigger_type      || 'after',
    b.offset_value      || 0,
    b.offset_unit       || 'days',
    b.message           || '',
    b.repeat_each_cycle !== false,
    true,
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
      trigger_type=$1, offset_value=$2, offset_unit=$3,
      message=$4, repeat_each_cycle=$5, is_active=$6
    WHERE id=$7 AND treatment_id=$8
  `, [
    b.trigger_type      || 'after',
    b.offset_value      || 0,
    b.offset_unit       || 'days',
    b.message           || '',
    b.repeat_each_cycle !== false,
    b.is_active !== false,
    req.params.rid, req.params.tid,
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

// DISMISS reminder occurrence
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
