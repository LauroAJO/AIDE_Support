import { useEffect, useMemo, useState } from 'react';
import { GitMerge, Check, X, Trash2, Search, Loader2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import Avatar from '../shared/Avatar';

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

const TABS = [
  { key: 'tasks', label: 'Tarefas' },
  { key: 'people', label: 'Pessoas' },
];

export default function BridgeCurationPage() {
  const [tab, setTab] = useState('tasks');

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <GitMerge className="h-6 w-6 text-accent" />
          Revisar Bridge do Lifegame
        </h1>
      </div>

      {/* Navegação de abas */}
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition ${
                active
                  ? 'border-indigo-600 font-bold text-indigo-600'
                  : 'border-transparent font-medium text-muted hover:text-ink2'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'tasks' ? <TasksTab /> : <PeopleTab />}
      </div>
    </div>
  );
}

// Barra de seleção/ações compartilhada entre as duas abas.
function Controls({ search, setSearch, placeholder, allSelected, toggleAll, hasRows, onApprove, onReject, busy, selectedCount, extra }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} className="input pl-9" />
      </div>
      <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink2">
        <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!hasRows} />
        Selecionar todas
      </label>
      <button
        type="button"
        onClick={onApprove}
        disabled={busy || !selectedCount}
        className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Aprovar selecionadas
      </button>
      <button
        type="button"
        onClick={onReject}
        disabled={busy || !selectedCount}
        className="flex items-center gap-1.5 rounded-lg border border-danger px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
      >
        <X className="h-4 w-4" /> Rejeitar selecionadas
      </button>
      {extra}
    </div>
  );
}

