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

  // Gmail (conta externa lcestech) — OAuth. `auth` autentica o owner via ?token=
  // (é uma navegação do browser, sem header Authorization); `callback` é público
  // porque o Google redireciona o browser para cá sem sessão.
  if (path === '/api/gmail/auth') return handleGmailAuth(request, env);
  if (path === '/api/gmail/callback') return handleGmailCallback(request, env);

  // Bridge — auth handled inside (AIDE session OR X-Bridge-Secret).
  if (path.startsWith('/api/bridge/')) return handleBridge(request, env, ctx, path);

  // Cron run — auth handled inside (owner session OR X-Cron-Secret).
  if (path === '/api/cron/run') return handleCronRun(request, env, ctx);

  // Hub — ingestão externa: NÃO usa sessão, autentica por API key
  // (Authorization: ApiKey <chave>). Tem de vir antes do gate de sessão.
  if (path === '/api/hub/items' && method === 'POST') return handleHubIngest(request, env);

  // Protected routes — require valid session token
  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: 'Não autorizado' }, 401);

  if (path === '/api/auth/me') {
    await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?')
      .bind(Math.floor(Date.now() / 1000), user.id).run();
    return json(publicUser(user));
  }

  if (path === '/api/users') return handleUsers(env);
  // Multi-user admin (owner-only — guard lives inside each handler).
  if (path === '/api/users/all') return handleUsersAll(request, env, user);
  if (path === '/api/users/pending') return handleUsersPending(request, env, user);
  if (path.match(/^\/api\/users\/[^/]+\/(approve|role|permissions|archive|granular-permissions)$/)) {
    const parts = path.split('/');
    return handleUserAction(request, env, user, parts[3], parts[4]);
  }
  if (path === '/api/profile') return handleProfileUpdate(request, env, user);

  // Exports
  if (path === '/api/export/tasks') return handleExportTasks(env);
  if (path === '/api/export/notes') return handleExportNotes(env);

  if (path === '/api/tasks') return handleTasksCollection(request, env, user, ctx);
  // Task files — must match BEFORE the generic /api/tasks/:id route below.
  if (path.match(/^\/api\/tasks\/[^/]+\/files\/link$/)) {
    return handleAttachmentLink(request, env, user, 'task', path.split('/')[3]);
  }
  if (path.match(/^\/api\/tasks\/[^/]+\/files$/)) {
    return handleAttachmentFiles(request, env, user, 'task', path.split('/')[3]);
  }
  if (path.match(/^\/api\/tasks\/[^/]+\/files\/[^/]+$/)) {
    const parts = path.split('/');
    return handleAttachmentItem(request, env, user, 'task', parts[3], parts[5]);
  }
  if (path.startsWith('/api/tasks/')) return handleTaskItem(request, env, user, path.split('/')[3], ctx);

  if (path === '/api/projects') return handleProjectsCollection(request, env, user);
  if (path.startsWith('/api/projects/')) return handleProjectItem(request, env, user, path.split('/')[3]);

  // Hierarchy — Áreas > Projetos > Frentes
  if (path === '/api/areas') return handleAreas(request, env, user);
  if (path.startsWith('/api/areas/')) return handleAreaItem(request, env, user, path.split('/')[3]);
  if (path === '/api/fronts') return handleFronts(request, env, user);
  if (path.startsWith('/api/fronts/')) return handleFrontItem(request, env, user, path.split('/')[3]);

  // Networking
  if (path === '/api/network/routes') return handleNetworkRoutes(request, env, user);
  if (path === '/api/network/people') return handleNetworkPeople(request, env, user);
  // Interações de contato (contact_interactions) — antes da rota genérica de pessoa.
  if (path.match(/^\/api\/network\/people\/[^/]+\/interactions$/)) {
    return handleContactInteractions(request, env, user, path.split('/')[4]);
  }
  if (path.match(/^\/api\/network\/people\/[^/]+\/interactions\/[^/]+$/)) {
    return handleContactInteractionItem(request, env, user, path.split('/')[4], path.split('/')[6]);
  }
  if (path.startsWith('/api/network/people/')) return handleNetworkPersonItem(request, env, user, path.split('/')[4]);
  if (path === '/api/network/institutions') return handleNetworkInstitutions(request, env, user);
  if (path.startsWith('/api/network/institutions/')) return handleNetworkInstitutionItem(request, env, user, path.split('/')[4]);
  if (path === '/api/network/connections') return handleNetworkConnections(request, env, user);
  if (path.startsWith('/api/network/connections/')) return handleNetworkConnectionItem(request, env, user, path.split('/')[4]);

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
  if (path === '/api/availability/weekly') return handleAvailabilityWeekly(request, env, user);
  if (path === '/api/availability/schedule') return handleAvailabilitySchedule(request, env, user);
  if (path.startsWith('/api/availability/schedule/')) return handleAvailabilityScheduleItem(request, env, user, path.split('/')[4]);
  if (path === '/api/availability/all') return handleAvailabilityAll(request, env, user);

  // Calendar
  if (path === '/api/calendar/events') return handleCalendarEvents(request, env, user);
  if (path.startsWith('/api/calendar/events/')) return handleCalendarEventItem(request, env, user, path.split('/')[4]);
  if (path === '/api/calendar/sync') return handleCalendarSync(request, env, user);
  if (path === '/api/calendar/list') return handleCalendarList(request, env, user);

  // Access control (legacy owner-only)
  if (path === '/api/access/drive') return handleAccessDrive(request, env, user);
  if (path.startsWith('/api/access/drive/')) return handleAccessDriveItem(request, env, user, path.split('/')[4]);
  if (path === '/api/access/calendar') return handleAccessCalendar(request, env, user);
  if (path.startsWith('/api/access/calendar/')) return handleAccessCalendarItem(request, env, user, path.split('/')[4]);

  // Bidirectional sharing (v1.8) — either user can grant the other access.
  if (path === '/api/sharing/drive') return handleSharingDrive(request, env, user);
  if (path.startsWith('/api/sharing/drive/')) return handleSharingDriveItem(request, env, user, path.split('/')[4]);
  if (path === '/api/sharing/calendar') return handleSharingCalendar(request, env, user);
  if (path.startsWith('/api/sharing/calendar/')) return handleSharingCalendarItem(request, env, user, path.split('/')[4]);

  // Drive
  if (path === '/api/drive/files') return handleDriveFiles(request, env, user);
  if (path === '/api/drive/favorites') return handleDriveFavorites(request, env, user);
  if (path.startsWith('/api/drive/favorites/')) return handleDriveFavoriteToggle(request, env, user, path.split('/')[4]);
  if (path === '/api/drive/sort') return handleDriveSort(request, env, user);

  // Notes
  if (path === '/api/notes') return handleNotes(request, env, user);
  // Note images — must match BEFORE the generic /api/notes/:id route below.
  if (path.startsWith('/api/notes/') && path.endsWith('/images')) {
    return handleNoteImages(request, env, user, path.split('/')[3]);
  }
  if (path.match(/^\/api\/notes\/[^/]+\/images\/[^/]+$/)) {
    const parts = path.split('/');
    return handleNoteImageItem(request, env, user, parts[3], parts[5]);
  }
  // Note files (drag&drop + Drive link)
  if (path.match(/^\/api\/notes\/[^/]+\/files\/link$/)) {
    return handleAttachmentLink(request, env, user, 'note', path.split('/')[3]);
  }
  if (path.match(/^\/api\/notes\/[^/]+\/files$/)) {
    return handleAttachmentFiles(request, env, user, 'note', path.split('/')[3]);
  }
  if (path.match(/^\/api\/notes\/[^/]+\/files\/[^/]+$/)) {
    const parts = path.split('/');
    return handleAttachmentItem(request, env, user, 'note', parts[3], parts[5]);
  }
  if (path.startsWith('/api/notes/')) return handleNoteItem(request, env, user, path.split('/')[3]);

  // Notifications
  if (path === '/api/notifications') return handleNotifications(request, env, user, ctx);
  if (path === '/api/notifications/read-all') return handleNotificationsReadAll(request, env, user);
  if (path === '/api/notifications/scheduled') return handleScheduledNotifications(request, env, user, ctx);
  if (path.startsWith('/api/notifications/scheduled/')) return handleScheduledNotificationItem(request, env, user, path.split('/')[4]);
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
  if (path === '/api/payment/default-rate') return handlePaymentDefaultRate(request, env, user);
  if (path.startsWith('/api/payment/entries/') && path.endsWith('/paid')) {
    return handlePaymentEntryPaid(request, env, user, path.split('/')[4]);
  }

  // Exchange (BRL → EUR), cached daily in D1.
  if (path === '/api/exchange/rate') return handleExchangeRate(request, env);

  // Meeting (wraps the standard timer with a fixed "Reunião AIDE" task).
  if (path === '/api/meeting/start') return handleMeetingStart(request, env, user);
  if (path === '/api/meeting/stop') return handleMeetingStop(request, env, user);
  if (path === '/api/meeting/status') return handleMeetingStatus(request, env, user);
  if (path === '/api/meeting/notes') return handleMeetingNotes(request, env, user);

  // Personal data
  if (path === '/api/profile/personal') return handlePersonalData(request, env, user);
  if (path.startsWith('/api/profile/personal/')) return handlePersonalDataByUser(request, env, user, path.split('/')[4]);

  // Reports
  if (path === '/api/reports/monthly') return handleMonthlyReport(request, env, user);
  if (path === '/api/reports/list') return handleReportsList(env);

  // Dashboard
  if (path === '/api/dashboard/alice-timer') return handleAliceTimer(env, user);

  // Chat — general channel (v1.10 multi-user).
  if (path === '/api/chat/messages') return handleChatMessages(request, env, user, ctx);
  if (path.match(/^\/api\/chat\/messages\/[^/]+$/)) {
    return handleChatMessageItem(request, env, user, path.split('/')[4]);
  }

  // Mercado (Etapa 2) — organizações, projetos, contatos profissionais, importação.
  if (path === '/api/market/organizations') return handleMarketOrganizations(request, env, user);
  // Detalhe agregado da organização (OrgDetailPage, v2.4.2) — deve casar ANTES da rota genérica de item.
  if (path.match(/^\/api\/market\/organizations\/[^/]+\/full$/) && request.method === 'GET') {
    return handleMarketOrgFull(request, env, user, path.split('/')[4]);
  }
  if (path.startsWith('/api/market/organizations/')) return handleMarketOrganizationItem(request, env, user, path.split('/')[4]);
  if (path === '/api/market/projects') return handleMarketProjects(request, env, user);
  if (path.startsWith('/api/market/projects/')) return handleMarketProjectItem(request, env, user, path.split('/')[4]);
  if (path === '/api/market/contacts') return handleMarketContacts(request, env, user);
  if (path === '/api/market/contacts/link') return handleMarketContactLink(request, env, user);
  // contacts/:personId/professional — deve casar ANTES da rota genérica de item.
  if (path.match(/^\/api\/market\/contacts\/[^/]+\/professional$/)) {
    return handleMarketContactProfessional(request, env, user, path.split('/')[4]);
  }
  if (path.startsWith('/api/market/contacts/')) return handleMarketContactItem(request, env, user, path.split('/')[4]);
  if (path === '/api/market/import') return handleMarketImport(request, env, user);
  // Notas de mercado (v2.4.2) — CRUD separado de /api/notes.
  if (path === '/api/market/notes') return handleMarketNotes(request, env, user);
  if (path.startsWith('/api/market/notes/')) return handleMarketNoteItem(request, env, user, path.split('/')[4]);
  // Anexos Drive por organização — reaproveita o sistema de anexos (kind 'market_org').
  // A ordem importa: /files/link deve casar ANTES de /files/:fileId.
  if (path.match(/^\/api\/market\/org\/[^/]+\/files\/link$/)) {
    return handleAttachmentLink(request, env, user, 'market_org', path.split('/')[4]);
  }
  if (path.match(/^\/api\/market\/org\/[^/]+\/files$/)) {
    return handleAttachmentFiles(request, env, user, 'market_org', path.split('/')[4]);
  }
  if (path.match(/^\/api\/market\/org\/[^/]+\/files\/[^/]+$/)) {
    const parts = path.split('/');
    return handleAttachmentItem(request, env, user, 'market_org', parts[4], parts[6]);
  }

  // Carreira (Etapa 2) — oportunidades, documentos, metas.
  if (path === '/api/career/opportunities') return handleCareerOpportunities(request, env, user);
  if (path.startsWith('/api/career/opportunities/')) return handleCareerOpportunityItem(request, env, user, path.split('/')[4]);
  if (path === '/api/career/documents') return handleCareerDocuments(request, env, user);
  if (path.startsWith('/api/career/documents/')) return handleCareerDocumentItem(request, env, user, path.split('/')[4]);
  if (path === '/api/career/goals') return handleCareerGoals(request, env, user);
  if (path.startsWith('/api/career/goals/')) return handleCareerGoalItem(request, env, user, path.split('/')[4]);

  // Eventos & Venues de Publicação (v2.5.0). A ordem importa: rotas específicas
  // (import, sub-recursos de venues por evento) antes das genéricas de item.
  if (path === '/api/events/import') return handleEventsImport(request, env, user);
  if (path === '/api/events') return handleEvents(request, env, user);
  // /api/events/:id/venues e /api/events/:id/venues/:linkId — antes do item genérico.
  if (path.match(/^\/api\/events\/[^/]+\/venues\/[^/]+$/)) {
    const parts = path.split('/');
    return handleEventVenueLinkItem(request, env, user, parts[3], parts[5]);
  }
  if (path.match(/^\/api\/events\/[^/]+\/venues$/)) {
    return handleEventVenues(request, env, user, path.split('/')[3]);
  }
  if (path.startsWith('/api/events/')) return handleEventItem(request, env, user, path.split('/')[3]);
  if (path === '/api/venues') return handleVenues(request, env, user);
  if (path.startsWith('/api/venues/')) return handleVenueItem(request, env, user, path.split('/')[3]);

  // Hub — leitura protegida por sessão (owner / assistente fixo).
  // (POST /api/hub/items é tratado acima, antes do gate de sessão.)
  if (path === '/api/hub/items') return handleHubItems(request, env, user);
  // /bulk e /bulk/project antes do genérico /:id — senão "bulk" seria lido como um id.
  if (path === '/api/hub/items/bulk' && method === 'DELETE') return handleHubItemsBulkDelete(request, env, user);
  if (path === '/api/hub/items/bulk/project' && method === 'PATCH') return handleHubItemsBulkProject(request, env, user);
  // /:id/archive antes do genérico /:id.
  if (path.match(/^\/api\/hub\/items\/[^/]+\/archive$/) && method === 'PATCH') {
    return handleHubItemArchive(request, env, user, path.split('/')[4]);
  }
  if (path.startsWith('/api/hub/items/')) return handleHubItemById(request, env, user, path.split('/')[4]);
  if (path === '/api/hub/stats') return handleHubStats(request, env, user);
  if (path === '/api/hub/excluded-ids') return handleHubExcludedIds(request, env, user);

  // Gmail (conta externa lcestech) — sincronização e leitura. Todos os usuários
  // autenticados podem sincronizar/ler; só o owner conecta a conta (rota pública
  // acima). A ordem importa: rotas específicas antes das genéricas de item.
  if (path === '/api/gmail/disconnect') return handleGmailDisconnect(request, env, user);
  if (path === '/api/gmail/sync') return handleGmailSync(request, env, user);
  if (path === '/api/gmail/mark-read') return handleGmailMarkRead(request, env, user);
  if (path.match(/^\/api\/gmail\/emails\/[^/]+\/star$/)) {
    return handleGmailEmailStar(request, env, user, path.split('/')[4]);
  }
  if (path === '/api/gmail/emails') return handleGmailEmails(request, env, user);
  if (path.startsWith('/api/gmail/emails/')) return handleGmailEmailItem(request, env, user, path.split('/')[4]);

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
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  // drive.file is required to upload note images. Owner must re-authenticate
  // after deploy to grant this scope; existing read-only access is unaffected.
  'https://www.googleapis.com/auth/drive.file'
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

  // 2b. Multi-user role/status resolution (v1.10).
  //   - OWNER_EMAIL match            → role='owner',             status='active'.
  //   - ALLOWED_EMAILS match         → role='assistant_fixed',   status='active'.
  //   - Anyone else                  → role='assistant_external',status='pending'.
  // Pending users have a session row created in D1 but the redirect below
  // omits the token, so they can't call any API until the owner approves.
  const ownerEmail = (env.OWNER_EMAIL || '').trim().toLowerCase();
  const incomingEmail = (profile.email || '').toLowerCase();
  const isOwnerEmail = !!ownerEmail && incomingEmail === ownerEmail;
  const rawAllow = (env.ALLOWED_EMAILS || '').trim();
  const allowedList = rawAllow
    ? rawAllow.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  // If ALLOWED_EMAILS is unset, treat every Google sign-in as allowed (the
  // pre-multi-user "everyone gets in" behavior). When set, only listed
  // emails count as allowed; the rest become pending.
  const isAllowedEmail = allowedList.length === 0 || allowedList.includes(incomingEmail);

  let newRole;
  let newStatus;
  let newUserType;
  if (isOwnerEmail) {
    newRole = 'owner'; newStatus = 'active'; newUserType = 'fixed';
  } else if (isAllowedEmail) {
    newRole = 'assistant_fixed'; newStatus = 'active'; newUserType = 'fixed';
  } else {
    newRole = 'assistant_external'; newStatus = 'pending'; newUserType = 'external';
  }

  // 3. Existing users keep their stored role/status/user_type — only profile
  //    fields + Google tokens get refreshed. New users get the computed
  //    multi-user shape from step 2b.
  let existing = null;
  try {
    existing = await env.DB.prepare(
      'SELECT role, status, user_type FROM users WHERE id = ?'
    ).bind(userId).first();
  } catch {
    try {
      existing = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
    } catch { existing = null; }
  }

  if (existing) {
    await env.DB.prepare(
      `UPDATE users SET email = ?, name = ?, avatar = ?,
         google_access_token = ?, google_refresh_token = ?, google_token_expires_at = ?,
         last_seen_at = ? WHERE id = ?`
    ).bind(
      profile.email, profile.name || null, profile.picture || null,
      access_token, refresh_token || null, expires_at, now, userId
    ).run();
    // Owner promotion: a returning user whose email now matches OWNER_EMAIL
    // but whose stored role drifted (e.g. seeded as assistant before
    // OWNER_EMAIL was configured) gets upgraded. We never demote here.
    if (isOwnerEmail && existing.role !== 'owner') {
      try {
        await env.DB.prepare(
          "UPDATE users SET role = 'owner', status = 'active', user_type = 'fixed' WHERE id = ?"
        ).bind(userId).run();
      } catch {
        await env.DB.prepare("UPDATE users SET role = 'owner' WHERE id = ?").bind(userId).run();
      }
    }
  } else {
    // Brand-new user — insert with full multi-user shape. Fall back to the
    // legacy column set if migration 0022 hasn't landed in this environment.
    try {
      await env.DB.prepare(
        `INSERT INTO users
           (id, email, name, avatar, role, user_type, status,
            google_access_token, google_refresh_token, google_token_expires_at,
            created_at, last_seen_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        userId, profile.email, profile.name || null, profile.picture || null,
        newRole, newUserType, newStatus,
        access_token, refresh_token || null, expires_at, now, now
      ).run();
    } catch {
      await env.DB.prepare(
        `INSERT INTO users
           (id, email, name, avatar, role,
            google_access_token, google_refresh_token, google_token_expires_at,
            created_at, last_seen_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        userId, profile.email, profile.name || null, profile.picture || null,
        newRole, access_token, refresh_token || null, expires_at, now, now
      ).run();
    }
  }

  // Decide the effective status AFTER the upsert (handles both new + returning
  // users uniformly). Legacy schema without a status column → treat as active.
  let effectiveStatus = 'active';
  try {
    const row = await env.DB.prepare('SELECT status FROM users WHERE id = ?').bind(userId).first();
    if (row && row.status) effectiveStatus = row.status;
  } catch { /* legacy schema */ }

  // 4. Tokens are persisted in the users table above (no KV write — KV write
  //    limits are shared with Lifegame).

  // 5. Create session in D1 (30 days). Pending users also get a session row,
  //    but the token is withheld in step 6 below.
  const sessionToken = crypto.randomUUID();
  const sessionExpires = now + 60 * 60 * 24 * 30;
  await env.DB.prepare(
    'INSERT INTO sessions (id, user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), userId, sessionToken, sessionExpires, now).run();

  // 6. Bounce back to the frontend. Pending users land at /?pending=true with
  //    no token; everyone else gets the standard /?token=... handoff.
  const redirectBase = new URL(getRedirectUri(request, env)).origin;
  const dest = new URL('/', redirectBase);
  if (effectiveStatus === 'pending') {
    dest.searchParams.set('pending', 'true');
  } else {
    dest.searchParams.set('token', sessionToken);
  }
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
// Gmail — conta externa dedicada (lcestech.consulting@gmail.com)
//
// Uma única conta compartilhada: o owner autoriza uma vez (scope gmail.readonly)
// e o token/refresh_token ficam em external_accounts. Todos os usuários AIDE
// leem os e-mails sincronizados em gmail_emails; ninguém responde pelo AIDE
// (o botão "Abrir no Gmail" leva ao webmail). Escopo somente-leitura.
// ---------------------------------------------------------------------------

const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Callback próprio da integração Gmail (distinto de /api/auth/callback). Segue a
// mesma lógica de PROD_HOST/override do login para funcionar em dev e produção.
function getGmailRedirectUri(request, env) {
  const url = new URL(request.url);
  if (url.host === PROD_HOST) return `https://${PROD_HOST}/api/gmail/callback`;
  if (env.GMAIL_REDIRECT_URI) return env.GMAIL_REDIRECT_URI.trim();
  return `${url.origin}/api/gmail/callback`;
}

// Resolve o usuário a partir de um token de sessão avulso (query param). O fluxo
// OAuth começa com uma navegação do browser, sem header Authorization, então o
// front envia ?token=<sessão> e validamos o owner aqui.
async function getUserByToken(token, env) {
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  try {
    return await env.DB.prepare(
      `SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?`
    ).bind(token, now).first();
  } catch { return null; }
}

// GET /api/gmail/auth — inicia o OAuth da conta externa (owner only).
async function handleGmailAuth(request, env) {
  const url = new URL(request.url);
  const headerToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  const token = url.searchParams.get('token') || headerToken;
  const user = await getUserByToken(token, env);
  if (!user || user.role !== 'owner') {
    return json({ error: 'Apenas o owner pode conectar a conta Gmail' }, 403);
  }
  const params = new URLSearchParams({
    client_id: clientId(env),
    redirect_uri: getGmailRedirectUri(request, env),
    response_type: 'code',
    scope: GMAIL_SCOPES,
    state: 'gmail_external',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  return Response.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
}

// GET /api/gmail/callback — troca o code por tokens, descobre o e-mail da conta
// e faz upsert em external_accounts; redireciona para /gmail?connected=true.
async function handleGmailCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  const redirectBase = new URL(getGmailRedirectUri(request, env)).origin;
  const back = (params) => Response.redirect(new URL(`/gmail?${params}`, redirectBase).toString(), 302);

  if (error) return back(`error=${encodeURIComponent(error)}`);
  if (!code) return back('error=missing_code');

  const tokenResp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(env),
      client_secret: clientSecret(env),
      redirect_uri: getGmailRedirectUri(request, env),
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenResp.ok) return back('error=token_exchange_failed');
  const tokenData = await tokenResp.json();
  const { access_token, refresh_token, expires_in } = tokenData;
  if (!access_token) return back('error=no_access_token');

  const profileResp = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!profileResp.ok) return back('error=userinfo_failed');
  const profile = await profileResp.json();
  const email = (profile.email || '').toLowerCase();
  if (!email) return back('error=no_email');

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (expires_in || 3600);
  // Preserva o refresh_token existente se o Google não reenviar um (acontece
  // quando o usuário já concedeu consentimento antes).
  const existing = await env.DB.prepare('SELECT id, refresh_token FROM external_accounts WHERE email = ?')
    .bind(email).first();
  const id = existing ? existing.id : crypto.randomUUID();
  const refresh = refresh_token || (existing && existing.refresh_token) || null;

  const ownerToken = (request.headers.get('Authorization') || '').replace('Bearer ', '').trim();
  const owner = await getUserByToken(ownerToken, env);

  await env.DB.prepare(
    `INSERT OR REPLACE INTO external_accounts
       (id, email, account_type, display_name, access_token, refresh_token,
        token_expires_at, authorized_by, authorized_at, active, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`
  ).bind(
    id, email, 'gmail', profile.name || 'LCEStech', access_token, refresh,
    expiresAt, owner ? owner.id : null, now,
    existing ? now : now, now
  ).run();

  return back('connected=true');
}

// Renova o access_token de uma conta externa quando está a menos de 5 min de
// expirar. Retorna o token válido, ou null se não há refresh_token / falhou.
async function refreshExternalToken(accountId, env) {
  const account = await env.DB.prepare(
    'SELECT * FROM external_accounts WHERE id = ?'
  ).bind(accountId).first();
  if (!account?.refresh_token) return account?.access_token || null;

  const now = Math.floor(Date.now() / 1000);
  if (account.token_expires_at && account.token_expires_at > now + 300) {
    return account.access_token;
  }

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(env),
      client_secret: clientSecret(env),
      refresh_token: account.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) return null;

  await env.DB.prepare(
    `UPDATE external_accounts SET access_token = ?, token_expires_at = ?, updated_at = unixepoch() WHERE id = ?`
  ).bind(data.access_token, now + (data.expires_in || 3600), accountId).run();
  return data.access_token;
}

// base64url → string UTF-8 (corpos do Gmail vêm em base64url, muitas vezes com
// caracteres multibyte que o atob simples corromperia).
function decodeGmailB64(data) {
  if (!data) return '';
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch { return ''; }
}

// Percorre o payload (com partes aninhadas) e extrai o primeiro text/plain e o
// primeiro text/html encontrados.
function extractGmailBodies(payload) {
  let text = '';
  let html = '';
  const walk = (part) => {
    if (!part) return;
    const mime = part.mimeType || '';
    if (part.body && part.body.data) {
      if (mime === 'text/plain' && !text) text = decodeGmailB64(part.body.data);
      else if (mime === 'text/html' && !html) html = decodeGmailB64(part.body.data);
    }
    if (Array.isArray(part.parts)) part.parts.forEach(walk);
  };
  walk(payload);
  return { text, html };
}

// Extrai "Nome" e "email@dominio" de um header From/To (ex.: `Fulano <a@b.com>`).
function parseGmailAddress(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '').trim(), email: m[2].trim() };
  return { name: '', email: s };
}

// GET /api/gmail/disconnect — remove a(s) conta(s) Gmail conectada(s) para
// forçar um novo OAuth (owner only). Usado quando o token guardado não tem o
// escopo gmail.readonly: o front chama isto e em seguida redireciona para /auth.
async function handleGmailDisconnect(request, env, user) {
  if (!user || user.role !== 'owner') {
    return json({ error: 'Apenas o owner pode desconectar a conta Gmail' }, 403);
  }
  try {
    await env.DB.prepare("DELETE FROM external_accounts WHERE account_type = 'gmail'").run();
  } catch (e) {
    return json({ error: 'Falha ao desconectar', detail: String(e) }, 500);
  }
  return json({ disconnected: true });
}

// GET /api/gmail/sync — sincroniza as contas gmail ativas. INSERT OR IGNORE:
// nunca sobrescreve e-mails já guardados (preserva is_read/is_starred locais).
async function handleGmailSync(request, env, user) {
  let account;
  try {
    account = await env.DB.prepare(
      "SELECT * FROM external_accounts WHERE account_type = 'gmail' AND active = 1 ORDER BY created_at ASC LIMIT 1"
    ).first();
  } catch {
    return json({ error: 'Tabela não migrada' }, 500);
  }
  if (!account) return json({ error: 'Nenhuma conta Gmail conectada', synced: 0 }, 404);

  const token = await refreshExternalToken(account.id, env);
  if (!token) return json({ error: 'Falha ao renovar token — reconectar a conta', synced: 0 }, 401);

  const authH = { Authorization: `Bearer ${token}` };
  const listUrl = `${GMAIL_API_BASE}/messages?maxResults=50&q=${encodeURIComponent('is:unread OR newer_than:7d')}`;
  const listResp = await fetch(listUrl, { headers: authH });
  if (!listResp.ok) {
    const detail = await listResp.text().catch(() => '');
    // Token guardado sem o escopo gmail.readonly: sinaliza para o front oferecer
    // "Reconectar" (desconecta + reinicia o OAuth com o escopo correto).
    if (listResp.status === 403 && /ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient/i.test(detail)) {
      return json({ error: 'SCOPE_INSUFFICIENT', detail, synced: 0 }, 403);
    }
    return json({ error: 'Falha ao listar mensagens', detail, synced: 0 }, 502);
  }
  const listData = await listResp.json();
  const messages = listData.messages || [];

  let synced = 0;
  for (const m of messages) {
    // Pula se já temos essa mensagem (evita refetch e preserva estado local).
    const known = await env.DB.prepare('SELECT id FROM gmail_emails WHERE gmail_message_id = ?')
      .bind(m.id).first();
    if (known) continue;

    const msgResp = await fetch(`${GMAIL_API_BASE}/messages/${m.id}?format=full`, { headers: authH });
    if (!msgResp.ok) continue;
    const msg = await msgResp.json();
    const payload = msg.payload || {};
    const headers = payload.headers || [];
    const h = (name) => {
      const found = headers.find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
      return found ? found.value : '';
    };
    const from = parseGmailAddress(h('From'));
    const to = parseGmailAddress(h('To'));
    const { text, html } = extractGmailBodies(payload);
    const labels = Array.isArray(msg.labelIds) ? msg.labelIds : [];
    const isUnread = labels.includes('UNREAD');
    const isStarred = labels.includes('STARRED');
    const dateSent = msg.internalDate
      ? Math.floor(Number(msg.internalDate) / 1000)
      : (Date.parse(h('Date')) ? Math.floor(Date.parse(h('Date')) / 1000) : Math.floor(Date.now() / 1000));
    const gmailLink = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account.email)}#all/${m.id}`;

    await env.DB.prepare(
      `INSERT OR IGNORE INTO gmail_emails
         (id, account_id, gmail_message_id, thread_id, subject, from_email, from_name,
          to_email, snippet, body_text, body_html, date_sent, is_read, is_starred,
          labels, gmail_link, synced_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,unixepoch())`
    ).bind(
      crypto.randomUUID(), account.id, m.id, msg.threadId || '',
      h('Subject') || '(sem assunto)', from.email, from.name, to.email,
      msg.snippet || '', text, html, dateSent,
      isUnread ? 0 : 1, isStarred ? 1 : 0, JSON.stringify(labels), gmailLink
    ).run();
    synced += 1;
  }

  return json({ synced, account: account.email });
}

