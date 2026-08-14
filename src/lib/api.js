import { getToken } from './auth';

// ─── In-memory API log (debug panel) ───────────────────────────────────────
// Every call through apiFetch is recorded here (last 50), so the 🐛 debug
// panel (src/components/DebugPanel.jsx) can show what happened without
// needing devtools — useful on the installed PWA where there's no console.
// Ported from the same pattern in Birdie Bear Entertainment (src/lib/api.js).
const LOG_MAX = 50;
const apiLog = [];
const subscribers = new Set();

function pushLog(entry) {
  apiLog.push(entry);
  if (apiLog.length > LOG_MAX) apiLog.shift();
  try { window.__aideApiLog = apiLog; } catch {}
  subscribers.forEach((fn) => { try { fn(); } catch {} });
}

export function getApiLog() {
  return apiLog.slice();
}

export function subscribeApiLog(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function clearApiLog() {
  apiLog.length = 0;
  try { window.__aideApiLog = apiLog; } catch {}
  subscribers.forEach((fn) => { try { fn(); } catch {} });
}

// Thin fetch wrapper that attaches the session token and parses JSON.
// Throws with the response body text on non-2xx so callers can surface errors.
export async function apiFetch(path, options = {}) {
  const token = getToken();
  const method = options.method || 'GET';
  const startedAt = Date.now();
  const at = new Date().toISOString();

  let res;
  try {
    res = await fetch(path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
  } catch (e) {
    // fetch() itself threw — network down, CORS, blocked, etc.
    pushLog({
      at, method, url: path, status: 0, ok: false,
      durationMs: Date.now() - startedAt,
      error: `${e.name || 'Error'}: ${e.message || String(e)}`,
    });
    throw e;
  }

  const durationMs = Date.now() - startedAt;

  if (!res.ok) {
    const text = await res.text();
    pushLog({
      at, method, url: path, status: res.status, ok: false, durationMs,
      error: text.slice(0, 500),
    });
    throw new Error(text);
  }

  pushLog({ at, method, url: path, status: res.status, ok: true, durationMs });
  return res.json();
}
