import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Network, Plus, Minus, Home, Maximize2, Settings, Pencil, Trash2, Search, Star, X, Mail, Phone, Linkedin,
  Building2, User, Link as LinkIcon, Map as MapIcon, List as ListIcon, Briefcase, ChevronDown, RefreshCw,
  Table2, Grid3x3, Download, ArrowUp, ArrowDown, Loader2, Copy, Send, RotateCcw,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { MarkdownViewer } from '../../lib/markdownRenderer';
import LoadingSpinner from '../shared/LoadingSpinner';
import StalenessSection from '../shared/StalenessSection';
import ErrorBoundary from '../shared/ErrorBoundary';
import ConfirmModal from '../shared/ConfirmModal';
import NetworkMapRede from './NetworkMapRede';
import {
  TEMP_META, sectorWeightColor, sectorWeightLabel, currentRoleOrg,
  subtitleForPerson, truncate,
} from './networkShared';
import { DraftBanner } from '../shared/DraftBanner';
import { useDraft } from '../../hooks/useDraft';
import {
  useUnsavedGuard, DISCARD_TITLE, DISCARD_MESSAGE,
  DISCARD_CONFIRM_LABEL, DISCARD_CANCEL_LABEL,
} from '../../hooks/useUnsavedGuard';

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

// Status de outreach (contact_professional) exibido no Networking. Rótulos
// PT-BR + cor do "dot" por status. Mesmos valores usados no Mercado.
const OUTREACH_META = {
  not_contacted:     { label: 'Não contatado',     dot: '#9CA3AF' },
  contacted:         { label: 'Contatado',         dot: '#3B82F6' },
  responded:         { label: 'Respondeu',         dot: '#22C55E' },
  meeting_scheduled: { label: 'Reunião agendada',  dot: '#6366F1' },
  ongoing:           { label: 'Em andamento',      dot: '#F59E0B' },
  converted:         { label: 'Convertido',        dot: '#15803D' },
  inactive:          { label: 'Inativo',           dot: '#EF4444' },
};
const OUTREACH_STATUS_ORDER = [
  'not_contacted', 'contacted', 'responded', 'meeting_scheduled', 'ongoing', 'converted', 'inactive',
];

// Prompt G — tipos de interação (emoji + rótulo + classe de badge).
const INTERACTION_META = {
  email_sent:         { emoji: '📧', label: 'Email enviado',      cls: 'bg-blue-100 text-blue-700' },
  email_received:     { emoji: '📨', label: 'Email recebido',     cls: 'bg-green-100 text-green-700' },
  linkedin_connected: { emoji: '💼', label: 'LinkedIn conectado', cls: 'bg-indigo-100 text-indigo-700' },
  linkedin_message:   { emoji: '💬', label: 'Mensagem LinkedIn',  cls: 'bg-indigo-100 text-indigo-700' },
  meeting:            { emoji: '🤝', label: 'Reunião',            cls: 'bg-purple-100 text-purple-700' },
  coffee_chat:        { emoji: '☕', label: 'Coffee chat',        cls: 'bg-amber-100 text-amber-700' },
  paper_mentioned:    { emoji: '📄', label: 'Paper/projeto',      cls: 'bg-gray-100 text-gray-700' },
  event:              { emoji: '🎤', label: 'Evento',             cls: 'bg-orange-100 text-orange-700' },
  other:              { emoji: '📝', label: 'Outro',              cls: 'bg-gray-100 text-gray-700' },
};
const INTERACTION_ORDER = ['email_sent', 'email_received', 'linkedin_connected', 'linkedin_message', 'meeting', 'coffee_chat', 'paper_mentioned', 'event', 'other'];

// Temperatura do contato (pela última interação) — TEMP_META vive em
// ./networkShared.js, compartilhado com o Mapa de Rede.
const TEMP_CHIPS = [
  { key: null, label: 'Todos' },
  { key: 'hot', label: '🔥 Quentes' },
  { key: 'warm', label: '🟡 Mornos' },
  { key: 'cold', label: '🔵 Frios' },
  { key: 'never', label: '⚫ Nunca' },
];

// "Como se conheceram".
const ACQUAINTANCE_META = {
  online_research: { emoji: '🔍', label: 'Pesquisa online' },
  event:           { emoji: '🎤', label: 'Evento/conferência' },
  referral:        { emoji: '👥', label: 'Indicação' },
  colleague:       { emoji: '🤝', label: 'Colega/colaborador' },
  ex_supervisor:   { emoji: '👨‍🏫', label: 'Ex-orientador' },
  ex_student:      { emoji: '🎓', label: 'Ex-estudante' },
  other:           { emoji: '📝', label: 'Outro' },
};
const ACQUAINTANCE_ORDER = ['online_research', 'event', 'referral', 'colleague', 'ex_supervisor', 'ex_student', 'other'];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDateBR(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
}

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
// Cor do retângulo de organização por tipo (market_organizations.type). Fundo
// claro + borda escura da mesma matiz; texto escuro garante legibilidade. Tipos
// não mapeados (ex.: consortium) caem em "other" (cinza).
const ORG_TYPE_COLORS = {
  university:         { fill: '#E0E7FF', stroke: '#4338CA' }, // indigo
  company:            { fill: '#FDE68A', stroke: '#B45309' }, // amber
  research_institute: { fill: '#BBF7D0', stroke: '#15803D' }, // green
  funder:             { fill: '#E9D5FF', stroke: '#7E22CE' }, // purple
  other:              { fill: '#E5E7EB', stroke: '#6B7280' }, // gray
};
function orgTypeColor(type) {
  return ORG_TYPE_COLORS[type] || ORG_TYPE_COLORS.other;
}
// Rótulos PT-BR dos tipos de organização (market_organizations.type) para o popup do mapa.
const ORG_TYPE_LABELS = {
  university: 'Universidade',
  company: 'Empresa',
  research_institute: 'Instituto de pesquisa',
  funder: 'Financiador',
  other: 'Outro',
};

