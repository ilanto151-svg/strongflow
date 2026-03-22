// server/routes/events.js
const router = require('express').Router();
const { pool } = require('../pg');
const crypto = require('crypto');
const { authTherapist } = require('../middleware/auth');
const { sendNotification } = require('../services/notifications');

function genId(prefix) {
  return prefix + crypto.randomUUID().slice(0, 8);
}

function parseBool(v) {
  return v === true || v === 1 || v === '1' || v === 'true';
}

function parseEvent(r) {
  return {
    id: r.id,
    patient_id: r.patient_id,
    title: r.title,
    event_type: r.event_type || '',
    event_mode: r.event_mode,
    exact_date: r.exact_date || '',
    event_time: r.event_time || '',
    recurrence_frequency_value: Number(r.recurrence_frequency_value ?? 1),
    recurrence_frequency_unit: r.recurrence_frequency_unit || 'weeks',
    start_date: r.start_date || '',
    end_date: r.end_date || '',
    notes: r.notes || '',
    category: r.category || 'other',
    priority: r.priority || 'info',
    show_in_weekly_reminders: parseBool(r.show_in_weekly_reminders),
    mark_exact_day_in_calendar: parseBool(r.mark_exact_day_in_calendar),
    pre_reminder_enabled: parseBool(r.pre_reminder_enabled),
    pre_reminder_offset_value: Number(r.pre_reminder_offset_value ?? 1),
    pre_reminder_offset_unit: r.pre_reminder_offset_unit || 'days',
    same_day_reminder_enabled: parseBool(r.same_day_reminder_enabled),
    post_reminder_enabled: parseBool(r.post_reminder_enabled),
    post_reminder_offset_value: Number(r.post_reminder_offset_value ?? 1),
    post_reminder_offset_unit: r.post_reminder_offset_unit || 'weeks',
    send_email: parseBool(r.send_email),
    send_whatsapp: parseBool(r.send_whatsapp),
    notification_time: r.notification_time || '08:00',
    is_active: parseBool(r.is_active),
    created_at: r.created_at,
  };
}

