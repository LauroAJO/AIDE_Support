import { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { STATUSES, STATUS_LABELS } from '../../lib/tasks';

// Barra de edição em lote (v2.25.20) — aparece quando há tarefas selecionadas
// na Lista. Cada controle só entra no PATCH se o usuário realmente mexeu nele
// (senão um <select> "Não alterar" esquecido zeraria o campo em todas as
// tarefas — mesmo cuidado que o PUT individual toma com `undefined`).
const UNCHANGED = '__unchanged__';
const CLEAR = '__clear__';

export default function TaskBulkBar({ count, users, projects, onApply, onClear }) {
  const [assignedTo, setAssignedTo] = useState(UNCHANGED);
  const [status, setStatus] = useState(UNCHANGED);
  const [dueDate, setDueDate] = useState('');
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [projectId, setProjectId] = useState(UNCHANGED);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const dirty = assignedTo !== UNCHANGED || status !== UNCHANGED || dueDateTouched || projectId !== UNCHANGED;

  const reset = () => {
    setAssignedTo(UNCHANGED);
    setStatus(UNCHANGED);
    setDueDate('');
    setDueDateTouched(false);
    setProjectId(UNCHANGED);
    setError('');
  };

  const apply = async () => {
    const patch = {};
    if (assignedTo !== UNCHANGED) patch.assigned_to = assignedTo === CLEAR ? null : assignedTo;
    if (status !== UNCHANGED) patch.status = status;
    if (dueDateTouched) patch.due_date = dueDate || null;
    if (projectId !== UNCHANGED) patch.project_id = projectId === CLEAR ? null : projectId;
    if (Object.keys(patch).length === 0) return;
    setBusy(true);
    setError('');
    try {
      await onApply(patch);
      reset();
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 160));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2.5">
      <span className="text-sm font-semibold text-ink">
        {count} tarefa{count > 1 ? 's' : ''} selecionada{count > 1 ? 's' : ''}
      </span>

      <select
        value={assignedTo}
        onChange={(e) => setAssignedTo(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
      >
        <option value={UNCHANGED}>Responsável — não alterar</option>
        <option value={CLEAR}>Ninguém</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name || u.email}</option>
        ))}
      </select>

      <select
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
      >
        <option value={UNCHANGED}>Status — não alterar</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
        ))}
      </select>

      <select
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
      >
        <option value={UNCHANGED}>Projeto — não alterar</option>
        <option value={CLEAR}>Sem projeto</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <input
        type="date"
        value={dueDate}
        onChange={(e) => { setDueDate(e.target.value); setDueDateTouched(true); }}
        title="Prazo — deixe em branco e altere para limpar o prazo de todas"
        className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
      />
      {dueDateTouched && (
        <button
          type="button"
          onClick={() => { setDueDate(''); setDueDateTouched(false); }}
          className="text-[11px] text-muted underline hover:text-ink2"
        >
          desfazer prazo
        </button>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={!dirty || busy}
        className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Aplicar
      </button>

      <button
        type="button"
        onClick={onClear}
        className="ml-auto flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink"
      >
        <X className="h-3.5 w-3.5" />
        Limpar seleção
      </button>

      {error && <p className="w-full text-xs text-danger">{error}</p>}
    </div>
  );
}
