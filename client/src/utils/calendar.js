// Calendar utilities — mirrors original HTML logic exactly.
// day_key = weekOffset * 7 + dayOfWeek  (0–6)
// Base week = Sunday of the current week at page load.

const _baseWeekSunday = weekSunday(new Date());

export function weekSunday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function sundayOfWeekOffset(offset) {
  const d = new Date(_baseWeekSunday);
  d.setDate(d.getDate() + offset * 7);
  return d;
}

export function dateToKey(date) {
  const sun = weekSunday(date);
  const diffMs = sun.getTime() - _baseWeekSunday.getTime();
  const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks * 7 + date.getDay();
}

export function keyToDate(key) {
  const wo  = Math.floor(key / 7);
  const dow = ((key % 7) + 7) % 7;
  const d   = new Date(_baseWeekSunday);
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

export const fmtDate  = d => d.toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
export const fmtDateShort = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
export const fmtMonthYear = d => d.toLocaleDateString('en-GB', { month:'long', year:'numeric' });
export const fmtWeekRange = sun => {
  const sat = new Date(sun); sat.setDate(sat.getDate() + 6);
  return fmtDateShort(sun) + ' – ' + fmtDateShort(sat) + ' ' + sat.getFullYear();
};

export function weekLabel(offset) {
  const sun = sundayOfWeekOffset(offset);
  const sat = new Date(sun); sat.setDate(sat.getDate() + 6);
  const fmt = d => d.toLocaleDateString('en-GB', { day:'numeric', month:'short' });
  const range = `(${fmt(sun)}–${fmt(sat)})`;
  if (offset === 0) return `Current week ${range}`;
  if (offset === 1) return `Next week ${range}`;
  if (offset === -1) return `Last week ${range}`;
  return (offset > 0 ? `Week +${offset}` : `Week ${offset}`) + ` ${range}`;
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
