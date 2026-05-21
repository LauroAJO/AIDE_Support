// AIDE — Cloudflare Pages Advanced Mode Worker
// Handles /api/* routes; everything else falls through to static assets.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle API routes. Wrapped so an uncaught error (e.g. a query against a
    // table that a partially-applied migration never created) returns a clean
    // JSON 500 instead of crashing the Worker with Cloudflare Error 1101.
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleAPI(request, env, ctx);
      } catch (err) {
        return json({ error: 'internal_error', detail: String((err && err.message) || err) }, 500);
      }
    }

    // ALL other routes: serve React static assets
    return env.ASSETS.fetch(request);
  },

  // Cloudflare Pages does NOT fire scheduled events, so this handler only runs
  // if this worker is ever deployed as a standalone Worker. In production the
  // daily run is driven by the satellite `aide-cron` worker hitting
  // POST /api/cron/run (see aide_cron_worker/).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDailyNotifications(env));
  }
};

// ---------------------------------------------------------------------------
// API router
// ---------------------------------------------------------------------------

async function handleAPI(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS preflight
  if (method === 'OPTIONS') return corsResponse();

  // Auth routes (public)
  if (path === '/api/auth/google') return handleGoogleAuth(request, env);
  if (path === '/api/auth/callback') return handleCallback(request, env);
  if (path === '/api/auth/logout') return handleLogout(request, env);
  if (path === '/api/push/vapid-key') return json({ publicKey: env.VAPID_PUBLIC_KEY || null });

  // Bridge — auth handled inside (AIDE session OR X-Bridge-Secret).
  if (path.startsWith('/api/bridge/')) return handleBridge(request, env, ctx, path);

  // Cron run — auth handled inside (owner session OR X-Cron-Secret).
  if (path === '/api/cron/run') return handleCronRun(request, env, ctx);

  // Protected routes — require valid session token
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  if (path === '/api/auth/me') {
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), user.id).run();
    return json(publicUser(user));
  }

  if (path === '/api/users') return handleUsers(env);
  if (path === '/api/profile') return handleProfileUpdate(request, env, user);

  // Exports
  if (path === '/api/export/tasks') return handleExportTasks(env);
  if (path === '/api/export/notes') return handleExportNotes(env);

  if (path === '/api/tasks') return handleTasksCollection(request, env, user, ctx);
  if (path.startsWith('/api/tasks/')) return handleTaskItem(request, env, user, path.split('/')[3], ctx);

  if (path === '/api/projects') return handleProjectsCollection(request, env, user);
  if (path.startsWith('/api/projects/')) return handleProjectItem(request, env, user, path.split('/')[3]);

  // Timer
  if (path === '/api/timer/start') return handleTimerStart(request, env, user);
  if (path === '/api/timer/stop') return handleTimerStop(request, env, user);
  if (path === '/api/timer/active') return handleTimerActive(request, env, user);
  if (path === '/api/timer/entries') return handleTimerEntries(request, env, user);
  if (path.startsWith('/api/timer/entries/')) return handleTimerEntryItem(request, env, user, path.split('/')[4]);

  // Planning
  if (path === '/api/planning/week') return handleWeekPlanGet(request, env, user);
  if (path.startsWith('/api/planning/week/')) return handleWeekPlanUpdate(request, env, user, path.split('/')[4]);

  // Availability
  if (path === '/api/availability') return handleAvailability(request, env, user);

  // Calendar
  if (path === '/api/calendar/events') return handleCalendarEvents(request, env, user);
  if (path.startsWith('/api/calendar/events/')) return handleCalendarEventItem(request, env, user, path.split('/')[4]);
  if (path === '/api/calendar/sync') return handleCalendarSync(request, env, user);
  if (path === '/api/calendar/list') return handleCalendarList(request, env, user);

  // Drive
  if (path === '/api/drive/files') return handleDriveFiles(request, env, user);
  if (path === '/api/drive/favorites') return handleDriveFavorites(request, env, user);
  if (path.startsWith('/api/drive/favorites/')) return handleDriveFavoriteToggle(request, env, user, path.split('/')[4]);
  if (path === '/api/drive/sort') return handleDriveSort(request, env, user);

  // Notes
  if (path === '/api/notes') return handleNotes(request, env, user);
  if (path.startsWith('/api/notes/')) return handleNoteItem(request, env, user, path.split('/')[3]);

  // Notifications
  if (path === '/api/notifications') return handleNotifications(request, env, user, ctx);
  if (path === '/api/notifications/read-all') return handleNotificationsReadAll(request, env, user);
  if (path.startsWith('/api/notifications/') && path.endsWith('/read')) {
    return handleNotificationRead(request, env, user, path.split('/')[3]);
  }
  if (path.startsWith('/api/notifications/')) return handleNotificationItem(request, env, user, path.split('/')[3]);

  // Push subscriptions
  if (path === '/api/push/subscribe') return handlePushSubscribe(request, env, user);

  // Month planning
  if (path === '/api/planning/month') return handleMonthPlanGet(request, env, user);
  if (path.startsWith('/api/planning/month/')) return handleMonthPlanUpdate(request, env, user, path.split('/')[4]);

  // Alert rules
  if (path === '/api/alerts/rules') return handleAlertRules(request, env, user);
  if (path.startsWith('/api/alerts/rules/') && path.endsWith('/test')) {
    return handleAlertRuleTest(request, env, user, path.split('/')[4]);
  }
  if (path.startsWith('/api/alerts/rules/')) return handleAlertRuleItem(request, env, user, path.split('/')[4]);

  // Payment
  if (path === '/api/payment/summary') return handlePaymentSummary(request, env, user);
  if (path.startsWith('/api/payment/entries/') && path.endsWith('/paid')) {
    return handlePaymentEntryPaid(request, env, user, path.split('/')[4]);
  }

  // Personal data
  if (path === '/api/profile/personal') return handlePersonalData(request, env, user);
  if (path.startsWith('/api/profile/personal/')) return handlePersonalDataByUser(request, env, user, path.split('/')[4]);

  // Reports
  if (path === '/api/reports/monthly') return handleMonthlyReport(request, env, user);
  if (path === '/api/reports/list') return handleReportsList(env);

  // Dashboard
  if (path === '/api/dashboard/alice-timer') return handleAliceTimer(env, user);

  return json({ error: 'Rota não encontrada' }, 404);
}

// ---------------------------------------------------------------------------
// Google OAuth
// Phase 0 scopes ONLY: openid email profile
// (Calendar/Drive/Gmail scopes are added in later phases to avoid Google
//  verification warnings.)
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const OAUTH_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
].join(' ');

// Redirect URI: use the explicit env override when set (local dev needs
// http://localhost:5173/... because Vite proxies /api to the worker on :8788),
// otherwise derive it from the request origin so production "just works" on
// whatever domain the worker is served from (aide-support.pages.dev or a
// future custom domain). Whatever this returns must be registered in the
// Google Cloud console as an Authorized redirect URI.
const PROD_HOST = 'aide-support.pages.dev';

function getRedirectUri(request, env) {
  const url = new URL(request.url);
  // On the production host, always use its own callback — never a stale
  // localhost value that might be lingering in an env var/secret.
  if (url.host === PROD_HOST) return `https://${PROD_HOST}/api/auth/callback`;
  // Otherwise: explicit override (local dev .dev.vars) or derive from origin.
  if (env.GOOGLE_REDIRECT_URI) return env.GOOGLE_REDIRECT_URI.trim();
  return `${url.origin}/api/auth/callback`;
}

// Credentials are read from env and trimmed — a trailing newline/space (easy to
// introduce via `wrangler pages secret put`) makes Google return invalid_client.
const clientId = (env) => (env.GOOGLE_CLIENT_ID || '').trim();
const clientSecret = (env) => (env.GOOGLE_CLIENT_SECRET || '').trim();

// Access control. ALLOWED_EMAILS is a comma-separated list (kept out of the
// repo — set as a Pages var/secret). If unset, everyone is allowed (useful
// during initial setup); once set, only listed emails can sign in.
function isEmailAllowed(email, env) {
  const raw = (env.ALLOWED_EMAILS || '').trim();
  if (!raw) return true;
  const allow = raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return allow.includes((email || '').toLowerCase());
}

// Role: OWNER_EMAIL becomes 'owner', everyone else 'assistant'.
function roleForEmail(email, env) {
  const owner = (env.OWNER_EMAIL || '').trim().toLowerCase();
  return owner && (email || '').toLowerCase() === owner ? 'owner' : 'assistant';
}

function handleGoogleAuth(request, env) {
  const params = new URLSearchParams({
    client_id: clientId(env),
    redirect_uri: getRedirectUri(request, env),
    response_type: 'code',
    scope: OAUTH_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  });
  return Response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
}