export default function NetworkingPage() {
  const user = useStore((s) => s.user);
  const setDexLastSync = useStore((s) => s.setDexLastSync);
  const setDexSyncResult = useStore((s) => s.setDexSyncResult);
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
  // Dentro da aba Mapa: 'orbital' (Lauro no centro, comportamento histórico)
  // ou 'rede' (ego network navegável — v2.25.14).
  const [mapMode, setMapMode] = useState('orbital');
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState(null);
  const [tagMenuOpen, setTagMenuOpen] = useState(false);
  const [tagMenuSearch, setTagMenuSearch] = useState('');
  const tagMenuRef = useRef(null);
  const [tempFilter, setTempFilter] = useState(null); // filtro de temperatura (Prompt G)
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [personRoles, setPersonRoles] = useState([]); // flattened roles for the graph
  const [contactOrgLinks, setContactOrgLinks] = useState([]); // vínculos pessoa↔org do Mercado (contact_org_links)
  // Etapa 6 — IDs de pessoas que possuem perfil profissional (contact_professional).
  const [proIds, setProIds] = useState(() => new Set());
  // Mapa person_id → outreach_status (do Mercado) p/ exibir no card e no detalhe.
  const [proStatus, setProStatus] = useState(() => ({}));
  // Perfil profissional completo (contact_professional) por person_id — enriquece o detalhe.
  const [proProfile, setProProfile] = useState(() => ({}));
  // DEX CRM sync (owner only) — botão "Sincronizar DEX" no cabeçalho.
  const [dexSyncing, setDexSyncing] = useState(false);
  const [dexPendingReview, setDexPendingReview] = useState(0);
  // Contagem/data de interações por pessoa — indicador de canal no mapa + coluna na tabela (v2.25.9).
  const [interactionData, setInteractionData] = useState(() => ({}));
  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  };
  const navigate = useNavigate();
  const location = useLocation();

  const loadAll = async () => {
    try {
      const [routes, st, ar, pr, fr, ts, mc, mo, ic] = await Promise.all([
        apiFetch('/api/network/routes').catch(() => ({ people: [], institutions: [], connections: [], person_roles: [] })),
        apiFetch('/api/bridge/sync-status').catch(() => null),
        apiFetch('/api/areas').catch(() => []),
        apiFetch('/api/projects').catch(() => []),
        apiFetch('/api/fronts').catch(() => []),
        tasksInStore.length === 0 ? apiFetch('/api/tasks').catch(() => []) : Promise.resolve(tasksInStore),
        apiFetch('/api/market/contacts').catch(() => []),
        apiFetch('/api/market/organizations').catch(() => []),
        apiFetch('/api/network/interactions/counts').catch(() => ({})),
      ]);
      setPeople(routes.people || []);
      // Consolidação v2.4: "instituições" agora vêm de market_organizations (Mercado)
      // e alimentam apenas o seletor de organização nas funções da pessoa.
      setInstitutions(mo || []);
      setConnections(routes.connections || []);
      setPersonRoles(routes.person_roles || []);
      setContactOrgLinks(routes.contactOrgLinks || []);
      setInteractionData(ic || {});
      setProIds(new Set((mc || []).map((c) => c.person_id)));
      const statusMap = {};
      const profMap = {};
      (mc || []).forEach((c) => {
        if (!c.person_id) return;
        statusMap[c.person_id] = c.outreach_status || 'not_contacted';
        profMap[c.person_id] = c;
      });
      setProStatus(statusMap);
      setProProfile(profMap);
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

  // Deep-link da busca global (?person=<id>): seleciona a pessoa assim que a
  // lista carregar e limpa o param pra não reabrir num refresh/voltar depois.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const personId = searchParams.get('person');
    if (!personId || !people.length) return;
    const found = people.find((p) => p.id === personId);
    if (found) setSelected({ id: personId, kind: 'person' });
    const next = new URLSearchParams(searchParams);
    next.delete('person');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, people]);

  useEffect(() => {
    if (user?.role !== 'owner') return;
    apiFetch('/api/dex/staging/count').then((r) => setDexPendingReview((r && r.pending) || 0)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const syncDex = async () => {
    setDexSyncing(true);
    try {
      const res = await apiFetch('/api/dex/sync', { method: 'POST' });
      setDexSyncResult(res);
      setDexLastSync(new Date().toISOString());
      await loadAll();
      apiFetch('/api/dex/staging/count').then((r) => setDexPendingReview((r && r.pending) || 0)).catch(() => {});
      showToast(`DEX: ${res.staged} novos contatos aguardando revisão`);
    } catch (e) {
      showToast(`Erro ao sincronizar DEX: ${(e && e.message) || e}`, 'error');
    } finally {
      setDexSyncing(false);
    }
  };

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
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [people]);

  // Mesmo padrão do hamburger de tags de NotesPage.jsx: só as 5 primeiras
  // (ordem alfabética) ficam visíveis; o resto entra no menu "+N tags".
  const visibleTags = allTags.slice(0, 5);
  const hiddenTagsCount = Math.max(0, allTags.length - 5);
  const menuTags = useMemo(() => {
    const q = tagMenuSearch.trim().toLowerCase();
    if (!q) return allTags;
    return allTags.filter((t) => t.toLowerCase().includes(q));
  }, [allTags, tagMenuSearch]);

  // Fecha o menu de tags ao clicar fora ou pressionar Escape.
  useEffect(() => {
    if (!tagMenuOpen) return undefined;
    const onDocClick = (e) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target)) setTagMenuOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setTagMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [tagMenuOpen]);

  const chooseTag = (t) => {
    setTagFilter(tagFilter === t ? null : t);
    setTagMenuOpen(false);
  };

  // Consolidação v2.4: a lista de Networking mostra SOMENTE pessoas (instituições
  // foram unificadas em Mercado/market_organizations).
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = people.map((p) => ({ ...p, _kind: 'person' }));
    return all.filter((it) => {
      if (tagFilter && !(it.tags || []).includes(tagFilter)) return false;
      if (tempFilter && (it.temperature || 'never') !== tempFilter) return false;
      if (q) {
        const roleStr = it.roles
          ? it.roles.map((r) => `${r.role} ${r.institution_name}`).join(' ')
          : '';
        const hay = `${it.name} ${it.role || ''} ${it.institution || ''} ${it.area || ''} ${roleStr}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [people, search, tagFilter, tempFilter]);

  const selectedItem = useMemo(() => {
    if (!selected) return null;
    return people.find((p) => p.id === selected.id) || null;
  }, [selected, people]);

  const removeItem = async (kind, id) => {
    const label = kind === 'person' ? 'esta pessoa' : 'esta instituição';
    if (!window.confirm(`Excluir ${label}?`)) return;
    const path = kind === 'person' ? `/api/network/people/${id}` : `/api/network/institutions/${id}`;
    await apiFetch(path, { method: 'DELETE' });
    setSelected(null);
    loadAll();
  };

  // Altera o status de outreach (contact_professional) — atualização otimista + PUT.
  const changeOutreach = async (personId, status) => {
    setProStatus((m) => ({ ...m, [personId]: status }));
    try {
      await apiFetch(`/api/market/contacts/${personId}/professional`, {
        method: 'PUT',
        body: JSON.stringify({ outreach_status: status }),
      });
    } catch {
      loadAll(); // reflete o estado real do servidor em caso de falha
    }
  };

  // Atualiza campos do contact_professional (acquaintance/referral) — otimista + PUT (Prompt G).
  const patchProfessional = async (personId, patch) => {
    setProProfile((m) => ({ ...m, [personId]: { ...(m[personId] || {}), ...patch } }));
    try {
      await apiFetch(`/api/market/contacts/${personId}/professional`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    } catch {
      loadAll();
    }
  };

  // Patch direto em network_people (ex.: peso setorial) — otimista + PUT,
  // recarrega do servidor em caso de falha p/ refletir o estado real.
  // Nota: setPeople é o setter Zustand (não useState) — não aceita updater
  // funcional, precisa do array já calculado a partir do `people` do closure.
  const patchPerson = async (personId, patch) => {
    setPeople(people.map((p) => (p.id === personId ? { ...p, ...patch } : p)));
    try {
      const updated = await apiFetch(`/api/network/people/${personId}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
      setPeople(people.map((p) => (p.id === personId ? updated : p)));
    } catch {
      loadAll();
    }
  };

  // Link inverso Mercado → Networking: seleciona a pessoa indicada em
  // state.contactId assim que os dados terminarem de carregar.
  useEffect(() => {
    const cid = location.state?.contactId;
    if (!cid || loading) return;
    if (people.some((p) => p.id === cid)) {
      setView('list');
      setSelected({ kind: 'person', id: cid });
      navigate(location.pathname, { replace: true, state: {} });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, loading, people]);

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
              <MapIcon className="h-3.5 w-3.5" /> Mapa
            </button>
            <button onClick={() => setView('table')} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'table' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}>
              <Table2 className="h-3.5 w-3.5" /> Tabela
            </button>
            <button onClick={() => setView('heatmap')} className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium ${view === 'heatmap' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'}`}>
              <Grid3x3 className="h-3.5 w-3.5" /> Heatmap
            </button>
          </div>
          {user?.role === 'owner' && (
            <button
              onClick={syncDex}
              disabled={dexSyncing}
              title="Sincronizar contatos do DEX CRM"
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dexSyncing ? 'animate-spin' : ''}`} />
              {dexSyncing ? 'Sincronizando...' : '↻ DEX'}
            </button>
          )}
          {user?.role === 'owner' && dexPendingReview > 0 && (
            <button
              onClick={() => navigate('/dex/staging')}
              className="flex items-center gap-1 rounded-lg border border-accent/30 bg-accent/10 px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-accent/20"
            >
              {dexPendingReview} contato(s) para revisar → Revisar DEX
            </button>
          )}
          <button
            onClick={() => setEditor({ kind: 'person', mode: 'create', payload: emptyPerson() })}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <Plus className="h-3.5 w-3.5" /> Pessoa
          </button>
        </div>
      </div>

      {view === 'list' ? (
        <div className="mt-3 flex min-h-0 flex-1 gap-3">
          <div className="flex w-full min-w-0 min-h-0 flex-col md:w-[35%]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar pessoas..." className="input pl-8" />
            </div>
            {/* Filtro de temperatura (Prompt G) */}
            <div className="mt-2 flex flex-wrap gap-1">
              {TEMP_CHIPS.map((c) => (
                <button
                  key={c.label}
                  onClick={() => setTempFilter(c.key)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tempFilter === c.key ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {allTags.length > 0 && (
              <div className="relative mt-2 flex flex-wrap items-center gap-1" ref={tagMenuRef}>
                {visibleTags.map((t) => (
                  <button key={t} onClick={() => setTagFilter(tagFilter === t ? null : t)} className={`rounded-full px-2 py-0.5 text-[11px] ${tagFilter === t ? 'bg-accent text-white' : 'bg-surface2 text-ink2'}`}>
                    #{t}
                  </button>
                ))}
                {hiddenTagsCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setTagMenuOpen((v) => !v)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tagMenuOpen ? 'bg-accent text-white' : 'bg-surface2 text-ink2'}`}
                  >
                    🏷 +{hiddenTagsCount} tags
                  </button>
                )}

                {tagMenuOpen && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-72 rounded-lg border border-line bg-surface p-2 shadow-soft">
                    <input
                      autoFocus
                      value={tagMenuSearch}
                      onChange={(e) => setTagMenuSearch(e.target.value)}
                      placeholder="Filtrar tags..."
                      className="mb-2 w-full rounded-md border border-line bg-surface2 px-2 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent"
                    />
                    {menuTags.length === 0 ? (
                      <p className="px-1 py-2 text-center text-xs text-muted">Nenhuma tag encontrada.</p>
                    ) : (
                      <div className="grid max-h-52 grid-cols-2 gap-1 overflow-y-auto sm:grid-cols-3">
                        {menuTags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => chooseTag(t)}
                            title={t}
                            className={`truncate rounded-md px-2 py-1 text-left text-[11px] ${
                              tagFilter === t ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                            }`}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                    )}
                    {tagFilter && (
                      <button
                        type="button"
                        onClick={() => { setTagFilter(null); setTagMenuOpen(false); }}
                        className="mt-2 w-full text-center text-[11px] text-ink2 hover:text-accent"
                      >
                        Limpar filtro
                      </button>
                    )}
                  </div>
                )}
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      {/* Temperatura do contato (Prompt G) */}
                      {it._kind === 'person' && (
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: (TEMP_META[it.temperature] || TEMP_META.never).dot }}
                          title={`Temperatura: ${(TEMP_META[it.temperature] || TEMP_META.never).label}`}
                        />
                      )}
                      <span className="truncate text-sm font-semibold text-ink">{it.name}</span>
                      {/* Potencial de indicação alto (Prompt G) */}
                      {it._kind === 'person' && Number(proProfile[it.id]?.referral_score) >= 3 && (
                        <span className="text-[11px]" title={`Bom potencial de indicação (${proProfile[it.id].referral_score}/5)`}>🔗</span>
                      )}
                      {it._kind === 'person' && it.lifegame_person_id && (
                        <span className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">LG</span>
                      )}
                      {it._kind === 'person' && it.dex_contact_id && (
                        <span className="rounded bg-purple-100 px-1 py-0.5 text-[9px] font-medium text-purple-600" title="Importado do DEX CRM">
                          DEX
                        </span>
                      )}
                      {it._kind === 'person' && it.sector_weight != null && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                          style={{ background: sectorWeightColor(it.sector_weight) }}
                          title={`Peso setorial: ${it.sector_weight}/10`}
                        >
                          ⚡ {it.sector_weight}/10
                        </span>
                      )}
                      {it._kind === 'person' && proIds.has(it.id) && (
                        <span className="flex items-center gap-0.5 rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] font-medium text-indigo-700" title="Tem perfil profissional no Mercado">
                          <Briefcase className="h-2.5 w-2.5" /> Mercado
                        </span>
                      )}
                      {/* Status de outreach (contact_professional) — só p/ pessoas com perfil no Mercado */}
                      {it._kind === 'person' && proStatus[it.id] && OUTREACH_META[proStatus[it.id]] && (
                        <span className="flex items-center gap-1 text-[10px] text-ink2" title="Status de contato (Mercado)">
                          <span className="h-2 w-2 rounded-full" style={{ background: OUTREACH_META[proStatus[it.id]].dot }} />
                          {OUTREACH_META[proStatus[it.id]].label}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-[11px] text-ink2">
                      {it._kind === 'person'
                        ? subtitleForPerson(it)
                        : INSTITUTION_TYPES.find(([t]) => t === it.type)?.[1] || 'Instituição'}
                    </p>
                    {it._kind === 'person' && <StrengthDots value={it.connection_strength || 0} />}
                    {/* Tags no card — no máximo 3 + "+N" (mesmo padrão do Mercado) */}
                    {(it.tags || []).length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(it.tags || []).slice(0, 3).map((t) => (
                          <span key={t} className="rounded-full bg-surface2 px-1.5 py-0.5 text-[9px] text-ink2">#{t}</span>
                        ))}
                        {(it.tags || []).length > 3 && (
                          <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[9px] text-muted">+{(it.tags || []).length - 3}</span>
                        )}
                      </div>
                    )}
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
                isOwner={user?.role === 'owner'}
                hasPro={selected.kind === 'person' && proIds.has(selectedItem.id)}
                outreachStatus={proStatus[selectedItem.id]}
                proProfile={proProfile[selectedItem.id] || null}
                onChangeOutreach={(s) => changeOutreach(selectedItem.id, s)}
                onPatchProfessional={(patch) => patchProfessional(selectedItem.id, patch)}
                onPatchPerson={(patch) => patchPerson(selectedItem.id, patch)}
                onViewMarket={() => {
                  // A sub-aba de contatos do Mercado não existe mais: vai direto
                  // à página da organização vinculada (contact_professional.organization_id)
                  // ou, se não houver vínculo, à aba Organizações do Mercado.
                  const orgId = proProfile[selectedItem.id]?.organization_id;
                  navigate(orgId ? `/market/org/${orgId}` : '/market');
                }}
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
      ) : view === 'map' ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2">
          {/* Alternância entre os dois mapas (v2.25.14) */}
          <div className="flex w-fit items-center gap-1 rounded-lg border border-line bg-surface p-1">
            <button
              type="button"
              onClick={() => setMapMode('orbital')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                mapMode === 'orbital' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              🌐 Mapa Orbital
            </button>
            <button
              type="button"
              onClick={() => setMapMode('rede')}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                mapMode === 'rede' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              🕸 Mapa de Rede
            </button>
          </div>

          <div className="min-h-0 flex-1">
            <ErrorBoundary
              fallback={({ reset }) => (
                <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-surface p-8 text-center">
                  <p className="text-sm font-medium text-ink">Erro ao carregar mapa — tente recarregar</p>
                  <div className="flex gap-2">
                    <button onClick={reset} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink2 hover:bg-surface2">Tentar de novo</button>
                    <button onClick={() => setView('list')} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover">Voltar à lista</button>
                  </div>
                </div>
              )}
            >
              {mapMode === 'orbital' ? (
                <NetworkMap
                  people={Array.isArray(people) ? people : []}
                  institutions={Array.isArray(institutions) ? institutions : []}
                  connections={Array.isArray(connections) ? connections : []}
                  personRoles={Array.isArray(personRoles) ? personRoles : []}
                  contactOrgLinks={Array.isArray(contactOrgLinks) ? contactOrgLinks : []}
                  proStatus={proStatus}
                  interactionData={interactionData}
                  onSelect={(kind, id) => { setView('list'); setSelected({ kind, id }); }}
                  onViewOrg={(id) => navigate(`/market/org/${id}`)}
                />
              ) : (
                <NetworkMapRede
                  people={Array.isArray(people) ? people : []}
                  institutions={Array.isArray(institutions) ? institutions : []}
                  connections={Array.isArray(connections) ? connections : []}
                  contactOrgLinks={Array.isArray(contactOrgLinks) ? contactOrgLinks : []}
                  personRoles={Array.isArray(personRoles) ? personRoles : []}
                  onOpenPerson={(id) => { setView('list'); setSelected({ kind: 'person', id }); }}
                />
              )}
            </ErrorBoundary>
          </div>
        </div>
      ) : view === 'table' ? (
        <div className="mt-3 min-h-0 flex-1">
          <NetworkTable
            people={items}
            interactionData={interactionData}
            proProfile={proProfile}
            proStatus={proStatus}
            onSelect={(id) => { setSelected({ kind: 'person', id }); setView('list'); }}
          />
        </div>
      ) : (
        <div className="mt-3 min-h-0 flex-1">
          <SectorHeatmap
            people={people}
            institutions={institutions}
            contactOrgLinks={contactOrgLinks}
            proProfile={proProfile}
          />
        </div>
      )}

      {editor && (
        <NetworkEditor
          editor={editor}
          institutions={institutions}
          people={people}
          connections={connections}
          areas={areas}
          projects={projects}
          fronts={fronts}
          tasks={tasksInStore}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); loadAll(); }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
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

