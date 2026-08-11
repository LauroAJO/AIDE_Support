import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Search, ExternalLink, X, Tag, FileText,
  Loader2, Plus, CheckCircle2, MapPin, Building2, CalendarDays, Trash2, Pencil,
  ArrowRightLeft, Trash, Link2, ClipboardList, ChevronDown, List, LayoutGrid, ArrowUp, ArrowDown,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useStore } from '../../store';
import LoadingSpinner from '../shared/LoadingSpinner';
import ConfirmModal from '../shared/ConfirmModal';
import EditItemModal from '../shared/EditItemModal';
import LinkTaskModal from '../shared/LinkTaskModal';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { countryMeta, detectCountry } from '../../lib/countryDetection';

// project_id no hub_items que agrupa as vagas de emprego curadas.
const HUB_PROJECT = 'emprego_vagas';

// ── Detecção de cidade ──────────────────────────────────────────────────────
// As vagas chegam sem campo estruturado de cidade; inferimos a partir do texto
// (título + resumo + fonte). Ordem importa: o primeiro match vence. 'Outras' é
// o fallback.
const CITIES = [
  { code: 'amsterdam', label: 'Amsterdam', terms: ['amsterdam'] },
  { code: 'rotterdam', label: 'Rotterdam', terms: ['rotterdam'] },
  { code: 'delft', label: 'Delft', terms: ['delft'] },
  { code: 'eindhoven', label: 'Eindhoven', terms: ['eindhoven'] },
  { code: 'enschede', label: 'Enschede', terms: ['enschede', 'twente'] },
];
const OTHER_CITY = { code: 'outras', label: 'Outras' };

function detectCity(item) {
  const hay = `${item.title || ''} ${item.resumo || ''} ${item.source_name || ''} ${(Array.isArray(item.topicos) ? item.topicos.join(' ') : '')}`.toLowerCase();
  for (const c of CITIES) {
    if (c.terms.some((t) => hay.includes(t))) return c;
  }
  return OTHER_CITY;
}

function cityMeta(code) {
  return CITIES.find((c) => c.code === code) || OTHER_CITY;
}

// ── Detecção de área temática ───────────────────────────────────────────────
const AREAS = [
  { key: 'h2', label: 'Hidrogênio',
    terms: ['hydrogen', 'hidrogênio', 'hidrogénio', 'hidrogenio', 'h2', 'h₂', 'electroly', 'eletróli', 'eletroli', 'fuel cell', 'célula a combustível', 'ammonia', 'amônia', 'pem', 'ael'] },
  { key: 'energia', label: 'Energia',
    terms: ['energy', 'energia', 'renewable', 'renovável', 'renovavel', 'power grid', 'elétrica', 'eletricidade', 'wind', 'eólica', 'solar', 'power-to-x', 'sustainab'] },
  { key: 'processos', label: 'Engenharia de Processos',
    terms: ['process engineering', 'engenharia de processos', 'chemical engineering', 'engenharia química', 'reactor', 'reator', 'distillation', 'destilação', 'separation', 'separação', 'scale-up', 'unit operation', 'catalys', 'catálise'] },
  { key: 'consultoria', label: 'Consultoria',
    terms: ['consulting', 'consultoria', 'consultancy', 'advisory', 'advisor'] },
  { key: 'pesquisa', label: 'Pesquisa/R&D',
    terms: ['research', 'pesquisa', 'r&d', 'r & d', 'scientist', 'cientista', 'researcher'] },
];

function detectArea(item) {
  const hay = `${item.title || ''} ${item.resumo || ''} ${(Array.isArray(item.topicos) ? item.topicos.join(' ') : '')}`.toLowerCase();
  for (const a of AREAS) {
    if (a.terms.some((t) => hay.includes(t))) return a.key;
  }
  return 'outros';
}
const AREA_LABELS = { ...Object.fromEntries(AREAS.map((a) => [a.key, a.label])), outros: 'Outros' };

// Rótulos das áreas manuais (EditItemModal), independentes das chaves da
// detecção automática acima. Se `item.area` estiver preenchido, ele tem
// prioridade sobre a área auto-detectada.
const AREA_OVERRIDE_LABELS = {
  h2_energia: 'H₂/Energia',
  simulacao: 'Simulação/Modelagem',
  processos: 'Eng. de Processos',
  ia_digital_twin: 'IA/Digital Twin',
  consultoria: 'Consultoria',
  pesquisa: 'Pesquisa/R&D',
  outro: 'Outro',
};

