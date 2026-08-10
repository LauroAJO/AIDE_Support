import { useEffect, useMemo, useState } from 'react';
import {
  Search, ExternalLink, X, Tag, FileText, Loader2, Trash2, ChevronDown, List, LayoutGrid, Building2, CalendarDays,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useStore } from '../../store';
import { MarkdownViewer } from '../../lib/markdownRenderer';
import LoadingSpinner from '../shared/LoadingSpinner';
import ConfirmModal from '../shared/ConfirmModal';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';

// Projetos monitorados pelo Hub. "todos" só existe como filtro.
const PROJECTS = [
  { key: 'todos', label: 'Todos' },
  { key: 'h2', label: 'H₂' },
  { key: 'energia', label: 'Energia' },
  { key: 'ia', label: 'IA' },
];
const PROJECT_LABELS = { h2: 'H₂', energia: 'Energia', ia: 'IA' };

function projectLabel(id) {
  return PROJECT_LABELS[id] || id || '—';
}

// Deriva o nível (alta/media/baixa) a partir da prioridade textual ou, na
// ausência dela, da relevância numérica (1-5).
function nivel(item) {
  const p = (item.prioridade || '').toLowerCase();
  if (p === 'alta' || p === 'media' || p === 'média' || p === 'baixa') {
    return p === 'média' ? 'media' : p;
  }
  const r = Number(item.relevancia) || 0;
  if (r >= 4) return 'alta';
  if (r >= 2.5) return 'media';
  return 'baixa';
}

const NIVEL_STYLE = {
  alta: 'bg-emerald-100 text-emerald-700',
  media: 'bg-amber-100 text-amber-700',
  baixa: 'bg-surface2 text-ink2',
};

