// Shared task helpers — mirrors the worker's calcScore so the UI can compute
// scores locally (e.g. while editing sliders before saving).

import { parseDateLocal } from './week';

export { parseDateLocal };

// Today as 'YYYY-MM-DD' using LOCAL date components (UTC-safe for display logic).
export function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const calcScore = (urgency, importance) =>
  Math.round((urgency * 0.4 + importance * 0.6) * 10) / 10;

export function scoreColor(score) {
  if (score >= 7) return '#EF4444'; // high
  if (score >= 4) return '#F59E0B'; // medium
  return '#9E9890'; // low
}

export const STATUSES = ['backlog', 'todo', 'doing', 'done'];

export const STATUS_LABELS = {
  backlog: 'Backlog',
  todo: 'A Fazer',
  doing: 'Fazendo',
  done: 'Concluída',
};

export const STATUS_COLORS = {
  backlog: '#9E9890',
  todo: '#6366f1',
  doing: '#F59E0B',
  done: '#22C55E',
};

export function formatDate(value) {
  if (!value) return '';
  // Date-only strings ('YYYY-MM-DD') must be parsed as local, not UTC.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = parseDateLocal(value);
    return d ? d.toLocaleDateString('pt-BR') : value;
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString('pt-BR');
}

// Compare date strings directly (no Date objects → no timezone drift).
export function isOverdue(due) {
  if (!due) return false;
  return due < getTodayStr();
}

export function isDueSoon(due) {
  if (!due) return false;
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const tomorrowStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  return due === tomorrowStr;
}

// A task needs attention if it's not done and has no date set at all.
export function needsDate(task) {
  return task.status !== 'done' && !task.due_date && !task.delivery_date;
}
