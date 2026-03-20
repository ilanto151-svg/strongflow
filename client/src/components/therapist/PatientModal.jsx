import { useState } from 'react';
import Modal from '../shared/Modal';

const BLANK = { name:'', phone:'', email:'', dob:'', gender:'', diagnosis:'', medhistory:'', notes:'', status:'active', equipment:'', environment:'', comorbidities:'' };

function parseComorbidities(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

function parseMedEntries(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  // Legacy plain-text — wrap as a single entry with no date
  return [{ id: 'mh_legacy', date: '', text: raw.trim() }];
}

function newId() {
  return 'mh_' + Math.random().toString(36).slice(2, 9);
}

function fmtDate(iso) {
  if (!iso) return 'No date';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PatientModal({ initial, onSave, onClose }) {
  const [form,    setForm]    = useState(initial ? { ...BLANK, ...initial } : { ...BLANK });
  const [loading, setLoading] = useState(false);

  // Comorbidities
  const [comorbidities, setComorbidities] = useState(() => parseComorbidities(initial?.comorbidities));
  const [comorInput,    setComorInput]    = useState('');

  function addComorbidities() {
    const tags = comorInput.split(',').map(s => s.trim()).filter(Boolean);
    if (!tags.length) return;
    setComorbidities(prev => [...prev, ...tags.filter(t => !prev.includes(t))]);
    setComorInput('');
  }

  // Medical history entries
  const [entries,    setEntries]    = useState(() => parseMedEntries(initial?.medhistory));
  const [editingId,  setEditingId]  = useState(null); // null | 'new' | entry id
  const [draftDate,  setDraftDate]  = useState('');
  const [draftText,  setDraftText]  = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function openNew() {
    setEditingId('new');
    setDraftDate(new Date().toISOString().split('T')[0]);
    setDraftText('');
  }

  function openEdit(entry) {
    setEditingId(entry.id);
    setDraftDate(entry.date);
    setDraftText(entry.text);
  }

  function cancelEdit() { setEditingId(null); }

  function commitEntry() {
    if (!draftText.trim()) return;
    if (editingId === 'new') {
      setEntries(prev => [{ id: newId(), date: draftDate, text: draftText.trim() }, ...prev]);
    } else {
      setEntries(prev => prev.map(e =>
        e.id === editingId ? { ...e, date: draftDate, text: draftText.trim() } : e
      ));
    }
    setEditingId(null);
  }

  async function handleSave() {
    if (!form.name?.trim())  return alert('Patient name is required.');
    if (!form.phone?.trim()) return alert('Phone number is required.');
    setLoading(true);
    try {
      await onSave({ ...form, medhistory: JSON.stringify(entries), comorbidities: JSON.stringify(comorbidities) });
    } finally {
      setLoading(false);
    }
  }

  const entryEditor = (
    <div style={{ border: '2px solid var(--blue)', borderRadius: 12, padding: 12, marginBottom: 10, background: 'var(--blue-bg)' }}>
      <input
        type="date"
        className="form-input"
        style={{ marginBottom: 8 }}
        value={draftDate}
        onChange={e => setDraftDate(e.target.value)}
      />
      <textarea
        className="form-input"
        rows={3}
        value={draftText}
        onChange={e => setDraftText(e.target.value)}
        placeholder="Enter medical history note..."
        autoFocus
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={cancelEdit}>Cancel</button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={commitEntry}>Save Entry</button>
      </div>
    </div>
  );

  return (
    <Modal
      title={initial ? 'Edit Patient' : 'Add Patient'}
      onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={loading}>
          {loading ? 'Saving…' : initial ? 'Save Changes' : 'Add Patient'}
        </button>
      </>}
    >
      <div className="ex-grid">
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Full Name *</label>
          <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Miriam Levi" />
        </div>
        <div className="form-row">
          <label className="form-label">Phone *</label>
          <input className="form-input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+972..." />
        </div>
        <div className="form-row">
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="patient@example.com" />
        </div>
        <div className="form-row">
          <label className="form-label">Date of Birth</label>
          <input className="form-input" type="date" value={form.dob || ''} onChange={e => set('dob', e.target.value)} />
        </div>
        <div className="form-row">
          <label className="form-label">Gender</label>
          <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other / Prefer not to say</option>
          </select>
        </div>
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Diagnosis</label>
          <input className="form-input" value={form.diagnosis} onChange={e => set('diagnosis', e.target.value)} placeholder="e.g. Breast Cancer Stage II" />
        </div>

        {/* ── Comorbidities ───────────────────────────────────────────── */}
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Comorbidities</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {comorbidities.map(tag => (
              <span key={tag} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--blue-bg)', color: 'var(--blue)', borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>
                {tag}
                <button
                  onClick={() => setComorbidities(prev => prev.filter(t => t !== tag))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: 14, lineHeight: 1, padding: 0 }}
                >×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              value={comorInput}
              onChange={e => setComorInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addComorbidities())}
              placeholder="e.g. Diabetes, Hypertension (comma-separated)"
              style={{ flex: 1 }}
            />
            <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={addComorbidities}>Add</button>
          </div>
        </div>

        {/* ── Medical History ─────────────────────────────────────────── */}
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label className="form-label" style={{ marginBottom: 0 }}>Medical History</label>
            {editingId !== 'new' && (
              <button className="btn btn-ghost" style={{ fontSize: 12, padding: '3px 10px' }} onClick={openNew}>
                + New Entry
              </button>
            )}
          </div>

          {editingId === 'new' && entryEditor}

          {entries.length === 0 && editingId !== 'new' && (
            <p style={{ fontSize: 13, color: 'var(--gray-400)', padding: '4px 0 8px' }}>No entries yet.</p>
          )}

          {entries.map(entry =>
            editingId === entry.id ? (
              <div key={entry.id}>{entryEditor}</div>
            ) : (
              <div key={entry.id} style={{
                border: '1px solid var(--gray-200)', borderRadius: 12, padding: '12px 14px',
                marginBottom: 8, background: '#fff', boxShadow: 'var(--shadow)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue)' }}>{fmtDate(entry.date)}</span>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => openEdit(entry)}>
                    ✏️ Edit
                  </button>
                </div>
                <p style={{ fontSize: 13, color: 'var(--gray-700)', whiteSpace: 'pre-wrap', margin: 0, lineHeight: 1.5 }}>
                  {entry.text}
                </p>
              </div>
            )
          )}
        </div>

        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Available Equipment</label>
          <textarea className="form-input" rows={2} value={form.equipment} onChange={e => set('equipment', e.target.value)} placeholder="e.g. Resistance bands, dumbbells, yoga mat..." />
        </div>
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Exercise Environment</label>
          <input className="form-input" value={form.environment} onChange={e => set('environment', e.target.value)} placeholder="e.g. Home, gym, outdoor, hospital room..." />
        </div>
        <div className="form-row" style={{ gridColumn: 'span 2' }}>
          <label className="form-label">Notes</label>
          <textarea className="form-input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." />
        </div>
        {initial && (
          <div className="form-row">
            <label className="form-label">Status</label>
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        )}
      </div>
    </Modal>
  );
}
