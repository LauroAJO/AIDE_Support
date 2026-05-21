import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, LogOut, Bell, BellRing } from 'lucide-react';
import { useStore } from '../store';
import { apiFetch } from '../lib/api';
import { clearToken } from '../lib/auth';
import { registerPush } from '../lib/push';
import Avatar from './shared/Avatar';

const ROLE_LABELS = { owner: 'Proprietário', assistant: 'Assistente' };
const WEEKDAYS = [
  [1, 'Seg'], [2, 'Ter'], [3, 'Qua'], [4, 'Qui'], [5, 'Sex'], [6, 'Sáb'], [7, 'Dom'],
];

export default function ProfilePage() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const navigate = useNavigate();

  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [avail, setAvail] = useState(null);
  const [savingAvail, setSavingAvail] = useState(false);
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  useEffect(() => {
    apiFetch('/api/availability').then(setAvail).catch(() => {});
  }, []);

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

  const saveAvail = async () => {
    setSavingAvail(true);
    try {
      setAvail(await apiFetch('/api/availability', { method: 'PUT', body: JSON.stringify(avail) }));
    } finally {
      setSavingAvail(false);
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

      {/* Availability */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="mb-3 text-base font-bold text-ink">Disponibilidade</h2>
        {!avail ? (
          <p className="text-sm text-muted">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(([num, label]) => {
                const on = avail.work_days.includes(num);
                return (
                  <button
                    key={num}
                    onClick={() =>
                      setAvail({
                        ...avail,
                        work_days: on
                          ? avail.work_days.filter((d) => d !== num)
                          : [...avail.work_days, num].sort((a, b) => a - b),
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
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TimeField label="Início" value={avail.work_start} onChange={(v) => setAvail({ ...avail, work_start: v })} />
              <TimeField label="Fim" value={avail.work_end} onChange={(v) => setAvail({ ...avail, work_end: v })} />
              <TimeField label="Almoço (início)" value={avail.lunch_start} onChange={(v) => setAvail({ ...avail, lunch_start: v })} />
              <TimeField label="Almoço (fim)" value={avail.lunch_end} onChange={(v) => setAvail({ ...avail, lunch_end: v })} />
            </div>
            <label className="block max-w-[200px]">
              <span className="mb-1 block text-xs font-medium text-ink2">Taxa padrão (€/h)</span>
              <input
                type="number"
                min="0"
                step="0.5"
                value={avail.hourly_rate}
                onChange={(e) => setAvail({ ...avail, hourly_rate: Number(e.target.value) || 0 })}
                className="input"
              />
            </label>
            <button
              onClick={saveAvail}
              disabled={savingAvail}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-60"
            >
              {savingAvail ? 'Salvando...' : 'Salvar'}
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

function TimeField({ label, value, onChange }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ink2">{label}</span>
      <input type="time" value={value} onChange={(e) => onChange(e.target.value)} className="input" />
    </label>
  );
}
