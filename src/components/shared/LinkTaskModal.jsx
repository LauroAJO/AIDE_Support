import { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2, ClipboardList } from 'lucide-react';
import { apiFetch } from '../../lib/api';

// Modal "Vincular à Tarefa" — usado pelos cards de vaga (VagasPhDPage,
// EmpregoPage) para anexar a referência de uma vaga (#short_id + título +
// url) na descrição de uma tarefa existente. Tarefas não têm campo `notes`
// separado (só `description`, ver _worker.js::handleTaskItem) — o vínculo é
// apendado ao final da descrição atual via PUT /api/tasks/:id (não existe
// PATCH para tarefas).
export default function LinkTaskModal({ item, onClose, onLinked }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [linkingId, setLinkingId] = useState(null);

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    apiFetch('/api/tasks')
      .then((r) => setTasks(Array.isArray(r) ? r : []))
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [item]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => (t.title || '').toLowerCase().includes(q));
  }, [tasks, search]);

  if (!item) return null;

  const handleSelect = async (task) => {
    setLinkingId(task.id);
    const link = `\n\n🔗 Vaga: #${item.short_id} — ${item.title}\n${item.url || ''}`;
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify({ description: `${task.description || ''}${link}` }),
      });
      onLinked && onLinked(task);
    } catch (e) {
      onLinked && onLinked(null, e);
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-[70vh] w-full max-w-md flex-col rounded-xl bg-surface shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="flex items-center gap-1.5 text-base font-bold text-ink">
            <ClipboardList className="h-4 w-4 text-accent" /> Vincular à Tarefa
          </h3>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarefa..."
              className="h-9 w-full rounded-lg border border-line bg-surface2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-muted">
              {tasks.length === 0 ? 'Nenhuma tarefa encontrada.' : 'Nenhuma tarefa corresponde à busca.'}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(t)}
                    disabled={linkingId === t.id}
                    className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition hover:bg-surface2 disabled:opacity-50"
                  >
                    <span className="truncate">{t.title}</span>
                    {linkingId === t.id && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