// GET /api/gmail/emails — lista paginada com filtros ?unread=true / ?search= /
// ?label= / ?page= / ?limit=. Retorna também connected + unread_count.
async function handleGmailEmails(request, env, user) {
  const url = new URL(request.url);
  let account;
  try {
    account = await env.DB.prepare(
      "SELECT id, email, display_name FROM external_accounts WHERE account_type = 'gmail' AND active = 1 ORDER BY created_at ASC LIMIT 1"
    ).first();
  } catch {
    return json({ connected: false, emails: [], total: 0, unread_count: 0 });
  }
  if (!account) return json({ connected: false, emails: [], total: 0, unread_count: 0 });

  const wh = ['account_id = ?'];
  const args = [account.id];
  if (url.searchParams.get('unread') === 'true') wh.push('is_read = 0');
  if (url.searchParams.get('starred') === 'true') wh.push('is_starred = 1');
  const label = url.searchParams.get('label');
  if (label) { wh.push('labels LIKE ?'); args.push(`%"${label}"%`); }
  const search = (url.searchParams.get('search') || '').trim();
  if (search) {
    wh.push('(subject LIKE ? OR from_email LIKE ? OR from_name LIKE ? OR snippet LIKE ?)');
    const like = `%${search}%`;
    args.push(like, like, like, like);
  }
  const where = `WHERE ${wh.join(' AND ')}`;

  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 25));
  const offset = (page - 1) * limit;

  const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM gmail_emails ${where}`).bind(...args).first();
  const unreadRow = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM gmail_emails WHERE account_id = ? AND is_read = 0'
  ).bind(account.id).first();

  // Lista sem body_html/body_text (payloads grandes) — o corpo vem no item.
  const { results } = await env.DB.prepare(
    `SELECT id, gmail_message_id, thread_id, subject, from_email, from_name, to_email,
            snippet, date_sent, is_read, is_starred, labels, gmail_link
       FROM gmail_emails ${where}
      ORDER BY date_sent DESC LIMIT ? OFFSET ?`
  ).bind(...args, limit, offset).all();

  return json({
    connected: true,
    account: { email: account.email, display_name: account.display_name },
    emails: (results || []).map(shapeGmailEmail),
    total: (totalRow && totalRow.n) || 0,
    unread_count: (unreadRow && unreadRow.n) || 0,
    page,
    limit,
  });
}

// GET /api/gmail/emails/:id — e-mail completo (com corpo). Marca como lido.
async function handleGmailEmailItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  const row = await env.DB.prepare('SELECT * FROM gmail_emails WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'E-mail não encontrado' }, 404);
  if (!row.is_read) {
    await env.DB.prepare('UPDATE gmail_emails SET is_read = 1 WHERE id = ?').bind(id).run();
    row.is_read = 1;
  }
  return json(shapeGmailEmail(row, true));
}

// POST /api/gmail/emails/:id/star — alterna o estado de estrela (local).
async function handleGmailEmailStar(request, env, user, id) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!id) return json({ error: 'ID ausente' }, 400);
  const row = await env.DB.prepare('SELECT id, is_starred FROM gmail_emails WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'E-mail não encontrado' }, 404);
  const next = row.is_starred ? 0 : 1;
  await env.DB.prepare('UPDATE gmail_emails SET is_starred = ? WHERE id = ?').bind(next, id).run();
  return json({ id, is_starred: !!next });
}

// POST /api/gmail/mark-read — marca vários e-mails como lidos de uma vez.
async function handleGmailMarkRead(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
  if (!ids.length) return json({ error: 'ids é obrigatório', updated: 0 }, 400);
  const placeholders = ids.map(() => '?').join(',');
  await env.DB.prepare(`UPDATE gmail_emails SET is_read = 1 WHERE id IN (${placeholders})`).bind(...ids).run();
  return json({ updated: ids.length });
}

function shapeGmailEmail(row, withBody = false) {
  let labels = [];
  try { labels = JSON.parse(row.labels || '[]'); } catch { labels = []; }
  const base = {
    id: row.id,
    gmail_message_id: row.gmail_message_id,
    thread_id: row.thread_id || '',
    subject: row.subject || '(sem assunto)',
    from_email: row.from_email || '',
    from_name: row.from_name || '',
    to_email: row.to_email || '',
    snippet: row.snippet || '',
    date_sent: row.date_sent || 0,
    is_read: !!row.is_read,
    is_starred: !!row.is_starred,
    labels,
    gmail_link: row.gmail_link || '',
  };
  if (withBody) {
    base.body_text = row.body_text || '';
    base.body_html = row.body_html || '';
  }
  return base;
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

async function getUserFromRequest(request, env) {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  const now = Math.floor(Date.now() / 1000);
  // Archived users keep their D1 row but cannot use sessions. The `status`
  // column may not exist if migration 0022 hasn't been applied yet — fall
  // back to the legacy query so old environments keep working.
  let session = null;
  try {
    session = await env.DB.prepare(
      `SELECT u.* FROM sessions s
         JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?
          AND (u.status IS NULL OR u.status != 'archived')`
    ).bind(token, now).first();
  } catch {
    session = await env.DB.prepare(
      `SELECT u.* FROM sessions s
         JOIN users u ON s.user_id = u.id
        WHERE s.token = ? AND s.expires_at > ?`
    ).bind(token, now).first();
  }
  if (!session) return null;
  // resolvePermissions has its own try/catch around the perm tables so a
  // missing migration degrades to the external-preset defaults.
  const permissions = await resolvePermissions(session.id, env);
  const granular = await resolveGranularPermissions(session.id, env);
  return { ...session, permissions, granular };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    role: user.role,
    user_type: user.user_type || null,
    status: user.status || null,
    display_name: user.display_name || '',
    timezone: user.timezone || null,
    permissions: user.permissions || null,
    granular: user.granular === undefined ? null : user.granular,
  };
}

// Flat permission map: feature → level. Levels are
// full | view | own | assigned_only | own_and_tagged | none.
const ALL_NONE_PERMISSIONS = {
  tasks: 'none', planning: 'none', timer: 'none', calendar: 'none',
  drive: 'none', notes: 'none', payment: 'none', meeting: 'none',
  areas: 'none', networking: 'none', alerts: 'none', settings: 'none',
  chat: 'none', dashboard: 'none',
};

const ALL_FULL_PERMISSIONS = {
  tasks: 'full', planning: 'full', timer: 'full', calendar: 'full',
  drive: 'full', notes: 'full', payment: 'full', meeting: 'full',
  areas: 'full', networking: 'full', alerts: 'full', settings: 'full',
  chat: 'full', dashboard: 'full',
};

// Mirrors the 'preset_external' seed in migration 0022 — kept inline so the
// function still resolves sensibly before that migration lands.
const DEFAULT_EXTERNAL_PERMISSIONS = {
  tasks: 'assigned_only', planning: 'none', timer: 'full', calendar: 'none',
  drive: 'none', notes: 'own_and_tagged', payment: 'own', meeting: 'full',
  areas: 'none', networking: 'none', alerts: 'none', settings: 'none',
  chat: 'full', dashboard: 'none',
};

async function resolvePermissions(userId, env) {
  let userRow = null;
  try {
    userRow = await env.DB.prepare('SELECT role, status FROM users WHERE id = ?').bind(userId).first();
  } catch {
    try {
      userRow = await env.DB.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
    } catch { /* DB unreachable — fall through to ALL_NONE */ }
  }
  if (!userRow) return { ...ALL_NONE_PERMISSIONS };
  if (userRow.status && userRow.status !== 'active') return { ...ALL_NONE_PERMISSIONS };
  if (userRow.role === 'owner') return { ...ALL_FULL_PERMISSIONS };

  let up = null;
  try {
    up = await env.DB.prepare(
      `SELECT up.overrides, pp.permissions
         FROM user_permissions up
         LEFT JOIN permission_presets pp ON up.preset_id = pp.id
        WHERE up.user_id = ?`
    ).bind(userId).first();
  } catch { up = null; /* tables not migrated yet */ }

  let preset = {};
  let overrides = {};
  try { preset = JSON.parse((up && up.permissions) || '{}'); } catch { preset = {}; }
  try { overrides = JSON.parse((up && up.overrides) || '{}'); } catch { overrides = {}; }

  return { ...DEFAULT_EXTERNAL_PERMISSIONS, ...preset, ...overrides };
}

// Action-level permission resolver (v2.1.1). Returns null for the owner
// (canDo short-circuits to true), or a flat map keyed `feature.action` for
// everyone else. Single JOIN query + a smarter preset fallback so users
// whose `user_permissions` row is missing still get sensible defaults
// derived from their role / user_type. Failures fall open at the GET layer
// (route handlers return empty data) — this function fails closed because
// some routes still need the granular map to authorize writes.
async function resolveGranularPermissions(userId, env) {
  try {
    const row = await env.DB.prepare(
      `SELECT u.role, u.user_type, u.status, up.preset_id
         FROM users u
         LEFT JOIN user_permissions up ON up.user_id = u.id
        WHERE u.id = ?`
    ).bind(userId).first();
    if (!row) return {};
    if (row.role === 'owner') return null;
    if (row.status && row.status !== 'active') return {};

    // Preset fallback when no user_permissions row exists: use role/user_type
    // to pick a sensible default rather than always defaulting to external.
    const presetId = row.preset_id
      || (row.role === 'assistant_fixed' || row.user_type === 'fixed'
          ? 'preset_fixed'
          : 'preset_external');

    const [presetPerms, userOverrides] = await Promise.all([
      env.DB.prepare(
        'SELECT feature, action, allowed FROM preset_granular_permissions WHERE preset_id = ?'
      ).bind(presetId).all().catch(() => ({ results: [] })),
      env.DB.prepare(
        'SELECT feature, action, allowed FROM granular_permissions WHERE user_id = ?'
      ).bind(userId).all().catch(() => ({ results: [] })),
    ]);

    const perms = {};
    for (const p of presetPerms.results || []) perms[`${p.feature}.${p.action}`] = !!p.allowed;
    // Per-user overrides take precedence over preset defaults.
    for (const p of userOverrides.results || []) perms[`${p.feature}.${p.action}`] = !!p.allowed;
    return perms;
  } catch (e) {
    // Log so production traffic that's hitting this path shows up in
    // Cloudflare Worker logs. Empty map → granular gates fail closed for
    // writes; GET route handlers convert that to empty-data responses.
    // eslint-disable-next-line no-console
    console.error('resolveGranularPermissions error:', String((e && e.message) || e));
    return {};
  }
}

// Boolean gate: true if the user may perform the (feature, action) pair.
// Owner always returns true. Missing key = denied (default-deny).
function canDo(granular, feature, action) {
  // Timer is a universal feature — available to every authenticated user and
  // never seeded into the granular grid (see migration 0024 / 0036). Short-
  // circuit so a future timer gate can't fail closed on the empty grid.
  if (feature === 'timer') return true;
  if (granular === null || granular === undefined) return true;
  return !!granular[`${feature}.${action}`];
}

// Permission guard for route handlers. Returns true if `user` may use
// `feature` at `minLevel`. Owner bypasses. The level ordering matches the
// spec's array (none < view < own < assigned_only < own_and_tagged < full).
function requirePermission(user, feature, minLevel = 'view') {
  if (!user) return false;
  if (user.role === 'owner') return true;
  const levels = ['none', 'view', 'own', 'assigned_only', 'own_and_tagged', 'full'];
  const userLevel = (user.permissions && user.permissions[feature]) || 'none';
  if (userLevel === 'none') return false;
  if (userLevel === 'full') return true;
  if (minLevel === 'view') return userLevel !== 'none';
  return levels.indexOf(userLevel) >= levels.indexOf(minLevel);
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
    projectName: row.project_name || null,
    front_id: row.front_id || null,
    frontName: row.front_name || null,
    area_id: row.area_id || null,
    areaName: row.area_name || null,
    areaColor: row.area_color || null,
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
    favorited: row.favorited ? 1 : 0,
    google_event_id: row.google_event_id || null,
    opportunity_id: row.opportunity_id || null,
    drive_attachments: parseJsonArray(row.drive_attachments),
    source: row.source || 'aide',
    lifegame_id: row.lifegame_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    score: calcScore(row.urgency, row.importance),
    assignedUser: row.au_id
      ? { id: row.au_id, name: row.au_name, avatar: row.au_avatar }
      : null
  };
}

// LEFT JOINs all the way through (front → project → area + assignee) so the
// hierarchy is available on every task read. Wrapped via try/catch in shapeTask
// callers — falls back to the legacy SELECT if migration 0015 hasn't landed.
const TASK_SELECT =
  'SELECT t.*, u.id AS au_id, u.name AS au_name, u.avatar AS au_avatar, ' +
  'f.name AS front_name, p.name AS project_name, ' +
  'a.id AS area_id, a.name AS area_name, a.color AS area_color ' +
  'FROM tasks t ' +
  'LEFT JOIN users u ON t.assigned_to = u.id ' +
  'LEFT JOIN fronts f ON t.front_id = f.id ' +
  'LEFT JOIN projects p ON t.project_id = p.id ' +
  'LEFT JOIN areas a ON p.area_id = a.id';

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleUsers(env) {
  // timezone via SELECT separado: a coluna pode não existir em ambientes onde
  // migration 0021 ainda não rodou.
  let cols = 'id, email, name, avatar, role, last_seen_at';
  try {
    cols += ', timezone';
    const { results } = await env.DB.prepare(
      `SELECT ${cols} FROM users ORDER BY role DESC, name`
    ).all();
    return json(results || []);
  } catch {
    const { results } = await env.DB.prepare(
      'SELECT id, email, name, avatar, role, last_seen_at FROM users ORDER BY role DESC, name'
    ).all();
    return json(results || []);
  }
}

async function handleProfileUpdate(request, env, user) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  const name = body.name !== undefined ? String(body.name).trim() : user.name;
  await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name || null, user.id).run();
  if (body.timezone !== undefined) {
    const tz = body.timezone ? String(body.timezone).trim() : null;
    try {
      await env.DB.prepare('UPDATE users SET timezone = ? WHERE id = ?').bind(tz, user.id).run();
    } catch { /* coluna ausente — migration 0021 não aplicada */ }
  }
  const updated = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return json(publicUser(updated));
}

async function handleTasksCollection(request, env, user, ctx) {
  // v2.1.1 — GET is fail-open: when the user has no view permission, return
  // [] instead of 403 so the page renders an empty state rather than crashing.
  // Writes still 403 to keep the security boundary.
  if (request.method !== 'GET' && !requirePermission(user, 'tasks', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (request.method === 'GET') {
    if (!requirePermission(user, 'tasks', 'view')) return json([]);
    if (!canDo(user.granular, 'tasks', 'view_assigned') &&
        !canDo(user.granular, 'tasks', 'view_all')) {
      return json([]);
    }
  }
  if (request.method === 'POST' && !canDo(user.granular, 'tasks', 'create')) {
    return json({ error: 'Sem permissão para criar tarefas' }, 403);
  }
  // assigned_only users only see tasks assigned to themselves on list reads.
  // v2.1: also enforced via granular tasks.view_all=false (most restrictive wins).
  const tasksLevel = (user.permissions && user.permissions.tasks) || 'full';
  const granularViewAllDenied = user.granular && !canDo(user.granular, 'tasks', 'view_all');
  const assignedOnly = tasksLevel === 'assigned_only' || granularViewAllDenied;

  if (request.method === 'GET') {
    if (new URL(request.url).searchParams.get('completed_today') === 'true') {
      const midnight = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
      // v2.1.2 — assigned_only sees tasks assigned to them OR authored by them.
      // Without the OR, the user couldn't see tasks they just created if those
      // weren't also auto-assigned to themselves.
      const filter = assignedOnly ? ' AND (t.assigned_to = ? OR t.created_by = ?)' : '';
      const binds = assignedOnly ? [midnight, user.id, user.id] : [midnight];
      const { results } = await env.DB.prepare(
        `${TASK_SELECT} WHERE t.status = 'done' AND t.updated_at >= ?${filter} ORDER BY t.updated_at DESC`
      ).bind(...binds).all();
      return json((results || []).map(shapeTask));
    }
    const onlyFav = new URL(request.url).searchParams.get('favorited') === 'true';
    const conds = [];
    const binds = [];
    if (onlyFav) conds.push('t.favorited = 1');
    if (assignedOnly) {
      conds.push('(t.assigned_to = ? OR t.created_by = ?)');
      binds.push(user.id, user.id);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')} ` : '';
    const { results } = await env.DB.prepare(
      `${TASK_SELECT} ${where}ORDER BY (t.urgency + t.importance) DESC, t.created_at DESC`
    ).bind(...binds).all();
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
         tags, comments, subtasks, time_entries, favorited, drive_attachments,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
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
      body.favorited ? 1 : 0,
      JSON.stringify(body.drive_attachments || []),
      now,
      now
    ).run();
    // Set front_id separately so a missing migration only loses the field.
    if (body.front_id) {
      try {
        await env.DB.prepare('UPDATE tasks SET front_id = ? WHERE id = ?').bind(body.front_id, id).run();
      } catch { /* migration 0015 not applied */ }
    }
    // Vínculo com oportunidade de carreira (migration 0026) — separado p/ tolerar
    // bancos onde a migração ainda não foi aplicada.
    if (body.opportunity_id) {
      try {
        await env.DB.prepare('UPDATE tasks SET opportunity_id = ? WHERE id = ?').bind(body.opportunity_id, id).run();
      } catch { /* migration 0026 not applied */ }
    }
    const row = await env.DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(id).first();
    const shaped = shapeTask(row);
    if (shaped.assigned_to && shaped.assigned_to !== user.id) {
      await notifyTaskAssignment(env, ctx, user, shaped);
    }
    await notifyTaskDue(env, ctx, shaped);
    syncTaskToCalendar(env, ctx, shaped);
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

  if (request.method === 'DELETE' && !canDo(user.granular, 'tasks', 'delete')) {
    return json({ error: 'Sem permissão para deletar tarefas' }, 403);
  }

  if (request.method === 'PUT') {
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskId).first();
    if (!existing) return json({ error: 'Tarefa não encontrada' }, 404);
    // v2.1 granular: PUT requires edit_all OR (edit_own AND user owns the task).
    const canEditAll = canDo(user.granular, 'tasks', 'edit_all');
    const canEditOwn = canDo(user.granular, 'tasks', 'edit_own');
    if (!canEditAll && !(canEditOwn && existing.created_by === user.id)) {
      return json({ error: 'Sem permissão para editar esta tarefa' }, 403);
    }

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
      time_entries: body.time_entries !== undefined ? JSON.stringify(body.time_entries || []) : existing.time_entries,
      favorited: body.favorited !== undefined ? (body.favorited ? 1 : 0) : (existing.favorited ? 1 : 0),
      drive_attachments: body.drive_attachments !== undefined
        ? JSON.stringify(body.drive_attachments || [])
        : (existing.drive_attachments || '[]')
    };
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE tasks SET title=?, description=?, project_id=?, assigned_to=?,
        urgency=?, importance=?, energy=?, status=?, due_date=?, delivery_date=?,
        tags=?, comments=?, subtasks=?, time_entries=?, favorited=?, drive_attachments=?, updated_at=?
       WHERE id=?`
    ).bind(
      merged.title, merged.description, merged.project_id, merged.assigned_to,
      merged.urgency, merged.importance, merged.energy, merged.status,
      merged.due_date, merged.delivery_date, merged.tags, merged.comments,
      merged.subtasks, merged.time_entries, merged.favorited, merged.drive_attachments, now, taskId
    ).run();
    if (body.front_id !== undefined) {
      try {
        await env.DB.prepare('UPDATE tasks SET front_id = ? WHERE id = ?')
          .bind(body.front_id || null, taskId).run();
      } catch { /* migration 0015 not applied */ }
    }
    // Vínculo com oportunidade de carreira (migration 0026).
    if (body.opportunity_id !== undefined) {
      try {
        await env.DB.prepare('UPDATE tasks SET opportunity_id = ? WHERE id = ?')
          .bind(body.opportunity_id || null, taskId).run();
      } catch { /* migration 0026 not applied */ }
    }
    // Taxa da tarefa (rate_type/rate_value) — migration 0014_payment_v2.
    // Updated separately para tolerar bancos onde a migração não foi aplicada.
    if (body.rate_type !== undefined || body.rate_value !== undefined) {
      const validTypes = ['inherit', 'hourly', 'fixed'];
      const rateType = body.rate_type !== undefined
        ? (validTypes.includes(body.rate_type) ? body.rate_type : existing.rate_type || 'inherit')
        : existing.rate_type;
      const rateValue = body.rate_value !== undefined
        ? (Number(body.rate_value) || 0)
        : existing.rate_value;
      try {
        await env.DB.prepare('UPDATE tasks SET rate_type = ?, rate_value = ? WHERE id = ?')
          .bind(rateType, rateValue, taskId).run();
      } catch { /* migration 0014 not applied */ }
    }
    const row = await env.DB.prepare(`${TASK_SELECT} WHERE t.id = ?`).bind(taskId).first();
    const shaped = shapeTask(row);
    const assigneeChanged = (existing.assigned_to || null) !== (merged.assigned_to || null);
    if (assigneeChanged && shaped.assigned_to && shaped.assigned_to !== user.id) {
      await notifyTaskAssignment(env, ctx, user, shaped);
    }
    const dueChanged = (existing.due_date || null) !== (merged.due_date || null);
    if (dueChanged) await notifyTaskDue(env, ctx, shaped);
    // @-mention notifications for newly added comments
    if (body.comments !== undefined) {
      await notifyCommentMentions(env, ctx, user, shaped, parseJsonArray(existing.comments), shaped.comments);
    }
    syncTaskToCalendar(env, ctx, shaped);
    return json(shaped);
  }

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
    return json({ ok: true });
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleProjectsCollection(request, env, user) {
  if (request.method === 'POST' && !canDo(user.granular, 'areas', 'manage_projects')) {
    return json({ error: 'Sem permissão para gerenciar projetos' }, 403);
  }
  if (request.method === 'GET') {
    let rows = [];
    try {
      const r = await env.DB.prepare(
        'SELECT p.*, a.name AS area_name, a.color AS area_color FROM projects p LEFT JOIN areas a ON p.area_id = a.id ORDER BY p.created_at DESC'
      ).all();
      rows = r.results || [];
    } catch {
      // areas table missing — fall back to plain projects list
      const r = await env.DB.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
      rows = r.results || [];
    }
    // Hydrate fronts for each project (single query, group by project_id).
    let frontsByProject = {};
    try {
      const r = await env.DB.prepare('SELECT * FROM fronts ORDER BY name').all();
      for (const f of r.results || []) {
        if (!frontsByProject[f.project_id]) frontsByProject[f.project_id] = [];
        frontsByProject[f.project_id].push(f);
      }
    } catch { /* fronts table missing */ }
    return json(rows.map((p) => ({ ...p, fronts: frontsByProject[p.id] || [] })));
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
    if (body.area_id || body.description) {
      try {
        await env.DB.prepare('UPDATE projects SET area_id = ?, description = ? WHERE id = ?')
          .bind(body.area_id || null, body.description || '', id).run();
      } catch { /* migration 0015 not applied */ }
    }
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(id).first();
    return json(row, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleProjectItem(request, env, user, projectId) {
  if (!projectId) return json({ error: 'ID ausente' }, 400);
  if ((request.method === 'PUT' || request.method === 'DELETE') &&
      !canDo(user.granular, 'areas', 'manage_projects')) {
    return json({ error: 'Sem permissão para gerenciar projetos' }, 403);
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
    if (!existing) return json({ error: 'Projeto não encontrado' }, 404);
    const name = body.name !== undefined ? String(body.name).trim() : existing.name;
    const color = body.color !== undefined ? body.color : existing.color;
    await env.DB.prepare('UPDATE projects SET name = ?, color = ? WHERE id = ?')
      .bind(name, color, projectId).run();
    if (body.area_id !== undefined || body.description !== undefined) {
      try {
        await env.DB.prepare('UPDATE projects SET area_id = ?, description = ? WHERE id = ?')
          .bind(body.area_id !== undefined ? (body.area_id || null) : (existing.area_id || null),
                body.description !== undefined ? body.description : (existing.description || ''),
                projectId).run();
      } catch { /* migration 0015 not applied */ }
    }
    const row = await env.DB.prepare('SELECT * FROM projects WHERE id = ?').bind(projectId).first();
    return json(row);
  }
  if (request.method === 'DELETE') {
    // Desvincula frentes e tarefas ANTES de apagar o projeto, evitando
    // front_id / project_id órfãos. Transação atômica via batch(). A ordem
    // importa: desvincular tasks.front_id antes de limpar fronts.project_id,
    // senão a subquery por project_id deixa de casar.
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE tasks SET front_id = NULL WHERE front_id IN (SELECT id FROM fronts WHERE project_id = ?)').bind(projectId),
        env.DB.prepare('UPDATE fronts SET project_id = NULL WHERE project_id = ?').bind(projectId),
        env.DB.prepare('UPDATE tasks SET project_id = NULL WHERE project_id = ?').bind(projectId),
        env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(projectId),
      ]);
    } catch (e) {
      return json({ error: 'Falha ao excluir projeto — nada foi alterado', detail: String(e) }, 500);
    }
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

// Stops ALL of the user's active (un-ended) entries; returns the id of the
// most recently started one, or null if there were none.
//
// Historically this closed only `.first()` un-ended row. If a user ever ended
// up with more than one open entry (double-start race, meeting + timer, a stop
// that failed halfway), a single stop left the extras running — they kept
// accumulating duration and the UI never showed them, which is exactly how a
// timer "kept running without stopping" for over an hour. Closing every open
// row per call makes stop idempotent and self-healing.
async function stopActiveEntry(env, userId, now) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM time_entries WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC'
  ).bind(userId).all();
  const active = results || [];
  if (active.length === 0) return null;

  // Taxa padrão atual (BRL), usada quando a entrada aberta ainda não tem taxa.
  let defaultRate = 0;
  try {
    const av = await env.DB.prepare(
      'SELECT hourly_rate_brl, hourly_rate FROM availability WHERE user_id = ?'
    ).bind(userId).first();
    defaultRate = (av && (av.hourly_rate_brl || av.hourly_rate)) || 0;
  } catch { /* tabela ausente — mantém 0 */ }

  for (const entry of active) {
    // Garante que a entrada saia com uma taxa: se já tinha (>0), preserva;
    // senão, copia a taxa padrão atual.
    const rate = entry.hourly_rate || defaultRate;
    await env.DB.prepare(
      'UPDATE time_entries SET ended_at = ?, duration_seconds = ?, hourly_rate = ? WHERE id = ?'
    ).bind(now, now - entry.started_at, rate, entry.id).run();
  }

  // results já vem ordenado por started_at DESC — devolve o timer mais recente.
  return active[0].id;
}

async function handleTimerStart(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  const now = Math.floor(Date.now() / 1000);

  // Defensive: a missing availability table/column must not 500 the whole
  // start (parity with stopActiveEntry). Falls back to rate 0.
  let avail = null;
  try {
    avail = await env.DB.prepare(
      'SELECT hourly_rate, hourly_rate_brl FROM availability WHERE user_id = ?'
    ).bind(user.id).first();
  } catch { /* availability ausente — mantém taxa 0 */ }
  const defaultRate = (avail && (avail.hourly_rate_brl || avail.hourly_rate)) || 0;
  const rate = body.hourly_rate != null ? Number(body.hourly_rate) || 0 : defaultRate;

  // Manual entry — insert a completed entry directly, without touching the
  // user's active timer.
  if (body.manual) {
    const startedAt = body.started_at ? Math.floor(new Date(body.started_at).getTime() / 1000) : null;
    const endedAt = body.ended_at ? Math.floor(new Date(body.ended_at).getTime() / 1000) : null;
    const duration = Number(body.duration_seconds) > 0
      ? Math.floor(body.duration_seconds)
      : (startedAt && endedAt ? Math.max(0, endedAt - startedAt) : 0);
    if (!startedAt || !endedAt || endedAt <= startedAt) {
      return json({ error: 'started_at e ended_at obrigatórios (ended_at > started_at)' }, 400);
    }
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO time_entries
         (id, task_id, user_id, started_at, ended_at, duration_seconds, hourly_rate, paid, notes, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, body.task_id || null, user.id, startedAt, endedAt, duration, rate, 0, body.notes || '', now).run();
    const row = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).bind(id).first();
    return json(shapeEntry(row), 201);
  }

  // Only one active entry per user — stop the previous one first.
  await stopActiveEntry(env, user.id, now);

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

  // Owner pode editar/excluir entradas de qualquer usuário (gestão de pagamentos
  // na PaymentPage lista as entradas de Alice). Assistant continua restrito às
  // suas próprias entradas.
  const isOwner = user.role === 'owner';

  if (request.method === 'PUT') {
    const existing = isOwner
      ? await env.DB.prepare('SELECT * FROM time_entries WHERE id = ?').bind(id).first()
      : await env.DB.prepare('SELECT * FROM time_entries WHERE id = ? AND user_id = ?').bind(id, user.id).first();
    if (!existing) {
      return json({
        error: 'Registro não encontrado',
        id,
        path: new URL(request.url).pathname,
      }, 404);
    }

    const body = (await readJson(request)) || {};
    const notes = body.notes !== undefined ? body.notes : existing.notes;

    // Accept both hourly_rate and hourly_rate_brl (legacy/new column names).
    let rate = existing.hourly_rate;
    if (body.hourly_rate !== undefined) rate = Number(body.hourly_rate) || 0;
    else if (body.hourly_rate_brl !== undefined) rate = Number(body.hourly_rate_brl) || 0;

    let startedAt = existing.started_at;
    let endedAt = existing.ended_at;
    let durationSeconds = existing.duration_seconds;

    const parseTs = (v) => {
      if (v == null) return null;
      if (typeof v === 'number') return Math.floor(v);
      const t = new Date(v).getTime();
      return Number.isNaN(t) ? null : Math.floor(t / 1000);
    };

    if (body.started_at !== undefined) {
      const t = parseTs(body.started_at);
      if (t == null) return json({ error: 'started_at inválido' }, 400);
      startedAt = t;
    }
    if (body.ended_at !== undefined) {
      const t = parseTs(body.ended_at);
      if (t == null) return json({ error: 'ended_at inválido' }, 400);
      endedAt = t;
    }
    if (body.started_at !== undefined || body.ended_at !== undefined) {
      if (endedAt != null && endedAt <= startedAt) {
        return json({ error: 'ended_at deve ser maior que started_at' }, 400);
      }
      if (endedAt != null) durationSeconds = endedAt - startedAt;
    }
    if (body.duration_seconds !== undefined) {
      durationSeconds = Math.max(0, Math.floor(Number(body.duration_seconds) || 0));
    }

    let paid = existing.paid;
    let paidAt = existing.paid_at;
    if (body.paid !== undefined) {
      paid = body.paid ? 1 : 0;
      paidAt = body.paid ? (existing.paid_at || Math.floor(Date.now() / 1000)) : null;
    }
    if (body.paid_at !== undefined) {
      paidAt = parseTs(body.paid_at);
    }

    await env.DB.prepare(
      `UPDATE time_entries SET notes = ?, hourly_rate = ?, paid = ?, paid_at = ?,
        started_at = ?, ended_at = ?, duration_seconds = ? WHERE id = ?`
    ).bind(notes, rate, paid, paidAt, startedAt, endedAt, durationSeconds, id).run();
    const row = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).bind(id).first();
    return json(shapeEntry(row));
  }

  if (request.method === 'DELETE') {
    const result = isOwner
      ? await env.DB.prepare('DELETE FROM time_entries WHERE id = ?').bind(id).run()
      : await env.DB.prepare('DELETE FROM time_entries WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    return json({ deleted: true, changes: result.meta?.changes ?? 0 });
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
  // v2.1.1 — GET fails open: return an empty-but-valid plan shape so the UI
  // renders without crashing instead of seeing a 403.
  if (!requirePermission(user, 'planning', 'view')) {
    return json({
      id: null, user_id: user.id, week_start: '',
      day_plans: {}, weekly_goal: '', weekly_review: '',
      short_term: '', tactical: '', strategic: '',
    });
  }
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
    // Payment v2: Alice's rate lives in BRL. `currency` carries which one is
    // authoritative for the user; falls back to BRL when the migration hasn't
    // landed (column will be undefined).
    hourly_rate_brl: row.hourly_rate_brl || 0,
    currency: row.currency || 'BRL',
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
      hourly_rate: Number(body.hourly_rate) || 0,
      hourly_rate_brl: Number(body.hourly_rate_brl) || 0,
      currency: body.currency || 'BRL'
    };
    const existing = await env.DB.prepare('SELECT id FROM availability WHERE user_id = ?').bind(user.id).first();
    if (existing) {
      // Update the v2 columns separately so a missing migration only loses
      // those fields instead of failing the whole save.
      await env.DB.prepare(
        `UPDATE availability SET work_days=?, work_start=?, work_end=?, lunch_start=?, lunch_end=?, hourly_rate=?, updated_at=?
         WHERE user_id=?`
      ).bind(
        fields.work_days, fields.work_start, fields.work_end, fields.lunch_start,
        fields.lunch_end, fields.hourly_rate, now, user.id
      ).run();
      try {
        await env.DB.prepare(
          'UPDATE availability SET hourly_rate_brl=?, currency=? WHERE user_id=?'
        ).bind(fields.hourly_rate_brl, fields.currency, user.id).run();
      } catch { /* migration 0014 not applied — silently skip BRL fields */ }
    } else {
      await env.DB.prepare(
        `INSERT INTO availability (id, user_id, work_days, work_start, work_end, lunch_start, lunch_end, hourly_rate, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(
        crypto.randomUUID(), user.id, fields.work_days, fields.work_start, fields.work_end,
        fields.lunch_start, fields.lunch_end, fields.hourly_rate, now
      ).run();
      try {
        await env.DB.prepare(
          'UPDATE availability SET hourly_rate_brl=?, currency=? WHERE user_id=?'
        ).bind(fields.hourly_rate_brl, fields.currency, user.id).run();
      } catch { /* migration 0014 not applied */ }
    }
    const row = await env.DB.prepare('SELECT * FROM availability WHERE user_id = ?').bind(user.id).first();
    return json(shapeAvailability(row));
  }

  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Disponibilidade semanal recorrente + Horário planejado diário (v1.9.8)
// ---------------------------------------------------------------------------

function shapeWeeklySlot(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    slot_type: row.slot_type || 'available',
    day_of_week: row.day_of_week,
    start_time: row.start_time,
    end_time: row.end_time,
    active: !!row.active,
  };
}

function shapeScheduledSlot(row) {
  return {
    id: row.id,
    user_id: row.user_id,
    work_date: row.work_date,
    start_time: row.start_time,
    end_time: row.end_time,
    notes: row.notes || '',
  };
}

async function fetchWeeklyForUser(env, userId, slotType = null) {
  try {
    const sql = slotType
      ? 'SELECT * FROM weekly_availability WHERE user_id = ? AND slot_type = ? AND active = 1 ORDER BY day_of_week, start_time'
      : 'SELECT * FROM weekly_availability WHERE user_id = ? AND active = 1 ORDER BY day_of_week, start_time';
    const stmt = slotType
      ? env.DB.prepare(sql).bind(userId, slotType)
      : env.DB.prepare(sql).bind(userId);
    const { results } = await stmt.all();
    return (results || []).map(shapeWeeklySlot);
  } catch {
    return [];
  }
}

async function fetchScheduleForUser(env, userId, weekStart) {
  try {
    const end = addDaysISOInternal(weekStart, 7);
    const { results } = await env.DB.prepare(
      `SELECT * FROM daily_work_schedule
       WHERE user_id = ? AND work_date >= ? AND work_date < ?
       ORDER BY work_date, start_time`
    ).bind(userId, weekStart, end).all();
    return (results || []).map(shapeScheduledSlot);
  } catch {
    return [];
  }
}

function addDaysISOInternal(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function handleAvailabilityWeekly(request, env, user) {
  if (request.method === 'GET') {
    const slots = await fetchWeeklyForUser(env, user.id);
    const available = slots.filter((s) => s.slot_type === 'available');
    const planned = slots.filter((s) => s.slot_type === 'planned');
    // Compat: slots + by_day mantidos para clientes antigos.
    const byDay = {};
    for (const s of available) {
      (byDay[s.day_of_week] = byDay[s.day_of_week] || []).push(s);
    }
    return json({ slots, available, planned, by_day: byDay });
  }

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const incoming = Array.isArray(body.slots) ? body.slots : [];
    const now = Math.floor(Date.now() / 1000);

    // Se o body especifica um único slot_type (todos com mesmo tipo, ou via
    // body.slot_type), apaga só esse tipo. Caso contrário, apaga ambos.
    const declaredType = (body.slot_type === 'planned' || body.slot_type === 'available')
      ? body.slot_type
      : null;
    const typesInBody = new Set(
      incoming.map((s) => (s.slot_type === 'planned' ? 'planned' : 'available'))
    );
    if (declaredType) {
      await env.DB.prepare(
        'DELETE FROM weekly_availability WHERE user_id = ? AND slot_type = ?'
      ).bind(user.id, declaredType).run();
    } else if (typesInBody.size === 1) {
      const t = [...typesInBody][0];
      await env.DB.prepare(
        'DELETE FROM weekly_availability WHERE user_id = ? AND slot_type = ?'
      ).bind(user.id, t).run();
    } else {
      await env.DB.prepare(
        'DELETE FROM weekly_availability WHERE user_id = ?'
      ).bind(user.id).run();
    }

    for (const s of incoming) {
      const day = Number(s.day_of_week);
      if (Number.isNaN(day) || day < 0 || day > 6) continue;
      if (!s.start_time || !s.end_time) continue;
      const slotType = (s.slot_type === 'planned' || s.slot_type === 'available')
        ? s.slot_type
        : (declaredType || 'available');
      const id = crypto.randomUUID();
      try {
        await env.DB.prepare(
          `INSERT INTO weekly_availability
            (id, user_id, slot_type, day_of_week, start_time, end_time, active, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).bind(
          id, user.id, slotType, day, String(s.start_time), String(s.end_time),
          s.active === false ? 0 : 1, now, now
        ).run();
      } catch { /* duplicate or other constraint — skip */ }
    }

    const slots = await fetchWeeklyForUser(env, user.id);
    return json({
      slots,
      available: slots.filter((s) => s.slot_type === 'available'),
      planned: slots.filter((s) => s.slot_type === 'planned'),
    });
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleAvailabilitySchedule(request, env, user) {
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const weekStart = url.searchParams.get('week_start');
    if (!weekStart) return json({ error: 'week_start obrigatório (YYYY-MM-DD)' }, 400);
    const [scheduled, recurring] = await Promise.all([
      fetchScheduleForUser(env, user.id, weekStart),
      fetchWeeklyForUser(env, user.id),
    ]);
    return json({
      scheduled,
      recurring,
      available: recurring.filter((s) => s.slot_type === 'available'),
      planned: recurring.filter((s) => s.slot_type === 'planned'),
    });
  }

  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.work_date || !body.start_time || !body.end_time) {
      return json({ error: 'Campos obrigatórios: work_date, start_time, end_time' }, 400);
    }
    const now = Math.floor(Date.now() / 1000);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO daily_work_schedule
          (id, user_id, work_date, start_time, end_time, notes, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(user_id, work_date, start_time) DO UPDATE SET
           end_time = excluded.end_time,
           notes = excluded.notes,
           updated_at = excluded.updated_at`
      ).bind(
        id, user.id, body.work_date, body.start_time, body.end_time,
        body.notes || '', now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao salvar', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare(
      'SELECT * FROM daily_work_schedule WHERE user_id = ? AND work_date = ? AND start_time = ?'
    ).bind(user.id, body.work_date, body.start_time).first();
    return json(row ? shapeScheduledSlot(row) : { id }, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleAvailabilityScheduleItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  const row = await env.DB.prepare('SELECT * FROM daily_work_schedule WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Slot não encontrado', id }, 404);
  if (row.user_id !== user.id && user.role !== 'owner') {
    return json({ error: 'Sem permissão' }, 403);
  }
  await env.DB.prepare('DELETE FROM daily_work_schedule WHERE id = ?').bind(id).run();
  return json({ deleted: true });
}

async function handleAvailabilityAll(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  const weekStart = new URL(request.url).searchParams.get('week_start');
  if (!weekStart) return json({ error: 'week_start obrigatório (YYYY-MM-DD)' }, 400);
  let users = [];
  try {
    const r = await env.DB.prepare('SELECT id, name, role, timezone FROM users').all();
    users = r.results || [];
  } catch {
    const r = await env.DB.prepare('SELECT id, name, role FROM users').all();
    users = r.results || [];
  }
  const out = {};
  for (const u of users) {
    const [scheduled, recurring] = await Promise.all([
      fetchScheduleForUser(env, u.id, weekStart),
      fetchWeeklyForUser(env, u.id),
    ]);
    out[u.id] = {
      name: u.name,
      role: u.role,
      timezone: u.timezone || null,
      scheduled,
      recurring,
      available: recurring.filter((s) => s.slot_type === 'available'),
      planned: recurring.filter((s) => s.slot_type === 'planned'),
    };
  }
  return json(out);
}

// ---------------------------------------------------------------------------
// Google API access (token refresh + authed fetch)
// ---------------------------------------------------------------------------

// Returns a valid access token for the user, refreshing via the stored
// refresh_token when expired (5-min buffer). `force` refreshes regardless of
// expiry (used after a 401). Returns null if the grant was revoked.
async function refreshGoogleToken(userId, env, force = false) {
  const row = await env.DB.prepare(
    'SELECT google_access_token, google_refresh_token, google_token_expires_at FROM users WHERE id = ?'
  ).bind(userId).first();
  if (!row) return null;
  const data = {
    access_token: row.google_access_token,
    refresh_token: row.google_refresh_token,
    expires_at: row.google_token_expires_at
  };
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
  await env.DB.prepare(
    'UPDATE users SET google_access_token = ?, google_refresh_token = ?, google_token_expires_at = ? WHERE id = ?'
  ).bind(next.access_token, next.refresh_token, next.expires_at, userId).run();
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

// ---------------------------------------------------------------------------
// Access control (owner manages Alice's Drive/Calendar visibility)
// ---------------------------------------------------------------------------

// Returns a Set of allowed google_file_ids for a restricted (assistant) user,
// or null when there's no restriction (owner, or no allow rules = open).
// Combines legacy `drive_access_rules` (owner-managed) with v1.8
// `drive_sharing_rules` (bidirectional) where the current user is the grantee.
async function allowedDriveIds(env, user) {
  if (!user || user.role === 'owner') return null;
  const ids = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT google_file_id FROM drive_access_rules WHERE access_type = 'allow' AND applies_to = 'alice'"
    ).all();
    for (const r of results || []) ids.push(r.google_file_id);
  } catch { /* table missing → no legacy rules */ }
  try {
    const { results } = await env.DB.prepare(
      'SELECT google_file_id FROM drive_sharing_rules WHERE grantee_user_id = ?'
    ).bind(user.id).all();
    for (const r of results || []) ids.push(r.google_file_id);
  } catch { /* table missing */ }
  return ids.length ? new Set(ids) : null;
}

async function allowedCalendarIds(env, user) {
  if (!user || user.role === 'owner') return null;
  const ids = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT google_calendar_id FROM calendar_access_rules WHERE access_type = 'allow' AND applies_to = 'alice'"
    ).all();
    for (const r of results || []) ids.push(r.google_calendar_id);
  } catch { /* legacy table missing */ }
  try {
    const { results } = await env.DB.prepare(
      'SELECT google_calendar_id FROM calendar_sharing_rules WHERE grantee_user_id = ?'
    ).bind(user.id).all();
    for (const r of results || []) ids.push(r.google_calendar_id);
  } catch { /* table missing */ }
  return ids.length ? new Set(ids) : null;
}

