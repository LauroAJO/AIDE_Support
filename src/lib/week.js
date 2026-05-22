// ISO week helpers — weeks start on Monday.

export function toISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`;
}

// Monday (YYYY-MM-DD) of the week containing `date` (Date or 'YYYY-MM-DD').
export function mondayOf(date) {
  const d = typeof date === 'string' ? new Date(`${date}T00:00:00`) : new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

// weekStart (Monday ISO) → array of 7 ISO dates Mon..Sun.
export function weekDays(weekStart) {
  const base = new Date(`${weekStart}T00:00:00`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return toISODate(d);
  });
}

export function addDaysISO(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

// Parse a 'YYYY-MM-DD' string as a LOCAL date (local midnight), never UTC.
// Using new Date('YYYY-MM-DD') would parse as UTC midnight and shift the day
// back in positive-offset timezones (e.g. UTC+2).
export function parseDateLocal(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight
}

// ISO date → DD/MM/YYYY (parsed as local date).
export function formatDateBR(iso) {
  const d = parseDateLocal(iso);
  if (!d) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ISO date → short weekday + day, e.g. "Seg 21".
const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export function weekdayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return `${WEEKDAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`;
}

export function isTodayISO(iso) {
  return iso === toISODate(new Date());
}