async function handleCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) return json({ error: `Falha na autenticação Google: ${error}` }, 400);
  if (!code) return json({ error: 'Código de autorização ausente' }, 400);

  // 1. Exchange code for tokens
  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(env),
      client_secret: clientSecret(env),
      redirect_uri: getRedirectUri(request, env),
      grant_type: 'authorization_code'
    })
  });

  if (!tokenResp.ok) {
    const detail = await tokenResp.text();
    return json({ error: 'Falha ao trocar código por token', detail }, 502);
  }

  const tokenData = await tokenResp.json();
  const { access_token, refresh_token, expires_in } = tokenData;
  const expires_at = Math.floor(Date.now() / 1000) + (expires_in || 3600);

  // 2. Fetch user profile
  const profileResp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` }
  });

  if (!profileResp.ok) {
    return json({ error: 'Falha ao obter perfil do usuário' }, 502);
  }

  const profile = await profileResp.json();
  const userId = profile.id;
  const now = Math.floor(Date.now() / 1000);

  // 2b. Access control — only allowed emails may sign in.
  if (!isEmailAllowed(profile.email, env)) {
    const dest = new URL('/', new URL(getRedirectUri(request, env)).origin);
    dest.searchParams.set('error', 'acesso_negado');
    return Response.redirect(dest.toString(), 302);
  }

  const role = roleForEmail(profile.email, env);

  // 3. Upsert user in D1. Role is recomputed from OWNER_EMAIL on every login.
  await env.DB.prepare(
    `INSERT OR REPLACE INTO users
       (id, email, name, avatar, role, google_access_token, google_refresh_token, google_token_expires_at, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?,
       COALESCE((SELECT created_at FROM users WHERE id = ?), ?),
       ?)`
  ).bind(
    userId,
    profile.email,
    profile.name || null,
    profile.picture || null,
    role,
    access_token,
    refresh_token || null,
    expires_at,
    userId,
    now,
    now
  ).run();

  // 4. Store tokens in AIDE_TOKENS KV
  await env.AIDE_TOKENS.put(
    `token:${userId}`,
    JSON.stringify({ access_token, refresh_token: refresh_token || null, expires_at })
  );

  // 5. Create session in D1 (30 days)
  const sessionToken = crypto.randomUUID();
  const sessionExpires = now + 60 * 60 * 24 * 30;
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), userId, sessionToken, sessionExpires, now).run();

  // 6. Return token + user.
  // The browser hit this URL directly via redirect, so bounce back to the
  // frontend with the token as a query param (frontend stores it).
  const redirectBase = new URL(getRedirectUri(request, env)).origin;
  const dest = new URL('/', redirectBase);
  dest.searchParams.set('token', sessionToken);
  return Response.redirect(dest.toString(), 302);
}

async function handleLogout(request, env) {
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getUserFromRequest(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const now = Math.floor(Date.now() / 1000);
  const session = await env.DB.prepare(
    `SELECT u.* FROM sessions s
       JOIN users u ON s.user_id = u.id
      WHERE s.token = ? AND s.expires_at > ?`
  ).bind(token, now).first();
  return session || null;
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role
  };
}

// ---------------------------------------------------------------------------
// Tasks & Projects
// ---------------------------------------------------------------------------

const TASK_STATUSES = ['backlog', 'todo', 'doing', 'done'];

function calcScore(urgency, importance) {
  return Math.round((urgency * 0.4 + importance * 0.6) * 10) / 10;
}

function clamp010(value, fallback = 5) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Maps a joined task row (tasks t LEFT JOIN users u) to the API shape, with
// JSON columns parsed, the computed score, and the assignee expanded.
function shapeTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    project_id: row.project_id || null,
    assigned_to: row.assigned_to || null,
    created_by: row.created_by || null,
    urgency: row.urgency,
    importance: row.importance,
    energy: row.energy,
    status: row.status,
    due_date: row.due_date || null,
    delivery_date: row.delivery_date || null,
    tags: parseJsonArray(row.tags),
    comments: parseJsonArray(row.comments),
    subtasks: parseJsonArray(row.subtasks),
    time_entries: parseJsonArray(row.time_entries),
    created_at: row.created_at,
    updated_at: row.updated_at,
    score: calcScore(row.urgency, row.importance),
    assignedUser: row.au_id
      ? { id: row.au_id, name: row.au_name, avatar: row.au_avatar }
      : null
  };
}

const TASK_SELECT =
  'SELECT t.*, u.id AS au_id, u.name AS au_name, u.avatar AS au_avatar ' +
  'FROM tasks t LEFT JOIN users u ON t.assigned_to = u.id';

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleUsers(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, email, name, avatar, role, last_seen_at FROM users ORDER BY role DESC, name'
  ).all();
  return json(results || []);
}

async function handleProfileUpdate(request, env, user) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  const name = body.name !== undefined ? String(body.name).trim() : user.name;
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name || null, user.id).run();
  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json(publicUser(updated));
}

async function handleTasksCollection(request, env, user, ctx) {
  if (request.method === 'GET') {
    if (new URL(request.url).searchParams.get('completed_today') === 'true') {
      const midnight = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      const { results } = await env.DB.prepare(
        `${TASK_SELECT} WHERE t.status = 'done' AND t.updated_at >= ? ORDER BY t.updated_at DESC`
      ).bind(midnight).all();
      return json((results || []).map(shapeTask));
    }
    const { results } = await env.DB.prepare(
      `${TASK_SELECT} ORDER BY (t.urgency + t.importance) DESC, t.created_at DESC`
    ).all();
    return json((results || []).map(shapeTask));
  }

  if (request.method === 'POST') {
    const body = await readJson(request);
    if (!body) return json({ error: 'JSON inválido' }, 400);
    if (!body.title || !String(body.title).trim()) {
      return json({ error: 'Título é obrigatório' }, 400);
    }
    const status = TASK_STATUSES.includes(body.status) ? body.status : 'backlog';
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO tasks
        (id, title, description, project_id, assigned_to, created_by,
         urgency, importance, energy, status, due_date, delivery_date,
         tags, comments, subtasks, time_entries, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      String(body.title).trim(),
      body.description || '',
      body.project_id || null,
      body.assigned_to || null,
      user.id,
      clamp010(body.urgency),
      clamp010(body.importance),
      clamp010(body.energy),
      status,
      body.due_date || null,
      body.delivery_date || null,
      JSON.stringify(body.tags || []),
      JSON.stringify(body.comments || []),
      JSON.stringify(body.subtasks || []),
      JSON.stringify(body.time_entries || []),
      now,
      now
    ).run();
    const row = await env.DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(id).first();
    const shaped = shapeTask(row);
    if (shaped.assigned_to && shaped.assigned_to !== user.id) {
      await notifyTaskAssignment(env, ctx, user, shaped);
    }
    await notifyTaskDue(env, ctx, shaped);
    return json(shaped, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleTaskItem(request, env, user, taskId, ctx) {
  if (!taskId) return json({ error: 'ID ausente' }, 400);

  if (request.method === 'GET') {
    const row = await env.DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(taskId).first();
    if (!row) return json({ error: 'Tarefa não encontrada' }, 404);
    return json(shapeTask(row));
  }

  if (request.method === 'PUT') {
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first();
    if (!existing) return json({ error: 'Tarefa não encontrada' }, 404);

    const body = await readJson(request);
    if (!body) return json({ error: 'JSON inválido' }, 400);

    const title = body.title !== undefined ? String(body.title).trim() : existing.title;
    if (!title) return json({ error: 'Título é obrigatório' }, 400);

    const status = body.status !== undefined
      ? (TASK_STATUSES.includes(body.status) ? body.status : existing.status)
      : existing.status;

    const pick = (key) => (body[key] !== undefined ? body[key] : undefined);
    const merged = {
      title,
      description: pick('description') ?? existing.description,
      project_id: body.project_id !== undefined ? (body.project_id || null) : existing.project_id,
      assigned_to: body.assigned_to !== undefined ? (body.assigned_to || null) : existing.assigned_to,
      urgency: body.urgency !== undefined ? clamp010(body.urgency, existing.urgency) : existing.urgency,
      importance: body.importance !== undefined ? clamp010(body.importance, existing.importance) : existing.importance,
      energy: body.energy !== undefined ? clamp010(body.energy, existing.energy) : existing.energy,
      status,
      due_date: body.due_date !== undefined ? (body.due_date || null) : existing.due_date,
      delivery_date: body.delivery_date !== undefined ? (body.delivery_date || null) : existing.delivery_date,
      tags: body.tags !== undefined ? JSON.stringify(body.tags || []) : existing.tags,
      comments: body.comments !== undefined ? JSON.stringify(body.comments || []) : existing.comments,
      subtasks: body.subtasks !== undefined ? JSON.stringify(body.subtasks || []) : existing.subtasks,
      time_entries: body.time_entries !== undefined ? JSON.stringify(body.time_entries || []) : existing.time_entries
    };
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE tasks SET title=?, description=?, project_id=?, assigned_to=?,
        urgency=?, importance=?, energy=?, status=?, due_date=?, delivery_date=?,
        tags=?, comments=?, subtasks=?, time_entries=?, updated_at=?
       WHERE id=?`
    ).bind(
      merged.title, merged.description, merged.project_id, merged.assigned_to,
      merged.urgency, merged.importance, merged.energy, merged.status,
      merged.due_date, merged.delivery_date, merged.tags, merged.comments,
      merged.subtasks, merged.time_entries, now, taskId
    ).run();
    const row = await env.DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(taskId).first();
    const shaped = shapeTask(row);
    const assigneeChanged = (existing.assigned_to || null) !== (merged.assigned_to || null);
    if (assigneeChanged && shaped.assigned_to && shaped.assigned_to !== user.id) {
      await notifyTaskAssignment(env, ctx, user, shaped);
    }
    const dueChanged = (existing.due_date || null) !== (merged.due_date || null);
    if (dueChanged) await notifyTaskDue(env, ctx, shaped);
    return json(shaped);
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
    return json({ ok: true });
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleProjectsCollection(request, env, user) {
  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM projects ORDER BY created_at DESC'
    ).all();
    return json(results || []);
  }

  if (request.method === 'POST') {
    const body = await readJson(request);
    if (!body) return json({ error: 'JSON inválido' }, 400);
    if (!body.name || !String(body.name).trim()) {
      return json({ error: 'Nome é obrigatório' }, 400);
    }
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'INSERT INTO projects (id, name, color, created_by, created_at) VALUES (?,?,?,?,?)'
    ).bind(id, String(body.name).trim(), body.color || '#6366f1', user.id, now).run();
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    return json(row, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleProjectItem(request, env, user, projectId) {
  if (!projectId) return json({ error: 'ID ausente' }, 400);
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId).run();
    return json({ ok: true });
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Timer / time entries
// ---------------------------------------------------------------------------

const ENTRY_SELECT =
  'SELECT e.*, t.title AS task_title FROM time_entries e ' +
  'LEFT JOIN tasks t ON e.task_id = t.id';

function shapeEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id || null,
    task_title: row.task_title || null,
    user_id: row.user_id,
    started_at: row.started_at,
    ended_at: row.ended_at || null,
    duration_seconds: row.duration_seconds || null,
    hourly_rate: row.hourly_rate || 0,
    paid: !!row.paid,
    paid_at: row.paid_at || null,
    notes: row.notes || '',
    created_at: row.created_at
  };
}

