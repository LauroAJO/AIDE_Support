import { getToken } from './auth';

// Thin fetch wrapper that attaches the session token and parses JSON.
// Throws with the response body text on non-2xx so callers can surface errors.
export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
