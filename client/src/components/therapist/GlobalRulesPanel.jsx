import { useState, useEffect, useCallback } from 'react';
import Modal from '../shared/Modal';
import { uid } from '../../utils/calendar';

const BODY_AREAS = ['רגליים', 'חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית', 'בטן'];

const STR_BLANK = { sets: '', reps: '', weight: '', rest: '' };
const AER_BLANK = { duration: '', distance: '', speed: '', rest: '' };
const BLANK_INTERVAL = () => ({ id: uid(), intensity: '', duration: '', rpe: '', target_hr: '', equipment: '', incline: '', speed: '', description: '' });

const INTENSITY_OPTIONS = ['Warm-up', 'Easy', 'Moderate', 'Vigorous', 'Cool-down', 'Recovery', 'Sprint', 'Rest'];
const EQUIP_OPTIONS     = ['Treadmill', 'Bike (stationary)', 'Elliptical', 'Stairs / StepMill', 'Outdoor', 'Other'];

// ── localStorage helpers ──────────────────────────────────────────────────────
function rulesKey(pid)      { return `om_rules2_${pid}`; }
export function autoFilledKey(pid)  { return `om_autofilled_${pid}`; }
function overriddenKey(pid) { return `om_overridden_${pid}`; }

export function loadRules(pid) {
  try { return JSON.parse(localStorage.getItem(rulesKey(pid)) || '{}'); } catch { return {}; }
}
function saveRulesStore(pid, rules) {
  localStorage.setItem(rulesKey(pid), JSON.stringify(rules));
}
export function loadAutoFilled(pid) {
  try { return new Set(JSON.parse(localStorage.getItem(autoFilledKey(pid)) || '[]')); } catch { return new Set(); }
}
export function saveAutoFilled(pid, ids) {
  localStorage.setItem(autoFilledKey(pid), JSON.stringify([...ids]));
}
export function clearAutoFilled(pid) {
  localStorage.removeItem(autoFilledKey(pid));
}
export function loadOverridden(pid) {
  try { return new Set(JSON.parse(localStorage.getItem(overriddenKey(pid)) || '[]')); } catch { return new Set(); }
}
export function saveOverridden(pid, ids) {
  localStorage.setItem(overriddenKey(pid), JSON.stringify([...ids]));
}

// ── Rule storage helpers ──────────────────────────────────────────────────────
function scopeKey(level, dayKey, bodyArea, weekOffset, weekType, exerciseId) {
  if (level === 'day')      return `day:${dayKey}`;
  if (level === 'dayGroup') return `dayGroup:${dayKey}:${bodyArea}`;
  if (level === 'week')     return `week:${weekOffset}:${weekType}`;
  if (level === 'exercise') return `exercise:${exerciseId}`;
  return 'unknown';
}

function getRuleForScope(rules, level, dayKey, bodyArea, weekOffset, weekType, exerciseId) {
  const k = scopeKey(level, dayKey, bodyArea, weekOffset, weekType, exerciseId);
  return rules.scopes?.[k] || {};
}

function persistRule(pid, level, dayKey, bodyArea, weekOffset, weekType, exerciseId, rule) {
  const rules = loadRules(pid);
  if (!rules.scopes) rules.scopes = {};
  rules.scopes[scopeKey(level, dayKey, bodyArea, weekOffset, weekType, exerciseId)] = { ...rule };
  saveRulesStore(pid, rules);
}

function clearRule(pid, level, dayKey, bodyArea, weekOffset, weekType, exerciseId) {
  const rules = loadRules(pid);
  if (!rules.scopes) return;
  delete rules.scopes[scopeKey(level, dayKey, bodyArea, weekOffset, weekType, exerciseId)];
  saveRulesStore(pid, rules);
}

// ── Interval expansion ────────────────────────────────────────────────────────
// Expand a pattern [{duration,speed,rpe,target_hr,description}, ...] × repeat → JSON string
function expandIntervals(intervalPattern, repeat) {
  const items = [];
  for (let r = 0; r < Math.max(1, repeat); r++) {
    for (const iv of intervalPattern) {
      items.push({ ...iv, id: uid() });
    }
  }
  return JSON.stringify(items);
}

