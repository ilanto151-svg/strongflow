// server/routes/events.js
const router  = require('express').Router();
const db      = require('../db');
const crypto  = require('crypto');
const { authTherapist } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

function canAccess(therapistId, patientId) {
  return db.prepare('SELECT id FROM patients WHERE id=? AND therapist_id=?').get(patientId, therapistId);
}

function genId(prefix) {
  return prefix + crypto.randomUUID().slice(0, 8);
}

// ── Serialisation ─────────────────────────────────────────────────────────────

function parseEvent(r) {
  return {
    id:                            r.id,
    patient_id:                    r.patient_id,
    title:                         r.title,
    event_type:                    r.event_type || '',
    event_mode:                    r.event_mode,
    exact_date:                    r.exact_date || '',
    event_time:                    r.event_time || '',
    recurrence_frequency_value:    r.recurrence_frequency_value,
    recurrence_frequency_unit:     r.recurrence_frequency_unit,
    start_date:                    r.start_date || '',
    end_date:                      r.end_date || '',
    notes:                         r.notes || '',
    category:                      r.category || 'other',
    priority:                      r.priority || 'info',
    show_in_weekly_reminders:      r.show_in_weekly_reminders === 1,
    mark_exact_day_in_calendar:    r.mark_exact_day_in_calendar === 1,
    pre_reminder_enabled:          r.pre_reminder_enabled === 1,
    pre_reminder_offset_value:     r.pre_reminder_offset_value,
    pre_reminder_offset_unit:      r.pre_reminder_offset_unit,
    same_day_reminder_enabled:     r.same_day_reminder_enabled === 1,
    post_reminder_enabled:         r.post_reminder_enabled === 1,
    post_reminder_offset_value:    r.post_reminder_offset_value,
    post_reminder_offset_unit:     r.post_reminder_offset_unit,
    send_email:                    r.send_email === 1,
    send_whatsapp:                 r.send_whatsapp === 1,
    notification_time:             r.notification_time || '08:00',
    is_active:                     r.is_active === 1,
    created_at:                    r.created_at,
  };
}

// ── Date helpers (string-based, timezone-safe) ────────────────────────────────
// Use UTC noon (T12:00:00Z) to avoid DST/timezone shifts when parsing YYYY-MM-DD strings.

function parseDate(dateStr) {
  return new Date(dateStr + 'T12:00:00Z');
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return toDateStr(d);
}

// Uses real calendar months (Jan 31 + 1 month = Feb 28/29, not 30 days flat)
function addMonths(dateStr, n) {
  const d = parseDate(dateStr);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toDateStr(d);
}

function addInterval(dateStr, value, unit) {
  if (unit === 'days')  return addDays(dateStr, value);
  if (unit === 'weeks') return addDays(dateStr, value * 7);
  return addMonths(dateStr, value);
}

// Convert offset (value + unit) to number of days
function offsetDays(value, unit) {
  return unit === 'weeks' ? value * 7 : value;
}

// Returns all occurrence dates (YYYY-MM-DD strings) within [rangeStart, rangeEnd] inclusive.
// String comparison is used throughout — no ms arithmetic.
function getOccurrenceDates(event, rangeStart, rangeEnd) {
  if (!event.is_active) return [];

  if (event.event_mode === 'one_time') {
    if (!event.exact_date) return [];
    return (event.exact_date >= rangeStart && event.exact_date <= rangeEnd) ? [event.exact_date] : [];
  }

  // recurring
  if (!event.start_date) return [];
  const endStr = event.end_date || '9999-12-31';
  const dates  = [];

  let cur     = event.start_date;
  let safety  = 0;
  while (cur <= rangeEnd && safety++ < 50000) {
    if (cur > endStr) break;
    if (cur >= rangeStart) dates.push(cur);
    cur = addInterval(cur, event.recurrence_frequency_value, event.recurrence_frequency_unit);
  }
  return dates;
}

// Is a specific date a valid occurrence for this event?
function isOccurrenceDate(event, dateStr) {
  return getOccurrenceDates(event, dateStr, dateStr).length > 0;
}

