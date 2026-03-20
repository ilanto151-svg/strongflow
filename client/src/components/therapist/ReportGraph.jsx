import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { dateToKey, keyToDate, localDateStr } from '../../utils/calendar';

const METRICS = [
  { key: 'fatigue',   label: 'Fatigue',   color: '#ef4444', emoji: '😴', lowerIsBetter: true },
  { key: 'pain',      label: 'Pain',      color: '#f59e0b', emoji: '🤕', lowerIsBetter: true },
  { key: 'wellbeing', label: 'Wellbeing', color: '#22c55e', emoji: '😊', lowerIsBetter: false },
];

// SVG chart layout constants
const SVG_W  = 560;
const PAD_L  = 22;   // Y-axis label space
const PAD_R  = 8;
const PAD_T  = 20;   // room for 🎗️ emoji above plot
const PAD_B  = 30;   // X-axis label space
const PLOT_H = 90;
const SVG_H  = PAD_T + PLOT_H + PAD_B;  // 140
const PLOT_W = SVG_W - PAD_L - PAD_R;   // 530

// ── Date range helpers ────────────────────────────────────────────────────────

function getDateRange(period, offset) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const sun = new Date(now);
    sun.setDate(sun.getDate() - sun.getDay() + offset * 7);
    const sat = new Date(sun);
    sat.setDate(sat.getDate() + 6);
    return { start: sun, end: sat };
  }

  if (period === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end   = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    return { start, end };
  }

  // year: rolling 12-month window ending today (or offset * 12 months back)
  const end   = new Date(now.getFullYear(), now.getMonth() + offset * 12, now.getDate());
  const start = new Date(end.getFullYear() - 1, end.getMonth(), end.getDate() + 1);
  return { start, end };
}

