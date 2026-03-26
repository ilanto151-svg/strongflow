import { useState } from 'react';
import { TYPE_META } from '../../constants';
import { dateToKey, today, isSameDay, fmtDate, localDateStr } from '../../utils/calendar';

export default function MonthView({
  exercises,
  treatmentDates = {},
  reminderDates  = {},
  pausedDates    = {},
  onMonthChange,
}) {
  const t = today();
  const [year,     setYear]     = useState(t.getFullYear());
  const [month,    setMonth]    = useState(t.getMonth());
  const [selected, setSelected] = useState(null);

  function prevMonth() {
    let y = year, m = month;
    if (m === 0) { m = 11; y -= 1; } else m -= 1;
    setYear(y); setMonth(m);
    onMonthChange && onMonthChange(y, m);
  }
  function nextMonth() {
    let y = year, m = month;
    if (m === 11) { m = 0; y += 1; } else m += 1;
    setYear(y); setMonth(m);
    onMonthChange && onMonthChange(y, m);
  }

  // Build calendar grid
  const firstDay    = new Date(year, month, 1);
  const startDow    = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells       = [];
  for (let i = 0; i < startDow; i++)   cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function dayExs(date) {
    if (!date) return [];
    return exercises.filter(e => e.day_key === dateToKey(date));
  }

  const monthName = new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const selDateStr = selected ? localDateStr(selected) : null;
  const selExs     = selected ? dayExs(selected) : [];
  const selTx      = selDateStr ? (treatmentDates[selDateStr] || []) : [];
  const selRm      = selDateStr ? (reminderDates[selDateStr]  || []) : [];
  const selPm      = selDateStr ? (pausedDates[selDateStr]    || []) : [];

  return (
    <div>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="icon-btn" onClick={prevMonth}>◀</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, textAlign: 'center' }}>{monthName}</h2>
        <button className="icon-btn" onClick={nextMonth}>▶</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', padding: '4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;

          const dateStr = localDateStr(d);
          const exs     = dayExs(d);
          const isToday = isSameDay(d, today());
          const isSel   = selected && isSameDay(d, selected);
          const types   = [...new Set(exs.map(e => e.type))];
          const txList     = treatmentDates[dateStr];
          const hasTx      = txList && txList.length > 0;
          const isStartDay = hasTx && txList.some(t => t.day_of_span === 1);
          const rmList     = reminderDates[dateStr];
          const hasRm      = rmList && rmList.length > 0;
          const pmList     = pausedDates[dateStr];
          const hasPause   = pmList && pmList.length > 0;

          // Border and background — start days are more vivid than continuation days
          const borderColor = isSel
            ? 'var(--blue)'
            : hasTx && isStartDay ? '#fca5a5'
            : hasTx ? '#fecaca'
            : hasRm ? '#fde68a'
            : hasPause ? '#d6d3d1'
            : 'var(--gray-200)';
          const borderWidth = isSel ? 2 : (hasTx || hasRm || hasPause) ? 1.5 : 1;
          const bgColor     = isToday
            ? 'var(--blue-bg)'
            : hasTx && isStartDay ? '#fff5f5'
            : hasTx ? '#fff9f9'
            : hasRm ? '#fffdf0'
            : hasPause ? '#fafaf9'
            : '#fff';

          return (
            <button key={i}
              onClick={() => setSelected(isSel ? null : d)}
              style={{
                padding: '6px 4px', borderRadius: 10,
                border: `${borderWidth}px solid ${borderColor}`,
                background: bgColor,
                cursor: 'pointer', minHeight: 56,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                boxShadow: isSel ? '0 0 0 2px rgba(29,78,216,.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--blue)' : 'var(--gray-700)' }}>
                {d.getDate()}
              </span>

              {/* Exercise type icons */}
              {types.length > 0 && (
                <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {types.map(tp => (
                    <span key={tp} style={{ fontSize: 10 }}>{TYPE_META[tp]?.icon}</span>
                  ))}
                </div>
              )}

              {/* Treatment / reminder / pause badges row */}
              {(hasTx || hasRm || hasPause) && (
                <div style={{ display: 'flex', gap: 3, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  {hasTx && isStartDay  && <span style={{ fontSize: 11, lineHeight: 1 }}>🎗️</span>}
                  {hasTx && !isStartDay && <span style={{ width: 14, height: 3, background: '#fca5a5', borderRadius: 2, display: 'inline-block' }} />}
                  {hasRm && <span style={{ fontSize: 10, lineHeight: 1 }}>🔔</span>}
                  {hasPause && !hasTx && <span style={{ fontSize: 10, lineHeight: 1 }}>⏸</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail panel */}
      {selected && (
        <div style={{ marginTop: 20, padding: 16, background: '#fff', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow)' }}>

          {/* Date heading */}
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>{fmtDate(selected)}</div>

          {/* ── Pause section ── */}
          {selPm.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                ⏸ Treatment Hold
              </div>
              {selPm.map((pm, i) => (
                <div key={i} style={{
                  background: '#fafaf9', border: '1px solid #d6d3d1',
                  borderRadius: 8, padding: '8px 10px',
                  marginBottom: i < selPm.length - 1 ? 6 : 0,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#57534e' }}>
                    {pm.name}
                    {pm.treatment_type && (
                      <span style={{ fontWeight: 400, color: '#78716c', marginLeft: 6 }}>{pm.treatment_type}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
                    Scheduled cycle — currently on hold
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Treatment section ── */}
          {selTx.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                🎗️ Treatment Day
              </div>
              {selTx.map((tx, i) => (
                <div key={i} style={{
                  background: tx.day_of_span === 1 ? '#fef2f2' : '#fff5f5',
                  border: `1px solid ${tx.day_of_span === 1 ? '#fca5a5' : '#fecaca'}`,
                  borderRadius: 8, padding: '8px 10px',
                  marginBottom: i < selTx.length - 1 ? 6 : 0,
                }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>
                    {tx.name}
                    {tx.treatment_type && (
                      <span style={{ fontWeight: 400, color: '#b91c1c', marginLeft: 6 }}>{tx.treatment_type}</span>
                    )}
                  </div>
                  {tx.duration_days > 1 && (
                    <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 2, fontWeight: 600 }}>
                      Day {tx.day_of_span} of {tx.duration_days}
                    </div>
                  )}
                  {tx.notes && (
                    <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 3 }}>{tx.notes}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Reminder section ── */}
          {selRm.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                🔔 Reminders
              </div>
              {selRm.map((rm, i) => (
                <div key={i} style={{
                  background: '#fffbeb', border: '1px solid #fde68a',
                  borderRadius: 8, padding: '8px 10px',
                  marginBottom: i < selRm.length - 1 ? 6 : 0,
                }}>
                  {rm.message && (
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#78350f', marginBottom: 2 }}>
                      {rm.message}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: '#92400e' }}>
                    {rm.treatment_name}
                    {rm.timing && (
                      <span style={{ fontWeight: 400, color: '#b45309', marginLeft: 6 }}>· {rm.timing}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Exercises section ── */}
          {selExs.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 13 }}>No exercises scheduled.</p>
          ) : (
            selExs.map(ex => {
              const meta = TYPE_META[ex.type];
              return (
                <div key={ex.instance_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                  <div className="ex-icon" style={{ background: meta.bg, color: meta.color, width: 36, height: 36 }}>
                    {ex.image || meta.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                      {ex.sets ? `${ex.sets}×${ex.reps}` : ''}{ex.duration || ''}
                      {ex.equipment ? ` · ${ex.equipment}` : ''}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