function areaLabel(item) {
  if (item.area && AREA_OVERRIDE_LABELS[item.area]) return AREA_OVERRIDE_LABELS[item.area];
  return AREA_LABELS[item._area];
}

// title_override / resumo_override (editados manualmente) têm prioridade
// sobre o título/resumo original coletado pelo Intelligence Hub.
function effectiveTitle(item) {
  return item.title_override || item.title;
}

function effectiveResumo(item) {
  return item.resumo_override || item.resumo;
}

// Datas chegam como string ISO/SQLite. Mostra só YYYY-MM-DD.
function fmtDate(s) {
  if (!s) return '—';
  const str = String(s);
  if (str.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const t = Date.parse(str);
  return Number.isNaN(t) ? '—' : new Date(t).toISOString().slice(0, 10);
}

// v2.26.7 (Change 1) — versão curta DD/MM para a coluna "Data" da Lista
// compacta (ver mesma função em HubPage.jsx/VagasPhDPage.jsx).
function fmtDateShort(s) {
  const full = fmtDate(s);
  if (full === '—') return full;
  const [, mm, dd] = full.split('-');
  return `${dd}/${mm}`;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function CityBadge({ code }) {
  const c = cityMeta(code);
  return (
    <Badge className="bg-surface2 text-ink2">
      <MapPin className="mr-1 h-3 w-3" />{c.label}
    </Badge>
  );
}

function CountryBadge({ code }) {
  const c = countryMeta(code);
  return <Badge className={c.color}>{c.code}</Badge>;
}

// Pré-calcula cidade, país e área (auto-detecção, já considerando overrides
// manuais) uma vez por item. Reaproveitado ao carregar a lista e após salvar
// edições.
function enrich(it) {
  return {
    ...it,
    _city: detectCity(it).code,
    _country: detectCountry(it).code,
    _area: detectArea(it),
  };
}

// Itens por página. "Load more" busca a proxima pagina com o mesmo LIMIT,
// ate hasMore virar false (offset + itens carregados >= total).
const LIMIT = 50;

// refreshToken: incrementado pelo botão "Atualizar" global no HubContainer.
// highlightShortId: vindo de /hub?vaga={short_id} (via HubContainer) — depois
// que a lista carrega, o card correspondente ganha scroll-into-view + realce.
export default function EmpregoPage({ refreshToken = 0, highlightShortId = null, onCountChange = () => {} }) {
  const user = useStore((s) => s.user);
  const isOwner = user?.role === 'owner';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Total real no banco (project_id = emprego_vagas), via /api/hub/stats —
  // items é limitado pelo `limit` da query, então items.length NÃO é
  // confiável como total.
  const [dbTotal, setDbTotal] = useState(null);

  // Paginação: offset = quantos itens já foram carregados (== próximo
  // offset a pedir); total vem do próprio GET /api/hub/items.
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Filtros (todos aplicados no cliente).
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('todos');
  const [area, setArea] = useState('todos');
  const [order, setOrder] = useState('recent'); // recent | relevant

  // v2.26.4 — alternância Cards/Lista (Bloco 4B). Ver VagasPhDPage.jsx para o
  // mesmo padrão (implementação irmã).
  // v2.26.6 (Bloco 5E) — default trocado de 'cards' para 'list' (ver mesmo
  // comentário em VagasPhDPage.jsx).
  const [view, setView] = useState('list'); // cards | list
  const [sortKey, setSortKey] = useState('date'); // title | institution | city | relevancia | area | date
  const [sortDir, setSortDir] = useState('desc'); // asc | desc

  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState('');
  // Guarda ids já adicionados à Carreira nesta sessão (feedback visual).
  const [added, setAdded] = useState({}); // { [itemId]: 'saving' | 'done' }
  const [deleting, setDeleting] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [moving, setMoving] = useState(null); // id do item sendo movido individualmente
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [linkingItem, setLinkingItem] = useState(null); // item aberto no modal "Vincular à Tarefa"
  const [highlightedId, setHighlightedId] = useState(null);
  const cardRefs = useRef({}); // item.id -> DOM node, para scroll-into-view do highlight
  const highlightedShortIdRef = useRef(null); // evita re-disparar o highlight no mesmo short_id

  // Carga inicial (ou reset): zera offset/items e busca a primeira página.
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('project', HUB_PROJECT);
      params.set('order_by', 'received_at');
      params.set('limit', String(LIMIT));
      params.set('offset', '0');
      const [itemsRes, statsRes] = await Promise.all([
        apiFetch(`/api/hub/items?${params.toString()}`),
        apiFetch(`/api/hub/stats?project_id=${HUB_PROJECT}`).catch(() => null),
      ]);
      const page = (itemsRes.items || []).map(enrich);
      const totalCount = itemsRes.total || 0;
      setItems(page);
      setOffset(page.length);
      setTotal(totalCount);
      setHasMore(page.length < totalCount);
      const projStats = statsRes && Array.isArray(statsRes.by_project)
        ? statsRes.by_project[0] : null;
      const dbTotalCount = projStats ? projStats.count : 0;
      setDbTotal(dbTotalCount);
      // v2.26.7 (contador da aba) — mesmo raciocínio de VagasPhDPage.jsx:
      // dbTotal já é o total real de emprego_vagas no banco.
      onCountChange(dbTotalCount);
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
      const params = new URLSearchParams();
      params.set('project', HUB_PROJECT);
      params.set('order_by', 'received_at');
      params.set('limit', String(LIMIT));
      params.set('offset', String(offset));
      const res = await apiFetch(`/api/hub/items?${params.toString()}`);
      const page = (res.items || []).map(enrich);
      const totalCount = res.total || total;
      setItems((prev) => [...prev, ...page]);
      const newOffset = offset + page.length;
      setOffset(newOffset);
      setTotal(totalCount);
      setHasMore(newOffset < totalCount);
    } catch (e) {
      showToast(`Falha ao carregar mais vagas: ${String(e.message || e).slice(0, 80)}`);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  // ── Copiar link ───────────────────────────────────────────────────────────
  const copyLink = async (item) => {
    const url = `${window.location.origin}/hub?vaga=${item.short_id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Link copiado: #${item.short_id}`);
    } catch {
      showToast('Falha ao copiar link');
    }
  };

  // ── Vincular à Tarefa ─────────────────────────────────────────────────────
  const handleLinked = (task, err) => {
    setLinkingItem(null);
    if (err) { showToast(`Falha ao vincular: ${String(err.message || err).slice(0, 80)}`); return; }
    showToast('Vaga vinculada à tarefa');
  };

  // ── Highlight vindo de /hub?vaga={short_id} ──────────────────────────────
  // Quando a lista termina de carregar e highlightShortId aponta para um item
  // já presente, dá scroll até o card e aplica um realce temporário.
  useEffect(() => {
    if (!highlightShortId || loading) return;
    if (highlightedShortIdRef.current === highlightShortId) return;
    const target = items.find((it) => it.short_id === highlightShortId);
    if (!target) return;
    highlightedShortIdRef.current = highlightShortId;
    setHighlightedId(target.id);
    const node = cardRefs.current[target.id];
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setHighlightedId(null), 4000);
    return () => clearTimeout(t);
  }, [highlightShortId, loading, items]);

  // ── Estatísticas ──────────────────────────────────────────────────────────
  // "carregados"/"novasHoje"/"empresas" vêm dos items já buscados (limitados
  // pelo `limit` da query); dbTotal (state, acima) é o total REAL do banco,
  // via /api/hub/stats.
  const stats = useMemo(() => {
    const today = todayISO();
    const novasHoje = items.filter(
      (it) => fmtDate(it.collected_at || it.received_at) === today,
    ).length;
    const empresas = new Set(items.map((it) => it.source_name).filter(Boolean));
    return { carregados: items.length, novasHoje, empresas: empresas.size };
  }, [items]);

  // ── Lista filtrada + ordenada ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter((it) => {
      if (q && !((it.title || '').toLowerCase().includes(q) || (it.resumo || '').toLowerCase().includes(q))) return false;
      if (city !== 'todos' && it._city !== city) return false;
      if (area !== 'todos' && it._area !== area) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      if (order === 'relevant') {
        return (Number(b.relevancia) || 0) - (Number(a.relevancia) || 0);
      }
      // recent: por data de coleta/recebimento (string ISO ordena bem).
      return String(b.collected_at || b.received_at || '').localeCompare(String(a.collected_at || a.received_at || ''));
    });
    return list;
  }, [items, search, city, area, order]);

  // ── Ordenação da Lista (independente do `order` do modo Cards) ────────────
  const toggleSort = (key) => {
    if (sortKey === key) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key);
    setSortDir(key === 'title' || key === 'institution' || key === 'city' ? 'asc' : 'desc');
  };
  const sortedForList = useMemo(() => {
    const val = (it) => {
      switch (sortKey) {
        case 'title': return (effectiveTitle(it) || '').toLowerCase();
        case 'institution': return (it.source_name || '').toLowerCase();
        case 'city': return cityMeta(it._city).label.toLowerCase();
        case 'relevancia': return Number(it.relevancia) || 0;
        case 'area': return (areaLabel(it) || '').toLowerCase();
        case 'date':
        default: return String(it.collected_at || it.received_at || '');
      }
    };
    const list = [...filtered].sort((a, b) => {
      const va = val(a); const vb = val(b);
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  // ── Adicionar à Carreira ──────────────────────────────────────────────────
  const addToCareer = async (item) => {
    if (added[item.id] === 'saving' || added[item.id] === 'done') return;
    setAdded((m) => ({ ...m, [item.id]: 'saving' }));
    // A tabela career_opportunities não tem campo de instituição em texto livre
    // (organization_id é FK), então a fonte vai dentro das notas.
    const fonte = item.source_name ? `Fonte: ${item.source_name}\n\n` : '';
    const payload = {
      title: item.title,
      type: 'job',   // enum: job | phd | postdoc | grant | collaboration | ...
      track: 'job',  // trilha do Kanban: phd | job | spinoff — 'emprego' não é um valor válido
      status: 'to_organize', // primeiro status do Kanban de Carreira
      url: item.url || '',
      description: item.justificativa || '',
      notes: `${fonte}${item.resumo || ''}`.trim(),
      hub_short_id: item.short_id || null,
    };
    try {
      await apiFetch('/api/career/opportunities', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await apiFetch(`/api/hub/items/${item.id}/archive`, { method: 'PATCH' });
      setAdded((m) => ({ ...m, [item.id]: 'done' }));
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (selected && selected.id === item.id) setSelected(null);
      showToast('✅ Vaga enviada para Carreira — tarefa criada para preenchimento');
    } catch (e) {
      setAdded((m) => { const n = { ...m }; delete n[item.id]; return n; });
      showToast(`Falha ao adicionar: ${String(e.message || e).slice(0, 80)}`);
    }
  };

  // ── Mover para PhD ────────────────────────────────────────────────────────
  const moveToPhd = async (item) => {
    setMoving(item.id);
    try {
      const res = await apiFetch('/api/hub/items/bulk/project', {
        method: 'PATCH',
        body: JSON.stringify({ ids: [item.id], project_id: 'phd_vagas' }),
      });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
      if (selected && selected.id === item.id) setSelected(null);
      showToast(res?.already_exists?.length ? 'Item já existe no destino' : 'Vaga movida para PhD');
    } catch (e) {
      showToast(`Falha ao mover: ${String(e.message || e).slice(0, 80)}`);
    } finally {
      setMoving(null);
    }
  };

  // ── Seleção múltipla ──────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filtered.map((it) => it.id)));
  const clearSelection = () => setSelectedIds(new Set());

  const bulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    try {
      await apiFetch('/api/hub/items/bulk', { method: 'DELETE', body: JSON.stringify({ ids }) });
      setItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
      showToast(`${ids.length} vaga(s) deletada(s)`);
      clearSelection();
    } catch (e) {
      showToast(`Falha ao deletar: ${String(e.message || e).slice(0, 80)}`);
    } finally {
      setBulkDeleting(false);
    }
  };

  const confirmBulkDeleteAction = () => {
    setConfirmBulkDelete(false);
    bulkDelete();
  };

  const bulkMoveToPhd = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await apiFetch('/api/hub/items/bulk/project', {
        method: 'PATCH',
        body: JSON.stringify({ ids, project_id: 'phd_vagas' }),
      });
      setItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
      const already = res?.already_exists?.length || 0;
      showToast(already
        ? `${res.moved} vaga(s) movida(s) para PhD, ${already} já existia(m) no destino`
        : `${ids.length} vaga(s) movida(s) para PhD`);
      clearSelection();
    } catch (e) {
      showToast(`Falha ao mover: ${String(e.message || e).slice(0, 80)}`);
    }
  };

  // ── Deletar vaga ──────────────────────────────────────────────────────────
  const deleteItem = async (item) => {
    setDeleting(item.id);
    try {
      await apiFetch(`/api/hub/items/${item.id}`, { method: 'DELETE' });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (selected && selected.id === item.id) setSelected(null);
      showToast('Vaga removida');
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

  // ── Editar vaga ───────────────────────────────────────────────────────────
  const handleSaved = (updated) => {
    const merged = enrich(updated);
    setItems((prev) => prev.map((it) => (it.id === updated.id ? merged : it)));
    if (selected && selected.id === updated.id) setSelected(merged);
    setEditingItem(null);
    showToast('Alterações salvas');
  };

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-3">
      {/* v2.26.6 (Bloco 5B/5C/5G) — mesma limpeza de VagasPhDPage.jsx: sem
          título/stat cards, filtros + toggle numa barra só. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-2.5">
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
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          title="Área"
          className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
        >
          <option value="todos">Área: todas</option>
          {AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          <option value="outros">Outros</option>
        </select>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          title="Cidade"
          className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
        >
          <option value="todos">Cidade: todas</option>
          {CITIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          <option value="outras">Outras</option>
        </select>
        <select
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          title="Ordenar"
          className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
        >
          <option value="recent">↕ Mais recente</option>
          <option value="relevant">↕ Mais relevante</option>
        </select>
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

      {/* Exibindo X de Y · Z empresas (substitui os 4 stat cards) */}
      {!loading && !error && total > 0 && (
        <p className="-mt-1 text-xs text-muted">
          Exibindo {items.length} de {total} vagas · {stats.empresas} {stats.empresas === 1 ? 'empresa' : 'empresas'}
        </p>
      )}

      {/* Barra de ações em lote */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2">
          <span className="text-sm font-medium text-ink">{selectedIds.size} {selectedIds.size === 1 ? 'item selecionado' : 'itens selecionados'}</span>
          <button type="button" onClick={selectAll} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2">
            Selecionar todos
          </button>
          <button type="button" onClick={clearSelection} className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2">
            Limpar seleção
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={bulkMoveToPhd}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> PhD
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 rounded-lg bg-danger px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {bulkDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash className="h-3.5 w-3.5" />} Deletar selecionados
            </button>
          )}
        </div>
      )}

      {/* Lista de vagas (cards) */}
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="py-16"><LoadingSpinner label="Carregando vagas de emprego..." /></div>
        ) : error ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-danger">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-12 text-center text-sm text-muted">
            {items.length === 0
              ? 'Nenhuma vaga recebida ainda. Assim que o Intelligence Hub enviar vagas de emprego, elas aparecerão aqui.'
              : 'Nenhuma vaga corresponde aos filtros.'}
          </div>
        ) : view === 'list' ? (
          <EmpregosListTable
            items={sortedForList}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={toggleSort}
            onOpen={(it) => setSelected(it)}
            onAdd={(it) => addToCareer(it)}
            added={added}
            onLinkTask={(it) => setLinkingItem(it)}
            onDelete={isOwner ? (it) => setConfirmItem(it) : null}
            deletingId={deleting}
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((it) => (
              <EmpregoCard
                key={it.id}
                cardRef={(node) => { cardRefs.current[it.id] = node; }}
                highlighted={highlightedId === it.id}
                item={it}
                onOpen={() => setSelected(it)}
                onAdd={() => addToCareer(it)}
                state={added[it.id]}
                onDelete={isOwner ? () => setConfirmItem(it) : null}
                onEdit={() => setEditingItem(it)}
                deleting={deleting === it.id}
                onMove={() => moveToPhd(it)}
                moving={moving === it.id}
                selected={selectedIds.has(it.id)}
                onToggleSelect={() => toggleSelect(it.id)}
                onCopyLink={() => copyLink(it)}
                onLinkTask={() => setLinkingItem(it)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Carregar mais (paginação) */}
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
        <p className="text-center text-xs text-muted">Todas as {total} vagas carregadas</p>
      )}

      {selected && (
        <DetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onAdd={() => addToCareer(selected)}
          state={added[selected.id]}
          onDelete={isOwner ? () => setConfirmItem(selected) : null}
          onEdit={() => setEditingItem(selected)}
          deleting={deleting === selected.id}
        />
      )}

      {/* Montagem condicional (v2.25.16) — ver comentário em VagasPhDPage. */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}

      {linkingItem && (
        <LinkTaskModal
          item={linkingItem}
          onClose={() => setLinkingItem(null)}
          onLinked={handleLinked}
        />
      )}

      <ConfirmModal
        open={!!confirmItem}
        title="Remover vaga?"
        message="Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmItem(null)}
      />

      <ConfirmModal
        open={confirmBulkDelete}
        title={`Deletar ${selectedIds.size} vaga(s)?`}
        message="Irreversível."
        confirmLabel="Deletar"
        danger
        onConfirm={confirmBulkDeleteAction}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}


