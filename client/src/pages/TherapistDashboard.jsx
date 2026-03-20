import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import ExercisePlan from '../components/therapist/ExercisePlan';
import PatientManager from '../components/therapist/PatientManager';
import Reports from '../components/therapist/Reports';
import ShareProgram from '../components/therapist/ShareProgram';
import { initials } from '../utils/calendar';

export default function TherapistDashboard() {
  const { user, logout } = useAuth();

  const [patients,     setPatients]     = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [view,          setView]          = useState('plan'); // plan | patients | reports | share
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [tname,           setTname]           = useState('');
  const [editingName,     setEditingName]     = useState(false);
  const [nameInput,       setNameInput]       = useState('');
  const [whatsapp,        setWhatsapp]        = useState('');
  const [editingWhatsapp, setEditingWhatsapp] = useState(false);
  const [whatsappInput,   setWhatsappInput]   = useState('');

  // Load therapist name & patients on mount
  useEffect(() => {
    api.get('/therapist/me').then(r => {
      setTname(r.data.name || 'Therapist');
      setNameInput(r.data.name || '');
      setWhatsapp(r.data.whatsapp_number || '');
      setWhatsappInput(r.data.whatsapp_number || '');
    }).catch(() => {});
    api.get('/patients').then(r => {
      setPatients(r.data);
      if (r.data.length > 0) setActivePatient(r.data[0]);
    }).catch(() => {});
  }, []);

  function selectPatient(p) {
    setActivePatient(p);
    setView('plan');
    setSidebarOpen(false);
  }

  async function saveName() {
    await api.put('/therapist/name', { name: nameInput });
    setTname(nameInput);
    setEditingName(false);
  }

  async function saveWhatsapp() {
    await api.put('/therapist/settings', { whatsapp_number: whatsappInput });
    setWhatsapp(whatsappInput);
    setEditingWhatsapp(false);
  }

  function handlePatientsChanged(pts) {
    setPatients(pts);
    if (!activePatient && pts.length > 0) setActivePatient(pts[0]);
  }

  const navItems = [
    { id: 'plan',     label: '📋 Exercise Plans' },
    { id: 'patients', label: '👥 Manage Patients' },
    { id: 'reports',  label: '📊 Reports' },
  ];

  return (
    <div className="t-layout">
      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        {/* Therapist header */}
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <img src="/logo.png" alt="StrongFlow" style={{ height: 42, width: 42, borderRadius: 10, objectFit: 'cover' }} onError={e => { e.target.style.display='none'; }} />
            <span className="sidebar-brand">StrongFlow</span>
          </div>
          {editingName ? (
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <input className="form-input" value={nameInput} onChange={e => setNameInput(e.target.value)} style={{ fontSize: 13 }} />
              <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={saveName}>✓</button>
              <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { setNameInput(tname); setEditingName(false); }}>✕</button>
            </div>
          ) : (
            <button className="sidebar-name-btn" onClick={() => setEditingName(true)} title="Click to edit name">
              {tname} ✏️
            </button>
          )}

          {/* WhatsApp number for notifications */}
          {editingWhatsapp ? (
            <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
              <input className="form-input" value={whatsappInput} onChange={e => setWhatsappInput(e.target.value)} placeholder="+972501234567" style={{ fontSize: 13, flex: 1 }} />
              <button className="btn btn-primary" style={{ padding: '5px 10px', fontSize: 12 }} onClick={saveWhatsapp}>✓</button>
              <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => { setWhatsappInput(whatsapp); setEditingWhatsapp(false); }}>✕</button>
            </div>
          ) : (
            <button className="sidebar-name-btn" onClick={() => setEditingWhatsapp(true)} title="Click to set WhatsApp number for notifications" style={{ fontSize: 12, opacity: 0.8 }}>
              💬 {whatsapp || 'Add WhatsApp'} ✏️
            </button>
          )}
        </div>

        {/* Nav */}
        <nav className="sidebar-nav">
          {navItems.map(n => (
            <button key={n.id}
              className={`sidebar-nav-item${view === n.id ? ' active' : ''}`}
              onClick={() => { setView(n.id); setSidebarOpen(false); }}
            >
              {n.label}
            </button>
          ))}
        </nav>

        {/* Patient list */}
        <div className="sidebar-section-label">Patients</div>
        <div className="patient-list">
          {patients.length === 0 && <p style={{ fontSize: 13, color: 'var(--gray-400)', padding: '0 16px' }}>No patients yet</p>}
          {patients.map(p => (
            <button key={p.id}
              className={`patient-list-item${activePatient?.id === p.id ? ' active' : ''}`}
              onClick={() => selectPatient(p)}
            >
              <div className="pt-avatar">{initials(p.name)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-400)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.diagnosis || p.phone}</div>
              </div>
              {p.status !== 'active' && <span className="status-badge status-inactive" style={{ marginLeft: 'auto', flexShrink: 0 }}>Inactive</span>}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          {activePatient && (
            <button className="btn btn-outline-green" style={{ marginBottom: 8, width: '100%' }} onClick={() => setView('share')}>
              📤 Share Program
            </button>
          )}
          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center' }} onClick={logout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="t-main">
        {/* Mobile header */}
        <div className="t-mobile-header">
          <button className="icon-btn" onClick={() => setSidebarOpen(true)}>☰</button>
          <span style={{ fontWeight: 700 }}>StrongFlow</span>
          <button className="icon-btn" onClick={logout}>⏻</button>
        </div>

        <div className="t-content">
          {view === 'plan'     && <ExercisePlan patient={activePatient} />}
          {view === 'patients' && <PatientManager onPatientsChanged={handlePatientsChanged} />}
          {view === 'reports'  && <Reports patient={activePatient} />}
          {view === 'share'    && <ShareProgram patient={activePatient} onClose={() => setView('plan')} />}
        </div>
      </main>
    </div>
  );
}
