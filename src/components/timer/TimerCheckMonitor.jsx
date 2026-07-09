import { useEffect, useRef, useState } from 'react';
import { Clock, X } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { formatDuration } from '../../lib/time';

const BUCKET_SECONDS = 30 * 60; // every 30 minutes

// Mounts once in Layout. Watches the global timer and pops a check-in modal
// when the active entry crosses a 30/60/90/... minute boundary. Kept separate
// from TimerIndicator so the desktop double-mount (header + sidebar) doesn't
// fire the check twice.
export default function TimerCheckMonitor() {
  const activeEntry = useStore((s) => s.activeEntry);
  const elapsedSeconds = useStore((s) => s.elapsedSeconds);
  const setActiveEntry = useStore((s) => s.setActiveEntry);
  const open = useStore((s) => s.timerCheckPopup);
  const setOpen = useStore((s) => s.setTimerCheckPopup);
  const [tasks, setTasks] = useState([]);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const lastBucket = useRef(0);

  // Reset the bucket whenever the active entry changes (or stops). Without
  // this, restarting a timer would skip the first 30-minute check.
  useEffect(() => {
    lastBucket.current = 0;
    setPicker(false);
  }, [activeEntry?.id]);

  useEffect(() => {
    if (!activeEntry) return;
    const bucket = Math.floor(elapsedSeconds / BUCKET_SECONDS);
    if (bucket >= 1 && bucket > lastBucket.current) {
      lastBucket.current = bucket;
      setOpen(true);
    }
  }, [elapsedSeconds, activeEntry, setOpen]);

  if (!open || !activeEntry) return null;

  const close = () => {
    setOpen(false);
    setPicker(false);
  };

  const stopTimer = async () => {
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/timer/stop', { method: 'POST' });
      setActiveEntry(null);
      close();
    } catch (e) {
      setErr(String((e && e.message) || 'Falha ao parar o timer').slice(0, 160));
    } finally {
      setBusy(false);
    }
  };

  const openPicker = async () => {
    setBusy(true);
    setErr('');
    try {
      await apiFetch('/api/timer/stop', { method: 'POST' });
      setActiveEntry(null);
      const all = await apiFetch('/api/tasks');
      setTasks(
        (all || [])
          .filter((t) => t.status === 'todo' || t.status === 'doing')
          .sort((a, b) => (b.score || 0) - (a.score || 0))
      );
      setPicker(true);
    } catch (e) {
      setErr(String((e && e.message) || 'Falha ao trocar de tarefa').slice(0, 160));
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (taskId) => {
    setBusy(true);
    setErr('');
    try {
      const entry = await apiFetch('/api/timer/start', {
        method: 'POST',
        body: JSON.stringify({ task_id: taskId }),
      });
      setActiveEntry(entry);
      close();
    } catch (e) {
      setErr(String((e && e.message) || 'Falha ao iniciar o timer').slice(0, 160));
    } finally {
      setBusy(false);
    }
  };

  const title = activeEntry.task_title || 'Sem tarefa';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-accent" />
            <h2 className="text-base font-bold text-ink">
              Ainda está trabalhando em &ldquo;{title}&rdquo;?
            </h2>
          </div>
          <button onClick={close} className="rounded-md p-1 text-ink2 hover:bg-surface2">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-ink2">
          O timer está rodando há {formatDuration(elapsedSeconds)}.
        </p>

        {err && (
          <p className="mt-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {err}
          </p>
        )}

        {picker ? (
          <div className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-line">
            {tasks.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted">Nenhuma tarefa ativa</p>
            ) : (
              tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => switchTo(t.id)}
                  disabled={busy}
                  className="block w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-surface2 disabled:opacity-60"
                >
                  {t.title}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <button
              onClick={close}
              disabled={busy}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
            >
              Sim, continuar
            </button>
            <button
              onClick={stopTimer}
              disabled={busy}
              className="rounded-lg border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
            >
              Não, parar timer
            </button>
            <button
              onClick={openPicker}
              disabled={busy}
              className="rounded-lg border border-line px-4 py-2 text-sm text-ink2 hover:bg-surface2 disabled:opacity-60"
            >
              Trocar tarefa
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
