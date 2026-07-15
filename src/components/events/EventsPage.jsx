import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays, Plus, Upload, X, Loader2, ExternalLink, MapPin, Building2,
  CalendarClock, Globe, DollarSign, Flag, Trash2, Link2, ArrowRight, BookOpen,
  ChevronDown, ChevronRight, Search, Unlink,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import {
  StarRating, Badge, parseTags,
  EVENT_TYPE_LABELS, EVENT_TYPE_FILTERS, EventTypeBadge,
  AREA_LABELS, AREA_FILTERS, AreaBadge,
  EVENT_STATUS_LABELS, EVENT_STATUS_ORDER, EventStatusBadge,
  COST_LABELS, CostBadge, PHASE_FILTERS, PHASE_DESCRIPTIONS,
  VENUE_TYPE_LABELS, VenueTypeBadge, QuartileBadge, LINK_TYPE_LABELS,
  daysUntil, fmtDate, fmtDateRange, fmtBR, deadlineColor, urgencyColor,
} from './eventsShared';

const TABS = [
  { key: 'events', label: 'Eventos', icon: CalendarDays },
  { key: 'venues', label: 'Venues de Publicação', icon: BookOpen },
  { key: 'deadlines', label: 'Prazos', icon: CalendarClock },
];

export default function EventsPage() {
  const [tab, setTab] = useState('events');

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <CalendarDays className="h-6 w-6 text-accent" />
          Eventos &amp; Venues
        </h1>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === 'events' && <EventsTab />}
        {tab === 'venues' && <VenuesTab />}
        {tab === 'deadlines' && <DeadlinesTab />}
      </div>
    </div>
  );
}

// ===========================================================================
// TAB: Eventos
// ===========================================================================

const EMPTY_EVENT = {
  name: '', acronym: '', type: 'conference_academic', area: 'energy_systems',
  date_start: '', date_end: '', location: '', city: '', country: '', organizer: '',
  indexing: '', publication_route: '', relevance_phd: 3, relevance_spinoff: 3,
  relevance_networking: 3, cost_level: 'medium', peer_review: false, hybrid: false,
  deadline_abstract: '', deadline_paper: '', website: '', status: 'identified',
  strategic_phase: '', notes: '', tags: [],
};

