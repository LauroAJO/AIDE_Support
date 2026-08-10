import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, X, ExternalLink, Loader2, Building2, User, CalendarClock, CheckSquare, Trash2, Star,
  Search, CheckCircle2, Archive as ArchiveIcon, RotateCcw,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import Avatar from '../shared/Avatar';
import ConfirmModal from '../shared/ConfirmModal';
import { DraftBanner } from '../shared/DraftBanner';
import { useDraft } from '../../hooks/useDraft';
import {
  useUnsavedGuard, DISCARD_TITLE, DISCARD_MESSAGE,
  DISCARD_CONFIRM_LABEL, DISCARD_CANCEL_LABEL,
} from '../../hooks/useUnsavedGuard';
import {
  StarRating, TrackBadge, OppTypeBadge, parseTags,
  PIPELINE_COLUMNS, TRACK_LABELS, OPP_TYPE_LABELS, OPP_STATUS_LABELS, OPP_STATUS_ORDER,
  ARCHIVE_STATUSES,
  trackColor, deadlineColor, deadlineCountdown, daysUntil, priorityDot, PRIORITY_LABELS,
  trackForType, parseStatusLog, joinNotesWithLog,
} from './careerShared';

const TRACK_FILTERS = [
  { key: 'all', label: 'Todas' },
  { key: 'phd', label: 'PhD' },
  { key: 'job', label: 'Emprego' },
  { key: 'spinoff', label: 'Spin-off' },
];

// Ordenação por coluna — aplicada localmente sobre os cards já carregados.
const SORT_OPTIONS = [
  { key: 'recent', label: 'Mais recente' },
  { key: 'oldest', label: 'Mais antigo' },
  { key: 'az', label: 'A-Z' },
  { key: 'za', label: 'Z-A' },
  { key: 'type', label: 'Tipo' },
];

function trackRank(track) {
  if (track === 'phd') return 0;
  if (track === 'job') return 1;
  return 2;
}

function sortOpps(list, sortKey) {
  const arr = [...list];
  switch (sortKey) {
    case 'oldest':
      arr.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
      break;
    case 'az':
      arr.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'));
      break;
    case 'za':
      arr.sort((a, b) => (b.title || '').localeCompare(a.title || '', 'pt-BR'));
      break;
    case 'type':
      arr.sort((a, b) => trackRank(a.track) - trackRank(b.track));
      break;
    case 'recent':
    default:
      arr.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  }
  return arr;
}

const EMPTY_OPP = {
  title: '', type: 'job', track: 'job', organization_id: '', contact_id: '', description: '',
  requirements: '', location: '', salary_range: '', deadline: '', status: 'to_organize',
  priority: 3, fit_score: 3, url: '', notes: '', tags: [], assigned_to: '',
};

// Em qual coluna do pipeline um status cai.
function columnKeyForStatus(status) {
  const col = PIPELINE_COLUMNS.find((c) => c.statuses.includes(status));
  return col ? col.key : 'to_organize';
}

