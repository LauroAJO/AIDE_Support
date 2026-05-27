import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { toISODate, mondayOf } from '../../lib/week';
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
import { fromZonedTime, toZonedParts, detectBrowserTZ } from '../../lib/tz';

function pad(n) { return String(n).padStart(2, '0'); }

// "Europe/Amsterdam" → "Amsterdam" / "America/Sao_Paulo" → "São Paulo"
function shortTZ(tz) {
  if (!tz) return '';
  const last = tz.split('/').pop() || tz;
  return last.replace(/_/g, ' ');
}
function isoFromYMD(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function isoShifted(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return isoFromYMD(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function parseHHMM(s) {
  const [h, m] = (s || '00:00').split(':').map(Number);
  return [h || 0, m || 0];
}

// Para cada usuário, expande slots (recurring available + planned + scheduled
// date overrides) em instâncias com data/hora-decimal no fuso do VISUALIZADOR.
// Retorna { [viewerDateISO]: [{ kind, role, name, startH, endH, notes, sourceTime, sourceTZ }] }.
// `viewerDates` é a lista de datas ISO que estão visíveis (semana ou mês completo).
function expandSlotsForUser(u, viewerTZ, viewerDates) {
  const out = {};
  for (const d of viewerDates) out[d] = [];
  if (!u || viewerDates.length === 0) return out;
  const sourceTZ = u.timezone || viewerTZ;
  const sameTZ = sourceTZ === viewerTZ || !sourceTZ || !viewerTZ;
  const role = u.role || 'default';
  const name = (u.name || '').split(' ')[0];

  // Janela de datas source a explorar: viewer ±1 dia (cobre shifts de até 24h).
  const earliest = isoShifted(viewerDates[0], -1);
  const latest = isoShifted(viewerDates[viewerDates.length - 1], +1);

  // Itera todas as datas-source no intervalo
  const dates = [];
  for (let iso = earliest; iso <= latest; iso = isoShifted(iso, 1)) dates.push(iso);

  const placeInstance = (sourceDateISO, startStr, endStr, kind, notes) => {
    const [sy, sm, sd] = sourceDateISO.split('-').map(Number);
    const [sh, smin] = parseHHMM(startStr);
    const [eh, emin] = parseHHMM(endStr);
    if (sameTZ) {
      // Caminho rápido: source = viewer; mantém data e hora.
      if (!(sourceDateISO in out)) return;
      const startH = sh + smin / 60;
      const endH = (eh < sh ? 24 : eh) + emin / 60;
      out[sourceDateISO].push({
        kind, role, name,
        startH, endH,
        notes,
        sourceTime: `${pad(sh)}:${pad(smin)}–${pad(eh)}:${pad(emin)}`,
        sourceTZ: null,
      });
      return;
    }
    const startUTC = fromZonedTime(sy, sm - 1, sd, sh, smin, sourceTZ);
    const endUTC = fromZonedTime(sy, sm - 1, sd, eh, emin, sourceTZ);
    const sParts = toZonedParts(startUTC, viewerTZ);
    const eParts = toZonedParts(endUTC, viewerTZ);
    if (!(sParts.dateISO in out)) return;
    // Se a hora final cair em outro dia (para o viewer), trunca em 24:00 para
    // não vazar o bloco. Caso comum em conversões BR↔NL nas pontas do dia.
    const endHClamped = sParts.dateISO === eParts.dateISO ? eParts.hourDecimal : 24;
    out[sParts.dateISO].push({
      kind, role, name,
      startH: sParts.hourDecimal,
      endH: Math.max(sParts.hourDecimal + 0.25, endHClamped),
      notes,
      sourceTime: `${pad(sh)}:${pad(smin)}–${pad(eh)}:${pad(emin)}`,
      sourceTZ,
    });
  };

  for (const sourceDateISO of dates) {
    const [y, m, d] = sourceDateISO.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    const availList = u.available || (u.recurring || []).filter((s) => (s.slot_type || 'available') === 'available');
    const plannedList = u.planned || (u.recurring || []).filter((s) => s.slot_type === 'planned');
    for (const s of availList) {
      if (s.day_of_week !== dow || s.active === false) continue;
      placeInstance(sourceDateISO, s.start_time, s.end_time, 'avail');
    }
    for (const s of plannedList) {
      if (s.day_of_week !== dow || s.active === false) continue;
      placeInstance(sourceDateISO, s.start_time, s.end_time, 'planned');
    }
    for (const s of u.scheduled || []) {
      if (s.work_date !== sourceDateISO) continue;
      placeInstance(sourceDateISO, s.start_time, s.end_time, 'planned', s.notes);
    }
  }
  return out;
}

const CAL_STORAGE_KEY = 'aide_selected_calendars';
const TOGGLES_STORAGE_KEY = 'aide-calendar-toggles';

// Paleta por usuário: cor base é por papel (owner=azul, assistant=rosa).
// `avail` = tom claro + borda média; `planned` = tom mais saturado + borda escura.
// Fallback (papel desconhecido): cinza-azulado.
const USER_PALETTES = {
  owner: {
    base: '#3B82F6',
    availFill: 'rgba(59,130,246,0.10)',
    availBorder: '#3B82F6',
    availText: '#1E40AF',
    plannedFill: 'rgba(59,130,246,0.22)',
    plannedBorder: '#1D4ED8',
    plannedText: '#1E3A8A',
  },
  assistant: {
    base: '#EC4899',
    availFill: 'rgba(236,72,153,0.10)',
    availBorder: '#EC4899',
    availText: '#9D174D',
    plannedFill: 'rgba(236,72,153,0.22)',
    plannedBorder: '#BE185D',
    plannedText: '#831843',
  },
  default: {
    base: '#64748B',
    availFill: 'rgba(100,116,139,0.10)',
    availBorder: '#64748B',
    availText: '#334155',
    plannedFill: 'rgba(100,116,139,0.22)',
    plannedBorder: '#334155',
    plannedText: '#0F172A',
  },
};

function paletteForUser(role) {
  return USER_PALETTES[role] || USER_PALETTES.default;
}

function loadToggles() {
  try {
    const raw = JSON.parse(localStorage.getItem(TOGGLES_STORAGE_KEY) || '{}');
    return {
      available: raw.available !== false,
      planned: raw.planned !== false,
      events: raw.events !== false,
    };
  } catch {
    return { available: true, planned: true, events: true };
  }
}

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
  const user = useStore((s) => s.user);
  const calendarEvents = useStore((s) => s.calendarEvents);
  const setCalendarEvents = useStore((s) => s.setCalendarEvents);
  const calendarView = useStore((s) => s.calendarView);
  const setCalendarView = useStore((s) => s.setCalendarView);
  const calendarDate = useStore((s) => s.calendarDate);
  const setCalendarDate = useStore((s) => s.setCalendarDate);
  const allUsersSchedule = useStore((s) => s.allUsersSchedule);
  const setAllUsersSchedule = useStore((s) => s.setAllUsersSchedule);

  // Fuso do visualizador: usa o configurado no perfil, ou o do browser.
  const viewerTZ = useMemo(() => user?.timezone || detectBrowserTZ() || null, [user?.timezone]);

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
  const [toggles, setToggles] = useState(loadToggles);
  const updateToggle = (key) => {
    setToggles((cur) => {
      const next = { ...cur, [key]: !cur[key] };
      localStorage.setItem(TOGGLES_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

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

  // Datas visíveis (ISOs em viewer-local) — usadas pelas conversões de fuso
  const visibleDates = useMemo(() => {
    const cells = calendarView === 'month' ? monthGrid(date) : weekGrid(date);
    return cells.map(toISODate);
  }, [date, calendarView]);

  // Agrega blocos de TODOS os usuários, já convertidos para o fuso do viewer.
  const slotsByDate = useMemo(() => {
    const merged = {};
    for (const d of visibleDates) merged[d] = [];
    for (const uid in allUsersSchedule || {}) {
      const u = allUsersSchedule[uid];
      if (!u) continue;
      const perUser = expandSlotsForUser(u, viewerTZ, visibleDates);
      for (const d in perUser) {
        if (d in merged) merged[d].push(...perUser[d]);
      }
    }
    return merged;
  }, [allUsersSchedule, viewerTZ, visibleDates]);

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

  // Carrega disponibilidade + horário planejado de TODOS os usuários para a
  // semana visível. Em "mês", usa a segunda-feira da primeira célula como
  // âncora — o worker retorna 7 dias, ok para destacar a semana atual.
  const visibleWeekStart = useMemo(() => mondayOf(date), [date]);
  useEffect(() => {
    apiFetch(`/api/availability/all?week_start=${visibleWeekStart}`)
      .then((d) => setAllUsersSchedule(d || {}))
      .catch(() => setAllUsersSchedule({}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleWeekStart]);

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
                {c.sharedBy && (
                  <span className="text-[10px] opacity-80">· {c.sharedBy}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Camadas (toggle de visibilidade) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <TogglePill
          on={toggles.available}
          onClick={() => updateToggle('available')}
          label="Disponibilidade"
          color="#64748B"
        />
        <TogglePill
          on={toggles.planned}
          onClick={() => updateToggle('planned')}
          label="Planejado"
          color="#334155"
        />
        <TogglePill
          on={toggles.events}
          onClick={() => updateToggle('events')}
          label="Eventos"
          color="#6366F1"
        />
      </div>

      {/* Legenda de cores por usuário */}
      {Object.keys(allUsersSchedule || {}).length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink2">
          {Object.values(allUsersSchedule).map((u, i) => {
            const pal = paletteForUser(u.role || 'default');
            return (
              <span key={i} className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ border: `1.5px solid ${pal.availBorder}`, background: 'transparent' }}
                    title="Disponível"
                  />
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: pal.plannedBorder }}
                    title="Planejado"
                  />
                </span>
                <span style={{ color: pal.plannedBorder }}>{(u.name || '').split(' ')[0]}</span>
              </span>
            );
          })}
          <span className="text-muted">
            (ponto vazado = disponível · preenchido = planejado)
          </span>
          {viewerTZ && (
            <span className="ml-auto text-muted">
              Horários em <span className="font-medium text-ink2">{shortTZ(viewerTZ)}</span>
            </span>
          )}
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
              slotsByDate={slotsByDate}
              toggles={toggles}
            />
          ) : (
            <WeekView
              date={date}
              events={calendarEvents}
              onSelectEvent={(ev) => setEditor(ev)}
              slotsByDate={slotsByDate}
              toggles={toggles}
            />
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

function TogglePill({ on, onClick, label, color }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition"
      style={{
        height: 28,
        borderRadius: 14,
        background: on ? color : 'transparent',
        borderColor: on ? color : '#E8E3DB',
        color: on ? '#fff' : '#9E9890',
      }}
    >
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: on ? '#fff' : color }} />
      {label}
    </button>
  );
}

// Indicadores por dia (mês). Agrupa por role+kind a partir das INSTÂNCIAS já
// convertidas para o fuso do visualizador.
function indicatorsFromInstances(instances) {
  const byRole = new Map(); // role → { name, hasAvail, hasPlanned }
  for (const it of instances || []) {
    let m = byRole.get(it.role);
    if (!m) { m = { role: it.role, name: it.name, hasAvail: false, hasPlanned: false }; byRole.set(it.role, m); }
    if (it.kind === 'avail') m.hasAvail = true;
    else m.hasPlanned = true;
  }
  return [...byRole.values()];
}

function MonthView({ date, grouped, selectedDay, onSelectDay, slotsByDate, toggles }) {
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
          const marks = indicatorsFromInstances((slotsByDate || {})[key] || []);
          const showAvailLayer = toggles?.available !== false;
          const showPlannedLayer = toggles?.planned !== false;
          const showEvents = toggles?.events !== false;
          // Fundo do dia: só pinta quando há ALGO visível para esse dia.
          const anyVisible = marks.some((m) =>
            (showAvailLayer && m.hasAvail) || (showPlannedLayer && m.hasPlanned)
          );
          const bg = isToday ? '#EEF2FF' : anyVisible ? '#FAF7F2' : undefined;
          return (
            <button
              key={i}
              onClick={() => onSelectDay(key)}
              className={`min-h-[84px] border-b border-r border-line p-1 text-left align-top last:border-r-0 ${
                isSelected ? 'ring-1 ring-inset ring-accent' : ''
              }`}
              style={bg ? { background: bg } : undefined}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={`text-xs font-medium ${inMonth ? 'text-ink' : 'text-muted'}`}>
                  {cell.getDate()}
                </span>
                <span className="flex items-center gap-0.5">
                  {marks.map((m, mi) => {
                    const pal = paletteForUser(m.role);
                    // Ponto preenchido = planejado (ou seja: vai trabalhar);
                    // Ponto vazado = só disponibilidade configurada.
                    const filled = showPlannedLayer && m.hasPlanned;
                    const outlined = showAvailLayer && m.hasAvail && !filled;
                    if (!filled && !outlined) return null;
                    return (
                      <span
                        key={mi}
                        className="inline-block h-2 w-2 rounded-full"
                        style={
                          filled
                            ? { background: pal.plannedBorder, border: `1px solid ${pal.plannedBorder}` }
                            : { background: 'transparent', border: `1.5px solid ${pal.availBorder}` }
                        }
                        title={`${m.name} — ${filled ? 'Planejado' : 'Disponível'}`}
                      />
                    );
                  })}
                </span>
              </div>
              <div className="space-y-0.5">
                {showEvents && evts.slice(0, 3).map((ev) => (
                  <div key={ev.id} className="flex items-center gap-1 truncate text-[10px] text-ink2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <span className="truncate">{ev.title}</span>
                    {isAideTask(ev) && <AideBadge />}
                  </div>
                ))}
                {showEvents && evts.length > 3 && (
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

function WeekView({ date, events, onSelectEvent, slotsByDate, toggles }) {
  const days = weekGrid(date);
  const now = new Date();
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const showAvail = toggles?.available !== false;
  const showPlanned = toggles?.planned !== false;
  const showEvents = toggles?.events !== false;

  // slotsByDate vem do parent, já convertido para o fuso do viewer.
  const blocksPerDay = days.map((d) => slotsByDate?.[toISODate(d)] || []);

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
            const blocks = blocksPerDay[di] || [];
            return (
              <div key={di} className="relative border-l border-line">
                {hours.map((h) => (
                  <div key={h} className="border-b border-line" style={{ height: HOUR_PX }} />
                ))}
                {/* Camadas 1 e 2: blocos de disponibilidade (avail) e planejado.
                    Cada bloco usa a paleta do PRÓPRIO usuário; quando há blocos
                    de ambos no mesmo kind no mesmo dia, divide horizontalmente
                    em duas colunas (Lauro à esquerda, Alice à direita). */}
                {(['avail', 'planned']).map((kind) => {
                  if ((kind === 'avail' && !showAvail) || (kind === 'planned' && !showPlanned)) return null;
                  const sameKind = blocks.filter((b) => b.kind === kind);
                  if (sameKind.length === 0) return null;
                  const roles = Array.from(new Set(sameKind.map((b) => b.role)));
                  const splitting = roles.length > 1; // mais de um usuário → split em colunas
                  return sameKind.map((b, i) => {
                    const pal = paletteForUser(b.role);
                    const fill = kind === 'avail' ? pal.availFill : pal.plannedFill;
                    const border = kind === 'avail' ? pal.availBorder : pal.plannedBorder;
                    const text = kind === 'avail' ? pal.availText : pal.plannedText;
                    const colIdx = splitting ? roles.indexOf(b.role) : 0;
                    const colCount = splitting ? roles.length : 1;
                    const widthPct = 100 / colCount;
                    const leftPct = colIdx * widthPct;
                    const tzHint = b.sourceTZ
                      ? ` · ${b.sourceTime} ${shortTZ(b.sourceTZ)}`
                      : '';
                    return (
                      <div
                        key={`${kind}-${di}-${i}`}
                        title={`${kind === 'avail' ? 'Disponível' : 'Planejado'} — ${b.name}${tzHint}`}
                        className="pointer-events-none absolute overflow-hidden px-1 py-0.5 text-[9px]"
                        style={{
                          top: b.startH * HOUR_PX,
                          height: Math.max(12, (b.endH - b.startH) * HOUR_PX),
                          left: `${leftPct}%`,
                          width: `calc(${widthPct}% - 2px)`,
                          background: fill,
                          borderLeft: `${kind === 'planned' ? 4 : 3}px solid ${border}`,
                          color: text,
                          fontWeight: kind === 'planned' ? 600 : 500,
                        }}
                      >
                        <div className="truncate">
                          {kind === 'avail' ? 'Disp.' : 'Plan.'} — {b.name}
                        </div>
                        {b.sourceTZ && (
                          <div className="truncate opacity-70">
                            {b.sourceTime} {shortTZ(b.sourceTZ)}
                          </div>
                        )}
                        {b.notes && <div className="truncate opacity-80">{b.notes}</div>}
                      </div>
                    );
                  });
                })}
                {/* Camada 3: eventos Google (topo, totalmente opacos) */}
                {showEvents && dayEvents.map((ev) => (
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
