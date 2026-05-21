// AIDE — Cloudflare Pages Advanced Mode Worker
// Handles /api/* routes; everything else falls through to static assets.

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle API routes
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, env, ctx);
    }

    // ALL other routes: serve React static assets
    return env.ASSETS.fetch(request);
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

  // Protected routes — require valid session token
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  if (path === '/api/auth/me') return json(publicUser(user));

  if (path === '/api/users') return handleUsers(env);

  if (path === '/api/tasks') return handleTasksCollection(request, env, user);
  if (path.startsWith('/api/tasks/')) return handleTaskItem(request, env, user, path.split('/')[3]);

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
const OAUTH_SCOPES = 'openid email profile';

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
    'SELECT id, email, name, avatar, role FROM users ORDER BY role DESC, name'
  ).all();
  return json(results || []);
}

async function handleTasksCollection(request, env, user) {
  if (request.method === 'GET') {
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
    return json(shapeTask(row), 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleTaskItem(request, env, user, taskId) {
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
    return json(shapeTask(row));
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
