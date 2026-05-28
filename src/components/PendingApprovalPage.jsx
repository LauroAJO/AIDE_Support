import { Clock } from 'lucide-react';
import { useStore } from '../store';
import { clearToken } from '../lib/auth';
import { apiFetch } from '../lib/api';

// Shown after a successful OAuth callback for a user whose account is
// status='pending'. They have a session row in D1 but no token in the
// browser, so the app cannot make authenticated requests on their behalf
// until the owner approves them.
export default function PendingApprovalPage() {
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);

  const handleLogout = async () => {
    // /api/auth/logout is no-op for pending users (no Authorization header),
    // but we still call it so an owner-approved + re-logged session is cleaned
    // up gracefully. Errors are ignored — clearing the local token is the
    // important part.
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    clearToken();
    setUser(null);
    window.location.href = '/';
  };

  const greeting = user?.name ? `, ${user.name.split(' ')[0]}` : '';

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'radial-gradient(circle at 50% 30%, #EEF2FF, #FAF8F5)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center"
        style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.08)' }}
      >
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10 text-accent">
          <Clock className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold text-ink">Acesso pendente de aprovação</h1>
        <p className="mt-3 text-sm text-ink2">
          Olá{greeting}! Sua conta foi criada e está aguardando aprovação do
          administrador. Você receberá acesso em breve.
        </p>
        <p className="mt-2 text-xs text-muted">
          Quando aprovado, basta entrar novamente com Google para começar.
        </p>
        <button
          onClick={handleLogout}
          className="mt-6 rounded-lg border border-line px-4 py-2 text-sm font-medium text-ink2 transition hover:bg-surface2 hover:text-ink"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
