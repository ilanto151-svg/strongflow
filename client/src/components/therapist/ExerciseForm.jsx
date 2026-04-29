import { useState } from 'react';
import { TYPE_META, RPE, INTENSITY_OPTIONS } from '../../constants';
import { uid } from '../../utils/calendar';

const BLANK_RES = {
  type: 'resistance',
  name: '',
  image: '',
  description: '',
  equipment: '',
  sets: '',
  reps: '',
  weight: '',
  rest: '',
  body_area: ''
};
const BLANK_AER = { type: 'aerobic',    name: '', image: '', description: '', equipment: '', duration: '', notes: '', img_data: '', img_url: '', link: '', intervals: [] };
const BLANK_OTH = { type: 'other',      name: '', image: '', description: '', equipment: '', duration: '', notes: '', img_data: '', img_url: '', link: '' };
const BODY_AREAS = [
  'רגליים',
  'חזה',
  'גב',
  'כתפיים',
  'יד קדמית',
  'יד אחורית',
  'בטן'
];

function blankFor(t) {
  if (t === 'resistance') return { ...BLANK_RES };
  if (t === 'aerobic') return { ...BLANK_AER, intervals: [] };
  return { ...BLANK_OTH };
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error('Read error'));
    r.readAsDataURL(file);
  });
}

