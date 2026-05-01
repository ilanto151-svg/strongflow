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
  noProgression   = false,
  noVariation     = false,
  patientModified = false,
  autoFilled      = false,
  overridden      = false,
  selectMode      = false,
  selected        = false,
  onToggleSelect,
}) {
  const [open,       setOpen]       = useState(false);
  const [editing,    setEditing]    = useState(false);
  const [confirming, setConfirming] = useState(false);

  const meta         = TYPE_META[ex.type] || TYPE_META.other;
  const intervals    = ex.intervals
    ? (() => { try { return JSON.parse(ex.intervals); } catch { return []; } })()
    : [];
  const setOverrides = ex.set_overrides
    ? (() => { try { return JSON.parse(ex.set_overrides); } catch { return []; } })()
    : [];
  const aerEquip = ex.aerobic_equipment
    ? (() => { try { return JSON.parse(ex.aerobic_equipment); } catch { return null; } })()
    : null;
  const equipLabels = aerEquip ? [
    ...aerEquip.selected,
    ...(aerEquip.other ? [`Other: ${aerEquip.other}`] : []),
  ] : [];

  return (
    <>
      <div
        className="ex-card"
        style={selected ? { outline: '2px solid #3b82f6', outlineOffset: 1, background: '#eff6ff' } : undefined}
      >
        <div
          className="ex-head"
          onClick={() => selectMode ? onToggleSelect?.() : setOpen(o => !o)}
          style={selectMode ? { cursor: 'pointer' } : undefined}
        >

          {selectMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={e => { e.stopPropagation(); onToggleSelect?.(); }}
              onClick={e => e.stopPropagation()}
              style={{ width: 15, height: 15, flexShrink: 0, cursor: 'pointer', accentColor: '#3b82f6' }}
            />
          )}

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

              {/* Aerobic equipment badges */}
              {equipLabels.map(label => (
                <span key={label} style={{
                  background: '#f0f9ff', color: '#0369a1',
                  border: '1px solid #bae6fd', borderRadius: 8,
                  padding: '1px 7px', fontWeight: 500, fontSize: 11,
                  whiteSpace: 'nowrap',
                }}>{label}</span>
              ))}
              {aerEquip?.incline && (
                <span style={{
                  background: '#fafaf0', color: '#713f12',
                  border: '1px solid #fde68a', borderRadius: 8,
                  padding: '1px 7px', fontWeight: 600, fontSize: 11,
                  whiteSpace: 'nowrap',
                }}>⛰ {aerEquip.incline}</span>
              )}

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

              {/* Auto-filled badge — teal (hidden once manually overridden) */}
              {autoFilled && !overridden && (
                <span
                  title="One or more fields were auto-filled by Global Rules"
                  style={{
                    background: '#f0fdfa',
                    color: '#0f766e',
                    border: '1px solid #99f6e4',
                    borderRadius: 8,
                    padding: '1px 7px',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'default',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⚡ Auto-filled
                </span>
              )}

              {/* Overridden badge — shown when therapist manually edited an auto-filled exercise */}
              {overridden && (
                <span
                  title="Started from Global Rules then manually customised"
                  style={{
                    background: '#faf5ff',
                    color: '#7c3aed',
                    border: '1px solid #ddd6fe',
                    borderRadius: 8,
                    padding: '1px 7px',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'default',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ✏️ Custom
                </span>
              )}

              {/* Patient modified badge — orange */}
              {patientModified && (
                <span
                  title="Patient submitted actual sets / reps / weight for this exercise"
                  style={{
                    background: '#fff7ed',
                    color: '#c2410c',
                    border: '1px solid #fdba74',
                    borderRadius: 8,
                    padding: '1px 7px',
                    fontWeight: 600,
                    fontSize: 11,
                    cursor: 'default',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ⚠ Patient modified
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

          {!selectMode && <span className={`chevron${open ? ' open' : ''}`}>▼</span>}
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
                {!setOverrides.length && ex.reps   && <div className="stat-box"><span className="stat-label">Reps</span><span className="stat-val">{ex.reps}</span></div>}
                {!setOverrides.length && ex.weight && <div className="stat-box"><span className="stat-label">Weight</span><span className="stat-val">{ex.weight}</span></div>}
                {ex.rest   && <div className="stat-box"><span className="stat-label">Rest</span><span className="stat-val">{ex.rest}</span></div>}
              </>}
              {(ex.type === 'aerobic' || ex.type === 'other') && ex.duration && (
                <div className="stat-box"><span className="stat-label">Duration</span><span className="stat-val">{ex.duration}</span></div>
              )}
              {(ex.type === 'aerobic' || ex.type === 'other') && ex.distance && (
                <div className="stat-box"><span className="stat-label">Distance</span><span className="stat-val">{ex.distance}</span></div>
              )}
              {(ex.type === 'aerobic' || ex.type === 'other') && ex.speed && (
                <div className="stat-box"><span className="stat-label">Speed</span><span className="stat-val">{ex.speed}</span></div>
              )}
              {ex.rpe != null && ex.rpe !== '' && (
                <div className="stat-box"><span className="stat-label">Target RPE</span><span className="stat-val">{ex.rpe} – {RPE[ex.rpe]}</span></div>
              )}
            </div>

            {ex.type === 'resistance' && setOverrides.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <table className="interval-table">
                  <thead>
                    <tr><th>Set</th><th>Reps</th><th>Weight</th></tr>
                  </thead>
                  <tbody>
                    {setOverrides.map((s, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 700 }}>{i + 1}</td>
                        <td>{s.reps || '—'}</td>
                        <td>{s.weight || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {ex.type === 'aerobic' && intervals.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <table className="interval-table">
                  <thead>
                    <tr>
                      <th>Intensity</th>
                      <th>Duration</th>
                      <th>RPE</th>
                      <th>HR Zone</th>
                      {intervals.some(r => r.speed) && <th>Speed</th>}
                      {intervals.some(r => r.description) && <th>Note</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {intervals.map((row, i) => (
                      <tr key={row.id || i}>
                        <td>{row.intensity || '—'}</td>
                        <td>{row.duration || '—'}</td>
                        <td>{row.rpe != null && row.rpe !== '' ? `${row.rpe} – ${RPE[row.rpe] || ''}` : '—'}</td>
                        <td>{row.target_hr || '—'}</td>
                        {intervals.some(r => r.speed) && <td>{row.speed || '—'}</td>}
                        {intervals.some(r => r.description) && <td style={{ fontStyle: 'italic', color: 'var(--gray-500)' }}>{row.description || ''}</td>}
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