async function handleAccessDrive(request, env, user) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT * FROM drive_access_rules ORDER BY created_at DESC').all();
      return json(results || []);
    } catch {
      return json([]);
    }
  }
  if (request.method === 'POST') {
    if (user.role !== 'owner') return json({ error: 'Não autorizado' }, 403);
    const body = (await readJson(request)) || {};
    if (!body.google_file_id || !body.file_name) return json({ error: 'Campos obrigatórios ausentes' }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO drive_access_rules (id, created_by, google_file_id, file_name, mime_type, access_type, applies_to, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, user.id, body.google_file_id, body.file_name, body.mime_type || '', body.access_type || 'allow', body.applies_to || 'alice', Math.floor(Date.now() / 1000)).run();
    return json({ ok: true, id }, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleAccessDriveItem(request, env, user, id) {
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  if (user.role !== 'owner') return json({ error: 'Não autorizado' }, 403);
  await env.DB.prepare('DELETE FROM drive_access_rules WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function handleAccessCalendar(request, env, user) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT * FROM calendar_access_rules ORDER BY created_at DESC').all();
      return json(results || []);
    } catch {
      return json([]);
    }
  }
  if (request.method === 'POST') {
    if (user.role !== 'owner') return json({ error: 'Não autorizado' }, 403);
    const body = (await readJson(request)) || {};
    if (!body.google_calendar_id || !body.calendar_name) return json({ error: 'Campos obrigatórios ausentes' }, 400);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO calendar_access_rules (id, created_by, google_calendar_id, calendar_name, color, access_type, applies_to, created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, user.id, body.google_calendar_id, body.calendar_name, body.color || '#6366f1', body.access_type || 'allow', body.applies_to || 'alice', Math.floor(Date.now() / 1000)).run();
    return json({ ok: true, id }, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleAccessCalendarItem(request, env, user, id) {
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  if (user.role !== 'owner') return json({ error: 'Não autorizado' }, 403);
  await env.DB.prepare('DELETE FROM calendar_access_rules WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Bidirectional Drive/Calendar sharing (v1.8)
// Either user (Lauro or Alice) can grant the other access to items in their
// own Drive/Calendar. The grantor's Google token is used at fetch time.
// ---------------------------------------------------------------------------

async function otherUserId(env, currentUserId) {
  const row = await env.DB.prepare(
    "SELECT id FROM users WHERE id <> ? ORDER BY (role='owner') DESC, name LIMIT 1"
  ).bind(currentUserId).first();
  return row ? row.id : null;
}

function shapeSharingRule(r, type) {
  return {
    id: r.id,
    grantor_user_id: r.grantor_user_id,
    grantee_user_id: r.grantee_user_id,
    [type === 'drive' ? 'google_file_id' : 'google_calendar_id']:
      type === 'drive' ? r.google_file_id : r.google_calendar_id,
    [type === 'drive' ? 'file_name' : 'calendar_name']:
      type === 'drive' ? r.file_name : r.calendar_name,
    mime_type: r.mime_type || '',
    color: r.color || null,
    created_at: r.created_at
  };
}

async function handleSharingDrive(request, env, user) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM drive_sharing_rules
         WHERE grantor_user_id = ? OR grantee_user_id = ?
         ORDER BY created_at DESC`
      ).bind(user.id, user.id).all();
      return json((results || []).map((r) => shapeSharingRule(r, 'drive')));
    } catch {
      return json([]); // table not migrated yet
    }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.google_file_id || !body.file_name) {
      return json({ error: 'Campos obrigatórios: google_file_id, file_name' }, 400);
    }
    const granteeId = body.grantee_user_id || (await otherUserId(env, user.id));
    if (!granteeId) return json({ error: 'Outro usuário não encontrado' }, 400);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO drive_sharing_rules
           (id, grantor_user_id, grantee_user_id, google_file_id, file_name, mime_type, created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(
        id, user.id, granteeId, body.google_file_id, body.file_name,
        body.mime_type || '', Math.floor(Date.now() / 1000)
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM drive_sharing_rules WHERE id = ?').bind(id).first();
    return json(shapeSharingRule(row, 'drive'), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleSharingDriveItem(request, env, user, id) {
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  const row = await env.DB.prepare('SELECT * FROM drive_sharing_rules WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Regra não encontrada' }, 404);
  if (row.grantor_user_id !== user.id) return json({ error: 'Apenas o concedente pode remover' }, 403);
  await env.DB.prepare('DELETE FROM drive_sharing_rules WHERE id = ?').bind(id).run();
  return json({ deleted: true });
}

async function handleSharingCalendar(request, env, user) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT * FROM calendar_sharing_rules
         WHERE grantor_user_id = ? OR grantee_user_id = ?
         ORDER BY created_at DESC`
      ).bind(user.id, user.id).all();
      return json((results || []).map((r) => shapeSharingRule(r, 'calendar')));
    } catch {
      return json([]);
    }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.google_calendar_id || !body.calendar_name) {
      return json({ error: 'Campos obrigatórios: google_calendar_id, calendar_name' }, 400);
    }
    const granteeId = body.grantee_user_id || (await otherUserId(env, user.id));
    if (!granteeId) return json({ error: 'Outro usuário não encontrado' }, 400);
    const id = crypto.randomUUID();
    try {
      await env.DB.prepare(
        `INSERT INTO calendar_sharing_rules
           (id, grantor_user_id, grantee_user_id, google_calendar_id, calendar_name, color, created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(
        id, user.id, granteeId, body.google_calendar_id, body.calendar_name,
        body.color || '#6366f1', Math.floor(Date.now() / 1000)
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM calendar_sharing_rules WHERE id = ?').bind(id).first();
    return json(shapeSharingRule(row, 'calendar'), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleSharingCalendarItem(request, env, user, id) {
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  const row = await env.DB.prepare('SELECT * FROM calendar_sharing_rules WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Regra não encontrada' }, 404);
  if (row.grantor_user_id !== user.id) return json({ error: 'Apenas o concedente pode remover' }, 403);
  await env.DB.prepare('DELETE FROM calendar_sharing_rules WHERE id = ?').bind(id).run();
  return json({ deleted: true });
}

// Returns a map google_calendar_id → grantor_user_id for calendars shared
// with `user`. Used so each shared calendar is fetched with its owner's token.
async function calendarGrantorMap(env, user) {
  const map = new Map();
  try {
    const { results } = await env.DB.prepare(
      'SELECT google_calendar_id, grantor_user_id FROM calendar_sharing_rules WHERE grantee_user_id = ?'
    ).bind(user.id).all();
    for (const r of results || []) map.set(r.google_calendar_id, r.grantor_user_id);
  } catch { /* table missing */ }
  return map;
}

async function handleCalendarEvents(request, env, user) {
  // v2.1.1 — GET fails open (empty list); writes still 403.
  if (request.method !== 'GET' && !requirePermission(user, 'calendar', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (request.method === 'GET' && !requirePermission(user, 'calendar', 'view')) {
    return json([]);
  }
  if (request.method === 'POST' && !canDo(user.granular, 'calendar', 'create')) {
    return json({ error: 'Sem permissão para criar eventos' }, 403);
  }
  if (request.method === 'GET') {
    const url = new URL(request.url);
    const timeMin = url.searchParams.get('start') || new Date().toISOString();
    const timeMax = url.searchParams.get('end') || new Date(Date.now() + 30 * 86400000).toISOString();
    const calsParam = url.searchParams.get('calendars');
    const calendars = calsParam ? calsParam.split(',').filter(Boolean) : ['primary'];
    const shareMap = await calendarGrantorMap(env, user);
    const all = [];
    for (const cal of calendars) {
      // Each calendar uses the token of whichever user owns it: the current
      // user's own calendar uses their token; a shared calendar uses the
      // grantor's token (per calendar_sharing_rules).
      const tokenUserId = shareMap.get(cal) || user.id;
      const api =
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events?` +
        new URLSearchParams({ timeMin, timeMax, singleEvents: 'true', orderBy: 'startTime', maxResults: '100' });
      const resp = await googleFetch(api, tokenUserId, env);
      const guard = googleGuard(resp);
      if (guard) return guard;
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const ev of data.items || []) {
        const shaped = shapeGoogleEvent(ev, cal);
        shaped.ownerUserId = tokenUserId;
        all.push(shaped);
        await cacheEvent(env, tokenUserId, shaped, ev);
      }
    }
    return json(all);
  }

  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    const cal = body.calendar_id || 'primary';
    const shareMap = await calendarGrantorMap(env, user);

    // Modelo de agenda compartilhada (v2.5.1): a equipe trabalha sobre o
    // calendário do OWNER. Não-owners criam eventos com o token do OWNER (assim
    // 'primary' resolve para a agenda do owner e o evento aparece para todos),
    // atribuindo a autoria ao usuário atual. O owner usa o próprio token. Um
    // calendário explicitamente compartilhado (shareMap) usa o token do
    // concedente, preservando o comportamento anterior de compartilhamento.
    let tokenUserId = shareMap.get(cal);
    if (!tokenUserId) {
      if (user.role === 'owner') {
        tokenUserId = user.id;
      } else {
        const owner = await env.DB.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").first();
        // 1º tenta o token do owner (agenda compartilhada); se o owner não tiver
        // token, cai para o token do próprio usuário como último recurso.
        tokenUserId = owner && owner.id ? owner.id : user.id;
      }
    }

    // Se nem o alvo resolvido nem o próprio usuário têm token Google válido,
    // devolve um 403 amigável em vez de deixar a chamada ao Google falhar.
    let accessToken = await refreshGoogleToken(tokenUserId, env);
    if (!accessToken && tokenUserId !== user.id) {
      // Fallback final: token do próprio usuário (owner sem token / cenário raro).
      tokenUserId = user.id;
      accessToken = await refreshGoogleToken(tokenUserId, env);
    }
    if (!accessToken) {
      return json({ error: 'Autorize o acesso ao Google Calendar primeiro' }, 403);
    }

    // Atribuição: quando o criador não é o dono do token usado, marca a autoria
    // na descrição e em extendedProperties (o Google atribui o "creator" à conta
    // autenticada, então registramos o autor real explicitamente).
    const eventBody = buildGoogleEventBody(body);
    if (tokenUserId !== user.id) {
      const who = user.name || user.email || 'Aide';
      eventBody.description = eventBody.description
        ? `${eventBody.description}\n\n— Criado por ${who} (Aide)`
        : `Criado por ${who} (Aide)`;
      eventBody.extendedProperties = {
        private: { aideCreatedBy: String(user.id), aideCreatedByName: who },
      };
    }

    const resp = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events`,
      tokenUserId, env,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(eventBody) }
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok) return json({ error: 'google_error', detail: await resp.text() }, 502);
    const ev = await resp.json();
    const shaped = shapeGoogleEvent(ev, cal);
    await cacheEvent(env, tokenUserId, shaped, ev);
    return json(shaped, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleCalendarEventItem(request, env, user, eventId) {
  if (!eventId) return json({ error: 'ID ausente' }, 400);
  // v2.1 granular: PUT requires edit_own/edit_all; DELETE requires delete.
  // We can't cheaply detect Google event ownership here, so edit_own is treated
  // permissively (assumes own-Google-calendar = own event).
  if (request.method === 'PUT' &&
      !canDo(user.granular, 'calendar', 'edit_all') &&
      !canDo(user.granular, 'calendar', 'edit_own')) {
    return json({ error: 'Sem permissão para editar eventos' }, 403);
  }
  if (request.method === 'DELETE' && !canDo(user.granular, 'calendar', 'delete')) {
    return json({ error: 'Sem permissão para deletar eventos' }, 403);
  }
  const url = new URL(request.url);

  // Determine which calendar this event belongs to and resolve its owner
  // token (own vs shared).
  const calFromBody = async () => {
    const body = (await readJson(request)) || {};
    return { body, cal: body.calendar_id || 'primary' };
  };
  const shareMap = await calendarGrantorMap(env, user);

  if (request.method === 'PUT') {
    const { body, cal } = await calFromBody();
    const tokenUserId = shareMap.get(cal) || user.id;
    const resp = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}`,
      tokenUserId, env,
      { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildGoogleEventBody(body)) }
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok) return json({ error: 'google_error', detail: await resp.text() }, 502);
    const ev = await resp.json();
    const shaped = shapeGoogleEvent(ev, cal);
    await cacheEvent(env, tokenUserId, shaped, ev);
    return json(shaped);
  }

  if (request.method === 'DELETE') {
    const cal = url.searchParams.get('calendarId') || 'primary';
    const tokenUserId = shareMap.get(cal) || user.id;
    const resp = await googleFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal)}/events/${encodeURIComponent(eventId)}`,
      tokenUserId, env, { method: 'DELETE' }
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
  // Each user lists their OWN calendarList. We then append shared calendars
  // (calendar_sharing_rules) using the grantor's token to fetch metadata so
  // the UI can render their colors and titles.
  const ownResp = await googleFetch(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    user.id, env
  );
  const guard = googleGuard(ownResp);
  if (guard) return guard;
  if (!ownResp.ok) return json({ error: 'google_error' }, 502);
  const ownData = await ownResp.json();
  const list = (ownData.items || []).map((c) => ({
    id: c.id,
    summary: c.summary,
    backgroundColor: c.backgroundColor || null,
    primary: !!c.primary,
    sharedBy: null,
  }));

  // Merge in calendars shared with the user.
  try {
    const { results } = await env.DB.prepare(
      `SELECT csr.google_calendar_id, csr.calendar_name, csr.color, csr.grantor_user_id, u.name AS grantor_name
       FROM calendar_sharing_rules csr
       LEFT JOIN users u ON csr.grantor_user_id = u.id
       WHERE csr.grantee_user_id = ?`
    ).bind(user.id).all();
    for (const r of results || []) {
      if (list.find((c) => c.id === r.google_calendar_id)) continue;
      list.push({
        id: r.google_calendar_id,
        summary: r.calendar_name,
        backgroundColor: r.color || '#6366f1',
        primary: false,
        sharedBy: r.grantor_name || null,
      });
    }
  } catch { /* table missing */ }

  return json(list);
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
  // v2.1.1 — GET fails open (empty list) for unauthorized users.
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  if (!requirePermission(user, 'drive', 'view')) return json([]);
  const url = new URL(request.url);
  const parent = url.searchParams.get('parent');
  const search = url.searchParams.get('search');
  const esc = (s) => s.replace(/'/g, "\\'");
  let q;
  if (search) q = `name contains '${esc(search)}' and trashed = false`;
  else if (parent) q = `'${esc(parent)}' in parents and trashed = false`;
  else q = `'root' in parents and trashed = false`;

  // Each user sees their OWN Drive. When navigating into a folder that was
  // shared via drive_sharing_rules (Alice was granted access to Lauro's
  // folder), fetch that subtree with the grantor's token instead.
  let tokenUserId = user.id;
  if (parent) {
    try {
      const share = await env.DB.prepare(
        'SELECT grantor_user_id FROM drive_sharing_rules WHERE google_file_id = ? AND grantee_user_id = ?'
      ).bind(parent, user.id).first();
      if (share && share.grantor_user_id) tokenUserId = share.grantor_user_id;
    } catch { /* table missing → no sharing rules */ }
  }

  const api =
    'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({
      q,
      pageSize: '50',
      orderBy: 'folder,name',
      fields: 'files(id,name,mimeType,webViewLink,iconLink,modifiedTime,size,parents)'
    });
  const resp = await googleFetch(api, tokenUserId, env);
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
    await cacheDriveItem(env, tokenUserId, f);
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

  // At root, append items shared with this user (from drive_sharing_rules)
  // so they appear alongside the user's own Drive contents.
  if (!parent && !search) {
    try {
      const shared = await env.DB.prepare(
        `SELECT dsr.google_file_id, dsr.file_name, dsr.mime_type, u.name AS grantor_name
         FROM drive_sharing_rules dsr
         LEFT JOIN users u ON dsr.grantor_user_id = u.id
         WHERE dsr.grantee_user_id = ?`
      ).bind(user.id).all();
      for (const r of shared.results || []) {
        if (!files.find((f) => f.googleFileId === r.google_file_id)) {
          files.push({
            id: r.google_file_id,
            googleFileId: r.google_file_id,
            name: r.file_name,
            mimeType: r.mime_type || '',
            webViewLink: null,
            iconLink: null,
            modifiedTime: null,
            size: null,
            parents: [],
            isFavorite: favSet.has(r.google_file_id),
            shared: true,
            sharedBy: r.grantor_name || null,
          });
        }
      }
    } catch { /* table missing */ }
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
  // v2.1.1 — GET fails open (empty list); writes still 403.
  if (request.method !== 'GET' && !requirePermission(user, 'notes', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (request.method === 'GET' && !requirePermission(user, 'notes', 'view')) {
    return json([]);
  }
  if (request.method === 'POST' && !canDo(user.granular, 'notes', 'create')) {
    return json({ error: 'Sem permissão para criar notas' }, 403);
  }

  if (request.method === 'GET') {
    // v2.1.2 — Notes visibility is decided by GRANULAR perms (notes.view_all
    // > notes.view_own), not by the legacy coarse `notesLevel`. The previous
    // logic blocked users whose preset said 'own_and_tagged' even when they
    // had a granular override granting notes.view_all=1.
    const canViewAll = canDo(user.granular, 'notes', 'view_all');
    const canViewOwn = canDo(user.granular, 'notes', 'view_own');
    if (!canViewAll && !canViewOwn) return json([]);

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
    if (!canViewAll && canViewOwn) {
      where.push('n.created_by = ?');
      binds.push(user.id);
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

  if (request.method === 'DELETE' && !canDo(user.granular, 'notes', 'delete')) {
    return json({ error: 'Sem permissão para deletar notas' }, 403);
  }

  if (request.method === 'PUT') {
    const existing = await env.DB.prepare('SELECT * FROM notes WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Nota não encontrada' }, 404);
    // v2.1 granular: PUT requires edit_all OR (edit_own AND user is author).
    const canEditAll = canDo(user.granular, 'notes', 'edit_all');
    const canEditOwn = canDo(user.granular, 'notes', 'edit_own');
    if (!canEditAll && !(canEditOwn && existing.created_by === user.id)) {
      return json({ error: 'Sem permissão para editar esta nota' }, 403);
    }
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

// Notify users mentioned in newly added comments (compares old vs new by id).
async function notifyCommentMentions(env, ctx, author, task, oldComments, newComments) {
  const oldIds = new Set((oldComments || []).map((c) => c && c.id).filter(Boolean));
  const authorName = author.name || 'Alguém';
  for (const c of newComments || []) {
    if (!c || (c.id && oldIds.has(c.id))) continue; // only freshly added comments
    const mentions = Array.isArray(c.mentions) ? [...new Set(c.mentions)] : [];
    const text = String(c.text || '');
    const snippet = text.length > 100 ? `${text.slice(0, 100)}…` : text;
    for (const uid of mentions) {
      if (!uid || uid === author.id) continue; // don't notify the author
      await createNotification(env, ctx, {
        from_user_id: author.id,
        to_user_id: uid,
        type: 'mention',
        title: `${authorName} mencionou você em uma tarefa`,
        body: `${task.title}: ${snippet}`,
        task_id: task.id
      });
    }
  }
}

// All-day Google Calendar events use an EXCLUSIVE end date, so end = due_date + 1.
function nextDayISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// Mirror a task to the assigned user's Google Calendar as an all-day event.
// Non-blocking: scheduled via ctx.waitUntil so it never delays the save response.
function syncTaskToCalendar(env, ctx, task) {
  const job = (async () => {
    try {
      if (!task.assigned_to) return;
      // v1.9.8: cada usuário tem o próprio Google Calendar. O evento da tarefa
      // é gravado no calendário do USUÁRIO ATRIBUÍDO (não mais sempre no
      // calendário do owner).
      const userId = task.assigned_to;
      if (!userId) return;
      const cal = 'primary';
      const base = `https://www.googleapis.com/calendar/v3/calendars/${cal}/events`;

      // Completed task: remove its event if one exists.
      if (task.status === 'done') {
        if (task.google_event_id) {
          await googleFetch(`${base}/${encodeURIComponent(task.google_event_id)}`, userId, env, { method: 'DELETE' });
          await env.DB.prepare('UPDATE tasks SET google_event_id = NULL WHERE id = ?').bind(task.id).run();
        }
        return;
      }
      if (!task.due_date) return; // nothing to schedule

      const todayStr = new Date().toISOString().slice(0, 10);
      const colorId = task.due_date < todayStr ? '11' : '5'; // red overdue / blue normal
      const payload = {
        summary: task.title,
        description: 'Tarefa AIDE: ' + (task.description || ''),
        start: { date: task.due_date },
        end: { date: nextDayISO(task.due_date) },
        colorId
      };
      const headers = { 'Content-Type': 'application/json' };

      if (task.google_event_id) {
        const resp = await googleFetch(
          `${base}/${encodeURIComponent(task.google_event_id)}`,
          userId, env,
          { method: 'PATCH', headers, body: JSON.stringify(payload) }
        );
        if (resp && resp.status === 404) {
          // Event was deleted upstream — recreate below.
          task.google_event_id = null;
        } else {
          return;
        }
      }
      const resp = await googleFetch(base, userId, env, {
        method: 'POST', headers, body: JSON.stringify(payload)
      });
      if (!resp || !resp.ok) return;
      const ev = await resp.json();
      if (ev && ev.id) {
        await env.DB.prepare('UPDATE tasks SET google_event_id = ? WHERE id = ?').bind(ev.id, task.id).run();
      }
    } catch (_) {
      // Calendar sync is best-effort; never surface errors to the task save.
    }
  })();
  if (ctx && ctx.waitUntil) ctx.waitUntil(job);
  else job.catch(() => {});
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
  // Trim defensivo: usuários colando o segredo do dashboard às vezes incluem
  // espaços/quebras de linha invisíveis. Normalizamos no read.
  if (row) {
    row.bridge_secret = (row.bridge_secret || '').trim();
    row.lifegame_url = (row.lifegame_url || '').trim().replace(/\/$/, '');
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
  // Test/debug endpoints rodam ANTES da validação de secret. Esse é o ponto
  // do diagnóstico — usuário precisa conseguir testar exatamente quando o
  // secret pode estar errado. Owner-only enforça a auth.
  if (path === '/api/bridge/test' || path === '/api/bridge/config/debug') {
    let userForDebug = await getUserFromRequest(request, env);
    // Fallback debug-only: aceita ?token=<bearer> na query, permitindo
    // acessar via barra de endereços do browser (que não manda header).
    // Restrito aos dois endpoints diagnóstico e validado contra D1.
    if (!userForDebug) {
      const queryToken = new URL(request.url).searchParams.get('token');
      if (queryToken) {
        const now = Math.floor(Date.now() / 1000);
        userForDebug = await env.DB.prepare(
          `SELECT u.* FROM sessions s
             JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND s.expires_at > ?`
        ).bind(queryToken, now).first();
      }
    }
    if (!userForDebug || userForDebug.role !== 'owner') {
      return json({
        error: 'Apenas owner',
        hint: 'Acesse via SettingsPage (botão Testar conexão) OU adicione ?token=<seu_bearer> na URL. Pegue o token em DevTools > Application > Local Storage > aide_token.',
      }, 403);
    }
    if (path === '/api/bridge/test') return handleBridgeTest(env);
    return handleBridgeConfigDebug(env);
  }

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
  if (path === '/api/bridge/push/timelog') return handleBridgePushTimeEntries(env, config); // alias
  if (path === '/api/bridge/push/people') return handleBridgePushPeople(env, config);
  if (path === '/api/bridge/pull/tasks') return handleBridgePullTasks(env, config);
  if (path === '/api/bridge/pull/people') return handleBridgePullPeople(env, config);
  if (path === '/api/bridge/pull/timelog') return handleBridgePullTimelog(env, config);
  if (path === '/api/bridge/import/tasks') return handleBridgeImport(env, config, 'tasks');
  if (path === '/api/bridge/import/people') return handleBridgeImport(env, config, 'people');
  if (path === '/api/bridge/receive/sprints') return handleBridgeReceiveSprints(request, env);
  if (path === '/api/bridge/receive/xp') return handleBridgeReceiveXp(request, env);
  if (path === '/api/bridge/receive/people') return handleBridgeReceivePeople(request, env);
  if (path === '/api/bridge/receive/timelog') return handleBridgeReceiveTimelog(request, env);
  if (path === '/api/bridge/sync-status') return handleBridgeSyncStatus(env);

  // --- Curadoria de tarefas do Lifegame (v2.4.4) ---------------------------
  // Rotas acessadas pelo owner via browser (sessão, não secret).
  if (path === '/api/bridge/staging' && method === 'GET') return handleBridgeStagingList(request, env, user);
  if (path === '/api/bridge/staging/count' && method === 'GET') return handleBridgeStagingCount(env, user);
  if (path === '/api/bridge/staging/approve' && method === 'POST') return handleBridgeStagingApprove(request, env, user);
  if (path === '/api/bridge/staging/reject' && method === 'POST') return handleBridgeStagingReject(request, env, user);
  if (path === '/api/bridge/staging/clear' && method === 'DELETE') return handleBridgeStagingClear(env, user);

  // Curadoria de PESSOAS do Lifegame (v2.4.6).
  if (path === '/api/bridge/people/staging' && method === 'GET') return handleBridgePeopleStagingList(request, env, user);
  if (path === '/api/bridge/people/staging/count' && method === 'GET') return handleBridgePeopleStagingCount(env, user);
  if (path === '/api/bridge/people/staging/approve' && method === 'POST') return handleBridgePeopleStagingApprove(request, env, user);
  if (path === '/api/bridge/people/staging/reject' && method === 'POST') return handleBridgePeopleStagingReject(request, env, user);

  return json({ error: 'Rota não encontrada' }, 404);
}

// --- Curadoria: handlers ----------------------------------------------------
// Todas exigem owner (a bridge por secret não usa curadoria — user será null).
function requireOwner(user) {
  return user && user.role === 'owner';
}

function shapeStagingRow(r) {
  if (!r) return r;
  return {
    ...r,
    tags: parseJsonArray(r.tags),
    reviewed: !!r.reviewed,
    approved: !!r.approved,
    score: (Number(r.urgency) || 0) + (Number(r.importance) || 0),
  };
}

async function handleBridgeStagingList(request, env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  const url = new URL(request.url);
  const search = (url.searchParams.get('search') || '').trim();
  let sql = 'SELECT * FROM bridge_task_staging WHERE reviewed = 0';
  const args = [];
  if (search) { sql += ' AND title LIKE ?'; args.push(`%${search}%`); }
  sql += ' ORDER BY (urgency + importance) DESC, staged_at DESC';
  try {
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json((results || []).map(shapeStagingRow));
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/no such table/i.test(msg)) return json({ error: 'Migração 0032 não aplicada', detail: msg }, 503);
    return json({ error: 'Falha ao listar staging', detail: msg }, 500);
  }
}

async function handleBridgeStagingCount(env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  // Contagem combinada tarefas + pessoas. `pending` = total (compat com o badge
  // do menu de perfil que já lê essa chave).
  let tasks = 0;
  let people = 0;
  try {
    const t = await env.DB.prepare('SELECT COUNT(*) AS n FROM bridge_task_staging WHERE reviewed = 0').first();
    tasks = (t && t.n) || 0;
  } catch { /* tabela ausente */ }
  try {
    const p = await env.DB.prepare('SELECT COUNT(*) AS n FROM bridge_person_staging WHERE reviewed = 0').first();
    people = (p && p.n) || 0;
  } catch { /* tabela ausente */ }
  const total = tasks + people;
  return json({ tasks, people, total, pending: total });
}

async function handleBridgeStagingApprove(request, env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  const body = (await readJson(request)) || {};
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return json({ error: 'ids é obrigatório' }, 400);
  const now = Math.floor(Date.now() / 1000);
  let approved = 0;
  const errors = [];
  for (const id of ids) {
    try {
      const s = await env.DB.prepare('SELECT * FROM bridge_task_staging WHERE id = ?').bind(id).first();
      if (!s) { errors.push({ id, error: 'não encontrado' }); continue; }
      if (s.imported_task_id) { errors.push({ id, error: 'já importado' }); continue; }
      // Evita duplicar caso já exista uma task com o mesmo lifegame_id.
      const dup = await env.DB.prepare('SELECT id FROM tasks WHERE lifegame_id = ?').bind(s.lifegame_id).first();
      const taskId = dup ? dup.id : crypto.randomUUID();
      if (!dup) {
        await env.DB.prepare(
          `INSERT INTO tasks
            (id, title, description, urgency, importance, energy, status, tags, comments, subtasks, time_entries,
             favorited, drive_attachments, source, lifegame_id, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 5, ?, ?, '[]', '[]', '[]', 0, '[]', 'lifegame', ?, ?, ?)`
        ).bind(
          taskId, s.title, s.description || '', s.urgency, s.importance, s.status,
          s.tags || '[]', s.lifegame_id, now, now
        ).run();
      }
      await env.DB.prepare(
        'UPDATE bridge_task_staging SET reviewed=1, approved=1, imported_at=?, imported_task_id=? WHERE id=?'
      ).bind(now, taskId, id).run();
      approved += 1;
    } catch (e) {
      errors.push({ id, error: String((e && e.message) || e).slice(0, 200) });
    }
  }
  return json({ approved, errors });
}

async function handleBridgeStagingReject(request, env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  const body = (await readJson(request)) || {};
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return json({ error: 'ids é obrigatório' }, 400);
  try {
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE bridge_task_staging SET reviewed=1, approved=0 WHERE id IN (${placeholders})`
    ).bind(...ids).run();
    return json({ rejected: ids.length });
  } catch (e) {
    return json({ error: 'Falha ao rejeitar', detail: String((e && e.message) || e) }, 500);
  }
}

async function handleBridgeStagingClear(env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  try {
    const res = await env.DB.prepare('DELETE FROM bridge_task_staging WHERE reviewed = 1').run();
    const deleted = (res && res.meta && res.meta.changes) || 0;
    return json({ deleted });
  } catch (e) {
    return json({ error: 'Falha ao limpar', detail: String((e && e.message) || e) }, 500);
  }
}

// --- Curadoria de PESSOAS (bridge_person_staging, v2.4.6) --------------------

function shapePersonStagingRow(r) {
  if (!r) return r;
  return {
    ...r,
    tags: parseJsonArray(r.tags),
    area_ids: parseJsonArray(r.area_ids),
    reviewed: !!r.reviewed,
    approved: !!r.approved,
  };
}

async function handleBridgePeopleStagingList(request, env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  const url = new URL(request.url);
  const search = (url.searchParams.get('search') || '').trim();
  let sql = 'SELECT * FROM bridge_person_staging WHERE reviewed = 0';
  const args = [];
  if (search) { sql += ' AND name LIKE ?'; args.push(`%${search}%`); }
  sql += ' ORDER BY connection_strength DESC, name ASC';
  try {
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json((results || []).map(shapePersonStagingRow));
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/no such table/i.test(msg)) return json({ error: 'Migração 0034 não aplicada', detail: msg }, 503);
    return json({ error: 'Falha ao listar staging de pessoas', detail: msg }, 500);
  }
}

async function handleBridgePeopleStagingCount(env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  try {
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS pending FROM bridge_person_staging WHERE reviewed = 0'
    ).first();
    return json({ pending: (row && row.pending) || 0 });
  } catch {
    return json({ pending: 0 });
  }
}

async function handleBridgePeopleStagingApprove(request, env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  const body = (await readJson(request)) || {};
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return json({ error: 'ids é obrigatório' }, 400);
  const now = Math.floor(Date.now() / 1000);
  let approved = 0;
  const errors = [];
  for (const id of ids) {
    try {
      const s = await env.DB.prepare('SELECT * FROM bridge_person_staging WHERE id = ?').bind(id).first();
      if (!s) { errors.push({ id, error: 'não encontrado' }); continue; }
      if (s.imported_person_id) { errors.push({ id, error: 'já importado' }); continue; }
      // Evita duplicar caso já exista pessoa com o mesmo lifegame_person_id.
      const dup = await env.DB.prepare('SELECT id FROM network_people WHERE lifegame_person_id = ?').bind(s.lifegame_person_id).first();
      const personId = dup ? dup.id : crypto.randomUUID();
      if (!dup) {
        await env.DB.prepare(
          `INSERT INTO network_people
            (id, name, type, role, connection_strength, notes, tags, lifegame_person_id, source, created_at, updated_at)
           VALUES (?, ?, 'person', ?, ?, ?, ?, ?, 'lifegame', ?, ?)`
        ).bind(
          personId, s.name, s.role || '', s.connection_strength || 5, s.notes || '',
          s.tags || '[]', s.lifegame_person_id, now, now
        ).run();
      }
      await env.DB.prepare(
        'UPDATE bridge_person_staging SET reviewed=1, approved=1, imported_at=?, imported_person_id=? WHERE id=?'
      ).bind(now, personId, id).run();
      approved += 1;
    } catch (e) {
      errors.push({ id, error: String((e && e.message) || e).slice(0, 200) });
    }
  }
  return json({ approved, errors });
}

async function handleBridgePeopleStagingReject(request, env, user) {
  if (!requireOwner(user)) return json({ error: 'Apenas o owner' }, 403);
  const body = (await readJson(request)) || {};
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!ids.length) return json({ error: 'ids é obrigatório' }, 400);
  try {
    const placeholders = ids.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE bridge_person_staging SET reviewed=1, approved=0 WHERE id IN (${placeholders})`
    ).bind(...ids).run();
    return json({ rejected: ids.length });
  } catch (e) {
    return json({ error: 'Falha ao rejeitar', detail: String((e && e.message) || e) }, 500);
  }
}

// Helper centralizado para chamadas ao Lifegame com logging detalhado.
// Retorna { ok, status, body, url } sempre — nunca lança.
async function lifegameFetch(config, urlPath, options = {}) {
  const url = `${config.lifegame_url.replace(/\/$/, '')}${urlPath}`;
  const secret = (config.bridge_secret || '').trim();
  const headers = {
    'X-Bridge-Secret': secret,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
  };
  try {
    const resp = await fetch(url, { method: options.method || 'GET', headers, body: options.body });
    let body = '';
    try { body = await resp.text(); } catch { /* ignore */ }
    return { ok: resp.ok, status: resp.status, body, url, secret_length: secret.length };
  } catch (e) {
    return { ok: false, status: 0, body: String((e && e.message) || e), url, secret_length: secret.length, network_error: true };
  }
}

// Diagnóstico — owner only, bypassa secret. Mostra config + tenta GET no
// /api/bridge/status do Lifegame.
async function handleBridgeTest(env) {
  const config = await getBridgeConfig(env);
  const cfg = {
    lifegame_url: config.lifegame_url || null,
    secret_length: (config.bridge_secret || '').length,
    secret_first4: (config.bridge_secret || '').slice(0, 4),
    secret_last4: (config.bridge_secret || '').slice(-4),
    secret_has_whitespace: /\s/.test(config.bridge_secret || ''),
    sync_enabled: !!config.sync_enabled,
    last_sync_at: config.last_sync_at || null,
  };
  if (!config.lifegame_url) {
    return json({ config: cfg, lifegame_status: null, error: 'lifegame_url ausente em bridge_config' });
  }
  if (!config.bridge_secret) {
    return json({ config: cfg, lifegame_status: null, error: 'bridge_secret ausente em bridge_config' });
  }
  const r = await lifegameFetch(config, '/api/bridge/status');
  return json({
    config: cfg,
    lifegame_status: { ok: r.ok, status: r.status, body: r.body.slice(0, 500), url: r.url },
    error: r.ok ? null : (r.network_error ? `Network: ${r.body}` : `HTTP ${r.status}`),
  });
}

// Debug — owner only. Retorna valores brutos de bridge_config para detectar
// problemas de persistência (linha ausente, encoding, whitespace).
async function handleBridgeConfigDebug(env) {
  const row = await env.DB.prepare("SELECT * FROM bridge_config WHERE id = 'singleton'").first();
  if (!row) return json({ exists: false, message: 'Singleton row missing — getBridgeConfig criaria uma em vazio' });
  const sec = row.bridge_secret || '';
  return json({
    exists: true,
    id: row.id,
    lifegame_url: row.lifegame_url || '',
    lifegame_url_trailing_slash: (row.lifegame_url || '').endsWith('/'),
    bridge_secret_length: sec.length,
    bridge_secret_first4: sec.slice(0, 4),
    bridge_secret_last4: sec.slice(-4),
    bridge_secret_has_whitespace: /\s/.test(sec),
    bridge_secret_starts_with_space: sec.startsWith(' '),
    bridge_secret_ends_with_space: sec.endsWith(' '),
    sync_enabled: row.sync_enabled,
    last_sync_at: row.last_sync_at,
    updated_at: row.updated_at,
  });
}

async function handleBridgePushPeople(env, config) {
  if (!config.lifegame_url || !config.bridge_secret) return json({ error: 'Bridge não configurada' }, 400);
  let people = [];
  try {
    const dbR = await env.DB.prepare('SELECT * FROM network_people ORDER BY name').all();
    // Carimba origem para o anti-loop de eco no lado do Lifegame (mesmo padrão
    // das tarefas): o Lifegame deve devolver estes campos, e o import do AIDE
    // descarta o que tiver aidePersonId/source='aide'.
    people = (dbR.results || []).map((row) => {
      const sp = shapeNetworkPerson(row);
      return { ...sp, lifegamePersonId: sp.lifegame_person_id || null, aidePersonId: sp.id, source: 'aide' };
    });
  } catch {
    return json({ pushed: 0, error: 'Tabela network_people não migrada' }, 503);
  }
  const r = await lifegameFetch(config, '/api/bridge/people', {
    method: 'POST', body: JSON.stringify({ people }),
  });
  await logBridge(env, {
    direction: 'outbound', entity_type: 'people',
    status: r.ok ? 'success' : 'error',
    payload: `${people.length} pessoas`,
    error: r.ok ? null : `HTTP ${r.status}${r.body ? ` — ${r.body.slice(0, 300)}` : ''}`,
  });
  if (r.ok) return json({ pushed: people.length, errors: [] });
  return json({
    pushed: 0,
    errors: [`HTTP ${r.status}`],
    detail: r.body.slice(0, 500),
    url: r.url,
    secret_length: r.secret_length,
  }, r.status === 401 ? 401 : 502);
}

