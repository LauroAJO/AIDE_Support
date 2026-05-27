import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, LogOut, Bell, BellRing, Plus, Trash2, ChevronLeft, ChevronRight, Copy } from 'lucide-react';
import { useStore } from '../store';
import { apiFetch } from '../lib/api';
import { clearToken } from '../lib/auth';
import { registerPush } from '../lib/push';
import { mondayOf, weekDays, addDaysISO, formatDateBR, weekdayLabel, toISODate } from '../lib/week';
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

  // Disponibilidade semanal (recorrente) — array editável local
  // Cada item: { day_of_week, start_time, end_time, active }
  const [weeklyDraft, setWeeklyDraft] = useState([]);

  // Horário planejado da semana — controlado pela navegação
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [busySchedule, setBusySchedule] = useState(false);

  useEffect(() => {
    apiFetch('/api/availability/weekly')
      .then((d) => {
        const slots = d.slots || [];
        setWeeklyAvailability(slots);
        setWeeklyDraft(slots);
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

  // Agrupado por dia (0..6) para o grid recorrente
  const slotsByDay = useMemo(() => {
    const m = {};
    for (const s of weeklyDraft) (m[s.day_of_week] = m[s.day_of_week] || []).push(s);
    return m;
  }, [weeklyDraft]);

  const addWeeklySlot = (day) => {
    setWeeklyDraft((cur) => [
      ...cur,
      { day_of_week: day, start_time: '09:00', end_time: '17:00', active: true, __new: true, _key: Math.random() },
    ]);
  };
  const updateWeeklySlot = (idx, patch) => {
    setWeeklyDraft((cur) => cur.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const removeWeeklySlot = (idx) => {
    setWeeklyDraft((cur) => cur.filter((_, i) => i !== idx));
  };

  const saveWeekly = async () => {
    setSavingWeekly(true);
    try {
      const payload = {
        slots: weeklyDraft
          .filter((s) => s.start_time && s.end_time && s.active !== false)
          .map((s) => ({
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
      setWeeklyDraft(r.slots || []);
    } finally {
      setSavingWeekly(false);
    }
  };

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

  const copyFromRecurring = async () => {
    if (!window.confirm('Preencher esta semana com a disponibilidade semanal recorrente?')) return;
    setBusySchedule(true);
    try {
      // day_of_week (0..6, Dom..Sáb) → para cada dia da semana, copiar slots ativos
      for (let i = 0; i < 7; i += 1) {
        const dateISO = days[i];
        const dow = new Date(`${dateISO}T00:00:00`).getDay();
        const slots = weeklyAvailability.filter((s) => s.day_of_week === dow && s.active !== false);
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

      {/* Disponibilidade Semanal (recorrente) */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-1 text-base font-bold text-ink">Disponibilidade Semanal</h2>
        <p className="mb-3 text-xs text-muted">
          Horários recorrentes em que você pode trabalhar. Use múltiplos slots por dia
          (ex.: manhã 09:00–12:00 + tarde 14:00–18:00).
        </p>
        <div className="space-y-2">
          {DAYS_OF_WEEK.map(([dow, label]) => {
            const slots = (slotsByDay[dow] || []);
            const active = slots.length > 0;
            return (
              <div
                key={dow}
                className="rounded-lg border border-line p-3"
                style={active ? { background: '#F0FDF4' } : undefined}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-ink">{label}</span>
                  <button
                    onClick={() => addWeeklySlot(dow)}
                    className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-ink2 hover:bg-surface2"
                  >
                    <Plus className="h-3 w-3" /> Adicionar horário
                  </button>
                </div>
                {slots.length === 0 ? (
                  <p className="mt-1 text-[11px] text-muted">Indisponível</p>
                ) : (
                  <div className="mt-2 space-y-1.5">
                    {weeklyDraft.map((s, idx) => {
                      if (s.day_of_week !== dow) return null;
                      return (
                        <div key={s.id || s._key || idx} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={s.start_time}
                            onChange={(e) => updateWeeklySlot(idx, { start_time: e.target.value })}
                            className="input"
                            style={{ width: 110 }}
                          />
                          <span className="text-xs text-ink2">–</span>
                          <input
                            type="time"
                            value={s.end_time}
                            onChange={(e) => updateWeeklySlot(idx, { end_time: e.target.value })}
                            className="input"
                            style={{ width: 110 }}
                          />
                          <button
                            onClick={() => removeWeeklySlot(idx)}
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
            onClick={saveWeekly}
            disabled={savingWeekly}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
          >
            {savingWeekly ? 'Salvando...' : 'Salvar disponibilidade semanal'}
          </button>
          <p className="text-[11px] text-muted">
            Taxa padrão por hora em <a href="/payment" className="text-accent hover:underline">Pagamentos</a>.
          </p>
        </div>
      </section>

      {/* Horário Planejado (esta semana) */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-ink">Horário Planejado</h2>
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
            onClick={copyFromRecurring}
            disabled={busySchedule || weeklyAvailability.length === 0}
            className="flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 disabled:opacity-60"
          >
            <Copy className="h-3 w-3" /> Copiar da disponibilidade semanal
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {days.map((dayISO) => {
            const slots = scheduleByDate[dayISO] || [];
            const isToday = dayISO === toISODate(new Date());
            return (
              <div
                key={dayISO}
                className={`rounded-lg border p-2 ${isToday ? 'border-accent' : 'border-line'}`}
                style={slots.length > 0 ? { background: '#EEF2FF' } : undefined}
              >
                <div className="mb-1 text-[11px] font-semibold text-ink">{weekdayLabel(dayISO)}</div>
                <div className="space-y-1">
                  {slots.length === 0 && (
                    <p className="text-[11px] text-muted">—</p>
                  )}
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
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-line py-0.5 text-[11px] text-ink2 hover:bg-surface2"
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

