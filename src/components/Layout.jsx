import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  CalendarRange,
  Timer,
  Calendar,
  HardDrive,
  FileText,
  Bell,
  CreditCard,
  LayoutDashboard,
  Search,
  Video,
  Network as NetworkIcon,
  MessageSquare,
  Shield,
  Upload,
  Building2,
  Briefcase,
  Radar,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { useStore } from '../store';
import { clearToken } from '../lib/auth';
import { APP_VERSION } from '../version';
import Avatar from './shared/Avatar';
import TimerIndicator from './timer/TimerIndicator';
import TimerCheckMonitor from './timer/TimerCheckMonitor';
import NotificationBell from './notifications/NotificationBell';

// `feature` matches keys in user.permissions (resolved server-side). Items
// without a `feature` are always visible. Owner always sees everything.
// `badge` chooses which store field drives the red counter pill (if any).
// Nav único e ordenado (sidebar + bottom nav). `feature` = permissão (owner vê
// tudo); `fixed: true` = só owner + assistente fixo. Sem `feature` nem `fixed`
// = sempre visível. Admin/Dashboard/Pagamentos foram movidos para o menu de
// perfil; "Avisos" veio do menu de perfil para a sidebar (v2.3.3).
const NAV_ITEMS = [
  { to: '/tasks',      label: 'Tarefas',      icon: CheckSquare,   feature: 'tasks' },
  { to: '/planning',   label: 'Planejamento', icon: CalendarRange, feature: 'planning' },
  { to: '/timer',      label: 'Timer',        icon: Timer,         feature: 'timer' },
  { to: '/calendar',   label: 'Calendário',   icon: Calendar,      feature: 'calendar' },
  { to: '/drive',      label: 'Drive',        icon: HardDrive,     feature: 'drive' },
  { to: '/notes',      label: 'Notas',        icon: FileText,      feature: 'notes' },
  { to: '/meeting',    label: 'Reunião',      icon: Video,         feature: 'meeting' },
  { to: '/networking', label: 'Networking',   icon: NetworkIcon,   feature: 'networking' },
  { to: '/market',     label: 'Mercado',      icon: Building2,     fixed: true },
  { to: '/career',     label: 'Carreira',     icon: Briefcase,     fixed: true },
  { to: '/chat',       label: 'Chat',         icon: MessageSquare, feature: 'chat', badge: 'chatUnread' },
  { to: '/alerts',     label: 'Avisos',       icon: Bell,          feature: 'alerts' },
  { to: '/hub',        label: 'Hub',          icon: Radar,         fixed: true },
];

const navClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-accent text-white'
      : 'text-ink2 hover:bg-surface2 hover:text-ink'
  }`;

export default function Layout({ children }) {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const userPermissions = useStore((s) => s.userPermissions);
  const pendingUsers = useStore((s) => s.pendingUsers);
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const menuRef = useRef(null);

  const firstName = (user?.name || user?.email || '').split(' ')[0];
  const isOwner = user?.role === 'owner';
  // "Mercado", "Carreira", "Hub" (fixed) — só owner e assistente fixo (mesma regra dos endpoints).
  const canFixed = isOwner || user?.role === 'assistant_fixed' || user?.user_type === 'fixed';
  // Permission-aware nav numa lista única e ordenada: owner vê tudo; itens `fixed`
  // exigem canFixed; itens com `feature` respeitam a permissão; demais sempre visíveis.
  const navItems = NAV_ITEMS.filter((item) => {
    if (item.fixed) return canFixed;
    if (!item.feature) return true;
    if (isOwner) return true;
    const perm = userPermissions && userPermissions[item.feature];
    return !!perm && perm !== 'none';
  });
  const chatUnread = useStore((s) => s.chatUnread);
  const badgeCount = (key) => {
    if (key === 'pendingUsers') return pendingUsers ? pendingUsers.length : 0;
    if (key === 'chatUnread') return chatUnread || 0;
    return 0;
  };

  // Bottom nav (mobile): 4 slots fixos + botão "Mais" que abre um bottom sheet
  // com o restante dos itens. Respeita as permissões (usa navItems já filtrado).
  const MOBILE_PRIMARY = ['/tasks', '/planning', '/timer', '/notes'];
  const primaryNav = MOBILE_PRIMARY
    .map((to) => navItems.find((it) => it.to === to))
    .filter(Boolean);
  const moreNav = navItems.filter((it) => !MOBILE_PRIMARY.includes(it.to));
  // Badge agregado no botão "Mais" (preserva o indicador de não-lidas do Chat,
  // que agora fica dentro do bottom sheet no mobile).
  const moreBadgeCount = moreNav.reduce((sum, it) => sum + (it.badge ? badgeCount(it.badge) : 0), 0);

  const handleLogout = () => {
    clearToken();
    setUser(null);
    setMenuOpen(false);
    navigate('/');
  };

  const go = (path) => {
    setMenuOpen(false);
    navigate(path);
  };

  // Close dropdowns when clicking outside of them.
  useEffect(() => {
    function onDocClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="flex h-screen flex-col bg-base text-ink">
      {/* Header */}
      <header className="relative flex h-14 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        {/* LEFT — app name + version */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-accent">Aide</span>
          <span className="text-[11px] font-medium text-muted">v{APP_VERSION}</span>
        </div>

        {/* CENTER — timer (mobile only) */}
        <div className="absolute left-1/2 block -translate-x-1/2 md:hidden">
          <TimerIndicator variant="header" />
        </div>

        {/* CENTER — search bar (desktop) */}
        <div
          className="absolute left-1/2 hidden -translate-x-1/2 md:flex"
          style={{ width: 320, maxWidth: '40vw' }}
        >
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Buscar tarefas, notas, projetos..."
              className="h-9 w-full rounded-lg border border-line bg-surface2 pl-9 pr-12 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:shadow-[0_0_0_3px_rgba(99,102,241,0.12)]"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded bg-line px-1.5 py-0.5 text-[11px] text-muted">
              ⌘K
            </span>
          </div>
        </div>

        {/* RIGHT — bell, avatar/name, sair */}
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <NotificationBell />

          {/* Avatar + first name + profile dropdown */}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-md p-0.5 transition hover:bg-surface2"
            >
              <Avatar user={user} size={36} />
              <span className="hidden text-sm font-medium text-ink sm:inline">
                {firstName}
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-12 w-[200px] overflow-hidden rounded-lg border border-line bg-surface shadow-soft">
                <div className="px-3 py-3 text-xs text-ink2">
                  {user?.name || user?.email}
                </div>
                <div className="border-t border-line" />
                <button
                  type="button"
                  onClick={() => go('/profile')}
                  className="block w-full px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  Meu Perfil
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => go('/admin')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="flex-1">Admin</span>
                    {badgeCount('pendingUsers') > 0 && (
                      <span className="h-2 w-2 rounded-full bg-danger" title="Aprovações pendentes" />
                    )}
                  </button>
                )}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => go('/dashboard')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Dashboard
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => go('/payment')}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  <CreditCard className="h-4 w-4" />
                  Pagamentos
                </button>
                <button
                  type="button"
                  onClick={() => go('/settings')}
                  className="block w-full px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  Configurações
                </button>
                {(user?.role === 'owner' || user?.user_type === 'fixed') && (
                  <button
                    type="button"
                    onClick={() => go('/import')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                  >
                    <Upload className="h-4 w-4" />
                    Importar Dados
                  </button>
                )}
                <div className="border-t border-line" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="block w-full px-3 py-2.5 text-left text-sm text-danger transition hover:bg-surface2"
                >
                  Sair
                </button>
              </div>
            )}
          </div>

          {/* Sair text button */}
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs font-medium text-danger transition hover:opacity-80"
          >
            Sair
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Sidebar (desktop) */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-3 md:flex">
          <div className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const count = item.badge ? badgeCount(item.badge) : 0;
              return (
                <NavLink key={item.to} to={item.to} className={navClass}>
                  <Icon className="h-5 w-5" />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {count}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>

          {/* Spacer pushes the timer + Settings to the bottom */}
          <div className="flex-1" />

          {/* Functional timer (counts up while an entry is active) */}
          <TimerIndicator />
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1 overflow-auto bg-base p-6 pb-20 md:pb-6">
          {children}
        </main>
      </div>

      {/* Global modals — must live outside both TimerIndicator mounts so the
          30-min check only fires once on desktop. */}
      <TimerCheckMonitor />

      {/* Bottom nav (mobile) — 5 slots fixos: 4 principais + "Mais". */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-stretch border-t border-line bg-surface md:hidden">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const count = item.badge ? badgeCount(item.badge) : 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `relative flex flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] transition ${
                  isActive ? 'text-accent' : 'text-ink2'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {item.label}
              {count > 0 && (
                <span className="absolute right-2 top-1 rounded-full bg-danger px-1 py-0 text-[9px] font-semibold leading-tight text-white">
                  {count}
                </span>
              )}
            </NavLink>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="relative flex flex-1 flex-col items-center justify-center gap-1 px-2 text-[10px] text-ink2 transition"
        >
          <MoreHorizontal className="h-5 w-5" />
          Mais
          {moreBadgeCount > 0 && (
            <span className="absolute right-2 top-1 rounded-full bg-danger px-1 py-0 text-[9px] font-semibold leading-tight text-white">
              {moreBadgeCount}
            </span>
          )}
        </button>
      </nav>

      {/* Bottom sheet "Mais" (mobile) — grade com o restante da navegação. */}
      {moreOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/30 md:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface p-4 pb-6 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-bold text-ink">Menu</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-md p-1 text-ink2 transition hover:bg-surface2"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreNav.map((item) => {
                const Icon = item.icon;
                const count = item.badge ? badgeCount(item.badge) : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `relative flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-3 text-center text-xs transition ${
                        isActive ? 'bg-accent text-white' : 'text-ink2 hover:bg-surface2'
                      }`
                    }
                  >
                    <Icon className="h-6 w-6" />
                    <span>{item.label}</span>
                    {count > 0 && (
                      <span className="absolute right-1 top-1 rounded-full bg-danger px-1 py-0 text-[9px] font-semibold leading-tight text-white">
                        {count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