// ── In-app items: ONLY event_day occurrences within the week ──────────────────
// Pre/same/post reminders are for external notifications only (email/WhatsApp).
function getEventDayItems(event, weekStart, weekEnd, dismissedSet) {
  const occurrences = getOccurrenceDates(event, weekStart, weekEnd);
  return occurrences
    .filter(occ => !dismissedSet.has(`${event.id}|${occ}|event_day`))
    .map(occ => ({
      occurrence_date: occ,
      reminder_date:   occ,
      reminder_kind:   'event_day',
      offset_value:    0,
      offset_unit:     'days',
    }));
}

// ── CRUD: Events ──────────────────────────────────────────────────────────────

// GET /events/:pid
router.get('/:pid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const rows = db.prepare('SELECT * FROM patient_events WHERE patient_id=? ORDER BY created_at').all(req.params.pid);
  res.json(rows.map(parseEvent));
});

// POST /events/:pid
router.post('/:pid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const b  = req.body;
  const id = genId('ev_');
  db.prepare(`INSERT INTO patient_events
    (id, patient_id, title, event_type, event_mode, exact_date, event_time,
     recurrence_frequency_value, recurrence_frequency_unit, start_date, end_date,
     notes, category, priority, show_in_weekly_reminders, mark_exact_day_in_calendar,
     pre_reminder_enabled, pre_reminder_offset_value, pre_reminder_offset_unit,
     same_day_reminder_enabled,
     post_reminder_enabled, post_reminder_offset_value, post_reminder_offset_unit,
     send_email, send_whatsapp, notification_time, is_active)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, req.params.pid, b.title, b.event_type || '', b.event_mode || 'one_time',
         b.exact_date || null, b.event_time || '',
         b.recurrence_frequency_value || 1, b.recurrence_frequency_unit || 'weeks',
         b.start_date || null, b.end_date || null,
         b.notes || '', b.category || 'other', b.priority || 'info',
         b.show_in_weekly_reminders !== false ? 1 : 0,
         b.mark_exact_day_in_calendar !== false ? 1 : 0,
         b.pre_reminder_enabled ? 1 : 0, b.pre_reminder_offset_value || 1, b.pre_reminder_offset_unit || 'days',
         b.same_day_reminder_enabled ? 1 : 0,
         b.post_reminder_enabled ? 1 : 0, b.post_reminder_offset_value || 1, b.post_reminder_offset_unit || 'weeks',
         b.send_email ? 1 : 0, b.send_whatsapp ? 1 : 0,
         b.notification_time || '08:00',
         b.is_active !== false ? 1 : 0);
  res.json(parseEvent(db.prepare('SELECT * FROM patient_events WHERE id=?').get(id)));
});

// PUT /events/:pid/:eid
router.put('/:pid/:eid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const b = req.body;
  db.prepare(`UPDATE patient_events SET
    title=?, event_type=?, event_mode=?, exact_date=?, event_time=?,
    recurrence_frequency_value=?, recurrence_frequency_unit=?, start_date=?, end_date=?,
    notes=?, category=?, priority=?, show_in_weekly_reminders=?, mark_exact_day_in_calendar=?,
    pre_reminder_enabled=?, pre_reminder_offset_value=?, pre_reminder_offset_unit=?,
    same_day_reminder_enabled=?,
    post_reminder_enabled=?, post_reminder_offset_value=?, post_reminder_offset_unit=?,
    send_email=?, send_whatsapp=?, notification_time=?, is_active=?
    WHERE id=? AND patient_id=?`)
    .run(b.title, b.event_type || '', b.event_mode || 'one_time',
         b.exact_date || null, b.event_time || '',
         b.recurrence_frequency_value || 1, b.recurrence_frequency_unit || 'weeks',
         b.start_date || null, b.end_date || null,
         b.notes || '', b.category || 'other', b.priority || 'info',
         b.show_in_weekly_reminders !== false ? 1 : 0,
         b.mark_exact_day_in_calendar !== false ? 1 : 0,
         b.pre_reminder_enabled ? 1 : 0, b.pre_reminder_offset_value || 1, b.pre_reminder_offset_unit || 'days',
         b.same_day_reminder_enabled ? 1 : 0,
         b.post_reminder_enabled ? 1 : 0, b.post_reminder_offset_value || 1, b.post_reminder_offset_unit || 'weeks',
         b.send_email ? 1 : 0, b.send_whatsapp ? 1 : 0,
         b.notification_time || '08:00',
         b.is_active !== false ? 1 : 0,
         req.params.eid, req.params.pid);
  res.json({ ok: true });
});

// DELETE /events/:pid/:eid
router.delete('/:pid/:eid', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  db.prepare('DELETE FROM patient_events WHERE id=? AND patient_id=?').run(req.params.eid, req.params.pid);
  res.json({ ok: true });
});

// ── Week data (reminders + markers) ──────────────────────────────────────────

// GET /events/:pid/week?week_start=YYYY-MM-DD&week_end=YYYY-MM-DD
router.get('/:pid/week', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const { week_start, week_end } = req.query;
  if (!week_start || !week_end) return res.status(400).json({ error: 'week_start and week_end required' });

  const events = db.prepare('SELECT * FROM patient_events WHERE patient_id=? AND is_active=1').all(req.params.pid);
  const eventIds = events.map(e => e.id);

  // Load dismissed in-app occurrences
  const dismissed = eventIds.length
    ? db.prepare(`SELECT event_id, occurrence_date, reminder_kind FROM patient_event_occurrences WHERE event_id IN (${eventIds.map(() => '?').join(',')}) AND channel='in_app' AND status='dismissed'`).all(...eventIds)
    : [];
  const dismissedSet = new Set(dismissed.map(d => `${d.event_id}|${d.occurrence_date}|${d.reminder_kind}`));

  const bannerReminders = [];
  const markers = {};

  for (const raw of events) {
    const ev    = parseEvent(raw);
    // In-app shows ONLY event_day occurrences (no pre/post noise)
    const items = getEventDayItems(ev, week_start, week_end, dismissedSet);

    for (const item of items) {
      const base = {
        event_id:        ev.id,
        title:           ev.title,
        event_type:      ev.event_type,
        category:        ev.category,
        priority:        ev.priority,
        notes:           ev.notes,
        occurrence_date: item.occurrence_date,
        reminder_date:   item.reminder_date,
        reminder_kind:   item.reminder_kind,
        offset_value:    item.offset_value,
        offset_unit:     item.offset_unit,
      };

      if (ev.show_in_weekly_reminders) {
        bannerReminders.push(base);
      }

      if (ev.mark_exact_day_in_calendar) {
        const key = item.occurrence_date;
        if (!markers[key]) markers[key] = [];
        markers[key].push({ ...base });
      }
    }
  }

  res.json({ reminders: bannerReminders, markers });
});

// ── Dismiss ───────────────────────────────────────────────────────────────────

// POST /events/:pid/dismiss  { event_id, occurrence_date, reminder_kind }
router.post('/:pid/dismiss', authTherapist, (req, res) => {
  if (!canAccess(req.user.id, req.params.pid)) return res.status(403).json({ error: 'Forbidden' });
  const { event_id, occurrence_date, reminder_kind } = req.body;
  const id = genId('occ_');
  db.prepare(`INSERT OR IGNORE INTO patient_event_occurrences
    (id, event_id, occurrence_date, reminder_kind, channel, status)
    VALUES (?,?,?,?,'in_app','dismissed')`)
    .run(id, event_id, occurrence_date, reminder_kind);
  db.prepare(`UPDATE patient_event_occurrences SET status='dismissed' WHERE event_id=? AND occurrence_date=? AND reminder_kind=? AND channel='in_app'`)
    .run(event_id, occurrence_date, reminder_kind);
  res.json({ ok: true });
});

// ── Notification scheduler (called from index.js) ─────────────────────────────
// Uses CLINIC_TIMEZONE env var (defaults to UTC) for correct local date/time.
// Only sends pre/same_day/post reminders externally (email/WhatsApp).
// Checks notification_time — does not send before the configured hour.

async function checkAndSendNotifications() {
  const tz  = process.env.CLINIC_TIMEZONE || 'UTC';
  const now  = new Date();

  // Local date in YYYY-MM-DD (en-CA locale produces that format)
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);

  // Local time in HH:MM (en-GB 24h format)
  const currentTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now).slice(0, 5);

  const events = db.prepare(`
    SELECT pe.*, p.name AS patient_name,
           t.email AS therapist_email, t.whatsapp_number AS therapist_whatsapp
    FROM patient_events pe
    JOIN patients  p ON pe.patient_id   = p.id
    JOIN therapists t ON p.therapist_id = t.id
    WHERE pe.is_active = 1 AND (pe.send_email = 1 OR pe.send_whatsapp = 1)
  `).all();

  for (const raw of events) {
    const ev               = parseEvent(raw);
    const notificationTime = ev.notification_time || '08:00';

    // Don't send before the configured time of day
    if (currentTime < notificationTime) continue;

    const notificationItems = [];

    // "N before" → today is N days before the occurrence → occurrence = today + N days
    if (ev.pre_reminder_enabled) {
      const days    = offsetDays(ev.pre_reminder_offset_value, ev.pre_reminder_offset_unit);
      const occDate = addDays(todayStr, days);
      if (isOccurrenceDate(ev, occDate)) {
        notificationItems.push({
          occurrence_date: occDate,
          reminder_kind:   'before',
          offset_value:    ev.pre_reminder_offset_value,
          offset_unit:     ev.pre_reminder_offset_unit,
        });
      }
    }

    // Same-day → occurrence is today
    if (ev.same_day_reminder_enabled) {
      if (isOccurrenceDate(ev, todayStr)) {
        notificationItems.push({ occurrence_date: todayStr, reminder_kind: 'same_day', offset_value: 0, offset_unit: 'days' });
      }
    }

    // "N after" → today is N days after the occurrence → occurrence = today − N days
    if (ev.post_reminder_enabled) {
      const days    = offsetDays(ev.post_reminder_offset_value, ev.post_reminder_offset_unit);
      const occDate = addDays(todayStr, -days);
      if (isOccurrenceDate(ev, occDate)) {
        notificationItems.push({
          occurrence_date: occDate,
          reminder_kind:   'after',
          offset_value:    ev.post_reminder_offset_value,
          offset_unit:     ev.post_reminder_offset_unit,
        });
      }
    }

    for (const item of notificationItems) {
      const channels = [];
      if (ev.send_email    && raw.therapist_email)     channels.push({ ch: 'email',     to: raw.therapist_email });
      if (ev.send_whatsapp && raw.therapist_whatsapp)  channels.push({ ch: 'whatsapp',  to: raw.therapist_whatsapp });

      for (const { ch, to } of channels) {
        const existing = db.prepare(`SELECT id FROM patient_event_occurrences WHERE event_id=? AND occurrence_date=? AND reminder_kind=? AND channel=? AND status='sent'`)
          .get(ev.id, item.occurrence_date, item.reminder_kind, ch);
        if (existing) continue;

        const result = await sendNotification(ch, {
          to,
          patientName:    raw.patient_name,
          title:          ev.title,
          reminderDate:   todayStr,
          occurrenceDate: item.occurrence_date,
          reminderKind:   item.reminder_kind,
          offsetValue:    item.offset_value,
          offsetUnit:     item.offset_unit,
          notes:          ev.notes,
        });

        // Don't persist a row for unconfigured channels — they are not retryable
        // errors, just missing setup. Without this, every hourly run re-attempts
        // the same reminder because the duplicate-check only skips status='sent'.
        if (!result.ok && result.reason === 'not_configured') continue;

        const id     = genId('occ_');
        const status = result.ok ? 'sent' : 'failed';
        db.prepare(`INSERT OR IGNORE INTO patient_event_occurrences
          (id, event_id, occurrence_date, reminder_kind, channel, status, sent_at, error_message)
          VALUES (?,?,?,?,?,?,datetime('now'),?)`)
          .run(id, ev.id, item.occurrence_date, item.reminder_kind, ch, status, result.reason || null);
        db.prepare(`UPDATE patient_event_occurrences SET status=?, sent_at=datetime('now'), error_message=? WHERE event_id=? AND occurrence_date=? AND reminder_kind=? AND channel=?`)
          .run(status, result.reason || null, ev.id, item.occurrence_date, item.reminder_kind, ch);
      }
    }
  }
}

module.exports = router;
module.exports.checkAndSendNotifications = checkAndSendNotifications;