function parseIntervals(str) {
  if (!str || str === '[]') return [];
  try { return JSON.parse(str); } catch { return []; }
}

// ── Conflict / fill computation ───────────────────────────────────────────────
function filterByScope(exercises, level, dayKey, bodyArea, weekOffset, weekType, exerciseId) {
  return exercises.filter(ex => {
    if (level === 'exercise') return ex.instance_id === exerciseId;
    if (level === 'day')      return ex.day_key === dayKey;
    if (level === 'dayGroup') return ex.day_key === dayKey && ex.body_area === bodyArea;
    if (level === 'week') {
      const inWeek = ex.day_key >= weekOffset * 7 && ex.day_key <= weekOffset * 7 + 6;
      const typeOk = weekType ? ex.type === weekType : true;
      return inWeek && typeOk;
    }
    return true;
  });
}

function scalarFieldsFor(ex) {
  return ex.type === 'resistance'
    ? ['sets', 'reps', 'weight', 'rest']
    : ['duration', 'distance', 'speed', 'rest'];
}

// rule: { ...scalarFields, intervalExpanded?: string }
export function computeAffectedSplit(exercises, rule, level, dayKey, bodyArea, weekOffset, weekType, exerciseId) {
  const matching    = filterByScope(exercises, level, dayKey, bodyArea, weekOffset, weekType, exerciseId);
  const willFill     = [];
  const willConflict = [];

  matching.forEach(ex => {
    const fields     = scalarFieldsFor(ex);
    const toFill     = fields.filter(f => rule[f] && !ex[f]);
    const toConflict = fields.filter(f => rule[f] && ex[f] && String(ex[f]) !== String(rule[f]));

    // Interval pattern conflict/fill (aerobic only)
    if (rule.intervalExpanded && (ex.type === 'aerobic' || ex.type === 'other')) {
      const existing = parseIntervals(ex.intervals);
      if (!existing.length) {
        toFill.push('intervals');
      } else {
        toConflict.push('intervals');
      }
    }

    const updates = {
      ...Object.fromEntries(toFill.filter(f => f !== 'intervals').map(f => [f, rule[f]])),
      ...Object.fromEntries(toConflict.filter(f => f !== 'intervals').map(f => [f, rule[f]])),
    };
    if (rule.intervalExpanded && toFill.includes('intervals')) updates.intervals = rule.intervalExpanded;
    if (rule.intervalExpanded && toConflict.includes('intervals')) updates.intervals = rule.intervalExpanded;

    if (toFill.length) {
      const fillUpdates = { ...Object.fromEntries(toFill.filter(f => f !== 'intervals').map(f => [f, rule[f]])) };
      if (toFill.includes('intervals')) fillUpdates.intervals = rule.intervalExpanded;
      willFill.push({ ex, fields: toFill, updates: fillUpdates });
    }
    if (toConflict.length) {
      const conflictUpdates = { ...Object.fromEntries(toConflict.filter(f => f !== 'intervals').map(f => [f, rule[f]])) };
      if (toConflict.includes('intervals')) conflictUpdates.intervals = rule.intervalExpanded;
      willConflict.push({
        ex,
        fields:        toConflict,
        currentValues: Object.fromEntries(toConflict.map(f => f === 'intervals'
          ? [f, `${parseIntervals(ex.intervals).length} intervals`]
          : [f, ex[f]]
        )),
        updates: conflictUpdates,
      });
    }
  });

  return { willFill, willConflict };
}

// Legacy compat
export function computeAffected(exercises, rule, level, dayKey, bodyArea) {
  const { willFill } = computeAffectedSplit(exercises, rule, level, dayKey, bodyArea, 0, null, null);
  return willFill;
}