export default function ExerciseForm({ initial, onSave, onClose }) {
  const editing = !!initial;
  const [tab, setTab] = useState(initial?.type || 'resistance');
  const [mode, setMode] = useState('custom');

  // Parse set_overrides from initial if editing
  const initialOverrides = (() => {
    if (!initial?.set_overrides) return [];
    try { return JSON.parse(initial.set_overrides); } catch { return []; }
  })();

  const [form, setForm] = useState(
    initial
      ? { ...initial, intervals: initial.intervals ? JSON.parse(initial.intervals) : [], set_overrides: initialOverrides }
      : blankFor(tab)
  );
  const [progressive, setProgressive] = useState(initialOverrides.length > 0);
  const [imgLoading, setImgLoading] = useState(false);

  function switchTab(t) {
    setTab(t);
    if (!editing) {
      setForm(blankFor(t));
      setMode('custom');
    }
  }

  function set(k, v) {
    setForm(f => {
      const next = { ...f, [k]: v };
      if (k === 'sets' && progressive) {
        const n = Math.max(0, parseInt(v) || 0);
        const arr = [...(f.set_overrides || [])];
        while (arr.length < n) arr.push({ reps: f.reps || '', weight: f.weight || '' });
        next.set_overrides = arr.slice(0, n);
      }
      return next;
    });
  }

  function toggleProgressive(on) {
    setProgressive(on);
    setForm(f => {
      if (on) {
        const n = Math.max(0, parseInt(f.sets) || 0);
        return {
          ...f,
          set_overrides: Array.from({ length: n }, () => ({ reps: f.reps || '', weight: f.weight || '' })),
        };
      }
      return { ...f, set_overrides: [] };
    });
  }

  function setOverrideField(i, field, v) {
    setForm(f => {
      const arr = [...(f.set_overrides || [])];
      arr[i] = { ...arr[i], [field]: v };
      return { ...f, set_overrides: arr };
    });
  }

  async function handleImg(e) {
    const file = e.target.files[0];
    if (!file) return;
    setImgLoading(true);
    try {
      const b64 = await fileToBase64(file);
      setForm(f => ({ ...f, img_data: b64, img_url: '' }));
    } finally {
      setImgLoading(false);
      e.target.value = '';
    }
  }

  function handleRemoveImage(e) {
    e.preventDefault();
    e.stopPropagation();
    setForm(f => ({ ...f, img_data: '', img_url: '' }));
  }

  function addInterval() {
    set('intervals', [...(form.intervals || []), { id: uid(), intensity: 'moderate', duration: '', rpe: '' }]);
  }

  function setInterval(id, k, v) {
    set('intervals', form.intervals.map(i => (i.id === id ? { ...i, [k]: v } : i)));
  }

  function delInterval(id) {
    set('intervals', form.intervals.filter(i => i.id !== id));
  }

  function handleSave() {
    if (!form.name?.trim()) return alert('Please enter or select an exercise name.');
    const overrides = progressive && (form.set_overrides || []).length > 0
      ? form.set_overrides
      : [];
    const saved = {
      ...form,
      type: tab,
      rpe: (form.rpe !== '' && form.rpe != null) ? form.rpe : null,
      intervals: form.intervals ? JSON.stringify(form.intervals) : '[]',
      set_overrides: overrides.length > 0 ? JSON.stringify(overrides) : null,
    };
    onSave(saved);
  }

  return (
    <div>
      {!editing && (
        <div className="type-tabs">
          {Object.entries(TYPE_META).map(([k, m]) => (
            <button
              type="button"
              key={k}
              className={`type-tab${tab === k ? ' active' : ''}`}
              onClick={() => switchTab(k)}
            >
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: editing ? 0 : '18px 0 0' }}>
        {(mode === 'custom' || editing) && (
          <div>
            {!editing && (
              <button
                type="button"
                className="link-btn"
                style={{ marginBottom: 12 }}
                onClick={() => setMode('library')}
              >
                ← Back to library
              </button>
            )}

            <div className="form-row">
              <label className="form-label">Exercise Name *</label>
              <input
                className="form-input"
                value={form.name || ''}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Wall Push-ups"
              />
            </div>

            <div className="form-row">
              <label className="form-label">Emoji Icon</label>
              <input
                className="form-input"
                value={form.image || ''}
                onChange={e => set('image', e.target.value)}
                placeholder="e.g. 💪"
                style={{ width: 80 }}
              />
            </div>

            <div className="form-row">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={form.description || ''}
                onChange={e => set('description', e.target.value)}
                placeholder="Brief instructions..."
              />
            </div>

            <div className="form-row">
              <label className="form-label">Equipment</label>
              <input
                className="form-input"
                value={form.equipment || ''}
                onChange={e => set('equipment', e.target.value)}
                placeholder="e.g. Resistance band"
              />
            </div>

            {tab === 'resistance' && (
              <>
                <div className="ex-grid" style={{ marginBottom: 8 }}>
                  <div className="form-row">
                    <label className="form-label">Sets</label>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      value={form.sets || ''}
                      onChange={e => set('sets', e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <label className="form-label">Reps{progressive ? ' (default)' : ''}</label>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      value={form.reps || ''}
                      onChange={e => set('reps', e.target.value)}
                    />
                  </div>

                  <div className="form-row">
                    <label className="form-label">Weight{progressive ? ' (default)' : ''}</label>
                    <input
                      className="form-input"
                      value={form.weight || ''}
                      onChange={e => set('weight', e.target.value)}
                      placeholder="kg / lb"
                    />
                  </div>

                  <div className="form-row">
                    <label className="form-label">Rest</label>
                    <input
                      className="form-input"
                      value={form.rest || ''}
                      onChange={e => set('rest', e.target.value)}
                      placeholder="e.g. 60s"
                    />
                  </div>

                  <div className="form-row">
                    <label className="form-label">אזור בגוף</label>
                    <select
                      className="form-input"
                      value={form.body_area || ''}
                      onChange={e => set('body_area', e.target.value)}
                    >
                      <option value="">בחר אזור</option>
                      {BODY_AREAS.map(area => (
                        <option key={area} value={area}>{area}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Progressive sets toggle */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={progressive}
                      onChange={e => toggleProgressive(e.target.checked)}
                      style={{ width: 15, height: 15, accentColor: '#3b82f6' }}
                    />
                    <span style={{ fontWeight: 600, color: 'var(--gray-700)' }}>
                      Progressive sets (different reps / weight per set)
                    </span>
                  </label>
                </div>

                {/* Per-set table */}
                {progressive && (form.set_overrides || []).length > 0 && (
                  <div style={{ marginBottom: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Per-set prescription
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ width: 40, textAlign: 'left', fontSize: 12, color: 'var(--gray-500)', paddingBottom: 6, fontWeight: 600 }}>Set</th>
                          <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--gray-500)', paddingBottom: 6, fontWeight: 600 }}>Reps</th>
                          <th style={{ textAlign: 'left', fontSize: 12, color: 'var(--gray-500)', paddingBottom: 6, fontWeight: 600 }}>Weight</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(form.set_overrides || []).map((s, i) => (
                          <tr key={i}>
                            <td style={{ paddingBottom: 6, paddingRight: 8, fontSize: 13, fontWeight: 700, color: 'var(--gray-600)' }}>
                              {i + 1}
                            </td>
                            <td style={{ paddingBottom: 6, paddingRight: 8 }}>
                              <input
                                className="form-input"
                                type="number"
                                min="1"
                                value={s.reps}
                                onChange={e => setOverrideField(i, 'reps', e.target.value)}
                                placeholder={form.reps || '—'}
                                style={{ width: 80 }}
                              />
                            </td>
                            <td style={{ paddingBottom: 6 }}>
                              <input
                                className="form-input"
                                value={s.weight}
                                onChange={e => setOverrideField(i, 'weight', e.target.value)}
                                placeholder={form.weight || 'kg / lb'}
                                style={{ width: 100 }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {progressive && parseInt(form.sets) > 0 && (form.set_overrides || []).length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--gray-400)', marginBottom: 12 }}>
                    Enter a Sets value above to configure per-set reps and weight.
                  </p>
                )}
              </>
            )}

            {(tab === 'aerobic' || tab === 'other') && (
              <div className="form-row">
                <label className="form-label">Duration</label>
                <input
                  className="form-input"
                  value={form.duration || ''}
                  onChange={e => set('duration', e.target.value)}
                  placeholder="e.g. 20 min"
                />
              </div>
            )}

            {tab === 'aerobic' && (
              <div className="form-row">
                <label className="form-label">Intervals</label>
                <table className="interval-table">
                  <thead>
                    <tr>
                      <th>Intensity</th>
                      <th>Duration</th>
                      <th>RPE</th>
                      <th>Target HR</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.intervals || []).map(row => (
                      <tr key={row.id}>
                        <td>
                          <select
                            value={row.intensity}
                            onChange={e => setInterval(row.id, 'intensity', e.target.value)}
                          >
                            {INTENSITY_OPTIONS.map(o => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.duration}
                            onChange={e => setInterval(row.id, 'duration', e.target.value)}
                            placeholder="e.g. 2 min"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={row.rpe}
                            onChange={e => setInterval(row.id, 'rpe', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            value={row.target_hr || ''}
                            onChange={e => setInterval(row.id, 'target_hr', e.target.value)}
                            placeholder="e.g. 120–140"
                            style={{ width: 90 }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="int-del-btn"
                            onClick={() => delInterval(row.id)}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="add-interval-btn" onClick={addInterval}>
                  + Add interval
                </button>
              </div>
            )}

            {tab !== 'aerobic' && (
              <div className="form-row">
                <label className="form-label">Target RPE</label>
                <select
                  className="form-input"
                  value={form.rpe ?? ''}
                  onChange={e => set('rpe', e.target.value)}
                >
                  <option value="">—</option>
                  {Object.entries(RPE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {k} – {v}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="form-row">
              <label className="form-label">Notes</label>
              <textarea
                className="form-input"
                rows={2}
                value={form.notes || ''}
                onChange={e => set('notes', e.target.value)}
                placeholder="Any additional notes..."
              />
            </div>

            <div className="form-row">
              <label className="form-label">Reference Link</label>
              <input
                className="form-input"
                type="url"
                value={form.link || ''}
                onChange={e => set('link', e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="form-row">
              <label className="form-label">Image</label>

              <input
                type="file"
                accept="image/*"
                onChange={handleImg}
                style={{ display: 'block', marginBottom: 10 }}
              />

              {form.img_data && (
                <div style={{ marginBottom: 8 }}>
                  <img
                    src={form.img_data}
                    alt="exercise preview"
                    style={{ maxHeight: 120, borderRadius: 8, display: 'block', marginBottom: 4 }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {imgLoading ? 'Loading…' : form.img_data ? 'Image selected' : 'No file chosen'}
                </span>

                {form.img_data && (
                  <button
                    type="button"
                    className="link-btn danger"
                    style={{ fontSize: 12 }}
                    onClick={handleRemoveImage}
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {(mode === 'custom' || editing) && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            paddingTop: 16,
            borderTop: '1px solid var(--gray-200)',
            marginTop: 8,
          }}
        >
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {editing ? 'Save Changes' : 'Add Exercise'}
          </button>
        </div>
      )}
    </div>
  );
}
