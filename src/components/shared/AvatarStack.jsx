import Avatar from './Avatar';

// v2.25.19 — pilha de avatares sobrepostos para tarefas com vários
// responsáveis. Mostra até `max` pessoas e resume o resto num badge "+N".
// A ordem vem de taskAssignees(): principal primeiro, co-responsáveis depois.
export default function AvatarStack({ users = [], size = 18, max = 3, className = '' }) {
  if (!users.length) return null;
  const shown = users.slice(0, max);
  const rest = users.length - shown.length;
  return (
    <div className={`flex items-center ${className}`} title={users.map((u) => u.name).filter(Boolean).join(' · ')}>
      {shown.map((u, i) => (
        <div key={u.id} style={{ marginLeft: i === 0 ? 0 : -size / 3 }} className="rounded-full ring-2 ring-surface">
          <Avatar user={u} size={size} />
        </div>
      ))}
      {rest > 0 && (
        <div
          style={{ width: size, height: size, marginLeft: -size / 3, fontSize: Math.round(size / 2.2) }}
          className="flex items-center justify-center rounded-full bg-surface2 font-bold leading-none text-ink2 ring-2 ring-surface"
        >
          +{rest}
        </div>
      )}
    </div>
  );
}
