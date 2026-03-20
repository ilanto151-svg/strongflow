import { useState } from 'react';
import Modal from '../shared/Modal';
import { weekLabel } from '../../utils/calendar';

const DAY_LABELS    = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_OFFSETS  = [-2, -1, 0, 1, 2, 3, 4];

// Decompose a day_key (weekOffset * 7 + dow) into its parts.
function decomposeKey(dayKey) {
  const week = Math.floor(dayKey / 7);
  const dow  = ((dayKey % 7) + 7) % 7;
  return { week, dow };
}

export default function CopyModal({ mode, sourceLabel, srcDayKey, instanceId, currentWeekOffset, onCopy, onClose }) {
  const { week: srcWeek, dow: srcDow } = srcDayKey != null ? decomposeKey(srcDayKey) : { week: currentWeekOffset, dow: 0 };

  // Week-copy state
  const [fromWeek, setFromWeek] = useState(currentWeekOffset);
  const [toWeek,   setToWeek]   = useState(currentWeekOffset + 1);

  // Exercise / day copy state
  const [dstWeek,    setDstWeek]    = useState(srcWeek);
  const [dstDow,     setDstDow]     = useState(srcDow);
  const [copyMode,   setCopyMode]   = useState('append');

  function handleCopy() {
    if (mode === 'week') {
      onCopy({ src_week_offset: fromWeek, dst_week_offset: toWeek });
    } else {
      const dst_day_key = dstWeek * 7 + dstDow;
      if (mode === 'exercise') {
        onCopy({ instance_id: instanceId, dst_day_key, mode: copyMode });
      } else {
        onCopy({ src_day_key: srcDayKey, dst_day_key, mode: copyMode });
      }
    }
    onClose();
  }

  const title = mode === 'week' ? '📋 Copy Week'
              : mode === 'day'  ? '📋 Copy Day'
              :                   '📋 Copy Exercise';

  const row = (label, children) => (
    <div className="form-row">
      <label className="form-label">{label}</label>
      {children}
    </div>
  );

  return (
    <Modal
      title={title}
      onClose={onClose}
      size="modal-sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCopy}>Copy</button>
        </>
      }
    >
      {sourceLabel && (
        <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 16 }}>
          Copying: <strong>{sourceLabel}</strong>
        </p>
      )}

      {mode === 'week' ? (
        <>
          {row('Copy FROM week',
            <select className="form-input" value={fromWeek} onChange={e => setFromWeek(+e.target.value)}>
              {WEEK_OFFSETS.map(o => <option key={o} value={o}>{weekLabel(o)}</option>)}
            </select>
          )}
          {row('Copy TO week',
            <select className="form-input" value={toWeek} onChange={e => setToWeek(+e.target.value)}>
              {WEEK_OFFSETS.map(o => <option key={o} value={o}>{weekLabel(o)}</option>)}
            </select>
          )}
          <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
            All exercises from the source week will be appended to the destination week.
          </p>
        </>
      ) : (
        <>
          {row('Target week',
            <select className="form-input" value={dstWeek} onChange={e => setDstWeek(+e.target.value)}>
              {WEEK_OFFSETS.map(o => <option key={o} value={o}>{weekLabel(o)}</option>)}
            </select>
          )}
          {row('Target day',
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {DAY_LABELS.map((d, i) => (
                <button
                  key={d}
                  className={`day-tab${dstDow === i ? ' active' : ''}`}
                  style={{ padding: '5px 10px', fontSize: 13 }}
                  onClick={() => setDstDow(i)}
                >{d}</button>
              ))}
            </div>
          )}
          {row('If exercises already exist on target day',
            <div style={{ display: 'flex', gap: 20 }}>
              {[['append', 'Append (keep existing)'], ['replace', 'Replace (delete existing)']].map(([val, label]) => (
                <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" name="copyMode" value={val} checked={copyMode === val} onChange={() => setCopyMode(val)} />
                  {label}
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
