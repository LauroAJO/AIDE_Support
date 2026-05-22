import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { toISODate } from '../../lib/week';
import {
  monthLabel,
  monthGrid,
  weekGrid,
  WEEKDAY_HEADERS,
  eventDayKey,
  eventTime,
  startHour,
  durationHours,
  isSameDate,
} from '../../lib/calendar';
import ScopeBanner, { isAuthScopeError } from '../shared/ScopeBanner';
import EventEditor from './EventEditor';

const CAL_STORAGE_KEY = 'aide_selected_calendars';

// Events synced from AIDE tasks carry this description prefix (see worker
// syncTaskToCalendar). Used to show a small "AIDE" badge in the calendar.
const isAideTask = (ev) => (ev?.description || '').startsWith('Tarefa AIDE:');

function AideBadge() {
  return (
    <span
      className="shrink-0 rounded px-1 text-[8px] font-bold uppercase leading-tight text-white"
      style={{ background: '#6366f1' }}
    >
      AIDE
    </span>
  );
}
const HOUR_PX = 44;

export default function CalendarPage() {
  const calendarEvents = useStore((s) => s.calendarEvents);
  const setCalendarEvents = useStore((s) => s.setCalendarEvents);
  const calendarView = useStore((s) => s.calendarView);
  const setCalendarView = useStore((s) => s.setCalendarView);
  const calendarDate = useStore((s) => s.calendarDate);
  const setCalendarDate = useStore((s) => s.setCalendarDate);

  const date = useMemo(() => new Date(calendarDate), [calendarDate]);
  const [calendars, setCalendars] = useState([]);
  const [selectedCalIds, setSelectedCalIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CAL_STORAGE_KEY) || 'null');
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [scopeError, setScopeError] = useState(false);
  const [selectedDay, setSelectedDay] = useState(toISODate(new Date()));
  const [editor, setEditor] = useState(undefined); // undefined=closed, {date} new, event=edit
  const [syncing, setSyncing] = useState(false);

  // Calendar list (once).
  useEffect(() => {
    apiFetch('/api/calendar/list')
      .then((list) => {
        setCalendars(list);
        setSelectedCalIds((prev) => {
          if (prev) return prev;
          const all = list.map((c) => c.id);
          localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(all));
          return all;
        });
      })
      .catch((err) => {
        if (isAuthScopeError(err)) setScopeError(true);
      });
  }, []);

  const range = useMemo(() => {
    const cells = calendarView === 'month' ? monthGrid(date) : weekGrid(date);
    const start = cells[0];
    const end = new Date(cells[cells.length - 1]);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [date, calendarView]);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const cals = selectedCalIds && selectedCalIds.length ? selectedCalIds.join(',') : 'primary';
      const events = await apiFetch(
        `/api/calendar/events?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(
          range.end
        )}&calendars=${encodeURIComponent(cals)}`
      );
      setCalendarEvents(events);
      setScopeError(false);
    } catch (err) {
      if (isAuthScopeError(err)) setScopeError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCalIds === null) return; // wait until we know which calendars
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, selectedCalIds]);

  const grouped = useMemo(() => {
    const g = {};
    for (const ev of calendarEvents) {
      const key = eventDayKey(ev);
      if (!key) continue;
      (g[key] = g[key] || []).push(ev);
    }
    return g;
  }, [calendarEvents]);

  const navigate = (dir) => {
    const d = new Date(date);
    if (calendarView === 'month') d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCalendarDate(d.toISOString());
  };
  const goToday = () => setCalendarDate(new Date().toISOString());

  const toggleCalendar = (id) => {
    const base = selectedCalIds || [];
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    setSelectedCalIds(next);
    localStorage.setItem(CAL_STORAGE_KEY, JSON.stringify(next));
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await apiFetch('/api/calendar/sync');
      await loadEvents();
    } catch (err) {
      if (isAuthScopeError(err)) setScopeError(true);
    } finally {
      setSyncing(false);
    }
  };

  const onSaved = () => {
    setEditor(undefined);
    loadEvents();
  };
  const onDeleted = () => {
    setEditor(undefined);
    loadEvents();
  };

  return (
    <div className="space-y-4">
      {scopeError && (
        <ScopeBanner message="Para usar o Calendário, autorize o acesso ao Google Calendar." />
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold capitalize text-ink">{monthLabel(date)}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={goToday} className="rounded-lg border border-line px-3 py-1.5 text-sm text-ink2 hover:bg-surface2">
              Hoje
            </button>
            <button onClick={() => navigate(1)} className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-line">
            {[['month', 'Mês'], ['week', 'Semana']].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setCalendarView(v)}
                className={`px-3 py-1.5 text-sm font-medium transition ${
                  calendarView === v ? 'bg-accent text-white' : 'bg-surface text-ink2 hover:bg-surface2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button onClick={sync} className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2" title="Sincronizar">
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setEditor({ date: selectedDay })}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            <Plus className="h-4 w-4" /> Novo Evento
          </button>
        </div>
      </div>

      {/* Calendar selector chips */}
      {calendars.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {calendars.map((c) => {
            const on = (selectedCalIds || []).includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCalendar(c.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  on ? 'border-transparent text-white' : 'border-line text-ink2'
                }`}
                style={on ? { background: c.backgroundColor || '#6366f1' } : undefined}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: on ? '#fff' : c.backgroundColor || '#6366f1' }}
                />
                {c.summary}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          {calendarView === 'month' ? (
            <MonthView
              date={date}
              grouped={grouped}
              selectedDay={selectedDay}
              onSelectDay={setSelectedDay}
            />
          ) : (
            <WeekView date={date} events={calendarEvents} onSelectEvent={(ev) => setEditor(ev)} />
          )}
          {loading && <p className="mt-2 text-center text-xs text-muted">Carregando eventos...</p>}
        </div>

        {/* Day side panel (month view) */}
        {calendarView === 'month' && (
          <div className="lg:w-72">
            <div className="rounded-xl border border-line bg-surface p-4">
              <h3 className="mb-2 text-sm font-bold text-ink">{selectedDay.split('-').reverse().join('/')}</h3>
              <div className="space-y-1.5">
                {(grouped[selectedDay] || []).length === 0 ? (
                  <p className="text-xs text-muted">Sem eventos.</p>
                ) : (
                  (grouped[selectedDay] || [])
                    .slice()
                    .sort((a, b) => (a.startDatetime || '').localeCompare(b.startDatetime || ''))
                    .map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => setEditor(ev)}
                        className="block w-full rounded-lg border border-line bg-base px-2 py-1.5 text-left hover:border-accent"
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate text-xs font-medium text-ink">{ev.title}</span>
                          {isAideTask(ev) && <AideBadge />}
                        </div>
                        <div className="text-[10px] text-ink2">
                          {ev.allDay ? 'Dia inteiro' : `${eventTime(ev.startDatetime)} – ${eventTime(ev.endDatetime)}`}
                        </div>
                      </button>
                    ))
                )}
              </div>
              <button
                onClick={() => setEditor({ date: selectedDay })}
                className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-1.5 text-xs text-ink2 hover:bg-surface2"
              >
                <Plus className="h-3 w-3" /> Novo evento neste dia
              </button>
            </div>
          </div>
        )}
      </div>

      {editor !== undefined && (
        <EventEditor
          event={editor.googleEventId ? editor : null}
          initialDate={editor.date}
          calendars={calendars}
          defaultCalendarId={(selectedCalIds && selectedCalIds[0]) || 'primary'}
          onClose={() => setEditor(undefined)}
          onSaved={onSaved}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}

function MonthView({ date, grouped, selectedDay, onSelectDay }) {
  const cells = monthGrid(date);
  const today = new Date();
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-7 border-b border-line">
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} className="py-2 text-center text-xs font-medium text-muted">
            {h}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const key = toISODate(cell);
          const evts = grouped[key] || [];
          const inMonth = cell.getMonth() === date.getMonth();
          const isToday = isSameDate(cell, today);
          const isSelected = key === selectedDay;
          return (
            <button
              key={i}
              onClick={() => onSelectDay(key)}
              className={`min-h-[84px] border-b border-r border-line p-1 text-left align-top last:border-r-0 ${
                isSelected ? 'ring-1 ring-inset ring-accent' : ''
              }`}
              style={isToday ? { background: '#EEF2FF' } : undefined}
            >
              <div className={`mb-1 text-xs font-medium ${inMonth ? 'text-ink' : 'text-muted'}`}>
                {cell.getDate()}
              </div>
              <div className="space-y-0.5">
                {evts.slice(0, 3).map((ev) => (
                  <div key={ev.id} className="flex items-center gap-1 truncate text-[10px] text-ink2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="truncate">{ev.title}</span>
                    {isAideTask(ev) && <AideBadge />}
                  </div>
                ))}
                {evts.length > 3 && (
                  <div className="text-[10px] font-medium text-accent">+{evts.length - 3} mais</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ date, events, onSelectEvent }) {
  const days = weekGrid(date);
  const now = new Date();
  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="grid grid-cols-8 border-b border-line">
        <div className="py-2 text-center text-[10px] text-muted">h</div>
        {days.map((d, i) => (
          <div key={i} className="py-2 text-center text-xs font-medium text-ink">
            {WEEKDAY_HEADERS[i]} {d.getDate()}
          </div>
        ))}
      </div>
      <div className="max-h-[60vh] overflow-y-auto">
        <div className="grid grid-cols-8" style={{ height: 24 * HOUR_PX }}>
          {/* hour labels */}
          <div className="relative">
            {hours.map((h) => (
              <div key={h} className="border-b border-line pr-1 text-right text-[10px] text-muted" style={{ height: HOUR_PX }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {/* day columns */}
          {days.map((d, di) => {
            const dayEvents = events.filter(
              (ev) => !ev.allDay && ev.startDatetime && isSameDate(new Date(ev.startDatetime), d)
            );
            const showNowLine = isSameDate(d, now);
            return (
              <div key={di} className="relative border-l border-line">
                {hours.map((h) => (
                  <div key={h} className="border-b border-line" style={{ height: HOUR_PX }} />
                ))}
                {dayEvents.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => onSelectEvent(ev)}
                    className="absolute left-0.5 right-0.5 overflow-hidden rounded-md px-1 py-0.5 text-left text-[10px] text-white"
                    style={{
                      top: startHour(ev.startDatetime) * HOUR_PX,
                      height: Math.max(18, durationHours(ev.startDatetime, ev.endDatetime) * HOUR_PX),
                      background: '#6366f1',
                    }}
                  >
                    <div className="truncate font-medium">{ev.title}</div>
                    <div className="truncate opacity-90">{eventTime(ev.startDatetime)}</div>
                  </button>
                ))}
                {showNowLine && (
                  <div
                    className="pointer-events-none absolute left-0 right-0"
                    style={{ top: (now.getHours() + now.getMinutes() / 60) * HOUR_PX }}
                  >
                    <div className="h-px w-full" style={{ background: '#EF4444' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