async function canAccess(therapistId, patientId) {
  const { rows } = await pool.query(
    'SELECT id FROM patients WHERE id = $1 AND therapist_id = $2 LIMIT 1',
    [patientId, therapistId]
  );
  return rows.length > 0;
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ── Date helpers (string-based, timezone-safe) ────────────────────────────────
// Use UTC noon (T12:00:00Z) to avoid DST/timezone shifts when parsing YYYY-MM-DD strings.

function parseDate(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`);
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
  if (unit === 'days') return addDays(dateStr, value);
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
    return event.exact_date >= rangeStart && event.exact_date <= rangeEnd
      ? [event.exact_date]
      : [];
  }

  if (!event.start_date) return [];

  const endStr = event.end_date || '9999-12-31';
  const dates = [];
  let cur = event.start_date;
  let safety = 0;

  while (cur <= rangeEnd && safety++ < 50000) {
    if (cur > endStr) break;
    if (cur >= rangeStart) dates.push(cur);
    cur = addInterval(
      cur,
      Number(event.recurrence_frequency_value || 1),
      event.recurrence_frequency_unit || 'weeks'
    );
  }

  return dates;
}

function isOccurrenceDate(event, dateStr) {
  return getOccurrenceDates(event, dateStr, dateStr).length > 0;
}

// ── In-app items: ONLY event_day occurrences within the week ──────────────────
// Pre/same/post reminders are for external notifications only (email/WhatsApp).
function getEventDayItems(event, weekStart, weekEnd, dismissedSet) {
  const occurrences = getOccurrenceDates(event, weekStart, weekEnd);
  return occurrences
    .filter((occ) => !dismissedSet.has(`${event.id}|${occ}|event_day`))
    .map((occ) => ({
      occurrence_date: occ,
      reminder_date: occ,
      reminder_kind: 'event_day',
      offset_value: 0,
      offset_unit: 'days',
    }));
}

// ── CRUD: Events ──────────────────────────────────────────────────────────────

// GET /events/:pid
router.get(
  '/:pid',
  authTherapist,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user.id, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM patient_events WHERE patient_id = $1 ORDER BY created_at',
      [req.params.pid]
    );

    res.json(rows.map(parseEvent));
  })
);

// POST /events/:pid
router.post(
  '/:pid',
  authTherapist,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user.id, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const b = req.body;
    const id = genId('ev_');

    await pool.query(
      `
      INSERT INTO patient_events
      (
        id, patient_id, title, event_type, event_mode, exact_date, event_time,
        recurrence_frequency_value, recurrence_frequency_unit, start_date, end_date,
        notes, category, priority, show_in_weekly_reminders, mark_exact_day_in_calendar,
        pre_reminder_enabled, pre_reminder_offset_value, pre_reminder_offset_unit,
        same_day_reminder_enabled,
        post_reminder_enabled, post_reminder_offset_value, post_reminder_offset_unit,
        send_email, send_whatsapp, notification_time, is_active
      )
      VALUES
      (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19,
        $20,
        $21, $22, $23,
        $24, $25, $26, $27
      )
      `,
      [
        id,
        req.params.pid,
        b.title,
        b.event_type || '',
        b.event_mode || 'one_time',
        b.exact_date || null,
        b.event_time || '',
        Number(b.recurrence_frequency_value || 1),
        b.recurrence_frequency_unit || 'weeks',
        b.start_date || null,
        b.end_date || null,
        b.notes || '',
        b.category || 'other',
        b.priority || 'info',
        b.show_in_weekly_reminders !== false,
        b.mark_exact_day_in_calendar !== false,
        !!b.pre_reminder_enabled,
        Number(b.pre_reminder_offset_value || 1),
        b.pre_reminder_offset_unit || 'days',
        !!b.same_day_reminder_enabled,
        !!b.post_reminder_enabled,
        Number(b.post_reminder_offset_value || 1),
        b.post_reminder_offset_unit || 'weeks',
        !!b.send_email,
        !!b.send_whatsapp,
        b.notification_time || '08:00',
        b.is_active !== false,
      ]
    );

    const { rows } = await pool.query(
      'SELECT * FROM patient_events WHERE id = $1 LIMIT 1',
      [id]
    );

    res.json(parseEvent(rows[0]));
  })
);

// PUT /events/:pid/:eid
router.put(
  '/:pid/:eid',
  authTherapist,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user.id, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const b = req.body;

    await pool.query(
      `
      UPDATE patient_events SET
        title = $1,
        event_type = $2,
        event_mode = $3,
        exact_date = $4,
        event_time = $5,
        recurrence_frequency_value = $6,
        recurrence_frequency_unit = $7,
        start_date = $8,
        end_date = $9,
        notes = $10,
        category = $11,
        priority = $12,
        show_in_weekly_reminders = $13,
        mark_exact_day_in_calendar = $14,
        pre_reminder_enabled = $15,
        pre_reminder_offset_value = $16,
        pre_reminder_offset_unit = $17,
        same_day_reminder_enabled = $18,
        post_reminder_enabled = $19,
        post_reminder_offset_value = $20,
        post_reminder_offset_unit = $21,
        send_email = $22,
        send_whatsapp = $23,
        notification_time = $24,
        is_active = $25
      WHERE id = $26 AND patient_id = $27
      `,
      [
        b.title,
        b.event_type || '',
        b.event_mode || 'one_time',
        b.exact_date || null,
        b.event_time || '',
        Number(b.recurrence_frequency_value || 1),
        b.recurrence_frequency_unit || 'weeks',
        b.start_date || null,
        b.end_date || null,
        b.notes || '',
        b.category || 'other',
        b.priority || 'info',
        b.show_in_weekly_reminders !== false,
        b.mark_exact_day_in_calendar !== false,
        !!b.pre_reminder_enabled,
        Number(b.pre_reminder_offset_value || 1),
        b.pre_reminder_offset_unit || 'days',
        !!b.same_day_reminder_enabled,
        !!b.post_reminder_enabled,
        Number(b.post_reminder_offset_value || 1),
        b.post_reminder_offset_unit || 'weeks',
        !!b.send_email,
        !!b.send_whatsapp,
        b.notification_time || '08:00',
        b.is_active !== false,
        req.params.eid,
        req.params.pid,
      ]
    );

    res.json({ ok: true });
  })
);

// DELETE /events/:pid/:eid
router.delete(
  '/:pid/:eid',
  authTherapist,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user.id, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query(
      'DELETE FROM patient_events WHERE id = $1 AND patient_id = $2',
      [req.params.eid, req.params.pid]
    );

    res.json({ ok: true });
  })
);

// ── Week data (reminders + markers) ──────────────────────────────────────────

// GET /events/:pid/week?week_start=YYYY-MM-DD&week_end=YYYY-MM-DD
router.get(
  '/:pid/week',
  authTherapist,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user.id, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { week_start, week_end } = req.query;
    if (!week_start || !week_end) {
      return res.status(400).json({ error: 'week_start and week_end required' });
    }

    const eventsResult = await pool.query(
      'SELECT * FROM patient_events WHERE patient_id = $1 AND is_active = true',
      [req.params.pid]
    );

    const events = eventsResult.rows;
    const eventIds = events.map((e) => e.id);

    let dismissedRows = [];
    if (eventIds.length > 0) {
      const dismissedResult = await pool.query(
        `
        SELECT event_id, occurrence_date, reminder_kind
        FROM patient_event_occurrences
        WHERE event_id = ANY($1::text[])
          AND channel = 'in_app'
          AND status = 'dismissed'
        `,
        [eventIds]
      );
      dismissedRows = dismissedResult.rows;
    }

    const dismissedSet = new Set(
      dismissedRows.map((d) => `${d.event_id}|${d.occurrence_date}|${d.reminder_kind}`)
    );

    const bannerReminders = [];
    const markers = {};

    for (const raw of events) {
      const ev = parseEvent(raw);
      const items = getEventDayItems(ev, week_start, week_end, dismissedSet);

      for (const item of items) {
        const base = {
          event_id: ev.id,
          title: ev.title,
          event_type: ev.event_type,
          category: ev.category,
          priority: ev.priority,
          notes: ev.notes,
          occurrence_date: item.occurrence_date,
          reminder_date: item.reminder_date,
          reminder_kind: item.reminder_kind,
          offset_value: item.offset_value,
          offset_unit: item.offset_unit,
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
  })
);

// ── Dismiss ───────────────────────────────────────────────────────────────────

// POST /events/:pid/dismiss  { event_id, occurrence_date, reminder_kind }
router.post(
  '/:pid/dismiss',
  authTherapist,
  asyncHandler(async (req, res) => {
    if (!(await canAccess(req.user.id, req.params.pid))) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { event_id, occurrence_date, reminder_kind } = req.body;
    const id = genId('occ_');

    await pool.query(
      `
      INSERT INTO patient_event_occurrences
      (id, event_id, occurrence_date, reminder_kind, channel, status)
      VALUES ($1, $2, $3, $4, 'in_app', 'dismissed')
      ON CONFLICT (event_id, occurrence_date, reminder_kind, channel)
      DO UPDATE SET status = EXCLUDED.status
      `,
      [id, event_id, occurrence_date, reminder_kind]
    );

    res.json({ ok: true });
  })
);

// ── Notification scheduler (called from index.js) ─────────────────────────────
// Uses CLINIC_TIMEZONE env var (defaults to UTC) for correct local date/time.
// Only sends pre/same_day/post reminders externally (email/WhatsApp).
// Checks notification_time — does not send before the configured hour.

async function checkAndSendNotifications() {
  const tz = process.env.CLINIC_TIMEZONE || 'UTC';
  const now = new Date();

  const todayStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
  }).format(now);

  const currentTime = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(now)
    .slice(0, 5);

  const { rows } = await pool.query(`
    SELECT
      pe.*,
      p.name AS patient_name,
      t.email AS therapist_email,
      t.whatsapp_number AS therapist_whatsapp
    FROM patient_events pe
    JOIN patients p ON pe.patient_id = p.id
    JOIN therapists t ON p.therapist_id = t.id
    WHERE pe.is_active = true
      AND (pe.send_email = true OR pe.send_whatsapp = true)
  `);

  for (const raw of rows) {
    const ev = parseEvent(raw);
    const notificationTime = ev.notification_time || '08:00';

    if (currentTime < notificationTime) continue;

    const notificationItems = [];

    if (ev.pre_reminder_enabled) {
      const days = offsetDays(ev.pre_reminder_offset_value, ev.pre_reminder_offset_unit);
      const occDate = addDays(todayStr, days);
      if (isOccurrenceDate(ev, occDate)) {
        notificationItems.push({
          occurrence_date: occDate,
          reminder_kind: 'before',
          offset_value: ev.pre_reminder_offset_value,
          offset_unit: ev.pre_reminder_offset_unit,
        });
      }
    }

    if (ev.same_day_reminder_enabled) {
      if (isOccurrenceDate(ev, todayStr)) {
        notificationItems.push({
          occurrence_date: todayStr,
          reminder_kind: 'same_day',
          offset_value: 0,
          offset_unit: 'days',
        });
      }
    }

    if (ev.post_reminder_enabled) {
      const days = offsetDays(ev.post_reminder_offset_value, ev.post_reminder_offset_unit);
      const occDate = addDays(todayStr, -days);
      if (isOccurrenceDate(ev, occDate)) {
        notificationItems.push({
          occurrence_date: occDate,
          reminder_kind: 'after',
          offset_value: ev.post_reminder_offset_value,
          offset_unit: ev.post_reminder_offset_unit,
        });
      }
    }

    for (const item of notificationItems) {
      const channels = [];
      if (ev.send_email && raw.therapist_email) {
        channels.push({ ch: 'email', to: raw.therapist_email });
      }
      if (ev.send_whatsapp && raw.therapist_whatsapp) {
        channels.push({ ch: 'whatsapp', to: raw.therapist_whatsapp });
      }

      for (const { ch, to } of channels) {
        const existing = await pool.query(
          `
          SELECT id
          FROM patient_event_occurrences
          WHERE event_id = $1
            AND occurrence_date = $2
            AND reminder_kind = $3
            AND channel = $4
            AND status = 'sent'
          LIMIT 1
          `,
          [ev.id, item.occurrence_date, item.reminder_kind, ch]
        );

        if (existing.rows.length > 0) continue;

        const result = await sendNotification(ch, {
          to,
          patientName: raw.patient_name,
          title: ev.title,
          reminderDate: todayStr,
          occurrenceDate: item.occurrence_date,
          reminderKind: item.reminder_kind,
          offsetValue: item.offset_value,
          offsetUnit: item.offset_unit,
          notes: ev.notes,
        });

        if (!result.ok && result.reason === 'not_configured') continue;

        const id = genId('occ_');
        const status = result.ok ? 'sent' : 'failed';

        await pool.query(
          `
          INSERT INTO patient_event_occurrences
          (id, event_id, occurrence_date, reminder_kind, channel, status, sent_at, error_message)
          VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
          ON CONFLICT (event_id, occurrence_date, reminder_kind, channel)
          DO UPDATE SET
            status = EXCLUDED.status,
            sent_at = NOW(),
            error_message = EXCLUDED.error_message
          `,
          [
            id,
            ev.id,
            item.occurrence_date,
            item.reminder_kind,
            ch,
            status,
            result.reason || null,
          ]
        );
      }
    }
  }
}

module.exports = router;
module.exports.checkAndSendNotifications = checkAndSendNotifications;