// v2.26.1 — barra de filtros de tarefas, redesenhada.
//
// Porquê: a barra antiga era uma fileira de chips sempre visíveis (Status +
// Responsável + "Tarefas de carreira" + "Recorrentes"), sobrecarregada
// visualmente, e o filtro de Responsável era binário — 'me'|'other' — o que
// com 3 utilizadores (Lauro/Alice/Milene) colapsava Alice e Milene num único
// balde "outro". Substituído por uma barra compacta com dropdowns, seguindo
// o mesmo padrão click-outside já usado no menu de Exportar desta página.
//
// Nota de âmbito (desvio do spec original): o dropdown "Área" reutiliza o
// filtro de árvore já existente (taskTreeFilter, populado também pela
// sidebar), em vez de introduzir um segundo mecanismo de filtro de área
// independente com checkboxes multi-seleção. Ter dois filtros de área a
// operar em paralelo (sidebar vs. dropdown) criaria estados divergentes
// difíceis de explicar ao utilizador; um único filtro de área, acessível de
// dois lugares, é mais simples e não perde funcionalidade. Ver relatório do
// Bloco 1 para detalhe.

import { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown, X, Briefcase, Repeat, Star, CalendarDays, CalendarX } from 'lucide-react';
import { useStore, selectAllTaskTags } from '../../store';

const STATUS_OPTIONS = [
  ['all', 'Todas'],
  ['favorites', '⭐ Favoritas'],
  ['backlog', 'Backlog'],
  ['todo', 'A Fazer'],
  ['doing', 'Fazendo'],
  ['done', 'Concluídas'],
];

function useClickOutside(onOutside) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        if (onOutside) onOutside();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return [ref, open, setOpen];
}

function DropdownButton({ label, icon: Icon, active, children }) {
  const [ref, open, setOpen] = useClickOutside();
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
          active
            ? 'border-accent bg-accent/10 text-accent'
            : 'border-line text-ink2 hover:bg-surface2'
        }`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
        <ChevronDown className={`h-3 w-3 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-30 w-64 rounded-lg border border-line bg-surface p-3 shadow-soft">
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-ink hover:bg-surface2">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 accent-accent" />
      {label}
    </label>
  );
}

function Radio({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs text-ink hover:bg-surface2">
      <input type="radio" checked={checked} onChange={onChange} className="h-3.5 w-3.5 accent-accent" />
      {label}
    </label>
  );
}

