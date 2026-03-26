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
const PAD_T  = 22;   // room for emoji markers above plot
const PAD_B  = 30;   // X-axis label space
const PLOT_H = 90;
const SVG_H  = PAD_T + PLOT_H + PAD_B;  // 142
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

  // year: rolling 12-month window
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
      const d = new Date(start);
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

  // year: weekly averages
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

// ── Marker builder ─────────────────────────────────────────────────────────────
//
// Converts a { "YYYY-MM-DD": [item, ...] } dict into an array of
// { x, dateStr, items } objects positioned within the SVG plot area.
// Items that fall within 4px of each other are merged into one marker.

function buildMarkers(datesDict, rangeStart, spanMs) {
  const raw = Object.entries(datesDict || {})
    .map(([dateStr, items]) => {
      const ms = new Date(dateStr + 'T12:00:00Z').getTime();
      const x  = PAD_L + ((ms - rangeStart) / spanMs) * PLOT_W;
      return { x, dateStr, items: Array.isArray(items) ? items : [] };
    })
    .filter(m => m.x >= PAD_L - 8 && m.x <= PAD_L + PLOT_W + 8);

  // Merge nearby markers so we don't clutter dense month/year views
  return raw.reduce((acc, m) => {
    const hit = acc.find(a => Math.abs(a.x - m.x) < 4);
    if (hit) {
      hit.items = [...hit.items, ...m.items];
    } else {
      acc.push({ x: m.x, dateStr: m.dateStr, items: [...m.items] });
    }
    return acc;
  }, []);
}

// ── Marker tooltip ─────────────────────────────────────────────────────────────

function MarkerTooltip({ tip }) {
  if (!tip) return null;
  const date = new Date(tip.dateStr + 'T12:00:00Z')
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div style={{
      position: 'fixed',
      top:  tip.clientY - 16,
      left: tip.clientX + 14,
      background: '#1e293b', color: '#f8fafc',
      borderRadius: 10, padding: '10px 14px',
      fontSize: 12,
      pointerEvents: 'none', zIndex: 9999,
      maxWidth: 270,
      boxShadow: '0 6px 24px rgba(0,0,0,.35)',
      lineHeight: 1.45,
    }}>
      {tip.type === 'treatment' ? (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#fca5a5', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7 }}>
            🎗️ Treatment Day
          </div>
          {tip.items.map((tx, i) => (
            <div key={i} style={{ marginBottom: i < tip.items.length - 1 ? 8 : 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{tx.name}</div>
              {tx.treatment_type && (
                <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 1 }}>{tx.treatment_type}</div>
              )}
              {tx.duration_days > 1 && (
                <div style={{ color: '#fca5a5', fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                  Day {tx.day_of_span} of {tx.duration_days}
                </div>
              )}
              {tx.notes && (
                <div style={{ color: '#cbd5e1', fontSize: 11, marginTop: 3, fontStyle: 'italic' }}>{tx.notes}</div>
              )}
            </div>
          ))}
        </>
      ) : (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#fde68a', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7 }}>
            🔔 Reminder
          </div>
          {tip.items.map((rm, i) => (
            <div key={i} style={{ marginBottom: i < tip.items.length - 1 ? 8 : 0 }}>
              {rm.message && (
                <div style={{ fontWeight: 700, fontSize: 13 }}>{rm.message}</div>
              )}
              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 1 }}>{rm.treatment_name}</div>
              {rm.timing && (
                <div style={{ color: '#fbbf24', fontSize: 11, marginTop: 2 }}>· {rm.timing}</div>
              )}
            </div>
          ))}
        </>
      )}
      <div style={{ fontSize: 10, color: '#64748b', marginTop: 7, borderTop: '1px solid #334155', paddingTop: 5 }}>
        {date}
      </div>
    </div>
  );
}

// ── SVG line chart ────────────────────────────────────────────────────────────

