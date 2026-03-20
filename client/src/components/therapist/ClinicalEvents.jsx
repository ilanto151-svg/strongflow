import { useState, useEffect } from 'react';
import api from '../../utils/api';

// Get today's date in local timezone (not UTC) to avoid off-by-one in UTC- timezones
const TODAY = new Intl.DateTimeFormat('en-CA').format(new Date());

// ── Date helpers (mirrors server-side logic for display accuracy) ─────────────
function addDateInterval(dateStr, value, unit) {
  const d = new Date(dateStr + 'T12:00:00Z');
  if (unit === 'days')  d.setUTCDate(d.getUTCDate() + value);
  else if (unit === 'weeks') d.setUTCDate(d.getUTCDate() + value * 7);
  else d.setUTCMonth(d.getUTCMonth() + value); // months — real calendar
  return d.toISOString().split('T')[0];
}

const CATEGORIES = [
  { value: 'scan',       label: '🔬 Scan / Imaging' },
  { value: 'doctor',     label: '🩺 Doctor Visit' },
  { value: 'treatment',  label: '💉 Treatment / Infusion' },
  { value: 'test',       label: '🧪 Blood / Lab Test' },
  { value: 'follow_up',  label: '📋 Follow-up' },
  { value: 'other',      label: '📅 Other' },
];

const CATEGORY_ICONS = {
  scan: '🔬', doctor: '🩺', treatment: '💉',
  test: '🧪', follow_up: '📋', other: '📅',
};

