import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  CheckSquare,
  CalendarRange,
  Timer,
  Calendar,
  HardDrive,
  StickyNote,
  Bell,
  Search,
} from 'lucide-react';
import { useStore } from '../store';
import { clearToken } from '../lib/auth';
import { APP_VERSION } from '../version';
import Avatar from './shared/Avatar';
import TimerIndicator from './timer/TimerIndicator';

const NAV_ITEMS = [
  { to: '/tasks', label: 'Tarefas', icon: CheckSquare },
  { to: '/planning', label: 'Planejamento', icon: CalendarRange },
  { to: '/timer', label: 'Timer', icon: Timer },
  { to: '/calendar', label: 'Calendário', icon: Calendar },
  { to: '/drive', label: 'Drive', icon: HardDrive },
  { to: '/notes', label: 'Notas', icon: StickyNote },
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
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const firstName = (user?.name || user?.email || '').split(' ')[0];

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
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
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
          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="flex items-center rounded-md p-1.5 text-ink2 transition hover:bg-surface2 hover:text-ink"
              aria-label="Notificações"
            >
              <Bell className="h-5 w-5" />
            </button>
            {notifOpen && (
              <div className="absolute right-0 top-12 w-56 rounded-lg border border-line bg-surface p-4 text-center text-sm text-ink2 shadow-soft">
                Sem notificações
              </div>
            )}
          </div>

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
                <button
                  type="button"
                  onClick={() => go('/settings')}
                  className="block w-full px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  Configurações
                </button>
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
            {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={navClass}>
                <Icon className="h-5 w-5" />
                {label}
              </NavLink>
            ))}
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

      {/* Bottom nav (mobile) */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex h-16 items-stretch border-t border-line bg-surface md:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 text-[10px] transition ${
                isActive ? 'text-accent' : 'text-ink2'
              }`
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
