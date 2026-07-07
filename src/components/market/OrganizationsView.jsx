import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, X, Pencil, ExternalLink, Linkedin, UserPlus, Briefcase, MapPin, Loader2, Users,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import Avatar from '../shared/Avatar';
import {
  StarRating, OrgTypeBadge, OrgStatusBadge, ORG_TYPE_LABELS, ORG_STATUS_LABELS, parseTags,
} from './marketShared';

const TYPE_CHIPS = [
  { key: 'company', label: 'Empresa' },
  { key: 'university', label: 'Universidade' },
  { key: 'research_institute', label: 'Instituto' },
  { key: 'funder', label: 'Financiador' },
];
const STATUS_CHIPS = [
  { key: 'prospect', label: 'Prospect' },
  { key: 'active', label: 'Ativo' },
  { key: 'partner', label: 'Parceiro' },
];

const EMPTY_ORG = {
  name: '', type: 'company', subtype: '', country: 'NL', city: '', website: '', linkedin: '',
  description: '', relevance_score: 3, relevance_notes: '', tags: [], status: 'prospect', source: '',
};

export default function OrganizationsView() {
  const orgs = useStore((s) => s.marketOrgs);
  const setOrgs = useStore((s) => s.setMarketOrgs);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('relevance');
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editor, setEditor] = useState(null); // { mode, form }
  const [addContactFor, setAddContactFor] = useState(null); // org id

  const load = async () => {
    try {
      const rows = await apiFetch('/api/market/organizations');
      setOrgs(rows || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = async (id) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      setDetail(await apiFetch(`/api/market/organizations/${id}`));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let list = [...orgs];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((o) => (o.name || '').toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q));
    if (typeFilter) list = list.filter((o) => o.type === typeFilter);
    if (statusFilter) list = list.filter((o) => o.status === statusFilter);
    list.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '');
      return (b.relevance_score || 0) - (a.relevance_score || 0) || (a.name || '').localeCompare(b.name || '');
    });
    return list;
  }, [orgs, search, typeFilter, statusFilter, sortBy]);

  const afterSave = async (savedId) => {
    setEditor(null);
    await load();
    if (savedId) openDetail(savedId);
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando organizações..." /></div>;

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* LEFT — lista */}
      <div className="flex min-h-0 flex-col gap-3 lg:w-[35%]">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar organizações..."
              className="input pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => setEditor({ mode: 'create', form: { ...EMPTY_ORG } })}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova
          </button>
        </div>

        {/* Filtros por tipo */}
        <div className="flex flex-wrap gap-1.5">
          {TYPE_CHIPS.map((c) => (
            <Chip key={c.key} active={typeFilter === c.key} onClick={() => setTypeFilter(typeFilter === c.key ? '' : c.key)}>
              {c.label}
            </Chip>
          ))}
        </div>
        {/* Filtros por status + ordenação */}
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_CHIPS.map((c) => (
            <Chip key={c.key} active={statusFilter === c.key} onClick={() => setStatusFilter(statusFilter === c.key ? '' : c.key)}>
              {c.label}
            </Chip>
          ))}
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="ml-auto rounded-lg border border-line bg-surface2 px-2 py-1 text-xs text-ink2">
            <option value="relevance">Relevância</option>
            <option value="name">Nome</option>
            <option value="status">Status</option>
          </select>
        </div>

        {/* Lista de cards */}
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 && <p className="px-1 text-sm text-muted">Nenhuma organização encontrada.</p>}
          {filtered.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => openDetail(o.id)}
              className={`w-full rounded-xl border bg-surface p-3 text-left transition hover:border-accent ${
                selectedId === o.id ? 'border-accent shadow-soft' : 'border-line'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink">{o.name}</span>
                <OrgTypeBadge type={o.type} />
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted">
                <MapPin className="h-3 w-3" />
                {[o.city, o.country].filter(Boolean).join(', ') || '—'}
              </div>
              <div className="mt-1.5"><StarRating value={o.relevance_score} /></div>
              {parseTags(o.tags).length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {parseTags(o.tags).slice(0, 3).map((t) => (
                    <span key={t} className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{t}</span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[11px] text-muted">{o.contact_count || 0} contato(s)</span>
                <OrgStatusBadge status={o.status} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT — detalhe */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-surface p-5">
        {!selectedId && (
          <div className="flex h-full items-center justify-center text-muted">Selecione uma organização</div>
        )}
        {selectedId && detailLoading && <LoadingSpinner label="Carregando..." />}
        {selectedId && !detailLoading && detail && (
          <OrgDetail
            org={detail}
            onEdit={() => setEditor({ mode: 'edit', form: { ...detail, tags: parseTags(detail.tags) } })}
            onAddContact={() => setAddContactFor(detail.id)}
            onSelectProject={() => { /* navegação entre abas é feita pelo MarketPage; aqui só exibe */ }}
          />
        )}
      </div>

      {editor && (
        <OrgEditor
          mode={editor.mode}
          initial={editor.form}
          onClose={() => setEditor(null)}
          onSaved={afterSave}
        />
      )}

      {addContactFor && (
        <AddContactModal
          orgId={addContactFor}
          onClose={() => setAddContactFor(null)}
          onLinked={() => { setAddContactFor(null); openDetail(addContactFor); }}
        />
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active ? 'bg-accent text-white' : 'border border-line bg-surface text-ink2 hover:bg-surface2'
      }`}
    >
      {children}
    </button>
  );
}