// Stops the user's active (un-ended) entry if any; returns its id or null.
async function stopActiveEntry(env, userId, now) {
  const active = await env.DB.prepare(
    'SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL'
  ).bind(userId).first();
  if (!active) return null;
  await env.DB.prepare(
    'UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?'
  ).bind(now, now - active.started_at, active.id).run();
  return active.id;
}

async function handleTimerStart(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  const now = Math.floor(Date.now() / 1000);

  // Only one active entry per user — stop the previous one first.
  await stopActiveEntry(env, user.id, now);

  const avail = await env.DB.prepare(
    'SELECT hourly_rate FROM availability WHERE user_id = ?'
  ).bind(user.id).first();
  const rate = body.hourly_rate != null ? Number(body.hourly_rate) || 0 : (avail?.hourly_rate || 0);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO time_entries
       (id, task_id, user_id, started_at, ended_at, duration_seconds, hourly_rate, paid, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, body.task_id || null, user.id, now, null, null, rate, 0, body.notes || '', now).run();

  const row = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).bind(id).first();
  return json(shapeEntry(row), 201);
}

async function handleTimerStop(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const now = Math.floor(Date.now() / 1000);
  const stoppedId = await stopActiveEntry(env, user.id, now);
  if (!stoppedId) return json({ error: 'Nenhum timer ativo' }, 404);
  const row = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).bind(stoppedId).first();
  return json(shapeEntry(row));
}

async function handleTimerActive(request, env, user) {
  const row = await env.DB.prepare(
    `${ENTRY_SELECT} WHERE e.user_id = ? AND e.ended_at IS NULL`
  ).bind(user.id).first();
  return json(row ? shapeEntry(row) : null);
}

async function handleTimerEntries(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  const { results } = await env.DB.prepare(
    `${ENTRY_SELECT} WHERE e.user_id = ? ORDER BY e.started_at DESC`
  ).bind(user.id).all();
  return json((results || []).map(shapeEntry));
}

async function handleTimerEntryItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);

  if (request.method === 'PUT') {
    const existing = await env.DB.prepare(
      'SELECT * FROM time_entries WHERE id = ? AND user_id = ?'
    ).bind(id, user.id).first();
    if (!existing) return json({ error: 'Registro não encontrado' }, 404);

    const body = (await readJson(request)) || {};
    const notes = body.notes !== undefined ? body.notes : existing.notes;
    const rate = body.hourly_rate !== undefined ? (Number(body.hourly_rate) || 0) : existing.hourly_rate;
    let paid = existing.paid;
    let paidAt = existing.paid_at;
    if (body.paid !== undefined) {
      paid = body.paid ? 1 : 0;
      paidAt = body.paid ? (existing.paid_at || Math.floor(Date.now() / 1000)) : null;
    }
    await env.DB.prepare(
      'UPDATE time_entries SET notes = ?, hourly_rate = ?, paid = ?, paid_at = ? WHERE id = ?'
    ).bind(notes, rate, paid, paidAt, id).run();
    const row = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).bind(id).first();
    return json(shapeEntry(row));
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM time_entries WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return json({ ok: true });
  }

  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Weekly planning
// ---------------------------------------------------------------------------

// Monday (YYYY-MM-DD, UTC) of the week containing dateStr.
function mondayOf(dateStr) {
  const base = dateStr || new Date().toISOString().slice(0, 10);
  const d = new Date(`${base}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function shapeWeekPlan(row) {
  let dayPlans = {};
  try {
    dayPlans = JSON.parse(row.day_plans || '{}');
  } catch {
    dayPlans = {};
  }
  return {
    id: row.id,
    user_id: row.user_id,
    week_start: row.week_start,
    day_plans: dayPlans,
    weekly_goal: row.weekly_goal || '',
    weekly_review: row.weekly_review || '',
    short_term: row.short_term || '',
    tactical: row.tactical || '',
    strategic: row.strategic || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handleWeekPlanGet(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  const date = new URL(request.url).searchParams.get('date');
  const weekStart = mondayOf(date);
  let row = await env.DB.prepare(
    'SELECT * FROM week_plans WHERE user_id = ? AND week_start = ?'
  ).bind(user.id, weekStart).first();
  if (!row) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO week_plans (id, user_id, week_start, day_plans, weekly_goal, weekly_review, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, user.id, weekStart, '{}', '', '', now, now).run();
    row = await env.DB.prepare('SELECT * FROM week_plans WHERE id = ?').bind(id).first();
  }
  return json(shapeWeekPlan(row));
}

async function handleWeekPlanUpdate(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const existing = await env.DB.prepare(
    'SELECT * FROM week_plans WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first();
  if (!existing) return json({ error: 'Plano não encontrado' }, 404);

  const body = (await readJson(request)) || {};
  const dayPlans = body.day_plans !== undefined ? JSON.stringify(body.day_plans || {}) : existing.day_plans;
  const goal = body.weekly_goal !== undefined ? body.weekly_goal : existing.weekly_goal;
  const review = body.weekly_review !== undefined ? body.weekly_review : existing.weekly_review;
  const shortTerm = body.short_term !== undefined ? body.short_term : existing.short_term;
  const tactical = body.tactical !== undefined ? body.tactical : existing.tactical;
  const strategic = body.strategic !== undefined ? body.strategic : existing.strategic;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE week_plans SET day_plans = ?, weekly_goal = ?, weekly_review = ?,
       short_term = ?, tactical = ?, strategic = ?, updated_at = ? WHERE id = ?`
  ).bind(dayPlans, goal, review, shortTerm, tactical, strategic, now, id).run();
  const row = await env.DB.prepare('SELECT * FROM week_plans WHERE id = ?').bind(id).first();
  return json(shapeWeekPlan(row));
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

function shapeAvailability(row) {
  let workDays = [1, 2, 3, 4, 5];
  try {
    workDays = JSON.parse(row.work_days || '[1,2,3,4,5]');
  } catch {
    workDays = [1, 2, 3, 4, 5];
  }
  return {
    id: row.id,
    user_id: row.user_id,
    work_days: workDays,
    work_start: row.work_start,
    work_end: row.work_end,
    lunch_start: row.lunch_start,
    lunch_end: row.lunch_end,
    hourly_rate: row.hourly_rate || 0,
    updated_at: row.updated_at
  };
}

async function handleAvailability(request, env, user) {
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM availability WHERE user_id = ?').bind(user.id).first();
    if (!row) {
      return json({
        user_id: user.id,
        work_days: [1, 2, 3, 4, 5],
        work_start: '09:00',
        work_end: '18:00',
        lunch_start: '12:00',
        lunch_end: '13:00',
        hourly_rate: 0
      });
    }
    return json(shapeAvailability(row));
  }

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const now = Math.floor(Date.now() / 1000);
    const fields = {
      work_days: JSON.stringify(body.work_days || [1, 2, 3, 4, 5]),
      work_start: body.work_start || '09:00',
      work_end: body.work_end || '18:00',
      lunch_start: body.lunch_start || '12:00',
      lunch_end: body.lunch_end || '13:00',
      hourly_rate: Number(body.hourly_rate) || 0
    };
    const existing = await env.DB.prepare('SELECT id FROM availability WHERE user_id = ?').bind(user.id).first();
    if (existing) {
      await env.DB.prepare(
        `UPDATE availability SET work_days=?, work_start=?, work_end=?, lunch_start=?, lunch_end=?, hourly_rate=?, updated_at=?
         WHERE user_id=?`
      ).bind(
        fields.work_days, fields.work_start, fields.work_end, fields.lunch_start,
        fields.lunch_end, fields.hourly_rate, now, user.id
      ).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO availability (id, user_id, work_days, work_start, work_end, lunch_start, lunch_end, hourly_rate, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(
        crypto.randomUUID(), user.id, fields.work_days, fields.work_start, fields.work_end,
        fields.lunch_start, fields.lunch_end, fields.hourly_rate, now
      ).run();
    }
    const row = await env.DB.prepare('SELECT * FROM availability WHERE user_id = ?').bind(user.id).first();
    return json(shapeAvailability(row));
  }

  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Google API access (token refresh + authed fetch)
// ---------------------------------------------------------------------------

// Returns a valid access token for the user, refreshing via the stored
// refresh_token when expired (5-min buffer). `force` refreshes regardless of
// expiry (used after a 401). Returns null if the grant was revoked.
async function refreshGoogleToken(userId, env, force = false) {
  const raw = await env.AIDE_TOKENS.get(`token:${userId}`);
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!force && data.access_token && data.expires_at && data.expires_at > now + 300) {
    return data.access_token;
  }
  if (!data.refresh_token) return data.access_token || null;

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(env),
      client_secret: clientSecret(env),
      refresh_token: data.refresh_token,
      grant_type: 'refresh_token'
    })
  });
  if (!resp.ok) return null;
  const t = await resp.json();
  const next = {
    access_token: t.access_token,
    refresh_token: t.refresh_token || data.refresh_token,
    expires_at: now + (t.expires_in || 3600)
  };
  await env.AIDE_TOKENS.put(`token:${userId}`, JSON.stringify(next));
  return next.access_token;
}

