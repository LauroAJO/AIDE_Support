import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, LogOut, Bell, BellRing, Plus, Trash2, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useStore } from '../store';
import { apiFetch } from '../lib/api';
import { clearToken } from '../lib/auth';
import { registerPush } from '../lib/push';
import { mondayOf, weekDays, addDaysISO, formatDateBR, weekdayLabel, toISODate } from '../lib/week';
import { detectBrowserTZ, COMMON_TIMEZONES } from '../lib/tz';
import Avatar from './shared/Avatar';

const ROLE_LABELS = { owner: 'Proprietário', assistant: 'Assistente' };

// day_of_week segue Date.getDay(): 0=Dom..6=Sáb
const DAYS_OF_WEEK = [
  [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [0, 'Dom'],
];

export default function ProfilePage() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const weeklyAvailability = useStore((s) => s.weeklyAvailability);
  const setWeeklyAvailability = useStore((s) => s.setWeeklyAvailability);
  const dailySchedule = useStore((s) => s.dailySchedule);
  const setDailySchedule = useStore((s) => s.setDailySchedule);
  const navigate = useNavigate();

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [savingWeekly, setSavingWeekly] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [personal, setPersonal] = useState(null);
  const [extraPairs, setExtraPairs] = useState([]);
  const [savingPersonal, setSavingPersonal] = useState(false);

  // Dois drafts paralelos, um para cada slot_type ('available' / 'planned')
  const [availDraft, setAvailDraft] = useState([]);
  const [plannedDraft, setPlannedDraft] = useState([]);
  const [savingPlanned, setSavingPlanned] = useState(false);

  // Horário planejado da semana — controlado pela navegação
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [busySchedule, setBusySchedule] = useState(false);

  // Carrega tanto availability quanto planned recorrentes
  useEffect(() => {
    apiFetch('/api/availability/weekly')
      .then((d) => {
        const available = d.available || (d.slots || []).filter((s) => (s.slot_type || 'available') === 'available');
        const planned = d.planned || (d.slots || []).filter((s) => s.slot_type === 'planned');
        setWeeklyAvailability(d.slots || []);
        setAvailDraft(available);
        setPlannedDraft(planned);
      })
      .catch(() => {});
    apiFetch('/api/profile/personal')
      .then((p) => {
        setPersonal(p);
        setExtraPairs(Object.entries(p.extra_info || {}).map(([key, value]) => ({ key, value })));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega horário planejado quando muda a semana
  useEffect(() => {
    apiFetch(`/api/availability/schedule?week_start=${weekStart}`)
      .then((d) => setDailySchedule(d.scheduled || []))
      .catch(() => setDailySchedule([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  // Helpers genéricos para editar qualquer um dos drafts
  const groupByDay = (arr) => {
    const m = {};
    for (const s of arr) (m[s.day_of_week] = m[s.day_of_week] || []).push(s);
    return m;
  };
  const availByDay = useMemo(() => groupByDay(availDraft), [availDraft]);
  const plannedByDay = useMemo(() => groupByDay(plannedDraft), [plannedDraft]);

  const addSlot = (setter) => (day) => {
    setter((cur) => [
      ...cur,
      { day_of_week: day, start_time: '09:00', end_time: '17:00', active: true, _key: Math.random() },
    ]);
  };
  const updateSlot = (setter) => (idx, patch) => {
    setter((cur) => cur.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeSlot = (setter) => (idx) => {
    setter((cur) => cur.filter((_, i) => i !== idx));
  };

  const saveWeeklyOfType = async (draft, slotType, setBusy) => {
    setBusy(true);
    try {
      const payload = {
        slot_type: slotType,
        slots: draft
          .filter((s) => s.start_time && s.end_time && s.active !== false)
          .map((s) => ({
            slot_type: slotType,
            day_of_week: Number(s.day_of_week),
            start_time: s.start_time,
            end_time: s.end_time,
            active: s.active !== false,
          })),
      };
      const r = await apiFetch('/api/availability/weekly', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      setWeeklyAvailability(r.slots || []);
      if (slotType === 'available') setAvailDraft(r.available || []);
      else setPlannedDraft(r.planned || []);
    } finally {
      setBusy(false);
    }
  };

  const saveAvailable = () => saveWeeklyOfType(availDraft, 'available', setSavingWeekly);
  const savePlanned = () => saveWeeklyOfType(plannedDraft, 'planned', setSavingPlanned);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const scheduleByDate = useMemo(() => {
    const m = {};
    for (const s of dailySchedule) (m[s.work_date] = m[s.work_date] || []).push(s);
    return m;
  }, [dailySchedule]);

  const addScheduledSlot = async (dateISO, start = '09:00', end = '17:00', notes = '') => {
    setBusySchedule(true);
    try {
      await apiFetch('/api/availability/schedule', {
        method: 'POST',
        body: JSON.stringify({ work_date: dateISO, start_time: start, end_time: end, notes }),
      });
      const d = await apiFetch(`/api/availability/schedule?week_start=${weekStart}`);
      setDailySchedule(d.scheduled || []);
    } finally {
      setBusySchedule(false);
    }
  };
  const deleteScheduledSlot = async (id) => {
    setBusySchedule(true);
    try {
      await apiFetch(`/api/availability/schedule/${id}`, { method: 'DELETE' });
      setDailySchedule(dailySchedule.filter((s) => s.id !== id));
    } finally {
      setBusySchedule(false);
    }
  };

  const copyPattern = async (fromType) => {
    const src = fromType === 'planned' ? plannedDraft : availDraft;
    if (src.length === 0) return;
    const label = fromType === 'planned' ? 'planejamento semanal padrão' : 'disponibilidade semanal';
    if (!window.confirm(`Preencher esta semana com base no ${label}?`)) return;
    setBusySchedule(true);
    try {
      for (let i = 0; i < 7; i += 1) {
        const dateISO = days[i];
        const dow = new Date(`${dateISO}T00:00:00`).getDay();
        const slots = src.filter((s) => s.day_of_week === dow && s.active !== false);
        for (const s of slots) {
          // eslint-disable-next-line no-await-in-loop
          await apiFetch('/api/availability/schedule', {
            method: 'POST',
            body: JSON.stringify({
              work_date: dateISO,
              start_time: s.start_time,
              end_time: s.end_time,
              notes: '',
            }),
          });
        }
      }
      const d = await apiFetch(`/api/availability/schedule?week_start=${weekStart}`);
      setDailySchedule(d.scheduled || []);
    } finally {
      setBusySchedule(false);
    }
  };

  const savePersonal = async () => {
    setSavingPersonal(true);
    try {
      const extra_info = {};
      extraPairs.forEach(({ key, value }) => {
        if (key.trim()) extra_info[key.trim()] = value;
      });
      const saved = await apiFetch('/api/profile/personal', {
        method: 'PUT',
        body: JSON.stringify({ ...personal, extra_info }),
      });
      setPersonal(saved);
    } finally {
      setSavingPersonal(false);
    }
  };

  if (!user) return null;
  const roleLabel = ROLE_LABELS[user.role] || user.role || '—';

  const saveName = async () => {
    setEditingName(false);
    const trimmed = name.trim();
    if (!trimmed || trimmed === user.name) return;
    try {
      const updated = await apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify({ name: trimmed }) });
      setUser(updated);
    } catch {
      setName(user.name || '');
    }
  };

  // Fuso horário — auto-detecta na primeira carga se ainda não configurado.
  const browserTZ = useMemo(() => detectBrowserTZ(), []);
  const [savingTZ, setSavingTZ] = useState(false);
  const [tzMsg, setTzMsg] = useState(null);
  useEffect(() => {
    if (!user) return;
    if (!user.timezone && browserTZ) {
      // Salva silenciosamente o fuso detectado para que o calendário já funcione.
      apiFetch('/api/profile', { method: 'PUT', body: JSON.stringify({ timezone: browserTZ }) })
        .then((u) => setUser(u))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const saveTimezone = async (tz) => {
    setSavingTZ(true);
    setTzMsg(null);
    try {
      const updated = await apiFetch('/api/profile', {
        method: 'PUT',
        body: JSON.stringify({ timezone: tz || null }),
      });
      setUser(updated);
      setTzMsg({ kind: 'ok', text: 'Fuso horário salvo.' });
    } catch (e) {
      setTzMsg({ kind: 'err', text: `Falha: ${String((e && e.message) || e).slice(0, 200)}` });
    } finally {
      setSavingTZ(false);
    }
  };

  const enableNotifications = async () => {
    await registerPush();
    setPermission(typeof Notification !== 'undefined' ? Notification.permission : 'default');
  };

  const testNotification = async () => {
    try {
      await apiFetch('/api/notifications', {
        method: 'POST',
        body: JSON.stringify({ to_user_id: user.id, type: 'alert', title: 'Teste', body: 'Funcionando!' }),
      });
    } catch {
      /* ignore */
    }
  };

  const logout = () => {
    clearToken();
    setUser(null);
    navigate('/');
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Identity */}
      <section className="flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
        <Avatar user={user} size={80} />
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="w-full rounded-lg border border-line bg-surface2 px-2 py-1 text-xl font-bold text-ink outline-none"
            />
          ) : (
            <button onClick={() => setEditingName(true)} className="group flex items-center gap-2 text-left">
              <span className="text-xl font-bold text-ink">{user.name || '—'}</span>
              <Pencil className="h-4 w-4 text-muted opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
          <p className="mt-0.5 text-sm text-ink2">{user.email}</p>
          <span
            className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
            style={{ background: user.role === 'owner' ? '#6366f1' : '#9E9890' }}
          >
            {roleLabel}
          </span>
        </div>
      </section>

      {/* Fuso horário */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-base font-bold text-ink">Fuso horário</h2>
        <p className="mb-3 text-xs text-muted">
          Todos os horários da Disponibilidade e Planejamento são entendidos como
          locais do seu fuso. O Calendário converte automaticamente para quem
          estiver visualizando (ex.: Alice 09:00 BR aparece para Lauro em horário NL).
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-[240px]">
            <span className="mb-1 block text-xs font-medium text-ink2">Fuso (IANA)</span>
            <select
              value={user.timezone || ''}
              onChange={(e) => saveTimezone(e.target.value)}
              disabled={savingTZ}
              className="input"
            >
              <option value="">— (detectar automaticamente)</option>
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-col gap-1 text-[11px] text-muted">
            <span>
              Browser detectou: <span className="font-medium text-ink2">{browserTZ || '—'}</span>
            </span>
            {tzMsg && (
              <span className={tzMsg.kind === 'ok' ? 'text-emerald-600' : 'text-danger'}>
                {tzMsg.text}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Disponibilidade Semanal — slots quando o usuário PODE trabalhar (verde) */}
      <RecurringSlotsGrid
        title="Disponibilidade Semanal"
        helper="Horários recorrentes em que você pode trabalhar. Use múltiplos slots por dia (ex.: manhã 09:00–12:00 + tarde 14:00–18:00)."
        accentBg="#F0FDF4"
        draft={availDraft}
        byDay={availByDay}
        onAdd={addSlot(setAvailDraft)}
        onUpdate={updateSlot(setAvailDraft)}
        onRemove={removeSlot(setAvailDraft)}
        onSave={saveAvailable}
        saving={savingWeekly}
        saveLabel="Salvar disponibilidade semanal"
        footer={<p className="text-[11px] text-muted">Taxa padrão por hora em <a href="/payment" className="text-accent hover:underline">Pagamentos</a>.</p>}
      />

      {/* Planejamento Semanal Padrão — horas que o usuário PLANEJA trabalhar (indigo) */}
      <RecurringSlotsGrid
        title="Planejamento Semanal Padrão"
        helper="Horário padrão de trabalho por semana. Ajustes para semanas específicas ficam abaixo."
        accentBg="#EEF2FF"
        accentBorder="#6366F1"
        draft={plannedDraft}
        byDay={plannedByDay}
        onAdd={addSlot(setPlannedDraft)}
        onUpdate={updateSlot(setPlannedDraft)}
        onRemove={removeSlot(setPlannedDraft)}
        onSave={savePlanned}
        saving={savingPlanned}
        saveLabel="Salvar planejamento semanal"
      />

      {/* Ajustes desta semana (overrides para datas específicas) */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-ink">Ajustes desta semana</h2>
            <p className="text-[11px] text-muted">
              Sobrescreve o planejamento padrão para datas específicas, sem afetar a recorrência.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setWeekStart(addDaysISO(weekStart, -7))}
              className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2"
              title="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium text-ink2">
              Semana de {formatDateBR(weekStart)} a {formatDateBR(addDaysISO(weekStart, 6))}
            </span>
            <button
              onClick={() => setWeekStart(addDaysISO(weekStart, 7))}
              className="rounded-lg border border-line p-1.5 text-ink2 hover:bg-surface2"
              title="Próxima semana"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setWeekStart(mondayOf(new Date()))}
              className="ml-1 rounded-lg border border-line px-2 py-1 text-[11px] text-ink2 hover:bg-surface2"
            >
              Hoje
            </button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => copyPattern('planned')}
            disabled={busySchedule || plannedDraft.length === 0}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 disabled:opacity-60"
          >
            <Copy className="h-3 w-3" /> Copiar do planejamento padrão
          </button>
          <button
            onClick={() => copyPattern('available')}
            disabled={busySchedule || availDraft.length === 0}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 disabled:opacity-60"
          >
            <Copy className="h-3 w-3" /> Copiar da disponibilidade
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {days.map((dayISO) => {
            const slots = scheduleByDate[dayISO] || [];
            const isToday = dayISO === toISODate(new Date());
            const dow = new Date(`${dayISO}T00:00:00`).getDay();
            // Slots planejados do padrão semanal para este dia (mostrados como fantasmas
            // se não houver override). Clicar adiciona como override.
            const plannedHints = plannedDraft.filter((s) => s.day_of_week === dow && s.active !== false);
            const hasOverride = slots.length > 0;
            return (
              <div
                key={dayISO}
                className={`rounded-lg border p-2 ${isToday ? 'border-accent' : 'border-line'}`}
                style={hasOverride ? { background: '#EEF2FF' } : undefined}
              >
                <div className="mb-1 text-[11px] font-semibold text-ink">{weekdayLabel(dayISO)}</div>
                <div className="space-y-1">
                  {!hasOverride && plannedHints.length === 0 && (
                    <p className="text-[11px] text-muted">—</p>
                  )}
                  {!hasOverride && plannedHints.map((s, i) => (
                    <button
                      key={`hint-${i}`}
                      onClick={() => addScheduledSlot(dayISO, s.start_time, s.end_time, '')}
                      disabled={busySchedule}
                      title="Adicionar como ajuste desta semana"
                      className="w-full rounded-md border border-dashed px-1.5 py-1 text-[11px] hover:bg-surface2 disabled:opacity-60"
                      style={{ borderColor: '#6366F1', color: '#6366F1', background: 'rgba(99,102,241,0.04)' }}
                    >
                      {s.start_time}–{s.end_time} <span className="opacity-70">(padrão)</span>
                    </button>
                  ))}
                  {slots.map((s) => (
                    <div key={s.id} className="rounded-md border border-line bg-surface px-1.5 py-1 text-[11px]">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-ink">
                          {s.start_time}–{s.end_time}
                        </span>
                        <button
                          onClick={() => deleteScheduledSlot(s.id)}
                          className="text-muted hover:text-danger"
                          title="Remover"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      {s.notes && <div className="text-[10px] text-ink2">{s.notes}</div>}
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => addScheduledSlot(dayISO)}
                  disabled={busySchedule}
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line py-0.5 text-[11px] text-ink2 hover:bg-surface2 disabled:opacity-60"
                >
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Personal data */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-base font-bold text-ink">Dados Pessoais</h2>
        {!personal ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Telefone</span>
              <input
                value={personal.phone}
                onChange={(e) => setPersonal({ ...personal, phone: e.target.value })}
                placeholder="+31 6 XXXX XXXX"
                className="input"
              />
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Tipo de chave PIX</span>
                <select
                  value={personal.pix_key_type}
                  onChange={(e) => setPersonal({ ...personal, pix_key_type: e.target.value })}
                  className="input"
                >
                  <option value="">—</option>
                  {['CPF', 'CNPJ', 'Email', 'Telefone', 'Chave aleatória'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-ink2">Chave PIX</span>
                <input
                  value={personal.pix_key}
                  onChange={(e) => setPersonal({ ...personal, pix_key: e.target.value })}
                  className="input"
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Banco</span>
              <input
                value={personal.bank_name}
                onChange={(e) => setPersonal({ ...personal, bank_name: e.target.value })}
                className="input"
              />
            </label>

            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Informações extras</p>
              <div className="space-y-1.5">
                {extraPairs.map((pair, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      value={pair.key}
                      onChange={(e) => setExtraPairs(extraPairs.map((p, i) => (i === idx ? { ...p, key: e.target.value } : p)))}
                      placeholder="Ex.: Endereço"
                      className="input flex-1"
                    />
                    <input
                      value={pair.value}
                      onChange={(e) => setExtraPairs(extraPairs.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p)))}
                      placeholder="Valor"
                      className="input flex-1"
                    />
                    <button
                      onClick={() => setExtraPairs(extraPairs.filter((_, i) => i !== idx))}
                      className="rounded-lg border border-line px-2 text-muted hover:text-danger"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setExtraPairs([...extraPairs, { key: '', value: '' }])}
                className="mt-1.5 text-xs font-medium text-accent hover:opacity-80"
              >
                + Adicionar informação
              </button>
            </div>

            <button
              onClick={savePersonal}
              disabled={savingPersonal}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {savingPersonal ? 'Salvando...' : 'Salvar dados pessoais'}
            </button>
          </div>
        )}
      </section>

      {/* Notifications */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-base font-bold text-ink">Notificações</h2>
        <p className="mb-3 flex items-center gap-2 text-sm text-ink2">
          {permission === 'granted' ? (
            <><BellRing className="h-4 w-4 text-accent" /> Notificações push ativadas</>
          ) : (
            <><Bell className="h-4 w-4 text-muted" /> Push não ativado ({permission})</>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {permission !== 'granted' && (
            <button onClick={enableNotifications} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">
              Ativar notificações
            </button>
          )}
          <button onClick={testNotification} className="rounded-lg border border-line px-3 py-2 text-sm text-ink2 hover:bg-surface2">
            Testar notificação
          </button>
        </div>
      </section>

      {/* Session */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-base font-bold text-ink">Sessão</h2>
        <button
          onClick={logout}
          className="flex items-center gap-2 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger transition hover:bg-danger/10"
        >
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </section>
    </div>
  );
}

// Reused for both "Disponibilidade Semanal" (verde) e "Planejamento Semanal Padrão" (indigo).
// `draft` é o array completo; `byDay` é o mesmo agrupado por day_of_week (0..6).
function RecurringSlotsGrid({
  title,
  helper,
  accentBg,
  accentBorder,
  draft,
  byDay,
  onAdd,
  onUpdate,
  onRemove,
  onSave,
  saving,
  saveLabel,
  footer,
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5">
      <h2 className="mb-1 text-base font-bold text-ink">{title}</h2>
      {helper && <p className="mb-3 text-xs text-muted">{helper}</p>}
      <div className="space-y-2">
        {DAYS_OF_WEEK.map(([dow, label]) => {
          const slots = byDay[dow] || [];
          const active = slots.length > 0;
          return (
            <div
              key={dow}
              className="rounded-lg border border-line p-3"
              style={active ? { background: accentBg, borderLeft: accentBorder ? `3px solid ${accentBorder}` : undefined } : undefined}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">{label}</span>
                <button
                  onClick={() => onAdd(dow)}
                  className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink2 hover:bg-surface2"
                >
                  <Plus className="h-3 w-3" /> Adicionar horário
                </button>
              </div>
              {slots.length === 0 ? (
                <p className="mt-1 text-[11px] text-muted">—</p>
              ) : (
                <div className="mt-2 space-y-1.5">
                  {draft.map((s, idx) => {
                    if (s.day_of_week !== dow) return null;
                    return (
                      <div key={s.id || s._key || idx} className="flex items-center gap-2">
                        <input
                          type="time"
                          value={s.start_time}
                          onChange={(e) => onUpdate(idx, { start_time: e.target.value })}
                          className="input"
                          style={{ width: 110 }}
                        />
                        <span className="text-xs text-ink2">–</span>
                        <input
                          type="time"
                          value={s.end_time}
                          onChange={(e) => onUpdate(idx, { end_time: e.target.value })}
                          className="input"
                          style={{ width: 110 }}
                        />
                        <button
                          onClick={() => onRemove(idx)}
                          className="ml-auto rounded-md border border-line p-1 text-danger hover:bg-danger/10"
                          title="Remover"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
        >
          {saving ? 'Salvando...' : saveLabel}
        </button>
        {footer}
      </div>
    </section>
  );
}