// `initialOrgId` (vindo de /market → "Nova Oportunidade") abre o editor já com
// a organização pré-selecionada. `onInitialOrgConsumed` avisa o CareerPage para
// limpar o state da navegação e não reabrir o editor a cada re-render.
export default function OpportunityPipeline({ initialOrgId, onInitialOrgConsumed }) {
  const opps = useStore((s) => s.careerOpportunities);
  const setOpps = useStore((s) => s.setCareerOpportunities);

  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState('all');
  // v2.26.2 — [Pipeline] [Arquivo] toggle. 'archive' mostra status IN
  // ARCHIVE_STATUSES ('mapped' + 'dead'), fora do Kanban ativo.
  const [view, setView] = useState('pipeline');
  const [ecExpanded, setEcExpanded] = useState({}); // colKey -> bool
  const [sortBy, setSortBy] = useState({});          // colKey -> chave de SORT_OPTIONS
  const [orgs, setOrgs] = useState([]);
  const [people, setPeople] = useState([]);
  const [usersById, setUsersById] = useState({});
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  const [modalId, setModalId] = useState(null);
  const [editor, setEditor] = useState(null); // { mode, form }
  const [deleting, setDeleting] = useState(null);
  const [confirmItem, setConfirmItem] = useState(null);
  const [toast, setToast] = useState('');

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const load = async () => {
    try {
      setOpps(await apiFetch('/api/career/opportunities'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // Dados auxiliares para selects e avatares (tolerantes a falha).
    apiFetch('/api/market/organizations').then((r) => setOrgs(r || [])).catch(() => {});
    apiFetch('/api/network/people').then((r) => setPeople(r || [])).catch(() => {});
    apiFetch('/api/users').then((r) => {
      const map = {};
      (r || []).forEach((u) => { map[u.id] = u; });
      setUsersById(map);
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Criação rápida a partir de uma organização: abre o editor pré-preenchido
  // com a org, tipo PhD e a trilha correspondente. Roda uma única vez por
  // navegação (o CareerPage limpa o state depois via onInitialOrgConsumed).
  useEffect(() => {
    if (!initialOrgId) return;
    setEditor({
      mode: 'create',
      form: { ...EMPTY_OPP, organization_id: initialOrgId, type: 'phd', track: trackForType('phd') },
    });
    onInitialOrgConsumed && onInitialOrgConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrgId]);

  const filtered = useMemo(
    () => (trackFilter === 'all' ? opps : opps.filter((o) => o.track === trackFilter)),
    [opps, trackFilter],
  );

  // v2.26.2 — itens arquivados ('mapped' ou 'dead') saem do Kanban ativo e só
  // aparecem na aba Arquivo. Sem isso, um item 'mapped' cairia no fallback de
  // columnKeyForStatus (que devolve 'to_organize' para status desconhecido) e
  // voltaria a poluir a primeira coluna — exatamente o problema que "Coleta
  // concluída" deveria resolver.
  const pipelineOpps = useMemo(
    () => filtered.filter((o) => !ARCHIVE_STATUSES.includes(o.status)),
    [filtered],
  );
  const archiveOpps = useMemo(
    () => filtered.filter((o) => ARCHIVE_STATUSES.includes(o.status)),
    [filtered],
  );

  // Por coluna: cards visíveis (sem Mapear) + cards em Mapear ocultos por
  // padrão — dentro de cada grupo, prioritários (is_priority=1) vêm antes, e
  // só então a ordenação escolhida no select da coluna decide. `total` conta
  // só os cards normais (sem Mapear) — o contador de Mapear fica no botão de
  // expandir, separado.
  const byColumn = useMemo(() => {
    const map = {};
    PIPELINE_COLUMNS.forEach((c) => {
      const items = pipelineOpps.filter((o) => columnKeyForStatus(o.status) === c.key);
      const sortKey = sortBy[c.key] || 'recent';
      const normal = items.filter((o) => !o.extract_knowledge);
      const ec = items.filter((o) => !!o.extract_knowledge);
      const byPriority = (list) => [
        ...sortOpps(list.filter((o) => o.is_priority), sortKey),
        ...sortOpps(list.filter((o) => !o.is_priority), sortKey),
      ];
      map[c.key] = { visible: byPriority(normal), ecHidden: byPriority(ec), total: normal.length };
    });
    return map;
  }, [pipelineOpps, sortBy]);

  // Move um card para o status alvo da coluna (otimista + PUT).
  const moveTo = async (id, newStatus) => {
    const opp = opps.find((o) => o.id === id);
    if (!opp || opp.status === newStatus) return;
    setOpps(opps.map((o) => (o.id === id ? { ...o, status: newStatus } : o)));
    try {
      await apiFetch(`/api/career/opportunities/${id}`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    } catch {
      load(); // reverte recarregando se falhar
    }
  };

  // Liga/desliga o toggle "Mapear" de um card (otimista + PATCH). O campo no
  // banco continua chamado extract_knowledge (não renomeado — ver nota de
  // desvio no relatório do Bloco 2); só o texto voltado ao usuário virou "Mapear".
  const toggleExtract = async (id) => {
    const opp = opps.find((o) => o.id === id);
    if (!opp) return;
    const next = opp.extract_knowledge ? 0 : 1;
    setOpps(opps.map((o) => (o.id === id ? { ...o, extract_knowledge: next } : o)));
    try {
      await apiFetch(`/api/career/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ extract_knowledge: next }) });
    } catch {
      load(); // reverte recarregando se falhar
    }
  };

  // v2.26.2 — "Coleta concluída": arquiva o card (status='mapped', some do
  // Kanban ativo) e, se houver uma tarefa vinculada (opportunity_id = id)
  // ainda não concluída, marca-a como concluída também. Não existe endpoint
  // "tarefas por opportunity_id" — varre a lista completa (já com o escopo de
  // permissão do usuário aplicado pelo backend). Best-effort: uma falha ao
  // atualizar a tarefa não desfaz o arquivamento da oportunidade.
  const markCollected = async (id) => {
    const opp = opps.find((o) => o.id === id);
    if (!opp) return;
    setOpps(opps.map((o) => (o.id === id ? { ...o, status: 'mapped' } : o)));
    try {
      await apiFetch(`/api/career/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'mapped' }) });
      try {
        const allTasks = await apiFetch('/api/tasks');
        const linked = (allTasks || []).find((t) => t.opportunity_id === id && t.status !== 'done');
        if (linked) {
          await apiFetch(`/api/tasks/${linked.id}`, { method: 'PUT', body: JSON.stringify({ status: 'done' }) });
        }
      } catch { /* best-effort — não bloqueia o arquivamento da oportunidade */ }
      showToast('✅ Mapeamento concluído — movido para Arquivo');
      load();
    } catch (e) {
      showToast(`Falha ao concluir mapeamento: ${String(e.message || e).slice(0, 80)}`);
      load();
    }
  };

  // v2.26.2 — restaura um item arquivado de volta ao Kanban ativo, na
  // primeira coluna (to_organize). Usado só pela aba Arquivo.
  const restoreOpp = async (id) => {
    setOpps(opps.map((o) => (o.id === id ? { ...o, status: 'to_organize' } : o)));
    try {
      await apiFetch(`/api/career/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'to_organize' }) });
      showToast('Oportunidade restaurada para o Pipeline');
    } catch {
      load();
    }
  };

  // Liga/desliga o marcador "prioritário" (estrela) de um card (otimista + PATCH).
  const togglePriority = async (id) => {
    const opp = opps.find((o) => o.id === id);
    if (!opp) return;
    const next = opp.is_priority ? 0 : 1;
    setOpps(opps.map((o) => (o.id === id ? { ...o, is_priority: next } : o)));
    try {
      await apiFetch(`/api/career/opportunities/${id}`, { method: 'PATCH', body: JSON.stringify({ is_priority: next }) });
    } catch {
      load(); // reverte recarregando se falhar
    }
  };

  const deleteOpp = async (item) => {
    setDeleting(item.id);
    try {
      await apiFetch(`/api/career/opportunities/${item.id}`, { method: 'DELETE' });
      setOpps(opps.filter((o) => o.id !== item.id));
      if (modalId === item.id) setModalId(null);
      showToast('Oportunidade removida');
    } catch (e) {
      showToast(`Falha ao remover: ${String(e.message || e).slice(0, 80)}`);
    } finally {
      setDeleting(null);
    }
  };

  const confirmDelete = () => {
    const item = confirmItem;
    setConfirmItem(null);
    if (item) deleteOpp(item);
  };

  const handleDrop = (colKey) => {
    setDragOverCol(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const col = PIPELINE_COLUMNS.find((c) => c.key === colKey);
    if (col) moveTo(id, col.dropStatus);
  };

  const afterSave = async (savedId) => {
    setEditor(null);
    await load();
    if (savedId) setModalId(savedId);
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando oportunidades..." /></div>;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Barra: Pipeline/Arquivo + filtro por trilha + nova oportunidade */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* v2.26.2 — aba Arquivo: itens 'mapped' (mapeamento concluído) e
              'dead' (vagas mortas) saem do Kanban ativo e ficam aqui. */}
          <div className="flex overflow-hidden rounded-lg border border-line">
            <button
              type="button"
              onClick={() => setView('pipeline')}
              className={`px-3 py-1.5 text-xs font-medium transition ${
                view === 'pipeline' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              Pipeline
            </button>
            <button
              type="button"
              onClick={() => setView('archive')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition ${
                view === 'archive' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              <ArchiveIcon className="h-3.5 w-3.5" /> Arquivo
              {archiveOpps.length > 0 && (
                <span className={`rounded-full px-1.5 text-[10px] ${view === 'archive' ? 'bg-white/25' : 'bg-surface2'}`}>
                  {archiveOpps.length}
                </span>
              )}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {TRACK_FILTERS.map((t) => {
              const active = trackFilter === t.key;
              const c = trackColor(t.key);
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTrackFilter(t.key)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
                    active ? 'text-white' : 'border border-line bg-surface text-ink2 hover:bg-surface2'
                  }`}
                  style={active ? { backgroundColor: c.hex } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditor({ mode: 'create', form: { ...EMPTY_OPP, track: trackFilter === 'all' ? 'job' : trackFilter } })}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova Oportunidade
          </button>
        </div>
      </div>

      {view === 'archive' ? (
        <ArchiveView
          items={archiveOpps}
          onRestore={restoreOpp}
          onDelete={(item) => setConfirmItem(item)}
          onOpen={(id) => setModalId(id)}
          deleting={deleting}
        />
      ) : (
      /* Kanban */
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2">
        {PIPELINE_COLUMNS.map((col) => {
          const header = trackColor(trackFilter);
          const { visible, ecHidden, total } = byColumn[col.key] || { visible: [], ecHidden: [], total: 0 };
          const over = dragOverCol === col.key;
          const expanded = !!ecExpanded[col.key];
          const sortKey = sortBy[col.key] || 'recent';
          const cardProps = (o) => ({
            key: o.id,
            opp: o,
            assignee: usersById[o.assigned_to],
            dragging: draggingId === o.id,
            onDragStart: () => setDraggingId(o.id),
            onDragEnd: () => setDraggingId(null),
            onClick: () => setModalId(o.id),
            onToggleExtract: () => toggleExtract(o.id),
            onMarkCollected: () => markCollected(o.id),
            onTogglePriority: () => togglePriority(o.id),
            onDelete: () => setConfirmItem(o),
            onMove: (status) => moveTo(o.id, status),
            deleting: deleting === o.id,
          });
          return (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol((k) => (k === col.key ? null : k))}
              onDrop={() => handleDrop(col.key)}
              className={`flex w-72 shrink-0 flex-col rounded-xl border bg-base/50 ${
                over ? 'border-2 border-accent' : 'border-line'
              }`}
            >
              <div className={`flex items-center justify-between gap-1.5 rounded-t-xl px-3 py-2 text-sm font-semibold ${header.header}`}>
                <span className="truncate">{col.label}</span>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-white/60 px-1.5 text-xs font-medium">{total}</span>
                  <select
                    value={sortKey}
                    onChange={(e) => setSortBy((s) => ({ ...s, [col.key]: e.target.value }))}
                    title="Ordenar coluna"
                    className="rounded border-none bg-white/60 px-1 py-0.5 text-[10px] font-normal text-ink2 focus:outline-none"
                  >
                    {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {total === 0 && <p className="px-1 py-4 text-center text-xs text-muted">Vazio</p>}
                {visible.map((o) => <OpportunityCard {...cardProps(o)} />)}

                {ecHidden.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEcExpanded((m) => ({ ...m, [col.key]: !m[col.key] }))}
                      className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line px-2 py-1.5 text-[11px] font-medium text-ink2 transition hover:bg-surface2"
                    >
                      🔍 {ecHidden.length} em Mapear {expanded ? '▲' : '▼'}
                    </button>
                    {expanded && (
                      <>
                        <div className="flex items-center gap-2 py-0.5">
                          <div className="h-px flex-1 bg-line" />
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Mapear</span>
                          <div className="h-px flex-1 bg-line" />
                        </div>
                        {ecHidden.map((o) => <OpportunityCard {...cardProps(o)} />)}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {modalId && (
        <OpportunityModal
          id={modalId}
          orgs={orgs}
          onClose={() => setModalId(null)}
          onChanged={load}
          onEditFull={(data) => { setModalId(null); setEditor({ mode: 'edit', form: { ...data, tags: parseTags(data.tags) } }); }}
        />
      )}

      {editor && (
        <OpportunityEditor
          mode={editor.mode}
          initial={editor.form}
          orgs={orgs}
          people={people}
          users={Object.values(usersById)}
          onClose={() => setEditor(null)}
          onSaved={afterSave}
        />
      )}

      <ConfirmModal
        open={!!confirmItem}
        title="Remover esta oportunidade?"
        message="Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmItem(null)}
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-[80] rounded-lg bg-ink px-4 py-2 text-sm text-white shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opp, assignee, dragging, onDragStart, onDragEnd, onClick, onToggleExtract, onMarkCollected, onTogglePriority, onDelete, onMove, deleting }) {
  const c = trackColor(opp.track);
  const dl = deadlineColor(opp.deadline);
  const countdown = deadlineCountdown(opp.deadline);
  const extracting = !!opp.extract_knowledge;
  const priority = !!opp.is_priority;
  const currentCol = columnKeyForStatus(opp.status);
  // Cards em "Mapeando" mantêm o fundo neutro; nos demais, o fundo de urgência
  // do prazo (bg-red-50 / bg-amber-50) substitui o bg-surface padrão.
  const cardBg = extracting ? 'bg-surface2' : (dl.bg || 'bg-surface');
  return (
    <div
      draggable="true"
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        borderLeft: `4px solid ${extracting ? '#8B5CF6' : c.hex}`,
        opacity: dragging ? 0.5 : (extracting ? 0.6 : 1),
      }}
      className={`relative cursor-pointer rounded-lg border border-line p-2.5 shadow-sm transition hover:border-accent ${cardBg}`}
    >
      {extracting && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
          🔍 Mapeando
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{opp.title}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className={`mt-1 h-2.5 w-2.5 rounded-full ${priorityDot(opp.priority)}`} title={`Prioridade ${PRIORITY_LABELS[opp.priority] || opp.priority}`} />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            disabled={deleting}
            title="Remover oportunidade"
            className="rounded p-0.5 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        <OppTypeBadge type={opp.type} />
        {opp.hub_short_id && <span className="font-mono text-[11px] text-muted">#{opp.hub_short_id}</span>}
      </div>
      {opp.organization_name && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Building2 className="h-3 w-3" />{opp.organization_name}
        </div>
      )}
      {opp.deadline && (
        <div className="mt-1">
          <div className={`flex items-center gap-1 text-[11px] ${dl.text}`}>
            <CalendarClock className="h-3 w-3" />
            {opp.deadline}
          </div>
          {countdown && (
            <div className={`mt-0.5 pl-4 text-[11px] ${countdown.className}`}>{countdown.text}</div>
          )}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <StarRating value={opp.fit_score} size={12} />
        {assignee && <Avatar user={{ name: assignee.name, avatar: assignee.avatar }} size={20} />}
      </div>
      {/* v2.26.2 — "Mapear" virou um chip compacto (ícone + rótulo curto) em
          vez de um botão largo com o texto inteiro "Extrair Conhecimento" —
          era grande demais e poluía visualmente o card (bug #1 do Bloco 2).
          "Coleta concluída" só aparece quando o card já está em Mapear. */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleExtract(); }}
          title={extracting ? 'Marcado para mapear — clique para desmarcar' : 'Marcar para mapear (só fonte de informação, não candidatura)'}
          className={`flex items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
            extracting ? 'bg-violet-600 text-white hover:opacity-90' : 'border border-line text-ink2 hover:bg-surface2'
          }`}
        >
          <Search className="h-3 w-3" /> {extracting ? 'Mapear ✓' : 'Mapear'}
        </button>
        {extracting && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMarkCollected(); }}
            title="Coleta concluída — arquiva esta oportunidade e conclui a tarefa vinculada"
            className="flex items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white transition hover:opacity-90"
          >
            <CheckCircle2 className="h-3 w-3" /> Coleta concluída
          </button>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePriority(); }}
          title={priority ? 'Remover prioridade' : 'Marcar como prioritário'}
          className={`flex shrink-0 items-center justify-center rounded-md border p-1.5 transition ${
            priority ? 'border-amber-300 bg-amber-50 text-amber-500' : 'border-line text-muted hover:bg-surface2'
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${priority ? 'fill-amber-400' : ''}`} />
        </button>
        {opp.hub_short_id && (
          <a
            href={`/hub?vaga=${opp.hub_short_id}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Ver vaga original no Hub"
            className="flex shrink-0 items-center justify-center rounded-md border border-line p-1.5 text-muted transition hover:bg-surface2"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <select
        value=""
        onChange={(e) => { if (e.target.value) onMove(e.target.value); }}
        onClick={(e) => e.stopPropagation()}
        title="Mover para outra coluna"
        className="mt-1.5 w-full rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-ink2 transition hover:bg-surface2 focus:outline-none"
      >
        <option value="">Mover para →</option>
        {PIPELINE_COLUMNS.filter((c2) => c2.key !== currentCol).map((c2) => (
          <option key={c2.key} value={c2.dropStatus}>{c2.label}</option>
        ))}
      </select>
    </div>
  );
}

// v2.26.2 — Aba Arquivo: lista (não Kanban) dos itens com status 'mapped'
// (mapeamento concluído) ou 'dead' (vaga morta). Colunas conforme o pedido do
// Bloco 2: título | tipo | data | organização, com [Ver] [Restaurar] [Remover].
function ArchiveView({ items, onRestore, onDelete, onOpen, deleting }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-line">
        <p className="text-sm text-muted">Nada no arquivo ainda — itens mapeados ou vagas mortas aparecem aqui.</p>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-surface2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Título</th>
            <th className="px-3 py-2 font-medium">Tipo</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Data</th>
            <th className="px-3 py-2 font-medium">Organização</th>
            <th className="px-3 py-2 font-medium">Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((o, i) => (
            <tr
              key={o.id}
              className={`border-t border-line ${i % 2 === 1 ? 'bg-surface2/40' : 'bg-surface'} hover:bg-surface2/70`}
            >
              <td className="max-w-[260px] truncate px-3 py-2 font-medium text-ink" title={o.title}>{o.title}</td>
              <td className="px-3 py-2"><OppTypeBadge type={o.type} /></td>
              <td className="px-3 py-2">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  o.status === 'mapped' ? 'bg-violet-100 text-violet-700' : 'bg-surface2 text-ink2'
                }`}
                >
                  {OPP_STATUS_LABELS[o.status] || o.status}
                </span>
              </td>
              <td className="px-3 py-2 text-ink2">
                {o.updated_at ? new Date(o.updated_at * 1000).toLocaleDateString('pt-BR') : '—'}
              </td>
              <td className="max-w-[180px] truncate px-3 py-2 text-ink2" title={o.organization_name || ''}>
                {o.organization_name || '—'}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpen(o.id)}
                    title="Ver detalhe"
                    className="rounded p-1 text-ink2 transition hover:bg-surface2"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRestore(o.id)}
                    title="Restaurar para o Pipeline"
                    className="rounded p-1 text-ink2 transition hover:bg-surface2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(o)}
                    disabled={deleting === o.id}
                    title="Remover permanentemente"
                    className="rounded p-1 text-muted transition hover:bg-danger/10 hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OpportunityModal({ id, orgs, onClose, onChanged, onEditFull }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [taskMsg, setTaskMsg] = useState('');

  // `notes` no textarea = só o texto livre; as linhas do histórico de status
  // ficam guardadas em logLines e são re-anexadas ao salvar (ver saveNotes).
  const [logLines, setLogLines] = useState([]);
  const [logEntries, setLogEntries] = useState([]);

  const reload = async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/api/career/opportunities/${id}`);
      setData(d);
      const parsed = parseStatusLog(d.notes || '');
      setNotes(parsed.rest);
      setLogLines(parsed.logLines);
      setLogEntries(parsed.entries);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const patch = async (body) => {
    await apiFetch(`/api/career/opportunities/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    await reload();
    onChanged && onChanged();
  };

  const saveNotes = async () => {
    if (!data) return;
    const merged = joinNotesWithLog(notes, logLines);
    if (merged === (data.notes || '')) return;
    await patch({ notes: merged });
  };

  const createTask = async () => {
    if (!data) return;
    try {
      await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: `Carreira: ${data.title}`,
          description: [data.organization_name, data.url].filter(Boolean).join(' · '),
          due_date: data.deadline || '',
          // v2.26.2 — antes este POST não passava opportunity_id, então a
          // tarefa criada aqui nunca ficava de facto vinculada à oportunidade
          // (o filtro "Tarefas de carreira" e o badge de mapeamento no
          // TaskCard dependem desse campo). Corrigido: é o prerequisito para
          // o badge "🔍 Mapeamento" da tarefa (pedido neste mesmo Bloco 2)
          // ter alguma tarefa real para aparecer.
          opportunity_id: data.id,
        }),
      });
      setTaskMsg('Tarefa criada ✓');
    } catch {
      setTaskMsg('Falha ao criar tarefa');
    }
  };

  const days = data ? daysUntil(data.deadline) : null;
  const c = data ? trackColor(data.track) : trackColor('all');

  // As notas salvam no blur; se o modal fechar antes disso o texto se perdia.
  // Agora fechar com nota pendente pede confirmação (v2.25.13).
  const notesDirty = !!data && notes !== parseStatusLog(data.notes || '').rest;
  const guard = useUnsavedGuard({ isDirty: notesDirty, onClose });

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.13). */}
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-[680px] overflow-y-auto rounded-xl bg-surface p-5 shadow-soft">
        {loading || !data ? <LoadingSpinner label="Carregando..." /> : (
          <>
            <div className="mb-3 flex items-start justify-between gap-3" style={{ borderLeft: `4px solid ${c.hex}`, paddingLeft: 12 }}>
              <div>
                <h2 className="text-lg font-bold text-ink">{data.title}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <OppTypeBadge type={data.type} />
                  <TrackBadge track={data.track} />
                </div>
              </div>
              <button onClick={guard.requestClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
            </div>

            <div className="space-y-4">
              {/* Organização + contato */}
              <div className="flex flex-wrap items-center gap-4 text-sm">
                {data.organization_name && (
                  <button type="button" onClick={() => navigate('/market')} className="flex items-center gap-1 text-accent hover:underline">
                    <Building2 className="h-4 w-4" />{data.organization_name}
                  </button>
                )}
                {data.contact_name && (
                  <span className="flex items-center gap-1 text-ink2"><User className="h-4 w-4" />{data.contact_name}</span>
                )}
              </div>

              {data.description && <p className="text-sm text-ink2">{data.description}</p>}
              {data.requirements && (
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">Requisitos</span>
                  <p className="mt-0.5 text-sm text-ink2">{data.requirements}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <Info label="Local" value={data.location} />
                <Info label="Faixa salarial" value={data.salary_range} />
              </div>

              {/* Prazo destacado */}
              <div className={`rounded-lg border px-3 py-2 text-sm ${data.deadline ? `border-line ${deadlineColor(data.deadline).bg}` : 'border-dashed border-line'}`}>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Prazo</span>
                <div className={`mt-0.5 text-base ${deadlineColor(data.deadline).text}`}>
                  {data.deadline || 'Sem prazo'}{days !== null ? ` · ${days < 0 ? `${-days} dias atrás` : `faltam ${days} dias`}` : ''}
                </div>
              </div>

              {/* Status selector */}
              <Field label="Status (move o card)">
                <select value={data.status} onChange={(e) => patch({ status: e.target.value })} className="input">
                  {OPP_STATUS_ORDER.map((s) => <option key={s} value={s}>{OPP_STATUS_LABELS[s]}</option>)}
                </select>
              </Field>

              {/* Prioridade + fit como sliders */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <SliderRow label="Prioridade" value={data.priority} onCommit={(v) => patch({ priority: v })} />
                <div>
                  <span className="text-xs font-medium text-ink2">Fit score</span>
                  <div className="mt-1"><StarRating value={data.fit_score} size={20} onChange={(v) => patch({ fit_score: v || 1 })} /></div>
                </div>
              </div>

              {data.url && (
                <a href={data.url.startsWith('http') ? data.url : `https://${data.url}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-accent hover:underline">
                  <ExternalLink className="h-4 w-4" /> Abrir link da oportunidade
                </a>
              )}

              {/* Notas (auto-save no blur) */}
              <Field label="Notas (salva ao sair do campo)">
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} className="input min-h-[70px]" />
              </Field>

              {parseTags(data.tags).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {parseTags(data.tags).map((t) => <span key={t} className="rounded bg-surface2 px-2 py-0.5 text-xs text-ink2">{t}</span>)}
                </div>
              )}

              {/* Histórico de status — extraído das notas (ver parseStatusLog). */}
              {logEntries.length > 0 && (
                <div className="rounded-lg border border-line px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted">Histórico</span>
                  <ul className="mt-1.5 space-y-1">
                    {logEntries.map((e, i) => (
                      <li key={`${e.date}-${i}`} className="flex items-center gap-1.5 text-xs text-ink2">
                        <span className="text-emerald-600">✓</span>
                        <span>
                          {OPP_STATUS_LABELS[e.from] || e.from} → <span className="font-medium text-ink">{OPP_STATUS_LABELS[e.to] || e.to}</span>
                        </span>
                        <span className="ml-auto shrink-0 text-muted">{e.date}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {taskMsg && <span className="mr-auto text-xs text-emerald-600">{taskMsg}</span>}
              <button type="button" onClick={() => onEditFull(data)} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Editar completo</button>
              <button type="button" onClick={createTask} className="flex items-center gap-1 rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2"><CheckSquare className="h-4 w-4" /> Criar Tarefa</button>
              <button type="button" onClick={guard.requestClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>

    <ConfirmModal
      open={guard.confirming}
      title={DISCARD_TITLE}
      message="A nota editada ainda não foi salva. Deseja descartá-la?"
      confirmLabel={DISCARD_CONFIRM_LABEL}
      cancelLabel={DISCARD_CANCEL_LABEL}
      danger
      onConfirm={guard.confirmDiscard}
      onCancel={guard.cancelDiscard}
    />
    </>
  );
}

function SliderRow({ label, value, onCommit }) {
  const [v, setV] = useState(Number(value) || 3);
  useEffect(() => { setV(Number(value) || 3); }, [value]);
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink2">{label}</span>
        <span className="flex items-center gap-1 text-xs text-muted"><span className={`h-2.5 w-2.5 rounded-full ${priorityDot(v)}`} />{PRIORITY_LABELS[v] || v}</span>
      </div>
      <input
        type="range" min="1" max="5" step="1" value={v}
        onChange={(e) => setV(Number(e.target.value))}
        onMouseUp={() => onCommit(v)}
        onTouchEnd={() => onCommit(v)}
        className="mt-1 w-full accent-accent"
      />
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <div className="mt-0.5 text-ink">{value || '—'}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}

function OpportunityEditor({ mode, initial, orgs, people, users, onClose, onSaved }) {
  // Rascunho (v2.25.13): formulário + tags num único objeto persistido; os
  // setters locais preservam a assinatura antiga.
  const pristine = useMemo(() => ({
    form: initial, tagsText: (initial.tags || []).join(', '),
  }), [initial]);
  const {
    value: draft, setValue: setDraft, clearDraft, discardDraft, hasDraft,
  } = useDraft(`opportunity-${initial.id || 'new'}`, pristine);
  const form = draft.form;
  const tagsText = draft.tagsText;
  const setForm = (next) =>
    setDraft((d) => ({ ...d, form: typeof next === 'function' ? next(d.form) : next }));
  const setTagsText = (v) => setDraft((d) => ({ ...d, tagsText: v }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const isDirty = JSON.stringify(draft) !== JSON.stringify(pristine);
  const guard = useUnsavedGuard({ isDirty, onClose, onDiscard: discardDraft });

  const save = async () => {
    if (!form.title.trim()) { setError('Título é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        organization_id: form.organization_id || null,
        contact_id: form.contact_id || null,
        assigned_to: form.assigned_to || null,
        priority: Number(form.priority) || 3,
        fit_score: Number(form.fit_score) || 3,
        tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const saved = mode === 'create'
        ? await apiFetch('/api/career/opportunities', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch(`/api/career/opportunities/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      clearDraft();          // salvo no servidor: o rascunho não serve mais
      onSaved(saved.id);
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.13) — clicar fora não fecha mais o editor. */}
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{mode === 'create' ? 'Nova oportunidade' : 'Editar oportunidade'}</h2>
          <button onClick={guard.requestClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {hasDraft && <DraftBanner onDiscard={discardDraft} />}
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
          <Field label="Título *"><input value={form.title} onChange={(e) => set({ title: e.target.value })} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              {/* Trocar o tipo auto-seleciona a trilha sugerida; o select de
                  Trilha ao lado continua editável para sobrescrever. */}
              <select
                value={form.type}
                onChange={(e) => set({ type: e.target.value, track: trackForType(e.target.value) })}
                className="input"
              >
                {Object.entries(OPP_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Trilha">
              <select value={form.track} onChange={(e) => set({ track: e.target.value })} className="input">
                {Object.entries(TRACK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Organização">
            <select value={form.organization_id || ''} onChange={(e) => set({ organization_id: e.target.value })} className="input">
              <option value="">— Nenhuma —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Contato">
            <select value={form.contact_id || ''} onChange={(e) => set({ contact_id: e.target.value })} className="input">
              <option value="">— Nenhum —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Descrição"><textarea value={form.description || ''} onChange={(e) => set({ description: e.target.value })} className="input min-h-[60px]" /></Field>
          <Field label="Requisitos"><textarea value={form.requirements || ''} onChange={(e) => set({ requirements: e.target.value })} className="input min-h-[50px]" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Local"><input value={form.location || ''} onChange={(e) => set({ location: e.target.value })} className="input" /></Field>
            <Field label="Faixa salarial"><input value={form.salary_range || ''} onChange={(e) => set({ salary_range: e.target.value })} className="input" placeholder="€40k-50k" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prazo"><input value={form.deadline || ''} onChange={(e) => set({ deadline: e.target.value })} className="input" placeholder="2026-09-30" /></Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set({ status: e.target.value })} className="input">
                {OPP_STATUS_ORDER.map((s) => <option key={s} value={s}>{OPP_STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Prioridade: ${PRIORITY_LABELS[form.priority] || form.priority}`}>
              <input type="range" min="1" max="5" value={form.priority} onChange={(e) => set({ priority: Number(e.target.value) })} className="w-full accent-accent" />
            </Field>
            <Field label="Fit score">
              <StarRating value={form.fit_score} size={20} onChange={(v) => set({ fit_score: v || 1 })} />
            </Field>
          </div>
          <Field label="URL"><input value={form.url || ''} onChange={(e) => set({ url: e.target.value })} className="input" placeholder="https://" /></Field>
          <Field label="Responsável">
            <select value={form.assigned_to || ''} onChange={(e) => set({ assigned_to: e.target.value })} className="input">
              <option value="">— Ninguém —</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Field>
          <Field label="Tags (separadas por vírgula)"><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="input" /></Field>
          <Field label="Notas"><textarea value={form.notes || ''} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[60px]" /></Field>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button type="button" onClick={guard.requestClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>

    <ConfirmModal
      open={guard.confirming}
      title={DISCARD_TITLE}
      message={DISCARD_MESSAGE}
      confirmLabel={DISCARD_CONFIRM_LABEL}
      cancelLabel={DISCARD_CANCEL_LABEL}
      danger
      onConfirm={guard.confirmDiscard}
      onCancel={guard.cancelDiscard}
    />
    </>
  );
}
