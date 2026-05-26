import { useEffect, useState } from 'react';
import { ChevronRight, ChevronDown, X } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';

// Left sidebar tree used by the Lista view to filter tasks down to a specific
// Area / Project / Frente. Active filter is stored in the global store.
export default function TaskTreeFilter() {
  const areas = useStore((s) => s.areas);
  const setAreas = useStore((s) => s.setAreas);
  const projects = useStore((s) => s.projects);
  const setProjects = useStore((s) => s.setProjects);
  const fronts = useStore((s) => s.fronts);
  const setFronts = useStore((s) => s.setFronts);
  const filter = useStore((s) => s.taskTreeFilter);
  const setFilter = useStore((s) => s.setTaskTreeFilter);
  const clearFilter = useStore((s) => s.clearTaskTreeFilter);

  const [open, setOpen] = useState({});

  useEffect(() => {
    if (areas.length === 0) apiFetch('/api/areas').then(setAreas).catch(() => {});
    if (projects.length === 0) apiFetch('/api/projects').then(setProjects).catch(() => {});
    if (fronts.length === 0) apiFetch('/api/fronts').then(setFronts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (k) => setOpen((s) => ({ ...s, [k]: !s[k] }));

  const isAreaActive = (id) => filter.areaId === id && !filter.projectId && !filter.frontId;
  const isProjectActive = (id) => filter.projectId === id && !filter.frontId;
  const isFrontActive = (id) => filter.frontId === id;

  return (
    <aside className="w-56 shrink-0 space-y-2 overflow-y-auto rounded-xl border border-line bg-surface p-2">
      <button
        onClick={clearFilter}
        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs font-medium ${
          !filter.areaId && !filter.projectId && !filter.frontId
            ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
        }`}
      >
        <span>Todas as tarefas</span>
        {(filter.areaId || filter.projectId || filter.frontId) && <X className="h-3 w-3" />}
      </button>
      {areas.map((a) => {
        const projectsForA = projects.filter((p) => p.area_id === a.id);
        const areaOpen = !!open[`a:${a.id}`];
        return (
          <div key={a.id}>
            <div className="flex items-center">
              <button onClick={() => toggle(`a:${a.id}`)} className="p-0.5 text-ink2 hover:text-ink">
                {areaOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
              <button
                onClick={() => setFilter({ areaId: a.id, projectId: null, frontId: null })}
                className={`ml-0.5 flex-1 truncate rounded-md px-1.5 py-1 text-left text-[11px] ${
                  isAreaActive(a.id) ? 'bg-accent text-white' : 'text-ink hover:bg-surface2'
                }`}
              >
                <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: a.color || '#6366f1' }} />
                {a.name}
              </button>
            </div>
            {areaOpen && projectsForA.map((p) => {
              const frontsForP = fronts.filter((f) => f.project_id === p.id);
              const projOpen = !!open[`p:${p.id}`];
              return (
                <div key={p.id} className="ml-3">
                  <div className="flex items-center">
                    <button onClick={() => toggle(`p:${p.id}`)} className="p-0.5 text-ink2 hover:text-ink">
                      {projOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => setFilter({ areaId: a.id, projectId: p.id, frontId: null })}
                      className={`ml-0.5 flex-1 truncate rounded-md px-1.5 py-1 text-left text-[11px] ${
                        isProjectActive(p.id) ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                      }`}
                    >
                      {p.name}
                    </button>
                  </div>
                  {projOpen && frontsForP.map((f) => (
                    <div key={f.id} className="ml-5">
                      <button
                        onClick={() => setFilter({ areaId: a.id, projectId: p.id, frontId: f.id })}
                        className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] ${
                          isFrontActive(f.id) ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                        }`}
                      >
                        {f.name}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </aside>
  );
}
