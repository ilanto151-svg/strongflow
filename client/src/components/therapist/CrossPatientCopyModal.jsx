import { useState, useEffect } from 'react';
import api from '../../utils/api';
import Modal from '../shared/Modal';
import { weekLabel, keyToDate } from '../../utils/calendar';

const DAY_LABELS   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_OFFSETS = [-2, -1, 0, 1, 2, 3, 4];

function decomposeKey(dayKey) {
  const week = Math.floor(dayKey / 7);
  const dow  = ((dayKey % 7) + 7) % 7;
  return { week, dow };
}

function dayLabel(dayKey) {
  const d = keyToDate(dayKey);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── CrossPatientCopyModal ─────────────────────────────────────────────────────
//
// Props:
//   mode          – 'exercise' | 'day' | 'week'
//   sourcePatient – { id, name }
//   sourceLabel   – human-readable description of what is being copied
//   srcDayKey     – (exercise/day modes) the source day_key
//   srcWeekOffset – (week mode) the source week offset
//   instanceId    – (exercise mode only) the exercise instance_id
//   onCopy        – fn({ dst_pid, dst_day_key?, dst_week_offset?, mode: 'append'|'replace' })
//   onClose       – fn()

export default function CrossPatientCopyModal({
  mode,
  sourcePatient,
  sourceLabel,
  srcDayKey,
  srcWeekOffset,
  instanceId,
  onCopy,
  onClose,
}) {
  const [patients,  setPatients]  = useState([]);
  const [loadingPx, setLoadingPx] = useState(true);
  const [dstPid,    setDstPid]    = useState('');
  const [copyMode,  setCopyMode]  = useState('append');

  // For exercise / day: target week + dow
  const { week: srcWeek, dow: srcDow } = srcDayKey != null
    ? decomposeKey(srcDayKey)
    : { week: srcWeekOffset || 0, dow: 0 };

  const [dstWeek, setDstWeek] = useState(srcWeek);
  const [dstDow,  setDstDow]  = useState(srcDow);

  // For week: target week offset
  const [toWeek, setToWeek] = useState(
    srcWeekOffset != null ? srcWeekOffset + 1 : 1
  );

  // Fetch therapist's patient list (excluding the source patient)
  useEffect(() => {
    api.get('/patients')
      .then(r => {
        setPatients((r.data || []).filter(p => p.id !== sourcePatient.id));
        setLoadingPx(false);
      })
      .catch(() => setLoadingPx(false));
  }, [sourcePatient.id]);

  function handleCopy() {
    if (!dstPid) { alert('Please select a target patient.'); return; }

    if (mode === 'week') {
      onCopy({ dst_pid: dstPid, dst_week_offset: toWeek, mode: copyMode });
    } else {
      const dst_day_key = dstWeek * 7 + dstDow;
      onCopy({ dst_pid: dstPid, dst_day_key, mode: copyMode });
    }
    onClose();
  }

  const title = mode === 'week'
    ? '📤 Copy Week to Another Patient'
    : mode === 'day'
      ? '📤 Copy Day to Another Patient'
      : '📤 Copy Exercise to Another Patient';

  const targetPatient = patients.find(p => p.id === dstPid);
  const dstDayKey     = dstWeek * 7 + dstDow;

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
          <button
            className="btn btn-primary"
            onClick={handleCopy}
            disabled={!dstPid}
          >
            Copy
          </button>
        </>
      }
    >
      {/* ── Source summary (green) ── */}
      <div style={{
        background: '#f0fdf4', border: '1px solid #bbf7d0',
        borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: 13,
      }}>
        <div style={{ color: '#166534', fontWeight: 700, marginBottom: 2 }}>Copying from</div>
        <div style={{ color: '#15803d' }}>
          <strong>{sourcePatient.name}</strong>
          {' — '}
          {mode === 'week' ? weekLabel(srcWeekOffset) : (sourceLabel || dayLabel(srcDayKey))}
        </div>
      </div>

      {/* ── Target patient ── */}
      {row('Target patient',
        loadingPx ? (
          <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>Loading…</span>
        ) : patients.length === 0 ? (
          <span style={{ fontSize: 13, color: 'var(--gray-400)' }}>No other patients.</span>
        ) : (
          <select className="form-input" value={dstPid} onChange={e => setDstPid(e.target.value)}>
            <option value="">— select patient —</option>
            {patients.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )
      )}

      {/* ── Target date / week ── */}
      {mode === 'week' ? (
        row('Target week',
          <select className="form-input" value={toWeek} onChange={e => setToWeek(+e.target.value)}>
            {WEEK_OFFSETS.map(o => (
              <option key={o} value={o}>{weekLabel(o)}</option>
            ))}
          </select>
        )
      ) : (
        <>
          {row('Target week',
            <select className="form-input" value={dstWeek} onChange={e => setDstWeek(+e.target.value)}>
              {WEEK_OFFSETS.map(o => (
                <option key={o} value={o}>{weekLabel(o)}</option>
              ))}
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
                >
                  {d}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Append / Replace ── */}
      {row('If exercises already exist on target',
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            ['append',  'Append (keep existing)'],
            ['replace', 'Replace (delete existing)'],
          ].map(([val, label]) => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="radio"
                name="xCopyMode"
                value={val}
                checked={copyMode === val}
                onChange={() => setCopyMode(val)}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      {/* ── Target summary (blue) — shown only once a patient is selected ── */}
      {dstPid && (
        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe',
          borderRadius: 8, padding: '8px 12px', marginTop: 8, fontSize: 13,
        }}>
          <div style={{ color: '#1e40af', fontWeight: 700, marginBottom: 2 }}>Copying to</div>
          <div style={{ color: '#1d4ed8' }}>
            <strong>{targetPatient?.name}</strong>
            {' — '}
            {mode === 'week' ? weekLabel(toWeek) : dayLabel(dstDayKey)}
          </div>
          {copyMode === 'replace' && (
            <div style={{ color: '#dc2626', fontSize: 11, marginTop: 4, fontWeight: 600 }}>
              ⚠️ Existing exercises on the target day will be deleted.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
