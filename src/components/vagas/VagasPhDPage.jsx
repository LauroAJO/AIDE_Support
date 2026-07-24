import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GraduationCap, Search, ExternalLink, X, Tag, FileText,
  Loader2, Plus, CheckCircle2, MapPin, Building2, CalendarDays, Trash2, Pencil,
  ArrowRightLeft, Trash, Link2, ClipboardList,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useStore } from '../../store';
import LoadingSpinner from '../shared/LoadingSpinner';
import ConfirmModal from '../shared/ConfirmModal';
import EditItemModal from '../shared/EditItemModal';
import LinkTaskModal from '../shared/LinkTaskModal';
import { COUNTRIES, countryMeta, detectCountry } from '../../lib/countryDetection';

// project_id no hub_items que agrupa as vagas de doutorado curadas.
const HUB_PROJECT = 'phd_vagas';

// ── Detecção de área temática ───────────────────────────────────────────────
const AREAS = [
  { key: 'h2', label: 'H₂/Energia',
    terms: ['hydrogen', 'hidrogênio', 'hidrogénio', 'hidrogenio', 'h2', 'h₂', 'electroly', 'eletróli', 'eletroli', 'fuel cell', 'célula a combustível', 'energy', 'energia', 'pem', 'ael', 'e-saf', 'renewable', 'renovável', 'power-to-x', 'ammonia', 'amônia'] },
  { key: 'sim', label: 'Simulação/Modelagem',
    terms: ['simulation', 'simulação', 'simulacao', 'modeling', 'modelling', 'modelagem', 'cfd', 'finite element', 'elementos finitos', 'fem', 'numerical', 'numérico', 'multiphysics', 'multifísica'] },
  { key: 'proc', label: 'Engenharia de Processos',
    terms: ['process engineering', 'engenharia de processos', 'chemical engineering', 'engenharia química', 'reactor', 'reator', 'distillation', 'destilação', 'separation', 'separação', 'scale-up', 'unit operation', 'catalys', 'catálise'] },
  { key: 'ia', label: 'IA/Digital Twin',
    terms: ['digital twin', 'gêmeo digital', 'gemeo digital', 'machine learning', 'aprendizado de máquina', 'deep learning', 'neural', 'artificial intelligence', 'inteligência artificial', 'data-driven', 'surrogate model', ' ai ', 'ai-', 'ml '] },
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
// prioridade sobre a área auto-detectada (mesma regra do país).
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

const todayISO = () => new Date().toISOString().slice(0, 10);

function Badge({ children, className = '' }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function CountryBadge({ code }) {
  const c = countryMeta(code);
  return <Badge className={c.color}>{c.code}</Badge>;
}

// Pré-calcula país e área (auto-detecção, já considerando overrides manuais)
// uma vez por item. Reaproveitado ao carregar a lista e após salvar edições.
function enrich(it) {
  return { ...it, _country: detectCountry(it).code, _area: detectArea(it) };
}

// refreshToken: incrementado pelo botão "Atualizar" global no HubContainer.
// highlightShortId: vindo de /hub?vaga={short_id} (via HubContainer) — depois
// que a lista carrega, o card correspondente ganha scroll-into-view + realce.
export default function VagasPhDPage({ refreshToken = 0, highlightShortId = null }) {
  const user = useStore((s) => s.user);
  const isOwner = user?.role === 'owner';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Total real no banco (project_id = phd_vagas), via /api/hub/stats — items
  // é limitado pelo `limit` da query, então items.length NÃO é confiável
  // como total.
  const [dbTotal, setDbTotal] = useState(null);

  // Filtros (todos aplicados no cliente).
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('todos');
  const [area, setArea] = useState('todos');
  const [order, setOrder] = useState('recent'); // recent | relevant

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

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('project', HUB_PROJECT);
      params.set('order_by', 'received_at');
      params.set('limit', '100');
      const [itemsRes, statsRes] = await Promise.all([
        apiFetch(`/api/hub/items?${params.toString()}`),
        apiFetch(`/api/hub/stats?project_id=${HUB_PROJECT}`).catch(() => null),
      ]);
      setItems((itemsRes.items || []).map(enrich));
      const projStats = statsRes && Array.isArray(statsRes.by_project)
        ? statsRes.by_project[0] : null;
      setDbTotal(projStats ? projStats.count : 0);
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
  // "carregados"/"novasHoje"/"paises" vêm dos items já buscados (limitados
  // pelo `limit` da query); dbTotal (state, acima) é o total REAL do banco,
  // via /api/hub/stats.
  const stats = useMemo(() => {
    const today = todayISO();
    const novasHoje = items.filter(
      (it) => fmtDate(it.collected_at || it.received_at) === today,
    ).length;
    const paises = new Set(items.map((it) => it._country));
    return { carregados: items.length, novasHoje, paises: paises.size };
  }, [items]);

  // ── Lista filtrada + ordenada ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = items.filter((it) => {
      if (q && !((it.title || '').toLowerCase().includes(q) || (it.resumo || '').toLowerCase().includes(q))) return false;
      if (country !== 'todos' && it._country !== country) return false;
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
  }, [items, search, country, area, order]);

  // ── Adicionar à Carreira ──────────────────────────────────────────────────
  const addToCareer = async (item) => {
    if (added[item.id] === 'saving' || added[item.id] === 'done') return;
    setAdded((m) => ({ ...m, [item.id]: 'saving' }));
    // A tabela career_opportunities não tem campo de instituição em texto livre
    // (organization_id é FK), então a fonte vai dentro das notas.
    const fonte = item.source_name ? `Fonte: ${item.source_name}\n\n` : '';
    const payload = {
      title: item.title,
      type: 'phd',   // enum: job | phd | postdoc | grant | collaboration | ...
      track: 'phd',  // trilha do Kanban: phd | job | spinoff
      status: 'to_organize', // primeiro status do Kanban de Carreira
      url: item.url || '',
      description: item.justificativa || '',
      notes: `${fonte}${item.resumo || ''}`.trim(),
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
      showToast('Vaga adicionada à Carreira e arquivada no Hub');
    } catch (e) {
      setAdded((m) => { const n = { ...m }; delete n[item.id]; return n; });
      showToast(`Falha ao adicionar: ${String(e.message || e).slice(0, 80)}`);
    }
  };

  // ── Mover para Empregos ───────────────────────────────────────────────────
  const moveToEmprego = async (item) => {
    setMoving(item.id);
    try {
      const res = await apiFetch('/api/hub/items/bulk/project', {
        method: 'PATCH',
        body: JSON.stringify({ ids: [item.id], project_id: 'emprego_vagas' }),
      });
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(item.id); return n; });
      if (selected && selected.id === item.id) setSelected(null);
      showToast(res?.already_exists?.length ? 'Item já existe no destino' : 'Vaga movida para Empregos');
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

  const bulkMoveToEmprego = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await apiFetch('/api/hub/items/bulk/project', {
        method: 'PATCH',
        body: JSON.stringify({ ids, project_id: 'emprego_vagas' }),
      });
      setItems((prev) => prev.filter((it) => !selectedIds.has(it.id)));
      const already = res?.already_exists?.length || 0;
      showToast(already
        ? `${res.moved} vaga(s) movida(s) para Empregos, ${already} já existia(m) no destino`
        : `${ids.length} vaga(s) movida(s) para Empregos`);
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
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <GraduationCap className="h-6 w-6 text-accent" />
          Vagas PhD
        </h1>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total no banco" value={dbTotal != null ? dbTotal : '—'} />
        <StatCard label="Carregados" value={stats.carregados} />
        <StatCard label="Novas hoje" value={stats.novasHoje} accent />
        <StatCard label="Países representados" value={stats.paises} />
      </div>

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título ou resumo..."
            className="h-9 w-full rounded-lg border border-line bg-surface2 pl-9 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          País
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
          >
            <option value="todos">Todos</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.label}</option>)}
            <option value="Outro">Outro</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          Área
          <select
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
          >
            <option value="todos">Todas</option>
            {AREAS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
            <option value="outros">Outros</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          Ordenar
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="rounded-lg border border-line bg-surface2 px-2 py-1.5 text-xs text-ink"
          >
            <option value="recent">Mais recente</option>
            <option value="relevant">Mais relevante</option>
          </select>
        </label>
      </div>

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
            onClick={bulkMoveToEmprego}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Empregos
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
          <div className="py-16"><LoadingSpinner label="Carregando vagas de doutorado..." /></div>
        ) : error ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-8 text-center text-sm text-danger">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-line bg-surface px-4 py-12 text-center text-sm text-muted">
            {items.length === 0
              ? 'Nenhuma vaga recebida ainda. Assim que o Intelligence Hub enviar vagas de doutorado, elas aparecerão aqui.'
              : 'Nenhuma vaga corresponde aos filtros.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((it) => (
              <VagaCard
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
                onMove={() => moveToEmprego(it)}
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

      {selected && (
        <DetailModal
          item={selected}
          onClose={() => setSelected(null)}
          onAdd={() => addToCareer(selected)}
          state={added[selected.id]}
          onEdit={() => setEditingItem(selected)}
        />
      )}

      <EditItemModal
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSaved={handleSaved}
      />

      <LinkTaskModal
        item={linkingItem}
        onClose={() => setLinkingItem(null)}
        onLinked={handleLinked}
      />

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

function StatCard({ label, value, accent = false }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-bold ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

// Botão "Adicionar à Carreira" com estados saving/done. Reutilizado no card e no modal.
function AddButton({ state, onAdd, full = false }) {
  const base = `flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${full ? 'w-full' : ''}`;
  if (state === 'done') {
    return (
      <span className={`${base} bg-emerald-100 text-emerald-700`}>
        <CheckCircle2 className="h-4 w-4" /> Adicionada
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
        ? <><Loader2 className="h-4 w-4 animate-spin" /> Adicionando...</>
        : <><Plus className="h-4 w-4" /> Adicionar à Carreira</>}
    </button>
  );
}

function VagaCard({
  item, onOpen, onAdd, state, onDelete, onEdit, deleting, onMove, moving, selected, onToggleSelect,
  cardRef, highlighted, onCopyLink, onLinkTask,
}) {
  const title = effectiveTitle(item);
  const resumoFull = effectiveResumo(item);
  const resumo = (resumoFull || '').slice(0, 150);
  const truncated = (resumoFull || '').length > 150;
  return (
    <div
      ref={cardRef}
      onClick={onOpen}
      className={`flex cursor-pointer flex-col gap-3 rounded-xl border bg-surface p-4 transition hover:border-accent/50 hover:shadow-soft ${
        highlighted ? 'border-accent ring-2 ring-accent' : selected ? 'border-accent' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={!!selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggleSelect}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <h3 className="flex items-center gap-1.5 font-semibold leading-snug text-ink">
            {title}
            {item.edited_at && <Pencil className="h-3 w-3 shrink-0 text-muted" title="Editado manualmente" />}
          </h3>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <CountryBadge code={item._country} />
          {onEdit && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="rounded-md p-1 text-ink2 transition hover:bg-surface2 hover:text-accent"
              title="Editar vaga"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              disabled={deleting}
              className="rounded-md p-1 text-ink2 transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
              title="Remover vaga"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        {item.source_name && (
          <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{item.source_name}</span>
        )}
        <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{fmtDate(item.collected_at || item.received_at)}</span>
        <Badge className="bg-accent/10 text-accent">{areaLabel(item)}</Badge>
        {item.short_id && <span className="font-mono text-[11px] text-muted">#{item.short_id}</span>}
      </div>

      {resumo && (
        <p className="text-sm leading-relaxed text-ink2">
          {resumo}{truncated && '…'}
        </p>
      )}

      <div className="mt-auto flex items-center gap-2 pt-1">
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
          >
            <ExternalLink className="h-4 w-4" /> Ver vaga
          </a>
        )}
        <div className="flex-1" />
        {item.short_id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCopyLink(); }}
            className="rounded-lg border border-line bg-surface p-2 text-ink2 transition hover:bg-surface2"
            title="Copiar link"
          >
            <Link2 className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onLinkTask(); }}
          className="rounded-lg border border-line bg-surface p-2 text-ink2 transition hover:bg-surface2"
          title="Vincular à Tarefa"
        >
          <ClipboardList className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onMove(); }}
          disabled={moving}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2 disabled:opacity-50"
          title="Mover para Empregos"
        >
          {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Empregos
        </button>
        <AddButton state={state} onAdd={onAdd} />
      </div>
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

function DetailModal({ item, onClose, onAdd, state, onEdit }) {
  const topicos = Array.isArray(item.topicos) ? item.topicos : [];
  const title = effectiveTitle(item);
  const resumo = effectiveResumo(item);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
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
            <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
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
            <Badge className="bg-accent/10 text-accent">{areaLabel(item)}</Badge>
            {item.relevancia != null && (
              <Badge className="bg-surface2 text-ink2">Relev.: {Number(item.relevancia).toFixed(1)}</Badge>
            )}
            {item.prioridade && <Badge className="bg-surface2 text-ink2">Prioridade: {item.prioridade}</Badge>}
          </div>

          {item.source_name && (
            <Row label="Instituição / Fonte">
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
