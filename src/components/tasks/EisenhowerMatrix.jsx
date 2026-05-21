import { useState } from 'react';
import { calcScore, scoreColor } from '../../lib/tasks';

// 2x2 matrix. X = urgency (0→10 left→right), Y = importance (0→10 bottom→top).
export default function EisenhowerMatrix({ tasks, selectedTask, onSelect }) {
  const [hover, setHover] = useState(null); // { task, left, top }

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 text-xs font-medium text-ink2">Matriz de Eisenhower</div>

      <div className="flex">
        {/* Y axis label + ticks */}
        <div className="mr-1 flex flex-col items-center justify-between py-1 text-[10px] text-muted">
          <span>10</span>
          <span className="rotate-180 [writing-mode:vertical-rl] font-medium text-ink2">↑ Importância</span>
          <span>0</span>
        </div>

        <div className="flex-1">
          <div className="relative aspect-square w-full">
            {/* Quadrant backgrounds + labels */}
            <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 overflow-hidden rounded-lg">
              <div style={{ background: 'rgba(99,102,241,0.05)' }} className="flex items-start justify-start p-2">
                <span className="text-[10px] text-muted">Agendar</span>
              </div>
              <div style={{ background: 'rgba(239,68,68,0.05)' }} className="flex items-start justify-end p-2">
                <span className="text-[10px] text-muted">Fazer Agora</span>
              </div>
              <div style={{ background: 'rgba(158,158,158,0.05)' }} className="flex items-end justify-start p-2">
                <span className="text-[10px] text-muted">Eliminar</span>
              </div>
              <div style={{ background: 'rgba(245,158,11,0.05)' }} className="flex items-end justify-end p-2">
                <span className="text-[10px] text-muted">Delegar</span>
              </div>
            </div>

            {/* Center grid lines */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-line" />
            </div>

            {/* Dots */}
            {tasks.map((t) => {
              const score = t.score ?? calcScore(t.urgency, t.importance);
              const left = (t.urgency / 10) * 100;
              const top = 100 - (t.importance / 10) * 100;
              const isSel = selectedTask?.id === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  onMouseEnter={() => setHover({ task: t, left, top, score })}
                  onMouseLeave={() => setHover(null)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-150"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <span
                    className="block rounded-full"
                    style={{
                      width: 12,
                      height: 12,
                      background: scoreColor(score),
                      outline: isSel ? '2px solid #6366f1' : '1px solid #FFFFFF',
                      outlineOffset: isSel ? 2 : 0,
                    }}
                  />
                </button>
              );
            })}

            {/* Tooltip */}
            {hover && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-ink px-2 py-1 text-[10px] text-white shadow-soft"
                style={{ left: `${hover.left}%`, top: `calc(${hover.top}% - 8px)` }}
              >
                {hover.task.title} · {hover.score}
              </div>
            )}
          </div>

          {/* X axis ticks + label */}
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
            <span>0</span>
            <span className="font-medium text-ink2">Urgência →</span>
            <span>10</span>
          </div>
        </div>
      </div>
    </div>
  );
}