// ── Conflict resolution modal ─────────────────────────────────────────────────
function ConflictModal({ willFill, willConflict, onApplyAll, onKeepExisting, onClose }) {
  const [choosing, setChoosing] = useState(false);
  const [choices, setChoices] = useState(
    () => Object.fromEntries(willConflict.map(({ ex }) => [ex.instance_id, false]))
  );

  function toggle(id) { setChoices(c => ({ ...c, [id]: !c[id] })); }

  function applyChoices() {
    const chosen = willConflict.filter(({ ex }) => choices[ex.instance_id]);
    onApplyAll([...willFill, ...chosen]);
  }

  const fieldLabel = f => f === 'intervals' ? 'interval pattern' : f;

  if (choosing) {
    return (
      <Modal title="Choose per exercise" onClose={onClose} size="modal-sm"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setChoosing(false)}>Back</button>
          <button className="btn btn-primary" onClick={applyChoices}>Apply to selected</button>
        </>}
      >
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>
          Tick the exercises you want to update. Unticked exercises keep their current values.
        </div>
        {willConflict.map(({ ex, fields, currentValues, updates }) => (
          <label key={ex.instance_id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            background: choices[ex.instance_id] ? '#eff6ff' : '#f9fafb',
            border: `1px solid ${choices[ex.instance_id] ? '#bfdbfe' : '#e5e7eb'}`,
            borderRadius: 8, padding: '8px 10px', marginBottom: 6,
          }}>
            <input type="checkbox" checked={choices[ex.instance_id]} onChange={() => toggle(ex.instance_id)}
              style={{ marginTop: 2, accentColor: '#3b82f6', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-800)', marginBottom: 3 }}>{ex.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {fields.map(f => (
                  <div key={f} style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--gray-400)' }}>{fieldLabel(f)}: </span>
                    <span style={{ color: '#dc2626', textDecoration: 'line-through', marginRight: 4 }}>{currentValues[f]}</span>
                    <span style={{ color: '#16a34a' }}>→ {f === 'intervals' ? `new pattern` : updates[f]}</span>
                  </div>
                ))}
              </div>
            </div>
          </label>
        ))}
      </Modal>
    );
  }

  return (
    <Modal title="⚠️ Conflicting values" onClose={onClose} size="modal-sm"
      footer={<>
        <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={onKeepExisting}>Keep existing</button>
        <button className="btn btn-ghost" onClick={() => setChoosing(true)}>Choose one by one</button>
        <button className="btn btn-primary" onClick={() => onApplyAll([...willFill, ...willConflict])}>Apply to all</button>
      </>}
    >
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--gray-700)' }}>
        <strong>{willConflict.length} exercise{willConflict.length !== 1 ? 's' : ''}</strong>{' '}
        already {willConflict.length !== 1 ? 'have' : 'has'} different values. What would you like to do?
      </div>
      {willConflict.slice(0, 5).map(({ ex, fields, currentValues, updates }) => (
        <div key={ex.instance_id} style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 10px', marginBottom: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-800)', marginBottom: 3 }}>{ex.name}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {fields.map(f => (
              <div key={f} style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--gray-400)' }}>{fieldLabel(f)}: </span>
                <span style={{ color: '#dc2626', textDecoration: 'line-through', marginRight: 4 }}>{currentValues[f]}</span>
                <span style={{ color: '#16a34a' }}>→ {f === 'intervals' ? 'new pattern' : updates[f]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {willConflict.length > 5 && <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>…and {willConflict.length - 5} more</div>}
      {willFill.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--gray-500)', fontStyle: 'italic' }}>
          {willFill.length} other exercise{willFill.length !== 1 ? 's' : ''} with empty fields will also be filled.
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--gray-400)', lineHeight: 1.5 }}>
        <strong>Keep existing</strong> — only fill exercises that have empty fields.<br />
        <strong>Apply to all</strong> — overwrite all conflicting exercises with the rule values.<br />
        <strong>Choose one by one</strong> — decide per exercise.
      </div>
    </Modal>
  );
}

// ── Interval pattern editor ───────────────────────────────────────────────────
function IntervalPatternEditor({ intervals, repeat, onChange, onRepeatChange }) {
  function addInterval() { onChange([...intervals, BLANK_INTERVAL()]); }
  function removeInterval(id) { onChange(intervals.filter(iv => iv.id !== id)); }
  function updateInterval(id, field, val) {
    onChange(intervals.map(iv => iv.id === id ? { ...iv, [field]: val } : iv));
  }
  function moveUp(idx) {
    if (idx === 0) return;
    const next = [...intervals];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  }
  function moveDown(idx) {
    if (idx === intervals.length - 1) return;
    const next = [...intervals];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  }

  return (
    <div>
      {intervals.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 8 }}>
          <table className="interval-table" style={{ minWidth: 860 }}>
            <thead>
              <tr>
                <th style={{ width: 28 }}>#</th>
                <th style={{ width: 100 }}>Intensity</th>
                <th style={{ width: 80 }}>Duration</th>
                <th style={{ width: 60 }}>RPE</th>
                <th style={{ width: 100 }}>Heart Rate</th>
                <th style={{ width: 120 }}>Equipment</th>
                <th style={{ width: 110 }}>Incline/Resistance</th>
                <th style={{ width: 90 }}>Speed/Pace</th>
                <th style={{ width: 110 }}>Description</th>
                <th style={{ width: 52 }}></th>
              </tr>
            </thead>
            <tbody>
              {intervals.map((iv, idx) => {
                const eq = iv.equipment || '';
                const inclinePlaceholder = eq === 'Treadmill' ? 'e.g. 5%'
                  : (eq === 'Bike (stationary)' || eq === 'Elliptical') ? 'e.g. level 3'
                  : 'e.g. steep';
                return (
                  <tr key={iv.id}>
                    <td style={{ fontWeight: 700, color: 'var(--gray-500)', textAlign: 'center', fontSize: 12 }}>{idx + 1}</td>
                    <td>
                      <select value={iv.intensity || ''} onChange={e => updateInterval(iv.id, 'intensity', e.target.value)}>
                        <option value="">—</option>
                        {INTENSITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="text" value={iv.duration || ''} placeholder="e.g. 2 min"
                        onChange={e => updateInterval(iv.id, 'duration', e.target.value)} />
                    </td>
                    <td>
                      <input type="number" min="1" max="10" value={iv.rpe || ''} placeholder="1-10"
                        style={{ width: 54 }}
                        onChange={e => updateInterval(iv.id, 'rpe', e.target.value)} />
                    </td>
                    <td>
                      <input type="text" value={iv.target_hr || ''} placeholder="e.g. 120–140"
                        onChange={e => updateInterval(iv.id, 'target_hr', e.target.value)} />
                    </td>
                    <td>
                      <select value={eq} onChange={e => updateInterval(iv.id, 'equipment', e.target.value)}>
                        <option value="">—</option>
                        {EQUIP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      <input type="text" value={iv.incline || ''} placeholder={inclinePlaceholder}
                        onChange={e => updateInterval(iv.id, 'incline', e.target.value)} />
                    </td>
                    <td>
                      <input type="text" value={iv.speed || ''} placeholder="e.g. 8 km/h"
                        onChange={e => updateInterval(iv.id, 'speed', e.target.value)} />
                    </td>
                    <td>
                      <input type="text" value={iv.description || ''} placeholder="e.g. warm up"
                        onChange={e => updateInterval(iv.id, 'description', e.target.value)} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                        <button title="Move up" onClick={() => moveUp(idx)} disabled={idx === 0}
                          style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', opacity: idx === 0 ? 0.3 : 1, fontSize: 11, padding: '2px 4px', color: 'var(--gray-500)' }}>↑</button>
                        <button title="Move down" onClick={() => moveDown(idx)} disabled={idx === intervals.length - 1}
                          style={{ background: 'none', border: 'none', cursor: idx === intervals.length - 1 ? 'default' : 'pointer', opacity: idx === intervals.length - 1 ? 0.3 : 1, fontSize: 11, padding: '2px 4px', color: 'var(--gray-500)' }}>↓</button>
                        <button title="Remove" onClick={() => removeInterval(iv.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', color: '#dc2626' }}>✕</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={addInterval}>
          + Add interval
        </button>
        {intervals.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-700)' }}>
            Repeat
            <input
              type="number" min="1" max="20"
              value={repeat}
              onChange={e => onRepeatChange(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 52, padding: '3px 6px', fontSize: 12, border: '1px solid var(--gray-200)', borderRadius: 6 }}
            />
            times
          </label>
        )}
      </div>

      {intervals.length > 0 && repeat > 1 && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--gray-400)' }}>
          → Total: {intervals.length * repeat} intervals when applied ({intervals.length} × {repeat})
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export default function GlobalRulesPanel({
  patient, selectedDay, dayKey, weekOffset, exercises, onApply, onClose,
}) {
  const dayLabel = selectedDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const [level,      setLevel]      = useState('day');
  const [bodyArea,   setBodyArea]   = useState('');
  const [weekType,   setWeekType]   = useState('resistance');
  const [exerciseId, setExerciseId] = useState('');

  const [strRule, setStrRule] = useState({ ...STR_BLANK });
  const [aerRule, setAerRule] = useState({ ...AER_BLANK });

  // Interval pattern state
  const [intervalEnabled,   setIntervalEnabled]   = useState(false);
  const [intervalPattern,   setIntervalPattern]   = useState([]);
  const [intervalRepeat,    setIntervalRepeat]     = useState(1);

  const [conflictData, setConflictData] = useState(null);

  // Aerobic exercises in the current week (for exercise-picker dropdown)
  const weekAerobicExercises = exercises.filter(ex =>
    (ex.type === 'aerobic' || ex.type === 'other') &&
    ex.day_key >= weekOffset * 7 && ex.day_key <= weekOffset * 7 + 6
  );

  // Build the combined rule for computation
  const intervalExpanded = (intervalEnabled && intervalPattern.length > 0)
    ? expandIntervals(intervalPattern, intervalRepeat)
    : null;

  const rule = { ...strRule, ...aerRule, ...(intervalExpanded ? { intervalExpanded } : {}) };

  // Load saved rule whenever scope changes
  useEffect(() => {
    const saved = getRuleForScope(loadRules(patient.id), level, dayKey, bodyArea, weekOffset, weekType, exerciseId);
    setStrRule({ ...STR_BLANK, sets: saved.sets || '', reps: saved.reps || '', weight: saved.weight || '', rest: saved.rest || '' });
    setAerRule({ ...AER_BLANK, duration: saved.duration || '', distance: saved.distance || '', speed: saved.speed || '', rest: saved.rest || '' });
    // Restore saved interval pattern
    if (saved.intervalPattern?.length) {
      setIntervalEnabled(true);
      setIntervalPattern(saved.intervalPattern.map(iv => ({ ...iv, id: uid() })));
      setIntervalRepeat(saved.intervalRepeat || 1);
    } else {
      setIntervalEnabled(false);
      setIntervalPattern([]);
      setIntervalRepeat(1);
    }
  }, [level, bodyArea, weekType, exerciseId, dayKey, weekOffset, patient.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { willFill: preview, willConflict: conflicts } = computeAffectedSplit(
    exercises, rule, level, dayKey, bodyArea, weekOffset, weekType, exerciseId
  );

  const hasAnyField = Object.values({ ...strRule, ...aerRule }).some(v => v !== '') ||
    (intervalEnabled && intervalPattern.length > 0);
  const scopeReady = (level !== 'dayGroup' || bodyArea) && (level !== 'exercise' || exerciseId);
  const canApply = hasAnyField && scopeReady;

  function handleClear() {
    clearRule(patient.id, level, dayKey, bodyArea, weekOffset, weekType, exerciseId);
    setStrRule({ ...STR_BLANK });
    setAerRule({ ...AER_BLANK });
    setIntervalEnabled(false);
    setIntervalPattern([]);
    setIntervalRepeat(1);
  }

  function handleApplyClick() {
    // Save to localStorage including interval pattern
    const savePayload = { ...strRule, ...aerRule };
    if (intervalEnabled && intervalPattern.length > 0) {
      savePayload.intervalPattern = intervalPattern;
      savePayload.intervalRepeat = intervalRepeat;
    }
    persistRule(patient.id, level, dayKey, bodyArea, weekOffset, weekType, exerciseId, savePayload);

    if (conflicts.length > 0) {
      setConflictData({ willFill: preview, willConflict: conflicts });
    } else {
      onApply(preview);
      onClose();
    }
  }

  function handleConflictResolved(toApply) {
    setConflictData(null);
    onApply(toApply);
    onClose();
  }

  const strField = (key, label, placeholder = '') => (
    <div className="form-row" key={key}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={strRule[key]}
        onChange={e => setStrRule(r => ({ ...r, [key]: e.target.value }))}
        placeholder={placeholder || 'leave blank to skip'} />
    </div>
  );

  const aerField = (key, label, placeholder = '') => (
    <div className="form-row" key={key}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={aerRule[key]}
        onChange={e => setAerRule(r => ({ ...r, [key]: e.target.value }))}
        placeholder={placeholder || 'leave blank to skip'} />
    </div>
  );

  const showStrength = level !== 'week' && level !== 'exercise' ? true
    : level === 'week' ? weekType === 'resistance'
    : false; // exercise scope: aerobic only

  const showAerobic = level === 'exercise' ? true
    : level === 'week' ? weekType === 'aerobic'
    : true; // day / dayGroup show both

  const totalPreview  = preview.length;
  const conflictCount = conflicts.length;

  return (
    <>
      <Modal
        title="⚡ Global Rules"
        onClose={onClose}
        size="modal-sm"
        footer={<>
          <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={handleClear}>Clear rule</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleApplyClick} disabled={!canApply}>
            Apply ({totalPreview} fill{totalPreview !== 1 ? 's' : ''}
            {conflictCount > 0 ? `, ${conflictCount} conflict${conflictCount !== 1 ? 's' : ''}` : ''})
          </button>
        </>}
      >
        {/* ── Scope selector ── */}
        <div className="form-row">
          <label className="form-label">Apply to</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              ['day',      `This day (${dayLabel})`],
              ['dayGroup', 'Day + muscle group'],
              ['week',     'This week (by type)'],
              ['exercise', 'Specific exercise'],
            ].map(([val, lbl]) => (
              <button key={val}
                className={`day-tab${level === val ? ' active' : ''}`}
                style={{ fontSize: 12, padding: '5px 10px' }}
                onClick={() => setLevel(val)}
              >{lbl}</button>
            ))}
          </div>
        </div>

        {level === 'dayGroup' && (
          <div className="form-row">
            <label className="form-label">Muscle group</label>
            <select className="form-input" value={bodyArea} onChange={e => setBodyArea(e.target.value)}>
              <option value="">— select —</option>
              {BODY_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        )}

        {level === 'week' && (
          <div className="form-row">
            <label className="form-label">Exercise type</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['resistance', '🏋️ Strength'], ['aerobic', '🏃 Aerobic']].map(([val, lbl]) => (
                <button key={val}
                  className={`day-tab${weekType === val ? ' active' : ''}`}
                  style={{ fontSize: 12, padding: '5px 10px' }}
                  onClick={() => setWeekType(val)}
                >{lbl}</button>
              ))}
            </div>
          </div>
        )}

        {level === 'exercise' && (
          <div className="form-row">
            <label className="form-label">Exercise</label>
            {weekAerobicExercises.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
                No aerobic exercises in this week.
              </div>
            ) : (
              <select className="form-input" value={exerciseId} onChange={e => setExerciseId(e.target.value)}>
                <option value="">— select exercise —</option>
                {weekAerobicExercises.map(ex => (
                  <option key={ex.instance_id} value={ex.instance_id}>{ex.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* ── Strength section ── */}
        {showStrength && (
          <>
            <div style={{ margin: '12px 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              🏋️ Strength exercises
            </div>
            <div className="ex-grid" style={{ marginBottom: 8 }}>
              {strField('sets',   'Sets')}
              {strField('reps',   'Reps')}
              {strField('weight', 'Weight', 'kg / lb')}
              {strField('rest',   'Rest',   'e.g. 60s')}
            </div>
          </>
        )}

        {/* ── Aerobic section ── */}
        {showAerobic && (
          <>
            <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
              🏃 Aerobic / Other exercises
            </div>
            <div className="ex-grid" style={{ marginBottom: 10 }}>
              {aerField('duration', 'Duration', 'e.g. 20 min')}
              {aerField('distance', 'Distance', 'e.g. 5 km')}
              {aerField('speed',    'Speed / Intensity', 'e.g. 8 km/h')}
              {aerField('rest',     'Rest', 'e.g. 2 min')}
            </div>

            {/* ── Interval pattern ── */}
            <div style={{
              background: '#f8fafc',
              border: `1px solid ${intervalEnabled ? '#93c5fd' : '#e2e8f0'}`,
              borderRadius: 8,
              padding: '10px 12px',
              marginBottom: 8,
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: intervalEnabled ? 12 : 0 }}>
                <input
                  type="checkbox"
                  checked={intervalEnabled}
                  onChange={e => {
                    setIntervalEnabled(e.target.checked);
                    if (!e.target.checked) { setIntervalPattern([]); setIntervalRepeat(1); }
                  }}
                  style={{ accentColor: '#3b82f6', width: 14, height: 14 }}
                />
                <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--gray-700)' }}>
                  🔄 Interval pattern
                </span>
                {!intervalEnabled && (
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    — define repeating intervals to apply
                  </span>
                )}
              </label>

              {intervalEnabled && (
                <IntervalPatternEditor
                  intervals={intervalPattern}
                  repeat={intervalRepeat}
                  onChange={setIntervalPattern}
                  onRepeatChange={setIntervalRepeat}
                />
              )}
            </div>
          </>
        )}

        {/* ── Preview ── */}
        {totalPreview > 0 && (
          <div style={{ marginTop: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>
              Will fill {totalPreview} exercise{totalPreview !== 1 ? 's' : ''}:
            </div>
            {preview.slice(0, 5).map(({ ex, fields }) => (
              <div key={ex.instance_id} style={{ color: '#15803d', marginBottom: 2 }}>
                • {ex.name} — <span style={{ fontStyle: 'italic' }}>{fields.map(f => f === 'intervals' ? 'interval pattern' : f).join(', ')}</span>
              </div>
            ))}
            {totalPreview > 5 && <div style={{ color: '#15803d' }}>…and {totalPreview - 5} more</div>}
          </div>
        )}

        {conflictCount > 0 && (
          <div style={{ marginTop: 8, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 2 }}>
              ⚠️ {conflictCount} exercise{conflictCount !== 1 ? 's have' : ' has'} existing different values
            </div>
            <div style={{ color: '#b91c1c' }}>Clicking Apply will let you choose how to handle these.</div>
          </div>
        )}

        {hasAnyField && totalPreview === 0 && conflictCount === 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
            All matching exercises already have values — nothing to fill.
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 11, color: 'var(--gray-400)', lineHeight: 1.5 }}>
          Rules only fill <strong>empty</strong> fields by default. Existing values will prompt you to confirm before being overwritten.
        </div>
      </Modal>

      {conflictData && (
        <ConflictModal
          willFill={conflictData.willFill}
          willConflict={conflictData.willConflict}
          onApplyAll={handleConflictResolved}
          onKeepExisting={() => handleConflictResolved(conflictData.willFill)}
          onClose={() => setConflictData(null)}
        />
      )}
    </>
  );
}