async function handleBridgeReceivePeople(request, env) {
  const body = (await readJson(request)) || {};
  const people = Array.isArray(body.people) ? body.people : [];
  const now = Math.floor(Date.now() / 1000);
  let received = 0;
  for (const p of people) {
    if (!p || !p.name) continue;
    try {
      const existing = p.lifegame_person_id
        ? await env.DB.prepare('SELECT id FROM network_people WHERE lifegame_person_id = ?').bind(p.lifegame_person_id).first()
        : null;
      if (existing) {
        await env.DB.prepare(
          `UPDATE network_people SET name=?, institution=?, role=?, email=?, phone=?, linkedin=?,
            notes=?, connection_to_lauro=?, connection_strength=?, dex_contact_id=?, updated_at=?
           WHERE id=?`
        ).bind(
          p.name, p.institution || '', p.role || '', p.email || '', p.phone || '',
          p.linkedin || '', p.notes || '', p.connection_to_lauro || '',
          Number(p.connection_strength) || 3, p.dex_contact_id || '', now, existing.id
        ).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO network_people
            (id, name, type, institution, role, area_of_work, email, phone, linkedin, notes,
             connection_to_lauro, connection_strength, tags, lifegame_person_id, dex_contact_id,
             created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          crypto.randomUUID(), p.name, p.type || 'person', p.institution || '', p.role || '',
          p.area_of_work || '', p.email || '', p.phone || '', p.linkedin || '', p.notes || '',
          p.connection_to_lauro || '', Number(p.connection_strength) || 3,
          JSON.stringify(p.tags || []), p.lifegame_person_id || '', p.dex_contact_id || '',
          now, now
        ).run();
      }
      received += 1;
    } catch { /* skip malformed */ }
  }
  await logBridge(env, {
    direction: 'inbound', entity_type: 'people', status: 'success',
    payload: `${received} pessoas`
  });
  return json({ received });
}

async function handleBridgeSyncStatus(env) {
  // Walk the sync log to find each entity type's most recent success.
  const safe = async (sql, ...binds) => {
    try {
      const r = await env.DB.prepare(sql).bind(...binds).first();
      return r;
    } catch { return null; }
  };
  const lastTask = await safe(
    "SELECT MAX(synced_at) AS t FROM bridge_sync_log WHERE entity_type = 'tasks' AND status = 'success'"
  );
  const lastTime = await safe(
    "SELECT MAX(synced_at) AS t FROM bridge_sync_log WHERE entity_type = 'time_entries' AND status = 'success'"
  );
  const lastPeople = await safe(
    "SELECT MAX(synced_at) AS t FROM bridge_sync_log WHERE entity_type = 'people' AND status = 'success'"
  );
  const taskCount = await safe('SELECT COUNT(*) AS n FROM tasks');
  const peopleCount = await safe('SELECT COUNT(*) AS n FROM network_people');
  const config = await getBridgeConfig(env);
  const connected = !!(config.lifegame_url && config.bridge_secret && config.sync_enabled);
  return json({
    tasks: { lastSync: lastTask ? lastTask.t : null, count: taskCount ? taskCount.n : 0 },
    timeEntries: { lastSync: lastTime ? lastTime.t : null },
    people: { lastSync: lastPeople ? lastPeople.t : null, count: peopleCount ? peopleCount.n : 0 },
    synced: connected,
    bridgeConfigured: connected
  });
}

async function handleBridgeConfigUpdate(request, env, existing) {
  try {
    const body = (await readJson(request)) || {};
    const url = body.lifegame_url !== undefined ? String(body.lifegame_url || '').trim() : existing.lifegame_url;

    // Secret handling: the GET endpoint returns the secret masked as a
    // string of bullet characters ('••••••••'). When the user types a new
    // secret without clearing the field they often end up with the mask
    // PREFIXED to their input ('••••••••mysecret'). Strip any leading
    // bullets first, then decide:
    //   - undefined / empty / pure-bullets / unchanged → keep existing
    //   - anything else → save it
    let secret = existing.bridge_secret;
    if (body.bridge_secret !== undefined) {
      const raw = String(body.bridge_secret || '');
      const cleaned = raw.replace(/^[•●]+/, '').trim();
      const isPureMask = /^[•●]*$/.test(raw);
      if (cleaned && !isPureMask) {
        secret = cleaned;
      }
    }

    const enabled = body.sync_enabled !== undefined ? (body.sync_enabled ? 1 : 0) : existing.sync_enabled;
    await env.DB.prepare(
      "UPDATE bridge_config SET lifegame_url=?, bridge_secret=?, sync_enabled=?, updated_at=? WHERE id='singleton'"
    ).bind(url, secret, enabled, Math.floor(Date.now() / 1000)).run();
    return json(maskBridgeConfig(await getBridgeConfig(env)));
  } catch (e) {
    return json({ error: 'Falha ao salvar configuração do Bridge', detail: String((e && e.message) || e) }, 500);
  }
}

async function handleBridgeLog(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, direction, entity_type, entity_id, status, error, synced_at FROM bridge_sync_log ORDER BY synced_at DESC LIMIT 50'
  ).all();
  return json(results || []);
}

async function handleBridgePushTasks(env, config) {
  // Erro de configuração com diagnóstico — diz QUAL campo está faltando.
  if (!config.lifegame_url || !config.bridge_secret) {
    return json({
      error: 'bridge_not_configured',
      missing: {
        lifegame_url: !config.lifegame_url,
        bridge_secret: !config.bridge_secret,
      },
      lifegame_url_set: !!config.lifegame_url,
      secret_length: (config.bridge_secret || '').length,
      hint: 'Configurar em Settings → Bridge — Lifegame na AIDE',
    }, 400);
  }
  const { results } = await env.DB.prepare(`${TASK_SELECT} ORDER BY t.created_at DESC`).all();
  // Anti-loop de eco: carimba cada tarefa de ORIGEM AIDE com aideTaskId + source
  // 'aide'. Se o Lifegame devolvê-la, o import a reconhece como eco e a ignora
  // (ver handleBridgeImport). Tarefas de origem 'lifegame' seguem SEM aideTaskId
  // para continuarem sincronizando normalmente pelo lifegame_id no retorno.
  const tasks = (results || []).map(shapeTask).map((t) =>
    (t.source || 'aide') !== 'lifegame' ? { ...t, aideTaskId: t.id, source: 'aide' } : t
  );
  const requestBody = JSON.stringify({ tasks });
  const r = await lifegameFetch(config, '/api/bridge/tasks', {
    method: 'POST', body: requestBody,
  });
  // Log inclui tamanho do payload e amostra do primeiro task pra diagnóstico
  // (Cloudflare guarda só os primeiros 500 chars de error).
  await logBridge(env, {
    direction: 'outbound', entity_type: 'tasks',
    status: r.ok ? 'success' : 'error',
    payload: `${tasks.length} tarefas, ${requestBody.length} bytes`,
    error: r.ok ? null : `HTTP ${r.status}${r.body ? ` — ${r.body.slice(0, 300)}` : ''}`,
  });
  if (r.ok) {
    await env.DB.prepare("UPDATE bridge_config SET last_sync_at=? WHERE id='singleton'")
      .bind(Math.floor(Date.now() / 1000)).run().catch(() => {});
    return json({ pushed: tasks.length, errors: [] });
  }
  // Spec: retornar 400 com detalhe completo da rejeição do Lifegame, para
  // o usuário ver direto na resposta o que o LG disse.
  return json({
    error: 'lifegame_rejected',
    status: r.status,
    detail: r.body.slice(0, 500),
    url: r.url,
    secret_length: r.secret_length,
    body_size: requestBody.length,
    task_count: tasks.length,
    first_task_sample: tasks[0] ? JSON.stringify(tasks[0]).slice(0, 300) : null,
  }, 400);
}

async function handleBridgePushTimeEntries(env, config) {
  if (!config.lifegame_url || !config.bridge_secret) return json({ error: 'Bridge não configurada' }, 400);
  // JOIN tasks + projects para obter task_title e area_id (Lifegame indexa por área).
  let results = [];
  try {
    const r = await env.DB.prepare(`
      SELECT e.*, t.title AS task_title, p.area_id AS area_id
      FROM time_entries e
      LEFT JOIN tasks t ON e.task_id = t.id
      LEFT JOIN projects p ON t.project_id = p.id
      ORDER BY e.started_at DESC
    `).all();
    results = r.results || [];
  } catch (e) {
    await logBridge(env, { direction: 'outbound', entity_type: 'timelog', status: 'error', error: `query: ${String(e)}` });
    return json({ pushed: 0, errors: [`query: ${String(e)}`] }, 500);
  }
  const entries = results.map((e) => ({
    id: e.id,
    taskId: e.task_id || null,
    taskTitle: e.task_title || '',
    areaId: e.area_id || '',
    startedAt: e.started_at,
    endedAt: e.ended_at,
    durationSeconds: e.duration_seconds || 0,
    source: 'aide',
  }));
  const r = await lifegameFetch(config, '/api/bridge/timelog', {
    method: 'POST', body: JSON.stringify({ entries }),
  });
  await logBridge(env, {
    direction: 'outbound', entity_type: 'timelog',
    status: r.ok ? 'success' : 'error',
    payload: `${entries.length} registros`,
    error: r.ok ? null : `HTTP ${r.status}${r.body ? ` — ${r.body.slice(0, 300)}` : ''}`,
  });
  if (r.ok) {
    await env.DB.prepare("UPDATE bridge_config SET last_sync_at=? WHERE id='singleton'")
      .bind(Math.floor(Date.now() / 1000)).run().catch(() => {});
    return json({ pushed: entries.length, errors: [] });
  }
  return json({
    pushed: 0,
    errors: [`HTTP ${r.status}`],
    detail: r.body.slice(0, 500),
    url: r.url,
    secret_length: r.secret_length,
  }, r.status === 401 ? 401 : 502);
}

// Lifegame → AIDE: Lifegame faz POST aqui empurrando os time entries dele.
async function handleBridgeReceiveTimelog(request, env) {
  const body = (await readJson(request)) || {};
  const entries = Array.isArray(body.entries) ? body.entries : [];
  await logBridge(env, {
    direction: 'inbound', entity_type: 'timelog', status: 'success',
    payload: `${entries.length} registros`,
  });
  // Persistir cada entrada como linha individual no log facilita auditoria
  // sem precisar adicionar uma tabela específica de time_entries vindos do LG.
  for (const e of entries) {
    await logBridge(env, {
      direction: 'inbound', entity_type: 'timelog',
      entity_id: e && e.id ? String(e.id) : null,
      status: 'success',
      payload: JSON.stringify(e).slice(0, 500),
    }).catch(() => {});
  }
  return json({ received: entries.length });
}

// AIDE puxa proativamente as tarefas do Lifegame. Retorna o array em
// `tasks` sem persistir (decisão de armazenamento fica no caller).
async function handleBridgePullTasks(env, config) {
  if (!config.lifegame_url || !config.bridge_secret) {
    return json({ error: 'Bridge não configurada' }, 400);
  }
  const r = await lifegameFetch(config, '/api/bridge/tasks');
  if (!r.ok) {
    await logBridge(env, {
      direction: 'inbound', entity_type: 'tasks', status: 'error',
      error: `HTTP ${r.status}${r.body ? ` — ${r.body.slice(0, 300)}` : ''}`,
    });
    return json({
      error: 'bridge_fetch_failed',
      status: r.status,
      detail: r.body.slice(0, 500),
      url: r.url,
      secret_length: r.secret_length,
    }, r.status === 401 ? 401 : 502);
  }
  let data; try { data = JSON.parse(r.body); } catch { data = {}; }
  // Lifegame retorna { tasks: [...], total } OU diretamente um array.
  const tasks = Array.isArray(data && data.tasks) ? data.tasks
              : (Array.isArray(data) ? data : []);
  await logBridge(env, {
    direction: 'inbound', entity_type: 'tasks', status: 'success',
    payload: `${tasks.length} tarefas (pull)`,
  });
  return json({ received: tasks.length, tasks });
}

// AIDE puxa proativamente as pessoas do Lifegame.
async function handleBridgePullPeople(env, config) {
  if (!config.lifegame_url || !config.bridge_secret) {
    return json({ error: 'Bridge não configurada' }, 400);
  }
  const r = await lifegameFetch(config, '/api/bridge/people');
  if (!r.ok) {
    await logBridge(env, {
      direction: 'inbound', entity_type: 'people', status: 'error',
      error: `HTTP ${r.status}${r.body ? ` — ${r.body.slice(0, 300)}` : ''}`,
    });
    return json({
      error: 'bridge_fetch_failed',
      status: r.status,
      detail: r.body.slice(0, 500),
      url: r.url,
      secret_length: r.secret_length,
    }, r.status === 401 ? 401 : 502);
  }
  let data; try { data = JSON.parse(r.body); } catch { data = {}; }
  const people = Array.isArray(data && data.people) ? data.people
               : (Array.isArray(data) ? data : []);
  await logBridge(env, {
    direction: 'inbound', entity_type: 'people', status: 'success',
    payload: `${people.length} pessoas (pull)`,
  });
  return json({ received: people.length, people });
}

// AIDE puxa proativamente os time entries do Lifegame (origem=lifegame).
async function handleBridgePullTimelog(env, config) {
  if (!config.lifegame_url || !config.bridge_secret) {
    return json({ error: 'Bridge não configurada' }, 400);
  }
  const r = await lifegameFetch(config, '/api/bridge/timelog');
  if (!r.ok) {
    await logBridge(env, {
      direction: 'inbound', entity_type: 'timelog', status: 'error',
      error: `HTTP ${r.status}${r.body ? ` — ${r.body.slice(0, 300)}` : ''}`,
    });
    return json({
      error: 'bridge_fetch_failed',
      status: r.status,
      detail: r.body.slice(0, 500),
      url: r.url,
      secret_length: r.secret_length,
    }, r.status === 401 ? 401 : 502);
  }
  let data; try { data = JSON.parse(r.body); } catch { data = {}; }
  const entries = Array.isArray(data && data.entries) ? data.entries
                : (Array.isArray(data) ? data : []);
  await logBridge(env, {
    direction: 'inbound', entity_type: 'timelog', status: 'success',
    payload: `${entries.length} registros (pull)`,
  });
  return json({ received: entries.length, entries });
}

// ── IMPORTAÇÃO Lifegame → AIDE (pull + upsert em D1) ─────────────────────
// Diferente de pull/* (que só retornam dados em memória), import/* faz
// upsert real nas tabelas tasks/network_people com source='lifegame'.

