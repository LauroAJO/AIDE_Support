import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Shield, Settings as SettingsIcon, Archive, RotateCcw } from 'lucide-react';
import { useStore } from '../../store';
import { apiFetch } from '../../lib/api';
import Avatar from '../shared/Avatar';
import LoadingSpinner from '../shared/LoadingSpinner';
import PermissionsModal from './PermissionsModal';

const ROLE_LABEL = {
  owner: 'Owner',
  assistant_fixed: 'Assistente Fixo',
  assistant_external: 'Assistente Externo',
  pending: 'Pendente',
};

const PRESET_LABEL = {
  preset_fixed: 'Fixo',
  preset_external: 'Externo',
};

function formatLastSeen(unix) {
  if (!unix) return '—';
  const d = new Date(unix * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminPage() {
  const user = useStore((s) => s.user);
  const allUsers = useStore((s) => s.allUsers);
  const setAllUsers = useStore((s) => s.setAllUsers);
  const pendingUsers = useStore((s) => s.pendingUsers);
  const setPendingUsers = useStore((s) => s.setPendingUsers);

  const [loading, setLoading] = useState(true);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [permsTarget, setPermsTarget] = useState(null);
  // Per-pending-user pick: 'fixed' | 'external'. Defaults to 'fixed' (the
  // friendlier choice — owner can always change later).
  const [pendingType, setPendingType] = useState({});
  const [busyId, setBusyId] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const [all, pending] = await Promise.all([
        apiFetch('/api/users/all').catch(() => []),
        apiFetch('/api/users/pending').catch(() => []),
      ]);
      setAllUsers(all || []);
      setPendingUsers(pending || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const activeUsers = useMemo(
    () => (allUsers || []).filter((u) => (u.status || 'active') === 'active'),
    [allUsers]
  );
  const archivedUsers = useMemo(
    () => (allUsers || []).filter((u) => u.status === 'archived'),
    [allUsers]
  );

  // Approve a pending user: first updates the role + user_type, then flips
  // the status to active (which also seeds the default permission preset
  // server-side).
  const approve = async (target) => {
    const userType = pendingType[target.id] || 'fixed';
    const newRole = userType === 'fixed' ? 'assistant_fixed' : 'assistant_external';
    setBusyId(target.id);
    try {
      await apiFetch(`/api/users/${target.id}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role: newRole, user_type: userType }),
      });
      await apiFetch(`/api/users/${target.id}/approve`, { method: 'PUT' });
      await refresh();
    } catch (e) {
      alert(`Falha ao aprovar: ${String((e && e.message) || e).slice(0, 200)}`);
    } finally {
      setBusyId(null);
    }
  };

  const refuse = async (target) => {
    if (!window.confirm(`Recusar ${target.name || target.email}? A conta será arquivada.`)) return;
    setBusyId(target.id);
    try {
      await apiFetch(`/api/users/${target.id}/archive`, { method: 'PUT' });
      await refresh();
    } catch (e) {
      alert(`Falha ao recusar: ${String((e && e.message) || e).slice(0, 200)}`);
    } finally {
      setBusyId(null);
    }
  };

  const archive = async (target) => {
    if (target.id === user.id) {
      alert('Você não pode arquivar a si mesmo.');
      return;
    }
    if (!window.confirm(`Arquivar ${target.name || target.email}? Sessões serão encerradas.`)) return;
    setBusyId(target.id);
    try {
      await apiFetch(`/api/users/${target.id}/archive`, { method: 'PUT' });
      await refresh();
    } catch (e) {
      alert(`Falha ao arquivar: ${String((e && e.message) || e).slice(0, 200)}`);
    } finally {
      setBusyId(null);
    }
  };

  // Reactivate uses /api/users/:id/approve, which sets status='active' and
  // (re)binds the default preset. Sessions remain wiped — the user must
  // sign back in via Google.
  const reactivate = async (target) => {
    if (!window.confirm(`Reativar ${target.name || target.email}?`)) return;
    setBusyId(target.id);
    try {
      await apiFetch(`/api/users/${target.id}/approve`, { method: 'PUT' });
      await refresh();
    } catch (e) {
      alert(`Falha ao reativar: ${String((e && e.message) || e).slice(0, 200)}`);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="h-full"><LoadingSpinner label="Carregando equipe..." /></div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-accent" />
        <h1 className="text-2xl font-bold text-ink">Administração</h1>
      </div>

      {/* SECTION 1 — Pending users */}
      {pendingUsers.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-ink">Usuários pendentes</h2>
            <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
              {pendingUsers.length}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {pendingUsers.map((p) => {
              const chosen = pendingType[p.id] || 'fixed';
              return (
                <div
                  key={p.id}
                  className="space-y-3 rounded-xl border border-line bg-surface p-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar user={p} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-ink">{p.name || '(sem nome)'}</div>
                      <div className="truncate text-xs text-ink2">{p.email}</div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-ink2">Tipo de acesso:</div>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 text-sm text-ink">
                        <input
                          type="radio"
                          name={`type-${p.id}`}
                          checked={chosen === 'fixed'}
                          onChange={() => setPendingType((m) => ({ ...m, [p.id]: 'fixed' }))}
                        />
                        Fixo
                      </label>
                      <label className="flex items-center gap-1.5 text-sm text-ink">
                        <input
                          type="radio"
                          name={`type-${p.id}`}
                          checked={chosen === 'external'}
                          onChange={() => setPendingType((m) => ({ ...m, [p.id]: 'external' }))}
                        />
                        Externo
                      </label>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => approve(p)}
                      disabled={busyId === p.id}
                      className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
                    >
                      ✅ Aprovar
                    </button>
                    <button
                      onClick={() => refuse(p)}
                      disabled={busyId === p.id}
                      className="flex-1 rounded-lg border border-danger/40 px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10 disabled:opacity-60"
                    >
                      ❌ Recusar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 2 — Active team */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-ink">Equipe ativa</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-3 py-2 font-medium">Avatar</th>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Tipo</th>
                <th className="px-3 py-2 font-medium">Preset</th>
                <th className="px-3 py-2 font-medium">Último acesso</th>
                <th className="px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {activeUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted">
                    Ninguém ativo ainda.
                  </td>
                </tr>
              ) : (
                activeUsers.map((u) => (
                  <tr key={u.id} className="border-b border-line/60">
                    <td className="px-3 py-2"><Avatar user={u} size={32} /></td>
                    <td className="px-3 py-2 text-ink">{u.display_name || u.name || '—'}</td>
                    <td className="px-3 py-2 text-ink2">{u.email}</td>
                    <td className="px-3 py-2 text-ink2">{ROLE_LABEL[u.role] || u.role}</td>
                    <td className="px-3 py-2 text-ink2">{PRESET_LABEL[u.preset_id] || (u.preset_id ? u.preset_id : '—')}</td>
                    <td className="px-3 py-2 text-ink2">{formatLastSeen(u.last_seen_at)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setPermsTarget(u)}
                          disabled={u.role === 'owner'}
                          title={u.role === 'owner' ? 'Owner sempre tem acesso completo' : 'Editar permissões'}
                          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-ink2 hover:bg-surface2 disabled:opacity-40"
                        >
                          <SettingsIcon className="h-3 w-3" /> Permissões
                        </button>
                        <button
                          onClick={() => archive(u)}
                          disabled={busyId === u.id || u.id === user.id}
                          title={u.id === user.id ? 'Você não pode arquivar a si mesmo' : 'Arquivar usuário'}
                          className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-40"
                        >
                          <Archive className="h-3 w-3" /> Arquivar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* SECTION 3 — Archived users (collapsible) */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setArchivedOpen((v) => !v)}
          className="flex items-center gap-2 text-lg font-bold text-ink hover:text-accent"
        >
          {archivedOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          Arquivados <span className="text-xs font-normal text-muted">({archivedUsers.length})</span>
        </button>
        {archivedOpen && (
          <div className="space-y-2">
            {archivedUsers.length === 0 ? (
              <p className="rounded-lg border border-line bg-surface px-3 py-3 text-sm text-muted">
                Ninguém arquivado.
              </p>
            ) : (
              archivedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar user={u} size={36} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-ink">{u.name || '(sem nome)'}</div>
                      <div className="truncate text-xs text-ink2">{u.email}</div>
                      <div className="text-[11px] text-muted">
                        {ROLE_LABEL[u.role] || u.role}
                        {u.archived_at && <> · Arquivado em {formatLastSeen(u.archived_at)}</>}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => reactivate(u)}
                    disabled={busyId === u.id}
                    className="flex items-center gap-1 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 disabled:opacity-60"
                  >
                    <RotateCcw className="h-3 w-3" /> Reativar
                  </button>
                </div>
              ))
            )}
            <p className="text-[11px] text-muted">
              Stats detalhadas (tarefas, horas, valores pagos) ficam preservadas em
              <code className="mx-1 rounded bg-surface2 px-1">user_profiles_archive</code>
              e podem ser consultadas em relatórios futuros.
            </p>
          </div>
        )}
      </section>

      {permsTarget && (
        <PermissionsModal
          user={permsTarget}
          onClose={() => setPermsTarget(null)}
          onSaved={() => { setPermsTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}
