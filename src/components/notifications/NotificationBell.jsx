import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, UserCheck, Clock, AlertTriangle, X, Send, CalendarClock } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import SendAlertModal from './SendAlertModal';

const TYPE_ICON = {
  task_assigned: { Icon: UserCheck, color: '#6366f1' },
  task_due_soon: { Icon: Clock, color: '#F59E0B' },
  task_overdue: { Icon: AlertTriangle, color: '#EF4444' },
  alert: { Icon: Bell, color: '#6366f1' },
  scheduled_alert: { Icon: CalendarClock, color: '#6366f1' },
};

function fmtSendAt(unix) {
  const d = new Date(unix * 1000);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeAgo(unixSeconds) {
  const s = Math.floor(Date.now() / 1000) - unixSeconds;
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}

export default function NotificationBell() {
  const user = useStore((s) => s.user);
  const notifications = useStore((s) => s.notifications);
  const setNotifications = useStore((s) => s.setNotifications);
  const unreadCount = useStore((s) => s.unreadCount);
  const setUnreadCount = useStore((s) => s.setUnreadCount);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [users, setUsers] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [schedOpen, setSchedOpen] = useState(false);
  const [toast, setToast] = useState('');
  const ref = useRef(null);

  const load = async () => {
    try {
      const list = await apiFetch('/api/notifications');
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
    } catch {
      /* ignore */
    }
    try {
      setScheduled(await apiFetch('/api/notifications/scheduled'));
    } catch {
      setScheduled([]);
    }
  };

  const cancelScheduled = async (id) => {
    await apiFetch(`/api/notifications/scheduled/${id}`, { method: 'DELETE' });
    setScheduled((s) => s.filter((x) => x.id !== id));
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    apiFetch('/api/users').then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const markRead = async (id) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
    setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount(Math.max(0, unreadCount - 1));
  };

  const markAllRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'PUT' });
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const remove = async (id, wasUnread) => {
    await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
    setNotifications(notifications.filter((n) => n.id !== id));
    if (wasUnread) setUnreadCount(Math.max(0, unreadCount - 1));
  };

  const onClickNotif = (n) => {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (n.task_id) navigate('/tasks');
    else if (n.note_id) navigate('/notes');
  };

  const otherUser = users.find((u) => u.id !== user?.id) || null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex items-center rounded-md p-1.5 text-ink2 transition hover:bg-surface2 hover:text-ink"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: '#EF4444' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
          <div className="flex items-start justify-between border-b border-line px-3 py-2">
            <div>
              <span className="text-sm font-bold text-ink">Notificações</span>
              <p className="text-[10px] text-muted">Avisos manuais chegam na hora. Regras automáticas rodam diariamente.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setShowAlert(true);
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:opacity-80"
              >
                <Send className="h-3 w-3" /> Enviar Aviso
              </button>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[11px] text-ink2 hover:text-ink">
                  Marcar todas
                </button>
              )}
            </div>
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted">Nenhuma notificação</p>
            ) : (
              notifications.map((n) => {
                const { Icon, color } = TYPE_ICON[n.type] || TYPE_ICON.alert;
                return (
                  <div
                    key={n.id}
                    className={`group flex gap-2 border-b border-line/60 px-3 py-2 ${n.read ? '' : 'bg-surface2/60'}`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
                    <button onClick={() => onClickNotif(n)} className="min-w-0 flex-1 text-left">
                      <div className={`truncate text-xs ${n.read ? 'text-ink2' : 'font-bold text-ink'}`}>
                        {n.title}
                      </div>
                      {n.body && <div className="truncate text-[11px] text-ink2">{n.body}</div>}
                      <div className="text-[10px] text-muted">{timeAgo(n.created_at)}</div>
                    </button>
                    <button
                      onClick={() => remove(n.id, !n.read)}
                      className="shrink-0 self-start text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {scheduled.filter((s) => !s.sent).length > 0 && (
            <div className="border-t border-line">
              <button
                onClick={() => setSchedOpen((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-medium text-ink2 hover:bg-surface2"
              >
                Avisos agendados ({scheduled.filter((s) => !s.sent).length})
                <span>{schedOpen ? '▲' : '▼'}</span>
              </button>
              {schedOpen && (
                <div className="max-h-40 overflow-y-auto px-3 pb-2">
                  {scheduled
                    .filter((s) => !s.sent)
                    .map((s) => (
                      <div key={s.id} className="flex items-center gap-2 border-t border-line/40 py-1.5 text-[11px]">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-ink">{s.title}</div>
                          <div className="text-[10px] text-muted">Para: {s.toName || '—'} · {fmtSendAt(s.send_at)}</div>
                        </div>
                        <button onClick={() => cancelScheduled(s.id)} className="text-muted hover:text-danger" title="Cancelar">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAlert && (
        <SendAlertModal
          otherUser={otherUser}
          onClose={() => setShowAlert(false)}
          onSent={(msg) => {
            setShowAlert(false);
            load();
            if (msg) {
              setToast(msg);
              setTimeout(() => setToast(''), 4000);
            }
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink px-4 py-2 text-xs text-white shadow-soft">
          {toast}
        </div>
      )}
    </div>
  );
}