// Idempotente: probe + ALTER se necessário. Cobre o caso de migration 0018
// não ter sido aplicada manualmente.
async function ensureLifegameColumns(env) {
  try {
    await env.DB.prepare('SELECT source, lifegame_id FROM tasks LIMIT 1').first();
  } catch {
    try { await env.DB.prepare("ALTER TABLE tasks ADD COLUMN source TEXT DEFAULT 'aide'").run(); } catch { /* já existe */ }
    try { await env.DB.prepare('ALTER TABLE tasks ADD COLUMN lifegame_id TEXT').run(); } catch { /* já existe */ }
    try { await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_tasks_lifegame_id ON tasks(lifegame_id)').run(); } catch { /* ignore */ }
  }
  try {
    await env.DB.prepare('SELECT source FROM network_people LIMIT 1').first();
  } catch {
    try { await env.DB.prepare("ALTER TABLE network_people ADD COLUMN source TEXT DEFAULT 'aide'").run(); } catch { /* já existe */ }
  }
}

// v2.4.4 — curadoria: tarefas novas do Lifegame NÃO entram direto em `tasks`.
// Vão para bridge_task_staging e aguardam aprovação do owner em "Revisar Bridge".
// Tarefas já aprovadas (que existem em `tasks` com o mesmo lifegame_id) continuam
// sendo atualizadas normalmente a cada sync.
async function upsertLifegameTask(env, t) {
  if (!t || !t.id) throw new Error('task sem id');
  const now = Math.floor(Date.now() / 1000);
  const tags = JSON.stringify(Array.isArray(t.tags) ? t.tags : []);
  const title = (t.title || '').trim() || 'sem título';
  const description = t.description || '';
  const urgency = Math.max(0, Math.min(10, Number(t.urgency) || 5));
  const importance = Math.max(0, Math.min(10, Number(t.importance) || 5));
  const status = ['backlog', 'todo', 'doing', 'done', 'blocked'].includes(t.status) ? t.status : 'backlog';

  // Já importada (aprovada) → atualiza a task real.
  const existing = await env.DB.prepare('SELECT id FROM tasks WHERE lifegame_id = ?').bind(t.id).first();
  if (existing) {
    await env.DB.prepare(
      'UPDATE tasks SET title=?, urgency=?, importance=?, status=?, tags=?, updated_at=? WHERE lifegame_id=?'
    ).bind(title, urgency, importance, status, tags, now, t.id).run();
    return 'updated';
  }

  // Nova → estaciona para revisão. UNIQUE(lifegame_id) + INSERT OR IGNORE deixa
  // idempotente: reenvios não duplicam nem reabrem uma já rejeitada.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO bridge_task_staging
      (id, lifegame_id, title, description, urgency, importance, status, tags, source, raw_payload, staged_at, staged_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lifegame', ?, ?, 'bridge')`
  ).bind(
    crypto.randomUUID(), t.id, title, description, urgency, importance, status, tags,
    JSON.stringify(t).slice(0, 100000), now
  ).run();
  return 'staged';
}

// v2.4.6 — curadoria: pessoas NOVAS do Lifegame NÃO entram direto em
// network_people. Vão para bridge_person_staging e aguardam aprovação do owner
// em "Revisar Bridge" > Pessoas. Pessoas já aprovadas (existem em network_people
// com o mesmo lifegame_person_id) continuam sendo atualizadas a cada sync.
async function upsertLifegamePerson(env, p) {
  if (!p || !p.id) throw new Error('person sem id');
  const now = Math.floor(Date.now() / 1000);
  const name = (p.name || '').trim() || 'sem nome';
  const role = p.role || '';
  const tags = JSON.stringify(Array.isArray(p.tags) ? p.tags : []);
  const strength = Math.max(0, Math.min(10, Number(p.connectionStrength) || 5));

  // Já importada (aprovada) → atualiza a pessoa real.
  const existing = await env.DB.prepare('SELECT id FROM network_people WHERE lifegame_person_id = ?').bind(p.id).first();
  if (existing) {
    await env.DB.prepare(
      'UPDATE network_people SET name=?, role=?, connection_strength=?, updated_at=? WHERE lifegame_person_id=?'
    ).bind(name, role, strength, now, p.id).run();
    return 'updated';
  }

  // Nova → staging para revisão. UNIQUE(lifegame_person_id) + INSERT OR IGNORE
  // deixa idempotente: reenvios não duplicam nem reabrem uma já rejeitada.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO bridge_person_staging
      (id, lifegame_person_id, name, role, connection_strength, last_contact_at, notes, tags, source, raw_payload, staged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'lifegame', ?, ?)`
  ).bind(
    crypto.randomUUID(), p.id, name, role, strength, p.lastContactAt || '',
    p.notes || '', tags, JSON.stringify(p).slice(0, 100000), now
  ).run();
  return 'staged';
}

async function cacheLifegamePayload(env, entityType, payload) {
  try {
    await env.DB.prepare(
      'INSERT INTO lifegame_cache (id, entity_type, payload, synced_at) VALUES (?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), entityType, JSON.stringify(payload).slice(0, 100000), Math.floor(Date.now() / 1000)).run();
  } catch { /* tabela ainda não criada — best effort */ }
}

async function handleBridgeImport(env, config, entity) {
  if (!config.lifegame_url || !config.bridge_secret) {
    return json({ error: 'bridge_not_configured', hint: 'Configurar URL + secret em Settings → Bridge' }, 400);
  }
  const lgPath = entity === 'tasks' ? '/api/bridge/tasks' : '/api/bridge/people';
  const r = await lifegameFetch(config, lgPath);
  if (!r.ok) {
    await logBridge(env, {
      direction: 'inbound', entity_type: entity, status: 'error',
      error: `import HTTP ${r.status}${r.body ? ` — ${r.body.slice(0, 300)}` : ''}`,
    });
    return json({
      error: 'lifegame_rejected',
      status: r.status,
      detail: r.body.slice(0, 500),
      url: r.url,
    }, r.status === 401 ? 401 : 400);
  }
  let data; try { data = JSON.parse(r.body); } catch { data = {}; }
  const items = entity === 'tasks'
    ? (Array.isArray(data.tasks) ? data.tasks : (Array.isArray(data) ? data : []))
    : (Array.isArray(data.people) ? data.people : (Array.isArray(data) ? data : []));

  await ensureLifegameColumns(env);
  await cacheLifegamePayload(env, entity, items);

  let inserted = 0, updated = 0, staged = 0, skippedEcho = 0;
  const errors = [];
  for (const item of items) {
    // Anti-loop de eco: descarta o que o próprio AIDE originou e o Lifegame está
    // devolvendo — identificado por aideTaskId/aidePersonId (marcado no push) ou
    // source='aide'. Sem isso, os itens do AIDE duplicariam a cada sync.
    const echoId = entity === 'tasks' ? item?.aideTaskId : item?.aidePersonId;
    if ((echoId || item?.source === 'aide')) {
      skippedEcho += 1;
      await logBridge(env, {
        direction: 'skipped_echo',
        entity_type: entity === 'tasks' ? 'task' : 'person',
        entity_id: echoId ? String(echoId) : (item.id ? String(item.id) : null),
        status: 'skipped',
        payload: JSON.stringify({ reason: 'echo_loop_prevention', echoId: echoId || null }),
      }).catch(() => {});
      continue;
    }
    try {
      const result = entity === 'tasks'
        ? await upsertLifegameTask(env, item)
        : await upsertLifegamePerson(env, item);
      if (result === 'inserted') inserted += 1;
      else if (result === 'updated') updated += 1;
      else if (result === 'staged') staged += 1;
    } catch (e) {
      errors.push({ id: item && item.id, error: String((e && e.message) || e).slice(0, 200) });
    }
  }

  await logBridge(env, {
    direction: 'inbound', entity_type: entity, status: errors.length ? 'error' : 'success',
    payload: `import: ${staged} em revisão, ${inserted} novos, ${updated} atualizados, ${skippedEcho} eco ignorados, ${errors.length} erros`,
    error: errors.length ? errors.slice(0, 3).map((e) => `${e.id}: ${e.error}`).join('; ') : null,
  });

  return json({
    fetched: items.length,
    staged,
    updated,
    inserted,
    skipped_echo: skippedEcho,
    errors_count: errors.length,
    errors: errors.slice(0, 10),
  });
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
// Dedup (D1-backed, replaces AIDE_SYNC KV writes which share Lifegame's limit)
// ---------------------------------------------------------------------------

async function dedupCheck(key, env) {
  const now = Math.floor(Date.now() / 1000);
  // Opportunistic cleanup of expired rows (best-effort, never blocks).
  await env.DB.prepare('DELETE FROM dedup_log WHERE expires_at < ?').bind(now).run().catch(() => {});
  const existing = await env.DB.prepare(
    'SELECT id FROM dedup_log WHERE key = ? AND expires_at > ?'
  ).bind(key, now).first();
  return !!existing;
}

async function dedupSet(key, ttlSeconds, env) {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  await env.DB.prepare(
    'INSERT OR REPLACE INTO dedup_log (id, key, expires_at) VALUES (?, ?, ?)'
  ).bind(crypto.randomUUID(), key, expires).run();
}

// ---------------------------------------------------------------------------
// Daily deadline notifications (cron)
// ---------------------------------------------------------------------------

// Reuses createNotification (which inserts the in-app row AND pushes via
// pushToUser using the correct flat subscription shape). Dedupe per
// user+task+day in D1 dedup_log (24h TTL) so re-runs don't double-notify.
async function processScheduledNotifications(env) {
  const now = Math.floor(Date.now() / 1000);
  let pending = [];
  try {
    ({ results: pending } = await env.DB.prepare(
      'SELECT * FROM scheduled_notifications WHERE sent = 0 AND send_at <= ?'
    ).bind(now).all());
  } catch {
    return 0; // table not migrated yet
  }
  let sent = 0;
  for (const sn of pending || []) {
    await createNotification(env, null, {
      from_user_id: sn.from_user_id,
      to_user_id: sn.to_user_id,
      type: 'scheduled_alert',
      title: sn.title,
      body: sn.body,
      task_id: sn.task_id
    });
    await env.DB.prepare('UPDATE scheduled_notifications SET sent = 1, sent_at = ? WHERE id = ?').bind(now, sn.id).run();
    sent += 1;
  }
  return sent;
}

function shapeScheduled(row) {
  return {
    id: row.id,
    from_user_id: row.from_user_id,
    to_user_id: row.to_user_id,
    fromName: row.from_name || null,
    toName: row.to_name || null,
    title: row.title,
    body: row.body || '',
    task_id: row.task_id || null,
    project_id: row.project_id || null,
    send_at: row.send_at,
    sent: !!row.sent,
    sent_at: row.sent_at || null,
    created_at: row.created_at
  };
}

async function handleScheduledNotifications(request, env, user) {
  if (request.method === 'GET') {
    const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
    try {
      const { results } = await env.DB.prepare(
        `SELECT sn.*, fu.name AS from_name, tu.name AS to_name
         FROM scheduled_notifications sn
         LEFT JOIN users fu ON sn.from_user_id = fu.id
         LEFT JOIN users tu ON sn.to_user_id = tu.id
         WHERE (sn.from_user_id = ? OR sn.to_user_id = ?) AND (sn.sent = 0 OR sn.sent_at >= ?)
         ORDER BY sn.send_at`
      ).bind(user.id, user.id, weekAgo).all();
      return json((results || []).map(shapeScheduled));
    } catch {
      return json([]);
    }
  }
  if (request.method === 'POST') {
    try {
      const body = (await readJson(request)) || {};
      if (!body.to_user_id || !body.title || !body.send_at) {
        return json({ error: 'Campos obrigatórios ausentes: to_user_id, title, send_at' }, 400);
      }
      const sendAt = Math.floor(new Date(body.send_at).getTime() / 1000);
      if (Number.isNaN(sendAt) || sendAt <= 0) {
        return json({ error: 'send_at inválido (use ISO 8601)' }, 400);
      }
      // Confirm the recipient exists — otherwise the FK silently inserts NULL
      // and the cron job later picks up a notification with no addressee.
      const recipient = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(body.to_user_id).first();
      if (!recipient) return json({ error: 'to_user_id não encontrado' }, 400);

      const id = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      try {
        await env.DB.prepare(
          `INSERT INTO scheduled_notifications (id, from_user_id, to_user_id, title, body, task_id, project_id, send_at, sent, created_at)
           VALUES (?,?,?,?,?,?,?,?,0,?)`
        ).bind(
          id, user.id, body.to_user_id, body.title, body.body || '',
          body.task_id || null, body.project_id || null, sendAt, now
        ).run();
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (/no such table/i.test(msg)) {
          return json({
            error: 'Tabela scheduled_notifications não existe — aplique a migração 0013 (wrangler d1 execute aide-db --remote --file=migrations/0013_alerts_v2.sql)'
          }, 503);
        }
        return json({ error: 'Falha ao inserir aviso agendado', detail: msg }, 500);
      }
      const row = await env.DB.prepare('SELECT * FROM scheduled_notifications WHERE id = ?').bind(id).first();
      return json(shapeScheduled(row), 201);
    } catch (e) {
      return json({ error: 'Erro inesperado ao agendar aviso', detail: String((e && e.message) || e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleScheduledNotificationItem(request, env, user, id) {
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  await env.DB.prepare('DELETE FROM scheduled_notifications WHERE id = ? AND from_user_id = ? AND sent = 0').bind(id, user.id).run();
  return json({ ok: true });
}

async function runDailyNotifications(env) {
  await processScheduledNotifications(env);

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
    if (await dedupCheck(key, env)) continue;
    await createNotification(env, null, {
      to_user_id: task.uid,
      type: 'task_due_soon',
      title: 'Prazo amanhã',
      body: `"${task.title}" vence amanhã (${task.due_date})`,
      task_id: task.id
    });
    await dedupSet(key, 86400, env);
    sent += 1;
  }

  for (const task of overdue.results || []) {
    const key = `notif:${task.uid}:${task.id}:overdue:${today}`;
    if (await dedupCheck(key, env)) continue;
    await createNotification(env, null, {
      to_user_id: task.uid,
      type: 'task_overdue',
      title: 'Tarefa em atraso',
      body: `"${task.title}" estava prevista para ${task.due_date}`,
      task_id: task.id
    });
    await dedupSet(key, 86400, env);
    sent += 1;
  }

  // --- Notificações de Carreira (Etapa 6) ---------------------------------
  // Envolvido em try/catch: se as tabelas (migration 0025) não existirem, o
  // cron principal continua funcionando normalmente.
  let career = { deadlines: 0, contacts: 0, inactive: 0 };
  try {
    career = await runCareerNotifications(env, today);
    sent += career.deadlines + career.contacts + career.inactive;
  } catch { /* migration 0025/0026 não aplicada — ignora */ }

  // --- Itens do Lifegame aguardando revisão (v2.4.4/2.4.6) ----------------
  // Uma vez por dia, avisa o owner se houver tarefas OU pessoas em staging.
  let bridgePending = 0;
  try {
    const owner = await env.DB.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").first();
    if (owner) {
      let tasksN = 0;
      let peopleN = 0;
      try {
        const t = await env.DB.prepare('SELECT COUNT(*) AS n FROM bridge_task_staging WHERE reviewed = 0').first();
        tasksN = (t && t.n) || 0;
      } catch { /* tabela ausente */ }
      try {
        const p = await env.DB.prepare('SELECT COUNT(*) AS n FROM bridge_person_staging WHERE reviewed = 0').first();
        peopleN = (p && p.n) || 0;
      } catch { /* tabela ausente */ }
      bridgePending = tasksN + peopleN;
      if (bridgePending > 0) {
        const key = `notif:${owner.id}:bridge_pending:${today}`;
        if (!(await dedupCheck(key, env))) {
          await createNotification(env, null, {
            to_user_id: owner.id,
            type: 'bridge_pending',
            title: 'Itens do Lifegame aguardando revisão',
            body: `${tasksN} tarefa(s) e ${peopleN} pessoa(s) aguardando sua aprovação em Revisar Bridge`,
          });
          await dedupSet(key, 86400, env);
          sent += 1;
        }
      }
    }
  } catch { /* migração de staging não aplicada — ignora */ }

  // --- E-mails não lidos da conta LCEStech (v2.4.10) ----------------------
  // Uma vez por dia, avisa cada usuário ativo se houver e-mails não lidos na
  // conta Gmail externa. Envolvido em try/catch: se a migration 0035 não
  // existir, o cron principal segue normalmente.
  let gmailUnread = 0;
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM gmail_emails WHERE is_read = 0').first();
    gmailUnread = (row && row.n) || 0;
    if (gmailUnread > 0) {
      const users = await env.DB.prepare("SELECT id FROM users WHERE status = 'active'").all();
      for (const u of users.results || []) {
        const key = `notif:${u.id}:gmail_unread:${today}`;
        if (await dedupCheck(key, env)) continue;
        await createNotification(env, null, {
          to_user_id: u.id,
          type: 'gmail_unread',
          title: 'Emails não lidos — LCEStech',
          body: `${gmailUnread} email(s) não lido(s) em lcestech.consulting@gmail.com`,
        });
        await dedupSet(key, 86400, env);
        sent += 1;
      }
    }
  } catch { /* migration 0035 não aplicada — ignora */ }

  // --- Prazos de eventos se aproximando (v2.5.0) --------------------------
  // Abstract deadline nos próximos 30 dias OU data do evento nos próximos 14
  // dias. Notifica o owner. Envolvido em try/catch: se a migration 0037 não
  // existir, o cron principal segue normalmente.
  let eventDeadlines = 0;
  try {
    eventDeadlines = await runEventDeadlineNotifications(env, today);
    sent += eventDeadlines;
  } catch { /* migration 0037 não aplicada — ignora */ }

  await evaluateAlertRules(env);

  return {
    dueSoon: (dueSoon.results || []).length,
    overdue: (overdue.results || []).length,
    sent,
    career,
    bridgePending,
    gmailUnread,
    eventDeadlines,
  };
}

// Prazos de eventos (v2.5.0): abstract deadline em até 30 dias, OU data do
// evento em até 14 dias. Ignora eventos já encerrados/descartados/rejeitados.
// Destinatário: o owner. Dedup por evento + dia.
async function runEventDeadlineNotifications(env, today) {
  const owner = await env.DB.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").first();
  const ownerId = owner ? owner.id : null;
  if (!ownerId) return 0;
  let n = 0;

  const upcomingDeadlines = await env.DB.prepare(`
    SELECT id, name, acronym, deadline_abstract, deadline_paper,
      date_start, status
    FROM career_events
    WHERE status NOT IN ('attended','discarded','rejected')
    AND (
      (deadline_abstract != '' AND
       deadline_abstract BETWEEN date('now')
       AND date('now', '+30 days'))
      OR
      (date_start != '' AND
       date_start BETWEEN date('now')
       AND date('now', '+14 days'))
    )
  `).all();

  for (const ev of upcomingDeadlines.results || []) {
    // Decide qual prazo é o mais relevante (abstract vs data do evento).
    const abstractSoon = ev.deadline_abstract && ev.deadline_abstract >= today;
    const kind = abstractSoon ? 'abstract' : 'data do evento';
    const when = abstractSoon ? ev.deadline_abstract : ev.date_start;
    const label = ev.acronym || ev.name;
    const key = `event:deadline:${ev.id}:${today}`;
    if (await dedupCheck(key, env)) continue;
    await createNotification(env, null, {
      to_user_id: ownerId,
      type: 'event_deadline',
      title: 'Prazo de evento se aproximando',
      body: `${label} — ${kind} em ${when}`,
    });
    await dedupSet(key, 86400, env);
    n += 1;
  }
  return n;
}

// Notificações da área Carreira/Mercado (Etapa 6):
//  - oportunidades com deadline nos próximos 7 dias;
//  - contatos com próxima ação marcada para hoje;
//  - oportunidades sem atividade há 14+ dias.
// Destinatário: o responsável (assigned_to) quando houver, senão o owner.
async function runCareerNotifications(env, today) {
  const owner = await env.DB.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").first();
  const ownerId = owner ? owner.id : null;
  const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
  const cutoff14 = Math.floor(Date.now() / 1000) - 14 * 86400;
  let deadlines = 0;
  let contacts = 0;
  let inactive = 0;

  // 1) Deadlines nos próximos 7 dias (inclui hoje), ignorando encerradas.
  const dueOpps = await env.DB.prepare(
    `SELECT id, title, deadline, assigned_to AS uid FROM career_opportunities
      WHERE deadline IS NOT NULL AND deadline >= ? AND deadline <= ?
        AND status NOT IN ('rejected', 'closed')`
  ).bind(today, in7).all();
  for (const o of dueOpps.results || []) {
    const uid = o.uid || ownerId;
    if (!uid) continue;
    const key = `notif:${uid}:opp:${o.id}:deadline:${today}`;
    if (await dedupCheck(key, env)) continue;
    await createNotification(env, null, {
      to_user_id: uid,
      type: 'career_deadline',
      title: 'Deadline de oportunidade',
      body: `"${o.title}" tem prazo em ${o.deadline}`,
    });
    await dedupSet(key, 86400, env);
    deadlines += 1;
  }

  // 2) Contatos com próxima ação marcada para hoje.
  const dueContacts = await env.DB.prepare(
    `SELECT cp.person_id AS pid, p.name AS name, cp.next_action AS action
       FROM contact_professional cp
       LEFT JOIN network_people p ON p.id = cp.person_id
      WHERE cp.next_action_date = ?`
  ).bind(today).all();
  for (const c of dueContacts.results || []) {
    if (!ownerId) break;
    const key = `notif:${ownerId}:contact:${c.pid}:nextaction:${today}`;
    if (await dedupCheck(key, env)) continue;
    await createNotification(env, null, {
      to_user_id: ownerId,
      type: 'career_contact_due',
      title: 'Contato a fazer hoje',
      body: `${c.name || 'Contato'}${c.action ? ` — ${c.action}` : ''}`,
    });
    await dedupSet(key, 86400, env);
    contacts += 1;
  }

  // 3) Oportunidades ativas sem atividade há 14+ dias.
  const stale = await env.DB.prepare(
    `SELECT id, title, assigned_to AS uid FROM career_opportunities
      WHERE status NOT IN ('rejected', 'closed') AND updated_at < ?`
  ).bind(cutoff14).all();
  for (const o of stale.results || []) {
    const uid = o.uid || ownerId;
    if (!uid) continue;
    const key = `notif:${uid}:opp:${o.id}:stale:${today}`;
    if (await dedupCheck(key, env)) continue;
    await createNotification(env, null, {
      to_user_id: uid,
      type: 'career_inactive',
      title: 'Oportunidade parada',
      body: `"${o.title}" está sem atividade há mais de 14 dias`,
    });
    await dedupSet(key, 86400, env);
    inactive += 1;
  }

  return { deadlines, contacts, inactive };
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
    task_id: row.task_id || null,
    project_id: row.project_id || null,
    run_hour: row.run_hour ?? 8,
    last_run_at: row.last_run_at || null,
    last_result: row.last_result || '',
    taskTitle: row.task_title || null,
    projectName: row.project_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handleAlertRules(request, env, user) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT ar.*, t.title AS task_title, p.name AS project_name
         FROM alert_rules ar
         LEFT JOIN tasks t ON ar.task_id = t.id
         LEFT JOIN projects p ON ar.project_id = p.id
         ORDER BY ar.created_at DESC`
      ).all();
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
      `INSERT INTO alert_rules (id, created_by, name, description, trigger_type, trigger_config, target_user, channel, active, task_id, project_id, run_hour, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, user.id, body.name, body.description || '', body.trigger_type,
      JSON.stringify(body.trigger_config || {}), body.target_user || 'both',
      body.channel || 'both', body.active === false ? 0 : 1,
      body.task_id || null, body.project_id || null, body.run_hour != null ? Number(body.run_hour) : 8,
      now, now
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
      `UPDATE alert_rules SET name=?, description=?, trigger_type=?, trigger_config=?, target_user=?, channel=?, active=?, task_id=?, project_id=?, run_hour=?, updated_at=? WHERE id=?`
    ).bind(
      body.name !== undefined ? body.name : existing.name,
      body.description !== undefined ? body.description : existing.description,
      body.trigger_type !== undefined ? body.trigger_type : existing.trigger_type,
      body.trigger_config !== undefined ? JSON.stringify(body.trigger_config || {}) : existing.trigger_config,
      body.target_user !== undefined ? body.target_user : existing.target_user,
      body.channel !== undefined ? body.channel : existing.channel,
      body.active !== undefined ? (body.active ? 1 : 0) : existing.active,
      body.task_id !== undefined ? (body.task_id || null) : existing.task_id,
      body.project_id !== undefined ? (body.project_id || null) : existing.project_id,
      body.run_hour !== undefined ? Number(body.run_hour) : existing.run_hour,
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
  const result = await evaluateRule(row, config, env, true);
  return json({
    ok: true,
    triggered: result.triggered,
    notificationsSent: result.sent,
    message: result.triggered
      ? `Regra disparada — ${result.sent} notificação(ões) enviada(s)`
      : 'Condição não atendida no momento'
  });
}

async function getRoleUsers(env) {
  const { results } = await env.DB.prepare('SELECT id, role FROM users').all();
  const owner = (results || []).find((u) => u.role === 'owner');
  // Migration 0022 renamed the legacy 'assistant' role to 'assistant_fixed'.
  // Accept either name — preferring the new one — so alert targeting and the
  // payment summary keep working across the rename.
  const assistant = (results || []).find((u) => u.role === 'assistant_fixed')
    || (results || []).find((u) => u.role === 'assistant');
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
  if (!force && (await dedupCheck(dedupKey, env))) return { triggered: false, sent: 0 };

  const threshold = Number(config.threshold) || 0;
  let triggered = false;
  let body = rule.description || '';

  // Optional scope: a specific task or a project, for task-based triggers.
  let scope = '';
  const scopeBind = [];
  if (rule.task_id) {
    scope = ' AND id = ?';
    scopeBind.push(rule.task_id);
  } else if (rule.project_id) {
    scope = ' AND project_id = ?';
    scopeBind.push(rule.project_id);
  }

  if (rule.trigger_type === 'task_overdue') {
    const cutoff = new Date(Date.now() - threshold * 86400000).toISOString().split('T')[0];
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND due_date IS NOT NULL AND due_date < ?${scope}`).bind(cutoff, ...scopeBind).first();
    if ((r ? r.n : 0) > 0) { triggered = true; body = `${r.n} tarefa(s) em atraso há mais de ${threshold} dia(s).`; }
  } else if (rule.trigger_type === 'task_no_date') {
    const cutoff = Math.floor((Date.now() - threshold * 86400000) / 1000);
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND (due_date IS NULL OR due_date = '') AND created_at < ?${scope}`).bind(cutoff, ...scopeBind).first();
    if ((r ? r.n : 0) > 0) { triggered = true; body = `${r.n} tarefa(s) sem data há mais de ${threshold} dia(s).`; }
  } else if (rule.trigger_type === 'task_no_update') {
    const cutoff = Math.floor((Date.now() - threshold * 86400000) / 1000);
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tasks WHERE status != 'done' AND updated_at < ?${scope}`).bind(cutoff, ...scopeBind).first();
    if ((r ? r.n : 0) > 0) { triggered = true; body = `${r.n} tarefa(s) sem atualização há mais de ${threshold} dia(s).`; }
  } else if (rule.trigger_type === 'timer_running_long') {
    const cutoff = Math.floor(Date.now() / 1000) - threshold * 3600;
    const taskScope = rule.task_id ? ' AND task_id = ?' : '';
    const tb = rule.task_id ? [rule.task_id] : [];
    const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE ended_at IS NULL AND started_at < ?${taskScope}`).bind(cutoff, ...tb).first();
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

  let sent = 0;
  if (triggered) {
    const roleUsers = await getRoleUsers(env);
    for (const uid of targetUserIds(rule.target_user, roleUsers)) {
      await deliverAlert(env, uid, 'alert', rule.name, body, rule.channel || 'both');
      sent += 1;
    }
    if (!force) await dedupSet(dedupKey, 86400, env);
  }

  await env.DB.prepare('UPDATE alert_rules SET last_run_at = ?, last_result = ? WHERE id = ?')
    .bind(Math.floor(Date.now() / 1000), triggered ? `Disparou — ${sent} envio(s)` : 'Condição não atendida', rule.id)
    .run()
    .catch(() => {});

  return { triggered, sent };
}

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

function resolveRateFromRow(e, defaultRate) {
  if (e.t_rate_type && e.t_rate_type !== 'inherit') return { type: e.t_rate_type, value: e.t_rate_value || 0 };
  if (e.p_rate_type && e.p_rate_type !== 'inherit') return { type: e.p_rate_type, value: e.p_rate_value || 0 };
  if ((e.hourly_rate || 0) > 0) return { type: 'hourly', value: e.hourly_rate };
  return { type: 'hourly', value: defaultRate || 0 };
}

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
  const end = Math.floor(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) / 1000);
  return { start, end };
}

async function computePaymentSummary(env, month, overrideUserId = null) {
  const { start, end } = monthRange(month);
  const { assistantId: legacyAssistantId } = await getRoleUsers(env);
  const assistantId = overrideUserId || legacyAssistantId;
  const { results } = await env.DB.prepare(
    `SELECT e.*, t.title AS task_title, t.project_id, t.rate_type AS t_rate_type, t.rate_value AS t_rate_value,
            p.name AS project_name, p.rate_type AS p_rate_type, p.rate_value AS p_rate_value
     FROM time_entries e
     LEFT JOIN tasks t ON e.task_id = t.id
     LEFT JOIN projects p ON t.project_id = p.id
     WHERE e.user_id = ? AND e.started_at >= ? AND e.started_at < ?
     ORDER BY e.started_at`
  ).bind(assistantId, start, end).all();

  // Taxa padrão = Alice.availability.hourly_rate_brl (BRL).
  // NÃO faz fallback pra `hourly_rate` legacy (€/h), porque misturar moedas
  // produzia valores fantasmas tipo "R$ 2.50" quando hourly_rate_brl estava 0
  // mas hourly_rate tinha um euro antigo. Se hourly_rate_brl não foi setado,
  // defaultRate = 0 e o usuário precisa configurar em Pagamentos.
  let availRow = null;
  try {
    availRow = await env.DB.prepare(
      'SELECT hourly_rate_brl FROM availability WHERE user_id = ?'
    ).bind(assistantId).first();
  } catch {
    // Coluna ausente (migration 0014 não aplicada) — usa legacy como BRL.
    availRow = await env.DB.prepare(
      'SELECT hourly_rate AS hourly_rate_brl FROM availability WHERE user_id = ?'
    ).bind(assistantId).first();
  }
  const defaultRate = (availRow && availRow.hourly_rate_brl) || 0;

  const brl = await getBrlEurRate(env);
  const brlRate = brl.rate;

  const fixedSeen = new Set();
  const entries = [];
  let totalHours = 0;
  let totalDue = 0;
  let totalPaid = 0;

  for (const e of results || []) {
    const rate = resolveRateFromRow(e, defaultRate);
    // rateSource: 'task'|'project'|'default'|'entry' — drives the "(padrão)" tag.
    let rateSource = 'default';
    if (e.t_rate_type && e.t_rate_type !== 'inherit') rateSource = 'task';
    else if (e.p_rate_type && e.p_rate_type !== 'inherit') rateSource = 'project';
    else if ((e.hourly_rate || 0) > 0) rateSource = 'entry';
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
    const amountBrl = amount;
    const amountEur = amount * brlRate;
    entries.push({
      id: e.id,
      taskId: e.task_id,
      taskTitle: e.task_title || '—',
      projectName: e.project_name || null,
      rateType: rate.type,
      rateValue: rate.value || 0,
      rateSource,
      entryRate: e.hourly_rate || 0,
      hours: Math.round(hours * 100) / 100,
      amount: Math.round(amount * 100) / 100,
      amountBrl: Math.round(amountBrl * 100) / 100,
      amountEur: Math.round(amountEur * 100) / 100,
      paid: !!e.paid,
      started_at: e.started_at,
      ended_at: e.ended_at,
      duration_seconds: e.duration_seconds || 0,
      notes: e.notes || ''
    });
  }

  const pd = await env.DB.prepare('SELECT pix_key, pix_key_type, bank_name FROM user_profile_data WHERE user_id = ?').bind(assistantId).first();

  return {
    month,
    totalHours: Math.round(totalHours * 100) / 100,
    totalDue: Math.round(totalDue * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    balance: Math.round((totalDue - totalPaid) * 100) / 100,
    totalDueBrl: Math.round(totalDue * 100) / 100,
    totalPaidBrl: Math.round(totalPaid * 100) / 100,
    balanceBrl: Math.round((totalDue - totalPaid) * 100) / 100,
    totalDueEur: Math.round(totalDue * brlRate * 100) / 100,
    totalPaidEur: Math.round(totalPaid * brlRate * 100) / 100,
    balanceEur: Math.round((totalDue - totalPaid) * brlRate * 100) / 100,
    brlRate,
    brlRateUpdatedAt: brl.updated_at,
    defaultRate,
    aliceRate: defaultRate,
    entries,
    alicePixKey: pd ? pd.pix_key || '' : '',
    alicePixKeyType: pd ? pd.pix_key_type || '' : '',
    aliceBankName: pd ? pd.bank_name || '' : ''
  };
}

async function handlePaymentSummary(request, env, user) {
  // v2.1.1 — GET fails open: return an empty summary shape so the page
  // renders without crashing instead of seeing a 403.
  const emptySummary = {
    month: new URL(request.url).searchParams.get('month') || new Date().toISOString().slice(0, 7),
    totalHours: 0, totalDue: 0, totalPaid: 0, balance: 0,
    totalDueBrl: 0, totalPaidBrl: 0, balanceBrl: 0,
    totalDueEur: 0, totalPaidEur: 0, balanceEur: 0,
    brlRate: 0, brlRateUpdatedAt: null,
    defaultRate: 0, aliceRate: 0,
    entries: [], alicePixKey: '', alicePixKeyType: '', aliceBankName: '',
  };
  if (!requirePermission(user, 'payment', 'view')) return json(emptySummary);
  if (!canDo(user.granular, 'payment', 'view_own') &&
      !canDo(user.granular, 'payment', 'view_all')) {
    return json(emptySummary);
  }
  const url = new URL(request.url);
  const month = url.searchParams.get('month') || new Date().toISOString().slice(0, 7);
  const requestedUserId = url.searchParams.get('user_id');
  // Override priority:
  //   payment='own' (non-owner) → always self.
  //   owner + explicit ?user_id=X → that user (lets the owner tab through
  //     each team member's payments without logging in as them).
  //   anything else → null (legacy "always Alice" computePaymentSummary path).
  const paymentLevel = (user.permissions && user.permissions.payment) || 'full';
  let overrideUserId = null;
  if (paymentLevel === 'own' && user.role !== 'owner') {
    overrideUserId = user.id;
  } else if (user.role === 'owner' && requestedUserId) {
    overrideUserId = requestedUserId;
  }
  return json(await computePaymentSummary(env, month, overrideUserId));
}

// GET retorna a taxa padrão (BRL) atualmente configurada para Alice.
// PUT define/atualiza a taxa padrão. Salva em ALICE.availability.hourly_rate_brl
// independente de quem está logado (owner ou assistant). Owner edita a taxa
// de Alice da PaymentPage sem precisar logar como Alice.
async function handlePaymentDefaultRate(request, env, user) {
  if (request.method !== 'GET' && request.method !== 'PUT') {
    return json({ error: 'Método não permitido' }, 405);
  }
  if (user.role !== 'owner' && user.role !== 'assistant') {
    return json({ error: 'Não autorizado' }, 403);
  }
  const { assistantId } = await getRoleUsers(env);
  if (!assistantId) return json({ error: 'Assistente não cadastrada' }, 404);

  if (request.method === 'GET') {
    let row = null;
    try {
      row = await env.DB.prepare(
        'SELECT hourly_rate_brl FROM availability WHERE user_id = ?'
      ).bind(assistantId).first();
    } catch {
      row = await env.DB.prepare(
        'SELECT hourly_rate AS hourly_rate_brl FROM availability WHERE user_id = ?'
      ).bind(assistantId).first();
    }
    return json({ rate: (row && row.hourly_rate_brl) || 0 });
  }

  // PUT
  const body = (await readJson(request)) || {};
  const rate = Number(body.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    return json({ error: 'Taxa inválida' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  // Tenta UPDATE (migration 0014 com hourly_rate_brl); se a coluna não existir,
  // cai pro legacy hourly_rate.
  let updated = false;
  try {
    const res = await env.DB.prepare(
      'UPDATE availability SET hourly_rate_brl = ?, currency = ?, updated_at = ? WHERE user_id = ?'
    ).bind(rate, 'BRL', now, assistantId).run();
    updated = (res.meta?.changes ?? 0) > 0;
  } catch {
    /* coluna ausente */
  }
  if (!updated) {
    // Linha ainda não existe — INSERT mínimo (defaults do schema cobrem o resto).
    try {
      await env.DB.prepare(
        `INSERT INTO availability (id, user_id, hourly_rate_brl, currency, updated_at)
         VALUES (?, ?, ?, 'BRL', ?)`
      ).bind(crypto.randomUUID(), assistantId, rate, now).run();
      updated = true;
    } catch {
      // Migration 0014 sem hourly_rate_brl — fallback no campo legacy.
      try {
        await env.DB.prepare(
          'UPDATE availability SET hourly_rate = ?, updated_at = ? WHERE user_id = ?'
        ).bind(rate, now, assistantId).run();
        updated = true;
      } catch (e) {
        return json({ error: 'Falha ao salvar taxa', detail: String(e && e.message || e) }, 500);
      }
    }
  }
  return json({ rate, savedAt: now });
}

async function handlePaymentEntryPaid(request, env, user, id) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (!canDo(user.granular, 'payment', 'mark_paid')) {
    return json({ error: 'Sem permissão para marcar pagamentos' }, 403);
  }
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
// Exchange rate (BRL → EUR), cached in D1 with a 1h TTL
// ---------------------------------------------------------------------------

const EXCHANGE_TTL_SECONDS = 3600;
const EXCHANGE_FALLBACK = 0.16; // last-resort if no cache and the API is down

async function getBrlEurRate(env) {
  const now = Math.floor(Date.now() / 1000);
  let cached = null;
  try {
    cached = await env.DB.prepare(
      "SELECT rate, updated_at FROM exchange_rates WHERE id = 'brl_eur'"
    ).first();
  } catch {
    // Table not migrated yet — fall through to the live fetch and keep going
    // with the fallback if that also fails.
  }
  if (cached && cached.rate && (now - cached.updated_at) < EXCHANGE_TTL_SECONDS) {
    return { rate: cached.rate, updated_at: cached.updated_at };
  }
  // Refresh from open.er-api.com (free, no key). On failure, keep using the
  // stale cache rather than returning zero.
  try {
    const resp = await fetch('https://open.er-api.com/v6/latest/BRL');
    if (resp.ok) {
      const data = await resp.json();
      const rate = data && data.rates && Number(data.rates.EUR);
      if (rate && rate > 0) {
        try {
          await env.DB.prepare(
            `INSERT INTO exchange_rates (id, rate, updated_at) VALUES ('brl_eur', ?, ?)
             ON CONFLICT(id) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at`
          ).bind(rate, now).run();
        } catch { /* migration not applied — skip caching */ }
        return { rate, updated_at: now };
      }
    }
  } catch { /* network/parse failure → fall back */ }
  if (cached && cached.rate) return { rate: cached.rate, updated_at: cached.updated_at };
  return { rate: EXCHANGE_FALLBACK, updated_at: now };
}

async function handleExchangeRate(request, env) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  const r = await getBrlEurRate(env);
  return json(r);
}

// ---------------------------------------------------------------------------
// Meeting (wraps the global timer with a fixed "Reunião AIDE" task)
// ---------------------------------------------------------------------------

const MEETING_TASK_TITLE = 'Reunião AIDE';
const MEETING_PROJECT_NAME = 'Reunião';

async function findOrCreateMeetingTask(env, user) {
  // Project — match by exact name (case-insensitive) or create it.
  let project = await env.DB.prepare(
    'SELECT id FROM projects WHERE LOWER(name) = LOWER(?) LIMIT 1'
  ).bind(MEETING_PROJECT_NAME).first();
  const now = Math.floor(Date.now() / 1000);
  if (!project) {
    const pid = crypto.randomUUID();
    await env.DB.prepare(
      'INSERT INTO projects (id, name, color, created_by, created_at) VALUES (?,?,?,?,?)'
    ).bind(pid, MEETING_PROJECT_NAME, '#6366f1', user.id, now).run();
    project = { id: pid };
  }

  const { assistantId } = await getRoleUsers(env);

  // Task — reuse an existing non-done one, otherwise create a fresh task.
  let task = await env.DB.prepare(
    `SELECT id FROM tasks WHERE title = ? AND status != 'done' ORDER BY created_at DESC LIMIT 1`
  ).bind(MEETING_TASK_TITLE).first();
  if (!task) {
    const tid = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO tasks
        (id, title, description, project_id, assigned_to, created_by,
         urgency, importance, energy, status, due_date, delivery_date,
         tags, comments, subtasks, time_entries, favorited, drive_attachments,
         created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      tid, MEETING_TASK_TITLE, 'Reunião recorrente entre Lauro e Alice.',
      project.id, assistantId || null, user.id,
      5, 5, 5, 'doing', null, null,
      '[]', '[]', '[]', '[]', 0, '[]', now, now
    ).run();
    task = { id: tid };
  }
  return task.id;
}

async function handleMeetingStart(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!canDo(user.granular, 'meeting', 'start_stop')) {
    return json({ error: 'Sem permissão para iniciar reuniões' }, 403);
  }
  const taskId = await findOrCreateMeetingTask(env, user);
  const now = Math.floor(Date.now() / 1000);

  await stopActiveEntry(env, user.id, now);
  const avail = await env.DB.prepare(
    'SELECT hourly_rate, hourly_rate_brl FROM availability WHERE user_id = ?'
  ).bind(user.id).first();
  const rate = (avail && (avail.hourly_rate_brl || avail.hourly_rate)) || 0;

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO time_entries
       (id, task_id, user_id, started_at, ended_at, duration_seconds, hourly_rate, paid, notes, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).bind(id, taskId, user.id, now, null, null, rate, 0, '', now).run();
  const row = await env.DB.prepare(`${ENTRY_SELECT} WHERE e.id = ?`).bind(id).first();
  return json({ taskId, entryId: id, entry: shapeEntry(row) }, 201);
}

async function handleMeetingStop(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!canDo(user.granular, 'meeting', 'start_stop')) {
    return json({ error: 'Sem permissão para encerrar reuniões' }, 403);
  }
  const now = Math.floor(Date.now() / 1000);
  const active = await env.DB.prepare(
    `${ENTRY_SELECT} WHERE e.user_id = ? AND e.ended_at IS NULL`
  ).bind(user.id).first();
  if (!active) return json({ error: 'Nenhuma reunião em andamento' }, 404);
  if (active.task_title !== MEETING_TASK_TITLE) {
    return json({ error: 'O timer ativo não é uma reunião' }, 400);
  }
  await env.DB.prepare(
    'UPDATE time_entries SET ended_at = ?, duration_seconds = ? WHERE id = ?'
  ).bind(now, now - active.started_at, active.id).run();
  return json({ taskId: active.task_id, duration: now - active.started_at });
}

async function handleMeetingStatus(request, env, user) {
  const row = await env.DB.prepare(
    `${ENTRY_SELECT} WHERE e.user_id = ? AND e.ended_at IS NULL`
  ).bind(user.id).first();
  if (!row || row.task_title !== MEETING_TASK_TITLE) {
    return json({ inMeeting: false });
  }
  const now = Math.floor(Date.now() / 1000);
  return json({
    inMeeting: true,
    taskId: row.task_id,
    entryId: row.id,
    startedAt: row.started_at,
    elapsedSeconds: Math.max(0, now - row.started_at)
  });
}

// Notas de reunião persistidas em D1 (meeting_notes, uma linha por data).
// Qualquer usuário autenticado pode ler/gravar (a rota já passou pelo gate de
// sessão). GET ?date=YYYY-MM-DD → registro ou vazio; PUT { date, agenda?, notes? }
// faz upsert por meeting_date.
async function handleMeetingNotes(request, env, user) {
  if (request.method === 'GET') {
    const date = new URL(request.url).searchParams.get('date');
    if (!date) return json({ error: 'Parâmetro date é obrigatório' }, 400);
    const row = await env.DB.prepare(
      'SELECT * FROM meeting_notes WHERE meeting_date = ?'
    ).bind(date).first();
    if (!row) return json({ id: null, meeting_date: date, agenda: '', notes: '' });
    return json(row);
  }

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const date = body.date ? String(body.date).trim() : '';
    if (!date) return json({ error: 'Campo date é obrigatório' }, 400);
    const now = Math.floor(Date.now() / 1000);
    const existing = await env.DB.prepare(
      'SELECT id, agenda, notes, created_by, created_at FROM meeting_notes WHERE meeting_date = ?'
    ).bind(date).first();
    // Mantém valores atuais quando o campo não vem no corpo (patch parcial).
    const agenda = body.agenda !== undefined ? String(body.agenda) : (existing ? existing.agenda : '');
    const notes = body.notes !== undefined ? String(body.notes) : (existing ? existing.notes : '');
    const id = existing ? existing.id : crypto.randomUUID();
    const createdBy = existing ? (existing.created_by || user.id) : user.id;
    const createdAt = existing ? (existing.created_at || now) : now;
    await env.DB.prepare(
      `INSERT OR REPLACE INTO meeting_notes
         (id, meeting_date, agenda, notes, created_by, updated_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, date, agenda, notes, createdBy, user.id, createdAt, now).run();
    const row = await env.DB.prepare('SELECT * FROM meeting_notes WHERE id = ?').bind(id).first();
    return json(row);
  }

  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Hierarchy — Áreas > Projetos > Frentes
// ---------------------------------------------------------------------------

async function handleAreas(request, env, user) {
  // v2.1.1 — GET is fail-open (empty list when not authorized); writes still 403.
  if (request.method !== 'GET' && !requirePermission(user, 'areas', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (request.method === 'GET' && !requirePermission(user, 'areas', 'view')) {
    return json([]);
  }
  if (request.method === 'POST' && !canDo(user.granular, 'areas', 'manage_areas')) {
    return json({ error: 'Sem permissão para gerenciar áreas' }, 403);
  }
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM projects p WHERE p.area_id = a.id) AS project_count
         FROM areas a ORDER BY a.name`
      ).all();
      return json(results || []);
    } catch {
      return json([]); // table not migrated yet
    }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name || !String(body.name).trim()) return json({ error: 'Nome é obrigatório' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        'INSERT INTO areas (id, name, color, description, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
      ).bind(id, String(body.name).trim(), body.color || '#6366f1', body.description || '', user.id, now, now).run();
    } catch (e) {
      return json({ error: 'Falha ao criar área', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM areas WHERE id = ?').bind(id).first();
    return json(row, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleAreaItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if ((request.method === 'PUT' || request.method === 'DELETE') &&
      !canDo(user.granular, 'areas', 'manage_areas')) {
    return json({ error: 'Sem permissão para gerenciar áreas' }, 403);
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM areas WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Área não encontrada' }, 404);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'UPDATE areas SET name = ?, color = ?, description = ?, updated_at = ? WHERE id = ?'
    ).bind(
      body.name !== undefined ? String(body.name).trim() : existing.name,
      body.color !== undefined ? body.color : existing.color,
      body.description !== undefined ? body.description : existing.description,
      now, id
    ).run();
    const row = await env.DB.prepare('SELECT * FROM areas WHERE id = ?').bind(id).first();
    return json(row);
  }
  if (request.method === 'DELETE') {
    // Desvincula tarefas (front_id + project_id) e projetos ANTES de apagar a
    // área, evitando referências órfãs. Transação atômica via batch(). A ordem
    // importa: desvincular as tarefas antes de limpar projects.area_id, senão
    // as subqueries por area_id deixam de casar.
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE tasks SET front_id = NULL WHERE front_id IN (SELECT id FROM fronts WHERE project_id IN (SELECT id FROM projects WHERE area_id = ?))').bind(id),
        env.DB.prepare('UPDATE tasks SET project_id = NULL WHERE project_id IN (SELECT id FROM projects WHERE area_id = ?)').bind(id),
        env.DB.prepare('UPDATE projects SET area_id = NULL WHERE area_id = ?').bind(id),
        env.DB.prepare('DELETE FROM areas WHERE id = ?').bind(id),
      ]);
    } catch (e) {
      return json({ error: 'Falha ao excluir área — nada foi alterado', detail: String(e) }, 500);
    }
    return json({ ok: true });
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleFronts(request, env, user) {
  if (request.method === 'POST' && !canDo(user.granular, 'areas', 'manage_fronts')) {
    return json({ error: 'Sem permissão para gerenciar frentes' }, 403);
  }
  if (request.method === 'GET') {
    const projectId = new URL(request.url).searchParams.get('project_id');
    try {
      let rows;
      if (projectId) {
        rows = await env.DB.prepare(
          `SELECT f.*, (SELECT COUNT(*) FROM tasks t WHERE t.front_id = f.id) AS task_count
           FROM fronts f WHERE f.project_id = ? ORDER BY f.name`
        ).bind(projectId).all();
      } else {
        rows = await env.DB.prepare(
          `SELECT f.*, (SELECT COUNT(*) FROM tasks t WHERE t.front_id = f.id) AS task_count
           FROM fronts f ORDER BY f.name`
        ).all();
      }
      return json(rows.results || []);
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name || !body.project_id) return json({ error: 'Campos obrigatórios: name, project_id' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        'INSERT INTO fronts (id, name, project_id, description, color, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)'
      ).bind(id, String(body.name).trim(), body.project_id, body.description || '', body.color || '#6366f1', user.id, now, now).run();
    } catch (e) {
      return json({ error: 'Falha ao criar frente', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM fronts WHERE id = ?').bind(id).first();
    return json(row, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleFrontItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if ((request.method === 'PUT' || request.method === 'DELETE') &&
      !canDo(user.granular, 'areas', 'manage_fronts')) {
    return json({ error: 'Sem permissão para gerenciar frentes' }, 403);
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM fronts WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Frente não encontrada' }, 404);
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      'UPDATE fronts SET name=?, project_id=?, description=?, color=?, updated_at=? WHERE id=?'
    ).bind(
      body.name !== undefined ? String(body.name).trim() : existing.name,
      body.project_id !== undefined ? body.project_id : existing.project_id,
      body.description !== undefined ? body.description : existing.description,
      body.color !== undefined ? body.color : existing.color,
      now, id
    ).run();
    const row = await env.DB.prepare('SELECT * FROM fronts WHERE id = ?').bind(id).first();
    return json(row);
  }
  if (request.method === 'DELETE') {
    // Desvincula tarefas antes de apagar a frente. Transação atômica via batch().
    try {
      await env.DB.batch([
        env.DB.prepare('UPDATE tasks SET front_id = NULL WHERE front_id = ?').bind(id),
        env.DB.prepare('DELETE FROM fronts WHERE id = ?').bind(id),
      ]);
    } catch (e) {
      return json({ error: 'Falha ao excluir frente — nada foi alterado', detail: String(e) }, 500);
    }
    return json({ ok: true });
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Note images (stored in Google Drive: AIDE_SUPPORT/NOTAS/<noteId>/)
// ---------------------------------------------------------------------------

async function findOrCreateDriveFolder(name, parentId, ownerId, env) {
  const safe = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `name='${safe}' and mimeType='application/vnd.google-apps.folder' and ` +
    `'${parentId}' in parents and trashed=false`
  );
  const findResp = await googleFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    ownerId, env
  );
  if (findResp && findResp.ok) {
    const data = await findResp.json();
    if (data.files && data.files[0]) return data.files[0].id;
  }
  const createResp = await googleFetch(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    ownerId, env,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId]
      })
    }
  );
  if (!createResp || !createResp.ok) {
    throw new Error(`Falha ao criar pasta "${name}" no Drive (HTTP ${createResp ? createResp.status : 'no-token'})`);
  }
  const data = await createResp.json();
  return data.id;
}

async function noteImageFolderId(noteId, ownerId, env) {
  const root = await findOrCreateDriveFolder('AIDE_SUPPORT', 'root', ownerId, env);
  const notasId = await findOrCreateDriveFolder('NOTAS', root, ownerId, env);
  return findOrCreateDriveFolder(noteId, notasId, ownerId, env);
}

function shapeDriveFile(f) {
  return {
    fileId: f.id,
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    webViewLink: f.webViewLink || null,
    thumbnailLink: f.thumbnailLink || null,
    webContentLink: f.webContentLink || null,
    createdTime: f.createdTime || null
  };
}

async function handleNoteImages(request, env, user, noteId) {
  if (!noteId) return json({ error: 'ID da nota ausente' }, 400);
  const { ownerId } = await getRoleUsers(env);
  if (!ownerId) return json({ error: 'Proprietário não encontrado' }, 500);

  if (request.method === 'GET') {
    let folderId;
    try {
      folderId = await noteImageFolderId(noteId, ownerId, env);
    } catch {
      return json([]); // no folder yet → no images
    }
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const resp = await googleFetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,webContentLink,createdTime)&orderBy=createdTime`,
      ownerId, env
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok) return json({ error: 'google_error', detail: await resp.text() }, 502);
    const data = await resp.json();
    return json((data.files || []).map(shapeDriveFile));
  }

  if (request.method === 'POST') {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'Envie multipart/form-data com um campo "file"' }, 400);
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return json({ error: 'Campo "file" ausente ou inválido' }, 400);
    }
    const folderId = await noteImageFolderId(noteId, ownerId, env);
    const buffer = await file.arrayBuffer();

    // multipart/related body for the Drive upload API. Boundary chosen to be
    // ASCII-only and unlikely to appear in image bytes.
    const boundary = '----AIDEUpload' + crypto.randomUUID();
    const metadata = {
      name: file.name || `image-${Date.now()}`,
      parents: [folderId],
      mimeType: file.type || 'application/octet-stream'
    };
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${metadata.mimeType}\r\n\r\n`
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.byteLength + buffer.byteLength + tail.byteLength);
    body.set(head, 0);
    body.set(new Uint8Array(buffer), head.byteLength);
    body.set(tail, head.byteLength + buffer.byteLength);

    const resp = await googleFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,thumbnailLink,webContentLink',
      ownerId, env,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      }
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok) {
      return json({ error: 'google_error', detail: await resp.text() }, 502);
    }
    const f = await resp.json();
    return json(shapeDriveFile(f), 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleNoteImageItem(request, env, user, noteId, fileId) {
  if (!noteId || !fileId) return json({ error: 'IDs ausentes' }, 400);
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  const { ownerId } = await getRoleUsers(env);
  if (!ownerId) return json({ error: 'Proprietário não encontrado' }, 500);
  const resp = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    ownerId, env, { method: 'DELETE' }
  );
  const guard = googleGuard(resp);
  if (guard) return guard;
  if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
    return json({ error: 'google_error', detail: await resp.text() }, 502);
  }
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Networking — people, institutions, connections
// ---------------------------------------------------------------------------

function shapeNetworkPerson(row) {
  if (!row) return null;
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { tags = []; }
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'person',
    institution: row.institution || '',
    role: row.role || '',
    area_of_work: row.area_of_work || '',
    email: row.email || '',
    phone: row.phone || '',
    linkedin: row.linkedin || '',
    notes: row.notes || '',
    connection_to_lauro: row.connection_to_lauro || '',
    connection_strength: row.connection_strength || 3,
    tags,
    lifegame_person_id: row.lifegame_person_id || '',
    dex_contact_id: row.dex_contact_id || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function shapeInstitution(row) {
  if (!row) return null;
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch { tags = []; }
  return {
    id: row.id,
    name: row.name,
    type: row.type || 'company',
    area: row.area || '',
    website: row.website || '',
    linkedin: row.linkedin || '',
    notes: row.notes || '',
    tags,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function handleNetworkPeople(request, env, user) {
  // v2.1.1 — GET fails open (empty list); writes still 403.
  if (request.method !== 'GET' && !requirePermission(user, 'networking', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (request.method === 'GET' && !requirePermission(user, 'networking', 'view')) {
    return json([]);
  }
  if (request.method === 'POST' && !canDo(user.granular, 'networking', 'edit_contacts')) {
    return json({ error: 'Sem permissão para editar contatos' }, 403);
  }
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT * FROM network_people ORDER BY name').all();
      return json(await hydratePeople(env, results || []));
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name) return json({ error: 'name é obrigatório' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO network_people
          (id, name, type, institution, role, area_of_work, email, phone, linkedin, notes,
           connection_to_lauro, connection_strength, tags, lifegame_person_id, dex_contact_id,
           created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.name, body.type || 'person', body.institution || '', body.role || '',
        body.area_of_work || '', body.email || '', body.phone || '', body.linkedin || '',
        body.notes || '', body.connection_to_lauro || '',
        Number(body.connection_strength) || 3,
        JSON.stringify(body.tags || []),
        body.lifegame_person_id || '', body.dex_contact_id || '',
        user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar pessoa', detail: String(e) }, 500);
    }
    if (Array.isArray(body.roles)) await persistPersonRoles(env, id, body.roles);
    if (Array.isArray(body.entity_links)) {
      await persistEntityLinks(env, { personId: id }, body.entity_links);
    }
    const row = await env.DB.prepare('SELECT * FROM network_people WHERE id = ?').bind(id).first();
    const [hydrated] = await hydratePeople(env, [row]);
    return json(hydrated, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleNetworkPersonItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if ((request.method === 'PUT' || request.method === 'DELETE') &&
      !canDo(user.granular, 'networking', 'edit_contacts')) {
    return json({ error: 'Sem permissão para editar contatos' }, 403);
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM network_people WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Pessoa não encontrada' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const pick = (key, fallback) => (body[key] !== undefined ? body[key] : fallback);
    await env.DB.prepare(
      `UPDATE network_people SET name=?, type=?, institution=?, role=?, area_of_work=?,
         email=?, phone=?, linkedin=?, notes=?, connection_to_lauro=?, connection_strength=?,
         tags=?, lifegame_person_id=?, dex_contact_id=?, updated_at=? WHERE id=?`
    ).bind(
      pick('name', existing.name), pick('type', existing.type), pick('institution', existing.institution),
      pick('role', existing.role), pick('area_of_work', existing.area_of_work),
      pick('email', existing.email), pick('phone', existing.phone), pick('linkedin', existing.linkedin),
      pick('notes', existing.notes), pick('connection_to_lauro', existing.connection_to_lauro),
      Number(pick('connection_strength', existing.connection_strength)) || 3,
      body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
      pick('lifegame_person_id', existing.lifegame_person_id),
      pick('dex_contact_id', existing.dex_contact_id),
      now, id
    ).run();
    if (Array.isArray(body.roles)) await persistPersonRoles(env, id, body.roles);
    if (Array.isArray(body.entity_links)) {
      await persistEntityLinks(env, { personId: id }, body.entity_links);
    }
    const row = await env.DB.prepare('SELECT * FROM network_people WHERE id = ?').bind(id).first();
    const [hydrated] = await hydratePeople(env, [row]);
    return json(hydrated);
  }
  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM network_people WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Interações de contato (contact_interactions) — Prompt G
// ---------------------------------------------------------------------------
const INTERACTION_TYPES_VALID = [
  'email_sent', 'email_received', 'linkedin_connected', 'linkedin_message',
  'meeting', 'coffee_chat', 'paper_mentioned', 'event', 'other',
];

async function handleContactInteractions(request, env, user, personId) {
  if (!personId) return json({ error: 'ID ausente' }, 400);

  if (request.method === 'GET') {
    if (!requirePermission(user, 'networking', 'view')) return json([]);
    try {
      const { results } = await env.DB.prepare(
        'SELECT * FROM contact_interactions WHERE person_id = ? ORDER BY date DESC, created_at DESC'
      ).bind(personId).all();
      return json(results || []);
    } catch { return json([]); }
  }

  if (request.method === 'POST') {
    if (!canDo(user.granular, 'networking', 'edit_contacts')) {
      return json({ error: 'Sem permissão para editar contatos' }, 403);
    }
    const body = (await readJson(request)) || {};
    const type = INTERACTION_TYPES_VALID.includes(body.interaction_type) ? body.interaction_type : 'other';
    const date = String(body.date || '').trim() || new Date().toISOString().slice(0, 10);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO contact_interactions
          (id, person_id, interaction_type, date, summary, outcome, next_step, next_step_date, created_by, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, personId, type, date, body.summary || '', body.outcome || '',
        body.next_step || '', body.next_step_date || '', user.id, now
      ).run();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/no such table/i.test(msg)) {
        return json({ error: 'Tabela contact_interactions não existe — aplique migrations/0031_contact_enrichment.sql' }, 503);
      }
      return json({ error: 'Falha ao registrar interação', detail: msg }, 500);
    }
    // Se houver next_step_date, agenda um follow-up (notificação) para o owner.
    // scheduled_notifications não tem coluna `type`; o contexto vai no title/body.
    if (body.next_step_date) {
      try {
        const owner = await env.DB.prepare("SELECT id FROM users WHERE role = 'owner' LIMIT 1").first();
        const person = await env.DB.prepare('SELECT name FROM network_people WHERE id = ?').bind(personId).first();
        const sendAt = Math.floor(new Date(`${body.next_step_date}T09:00:00`).getTime() / 1000);
        if (owner && owner.id && Number.isFinite(sendAt) && sendAt > 0) {
          await env.DB.prepare(
            `INSERT INTO scheduled_notifications (id, from_user_id, to_user_id, title, body, task_id, project_id, send_at, sent, created_at)
             VALUES (?,?,?,?,?,?,?,?,0,?)`
          ).bind(
            crypto.randomUUID(), user.id, owner.id,
            `Follow-up: ${person ? person.name : 'contato'}`, body.next_step || '',
            null, null, sendAt, now
          ).run();
        }
      } catch { /* best-effort — não bloqueia a interação */ }
    }
    const row = await env.DB.prepare('SELECT * FROM contact_interactions WHERE id = ?').bind(id).first();
    return json(row, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleContactInteractionItem(request, env, user, personId, intId) {
  if (!personId || !intId) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  if (!canDo(user.granular, 'networking', 'edit_contacts')) {
    return json({ error: 'Sem permissão para editar contatos' }, 403);
  }
  await env.DB.prepare('DELETE FROM contact_interactions WHERE id = ? AND person_id = ?')
    .bind(intId, personId).run().catch(() => {});
  return json({ ok: true });
}

// Temperatura por pessoa a partir da última interação (hot/warm/cold/never).
async function fetchTemperatures(env, ids) {
  if (!ids.length) return {};
  try {
    const placeholders = ids.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT person_id, MAX(date) AS last_date FROM contact_interactions
        WHERE person_id IN (${placeholders}) GROUP BY person_id`
    ).bind(...ids).all();
    const map = {};
    const today = Date.now();
    for (const r of results || []) {
      if (!r.last_date) continue;
      const days = Math.floor((today - new Date(`${r.last_date}T00:00:00`).getTime()) / 86400000);
      map[r.person_id] = days <= 30 ? 'hot' : days <= 90 ? 'warm' : 'cold';
    }
    return map;
  } catch { return {}; }
}

