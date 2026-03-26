import { useState, useEffect } from 'react';
import api from '../../utils/api';

const BLANK_TREATMENT = {
  name: '',
  treatment_type: '',
  frequency_value: 1,
  frequency_unit: 'weeks',
  start_date: new Date().toISOString().split('T')[0],
  last_treatment_date: '',
  notes: '',
  is_active: true,
  active_block_count: 0,
  break_count: 1,
  break_unit: 'weeks',
  duration_days: 1,
  pause_start_date: '',
  pause_end_date: '',
};

const BLANK_RULE = {
  trigger_type: 'after',
  offset_value: 1,
  offset_unit: 'weeks',
  message: '',
  repeat_each_cycle: true,
  is_active: true,
};

const TRIGGER_LABELS = {
  before:      'before treatment',
  on:          'on treatment day',
  after:       'after treatment',
  during_week: 'during treatment week',
};

function triggerDesc(rule) {
  if (rule.trigger_type === 'on')          return 'On treatment day';
  if (rule.trigger_type === 'during_week') return 'During treatment week';
  const dir = rule.trigger_type === 'before' ? 'before' : 'after';
  return `${rule.offset_value} ${rule.offset_unit} ${dir} treatment`;
}

function addDaysClient(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

function addPeriodClient(dateStr, value, unit) {
  const n = Number(value);
  const d = new Date(dateStr + 'T12:00:00Z');
  if      (unit === 'days')  d.setUTCDate(d.getUTCDate()   + n);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate()   + n * 7);
  else                       d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().split('T')[0];
}