export default function TaskFiltersBar() {
  const taskFilter = useStore((s) => s.taskFilter);
  const setTaskFilter = useStore((s) => s.setTaskFilter);
  const users = useStore((s) => s.users);
  const areas = useStore((s) => s.areas);
  const treeFilter = useStore((s) => s.taskTreeFilter);
  const setTaskTreeFilter = useStore((s) => s.setTaskTreeFilter);
  const clearTaskTreeFilter = useStore((s) => s.clearTaskTreeFilter);
  const allTags = useStore(selectAllTaskTags);
  const [tagSearch, setTagSearch] = useState('');

  const statusLabel = STATUS_OPTIONS.find(([v]) => v === taskFilter.status)?.[1] || 'Status';
  const assigneeUser = users.find((u) => u.id === taskFilter.assignedTo);
  const assigneeLabel =
    taskFilter.assignedTo === 'all' ? 'Responsável'
      : taskFilter.assignedTo === 'unassigned' ? 'Sem responsável'
        : (assigneeUser ? assigneeUser.name.split(' ')[0] : 'Responsável');
  const selectedArea = treeFilter.areaId ? areas.find((a) => a.id === treeFilter.areaId) : null;
  const areaLabel = selectedArea ? selectedArea.name : 'Área';
  const tagsLabel = taskFilter.tags.length ? `Tags (${taskFilter.tags.length})` : 'Tags';

  const moreCount = [
    taskFilter.onlyFavorited, taskFilter.onlyRecurring, taskFilter.onlyCareer,
    taskFilter.dateFilter !== 'all', taskFilter.minUrgency > 0, taskFilter.minImportance > 0,
  ].filter(Boolean).length;
  const moreLabel = moreCount ? `Mais filtros (${moreCount})` : 'Mais filtros';

  const toggleTag = (tag) => {
    const next = taskFilter.tags.includes(tag)
      ? taskFilter.tags.filter((t) => t !== tag)
      : [...taskFilter.tags, tag];
    setTaskFilter({ tags: next });
  };

  const visibleTags = tagSearch
    ? allTags.filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase()))
    : allTags;

  const clearAll = () => {
    setTaskFilter({
      assignedTo: 'all', tags: [], onlyFavorited: false, onlyRecurring: false,
      onlyCareer: false, dateFilter: 'all', minUrgency: 0, minImportance: 0,
    });
    clearTaskTreeFilter();
  };

  const activeChips = [];
  if (taskFilter.assignedTo !== 'all') {
    activeChips.push({
      key: 'assignee', label: `👤 ${assigneeLabel}`,
      onRemove: () => setTaskFilter({ assignedTo: 'all' }),
    });
  }
  if (selectedArea) {
    activeChips.push({ key: 'area', label: `📁 ${selectedArea.name}`, onRemove: clearTaskTreeFilter });
  }
  taskFilter.tags.forEach((tag) => {
    activeChips.push({ key: `tag-${tag}`, label: `🏷 ${tag}`, onRemove: () => toggleTag(tag) });
  });
  if (taskFilter.onlyFavorited) {
    activeChips.push({ key: 'fav', label: '⭐ Favoritas', onRemove: () => setTaskFilter({ onlyFavorited: false }) });
  }
  if (taskFilter.onlyRecurring) {
    activeChips.push({ key: 'rec', label: '🔁 Recorrentes', onRemove: () => setTaskFilter({ onlyRecurring: false }) });
  }
  if (taskFilter.onlyCareer) {
    activeChips.push({ key: 'career', label: '💼 Carreira', onRemove: () => setTaskFilter({ onlyCareer: false }) });
  }
  if (taskFilter.dateFilter !== 'all') {
    activeChips.push({
      key: 'date',
      label: taskFilter.dateFilter === 'withDate' ? '📅 Só com data' : '🚫 Só sem data',
      onRemove: () => setTaskFilter({ dateFilter: 'all' }),
    });
  }
  if (taskFilter.minUrgency > 0) {
    activeChips.push({ key: 'urg', label: `⚡ Urgência ≥ ${taskFilter.minUrgency}`, onRemove: () => setTaskFilter({ minUrgency: 0 }) });
  }
  if (taskFilter.minImportance > 0) {
    activeChips.push({ key: 'imp', label: `🎯 Importância ≥ ${taskFilter.minImportance}`, onRemove: () => setTaskFilter({ minImportance: 0 }) });
  }

  return (
    <div className="mt-3">
      {/* Top row — compact, always visible */}
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[160px] flex-1 sm:flex-none sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={taskFilter.search}
            onChange={(e) => setTaskFilter({ search: e.target.value })}
            placeholder="Buscar por título..."
            className="input pl-8"
          />
        </div>

        <DropdownButton label={statusLabel} active={taskFilter.status !== 'all'}>
          {({ close }) => (
            <div className="space-y-0.5">
              {STATUS_OPTIONS.map(([value, opLabel]) => (
                <Radio
                  key={value}
                  checked={taskFilter.status === value}
                  onChange={() => { setTaskFilter({ status: value }); close(); }}
                  label={opLabel}
                />
              ))}
            </div>
          )}
        </DropdownButton>

        <DropdownButton label={assigneeLabel} active={taskFilter.assignedTo !== 'all'}>
          {({ close }) => (
            <div className="space-y-0.5">
              <Radio
                checked={taskFilter.assignedTo === 'all'}
                onChange={() => { setTaskFilter({ assignedTo: 'all' }); close(); }}
                label="Todos"
              />
              {users.map((u) => (
                <Radio
                  key={u.id}
                  checked={taskFilter.assignedTo === u.id}
                  onChange={() => { setTaskFilter({ assignedTo: u.id }); close(); }}
                  label={u.name}
                />
              ))}
              <Radio
                checked={taskFilter.assignedTo === 'unassigned'}
                onChange={() => { setTaskFilter({ assignedTo: 'unassigned' }); close(); }}
                label="Sem responsável"
              />
            </div>
          )}
        </DropdownButton>

        <DropdownButton label={areaLabel} active={!!selectedArea}>
          {({ close }) => (
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              <Radio
                checked={!treeFilter.areaId}
                onChange={() => { clearTaskTreeFilter(); close(); }}
                label="Todas as áreas"
              />
              {areas.map((a) => (
                <Radio
                  key={a.id}
                  checked={treeFilter.areaId === a.id}
                  onChange={() => {
                    setTaskTreeFilter({ areaId: a.id, projectId: null, frontId: null });
                    close();
                  }}
                  label={a.name}
                />
              ))}
            </div>
          )}
        </DropdownButton>

        <DropdownButton label={tagsLabel} active={taskFilter.tags.length > 0}>
          <div>
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="Buscar tag..."
              className="input mb-2 py-1 text-xs"
            />
            <div className="max-h-48 space-y-0.5 overflow-y-auto">
              {visibleTags.length === 0 && (
                <p className="px-1.5 py-1 text-xs text-muted">Nenhuma tag encontrada.</p>
              )}
              {visibleTags.map((tag) => (
                <Checkbox key={tag} checked={taskFilter.tags.includes(tag)} onChange={() => toggleTag(tag)} label={tag} />
              ))}
            </div>
            {taskFilter.tags.length > 0 && (
              <button
                type="button"
                onClick={() => setTaskFilter({ tags: [] })}
                className="mt-2 text-[11px] font-medium text-accent hover:underline"
              >
                Limpar tags
              </button>
            )}
          </div>
        </DropdownButton>

        <DropdownButton label={moreLabel} active={moreCount > 0}>
          <div className="space-y-2.5">
            <div className="space-y-0.5">
              <Checkbox
                checked={taskFilter.onlyFavorited}
                onChange={() => setTaskFilter({ onlyFavorited: !taskFilter.onlyFavorited })}
                label={<span className="flex items-center gap-1"><Star className="h-3 w-3" /> Só favoritas</span>}
              />
              <Checkbox
                checked={taskFilter.onlyRecurring}
                onChange={() => setTaskFilter({ onlyRecurring: !taskFilter.onlyRecurring })}
                label={<span className="flex items-center gap-1"><Repeat className="h-3 w-3" /> Só recorrentes</span>}
              />
              <Checkbox
                checked={taskFilter.onlyCareer}
                onChange={() => setTaskFilter({ onlyCareer: !taskFilter.onlyCareer })}
                label={<span className="flex items-center gap-1"><Briefcase className="h-3 w-3" /> Tarefas de carreira</span>}
              />
            </div>
            <div className="space-y-0.5 border-t border-line pt-2">
              <Radio
                checked={taskFilter.dateFilter === 'all'}
                onChange={() => setTaskFilter({ dateFilter: 'all' })}
                label="Todas (com ou sem data)"
              />
              <Radio
                checked={taskFilter.dateFilter === 'withDate'}
                onChange={() => setTaskFilter({ dateFilter: 'withDate' })}
                label={<span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Só com data</span>}
              />
              <Radio
                checked={taskFilter.dateFilter === 'withoutDate'}
                onChange={() => setTaskFilter({ dateFilter: 'withoutDate' })}
                label={<span className="flex items-center gap-1"><CalendarX className="h-3 w-3" /> Só sem data</span>}
              />
            </div>
            <div className="space-y-1.5 border-t border-line pt-2">
              <label className="flex items-center justify-between text-[11px] font-medium text-ink2">
                Urgência mínima
                <span className="text-ink">{taskFilter.minUrgency || '—'}</span>
              </label>
              <input
                type="range" min={0} max={10} step={1}
                value={taskFilter.minUrgency}
                onChange={(e) => setTaskFilter({ minUrgency: Number(e.target.value) })}
                className="w-full accent-accent"
              />
              <label className="flex items-center justify-between text-[11px] font-medium text-ink2">
                Importância mínima
                <span className="text-ink">{taskFilter.minImportance || '—'}</span>
              </label>
              <input
                type="range" min={0} max={10} step={1}
                value={taskFilter.minImportance}
                onChange={(e) => setTaskFilter({ minImportance: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
            <button
              type="button"
              onClick={() => setTaskFilter({
                onlyFavorited: false, onlyRecurring: false, onlyCareer: false,
                dateFilter: 'all', minUrgency: 0, minImportance: 0,
              })}
              className="text-[11px] font-medium text-accent hover:underline"
            >
              Limpar mais filtros
            </button>
          </div>
        </DropdownButton>
      </div>

      {/* Active filter chips */}
      {activeChips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className="flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/25"
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11px] font-medium text-muted hover:text-ink hover:underline"
          >
            Limpar tudo
          </button>
        </div>
      )}
    </div>
  );
}
