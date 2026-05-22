import { useState } from 'react';
import { Star, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import Avatar from '../shared/Avatar';
import {
  STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  scoreColor,
  formatDate,
  isOverdue,
} from '../../lib/tasks';

// Kanban board with HTML5 drag-and-drop between status columns.
export default function KanbanBoard({
  tasks,
  selectedTask,
  onSelect,
  onToggleFavorite,
  onStatusChange,
  onAddTask,
  onToggleSubtask,
}) {
  const [draggingId, setDraggingId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [expanded, setExpanded] = useState({});

  const byStatus = (s) =>
    tasks
      .filter((t) => t.status === s)
      .sort(
        (a, b) =>
          (b.favorited ? 1 : 0) - (a.favorited ? 1 : 0) || (b.score ?? 0) - (a.score ?? 0)
      );

  const handleDrop = (e, status) => {
    e.preventDefault();
    setOverCol(null);
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    const task = tasks.find((t) => t.id === id);
    if (task && task.status !== status) onStatusChange(task, status);
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {STATUSES.map((status) => {
        const items = byStatus(status);
        const isOver = overCol === status;
        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(status);
            }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={(e) => handleDrop(e, status)}
            className="flex w-72 shrink-0 flex-col rounded-xl bg-surface"
            style={{
              border: `${isOver ? 2 : 1}px solid ${isOver ? '#6366f1' : '#E8E3DB'}`,
            }}
          >
            <div
              className="flex items-center justify-between rounded-t-xl px-3 py-2 text-sm font-semibold text-white"
              style={{ background: STATUS_COLORS[status] }}
            >
              <span>{STATUS_LABELS[status]}</span>
              <span className="rounded-full bg-white/25 px-1.5 text-xs">{items.length}</span>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ minHeight: 80 }}>
              {items.map((t) => {
                const overdue = isOverdue(t.due_date);
                const fav = !!t.favorited;
                const sel = selectedTask?.id === t.id;
                return (
                  <div
                    key={t.id}
                    draggable="true"
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', t.id);
                      e.dataTransfer.effectAllowed = 'move';
                      setDraggingId(t.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onSelect(t)}
                    style={{
                      opacity: draggingId === t.id ? 0.5 : 1,
                      borderLeftWidth: 4,
                      borderLeftColor: scoreColor(t.score),
                    }}
                    className={`cursor-pointer rounded-lg border bg-surface p-2.5 transition hover:shadow-soft ${
                      sel ? 'border-accent ring-1 ring-accent' : 'border-line'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{t.title}</span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(t);
                          }}
                          title={fav ? 'Remover dos favoritos' : 'Favoritar'}
                          className="rounded p-0.5 hover:bg-surface2"
                        >
                          <Star
                            className="h-3.5 w-3.5"
                            style={{ color: fav ? '#F59E0B' : '#9E9890', fill: fav ? '#F59E0B' : 'none' }}
                          />
                        </button>
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white"
                          style={{ background: scoreColor(t.score) }}
                        >
                          {t.score}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      {t.due_date ? (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            overdue ? 'text-white' : 'bg-surface2 text-ink2'
                          }`}
                          style={overdue ? { background: '#EF4444' } : undefined}
                        >
                          {formatDate(t.due_date)}
                        </span>
                      ) : (
                        <span />
                      )}
                      {t.assignedUser && <Avatar user={t.assignedUser} size={18} />}
                    </div>
                    {(t.subtasks || []).length > 0 && (
                      <div className="mt-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded((m) => ({ ...m, [t.id]: !m[t.id] }));
                          }}
                          className="flex items-center gap-1 text-[10px] font-medium text-ink2 hover:text-ink"
                        >
                          {expanded[t.id] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {t.subtasks.length} subtarefa{t.subtasks.length > 1 ? 's' : ''}
                        </button>
                        {expanded[t.id] && (
                          <ul className="mt-1 space-y-1">
                            {t.subtasks.map((s) => (
                              <li key={s.id} className="flex items-center gap-1.5 text-[11px]">
                                <input
                                  type="checkbox"
                                  checked={!!s.done}
                                  onClick={(e) => e.stopPropagation()}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    onToggleSubtask?.(t, s.id);
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
              })}
            </div>

            <button
              type="button"
              onClick={() => onAddTask(status)}
              className="m-2 flex items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 text-xs font-medium text-ink2 transition hover:bg-surface2"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
            </button>
          </div>
        );
      })}
    </div>
  );
}