function nextCycleDate(t) {
  if (!t.start_date) return null;
  const todayStr   = new Date().toISOString().split('T')[0];
  const limitStr   = addDaysClient(todayStr, 365 * 5);
  const fv         = Number(t.frequency_value) || 1;
  const aBlock     = Number(t.active_block_count) || 0;
  const bCount     = Number(t.break_count)        || 0;
  const hasBreak   = aBlock > 0 && bCount > 0;
  const pauseStart = t.pause_start_date || null;
  const pauseEnd   = t.pause_end_date   || null;

  // Returns true if date is inside the pause window.
  function inPause(d) {
    if (!pauseStart) return false;
    if (d < pauseStart) return false;
    if (pauseEnd && d > pauseEnd) return false;
    return true;
  }

  if (!hasBreak) {
    const startMs = new Date(t.start_date + 'T12:00:00Z').getTime();
    const freqMs  = t.frequency_unit === 'days'
      ? fv * 86400000
      : t.frequency_unit === 'weeks'
        ? fv * 7 * 86400000
        : fv * 30 * 86400000;
    const now = Date.now();
    // Find first cycle index on or after today
    let idx = startMs >= now ? 0 : Math.ceil((now - startMs) / freqMs);
    for (let i = 0; i < 10000; i++) {
      const candidate = new Date(startMs + (idx + i) * freqMs).toISOString().split('T')[0];
      if (candidate > limitStr) return null;
      if (!inPause(candidate)) return candidate;
    }
    return null;
  }

  // Break pattern: iterate occurrences until we find one >= today that is not paused
  if (t.frequency_unit !== 'months' && t.break_unit !== 'months') {
    const periodDays      = t.frequency_unit === 'weeks' ? fv * 7 : fv;
    const breakDays       = (t.break_unit || 'weeks') === 'weeks' ? bCount * 7 : bCount;
    const superPeriodDays = aBlock * periodDays + breakDays;
    for (let n = 0; n < 10000; n++) {
      const sp        = Math.floor(n / aBlock);
      const pos       = n % aBlock;
      const cycleDate = addDaysClient(t.start_date, sp * superPeriodDays + pos * periodDays);
      if (cycleDate > limitStr) return null;
      if (cycleDate >= todayStr && !inPause(cycleDate)) return cycleDate;
    }
    return null;
  }

  // Months frequency or months break — iterate blocks
  let blockStart = t.start_date;
  for (let safety = 0; safety < 1000; safety++) {
    for (let pos = 0; pos < aBlock; pos++) {
      const cycleDate = t.frequency_unit === 'months'
        ? (pos === 0 ? blockStart : addPeriodClient(blockStart, fv * pos, 'months'))
        : addDaysClient(blockStart, pos * (t.frequency_unit === 'weeks' ? fv * 7 : fv));
      if (cycleDate > limitStr) return null;
      if (cycleDate >= todayStr && !inPause(cycleDate)) return cycleDate;
    }
    const blockEnd = t.frequency_unit === 'months'
      ? addPeriodClient(blockStart, fv * aBlock, 'months')
      : addDaysClient(blockStart, aBlock * (t.frequency_unit === 'weeks' ? fv * 7 : fv));
    blockStart = addPeriodClient(blockEnd, bCount, t.break_unit || 'weeks');
    if (blockStart > limitStr) return null;
  }
  return null;
}

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Small inline form for add/edit treatment ──────────────────────────────────
function TreatmentForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...BLANK_TREATMENT, ...initial });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  const hasBreak = Number(form.active_block_count) > 0;
  function submit() {
    if (!form.name.trim()) return alert('Treatment name is required.');
    if (!form.start_date)  return alert('Start date is required.');
    if (hasBreak && !(Number(form.break_count) > 0)) return alert('Break duration must be at least 1.');
    onSave({
      ...form,
      active_block_count: hasBreak ? Number(form.active_block_count) : 0,
      break_count:        hasBreak ? Number(form.break_count)        : 1,
    });
  }
  return (
    <div style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>Treatment Name *</label>
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Chemotherapy" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>Type (optional)</label>
          <input className="form-input" value={form.treatment_type} onChange={e => set('treatment_type', e.target.value)} placeholder="e.g. IV Infusion" />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>Frequency</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="form-input" type="number" min="1" value={form.frequency_value} onChange={e => set('frequency_value', +e.target.value)} style={{ width: 60 }} />
            <select className="form-input" value={form.frequency_unit} onChange={e => set('frequency_unit', e.target.value)} style={{ flex: 1 }}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>Start Date *</label>
          <input className="form-input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>Duration (days)</label>
          <input className="form-input" type="number" min="1" max="365"
            value={form.duration_days || 1}
            onChange={e => set('duration_days', Math.max(1, +e.target.value))}
            style={{ width: 80 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>Last Treatment Date</label>
          <input className="form-input" type="date" value={form.last_treatment_date || ''} onChange={e => set('last_treatment_date', e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} />
            Active
          </label>
        </div>
      </div>

      {/* Block + rest pattern */}
      <div style={{ marginBottom: 10, background: hasBreak ? '#eff6ff' : 'transparent', border: hasBreak ? '1px solid #bfdbfe' : '1px solid transparent', borderRadius: 8, padding: hasBreak ? '10px 12px' : '0 12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600, color: 'var(--gray-700)' }}>
          <input type="checkbox" checked={hasBreak}
            onChange={e => set('active_block_count', e.target.checked ? 3 : 0)} />
          Enable block + rest pattern
        </label>
        {hasBreak && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>After</span>
            <input className="form-input" type="number" min="1" value={form.active_block_count}
              onChange={e => set('active_block_count', +e.target.value)}
              style={{ width: 56, fontSize: 13 }} />
            <span style={{ fontSize: 12, color: 'var(--gray-600)' }}>treatments, rest for</span>
            <input className="form-input" type="number" min="1" value={form.break_count}
              onChange={e => set('break_count', +e.target.value)}
              style={{ width: 56, fontSize: 13 }} />
            <select className="form-input" value={form.break_unit}
              onChange={e => set('break_unit', e.target.value)}
              style={{ fontSize: 13 }}>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
              <option value="months">months</option>
            </select>
          </div>
        )}
      </div>

      {/* Pause / hold section */}
      <div style={{ marginBottom: 10, background: form.pause_start_date ? '#fafaf9' : 'transparent', border: form.pause_start_date ? '1px solid #d6d3d1' : '1px solid transparent', borderRadius: 8, padding: form.pause_start_date ? '10px 12px' : '0 12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600, color: 'var(--gray-700)' }}>
          <input type="checkbox" checked={!!form.pause_start_date}
            onChange={e => {
              if (e.target.checked) set('pause_start_date', new Date().toISOString().split('T')[0]);
              else { set('pause_start_date', ''); set('pause_end_date', ''); }
            }} />
          ⏸ Pause treatment (hold)
        </label>
        {form.pause_start_date && (
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 2 }}>Pause from *</label>
              <input className="form-input" type="date"
                value={form.pause_start_date}
                onChange={e => set('pause_start_date', e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 2 }}>Resume on (optional)</label>
              <input className="form-input" type="date"
                value={form.pause_end_date || ''}
                onChange={e => set('pause_end_date', e.target.value)} />
            </div>
            <div style={{ fontSize: 11, color: '#78716c', paddingBottom: 2 }}>
              Scheduled cycles during this window will be skipped.
            </div>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>Notes</label>
        <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any clinical notes..." />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>Save Treatment</button>
      </div>
    </div>
  );
}

// ── Inline form for add/edit a reminder rule ──────────────────────────────────
function RuleForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...BLANK_RULE, ...initial });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  const needsOffset = form.trigger_type !== 'on' && form.trigger_type !== 'during_week';
  function submit() {
    if (!form.message.trim()) return alert('Reminder message is required.');
    onSave(form);
  }
  return (
    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 2 }}>Timing</label>
          <select className="form-input" value={form.trigger_type} onChange={e => set('trigger_type', e.target.value)} style={{ fontSize: 13 }}>
            <option value="before">Before treatment</option>
            <option value="on">On treatment day</option>
            <option value="after">After treatment</option>
            <option value="during_week">During treatment week</option>
          </select>
        </div>
        {needsOffset && (
          <>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 2 }}>Amount</label>
              <input className="form-input" type="number" min="1" value={form.offset_value} onChange={e => set('offset_value', +e.target.value)} style={{ width: 60, fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 2 }}>Unit</label>
              <select className="form-input" value={form.offset_unit} onChange={e => set('offset_unit', e.target.value)} style={{ fontSize: 13 }}>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 2 }}>Repeat each cycle</label>
          <select className="form-input" value={form.repeat_each_cycle ? 'yes' : 'no'} onChange={e => set('repeat_each_cycle', e.target.value === 'yes')} style={{ fontSize: 13 }}>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 2 }}>Reminder Message *</label>
        <textarea className="form-input" rows={2} value={form.message} onChange={e => set('message', e.target.value)}
          placeholder="e.g. Reduce back exercises and avoid long sessions" />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={submit}>Save Rule</button>
      </div>
    </div>
  );
}

