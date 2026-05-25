import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Pencil, Trash2, ChevronRight, ChevronDown, Layers, FolderKanban, GitBranch, X,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import LoadingSpinner from '../shared/LoadingSpinner';

const DEFAULT_COLOR = '#6366f1';
const PRESET_COLORS = [
  '#6366f1', '#0EA5E9', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6',
];

export default function AreasPage() {
  const areas = useStore((s) => s.areas);
  const setAreas = useStore((s) => s.setAreas);
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const fronts = useStore((s) => s.fronts);
  const setFronts = useStore((s) => s.setFronts);

  const [loading, setLoading] = useState(true);
  const [expandedAreas, setExpandedAreas] = useState({});
  const [expandedProjects, setExpandedProjects] = useState({});
  const [editor, setEditor] = useState(null); // { kind: 'area'|'project'|'front', mode: 'create'|'edit', payload }

  const load = async () => {
    try {
      const [a, p, f] = await Promise.all([
        apiFetch('/api/areas'),
        apiFetch('/api/projects'),
        apiFetch('/api/fronts'),
      ]);
      setAreas(a || []);
      setProjects(p || []);
      setFronts(f || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const projectsByArea = useMemo(() => {
    const m = {};
    for (const p of projects) {
      const k = p.area_id || '__none__';
      if (!m[k]) m[k] = [];
      m[k].push(p);
    }
    return m;
  }, [projects]);

  const frontsByProject = useMemo(() => {
    const m = {};
    for (const f of fronts) {
      if (!m[f.project_id]) m[f.project_id] = [];
      m[f.project_id].push(f);
    }
    return m;
  }, [fronts]);

  const toggleArea = (id) => setExpandedAreas((s) => ({ ...s, [id]: !s[id] }));
  const toggleProject = (id) => setExpandedProjects((s) => ({ ...s, [id]: !s[id] }));

  const onDelete = async (kind, id) => {
    const labels = { area: 'área', project: 'projeto', front: 'frente' };
    if (!window.confirm(`Excluir esta ${labels[kind]}? Tarefas associadas serão desvinculadas.`)) return;
    const path = kind === 'area' ? `/api/areas/${id}` : kind === 'project' ? `/api/projects/${id}` : `/api/fronts/${id}`;
    await apiFetch(path, { method: 'DELETE' });
    load();
  };

  if (loading) {
    return <div className="h-full"><LoadingSpinner label="Carregando áreas..." /></div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Layers className="h-6 w-6 text-accent" />
          Áreas &amp; Projetos
        </h1>
        <button
          onClick={() => setEditor({ kind: 'area', mode: 'create', payload: { name: '', color: DEFAULT_COLOR, description: '' } })}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          <Plus className="h-4 w-4" /> Nova Área
        </button>
      </div>

      {areas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
          <p className="text-sm text-ink2">Nenhuma área cadastrada ainda.</p>
          <p className="mt-1 text-xs text-muted">Crie uma área para começar a organizar projetos e frentes.</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {areas.map((a) => {
          const isOpen = !!expandedAreas[a.id];
          const projectsForArea = projectsByArea[a.id] || [];
          return (
            <div key={a.id} className="rounded-2xl border border-line bg-surface shadow-soft">
              <div className="flex items-start gap-3 px-4 py-3">
                <button onClick={() => toggleArea(a.id)} className="mt-1 text-ink2 hover:text-ink">
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span
                  className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
                  style={{ background: a.color || DEFAULT_COLOR }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-ink">{a.name}</h2>
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] text-ink2">
                      {a.project_count || 0} projeto{(a.project_count || 0) === 1 ? '' : 's'}
                    </span>
                  </div>
                  {a.description && <p className="mt-0.5 text-xs text-ink2">{a.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() =>
                      setEditor({
                        kind: 'project', mode: 'create',
                        payload: { name: '', color: a.color || DEFAULT_COLOR, description: '', area_id: a.id },
                      })
                    }
                    className="rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink2 hover:bg-surface2"
                  >
                    <Plus className="inline h-3 w-3" /> Projeto
                  </button>
                  <IconButton onClick={() => setEditor({ kind: 'area', mode: 'edit', payload: { ...a } })} icon={<Pencil className="h-3.5 w-3.5" />} />
                  <IconButton onClick={() => onDelete('area', a.id)} icon={<Trash2 className="h-3.5 w-3.5" />} danger />
                </div>
              </div>

              {isOpen && (
                <div className="space-y-2 border-t border-line bg-surface2/30 px-4 py-3">
                  {projectsForArea.length === 0 ? (
                    <p className="py-2 text-center text-xs text-muted">Nenhum projeto nesta área.</p>
                  ) : (
                    projectsForArea.map((p) => {
                      const pOpen = !!expandedProjects[p.id];
                      const frontsForP = frontsByProject[p.id] || [];
                      return (
                        <div key={p.id} className="rounded-lg border border-line bg-surface">
                          <div className="flex items-start gap-2 px-3 py-2">
                            <button onClick={() => toggleProject(p.id)} className="mt-0.5 text-ink2 hover:text-ink">
                              {pOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </button>
                            <FolderKanban className="mt-0.5 h-4 w-4 shrink-0" style={{ color: p.color || DEFAULT_COLOR }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-ink">{p.name}</span>
                                <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">
                                  {frontsForP.length} frente{frontsForP.length === 1 ? '' : 's'}
                                </span>
                              </div>
                              {p.description && <p className="mt-0.5 text-[11px] text-ink2">{p.description}</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                onClick={() =>
                                  setEditor({
                                    kind: 'front', mode: 'create',
                                    payload: { name: '', color: p.color || DEFAULT_COLOR, description: '', project_id: p.id },
                                  })
                                }
                                className="rounded-md border border-line px-2 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface2"
                              >
                                <Plus className="inline h-2.5 w-2.5" /> Frente
                              </button>
                              <IconButton onClick={() => setEditor({ kind: 'project', mode: 'edit', payload: { ...p } })} icon={<Pencil className="h-3 w-3" />} small />
                              <IconButton onClick={() => onDelete('project', p.id)} icon={<Trash2 className="h-3 w-3" />} danger small />
                            </div>
                          </div>
                          {pOpen && (
                            <div className="border-t border-line bg-surface2/30 px-3 py-2">
                              {frontsForP.length === 0 ? (
                                <p className="py-1 text-center text-[11px] text-muted">Sem frentes</p>
                              ) : (
                                <ul className="space-y-1">
                                  {frontsForP.map((f) => (
                                    <li key={f.id} className="flex items-center gap-2 rounded-md bg-surface px-2 py-1.5">
                                      <GitBranch className="h-3.5 w-3.5 shrink-0" style={{ color: f.color || DEFAULT_COLOR }} />
                                      <span className="flex-1 truncate text-xs text-ink">{f.name}</span>
                                      {f.task_count != null && (
                                        <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">
                                          {f.task_count} tarefa{f.task_count === 1 ? '' : 's'}
                                        </span>
                                      )}
                                      <IconButton onClick={() => setEditor({ kind: 'front', mode: 'edit', payload: { ...f } })} icon={<Pencil className="h-3 w-3" />} small />
                                      <IconButton onClick={() => onDelete('front', f.id)} icon={<Trash2 className="h-3 w-3" />} danger small />
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {projectsByArea.__none__ && projectsByArea.__none__.length > 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-surface p-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted">Projetos sem área</h3>
            <ul className="space-y-1">
              {projectsByArea.__none__.map((p) => (
                <li key={p.id} className="flex items-center gap-2 rounded-md bg-surface2 px-2 py-1.5">
                  <FolderKanban className="h-3.5 w-3.5 shrink-0" style={{ color: p.color || DEFAULT_COLOR }} />
                  <span className="flex-1 text-xs text-ink">{p.name}</span>
                  <IconButton onClick={() => setEditor({ kind: 'project', mode: 'edit', payload: { ...p } })} icon={<Pencil className="h-3 w-3" />} small />
                  <IconButton onClick={() => onDelete('project', p.id)} icon={<Trash2 className="h-3 w-3" />} danger small />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editor && (
        <EditorModal
          editor={editor}
          areas={areas}
          projects={projects}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function IconButton({ onClick, icon, danger, small }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border border-line ${small ? 'p-0.5' : 'p-1'} transition hover:bg-surface2 ${
        danger ? 'text-danger hover:bg-danger/10' : 'text-ink2 hover:text-ink'
      }`}
    >
      {icon}
    </button>
  );
}

function EditorModal({ editor, areas, projects, onClose, onSaved }) {
  const { kind, mode, payload } = editor;
  const [form, setForm] = useState(payload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titles = {
    area: mode === 'create' ? 'Nova Área' : 'Editar Área',
    project: mode === 'create' ? 'Novo Projeto' : 'Editar Projeto',
    front: mode === 'create' ? 'Nova Frente' : 'Editar Frente',
  };

  const save = async () => {
    if (!form.name || !form.name.trim()) return setError('Nome é obrigatório');
    if (kind === 'front' && !form.project_id) return setError('Projeto obrigatório');
    setBusy(true);
    setError('');
    try {
      const base = kind === 'area' ? '/api/areas' : kind === 'project' ? '/api/projects' : '/api/fronts';
      const path = mode === 'edit' ? `${base}/${form.id}` : base;
      const method = mode === 'edit' ? 'PUT' : 'POST';
      await apiFetch(path, { method, body: JSON.stringify(form) });
      onSaved();
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface shadow-soft" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-base font-bold text-ink">{titles[kind]}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink2 hover:bg-surface2"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Nome</span>
            <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </label>
          {kind !== 'front' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Descrição</span>
              <textarea
                rows={2}
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="input resize-y"
              />
            </label>
          )}
          {kind === 'project' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Área</span>
              <select
                value={form.area_id || ''}
                onChange={(e) => setForm({ ...form, area_id: e.target.value })}
                className="input"
              >
                <option value="">Sem área</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </label>
          )}
          {kind === 'front' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Projeto</span>
              <select
                value={form.project_id || ''}
                onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                className="input"
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}
          <div>
            <span className="mb-1 block text-xs font-medium text-ink2">Cor</span>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`h-6 w-6 rounded-full border ${form.color === c ? 'border-ink ring-2 ring-accent/40' : 'border-line'}`}
                  style={{ background: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
