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

  // Given planned and actual RPE values, return the styling tokens for the comparison UI.
  function rpeCompare(planned, actual) {
    if (planned == null || actual == null) return null;
    const diff = Number(actual) - Number(planned);
    if (Math.abs(diff) <= 1) {
      return { diff, badge: '✓',          bg: '#f0fdf4', border: '#86efac', color: '#16a34a', label: 'On target' };
    }
    if (diff > 1) {
      return { diff, badge: `▲ +${diff}`, bg: '#fef2f2', border: '#fca5a5', color: '#dc2626', label: 'Overload'  };
    }
    return   { diff, badge: `▼ ${diff}`,  bg: '#eff6ff', border: '#93c5fd', color: '#2563eb', label: 'Underload' };
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
            const date        = keyToDate(r.day_key);
            const sessionRpe  = r.session_rpe  || {};
            const sessionData = r.session_data || {};
            const hasExerciseLog  = Object.keys(sessionData).length > 0;
            const hasSessionRpe   = Object.keys(sessionRpe).length > 0;
            const showRpeSection  = hasSessionRpe || r.planned_rpe != null;

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

                {/* Session RPE — planned vs actual comparison */}
                {showRpeSection && (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--gray-100)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 }}>
                      Session RPE
                    </div>

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

                      {/* Planned / target badge */}
                      {r.planned_rpe != null && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: '#f0fdf4', border: '1px solid #bbf7d0',
                          borderRadius: 8, padding: '5px 11px',
                        }}>
                          <span style={{ fontSize: 10, color: '#166534', fontWeight: 700 }}>🎯 TARGET</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>
                            {r.planned_rpe}
                          </span>
                          <span style={{ fontSize: 10, color: '#166534' }}>{RPE[r.planned_rpe]}</span>
                        </div>
                      )}

                      {/* Arrow shown only when both target and actual exist */}
                      {r.planned_rpe != null && hasSessionRpe && (
                        <span style={{ fontSize: 14, color: 'var(--gray-300)', userSelect: 'none' }}>→</span>
                      )}

                      {/* Actual per-type, each with comparison indicator */}
                      {Object.entries(sessionRpe).map(([type, actual]) => {
                        const cleanType = type.includes('_')
                          ? type.split('_').slice(1).join('_')
                          : type;
                        const cmp = rpeCompare(r.planned_rpe, actual);

                        const bg        = cmp?.bg        ?? 'var(--gray-100)';
                        const border    = cmp?.border    ?? 'var(--gray-200)';
                        const textColor = cmp?.color     ?? 'var(--gray-600)';

                        return (
                          <div key={type} style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            background: bg, border: `1px solid ${border}`,
                            borderRadius: 8, padding: '5px 11px',
                          }}>
                            <span style={{ fontSize: 10, color: textColor, fontWeight: 700, textTransform: 'capitalize' }}>
                              {cleanType}
                            </span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: textColor, lineHeight: 1 }}>
                              {actual}
                            </span>
                            {cmp && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, color: textColor,
                                background: textColor + '18', borderRadius: 5,
                                padding: '1px 5px', marginLeft: 1,
                              }}>
                                {cmp.badge}
                              </span>
                            )}
                          </div>
                        );
                      })}

                      {/* Edge case: planned exists but patient logged nothing */}
                      {r.planned_rpe != null && !hasSessionRpe && (
                        <span style={{ fontSize: 12, color: 'var(--gray-400)', fontStyle: 'italic' }}>
                          No actual RPE logged
                        </span>
                      )}
                    </div>
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
