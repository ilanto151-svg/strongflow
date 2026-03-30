// Calendar utilities — mirrors original HTML logic exactly.
// day_key = weekOffset * 7 + dayOfWeek  (0–6)
//
// EPOCH_SUNDAY is the fixed base for all day_key computation.
// It MUST never change — any change invalidates every stored day_key in the DB.
// Chosen as the first Sunday exercises were planned in this deployment (2026-03-22).
const EPOCH_SUNDAY = (() => {
  const d = new Date('2026-03-22T00:00:00');
  d.setHours(0, 0, 0, 0);
  return d;
})();

export function weekSunday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

// Absolute week offset of the current calendar week from EPOCH_SUNDAY.
// Use this to initialise weekOffset state in any component — do NOT hardcode 0.
export function currentWeekOffset() {
  const sun = weekSunday(new Date());
  return Math.round((sun.getTime() - EPOCH_SUNDAY.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

export function sundayOfWeekOffset(offset) {
  const d = new Date(EPOCH_SUNDAY);
  d.setDate(d.getDate() + offset * 7);
  return d;
}

export function dateToKey(date) {
  const sun = weekSunday(date);
  const diffMs = sun.getTime() - EPOCH_SUNDAY.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks * 7 + date.getDay();
}

export function keyToDate(key) {
  const wo  = Math.floor(key / 7);
  const dow = ((key % 7) + 7) % 7;
  const d   = new Date(EPOCH_SUNDAY);
  d.setDate(d.getDate() + wo * 7 + dow);
  return d;
}

export function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a, b) {
  return a && b && a.toDateString() === b.toDateString();
}

export const fmtDate      = d => d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
export const fmtDateShort = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
export const fmtMonthYear = d => d.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
export const fmtWeekRange = sun => {
  const sat = new Date(sun); sat.setDate(sat.getDate() + 6);
  return fmtDateShort(sun) + ' – ' + fmtDateShort(sat) + ' ' + sat.getFullYear();
};

export function weekLabel(offset) {
  const cur = currentWeekOffset();
  const sun = sundayOfWeekOffset(offset);
  const sat = new Date(sun); sat.setDate(sat.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  const range = `(${fmt(sun)}–${fmt(sat)})`;
  if (offset === cur)     return `Current week ${range}`;
  if (offset === cur + 1) return `Next week ${range}`;
  if (offset === cur - 1) return `Last week ${range}`;
  return (offset > cur ? `Week +${offset - cur}` : `Week ${offset - cur}`) + ` ${range}`;
}

// Returns YYYY-MM-DD from a local-time Date without UTC conversion.
// Use this instead of d.toISOString().split('T')[0], which shifts the date
// in UTC+ timezones (local midnight is "yesterday" in UTC).
export function localDateStr(d) {
  return d.getFullYear() + '-'
    + String(d.getMonth() + 1).padStart(2, '0') + '-'
    + String(d.getDate()).padStart(2, '0');
}

export function uid() {
  return Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

export function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
