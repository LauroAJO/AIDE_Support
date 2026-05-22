import { useState } from 'react';
import { X, Star, Pencil, CheckCircle2, Trash2, Paperclip, ExternalLink, Send } from 'lucide-react';
import { useStore } from '../../store';
import Avatar from '../shared/Avatar';
import MentionText from './MentionText';
import { scoreColor, STATUS_LABELS, STATUS_COLORS, formatDate, isOverdue } from '../../lib/tasks';

// Centered modal: read-only view + quick actions. Editing the full task still
// uses the existing TaskEditor slide-in (opened via onEdit).
export default function TaskModal({ task, onClose, onEdit, onPersist, onDelete }) {
  const currentUser = useStore((s) => s.user);
  const [comment, setComment] = useState('');

  if (!task) return null;
  const subs = task.subtasks || [];
  const done = subs.filter((s) => s.done).length;
  const overdue = isOverdue(task.due_date);

  const toggleSub = (id) =>
    onPersist(task, { subtasks: subs.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });

  const addComment = () => {
    const v = comment.trim();
    if (!v) return;
    const now = Date.now();
    const name = currentUser?.name || 'Você';
    const next = [
      ...(task.comments || []),
      { id: crypto.randomUUID(), authorId: currentUser?.id || null, authorName: name, author: name, text: v, createdAt: now, at: now },
    ];
    onPersist(task, { comments: next });
    setComment('');
  };

  const complete = () => {
    onPersist(task, { status: 'done' });
    onClose();
  };
  const remove = () => {
    if (!window.confirm('Excluir esta tarefa? Esta ação não pode ser desfeita.')) return;
    onDelete(task.id);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 sm:p-4" onClick={onClose}>
      <div
        className="flex h-full w-full flex-col overflow-y-auto bg-surface sm:h-auto sm:max-h-[85vh] sm:max-w-[680px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-ink">{task.title}</h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="rounded px-2 py-0.5 text-xs font-medium text-white" style={{ background: STATUS_COLORS[task.status] }}>
                {STATUS_LABELS[task.status]}
              </span>
              <span className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: scoreColor(task.score) }}>
                Score {task.score}
              </span>
              <button
                type="button"
                onClick={() => onPersist(task, { favorited: task.favorited ? 0 : 1 })}
                title={task.favorited ? 'Remover dos favoritos' : 'Favoritar'}
              >
                <Star className="h-5 w-5" style={{ color: task.favorited ? '#F59E0B' : '#9E9890', fill: task.favorited ? '#F59E0B' : 'none' }} />
              </button>
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md p-1 text-ink2 hover:bg-surface2 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 p-5">
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {task.assignedUser && (
              <span className="flex items-center gap-1.5 text-ink2">
                <Avatar user={task.assignedUser} size={20} /> {task.assignedUser.name}
              </span>
            )}
            {task.due_date && (
              <span className="font-medium" style={{ color: overdue ? '#EF4444' : '#6B6560' }}>
                Prazo: {formatDate(task.due_date)}
              </span>
            )}
            {task.projectName && <span className="text-ink2">Projeto: {task.projectName}</span>}
            <span className="text-ink2">U {task.urgency} · I {task.importance} · E {task.energy}</span>
          </div>

          {task.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {task.tags.map((t) => (
                <span key={t} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2">#{t}</span>
              ))}
            </div>
          )}

          {task.description && <p className="whitespace-pre-wrap text-sm text-ink">{task.description}</p>}

          {/* Subtasks */}
          {subs.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink2">
                <span>Subtarefas</span>
                <span>{done}/{subs.length} concluídas</span>
              </div>
              <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${subs.length ? (done / subs.length) * 100 : 0}%` }} />
              </div>
              <ul className="space-y-1">
                {subs.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={!!s.done} onChange={() => toggleSub(s.id)} className="accent-[#6366f1]" />
                    <span className={s.done ? 'text-muted line-through' : 'text-ink'}>{s.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Drive attachments */}
          {task.drive_attachments?.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Anexos do Drive</p>
              <div className="flex flex-wrap gap-1.5">
                {task.drive_attachments.map((a) => (
                  <a
                    key={a.googleFileId}
                    href={a.webViewLink || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-full bg-surface2 px-2 py-1 text-[11px] text-ink2 hover:text-accent"
                    title={a.name}
                  >
                    {a.iconLink ? <img src={a.iconLink} alt="" className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
                    <span className="max-w-[160px] truncate">{a.name}</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Comments */}
          <div>
            <p className="mb-1 text-xs font-medium text-ink2">Comentários</p>
            <ul className="space-y-2">
              {(task.comments || []).map((c) => (
                <li key={c.id} className="rounded-lg bg-surface2 p-2 text-xs">
                  <div className="flex justify-between text-[10px] text-muted">
                    <span>{c.authorName || c.author}</span>
                    <span>{c.createdAt || c.at ? new Date(c.createdAt || c.at).toLocaleString('pt-BR') : ''}</span>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-ink"><MentionText text={c.text} /></p>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addComment())}
                placeholder="Escrever comentário"
                className="input flex-1"
              />
              <button type="button" onClick={addComment} className="btn-icon">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t border-line p-4">
          <button
            onClick={() => onEdit(task)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            <Pencil className="h-4 w-4" /> Editar tarefa
          </button>
          {task.status !== 'done' && (
            <button
              onClick={complete}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ background: '#22C55E' }}
            >
              <CheckCircle2 className="h-4 w-4" /> Concluir tarefa
            </button>
          )}
          <button onClick={remove} className="ml-auto flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10">
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
