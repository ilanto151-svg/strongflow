import { useState, useEffect } from 'react';
import Modal from '../shared/Modal';

const BODY_AREAS = ['רגליים', 'חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית', 'בטן'];

const STR_BLANK = { sets: '', reps: '', weight: '', rest: '' };
const AER_BLANK = { duration: '', distance: '', speed: '', rest: '' };

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
function getRuleForScope(rules, level, dayKey, bodyArea, weekOffset, weekType) {
  if (level === 'day')      return rules.days?.[dayKey] || {};
  if (level === 'dayGroup' && bodyArea) return rules.dayGroups?.[`${dayKey}:${bodyArea}`] || {};
  if (level === 'week' && weekType)     return rules.weeks?.[`${weekOffset}:${weekType}`] || {};
  return {};
}

function persistRule(pid, level, dayKey, bodyArea, weekOffset, weekType, rule) {
  const rules = loadRules(pid);
  if (level === 'day') {
    rules.days = { ...rules.days, [dayKey]: { ...rule } };
  } else if (level === 'dayGroup' && bodyArea) {
    rules.dayGroups = { ...rules.dayGroups, [`${dayKey}:${bodyArea}`]: { ...rule } };
  } else if (level === 'week' && weekType) {
    rules.weeks = { ...rules.weeks, [`${weekOffset}:${weekType}`]: { ...rule } };
  }
  saveRulesStore(pid, rules);
}

function clearRule(pid, level, dayKey, bodyArea, weekOffset, weekType) {
  const rules = loadRules(pid);
  if (level === 'day') {
    if (rules.days) delete rules.days[dayKey];
  } else if (level === 'dayGroup' && bodyArea) {
    if (rules.dayGroups) delete rules.dayGroups[`${dayKey}:${bodyArea}`];
  } else if (level === 'week' && weekType) {
    if (rules.weeks) delete rules.weeks[`${weekOffset}:${weekType}`];
  }
  saveRulesStore(pid, rules);
}

// ── Conflict / fill computation ───────────────────────────────────────────────
function filterByScope(exercises, level, dayKey, bodyArea, weekOffset, weekType) {
  return exercises.filter(ex => {
    if (level === 'day')      return ex.day_key === dayKey;
    if (level === 'dayGroup') return ex.day_key === dayKey && ex.body_area === bodyArea;
    if (level === 'week') {
      const inWeek  = ex.day_key >= weekOffset * 7 && ex.day_key <= weekOffset * 7 + 6;
      const typeOk  = weekType ? ex.type === weekType : true;
      return inWeek && typeOk;
    }
    return true;
  });
}

function ruleFieldsFor(ex) {
  return ex.type === 'resistance'
    ? ['sets', 'reps', 'weight', 'rest']
    : ['duration', 'distance', 'speed', 'rest'];
}

export function computeAffectedSplit(exercises, rule, level, dayKey, bodyArea, weekOffset, weekType) {
  const matching   = filterByScope(exercises, level, dayKey, bodyArea, weekOffset, weekType);
  const willFill     = [];
  const willConflict = [];

  matching.forEach(ex => {
    const fields      = ruleFieldsFor(ex);
    const toFill      = fields.filter(f => rule[f] && !ex[f]);
    const toConflict  = fields.filter(f => rule[f] && ex[f] && String(ex[f]) !== String(rule[f]));

    if (toFill.length) {
      willFill.push({
        ex,
        fields:  toFill,
        updates: Object.fromEntries(toFill.map(f => [f, rule[f]])),
      });
    }
    if (toConflict.length) {
      willConflict.push({
        ex,
        fields:        toConflict,
        currentValues: Object.fromEntries(toConflict.map(f => [f, ex[f]])),
        updates:       Object.fromEntries(toConflict.map(f => [f, rule[f]])),
      });
    }
  });

  return { willFill, willConflict };
}

// Legacy compat for any existing callers
export function computeAffected(exercises, rule, level, dayKey, bodyArea) {
  const { willFill } = computeAffectedSplit(exercises, rule, level, dayKey, bodyArea, 0, null);
  return willFill;
}

