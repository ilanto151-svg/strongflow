import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { RPE } from '../../constants';
import { keyToDate, fmtDate } from '../../utils/calendar';
import ReportGraph from './ReportGraph';

export default function Reports({ patient }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [view,    setView]    = useState('graph'); // 'graph' | 'list'

  useEffect(() => {
    if (!patient) return;
    setLoading(true);
    api.get(`/reports/${patient.id}`)
      .then(r => setReports(r.data.sort((a, b) => b.day_key - a.day_key)))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patient]);

  if (!patient) {
    return (
      <div className="empty">
        <div className="empty-icon">📊</div>
        <div>Select a patient to view their check-in reports.</div>
      </div>
    );
  }

  function rpeColor(v) {
    if (v <= 2) return '#22c55e';
    if (v <= 5) return '#f59e0b';
    if (v <= 7) return '#f97316';
    return '#ef4444';
  }

  // Chart needs ascending order; list view keeps descending (newest first)
  const sortedAsc = [...reports].sort((a, b) => a.day_key - b.day_key);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Check-in Reports</h2>
          <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>{patient.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn btn-ghost${view === 'graph' ? ' active-tab' : ''}`} onClick={() => setView('graph')}>📈 Graph</button>
          <button className={`btn btn-ghost${view === 'list'  ? ' active-tab' : ''}`} onClick={() => setView('list')}>📋 List</button>
        </div>
      </div>

      {loading ? (
        <p style={{ color: 'var(--gray-400)' }}>Loading…</p>

      ) : view === 'graph' ? (
        reports.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📈</div>
            <div>No check-in reports yet. The graph will appear once the patient submits their first check-in.</div>
          </div>
        ) : (
          <ReportGraph patient={patient} reports={sortedAsc} />
        )

      ) : (
        reports.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📝</div>
            <div>No check-in reports submitted yet.</div>
          </div>
        ) : (
          reports.map(r => {
            const date = keyToDate(r.day_key);
            const sessionRpe  = r.session_rpe  || {};
            const sessionData = r.session_data || {};
            const hasExerciseLog = Object.keys(sessionData).length > 0;
            return (
              <div key={r.id} className="metric-card" style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontWeight: 700 }}>{fmtDate(date)}</span>
                  <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                    {r.submitted_at ? new Date(r.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>

                {/* Fatigue / Pain / Wellbeing */}
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  {[['Fatigue', r.fatigue], ['Pain', r.pain], ['Wellbeing', r.wellbeing]].map(([label, val]) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 2 }}>{label}</div>
                      <div style={{ fontSize: 26, fontWeight: 800, color: rpeColor(val) }}>{val ?? '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{val != null ? RPE[val] : ''}</div>
                    </div>
                  ))}
                </div>

                {/* Session RPE badges */}
                {Object.keys(sessionRpe).length > 0 && (
                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {Object.entries(sessionRpe).map(([type, rpe]) => {
                      const cleanType = type.includes('_') ? type.split('_').slice(1).join('_') : type;
                      return (
                        <span key={type} style={{ fontSize: 12, background: 'var(--gray-100)', borderRadius: 8, padding: '2px 10px', color: 'var(--gray-600)' }}>
                          Session RPE ({cleanType}): {rpe}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Exercise log */}
                {hasExerciseLog && (
                  <div style={{ marginTop: 12, borderTop: '2px solid #bae6fd', paddingTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1d4ed8', marginBottom: 10 }}>
                      🏋️ Exercise Log — Patient's Actual Performance
                    </div>
                    {Object.values(sessionData).map((ex, i) => (
                      <div key={i} style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 10, padding: '10px 14px', marginBottom: 8 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--gray-800)', marginBottom: 8 }}>{ex.name}</div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {[['Sets', ex.p_sets, ex.sets], ['Reps', ex.p_reps, ex.reps], ['Weight', ex.p_weight, ex.weight]].map(([label, prescribed, actual]) => (
                            <div key={label} style={{ background: '#fff', border: '1px solid #e0f2fe', borderRadius: 8, padding: '6px 12px', minWidth: 72, textAlign: 'center' }}>
                              <div style={{ fontSize: 10, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                              {prescribed && <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 2 }}>Rx: {prescribed}</div>}
                              <div style={{ fontSize: 20, fontWeight: 800, color: actual ? '#1d4ed8' : 'var(--gray-300)' }}>{actual || '—'}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {r.notes && <p style={{ fontSize: 13, color: 'var(--gray-600)', marginTop: 10, borderTop: '1px solid var(--gray-100)', paddingTop: 10 }}>💬 {r.notes}</p>}
              </div>
            );
          })
        )
      )}
    </div>
  );
}