// DEPRECADO (consolidação v2.4): network_institutions foi consolidada em
// market_organizations. Os handlers são mantidos (não removidos) e respondem 301
// apontando para /api/market/organizations, para não quebrar clientes antigos.
async function handleNetworkInstitutions(request, env, user) {
  return json({
    deprecated: true,
    message: 'Use /api/market/organizations instead',
    redirect: '/api/market/organizations',
  }, 301);
}

async function handleNetworkInstitutionItem(request, env, user, id) {
  return json({
    deprecated: true,
    message: 'Use /api/market/organizations instead',
    redirect: '/api/market/organizations',
  }, 301);
}

async function handleNetworkConnections(request, env, user) {
  if (request.method !== 'GET' && !requirePermission(user, 'networking', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }
  if (request.method === 'GET' && !requirePermission(user, 'networking', 'view')) {
    return json([]);
  }
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare('SELECT * FROM network_connections ORDER BY created_at DESC').all();
      return json(results || []);
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.person_a_id || !body.person_b_id) {
      return json({ error: 'person_a_id e person_b_id obrigatórios' }, 400);
    }
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        'INSERT INTO network_connections (id, person_a_id, person_b_id, connection_type, description, created_at) VALUES (?,?,?,?,?,?)'
      ).bind(id, body.person_a_id, body.person_b_id, body.connection_type || '', body.description || '', now).run();
    } catch (e) {
      return json({ error: 'Falha ao criar conexão', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM network_connections WHERE id = ?').bind(id).first();
    return json(row, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleNetworkConnectionItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  await env.DB.prepare('DELETE FROM network_connections WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// ---------------------------------------------------------------------------
// Mercado & Carreira (Etapa 2 — migration 0025).
// Tabelas novas: market_organizations, market_projects, contact_professional,
// contact_org_links, career_opportunities, career_documents, career_goals,
// import_log. Não substituem networking — contact_professional estende
// network_people (1:1, PK = person_id). Todos os GETs de lista são tolerantes
// a falha (retornam [] em erro), seguindo a convenção do projeto.
// ---------------------------------------------------------------------------

const MARKET_ORG_TYPES = ['company', 'university', 'research_institute', 'funder', 'consortium', 'other'];

function shapeMarketOrg(r) {
  if (!r) return r;
  return {
    ...r,
    tags: parseJsonArray(r.tags),
    // Colunas 0031 — podem ser NULL em linhas antigas antes da migração.
    relevance_for_phd: Number(r.relevance_for_phd) || 0,
    relevance_for_job: Number(r.relevance_for_job) || 0,
    relevance_for_spinoff: Number(r.relevance_for_spinoff) || 0,
  };
}
function shapeMarketProject(r) {
  if (!r) return r;
  return { ...r, tags: parseJsonArray(r.tags), partner_org_ids: parseJsonArray(r.partner_org_ids) };
}
function shapeOpportunity(r) {
  if (!r) return r;
  return { ...r, tags: parseJsonArray(r.tags) };
}
function shapeContactProfessional(r) {
  if (!r) return r;
  return { ...r, interaction_history: parseJsonArray(r.interaction_history) };
}

// ---- Mercado: organizações --------------------------------------------------

async function handleMarketOrganizations(request, env, user) {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const search = url.searchParams.get('search');
      const tags = url.searchParams.get('tags');
      const wh = [];
      const args = [];
      if (type) { wh.push('o.type = ?'); args.push(type); }
      if (status) { wh.push('o.status = ?'); args.push(status); }
      if (search) { wh.push('(o.name LIKE ? OR o.description LIKE ?)'); args.push(`%${search}%`, `%${search}%`); }
      if (tags) { wh.push('o.tags LIKE ?'); args.push(`%${tags}%`); }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const sql =
        `SELECT o.*,
          (SELECT COUNT(*) FROM market_projects p WHERE p.organization_id = o.id) AS project_count,
          (SELECT COUNT(*) FROM contact_org_links l WHERE l.organization_id = o.id) AS contact_count
         FROM market_organizations o ${where}
         ORDER BY o.relevance_score DESC, o.name ASC`;
      const { results } = await env.DB.prepare(sql).bind(...args).all();
      return json((results || []).map(shapeMarketOrg));
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name) return json({ error: 'name é obrigatório' }, 400);
    if (body.type && !MARKET_ORG_TYPES.includes(body.type)) return json({ error: 'type inválido' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO market_organizations
          (id, name, type, subtype, country, city, website, linkedin, description,
           relevance_score, relevance_notes, tags, status, source,
           relevance_for_phd, relevance_for_job, relevance_for_spinoff,
           created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.name, body.type || 'company', body.subtype || '', body.country || 'NL',
        body.city || '', body.website || '', body.linkedin || '', body.description || '',
        Number(body.relevance_score) || 3, body.relevance_notes || '',
        JSON.stringify(body.tags || []), body.status || 'prospect', body.source || '',
        Number(body.relevance_for_phd) || 0, Number(body.relevance_for_job) || 0,
        Number(body.relevance_for_spinoff) || 0,
        user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar organização', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM market_organizations WHERE id = ?').bind(id).first();
    return json(shapeMarketOrg(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleMarketOrganizationItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method === 'GET') {
    try {
      const org = await env.DB.prepare('SELECT * FROM market_organizations WHERE id = ?').bind(id).first();
      if (!org) return json({ error: 'Organização não encontrada' }, 404);
      const projects = await env.DB.prepare(
        'SELECT * FROM market_projects WHERE organization_id = ? ORDER BY name'
      ).bind(id).all();
      const contacts = await env.DB.prepare(
        `SELECT l.*, p.name AS person_name, pr.name AS project_name,
                cp.outreach_status AS outreach_status
           FROM contact_org_links l
           LEFT JOIN network_people p ON p.id = l.person_id
           LEFT JOIN market_projects pr ON pr.id = l.project_id
           LEFT JOIN contact_professional cp ON cp.person_id = l.person_id
          WHERE l.organization_id = ?`
      ).bind(id).all();
      const opportunities = await env.DB.prepare(
        'SELECT * FROM career_opportunities WHERE organization_id = ? ORDER BY deadline'
      ).bind(id).all();
      return json({
        ...shapeMarketOrg(org),
        projects: (projects.results || []).map(shapeMarketProject),
        contacts: contacts.results || [],
        opportunities: (opportunities.results || []).map(shapeOpportunity),
      });
    } catch (e) {
      return json({ error: 'Falha ao carregar organização', detail: String(e) }, 500);
    }
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM market_organizations WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Organização não encontrada' }, 404);
    if (body.type && !MARKET_ORG_TYPES.includes(body.type)) return json({ error: 'type inválido' }, 400);
    const now = Math.floor(Date.now() / 1000);
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    try {
      await env.DB.prepare(
        `UPDATE market_organizations SET name=?, type=?, subtype=?, country=?, city=?, website=?,
           linkedin=?, description=?, relevance_score=?, relevance_notes=?, tags=?, status=?,
           source=?, relevance_for_phd=?, relevance_for_job=?, relevance_for_spinoff=?,
           updated_at=? WHERE id=?`
      ).bind(
        pick('name', existing.name), pick('type', existing.type), pick('subtype', existing.subtype),
        pick('country', existing.country), pick('city', existing.city), pick('website', existing.website),
        pick('linkedin', existing.linkedin), pick('description', existing.description),
        Number(pick('relevance_score', existing.relevance_score)) || 3,
        pick('relevance_notes', existing.relevance_notes),
        body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
        pick('status', existing.status), pick('source', existing.source),
        Number(pick('relevance_for_phd', existing.relevance_for_phd)) || 0,
        Number(pick('relevance_for_job', existing.relevance_for_job)) || 0,
        Number(pick('relevance_for_spinoff', existing.relevance_for_spinoff)) || 0,
        now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar organização', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM market_organizations WHERE id = ?').bind(id).first();
    return json(shapeMarketOrg(row));
  }
  if (request.method === 'DELETE') {
    if (user.role !== 'owner') return json({ error: 'Apenas o owner pode deletar organizações' }, 403);
    try {
      const url = new URL(request.url);
      const confirm = url.searchParams.get('confirm') === 'true';
      const active = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM career_opportunities
          WHERE organization_id = ? AND status NOT IN ('closed','rejected')`
      ).bind(id).first();
      if (active && active.n > 0 && !confirm) {
        return json({
          error: `Há ${active.n} oportunidade(s) ativa(s) vinculada(s) a esta organização. Para confirmar a exclusão, repita com ?confirm=true.`,
          requiresConfirmation: true,
          activeOpportunities: active.n,
        }, 409);
      }
      await env.DB.prepare('DELETE FROM market_organizations WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'Falha ao deletar organização', detail: String(e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---- Mercado: detalhe agregado da organização (OrgDetailPage) --------------
// GET /api/market/organizations/:id/full — devolve a organização + contatos
// vinculados (com outreach_status), iniciativas (coordenadora e parceira),
// oportunidades ativas e a contagem de notas de mercado.

async function handleMarketOrgFull(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  try {
    const org = await env.DB.prepare(
      `SELECT o.*, u.name AS created_by_name
         FROM market_organizations o
         LEFT JOIN users u ON u.id = o.created_by
        WHERE o.id = ?`
    ).bind(id).first();
    if (!org) return json({ error: 'Organização não encontrada' }, 404);

    // Contatos vinculados via contact_org_links + status de outreach.
    const contacts = await env.DB.prepare(
      `SELECT l.id, l.person_id, l.role_at_org, l.relevance_notes,
              p.name AS person_name, p.email AS person_email,
              cp.outreach_status AS outreach_status
         FROM contact_org_links l
         LEFT JOIN network_people p ON p.id = l.person_id
         LEFT JOIN contact_professional cp ON cp.person_id = l.person_id
        WHERE l.organization_id = ?
        ORDER BY p.name`
    ).bind(id).all();

    // Iniciativas: coordenadora (organization_id) OU parceira (partner_org_ids LIKE).
    const projects = await env.DB.prepare(
      `SELECT * FROM market_projects
        WHERE organization_id = ? OR partner_org_ids LIKE ?
        ORDER BY relevance_score DESC, name ASC`
    ).bind(id, `%"${id}"%`).all();

    // Oportunidades ativas com nome do responsável.
    const opportunities = await env.DB.prepare(
      `SELECT co.*, u.name AS assigned_name
         FROM career_opportunities co
         LEFT JOIN users u ON u.id = co.assigned_to
        WHERE co.organization_id = ?
          AND co.status NOT IN ('closed','rejected')
        ORDER BY CASE WHEN co.deadline IS NULL OR co.deadline = '' THEN 1 ELSE 0 END, co.deadline ASC`
    ).bind(id).all();

    const notesCount = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM market_notes WHERE organization_id = ?'
    ).bind(id).first();

    return json({
      ...shapeMarketOrg(org),
      created_by_name: org.created_by_name || null,
      contacts: contacts.results || [],
      projects: (projects.results || []).map(shapeMarketProject),
      opportunities: (opportunities.results || []).map(shapeOpportunity),
      notes_count: (notesCount && notesCount.n) || 0,
    });
  } catch (e) {
    return json({ error: 'Falha ao carregar organização', detail: String(e) }, 500);
  }
}

// ---- Mercado: notas por organização (market_notes) -------------------------
// Tabela separada de /api/notes. GET lista por organization_id; POST cria.

const MARKET_NOTE_TYPES = ['research', 'funding', 'culture', 'news', 'contact', 'other'];

function shapeMarketNote(r) {
  if (!r) return r;
  return { ...r, tags: parseJsonArray(r.tags), pinned: !!r.pinned };
}

async function handleMarketNotes(request, env, user) {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const orgId = url.searchParams.get('organization_id');
      const type = url.searchParams.get('note_type');
      const wh = [];
      const args = [];
      if (orgId) { wh.push('n.organization_id = ?'); args.push(orgId); }
      if (type) { wh.push('n.note_type = ?'); args.push(type); }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const { results } = await env.DB.prepare(
        `SELECT n.*, u.name AS author_name
           FROM market_notes n
           LEFT JOIN users u ON u.id = n.created_by
           ${where}
          ORDER BY n.pinned DESC, n.updated_at DESC`
      ).bind(...args).all();
      return json((results || []).map(shapeMarketNote));
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.organization_id) return json({ error: 'organization_id é obrigatório' }, 400);
    const type = MARKET_NOTE_TYPES.includes(body.note_type) ? body.note_type : 'other';
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO market_notes
          (id, organization_id, title, body, note_type, tags, pinned, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.organization_id, body.title || '', body.body || '', type,
        JSON.stringify(body.tags || []), body.pinned ? 1 : 0, user.id, now, now
      ).run();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/no such table/i.test(msg)) return json({ error: 'Migração 0031 não aplicada', detail: msg }, 503);
      return json({ error: 'Falha ao criar nota', detail: msg }, 500);
    }
    const row = await env.DB.prepare(
      'SELECT n.*, u.name AS author_name FROM market_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.id = ?'
    ).bind(id).first();
    return json(shapeMarketNote(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleMarketNoteItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  const existing = await env.DB.prepare('SELECT * FROM market_notes WHERE id = ?').bind(id).first();
  if (!existing) return json({ error: 'Nota não encontrada' }, 404);

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    const type = body.note_type !== undefined
      ? (MARKET_NOTE_TYPES.includes(body.note_type) ? body.note_type : 'other')
      : existing.note_type;
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `UPDATE market_notes SET title=?, body=?, note_type=?, tags=?, pinned=?, updated_at=? WHERE id=?`
      ).bind(
        pick('title', existing.title), pick('body', existing.body), type,
        body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
        body.pinned !== undefined ? (body.pinned ? 1 : 0) : existing.pinned,
        now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar nota', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare(
      'SELECT n.*, u.name AS author_name FROM market_notes n LEFT JOIN users u ON u.id = n.created_by WHERE n.id = ?'
    ).bind(id).first();
    return json(shapeMarketNote(row));
  }

  if (request.method === 'DELETE') {
    try {
      await env.DB.prepare('DELETE FROM market_notes WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'Falha ao deletar nota', detail: String(e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---- Mercado: projetos ------------------------------------------------------

async function handleMarketProjects(request, env, user) {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const orgId = url.searchParams.get('organization_id');
      const type = url.searchParams.get('type');
      const status = url.searchParams.get('status');
      const wh = [];
      const args = [];
      if (orgId) { wh.push('p.organization_id = ?'); args.push(orgId); }
      if (type) { wh.push('p.type = ?'); args.push(type); }
      if (status) { wh.push('p.status = ?'); args.push(status); }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const sql =
        `SELECT p.*, o.name AS organization_name
           FROM market_projects p
           LEFT JOIN market_organizations o ON o.id = p.organization_id
           ${where}
          ORDER BY p.relevance_score DESC, p.name ASC`;
      const { results } = await env.DB.prepare(sql).bind(...args).all();
      return json((results || []).map(shapeMarketProject));
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name) return json({ error: 'name é obrigatório' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO market_projects
          (id, name, acronym, type, organization_id, description, budget, start_date, end_date,
           status, relevance_score, relevance_notes, url, tags, partner_org_ids, source,
           created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.name, body.acronym || '', body.type || 'research', body.organization_id || null,
        body.description || '', body.budget || '', body.start_date || '', body.end_date || '',
        body.status || 'active', Number(body.relevance_score) || 3, body.relevance_notes || '',
        body.url || '', JSON.stringify(body.tags || []), JSON.stringify(body.partner_org_ids || []),
        body.source || '', user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar projeto', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM market_projects WHERE id = ?').bind(id).first();
    return json(shapeMarketProject(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleMarketProjectItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method === 'GET') {
    try {
      const row = await env.DB.prepare(
        `SELECT p.*, o.name AS organization_name
           FROM market_projects p
           LEFT JOIN market_organizations o ON o.id = p.organization_id
          WHERE p.id = ?`
      ).bind(id).first();
      if (!row) return json({ error: 'Projeto não encontrado' }, 404);
      return json(shapeMarketProject(row));
    } catch (e) {
      return json({ error: 'Falha ao carregar projeto', detail: String(e) }, 500);
    }
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM market_projects WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Projeto não encontrado' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    try {
      await env.DB.prepare(
        `UPDATE market_projects SET name=?, acronym=?, type=?, organization_id=?, description=?,
           budget=?, start_date=?, end_date=?, status=?, relevance_score=?, relevance_notes=?,
           url=?, tags=?, partner_org_ids=?, source=?, updated_at=? WHERE id=?`
      ).bind(
        pick('name', existing.name), pick('acronym', existing.acronym), pick('type', existing.type),
        pick('organization_id', existing.organization_id), pick('description', existing.description),
        pick('budget', existing.budget), pick('start_date', existing.start_date),
        pick('end_date', existing.end_date), pick('status', existing.status),
        Number(pick('relevance_score', existing.relevance_score)) || 3,
        pick('relevance_notes', existing.relevance_notes), pick('url', existing.url),
        body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
        body.partner_org_ids !== undefined ? JSON.stringify(body.partner_org_ids) : existing.partner_org_ids,
        pick('source', existing.source), now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar projeto', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM market_projects WHERE id = ?').bind(id).first();
    return json(shapeMarketProject(row));
  }
  if (request.method === 'DELETE') {
    if (user.role !== 'owner') return json({ error: 'Apenas o owner pode deletar projetos' }, 403);
    try {
      await env.DB.prepare('DELETE FROM market_projects WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'Falha ao deletar projeto', detail: String(e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---- Mercado: contatos profissionais (extensão de network_people) ----------

async function handleMarketContacts(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  try {
    const url = new URL(request.url);
    const outreach = url.searchParams.get('outreach_status');
    const orgId = url.searchParams.get('organization_id');
    const wh = [];
    const args = [];
    if (outreach) { wh.push('cp.outreach_status = ?'); args.push(outreach); }
    if (orgId) { wh.push('cp.organization_id = ?'); args.push(orgId); }
    const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
    const sql =
      `SELECT cp.*, p.name AS person_name, p.email AS person_email, p.linkedin AS person_linkedin,
              o.name AS organization_name
         FROM contact_professional cp
         JOIN network_people p ON p.id = cp.person_id
         LEFT JOIN market_organizations o ON o.id = cp.organization_id
         ${where}
        ORDER BY CASE WHEN cp.next_action_date IS NULL OR cp.next_action_date = '' THEN 1 ELSE 0 END,
                 cp.next_action_date ASC`;
    const { results } = await env.DB.prepare(sql).bind(...args).all();
    return json((results || []).map(shapeContactProfessional));
  } catch { return json([]); }
}

async function handleMarketContactItem(request, env, user, personId) {
  if (!personId) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  try {
    const person = await env.DB.prepare('SELECT * FROM network_people WHERE id = ?').bind(personId).first();
    if (!person) return json({ error: 'Pessoa não encontrada' }, 404);
    const professional = await env.DB.prepare(
      'SELECT * FROM contact_professional WHERE person_id = ?'
    ).bind(personId).first();
    const links = await env.DB.prepare(
      `SELECT l.*, o.name AS organization_name, pr.name AS project_name
         FROM contact_org_links l
         LEFT JOIN market_organizations o ON o.id = l.organization_id
         LEFT JOIN market_projects pr ON pr.id = l.project_id
        WHERE l.person_id = ?`
    ).bind(personId).all();
    return json({
      person: { ...person, tags: parseJsonArray(person.tags) },
      professional: professional ? shapeContactProfessional(professional) : null,
      org_links: links.results || [],
    });
  } catch (e) {
    return json({ error: 'Falha ao carregar contato', detail: String(e) }, 500);
  }
}

async function handleMarketContactProfessional(request, env, user, personId) {
  if (!personId) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'POST' && request.method !== 'PUT') {
    return json({ error: 'Método não permitido' }, 405);
  }
  const person = await env.DB.prepare('SELECT id FROM network_people WHERE id = ?').bind(personId).first();
  if (!person) return json({ error: 'Pessoa não encontrada em network_people' }, 404);
  const body = (await readJson(request)) || {};
  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare(
    'SELECT * FROM contact_professional WHERE person_id = ?'
  ).bind(personId).first();
  const pick = (k, f) => (body[k] !== undefined ? body[k] : f);

  // Histórico de interações: se vier `interaction`, anexa ao array existente.
  let history = parseJsonArray(existing && existing.interaction_history);
  if (body.interaction) {
    history.push({
      date: body.interaction.date || new Date(now * 1000).toISOString().slice(0, 10),
      type: body.interaction.type || '',
      notes: body.interaction.notes || '',
    });
  } else if (body.interaction_history !== undefined) {
    history = parseJsonArray(body.interaction_history);
  }

  try {
    if (!existing) {
      await env.DB.prepare(
        `INSERT INTO contact_professional
          (person_id, organization_id, outreach_status, outreach_channel, last_contact_date,
           next_action, next_action_date, relevance_for_phd, relevance_for_job, relevance_for_spinoff,
           interaction_history, confirmed_email, confirmed_linkedin, notes,
           acquaintance_context, acquaintance_notes, referral_potential, referral_score, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        personId, body.organization_id || null, body.outreach_status || 'not_contacted',
        body.outreach_channel || '', body.last_contact_date || '', body.next_action || '',
        body.next_action_date || '', Number(body.relevance_for_phd) || 0,
        Number(body.relevance_for_job) || 0, Number(body.relevance_for_spinoff) || 0,
        JSON.stringify(history), body.confirmed_email || '', body.confirmed_linkedin || '',
        body.notes || '',
        body.acquaintance_context || '', body.acquaintance_notes || '',
        body.referral_potential || '', Number(body.referral_score) || 0, now
      ).run();
    } else {
      await env.DB.prepare(
        `UPDATE contact_professional SET organization_id=?, outreach_status=?, outreach_channel=?,
           last_contact_date=?, next_action=?, next_action_date=?, relevance_for_phd=?,
           relevance_for_job=?, relevance_for_spinoff=?, interaction_history=?, confirmed_email=?,
           confirmed_linkedin=?, notes=?, acquaintance_context=?, acquaintance_notes=?,
           referral_potential=?, referral_score=?, updated_at=? WHERE person_id=?`
      ).bind(
        pick('organization_id', existing.organization_id), pick('outreach_status', existing.outreach_status),
        pick('outreach_channel', existing.outreach_channel), pick('last_contact_date', existing.last_contact_date),
        pick('next_action', existing.next_action), pick('next_action_date', existing.next_action_date),
        Number(pick('relevance_for_phd', existing.relevance_for_phd)) || 0,
        Number(pick('relevance_for_job', existing.relevance_for_job)) || 0,
        Number(pick('relevance_for_spinoff', existing.relevance_for_spinoff)) || 0,
        JSON.stringify(history), pick('confirmed_email', existing.confirmed_email),
        pick('confirmed_linkedin', existing.confirmed_linkedin), pick('notes', existing.notes),
        pick('acquaintance_context', existing.acquaintance_context || ''),
        pick('acquaintance_notes', existing.acquaintance_notes || ''),
        pick('referral_potential', existing.referral_potential || ''),
        Number(pick('referral_score', existing.referral_score)) || 0,
        now, personId
      ).run();
    }
  } catch (e) {
    return json({ error: 'Falha ao salvar dados profissionais', detail: String(e) }, 500);
  }
  const row = await env.DB.prepare('SELECT * FROM contact_professional WHERE person_id = ?').bind(personId).first();
  return json(shapeContactProfessional(row), existing ? 200 : 201);
}

async function handleMarketContactLink(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  if (!body.person_id || !body.organization_id) {
    return json({ error: 'person_id e organization_id são obrigatórios' }, 400);
  }
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      `INSERT INTO contact_org_links
        (id, person_id, organization_id, project_id, role_at_org, relevance_notes, created_at)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(
      id, body.person_id, body.organization_id, body.project_id || null,
      body.role_at_org || '', body.relevance_notes || '', now
    ).run();
  } catch (e) {
    return json({ error: 'Falha ao criar vínculo', detail: String(e) }, 500);
  }
  const row = await env.DB.prepare('SELECT * FROM contact_org_links WHERE id = ?').bind(id).first();
  return json(row, 201);
}

// ---- Mercado: importação em massa ------------------------------------------
// GET  → histórico (import_log) com nome de quem importou.
// POST → importa organizações + contatos + vínculos a partir de um JSON
//        estruturado. Idempotente: organizações casam por nome (não duplica),
//        contatos por email e depois por nome. Resolve `organization_name` dos
//        contatos para organization_id e cria a linha em contact_professional.

async function handleMarketImport(request, env, user) {
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        `SELECT il.*, u.name AS imported_by_name
           FROM import_log il
           LEFT JOIN users u ON u.id = il.imported_by
          ORDER BY il.imported_at DESC`
      ).all();
      return json((results || []).map((r) => ({ ...r, error_log: parseJsonArray(r.error_log) })));
    } catch { return json([]); }
  }
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const allowed = user.role === 'owner' || user.role === 'assistant_fixed' || user.user_type === 'fixed';
  if (!allowed) return json({ error: 'Sem permissão para importação em massa' }, 403);

  const body = (await readJson(request)) || {};
  const data = body.data || {};
  const now = Math.floor(Date.now() / 1000);
  let orgCount = 0;
  let contactCount = 0;
  let failed = 0;
  const errors = [];

  // Mapa nome(lowercase) → id para resolver organization_name dos contatos.
  // Começa com as organizações já existentes no banco.
  const orgByName = new Map();
  try {
    const { results } = await env.DB.prepare('SELECT id, name FROM market_organizations').all();
    for (const o of (results || [])) orgByName.set((o.name || '').trim().toLowerCase(), o.id);
  } catch { /* tabela ausente — segue com mapa vazio */ }

  // --- Organizações ---
  for (const org of (data.organizations || [])) {
    try {
      const key = (org.name || '').trim().toLowerCase();
      if (!key) { failed++; errors.push({ kind: 'organization', item: '(sem nome)', error: 'name vazio' }); continue; }
      if (orgByName.has(key)) continue; // já existe — idempotente
      const id = org.id || crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO market_organizations
          (id, name, type, subtype, country, city, website, linkedin, description,
           relevance_score, relevance_notes, tags, status, source, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, org.name, org.type || 'company', org.subtype || '', org.country || 'NL',
        org.city || '', org.website || '', org.linkedin || '', org.description || '',
        Number(org.relevance_score) || 3, org.relevance_notes || '',
        JSON.stringify(org.tags || []), org.status || 'prospect',
        org.source || body.source_description || '', user.id, now, now
      ).run();
      orgByName.set(key, id);
      orgCount++;
    } catch (e) {
      failed++; errors.push({ kind: 'organization', item: org && org.name, error: String(e) });
    }
  }

  // --- Contatos (network_people + contact_professional) ---
  for (const c of (data.contacts || [])) {
    try {
      if (!(c.name || '').trim()) { failed++; errors.push({ kind: 'contact', item: '(sem nome)', error: 'name vazio' }); continue; }
      const orgKey = (c.organization_name || c.institution || '').trim().toLowerCase();
      const orgId = orgKey ? (orgByName.get(orgKey) || null) : null;

      // Dedup: por email (se houver), senão por nome exato.
      let personId = null;
      if (c.email) {
        const hit = await env.DB.prepare('SELECT id FROM network_people WHERE email = ? LIMIT 1').bind(c.email).first();
        if (hit) personId = hit.id;
      }
      if (!personId) {
        const hit = await env.DB.prepare('SELECT id FROM network_people WHERE name = ? LIMIT 1').bind(c.name).first();
        if (hit) personId = hit.id;
      }
      if (!personId) {
        personId = c.id || crypto.randomUUID();
        await env.DB.prepare(
          `INSERT INTO network_people
            (id, name, type, institution, role, area_of_work, email, phone, linkedin, notes,
             connection_to_lauro, connection_strength, tags, lifegame_person_id, dex_contact_id,
             created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          personId, c.name, c.type || 'person', c.organization_name || c.institution || '',
          c.role || '', c.area_of_work || '', c.email || '', c.phone || '', c.linkedin || '',
          c.notes || '', '', Number(c.connection_strength) || 3,
          JSON.stringify(c.tags || []), '', '', user.id, now, now
        ).run();
      } else {
        // Reimportação: atualiza dados descritivos. Não sobrescreve email/linkedin
        // com vazio (preserva o que já existe quando o JSON não traz o campo).
        await env.DB.prepare(
          `UPDATE network_people SET
             institution = ?, role = ?,
             email = CASE WHEN ? <> '' THEN ? ELSE email END,
             linkedin = CASE WHEN ? <> '' THEN ? ELSE linkedin END,
             tags = ?, updated_at = ?
           WHERE id = ?`
        ).bind(
          c.organization_name || c.institution || '', c.role || '',
          c.email || '', c.email || '',
          c.linkedin || '', c.linkedin || '',
          JSON.stringify(c.tags || []), now, personId
        ).run();
      }

      // contact_professional — upsert (INSERT OR REPLACE). Reimportar atualiza os
      // campos vindos do JSON, mas preserva os campos editados manualmente na UI
      // (last_contact_date, next_action, interaction_history, confirmed_*).
      const existingProf = await env.DB.prepare(
        'SELECT * FROM contact_professional WHERE person_id = ?'
      ).bind(personId).first();
      await env.DB.prepare(
        `INSERT OR REPLACE INTO contact_professional
          (person_id, organization_id, outreach_status, outreach_channel, last_contact_date,
           next_action, next_action_date, relevance_for_phd, relevance_for_job, relevance_for_spinoff,
           interaction_history, confirmed_email, confirmed_linkedin, notes, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        personId,
        orgId || (existingProf && existingProf.organization_id) || null,
        c.outreach_status || (existingProf && existingProf.outreach_status) || 'not_contacted',
        c.outreach_channel || (existingProf && existingProf.outreach_channel) || '',
        (existingProf && existingProf.last_contact_date) || '',
        (existingProf && existingProf.next_action) || '',
        (existingProf && existingProf.next_action_date) || '',
        Number(c.relevance_for_phd) || 0, Number(c.relevance_for_job) || 0,
        Number(c.relevance_for_spinoff) || 0,
        (existingProf && existingProf.interaction_history) || '[]',
        (existingProf && existingProf.confirmed_email) || '',
        (existingProf && existingProf.confirmed_linkedin) || '',
        c.relevance_notes || (existingProf && existingProf.notes) || '', now
      ).run();

      // Vínculo pessoa ↔ organização (se a organização foi resolvida).
      if (orgId) {
        const existingLink = await env.DB.prepare(
          'SELECT id FROM contact_org_links WHERE person_id = ? AND organization_id = ? LIMIT 1'
        ).bind(personId, orgId).first();
        if (!existingLink) {
          await env.DB.prepare(
            `INSERT INTO contact_org_links
              (id, person_id, organization_id, project_id, role_at_org, relevance_notes, created_at)
             VALUES (?,?,?,?,?,?,?)`
          ).bind(crypto.randomUUID(), personId, orgId, null, c.role || '', c.relevance_notes || '', now).run();
        }
      }
      contactCount++;
    } catch (e) {
      failed++; errors.push({ kind: 'contact', item: c && c.name, error: String(e) });
    }
  }

  // --- Vínculos explícitos (opcional) ---
  for (const l of (data.links || [])) {
    try {
      await env.DB.prepare(
        `INSERT OR IGNORE INTO contact_org_links
          (id, person_id, organization_id, project_id, role_at_org, relevance_notes, created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(
        l.id || crypto.randomUUID(), l.person_id || '', l.organization_id || '',
        l.project_id || null, l.role_at_org || '', l.relevance_notes || '', now
      ).run();
    } catch (e) {
      failed++; errors.push({ kind: 'link', item: l && l.person_id, error: String(e) });
    }
  }

  const imported = orgCount + contactCount;
  try {
    await env.DB.prepare(
      `INSERT INTO import_log
        (id, import_type, source_description, items_imported, items_failed, error_log, imported_by, imported_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      crypto.randomUUID(), body.type || 'mixed', body.source_description || '',
      imported, failed, JSON.stringify(errors), user.id, now
    ).run();
  } catch { /* falha ao registrar log não invalida a importação */ }

  return json({ imported, failed, organizations: orgCount, contacts: contactCount, errors });
}

// ---- Carreira: oportunidades ------------------------------------------------

async function handleCareerOpportunities(request, env, user) {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const track = url.searchParams.get('track');
      const status = url.searchParams.get('status');
      const priority = url.searchParams.get('priority');
      const wh = [];
      const args = [];
      if (track) { wh.push('o.track = ?'); args.push(track); }
      if (status) { wh.push('o.status = ?'); args.push(status); }
      if (priority) { wh.push('o.priority = ?'); args.push(Number(priority)); }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const sql =
        `SELECT o.*, org.name AS organization_name, c.name AS contact_name
           FROM career_opportunities o
           LEFT JOIN market_organizations org ON org.id = o.organization_id
           LEFT JOIN network_people c ON c.id = o.contact_id
           ${where}
          ORDER BY CASE o.status
            WHEN 'to_organize' THEN 0 WHEN 'preparing' THEN 1
            WHEN 'applied' THEN 2 WHEN 'in_process' THEN 3 WHEN 'dead' THEN 4 ELSE 5 END,
            CASE WHEN o.deadline IS NULL OR o.deadline = '' THEN 1 ELSE 0 END, o.deadline ASC`;
      const { results } = await env.DB.prepare(sql).bind(...args).all();
      return json((results || []).map(shapeOpportunity));
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.title || !body.type || !body.track) {
      return json({ error: 'title, type e track são obrigatórios' }, 400);
    }
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO career_opportunities
          (id, title, type, track, organization_id, contact_id, project_id, description,
           requirements, location, salary_range, deadline, status, priority, fit_score, url,
           notes, tags, assigned_to, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.title, body.type, body.track, body.organization_id || null, body.contact_id || null,
        body.project_id || null, body.description || '', body.requirements || '', body.location || '',
        body.salary_range || '', body.deadline || '', body.status || 'to_organize',
        Number(body.priority) || 3, Number(body.fit_score) || 3, body.url || '', body.notes || '',
        JSON.stringify(body.tags || []), body.assigned_to || null, user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar oportunidade', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_opportunities WHERE id = ?').bind(id).first();
    return json(shapeOpportunity(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleCareerOpportunityItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method === 'GET') {
    try {
      const row = await env.DB.prepare(
        `SELECT o.*, org.name AS organization_name, c.name AS contact_name
           FROM career_opportunities o
           LEFT JOIN market_organizations org ON org.id = o.organization_id
           LEFT JOIN network_people c ON c.id = o.contact_id
          WHERE o.id = ?`
      ).bind(id).first();
      if (!row) return json({ error: 'Oportunidade não encontrada' }, 404);
      return json(shapeOpportunity(row));
    } catch (e) {
      return json({ error: 'Falha ao carregar oportunidade', detail: String(e) }, 500);
    }
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM career_opportunities WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Oportunidade não encontrada' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    const newStatus = pick('status', existing.status);
    let notes = pick('notes', existing.notes);
    // Mudança de status: registra no histórico (notes) com timestamp.
    if (body.status !== undefined && body.status !== existing.status) {
      const stamp = new Date(now * 1000).toISOString().slice(0, 16).replace('T', ' ');
      notes = `${notes || ''}\n[${stamp}] status: ${existing.status} → ${newStatus}`.trim();
    }
    try {
      await env.DB.prepare(
        `UPDATE career_opportunities SET title=?, type=?, track=?, organization_id=?, contact_id=?,
           project_id=?, description=?, requirements=?, location=?, salary_range=?, deadline=?,
           status=?, priority=?, fit_score=?, url=?, notes=?, tags=?, assigned_to=?, updated_at=?
         WHERE id=?`
      ).bind(
        pick('title', existing.title), pick('type', existing.type), pick('track', existing.track),
        pick('organization_id', existing.organization_id), pick('contact_id', existing.contact_id),
        pick('project_id', existing.project_id), pick('description', existing.description),
        pick('requirements', existing.requirements), pick('location', existing.location),
        pick('salary_range', existing.salary_range), pick('deadline', existing.deadline),
        newStatus, Number(pick('priority', existing.priority)) || 3,
        Number(pick('fit_score', existing.fit_score)) || 3, pick('url', existing.url), notes,
        body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
        pick('assigned_to', existing.assigned_to), now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar oportunidade', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_opportunities WHERE id = ?').bind(id).first();
    return json(shapeOpportunity(row));
  }
  if (request.method === 'PATCH') {
    // Atualização parcial: usada pelo toggle "Extrair Conhecimento" e por
    // mudanças pontuais de status/notas, sem exigir o payload completo do PUT.
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM career_opportunities WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Oportunidade não encontrada' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const sets = [];
    const args = [];
    if (body.extract_knowledge !== undefined) { sets.push('extract_knowledge = ?'); args.push(body.extract_knowledge ? 1 : 0); }
    if (body.status !== undefined) { sets.push('status = ?'); args.push(body.status); }
    if (body.notes !== undefined) { sets.push('notes = ?'); args.push(body.notes); }
    if (sets.length === 0) return json({ error: 'Nenhum campo para atualizar' }, 400);
    sets.push('updated_at = ?');
    args.push(now, id);
    try {
      await env.DB.prepare(`UPDATE career_opportunities SET ${sets.join(', ')} WHERE id = ?`).bind(...args).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar oportunidade', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_opportunities WHERE id = ?').bind(id).first();
    return json(shapeOpportunity(row));
  }
  if (request.method === 'DELETE') {
    // Remoção definitiva (v2.17.0) — apenas owner. Distinta do soft-delete
    // (marcar status='dead'), que continua acessível via PATCH/PUT de status.
    if (user.role !== 'owner') return json({ error: 'Apenas o owner pode remover' }, 403);
    const existing = await env.DB.prepare('SELECT id FROM career_opportunities WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Oportunidade não encontrada' }, 404);
    try {
      await env.DB.prepare('DELETE FROM career_opportunities WHERE id = ?').bind(id).run();
    } catch (e) {
      return json({ error: 'Falha ao remover oportunidade', detail: String(e) }, 500);
    }
    return json({ deleted: true });
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---- Carreira: documentos ---------------------------------------------------

async function handleCareerDocuments(request, env, user) {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      const oppId = url.searchParams.get('opportunity_id');
      const wh = [];
      const args = [];
      if (type) { wh.push('type = ?'); args.push(type); }
      if (oppId) { wh.push('opportunity_id = ?'); args.push(oppId); }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const { results } = await env.DB.prepare(
        `SELECT * FROM career_documents ${where} ORDER BY updated_at DESC`
      ).bind(...args).all();
      return json(results || []);
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.title) return json({ error: 'title é obrigatório' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO career_documents
          (id, title, type, version, opportunity_id, drive_file_id, drive_link, notes,
           created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.title, body.type || 'cv', body.version || 'v1', body.opportunity_id || null,
        body.drive_file_id || '', body.drive_link || '', body.notes || '', user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar documento', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_documents WHERE id = ?').bind(id).first();
    return json(row, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleCareerDocumentItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM career_documents WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Documento não encontrado' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    try {
      await env.DB.prepare(
        `UPDATE career_documents SET title=?, type=?, version=?, opportunity_id=?, drive_file_id=?,
           drive_link=?, notes=?, updated_at=? WHERE id=?`
      ).bind(
        pick('title', existing.title), pick('type', existing.type), pick('version', existing.version),
        pick('opportunity_id', existing.opportunity_id), pick('drive_file_id', existing.drive_file_id),
        pick('drive_link', existing.drive_link), pick('notes', existing.notes), now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar documento', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_documents WHERE id = ?').bind(id).first();
    return json(row);
  }
  if (request.method === 'DELETE') {
    try {
      await env.DB.prepare('DELETE FROM career_documents WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'Falha ao deletar documento', detail: String(e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---- Carreira: metas --------------------------------------------------------

async function handleCareerGoals(request, env, user) {
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const track = url.searchParams.get('track');
      const status = url.searchParams.get('status');
      const wh = [];
      const args = [];
      if (track) { wh.push('track = ?'); args.push(track); }
      if (status) { wh.push('status = ?'); args.push(status); }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const { results } = await env.DB.prepare(
        `SELECT * FROM career_goals ${where} ORDER BY priority DESC, target_date ASC`
      ).bind(...args).all();
      return json(results || []);
    } catch { return json([]); }
  }
  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.title) return json({ error: 'title é obrigatório' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO career_goals
          (id, title, track, description, target_date, status, priority, notes,
           created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.title, body.track || 'job', body.description || '', body.target_date || '',
        body.status || 'active', Number(body.priority) || 3, body.notes || '', user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar meta', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_goals WHERE id = ?').bind(id).first();
    return json(row, 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleCareerGoalItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM career_goals WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Meta não encontrada' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    try {
      await env.DB.prepare(
        `UPDATE career_goals SET title=?, track=?, description=?, target_date=?, status=?,
           priority=?, notes=?, updated_at=? WHERE id=?`
      ).bind(
        pick('title', existing.title), pick('track', existing.track), pick('description', existing.description),
        pick('target_date', existing.target_date), pick('status', existing.status),
        Number(pick('priority', existing.priority)) || 3, pick('notes', existing.notes), now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar meta', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_goals WHERE id = ?').bind(id).first();
    return json(row);
  }
  if (request.method === 'DELETE') {
    try {
      await env.DB.prepare('DELETE FROM career_goals WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'Falha ao deletar meta', detail: String(e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ===========================================================================
// Eventos & Venues de Publicação (v2.5.0)
// Banco dedicado para conferências, eventos de networking e venues de
// publicação (journals/proceedings). Só owner e assistentes fixos (mesma regra
// de Mercado/Carreira). Reaproveita shapeEvent/shapeVenue para normalizar tags.
// ===========================================================================

// Mesma regra de acesso de Mercado/Carreira/Hub: só owner e assistentes fixos.
function isFixedUser(user) {
  return !!user && (user.role === 'owner' || user.role === 'assistant_fixed' || user.user_type === 'fixed');
}

function shapeEvent(r) {
  if (!r) return r;
  return {
    ...r,
    tags: parseJsonArray(r.tags),
    peer_review: !!r.peer_review,
    hybrid: !!r.hybrid,
  };
}

function shapeVenue(r) {
  if (!r) return r;
  return {
    ...r,
    tags: parseJsonArray(r.tags),
    open_access: !!r.open_access,
  };
}

// ---- Eventos ----------------------------------------------------------------

async function handleEvents(request, env, user) {
  if (!isFixedUser(user)) return json({ error: 'Restrito ao owner e assistentes fixos' }, 403);

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const type = url.searchParams.get('type');
      const area = url.searchParams.get('area');
      const status = url.searchParams.get('status');
      const phase = url.searchParams.get('phase');
      const peerReview = url.searchParams.get('peer_review');
      const search = url.searchParams.get('search');
      const upcoming = url.searchParams.get('upcoming');
      const deadlineSoon = url.searchParams.get('deadline_soon');
      const today = new Date().toISOString().split('T')[0];
      const in60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0];
      const wh = [];
      const args = [];
      if (type) { wh.push('type = ?'); args.push(type); }
      if (area) { wh.push('area = ?'); args.push(area); }
      if (status) { wh.push('status = ?'); args.push(status); }
      if (phase) { wh.push('strategic_phase = ?'); args.push(String(phase)); }
      if (peerReview === '1') { wh.push('peer_review = 1'); }
      if (search) {
        wh.push('(name LIKE ? OR acronym LIKE ? OR notes LIKE ? OR organizer LIKE ?)');
        const q = `%${search}%`;
        args.push(q, q, q, q);
      }
      if (upcoming === '1') {
        wh.push("((date_start != '' AND date_start >= ?) OR (deadline_abstract != '' AND deadline_abstract >= ?))");
        args.push(today, today);
      }
      if (deadlineSoon === '1') {
        wh.push("(deadline_abstract != '' AND deadline_abstract >= ? AND deadline_abstract <= ?)");
        args.push(today, in60);
      }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const sql =
        `SELECT * FROM career_events ${where}
          ORDER BY CASE WHEN date_start IS NULL OR date_start = '' THEN 1 ELSE 0 END,
            date_start ASC, name ASC`;
      const { results } = await env.DB.prepare(sql).bind(...args).all();
      return json((results || []).map(shapeEvent));
    } catch { return json([]); }
  }

  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name || !String(body.name).trim()) return json({ error: 'name é obrigatório' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO career_events
          (id, name, acronym, type, area, date_start, date_end, location, city, country,
           organizer, indexing, publication_route, relevance_phd, relevance_spinoff,
           relevance_networking, cost_level, peer_review, hybrid, deadline_abstract,
           deadline_paper, website, status, strategic_phase, notes, tags, opportunity_id,
           created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.name, body.acronym || '', body.type || 'conference_academic',
        body.area || 'energy_systems', body.date_start || '', body.date_end || '',
        body.location || '', body.city || '', body.country || '', body.organizer || '',
        body.indexing || '', body.publication_route || '', Number(body.relevance_phd) || 3,
        Number(body.relevance_spinoff) || 3, Number(body.relevance_networking) || 3,
        body.cost_level || 'medium', body.peer_review ? 1 : 0, body.hybrid ? 1 : 0,
        body.deadline_abstract || '', body.deadline_paper || '', body.website || '',
        body.status || 'identified', body.strategic_phase != null ? String(body.strategic_phase) : '',
        body.notes || '', JSON.stringify(body.tags || []), body.opportunity_id || null,
        user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar evento', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_events WHERE id = ?').bind(id).first();
    return json(shapeEvent(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleEventItem(request, env, user, id) {
  if (!isFixedUser(user)) return json({ error: 'Restrito ao owner e assistentes fixos' }, 403);
  if (!id) return json({ error: 'ID ausente' }, 400);

  if (request.method === 'GET') {
    try {
      const row = await env.DB.prepare('SELECT * FROM career_events WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Evento não encontrado' }, 404);
      const shaped = shapeEvent(row);
      // Venues vinculados (via event_venue_links).
      let venues = [];
      try {
        const { results } = await env.DB.prepare(
          `SELECT l.id AS link_id, l.link_type, l.notes AS link_notes, v.*
             FROM event_venue_links l
             JOIN publication_venues v ON v.id = l.venue_id
            WHERE l.event_id = ?
            ORDER BY v.name ASC`
        ).bind(id).all();
        venues = (results || []).map((r) => ({
          link_id: r.link_id,
          link_type: r.link_type,
          link_notes: r.link_notes,
          ...shapeVenue(r),
        }));
      } catch { /* tabela ausente */ }
      // Oportunidade de carreira vinculada (se houver).
      let opportunity = null;
      if (shaped.opportunity_id) {
        try {
          opportunity = await env.DB.prepare(
            'SELECT id, title, status, track FROM career_opportunities WHERE id = ?'
          ).bind(shaped.opportunity_id).first();
        } catch { /* ignore */ }
      }
      return json({ ...shaped, venues, opportunity });
    } catch (e) {
      return json({ error: 'Falha ao carregar evento', detail: String(e) }, 500);
    }
  }

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM career_events WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Evento não encontrado' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    const bool = (k, f) => (body[k] !== undefined ? (body[k] ? 1 : 0) : f);
    try {
      await env.DB.prepare(
        `UPDATE career_events SET name=?, acronym=?, type=?, area=?, date_start=?, date_end=?,
           location=?, city=?, country=?, organizer=?, indexing=?, publication_route=?,
           relevance_phd=?, relevance_spinoff=?, relevance_networking=?, cost_level=?,
           peer_review=?, hybrid=?, deadline_abstract=?, deadline_paper=?, website=?, status=?,
           strategic_phase=?, notes=?, tags=?, opportunity_id=?, updated_at=?
         WHERE id=?`
      ).bind(
        pick('name', existing.name), pick('acronym', existing.acronym), pick('type', existing.type),
        pick('area', existing.area), pick('date_start', existing.date_start),
        pick('date_end', existing.date_end), pick('location', existing.location),
        pick('city', existing.city), pick('country', existing.country),
        pick('organizer', existing.organizer), pick('indexing', existing.indexing),
        pick('publication_route', existing.publication_route),
        Number(pick('relevance_phd', existing.relevance_phd)) || 3,
        Number(pick('relevance_spinoff', existing.relevance_spinoff)) || 3,
        Number(pick('relevance_networking', existing.relevance_networking)) || 3,
        pick('cost_level', existing.cost_level), bool('peer_review', existing.peer_review),
        bool('hybrid', existing.hybrid), pick('deadline_abstract', existing.deadline_abstract),
        pick('deadline_paper', existing.deadline_paper), pick('website', existing.website),
        pick('status', existing.status),
        body.strategic_phase !== undefined ? String(body.strategic_phase) : existing.strategic_phase,
        pick('notes', existing.notes),
        body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
        body.opportunity_id !== undefined ? (body.opportunity_id || null) : existing.opportunity_id,
        now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar evento', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM career_events WHERE id = ?').bind(id).first();
    return json(shapeEvent(row));
  }

  if (request.method === 'DELETE') {
    const existing = await env.DB.prepare('SELECT id FROM career_events WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Evento não encontrado' }, 404);
    try {
      await env.DB.prepare('DELETE FROM career_events WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'Falha ao deletar evento', detail: String(e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---- Venues de Publicação ---------------------------------------------------

async function handleVenues(request, env, user) {
  if (!isFixedUser(user)) return json({ error: 'Restrito ao owner e assistentes fixos' }, 403);

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const area = url.searchParams.get('area');
      const type = url.searchParams.get('type');
      const quartile = url.searchParams.get('quartile');
      const search = url.searchParams.get('search');
      const wh = [];
      const args = [];
      if (area) { wh.push('area = ?'); args.push(area); }
      if (type) { wh.push('type = ?'); args.push(type); }
      if (quartile) { wh.push('quartile = ?'); args.push(quartile); }
      if (search) {
        wh.push('(name LIKE ? OR acronym LIKE ? OR publisher LIKE ? OR notes LIKE ?)');
        const q = `%${search}%`;
        args.push(q, q, q, q);
      }
      const where = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
      const { results } = await env.DB.prepare(
        `SELECT * FROM publication_venues ${where} ORDER BY relevance_phd DESC, name ASC`
      ).bind(...args).all();
      return json((results || []).map(shapeVenue));
    } catch { return json([]); }
  }

  if (request.method === 'POST') {
    const body = (await readJson(request)) || {};
    if (!body.name || !String(body.name).trim()) return json({ error: 'name é obrigatório' }, 400);
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO publication_venues
          (id, name, acronym, publisher, type, indexing, impact_factor, quartile, area,
           relevance_phd, open_access, website, notes, tags, created_by, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        id, body.name, body.acronym || '', body.publisher || '', body.type || 'journal',
        body.indexing || '', body.impact_factor != null && body.impact_factor !== '' ? Number(body.impact_factor) : null,
        body.quartile || '', body.area || 'energy_systems', Number(body.relevance_phd) || 3,
        body.open_access ? 1 : 0, body.website || '', body.notes || '',
        JSON.stringify(body.tags || []), user.id, now, now
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao criar venue', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM publication_venues WHERE id = ?').bind(id).first();
    return json(shapeVenue(row), 201);
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleVenueItem(request, env, user, id) {
  if (!isFixedUser(user)) return json({ error: 'Restrito ao owner e assistentes fixos' }, 403);
  if (!id) return json({ error: 'ID ausente' }, 400);

  if (request.method === 'GET') {
    try {
      const row = await env.DB.prepare('SELECT * FROM publication_venues WHERE id = ?').bind(id).first();
      if (!row) return json({ error: 'Venue não encontrado' }, 404);
      // Eventos vinculados (via event_venue_links).
      let events = [];
      try {
        const { results } = await env.DB.prepare(
          `SELECT l.id AS link_id, l.link_type, e.id, e.name, e.acronym, e.date_start, e.status
             FROM event_venue_links l
             JOIN career_events e ON e.id = l.event_id
            WHERE l.venue_id = ?
            ORDER BY e.date_start ASC`
        ).bind(id).all();
        events = results || [];
      } catch { /* tabela ausente */ }
      return json({ ...shapeVenue(row), events });
    } catch (e) {
      return json({ error: 'Falha ao carregar venue', detail: String(e) }, 500);
    }
  }

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const existing = await env.DB.prepare('SELECT * FROM publication_venues WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Venue não encontrado' }, 404);
    const now = Math.floor(Date.now() / 1000);
    const pick = (k, f) => (body[k] !== undefined ? body[k] : f);
    try {
      await env.DB.prepare(
        `UPDATE publication_venues SET name=?, acronym=?, publisher=?, type=?, indexing=?,
           impact_factor=?, quartile=?, area=?, relevance_phd=?, open_access=?, website=?,
           notes=?, tags=?, updated_at=? WHERE id=?`
      ).bind(
        pick('name', existing.name), pick('acronym', existing.acronym),
        pick('publisher', existing.publisher), pick('type', existing.type),
        pick('indexing', existing.indexing),
        body.impact_factor !== undefined
          ? (body.impact_factor === '' || body.impact_factor === null ? null : Number(body.impact_factor))
          : existing.impact_factor,
        pick('quartile', existing.quartile), pick('area', existing.area),
        Number(pick('relevance_phd', existing.relevance_phd)) || 3,
        body.open_access !== undefined ? (body.open_access ? 1 : 0) : existing.open_access,
        pick('website', existing.website), pick('notes', existing.notes),
        body.tags !== undefined ? JSON.stringify(body.tags) : existing.tags,
        now, id
      ).run();
    } catch (e) {
      return json({ error: 'Falha ao atualizar venue', detail: String(e) }, 500);
    }
    const row = await env.DB.prepare('SELECT * FROM publication_venues WHERE id = ?').bind(id).first();
    return json(shapeVenue(row));
  }

  if (request.method === 'DELETE') {
    const existing = await env.DB.prepare('SELECT id FROM publication_venues WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Venue não encontrado' }, 404);
    try {
      await env.DB.prepare('DELETE FROM publication_venues WHERE id = ?').bind(id).run();
      return json({ ok: true });
    } catch (e) {
      return json({ error: 'Falha ao deletar venue', detail: String(e) }, 500);
    }
  }
  return json({ error: 'Método não permitido' }, 405);
}

// ---- Vínculos evento ↔ venue ------------------------------------------------

async function handleEventVenues(request, env, user, eventId) {
  if (!isFixedUser(user)) return json({ error: 'Restrito ao owner e assistentes fixos' }, 403);
  if (!eventId) return json({ error: 'ID do evento ausente' }, 400);
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const body = (await readJson(request)) || {};
  if (!body.venue_id) return json({ error: 'venue_id é obrigatório' }, 400);
  // Valida existência do evento e do venue.
  const ev = await env.DB.prepare('SELECT id FROM career_events WHERE id = ?').bind(eventId).first();
  if (!ev) return json({ error: 'Evento não encontrado' }, 404);
  const vn = await env.DB.prepare('SELECT id FROM publication_venues WHERE id = ?').bind(body.venue_id).first();
  if (!vn) return json({ error: 'Venue não encontrado' }, 404);
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      `INSERT INTO event_venue_links (id, event_id, venue_id, link_type, notes, created_at)
       VALUES (?,?,?,?,?,?)`
    ).bind(id, eventId, body.venue_id, body.link_type || 'proceedings', body.notes || '', now).run();
  } catch (e) {
    return json({ error: 'Falha ao vincular venue', detail: String(e) }, 500);
  }
  const row = await env.DB.prepare('SELECT * FROM event_venue_links WHERE id = ?').bind(id).first();
  return json(row, 201);
}

async function handleEventVenueLinkItem(request, env, user, eventId, linkId) {
  if (!isFixedUser(user)) return json({ error: 'Restrito ao owner e assistentes fixos' }, 403);
  if (!linkId) return json({ error: 'ID do vínculo ausente' }, 400);
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  try {
    await env.DB.prepare('DELETE FROM event_venue_links WHERE id = ? AND event_id = ?').bind(linkId, eventId).run();
    return json({ ok: true });
  } catch (e) {
    return json({ error: 'Falha ao remover vínculo', detail: String(e) }, 500);
  }
}

// ---- Importação em massa de eventos + venues --------------------------------
// Dedup: eventos por (name + date_start); venues por name. Resolve venue_links
// por acronym. Registra em events_import_log.

async function handleEventsImport(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!isFixedUser(user)) return json({ error: 'Sem permissão para importação em massa' }, 403);

  const body = (await readJson(request)) || {};
  const now = Math.floor(Date.now() / 1000);
  let eventsImported = 0;
  let venuesImported = 0;
  const errors = [];

  // Mapas acronym(lowercase) → id para resolver os vínculos ao final. Começa com
  // o que já existe no banco (permite reimportação incremental de vínculos).
  const eventByAcronym = new Map();
  const venueByAcronym = new Map();
  try {
    const { results } = await env.DB.prepare('SELECT id, acronym FROM career_events').all();
    for (const e of (results || [])) {
      if (e.acronym) eventByAcronym.set(e.acronym.trim().toLowerCase(), e.id);
    }
  } catch { /* tabela ausente */ }
  try {
    const { results } = await env.DB.prepare('SELECT id, acronym FROM publication_venues').all();
    for (const v of (results || [])) {
      if (v.acronym) venueByAcronym.set(v.acronym.trim().toLowerCase(), v.id);
    }
  } catch { /* tabela ausente */ }

  // --- Venues (dedup por name) ---
  for (const v of (body.publication_venues || [])) {
    try {
      const name = (v.name || '').trim();
      if (!name) { errors.push({ kind: 'venue', item: '(sem nome)', error: 'name vazio' }); continue; }
      const existing = await env.DB.prepare('SELECT id FROM publication_venues WHERE name = ? LIMIT 1').bind(name).first();
      let vid = existing ? existing.id : null;
      if (!vid) {
        vid = v.id || crypto.randomUUID();
        await env.DB.prepare(
          `INSERT OR IGNORE INTO publication_venues
            (id, name, acronym, publisher, type, indexing, impact_factor, quartile, area,
             relevance_phd, open_access, website, notes, tags, created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          vid, name, v.acronym || '', v.publisher || '', v.type || 'journal',
          v.indexing || '', v.impact_factor != null && v.impact_factor !== '' ? Number(v.impact_factor) : null,
          v.quartile || '', v.area || 'energy_systems', Number(v.relevance_phd) || 3,
          v.open_access ? 1 : 0, v.website || '', v.notes || '',
          JSON.stringify(v.tags || []), user.id, now, now
        ).run();
        venuesImported += 1;
      }
      if (v.acronym) venueByAcronym.set(v.acronym.trim().toLowerCase(), vid);
    } catch (e) {
      errors.push({ kind: 'venue', item: v && v.name, error: String(e) });
    }
  }

  // --- Eventos (dedup por name + date_start) ---
  for (const ev of (body.events || [])) {
    try {
      const name = (ev.name || '').trim();
      if (!name) { errors.push({ kind: 'event', item: '(sem nome)', error: 'name vazio' }); continue; }
      const ds = ev.date_start || '';
      const existing = await env.DB.prepare(
        'SELECT id FROM career_events WHERE name = ? AND date_start = ? LIMIT 1'
      ).bind(name, ds).first();
      let eid = existing ? existing.id : null;
      if (!eid) {
        eid = ev.id || crypto.randomUUID();
        await env.DB.prepare(
          `INSERT OR IGNORE INTO career_events
            (id, name, acronym, type, area, date_start, date_end, location, city, country,
             organizer, indexing, publication_route, relevance_phd, relevance_spinoff,
             relevance_networking, cost_level, peer_review, hybrid, deadline_abstract,
             deadline_paper, website, status, strategic_phase, notes, tags, opportunity_id,
             created_by, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).bind(
          eid, name, ev.acronym || '', ev.type || 'conference_academic',
          ev.area || 'energy_systems', ds, ev.date_end || '', ev.location || '',
          ev.city || '', ev.country || '', ev.organizer || '', ev.indexing || '',
          ev.publication_route || '', Number(ev.relevance_phd) || 3,
          Number(ev.relevance_spinoff) || 3, Number(ev.relevance_networking) || 3,
          ev.cost_level || 'medium', ev.peer_review ? 1 : 0, ev.hybrid ? 1 : 0,
          ev.deadline_abstract || '', ev.deadline_paper || '', ev.website || '',
          ev.status || 'identified', ev.strategic_phase != null ? String(ev.strategic_phase) : '',
          ev.notes || '', JSON.stringify(ev.tags || []), ev.opportunity_id || null,
          user.id, now, now
        ).run();
        eventsImported += 1;
      }
      if (ev.acronym) eventByAcronym.set(ev.acronym.trim().toLowerCase(), eid);
    } catch (e) {
      errors.push({ kind: 'event', item: ev && ev.name, error: String(e) });
    }
  }

  // --- Vínculos evento ↔ venue (resolvidos por acronym) ---
  for (const link of (body.venue_links || [])) {
    try {
      const ek = (link.event_acronym || '').trim().toLowerCase();
      const vk = (link.venue_acronym || '').trim().toLowerCase();
      const eid = eventByAcronym.get(ek);
      const vid = venueByAcronym.get(vk);
      if (!eid || !vid) {
        errors.push({ kind: 'link', item: `${link.event_acronym} → ${link.venue_acronym}`, error: 'acronym não resolvido' });
        continue;
      }
      // Evita vínculo duplicado.
      const dup = await env.DB.prepare(
        'SELECT id FROM event_venue_links WHERE event_id = ? AND venue_id = ? LIMIT 1'
      ).bind(eid, vid).first();
      if (dup) continue;
      await env.DB.prepare(
        `INSERT INTO event_venue_links (id, event_id, venue_id, link_type, notes, created_at)
         VALUES (?,?,?,?,?,?)`
      ).bind(crypto.randomUUID(), eid, vid, link.link_type || 'proceedings', link.notes || '', now).run();
    } catch (e) {
      errors.push({ kind: 'link', item: `${link.event_acronym} → ${link.venue_acronym}`, error: String(e) });
    }
  }

  // Log da importação.
  try {
    await env.DB.prepare(
      `INSERT INTO events_import_log
        (id, source_description, events_imported, venues_imported, imported_by, imported_at)
       VALUES (?,?,?,?,?,?)`
    ).bind(crypto.randomUUID(), body.source_description || '', eventsImported, venuesImported, user.id, now).run();
  } catch { /* best-effort */ }

  return json({ events_imported: eventsImported, venues_imported: venuesImported, errors });
}

// ---------------------------------------------------------------------------
// Drive-backed attachments for notes and tasks (drag&drop uploads + links to
// existing files). Uploads land in AIDE_SUPPORT/NOTAS/<noteId>/ or
// AIDE_SUPPORT/TAREFAS/<taskId>/. "Link" mode just stores a reference in the
// {note,task}_drive_links table — no Drive upload happens.
// ---------------------------------------------------------------------------

const ATTACHMENT_FOLDERS = { note: 'NOTAS', task: 'TAREFAS', market_org: 'MERCADO' };
const ATTACHMENT_TABLES = { note: 'note_drive_links', task: 'task_drive_links', market_org: 'market_org_drive_links' };
const ATTACHMENT_FK = { note: 'note_id', task: 'task_id', market_org: 'org_id' };

async function entityFolderId(kind, entityId, ownerId, env) {
  const root = await findOrCreateDriveFolder('AIDE_SUPPORT', 'root', ownerId, env);
  const bucket = await findOrCreateDriveFolder(ATTACHMENT_FOLDERS[kind], root, ownerId, env);
  return findOrCreateDriveFolder(entityId, bucket, ownerId, env);
}

function shapeAttachmentRow(r) {
  return {
    fileId: r.google_file_id,
    id: r.google_file_id,
    name: r.name,
    mimeType: r.mime_type || '',
    webViewLink: r.web_view_link || null,
    iconLink: r.icon_link || null,
    thumbnailLink: null, // links only carry the basics — frontend falls back to iconLink
    isUpload: !!r.is_upload,
    isLink: !r.is_upload,
    linkId: r.id,
    createdAt: r.created_at
  };
}

async function handleAttachmentFiles(request, env, user, kind, entityId) {
  if (!entityId) return json({ error: 'ID ausente' }, 400);
  // v2.1 granular: uploads go through Drive — gate behind drive.upload.
  // Notes uploading images also requires notes.add_images.
  if (request.method === 'POST') {
    if (!canDo(user.granular, 'drive', 'upload')) {
      return json({ error: 'Sem permissão para enviar arquivos ao Drive' }, 403);
    }
    if (kind === 'note' && !canDo(user.granular, 'notes', 'add_images')) {
      return json({ error: 'Sem permissão para anexar arquivos a notas' }, 403);
    }
  }
  const table = ATTACHMENT_TABLES[kind];
  const fk = ATTACHMENT_FK[kind];
  const { ownerId } = await getRoleUsers(env);
  if (!ownerId) return json({ error: 'Proprietário não encontrado' }, 500);

  if (request.method === 'GET') {
    // Drive-side files
    let driveFiles = [];
    try {
      const folderId = await entityFolderId(kind, entityId, ownerId, env);
      const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
      const resp = await googleFetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,webViewLink,thumbnailLink,iconLink,webContentLink,createdTime)&orderBy=createdTime desc`,
        ownerId, env
      );
      if (resp && resp.ok) {
        const data = await resp.json();
        driveFiles = (data.files || []).map((f) => ({
          fileId: f.id,
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          webViewLink: f.webViewLink || null,
          thumbnailLink: f.thumbnailLink || null,
          iconLink: f.iconLink || null,
          isUpload: true,
          isLink: false,
          linkId: null,
          createdAt: f.createdTime ? Math.floor(new Date(f.createdTime).getTime() / 1000) : null
        }));
      }
    } catch { /* folder doesn't exist yet → no uploads */ }

    // Linked files
    let links = [];
    try {
      const r = await env.DB.prepare(
        `SELECT * FROM ${table} WHERE ${fk} = ? AND is_upload = 0 ORDER BY created_at DESC`
      ).bind(entityId).all();
      links = (r.results || []).map(shapeAttachmentRow);
    } catch { /* table missing — skip */ }

    return json([...driveFiles, ...links]);
  }

  if (request.method === 'POST') {
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'Envie multipart/form-data com um campo "file"' }, 400);
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return json({ error: 'Campo "file" ausente ou inválido' }, 400);
    }
    const folderId = await entityFolderId(kind, entityId, ownerId, env);
    const buffer = await file.arrayBuffer();
    const boundary = '----AIDEUpload' + crypto.randomUUID();
    const metadata = {
      name: file.name || `file-${Date.now()}`,
      parents: [folderId],
      mimeType: file.type || 'application/octet-stream'
    };
    const enc = new TextEncoder();
    const head = enc.encode(
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify(metadata) + `\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${metadata.mimeType}\r\n\r\n`
    );
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.byteLength + buffer.byteLength + tail.byteLength);
    body.set(head, 0);
    body.set(new Uint8Array(buffer), head.byteLength);
    body.set(tail, head.byteLength + buffer.byteLength);

    const resp = await googleFetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,thumbnailLink,iconLink,webContentLink',
      ownerId, env,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
    );
    const guard = googleGuard(resp);
    if (guard) return guard;
    if (!resp.ok) return json({ error: 'google_error', detail: await resp.text() }, 502);
    const f = await resp.json();
    return json({
      fileId: f.id, id: f.id, name: f.name, mimeType: f.mimeType,
      webViewLink: f.webViewLink || null, thumbnailLink: f.thumbnailLink || null,
      iconLink: f.iconLink || null, isUpload: true, isLink: false
    }, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleAttachmentLink(request, env, user, kind, entityId) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  if (!entityId) return json({ error: 'ID ausente' }, 400);
  const body = (await readJson(request)) || {};
  if (!body.googleFileId || !body.name) {
    return json({ error: 'googleFileId e name são obrigatórios' }, 400);
  }
  const table = ATTACHMENT_TABLES[kind];
  const fk = ATTACHMENT_FK[kind];
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO ${table} (id, ${fk}, google_file_id, name, mime_type, web_view_link, icon_link, is_upload, created_by, created_at)
       VALUES (?,?,?,?,?,?,?,0,?,?)`
    ).bind(
      id, entityId, body.googleFileId, body.name, body.mimeType || '',
      body.webViewLink || '', body.iconLink || '', user.id, Math.floor(Date.now() / 1000)
    ).run();
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/no such table/i.test(msg)) {
      return json({ error: 'Migração 0016 não aplicada', detail: msg }, 503);
    }
    return json({ error: 'Falha ao vincular arquivo', detail: msg }, 500);
  }
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  return json(shapeAttachmentRow(row), 201);
}

async function handleAttachmentItem(request, env, user, kind, entityId, fileId) {
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  if (!entityId || !fileId) return json({ error: 'IDs ausentes' }, 400);
  if (!canDo(user.granular, 'drive', 'delete')) {
    return json({ error: 'Sem permissão para deletar arquivos' }, 403);
  }
  const table = ATTACHMENT_TABLES[kind];
  const fk = ATTACHMENT_FK[kind];

  // If this fileId is a link (not an upload), just remove the link.
  let linkRow = null;
  try {
    linkRow = await env.DB.prepare(
      `SELECT * FROM ${table} WHERE ${fk} = ? AND google_file_id = ? AND is_upload = 0`
    ).bind(entityId, fileId).first();
  } catch { /* table missing */ }
  if (linkRow) {
    await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(linkRow.id).run();
    return json({ ok: true, removed: 'link' });
  }

  // Otherwise it's an uploaded file — delete from Drive.
  const { ownerId } = await getRoleUsers(env);
  if (!ownerId) return json({ error: 'Proprietário não encontrado' }, 500);
  const resp = await googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
    ownerId, env, { method: 'DELETE' }
  );
  const guard = googleGuard(resp);
  if (guard) return guard;
  if (!resp.ok && resp.status !== 404 && resp.status !== 410) {
    return json({ error: 'google_error', detail: await resp.text() }, 502);
  }
  return json({ ok: true, removed: 'upload' });
}

// ---------------------------------------------------------------------------
// Networking v2 — multiple roles + AIDE entity links + full graph dump
// ---------------------------------------------------------------------------

async function fetchRolesForPeople(env, peopleIds) {
  if (peopleIds.length === 0) return {};
  let rows = [];
  try {
    const placeholders = peopleIds.map(() => '?').join(',');
    const r = await env.DB.prepare(
      `SELECT r.*, i.name AS institution_lookup_name
       FROM person_roles r
       LEFT JOIN market_organizations i ON r.institution_id = i.id
       WHERE r.person_id IN (${placeholders})`
    ).bind(...peopleIds).all();
    rows = r.results || [];
  } catch { return {}; }
  const m = {};
  for (const r of rows) {
    if (!m[r.person_id]) m[r.person_id] = [];
    m[r.person_id].push({
      id: r.id,
      role: r.role,
      institution_id: r.institution_id || null,
      institution_name: r.institution_lookup_name || r.institution_name || '',
      start_date: r.start_date || '',
      end_date: r.end_date || '',
      current: !!r.current
    });
  }
  return m;
}

async function fetchEntityLinksFor(env, peopleIds, institutionIds) {
  let rows = [];
  try {
    const conds = [];
    const binds = [];
    if (peopleIds.length) {
      conds.push(`network_person_id IN (${peopleIds.map(() => '?').join(',')})`);
      binds.push(...peopleIds);
    }
    if (institutionIds.length) {
      conds.push(`network_institution_id IN (${institutionIds.map(() => '?').join(',')})`);
      binds.push(...institutionIds);
    }
    if (conds.length === 0) return { byPerson: {}, byInstitution: {} };
    const r = await env.DB.prepare(
      `SELECT * FROM network_entity_links WHERE ${conds.join(' OR ')}`
    ).bind(...binds).all();
    rows = r.results || [];
  } catch { return { byPerson: {}, byInstitution: {} }; }
  const byPerson = {};
  const byInstitution = {};
  for (const r of rows) {
    const shaped = {
      id: r.id,
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      entity_name: r.entity_name || '',
      notes: r.notes || ''
    };
    if (r.network_person_id) {
      if (!byPerson[r.network_person_id]) byPerson[r.network_person_id] = [];
      byPerson[r.network_person_id].push(shaped);
    }
    if (r.network_institution_id) {
      if (!byInstitution[r.network_institution_id]) byInstitution[r.network_institution_id] = [];
      byInstitution[r.network_institution_id].push(shaped);
    }
  }
  return { byPerson, byInstitution };
}

async function fetchConnectionsForPeople(env, peopleIds) {
  if (peopleIds.length === 0) return {};
  let rows = [];
  try {
    const placeholders = peopleIds.map(() => '?').join(',');
    const r = await env.DB.prepare(
      `SELECT c.*, pa.name AS person_a_name, pb.name AS person_b_name
       FROM network_connections c
       LEFT JOIN network_people pa ON c.person_a_id = pa.id
       LEFT JOIN network_people pb ON c.person_b_id = pb.id
       WHERE c.person_a_id IN (${placeholders}) OR c.person_b_id IN (${placeholders})`
    ).bind(...peopleIds, ...peopleIds).all();
    rows = r.results || [];
  } catch { return {}; }
  const m = {};
  for (const r of rows) {
    const fromA = (pid, otherId, otherName) => {
      if (!m[pid]) m[pid] = [];
      m[pid].push({
        id: r.id,
        other_id: otherId,
        other_name: otherName,
        connection_type: r.connection_type || '',
        description: r.description || ''
      });
    };
    fromA(r.person_a_id, r.person_b_id, r.person_b_name);
    fromA(r.person_b_id, r.person_a_id, r.person_a_name);
  }
  return m;
}

// Hydrate the existing shapeNetworkPerson with roles/entity_links/connections.
// Falls back to the bare shape if any auxiliary table is missing.
async function hydratePeople(env, rows) {
  const people = rows.map(shapeNetworkPerson);
  const ids = people.map((p) => p.id);
  const [rolesByPerson, linksMap, connsByPerson, tempByPerson] = await Promise.all([
    fetchRolesForPeople(env, ids),
    fetchEntityLinksFor(env, ids, []),
    fetchConnectionsForPeople(env, ids),
    fetchTemperatures(env, ids)
  ]);
  return people.map((p) => ({
    ...p,
    roles: rolesByPerson[p.id] || [],
    entity_links: linksMap.byPerson[p.id] || [],
    connections: connsByPerson[p.id] || [],
    // Temperatura do contato pela última interação; 'never' se nenhuma.
    temperature: tempByPerson[p.id] || 'never'
  }));
}

async function persistPersonRoles(env, personId, roles) {
  await env.DB.prepare('DELETE FROM person_roles WHERE person_id = ?').bind(personId).run().catch(() => {});
  for (const r of (roles || [])) {
    if (!r || !r.role) continue;
    try {
      await env.DB.prepare(
        `INSERT INTO person_roles (id, person_id, role, institution_id, institution_name, start_date, end_date, current, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).bind(
        crypto.randomUUID(), personId, String(r.role).trim(),
        r.institution_id || null, r.institution_name || '',
        r.start_date || '', r.end_date || '',
        r.current === false ? 0 : 1, Math.floor(Date.now() / 1000)
      ).run();
    } catch { /* table missing or row invalid — skip silently */ }
  }
}

async function persistEntityLinks(env, { personId, institutionId }, links) {
  if (personId) {
    await env.DB.prepare('DELETE FROM network_entity_links WHERE network_person_id = ?').bind(personId).run().catch(() => {});
  }
  if (institutionId) {
    await env.DB.prepare('DELETE FROM network_entity_links WHERE network_institution_id = ?').bind(institutionId).run().catch(() => {});
  }
  for (const l of (links || [])) {
    if (!l || !l.entity_type || !l.entity_id) continue;
    try {
      await env.DB.prepare(
        `INSERT INTO network_entity_links
          (id, network_person_id, network_institution_id, entity_type, entity_id, entity_name, notes, created_at)
         VALUES (?,?,?,?,?,?,?,?)`
      ).bind(
        crypto.randomUUID(), personId || null, institutionId || null,
        l.entity_type, l.entity_id, l.entity_name || '', l.notes || '',
        Math.floor(Date.now() / 1000)
      ).run();
    } catch { /* skip */ }
  }
}

async function handleNetworkRoutes(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  // v2.1.1 — GET fails open: empty graph payload for unauthorized users.
  if (!requirePermission(user, 'networking', 'view')) {
    return json({ people: [], institutions: [], connections: [], person_roles: [] });
  }
  let peopleRows = [];
  // Consolidação v2.4: instituições foram unificadas em market_organizations.
  // /api/network/routes não lê mais network_institutions; o array segue no payload
  // (vazio) por compatibilidade de forma. As funções de pessoas (person_roles) já
  // resolvem o nome via JOIN em market_organizations (fetchRolesForPeople).
  const institutions = [];
  let connections = [];
  try {
    const r = await env.DB.prepare('SELECT * FROM network_people ORDER BY name').all();
    peopleRows = r.results || [];
  } catch { /* missing table */ }
  try {
    const r = await env.DB.prepare('SELECT * FROM network_connections').all();
    connections = r.results || [];
  } catch { /* missing */ }
  const people = await hydratePeople(env, peopleRows);
  // Flatten roles for graph rendering
  const person_roles = [];
  for (const p of people) {
    for (const r of p.roles || []) {
      person_roles.push({
        person_id: p.id,
        person_name: p.name,
        role: r.role,
        institution_id: r.institution_id,
        institution_name: r.institution_name,
        current: r.current
      });
    }
  }
  // v2.5.5 — vínculos pessoa↔organização vindos do Mercado (contact_org_links).
  // Segunda fonte de links institucionais no mapa, além de person_roles. Já vem
  // com nomes resolvidos por JOIN para o mapa e para depuração.
  let contactOrgLinks = [];
  try {
    const r = await env.DB.prepare(
      `SELECT col.person_id, col.organization_id, col.role_at_org,
              np.name AS person_name, mo.name AS org_name
         FROM contact_org_links col
         JOIN network_people np ON np.id = col.person_id
         JOIN market_organizations mo ON mo.id = col.organization_id`
    ).all();
    contactOrgLinks = r.results || [];
  } catch { /* tabela ausente — segue sem essa fonte */ }
  return json({ people, institutions, connections, person_roles, contactOrgLinks });
}

// ---------------------------------------------------------------------------
// User management (owner-only) — multi-user admin (v1.10)
// ---------------------------------------------------------------------------

// Hydrates a users row with preset/overrides metadata + resolved permissions.
async function shapeAdminUser(env, row) {
  if (!row) return null;
  let preset_id = null;
  let overrides = null;
  try {
    const up = await env.DB.prepare(
      'SELECT preset_id, overrides FROM user_permissions WHERE user_id = ?'
    ).bind(row.id).first();
    if (up) {
      preset_id = up.preset_id || null;
      try { overrides = JSON.parse(up.overrides || '{}'); } catch { overrides = {}; }
    }
  } catch { /* user_permissions not migrated */ }
  const permissions = await resolvePermissions(row.id, env);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    display_name: row.display_name || '',
    avatar: row.avatar,
    role: row.role,
    user_type: row.user_type || null,
    status: row.status || 'active',
    last_seen_at: row.last_seen_at || null,
    archived_at: row.archived_at || null,
    invited_by: row.invited_by || null,
    approved_at: row.approved_at || null,
    timezone: row.timezone || null,
    preset_id,
    overrides,
    permissions,
  };
}

async function handleUsersAll(request, env, user) {
  if (user.role !== 'owner') return json({ error: 'Apenas owner' }, 403);
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  let results = [];
  try {
    const r = await env.DB.prepare('SELECT * FROM users ORDER BY role DESC, name').all();
    results = r.results || [];
  } catch (e) {
    return json({ error: 'Falha ao listar usuários', detail: String(e) }, 500);
  }
  const out = [];
  for (const u of results) out.push(await shapeAdminUser(env, u));
  return json(out);
}

async function handleUsersPending(request, env, user) {
  if (user.role !== 'owner') return json({ error: 'Apenas owner' }, 403);
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC"
    ).all();
    const out = [];
    for (const u of results || []) out.push(await shapeAdminUser(env, u));
    return json(out);
  } catch (e) {
    return json({ error: 'Falha ao listar pendentes', detail: String(e) }, 500);
  }
}