function EventsTab() {
  const events = useStore((s) => s.careerEvents);
  const setEvents = useStore((s) => s.setCareerEvents);
  const filter = useStore((s) => s.eventsFilter);
  const setFilter = useStore((s) => s.setEventsFilter);

  const [loading, setLoading] = useState(true);
  const [venues, setVenues] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null); // { mode, form }
  const [importOpen, setImportOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const load = async () => {
    try {
      setEvents(await apiFetch('/api/events'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    apiFetch('/api/venues').then((r) => setVenues(r || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = (filter.search || '').trim().toLowerCase();
    return events.filter((e) => {
      if (filter.type !== 'all' && e.type !== filter.type) return false;
      if (filter.area !== 'all' && e.area !== filter.area) return false;
      if (filter.phase !== 'all' && String(e.strategic_phase) !== filter.phase) return false;
      if (filter.peerReview && !e.peer_review) return false;
      if (filter.upcoming) {
        const dS = daysUntil(e.date_start);
        const dA = daysUntil(e.deadline_abstract);
        const upcoming = (dS !== null && dS >= 0) || (dA !== null && dA >= 0);
        if (!upcoming) return false;
      }
      if (q) {
        const hay = `${e.name} ${e.acronym} ${e.organizer} ${e.notes}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [events, filter]);

  const afterSave = async (savedId) => {
    setEditor(null);
    await load();
    if (savedId) setSelectedId(savedId);
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando eventos..." /></div>;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Barra de ações */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={filter.search}
              onChange={(e) => setFilter({ search: e.target.value })}
              placeholder="Buscar eventos..."
              className="input pl-8"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2 sm:hidden"
          >
            Filtros {showFilters ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2"
          >
            <Upload className="h-4 w-4" /> Importar
          </button>
          <button
            type="button"
            onClick={() => setEditor({ mode: 'create', form: { ...EMPTY_EVENT } })}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Novo Evento
          </button>
        </div>
      </div>

      {/* Filtros (chips) */}
      <div className={`${showFilters ? 'block' : 'hidden'} space-y-2 sm:block`}>
        <ChipRow
          options={EVENT_TYPE_FILTERS}
          value={filter.type}
          onChange={(v) => setFilter({ type: v })}
        />
        <ChipRow
          options={AREA_FILTERS}
          value={filter.area}
          onChange={(v) => setFilter({ area: v })}
        />
        <div className="flex flex-wrap items-center gap-3">
          <ChipRow options={PHASE_FILTERS} value={filter.phase} onChange={(v) => setFilter({ phase: v })} small />
          <label className="flex items-center gap-1.5 text-xs text-ink2">
            <input type="checkbox" checked={filter.peerReview} onChange={(e) => setFilter({ peerReview: e.target.checked })} className="accent-accent" />
            Apenas peer-review
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ink2">
            <input type="checkbox" checked={filter.upcoming} onChange={(e) => setFilter({ upcoming: e.target.checked })} className="accent-accent" />
            Apenas próximos
          </label>
        </div>
      </div>

      {/* Dois painéis */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        {/* Lista (40%) */}
        <div className="col-span-1 min-h-0 overflow-y-auto lg:col-span-2">
          {filtered.length === 0 ? (
            <EmptyEvents onImport={() => setImportOpen(true)} />
          ) : (
            <div className="space-y-2">
              {filtered.map((e) => (
                <EventCard key={e.id} event={e} active={selectedId === e.id} onClick={() => setSelectedId(e.id)} />
              ))}
            </div>
          )}
        </div>

        {/* Detalhe (60%) */}
        <div className="col-span-1 min-h-0 overflow-y-auto lg:col-span-3">
          {selectedId ? (
            <EventDetail
              key={selectedId}
              id={selectedId}
              venues={venues}
              onChanged={load}
              onEditFull={(data) => setEditor({ mode: 'edit', form: { ...data, tags: parseTags(data.tags) } })}
              onDeleted={() => { setSelectedId(null); load(); }}
            />
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
              Selecione um evento para ver os detalhes
            </div>
          )}
        </div>
      </div>

      {editor && (
        <EventEditor
          mode={editor.mode}
          initial={editor.form}
          onClose={() => setEditor(null)}
          onSaved={afterSave}
        />
      )}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} onImported={() => { setImportOpen(false); load(); }} />}
    </div>
  );
}

function ChipRow({ options, value, onChange, small }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={`rounded-full px-3 py-1 ${small ? 'text-[11px]' : 'text-xs'} font-medium transition ${
              active ? 'bg-accent text-white' : 'border border-line bg-surface text-ink2 hover:bg-surface2'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function EventCard({ event, active, onClick }) {
  const dA = daysUntil(event.deadline_abstract);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border bg-surface p-3 text-left shadow-sm transition hover:border-accent ${
        active ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {event.acronym && <span className="text-base font-bold text-ink">{event.acronym}</span>}
          <div className={`truncate text-sm ${event.acronym ? 'text-muted' : 'font-semibold text-ink'}`}>{event.name}</div>
        </div>
        <EventStatusBadge status={event.status} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <EventTypeBadge type={event.type} />
        <AreaBadge area={event.area} />
        {event.peer_review && <Badge className="bg-green-100 text-green-700">✓ Peer-review</Badge>}
      </div>
      <div className="mt-1.5 flex items-center gap-1 text-xs text-ink2">
        <CalendarClock className="h-3 w-3" />
        {fmtDateRange(event.date_start, event.date_end)}
        {event.city && <span className="text-muted">· {event.city}</span>}
      </div>
      {event.deadline_abstract && dA !== null && dA >= 0 && dA < 60 && (
        <div className={`mt-1 flex items-center gap-1 text-[11px] ${deadlineColor(event.deadline_abstract)}`}>
          {dA < 30 && '⚠ '}Abstract: {fmtDate(event.deadline_abstract)}
        </div>
      )}
      <div className="mt-1.5">
        <StarRating value={event.relevance_phd} size={12} />
      </div>
    </button>
  );
}

function EmptyEvents({ onImport }) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line p-6 text-center">
      <p className="text-sm text-muted">
        Nenhum evento encontrado. Importe os eventos dos relatórios de pesquisa ou adicione manualmente.
      </p>
      <button
        type="button"
        onClick={onImport}
        className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        <Upload className="h-4 w-4" /> Importar Eventos
      </button>
    </div>
  );
}

// ---- Detalhe do evento ------------------------------------------------------

function EventDetail({ id, venues, onChanged, onEditFull, onDeleted }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [calMsg, setCalMsg] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const [pipelineOpen, setPipelineOpen] = useState(false);
  const [showIndex, setShowIndex] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/api/events/${id}`);
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
    await apiFetch(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    await reload();
    onChanged && onChanged();
  };

  const saveNotes = async () => {
    if (!data || notes === (data.notes || '')) return;
    await patch({ notes });
  };

  const addToCalendar = async (dateStr, label) => {
    if (!dateStr) return;
    setCalMsg('');
    // Evento all-day: fim exclusivo = dia seguinte.
    const start = dateStr.length === 7 ? `${dateStr}-01` : dateStr;
    const endDate = new Date(Date.parse(start) + 86400000).toISOString().slice(0, 10);
    try {
      await apiFetch('/api/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: `${label}: ${data.acronym || data.name}`,
          description: [data.name, data.website].filter(Boolean).join(' · '),
          start, end: endDate, all_day: true,
        }),
      });
      setCalMsg('Adicionado ao Google Calendar ✓');
    } catch (e) {
      const msg = String(e.message || e);
      setCalMsg(msg.includes('Autorize') ? 'Autorize o acesso ao Google Calendar primeiro' : 'Falha ao adicionar ao calendário');
    }
  };

  const delLink = async (linkId) => {
    await apiFetch(`/api/events/${id}/venues/${linkId}`, { method: 'DELETE' });
    await reload();
  };

  if (loading || !data) return <div className="rounded-xl border border-line bg-surface p-6"><LoadingSpinner label="Carregando..." /></div>;

  const hasUpcomingDeadline =
    (daysUntil(data.deadline_abstract) !== null && daysUntil(data.deadline_abstract) >= 0 && daysUntil(data.deadline_abstract) < 60) ||
    (daysUntil(data.deadline_paper) !== null && daysUntil(data.deadline_paper) >= 0 && daysUntil(data.deadline_paper) < 60);

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">{data.name}</h2>
          {data.acronym && <div className="text-sm font-semibold text-accent">{data.acronym}</div>}
        </div>
        <select
          value={data.status}
          onChange={(e) => patch({ status: e.target.value })}
          className="input w-auto text-sm"
        >
          {EVENT_STATUS_ORDER.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <EventTypeBadge type={data.type} />
        <AreaBadge area={data.area} />
        {data.peer_review && <Badge className="bg-green-100 text-green-700">✓ Peer-review</Badge>}
        {data.hybrid && <Badge className="bg-purple-100 text-purple-700">Híbrido</Badge>}
        <CostBadge level={data.cost_level} />
      </div>

      {parseTags(data.tags).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {parseTags(data.tags).map((t) => <span key={t} className="rounded bg-surface2 px-2 py-0.5 text-xs text-ink2">{t}</span>)}
        </div>
      )}

      {/* Grid de informações */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Info icon={CalendarClock} label="Datas">{fmtDateRange(data.date_start, data.date_end)}</Info>
        <Info icon={MapPin} label="Local">{[data.location, data.city, data.country].filter(Boolean).join(', ') || '—'}</Info>
        <Info icon={Building2} label="Organizador">{data.organizer || '—'}</Info>
        <Info icon={DollarSign} label="Custo estimado">{COST_LABELS[data.cost_level] || '—'}</Info>
        <Info icon={Globe} label="Website">
          {data.website ? (
            <a href={data.website.startsWith('http') ? data.website : `https://${data.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </a>
          ) : '—'}
        </Info>
        <Info icon={Flag} label="Fase estratégica">{data.strategic_phase ? `Fase ${data.strategic_phase}` : '—'}</Info>
      </div>

      {/* Prazos */}
      <div className={`mt-4 rounded-lg border p-3 ${hasUpcomingDeadline ? 'border-amber-300 bg-amber-50' : 'border-line'}`}>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Prazos</span>
        <div className="mt-1.5 space-y-2">
          <DeadlineRow icon="📝" label="Deadline abstract" date={data.deadline_abstract} onAdd={() => addToCalendar(data.deadline_abstract, 'Abstract')} />
          <DeadlineRow icon="📄" label="Deadline full paper" date={data.deadline_paper} onAdd={() => addToCalendar(data.deadline_paper, 'Full paper')} />
        </div>
        {calMsg && <p className="mt-2 text-xs text-emerald-600">{calMsg}</p>}
      </div>

      {/* Relevância */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <RelevanceCol label="🎓 PhD" value={data.relevance_phd} onChange={(v) => patch({ relevance_phd: v })} />
        <RelevanceCol label="🚀 Spin-off" value={data.relevance_spinoff} onChange={(v) => patch({ relevance_spinoff: v })} />
        <RelevanceCol label="🤝 Networking" value={data.relevance_networking} onChange={(v) => patch({ relevance_networking: v })} />
      </div>

      {/* Indexação & rota de publicação */}
      <div className="mt-4 rounded-lg border border-line">
        <button type="button" onClick={() => setShowIndex((v) => !v)} className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-ink2 hover:bg-surface2">
          <span>Indexação &amp; rota de publicação</span>
          {showIndex ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {showIndex && (
          <div className="space-y-3 border-t border-line px-3 py-3">
            <Info label="Indexação">{data.indexing || '—'}</Info>
            <Info label="Rota de publicação">{data.publication_route || '—'}</Info>
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Venues vinculados</span>
                <button type="button" onClick={() => setLinkOpen(true)} className="flex items-center gap-1 text-xs text-accent hover:underline">
                  <Link2 className="h-3.5 w-3.5" /> Vincular venue
                </button>
              </div>
              <div className="mt-1.5 space-y-1.5">
                {(data.venues || []).length === 0 && <p className="text-xs text-muted">Nenhum venue vinculado.</p>}
                {(data.venues || []).map((v) => (
                  <div key={v.link_id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {v.acronym ? `${v.acronym} — ` : ''}{v.name}
                      <span className="ml-1 text-xs text-muted">({LINK_TYPE_LABELS[v.link_type] || v.link_type})</span>
                    </span>
                    <button type="button" onClick={() => delLink(v.link_id)} className="shrink-0 text-muted hover:text-danger" title="Remover vínculo">
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notas */}
      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-ink2">Notas (salva ao sair do campo)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} className="input min-h-[80px]" />
      </label>

      {/* Fase estratégica (descrição) */}
      {data.strategic_phase && (
        <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
          {PHASE_DESCRIPTIONS[data.strategic_phase] || `Fase ${data.strategic_phase}`}
        </div>
      )}

      {/* Ações */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        {data.opportunity_id && data.opportunity ? (
          <button type="button" onClick={() => navigate('/career')} className="flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm text-accent hover:bg-surface2">
            Ver no Pipeline <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={() => setPipelineOpen(true)} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            Adicionar ao Pipeline de Carreira
          </button>
        )}
        <button type="button" onClick={() => onEditFull(data)} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
          Editar detalhes
        </button>
        <DeleteButton onDelete={async () => { await apiFetch(`/api/events/${id}`, { method: 'DELETE' }); onDeleted(); }} />
      </div>

      {linkOpen && (
        <LinkVenueModal
          eventId={id}
          venues={venues}
          existing={(data.venues || []).map((v) => v.id)}
          onClose={() => setLinkOpen(false)}
          onLinked={() => { setLinkOpen(false); reload(); }}
        />
      )}
      {pipelineOpen && (
        <PipelineModal
          event={data}
          onClose={() => setPipelineOpen(false)}
          onCreated={() => { setPipelineOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function Info({ icon: Icon, label, children }) {
  return (
    <div>
      <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
        {Icon && <Icon className="h-3.5 w-3.5" />}{label}
      </span>
      <div className="mt-0.5 text-sm text-ink">{children}</div>
    </div>
  );
}

function DeadlineRow({ icon, label, date, onAdd }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">
        <span className="mr-1">{icon}</span>
        <span className="text-ink2">{label}: </span>
        <span className={date ? deadlineColor(date) : 'text-muted'}>{date ? fmtBR(date) : 'Não definido'}</span>
      </span>
      {date && (
        <button type="button" onClick={onAdd} className="shrink-0 rounded border border-line px-2 py-0.5 text-[11px] text-accent hover:bg-surface2">
          + Google Calendar
        </button>
      )}
    </div>
  );
}

function RelevanceCol({ label, value, onChange }) {
  return (
    <div>
      <span className="text-xs font-medium text-ink2">{label}</span>
      <div className="mt-1"><StarRating value={value} size={18} onChange={(v) => onChange(v || 1)} /></div>
    </div>
  );
}

function DeleteButton({ onDelete }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm) {
    return (
      <span className="flex items-center gap-1">
        <button type="button" onClick={onDelete} className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90">Confirmar exclusão</button>
        <button type="button" onClick={() => setConfirm(false)} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setConfirm(true)} className="flex items-center gap-1 rounded-lg border border-danger/30 px-3 py-2 text-sm text-danger hover:bg-danger/10">
      <Trash2 className="h-4 w-4" /> Excluir
    </button>
  );
}

// ---- Vincular venue ---------------------------------------------------------

function LinkVenueModal({ eventId, venues, existing, onClose, onLinked }) {
  const [venueId, setVenueId] = useState('');
  const [linkType, setLinkType] = useState('proceedings');
  const [saving, setSaving] = useState(false);
  const available = venues.filter((v) => !existing.includes(v.id));

  const save = async () => {
    if (!venueId) return;
    setSaving(true);
    try {
      await apiFetch(`/api/events/${eventId}/venues`, {
        method: 'POST',
        body: JSON.stringify({ venue_id: venueId, link_type: linkType }),
      });
      onLinked();
    } catch {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Vincular venue" onClose={onClose} maxWidth={440}>
      <div className="space-y-3">
        <Field label="Venue">
          <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="input">
            <option value="">— Selecione —</option>
            {available.map((v) => <option key={v.id} value={v.id}>{v.acronym ? `${v.acronym} — ` : ''}{v.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo de vínculo">
          <select value={linkType} onChange={(e) => setLinkType(e.target.value)} className="input">
            {Object.entries(LINK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
        <button type="button" onClick={save} disabled={!venueId || saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Vincular
        </button>
      </div>
    </ModalShell>
  );
}

// ---- Pipeline de carreira ---------------------------------------------------

function PipelineModal({ event, onClose, onCreated }) {
  const [type, setType] = useState('collaboration');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    setSaving(true);
    setError('');
    try {
      const opp = await apiFetch('/api/career/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          title: event.acronym ? `${event.acronym} — ${event.name}` : event.name,
          type,
          track: 'phd',
          description: `Evento: ${event.name}`,
          location: [event.city, event.country].filter(Boolean).join(', '),
          deadline: event.deadline_abstract || '',
          url: event.website || '',
          status: 'identified',
        }),
      });
      // Vincula o evento à oportunidade criada.
      await apiFetch(`/api/events/${event.id}`, { method: 'PUT', body: JSON.stringify({ opportunity_id: opp.id }) });
      onCreated();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Adicionar ao Pipeline de Carreira" onClose={onClose} maxWidth={460}>
      <p className="text-sm text-ink2">
        Cria uma oportunidade de carreira vinculada a <span className="font-semibold">{event.acronym || event.name}</span>.
      </p>
      <div className="mt-3">
        <span className="mb-1 block text-xs font-medium text-ink2">Tipo</span>
        <div className="flex gap-2">
          {[{ k: 'collaboration', l: 'Colaboração' }, { k: 'grant', l: 'Publicação' }].map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setType(o.k)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                type === o.k ? 'border-accent bg-accent text-white' : 'border-line text-ink2 hover:bg-surface2'
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
        <button type="button" onClick={create} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Criar oportunidade
        </button>
      </div>
    </ModalShell>
  );
}

// ---- Editor completo de evento (drawer) -------------------------------------

function EventEditor({ mode, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [tagsText, setTagsText] = useState((initial.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        relevance_phd: Number(form.relevance_phd) || 3,
        relevance_spinoff: Number(form.relevance_spinoff) || 3,
        relevance_networking: Number(form.relevance_networking) || 3,
        tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const saved = mode === 'create'
        ? await apiFetch('/api/events', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch(`/api/events/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      onSaved(saved.id);
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <DrawerShell title={mode === 'create' ? 'Novo evento' : 'Editar evento'} onClose={onClose}>
      {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Field label="Nome *"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" /></Field></div>
        <Field label="Acrônimo"><input value={form.acronym} onChange={(e) => set({ acronym: e.target.value })} className="input" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo">
          <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
            {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Área">
          <select value={form.area} onChange={(e) => set({ area: e.target.value })} className="input">
            {Object.entries(AREA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data início"><input value={form.date_start} onChange={(e) => set({ date_start: e.target.value })} className="input" placeholder="2026-06-22" /></Field>
        <Field label="Data fim"><input value={form.date_end} onChange={(e) => set({ date_end: e.target.value })} className="input" placeholder="2026-06-26" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Local"><input value={form.location} onChange={(e) => set({ location: e.target.value })} className="input" /></Field>
        <Field label="Cidade"><input value={form.city} onChange={(e) => set({ city: e.target.value })} className="input" /></Field>
        <Field label="País"><input value={form.country} onChange={(e) => set({ country: e.target.value })} className="input" /></Field>
      </div>
      <Field label="Organizador"><input value={form.organizer} onChange={(e) => set({ organizer: e.target.value })} className="input" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Deadline abstract"><input value={form.deadline_abstract} onChange={(e) => set({ deadline_abstract: e.target.value })} className="input" placeholder="2026-03-15" /></Field>
        <Field label="Deadline full paper"><input value={form.deadline_paper} onChange={(e) => set({ deadline_paper: e.target.value })} className="input" placeholder="2026-04-30" /></Field>
      </div>
      <Field label="Website"><input value={form.website} onChange={(e) => set({ website: e.target.value })} className="input" placeholder="https://" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Indexação"><input value={form.indexing} onChange={(e) => set({ indexing: e.target.value })} className="input" placeholder="Scopus, IEEE..." /></Field>
        <Field label="Rota de publicação"><input value={form.publication_route} onChange={(e) => set({ publication_route: e.target.value })} className="input" /></Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Status">
          <select value={form.status} onChange={(e) => set({ status: e.target.value })} className="input">
            {EVENT_STATUS_ORDER.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Custo">
          <select value={form.cost_level} onChange={(e) => set({ cost_level: e.target.value })} className="input">
            {Object.entries(COST_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Fase estratégica">
          <select value={form.strategic_phase} onChange={(e) => set({ strategic_phase: e.target.value })} className="input">
            <option value="">—</option>
            <option value="1">Fase 1</option>
            <option value="2">Fase 2</option>
            <option value="3">Fase 3</option>
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 py-1">
        <label className="flex items-center gap-1.5 text-sm text-ink2">
          <input type="checkbox" checked={!!form.peer_review} onChange={(e) => set({ peer_review: e.target.checked })} className="accent-accent" /> Peer-review
        </label>
        <label className="flex items-center gap-1.5 text-sm text-ink2">
          <input type="checkbox" checked={!!form.hybrid} onChange={(e) => set({ hybrid: e.target.checked })} className="accent-accent" /> Híbrido
        </label>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Relevância PhD"><StarRating value={form.relevance_phd} size={18} onChange={(v) => set({ relevance_phd: v || 1 })} /></Field>
        <Field label="Relevância Spin-off"><StarRating value={form.relevance_spinoff} size={18} onChange={(v) => set({ relevance_spinoff: v || 1 })} /></Field>
        <Field label="Relevância Networking"><StarRating value={form.relevance_networking} size={18} onChange={(v) => set({ relevance_networking: v || 1 })} /></Field>
      </div>
      <Field label="Tags (separadas por vírgula)"><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="input" /></Field>
      <Field label="Notas"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[70px]" /></Field>
      <DrawerFooter onClose={onClose} onSave={save} saving={saving} />
    </DrawerShell>
  );
}

// ===========================================================================
// TAB: Venues de Publicação
// ===========================================================================

const EMPTY_VENUE = {
  name: '', acronym: '', publisher: '', type: 'journal', indexing: '',
  impact_factor: '', quartile: '', area: 'energy_systems', relevance_phd: 3,
  open_access: false, website: '', notes: '', tags: [],
};

function VenuesTab() {
  const venues = useStore((s) => s.publicationVenues);
  const setVenues = useStore((s) => s.setPublicationVenues);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [editor, setEditor] = useState(null);

  const load = async () => {
    try {
      setVenues(await apiFetch('/api/venues'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const afterSave = async (savedId) => {
    setEditor(null);
    await load();
    if (savedId) setSelectedId(savedId);
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando venues..." /></div>;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setEditor({ mode: 'create', form: { ...EMPTY_VENUE } })}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo Venue
        </button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="col-span-1 min-h-0 overflow-y-auto">
          {venues.length === 0 ? (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Nenhum venue cadastrado. Importe pela aba Eventos ou adicione manualmente.
            </div>
          ) : (
            <div className="space-y-2">
              {venues.map((v) => (
                <VenueCard key={v.id} venue={v} active={selectedId === v.id} onClick={() => setSelectedId(v.id)} />
              ))}
            </div>
          )}
        </div>
        <div className="col-span-1 min-h-0 overflow-y-auto lg:col-span-2">
          {selectedId ? (
            <VenueDetail
              key={selectedId}
              id={selectedId}
              onChanged={load}
              onEditFull={(data) => setEditor({ mode: 'edit', form: { ...data, tags: parseTags(data.tags), impact_factor: data.impact_factor ?? '' } })}
              onDeleted={() => { setSelectedId(null); load(); }}
            />
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
              Selecione um venue para ver os detalhes
            </div>
          )}
        </div>
      </div>

      {editor && (
        <VenueEditor mode={editor.mode} initial={editor.form} onClose={() => setEditor(null)} onSaved={afterSave} />
      )}
    </div>
  );
}

function VenueCard({ venue, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border bg-surface p-3 text-left shadow-sm transition hover:border-accent ${
        active ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-semibold text-ink">
          {venue.name}{venue.acronym ? <span className="ml-1 text-muted">({venue.acronym})</span> : ''}
        </span>
        {venue.open_access && <span title="Open access">🔓</span>}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {venue.publisher && <Badge className="bg-surface2 text-ink2">{venue.publisher}</Badge>}
        <VenueTypeBadge type={venue.type} />
        <QuartileBadge quartile={venue.quartile} />
        <AreaBadge area={venue.area} />
      </div>
      <div className="mt-1.5"><StarRating value={venue.relevance_phd} size={12} /></div>
    </button>
  );
}

function VenueDetail({ id, onChanged, onEditFull, onDeleted }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');

  const reload = async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/api/venues/${id}`);
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

  const saveNotes = async () => {
    if (!data || notes === (data.notes || '')) return;
    await apiFetch(`/api/venues/${id}`, { method: 'PUT', body: JSON.stringify({ notes }) });
    await reload();
    onChanged && onChanged();
  };

  if (loading || !data) return <div className="rounded-xl border border-line bg-surface p-6"><LoadingSpinner label="Carregando..." /></div>;

  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">{data.name}</h2>
          {data.acronym && <div className="text-sm font-semibold text-accent">{data.acronym}</div>}
        </div>
        {data.open_access && <Badge className="bg-green-100 text-green-700">🔓 Open Access</Badge>}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {data.publisher && <Badge className="bg-surface2 text-ink2">{data.publisher}</Badge>}
        <VenueTypeBadge type={data.type} />
        <QuartileBadge quartile={data.quartile} />
        <AreaBadge area={data.area} />
      </div>

      {parseTags(data.tags).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {parseTags(data.tags).map((t) => <span key={t} className="rounded bg-surface2 px-2 py-0.5 text-xs text-ink2">{t}</span>)}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Info label="Indexação">{data.indexing || '—'}</Info>
        <Info label="Impact factor">{data.impact_factor != null ? data.impact_factor : '—'}</Info>
        <Info label="Quartile">{data.quartile || '—'}</Info>
        <Info label="Open access">{data.open_access ? 'Sim' : 'Não'}</Info>
        <Info icon={Globe} label="Website">
          {data.website ? (
            <a href={data.website.startsWith('http') ? data.website : `https://${data.website}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> Abrir
            </a>
          ) : '—'}
        </Info>
        <Info label="Relevância PhD"><StarRating value={data.relevance_phd} size={16} /></Info>
      </div>

      {/* Eventos vinculados */}
      <div className="mt-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Eventos vinculados</span>
        <div className="mt-1.5 space-y-1.5">
          {(data.events || []).length === 0 && <p className="text-xs text-muted">Nenhum evento publica neste venue.</p>}
          {(data.events || []).map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-2 rounded border border-line px-2 py-1 text-sm">
              <span className="min-w-0 truncate text-ink">
                {e.acronym ? `${e.acronym} — ` : ''}{e.name}
                {e.date_start && <span className="ml-1 text-xs text-muted">· {fmtDate(e.date_start)}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted">{LINK_TYPE_LABELS[e.link_type] || e.link_type}</span>
            </div>
          ))}
        </div>
      </div>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs font-medium text-ink2">Notas (salva ao sair do campo)</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} className="input min-h-[70px]" />
      </label>

      <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
        <button type="button" onClick={() => onEditFull(data)} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">Editar detalhes</button>
        <DeleteButton onDelete={async () => { await apiFetch(`/api/venues/${id}`, { method: 'DELETE' }); onDeleted(); }} />
      </div>
    </div>
  );
}

function VenueEditor({ mode, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [tagsText, setTagsText] = useState((initial.tags || []).join(', '));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        relevance_phd: Number(form.relevance_phd) || 3,
        impact_factor: form.impact_factor === '' ? null : Number(form.impact_factor),
        tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const saved = mode === 'create'
        ? await apiFetch('/api/venues', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch(`/api/venues/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      onSaved(saved.id);
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <DrawerShell title={mode === 'create' ? 'Novo venue' : 'Editar venue'} onClose={onClose}>
      {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2"><Field label="Nome *"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" /></Field></div>
        <Field label="Acrônimo"><input value={form.acronym} onChange={(e) => set({ acronym: e.target.value })} className="input" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Publisher"><input value={form.publisher} onChange={(e) => set({ publisher: e.target.value })} className="input" /></Field>
        <Field label="Tipo">
          <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
            {Object.entries(VENUE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Indexação"><input value={form.indexing} onChange={(e) => set({ indexing: e.target.value })} className="input" placeholder="Scopus, WoS..." /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Impact factor"><input value={form.impact_factor} onChange={(e) => set({ impact_factor: e.target.value })} className="input" placeholder="7.2" /></Field>
        <Field label="Quartile">
          <select value={form.quartile} onChange={(e) => set({ quartile: e.target.value })} className="input">
            <option value="">—</option>
            <option value="Q1">Q1</option>
            <option value="Q2">Q2</option>
            <option value="Q3">Q3</option>
            <option value="Q4">Q4</option>
          </select>
        </Field>
        <Field label="Área">
          <select value={form.area} onChange={(e) => set({ area: e.target.value })} className="input">
            {Object.entries(AREA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Website"><input value={form.website} onChange={(e) => set({ website: e.target.value })} className="input" placeholder="https://" /></Field>
      <div className="flex items-center gap-4 py-1">
        <label className="flex items-center gap-1.5 text-sm text-ink2">
          <input type="checkbox" checked={!!form.open_access} onChange={(e) => set({ open_access: e.target.checked })} className="accent-accent" /> Open access
        </label>
        <Field label="Relevância PhD"><StarRating value={form.relevance_phd} size={18} onChange={(v) => set({ relevance_phd: v || 1 })} /></Field>
      </div>
      <Field label="Tags (separadas por vírgula)"><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="input" /></Field>
      <Field label="Notas"><textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} className="input min-h-[70px]" /></Field>
      <DrawerFooter onClose={onClose} onSave={save} saving={saving} />
    </DrawerShell>
  );
}

// ===========================================================================
// TAB: Prazos (timeline)
// ===========================================================================

function DeadlinesTab() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState('abstract'); // abstract | paper | event
  const [peerOnly, setPeerOnly] = useState(false);
  const [area, setArea] = useState('all');

  useEffect(() => {
    apiFetch('/api/events')
      .then((r) => setEvents(r || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const items = useMemo(() => {
    const dateField = kind === 'abstract' ? 'deadline_abstract' : kind === 'paper' ? 'deadline_paper' : 'date_start';
    const typeLabel = kind === 'abstract' ? 'Abstract' : kind === 'paper' ? 'Full paper' : 'Evento';
    return events
      .filter((e) => {
        if (peerOnly && !e.peer_review) return false;
        if (area !== 'all' && e.area !== area) return false;
        const d = daysUntil(e[dateField]);
        return d !== null && d >= 0 && d <= 90;
      })
      .map((e) => ({ ...e, _date: e[dateField], _days: daysUntil(e[dateField]), _typeLabel: typeLabel }))
      .sort((a, b) => a._days - b._days);
  }, [events, kind, peerOnly, area]);

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando prazos..." /></div>;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-ink">Próximos 90 dias</h2>
        <div className="flex gap-1 rounded-lg border border-line bg-surface p-1">
          {[{ k: 'abstract', l: 'Abstracts' }, { k: 'paper', l: 'Full Papers' }, { k: 'event', l: 'Datas dos Eventos' }].map((o) => (
            <button
              key={o.k}
              type="button"
              onClick={() => setKind(o.k)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${kind === o.k ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-ink2">
          <input type="checkbox" checked={peerOnly} onChange={(e) => setPeerOnly(e.target.checked)} className="accent-accent" /> Apenas peer-review
        </label>
        <select value={area} onChange={(e) => setArea(e.target.value)} className="input w-auto text-xs">
          <option value="all">Todas as áreas</option>
          {Object.entries(AREA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted">
            Nenhum prazo nos próximos 90 dias
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((e) => <DeadlineTimelineItem key={`${e.id}-${kind}`} event={e} onStatus={(s) => {
              apiFetch(`/api/events/${e.id}`, { method: 'PUT', body: JSON.stringify({ status: s }) })
                .then(() => setEvents((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: s } : x))))
                .catch(() => {});
            }} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function DeadlineTimelineItem({ event, onStatus }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
      <div className="w-24 shrink-0 text-center">
        <div className={`text-sm font-bold ${urgencyColor(event._days)}`}>{fmtBR(event._date)}</div>
        <div className="text-[11px] text-muted">em {event._days} dias</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-ink">{event.acronym || event.name}</span>
          <Badge className="bg-accent/10 text-accent">{event._typeLabel}</Badge>
          {event.peer_review && <Badge className="bg-green-100 text-green-700">✓</Badge>}
        </div>
        {event.acronym && <div className="truncate text-xs text-muted">{event.name}</div>}
      </div>
      <select
        value={event.status}
        onChange={(e) => onStatus(e.target.value)}
        className="input w-auto shrink-0 text-xs"
      >
        {EVENT_STATUS_ORDER.map((s) => <option key={s} value={s}>{EVENT_STATUS_LABELS[s]}</option>)}
      </select>
    </div>
  );
}

// ===========================================================================
// Import modal
// ===========================================================================

const IMPORT_EXAMPLE = `{
  "source_description": "Relatório de pesquisa H2 2026",
  "events": [
    {
      "name": "World Hydrogen Energy Conference 2026",
      "acronym": "WHEC 2026",
      "type": "conference_academic",
      "area": "hydrogen",
      "date_start": "2026-06-22",
      "date_end": "2026-06-26",
      "city": "Singapura",
      "country": "Singapura",
      "peer_review": true,
      "deadline_abstract": "2026-01-15",
      "strategic_phase": "2",
      "tags": ["h2", "conferência"]
    }
  ],
  "publication_venues": [
    {
      "name": "International Journal of Hydrogen Energy",
      "acronym": "IJHE",
      "publisher": "Elsevier",
      "type": "journal",
      "quartile": "Q1",
      "indexing": "Scopus, WoS",
      "area": "hydrogen"
    }
  ],
  "venue_links": [
    { "event_acronym": "WHEC 2026", "venue_acronym": "IJHE", "link_type": "special_issue" }
  ]
}`;

function ImportModal({ onClose, onImported }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [showHint, setShowHint] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const validate = () => {
    setError('');
    setResult(null);
    try {
      const parsed = JSON.parse(text);
      const events = parsed.events || [];
      const venues = parsed.publication_venues || [];
      if (!Array.isArray(events) || !Array.isArray(venues)) throw new Error('events e publication_venues devem ser arrays');
      setPreview({ parsed, events, venues });
    } catch (e) {
      setPreview(null);
      setError(`JSON inválido: ${String(e.message || e)}`);
    }
  };

  const doImport = async () => {
    if (!preview) return;
    setImporting(true);
    setError('');
    try {
      const res = await apiFetch('/api/events/import', { method: 'POST', body: JSON.stringify(preview.parsed) });
      setResult(res);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <ModalShell title="Importar Eventos e Venues" onClose={onClose} maxWidth={720}>
      <p className="text-sm text-muted">Cole o JSON de importação abaixo</p>

      <button type="button" onClick={() => setShowHint((v) => !v)} className="mt-2 flex items-center gap-1 text-xs text-accent hover:underline">
        {showHint ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} Ver formato de exemplo
      </button>
      {showHint && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-line bg-base p-3 text-[11px] leading-snug text-ink2">{IMPORT_EXAMPLE}</pre>
      )}

      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setPreview(null); setResult(null); }}
        placeholder='{ "events": [...], "publication_venues": [...] }'
        className="input mt-3 min-h-[200px] font-mono text-xs"
      />

      {error && <div className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

      {preview && !result && (
        <div className="mt-3 rounded-lg border border-line p-3">
          <p className="text-sm font-medium text-ink">
            {preview.events.length} eventos, {preview.venues.length} venues encontrados
          </p>
          <div className="mt-2 max-h-40 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr><th className="py-1 pr-2">Acrônimo</th><th className="py-1 pr-2">Nome</th><th className="py-1 pr-2">Tipo</th><th className="py-1">Data</th></tr>
              </thead>
              <tbody>
                {preview.events.slice(0, 40).map((e, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1 pr-2 font-medium text-ink">{e.acronym || '—'}</td>
                    <td className="py-1 pr-2 text-ink2">{e.name}</td>
                    <td className="py-1 pr-2 text-muted">{EVENT_TYPE_LABELS[e.type] || e.type || '—'}</td>
                    <td className="py-1 text-muted">{e.date_start || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Importação concluída: {result.events_imported} eventos e {result.venues_imported} venues.
          {result.errors && result.errors.length > 0 && (
            <div className="mt-1 text-xs text-amber-700">{result.errors.length} aviso(s): {result.errors.slice(0, 3).map((x) => x.item).join(', ')}…</div>
          )}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">
          {result ? 'Fechar' : 'Cancelar'}
        </button>
        {result ? (
          <button type="button" onClick={onImported} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90">Concluir</button>
        ) : preview ? (
          <button type="button" onClick={doImport} disabled={importing} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {importing && <Loader2 className="h-4 w-4 animate-spin" />} Importar
          </button>
        ) : (
          <button type="button" onClick={validate} disabled={!text.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">Validar</button>
        )}
      </div>
    </ModalShell>
  );
}

// ===========================================================================
// Shells reutilizáveis (modal centralizado + drawer lateral)
// ===========================================================================

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}

function ModalShell({ title, onClose, maxWidth = 560, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-xl bg-surface p-5 shadow-soft" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DrawerShell({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">{children}</div>
      </div>
    </div>
  );
}

function DrawerFooter({ onClose, onSave, saving }) {
  return (
    <div className="sticky bottom-0 -mx-4 mt-2 flex justify-end gap-2 border-t border-line bg-surface px-4 py-3">
      <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
      <button type="button" onClick={onSave} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
        {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
      </button>
    </div>
  );
}
