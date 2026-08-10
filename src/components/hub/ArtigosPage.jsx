import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen, Search, ExternalLink, Copy, Trash2, Loader2, Star,
  Unlock, Lock, Tag, CalendarDays, Link2,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useStore } from '../../store';
import { MarkdownViewer } from '../../lib/markdownRenderer';
import LoadingSpinner from '../shared/LoadingSpinner';
import ConfirmModal from '../shared/ConfirmModal';

// project_id no hub_items que agrupa os artigos científicos coletados.
const HUB_PROJECT = 'artigos';

const QUARTILE_STYLE = {
  Q1: 'bg-emerald-100 text-emerald-700',
  Q2: 'bg-sky-100 text-sky-700',
  Q3: 'bg-surface2 text-ink2',
  Q4: 'bg-surface2 text-ink2',
};

// Datas chegam como string ISO/SQLite. Mostra só YYYY-MM-DD.
function fmtDate(s) {
  if (!s) return '—';
  const str = String(s);
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const t = Date.parse(str);
  return Number.isNaN(t) ? '—' : new Date(t).toISOString().slice(0, 10);
}

// Data relativa curta ("hoje", "ontem", "há N dias") para o campo "Coletado".
function fmtRelative(s) {
  if (!s) return '—';
  const t = Date.parse(String(s).replace(' ', 'T'));
  if (Number.isNaN(t)) return fmtDate(s);
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  return `há ${days} dias`;
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function QuartileBadge({ quartile }) {
  if (!quartile) return null;
  return <Badge className={QUARTILE_STYLE[quartile] || 'bg-surface2 text-ink2'}>{quartile}</Badge>;
}

function AccessBadge({ accessType }) {
  if (accessType === 'aberto') {
    return (
      <Badge className="bg-emerald-100 text-emerald-700">
        <Unlock className="mr-1 h-3 w-3" />Aberto
      </Badge>
    );
  }
  if (accessType) {
    return (
      <Badge className="bg-surface2 text-ink2">
        <Lock className="mr-1 h-3 w-3" />Pago
      </Badge>
    );
  }
  return null;
}

function RelevanceDots({ value }) {
  const n = Math.round(Number(value) || 0);
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i <= n ? 'fill-amber-400 text-amber-400' : 'text-line'}`}
        />
      ))}
    </span>
  );
}

// refreshToken: incrementado pelo botão "Atualizar" global no HubContainer.
export default function ArtigosPage({ refreshToken = 0, onCountChange = () => {} }) {
  const user = useStore((s) => s.user);
  const isOwner = user?.role === 'owner';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros (todos aplicados no cliente).
  const [search, setSearch] = useState('');
  const [access, setAccess] = useState('todos'); // todos | aberto | pago
  const [quartile, setQuartile] = useState('todos'); // todos | Q1 | Q2 | Q3_Q4
  const [minRel, setMinRel] = useState(1);
  const [order, setOrder] = useState('recent'); // recent | relevant | impact

  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [copied, setCopied] = useState(false);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('project', HUB_PROJECT);
      params.set('order_by', 'received_at');
      params.set('limit', '200');
      const res = await apiFetch(`/api/hub/items?${params.toString()}`);
      const page = res.items || [];
      setItems(page);
      // v2.26.7 (contador da aba) — res.total é o total real no banco (o
      // limit=200 acima só limita o que é carregado, não a contagem);
      // fallback pra items.length se a API não devolver total por algum
      // motivo.
      onCountChange(res.total != null ? res.total : page.length);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  // ── Estatísticas (computadas a partir dos itens já carregados) ───────────
  const stats = useMemo(() => {
    const total = items.length;
    const journals = new Set(items.map((it) => it.journal_name).filter(Boolean));
    const abertos = items.filter((it) => it.access_type === 'aberto').length;
    const pctAberto = total > 0 ? Math.round((abertos / total) * 100) : 0;
    return { total, journals: journals.size, pctAberto };
  }, [items]);

  // ── Lista filtrada + ordenada ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter((it) => {
      if (q && !((it.title || '').toLowerCase().includes(q)
        || (it.resumo || '').toLowerCase().includes(q)
        || (it.journal_name || '').toLowerCase().includes(q))) return false;
      if (access !== 'todos' && it.access_type !== access) return false;
      if (quartile === 'Q3_Q4' && !['Q3', 'Q4'].includes(it.sjr_quartile)) return false;
      if (quartile !== 'todos' && quartile !== 'Q3_Q4' && it.sjr_quartile !== quartile) return false;
      if (Number(it.relevancia || 0) < minRel) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (order === 'relevant') return (Number(b.relevancia) || 0) - (Number(a.relevancia) || 0);
      if (order === 'impact') return (Number(b.impact_factor) || 0) - (Number(a.impact_factor) || 0);
      return String(b.collected_at || b.received_at || '').localeCompare(String(a.collected_at || a.received_at || ''));
    });
    return list;
  }, [items, search, access, quartile, minRel, order]);

  // ── Copiar DOI ────────────────────────────────────────────────────────────
  const copyDoi = async (doi) => {
    try {
      await navigator.clipboard.writeText(doi);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Falha ao copiar DOI');
    }
  };

  // ── Remover artigo (soft delete, mesmo padrão dos demais itens do Hub) ────
  const deleteItem = async (item) => {
    setDeleting(item.id);
    try {
      await apiFetch(`/api/hub/items/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (selected && selected.id === item.id) setSelected(null);
      showToast('Artigo removido');
    } catch (e) {
      showToast(`Falha ao remover: ${String(e.message || e).slice(0, 80)}`);
    } finally {
      setDeleting(null);
    }
  };

  const confirmDelete = () => {
    const item = confirmItem;
    setConfirmItem(null);
    if (item) deleteItem(item);
  };

  if (loading) {
    return (
      <div className="h-full">
        <LoadingSpinner label="Carregando artigos..." />
      </div>
    );
  }

  return (
    <div className="flex h-full gap-4">
      {/* LEFT — lista de artigos (35%) */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} min-h-0 w-full flex-col md:w-[35%]`}>
        <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-ink2">
          {stats.total} {stats.total === 1 ? 'artigo' : 'artigos'} · {stats.journals} {stats.journals === 1 ? 'periódico' : 'periódicos'} · {stats.pctAberto}% acesso aberto
        </div>

        <div className="mt-2 flex flex-col gap-2 rounded-xl border border-line bg-surface p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar artigos..."
              className="h-9 w-full rounded-lg border border-line bg-surface2 pl-8 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-medium text-ink2">Acesso</span>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'aberto', label: '🔓 Aberto' },
              { key: 'pago', label: '🔒 Pago' },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setAccess(o.key)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                  access === o.key ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:bg-surface2/70'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] font-medium text-ink2">Quartil</span>
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'Q1', label: 'Q1' },
              { key: 'Q2', label: 'Q2' },
              { key: 'Q3_Q4', label: 'Q3/Q4' },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setQuartile(o.key)}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
                  quartile === o.key ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:bg-surface2/70'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <label className="flex flex-col gap-1 text-[11px] font-medium text-ink2">
            Relevância mínima: {minRel}
            <input
              type="range"
              min="1"
              max="5"
              step="1"
              value={minRel}
              onChange={(e) => setMinRel(Number(e.target.value))}
              className="accent-accent"
            />
          </label>

          <label className="flex items-center gap-1.5 text-xs text-ink2">
            Ordenar
            <select
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
            >
              <option value="recent">Mais recentes</option>
              <option value="relevant">Mais relevantes</option>
              <option value="impact">Maior impacto</option>
            </select>
          </label>
        </div>

        <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto pb-2">
          {error ? (
            <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-danger">{error}</div>
          ) : filtered.length === 0 ? (
            items.length === 0 ? (
              <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center">
                <BookOpen className="h-10 w-10 text-ink2" />
                <h2 className="text-sm font-semibold text-ink">Nenhum artigo encontrado</h2>
                <p className="text-xs text-ink2">
                  Os artigos serão coletados automaticamente pelo Intelligence
                  Hub assim que o módulo for ativado.
                </p>
              </div>
            ) : (
              <p className="mt-6 text-center text-sm text-muted">Nenhum artigo corresponde aos filtros.</p>
            )
          ) : (
            filtered.map((it) => (
              <ArticleCard
                key={it.id}
                item={it}
                active={selected?.id === it.id}
                onClick={() => setSelected(it)}
              />
            ))
          )}
        </div>
      </div>

      {/* RIGHT — detalhe do artigo (65%) */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} min-h-0 w-full flex-col md:w-[65%]`}>
        {!selected ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface text-sm text-muted">
            <BookOpen className="h-10 w-10 text-ink2" />
            Selecione um artigo para ver os detalhes
          </div>
        ) : (
          <ArticleDetail
            item={selected}
            onBack={() => setSelected(null)}
            onCopyDoi={() => copyDoi(selected.doi)}
            copied={copied}
            onDelete={isOwner ? () => setConfirmItem(selected) : null}
            deleting={deleting === selected.id}
          />
        )}
      </div>

      <ConfirmModal
        open={!!confirmItem}
        title="Remover artigo?"
        message="Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmItem(null)}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}

