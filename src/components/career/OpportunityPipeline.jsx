import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, X, ExternalLink, Loader2, Building2, User, CalendarClock, CheckSquare, Trash2,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import Avatar from '../shared/Avatar';
import ConfirmModal from '../shared/ConfirmModal';
import {
  StarRating, TrackBadge, OppTypeBadge, parseTags,
  PIPELINE_COLUMNS, TRACK_LABELS, OPP_TYPE_LABELS, OPP_STATUS_LABELS, OPP_STATUS_ORDER,
  trackColor, deadlineColor, daysUntil, priorityDot, PRIORITY_LABELS,
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

export default function OpportunityPipeline() {
  const opps = useStore((s) => s.careerOpportunities);
  const setOpps = useStore((s) => s.setCareerOpportunities);

  const [loading, setLoading] = useState(true);
  const [trackFilter, setTrackFilter] = useState('all');
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

  const filtered = useMemo(
    () => (trackFilter === 'all' ? opps : opps.filter((o) => o.track === trackFilter)),
    [opps, trackFilter],
  );

  // Por coluna: cards visíveis (sem EC) + cards com Extrair Conhecimento
  // ocultos por padrão — ambos os grupos ordenados pela mesma chave da coluna.
  const byColumn = useMemo(() => {
    const map = {};
    PIPELINE_COLUMNS.forEach((c) => {
      const items = filtered.filter((o) => columnKeyForStatus(o.status) === c.key);
      const sortKey = sortBy[c.key] || 'recent';
      const visible = sortOpps(items.filter((o) => !o.extract_knowledge), sortKey);
      const ecHidden = sortOpps(items.filter((o) => !!o.extract_knowledge), sortKey);
      map[c.key] = { visible, ecHidden, total: items.length };
    });
    return map;
  }, [filtered, sortBy]);

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

  // Liga/desliga o toggle "Extrair Conhecimento" de um card (otimista + PATCH).
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
      {/* Barra: filtro por trilha + nova oportunidade */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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

      {/* Kanban */}
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
                      📚 {ecHidden.length} em Extrair Conhecimento {expanded ? '▲' : '▼'}
                    </button>
                    {expanded && (
                      <>
                        <div className="flex items-center gap-2 py-0.5">
                          <div className="h-px flex-1 bg-line" />
                          <span className="text-[10px] font-medium uppercase tracking-wide text-muted">Extrair Conhecimento</span>
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

function OpportunityCard({ opp, assignee, dragging, onDragStart, onDragEnd, onClick, onToggleExtract, onDelete, onMove, deleting }) {
  const c = trackColor(opp.track);
  const days = daysUntil(opp.deadline);
  const extracting = !!opp.extract_knowledge;
  const currentCol = columnKeyForStatus(opp.status);
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
      className={`relative cursor-pointer rounded-lg border border-line p-2.5 shadow-sm transition hover:border-accent ${
        extracting ? 'bg-surface2' : 'bg-surface'
      }`}
    >
      {extracting && (
        <span className="absolute -right-1.5 -top-1.5 rounded-full bg-violet-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
          📚 Extraindo
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
      </div>
      {opp.organization_name && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Building2 className="h-3 w-3" />{opp.organization_name}
        </div>
      )}
      {opp.deadline && (
        <div className={`mt-1 flex items-center gap-1 text-[11px] ${deadlineColor(opp.deadline)}`}>
          <CalendarClock className="h-3 w-3" />
          {opp.deadline}{days !== null ? ` · ${days < 0 ? `${-days}d atrás` : `${days}d`}` : ''}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <StarRating value={opp.fit_score} size={12} />
        {assignee && <Avatar user={{ name: assignee.name, avatar: assignee.avatar }} size={20} />}
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleExtract(); }}
        className={`mt-1.5 flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition ${
          extracting ? 'bg-violet-600 text-white hover:opacity-90' : 'border border-line text-ink2 hover:bg-surface2'
        }`}
      >
        📚 Extrair Conhecimento
      </button>
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

function OpportunityModal({ id, orgs, onClose, onChanged, onEditFull }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [taskMsg, setTaskMsg] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/api/career/opportunities/${id}`);
      setData(d);
      setNotes(d.notes || '');
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
    if (!data || notes === (data.notes || '')) return;
    await patch({ notes });
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
        }),
      });
      setTaskMsg('Tarefa criada ✓');
    } catch {
      setTaskMsg('Falha ao criar tarefa');
    }
  };

  const days = data ? daysUntil(data.deadline) : null;
  const c = data ? trackColor(data.track) : trackColor('all');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[680px] overflow-y-auto rounded-xl bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
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
              <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
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
              <div className={`rounded-lg border px-3 py-2 text-sm ${data.deadline ? 'border-line' : 'border-dashed border-line'}`}>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Prazo</span>
                <div className={`mt-0.5 text-base ${deadlineColor(data.deadline)}`}>
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
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {taskMsg && <span className="mr-auto text-xs text-emerald-600">{taskMsg}</span>}
              <button type="button" onClick={() => onEditFull(data)} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Editar completo</button>
              <button type="button" onClick={createTask} className="flex items-center gap-1 rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2"><CheckSquare className="h-4 w-4" /> Criar Tarefa</button>
              <button type="button" onClick={onClose} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
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
  const [form, setForm] = useState(initial);
  const [tagsText, setTagsText] = useState((initial.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

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
      onSaved(saved.id);
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{mode === 'create' ? 'Nova oportunidade' : 'Editar oportunidade'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
          <Field label="Título *"><input value={form.title} onChange={(e) => set({ title: e.target.value })} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
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
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
