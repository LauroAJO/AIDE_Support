import { useEffect, useMemo, useRef, useState } from 'react';
import { Video, Play, Pause, RotateCcw, ArrowRight, Square, Bell } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { canDo } from '../../lib/can';
import { getTodayStr, scoreColor } from '../../lib/tasks';
import { formatHMS, formatDuration } from '../../lib/time';
import Avatar from '../shared/Avatar';
import TaskModal from '../tasks/TaskModal';

const MEET_URL = 'https://meet.google.com/xbo-mcvw-reh';
const MEET_LABEL = 'meet.google.com/xbo-mcvw-reh';
const MEETING_TASK_TITLE = 'Reunião AIDE';

// Plays a short beep via WebAudio. No assets needed; bails out silently if the
// browser blocks audio without a user gesture.
function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.7);
    osc.start();
    osc.stop(ctx.currentTime + 0.75);
    setTimeout(() => ctx.close && ctx.close(), 900);
  } catch {
    /* ignore — audio is a nice-to-have */
  }
}

// Textarea that auto-saves to localStorage with a 1s debounce.
function AutosaveTextarea({ storageKey, placeholder, rows = 6 }) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(storageKey) || '';
    } catch {
      return '';
    }
  });
  const timerRef = useRef(null);

  useEffect(() => {
    try {
      setValue(localStorage.getItem(storageKey) || '');
    } catch {
      setValue('');
    }
  }, [storageKey]);

  const onChange = (e) => {
    const next = e.target.value;
    setValue(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try { localStorage.setItem(storageKey, next); } catch { /* ignore */ }
    }, 1000);
  };

  useEffect(() => () => timerRef.current && clearTimeout(timerRef.current), []);

  return (
    <textarea
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
    />
  );
}

// Local agenda countdown (independent of the meeting timer).
function AgendaCountdown() {
  const [minutes, setMinutes] = useState(5);
  const [seconds, setSeconds] = useState(0);
  const [remaining, setRemaining] = useState(0); // seconds
  const [running, setRunning] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(id);
          setRunning(false);
          setExpired(true);
          playBeep();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const start = () => {
    setExpired(false);
    if (remaining > 0) {
      setRunning(true);
      return;
    }
    const total = Math.max(0, Number(minutes) || 0) * 60 + Math.max(0, Number(seconds) || 0);
    if (total <= 0) return;
    setRemaining(total);
    setRunning(true);
  };
  const pause = () => setRunning(false);
  const reset = () => {
    setRunning(false);
    setRemaining(0);
    setExpired(false);
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
        <Bell className="h-4 w-4 text-accent" />
        Cronômetro de pauta
      </div>
      <div
        className="font-mono text-[40px] font-bold leading-none text-ink"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {formatHMS(remaining)}
      </div>

      {expired && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
          Tempo esgotado!
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <label className="flex items-center gap-1 text-xs text-ink2">
          <input
            type="number"
            min="0"
            max="180"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
          />
          min
        </label>
        <label className="flex items-center gap-1 text-xs text-ink2">
          <input
            type="number"
            min="0"
            max="59"
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            className="w-16 rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink focus:border-accent focus:outline-none"
          />
          seg
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!running ? (
          <button
            type="button"
            onClick={start}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: '#22C55E' }}
          >
            <Play className="h-4 w-4" /> Iniciar
          </button>
        ) : (
          <button
            type="button"
            onClick={pause}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: '#F59E0B' }}
          >
            <Pause className="h-4 w-4" /> Pausar
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1.5 rounded-lg border border-line bg-surface2 px-3 py-1.5 text-sm font-medium text-ink2 hover:text-ink"
        >
          <RotateCcw className="h-4 w-4" /> Resetar
        </button>
      </div>
    </div>
  );
}