// Authed fetch against a Google API. Returns the Response, or null if there's
// no usable token. Retries once with a forced refresh on 401.
async function googleFetch(url, userId, env, options = {}) {
  let token = await refreshGoogleToken(userId, env);
  if (!token) return null;
  const doFetch = (tok) =>
    fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${tok}` } });
  let resp = await doFetch(token);
  if (resp.status === 401) {
    token = await refreshGoogleToken(userId, env, true);
    if (!token) return null;
    resp = await doFetch(token);
  }
  return resp;
}

// Standard guards for a Google response: null token → reauth, 403 → missing
// scope. Returns a Response to send back, or null if the response is usable.
function googleGuard(resp) {
  if (!resp) return json({ error: 'reauth_required' }, 401);
  if (resp.status === 403) return json({ error: 'scope_required' }, 403);
  return null;
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

function shapeGoogleEvent(ev, calendarId) {
  const allDay = !!(ev.start && ev.start.date);
  return {
    id: ev.id,
    googleEventId: ev.id,
    title: ev.summary || '(sem título)',
    description: ev.description || '',
    startDatetime: ev.start ? ev.start.dateTime || ev.start.date : null,
    endDatetime: ev.end ? ev.end.dateTime || ev.end.date : null,
    allDay,
    location: ev.location || '',
    color: ev.colorId || null,
    calendarId
  };
}

function buildGoogleEventBody(body) {
  const allDay = !!(body.all_day || body.allDay);
  const g = {
    summary: body.title || body.summary || '(sem título)',
    description: body.description || '',
    location: body.location || ''
  };
  g.start = allDay ? { date: body.start } : { dateTime: body.start };
  g.end = allDay ? { date: body.end } : { dateTime: body.end };
  return g;
}

async function cacheEvent(env, userId, shaped, raw) {
  try {
    await env.DB.prepare(
      `INSERT INTO calendar_events_cache
        (id, google_event_id, user_id, calendar_id, title, description, start_datetime, end_datetime, all_day, location, attendees, color, synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(google_event_id) DO UPDATE SET
         calendar_id=excluded.calendar_id, title=excluded.title, description=excluded.description,
         start_datetime=excluded.start_datetime, end_datetime=excluded.end_datetime, all_day=excluded.all_day,
         location=excluded.location, attendees=excluded.attendees, color=excluded.color, synced_at=excluded.synced_at`
    ).bind(
      crypto.randomUUID(), shaped.googleEventId, userId, shaped.calendarId, shaped.title,
      shaped.description, shaped.startDatetime, shaped.endDatetime, shaped.allDay ? 1 : 0,
      shaped.location, JSON.stringify((raw && raw.attendees) || []), shaped.color, Math.floor(Date.now() / 1000)
    ).run();
  } catch {
    /* cache is best-effort */
  }
}

async function handleCalendarEvents(request, env, user) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const timeMin = url.searchParams.get('start') || new Date().toISOString();
    const timeMax = url.searchParams.get('end') || new Date(Date.now() + 30 * 86400000).toISOString();
    const calsParam = url.searchParams.get('calendars');
    const calendars = calsParam ? calsParam.split(',').filter(Boolean) : ['primary'];
    const all = [];
    for (const cal of calendars) {
      const api =
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?` +
        new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
      const resp = await googleFetch(api, user.id, env);
      const guard = googleGuard(resp);
      if (guard) return guard;
      if (!resp.ok) continue; // skip a calendar that errors individually
      const data = await resp.json();
      for (const ev of data.items || []) {
        const shaped = shapeGoogleEvent(ev, cal);
        all.push(shaped);
        await cacheEvent(env, user.id, shaped, ev);
      }
    }
    return json(all);
  }

  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    const cal = body.calendar_id || 'primary';
    const resp = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events`,
      user.id, env,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildGoogleEventBody(body)) }
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok) return json({ error: 'google_error', detail: await resp.text() }, 502);
    const ev = await resp.json();
    const shaped = shapeGoogleEvent(ev, cal);
    await cacheEvent(env, user.id, shaped, ev);
    return json(shaped, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleCalendarEventItem(request, env, user, eventId) {
  if (!eventId) return json({ error: 'ID ausente' }, 400);
  const url = new URL(request.url);

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const cal = body.calendar_id || 'primary';
    const resp = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}`,
      user.id, env,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildGoogleEventBody(body)) }
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok) return json({ error: 'google_error', detail: await resp.text() }, 502);
    const ev = await resp.json();
    const shaped = shapeGoogleEvent(ev, cal);
    await cacheEvent(env, user.id, shaped, ev);
    return json(shaped);
  }

  if (request.method === 'DELETE') {
    const cal = url.searchParams.get('calendarId') || 'primary';
    const resp = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}`,
      user.id, env, { method: 'DELETE' }
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok && resp.status !== 410) return json({ error: 'google_error', detail: await resp.text() }, 502);
    await env.DB.prepare('DELETE FROM calendar_events_cache WHERE google_event_id = ?').bind(eventId).run();
    return json({ ok: true });
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleCalendarSync(request, env, user) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
  const api =
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?' +
    new URLSearchParams({
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250'
    });
  const resp = await googleFetch(api, user.id, env);
  const guard = googleGuard(resp);
  if (guard) return guard;
  if (!resp.ok) return json({ error: 'google_error' }, 502);
  const data = await resp.json();
  let synced = 0;
  for (const ev of data.items || []) {
    await cacheEvent(env, user.id, shapeGoogleEvent(ev, 'primary'), ev);
    synced += 1;
  }
  return json({ synced });
}

async function handleCalendarList(request, env, user) {
  const resp = await googleFetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    user.id, env
  );
  const guard = googleGuard(resp);
  if (guard) return guard;
  if (!resp.ok) return json({ error: 'google_error' }, 502);
  const data = await resp.json();
  return json(
    (data.items || []).map((c) => ({
      id: c.id,
      summary: c.summary,
      backgroundColor: c.backgroundColor || null,
      primary: !!c.primary
    }))
  );
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

function shapeDriveRow(r) {
  return {
    id: r.google_file_id,
    googleFileId: r.google_file_id,
    name: r.name,
    mimeType: r.mime_type,
    webViewLink: r.web_view_link || null,
    iconLink: r.icon_link || null,
    modifiedTime: r.modified_time || null,
    size: r.size || null,
    isFavorite: !!r.is_favorite,
    sortOrder: r.sort_order || 0
  };
}

async function cacheDriveItem(env, userId, f) {
  try {
    await env.DB.prepare(
      `INSERT INTO drive_items_cache
        (id, google_file_id, user_id, name, mime_type, web_view_link, icon_link, modified_time, size, parent_id, synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(google_file_id) DO UPDATE SET
         name=excluded.name, mime_type=excluded.mime_type, web_view_link=excluded.web_view_link,
         icon_link=excluded.icon_link, modified_time=excluded.modified_time, size=excluded.size,
         parent_id=excluded.parent_id, synced_at=excluded.synced_at`
    ).bind(
      crypto.randomUUID(), f.id, userId, f.name, f.mimeType, f.webViewLink || null,
      f.iconLink || null, f.modifiedTime || null, f.size || null, (f.parents && f.parents[0]) || null,
      Math.floor(Date.now() / 1000)
    ).run();
  } catch {
    /* best-effort */
  }
}

async function handleDriveFiles(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  const url = new URL(request.url);
  const parent = url.searchParams.get('parent');
  const search = url.searchParams.get('search');
  const esc = (s) => s.replace(/'/g, "\\'");
  let q;
  if (search) q = `name contains '${esc(search)}' and trashed = false`;
  else if (parent) q = `'${esc(parent)}' in parents and trashed = false`;
  else q = `'root' in parents and trashed = false`;

  const api =
    'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({
      q,
      pageSize: '50',
      orderBy: 'folder,name',
      fields: 'files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,parents)'
    });
  const resp = await googleFetch(api, user.id, env);
  const guard = googleGuard(resp);
  if (guard) return guard;
  if (!resp.ok) return json({ error: 'google_error', detail: await resp.text() }, 502);
  const data = await resp.json();

  const favs = await env.DB.prepare(
    'SELECT google_file_id FROM drive_items_cache WHERE user_id = ? AND is_favorite = 1'
  ).bind(user.id).all();
  const favSet = new Set((favs.results || []).map((r) => r.google_file_id));

  const files = [];
  for (const f of data.files || []) {
    await cacheDriveItem(env, user.id, f);
    files.push({
      id: f.id,
      googleFileId: f.id,
      name: f.name,
      mimeType: f.mimeType,
      webViewLink: f.webViewLink || null,
      iconLink: f.iconLink || null,
      modifiedTime: f.modifiedTime || null,
      size: f.size || null,
      parents: f.parents || [],
      isFavorite: favSet.has(f.id)
    });
  }
  return json(files);
}

async function handleDriveFavorites(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  const { results } = await env.DB.prepare(
    'SELECT * FROM drive_items_cache WHERE user_id = ? AND is_favorite = 1 ORDER BY sort_order, name'
  ).bind(user.id).all();
  return json((results || []).map(shapeDriveRow));
}

async function handleDriveFavoriteToggle(request, env, user, fileId) {
  if (!fileId) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  const fav = body.is_favorite ? 1 : 0;
  await env.DB.prepare(
    `INSERT INTO drive_items_cache
      (id, google_file_id, user_id, name, mime_type, web_view_link, icon_link, modified_time, is_favorite, sort_order, synced_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(google_file_id) DO UPDATE SET
       name=excluded.name, mime_type=excluded.mime_type, web_view_link=excluded.web_view_link,
       icon_link=excluded.icon_link, modified_time=excluded.modified_time,
       is_favorite=excluded.is_favorite, sort_order=excluded.sort_order, synced_at=excluded.synced_at`
  ).bind(
    crypto.randomUUID(), fileId, user.id, body.name || '', body.mimeType || '',
    body.webViewLink || null, body.iconLink || null, body.modifiedTime || null,
    fav, body.sort_order || 0, Math.floor(Date.now() / 1000)
  ).run();
  return json({ ok: true, is_favorite: !!fav });
}

async function handleDriveSort(request, env, user) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  for (const it of body.items || []) {
    await env.DB.prepare(
      'UPDATE drive_items_cache SET sort_order = ? WHERE google_file_id = ? AND user_id = ?'
    ).bind(it.sort_order || 0, it.googleFileId, user.id).run();
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const NOTE_SELECT =
  'SELECT n.*, p.name AS project_name, ' +
  'cu.id AS cu_id, cu.name AS cu_name, cu.avatar AS cu_avatar, ' +
  'uu.id AS uu_id, uu.name AS uu_name, uu.avatar AS uu_avatar ' +
  'FROM notes n ' +
  'LEFT JOIN projects p ON n.project_id = p.id ' +
  'LEFT JOIN users cu ON n.created_by = cu.id ' +
  'LEFT JOIN users uu ON n.updated_by = uu.id';

function shapeNote(row) {
  return {
    id: row.id,
    title: row.title || '',
    body: row.body || '',
    tags: parseJsonArray(row.tags),
    project_id: row.project_id || null,
    projectName: row.project_name || null,
    createdBy: row.cu_id ? { id: row.cu_id, name: row.cu_name, avatar: row.cu_avatar } : null,
    updatedBy: row.uu_id ? { id: row.uu_id, name: row.uu_name, avatar: row.uu_avatar } : null,
    pinned: !!row.pinned,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handleNotes(request, env, user) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const search = url.searchParams.get('search');
    const projectId = url.searchParams.get('project_id');
    const tag = url.searchParams.get('tag');
    const where = [];
    const binds = [];
    if (search) {
      where.push('(n.title LIKE ? OR n.body LIKE ?)');
      binds.push(`%${search}%`, `%${search}%`);
    }
    if (projectId) {
      where.push('n.project_id = ?');
      binds.push(projectId);
    }
    if (tag) {
      where.push('n.tags LIKE ?');
      binds.push(`%"${tag}"%`);
    }
    const sql = `${NOTE_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY n.pinned DESC, n.updated_at DESC`;
    const { results } = await env.DB.prepare(sql).bind(...binds).all();
    return json((results || []).map(shapeNote));
  }

  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO notes (id, title, body, tags, project_id, created_by, updated_by, pinned, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, body.title || '', body.body || '', JSON.stringify(body.tags || []),
      body.project_id || null, user.id, user.id, body.pinned ? 1 : 0, now, now
    ).run();
    const row = await env.DB.prepare(`${NOTE_SELECT} WHERE n.id = ?`).bind(id).first();
    return json(shapeNote(row), 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleNoteItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);

  if (request.method === 'GET') {
    const row = await env.DB.prepare(`${NOTE_SELECT} WHERE n.id = ?`).bind(id).first();
    if (!row) return json({ error: 'Nota não encontrada' }, 404);
    return json(shapeNote(row));
  }

  if (request.method === 'PUT') {
    const existing = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Nota não encontrada' }, 404);
    const body = (await readJson(request)) || {};
    const title = body.title !== undefined ? body.title : existing.title;
    const noteBody = body.body !== undefined ? body.body : existing.body;
    const tags = body.tags !== undefined ? JSON.stringify(body.tags || []) : existing.tags;
    const projectId = body.project_id !== undefined ? (body.project_id || null) : existing.project_id;
    const pinned = body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned;
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'UPDATE notes SET title=?, body=?, tags=?, project_id=?, pinned=?, updated_by=?, updated_at=? WHERE id=?'
    ).bind(title, noteBody, tags, projectId, pinned, user.id, now, id).run();
    const row = await env.DB.prepare(`${NOTE_SELECT} WHERE n.id = ?`).bind(id).first();
    return json(shapeNote(row));
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM notes WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }

  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Notifications (+ auto-triggers)
// ---------------------------------------------------------------------------

const NOTIF_SELECT =
  'SELECT n.*, fu.name AS from_name, fu.avatar AS from_avatar ' +
  'FROM notifications n LEFT JOIN users fu ON n.from_user_id = fu.id';

function shapeNotif(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body || '',
    task_id: row.task_id || null,
    note_id: row.note_id || null,
    read: !!row.read,
    created_at: row.created_at,
    fromUser: row.from_user_id
      ? { id: row.from_user_id, name: row.from_name, avatar: row.from_avatar }
      : null
  };
}

async function createNotification(env, ctx, n) {
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `INSERT INTO notifications (id, from_user_id, to_user_id, type, title, body, task_id, note_id, read, created_at)
     VALUES (?,?,?,?,?,?,?,?,0,?)`
  ).bind(
    id, n.from_user_id || null, n.to_user_id, n.type, n.title, n.body || '',
    n.task_id || null, n.note_id || null, now
  ).run();

  const job = pushToUser(env, n.to_user_id, {
    title: n.title,
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { notificationId: id, taskId: n.task_id || null, noteId: n.note_id || null, url: '/' }
  });
  if (ctx && ctx.waitUntil) ctx.waitUntil(job);
  else await job.catch(() => {});
  return id;
}

async function notifyTaskAssignment(env, ctx, assigner, task) {
  await createNotification(env, ctx, {
    from_user_id: assigner.id,
    to_user_id: task.assigned_to,
    type: 'task_assigned',
    title: `${assigner.name || 'Alguém'} atribuiu uma tarefa a você`,
    body: task.title,
    task_id: task.id
  });
}

async function notifyTaskDue(env, ctx, task) {
  if (!task.assigned_to || task.status === 'done' || !task.due_date) return;
  const now = Date.now();
  const endOfDue = new Date(`${task.due_date}T23:59:59`).getTime();
  const startOfDue = new Date(`${task.due_date}T00:00:00`).getTime();
  if (Number.isNaN(endOfDue)) return;
  const prettyDate = task.due_date.split('-').reverse().join('/');
  if (endOfDue < now) {
    await createNotification(env, ctx, {
      to_user_id: task.assigned_to,
      type: 'task_overdue',
      title: 'Tarefa em atraso',
      body: task.title,
      task_id: task.id
    });
  } else if (startOfDue - now <= 24 * 3600 * 1000) {
    await createNotification(env, ctx, {
      to_user_id: task.assigned_to,
      type: 'task_due_soon',
      title: 'Tarefa com prazo próximo',
      body: `${task.title} — vence em ${prettyDate}`,
      task_id: task.id
    });
  }
}

async function handleNotifications(request, env, user, ctx) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `${NOTIF_SELECT} WHERE n.to_user_id = ? ORDER BY n.read ASC, n.created_at DESC LIMIT 50`
      ).bind(user.id).all();
      return json((results || []).map(shapeNotif));
    } catch {
      return json([]); // table not migrated yet — degrade gracefully
    }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.to_user_id || !body.type || !body.title) {
      return json({ error: 'Campos obrigatórios ausentes' }, 400);
    }
    const id = await createNotification(env, ctx, {
      from_user_id: user.id,
      to_user_id: body.to_user_id,
      type: body.type,
      title: body.title,
      body: body.body || '',
      task_id: body.task_id || null,
      note_id: body.note_id || null
    });
    const row = await env.DB.prepare(`${NOTIF_SELECT} WHERE n.id = ?`).bind(id).first();
    return json(shapeNotif(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleNotificationsReadAll(request, env, user) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE to_user_id = ?').bind(user.id).run();
  return json({ ok: true });
}

async function handleNotificationRead(request, env, user, id) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  await env.DB.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND to_user_id = ?').bind(id, user.id).run();
  return json({ ok: true });
}

async function handleNotificationItem(request, env, user, id) {
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  await env.DB.prepare('DELETE FROM notifications WHERE id = ? AND to_user_id = ?').bind(id, user.id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Push subscriptions + Web Push (VAPID, manual aes128gcm per RFC 8291/8188)
// ---------------------------------------------------------------------------

async function handlePushSubscribe(request, env, user) {
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.endpoint || !body.p256dh || !body.auth) {
      return json({ error: 'Subscription inválida' }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth`
    ).bind(crypto.randomUUID(), user.id, body.endpoint, body.p256dh, body.auth, now).run();
    return json({ ok: true });
  }
  if (request.method === 'DELETE') {
    const body = (await readJson(request)) || {};
    if (body.endpoint) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(body.endpoint, user.id).run();
    } else {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE user_id = ?').bind(user.id).run();
    }
    return json({ ok: true });
  }
  return json({ error: 'Método não permitido' }, 405);
}

