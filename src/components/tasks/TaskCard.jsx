import { useState } from 'react';
import { AlertTriangle, Star, ChevronRight, ChevronDown, Briefcase, Repeat } from 'lucide-react';
import AvatarStack from '../shared/AvatarStack';
import { useStore } from '../../store';
import {
  scoreColor,
  STATUS_LABELS,
  STATUS_COLORS,
  formatDate,
  isOverdue,
  needsDate,
  recurrenceSummary,
  taskAssignees,
} from '../../lib/tasks';

// v2.25.20 — fundo esmaecido com a cor da área. A cor chega em task.areaColor
// (TASK_SELECT já faz o JOIN tasks → projects → areas). Só aceita hex de 6
// dígitos: o seletor de cor da AreasPage sempre gera esse formato, e qualquer
// outra coisa (vazio, nome CSS, hex já com alfa) viraria cor inválida ao
// concatenar o alfa. Sem área — ou cor fora do formato — o card mantém bg-surface.
const AREA_TINT_ALPHA = '1F'; // 12%
function areaFadedBg(hexColor) {
  if (!hexColor || !/^#[0-9a-f]{6}$/i.test(hexColor)) return undefined;
  return hexColor + AREA_TINT_ALPHA;
}

export default function TaskCard({ task, selected, onClick, onToggleFavorite, onToggleSubtask }) {
  const overdue = isOverdue(task.due_date);
  const warn = needsDate(task);
  const fav = !!task.favorited;
  const subs = task.subtasks || [];
  // v2.25.19 — principal + co-responsáveis numa pilha só.
  const assignees = taskAssignees(task);
  const [expanded, setExpanded] = useState(false);
  // Etapa 6 — nome da oportunidade vinculada, resolvido a partir do store.
  const opportunityTitle = useStore((s) =>
    task.opportunity_id ? (s.careerOpportunities.find((o) => o.id === task.opportunity_id)?.title || null) : null,
  );

  return (
    // role=button (not a real <button>) so the favorite <button> can nest validly.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        borderLeftWidth: 4,
        borderLeftColor: scoreColor(task.score),
        backgroundColor: areaFadedBg(task.areaColor),
      }}
      className={`w-full cursor-pointer rounded-lg border bg-surface p-3 text-left transition hover:-translate-y-px hover:shadow-soft ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-line'
      }`}
    >
      {(task.areaName || task.projectName || task.frontName) && (
        <div className="mb-1 truncate text-[10px] uppercase tracking-wide text-muted">
          {[task.areaName, task.projectName, task.frontName].filter(Boolean).join(' › ')}
        </div>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-ink">
          {task.title}
          {task.source === 'lifegame' && (
            <span
              className="ml-1.5 inline-block rounded-full bg-accent/10 px-1.5 py-0.5 align-middle text-[9px] font-medium text-accent"
              title="Importada do Lifegame"
            >
              LG
            </span>
          )}
          {!!task.is_recurring && (
            <Repeat
              className="ml-1.5 inline-block h-3.5 w-3.5 align-middle text-accent"
              title={`Recorrente · ${recurrenceSummary(task)}`}
            />
          )}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(task);
              }}
              title={fav ? 'Remover dos favoritos' : 'Favoritar'}
              className="rounded p-0.5 transition hover:bg-surface2"
            >
              <Star
                className="h-4 w-4"
                style={{ color: fav ? '#F59E0B' : '#9E9890', fill: fav ? '#F59E0B' : 'none' }}
              />
            </button>
          )}
          <span
            className="rounded-md px-1.5 py-0.5 text-xs font-bold text-white"
            style={{ background: scoreColor(task.score) }}
          >
            {task.score}
          </span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-ink2">
          U: {task.urgency}
        </span>
        <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-medium text-ink2">
          I: {task.importance}
        </span>
        <span
          className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ background: STATUS_COLORS[task.status] }}
        >
          {STATUS_LABELS[task.status]}
        </span>
        {task.due_date && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              overdue ? 'text-white' : 'bg-surface2 text-ink2'
            }`}
            style={overdue ? { background: '#EF4444' } : undefined}
          >
            {formatDate(task.due_date)}
          </span>
        )}
        {warn && <AlertTriangle className="h-3.5 w-3.5" style={{ color: '#F59E0B' }} />}
      </div>

      {opportunityTitle && (
        <div className="mt-2 flex items-center gap-1 truncate text-[11px] font-medium text-accent" title={`Carreira: ${opportunityTitle}`}>
          <Briefcase className="h-3 w-3 shrink-0" />
          <span className="truncate">→ {opportunityTitle}</span>
        </div>
      )}

      {assignees.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <AvatarStack users={assignees} size={18} max={3} />
          <span className="text-[11px] text-ink2">
            {assignees[0].name}
            {assignees.length > 1 && ` +${assignees.length - 1}`}
          </span>
        </div>
      )}

      {subs.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="flex items-center gap-1 text-[11px] font-medium text-ink2 hover:text-ink"
          >
            {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {subs.length} subtarefa{subs.length > 1 ? 's' : ''}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-1">
              {subs.map((s) => (
                <li key={s.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!s.done}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      e.stopPropagation();
                      onToggleSubtask?.(task, s.id);
                    }}
                    className="accent-[#6366f1]"
                  />
                  <span className={`flex-1 ${s.done ? 'text-muted line-through' : 'text-ink'}`}>{s.text}</span>
                  {/* Subtarefa-linha pode ter responsável próprio (v2.25.19) */}
                  {s.assignedUser && <AvatarStack users={[s.assignedUser]} size={14} max={1} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
