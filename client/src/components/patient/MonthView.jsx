import { useState } from 'react';
import { TYPE_META } from '../../constants';
import { dateToKey, today, isSameDay, fmtDate } from '../../utils/calendar';

export default function MonthView({ exercises }) {
  const t = today();
  const [year,  setYear]  = useState(t.getFullYear());
  const [month, setMonth] = useState(t.getMonth());
  const [selected, setSelected] = useState(null);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function dayExs(date) {
    if (!date) return [];
    return exercises.filter(e => e.day_key === dateToKey(date));
  }

  const monthName = new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const selExs = selected ? dayExs(selected) : [];

  return (
    <div>
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
          const exs     = dayExs(d);
          const isToday = isSameDay(d, today());
          const isSel   = selected && isSameDay(d, selected);
          const types   = [...new Set(exs.map(e => e.type))];
          return (
            <button key={i}
              onClick={() => setSelected(isSel ? null : d)}
              style={{
                padding: '6px 4px', borderRadius: 10, border: isSel ? '2px solid var(--blue)' : '1px solid var(--gray-200)',
                background: isToday ? 'var(--blue-bg)' : '#fff',
                cursor: 'pointer', minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                boxShadow: isSel ? '0 0 0 2px rgba(29,78,216,.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--blue)' : 'var(--gray-700)' }}>{d.getDate()}</span>
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                {types.map(tp => <span key={tp} style={{ fontSize: 10 }}>{TYPE_META[tp]?.icon}</span>)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selected && (
        <div style={{ marginTop: 20, padding: 16, background: '#fff', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>{fmtDate(selected)}</div>
          {selExs.length === 0 ? (
            <p style={{ color: 'var(--gray-400)', fontSize: 13 }}>No exercises scheduled.</p>
          ) : selExs.map(ex => {
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
          })}
        </div>
      )}
    </div>
  );
}
