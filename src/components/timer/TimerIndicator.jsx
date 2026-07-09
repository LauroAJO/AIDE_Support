import { useEffect, useRef, useState } from 'react';
import { Play, Square, Loader2 } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { formatHMS } from '../../lib/time';

// Lives in the sidebar; always mounted, so it owns the 1s tick that keeps
// store.elapsedSeconds in sync for every component reading the timer.
export default function TimerIndicator({ variant = 'sidebar' }) {
  const isHeader = variant === 'header';
  const activeEntry = useStore((s) => s.activeEntry);
  const elapsedSeconds = useStore((s) => s.elapsedSeconds);
  const setActiveEntry = useStore((s) => s.setActiveEntry);
  const setElapsedSeconds = useStore((s) => s.setElapsedSeconds);

  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    apiFetch('/api/timer/active').then(setActiveEntry).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeEntry) {
      setElapsedSeconds(0);
      return undefined;
    }
    const tick = () =>
      setElapsedSeconds(Math.max(0, Math.floor(Date.now() / 1000) - activeEntry.started_at));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntry]);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const togglePicker = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      try {
        const all = await apiFetch('/api/tasks');
        setTasks(
          all
            .filter((t) => t.status === 'todo' || t.status === 'doing')
            .sort((a, b) => b.score - a.score)
        );
      } catch {
        setTasks([]);
      }
    }
  };

  const start = async (taskId) => {
    setBusy(true);
    setErr('');
    setOpen(false);
    try {
      const entry = await apiFetch('/api/timer/start', {
        method: 'POST',
        body: JSON.stringify({ task_id: taskId }),
      });
      setActiveEntry(entry);
    } catch (e) {
      setErr(String((e && e.message) || 'Falha ao iniciar o timer').slice(0, 120));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/timer/stop', { method: 'POST' });
      setActiveEntry(null);
    } catch (e) {
      setErr(String((e && e.message) || 'Falha ao parar o timer').slice(0, 120));
    } finally {
      setBusy(false);
    }
  };

  if (activeEntry) {
    const title = activeEntry.task_title || 'Sem tarefa';
    const short = title.length > 20 ? `${title.slice(0, 20)}…` : title;
    return (
      <div
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${isHeader ? '' : 'mb-2'}`}
        style={{ background: 'rgba(99,102,241,0.10)' }}
      >
        <button
          onClick={stop}
          disabled={busy}
          className="text-accent"
          title={err || 'Parar timer'}
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" fill="currentColor" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-sm font-medium text-accent">{formatHMS(elapsedSeconds)}</div>
          <div className="truncate text-[10px] text-ink2">{short}</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={`relative ${isHeader ? '' : 'mb-2'}`}>
      <button
        onClick={togglePicker}
        className={`flex items-center gap-2 rounded-lg bg-surface2 px-3 py-1.5 font-mono text-sm text-ink2 transition hover:text-ink ${
          isHeader ? '' : 'w-full py-2'
        }`}
        title="Iniciar timer"
      >
        <Play className="h-3.5 w-3.5" />
        00:00:00
      </button>
      {open && (
        <div
          className={`absolute left-0 z-20 max-h-64 overflow-y-auto rounded-lg border border-line bg-surface shadow-soft ${
            isHeader ? 'top-full mt-1 w-56' : 'bottom-full mb-1 w-full'
          }`}
        >
          {tasks.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted">Nenhuma tarefa ativa</p>
          ) : (
            tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => start(t.id)}
                className="block w-full truncate px-3 py-2 text-left text-xs text-ink hover:bg-surface2"
              >
                {t.title}
              </button>
            ))
          )}
        </div>
      )}
      {err && <p className="mt-1 text-[10px] text-danger">{err}</p>}
    </div>
  );
}
