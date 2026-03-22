import { useState, useRef } from 'react';
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
const BLANK_OTH = { type: 'other',      name: '', image: '', description: '', equipment: '', duration: '', rpe: '', notes: '', img_data: '', img_url: '', link: '' };
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
  if (t === 'aerobic')    return { ...BLANK_AER, intervals: [] };
  return { ...BLANK_OTH };
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result);
    r.onerror = () => rej(new Error('Read error'));
    r.readAsDataURL(file);
  });
}

export default function ExerciseForm({ initial, onSave, onClose }) {
  const editing = !!initial;
  const [tab,  setTab]  = useState(initial?.type || 'resistance');
  const [mode, setMode] = useState('custom');
  const [form, setForm] = useState(initial ? { ...initial, intervals: initial.intervals ? JSON.parse(initial.intervals) : [] } : blankFor(tab));
  const [imgLoading, setImgLoading] = useState(false);
  const fileInputRef = useRef(null);

  function switchTab(t) {
    setTab(t);
    if (!editing) {
      setForm(blankFor(t));
      setMode('custom');
    }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

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

 function handleChooseImage() {
  if (!fileInputRef.current) {
    console.log('file input not found');
    return;
  }

  console.log('opening file picker...');
  fileInputRef.current.click();
}

  function handleRemoveImage(e) {
    e.preventDefault();
    e.stopPropagation();
    setForm(f => ({ ...f, img_data: '', img_url: '' }));
  }

  // ── Intervals (aerobic) ───────────────────────────────────────────────────
  function addInterval() {
    set('intervals', [...(form.intervals || []), { id: uid(), intensity: 'moderate', duration: '', rpe: '' }]);
  }
  function setInterval(id, k, v) {
    set('intervals', form.intervals.map(i => i.id === id ? { ...i, [k]: v } : i));
  }
  function delInterval(id) {
    set('intervals', form.intervals.filter(i => i.id !== id));
  }

  function handleSave() {
    if (!form.name?.trim()) return alert('Please enter or select an exercise name.');
    const saved = {
      ...form,
      type: tab,
      intervals: form.intervals ? JSON.stringify(form.intervals) : '[]',
    };
    onSave(saved);
  }

  return (
    <div>
      {/* Always-mounted hidden file input — positioned off-screen so Safari allows programmatic .click() */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleImg}
        style={{
          position: 'absolute',
          left: '-9999px',
          width: '1px',
          height: '1px',
          opacity: 0,
        }}
      />

      {/* Type tabs */}
      {!editing && (
        <div className="type-tabs">
          {Object.entries(TYPE_META).map(([k, m]) => (
            <button type="button" key={k} className={`type-tab${tab === k ? ' active' : ''}`} onClick={() => switchTab(k)}>
              {m.icon} {m.label}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: editing ? 0 : '18px 0 0' }}>
        {(mode === 'custom' || editing) && (
          <div>
            {!editing && (
              <button type="button" className="link-btn" style={{ marginBottom: 12 }} onClick={() => setMode('library')}>← Back to library</button>
            )}
            <div className="form-row">
              <label className="form-label">Exercise Name *</label>
              <input className="form-input" value={form.name || ''} onChange={e => set('name', e.target.value)} placeholder="e.g. Wall Push-ups" />
            </div>
            <div className="form-row">
              <label className="form-label">Emoji Icon</label>
              <input className="form-input" value={form.image || ''} onChange={e => set('image', e.target.value)} placeholder="e.g. 💪" style={{ width: 80 }} />
            </div>
            <div className="form-row">
              <label className="form-label">Description</label>
              <input className="form-input" value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Brief instructions..." />
            </div>
            <div className="form-row">
              <label className="form-label">Equipment</label>
              <input className="form-input" value={form.equipment || ''} onChange={e => set('equipment', e.target.value)} placeholder="e.g. Resistance band" />
            </div>

            {tab === 'resistance' && (
              <div className="ex-grid" style={{ marginBottom: 12 }}>
                <div className="form-row"><label className="form-label">Sets</label><input className="form-input" type="number" min="1" value={form.sets || ''} onChange={e => set('sets', e.target.value)} /></div>
                <div className="form-row"><label className="form-label">Reps</label><input className="form-input" type="number" min="1" value={form.reps || ''} onChange={e => set('reps', e.target.value)} /></div>
                <div className="form-row"><label className="form-label">Weight</label><input className="form-input" value={form.weight || ''} onChange={e => set('weight', e.target.value)} placeholder="kg / lb" /></div>
                <div className="form-row"><label className="form-label">Rest</label><input className="form-input" value={form.rest || ''} onChange={e => set('rest', e.target.value)} placeholder="e.g. 60s" /></div>
                <div className="form-row">
                  <label className="form-label">אזור בגוף</label>
                  <select className="form-input" value={form.body_area || ''} onChange={e => set('body_area', e.target.value)}>
                    <option value="">בחר אזור</option>
                    {BODY_AREAS.map(area => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {(tab === 'aerobic' || tab === 'other') && (
              <div className="form-row">
                <label className="form-label">Duration</label>
                <input className="form-input" value={form.duration || ''} onChange={e => set('duration', e.target.value)} placeholder="e.g. 20 min" />
              </div>
            )}

            {tab === 'aerobic' && (
              <div className="form-row">
                <label className="form-label">Intervals</label>
                <table className="interval-table">
                  <thead>
                    <tr>
                      <th>Intensity</th><th>Duration</th><th>RPE</th><th>Target HR</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(form.intervals || []).map(row => (
                      <tr key={row.id}>
                        <td>
                          <select value={row.intensity} onChange={e => setInterval(row.id, 'intensity', e.target.value)}>
                            {INTENSITY_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </td>
                        <td><input type="text" value={row.duration} onChange={e => setInterval(row.id, 'duration', e.target.value)} placeholder="e.g. 2 min" /></td>
                        <td><input type="number" min="0" max="10" value={row.rpe} onChange={e => setInterval(row.id, 'rpe', e.target.value)} /></td>
                        <td><input type="text" value={row.target_hr || ''} onChange={e => setInterval(row.id, 'target_hr', e.target.value)} placeholder="e.g. 120–140" style={{ width: 90 }} /></td>
                        <td><button type="button" className="int-del-btn" onClick={() => delInterval(row.id)}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button type="button" className="add-interval-btn" onClick={addInterval}>+ Add interval</button>
              </div>
            )}

            {tab !== 'aerobic' && (
              <div className="form-row">
                <label className="form-label">Target RPE</label>
                <select className="form-input" value={form.rpe || ''} onChange={e => set('rpe', e.target.value)}>
                  <option value="">—</option>
                  {Object.entries(RPE).map(([k, v]) => <option key={k} value={k}>{k} – {v}</option>)}
                </select>
              </div>
            )}

            <div className="form-row">
              <label className="form-label">Notes</label>
              <textarea className="form-input" rows={2} value={form.notes || ''} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." />
            </div>

            <div className="form-row">
              <label className="form-label">Reference Link</label>
              <input className="form-input" type="url" value={form.link || ''} onChange={e => set('link', e.target.value)} placeholder="https://..." />
            </div>

            <div className="form-row">
              <label className="form-label">Image</label>

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
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 13 }}
                  disabled={imgLoading}
                  onClick={handleChooseImage}
                >
                  {imgLoading ? 'Loading…' : 'Choose image'}
                </button>
                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {form.img_data ? 'Image selected' : 'No file chosen'}
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
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--gray-200)', marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            {editing ? 'Save Changes' : 'Add Exercise'}
          </button>
        </div>
      )}
    </div>
  );
}
