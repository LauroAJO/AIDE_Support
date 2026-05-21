import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useStore } from '../../store';
import { STATUSES, STATUS_LABELS, calcScore, scoreColor } from '../../lib/tasks';

const EMPTY = {
  title: '',
  description: '',
  status: 'backlog',
  urgency: 5,
  importance: 5,
  energy: 5,
  due_date: '',
  delivery_date: '',
  assigned_to: '',
  tags: [],
  subtasks: [],
  comments: [],
};

function fromTask(task) {
  if (!task) return { ...EMPTY };
  return {
    title: task.title || '',
    description: task.description || '',
    status: task.status || 'backlog',
    urgency: task.urgency ?? 5,
    importance: task.importance ?? 5,
    energy: task.energy ?? 5,
    due_date: task.due_date || '',
    delivery_date: task.delivery_date || '',
    assigned_to: task.assigned_to || '',
    tags: task.tags || [],
    subtasks: task.subtasks || [],
    comments: task.comments || [],
  };
}

function Slider({ label, value, onChange }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs font-medium text-ink2">
        <span>{label}</span>
        <span className="text-ink">{value}</span>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#6366f1]"
      />
    </div>
  );
}

export default function TaskEditor({ task, users, onClose, onSaved, onDeleted }) {
  const currentUser = useStore((s) => s.user);
  const isEdit = !!task;
  const [form, setForm] = useState(() => fromTask(task));
  const [tagInput, setTagInput] = useState('');
  const [subInput, setSubInput] = useState('');
  const [commentInput, setCommentInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const score = calcScore(form.urgency, form.importance);

  const addTag = () => {
    const v = tagInput.trim();
    if (v && !form.tags.includes(v)) set({ tags: [...form.tags, v] });
    setTagInput('');
  };
  const removeTag = (t) => set({ tags: form.tags.filter((x) => x !== t) });

  const addSub = () => {
    const v = subInput.trim();
    if (v) set({ subtasks: [...form.subtasks, { id: crypto.randomUUID(), text: v, done: false }] });
    setSubInput('');
  };
  const toggleSub = (id) =>
    set({ subtasks: form.subtasks.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  const removeSub = (id) => set({ subtasks: form.subtasks.filter((s) => s.id !== id) });

  const addComment = () => {
    const v = commentInput.trim();
    if (!v) return;
    set({
      comments: [
        ...form.comments,
        { id: crypto.randomUUID(), author: currentUser?.name || 'Você', text: v, at: Date.now() },
      ],
    });
    setCommentInput('');
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Título é obrigatório');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      delivery_date: form.delivery_date || null,
    };
    try {
      const saved = isEdit
        ? await apiFetch(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
      onSaved(saved);
    } catch {
      setError('Falha ao salvar a tarefa.');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!window.confirm('Excluir esta tarefa? Esta ação não pode ser desfeita.')) return;
    setSaving(true);
    try {
      await apiFetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
      onDeleted(task.id);
    } catch {
      setError('Falha ao excluir.');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-md flex-col bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">
            {isEdit ? 'Editar tarefa' : 'Nova tarefa'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-ink2 transition hover:bg-surface2 hover:text-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error && (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
              {error}
            </div>
          )}

          <Field label="Título">
            <input
              type="text"
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="O que precisa ser feito?"
              className="input"
            />
          </Field>

          <Field label="Descrição">
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              className="input resize-y"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set({ status: e.target.value })}
                className="input"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsável">
              <select
                value={form.assigned_to}
                onChange={(e) => set({ assigned_to: e.target.value })}
                className="input"
              >
                <option value="">Ninguém</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="space-y-3 rounded-lg border border-line p-3">
            <div className="flex items-center justify-between text-xs font-medium text-ink2">
              <span>Priorização</span>
              <span
                className="rounded px-1.5 py-0.5 font-bold text-white"
                style={{ background: scoreColor(score) }}
              >
                Score {score}
              </span>
            </div>
            <Slider label="Urgência" value={form.urgency} onChange={(v) => set({ urgency: v })} />
            <Slider label="Importância" value={form.importance} onChange={(v) => set({ importance: v })} />
            <Slider label="Energia" value={form.energy} onChange={(v) => set({ energy: v })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Prazo">
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => set({ due_date: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Entrega">
              <input
                type="date"
                value={form.delivery_date}
                onChange={(e) => set({ delivery_date: e.target.value })}
                className="input"
              />
            </Field>
          </div>

          {/* Tags */}
          <Field label="Tags">
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Adicionar tag e Enter"
                className="input flex-1"
              />
              <button type="button" onClick={addTag} className="btn-icon">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {form.tags.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2"
                  >
                    #{t}
                    <button type="button" onClick={() => removeTag(t)} className="text-muted hover:text-danger">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          {/* Subtasks */}
          <Field label="Subtarefas">
            <div className="flex gap-2">
              <input
                type="text"
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSub();
                  }
                }}
                placeholder="Adicionar subtarefa"
                className="input flex-1"
              />
              <button type="button" onClick={addSub} className="btn-icon">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.subtasks.length > 0 && (
              <ul className="mt-2 space-y-1">
                {form.subtasks.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={!!s.done}
                      onChange={() => toggleSub(s.id)}
                      className="accent-[#6366f1]"
                    />
                    <span className={`flex-1 ${s.done ? 'text-muted line-through' : ''}`}>{s.text}</span>
                    <button type="button" onClick={() => removeSub(s.id)} className="text-muted hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          {/* Comments */}
          <Field label="Comentários">
            <div className="flex gap-2">
              <input
                type="text"
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addComment();
                  }
                }}
                placeholder="Escrever comentário"
                className="input flex-1"
              />
              <button type="button" onClick={addComment} className="btn-icon">
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.comments.length > 0 && (
              <ul className="mt-2 space-y-2">
                {form.comments.map((c) => (
                  <li key={c.id} className="rounded-lg bg-surface2 p-2 text-xs">
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>{c.author}</span>
                      <span>{c.at ? new Date(c.at).toLocaleString('pt-BR') : ''}</span>
                    </div>
                    <p className="mt-0.5 text-ink">{c.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
          {isEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}
