import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import TodayView   from '../components/patient/TodayView';
import WeekView    from '../components/patient/WeekView';
import MonthView   from '../components/patient/MonthView';
import CheckInView from '../components/patient/CheckInView';
import ProgressView from '../components/patient/ProgressView';

const TABS = [
  { id: 'today',    label: 'Today',     icon: '🏃' },
  { id: 'week',     label: 'Week',      icon: '📅' },
  { id: 'month',    label: 'Month',     icon: '🗓️' },
  { id: 'checkin',  label: 'Check-in',  icon: '✅' },
  { id: 'progress', label: 'Progress',  icon: '📈' },
];

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const [tab,       setTab]       = useState('today');
  const [exercises, setExercises] = useState([]);
  const [patient,   setPatient]   = useState(null);
  const [reports,   setReports]   = useState([]);
  const [loading,   setLoading]   = useState(true);

  const load = useCallback(() => {
    if (!user?.patientId) return;
    setLoading(true);
    Promise.all([
      api.get(`/patients/${user.patientId}`),
      api.get(`/exercises/${user.patientId}`),
      api.get(`/reports/${user.patientId}`),
    ])
      .then(([pRes, eRes, rRes]) => {
        setPatient(pRes.data);
        setExercises(eRes.data);
        setReports(rRes.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(load, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--gray-500)' }}>
      Loading your program…
    </div>
  );

  if (!patient) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16 }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <p>Could not load your profile. Please try logging in again.</p>
      <button className="btn btn-ghost" onClick={logout}>Sign Out</button>
    </div>
  );

  return (
    <div className="p-portal">
      {/* Desktop top nav */}
      <header className="p-nav">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', fontWeight: 700, fontSize: 17, color: 'var(--blue)', marginRight: 16 }}>
          <img src="/logo.png" alt="StrongFlow" style={{ height: 36, width: 36, borderRadius: 8, objectFit: 'cover' }} onError={e => { e.target.style.display='none'; }} /> StrongFlow
        </div>
        {TABS.map(t => (
          <button key={t.id} className={`p-nav-btn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ fontSize: 13 }} onClick={logout}>Sign Out</button>
      </header>

      {/* Main content */}
      <div className="p-main">
        {tab === 'today'    && <TodayView    patient={patient} exercises={exercises} reports={reports} reload={load} />}
        {tab === 'week'     && <WeekView     exercises={exercises} />}
        {tab === 'month'    && <MonthView    exercises={exercises} />}
        {tab === 'checkin'  && <CheckInView  patient={patient} onReported={load} />}
        {tab === 'progress' && <ProgressView patient={patient} />}
      </div>

      {/* Mobile bottom nav */}
      <nav className="btm-nav">
        {TABS.map(t => (
          <button key={t.id} className={`btm-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            <span className="btm-icon">{t.icon}</span>
            <span className="btm-label">{t.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
