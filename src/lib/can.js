// Boolean gate for granular per-action permissions (v2.1).
// `granular` is null for the owner (everything allowed), or a flat
// `{ "feature.action": boolean }` map for everyone else. `undefined`
// is treated as "not yet loaded" — return true so the UI doesn't flash
// disabled state during bootstrap.
export function canDo(granular, feature, action) {
  // Timer is a universal feature — always available to every logged-in user
  // (it has no rows in the granular grid). Mirrors the worker's canDo.
  if (feature === 'timer') return true;
  if (granular === null || granular === undefined) return true;
  return !!granular[`${feature}.${action}`];
}
