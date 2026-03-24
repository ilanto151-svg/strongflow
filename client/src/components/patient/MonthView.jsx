import { useState } from 'react';
import { TYPE_META } from '../../constants';
import { dateToKey, today, isSameDay, fmtDate, localDateStr } from '../../utils/calendar';

export default function MonthView({ exercises, treatmentDates = {}, onMonthChange }) {
  const t = today();
  const [year,  setYear]  = useState(t.getFullYear());
  const [month, setMonth] = useState(t.getMonth());
  const [selected, setSelected] = useState(null);

  function prevMonth() {
    let y = year, m = month;
    if (m === 0) { m = 11; y = y - 1; }
    else m = m - 1;
    setMonth(m); setYear(y);
    onMonthChange && onMonthChange(y, m);
  }
  function nextMonth() {
    let y = year, m = month;
    if (m === 11) { m = 0; y = y + 1; }
    else m = m + 1;
    setMonth(m); setYear(y);
    onMonthChange && onMonthChange(y, m);
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

  // Build the native tooltip text for a treatment day (shown on hover via title attr)
  function txTitle(txList) {
    return txList.map(tx => {
      const lines = [tx.name];
      if (tx.notes) lines.push(tx.notes);
      if (tx.rule_messages?.length) tx.rule_messages.forEach(m => lines.push(m));
      return lines.join(' · ');
    }).join('\n');
  }

  const monthName = new Date(year, month).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const selExs = selected ? dayExs(selected) : [];
  const selTx  = selected ? (treatmentDates[localDateStr(selected)] || []) : [];

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
          const dateStr = localDateStr(d);
          const txList  = treatmentDates[dateStr];
          const hasTx   = txList && txList.length > 0;
          return (
            <button key={i}
              onClick={() => setSelected(isSel ? null : d)}
              title={hasTx ? txTitle(txList) : undefined}
              style={{
                padding: '6px 4px', borderRadius: 10,
                border: isSel ? '2px solid var(--blue)' : hasTx ? '1.5px solid #fca5a5' : '1px solid var(--gray-200)',
                background: isToday ? 'var(--blue-bg)' : hasTx ? '#fff5f5' : '#fff',
                cursor: 'pointer', minHeight: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                boxShadow: isSel ? '0 0 0 2px rgba(29,78,216,.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: isToday ? 800 : 500, color: isToday ? 'var(--blue)' : 'var(--gray-700)' }}>{d.getDate()}</span>
              <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                {types.map(tp => <span key={tp} style={{ fontSize: 10 }}>{TYPE_META[tp]?.icon}</span>)}
              </div>
              {hasTx && (
                <span style={{ fontSize: 11, lineHeight: 1, marginTop: 1 }}>🎗️</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selected && (
        <div style={{ marginTop: 20, padding: 16, background: '#fff', borderRadius: 16, border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow)' }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: selTx.length ? 8 : 0 }}>{fmtDate(selected)}</div>

            {/* Treatment block — one entry per treatment on this day */}
            {selTx.map((tx, i) => (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column', gap: 2,
                background: '#fef2f2', border: '1px solid #fca5a5',
                borderRadius: 8, padding: '6px 10px',
                marginBottom: i < selTx.length - 1 ? 6 : 0,
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#991b1b' }}>
                  🎗️ {tx.name}
                  {tx.treatment_type && (
                    <span style={{ fontWeight: 400, color: '#b91c1c', marginLeft: 6 }}>{tx.treatment_type}</span>
                  )}
                </div>
                {tx.notes && (
                  <div style={{ fontSize: 12, color: '#7f1d1d' }}>{tx.notes}</div>
                )}
                {tx.rule_messages?.map((msg, mi) => (
                  <div key={mi} style={{ fontSize: 12, color: '#7f1d1d' }}>📋 {msg}</div>
                ))}
              </div>
            ))}
          </div>

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