// Botão "Adicionar à Carreira" com estados saving/done. Reutilizado no card e no modal.
// v2.26.7 (Change 2b) — variante `compact` usada só no EmpregoCard (Cards
// view), espelhando VagasPhDPage.jsx.
function AddButton({ state, onAdd, full = false, compact = false }) {
  const base = compact
    ? `flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition ${full ? 'w-full' : ''}`
    : `flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${full ? 'w-full' : ''}`;
  const iconClass = compact ? 'h-3 w-3' : 'h-4 w-4';
  if (state === 'done') {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700`}>
        <CheckCircle2 className={iconClass} /> Adicionada
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onAdd(); }}
      disabled={state === 'saving'}
      className={`${base} bg-accent text-white hover:opacity-90 disabled:opacity-60`}
    >
      {state === 'saving'
        ? <><Loader2 className={`${iconClass} animate-spin`} /> {compact ? '...' : 'Adicionando...'}</>
        : <><Plus className={iconClass} /> {compact ? 'Add' : 'Adicionar à Carreira'}</>}
    </button>
  );
}

function EmpregoCard({
  item, onOpen, onAdd, state, onDelete, onEdit, deleting, onMove, moving, selected, onToggleSelect,
  cardRef, highlighted, onCopyLink, onLinkTask,
}) {
  const title = effectiveTitle(item);
  const resumoFull = effectiveResumo(item);
  // v2.26.7 (Change 2b) — resumo mais curto e em 1 linha só, igual VagaCard.
  const resumo = (resumoFull || '').slice(0, 80);
  const truncated = (resumoFull || '').length > 80;
  return (
    <div
      ref={cardRef}
      onClick={onOpen}
      className={`flex cursor-pointer flex-col gap-1.5 rounded-lg border bg-surface p-2.5 transition hover:border-accent/50 hover:shadow-soft ${
        highlighted ? 'border-accent ring-2 ring-accent' : selected ? 'border-accent' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <input
            type="checkbox"
            checked={!!selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
          />
          <h3 className="flex items-center gap-1.5 text-xs font-medium leading-snug text-ink">
            {title}
            {item.edited_at && <Pencil className="h-3 w-3 shrink-0 text-muted" title="Editado manualmente" />}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CountryBadge code={item._country} />
          <CityBadge code={item._city} />
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="rounded-md p-0.5 text-ink2 transition hover:bg-surface2 hover:text-accent"
              title="Editar vaga"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={deleting}
              className="rounded-md p-0.5 text-ink2 transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              title="Remover vaga"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
        {item.source_name && (
          <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{item.source_name}</span>
        )}
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{fmtDateShort(item.collected_at || item.received_at)}</span>
        <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0 text-[10px] font-medium text-accent">{areaLabel(item)}</span>
        {item.short_id && <span className="font-mono text-[10px] text-muted">#{item.short_id}</span>}
      </div>

      {resumo && (
        <p className="line-clamp-1 text-[11px] leading-snug text-ink2">
          {resumo}{truncated && '…'}
        </p>
      )}

      <div className="mt-auto flex items-center gap-1 pt-0.5">
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Ver vaga original"
            className="rounded-md border border-line bg-surface p-1 text-ink2 transition hover:bg-surface2"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <div className="flex-1" />
        {item.short_id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCopyLink(); }}
            className="rounded-md border border-line bg-surface p-1 text-ink2 transition hover:bg-surface2"
            title="Copiar link"
          >
            <Link2 className="h-3 w-3" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onLinkTask(); }}
          className="rounded-md border border-line bg-surface p-1 text-ink2 transition hover:bg-surface2"
          title="Vincular à Tarefa"
        >
          <ClipboardList className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMove(); }}
          disabled={moving}
          className="rounded-md border border-line bg-surface p-1 text-ink2 transition hover:bg-surface2 disabled:opacity-50"
          title="Mover para PhD"
        >
          {moving ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightLeft className="h-3 w-3" />}
        </button>
        <AddButton state={state} onAdd={onAdd} compact />
      </div>
    </div>
  );
}