// Estrelas 0-5 para relevância (PhD/Emprego/Spin-off) no detalhe da pessoa.
function RelevanceStars({ label, value }) {
  const v = Math.max(0, Math.min(5, Number(value) || 0));
  return (
    <div className="rounded-lg border border-line px-2 py-1.5 text-center">
      <div className="text-[10px] font-medium text-ink2">{label}</div>
      <div className="mt-0.5 text-xs">
        <span className="text-amber-500">{'★'.repeat(v)}</span>
        <span className="text-line">{'★'.repeat(5 - v)}</span>
      </div>
    </div>
  );
}

// --- Prompt G: seções de enriquecimento de contato -----------------------

// "Como se conheceram" — seletor de contexto + notas (auto-save no blur).
function AcquaintanceSection({ profile, onPatch }) {
  const [ctx, setCtx] = useState(profile.acquaintance_context || '');
  const [notes, setNotes] = useState(profile.acquaintance_notes || '');
  useEffect(() => {
    setCtx(profile.acquaintance_context || '');
    setNotes(profile.acquaintance_notes || '');
  }, [profile.person_id]);
  const chooseCtx = (v) => { const nv = ctx === v ? '' : v; setCtx(nv); onPatch && onPatch({ acquaintance_context: nv }); };
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase text-muted">Como se conheceram</p>
      <div className="flex flex-wrap gap-1.5">
        {ACQUAINTANCE_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => chooseCtx(k)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${ctx === k ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'}`}
          >
            {ACQUAINTANCE_META[k].emoji} {ACQUAINTANCE_META[k].label}
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => onPatch && onPatch({ acquaintance_notes: notes })}
        placeholder={ctx === 'referral' ? 'Indicado por quem?' : 'Ex.: "Conheci na conferência de energia H2 2025"'}
        className="input mt-2 resize-y"
      />
    </div>
  );
}

// "Potencial de indicação" — slider de 0-5 estrelas + notas (auto-save no blur).
function ReferralSection({ profile, onPatch }) {
  const [notes, setNotes] = useState(profile.referral_potential || '');
  useEffect(() => { setNotes(profile.referral_potential || ''); }, [profile.person_id]);
  const score = Number(profile.referral_score) || 0;
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase text-muted">Potencial de indicação</p>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onPatch && onPatch({ referral_score: score === n ? 0 : n })} title={`${n}/5`}>
            <Star className={`h-5 w-5 ${n <= score ? 'fill-amber-400 text-amber-400' : 'text-muted opacity-40'}`} />
          </button>
        ))}
        <span className="ml-2 text-xs text-ink2">{score}/5</span>
      </div>
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => onPatch && onPatch({ referral_potential: notes })}
        placeholder="Pode me indicar para… (ex.: cargo, projeto, pessoa)"
        className="input mt-2"
      />
    </div>
  );
}

