import { Pencil } from 'lucide-react';
import Avatar from '../shared/Avatar';
import {
  scoreColor,
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
} from '../../lib/tasks';

function Pill({ children }) {
  return (
    <span className="rounded bg-surface2 px-1.5 py-0.5 text-[11px] font-medium text-ink2">
      {children}
    </span>
  );
}

export default function TaskDetail({ task, onEdit }) {
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-ink">{task.title}</h3>
        <button
          type="button"
          onClick={onEdit}
          className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white transition hover:bg-accent-hover"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar
        </button>
      </div>

      {task.description && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-ink2">{task.description}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span
          className="rounded px-2 py-0.5 text-[11px] font-medium text-white"
          style={{ background: STATUS_COLORS[task.status] }}
        >
          {STATUS_LABELS[task.status]}
        </span>
        <span
          className="rounded px-2 py-0.5 text-[11px] font-bold text-white"
          style={{ background: scoreColor(task.score) }}
        >
          Score {task.score}
        </span>
        <Pill>U {task.urgency}</Pill>
        <Pill>I {task.importance}</Pill>
        <Pill>E {task.energy}</Pill>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted">Prazo</dt>
          <dd className="text-ink">{task.due_date ? formatDate(task.due_date) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted">Entrega</dt>
          <dd className="text-ink">{task.delivery_date ? formatDate(task.delivery_date) : '—'}</dd>
        </div>
      </dl>

      {task.assignedUser && (
        <div className="mt-3 flex items-center gap-2">
          <Avatar user={task.assignedUser} size={20} />
          <span className="text-xs text-ink2">{task.assignedUser.name}</span>
        </div>
      )}

      {task.tags?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {task.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {task.subtasks?.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted">Subtarefas</p>
          <ul className="space-y-1">
            {task.subtasks.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs text-ink">
                <input type="checkbox" checked={!!s.done} readOnly className="accent-[#6366f1]" />
                <span className={s.done ? 'text-muted line-through' : ''}>{s.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.comments?.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-muted">Comentários</p>
          <ul className="space-y-2">
            {task.comments.map((c) => (
              <li key={c.id} className="rounded-lg bg-surface2 p-2 text-xs">
                <div className="flex justify-between text-[10px] text-muted">
                  <span>{c.author}</span>
                  <span>{c.at ? new Date(c.at).toLocaleString('pt-BR') : ''}</span>
                </div>
                <p className="mt-0.5 text-ink">{c.text}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