// v2.26.4 (Bloco 4B) — modo Lista: mesma abordagem de VagasPhDPage.jsx.
// Coluna "Área" no lugar de "Status" pelo mesmo motivo (hub_items não tem
// campo de status — ver comentário irmão em VagasPhDPage.jsx). Aqui a coluna
// de localização usa Cidade (mais específica para vagas de emprego) em vez
// de País.
// v2.26.7 (Change 1 — linhas compactas): mesma redução aplicada em
// VagasPhDPage.jsx.
// v2.26.7 (fix pós-feedback — faltava o botão de deletar): reintroduzido
// como o 4º ícone da coluna Ações — ver comentário irmão em
// VagasPhDPage.jsx.
function SortHeader({ label, sortKey, active, dir, onSort, className = '' }) {
  return (
    <th
      scope="col"
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none whitespace-nowrap px-2.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wide text-muted hover:text-ink ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </span>
    </th>
  );
}

function EmpregosListTable({ items, sortKey, sortDir, onSort, onOpen, onAdd, added, onLinkTask, onDelete, deletingId }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-4 py-12 text-center text-sm text-muted">
        Nenhuma vaga corresponde aos filtros.
      </div>
    );
  }
  return (
    <div className="overflow-auto rounded-xl border border-line bg-surface">
      <table className="w-full border-collapse text-[11px]">
        <thead className="border-b border-line bg-surface2/60">
          <tr>
            <SortHeader label="Título" sortKey="title" active={sortKey === 'title'} dir={sortDir} onSort={onSort} />
            <SortHeader label="Instituição" sortKey="institution" active={sortKey === 'institution'} dir={sortDir} onSort={onSort} />
            <SortHeader label="Cidade" sortKey="city" active={sortKey === 'city'} dir={sortDir} onSort={onSort} />
            <SortHeader label="Relevância" sortKey="relevancia" active={sortKey === 'relevancia'} dir={sortDir} onSort={onSort} />
            <SortHeader label="Área" sortKey="area" active={sortKey === 'area'} dir={sortDir} onSort={onSort} />
            <SortHeader label="Data" sortKey="date" active={sortKey === 'date'} dir={sortDir} onSort={onSort} />
            <th scope="col" className="whitespace-nowrap px-2.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wide text-muted">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const state = added[it.id];
            return (
              <tr
                key={it.id}
                onClick={() => onOpen(it)}
                className={`cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface2/50 ${i % 2 === 1 ? 'bg-surface2/20' : ''}`}
              >
                <td className="max-w-[280px] truncate px-2.5 py-1 font-normal text-xs text-ink" title={effectiveTitle(it)}>
                  {effectiveTitle(it)}
                </td>
                <td className="max-w-[160px] truncate px-2.5 py-1 text-ink2" title={it.source_name || ''}>
                  {it.source_name || '—'}
                </td>
                <td className="px-2.5 py-1"><CityBadge code={it._city} /></td>
                <td className="px-2.5 py-1 font-medium text-ink2">{it.relevancia != null ? Number(it.relevancia).toFixed(1) : '—'}</td>
                <td className="px-2.5 py-1">
                  <span className="inline-flex items-center rounded-full bg-accent/10 px-1.5 py-0 text-[10px] font-medium text-accent">
                    {areaLabel(it)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-2.5 py-1 text-muted">{fmtDateShort(it.collected_at || it.received_at)}</td>
                <td className="px-2.5 py-1">
                  <div className="flex items-center justify-end gap-1">
                    {it.url && (
                      <a
                        href={it.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Ver vaga original"
                        className="rounded-md p-1 text-ink2 transition hover:bg-surface2 hover:text-accent"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onLinkTask(it); }}
                      title="Vincular à Tarefa"
                      className="rounded-md p-1 text-ink2 transition hover:bg-surface2 hover:text-accent"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                    </button>
                    {state === 'done' ? (
                      <span title="Adicionada à Carreira" className="rounded-md p-1 text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAdd(it); }}
                        disabled={state === 'saving'}
                        title="Adicionar à Carreira"
                        className="rounded-md p-1 text-ink2 transition hover:bg-accent/10 hover:text-accent disabled:opacity-50"
                      >
                        {state === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(it); }}
                        disabled={deletingId === it.id}
                        title="Remover vaga"
                        className="rounded-md p-1 text-ink2 transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                      >
                        {deletingId === it.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

function DetailModal({ item, onClose, onAdd, state, onDelete, onEdit, deleting }) {
  const topicos = Array.isArray(item.topicos) ? item.topicos : [];
  const title = effectiveTitle(item);
  const resumo = effectiveResumo(item);
  // Painel somente-leitura: Escape fecha, clique fora não (v2.25.16).
  const guard = useUnsavedGuard({ isDirty: false, onClose });
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg">
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-1.5 text-base font-bold text-ink">
            {title}
            {item.edited_at && <Pencil className="h-3.5 w-3.5 shrink-0 text-muted" title="Editado manualmente" />}
          </h2>
          <div className="flex shrink-0 items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-md p-1.5 text-ink2 transition hover:bg-surface2 hover:text-accent"
                title="Editar vaga"
              >
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                className="rounded-md p-1.5 text-ink2 transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                title="Remover vaga"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
            <button onClick={guard.requestClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            >
              <ExternalLink className="h-4 w-4" /> Abrir vaga original
            </a>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <CountryBadge code={item._country} />
            <CityBadge code={item._city} />
            <Badge className="bg-accent/10 text-accent">{areaLabel(item)}</Badge>
            {item.relevancia != null && (
              <Badge className="bg-surface2 text-ink2">Relev.: {Number(item.relevancia).toFixed(1)}</Badge>
            )}
            {item.prioridade && <Badge className="bg-surface2 text-ink2">Prioridade: {item.prioridade}</Badge>}
          </div>

          {item.source_name && (
            <Row label="Empresa / Fonte">
              <span className="inline-flex items-center gap-1.5"><Building2 className="h-4 w-4 text-muted" />{item.source_name}</span>
            </Row>
          )}

          {resumo && (
            <Row label="Resumo do LLM">
              <p className="whitespace-pre-wrap leading-relaxed text-ink2">{resumo}</p>
            </Row>
          )}

          {item.user_notes && (
            <Row label="Notas pessoais">
              <p className="whitespace-pre-wrap leading-relaxed text-ink2">{item.user_notes}</p>
            </Row>
          )}

          {topicos.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted">Tópicos identificados</span>
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
              <p className="whitespace-pre-wrap leading-relaxed text-ink2">
                <FileText className="mr-1 inline h-3.5 w-3.5 text-muted" />
                {item.justificativa}
              </p>
            </Row>
          )}

          <div className="grid grid-cols-2 gap-3 border-t border-line pt-3">
            <Row label="Publicado em">{fmtDate(item.published_at)}</Row>
            <Row label="Coletado em">{fmtDate(item.collected_at)}</Row>
            <Row label="Recebido em">{fmtDate(item.received_at)}</Row>
          </div>
        </div>

        <div className="border-t border-line px-4 py-3">
          <AddButton state={state} onAdd={onAdd} full />
        </div>
      </div>
    </div>
  );
}