function ArticleCard({ item, active, onClick }) {
  const topicos = Array.isArray(item.topicos) ? item.topicos.slice(0, 3) : [];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border bg-surface p-3 text-left transition hover:border-accent ${
        active ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
    >
      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{item.title}</h3>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {item.journal_name && <span className="font-medium text-indigo-500">{item.journal_name}</span>}
        {item.publication_year && <span className="text-muted">· {item.publication_year}</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <QuartileBadge quartile={item.sjr_quartile} />
        <AccessBadge accessType={item.access_type} />
        <RelevanceDots value={item.relevancia} />
      </div>
      {topicos.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {topicos.map((t, i) => (
            <Badge key={i} className="bg-surface2 text-ink2">
              <Tag className="mr-1 h-3 w-3" />{t}
            </Badge>
          ))}
        </div>
      )}
      {item.source_name && <p className="mt-1.5 text-[11px] text-muted">{item.source_name}</p>}
    </button>
  );
}

function ArticleDetail({ item, onBack, onCopyDoi, copied, onDelete, deleting }) {
  const topicos = Array.isArray(item.topicos) ? item.topicos : [];
  return (
    <div className="flex h-full flex-col overflow-y-auto rounded-xl border border-line bg-surface p-4">
      <button onClick={onBack} className="mb-2 self-start text-xs text-ink2 md:hidden">
        ← Voltar
      </button>

      <h1 className="text-xl font-bold leading-snug text-ink">{item.title}</h1>
      {item.journal_name && <p className="mt-1 text-sm font-medium text-indigo-500">{item.journal_name}</p>}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.publication_year && <Badge className="bg-surface2 text-ink2">{item.publication_year}</Badge>}
        {item.impact_factor != null && (
          <Badge className="bg-surface2 text-ink2">IF: {Number(item.impact_factor).toFixed(2)}</Badge>
        )}
        <QuartileBadge quartile={item.sjr_quartile} />
        <AccessBadge accessType={item.access_type} />
        {item.article_type && <Badge className="bg-accent/10 text-accent">{item.article_type}</Badge>}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 border-t border-line pt-3 sm:grid-cols-3">
        {item.doi && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-muted">DOI</span>
            <a
              href={`https://doi.org/${item.doi}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <Link2 className="h-3.5 w-3.5" />{item.doi}
            </a>
          </div>
        )}
        {item.source_name && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-muted">Fonte</span>
            <span className="text-sm text-ink">{item.source_name}</span>
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-medium text-muted">Coletado</span>
          <span className="flex items-center gap-1 text-sm text-ink">
            <CalendarDays className="h-3.5 w-3.5 text-muted" />{fmtRelative(item.collected_at || item.received_at)}
          </span>
        </div>
      </div>

      {item.resumo && (
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-xs font-medium text-muted">Resumo</span>
          <MarkdownViewer content={item.resumo} className="text-sm text-ink2" />
        </div>
      )}

      {(item.relevancia != null || item.justificativa) && (
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-xs font-medium text-muted">Relevância &amp; Justificativa</span>
          {item.relevancia != null && <RelevanceDots value={item.relevancia} />}
          {item.justificativa && (
            <MarkdownViewer content={item.justificativa} className="text-sm text-ink2" />
          )}
        </div>
      )}

      {topicos.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
          <span className="text-xs font-medium text-muted">Tópicos</span>
          <div className="flex flex-wrap gap-1.5">
            {topicos.map((t, i) => (
              <Badge key={i} className="bg-surface2 text-ink2">
                <Tag className="mr-1 h-3 w-3" />{t}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-3">
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
          >
            <ExternalLink className="h-4 w-4" /> Abrir artigo
          </a>
        )}
        {item.doi && (
          <button
            type="button"
            onClick={onCopyDoi}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
          >
            <Copy className="h-4 w-4" /> {copied ? 'Copiado!' : 'Copiar DOI'}
          </button>
        )}
        <div className="flex-1" />
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remover
          </button>
        )}
      </div>
    </div>
  );
}