function LineChart({ points, color, period, treatmentDates, reminderDates, rangeStart, rangeEnd, showMarkers }) {
  const [tip,       setTip]       = useState(null); // data-point tooltip
  const [markerTip, setMarkerTip] = useState(null); // marker tooltip

  const n   = points.length;
  const xOf = i => PAD_L + (n <= 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W);
  const yOf = v => PAD_T + PLOT_H * (1 - v / 10);

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

  const spanMs    = Math.max(rangeEnd - rangeStart, 1);
  const txMarkers = showMarkers ? buildMarkers(treatmentDates, rangeStart, spanMs) : [];
  const rmMarkers = showMarkers ? buildMarkers(reminderDates,  rangeStart, spanMs) : [];

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

        {/* ── Treatment markers (red dashed, 🎗️) ─────────────────────── */}
        {txMarkers.map((m, i) => (
          <g key={`tx${i}`} style={{ cursor: 'pointer' }}
            onMouseEnter={e => setMarkerTip({ type: 'treatment', ...m, clientX: e.clientX, clientY: e.clientY })}
            onMouseLeave={() => setMarkerTip(null)}>
            {/* Wider transparent hit target */}
            <rect x={m.x - 8} y={0} width={16} height={SVG_H} fill="transparent" />
            <line x1={m.x} y1={PAD_T} x2={m.x} y2={PAD_T + PLOT_H}
              stroke="#fca5a5" strokeWidth={1.5} strokeDasharray="4,3" />
            <text x={m.x} y={PAD_T - 5} textAnchor="middle" fontSize={12}>🎗️</text>
          </g>
        ))}

        {/* ── Reminder markers (amber dashed, 🔔, offset +2px) ─────────── */}
        {rmMarkers.map((m, i) => {
          const rx = m.x + 2; // slight offset so both are visible on same-day overlap
          return (
            <g key={`rm${i}`} style={{ cursor: 'pointer' }}
              onMouseEnter={e => setMarkerTip({ type: 'reminder', ...m, clientX: e.clientX, clientY: e.clientY })}
              onMouseLeave={() => setMarkerTip(null)}>
              <rect x={rx - 7} y={0} width={14} height={SVG_H} fill="transparent" />
              <line x1={rx} y1={PAD_T} x2={rx} y2={PAD_T + PLOT_H}
                stroke="#fde68a" strokeWidth={1.5} strokeDasharray="3,3" />
              <text x={rx} y={PAD_T - 5} textAnchor="middle" fontSize={11}>🔔</text>
            </g>
          );
        })}

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

        {/* Data dots with hover — rendered last so they sit above markers */}
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

      {/* Data-point hover tooltip */}
      {tip && !markerTip && (
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

      {/* Marker hover tooltip */}
      <MarkerTooltip tip={markerTip} />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportGraph({ patient, reports }) {
  const [period,  setPeriod]  = useState('week');
  const [offset,  setOffset]  = useState(0);
  const [txDates, setTxDates] = useState({}); // { "YYYY-MM-DD": [{name, treatment_type, notes}] }
  const [rmDates, setRmDates] = useState({}); // { "YYYY-MM-DD": [{message, treatment_name, timing}] }

  function changePeriod(p) { setPeriod(p); setOffset(0); }

  // Fetch treatment cycle + reminder dates for the visible range
  useEffect(() => {
    if (!patient) return;
    const { start, end } = getDateRange(period, offset);
    api.get(`/treatments/${patient.id}/cycles?week_start=${localDateStr(start)}&week_end=${localDateStr(end)}`)
      .then(r => {
        setTxDates(r.data.treatmentDates || {});
        setRmDates(r.data.reminderDates  || {});
      })
      .catch(() => { setTxDates({}); setRmDates({}); });
  }, [patient, period, offset]);

  const { start, end } = getDateRange(period, offset);
  const rangeStartMs = start.getTime();
  const rangeEndMs   = end.getTime() + 86399999;
  const showMarkers  = period !== 'year';

  const txCount = Object.keys(txDates).length;
  const rmCount = Object.keys(rmDates).length;

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

      {/* Year-view: individual markers are too dense, show a summary banner instead */}
      {period === 'year' && (txCount > 0 || rmCount > 0) && (
        <p style={{ fontSize: 12, color: '#78350f', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '6px 14px', marginBottom: 16, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          {txCount > 0 && <span>🎗️ {txCount} treatment cycle{txCount !== 1 ? 's' : ''}</span>}
          {rmCount > 0 && <span>🔔 {rmCount} reminder event{rmCount !== 1 ? 's' : ''}</span>}
          <span style={{ color: '#a16207' }}>in this period</span>
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
              reminderDates={rmDates}
              rangeStart={rangeStartMs}
              rangeEnd={rangeEndMs}
              showMarkers={showMarkers}
            />
          </div>
        );
      })}

      {/* Legend */}
      {showMarkers && (txCount > 0 || rmCount > 0) && (
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', marginTop: 6 }}>
          {txCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="18" height="12" style={{ flexShrink: 0 }}>
                <line x1="0" y1="6" x2="18" y2="6" stroke="#fca5a5" strokeWidth="1.5" strokeDasharray="4,3" />
              </svg>
              🎗️ treatment day
            </span>
          )}
          {rmCount > 0 && (
            <span style={{ fontSize: 11, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <svg width="18" height="12" style={{ flexShrink: 0 }}>
                <line x1="0" y1="6" x2="18" y2="6" stroke="#fde68a" strokeWidth="1.5" strokeDasharray="3,3" />
              </svg>
              🔔 reminder day
            </span>
          )}
        </div>
      )}
    </div>
  );
}
