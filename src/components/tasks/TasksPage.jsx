import { useEffect, useMemo, useState } from 'react';
import { Plus, Upload, AlertTriangle, X, LayoutGrid, Search, List, Columns } from 'lucide-react';
import { useStore, selectFilteredTasks } from '../../store';
import { apiFetch } from '../../lib/api';
import { needsDate } from '../../lib/tasks';
import LoadingSpinner from '../shared/LoadingSpinner';
import TaskCard from './TaskCard';
import EisenhowerMatrix from './EisenhowerMatrix';
import TaskEditor from './TaskEditor';
import TaskDetail from './TaskDetail';
import ImportModal from './ImportModal';
import KanbanBoard from './KanbanBoard';

const STATUS_TABS = [
  ['all', 'Todas'],
  ['favorites', '⭐ Favoritas'],
  ['backlog', 'Backlog'],
  ['todo', 'A Fazer'],
  ['doing', 'Fazendo'],
  ['done', 'Concluídas'],
];

export default function TasksPage() {
  const user = useStore((s) => s.user);
  const tasks = useStore((s) => s.tasks);
  const users = useStore((s) => s.users);
  const setTasks = useStore((s) => s.setTasks);
  const setProjects = useStore((s) => s.setProjects);
  const setUsers = useStore((s) => s.setUsers);
  const selectedTask = useStore((s) => s.selectedTask);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const taskFilter = useStore((s) => s.taskFilter);
  const setTaskFilter = useStore((s) => s.setTaskFilter);
  const kanbanView = useStore((s) => s.kanbanView);
  const setKanbanView = useStore((s) => s.setKanbanView);
  // Compute locally with useMemo. Subscribing via useStore(selectFilteredTasks)
  // would return a new array every render → Zustand v5 + useSyncExternalStore
  // treats that as a perpetual state change → React #185 (max update depth).
  const filtered = useMemo(
    () => selectFilteredTasks({ tasks, taskFilter, user }),
    [tasks, taskFilter, user]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // editorTask: undefined = closed, null = new, object = edit
  const [editorTask, setEditorTask] = useState(undefined);
  const [editorStatus, setEditorStatus] = useState(undefined); // preset status for new task
  const [showImport, setShowImport] = useState(false);
  const [showMatrixMobile, setShowMatrixMobile] = useState(false);
  const [alertDismissed, setAlertDismissed] = useState(false);

  const loadAll = async () => {
    try {
      const [t, p, u] = await Promise.all([
        apiFetch('/api/tasks'),
        apiFetch('/api/projects'),
        apiFetch('/api/users'),
      ]);
      setTasks(t);
      setProjects(p);
      setUsers(u);
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

  const otherUser = users.find((u) => u.id !== user?.id);
  const otherName = otherUser?.name ? otherUser.name.split(' ')[0] : 'Alice';

  const noDateCount = tasks.filter(needsDate).length;

  const onSaved = (saved) => {
    setEditorTask(undefined);
    setEditorStatus(undefined);
    setSelectedTask(saved);
    loadAll();
  };
  const onDeleted = (id) => {
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
      await apiFetch(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(patch) });
    } catch {
      loadAll();
    }
  };
  const toggleFavorite = (task) => persistTask(task, { favorited: task.favorited ? 0 : 1 });
  const changeStatus = (task, status) => persistTask(task, { status });
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
    <div className="flex h-full flex-col gap-4 md:flex-row">
      {/* LEFT PANEL */}
      <div className="flex min-h-0 flex-1 flex-col md:w-3/5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-ink">Tarefas</h1>
          <div className="flex flex-wrap gap-2">
            <div className="flex overflow-hidden rounded-lg border border-line">
              <button
                type="button"
                onClick={() => setKanbanView(false)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                  !kanbanView ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                }`}
              >
                <List className="h-4 w-4" />
                Lista
              </button>
              <button
                type="button"
                onClick={() => setKanbanView(true)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition ${
                  kanbanView ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                }`}
              >
                <Columns className="h-4 w-4" />
                Kanban
              </button>
            </div>
            <button
              type="button"
              onClick={() => setShowMatrixMobile((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2 md:hidden"
            >
              <LayoutGrid className="h-4 w-4" />
              {showMatrixMobile ? 'Ocultar Matriz' : 'Ver Matriz'}
            </button>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2"
            >
              <Upload className="h-4 w-4" />
              Importar Lista
            </button>
            <button
              type="button"
              onClick={() => setEditorTask(null)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              <Plus className="h-4 w-4" />
              Nova Tarefa
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {STATUS_TABS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTaskFilter({ status: value })}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  taskFilter.status === value
                    ? 'bg-accent text-white'
                    : 'bg-surface2 text-ink2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 sm:min-w-[180px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={taskFilter.search}
              onChange={(e) => setTaskFilter({ search: e.target.value })}
              placeholder="Buscar por título..."
              className="input pl-8"
            />
          </div>
        </div>

        {/* Assign filter */}
        <div className="mt-2 flex gap-1">
          {[
            ['all', 'Todas'],
            ['me', 'Eu'],
            ['other', otherName],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTaskFilter({ assignedTo: value })}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                taskFilter.assignedTo === value
                  ? 'bg-ink text-white'
                  : 'bg-surface2 text-ink2 hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

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

        {/* Task list / Kanban */}
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-2">
          {kanbanView ? (
            <KanbanBoard
              tasks={filtered}
              selectedTask={selectedTask}
              onSelect={setSelectedTask}
              onToggleFavorite={toggleFavorite}
              onStatusChange={changeStatus}
              onAddTask={addInColumn}
            />
          ) : filtered.length === 0 ? (
            <p className="mt-8 text-center text-sm text-muted">Nenhuma tarefa encontrada.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  selected={selectedTask?.id === t.id}
                  onClick={() => setSelectedTask(t)}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className={`md:w-2/5 ${showMatrixMobile ? 'block' : 'hidden'} md:block`}>
        <EisenhowerMatrix tasks={filtered} selectedTask={selectedTask} onSelect={setSelectedTask} />
        {selectedTask ? (
          <TaskDetail task={selectedTask} onEdit={() => setEditorTask(selectedTask)} />
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
            Selecione uma tarefa para ver os detalhes.
          </div>
        )}
      </div>

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
        />
      )}

      {/* Import modal */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} onImported={onImported} />}
    </div>
  );
}