const PRIORITY_META = {
  info:      { label: 'Info',      bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
  caution:   { label: 'Caution',   bg: '#fffbeb', color: '#92400e', border: '#fde68a' },
  important: { label: 'Important', bg: '#fef2f2', color: '#991b1b', border: '#fca5a5' },
};

const BLANK = {
  title: '',
  event_type: '',
  event_mode: 'one_time',
  exact_date: TODAY,
  event_time: '',
  recurrence_frequency_value: 1,
  recurrence_frequency_unit: 'weeks',
  start_date: TODAY,
  end_date: '',
  notes: '',
  category: 'other',
  priority: 'info',
  show_in_weekly_reminders: true,
  mark_exact_day_in_calendar: true,
  pre_reminder_enabled: false,
  pre_reminder_offset_value: 1,
  pre_reminder_offset_unit: 'days',
  same_day_reminder_enabled: false,
  post_reminder_enabled: false,
  post_reminder_offset_value: 1,
  post_reminder_offset_unit: 'weeks',
  send_email: false,
  send_whatsapp: false,
  notification_time: '08:00',
  is_active: true,
};

function fmtDate(str) {
  if (!str) return '—';
  // Use UTC noon to avoid timezone-based off-by-one when displaying YYYY-MM-DD strings
  return new Date(str + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nextOccurrence(ev) {
  if (!ev.is_active) return null;
  if (ev.event_mode === 'one_time') return ev.exact_date || null;
  if (!ev.start_date) return null;

  const todayStr = new Intl.DateTimeFormat('en-CA').format(new Date());
  let cur    = ev.start_date;
  let safety = 0;
  // Advance until cur >= today
  while (cur < todayStr && safety++ < 10000) {
    const next = addDateInterval(cur, ev.recurrence_frequency_value, ev.recurrence_frequency_unit);
    if (next === cur) break;
    cur = next;
  }
  if (ev.end_date && cur > ev.end_date) return null;
  return cur;
}

function reminderSummary(ev) {
  const parts = [];
  if (ev.pre_reminder_enabled)      parts.push(`${ev.pre_reminder_offset_value} ${ev.pre_reminder_offset_unit} before`);
  if (ev.same_day_reminder_enabled) parts.push('same day');
  if (ev.post_reminder_enabled)     parts.push(`${ev.post_reminder_offset_value} ${ev.post_reminder_offset_unit} after`);
  return parts.length ? parts.join(' · ') : 'none';
}

// ── Event form ────────────────────────────────────────────────────────────────
function EventForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState({ ...BLANK, ...initial });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  function submit() {
    if (!f.title.trim()) return alert('Event title is required.');
    if (f.event_mode === 'one_time' && !f.exact_date)  return alert('Date is required.');
    if (f.event_mode === 'recurring' && !f.start_date) return alert('Start date is required.');
    onSave(f);
  }

  const row = (label, children) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );

  const check = (label, field) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: 4 }}>
      <input type="checkbox" checked={!!f[field]} onChange={e => set(field, e.target.checked)} />
      {label}
    </label>
  );

  const pm = PRIORITY_META[f.priority] || PRIORITY_META.info;

  return (
    <div style={{ background: '#f8fafc', border: '1px solid var(--gray-200)', borderRadius: 12, padding: 16, marginBottom: 14 }}>

      {/* Core info */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          {row('Event Title *', <input className="form-input" value={f.title} onChange={e => set('title', e.target.value)} placeholder="e.g. PET-CT, Blood Test, Oncology Follow-up" />)}
        </div>
        <div>
          {row('Category', (
            <select className="form-input" value={f.category} onChange={e => set('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          ))}
        </div>
        <div>
          {row('Priority', (
            <select className="form-input" value={f.priority} onChange={e => set('priority', e.target.value)}>
              <option value="info">Info</option>
              <option value="caution">⚠ Caution</option>
              <option value="important">🔴 Important</option>
            </select>
          ))}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          {row('Event Type / Label (optional)', <input className="form-input" value={f.event_type} onChange={e => set('event_type', e.target.value)} placeholder="e.g. CT with contrast, CBC panel" />)}
        </div>
      </div>

      {/* Scheduling */}
      <div style={{ background: '#fff', border: '1px solid var(--gray-100)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>📅 Schedule</div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          {['one_time', 'recurring'].map(mode => (
            <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', fontWeight: f.event_mode === mode ? 700 : 400 }}>
              <input type="radio" name="event_mode" value={mode} checked={f.event_mode === mode} onChange={() => set('event_mode', mode)} />
              {mode === 'one_time' ? 'One-time event' : 'Recurring event'}
            </label>
          ))}
        </div>

        {f.event_mode === 'one_time' ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>{row('Date *', <input className="form-input" type="date" value={f.exact_date} onChange={e => set('exact_date', e.target.value)} />)}</div>
            <div>{row('Time (optional)', <input className="form-input" type="time" value={f.event_time} onChange={e => set('event_time', e.target.value)} />)}</div>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                <div style={{ flex: 1 }}>{row('Frequency', (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="form-input" type="number" min="1" value={f.recurrence_frequency_value} onChange={e => set('recurrence_frequency_value', +e.target.value)} style={{ width: 60 }} />
                    <select className="form-input" value={f.recurrence_frequency_unit} onChange={e => set('recurrence_frequency_unit', e.target.value)} style={{ flex: 1 }}>
                      <option value="days">days</option>
                      <option value="weeks">weeks</option>
                      <option value="months">months</option>
                    </select>
                  </div>
                ))}</div>
              </div>
              <div>{row('Start Date *', <input className="form-input" type="date" value={f.start_date} onChange={e => set('start_date', e.target.value)} />)}</div>
              <div>{row('End Date (optional)', <input className="form-input" type="date" value={f.end_date || ''} onChange={e => set('end_date', e.target.value)} />)}</div>
            </div>
          </>
        )}
      </div>

      {/* Reminders */}
      <div style={{ background: '#fff', border: '1px solid var(--gray-100)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>🔔 Reminders</div>

        <div style={{ marginBottom: 6 }}>
          {check('Pre-event reminder', 'pre_reminder_enabled')}
          {f.pre_reminder_enabled && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 22, marginBottom: 4 }}>
              <input className="form-input" type="number" min="1" value={f.pre_reminder_offset_value} onChange={e => set('pre_reminder_offset_value', +e.target.value)} style={{ width: 56, fontSize: 13 }} />
              <select className="form-input" value={f.pre_reminder_offset_unit} onChange={e => set('pre_reminder_offset_unit', e.target.value)} style={{ fontSize: 13 }}>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <span style={{ fontSize: 13, color: 'var(--gray-500)', alignSelf: 'center' }}>before</span>
            </div>
          )}
        </div>

        {check('Same-day reminder', 'same_day_reminder_enabled')}

        <div style={{ marginTop: 6 }}>
          {check('Post-event reminder', 'post_reminder_enabled')}
          {f.post_reminder_enabled && (
            <div style={{ display: 'flex', gap: 6, marginLeft: 22, marginBottom: 4 }}>
              <input className="form-input" type="number" min="1" value={f.post_reminder_offset_value} onChange={e => set('post_reminder_offset_value', +e.target.value)} style={{ width: 56, fontSize: 13 }} />
              <select className="form-input" value={f.post_reminder_offset_unit} onChange={e => set('post_reminder_offset_unit', e.target.value)} style={{ fontSize: 13 }}>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <span style={{ fontSize: 13, color: 'var(--gray-500)', alignSelf: 'center' }}>after</span>
            </div>
          )}
        </div>
      </div>

      {/* Calendar & notifications */}
      <div style={{ background: '#fff', border: '1px solid var(--gray-100)', borderRadius: 8, padding: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-600)', marginBottom: 8 }}>📌 Display & Notifications</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            {check('Mark event date in calendar', 'mark_exact_day_in_calendar')}
            {check('Show in weekly reminder area', 'show_in_weekly_reminders')}
          </div>
          <div>
            {check('Send email notification', 'send_email')}
            {check('Send WhatsApp notification', 'send_whatsapp')}
          </div>
        </div>
        {(f.send_email || f.send_whatsapp) && (
          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-600)', display: 'block', marginBottom: 3 }}>
              Send notifications at
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input className="form-input" type="time" value={f.notification_time || '08:00'} onChange={e => set('notification_time', e.target.value)} style={{ width: 110, fontSize: 13 }} />
              <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>Notifications are sent to the therapist's registered email / WhatsApp.</span>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      {row('Clinical Notes / Instructions', (
        <textarea className="form-input" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. Avoid intense training 24h before scan. Ask patient about fatigue after." />
      ))}

      {/* Active */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} />
          Active
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary" onClick={submit}>Save Event</button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ClinicalEvents({ patient }) {
  const [events,   setEvents]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [editing,  setEditing]  = useState(null);
  const [expanded, setExpanded] = useState(null);

  function load() {
    setLoading(true);
    api.get(`/events/${patient.id}`)
      .then(r => setEvents(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(load, [patient.id]);

  async function saveEvent(form) {
    if (editing) {
      await api.put(`/events/${patient.id}/${editing}`, form);
      setEditing(null);
    } else {
      const res = await api.post(`/events/${patient.id}`, form);
      setExpanded(res.data.id);
      setShowAdd(false);
    }
    load();
  }

  async function deleteEvent(eid) {
    if (!confirm('Delete this clinical event?')) return;
    await api.delete(`/events/${patient.id}/${eid}`);
    if (expanded === eid) setExpanded(null);
    load();
  }

  async function toggleActive(ev) {
    await api.put(`/events/${patient.id}/${ev.id}`, { ...ev, is_active: !ev.is_active });
    load();
  }

  if (loading) return <p style={{ color: 'var(--gray-400)', padding: 8 }}>Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📅 Clinical Events</h3>
          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>{patient.name}</p>
        </div>
        {!showAdd && <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setShowAdd(true)}>+ Add Event</button>}
      </div>

      {showAdd && <EventForm onSave={saveEvent} onCancel={() => setShowAdd(false)} />}

      {events.length === 0 && !showAdd && (
        <div className="empty" style={{ padding: '32px 0' }}>
          <div className="empty-icon">📅</div>
          <div>No clinical events recorded yet.</div>
        </div>
      )}

      {events.map(ev => {
        const isExpanded = expanded === ev.id;
        const isEditing  = editing  === ev.id;
        const pm         = PRIORITY_META[ev.priority] || PRIORITY_META.info;
        const icon       = CATEGORY_ICONS[ev.category] || '📅';
        const next       = nextOccurrence(ev);

        return (
          <div key={ev.id} style={{ border: `1px solid ${pm.border}`, borderRadius: 12, marginBottom: 10, overflow: 'hidden', background: '#fff' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer', background: isExpanded ? pm.bg : '#fff' }}
              onClick={() => setExpanded(isExpanded ? null : ev.id)}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{ev.title}</span>
                  {ev.event_type && <span style={{ fontSize: 11, background: '#f3f4f6', color: 'var(--gray-600)', borderRadius: 6, padding: '1px 7px' }}>{ev.event_type}</span>}
                  <span style={{ fontSize: 11, background: pm.bg, color: pm.color, border: `1px solid ${pm.border}`, borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>
                    {pm.label}
                  </span>
                  <span style={{ fontSize: 11, background: ev.is_active ? '#dcfce7' : '#f3f4f6', color: ev.is_active ? '#166534' : 'var(--gray-500)', borderRadius: 6, padding: '1px 7px', fontWeight: 600 }}>
                    {ev.is_active ? '● Active' : '○ Inactive'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                    {ev.event_mode === 'one_time' ? 'One-time' : `Every ${ev.recurrence_frequency_value} ${ev.recurrence_frequency_unit}`}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                  {ev.event_mode === 'one_time' ? fmtDate(ev.exact_date) : `Next: ${next ? fmtDate(next) : 'ended'}`}
                  {reminderSummary(ev) !== 'none' && ` · Reminders: ${reminderSummary(ev)}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button className="icon-btn" title={ev.is_active ? 'Deactivate' : 'Activate'}
                  onClick={e => { e.stopPropagation(); toggleActive(ev); }}>{ev.is_active ? '⏸' : '▶'}</button>
                <button className="icon-btn" title="Edit"
                  onClick={e => { e.stopPropagation(); setEditing(ev.id); setExpanded(ev.id); }}>✏️</button>
                <button className="icon-btn" title="Delete"
                  onClick={e => { e.stopPropagation(); deleteEvent(ev.id); }}>🗑️</button>
              </div>
              <span style={{ color: 'var(--gray-400)', fontSize: 12, transition: 'transform .2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▼</span>
            </div>

            {/* Body */}
            {isExpanded && (
              <div style={{ borderTop: `1px solid ${pm.border}`, padding: '12px 14px' }}>
                {isEditing ? (
                  <EventForm initial={ev} onSave={saveEvent} onCancel={() => setEditing(null)} />
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13, marginBottom: ev.notes ? 10 : 0 }}>
                      {ev.event_mode === 'one_time' ? (
                        <>
                          <div><span style={{ color: 'var(--gray-400)' }}>Date:</span> {fmtDate(ev.exact_date)}{ev.event_time && ` at ${ev.event_time}`}</div>
                        </>
                      ) : (
                        <>
                          <div><span style={{ color: 'var(--gray-400)' }}>Start:</span> {fmtDate(ev.start_date)}</div>
                          {ev.end_date && <div><span style={{ color: 'var(--gray-400)' }}>End:</span> {fmtDate(ev.end_date)}</div>}
                          <div><span style={{ color: 'var(--gray-400)' }}>Freq:</span> every {ev.recurrence_frequency_value} {ev.recurrence_frequency_unit}</div>
                          <div><span style={{ color: 'var(--gray-400)' }}>Next:</span> {next ? fmtDate(next) : 'ended'}</div>
                        </>
                      )}
                    </div>

                    {/* Reminder summary */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      {ev.pre_reminder_enabled && (
                        <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '2px 8px' }}>
                          🔔 {ev.pre_reminder_offset_value} {ev.pre_reminder_offset_unit} before
                        </span>
                      )}
                      {ev.same_day_reminder_enabled && (
                        <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '2px 8px' }}>🔔 Same day</span>
                      )}
                      {ev.post_reminder_enabled && (
                        <span style={{ fontSize: 12, background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '2px 8px' }}>
                          🔔 {ev.post_reminder_offset_value} {ev.post_reminder_offset_unit} after
                        </span>
                      )}
                      {ev.mark_exact_day_in_calendar && <span style={{ fontSize: 12, background: '#f0fdf4', color: '#166534', borderRadius: 6, padding: '2px 8px' }}>📌 Calendar</span>}
                      {ev.send_email     && <span style={{ fontSize: 12, background: '#faf5ff', color: '#7c3aed', borderRadius: 6, padding: '2px 8px' }}>✉ Email</span>}
                      {ev.send_whatsapp  && <span style={{ fontSize: 12, background: '#f0fdf4', color: '#15803d', borderRadius: 6, padding: '2px 8px' }}>💬 WhatsApp</span>}
                    </div>

                    {ev.notes && (
                      <div style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-600)', background: '#fafafa', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${pm.border}` }}>
                        📝 {ev.notes}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
