import { toISODate } from './week';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const WEEKDAY_HEADERS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function monthLabel(date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// 42 Date cells (6 weeks), Monday-first, covering the month of `date`.
export function monthGrid(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const dow = first.getDay(); // 0=Sun..6=Sat
  const offset = dow === 0 ? 6 : dow - 1;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

// 7 Date cells (Mon..Sun) for the week containing `date`.
export function weekGrid(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  const start = new Date(d);
  start.setDate(d.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(start);
    x.setDate(start.getDate() + i);
    return x;
  });
}

// The local YYYY-MM-DD an event belongs to (all-day events store a bare date).
export function eventDayKey(event) {
  if (!event.startDatetime) return null;
  if (event.allDay) return event.startDatetime.slice(0, 10);
  return toISODate(new Date(event.startDatetime));
}

export function eventTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function startHour(iso) {
  if (!iso) return 0;
  const d = new Date(iso);
  return d.getHours() + d.getMinutes() / 60;
}

export function durationHours(startIso, endIso) {
  if (!startIso || !endIso) return 1;
  const h = (new Date(endIso) - new Date(startIso)) / 3600000;
  return Math.max(0.5, h);
}

export function isSameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// Convert a datetime-local input value to a full ISO string (UTC).
export function localToISO(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Convert an ISO datetime to a value usable by <input type="datetime-local">.
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}
