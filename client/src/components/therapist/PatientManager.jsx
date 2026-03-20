import { useState, useEffect } from 'react';
import api from '../../utils/api';
import PatientModal from './PatientModal';
import TreatmentSchedule from './TreatmentSchedule';
import ClinicalEvents from './ClinicalEvents';
import { ConfirmModal } from '../shared/Modal';
import { initials } from '../../utils/calendar';

export default function PatientManager({ onPatientsChanged }) {
  const [patients,          setPatients]          = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [showAdd,           setShowAdd]           = useState(false);
  const [editing,           setEditing]           = useState(null);
  const [deleting,          setDeleting]          = useState(null);
  const [treatmentPatient,  setTreatmentPatient]  = useState(null);
  const [eventsPatient,     setEventsPatient]     = useState(null);

  function load() {
    setLoading(true);
    api.get('/patients')
      .then(r => { setPatients(r.data); onPatientsChanged?.(r.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function addPatient(form) {
    await api.post('/patients', form);
    load();
    setShowAdd(false);
  }

  async function editPatient(form) {
    await api.put(`/patients/${editing.id}`, form);
    load();
    setEditing(null);
  }

  async function deletePatient() {
    await api.delete(`/patients/${deleting.id}`);
    load();
    setDeleting(null);
  }

  function dobToAge(dob) {
    if (!dob) return '—';
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Manage Patients</h2>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Patient</button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--gray-400)' }}>Loading…</p>
      ) : patients.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">👤</div>
          <div>No patients yet.</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Add First Patient</button>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--gray-200)', overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
          <table className="pm-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Age</th>
                <th>Phone</th>
                <th>Diagnosis</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--blue-bg)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                        {initials(p.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{p.name}</div>
                        {p.email && <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>{p.email}</div>}
                      </div>
                    </div>
                  </td>
                  <td>{dobToAge(p.dob)}</td>
                  <td>{p.phone || '—'}</td>
                  <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.diagnosis || '—'}</td>
                  <td>
                    <span className={`status-badge ${p.status === 'active' ? 'status-active' : 'status-inactive'}`}>
                      {p.status === 'active' ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="icon-btn" title="Clinical Events" onClick={() => setEventsPatient(p)}>📅</button>
                      <button className="icon-btn" title="Treatment Schedule" onClick={() => setTreatmentPatient(p)}>💊</button>
                      <button className="icon-btn" onClick={() => setEditing(p)}>✏️</button>
                      <button className="icon-btn" onClick={() => setDeleting(p)}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && <PatientModal onSave={addPatient} onClose={() => setShowAdd(false)} />}
      {editing  && <PatientModal initial={editing} onSave={editPatient} onClose={() => setEditing(null)} />}

      {eventsPatient && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setEventsPatient(null)}>
          <div className="modal" style={{ maxWidth: 720, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">📅 Clinical Events</span>
              <button className="icon-btn" onClick={() => setEventsPatient(null)}>✕</button>
            </div>
            <div className="modal-body">
              <ClinicalEvents patient={eventsPatient} />
            </div>
          </div>
        </div>
      )}

      {treatmentPatient && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setTreatmentPatient(null)}>
          <div className="modal" style={{ maxWidth: 680, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">💊 Treatment Schedule</span>
              <button className="icon-btn" onClick={() => setTreatmentPatient(null)}>✕</button>
            </div>
            <div className="modal-body">
              <TreatmentSchedule patient={treatmentPatient} />
            </div>
          </div>
        </div>
      )}
      {deleting && (
        <ConfirmModal
          message={`Delete patient "${deleting.name}"? All their exercises and reports will be permanently removed.`}
          onConfirm={deletePatient}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