// --- base64url / byte helpers ---
function b64urlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64url(input) {
  const bytes = new Uint8Array(input);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strBytes(s) {
  return new TextEncoder().encode(s);
}
function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}

// VAPID JWT (ES256) → Authorization header value.
async function vapidAuthHeader(endpoint, env) {
  const url = new URL(endpoint);
  const aud = `${url.protocol}//${url.host}`;
  const pubBytes = b64urlToBytes(env.VAPID_PUBLIC_KEY);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToB64url(pubBytes.slice(1, 33)),
    y: bytesToB64url(pubBytes.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY
  };
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const header = bytesToB64url(strBytes(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = bytesToB64url(
    strBytes(JSON.stringify({
      aud,
      exp: Math.floor(Date.now() / 1000) + 43200,
      sub: env.VAPID_SUBJECT || 'mailto:lauro.ajo@gmail.com'
    }))
  );
  const signingInput = `${header}.${payload}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, strBytes(signingInput));
  return `vapid t=${signingInput}.${bytesToB64url(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// Encrypt payload with aes128gcm content encoding (RFC 8188 + RFC 8291).
async function encryptPushPayload(plaintext, p256dhB64, authB64) {
  const uaPublic = b64urlToBytes(p256dhB64);
  const authSecret = b64urlToBytes(authB64);
  const asPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asPair.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPair.privateKey, 256));

  const ikm = await hkdf(
    authSecret, ecdh, concatBytes(strBytes('WebPush: info\0'), uaPublic, asPublic), 32
  );
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, strBytes('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, strBytes('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const record = concatBytes(plaintext, new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, record));

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false); // record size
  header[20] = asPublic.length; // 65
  header.set(asPublic, 21);
  return concatBytes(header, ciphertext);
}

async function sendPushNotification(subscription, payload, env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  try {
    const body = await encryptPushPayload(strBytes(JSON.stringify(payload)), subscription.p256dh, subscription.auth);
    const authorization = await vapidAuthHeader(subscription.endpoint, env);
    const resp = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400'
      },
      body
    });
    if (resp.status === 404 || resp.status === 410) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(subscription.endpoint).run();
    }
  } catch {
    /* fire-and-forget */
  }
}

