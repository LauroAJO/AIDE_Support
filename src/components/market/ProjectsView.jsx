import { useEffect, useState } from 'react';
import { Plus, X, Pencil, ExternalLink, Loader2, FolderKanban, Calendar } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';
import {
  StarRating, ProjectTypeBadge, ProjectStatusBadge,
  PROJECT_TYPE_LABELS, PROJECT_STATUS_LABELS, parseTags,
} from './marketShared';

const EMPTY_PROJECT = {
  name: '', acronym: '', type: 'research', organization_id: '', description: '', budget: '',
  start_date: '', end_date: '', status: 'active', relevance_score: 3, relevance_notes: '',
  url: '', tags: [], partner_org_ids: [], source: '',
};

export default function ProjectsView() {
  const projects = useStore((s) => s.marketProjects);
  const setProjects = useStore((s) => s.setMarketProjects);
  const orgs = useStore((s) => s.marketOrgs);
  const setOrgs = useStore((s) => s.setMarketOrgs);

  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [editor, setEditor] = useState(null);

  const load = async () => {
    try {
      const [p, o] = await Promise.all([
        apiFetch('/api/market/projects'),
        orgs.length ? Promise.resolve(orgs) : apiFetch('/api/market/organizations'),
      ]);
      setProjects(p || []);
      if (!orgs.length) setOrgs(o || []);
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
    try {
      setDetail(await apiFetch(`/api/market/projects/${id}`));
    } catch {
      setDetail(null);
    }
  };

  const afterSave = async (id) => {
    setEditor(null);
    await load();
    if (id) openDetail(id);
  };

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando iniciativas..." /></div>;

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* LEFT — lista */}
      <div className="flex min-h-0 flex-col gap-3 lg:w-[40%]">
        <button
          type="button"
          onClick={() => setEditor({ mode: 'create', form: { ...EMPTY_PROJECT } })}
          className="flex items-center justify-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nova Iniciativa
        </button>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {projects.length === 0 && <p className="px-1 text-sm text-muted">Nenhuma iniciativa registrada</p>}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => openDetail(p.id)}
              className={`w-full rounded-xl border bg-surface p-3 text-left transition hover:border-accent ${
                selectedId === p.id ? 'border-accent shadow-soft' : 'border-line'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-ink">{p.name}{p.acronym ? ` (${p.acronym})` : ''}</span>
                <ProjectTypeBadge type={p.type} />
              </div>
              {p.organization_name && <div className="mt-1 text-xs text-muted">{p.organization_name}</div>}
              <div className="mt-1.5 flex items-center gap-2">
                <ProjectStatusBadge status={p.status} />
                <StarRating value={p.relevance_score} />
              </div>
              {(p.start_date || p.end_date) && (
                <div className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                  <Calendar className="h-3 w-3" />{p.start_date || '?'} → {p.end_date || '?'}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT — detalhe */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-line bg-surface p-5">
        {!selectedId && <div className="flex h-full items-center justify-center text-muted">Selecione uma iniciativa</div>}
        {selectedId && detail && (
          <ProjectDetail
            project={detail}
            orgs={orgs}
            onEdit={() => setEditor({ mode: 'edit', form: { ...detail, tags: parseTags(detail.tags), partner_org_ids: parseTags(detail.partner_org_ids) } })}
          />
        )}
      </div>

      {editor && (
        <ProjectEditor mode={editor.mode} initial={editor.form} orgs={orgs} onClose={() => setEditor(null)} onSaved={afterSave} />
      )}
    </div>
  );
}

function ProjectDetail({ project, orgs, onEdit }) {
  const tags = parseTags(project.tags);
  const partnerIds = parseTags(project.partner_org_ids);
  const partners = orgs.filter((o) => partnerIds.includes(o.id));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink">{project.name}{project.acronym ? ` (${project.acronym})` : ''}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <ProjectTypeBadge type={project.type} />
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
        <button type="button" onClick={onEdit} className="flex items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-sm text-ink2 hover:bg-surface2">
          <Pencil className="h-4 w-4" /> Editar
        </button>
      </div>

      {project.organization_name && (
        <div className="text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">Organização coordenadora</span>
          <div className="mt-1 flex items-center gap-2 text-ink">
            <FolderKanban className="h-4 w-4 text-accent" /> {project.organization_name}
          </div>
        </div>
      )}

      {project.description && <p className="text-sm text-ink2">{project.description}</p>}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <Info label="Orçamento" value={project.budget} />
        <Info label="Datas" value={[project.start_date, project.end_date].filter(Boolean).join(' → ') || '—'} />
      </div>

      <div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Relevância</span>
        <div className="mt-1"><StarRating value={project.relevance_score} size={18} /></div>
        {project.relevance_notes && <p className="mt-1 text-sm text-ink2">{project.relevance_notes}</p>}
      </div>

      {project.url && (
        <a href={project.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-accent hover:underline">
          <ExternalLink className="h-4 w-4" /> Link do projeto
        </a>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => <span key={t} className="rounded bg-surface2 px-2 py-0.5 text-xs text-ink2">{t}</span>)}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Organizações parceiras ({partners.length})</h3>
        {partners.length === 0 ? <p className="text-sm text-muted">Nenhuma parceira informada.</p> : (
          <ul className="space-y-1.5">
            {partners.map((o) => (
              <li key={o.id} className="rounded-lg border border-line px-3 py-2 text-sm text-ink">{o.name}</li>
            ))}
          </ul>
        )}
      </div>
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

function ProjectEditor({ mode, initial, orgs, onClose, onSaved }) {
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
        organization_id: form.organization_id || null,
        tags: tagsText.split(',').map((s) => s.trim()).filter(Boolean),
        relevance_score: Number(form.relevance_score) || 3,
      };
      const saved = mode === 'create'
        ? await apiFetch('/api/market/projects', { method: 'POST', body: JSON.stringify(payload) })
        : await apiFetch(`/api/market/projects/${form.id}`, { method: 'PUT', body: JSON.stringify(payload) });
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
          <h2 className="text-base font-bold text-ink">{mode === 'create' ? 'Nova Iniciativa' : 'Editar Iniciativa'}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nome *"><input value={form.name} onChange={(e) => set({ name: e.target.value })} className="input" /></Field>
            <Field label="Acrônimo"><input value={form.acronym || ''} onChange={(e) => set({ acronym: e.target.value })} className="input" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo">
              <select value={form.type} onChange={(e) => set({ type: e.target.value })} className="input">
                {Object.entries(PROJECT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={(e) => set({ status: e.target.value })} className="input">
                {Object.entries(PROJECT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Organização coordenadora">
            <select value={form.organization_id || ''} onChange={(e) => set({ organization_id: e.target.value })} className="input">
              <option value="">— Nenhuma —</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="Descrição"><textarea value={form.description || ''} onChange={(e) => set({ description: e.target.value })} className="input min-h-[70px]" /></Field>
          <Field label="Orçamento"><input value={form.budget || ''} onChange={(e) => set({ budget: e.target.value })} className="input" placeholder="€23.5M total, €20M EC" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Início"><input value={form.start_date || ''} onChange={(e) => set({ start_date: e.target.value })} className="input" placeholder="2026-01" /></Field>
            <Field label="Fim"><input value={form.end_date || ''} onChange={(e) => set({ end_date: e.target.value })} className="input" placeholder="2029-12" /></Field>
          </div>
          <Field label="URL"><input value={form.url || ''} onChange={(e) => set({ url: e.target.value })} className="input" placeholder="https://" /></Field>
          <Field label="Relevância">
            <StarRating value={form.relevance_score} size={20} onChange={(n) => set({ relevance_score: n || 1 })} />
          </Field>
          <Field label="Notas de relevância"><textarea value={form.relevance_notes || ''} onChange={(e) => set({ relevance_notes: e.target.value })} className="input min-h-[50px]" /></Field>
          <Field label="Tags (separadas por vírgula)"><input value={tagsText} onChange={(e) => setTagsText(e.target.value)} className="input" /></Field>
          <Field label="Fonte"><input value={form.source || ''} onChange={(e) => set({ source: e.target.value })} className="input" /></Field>
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