function OrgDetail({ org, onEdit, onAddContact }) {
  const navigate = useNavigate();
  const tags = parseTags(org.tags);
  const projects = org.projects || [];
  const contacts = org.contacts || [];
  const opportunities = (org.opportunities || []).filter((o) => o.status && !['closed', 'rejected'].includes(o.status));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">{org.name}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <OrgTypeBadge type={org.type} />
            <OrgStatusBadge status={org.status} />
            {org.subtype && <span className="text-xs text-muted">{org.subtype}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink2 hover:bg-surface2">
            <Pencil className="h-4 w-4" /> Editar
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {org.website && (
          <a href={org.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
            <ExternalLink className="h-4 w-4" /> Website
          </a>
        )}
        {org.linkedin && (
          <a href={org.linkedin} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent hover:underline">
            <Linkedin className="h-4 w-4" /> LinkedIn
          </a>
        )}
        <span className="flex items-center gap-1 text-muted">
          <MapPin className="h-4 w-4" /> {[org.city, org.country].filter(Boolean).join(', ') || '—'}
        </span>
      </div>

      {org.description && <p className="text-sm text-ink2">{org.description}</p>}

      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Relevância</h3>
        <StarRating value={org.relevance_score} size={18} />
        {org.relevance_notes && <p className="mt-1 text-sm text-ink2">{org.relevance_notes}</p>}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t} className="rounded bg-surface2 px-2 py-0.5 text-xs text-ink2">{t}</span>)}
        </div>
      )}

      {/* Projetos vinculados */}
      <Section title={`Projetos vinculados (${projects.length})`}>
        {projects.length === 0 ? <Empty>Nenhum projeto vinculado.</Empty> : (
          <ul className="space-y-1.5">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span className="text-ink">{p.name}{p.acronym ? ` (${p.acronym})` : ''}</span>
                <span className="text-xs text-muted">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Contatos vinculados */}
      <Section
        title={`Contatos vinculados (${contacts.length})`}
        action={<button type="button" onClick={onAddContact} className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"><UserPlus className="h-3.5 w-3.5" /> Adicionar Contato</button>}
      >
        {contacts.length === 0 ? <Empty>Nenhum contato vinculado.</Empty> : (
          <ul className="space-y-1.5">
            {contacts.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <Avatar user={{ name: c.person_name }} size={28} />
                <div className="min-w-0">
                  {/* Nome clicável → abre a ficha da pessoa no Networking. */}
                  <button
                    type="button"
                    onClick={() => c.person_id && navigate('/networking', { state: { contactId: c.person_id } })}
                    disabled={!c.person_id}
                    title="Ver no Networking"
                    className="flex items-center gap-1 text-sm text-indigo-600 hover:underline disabled:cursor-default disabled:text-ink disabled:no-underline"
                  >
                    <Users className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.person_name || '—'}</span>
                  </button>
                  {c.role_at_org && <div className="truncate text-xs text-muted">{c.role_at_org}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Oportunidades ativas */}
      {opportunities.length > 0 && (
        <Section title={`Oportunidades ativas (${opportunities.length})`}>
          <ul className="space-y-1.5">
            {opportunities.map((o) => (
              <li key={o.id} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-ink"><Briefcase className="h-3.5 w-3.5 text-accent" />{o.title}</span>
                <span className="text-xs text-muted">{o.status}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, action, children }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ children }) {
  return <p className="text-sm text-muted">{children}</p>;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      {children}
    </label>
  );
}

function OrgEditor({ mode, initial, onClose, onSaved }) {
  const allProjects = useStore((s) => s.marketProjects);
  const setMarketProjects = useStore((s) => s.setMarketProjects);
  const [form, setForm] = useState(initial);
  const [tagsText, setTagsText] = useState((initial.tags || []).join(', '));
  const [linkedProjectIds, setLinkedProjectIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Carrega projetos para o seletor de "projetos vinculados".
  useEffect(() => {
    apiFetch('/api/market/projects').then((rows) => {
      setMarketProjects(rows || []);
      if (mode === 'edit' && initial.id) {
        setLinkedProjectIds((rows || []).filter((p) => p.organization_id === initial.id).map((p) => p.id));
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleProject = (id) =>
    setLinkedProjectIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const save = async () => {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...form,
        tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
        relevance_score: Number(form.relevance_score) || 3,
      };
      let saved;
      if (mode === 'create') {
        saved = await apiFetch('/api/market/organizations', { method: 'POST', body: JSON.stringify(payload) });
      } else {
        saved = await apiFetch(`/api/market/organizations/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      }
      const orgId = saved.id;
      // Sincroniza vínculos de projetos: cada projeto cujo pertencimento mudou recebe PUT.
      const before = new Set(allProjects.filter((p) => p.organization_id === orgId).map((p) => p.id));
      const after = new Set(linkedProjectIds);
      const changes = [];
      for (const p of allProjects) {
        const wasLinked = before.has(p.id);
        const nowLinked = after.has(p.id);
        if (wasLinked && !nowLinked) changes.push({ ...p, organization_id: null });
        if (!wasLinked && nowLinked) changes.push({ ...p, organization_id: orgId });
      }
      for (const p of changes) {
        await apiFetch(`/api/market/projects/${p.id}`, { method: 'PUT', body: JSON.stringify(p) });
      }
      onSaved(orgId);
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="flex h-full w-full flex-col bg-surface shadow-soft sm:max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{mode === 'create' ? 'Nova organização' : 'Editar organização'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
          <Field label="Nome *"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
                {Object.entries(ORG_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set({ status: e.target.value })} className="input">
                {Object.entries(ORG_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Subtipo"><input value={form.subtype || ''} onChange={(e) => set({ subtype: e.target.value })} className="input" placeholder="ex: spin-off, startup" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cidade"><input value={form.city || ''} onChange={(e) => set({ city: e.target.value })} className="input" /></Field>
            <Field label="País"><input value={form.country || ''} onChange={(e) => set({ country: e.target.value })} className="input" /></Field>
          </div>
          <Field label="Website"><input value={form.website || ''} onChange={(e) => set({ website: e.target.value })} className="input" placeholder="https://" /></Field>
          <Field label="LinkedIn"><input value={form.linkedin || ''} onChange={(e) => set({ linkedin: e.target.value })} className="input" /></Field>
          <Field label="Descrição"><textarea value={form.description || ''} onChange={(e) => set({ description: e.target.value })} className="input min-h-[70px]" /></Field>
          <Field label="Relevância">
            <StarRating value={form.relevance_score} size={20} onChange={(n) => set({ relevance_score: n || 1 })} />
          </Field>
          <Field label="Notas de relevância"><textarea value={form.relevance_notes || ''} onChange={(e) => set({ relevance_notes: e.target.value })} className="input min-h-[50px]" /></Field>
          <Field label="Tags (separadas por vírgula)"><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="input" placeholder="H2, PEM, eletrolisador" /></Field>
          <Field label="Fonte"><input value={form.source || ''} onChange={(e) => set({ source: e.target.value })} className="input" /></Field>

          <div className="rounded-lg border border-line p-3">
            <span className="mb-2 block text-xs font-semibold text-ink2">Projetos vinculados</span>
            {allProjects.length === 0 ? (
              <p className="text-xs text-muted">Nenhum projeto cadastrado ainda.</p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {allProjects.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-ink">
                    <input type="checkbox" checked={linkedProjectIds.includes(p.id)} onChange={() => toggleProject(p.id)} />
                    {p.name}{p.acronym ? ` (${p.acronym})` : ''}
                  </label>
                ))}
              </div>
            )}
          </div>
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

// Vincula um contato existente (network_people) à organização via contact_org_links.
function AddContactModal({ orgId, onClose, onLinked }) {
  const [people, setPeople] = useState([]);
  const [personId, setPersonId] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/network/people').then((rows) => setPeople(rows || [])).catch(() => setPeople([]));
  }, []);

  const link = async () => {
    if (!personId) { setError('Selecione um contato'); return; }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/market/contacts/link', {
        method: 'POST',
        body: JSON.stringify({ person_id: personId, organization_id: orgId, role_at_org: role }),
      });
      onLinked();
    } catch (e) {
      setError(String(e.message || e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-surface p-5 shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Adicionar contato</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        {error && <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
        <div className="space-y-3">
          <Field label="Contato">
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} className="input">
              <option value="">— Selecione —</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Cargo na organização"><input value={role} onChange={(e) => setRole(e.target.value)} className="input" /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
          <button type="button" onClick={link} disabled={saving} className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Vincular
          </button>
        </div>
      </div>
    </div>
  );
}
