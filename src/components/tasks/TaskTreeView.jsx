import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight, ChevronDown, Plus, Star, Circle, CheckCircle2, GitBranch, FolderKanban, Layers,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';

const DEFAULT_COLOR = '#6366f1';

function clsStatus(status) {
  if (status === 'done') return '#22C55E';
  if (status === 'doing') return '#F59E0B';
  if (status === 'todo') return '#6366f1';
  return '#9E9890';
}

function isOverdue(due) {
  if (!due) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${due}T00:00:00`);
  return d.getTime() < today.getTime();
}

function loadCollapse(userId) {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(`aide-tree-collapse-${userId || 'anon'}`) || '{}');
  } catch {
    return {};
  }
}
function saveCollapse(userId, value) {
  try {
    localStorage.setItem(`aide-tree-collapse-${userId || 'anon'}`, JSON.stringify(value));
  } catch { /* quota or private mode */ }
}

export default function TaskTreeView({ onOpenTask, onPersist, onChanged }) {
  const user = useStore((s) => s.user);
  const areas = useStore((s) => s.areas);
  const setAreas = useStore((s) => s.setAreas);
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const fronts = useStore((s) => s.fronts);
  const setFronts = useStore((s) => s.setFronts);
  const tasks = useStore((s) => s.tasks);
  const setTasks = useStore((s) => s.setTasks);

  const [collapse, setCollapse] = useState(() => loadCollapse(user?.id));
  const [inlineForm, setInlineForm] = useState(null); // { kind, parentId, value }
  const [editor, setEditor] = useState(null); // { kind, payload }

  useEffect(() => {
    // Hydrate hierarchy lazily if it hasn't been loaded yet.
    if (areas.length === 0) apiFetch('/api/areas').then(setAreas).catch(() => {});
    if (projects.length === 0) apiFetch('/api/projects').then(setProjects).catch(() => {});
    if (fronts.length === 0) apiFetch('/api/fronts').then(setFronts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (key) => {
    const next = { ...collapse, [key]: !collapse[key] };
    setCollapse(next);
    saveCollapse(user?.id, next);
  };

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

  // Tasks bucketed by where they live in the tree.
  const tasksByFront = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      if (t.front_id) {
        if (!m[t.front_id]) m[t.front_id] = [];
        m[t.front_id].push(t);
      }
    }
    return m;
  }, [tasks]);

  const tasksByProjectNoFront = useMemo(() => {
    const m = {};
    for (const t of tasks) {
      if (!t.front_id && t.project_id) {
        if (!m[t.project_id]) m[t.project_id] = [];
        m[t.project_id].push(t);
      }
    }
    return m;
  }, [tasks]);

  const orphanTasks = useMemo(
    () => tasks.filter((t) => !t.project_id && !t.front_id),
    [tasks]
  );

  const countTasksInProject = (projectId) => {
    const direct = (tasksByProjectNoFront[projectId] || []).length;
    const inFronts = (frontsByProject[projectId] || [])
      .reduce((s, f) => s + (tasksByFront[f.id] || []).length, 0);
    return direct + inFronts;
  };
  const countTasksInArea = (areaId) =>
    (projectsByArea[areaId] || []).reduce((s, p) => s + countTasksInProject(p.id), 0);

  const submitInline = async () => {
    if (!inlineForm) return;
    const { kind, parentId, value } = inlineForm;
    const name = (value || '').trim();
    if (!name) { setInlineForm(null); return; }
    try {
      if (kind === 'project') {
        await apiFetch('/api/projects', {
          method: 'POST',
          body: JSON.stringify({ name, area_id: parentId, color: DEFAULT_COLOR }),
        });
        const p = await apiFetch('/api/projects');
        setProjects(p);
      } else if (kind === 'front') {
        await apiFetch('/api/fronts', {
          method: 'POST',
          body: JSON.stringify({ name, project_id: parentId, color: DEFAULT_COLOR }),
        });
        const f = await apiFetch('/api/fronts');
        setFronts(f);
      } else if (kind === 'task') {
        // parentId is the front_id; we derive project_id from the front.
        const front = fronts.find((x) => x.id === parentId);
        await apiFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: name,
            front_id: parentId,
            project_id: front?.project_id || null,
            status: 'backlog',
            urgency: 5, importance: 5, energy: 5,
          }),
        });
        const t = await apiFetch('/api/tasks');
        setTasks(t);
        onChanged && onChanged();
      } else if (kind === 'task-in-project') {
        await apiFetch('/api/tasks', {
          method: 'POST',
          body: JSON.stringify({
            title: name,
            project_id: parentId,
            status: 'backlog',
            urgency: 5, importance: 5, energy: 5,
          }),
        });
        const t = await apiFetch('/api/tasks');
        setTasks(t);
        onChanged && onChanged();
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Inline create failed:', e);
    } finally {
      setInlineForm(null);
    }
  };

  const taskRowFor = (t) => (
    <div key={t.id} className="group flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1.5">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPersist && onPersist(t, { status: t.status === 'done' ? 'todo' : 'done' });
        }}
        title={t.status === 'done' ? 'Marcar como aberta' : 'Concluir'}
        className="shrink-0"
      >
        {t.status === 'done' ? (
          <CheckCircle2 className="h-4 w-4" style={{ color: '#22C55E' }} />
        ) : (
          <Circle className="h-4 w-4" style={{ color: clsStatus(t.status) }} />
        )}
      </button>
      <button
        onClick={() => onOpenTask && onOpenTask(t)}
        className="min-w-0 flex-1 truncate text-left text-xs text-ink hover:text-accent"
      >
        {t.title}
      </button>
      {t.score != null && (
        <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{t.score}</span>
      )}
      {t.due_date && (
        <span
          className="shrink-0 text-[10px]"
          style={{ color: isOverdue(t.due_date) ? '#EF4444' : '#6B6560' }}
        >
          {t.due_date.slice(5)}
        </span>
      )}
      {t.assignedUser?.name && (
        <span className="shrink-0 rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2" title={t.assignedUser.name}>
          {t.assignedUser.name.split(' ')[0]}
        </span>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPersist && onPersist(t, { favorited: t.favorited ? 0 : 1 });
        }}
        className="shrink-0 text-muted hover:text-yellow-500"
        title="Favoritar"
      >
        <Star className={`h-3.5 w-3.5 ${t.favorited ? 'fill-yellow-400 text-yellow-500' : ''}`} />
      </button>
    </div>
  );

  if (areas.length === 0 && orphanTasks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <p className="text-sm text-ink2">Nenhuma área cadastrada ainda.</p>
        <p className="mt-1 text-[11px] text-muted">Crie áreas em "Áreas" no menu para organizar projetos, frentes e tarefas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {areas.map((a) => {
        const areaKey = `area:${a.id}`;
        const closed = !!collapse[areaKey];
        const projectsForArea = projectsByArea[a.id] || [];
        const total = countTasksInArea(a.id);
        return (
          <div
            key={a.id}
            className="rounded-xl border border-line bg-surface"
            style={{ borderLeft: `4px solid ${a.color || DEFAULT_COLOR}` }}
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => toggle(areaKey)} className="text-ink2 hover:text-ink">
                {closed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color || DEFAULT_COLOR }} />
              <Layers className="h-3.5 w-3.5 text-ink2" />
              <button onClick={() => setEditor({ kind: 'area', payload: { ...a } })} className="text-sm font-semibold text-ink hover:text-accent">
                {a.name}
              </button>
              <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{total} tarefa{total === 1 ? '' : 's'}</span>
              <button
                onClick={() => setInlineForm({ kind: 'project', parentId: a.id, value: '' })}
                className="ml-auto rounded-md border border-line px-2 py-0.5 text-[11px] font-medium text-ink2 hover:bg-surface2"
              >
                <Plus className="inline h-3 w-3" /> Novo Projeto
              </button>
            </div>

            {!closed && (
              <div className="space-y-2 border-t border-line px-3 py-2">
                {inlineForm && inlineForm.kind === 'project' && inlineForm.parentId === a.id && (
                  <InlineInput
                    placeholder="Nome do projeto..."
                    value={inlineForm.value}
                    onChange={(v) => setInlineForm({ ...inlineForm, value: v })}
                    onSubmit={submitInline}
                    onCancel={() => setInlineForm(null)}
                  />
                )}
                {projectsForArea.length === 0 && !(inlineForm && inlineForm.parentId === a.id) ? (
                  <p className="py-1 text-[11px] text-muted">Nenhum projeto nesta área.</p>
                ) : (
                  projectsForArea.map((p) => {
                    const projKey = `project:${p.id}`;
                    const pClosed = !!collapse[projKey];
                    const frontsForP = frontsByProject[p.id] || [];
                    const directTasks = tasksByProjectNoFront[p.id] || [];
                    const pTotal = countTasksInProject(p.id);
                    return (
                      <div key={p.id} className="rounded-lg border border-line bg-base">
                        <div className="flex items-center gap-2 px-2 py-1.5">
                          <button onClick={() => toggle(projKey)} className="text-ink2 hover:text-ink">
                            {pClosed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                          <FolderKanban className="h-3.5 w-3.5 shrink-0" style={{ color: p.color || DEFAULT_COLOR }} />
                          <button onClick={() => setEditor({ kind: 'project', payload: { ...p } })} className="text-xs font-medium text-ink hover:text-accent">
                            {p.name}
                          </button>
                          <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{pTotal}</span>
                          <div className="ml-auto flex items-center gap-1">
                            <button
                              onClick={() => setInlineForm({ kind: 'front', parentId: p.id, value: '' })}
                              className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface2"
                            >
                              <Plus className="inline h-2.5 w-2.5" /> Frente
                            </button>
                            <button
                              onClick={() => setInlineForm({ kind: 'task-in-project', parentId: p.id, value: '' })}
                              className="rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface2"
                            >
                              <Plus className="inline h-2.5 w-2.5" /> Tarefa
                            </button>
                          </div>
                        </div>
                        {!pClosed && (
                          <div className="space-y-2 border-t border-line px-3 py-2">
                            {inlineForm && inlineForm.kind === 'front' && inlineForm.parentId === p.id && (
                              <InlineInput
                                placeholder="Nome da frente..."
                                value={inlineForm.value}
                                onChange={(v) => setInlineForm({ ...inlineForm, value: v })}
                                onSubmit={submitInline}
                                onCancel={() => setInlineForm(null)}
                              />
                            )}
                            {inlineForm && inlineForm.kind === 'task-in-project' && inlineForm.parentId === p.id && (
                              <InlineInput
                                placeholder="Título da tarefa..."
                                value={inlineForm.value}
                                onChange={(v) => setInlineForm({ ...inlineForm, value: v })}
                                onSubmit={submitInline}
                                onCancel={() => setInlineForm(null)}
                              />
                            )}
                            {frontsForP.map((f) => {
                              const frontKey = `front:${f.id}`;
                              const fClosed = !!collapse[frontKey];
                              const frontTasks = tasksByFront[f.id] || [];
                              return (
                                <div key={f.id} className="rounded-md border border-line bg-surface">
                                  <div className="flex items-center gap-2 px-2 py-1.5">
                                    <button onClick={() => toggle(frontKey)} className="text-ink2 hover:text-ink">
                                      {fClosed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                    </button>
                                    <GitBranch className="h-3.5 w-3.5 shrink-0" style={{ color: f.color || DEFAULT_COLOR }} />
                                    <button onClick={() => setEditor({ kind: 'front', payload: { ...f } })} className="text-[11px] font-medium text-ink hover:text-accent">
                                      {f.name}
                                    </button>
                                    <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{frontTasks.length}</span>
                                    <button
                                      onClick={() => setInlineForm({ kind: 'task', parentId: f.id, value: '' })}
                                      className="ml-auto rounded-md border border-line px-1.5 py-0.5 text-[10px] font-medium text-ink2 hover:bg-surface2"
                                    >
                                      <Plus className="inline h-2.5 w-2.5" /> Tarefa
                                    </button>
                                  </div>
                                  {!fClosed && (
                                    <div className="space-y-1 border-t border-line px-3 py-2">
                                      {inlineForm && inlineForm.kind === 'task' && inlineForm.parentId === f.id && (
                                        <InlineInput
                                          placeholder="Título da tarefa..."
                                          value={inlineForm.value}
                                          onChange={(v) => setInlineForm({ ...inlineForm, value: v })}
                                          onSubmit={submitInline}
                                          onCancel={() => setInlineForm(null)}
                                        />
                                      )}
                                      {frontTasks.length === 0 && !(inlineForm && inlineForm.parentId === f.id) ? (
                                        <p className="py-1 text-[11px] text-muted">Sem tarefas.</p>
                                      ) : (
                                        frontTasks.map(taskRowFor)
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {directTasks.length > 0 && (
                              <div className="space-y-1 rounded-md border border-dashed border-line p-2">
                                <p className="text-[10px] uppercase text-muted">Sem frente</p>
                                {directTasks.map(taskRowFor)}
                              </div>
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

      {/* Projects without an area */}
      {(projectsByArea.__none__ || []).length > 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-3">
          <p className="mb-2 text-[10px] uppercase text-muted">Projetos sem área</p>
          <div className="space-y-2">
            {projectsByArea.__none__.map((p) => {
              const projKey = `project:${p.id}`;
              const pClosed = !!collapse[projKey];
              const directTasks = tasksByProjectNoFront[p.id] || [];
              return (
                <div key={p.id} className="rounded-lg border border-line bg-base">
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <button onClick={() => toggle(projKey)} className="text-ink2 hover:text-ink">
                      {pClosed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    <FolderKanban className="h-3.5 w-3.5 text-ink2" />
                    <span className="text-xs font-medium text-ink">{p.name}</span>
                    <span className="rounded-full bg-surface2 px-1.5 py-0.5 text-[10px] text-ink2">{directTasks.length}</span>
                  </div>
                  {!pClosed && (
                    <div className="space-y-1 border-t border-line px-3 py-2">
                      {directTasks.length === 0
                        ? <p className="py-1 text-[11px] text-muted">Sem tarefas.</p>
                        : directTasks.map(taskRowFor)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Orphan tasks */}
      {orphanTasks.length > 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface p-3">
          <p className="mb-2 text-[10px] uppercase text-muted">Sem projeto</p>
          <div className="space-y-1">{orphanTasks.map(taskRowFor)}</div>
        </div>
      )}

      {editor && (
        <HierarchyEditor
          editor={editor}
          areas={areas}
          projects={projects}
          onClose={() => setEditor(null)}
          onSaved={async () => {
            setEditor(null);
            const [a, p, f] = await Promise.all([
              apiFetch('/api/areas').catch(() => []),
              apiFetch('/api/projects').catch(() => []),
              apiFetch('/api/fronts').catch(() => []),
            ]);
            setAreas(a); setProjects(p); setFronts(f);
          }}
        />
      )}
    </div>
  );
}

function InlineInput({ placeholder, value, onChange, onSubmit, onCancel }) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-accent/40 bg-surface px-2 py-1">
      <input
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSubmit(); }
          if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        }}
        className="flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
      />
      <button onClick={onSubmit} className="rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent-hover">
        Adicionar
      </button>
      <button onClick={onCancel} className="text-[11px] text-ink2 hover:text-ink">Cancelar</button>
    </div>
  );
}

function HierarchyEditor({ editor, areas, projects, onClose, onSaved }) {
  const { kind, payload } = editor;
  const [form, setForm] = useState(payload);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titles = { area: 'Editar Área', project: 'Editar Projeto', front: 'Editar Frente' };

  const save = async () => {
    if (!form.name || !form.name.trim()) return setError('Nome é obrigatório');
    setBusy(true);
    try {
      const base = kind === 'area' ? '/api/areas' : kind === 'project' ? '/api/projects' : '/api/fronts';
      await apiFetch(`${base}/${form.id}`, { method: 'PUT', body: JSON.stringify(form) });
      onSaved();
    } catch (e) {
      setError(String((e && e.message) || e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const labels = { area: 'área', project: 'projeto', front: 'frente' };
    if (!window.confirm(`Excluir esta ${labels[kind]}? Tarefas serão desvinculadas.`)) return;
    setBusy(true);
    try {
      const base = kind === 'area' ? '/api/areas' : kind === 'project' ? '/api/projects' : '/api/fronts';
      await apiFetch(`${base}/${form.id}`, { method: 'DELETE' });
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
          <button onClick={onClose} className="text-ink2 hover:text-ink">×</button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Nome</span>
            <input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" />
          </label>
          {kind === 'project' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Área</span>
              <select value={form.area_id || ''} onChange={(e) => setForm({ ...form, area_id: e.target.value })} className="input">
                <option value="">Sem área</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
          )}
          {kind === 'front' && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Projeto</span>
              <select value={form.project_id || ''} onChange={(e) => setForm({ ...form, project_id: e.target.value })} className="input">
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Cor</span>
            <input type="color" value={form.color || '#6366f1'} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 w-20 rounded-md border border-line" />
          </label>
        </div>
        <div className="flex justify-between gap-2 border-t border-line px-4 py-3">
          <button onClick={remove} disabled={busy} className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger hover:bg-danger/10 disabled:opacity-60">
            Excluir
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">Cancelar</button>
            <button onClick={save} disabled={busy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60">
              {busy ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
