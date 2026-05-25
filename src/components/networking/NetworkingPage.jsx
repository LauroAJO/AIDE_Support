import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Network, Plus, Pencil, Trash2, Search, Star, X, Mail, Phone, Linkedin,
  Building2, User, Link as LinkIcon, Map, List as ListIcon, RefreshCw,
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

const NETWORKING_AREA = {
  name: 'Networking',
  color: '#0EA5E9',
  description: 'Pessoas, instituições e oportunidades.',
  projects: [
    {
      name: 'Presença Digital e Profissional',
      fronts: ['CV e Documentos', 'Cartão NFC', 'LinkedIn', 'C. Lattes', 'ResearchGate'],
    },
    { name: 'Mapeamento de Pessoas', fronts: ['Lista de pessoas relevantes', 'Conexões estratégicas'] },
    { name: 'Radar de Vagas — Hidrogênio', fronts: ['LinkedIn', 'ResearchGate', 'Outros canais'] },
    { name: 'Vagas Holanda', fronts: ['LinkedIn', 'Portais especializados', 'Divulgação'] },
    { name: 'Start up EngD', fronts: ['Planejamento', 'Conexões', 'Recursos'] },
  ],
};

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
  const setProjects = useStore((s) => s.setProjects);
  const setFronts = useStore((s) => s.setFronts);

  const [view, setView] = useState('list'); // 'list' | 'map'
  const [filter, setFilter] = useState('all'); // 'all' | 'people' | 'institutions'
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [selected, setSelected] = useState(null); // { kind: 'person'|'institution', id }
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const loadAll = async () => {
    try {
      const [p, i, c, st, ar] = await Promise.all([
        apiFetch('/api/network/people'),
        apiFetch('/api/network/institutions'),
        apiFetch('/api/network/connections'),
        apiFetch('/api/bridge/sync-status').catch(() => null),
        apiFetch('/api/areas').catch(() => []),
      ]);
      setPeople(p || []);
      setInstitutions(i || []);
      setConnections(c || []);
      if (st) setBridgeStatus(st);
      if (ar) setAreas(ar);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the "Networking" area + projects + fronts on first visit if missing.
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
        // Refresh the hierarchy state once everything is in.
        const [ar2, pr2, fr2] = await Promise.all([
          apiFetch('/api/areas'),
          apiFetch('/api/projects'),
          apiFetch('/api/fronts'),
        ]);
        setAreas(ar2 || []);
        setProjects(pr2 || []);
        setFronts(fr2 || []);
      } catch { /* tolerate failure — user can re-create manually */ }
      finally { setSeeding(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, areas]);

  const allTags = useMemo(() => {
    const set = new Set();
    people.forEach((p) => (p.tags || []).forEach((t) => set.add(t)));
    institutions.forEach((i) => (i.tags || []).forEach((t) => set.add(t)));
    return [...set];
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
        const hay = `${it.name} ${it.role || ''} ${it.institution || ''} ${it.area || ''}`.toLowerCase();
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

  if (loading) {
    return <div className="h-full"><LoadingSpinner label="Carregando networking..." /></div>;
  }

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
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'list' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}
            >
              <ListIcon className="h-3.5 w-3.5" /> Lista
            </button>
            <button
              onClick={() => setView('map')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'map' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}
            >
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
          {/* Left — 35% */}
          <div className="flex w-full min-w-0 flex-col md:w-[35%]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar pessoas/instituições..."
                className="input pl-8"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Todos</Chip>
              <Chip active={filter === 'people'} onClick={() => setFilter('people')}>Pessoas</Chip>
              <Chip active={filter === 'institutions'} onClick={() => setFilter('institutions')}>Instituições</Chip>
            </div>
            {allTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTagFilter(tagFilter === t ? null : t)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${tagFilter === t ? 'bg-accent text-white' : 'bg-surface2 text-ink2'}`}
                  >
                    #{t}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 min-h-0 flex-1 space-y-1.5 overflow-y-auto pb-2">
              {items.length === 0 ? (
                <p className="mt-6 text-center text-sm text-muted">Nenhum registro.</p>
              ) : (
                items.map((it) => (
                  <button
                    key={`${it._kind}-${it.id}`}
                    onClick={() => setSelected({ kind: it._kind, id: it.id })}
                    className={`flex w-full items-start gap-2 rounded-lg border bg-surface p-2.5 text-left transition hover:border-accent ${
                      selected?.id === it.id ? 'border-accent ring-1 ring-accent' : 'border-line'
                    }`}
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
                          ? [it.role, it.institution].filter(Boolean).join(' · ') || 'Pessoa'
                          : INSTITUTION_TYPES.find(([t]) => t === it.type)?.[1] || 'Instituição'}
                      </p>
                      {it._kind === 'person' && (
                        <StrengthDots value={it.connection_strength || 0} />
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Right — 65% */}
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
            onSelect={(kind, id) => { setView('list'); setSelected({ kind, id }); }}
          />
        </div>
      )}

      {editor && (
        <NetworkEditor
          editor={editor}
          institutions={institutions}
          people={people}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

function emptyPerson() {
  return {
    name: '', type: 'person', institution: '', role: '', area_of_work: '',
    email: '', phone: '', linkedin: '', notes: '',
    connection_to_lauro: '', connection_strength: 3,
    tags: [], lifegame_person_id: '',
  };
}
function emptyInstitution() {
  return { name: '', type: 'company', area: '', website: '', linkedin: '', notes: '', tags: [] };
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
        active ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function StrengthDots({ value }) {
  return (
    <div className="mt-1 flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: n <= value ? '#6366f1' : '#E8E3DB' }}
        />
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
    <a
      href="/settings"
      title="Abrir configurações da bridge"
      className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] text-ink2 hover:bg-surface2"
    >
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
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
              style={{ background: isPerson ? '#6366f1' : '#F59E0B' }}
            >
              {(item.name || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-ink">{item.name}</h2>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink2">
                  {isPerson ? 'Pessoa' : (INSTITUTION_TYPES.find(([t]) => t === item.type)?.[1] || 'Instituição')}
                </span>
              </div>
              <p className="text-xs text-ink2">
                {isPerson
                  ? [item.role, item.institution, item.area_of_work].filter(Boolean).join(' · ')
                  : [item.area].filter(Boolean).join(' · ')}
              </p>
              {isPerson && item.lifegame_person_id && (
                <span className="mt-1 inline-block rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent">
                  Sincronizado com Lifegame
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            <button onClick={onEdit} className="rounded-md border border-line p-1.5 text-ink2 hover:bg-surface2">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="rounded-md border border-line p-1.5 text-danger hover:bg-danger/10">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {isPerson && (
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className="h-4 w-4"
                style={{ color: n <= (item.connection_strength || 0) ? '#F59E0B' : '#E8E3DB', fill: n <= (item.connection_strength || 0) ? '#F59E0B' : 'none' }}
              />
            ))}
            <span className="ml-2 text-xs text-ink2">Conexão {item.connection_strength || 0}/5</span>
          </div>
        )}

        {(item.email || item.phone || item.linkedin || item.website) && (
          <div className="space-y-1.5 text-sm">
            {item.email && (
              <a href={`mailto:${item.email}`} className="flex items-center gap-2 text-ink hover:text-accent">
                <Mail className="h-3.5 w-3.5 text-muted" /> {item.email}
              </a>
            )}
            {item.phone && (
              <a href={`tel:${item.phone}`} className="flex items-center gap-2 text-ink hover:text-accent">
                <Phone className="h-3.5 w-3.5 text-muted" /> {item.phone}
              </a>
            )}
            {item.linkedin && (
              <a href={item.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink hover:text-accent">
                <Linkedin className="h-3.5 w-3.5 text-muted" /> {item.linkedin}
              </a>
            )}
            {item.website && (
              <a href={item.website} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ink hover:text-accent">
                <LinkIcon className="h-3.5 w-3.5 text-muted" /> {item.website}
              </a>
            )}
          </div>
        )}

        {isPerson && item.connection_to_lauro && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted">Conexão com Lauro</p>
            <p className="whitespace-pre-wrap text-sm text-ink">{item.connection_to_lauro}</p>
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
                    {conn.connection_type && (
                      <span className="ml-2 text-[11px] text-ink2">— {conn.connection_type}</span>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      await apiFetch(`/api/network/connections/${conn.id}`, { method: 'DELETE' });
                      onReloadConnections();
                    }}
                    className="text-muted hover:text-danger"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function NetworkMap({ people, institutions, connections, onSelect }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const r = containerRef.current.getBoundingClientRect();
      setSize({ w: Math.max(400, r.width), h: Math.max(400, r.height) });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Stable circular layout — no physics, but easy to read.
  const nodes = useMemo(() => {
    const all = [
      ...people.map((p) => ({ ...p, _kind: 'person' })),
      ...institutions.map((i) => ({ ...i, _kind: 'institution' })),
    ];
    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.min(size.w, size.h) * 0.38;
    const n = all.length;
    return all.map((it, i) => {
      const angle = (i / Math.max(1, n)) * Math.PI * 2;
      return { ...it, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
  }, [people, institutions, size]);

  const nodeIndex = useMemo(() => {
    const m = {};
    nodes.forEach((n) => { m[n.id] = n; });
    return m;
  }, [nodes]);

  const lauroPos = { x: size.w / 2, y: size.h / 2 };

  return (
    <div ref={containerRef} className="h-full w-full rounded-xl border border-line bg-surface">
      <svg width="100%" height="100%" viewBox={`0 0 ${size.w} ${size.h}`} style={{ display: 'block' }}>
        {/* Connections between people */}
        {connections.map((c) => {
          const a = nodeIndex[c.person_a_id];
          const b = nodeIndex[c.person_b_id];
          if (!a || !b) return null;
          return (
            <line
              key={c.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#E8E3DB" strokeWidth="1.5"
            >
              <title>{c.connection_type || 'conexão'}</title>
            </line>
          );
        })}
        {/* Lines from Lauro to every person (a faint background) */}
        {nodes.filter((n) => n._kind === 'person').map((n) => (
          <line
            key={`lauro-${n.id}`} x1={lauroPos.x} y1={lauroPos.y} x2={n.x} y2={n.y}
            stroke="#F3F0EB" strokeWidth="1" strokeDasharray="3 4"
          />
        ))}
        {/* Lauro centered */}
        <g>
          <circle cx={lauroPos.x} cy={lauroPos.y} r={28} fill="#1A1814" stroke="#6366f1" strokeWidth="3" />
          <text x={lauroPos.x} y={lauroPos.y + 5} textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="700">L</text>
        </g>
        {/* Nodes */}
        {nodes.map((n) => {
          const r = n._kind === 'person' ? 10 + Math.min(10, (n.connection_strength || 0) * 2) : 14;
          const fill = n._kind === 'person' ? '#6366f1' : '#F59E0B';
          return (
            <g key={`${n._kind}-${n.id}`} style={{ cursor: 'pointer' }} onClick={() => onSelect(n._kind, n.id)}>
              <circle cx={n.x} cy={n.y} r={r} fill={fill} stroke="#FFFFFF" strokeWidth="2" />
              <text x={n.x} y={n.y + r + 12} textAnchor="middle" fill="#1A1814" fontSize="11">
                {(n.name || '').split(' ')[0]}
              </text>
            </g>
          );
        })}
        {nodes.length === 0 && (
          <text x={size.w / 2} y={size.h / 2 + 60} textAnchor="middle" fill="#9E9890" fontSize="12">
            Adicione pessoas e instituições para visualizar o mapa.
          </text>
        )}
      </svg>
    </div>
  );
}

function NetworkEditor({ editor, institutions, people, onClose, onSaved }) {
  const { kind, mode, payload } = editor;
  const [form, setForm] = useState(payload);
  const [tagInput, setTagInput] = useState((payload.tags || []).join(', '));
  const [connTarget, setConnTarget] = useState('');
  const [connType, setConnType] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isPerson = kind === 'person';
  const titles = {
    person: mode === 'create' ? 'Nova Pessoa' : 'Editar Pessoa',
    institution: mode === 'create' ? 'Nova Instituição' : 'Editar Instituição',
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
      const saved = await apiFetch(path, { method, body: JSON.stringify({ ...form, tags }) });
      // Optional: create a fresh connection.
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
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-md" onClick={(e) => e.stopPropagation()}>
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
              <div className="grid grid-cols-2 gap-2">
                <Field label="Cargo">
                  <input value={form.role || ''} onChange={(e) => setForm({ ...form, role: e.target.value })} className="input" />
                </Field>
                <Field label="Instituição">
                  <input
                    value={form.institution || ''}
                    onChange={(e) => setForm({ ...form, institution: e.target.value })}
                    list="institutions-list"
                    className="input"
                  />
                  <datalist id="institutions-list">
                    {institutions.map((i) => (<option key={i.id} value={i.name} />))}
                  </datalist>
                </Field>
              </div>
              <Field label="Área de atuação">
                <input value={form.area_of_work || ''} onChange={(e) => setForm({ ...form, area_of_work: e.target.value })} className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Email">
                  <input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
                </Field>
                <Field label="Telefone">
                  <input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
                </Field>
              </div>
              <Field label="LinkedIn">
                <input value={form.linkedin || ''} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} className="input" />
              </Field>
              <Field label="Conexão com Lauro">
                <textarea rows={2} value={form.connection_to_lauro || ''} onChange={(e) => setForm({ ...form, connection_to_lauro: e.target.value })} className="input resize-y" />
              </Field>
              <Field label={`Força da conexão: ${form.connection_strength || 0}/5`}>
                <input
                  type="range" min="1" max="5"
                  value={form.connection_strength || 3}
                  onChange={(e) => setForm({ ...form, connection_strength: Number(e.target.value) })}
                  className="w-full accent-[#6366f1]"
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="Tipo">
                <select value={form.type || 'company'} onChange={(e) => setForm({ ...form, type: e.target.value })} className="input">
                  {INSTITUTION_TYPES.map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
                </select>
              </Field>
              <Field label="Área">
                <input value={form.area || ''} onChange={(e) => setForm({ ...form, area: e.target.value })} className="input" />
              </Field>
              <Field label="Website">
                <input value={form.website || ''} onChange={(e) => setForm({ ...form, website: e.target.value })} className="input" />
              </Field>
              <Field label="LinkedIn">
                <input value={form.linkedin || ''} onChange={(e) => setForm({ ...form, linkedin: e.target.value })} className="input" />
              </Field>
            </>
          )}

          <Field label="Tags (separadas por vírgula)">
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} className="input" />
          </Field>

          <Field label="Notas">
            <textarea rows={3} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="input resize-y" />
          </Field>

          {isPerson && (
            <div className="rounded-lg border border-line bg-surface2 p-3">
              <p className="mb-2 text-xs font-semibold text-ink2">Adicionar conexão a outra pessoa</p>
              <div className="grid grid-cols-2 gap-2">
                <select value={connTarget} onChange={(e) => setConnTarget(e.target.value)} className="input">
                  <option value="">—</option>
                  {people.filter((p) => p.id !== form.id).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <input value={connType} onChange={(e) => setConnType(e.target.value)} placeholder="Tipo (ex: colega)" className="input" />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-4 py-3">
          <button
            onClick={save}
            disabled={busy}
            className="flex-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
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
