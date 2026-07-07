import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Pencil, ExternalLink, Linkedin, UserPlus, Search, X,
  Plus, Briefcase, Pin, Trash2, Loader2, Check,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import Avatar from '../shared/Avatar';
import LoadingSpinner from '../shared/LoadingSpinner';
import DriveAttachmentZone from '../shared/DriveAttachmentZone';
import { OrgEditor } from './OrganizationsView';
import {
  StarRating, OrgTypeBadge, OrgStatusBadge, ProjectTypeBadge, ProjectStatusBadge,
  ORG_STATUS_LABELS, OUTREACH_LABELS, PROJECT_TYPE_LABELS, parseTags,
} from './marketShared';

// Cor do "dot" por status de outreach (mesmos valores usados no Networking/Mercado).
const OUTREACH_DOT = {
  not_contacted: '#9CA3AF', contacted: '#3B82F6', responded: '#22C55E',
  meeting_scheduled: '#6366F1', ongoing: '#F59E0B', converted: '#15803D', inactive: '#EF4444',
};

// Rótulos de carreira (inline — não há mapa compartilhado ainda).
const OPP_TYPE_LABELS = {
  job: 'Emprego', phd: 'PhD', postdoc: 'Pós-doc', grant: 'Bolsa',
  collaboration: 'Colaboração', spinoff_support: 'Spin-off', contract: 'Contrato',
};
const OPP_STATUS_LABELS = {
  identified: 'Identificada', researching: 'Pesquisando', preparing: 'Preparando',
  applied: 'Aplicada', interviewing: 'Entrevista', offer: 'Oferta',
  rejected: 'Rejeitada', closed: 'Encerrada',
};
const TRACK_STYLE = {
  phd: 'bg-indigo-100 text-indigo-700',
  job: 'bg-amber-100 text-amber-700',
  spinoff: 'bg-emerald-100 text-emerald-700',
};
const TRACK_LABELS = { phd: 'PhD', job: 'Emprego', spinoff: 'Spin-off' };

const NOTE_TYPE_LABELS = {
  research: 'Pesquisa', funding: 'Financiamento', culture: 'Cultura',
  news: 'Notícias', contact: 'Contato', other: 'Outro',
};
const NOTE_FILTERS = [
  { key: '', label: 'Todos' },
  { key: 'research', label: 'Pesquisa' },
  { key: 'funding', label: 'Financiamento' },
  { key: 'culture', label: 'Cultura' },
  { key: 'news', label: 'Notícias' },
  { key: 'contact', label: 'Contato' },
  { key: 'other', label: 'Outro' },
];

const TABS = [
  { key: 'overview', label: 'Visão Geral' },
  { key: 'contacts', label: 'Contatos' },
  { key: 'projects', label: 'Projetos & Iniciativas' },
  { key: 'notes', label: 'Notas' },
  { key: 'documents', label: 'Documentos' },
  { key: 'opportunities', label: 'Oportunidades' },
];

function fmtDate(unixOrString) {
  if (!unixOrString) return '—';
  const d = typeof unixOrString === 'number'
    ? new Date(unixOrString * 1000)
    : new Date(unixOrString);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86400000);
}

