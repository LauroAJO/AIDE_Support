// Circular user avatar. Shows the Google photo when available,
// otherwise a solid indigo circle with the user's first initial.
export default function Avatar({ user, size = 36, className = '' }) {
  const dimension = { width: size, height: size };
  const initial = (user?.name || user?.email || '?').trim().charAt(0).toUpperCase();

  if (user?.avatar) {
    return (
      <img
        src={user.avatar}
        alt=""
        style={dimension}
        className={`shrink-0 rounded-full border border-line object-cover ${className}`}
      />
    );
  }

  return (
    <div
      style={{ ...dimension, fontSize: Math.round(size / 2) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-bold leading-none text-white ${className}`}
    >
      {initial}
    </div>
  );
}
