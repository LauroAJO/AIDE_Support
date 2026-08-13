import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, UserCheck, Clock, AlertTriangle, X, Send, CalendarClock, AtSign,
  Video, GitMerge, Mail, RefreshCw, Calendar, Briefcase, User, Archive,
  RotateCw, CheckCheck,
} from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import SendAlertModal from './SendAlertModal';

// Fix A3 (Bloco A — redesign de notificações) — ícone dedicado por tipo. Antes
// só 5 dos 15 tipos existentes tinham ícone próprio; o resto caía no sino
// genérico, então bridge_pending, gmail_unread, career_*, staleness_alert e
// meeting_ended eram visualmente indistinguíveis entre si no painel.
const TYPE_ICON = {
  task_assigned: { Icon: UserCheck, color: '#6366f1' },
  task_due_soon: { Icon: Clock, color: '#F59E0B' },
  task_overdue: { Icon: AlertTriangle, color: '#EF4444' },
  alert: { Icon: Bell, color: '#6366f1' },
  mention: { Icon: AtSign, color: '#8B5CF6' },
  meeting_ended: { Icon: Video, color: '#22C55E' },
  bridge_pending: { Icon: GitMerge, color: '#6366f1' },
  gmail_unread: { Icon: Mail, color: '#3B82F6' },
  staleness_alert: { Icon: RefreshCw, color: '#F59E0B' },
  event_deadline: { Icon: Calendar, color: '#EF4444' },
  career_deadline: { Icon: Briefcase, color: '#EF4444' },
  career_contact_due: { Icon: User, color: '#F59E0B' },
  career_inactive: { Icon: Archive, color: '#9E9890' },
  scheduled_alert: { Icon: CalendarClock, color: '#6366f1' },
};
const DEFAULT_ICON = { Icon: Bell, color: '#9E9890' };

