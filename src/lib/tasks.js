// Shared task helpers — mirrors the worker's calcScore so the UI can compute
// scores locally (e.g. while editing sliders before saving).

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
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleDateString('pt-BR');
}

export function isOverdue(due) {
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  return !Number.isNaN(d.getTime()) && d < today;
}

// A task needs attention if it's not done and has no date set at all.
export function needsDate(task) {
  return task.status !== 'done' && !task.due_date && !task.delivery_date;
}
