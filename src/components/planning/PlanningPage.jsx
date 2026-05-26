import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Plus, X, ArrowUp, ArrowDown, Search, Target } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { mondayOf, weekDays, addDaysISO, formatDateBR, weekdayLabel, isTodayISO, toISODate } from '../../lib/week';
import { formatDuration } from '../../lib/time';
import { STATUS_COLORS, STATUS_LABELS } from '../../lib/tasks';
import LoadingSpinner from '../shared/LoadingSpinner';

const STRATEGIC_FIELDS = [
  ['short_term', '🎯 Curto prazo (esta semana)'],
  ['tactical', '📋 Tático (próximas 4 semanas)'],
  ['strategic', '🏔 Estratégico (próximos 3 meses)'],
];

export default function PlanningPage() {
  const weekPlan = useStore((s) => s.weekPlan);
  const setWeekPlan = useStore((s) => s.setWeekPlan);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const monthPlan = useStore((s) => s.monthPlan);
  const setMonthPlan = useStore((s) => s.setMonthPlan);
  const navigate = useNavigate();

  const [refDate, setRefDate] = useState(() => toISODate(new Date()));
  const [tasks, setTasks] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState('');
  const [review, setReview] = useState('');
  const [addFor, setAddFor] = useState(null); // dayIso or null
  const [search, setSearch] = useState('');
  const [strategic, setStrategic] = useState({ short_term: '', tactical: '', strategic: '' });
  const [stratOpen, setStratOpen] = useState(false);
  const [weekBlocks, setWeekBlocks] = useState([]);
  const [monthGoal, setMonthGoal] = useState('');
  const [keyResults, setKeyResults] = useState([]);
  const [krInput, setKrInput] = useState('');

  const setAreas = useStore((s) => s.setAreas);
  const setProjects = useStore((s) => s.setProjects);

  const load = async (dateIso) => {
    setLoading(true);
    try {
      const [plan, t, e, a, p] = await Promise.all([
        apiFetch(`/api/planning/week?date=${dateIso}`),
        apiFetch('/api/tasks'),
        apiFetch('/api/timer/entries'),
        apiFetch('/api/areas').catch(() => []),
        apiFetch('/api/projects').catch(() => []),
      ]);
      setWeekPlan(plan);
      setGoal(plan.weekly_goal || '');
      setReview(plan.weekly_review || '');
      setStrategic({
        short_term: plan.short_term || '',
        tactical: plan.tactical || '',
        strategic: plan.strategic || '',
      });
      setTasks(t);
      setEntries(e);
      setAreas(a || []);
      setProjects(p || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(refDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refDate]);

  const loadStrategic = async () => {
    try {
      const base = weekPlan?.week_start || mondayOf(refDate);
      const mp = await apiFetch(`/api/planning/month?date=${base}`);
      setMonthPlan(mp);
      setMonthGoal(mp.strategic_goal || '');
      setKeyResults(mp.key_results || []);
      const starts = [0, 1, 2, 3].map((i) => addDaysISO(base, i * 7));
      const plans = await Promise.all(starts.map((ws) => apiFetch(`/api/planning/week?date=${ws}`)));
      setWeekBlocks(
        plans.map((p, i) => {
          const ids = new Set();
          Object.values(p.day_plans || {}).forEach((arr) => (arr || []).forEach((id) => ids.add(id)));
          return {
            weekStart: starts[i],
            range: `${formatDateBR(starts[i]).slice(0, 5)}–${formatDateBR(addDaysISO(starts[i], 6)).slice(0, 5)}`,
            count: ids.size,
            isCurrent: i === 0,
          };
        })
      );
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (stratOpen) loadStrategic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratOpen, weekPlan?.week_start]);

  const saveMonth = async (patch) => {
    if (!monthPlan) return;
    const updated = await apiFetch(`/api/planning/month/${monthPlan.id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setMonthPlan(updated);
  };

  const addKeyResult = () => {
    const v = krInput.trim();
    if (!v || keyResults.length >= 5) return;
    const next = [...keyResults, v];
    setKeyResults(next);
    setKrInput('');
    saveMonth({ key_results: next });
  };
  const removeKeyResult = (idx) => {
    const next = keyResults.filter((_, i) => i !== idx);
    setKeyResults(next);
    saveMonth({ key_results: next });
  };

  const tasksById = useMemo(() => {
    const m = {};
    tasks.forEach((t) => {
      m[t.id] = t;
    });
    return m;
  }, [tasks]);

  const allAreas = useStore((s) => s.areas);
  const allProjects = useStore((s) => s.projects);

  const breadcrumbForTask = (task) => {
    if (!task) return '';
    const parts = [];
    if (task.areaName) parts.push(task.areaName);
    if (task.projectName) parts.push(task.projectName);
    return parts.join(' › ');
  };

  // Tasks grouped by Area > Project for the day picker.
  const tasksGrouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredTasks = tasks
      .filter((t) => t.status !== 'done')
      .filter((t) => !q || t.title.toLowerCase().includes(q));

    const byArea = new Map(); // areaId|'__none__' → { name, projects: Map(projId → { name, tasks }) }
    for (const t of filteredTasks) {
      const aKey = t.area_id || '__none__';
      const aName = t.areaName || (t.area_id ? 'Área' : 'Sem área');
      if (!byArea.has(aKey)) byArea.set(aKey, { name: aName, projects: new Map() });
      const aGroup = byArea.get(aKey);
      const pKey = t.project_id || '__none__';
      const pName = t.projectName || (t.project_id ? 'Projeto' : 'Sem projeto');
      if (!aGroup.projects.has(pKey)) aGroup.projects.set(pKey, { name: pName, tasks: [] });
      aGroup.projects.get(pKey).tasks.push(t);
    }
    return byArea;
  }, [tasks, search]);

  if (loading || !weekPlan) {
    return (
      <div className="h-full">
        <LoadingSpinner label="Carregando planejamento..." />
      </div>
    );
  }

  const weekStart = weekPlan.week_start;
  const days = weekDays(weekStart);
  const dayPlans = weekPlan.day_plans || {};

  const savePlan = async (patch) => {
    const updated = await apiFetch(`/api/planning/week/${weekPlan.id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setWeekPlan(updated);
  };

  const setDay = (dayIso, ids) => {
    const nextDayPlans = { ...dayPlans, [dayIso]: ids };
    setWeekPlan({ ...weekPlan, day_plans: nextDayPlans });
    savePlan({ day_plans: nextDayPlans });
  };

  const addToDay = (dayIso, taskId) => {
    const current = dayPlans[dayIso] || [];
    if (current.includes(taskId)) return;
    setDay(dayIso, [...current, taskId]);
  };
  const removeFromDay = (dayIso, taskId) => {
    setDay(dayIso, (dayPlans[dayIso] || []).filter((id) => id !== taskId));
  };
  const move = (dayIso, idx, dir) => {
    const arr = [...(dayPlans[dayIso] || [])];
    const j = idx + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[idx], arr[j]] = [arr[j], arr[idx]];
    setDay(dayIso, arr);
  };

  const openTask = (task) => {
    setSelectedTask(task);
    navigate('/tasks');
  };

  // Week stats
  const plannedIds = new Set();
  days.forEach((d) => (dayPlans[d] || []).forEach((id) => plannedIds.add(id)));
  const plannedTasks = [...plannedIds].map((id) => tasksById[id]).filter(Boolean);
  const completedCount = plannedTasks.filter((t) => t.status === 'done').length;

  const weekStartTs = new Date(`${weekStart}T00:00:00`).getTime() / 1000;
  const weekEndTs = weekStartTs + 7 * 24 * 3600;
  const hoursTrackedSeconds = entries
    .filter((e) => e.started_at >= weekStartTs && e.started_at < weekEndTs)
    .reduce((sum, e) => sum + (e.duration_seconds || 0), 0);

  const rangeLabel = `${formatDateBR(weekStart)} a ${formatDateBR(addDaysISO(weekStart, 6))}`;

  return (
    <div className="space-y-4">
      {/* Week navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">Planejamento</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRefDate(addDaysISO(weekStart, -7))}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink2 hover:bg-surface2"
          >
            <ChevronLeft className="h-4 w-4" /> Anterior
          </button>
          <span className="text-sm font-medium text-ink">Semana de {rangeLabel}</span>
          <button
            onClick={() => setRefDate(addDaysISO(weekStart, 7))}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink2 hover:bg-surface2"
          >
            Próxima <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setRefDate(toISODate(new Date()))}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Strategic 4-week view (collapsible) */}
      <div className="rounded-xl border border-line bg-surface">
        <button
          onClick={() => setStratOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-ink"
        >
          <span className="flex items-center gap-2">
            <Target className="h-4 w-4 text-accent" />
            Visão Estratégica — 4 Semanas
          </span>
          <ChevronDown className={`h-4 w-4 transition ${stratOpen ? 'rotate-180' : ''}`} />
        </button>

        {stratOpen && (
          <div className="space-y-4 border-t border-line px-4 py-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {weekBlocks.map((b) => (
                <div
                  key={b.weekStart}
                  className={`rounded-lg border p-3 text-center ${
                    b.isCurrent ? 'border-transparent bg-accent text-white' : 'border-line bg-base text-ink'
                  }`}
                >
                  <div className="text-xs font-medium">{b.range}</div>
                  <div className="mt-1 text-lg font-bold">{b.count}</div>
                  <div className={`text-[10px] ${b.isCurrent ? 'text-white/80' : 'text-muted'}`}>tarefas</div>
                </div>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Meta Estratégica do Mês</span>
              <textarea
                rows={2}
                value={monthGoal}
                onChange={(e) => setMonthGoal(e.target.value)}
                onBlur={() => monthGoal !== (monthPlan?.strategic_goal || '') && saveMonth({ strategic_goal: monthGoal })}
                className="input resize-y"
              />
            </label>

            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Resultados-chave (até 5)</p>
              <ul className="space-y-1">
                {keyResults.map((kr, idx) => (
                  <li key={idx} className="flex items-center gap-2 rounded-lg bg-surface2 px-2 py-1.5 text-sm text-ink">
                    <span className="flex-1">{kr}</span>
                    <button onClick={() => removeKeyResult(idx)} className="text-muted hover:text-danger">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              {keyResults.length < 5 && (
                <div className="mt-1.5 flex gap-2">
                  <input
                    value={krInput}
                    onChange={(e) => setKrInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyResult())}
                    placeholder="Adicionar resultado-chave"
                    className="input flex-1"
                  />
                  <button onClick={addKeyResult} className="btn-icon">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Left — daily plan */}
        <div className="lg:w-[65%]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {days.map((dayIso) => {
              const ids = dayPlans[dayIso] || [];
              return (
                <div
                  key={dayIso}
                  className={`rounded-xl border bg-surface p-3 ${
                    isTodayISO(dayIso) ? 'border-accent' : 'border-line'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-ink">{weekdayLabel(dayIso)}</span>
                    {isTodayISO(dayIso) && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
                        Hoje
                      </span>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {ids.length === 0 && <p className="text-[11px] text-muted">Sem tarefas</p>}
                    {ids.map((id, idx) => {
                      const task = tasksById[id];
                      if (!task) return null;
                      const crumb = breadcrumbForTask(task);
                      return (
                        <div
                          key={id}
                          className="group rounded-lg border border-line bg-base px-2 py-1.5"
                        >
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: STATUS_COLORS[task.status] }}
                              title={STATUS_LABELS[task.status]}
                            />
                            <button
                              onClick={() => openTask(task)}
                              className="min-w-0 flex-1 truncate text-left text-xs text-ink hover:text-accent"
                            >
                              {task.title}
                            </button>
                            <div className="flex shrink-0 items-center opacity-0 transition group-hover:opacity-100">
                              <button onClick={() => move(dayIso, idx, -1)} className="text-muted hover:text-ink">
                                <ArrowUp className="h-3 w-3" />
                              </button>
                              <button onClick={() => move(dayIso, idx, 1)} className="text-muted hover:text-ink">
                                <ArrowDown className="h-3 w-3" />
                              </button>
                              <button onClick={() => removeFromDay(dayIso, id)} className="text-muted hover:text-danger">
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                          {crumb && (
                            <div className="mt-0.5 truncate pl-3.5 text-[10px] text-muted">{crumb}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => {
                      setSearch('');
                      setAddFor(dayIso);
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1 text-[11px] text-ink2 hover:bg-surface2"
                  >
                    <Plus className="h-3 w-3" /> Adicionar tarefa
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right — week overview */}
        <div className="space-y-4 lg:w-[35%]">
          <div className="rounded-xl border border-line bg-surface p-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Meta da semana</span>
              <textarea
                rows={2}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                onBlur={() => goal !== weekPlan.weekly_goal && savePlan({ weekly_goal: goal })}
                className="input resize-y"
              />
            </label>
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-ink2">Revisão semanal</span>
              <textarea
                rows={3}
                value={review}
                onChange={(e) => setReview(e.target.value)}
                onBlur={() => review !== weekPlan.weekly_review && savePlan({ weekly_review: review })}
                className="input resize-y"
              />
            </label>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-2 text-xs font-medium text-ink2">Resumo da semana</p>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Planejadas" value={plannedTasks.length} />
              <Stat label="Concluídas" value={completedCount} />
              <Stat label="Horas" value={formatDuration(hoursTrackedSeconds)} />
            </dl>
          </div>

          <HoursByAreaPanel
            entries={entries}
            tasksById={tasksById}
            weekStartTs={weekStartTs}
            weekEndTs={weekEndTs}
          />


          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-2 text-xs font-medium text-ink2">Níveis estratégicos</p>
            <div className="space-y-3">
              {STRATEGIC_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs text-ink">{label}</span>
                  <textarea
                    rows={2}
                    value={strategic[key] || ''}
                    onChange={(e) => setStrategic({ ...strategic, [key]: e.target.value })}
                    onBlur={() => {
                      if ((strategic[key] || '') !== (weekPlan[key] || '')) {
                        savePlan({ [key]: strategic[key] });
                      }
                    }}
                    className="input resize-y"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add task modal */}
      {addFor && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setAddFor(null)}
        >
          <div
            className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-line bg-surface shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold text-ink">Adicionar a {weekdayLabel(addFor)}</h2>
              <button onClick={() => setAddFor(null)} className="text-ink2 hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-line p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar tarefa..."
                  className="input pl-8"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {tasksGrouped.size === 0 ? (
                <p className="p-3 text-center text-xs text-muted">Nenhuma tarefa.</p>
              ) : (
                Array.from(tasksGrouped.entries()).map(([areaKey, areaGroup]) => (
                  <div key={areaKey} className="mb-2">
                    <div className="px-1 py-1 text-[10px] font-semibold uppercase text-muted">
                      Área: {areaGroup.name}
                    </div>
                    {Array.from(areaGroup.projects.entries()).map(([projKey, projGroup]) => (
                      <div key={projKey} className="mb-1">
                        {projGroup.name !== 'Sem projeto' && (
                          <div className="ml-2 px-1 py-0.5 text-[10px] text-ink2">
                            Projeto: <span className="font-medium">{projGroup.name}</span>
                          </div>
                        )}
                        {projGroup.tasks.map((t) => {
                          const already = (dayPlans[addFor] || []).includes(t.id);
                          return (
                            <button
                              key={t.id}
                              disabled={already}
                              onClick={() => {
                                addToDay(addFor, t.id);
                                setAddFor(null);
                              }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-surface2 disabled:opacity-40"
                            >
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ background: STATUS_COLORS[t.status] }}
                              />
                              <span className="truncate">{t.title}</span>
                              {already && <span className="ml-auto text-[10px] text-muted">já adicionada</span>}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-surface2 px-2 py-2">
      <dt className="text-[10px] text-muted">{label}</dt>
      <dd className="text-sm font-bold text-ink">{value}</dd>
    </div>
  );
}

function HoursByAreaPanel({ entries, tasksById, weekStartTs, weekEndTs }) {
  const byArea = useMemo(() => {
    const m = new Map();
    for (const e of entries) {
      if (e.started_at < weekStartTs || e.started_at >= weekEndTs) continue;
      const task = e.task_id ? tasksById[e.task_id] : null;
      const areaKey = task?.area_id || '__none__';
      const name = task?.areaName || 'Sem área';
      if (!m.has(areaKey)) m.set(areaKey, { name, color: task?.areaColor || '#9E9890', seconds: 0 });
      m.get(areaKey).seconds += e.duration_seconds || 0;
    }
    return Array.from(m.values()).sort((a, b) => b.seconds - a.seconds);
  }, [entries, tasksById, weekStartTs, weekEndTs]);

  const totalSec = byArea.reduce((s, a) => s + a.seconds, 0);

  if (byArea.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-2 text-xs font-medium text-ink2">Horas por Área</p>
      <ul className="space-y-1.5">
        {byArea.map((a, i) => {
          const pct = totalSec > 0 ? (a.seconds / totalSec) * 100 : 0;
          return (
            <li key={i}>
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: a.color || '#9E9890' }} />
                  {a.name}
                </span>
                <span className="text-ink2">{formatDuration(a.seconds)}</span>
              </div>
              <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: a.color || '#9E9890' }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
