import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Upload, Download, AlertTriangle, X, LayoutGrid, List, Columns, GitBranch, CheckSquare } from 'lucide-react';
import { useStore, selectFilteredTasks } from '../../store';
import { apiFetch } from '../../lib/api';
import { downloadTasksExport, EXPORT_FORMATS } from '../../lib/exportTasks';
import { canDo } from '../../lib/can';
import { needsDate, formatDate } from '../../lib/tasks';
import LoadingSpinner from '../shared/LoadingSpinner';
import TaskCard from './TaskCard';
import EisenhowerMatrix from './EisenhowerMatrix';
import TaskEditor from './TaskEditor';
import TaskModal from './TaskModal';
import ImportModal from './ImportModal';
import KanbanBoard from './KanbanBoard';
import TaskTreeView from './TaskTreeView';
import TaskFiltersBar from './TaskFiltersBar';
import TaskBulkBar from './TaskBulkBar';

export default function TasksPage() {
  const user = useStore((s) => s.user);
  const userGranular = useStore((s) => s.userGranular);
  const tasks = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const projects = useStore((s) => s.projects);
  const setTasks = useStore((s) => s.setTasks);
  const setProjects = useStore((s) => s.setProjects);
  const setUsers = useStore((s) => s.setUsers);
  const selectedTask = useStore((s) => s.selectedTask);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const taskFilter = useStore((s) => s.taskFilter);
  const kanbanView = useStore((s) => s.kanbanView);
  const setKanbanView = useStore((s) => s.setKanbanView);
  const taskView = useStore((s) => s.taskView);
  const setTaskView = useStore((s) => s.setTaskView);
  const treeFilter = useStore((s) => s.taskTreeFilter);
  const setAreas = useStore((s) => s.setAreas);
  const setFronts = useStore((s) => s.setFronts);
  const setCareerOpportunities = useStore((s) => s.setCareerOpportunities);
  const [toast, setToast] = useState('');
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 5000);
  };

  // Compute locally with useMemo. Subscribing via useStore(selectFilteredTasks)
  // would return a new array every render → Zustand v5 + useSyncExternalStore
  // treats that as a perpetual state change → React #185 (max update depth).
  // v2.26.1 — "Tarefas de carreira" e "Recorrentes" deixaram de ser estado
  // local (careerOnly/recurringOnly) e passaram a viver em taskFilter
  // (onlyCareer/onlyRecurring), junto dos outros filtros novos — assim
  // aparecem certinho nos chips de "filtros ativos" da nova barra.
  const filteredBase = useMemo(
    () => selectFilteredTasks({ tasks, taskFilter, user }),
    [tasks, taskFilter, user]
  );

  // Apply the tree filter (sidebar/dropdown de Área) sobre o filtro base.
  const filtered = useMemo(() => {
    let list = filteredBase;
    if (treeFilter.areaId || treeFilter.projectId || treeFilter.frontId) {
      list = list.filter((t) => {
        if (treeFilter.frontId) return t.front_id === treeFilter.frontId;
        if (treeFilter.projectId) return t.project_id === treeFilter.projectId;
        if (treeFilter.areaId) return t.area_id === treeFilter.areaId;
        return true;
      });
    }
    return list;
  }, [filteredBase, treeFilter]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // editorTask: undefined = closed, null = new, object = edit
  const [editorTask, setEditorTask] = useState(undefined);
  const [editorStatus, setEditorStatus] = useState(undefined); // preset status for new task
  const [showImport, setShowImport] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);
  // Seleção múltipla + edição em lote (v2.25.20) — só na vista Lista.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const canEditTasks = canDo(userGranular, 'tasks', 'edit_all') || canDo(userGranular, 'tasks', 'edit_own');
  const applyBulkPatch = async (patch) => {
    const ids = [...selectedIds];
    const res = await apiFetch('/api/tasks/bulk', {
      method: 'PATCH',
      body: JSON.stringify({ ids, patch }),
    });
    await loadAll();
    const updated = (res && res.updated) || 0;
    const skippedCount = (res && res.skipped && res.skipped.length) || 0;
    showToast(
      skippedCount > 0
        ? `${updated} tarefa(s) atualizada(s) · ${skippedCount} sem permissão`
        : `${updated} tarefa(s) atualizada(s)`
    );
    setSelectedIds(new Set());
  };
  // Menu de export. Fecha ao clicar fora — mesmo padrão do menu de perfil.
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  const exportRef = useRef(null);
  useEffect(() => {
    if (!exportOpen) return undefined;
    const fora = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false); };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [exportOpen]);

  const loadAll = async () => {
    try {
      const [t, p, u, a, f, o] = await Promise.all([
        apiFetch('/api/tasks'),
        apiFetch('/api/projects'),
        apiFetch('/api/users'),
        apiFetch('/api/areas').catch(() => []),
        apiFetch('/api/fronts').catch(() => []),
        apiFetch('/api/career/opportunities').catch(() => []),
      ]);
      setTasks(t);
      setProjects(p);
      setUsers(u);
      setAreas(a || []);
      setFronts(f || []);
      setCareerOpportunities(o || []);
      setError('');
    } catch {
      setError('Falha ao carregar tarefas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Deep-link da busca global (?task=<id>): seleciona a tarefa assim que a
  // lista carregar e limpa o param pra não reabrir num refresh/voltar depois.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const taskId = searchParams.get('task');
    if (!taskId || !tasks.length) return;
    const found = tasks.find((t) => t.id === taskId);
    if (found) setSelectedTask(found);
    const next = new URLSearchParams(searchParams);
    next.delete('task');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, tasks]);

  const noDateCount = tasks.filter(needsDate).length;

  const onSaved = (saved) => {
    setEditorTask(undefined);
    setEditorStatus(undefined);
    setSelectedTask(saved);
    loadAll();
  };
  const onDeleted = (id) => {
    // eslint-disable-next-line no-console
    console.log('[TasksPage] onDeleted chamado para', id, '— recarregando lista');
    setEditorTask(undefined);
    setEditorStatus(undefined);
    if (selectedTask?.id === id) setSelectedTask(null);
    loadAll();
  };
  const onImported = () => {
    setShowImport(false);
    loadAll();
  };

  // Optimistic single-field update (favorite, status drag). Reverts on failure.
  const persistTask = async (task, patch) => {
    const next = { ...task, ...patch };
    setTasks(tasks.map((t) => (t.id === task.id ? next : t)));
    if (selectedTask?.id === task.id) setSelectedTask(next);
    try {
      const res = await apiFetch(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(patch) });
      // v2.25.5 — quando a conclusão gera a próxima ocorrência (tarefa
      // recorrente), o backend anexa `nextRecurrence` na resposta.
      if (res && res.nextRecurrence && res.nextRecurrence.due_date) {
        showToast(`✓ Concluída! Próxima ocorrência criada para ${formatDate(res.nextRecurrence.due_date)}`);
        loadAll();
      }
      return res;
    } catch {
      loadAll();
    }
  };
  const toggleFavorite = (task) => persistTask(task, { favorited: task.favorited ? 0 : 1 });
  const changeStatus = (task, status) => persistTask(task, { status });
  // v2.25.19 — subtarefas agora podem ser linhas reais (isReal) ou o JSON
  // legado. As reais têm endpoint próprio; as legadas seguem salvando o array
  // inteiro no PUT da tarefa mãe, como antes.
  const toggleSubtask = async (task, subId) => {
    const sub = (task.subtasks || []).find((s) => s.id === subId);
    if (!sub) return;
    if (!sub.isReal) {
      return persistTask(task, {
        subtasks: (task.subtasks || []).map((s) => (s.id === subId ? { ...s, done: !s.done } : s)),
      });
    }
    // Otimista na lista, igual ao persistTask: reverte recarregando em caso de erro.
    const next = {
      ...task,
      subtasks: task.subtasks.map((s) =>
        (s.id === subId ? { ...s, done: !s.done, status: s.done ? 'todo' : 'done' } : s)),
    };
    setTasks(tasks.map((t) => (t.id === task.id ? next : t)));
    if (selectedTask?.id === task.id) setSelectedTask(next);
    try {
      await apiFetch(`/api/tasks/${task.id}/subtasks/${subId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: sub.done ? 'todo' : 'done' }),
      });
    } catch {
      loadAll();
    }
  };
  const addInColumn = (status) => {
    setEditorStatus(status);
    setEditorTask(null);
  };

  if (loading) {
    return (
      <div className="h-full">
        <LoadingSpinner label="Carregando tarefas..." />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">Tarefas</h1>
        <div className="flex flex-wrap gap-2">
          <div className="flex overflow-hidden rounded-lg border border-line">
            <button
              type="button"
              onClick={() => { setTaskView('list'); setKanbanView(false); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                taskView === 'list' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              <List className="h-4 w-4" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => { setTaskView('kanban'); setKanbanView(true); }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                taskView === 'kanban' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              <Columns className="h-4 w-4" />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setTaskView('tree')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                taskView === 'tree' ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
              }`}
            >
              <GitBranch className="h-4 w-4" />
              Árvore
            </button>
          </div>
          {taskView === 'list' && canEditTasks && (
            <button
              type="button"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                selectMode ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink2 hover:bg-surface2'
              }`}
            >
              <CheckSquare className="h-4 w-4" />
              {selectMode ? 'Cancelar seleção' : 'Selecionar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowMatrix((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
          >
            <LayoutGrid className="h-4 w-4" />
            {showMatrix ? 'Ocultar Matriz' : 'Ver Matriz'}
          </button>
          <button
            type="button"
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
          >
            <Upload className="h-4 w-4" />
            Importar
          </button>
          <div ref={exportRef} className="relative">
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
            >
              <Download className="h-4 w-4" />
              Exportar
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-11 z-30 w-[260px] overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
                {EXPORT_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    disabled={!!exporting}
                    onClick={async () => {
                      setExporting(f.id);
                      try {
                        // Exporta exactamente o que está no ecrã (filtros,
                        // pesquisa e separador incluídos).
                        const nome = await downloadTasksExport({
                          format: f.id,
                          ids: filtered.map((t) => t.id),
                        });
                        showToast(`✅ ${nome} (${filtered.length} tarefas)`);
                        setExportOpen(false);
                      } catch (e) {
                        showToast(`Falha ao exportar: ${String((e && e.message) || e).slice(0, 80)}`);
                      } finally {
                        setExporting('');
                      }
                    }}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2 disabled:opacity-60"
                  >
                    <span>{f.icon}</span>
                    <span className="flex-1">
                      <span className="block font-medium">
                        {exporting === f.id ? 'A exportar...' : `Exportar ${f.label}`}
                      </span>
                      <span className="block text-[11px] text-muted">{f.hint}</span>
                    </span>
                  </button>
                ))}
                {/* O âmbito continua a ser decidido no servidor: os ids são um
                    recorte do que já é teu. Para exportar TUDO (owner), o modal
                    do menu de perfil tem o selector de âmbito. */}
                <div className="border-t border-line px-3 py-2 text-[11px] text-muted">
                  Exporta as {filtered.length} tarefa(s) desta vista, com os filtros aplicados.
                </div>
              </div>
            )}
          </div>
          {canDo(userGranular, 'tasks', 'create') && (
            <button
              type="button"
              onClick={() => setEditorTask(null)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              Nova Tarefa
            </button>
          )}
        </div>
      </div>

      {/* Filters — v2.26.1: barra compacta com dropdowns (ver TaskFiltersBar) */}
      <TaskFiltersBar />

        {/* Alert banner */}
        {noDateCount > 0 && !alertDismissed && (
          <div
            className="mt-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs font-medium"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" style={{ color: '#F59E0B' }} />
              {noDateCount} tarefa(s) sem data definida
            </span>
            <button type="button" onClick={() => setAlertDismissed(true)} className="hover:opacity-70">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {/* Active tree-filter pill (Lista view) */}
        {taskView === 'list' && (treeFilter.areaId || treeFilter.projectId || treeFilter.frontId) && (
          <TreeFilterPill />
        )}

        {/* Seleção múltipla — atalho para marcar tudo que está visível e barra
            de edição em lote (v2.25.20). */}
        {taskView === 'list' && selectMode && filtered.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-xs text-ink2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set(filtered.map((t) => t.id)))}
              className="underline decoration-dotted hover:text-ink"
            >
              Selecionar todas as {filtered.length} visíveis
            </button>
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="underline decoration-dotted hover:text-ink"
              >
                Limpar seleção
              </button>
            )}
          </div>
        )}
        {taskView === 'list' && selectedIds.size > 0 && (
          <TaskBulkBar
            count={selectedIds.size}
            users={users}
            projects={projects}
            onApply={applyBulkPatch}
            onClear={() => setSelectedIds(new Set())}
          />
        )}

        {/* Task list / Kanban / Árvore */}
        <div className="mt-3 flex min-h-0 flex-1 gap-3 overflow-hidden pb-2">
          <div className="min-w-0 flex-1 overflow-y-auto">
            {taskView === 'kanban' ? (
              <KanbanBoard
                tasks={filtered}
                selectedTask={selectedTask}
                onSelect={setSelectedTask}
                onToggleFavorite={toggleFavorite}
                onStatusChange={changeStatus}
                onAddTask={addInColumn}
                onToggleSubtask={toggleSubtask}
              />
            ) : taskView === 'tree' ? (
              <TaskTreeView
                onOpenTask={setSelectedTask}
                onPersist={persistTask}
                onChanged={loadAll}
              />
            ) : filtered.length === 0 ? (
              <p className="mt-8 text-center text-sm text-muted">Nenhuma tarefa encontrada.</p>
            ) : (
              <div className="space-y-2">
                {filtered.map((t) => (
                  <div key={t.id} className="flex items-start gap-2">
                    {selectMode && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="mt-4 h-4 w-4 shrink-0 accent-accent"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <TaskCard
                        task={t}
                        selected={selectedTask?.id === t.id}
                        onClick={() => (selectMode ? toggleSelect(t.id) : setSelectedTask(t))}
                        onToggleFavorite={toggleFavorite}
                        onToggleSubtask={toggleSubtask}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      {/* Eisenhower Matrix — collapsible, below the list */}
      {showMatrix && (
        <div className="mt-4 shrink-0">
          <EisenhowerMatrix tasks={filtered} selectedTask={selectedTask} onSelect={setSelectedTask} />
        </div>
      )}

      {/* Task detail modal */}
      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={(t) => {
            setSelectedTask(null);
            setEditorTask(t);
          }}
          onPersist={persistTask}
          onDelete={onDeleted}
          onOpenTask={(t) => setSelectedTask(t)}
        />
      )}

      {/* Editor slide-in */}
      {editorTask !== undefined && (
        <TaskEditor
          task={editorTask}
          users={users}
          initialStatus={editorStatus}
          onClose={() => {
            setEditorTask(undefined);
            setEditorStatus(undefined);
          }}
          onSaved={onSaved}
          onDeleted={onDeleted}
          onChanged={loadAll}
        />
      )}

      {/* Import modal */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={onImported} />}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}

function TreeFilterPill() {
  const filter = useStore((s) => s.taskTreeFilter);
  const clearFilter = useStore((s) => s.clearTaskTreeFilter);
  const areas = useStore((s) => s.areas);
  const projects = useStore((s) => s.projects);
  const fronts = useStore((s) => s.fronts);
  const area = filter.areaId ? areas.find((a) => a.id === filter.areaId) : null;
  const project = filter.projectId ? projects.find((p) => p.id === filter.projectId) : null;
  const front = filter.frontId ? fronts.find((f) => f.id === filter.frontId) : null;
  const path = [area?.name, project?.name, front?.name].filter(Boolean).join(' › ');
  return (
    <div className="mt-2 flex w-fit items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent">
      <span>Filtro: {path}</span>
      <button onClick={clearFilter} className="hover:text-accent-hover" title="Limpar filtro">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
