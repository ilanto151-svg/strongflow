import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import { DAYS, TYPE_META, RPE } from '../../constants';
import { dateToKey, keyToDate, sundayOfWeekOffset, weekLabel, fmtDate, isSameDay, today, uid, localDateStr } from '../../utils/calendar';
import ExerciseCard from './ExerciseCard';
import ExerciseForm from './ExerciseForm';
import CopyModal from './CopyModal';
import CrossPatientCopyModal from './CrossPatientCopyModal';
import MonthView from '../patient/MonthView';

// Describes a reminder's timing in plain English.
// Uses the fields now guaranteed to exist in reminder objects.
function triggerDesc(r) {
  if (r.trigger_type === 'on')          return 'on treatment day';
  if (r.trigger_type === 'during_week') return 'during treatment week';
  const dir  = r.trigger_type === 'before' ? 'before' : 'after';
  const unit = Number(r.offset_value) === 1
    ? String(r.offset_unit).replace(/s$/, '')
    : r.offset_unit;
  return `${r.offset_value} ${unit} ${dir} treatment`;
}

export default function ExercisePlan({ patient }) {
  const [weekOffset, setWeekOffset]   = useState(0);
  const [selectedDay, setSelectedDay] = useState(today());
  const [exercises, setExercises]     = useState([]);
  const [showAdd, setShowAdd]         = useState(false);
  const [calView, setCalView]         = useState('week'); // 'week' | 'month'
  const [loading, setLoading]         = useState(false);

  // Reminder banners (top of week view, dismissable)
  const [reminders, setReminders]           = useState([]);
  const [dismissedLocal, setDismissedLocal] = useState(new Set());

  // Week-view calendar markers — two separate structures
  const [treatmentDates, setTreatmentDates] = useState({});
  const [reminderDates,  setReminderDates]  = useState({});
  const [pausedDates,    setPausedDates]    = useState({});

  // Hover tooltips for the day-strip badges
  const [treatmentTooltip, setTreatmentTooltip] = useState(null);
  const [reminderTooltip,  setReminderTooltip]  = useState(null);

  // Clinical events (separate feature)
  const [eventWeekData, setEventWeekData]   = useState({ reminders: [], markers: {} });
  const [eventDismissed, setEventDismissed] = useState(new Set());
  const [eventTooltip,   setEventTooltip]   = useState(null);

  // Month-view calendar markers
  const [monthYear, setMonthYear]                     = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [monthTreatmentDates, setMonthTreatmentDates] = useState({});
  const [monthReminderDates,  setMonthReminderDates]  = useState({});
  const [monthPausedDates,    setMonthPausedDates]    = useState({});

  // Therapist-defined planned session RPE for the selected day
  const [plannedRpe, setPlannedRpe] = useState(null);
  const [plannedRpeSaving, setPlannedRpeSaving] = useState(false);

  // ── Exercise load ──────────────────────────────────────────────────────────
  const load = useCallback(() => {
    if (!patient) return;
    setLoading(true);
    api.get(`/exercises/${patient.id}`)
      .then(r => setExercises(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patient]);

  useEffect(() => { load(); }, [load]);

  const dayKey      = dateToKey(selectedDay);
  const dayExercises = exercises.filter(e => e.day_key === dayKey);

  const weekStart = sundayOfWeekOffset(weekOffset);
  const weekDays  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // ── Planned RPE load (per selected day) ────────────────────────────────────
  useEffect(() => {
    if (!patient) return;
    api.get(`/exercises/${patient.id}/day-plan/${dayKey}`)
      .then(r => setPlannedRpe(r.data.planned_rpe ?? null))
      .catch(() => setPlannedRpe(null));
  }, [patient, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePlannedRpe(val) {
    const rpe = (val === '' || val == null) ? null : Number(val);
    setPlannedRpe(rpe);
    setPlannedRpeSaving(true);
    await api.put(`/exercises/${patient.id}/day-plan/${dayKey}`, { planned_rpe: rpe })
      .catch(console.error)
      .finally(() => setPlannedRpeSaving(false));
  }

  // ── Week-view data load ────────────────────────────────────────────────────
  useEffect(() => {
    if (!patient) return;
    const ws = localDateStr(weekDays[0]);
    const we = localDateStr(weekDays[6]);

    // Dismissable reminder banners
    api.get(`/treatments/${patient.id}/reminders?week_start=${ws}&week_end=${we}`)
      .then(r => setReminders(r.data))
      .catch(() => setReminders([]));

    // Calendar markers — response is { treatmentDates, reminderDates, pausedDates, pausePeriods }
    api.get(`/treatments/${patient.id}/cycles?week_start=${ws}&week_end=${we}`)
      .then(r => {
        setTreatmentDates(r.data.treatmentDates || {});
        setReminderDates(r.data.reminderDates   || {});
        setPausedDates(r.data.pausedDates       || {});
      })
      .catch(() => { setTreatmentDates({}); setReminderDates({}); setPausedDates({}); });

    // Clinical events
    api.get(`/events/${patient.id}/week?week_start=${ws}&week_end=${we}`)
      .then(r => setEventWeekData(r.data))
      .catch(() => setEventWeekData({ reminders: [], markers: {} }));

    setEventDismissed(new Set());
  }, [patient, weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Month-view data load ───────────────────────────────────────────────────
  useEffect(() => {
    if (calView !== 'month' || !patient) return;
    const firstDay = new Date(monthYear.year, monthYear.month, 1);
    const lastDay  = new Date(monthYear.year, monthYear.month + 1, 0);
    const ws = localDateStr(firstDay);
    const we = localDateStr(lastDay);
    api.get(`/treatments/${patient.id}/cycles?week_start=${ws}&week_end=${we}`)
      .then(r => {
        setMonthTreatmentDates(r.data.treatmentDates || {});
        setMonthReminderDates(r.data.reminderDates   || {});
        setMonthPausedDates(r.data.pausedDates       || {});
      })
      .catch(() => { setMonthTreatmentDates({}); setMonthReminderDates({}); setMonthPausedDates({}); });
  }, [patient, calView, monthYear.year, monthYear.month]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clinical event helpers ─────────────────────────────────────────────────
  async function dismissEvent(reminder) {
    const key = `${reminder.event_id}|${reminder.occurrence_date}|${reminder.reminder_kind}`;
    setEventDismissed(prev => new Set([...prev, key]));
    await api.post(`/events/${patient.id}/dismiss`, {
      event_id:        reminder.event_id,
      occurrence_date: reminder.occurrence_date,
      reminder_kind:   reminder.reminder_kind,
    }).catch(console.error);
  }

  const PRIORITY_COLORS = { info: '#3b82f6', caution: '#f59e0b', important: '#ef4444' };
  const PRIORITY_BG     = { info: '#eff6ff', caution: '#fffbeb', important: '#fef2f2' };
  const PRIORITY_BORDER = { info: '#bfdbfe', caution: '#fde68a', important: '#fca5a5' };
  const CATEGORY_ICONS  = { scan: '🔬', doctor: '🩺', treatment: '💉', test: '🧪', follow_up: '📋', other: '📅' };

  function eventReminderLabel(r) {
    if (r.reminder_kind === 'event_day' || r.reminder_kind === 'same_day') return r.title;
    const dir = r.reminder_kind === 'before' ? 'before' : 'after';
    return `${r.offset_value} ${r.offset_unit} ${dir} — ${r.title}`;
  }

  const visibleEventReminders = eventWeekData.reminders.filter(
    r => !eventDismissed.has(`${r.event_id}|${r.occurrence_date}|${r.reminder_kind}`)
  );

  // ── Treatment reminder banner helpers ──────────────────────────────────────
  async function dismissReminder(reminder) {
    setDismissedLocal(prev => new Set([...prev, `${reminder.rule_id}|${reminder.occurrence_date}`]));
    await api.post(`/treatments/${patient.id}/dismiss`, {
      rule_id:         reminder.rule_id,
      occurrence_date: reminder.occurrence_date,
    }).catch(console.error);
  }

  const visibleReminders = reminders.filter(
    r => !dismissedLocal.has(`${r.rule_id}|${r.occurrence_date}`)
  );
  const todayStr = localDateStr(today());

  // ── Exercise helpers ───────────────────────────────────────────────────────
  function hasExercise(date) {
    return exercises.some(e => e.day_key === dateToKey(date));
  }

  async function addExercise(form) {
    await api.post(`/exercises/${patient.id}`, { ...form, day_key: dayKey, instance_id: uid() });
    load();
    setShowAdd(false);
  }

  async function editExercise(ex, updated) {
    await api.put(`/exercises/${patient.id}/${ex.instance_id}`, updated);
    load();
  }

  async function deleteExercise(ex) {
    await api.delete(`/exercises/${patient.id}/${ex.instance_id}`);
    load();
  }

  // ── Within-patient copy ────────────────────────────────────────────────────
  const [copyModal, setCopyModal] = useState(null);

  async function doCopy(params) {
    const { mode } = copyModal;
    if (mode === 'exercise') {
      await api.post(`/exercises/${patient.id}/copy-exercise`, params);
    } else if (mode === 'day') {
      await api.post(`/exercises/${patient.id}/copy-day`, params);
    } else {
      await api.post(`/exercises/${patient.id}/copy`, params);
    }
    load();
    setCopyModal(null);
  }

  // ── Cross-patient copy ─────────────────────────────────────────────────────
  const [crossModal, setCrossModal] = useState(null);
  // crossModal shape: { type: 'exercise'|'day'|'week', srcDayKey?, srcWeekOffset?, instanceId?, sourceLabel? }

  async function doXCopy(params) {
    // params: { dst_pid, dst_day_key?, dst_week_offset?, mode: 'append'|'replace' }
    const type = crossModal.type;
    try {
      if (type === 'exercise') {
        await api.post(`/exercises/${patient.id}/cross-copy-exercise`, {
          instance_id: crossModal.instanceId,
          dst_pid:     params.dst_pid,
          dst_day_key: params.dst_day_key,
          mode:        params.mode,
        });
      } else if (type === 'day') {
        await api.post(`/exercises/${patient.id}/cross-copy-day`, {
          src_day_key: crossModal.srcDayKey,
          dst_pid:     params.dst_pid,
          dst_day_key: params.dst_day_key,
          mode:        params.mode,
        });
      } else {
        await api.post(`/exercises/${patient.id}/cross-copy-week`, {
          src_week_offset: crossModal.srcWeekOffset,
          dst_pid:         params.dst_pid,
          dst_week_offset: params.dst_week_offset,
          mode:            params.mode,
        });
      }
    } catch {
      alert('Copy failed. Please try again.');
    }
    setCrossModal(null);
  }

  // ── No patient selected ───────────────────────────────────────────────────
  if (!patient) {
    return (
      <div className="empty">
        <div className="empty-icon">👈</div>
        <div>Select a patient from the sidebar to view their exercise plan.</div>
      </div>
    );
  }

  const typedGroups = {};
  dayExercises.forEach(ex => {
    if (!typedGroups[ex.type]) typedGroups[ex.type] = [];
    typedGroups[ex.type].push(ex);
  });

  // ── Exercise alert computation ──────────────────────────────────────────────
  // Scans all exercises for this patient (all days, already loaded) and detects:
  //   noVariation:   same exercise name+type used across a ≥14-day span
  //   noProgression: same exercise AND identical parameters across that span
  //
  // day_key is weekOffset*7+dow — a linear integer, so max-min = exact day count.
  // No API calls needed; derived purely from the already-loaded exercises state.
  const exerciseAlerts = useMemo(() => {
    function normParam(v) { return (v == null || v === '') ? '' : String(v).trim(); }

    // Group every scheduled occurrence by (type, normalised name)
    const byKey = {};
    exercises.forEach(ex => {
      const k = `${ex.type}:${ex.name.trim().toLowerCase()}`;
      if (!byKey[k]) byKey[k] = [];
      byKey[k].push(ex);
    });

    const result = {}; // alertKey → { noVariation, noProgression }
    Object.entries(byKey).forEach(([k, exList]) => {
      if (exList.length < 2) return;
      const keys = exList.map(e => e.day_key);
      const span = Math.max(...keys) - Math.min(...keys);
      if (span < 14) return;

      // Same exercise in plan for ≥14 days → variation alert
      const noVariation = true;

      // Progression alert only when every occurrence has identical load params
      const first = exList[0];
      const noProgression = exList.every(e =>
        normParam(e.sets)     === normParam(first.sets)     &&
        normParam(e.reps)     === normParam(first.reps)     &&
        normParam(e.weight)   === normParam(first.weight)   &&
        normParam(e.duration) === normParam(first.duration)
      );

      result[k] = { noVariation, noProgression };
    });
    return result;
  }, [exercises]);

  return (
    <div>
      {/* Date header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>
            {isSameDay(selectedDay, today()) ? 'Today' : fmtDate(selectedDay)}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>{patient.name} — exercise plan</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className={`btn btn-ghost${calView === 'week'  ? ' active-tab' : ''}`} onClick={() => setCalView('week')}>Week</button>
          <button className={`btn btn-ghost${calView === 'month' ? ' active-tab' : ''}`} onClick={() => setCalView('month')}>Month</button>
          <button className="btn btn-ghost" onClick={() => setCopyModal({ mode: 'day', sourceLabel: `${DAYS[selectedDay.getDay()].slice(0,3)} — ${dayExercises.length} exercise${dayExercises.length !== 1 ? 's' : ''}`, srcDayKey: dayKey })}>📋 Day</button>
          <button className="btn btn-ghost" onClick={() => setCopyModal({ mode: 'week' })}>📋 Week</button>
          <span style={{ width: 1, background: 'var(--gray-200)', alignSelf: 'stretch', margin: '0 2px' }} />
          <button className="btn btn-ghost" style={{ color: '#2563eb' }}
            title="Copy this day's exercises to another patient"
            onClick={() => setCrossModal({ type: 'day', srcDayKey: dayKey, sourceLabel: `${DAYS[selectedDay.getDay()].slice(0,3)} — ${dayExercises.length} exercise${dayExercises.length !== 1 ? 's' : ''}` })}>
            📤 Day
          </button>
          <button className="btn btn-ghost" style={{ color: '#2563eb' }}
            title="Copy this week's exercises to another patient"
            onClick={() => setCrossModal({ type: 'week', srcWeekOffset: weekOffset })}>
            📤 Week
          </button>
        </div>
      </div>

      {calView === 'month' ? (
        <MonthView
          exercises={exercises}
          treatmentDates={monthTreatmentDates}
          reminderDates={monthReminderDates}
          pausedDates={monthPausedDates}
          onMonthChange={(y, m) => setMonthYear({ year: y, month: m })}
        />
      ) : (
        <>
          {/* Week navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button className="icon-btn" onClick={() => setWeekOffset(o => o - 1)}>◀</button>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-700)', flex: 1, textAlign: 'center' }}>
              {weekLabel(weekOffset)}
            </span>
            <button className="icon-btn" onClick={() => setWeekOffset(o => o + 1)}>▶</button>
            {weekOffset !== 0 && <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setWeekOffset(0); setSelectedDay(today()); }}>Today</button>}
          </div>

          {/* Treatment reminder banners (dismissable) */}
          {visibleReminders.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {visibleReminders.map((r, i) => {
                const isToday = r.occurrence_date === todayStr;
                return (
                  <div key={`${r.rule_id}|${r.occurrence_date}|${i}`} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: isToday ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${isToday ? '#fca5a5' : '#fde68a'}`,
                    borderRadius: 10, padding: '10px 14px', marginBottom: 6,
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{isToday ? '🚨' : '🔔'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? '#991b1b' : '#92400e', marginBottom: 2 }}>
                        {isToday ? 'Today — ' : ''}{r.treatment_name} · {triggerDesc(r)}
                      </div>
                      {r.message && (
                        <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>{r.message}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                        Treatment cycle: {new Date(r.cycle_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 16, flexShrink: 0, padding: 2 }}
                      title="Dismiss this occurrence"
                      onClick={() => dismissReminder(r)}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Clinical event reminder banners */}
          {visibleEventReminders.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {visibleEventReminders.map((r, i) => {
                const isToday  = r.reminder_date === todayStr;
                const isEvent  = r.reminder_kind === 'event_day';
                const bg       = PRIORITY_BG[r.priority]     || '#eff6ff';
                const border   = PRIORITY_BORDER[r.priority] || '#bfdbfe';
                const color    = PRIORITY_COLORS[r.priority] || '#1d4ed8';
                const catIcon  = CATEGORY_ICONS[r.category]  || '📅';
                return (
                  <div key={`${r.event_id}|${r.occurrence_date}|${r.reminder_kind}|${i}`} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    background: bg, border: `1px solid ${border}`,
                    borderRadius: 10, padding: '10px 14px', marginBottom: 6,
                  }}>
                    <span style={{ fontSize: 18, flexShrink: 0 }}>{isToday ? (isEvent ? catIcon : '🔔') : catIcon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 2 }}>
                        {isToday && <span>Today — </span>}
                        {eventReminderLabel(r)}
                        {r.event_type && <span style={{ fontWeight: 400, color: 'var(--gray-500)', marginLeft: 6 }}>({r.event_type})</span>}
                      </div>
                      {r.notes && <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>{r.notes}</div>}
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                        {r.reminder_kind === 'before' && `Event on ${new Date(r.occurrence_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                        {r.reminder_kind === 'after'  && `Event was on ${new Date(r.occurrence_date + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                      </div>
                    </div>
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gray-400)', fontSize: 16, flexShrink: 0, padding: 2 }}
                      title="Dismiss this occurrence"
                      onClick={() => dismissEvent(r)}
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Day strip */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
            {weekDays.map(d => {
              const key        = dateToKey(d);
              const dateStr    = localDateStr(d);
              const isToday    = isSameDay(d, today());
              const isSelected = isSameDay(d, selectedDay);
              const hasPlan    = hasExercise(d);
              const txList        = treatmentDates[dateStr];
              const visibleTxList = txList ? txList.filter(t => (t.display_mode || 'standard') !== 'hidden') : [];
              const hasTx         = visibleTxList.length > 0;
              const subtleOnly    = hasTx && visibleTxList.every(t => t.display_mode === 'subtle');
              const isStartDay    = hasTx && visibleTxList.some(t => t.day_of_span === 1);
              const rmList     = reminderDates[dateStr];
              const hasRm      = rmList && rmList.length > 0;
              const pmList     = pausedDates[dateStr];
              const hasPause   = pmList && pmList.length > 0;
              const evList     = eventWeekData.markers[dateStr];
              const hasEv      = evList && evList.length > 0;
              const evPriority = hasEv
                ? (evList.some(e => e.priority === 'important') ? 'important'
                  : evList.some(e => e.priority === 'caution')  ? 'caution' : 'info')
                : null;
              return (
                <button key={key}
                  className={`day-tab${isSelected ? ' active' : ''}`}
                  onClick={() => setSelectedDay(d)}
                  style={{ position: 'relative', paddingBottom: (hasTx || hasRm || hasEv) ? 4 : undefined }}
                >
                  {DAYS[d.getDay()].slice(0, 3)} {d.getDate()}

                  {/* Today indicator dot */}
                  {isToday && !isSelected && (
                    <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', border: '2px solid white' }} />
                  )}

                  {/* Exercise dot */}
                  {hasPlan && <span className="rdot" />}

                  {/* Treatment day badge — 🎗️ for start days, pill for continuation, dot for subtle-only */}
                  {hasTx && (
                    <span
                      style={{ display: 'block', lineHeight: 1, marginTop: 3, textAlign: 'center' }}
                      onMouseEnter={e => { e.stopPropagation(); setTreatmentTooltip({ dateStr, rect: e.currentTarget.getBoundingClientRect() }); setReminderTooltip(null); }}
                      onMouseLeave={() => setTreatmentTooltip(null)}
                    >
                      {subtleOnly
                        ? <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: '#a8a29e', verticalAlign: 'middle' }} />
                        : isStartDay
                          ? <span style={{ fontSize: 11 }}>🎗️</span>
                          : <span style={{ display: 'inline-block', width: 14, height: 3, background: '#fca5a5', borderRadius: 2, verticalAlign: 'middle' }} />
                      }
                    </span>
                  )}

                  {/* Reminder day badge (🔔) */}
                  {hasRm && (
                    <span
                      style={{ display: 'block', fontSize: 10, lineHeight: 1, marginTop: 2, textAlign: 'center', opacity: 0.85 }}
                      onMouseEnter={e => { e.stopPropagation(); setReminderTooltip({ dateStr, rect: e.currentTarget.getBoundingClientRect() }); setTreatmentTooltip(null); }}
                      onMouseLeave={() => setReminderTooltip(null)}
                    >🔔</span>
                  )}

                  {/* Pause badge (⏸) — only when no active treatment badge shown */}
                  {hasPause && !hasTx && (
                    <span
                      style={{ display: 'block', fontSize: 10, lineHeight: 1, marginTop: 2, textAlign: 'center', opacity: 0.7 }}
                      title={pmList.map(p => `${p.name} — on hold`).join(', ')}
                    >⏸</span>
                  )}

                  {/* Clinical event badge */}
                  {hasEv && (
                    <span
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, marginTop: 2 }}
                      onMouseEnter={e => { e.stopPropagation(); setEventTooltip({ dateStr, rect: e.currentTarget.getBoundingClientRect() }); }}
                      onMouseLeave={() => setEventTooltip(null)}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLORS[evPriority] || '#3b82f6', display: 'inline-block' }} />
                      <span style={{ fontSize: 10, lineHeight: 1 }}>{CATEGORY_ICONS[evList[0].category] || '📅'}</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Treatment day tooltip */}
          {treatmentTooltip && treatmentDates[treatmentTooltip.dateStr] && (
            <div style={{
              position: 'fixed',
              top:  treatmentTooltip.rect.bottom + 8,
              left: Math.min(treatmentTooltip.rect.left, window.innerWidth - 270),
              zIndex: 9999,
              background: '#fff',
              border: '1px solid #fca5a5',
              borderRadius: 10,
              padding: '10px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
              minWidth: 200,
              maxWidth: 270,
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🎗️ Treatment Day
              </div>
              {treatmentDates[treatmentTooltip.dateStr].map((t, i) => {
                const isHidden = t.display_mode === 'hidden';
                const isSubtle = t.display_mode === 'subtle';
                return (
                  <div key={i} style={{ marginBottom: i < treatmentDates[treatmentTooltip.dateStr].length - 1 ? 8 : 0, opacity: isHidden ? 0.6 : 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: isHidden ? 'var(--gray-500)' : undefined }}>
                      {t.name}
                      {isHidden && <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 5 }}>(background)</span>}
                      {isSubtle && <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginLeft: 5 }}>(subtle)</span>}
                    </div>
                    {t.treatment_type && (
                      <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{t.treatment_type}</div>
                    )}
                    {t.duration_days > 1 && (
                      <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 600, marginTop: 2 }}>
                        Day {t.day_of_span} of {t.duration_days}
                      </div>
                    )}
                    {t.notes && (
                      <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>📝 {t.notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Reminder day tooltip */}
          {reminderTooltip && reminderDates[reminderTooltip.dateStr] && (
            <div style={{
              position: 'fixed',
              top:  reminderTooltip.rect.bottom + 8,
              left: Math.min(reminderTooltip.rect.left, window.innerWidth - 290),
              zIndex: 9999,
              background: '#fff',
              border: '1px solid #fde68a',
              borderRadius: 10,
              padding: '10px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
              minWidth: 210,
              maxWidth: 290,
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🔔 Reminder
              </div>
              {reminderDates[reminderTooltip.dateStr].map((r, i) => (
                <div key={i} style={{ marginBottom: i < reminderDates[reminderTooltip.dateStr].length - 1 ? 8 : 0 }}>
                  {r.message && (
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-800)', marginBottom: 2 }}>{r.message}</div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                    {r.treatment_name} · {r.timing}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Clinical event day tooltip */}
          {eventTooltip && eventWeekData.markers[eventTooltip.dateStr] && (
            <div style={{
              position: 'fixed',
              top:  eventTooltip.rect.bottom + 8,
              left: Math.min(eventTooltip.rect.left, window.innerWidth - 280),
              zIndex: 9999,
              background: '#fff',
              border: '1px solid var(--gray-200)',
              borderRadius: 10,
              padding: '10px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
              minWidth: 220,
              maxWidth: 300,
              pointerEvents: 'none',
            }}>
              {eventWeekData.markers[eventTooltip.dateStr].map((ev, i) => {
                const borderColor = PRIORITY_BORDER[ev.priority] || '#bfdbfe';
                const textColor   = PRIORITY_COLORS[ev.priority] || '#1d4ed8';
                const icon        = CATEGORY_ICONS[ev.category]  || '📅';
                const isReminder  = ev.kind !== 'event_day';
                return (
                  <div key={i} style={{ marginBottom: i < eventWeekData.markers[eventTooltip.dateStr].length - 1 ? 10 : 0, borderLeft: `3px solid ${borderColor}`, paddingLeft: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: textColor }}>
                      {icon} {ev.title}
                      {isReminder && (
                        <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--gray-400)', marginLeft: 4 }}>
                          ({ev.kind === 'before' ? `${ev.offset_value} ${ev.offset_unit} before` : `${ev.offset_value} ${ev.offset_unit} after`})
                        </span>
                      )}
                    </div>
                    {ev.event_type && <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{ev.event_type}</div>}
                    {ev.notes      && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>📝 {ev.notes}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Exercises for selected day */}
          {loading ? (
            <p style={{ color: 'var(--gray-400)' }}>Loading…</p>
          ) : Object.keys(typedGroups).length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📋</div>
              <div>No exercises planned for this day.</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>
                + Add Exercise
              </button>
            </div>
          ) : (
            <>
              {Object.entries(typedGroups).map(([type, exs]) => {
                const meta = TYPE_META[type];
                return (
                  <div key={type} style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 18 }}>{meta.icon}</span>
                      <span style={{ fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    </div>
                    {exs.map(ex => {
                      const alertKey = `${ex.type}:${ex.name.trim().toLowerCase()}`;
                      const alerts   = exerciseAlerts[alertKey] || {};
                      return (
                        <ExerciseCard key={ex.instance_id} ex={ex}
                          noProgression={alerts.noProgression || false}
                          noVariation={alerts.noVariation || false}
                          onEdit={updated => editExercise(ex, updated)}
                          onDelete={() => deleteExercise(ex)}
                          onCopy={() => setCopyModal({ mode: 'exercise', sourceLabel: ex.name, srcDayKey: dayKey, instanceId: ex.instance_id })}
                          onCrossPatientCopy={() => setCrossModal({ type: 'exercise', instanceId: ex.instance_id, srcDayKey: dayKey, sourceLabel: ex.name })}
                        />
                      );
                    })}
                  </div>
                );
              })}
              <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Exercise</button>
            </>
          )}

          {/* ── Target Session RPE (therapist-defined) ──────────────────────── */}
          {!loading && (
            <div style={{
              marginTop: 24,
              padding: '14px 16px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 15 }}>🎯</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#166534' }}>Target Session RPE</span>
                {plannedRpeSaving && (
                  <span style={{ fontSize: 11, color: '#16a34a', marginLeft: 4 }}>Saving…</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <select
                  className="form-input"
                  style={{ fontSize: 13, width: 'auto', minWidth: 220 }}
                  value={plannedRpe ?? ''}
                  onChange={e => savePlannedRpe(e.target.value === '' ? null : e.target.value)}
                >
                  <option value="">— No target set</option>
                  {Object.entries(RPE).map(([k, v]) => (
                    <option key={k} value={k}>{k} – {v}</option>
                  ))}
                </select>
                {plannedRpe != null && (
                  <span style={{ fontSize: 12, color: '#166534', fontStyle: 'italic' }}>
                    {RPE[plannedRpe]}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#15803d', marginTop: 8 }}>
                Shown to the patient as the planned overall effort for this session.
              </div>
            </div>
          )}
        </>
      )}

      {/* Add exercise modal */}
      {showAdd && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">Add Exercise</span>
              <button className="icon-btn" onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="modal-body">
              <ExerciseForm onSave={addExercise} onClose={() => setShowAdd(false)} />
            </div>
          </div>
        </div>
      )}

      {/* Within-patient copy modal */}
      {copyModal && (
        <CopyModal
          mode={copyModal.mode}
          sourceLabel={copyModal.sourceLabel}
          srcDayKey={copyModal.srcDayKey}
          instanceId={copyModal.instanceId}
          currentWeekOffset={weekOffset}
          onCopy={doCopy}
          onClose={() => setCopyModal(null)}
        />
      )}

      {/* Cross-patient copy modal */}
      {crossModal && (
        <CrossPatientCopyModal
          mode={crossModal.type}
          sourcePatient={patient}
          sourceLabel={crossModal.sourceLabel}
          srcDayKey={crossModal.srcDayKey}
          srcWeekOffset={crossModal.type === 'week' ? crossModal.srcWeekOffset : undefined}
          instanceId={crossModal.instanceId}
          onCopy={doXCopy}
          onClose={() => setCrossModal(null)}
        />
      )}
    </div>
  );
}
