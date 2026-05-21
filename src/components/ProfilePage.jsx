import { useStore } from '../store';
import Avatar from './shared/Avatar';

const ROLE_LABELS = {
  owner: 'Proprietário',
  assistant: 'Assistente',
};

export default function ProfilePage() {
  const user = useStore((s) => s.user);

  if (!user) return null;

  const roleLabel = ROLE_LABELS[user.role] || user.role || '—';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <Avatar user={user} size={80} />
      <div>
        <h1 className="text-2xl font-bold text-ink">{user.name || '—'}</h1>
        <p className="mt-1 text-sm text-ink2">{user.email}</p>
        <p className="mt-2 inline-block rounded-full bg-surface2 px-3 py-1 text-xs font-medium text-ink2">
          {roleLabel}
        </p>
      </div>
    </div>
  );
}