async function pushToUser(env, userId, payload) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  const subs = await env.DB.prepare(
    'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?'
  ).bind(userId).all();
  for (const sub of subs.results || []) {
    await sendPushNotification(sub, payload, env);
  }
}

// ---------------------------------------------------------------------------
// Month planning
// ---------------------------------------------------------------------------

function monthStartOf(dateStr) {
  const base = dateStr || new Date().toISOString().slice(0, 10);
  return `${base.slice(0, 7)}-01`;
}

function shapeMonthPlan(row) {
  let kr = [];
  try {
    kr = JSON.parse(row.key_results || '[]');
  } catch {
    kr = [];
  }
  return {
    id: row.id,
    user_id: row.user_id,
    month_start: row.month_start,
    strategic_goal: row.strategic_goal || '',
    key_results: Array.isArray(kr) ? kr : [],
    notes: row.notes || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handleMonthPlanGet(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  const date = new URL(request.url).searchParams.get('date');
  const monthStart = monthStartOf(date);
  let row = await env.DB.prepare(
    'SELECT * FROM month_plans WHERE user_id = ? AND month_start = ?'
  ).bind(user.id, monthStart).first();
  if (!row) {
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO month_plans (id, user_id, month_start, strategic_goal, key_results, notes, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, user.id, monthStart, '', '[]', '', now, now).run();
    row = await env.DB.prepare('SELECT * FROM month_plans WHERE id = ?').bind(id).first();
  }
  return json(shapeMonthPlan(row));
}

async function handleMonthPlanUpdate(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const existing = await env.DB.prepare(
    'SELECT * FROM month_plans WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first();
  if (!existing) return json({ error: 'Plano não encontrado' }, 404);
  const body = (await readJson(request)) || {};
  const goal = body.strategic_goal !== undefined ? body.strategic_goal : existing.strategic_goal;
  const kr = body.key_results !== undefined ? JSON.stringify(body.key_results || []) : existing.key_results;
  const notes = body.notes !== undefined ? body.notes : existing.notes;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    'UPDATE month_plans SET strategic_goal=?, key_results=?, notes=?, updated_at=? WHERE id=?'
  ).bind(goal, kr, notes, now, id).run();
  const row = await env.DB.prepare('SELECT * FROM month_plans WHERE id = ?').bind(id).first();
  return json(shapeMonthPlan(row));
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

function downloadJson(data, filename) {
  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Access-Control-Allow-Origin': '*'
    }
  });
}

async function handleExportTasks(env) {
  const { results } = await env.DB.prepare(`${TASK_SELECT} ORDER BY t.created_at DESC`).all();
  return downloadJson((results || []).map(shapeTask), 'aide-tasks.json');
}

async function handleExportNotes(env) {
  const { results } = await env.DB.prepare(`${NOTE_SELECT} ORDER BY n.updated_at DESC`).all();
  return downloadJson((results || []).map(shapeNote), 'aide-notes.json');
}

// ---------------------------------------------------------------------------
// Lifegame bridge
// ---------------------------------------------------------------------------

async function getBridgeConfig(env) {
  let row = await env.DB.prepare("SELECT * FROM bridge_config WHERE id = 'singleton'").first();
  if (!row) {
    await env.DB.prepare(
      "INSERT INTO bridge_config (id, lifegame_url, bridge_secret, sync_enabled, updated_at) VALUES ('singleton','','',0,?)"
    ).bind(Math.floor(Date.now() / 1000)).run();
    row = await env.DB.prepare("SELECT * FROM bridge_config WHERE id = 'singleton'").first();
  }
  return row;
}

function maskBridgeConfig(config) {
  return {
    lifegame_url: config.lifegame_url || '',
    sync_enabled: !!config.sync_enabled,
    has_secret: !!config.bridge_secret,
    bridge_secret: config.bridge_secret ? '••••••••' : '',
    last_sync_at: config.last_sync_at || null,
    updated_at: config.updated_at
  };
}

async function logBridge(env, entry) {
  try {
    await env.DB.prepare(
      'INSERT INTO bridge_sync_log (id, direction, entity_type, entity_id, status, payload, error, synced_at) VALUES (?,?,?,?,?,?,?,?)'
    ).bind(
      crypto.randomUUID(), entry.direction, entry.entity_type, entry.entity_id || null,
      entry.status || 'pending', entry.payload || null, entry.error || null, Math.floor(Date.now() / 1000)
    ).run();
  } catch {
    /* logging is best-effort */
  }
}

async function handleBridge(request, env, ctx, path) {
  const method = request.method;
  const secret = request.headers.get('X-Bridge-Secret');
  const config = await getBridgeConfig(env);
  const hasSecret = !!(secret && config.bridge_secret && secret === config.bridge_secret);
  const user = hasSecret ? null : await getUserFromRequest(request, env);
  if (!hasSecret && !user) return json({ error: 'Não autorizado' }, 401);

  if (path === '/api/bridge/config') {
    if (method === 'GET') return json(maskBridgeConfig(config));
    if (method === 'PUT') return handleBridgeConfigUpdate(request, env, config);
    return json({ error: 'Método não permitido' }, 405);
  }
  if (path === '/api/bridge/log') return handleBridgeLog(env);
  if (path === '/api/bridge/push/tasks') return handleBridgePushTasks(env, config);
  if (path === '/api/bridge/push/time-entries') return handleBridgePushTimeEntries(env, config);
  if (path === '/api/bridge/receive/sprints') return handleBridgeReceiveSprints(request, env);
  if (path === '/api/bridge/receive/xp') return handleBridgeReceiveXp(request, env);
  return json({ error: 'Rota não encontrada' }, 404);
}

async function handleBridgeConfigUpdate(request, env, existing) {
  const body = (await readJson(request)) || {};
  const url = body.lifegame_url !== undefined ? body.lifegame_url : existing.lifegame_url;
  // Only overwrite the secret if a real (non-masked, non-empty) value is sent.
  let secret = existing.bridge_secret;
  if (body.bridge_secret !== undefined && body.bridge_secret && !body.bridge_secret.startsWith('•')) {
    secret = body.bridge_secret;
  }
  const enabled = body.sync_enabled !== undefined ? (body.sync_enabled ? 1 : 0) : existing.sync_enabled;
  await env.DB.prepare(
    "UPDATE bridge_config SET lifegame_url=?, bridge_secret=?, sync_enabled=?, updated_at=? WHERE id='singleton'"
  ).bind(url, secret, enabled, Math.floor(Date.now() / 1000)).run();
  return json(maskBridgeConfig(await getBridgeConfig(env)));
}

async function handleBridgeLog(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, direction, entity_type, entity_id, status, error, synced_at FROM bridge_sync_log ORDER BY synced_at DESC LIMIT 50'
  ).all();
  return json(results || []);
}

async function handleBridgePushTasks(env, config) {
  if (!config.lifegame_url || !config.bridge_secret) return json({ error: 'Bridge não configurada' }, 400);
  const { results } = await env.DB.prepare(`${TASK_SELECT} ORDER BY t.created_at DESC`).all();
  const tasks = (results || []).map(shapeTask);
  const errors = [];
  try {
    const resp = await fetch(`${config.lifegame_url.replace(/\/$/, '')}/api/bridge/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': config.bridge_secret },
      body: JSON.stringify({ tasks })
    });
    await logBridge(env, {
      direction: 'outbound', entity_type: 'tasks', status: resp.ok ? 'success' : 'error',
      payload: `${tasks.length} tarefas`, error: resp.ok ? null : `HTTP ${resp.status}`
    });
    if (!resp.ok) errors.push(`HTTP ${resp.status}`);
    await env.DB.prepare("UPDATE bridge_config SET last_sync_at=? WHERE id='singleton'").bind(Math.floor(Date.now() / 1000)).run();
  } catch (e) {
    await logBridge(env, { direction: 'outbound', entity_type: 'tasks', status: 'error', error: String(e) });
    errors.push(String(e));
  }
  return json({ pushed: errors.length ? 0 : tasks.length, errors });
}

async function handleBridgePushTimeEntries(env, config) {
  if (!config.lifegame_url || !config.bridge_secret) return json({ error: 'Bridge não configurada' }, 400);
  const { results } = await env.DB.prepare('SELECT * FROM time_entries ORDER BY started_at DESC').all();
  const entries = results || [];
  const errors = [];
  try {
    const resp = await fetch(`${config.lifegame_url.replace(/\/$/, '')}/api/bridge/time-entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bridge-Secret': config.bridge_secret },
      body: JSON.stringify({ time_entries: entries })
    });
    await logBridge(env, {
      direction: 'outbound', entity_type: 'time_entries', status: resp.ok ? 'success' : 'error',
      payload: `${entries.length} registros`, error: resp.ok ? null : `HTTP ${resp.status}`
    });
    if (!resp.ok) errors.push(`HTTP ${resp.status}`);
  } catch (e) {
    await logBridge(env, { direction: 'outbound', entity_type: 'time_entries', status: 'error', error: String(e) });
    errors.push(String(e));
  }
  return json({ pushed: errors.length ? 0 : entries.length, errors });
}

