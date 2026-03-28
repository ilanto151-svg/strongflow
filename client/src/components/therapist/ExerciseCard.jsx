import { useState } from 'react';
import { TYPE_META, RPE } from '../../constants';
import Modal from '../shared/Modal';
import ExerciseForm from './ExerciseForm';
import { ConfirmModal } from '../shared/Modal';

// noProgression — load/intensity fields unchanged for ≥14 days (amber)
// noVariation   — same exercise name in plan for ≥14 days (purple)
// Both default to false so any caller that doesn't pass them is unaffected.
export default function ExerciseCard({
  ex,
  onEdit,
  onDelete,
  onCopy,
  onCrossPatientCopy,
  noProgression = false,
  noVariation   = false,
}) {
  const [open,       setOpen]       = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [confirming, setConfirming] = useState(false);

  const meta      = TYPE_META[ex.type] || TYPE_META.other;
  const intervals = ex.intervals
    ? (() => { try { return JSON.parse(ex.intervals); } catch { return []; } })()
    : [];

  return (
    <>
      <div className="ex-card">
        <div className="ex-head" onClick={() => setOpen(o => !o)}>

          <div className="ex-icon" style={{ background: meta.bg, color: meta.color }}>
            {ex.image || meta.icon}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-900)' }}>
              {ex.name}
            </div>

            {/* Subtitle row: type pill · equipment · alert badges */}
            <div style={{
              fontSize: 12,
              color: 'var(--gray-500)',
              marginTop: 1,
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              <span style={{
                background: meta.bg,
                color: meta.color,
                borderRadius: 8,
                padding: '1px 7px',
                fontWeight: 600,
              }}>
                {meta.label}
              </span>

              {ex.equipment && <span style={{ marginLeft: 2 }}>{ex.equipment}</span>}

              {/* Progression alert — amber */}
              {noProgression && (
                <span
                  title="Sets / reps / weight / duration / RPE have not changed in 2+ weeks"
                  style={{
                    background: '#fffbeb',
                    color: '#b45309',
                    border: '1px solid #fde68a',
                    borderRadius: 8,
                    padding: '1px 7px',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'default',
                    whiteSpace: 'nowrap',
                  }}
                >
                  📈 No progression
                </span>
              )}

              {/* Variation alert — purple */}
              {noVariation && (
                <span
                  title="Same exercise has been in the plan for 2+ weeks — consider introducing a variation"
                  style={{
                    background: '#f5f3ff',
                    color: '#6d28d9',
                    border: '1px solid #ddd6fe',
                    borderRadius: 8,
                    padding: '1px 7px',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'default',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔄 No variation
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              className="icon-btn"
              title="Copy exercise (same patient)"
              onClick={e => { e.stopPropagation(); onCopy(ex); }}
            >📋</button>
            {onCrossPatientCopy && (
              <button
                className="icon-btn"
                title="Copy exercise to another patient"
                onClick={e => { e.stopPropagation(); onCrossPatientCopy(ex); }}
              >📤</button>
            )}
            <button className="icon-btn" onClick={e => { e.stopPropagation(); setEditing(true); }}>✏️</button>
            <button className="icon-btn" onClick={e => { e.stopPropagation(); setConfirming(true); }}>🗑️</button>
          </div>

          <span className={`chevron${open ? ' open' : ''}`}>▼</span>
        </div>

        {open && (
          <div className="ex-body">
            {ex.description && (
              <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 12 }}>
                {ex.description}
              </p>
            )}
            <div className="ex-grid">
              {ex.type === 'resistance' && <>
                {ex.sets   && <div className="stat-box"><span className="stat-label">Sets</span><span className="stat-val">{ex.sets}</span></div>}
                {ex.reps   && <div className="stat-box"><span className="stat-label">Reps</span><span className="stat-val">{ex.reps}</span></div>}
                {ex.weight && <div className="stat-box"><span className="stat-label">Weight</span><span className="stat-val">{ex.weight}</span></div>}
                {ex.rest   && <div className="stat-box"><span className="stat-label">Rest</span><span className="stat-val">{ex.rest}</span></div>}
              </>}
              {(ex.type === 'aerobic' || ex.type === 'other') && ex.duration && (
                <div className="stat-box"><span className="stat-label">Duration</span><span className="stat-val">{ex.duration}</span></div>
              )}
              {ex.rpe != null && ex.rpe !== '' && (
                <div className="stat-box"><span className="stat-label">Target RPE</span><span className="stat-val">{ex.rpe} – {RPE[ex.rpe]}</span></div>
              )}
            </div>

            {ex.type === 'aerobic' && intervals.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <table className="interval-table">
                  <thead>
                    <tr><th>Intensity</th><th>Duration</th><th>RPE</th><th>Target HR</th></tr>
                  </thead>
                  <tbody>
                    {intervals.map((row, i) => (
                      <tr key={row.id || i}>
                        <td>{row.intensity}</td>
                        <td>{row.duration}</td>
                        <td>{row.rpe != null && row.rpe !== '' ? `${row.rpe} – ${RPE[row.rpe] || ''}` : '—'}</td>
                        <td>{row.target_hr || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ex.notes && (
              <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 10 }}>📝 {ex.notes}</p>
            )}
            {ex.link && (
              <a href={ex.link} target="_blank" rel="noreferrer" style={{ fontSize: 13, color: 'var(--blue)' }}>
                🔗 Reference
              </a>
            )}
            {ex.img_data && (
              <div style={{ marginTop: 10 }}>
                <img src={ex.img_data} alt={ex.name} style={{ maxHeight: 160, borderRadius: 8 }} />
              </div>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && setEditing(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">Edit Exercise</span>
              <button className="icon-btn" onClick={() => setEditing(false)}>✕</button>
            </div>
            <div className="modal-body">
              <ExerciseForm
                initial={ex}
                onSave={updated => { onEdit(updated); setEditing(false); }}
                onClose={() => setEditing(false)}
              />
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <ConfirmModal
          message={`Delete "${ex.name}"? This cannot be undone.`}
          onConfirm={() => { onDelete(); setConfirming(false); }}
          onClose={() => setConfirming(false)}
        />
      )}
    </>
  );
}