function rangeLabel(period, offset) {
  const { start, end } = getDateRange(period, offset);
  const fmt = (d, opts) => d.toLocaleDateString('en-GB', opts);
  if (period === 'week')  return `${fmt(start, { day: 'numeric', month: 'short' })} – ${fmt(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  if (period === 'month') return fmt(start, { month: 'long', year: 'numeric' });
  return `${fmt(start, { month: 'short', year: 'numeric' })} – ${fmt(end, { month: 'short', year: 'numeric' })}`;
}

// ── Data aggregation ──────────────────────────────────────────────────────────

function buildPoints(reports, metric, period, offset) {
  const { start, end } = getDateRange(period, offset);

  if (period === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const d   = new Date(start);
      d.setDate(start.getDate() + i);
      const r = reports.find(r => r.day_key === dateToKey(d));
      return { date: d, value: r?.[metric] ?? null };
    });
  }

  if (period === 'month') {
    return Array.from({ length: end.getDate() }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), i + 1);
      const r = reports.find(r => r.day_key === dateToKey(d));
      return { date: d, value: r?.[metric] ?? null };
    });
  }

  // year: weekly averages, iterate 7 days at a time
  const pts = [];
  const cur = new Date(start);
  while (cur <= end) {
    const wStart = new Date(cur);
    const wEnd   = new Date(cur);
    wEnd.setDate(wEnd.getDate() + 6);
    const wReps = reports.filter(r => {
      const d = keyToDate(r.day_key);
      return d >= wStart && d <= wEnd;
    });
    const vals = wReps.map(r => r[metric]).filter(v => v != null);
    const mid  = new Date(cur);
    mid.setDate(mid.getDate() + 3);
    pts.push({
      date:  mid,
      value: vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null,
    });
    cur.setDate(cur.getDate() + 7);
  }
  return pts;
}

// ── SVG line chart ────────────────────────────────────────────────────────────

function LineChart({ points, color, period, treatmentDates, rangeStart, rangeEnd, showMarkers }) {
  const [tip, setTip] = useState(null);

  const n    = points.length;
  const xOf  = i => PAD_L + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yOf  = v => PAD_T + PLOT_H * (1 - v / 10);

  const nonNull = points.filter(p => p.value !== null);

  // Build continuous line segments — break on null gaps
  const segments = [];
  let seg = [];
  points.forEach((pt, i) => {
    if (pt.value !== null) {
      seg.push([xOf(i), yOf(pt.value)]);
    } else {
      if (seg.length >= 2) segments.push([...seg]);
      seg = [];
    }
  });
  if (seg.length >= 2) segments.push(seg);

  // Treatment marker X positions (proportional in time range)
  const spanMs = Math.max(rangeEnd - rangeStart, 1);
  let txX = showMarkers ? (treatmentDates || []).flatMap(dateStr => {
    const ms = new Date(dateStr + 'T12:00:00Z').getTime();
    if (ms < rangeStart || ms > rangeEnd + 86400000) return [];
    return [PAD_L + ((ms - rangeStart) / spanMs) * PLOT_W];
  }) : [];
  // Deduplicate markers closer than 4px (avoids clutter in dense monthly view)
  txX = txX.reduce((acc, x) => {
    if (acc.every(ax => Math.abs(ax - x) >= 4)) acc.push(x);
    return acc;
  }, []);

  if (nonNull.length === 0) {
    return (
      <div style={{ height: SVG_H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-300)', fontSize: 12 }}>
        No data in this period
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>

        {/* Y-axis grid + labels */}
        {[0, 2, 4, 6, 8, 10].map(v => (
          <g key={v}>
            <line x1={PAD_L} y1={yOf(v)} x2={SVG_W - PAD_R} y2={yOf(v)} stroke="#f1f5f9" strokeWidth={1} />
            <text x={PAD_L - 4} y={yOf(v) + 3.5} textAnchor="end" fontSize={8} fill="#94a3b8">{v}</text>
          </g>
        ))}

        {/* Treatment day markers */}
        {txX.map((x, i) => (
          <g key={i}>
            <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + PLOT_H} stroke="#fca5a5" strokeWidth={1.5} strokeDasharray="4,3" />
            <text x={x} y={PAD_T - 3} textAnchor="middle" fontSize={11}>🎗️</text>
          </g>
        ))}

        {/* Area fill under each segment */}
        {segments.map((seg, i) => (
          <polygon key={i}
            points={`${seg[0][0]},${PAD_T + PLOT_H} ${seg.map(([x, y]) => `${x},${y}`).join(' ')} ${seg[seg.length - 1][0]},${PAD_T + PLOT_H}`}
            fill={color} fillOpacity={0.1}
          />
        ))}

        {/* Line segments */}
        {segments.map((seg, i) => (
          <polyline key={i}
            points={seg.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
          />
        ))}

        {/* Data dots with hover */}
        {points.map((pt, i) => {
          if (pt.value === null) return null;
          const hovered = tip?.i === i;
          return (
            <circle key={i}
              cx={xOf(i)} cy={yOf(pt.value)}
              r={hovered ? 5.5 : 3.5}
              fill={hovered ? color : '#fff'} stroke={color} strokeWidth={2}
              style={{ cursor: 'pointer' }}
              onMouseEnter={e => setTip({ i, clientX: e.clientX, clientY: e.clientY, date: pt.date, value: pt.value })}
              onMouseLeave={() => setTip(null)}
            />
          );
        })}

        {/* X-axis labels */}
        {period === 'week'
          ? points.map((pt, i) => (
              <g key={i}>
                <text x={xOf(i)} y={PAD_T + PLOT_H + 13} textAnchor="middle" fontSize={9} fontWeight="600" fill="#64748b">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][pt.date.getDay()]}
                </text>
                <text x={xOf(i)} y={PAD_T + PLOT_H + 24} textAnchor="middle" fontSize={8} fill="#94a3b8">
                  {pt.date.getDate()}
                </text>
              </g>
            ))
          : points.map((pt, i) => {
              let lbl = null;
              if (period === 'month') {
                const d = pt.date.getDate();
                if (d === 1 || d % 5 === 0) lbl = String(d);
              } else {
                // year: month abbreviation at the first week of each month
                if (pt.date.getDate() <= 7) lbl = pt.date.toLocaleDateString('en-GB', { month: 'short' });
              }
              if (!lbl) return null;
              return (
                <text key={i} x={xOf(i)} y={PAD_T + PLOT_H + 16} textAnchor="middle" fontSize={9} fill="#94a3b8">
                  {lbl}
                </text>
              );
            })
        }
      </svg>

      {/* Hover tooltip */}
      {tip && (
        <div style={{
          position: 'fixed',
          top:  tip.clientY - 58,
          left: tip.clientX - 32,
          background: '#1e293b', color: '#fff',
          borderRadius: 8, padding: '6px 10px',
          fontSize: 12, fontWeight: 700,
          pointerEvents: 'none', zIndex: 9999,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,.25)',
        }}>
          <div>{tip.value} / 10</div>
          <div style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8', marginTop: 1 }}>
            {tip.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportGraph({ patient, reports }) {
  const [period,  setPeriod]  = useState('week');
  const [offset,  setOffset]  = useState(0);
  const [txDates, setTxDates] = useState([]);

  function changePeriod(p) { setPeriod(p); setOffset(0); }

  // Fetch treatment cycle dates for the visible range
  useEffect(() => {
    if (!patient) return;
    const { start, end } = getDateRange(period, offset);
    api.get(`/treatments/${patient.id}/cycles?week_start=${localDateStr(start)}&week_end=${localDateStr(end)}`)
      .then(r => setTxDates(Object.keys(r.data)))
      .catch(() => setTxDates([]));
  }, [patient, period, offset]);

  const { start, end } = getDateRange(period, offset);
  const rangeStartMs  = start.getTime();
  const rangeEndMs    = end.getTime() + 86399999;
  const showMarkers   = period !== 'year'; // yearly view is too dense for per-day markers

  return (
    <div>
      {/* Period selector + navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {['week', 'month', 'year'].map(p => (
            <button key={p}
              className={`btn btn-ghost${period === p ? ' active-tab' : ''}`}
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => changePeriod(p)}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <button className="icon-btn" onClick={() => setOffset(o => o - 1)}>◀</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)', minWidth: 180, textAlign: 'center' }}>
            {rangeLabel(period, offset)}
          </span>
          <button className="icon-btn" onClick={() => setOffset(o => o + 1)} disabled={offset >= 0}>▶</button>
        </div>
      </div>

      {/* Yearly treatment summary (individual markers are too dense) */}
      {period === 'year' && txDates.length > 0 && (
        <p style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 12px', marginBottom: 16 }}>
          🎗️ {txDates.length} oncology treatment cycle{txDates.length !== 1 ? 's' : ''} in this period
        </p>
      )}

      {/* One chart card per metric */}
      {METRICS.map(m => {
        const pts      = buildPoints(reports, m.key, period, offset);
        const vals     = pts.map(p => p.value).filter(v => v !== null);
        const avg      = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : null;
        const last     = vals.length ? vals[vals.length - 1] : null;
        const trendVal = vals.length >= 2 ? +(vals[vals.length - 1] - vals[0]).toFixed(1) : null;
        const trendGood  = trendVal === null || trendVal === 0 ? null : (m.lowerIsBetter ? trendVal < 0 : trendVal > 0);
        const trendColor = trendGood === null ? '#94a3b8' : trendGood ? '#22c55e' : '#ef4444';
        const trendIcon  = trendVal === null || trendVal === 0 ? '→' : trendVal > 0 ? '↑' : '↓';

        return (
          <div key={m.key} className="metric-card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{m.emoji} {m.label}</span>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {trendVal !== null && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>TREND</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: trendColor }}>
                      {trendIcon} {Math.abs(trendVal)}
                    </div>
                  </div>
                )}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>AVG</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{avg ?? '—'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>LAST</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: m.color }}>{last ?? '—'}</div>
                </div>
              </div>
            </div>
            <LineChart
              points={pts}
              color={m.color}
              period={period}
              treatmentDates={txDates}
              rangeStart={rangeStartMs}
              rangeEnd={rangeEndMs}
              showMarkers={showMarkers}
            />
          </div>
        );
      })}

      {showMarkers && txDates.length > 0 && (
        <p style={{ fontSize: 11, color: 'var(--gray-400)', textAlign: 'center', marginTop: 4 }}>
          🎗️ marks an oncology treatment day
        </p>
      )}
    </div>
  );
}