async function handleBridgeReceiveSprints(request, env) {
  const body = (await readJson(request)) || {};
  const sprints = Array.isArray(body.sprints) ? body.sprints : [];
  await logBridge(env, {
    direction: 'inbound', entity_type: 'sprints', status: 'success',
    payload: JSON.stringify(sprints).slice(0, 500)
  });
  const titles = [];
  for (const sp of sprints) {
    if (Array.isArray(sp.tasks)) sp.tasks.forEach((t) => titles.push(typeof t === 'string' ? t : t.title));
    else if (sp.title) titles.push(sp.title);
  }
  const now = Math.floor(Date.now() / 1000);
  for (const title of titles.filter(Boolean)) {
    await env.DB.prepare("UPDATE tasks SET status='doing', updated_at=? WHERE title = ? AND status != 'done'")
      .bind(now, title).run();
  }
  return json({ received: sprints.length });
}

async function handleBridgeReceiveXp(request, env) {
  const body = (await readJson(request)) || {};
  await logBridge(env, {
    direction: 'inbound', entity_type: 'xp', entity_id: body.taskId || null,
    status: 'success', payload: JSON.stringify(body).slice(0, 500)
  });
  if (body.taskId) {
    const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(body.taskId).first();
    if (task) {
      let comments = [];
      try {
        comments = JSON.parse(task.comments || '[]');
      } catch {
        comments = [];
      }
      comments.push({
        id: crypto.randomUUID(), author: 'Lifegame',
        text: `⚡ ${body.xp || 0} XP earned in Lifegame`, at: Date.now()
      });
      await env.DB.prepare('UPDATE tasks SET comments=?, updated_at=? WHERE id=?')
        .bind(JSON.stringify(comments), Math.floor(Date.now() / 1000), body.taskId).run();
    }
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Daily deadline notifications (cron)
// ---------------------------------------------------------------------------

// Reuses createNotification (which inserts the in-app row AND pushes via
// pushToUser using the correct flat subscription shape). Dedupe per
// user+task+day in AIDE_SYNC KV (24h TTL) so re-runs don't double-notify.
async function runDailyNotifications(env) {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  const dueSoon = await env.DB.prepare(
    `SELECT id, title, due_date, assigned_to AS uid FROM tasks
     WHERE status != 'done' AND due_date IS NOT NULL AND due_date = ? AND assigned_to IS NOT NULL`
  ).bind(tomorrow).all();

  const overdue = await env.DB.prepare(
    `SELECT id, title, due_date, assigned_to AS uid FROM tasks
     WHERE status != 'done' AND due_date IS NOT NULL AND due_date < ? AND assigned_to IS NOT NULL`
  ).bind(today).all();

  let sent = 0;

  for (const task of dueSoon.results || []) {
    const key = `notif:${task.uid}:${task.id}:due:${today}`;
    if (await env.AIDE_SYNC.get(key)) continue;
    await createNotification(env, null, {
      to_user_id: task.uid,
      type: 'task_due_soon',
      title: 'Prazo amanhã',
      body: `"${task.title}" vence amanhã (${task.due_date})`,
      task_id: task.id
    });
    await env.AIDE_SYNC.put(key, '1', { expirationTtl: 86400 });
    sent += 1;
  }

  for (const task of overdue.results || []) {
    const key = `notif:${task.uid}:${task.id}:overdue:${today}`;
    if (await env.AIDE_SYNC.get(key)) continue;
    await createNotification(env, null, {
      to_user_id: task.uid,
      type: 'task_overdue',
      title: 'Tarefa em atraso',
      body: `"${task.title}" estava prevista para ${task.due_date}`,
      task_id: task.id
    });
    await env.AIDE_SYNC.put(key, '1', { expirationTtl: 86400 });
    sent += 1;
  }

  await evaluateAlertRules(env);

  return { dueSoon: (dueSoon.results || []).length, overdue: (overdue.results || []).length, sent };
}

// POST /api/cron/run — owner session OR X-Cron-Secret (used by aide-cron worker).
async function handleCronRun(request, env, ctx) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const cronSecret = request.headers.get('X-Cron-Secret');
  let authorized = !!(env.CRON_SECRET && cronSecret === env.CRON_SECRET);
  if (!authorized) {
    const user = await getUserFromRequest(request, env);
    authorized = !!(user && user.role === 'owner');
  }
  if (!authorized) return json({ error: 'Não autorizado' }, 401);
  const result = await runDailyNotifications(env);
  return json({ ok: true, message: 'Cron executado manualmente', result });
}

// ---------------------------------------------------------------------------
// Alert rules
// ---------------------------------------------------------------------------

function shapeRule(row) {
  let config = {};
  try {
    config = JSON.parse(row.trigger_config || '{}');
  } catch {
    config = {};
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    trigger_type: row.trigger_type,
    trigger_config: config,
    target_user: row.target_user || 'both',
    channel: row.channel || 'both',
    active: !!row.active,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handleAlertRules(request, env, user) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT * FROM alert_rules ORDER BY created_at DESC').all();
      return json((results || []).map(shapeRule));
    } catch {
      return json([]);
    }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name || !body.trigger_type) return json({ error: 'Nome e tipo são obrigatórios' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO alert_rules (id, created_by, name, description, trigger_type, trigger_config, target_user, channel, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, user.id, body.name, body.description || '', body.trigger_type,
      JSON.stringify(body.trigger_config || {}), body.target_user || 'both',
      body.channel || 'both', body.active === false ? 0 : 1, now, now
    ).run();
    const row = await env.DB.prepare('SELECT * FROM alert_rules WHERE id = ?').bind(id).first();
    return json(shapeRule(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleAlertRuleItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method === 'PUT') {
    const existing = await env.DB.prepare('SELECT * FROM alert_rules WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Regra não encontrada' }, 404);
    const body = (await readJson(request)) || {};
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE alert_rules SET name=?, description=?, trigger_type=?, trigger_config=?, target_user=?, channel=?, active=?, updated_at=? WHERE id=?`
    ).bind(
      body.name !== undefined ? body.name : existing.name,
      body.description !== undefined ? body.description : existing.description,
      body.trigger_type !== undefined ? body.trigger_type : existing.trigger_type,
      body.trigger_config !== undefined ? JSON.stringify(body.trigger_config || {}) : existing.trigger_config,
      body.target_user !== undefined ? body.target_user : existing.target_user,
      body.channel !== undefined ? body.channel : existing.channel,
      body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
      now, id
    ).run();
    const row = await env.DB.prepare('SELECT * FROM alert_rules WHERE id = ?').bind(id).first();
    return json(shapeRule(row));
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM alert_rules WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleAlertRuleTest(request, env, user, id) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const row = await env.DB.prepare('SELECT * FROM alert_rules WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Regra não encontrada' }, 404);
  let config = {};
  try {
    config = JSON.parse(row.trigger_config || '{}');
  } catch {
    config = {};
  }
  const triggered = await evaluateRule(row, config, env, true);
  return json({ ok: true, triggered });
}

async function getRoleUsers(env) {
  const { results } = await env.DB.prepare('SELECT id, role FROM users').all();
  const owner = (results || []).find((u) => u.role === 'owner');
  const assistant = (results || []).find((u) => u.role === 'assistant');
  return { ownerId: owner ? owner.id : null, assistantId: assistant ? assistant.id : null };
}

function targetUserIds(target, roleUsers) {
  if (target === 'lauro') return [roleUsers.ownerId].filter(Boolean);
  if (target === 'alice') return [roleUsers.assistantId].filter(Boolean);
  return [roleUsers.ownerId, roleUsers.assistantId].filter(Boolean);
}

// Insert in-app notification and/or push, honoring channel ('app'|'push'|'both').
async function deliverAlert(env, userId, type, title, body, channel) {
  if (channel === 'app' || channel === 'both') {
    await env.DB.prepare(
      `INSERT INTO notifications (id, from_user_id, to_user_id, type, title, body, task_id, note_id, read, created_at)
       VALUES (?,?,?,?,?,?,?,?,0,?)`
    ).bind(crypto.randomUUID(), null, userId, type, title, body || '', null, null, Math.floor(Date.now() / 1000)).run();
  }
  if (channel === 'push' || channel === 'both') {
    await pushToUser(env, userId, {
      title, body: body || '', icon: '/icon-192.png', badge: '/icon-192.png', data: { url: '/' }
    });
  }
}

async function evaluateAlertRules(env) {
  let results = [];
  try {
    ({ results } = await env.DB.prepare('SELECT * FROM alert_rules WHERE active = 1').all());
  } catch {
    return; // alert_rules table not migrated yet
  }
  for (const rule of results || []) {
    let config = {};
    try {
      config = JSON.parse(rule.trigger_config || '{}');
    } catch {
      config = {};
    }
    try {
      await evaluateRule(rule, config, env, false);
    } catch {
      /* one rule failing shouldn't block others */
    }
  }
}

async function evaluateRule(rule, config, env, force) {
  const today = new Date().toISOString().split('T')[0];
  const dedupKey = `alert:${rule.id}:${today}`;
  if (!force && (await env.AIDE_SYNC.get(dedupKey))) return false;

  const threshold = Number(config.threshold) || 0;
  let triggered = false;
  let body = rule.description || '';

  if (rule.trigger_type === 'task_overdue') {
    const cutoff = new Date(Date.now() - threshold * 86400000).toISOString().split('T')[0];
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND due_date IS NOT NULL AND due_date < ?").bind(cutoff).first();
    if ((r ? r.n : 0) > 0) { triggered = true; body = `${r.n} tarefa(s) em atraso há mais de ${threshold} dia(s).`; }
  } else if (rule.trigger_type === 'task_no_date') {
    const cutoff = Math.floor((Date.now() - threshold * 86400000) / 1000);
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND (due_date IS NULL OR due_date = '') AND created_at < ?").bind(cutoff).first();
    if ((r ? r.n : 0) > 0) { triggered = true; body = `${r.n} tarefa(s) sem data há mais de ${threshold} dia(s).`; }
  } else if (rule.trigger_type === 'task_no_update') {
    const cutoff = Math.floor((Date.now() - threshold * 86400000) / 1000);
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND updated_at < ?").bind(cutoff).first();
    if ((r ? r.n : 0) > 0) { triggered = true; body = `${r.n} tarefa(s) sem atualização há mais de ${threshold} dia(s).`; }
  } else if (rule.trigger_type === 'timer_running_long') {
    const cutoff = Math.floor(Date.now() / 1000) - threshold * 3600;
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE ended_at IS NULL AND started_at < ?').bind(cutoff).first();
    if ((r ? r.n : 0) > 0) { triggered = true; body = `Timer rodando há mais de ${threshold}h.`; }
  } else if (rule.trigger_type === 'weekly_hours_low') {
    const monday = mondayOf(today);
    const weekStartTs = Math.floor(new Date(`${monday}T00:00:00Z`).getTime() / 1000);
    const r = await env.DB.prepare('SELECT COALESCE(SUM(duration_seconds),0) AS s FROM time_entries WHERE started_at >= ?').bind(weekStartTs).first();
    const hours = (r ? r.s : 0) / 3600;
    if (hours < threshold) { triggered = true; body = `Apenas ${hours.toFixed(1)}h registradas esta semana (mínimo ${threshold}h).`; }
  } else if (rule.trigger_type === 'custom_day') {
    const dow = new Date().getUTCDay() === 0 ? 7 : new Date().getUTCDay();
    if (Number(config.day) === dow) triggered = true;
  }

  if (force) triggered = true;
  if (!triggered) return false;

  const roleUsers = await getRoleUsers(env);
  for (const uid of targetUserIds(rule.target_user, roleUsers)) {
    await deliverAlert(env, uid, 'alert', rule.name, body, rule.channel || 'both');
  }
  if (!force) await env.AIDE_SYNC.put(dedupKey, '1', { expirationTtl: 86400 });
  return true;
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

function resolveRateFromRow(e, defaultRate) {
  if (e.t_rate_type && e.t_rate_type !== 'inherit') return { type: e.t_rate_type, value: e.t_rate_value || 0 };
  if (e.p_rate_type && e.p_rate_type !== 'inherit') return { type: e.p_rate_type, value: e.p_rate_value || 0 };
  return { type: 'hourly', value: defaultRate || 0 };
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
  const end = Math.floor(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / 1000);
  return { start, end };
}

async function computePaymentSummary(env, month) {
  const { start, end } = monthRange(month);
  const { assistantId } = await getRoleUsers(env);
  const { results } = await env.DB.prepare(
    `SELECT e.*, t.title AS task_title, t.project_id, t.rate_type AS t_rate_type, t.rate_value AS t_rate_value,
            p.name AS project_name, p.rate_type AS p_rate_type, p.rate_value AS p_rate_value
     FROM time_entries e
     LEFT JOIN tasks t ON e.task_id = t.id
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at < ?
     ORDER BY e.started_at`
  ).bind(assistantId, start, end).all();

  const avail = await env.DB.prepare('SELECT hourly_rate FROM availability WHERE user_id = ?').bind(assistantId).first();
  const defaultRate = avail ? avail.hourly_rate || 0 : 0;

  const fixedSeen = new Set();
  const entries = [];
  let totalHours = 0;
  let totalDue = 0;
  let totalPaid = 0;

  for (const e of results || []) {
    const rate = resolveRateFromRow(e, defaultRate);
    const hours = (e.duration_seconds || 0) / 3600;
    let amount;
    if (rate.type === 'fixed') {
      if (e.task_id && fixedSeen.has(e.task_id)) {
        amount = 0;
      } else {
        amount = rate.value;
        if (e.task_id) fixedSeen.add(e.task_id);
      }
    } else {
      amount = hours * rate.value;
    }
    totalHours += hours;
    totalDue += amount;
    if (e.paid) totalPaid += amount;
    entries.push({
      id: e.id,
      taskId: e.task_id,
      taskTitle: e.task_title || '—',
      projectName: e.project_name || null,
      rateType: rate.type,
      rateValue: rate.value,
      hours: Math.round(hours * 100) / 100,
      amount: Math.round(amount * 100) / 100,
      paid: !!e.paid
    });
  }

  const pd = await env.DB.prepare('SELECT pix_key, pix_key_type, bank_name FROM user_profile_data WHERE user_id = ?').bind(assistantId).first();

  return {
    month,
    totalHours: Math.round(totalHours * 100) / 100,
    totalDue: Math.round(totalDue * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    balance: Math.round((totalDue - totalPaid) * 100) / 100,
    entries,
    alicePixKey: pd ? pd.pix_key || '' : '',
    alicePixKeyType: pd ? pd.pix_key_type || '' : '',
    aliceBankName: pd ? pd.bank_name || '' : ''
  };
}

async function handlePaymentSummary(request, env, user) {
  const month = new URL(request.url).searchParams.get('month') || new Date().toISOString().slice(0, 7);
  return json(await computePaymentSummary(env, month));
}

async function handlePaymentEntryPaid(request, env, user, id) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  if (!id) return json({ error: 'ID ausente' }, 400);
  const body = (await readJson(request)) || {};
  const paid = body.paid ? 1 : 0;
  const paidAt = paid ? (body.paid_at ? Math.floor(new Date(body.paid_at).getTime() / 1000) : Math.floor(Date.now() / 1000)) : null;
  await env.DB.prepare('UPDATE time_entries SET paid = ?, paid_at = ? WHERE id = ?').bind(paid, paidAt, id).run();
  return json({ ok: true, paid: !!paid });
}

// ---------------------------------------------------------------------------
// Personal data
// ---------------------------------------------------------------------------

function shapePersonal(row, userId) {
  if (!row) {
    return { user_id: userId, phone: '', pix_key: '', pix_key_type: '', bank_name: '', extra_info: {} };
  }
  let extra = {};
  try {
    extra = JSON.parse(row.extra_info || '{}');
  } catch {
    extra = {};
  }
  return {
    user_id: row.user_id,
    phone: row.phone || '',
    pix_key: row.pix_key || '',
    pix_key_type: row.pix_key_type || '',
    bank_name: row.bank_name || '',
    extra_info: extra,
    updated_at: row.updated_at
  };
}

async function handlePersonalData(request, env, user) {
  if (request.method === 'GET') {
    try {
      const row = await env.DB.prepare('SELECT * FROM user_profile_data WHERE user_id = ?').bind(user.id).first();
      return json(shapePersonal(row, user.id));
    } catch {
      return json(shapePersonal(null, user.id));
    }
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO user_profile_data (user_id, phone, pix_key, pix_key_type, bank_name, extra_info, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone, pix_key=excluded.pix_key,
         pix_key_type=excluded.pix_key_type, bank_name=excluded.bank_name, extra_info=excluded.extra_info, updated_at=excluded.updated_at`
    ).bind(
      user.id, body.phone || '', body.pix_key || '', body.pix_key_type || '',
      body.bank_name || '', JSON.stringify(body.extra_info || {}), now
    ).run();
    const row = await env.DB.prepare('SELECT * FROM user_profile_data WHERE user_id = ?').bind(user.id).first();
    return json(shapePersonal(row, user.id));
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handlePersonalDataByUser(request, env, user, userId) {
  if (user.role !== 'owner') return json({ error: 'Não autorizado' }, 403);
  const row = await env.DB.prepare('SELECT * FROM user_profile_data WHERE user_id = ?').bind(userId).first();
  return json(shapePersonal(row, userId));
}

// ---------------------------------------------------------------------------
// Monthly report
// ---------------------------------------------------------------------------

async function handleMonthlyReport(request, env, user) {
  const month = new URL(request.url).searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const summary = await computePaymentSummary(env, month);
  const { start, end } = monthRange(month);
  const { results } = await env.DB.prepare(
    `${TASK_SELECT} WHERE t.status = 'done' AND t.updated_at >= ? AND t.updated_at < ? ORDER BY t.updated_at DESC`
  ).bind(start, end).all();
  const completedTasks = (results || []).map(shapeTask);

  const report = { ...summary, completedTasks, generatedAt: Math.floor(Date.now() / 1000) };

  const existing = await env.DB.prepare('SELECT id FROM monthly_reports WHERE month = ?').bind(month).first();
  const now = Math.floor(Date.now() / 1000);
  if (existing) {
    await env.DB.prepare(
      `UPDATE monthly_reports SET generated_at=?, generated_by=?, total_hours=?, total_due=?, total_paid=?, tasks_completed=?, report_data=? WHERE id=?`
    ).bind(now, user.id, summary.totalHours, summary.totalDue, summary.totalPaid, completedTasks.length, JSON.stringify(report), existing.id).run();
  } else {
    await env.DB.prepare(
      `INSERT INTO monthly_reports (id, month, generated_at, generated_by, total_hours, total_due, total_paid, tasks_completed, report_data)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(crypto.randomUUID(), month, now, user.id, summary.totalHours, summary.totalDue, summary.totalPaid, completedTasks.length, JSON.stringify(report)).run();
  }
  return json(report);
}

async function handleReportsList(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, month, generated_at, total_hours, total_due, total_paid, tasks_completed FROM monthly_reports ORDER BY month DESC'
  ).all();
  return json(results || []);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

async function handleAliceTimer(env, user) {
  const { assistantId } = await getRoleUsers(env);
  if (!assistantId) return json({ active: false });
  const row = await env.DB.prepare(
    `${ENTRY_SELECT} WHERE e.user_id = ? AND e.ended_at IS NULL`
  ).bind(assistantId).first();
  if (!row) return json({ active: false });
  return json({
    active: true,
    taskTitle: row.task_title || 'Sem tarefa',
    startedAt: row.started_at,
    elapsedSeconds: Math.max(0, Math.floor(Date.now() / 1000) - row.started_at)
  });
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    }
  });
}

function corsResponse() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    }
  });
}