async function handleUserAction(request, env, user, targetUserId, action) {
  if (user.role !== 'owner') return json({ error: 'Apenas owner' }, 403);
  if (!targetUserId) return json({ error: 'ID ausente' }, 400);
  switch (action) {
    case 'approve':              return handleUserApprove(request, env, user, targetUserId);
    case 'role':                 return handleUserRole(request, env, user, targetUserId);
    case 'permissions':          return handleUserPermissions(request, env, user, targetUserId);
    case 'archive':              return handleUserArchive(request, env, user, targetUserId);
    case 'granular-permissions': return handleUserGranularPermissions(request, env, user, targetUserId);
    default:                     return json({ error: 'Ação desconhecida' }, 404);
  }
}

async function handleUserApprove(request, env, user, targetUserId) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
  if (!target) return json({ error: 'Usuário não encontrado' }, 404);
  const now = Math.floor(Date.now() / 1000);
  try {
    await env.DB.prepare(
      "UPDATE users SET status = 'active', approved_at = ?, invited_by = ? WHERE id = ?"
    ).bind(now, user.id, targetUserId).run();
  } catch (e) {
    return json({ error: 'Falha ao aprovar', detail: String(e) }, 500);
  }
  // Bind the default preset based on user_type. Don't overwrite an existing
  // bind so manual permission edits survive a re-approve.
  const presetId = (target.user_type === 'external') ? 'preset_external' : 'preset_fixed';
  try {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO user_permissions (user_id, preset_id, updated_at, updated_by)
       VALUES (?, ?, ?, ?)`
    ).bind(targetUserId, presetId, now, user.id).run();
  } catch { /* user_permissions not migrated */ }
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
  return json(await shapeAdminUser(env, fresh));
}

async function handleUserRole(request, env, user, targetUserId) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  const body = (await readJson(request)) || {};
  const allowedRoles = ['owner', 'assistant_fixed', 'assistant_external', 'pending'];
  const allowedTypes = ['fixed', 'external'];
  if (!allowedRoles.includes(body.role)) {
    return json({ error: 'role inválido', allowed: allowedRoles }, 400);
  }
  const userType = body.user_type && allowedTypes.includes(body.user_type)
    ? body.user_type
    : (body.role === 'assistant_external' ? 'external' : 'fixed');
  try {
    await env.DB.prepare(
      'UPDATE users SET role = ?, user_type = ? WHERE id = ?'
    ).bind(body.role, userType, targetUserId).run();
  } catch (e) {
    return json({ error: 'Falha ao atualizar role', detail: String(e) }, 500);
  }
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
  if (!fresh) return json({ error: 'Usuário não encontrado' }, 404);
  return json(await shapeAdminUser(env, fresh));
}

async function handleUserPermissions(request, env, user, targetUserId) {
  if (request.method === 'GET') {
    let upRow = null;
    try {
      upRow = await env.DB.prepare(
        'SELECT preset_id, overrides FROM user_permissions WHERE user_id = ?'
      ).bind(targetUserId).first();
    } catch { /* table missing */ }
    let presetRow = null;
    if (upRow && upRow.preset_id) {
      try {
        presetRow = await env.DB.prepare(
          'SELECT * FROM permission_presets WHERE id = ?'
        ).bind(upRow.preset_id).first();
      } catch { /* missing */ }
    }
    let overrides = {};
    try { overrides = JSON.parse((upRow && upRow.overrides) || '{}'); } catch { overrides = {}; }
    let presetPerms = {};
    if (presetRow) {
      try { presetPerms = JSON.parse(presetRow.permissions || '{}'); } catch { presetPerms = {}; }
    }
    const resolved = await resolvePermissions(targetUserId, env);
    return json({
      preset: presetRow ? { id: presetRow.id, name: presetRow.name, permissions: presetPerms } : null,
      overrides,
      resolved,
    });
  }
  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const presetId = body.preset_id !== undefined ? (body.preset_id || null) : null;
    const overridesJson = JSON.stringify(body.overrides || {});
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO user_permissions (user_id, preset_id, overrides, updated_at, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           preset_id = excluded.preset_id,
           overrides = excluded.overrides,
           updated_at = excluded.updated_at,
           updated_by = excluded.updated_by`
      ).bind(targetUserId, presetId, overridesJson, now, user.id).run();
    } catch (e) {
      return json({ error: 'Falha ao salvar permissões', detail: String(e) }, 500);
    }
    const resolved = await resolvePermissions(targetUserId, env);
    return json({ ok: true, resolved });
  }
  return json({ error: 'Método não permitido' }, 405);
}

