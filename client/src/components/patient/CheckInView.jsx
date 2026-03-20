import { useState, useEffect } from 'react';
import api from '../../utils/api';
import { RPE } from '../../constants';
import { dateToKey, today } from '../../utils/calendar';

export default function CheckInView({ patient, onReported }) {
  const dayKey = dateToKey(today());
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [fatigue,    setFatigue]    = useState(5);
  const [pain,       setPain]       = useState(3);
  const [wellbeing,  setWellbeing]  = useState(5);
  const [notes,      setNotes]      = useState('');

  const todayDateStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    setLoading(true);
    api.get(`/reports/${patient.id}`)
      .then(r => {
        const today_ = r.data.find(x => x.day_key === dayKey);

        const hasCheckIn =
          today_ &&
          today_.fatigue != null &&
          today_.pain != null &&
          today_.wellbeing != null &&
          today_.submitted_at?.startsWith(todayDateStr);

        if (hasCheckIn) {
          setReport(today_);
          setFatigue(today_.fatigue ?? 5);
          setPain(today_.pain ?? 3);
          setWellbeing(today_.wellbeing ?? 5);
          setNotes(today_.notes || '');
        } else {
          setReport(null);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [patient.id, dayKey]);

  async function submit() {
    setSaving(true);
    try {
      await api.post(`/reports/${patient.id}`, {
        day_key: dayKey,
        fatigue, pain, wellbeing,
        notes,
        // session_rpe intentionally omitted — handled separately by TodayView
      });
      const r = await api.get(`/reports/${patient.id}`);
      const today_ = r.data.find(x => x.day_key === dayKey);
      setReport(today_);
      onReported?.();
    } catch (e) {
      alert('Error saving: ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ color: 'var(--gray-400)' }}>Loading…</p>;

  if (report) {
    return (
      <div className="success-card">
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Check-in complete!</h2>
        <p style={{ color: 'var(--gray-600)', marginBottom: 20 }}>You've submitted your daily check-in. Keep up the great work!</p>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center' }}>
          {[['Fatigue', report.fatigue], ['Pain', report.pain], ['Wellbeing', report.wellbeing]].map(([label, val]) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--blue)' }}>{val}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function Slider({ label, value, onChange, colorClass, emoji }) {
    return (
      <div className="metric-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontWeight: 700 }}>{emoji} {label}</span>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--blue)' }}>{value}</span>
        </div>
        <input type="range" min={0} max={10} value={value}
          className={colorClass}
          onChange={e => onChange(+e.target.value)}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>0 – None</span>
          <span style={{ fontSize: 12, color: 'var(--gray-600)', fontStyle: 'italic' }}>{RPE[value]}</span>
          <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>10 – Max</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Daily Check-in</h2>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>How are you feeling today?</p>

      <Slider label="Fatigue" value={fatigue} onChange={setFatigue} colorClass="red" emoji="😴" />
      <Slider label="Pain"    value={pain}    onChange={setPain}    colorClass="amber" emoji="🤕" />
      <Slider label="Wellbeing" value={wellbeing} onChange={setWellbeing} colorClass="green" emoji="😊" />

      <div className="form-row">
        <label className="form-label">Notes (optional)</label>
        <textarea className="form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="How did your session go? Any concerns?" />
      </div>

      <button className="btn btn-primary" style={{ width: '100%', padding: '14px', fontSize: 16, marginTop: 8 }}
        onClick={submit} disabled={saving}>
        {saving ? 'Submitting…' : '✓ Submit Check-in'}
      </button>
    </div>
  );
}
