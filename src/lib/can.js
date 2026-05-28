// Boolean gate for granular per-action permissions (v2.1).
// `granular` is null for the owner (everything allowed), or a flat
// `{ "feature.action": boolean }` map for everyone else. `undefined`
// is treated as "not yet loaded" — return true so the UI doesn't flash
// disabled state during bootstrap.
export function canDo(granular, feature, action) {
  if (granular === null || granular === undefined) return true;
  return !!granular[`${feature}.${action}`];
}
