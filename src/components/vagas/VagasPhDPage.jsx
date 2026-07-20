import { useEffect, useMemo, useState } from 'react';
import {
  GraduationCap, RefreshCw, Search, ExternalLink, X, Tag, FileText,
  Loader2, Plus, CheckCircle2, MapPin, Building2, CalendarDays, Trash2, Pencil,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { useStore } from '../../store';
import LoadingSpinner from '../shared/LoadingSpinner';
import ConfirmModal from '../shared/ConfirmModal';
import EditItemModal from '../shared/EditItemModal';

// project_id no hub_items que agrupa as vagas de doutorado curadas.
const HUB_PROJECT = 'phd_vagas';

// ── Detecção de país ────────────────────────────────────────────────────────
// Prioridade: 1) campo `country` gravado manualmente no banco (via
// EditItemModal); 2) inferência por texto (título + resumo + tópicos).
// 'Outro' é o fallback quando nenhuma pista é encontrada. Cada país tem um
// conjunto de termos (PT/EN/nativo + cidades/universidades-alvo).
const COUNTRIES = [
  { code: 'NL', label: 'Países Baixos', color: 'bg-orange-100 text-orange-700',
    terms: ['netherlands', 'holland', 'holanda', 'países baixos', 'paises baixos', 'dutch', 'nederland', 'delft', 'amsterdam', 'rotterdam', 'eindhoven', 'utrecht', 'groningen', 'twente', 'wageningen'] },
  { code: 'DE', label: 'Alemanha', color: 'bg-neutral-200 text-neutral-800',
    terms: ['germany', 'alemanha', 'deutschland', 'german', 'berlin', 'munich', 'münchen', 'munique', 'hamburg', 'heidelberg', 'karlsruhe', 'aachen', 'stuttgart', 'dresden', 'fraunhofer', 'jülich', 'juelich'] },
  { code: 'BE', label: 'Bélgica', color: 'bg-yellow-100 text-yellow-800',
    terms: ['belgium', 'belgië', 'belgique', 'bélgica', 'belgica', 'belgian', 'leuven', 'ghent', 'gent', 'brussels', 'bruxelles', 'bruxelas', 'antwerp', 'vito', 'imec'] },
  { code: 'DK', label: 'Dinamarca', color: 'bg-red-100 text-red-700',
    terms: ['denmark', 'danmark', 'dinamarca', 'danish', 'copenhagen', 'københavn', 'copenhague', 'aarhus', 'dtu', 'lyngby'] },
  { code: 'SE', label: 'Suécia', color: 'bg-sky-100 text-sky-700',
    terms: ['sweden', 'sverige', 'suécia', 'suecia', 'swedish', 'stockholm', 'estocolmo', 'gothenburg', 'göteborg', 'lund', 'chalmers', 'kth'] },
  { code: 'CH', label: 'Suíça', color: 'bg-rose-100 text-rose-700',
    terms: ['switzerland', 'schweiz', 'suisse', 'suíça', 'suica', 'swiss', 'zurich', 'zürich', 'geneva', 'genebra', 'lausanne', 'basel', 'eth', 'epfl', 'paul scherrer', 'empa'] },
  { code: 'UK', label: 'Reino Unido', color: 'bg-indigo-100 text-indigo-700',
    terms: ['united kingdom', 'reino unido', 'england', 'inglaterra', 'britain', 'british', 'scotland', 'escócia', 'london', 'londres', 'edinburgh', 'manchester', 'cambridge', 'oxford', 'bristol', 'imperial college'] },
];
const OTHER_COUNTRY = { code: 'Outro', label: 'Outro', color: 'bg-surface2 text-ink2' };

// Fontes agregadoras que listam vagas de múltiplos países — o nome da fonte
// nunca deve, sozinho, indicar o país da vaga (ex.: jobs.ac.uk hospeda vagas
// fora do Reino Unido também).
const GLOBAL_SOURCES = ['jobs.ac.uk'];

function detectCountry(item) {
  // 1) País definido manualmente (prioridade máxima).
  if (item.country) return countryMeta(item.country);

  // 2) Inferência por conteúdo (título + resumo + tópicos) — nunca pelo nome
  //    da fonte quando ela é um agregador global (jobs.ac.uk etc.).
  const content = `${item.title || ''} ${item.resumo || ''} ${(Array.isArray(item.topicos) ? item.topicos.join(' ') : '')}`.toLowerCase();
  for (const c of COUNTRIES) {
    if (c.terms.some((t) => content.includes(t))) return c;
  }

  // 3) Sem pista no conteúdo: como último recurso, tenta o nome da fonte —
  //    exceto para agregadores globais.
  const sourceName = (item.source_name || '').toLowerCase();
  const isGlobalSource = GLOBAL_SOURCES.some((s) => sourceName.includes(s));
  if (sourceName && !isGlobalSource) {
    for (const c of COUNTRIES) {
      if (c.terms.some((t) => sourceName.includes(t))) return c;
    }
  }

  return OTHER_COUNTRY;
}

function countryMeta(code) {
  return COUNTRIES.find((c) => c.code === code) || OTHER_COUNTRY;
}

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

export default function VagasPhDPage() {
  const user = useStore((s) => s.user);
  const isOwner = user?.role === 'owner';

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('project', HUB_PROJECT);
      params.set('order_by', 'received_at');
      params.set('limit', '100');
      const res = await apiFetch(`/api/hub/items?${params.toString()}`);
      setItems((res.items || []).map(enrich));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  // ── Estatísticas ──────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const today = todayISO();
    const novasHoje = items.filter(
      (it) => fmtDate(it.collected_at || it.received_at) === today,
    ).length;
    const paises = new Set(items.map((it) => it._country));
    return { total: items.length, novasHoje, paises: paises.size };
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
      status: 'identified', // primeiro status do Kanban de Carreira
      url: item.url || '',
      description: item.justificativa || '',
      notes: `${fonte}${item.resumo || ''}`.trim(),
    };
    try {
      await apiFetch('/api/career/opportunities', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAdded((m) => ({ ...m, [item.id]: 'done' }));
      showToast('Vaga adicionada ao Kanban de Carreira');
    } catch (e) {
      setAdded((m) => { const n = { ...m }; delete n[item.id]; return n; });
      showToast(`Falha ao adicionar: ${String(e.message || e).slice(0, 80)}`);
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
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </button>
      </div>

      {/* Cards de estatísticas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Vagas recebidas" value={stats.total} />
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
                item={it}
                onOpen={() => setSelected(it)}
                onAdd={() => addToCareer(it)}
                state={added[it.id]}
                onDelete={isOwner ? () => setConfirmItem(it) : null}
                onEdit={() => setEditingItem(it)}
                deleting={deleting === it.id}
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

      <ConfirmModal
        open={!!confirmItem}
        title="Remover vaga?"
        message="Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmItem(null)}
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

function VagaCard({ item, onOpen, onAdd, state, onDelete, onEdit, deleting }) {
  const title = effectiveTitle(item);
  const resumoFull = effectiveResumo(item);
  const resumo = (resumoFull || '').slice(0, 150);
  const truncated = (resumoFull || '').length > 150;
  return (
    <div
      onClick={onOpen}
      className="flex cursor-pointer flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition hover:border-accent/50 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold leading-snug text-ink">
          {title}
          {item.edited_at && <Pencil className="h-3 w-3 shrink-0 text-muted" title="Editado manualmente" />}
        </h3>
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
