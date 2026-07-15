import { Fragment, useEffect, useRef, useState } from 'react';
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
  GitMerge,
  Building2,
  Briefcase,
  CalendarDays,
  Mail,
  Radar,
  MoreHorizontal,
  X,
  User,
  Settings,
  LogOut,
} from 'lucide-react';
import { useStore } from '../store';
import { clearToken } from '../lib/auth';
import { apiFetch } from '../lib/api';
import { APP_VERSION } from '../version';
import Avatar from './shared/Avatar';
import TimerIndicator from './timer/TimerIndicator';
import TimerCheckMonitor from './timer/TimerCheckMonitor';
import NotificationBell from './notifications/NotificationBell';

// Nav único e ordenado (sidebar + bottom nav). `feature` = permissão (owner vê
// tudo); `fixed: true` = só owner + assistente fixo. `group` agrupa visualmente
// a sidebar em quatro seções (Trabalho / Conteúdo / Rede Profissional /
// Ferramentas). O widget de start/stop do Timer (TimerIndicator) permanece na
// sidebar/header — o LINK de Timer vive no menu de perfil.
const NAV_ITEMS = [
  { to: '/tasks',      label: 'Tarefas',      icon: CheckSquare,   feature: 'tasks',      group: 'trabalho' },
  { to: '/planning',   label: 'Planejamento', icon: CalendarRange, feature: 'planning',   group: 'trabalho' },
  { to: '/notes',      label: 'Notas',        icon: FileText,      feature: 'notes',      group: 'conteudo' },
  { to: '/calendar',   label: 'Calendário',   icon: Calendar,      feature: 'calendar',   group: 'conteudo' },
  { to: '/meeting',    label: 'Reunião',      icon: Video,         feature: 'meeting',    group: 'conteudo' },
  { to: '/drive',      label: 'Drive',        icon: HardDrive,     feature: 'drive',      group: 'conteudo' },
  { to: '/networking', label: 'Contatos-Networking', shortLabel: 'Contatos', icon: NetworkIcon, feature: 'networking', group: 'rede' },
  { to: '/market',     label: 'Mercado',      icon: Building2,     fixed: true,           group: 'rede' },
  { to: '/career',     label: 'Carreira',     icon: Briefcase,     fixed: true,           group: 'rede' },
  { to: '/events',     label: 'Eventos & Venues', shortLabel: 'Eventos', icon: CalendarDays, fixed: true,   group: 'rede' },
  { to: '/gmail',      label: 'LCEStech Email', shortLabel: 'Email', icon: Mail,          group: 'rede' },
  { to: '/hub',        label: 'Scraping Hub', icon: Radar,         fixed: true,           group: 'ferramentas' },
  { to: '/chat',       label: 'Chat',         icon: MessageSquare, feature: 'chat', badge: 'chatUnread', group: 'chat' },
];

// Fundo (estado NÃO-ativo) de cada grupo. Cada troca de `group` desenha um
// divisor na sidebar. v2.3.6: rótulos de grupo removidos — só divisores + fundos.
// Cores exatas: Trabalho #EFF6FF (blue-50) · Conteúdo #F0FDF4 (green-50) · Rede
// #EEF2FF (indigo-50) · Ferramentas/Chat #F9FAFB (gray-50). Classes literais
// completas para o JIT do Tailwind detectá-las. `chat` = mesmo cinza que
// `ferramentas`, num grupo próprio só para inserir o divisor entre Scraping Hub
// e Chat.
const GROUP_META = {
  trabalho:    { bg: 'bg-blue-50 hover:bg-blue-100' },
  conteudo:    { bg: 'bg-green-50 hover:bg-green-100' },
  rede:        { bg: 'bg-indigo-50 hover:bg-indigo-100' },
  ferramentas: { bg: 'bg-gray-50 hover:bg-gray-100' },
  chat:        { bg: 'bg-gray-50 hover:bg-gray-100' },
};

