import { useEffect, useState, Fragment } from 'react';
import {
  Square,
  Play,
  Trash2,
  Check,
  Clock,
  ChevronDown,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import {
  formatHMS,
  formatDuration,
  formatEuro,
  formatDateTime,
  formatTimeShort,
} from '../../lib/time';
import LoadingSpinner from '../shared/LoadingSpinner';

const WEEKDAYS = [
  [1, 'Seg'],
  [2, 'Ter'],
  [3, 'Qua'],
  [4, 'Qui'],
  [5, 'Sex'],
  [6, 'Sáb'],
  [7, 'Dom'],
];

const FILTERS = [
  ['all', 'Todas'],
  ['paid', 'Pagas'],
  ['pending', 'Pendentes'],
];

export default function TimerPage() {
  const activeEntry = useStore((s) => s.activeEntry);
  const elapsedSeconds = useStore((s) => s.elapsedSeconds);
  const setActiveEntry = useStore((s) => s.setActiveEntry);
  const timeEntries = useStore((s) => s.timeEntries);
  const setTimeEntries = useStore((s) => s.setTimeEntries);
  const availability = useStore((s) => s.availability);
  const setAvailability = useStore((s) => s.setAvailability);

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pickTask, setPickTask] = useState('');
  const [showAvail, setShowAvail] = useState(false);
  const [availForm, setAvailForm] = useState(null);
  const [savingAvail, setSavingAvail] = useState(false);
  const [editingRate, setEditingRate] = useState(null); // { id, value }
  const [editingNotes, setEditingNotes] = useState(null); // { id, value }

  const loadEntries = async () => {
    const e = await apiFetch('/api/timer/entries');
    setTimeEntries(e);
  };

  const loadAll = async () => {
    try {
      const [e, a, t, active] = await Promise.all([
        apiFetch('/api/timer/entries'),
        apiFetch('/api/availability'),
        apiFetch('/api/tasks'),
        apiFetch('/api/timer/active'),
      ]);
      setTimeEntries(e);
      setAvailability(a);
      setAvailForm(a);
      setTasks(t.filter((x) => x.status === 'todo' || x.status === 'doing').sort((x, y) => y.score - x.score));
      setActiveEntry(active);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setBusy(true);
    setErr('');
    try {
      const entry = await apiFetch('/api/timer/start', {
        method: 'POST',
        body: JSON.stringify({ task_id: pickTask || null }),
      });
      setActiveEntry(entry);
      await loadEntries();
    } catch (e) {
      setErr(String((e && e.message) || 'Falha ao iniciar o timer').slice(0, 160));
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
      await loadEntries();
    } catch (e) {
      setErr(String((e && e.message) || 'Falha ao parar o timer').slice(0, 160));
    } finally {
      setBusy(false);
    }
  };

  const updateEntry = async (id, patch) => {
    const updated = await apiFetch(`/api/timer/entries/${id}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    });
    setTimeEntries(timeEntries.map((e) => (e.id === id ? updated : e)));
  };

  const deleteEntry = async (id) => {
    if (!window.confirm('Excluir este registro?')) return;
    await apiFetch(`/api/timer/entries/${id}`, { method: 'DELETE' });
    setTimeEntries(timeEntries.filter((e) => e.id !== id));
  };

  const saveAvailability = async () => {
    setSavingAvail(true);
    try {
      const saved = await apiFetch('/api/availability', {
        method: 'PUT',
        body: JSON.stringify(availForm),
      });
      setAvailability(saved);
      setAvailForm(saved);
    } finally {
      setSavingAvail(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full">
        <LoadingSpinner label="Carregando timer..." />
      </div>
    );
  }

  const durationOf = (e) =>
    e.duration_seconds != null ? e.duration_seconds : e.ended_at ? 0 : elapsedSeconds;
  const totalOf = (e) => (durationOf(e) / 3600) * (e.hourly_rate || 0);

  const completed = timeEntries.filter((e) => e.ended_at);
  const visible = timeEntries.filter((e) => {
    if (filter === 'paid') return e.paid;
    if (filter === 'pending') return e.ended_at && !e.paid;
    return true;
  });

  const totalSeconds = completed.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);
  const toReceive = completed.filter((e) => !e.paid).reduce((s, e) => s + totalOf(e), 0);
  const received = completed.filter((e) => e.paid).reduce((s, e) => s + totalOf(e), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-ink">Timer</h1>

      {err && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {err}
        </div>
      )}

      {/* Section 1 — active timer */}
      <section className="rounded-xl border border-line bg-surface p-5">
        {activeEntry ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-ink2">{activeEntry.task_title || 'Sem tarefa'}</p>
            <p className="font-mono text-4xl font-bold text-accent">{formatHMS(elapsedSeconds)}</p>
            <p className="text-xs text-muted">Início às {formatTimeShort(activeEntry.started_at)}</p>
            <button
              onClick={stop}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              <Square className="h-4 w-4" fill="currentColor" /> Parar
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-muted">Nenhum timer ativo</p>
            <div className="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
              <select
                value={pickTask}
                onChange={(e) => setPickTask(e.target.value)}
                className="input flex-1"
              >
                <option value="">Sem tarefa específica</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button
                onClick={start}
                disabled={busy}
                className="flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
              >
                <Play className="h-4 w-4" /> Iniciar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Section 2 — entries table */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-ink">Registros</h2>
          <div className="flex gap-1">
            {FILTERS.map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  filter === value ? 'bg-accent text-white' : 'bg-surface2 text-ink2 hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="py-2 pr-2 font-medium">Tarefa</th>
                <th className="py-2 pr-2 font-medium">Início</th>
                <th className="py-2 pr-2 font-medium">Fim</th>
                <th className="py-2 pr-2 font-medium">Duração</th>
                <th className="py-2 pr-2 font-medium">Taxa/h</th>
                <th className="py-2 pr-2 font-medium">Total</th>
                <th className="py-2 pr-2 font-medium">Pago</th>
                <th className="py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-muted">
                    Nenhum registro.
                  </td>
                </tr>
              ) : (
                visible.map((e) => (
                  <Fragment key={e.id}>
                    <tr className="border-b border-line/60 text-ink">
                      <td className="py-2 pr-2">{e.task_title || '—'}</td>
                      <td className="py-2 pr-2 text-ink2">{formatDateTime(e.started_at)}</td>
                      <td className="py-2 pr-2 text-ink2">
                        {e.ended_at ? formatDateTime(e.ended_at) : 'em andamento'}
                      </td>
                      <td className="py-2 pr-2">{formatDuration(durationOf(e))}</td>
                      <td className="py-2 pr-2">
                        {editingRate?.id === e.id ? (
                          <input
                            autoFocus
                            type="number"
                            min="0"
                            step="0.5"
                            value={editingRate.value}
                            onChange={(ev) => setEditingRate({ id: e.id, value: ev.target.value })}
                            onBlur={() => {
                              updateEntry(e.id, { hourly_rate: Number(editingRate.value) || 0 });
                              setEditingRate(null);
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter') ev.currentTarget.blur();
                            }}
                            className="w-16 rounded border border-line bg-surface2 px-1 py-0.5"
                          />
                        ) : (
                          <button
                            onClick={() => setEditingRate({ id: e.id, value: e.hourly_rate })}
                            className="rounded px-1 hover:bg-surface2"
                          >
                            {formatEuro(e.hourly_rate)}
                          </button>
                        )}
                      </td>
                      <td className="py-2 pr-2 font-medium">{formatEuro(totalOf(e))}</td>
                      <td className="py-2 pr-2">
                        <button
                          onClick={() => updateEntry(e.id, { paid: !e.paid })}
                          title={e.paid ? 'Pago' : 'Pendente'}
                        >
                          {e.paid ? (
                            <Check className="h-4 w-4" style={{ color: '#22C55E' }} />
                          ) : (
                            <Clock className="h-4 w-4" style={{ color: '#F59E0B' }} />
                          )}
                        </button>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={() =>
                              setEditingNotes(
                                editingNotes?.id === e.id ? null : { id: e.id, value: e.notes || '' }
                              )
                            }
                            className="text-ink2 hover:text-ink"
                            title="Notas"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deleteEntry(e.id)}
                            className="text-ink2 hover:text-danger"
                            title="Excluir"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {editingNotes?.id === e.id && (
                      <tr className="border-b border-line/60">
                        <td colSpan={8} className="py-2">
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              value={editingNotes.value}
                              onChange={(ev) => setEditingNotes({ id: e.id, value: ev.target.value })}
                              placeholder="Notas do registro"
                              className="input flex-1"
                            />
                            <button
                              onClick={() => {
                                updateEntry(e.id, { notes: editingNotes.value });
                                setEditingNotes(null);
                              }}
                              className="rounded-lg bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
                            >
                              Salvar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
            {completed.length > 0 && (
              <tfoot>
                <tr className="border-t border-line font-medium text-ink">
                  <td className="py-2 pr-2" colSpan={3}>
                    Totais
                  </td>
                  <td className="py-2 pr-2">{formatDuration(totalSeconds)}</td>
                  <td className="py-2 pr-2" />
                  <td className="py-2 pr-2" />
                  <td className="py-2 pr-2" colSpan={2}>
                    <span className="text-[#F59E0B]">A receber {formatEuro(toReceive)}</span>
                    {' · '}
                    <span style={{ color: '#22C55E' }}>Recebido {formatEuro(received)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      {/* Section 3 — availability */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <button
          onClick={() => setShowAvail((v) => !v)}
          className="flex w-full items-center justify-between text-base font-bold text-ink"
        >
          Disponibilidade
          {showAvail ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showAvail && availForm && (
          <div className="mt-4 space-y-4">
            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Dias de trabalho</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map(([num, label]) => {
                  const on = availForm.work_days.includes(num);
                  return (
                    <button
                      key={num}
                      onClick={() =>
                        setAvailForm({
                          ...availForm,
                          work_days: on
                            ? availForm.work_days.filter((d) => d !== num)
                            : [...availForm.work_days, num].sort((a, b) => a - b),
                        })
                      }
                      className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                        on ? 'bg-accent text-white' : 'bg-surface2 text-ink2'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TimeField label="Início" value={availForm.work_start} onChange={(v) => setAvailForm({ ...availForm, work_start: v })} />
              <TimeField label="Fim" value={availForm.work_end} onChange={(v) => setAvailForm({ ...availForm, work_end: v })} />
              <TimeField label="Almoço (início)" value={availForm.lunch_start} onChange={(v) => setAvailForm({ ...availForm, lunch_start: v })} />
              <TimeField label="Almoço (fim)" value={availForm.lunch_end} onChange={(v) => setAvailForm({ ...availForm, lunch_end: v })} />
            </div>

            <label className="block max-w-[200px]">
              <span className="mb-1 block text-xs font-medium text-ink2">Taxa padrão (€/h)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={availForm.hourly_rate}
                onChange={(e) => setAvailForm({ ...availForm, hourly_rate: Number(e.target.value) || 0 })}
                className="input"
              />
            </label>

            <button
              onClick={saveAvailability}
              disabled={savingAvail}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {savingAvail ? 'Salvando...' : 'Salvar disponibilidade'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function TimeField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}
