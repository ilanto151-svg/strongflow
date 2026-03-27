import { useState, useEffect, Fragment } from 'react';
import api from '../../utils/api';
import { DAYS, TYPE_META, RPE } from '../../constants';
import { dateToKey, keyToDate, sundayOfWeekOffset, weekSunday, today, isSameDay, fmtDate } from '../../utils/calendar';
import Lightbox from '../shared/Lightbox';

const DONE_KEY   = 'om_done_ex';
const SRPE_KEY   = 'om_session_rpe';
const ACTUAL_KEY = 'om_actual_data';

function loadDone()   { try { return JSON.parse(localStorage.getItem(DONE_KEY)   || '{}'); } catch { return {}; } }
function saveDone(d)  { localStorage.setItem(DONE_KEY,   JSON.stringify(d)); }
function loadSRpe()   { try { return JSON.parse(localStorage.getItem(SRPE_KEY)   || '{}'); } catch { return {}; } }
function saveSRpe(d)  { localStorage.setItem(SRPE_KEY,   JSON.stringify(d)); }
function loadActual() { try { return JSON.parse(localStorage.getItem(ACTUAL_KEY) || '{}'); } catch { return {}; } }
function saveActual(d){ localStorage.setItem(ACTUAL_KEY, JSON.stringify(d)); }

// Build a name→{sets,reps,weight,date} map from submitted reports (most recent first)
function buildPrevByName(reports) {
  const byName = {};
  [...reports]
    .filter(r => r.session_data && r.submitted_at)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    .forEach(r => {
      const date = r.submitted_at.split('T')[0];
      Object.values(r.session_data).forEach(ex => {
        if (!byName[ex.name] && (ex.sets || ex.reps || ex.weight)) {
          byName[ex.name] = { sets: ex.sets || '', reps: ex.reps || '', weight: ex.weight || '', date };
        }
      });
    });
  return byName;
}

