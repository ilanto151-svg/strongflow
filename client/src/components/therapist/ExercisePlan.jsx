import { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import { DAYS, TYPE_META } from '../../constants';
import { dateToKey, keyToDate, sundayOfWeekOffset, weekLabel, fmtDate, isSameDay, today, uid, localDateStr } from '../../utils/calendar';
import ExerciseCard from './ExerciseCard';
import ExerciseForm from './ExerciseForm';
import CopyModal from './CopyModal';
import MonthView from '../patient/MonthView';

function triggerDesc(r) {
  if (r.trigger_type === 'on')          return 'on treatment day';
  if (r.trigger_type === 'during_week') return 'during treatment week';
  const dir = r.trigger_type === 'before' ? 'before' : 'after';
  return `${r.offset_value} ${r.offset_unit} ${dir} treatment`;
}

export default function ExercisePlan({ patient }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(today());
  const [exercises, setExercises]   = useState([]);
  const [showAdd, setShowAdd]       = useState(false);
  const [calView, setCalView]       = useState('week'); // 'week' | 'month'
  const [loading, setLoading]       = useState(false);
  const [reminders, setReminders]         = useState([]);
  const [dismissedLocal, setDismissedLocal] = useState(new Set());
  const [treatmentDates, setTreatmentDates]           = useState({});
  const [treatmentTooltip, setTreatmentTooltip]       = useState(null);
  const [eventWeekData, setEventWeekData]             = useState({ reminders: [], markers: {} });
  const [eventDismissed, setEventDismissed]           = useState(new Set());
  const [eventTooltip, setEventTooltip]               = useState(null);
  const [monthYear, setMonthYear]                     = useState({ year: new Date().getFullYear(), month: new Date().getMonth() });
  const [monthTreatmentDates, setMonthTreatmentDates] = useState({});

  const load = useCallback(() => {
    if (!patient) return;
    setLoading(true);
    api.get(`/exercises/${patient.id}`)
      .then(r => setExercises(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patient]);

  useEffect(() => { load(); }, [load]);

  const dayKey = dateToKey(selectedDay);
  const dayExercises = exercises.filter(e => e.day_key === dayKey);

  const weekStart = sundayOfWeekOffset(weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Load treatment reminders + cycle dates for the current week
  useEffect(() => {
    if (!patient) return;
    const ws = localDateStr(weekDays[0]);
    const we = localDateStr(weekDays[6]);
    api.get(`/treatments/${patient.id}/reminders?week_start=${ws}&week_end=${we}`)
      .then(r => setReminders(r.data))
      .catch(() => setReminders([]));
    api.get(`/treatments/${patient.id}/cycles?week_start=${ws}&week_end=${we}`)
      .then(r => setTreatmentDates(r.data))
      .catch(() => setTreatmentDates({}));
    api.get(`/events/${patient.id}/week?week_start=${ws}&week_end=${we}`)
      .then(r => setEventWeekData(r.data))
      .catch(() => setEventWeekData({ reminders: [], markers: {} }));
    setEventDismissed(new Set());
  }, [patient, weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load treatment cycle dates for the month view
  useEffect(() => {
    if (calView !== 'month' || !patient) return;
    const firstDay = new Date(monthYear.year, monthYear.month, 1);
    const lastDay  = new Date(monthYear.year, monthYear.month + 1, 0);
    const ws = localDateStr(firstDay);
    const we = localDateStr(lastDay);
    api.get(`/treatments/${patient.id}/cycles?week_start=${ws}&week_end=${we}`)
      .then(r => setMonthTreatmentDates(r.data))
      .catch(() => setMonthTreatmentDates({}));
  }, [patient, calView, monthYear.year, monthYear.month]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function dismissReminder(reminder) {
    setDismissedLocal(prev => new Set([...prev, `${reminder.rule_id}|${reminder.occurrence_date}`]));
    await api.post(`/treatments/${patient.id}/dismiss`, {
      rule_id: reminder.rule_id,
      occurrence_date: reminder.occurrence_date,
    }).catch(console.error);
  }

  const visibleReminders = reminders.filter(
    r => !dismissedLocal.has(`${r.rule_id}|${r.occurrence_date}`)
  );
  const todayStr = localDateStr(today());

  function hasExercise(date) {
    const k = dateToKey(date);
    return exercises.some(e => e.day_key === k);
  }

  function hasReport(date) { return false; } // Reports handled separately

  async function addExercise(form) {
    await api.post(`/exercises/${patient.id}`, {
      ...form,
      day_key: dayKey,
      instance_id: uid(),
    });
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

  // ── Copy program ──────────────────────────────────────────────────────────
  // copyModal: null | { mode: 'exercise'|'day'|'week', sourceLabel, srcDayKey, instanceId }
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn btn-ghost${calView === 'week' ? ' active-tab' : ''}`} onClick={() => setCalView('week')}>Week</button>
          <button className={`btn btn-ghost${calView === 'month' ? ' active-tab' : ''}`} onClick={() => setCalView('month')}>Month</button>
          <button className="btn btn-ghost" onClick={() => setCopyModal({ mode: 'day', sourceLabel: `${DAYS[selectedDay.getDay()].slice(0,3)} — ${dayExercises.length} exercise${dayExercises.length !== 1 ? 's' : ''}`, srcDayKey: dayKey })}>📋 Day</button>
          <button className="btn btn-ghost" onClick={() => setCopyModal({ mode: 'week' })}>📋 Week</button>
        </div>
      </div>

      {calView === 'month' ? (
        <MonthView
          exercises={exercises}
          treatmentDates={monthTreatmentDates}
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

          {/* Treatment reminder banner */}
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
                      <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>{r.message}</div>
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
              const txList     = treatmentDates[dateStr];
              const hasTx      = txList && txList.length > 0;
              const evList     = eventWeekData.markers[dateStr];
              const hasEv      = evList && evList.length > 0;
              // highest priority colour for the dot
              const evPriority = hasEv
                ? (evList.some(e => e.priority === 'important') ? 'important'
                   : evList.some(e => e.priority === 'caution') ? 'caution' : 'info')
                : null;
              return (
                <button key={key}
                  className={`day-tab${isSelected ? ' active' : ''}`}
                  onClick={() => setSelectedDay(d)}
                  style={{ position: 'relative', paddingBottom: (hasTx || hasEv) ? 4 : undefined }}
                >
                  {DAYS[d.getDay()].slice(0, 3)} {d.getDate()}
                  {isToday && !isSelected && <span style={{ position: 'absolute', top: -4, right: -4, width: 8, height: 8, borderRadius: '50%', background: 'var(--blue)', border: '2px solid white' }} />}
                  {hasPlan && <span className="rdot" />}
                  {hasTx && (
                    <span
                      style={{ display: 'block', fontSize: 11, lineHeight: 1, marginTop: 3, textAlign: 'center' }}
                      onMouseEnter={e => { e.stopPropagation(); setTreatmentTooltip({ dateStr, rect: e.currentTarget.getBoundingClientRect() }); }}
                      onMouseLeave={() => setTreatmentTooltip(null)}
                    >🎗️</span>
                  )}
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

          {/* Treatment date tooltip */}
          {treatmentTooltip && treatmentDates[treatmentTooltip.dateStr] && (
            <div style={{
              position: 'fixed',
              top: treatmentTooltip.rect.bottom + 8,
              left: Math.min(treatmentTooltip.rect.left, window.innerWidth - 260),
              zIndex: 9999,
              background: '#fff',
              border: '1px solid #fca5a5',
              borderRadius: 10,
              padding: '10px 14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
              minWidth: 200,
              maxWidth: 260,
              pointerEvents: 'none',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                🎗️ Oncology Treatment
              </div>
              {treatmentDates[treatmentTooltip.dateStr].map((t, i) => (
                <div key={i} style={{ marginBottom: i < treatmentDates[treatmentTooltip.dateStr].length - 1 ? 8 : 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{t.name}</div>
                  {t.treatment_type && <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{t.treatment_type}</div>}
                  {t.notes && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>📝 {t.notes}</div>}
                </div>
              ))}
            </div>
          )}

          {/* Clinical event day tooltip */}
          {eventTooltip && eventWeekData.markers[eventTooltip.dateStr] && (
            <div style={{
              position: 'fixed',
              top: eventTooltip.rect.bottom + 8,
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
                      {isReminder && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--gray-400)', marginLeft: 4 }}>
                        ({ev.kind === 'before' ? `${ev.offset_value} ${ev.offset_unit} before` : `${ev.offset_value} ${ev.offset_unit} after`})
                      </span>}
                    </div>
                    {ev.event_type && <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{ev.event_type}</div>}
                    {ev.notes && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>📝 {ev.notes}</div>}
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
                    {exs.map(ex => (
                      <ExerciseCard key={ex.instance_id} ex={ex}
                        onEdit={updated => editExercise(ex, updated)}
                        onDelete={() => deleteExercise(ex)}
                        onCopy={() => setCopyModal({ mode: 'exercise', sourceLabel: ex.name, srcDayKey: dayKey, instanceId: ex.instance_id })}
                      />
                    ))}
                  </div>
                );
              })}
              <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Exercise</button>
            </>
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

      {/* Copy modal */}
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
    </div>
  );
}
