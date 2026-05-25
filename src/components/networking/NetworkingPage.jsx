import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Network, Plus, Pencil, Trash2, Search, Star, X, Mail, Phone, Linkedin,
  Building2, User, Link as LinkIcon, Map, List as ListIcon,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';

const INSTITUTION_TYPES = [
  ['company', 'Empresa'],
  ['university', 'Universidade'],
  ['ngo', 'ONG'],
  ['government', 'Governo'],
  ['other', 'Outro'],
];

const ENTITY_TYPE_LABELS = {
  area: 'Área', project: 'Projeto', front: 'Frente', task: 'Tarefa',
};

const NETWORKING_AREA = {
  name: 'Networking',
  color: '#0EA5E9',
  description: 'Pessoas, instituições e oportunidades.',
  projects: [
    { name: 'Presença Digital e Profissional', fronts: ['CV e Documentos', 'Cartão NFC', 'LinkedIn', 'C. Lattes', 'ResearchGate'] },
    { name: 'Mapeamento de Pessoas', fronts: ['Lista de pessoas relevantes', 'Conexões estratégicas'] },
    { name: 'Radar de Vagas — Hidrogênio', fronts: ['LinkedIn', 'ResearchGate', 'Outros canais'] },
    { name: 'Vagas Holanda', fronts: ['LinkedIn', 'Portais especializados', 'Divulgação'] },
    { name: 'Start up EngD', fronts: ['Planejamento', 'Conexões', 'Recursos'] },
  ],
};

// Indigo scale for person-to-person strength (0-10). Used for node strokes and
// connection line color.
function personStrengthColor(s) {
  const v = Math.max(0, Math.min(10, Number(s) || 0));
  if (v <= 2) return '#E5E7EB';
  if (v <= 4) return '#A5B4FC';
  if (v <= 6) return '#6366F1';
  if (v <= 8) return '#4338CA';
  return '#1E1B4B';
}
function institutionStrengthColor(s) {
  const v = Math.max(0, Math.min(10, Number(s) || 0));
  if (v <= 2) return '#FEF3C7';
  if (v <= 5) return '#FCD34D';
  if (v <= 8) return '#F59E0B';
  return '#B45309';
}

