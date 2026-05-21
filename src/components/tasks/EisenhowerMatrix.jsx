import { useMemo, useState } from 'react';
import { calcScore, scoreColor } from '../../lib/tasks';

// Splits tasks into the 4 quadrants (threshold 5), sorts each by score DESC,
// and positions dots vertically by rank (highest score topmost in its band).
function computeLayout(tasks) {
  const quads = { q1: [], q2: [], q3: [], q4: [] };
  for (const t of tasks) {
    const i = t.importance;
    const u = t.urgency;
    const key = i >= 5 ? (u >= 5 ? 'q1' : 'q2') : (u >= 5 ? 'q3' : 'q4');
    quads[key].push(t);
  }
  const placed = [];
  for (const key of Object.keys(quads)) {
    const arr = quads[key].slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const bandTop = key === 'q1' || key === 'q2' ? 0 : 50;
    arr.forEach((t, idx) => {
      placed.push({
        task: t,
        left: (t.urgency / 10) * 100,
        top: bandTop + ((idx + 1) / (arr.length + 1)) * 50,
        score: t.score ?? calcScore(t.urgency, t.importance),
        rank: idx + 1,
      });
    });
  }
  return placed;
}

export default function EisenhowerMatrix({ tasks, selectedTask, onSelect }) {
  const [hover, setHover] = useState(null);
  const placed = useMemo(() => computeLayout(tasks), [tasks]);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 text-xs font-medium text-ink2">Matriz de Eisenhower</div>

      <div className="flex">
        <div className="mr-1 flex flex-col items-center justify-between py-1 text-[10px] text-muted">
          <span>10</span>
          <span className="rotate-180 [writing-mode:vertical-rl] font-medium text-ink2">↑ Importância</span>
          <span>0</span>
        </div>

        <div className="flex-1">
          <div className="relative aspect-square w-full">
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

            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-1/2 top-0 h-full w-px bg-line" />
              <div className="absolute left-0 top-1/2 h-px w-full bg-line" />
            </div>

            {placed.map((d) => {
              const isSel = selectedTask?.id === d.task.id;
              const isHover = hover?.task.id === d.task.id;
              return (
                <button
                  key={d.task.id}
                  type="button"
                  onClick={() => onSelect(d.task)}
                  onMouseEnter={() => setHover(d)}
                  onMouseLeave={() => setHover(null)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-150"
                  style={{ left: `${d.left}%`, top: `${d.top}%` }}
                >
                  <span
                    className="block rounded-full"
                    style={{
                      width: 12,
                      height: 12,
                      background: scoreColor(d.score),
                      outline: isSel ? '2px solid #6366f1' : '1px solid #FFFFFF',
                      outlineOffset: isSel ? 2 : 0,
                    }}
                  />
                  {isHover && (
                    <span className="absolute -right-3 -top-1 text-[9px] font-bold text-ink">{d.rank}</span>
                  )}
                </button>
              );
            })}

            {hover && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-line bg-ink px-2 py-1 text-[10px] text-white shadow-soft"
                style={{ left: `${hover.left}%`, top: `calc(${hover.top}% - 8px)` }}
              >
                #{hover.rank} · {hover.task.title} · {hover.score}
              </div>
            )}
          </div>

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