export default function TodayView({ patient, exercises, reports = [], reload }) {
  const [selectedDate, setSelectedDate] = useState(today());
  const [weekOffset, setWeekOffset]     = useState(0);
  const [done, setDone]                 = useState(loadDone);
  const [sessionRpe, setSessionRpe]     = useState(loadSRpe);
  const [actualData, setActualData]     = useState(loadActual);
  const [lightbox, setLightbox]         = useState(null);
  const [savingReport, setSavingReport] = useState(false);
  const [workoutSaved, setWorkoutSaved] = useState(false);
  const [actualDirty, setActualDirty]   = useState(false);
  const [savingActual, setSavingActual] = useState(false);
  const [actualSaved, setActualSaved]   = useState(false);
  // Session-local override — populated after each submit so same-session cross-day suggestions stay fresh
  const [sessionPrev, setSessionPrev]   = useState({});
  const [dismissed, setDismissed]       = useState(() => new Set());

  // Therapist-defined planned session RPE for the selected day
  const [plannedRpe, setPlannedRpe] = useState(null);

  // Derive previous values from server reports (reliable across weeks/devices/sessions)
  const prevByName = buildPrevByName(reports);

  // Merge: prefer more recent of server data vs same-session override
  function getPrev(name) {
    const server  = prevByName[name];
    const session = sessionPrev[name];
    if (!server && !session) return null;
    if (!server) return session;
    if (!session) return server;
    return session.date >= server.date ? session : server;
  }

  const weekStart = sundayOfWeekOffset(weekOffset);
  const weekDays  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });

  const dayKey = dateToKey(selectedDate);
  const dayDateStr = selectedDate.toISOString().split('T')[0];
  const dayExercises = exercises.filter(e => e.day_key === dayKey);

  // Group by type
  const groups = {};
  dayExercises.forEach(ex => {
    if (!groups[ex.type]) groups[ex.type] = [];
    groups[ex.type].push(ex);
  });

  // Reset per-day state when date changes
  useEffect(() => {
    setDismissed(new Set());
    setActualDirty(false);
    setActualSaved(false);
    setWorkoutSaved(false);
  }, [dayDateStr]);

  // Fetch therapist-defined planned RPE for this day
  useEffect(() => {
    if (!patient) return;
    api.get(`/exercises/${patient.id}/day-plan/${dayKey}`)
      .then(r => setPlannedRpe(r.data.planned_rpe ?? null))
      .catch(() => setPlannedRpe(null));
  }, [patient.id, dayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleDone(instId) {
    const k = `${dayDateStr}_${instId}`;
    const next = { ...done, [k]: !done[k] };
    setDone(next);
    saveDone(next);
  }

  function isDone(instId) { return !!done[`${dayDateStr}_${instId}`]; }

  function setTypeRpe(type, val) {
    const k = `${dayDateStr}_${type}`;
    const next = { ...sessionRpe, [k]: val };
    setSessionRpe(next);
    saveSRpe(next);
  }
  function getTypeRpe(type) { return sessionRpe[`${dayDateStr}_${type}`] ?? ''; }

  function getActual(instId, field) { return actualData[`${dayDateStr}_${instId}`]?.[field] ?? ''; }
  function setActual(instId, field, val) {
    const k = `${dayDateStr}_${instId}`;
    const next = { ...actualData, [k]: { ...actualData[k], [field]: val } };
    setActualData(next);
    saveActual(next);
    setActualDirty(true);
    setActualSaved(false);
  }

  async function submitActualData() {
    setSavingActual(true);
    try {
      const sessionData = {};
      dayExercises.filter(e => e.type === 'resistance').forEach(ex => {
        const sets   = getActual(ex.instance_id, 'sets');
        const reps   = getActual(ex.instance_id, 'reps');
        const weight = getActual(ex.instance_id, 'weight');
        if (sets || reps || weight) {
          sessionData[ex.instance_id] = {
            name: ex.name, sets, reps, weight,
            p_sets: ex.sets || '', p_reps: ex.reps || '', p_weight: ex.weight || '',
          };
        }
      });
      await api.post(`/reports/${patient.id}`, { day_key: dayKey, session_data: sessionData });
      const nextSession = { ...sessionPrev };
      Object.values(sessionData).forEach(ex => {
        nextSession[ex.name] = { sets: ex.sets, reps: ex.reps, weight: ex.weight, date: dayDateStr };
      });
      setSessionPrev(nextSession);
      setActualDirty(false);
      setActualSaved(true);
    } catch (e) {
      alert('Error saving: ' + (e.response?.data?.error || e.message));
    } finally {
      setSavingActual(false);
    }
  }

  async function submitWorkoutReport() {
    setSavingReport(true);
    setWorkoutSaved(false);
    try {
      const dayTypes = Object.keys(groups);

      const daySessionRpe = Object.fromEntries(
        Object.entries(sessionRpe).filter(([key, value]) => {
          if (!key.startsWith(`${dayDateStr}_`)) return false;
          const type = key.replace(`${dayDateStr}_`, '');
          if (!dayTypes.includes(type)) return false;
          if (value === '' || value == null) return false;
          return true;
        })
      );

      // Build session_data: per-exercise actual sets/reps/weight for resistance exercises today
      const sessionData = {};
      dayExercises.filter(e => e.type === 'resistance').forEach(ex => {
        const sets   = getActual(ex.instance_id, 'sets');
        const reps   = getActual(ex.instance_id, 'reps');
        const weight = getActual(ex.instance_id, 'weight');
        if (sets || reps || weight) {
          sessionData[ex.instance_id] = {
            name: ex.name,
            sets, reps, weight,
            p_sets: ex.sets || '', p_reps: ex.reps || '', p_weight: ex.weight || '',
          };
        }
      });

      await api.post(`/reports/${patient.id}`, {
        day_key: dayKey,
        session_rpe: daySessionRpe,
        ...(Object.keys(sessionData).length > 0 && { session_data: sessionData }),
      });

      if (Object.keys(sessionData).length > 0) {
        const nextSession = { ...sessionPrev };
        Object.values(sessionData).forEach(ex => {
          nextSession[ex.name] = { sets: ex.sets, reps: ex.reps, weight: ex.weight, date: dayDateStr };
        });
        setSessionPrev(nextSession);
      }

      setWorkoutSaved(true);
    } catch (e) {
      alert('Error saving workout report: ' + (e.response?.data?.error || e.message));
    } finally {
      setSavingReport(false);
    }
  }

  const totalExercises = dayExercises.length;
  const doneCount = dayExercises.filter(ex => isDone(ex.instance_id)).length;
  const pct = totalExercises > 0 ? Math.round((doneCount / totalExercises) * 100) : 0;

  function hasAny(date) { return exercises.some(e => e.day_key === dateToKey(date)); }

  // Same-calendar-week Sunday (used to gate suggestions to current week only)
  const thisWeekSunTime = weekSunday(new Date(dayDateStr)).getTime();

  // Suggest only when: same calendar week as the previous entry, different day, no values entered yet today
  const suggestions = dayExercises.filter(ex => {
    if (ex.type !== 'resistance') return false;
    const prev = getPrev(ex.name);
    if (!prev) return false;
    // Must be a different day
    if (prev.date === dayDateStr) return false;
    // Must be within the same calendar week (Sun–Sat)
    if (weekSunday(new Date(prev.date)).getTime() !== thisWeekSunTime) return false;
    if (dismissed.has(ex.instance_id)) return false;
    if (!prev.sets && !prev.reps && !prev.weight) return false;
    // Only suggest if patient hasn't typed anything for today
    return !getActual(ex.instance_id, 'sets') && !getActual(ex.instance_id, 'reps') && !getActual(ex.instance_id, 'weight');
  });

  async function applySuggestions() {
    let next = { ...actualData };
    suggestions.forEach(ex => {
      const prev = getPrev(ex.name);
      const k = `${dayDateStr}_${ex.instance_id}`;
      next[k] = { sets: prev.sets || '', reps: prev.reps || '', weight: prev.weight || '' };
    });
    setActualData(next);
    saveActual(next);
    setSavingActual(true);
    try {
      const sessionData = {};
      suggestions.forEach(ex => {
        const prev = getPrev(ex.name);
        sessionData[ex.instance_id] = {
          name: ex.name,
          sets: prev.sets || '', reps: prev.reps || '', weight: prev.weight || '',
          p_sets: ex.sets || '', p_reps: ex.reps || '', p_weight: ex.weight || '',
        };
      });
      await api.post(`/reports/${patient.id}`, { day_key: dayKey, session_data: sessionData });
      const nextSession = { ...sessionPrev };
      Object.values(sessionData).forEach(ex => {
        nextSession[ex.name] = { sets: ex.sets, reps: ex.reps, weight: ex.weight, date: dayDateStr };
      });
      setSessionPrev(nextSession);
      setDismissed(prev => new Set([...prev, ...suggestions.map(e => e.instance_id)]));
      setActualSaved(true);
      setActualDirty(false);
    } catch (e) {
      alert('Error: ' + (e.response?.data?.error || e.message));
    } finally {
      setSavingActual(false);
    }
  }

  function dismissSuggestions() {
    setDismissed(prev => new Set([...prev, ...suggestions.map(e => e.instance_id)]));
  }

  return (
    <div>
      {/* Patient hero */}
      <div className="p-hero">
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{patient.name}</div>
          {patient.diagnosis && <div style={{ fontSize: 13, opacity: 0.85 }}>{patient.diagnosis}</div>}
        </div>
        {totalExercises > 0 && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 26, fontWeight: 800 }}>{pct}%</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{doneCount}/{totalExercises} done</div>
          </div>
        )}
      </div>

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button className="icon-btn" onClick={() => setWeekOffset(o => o - 1)}>◀</button>
        <div style={{ flex: 1, display: 'flex', gap: 6, overflow: 'auto', paddingBottom: 2 }}>
          {weekDays.map(d => {
            const k = dateToKey(d);
            const isToday = isSameDay(d, today());
            const isSelected = isSameDay(d, selectedDate);
            const hasPlan = hasAny(d);
            return (
              <button key={k} className={`pday-tab${isSelected ? ' active' : ''}`} onClick={() => setSelectedDate(d)}
                style={{ whiteSpace: 'nowrap', position: 'relative' }}
              >
                {DAYS[d.getDay()].slice(0, 3)} {d.getDate()}
                {isToday && <span style={{ fontSize: 8 }}> •</span>}
                {hasPlan && !isSelected && <span className="rdot" />}
              </button>
            );
          })}
        </div>
        <button className="icon-btn" onClick={() => setWeekOffset(o => o + 1)}>▶</button>
      </div>

      {/* Progress bar */}
      {totalExercises > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? 'var(--green-l)' : 'var(--blue)', borderRadius: 6, transition: 'width .3s' }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
            {isSameDay(selectedDate, today()) ? 'Today' : fmtDate(selectedDate)} — {pct === 100 ? '🎉 All done!' : `${doneCount} of ${totalExercises} completed`}
          </div>
        </div>
      )}

      {/* ── Exercise plan ─────────────────────────────────────────────────── */}
      {dayExercises.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🌿</div>
          <div>No exercises scheduled for this day.</div>
        </div>
      ) : (
        Object.entries(groups).map(([type, exs]) => {
          const meta = TYPE_META[type];
          const BODY_ORDER = ['רגליים', 'חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית', 'בטן'];

          const sortedExs =
            type === 'resistance'
              ? [...exs].sort((a, b) => {
                  const ai = BODY_ORDER.indexOf(a.body_area || '');
                  const bi = BODY_ORDER.indexOf(b.body_area || '');
                  const aIndex = ai === -1 ? 999 : ai;
                  const bIndex = bi === -1 ? 999 : bi;
                  return aIndex - bIndex;
                })
              : exs;

          return (
            <div key={type} style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <span style={{ fontWeight: 700, color: meta.color }}>{meta.label}</span>
              </div>

              {type === 'resistance' ? (
                <>
                  {/* Suggestion banner — previous session values */}
                  {suggestions.length > 0 && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e', marginBottom: 8 }}>
                        💡 Based on your last session:
                      </div>
                      {suggestions.map(ex => {
                        const prev = getPrev(ex.name);
                        const parts = [prev.sets && `${prev.sets} sets`, prev.reps && `${prev.reps} reps`, prev.weight && prev.weight].filter(Boolean);
                        const dateLabel = new Date(prev.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
                        return (
                          <div key={ex.instance_id} style={{ fontSize: 13, color: '#78350f', marginBottom: 3 }}>
                            <strong>{ex.name}:</strong> {parts.join(' × ')}
                            <span style={{ fontSize: 11, color: '#a16207', marginLeft: 6 }}>({dateLabel})</span>
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <button className="btn" onClick={applySuggestions} disabled={savingActual}
                          style={{ background: '#d97706', color: '#fff', padding: '6px 16px', fontSize: 13 }}>
                          {savingActual ? 'Applying…' : '✓ Apply & send to therapist'}
                        </button>
                        <button className="btn" onClick={dismissSuggestions}
                          style={{ background: 'var(--gray-100)', color: 'var(--gray-600)', padding: '6px 16px', fontSize: 13 }}>
                          Keep original
                        </button>
                      </div>
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table className="resistance-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th>Exercise</th>
                          <th>Body</th>
                          <th>Sets ✏️</th>
                          <th>Reps ✏️</th>
                          <th>Weight ✏️</th>
                          <th>Rest</th>
                          <th>Equipment</th>
                          <th>RPE</th>
                          <th>Done</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedExs.map((ex, index) => {
                          const done_ = isDone(ex.instance_id);
                          const prev = sortedExs[index - 1];
                          const newBodySection = !prev || prev.body_area !== ex.body_area;

                          return (
                            <Fragment key={ex.instance_id}>
                              {newBodySection && ex.body_area && (
                                <tr className="body-group">
                                  <td colSpan={10}>{ex.body_area}</td>
                                </tr>
                              )}

                              <tr className={done_ ? 'done' : ''}>
                                <td style={{ width: 60 }}>
                                  <button className="p-ex-icon-btn" onClick={() => setLightbox(ex)}>
                                    {ex.img_data || ex.img_url ? (
                                      <img src={ex.img_data || ex.img_url} alt={ex.name}
                                        style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                                    ) : (
                                      <div className="ex-icon" style={{ background: meta.bg, color: meta.color, width: 44, height: 44 }}>
                                        {ex.image || meta.icon}
                                      </div>
                                    )}
                                  </button>
                                </td>

                                <td style={{ fontWeight: 700, minWidth: 220 }}>
                                  <div>{ex.name}</div>
                                  {ex.description && (
                                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>{ex.description}</div>
                                  )}
                                  {ex.link && (
                                    <div style={{ marginTop: 4 }}>
                                      <a href={ex.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--blue)' }}>
                                        🔗 Reference
                                      </a>
                                    </div>
                                  )}
                                </td>

                                <td>{ex.body_area || '-'}</td>
                                <td>
                                  <input className="actual-input" type="text" inputMode="numeric"
                                    value={getActual(ex.instance_id, 'sets')}
                                    onChange={e => setActual(ex.instance_id, 'sets', e.target.value)}
                                    placeholder={ex.sets || '—'} />
                                </td>
                                <td>
                                  <input className="actual-input" type="text" inputMode="numeric"
                                    value={getActual(ex.instance_id, 'reps')}
                                    onChange={e => setActual(ex.instance_id, 'reps', e.target.value)}
                                    placeholder={ex.reps || '—'} />
                                </td>
                                <td>
                                  <input className="actual-input" type="text"
                                    value={getActual(ex.instance_id, 'weight')}
                                    onChange={e => setActual(ex.instance_id, 'weight', e.target.value)}
                                    placeholder={ex.weight || '—'} />
                                </td>
                                <td>{ex.rest || ex.rest_seconds || '-'}</td>
                                <td>{ex.equipment || '-'}</td>
                                <td>{ex.rpe ?? '-'}</td>

                                <td>
                                  <button className={`check-btn${done_ ? ' done' : ''}`} onClick={() => toggleDone(ex.instance_id)}>
                                    {done_ ? '✓' : '○'}
                                  </button>
                                </td>
                              </tr>

                              {ex.notes && (
                                <tr className="resistance-extra">
                                  <td></td>
                                  <td colSpan={9} style={{ fontSize: 13, color: 'var(--gray-500)' }}>📝 {ex.notes}</td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Send exercise updates button — appears when patient edits any value */}
                  {(actualDirty || actualSaved) && (
                    <div style={{ marginTop: 10 }}>
                      {actualDirty && (
                        <button className="btn" onClick={submitActualData} disabled={savingActual}
                          style={{ width: '100%', background: '#1d4ed8', color: '#fff' }}>
                          {savingActual ? 'Sending…' : '📤 Send updated sets / reps / weight to therapist'}
                        </button>
                      )}
                      {actualSaved && !actualDirty && (
                        <div style={{ background: '#ecfdf5', border: '1px solid #86efac', borderRadius: 10, padding: '10px 14px', color: '#166534', fontSize: 13, fontWeight: 600 }}>
                          ✔ Exercise data sent to your therapist
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                sortedExs.map(ex => {
                  const done_ = isDone(ex.instance_id);
                  const intervals = ex.intervals
                    ? (() => { try { return JSON.parse(ex.intervals); } catch { return []; } })()
                    : [];

                  return (
                    <div key={ex.instance_id} className={`pt-card${done_ ? ' done' : ''}`}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                        <button className="p-ex-icon-btn" onClick={() => setLightbox(ex)}>
                          {ex.img_data || ex.img_url ? (
                            <img src={ex.img_data || ex.img_url} alt={ex.name}
                              style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} />
                          ) : (
                            <div className="ex-icon" style={{ background: meta.bg, color: meta.color, width: 44, height: 44 }}>
                              {ex.image || meta.icon}
                            </div>
                          )}
                        </button>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{ex.name}</div>
                          {ex.description && (
                            <div style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ex.description}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                            {ex.sets && <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>💪 {ex.sets}×{ex.reps}</span>}
                            {ex.weight && <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>⚖️ {ex.weight}</span>}
                            {ex.duration && <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>⏱ {ex.duration}</span>}
                            {ex.equipment && <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>🔧 {ex.equipment}</span>}
                            {ex.rpe != null && ex.rpe !== '' && <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>RPE {ex.rpe}</span>}
                          </div>
                        </div>

                        <button className={`check-btn${done_ ? ' done' : ''}`} onClick={() => toggleDone(ex.instance_id)}>
                          {done_ ? '✓' : '○'}
                        </button>
                      </div>

                      {intervals.length > 0 && (
                        <div style={{ padding: '0 16px 14px' }}>
                          <table className="interval-table">
                            <thead><tr><th>Intensity</th><th>Duration</th><th>RPE</th><th>Target HR</th></tr></thead>
                            <tbody>
                              {intervals.map((row, i) => (
                                <tr key={row.id || i}>
                                  <td>{row.intensity}</td>
                                  <td>{row.duration}</td>
                                  <td>{row.rpe != null && row.rpe !== '' ? `${row.rpe} – ${RPE[row.rpe] || ''}` : '—'}</td>
                                  <td>{row.target_hr || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {ex.notes && (
                        <div style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--gray-500)' }}>📝 {ex.notes}</div>
                      )}

                      {ex.link && (
                        <div style={{ padding: '0 16px 12px' }}>
                          <a href={ex.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--blue)' }}>
                            🔗 Reference
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          );
        })
      )}

      {/* ── Therapist's planned session RPE ──────────────────────────────── */}
      {plannedRpe != null && (
        <div style={{
          marginTop: 20,
          padding: '16px 18px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: 14,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>
            🎯 Your therapist's planned session effort
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span style={{ fontSize: 40, fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{plannedRpe}</span>
            <span style={{ fontSize: 17, fontWeight: 700, color: '#166534' }}>{RPE[plannedRpe]}</span>
          </div>
          <div style={{ fontSize: 12, color: '#15803d', marginTop: 6 }}>
            RPE {plannedRpe} / 10 — aim to keep your overall session effort at this level
          </div>
        </div>
      )}

      {/* ── Patient session RPE report ────────────────────────────────────── */}
      {dayExercises.length > 0 && (
        <div style={{ marginTop: 20 }}>
          {Object.entries(groups).map(([type]) => {
            const meta = TYPE_META[type];
            const typeRpe = getTypeRpe(type);
            return (
              <div key={type} className="metric-card" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>
                  Overall {meta.label} session RPE
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <input type="range" min={0} max={10} value={typeRpe || 0}
                    className={type === 'resistance' ? 'amber' : type === 'aerobic' ? 'blue' : 'green'}
                    onChange={e => setTypeRpe(type, +e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--blue)', minWidth: 24 }}>{typeRpe || 0}</span>
                </div>
                {typeRpe !== '' && typeRpe != null && (
                  <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{RPE[typeRpe] || ''}</div>
                )}
              </div>
            );
          })}

          <div style={{ marginTop: 4 }}>
            <button
              className="btn"
              onClick={submitWorkoutReport}
              disabled={savingReport}
              style={{ width: '100%' }}
            >
              {savingReport ? 'Saving...' : 'Save workout report'}
            </button>
            {workoutSaved && (
              <div style={{
                marginTop: 12,
                background: '#ecfdf5',
                border: '1px solid #86efac',
                borderRadius: 12,
                padding: '12px 14px',
                color: '#166534',
              }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>✔ Workout report saved</div>
                <div style={{ fontSize: 13 }}>Session RPE saved for today.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {lightbox && <Lightbox exercise={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