// "Peso setorial" (v2.25.9) — avaliação manual 1-10 de quanta influência a
// pessoa tem no setor, com justificativa (markdown) + fontes + autoria.
// sectorWeightLabel/sectorWeightColor vivem em ./networkShared.js,
// compartilhados com o Mapa de Rede.
function fmtDDMM(unixSeconds) {
  if (!unixSeconds) return '';
  const d = new Date(unixSeconds * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Fontes: texto livre com links separados por vírgula/quebra de linha —
// renderiza os que parecem URL como <a>, o resto como texto simples.
function SourcesList({ sources }) {
  const parts = String(sources || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {parts.map((s, i) => (
        /^https?:\/\//i.test(s) ? (
          <a key={i} href={s} target="_blank" rel="noreferrer" className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 hover:underline">
            {truncate(s.replace(/^https?:\/\//, ''), 28)}
          </a>
        ) : (
          <span key={i} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2">{s}</span>
        )
      ))}
    </div>
  );
}
function SectorWeightSection({ person, onPatch }) {
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState(person.sector_weight || 5);
  const [notes, setNotes] = useState(person.sector_weight_notes || '');
  const [sources, setSources] = useState(person.sector_weight_sources || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditing(false);
    setScore(person.sector_weight || 5);
    setNotes(person.sector_weight_notes || '');
    setSources(person.sector_weight_sources || '');
  }, [person.id]);

  const save = async () => {
    setSaving(true);
    try {
      await onPatch({ sector_weight: score, sector_weight_notes: notes, sector_weight_sources: sources });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };
  const cancel = () => {
    setScore(person.sector_weight || 5);
    setNotes(person.sector_weight_notes || '');
    setSources(person.sector_weight_sources || '');
    setEditing(false);
  };

  if (!editing && person.sector_weight == null) {
    return (
      <div>
        <p className="mb-1 text-xs font-semibold uppercase text-muted">Peso setorial</p>
        <button type="button" onClick={() => setEditing(true)} className="text-sm text-muted hover:text-accent hover:underline">
          + Avaliar peso setorial
        </button>
      </div>
    );
  }

  if (!editing) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted">Peso setorial</p>
          <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1 text-[11px] text-accent hover:underline">
            <Pencil className="h-3 w-3" /> Editar
          </button>
        </div>
        <span
          className="inline-flex items-center rounded-lg px-3 py-1 text-lg font-bold text-white"
          style={{ background: sectorWeightColor(person.sector_weight) }}
        >
          {person.sector_weight}/10
        </span>
        <p className="mt-1 text-[11px] text-ink2">{sectorWeightLabel(person.sector_weight)}</p>
        {person.sector_weight_notes && <MarkdownViewer content={person.sector_weight_notes} className="mt-2 text-sm" />}
        <SourcesList sources={person.sector_weight_sources} />
        {person.sector_weight_updated_at && (
          <p className="mt-1.5 text-[11px] text-muted">
            Avaliado em {fmtDDMM(person.sector_weight_updated_at)}
            {person.sector_weight_updated_by_name ? ` por ${person.sector_weight_updated_by_name}` : ''}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface2 p-3">
      <p className="mb-1 text-xs font-semibold uppercase text-muted">Peso setorial</p>
      <div className="flex items-center gap-3">
        <input
          type="range" min="1" max="10" step="1" value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="flex-1 accent-[#6366f1]"
        />
        <span className="w-10 shrink-0 text-center text-sm font-bold text-ink">{score}/10</span>
      </div>
      <p className="mt-1 text-[11px] text-ink2">{sectorWeightLabel(score)}</p>
      <textarea
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Por que tem esse peso? Ex: Coordena projeto EU €23.5M, publica em journals Q1..."
        className="input mt-2 resize-y"
      />
      <input
        value={sources}
        onChange={(e) => setSources(e.target.value)}
        placeholder="Links: Scopus, ORCID, LinkedIn, EU..."
        className="input mt-2"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button type="button" onClick={cancel} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink2 hover:bg-surface2">Cancelar</button>
        <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// Histórico de interações estruturado — lista + formulário inline + exclusão.
const EMPTY_INTERACTION = { interaction_type: 'email_sent', date: '', summary: '', outcome: '', next_step: '', next_step_date: '' };
function InteractionsSection({ personId }) {
  const [list, setList] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_INTERACTION, date: todayISO() });
  const [saving, setSaving] = useState(false);

  const load = () => apiFetch(`/api/network/people/${personId}/interactions`)
    .then((r) => setList(Array.isArray(r) ? r : []))
    .catch(() => setList([]));
  useEffect(() => {
    setAdding(false);
    setForm({ ...EMPTY_INTERACTION, date: todayISO() });
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const save = async () => {
    setSaving(true);
    try {
      await apiFetch(`/api/network/people/${personId}/interactions`, { method: 'POST', body: JSON.stringify(form) });
      setForm({ ...EMPTY_INTERACTION, date: todayISO() });
      setAdding(false);
      load();
    } catch { /* silencioso — mantém o formulário aberto */ } finally { setSaving(false); }
  };
  const del = async (id) => {
    await apiFetch(`/api/network/people/${personId}/interactions/${id}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase text-muted">Histórico de interações</p>
        <button type="button" onClick={() => setAdding((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          <Plus className="h-3.5 w-3.5" /> Registrar
        </button>
      </div>

      {adding && (
        <div className="mb-3 space-y-2 rounded-lg border border-line bg-surface2 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <select value={form.interaction_type} onChange={(e) => set({ interaction_type: e.target.value })} className="input">
              {INTERACTION_ORDER.map((k) => <option key={k} value={k}>{INTERACTION_META[k].emoji} {INTERACTION_META[k].label}</option>)}
            </select>
            <input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} className="input" />
          </div>
          <textarea rows={2} value={form.summary} onChange={(e) => set({ summary: e.target.value })} placeholder="O que aconteceu?" className="input resize-y" />
          <input value={form.outcome} onChange={(e) => set({ outcome: e.target.value })} placeholder="Resultado / resposta" className="input" />
          <div className="grid grid-cols-2 gap-2">
            <input value={form.next_step} onChange={(e) => set({ next_step: e.target.value })} placeholder="Próximo passo" className="input" />
            <input type="date" value={form.next_step_date} onChange={(e) => set({ next_step_date: e.target.value })} className="input" title="Data do próximo passo (agenda lembrete)" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink2 hover:bg-surface2">Cancelar</button>
            <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-60">
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <p className="text-[11px] text-muted">Nenhuma interação registrada.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((it) => {
            const meta = INTERACTION_META[it.interaction_type] || INTERACTION_META.other;
            return (
              <li key={it.id} className="group rounded-lg border border-line px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                    {meta.emoji} {meta.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted">{fmtDateBR(it.date)}</span>
                    <button type="button" onClick={() => del(it.id)} title="Excluir" className="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {it.summary && <p className="mt-1 text-sm text-ink">{it.summary}</p>}
                {it.outcome && <p className="mt-0.5 text-xs italic text-muted">{it.outcome}</p>}
                {it.next_step && (
                  <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                    → {it.next_step}{it.next_step_date ? ` · ${fmtDateBR(it.next_step_date)}` : ''}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Seção colapsável de tags no painel de detalhe — recolhida por padrão quando
// há mais de 6 tags (evita empurrar o resto do painel para baixo). A `key`
// no local de uso (item.id) garante que o estado de aberto/fechado seja
// recalculado do zero ao trocar de pessoa, em vez de "vazar" entre seleções.
function TagsSection({ tags, onEdit }) {
  const [open, setOpen] = useState(tags.length <= 6);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase text-muted"
      >
        <span>Tags ({tags.length})</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span key={t} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2">#{t}</span>
          ))}
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              title="Editar tags"
              className="flex items-center gap-1 rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-ink2 transition hover:bg-surface2"
            >
              <Pencil className="h-3 w-3" /> Editar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPanel({ item, kind, people, connections, isOwner, hasPro, outreachStatus, proProfile, onChangeOutreach, onPatchProfessional, onPatchPerson, onViewMarket, onEdit, onDelete, onReloadConnections }) {
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
                {isPerson && (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: (TEMP_META[item.temperature] || TEMP_META.never).dot }}
                    title={`Temperatura: ${(TEMP_META[item.temperature] || TEMP_META.never).label}`}
                  />
                )}
                <h2 className="text-lg font-bold text-ink">{item.name}</h2>
                <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink2">
                  {isPerson ? 'Pessoa' : (INSTITUTION_TYPES.find(([t]) => t === item.type)?.[1] || 'Instituição')}
                </span>
                {isPerson && item.dex_contact_id && (
                  <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[9px] font-medium text-purple-600" title="Importado do DEX CRM">
                    DEX
                  </span>
                )}
              </div>
              {!isPerson && (
                <p className="text-xs text-ink2">{[item.area].filter(Boolean).join(' · ')}</p>
              )}
              {isPerson && (() => {
                const current = item.roles && item.roles.length > 0
                  ? (item.roles.find((r) => r.current) || item.roles[0])
                  : null;
                if (current) {
                  const label = [current.role, current.institution_name].filter(Boolean).join(' @ ');
                  return label ? <p className="text-xs font-medium text-accent">Função atual: {label}</p> : null;
                }
                const fallback = [item.role, item.institution].filter(Boolean).join(' · ');
                return fallback ? <p className="text-xs text-ink2">{fallback}</p> : null;
              })()}
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
        {/* Staleness (v2.25.14) — badge + toggle de monitoramento, owner only */}
        {isPerson && (
          <StalenessSection key={item.id} entityType="person" entityId={item.id} isOwner={isOwner} />
        )}

        {isPerson && hasPro && (
          <button
            type="button"
            onClick={onViewMarket}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 transition hover:bg-indigo-100"
          >
            <Briefcase className="h-4 w-4" /> Ver organização no Mercado →
          </button>
        )}

        {/* Status de contato (outreach) — editável; só p/ pessoas com perfil no Mercado */}
        {isPerson && hasPro && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase text-muted">Status de contato</p>
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: (OUTREACH_META[outreachStatus] || OUTREACH_META.not_contacted).dot }}
              />
              <select
                value={outreachStatus || 'not_contacted'}
                onChange={(e) => onChangeOutreach && onChangeOutreach(e.target.value)}
                className="input"
              >
                {OUTREACH_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{OUTREACH_META[s].label}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Relevância (PhD/Emprego/Spin-off) + próxima ação — do contact_professional (Mercado) */}
        {isPerson && hasPro && proProfile && (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <RelevanceStars label="PhD" value={proProfile.relevance_for_phd} />
              <RelevanceStars label="Emprego" value={proProfile.relevance_for_job} />
              <RelevanceStars label="Spin-off" value={proProfile.relevance_for_spinoff} />
            </div>
            {(proProfile.next_action || proProfile.next_action_date) && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <span className="font-semibold">Próxima ação:</span>{' '}
                {proProfile.next_action || '—'}
                {proProfile.next_action_date ? ` · ${proProfile.next_action_date}` : ''}
              </div>
            )}
          </div>
        )}

        {/* Peso setorial — avaliação manual de influência no setor (v2.25.9) */}
        {isPerson && <SectorWeightSection person={item} onPatch={onPatchPerson} />}

        {/* Como se conheceram (Prompt G) — só p/ pessoas com perfil no Mercado */}
        {isPerson && hasPro && (
          <AcquaintanceSection profile={proProfile || {}} onPatch={onPatchProfessional} />
        )}

        {/* Potencial de indicação (Prompt G) */}
        {isPerson && hasPro && (
          <ReferralSection profile={proProfile || {}} onPatch={onPatchProfessional} />
        )}

        {/* Histórico de interações (Prompt G) — para qualquer pessoa */}
        {isPerson && <InteractionsSection personId={item.id} />}

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

        {isPerson && item.dex_contact_id && (
          <a
            href={`https://getdex.com/appv3/contacts/${item.dex_contact_id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50"
          >
            🔗 Ver no DEX
          </a>
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
          <TagsSection key={item.id} tags={item.tags} onEdit={onEdit} />
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

        {/* Assistente de outreach (rascunho de email) — owner only, v2.25.10 */}
        {isPerson && isOwner && <OutreachSection key={item.id} personId={item.id} item={item} />}
      </div>
    </div>
  );
}

// Assistente de outreach (v2.25.10) — coleta propósito + contexto (auto-
// preenchido a partir de GET /api/network/people/:id/outreach-context na
// primeira expansão) e gera um rascunho de email via POST /api/ai/draft-email.
const OUTREACH_PURPOSES = [
  { key: 'cold', label: 'Apresentação inicial (cold outreach)' },
  { key: 'followup', label: 'Follow-up após evento' },
  { key: 'collab', label: 'Colaboração em projeto' },
  { key: 'phd', label: 'Oportunidade PhD/pesquisa' },
  { key: 'other', label: 'Outro' },
];
const OUTREACH_USER_CONTEXT_DEFAULT =
  'Lauro Oliveira, EngD candidate at University of Twente, PSE group, developing dynamic simulation tool for H2 plants';

function buildOutreachPersonContext(item, ctx) {
  const roles = ctx?.roles || [];
  const current = roles[0];
  const role = current?.role || item.role || '';
  const org = current?.org_name || current?.institution_name || item.institution || '';
  const notes = ctx?.person?.notes || item.notes || '';
  let text = item.name;
  text += role ? ` is ${role}` : ' is a contact';
  text += org ? ` at ${org}` : '';
  text += notes ? `, working on ${notes}` : '';
  return `${text}.`;
}
function buildOutreachConnectionContext(ctx) {
  const p = ctx?.person;
  if (!p) return '';
  const label = ACQUAINTANCE_META[p.acquaintance_context]?.label || '';
  return [label, p.acquaintance_notes].filter(Boolean).join(' — ');
}
function buildOutreachEventsContext(ctx) {
  const events = ctx?.upcomingEvents || [];
  if (!events.length) return '';
  return events.map((e) => `${e.acronym || e.name} (${fmtDateBR(e.date_start)})`).join(', ');
}

function OutreachSection({ personId, item }) {
  const [open, setOpen] = useState(false);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [ctxLoaded, setCtxLoaded] = useState(false);
  const [purpose, setPurpose] = useState('cold');
  const [purposeOther, setPurposeOther] = useState('');
  const [userContext, setUserContext] = useState(OUTREACH_USER_CONTEXT_DEFAULT);
  const [personContext, setPersonContext] = useState(() => buildOutreachPersonContext(item, null));
  const [connectionContext, setConnectionContext] = useState('');
  const [eventsContext, setEventsContext] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [draft, setDraft] = useState(null);

  const loadContext = async () => {
    setLoadingCtx(true);
    try {
      const ctx = await apiFetch(`/api/network/people/${personId}/outreach-context`);
      setPersonContext(buildOutreachPersonContext(item, ctx));
      setConnectionContext(buildOutreachConnectionContext(ctx));
      setEventsContext(buildOutreachEventsContext(ctx));
    } catch { /* mantém os defaults locais já preenchidos */ }
    finally {
      setLoadingCtx(false);
      setCtxLoaded(true);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !ctxLoaded) loadContext();
  };

  const generate = async () => {
    setGenerating(true);
    setGenError('');
    try {
      const purposeLabel = purpose === 'other'
        ? (purposeOther || 'Outro')
        : OUTREACH_PURPOSES.find((p) => p.key === purpose)?.label;
      const res = await apiFetch('/api/ai/draft-email', {
        method: 'POST',
        body: JSON.stringify({ purpose: purposeLabel, personContext, userContext, connectionContext, eventsContext }),
      });
      setDraft(res);
    } catch (e) {
      setGenError(String(e.message || e).slice(0, 200));
    } finally {
      setGenerating(false);
    }
  };

  const copyAll = () => {
    if (!draft) return;
    const text = `${draft.subject}\n\n${draft.body}`;
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const gmailHref = draft
    ? `mailto:${encodeURIComponent(item.email || '')}?subject=${encodeURIComponent(draft.subject || '')}&body=${encodeURIComponent(draft.body || '')}`
    : '#';

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase text-muted"
      >
        <span>✉ Preparar email de contato</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-line bg-surface2 p-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase text-muted">1. Propósito</p>
            <div className="space-y-1.5">
              {OUTREACH_PURPOSES.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name={`outreach-purpose-${personId}`}
                    checked={purpose === p.key}
                    onChange={() => setPurpose(p.key)}
                    className="accent-accent"
                  />
                  {p.label}
                </label>
              ))}
              {purpose === 'other' && (
                <input
                  value={purposeOther}
                  onChange={(e) => setPurposeOther(e.target.value)}
                  placeholder="Descreva o propósito..."
                  className="input mt-1"
                />
              )}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase text-muted">
              2. Contexto {loadingCtx && '(carregando…)'}
            </p>
            <label className="block text-[11px] text-ink2">
              Sobre você:
              <textarea rows={2} value={userContext} onChange={(e) => setUserContext(e.target.value)} className="input mt-1 resize-y text-xs" />
            </label>
            <label className="block text-[11px] text-ink2">
              Sobre a pessoa:
              <textarea rows={2} value={personContext} onChange={(e) => setPersonContext(e.target.value)} className="input mt-1 resize-y text-xs" />
            </label>
            <label className="block text-[11px] text-ink2">
              Contexto de conexão:
              <textarea rows={2} value={connectionContext} onChange={(e) => setConnectionContext(e.target.value)} placeholder="Como vocês se conheceram..." className="input mt-1 resize-y text-xs" />
            </label>
            <label className="block text-[11px] text-ink2">
              Eventos em comum:
              <textarea rows={2} value={eventsContext} onChange={(e) => setEventsContext(e.target.value)} placeholder="Nenhum evento próximo identificado" className="input mt-1 resize-y text-xs" />
            </label>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            {generating ? 'Gerando rascunho...' : 'Gerar rascunho'}
          </button>

          {genError && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">{genError}</p>
          )}

          {draft && (
            <div className="rounded-lg border border-indigo-200 bg-white p-3">
              <p className="text-sm font-bold text-ink">{draft.subject}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink2">{draft.body}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={copyAll} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2">
                  <Copy className="h-3.5 w-3.5" /> Copiar tudo
                </button>
                <a href={gmailHref} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2">
                  <Send className="h-3.5 w-3.5" /> Abrir no Gmail
                </a>
                <button type="button" onClick={generate} disabled={generating} className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 disabled:opacity-60">
                  <RotateCcw className="h-3.5 w-3.5" /> Regenerar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// SVG map with strength-coded edges, institution rectangles, zoom/pan, and
// click-to-select (destaca o nó + popup; a navegação fica nos botões do popup).
// Layout is a fixed circle around Lauro; no physics so the picture stays stable
// across re-renders. Zoom/pan são aplicados via transform num <g> interno — o
// viewBox permanece fixo, então as coordenadas de tela do popup = pan + zoom·nó.
const PAN_STEP = 40; // deslocamento por tecla de seta (unidades de viewBox)
// Converte os raios normalizados dos sliders (0..2) em unidades de viewBox.
const RBASE = 460;
function NetworkMap({ people, institutions, connections, personRoles, contactOrgLinks = [], proStatus = {}, interactionData = {}, onSelect, onViewOrg }) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 600 });
  // Seleção (destaque + popup) — substitui o antigo "focusId".
  const [selectedNode, setSelectedNode] = useState(null); // { id, type } | null
  // Zoom & pan.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  // Distingue um "arrastar" (pan) de um clique no vazio (deselecionar).
  const draggedRef = useRef(false);
  // Ajustes de layout (painel "⚙ Ajustes"): raios dos anéis ajustáveis ao vivo.
  const [showSettings, setShowSettings] = useState(false);
  const [outerRadius, setOuterRadius] = useState(0.55); // anel externo (pessoas)
  const [innerRadius, setInnerRadius] = useState(0.30);  // anel interno (organizações)
  // v2.25.9 — modo de cor, filtro por tag e filtro por organização.
  const [colorMode, setColorMode] = useState('temperature'); // 'temperature' | 'sector'
  const [tagFilter, setTagFilter] = useState('');
  const [orgFilter, setOrgFilter] = useState('');

  const allTags = useMemo(() => {
    const s = new Set();
    (Array.isArray(people) ? people : []).forEach((p) => (p.tags || []).forEach((t) => s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [people]);

  // Pessoas vinculadas à organização selecionada (person_roles + contact_org_links).
  const orgPeopleIds = useMemo(() => {
    if (!orgFilter) return null;
    const s = new Set();
    (Array.isArray(personRoles) ? personRoles : []).forEach((r) => {
      if (r && r.person_id && r.institution_id === orgFilter) s.add(r.person_id);
    });
    (Array.isArray(contactOrgLinks) ? contactOrgLinks : []).forEach((r) => {
      if (r && r.person_id && r.organization_id === orgFilter) s.add(r.person_id);
    });
    return s;
  }, [orgFilter, personRoles, contactOrgLinks]);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = Math.max(500, Number.isFinite(r.width) ? r.width : 900);
      const h = Math.max(450, Number.isFinite(r.height) ? r.height : 600);
      setSize({ w, h });
    };
    update();
    // ResizeObserver garante que a SVG redimensione quando o container
    // ganhar altura após o mount (mudança de tab, abrir/fechar sidebar etc.).
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(update);
      ro.observe(el);
    }
    window.addEventListener('resize', update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Guarantee positive viewBox even before measurement settles.
  const safeW = Math.max(100, Number(size.w) || 900);
  const safeH = Math.max(100, Number(size.h) || 600);

  // Sistema de coordenadas centrado na origem (0,0), com Lauro no centro. O
  // viewBox cresce com o raio externo para nunca cortar os nós quando o usuário
  // espalha o grafo (Problema 3).
  const lauroPos = { x: 0, y: 0 };
  const vbSize = Math.max(600, outerRadius * 1400);
  const vbMin = -vbSize / 2;
  // Fator viewBox→pixels (preserveAspectRatio "xMidYMid meet" ⇒ escala uniforme
  // + letterbox). Usado para posicionar o popup e p/ o pan seguir o cursor 1:1.
  const vScale = Math.min(safeW, safeH) / vbSize;
  const vbTx = (safeW - vbSize * vScale) / 2;
  const vbTy = (safeH - vbSize * vScale) / 2;

  // Stable circular layout: people on the outer ring, institutions on a
  // smaller inner ring. Order is the array order (already sorted by name).
  const personNodes = useMemo(() => {
    const list = Array.isArray(people) ? people.filter((p) => p && p.id) : [];
    // Anel externo ajustável (slider "Raio do anel externo"), em torno da origem.
    const r = outerRadius * RBASE;
    const denom = Math.max(1, list.length);
    return list.map((p, i) => {
      const angle = (i / denom) * Math.PI * 2;
      // Nós um pouco menores quando há muita gente no anel.
      const radius = 9 + Math.min(11, (Number(p.connection_strength) || 0) * 1.1);
      return {
        ...p, _kind: 'person',
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
        radius,
      };
    });
  }, [people, outerRadius]);

  const institutionNodes = useMemo(() => {
    const list = Array.isArray(institutions) ? institutions.filter((i) => i && i.id) : [];
    // Anel interno ajustável (slider "Raio do anel interno"), em torno da origem.
    const r = innerRadius * RBASE;
    const denom = Math.max(1, list.length);
    return list.map((it, i) => {
      const angle = (i / denom) * Math.PI * 2 + Math.PI / 4;
      // Nome completo da organização em 2 linhas dentro do retângulo (v2.5.5).
      const words = String(it.name || '').split(' ').filter(Boolean);
      const half = Math.ceil(words.length / 2);
      const line1 = words.slice(0, half).join(' ');
      const line2 = words.slice(half).join(' ');
      const longest = Math.max(line1.length, line2.length, 1);
      const width = Math.max(54, Math.min(160, longest * 6.4 + 12));
      return {
        ...it, _kind: 'institution',
        x: r * Math.cos(angle),
        y: r * Math.sin(angle),
        width, height: 32, line1, line2,
      };
    });
  }, [institutions, innerRadius]);

  const nodeIndex = useMemo(() => {
    const m = {};
    personNodes.forEach((n) => { if (n && n.id) m[n.id] = n; });
    institutionNodes.forEach((n) => { if (n && n.id) m[n.id] = n; });
    return m;
  }, [personNodes, institutionNodes]);

  // Fallback por NOME da organização. Necessário porque a migração 0030
  // (consolidação network_institutions → market_organizations) zerou o
  // institution_id da maioria das funções (só UTwente e Novel-T foram
  // reapontados; o resto virou NULL preservando apenas institution_name).
  // Assim, funções antigas com nome mas sem id ainda conseguem ligar ao nó da
  // organização correspondente no Mercado quando o nome bate.
  const instByName = useMemo(() => {
    const m = {};
    institutionNodes.forEach((n) => {
      const k = normName(n.name);
      if (k && !(k in m)) m[k] = n;
    });
    return m;
  }, [institutionNodes]);

  // Group p2p connections by unordered pair for curve offsets when multiple
  // edges exist between the same two people.
  const connWithCurve = useMemo(() => {
    const list = Array.isArray(connections) ? connections.filter((c) => c && c.person_a_id && c.person_b_id) : [];
    const seenByPair = new Map();
    return list.map((c) => {
      const key = [c.person_a_id, c.person_b_id].sort().join('|');
      const seen = seenByPair.get(key) || 0;
      seenByPair.set(key, seen + 1);
      return { ...c, _curveIndex: seen };
    });
  }, [connections]);

  const safeRoles = Array.isArray(personRoles) ? personRoles : [];
  const conns = Array.isArray(connections) ? connections : [];
  const selId = selectedNode?.id || null;
  // Nó dimmed quando há seleção e ele não é o selecionado nem está conectado a ele.
  const isDimmed = (id) => selId && selId !== id && !connectsTo(selId, id, conns, safeRoles);
  // Aresta destacada quando toca o nó selecionado.
  const isSelEdge = (aId, bId) => selId && (aId === selId || bId === selId);
  // v2.25.9 — dimming por filtro de tag/organização (independente da seleção).
  const isTagFiltered = (person) => tagFilter && !(person.tags || []).includes(tagFilter);
  const isOrgFiltered = (personId) => orgPeopleIds && !orgPeopleIds.has(personId);
  // Cor do nó de pessoa conforme o modo escolhido (temperatura ou peso setorial).
  const personNodeColor = (n) => (
    colorMode === 'sector'
      ? sectorWeightColor(n.sector_weight)
      : (TEMP_META[n.temperature] || TEMP_META.never).dot
  );

  // Zoom com a roda do mouse — listener nativo não-passivo p/ permitir preventDefault.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom((z) => Math.min(5, Math.max(0.5, z - e.deltaY * 0.001)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Atalhos de teclado: Esc (deselecionar), +/- (zoom), setas (pan).
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      switch (e.key) {
        case 'Escape': setSelectedNode(null); break;
        case '+': case '=': e.preventDefault(); setZoom((z) => Math.min(5, z + 0.2)); break;
        case '-': case '_': e.preventDefault(); setZoom((z) => Math.max(0.5, z - 0.2)); break;
        case 'ArrowUp': e.preventDefault(); setPan((p) => ({ ...p, y: p.y + PAN_STEP })); break;
        case 'ArrowDown': e.preventDefault(); setPan((p) => ({ ...p, y: p.y - PAN_STEP })); break;
        case 'ArrowLeft': e.preventDefault(); setPan((p) => ({ ...p, x: p.x + PAN_STEP })); break;
        case 'ArrowRight': e.preventDefault(); setPan((p) => ({ ...p, x: p.x - PAN_STEP })); break;
        default: break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debug (apenas em dev): confirma que os ids dos nós de organização batem com
  // os institution_id das funções — diagnóstico do "links institucionais não
  // aparecem". Ver comentário em instByName.
  useEffect(() => {
    if (!import.meta.env?.DEV) return;
    console.log('Org node ids:', institutionNodes.filter((n) => n._kind === 'institution').map((n) => n.id).slice(0, 3));
    console.log('Role institution_ids:', (Array.isArray(personRoles) ? personRoles : []).slice(0, 3).map((r) => r.institution_id));
  }, [institutionNodes, personRoles]);

  const startPan = (e) => {
    draggedRef.current = false;
    setIsPanning(true);
    // Guarda o ponto inicial em pixels + o pan atual (unidades de viewBox).
    setPanStart({ px: e.clientX, py: e.clientY, panX: pan.x, panY: pan.y });
  };
  const movePan = (e) => {
    if (!isPanning) return;
    const dxPix = e.clientX - panStart.px;
    const dyPix = e.clientY - panStart.py;
    if (Math.abs(dxPix) > 2 || Math.abs(dyPix) > 2) draggedRef.current = true;
    // Converte o delta de pixels para unidades de viewBox p/ acompanhar o cursor.
    setPan({ x: panStart.panX + dxPix / vScale, y: panStart.panY + dyPix / vScale });
  };
  const endPan = () => setIsPanning(false);
  // Clique no fundo vazio: deseleciona — a menos que tenha acabado de arrastar.
  const bgClick = () => {
    if (draggedRef.current) { draggedRef.current = false; return; }
    setSelectedNode(null);
  };
  const pickNode = (type, id) => { draggedRef.current = false; setSelectedNode({ id, type }); };
  const zoomIn = () => setZoom((z) => Math.min(5, z + 0.2));
  const zoomOut = () => setZoom((z) => Math.max(0.5, z - 0.2));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  // "Zoom to fit": enquadra todos os nós (pessoas, orgs e o Lauro na origem)
  // dentro do viewBox, com margem. Tudo em unidades de viewBox; o <g> aplica
  // pan+zoom, então pan = -zoom·centro do bbox leva o centro à origem.
  const zoomToFit = () => {
    if (personNodes.length === 0 && institutionNodes.length === 0) { resetView(); return; }
    let minX = -30, minY = -30, maxX = 30, maxY = 30; // Lauro (r=30) na origem
    for (const n of personNodes) {
      const rr = (n.radius || 10) + 26; // inclui o rótulo (2 linhas) abaixo do nó
      minX = Math.min(minX, n.x - rr); maxX = Math.max(maxX, n.x + rr);
      minY = Math.min(minY, n.y - rr); maxY = Math.max(maxY, n.y + rr);
    }
    for (const n of institutionNodes) {
      const hw = (n.width || 40) / 2, hh = (n.height || 32) / 2;
      minX = Math.min(minX, n.x - hw); maxX = Math.max(maxX, n.x + hw);
      minY = Math.min(minY, n.y - hh); maxY = Math.max(maxY, n.y + hh);
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const margin = 60;
    const z = Math.max(0.5, Math.min(5, Math.min((vbSize - 2 * margin) / bw, (vbSize - 2 * margin) / bh)));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(z);
    setPan({ x: -z * cx, y: -z * cy });
  };

  // Nó selecionado + suas coordenadas de TELA (para posicionar o popup):
  // viewBox coord após o <g> = pan + zoom·nó; depois mapeia viewBox→pixels.
  const selNode = selId ? nodeIndex[selId] : null;
  const gx = selNode ? pan.x + zoom * selNode.x : 0;
  const gy = selNode ? pan.y + zoom * selNode.y : 0;
  const popupX = selNode ? vbTx + (gx - vbMin) * vScale : 0;
  const popupY = selNode ? vbTy + (gy - vbMin) * vScale : 0;

  return (
    <div ref={containerRef} className="relative h-full min-h-[600px] w-full overflow-hidden rounded-xl border border-line bg-surface">
      <svg
        ref={svgRef}
        width="100%" height="100%"
        viewBox={`${vbMin} ${vbMin} ${vbSize} ${vbSize}`}
        className={isPanning ? 'cursor-grabbing' : 'cursor-grab'}
        style={{ display: 'block' }}
        onMouseDown={startPan}
        onMouseMove={movePan}
        onMouseUp={endPan}
        onMouseLeave={endPan}
      >
        {/* Fundo capturador de cliques no vazio → deseleciona */}
        <rect x={vbMin} y={vbMin} width={vbSize} height={vbSize} fill="transparent" onClick={bgClick} />
        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
        {/* Person ↔ Institution dashed links — DUAS fontes, deduplicadas (v2.5.5):
            1) person_roles (Networking) — org por id ou, se NULL pós-migração
               0030, resolvida por NOME (instByName);
            2) contact_org_links (Mercado) — vínculo direto pessoa↔organização. */}
        {(() => {
          const drawn = new Set();
          const out = [];
          const drawOrgLink = (fromId, toId, label) => {
            if (!fromId || !toId) return;
            const key = `${fromId}-${toId}`;
            if (drawn.has(key)) return;
            drawn.add(key);
            const a = nodeIndex[fromId];
            const b = nodeIndex[toId];
            if (!a || !b) return;
            if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return;
            const hi = isSelEdge(fromId, toId);
            const dim = isDimmed(fromId) && isDimmed(toId);
            out.push(
              <line
                key={`orglink-${key}`}
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={hi ? '#6366F1' : '#9CA3AF'} strokeWidth={hi ? 2.2 : 1.2} strokeDasharray="4 4"
                opacity={dim ? 0.15 : (hi ? 1 : 0.7)}
              >
                <title>{label}</title>
              </line>
            );
          };
          // Fonte 1 — person_roles (Networking)
          safeRoles.forEach((r) => {
            if (!r || !r.person_id) return;
            const toId = r.institution_id || instByName[normName(r.institution_name)]?.id;
            if (toId) drawOrgLink(r.person_id, toId, r.role || 'vínculo');
          });
          // Fonte 2 — contact_org_links (Mercado)
          (Array.isArray(contactOrgLinks) ? contactOrgLinks : []).forEach((r) => {
            if (!r || !r.person_id || !r.organization_id) return;
            drawOrgLink(r.person_id, r.organization_id, r.role_at_org || 'vínculo (Mercado)');
          });
          return out;
        })()}

        {/* P2P connections — strength-coded color and width, curved if pair has >1 */}
        {connWithCurve.map((c) => {
          const a = nodeIndex[c.person_a_id];
          const b = nodeIndex[c.person_b_id];
          if (!a || !b) return null;
          if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) return null;
          const strength = c.strength != null ? c.strength : 5;
          const hi = isSelEdge(c.person_a_id, c.person_b_id);
          const stroke = hi ? '#6366F1' : personStrengthColor(strength);
          const width = (1 + (strength / 10) * 3) + (hi ? 1.5 : 0);
          const dim = isDimmed(c.person_a_id) && isDimmed(c.person_b_id);
          if (c._curveIndex === 0) {
            return (
              <line key={c.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stroke} strokeWidth={width} opacity={dim ? 0.15 : (hi ? 1 : 0.85)}>
                <title>{c.connection_type || 'conexão'}</title>
              </line>
            );
          }
          // Curved path for additional connections
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rawLen = Math.sqrt(dx * dx + dy * dy);
          const len = Number.isFinite(rawLen) && rawLen > 0 ? rawLen : 1;
          const offset = (c._curveIndex || 0) * 14;
          const cx = mx + (-dy / len) * offset;
          const cy = my + (dx / len) * offset;
          if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
          return (
            <path key={c.id} d={`M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`} fill="none" stroke={stroke} strokeWidth={width} opacity={dim ? 0.15 : (hi ? 1 : 0.85)}>
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

        {/* Organization rectangles — cor por tipo. Clique apenas foca/desfoca
            (organizações moram no Mercado; não há detalhe de org no Networking). */}
        {institutionNodes.map((n) => {
          const { fill, stroke } = orgTypeColor(n.type);
          const dim = isDimmed(n.id);
          const sel = selId === n.id;
          return (
            <g key={`inst-${n.id}`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); pickNode('institution', n.id); }}>
              <rect
                x={n.x - n.width / 2} y={n.y - n.height / 2} width={n.width} height={n.height}
                rx={5} fill={fill}
                stroke={sel ? '#6366f1' : stroke} strokeWidth={sel ? 3 : 1.5}
                opacity={dim ? 0.3 : 1}
                style={sel ? { filter: 'drop-shadow(0 0 6px #6366f1)' } : undefined}
              >
                <title>{n.name}</title>
              </rect>
              <text y={n.y} textAnchor="middle" fill="#1A1814" fontSize="9" fontWeight="600" opacity={dim ? 0.5 : 1} style={{ pointerEvents: 'none' }}>
                <tspan x={n.x} dy={n.line2 ? -2 : 3}>{n.line1}</tspan>
                {n.line2 && <tspan x={n.x} dy={12}>{n.line2}</tspan>}
                <title>{n.name}</title>
              </text>
            </g>
          );
        })}

        {/* Person circles — nome COMPLETO em 2 linhas abaixo do nó (v2.5.5) */}
        {personNodes.map((n) => {
          const stroke = personStrengthColor(n.connection_strength || 0);
          const filterDim = isTagFiltered(n) || isOrgFiltered(n.id);
          const selDim = isDimmed(n.id);
          const dim = filterDim || selDim;
          const opacity = filterDim ? 0.15 : (selDim ? 0.3 : 1);
          const sel = selId === n.id;
          const labelOpacity = dim ? 0.25 : Math.max(0.5, Math.min(1, (n.connection_strength || 0) / 10 + 0.3));
          const nameParts = String(n.name || '').split(' ').filter(Boolean);
          const half = Math.ceil(nameParts.length / 2);
          const line1 = nameParts.slice(0, half).join(' ');
          const line2 = nameParts.slice(half).join(' ');
          // v2.25.9 — indicadores de canal (pontinhos 4px abaixo do nome).
          const channelDots = [];
          if (n.linkedin) channelDots.push('#3B82F6'); // azul — LinkedIn
          if (n.email) channelDots.push('#6B7280'); // cinza — Email
          if ((interactionData[n.id]?.count || 0) > 0) channelDots.push('#22C55E'); // verde — interação registrada
          const dotsY = n.radius + 12 + (line2 ? 13 : 0) + 10;
          const dotsStartX = -((channelDots.length - 1) * 6) / 2;
          return (
            <g key={`p-${n.id}`} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); pickNode('person', n.id); }}>
              <circle
                cx={n.x} cy={n.y} r={n.radius} fill={personNodeColor(n)}
                stroke={sel ? '#6366f1' : stroke} strokeWidth={sel ? 3 : 2.5}
                opacity={opacity}
                style={sel ? { filter: 'drop-shadow(0 0 6px #6366f1)' } : undefined}
              />
              <text y={n.y} textAnchor="middle" fill="#1A1814" fontSize="9" opacity={labelOpacity} style={{ pointerEvents: 'none' }}>
                <tspan x={n.x} dy={n.radius + 12}>{line1}</tspan>
                {line2 && <tspan x={n.x} dy={13}>{line2}</tspan>}
              </text>
              {channelDots.length > 0 && (
                <g opacity={labelOpacity} style={{ pointerEvents: 'none' }}>
                  {channelDots.map((c, i) => (
                    <circle key={i} cx={n.x + dotsStartX + i * 6} cy={n.y + dotsY} r={2} fill={c} />
                  ))}
                </g>
              )}
            </g>
          );
        })}

          {personNodes.length === 0 && institutionNodes.length === 0 && (
            <text x={0} y={80} textAnchor="middle" fill="#9E9890" fontSize="12">
              Adicione pessoas e instituições para visualizar o mapa.
            </text>
          )}
        </g>
      </svg>

      {/* Controles de cor + filtros (canto superior esquerdo, v2.25.9) */}
      <div className="absolute left-3 top-3 flex flex-col items-start gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-white p-1 shadow-soft">
          <span className="px-1.5 text-[10px] font-medium text-muted">Colorir:</span>
          <button
            type="button" onClick={() => setColorMode('temperature')}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${colorMode === 'temperature' ? 'bg-indigo-600 text-white' : 'text-ink2 hover:bg-surface2'}`}
          >
            Temperatura
          </button>
          <button
            type="button" onClick={() => setColorMode('sector')}
            className={`rounded-md px-2 py-1 text-[11px] font-medium ${colorMode === 'sector' ? 'bg-indigo-600 text-white' : 'text-ink2 hover:bg-surface2'}`}
          >
            Peso Setorial
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white p-1.5 shadow-soft">
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded-md border border-line bg-white px-1.5 py-1 text-[11px] text-ink2">
            <option value="">Tag: Todas</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} className="rounded-md border border-line bg-white px-1.5 py-1 text-[11px] text-ink2">
            <option value="">Org: Todas</option>
            {(Array.isArray(institutions) ? institutions : []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          {(tagFilter || orgFilter) && (
            <button type="button" onClick={() => { setTagFilter(''); setOrgFilter(''); }} className="text-[11px] text-accent hover:underline">
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Controles de zoom + Ajustes (canto superior direito) */}
      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-line bg-white p-1 shadow-soft">
          <button
            type="button" onClick={zoomIn} title="Aproximar (+)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button" onClick={zoomOut} title="Afastar (−)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button" onClick={zoomToFit} title="Enquadrar tudo (zoom to fit)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button" onClick={resetView} title="Centralizar (reset)"
            className="flex h-7 w-7 items-center justify-center rounded-md text-indigo-600 hover:bg-indigo-50"
          >
            <Home className="h-4 w-4" />
          </button>
          <span className="px-1 text-[10px] tabular-nums text-muted">{Math.round(zoom * 100)}%</span>
          <button
            type="button" onClick={() => setShowSettings((v) => !v)} title="Ajustes de layout"
            aria-expanded={showSettings}
            className={`flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium ${showSettings ? 'bg-indigo-50 text-indigo-700' : 'text-indigo-600 hover:bg-indigo-50'}`}
          >
            <Settings className="h-3.5 w-3.5" /> Ajustes
          </button>
        </div>

        {showSettings && (
          <div className="w-60 rounded-lg border border-line bg-white p-3 text-[11px] shadow-soft">
            <p className="mb-2 text-[11px] font-semibold uppercase text-ink">Ajustes de layout</p>
            <label className="block">
              <span className="flex items-center justify-between text-ink2">
                <span>Raio do anel externo</span>
                <span className="tabular-nums text-muted">{outerRadius.toFixed(2)}</span>
              </span>
              <input
                type="range" min="0.3" max="2.0" step="0.05" value={outerRadius}
                onChange={(e) => setOuterRadius(Number(e.target.value))}
                className="mt-1 w-full accent-[#6366f1]"
              />
            </label>
            <label className="mt-2 block">
              <span className="flex items-center justify-between text-ink2">
                <span>Raio do anel interno</span>
                <span className="tabular-nums text-muted">{innerRadius.toFixed(2)}</span>
              </span>
              <input
                type="range" min="0.1" max="1.5" step="0.05" value={innerRadius}
                onChange={(e) => setInnerRadius(Number(e.target.value))}
                className="mt-1 w-full accent-[#6366f1]"
              />
            </label>
            <button
              type="button"
              onClick={() => { setOuterRadius(0.55); setInnerRadius(0.30); }}
              className="mt-2 text-[10px] text-accent hover:underline"
            >
              Restaurar padrão
            </button>
          </div>
        )}
      </div>

      {/* Popup de informação do nó selecionado */}
      {selNode && (
        <div
          className="absolute z-10 w-[200px] max-w-[200px] rounded-lg border border-line bg-white p-3 text-left shadow-lg"
          style={{ left: popupX, top: popupY, transform: 'translate(-50%, calc(-100% - 12px))' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button" onClick={() => setSelectedNode(null)} title="Fechar (Esc)"
            className="absolute right-1.5 top-1.5 rounded p-0.5 text-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          {selectedNode.type === 'person' ? (
            <>
              <p className="pr-4 text-sm font-semibold text-ink">{selNode.name}</p>
              <p className="mt-0.5 text-[11px] text-ink2">{subtitleForPerson(selNode)}</p>
              {proStatus[selNode.id] && OUTREACH_META[proStatus[selNode.id]] && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-ink2">
                  <span className="h-2 w-2 rounded-full" style={{ background: OUTREACH_META[proStatus[selNode.id]].dot }} />
                  {OUTREACH_META[proStatus[selNode.id]].label}
                </p>
              )}
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelect && onSelect('person', selNode.id)}
                  className="flex-1 rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-white hover:bg-accent-hover"
                >
                  Ver perfil
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="rounded-md border border-line px-2 py-1 text-[11px] text-ink2 hover:bg-surface2"
                >
                  Fechar
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="pr-4 text-sm font-semibold text-ink">{selNode.name}</p>
              <p className="mt-0.5 text-[11px] text-ink2">{ORG_TYPE_LABELS[selNode.type] || 'Organização'}</p>
              {selNode.city && <p className="text-[11px] text-muted">{selNode.city}</p>}
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => onViewOrg && onViewOrg(selNode.id)}
                  className="w-full rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700"
                >
                  Ver no Mercado →
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 max-w-xs rounded-lg border border-line bg-surface/95 p-3 text-[10px] text-ink2 shadow-soft backdrop-blur">
        <p className="mb-1.5 text-[11px] font-semibold uppercase text-ink">Força da conexão (0–10)</p>
        <div className="mb-2 flex items-center gap-1">
          {[1, 3, 5, 7, 9].map((n) => (
            <span key={n} className="h-2.5 w-6 rounded" style={{ background: personStrengthColor(n) }} title={`${n}`} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-1">
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-[#6366f1] border-2 border-[#1E1B4B]" /> Person</div>
          <div className="flex items-center gap-2"><span className="h-3 w-4 rounded-sm bg-[#E0E7FF] border border-[#4338CA]" /> Organização (cor por tipo)</div>
          <div className="flex items-center gap-2"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#6366F1" strokeWidth="2" /></svg> Conexão direta</div>
          <div className="flex items-center gap-2"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="3 3" /></svg> Vínculo institucional</div>
        </div>
        {/* Tipos de organização (cor do retângulo) */}
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
          {[['Univ.', '#E0E7FF', '#4338CA'], ['Empresa', '#FDE68A', '#B45309'], ['Instituto', '#BBF7D0', '#15803D'], ['Financiador', '#E9D5FF', '#7E22CE'], ['Outro', '#E5E7EB', '#6B7280']].map(([lbl, fill, stroke]) => (
            <span key={lbl} className="flex items-center gap-1">
              <span className="h-2.5 w-3 rounded-sm" style={{ background: fill, border: `1px solid ${stroke}` }} />{lbl}
            </span>
          ))}
        </div>
        {/* Indicadores de canal (pontinhos abaixo do nome) — v2.25.9 */}
        <div className="mt-2 flex flex-wrap gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#3B82F6]" />LinkedIn</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#6B7280]" />Email</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#22C55E]" />Interação registrada</span>
        </div>
        {/* Projetos (market_projects) não aparecem no mapa: ligam-se só a orgs
            via organization_id, sem relação direta com pessoas. Enhancement
            futuro exigiria novas tabelas de relacionamento. */}
        {selectedNode && (
          <button onClick={() => setSelectedNode(null)} className="mt-2 text-[10px] text-accent hover:underline">
            Limpar seleção
          </button>
        )}
      </div>
    </div>
  );
}

// --- Tabela (v2.25.9) --------------------------------------------------------

function fmtDateBRFromISO(iso) {
  if (!iso) return 'Nunca';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : 'Nunca';
}

// Escapa um valor pra célula CSV (aspas duplas + separador ; caso contenha vírgula/quebra/aspas).
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TABLE_COLUMNS = [
  { key: 'name', label: 'Nome' },
  { key: 'role', label: 'Cargo' },
  { key: 'org', label: 'Organização' },
  { key: 'temperature', label: 'Temp.' },
  { key: 'sector_weight', label: 'Peso ⚡' },
  { key: 'phd', label: 'PhD ★' },
  { key: 'job', label: 'Emprego ★' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'email', label: 'Email' },
  { key: 'last_interaction', label: 'Última interação' },
];

function NetworkTable({ people, interactionData, proProfile, proStatus, onSelect }) {
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  const rows = useMemo(() => {
    return (Array.isArray(people) ? people : []).map((p) => {
      const { role, org } = currentRoleOrg(p);
      const inter = interactionData?.[p.id] || null;
      return {
        id: p.id,
        name: p.name || '',
        role, org,
        temperature: p.temperature || 'never',
        sector_weight: p.sector_weight != null ? p.sector_weight : null,
        phd: Number(proProfile?.[p.id]?.relevance_for_phd) || 0,
        job: Number(proProfile?.[p.id]?.relevance_for_job) || 0,
        linkedin: p.linkedin || '',
        email: p.email || '',
        outreach_status: proStatus?.[p.id] || '',
        last_interaction: inter?.last_date || '',
      };
    });
  }, [people, interactionData, proProfile, proStatus]);

  const sorted = useMemo(() => {
    const list = [...rows];
    const dir = sortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === 'number' || typeof vb === 'number') return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
      return String(va || '').localeCompare(String(vb || ''), 'pt-BR') * dir;
    });
    return list;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const exportCsv = () => {
    const header = ['nome', 'cargo', 'org', 'email', 'linkedin', 'temperatura', 'sector_weight', 'relevancia_phd', 'relevancia_emprego', 'outreach_status', 'ultima_interacao'];
    const lines = [header.join(',')];
    sorted.forEach((r) => {
      lines.push([
        r.name, r.role, r.org, r.email, r.linkedin,
        (TEMP_META[r.temperature] || TEMP_META.never).label,
        r.sector_weight != null ? r.sector_weight : '',
        r.phd, r.job, r.outreach_status, r.last_interaction,
      ].map(csvCell).join(','));
    });
    const blob = new Blob([`﻿${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `contatos_networking_${iso}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <p className="text-xs text-muted">{sorted.length} contato(s)</p>
        <button
          type="button" onClick={exportCsv}
          className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2"
        >
          <Download className="h-3.5 w-3.5" /> Exportar CSV
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-surface2">
            <tr>
              {TABLE_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => toggleSort(c.key)}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2 font-semibold text-ink2 hover:text-ink"
                >
                  <span className="flex items-center gap-1">
                    {c.label}
                    {sortKey === c.key && (sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`cursor-pointer border-b border-line hover:bg-accent/5 ${i % 2 === 1 ? 'bg-surface2/40' : ''}`}
              >
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{r.name}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink2">{r.role || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink2">{r.org || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: (TEMP_META[r.temperature] || TEMP_META.never).dot }} />
                    {(TEMP_META[r.temperature] || TEMP_META.never).label}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {r.sector_weight != null ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: sectorWeightColor(r.sector_weight) }}>
                      {r.sector_weight}/10
                    </span>
                  ) : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-amber-500">{r.phd > 0 ? '★'.repeat(r.phd) : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-amber-500">{r.job > 0 ? '★'.repeat(r.job) : '—'}</td>
                <td className="whitespace-nowrap px-3 py-2 text-center">{r.linkedin ? <span className="text-green-600">✓</span> : <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-center">{r.email ? <span className="text-green-600">✓</span> : <span className="text-muted">—</span>}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink2">{fmtDateBRFromISO(r.last_interaction)}</td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={TABLE_COLUMNS.length} className="px-3 py-10 text-center text-muted">Nenhum contato encontrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- Heatmap (v2.25.9) -------------------------------------------------------

const HEATMAP_CRITERIA = [
  { key: 'phd', label: 'PhD' },
  { key: 'job', label: 'Emprego' },
  { key: 'spinoff', label: 'Spin-off' },
  { key: 'sector_weight', label: 'Peso Setorial' },
];

function heatmapColor(v) {
  if (v == null) return '#FFFFFF';
  if (v >= 5) return '#4338CA';
  if (v >= 4) return '#6366F1';
  if (v >= 3) return '#818CF8';
  if (v >= 2) return '#C7D2FE';
  if (v >= 1) return '#EEF2FF';
  return '#FFFFFF';
}

function SectorHeatmap({ people, institutions, contactOrgLinks, proProfile }) {
  const [popover, setPopover] = useState(null); // { orgId, key } | null

  const orgRows = useMemo(() => {
    const peopleById = {};
    (Array.isArray(people) ? people : []).forEach((p) => { peopleById[p.id] = p; });
    const linksByOrg = {};
    (Array.isArray(contactOrgLinks) ? contactOrgLinks : []).forEach((l) => {
      if (!l || !l.organization_id || !l.person_id) return;
      (linksByOrg[l.organization_id] ||= new Set()).add(l.person_id);
    });
    return (Array.isArray(institutions) ? institutions : [])
      .map((org) => {
        const personIds = [...(linksByOrg[org.id] || [])];
        if (personIds.length === 0) return null;
        const cells = {};
        HEATMAP_CRITERIA.forEach(({ key }) => {
          const values = personIds
            .map((pid) => {
              if (key === 'sector_weight') return peopleById[pid]?.sector_weight;
              const prof = proProfile?.[pid];
              if (!prof) return null;
              const raw = key === 'phd' ? prof.relevance_for_phd : key === 'job' ? prof.relevance_for_job : prof.relevance_for_spinoff;
              return raw > 0 ? raw : null;
            })
            .filter((v) => v != null);
          cells[key] = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
          cells[`${key}_people`] = personIds
            .filter((pid) => {
              const v = key === 'sector_weight'
                ? peopleById[pid]?.sector_weight
                : (proProfile?.[pid] ? (key === 'phd' ? proProfile[pid].relevance_for_phd : key === 'job' ? proProfile[pid].relevance_for_job : proProfile[pid].relevance_for_spinoff) : null);
              return v != null && v > 0;
            })
            .map((pid) => ({ id: pid, name: peopleById[pid]?.name || '?', value: key === 'sector_weight' ? peopleById[pid]?.sector_weight : (proProfile?.[pid] ? (key === 'phd' ? proProfile[pid].relevance_for_phd : key === 'job' ? proProfile[pid].relevance_for_job : proProfile[pid].relevance_for_spinoff) : null) }));
        });
        return { org, personCount: personIds.length, cells };
      })
      .filter(Boolean)
      .sort((a, b) => b.personCount - a.personCount);
  }, [people, institutions, contactOrgLinks, proProfile]);

  if (orgRows.length < 3) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface text-center text-sm text-muted">
        <Grid3x3 className="h-8 w-8 text-muted" />
        Adicione relevâncias aos contatos para ver o heatmap
      </div>
    );
  }

  return (
    <div className="relative h-full overflow-auto rounded-xl border border-line bg-surface p-3">
      <table className="w-full min-w-[520px] border-collapse text-left text-xs">
        <thead>
          <tr>
            <th className="px-2 py-2 font-semibold text-ink2">Organização</th>
            {HEATMAP_CRITERIA.map((c) => <th key={c.key} className="px-2 py-2 text-center font-semibold text-ink2">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {orgRows.map(({ org, personCount, cells }) => (
            <tr key={org.id} className="border-t border-line">
              <td className="px-2 py-2 font-medium text-ink">
                {org.name}
                <span className="ml-1.5 text-[10px] text-muted">({personCount})</span>
              </td>
              {HEATMAP_CRITERIA.map((c) => {
                const v = cells[c.key];
                return (
                  <td key={c.key} className="px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => (cells[`${c.key}_people`]?.length ? setPopover({ orgId: org.id, key: c.key }) : null)}
                      className="mx-auto flex h-9 w-16 items-center justify-center rounded-md text-sm font-semibold"
                      style={{ background: heatmapColor(v), color: v != null && v >= 3 ? '#fff' : '#3D3A34' }}
                      title={cells[`${c.key}_people`]?.length ? `${cells[`${c.key}_people`].length} pessoa(s)` : 'Sem dados'}
                    >
                      {v != null ? v.toFixed(1) : '—'}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {popover && (() => {
        const row = orgRows.find((r) => r.org.id === popover.orgId);
        const list = row?.cells?.[`${popover.key}_people`] || [];
        const critLabel = HEATMAP_CRITERIA.find((c) => c.key === popover.key)?.label || '';
        return (
          <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setPopover(null)}>
            <div className="w-full max-w-sm rounded-lg border border-line bg-white p-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">{row?.org?.name} — {critLabel}</p>
                <button type="button" onClick={() => setPopover(null)} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
              </div>
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {list.map((p) => (
                  <li key={p.id} className="flex items-center justify-between rounded-md bg-surface2 px-2 py-1 text-xs">
                    <span className="text-ink">{p.name}</span>
                    <span className="font-semibold text-accent">{p.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Normaliza um nome de organização para casar funções (por institution_name)
// com nós de organização quando o institution_id está ausente.
function normName(s) {
  return String(s || '').trim().toLowerCase();
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
function NetworkEditor({ editor, institutions, people, connections, areas, projects, fronts, tasks, onClose, onSaved }) {
  const { kind, mode, payload } = editor;
  const isPerson = kind === 'person';

  // Rascunho (v2.25.13): formulário + tags + conexões pendentes viajam juntos
  // num objeto só, persistido em `aide-draft-person-<id|new>` (ou
  // `-institution-`). Os setters abaixo mantêm exatamente a assinatura antiga,
  // então nenhum dos ~20 `setForm({ ...form, campo })` precisou mudar.
  const pristine = useMemo(() => ({
    form: {
      ...payload,
      roles: payload.roles && payload.roles.length > 0
        ? payload.roles
        : (isPerson ? [{ role: payload.role || '', institution_id: '', institution_name: payload.institution || '', start_date: '', end_date: '', current: true }] : []),
      entity_links: payload.entity_links || [],
    },
    tagInput: (payload.tags || []).join(', '),
    pendingConnections: [],
  }), [payload, isPerson]);

  const {
    value: draft, setValue: setDraft, clearDraft, discardDraft, hasDraft,
  } = useDraft(`${isPerson ? 'person' : 'institution'}-${payload.id || 'new'}`, pristine);

  const form = draft.form;
  const tagInput = draft.tagInput;
  const pendingConnections = draft.pendingConnections;   // [{ target, type }]
  const setForm = (next) =>
    setDraft((d) => ({ ...d, form: typeof next === 'function' ? next(d.form) : next }));
  const setTagInput = (v) => setDraft((d) => ({ ...d, tagInput: v }));
  const setPendingConnections = (next) =>
    setDraft((d) => ({
      ...d,
      pendingConnections: typeof next === 'function' ? next(d.pendingConnections) : next,
    }));

  // Conexões pessoa-a-pessoa: as já salvas (edição) removem na hora via DELETE;
  // as novas ficam pendentes até "Salvar" (a pessoa pode ainda nem ter id, no
  // modo criação) e são enviadas uma a uma via POST /api/network/connections.
  // `existingConns` é estado do servidor — fica FORA do rascunho de propósito.
  const [existingConns, setExistingConns] = useState(() => (
    isPerson && mode === 'edit'
      ? (connections || []).filter((c) => c.person_a_id === payload.id || c.person_b_id === payload.id)
      : []
  ));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isDirty = JSON.stringify(draft) !== JSON.stringify(pristine);
  const guard = useUnsavedGuard({ isDirty, onClose, onDiscard: discardDraft });

  const otherPersonName = (c) => {
    const otherId = c.person_a_id === payload.id ? c.person_b_id : c.person_a_id;
    const other = people.find((p) => p.id === otherId);
    return other ? other.name : '—';
  };
  const addPendingConnection = () => setPendingConnections((list) => [...list, { target: '', type: '' }]);
  const updatePendingConnection = (idx, patch) =>
    setPendingConnections((list) => list.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const removePendingConnection = (idx) =>
    setPendingConnections((list) => list.filter((_, i) => i !== idx));
  const removeExistingConnection = async (connId) => {
    try {
      await apiFetch(`/api/network/connections/${connId}`, { method: 'DELETE' });
      setExistingConns((list) => list.filter((c) => c.id !== connId));
    } catch { /* mantém na lista se a remoção falhar */ }
  };

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
      if (isPerson && saved && saved.id) {
        const newTargets = pendingConnections.filter((c) => c.target);
        for (const c of newTargets) {
          // eslint-disable-next-line no-await-in-loop
          await apiFetch('/api/network/connections', {
            method: 'POST',
            body: JSON.stringify({
              person_a_id: saved.id, person_b_id: c.target,
              connection_type: c.type, description: '',
            }),
          });
        }
      }
      clearDraft();          // salvo no servidor: o rascunho não serve mais
      onSaved();
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    {/* Backdrop SEM onClick (v2.25.13) — clicar fora não fecha mais o editor. */}
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            {isPerson ? <User className="h-4 w-4 text-accent" /> : <Building2 className="h-4 w-4 text-accent" />}
            {titles[kind]}
          </h2>
          <button onClick={guard.requestClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {hasDraft && <DraftBanner onDiscard={discardDraft} />}
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
                          <option value="">— Organização (Mercado) —</option>
                          {institutions.map((i) => (<option key={i.id} value={i.id}>{i.name}</option>))}
                        </select>
                      </div>
                      {!r.institution_id && (
                        <input
                          value={r.institution_name || ''}
                          onChange={(e) => updateRole(idx, { institution_name: e.target.value })}
                          placeholder="Ou digite a organização livre"
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

              <div className="rounded-lg border border-line p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-ink2">Conexões com outras pessoas</span>
                  <button type="button" onClick={addPendingConnection} className="flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface2">
                    <Plus className="h-3 w-3" /> Adicionar conexão
                  </button>
                </div>

                {existingConns.length === 0 && pendingConnections.length === 0 ? (
                  <p className="text-[11px] text-muted">Nenhuma conexão.</p>
                ) : (
                  <div className="space-y-2">
                    {existingConns.map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-surface2 p-2">
                        <div className="min-w-0 flex-1 text-sm text-ink">
                          {otherPersonName(c)}
                          {c.connection_type && <span className="ml-2 text-[11px] text-ink2">— {c.connection_type}</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeExistingConnection(c.id)}
                          title="Remover conexão"
                          className="shrink-0 text-muted hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}

                    {pendingConnections.map((c, idx) => (
                      <div key={idx} className="flex items-center gap-2 rounded-md bg-surface2 p-2">
                        <select
                          value={c.target}
                          onChange={(e) => updatePendingConnection(idx, { target: e.target.value })}
                          className="input flex-1"
                        >
                          <option value="">— Selecionar pessoa —</option>
                          {people
                            .filter((p) => p.id !== form.id && !existingConns.some((ec) => ec.person_a_id === p.id || ec.person_b_id === p.id))
                            .map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </select>
                        <input
                          value={c.type}
                          onChange={(e) => updatePendingConnection(idx, { type: e.target.value })}
                          placeholder="Tipo (ex: colega)"
                          className="input w-32 shrink-0"
                        />
                        <button
                          type="button"
                          onClick={() => removePendingConnection(idx)}
                          title="Remover"
                          className="shrink-0 text-muted hover:text-danger"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
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
          <button
            type="button"
            onClick={guard.requestClose}
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2"
          >
            Cancelar
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

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}