function RelevanciaBadge({ item }) {
  const n = nivel(item);
  const r = item.relevancia != null ? Number(item.relevancia) : null;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${NIVEL_STYLE[n] || NIVEL_STYLE.baixa}`}>
      {r != null ? r.toFixed(1) : n}
    </span>
  );
}

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

// Datas chegam como string ISO/SQLite (DATETIME). Mostra só YYYY-MM-DD.
function fmtDate(s) {
  if (!s) return '—';
  const str = String(s);
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const t = Date.parse(str);
  return Number.isNaN(t) ? '—' : new Date(t).toISOString().slice(0, 10);
}

// v2.26.7 (Change 1) — versão curta DD/MM para a coluna "Data" da Lista
// compacta (a data completa YYYY-MM-DD continua no card/detalhe).
function fmtDateShort(s) {
  const full = fmtDate(s);
  if (full === '—') return full;
  const [, mm, dd] = full.split('-');
  return `${dd}/${mm}`;
}

// Itens por página. "Load more" busca a proxima pagina com o mesmo LIMIT,
// ate hasMore virar false (offset + itens carregados >= total).
const LIMIT = 50;

// project/onProjectChange são controlados pelo HubContainer (o dashboard
// geral precisa poder pré-selecionar um projeto ao navegar de um card do
// overview) — os defaults abaixo só existem para uso isolado/testes.
// refreshToken: incrementado pelo botão "Atualizar" global no HubContainer.
export default function HubPage({
  project = 'todos', onProjectChange = () => {}, refreshToken = 0, onCountChange = () => {},
}) {
  const user = useStore((s) => s.user);
  const isOwner = user?.role === 'owner';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Paginação: offset = quantos itens já foram carregados (== próximo
  // offset a pedir); total vem do próprio GET /api/hub/items.
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Filtros
  const [minRel, setMinRel] = useState('');
  const [search, setSearch] = useState('');
  // v2.26.6 (Bloco 5E) — toggle Lista/Cards. A tabela existente já era a
  // "Lista" pedida pelo spec (Título/Fonte/Projeto/Relev./Coleta/Ações); só
  // faltava a alternativa em Cards, adicionada agora.
  const [view, setView] = useState('list'); // list | cards

  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const itemsParams = () => {
    const params = new URLSearchParams();
    if (project && project !== 'todos') params.set('project', project);
    if (minRel) params.set('min_relevancia', minRel);
    params.set('order_by', 'received_at');
    params.set('limit', String(LIMIT));
    return params;
  };

  // Carga inicial (ou reset): zera offset/items e busca a primeira página.
  // Disparada ao montar, ao trocar projeto/relevância mínima ou ao pedir
  // "Atualizar" — qualquer uma dessas invalida a paginação acumulada, para
  // não misturar resultados obsoletos com o novo filtro.
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = itemsParams();
      params.set('offset', '0');

      // v2.26.6 (Bloco 5A/5B) — o fetch de /api/hub/stats (que alimentava o
      // dashboard "Visão geral" removido e os StatsCards por projeto,
      // também removidos) foi retirado daqui: nada mais consome esse dado
      // nesta página.
      const itemsRes = await apiFetch(`/api/hub/items?${params.toString()}`);
      const page = itemsRes.items || [];
      const totalCount = itemsRes.total || 0;
      setItems(page);
      setOffset(page.length);
      setTotal(totalCount);
      setHasMore(page.length < totalCount);
      // v2.26.7 (contador da aba) — só reporta pro HubContainer quando os
      // filtros estão no padrão (projeto "todos", sem relevância mínima):
      // nesse estado totalCount É o total real de h2+energia+ia. Filtrado,
      // deixamos de reportar para não fazer o número da aba oscilar com o
      // que o utilizador está vendo no momento — o badge mantém o último
      // total "de verdade" conhecido.
      if ((!project || project === 'todos') && !minRel) onCountChange(totalCount);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  // Busca a próxima página (offset atual) e acrescenta ao final da lista.
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const params = itemsParams();
      params.set('offset', String(offset));
      const res = await apiFetch(`/api/hub/items?${params.toString()}`);
      const page = res.items || [];
      const totalCount = res.total || total;
      setItems((prev) => [...prev, ...page]);
      const newOffset = offset + page.length;
      setOffset(newOffset);
      setTotal(totalCount);
      setHasMore(newOffset < totalCount);
    } catch (e) {
      showToast(`Falha ao carregar mais itens: ${String(e.message || e).slice(0, 80)}`);
    } finally {
      setLoadingMore(false);
    }
  };

  // Recarrega (do zero) ao mudar projeto, relevância mínima ou pedido de
  // atualização global (a busca por texto é local, não recarrega do servidor).
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, minRel, refreshToken]);

  // Busca textual filtra título e resumo no cliente.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (it) =>
        (it.title || '').toLowerCase().includes(q) ||
        (it.resumo || '').toLowerCase().includes(q),
    );
  }, [items, search]);

  const deleteItem = async (item) => {
    setDeleting(item.id);
    try {
      await apiFetch(`/api/hub/items/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (selected && selected.id === item.id) setSelected(null);
      showToast('Item removido');
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

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3">
      {/* v2.26.6 (Bloco 5B/5C/5G) — título "Scraping Hub" e os cards de
          estatísticas por projeto (StatsCards) removidos por completo (mesma
          limpeza das outras sub-abas). A relevância/projeto/data por item já
          aparecem na própria linha da tabela — os cards agregados eram
          redundantes. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5">
        <select
          value={project}
          onChange={(e) => onProjectChange(e.target.value)}
          title="Projeto"
          className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
        >
          {PROJECTS.map((p) => <option key={p.key} value={p.key}>Projeto: {p.label}</option>)}
        </select>
        <select
          value={minRel}
          onChange={(e) => setMinRel(e.target.value)}
          title="Relevância mínima"
          className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
        >
          <option value="">Relevância: todas</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}+</option>)}
        </select>
        <div className="relative min-w-[160px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou resumo..."
            className="h-8 w-full rounded-lg border border-line bg-surface2 pl-8 pr-3 text-xs text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-line bg-surface p-0.5">
          <button
            type="button"
            onClick={() => setView('list')}
            title="Ver em lista"
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
              view === 'list' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
            }`}
          >
            <List className="h-3.5 w-3.5" /> Lista
          </button>
          <button
            type="button"
            onClick={() => setView('cards')}
            title="Ver em cards"
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition ${
              view === 'cards' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Cards
          </button>
        </div>
      </div>

      {/* Exibindo X de Y itens (paginação) */}
      {!loading && !error && total > 0 && (
        <p className="-mt-1 text-xs text-muted">
          Exibindo {items.length} de {total} itens
        </p>
      )}

      {/* Lista (tabela) / Cards */}
      <div className={`min-h-0 flex-1 overflow-auto ${view === 'list' ? 'rounded-xl border border-line bg-surface' : ''}`}>
        {loading ? (
          <div className="py-16"><LoadingSpinner label="Carregando itens do Hub..." /></div>
        ) : error ? (
          <div className="px-4 py-8 text-center text-sm text-danger">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">Nenhum item encontrado.</div>
        ) : view === 'cards' ? (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((it) => (
              <NoticiaCard
                key={it.id}
                item={it}
                onOpen={() => setSelected(it)}
                onDelete={isOwner ? () => setConfirmItem(it) : null}
                deleting={deleting === it.id}
              />
            ))}
          </div>
        ) : (
          // v2.26.7 (Change 1 — linhas compactas): py-2 → py-1, título
          // font-normal text-xs (era font-medium/herdava text-sm da
          // tabela), demais colunas em text-[11px], relevância como número
          // simples (sem badge/círculo), data em DD/MM. Ações só o ícone de
          // remover (isOwner), sem outros botões.
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
                <th className="px-2.5 py-1 font-medium">Título</th>
                <th className="px-2.5 py-1 font-medium">Fonte</th>
                <th className="px-2.5 py-1 font-medium">Área</th>
                <th className="px-2.5 py-1 font-medium">Relev.</th>
                <th className="px-2.5 py-1 font-medium">Data</th>
                {isOwner && <th className="px-2.5 py-1 font-medium" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, i) => (
                <tr key={it.id} className={`border-b border-line/60 transition hover:bg-surface2 ${i % 2 === 1 ? 'bg-surface2/20' : ''}`}>
                  <td className="max-w-[320px] truncate px-2.5 py-1.5">
                    <button
                      type="button"
                      onClick={() => setSelected(it)}
                      className="text-left font-normal text-xs text-ink transition hover:text-accent"
                      title={it.title}
                    >
                      {it.title}
                    </button>
                  </td>
                  <td className="px-2.5 py-1.5 text-ink2">{it.source_name || '—'}</td>
                  <td className="px-2.5 py-1.5">
                    {/* Badge compacto local (não o componente Badge partilhado, para
                        não reduzir o tamanho dele em todo o resto do app — ver
                        Change 1 do pedido: só as linhas da Lista precisam encolher). */}
                    <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0 text-[10px] font-medium text-accent">
                      {projectLabel(it.project_id)}
                    </span>
                  </td>
                  <td className="px-2.5 py-1.5 font-medium text-ink2">
                    {it.relevancia != null ? Number(it.relevancia).toFixed(1) : '—'}
                  </td>
                  <td className="px-2.5 py-1.5 text-muted">{fmtDateShort(it.collected_at || it.received_at)}</td>
                  {isOwner && (
                    <td className="px-2.5 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setConfirmItem(it)}
                        disabled={deleting === it.id}
                        className="rounded-md p-1 text-ink2 transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                        title="Remover item"
                      >
                        {deleting === it.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Carregar mais (paginação) — independente do filtro de busca local,
          que só narrows o que já foi carregado do servidor. */}
      {!loading && !error && (hasMore || loadingMore) && (
        <div className="flex justify-center py-2">
          {loadingMore ? (
            <span className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </span>
          ) : (
            <button
              type="button"
              onClick={loadMore}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
            >
              <ChevronDown className="h-4 w-4" /> Carregar mais ({total - items.length} restantes)
            </button>
          )}
        </div>
      )}
      {!loading && !error && !hasMore && total > 0 && (
        <p className="text-center text-xs text-muted">Todos os {total} itens carregados</p>
      )}

      {selected && <DetailModal item={selected} onClose={() => setSelected(null)} />}

      <ConfirmModal
        open={!!confirmItem}
        title="Remover item?"
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

// v2.26.6 (Bloco 5E/5F) — card compacto para a alternativa "Cards" da
// Notícias (a "Lista" já existia como tabela). Mesmo padrão de compactação
// do Bloco 5F: p-3, título text-sm, meta text-xs.
function NoticiaCard({ item, onOpen, onDelete, deleting }) {
  const resumo = (item.resumo || '').slice(0, 130);
  const truncated = (item.resumo || '').length > 130;
  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-surface p-3 transition hover:border-accent/50 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium leading-snug text-ink">{item.title}</h3>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deleting}
            className="shrink-0 rounded-md p-1 text-ink2 transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            title="Remover item"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {item.source_name && (
          <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{item.source_name}</span>
        )}
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(item.collected_at || item.received_at)}</span>
        <Badge className="bg-accent/10 text-accent">{projectLabel(item.project_id)}</Badge>
        <RelevanciaBadge item={item} />
      </div>
      {resumo && <p className="text-xs leading-relaxed text-ink2">{resumo}{truncated && '…'}</p>}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className="text-sm text-ink">{children}</span>
    </div>
  );
}

function DetailModal({ item, onClose }) {
  const topicos = Array.isArray(item.topicos) ? item.topicos : [];
  // Painel somente-leitura: Escape fecha, clique fora não (v2.25.16).
  const guard = useUnsavedGuard({ isDirty: false, onClose });
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{item.title}</h2>
          <button onClick={guard.requestClose} className="shrink-0 rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Abrir fonte original
            </a>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <RelevanciaBadge item={item} />
            {item.tipo && <Badge className="bg-accent/10 text-accent">{item.tipo}</Badge>}
            {item.prioridade && <Badge className="bg-surface2 text-ink2">Prioridade: {item.prioridade}</Badge>}
            <Badge className="bg-accent/10 text-accent">{projectLabel(item.project_id)}</Badge>
          </div>

          {item.resumo && (
            <Row label="Resumo">
              <MarkdownViewer content={item.resumo} className="text-ink2" />
            </Row>
          )}

          {topicos.length > 0 && (
            <div className="flex flex-col gap-1">
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

          {item.justificativa && (
            <Row label="Justificativa do LLM">
              <div className="flex items-start gap-1.5">
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                <MarkdownViewer content={item.justificativa} className="text-ink2" />
              </div>
            </Row>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <Row label="Fonte">{item.source_name || '—'}</Row>
            <Row label="Publicado em">{fmtDate(item.published_at)}</Row>
            <Row label="Coletado em">{fmtDate(item.collected_at)}</Row>
            <Row label="Recebido em">{fmtDate(item.received_at)}</Row>
          </div>
        </div>
      </div>
    </div>
  );
}