// ── Conflict resolution modal ─────────────────────────────────────────────────
function ConflictModal({ willFill, willConflict, onApplyAll, onKeepExisting, onClose }) {
  const [choosing, setChoosing] = useState(false);
  // true = apply rule, false = keep existing (default: keep)
  const [choices, setChoices]   = useState(
    () => Object.fromEntries(willConflict.map(({ ex }) => [ex.instance_id, false]))
  );

  function toggle(id) {
    setChoices(c => ({ ...c, [id]: !c[id] }));
  }

  function applyChoices() {
    const chosen = willConflict.filter(({ ex }) => choices[ex.instance_id]);
    onApplyAll([...willFill, ...chosen]);
  }

  if (choosing) {
    return (
      <Modal
        title="Choose per exercise"
        onClose={onClose}
        size="modal-sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setChoosing(false)}>Back</button>
            <button className="btn btn-primary" onClick={applyChoices}>
              Apply to selected
            </button>
          </>
        }
      >
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 10 }}>
          Tick the exercises you want to update with the rule. Unticked exercises keep their current values.
        </div>
        {willConflict.map(({ ex, fields, currentValues, updates }) => (
          <label key={ex.instance_id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            background: choices[ex.instance_id] ? '#eff6ff' : '#f9fafb',
            border: `1px solid ${choices[ex.instance_id] ? '#bfdbfe' : '#e5e7eb'}`,
            borderRadius: 8, padding: '8px 10px', marginBottom: 6,
          }}>
            <input
              type="checkbox"
              checked={choices[ex.instance_id]}
              onChange={() => toggle(ex.instance_id)}
              style={{ marginTop: 2, accentColor: '#3b82f6', flexShrink: 0 }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-800)', marginBottom: 3 }}>
                {ex.name}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {fields.map(f => (
                  <div key={f} style={{ fontSize: 12 }}>
                    <span style={{ color: 'var(--gray-400)' }}>{f}: </span>
                    <span style={{ color: '#dc2626', textDecoration: 'line-through', marginRight: 4 }}>
                      {currentValues[f]}
                    </span>
                    <span style={{ color: '#16a34a' }}>→ {updates[f]}</span>
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
    <Modal
      title="⚠️ Conflicting values"
      onClose={onClose}
      size="modal-sm"
      footer={
        <>
          <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={onKeepExisting}>
            Keep existing
          </button>
          <button className="btn btn-ghost" onClick={() => setChoosing(true)}>
            Choose one by one
          </button>
          <button className="btn btn-primary" onClick={() => onApplyAll([...willFill, ...willConflict])}>
            Apply to all
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--gray-700)' }}>
        <strong>{willConflict.length} exercise{willConflict.length !== 1 ? 's' : ''}</strong> already
        {willConflict.length !== 1 ? ' have' : ' has'} different values. What would you like to do?
      </div>

      {willConflict.slice(0, 5).map(({ ex, fields, currentValues, updates }) => (
        <div key={ex.instance_id} style={{
          background: '#fef2f2', border: '1px solid #fca5a5',
          borderRadius: 8, padding: '8px 10px', marginBottom: 6,
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-800)', marginBottom: 3 }}>
            {ex.name}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {fields.map(f => (
              <div key={f} style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--gray-400)' }}>{f}: </span>
                <span style={{ color: '#dc2626', textDecoration: 'line-through', marginRight: 4 }}>
                  {currentValues[f]}
                </span>
                <span style={{ color: '#16a34a' }}>→ {updates[f]}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {willConflict.length > 5 && (
        <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
          …and {willConflict.length - 5} more
        </div>
      )}

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

// ── Main panel ────────────────────────────────────────────────────────────────
export default function GlobalRulesPanel({
  patient, selectedDay, dayKey, weekOffset, exercises, onApply, onClose,
}) {
  const dayLabel = selectedDay.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });

  const [level,    setLevel]    = useState('day');
  const [bodyArea, setBodyArea] = useState('');
  const [weekType, setWeekType] = useState('resistance');

  const [strRule, setStrRule] = useState({ ...STR_BLANK });
  const [aerRule, setAerRule] = useState({ ...AER_BLANK });

  // Conflict-resolution overlay
  const [conflictData, setConflictData] = useState(null); // null | { willFill, willConflict }

  // Combined rule for preview / apply
  const rule = { ...strRule, ...aerRule };

  // Load saved rule whenever scope changes
  useEffect(() => {
    const saved = getRuleForScope(loadRules(patient.id), level, dayKey, bodyArea, weekOffset, weekType);
    setStrRule({ ...STR_BLANK, sets: saved.sets || '', reps: saved.reps || '', weight: saved.weight || '', rest: saved.rest || '' });
    setAerRule({ ...AER_BLANK, duration: saved.duration || '', distance: saved.distance || '', speed: saved.speed || '', rest: saved.rest || '' });
  }, [level, bodyArea, weekType, dayKey, weekOffset, patient.id]);

  // Compute preview (fill only — for display below form)
  const { willFill: preview, willConflict: conflicts } = computeAffectedSplit(
    exercises, rule, level, dayKey, bodyArea, weekOffset, weekType
  );

  const hasAnyField = Object.values(rule).some(v => v !== '');
  const scopeReady  = level !== 'dayGroup' || bodyArea;
  const canApply    = hasAnyField && scopeReady;

  function handleClear() {
    clearRule(patient.id, level, dayKey, bodyArea, weekOffset, weekType);
    setStrRule({ ...STR_BLANK });
    setAerRule({ ...AER_BLANK });
  }

  function handleApplyClick() {
    persistRule(patient.id, level, dayKey, bodyArea, weekOffset, weekType, rule);
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

  const showStrength = level !== 'week' || weekType === 'resistance';
  const showAerobic  = level !== 'week' || weekType === 'aerobic';

  const totalPreview = preview.length;
  const conflictCount = conflicts.length;

  return (
    <>
      <Modal
        title="⚡ Global Rules"
        onClose={onClose}
        size="modal-sm"
        footer={
          <>
            <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={handleClear}>
              Clear rule
            </button>
            <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleApplyClick} disabled={!canApply}>
              Apply ({totalPreview} fill{totalPreview !== 1 ? 's' : ''}
              {conflictCount > 0 ? `, ${conflictCount} conflict${conflictCount !== 1 ? 's' : ''}` : ''})
            </button>
          </>
        }
      >
        {/* ── Scope selector ── */}
        <div className="form-row">
          <label className="form-label">Apply to</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              ['day',      `This day (${dayLabel})`],
              ['dayGroup', 'Day + muscle group'],
              ['week',     'This week (by type)'],
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
            <div className="ex-grid" style={{ marginBottom: 8 }}>
              {aerField('duration', 'Duration', 'e.g. 20 min')}
              {aerField('distance', 'Distance', 'e.g. 5 km')}
              {aerField('speed',    'Speed / Intensity', 'e.g. 8 km/h')}
              {aerField('rest',     'Rest', 'e.g. 2 min')}
            </div>
          </>
        )}

        {/* ── Preview ── */}
        {totalPreview > 0 && (
          <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>
              Will fill {totalPreview} exercise{totalPreview !== 1 ? 's' : ''}:
            </div>
            {preview.slice(0, 5).map(({ ex, fields }) => (
              <div key={ex.instance_id} style={{ color: '#15803d', marginBottom: 2 }}>
                • {ex.name} — <span style={{ fontStyle: 'italic' }}>{fields.join(', ')}</span>
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
            <div style={{ color: '#b91c1c' }}>
              Clicking Apply will let you choose how to handle these.
            </div>
          </div>
        )}

        {hasAnyField && totalPreview === 0 && conflictCount === 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
            All matching exercises already have values — nothing to fill.
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 11, color: 'var(--gray-400)', lineHeight: 1.5 }}>
          Rules only fill <strong>empty</strong> fields by default. Exercises with existing values
          will prompt you to confirm before being overwritten.
        </div>
      </Modal>

      {conflictData && (
        <ConflictModal
          willFill={conflictData.willFill}
          willConflict={conflictData.willConflict}
          onApplyAll={handleConflictResolved}
          onKeepExisting={() => { handleConflictResolved(conflictData.willFill); }}
          onClose={() => setConflictData(null)}
        />
      )}
    </>
  );
}
