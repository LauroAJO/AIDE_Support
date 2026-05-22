import { useState } from 'react';
import { AlertTriangle, Star, ChevronRight, ChevronDown } from 'lucide-react';
import Avatar from '../shared/Avatar';
import {
  scoreColor,
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  isOverdue,
  needsDate,
} from '../../lib/tasks';

export default function TaskCard({ task, selected, onClick, onToggleFavorite, onToggleSubtask }) {
  const overdue = isOverdue(task.due_date);
  const warn = needsDate(task);
  const fav = !!task.favorited;
  const subs = task.subtasks || [];
  const [expanded, setExpanded] = useState(false);

  return (
    // role=button (not a real <button>) so the favorite <button> can nest validly.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{ borderLeftWidth: 4, borderLeftColor: scoreColor(task.score) }}
      className={`w-full cursor-pointer rounded-lg border bg-surface p-3 text-left transition hover:-translate-y-px hover:shadow-soft ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-ink">{task.title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(task);
              }}
              title={fav ? 'Remover dos favoritos' : 'Favoritar'}
              className="rounded p-0.5 transition hover:bg-surface2"
            >
              <Star
                className="h-4 w-4"
                style={{ color: fav ? '#F59E0B' : '#9E9890', fill: fav ? '#F59E0B' : 'none' }}
              />
            </button>
          )}
          <span
            className="rounded-md px-1.5 py-0.5 text-xs font-bold text-white"
            style={{ background: scoreColor(task.score) }}
          >
            {task.score}
          </span>
        </div>
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

      {subs.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="flex items-center gap-1 text-[11px] font-medium text-ink2 hover:text-ink"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {subs.length} subtarefa{subs.length > 1 ? 's' : ''}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-1">
              {subs.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!s.done}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSubtask?.(task, s.id);
                    }}
                    className="accent-[#6366f1]"
                  />
                  <span className={s.done ? 'text-muted line-through' : 'text-ink'}>{s.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