export default function OrgDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState('overview');
  const [editing, setEditing] = useState(false);

  const loadFull = async () => {
    try {
      const data = await apiFetch(`/api/market/organizations/${id}/full`);
      setOrg(data);
    } catch (e) {
      if (String(e.message || e).includes('404') || /não encontrada/i.test(String(e.message || e))) {
        setNotFound(true);
      }
      setOrg(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    loadFull();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Atualização otimista de campos da organização com PUT parcial.
  const patchOrg = async (patch) => {
    setOrg((o) => ({ ...o, ...patch }));
    try {
      await apiFetch(`/api/market/organizations/${id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    } catch {
      // Em caso de erro, recarrega para refletir o estado real.
      loadFull();
    }
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando organização..." /></div>;

  if (notFound || !org) {
    return (
      <div className="mx-auto max-w-3xl py-16 text-center">
        <p className="text-lg font-medium text-ink2">Organização não encontrada</p>
        <button
          type="button"
          onClick={() => navigate('/market')}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Mercado
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col gap-4">
      {/* Voltar */}
      <button
        type="button"
        onClick={() => navigate('/market')}
        className="flex w-fit items-center gap-1 text-sm font-medium text-ink2 hover:text-accent"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar ao Mercado
      </button>

      {/* Cabeçalho */}
      <Header org={org} onEdit={() => setEditing(true)} />

      {/* Navegação de abas */}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => {
          const active = tab === t.key;
          const count =
            t.key === 'contacts' ? (org.contacts || []).length
            : t.key === 'projects' ? (org.projects || []).length
            : t.key === 'notes' ? org.notes_count
            : t.key === 'opportunities' ? (org.opportunities || []).length
            : null;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition ${
                active
                  ? 'border-indigo-600 font-bold text-indigo-600'
                  : 'border-transparent font-medium text-muted hover:text-ink2'
              }`}
            >
              {t.label}
              {count != null && count > 0 && (
                <span className="ml-1.5 text-xs text-muted">({count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === 'overview' && <OverviewTab org={org} onPatch={patchOrg} />}
        {tab === 'contacts' && <ContactsTab org={org} onReload={loadFull} navigate={navigate} />}
        {tab === 'projects' && <ProjectsTab org={org} onReload={loadFull} />}
        {tab === 'notes' && <NotesTab orgId={id} />}
        {tab === 'documents' && (
          <div className="max-w-2xl">
            <DriveAttachmentZone entityType="market_org" entityId={id} />
          </div>
        )}
        {tab === 'opportunities' && <OpportunitiesTab org={org} navigate={navigate} />}
      </div>

      {editing && (
        <OrgEditor
          mode="edit"
          initial={{ ...org, tags: parseTags(org.tags) }}
          onClose={() => setEditing(false)}
          onSaved={() => { setEditing(false); loadFull(); }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cabeçalho
// ---------------------------------------------------------------------------
function Header({ org, onEdit }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-ink">{org.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <OrgTypeBadge type={org.type} />
          <OrgStatusBadge status={org.status} />
          {org.subtype && <span className="text-xs text-muted">{org.subtype}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="flex items-center gap-1.5" title="Relevância para PhD">
            🎓 <span className="text-xs text-muted">PhD:</span> <StarRating value={org.relevance_for_phd} size={14} />
          </span>
          <span className="flex items-center gap-1.5" title="Relevância para emprego">
            💼 <span className="text-xs text-muted">Emprego:</span> <StarRating value={org.relevance_for_job} size={14} />
          </span>
          <span className="flex items-center gap-1.5" title="Relevância para spin-off">
            🚀 <span className="text-xs text-muted">Spin-off:</span> <StarRating value={org.relevance_for_spinoff} size={14} />
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {org.website && (
          <a href={org.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink2 hover:bg-surface2">
            <ExternalLink className="h-4 w-4" /> Website
          </a>
        )}
        {org.linkedin && (
          <a href={org.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink2 hover:bg-surface2">
            <Linkedin className="h-4 w-4" /> LinkedIn
          </a>
        )}
        <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90">
          <Pencil className="h-4 w-4" /> Editar
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba: Visão Geral
// ---------------------------------------------------------------------------
function OverviewTab({ org, onPatch }) {
  const [description, setDescription] = useState(org.description || '');
  const [relNotes, setRelNotes] = useState(org.relevance_notes || '');
  const [city, setCity] = useState(org.city || '');
  const [country, setCountry] = useState(org.country || '');
  const [tagInput, setTagInput] = useState('');
  const tags = parseTags(org.tags);

  const saveIfChanged = (field, value, original) => {
    if (value !== (original || '')) onPatch({ [field]: value });
  };

  const removeTag = (t) => onPatch({ tags: tags.filter((x) => x !== t) });
  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) onPatch({ tags: [...tags, t] });
    setTagInput('');
  };

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {/* ESQUERDA (60%) */}
      <div className="space-y-5 lg:w-[60%]">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Descrição</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => saveIfChanged('description', description, org.description)}
            placeholder="Descreva a organização..."
            className="min-h-[120px] w-full resize-y rounded-lg bg-surface2 px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted">Notas de relevância</label>
          <textarea
            value={relNotes}
            onChange={(e) => setRelNotes(e.target.value)}
            onBlur={() => saveIfChanged('relevance_notes', relNotes, org.relevance_notes)}
            placeholder="Por que esta organização é relevante..."
            className="min-h-[90px] w-full resize-y rounded-lg bg-surface2 px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Fonte</span>
          <p className="mt-0.5 text-sm text-ink2">{org.source || '—'}</p>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted">Tags</label>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => removeTag(t)}
                className="group flex items-center gap-1 rounded-full bg-surface2 px-2.5 py-0.5 text-xs text-ink2 hover:bg-danger/10 hover:text-danger"
                title="Remover"
              >
                {t}
                <X className="h-3 w-3 opacity-40 group-hover:opacity-100" />
              </button>
            ))}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
              onBlur={addTag}
              placeholder="+ tag"
              className="w-24 rounded-full border border-dashed border-line bg-transparent px-2.5 py-0.5 text-xs text-ink outline-none focus:border-accent"
            />
          </div>
        </div>
      </div>

      {/* DIREITA (40%) */}
      <div className="space-y-4 lg:w-[40%]">
        <div className="rounded-xl border border-line bg-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Relevância por trilha</span>
          <div className="mt-2 space-y-2">
            <SliderRow label="🎓 PhD" value={org.relevance_for_phd} onChange={(n) => onPatch({ relevance_for_phd: n })} />
            <SliderRow label="💼 Emprego" value={org.relevance_for_job} onChange={(n) => onPatch({ relevance_for_job: n })} />
            <SliderRow label="🚀 Spin-off" value={org.relevance_for_spinoff} onChange={(n) => onPatch({ relevance_for_spinoff: n })} />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">Status</label>
          <select
            value={org.status || 'prospect'}
            onChange={(e) => onPatch({ status: e.target.value })}
            className="input mt-1.5"
          >
            {Object.entries(ORG_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-ink2">Cidade</label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onBlur={() => saveIfChanged('city', city, org.city)}
                className="input mt-1"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink2">País</label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                onBlur={() => saveIfChanged('country', country, org.country)}
                className="input mt-1"
              />
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Resumo</span>
          <p className="mt-1.5 text-sm text-ink2">
            {(org.contacts || []).length} contatos · {(org.projects || []).length} projetos ·{' '}
            {(org.opportunities || []).length} oportunidades · {org.notes_count || 0} notas
          </p>
        </div>

        <p className="px-1 text-xs text-muted">
          Atualizado em {fmtDate(org.updated_at)}
          {org.created_by_name ? ` por ${org.created_by_name}` : ''}
        </p>
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-ink2">{label}</span>
      <StarRating value={value} size={18} onChange={(n) => onChange(n || 0)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba: Contatos
// ---------------------------------------------------------------------------
function ContactsTab({ org, onReload, navigate }) {
  const [linking, setLinking] = useState(false);
  const contacts = org.contacts || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink2">{contacts.length} contato(s) vinculado(s)</h2>
        <button
          type="button"
          onClick={() => setLinking(true)}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" /> Vincular Contato
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nenhum contato vinculado a esta organização
        </p>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
              <Avatar user={{ name: c.person_name }} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-ink">{c.person_name || '—'}</div>
                {c.role_at_org && <div className="truncate text-xs text-muted">{c.role_at_org}</div>}
              </div>
              {c.outreach_status && OUTREACH_LABELS[c.outreach_status] && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-ink2">
                  <span className="h-2 w-2 rounded-full" style={{ background: OUTREACH_DOT[c.outreach_status] || '#9CA3AF' }} />
                  {OUTREACH_LABELS[c.outreach_status]}
                </span>
              )}
              <button
                type="button"
                onClick={() => navigate('/networking', { state: { contactId: c.person_id || c.id } })}
                className="shrink-0 whitespace-nowrap text-xs font-medium text-indigo-600 hover:underline"
              >
                Ver no Networking →
              </button>
            </li>
          ))}
        </ul>
      )}

      {linking && (
        <LinkContactModal
          orgId={org.id}
          existingPersonIds={contacts.map((c) => c.person_id)}
          onClose={() => setLinking(false)}
          onLinked={() => { setLinking(false); onReload(); }}
        />
      )}
    </div>
  );
}

// Modal com busca de network_people para vincular à organização.
function LinkContactModal({ orgId, existingPersonIds, onClose, onLinked }) {
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/network/people').then((rows) => setPeople(rows || [])).catch(() => setPeople([]));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const already = new Set(existingPersonIds || []);
    return (people || [])
      .filter((p) => !already.has(p.id))
      .filter((p) => !q || (p.name || '').toLowerCase().includes(q) || (p.institution || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [people, query, existingPersonIds]);

  const link = async () => {
    if (!selected) { setError('Selecione um contato'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/market/contacts/link', {
        method: 'POST',
        body: JSON.stringify({ person_id: selected.id, organization_id: orgId, role_at_org: role, relevance_notes: '' }),
      });
      onLinked();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-2xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-base font-bold text-ink">Vincular contato</h3>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="border-b border-line px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar pessoa..."
              className="input pl-9"
              autoFocus
            />
          </div>
        </div>
        {error && <div className="mx-4 mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 && <p className="px-2 py-3 text-center text-sm text-muted">Nenhuma pessoa encontrada.</p>}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p)}
              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                selected?.id === p.id ? 'bg-accent/10 ring-1 ring-accent' : 'hover:bg-surface2'
              }`}
            >
              <Avatar user={{ name: p.name }} size={28} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-ink">{p.name}</div>
                {p.institution && <div className="truncate text-xs text-muted">{p.institution}</div>}
              </div>
              {selected?.id === p.id && <Check className="h-4 w-4 shrink-0 text-accent" />}
            </button>
          ))}
        </div>
        <div className="border-t border-line px-4 py-3">
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Cargo na organização (opcional)"
            className="input mb-2"
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
            <button type="button" onClick={link} disabled={saving || !selected} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Vincular
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba: Projetos & Iniciativas
// ---------------------------------------------------------------------------
function ProjectsTab({ org, onReload }) {
  const [creating, setCreating] = useState(false);
  const projects = org.projects || [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink2">{projects.length} iniciativa(s)</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova Iniciativa
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nenhum projeto ou iniciativa vinculado
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => {
            const isCoordinator = p.organization_id === org.id;
            const isPartner = !isCoordinator && parseTags(p.partner_org_ids).includes(org.id);
            const desc = (p.description || '').length > 100 ? `${p.description.slice(0, 100)}…` : p.description;
            return (
              <div key={p.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-ink">{p.name}{p.acronym ? ` (${p.acronym})` : ''}</h3>
                  <StarRating value={p.relevance_score} size={13} />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <ProjectTypeBadge type={p.type} />
                  <ProjectStatusBadge status={p.status} />
                  {isCoordinator && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700">Coordenadora</span>}
                  {isPartner && <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-medium text-ink2">Parceira</span>}
                </div>
                {(p.start_date || p.end_date) && (
                  <p className="mt-1.5 text-xs text-muted">
                    {p.start_date || '—'}{p.end_date ? ` → ${p.end_date}` : ''}
                  </p>
                )}
                {desc && <p className="mt-1.5 text-sm text-ink2">{desc}</p>}
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <NewProjectModal
          orgId={org.id}
          orgName={org.name}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); onReload(); }}
        />
      )}
    </div>
  );
}

function NewProjectModal({ orgId, orgName, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '', acronym: '', type: 'research', status: 'active', description: '',
    start_date: '', end_date: '', relevance_score: 3,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/market/projects', {
        method: 'POST',
        body: JSON.stringify({ ...form, organization_id: orgId }),
      });
      onCreated();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-ink">Nova iniciativa</h3>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-xs text-muted">Coordenadora: <span className="font-medium text-ink2">{orgName}</span></p>
        {error && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="space-y-3">
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Nome *" className="input" />
          <input value={form.acronym} onChange={(e) => set({ acronym: e.target.value })} placeholder="Sigla" className="input" />
          <div className="grid grid-cols-2 gap-3">
            <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
              {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} placeholder="Início (AAAA-MM-DD)" className="input" />
          </div>
          <textarea value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="Descrição" className="input min-h-[70px]" />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Criar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba: Notas (market_notes)
// ---------------------------------------------------------------------------
function NotesTab({ orgId }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await apiFetch(`/api/market/notes?organization_id=${orgId}`);
      setNotes(rows || []);
      if (rows && rows.length && !rows.some((n) => n.id === selectedId)) {
        setSelectedId(rows[0].id);
      }
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return notes
      .filter((n) => !filter || n.note_type === filter)
      .filter((n) => !q || (n.title || '').toLowerCase().includes(q) || (n.body || '').toLowerCase().includes(q));
  }, [notes, filter, search]);

  const createNote = async () => {
    try {
      const note = await apiFetch('/api/market/notes', {
        method: 'POST',
        body: JSON.stringify({ organization_id: orgId, title: '', body: '', note_type: 'other' }),
      });
      setNotes((prev) => [note, ...prev]);
      setSelectedId(note.id);
    } catch { /* noop */ }
  };

  // Reflete edições/remoções locais sem recarregar tudo.
  const onNoteSaved = (saved) => setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
  const onNoteDeleted = (deletedId) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== deletedId);
      if (selectedId === deletedId) setSelectedId(next[0]?.id || null);
      return next;
    });
  };

  const selected = notes.find((n) => n.id === selectedId) || null;

  return (
    <div className="flex h-full min-h-[420px] flex-col gap-4 lg:flex-row">
      {/* ESQUERDA (35%) */}
      <div className="flex min-h-0 flex-col gap-2 lg:w-[35%]">
        <div className="flex flex-wrap gap-1">
          {NOTE_FILTERS.map((f) => (
            <button
              key={f.key || 'all'}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                filter === f.key ? 'bg-accent text-white' : 'border border-line bg-surface text-ink2 hover:bg-surface2'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar notas..." className="input pl-9" />
        </div>
        <button
          type="button"
          onClick={createNote}
          className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-line px-3 py-2 text-sm font-medium text-accent hover:bg-surface2"
        >
          <Plus className="h-4 w-4" /> Nova Nota
        </button>
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {loading && <p className="px-1 text-sm text-muted">Carregando...</p>}
          {!loading && filtered.length === 0 && <p className="px-1 text-sm text-muted">Nenhuma nota.</p>}
          {filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setSelectedId(n.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                selectedId === n.id ? 'border-accent bg-surface shadow-soft' : 'border-line bg-surface hover:border-accent'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {n.pinned && <Pin className="h-3 w-3 shrink-0 fill-current text-amber-500" />}
                <span className="truncate text-sm font-medium text-ink">
                  {n.title || (n.body || '').slice(0, 50) || '(sem título)'}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
                <span className="rounded bg-surface2 px-1.5 py-0.5">{NOTE_TYPE_LABELS[n.note_type] || n.note_type}</span>
                {n.author_name && <span>{n.author_name.charAt(0).toUpperCase()}</span>}
                <span>{fmtDate(n.updated_at)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* DIREITA (65%) */}
      <div className="min-h-0 flex-1 rounded-xl border border-line bg-surface p-4">
        {selected ? (
          <NoteEditor key={selected.id} note={selected} onSaved={onNoteSaved} onDeleted={onNoteDeleted} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted">
            Selecione ou crie uma nota
          </div>
        )}
      </div>
    </div>
  );
}

function NoteEditor({ note, onSaved, onDeleted }) {
  const [title, setTitle] = useState(note.title || '');
  const [body, setBody] = useState(note.body || '');
  const [noteType, setNoteType] = useState(note.note_type || 'other');
  const [pinned, setPinned] = useState(!!note.pinned);
  const [tagsText, setTagsText] = useState((parseTags(note.tags) || []).join(', '));
  const [status, setStatus] = useState(''); // '' | 'saving' | 'saved'

  const save = async (override = {}) => {
    setStatus('saving');
    try {
      const payload = {
        title, body, note_type: noteType, pinned,
        tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
        ...override,
      };
      const saved = await apiFetch(`/api/market/notes/${note.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      onSaved(saved);
      setStatus('saved');
    } catch {
      setStatus('');
    }
  };

  const togglePin = () => {
    const next = !pinned;
    setPinned(next);
    save({ pinned: next });
  };
  const changeType = (t) => {
    setNoteType(t);
    save({ note_type: t });
  };

  const del = async () => {
    if (!window.confirm('Excluir esta nota?')) return;
    try {
      await apiFetch(`/api/market/notes/${note.id}`, { method: 'DELETE' });
      onDeleted(note.id);
    } catch { /* noop */ }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => save()}
          placeholder="Título"
          className="min-w-0 flex-1 bg-transparent text-lg font-bold text-ink outline-none placeholder:text-muted"
        />
        <button
          type="button"
          onClick={togglePin}
          title={pinned ? 'Desafixar' : 'Fixar'}
          className={`rounded-md p-1.5 transition ${pinned ? 'text-amber-500' : 'text-muted hover:bg-surface2'}`}
        >
          <Pin className={`h-4 w-4 ${pinned ? 'fill-current' : ''}`} />
        </button>
        <button type="button" onClick={del} title="Excluir" className="rounded-md p-1.5 text-danger hover:bg-danger/10">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <select value={noteType} onChange={(e) => changeType(e.target.value)} className="rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-ink2">
          {Object.entries(NOTE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          onBlur={() => save()}
          placeholder="tags, separadas, por vírgula"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-ink2 outline-none"
        />
      </div>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => save()}
        placeholder="Escreva aqui..."
        className="min-h-[220px] flex-1 resize-none rounded-lg bg-surface2 px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
      />

      <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
        <span>
          {note.author_name ? `Por ${note.author_name} em ` : ''}{fmtDate(note.updated_at)}
        </span>
        <span>{status === 'saving' ? 'Salvando...' : status === 'saved' ? 'Salvo ✓' : ''}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba: Oportunidades
// ---------------------------------------------------------------------------
function OpportunitiesTab({ org, navigate }) {
  const opps = (org.opportunities || []).filter((o) => o.status && !['closed', 'rejected'].includes(o.status));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink2">{opps.length} oportunidade(s) ativa(s)</h2>
        <button
          type="button"
          onClick={() => navigate('/career', { state: { orgId: org.id } })}
          className="flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova Oportunidade
        </button>
      </div>

      {opps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
          Nenhuma oportunidade ativa
        </p>
      ) : (
        <ul className="space-y-2">
          {opps.map((o) => {
            const d = daysUntil(o.deadline);
            const urgent = d != null && d < 30;
            return (
              <li key={o.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5">
                <Briefcase className="h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink">{o.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-medium text-ink2">
                      {OPP_TYPE_LABELS[o.type] || o.type}
                    </span>
                    {o.track && (
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TRACK_STYLE[o.track] || 'bg-surface2 text-ink2'}`}>
                        {TRACK_LABELS[o.track] || o.track}
                      </span>
                    )}
                    <span className="text-[11px] text-muted">{OPP_STATUS_LABELS[o.status] || o.status}</span>
                  </div>
                </div>
                {o.deadline && (
                  <span className={`shrink-0 text-xs ${urgent ? 'font-semibold text-danger' : 'text-muted'}`}>
                    {o.deadline}
                  </span>
                )}
                {o.assigned_name && (
                  <Avatar user={{ name: o.assigned_name }} size={28} className="shrink-0" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
