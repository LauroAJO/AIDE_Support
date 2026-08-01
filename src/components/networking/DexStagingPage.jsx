import { useEffect, useState } from 'react';
import { Users, Check, X, Trash2, Search, Loader2, Linkedin } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import Avatar from '../shared/Avatar';

export default function DexStagingPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState('');

  const load = async (q) => {
    setLoading(true);
    try {
      const term = (q || '').trim();
      const data = await apiFetch(`/api/dex/staging${term ? `?search=${encodeURIComponent(term)}` : ''}`);
      setRows(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const act = async (endpoint, ids, verb) => {
    if (!ids.length) return;
    setBusy(true);
    setFlash('');
    try {
      const res = await apiFetch(`/api/dex/staging/${endpoint}`, { method: 'POST', body: JSON.stringify({ ids }) });
      const n = res.approved != null ? res.approved : res.rejected;
      setFlash(`${n || 0} ${verb}`);
      await load(search);
    } catch (e) {
      setFlash(`Erro: ${String(e.message || e).slice(0, 120)}`);
    } finally {
      setBusy(false);
    }
  };

  const clearReviewed = async () => {
    if (!window.confirm('Limpar todos os contatos já revisados (aprovados/rejeitados)?')) return;
    try {
      const res = await apiFetch('/api/dex/staging/clear', { method: 'DELETE' });
      window.alert(`${res.deleted || 0} registro(s) revisado(s) removido(s)`);
    } catch { /* noop */ }
  };

  const allSelected = rows.length > 0 && selected.size === rows.length;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggleOne = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = Array.from(selected);

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando contatos do DEX..." /></div>;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Users className="h-6 w-6 text-accent" />
          Revisar Contatos do DEX
        </h1>
        <p className="mt-1 text-sm text-muted">
          {rows.length === 0 ? 'Nenhum contato aguardando aprovação' : `${rows.length} contato(s) aguardando aprovação`}
        </p>
      </div>

      {flash && <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent">{flash}</div>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, empresa..." className="input pl-9" />
        </div>
        <label className="flex items-center gap-1.5 whitespace-nowrap text-sm text-ink2">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={!rows.length} />
          Selecionar todos
        </label>
        <button
          type="button"
          onClick={() => act('approve', ids, 'contato(s) importado(s) para Networking')}
          disabled={busy || !selected.size}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          ✅ Aprovar selecionados
        </button>
        <button
          type="button"
          onClick={() => act('reject', ids, 'contato(s) rejeitado(s)')}
          disabled={busy || !selected.size}
          className="flex items-center gap-1.5 rounded-lg border border-danger px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40"
        >
          <X className="h-4 w-4" /> ❌ Rejeitar selecionados
        </button>
        <button
          type="button"
          onClick={clearReviewed}
          disabled={busy}
          title="Remove contatos já aprovados/rejeitados"
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2 disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" /> 🗑 Limpar revisados
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            ✅ Nenhum contato aguardando revisão
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className={`flex items-start gap-3 rounded-xl border bg-surface px-3 py-3 transition ${selected.has(r.id) ? 'border-accent shadow-soft' : 'border-line'}`}>
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} className="mt-1" />
                <Avatar user={{ name: r.full_name, avatar: r.image_url || undefined }} size={36} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-ink">{r.full_name}</span>
                    {r.linkedin && (
                      <a href={r.linkedin} target="_blank" rel="noreferrer" title="LinkedIn" onClick={(e) => e.stopPropagation()}>
                        <Linkedin className="h-3.5 w-3.5 text-accent" />
                      </a>
                    )}
                  </div>
                  {(r.job_title || r.company) && (
                    <div className="text-xs text-muted">{[r.job_title, r.company].filter(Boolean).join(' @ ')}</div>
                  )}
                  {r.email && <div className="text-[11px] text-muted">{r.email}</div>}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                  <button type="button" onClick={() => act('approve', [r.id], 'contato(s) importado(s) para Networking')} disabled={busy} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-40">
                    Aprovar
                  </button>
                  <button type="button" onClick={() => act('reject', [r.id], 'contato(s) rejeitado(s)')} disabled={busy} className="rounded-lg border border-danger px-3 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:opacity-40">
                    Rejeitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
