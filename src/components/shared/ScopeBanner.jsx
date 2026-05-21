import { ShieldAlert } from 'lucide-react';

// Shown when a Google API call returns 403 (missing scope) or the grant was
// revoked. "Autorizar" re-runs the OAuth flow, which now requests the
// Calendar/Drive scopes.
export default function ScopeBanner({ message }) {
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm"
      style={{ background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.3)' }}
    >
      <span className="flex items-center gap-2 text-ink">
        <ShieldAlert className="h-4 w-4 text-accent" />
        {message}
      </span>
      <button
        onClick={() => {
          window.location.href = '/api/auth/google';
        }}
        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-hover"
      >
        Autorizar
      </button>
    </div>
  );
}

// Helper: does a thrown apiFetch error indicate a scope/reauth problem?
export function isAuthScopeError(err) {
  const m = String(err?.message || '');
  return m.includes('scope_required') || m.includes('reauth_required');
}
