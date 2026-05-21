import { AlertTriangle } from 'lucide-react';
import Avatar from '../shared/Avatar';
import {
  scoreColor,
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  isOverdue,
  needsDate,
} from '../../lib/tasks';

export default function TaskCard({ task, selected, onClick }) {
  const overdue = isOverdue(task.due_date);
  const warn = needsDate(task);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{ borderLeftWidth: 4, borderLeftColor: scoreColor(task.score) }}
      className={`w-full rounded-lg border bg-surface p-3 text-left transition hover:-translate-y-px hover:shadow-soft ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-ink">{task.title}</span>
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold text-white"
          style={{ background: scoreColor(task.score) }}
        >
          {task.score}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-ink2">
          U: {task.urgency}
        </span>
        <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-ink2">
          I: {task.importance}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ background: STATUS_COLORS[task.status] }}
        >
          {STATUS_LABELS[task.status]}
        </span>
        {task.due_date && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              overdue ? 'text-white' : 'bg-surface2 text-ink2'
            }`}
            style={overdue ? { background: '#EF4444' } : undefined}
          >
            {formatDate(task.due_date)}
          </span>
        )}
        {warn && <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#F59E0B' }} />}
      </div>

      {task.assignedUser && (
        <div className="mt-2 flex items-center gap-1.5">
          <Avatar user={task.assignedUser} size={18} />
          <span className="text-[11px] text-ink2">{task.assignedUser.name}</span>
        </div>
      )}
    </button>
  );
}