// `groupBg` pinta o item com o fundo do seu grupo quando NÃO ativo; o estilo
// ativo (índigo cheio) tem prioridade.
const navClass = (groupBg) => ({ isActive }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-accent text-white'
      : groupBg
        ? `${groupBg} text-ink2 hover:text-ink`
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
  const [bridgePending, setBridgePending] = useState(0);
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
  // '/timer' saiu da nav (virou item do menu de perfil); Calendário assume o slot.
  const MOBILE_PRIMARY = ['/tasks', '/planning', '/calendar', '/notes'];
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

  // Owner-only: quantas tarefas do Lifegame aguardam revisão (badge no menu).
  useEffect(() => {
    if (!isOwner) return;
    apiFetch('/api/bridge/staging/count')
      .then((r) => setBridgePending((r && r.pending) || 0))
      .catch(() => {});
  }, [isOwner]);

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
                {/* Meu Perfil — todos */}
                <button
                  type="button"
                  onClick={() => go('/profile')}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  <User className="h-4 w-4" />
                  <span className="flex-1">Meu Perfil</span>
                </button>
                {/* Admin — owner, com badge de pendências */}
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
                {/* Dashboard — owner */}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => go('/dashboard')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    <span className="flex-1">Dashboard</span>
                  </button>
                )}
                {/* Timer — todos (só o LINK; o widget start/stop segue na sidebar/header) */}
                <button
                  type="button"
                  onClick={() => go('/timer')}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  <Timer className="h-4 w-4" />
                  <span className="flex-1">Timer</span>
                </button>
                {/* Pagamentos — todos */}
                <button
                  type="button"
                  onClick={() => go('/payment')}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  <CreditCard className="h-4 w-4" />
                  <span className="flex-1">Pagamentos</span>
                </button>
                {/* Avisos — todos */}
                <button
                  type="button"
                  onClick={() => go('/alerts')}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  <Bell className="h-4 w-4" />
                  <span className="flex-1">Avisos</span>
                </button>
                {/* Configurações — owner only */}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => go('/settings')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="flex-1">Configurações</span>
                  </button>
                )}
                {/* Importar Dados — todos (owner + fixo + externo) */}
                <button
                  type="button"
                  onClick={() => go('/import')}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                >
                  <Upload className="h-4 w-4" />
                  <span className="flex-1">Importar Dados</span>
                </button>
                {/* Revisar Bridge — owner only, com badge de pendências */}
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => go('/bridge/staging')}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-ink transition hover:bg-surface2"
                  >
                    <GitMerge className="h-4 w-4" />
                    <span className="flex-1">Revisar Bridge</span>
                    {bridgePending > 0 && (
                      <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                        {bridgePending}
                      </span>
                    )}
                  </button>
                )}
                <div className="border-t border-line" />
                {/* Sair — todos */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-danger transition hover:bg-surface2"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="flex-1">Sair</span>
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
            {navItems.map((item, i) => {
              const Icon = item.icon;
              const count = item.badge ? badgeCount(item.badge) : 0;
              const meta = GROUP_META[item.group] || null;
              const prev = navItems[i - 1];
              // Cada troca de `group` desenha um divisor (v2.3.6: sem rótulos).
              // O divisor de abertura de um grupo faz as vezes de "divisor abaixo"
              // do anterior — sem linhas duplicadas; após o último item (Chat) não
              // há divisor.
              const startsGroup = !prev || prev.group !== item.group;
              return (
                <Fragment key={item.to}>
                  {startsGroup && meta && (
                    <div className="mt-2 border-t border-[#E8E3DB]" />
                  )}
                  <NavLink to={item.to} className={navClass(meta ? meta.bg : '')}>
                    <Icon className="h-5 w-5" />
                    <span className="flex-1">{item.label}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {count}
                      </span>
                    )}
                  </NavLink>
                </Fragment>
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
                    <span>{item.shortLabel || item.label}</span>
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
