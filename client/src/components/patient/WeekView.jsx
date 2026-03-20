import { useState } from 'react';
import { DAYS, TYPE_META } from '../../constants';
import { dateToKey, today, isSameDay, sundayOfWeekOffset, weekLabel, fmtDate } from '../../utils/calendar';

export default function WeekView({ exercises }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [expanded, setExpanded]     = useState(null);

  const weekStart = sundayOfWeekOffset(weekOffset);
  const weekDays  = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  });

  function dayExercises(date) {
    const k = dateToKey(date);
    return exercises.filter(e => e.day_key === k);
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button className="icon-btn" onClick={() => setWeekOffset(o => o - 1)}>◀</button>
        <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, textAlign: 'center' }}>{weekLabel(weekOffset)}</h2>
        <button className="icon-btn" onClick={() => setWeekOffset(o => o + 1)}>▶</button>
        {weekOffset !== 0 && (
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setWeekOffset(0)}>Today</button>
        )}
      </div>

      {weekDays.map(d => {
        const exs       = dayExercises(d);
        const isToday   = isSameDay(d, today());
        const isExpanded= expanded === d.toDateString();
        const types = [...new Set(exs.map(e => e.type))];
        return (
          <div key={d.toDateString()} className={`week-card${isToday ? ' today' : ''}`}
            style={{ cursor: exs.length ? 'pointer' : 'default' }}
            onClick={() => exs.length && setExpanded(isExpanded ? null : d.toDateString())}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: 700 }}>{DAYS[d.getDay()]}</span>
                <span style={{ fontSize: 13, color: 'var(--gray-500)', marginLeft: 8 }}>{d.getDate()}/{d.getMonth()+1}</span>
                {isToday && <span style={{ marginLeft: 8, fontSize: 11, background: 'var(--green-l)', color: '#fff', borderRadius: 8, padding: '1px 7px', fontWeight: 600 }}>Today</span>}
              </div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {types.map(t => (
                  <span key={t} style={{ fontSize: 14 }}>{TYPE_META[t]?.icon}</span>
                ))}
                {exs.length > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--gray-400)', marginLeft: 4 }}>{exs.length} ex{exs.length > 1 ? 's' : ''}</span>
                )}
                {exs.length === 0 && <span style={{ fontSize: 12, color: 'var(--gray-300)' }}>Rest</span>}
              </div>
            </div>

            {/* Expanded day */}
            {isExpanded && (
              <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-100)', paddingTop: 12 }}>
                {exs.map(ex => {
                  const meta = TYPE_META[ex.type];
                  return (
                    <div key={ex.instance_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--gray-100)' }}>
                      <div className="ex-icon" style={{ background: meta.bg, color: meta.color, width: 36, height: 36 }}>
                        {ex.image || meta.icon}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{ex.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                          {ex.sets && `${ex.sets}×${ex.reps}`}
                          {ex.duration && ex.duration}
                          {ex.equipment && ` · ${ex.equipment}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