export default function MeetingPage() {
  const tasks = useStore((s) => s.tasks);
  const userGranular = useStore((s) => s.userGranular);
  const setTasks = useStore((s) => s.setTasks);
  const setProjects = useStore((s) => s.setProjects);
  const setUsers = useStore((s) => s.setUsers);
  const selectedTask = useStore((s) => s.selectedTask);
  const setSelectedTask = useStore((s) => s.setSelectedTask);
  const activeEntry = useStore((s) => s.activeEntry);
  const elapsedSeconds = useStore((s) => s.elapsedSeconds);
  const setActiveEntry = useStore((s) => s.setActiveEntry);

  const today = getTodayStr();
  const agendaKey = `aide-meeting-agenda-${today}`;
  const notesKey = `aide-meeting-notes-${today}`;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The meeting is in progress whenever the user's active timer is on the
  // shared "Reunião AIDE" task. We rely on the global TimerIndicator to keep
  // activeEntry + elapsedSeconds in sync.
  const inMeeting = !!(activeEntry && activeEntry.task_title === MEETING_TASK_TITLE);

  // Initial sync — pull the server's authoritative meeting status so a page
  // refresh mid-meeting doesn't show "Iniciar".
  useEffect(() => {
    apiFetch('/api/meeting/status')
      .then((s) => {
        if (s && s.inMeeting) {
          // Hand off to TimerIndicator's load path.
          return apiFetch('/api/timer/active').then((entry) => entry && setActiveEntry(entry));
        }
        return null;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load tasks if the store is empty.
  useEffect(() => {
    if (tasks.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const [t, p, u] = await Promise.all([
          apiFetch('/api/tasks'),
          apiFetch('/api/projects'),
          apiFetch('/api/users'),
        ]);
        if (cancelled) return;
        setTasks(t);
        setProjects(p);
        setUsers(u);
      } catch {
        /* silent */
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const topTasks = useMemo(() => {
    return [...tasks]
      .filter((t) => t.status !== 'done')
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 5);
  }, [tasks]);

  const reloadAll = async () => {
    try {
      const [t, p, u] = await Promise.all([
        apiFetch('/api/tasks'),
        apiFetch('/api/projects'),
        apiFetch('/api/users'),
      ]);
      setTasks(t);
      setProjects(p);
      setUsers(u);
    } catch { /* no-op */ }
  };

  const persistTask = async (task, patch) => {
    const next = { ...task, ...patch };
    setTasks(tasks.map((t) => (t.id === task.id ? next : t)));
    if (selectedTask?.id === task.id) setSelectedTask(next);
    try {
      await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        body: JSON.stringify(patch),
      });
    } catch {
      reloadAll();
    }
  };
  const handleDelete = async (id) => {
    if (selectedTask?.id === id) setSelectedTask(null);
    reloadAll();
  };

  const openMeet = () => window.open(MEET_URL, '_blank', 'noopener,noreferrer');

  const startMeeting = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await apiFetch('/api/meeting/start', { method: 'POST' });
      if (res && res.entry) setActiveEntry(res.entry);
      else {
        const entry = await apiFetch('/api/timer/active');
        setActiveEntry(entry);
      }
    } catch (e) {
      setError(String((e && e.message) || e) || 'Falha ao iniciar reunião.');
    } finally {
      setBusy(false);
    }
  };

  const stopMeeting = async () => {
    const ok = window.confirm(
      `Encerrar reunião? ${formatDuration(elapsedSeconds)} serão registrados para Alice.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      await apiFetch('/api/meeting/stop', { method: 'POST' });
      setActiveEntry(null);
    } catch (e) {
      setError(String((e && e.message) || e) || 'Falha ao encerrar reunião.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6">
      {/* Section 1 — Meeting link */}
      <section className="rounded-2xl border border-line bg-surface p-6 text-center shadow-soft">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">Reunião AIDE</h1>
        <p className="mt-1 text-sm text-ink2">
          Link permanente — entre a qualquer momento
        </p>
        <button
          type="button"
          onClick={openMeet}
          className="mx-auto mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-6 py-4 text-base font-semibold text-white transition hover:bg-accent-hover sm:w-auto"
        >
          <Video className="h-5 w-5" />
          Entrar na Reunião
        </button>
        <button
          type="button"
          onClick={openMeet}
          className="mt-3 text-xs text-muted underline-offset-2 hover:text-ink2 hover:underline"
        >
          {MEET_LABEL}
        </button>
      </section>

      {/* Section 2 — Agenda/Notes + Meeting controls + Countdown */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">
              Pauta de hoje
            </label>
            <AutosaveTextarea
              storageKey={agendaKey}
              placeholder="O que será discutido hoje..."
              rows={5}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">
              Notas da reunião
            </label>
            <AutosaveTextarea
              storageKey={notesKey}
              placeholder="Anotações durante a reunião..."
              rows={8}
            />
          </div>
          <p className="text-[11px] text-muted">Salvo automaticamente por data</p>
        </div>

        <div className="space-y-4">
          {/* Global meeting timer (mirrors the header/sidebar timer) */}
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
            <p className="text-xs font-medium text-ink2">
              {inMeeting ? 'Reunião em andamento' : 'Reunião não iniciada'}
            </p>
            <div
              className="mt-1 font-mono text-[36px] font-bold leading-none text-ink sm:text-[40px]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {inMeeting ? formatHMS(elapsedSeconds) : '00:00:00'}
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Usa o timer global — registra para pagamento
            </p>
            {error && (
              <p className="mt-2 text-xs text-danger">{error}</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {canDo(userGranular, 'meeting', 'start_stop') && (!inMeeting ? (
                <button
                  type="button"
                  onClick={startMeeting}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: '#22C55E' }}
                >
                  <Play className="h-4 w-4" /> Iniciar Reunião
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopMeeting}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: '#EF4444' }}
                >
                  <Square className="h-4 w-4" /> Encerrar Reunião
                </button>
              ))}
            </div>
          </div>

          {/* Independent agenda countdown */}
          <AgendaCountdown />
        </div>
      </section>

      {/* Section 3 — Tasks to discuss */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-ink">Tarefas para discutir</h2>
          <a
            href="/tasks"
            className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            Ver todas as tarefas
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>

        {topTasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            Nenhuma tarefa pendente
          </p>
        ) : (
          <ul className="space-y-2">
            {topTasks.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedTask(t)}
                  style={{ borderLeftWidth: 4, borderLeftColor: scoreColor(t.score) }}
                  className="flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition hover:-translate-y-px hover:shadow-soft"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                    {t.title}
                  </span>
                  <span
                    className="shrink-0 rounded-md px-1.5 py-0.5 text-xs font-bold text-white"
                    style={{ background: scoreColor(t.score) }}
                  >
                    {t.score}
                  </span>
                  {t.assignedUser && (
                    <Avatar user={t.assignedUser} size={24} />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selectedTask && (
        <TaskModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onEdit={() => setSelectedTask(null)}
          onPersist={persistTask}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
