export const getToken = () => localStorage.getItem('aide_token');
export const setToken = (t) => localStorage.setItem('aide_token', t);
export const clearToken = () => localStorage.removeItem('aide_token');
export const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`
});

// Converts a base64url VAPID public key to the Uint8Array that
// PushManager.subscribe expects as applicationServerKey.
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
