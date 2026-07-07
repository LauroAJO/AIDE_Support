import { useEffect, useMemo, useState } from 'react';
import { GitMerge, Check, X, Trash2, Search, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';

const STATUS_LABELS = {
  backlog: 'Backlog', todo: 'A fazer', doing: 'Em andamento', done: 'Concluída', blocked: 'Bloqueada',
};
const STATUS_STYLE = {
  backlog: 'bg-surface2 text-ink2',
  todo: 'bg-blue-100 text-blue-700',
  doing: 'bg-amber-100 text-amber-700',
  done: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-danger/10 text-danger',
};

export default function BridgeCurationPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const q = search.trim();
      const data = await apiFetch(`/api/bridge/staging${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setRows(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Busca com debounce leve ao digitar.
  useEffect(() => {
    const t = setTimeout(() => { load(); }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const approve = async (ids) => {
    if (!ids.length) return;
    setBusy(true);
    setFlash('');
    try {
      const res = await apiFetch('/api/bridge/staging/approve', {
        method: 'POST', body: JSON.stringify({ ids }),
      });
      setFlash(`${res.approved || 0} tarefa(s) importada(s) para o AIDE`);
      await load();
    } catch (e) {
      setFlash(`Erro: ${String(e.message || e).slice(0, 120)}`);
    } finally {
      setBusy(false);
    }
  };

  const reject = async (ids) => {
    if (!ids.length) return;
    setBusy(true);
    setFlash('');
    try {
      const res = await apiFetch('/api/bridge/staging/reject', {
        method: 'POST', body: JSON.stringify({ ids }),
      });
      setFlash(`${res.rejected || 0} tarefa(s) rejeitada(s)`);
      await load();
    } catch (e) {
      setFlash(`Erro: ${String(e.message || e).slice(0, 120)}`);
    } finally {
      setBusy(false);
    }
  };

  const clearProcessed = async () => {
    if (!window.confirm('Limpar todas as tarefas já processadas (aprovadas/rejeitadas)?')) return;
    setBusy(true);
    setFlash('');
    try {
      const res = await apiFetch('/api/bridge/staging/clear', { method: 'DELETE' });
      setFlash(`${res.deleted || 0} registro(s) processado(s) removido(s)`);
    } catch (e) {
      setFlash(`Erro: ${String(e.message || e).slice(0, 120)}`);
    } finally {
      setBusy(false);
    }
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando tarefas em revisão..." /></div>;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      {/* Cabeçalho */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <GitMerge className="h-6 w-6 text-accent" />
          Revisar Tarefas do Lifegame
        </h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length === 0 ? 'Nenhuma tarefa aguardando aprovação' : `${rows.length} tarefa(s) aguardando aprovação`}
        </p>
      </div>

      {flash && (
        <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">{flash}</div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título..."
            className="input pl-9"
          />
        </div>
        <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink2">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!rows.length} />
          Selecionar todas
        </label>
        <button
          type="button"
          onClick={() => approve(selectedIds)}
          disabled={busy || !selected.size}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Aprovar selecionadas
        </button>
        <button
          type="button"
          onClick={() => reject(selectedIds)}
          disabled={busy || !selected.size}
          className="flex items-center gap-1.5 rounded-lg border border-danger px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
        >
          <X className="h-4 w-4" /> Rejeitar selecionadas
        </button>
        <button
          type="button"
          onClick={clearProcessed}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2 disabled:opacity-40"
          title="Remove registros já aprovados/rejeitados"
        >
          <Trash2 className="h-4 w-4" /> Limpar processadas
        </button>
      </div>

      {/* Lista */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            ✅ Nenhuma tarefa aguardando revisão
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const tags = Array.isArray(r.tags) ? r.tags : [];
              const score = r.score != null ? r.score : (r.urgency || 0) + (r.importance || 0);
              return (
                <li
                  key={r.id}
                  className={`flex items-start gap-3 rounded-xl border bg-surface px-3 py-3 transition ${
                    selected.has(r.id) ? 'border-accent shadow-soft' : 'border-line'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggleOne(r.id)}
                    className="mt-1"
                  />
                  <span
                    className="mt-0.5 shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent"
                    title="Urgência + Importância"
                  >
                    {score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{r.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status] || 'bg-surface2 text-ink2'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted">U: {r.urgency} · I: {r.importance}</div>
                    {tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tags.slice(0, 3).map((t) => (
                          <span key={t} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                    <button
                      type="button"
                      onClick={() => approve([r.id])}
                      disabled={busy}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40"
                    >
                      Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() => reject([r.id])}
                      disabled={busy}
                      className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
                    >
                      Rejeitar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
