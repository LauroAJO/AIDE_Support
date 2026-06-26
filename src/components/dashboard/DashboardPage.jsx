import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer, CheckCircle2, AlertTriangle, CalendarClock, Briefcase, Phone, FileText } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import { formatHMS } from '../../lib/time';
import { formatDate } from '../../lib/tasks';
import { TRACK_LABELS, trackColor, OPP_STATUS_LABELS } from '../career/careerShared';
import LoadingSpinner from '../shared/LoadingSpinner';

function lastSeen(unix) {
  if (!unix) return 'nunca';
  const s = Math.floor(Date.now() / 1000) - unix;
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)} dias`;
}
function daysBetween(dateStr, ref) {
  return Math.round((new Date(`${dateStr}T00:00:00`) - ref) / 86400000);
}

export default function DashboardPage() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();

  const [aliceTimer, setAliceTimer] = useState(null);
  const [alice, setAlice] = useState(null);
  const [completedToday, setCompletedToday] = useState([]);
  const [allTasks, setAllTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Etapa 6 — dados de Carreira/Mercado para a seção "Status da Busca".
  const [careerOpps, setCareerOpps] = useState([]);
  const [marketContacts, setMarketContacts] = useState([]);
  const [careerDocs, setCareerDocs] = useState([]);

  const loadTimer = async () => {
    try {
      setAliceTimer(await apiFetch('/api/dashboard/alice-timer'));
    } catch {
      /* ignore */
    }
  };

  const loadAll = async () => {
    try {
      const [timer, users, completed, tasks, opps, contacts, docs] = await Promise.all([
        apiFetch('/api/dashboard/alice-timer'),
        apiFetch('/api/users'),
        apiFetch('/api/tasks?completed_today=true'),
        apiFetch('/api/tasks'),
        apiFetch('/api/career/opportunities').catch(() => []),
        apiFetch('/api/market/contacts').catch(() => []),
        apiFetch('/api/career/documents').catch(() => []),
      ]);
      setAliceTimer(timer);
      setAlice(users.find((u) => u.role === 'assistant_fixed' || u.role === 'assistant') || null);
      setCompletedToday(completed);
      setAllTasks(tasks);
      setCareerOpps(opps || []);
      setMarketContacts(contacts || []);
      setCareerDocs(docs || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const iv = setInterval(loadTimer, 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Owner-only guard (after all hooks to satisfy the Rules of Hooks).
  if (user && user.role !== 'owner') {
    return <div className="flex h-full items-center justify-center text-sm text-muted">Acesso restrito ao proprietário.</div>;
  }

  if (loading) return <div className="h-full"><LoadingSpinner label="Carregando dashboard..." /></div>;

  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];
  const overdue = allTasks
    .filter((t) => t.status !== 'done' && t.due_date && t.due_date < todayIso)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const upcoming = allTasks
    .filter((t) => t.status !== 'done' && t.due_date && t.due_date >= todayIso && t.due_date <= in7)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  // --- Status da Busca (Etapa 6) ---
  const activeOpps = careerOpps.filter((o) => !['rejected', 'closed'].includes(o.status));
  // Totais por trilha e por status.
  const trackCounts = { phd: 0, job: 0, spinoff: 0 };
  const statusCounts = {};
  activeOpps.forEach((o) => {
    if (trackCounts[o.track] !== undefined) trackCounts[o.track] += 1;
    statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
  });
  // 3 deadlines mais urgentes (inclui vencidas), ignorando encerradas.
  const nextDeadlines = careerOpps
    .filter((o) => o.deadline && !['rejected', 'closed'].includes(o.status))
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 3);
  // Contatos a fazer esta semana: next_action_date preenchido e <= +7 dias.
  const contactsThisWeek = marketContacts
    .filter((c) => c.next_action_date && c.next_action_date <= in7)
    .sort((a, b) => a.next_action_date.localeCompare(b.next_action_date));
  // Documentos pendentes: sem link do Drive (ainda não anexados).
  const pendingDocs = careerDocs.filter((d) => !d.drive_link);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold text-ink">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Alice status */}
        <Panel title="Status da Alice" icon={Timer}>
          {aliceTimer?.active ? (
            <div>
              <div className="text-sm text-ink">{aliceTimer.taskTitle}</div>
              <div className="font-mono text-2xl font-bold text-accent">{formatHMS(aliceTimer.elapsedSeconds)}</div>
            </div>
          ) : (
            <p className="text-sm text-muted">Alice não está com timer ativo</p>
          )}
          <p className="mt-2 text-xs text-ink2">Vista {lastSeen(alice?.last_seen_at)}</p>
        </Panel>

        {/* Completed today */}
        <Panel title="Concluídas hoje" icon={CheckCircle2}>
          {completedToday.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma tarefa concluída hoje.</p>
          ) : (
            <ul className="space-y-1">
              {completedToday.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-ink">{t.title}</span>
                  <span className="ml-2 shrink-0 text-muted">{t.assignedUser?.name || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Overdue */}
        <Panel title="Em atraso" icon={AlertTriangle} iconColor="#EF4444">
          {overdue.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma tarefa em atraso. 🎉</p>
          ) : (
            <ul className="space-y-1">
              {overdue.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-xs">
                  <button onClick={() => navigate('/tasks')} className="truncate text-left text-ink hover:text-accent">{t.title}</button>
                  <span className="ml-2 shrink-0 font-medium" style={{ color: '#EF4444' }}>
                    {Math.abs(daysBetween(t.due_date, today))}d atraso
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Upcoming */}
        <Panel title="Próximos prazos (7 dias)" icon={CalendarClock}>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted">Nada nos próximos 7 dias.</p>
          ) : (
            <ul className="space-y-1">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-center justify-between text-xs">
                  <button onClick={() => navigate('/tasks')} className="truncate text-left text-ink hover:text-accent">{t.title}</button>
                  <span className="ml-2 shrink-0 text-ink2">{formatDate(t.due_date)} · {daysBetween(t.due_date, today)}d</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Status da Busca (Carreira) — Etapa 6 */}
      <h2 className="flex items-center gap-2 pt-2 text-lg font-bold text-ink">
        <Briefcase className="h-5 w-5 text-accent" /> Status da Busca
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Oportunidades por trilha e status */}
        <Panel title="Oportunidades ativas" icon={Briefcase}>
          {activeOpps.length === 0 ? (
            <p className="text-sm text-muted">Nenhuma oportunidade ativa.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {['phd', 'job', 'spinoff'].map((tr) => {
                  const c = trackColor(tr);
                  return (
                    <button
                      key={tr}
                      type="button"
                      onClick={() => navigate('/career')}
                      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium"
                      style={{ backgroundColor: `${c.hex}1A`, color: c.hex }}
                    >
                      {TRACK_LABELS[tr]}: <span className="font-bold">{trackCounts[tr]}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(statusCounts).map(([st, n]) => (
                  <span key={st} className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-ink2">
                    {OPP_STATUS_LABELS[st] || st}: {n}
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>

        {/* Próximas deadlines (3 mais urgentes) */}
        <Panel title="Próximas deadlines" icon={CalendarClock}>
          {nextDeadlines.length === 0 ? (
            <p className="text-sm text-muted">Sem prazos próximos.</p>
          ) : (
            <ul className="space-y-1">
              {nextDeadlines.map((o) => {
                const d = daysBetween(o.deadline.length === 7 ? `${o.deadline}-01` : o.deadline, today);
                const late = d < 0;
                return (
                  <li key={o.id} className="flex items-center justify-between text-xs">
                    <button onClick={() => navigate('/career')} className="truncate text-left text-ink hover:text-accent">{o.title}</button>
                    <span className={`ml-2 shrink-0 font-medium ${late || d < 14 ? 'text-red-600' : 'text-ink2'}`}>
                      {o.deadline}{late ? ` · ${-d}d atrás` : ` · ${d}d`}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Contatos a fazer esta semana */}
        <Panel title="Contatos esta semana" icon={Phone}>
          {contactsThisWeek.length === 0 ? (
            <p className="text-sm text-muted">Nenhum contato agendado para os próximos 7 dias.</p>
          ) : (
            <ul className="space-y-1">
              {contactsThisWeek.map((c) => (
                <li key={c.person_id} className="flex items-center justify-between text-xs">
                  <button onClick={() => navigate('/market', { state: { contactId: c.person_id } })} className="truncate text-left text-ink hover:text-accent">
                    {c.person_name || '—'}{c.next_action ? ` · ${c.next_action}` : ''}
                  </button>
                  <span className="ml-2 shrink-0 text-ink2">{c.next_action_date}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Documentos pendentes */}
        <Panel title="Documentos pendentes" icon={FileText}>
          {pendingDocs.length === 0 ? (
            <p className="text-sm text-muted">Nenhum documento pendente.</p>
          ) : (
            <ul className="space-y-1">
              {pendingDocs.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-xs">
                  <button onClick={() => navigate('/career')} className="truncate text-left text-ink hover:text-accent">{d.title}</button>
                  <span className="ml-2 shrink-0 text-muted">{d.version}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, icon: Icon, iconColor, children }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink">
        <Icon className="h-4 w-4" style={{ color: iconColor || '#6366f1' }} />
        {title}
      </h2>
      {children}
    </div>
  );
}