// Fix A1 — tipos que navegam para uma rota FIXA/própria (não uma tarefa ou
// nota) mesmo quando a notificação também carrega um task_id de apoio. Ex.:
// meeting_ended usa task_id internamente só para saber qual foi a "reunião"
// (a tarefa singleton "Reunião AIDE"), mas o clique deve abrir /meeting, não
// a tarefa em si — daí essa lista ter prioridade sobre task_id/note_id.
const TYPE_ROUTES = {
  bridge_pending: '/bridge/staging',
  gmail_unread: '/gmail',
  staleness_alert: '/networking',
  event_deadline: '/events',
  career_deadline: '/career',
  career_contact_due: '/career',
  career_inactive: '/career',
  meeting_ended: '/meeting',
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

// Fix A3 — agrupamento por data (Hoje / Ontem / Últimos 7 dias / Mais
// antigas). Compara por dia local, não por diferença de 24h corrida, senão
// uma notificação de ontem às 23h e outra de hoje às 01h cairiam no mesmo
// "balde" de 24h.
function dayKey(unixSeconds) {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function groupByDate(list) {
  const now = new Date();
  const todayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const yest = new Date(now.getTime() - 86400000);
  const yestKey = `${yest.getFullYear()}-${yest.getMonth()}-${yest.getDate()}`;
  const sevenDaysAgo = Math.floor(now.getTime() / 1000) - 7 * 86400;

  const groups = { Hoje: [], Ontem: [], 'Últimos 7 dias': [], 'Mais antigas': [] };
  for (const n of list) {
    const k = dayKey(n.created_at);
    if (k === todayKey) groups.Hoje.push(n);
    else if (k === yestKey) groups.Ontem.push(n);
    else if (n.created_at >= sevenDaysAgo) groups['Últimos 7 dias'].push(n);
    else groups['Mais antigas'].push(n);
  }
  return Object.entries(groups).filter(([, items]) => items.length > 0);
}

// Fix A1 — deep-link de cada notificação. `link` (calculado no backend, com
// entity_id já embutido, ex. '/career?opportunity=<id>') tem prioridade
// máxima quando presente; TYPE_ROUTES cobre linhas antigas (antes da
// migração 0060) para os tipos que navegam por rota fixa; task_id/note_id
// seguem o padrão de deep-link já usado em Tarefas/Notas para o resto.
function routeFor(n) {
  if (n.link) return n.link;
  if (TYPE_ROUTES[n.type]) return TYPE_ROUTES[n.type];
  if (n.task_id) return `/tasks?task=${n.task_id}`;
  if (n.note_id) return `/notes?note=${n.note_id}`;
  return null;
}
function navLabelFor(n) {
  if (n.task_id && !TYPE_ROUTES[n.type]) return 'Ver tarefa';
  if (n.note_id && !TYPE_ROUTES[n.type]) return 'Ver nota';
  if (n.type === 'career_deadline' || n.type === 'career_inactive') return 'Ver vaga';
  if (n.type === 'career_contact_due') return 'Ver em Carreira';
  if (n.type === 'meeting_ended') return 'Ver reunião';
  if (n.type === 'bridge_pending') return 'Revisar Bridge';
  if (n.type === 'gmail_unread') return 'Ver e-mails';
  if (n.type === 'staleness_alert') return 'Ver em Rede';
  if (n.type === 'event_deadline') return 'Ver eventos';
  return null;
}

function NotifRow({ n, onOpen, onRemove }) {
  const { Icon, color } = TYPE_ICON[n.type] || DEFAULT_ICON;
  const route = routeFor(n);
  const navLabel = route ? navLabelFor(n) : null;

  // Fix A3 — task_assigned mostrava o mesmo título para toda notificação
  // ("Fulano atribuiu uma tarefa a você"), com o título REAL da tarefa
  // escondido no body em texto pequeno — impossível diferenciar entradas na
  // lista. Inverte a hierarquia visual: o título da tarefa vira a linha
  // principal (em negrito), quem atribuiu vira a linha secundária.
  const isTaskAssigned = n.type === 'task_assigned';
  const mainText = isTaskAssigned ? (n.body || n.title) : n.title;
  const secondaryText = isTaskAssigned ? n.title : n.body;

  return (
    <div className={`group flex gap-2.5 border-b border-line/60 px-3 py-2.5 ${n.read ? '' : 'bg-surface2/60'}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} />
      <button onClick={() => onOpen(n, route)} className="min-w-0 flex-1 text-left">
        <div className={`line-clamp-2 text-xs ${n.read ? 'text-ink2' : 'font-bold text-ink'}`}>
          {mainText}
        </div>
        {secondaryText && (
          <div className="mt-0.5 line-clamp-2 text-[11px] text-ink2">{secondaryText}</div>
        )}
        <div className="mt-0.5 flex items-center gap-2">
          <span className="text-[10px] text-muted">{timeAgo(n.created_at)}</span>
          {navLabel && (
            <span className="text-[10px] font-medium text-accent">→ {navLabel}</span>
          )}
        </div>
      </button>
      <button
        onClick={() => onRemove(n.id, !n.read)}
        className="shrink-0 self-start text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
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
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await apiFetch('/api/notifications');
      setNotifications(list);
      setUnreadCount(list.filter((n) => !n.read).length);
      setLoadError('');
    } catch (e) {
      // Fix A3/#8 — antes um erro de rede/servidor virava lista vazia
      // silenciosa ("Nenhuma notificação"), indistinguível de "não há
      // notificações mesmo". Agora mostra o erro com botão de retry.
      setLoadError(String((e && e.message) || e) || 'Falha ao carregar notificações.');
    } finally {
      setLoading(false);
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
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
    } finally {
      // Fix A3 — "Always call load() to sync with server" também depois de
      // marcar uma só como lida, não só no "marcar todas"/remover. Evita a
      // contagem de não-lidas divergir do servidor se duas abas estiverem
      // abertas ou se o PUT falhar parcialmente.
      await load();
    }
  };

  const markAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PUT' });
    } finally {
      await load();
    }
  };

  const remove = async (id, _wasUnread) => {
    try {
      await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
    } finally {
      await load();
    }
  };

  const onClickNotif = (n, route) => {
    if (!n.read) markRead(n.id);
    setOpen(false);
    if (route) navigate(route);
  };

  const otherUser = users.find((u) => u.id !== user?.id) || null;
  const grouped = groupByDate(notifications);

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
        // Fix A3 — largura w-80 → w-96 e teto max-h-[80vh] (antes max-h-[400px]
        // fixo cortava conteúdo em telas altas sem indicar que havia mais).
        <div className="absolute right-0 top-12 z-30 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
          <div className="flex items-start justify-between border-b border-line px-3 py-2.5">
            <div>
              <span className="text-sm font-bold text-ink">
                Notificações{unreadCount > 0 ? ` (${unreadCount} não lidas)` : ''}
              </span>
              <p className="text-[10px] text-muted">Avisos manuais chegam na hora. Regras automáticas rodam diariamente.</p>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  setOpen(false);
                  setShowAlert(true);
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-accent hover:opacity-80"
              >
                <Send className="h-3 w-3" /> Enviar Aviso
              </button>
              <button onClick={() => setOpen(false)} className="text-ink2 hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Fix A3 — "Marcar todas" era um texto discreto que só aparecia
              condicionado a unreadCount>0 no header apertado; agora é uma
              faixa própria, sempre visível quando há não-lidas, com ícone. */}
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center justify-center gap-1.5 border-b border-line bg-surface2/40 py-1.5 text-xs font-medium text-accent hover:underline"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
            </button>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadError ? (
              <div className="flex flex-col items-center gap-2 p-6 text-center">
                <p className="text-xs text-danger">Erro ao carregar notificações</p>
                <p className="max-w-[240px] break-words text-[10px] text-muted">{loadError}</p>
                <button
                  onClick={load}
                  disabled={loading}
                  className="flex items-center gap-1 rounded-md border border-line px-2.5 py-1 text-[11px] font-medium text-ink2 hover:bg-surface2 disabled:opacity-60"
                >
                  <RotateCw className="h-3 w-3" /> {loading ? 'Tentando...' : 'Tentar de novo'}
                </button>
              </div>
            ) : notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted">
                {loading ? 'Carregando...' : 'Nenhuma notificação'}
              </p>
            ) : (
              grouped.map(([label, items]) => (
                <div key={label}>
                  <div className="sticky top-0 bg-surface2/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted backdrop-blur">
                    {label}
                  </div>
                  {items.map((n) => (
                    <NotifRow key={n.id} n={n} onOpen={onClickNotif} onRemove={remove} />
                  ))}
                </div>
              ))
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
