import { calcScore, scoreColor } from '../../lib/tasks';

// 2x2 matrix. X = urgency (0→10 left→right), Y = importance (0→10 bottom→top).
// Each task is a dot at (urgency, importance), colored by score.
export default function EisenhowerMatrix({ tasks, selectedTask, onSelect }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between text-xs font-medium text-ink2">
        <span>Importância ↑</span>
        <span>Matriz de Eisenhower</span>
      </div>

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
          const left = `${(t.urgency / 10) * 100}%`;
          const top = `${100 - (t.importance / 10) * 100}%`;
          const isSel = selectedTask?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t)}
              title={`${t.title} • Score ${score}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-150"
              style={{ left, top }}
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
      </div>

      <div className="mt-1 text-right text-xs font-medium text-ink2">Urgência →</div>
    </div>
  );
}