// ── Main TreatmentSchedule component ─────────────────────────────────────────
export default function TreatmentSchedule({ patient }) {
  const [treatments,  setTreatments]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showAdd,     setShowAdd]     = useState(false);
  const [editing,     setEditing]     = useState(null);   // treatment id
  const [expanded,    setExpanded]    = useState(null);   // treatment id
  const [addRuleFor,  setAddRuleFor]  = useState(null);   // treatment id
  const [editingRule, setEditingRule] = useState(null);   // { tid, rule }

  function load() {
    setLoading(true);
    api.get(`/treatments/${patient.id}`)
      .then(r => setTreatments(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(load, [patient.id]);

  async function saveTreatment(form) {
    if (editing) {
      await api.put(`/treatments/${patient.id}/${editing}`, form);
      setEditing(null);
    } else {
      const res = await api.post(`/treatments/${patient.id}`, form);
      setExpanded(res.data.id);
      setShowAdd(false);
    }
    load();
  }

  async function deleteTreatment(tid) {
    if (!confirm('Delete this treatment and all its reminder rules?')) return;
    await api.delete(`/treatments/${patient.id}/${tid}`);
    if (expanded === tid) setExpanded(null);
    load();
  }

  async function toggleActive(t) {
    await api.put(`/treatments/${patient.id}/${t.id}`, { ...t, is_active: !t.is_active });
    load();
  }

  async function saveRule(form) {
    if (editingRule) {
      await api.put(`/treatments/${patient.id}/${editingRule.tid}/rules/${editingRule.rule.id}`, form);
      setEditingRule(null);
    } else {
      await api.post(`/treatments/${patient.id}/${addRuleFor}/rules`, form);
      setAddRuleFor(null);
    }
    load();
  }

  async function deleteRule(tid, rid) {
    if (!confirm('Delete this reminder rule?')) return;
    await api.delete(`/treatments/${patient.id}/${tid}/rules/${rid}`);
    load();
  }

  async function toggleRuleActive(tid, rule) {
    await api.put(`/treatments/${patient.id}/${tid}/rules/${rule.id}`, { ...rule, is_active: !rule.is_active });
    load();
  }

  if (loading) return <p style={{ color: 'var(--gray-400)', padding: 8 }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>💊 Treatment Schedule</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{patient.name}</p>
        </div>
        {!showAdd && <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowAdd(true)}>+ Add Treatment</button>}
      </div>

      {showAdd && (
        <TreatmentForm onSave={saveTreatment} onCancel={() => setShowAdd(false)} />
      )}

      {treatments.length === 0 && !showAdd && (
        <div className="empty" style={{ padding: '32px 0' }}>
          <div className="empty-icon">💊</div>
          <div>No treatments recorded yet.</div>
        </div>
      )}

      {treatments.map(t => {
        const isExpanded = expanded === t.id;
        const isEditing  = editing === t.id;
        const nextDate   = nextCycleDate(t);
        const todayStr   = new Date().toISOString().split('T')[0];
        const isPaused   = t.is_active && t.pause_start_date &&
          (!t.pause_end_date || t.pause_end_date >= todayStr);

        return (
          <div key={t.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 12, marginBottom: 10, overflow: 'hidden', background: '#fff' }}>
            {/* Treatment header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
              onClick={() => setExpanded(isExpanded ? null : t.id)}>
              <span style={{ fontSize: 20 }}>💊</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</span>
                  {t.treatment_type && (
                    <span style={{ fontSize: 11, background: '#dbeafe', color: '#1d4ed8', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>{t.treatment_type}</span>
                  )}
                  {isPaused ? (
                    <span style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>
                      ⏸ Paused
                    </span>
                  ) : t.is_active ? (
                    <span style={{ fontSize: 11, background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>
                      ● Active
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, background: '#f3f4f6', color: 'var(--gray-500)', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>
                      ○ Inactive
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                  Every {t.frequency_value} {t.frequency_unit}
                  {Number(t.active_block_count) > 0 && ` · ${t.active_block_count} on / ${t.break_count} ${t.break_unit} off`}
                  {Number(t.duration_days) > 1 && ` · ${t.duration_days}-day duration`}
                  {' · '}Next: {fmtDate(nextDate)}
                  {t.rules?.length > 0 && ` · ${t.rules.length} reminder rule${t.rules.length > 1 ? 's' : ''}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" title={t.is_active ? 'Deactivate' : 'Activate'}
                  onClick={e => { e.stopPropagation(); toggleActive(t); }}>
                  {t.is_active ? '⏸' : '▶'}
                </button>
                <button className="icon-btn" title="Edit"
                  onClick={e => { e.stopPropagation(); setEditing(t.id); setExpanded(t.id); }}>✏️</button>
                <button className="icon-btn" title="Delete"
                  onClick={e => { e.stopPropagation(); deleteTreatment(t.id); }}>🗑️</button>
              </div>
              <span style={{ color: 'var(--gray-400)', fontSize: 12, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
            </div>

            {/* Expanded body */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--gray-100)', padding: '12px 14px' }}>

                {/* Edit form */}
                {isEditing && (
                  <TreatmentForm initial={t} onSave={saveTreatment} onCancel={() => setEditing(null)} />
                )}

                {!isEditing && (
                  <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14, fontSize: 13 }}>
                    <div><span style={{ color: 'var(--gray-400)' }}>Start:</span> {fmtDate(t.start_date)}</div>
                    {t.last_treatment_date && <div><span style={{ color: 'var(--gray-400)' }}>Last:</span> {fmtDate(t.last_treatment_date)}</div>}
                    <div><span style={{ color: 'var(--gray-400)' }}>Next expected:</span> {fmtDate(nextDate)}</div>
                    {Number(t.duration_days) > 1 && (
                      <div><span style={{ color: 'var(--gray-400)' }}>Duration:</span> {t.duration_days} days per cycle</div>
                    )}
                    {t.pause_start_date && (
                      <div style={{ width: '100%', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '4px 10px', color: '#92400e' }}>
                        ⏸ Paused {fmtDate(t.pause_start_date)}
                        {t.pause_end_date ? ` → resumes ${fmtDate(t.pause_end_date)}` : ' (indefinite)'}
                      </div>
                    )}
                    {t.notes && <div style={{ width: '100%', color: 'var(--gray-500)' }}>📝 {t.notes}</div>}
                  </div>
                )}

                {/* Reminder rules */}
                <div style={{ marginTop: isEditing ? 12 : 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)' }}>🔔 Reminder Rules</span>
                    {addRuleFor !== t.id && (
                      <button className="btn" style={{ fontSize: 12, padding: '4px 12px', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}
                        onClick={() => { setAddRuleFor(t.id); setEditingRule(null); }}>
                        + Add Rule
                      </button>
                    )}
                  </div>

                  {addRuleFor === t.id && (
                    <RuleForm onSave={saveRule} onCancel={() => setAddRuleFor(null)} />
                  )}

                  {t.rules?.length === 0 && addRuleFor !== t.id && (
                    <p style={{ fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>No reminder rules yet.</p>
                  )}

                  {t.rules?.map(rule => (
                    <div key={rule.id}>
                      {editingRule?.rule.id === rule.id ? (
                        <RuleForm initial={rule} onSave={saveRule} onCancel={() => setEditingRule(null)} />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: rule.is_active ? '#f0fdf4' : '#f9fafb', border: `1px solid ${rule.is_active ? '#bbf7d0' : 'var(--gray-200)'}`, borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 2 }}>
                              🔔 {triggerDesc(rule)}
                            </div>
                            <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>{rule.message}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                              {rule.repeat_each_cycle ? 'Repeats every cycle' : 'One-time'}
                              {!rule.is_active && ' · Inactive'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            <button className="icon-btn" style={{ fontSize: 13 }} title={rule.is_active ? 'Deactivate' : 'Activate'}
                              onClick={() => toggleRuleActive(t.id, rule)}>{rule.is_active ? '⏸' : '▶'}</button>
                            <button className="icon-btn" style={{ fontSize: 13 }} title="Edit"
                              onClick={() => { setEditingRule({ tid: t.id, rule }); setAddRuleFor(null); }}>✏️</button>
                            <button className="icon-btn" style={{ fontSize: 13 }} title="Delete"
                              onClick={() => deleteRule(t.id, rule.id)}>🗑️</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
