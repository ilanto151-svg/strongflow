import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { keyToDate } from '../../utils/calendar';

const METRICS = [
  { key: 'fatigue',   label: 'Fatigue',   color: '#ef4444', emoji: '😴' },
  { key: 'pain',      label: 'Pain',      color: '#f59e0b', emoji: '🤕' },
  { key: 'wellbeing', label: 'Wellbeing', color: '#22c55e', emoji: '😊' },
];

function LineChart({ data, color, height = 120 }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-300)', fontSize: 13 }}>
        Not enough data
      </div>
    );
  }
  const w = 400;
  const pad = 10;
  const xStep = (w - pad * 2) / (data.length - 1);
  const maxVal = 10;
  const toY = v => pad + (height - pad * 2) * (1 - v / maxVal);
  const points = data.map((v, i) => `${pad + i * xStep},${toY(v)}`).join(' ');
  const areaPoints = `${pad},${height - pad} ${points} ${pad + (data.length - 1) * xStep},${height - pad}`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width: '100%', height }} preserveAspectRatio="none">
      {/* Grid lines */}
      {[0,2,4,6,8,10].map(v => (
        <line key={v} x1={pad} y1={toY(v)} x2={w - pad} y2={toY(v)}
          stroke="#f1f5f9" strokeWidth={1} />
      ))}
      {/* Area fill */}
      <polygon points={areaPoints} fill={color} fillOpacity={0.1} />
      {/* Line */}
      <polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots */}
      {data.map((v, i) => (
        <circle key={i} cx={pad + i * xStep} cy={toY(v)} r={3.5} fill={color} />
      ))}
    </svg>
  );
}

export default function ProgressView({ patient }) {
  const [reports, setReports]  = useState([]);
  const [period,  setPeriod]   = useState('weekly'); // weekly | monthly | yearly
  const [loading, setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/${patient.id}`)
      .then(r => setReports(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patient.id]);

  function buildData(metric) {
    const sorted = [...reports].sort((a, b) => a.day_key - b.day_key);
    if (period === 'weekly') {
      // Last 7 days
      const now = Date.now();
      const week = sorted.filter(r => {
        const d = keyToDate(r.day_key);
        return now - d.getTime() < 7 * 24 * 60 * 60 * 1000;
      });
      return week.map(r => r[metric] ?? null).filter(v => v !== null);
    }
    if (period === 'monthly') {
      const now = Date.now();
      const mo = sorted.filter(r => {
        const d = keyToDate(r.day_key);
        return now - d.getTime() < 30 * 24 * 60 * 60 * 1000;
      });
      return mo.map(r => r[metric] ?? null).filter(v => v !== null);
    }
    // yearly — weekly averages
    const now = Date.now();
    const yr = sorted.filter(r => {
      const d = keyToDate(r.day_key);
      return now - d.getTime() < 365 * 24 * 60 * 60 * 1000;
    });
    // Group into weeks
    const weeks = {};
    yr.forEach(r => {
      const wk = Math.floor(r.day_key / 7);
      if (!weeks[wk]) weeks[wk] = [];
      weeks[wk].push(r[metric] ?? null);
    });
    return Object.values(weeks).map(arr => {
      const vals = arr.filter(v => v !== null);
      return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10 : null;
    }).filter(v => v !== null);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>My Progress</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {['weekly','monthly','yearly'].map(p => (
            <button key={p} className={`btn btn-ghost${period === p ? ' active-tab' : ''}`} style={{ fontSize: 12, padding: '6px 12px' }}
              onClick={() => setPeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p style={{ color: 'var(--gray-400)' }}>Loading…</p> : (
        METRICS.map(m => {
          const data = buildData(m.key);
          const avg  = data.length ? (data.reduce((a, b) => a + b, 0) / data.length).toFixed(1) : '—';
          const last = data.length ? data[data.length - 1] : '—';
          return (
            <div key={m.key} className="metric-card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontWeight: 700 }}>{m.emoji} {m.label}</span>
                <div style={{ display: 'flex', gap: 16 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>AVG</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{avg}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>LAST</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{last}</div>
                  </div>
                </div>
              </div>
              <LineChart data={data} color={m.color} />
            </div>
          );
        })
      )}

      {!loading && reports.length === 0 && (
        <div className="empty">
          <div className="empty-icon">📈</div>
          <div>Submit daily check-ins to see your progress here.</div>
        </div>
      )}
    </div>
  );
}