export default function NetworkingPage() {
  const people = useStore((s) => s.networkPeople);
  const setPeople = useStore((s) => s.setNetworkPeople);
  const institutions = useStore((s) => s.networkInstitutions);
  const setInstitutions = useStore((s) => s.setNetworkInstitutions);
  const connections = useStore((s) => s.networkConnections);
  const setConnections = useStore((s) => s.setNetworkConnections);
  const bridgeStatus = useStore((s) => s.bridgeSyncStatus);
  const setBridgeStatus = useStore((s) => s.setBridgeSyncStatus);
  const areas = useStore((s) => s.areas);
  const setAreas = useStore((s) => s.setAreas);
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const fronts = useStore((s) => s.fronts);
  const setFronts = useStore((s) => s.setFronts);
  const tasksInStore = useStore((s) => s.tasks);
  const setTasks = useStore((s) => s.setTasks);

  const [view, setView] = useState('list');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [personRoles, setPersonRoles] = useState([]); // flattened roles for the graph

  const loadAll = async () => {
    try {
      const [routes, st, ar, pr, fr, ts] = await Promise.all([
        apiFetch('/api/network/routes').catch(() => ({ people: [], institutions: [], connections: [], person_roles: [] })),
        apiFetch('/api/bridge/sync-status').catch(() => null),
        apiFetch('/api/areas').catch(() => []),
        apiFetch('/api/projects').catch(() => []),
        apiFetch('/api/fronts').catch(() => []),
        tasksInStore.length === 0 ? apiFetch('/api/tasks').catch(() => []) : Promise.resolve(tasksInStore),
      ]);
      setPeople(routes.people || []);
      setInstitutions(routes.institutions || []);
      setConnections(routes.connections || []);
      setPersonRoles(routes.person_roles || []);
      if (st) setBridgeStatus(st);
      if (ar) setAreas(ar);
      if (pr) setProjects(pr);
      if (fr) setFronts(fr);
      if (ts && tasksInStore.length === 0) setTasks(ts);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-seed "Networking" area + 5 projects + 15 frentes on first visit.
  useEffect(() => {
    if (loading || seeding) return;
    if (areas.find((a) => a.name === NETWORKING_AREA.name)) return;
    (async () => {
      setSeeding(true);
      try {
        const area = await apiFetch('/api/areas', {
          method: 'POST',
          body: JSON.stringify({
            name: NETWORKING_AREA.name,
            color: NETWORKING_AREA.color,
            description: NETWORKING_AREA.description,
          }),
        });
        for (const p of NETWORKING_AREA.projects) {
          // eslint-disable-next-line no-await-in-loop
          const project = await apiFetch('/api/projects', {
            method: 'POST',
            body: JSON.stringify({ name: p.name, color: NETWORKING_AREA.color, area_id: area.id }),
          });
          for (const fname of p.fronts) {
            // eslint-disable-next-line no-await-in-loop
            await apiFetch('/api/fronts', {
              method: 'POST',
              body: JSON.stringify({ name: fname, project_id: project.id, color: NETWORKING_AREA.color }),
            });
          }
        }
        const [ar2, pr2, fr2] = await Promise.all([apiFetch('/api/areas'), apiFetch('/api/projects'), apiFetch('/api/fronts')]);
        setAreas(ar2 || []); setProjects(pr2 || []); setFronts(fr2 || []);
      } catch { /* tolerate */ }
      finally { setSeeding(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, areas]);

  const allTags = useMemo(() => {
    const s = new Set();
    people.forEach((p) => (p.tags || []).forEach((t) => s.add(t)));
    institutions.forEach((i) => (i.tags || []).forEach((t) => s.add(t)));
    return [...s];
  }, [people, institutions]);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    let all = [];
    if (filter === 'all' || filter === 'people') {
      all = all.concat(people.map((p) => ({ ...p, _kind: 'person' })));
    }
    if (filter === 'all' || filter === 'institutions') {
      all = all.concat(institutions.map((i) => ({ ...i, _kind: 'institution' })));
    }
    return all.filter((it) => {
      if (tagFilter && !(it.tags || []).includes(tagFilter)) return false;
      if (q) {
        const roleStr = it._kind === 'person' && it.roles
          ? it.roles.map((r) => `${r.role} ${r.institution_name}`).join(' ')
          : '';
        const hay = `${it.name} ${it.role || ''} ${it.institution || ''} ${it.area || ''} ${roleStr}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [people, institutions, filter, search, tagFilter]);

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    return selected.kind === 'person'
      ? people.find((p) => p.id === selected.id)
      : institutions.find((i) => i.id === selected.id);
  }, [selected, people, institutions]);

  const removeItem = async (kind, id) => {
    const label = kind === 'person' ? 'esta pessoa' : 'esta instituição';
    if (!window.confirm(`Excluir ${label}?`)) return;
    const path = kind === 'person' ? `/api/network/people/${id}` : `/api/network/institutions/${id}`;
    await apiFetch(path, { method: 'DELETE' });
    setSelected(null);
    loadAll();
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando networking..." /></div>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Network className="h-6 w-6 text-accent" />
          Networking
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <BridgeBadge status={bridgeStatus} />
          <div className="flex overflow-hidden rounded-lg border border-line">
            <button onClick={() => setView('list')} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}>
              <ListIcon className="h-3.5 w-3.5" /> Lista
            </button>
            <button onClick={() => setView('map')} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'map' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}>
              <Map className="h-3.5 w-3.5" /> Mapa
            </button>
          </div>
          <button
            onClick={() => setEditor({ kind: 'person', mode: 'create', payload: emptyPerson() })}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" /> Pessoa
          </button>
          <button
            onClick={() => setEditor({ kind: 'institution', mode: 'create', payload: emptyInstitution() })}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink2 hover:bg-surface2"
          >
            <Plus className="h-3.5 w-3.5" /> Instituição
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          <div className="flex w-full min-w-0 flex-col md:w-[35%]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pessoas/instituições..." className="input pl-8" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Todos</Chip>
              <Chip active={filter === 'people'} onClick={() => setFilter('people')}>Pessoas</Chip>
              <Chip active={filter === 'institutions'} onClick={() => setFilter('institutions')}>Instituições</Chip>
            </div>
            {allTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {allTags.map((t) => (
                  <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} className={`rounded-full px-2 py-0.5 text-[11px] ${tagFilter === t ? 'bg-accent text-white' : 'bg-surface2 text-ink2'}`}>
                    #{t}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-2">
              {items.length === 0 ? (
                <p className="mt-6 text-center text-sm text-muted">Nenhum registro.</p>
              ) : items.map((it) => (
                // role=button (not a native <button>) so the inline Edit/Delete
                // actions can be real buttons inside without violating HTML
                // nesting and so they get their own click handlers.
                <div
                  key={`${it._kind}-${it.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected({ kind: it._kind, id: it.id })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected({ kind: it._kind, id: it.id });
                    }
                  }}
                  className={`group flex w-full cursor-pointer items-start gap-2 rounded-lg border bg-surface p-2.5 text-left transition hover:border-accent ${selected?.id === it.id ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ background: it._kind === 'person' ? '#6366f1' : '#F59E0B' }}
                  >
                    {(it.name || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-ink">{it.name}</span>
                      {it._kind === 'person' && it.lifegame_person_id && (
                        <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">LG</span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-ink2">
                      {it._kind === 'person'
                        ? subtitleForPerson(it)
                        : INSTITUTION_TYPES.find(([t]) => t === it.type)?.[1] || 'Instituição'}
                    </p>
                    {it._kind === 'person' && <StrengthDots value={it.connection_strength || 0} />}
                  </div>
                  {/* Inline actions — sempre visíveis no mobile, no hover no desktop */}
                  <div className="flex shrink-0 flex-col gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditor({ kind: it._kind, mode: 'edit', payload: { ...it } });
                      }}
                      title={it._kind === 'person' ? 'Editar pessoa' : 'Editar instituição'}
                      className="rounded-md border border-line p-1 text-ink2 transition hover:bg-surface2 hover:text-ink"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeItem(it._kind, it.id);
                      }}
                      title={it._kind === 'person' ? 'Excluir pessoa' : 'Excluir instituição'}
                      className="rounded-md border border-line p-1 text-danger transition hover:bg-danger/10"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="hidden min-w-0 flex-1 md:flex">
            {selectedItem ? (
              <DetailPanel
                item={selectedItem}
                kind={selected.kind}
                people={people}
                connections={connections}
                onEdit={() => setEditor({ kind: selected.kind, mode: 'edit', payload: { ...selectedItem } })}
                onDelete={() => removeItem(selected.kind, selectedItem.id)}
                onReloadConnections={() => apiFetch('/api/network/connections').then(setConnections)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-line bg-surface text-sm text-muted">
                Selecione alguém para ver os detalhes
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 min-h-0 flex-1">
          <NetworkMap
            people={people}
            institutions={institutions}
            connections={connections}
            personRoles={personRoles}
            onSelect={(kind, id) => { setView('list'); setSelected({ kind, id }); }}
          />
        </div>
      )}

      {editor && (
        <NetworkEditor
          editor={editor}
          institutions={institutions}
          people={people}
          areas={areas}
          projects={projects}
          fronts={fronts}
          tasks={tasksInStore}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); loadAll(); }}
        />
      )}
    </div>
  );
}

function subtitleForPerson(p) {
  if (p.roles && p.roles.length > 0) {
    const current = p.roles.find((r) => r.current) || p.roles[0];
    return [current.role, current.institution_name].filter(Boolean).join(' @ ') || 'Pessoa';
  }
  return [p.role, p.institution].filter(Boolean).join(' · ') || 'Pessoa';
}

function emptyPerson() {
  return {
    name: '', type: 'person', institution: '', role: '', area_of_work: '',
    email: '', phone: '', linkedin: '', notes: '',
    connection_to_lauro: '', connection_strength: 5,
    tags: [], lifegame_person_id: '',
    roles: [{ role: '', institution_id: '', institution_name: '', start_date: '', end_date: '', current: true }],
    entity_links: [],
  };
}
function emptyInstitution() {
  return { name: '', type: 'company', area: '', website: '', linkedin: '', notes: '', tags: [] };
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${active ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'}`}
    >{children}</button>
  );
}

function StrengthDots({ value }) {
  const max = 10;
  return (
    <div className="mt-1 flex gap-0.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <span key={n} className="h-1.5 w-1.5 rounded-full" style={{ background: n <= value ? personStrengthColor(value) : '#E8E3DB' }} />
      ))}
    </div>
  );
}

function BridgeBadge({ status }) {
  let dot = '#9E9890';
  let label = 'Lifegame não conectado';
  if (status && status.synced) { dot = '#22C55E'; label = 'Sincronizado com Lifegame'; }
  else if (status && status.bridgeConfigured === false) { dot = '#9E9890'; label = 'Lifegame não conectado'; }
  else if (status) { dot = '#F59E0B'; label = 'Sincronização pendente'; }
  return (
    <a href="/settings" className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink2 hover:bg-surface2">
      <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
      {label}
    </a>
  );
}

function DetailPanel({ item, kind, people, connections, onEdit, onDelete, onReloadConnections }) {
  const isPerson = kind === 'person';
  const linked = useMemo(() => {
    if (!isPerson) return [];
    return connections
      .filter((c) => c.person_a_id === item.id || c.person_b_id === item.id)
      .map((c) => {
        const otherId = c.person_a_id === item.id ? c.person_b_id : c.person_a_id;
        return { conn: c, other: people.find((p) => p.id === otherId) };
      })
      .filter((x) => x.other);
  }, [isPerson, connections, item.id, people]);

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto rounded-xl border border-line bg-surface">
      <div className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: isPerson ? '#6366f1' : '#F59E0B' }}>
              {(item.name || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-ink">{item.name}</h2>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink2">
                  {isPerson ? 'Pessoa' : (INSTITUTION_TYPES.find(([t]) => t === item.type)?.[1] || 'Instituição')}
                </span>
              </div>
              {!isPerson && (
                <p className="text-xs text-ink2">{[item.area].filter(Boolean).join(' · ')}</p>
              )}
              {isPerson && item.lifegame_person_id && (
                <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  Sincronizado com Lifegame
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={onEdit} className="rounded-md border border-line p-1.5 text-ink2 hover:bg-surface2"><Pencil className="h-3.5 w-3.5" /></button>
            <button onClick={onDelete} className="rounded-md border border-line p-1.5 text-danger hover:bg-danger/10"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {isPerson && item.roles && item.roles.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-muted">Funções e Vínculos</p>
            <div className="flex flex-wrap gap-1.5">
              {item.roles.map((r) => (
                <span key={r.id || `${r.role}-${r.institution_name}`} className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${r.current ? 'bg-accent/10 text-accent' : 'bg-surface2 text-ink2'}`}>
                  <span className="font-medium">{r.role}</span>
                  {r.institution_name && <span>@ {r.institution_name}</span>}
                  {r.current ? (
                    <span className="ml-1 text-[9px] uppercase opacity-75">(atual)</span>
                  ) : (r.start_date || r.end_date) ? (
                    <span className="ml-1 text-[9px] opacity-75">
                      ({(r.start_date || '?').slice(0, 7)}–{(r.end_date || '?').slice(0, 7)})
                    </span>
                  ) : null}
                </span>
              ))}
            </div>
          </div>
        )}

        {isPerson && (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const on = n <= (item.connection_strength || 0);
              return (
                <span key={n} className="h-2 w-2 rounded-full" style={{ background: on ? personStrengthColor(item.connection_strength || 0) : '#E8E3DB' }} />
              );
            })}
            <span className="ml-2 text-xs text-ink2">Conexão {item.connection_strength || 0}/10</span>
          </div>
        )}

        {(item.email || item.phone || item.linkedin || item.website) && (
          <div className="space-y-1.5 text-sm">
            {item.email && <a href={`mailto:${item.email}`} className="flex items-center gap-2 text-ink hover:text-accent"><Mail className="h-3.5 w-3.5 text-muted" /> {item.email}</a>}
            {item.phone && <a href={`tel:${item.phone}`} className="flex items-center gap-2 text-ink hover:text-accent"><Phone className="h-3.5 w-3.5 text-muted" /> {item.phone}</a>}
            {item.linkedin && <a href={item.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink hover:text-accent"><Linkedin className="h-3.5 w-3.5 text-muted" /> {item.linkedin}</a>}
            {item.website && <a href={item.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink hover:text-accent"><LinkIcon className="h-3.5 w-3.5 text-muted" /> {item.website}</a>}
          </div>
        )}

        {isPerson && item.connection_to_lauro && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted">Conexão com Lauro</p>
            <p className="whitespace-pre-wrap text-sm text-ink">{item.connection_to_lauro}</p>
          </div>
        )}

        {isPerson && item.entity_links && item.entity_links.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase text-muted">Vinculações no AIDE</p>
            <div className="flex flex-wrap gap-1.5">
              {item.entity_links.map((l) => (
                <a
                  key={l.id || `${l.entity_type}-${l.entity_id}`}
                  href={l.entity_type === 'task' ? '/tasks' : '/areas'}
                  className="flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2 hover:bg-accent/10 hover:text-accent"
                  title={l.notes || ''}
                >
                  → {ENTITY_TYPE_LABELS[l.entity_type] || l.entity_type}: {l.entity_name || l.entity_id}
                </a>
              ))}
            </div>
          </div>
        )}

        {item.notes && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted">Notas</p>
            <p className="whitespace-pre-wrap text-sm text-ink">{item.notes}</p>
          </div>
        )}

        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {item.tags.map((t) => (
              <span key={t} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2">#{t}</span>
            ))}
          </div>
        )}

        {isPerson && linked.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted">Conexões</p>
            <ul className="space-y-1">
              {linked.map(({ conn, other }) => (
                <li key={conn.id} className="flex items-center justify-between gap-2 rounded-md bg-surface2 px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-ink">{other.name}</span>
                    {conn.connection_type && <span className="ml-2 text-[11px] text-ink2">— {conn.connection_type}</span>}
                  </div>
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/network/connections/${conn.id}`, { method: 'DELETE' });
                      onReloadConnections();
                    }}
                    className="text-muted hover:text-danger"
                  ><X className="h-3 w-3" /></button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// SVG map with strength-coded edges, institution rectangles, and click-to-
// highlight. Layout is a fixed circle around Lauro; no physics so the picture
// stays stable across re-renders.
function NetworkMap({ people, institutions, connections, personRoles, onSelect }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  const [focusId, setFocusId] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const r = containerRef.current.getBoundingClientRect();
      setSize({ w: Math.max(500, r.width), h: Math.max(450, r.height) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const lauroPos = { x: size.w / 2, y: size.h / 2 };

  // Stable circular layout: people on the outer ring, institutions on a
  // smaller inner ring. Order is the array order (already sorted by name).
  const personNodes = useMemo(() => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const r = Math.min(size.w, size.h) * 0.4;
    return people.map((p, i) => {
      const angle = (i / Math.max(1, people.length)) * Math.PI * 2;
      const radius = 14 + Math.min(15, (p.connection_strength || 0) * 1.5);
      return {
        ...p, _kind: 'person',
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        radius,
      };
    });
  }, [people, size]);

  const institutionNodes = useMemo(() => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const r = Math.min(size.w, size.h) * 0.22;
    return institutions.map((it, i) => {
      const angle = (i / Math.max(1, institutions.length)) * Math.PI * 2 + Math.PI / 4;
      const strength = (it.connection_strength) || 5; // institutions don't have a stored strength yet
      const width = 80 + Math.min(40, strength * 2);
      return {
        ...it, _kind: 'institution',
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
        width, height: 28,
      };
    });
  }, [institutions, size]);

  const nodeIndex = useMemo(() => {
    const m = {};
    personNodes.forEach((n) => { m[n.id] = n; });
    institutionNodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [personNodes, institutionNodes]);

  // Group p2p connections by unordered pair for curve offsets when multiple
  // edges exist between the same two people.
  const connWithCurve = useMemo(() => {
    const seenByPair = new Map();
    return connections.map((c) => {
      const key = [c.person_a_id, c.person_b_id].sort().join('|');
      const seen = seenByPair.get(key) || 0;
      seenByPair.set(key, seen + 1);
      return { ...c, _curveIndex: seen };
    });
  }, [connections]);

  const isDimmed = (id) => focusId && focusId !== id && !connectsTo(focusId, id, connections, personRoles);

  return (
    <div ref={containerRef} className="relative h-full w-full rounded-xl border border-line bg-surface">
      <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} style={{ display: 'block' }}>
        {/* Person ↔ Institution dashed links (from person_roles) */}
        {personRoles.filter((r) => r.institution_id).map((r, i) => {
          const a = nodeIndex[r.person_id];
          const b = nodeIndex[r.institution_id];
          if (!a || !b) return null;
          const dim = isDimmed(r.person_id) && isDimmed(r.institution_id);
          return (
            <line
              key={`pr-${i}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#9CA3AF" strokeWidth="1.2" strokeDasharray="4 4"
              opacity={dim ? 0.15 : 0.7}
            >
              <title>{r.role}</title>
            </line>
          );
        })}

        {/* P2P connections — strength-coded color and width, curved if pair has >1 */}
        {connWithCurve.map((c) => {
          const a = nodeIndex[c.person_a_id];
          const b = nodeIndex[c.person_b_id];
          if (!a || !b) return null;
          const strength = c.strength != null ? c.strength : 5;
          const stroke = personStrengthColor(strength);
          const width = 1 + (strength / 10) * 3;
          const dim = isDimmed(c.person_a_id) && isDimmed(c.person_b_id);
          if (c._curveIndex === 0) {
            return (
              <line key={c.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={width} opacity={dim ? 0.15 : 0.85}>
                <title>{c.connection_type || 'conexão'}</title>
              </line>
            );
          }
          // Curved path for additional connections
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const offset = c._curveIndex * 14;
          const cx = mx + (-dy / len) * offset;
          const cy = my + (dx / len) * offset;
          return (
            <path key={c.id} d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`} fill="none" stroke={stroke} strokeWidth={width} opacity={dim ? 0.15 : 0.85}>
              <title>{c.connection_type || 'conexão'}</title>
            </path>
          );
        })}

        {/* Faint guides from Lauro to every person */}
        {personNodes.map((n) => (
          <line
            key={`lauro-${n.id}`} x1={lauroPos.x} y1={lauroPos.y} x2={n.x} y2={n.y}
            stroke="#F3F0EB" strokeWidth="1" strokeDasharray="2 5"
            opacity={isDimmed(n.id) ? 0.05 : 0.4}
          />
        ))}

        {/* Lauro centered with gold border */}
        <g style={{ cursor: 'default' }}>
          <circle cx={lauroPos.x} cy={lauroPos.y} r={30} fill="#1A1814" stroke="#F59E0B" strokeWidth="4" />
          <text x={lauroPos.x} y={lauroPos.y + 5} textAnchor="middle" fill="#FFFFFF" fontSize="14" fontWeight="700">L</text>
        </g>

        {/* Institution rectangles */}
        {institutionNodes.map((n) => {
          const fill = institutionStrengthColor(5);
          const dim = isDimmed(n.id);
          return (
            <g key={`inst-${n.id}`} style={{ cursor: 'pointer' }} onClick={() => { setFocusId(focusId === n.id ? null : n.id); onSelect && onSelect('institution', n.id); }}>
              <rect
                x={n.x - n.width / 2} y={n.y - n.height / 2} width={n.width} height={n.height}
                rx={6} fill={fill} stroke="#B45309" strokeWidth={2}
                opacity={dim ? 0.3 : 1}
              />
              <text x={n.x} y={n.y + 4} textAnchor="middle" fill="#1A1814" fontSize="11" fontWeight="600" opacity={dim ? 0.5 : 1}>
                {truncate(n.name, Math.max(8, Math.floor(n.width / 7)))}
              </text>
            </g>
          );
        })}

        {/* Person circles */}
        {personNodes.map((n) => {
          const stroke = personStrengthColor(n.connection_strength || 0);
          const dim = isDimmed(n.id);
          const labelOpacity = dim ? 0.25 : Math.max(0.5, Math.min(1, (n.connection_strength || 0) / 10 + 0.3));
          return (
            <g key={`p-${n.id}`} style={{ cursor: 'pointer' }} onClick={() => { setFocusId(focusId === n.id ? null : n.id); onSelect && onSelect('person', n.id); }}>
              <circle cx={n.x} cy={n.y} r={n.radius} fill="#6366f1" stroke={stroke} strokeWidth="3" opacity={dim ? 0.3 : 1} />
              <text x={n.x} y={n.y + n.radius + 12} textAnchor="middle" fill="#1A1814" fontSize="11" opacity={labelOpacity}>
                {(n.name || '').split(' ')[0]}
              </text>
            </g>
          );
        })}

        {personNodes.length === 0 && institutionNodes.length === 0 && (
          <text x={size.w / 2} y={size.h / 2 + 60} textAnchor="middle" fill="#9E9890" fontSize="12">
            Adicione pessoas e instituições para visualizar o mapa.
          </text>
        )}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 max-w-xs rounded-lg border border-line bg-surface/95 p-3 text-[10px] text-ink2 shadow-soft backdrop-blur">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-ink">Força (0–10)</p>
        <div className="mb-2 flex items-center gap-1">
          {[1, 3, 5, 7, 9].map((n) => (
            <span key={n} className="h-2.5 w-6 rounded" style={{ background: personStrengthColor(n) }} title={`${n}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-1">
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#6366f1] border-2 border-[#1E1B4B]" /> Pessoa</div>
          <div className="flex items-center gap-2"><span className="h-3 w-4 rounded bg-[#FCD34D] border border-[#B45309]" /> Instituição</div>
          <div className="flex items-center gap-2"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#6366F1" strokeWidth="2" /></svg> Conexão pessoa</div>
          <div className="flex items-center gap-2"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="3 3" /></svg> Vínculo institucional</div>
        </div>
        {focusId && (
          <button onClick={() => setFocusId(null)} className="mt-2 text-[10px] text-accent hover:underline">
            Limpar foco
          </button>
        )}
      </div>
    </div>
  );
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

// Helper used by NetworkMap.isDimmed
function connectsTo(focusId, otherId, connections, personRoles) {
  for (const c of connections) {
    if ((c.person_a_id === focusId && c.person_b_id === otherId)
        || (c.person_b_id === focusId && c.person_a_id === otherId)) return true;
  }
  for (const r of personRoles) {
    if ((r.person_id === focusId && r.institution_id === otherId)
        || (r.institution_id === focusId && r.person_id === otherId)) return true;
  }
  return false;
}

// Editor: handles person AND institution. Adds the new roles + entity_links
// editors for people.
function NetworkEditor({ editor, institutions, people, areas, projects, fronts, tasks, onClose, onSaved }) {
  const { kind, mode, payload } = editor;
  const isPerson = kind === 'person';
  const [form, setForm] = useState(() => ({
    ...payload,
    roles: payload.roles && payload.roles.length > 0
      ? payload.roles
      : (isPerson ? [{ role: payload.role || '', institution_id: '', institution_name: payload.institution || '', start_date: '', end_date: '', current: true }] : []),
    entity_links: payload.entity_links || [],
  }));
  const [tagInput, setTagInput] = useState((payload.tags || []).join(', '));
  const [connTarget, setConnTarget] = useState('');
  const [connType, setConnType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titles = {
    person: mode === 'create' ? 'Nova Pessoa' : 'Editar Pessoa',
    institution: mode === 'create' ? 'Nova Instituição' : 'Editar Instituição',
  };

  const updateRole = (idx, patch) =>
    setForm((f) => ({ ...f, roles: f.roles.map((r, i) => i === idx ? { ...r, ...patch } : r) }));
  const addRole = () =>
    setForm((f) => ({ ...f, roles: [...f.roles, { role: '', institution_id: '', institution_name: '', start_date: '', end_date: '', current: false }] }));
  const removeRole = (idx) =>
    setForm((f) => ({ ...f, roles: f.roles.filter((_, i) => i !== idx) }));

  const updateLink = (idx, patch) =>
    setForm((f) => ({ ...f, entity_links: f.entity_links.map((l, i) => i === idx ? { ...l, ...patch } : l) }));
  const addLink = () =>
    setForm((f) => ({ ...f, entity_links: [...f.entity_links, { entity_type: 'project', entity_id: '', entity_name: '', notes: '' }] }));
  const removeLink = (idx) =>
    setForm((f) => ({ ...f, entity_links: f.entity_links.filter((_, i) => i !== idx) }));

  const entityOptionsFor = (type) => {
    if (type === 'area') return areas.map((a) => ({ id: a.id, name: a.name }));
    if (type === 'project') return projects.map((p) => ({ id: p.id, name: p.name }));
    if (type === 'front') return fronts.map((f) => ({ id: f.id, name: f.name }));
    if (type === 'task') return tasks.map((t) => ({ id: t.id, name: t.title }));
    return [];
  };

  const save = async () => {
    if (!form.name || !form.name.trim()) return setError('Nome é obrigatório');
    setBusy(true);
    setError('');
    try {
      const tags = tagInput.split(',').map((t) => t.trim()).filter(Boolean);
      const base = isPerson ? '/api/network/people' : '/api/network/institutions';
      const path = mode === 'edit' ? `${base}/${form.id}` : base;
      const method = mode === 'edit' ? 'PUT' : 'POST';
      // Normalise: institution_name pulled from selected institution when id set
      const roles = (form.roles || []).map((r) => {
        if (r.institution_id) {
          const inst = institutions.find((i) => i.id === r.institution_id);
          return { ...r, institution_name: inst ? inst.name : r.institution_name };
        }
        return r;
      }).filter((r) => r.role && r.role.trim());
      const entity_links = (form.entity_links || []).filter((l) => l.entity_type && l.entity_id);
      const body = isPerson
        ? { ...form, tags, roles, entity_links }
        : { ...form, tags };
      const saved = await apiFetch(path, { method, body: JSON.stringify(body) });
      if (isPerson && connTarget && saved && saved.id) {
        await apiFetch('/api/network/connections', {
          method: 'POST',
          body: JSON.stringify({
            person_a_id: saved.id, person_b_id: connTarget,
            connection_type: connType, description: '',
          }),
        });
      }
      onSaved();
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            {isPerson ? <User className="h-4 w-4 text-accent" /> : <Building2 className="h-4 w-4 text-accent" />}
            {titles[kind]}
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}

          <Field label="Nome">
            <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </Field>

          {isPerson ? (
            <>
              <div className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink2">Funções e Vínculos Institucionais</span>
                  <button type="button" onClick={addRole} className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface2">
                    <Plus className="h-3 w-3" /> Adicionar função
                  </button>
                </div>
                <div className="space-y-2">
                  {form.roles.map((r, idx) => (
                    <div key={idx} className="space-y-1 rounded-md bg-surface2 p-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={r.role}
                          onChange={(e) => updateRole(idx, { role: e.target.value })}
                          placeholder="Cargo (ex: Pesquisador)"
                          className="input"
                        />
                        <select
                          value={r.institution_id || ''}
                          onChange={(e) => {
                            const inst = institutions.find((i) => i.id === e.target.value);
                            updateRole(idx, {
                              institution_id: e.target.value,
                              institution_name: inst ? inst.name : '',
                            });
                          }}
                          className="input"
                        >
                          <option value="">— Instituição —</option>
                          {institutions.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
                        </select>
                      </div>
                      {!r.institution_id && (
                        <input
                          value={r.institution_name || ''}
                          onChange={(e) => updateRole(idx, { institution_name: e.target.value })}
                          placeholder="Ou digite a instituição livre"
                          className="input"
                        />
                      )}
                      <div className="grid grid-cols-3 items-center gap-2">
                        <label className="flex items-center gap-1.5 text-[11px] text-ink2">
                          <input type="checkbox" checked={!!r.current} onChange={(e) => updateRole(idx, { current: e.target.checked })} className="accent-[#6366f1]" />
                          Atual
                        </label>
                        <input type="date" value={r.start_date || ''} onChange={(e) => updateRole(idx, { start_date: e.target.value })} className="input" />
                        <input type="date" value={r.end_date || ''} onChange={(e) => updateRole(idx, { end_date: e.target.value })} disabled={!!r.current} className="input disabled:opacity-60" />
                      </div>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => removeRole(idx)} className="text-[11px] text-danger hover:underline">
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Field label="Área de atuação">
                <input value={form.area_of_work || ''} onChange={(e) => setForm({ ...form, area_of_work: e.target.value })} className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Email"><input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" /></Field>
                <Field label="Telefone"><input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" /></Field>
              </div>
              <Field label="LinkedIn"><input value={form.linkedin || ''} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} className="input" /></Field>
              <Field label="Conexão com Lauro">
                <textarea rows={2} value={form.connection_to_lauro || ''} onChange={(e) => setForm({ ...form, connection_to_lauro: e.target.value })} className="input resize-y" />
              </Field>
              <Field label={`Força da conexão: ${form.connection_strength || 0}/10`}>
                <input type="range" min="0" max="10" value={form.connection_strength || 0} onChange={(e) => setForm({ ...form, connection_strength: Number(e.target.value) })} className="w-full accent-[#6366f1]" />
              </Field>

              {/* AIDE entity links */}
              <div className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink2">Vinculações no AIDE</span>
                  <button type="button" onClick={addLink} className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface2">
                    <Plus className="h-3 w-3" /> Vincular a Área/Projeto/Tarefa
                  </button>
                </div>
                {form.entity_links.length === 0 ? (
                  <p className="text-[11px] text-muted">Nenhuma vinculação.</p>
                ) : (
                  <div className="space-y-2">
                    {form.entity_links.map((l, idx) => {
                      const opts = entityOptionsFor(l.entity_type);
                      return (
                        <div key={idx} className="space-y-1 rounded-md bg-surface2 p-2">
                          <div className="grid grid-cols-3 gap-2">
                            <select value={l.entity_type} onChange={(e) => updateLink(idx, { entity_type: e.target.value, entity_id: '', entity_name: '' })} className="input">
                              <option value="area">Área</option>
                              <option value="project">Projeto</option>
                              <option value="front">Frente</option>
                              <option value="task">Tarefa</option>
                            </select>
                            <select
                              value={l.entity_id}
                              onChange={(e) => {
                                const found = opts.find((o) => o.id === e.target.value);
                                updateLink(idx, { entity_id: e.target.value, entity_name: found ? found.name : '' });
                              }}
                              className="input col-span-2"
                            >
                              <option value="">—</option>
                              {opts.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
                            </select>
                          </div>
                          <input
                            value={l.notes || ''}
                            onChange={(e) => updateLink(idx, { notes: e.target.value })}
                            placeholder="Notas (opcional)"
                            className="input"
                          />
                          <div className="flex justify-end">
                            <button type="button" onClick={() => removeLink(idx)} className="text-[11px] text-danger hover:underline">Remover</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-line bg-surface2 p-3">
                <p className="mb-2 text-xs font-semibold text-ink2">Adicionar conexão a outra pessoa</p>
                <div className="grid grid-cols-2 gap-2">
                  <select value={connTarget} onChange={(e) => setConnTarget(e.target.value)} className="input">
                    <option value="">—</option>
                    {people.filter((p) => p.id !== form.id).map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                  </select>
                  <input value={connType} onChange={(e) => setConnType(e.target.value)} placeholder="Tipo (ex: colega)" className="input" />
                </div>
              </div>
            </>
          ) : (
            <>
              <Field label="Tipo">
                <select value={form.type || 'company'} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
                  {INSTITUTION_TYPES.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                </select>
              </Field>
              <Field label="Área"><input value={form.area || ''} onChange={(e) => setForm({ ...form, area: e.target.value })} className="input" /></Field>
              <Field label="Website"><input value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input" /></Field>
              <Field label="LinkedIn"><input value={form.linkedin || ''} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} className="input" /></Field>
            </>
          )}

          <Field label="Tags (separadas por vírgula)">
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="input" />
          </Field>
          <Field label="Notas">
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input resize-y" />
          </Field>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button onClick={save} disabled={busy} className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
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
