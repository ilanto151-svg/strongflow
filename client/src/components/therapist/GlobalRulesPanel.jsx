import { useState, useEffect } from 'react';
import Modal from '../shared/Modal';

const BODY_AREAS = ['רגליים', 'חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית', 'בטן'];
const BLANK = { sets: '', reps: '', weight: '', rest: '', duration: '' };

function rulesKey(pid) { return `om_rules_${pid}`; }
export function autoFilledKey(pid) { return `om_autofilled_${pid}`; }

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

// Given rules store + level context, return the active rule object (or {})
function getRuleForLevel(rules, level, dayKey, bodyArea) {
  if (level === 'plan') return rules.plan || {};
  if (level === 'day')  return rules.days?.[dayKey] || {};
  if (level === 'dayGroup' && bodyArea) return rules.dayGroups?.[`${dayKey}:${bodyArea}`] || {};
  return {};
}

// Determine which exercises would be updated and with which fields
export function computeAffected(exercises, rule, level, dayKey, bodyArea) {
  return exercises
    .filter(ex => {
      if (level === 'day'      && ex.day_key !== dayKey) return false;
      if (level === 'dayGroup' && (ex.day_key !== dayKey || ex.body_area !== bodyArea)) return false;
      return true;
    })
    .map(ex => {
      const fields = [];
      if (ex.type === 'resistance') {
        if (!ex.sets   && rule.sets)   fields.push('sets');
        if (!ex.reps   && rule.reps)   fields.push('reps');
        if (!ex.weight && rule.weight) fields.push('weight');
        if (!ex.rest   && rule.rest)   fields.push('rest');
      } else {
        if (!ex.duration && rule.duration) fields.push('duration');
        if (!ex.rest     && rule.rest)     fields.push('rest');
      }
      if (!fields.length) return null;
      return { ex, fields, updates: Object.fromEntries(fields.map(f => [f, rule[f]])) };
    })
    .filter(Boolean);
}

export default function GlobalRulesPanel({ patient, selectedDay, dayKey, exercises, onApply, onClose }) {
  const dayLabel = selectedDay.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });

  const [level,    setLevel]    = useState('plan');
  const [bodyArea, setBodyArea] = useState('');
  const [rule,     setRule]     = useState({ ...BLANK });
  const [preview,  setPreview]  = useState([]);

  // Load rule for the current scope whenever scope changes
  useEffect(() => {
    const rules = loadRules(patient.id);
    setRule({ ...BLANK, ...getRuleForLevel(rules, level, dayKey, bodyArea) });
  }, [level, bodyArea, dayKey, patient.id]);

  // Recompute preview whenever inputs change
  useEffect(() => {
    setPreview(computeAffected(exercises, rule, level, dayKey, bodyArea));
  }, [exercises, rule, level, dayKey, bodyArea]);

  function setField(k, v) { setRule(r => ({ ...r, [k]: v })); }

  function persistRule() {
    const rules = loadRules(patient.id);
    if (level === 'plan') {
      rules.plan = { ...rule };
    } else if (level === 'day') {
      rules.days = { ...rules.days, [dayKey]: { ...rule } };
    } else if (bodyArea) {
      rules.dayGroups = { ...rules.dayGroups, [`${dayKey}:${bodyArea}`]: { ...rule } };
    }
    saveRulesStore(patient.id, rules);
  }

  function handleClear() {
    const rules = loadRules(patient.id);
    if (level === 'plan')           { delete rules.plan; }
    else if (level === 'day')       { if (rules.days) delete rules.days[dayKey]; }
    else if (bodyArea)              { if (rules.dayGroups) delete rules.dayGroups[`${dayKey}:${bodyArea}`]; }
    saveRulesStore(patient.id, rules);
    setRule({ ...BLANK });
  }

  function handleApply() {
    persistRule();
    onApply(preview);  // pass computed list to parent
    onClose();
  }

  const hasAnyField = Object.values(rule).some(v => v !== '');
  const canApply    = hasAnyField && (level !== 'dayGroup' || bodyArea);

  const field = (key, label, placeholder = '') => (
    <div className="form-row" key={key}>
      <label className="form-label">{label}</label>
      <input className="form-input" value={rule[key]}
        onChange={e => setField(key, e.target.value)}
        placeholder={placeholder || 'leave blank to skip'} />
    </div>
  );

  return (
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
          <button className="btn btn-primary" onClick={handleApply} disabled={!canApply}>
            Apply ({preview.length} exercise{preview.length !== 1 ? 's' : ''})
          </button>
        </>
      }
    >
      {/* ── Scope selector ── */}
      <div className="form-row">
        <label className="form-label">Apply to</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['plan',     'Entire plan'],
            ['day',      `This day (${dayLabel})`],
            ['dayGroup', 'Day + muscle group'],
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

      {/* ── Strength defaults ── */}
      <div style={{ margin: '12px 0 6px', fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        🏋️ Strength exercises
      </div>
      <div className="ex-grid" style={{ marginBottom: 8 }}>
        {field('sets',   'Sets')}
        {field('reps',   'Reps')}
        {field('weight', 'Weight', 'kg / lb')}
        {field('rest',   'Rest',   'e.g. 60s')}
      </div>

      {/* ── Aerobic defaults ── */}
      <div style={{ marginBottom: 6, fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        🏃 Aerobic / Other exercises
      </div>
      {field('duration', 'Duration', 'e.g. 20 min')}

      {/* ── Preview ── */}
      {preview.length > 0 && (
        <div style={{ marginTop: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          <div style={{ fontWeight: 700, color: '#166534', marginBottom: 4 }}>
            Will fill {preview.length} exercise{preview.length !== 1 ? 's' : ''}:
          </div>
          {preview.slice(0, 6).map(({ ex, fields }) => (
            <div key={ex.instance_id} style={{ color: '#15803d', marginBottom: 2 }}>
              • {ex.name} — <span style={{ fontStyle: 'italic' }}>{fields.join(', ')}</span>
            </div>
          ))}
          {preview.length > 6 && (
            <div style={{ color: '#15803d' }}>…and {preview.length - 6} more</div>
          )}
        </div>
      )}

      {hasAnyField && preview.length === 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
          All matching exercises already have values — nothing to fill.
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--gray-400)', lineHeight: 1.5 }}>
        Rules only fill <strong>empty</strong> fields. Exercises with existing values are left unchanged.
        Use the most specific scope (Day + muscle group) to override a broader rule.
      </div>
    </Modal>
  );
}