// Hook compartilhado: carrega uma lista de staging + gerencia seleção/ações.
function useStaging(basePath, searchDebounced) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const load = async (search) => {
    setLoading(true);
    try {
      const q = (search || '').trim();
      const data = await apiFetch(`${basePath}${q ? `?search=${encodeURIComponent(q)}` : ''}`);
      setRows(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const act = async (endpoint, ids, verb) => {
    if (!ids.length) return;
    setBusy(true);
    setFlash('');
    try {
      const res = await apiFetch(`${basePath}/${endpoint}`, { method: 'POST', body: JSON.stringify({ ids }) });
      const n = res.approved != null ? res.approved : res.rejected;
      setFlash(`${n || 0} ${verb}`);
      await load(searchDebounced.current);
    } catch (e) {
      setFlash(`Erro: ${String(e.message || e).slice(0, 120)}`);
    } finally {
      setBusy(false);
    }
  };

  return { rows, loading, selected, setSelected, busy, flash, load, act };
}

function TasksTab() {
  const [search, setSearch] = useState('');
  const searchRef = useMemo(() => ({ current: '' }), []);
  searchRef.current = search;
  const { rows, loading, selected, setSelected, busy, flash, load, act } = useStaging('/api/bridge/staging', searchRef);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = Array.from(selected);

  const clearProcessed = async () => {
    if (!window.confirm('Limpar todas as tarefas já processadas (aprovadas/rejeitadas)?')) return;
    try {
      const res = await apiFetch('/api/bridge/staging/clear', { method: 'DELETE' });
      window.alert(`${res.deleted || 0} registro(s) processado(s) removido(s)`);
    } catch { /* noop */ }
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando tarefas em revisão..." /></div>;

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-sm text-muted">
        {rows.length === 0 ? 'Nenhuma tarefa aguardando aprovação' : `${rows.length} tarefa(s) aguardando aprovação`}
      </p>
      {flash && <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">{flash}</div>}
      <Controls
        search={search} setSearch={setSearch} placeholder="Buscar por título..."
        allSelected={allSelected} toggleAll={toggleAll} hasRows={!!rows.length}
        onApprove={() => act('approve', ids, 'tarefa(s) importada(s) para o AIDE')}
        onReject={() => act('reject', ids, 'tarefa(s) rejeitada(s)')}
        busy={busy} selectedCount={selected.size}
        extra={(
          <button
            type="button" onClick={clearProcessed} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2 disabled:opacity-40"
            title="Remove registros já aprovados/rejeitados"
          >
            <Trash2 className="h-4 w-4" /> Limpar processadas
          </button>
        )}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {rows.length === 0 ? (
          <EmptyState>✅ Nenhuma tarefa aguardando revisão</EmptyState>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const tags = Array.isArray(r.tags) ? r.tags : [];
              const score = r.score != null ? r.score : (r.urgency || 0) + (r.importance || 0);
              return (
                <li key={r.id} className={`flex items-start gap-3 rounded-xl border bg-surface px-3 py-3 transition ${selected.has(r.id) ? 'border-accent shadow-soft' : 'border-line'}`}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="mt-1" />
                  <span className="mt-0.5 shrink-0 rounded-md bg-accent/10 px-2 py-0.5 text-xs font-bold text-accent" title="Urgência + Importância">{score}</span>
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
                        {tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <RowActions busy={busy} onApprove={() => act('approve', [r.id], 'tarefa(s) importada(s) para o AIDE')} onReject={() => act('reject', [r.id], 'tarefa(s) rejeitada(s)')} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function PeopleTab() {
  const [search, setSearch] = useState('');
  const searchRef = useMemo(() => ({ current: '' }), []);
  searchRef.current = search;
  const { rows, loading, selected, setSelected, busy, flash, load, act } = useStaging('/api/bridge/people/staging', searchRef);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = Array.from(selected);

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando pessoas em revisão..." /></div>;

  return (
    <div className="flex h-full flex-col gap-4">
      <p className="text-sm text-muted">
        {rows.length === 0 ? 'Nenhuma pessoa aguardando aprovação' : `${rows.length} pessoa(s) aguardando aprovação`}
      </p>
      {flash && <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">{flash}</div>}
      <Controls
        search={search} setSearch={setSearch} placeholder="Buscar por nome..."
        allSelected={allSelected} toggleAll={toggleAll} hasRows={!!rows.length}
        onApprove={() => act('approve', ids, 'pessoa(s) importada(s) para o AIDE')}
        onReject={() => act('reject', ids, 'pessoa(s) rejeitada(s)')}
        busy={busy} selectedCount={selected.size}
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {rows.length === 0 ? (
          <EmptyState>✅ Nenhuma pessoa aguardando revisão</EmptyState>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const tags = Array.isArray(r.tags) ? r.tags : [];
              return (
                <li key={r.id} className={`flex items-start gap-3 rounded-xl border bg-surface px-3 py-3 transition ${selected.has(r.id) ? 'border-accent shadow-soft' : 'border-line'}`}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="mt-1" />
                  <Avatar user={{ name: r.name }} size={36} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{r.name}</span>
                      <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">Lifegame</span>
                    </div>
                    {r.role && <div className="text-xs text-muted">{r.role}</div>}
                    <div className="mt-1"><ConnectionDots value={r.connection_strength} /></div>
                    {tags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{t}</span>)}
                      </div>
                    )}
                  </div>
                  <RowActions busy={busy} onApprove={() => act('approve', [r.id], 'pessoa(s) importada(s) para o AIDE')} onReject={() => act('reject', [r.id], 'pessoa(s) rejeitada(s)')} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// Força de conexão 1-10 como dez pontinhos.
function ConnectionDots({ value }) {
  const v = Math.max(0, Math.min(10, Number(value) || 0));
  return (
    <span className="inline-flex items-center gap-0.5" title={`Força de conexão: ${v}/10`}>
      {Array.from({ length: 10 }).map((_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < v ? 'bg-accent' : 'bg-line'}`} />
      ))}
    </span>
  );
}

function RowActions({ busy, onApprove, onReject }) {
  return (
    <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
      <button type="button" onClick={onApprove} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40">
        Aprovar
      </button>
      <button type="button" onClick={onReject} disabled={busy} className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40">
        Rejeitar
      </button>
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
      {children}
    </div>
  );
}