async function handleUserArchive(request, env, user, targetUserId) {
  if (request.method !== 'PUT') return json({ error: 'Método não permitido' }, 405);
  if (targetUserId === user.id) {
    return json({ error: 'Você não pode arquivar a si mesmo' }, 400);
  }
  const target = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(targetUserId).first();
  if (!target) return json({ error: 'Usuário não encontrado' }, 404);
  const now = Math.floor(Date.now() / 1000);

  // Pre-archival stats — preserved in user_profiles_archive so the historical
  // identity survives the soft-delete.
  let totalTasksCompleted = 0;
  try {
    const r = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM tasks WHERE assigned_to = ? AND status = 'done'"
    ).bind(targetUserId).first();
    totalTasksCompleted = (r && r.n) || 0;
  } catch { /* tasks query failed */ }

  let totalHoursWorked = 0;
  try {
    const r = await env.DB.prepare(
      'SELECT COALESCE(SUM(duration_seconds), 0) AS s FROM time_entries WHERE user_id = ?'
    ).bind(targetUserId).first();
    totalHoursWorked = ((r && r.s) || 0) / 3600;
  } catch { /* time_entries query failed */ }

  let totalPaid = 0;
  try {
    const r = await env.DB.prepare(
      'SELECT COALESCE(SUM(duration_seconds * hourly_rate / 3600.0), 0) AS s FROM time_entries WHERE user_id = ? AND paid = 1'
    ).bind(targetUserId).first();
    totalPaid = (r && r.s) || 0;
  } catch { /* paid query failed */ }

  try {
    await env.DB.prepare(
      `INSERT INTO user_profiles_archive
         (user_id, email, name, avatar, user_type, total_tasks_completed,
          total_hours_worked, total_paid, first_seen_at, last_seen_at,
          archived_at, archived_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         email = excluded.email, name = excluded.name, avatar = excluded.avatar,
         user_type = excluded.user_type,
         total_tasks_completed = excluded.total_tasks_completed,
         total_hours_worked = excluded.total_hours_worked,
         total_paid = excluded.total_paid,
         last_seen_at = excluded.last_seen_at,
         archived_at = excluded.archived_at,
         archived_by = excluded.archived_by`
    ).bind(
      target.id, target.email, target.name || '', target.avatar || '',
      target.user_type || 'fixed',
      totalTasksCompleted,
      Math.round(totalHoursWorked * 100) / 100,
      Math.round(totalPaid * 100) / 100,
      target.created_at || null, target.last_seen_at || null,
      now, user.id
    ).run();
  } catch { /* archive table missing — soft-delete proceeds anyway */ }

  try {
    await env.DB.prepare(
      "UPDATE users SET status = 'archived', archived_at = ? WHERE id = ?"
    ).bind(now, targetUserId).run();
  } catch (e) {
    return json({ error: 'Falha ao arquivar', detail: String(e) }, 500);
  }
  // Wipe sessions so the archived user immediately loses access.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetUserId).run().catch(() => {});
  return json({ archived: true, user_id: targetUserId, archived_at: now });
}

// GET    /api/users/:id/granular-permissions → { preset, presetPerms, userOverrides, resolved }
// PUT    /api/users/:id/granular-permissions → upsert one (feature, action, allowed) row
// DELETE /api/users/:id/granular-permissions → remove override (revert to preset)
async function handleUserGranularPermissions(request, env, user, targetUserId) {
  if (request.method === 'GET') {
    let presetId = 'preset_external';
    try {
      const up = await env.DB.prepare(
        'SELECT preset_id FROM user_permissions WHERE user_id = ?'
      ).bind(targetUserId).first();
      if (up && up.preset_id) presetId = up.preset_id;
    } catch { /* user_permissions missing */ }
    let presetPerms = [];
    let userOverrides = [];
    try {
      const r = await env.DB.prepare(
        'SELECT feature, action, allowed FROM preset_granular_permissions WHERE preset_id = ?'
      ).bind(presetId).all();
      presetPerms = r.results || [];
    } catch { /* table missing */ }
    try {
      const r = await env.DB.prepare(
        'SELECT feature, action, allowed FROM granular_permissions WHERE user_id = ?'
      ).bind(targetUserId).all();
      userOverrides = r.results || [];
    } catch { /* table missing */ }
    const resolved = await resolveGranularPermissions(targetUserId, env);
    return json({ preset: presetId, presetPerms, userOverrides, resolved });
  }

  if (request.method === 'PUT') {
    const body = (await readJson(request)) || {};
    const now = Math.floor(Date.now() / 1000);

    // Modo LOTE (novo): { permissions: [{feature, action, allowed}, ...] }.
    // Salva TODAS as caixas numa ÚNICA requisição/transação (env.DB.batch),
    // eliminando a corrida de dezenas de requests concorrentes que fazia algumas
    // permissões não persistirem (bug das permissões granulares).
    if (Array.isArray(body.permissions)) {
      const rows = body.permissions
        .map((p) => ({
          feature: String((p && p.feature) || '').trim(),
          action: String((p && p.action) || '').trim(),
          allowed: p && p.allowed ? 1 : 0,
        }))
        .filter((p) => p.feature && p.action);
      if (rows.length === 0) return json({ ok: true, saved: 0 });
      try {
        await env.DB.batch(rows.map((p) =>
          env.DB.prepare(
            `INSERT INTO granular_permissions (id, user_id, feature, action, allowed, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(user_id, feature, action) DO UPDATE SET
               allowed = excluded.allowed,
               updated_at = excluded.updated_at`
          ).bind(crypto.randomUUID(), targetUserId, p.feature, p.action, p.allowed, now)
        ));
      } catch (e) {
        const msg = String((e && e.message) || e);
        if (/no such table/i.test(msg)) {
          return json({ error: 'Tabela granular_permissions não existe — aplique 0024_granular_permissions.sql' }, 503);
        }
        return json({ error: 'Falha ao salvar permissões', detail: msg }, 500);
      }
      return json({ ok: true, saved: rows.length });
    }

    // Modo ITEM ÚNICO (compat): { feature, action, allowed }.
    const feature = String(body.feature || '').trim();
    const action = String(body.action || '').trim();
    if (!feature || !action) return json({ error: 'feature e action são obrigatórios' }, 400);
    const allowed = body.allowed ? 1 : 0;
    try {
      await env.DB.prepare(
        `INSERT INTO granular_permissions (id, user_id, feature, action, allowed, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, feature, action) DO UPDATE SET
           allowed = excluded.allowed,
           updated_at = excluded.updated_at`
      ).bind(crypto.randomUUID(), targetUserId, feature, action, allowed, now).run();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/no such table/i.test(msg)) {
        return json({ error: 'Tabela granular_permissions não existe — aplique 0024_granular_permissions.sql' }, 503);
      }
      return json({ error: 'Falha ao salvar permissão', detail: msg }, 500);
    }
    return json({ ok: true, feature, action, allowed: !!allowed });
  }

  if (request.method === 'DELETE') {
    const body = (await readJson(request)) || {};
    // Reset total (novo): { all: true } → remove TODOS os overrides do usuário,
    // fazendo-o voltar ao preset puro ("Restaurar preset" no modal).
    if (body.all === true) {
      try {
        await env.DB.prepare('DELETE FROM granular_permissions WHERE user_id = ?')
          .bind(targetUserId).run();
      } catch (e) {
        return json({ error: 'Falha ao restaurar preset', detail: String((e && e.message) || e) }, 500);
      }
      return json({ reset: true });
    }
    const feature = String(body.feature || '').trim();
    const action = String(body.action || '').trim();
    if (!feature || !action) return json({ error: 'feature e action são obrigatórios' }, 400);
    try {
      await env.DB.prepare(
        'DELETE FROM granular_permissions WHERE user_id = ? AND feature = ? AND action = ?'
      ).bind(targetUserId, feature, action).run();
    } catch (e) {
      return json({ error: 'Falha ao remover override', detail: String((e && e.message) || e) }, 500);
    }
    return json({ deleted: true, feature, action });
  }

  return json({ error: 'Método não permitido' }, 405);
}

// ---------------------------------------------------------------------------
// Chat — general channel (v1.10 multi-user)
// ---------------------------------------------------------------------------

async function handleChatMessages(request, env, user, ctx) {
  if (!requirePermission(user, 'chat', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 200);
    const before = parseInt(url.searchParams.get('before') || '0', 10) || 0;
    try {
      const sql = before
        ? `SELECT m.*, u.name AS user_name, u.avatar AS user_avatar
             FROM chat_messages m
             LEFT JOIN users u ON m.user_id = u.id
            WHERE m.deleted_at IS NULL AND m.created_at < ?
            ORDER BY m.created_at DESC LIMIT ?`
        : `SELECT m.*, u.name AS user_name, u.avatar AS user_avatar
             FROM chat_messages m
             LEFT JOIN users u ON m.user_id = u.id
            WHERE m.deleted_at IS NULL
            ORDER BY m.created_at DESC LIMIT ?`;
      const binds = before ? [before, limit] : [limit];
      const { results } = await env.DB.prepare(sql).bind(...binds).all();
      const out = (results || []).map((r) => {
        let mentions = [];
        try { mentions = JSON.parse(r.mentions || '[]'); } catch { mentions = []; }
        return {
          id: r.id,
          user_id: r.user_id,
          user_name: r.user_name || null,
          user_avatar: r.user_avatar || null,
          content: r.content,
          mentions,
          created_at: r.created_at,
          edited_at: r.edited_at || null,
        };
      });
      return json(out);
    } catch {
      // chat_messages table not migrated yet — return empty list instead of 500.
      return json([]);
    }
  }

  if (request.method === 'POST') {
    if (!requirePermission(user, 'chat', 'full')) {
      // chat='view' users can read but not post.
      return json({ error: 'Sem permissão para postar' }, 403);
    }
    // v2.1 granular: explicit chat.write check on top of the coarse gate.
    if (!canDo(user.granular, 'chat', 'write')) {
      return json({ error: 'Sem permissão para enviar mensagens' }, 403);
    }
    const body = (await readJson(request)) || {};
    const content = String(body.content || '').trim();
    if (!content) return json({ error: 'content obrigatório' }, 400);
    const mentions = Array.isArray(body.mentions) ? body.mentions.filter(Boolean) : [];
    const id = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    try {
      await env.DB.prepare(
        `INSERT INTO chat_messages (id, user_id, content, mentions, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, user.id, content, JSON.stringify(mentions), now).run();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/no such table/i.test(msg)) {
        return json({ error: 'Tabela chat_messages não existe — aplique 0022_multiuser.sql' }, 503);
      }
      return json({ error: 'Falha ao postar', detail: msg }, 500);
    }
    // @-mention notifications: in-app + push for each unique mentioned user.
    const seen = new Set();
    for (const uid of mentions) {
      if (!uid || uid === user.id || seen.has(uid)) continue;
      seen.add(uid);
      try {
        await createNotification(env, ctx, {
          from_user_id: user.id,
          to_user_id: uid,
          type: 'mention',
          title: `${user.name || 'Alguém'} mencionou você no chat`,
          body: content.length > 120 ? `${content.slice(0, 120)}…` : content,
        });
      } catch { /* createNotification has its own resilience */ }
    }
    const row = await env.DB.prepare(
      `SELECT m.*, u.name AS user_name, u.avatar AS user_avatar
         FROM chat_messages m LEFT JOIN users u ON m.user_id = u.id
        WHERE m.id = ?`
    ).bind(id).first();
    let outMentions = [];
    try { outMentions = JSON.parse((row && row.mentions) || '[]'); } catch { outMentions = []; }
    return json({
      id: row.id,
      user_id: row.user_id,
      user_name: row.user_name || null,
      user_avatar: row.user_avatar || null,
      content: row.content,
      mentions: outMentions,
      created_at: row.created_at,
      edited_at: row.edited_at || null,
    }, 201);
  }

  return json({ error: 'Método não permitido' }, 405);
}

async function handleChatMessageItem(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (request.method !== 'DELETE') return json({ error: 'Método não permitido' }, 405);
  if (!requirePermission(user, 'chat', 'view')) {
    return json({ error: 'Sem permissão' }, 403);
  }
  let row = null;
  try {
    row = await env.DB.prepare('SELECT user_id, deleted_at FROM chat_messages WHERE id = ?').bind(id).first();
  } catch {
    return json({ error: 'Tabela chat_messages não existe' }, 503);
  }
  if (!row) return json({ error: 'Mensagem não encontrada' }, 404);
  if (row.deleted_at) return json({ ok: true, already_deleted: true });
  if (row.user_id !== user.id && user.role !== 'owner') {
    return json({ error: 'Apenas o autor ou o owner pode apagar' }, 403);
  }
  // v2.1 granular: even the author needs chat.delete to remove their own msg.
  // Owner bypasses (canDo returns true for null granular).
  if (!canDo(user.granular, 'chat', 'delete')) {
    return json({ error: 'Sem permissão para deletar mensagens' }, 403);
  }
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('UPDATE chat_messages SET deleted_at = ? WHERE id = ?').bind(now, id).run();
  return json({ ok: true, deleted_at: now });
}

// ---------------------------------------------------------------------------
// Hub — ingestão externa (API key) + leitura (sessão owner/assistente fixo)
// ---------------------------------------------------------------------------

// Autenticação por API key para a ingestão externa. Header esperado:
//   Authorization: ApiKey <chave>
// Retorna false (e o chamador devolve 401) se a chave não bater ou se
// HUB_API_KEY não estiver configurada no ambiente.
function validateHubApiKey(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('ApiKey ')) return false;
  const key = auth.slice(7);
  return !!env.HUB_API_KEY && key === env.HUB_API_KEY;
}

// Mesma regra das áreas Mercado/Carreira: só owner e assistentes fixos leem o Hub.
function isHubReader(user) {
  return !!user && (user.role === 'owner' || user.role === 'assistant_fixed' || user.user_type === 'fixed');
}

// POST /api/hub/items — ingestão em lote. Idempotente via UNIQUE(external_id,
// project_id) + ON CONFLICT DO NOTHING: itens repetidos contam como duplicates.
// Itens já existentes (incluindo soft-deletados, deleted_at NOT NULL) entram em
// conflito na UNIQUE e são ignorados — nunca reativados nem sobrescritos.
// Erros individuais de item são silenciosamente ignorados (status sempre 200).
async function handleHubIngest(request, env) {
  if (!validateHubApiKey(request, env)) return json({ error: 'Não autorizado' }, 401);

  const body = (await readJson(request)) || {};
  if (!Array.isArray(body.items)) {
    return json({ error: 'Corpo inválido: items deve ser um array' }, 400);
  }

  let accepted = 0;
  let duplicates = 0;
  for (const item of body.items) {
    if (!item || !item.external_id || !item.project_id || !item.title) continue; // item malformado — ignora
    const topicos = Array.isArray(item.topicos) ? JSON.stringify(item.topicos) : (item.topicos || null);
    try {
      const res = await env.DB.prepare(
        `INSERT INTO hub_items
          (external_id, project_id, title, url, source_name, published_at,
           relevancia, prioridade, tipo, resumo, topicos, justificativa, collected_at, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(external_id, project_id) DO UPDATE SET
           relevancia = excluded.relevancia,
           prioridade = excluded.prioridade,
           tipo = excluded.tipo,
           resumo = excluded.resumo,
           topicos = excluded.topicos,
           justificativa = excluded.justificativa,
           country = CASE
             WHEN hub_items.country IS NULL THEN excluded.country
             ELSE hub_items.country
           END
         WHERE hub_items.deleted_at IS NULL`
      ).bind(
        String(item.external_id),
        String(item.project_id),
        String(item.title),
        item.url || null,
        item.source_name || null,
        item.published_at || null,
        item.relevancia != null ? Number(item.relevancia) : null,
        item.prioridade || null,
        item.tipo || null,
        item.resumo || null,
        topicos,
        item.justificativa || null,
        item.collected_at || null,
        item.country || null
      ).run();
      if (res.meta && res.meta.changes > 0) accepted += 1;
      else duplicates += 1;
    } catch {
      // erro individual de item — ignora (não conta como accepted nem duplicate)
    }
  }
  return json({ accepted, duplicates, total: accepted + duplicates });
}

// Converte uma linha do banco para o shape do front (topicos → array).
function shapeHubItem(row) {
  return { ...row, topicos: parseJsonArray(row.topicos) };
}

// GET /api/hub/items — lista paginada/filtrada. Sessão obrigatória.
// Query: project, min_relevancia, limit (50), offset (0),
//        order_by (received_at | relevancia, default received_at).
// Sem ?project= (ou "todos"): aba Notícias — só h2/energia/ia. As vagas
// (phd_vagas, emprego_vagas) só aparecem quando pedidas explicitamente por
// ?project=, para não se misturarem com notícias. Itens com deleted_at
// preenchido nunca são retornados.
async function handleHubItems(request, env, user) {
  if (!isHubReader(user)) return json({ error: 'Sem acesso ao Hub' }, 403);
  if (request.method !== 'GET') return json({ error: 'Método não permitido' }, 405);

  const url = new URL(request.url);
  const project = url.searchParams.get('project');
  const minRel = url.searchParams.get('min_relevancia');
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit'), 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get('offset'), 10) || 0, 0);
  const orderBy = url.searchParams.get('order_by') === 'relevancia' ? 'relevancia' : 'received_at';

  const wh = ['deleted_at IS NULL', 'archived_at IS NULL'];
  const args = [];
  if (project && project !== 'todos') {
    wh.push('project_id = ?');
    args.push(project);
  } else {
    wh.push("project_id IN ('h2', 'energia', 'ia')");
  }
  if (minRel != null && minRel !== '') { wh.push('relevancia >= ?'); args.push(Number(minRel)); }
  const where = `WHERE ${wh.join(' AND ')}`;

  try {
    const totalRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM hub_items ${where}`).bind(...args).first();
    const { results } = await env.DB.prepare(
      `SELECT * FROM hub_items ${where} ORDER BY ${orderBy} DESC LIMIT ? OFFSET ?`
    ).bind(...args, limit, offset).all();
    return json({ items: (results || []).map(shapeHubItem), total: (totalRow && totalRow.n) || 0 });
  } catch {
    return json({ items: [], total: 0 });
  }
}

// /api/hub/items/:id — DELETE (remove) ou PATCH (edita campos manuais).
async function handleHubItemById(request, env, user, id) {
  if (request.method === 'DELETE') return handleHubItemDelete(request, env, user, id);
  if (request.method === 'PATCH') return handleHubItemPatch(request, env, user, id);
  return json({ error: 'Método não permitido' }, 405);
}

// DELETE /api/hub/items/:id — remove (soft-delete) um item. Sessão obrigatória;
// apenas owner. deleted_at é preservado permanentemente para impedir que uma
// futura ingestão com o mesmo external_id/project_id reative o item
// (ver ON CONFLICT ... WHERE hub_items.deleted_at IS NULL em handleHubIngest).
async function handleHubItemDelete(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  if (user.role !== 'owner') return json({ error: 'Apenas o owner pode remover itens' }, 403);
  try {
    await env.DB.prepare(
      `UPDATE hub_items
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = ?
       AND deleted_at IS NULL`
    ).bind(id).run();
  } catch (e) {
    return json({ error: 'Falha ao remover item', detail: String(e) }, 500);
  }
  return json({ deleted: true, soft: true });
}

// DELETE /api/hub/items/bulk — remove (soft-delete) vários itens de uma vez.
// Sessão obrigatória; apenas owner. Body: { ids: [1, 2, 3, ...] }.
// Usado futuramente pela interface de deleção em lote.
async function handleHubItemsBulkDelete(request, env, user) {
  if (user.role !== 'owner') return json({ error: 'Apenas o owner pode remover itens' }, 403);
  const body = (await readJson(request)) || {};
  const ids = Array.isArray(body.ids)
    ? body.ids.map((n) => Number(n)).filter((n) => Number.isInteger(n))
    : [];
  if (ids.length === 0) return json({ error: 'ids deve ser um array não vazio' }, 400);
  try {
    const placeholders = ids.map(() => '?').join(',');
    const res = await env.DB.prepare(
      `UPDATE hub_items SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`
    ).bind(...ids).run();
    return json({ deleted: (res.meta && res.meta.changes) || 0 });
  } catch (e) {
    return json({ error: 'Falha ao remover itens', detail: String(e) }, 500);
  }
}

// PATCH /api/hub/items/bulk/project — move vários itens para outro projeto
// (ex.: phd_vagas ↔ emprego_vagas). Sessão obrigatória. Body: { ids, project_id }.
async function handleHubItemsBulkProject(request, env, user) {
  const body = (await readJson(request)) || {};
  const ids = Array.isArray(body.ids)
    ? body.ids.map((n) => Number(n)).filter((n) => Number.isInteger(n))
    : [];
  const projectId = body.project_id;
  if (ids.length === 0) return json({ error: 'ids deve ser um array não vazio' }, 400);
  if (!projectId) return json({ error: 'project_id é obrigatório' }, 400);
  try {
    const placeholders = ids.map(() => '?').join(',');
    const res = await env.DB.prepare(
      `UPDATE hub_items SET project_id = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`
    ).bind(projectId, ...ids).run();
    return json({ moved: (res.meta && res.meta.changes) || 0 });
  } catch (e) {
    return json({ error: 'Falha ao mover itens', detail: String(e) }, 500);
  }
}

// PATCH /api/hub/items/:id/archive — arquiva um item (some da lista ativa do
// Hub) quando ele é enviado para o Kanban de Carreira. Sessão obrigatória.
async function handleHubItemArchive(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  try {
    await env.DB.prepare(
      `UPDATE hub_items SET archived_at = CURRENT_TIMESTAMP WHERE id = ? AND archived_at IS NULL`
    ).bind(id).run();
  } catch (e) {
    return json({ error: 'Falha ao arquivar item', detail: String(e) }, 500);
  }
  return json({ archived: true });
}

// GET /api/hub/excluded-ids?project_id=... — external_ids que estão
// deletados ou arquivados, para o Hub local não os reativar numa próxima
// ingestão. Sessão obrigatória.
async function handleHubExcludedIds(request, env, user) {
  if (!isHubReader(user)) return json({ error: 'Sem acesso ao Hub' }, 403);
  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id');
  if (!projectId) return json({ error: 'project_id é obrigatório' }, 400);
  try {
    const { results } = await env.DB.prepare(
      `SELECT external_id FROM hub_items
        WHERE project_id = ? AND (deleted_at IS NOT NULL OR archived_at IS NOT NULL)`
    ).bind(projectId).all();
    return json({ excluded_ids: (results || []).map((r) => r.external_id) });
  } catch {
    return json({ excluded_ids: [] });
  }
}

// PATCH /api/hub/items/:id — edita campos manuais (country, area, user_notes,
// title_override, resumo_override). Sessão obrigatória; qualquer role.
async function handleHubItemPatch(request, env, user, id) {
  if (!id) return json({ error: 'ID ausente' }, 400);
  const body = (await readJson(request)) || {};
  try {
    await env.DB.prepare(
      `UPDATE hub_items SET
         country = COALESCE(?, country),
         area = COALESCE(?, area),
         user_notes = COALESCE(?, user_notes),
         title_override = COALESCE(?, title_override),
         resumo_override = COALESCE(?, resumo_override),
         edited_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      body.country ?? null,
      body.area ?? null,
      body.user_notes ?? null,
      body.title_override ?? null,
      body.resumo_override ?? null,
      id
    ).run();
  } catch (e) {
    return json({ error: 'Falha ao editar item', detail: String(e) }, 500);
  }
  const row = await env.DB.prepare('SELECT * FROM hub_items WHERE id = ?').bind(id).first();
  if (!row) return json({ error: 'Item não encontrado' }, 404);
  return json(shapeHubItem(row));
}

// GET /api/hub/stats — agregados por projeto. Sessão obrigatória.
async function handleHubStats(request, env, user) {
  if (!isHubReader(user)) return json({ error: 'Sem acesso ao Hub' }, 403);
  try {
    const { results } = await env.DB.prepare(
      `SELECT project_id,
              COUNT(*)        AS count,
              AVG(relevancia) AS avg_relevancia,
              MAX(received_at) AS last_received
         FROM hub_items
        WHERE deleted_at IS NULL
        GROUP BY project_id
        ORDER BY count DESC`
    ).all();
    const byProject = (results || []).map((r) => ({
      project_id: r.project_id,
      count: r.count || 0,
      avg_relevancia: r.avg_relevancia != null ? Number(r.avg_relevancia) : null,
      last_received: r.last_received || null,
    }));
    const total = byProject.reduce((s, p) => s + p.count, 0);
    return json({ by_project: byProject, total });
  } catch {
    return json({ by_project: [], total: 0 });
  }
}

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
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type'
    }
  });
}
